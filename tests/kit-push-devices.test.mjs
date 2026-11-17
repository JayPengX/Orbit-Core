// The kit tells the Worker which device is which when a sign-in ends (2026-11-17, push.js "Only while signed
// in"): signing out here drops this device from the account's notice lists before it is wiped; 登出其他所有裝置
// and a new pass carry this device's own push endpoints (`keep`), so only it is sent the account's notices.
import test from 'node:test';
import assert from 'node:assert/strict';

const storage = map => ({ getItem: k => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: k => map.delete(k), key: i => [...map.keys()][i] ?? null, get length() { return map.size; } });
const store = new Map();
globalThis.localStorage = storage(store);
globalThis.sessionStorage = storage(new Map());
const kit = await import('../kit/orbit.mjs');

const PHONE = 'https://web.push.apple.com/abc';
const OTHER = 'https://fcm.googleapis.com/fcm/send/xyz';
// Signed in, with what enablePush leaves once the Worker has this device (one mark an app).
function signedIn(marks = { weather: `${PHONE}|orbit-1:weather,match|Tue Nov 17 2026`, match: `${PHONE}|orbit-1:weather,match|Tue Nov 17 2026`, stock: `${OTHER}|Tue Nov 17 2026` }) {
  store.clear();
  const claims = Buffer.from(JSON.stringify({ k: 'ref', d: 'abcdef0123456789abcdef', s: 'S', g: 0, e: 9e15 })).toString('base64url');
  store.set('orbit.refresh', `${claims}.sig`);
  store.set('orbit.account', 'abcdef0123456789');
  for (const [app, mark] of Object.entries(marks)) store.set(`orbit.push.sub.${app}`, mark);
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    const u = new URL(url);
    const body = JSON.parse(init.body || '{}');
    calls.push({ path: u.pathname.replace(/^\/api/, ''), qt: u.searchParams.get('qt'), body, signedIn: store.has('orbit.account') });
    if (u.pathname.endsWith('/push/forget')) return new Response('{"ok":true}', { status: 200 });
    return new Response(JSON.stringify({ token: 'tok', wallet: { entries: [] }, active: true, ...(body.op === 'rotate' ? { passcode: 'ABCDE23456' } : {}) }), { status: 200 });
  };
  return { s: kit.orbitSession('weather', { heartbeat: 1e9 }), calls };
}

test('signing out here: the Worker drops this device from the account’s notices first, then the device is wiped', async () => {
  const { s, calls } = signedIn();
  await s.ensureToken();
  await s.signOut();
  const forget = calls.find(c => c.path.endsWith('/push/forget'));
  assert.ok(forget, 'the Worker was told');
  assert.deepEqual(forget.body.endpoints, [PHONE, OTHER], 'each endpoint this device gave, once');
  assert.equal(forget.qt, 'tok', 'by the session still running');
  assert.equal(forget.signedIn, true, 'before the wipe');
  assert.equal(store.has('orbit.account'), false, 'signed out');
  assert.equal(store.has('orbit.push.sub.weather'), false);
});

test('signing out here with no notices on this device: nothing asked, signed out all the same', async () => {
  const { s, calls } = signedIn({});
  await s.ensureToken();
  await s.signOut();
  assert.equal(calls.some(c => c.path.includes('/push/')), false);
  assert.equal(store.has('orbit.account'), false);
});

test('signing out here while the Worker can’t be reached: still signed out', async () => {
  const { s } = signedIn();
  await s.ensureToken();
  globalThis.fetch = async () => Promise.reject(new TypeError('offline'));
  await s.signOut();
  assert.equal(store.has('orbit.account'), false);
});

test('登出其他所有裝置 and a new pass say which push endpoints are this device’s', async () => {
  const { s, calls } = signedIn();
  await s.signOutEverywhere();
  assert.deepEqual(calls.find(c => c.body.op === 'signout-all').body.keep, [PHONE, OTHER]);
  await s.rotate();
  assert.deepEqual(calls.find(c => c.body.op === 'rotate').body.keep, [PHONE, OTHER]);
  // (No notices here: an empty list, so every other device's stop.)
  const bare = signedIn({});
  await bare.s.signOutEverywhere();
  assert.deepEqual(bare.calls.find(c => c.body.op === 'signout-all').body.keep, []);
});
