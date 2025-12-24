import { CodeBlockParser } from './CodeBlockParser.js';

/**
 * Utility to process streams and remove thinking tags <think>...</think>
 * Also supports extracting code from codeblocks when extractCodeBlock is true
 */
export class StreamProcessor {
    constructor(extractCodeBlock = false) {
        this.isThinking = false;
        this.buffer = '';
        this.extractCodeBlock = extractCodeBlock;
        this.codeBlockParser = extractCodeBlock ? new CodeBlockParser() : null;
        this.codeBlockBuffer = '';
        this.codeBlockComplete = false;
    }

    /**
     * Process a text chunk and yield clean content
     * @param {string} chunk 
     */
    *process(chunk) {
        if (!chunk) return;
        
        // Append new chunk to buffer to handle tags split across chunks
        // However, keeping a large buffer defeats the purpose of streaming.
        // We only strictly need to buffer if we are partially matching a tag.
        // For simplicity and robustness against standard stream sizes:
        // We will process the current chunk combined with any partial tag buffer.
        
        let content = this.buffer + chunk;
        this.buffer = '';
        
        // If extracting code blocks, first process through code block parser
        if (this.extractCodeBlock && this.codeBlockParser) {
            // Accumulate all content for code block parsing
            this.codeBlockBuffer += content;
            const extractedCode = this.codeBlockParser.processChunk(content);
            if (extractedCode !== null) {
                // Code block complete, yield the extracted code
                this.codeBlockComplete = true;
                yield extractedCode;
                return;
            }
            // Code block not complete yet, don't yield anything
            return;
        }

        // Simple state machine
        while (content.length > 0) {
            if (this.isThinking) {
                const endTagIndex = content.indexOf('</think>');
                if (endTagIndex !== -1) {
                    // Found end tag, stop thinking state, process rest
                    this.isThinking = false;
                    content = content.slice(endTagIndex + 8); // 8 is length of </think>
                } else {
                    // No end tag, discard all content as thinking (but keep last few chars in case of partial tag?)
                    // Actually, if we are thinking, we discard EVERYTHING until we see </think>.
                    // To be safe against split tags like </thi | nk>, we keep the last 7 chars.
                    if (content.length > 7) {
                         const keep = content.slice(-7);
                         // Check if the keep part could be start of </think>
                         // If not, we can discard even more. 
                         // But for safety, let's just keep the last 7 chars.
                         this.buffer = keep; 
                         content = ''; 
                    } else {
                        this.buffer = content;
                        content = '';
                    }
                }
            } else {
                const startTagIndex = content.indexOf('<think>');
                if (startTagIndex !== -1) {
                    // Found start tag, yield content before it, switch to thinking
                    if (startTagIndex > 0) {
                        yield content.slice(0, startTagIndex);
                    }
                    this.isThinking = true;
                    content = content.slice(startTagIndex + 7); // 7 is length of <think>
                } else {
                    // No start tag, check for partial start tag at end
                    // <think> is 7 chars.
                    if (content.length >= 7) {
                        // Yield everything except last 6 chars (max partial length)
                        const safeLen = content.length - 6;
                        const safePart = content.slice(0, safeLen);
                        const riskyPart = content.slice(safeLen);
                        
                        // Wait, what if the risky part contains partial <think>?
                        // We only need to buffer if it *looks* like it could be <think>.
                        // Heuristic: does it contain '<'?
                        const lastOpen = riskyPart.lastIndexOf('<');
                        if (lastOpen !== -1) {
                             yield safePart + riskyPart.slice(0, lastOpen);
                             this.buffer = riskyPart.slice(lastOpen);
                             content = '';
                        } else {
                             yield content;
                             content = '';
                        }
                    } else {
                        // Very short chunk, just buffer to be safe or yield?
                        // If it has '<', buffer.
                        if (content.includes('<')) {
                            this.buffer = content;
                            content = '';
                        } else {
                            yield content;
                            content = '';
                        }
                    }
                }
            }
        }
    }

    /**
     * Finalize processing - extract any remaining code if stream ends
     */
    *finalize() {
        if (this.extractCodeBlock && this.codeBlockParser) {
            const finalCode = this.codeBlockParser.finalize();
            if (finalCode !== null) {
                yield finalCode;
            }
        }
    }

    /**
     * Reset processor state
     */
    reset() {
        this.isThinking = false;
        this.buffer = '';
        this.codeBlockBuffer = '';
        this.codeBlockComplete = false;
        if (this.codeBlockParser) {
            this.codeBlockParser.reset();
        }
    }
}

