import test from 'node:test';
import assert from 'node:assert/strict';
import { fakeD1 } from './fake-d1.mjs';
import { keptRead, keptText, keptPut, keptDelete, sweepKept } from '../kept-store.js';

const fakeKV = () => {
  const m = new Map();
  return { m, get: async k => m.get(k)?.v ?? null, getWithMetadata: async k => ({ value: m.get(k)?.v ?? null, metadata: m.get(k)?.meta ?? null }), put: async (k, v, o) => void m.set(k, { v, meta: o?.metadata }), delete: async k => void m.delete(k) };
};

test("kept in D1 with its end, never written to KV (KV's Free plan: 1,000 writes a day); gone once ended, and swept", async () => {
  const env = { STORE: fakeD1(), RATE_LIMIT_KV: fakeKV() };
  await keptPut(env, 'a', { n: 1 }, 60, { now: 1000 });
  await keptPut(env, 'b', '{"raw":true}', 3600, { raw: true, metadata: { at: 5 }, now: 1000 });
  await keptPut(env, 'a', { n: 2 }, 60, { now: 1000 });
  assert.equal(env.RATE_LIMIT_KV.m.size, 0);
  assert.deepEqual(await keptRead(env, 'a', { now: 2000 }), { n: 2 });
  assert.deepEqual(await keptText(env, 'b', { meta: true, now: 2000 }), { value: '{"raw":true}', metadata: { at: 5 } });
  assert.equal(await keptRead(env, 'a', { now: 1000 + 61_000 }), null);
  assert.deepEqual(await sweepKept(env, { now: 1000 + 61_000 }), { gone: 1 });
  await keptDelete(env, 'b');
  assert.equal(await keptRead(env, 'b'), null);
});

test('a copy KV kept before the move is still read; without D1 (a local run) KV is used', async () => {
  const kv = fakeKV();
  kv.m.set('old', { v: '{"was":"kv"}' });
  assert.deepEqual(await keptRead({ STORE: fakeD1(), RATE_LIMIT_KV: kv }, 'old'), { was: 'kv' });
  const env = { RATE_LIMIT_KV: fakeKV() };
  await keptPut(env, 'x', [1], 60);
  assert.deepEqual(await keptRead(env, 'x'), [1]);
});

test('D1 failing: nothing throws, the copy is simply not kept', async () => {
  const env = { STORE: { prepare: () => { throw new Error('D1 down'); } }, RATE_LIMIT_KV: fakeKV() };
  await keptPut(env, 'c', 1, 60);
  assert.equal(await keptRead(env, 'c'), null);
  await keptDelete(env, 'c');
});
