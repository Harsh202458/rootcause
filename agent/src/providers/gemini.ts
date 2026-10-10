import { LLMProvider, ChatMessage, ToolDefinition, LLMResponse, ToolCall } from './types';
import axios from 'axios';

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export class GeminiProvider implements LLMProvider {
  name = 'gemini';
  model: string;
  private apiKey: string;
  
  // Rate limiting properties
  private requestsThisMinute = 0;
  private minuteStartTime = Date.now();

  constructor() {
    this.apiKey = process.env.GEMINI_API_KEY || '';
    if (!this.apiKey) {
      throw new Error('GEMINI_API_KEY environment variable is required');
    }
    this.model = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
  }

  private async enforceRateLimit() {
    const now = Date.now();
    if (now - this.minuteStartTime > 60000) {
      this.minuteStartTime = now;
      this.requestsThisMinute = 0;
    }

    if (this.requestsThisMinute >= 15) {
      const waitTime = 60000 - (now - this.minuteStartTime);
      await delay(waitTime);
      this.minuteStartTime = Date.now();
      this.requestsThisMinute = 0;
    }
    this.requestsThisMinute++;
  }

  async chat(messages: ChatMessage[], tools: ToolDefinition[]): Promise<LLMResponse> {
    await this.enforceRateLimit();

    // Find system messages and extract content
    const systemInstruction = messages.filter(m => m.role === 'system').map(m => m.content).join('\n');
    const nonSystemMessages = messages.filter(m => m.role !== 'system');

    // Convert generic format to Gemini format
    const contents = nonSystemMessages.map(msg => {
      let role = 'user';
      if (msg.role === 'assistant' || msg.role === 'tool') {
        role = 'model';
      }
      
      const parts: any[] = [];
      
      if (msg.role === 'tool') {
        // Tool Result
        role = 'user'; // Gemini expects tool results to be from user? Actually, tool responses come from 'user' or 'functionResponse' inside 'user'
        parts.push({
          functionResponse: {
            name: msg.toolCallId || 'unknown',
            response: { content: msg.content }
          }
        });
      } else if (msg.role === 'assistant' && msg.toolCalls && msg.toolCalls.length > 0) {
        if (msg.content) {
          parts.push({ text: msg.content });
        }
        for (const tc of msg.toolCalls) {
          parts.push({
            functionCall: {
              name: tc.name,
              args: tc.arguments
            }
          });
        }
      } else {
        parts.push({ text: msg.content });
      }

      return {
        role,
        parts
      };
    });

    const geminiTools = tools.length > 0 ? [{
      functionDeclarations: tools.map(t => ({
        name: t.name,
        description: t.description,
        parameters: t.parameters
      }))
    }] : undefined;

    let attempts = 0;
    while (attempts <= 3) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;
        const payload: any = {
          contents
        };
        
        if (systemInstruction) {
          payload.systemInstruction = {
             parts: [{ text: systemInstruction }]
          };
        }

        if (geminiTools) {
          payload.tools = geminiTools;
        }

        const response = await axios.post(url, payload, {
          headers: {
            'Content-Type': 'application/json'
          }
        });

        const data = response.data;
        const candidate = data.candidates?.[0];
        if (!candidate) {
           return { text: '', toolCalls: [], usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 } };
        }

        const parts = candidate.content?.parts || [];
        
        let text = '';
        const toolCalls: ToolCall[] = [];

        for (const part of parts) {
          if (part.text) {
            text += part.text;
          }
          if (part.functionCall) {
            toolCalls.push({
              id: part.functionCall.name,
              name: part.functionCall.name,
              arguments: part.functionCall.args || {}
            });
          }
        }

        return {
          text: text || undefined,
          toolCalls,
          usage: {
            promptTokens: data.usageMetadata?.promptTokenCount || 0,
            completionTokens: data.usageMetadata?.candidatesTokenCount || 0,
            totalTokens: data.usageMetadata?.totalTokenCount || 0
          }
        };

      } catch (err: any) {
        if (err.response?.status === 429 && attempts < 3) {
          attempts++;
          const waitTime = Math.pow(2, attempts) * 1000;
          await delay(waitTime);
          continue;
        }
        throw new Error(`Gemini API Error: ${err.response?.data?.error?.message || err.message}`);
      }
    }
    
    throw new Error('Gemini rate limit exceeded after retries');
  }
}
