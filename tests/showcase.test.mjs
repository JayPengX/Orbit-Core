// The showcase's live demos (showcase.js): a short pass that reads and does
// nothing else, only from the showcase, within its limits.
import test from 'node:test';
import assert from 'node:assert/strict';
import { handleShowcasePass, showcaseOf, SHOW_MS, SHOW_PER_HOUR, SHOW_DAY_CAP } from '../showcase.js';
import { readToken, signToken } from '../orbit-token.js';
import { handleTransit, resetMeter, billingMonth } from '../transit.js';

const SECRET = 'test-secret';
const memKv = () => {
  const m = new Map();
  return { get: async k => m.get(k) ?? null, put: async (k, v) => void m.set(k, v), m };
};
const SHOW = 'https://jaypengx.com';
let n = 0;
const nextIp = () => `203.0.113.${++n}`;
const mint = (env, { ip, origin = SHOW, method = 'POST', now = Date.now() } = {}) =>
  handleShowcasePass(new Request('https://w/showcase/pass', { method }), env, {}, { ip, origin, now });

test('a showcase pass: from the showcase only, short, and never a Pass session', async () => {
  const env = { ECO_TOKEN_SECRET: SECRET, RATE_LIMIT_KV: memKv() };
  const ip = nextIp();
  const now = Date.now();
  const res = await mint(env, { ip, now });
  assert.equal(res.status, 200);
  const { qt, e } = await res.json();
  assert.equal(e, now + SHOW_MS);
  // Not a session anything else takes.
  assert.equal(await readToken(SECRET, qt, 'ses'), null);
  // Read back only from the showcase and the address it went to.
  const ask = (origin, from) => showcaseOf(new Request(`https://w/transit/eta?qt=${encodeURIComponent(qt)}`), env, { ip: from, origin });
  assert.deepEqual(await ask(SHOW, ip), { s: `show:${ip}`, showcase: true });
  assert.equal(await ask('https://elsewhere.example', ip), null);
  assert.equal(await ask(SHOW, nextIp()), null);
  // Run out: nothing.
  assert.equal(await showcaseOf(new Request(`https://w/x?qt=${encodeURIComponent(qt)}`), env, { ip, origin: SHOW, now: e + 1 }), null);
  // A real Pass session is no showcase pass either.
  const ses = await signToken(SECRET, { k: 'ses', s: 'abc', e: now + 60_000 });
  assert.equal(await showcaseOf(new Request(`https://w/x?qt=${encodeURIComponent(ses)}`), env, { ip, origin: SHOW }), null);
});

test('a showcase pass: refused elsewhere, a few an hour per address, a day’s cap for all', async () => {
  const env = { ECO_TOKEN_SECRET: SECRET, RATE_LIMIT_KV: memKv() };
  assert.equal((await mint(env, { ip: nextIp(), origin: 'https://elsewhere.example' })).status, 403);
  assert.equal((await mint(env, { ip: nextIp(), method: 'GET' })).status, 405);
  const ip = nextIp();
  for (let i = 0; i < SHOW_PER_HOUR; i++) assert.equal((await mint(env, { ip })).status, 200);
  assert.equal((await mint(env, { ip })).status, 429);
  const day = new Date(Date.now() + 8 * 3_600_000).toISOString().slice(0, 10);
  await env.RATE_LIMIT_KV.put(`showcase:passes:${day}`, String(SHOW_DAY_CAP));
  assert.equal((await mint(env, { ip: nextIp() })).status, 429);
});

test('Transit for a showcase pass: reads within its own shares, no status samples', async () => {
  resetMeter();
  const kv = memKv();
  const env = { RATE_LIMIT_KV: kv, GOOGLE_MAPS_BROWSER_KEY: 'browser-key' };
  const session = { s: 'show:1', showcase: true };
  const ask = (path, query = '') => handleTransit(new Request(`https://w${path}${query}`), env, {}, path, { session, now: Date.now() });
  let res = await ask('/transit/config');
  assert.equal(res.status, 200);
  assert.deepEqual((await res.json()).map, { provider: 'google', key: 'browser-key' });
  assert.equal((await ask('/transit/status', '?sample=routes')).status, 401);
  // Past the paid share: refused (the demo plays its recording), the free reads go on.
  resetMeter();
  await kv.put(`transit:use:${billingMonth(Date.now())}`, JSON.stringify({ showcasePaid: 1_500, showcaseMaps: 600 }));
  assert.equal((await ask('/transit/search', '?q=101')).status, 429);
  res = await ask('/transit/config');
  assert.deepEqual((await res.json()).map, { provider: 'nlsc' });
  // Past every ask's share: refused.
  resetMeter();
  await kv.put(`transit:use:${billingMonth(Date.now())}`, JSON.stringify({ showcaseAsks: 30_000 }));
  assert.equal((await ask('/transit/config')).status, 429);
});
