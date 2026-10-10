import { Client } from 'pg';

const DB_URL = process.env.DATABASE_URL || 'postgresql://rootcause:rootcause_password@localhost:5432/rootcause';

const CATEGORIES = ['Electronics', 'Clothing', 'Books', 'Home', 'Toys'];
const STATUSES = ['pending', 'completed', 'shipped', 'cancelled'];

function randomInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function seed() {
  const client = new Client({ connectionString: DB_URL });
  await client.connect();

  console.log('Seeding products...');
  const products = [];
  for (let i = 1; i <= 5000; i++) {
    const category = CATEGORIES[randomInt(0, CATEGORIES.length - 1)];
    const price = (Math.random() * 500 + 10).toFixed(2);
    products.push(`('Product ${i}', 'Description for Product ${i}', ${price}, ${randomInt(10, 1000)}, '${category}')`);
    
    if (products.length >= 1000) {
      await client.query(`INSERT INTO products (name, description, price, stock, category) VALUES ${products.join(',')}`);
      products.length = 0;
    }
  }

  console.log('Seeding orders...');
  const orders = [];
  const now = Date.now();
  const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;

  for (let i = 1; i <= 50000; i++) {
    const customerId = `cust_${randomInt(1, 1000)}`;
    const productId = randomInt(1, 5000);
    const quantity = randomInt(1, 5);
    const total = (quantity * randomInt(10, 500)).toFixed(2);
    const status = STATUSES[randomInt(0, STATUSES.length - 1)];
    const timestamp = new Date(now - randomInt(0, thirtyDaysMs)).toISOString();

    orders.push(`('${customerId}', ${productId}, ${quantity}, ${total}, '${status}', 'pay_${randomInt(1000, 9999)}', '${timestamp}')`);
    
    if (orders.length >= 1000) {
      await client.query(`INSERT INTO orders (customer_id, product_id, quantity, total, status, payment_id, created_at) VALUES ${orders.join(',')}`);
      orders.length = 0;
    }
  }

  console.log('Seeding complete.');
  await client.end();
}

seed().catch(console.error);
