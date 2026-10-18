// The kit's reads (proxyJson, packJson): a failed read is never "nothing
// there" and never saved; it answers the copy the device has, of any age.
import test from 'node:test';
import assert from 'node:assert/strict';

// The device: Cache Storage and localStorage, as a phone has them.
const stores = new Map();
globalThis.caches = {
  async open(name) {
    if (!stores.has(name)) stores.set(name, new Map());
    const m = stores.get(name);
    return {
      match: async key => (m.has(String(key)) ? m.get(String(key)).clone() : undefined),
      put: async (key, res) => void m.set(String(key), res),
      keys: async () => [...m.keys()],
      delete: async key => m.delete(String(key))
    };
  },
  delete: async name => stores.delete(name)
};
const local = new Map();
globalThis.localStorage = { getItem: k => (local.has(k) ? local.get(k) : null), setItem: (k, v) => local.set(k, String(v)), removeItem: k => local.delete(k), key: i => [...local.keys()][i] ?? null, get length() { return local.size; } };
let answer = () => new Response('{}');
const asked = [];
globalThis.fetch = async url => {
  asked.push(String(url));
  return answer(String(url));
};
const kit = await import('../kit/quadra.mjs');
const settle = () => new Promise(r => setTimeout(r, 5));
const kept = () => [...(stores.get('quadra-data-v1') || new Map()).keys()];

test('a good read is kept on the device; a fresh read that fails answers that copy, whatever failed', async () => {
  const url = 'https://example.test/league.json';
  answer = () => new Response(JSON.stringify({ games: [1, 2, 3] }));
  assert.deepEqual(await kit.proxyJson(url, { ttl: 1, alone: true }), { games: [1, 2, 3] });
  await settle();
  assert.equal(kept().length, 1);
  // A 404 (the source's answer, not asked twice), then an answer that isn't JSON (a cut-off body, a captive portal's page).
  for (const bad of [() => new Response('nope', { status: 404 }), () => new Response('<html>Wi-Fi sign in</html>'), () => new Response('{"games":[1,')]) {
    await new Promise(r => setTimeout(r, 20));
    answer = bad;
    assert.deepEqual(await kit.proxyJson(url, { ttl: 1, alone: true }), { games: [1, 2, 3] });
    await settle();
    const copy = await (await caches.open('quadra-data-v1')).match(kept()[0]);
    assert.deepEqual(await copy.json(), { games: [1, 2, 3] }, 'the good copy is never saved over');
  }
});

test('a failed read with nothing kept is a failure, never an empty answer, and nothing is saved', async () => {
  const url = 'https://example.test/never.json';
  const before = kept().length;
  answer = () => new Response('<html></html>');
  await assert.rejects(kit.proxyJson(url, { alone: true }));
  answer = () => new Response('', { status: 404 });
  await assert.rejects(kit.proxyJson('https://example.test/never2.json', { alone: true }));
  await settle();
  assert.equal(kept().length, before);
});

test('a read within its ttl is answered from memory; a failed one is held, not asked by every part of the page', async () => {
  const url = 'https://example.test/once.json';
  answer = () => new Response('[1]');
  const n = asked.length;
  await Promise.all([kit.proxyJson(url, { alone: true }), kit.proxyJson(url, { alone: true })]);
  await kit.proxyJson(url, { alone: true });
  assert.equal(asked.length - n, 1);
  const down = 'https://example.test/down.json';
  answer = () => new Response('', { status: 404 });
  await assert.rejects(kit.proxyJson(down, { alone: true }));
  const m = asked.length;
  await assert.rejects(kit.proxyJson(down, { alone: true }));
  assert.equal(asked.length, m, 'held, not asked again at once');
});

test("the family's packs: read from R2, kept under their old address, a missing pack a failure", async () => {
  answer = url => (url.endsWith('/sports/mlb/2026.json') ? new Response('{"season":2026}') : new Response('', { status: 404 }));
  assert.deepEqual(await kit.packJson('sports/mlb/2026.json'), { season: 2026 });
  await settle();
  assert.ok(kept().some(k => k.includes(encodeURIComponent('https://jaypengx.github.io/Shared-Data/sports/mlb/2026.json'))));
  await assert.rejects(kit.packJson('sports/zzz/2026.json'), /404/);
});

test('signing out wipes the device but its language, safe area and kit version', async () => {
  for (const k of ['quadra.lang', 'quadra.safeBottom', 'quadra.kit', 'quadra.refresh', 'quadra.account', 'quadra.wallet', 'fx.day.v4']) localStorage.setItem(k, '1');
  kit.wipeDevice();
  await settle();
  assert.deepEqual([...local.keys()].sort(), ['quadra.kit', 'quadra.lang', 'quadra.safeBottom']);
  assert.equal(stores.has('quadra-data-v1'), false);
});
