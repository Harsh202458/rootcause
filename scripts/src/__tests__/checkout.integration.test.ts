import test from 'node:test';
import assert from 'node:assert';
import axios from 'axios';

test('Integration: Full Checkout Flow', async (t) => {
  const TARGET_URL = process.env.API_URL || 'http://localhost:3000';

  await t.test('checkout flow success path', async (t) => {
    // 1. Check if system is running
    try {
      await axios.get(`${TARGET_URL}/healthz`);
    } catch (e) {
      t.skip('demo system is not running (npm run up)');
      return;
    }

    // 2. Get a product
    const prodRes = await axios.get(`${TARGET_URL}/products?limit=1`);
    assert.strictEqual(prodRes.status, 200);

    // 3. Post a checkout
    const checkoutRes = await axios.post(`${TARGET_URL}/checkout`, {
      customerId: 'test_customer',
      productId: 1,
      quantity: 1
    });
    assert.strictEqual(checkoutRes.status, 200);
    assert.ok(checkoutRes.data.orderId);

    // 4. Verify order created (status)
    const orderId = checkoutRes.data.orderId;
    const orderRes = await axios.get(`${TARGET_URL}/orders/${orderId}`);
    assert.strictEqual(orderRes.status, 200);
    assert.strictEqual(orderRes.data.status, 'completed');
  });
});
