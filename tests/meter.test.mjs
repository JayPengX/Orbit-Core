// The month's meter (transit.js): counts added in D1, none lost or written
// over; TDX's points from its calls and their bytes; KV's copy from D1.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fakeD1 } from './fake-d1.mjs';
import { usage, spend, tally, tallyTdx, tdxBody, tdxUse, tdxPoints, flushUse, mirrorMeter, resetMeter, billingMonth, TDX_POINTS, TDX_BOOK } from '../transit.js';
import { tdxClient } from '../builders/buses.js';

const memKv = () => {
  const store = new Map();
  return { store, get: async k => store.get(k) ?? null, put: async (k, v) => void store.set(k, v) };
};
const NOW = Date.parse('2026-11-06T04:00:00Z'); // 12:00 in Taiwan
const DAY = '2026-11-06';
const MONTH = billingMonth(NOW);
const waits = () => {
  const list = [];
  return { list, ctx: { waitUntil: p => list.push(p) }, all: () => Promise.all(list) };
};

test('two isolates counting at once both count: each adds in D1, never writes the total over the other', async () => {
  const env = { STORE: fakeD1(), RATE_LIMIT_KV: memKv() };
  resetMeter();
  // (Isolate A's three calls and isolate B's two, flushed in turn: KV's read-add-write kept one of them.)
  for (let i = 0; i < 3; i++) await tallyTdx(env, 'basic/v2/Bus/Route/City/Hsinchu', NOW, null, '', { bytes: 1000 });
  resetMeter();
  for (let i = 0; i < 2; i++) await tallyTdx(env, 'advanced/v2/Bus/EstimatedTimeOfArrival/NearBy', NOW, null, 'dev', { bytes: 500 });
  const { results } = await env.STORE.prepare('SELECT k, n FROM meter WHERE month = ?1 ORDER BY k').bind(MONTH).all();
  assert.deepEqual(Object.fromEntries(results.map(r => [r.k, r.n])), {
    [`dev:tdx:a:${DAY}`]: 2,
    [`dev:tdx:va:${DAY}`]: 1000,
    [`tdx:a:${DAY}`]: 2,
    [`tdx:b:${DAY}`]: 3,
    [`tdx:va:${DAY}`]: 1000,
    [`tdx:vb:${DAY}`]: 3000
  });
});

test("a request's counts wait 2 s at most, behind it, all of them in one write; what D1 answered is this isolate's count at once", async () => {
  const env = { STORE: fakeD1(), RATE_LIMIT_KV: memKv() };
  resetMeter();
  const w = waits();
  let writes = 0;
  const prepare = env.STORE.prepare;
  env.STORE.prepare = sql => (sql.startsWith('INSERT INTO meter') && writes++, prepare(sql));
  // (Someone else's 5 already in D1.)
  await env.STORE.prepare('CREATE TABLE IF NOT EXISTS meter (month TEXT NOT NULL, k TEXT NOT NULL, n REAL NOT NULL, PRIMARY KEY (month, k))').run();
  await env.STORE.prepare('INSERT INTO meter (month, k, n) VALUES (?1, ?2, 5)').bind(MONTH, 'routes').run();
  writes = 0;
  assert.equal((await usage(env, NOW)).routes, 0, 'KV not written yet');
  assert.equal(await spend(env, 'routes', 1, NOW, w.ctx), true);
  assert.equal(await spend(env, 'routes', 2, NOW, w.ctx, { by: 'dev' }), true);
  await tally(env, `err:transit:${DAY}`, 1, NOW, w.ctx);
  assert.equal(w.list.length, 1, 'one write asked for, the rest ride along');
  assert.equal((await usage(env, NOW)).routes, 3, 'pending counts seen at once');
  await w.all();
  assert.equal(writes, 1);
  const u = await usage(env, NOW);
  assert.equal(u.routes, 8, "D1's answer: everyone's");
  assert.equal(u['dev:routes'], 2);
  assert.equal(u[`err:transit:${DAY}`], 1);
});

test('D1 failing: the counts wait for the next write, never dropped', async () => {
  const env = { STORE: fakeD1(), RATE_LIMIT_KV: memKv() };
  resetMeter();
  const prepare = env.STORE.prepare;
  let broken = true;
  env.STORE.prepare = sql => {
    if (broken && sql.startsWith('INSERT INTO meter')) throw new Error('D1 down');
    return prepare(sql);
  };
  await tallyTdx(env, 'basic/x', NOW, null, '', { bytes: 10 });
  assert.equal((await usage(env, NOW))[`tdx:b:${DAY}`], 1, 'still pending here');
  broken = false;
  await flushUse(env, NOW + 1000);
  const row = await env.STORE.prepare('SELECT n FROM meter WHERE month = ?1 AND k = ?2').bind(MONTH, `tdx:b:${DAY}`).first();
  assert.equal(row.n, 1);
});

