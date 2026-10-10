// Connection settings for code that runs on the host (agent, tools, tracing).
// Defaults match infra/docker-compose.yml.

export const OPS_DB_URL =
  process.env.OPS_DB_URL || 'postgres://rootcause:rootcause_password@localhost:5432/ops';

const READONLY_BASE =
  process.env.AGENT_READONLY_DB_BASE || 'postgres://agent_readonly:agent_readonly@localhost:5432';

export type AgentDatabase = 'rootcause' | 'ops';

/** URL for the SELECT-only role. Every tool that reads a database must use this. */
export function readonlyDbUrl(database: AgentDatabase): string {
  return `${READONLY_BASE}/${database}`;
}
