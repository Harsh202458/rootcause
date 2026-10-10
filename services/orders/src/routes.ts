import { Router } from 'express';
import { z } from 'zod';
import { query } from './db.js';

export const router = Router();

const createOrderSchema = z.object({
    customerId: z.string(),
    productId: z.number(),
    quantity: z.number(),
    total: z.number(),
    paymentId: z.string().optional()
});

router.post('/orders', async (req, res, next) => {
    try {
        const data = createOrderSchema.parse(req.body);
        const result = await query(
            'INSERT INTO orders (customer_id, product_id, quantity, total, payment_id, status) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
            [data.customerId, data.productId, data.quantity, data.total, data.paymentId, 'completed']
        );
        res.json(result.rows[0]);
    } catch (err) {
        next(err);
    }
});

router.get('/orders/:id', async (req, res, next) => {
    try {
        const result = await query('SELECT * FROM orders WHERE id = $1', [req.params.id]);
        if (result.rows.length === 0) {
             res.status(404).json({ error: 'Not found' });
             return;
        }
        res.json(result.rows[0]);
    } catch (err) {
        next(err);
    }
});

router.get('/orders', async (req, res, next) => {
    try {
        const customerId = req.query.customerId as string;
        const limit = parseInt(req.query.limit as string || '20');
        if (!customerId) {
            res.status(400).json({ error: 'customerId required' });
            return;
        }
        const result = await query('SELECT * FROM orders WHERE customer_id = $1 ORDER BY created_at DESC LIMIT $2', [customerId, limit]);
        res.json(result.rows);
    } catch (err) {
        next(err);
    }
});
