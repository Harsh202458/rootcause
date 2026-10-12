import { Client } from 'pg';
import { compose } from './docker';
import { delay, waitUntilSettled } from './health';

const OPS_DB_URL = process.env.OPS_DB_URL || 'postgres://rootcause:rootcause_password@localhost:5432/ops';

// How long the healthy system runs before a fault, so there is a baseline to compare against.
const BASELINE_MS = 90000;

/**
 * Gives a scenario a clean history. Scenarios run back to back, so without
 * this the metrics and logs of the previous incident are still in view and
 * the agent can mistake them for the current one.
 */
export async function startFromCleanHistory(): Promise<void> {
  if (!(await waitUntilSettled(300000))) {
    throw new Error('System did not become healthy; cannot start a scenario.');
  }

  // Prometheus keeps its data inside the container, so recreating it clears the metrics.
  compose(['up', '-d', '--no-deps', '--force-recreate', 'prometheus']);

  const client = new Client({ connectionString: OPS_DB_URL });
  await client.connect();
  try {
    await client.query('TRUNCATE logs');
  } finally {
    await client.end();
  }

  await delay(BASELINE_MS);
  if (!(await waitUntilSettled(120000))) {
    throw new Error('System was not healthy after the baseline period.');
  }
}
