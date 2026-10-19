// The foundations: lang, format, sidesInOrder, ready, toast's action and batch,
// segmented's count, the shared service worker and its stamp.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import * as lang from '../kit/lang.mjs';
import * as quadra from '../kit/quadra.mjs';
import * as fmt from '../kit/format.mjs';
import { sidesInOrder } from '../kit/play-teams.mjs';
import { stampSw, listAssets } from '../tools/stamp.mjs';

const rawCss = readFileSync(new URL('../kit/quadra.css', import.meta.url), 'utf8');
const swText = readFileSync(new URL('../kit/sw.js', import.meta.url), 'utf8');

// A just-enough DOM (see kit-premium.test.mjs) with classList, remove and a body.
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

test('lang: W, en, makeT, and the one detectLang', () => {
  assert.equal(lang.detectLang, quadra.detectLang);
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
    // The same rule as quadra.mjs money() (NT$ play money).
    assert.equal(fmt.money(x, 'TWD', { sign: true }), quadra.money(x, { sign: true }), `quadra ${x}`);
  }
  assert.equal(fmt.money(-0.5, 'TWD'), quadra.money(-0.5));
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

test('stampSw writes the version and files into the STAMP line only', () => {
  const out = stampSw(swText, { cache: 'orbit-weather', version: 'abc123', assets: ['./', 'app.js', 'lib/x.mjs'] });
  assert.match(out, /const STAMP = \{ ?cache: 'orbit-weather', version: 'abc123', assets: \['\.\/', 'app\.js', 'lib\/x\.mjs'\] ?\};/);
  assert.equal(out.split('\n').length, swText.split('\n').length);
  assert.equal(stampSw(out, { cache: 'orbit-weather', version: 'abc123', assets: ['./', 'app.js', 'lib/x.mjs'] }), out, 'stamping again is the same');
  assert.throws(() => stampSw(swText, { cache: "bad'name" }));
  assert.throws(() => stampSw('no markers', { cache: 'x' }));
  assert.ok(!/\bimport\s/.test(swText.replace(/\/\/.*$/gm, '')), 'a classic script');
});

test('the stamped worker installs, cleans only its own old caches, and answers', async () => {
  const stamped = stampSw(swText, { cache: 'app-a', version: 'v2', assets: ['./', 'app.js', 'gone.js'] });
  const listeners = {};
  const store = new Map([['app-a-v1', new Map()], ['app-b-v1', new Map()], ['quadra-images-v1', new Map()]]);
  const cache = name => ({
    add: async u => {
      if (u === 'gone.js') throw new Error('404');
      store.get(name).set(u, 1);
    },
    addAll: async us => us.forEach(u => store.get(name).set(u, 1)),
    keys: async () => [],
    put: async () => {}
  });
  const self = {
    addEventListener: (k, f) => (listeners[k] = f),
    skipWaiting: async () => (self.skipped = true),
    clients: { claim: async () => (self.claimed = true) },
    location: { origin: 'https://x.test' },
    registration: { scope: 'https://x.test/App/' }
  };
  const caches = {
    open: async n => (store.has(n) || store.set(n, new Map()), cache(n)),
    keys: async () => [...store.keys()],
    delete: async n => store.delete(n),
    match: async () => undefined
  };
  vm.runInNewContext(stamped, { self, caches, URL, Promise, setTimeout, fetch: async () => ({}) });
  let work;
  await listeners.install({ waitUntil: p => (work = p) });
  await work;
  assert.ok(self.skipped);
  assert.deepEqual([...store.get('app-a-v2').keys()].sort(), ['./', 'app.js'], 'a missing file is skipped, not fatal');
  await listeners.activate({ waitUntil: p => (work = p) });
  await work;
  assert.ok(self.claimed);
  assert.deepEqual([...store.keys()].sort(), ['app-a-v2', 'app-b-v1', 'quadra-images-v1'], 'only this app\'s old version went');
});

test('listAssets: the page first, then its files; not the worker or version.json', async () => {
  const { mkdtemp, writeFile, mkdir } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const dir = await mkdtemp(join(tmpdir(), 'stamp-'));
  await mkdir(join(dir, 'lib'));
  await mkdir(join(dir, 'data'));
  for (const f of ['index.html', 'app.js', 'sw.js', 'version.json', 'app.js.map', 'lib/a.mjs', 'data/big.json', 'notes.txt']) await writeFile(join(dir, f), '');
  assert.deepEqual(await listAssets(dir), ['./', 'app.js', 'data/big.json', 'index.html', 'lib/a.mjs']);
  assert.deepEqual(await listAssets(dir, { exclude: ['data/'] }), ['./', 'app.js', 'index.html', 'lib/a.mjs']);
});
