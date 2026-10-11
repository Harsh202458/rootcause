import { LLMProvider, ChatMessage, LLMResponse } from './providers/types';
import { getToolDefinitions, executeTool } from './tools/registry';
import { reportSchema, Report } from './tools/submit-report';
import { truncate } from './tools/truncate';
import { insertRun, updateRun, insertStep } from './tracing';
import { SYSTEM_PROMPT } from './system-prompt';
import { responseCache } from './cache';

export interface AgentConfig {
  provider: LLMProvider;
  maxSteps?: number;
  tokenBudget?: number;
  timeoutMs?: number;
  useCache?: boolean;
  /** Tool names to hide from the model, e.g. ['recent_deploys'] for an ablation run. */
  disabledTools?: string[];
  /** Stored on the run for the dashboard. Never shown to the model. */
  scenarioId?: string;
}

export type AgentReport = Report;

export interface AgentRunResult {
  runId: number;
  report: AgentReport | null;
  steps: number;
  totalTokens: number;
  durationMs: number;
  toolsUsed: string[];
  hitLimit: 'steps' | 'tokens' | 'timeout' | null;
  /** False when the report was forced at a limit and its evidence could not be checked. */
  evidenceVerified: boolean;
  error?: string;
  /** True when the model could not be reached (quota, network). The run says nothing about the agent. */
  providerFailed?: boolean;
}

const SUBMIT = 'submit_report';

/**
 * Checks a submitted report. Returns the parsed report, or a message telling
 * the model what to fix. Evidence must cite investigation tool calls made
 * earlier in this run; the submit_report call itself does not count.
 */
export function validateReport(
  args: unknown,
  investigationCallIds: ReadonlySet<string>
): { report: AgentReport } | { problem: string } {
  const parsed = reportSchema.safeParse(args);
  if (!parsed.success) {
    const issues = parsed.error.issues.map(i => `${i.path.join('.') || 'report'}: ${i.message}`).join('; ');
    return { problem: `Invalid report: ${issues}` };
  }
  const report = parsed.data;
  if (report.evidence.length === 0) {
    return { problem: 'A report needs at least one evidence item citing a tool call from this investigation.' };
  }
  const unknown = report.evidence.filter(e => !investigationCallIds.has(e.toolCallId)).map(e => e.toolCallId);
  if (unknown.length > 0) {
    return {
      problem: `Evidence cites tool call ids that were not made in this investigation: ${unknown.join(', ')}. Valid ids: ${[...investigationCallIds].join(', ') || '(none yet)'}.`
    };
  }
  return { report };
}

