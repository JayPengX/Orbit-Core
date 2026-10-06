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
      { at: now + 60_000, title: 'soon', url: 'https://jaypengx.github.io/Orbit-Sports/#home' },
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

test('Orbit Transit’s bus alert: checked each run until the bus is that close, then sent once', async () => {
  const path = 'advanced/v2/Bus/EstimatedTimeOfArrival/City/Hsinchu/PassThrough/Station/1234?$select=RouteUID,Direction,EstimateTime,StopStatus';
  const bus = { path, route: 'HSZ0058', dir: 0, min: 5 };
  const now = Date.now();
  // Only a station's arrivals, a sane route and minutes.
  const clean = cleanItems(
    [
      { at: now, until: now + 7_200_000, title: '5608 快到了', check: { bus } },
      { at: now, title: 'any TDX ask', check: { bus: { ...bus, path: 'basic/v2/Bus/Route/City/Hsinchu' } } },
      { at: now, title: 'an hour', check: { bus: { ...bus, min: 60 } } }
    ],
    now
  );
  assert.deepEqual(clean.map(x => Boolean(x.check)), [true, false, false]);
  assert.deepEqual(clean[0].check, { bus });

  const kv = memoryKv();
  const env = { RATE_LIMIT_KV: kv, TDX_CLIENT_ID: 'id', TDX_CLIENT_SECRET: 'secret', TDX_PER_MIN: '100' };
  const session = { d: 'acct', a: 'transit' };
  const post = (p, body) => handlePush(new Request(`https://w/${p}`, { method: 'POST', body: JSON.stringify(body) }), env, {}, session, p);
  const subKeys = { p256dh: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4', auth: 'BTBZMqHH6r4Tts7J_aSIgg' };
  assert.equal((await post('/push/subscribe', { sub: { endpoint: 'https://push.example/t', keys: subKeys } })).status, 200, 'Transit may push');
  await post('/push/schedule', { items: [{ at: now, until: now + 7_200_000, title: '5608 快到了', body: '{result}（竹東高中）', check: { bus } }] });

  let sec = 600;
  const sent = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    if (String(url).includes('openid-connect/token')) return Response.json({ access_token: 'T', expires_in: 86400 });
    if (String(url).startsWith('https://tdx.')) return Response.json([{ RouteUID: 'HSZ0058', Direction: 1, EstimateTime: 60, StopStatus: 0 }, { RouteUID: 'HSZ0058', Direction: 0, EstimateTime: sec, StopStatus: 0 }]);
    sent.push({ url, init });
    return new Response(null, { status: 201 });
  };
  try {
    assert.equal((await sendDue(env, now)).sent, 0, '10 minutes away: not yet');
    const again = JSON.parse(kv.m.get('push:acct:transit')).items[0];
    assert.ok(again.at - now <= 60_000, 'asked again on the next run, not in 15 minutes');
    sec = 330; // within 5 minutes, give or take the run's 2
    assert.equal((await sendDue(env, again.at)).sent, 1);
    assert.equal((await sendDue(env, again.at + 120_000)).sent, 0, 'once');
  } finally {
    globalThis.fetch = realFetch;
  }
  assert.equal(sent.length, 1);
  assert.equal(JSON.parse(kv.m.get('push:acct:transit')).items.length, 0);
});

test("a game's final score is told once, however often the app schedules it again", async () => {
  const kv = memoryKv();
  const env = { RATE_LIMIT_KV: kv };
  const post = (session, path, body) => handlePush(new Request(`https://w/${path}`, { method: 'POST', body: JSON.stringify(body) }), env, {}, session, path);
  const match = { d: 'acct', a: 'match' };
  const subKeys = { p256dh: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4', auth: 'BTBZMqHH6r4Tts7J_aSIgg' };
  await post(match, '/push/subscribe', { sub: { endpoint: 'https://push.example/s', keys: subKeys } });
  const now = Date.now();
  // The app still has the game on: the final's check, a minute from now.
  const end = () => ({ items: [{ at: Date.now() + 60_000, title: '勇士 vs 快艇', body: 'NBA · {result}', tag: 'end:nba:401918010', kind: 'end', check: { espn: 'basketball/nba', event: '401918010' } }] });
  const realFetch = globalThis.fetch;
  globalThis.fetch = async url =>
    String(url).includes('espn.com')
      ? new Response(JSON.stringify({ header: { competitions: [{ status: { type: { state: 'post', completed: true } }, competitors: [{ homeAway: 'away', score: '96', team: { shortDisplayName: '勇士' } }, { homeAway: 'home', score: '111', winner: true, team: { shortDisplayName: '快艇' } }] }] } }), { status: 200 })
      : new Response(null, { status: 201 });
  try {
    await post(match, '/push/schedule', end());
    assert.equal((await sendDue(env, now + 120_000)).sent, 1);
    // Opened again, its copy still 'on': scheduled again, never sent again.
    await post(match, '/push/schedule', end());
    assert.equal(JSON.parse(kv.m.get('push:acct:match')).items.length, 0);
    assert.equal((await sendDue(env, now + 240_000)).sent, 0);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("a race's final: the winner and the podium from the day's board, once it's over", async () => {
  const m = new Map();
  const kv = { m, get: async (k, t) => (m.has(k) ? (t === 'json' ? JSON.parse(m.get(k)) : m.get(k)) : null), put: async (k, v) => void m.set(k, v), delete: async k => void m.delete(k) };
  const env = { RATE_LIMIT_KV: kv };
  const post = (session, path, body) => handlePush(new Request(`https://w/${path}`, { method: 'POST', body: JSON.stringify(body) }), env, {}, session, path);
  const match = { d: 'acct', a: 'match' };
  await post(match, '/push/subscribe', { sub: { endpoint: 'https://push.example/s', keys: { p256dh: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4', auth: 'BTBZMqHH6r4Tts7J_aSIgg' } } });
  const item = { at: Date.now() + 60_000, title: '新加坡站 · 正賽', body: 'F1 · {result}', tag: 'end:f1:600', kind: 'end', check: { espn: 'racing/f1', event: '600', session: 'Race', day: '20261011' } };
  assert.deepEqual(cleanItems([item])[0].check, { espn: 'racing/f1', event: '600', session: 'Race', day: '20261011' });
  let state = 'in';
  const asked = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async url => {
    if (!String(url).includes('espn.com')) return new Response(null, { status: 201 });
    asked.push(String(url));
    const driver = (n, order) => ({ order, athlete: { shortName: n } });
    return new Response(JSON.stringify({ events: [{ id: '600', competitions: [{ type: { abbreviation: 'Qual' }, status: { type: { state: 'post' } }, competitors: [driver('G. Russell', 1)] }, { type: { abbreviation: 'Race' }, status: { type: { state } }, competitors: [driver('L. Norris', 3), driver('K. Antonelli', 1), driver('G. Russell', 2)] }] }] }), { status: 200 });
  };
  try {
    await post(match, '/push/schedule', { items: [item] });
    const now = Date.now();
    assert.equal((await sendDue(env, now + 120_000)).sent, 0);
    state = 'post';
    assert.equal((await sendDue(env, now + 120_000 + 16 * 60_000)).sent, 1);
    assert.match(asked[0], /racing\/f1\/scoreboard\?dates=20261011/);
  } finally {
    globalThis.fetch = realFetch;
  }
});
