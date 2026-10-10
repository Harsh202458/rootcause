"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OllamaProvider = void 0;
const axios_1 = __importDefault(require("axios"));
class OllamaProvider {
    name = 'ollama';
    model;
    url;
    constructor() {
        this.url = process.env.OLLAMA_URL || 'http://localhost:11434';
        this.model = process.env.OLLAMA_MODEL || 'llama3.1';
    }
    async chat(messages, tools) {
        const formattedMessages = messages.map(msg => {
            if (msg.role === 'tool') {
                return {
                    role: 'tool',
                    content: msg.content
                };
            }
            if (msg.role === 'assistant' && msg.toolCalls) {
                return {
                    role: 'assistant',
                    content: msg.content || null,
                    tool_calls: msg.toolCalls.map(tc => ({
                        function: {
                            name: tc.name,
                            arguments: tc.arguments
                        }
                    }))
                };
            }
            return {
                role: msg.role,
                content: msg.content
            };
        });
        const formattedTools = tools.map(t => ({
            type: 'function',
            function: {
                name: t.name,
                description: t.description,
                parameters: t.parameters
            }
        }));
        try {
            const payload = {
                model: this.model,
                messages: formattedMessages,
                stream: false
            };
            if (tools.length > 0) {
                payload.tools = formattedTools;
            }
            const response = await axios_1.default.post(`${this.url}/api/chat`, payload, {
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            const message = response.data.message;
            const toolCalls = (message.tool_calls || []).map((tc, index) => ({
                id: `call_${index}`,
                name: tc.function.name,
                arguments: tc.function.arguments || {}
            }));
            return {
                text: message.content || undefined,
                toolCalls,
                usage: {
                    promptTokens: response.data.prompt_eval_count || 0,
                    completionTokens: response.data.eval_count || 0,
                    totalTokens: (response.data.prompt_eval_count || 0) + (response.data.eval_count || 0)
                }
            };
        }
        catch (err) {
            throw new Error(`Ollama API Error: ${err.message}`);
        }
    }
}
exports.OllamaProvider = OllamaProvider;
