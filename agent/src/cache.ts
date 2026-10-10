import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { ChatMessage, ToolDefinition, LLMResponse } from './providers/types';

const CACHE_FILE = path.join(process.cwd(), '.cache', 'responses.json');
const ENABLED = process.env.RESPONSE_CACHE_ENABLED !== 'false';

export class ResponseCache {
  private cache: Record<string, LLMResponse> = {};
  
  constructor() {
    if (ENABLED) {
      this.load();
    }
  }

  private load() {
    try {
      if (fs.existsSync(CACHE_FILE)) {
        const data = fs.readFileSync(CACHE_FILE, 'utf-8');
        this.cache = JSON.parse(data);
      }
    } catch (err) {
      console.warn('Failed to load response cache:', err);
    }
  }

  private save() {
    if (!ENABLED) return;
    try {
      const dir = path.dirname(CACHE_FILE);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(CACHE_FILE, JSON.stringify(this.cache, null, 2), 'utf-8');
    } catch (err) {
      console.warn('Failed to save response cache:', err);
    }
  }

  private generateKey(provider: string, model: string, messages: ChatMessage[], tools: ToolDefinition[]): string {
    const data = JSON.stringify({ provider, model, messages, tools });
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  public get(provider: string, model: string, messages: ChatMessage[], tools: ToolDefinition[]): LLMResponse | undefined {
    if (!ENABLED) return undefined;
    const key = this.generateKey(provider, model, messages, tools);
    return this.cache[key];
  }

  public set(provider: string, model: string, messages: ChatMessage[], tools: ToolDefinition[], response: LLMResponse): void {
    if (!ENABLED) return;
    const key = this.generateKey(provider, model, messages, tools);
    this.cache[key] = response;
    this.save();
  }

  public clear(): void {
    this.cache = {};
    if (fs.existsSync(CACHE_FILE)) {
      fs.unlinkSync(CACHE_FILE);
    }
  }
}

export const responseCache = new ResponseCache();
