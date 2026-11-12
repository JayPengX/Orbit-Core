// An update never holds up an opening longer than it must, nor swaps the
// screen in front of the person (Jay 2026-11-06: "Always stuck here so long
// after an update", and "I hate one open later"): on a quick link the
// service worker opens the server's page, the new version, at once (the app
// starts once, not the old one and then the new); on a slow one the kept
// page opens as before and boot.js loads the new version behind the cover.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const swSource = readFileSync(new URL('../kit/sw.js', import.meta.url), 'utf8');
const ORIGIN = 'https://orbit.test';
const page = v => `<!doctype html><html><head><meta name="build-version" content="${v}"><script>!function(){}('../Orbit-Core/kit/',null)</script></head><body></body></html>`;

// The kit's service worker in a sandbox: its caches, and a server that answers after `serverMs`.
function worker({ serverMs, lastCheckMs, preload }) {
  const asked = [];
  const stores = new Map();
  const store = name => {
    if (!stores.has(name)) stores.set(name, new Map());
    const m = stores.get(name);
    const key = (u, ignoreSearch) => {
      const x = new URL(typeof u === 'string' ? u : u.url, ORIGIN);
      return ignoreSearch ? x.origin + x.pathname : x.href;
    };
    return {
      match: async (u, o) => {
        for (const [k, r] of m) if (key(k, o?.ignoreSearch) === key(u, o?.ignoreSearch)) return r.clone();
        return undefined;
      },
      put: async (u, r) => void m.set(key(u), r.clone()),
      keys: async (u, o) => [...m.keys()].filter(k => !u || key(k, o?.ignoreSearch) === key(u, o?.ignoreSearch)).map(url => ({ url })),
      delete: async u => m.delete(typeof u === 'string' ? u : u.url)
    };
  };
  const caches = {
    open: async name => store(name),
    match: async (u, o) => {
      for (const name of stores.keys()) {
        const r = await store(name).match(u, o);
        if (r) return r;
      }
    },
    keys: async () => [...stores.keys()],
    delete: async name => stores.delete(name)
  };
  const handlers = {};
  const fetch = async (u, init = {}) => {
    const url = String(typeof u === 'string' ? u : u.url);
    asked.push(url);
    await new Promise((done, fail) => {
      const t = setTimeout(done, serverMs);
      init.signal?.addEventListener('abort', () => (clearTimeout(t), fail(new Error('aborted'))));
    });
    if (url.endsWith('/kit/version.json')) return new Response(JSON.stringify({ version: 'k2', files: { 'orbit.mjs': 'aaaaaaaaaaaa' } }), { status: 200 });
    return new Response(page('new'), { status: 200, headers: { 'content-type': 'text/html' } });
  };
  const self = { ORBIT_SW: { cache: 'orbit-test-v1' }, location: { origin: ORIGIN }, addEventListener: (t, f) => (handlers[t] = f), navigator: { onLine: true } };
  vm.runInNewContext(swSource, { self, caches, fetch, Response, Request, Headers, URL, AbortController, setTimeout, clearTimeout, crypto, console, Promise, Date });
  return {
    asked,
    async ready() {
      await (await caches.open('orbit-test-v1')).put(`${ORIGIN}/test/`, new Response(page('old')));
      if (lastCheckMs != null) await (await caches.open('orbit-sw-link')).put('/__orbit/page-check-ms', new Response(String(lastCheckMs)));
    },
    async open() {
      let answer;
      const t0 = Date.now();
      const preloadResponse = preload ? preload() : undefined;
      handlers.fetch({ request: { url: `${ORIGIN}/test/`, mode: 'navigate', method: 'GET', destination: 'document' }, preloadResponse, respondWith: p => (answer = p), waitUntil: () => {} });
      const res = await answer;
      return { ms: Date.now() - t0, html: await res.text() };
    }
  };
}

test('on a quick link an opening after a deploy is the new version at once, the kit noted for it', async () => {
  const sw = worker({ serverMs: 30, lastCheckMs: 120 });
  await sw.ready();
  const { html, ms } = await sw.open();
  assert.match(html, /content="new"/, 'the server page, not the kept old one: the app starts once');
  assert.match(html, /__orbitFresh=/, 'boot.js told it is the newest');
  assert.match(html, /orbit\.kitFiles/, "the kit's newest files noted for its loader");
  assert.ok(ms < 400, `${ms} ms`);
});

test('on a slow link the kept page opens at once, never waiting on the server', async () => {
  const sw = worker({ serverMs: 3000, lastCheckMs: 2000 });
  await sw.ready();
  const { html, ms } = await sw.open();
  assert.match(html, /content="old"/);
  assert.ok(ms < 200, `${ms} ms`);
});

test('a server that stalls is waited on at most PAGE_WAIT_MS', async () => {
  const sw = worker({ serverMs: 5000, lastCheckMs: 100 });
  await sw.ready();
  const { html, ms } = await sw.open();
  assert.match(html, /content="old"/);
  assert.ok(ms < 1800, `${ms} ms`);
});

