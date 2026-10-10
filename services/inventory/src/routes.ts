import { Router } from 'express';
import { z } from 'zod';
import { query } from './db.js';
import { redis, cacheHitsTotal, cacheMissesTotal } from './redis.js';

export const router = Router();

const reserveSchema = z.object({
    quantity: z.number().min(1)
});

router.get('/products', async (req, res, next) => {
    try {
        const page = parseInt(req.query.page as string || '1');
        const limit = parseInt(req.query.limit as string || '20');
        const offset = (page - 1) * limit;
        
        const cacheKey = `products:page:${page}:limit:${limit}`;
        
        try {
            const cached = await redis.get(cacheKey);
            if (cached) {
                cacheHitsTotal.inc();
                 res.json(JSON.parse(cached));
                 return;
            }
        } catch (e) {
            // ignore redis error
        }
        cacheMissesTotal.inc();

        const result = await query('SELECT * FROM products ORDER BY id LIMIT $1 OFFSET $2', [limit, offset]);
        
        try {
            await redis.set(cacheKey, JSON.stringify(result.rows), 'EX', 60);
        } catch (e) {}
        
        res.json(result.rows);
    } catch (err) {
        next(err);
    }
});

router.get('/products/:id', async (req, res, next) => {
    try {
        const id = req.params.id;
        const cacheKey = `product:${id}`;
        
        try {
            const cached = await redis.get(cacheKey);
            if (cached) {
                cacheHitsTotal.inc();
                 res.json(JSON.parse(cached));
                 return;
            }
        } catch (e) {
            // ignore redis error
        }
        cacheMissesTotal.inc();
        
        const result = await query('SELECT * FROM products WHERE id = $1', [id]);
        if (result.rows.length === 0) {
             res.status(404).json({ error: 'Not found' });
             return;
        }
        
        try {
            await redis.set(cacheKey, JSON.stringify(result.rows[0]), 'EX', 60);
        } catch (e) {}

        res.json(result.rows[0]);
    } catch (err) {
        next(err);
    }
});

router.post('/products/:id/reserve', async (req, res, next) => {
    try {
        const { quantity } = reserveSchema.parse(req.body);
        const id = req.params.id;
        
        const result = await query(
            'UPDATE products SET stock = stock - $1 WHERE id = $2 AND stock >= $1 RETURNING stock',
            [quantity, id]
        );
        
        if (result.rows.length === 0) {
             res.json({ success: false });
             return;
        }
        
        try {
            await redis.del(`product:${id}`);
            // we should also invalidate products lists but for simplicity let's just do product
        } catch (e) {}
        
        res.json({ success: true, remaining: result.rows[0].stock });
    } catch (err) {
        next(err);
    }
});
