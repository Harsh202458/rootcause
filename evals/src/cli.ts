import { runEvals, type EvalConfig } from './runner';
import { compareReports } from './comparison';
import * as path from 'node:path';
import { generateReport, saveReport } from './report';

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  const resultsDir = path.join(process.cwd(), '..', 'docs', 'results');

  if (command === 'compare') {
    compareReports(resultsDir);
    return;
  }

  if (command === 'report') {
    const runId = args[1];
    if (!runId) {
      console.error('Usage: npm run eval -- report <runId>');
      process.exit(1);
    }
    console.log(`Report regeneration for ${runId} not fully implemented as a standalone script.`);
    return;
  }

  const config: EvalConfig = {
    provider: 'gemini',
    runId: `eval-${Date.now()}`,
    toolSet: 'full',
    baseline: false,
    resumable: false,
    scenarios: undefined
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--provider') config.provider = args[++i];
    else if (args[i] === '--model') config.model = args[++i];
    else if (args[i] === '--resume') config.resumable = true;
    else if (args[i] === '--no-deploys') config.toolSet = 'no_deploys';
    else if (args[i] === '--baseline') config.baseline = true;
    else if (args[i] === '--scenario') {
      config.scenarios = config.scenarios || [];
      config.scenarios.push(args[++i]);
    }
    else if (args[i] === '--runId') config.runId = args[++i];
  }

  console.log('Starting evals with config:', config);
  const results = await runEvals(config);
  
  const report = generateReport(config, results);
  const outDir = path.join(resultsDir, config.runId);
  saveReport(report, outDir);
  console.log(`Saved report to ${outDir}`);
}

main().catch(console.error);
