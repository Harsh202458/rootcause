import * as fs from 'node:fs';
import * as path from 'node:path';
import { scoreResult } from './scoring';
import { createProvider, type LLMProvider, recordVerdict, runAgent, type AgentConfig } from '@rootcause/agent';
import {
  Injector,
  delay,
  isSettled,
  loadScenario,
  unsupportedActions,
  waitForAlert,
  waitUntilSettled,
  type Scenario
} from '@rootcause/faults';

export const REPO_ROOT = path.resolve(__dirname, '..', '..');
export const RESULTS_DIR = path.join(REPO_ROOT, 'docs', 'results');
export const SCENARIOS_DIR = path.join(REPO_ROOT, 'faults', 'scenarios');

export interface EvalConfig {
  provider: string;
  model?: string;
  runId: string;
  scenarios?: string[];
  toolSet?: 'full' | 'no_deploys';
  /** Alert-only baseline: one LLM call that sees the alert text and nothing else. */
  baseline?: boolean;
  resumable?: boolean;
}

export interface ScenarioResult {
  scenarioId: string;
  score: 'correct' | 'partial' | 'wrong';
  agentComponent: string;
  agentCategory: string;
  truthComponent: string;
  truthCategory: string;
  steps: number;
  tokens: number;
  durationMs: number;
  toolsUsed: string[];
  hitLimit: string | null;
  evidenceVerified: boolean;
  error?: string;
}

/** What the agent is told. Symptom only: never anything from ground_truth. */
export function formatAlert(scenario: Scenario): string {
  const { name, labels, description } = scenario.alert;
  return `[${labels.severity}] ${name} on ${labels.service}: ${description}`;
}

export function listScenarioIds(): string[] {
  return fs
    .readdirSync(SCENARIOS_DIR)
    .filter(f => f.endsWith('.yaml') || f.endsWith('.yml'))
    .map(f => f.replace(/\.ya?ml$/, ''))
    .sort();
}

function parseBaselineAnswer(text: string | undefined): { component: string; category: string } {
  const match = (text ?? '').match(/\{[\s\S]*\}/);
  try {
    const parsed = JSON.parse(match ? match[0] : '{}');
    return { component: parsed.component || 'unknown', category: parsed.category || 'unknown' };
  } catch {
    return { component: 'unknown', category: 'unknown' };
  }
}

