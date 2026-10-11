import axios from 'axios';
import { Tool, ToolResult } from './types';

export interface FiringAlert {
  name: string;
  service: string;
  severity: string;
  firingSince: string;
  summary: string;
}

export async function firingAlerts(): Promise<FiringAlert[]> {
  const prometheusUrl = process.env.PROMETHEUS_URL || 'http://localhost:9090';
  const response = await axios.get(`${prometheusUrl}/api/v1/alerts`, { timeout: 10000 });
  return (response.data?.data?.alerts ?? [])
    .filter((a: any) => a.state === 'firing')
    .map((a: any) => ({
      name: a.labels.alertname,
      service: a.labels.job,
      severity: a.labels.severity,
      firingSince: a.activeAt,
      summary: a.annotations?.summary ?? ''
    }));
}

export const listAlertsTool: Tool = {
  definition: {
    name: 'list_alerts',
    description:
      'Lists every alert firing right now, with the service it fires on and since when. ' +
      'Alerts describe symptoms; several services can alert because of one underlying cause.',
    parameters: { type: 'object', properties: {} }
  },
  async execute(): Promise<ToolResult> {
    try {
      return { data: await firingAlerts(), truncated: false };
    } catch (error: any) {
      return { data: { error: error.message }, truncated: false };
    }
  }
};
