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
    { name: 'other_tool', description: 'other', parameters: {} },
    { name: 'submit_report', description: 'submit', parameters: {} }
  ]),
  executeTool: jest.fn()
}));

const usage = { promptTokens: 10, completionTokens: 10, totalTokens: 20 };

class FakeProvider implements LLMProvider {
  name = 'fake';
  model = 'fake-model';
  responses: LLMResponse[] = [];
  seenTools: string[][] = [];
  seenMessages: ChatMessage[][] = [];

  async chat(messages: ChatMessage[], tools: ToolDefinition[]): Promise<LLMResponse> {
    this.seenTools.push(tools.map(t => t.name));
    this.seenMessages.push([...messages]);
    const next = this.responses.shift();
    if (!next) {
      return { text: 'Empty', toolCalls: [], usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 } };
    }
    return next;
  }
}

const toolCall = (id: string, name = 'test_tool'): LLMResponse => ({
  toolCalls: [{ id, name, arguments: {} }],
  usage
});

const submit = (id: string, evidenceIds: string[], overrides: Record<string, unknown> = {}): LLMResponse => ({
  toolCalls: [{
    id,
    name: 'submit_report',
    arguments: {
      component: 'orders',
      category: 'bad_code_deploy',
      confidence: 0.8,
      evidence: evidenceIds.map(toolCallId => ({ toolCallId, description: 'evidence' })),
      explanation: 'because',
      suggestedFix: 'rollback',
      ...overrides
    }
  }],
  usage
});

describe('Agent Loop', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (registry.executeTool as jest.Mock).mockResolvedValue({ data: 'ok', truncated: false });
  });

  it('completes when the report cites a real tool call', async () => {
    const provider = new FakeProvider();
    provider.responses = [toolCall('call_1'), submit('call_2', ['call_1'])];

    const config: AgentConfig = { provider, useCache: false };
    const result = await runAgent('Alert 1', config);

    expect(result.report?.component).toBe('orders');
    expect(result.evidenceVerified).toBe(true);
    expect(result.steps).toBe(2);
    expect(result.toolsUsed).toEqual(['test_tool']);
    expect(tracing.updateRun).toHaveBeenCalledWith(1, expect.objectContaining({ status: 'completed', total_steps: 2 }));
  });

  it('forces a report at the step limit and marks its evidence unverified', async () => {
    const provider = new FakeProvider();
    for (let i = 0; i < 15; i++) provider.responses.push(toolCall(`call_${i}`));
    provider.responses.push(submit('call_forced', []));

    const result = await runAgent('Alert 2', { provider, maxSteps: 15, useCache: false });

    expect(result.hitLimit).toBe('steps');
    expect(result.report).not.toBeNull();
    expect(result.evidenceVerified).toBe(false);
    expect(result.steps).toBe(16); // 15 + 1 forced
  });

  it('rejects evidence that cites an unknown tool call, then accepts the correction', async () => {
    const provider = new FakeProvider();
    provider.responses = [toolCall('call_1'), submit('call_2', ['call_invalid']), submit('call_3', ['call_1'])];

    const result = await runAgent('Alert 3', { provider, useCache: false });

    expect(result.report).not.toBeNull();
    expect(result.steps).toBe(3);
  });

  it('rejects a report with no evidence', async () => {
    const provider = new FakeProvider();
    provider.responses = [toolCall('call_1'), submit('call_2', [])];

    const result = await runAgent('Alert', { provider, maxSteps: 2, useCache: false });

    // The only submission was rejected and the forced call returned nothing.
    expect(result.report).toBeNull();
    expect(result.hitLimit).toBe('steps');
    expect(tracing.updateRun).toHaveBeenCalledWith(1, expect.objectContaining({ status: 'failed' }));
  });

  it('does not let a report cite its own submit_report call', async () => {
    const provider = new FakeProvider();
    provider.responses = [submit('call_1', ['call_1'])];

    const result = await runAgent('Alert', { provider, maxSteps: 1, useCache: false });

    expect(result.report).toBeNull();
  });

  it('rejects a report with a component outside the allowed set', async () => {
    const provider = new FakeProvider();
    provider.responses = [
      toolCall('call_1'),
      submit('call_2', ['call_1'], { component: 'auth' }),
      submit('call_3', ['call_1'])
    ];

    const result = await runAgent('Alert', { provider, useCache: false });

    expect(result.report?.component).toBe('orders');
    expect(result.steps).toBe(3);
  });

  it('recovers from a tool error and may cite the failed call', async () => {
    const provider = new FakeProvider();
    provider.responses = [toolCall('call_1'), submit('call_2', ['call_1'])];
    (registry.executeTool as jest.Mock).mockReset();
    (registry.executeTool as jest.Mock).mockRejectedValueOnce(new Error('Tool failed'));

    const result = await runAgent('Alert 4', { provider, useCache: false });

    expect(result.report).not.toBeNull();
    expect(result.steps).toBe(2);
  });

  it('nudges the model when it answers with text only', async () => {
    const provider = new FakeProvider();
    provider.responses = [
      { text: 'Let me think.', toolCalls: [], usage },
      toolCall('call_1'),
      submit('call_2', ['call_1'])
    ];

    const result = await runAgent('Alert', { provider, useCache: false });

    expect(result.report).not.toBeNull();
    const secondCall = provider.seenMessages[1]!;
    expect(secondCall[secondCall.length - 1]!.role).toBe('user');
  });

  it('hides disabled tools from the model and refuses calls to them', async () => {
    const provider = new FakeProvider();
    provider.responses = [toolCall('call_1', 'other_tool'), toolCall('call_2'), submit('call_3', ['call_2'])];

    const result = await runAgent('Alert', { provider, useCache: false, disabledTools: ['other_tool'] });

    expect(provider.seenTools[0]).toEqual(['test_tool', 'submit_report']);
    expect(registry.executeTool).toHaveBeenCalledTimes(1);
    expect(result.toolsUsed).toEqual(['test_tool']);
  });
});
