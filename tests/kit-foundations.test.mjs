// The foundations: lang, format, sidesInOrder, ready, toast's action and batch,
// segmented's count, the shared service worker.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import * as lang from '../kit/lang.mjs';
import * as orbit from '../kit/orbit.mjs';
import * as fmt from '../kit/format.mjs';
import { sidesInOrder } from '../kit/play-teams.mjs';
import { webcrypto, createHash } from 'node:crypto';

const rawCss = readFileSync(new URL('../kit/orbit.css', import.meta.url), 'utf8');
const swText = readFileSync(new URL('../kit/sw.js', import.meta.url), 'utf8');

// A just-enough DOM (see kit-components.test.mjs) with classList, remove and a body.
class FakeNode {}
class FakeEl extends FakeNode {
  constructor(tag) {
    super();
    this.tag = tag;
    this.className = '';
    this.attrs = {};
    this.children = [];
    this.handlers = {};
    this.hidden = false;
    this.isConnected = false;
    this.style = { props: {}, setProperty: (k, v) => (this.style.props[k] = v) };
    this.classList = {
      add: c => (this.className = `${this.className} ${c}`.trim()),
      contains: c => this.className.split(' ').includes(c)
    };
  }
  setAttribute(k, v) {
    this.attrs[k] = v;
    if (k === 'hidden') this.hidden = true;
  }
  removeAttribute(k) {
    delete this.attrs[k];
  }
  addEventListener(k, f) {
    this.handlers[k] = f;
  }
  append(...xs) {
    for (const x of xs) if (x instanceof FakeEl) x.isConnected = this.isConnected || this === body;
    this.children.push(...xs);
  }
  remove() {
    this.isConnected = false;
    if (this.parent) this.parent.children = this.parent.children.filter(c => c !== this);
    const i = body.children.indexOf(this);
    if (i >= 0) body.children.splice(i, 1);
  }
  set textContent(v) {
    this.children = [String(v)];
  }
  get textContent() {
    return this.children.map(c => (c instanceof FakeEl ? c.textContent : c)).join('');
  }
  find(cls) {
    return this.className.split(' ').includes(cls) ? this : this.children.filter(c => c instanceof FakeEl).map(c => c.find(cls)).find(Boolean) || null;
  }
}
const body = new FakeEl('body');
const loading = new FakeEl('div');
globalThis.Node = FakeNode;
globalThis.document = {
  body,
  createElement: t => new FakeEl(t),
  createTextNode: s => String(s),
  getElementById: id => (id === 'loading' ? loading : null),
  querySelector: sel => (sel === '.q-toast' ? body.children.find(c => c.className.split(' ').includes('q-toast')) || null : null)
};
// Toasts show on the real body: append marks them connected.
const ui = await import('../kit/ui.mjs');
const toasts = () => body.children.filter(c => c.className.split(' ').includes('q-toast'));

test('lang: W, en, makeT', () => {
  assert.equal(lang.lang, 'zh');
  assert.equal(lang.en, false);
  assert.equal(lang.W('今天', 'Today'), '今天');
  const strings = { zh: { hi: '你好 {name}', only: '只有中文' }, en: { hi: 'Hello {name}' } };
  const t = lang.makeT(strings, 'en');
  assert.equal(t('hi', { name: 'Amy' }), 'Hello Amy');
  assert.equal(t('only'), '只有中文', 'English falls back to Chinese');
  assert.equal(t('nope'), 'nope', 'then to the key');
  assert.equal(t('hi'), 'Hello ', 'a variable not given is empty');
  assert.equal(lang.makeT(strings, 'zh')('hi', { name: 'A' }), '你好 A');
  assert.equal(lang.makeT(strings)('hi', { name: 'B' }), '你好 B', 'the page language by default (zh under Node)');
});

