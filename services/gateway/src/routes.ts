import { Router } from 'express';
import axios from 'axios';
import { z } from 'zod';

export const router = Router();

const INVENTORY_URL = process.env.INVENTORY_URL || 'http://localhost:3002';
const ORDERS_URL = process.env.ORDERS_URL || 'http://localhost:3001';
const PAYMENTS_URL = process.env.PAYMENTS_URL || 'http://localhost:3003';

const checkoutSchema = z.object({
    customerId: z.string(),
    productId: z.number(),
    quantity: z.number()
});

const createAxiosClient = (req: any) => axios.create({
    headers: { 'x-request-id': req.headers['x-request-id'] },
    timeout: 5000
});

router.post('/checkout', async (req, res, next) => {
    try {
        const { customerId, productId, quantity } = checkoutSchema.parse(req.body);
        const client = createAxiosClient(req);

        // 1. Get inventory
        const productRes = await client.get(`${INVENTORY_URL}/products/${productId}`);
        const product = productRes.data;

        // 2. Reserve stock
        const reserveRes = await client.post(`${INVENTORY_URL}/products/${productId}/reserve`, { quantity });
        if (!reserveRes.data.success) {
             res.status(400).json({ error: 'Insufficient stock' });
             return;
        }

        const total = product.price * quantity;

        // 3. Payment
        const payRes = await client.post(`${PAYMENTS_URL}/payments`, { amount: total, orderId: 'pending' });
        const paymentId = payRes.data.paymentId;

        // 4. Create order
        const orderRes = await client.post(`${ORDERS_URL}/orders`, {
            customerId,
            productId,
            quantity,
            total,
            paymentId
        });

        res.json({
            orderId: orderRes.data.id,
            status: orderRes.data.status,
            paymentId,
            total
        });
    } catch (err) {
        next(err);
    }
});

router.get('/products', async (req, res, next) => {
    try {
        const client = createAxiosClient(req);
        const response = await client.get(`${INVENTORY_URL}/products`, { params: req.query });
        res.json(response.data);
    } catch (err) {
        next(err);
    }
});

router.get('/orders/:id', async (req, res, next) => {
    try {
        const client = createAxiosClient(req);
        const response = await client.get(`${ORDERS_URL}/orders/${req.params.id}`);
        res.json(response.data);
    } catch (err) {
        next(err);
    }
});
