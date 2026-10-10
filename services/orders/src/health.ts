import { Router } from 'express';
export const healthRouter = Router();

healthRouter.get('/healthz', (req, res) => {
    res.json({
        status: 'ok',
        service: process.env.SERVICE_NAME || 'unknown',
        version: process.env.SERVICE_VERSION || '1.4.0',
        uptime: process.uptime()
    });
});
