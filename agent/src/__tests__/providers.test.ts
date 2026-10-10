import { ResponseCache } from '../cache';
import { GroqProvider } from '../providers/groq';
import { ChatMessage, ToolDefinition } from '../providers/types';
import axios from 'axios';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('Providers and Cache', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.GROQ_API_KEY = 'test_key';
  });

  it('1. Test the response cache', () => {
    const cache = new ResponseCache();
    cache.clear();

    const messages: ChatMessage[] = [{ role: 'user', content: 'hello' }];
    const tools: ToolDefinition[] = [];
    const response = { text: 'hi', toolCalls: [], usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 } };

    cache.set('test', 'model1', messages, tools, response);
    
    const cached = cache.get('test', 'model1', messages, tools);
    expect(cached).toEqual(response);
    
    const notCached = cache.get('test', 'model2', messages, tools);
    expect(notCached).toBeUndefined();
  });

  it('2. Test rate limiter logic and message format conversion (Groq)', async () => {
    mockedAxios.post.mockResolvedValueOnce({
      data: {
        choices: [{ message: { content: 'test response' } }],
        usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 }
      }
    });

    const provider = new GroqProvider();
    
    const messages: ChatMessage[] = [
      { role: 'system', content: 'system prompt' },
      { role: 'user', content: 'user query' }
    ];
    
    const response = await provider.chat(messages, []);
    
    expect(response.text).toBe('test response');
    expect(mockedAxios.post).toHaveBeenCalledWith(
      'https://api.groq.com/openai/v1/chat/completions',
      expect.objectContaining({
        model: 'llama-3.1-70b-versatile',
        messages: [
          { role: 'system', content: 'system prompt' },
          { role: 'user', content: 'user query' }
        ]
      }),
      expect.any(Object)
    );
  });
  
  it('3. Test rate limit retry (Groq)', async () => {
    // Return 429 first, then success
    mockedAxios.post
      .mockRejectedValueOnce({ response: { status: 429 } })
      .mockResolvedValueOnce({
        data: {
          choices: [{ message: { content: 'retried' } }],
          usage: { prompt_tokens: 5, completion_tokens: 5, total_tokens: 10 }
        }
      });

    const provider = new GroqProvider();
    const startTime = Date.now();
    const response = await provider.chat([{ role: 'user', content: 'retry test' }], []);
    const duration = Date.now() - startTime;
    
    expect(response.text).toBe('retried');
    // First retry waits 2^1 * 1000 = 2000ms
    expect(duration).toBeGreaterThanOrEqual(2000);
  });
});