test('format: DASH, and a zero never carries a sign', () => {
  assert.equal(fmt.DASH, '—');
  for (const f of [() => fmt.num(NaN), () => fmt.money(NaN, 'TWD'), () => fmt.price(undefined, 'TWD'), () => fmt.pct(Infinity), () => fmt.compact(NaN)]) assert.equal(f(), '—');
  assert.equal(fmt.money(1234, 'TWD'), 'NT$1,234');
  assert.equal(fmt.money(500, 'TWD', { sign: true }), '+NT$500');
  assert.equal(fmt.money(-500, 'TWD'), '−NT$500');
  for (const x of [0, 0.4, -0.4, -0.49, 1e-9, -0]) {
    assert.equal(fmt.money(x, 'TWD', { sign: true }), 'NT$0', `${x}`);
    // The same rule as orbit.mjs money() (NT$ play money).
    assert.equal(fmt.money(x, 'TWD', { sign: true }), orbit.money(x, { sign: true }), `orbit ${x}`);
  }
  assert.equal(fmt.money(-0.5, 'TWD'), orbit.money(-0.5));
  assert.equal(fmt.money(0.004, 'USD', { sign: true }), 'US$0.00');
  assert.equal(fmt.money(-3.2, 'EUR'), '−€3.20');
  assert.equal(fmt.pct(0.0123), '+1.23%');
  assert.equal(fmt.pct(-0.0123), '−1.23%');
  assert.equal(fmt.pct(0.0123, { sign: false }), '1.23%');
  assert.equal(fmt.pct(0.00001), '0.00%');
  assert.equal(fmt.pct(-0.00001), '0.00%');
  assert.equal(fmt.price(2550, 'TWD'), '2,550.00');
  assert.equal(fmt.price(83415, 'USD', { short: true }), '83,415');
  assert.equal(fmt.price(0.000012, 'USD'), '0.000012');
  assert.equal(fmt.num(1234.5, 1), '1,234.5');
  assert.equal(fmt.compact(12345), '1.2萬');
  fmt.setFormatLocale('en');
  assert.equal(fmt.compact(12345678), '12.3M');
  fmt.setFormatLocale('zh');
});

test('sidesInOrder: soccer home first, US-style away first', () => {
  const game = sport => ({ sport, home: 'H', away: 'A' });
  assert.deepEqual(sidesInOrder(game('epl')), ['H', 'A']);
  assert.deepEqual(sidesInOrder(game('mls')), ['H', 'A']);
  assert.deepEqual(sidesInOrder(game('mlb')), ['A', 'H']);
  assert.deepEqual(sidesInOrder(game('nba')), ['A', 'H']);
  assert.deepEqual(sidesInOrder(game('nfl')), ['A', 'H']);
  assert.deepEqual(sidesInOrder({ family: 'soccer', home: 1, away: 2 }), [1, 2]);
  assert.deepEqual(sidesInOrder({ family: 'basketball', home: 1, away: 2 }), [2, 1]);
  assert.deepEqual(sidesInOrder(game('unknown')), ['A', 'H']);
  assert.deepEqual(sidesInOrder({ home: 1 }), [undefined, 1]);
});

test('segmented: a count badge after the label, none for 0 or null', () => {
  const seg = ui.segmented([{ id: 'a', label: 'A', count: 3 }, { id: 'b', label: 'B', count: 0 }, { id: 'c', label: 'C' }, { id: 'd', label: 'D', count: 120 }]);
  const badge = i => seg.children[i].find('q-seg-count');
  assert.equal(badge(0).textContent, '3');
  assert.equal(badge(1), null);
  assert.equal(badge(2), null);
  assert.equal(badge(3).textContent, '99+');
  assert.equal(ui.segCount(null), '');
  assert.equal(ui.segCount(-1), '');
  const html = ui.segHtml([['a', 'A', 2], ['b', 'B', 0], ['c', 'C']], 'a');
  assert.equal(html.match(/q-seg-count/g).length, 1);
  assert.match(html, />A<span class="q-seg-count">2<\/span><\/button>/);
  assert.equal(ui.segHtml([['a', 'A']], 'a'), '<div class="q-seg" role="tablist" style="--q-seg-n:1;--q-seg-i:0" data-to="0"><button type="button" role="tab" aria-selected="true" >A</button></div>', 'unchanged without a count');
});

test('pickSeg: a few as the capsule (aria-pressed, thumb from the last pick), more as chips', async () => {
  const picks = [];
  const a = ui.pickSeg([['x', 'X'], ['y', 'Y', 4]], 'x', id => picks.push(id), { cls: 'test-seg' });
  assert.equal(a.className, 'q-seg test-seg');
  assert.deepEqual(a.children.map(b => b.attrs['aria-pressed']), ['true', 'false']);
  assert.equal(a.children[1].find('q-seg-count').textContent, '4');
  a.children[0].handlers.click();
  a.children[1].handlers.click();
  assert.deepEqual(picks, ['y'], 'a tap on the one on does nothing');
  const b = ui.pickSeg([{ id: 'x', label: 'X' }, { id: 'y', label: 'Y' }], 'y', () => {}, { cls: 'test-seg' });
  assert.match(b.attrs.style, /--q-seg-i:0/, 'starts on the last pick');
  assert.equal(b.attrs['data-to'], '1');
  await Promise.resolve();
  assert.equal(b.style.props['--q-seg-i'], '1', 'not in the page: straight to the pick');
  const many = ui.pickSeg(['a', 'b', 'c', 'd', 'e'].map(k => [k, k]), 'c', () => {});
  assert.equal(many.className, 'q-chips');
  assert.equal(many.children[2].className, 'q-chip');
  assert.equal(ui.pickSeg(['a', 'b', 'c', 'd', 'e'].map(k => [k, k]), 'c', () => {}, { seg: true }).className, 'q-seg');
  assert.equal(ui.pickSeg([['a', 'A']], 'a', () => {}, { chips: true }).className, 'q-chips');
  assert.equal(ui.segHtml([['a', 'A']], 'a', { pressed: true, cls: 'small' }), '<div class="q-seg small" role="group" style="--q-seg-n:1;--q-seg-i:0" data-to="0"><button type="button" aria-pressed="true" >A</button></div>');
});