export async function runAgent(alert: string, config: AgentConfig): Promise<AgentRunResult> {
  const maxSteps = config.maxSteps || 15;
  const tokenBudget = config.tokenBudget || 100000;
  const timeoutMs = config.timeoutMs || 300000;
  const useCache = config.useCache !== false;
  const disabled = new Set(config.disabledTools ?? []);

  const startTime = Date.now();
  let totalTokens = 0;
  let steps = 0;
  let report: AgentReport | null = null;
  let evidenceVerified = false;
  let hitLimit: AgentRunResult['hitLimit'] = null;

  const runId = await insertRun(alert, config.provider.name, config.provider.model, config.scenarioId);

  const messages: ChatMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: `Investigate this alert:\n${alert}` }
  ];

  const toolDefinitions = getToolDefinitions().filter(t => !disabled.has(t.name));
  const allowedTools = new Set(toolDefinitions.map(t => t.name));
  const investigationCallIds = new Set<string>();
  const toolsUsed = new Set<string>();

  const callModel = async (cacheable: boolean): Promise<LLMResponse> => {
    if (cacheable) {
      const cached = responseCache.get(config.provider.name, config.provider.model, messages, toolDefinitions);
      if (cached) return cached;
    }
    const response = await config.provider.chat(messages, toolDefinitions);
    if (cacheable) {
      responseCache.set(config.provider.name, config.provider.model, messages, toolDefinitions, response);
    }
    return response;
  };

  const finish = async (error?: string, providerFailed = false): Promise<AgentRunResult> => {
    const durationMs = Date.now() - startTime;
    const failure = error ?? (report ? undefined : 'Agent did not produce a valid report');
    await updateRun(runId, {
      status: report ? 'completed' : 'failed',
      report,
      total_steps: steps,
      total_tokens: totalTokens,
      duration_ms: durationMs,
      error: failure
    });
    return {
      runId,
      report,
      steps,
      totalTokens,
      durationMs,
      toolsUsed: [...toolsUsed],
      hitLimit,
      evidenceVerified,
      error: failure,
      providerFailed
    };
  };

  while (!report) {
    if (steps >= maxSteps) { hitLimit = 'steps'; break; }
    if (totalTokens >= tokenBudget) { hitLimit = 'tokens'; break; }
    if (Date.now() - startTime > timeoutMs) { hitLimit = 'timeout'; break; }

    steps++;
    const callStart = Date.now();

    let response: LLMResponse;
    try {
      response = await callModel(useCache);
    } catch (err: any) {
      return finish(err.message, true);
    }
    totalTokens += response.usage.totalTokens;

    const toolCalls = response.toolCalls ?? [];
    messages.push({
      role: 'assistant',
      content: response.text || '',
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined
    });
    await insertStep(runId, steps, {
      role: 'assistant',
      content: response.text || '',
      tokensIn: response.usage.promptTokens,
      tokensOut: response.usage.completionTokens,
      durationMs: Date.now() - callStart
    });

    if (toolCalls.length === 0) {
      messages.push({
        role: 'user',
        content: `Continue the investigation by calling a tool, or call ${SUBMIT} if you have enough evidence.`
      });
      continue;
    }

    for (const tc of toolCalls) {
      const toolStart = Date.now();
      let content: string;
      let error: string | undefined;

      if (tc.name === SUBMIT) {
        const checked = validateReport(tc.arguments, investigationCallIds);
        if ('report' in checked) {
          report = checked.report;
          evidenceVerified = true;
          content = 'Report submitted.';
        } else {
          error = checked.problem;
          content = `Error: ${checked.problem}`;
        }
      } else if (!allowedTools.has(tc.name)) {
        error = `Unknown tool: ${tc.name}`;
        content = `Error: ${error}`;
      } else {
        toolsUsed.add(tc.name);
        try {
          const result = await executeTool(tc.name, tc.arguments);
          content = truncate(JSON.stringify(result.data));
        } catch (err: any) {
          error = err.message;
          content = `Error executing tool: ${err.message}`;
        }
        // A failed call is still something the model observed and may cite.
        investigationCallIds.add(tc.id);
      }

      // The model needs each call's id to cite it as evidence.
      const visible = tc.name === SUBMIT ? content : `[tool call id: ${tc.id}]
${content}`;
      messages.push({ role: 'tool', content: visible, toolCallId: tc.id });
      await insertStep(runId, steps, {
        role: 'tool',
        toolName: tc.name,
        toolArgs: tc.arguments,
        toolResult: content,
        durationMs: Date.now() - toolStart,
        error
      });

      if (report) break;
    }
  }

  if (!report && hitLimit) {
    // One last call: the model must report with what it has.
    messages.push({
      role: 'user',
      content: `You have reached the investigation limit. Call ${SUBMIT} now with your best findings so far.`
    });
    steps++;
    try {
      const response = await callModel(false);
      totalTokens += response.usage.totalTokens;
      const reportCall = (response.toolCalls ?? []).find(tc => tc.name === SUBMIT);
      const parsed = reportCall ? reportSchema.safeParse(reportCall.arguments) : undefined;

      if (parsed?.success) {
        // Keep the conclusion, but only the evidence that points at real calls.
        const evidence = parsed.data.evidence.filter(e => investigationCallIds.has(e.toolCallId));
        evidenceVerified = evidence.length > 0 && evidence.length === parsed.data.evidence.length;
        report = { ...parsed.data, evidence };
      }
      await insertStep(runId, steps, {
        role: 'assistant',
        content: response.text || '',
        toolName: reportCall?.name,
        toolArgs: reportCall?.arguments,
        tokensIn: response.usage.promptTokens,
        tokensOut: response.usage.completionTokens,
        error: report ? undefined : 'Forced report was missing or invalid'
      });
    } catch (err: any) {
      return finish(err.message, true);
    }
  }

  return finish();
}
