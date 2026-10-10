import { Tool, ToolDefinition, ToolResult } from './types';
import { listAlertsTool } from './list-alerts';
import { serviceHealthTool } from './service-health';
import { queryMetricsTool } from './query-metrics';
import { queryLogsTool } from './query-logs';
import { recentDeploysTool } from './recent-deploys';
import { runSqlReadonlyTool } from './run-sql-readonly';
import { proposeFixTool } from './propose-fix';
import { submitReportTool } from './submit-report';

const tools: Tool[] = [
  listAlertsTool,
  serviceHealthTool,
  queryMetricsTool,
  queryLogsTool,
  recentDeploysTool,
  runSqlReadonlyTool,
  proposeFixTool,
  submitReportTool
];

export function getToolDefinitions(): ToolDefinition[] {
  return tools.map(t => t.definition);
}

export function getToolByName(name: string): Tool | undefined {
  return tools.find(t => t.definition.name === name);
}

export async function executeTool(name: string, args: Record<string, unknown>): Promise<ToolResult> {
  const tool = getToolByName(name);
  if (!tool) {
    throw new Error(`Tool ${name} not found`);
  }
  return tool.execute(args);
}
