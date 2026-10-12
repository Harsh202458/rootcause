import express, { NextFunction, Request, RequestHandler, Response } from 'express';
import client from 'prom-client';
import { randomUUID } from 'crypto';
import { Pool } from 'pg';

export const SERVICE = process.env.SERVICE || 'unknown';
export const VERSION = process.env.SERVICE_VERSION || '1.4.0';

client.collectDefaultMetrics();

const httpRequests = new client.Counter({
  name: 'http_requests_total',
  help: 'HTTP requests handled',
  labelNames: ['method', 'route', 'status']
});
const httpDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration',
  labelNames: ['route'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10]
});

// ---------------------------------------------------------------------------
// Logging: every line goes to stdout and, in batches, to the ops.logs table.
// The log database is configured separately from the application database so
// logs keep flowing when the service cannot reach its own data.
// ---------------------------------------------------------------------------

type Level = 'info' | 'warn' | 'error';

interface LogRow {
  ts: string;
  level: Level;
  requestId: string | null;
  route: string | null;
  status: number | null;
  durationMs: number | null;
  message: string;
  error: string | null;
}

const MAX_BUFFERED = 5000;
const buffer: LogRow[] = [];
const logPool = process.env.LOG_DB_URL
  ? new Pool({
      connectionString: process.env.LOG_DB_URL,
      max: 1,
      // Keep the connection open: reconnecting needs a DNS lookup, and those
      // queue behind the service's own failing lookups during an incident.
      idleTimeoutMillis: 0,
      connectionTimeoutMillis: 10000
    })
  : null;
logPool?.on('error', () => undefined);

let flushing = false;

async function flushLogs(): Promise<void> {
  if (!logPool || buffer.length === 0 || flushing) return;
  flushing = true;
  const rows = buffer.splice(0, 500);
  try {
    await logPool.query(
      `INSERT INTO logs (ts, service, version, level, request_id, route, status, duration_ms, message, error)
       SELECT * FROM unnest($1::timestamptz[], $2::text[], $3::text[], $4::text[], $5::text[],
                            $6::text[], $7::int[], $8::int[], $9::text[], $10::text[])`,
      [
        rows.map(r => r.ts),
        rows.map(() => SERVICE),
        rows.map(() => VERSION),
        rows.map(r => r.level),
        rows.map(r => r.requestId),
        rows.map(r => r.route),
        rows.map(r => r.status),
        rows.map(r => r.durationMs),
        rows.map(r => r.message),
        rows.map(r => r.error)
      ]
    );
  } catch {
    // Put the batch back so an outage of the log store does not lose lines.
    if (buffer.length + rows.length <= MAX_BUFFERED) buffer.unshift(...rows);
  } finally {
    flushing = false;
  }
}
setInterval(flushLogs, 1000).unref();

function write(row: LogRow): void {
  console.log(JSON.stringify({ service: SERVICE, version: VERSION, ...row }));
  if (buffer.length < MAX_BUFFERED) buffer.push(row);
}

function describeError(err: unknown): string | null {
  if (!err) return null;
  const e = err as Error;
  const stack = (e.stack || String(e)).split('\n').slice(0, 4).join('\n');
  return stack.slice(0, 1000);
}

const lastLogged = new Map<string, number>();

/** Logs something that is not tied to one request. Repeats are limited to one per 5 seconds. */
export function logEvent(level: Level, message: string, err?: unknown): void {
  const now = Date.now();
  if (now - (lastLogged.get(message) ?? 0) < 5000) return;
  lastLogged.set(message, now);
  write({
    ts: new Date().toISOString(),
    level,
    requestId: null,
    route: null,
    status: null,
    durationMs: null,
    message,
    error: describeError(err)
  });
}

// ---------------------------------------------------------------------------
// HTTP application
// ---------------------------------------------------------------------------

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** Wraps an async handler so a rejection reaches the error handler. */
export function h(fn: (req: Request, res: Response) => Promise<unknown>): RequestHandler {
  return (req, res, next) => {
    fn(req, res).catch(next);
  };
}

export function createApp(): express.Express {
  const app = express();
  app.use(express.json());

  app.get('/healthz', (_req, res) => {
    res.json({ status: 'ok', service: SERVICE, version: VERSION, uptime: process.uptime() });
  });
  app.get('/metrics', async (_req, res) => {
    res.set('Content-Type', client.register.contentType);
    res.end(await client.register.metrics());
  });

  app.use((req, res, next) => {
    if (req.path.startsWith('/internal')) return next();

    const requestId = (req.headers['x-request-id'] as string) || randomUUID();
    res.locals.requestId = requestId;
    const start = process.hrtime.bigint();

    res.on('finish', () => {
      const route = req.route ? `${req.baseUrl}${req.route.path}` : 'unmatched';
      const seconds = Number(process.hrtime.bigint() - start) / 1e9;
      httpRequests.inc({ method: req.method, route, status: res.statusCode });
      httpDuration.observe({ route }, seconds);

      const level: Level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
      write({
        ts: new Date().toISOString(),
        level,
        requestId,
        route: `${req.method} ${route}`,
        status: res.statusCode,
        durationMs: Math.round(seconds * 1000),
        message: `${req.method} ${route} ${res.statusCode}`,
        error: describeError(res.locals.error)
      });
    });
    next();
  });

  return app;
}

/** Call after all routes are registered. */
export function start(app: express.Express, port: number): void {
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err instanceof HttpError ? err.status : 500;
    if (status >= 500) res.locals.error = err;
    res.status(status).json({ error: status >= 500 ? 'Internal server error' : err.message });
  });

  app.listen(port, () => logEvent('info', `${SERVICE} ${VERSION} listening on ${port}`));
  process.on('SIGTERM', () => process.exit(0));
}
