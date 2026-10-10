import axios from 'axios';
import pino from 'pino';

const logger = pino({
  transport: {
    target: 'pino-pretty',
    options: { colorize: true }
  }
});

const TARGET_URL = process.env.LOAD_TARGET_URL || 'http://localhost:3000';
const RPS = parseInt(process.env.LOAD_RPS || '20', 10);
const SUMMARY_INTERVAL_MS = 10000;

interface RequestStat {
  latency: number;
  success: boolean;
  endpoint: string;
}

let stats: RequestStat[] = [];
let recentOrderIds: string[] = [];
let isRunning = true;

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function makeRequest(endpoint: string, method: 'GET' | 'POST', path: string, data?: any) {
  const start = Date.now();
  let success = false;
  try {
    const res = await axios({
      method,
      url: `${TARGET_URL}${path}`,
      data,
      timeout: 5000,
      validateStatus: (status) => status < 500
    });
    success = res.status < 400;
    if (success && endpoint === 'POST /checkout' && res.data.orderId) {
      recentOrderIds.push(res.data.orderId);
      if (recentOrderIds.length > 1000) {
        recentOrderIds.shift();
      }
    }
  } catch (error) {
    success = false;
  }
  const latency = Date.now() - start;
  stats.push({ latency, success, endpoint });
}

function getRandomProductId() {
  return Math.floor(Math.random() * 5000) + 1;
}

function getRandomCustomerId() {
  return `customer_${Math.floor(Math.random() * 1000) + 1}`;
}

async function sendTraffic() {
  while (isRunning) {
    const startWindow = Date.now();
    const promises: Promise<void>[] = [];

    for (let i = 0; i < RPS; i++) {
      const rand = Math.random();
      if (rand < 0.5) {
        // 50% GET /products (browse)
        promises.push(makeRequest('GET /products', 'GET', '/products'));
      } else if (rand < 0.7) {
        // 20% GET /products with different pages
        const page = Math.floor(Math.random() * 10) + 1;
        promises.push(makeRequest('GET /products', 'GET', `/products?page=${page}&limit=20`));
      } else if (rand < 0.9) {
        // 20% POST /checkout (buy)
        promises.push(makeRequest('POST /checkout', 'POST', '/checkout', {
          customerId: getRandomCustomerId(),
          items: [{
            productId: getRandomProductId().toString(),
            quantity: Math.floor(Math.random() * 5) + 1
          }]
        }));
      } else {
        // 10% GET /orders/:id (check order)
        if (recentOrderIds.length > 0) {
          const orderId = recentOrderIds[Math.floor(Math.random() * recentOrderIds.length)];
          promises.push(makeRequest('GET /orders/:id', 'GET', `/orders/${orderId}`));
        } else {
          promises.push(makeRequest('GET /products', 'GET', '/products'));
        }
      }
    }

    await Promise.allSettled(promises);
    const elapsed = Date.now() - startWindow;
    if (elapsed < 1000) {
      await sleep(1000 - elapsed);
    }
  }
}

function calculatePercentile(latencies: number[], p: number) {
  if (latencies.length === 0) return 0;
  const sorted = [...latencies].sort((a, b) => a - b);
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[index];
}

function printSummary() {
  if (stats.length === 0) return;

  const currentStats = stats;
  stats = [];

  const total = currentStats.length;
  const successCount = currentStats.filter(s => s.success).length;
  const failureCount = total - successCount;
  const successRate = ((successCount / total) * 100).toFixed(2);
  
  const latencies = currentStats.map(s => s.latency);
  const p50 = calculatePercentile(latencies, 50);
  const p95 = calculatePercentile(latencies, 95);
  const p99 = calculatePercentile(latencies, 99);

  const byEndpoint: Record<string, { total: number, success: number, latencies: number[] }> = {};
  for (const stat of currentStats) {
    if (!byEndpoint[stat.endpoint]) {
      byEndpoint[stat.endpoint] = { total: 0, success: 0, latencies: [] };
    }
    byEndpoint[stat.endpoint].total++;
    if (stat.success) byEndpoint[stat.endpoint].success++;
    byEndpoint[stat.endpoint].latencies.push(stat.latency);
  }

  logger.info(`--- Traffic Summary (${total} requests) ---`);
  logger.info(`Success Rate: ${successRate}% (${successCount} OK, ${failureCount} FAIL)`);
  logger.info(`Latencies: p50=${p50}ms, p95=${p95}ms, p99=${p99}ms`);
  
  for (const [endpoint, data] of Object.entries(byEndpoint)) {
    const epSuccessRate = ((data.success / data.total) * 100).toFixed(2);
    const epP95 = calculatePercentile(data.latencies, 95);
    logger.info(`  [${endpoint}] ${data.total} reqs | ${epSuccessRate}% OK | p95=${epP95}ms`);
  }
}

function start() {
  logger.info(`Starting load generator. Target: ${TARGET_URL}, RPS: ${RPS}`);
  
  const summaryInterval = setInterval(printSummary, SUMMARY_INTERVAL_MS);
  
  const shutdown = () => {
    logger.info('Shutting down load generator...');
    isRunning = false;
    clearInterval(summaryInterval);
    printSummary();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  sendTraffic();
}

start();
