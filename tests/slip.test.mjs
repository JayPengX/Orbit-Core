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

// /slip-scan: a ticket's photo, read by Gemini under tight caps.
const { SCAN_LIMITS, forgetScans } = await import('../slip.js');
const gemini = [];
const scan = ({ origin = 'https://jaypengx.github.io', ip = '203.0.113.1', image = { mime_type: 'image/jpeg', data: 'AAAA' }, env = { GEMINI_API_KEY: 'k' }, qt } = {}) =>
  worker.fetch(new Request('https://proxy.test/slip-scan', { method: 'POST', headers: { Origin: origin, 'CF-Connecting-IP': ip, 'Content-Type': 'application/json' }, body: JSON.stringify({ image, qt }) }), env, ctx);
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  if (String(url).includes('generativelanguage')) {
    gemini.push(JSON.parse(init.body));
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"isSlip":true,"picks":[],"combos":[]}' }] } }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
  return realFetch(url, init);
};

test('a ticket photo goes to Gemini with the fixed prompt, from the page only', async () => {
  const before = gemini.length;
  assert.equal((await scan({ origin: 'https://evil.example', ip: '203.0.113.2' })).status, 403);
  assert.equal((await scan({ ip: '203.0.113.3', image: { mime_type: 'application/pdf', data: 'AAAA' } })).status, 400);
  assert.equal((await scan({ ip: '203.0.113.4', image: { mime_type: 'image/jpeg', data: 'A'.repeat(SCAN_LIMITS.maxBase64 + 1) } })).status, 413);
  assert.equal(gemini.length, before);
  const ok = await scan({ ip: '203.0.113.5' });
  assert.equal(ok.status, 200);
  const sent = gemini.at(-1);
  assert.match(sent.contents[0].parts[0].text, /台灣運彩/);
  assert.equal(sent.contents[0].parts[1].inline_data.data, 'AAAA');
  assert.equal(sent.generationConfig.response_mime_type, 'application/json');
});

test('an address gets 2 scans a minute', async () => {
  const codes = [];
  for (let i = 0; i < 4; i++) codes.push((await scan({ ip: '203.0.113.6' })).status);
  assert.deepEqual(codes, [200, 200, 429, 429]);
});

test('with a Quadra Pass, scans count per account (3 a minute), whatever the address', async () => {
  const { signToken } = await import('../quadra-token.js');
  const env = { GEMINI_API_KEY: 'k', ECO_TOKEN_SECRET: 'test-secret' };
  const qt = await signToken('test-secret', { k: 'ses', s: 'sess1', d: 'acct-scan', e: Date.now() + 60_000 });
  assert.equal((await scan({ ip: '203.0.113.20', env, qt: 'forged.token' })).status, 401);
  const codes = [];
  for (let i = 0; i < 4; i++) codes.push((await scan({ ip: `203.0.113.${21 + i}`, env, qt })).status);
  assert.deepEqual(codes, [200, 200, 200, 429]);
});

test('past the day’s scans in all, nobody scans until tomorrow', async () => {
  forgetScans();
  let n = SCAN_LIMITS.dayCap;
  const env = { GEMINI_API_KEY: 'k', STORE: { prepare: () => ({ run: async () => ({}), bind: (day, add) => ({ first: async () => ({ n: (n += add) }) }) }) } };
  assert.equal((await scan({ ip: '203.0.113.7', env })).status, 503);
  const broken = { GEMINI_API_KEY: 'k', STORE: { prepare: () => ({ run: async () => { throw new Error('down'); } }) } };
  assert.equal((await scan({ ip: '203.0.113.8', env: broken })).status, 503);
  forgetScans();
});
