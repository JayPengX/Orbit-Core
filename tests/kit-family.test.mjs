// The family's notebook (kit/family.mjs): one app tells, the others hear;
// Class's periods read by the hour.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const store = new Map();
globalThis.localStorage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
const F = await import('../kit/family.mjs');

test('a fact told is heard, old ones when allowed', () => {
  const now = Date.parse('2026-11-10T00:00:00Z');
  F.tell('sports', 'follows', [{ league: 'mlb', id: '10', name: '洋基' }], now);
  assert.equal(F.heard('sports', 'follows', { now })[0].name, '洋基');
  assert.equal(F.heard('sports', 'follows', { maxAge: 1000, now: now + 5000 }), null);
  assert.equal(F.heard('stock', 'holds'), null);
  F.setPlace('school', { lat: 24.81, lon: 121.0, name: '竹北高中' }, 'weather');
  assert.equal(F.placeFor('school').name, '竹北高中');
  F.setPlace('moon', { lat: 1, lon: 1 });
  assert.equal(F.placeFor('moon'), null);
});

test("Class's periods: the one on now, the break after it, the school day's hours", () => {
  F.tell('class', 'week', { 2: [{ n: 2, name: '數學', from: '09:10', to: '10:00' }, { n: 1, name: '國文', from: '08:10', to: '09:00' }, { n: 6, name: '體育', from: '14:10', to: '15:00', out: true }] });
  // 2026-11-10 is a Tuesday.
  assert.deepEqual(F.classesOn('2026-11-10').map(p => p.name), ['國文', '數學', '體育']);
  assert.deepEqual(F.schoolHours('2026-11-10'), { from: '08:10', to: '15:00' });
  assert.equal(F.schoolHours('2026-11-11'), null);
  assert.equal(F.classAt(Date.parse('2026-11-10T09:30:00+08:00')).name, '數學');
  assert.equal(F.classAt(Date.parse('2026-11-10T09:05:00+08:00')), null, 'a break');
  assert.equal(F.breakAfter(Date.parse('2026-11-10T14:30:00+08:00')), Date.parse('2026-11-10T15:00:00+08:00'));
});

test("Class's days as held win over its week: a holiday empty, a swapped period moved", () => {
  F.tell('class', 'days', { '2026-11-10': [], '2026-11-11': [{ n: 1, name: '體育', from: '08:10', to: '09:00', out: true }] });
  assert.deepEqual(F.classesOn('2026-11-10'), [], 'a day off, though the week has classes on Tuesdays');
  assert.equal(F.classesOn('2026-11-11')[0].name, '體育');
  assert.equal(F.classesOn('2026-11-17').length, 3, 'past the days told: the week');
});

test('上課勿擾: a notice due in class waits for the break; Class’s and Transit’s on time', async () => {
  const { classHold } = await import('../kit/orbit.mjs');
  F.tell('class', 'days', { '2026-11-12': [{ n: 3, name: '英文', from: '10:10', to: '11:00' }] });
  const inClass = Date.parse('2026-11-12T10:30:00+08:00');
  const end = Date.parse('2026-11-12T11:00:00+08:00');
  assert.equal(classHold('match', inClass), end + 15_000);
  assert.equal(classHold('orbit', inClass), inClass);
  assert.equal(classHold('transit', inClass), inClass);
  assert.equal(classHold('weather', Date.parse('2026-11-12T11:05:00+08:00')), Date.parse('2026-11-12T11:05:00+08:00'), 'a break: on time');
  assert.equal(classHold('stock', inClass, inClass + 60_000), inClass, 'one that can’t wait past its end: on time');
});

test('planHash: Orbit Transit\'s trip to a place, there by a time', async () => {
  const { planHash } = await import('../kit/family.mjs');
  assert.equal(planHash({ lat: 25.11349, lon: 121.533285, name: '天母棒球場' }, Date.parse('2026-11-11T18:05:00+08:00')), `#plan?to=25.113490,121.533285,${encodeURIComponent('天母棒球場')}&by=${encodeURIComponent('2026-11-11T10:05:00.000Z')}`);
  assert.equal(planHash({ lat: 24.7, lon: 121, name: '家' }), `#plan?to=24.700000,121.000000,${encodeURIComponent('家')}`);
});
