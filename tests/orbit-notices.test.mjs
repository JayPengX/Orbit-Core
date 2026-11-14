// Notices inside an Orbit (docs/ORBIT.md rule 24): one phone endpoint is shared by all its apps, yet each app's
// notices are subscribed, stored, switched, named, tagged and opened on their own.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { handlePush, sendDue, decorate } from '../push.js';
import { ADMIN_TOOLS } from '../eco-admin.js';
import { fakeD1 } from './fake-d1.mjs';
import { WALLET_COLLECTION, emptyWallet } from '../eco.js';

const KEYS = { p256dh: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4', auth: 'BTBZMqHH6r4Tts7J_aSIgg' };
const sub = id => ({ endpoint: `https://fcm.googleapis.com/fcm/send/${id}`, keys: KEYS });
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
const world = () => {
  const kv = memoryKv();
  const env = { RATE_LIMIT_KV: kv };
  const post = (app, path, body) => handlePush(new Request(`https://w${path}`, { method: 'POST', body: JSON.stringify(body) }), env, {}, { d: 'acct', a: app }, path);
  return { kv, env, post };
};
const rec = (kv, app) => JSON.parse(kv.m.get(`push:acct:${app}`) || 'null');
const ORBIT = { via: 'orbit', o: 'tagA', apps: ['match', 'weather'] };
const sendAll = async (env, now) => {
  const sent = [];
  const real = globalThis.fetch;
  globalThis.fetch = async url => (sent.push(url), new Response(null, { status: 201 }));
  try {
    return { n: (await sendDue(env, now)).sent, sent };
  } finally {
    globalThis.fetch = real;
  }
};

// 1: stored per pass and app though the endpoint is shared; off per app.
test('1: one shared endpoint, one record per app; an app switched off never stops another', async () => {
  const { kv, env, post } = world();
  const now = Date.now();
  for (const app of ['match', 'weather']) {
    assert.equal((await post(app, '/push/subscribe', { sub: sub('shared'), ...ORBIT })).status, 200);
    await post(app, '/push/schedule', { items: [{ at: now + 1000, title: `${app} now`, tag: 'a' }] });
  }
  assert.equal(rec(kv, 'match').sub.endpoint, rec(kv, 'weather').sub.endpoint);
  assert.equal(rec(kv, 'match').items[0].title, 'match now');
  assert.equal(rec(kv, 'weather').items[0].title, 'weather now');
  // Sports off (its own switch), Weather's still sent.
  await post('match', '/push/prefs', { on: true, off: ['match:all'] });
  assert.deepEqual(JSON.parse(kv.m.get('push:prefs:acct')).off, ['match:all']);
  const r = await sendAll(env, now);
  assert.equal(r.n, 1);
  assert.equal(rec(kv, 'weather').items.length, 0, 'weather was sent');
  assert.equal(rec(kv, 'match').items.length, 0, 'sports dropped, not sent');
});

// 2: the app's name and its own tag on every push.
test('2: a push names its app and keeps its tag per app', () => {
  const same = { title: '開賽', tag: 'x' };
  const a = decorate('match', { via: 'orbit', o: 'tagA' }, same);
  const b = decorate('weather', { via: 'orbit' }, same);
  assert.equal(a.title, 'Sports・開賽');
  assert.equal(a.tag, 'match:x');
  assert.equal(b.tag, 'weather:x');
  assert.notEqual(a.tag, b.tag);
  assert.equal(a.app, 'match');
  assert.equal(a.o, 'tagA');
  assert.equal(decorate('match', { via: 'orbit' }, { title: 'Sports 比分', tag: 'match:x' }).title, 'Sports 比分', 'named once');
  assert.equal(decorate('match', {}, same).title, '開賽', 'a separate app already is its own');
});

// 3: a tap opens the app inside the Orbit that got it.
const swSource = readFileSync(new URL('../kit/sw.js', import.meta.url), 'utf8');
function tap(scope, data, clients) {
  const handlers = {};
  const did = [];
  const self = { ORBIT_SW: { cache: 'orbit-test-v1' }, location: { origin: 'https://orbit.test' }, registration: { scope }, addEventListener: (t, f) => (handlers[t] = f), navigator: { onLine: true }, clients: { matchAll: async () => clients, openWindow: async u => did.push(['open', u]) } };
  vm.runInNewContext(swSource, { self, caches: {}, fetch: async () => new Response(''), Response, Request, Headers, URL, AbortController, MessageChannel, setTimeout, clearTimeout, crypto, console, Promise, Date });
  let done;
  handlers.notificationclick({ notification: { close() {}, data }, waitUntil: p => (done = p) });
  return done.then(() => did);
}
test('3: Orbit’s worker opens another app’s notice inside Orbit (/app/?open=), in its own Orbit', async () => {
  const url = 'https://orbit.test/sports/#game=nba/1';
  assert.deepEqual(await tap('https://orbit.test/app/', { url }, []), [['open', `https://orbit.test/app/?open=${encodeURIComponent('/sports/#game=nba/1')}`]]);
  assert.deepEqual(await tap('https://orbit.test/app/', { url, o: 'tagA' }, []), [['open', `https://orbit.test/app/?o=tagA&open=${encodeURIComponent('/sports/#game=nba/1')}`]]);
  // A separate app's worker keeps its own address.
  assert.deepEqual(await tap('https://orbit.test/sports/', { url }, []), [['open', url]]);
});

// 4: Orbit before a separate app; an app outside the Orbit's list gets nothing.
test('4: a separate app never takes an app from a live Orbit; an app outside the Orbit’s list is refused and dropped', async () => {
  const { kv, env, post } = world();
  await post('match', '/push/subscribe', { sub: sub('orbit'), ...ORBIT });
  // The separate Sports app (no via) on the same phone, another endpoint: the Orbit's stays.
  const r = await (await post('match', '/push/subscribe', { sub: sub('standalone') })).json();
  assert.equal(r.skipped, 'orbit');
  assert.equal(rec(kv, 'match').sub.endpoint, sub('orbit').endpoint);
  // The other way: Orbit takes over a separate app's.
  await post('weather', '/push/subscribe', { sub: sub('standalone-w') });
  await post('weather', '/push/subscribe', { sub: sub('orbit'), ...ORBIT });
  assert.equal(rec(kv, 'weather').via, 'orbit');
  // Transit isn't in this Orbit's list.
  assert.equal((await post('transit', '/push/subscribe', { sub: sub('orbit'), ...ORBIT })).status, 403);
  assert.equal(rec(kv, 'transit'), null);
  // The Orbit drops Weather: the next subscribe (any app) removes Weather's record, not another Orbit's.
  await post('transit', '/push/subscribe', { sub: sub('orbit'), via: 'orbit', o: 'tagB', apps: ['transit'] });
  assert.ok(rec(kv, 'weather'), 'another Orbit’s apps stay');
  await post('match', '/push/subscribe', { sub: sub('orbit'), via: 'orbit', o: 'tagA', apps: ['match'] });
  assert.equal(rec(kv, 'weather'), null);
  assert.ok(rec(kv, 'match'));
});

// 5: the admin test reports per app.
test('5: the admin push test answers for each app, with its name and tag', async () => {
  const ID = 'abcdef1234567890';
  const env = { STORE: fakeD1(), RATE_LIMIT_KV: { list: async () => ({ keys: [], list_complete: true }) } };
  const deps = { now: () => 1_800_000_000_000, fsList: async (_e, c) => (c === WALLET_COLLECTION ? [{ id: ID, payload: JSON.stringify(emptyWallet(1)), updateTime: 't' }] : []), fsDelete: async () => {}, fsBatch: async () => {} };
  const { pushStore } = await import('../push.js');
  const store = pushStore(env);
  const shared = { endpoint: 'https://fcm.googleapis.com/fcm/send/shared', keys: KEYS };
  await store.put(`push:${ID}:match`, JSON.stringify({ sub: shared, via: 'orbit', items: [] }));
  await store.put(`push:${ID}:weather`, JSON.stringify({ sub: shared, via: 'orbit', items: [] }));
  await store.put(`push:${ID}:transit`, JSON.stringify({ sub: { endpoint: 'https://fcm.googleapis.com/fcm/send/other', keys: KEYS }, items: [] }));
  const real = globalThis.fetch;
  globalThis.fetch = async url => new Response(null, { status: /other/.test(url) ? 410 : 201 });
  try {
    const all = await ADMIN_TOOLS['push-test']({ env, deps, body: { wallet: ID.slice(0, 8) } });
    assert.deepEqual(all.apps.map(r => [r.app, r.name, r.state]).sort(), [['match', 'Sports', 'sent'], ['transit', 'Transit', 'gone'], ['weather', 'Weather', 'sent']]);
    assert.equal(all.ok, false);
    assert.equal(all.apps.find(r => r.app === 'match').shared, true);
    assert.equal(all.apps.find(r => r.app === 'transit').shared, false);
    assert.match(all.apps.find(r => r.app === 'match').title, /^Sports・/);
    assert.ok(all.apps.find(r => r.app === 'weather').tag.startsWith('weather:'));
    // Transit's was gone and removed; the shared two stay.
    assert.equal(await store.get(`push:${ID}:transit`), null);
    assert.ok(await store.get(`push:${ID}:match`));
    // One app asked for: its own answer.
    assert.equal((await ADMIN_TOOLS['push-test']({ env, deps, body: { wallet: ID, app: 'match' } })).app, 'match');
  } finally {
    globalThis.fetch = real;
  }
});

// The page's side: an app's switch, and the Orbit's list.
test('client: an app’s own switch; an app outside the Orbit’s list never subscribes; the list goes with the subscription', async () => {
  const mem = new Map();
  const store = { getItem: k => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: k => mem.delete(k) };
  const session = new Map([['orbit.suite', '1'], ['orbit.which', '']]);
  const ss = { getItem: k => session.get(k) ?? null, setItem: (k, v) => session.set(k, String(v)), removeItem: k => session.delete(k) };
  const posts = [];
  const pm = { getSubscription: async () => null, subscribe: async () => ({ endpoint: 'https://fcm.googleapis.com/fcm/send/e', options: {}, toJSON: () => ({ endpoint: 'https://fcm.googleapis.com/fcm/send/e', keys: KEYS }) }) };
  Object.assign(globalThis, { localStorage: store, sessionStorage: ss });
  Object.defineProperty(globalThis, 'navigator', { value: { serviceWorker: { getRegistration: async () => ({ pushManager: pm }), ready: new Promise(() => {}) }, userAgent: '' }, configurable: true });
  globalThis.Notification = { permission: 'granted' };
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    if (String(url).endsWith('/key')) return Response.json({ key: 'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8' });
    posts.push({ url: String(url), body: JSON.parse(init.body) });
    return Response.json({ ok: true });
  };
  try {
    const o = await import('../kit/orbit.mjs');
    const { MINE_KEY } = await import('../kit/orbit-mine.mjs');
    o.setNotifyOn(true);
    assert.equal(o.kindOn('match', 'x'), true);
    o.setAppNotices('match', false);
    assert.equal(o.kindOn('match', 'x'), false);
    assert.equal(o.kindOn('match'), false);
    assert.equal(o.kindOn('weather', 'x'), true, 'weather untouched');
    o.setAppNotices('match', true);
    assert.equal(o.kindOn('match', 'x'), true);
    // This Orbit holds Sports and Weather (set up as an Orbit of two).
    store.setItem(MINE_KEY, JSON.stringify({ '': { apps: ['match', 'weather'], t: 1 } }));
    const s = app => ({ app, lang: 'zh', token: 't', ensureToken: async () => 't' });
    assert.equal(await o.enablePush(s('transit'), true), false, 'not in the list: nothing');
    assert.equal(posts.length, 0);
    assert.equal(await o.enablePush(s('match'), true), true);
    const sent = posts.find(p => p.url.includes('/subscribe'));
    assert.deepEqual([sent.body.via, sent.body.apps], ['orbit', ['match', 'weather']]);
  } finally {
    globalThis.fetch = realFetch;
  }
});
