import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'yaml';
import axios from 'axios';
import Docker from 'dockerode';
import { Client } from 'pg';
import { compose } from './docker';

const ADMIN_DB_URL =
  process.env.ADMIN_DB_URL || 'postgres://rootcause:rootcause_password@localhost:5432/rootcause';
const OPS_DB_URL = process.env.OPS_DB_URL || 'postgres://rootcause:rootcause_password@localhost:5432/ops';

// Sessions that hold a lock open are tagged with this name so revert can find
// them. It is deliberately neutral: the agent can see it in pg_stat_activity.
const BACKGROUND_APP_NAME = 'batch-worker';
const NETWORK = 'infra_rootcause';

const DEPLOY_KINDS = ['code', 'config', 'migration'];
const RELEASABLE = ['gateway', 'orders', 'inventory', 'payments'];
// Settings a config deploy may change. Each maps to <SERVICE>_<NAME> in docker-compose.yml.
const CONFIG_KEYS = ['POSTGRES_HOST', 'REDIS_HOST'];

export interface ScenarioStep {
  action: string;
  target: string;
  params?: Record<string, any>;
}

export interface DeployEvent {
  service: string;
  kind: string;
  from_version?: string;
  to_version?: string;
  summary: string;
  diff_summary?: string;
  minutes_before: number;
}

export interface Scenario {
  id: string;
  alert: { name: string; labels: { service: string; severity: string }; description: string };
  inject: ScenarioStep[];
  revert: ScenarioStep[];
  warmup_seconds: number;
  ground_truth: { component: string; category: string; evidence: string[] };
  /** Deploy history written when the scenario starts: the culprit, if any, and harmless ones. */
  deploys?: DeployEvent[];
}

export function loadScenario(scenarioId: string, scenariosDir: string): Scenario {
  const scenarioPath = path.join(scenariosDir, `${scenarioId}.yaml`);
  if (!fs.existsSync(scenarioPath)) {
    throw new Error(`Scenario ${scenarioId} not found at ${scenarioPath}`);
  }
  return yaml.parse(fs.readFileSync(scenarioPath, 'utf8')) as Scenario;
}

type Handler = (injector: Injector, step: ScenarioStep) => Promise<void>;

// Every handler must throw on failure. An injection that silently does nothing
// would make the eval score meaningless.
const HANDLERS: Record<string, Handler> = {
  /** Releases a service: recreates its container with a new version and/or settings. */
  async deploy(_injector, step) {
    if (!RELEASABLE.includes(step.target)) throw new Error(`Cannot deploy ${step.target}`);
    const params = step.params ?? {};
    const prefix = step.target.toUpperCase();
    const env: Record<string, string> = {};
    if (params.version) env[`${prefix}_VERSION`] = String(params.version);
    for (const [key, value] of Object.entries(params.env ?? {})) {
      if (!CONFIG_KEYS.includes(key)) throw new Error(`Unsupported setting ${key}`);
      env[`${prefix}_${key}`] = String(value);
    }
    compose(['up', '-d', '--no-deps', '--force-recreate', step.target], env);
  },

  async run_sql(injector, step) {
    const params = step.params ?? {};
    const client = new Client({
      connectionString: ADMIN_DB_URL,
      application_name: params.hold_open ? BACKGROUND_APP_NAME : undefined
    });
    await client.connect();
    if (params.hold_open) {
      // The session keeps its transaction (and locks) until release_sessions.
      injector.heldSessions.push(client);
      client.on('error', () => undefined);
      await client.query(params.query);
      return;
    }
    try {
      await client.query(params.query);
    } finally {
      await client.end();
    }
  },

  async release_sessions(injector) {
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
    await injector.closeHeldSessions();
  },

  async stop_container(injector, step) {
    await injector.container(step.target).stop();
  },
  async start_container(injector, step) {
    await injector.container(step.target).start();
  },
  async pause_container(injector, step) {
    await injector.container(step.target).pause();
  },
  async unpause_container(injector, step) {
    await injector.container(step.target).unpause();
  },
  async disconnect_network(injector, step) {
    await injector.docker.getNetwork(NETWORK).disconnect({ Container: `rootcause-${step.target}`, Force: true });
  },
  async connect_network(injector, step) {
    await injector.docker.getNetwork(NETWORK).connect({
      Container: `rootcause-${step.target}`,
      EndpointConfig: { Aliases: [step.target] }
    });
  },

  /** Calls an operator endpoint on a service (published on localhost). */
  async http_post(_injector, step) {
    const params = step.params ?? {};
    await axios.post(`http://localhost:${params.port}${params.path}`, params.body ?? {}, { timeout: 5000 });
  }
};

