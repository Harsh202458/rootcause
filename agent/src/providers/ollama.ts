import { LLMProvider, ChatMessage, ToolDefinition, LLMResponse, ToolCall } from './types';
import axios from 'axios';

export class OllamaProvider implements LLMProvider {
  name = 'ollama';
  model: string;
  private url: string;

  constructor() {
    this.url = process.env.OLLAMA_URL || 'http://localhost:11434';
    this.model = process.env.OLLAMA_MODEL || 'llama3.1';
  }

  async chat(messages: ChatMessage[], tools: ToolDefinition[]): Promise<LLMResponse> {
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
      const payload: any = {
        model: this.model,
        messages: formattedMessages,
        stream: false
      };
      
      if (tools.length > 0) {
        payload.tools = formattedTools;
      }

      const response = await axios.post(`${this.url}/api/chat`, payload, {
        headers: {
          'Content-Type': 'application/json'
        }
      });

      const message = response.data.message;
      
      const toolCalls: ToolCall[] = (message.tool_calls || []).map((tc: any, index: number) => ({
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

    } catch (err: any) {
      throw new Error(`Ollama API Error: ${err.message}`);
    }
  }
}
