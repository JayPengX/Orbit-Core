// The Securities parts: stakeInput decimals, logoTile with a list of URLs,
// confirm points with icons, sheetHero logo/status, stockRow and movePill
// (and their HTML twins). The fake DOM is kit-shell.test.mjs's.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as ui from '../kit/ui.mjs';
import * as quadra from '../kit/quadra.mjs';


// ---- A just-enough DOM ----
class FakeNode {}
const parts = sel => sel.split(',').map(x => x.trim());
class FakeEl extends FakeNode {
  constructor(tag) {
    super();
    this.tag = tag;
    this.className = '';
    this.attrs = {};
    this.children = [];
    this.listeners = {};
    this.parentElement = null;
    this.isConnected = false;
    this.open = false;
    this.innerHTML = '';
    this.style = { props: {}, setProperty: (k, v) => (this.style.props[k] = v), removeProperty: k => delete this.style.props[k] };
    this.classList = {
      add: (...c) => (this.className = [...new Set([...this.className.split(' ').filter(Boolean), ...c])].join(' ')),
      remove: (...c) => (this.className = this.className.split(' ').filter(x => x && !c.includes(x)).join(' ')),
      toggle: (c, on) => (on ?? !this.classList.contains(c) ? this.classList.add(c) : this.classList.remove(c)),
      contains: c => this.className.split(' ').includes(c),
      [Symbol.iterator]: () => this.className.split(' ').filter(Boolean)[Symbol.iterator]()
    };
  }
  setAttribute(k, v) {
    if (k === 'class') this.className = String(v);
    this.attrs[k] = String(v);
  }
  getAttribute(k) {
    return this.attrs[k] ?? null;
  }
  hasAttribute(k) {
    return k in this.attrs;
  }
  addEventListener(type, fn) {
    (this.listeners[type] ||= []).push(fn);
  }
  removeEventListener(type, fn) {
    this.listeners[type] = (this.listeners[type] || []).filter(f => f !== fn);
  }
  dispatch(type, ev = {}) {
    const e = { type, target: this, cancelable: true, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, ...ev };
    for (const fn of this.listeners[type] || []) fn(e);
    return e;
  }
  append(...xs) {
    for (const x of xs) {
      this.children.push(x);
      if (x instanceof FakeEl) adopt(x, this);
    }
  }
  replaceChildren(...xs) {
    this.children = [];
    this.append(...xs);
  }
  remove() {
    if (this.parentElement) this.parentElement.children = this.parentElement.children.filter(c => c !== this);
    this.parentElement = null;
    connect(this, false);
  }
  get firstChild() {
    return this.children[0];
  }
  set textContent(v) {
    this.children = [String(v)];
  }
  get textContent() {
    return this.children.map(c => (c instanceof FakeEl ? c.textContent : c)).join('');
  }
  getBoundingClientRect() {
    return { top: 100, bottom: 500, left: 0, right: 400, height: 400 };
  }
  showModal() {
    this.open = true;
  }
  close() {
    if (!this.open) return;
    this.open = false;
    this.dispatch('close');
  }
  matches(sel) {
    return parts(sel).some(s => {
      const m = s.match(/^([a-z]+)?(?:\.([\w-]+))?(?:\[([\w-]+)\])?$/);
      if (!m) return false;
      const [, tag, cls, attr] = m;
      return (!tag || tag === this.tag) && (!cls || this.classList.contains(cls)) && (!attr || (attr === 'open' ? this.open : attr in this.attrs));
    });
  }
  closest(sel) {
    for (let n = this; n; n = n.parentElement) if (n.matches(sel)) return n;
    return null;
  }
  find(cls) {
    if (this.classList.contains(cls)) return this;
    for (const c of this.children) if (c instanceof FakeEl) { const f = c.find(cls); if (f) return f; }
    return null;
  }
  querySelector(sel) {
    // (A descendant selector, as heroCard's '.q-hc-eyebrow span': a stand-in.)
    if (sel.includes(' ') && !sel.includes(',')) return new FakeEl('span');
    for (const c of this.children) {
      if (!(c instanceof FakeEl)) continue;
      if (c.matches(sel)) return c;
      const f = c.querySelector(sel);
      if (f) return f;
    }
    return null;
  }
}
function adopt(x, parent) {
  x.parentElement = parent;
  connect(x, parent.isConnected);
}
function connect(x, on) {
  x.isConnected = on;
  for (const c of x.children) if (c instanceof FakeEl) connect(c, on);
}
// Every class in a tree (and in any markup set as innerHTML), as a sorted set.
const classesOfTree = (n, out = new Set()) => {
  if (!(n instanceof FakeEl)) return out;
  n.className.split(' ').filter(Boolean).forEach(c => out.add(c));
  for (const m of String(n.innerHTML).matchAll(/class="([^"]*)"/g)) m[1].split(' ').filter(Boolean).forEach(c => out.add(c));
  n.children.forEach(c => classesOfTree(c, out));
  return out;
};
const classesOfHtml = html => new Set([...html.matchAll(/class="([^"]*)"/g)].flatMap(m => m[1].split(' ').filter(Boolean)));
const sorted = s => [...s].sort();

const body = new FakeEl('body');
body.isConnected = true;
const doc = new FakeEl('doc');
Object.assign(doc, {
  body,
  documentElement: { scrollTop: 0 },
  scrollingElement: { scrollTop: 0 },
  createElement: t => new FakeEl(t),
  createTextNode: s => String(s),
  querySelector: sel => body.querySelector(sel),
  querySelectorAll: () => [],
  getElementById: () => null
});
globalThis.Node = FakeNode;
globalThis.document = doc;
const closed = [];
globalThis.quadraCloseSheet = d => (closed.push(d), d.close());

const reset = () => {
  for (const c of body.children) if (c instanceof FakeEl) connect(c, false);
  body.children = [];
  doc.scrollingElement.scrollTop = 0;
};

const cssText = readFileSync(new URL('../kit/quadra.css', import.meta.url), 'utf8');

FakeEl.prototype.focus = () => {};
const type = (input, text) => {
  input.value = text;
  input.dispatch('input');
};

// ---- stakeInput decimals ----
test('stakeInput: decimals defaults to 0, as before', () => {
  reset();
  const seen = [];
  const s = ui.stakeInput({ value: 12.7, presets: [100, 500], onChange: n => seen.push(n) });
  const input = s.querySelector('input');
  assert.equal(input.getAttribute('inputmode'), 'numeric');
  assert.equal(input.getAttribute('value'), '12.7', 'as before: the first value is shown as given');
  type(input, '1a2.5');
  assert.equal(s.value, 125, 'non-digits are dropped, as before');
  s.set(99.9);
  assert.equal(s.value, 99);
  assert.deepEqual(seen.slice(-2), [125, 99]);
});

test('stakeInput: decimals keeps that many places', () => {
  reset();
  const s = ui.stakeInput({ value: 0.123456789, presets: [0.5, 1, 2.25], decimals: 4 });
  const input = s.querySelector('input');
  assert.equal(input.getAttribute('inputmode'), 'decimal');
  assert.equal(s.value, 0.1234, 'the initial value is cut, not rounded');
  assert.equal(input.getAttribute('value'), '0.1234');
  doc.activeElement = input; // (typing: what is typed is not rewritten)
  type(input, '1.23456');
  assert.equal(input.value, '1.2345');
  assert.equal(s.value, 1.2345);
  type(input, '0.');
  assert.equal(input.value, '0.', 'a trailing point stays while typing');
  assert.equal(s.value, 0);
  type(input, '1.2.3x4');
  assert.equal(input.value, '1.234');
  doc.activeElement = null;
  s.set(0.1 + 0.2);
  assert.equal(s.value, 0.3);
  s.set(-5);
  assert.equal(s.value, 0);
  assert.equal(input.value, '0.0000');
});

test('stakeInput: presets respect decimals', () => {
  reset();
  const s = ui.stakeInput({ value: 0, presets: [0.5, 2.25], decimals: 2 });
  const [a, b] = s.querySelector('.q-stake-presets').children;
  assert.equal(b.textContent, '2.25');
  b.dispatch('click');
  assert.equal(s.value, 2.25);
  assert.equal(b.getAttribute('aria-pressed'), 'true');
  assert.equal(a.getAttribute('aria-pressed'), 'false');
  assert.equal(s.querySelector('input').value, '2.25');
  s.set(0.5);
  assert.equal(s.querySelector('input').value, '0.50');
  assert.equal(a.getAttribute('aria-pressed'), 'true');
});

test('stakeInputHtml: decimals, and unchanged without', () => {
  const plain = ui.stakeInputHtml({ value: 500, presets: [100, 500] });
  assert.ok(plain.includes('inputmode="numeric"') && plain.includes('value="500"') && !plain.includes('data-decimals'));
  const fx = ui.stakeInputHtml({ value: 1.5, presets: [1.5, 2], decimals: 2 });
  assert.ok(fx.includes('inputmode="decimal"') && fx.includes('value="1.50"') && fx.includes('data-decimals="2"'));
  assert.ok(fx.includes('aria-pressed="true" data-preset="1.5"'));
});

// ---- logoTile with a list ----
test('logoTile: a list of URLs is tried in order, then the letter', () => {
  const t = ui.logoTile(['a.png', 'b.png'], { fallbackText: '台積電' });
  const img = t.children[0];
  assert.equal(img.getAttribute('src'), 'a.png');
  img.dispatch('error');
  assert.equal(img.getAttribute('src'), 'b.png');
  assert.equal(t.className, 'q-logo');
  img.dispatch('error');
  assert.equal(t.className, 'q-logo text');
  assert.equal(t.textContent, '台');
});

test('logoTile: one string and an empty list behave as before', () => {
  const one = ui.logoTile('a.png', { fallbackText: 'A' });
  one.children[0].dispatch('error');
  assert.equal(one.className, 'q-logo text');
  assert.equal(ui.logoTile('a.png').children[0].listeners.error, undefined, 'no handler without a fallback');
  assert.equal(ui.logoTile([], { fallbackText: 'Z' }).className, 'q-logo text');
  assert.equal(ui.logoTile([], {}).children.length, 0);
  const noFall = ui.logoTile(['a.png', 'b.png']);
  noFall.children[0].dispatch('error');
  noFall.children[0].dispatch('error');
  assert.equal(noFall.className, 'q-logo', 'no fallbackText: the image stays');
});

test('logoTileHtml + wireLogos: the same walk', () => {
  assert.equal(ui.logoTileHtml('a.png', { fallbackText: 'A' }), '<span class="q-logo" style="--s:40px"><img src="a.png" alt="" loading="lazy" decoding="async" data-fallback="A" data-tint=""></span>');
  const html = ui.logoTileHtml(['a.png', 'b&c.png'], { fallbackText: '台', tint: '#123' });
  assert.ok(html.includes('src="a.png"') && html.includes('data-srcs="[&#34;b&#38;c.png&#34;]"'));
  assert.equal(ui.logoTileHtml([], { fallbackText: 'Z' }), ui.logoTileHtml('', { fallbackText: 'Z' }));
  // wireLogos on a fake root
  const root = new FakeEl('div');
  root.querySelectorAll = () => [];
  const tile = new FakeEl('span');
  tile.className = 'q-logo';
  const img = new FakeEl('img');
  img.closest = () => tile;
  img.attrs = { src: 'a.png', 'data-fallback': '台', 'data-tint': '#123', 'data-srcs': '["b.png"]' };
  tile.append(img);
  ui.wireLogos(root);
  const fire = () => root.listeners.error[0]({ target: Object.assign(img, { tagName: 'IMG' }) });
  fire();
  assert.equal(img.getAttribute('src'), 'b.png');
  assert.equal(img.getAttribute('data-srcs'), '[]');
  assert.equal(tile.className, 'q-logo');
  fire();
  assert.equal(tile.className, 'q-logo text');
  assert.equal(tile.style.props['--t'], '#123');
});

// ---- confirm points ----
test('ask(): points as {icon, text}; arrays unchanged', async () => {
  reset();
  const p = quadra.ask({ title: 't', lang: 'en', points: [['★', 'Head', 'line'], { icon: 'star', text: 'Starred', tint: '#f00' }, { icon: '🙂', text: 'Emoji' }] });
  const dialog = body.children.at(-1);
  const ul = dialog.querySelector('ul');
  const [old, ico, emoji] = ul.children;
  assert.equal(old.className, '');
  assert.equal(old.children[0].textContent, '★');
  assert.equal(old.children[1].children[0].textContent, 'Head');
  assert.equal(ico.className, 'q-ask-icon-point');
  assert.ok(ico.children[0].classList.contains('ico'));
  assert.equal(ico.children[0].innerHTML, ui.icons.star);
  assert.equal(ico.children[0].getAttribute('style'), '--t:#f00');
  assert.equal(ico.children[1].textContent, 'Starred');
  assert.equal(emoji.children[0].textContent, '🙂');
  dialog.querySelector('button').dispatch('click');
  await p;
});

// ---- sheetHero ----
test('sheetHero: logo node and status row', () => {
  const lg = new FakeEl('span');
  const live = new FakeEl('span');
  const hero = ui.sheetHero({ big: '1,000', logos: ['x.png'], logo: lg, tags: ['+1%'], status: ['交易中', { text: '漲停', tone: 'up' }] });
  const [logos, , row, status] = hero.children;
  assert.ok(logos.classList.contains('q-sh-logos'));
  assert.equal(logos.children[0], lg, 'the node stands in for the logos list');
  assert.ok(row.classList.contains('q-sh-row') && !row.classList.contains('q-sh-status'));
  assert.ok(status.classList.contains('q-sh-status'));
  assert.equal(status.children.length, 2);
  const asNode = ui.sheetHero({ big: 'x', status: live });
  assert.equal(asNode.find('q-sh-status').children[0], live);
  const old = ui.sheetHero({ big: 'x', logos: ['a'], tags: ['t'] });
  assert.equal(old.find('q-sh-status'), null);
  assert.equal(old.children.length, 3);
});

test('sheetHeroHtml: logoHtml and status; same classes as the DOM one', () => {
  const html = ui.sheetHeroHtml({ big: '1', logoHtml: '<i class="mine"></i>', tags: ['a'], status: ['b', { text: 'c', tone: 'up' }] });
  assert.ok(html.includes('<div class="q-sh-logos"><i class="mine"></i></div>'));
  assert.ok(html.includes('<div class="q-sh-row q-sh-status">'));
  assert.equal((html.match(/q-tag/g) || []).length, 3);
  const dom = ui.sheetHero({ big: '1', logo: new FakeEl('i'), tags: ['a'], status: ['b', { text: 'c', tone: 'up' }] });
  assert.deepEqual(sorted(classesOfTree(dom)).filter(c => c !== 'mine'), sorted(classesOfHtml(html)).filter(c => c !== 'mine'));
  assert.ok(!ui.sheetHeroHtml({ big: '1' }).includes('q-sh-status'));
  assert.ok(ui.sheetHeroHtml({ big: '1', statusHtml: '<b>x</b>' }).includes('q-sh-status"><b>x</b>'));
});

// ---- movePill ----
test('movePill: solid red up, green down, grey flat; zero unsigned', () => {
  const cases = [[1.234, 'up', '+1.23%'], [-0.5, 'down', '−0.50%'], [0, 'flat', '0.00%'], [0.004, 'flat', '0.00%'], [-0.004, 'flat', '0.00%'], [NaN, 'flat', '—'], [null, 'flat', '—']];
  for (const [x, tone, text] of cases) {
    const p = ui.movePill(x);
    assert.equal(p.className, `q-move ${tone} solid`, String(x));
    assert.equal(p.textContent, text, String(x));
    assert.equal(ui.movePillHtml(x), `<span class="q-move ${tone} solid">${text}</span>`);
  }
  assert.equal(ui.movePill(2, { solid: false }).className, 'q-move up');
  assert.equal(ui.movePill(2, { digits: 1 }).textContent, '+2.0%');
  assert.equal(ui.movePill(0.04, { digits: 1 }).className, 'q-move flat solid');
  assert.equal(ui.movePillHtml(-3, { solid: false, digits: 0 }), '<span class="q-move down">−3%</span>');
});

// ---- stockRow ----
test('stockRow: logo, name over sub, spark, price over pill', () => {
  let opened = 0;
  const r = ui.stockRow({ logo: ['a.png'], name: '台積電', sub: '2330', spark: [10, 12, 11, 14], price: 1234.5, changePct: 1.5, onOpen: () => opened++ });
  assert.equal(r.className, 'q-stock');
  assert.equal(r.getAttribute('role'), 'button');
  const [logo, id, spark, px] = r.children;
  assert.ok(logo.classList.contains('q-logo'));
  assert.equal(id.children[0].textContent, '台積電');
  assert.equal(id.children[1].textContent, '2330');
  assert.ok(spark.innerHTML.includes('<svg class="q-spark up"') && spark.innerHTML.includes('<polyline'));
  assert.equal(px.children[0].textContent, '1,234.50');
  assert.equal(px.children[1].className, 'q-move up solid');
  assert.equal(px.children[1].textContent, '+1.50%');
  r.dispatch('click');
  r.dispatch('keydown', { key: 'Enter' });
  assert.equal(opened, 2);
});

test('stockRow: down, flat, missing parts, data, change as a stand-in', () => {
  const down = ui.stockRow({ name: 'A', spark: [3, 2, 1], price: '—', changePct: -2, data: { code: '1101' } });
  assert.equal(down.getAttribute('data-code'), '1101');
  assert.equal(down.getAttribute('role'), null);
  assert.ok(down.children[2].innerHTML.includes('q-spark down'));
  const bare = ui.stockRow({ name: 'B' });
  assert.equal(bare.children.length, 3, 'no spark, no sub');
  assert.equal(bare.children[1].children.length, 1);
  assert.equal(bare.children[2].children[0].textContent, '—');
  assert.equal(bare.children[2].children[1].textContent, '—');
  const one = ui.stockRow({ name: 'C', spark: [5] });
  assert.equal(one.children.length, 3, 'one point is no line');
  const amt = ui.stockRow({ name: 'D', price: 10, change: -0.5 });
  assert.equal(amt.children[2].children[1].className, 'q-move down solid');
  assert.equal(amt.children[2].children[1].textContent, '−0.5');
  const flatSpark = ui.stockRow({ name: 'E', spark: [4, 4, 4] });
  assert.ok(flatSpark.children[1] && flatSpark.children.at(-2).innerHTML.includes('q-spark flat'));
});

test('stockRowHtml: the same structure, escaped, data-open', () => {
  const opts = { logo: 'a.png', name: '<b>x</b>', sub: '2330', spark: [1, 3, 2], price: 99.5, changePct: -1, currency: 'USD' };
  const html = ui.stockRowHtml({ ...opts, open: '2330' });
  assert.ok(html.includes('role="button" tabindex="0" data-open="2330"'));
  assert.ok(html.includes('&#60;b&#62;x') && !html.includes('<b>x</b>'));
  assert.ok(html.includes('q-spark down') && html.includes('99.50'));
  const dom = ui.stockRow({ ...opts, onOpen: () => {} });
  assert.deepEqual(sorted(classesOfTree(dom)), sorted(classesOfHtml(html)));
  const plain = ui.stockRowHtml({ name: 'B', data: { code: 'x"y' } });
  assert.ok(plain.includes('data-code="x&#34;y"') && !plain.includes('role='));
});

test('stockRow inside wireTaps', () => {
  const root = new FakeEl('div');
  root.contains = () => true;
  const seen = [];
  ui.wireTaps(root, { open: v => seen.push(v) });
  const row = new FakeEl('div');
  row.attrs['data-open'] = '2330';
  root.append(row);
  root.dispatch('click', { target: row });
  assert.deepEqual(seen, ['2330']);
});

// ---- CSS ----
test('CSS: Securities parts sits just before Foundations, and defines what the parts use', () => {
  const a = cssText.indexOf('/* ---- Securities parts ----');
  const b = cssText.indexOf('/* ---- Foundations (design review)');
  assert.ok(a > 0 && b > a && cssText.indexOf('/* ---- ', a + 5) === b);
  const sec = cssText.slice(a, b);
  for (const c of ['.q-move.solid', '.q-stock', '.q-stock-id', '.q-stock-spark', '.q-spark.up', '.q-stock-px', '.q-ask-mark.ico', '.q-sh-status']) assert.ok(sec.includes(c), c);
  for (const v of ['--q-up', '--q-down', '--q-flat']) assert.ok(sec.includes(`var(${v})`) && cssText.includes(`${v}:`), v);
  const open = (sec.match(/{/g) || []).length;
  assert.equal(open, (sec.match(/}/g) || []).length, 'balanced');
});
