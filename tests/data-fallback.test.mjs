import test from 'node:test';
import assert from 'node:assert/strict';
import { fakeD1 } from './fake-d1.mjs';
import { withDataFallback, resetDataFallback, sweepDataFiles } from '../data-fallback.js';
import { r2Store } from '../builders/store.js';

const refused = () => {
  throw new Error('get: Please enable R2 through the Cloudflare Dashboard. (10042)');
};
const offR2 = { get: refused, head: refused, put: refused, delete: refused, list: refused };

test('R2 switched off (2026-11-13): a builder writes to D1 and a read is answered from there, bytes, gzip and metadata as they were', async () => {
  resetDataFallback();
  let t = 1_000_000;
  const env = withDataFallback({ DATA: offR2, STORE: fakeD1() }, () => t);
  const store = r2Store(env.DATA);
  assert.equal(await store.put('news/index.json', { built: 1, tw: [{ t: '新聞' }] }), true);
  assert.equal(await store.put('news/index.json', { built: 2, tw: [{ t: '新聞' }] }), false, 'the same, not written again');
  await store.put('bus/x.json.gz', { a: 1 });
  assert.deepEqual(await store.json('news/index.json'), { built: 1, tw: [{ t: '新聞' }] });
  assert.deepEqual(await store.json('bus/x.json.gz'), { a: 1 });
  const obj = await env.DATA.get('news/index.json');
  assert.equal(JSON.parse(await new Response(obj.body).text()).tw[0].t, '新聞');
  assert.ok(obj.httpEtag);
  assert.deepEqual(await store.list('news/'), ['news/index.json']);
  await store.delete('bus/x.json.gz');
  assert.equal(await env.DATA.get('bus/x.json.gz'), null);
  // Aged and R2 answering again: swept.
  t += 6 * 60_000;
  assert.deepEqual(await sweepDataFiles(env, { days: 0, now: t + 1 }), { gone: 1 });
});

test('R2 answering: it alone is asked and written; a file it lacks is looked for in D1; a delete clears both', async () => {
  resetDataFallback();
  const m = new Map();
  const r2 = { get: async k => (m.has(k) ? { text: async () => m.get(k) } : null), head: async k => (m.has(k) ? {} : null), put: async (k, v) => void m.set(k, v), delete: async k => void m.delete(k), list: async () => ({ objects: [], truncated: false }) };
  const db = fakeD1();
  const off = withDataFallback({ DATA: offR2, STORE: db });
  await off.DATA.put('a.json', '{"from":"d1"}');
  resetDataFallback();
  const env = withDataFallback({ DATA: r2, STORE: db });
  await env.DATA.put('b.json', '{"from":"r2"}');
  assert.equal(await (await env.DATA.get('b.json')).text(), '{"from":"r2"}');
  assert.equal(await (await env.DATA.get('a.json')).text(), '{"from":"d1"}');
  await env.DATA.delete('a.json');
  assert.equal(await env.DATA.get('a.json'), null);
});

test('no D1 (a test, a local run): env as it was', () => {
  const env = { DATA: offR2 };
  assert.equal(withDataFallback(env), env);
});

test('no R2 bound (a deploy that found R2 off): D1 alone, and a file it lacks counts as R2 off (a 503, not a 404)', async () => {
  resetDataFallback();
  const { dataOffNow } = await import('../data-fallback.js');
  const env = withDataFallback({ STORE: fakeD1() });
  assert.equal(await env.DATA.get('none.json'), null);
  assert.equal(dataOffNow(), true);
  resetDataFallback();
});
