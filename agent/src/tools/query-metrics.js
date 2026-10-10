"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.queryMetricsTool = void 0;
const axios_1 = __importDefault(require("axios"));
const truncate_1 = require("./truncate");
exports.queryMetricsTool = {
    definition: {
        name: 'query_metrics',
        description: 'Queries Prometheus range query API for specific metrics.',
        parameters: {
            type: 'object',
            properties: {
                metric: {
                    type: 'string',
                    enum: ['error_rate', 'p95_latency', 'request_rate', 'memory', 'db_pool_waiting', 'db_query_p95', 'cache_hit_ratio', 'event_loop_lag'],
                    description: 'The metric to query.'
                },
                service: {
                    type: 'string',
                    description: 'Optional service name to filter by.'
                },
                minutes: {
                    type: 'number',
                    description: 'Time range in minutes. Default 30.'
                }
            },
            required: ['metric']
        }
    },
    async execute(args) {
        const metricName = args.metric;
        const service = args.service;
        const minutes = args.minutes || 30;
        const prometheusUrl = process.env.PROMETHEUS_URL || 'http://localhost:9090';
        const metricAllowlist = ['error_rate', 'p95_latency', 'request_rate', 'memory', 'db_pool_waiting', 'db_query_p95', 'cache_hit_ratio', 'event_loop_lag'];
        if (!metricAllowlist.includes(metricName)) {
            throw new Error(`Metric ${metricName} is not in the allowlist.`);
        }
        let promQL = '';
        const serviceSelector = service ? `{service="${service}"}` : '{}';
        switch (metricName) {
            case 'error_rate':
                promQL = `rate(http_requests_total${serviceSelector}[1m])`;
                break;
            case 'p95_latency':
                promQL = `histogram_quantile(0.95, rate(http_request_duration_seconds_bucket${serviceSelector}[1m]))`;
                break;
            default: promQL = `${metricName}${serviceSelector}`;
        }
        try {
            const end = Math.floor(Date.now() / 1000);
            const start = end - (minutes * 60);
            const step = Math.max(1, Math.floor((end - start) / 30)); // max 30 points
            const response = await axios_1.default.get(`${prometheusUrl}/api/v1/query_range`, {
                params: { query: promQL, start, end, step }
            });
            const resultData = response.data?.data?.result || [];
            const values = resultData[0]?.values?.map((v) => ({ time: v[0], value: parseFloat(v[1]) })) || [];
            let min = 0, max = 0, avg = 0, current = 0;
            if (values.length > 0) {
                const nums = values.map((v) => v.value).filter((v) => !isNaN(v));
                if (nums.length > 0) {
                    min = Math.min(...nums);
                    max = Math.max(...nums);
                    avg = nums.reduce((a, b) => a + b, 0) / nums.length;
                    current = nums[nums.length - 1];
                }
            }
            const result = {
                metric: metricName,
                service,
                period: `${minutes}m`,
                values,
                summary: {
                    min, max, avg, current, trend: 'stable' // Simplified trend logic
                }
            };
            const json = JSON.stringify(result);
            const truncated = (0, truncate_1.truncate)(json);
            return {
                data: result,
                truncated: truncated.includes('[TRUNCATED')
            };
        }
        catch (error) {
            return {
                data: { error: error.message },
                truncated: false
            };
        }
    }
};
