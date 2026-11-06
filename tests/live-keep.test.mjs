import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeKeep } from '../tools/live-keep.mjs';

// A Worker that answers `status` with a count of how often it was asked.
const worker = (status = 200) => {
  const asked = [];
  const fetchFn = async (url, init) => {
    asked.push(url);
    await new Promise(r => setTimeout(r, 5));
    return new Response(JSON.stringify({ n: asked.length }), { status, headers: { 'Content-Type': 'application/json', 'X-Transit-Age': '3', 'Content-Encoding': 'gzip' } });
  };
  return { asked, fetchFn };
};
const folder = () => mkdtempSync(join(tmpdir(), 'live-keep-test-'));

test('no folder: every read goes to the Worker', async () => {
  const w = worker();
  const k = makeKeep({ dir: '', fetchFn: w.fetchFn });
  assert.equal(k.on, false);
  await k.liveFetch('https://w/transit/eta?a=1');
  await k.liveFetch('https://w/transit/eta?a=1');
  assert.equal(w.asked.length, 2);
});

test('a batch of runs: an address asked once while fresh, its headers kept (not its encoding), then asked again', async () => {
  const dir = folder();
  let t = 1_000_000;
  const w = worker();
  const k = makeKeep({ dir, ttlS: 90, fetchFn: w.fetchFn, now: () => t });
  const a = await k.liveFetch('https://w/transit/eta?a=1', { headers: { Origin: 'http://localhost:8123' } });
  // (Another run of the batch: its own keep on the same folder.)
  const b = await makeKeep({ dir, ttlS: 90, fetchFn: w.fetchFn, now: () => t + 60_000 }).liveFetch('https://w/transit/eta?a=1');
  assert.equal(w.asked.length, 1);
  assert.equal(a.kept, false);
  assert.equal(b.kept, true);
  assert.deepEqual(JSON.parse(b.body), { n: 1 });
  assert.equal(b.headers['x-transit-age'], '3');
  assert.equal(b.headers['content-encoding'], undefined);
  t += 91_000;
  const c = await k.liveFetch('https://w/transit/eta?a=1');
  assert.equal(c.kept, false);
  assert.equal(w.asked.length, 2);
  assert.deepEqual(k.counts(), { reads: 0, kept: 1, sent: 2 });
  rmSync(dir, { recursive: true, force: true });
});

test('a failed answer is never kept', async () => {
  const dir = folder();
  const w = worker(503);
  const k = makeKeep({ dir, fetchFn: w.fetchFn });
  assert.equal((await k.liveFetch('https://w/sports-proxy?url=x')).status, 503);
  await k.liveFetch('https://w/sports-proxy?url=x');
  assert.equal(w.asked.length, 2);
  rmSync(dir, { recursive: true, force: true });
});

test('runs asking at once: the first asks, the others take its answer', async () => {
  const dir = folder();
  const w = worker();
  const runs = Array.from({ length: 4 }, () => makeKeep({ dir, fetchFn: w.fetchFn, wait: ms => new Promise(r => setTimeout(r, Math.min(ms, 5))) }));
  const got = await Promise.all(runs.map(k => k.liveFetch('https://w/data/sports/bounds.json')));
  assert.equal(w.asked.length, 1);
  assert.deepEqual(got.map(g => JSON.parse(g.body).n), [1, 1, 1, 1]);
  rmSync(dir, { recursive: true, force: true });
});

test("a batch's items kept one by one; a claim is one run's until released, or a dead run's after 30 s", () => {
  const dir = folder();
  let t = Date.now();
  const k = makeKeep({ dir, now: () => t });
  assert.equal(k.kept('sports app=match espn:nba'), null);
  k.keep('sports app=match espn:nba', { s: 200, b: { events: [] } });
  assert.deepEqual(k.kept('sports app=match espn:nba'), { s: 200, b: { events: [] } });
  assert.equal(k.claim('item'), true);
  assert.equal(k.claim('item'), false);
  k.release('item');
  assert.equal(k.claim('item'), true);
  t += 31_000;
  assert.equal(k.claim('item'), true);
  rmSync(dir, { recursive: true, force: true });
});
