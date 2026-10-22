// Orbit Slips' door (/slip-scan): its origin and its limits.
import test from 'node:test';
import assert from 'node:assert/strict';

const store = new Map();
globalThis.caches = { default: { match: async req => store.get(req.url)?.clone() || null, put: async (req, res) => void store.set(req.url, res) } };
const upstream = [];
globalThis.fetch = async url => (upstream.push(String(url)), new Response(JSON.stringify({ games: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
const worker = (await import('../worker.js')).default;
const ctx = { waitUntil: p => p };

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

test('with a Orbit Pass, scans count per account (3 a minute), whatever the address', async () => {
  const { signToken } = await import('../orbit-token.js');
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
