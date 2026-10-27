// Web Push: the message encryption against RFC 8291's own example, and the
// notice lists the Worker keeps.
import test from 'node:test';
import assert from 'node:assert/strict';
import { encryptPush, cleanItems, sendDue, handlePush, runCheck, pushEndpoint, overNow } from '../push.js';

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
      { at: now + 120_000, check: { espn: '../x', event: 'a' } },
      { at: now + 7_200_000, title: 'domain', url: 'https://orbit.jaypengx.com/money/#cal' }
    ],
    now
  );
  assert.deepEqual(list.map(x => x.title), ['soon', '', '台積電', 'later', 'domain']);
  assert.equal(list[3].url, '');
  assert.equal(list[4].url, 'https://orbit.jaypengx.com/money/#cal');
  assert.deepEqual(list[1].check, { espn: 'football/nfl', event: '401' });
});

// A KV that lives in memory.
// KV as Workers has it: a key's metadata comes back with a list.
const memoryKv = () => {
  const m = new Map();
  const meta = new Map();
  return {
    get: async (k, type) => (m.has(k) ? (type === 'json' ? JSON.parse(m.get(k)) : m.get(k)) : null),
    put: async (k, v, o) => void (m.set(k, v), meta.set(k, o?.metadata)),
    delete: async k => void (m.delete(k), meta.delete(k)),
    list: async ({ prefix = '' } = {}) => ({ keys: [...m.keys()].filter(k => k.startsWith(prefix)).map(name => ({ name, ...(meta.get(name) ? { metadata: meta.get(name) } : {}) })), list_complete: true }),
    m,
    meta
  };
};

