import fs from 'node:fs';
import { OpenAIProvider } from './OpenAIProvider.js';
import { AnthropicProvider } from './AnthropicProvider.js';
import { GoogleProvider } from './GoogleProvider.js';

const config = JSON.parse(fs.readFileSync('config.json', 'utf8'));

class ModelManager {
    constructor() {
        this.providers = new Map();
        this.promptOverrides = config.promptOverrides || [];
        this.defaultSystemPrompt = config.systemPrompt;

        this.initializeProviders();
    }

    initializeProviders() {
        for (const pConfig of config.providers) {
            let provider;
            switch (pConfig.type) {
                case 'anthropic':
                    provider = new AnthropicProvider(pConfig);
                    break;
                case 'google':
                    provider = new GoogleProvider(pConfig);
                    break;
                case 'openai':
                default:
                    // OpenAI provider handles Generic OpenAI compatible APIs (Ollama, xAI, OpenRouter, etc.)
                    provider = new OpenAIProvider(pConfig);
                    break;
            }
            this.providers.set(pConfig.name, provider);
        }
    }

    getProvider(name) {
        return this.providers.get(name);
    }

    parseModelString(modelString) {
        if (modelString.includes('/')) {
            const [providerName, modelName] = modelString.split('/');
            return { providerName, modelName };
        }
        throw new Error("Invalid model format. Expected 'Provider/Model'");
    }

    async *streamResponse(modelString, messageHistory) {
        const { providerName, modelName } = this.parseModelString(modelString);
        const provider = this.getProvider(providerName);

        if (!provider) {
            throw new Error(`Provider '${providerName}' not found`);
        }

        // Handle System Prompt Logic (Overrides)
        let systemPrompt = this.defaultSystemPrompt;
        const override = this.promptOverrides.find(o => o.model === modelName);
        if (override) {
            if (override.system) systemPrompt = override.system;
            if (override.html) {
                systemPrompt += `\n\nEnsure you include this HTML structure: ${override.html}`;
            }
        }

        yield* provider.streamResponse(modelName, messageHistory, systemPrompt);
    }
}

export default new ModelManager();

