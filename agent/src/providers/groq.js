"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GroqProvider = void 0;
const axios_1 = __importDefault(require("axios"));
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
class GroqProvider {
    name = 'groq';
    model;
    apiKey;
    // Rate limiting properties
    requestsThisMinute = 0;
    minuteStartTime = Date.now();
    constructor() {
        this.apiKey = process.env.GROQ_API_KEY || '';
        if (!this.apiKey) {
            throw new Error('GROQ_API_KEY environment variable is required');
        }
        this.model = process.env.GROQ_MODEL || 'llama-3.1-70b-versatile';
    }
    async enforceRateLimit() {
        const now = Date.now();
        if (now - this.minuteStartTime > 60000) {
            this.minuteStartTime = now;
            this.requestsThisMinute = 0;
        }
        if (this.requestsThisMinute >= 30) {
            const waitTime = 60000 - (now - this.minuteStartTime);
            await delay(waitTime);
            this.minuteStartTime = Date.now();
            this.requestsThisMinute = 0;
        }
        this.requestsThisMinute++;
    }
    async chat(messages, tools) {
        await this.enforceRateLimit();
        // Convert generic format to OpenAI/Groq format
        const formattedMessages = messages.map(msg => {
            if (msg.role === 'tool') {
                return {
                    role: 'tool',
                    content: msg.content,
                    tool_call_id: msg.toolCallId
                };
            }
            if (msg.role === 'assistant' && msg.toolCalls) {
                return {
                    role: 'assistant',
                    content: msg.content || null,
                    tool_calls: msg.toolCalls.map(tc => ({
                        id: tc.id,
                        type: 'function',
                        function: {
                            name: tc.name,
                            arguments: JSON.stringify(tc.arguments)
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
        let attempts = 0;
        while (attempts <= 3) {
            try {
                const payload = {
                    model: this.model,
                    messages: formattedMessages
                };
                if (tools.length > 0) {
                    payload.tools = formattedTools;
                    payload.tool_choice = 'auto';
                }
                const response = await axios_1.default.post('https://api.groq.com/openai/v1/chat/completions', payload, {
                    headers: {
                        'Authorization': `Bearer ${this.apiKey}`,
                        'Content-Type': 'application/json'
                    }
                });
                const choice = response.data.choices[0];
                const message = choice.message;
                const toolCalls = (message.tool_calls || []).map((tc) => ({
                    id: tc.id,
                    name: tc.function.name,
                    arguments: JSON.parse(tc.function.arguments || '{}')
                }));
                return {
                    text: message.content || undefined,
                    toolCalls,
                    usage: {
                        promptTokens: response.data.usage?.prompt_tokens || 0,
                        completionTokens: response.data.usage?.completion_tokens || 0,
                        totalTokens: response.data.usage?.total_tokens || 0
                    }
                };
            }
            catch (err) {
                if (err.response?.status === 429 && attempts < 3) {
                    attempts++;
                    const waitTime = Math.pow(2, attempts) * 1000;
                    await delay(waitTime);
                    continue;
                }
                throw new Error(`Groq API Error: ${err.response?.data?.error?.message || err.message}`);
            }
        }
        throw new Error('Groq rate limit exceeded after retries');
    }
}
exports.GroqProvider = GroqProvider;
