import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'yaml';
import Docker from 'dockerode';
import { Client } from 'pg';

const ADMIN_DB_URL =
  process.env.ADMIN_DB_URL || 'postgres://rootcause:rootcause_password@localhost:5432/rootcause';
const OPS_DB_URL = process.env.OPS_DB_URL || 'postgres://rootcause:rootcause_password@localhost:5432/ops';

// Sessions that hold a lock open are tagged with this name so revert can find
// them. It is deliberately neutral: the agent can see it in pg_stat_activity.
const BACKGROUND_APP_NAME = 'batch-worker';

const DEPLOY_KINDS = ['code', 'config', 'migration'];

/**
 * Actions the injector can really perform. Anything else in a scenario is
 * refused: an injection that silently does nothing would make the eval score
 * meaningless.
 */
export const SUPPORTED_ACTIONS: ReadonlySet<string> = new Set([
  'run_sql',
  'stop_container',
  'start_container',
  'exec_in_container',
  'cancel_long_queries'
]);

export interface ScenarioStep {
  action: string;
  target: string;
  params?: Record<string, any>;
}

export interface Scenario {
  id: string;
  alert: { name: string; labels: { service: string; severity: string }; description: string };
  inject: ScenarioStep[];
  revert: ScenarioStep[];
  warmup_seconds: number;
  ground_truth: { component: string; category: string; evidence: string[] };
  decoy_deploys?: Array<{
    service: string;
    kind: string;
    from_version: string;
    to_version: string;
    summary: string;
    minutes_before: number;
  }>;
}

export function loadScenario(scenarioId: string, scenariosDir: string): Scenario {
  const scenarioPath = path.join(scenariosDir, `${scenarioId}.yaml`);
  if (!fs.existsSync(scenarioPath)) {
    throw new Error(`Scenario ${scenarioId} not found at ${scenarioPath}`);
  }
  return yaml.parse(fs.readFileSync(scenarioPath, 'utf8')) as Scenario;
}

/** Actions used by a scenario that the injector cannot perform yet. */
export function unsupportedActions(scenario: Scenario): string[] {
  const actions = [...scenario.inject, ...scenario.revert].map(s => s.action);
  return [...new Set(actions.filter(a => !SUPPORTED_ACTIONS.has(a)))];
}

export class Injector {
  private docker: Docker;
  private backgroundClients: Client[] = [];

  constructor() {
    this.docker = new Docker({
      socketPath: process.platform === 'win32' ? '//./pipe/docker_engine' : '/var/run/docker.sock'
    });
  }

  public async inject(scenarioId: string, scenariosDir: string): Promise<void> {
    const scenario = loadScenario(scenarioId, scenariosDir);
    this.assertSupported(scenario);

    await this.recordDeploys(scenario);
    for (const step of scenario.inject) {
      await this.executeStep(step);
    }
    console.log(`Applied ${scenarioId}`);
  }

  public async revert(scenarioId: string, scenariosDir: string): Promise<void> {
    const scenario = loadScenario(scenarioId, scenariosDir);
    this.assertSupported(scenario);

    for (const step of scenario.revert) {
      await this.executeStep(step);
    }
    await this.closeBackgroundClients();
    console.log(`Reverted ${scenarioId}`);
  }

  private assertSupported(scenario: Scenario): void {
    const missing = unsupportedActions(scenario);
    if (missing.length > 0) {
      throw new Error(`${scenario.id} uses actions the injector does not implement yet: ${missing.join(', ')}`);
    }
  }

  private async recordDeploys(scenario: Scenario): Promise<void> {
    const deploys = scenario.decoy_deploys ?? [];
    if (deploys.length === 0) return;

    const client = new Client({ connectionString: OPS_DB_URL });
    await client.connect();
    try {
      for (const d of deploys) {
        await client.query(
          `INSERT INTO deploy_events (timestamp, service, kind, from_version, to_version, summary)
           VALUES (NOW() - make_interval(mins => $1::int), $2, $3, $4, $5, $6)`,
          [
            d.minutes_before,
            d.service,
            DEPLOY_KINDS.includes(d.kind) ? d.kind : 'code',
            d.from_version,
            d.to_version,
            d.summary
          ]
        );
      }
    } finally {
      await client.end();
    }
  }

  // Every branch must throw on failure. Never swallow an error here.
  private async executeStep(step: ScenarioStep): Promise<void> {
    const params = step.params ?? {};

    switch (step.action) {
      case 'run_sql': {
        const client = new Client({
          connectionString: ADMIN_DB_URL,
          application_name: params.async ? BACKGROUND_APP_NAME : undefined
        });
        await client.connect();
        if (params.async) {
          // Holds its connection (and locks) open until cancel_long_queries.
          this.backgroundClients.push(client);
          client.on('error', () => undefined);
          client.query(params.query).catch(() => undefined);
          return;
        }
        try {
          await client.query(params.query);
        } finally {
          await client.end();
        }
        return;
      }

      case 'cancel_long_queries': {
        const client = new Client({ connectionString: ADMIN_DB_URL });
        await client.connect();
        try {
          await client.query(
            'SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE application_name = $1 AND pid <> pg_backend_pid()',
            [BACKGROUND_APP_NAME]
          );
        } finally {
          await client.end();
        }
        return;
      }

      case 'stop_container':
        await this.container(step.target).stop();
        return;

      case 'start_container':
        await this.container(step.target).start();
        return;

      case 'exec_in_container': {
        const exec = await this.container(step.target).exec({
          Cmd: String(params.cmd).split(' '),
          AttachStdout: true,
          AttachStderr: true
        });
        const stream = await exec.start({});
        await new Promise<void>((resolve, reject) => {
          stream.on('end', resolve);
          stream.on('error', reject);
          stream.resume();
        });
        const { ExitCode } = await exec.inspect();
        if (ExitCode !== 0) {
          throw new Error(`Command "${params.cmd}" in ${step.target} exited with code ${ExitCode}`);
        }
        return;
      }

      default:
        throw new Error(`Unsupported action: ${step.action}`);
    }
  }

  // Names match container_name in infra/docker-compose.yml.
  private container(target: string): Docker.Container {
    return this.docker.getContainer(`rootcause-${target}`);
  }

  private async closeBackgroundClients(): Promise<void> {
    const clients = this.backgroundClients;
    this.backgroundClients = [];
    await Promise.all(clients.map(c => c.end().catch(() => undefined)));
  }
}
