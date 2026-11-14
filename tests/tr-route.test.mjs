// /news-tr and /tr through the Worker's own routing (worker.js): a signed-in
// reader of either level gets an answer, never the route failing. (11-14 the
// level check these two used was renamed away in worker.js and every
// signed-in reader's translation threw.) A new translation, which Google
// bills, only for a 完整 pass; anyone else the kept ones (translate.test.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { signToken } from '../orbit-token.js';
import { fakeD1 } from './fake-d1.mjs';
import { SCHEMA } from '../doc-store.js';
import { WALLET_COLLECTION } from '../eco.js';
import worker from '../worker.js';

test('/news-tr and /tr answer a signed-in reader of either level (never a thrown route)', async () => {
  const db = fakeD1(SCHEMA);
  const put = (id, level) => db.prepare('INSERT INTO docs (coll, id, payload, updated) VALUES (?1, ?2, ?3, ?4)').bind(WALLET_COLLECTION, id, JSON.stringify({ v: 1, created: 1, entries: [], sec: { level } }), 'v1').run();
  await put('freeacct', 'free');
  await put('fullacct', 'full');
  const objects = new Map();
  const DATA = { get: async k => (objects.has(k) ? { text: async () => objects.get(k), json: async () => JSON.parse(objects.get(k)) } : null), put: async (k, v) => void objects.set(k, String(v)), head: async () => null, list: async () => ({ objects: [] }) };
  const env = { ECO_TOKEN_SECRET: 'tr-secret', STORE: db, DATA };
  const ctx = { waitUntil() {}, passThroughOnException() {} };
  const qt = (d, a) => signToken('tr-secret', { k: 'ses', d, a, s: `s-${d}-${a}`, e: Date.now() + 600_000 });
  const post = async (path, d, a, body) =>
    worker.fetch(new Request(`https://api.jaypengx.com${path}?qt=${encodeURIComponent(await qt(d, a))}`, { method: 'POST', headers: { Origin: 'https://orbit.jaypengx.com', 'Content-Type': 'application/json', 'CF-Connecting-IP': '9.9.9.7' }, body: JSON.stringify(body) }), env, ctx);
  for (const d of ['freeacct', 'fullacct']) {
    const news = await post('/news-tr', d, 'news', { id: 'nope', to: 'en' });
    assert.ok(news.status < 500 || news.status === 503, `/news-tr ${d}: ${news.status}`);
    const tr = await post('/tr', d, 'transit', { to: 'en', texts: ['台北車站'] });
    assert.ok(tr.status < 500 || tr.status === 503, `/tr ${d}: ${tr.status}`);
  }
});
