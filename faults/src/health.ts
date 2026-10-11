import axios from 'axios';

const PROMETHEUS_URL = process.env.PROMETHEUS_URL || 'http://localhost:9090';
const HEALTH_URLS = [3000, 3001, 3002, 3003].map(port => `http://localhost:${port}/healthz`);

export const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export interface Alert {
  name: string;
  service: string;
}

export async function firingAlerts(): Promise<Alert[]> {
  const res = await axios.get(`${PROMETHEUS_URL}/api/v1/alerts`, { timeout: 10000 });
  return (res.data?.data?.alerts ?? [])
    .filter((a: any) => a.state === 'firing')
    .map((a: any) => ({ name: a.labels.alertname, service: a.labels.job }));
}

async function servicesHealthy(): Promise<boolean> {
  for (const url of HEALTH_URLS) {
    try {
      const res = await axios.get(url, { timeout: 2000 });
      if (res.status !== 200 || res.data?.version !== '1.4.0') return false;
    } catch {
      return false;
    }
  }
  return true;
}

/** True when every service answers on its base version and no alert is firing. */
export async function isSettled(): Promise<boolean> {
  try {
    return (await servicesHealthy()) && (await firingAlerts()).length === 0;
  } catch {
    return false;
  }
}

export async function waitUntilSettled(timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isSettled()) return true;
    await delay(5000);
  }
  return false;
}

/** Waits for a specific alert to fire. Returns seconds waited, or null on timeout. */
export async function waitForAlert(expected: Alert, timeoutMs: number): Promise<number | null> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const alerts = await firingAlerts();
      if (alerts.some(a => a.name === expected.name && a.service === expected.service)) {
        return Math.round((Date.now() - start) / 1000);
      }
    } catch {
      // Prometheus may be briefly unreachable; keep waiting.
    }
    await delay(5000);
  }
  return null;
}
