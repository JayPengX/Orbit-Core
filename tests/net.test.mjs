// The connection's rule (kit netVerdict): off, slow or fine, as every app's capsule and cover say.
import test from 'node:test';
import assert from 'node:assert/strict';
import { netVerdict, mayLocate } from '../kit/orbit.mjs';

const now = 1_000_000;

test('off: the phone says so, or twice nothing reached since the last answer', () => {
  assert.equal(netVerdict({ onLine: false, now }), 'offline');
  // Wi-Fi without internet: the phone says it's online, every request reaches nothing.
  assert.equal(netVerdict({ onLine: true, fails: 2, now }), 'offline');
  assert.equal(netVerdict({ onLine: true, fails: 1, lastOk: now, now }), 'online');
});

test("slow: only when the probe too waits: a slow server on a fast connection isn't a slow connection", () => {
  const long = { waitingSince: [now - 6000], lastOk: now - 6000, now };
  // A request waiting over 5 s, nothing else answered: the probe is asked first, and that's no claim yet.
  assert.equal(netVerdict(long), 'online');
  assert.equal(netVerdict({ ...long, probing: now - 1000 }), 'online');
  // The probe (a tiny file) still waiting after 3 s: the connection is slow.
  assert.equal(netVerdict({ ...long, probing: now - 3500 }), 'slow');
  assert.equal(netVerdict({ waitingSince: [now - 4000], lastOk: now - 6000, probing: now - 3500, now }), 'online');
  // One slow read while others answer (the probe answered): the network is fine.
  assert.equal(netVerdict({ waitingSince: [now - 9000], lastOk: now - 1000, now }), 'online');
  assert.equal(netVerdict({ now }), 'online');
});

test('location: iOS asked unprompted once per app, again only on a tap; granted always, denied never', async () => {
  const store = new Map();
  const saved = { localStorage: globalThis.localStorage, navigator: Object.getOwnPropertyDescriptor(globalThis, 'navigator') };
  globalThis.localStorage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
  let state = 'prompt';
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { permissions: { query: async () => ({ state }) } } });
  try {
    assert.equal(await mayLocate('app.asked'), 'yes');
    assert.equal(await mayLocate('app.asked'), 'no');
    assert.equal(await mayLocate('app.asked', { force: true }), 'yes');
    assert.equal(await mayLocate('other.asked'), 'yes');
    state = 'granted';
    assert.equal(await mayLocate('app.asked'), 'yes');
    state = 'denied';
    assert.equal(await mayLocate('app.asked', { force: true }), 'denied');
  } finally {
    globalThis.localStorage = saved.localStorage;
    if (saved.navigator) Object.defineProperty(globalThis, 'navigator', saved.navigator);
  }
});

test('an AI answer\'s wait is never read as a slow connection; the rest of the proxy is', async () => {
  const { slowByNature } = await import('../kit/orbit.mjs');
  assert.ok(slowByNature('https://orbit-workers-proxy.pengzjay.workers.dev/law-chat?v=1&qt=x'));
  assert.ok(slowByNature('https://orbit-workers-proxy.pengzjay.workers.dev/law-ask'));
  assert.ok(!slowByNature('https://orbit-workers-proxy.pengzjay.workers.dev/law-page?u=x'));
  assert.ok(!slowByNature('https://orbit-workers-proxy.pengzjay.workers.dev/weather'));
  assert.ok(!slowByNature('https://example.com/law-chat'));
});
