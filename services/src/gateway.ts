import axios, { AxiosResponse, Method } from 'axios';
import { Response } from 'express';
import { createApp, h, HttpError, start } from './lib/kit';
import { has, retain } from './lib/release';

const INVENTORY_URL = process.env.INVENTORY_URL || 'http://inventory:3002';
const ORDERS_URL = process.env.ORDERS_URL || 'http://orders:3001';
const PAYMENTS_URL = process.env.PAYMENTS_URL || 'http://payments:3003';

const http = axios.create({ timeout: 5000, validateStatus: status => status < 500 });

/** Calls another service. A network failure or 5xx becomes a 502 that names the upstream. */
async function call(
  res: Response,
  upstream: string,
  method: Method,
  url: string,
  data?: unknown,
  params?: unknown
): Promise<AxiosResponse> {
  try {
    return await http.request({
      method,
      url,
      data,
      params,
      headers: { 'x-request-id': res.locals.requestId }
    });
  } catch (e: any) {
    const detail = e.response ? `HTTP ${e.response.status}` : [e.code, e.message].filter(Boolean).join(' ');
    throw new HttpError(502, `upstream ${upstream} failed: ${detail}`);
  }
}

/** Relays an upstream response that was not a success. */
function relay(res: Response, upstream: AxiosResponse): boolean {
  if (upstream.status < 400) return false;
  res.status(upstream.status).json(upstream.data);
  return true;
}

const app = createApp();

if (has('responseAudit')) {
  app.use((_req, _res, next) => {
    retain(50 * 1024);
    next();
  });
}

app.post('/checkout', h(async (req, res) => {
  const { customerId, productId, quantity } = req.body ?? {};
  if (typeof customerId !== 'string' || !Number.isInteger(productId) || !Number.isInteger(quantity) || quantity < 1) {
    throw new HttpError(400, 'customerId, productId and quantity are required');
  }

  if (has('couponValidation') && req.body.coupon.code.length > 12) {
    throw new HttpError(400, 'Invalid coupon');
  }

  const product = await call(res, 'inventory', 'GET', `${INVENTORY_URL}/products/${productId}`);
  if (relay(res, product)) return;

  const reserve = await call(res, 'inventory', 'POST', `${INVENTORY_URL}/products/${productId}/reserve`, { quantity });
  if (relay(res, reserve)) return;

  const total = Number(product.data.price) * quantity;

  const payment = await call(res, 'payments', 'POST', `${PAYMENTS_URL}/payments`, { amount: total });
  if (relay(res, payment)) return;

  const order = await call(res, 'orders', 'POST', `${ORDERS_URL}/orders`, {
    customerId,
    productId,
    quantity,
    total,
    paymentId: payment.data.paymentId
  });
  if (relay(res, order)) return;

  res.json({ orderId: order.data.id, status: order.data.status, total });
}));

app.get('/products', h(async (req, res) => {
  const r = await call(res, 'inventory', 'GET', `${INVENTORY_URL}/products`, undefined, req.query);
  res.status(r.status).json(r.data);
}));

app.get('/products/:id', h(async (req, res) => {
  const r = await call(res, 'inventory', 'GET', `${INVENTORY_URL}/products/${req.params.id}`);
  res.status(r.status).json(r.data);
}));

app.get('/orders', h(async (req, res) => {
  const r = await call(res, 'orders', 'GET', `${ORDERS_URL}/orders`, undefined, req.query);
  res.status(r.status).json(r.data);
}));

app.get('/orders/recent', h(async (_req, res) => {
  const r = await call(res, 'orders', 'GET', `${ORDERS_URL}/orders/recent`);
  res.status(r.status).json(r.data);
}));

app.get('/orders/pending-count', h(async (_req, res) => {
  const r = await call(res, 'orders', 'GET', `${ORDERS_URL}/orders/pending-count`);
  res.status(r.status).json(r.data);
}));

app.get('/orders/:id', h(async (req, res) => {
  const r = await call(res, 'orders', 'GET', `${ORDERS_URL}/orders/${req.params.id}`);
  res.status(r.status).json(r.data);
}));

start(app, parseInt(process.env.PORT || '3000', 10));