test('subscribe, schedule, then the due notices go out', async () => {
  const kv = memoryKv();
  const env = { RATE_LIMIT_KV: kv };
  const session = { d: 'acct', a: 'match' };
  const post = (path, body) => handlePush(new Request(`https://w/${path}`, { method: 'POST', body: JSON.stringify(body) }), env, {}, session, path);
  const subKeys = { p256dh: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4', auth: 'BTBZMqHH6r4Tts7J_aSIgg' };
  assert.equal((await post('/push/subscribe', { sub: { endpoint: 'https://fcm.googleapis.com/fcm/send/abc', keys: subKeys }, lang: 'zh' })).status, 200);
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
  assert.equal(sent[0].url, 'https://fcm.googleapis.com/fcm/send/abc');
  assert.match(sent[0].init.headers.Authorization, /^vapid t=[\w-]+\.[\w-]+\.[\w-]+, k=[\w-]+$/);
  const record = JSON.parse(kv.m.get('push:acct:match'));
  assert.deepEqual(record.items.map(x => x.title), ['tomorrow']);
  assert.equal(kv.meta.get('push:acct:match').due, record.items[0].at, "the list's next time on its own key");
  assert.equal(kv.m.has('push:due'), false, 'no shared key every phone rewrites');
});

test('a kind switched off in any app (or notices off) is never sent', async () => {
  const kv = memoryKv();
  const env = { RATE_LIMIT_KV: kv };
  const post = (session, path, body) => handlePush(new Request(`https://w/${path}`, { method: 'POST', body: JSON.stringify(body) }), env, {}, session, path);
  const stock = { d: 'acct', a: 'stock' };
  const subKeys = { p256dh: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4', auth: 'BTBZMqHH6r4Tts7J_aSIgg' };
  await post(stock, '/push/subscribe', { sub: { endpoint: 'https://fcm.googleapis.com/fcm/send/s', keys: subKeys } });
  const now = Date.now();
  await post(stock, '/push/schedule', { items: [{ at: now + 10_000, title: '到價', kind: 'alert' }, { at: now + 20_000, title: '定期定額', kind: 'fill' }] });
  assert.equal(JSON.parse(kv.m.get('push:acct:stock')).items[0].kind, 'alert');
  // Turned off in another app (Sports' account sheet).
  await post({ d: 'acct', a: 'match' }, '/push/prefs', { on: true, off: ['stock:alert', 'bad key'] });
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
  assert.equal((await post('/push/subscribe', { sub: { endpoint: 'https://fcm.googleapis.com/fcm/send/t', keys: subKeys } })).status, 200, 'Transit may push');
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
  await post(match, '/push/subscribe', { sub: { endpoint: 'https://fcm.googleapis.com/fcm/send/s', keys: subKeys } });
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
  const kv = memoryKv();
  const env = { RATE_LIMIT_KV: kv };
  const post = (session, path, body) => handlePush(new Request(`https://w/${path}`, { method: 'POST', body: JSON.stringify(body) }), env, {}, session, path);
  const match = { d: 'acct', a: 'match' };
  await post(match, '/push/subscribe', { sub: { endpoint: 'https://fcm.googleapis.com/fcm/send/s', keys: { p256dh: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4', auth: 'BTBZMqHH6r4Tts7J_aSIgg' } } });
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

test("a race's podium in the app's own names for the drivers", async () => {
  const check = cleanItems([{ at: Date.now() + 60_000, title: 't', check: { espn: 'racing/f1', event: '600', session: 'Race', day: '20261011', zh: { Antonelli: '安東內利', Russell: '羅素', Hulkenberg: '霍肯伯格', 'bad<': 'x' } } }])[0].check;
  assert.deepEqual(Object.keys(check.zh), ['Antonelli', 'Russell', 'Hulkenberg']);
  const realFetch = globalThis.fetch;
  const d = (name, short, order) => ({ order, athlete: { displayName: name, shortName: short } });
  globalThis.fetch = async () => new Response(JSON.stringify({ events: [{ id: '600', competitions: [{ type: { abbreviation: 'Race' }, status: { type: { state: 'post' } }, competitors: [d('Kimi Antonelli', 'K. Antonelli', 1), d('Nico Hülkenberg', 'N. Hülkenberg', 2), d('Lando Norris', 'L. Norris', 3)] }] }] }), { status: 200 });
  try {
    assert.equal((await runCheck(check, 'zh', {})).result, '安東內利奪冠 · 頒獎台：安東內利、霍肯伯格、L. Norris');
    assert.equal((await runCheck(check, 'en', {})).result, 'K. Antonelli wins · podium: K. Antonelli, N. Hülkenberg, L. Norris');
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('a pick starting is sent once, even when the open app sends its list again just after the start', async () => {
  const kv = memoryKv();
  const env = { RATE_LIMIT_KV: kv };
  const post = (session, path, body) => handlePush(new Request(`https://w/${path}`, { method: 'POST', body: JSON.stringify(body) }), env, {}, session, path);
  const match = { d: 'acct', a: 'match' };
  const subKeys = { p256dh: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4', auth: 'BTBZMqHH6r4Tts7J_aSIgg' };
  await post(match, '/push/subscribe', { sub: { endpoint: 'https://fcm.googleapis.com/fcm/send/s', keys: subKeys } });
  const start = Date.now() - 30_000;
  const pick = at => ({ items: [{ at, title: '新加坡站 排位賽 開始', body: 'F1 · MAX5台', tag: 'match:pick:f1:600~Qual', kind: 'pick' }] });
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(null, { status: 201 });
  try {
    // The app open at the start: its list sent again with the start just passed, the item still on it.
    await post(match, '/push/schedule', pick(start));
    assert.equal((await sendDue(env, Date.now())).sent, 1);
    await post(match, '/push/schedule', pick(start));
    assert.equal(JSON.parse(kv.m.get('push:acct:match')).items.length, 0, 'told already');
    // Tomorrow's of the same tag is another notice.
    await post(match, '/push/schedule', pick(start + 86_400_000));
    assert.equal(JSON.parse(kv.m.get('push:acct:match')).items.length, 1);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("each list's due time is its own: two phones scheduling at once both keep theirs, and a list kept the old way is moved over once", async () => {
  const kv = memoryKv();
  const env = { RATE_LIMIT_KV: kv };
  const keys = { p256dh: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4', auth: 'BTBZMqHH6r4Tts7J_aSIgg' };
  const post = (session, path, body) => handlePush(new Request(`https://w/${path}`, { method: 'POST', body: JSON.stringify(body) }), env, {}, session, path);
  const now = Date.now();
  const a = { d: 'a1', a: 'match' };
  const b = { d: 'b2', a: 'orbit' };
  await Promise.all([post(a, '/push/subscribe', { sub: { endpoint: 'https://fcm.googleapis.com/fcm/send/a', keys } }), post(b, '/push/subscribe', { sub: { endpoint: 'https://fcm.googleapis.com/fcm/send/b', keys } })]);
  await Promise.all([post(a, '/push/schedule', { items: [{ at: now + 10_000, title: 'a' }] }), post(b, '/push/schedule', { items: [{ at: now + 20_000, title: 'b' }] })]);
  // One list from before, its time only in the old shared key.
  kv.m.set('push:c3:vocab', JSON.stringify({ sub: { endpoint: 'https://fcm.googleapis.com/fcm/send/c', keys }, items: [{ at: now + 30_000, title: 'c' }] }));
  kv.m.set('push:due', JSON.stringify({ 'push:c3:vocab': now + 30_000 }));
  const sent = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async url => (sent.push(String(url)), new Response(null, { status: 201 }));
  try {
    assert.equal((await sendDue(env, now + 60_000)).sent, 3);
  } finally {
    globalThis.fetch = realFetch;
  }
  assert.deepEqual(sent.sort(), ['https://fcm.googleapis.com/fcm/send/a', 'https://fcm.googleapis.com/fcm/send/b', 'https://fcm.googleapis.com/fcm/send/c']);
  assert.equal(kv.m.has('push:due'), false);
});

test("a bus alert is told once: its list sent again by the app (opened from the notice) isn't told again", async () => {
  const kv = memoryKv();
  const env = { RATE_LIMIT_KV: kv, TDX_CLIENT_ID: 'id', TDX_CLIENT_SECRET: 's', TDX_PER_MIN: '100' };
  const session = { d: 'acct', a: 'transit' };
  const post = (p, body) => handlePush(new Request(`https://w${p}`, { method: 'POST', body: JSON.stringify(body) }), env, {}, session, p);
  await post('/push/subscribe', { sub: { endpoint: 'https://fcm.googleapis.com/fcm/send/t', keys: { p256dh: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4', auth: 'BTBZMqHH6r4Tts7J_aSIgg' } } });
  const now = Date.now();
  const bus = { path: 'advanced/v2/Bus/EstimatedTimeOfArrival/City/Hsinchu/PassThrough/Station/1234', route: 'HSZ0058', dir: 0, min: 5 };
  const item = { at: now, until: now + 3_600_000, title: '5608 快到了', body: '{result}', tag: 'bus:abc', kind: 'bus', check: { bus } };
  await post('/push/schedule', { items: [item] });
  let sec = 600;
  let pushes = 0;
  const was = globalThis.fetch;
  globalThis.fetch = async url => {
    if (String(url).includes('openid-connect/token')) return Response.json({ access_token: 'T', expires_in: 86400 });
    if (String(url).startsWith('https://tdx.')) return Response.json([{ RouteUID: 'HSZ0058', Direction: 0, EstimateTime: sec, StopStatus: 0 }]);
    pushes++;
    return new Response(null, { status: 201 });
  };
  try {
    await sendDue(env, now); // 10 minutes off: moved on a run
    sec = 200;
    await sendDue(env, now + 120_000);
    assert.equal(pushes, 1);
    await post('/push/schedule', { items: [item] });
    await sendDue(env, now + 240_000);
    assert.equal(pushes, 1);
  } finally {
    globalThis.fetch = was;
  }
});

test("a bus alert isn't told from a copy kept while TDX fails (the bus has gone by): it waits for a fresh one", async () => {
  const path = 'advanced/v2/Bus/EstimatedTimeOfArrival/City/Hsinchu/PassThrough/Station/1234';
  const now = Date.now();
  const nineAgo = now - 9 * 60_000;
  const store = new Map();
  const cache = {
    match: async req => (store.has(req.url) ? new Response(store.get(req.url).body, { headers: store.get(req.url).headers }) : undefined),
    put: async (req, res) => void store.set(req.url, { body: await res.text(), headers: Object.fromEntries(res.headers) })
  };
  await cache.put(new Request(`https://transit-cache.orbit/${path}?$format=JSON`), new Response(JSON.stringify([{ RouteUID: 'HSZ0058', Direction: 0, EstimateTime: 120, StopStatus: 0, DataTime: new Date(nineAgo).toISOString() }]), { headers: { 'X-Fetched-At': String(nineAgo) } }));
  const [wasFetch, wasCaches] = [globalThis.fetch, globalThis.caches];
  globalThis.caches = { default: cache };
  globalThis.fetch = async url => (String(url).includes('token') ? Response.json({ access_token: 'T', expires_in: 86400 }) : new Response('err', { status: 503 }));
  try {
    assert.equal(await runCheck({ bus: { path, route: 'HSZ0058', dir: 0, min: 5 } }, 'zh', { RATE_LIMIT_KV: memoryKv(), TDX_CLIENT_ID: 'id', TDX_CLIENT_SECRET: 's', TDX_PER_MIN: '100' }), null);
  } finally {
    globalThis.fetch = wasFetch;
    globalThis.caches = wasCaches;
  }
});

test('a subscription only to a real push service (Apple, FCM, Mozilla, Windows), https only; an old record elsewhere is never sent to', async () => {
  for (const ok of ['https://web.push.apple.com/QGuQ', 'https://fcm.googleapis.com/fcm/send/abc', 'https://updates.push.services.mozilla.com/wpush/v2/x', 'https://wns2-par02p.notify.windows.com/w/?token=x']) assert.ok(pushEndpoint(ok), ok);
  for (const bad of ['http://fcm.googleapis.com/fcm/send/abc', 'https://push.example/abc', 'https://fcm.googleapis.com.evil.com/x', 'https://evil.com/fcm.googleapis.com', 'https://notify.windows.com.evil.com/x', 'https://evilnotify.windows.com/x', 'https://user@fcm.googleapis.com/x', 'https://fcm.googleapis.com:8443/x', 'https://127.0.0.1/x', 'not a url', null, 42]) assert.ok(!pushEndpoint(bad), String(bad));
  const kv = memoryKv();
  const env = { RATE_LIMIT_KV: kv };
  const session = { d: 'acct', a: 'match' };
  const post = (path, body) => handlePush(new Request(`https://w/${path}`, { method: 'POST', body: JSON.stringify(body) }), env, {}, session, path);
  const keys = { p256dh: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4', auth: 'BTBZMqHH6r4Tts7J_aSIgg' };
  assert.equal((await post('/push/subscribe', { sub: { endpoint: 'https://internal.example/admin', keys } })).status, 400);
  assert.equal((await post('/push/subscribe', { sub: { endpoint: 'http://fcm.googleapis.com/fcm/send/a', keys } })).status, 400);
  const now = Date.now();
  kv.m.set('push:old:match', JSON.stringify({ sub: { endpoint: 'https://internal.example/admin', keys }, items: [{ at: now - 1000, title: 'x' }] }));
  kv.meta.set('push:old:match', { due: now - 1000 });
  const sent = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async url => (sent.push(String(url)), new Response(null, { status: 201 }));
  try {
    await sendDue(env, now);
  } finally {
    globalThis.fetch = realFetch;
  }
  assert.deepEqual(sent, []);
});

test('a check or a push that hangs is given up on (the cron sends the rest)', async () => {
  const real = globalThis.fetch;
  const signals = [];
  globalThis.fetch = async (url, o) => (signals.push(o?.signal), { ok: true, status: 200, json: async () => ({ chart: { result: [{ meta: { regularMarketPrice: 10 } }] } }) });
  try {
    await runCheck({ yahoo: '2330.TW', op: 'above', price: 5 }, 'zh', {});
    await runCheck({ espn: 'baseball/mlb', event: '1' }, 'zh', {});
    await runCheck({ espn: 'racing/f1', event: '1', session: 'Race', day: '20261018' }, 'zh', {});
  } finally {
    globalThis.fetch = real;
  }
  assert.equal(signals.length, 3);
  assert.ok(signals.every(s => s instanceof AbortSignal));
});

test("a game's final: asked at every run while it runs long, not written each time, told at the next run once over", async () => {
  const kv = memoryKv();
  const env = { RATE_LIMIT_KV: kv };
  const post = (session, path, body) => handlePush(new Request(`https://w/${path}`, { method: 'POST', body: JSON.stringify(body) }), env, {}, session, path);
  const match = { d: 'acct', a: 'match' };
  await post(match, '/push/subscribe', { sub: { endpoint: 'https://fcm.googleapis.com/fcm/send/s', keys: { p256dh: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4', auth: 'BTBZMqHH6r4Tts7J_aSIgg' } } });
  const now = Date.now();
  await post(match, '/push/schedule', { items: [{ at: now, title: '道奇 vs 教士', body: '{result}', tag: 'end:mlb:1', kind: 'end', check: { espn: 'baseball/mlb', event: '1' } }] });
  let state = { state: 'in', name: 'STATUS_IN_PROGRESS', shortDetail: 'Top 9th' };
  let asks = 0;
  const pushes = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async url => {
    if (!String(url).includes('espn.com')) return pushes.push(url), new Response(null, { status: 201 });
    asks++;
    return new Response(JSON.stringify({ header: { competitions: [{ status: { period: 9, type: state }, competitors: [{ homeAway: 'away', score: '3', team: { shortDisplayName: '教士' } }, { homeAway: 'home', score: '5', team: { shortDisplayName: '道奇' } }] }] } }), { status: 200 });
  };
  const puts = [];
  const put = kv.put;
  kv.put = async (k, v, o) => (puts.push(k), put(k, v, o));
  try {
    assert.equal((await sendDue(env, now + 60_000)).sent, 0);
    assert.equal((await sendDue(env, now + 180_000)).sent, 0);
    assert.equal((await sendDue(env, now + 300_000)).sent, 0);
    assert.equal(asks, 3, 'asked at every run, not every 15 minutes');
    assert.equal(puts.length, 1, 'written once (its first miss), not at every run');
    // The top of the 9th done, the home side ahead: ESPN still says 'in', the game is over.
    state = { state: 'in', name: 'STATUS_IN_PROGRESS', shortDetail: 'Mid 9th' };
    assert.equal((await sendDue(env, now + 420_000)).sent, 1);
    assert.equal(JSON.parse(kv.m.get('push:acct:match')).items.length, 0);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('over from the score while ESPN still says in, only when nothing can change it (the kit rule)', () => {
  const comp = (period, type, away, home) => ({ status: { period, type: { state: 'in', name: 'STATUS_IN_PROGRESS', ...type } }, competitors: [{ homeAway: 'away', score: String(away) }, { homeAway: 'home', score: String(home) }] });
  const mlb = 'baseball/mlb';
  assert.equal(overNow(comp(9, { shortDetail: 'Mid 9th' }, 2, 4), mlb), true);
  assert.equal(overNow(comp(9, { shortDetail: 'Mid 9th' }, 4, 2), mlb), false, 'the home side still bats');
  assert.equal(overNow(comp(9, { shortDetail: 'Bot 9th' }, 4, 5), mlb), true, 'a walk-off');
  assert.equal(overNow(comp(9, { shortDetail: 'Bot 9th' }, 5, 4), mlb), false);
  assert.equal(overNow(comp(10, { shortDetail: 'End 10th' }, 5, 4), mlb), true);
  assert.equal(overNow(comp(9, { shortDetail: 'Top 9th' }, 1, 4), mlb), false);
  assert.equal(overNow(comp(8, { shortDetail: 'Mid 8th' }, 1, 4), mlb), false);
  assert.equal(overNow(comp(8, { shortDetail: 'Bot 8th' }, 1, 4), mlb), false);
  assert.equal(overNow(comp(9, { shortDetail: 'End 9th' }, 4, 4), mlb), false, 'level: extra innings');
  const nba = 'basketball/nba';
  assert.equal(overNow(comp(4, { name: 'STATUS_END_PERIOD', shortDetail: 'End of 4th' }, 100, 98), nba), true);
  assert.equal(overNow(comp(4, { name: 'STATUS_END_PERIOD', shortDetail: 'End of 4th' }, 100, 100), nba), false, 'overtime');
  assert.equal(overNow(comp(4, { shortDetail: '0.4 - 4th' }, 100, 98), nba), false, 'the clock still running');
  assert.equal(overNow(comp(3, { name: 'STATUS_END_PERIOD', shortDetail: 'End of 3rd' }, 100, 70), nba), false);
  assert.equal(overNow(comp(2, { name: 'STATUS_END_PERIOD', shortDetail: 'End of 2nd Half' }, 1, 0), 'soccer/eng.1'), false, "soccer waits for ESPN's full time");
  assert.equal(overNow({ ...comp(9, { shortDetail: 'Mid 9th' }, 2, 4), status: { period: 9, type: { state: 'post' } } }, mlb), false);
});

test("a CPBL game's final from TheSportsDB's day list (ESPN doesn't carry CPBL), asked at every run", async () => {
  const item = { at: Date.now() - 60_000, until: Date.now() + 3_600_000, title: '味全龍 vs 中信兄弟', body: '{result} · 中華職棒', tag: 'end:cpbl:cpbl-tsdb-2618131', kind: 'end', check: { tsdb: '2618131', day: '2026-10-21', names: ['味全龍', '中信兄弟'] } };
  assert.deepEqual(cleanItems([item])[0].check, item.check);
  assert.equal(cleanItems([{ ...item, check: { tsdb: 'x/../', day: '2026-10-21' } }])[0].check, undefined);
  let status = '';
  const urls = [];
  const real = globalThis.fetch;
  globalThis.fetch = async url => (urls.push(String(url)), new Response(JSON.stringify({ events: [{ idEvent: '2618131', strHomeTeam: 'CTBC Brothers', strAwayTeam: 'Wei Chuan Dragons', strStatus: status, intHomeScore: '5', intAwayScore: null }] }), { status: 200 }));
  try {
    status = 'NS';
    assert.equal(await runCheck(item.check, 'zh', {}), null);
    status = 'IN7';
    assert.equal(await runCheck(item.check, 'zh', {}), null);
    status = 'FT';
    assert.deepEqual(await runCheck(item.check, 'zh', {}), { title: '味全龍 0 : 5 中信兄弟', body: '中信兄弟 贏了', result: '中信兄弟 贏了' });
    status = 'POST';
    assert.equal((await runCheck(item.check, 'en', {})).result, 'Postponed');
  } finally {
    globalThis.fetch = real;
  }
  assert.ok(urls.every(u => u.includes('eventsday.php?d=2026-10-21&l=5111')));
});

test("a CPBL final when TheSportsDB turns the proxy away (429): asked again through the Taiwan relay", async () => {
  const check = { tsdb: '2618131', day: '2026-10-21', names: ['味全龍', '中信兄弟'] };
  const real = globalThis.fetch;
  globalThis.fetch = async () => new Response('', { status: 429 });
  const via = [];
  const env = { GEMINI_RELAY: { fetch: async url => (via.push(String(url)), new Response(JSON.stringify({ events: [{ idEvent: '2618131', strStatus: 'FT', intHomeScore: '5', intAwayScore: '4' }] }), { status: 200 })) } };
  try {
    assert.equal((await runCheck(check, 'zh', env)).title, '味全龍 4 : 5 中信兄弟');
    await assert.rejects(runCheck(check, 'zh', {}), /tsdb 429/);
  } finally {
    globalThis.fetch = real;
  }
  assert.equal(via.length, 1);
  assert.ok(via[0].startsWith('https://gemini-relay/?to=' + encodeURIComponent('https://www.thesportsdb.com/api/v1/json/123/eventsday.php?d=2026-10-21&l=5111')));
});
