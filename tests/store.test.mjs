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

test('a file R2 lacks is taken from Shared-Data\'s Pages once and kept in R2; never asked of Pages again; one Pages lacks too is none', async () => {
  const bucket = memoryBucket();
  const asked = [];
  const get = async url => (asked.push(url), String(url).endsWith('sports/watch/index.json') ? new Response('{"checked":3}') : new Response('', { status: 404 }));
  const s = r2Store(bucket, { get });
  assert.deepEqual(await s.json('sports/watch/index.json'), { checked: 3 });
  assert.ok(bucket.m.has('sports/watch/index.json'), 'kept in R2');
  assert.deepEqual(await r2Store(bucket, { get }).json('sports/watch/index.json'), { checked: 3 });
  assert.equal(asked.length, 1, 'Pages asked once');
  assert.equal(await s.json('nope.json'), null);
  assert.equal(await s.put('sports/watch/index.json', { checked: 3 }), false, 'the same content: nothing written');
});

test('the drain: every file the indexes list moved from Pages into R2, a run at a time, then done', async () => {
  const { runDrain, drainList } = await import('../builders/drain.js');
  const pages = { 'sports/index.json': { leagues: { mlb: { years: { 2026: {} } } } }, 'sports/mlb/2026.json': { events: [] }, 'sports/mlb/days.json': { days: [] }, 'index.json': { cities: { Hsinchu: {} } }, 'bus/Hsinchu.json': { v: 1 } };
  const get = async url => {
    const p = String(url).replace('https://jaypengx.github.io/Shared-Data/', '');
    return pages[p] ? new Response(JSON.stringify(pages[p])) : new Response('', { status: 404 });
  };
  const bucket = memoryBucket();
  const s = r2Store(bucket, { get });
  const kv = { m: new Map(), get: async k => kv.m.get(k) ?? null, put: async (k, v) => void kv.m.set(k, v) };
  const list = await drainList(s, Date.parse('2026-10-13T00:00:00Z'));
  assert.ok(list.includes('sports/mlb/2026.json') && list.includes('bus/Hsinchu.json') && list.includes('sports/mlb/days.json'));
  const r = await runDrain({ store: r2Store(bucket, { get }), kv, now: Date.parse('2026-10-13T00:00:00Z'), until: Infinity });
  assert.equal(r.all, true);
  for (const p of Object.keys(pages)) assert.ok(bucket.m.has(p), p);
  assert.deepEqual(await runDrain({ store: s, kv }), { all: true });
});
