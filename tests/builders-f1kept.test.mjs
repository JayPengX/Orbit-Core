// Every finished F1 session kept before anyone opens it, slowly.
import test from 'node:test';
import assert from 'node:assert/strict';
import { f1ToKeep, f1SessionUrl, f1LapsUrl, runF1Kept } from '../builders/f1kept.js';
import { mirrorPath } from '../kit/mirror.mjs';
import { r2Store } from '../builders/store.js';
import { memoryBucket } from './fixtures/bucket.mjs';

const ev = (...cs) => ({ competitions: cs.map(([date, abbreviation]) => ({ date, type: { abbreviation } })) });
const events = [ev(['2026-10-09T08:30Z', 'FP1'], ['2026-10-10T09:00Z', 'SR'], ['2026-10-11T12:00Z', 'Race']), ev(['2026-10-25T20:00Z', 'Race'], ['2026-11-01T20:00Z', 'Race'])];
const now = Date.parse('2026-10-26T04:00Z');

test('the sessions over, newest first, at the app’s own addresses, each with its every lap', () => {
  const list = f1ToKeep(events, now);
  assert.deepEqual(list.map(x => x.length), [2, 2, 2, 2]);
  assert.equal(list[0][0], 'https://f1-live.orbit/session.json?start=2026-10-25T20%3A00%3A00.000Z&v=2');
  assert.equal(list[0][1], 'https://f1-live.orbit/laps.json?start=2026-10-25T20%3A00%3A00.000Z&final=1&v=2');
  // A session called off: nothing to keep.
  const off = { date: '2026-10-24T20:00Z', type: { abbreviation: 'Race' }, status: { type: { name: 'STATUS_CANCELED' } } };
  assert.equal(f1ToKeep([...events, { competitions: [off] }], now).length, 4);
  // Over only three hours on.
  assert.equal(f1ToKeep(events, Date.parse('2026-10-25T22:00Z'))[0][0], f1SessionUrl('2026-10-11T12:00Z'));
});

test('a run reads the sessions not kept, skips what’s kept, until its time is up, tries a refused one once more then stops', async () => {
  const bucket = memoryBucket({ 'sports/f1/2026.json': { events } });
  // The newest kept already.
  for (const url of [f1SessionUrl('2026-10-25T20:00Z'), f1LapsUrl('2026-10-25T20:00Z')]) await bucket.put(`${mirrorPath(url, '')}.gz`, new Uint8Array([1]));
  const asked = [];
  const r = await runF1Kept({ store: r2Store(bucket), proxy: async url => (asked.push(url), {}), now, per: 2, clock: () => now, sleep: async () => {} });
  // (Counted as kept once read: the proxy keeps what it reads.)
  assert.deepEqual(r, { sessions: 4, kept: 3, read: 2, again: 0 });
  assert.deepEqual(asked, [f1SessionUrl('2026-10-11T12:00Z'), f1LapsUrl('2026-10-11T12:00Z'), f1SessionUrl('2026-10-10T09:00Z'), f1LapsUrl('2026-10-10T09:00Z')]);
  let waited = 0;
  const shut = await runF1Kept({ store: r2Store(bucket), proxy: async () => null, now, clock: () => now, sleep: async ms => (waited += ms) });
  // Each tried once more 20 seconds on, the three left each failing: stopped at the third.
  assert.ok(waited >= 3 * 20_000);
  assert.equal(shut.read, 0);
  // (The fake proxy keeps nothing: the three still missing.)
  assert.equal(shut.kept, 1);
  assert.equal(shut.failed.length, 3);
  assert.equal(shut.stopped, f1SessionUrl('2026-10-09T08:30Z'));
  // Counted only: nothing read.
  assert.deepEqual(await runF1Kept({ store: r2Store(bucket), proxy: async () => assert.fail(), now, per: 0 }), { sessions: 4, kept: 1, read: 0, again: 0 });
  // Its time up: none read.
  assert.equal((await runF1Kept({ store: r2Store(bucket), proxy: async () => ({}), now, until: now, clock: () => now, sleep: async () => {} })).read, 0);
});
