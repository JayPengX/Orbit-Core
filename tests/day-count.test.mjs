// law.js addOne: the day's counts in D1 that the caps read (AI, new passes,
// the Pass's mails). A count of 0 is a count, not a failure: a read of a
// quiet day (by 0, pass-mail.js recoveryFull) took it for one and shut
// account recovery every day until some other mail went out.
import test from 'node:test';
import assert from 'node:assert/strict';
import { addOne } from '../law.js';
import { fakeD1 } from './fake-d1.mjs';

test('a day with nothing counted reads 0 (not Infinity, a failed count); giving back to 0 reads 0', async () => {
  const env = { STORE: fakeD1() };
  assert.equal(await addOne(env, 'mail:day', '2026-11-14', 0), 0);
  assert.equal(await addOne(env, 'mail:day', '2026-11-14'), 1);
  assert.equal(await addOne(env, 'mail:day', '2026-11-14', -1), 0);
  assert.equal(await addOne(env, 'mail:day', '2026-11-14', 0), 0);
});

test('a count that fails still reads as capped (Infinity)', async () => {
  const broken = { prepare: () => ({ bind: () => ({ first: async () => { throw new Error('d1 down'); }, run: async () => { throw new Error('d1 down'); } }) }), exec: async () => {} };
  assert.equal(await addOne({ STORE: broken }, 'mail:day', '2026-11-14'), Infinity);
});
