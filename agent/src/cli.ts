import * as path from 'path';
import dotenv from 'dotenv';
import { createProvider } from './providers';
import { runAgent } from './loop';
import { firingAlerts } from './tools/list-alerts';
import { closeTracing } from './tracing';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// Investigates the alert that is firing right now (or one passed with --alert).
async function main() {
  const args = process.argv.slice(2);
  let providerName = 'gemini';
  let alert = '';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--provider') providerName = args[++i] ?? providerName;
    else if (args[i] === '--alert') alert = args[++i] ?? '';
  }

  if (!alert) {
    const alerts = await firingAlerts();
    if (alerts.length === 0) {
      console.log('No alert is firing. Inject a fault and wait about a minute, or pass --alert "<text>".');
      return;
    }
    // Page on the most severe alert, as an on-call rotation would.
    const first = alerts.find(a => a.severity === 'critical') ?? alerts[0]!;
    alert = `[${first.severity}] ${first.name} on ${first.service}: ${first.summary}`;
  }
  console.log(`Alert: ${alert}\nInvestigating with ${providerName}...\n`);

  const provider = createProvider(providerName as 'gemini' | 'groq' | 'ollama');
  const result = await runAgent(alert, { provider });

  if (result.report) {
    console.log(JSON.stringify(result.report, null, 2));
  } else {
    console.log(`No report: ${result.error}`);
  }
  console.log(
    `\nRun ${result.runId}: ${result.steps} steps, ${result.totalTokens} tokens, ${(result.durationMs / 1000).toFixed(0)}s` +
      (result.hitLimit ? `, stopped at the ${result.hitLimit} limit` : '') +
      `. Tools used: ${result.toolsUsed.join(', ')}`
  );
}

main()
  .catch(err => {
    console.error(err.message ?? err);
    process.exitCode = 1;
  })
  .finally(() => closeTracing());
