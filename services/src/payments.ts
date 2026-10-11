import { randomUUID } from 'crypto';
import { createApp, h, HttpError, start } from './lib/kit';

const app = createApp();
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Time the card processor takes to answer, on top of our own handling.
let processorLatencyMs = 0;

app.post('/payments', h(async (req, res) => {
  const amount = req.body?.amount;
  if (typeof amount !== 'number' || !(amount > 0)) throw new HttpError(400, 'A positive amount is required');

  await sleep(10 + Math.random() * 25 + processorLatencyMs);
  res.json({ paymentId: `pay_${randomUUID()}`, status: 'completed', amount });
}));

// Operator control for the simulated card processor. Not logged or measured.
app.post('/internal/processor', (req, res) => {
  processorLatencyMs = Math.max(0, Number(req.body?.latencyMs) || 0);
  res.json({ latencyMs: processorLatencyMs });
});

start(app, parseInt(process.env.PORT || '3003', 10));
