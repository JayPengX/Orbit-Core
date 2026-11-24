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
  F.setPlace('school', { lat: 25.04, lon: 121.5, name: '測試高中' }, 'weather');
  assert.equal(F.placeFor('school').name, '測試高中');
  F.setPlace('moon', { lat: 1, lon: 1 });
  assert.equal(F.placeFor('moon'), null);
});

test('planHash: Orbit Transit\'s trip to a place, there by a time', async () => {
  const { planHash } = await import('../kit/family.mjs');
  assert.equal(planHash({ lat: 25.11349, lon: 121.533285, name: '天母棒球場' }, Date.parse('2026-11-11T18:05:00+08:00')), `#plan?to=25.113490,121.533285,${encodeURIComponent('天母棒球場')}&by=${encodeURIComponent('2026-11-11T10:05:00.000Z')}`);
  assert.equal(planHash({ lat: 24.7, lon: 121, name: '家' }), `#plan?to=24.700000,121.000000,${encodeURIComponent('家')}`);
});
