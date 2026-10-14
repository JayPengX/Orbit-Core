// The proxy watching itself (ops.js): heartbeats, the bill's alerts, the report.
import test from 'node:test';
import assert from 'node:assert/strict';
import { beat, beats, news, billNotice, tellOwner, systemReport, dataFolders, TOLD_KEY, OPS_DOC } from '../ops.js';
import { fakeD1 } from './fake-d1.mjs';
import { memoryBucket } from '../builders/store.js';

const fakeKv = (init = {}) => {
  const m = new Map(Object.entries(init));
  return { m, get: async (k, o) => (m.has(k) ? (o?.type === 'json' || o === 'json' ? JSON.parse(m.get(k)) : m.get(k)) : null), put: async (k, v) => void m.set(k, v), delete: async k => void m.delete(k) };
};

test('heartbeats: one row a job; a failure counted in a row until it works again; the error passed on', async () => {
  const env = { STORE: fakeD1() };
  let t = 1000;
  const now = () => (t += 5);
  assert.deepEqual(await beat(env, 'settle', async () => ({ looked: 3 }), now), { looked: 3 });
  await assert.rejects(beat(env, 'kambi', async () => { throw new Error('kambi down'); }, now), /kambi down/);
  await beat(env, 'kambi', async () => ({ watch: { failed: 'x' } }), now);
  let rows = await beats(env);
  const k = rows.find(r => r.job === 'kambi');
  assert.equal(k.ok, false);
  assert.equal(k.fails, 2);
  assert.equal(k.okAt, null);
  assert.ok(rows.find(r => r.job === 'settle').ok);
  await beat(env, 'kambi', async () => ({ checked: 1 }), now);
  rows = await beats(env);
  assert.equal(rows.find(r => r.job === 'kambi').fails, 0);
  assert.ok(rows.find(r => r.job === 'kambi').okAt);
  // No store: the job still runs.
  assert.equal(await beat({}, 'x', async () => 7), 7);
});

test('the bill\'s news: a higher alert, a stop, a pace that changed; a new period starts over', () => {
  const g = (alert, pace = 0, stopped = null, start = 1) => ({ period: { start }, alert, pace, stopped, share: { requests: 0.6 }, top: 'requests' });
  assert.equal(news(g(0), null), null);
  assert.deepEqual(news(g(1), null), { period: 1, alert: 1, pace: 0, stopped: false });
  assert.equal(news(g(1), { period: 1, alert: 1, pace: 0, stopped: false }), null);
  assert.ok(news(g(1, 1), { period: 1, alert: 1, pace: 0, stopped: false }), 'a pace is news');
  assert.ok(news(g(1, 0), { period: 1, alert: 1, pace: 1, stopped: false }), 'and back');
  assert.ok(news(g(3, 3, { at: 1 }), { period: 1, alert: 3, pace: 3, stopped: false }), 'a stop');
  assert.ok(news(g(1, 0, null, 2), { period: 1, alert: 3, pace: 0, stopped: false }), 'a new period');
  const n = billNotice(g(1, 2), 'zh');
  assert.match(n.title, /Workers 請求 已用 60%/);
  assert.match(n.body, /×4/);
  assert.equal(billNotice(g(1), 'en').title, 'Cloudflare: requests at 60% of the $5 plan');
});

test('the owner told once a news, on the first app with notices on; nobody set, nothing sent', async () => {
  const state = { period: { start: 1 }, alert: 1, pace: 0, share: { requests: 0.55 }, top: 'requests' };
  const kv = fakeKv({ 'guard:state': JSON.stringify(state) });
  const docs = new Map();
  const deps = { fsGet: async (env, c, id) => (docs.has(`${c}/${id}`) ? { exists: true, payload: docs.get(`${c}/${id}`) } : { exists: false }) };
  const env = { RATE_LIMIT_KV: kv };
  assert.deepEqual(await tellOwner(env, deps), { news: true, told: 'no account set' });
  assert.equal(kv.m.get(TOLD_KEY), undefined);
  docs.set(OPS_DOC.join('/'), JSON.stringify({ alertAccount: 'acct' }));
  // No device subscribed for any app: 'none', kept as told (asked again only on new news).
  const r = await tellOwner(env, deps);
  assert.equal(r.told, 'none');
  assert.equal(JSON.parse(kv.m.get(TOLD_KEY)).alert, 1);
  assert.deepEqual(await tellOwner(env, deps), { news: false });
});

test('the report: secrets and bindings set or not (never a value), R2 by folder, the store\'s counts', async () => {
  const DATA = memoryBucket();
  const enc = t => new TextEncoder().encode(t);
  await DATA.put('sports/mlb/2026.json', enc('x'.repeat(10)));
  await DATA.put('sports/nba/2026.json', enc('y'.repeat(5)));
  await DATA.put('where.json', enc('z'));
  const f = await dataFolders(DATA);
  assert.deepEqual([f.folders.sports.files, f.folders.sports.bytes, f.folders['(top)'].files], [2, 15, 1]);
  const env = { DATA, STORE: fakeD1(), GEMINI_API_KEY: 'secret-value', RATE_LIMIT_KV: fakeKv() };
  const r = await systemReport(env, { now: () => 5, fsGet: async () => ({ exists: false }), count: async () => ({ 'eco-wallets': 1 }) });
  assert.equal(r.secrets.GEMINI_API_KEY, true);
  assert.equal(r.secrets.CWA_KEY, false);
  assert.equal(r.bindings.STORE, true);
  assert.ok(!JSON.stringify(r).includes('secret-value'));
  assert.deepEqual(r.store, { 'eco-wallets': 1 });
  assert.equal(r.pace.pace, 0);
});
