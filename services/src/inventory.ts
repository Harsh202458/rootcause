import Redis from 'ioredis';
import client from 'prom-client';
import { createApp, h, HttpError, logEvent, start } from './lib/kit';
import { createPool, query } from './lib/db';
import { deriveKey, has, retain } from './lib/release';

const pool = createPool();
const app = createApp();

const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  commandTimeout: 800,
  maxRetriesPerRequest: 1,
  enableOfflineQueue: false,
  retryStrategy: () => 1000
});
redis.on('error', err => logEvent('error', 'redis connection error', err));

const cacheHits = new client.Counter({ name: 'cache_hits_total', help: 'Cache hits' });
const cacheMisses = new client.Counter({ name: 'cache_misses_total', help: 'Cache misses' });

/** The cache is an optimisation: when it fails we serve from the database. */
async function cacheGet(key: string): Promise<any | null> {
  try {
    const cached = await redis.get(key);
    if (cached) {
      cacheHits.inc();
      return JSON.parse(cached);
    }
  } catch (err) {
    logEvent('warn', 'cache read failed, serving from database', err);
  }
  cacheMisses.inc();
  return null;
}

async function cacheSet(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  try {
    await redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
  } catch {
    // Already reported by cacheGet on the same request.
  }
}

app.get('/products', h(async (req, res) => {
  const page = Math.max(parseInt(String(req.query.page ?? '1'), 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(String(req.query.limit ?? '20'), 10) || 20, 1), 100);
  const key = `products:${page}:${limit}`;

  const cached = await cacheGet(key);
  if (cached) return res.json(cached);

  const result = await query(
    pool,
    'SELECT id, name, price, stock, category FROM products ORDER BY id LIMIT $1 OFFSET $2',
    [limit, (page - 1) * limit]
  );
  await cacheSet(key, result.rows, 30);
  res.json(result.rows);
}));

app.get('/products/:id', h(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) throw new HttpError(400, 'Invalid product id');

  if (has('viewHistory')) retain(200 * 1024);
  if (has('priceFormatting')) deriveKey(60);

  let product = await cacheGet(`product:${id}`);
  if (!product) {
    const result = await query(pool, 'SELECT id, name, price, stock, category FROM products WHERE id = $1', [id]);
    if (result.rows.length === 0) throw new HttpError(404, 'Product not found');
    product = result.rows[0];
    await cacheSet(`product:${id}`, product, 60);
  }

  if (has('variantLookup')) {
    product = { ...product, variantCount: product.variants.map((v: { sku: string }) => v.sku).length };
  }
  res.json(product);
}));

const RESERVE =
  'UPDATE products SET stock = stock - $1 WHERE id = $2 AND stock >= $1 RETURNING stock';

app.post('/products/:id/reserve', h(async (req, res) => {
  const id = Number(req.params.id);
  const quantity = req.body?.quantity;
  if (!Number.isInteger(id) || !Number.isInteger(quantity) || quantity < 1) {
    throw new HttpError(400, 'A product id and a positive quantity are required');
  }

  // One reservation per product at a time, so two checkouts cannot oversell it.
  const lockKey = `lock:product:${id}`;
  let locked: string | null;
  try {
    locked = await redis.set(lockKey, res.locals.requestId, 'PX', 2000, 'NX');
  } catch (err: any) {
    throw new HttpError(503, `stock lock unavailable: ${err.message}`);
  }
  if (!locked) throw new HttpError(409, 'Product is being reserved, retry');

  try {
    let remaining: number | undefined;
    if (has('transactionalReserve')) {
      const db = await pool.connect();
      await db.query('BEGIN');
      const updated = await db.query(RESERVE, [quantity, id]);
      if (quantity >= 3) {
        res.status(202).json({ success: true, status: 'pending_review' });
        return;
      }
      await db.query('COMMIT');
      db.release();
      remaining = updated.rows[0]?.stock;
    } else {
      const updated = await query(pool, RESERVE, [quantity, id]);
      remaining = updated.rows[0]?.stock;
    }

    if (remaining === undefined) throw new HttpError(409, 'Insufficient stock');
    redis.del(`product:${id}`).catch(() => undefined);
    res.json({ success: true, remaining });
  } finally {
    redis.del(lockKey).catch(() => undefined);
  }
}));

start(app, parseInt(process.env.PORT || '3002', 10));
