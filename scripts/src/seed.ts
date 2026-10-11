import { Client } from 'pg';

const APP_DB = process.env.ADMIN_DB_URL || 'postgres://rootcause:rootcause_password@localhost:5432/rootcause';
const OPS_DB = process.env.OPS_DB_URL || 'postgres://rootcause:rootcause_password@localhost:5432/ops';

const ORDER_COUNT = parseInt(process.env.SEED_ORDERS || '1000000', 10);

// Ordinary release history from the past week, as [hours ago, service, kind,
// from, to, summary, diff]. Nothing in the last 12 hours: recent entries are
// written when something is actually deployed.
const HISTORY: Array<[number, string, string, string, string, string, string]> = [
  [166, 'gateway', 'code', '1.3.5', '1.3.6', 'fix: return 404 for unknown product ids', 'gateway/routes: map upstream 404'],
  [158, 'orders', 'code', '1.3.6', '1.3.7', 'feat: order history endpoint', 'orders/routes: GET /orders?customerId'],
  [150, 'inventory', 'config', '1.3.7', '1.3.7', 'config: product cache TTL 30s -> 60s', 'PRODUCT_CACHE_TTL: 30 -> 60'],
  [141, 'payments', 'code', '1.3.7', '1.3.8', 'chore: upgrade card processor SDK', 'payments/package.json'],
  [133, 'postgres', 'migration', '', '', 'migration: add payment_id to orders', 'ALTER TABLE orders ADD COLUMN payment_id'],
  [120, 'orders', 'code', '1.3.7', '1.3.8', 'feat: recent orders endpoint', 'orders/routes: GET /orders/recent'],
  [109, 'gateway', 'code', '1.3.6', '1.3.8', 'chore: propagate x-request-id to upstreams', 'gateway/routes'],
  [96, 'inventory', 'code', '1.3.7', '1.3.8', 'fix: invalidate product cache after reserve', 'inventory/routes: reserve'],
  [88, 'postgres', 'migration', '', '', 'migration: index orders(status)', 'CREATE INDEX idx_orders_status'],
  [74, 'orders', 'config', '1.3.8', '1.3.8', 'config: statement timeout 5s -> 3s', 'DB_STATEMENT_TIMEOUT: 5000 -> 3000'],
  [63, 'payments', 'code', '1.3.8', '1.3.9', 'fix: validate amount is positive', 'payments/routes'],
  [51, 'gateway', 'code', '1.3.8', '1.3.9', 'feat: pending order count endpoint', 'gateway/routes: GET /orders/pending-count'],
  [40, 'inventory', 'code', '1.3.8', '1.3.9', 'feat: per-product reservation lock', 'inventory/routes: redis SET NX lock'],
  [33, 'orders', 'code', '1.3.8', '1.3.9', 'chore: bump pg driver', 'orders/package.json'],
  [26, 'gateway', 'code', '1.3.9', '1.4.0', 'release 1.4.0', 'version bump'],
  [26, 'orders', 'code', '1.3.9', '1.4.0', 'release 1.4.0', 'version bump'],
  [25, 'inventory', 'code', '1.3.9', '1.4.0', 'release 1.4.0', 'version bump'],
  [25, 'payments', 'code', '1.3.9', '1.4.0', 'release 1.4.0', 'version bump']
];

async function seed() {
  const app = new Client({ connectionString: APP_DB });
  await app.connect();

  console.log('Seeding 5,000 products...');
  await app.query('TRUNCATE orders, products RESTART IDENTITY CASCADE');
  await app.query(`
    INSERT INTO products (name, description, price, stock, category)
    SELECT 'Product ' || g,
           'Description for product ' || g,
           round((10 + random() * 490)::numeric, 2),
           1000000,
           (ARRAY['Electronics','Clothing','Books','Home','Toys'])[1 + (g % 5)]
    FROM generate_series(1, 5000) g`);

  console.log(`Seeding ${ORDER_COUNT.toLocaleString()} orders...`);
  await app.query(
    `INSERT INTO orders (customer_id, product_id, quantity, total, status, payment_id, created_at)
     SELECT 'cust_' || (1 + floor(random() * 1000))::int,
            1 + floor(random() * 5000)::int,
            1 + floor(random() * 3)::int,
            round((10 + random() * 1500)::numeric, 2),
            CASE WHEN random() < 0.01 THEN 'pending' WHEN random() < 0.5 THEN 'completed' ELSE 'shipped' END,
            'pay_' || g,
            NOW() - (random() * interval '30 days')
     FROM generate_series(1, $1::int) g`,
    [ORDER_COUNT]
  );
  await app.query('ANALYZE');
  await app.end();

  const ops = new Client({ connectionString: OPS_DB });
  await ops.connect();
  console.log('Seeding deploy history...');
  await ops.query('TRUNCATE deploy_events RESTART IDENTITY');
  for (const [hoursAgo, service, kind, from, to, summary, diff] of HISTORY) {
    await ops.query(
      `INSERT INTO deploy_events (timestamp, service, kind, from_version, to_version, summary, diff_summary)
       VALUES (NOW() - make_interval(hours => $1::int), $2, $3, NULLIF($4, ''), NULLIF($5, ''), $6, $7)`,
      [hoursAgo, service, kind, from, to, summary, diff]
    );
  }
  await ops.end();
  console.log('Seeding complete.');
}

seed().catch(err => {
  console.error(err);
  process.exit(1);
});
