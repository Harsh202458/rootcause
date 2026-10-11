import axios from 'axios';
import { Tool, ToolResult } from './types';

const SERVICES = ['gateway', 'orders', 'inventory', 'payments'];

// The model picks a named metric; it never writes PromQL. `$sel` is replaced
// with a label selector for the requested service (or all services).
const METRICS: Record<string, { query: string; unit: string; help: string }> = {
  error_rate: {
    query: 'sum by (job) (rate(http_requests_total{status=~"5.."$sel}[1m])) / sum by (job) (rate(http_requests_total{$sel}[1m]))',
    unit: 'ratio',
    help: 'share of requests answered with 5xx'
  },
  error_rate_by_route: {
    query: 'sum by (job, route) (rate(http_requests_total{status=~"5.."$sel}[1m]))',
    unit: '5xx/s',
    help: '5xx responses per second, per route'
  },
  request_rate: {
    query: 'sum by (job) (rate(http_requests_total{$sel}[1m]))',
    unit: 'req/s',
    help: 'requests handled per second'
  },
  p95_latency: {
    query: 'histogram_quantile(0.95, sum by (le, job) (rate(http_request_duration_seconds_bucket{$sel}[1m])))',
    unit: 'seconds',
    help: '95th percentile request duration'
  },
  p95_latency_by_route: {
    query: 'histogram_quantile(0.95, sum by (le, job, route) (rate(http_request_duration_seconds_bucket{$sel}[1m])))',
    unit: 'seconds',
    help: '95th percentile request duration, per route'
  },
  memory: { query: 'process_resident_memory_bytes{$sel} / 1e6', unit: 'MB', help: 'resident memory of the process' },
  event_loop_lag: {
    query: 'nodejs_eventloop_lag_p99_seconds{$sel}',
    unit: 'seconds',
    help: 'how long the service is blocked on CPU work'
  },
  db_pool_in_use: { query: 'db_pool_in_use{$sel}', unit: 'connections', help: 'database connections checked out' },
  db_pool_waiting: {
    query: 'db_pool_waiting{$sel}',
    unit: 'requests',
    help: 'requests queued waiting for a database connection'
  },
  db_query_p95: {
    query: 'histogram_quantile(0.95, sum by (le, job) (rate(db_query_duration_seconds_bucket{$sel}[1m])))',
    unit: 'seconds',
    help: '95th percentile database query duration'
  },
  cache_hit_ratio: {
    query: 'sum by (job) (rate(cache_hits_total{$sel}[1m])) / (sum by (job) (rate(cache_hits_total{$sel}[1m])) + sum by (job) (rate(cache_misses_total{$sel}[1m])))',
    unit: 'ratio',
    help: 'share of product reads served from the cache'
  },
  up: { query: 'up{$sel}', unit: '1 = scraped, 0 = unreachable', help: 'whether the service answers its metrics endpoint' }
};

const round = (n: number) => Number(n.toPrecision(4));

export function buildQuery(metric: string, service?: string): string {
  const def = METRICS[metric];
  if (!def) throw new Error(`Metric ${metric} is not in the allowlist.`);
  if (service && !SERVICES.includes(service)) {
    throw new Error(`Unknown service ${service}. Metrics exist for: ${SERVICES.join(', ')}.`);
  }
  const sel = service ? `job="${service}"` : '';
  // `{status=~"5.."$sel}` needs a comma before the extra matcher, `{$sel}` does not.
  return def.query.replace(/"\$sel/g, sel ? `",${sel}` : '"').replace(/\$sel/g, sel);
}

/** Reduces a series to its shape: start, lowest, highest, latest and a few points. */
export function summarise(values: Array<[number, string]>, endSeconds: number) {
  const points = values
    .map(([t, v]) => ({ t, v: parseFloat(v) }))
    .filter(p => Number.isFinite(p.v));
  if (points.length === 0) return null;

  const nums = points.map(p => p.v);
  const stride = Math.max(1, Math.ceil(points.length / 8));
  return {
    first: round(nums[0]!),
    min: round(Math.min(...nums)),
    max: round(Math.max(...nums)),
    latest: round(nums[nums.length - 1]!),
    points: points
      .filter((_, i) => i % stride === 0 || i === points.length - 1)
      .map(p => {
        const ago = endSeconds - p.t;
        return `${ago < 600 ? `${ago}s` : `${Math.round(ago / 60)}m`} ago: ${round(p.v)}`;
      })
  };
}

export const queryMetricsTool: Tool = {
  definition: {
    name: 'query_metrics',
    description:
      'Reads one metric over the last N minutes (default 15) for one service or all of them. Metrics: ' +
      Object.entries(METRICS).map(([name, m]) => `${name} (${m.help})`).join('; ') +
      '. Metrics exist for gateway, orders, inventory and payments. A service that is missing from the result reported no data in that period.',
    parameters: {
      type: 'object',
      properties: {
        metric: { type: 'string', enum: Object.keys(METRICS) },
        service: { type: 'string', enum: SERVICES },
        minutes: { type: 'number' }
      },
      required: ['metric']
    }
  },
  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const metric = String(args.metric);
    const service = args.service ? String(args.service) : undefined;
    const query = buildQuery(metric, service);
    const minutes = Math.min(Math.max(Number(args.minutes) || 15, 1), 120);
    const prometheusUrl = process.env.PROMETHEUS_URL || 'http://localhost:9090';

    try {
      const end = Math.floor(Date.now() / 1000);
      const start = end - minutes * 60;
      const step = Math.max(5, Math.floor((minutes * 60) / 40));
      const response = await axios.get(`${prometheusUrl}/api/v1/query_range`, {
        params: { query, start, end, step },
        timeout: 10000
      });

      const series = (response.data?.data?.result ?? [])
        .map((s: any) => {
          const summary = summarise(s.values, end);
          return summary && { service: s.metric.job, route: s.metric.route, ...summary };
        })
        .filter(Boolean)
        .sort((a: any, b: any) => b.max - a.max)
        .slice(0, 12);

      return { data: { metric, unit: METRICS[metric]!.unit, period: `${minutes}m`, series }, truncated: false };
    } catch (error: any) {
      return { data: { error: error.message }, truncated: false };
    }
  }
};
