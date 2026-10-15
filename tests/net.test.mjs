// The connection's rule (kit netVerdict): off, slow or fine, as every app's capsule and cover say.
import test from 'node:test';
import assert from 'node:assert/strict';
import { netVerdict, mayLocate } from '../kit/quadra.mjs';

const now = 1_000_000;

test('off: the phone says so, or twice nothing reached since the last answer', () => {
  assert.equal(netVerdict({ onLine: false, now }), 'offline');
  // Wi-Fi without internet: the phone says it's online, every request reaches nothing.
  assert.equal(netVerdict({ onLine: true, fails: 2, now }), 'offline');
  assert.equal(netVerdict({ onLine: true, fails: 1, lastOk: now, now }), 'online');
});

test('slow: a request waiting over 5 s with nothing answered meanwhile; never while answers come', () => {
  assert.equal(netVerdict({ waitingSince: [now - 6000], lastOk: now - 6000, now }), 'slow');
  assert.equal(netVerdict({ waitingSince: [now - 4000], lastOk: now - 6000, now }), 'online');
  // One slow read while others answer: the network is fine.
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
