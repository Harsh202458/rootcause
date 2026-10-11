export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  toolCallId?: string;  // For tool result messages
  toolCalls?: ToolCall[];  // For assistant messages with tool calls
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface LLMUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface LLMResponse {
  text?: string;
  toolCalls: ToolCall[];
  usage: LLMUsage;
}

export interface LLMProvider {
  name: string;
  model: string;
  chat(messages: ChatMessage[], tools: ToolDefinition[]): Promise<LLMResponse>;
}

/** The provider cannot serve more requests for now. Not a failure of the agent. */
export class QuotaExhaustedError extends Error {}
