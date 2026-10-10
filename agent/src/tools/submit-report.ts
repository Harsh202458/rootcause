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

// The agent loop intercepts this tool and validates the report itself (it needs
// the list of tool calls made in the run). execute() exists for the tool CLI.
export const submitReportTool: Tool = {
  definition: {
    name: 'submit_report',
    description:
      'Submit the final root-cause report and end the investigation. Every evidence item must cite the id of a tool call made earlier in this investigation.',
    parameters: {
      type: 'object',
      properties: {
        component: { type: 'string', enum: [...COMPONENTS], description: 'Where the root cause is.' },
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
