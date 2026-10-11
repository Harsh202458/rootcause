import axios from 'axios';

// Steady, mixed traffic against the gateway so the system always has a baseline.
const TARGET = process.env.LOAD_TARGET_URL || 'http://gateway:3000';
const RPS = parseInt(process.env.LOAD_RPS || '20', 10);

const http = axios.create({ baseURL: TARGET, timeout: 6000, validateStatus: () => true });
const pick = (max: number) => Math.floor(Math.random() * max) + 1;

const recentOrderIds: number[] = [];
let sent = 0;
let failed = 0;

type Action = { weight: number; run: () => Promise<number> };

const actions: Action[] = [
  { weight: 28, run: async () => (await http.get(`/products/${pick(5000)}`)).status },
  { weight: 8, run: async () => (await http.get('/products', { params: { page: pick(50), limit: 20 } })).status },
  {
    weight: 24,
    run: async () => {
      const r = await http.post('/checkout', {
        customerId: `cust_${pick(1000)}`,
        productId: pick(5000),
        quantity: pick(3)
      });
      if (r.status === 200 && r.data.orderId) {
        recentOrderIds.push(r.data.orderId);
        if (recentOrderIds.length > 500) recentOrderIds.shift();
      }
      return r.status;
    }
  },
  { weight: 12, run: async () => (await http.get('/orders', { params: { customerId: `cust_${pick(1000)}` } })).status },
  { weight: 10, run: async () => (await http.get('/orders/recent')).status },
  { weight: 8, run: async () => (await http.get('/orders/pending-count')).status },
  {
    weight: 10,
    run: async () => {
      // Mostly orders that exist; some lookups are for ids that do not.
      const known = recentOrderIds.length > 0 && Math.random() < 0.8;
      const id = known ? recentOrderIds[pick(recentOrderIds.length) - 1] : 900000000 + pick(100000);
      return (await http.get(`/orders/${id}`)).status;
    }
  }
];
const totalWeight = actions.reduce((sum, a) => sum + a.weight, 0);

function next(): Action {
  let roll = Math.random() * totalWeight;
  for (const action of actions) {
    roll -= action.weight;
    if (roll < 0) return action;
  }
  return actions[0];
}

setInterval(() => {
  sent++;
  next()
    .run()
    .then(status => { if (status >= 500) failed++; })
    .catch(() => { failed++; });
}, 1000 / RPS);

setInterval(() => {
  console.log(JSON.stringify({ service: 'loadgen', sent, failed }));
  sent = 0;
  failed = 0;
}, 30000);