// Navigation preload: the page asked while the worker started is the one used, never asked twice.
test("an opening takes the browser's navigation preload in place of asking the server again", async () => {
  const sw = worker({ serverMs: 30, lastCheckMs: 120, preload: () => new Promise(done => setTimeout(() => done(new Response(page('pre'), { status: 200 })), 10)) });
  await sw.ready();
  const { html } = await sw.open();
  assert.match(html, /content="pre"/);
  assert.ok(!sw.asked.some(u => u.endsWith('/test/')), `asked again: ${sw.asked}`);
});
test('a preload that fails is asked again; none (a first visit, an old browser) as before', async () => {
  const failing = worker({ serverMs: 30, lastCheckMs: 120, preload: () => Promise.reject(new Error('net')) });
  await failing.ready();
  assert.match((await failing.open()).html, /content="new"/);
  const empty = worker({ serverMs: 30, lastCheckMs: 120, preload: () => Promise.resolve(undefined) });
  await empty.ready();
  assert.match((await empty.open()).html, /content="new"/);
});

test('the watch downloads a newer version behind the screen and swaps only after the person was away', async () => {
  const { watchUpdates } = await import('../kit/orbit.mjs');
  const saved = {};
  for (const k of ['document', 'fetch', 'setInterval', 'BroadcastChannel', 'ORBIT_KIT', 'location', 'sessionStorage', 'navigator', '__bootCheck', '__bootChecked', 'addEventListener'])
    saved[k] = Object.getOwnPropertyDescriptor(globalThis, k);
  const swapped = [];
  const on = {};
  let clock = Date.now();
  const realNow = Date.now;
  const store = new Map();
  try {
    const box = { hidden: true, classList: { remove: () => {} } };
    const doc = { visibilityState: 'visible', addEventListener: (t, f) => (on[t] = f), getElementById: () => box, querySelector: () => null };
    Object.defineProperty(globalThis, 'document', { value: doc, configurable: true, writable: true });
    Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true, writable: true });
    globalThis.location = { pathname: '/sports/', hash: '', href: 'https://x.test/sports/', replace: u => swapped.push(u), reload: () => swapped.push('reload') };
    globalThis.sessionStorage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
    globalThis.setInterval = () => 0;
    globalThis.BroadcastChannel = undefined;
    globalThis.ORBIT_KIT = undefined;
    globalThis.addEventListener = () => {};
    globalThis.__bootCheck = Promise.resolve('watch');
    globalThis.__bootChecked = 0;
    globalThis.fetch = async url => {
      const u = String(url);
      if (u.endsWith('version.json')) return new Response(JSON.stringify({ version: 'new' }), { status: 200 });
      // (The new page, every file it names on the phone.)
      return new Response('<meta name="build-version" content="new">', { status: 200 });
    };
    Date.now = () => clock;
    watchUpdates({ current: 'old', key: 'test' });
    // The opening's first screen is up: the watch looks 2 s after it.
    await new Promise(done => setTimeout(done, 2400));
    assert.deepEqual(swapped, [], 'an update found while the person looks at the app is never swapped in');
    // Away a moment and back: still the same screen.
    doc.visibilityState = 'hidden';
    on.visibilitychange();
    clock += 30_000;
    doc.visibilityState = 'visible';
    on.visibilitychange();
    await new Promise(done => setTimeout(done, 50));
    assert.deepEqual(swapped, [], 'a short look away is not an opening');
    // Away for a while, then back: an opening, on the new version from the phone.
    doc.visibilityState = 'hidden';
    on.visibilitychange();
    clock += 6 * 60_000;
    doc.visibilityState = 'visible';
    on.visibilitychange();
    for (let i = 0; i < 100 && !swapped.length; i++) await new Promise(done => setTimeout(done, 30));
    assert.deepEqual(swapped, ['/sports/?v=new']);
    assert.equal(box.hidden, false, 'the cover is up while the new version comes from the phone');
  } finally {
    Date.now = realNow;
    for (const [k, d] of Object.entries(saved)) {
      if (d) Object.defineProperty(globalThis, k, d);
      else delete globalThis[k];
    }
  }
});

// A page left open in the background asks for updates only once it's back on
// screen, so a deploy made while it was away was found a second after it came
// back, and swapNow (only "away 5 minutes") had just been cleared: the old
// version stayed until the next time away (2026-11-12). The first seconds back,
// before a touch, are still the opening.
test('an update found in the first seconds back after a long time away opens then', () => {
  const src = readFileSync(new URL('../kit/orbit.mjs', import.meta.url), 'utf8');
  const fn = src.slice(src.indexOf('export function watchUpdates('), src.indexOf('// Every app\'s page starts the watch'));
  const swapNow = fn.slice(fn.indexOf('function swapNow('), fn.indexOf('async function swap('));
  assert.match(swapNow, /backAt && Date\.now\(\) - backAt < BACK_MS/);
  assert.match(fn, /backAt = awaySince != null && Date\.now\(\) - awaySince >= AWAY_MS \? Date\.now\(\) : 0;\s*awaySince = null;\s*check\(Boolean\(backAt\)\)/);
  // (A touch, a key or a scroll: the person is using the page, never swapped in front of them.)
  assert.match(fn, /\['pointerdown', 'keydown', 'wheel', 'touchstart'\]\) globalThis\.addEventListener\?\.\(type, \(\) => \(backAt = 0\)/);
  assert.match(src, /const BACK_MS = 4_000;/);
});
