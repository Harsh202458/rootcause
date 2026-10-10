import { Router } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';

export const router = Router();

const paymentSchema = z.object({
    amount: z.number(),
    orderId: z.string()
});

router.post('/payments', async (req, res, next) => {
    try {
        const { amount, orderId } = paymentSchema.parse(req.body);
        
        // Simulate random latency (50-200ms)
        const delay = Math.floor(Math.random() * 150) + 50;
        await new Promise(resolve => setTimeout(resolve, delay));
        
        res.json({
            paymentId: uuidv4(),
            status: 'completed',
            amount
        });
    } catch (err) {
        next(err);
    }
});
