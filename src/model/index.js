import fs from 'node:fs';
import { OpenAIProvider } from './OpenAIProvider.js';
import { AnthropicProvider } from './AnthropicProvider.js';
import { GoogleProvider } from './GoogleProvider.js';
import { CodeBlockParser } from './CodeBlockParser.js';
import { StreamProcessor } from './StreamProcessor.js';

const config = JSON.parse(fs.readFileSync('config.json', 'utf8'));

class ModelManager {
    constructor() {
        this.providers = new Map();
        this.promptOverrides = config.promptOverrides || [];
        this.defaultPrompts = config.prompts || {
            html: { system: config.systemPrompt || '' },
            css: { system: config.systemPrompt || '' },
            js: { system: config.systemPrompt || '' }
        };

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

    getPromptForType(type, modelName) {
        // Get default prompt for type
        let prompt = this.defaultPrompts[type]?.system || '';
        
        // Check for override
        const override = this.promptOverrides.find(o => o.model === modelName);
        if (override && override[type] && override[type].system) {
            prompt = override[type].system;
        }
        
        return prompt;
    }

    async *streamCodeBlock(provider, modelName, messageHistory, systemPrompt) {
        // Stream response and extract code block
        const stream = provider.streamResponse(modelName, messageHistory, systemPrompt);
        const codeBlockParser = new CodeBlockParser();
        const streamProcessor = new StreamProcessor(false); // Remove thinking tags, but extract codeblock manually
        
        // Process stream chunks: first remove thinking tags, then extract codeblock
        for await (const rawChunk of stream) {
            // Process through stream processor to remove thinking tags
            for (const cleanChunk of streamProcessor.process(rawChunk)) {
                // Extract code block content incrementally
                for (const codeChunk of codeBlockParser.processChunk(cleanChunk)) {
                    yield codeChunk;
                    if (codeBlockParser.codeBlockComplete) {
                        return; // Code block complete
                    }
                }
            }
        }
        
        // Finalize - extract any remaining code if stream ended
        for (const finalCode of codeBlockParser.finalize()) {
            yield finalCode;
        }
    }

    async *streamResponse(modelString, messageHistory, currentCodeMap = null) {
        const { providerName, modelName } = this.parseModelString(modelString);
        const provider = this.getProvider(providerName);

        if (!provider) {
            throw new Error(`Provider '${providerName}' not found`);
        }

        // Get prompts for HTML, CSS, and JS
        const htmlPrompt = this.getPromptForType('html', modelName);
        const cssPrompt = this.getPromptForType('css', modelName);
        const jsPrompt = this.getPromptForType('js', modelName);

        // Helper to construct prompts
        const createMessagesForType = (type, baseHistory, context = '', existingCode = '') => {
            // Add type-specific instruction to the last user message
            // We use deep clone for messages to avoid mutating the original history objects
            const messages = baseHistory.map(m => ({ ...m }));
            
            let promptSuffix = `\n\nGenerate the ${type.toUpperCase()} code for this UI.`;
            
            if (existingCode) {
                promptSuffix += `\n\nHere is the existing ${type.toUpperCase()} code:\n\`\`\`${type}\n${existingCode}\n\`\`\`\n\nIf this code is sufficient and requires no changes for the new request, output EXACTLY this in a code block: \`\`\`[NO CHANGE]\`\`\`. Otherwise output the full new code.`;
            }
            
            if (context) {
                promptSuffix += `\n\nHere is the code generated so far:\n${context}`;
            }

            if (messages.length > 0 && messages[messages.length - 1].role === 'user') {
                messages[messages.length - 1].content += promptSuffix;
            } else {
                messages.push({ 
                    role: 'user', 
                    content: `Generate the ${type.toUpperCase()} code for this UI.${promptSuffix}` 
                });
            }
            return messages;
        };

        // Helper to process stream and handle [NO CHANGE]
        const processStep = async function* (that, type, messages, systemPrompt, existingCode) {
            const stream = that.streamCodeBlock(provider, modelName, messages, systemPrompt);
            
            if (!existingCode) {
                yield* stream;
                return;
            }

            let firstChunk = true;
            let buffer = '';
            const NO_CHANGE = '[NO CHANGE]';
            let reverted = false;

            for await (const chunk of stream) {
                if (firstChunk) {
                    buffer += chunk;
                    const cleanBuffer = buffer.trim();
                    
                    if (NO_CHANGE.startsWith(cleanBuffer)) {
                        if (cleanBuffer === NO_CHANGE) {
                            reverted = true;
                            break; // Stop stream
                        }
                        // Continue buffering
                        continue;
                    } else {
                        // Not matching NO CHANGE
                        yield buffer;
                        firstChunk = false;
                    }
                } else {
                    yield chunk;
                }
            }

            if (reverted) {
                yield existingCode;
            } else if (firstChunk && buffer) {
                // Stream ended, check buffer
                if (buffer.trim() === NO_CHANGE) {
                    yield existingCode;
                } else {
                    yield buffer;
                }
            }
        };

        // Stream HTML
        const existingHtml = currentCodeMap?.html || '';
        const htmlMessages = createMessagesForType('html', messageHistory, '', existingHtml);
        let htmlContent = '';
        
        for await (const chunk of processStep(this, 'html', htmlMessages, htmlPrompt, existingHtml)) {
            htmlContent += chunk;
            yield { type: 'html', content: htmlContent };
        }

        // Stream CSS (with HTML context)
        const existingCss = currentCodeMap?.css || '';
        const cssMessages = createMessagesForType('css', messageHistory, htmlContent, existingCss);
        let cssContent = '';
        
        for await (const chunk of processStep(this, 'css', cssMessages, cssPrompt, existingCss)) {
            cssContent += chunk;
            yield { type: 'css', content: cssContent };
        }

        // Stream JS (with HTML + CSS context)
        const existingJs = currentCodeMap?.js || '';
        const jsContext = `${htmlContent}\n\n${cssContent}`;
        const jsMessages = createMessagesForType('js', messageHistory, jsContext, existingJs);
        let jsContent = '';
        
        for await (const chunk of processStep(this, 'js', jsMessages, jsPrompt, existingJs)) {
            jsContent += chunk;
            yield { type: 'js', content: jsContent };
        }
    }
}

export default new ModelManager();