test('toast: as before, an action button, and batch', () => {
  const real = globalThis.setTimeout;
  const realClear = globalThis.clearTimeout;
  const timers = [];
  globalThis.setTimeout = (f, ms) => timers.push({ f, ms }) && timers.length;
  globalThis.clearTimeout = () => {};
  try {
    body.children.length = 0;
    const a = ui.toast('hello');
    assert.equal(a.textContent, 'hello');
    assert.equal(a.children.length, 1);
    ui.toast('second');
    assert.equal(toasts().length, 1, 'one at a time, as always');
    assert.equal(toasts()[0].textContent, 'second');

    let tapped = 0;
    const b = ui.toast('Deleted', { action: { label: 'Undo', onTap: () => tapped++ } });
    const button = b.find('q-toast-action');
    assert.equal(button.textContent, 'Undo');
    button.handlers.click();
    assert.equal(tapped, 1);
    assert.match(b.className, /out/, 'a tap closes it');

    body.children.length = 0;
    ui.toast('Saved', { batch: 'save' });
    ui.toast('Saved', { batch: 'save' });
    assert.equal(toasts().length, 1);
    assert.equal(toasts()[0].textContent, 'Saved ×2');
    ui.toast('Saved', { batch: 'save' });
    assert.equal(toasts()[0].textContent, 'Saved ×3');
    ui.toast('Other text', { batch: 'save' });
    assert.equal(toasts()[0].textContent, 'Other text', 'the same key, other text: replaces, no count');
    ui.toast('Other text', { batch: 'else' });
    assert.equal(toasts()[0].textContent, 'Other text', 'another key starts again');
  } finally {
    globalThis.setTimeout = real;
    globalThis.clearTimeout = realClear;
  }
});

test('ready: lifts when the first screen settles, or after max', async () => {
  loading.hidden = false;
  loading.className = '';
  await ui.ready(Promise.resolve(1), { max: 5000 });
  assert.match(loading.className, /q-lift/);
  await new Promise(r => setTimeout(r, 260));
  assert.equal(loading.hidden, true, 'hidden once faded');

  loading.hidden = false;
  loading.className = '';
  const t0 = Date.now();
  await ui.ready(new Promise(() => {}), { max: 40 });
  assert.ok(Date.now() - t0 < 1000, 'a screen that never settles is cut at max');
  assert.match(loading.className, /q-lift/);

  loading.hidden = false;
  loading.className = '';
  await ui.ready(() => Promise.reject(new Error('offline')), { max: 5000 });
  assert.match(loading.className, /q-lift/, 'a failed first screen still lifts');
  await ui.ready(Promise.resolve(), { max: 10 });
  await new Promise(r => setTimeout(r, 260));
});

