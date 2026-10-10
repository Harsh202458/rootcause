"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.submitReportTool = void 0;
const zod_1 = require("zod");
const truncate_1 = require("./truncate");
const uuid_1 = require("uuid");
const reportSchema = zod_1.z.object({
    component: zod_1.z.enum(['gateway', 'orders', 'inventory', 'payments', 'postgres', 'redis']),
    category: zod_1.z.enum(['bad_code_deploy', 'dropped_index', 'memory_leak', 'wrong_config', 'dependency_down', 'redis_unavailable', 'connection_pool_exhaustion', 'slow_dependency', 'long_running_lock', 'bad_migration']),
    confidence: zod_1.z.number().min(0).max(1),
    evidence: zod_1.z.array(zod_1.z.object({
        toolCallId: zod_1.z.string(),
        description: zod_1.z.string()
    })),
    explanation: zod_1.z.string(),
    suggestedFix: zod_1.z.string()
});
exports.submitReportTool = {
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
    async execute(args) {
        try {
            reportSchema.parse(args);
            const reportId = (0, uuid_1.v4)();
            const result = { accepted: true, reportId };
            const json = JSON.stringify(result);
            const truncated = (0, truncate_1.truncate)(json);
            return {
                data: result,
                truncated: truncated.includes('[TRUNCATED')
            };
        }
        catch (e) {
            throw new Error(`Validation error: ${e.message}`);
        }
    }
};
