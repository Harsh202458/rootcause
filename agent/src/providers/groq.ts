import { LLMProvider, ChatMessage, ToolDefinition, LLMResponse, ToolCall } from './types';
import axios from 'axios';

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export class GroqProvider implements LLMProvider {
  name = 'groq';
  model: string;
  private apiKey: string;
  
  // Rate limiting properties
  private requestsThisMinute = 0;
  private minuteStartTime = Date.now();

  constructor() {
    this.apiKey = process.env.GROQ_API_KEY || '';
    if (!this.apiKey) {
      throw new Error('GROQ_API_KEY environment variable is required');
    }
    this.model = process.env.GROQ_MODEL || 'llama-3.1-70b-versatile';
  }

  private async enforceRateLimit() {
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

  async chat(messages: ChatMessage[], tools: ToolDefinition[]): Promise<LLMResponse> {
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
        const payload: any = {
          model: this.model,
          messages: formattedMessages
        };
        
        if (tools.length > 0) {
          payload.tools = formattedTools;
          payload.tool_choice = 'auto';
        }

        const response = await axios.post('https://api.groq.com/openai/v1/chat/completions', payload, {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          }
        });

        const choice = response.data.choices[0];
        const message = choice.message;
        
        const toolCalls: ToolCall[] = (message.tool_calls || []).map((tc: any) => ({
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

      } catch (err: any) {
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
