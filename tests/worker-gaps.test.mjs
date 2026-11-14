// Worker routes no other test reached (the hand-testing list, 2026-11-12): Class's /gemini and
// /nl-edit refusals, mail to the domain, which routes the Runner takes, and the cron's two parts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker.js';
import { signToken } from '../orbit-token.js';
import { fakeD1 } from './fake-d1.mjs';
import { runsInRunner, partOf } from '../runner.js';

const env = { ECO_TOKEN_SECRET: 'gaps-secret', GEMINI_API_KEY: '', STORE: fakeD1('', { fullPasses: true }) };
const ctx = { waitUntil: () => {}, passThroughOnException: () => {} };
const session = async (a = 'orbit') => signToken(env.ECO_TOKEN_SECRET, { k: 'ses', d: 'doc1', a, s: `s-${Math.random()}`, e: Date.now() + 600_000 });
const ask = async (path, body, qt) =>
  worker.fetch(new Request(`https://api.jaypengx.com${path}${qt ? `?qt=${encodeURIComponent(qt)}` : ''}`, { method: 'POST', headers: { Origin: 'https://orbit.jaypengx.com', 'Content-Type': 'application/json', 'CF-Connecting-IP': '9.9.9.9' }, body: JSON.stringify(body) }), env, ctx).then(async r => ({ status: r.status, j: await r.json() }));
const file = { mime_type: 'image/png', data: 'iVBORw0KGgo=' };
const plan = { weeklySchedule: { 1: [] }, classes: [], bellTimes: [], breakTimes: [], countdownEvents: [], reverseWeek: false };

test('/gemini: a Pass session needed; a 7th file, or a type it can\'t read, is FILE_PARSE_ERROR', async () => {
  assert.equal((await ask('/gemini', { model: 'gemini-3.7-flash', files: [file] })).status, 401);
  const qt = await session();
  const seven = await ask('/gemini', { model: 'gemini-3.7-flash', files: Array(7).fill(file) }, qt);
  assert.equal(seven.status, 400);
  assert.equal(seven.j.error.code, 'FILE_PARSE_ERROR');
  assert.match(seven.j.error.message, /At most 6/);
  const gif = await ask('/gemini', { model: 'gemini-3.7-flash', files: [{ ...file, mime_type: 'image/gif' }] }, qt);
  assert.equal(gif.j.error.code, 'FILE_PARSE_ERROR');
  const model = await ask('/gemini', { model: 'gpt-x', files: [file] }, qt);
  assert.equal(model.j.error.code, 'UNSUPPORTED_MODEL');
});

test('/nl-edit: text over 200 characters is MISSING_TEXT; a context over 40 KB is CONTEXT_TOO_LARGE', async () => {
  const qt = await session();
  const long = await ask('/nl-edit', { model: 'gemini-3.7-flash', text: 'x'.repeat(201), context: plan }, qt);
  assert.equal(long.j.error.code, 'MISSING_TEXT');
  const big = await ask('/nl-edit', { model: 'gemini-3.7-flash', text: '把週一第一節改成數學', context: { ...plan, classes: Array.from({ length: 2000 }, (_, i) => ({ key: `k${i}`, subject: '數學'.repeat(5) })) } }, qt);
  assert.equal(big.j.error.code, 'CONTEXT_TOO_LARGE');
});

test('/gemini and /nl-edit from another origin: refused before anything is read', async () => {
  const r = await worker.fetch(new Request('https://api.jaypengx.com/gemini', { method: 'POST', headers: { Origin: 'https://example.com' }, body: '{}' }), env, ctx);
  assert.equal(r.status, 403);
});

test('mail to the domain bounces with "No mailbox here"', async () => {
  let why = '';
  await worker.email({ setReject: w => (why = w) });
  assert.equal(why, 'No mailbox here');
});

test('the Runner takes heavy routes; light ones (data, config, sources, guard, TDX lists, push, law-live, showcase) stay', () => {
  const r = p => runsInRunner(new Request(`https://w${p}`), new URL(`https://w${p}`).pathname);
  for (const p of ['/data/sports/index.json', '/config', '/sources', '/guard', '/transit/config', '/transit/status', '/transit/gtfs', '/push/key', '/law-live', '/showcase/pass', '/store/check']) assert.equal(r(p), false, p);
  for (const p of ['/data/build', '/sports-proxy', '/weather', '/eco', '/ai', '/law-ask', '/flight']) assert.equal(r(p), true, p);
});

test('the cron in two parts: builders and the slow jobs apart from notices and the live work', () => {
  assert.equal(partOf('build:news'), 'slow');
  assert.equal(partOf('notices'), 'main');
  for (const j of ['store-backup', 'capacity']) assert.equal(partOf(j), 'slow', j);
});

// F1's odd minutes wake the Runner only while a session runs (worker.js f1Mark), as the even minute's look found.
test("odd minutes: the Runner woken for F1 only while the even minute's look found a session", async () => {
  const { f1Mark, F1_LIVE_KEY } = await import('../sports.js');
  const kv = new Map();
  let puts = 0;
  const RATE_LIMIT_KV = { get: async k => kv.get(k) ?? null, put: async (k, v) => (puts++, kv.set(k, v)) };
  const woken = [];
  const RUNNER = { idFromName: n => n, get: n => ({ fetch: async () => (woken.push(n), new Response('ok')) }) };
  const e = { RATE_LIMIT_KV, RUNNER, RUNNER_CRONS: 'on' };
  const waits = [];
  const c = { waitUntil: p => waits.push(p), passThroughOnException() {} };
  // A Saturday, an odd minute.
  const odd = { cron: '1-59/2 * * * *', scheduledTime: Date.parse('2026-11-14T12:01:00Z') };
  await worker.scheduled(odd, e, c);
  await Promise.all(waits);
  assert.deepEqual(woken, [], 'no look yet: nothing woken');
  await f1Mark(e, 'idle');
  await worker.scheduled(odd, e, c);
  await Promise.all(waits);
  assert.deepEqual(woken, []);
  await f1Mark(e, 'Race: 20 cars');
  await f1Mark(e, 'Race: 20 cars');
  assert.equal(kv.get(F1_LIVE_KEY), '1');
  assert.equal(puts, 2, 'written only when it changes');
  await worker.scheduled(odd, e, c);
  await Promise.all(waits);
  assert.deepEqual(woken, ['route:0'], "F1's part runs in the routes' object");
  // A failed look changes nothing.
  await f1Mark(e, null);
  assert.equal(kv.get(F1_LIVE_KEY), '1');
});
