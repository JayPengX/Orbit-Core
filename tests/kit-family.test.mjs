// The family's notebook (kit/family.mjs): one app tells, the others hear.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const store = new Map();
globalThis.localStorage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
const F = await import('../kit/family.mjs');

test('a fact told is heard, old ones when allowed', () => {
  const now = Date.parse('2026-11-10T00:00:00Z');
  F.tell('weather', 'rain', { places: [{ lat: 25, lon: 121.5, wet: [] }] }, now);
  assert.equal(F.heard('weather', 'rain', { now }).places[0].lat, 25);
  assert.equal(F.heard('weather', 'rain', { maxAge: 1000, now: now + 5000 }), null);
  assert.equal(F.heard('nobody', 'told'), null);
});