test("the cron copies D1 to KV (every isolate's read), KV's counts from before D1 added in once", async () => {
  const kv = memKv();
  const env = { STORE: fakeD1(), RATE_LIMIT_KV: kv };
  resetMeter();
  // KV's November before the meter moved: 900 basic calls on the 3rd.
  kv.store.set(`transit:use:${MONTH}`, JSON.stringify({ [`tdx:b:2026-11-03`]: 900, maps: 40, note: 'x' }));
  await tallyTdx(env, 'basic/x', NOW, null, '', { bytes: 2_000_000 });
  await spend(env, 'maps', 1, NOW);
  const first = await mirrorMeter(env, NOW);
  assert.equal(first.seeded, MONTH);
  const doc = () => JSON.parse(kv.store.get(`transit:use:${MONTH}`));
  assert.deepEqual(doc(), { [`tdx:b:2026-11-03`]: 900, maps: 41, [`tdx:b:${DAY}`]: 1, [`tdx:vb:${DAY}`]: 2_000_000 });
  // Again: nothing added twice.
  await spend(env, 'maps', 1, NOW);
  const second = await mirrorMeter(env, NOW + 120_000);
  assert.equal(second.seeded, undefined);
  assert.equal(doc().maps, 42);
  assert.equal(doc()[`tdx:b:2026-11-03`], 900);
  // An isolate reading later sees it all.
  resetMeter();
  const pts = tdxPoints(await tdxUse(env, NOW + 180_000), NOW + 180_000, {});
  assert.ok(Math.abs(pts.month - (901 / 1500 + 2_000_000 / (150 * 2 ** 20))) < 1e-9, String(pts.month));
});

test("TDX's points: each call (basic 1/1500, advanced and the planner 1/200) and its bytes (basic 150 MB, advanced 20 MB a point, TDX's MB 1,024 KB)", () => {
  const used = {
    [`tdx:b:${DAY}`]: 1500,
    [`tdx:vb:${DAY}`]: 150 * 2 ** 20,
    [`tdx:a:${DAY}`]: 200,
    [`tdx:va:${DAY}`]: 20 * 2 ** 20,
    [`tdx:m:2026-11-05`]: 100,
    [`tdx:vm:2026-11-05`]: 10 * 2 ** 20,
    [`tdx:gz:${DAY}`]: 99,
    [`tdx:z:${DAY}`]: 1e9,
    [`tdx:b:2026-10-31`]: 15000
  };
  const p = tdxPoints(used, NOW, {});
  assert.equal(p.today, 4);
  assert.equal(p.month, 5, "last month's and the travel notes never count");
  assert.equal(TDX_POINTS.month, 200);
});

test("the days the meter counted short are TDX's own numbers (its 會員中心), never added twice", () => {
  const used = { 'tdx:b:2026-11-03': 6384, 'tdx:a:2026-11-03': 591, [`tdx:b:${DAY}`]: 1500 };
  const p = tdxPoints(used, NOW);
  assert.equal(p.today, 1);
  assert.ok(Math.abs(p.month - (41.071 + 1)) < 1e-9, String(p.month));
  // (On the 3rd itself, only the book's days so far.)
  assert.ok(Math.abs(tdxPoints({ 'tdx:b:2026-11-03': 6384 }, Date.parse('2026-11-03T04:00:00Z')).month - (5.658 + 1.402 + 20.009)) < 1e-9);
  assert.equal(TDX_BOOK['2026-11-03'].points, 20.009);
});

test('a TDX answer read: its bytes as read, and how it travelled when TDX said', async () => {
  const text = JSON.stringify([{ StopName: { Zh_tw: '新竹車站' } }]);
  const got = await tdxBody(new Response(text, { headers: { 'Content-Encoding': 'gzip', 'Content-Length': '31' } }));
  assert.equal(got.text, text);
  assert.equal(got.bytes, new TextEncoder().encode(text).length);
  assert.ok(got.bytes > text.length, 'UTF-8 bytes, not characters');
  assert.equal(got.zipped, true);
  assert.equal(got.sent, 31);
  // (A fetch that failed: nothing read, nothing thrown.)
  const none = await tdxBody({ ok: false, status: 504, text: async () => 'TimeoutError' });
  assert.deepEqual([none.text, none.zipped, none.sent], ['TimeoutError', false, 0]);
});

test("the builders' TDX calls are counted as TDX bills them, as the builders' own", async () => {
  const counted = [];
  const get = async url => (url.includes('token') ? Response.json({ access_token: 'T' }) : url.includes('Shape') ? new Response('{"Message":"no"}', { status: 400 }) : Response.json([{ RouteUID: 'HSZ1' }]));
  const tdx = tdxClient({}, { get, sleep: async () => {}, gap: 0, count: async (path, read) => counted.push([path.split('?')[0], read.bytes]) });
  assert.deepEqual(await tdx.ask('basic/v2/Bus/Route/City/Hsinchu'), [{ RouteUID: 'HSZ1' }]);
  await assert.rejects(tdx.ask('basic/v2/Bus/Shape/City/Hsinchu'));
  assert.deepEqual(counted, [
    ['basic/v2/Bus/Route/City/Hsinchu', 21],
    ['basic/v2/Bus/Shape/City/Hsinchu', 16]
  ]);
  // (By default into the meter, `build:`.)
  const env = { STORE: fakeD1(), RATE_LIMIT_KV: memKv() };
  resetMeter();
  await tdxClient(env, { get, sleep: async () => {}, gap: 0 }).ask('basic/v2/Bus/Route/City/Hsinchu');
  const u = await usage(env, Date.now());
  const today = Object.keys(u).find(k => k.startsWith('build:tdx:b:'));
  assert.ok(today, JSON.stringify(u));
  assert.equal(u[today], 1);
  assert.equal(u[today.replace('build:', '')], 1);
});
