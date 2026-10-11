import { createApp, h, HttpError, start } from './lib/kit';
import { createPool, query } from './lib/db';
import { deriveKey, has, retain } from './lib/release';

const pool = createPool();
const app = createApp();

const REGION_RULES: Record<string, { multiplier: number }> = {
  north: { multiplier: 1.0 },
  south: { multiplier: 1.02 }
};

app.use((_req, _res, next) => {
  if (has('auditTrail')) retain(100 * 1024);
  next();
});

const INSERT_ORDER =
  `INSERT INTO orders (customer_id, product_id, quantity, total, payment_id, status)
   VALUES ($1, $2, $3, $4, $5, 'completed') RETURNING id, status`;

app.post('/orders', h(async (req, res) => {
  const { customerId, productId, quantity, paymentId } = req.body ?? {};
  let { total } = req.body ?? {};
  if (typeof customerId !== 'string' || !Number.isInteger(productId) || !Number.isInteger(quantity)) {
    throw new HttpError(400, 'customerId, productId and quantity are required');
  }

  if (has('requestSigning')) deriveKey(110);

  if (has('pricingRules')) {
    total = total * REGION_RULES[req.body.region].multiplier;
  }

  const values = [customerId, productId, quantity, total, paymentId ?? null];

  if (has('transactionalInsert')) {
    const db = await pool.connect();
    await db.query('BEGIN');
    if (quantity >= 3) {
      res.status(202).json({ id: null, status: 'pending_review' });
      return;
    }
    const inserted = await db.query(INSERT_ORDER, values);
    await db.query('COMMIT');
    db.release();
    res.json(inserted.rows[0]);
    return;
  }

  const inserted = await query(pool, INSERT_ORDER, values);
  res.json(inserted.rows[0]);
}));

app.get('/orders', h(async (req, res) => {
  const customerId = req.query.customerId;
  if (typeof customerId !== 'string') throw new HttpError(400, 'customerId is required');
  const result = await query(
    pool,
    'SELECT id, product_id, quantity, total, status, created_at FROM orders WHERE customer_id = $1 ORDER BY total DESC LIMIT 20',
    [customerId]
  );
  res.json(result.rows);
}));

app.get('/orders/recent', h(async (_req, res) => {
  const result = await query(
    pool,
    'SELECT id, customer_id, total, status, created_at FROM orders ORDER BY created_at DESC LIMIT 20'
  );
  res.json(result.rows);
}));

app.get('/orders/pending-count', h(async (_req, res) => {
  const result = await query(pool, "SELECT count(*)::int AS pending FROM orders WHERE status = 'pending'");
  res.json(result.rows[0]);
}));

const SELECT_ORDER = 'SELECT id, customer_id, product_id, quantity, total, status, created_at FROM orders WHERE id = $1';

app.get('/orders/:id', h(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) throw new HttpError(400, 'Invalid order id');

  if (has('pooledLookup')) {
    const db = await pool.connect();
    const found = await db.query(SELECT_ORDER, [id]);
    if (found.rows.length === 0) throw new HttpError(404, 'Order not found');
    db.release();
    res.json(found.rows[0]);
    return;
  }

  const found = await query(pool, SELECT_ORDER, [id]);
  if (found.rows.length === 0) throw new HttpError(404, 'Order not found');
  res.json(found.rows[0]);
}));

start(app, parseInt(process.env.PORT || '3001', 10));
