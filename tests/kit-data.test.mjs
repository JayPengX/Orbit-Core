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
globalThis.fetch = async (url, init) => {
  asked.push(String(url));
  return answer(String(url), init);
};
const kit = await import('../kit/orbit.mjs');
const settle = () => new Promise(r => setTimeout(r, 5));
// Saves and wipes finish after the read answers; a slow runner needs more than one settle.
const until = async ok => { for (let i = 0; i < 100 && !(await ok()); i++) await settle(); };
const kept = () => [...(stores.get('orbit-data-v1') || new Map()).keys()];

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
    const copy = await (await caches.open('orbit-data-v1')).match(kept()[0]);
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
  const old = k => k.includes(encodeURIComponent('https://jaypengx.github.io/Shared-Data/sports/mlb/2026.json'));
  await until(() => kept().some(old));
  assert.ok(kept().some(k => k.includes(encodeURIComponent('https://jaypengx.github.io/Shared-Data/sports/mlb/2026.json'))));
  await assert.rejects(kit.packJson('sports/zzz/2026.json'), /404/);
});

test('signing out wipes the device but its language, safe area and kit version', async () => {
  for (const k of ['orbit.lang', 'orbit.safeBottom', 'orbit.kit', 'orbit.refresh', 'orbit.account', 'orbit.wallet', 'fx.day.v4']) localStorage.setItem(k, '1');
  kit.wipeDevice();
  await until(() => !stores.has('orbit-data-v1'));
  assert.deepEqual([...local.keys()].sort(), ['orbit.kit', 'orbit.lang', 'orbit.safeBottom']);
  assert.equal(stores.has('orbit-data-v1'), false);
});

// ESPN's core API refuses the proxy (403, 2026-10-22): read from the device itself.
test('an ESPN core API read goes straight to ESPN, never through the proxy', async () => {
  const url = 'https://sports.core.api.espn.com/v2/sports/racing/leagues/f1/events/1/competitions/2/competitors/3/statistics';
  asked.length = 0;
  answer = () => new Response('{"splits":{}}');
  assert.deepEqual(await kit.proxyJson(url, { ttl: 1 }), { splits: {} });
  assert.deepEqual(asked, [url]);
});

// Jolpica turns the proxy away (its limit counts per address; Cloudflare's are
// shared, 429 on every path, 2026-11-03) but answers a phone: read it from the
// device at once, then straight from the device for a while; a 404 is its own.
test('a Jolpica read the proxy is turned away from is read from the device at once, and from the device after', async () => {
  const url = 'https://api.jolpi.ca/ergast/f1/2026/drivers.json?limit=60';
  asked.length = 0;
  answer = u => (u.startsWith('https://api.jolpi.ca/') ? new Response('{"MRData":{"total":"22"}}') : new Response('', { status: 429 }));
  assert.deepEqual(await kit.proxyJson(url, { ttl: 1, alone: true }), { MRData: { total: '22' } });
  assert.equal(asked.length, 2);
  assert.ok(asked[0].includes(encodeURIComponent(url)) && !asked[0].startsWith('https://api.jolpi.ca/'), 'the proxy first');
  assert.equal(asked[1], url);
  // Then straight from the device: the proxy isn't asked.
  asked.length = 0;
  const next = 'https://api.jolpi.ca/ergast/f1/2026/results.json?limit=100';
  assert.deepEqual(await kit.proxyJson(next, { ttl: 1, alone: true, trim: 'jolpica-results' }), { MRData: { total: '22' } });
  assert.deepEqual(asked, [next]);
  // Another host is never read from the device.
  asked.length = 0;
  await assert.rejects(kit.proxyJson('https://example.test/turned-away.json', { alone: true }));
  assert.ok(asked.every(u => !u.startsWith('https://example.test/')));
});

test("a big answer still coming on a slow link is read to its end; one that has gone quiet fails in its time", async () => {
  // (Its pieces `gap` ms apart; the read's signal ends it.)
  const trickle = (pieces, gap) => (url, init) =>
    new Response(
      new ReadableStream({
        async start(c) {
          init?.signal?.addEventListener('abort', () => c.error(init.signal.reason));
          for (const p of pieces) {
            await new Promise(r => setTimeout(r, gap));
            if (init?.signal?.aborted) return;
            c.enqueue(new TextEncoder().encode(p));
          }
          c.close();
        }
      })
    );
  const games = Array.from({ length: 13 }, (_, i) => i);
  // 14 pieces 15 ms apart: 210 ms in all, over its 60 ms, never quiet that long (a season's pack on a busy 3G link).
  answer = trickle(['{"games":[', ...games.slice(0, -1).map(g => `${g},`), '12]}'], 15);
  assert.deepEqual(await kit.packJson('slow/big.json', { timeout: 60 }), { games });
  // Quiet longer than its time: a failure, never left waiting.
  answer = trickle(['{"games":[', '1]}'], 150);
  const t = Date.now();
  await assert.rejects(kit.packJson('slow/stalled.json', { timeout: 60 }), e => e?.name === 'TimeoutError');
  assert.ok(Date.now() - t < 140, `failed in ${Date.now() - t} ms`);
});