export async function runEvals(
  config: EvalConfig,
  onProgress?: (results: ScenarioResult[]) => void
): Promise<ScenarioResult[]> {
  const scenarioIds = config.scenarios?.length ? config.scenarios : listScenarioIds();
  const scenarios = scenarioIds.map(id => loadScenario(id, SCENARIOS_DIR));

  // Refuse to start rather than score a scenario whose fault was never injected.
  if (!config.baseline) {
    const blocked = scenarios
      .map(s => ({ id: s.id, missing: unsupportedActions(s) }))
      .filter(s => s.missing.length > 0);
    if (blocked.length > 0) {
      const lines = blocked.map(b => `  ${b.id}: ${b.missing.join(', ')}`).join('\n');
      throw new Error(
        `These scenarios need injector actions that are not implemented yet:\n${lines}\n` +
          'Implement them in faults/src/injector.ts, or pass --scenario for the ones that work.'
      );
    }
  }

  // No silent fallback: a missing API key must stop the run, not invent answers.
  const provider: LLMProvider = createProvider(config.provider as 'gemini' | 'groq' | 'ollama');
  if (config.model) {
    provider.model = config.model;
  }

  const results: ScenarioResult[] = [];
  const completed = new Set<string>();
  const previousReport = path.join(RESULTS_DIR, config.runId, 'report.json');
  if (config.resumable && fs.existsSync(previousReport)) {
    const prev = JSON.parse(fs.readFileSync(previousReport, 'utf8'));
    for (const r of prev.results ?? []) {
      results.push(r);
      completed.add(r.scenarioId);
    }
    console.log(`[Eval] Resuming ${config.runId}: ${results.length} scenarios already done.`);
  }

  const injector = new Injector();

  for (const scenario of scenarios) {
    if (completed.has(scenario.id)) continue;
    console.log(`\n[Eval] Scenario ${scenario.id}`);

    const alertText = formatAlert(scenario);
    const truth = { component: scenario.ground_truth.component, category: scenario.ground_truth.category };

    let answer = { component: 'unknown', category: 'unknown' };
    let steps = 0;
    let tokens = 0;
    let durationMs = 0;
    let hitLimit: string | null = null;
    let toolsUsed: string[] = [];
    let evidenceVerified = false;
    let errMessage: string | undefined;
    let agentRunId: number | undefined;

    if (config.baseline) {
      const prompt =
        `Incident alert: ${alertText}\n` +
        'Components: gateway, orders, inventory, payments, postgres, redis\n' +
        'Categories: bad_code_deploy, dropped_index, memory_leak, wrong_config, dependency_down, ' +
        'redis_unavailable, connection_pool_exhaustion, slow_dependency, long_running_lock, bad_migration\n' +
        'Reply with the most likely root cause as JSON only: {"component":"...","category":"..."}';
      const start = Date.now();
      const response = await provider.chat([{ role: 'user', content: prompt }], []);
      durationMs = Date.now() - start;
      steps = 1;
      tokens = response.usage.totalTokens;
      answer = parseBaselineAnswer(response.text);
    } else {
      if (!(await isSettled()) && !(await waitUntilSettled(180000))) {
        throw new Error(`System is not healthy before ${scenario.id}. Fix it and re-run with --resume.`);
      }

      await injector.inject(scenario.id, SCENARIOS_DIR);
      try {
        // Start the agent when the alert it is paged with is really firing.
        const expected = { name: scenario.alert.name, service: scenario.alert.labels.service };
        const waited = await waitForAlert(expected, scenario.warmup_seconds * 1000);
        if (waited === null) {
          throw new Error(`${scenario.id}: ${expected.name} on ${expected.service} never fired. Run "npm run fault -- verify ${scenario.id}".`);
        }
        console.log(`[Eval] Alert fired after ${waited}s`);
        await delay(15000);

        const agentConfig: AgentConfig = {
          provider,
          maxSteps: 15,
          tokenBudget: 100000,
          timeoutMs: 300000,
          useCache: false,
          disabledTools: config.toolSet === 'no_deploys' ? ['recent_deploys'] : [],
          scenarioId: scenario.id
        };
        const run = await runAgent(alertText, agentConfig);
        agentRunId = run.runId;
        steps = run.steps;
        tokens = run.totalTokens;
        durationMs = run.durationMs;
        hitLimit = run.hitLimit;
        toolsUsed = run.toolsUsed;
        evidenceVerified = run.evidenceVerified;
        errMessage = run.error;
        if (run.report) {
          answer = { component: run.report.component, category: run.report.category };
        }
      } finally {
        await injector.revert(scenario.id, SCENARIOS_DIR);
      }

      if (!(await waitUntilSettled(300000))) {
        throw new Error(`System did not recover after reverting ${scenario.id}. Results so far are saved.`);
      }
    }

    const score = scoreResult(answer, truth);
    if (agentRunId !== undefined) await recordVerdict(agentRunId, score, truth);
    results.push({
      scenarioId: scenario.id,
      score,
      agentComponent: answer.component,
      agentCategory: answer.category,
      truthComponent: truth.component,
      truthCategory: truth.category,
      steps,
      tokens,
      durationMs,
      toolsUsed,
      hitLimit,
      evidenceVerified,
      error: errMessage
    });
    onProgress?.(results);

    console.log(`[Eval] ${scenario.id}: ${score.toUpperCase()}  predicted ${answer.component}/${answer.category}, expected ${truth.component}/${truth.category}`);
  }

  return results;
}
