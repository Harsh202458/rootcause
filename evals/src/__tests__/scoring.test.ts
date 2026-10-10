import { test } from 'node:test';
import * as assert from 'node:assert';
import { scoreResult } from '../scoring';

test('scoring tests', async (t) => {
  await t.test('correct scoring', () => {
    assert.strictEqual(
      scoreResult(
        { component: 'auth', category: 'crash' },
        { component: 'auth', category: 'crash' }
      ),
      'correct'
    );
  });

  await t.test('partial scoring', () => {
    assert.strictEqual(
      scoreResult(
        { component: 'auth', category: 'network' },
        { component: 'auth', category: 'crash' }
      ),
      'partial'
    );
  });

  await t.test('wrong scoring (component mismatch)', () => {
    assert.strictEqual(
      scoreResult(
        { component: 'db', category: 'crash' },
        { component: 'auth', category: 'crash' }
      ),
      'wrong'
    );
  });

  await t.test('wrong scoring (both mismatch)', () => {
    assert.strictEqual(
      scoreResult(
        { component: 'db', category: 'network' },
        { component: 'auth', category: 'crash' }
      ),
      'wrong'
    );
  });
});
