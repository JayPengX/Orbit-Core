import test from 'node:test';
import assert from 'node:assert/strict';
import { keptRead, keptText, keptPut, keptDelete, sweepKept } from '../kept-store.js';

const fakeKV = () => {
  const m = new Map();
  return { m, get: async k => m.get(k)?.v ?? null, getWithMetadata: async k => ({ value: m.get(k)?.v ?? null, metadata: m.get(k)?.meta ?? null }), put: async (k, v, o) => void m.set(k, { v, meta: o?.metadata }), delete: async k => void m.delete(k) };
};
const fakeR2 = ({ off = false } = {}) => {
  const m = new Map();
  const no = () => {
    if (off) throw new Error('get: Please enable R2 through the Cloudflare Dashboard. (10042)');
  };
  return {
    m,
    get: async k => (no(), m.has(k) ? { customMetadata: m.get(k).meta, text: async () => m.get(k).v } : null),
    put: async (k, v, o) => (no(), void m.set(k, { v, meta: o?.customMetadata })),
    delete: async ks => (no(), [].concat(ks).forEach(k => m.delete(k))),
    list: async ({ prefix }) => (no(), { objects: [...m].filter(([k]) => k.startsWith(prefix)).map(([key, o]) => ({ key, customMetadata: o.meta })), truncated: false })
  };
};

test('kept in R2 with its end, never in KV; read back as written; gone once ended, and swept', async () => {
  const env = { DATA: fakeR2(), RATE_LIMIT_KV: fakeKV() };
  await keptPut(env, 'a', { n: 1 }, 60, { now: 1000 });
  await keptPut(env, 'b', '{"raw":true}', 3600, { raw: true, metadata: { at: 5 }, now: 1000 });
  assert.equal(env.RATE_LIMIT_KV.m.size, 0);
  assert.deepEqual(await keptRead(env, 'a', { now: 2000 }), { n: 1 });
  assert.deepEqual(await keptText(env, 'b', { meta: true, now: 2000 }), { value: '{"raw":true}', metadata: { at: '5', exp: String(1000 + 3600_000) } });
  assert.equal(await keptRead(env, 'a', { now: 1000 + 61_000 }), null);
  assert.deepEqual(await sweepKept(env, { now: 1000 + 61_000 }), { seen: 2, gone: 1 });
  await keptDelete(env, 'b');
  assert.equal(await keptRead(env, 'b'), null);
});

test('a copy KV kept before the move is still read; without R2 (tests, a local run) KV is used', async () => {
  const kv = fakeKV();
  kv.m.set('old', { v: '{"was":"kv"}' });
  assert.deepEqual(await keptRead({ DATA: fakeR2(), RATE_LIMIT_KV: kv }, 'old'), { was: 'kv' });
  const env = { RATE_LIMIT_KV: fakeKV() };
  await keptPut(env, 'x', [1], 60);
  assert.deepEqual(await keptRead(env, 'x'), [1]);
});

test('R2 refusing (switched off): nothing throws; a count that must not be lost (orKv) goes to KV and is read back', async () => {
  const env = { DATA: fakeR2({ off: true }), RATE_LIMIT_KV: fakeKV() };
  await keptPut(env, 'cell', { c: 1 }, 60);
  assert.equal(env.RATE_LIMIT_KV.m.size, 0);
  assert.equal(await keptRead(env, 'cell'), null);
  await keptPut(env, 'weather:google:2026-11-13', 12, 60, { orKv: true });
  assert.equal(await keptRead(env, 'weather:google:2026-11-13'), 12);
});
