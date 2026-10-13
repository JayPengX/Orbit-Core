import { test } from 'node:test';
import assert from 'node:assert/strict';
import { within } from '../builders/within.js';

test('within: a read that never settles is given up at its deadline', async () => {
  let aborted = false;
  const t = Date.now();
  await assert.rejects(
    within(50, signal => {
      signal.addEventListener('abort', () => (aborted = true));
      return new Promise(() => {});
    }),
    { name: 'TimeoutError' }
  );
  assert.ok(aborted);
  assert.ok(Date.now() - t < 1000);
});

test('within: an answer in time is the answer, and its timer let go', async () => {
  assert.equal(await within(1000, async () => 42), 42);
  await assert.rejects(within(1000, async () => { throw new Error('HTTP 500'); }), /HTTP 500/);
});
