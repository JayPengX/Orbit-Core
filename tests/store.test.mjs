import test from 'node:test';
import assert from 'node:assert/strict';
import { r2Store, memoryBucket } from '../builders/store.js';

test('store: JSON written once, the same again costs nothing; gz packed and unpacked', async () => {
  const bucket = memoryBucket();
  const s = r2Store(bucket);
  assert.equal(await s.put('sports/watch.json', { a: 1 }), true);
  assert.equal(await s.put('sports/watch.json', { a: 1 }), false);
  assert.deepEqual(await s.json('sports/watch.json'), { a: 1 });
  await s.put('mirror/_/x.json.gz', { until: 5, data: [1, 2] });
  const raw = bucket.m.get('mirror/_/x.json.gz').b;
  assert.deepEqual([raw[0], raw[1]], [0x1f, 0x8b]);
  assert.deepEqual(await s.json('mirror/_/x.json.gz'), { until: 5, data: [1, 2] });
  assert.equal(await s.put('mirror/_/x.json.gz', { until: 5, data: [1, 2] }), false, 'gzip\'s own bytes vary; what\'s meant didn\'t');
  assert.equal(await s.json('nope.json'), null);
  assert.deepEqual(s.stats, { read: 3, written: 2, same: 2, deleted: 0 });
});

test('store: a folder replaced whole, what isn\'t in it goes', async () => {
  const s = r2Store(memoryBucket({ 'sports/watch/mlb/2026-09.json': '{}', 'sports/watch/mlb/2025-09.json': '{}', 'sports/other.json': '{}' }));
  await s.replace('sports/watch/', { 'sports/watch/mlb/2026-09.json': { games: {} }, 'sports/watch/index.json': { built: 1 } });
  assert.deepEqual((await s.list('sports/')).sort(), ['sports/other.json', 'sports/watch/index.json', 'sports/watch/mlb/2026-09.json']);
});