test('the stylesheet has the Foundations section and its classes', () => {
  const css = rawCss.replace(/\/\*[\s\S]*?\*\//g, '');
  assert.match(rawCss, /Foundations \(design review\)/);
  assert.ok(rawCss.indexOf('Foundations (design review)') > rawCss.indexOf('Premium components (round 3)'));
  for (const c of ['q-toast-action', 'q-toast-text', 'q-seg-count', 'q-lift']) assert.match(css, new RegExp(`\\.${c}(?![\\w-])`), c);
  assert.doesNotMatch(css.slice(css.indexOf('.q-toast-text')), /#[0-9a-fA-F]{3,8}\b(?<!#ffffff)/);
});

// The worker as an app runs it (its settings, then kit/sw.js), in a made-up
// browser: caches by name, and a network that answers from `net` (a path →
// text, or a function of the try).
function runWorker(settings, net = {}) {
  const listeners = {};
  const store = new Map([['app-a-v1', new Map()], ['app-a-data', new Map()], ['app-b-v1', new Map()], ['orbit-images-v1', new Map()]]);
  const cacheOf = name => {
    if (!store.has(name)) store.set(name, new Map());
    const m = store.get(name);
    const key = r => (typeof r === 'string' ? new URL(r, 'https://x.test/App/').href : r.url);
    return {
      addAll: async us => us.forEach(u => m.set(key(u), new Response('page'))),
      keys: async (u, o) => [...m.keys()].filter(k => !u || (o?.ignoreSearch ? k.split('?')[0] === u : k === u)).map(url => ({ url })),
      put: async (r, res) => m.set(key(r), res),
      delete: async r => m.delete(key(r)),
      match: async r => m.get(key(r))?.clone()
    };
  };
  const self = {
    ORBIT_SW: settings,
    addEventListener: (k, f) => (listeners[k] = f),
    skipWaiting: async () => (self.skipped = true),
    clients: { claim: async () => (self.claimed = true) },
    location: { origin: 'https://x.test' },
    registration: { scope: 'https://x.test/App/' }
  };
  const caches = {
    open: async n => cacheOf(n),
    keys: async () => [...store.keys()],
    delete: async n => store.delete(n),
    match: async r => {
      for (const n of store.keys()) {
        const hit = await cacheOf(n).match(r);
        if (hit) return hit;
      }
    }
  };
  const asked = [];
  const fetch = async (r, init) => {
    const url = typeof r === 'string' ? r : r.url;
    const path = new URL(url).pathname;
    asked.push({ path, cache: init?.cache });
    const body = typeof net[path] === 'function' ? net[path](asked.filter(a => a.path === path).length) : net[path];
    if (body == null) throw new TypeError('Load failed');
    return new Response(body, { status: 200 });
  };
  vm.runInNewContext(readFileSync(new URL('../kit/sw.js', import.meta.url), 'utf8'), { self, caches, URL, Request, Response, Promise, setTimeout: f => setTimeout(f, 0), fetch, crypto: webcrypto, Uint8Array });
  const go = async url => {
    let answer;
    const work = [];
    listeners.fetch({ request: new Request(url), respondWith: p => (answer = p), waitUntil: p => work.push(p) });
    const res = await answer;
    await Promise.all(work);
    return res;
  };
  return { listeners, store, asked, go, self };
}
const served = text => createHash('sha256').update(text).digest('hex').slice(0, 12);

test("the worker installs, and drops only this app's old caches (its data kept)", async () => {
  const w = runWorker({ cache: 'app-a-v2', spare: ['app-a-data'] });
  let work;
  w.listeners.install({ waitUntil: p => (work = p) });
  await work;
  assert.ok(w.self.skipped);
  w.listeners.activate({ waitUntil: p => (work = p) });
  await work;
  assert.ok(w.self.claimed);
  assert.deepEqual([...w.store.keys()].sort(), ['app-a-data', 'app-a-v2', 'app-b-v1', 'orbit-images-v1']);
  assert.ok(!/\bimport\s/.test(readFileSync(new URL('../kit/sw.js', import.meta.url), 'utf8').replace(/\/\/.*$/gm, '')), 'a classic script');
});

test("a file under its hash is kept only when it's that file: the CDN's old copy is asked again, never kept", async () => {
  const fresh = 'export const a = 2;';
  const old = 'export const a = 1;';
  const url = `https://x.test/App/app.mjs?v=${served(fresh)}`;
  // The CDN on the old file for two tries, then the new one.
  let w = runWorker({ cache: 'app-a-v2' }, { '/App/app.mjs': n => (n <= 2 ? old : fresh) });
  let res = await w.go(url);
  assert.equal(await res.text(), fresh);
  assert.equal(w.asked[1].cache, 'reload', "asked again past the browser's cache");
  assert.equal(await (await w.store.get('app-a-v2').get(url)).text(), fresh);
  // Still the old one after every try: a 503, and nothing kept.
  w = runWorker({ cache: 'app-a-v2' }, { '/App/app.mjs': old });
  res = await w.go(url);
  assert.equal(res.status, 503);
  assert.equal(w.store.get('app-a-v2')?.has(url) || false, false);
  // An address without a file hash (an old deploy's, the kit's version) is taken as it comes.
  w = runWorker({ cache: 'app-a-v2' }, { '/App/x.mjs': old });
  assert.equal(await (await w.go('https://x.test/App/x.mjs?v=abc123')).text(), old);
});

test("an app's own routes: its data kept-first, its samples answered its way", async () => {
  const w = runWorker({ cache: 'app-a-v2', route: (r, u) => (u.pathname.includes('/data/') ? 'pageFirst' : u.pathname.includes('/samples/') ? Promise.resolve(new Response('mine')) : null) }, { '/App/data/a.json': '{"a":1}' });
  assert.equal(await (await w.go('https://x.test/App/samples/kick.wav')).text(), 'mine');
  assert.equal(await (await w.go('https://x.test/App/data/a.json')).text(), '{"a":1}');
  assert.ok(w.store.get('app-a-v2').has('https://x.test/App/data/a.json'));
});

test('format: SYMBOLS match stock-markets CURRENCIES', async () => {
  const { SYMBOLS } = await import('../kit/format.mjs');
  const { CURRENCIES } = await import('../kit/stock-markets.mjs');
  assert.deepEqual(Object.keys(SYMBOLS).sort(), Object.keys(CURRENCIES).sort());
  for (const [k, c] of Object.entries(CURRENCIES)) assert.deepEqual(SYMBOLS[k], [c.symbol, c.digits], k);
});
