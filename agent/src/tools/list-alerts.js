"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.listAlertsTool = void 0;
const axios_1 = __importDefault(require("axios"));
const truncate_1 = require("./truncate");
exports.listAlertsTool = {
    definition: {
        name: 'list_alerts',
        description: 'Queries Prometheus API for active alerts.',
        parameters: {
            type: 'object',
            properties: {},
            required: []
        }
    },
    async execute(args) {
        const prometheusUrl = process.env.PROMETHEUS_URL || 'http://localhost:9090';
        try {
            const response = await axios_1.default.get(`${prometheusUrl}/api/v1/alerts`);
            const alerts = response.data?.data?.alerts || [];
            const formattedAlerts = alerts.map((alert) => ({
                alertname: alert.labels.alertname,
                labels: alert.labels,
                state: alert.state,
                activeAt: alert.activeAt,
                value: alert.value,
                description: alert.annotations?.description || ''
            }));
            const json = JSON.stringify(formattedAlerts);
            const truncated = (0, truncate_1.truncate)(json);
            return {
                data: formattedAlerts,
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
