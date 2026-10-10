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

  // Gemini has no tool call ids, so we mint our own and remember the function name.
  private callCounter = 0;
  private callNames = new Map<string, string>();
  // Raw model parts keyed by the first call id of that turn. They are replayed
  // unchanged because newer models require their thought signatures back.
  private rawParts = new Map<string, any[]>();

  constructor() {
    this.apiKey = process.env.GEMINI_API_KEY || '';
    if (!this.apiKey) {
      throw new Error('GEMINI_API_KEY environment variable is required');
    }
    this.model = process.env.GEMINI_MODEL || 'gemini-3.5-flash';
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
    const contents: Array<{ role: string; parts: any[] }> = [];
    for (const msg of nonSystemMessages) {
      if (msg.role === 'tool') {
        const part = {
          functionResponse: {
            name: this.callNames.get(msg.toolCallId || '') || msg.toolCallId || 'unknown',
            response: { content: msg.content }
          }
        };
        // All results for one model turn must go back in a single user turn.
        const last = contents[contents.length - 1];
        if (last && last.role === 'user' && last.parts.every(p => p.functionResponse)) {
          last.parts.push(part);
        } else {
          contents.push({ role: 'user', parts: [part] });
        }
      } else if (msg.role === 'assistant' && msg.toolCalls && msg.toolCalls.length > 0) {
        const raw = this.rawParts.get(msg.toolCalls[0]!.id);
        const parts: any[] = raw ?? [
          ...(msg.content ? [{ text: msg.content }] : []),
          ...msg.toolCalls.map(tc => ({ functionCall: { name: tc.name, args: tc.arguments } }))
        ];
        contents.push({ role: 'model', parts });
      } else {
        contents.push({
          role: msg.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: msg.content || ' ' }]
        });
      }
    }

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
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent`;
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
            'Content-Type': 'application/json',
            // Sent as a header, not in the URL, so it never ends up in logs.
            'x-goog-api-key': this.apiKey
          },
          timeout: 60000
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
            const id = `call_${++this.callCounter}`;
            this.callNames.set(id, part.functionCall.name);
            toolCalls.push({
              id,
              name: part.functionCall.name,
              arguments: part.functionCall.args || {}
            });
          }
        }

        if (toolCalls.length > 0) {
          this.rawParts.set(toolCalls[0]!.id, parts);
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
        if ((err.response?.status === 429 || err.response?.status === 503) && attempts < 3) {
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
