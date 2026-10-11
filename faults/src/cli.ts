import * as fs from 'fs';
import * as path from 'path';
import { Client } from 'pg';
import { Injector, loadScenario, unsupportedActions } from './injector';
import { delay, firingAlerts, waitForAlert, waitUntilSettled } from './health';

const scenariosDir = path.join(__dirname, '../scenarios');
const OPS_DB_URL = process.env.OPS_DB_URL || 'postgres://rootcause:rootcause_password@localhost:5432/ops';

// Words that would tell the agent it is being tested or what the answer is.
const LEAK_PATTERN =
  /fault|chaos|inject|scenario|ground.?truth|decoy|bad_code_deploy|dropped_index|memory_leak|wrong_config|dependency_down|redis_unavailable|connection_pool_exhaustion|slow_dependency|long_running_lock|bad_migration/i;

function allScenarioIds(): string[] {
  return fs
    .readdirSync(scenariosDir)
    .filter(f => f.endsWith('.yaml'))
    .map(f => f.replace('.yaml', ''))
    .sort();
}

/** Searches everything the agent can read about the running system for giveaway words. */
async function findLeaks(): Promise<string[]> {
  const client = new Client({ connectionString: OPS_DB_URL });
  await client.connect();
  try {
    const logs = await client.query(
      `SELECT DISTINCT left(message || ' ' || coalesce(error, ''), 300) AS text
       FROM logs WHERE ts > NOW() - interval '10 minutes'`
    );
    const deploys = await client.query(
      `SELECT service || ' ' || summary || ' ' || coalesce(diff_summary, '') AS text FROM deploy_events`
    );
    return [...logs.rows, ...deploys.rows].map(r => r.text as string).filter(text => LEAK_PATTERN.test(text));
  } finally {
    await client.end();
  }
}

/**
 * Proves a scenario is real: its fault produces the alert the agent will be
 * given, nothing in logs or deploy history gives the answer away, and the
 * system recovers after revert.
 */
async function verify(ids: string[]): Promise<void> {
  const injector = new Injector();
  const rows: Record<string, unknown>[] = [];

  for (const id of ids) {
    const scenario = loadScenario(id, scenariosDir);
    const expected = { name: scenario.alert.name, service: scenario.alert.labels.service };
    const row: Record<string, unknown> = { id, category: scenario.ground_truth.category };
    rows.push(row);

    if (!(await waitUntilSettled(300000))) {
      row.result = 'SKIPPED: system not healthy beforehand';
      break;
    }

    await injector.inject(id, scenariosDir);
    try {
      const waited = await waitForAlert(expected, scenario.warmup_seconds * 1000);
      await delay(15000);
      const alerts = await firingAlerts().catch(() => []);
      row.expected = `${expected.name}/${expected.service}`;
      row.firedAfter = waited === null ? 'NEVER' : `${waited}s`;
      row.alsoFiring = alerts
        .map(a => `${a.name}/${a.service}`)
        .filter(a => a !== row.expected)
        .join(' ');
      const leaks = await findLeaks();
      row.leaks = leaks.length;
      if (leaks.length > 0) console.log(`  leak in ${id}: ${leaks[0]}`);
      row.result = waited === null ? 'FAIL: alert did not fire' : leaks.length > 0 ? 'FAIL: leak' : 'ok';
    } finally {
      await injector.revert(id, scenariosDir);
    }

    const recoverStart = Date.now();
    const recovered = await waitUntilSettled(300000);
    row.recovered = recovered ? `${Math.round((Date.now() - recoverStart) / 1000)}s` : 'NO';
    if (!recovered) row.result = 'FAIL: did not recover';
    console.log(JSON.stringify(row));
    if (!recovered) break;
  }

  console.table(rows);
  const failed = rows.filter(r => r.result !== 'ok');
  if (failed.length > 0) process.exitCode = 1;
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  const injector = new Injector();

  switch (command) {
    case 'inject':
    case 'revert': {
      const id = rest[0];
      if (!id) throw new Error('Missing scenario id');
      await injector[command](id, scenariosDir);
      console.log(`${command === 'inject' ? 'Applied' : 'Reverted'} ${id}`);
      // A lock scenario holds its session open for as long as this process lives.
      if (command === 'inject' && injector.heldSessions.length > 0) {
        console.log('Holding the database session open. Press Ctrl+C, then run revert.');
        await new Promise(() => undefined);
      }
      break;
    }
    case 'list':
      for (const id of allScenarioIds()) {
        const s = loadScenario(id, scenariosDir);
        const missing = unsupportedActions(s);
        const status = missing.length === 0 ? 'ready' : `NOT IMPLEMENTED (${missing.join(', ')})`;
        console.log(`- ${s.id}: [${s.ground_truth.category} / ${s.ground_truth.component}] ${status}`);
      }
      break;
    case 'verify':
      await verify(rest.length > 0 ? rest : allScenarioIds());
      break;
    default:
      console.log('Usage: fault <inject|revert|list|verify> [scenario-id ...]');
      process.exitCode = 1;
  }
}

main().then(
  () => process.exit(process.exitCode ?? 0),
  err => {
    console.error(err.message ?? err);
    process.exit(1);
  }
);
