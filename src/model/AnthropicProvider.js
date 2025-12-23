import Anthropic from '@anthropic-ai/sdk';
import { StreamProcessor } from './StreamProcessor.js';

export class AnthropicProvider {
    constructor(config) {
        this.config = config;
        this.client = new Anthropic({
            baseURL: config.baseURL, // Note: Anthropic SDK might not support custom baseURL easily for all proxies, but usually does
            apiKey: config.apiKey,
        });
    }

    async *streamResponse(modelName, messages, systemPrompt) {
        // Anthropic handles system prompt separately
        // Filter out system messages from history to avoid duplication/errors if SDK enforces strict roles
        const userMessages = messages.filter(m => m.role !== 'system');

        try {
            const stream = await this.client.messages.create({
                model: modelName,
                max_tokens: 4096,
                system: systemPrompt,
                messages: userMessages,
                stream: true,
            });

            const processor = new StreamProcessor();

            for await (const chunk of stream) {
                if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
                    const content = chunk.delta.text;
                    for (const cleanChunk of processor.process(content)) {
                        yield cleanChunk;
                    }
                }
            }
        } catch (error) {
            console.error(`Anthropic Provider Error (${this.config.name}):`, error);
            throw error;
        }
    }
}

