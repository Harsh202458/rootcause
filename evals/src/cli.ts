import * as path from 'node:path';
import * as dotenv from 'dotenv';
import { runEvals, RESULTS_DIR, REPO_ROOT, type EvalConfig } from './runner';
import { compareReports } from './comparison';
import { generateReport, saveReport } from './report';

dotenv.config({ path: path.join(REPO_ROOT, '.env') });

async function main() {
  const args = process.argv.slice(2);

  if (args[0] === 'compare') {
    compareReports(RESULTS_DIR);
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
  const outDir = path.join(RESULTS_DIR, config.runId);

  // Save after every scenario so an interrupted run can be resumed.
  const save = (results: Parameters<typeof generateReport>[1]) =>
    saveReport(generateReport(config, results), outDir);

  const results = await runEvals(config, save);
  save(results);
  console.log(`Saved report to ${outDir}`);
}

main().then(
  () => process.exit(0),
  err => {
    console.error(`\n[Eval] Stopped: ${err.message}`);
    process.exit(1);
  }
);
