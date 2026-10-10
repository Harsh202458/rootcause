import { LLMProvider } from './types';
import { GeminiProvider } from './gemini';
import { GroqProvider } from './groq';
import { OllamaProvider } from './ollama';

export function createProvider(name: 'gemini' | 'groq' | 'ollama'): LLMProvider {
  switch (name) {
    case 'gemini':
      return new GeminiProvider();
    case 'groq':
      return new GroqProvider();
    case 'ollama':
      return new OllamaProvider();
    default:
      throw new Error(`Unknown provider: ${name}`);
  }
}

export * from './types';
