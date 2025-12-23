import { GoogleGenerativeAI } from '@google/generative-ai';
import { StreamProcessor } from './StreamProcessor.js';

export class GoogleProvider {
    constructor(config) {
        this.config = config;
        this.genAI = new GoogleGenerativeAI(config.apiKey);
    }

    async *streamResponse(modelName, messages, systemPrompt) {
        // Google uses 'model' instance
        // Mapping roles: user -> user, assistant -> model, system -> systemInstruction
        const model = this.genAI.getGenerativeModel({ 
            model: modelName,
            systemInstruction: systemPrompt 
        });

        // Convert history format
        const history = messages
            .filter(m => m.role !== 'system') // System prompt handled above
            .map(m => ({
                role: m.role === 'assistant' ? 'model' : 'user',
                parts: [{ text: m.content }]
            }));

        // The last message is the new prompt usually, but here 'messages' contains the full history including the latest prompt.
        // gemini.startChat expects history WITHOUT the latest user message, which is sent in sendMessageStream.
        
        const lastMsg = history[history.length - 1];
        const prevHistory = history.slice(0, -1);
        
        try {
            const chat = model.startChat({
                history: prevHistory
            });

            const result = await chat.sendMessageStream(lastMsg.parts[0].text);
            const processor = new StreamProcessor();

            for await (const chunk of result.stream) {
                const content = chunk.text();
                for (const cleanChunk of processor.process(content)) {
                    yield cleanChunk;
                }
            }
        } catch (error) {
            console.error(`Google Provider Error (${this.config.name}):`, error);
            throw error;
        }
    }
}

