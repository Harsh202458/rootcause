import express from 'express';
import pino from 'pino';
import pinoHttp from 'pino-http';
import { v4 as uuidv4 } from 'uuid';
import promClient from 'prom-client';
import { healthRouter } from './health.js';
import { router } from './routes.js';
import { pool } from './db.js';

const app = express();
const logger = pino({ name: 'orders' });
const port = process.env.ORDERS_PORT || 3001;

promClient.collectDefaultMetrics();
const httpRequestsTotal = new promClient.Counter({
    name: 'http_requests_total',
    help: 'Total number of HTTP requests',
    labelNames: ['method', 'route', 'status']
});
const httpRequestDurationSeconds = new promClient.Histogram({
    name: 'http_request_duration_seconds',
    help: 'Duration of HTTP requests in seconds',
    labelNames: ['method', 'route']
});
const dbPoolSize = new promClient.Gauge({ name: 'db_pool_size', help: 'DB Pool Size' });
const dbPoolActive = new promClient.Gauge({ name: 'db_pool_active', help: 'DB Pool Active' });
const dbPoolIdle = new promClient.Gauge({ name: 'db_pool_idle', help: 'DB Pool Idle' });
const dbPoolWaiting = new promClient.Gauge({ name: 'db_pool_waiting', help: 'DB Pool Waiting' });

setInterval(() => {
    dbPoolSize.set(pool.totalCount);
    dbPoolActive.set(pool.totalCount - pool.idleCount);
    dbPoolIdle.set(pool.idleCount);
    dbPoolWaiting.set(pool.waitingCount);
}, 5000);

app.use(express.json());
app.use((req, res, next) => {
    req.headers['x-request-id'] = req.headers['x-request-id'] || uuidv4();
    next();
});

app.use(pinoHttp({
    logger,
    genReqId: req => req.headers['x-request-id'] as string,
    customProps: (req, res) => ({ service: 'orders', version: process.env.SERVICE_VERSION || '1.4.0' })
}));

app.use((req, res, next) => {
    const end = httpRequestDurationSeconds.startTimer();
    res.on('finish', () => {
        httpRequestsTotal.inc({ method: req.method, route: req.route?.path || req.path, status: res.statusCode });
        end({ method: req.method, route: req.route?.path || req.path });
    });
    next();
});

app.get('/metrics', async (req, res) => {
    res.set('Content-Type', promClient.register.contentType);
    res.end(await promClient.register.metrics());
});

app.use(healthRouter);
app.use(router);

app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    logger.error({ err }, 'Unhandled error');
    res.status(500).json({ error: 'Internal server error' });
});

const server = app.listen(port, () => {
    logger.info(`Orders service listening on port ${port}`);
});

process.on('SIGTERM', async () => {
    logger.info('SIGTERM signal received');
    server.close(() => logger.info('HTTP server closed'));
    await pool.end();
});
