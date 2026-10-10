import axios from 'axios';
import { Tool, ToolResult } from './types';
import { truncate } from './truncate';

export const listAlertsTool: Tool = {
  definition: {
    name: 'list_alerts',
    description: 'Queries Prometheus API for active alerts.',
    parameters: {
      type: 'object',
      properties: {},
      required: []
    }
  },
  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const prometheusUrl = process.env.PROMETHEUS_URL || 'http://localhost:9090';
    try {
      const response = await axios.get(`${prometheusUrl}/api/v1/alerts`);
      const alerts = response.data?.data?.alerts || [];
      const formattedAlerts = alerts.map((alert: any) => ({
        alertname: alert.labels.alertname,
        labels: alert.labels,
        state: alert.state,
        activeAt: alert.activeAt,
        value: alert.value,
        description: alert.annotations?.description || ''
      }));
      
      const json = JSON.stringify(formattedAlerts);
      const truncated = truncate(json);
      return {
        data: formattedAlerts,
        truncated: truncated.includes('[TRUNCATED')
      };
    } catch (error: any) {
      return {
        data: { error: error.message },
        truncated: false
      };
    }
  }
};
