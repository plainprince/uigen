import OpenAI from 'openai';
import { StreamProcessor } from './StreamProcessor.js';

export class OpenAIProvider {
    constructor(config) {
        this.config = config;
        this.client = new OpenAI({
            baseURL: config.baseURL,
            apiKey: config.apiKey,
            defaultHeaders: {
                'HTTP-Referer': 'https://github.com/simeonkummer/UI-effect-gen', // Optional for OpenRouter
                'X-Title': 'MultiForge' 
            }
        });
    }

    async *streamResponse(modelName, messages, systemPrompt) {
        // Prepend system prompt if needed
        const processedMessages = [...messages];
        if (processedMessages.length === 0 || processedMessages[0].role !== 'system') {
            processedMessages.unshift({ role: 'system', content: systemPrompt });
        } else if (processedMessages[0].role === 'system') {
            processedMessages[0].content = systemPrompt;
        }

        try {
            const stream = await this.client.chat.completions.create({
                model: modelName,
                messages: processedMessages,
                stream: true,
            });

            const processor = new StreamProcessor();

            for await (const chunk of stream) {
                const content = chunk.choices[0]?.delta?.content || '';
                if (content) {
                    for (const cleanChunk of processor.process(content)) {
                        yield cleanChunk;
                    }
                }
            }
        } catch (error) {
            console.error(`OpenAI Provider Error (${this.config.name}):`, error);
            throw error;
        }
    }
}

