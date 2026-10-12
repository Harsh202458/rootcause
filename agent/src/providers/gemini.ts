import { LLMProvider, ChatMessage, ToolDefinition, LLMResponse, ToolCall, QuotaExhaustedError } from './types';
import axios from 'axios';

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export class GeminiProvider implements LLMProvider {
  name = 'gemini';
  model: string;
  private apiKey: string;
  
  // The free tier allows only a few requests per minute, so requests are
  // spaced evenly instead of sent in a burst.
  private minIntervalMs = 60000 / Math.max(1, Number(process.env.GEMINI_RPM) || 5) + 500;
  private lastRequestAt = 0;

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
    const wait = this.lastRequestAt + this.minIntervalMs - Date.now();
    if (wait > 0) await delay(wait);
    this.lastRequestAt = Date.now();
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
    while (attempts <= 6) {
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
        const status = err.response?.status;
        const message: string = err.response?.data?.error?.message || err.message;
        // A daily quota will not clear by waiting a minute; stop so the run can resume later.
        if (status === 429 && /per ?day|daily/i.test(JSON.stringify(err.response?.data ?? ''))) {
          throw new QuotaExhaustedError(`Gemini daily quota exhausted: ${message}`);
        }
        // No response at all: a timeout or a dropped connection. Worth retrying.
        const networkFailure = !err.response;
        if ((status === 429 || status === 503 || status === 500 || networkFailure) && attempts < 6) {
          attempts++;
          const hinted = /retry in ([\d.]+)s/i.exec(message);
          const waitTime = hinted ? Math.ceil(Number(hinted[1]) * 1000) + 1000 : Math.min(2 ** attempts * 2000, 60000);
          await delay(waitTime);
          this.lastRequestAt = Date.now();
          continue;
        }
        if (status === 429) throw new QuotaExhaustedError(`Gemini rate limit: ${message}`);
        throw new Error(`Gemini API Error: ${message}`);
      }
    }

    throw new Error('Gemini rate limit exceeded after retries');
  }
}
