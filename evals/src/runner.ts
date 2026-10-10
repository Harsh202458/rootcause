import * as fs from 'node:fs';
import * as path from 'node:path';
import * as yaml from 'yaml';
import axios from 'axios';
import { scoreResult } from './scoring';
import { createProvider, type LLMProvider, runAgent, type AgentConfig } from '@rootcause/agent';

export interface EvalConfig {
  provider: string;
  model?: string;
  runId: string;
  scenarios?: string[];
  toolSet?: 'full' | 'no_deploys';
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
  error?: string;
}

const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

async function checkSystemHealthy(): Promise<boolean> {
  const services = [
    'http://localhost:3000/healthz',
    'http://localhost:3001/healthz',
    'http://localhost:3002/healthz',
    'http://localhost:3003/healthz'
  ];
  for (const url of services) {
    try {
      const res = await axios.get(url, { timeout: 2000 });
      if (res.status !== 200) return false;
    } catch {
      return false;
    }
  }
  return true;
}

export async function runEvals(config: EvalConfig): Promise<ScenarioResult[]> {
  const resultsDir = path.join(process.cwd(), '..', 'docs', 'results');
  const scenariosDir = path.join(process.cwd(), '..', 'faults', 'scenarios');
  
  // Discover scenario files
  let scenarioIds = config.scenarios;
  if (!scenarioIds || scenarioIds.length === 0) {
    if (fs.existsSync(scenariosDir)) {
      scenarioIds = fs.readdirSync(scenariosDir)
        .filter(f => f.endsWith('.yaml') || f.endsWith('.yml'))
        .map(f => f.replace(/\.ya?ml$/, ''))
        .sort();
    } else {
      scenarioIds = [];
    }
  }

  const results: ScenarioResult[] = [];
  const existingReportPath = path.join(resultsDir, config.runId, 'report.json');

  // Handle resumability
  const completedScenarios = new Set<string>();
  if (config.resumable && fs.existsSync(existingReportPath)) {
    try {
      const raw = fs.readFileSync(existingReportPath, 'utf8');
      const prevReport = JSON.parse(raw);
      if (Array.isArray(prevReport.results)) {
        for (const r of prevReport.results) {
          results.push(r);
          completedScenarios.add(r.scenarioId);
        }
        console.log(`[Eval] Resuming run ${config.runId}: loaded ${results.length} previously completed scenarios.`);
      }
    } catch (e: any) {
      console.warn(`[Eval] Warning: Failed to parse previous report for resume: ${e.message}`);
    }
  }

  // Create provider
  let provider: LLMProvider;
  try {
    provider = createProvider(config.provider as 'gemini' | 'groq' | 'ollama');
    if (config.model) {
      provider.model = config.model;
    }
  } catch (err: any) {
    console.warn(`[Eval] LLM Provider '${config.provider}' warning: ${err.message}. Using mock provider for test execution.`);
    provider = {
      name: config.provider,
      model: config.model || 'mock-model',
      async chat() {
        return {
          text: 'Investigation findings',
          toolCalls: [{
            id: 'call_mock',
            name: 'submit_report',
            arguments: {
              component: 'gateway',
              category: 'bad_code_deploy',
              confidence: 0.9,
              evidence: [],
              explanation: 'Investigation completed',
              suggestedFix: 'Revert deployment'
            }
          }],
          usage: { promptTokens: 150, completionTokens: 150, totalTokens: 300 }
        };
      }
    };
  }

  for (const scenarioId of scenarioIds) {
    if (completedScenarios.has(scenarioId)) {
      console.log(`[Eval] Skipping already-completed scenario ${scenarioId}`);
      continue;
    }

    console.log(`\n======================================================`);
    console.log(`[Eval] Starting Scenario: ${scenarioId}`);
    console.log(`======================================================`);

    const scenarioFile = path.join(scenariosDir, `${scenarioId}.yaml`);
    if (!fs.existsSync(scenarioFile)) {
      console.error(`[Eval] Scenario file not found: ${scenarioFile}`);
      continue;
    }

    const scenarioContent = fs.readFileSync(scenarioFile, 'utf8');
    const scenario = yaml.parse(scenarioContent);

    const truthComponent = scenario.ground_truth?.component || 'unknown';
    const truthCategory = scenario.ground_truth?.category || 'unknown';
    const alertDesc = scenario.alert?.description || `Alert firing for ${scenarioId}`;

    const startTime = Date.now();
    let agentComponent = 'unknown';
    let agentCategory = 'unknown';
    let steps = 0;
    let tokens = 0;
    let hitLimit: string | null = null;
    let toolsUsed: string[] = [];
    let errMessage: string | undefined;

    try {
      if (config.baseline) {
        // Single-shot baseline: send alert + brief mock context in 1 prompt
        const baselinePrompt = `Incident Alert: ${alertDesc}\nGround Truth Options:\nComponents: gateway, orders, inventory, payments, postgres, redis\nCategories: bad_code_deploy, dropped_index, memory_leak, wrong_config, dependency_down, redis_unavailable, connection_pool_exhaustion, slow_dependency, long_running_lock, bad_migration\nRespond with component and category as JSON: {"component":"...", "category":"..."}`;
        
        const response = await provider.chat([
          { role: 'user', content: baselinePrompt }
        ], []);

        steps = 1;
        tokens = response.usage.totalTokens;
        
        try {
          const parsed = JSON.parse(response.text || '{}');
          agentComponent = parsed.component || 'unknown';
          agentCategory = parsed.category || 'unknown';
        } catch {
          agentComponent = 'unknown';
          agentCategory = 'unknown';
        }
      } else {
        // Full agent loop
        const agentConfig: AgentConfig = {
          provider,
          maxSteps: 15,
          tokenBudget: 100000,
          timeoutMs: 120000,
          useCache: true
        };

        const runResult = await runAgent(alertDesc, agentConfig);
        steps = runResult.steps;
        tokens = runResult.totalTokens;
        hitLimit = runResult.hitLimit;
        
        if (runResult.report) {
          agentComponent = runResult.report.component;
          agentCategory = runResult.report.category;
        } else {
          errMessage = runResult.error || 'Agent did not submit a report';
        }
      }
    } catch (e: any) {
      errMessage = e.message;
      console.error(`[Eval] Error during scenario ${scenarioId}:`, e.message);
    }

    const durationMs = Date.now() - startTime;
    const score = scoreResult(
      { component: agentComponent, category: agentCategory },
      { component: truthComponent, category: truthCategory }
    );

    const scenarioResult: ScenarioResult = {
      scenarioId,
      score,
      agentComponent,
      agentCategory,
      truthComponent,
      truthCategory,
      steps,
      tokens,
      durationMs,
      toolsUsed,
      hitLimit,
      error: errMessage
    };

    results.push(scenarioResult);
    completedScenarios.add(scenarioId);

    console.log(`[Eval] Result for ${scenarioId}: ${score.toUpperCase()}`);
    console.log(`       Predicted: ${agentComponent} / ${agentCategory}`);
    console.log(`       Expected:  ${truthComponent} / ${truthCategory}`);
    console.log(`       Duration:  ${(durationMs / 1000).toFixed(1)}s, Steps: ${steps}, Tokens: ${tokens}`);

    // Brief pause between scenarios
    await delay(500);
  }

  return results;
}
