import { z } from 'zod';
import { Tool, ToolResult } from './types';
import { truncate } from './truncate';
import { v4 as uuid } from 'uuid';

const reportSchema = z.object({
  component: z.enum(['gateway', 'orders', 'inventory', 'payments', 'postgres', 'redis']),
  category: z.enum(['bad_code_deploy', 'dropped_index', 'memory_leak', 'wrong_config', 'dependency_down', 'redis_unavailable', 'connection_pool_exhaustion', 'slow_dependency', 'long_running_lock', 'bad_migration']),
  confidence: z.number().min(0).max(1),
  evidence: z.array(z.object({
    toolCallId: z.string(),
    description: z.string()
  })),
  explanation: z.string(),
  suggestedFix: z.string()
});

export const submitReportTool: Tool = {
  definition: {
    name: 'submit_report',
    description: 'Submit the final investigation report.',
    parameters: {
      type: 'object',
      properties: {
        component: { type: 'string' },
        category: { type: 'string' },
        confidence: { type: 'number' },
        evidence: { type: 'array', items: { type: 'object' } },
        explanation: { type: 'string' },
        suggestedFix: { type: 'string' }
      },
      required: ['component', 'category', 'confidence', 'evidence', 'explanation', 'suggestedFix']
    }
  },
  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    try {
      reportSchema.parse(args);
      const reportId = uuid();
      
      const result = { accepted: true, reportId };
      const json = JSON.stringify(result);
      const truncated = truncate(json);
      return {
        data: result,
        truncated: truncated.includes('[TRUNCATED')
      };
    } catch (e: any) {
      throw new Error(`Validation error: ${e.message}`);
    }
  }
};
