import { z } from 'zod';
import { Tool, ToolResult } from './types';

export const COMPONENTS = ['gateway', 'orders', 'inventory', 'payments', 'postgres', 'redis'] as const;

export const CATEGORIES = [
  'bad_code_deploy',
  'dropped_index',
  'memory_leak',
  'wrong_config',
  'dependency_down',
  'redis_unavailable',
  'connection_pool_exhaustion',
  'slow_dependency',
  'long_running_lock',
  'bad_migration'
] as const;

export const reportSchema = z.object({
  component: z.enum(COMPONENTS),
  category: z.enum(CATEGORIES),
  confidence: z.number().min(0).max(1),
  evidence: z.array(
    z.object({
      toolCallId: z.string(),
      description: z.string()
    })
  ),
  explanation: z.string(),
  suggestedFix: z.string()
});

export type Report = z.infer<typeof reportSchema>;

// The rubric the eval scores against. The model needs it to answer in the
// same terms; it describes mechanisms, not any particular incident.
const DESCRIPTION = `Submit the final root-cause report and end the investigation. Every evidence item must cite the id of a tool call made earlier in this investigation.
component is where the root cause lies and the fix must be applied, which is often not where the symptom shows.
category is the failure mechanism. Pick the most specific one that the evidence supports. A release can be what introduced a leak, a connection leak or slowness; in those cases name that mechanism, not bad_code_deploy.
- bad_code_deploy: a newly deployed version throws exceptions while handling requests (for example a TypeError), and nothing more specific below applies. Component: that service.
- memory_leak: a service keeps growing in memory until it is killed and restarted. Component: that service.
- slow_dependency: a service answers slowly because of its own processing (high CPU or event loop lag) or a slow external provider, and delays its callers. Its database queries are not the slow part. Component: the slow service.
- connection_pool_exhaustion: a service's database connections are checked out and never returned, so requests queue or time out waiting for one, while the database itself is healthy and reachable. Component: that service.
- wrong_config: a service was given a wrong setting (for example the address of its database or cache) and cannot reach a dependency that is itself healthy. Component: the misconfigured service.
- dependency_down: a service is stopped or unreachable and its callers fail. Component: the service that is down.
- redis_unavailable: Redis itself is stopped, frozen or cut off. Component: redis.
- dropped_index: a database index is missing and queries that relied on it are slow. Component: postgres.
- long_running_lock: a database session holds a lock that blocks other queries. Component: postgres.
- bad_migration: a schema change broke queries that services run. Component: postgres.`;

// The agent loop intercepts this tool and validates the report itself (it needs
// the list of tool calls made in the run). execute() exists for the tool CLI.
export const submitReportTool: Tool = {
  definition: {
    name: 'submit_report',
    description: DESCRIPTION,
    parameters: {
      type: 'object',
      properties: {
        component: { type: 'string', enum: [...COMPONENTS] },
        category: { type: 'string', enum: [...CATEGORIES] },
        confidence: { type: 'number', description: 'Between 0 and 1.' },
        evidence: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              toolCallId: { type: 'string' },
              description: { type: 'string' }
            },
            required: ['toolCallId', 'description']
          }
        },
        explanation: { type: 'string' },
        suggestedFix: { type: 'string' }
      },
      required: ['component', 'category', 'confidence', 'evidence', 'explanation', 'suggestedFix']
    }
  },
  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const parsed = reportSchema.safeParse(args);
    if (!parsed.success) {
      throw new Error(`Validation error: ${parsed.error.message}`);
    }
    return { data: { accepted: true }, truncated: false };
  }
};
