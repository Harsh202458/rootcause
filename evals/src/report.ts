import * as fs from 'node:fs';
import * as path from 'node:path';
import type { EvalConfig, ScenarioResult } from './runner';

export interface EvalReport {
  runId: string;
  timestamp: string;
  config: EvalConfig;
  summary: {
    total: number;
    correct: number;
    partial: number;
    wrong: number;
    accuracy: number;
    partialAccuracy: number;
  };
  byCategory: Record<string, { total: number; correct: number; partial: number; wrong: number }>;
  medianSteps: number;
  medianTokens: number;
  medianDurationMs: number;
  results: ScenarioResult[];
  failures: Array<{
    scenarioId: string;
    expected: { component: string; category: string };
    actual: { component: string; category: string };
    explanation: string;
  }>;
}

function calculateMedian(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function generateReport(config: EvalConfig, results: ScenarioResult[]): EvalReport {
  const summary = {
    total: results.length,
    correct: 0,
    partial: 0,
    wrong: 0,
    accuracy: 0,
    partialAccuracy: 0,
  };

  const byCategory: Record<string, { total: number; correct: number; partial: number; wrong: number }> = {};
  const failures: EvalReport['failures'] = [];

  const steps: number[] = [];
  const tokens: number[] = [];
  const durations: number[] = [];

  for (const res of results) {
    summary[res.score]++;
    
    if (!byCategory[res.truthCategory]) {
      byCategory[res.truthCategory] = { total: 0, correct: 0, partial: 0, wrong: 0 };
    }
    byCategory[res.truthCategory].total++;
    byCategory[res.truthCategory][res.score]++;

    if (res.score !== 'correct') {
      failures.push({
        scenarioId: res.scenarioId,
        expected: { component: res.truthComponent, category: res.truthCategory },
        actual: { component: res.agentComponent, category: res.agentCategory },
        explanation: res.error || `Expected ${res.truthComponent}/${res.truthCategory}, got ${res.agentComponent}/${res.agentCategory}`,
      });
    }

    steps.push(res.steps);
    tokens.push(res.tokens);
    durations.push(res.durationMs);
  }

  if (summary.total > 0) {
    summary.accuracy = summary.correct / summary.total;
    summary.partialAccuracy = (summary.correct + summary.partial) / summary.total;
  }

  return {
    runId: config.runId,
    timestamp: new Date().toISOString(),
    config,
    summary,
    byCategory,
    medianSteps: calculateMedian(steps),
    medianTokens: calculateMedian(tokens),
    medianDurationMs: calculateMedian(durations),
    results,
    failures,
  };
}

export function saveReport(report: EvalReport, outputDir: string): void {
  fs.mkdirSync(outputDir, { recursive: true });
  
  const jsonPath = path.join(outputDir, 'report.json');
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));

  const mdPath = path.join(outputDir, 'report.md');
  const mdContent = `# Evaluation Report: ${report.runId}

**Timestamp:** ${report.timestamp}
**Provider:** ${report.config.provider}
**Model:** ${report.config.model || 'default'}
**Tool Set:** ${report.config.toolSet || 'full'}
**Baseline Mode:** ${report.config.baseline ? 'Yes' : 'No'}

## Summary

* **Total Scenarios:** ${report.summary.total}
* **Correct:** ${report.summary.correct} (${(report.summary.accuracy * 100).toFixed(1)}%)
* **Partial:** ${report.summary.partial} (${((report.summary.partialAccuracy - report.summary.accuracy) * 100).toFixed(1)}%)
* **Wrong:** ${report.summary.wrong}
* **Partial Accuracy (Correct + Partial):** ${(report.summary.partialAccuracy * 100).toFixed(1)}%

## Performance Metrics (Median)

* **Steps:** ${report.medianSteps}
* **Tokens:** ${report.medianTokens}
* **Duration:** ${(report.medianDurationMs / 1000).toFixed(1)}s

## Accuracy by Category

| Category | Total | Correct | Partial | Wrong |
|---|---|---|---|---|
${Object.entries(report.byCategory).map(([cat, stats]) => 
  `| ${cat} | ${stats.total} | ${stats.correct} | ${stats.partial} | ${stats.wrong} |`
).join('\n')}

## Failures

${report.failures.length === 0 ? 'No failures.' : report.failures.map(f => `
### ${f.scenarioId}
* **Expected:** Component \`${f.expected.component}\`, Category \`${f.expected.category}\`
* **Actual:** Component \`${f.actual.component}\`, Category \`${f.actual.category}\`
* **Explanation:** ${f.explanation}
`).join('\n')}
`;
  fs.writeFileSync(mdPath, mdContent);
}
