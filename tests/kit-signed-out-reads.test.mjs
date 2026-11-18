// Signed out, a page on the family's site never sends a data read (2026-11-18). The proxy can only
// refuse one (401, ORBIT_PASS_REQUIRED), and an app starts its reads while the sign-in screen is still
// up: Sports sent 30 to 50 at every signed-out opening, each a round trip on the phone and one of the
// proxy's 100,000 requests a day. The kit answers as the proxy would, without asking.
import test from 'node:test';
import assert from 'node:assert/strict';

const storage = map => ({ getItem: k => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: k => map.delete(k), key: i => [...map.keys()][i] ?? null, get length() { return map.size; } });
const local = new Map();
globalThis.localStorage = storage(local);
globalThis.sessionStorage = storage(new Map());
// A page on the family's site (the proxy at its own address under /api).
globalThis.location = { hostname: 'orbit.jaypengx.com', protocol: 'https:', origin: 'https://orbit.jaypengx.com', href: 'https://orbit.jaypengx.com/sports/', pathname: '/sports/', search: '', hash: '' };
// (source-watch.mjs counts a page's outside reads and needs a document: not this test's.)
globalThis.__orbitSourceWatch = true;
const sent = [];
globalThis.fetch = async url => {
  sent.push(String(url));
  return new Response(JSON.stringify({ ok: 1 }));
};
const kit = await import('../kit/orbit.mjs');
const reads = () => sent.filter(u => u.includes('/sports-proxy'));

test('signed out: a read alone and a page’s batch of reads are refused on the phone, none sent', async () => {
  local.clear();
  sent.length = 0;
  await assert.rejects(kit.proxyJson('https://example.test/one.json', { ttl: 1, alone: true }), e => e.status === 401);
  const batch = await Promise.allSettled([1, 2, 3, 4, 5].map(i => kit.proxyJson(`https://example.test/list-${i}.json`, { ttl: 1 })));
  assert.deepEqual(batch.map(r => r.reason?.status), [401, 401, 401, 401, 401]);
  assert.deepEqual(reads(), [], 'nothing reached the proxy');
});

test('signed in: the read goes to the proxy as before', async () => {
  local.clear();
  sent.length = 0;
  local.set('orbit.refresh', 'ref.sig');
  local.set('orbit.account', 'abcdef0123456789');
  assert.deepEqual(await kit.proxyJson('https://example.test/two.json', { ttl: 1, alone: true }), { ok: 1 });
  assert.equal(reads().length, 1);
  assert.match(reads()[0], /^https:\/\/orbit\.jaypengx\.com\/api\/sports-proxy\?url=/);
});
