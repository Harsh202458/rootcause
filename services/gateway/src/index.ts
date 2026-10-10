import express from 'express';
import pino from 'pino';
import pinoHttp from 'pino-http';
import { v4 as uuidv4 } from 'uuid';
import promClient from 'prom-client';
import { healthRouter } from './health.js';
import { router } from './routes.js';

const app = express();
const logger = pino({ name: 'gateway' });
const port = process.env.GATEWAY_PORT || 3000;

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

app.use(express.json());
app.use((req, res, next) => {
    req.headers['x-request-id'] = req.headers['x-request-id'] || uuidv4();
    next();
});

app.use(pinoHttp({
    logger,
    genReqId: req => req.headers['x-request-id'] as string,
    customProps: (req, res) => ({
        service: 'gateway',
        version: process.env.SERVICE_VERSION || '1.4.0',
        route: req.url
    })
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
    logger.info(`Gateway service listening on port ${port}`);
});

process.on('SIGTERM', () => {
    logger.info('SIGTERM signal received: closing HTTP server');
    server.close(() => logger.info('HTTP server closed'));
});
