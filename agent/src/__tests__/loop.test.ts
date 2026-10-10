import { runAgent, AgentConfig } from '../loop';
import { LLMProvider, ChatMessage, ToolDefinition, LLMResponse } from '../providers/types';
import * as tracing from '../tracing';
import * as registry from '../tools/registry';

// Mock dependencies
jest.mock('../tracing', () => ({
  insertRun: jest.fn().mockResolvedValue(1),
  updateRun: jest.fn().mockResolvedValue(undefined),
  insertStep: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../tools/registry', () => ({
  getToolDefinitions: jest.fn().mockReturnValue([
    { name: 'test_tool', description: 'test', parameters: {} },
    { name: 'submit_report', description: 'submit', parameters: {} }
  ]),
  executeTool: jest.fn()
}));

class FakeProvider implements LLMProvider {
  name = 'fake';
  model = 'fake-model';
  responses: LLMResponse[] = [];

  async chat(messages: ChatMessage[], tools: ToolDefinition[]): Promise<LLMResponse> {
    const next = this.responses.shift();
    if (!next) {
      return { text: 'Empty', toolCalls: [], usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 } };
    }
    return next;
  }
}

describe('Agent Loop', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('1. Normal completion', async () => {
    const provider = new FakeProvider();
    provider.responses = [
      {
        toolCalls: [{ id: 'call_1', name: 'test_tool', arguments: {} }],
        usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 }
      },
      {
        toolCalls: [{
          id: 'call_2', name: 'submit_report', arguments: {
            evidence: [{ toolCallId: 'call_1', description: 'Test evidence' }]
          }
        }],
        usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 }
      }
    ];

    (registry.executeTool as jest.Mock).mockResolvedValueOnce({ data: 'ok', truncated: false });

    const config: AgentConfig = { provider, useCache: false };
    const result = await runAgent('Alert 1', config);

    expect(result.report).toBeDefined();
    expect(result.steps).toBe(2);
    expect(tracing.updateRun).toHaveBeenCalledWith(1, expect.objectContaining({ status: 'completed' }));
  });

  it('2. Step limit forced report', async () => {
    const provider = new FakeProvider();
    for (let i = 0; i < 15; i++) {
      provider.responses.push({
        toolCalls: [{ id: `call_${i}`, name: 'test_tool', arguments: {} }],
        usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 }
      });
    }
    // Forced response
    provider.responses.push({
      toolCalls: [{
        id: 'call_forced', name: 'submit_report', arguments: {
          evidence: []
        }
      }],
      usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 }
    });

    (registry.executeTool as jest.Mock).mockResolvedValue({ data: 'ok', truncated: false });

    const config: AgentConfig = { provider, maxSteps: 15, useCache: false };
    const result = await runAgent('Alert 2', config);

    expect(result.hitLimit).toBe('steps');
    expect(result.report).toBeDefined();
    expect(result.steps).toBe(16); // 15 + 1 forced
  });

  it('3. Invalid evidence correction', async () => {
    const provider = new FakeProvider();
    provider.responses = [
      {
        toolCalls: [{ id: 'call_1', name: 'test_tool', arguments: {} }],
        usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 }
      },
      { // Invalid submit
        toolCalls: [{
          id: 'call_2', name: 'submit_report', arguments: {
            evidence: [{ toolCallId: 'call_invalid', description: 'Bad' }]
          }
        }],
        usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 }
      },
      { // Valid submit
        toolCalls: [{
          id: 'call_3', name: 'submit_report', arguments: {
            evidence: [{ toolCallId: 'call_1', description: 'Good' }]
          }
        }],
        usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 }
      }
    ];

    (registry.executeTool as jest.Mock).mockResolvedValue({ data: 'ok', truncated: false });

    const config: AgentConfig = { provider, useCache: false };
    const result = await runAgent('Alert 3', config);

    expect(result.report).toBeDefined();
    expect(result.steps).toBe(3);
  });

  it('4. Tool error recovery', async () => {
    const provider = new FakeProvider();
    provider.responses = [
      {
        toolCalls: [{ id: 'call_1', name: 'test_tool', arguments: {} }],
        usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 }
      },
      { // It will recover and submit report
        toolCalls: [{
          id: 'call_2', name: 'submit_report', arguments: {
            evidence: [] // just to keep it simple
          }
        }],
        usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 }
      }
    ];

    (registry.executeTool as jest.Mock).mockRejectedValueOnce(new Error('Tool failed'));

    const config: AgentConfig = { provider, useCache: false };
    const result = await runAgent('Alert 4', config);

    expect(result.report).toBeDefined();
    expect(result.steps).toBe(2);
  });
});