export const SUPPORTED_ACTIONS: ReadonlySet<string> = new Set(Object.keys(HANDLERS));

/** Actions used by a scenario that the injector cannot perform. */
export function unsupportedActions(scenario: Scenario): string[] {
  const actions = [...scenario.inject, ...scenario.revert].map(s => s.action);
  return [...new Set(actions.filter(a => !SUPPORTED_ACTIONS.has(a)))];
}

export class Injector {
  docker: Docker;
  heldSessions: Client[] = [];

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
      await this.execute(step);
    }
  }

  public async revert(scenarioId: string, scenariosDir: string): Promise<void> {
    const scenario = loadScenario(scenarioId, scenariosDir);
    this.assertSupported(scenario);

    // Run every revert step even if one fails, then report the first failure.
    let failure: unknown;
    for (const step of scenario.revert) {
      try {
        await this.execute(step);
      } catch (err) {
        failure ??= err;
      }
    }
    await this.closeHeldSessions();
    await this.removeDeploys(scenario);
    if (failure) throw failure;
  }

  private assertSupported(scenario: Scenario): void {
    const missing = unsupportedActions(scenario);
    if (missing.length > 0) {
      throw new Error(`${scenario.id} uses actions the injector does not implement: ${missing.join(', ')}`);
    }
  }

  private async execute(step: ScenarioStep): Promise<void> {
    const handler = HANDLERS[step.action];
    if (!handler) throw new Error(`Unsupported action: ${step.action}`);
    await handler(this, step);
  }

  private async recordDeploys(scenario: Scenario): Promise<void> {
    const deploys = scenario.deploys ?? [];
    if (deploys.length === 0) return;

    const client = new Client({ connectionString: OPS_DB_URL });
    await client.connect();
    try {
      for (const d of deploys) {
        if (!DEPLOY_KINDS.includes(d.kind)) throw new Error(`${scenario.id}: unknown deploy kind ${d.kind}`);
        await client.query(
          `INSERT INTO deploy_events (timestamp, service, kind, from_version, to_version, summary, diff_summary)
           VALUES (NOW() - make_interval(mins => $1::int), $2, $3, $4, $5, $6, $7)`,
          [d.minutes_before, d.service, d.kind, d.from_version ?? null, d.to_version ?? null, d.summary, d.diff_summary ?? null]
        );
      }
    } finally {
      await client.end();
    }
  }

  /** Removes this scenario's deploy history so it cannot mislead the next one. */
  private async removeDeploys(scenario: Scenario): Promise<void> {
    const deploys = scenario.deploys ?? [];
    if (deploys.length === 0) return;

    const client = new Client({ connectionString: OPS_DB_URL });
    await client.connect();
    try {
      for (const d of deploys) {
        await client.query(
          `DELETE FROM deploy_events
           WHERE service = $1 AND summary = $2 AND timestamp > NOW() - interval '12 hours'`,
          [d.service, d.summary]
        );
      }
    } finally {
      await client.end();
    }
  }

  // Names match container_name in infra/docker-compose.yml.
  container(target: string): Docker.Container {
    return this.docker.getContainer(`rootcause-${target}`);
  }

  async closeHeldSessions(): Promise<void> {
    const clients = this.heldSessions;
    this.heldSessions = [];
    await Promise.all(clients.map(c => c.end().catch(() => undefined)));
  }
}
