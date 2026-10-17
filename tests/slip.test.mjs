// Slip Tracker's door (/slip): its origin, its addresses and its limits.
import test from 'node:test';
import assert from 'node:assert/strict';

const store = new Map();
globalThis.caches = { default: { match: async req => store.get(req.url)?.clone() || null, put: async (req, res) => void store.set(req.url, res) } };
const upstream = [];
globalThis.fetch = async url => (upstream.push(String(url)), new Response(JSON.stringify({ games: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
const worker = (await import('../worker.js')).default;
const { DAY_CAP, forgetSlipDay, slipUrlAllowed } = await import('../slip.js');
const ctx = { waitUntil: p => p };
const MONTH = 'https://asia-baseball.quadra/cpbl/2026-10.json';
const ask = (u, { origin = 'https://jaypengx.github.io', ip = '198.51.100.1', env = {} } = {}) =>
  worker.fetch(new Request(`https://proxy.test/slip?${[].concat(u).map(x => `u=${encodeURIComponent(x)}`).join('&')}`, { headers: { Origin: origin, 'CF-Connecting-IP': ip } }), env, ctx);

test('only the Asian leagues’ month lists, nothing else the proxy reads', () => {
  assert.ok(slipUrlAllowed(MONTH));
  assert.ok(slipUrlAllowed('https://asia-baseball.quadra/npb/2026-09.json'));
  for (const u of ['https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard', 'https://asia-baseball.quadra/cpbl/box/2026/1.json', 'https://gamma-api.polymarket.com/events', 'https://asia-baseball.quadra/cpbl/2026-10.json?x=1']) assert.ok(!slipUrlAllowed(u), u);
});

test('another site is turned away; the page and a localhost page are let in', async () => {
  assert.equal((await ask(MONTH, { origin: 'https://evil.example', ip: '198.51.100.2' })).status, 403);
  const ok = await ask(MONTH, { ip: '198.51.100.3' });
  assert.equal(ok.status, 200);
  assert.equal((await ok.json()).r[0].s, 200);
  assert.equal((await ask(MONTH, { origin: 'http://localhost:8123', ip: '198.51.100.4' })).status, 200);
  assert.equal((await ask('https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard', { ip: '198.51.100.5' })).status, 400);
  assert.equal((await ask([MONTH, MONTH, MONTH, MONTH], { ip: '198.51.100.6' })).status, 400);
});

test('an address gets 6 asks a minute', async () => {
  const codes = [];
  for (let i = 0; i < 8; i++) codes.push((await ask(MONTH, { ip: '198.51.100.7' })).status);
  assert.deepEqual(codes, [200, 200, 200, 200, 200, 200, 429, 429]);
});

test('past the day’s cap every address waits until tomorrow', async () => {
  forgetSlipDay();
  let n = DAY_CAP;
  const env = { STORE: { prepare: sql => ({ run: async () => ({}), bind: (day, add) => ({ first: async () => ({ n: (n += add) }) }) }) } };
  assert.equal((await ask(MONTH, { ip: '198.51.100.8', env })).status, 503);
  forgetSlipDay();
});
