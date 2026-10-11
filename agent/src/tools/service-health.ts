import Docker from 'dockerode';
import axios from 'axios';
import { Tool, ToolResult } from './types';

const PREFIX = 'rootcause-';
const COMPONENTS = ['gateway', 'orders', 'inventory', 'payments', 'postgres', 'redis'];
const HEALTH_PORTS: Record<string, number> = { gateway: 3000, orders: 3001, inventory: 3002, payments: 3003 };

function age(since: string): string {
  const seconds = Math.max(0, Math.round((Date.now() - new Date(since).getTime()) / 1000));
  if (seconds < 120) return `${seconds}s`;
  if (seconds < 7200) return `${Math.round(seconds / 60)}m`;
  return `${Math.round(seconds / 3600)}h`;
}

async function runningVersion(component: string): Promise<string | undefined> {
  const port = HEALTH_PORTS[component];
  if (!port) return undefined;
  try {
    const res = await axios.get(`http://localhost:${port}/healthz`, { timeout: 2000 });
    return res.data?.version;
  } catch {
    return 'health check failed';
  }
}

async function describe(docker: Docker, component: string) {
  const container = docker.getContainer(`${PREFIX}${component}`);
  let info;
  try {
    info = await container.inspect();
  } catch {
    return { component, state: 'not found' };
  }

  // Deliberately omits environment variables and labels.
  const state = info.State;
  const result: Record<string, unknown> = {
    component,
    state: state.Paused ? 'paused' : state.Status,
    restartCount: info.RestartCount,
    oomKilled: state.OOMKilled,
    lastExitCode: state.ExitCode
  };

  if (state.Running) {
    result.runningFor = age(state.StartedAt);
    result.version = await runningVersion(component);
    if (!state.Paused) {
      try {
        const stats: any = await container.stats({ stream: false });
        const usage = stats.memory_stats?.usage ?? 0;
        const limit = stats.memory_stats?.limit ?? 0;
        result.memoryMB = Math.round(usage / 1048576);
        result.memoryLimitMB = Math.round(limit / 1048576);
        result.memoryPercent = limit ? Math.round((usage / limit) * 100) : undefined;
      } catch {
        // Stats are a nice-to-have.
      }
    }
  } else {
    result.stoppedFor = age(state.FinishedAt);
  }
  return result;
}

export const serviceHealthTool: Tool = {
  definition: {
    name: 'service_health',
    description:
      'Shows each component (gateway, orders, inventory, payments, postgres, redis): whether it is running, stopped or paused, ' +
      'how long it has been up, how many times it has restarted, whether it was killed for running out of memory, ' +
      'its memory use against its limit, and the version it reports. Optionally pass one component.',
    parameters: {
      type: 'object',
      properties: {
        service: { type: 'string', enum: COMPONENTS }
      }
    }
  },
  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const wanted = args.service ? [String(args.service)] : COMPONENTS;
    const unknown = wanted.filter(c => !COMPONENTS.includes(c));
    if (unknown.length > 0) throw new Error(`Unknown component: ${unknown.join(', ')}`);

    try {
      const docker = new Docker();
      const data = await Promise.all(wanted.map(c => describe(docker, c)));
      return { data, truncated: false };
    } catch (error: any) {
      return { data: { error: error.message }, truncated: false };
    }
  }
};
