// Web Push: the message encryption against RFC 8291's own example, and the
// notice lists the Worker keeps.
import test from 'node:test';
import assert from 'node:assert/strict';
import { encryptPush, cleanItems, sendDue, handlePush } from '../push.js';

const unb64u = t => Buffer.from(t, 'base64url');
async function pairFrom(priv, pub) {
  const raw = unb64u(pub);
  const jwk = { kty: 'EC', crv: 'P-256', d: priv, x: raw.subarray(1, 33).toString('base64url'), y: raw.subarray(33, 65).toString('base64url'), ext: true };
  const privateKey = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const publicKey = await crypto.subtle.importKey('raw', raw, { name: 'ECDH', namedCurve: 'P-256' }, true, []);
  return { privateKey, publicKey };
}

test('encrypts as RFC 8291 section 5 does', async () => {
  const sub = { keys: { p256dh: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4', auth: 'BTBZMqHH6r4Tts7J_aSIgg' } };
  const pair = await pairFrom('yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw', 'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8');
  const out = await encryptPush(sub, 'When I grow up, I want to be a watermelon', { salt: unb64u('DGv6ra1nlYgDCS1FRnbzlw'), pair });
  assert.equal(
    Buffer.from(out).toString('base64url'),
    'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN'
  );
});

test('notice lists keep only sane items, in time order', () => {
  const now = Date.parse('2026-09-29T00:00:00Z');
  const list = cleanItems(
    [
      { at: now + 3_600_000, title: 'later', url: 'https://evil.example/' },
      { at: now + 60_000, title: 'soon', url: 'https://jaypengx.github.io/Quadra-Fixtures/#home' },
      { at: now - 86_400_000, title: 'old' },
      { at: now + 120_000, check: { espn: 'football/nfl', event: '401' } },
      { at: now + 120_000, check: { yahoo: '2330.TW', op: 'above', price: 1200 }, title: '台積電' },
      { at: now + 120_000, check: { espn: '../x', event: 'a' } }
    ],
    now
  );
  assert.deepEqual(list.map(x => x.title), ['soon', '', '台積電', 'later']);
  assert.equal(list[3].url, '');
  assert.deepEqual(list[1].check, { espn: 'football/nfl', event: '401' });
});

// A KV that lives in memory.
const memoryKv = () => {
  const m = new Map();
  return { get: async (k, type) => (m.has(k) ? (type === 'json' ? JSON.parse(m.get(k)) : m.get(k)) : null), put: async (k, v) => void m.set(k, v), delete: async k => void m.delete(k), m };
};

test('subscribe, schedule, then the due notices go out', async () => {
  const kv = memoryKv();
  const env = { RATE_LIMIT_KV: kv };
  const session = { d: 'acct', a: 'match' };
  const post = (path, body) => handlePush(new Request(`https://w/${path}`, { method: 'POST', body: JSON.stringify(body) }), env, {}, session, path);
  const subKeys = { p256dh: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4', auth: 'BTBZMqHH6r4Tts7J_aSIgg' };
  assert.equal((await post('/push/subscribe', { sub: { endpoint: 'https://push.example/abc', keys: subKeys }, lang: 'zh' })).status, 200);
  const now = Date.now();
  await post('/push/schedule', { items: [{ at: now + 30_000, title: '開賽', body: 'Eagles vs Bears' }, { at: now + 86_400_000, title: 'tomorrow' }] });
  const sent = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => (sent.push({ url, init }), new Response(null, { status: 201 }));
  try {
    assert.equal((await sendDue(env, now)).sent, 1);
  } finally {
    globalThis.fetch = realFetch;
  }
  assert.equal(sent[0].url, 'https://push.example/abc');
  assert.match(sent[0].init.headers.Authorization, /^vapid t=[\w-]+\.[\w-]+\.[\w-]+, k=[\w-]+$/);
  const record = JSON.parse(kv.m.get('push:acct:match'));
  assert.deepEqual(record.items.map(x => x.title), ['tomorrow']);
  assert.equal(JSON.parse(kv.m.get('push:due'))['push:acct:match'], record.items[0].at);
});

test('a kind switched off in any app (or notices off) is never sent', async () => {
  const kv = memoryKv();
  const env = { RATE_LIMIT_KV: kv };
  const post = (session, path, body) => handlePush(new Request(`https://w/${path}`, { method: 'POST', body: JSON.stringify(body) }), env, {}, session, path);
  const stock = { d: 'acct', a: 'stock' };
  const subKeys = { p256dh: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4', auth: 'BTBZMqHH6r4Tts7J_aSIgg' };
  await post(stock, '/push/subscribe', { sub: { endpoint: 'https://push.example/s', keys: subKeys } });
  const now = Date.now();
  await post(stock, '/push/schedule', { items: [{ at: now + 10_000, title: '到價', kind: 'alert' }, { at: now + 20_000, title: '定期定額', kind: 'fill' }] });
  assert.equal(JSON.parse(kv.m.get('push:acct:stock')).items[0].kind, 'alert');
  // Turned off in another app (Play's account sheet).
  await post({ d: 'acct', a: 'odds' }, '/push/prefs', { on: true, off: ['stock:alert', 'bad key'] });
  assert.deepEqual(JSON.parse(kv.m.get('push:prefs:acct')), { on: true, off: ['stock:alert'] });
  const sent = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => (sent.push({ url, init }), new Response(null, { status: 201 }));
  try {
    assert.equal((await sendDue(env, now)).sent, 1);
    await post(stock, '/push/schedule', { items: [{ at: now + 10_000, title: '成交', kind: 'fill' }] });
    await post(stock, '/push/prefs', { on: false, off: [] });
    assert.equal((await sendDue(env, now)).sent, 0);
  } finally {
    globalThis.fetch = realFetch;
  }
  assert.equal(JSON.parse(kv.m.get('push:acct:stock')).items.length, 0);
});
