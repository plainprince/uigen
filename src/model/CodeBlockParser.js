/**
 * Utility to parse code blocks from AI responses
 * Extracts content from the first ``` to the last ```
 * Removes language identifier and any text before/after code blocks
 * Streams content incrementally as it arrives
 */
export class CodeBlockParser {
    constructor() {
        this.buffer = '';
        this.inCodeBlock = false;
        this.codeStartIndex = -1;
        this.languageTag = '';
        this.codeBlockComplete = false;
    }

    /**
     * Process a text chunk and yield code block content incrementally
     * @param {string} chunk - Text chunk from stream
     * @yields {string} - Code content chunks as they arrive
     */
    *processChunk(chunk) {
        if (!chunk) return;
        
        this.buffer += chunk;
        
        // Look for code block markers
        if (!this.inCodeBlock) {
            // Find first ```
            const firstBacktick = this.buffer.indexOf('```');
            if (firstBacktick !== -1) {
                this.inCodeBlock = true;
                this.codeStartIndex = firstBacktick + 3; // After ```
                
                // Extract language tag (if present) - everything after ``` until newline or space
                const afterBackticks = this.buffer.slice(this.codeStartIndex);
                const langMatch = afterBackticks.match(/^(\w+)[\s\n]/);
                if (langMatch) {
                    this.languageTag = langMatch[1];
                    this.codeStartIndex += this.languageTag.length;
                    // Skip whitespace/newline after language tag
                    while (this.codeStartIndex < this.buffer.length && 
                           (this.buffer[this.codeStartIndex] === ' ' || 
                            this.buffer[this.codeStartIndex] === '\n' ||
                            this.buffer[this.codeStartIndex] === '\r')) {
                        this.codeStartIndex++;
                    }
                } else {
                    // No language tag, skip any whitespace/newline after ```
                    while (this.codeStartIndex < this.buffer.length && 
                           (this.buffer[this.codeStartIndex] === ' ' || 
                            this.buffer[this.codeStartIndex] === '\n' ||
                            this.buffer[this.codeStartIndex] === '\r')) {
                        this.codeStartIndex++;
                    }
                }
                
                // Remove everything before the code block start
                this.buffer = this.buffer.slice(this.codeStartIndex);
                this.codeStartIndex = 0;
            } else {
                // Haven't found first ``` yet, discard everything
                return;
            }
        }
        
        if (this.inCodeBlock && !this.codeBlockComplete) {
            // Check for closing ```
            const lastBacktick = this.buffer.lastIndexOf('```');
            if (lastBacktick !== -1 && lastBacktick > 0) {
                // Found closing ```, yield everything before it
                const codeContent = this.buffer.slice(0, lastBacktick);
                if (codeContent.length > 0) {
                    yield codeContent;
                }
                
                // Mark as complete
                this.codeBlockComplete = true;
                this.buffer = '';
                return;
            }
            
            // No closing ``` yet, yield what we have so far (streaming)
            // But we need to be careful - if the buffer ends with partial ```, we should buffer it
            const partialBacktick = this.buffer.lastIndexOf('`');
            if (partialBacktick !== -1 && partialBacktick >= this.buffer.length - 2) {
                // Might be a partial closing ```, buffer the last 2 chars
                const safeLen = Math.max(0, this.buffer.length - 2);
                const toYield = this.buffer.slice(0, safeLen);
                const toBuffer = this.buffer.slice(safeLen);
                
                if (toYield.length > 0) {
                    yield toYield;
                }
                this.buffer = toBuffer;
            } else {
                // Safe to yield everything
                if (this.buffer.length > 0) {
                    yield this.buffer;
                    this.buffer = '';
                }
            }
        }
    }

    /**
     * Finalize parsing - extract any remaining code if stream ends
     * @yields {string} - Final code content if any
     */
    *finalize() {
        if (this.inCodeBlock && !this.codeBlockComplete && this.buffer.length > 0) {
            // Stream ended but we're in a code block
            // Return everything as code (no closing ``` found)
            yield this.buffer;
            this.buffer = '';
        }
    }

    /**
     * Reset parser state
     */
    reset() {
        this.buffer = '';
        this.inCodeBlock = false;
        this.codeStartIndex = -1;
        this.languageTag = '';
        this.codeBlockComplete = false;
    }
}

