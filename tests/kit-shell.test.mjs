// The shell pieces (design review): one sheet (detents, foot, one way to close),
// empty(), navTitle, pull to refresh, topActions without help/refresh buttons
// on a phone, and the HTML-string twins (escaping, and the same classes).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as ui from '../kit/ui.mjs';
import * as quadra from '../kit/quadra.mjs';

const rawCss = readFileSync(new URL('../kit/quadra.css', import.meta.url), 'utf8');
const css = rawCss.replace(/\/\*[\s\S]*?\*\//g, '');

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

// ---- exports ----
test('every new export exists', () => {
  for (const name of ['bindSheet', 'setSheetDetent', 'navTitle', 'bindNavTitle', 'pullToRefresh', 'rubber', 'escHtml', 'wireLogos', 'wireNavTitles', 'heroCardHtml']) assert.equal(typeof ui[name], 'function', name);
  for (const name of ['tile', 'tag', 'empty', 'stats', 'section', 'sectionHead', 'logoTile', 'sheetHero', 'placeTile', 'navTitle']) {
    assert.equal(typeof ui[`${name}Html`], 'function', `${name}Html`);
  }
  assert.equal(typeof quadra.sheetVerdict, 'function');
});

// ---- the sheet ----
test('sheet(): title centred, lead, a ✕ by default, a trailing node instead of it', () => {
  reset();
  const lead = new FakeEl('button');
  const s = ui.sheet({ title: '賽事', body: [new FakeEl('p'), null], lead });
  assert.equal(s.el.className, 'q-sheet');
  assert.equal(s.el.getAttribute('aria-label'), '賽事');
  assert.equal(s.el.open, true);
  assert.equal(s.head.children[0], lead);
  assert.equal(s.head.children[1].tag, 'h2');
  assert.ok(s.head.children[2].classList.contains('q-close'));
  assert.equal(s.head.children[2].hasAttribute('data-q-close'), true);
  const done = new FakeEl('button');
  const t = ui.sheet({ title: 'x', trailing: done });
  assert.equal(t.head.children[2], done, 'the trailing node replaces the ✕');
  assert.equal(t.head.find('q-close'), null);
});

test('sheet(): detent and foot', () => {
  reset();
  const foot = ui.sheetFoot({ button: { label: '確認' } });
  const s = ui.sheet({ title: 'x', detent: 'medium', foot, body: [new FakeEl('p')] });
  assert.equal(s.el.getAttribute('data-detent'), 'medium');
  assert.equal(s.el.hasAttribute('data-expandable'), true, 'a medium sheet can be dragged to large');
  assert.ok(s.el.classList.contains('q-has-foot'));
  assert.equal(s.el.children.at(-1), foot, 'the foot is last');
  s.setDetent('large');
  assert.equal(s.el.getAttribute('data-detent'), 'large');
  s.setDetent('huge');
  assert.equal(s.el.getAttribute('data-detent'), 'large', 'only the two detents');
  const l = ui.sheet({ title: 'y', detent: 'large' });
  assert.equal(l.el.hasAttribute('data-expandable'), false);
  assert.equal(ui.sheet({ title: 'z' }).el.hasAttribute('data-detent'), false);
  assert.equal(ui.sheet({ title: 'z' }).el.classList.contains('q-has-foot'), false);
});

test('sheet(): the ✕, Escape and a tap on the backdrop close it the same way, and onClose fires once', () => {
  for (const how of ['x', 'escape', 'backdrop']) {
    reset();
    closed.length = 0;
    let fired = 0;
    const s = ui.sheet({ title: 't', onClose: () => fired++ });
    const d = s.el;
    if (how === 'x') d.dispatch('click', { target: Object.assign(new FakeEl('button'), { parentElement: d, attrs: { 'data-q-close': '' } }) });
    if (how === 'escape') {
      const e = d.dispatch('cancel');
      assert.equal(e.defaultPrevented, true, 'the browser does not drop it at once');
    }
    if (how === 'backdrop') {
      d.dispatch('click', { clientX: 10, clientY: 20 });
    }
    assert.deepEqual(closed, [d], `${how} slides it away (quadraCloseSheet)`);
    assert.equal(fired, 1, `${how}: onClose once`);
    assert.equal(d.isConnected, false, 'removed');
    s.close();
    d.dispatch('close');
    assert.equal(fired, 1, 'and not again');
  }
  // A tap inside the sheet's own box (on the dialog element itself) isn't a backdrop tap.
  reset();
  closed.length = 0;
  const s = ui.sheet({ title: 't' });
  s.el.dispatch('click', { clientX: 10, clientY: 300 });
  assert.equal(closed.length, 0);
});

test('sheetVerdict: close, expand, shrink, settle', () => {
  const v = quadra.sheetVerdict;
  assert.equal(v({ dy: 150, raw: 150 }), 'close');
  assert.equal(v({ dy: 40, raw: 40, speed: 0.8 }), 'close', 'a flick');
  assert.equal(v({ dy: 30, raw: 30 }), 'settle');
  assert.equal(v({ dy: -20, raw: -100, detent: 'medium', expandable: true }), 'expand');
  assert.equal(v({ dy: -5, raw: -10, speed: -0.6, detent: 'medium', expandable: true }), 'expand', 'an upward flick');
  assert.equal(v({ dy: -20, raw: -100, detent: 'large', expandable: true }), 'settle', 'a large one has nowhere to grow');
  assert.equal(v({ dy: -20, raw: -100 }), 'settle', 'an ordinary sheet only gives');
  assert.equal(v({ dy: 150, raw: 150, detent: 'large', expandable: true }), 'shrink');
  assert.equal(v({ dy: 150, raw: 150, speed: 1.5, detent: 'large', expandable: true }), 'close', 'a hard flick still closes');
  assert.equal(v({ dy: 150, raw: 150, detent: 'medium', expandable: true }), 'close', 'medium closes');
  assert.equal(v({ dy: 150, raw: 150, detent: 'large' }), 'close', 'a sheet opened large closes');
});

test('there is one sheet: the Pass is built by it', () => {
  const q = readFileSync(new URL('../kit/quadra.mjs', import.meta.url), 'utf8');
  const p = readFileSync(new URL('../kit/pass.mjs', import.meta.url), 'utf8');
  assert.match(p, /= sheet\(\{/);
  for (const [name, src] of [['quadra.mjs', q], ['pass.mjs', p]]) assert.doesNotMatch(src, /(?:node|el)\('dialog', \{ class: '(?:q-sheet|`q-sheet)/, `${name} draws no private sheet`);
});

// ---- empty ----
test('empty(): an accent tile, one line, one button; an emoji and a node action still work', () => {
  const e = ui.empty({ icon: 'ticket', title: '沒有票', body: '去買', action: { label: '去看看', onTap() {} } });
  assert.equal(e.find('q-empty-tile').style.props['--t'], 'var(--q-accent)', 'the accent unless given');
  assert.equal(e.find('q-btn').tag, 'button');
  assert.equal(e.find('q-btn').textContent, '去看看');
  assert.equal(ui.empty({ icon: 'ticket', tint: 'green', title: 't' }).find('q-empty-tile').style.props['--t'], 'green');
  const link = ui.empty({ title: 't', action: { label: 'go', href: '#x' } }).find('q-btn');
  assert.equal(link.tag, 'a');
  assert.equal(link.getAttribute('href'), '#x');
  assert.equal(ui.empty({ title: 't', action: { label: 'go', data: { tab: 'ipo' } } }).find('q-btn').getAttribute('data-tab'), 'ipo');
  assert.equal(ui.empty({ icon: '🎫', title: 't' }).find('q-empty-icon').textContent, '🎫');
  const mine = new FakeEl('button');
  assert.equal(ui.empty({ title: 't', action: mine }).children.at(-1), mine);
});

// ---- data-* on actionGrid / sectionHead ----
test('actionGrid and sectionHead take data-* attributes, in both forms', () => {
  const grid = ui.actionGrid([{ icon: 'live', label: '場中', data: { tab: 'ipo', n: 3 } }, { icon: 'ticket', label: '彩券', data: { tab: null } }]);
  assert.equal(grid.children[0].getAttribute('data-tab'), 'ipo');
  assert.equal(grid.children[0].getAttribute('data-n'), '3');
  assert.equal(grid.children[1].hasAttribute('data-tab'), false);
  const head = ui.sectionHead('t', { more: '全部', data: { tab: 'all' } });
  assert.equal(head.find('q-sh-more').getAttribute('data-tab'), 'all');
  assert.match(ui.sectionHeadHtml('t', { more: '全部', data: { tab: 'all' } }), /class="q-sh-more" type="button" data-tab="all"/);
  assert.match(ui.sectionHeadHtml('t', { more: '全部', moreHref: '#a', data: { tab: 'all' } }), /<a class="q-sh-more" href="#a" data-tab="all">/);
  assert.match(ui.emptyHtml({ title: 't', action: { label: 'go', href: '#x' } }), /<a class="q-btn primary" href="#x">go<\/a>/);
  assert.match(ui.emptyHtml({ title: 't', action: { label: 'go', data: { tab: 'ipo' } } }), /<button class="q-btn primary" type="button" data-tab="ipo">go<\/button>/);
});

// ---- navTitle ----
class FakeIO {
  static all = [];
  constructor(cb, opts) {
    this.cb = cb;
    this.opts = opts;
    this.off = false;
    FakeIO.all.push(this);
  }
  observe() {}
  disconnect() {
    this.off = true;
  }
}
class FakeMO {
  static all = [];
  constructor(cb) {
    this.cb = cb;
    FakeMO.all.push(this);
  }
  observe() {}
  disconnect() {}
}
test('navTitle: a large title; scrolled under the bar a small one shows there; hidden or back, it goes', () => {
  reset();
  globalThis.IntersectionObserver = FakeIO;
  globalThis.MutationObserver = FakeMO;
  FakeIO.all.length = 0;
  const h1 = ui.navTitle('賽程');
  assert.equal(h1.tag, 'h1');
  assert.ok(h1.classList.contains('q-nav-title'));
  const io = FakeIO.all.at(-1);
  assert.match(io.opts.rootMargin, /^-\d+px 0px 0px 0px$/);
  const bar = () => body.querySelector('.q-navbar');
  assert.ok(bar(), 'the bar exists');
  assert.equal(bar().classList.contains('on'), false);
  const entry = (over = {}) => [{ isIntersecting: false, boundingClientRect: { top: -60, bottom: -20, height: 40 }, rootBounds: { top: 0 }, ...over }];
  io.cb(entry());
  assert.equal(bar().classList.contains('on'), true, 'scrolled under the bar');
  assert.equal(bar().textContent, '賽程');
  h1.setTitle('比賽');
  assert.equal(bar().textContent, '比賽');
  io.cb(entry({ isIntersecting: true }));
  assert.equal(bar().classList.contains('on'), false, 'back in view');
  io.cb(entry());
  io.cb(entry({ boundingClientRect: { top: 0, bottom: 0, height: 0 } }));
  assert.equal(bar().classList.contains('on'), false, 'a hidden tab has no box: not collapsed');
  io.cb(entry({ boundingClientRect: { top: 900, bottom: 940, height: 40 } }));
  assert.equal(bar().classList.contains('on'), false, 'below the fold is not collapsed');
});

test('navTitle: leaves the bar and the observers when its element leaves the page', () => {
  reset();
  FakeIO.all.length = 0;
  const h1 = ui.navTitle('A');
  body.append(h1);
  const io = FakeIO.all.at(-1);
  const mo = FakeMO.all[0];
  mo.cb();
  io.cb([{ isIntersecting: false, boundingClientRect: { top: -60, bottom: -20, height: 40 }, rootBounds: { top: 0 } }]);
  assert.equal(body.querySelector('.q-navbar').classList.contains('on'), true);
  h1.remove();
  mo.cb();
  assert.equal(io.off, true, 'observer disconnected');
  assert.equal(body.querySelector('.q-navbar').classList.contains('on'), false, 'the bar let go');
});

test('navTitle: another tab\'s title takes over, the first can not turn it off', () => {
  reset();
  FakeIO.all.length = 0;
  ui.navTitle('A');
  ui.navTitle('B');
  const [a, b] = FakeIO.all.slice(-2);
  const gone = [{ isIntersecting: false, boundingClientRect: { top: -60, bottom: -20, height: 40 }, rootBounds: { top: 0 } }];
  a.cb(gone);
  b.cb(gone);
  const bar = body.querySelector('.q-navbar');
  assert.equal(bar.textContent, 'B');
  a.cb([{ isIntersecting: true, boundingClientRect: { top: 10, bottom: 50, height: 40 }, rootBounds: { top: 0 } }]);
  assert.equal(bar.classList.contains('on'), true, 'A is not the owner');
});

// ---- pull to refresh ----
const ptr = () => body.children.filter(c => c instanceof FakeEl && c.classList.contains('q-ptr')).at(-1);
const touch = (type, x, y, target = body) => ({ touches: [{ clientX: x, clientY: y }], target });
const withTouchRoot = () => {
  reset();
  const root = doc;
  return root;
};
test('rubber(): 1:1 at first, never past the max', () => {
  assert.equal(ui.rubber(-5), 0);
  assert.ok(Math.abs(ui.rubber(1) - 1) < 0.02);
  assert.ok(ui.rubber(70) < 70 && ui.rubber(70) > 40);
  assert.ok(ui.rubber(10_000) <= 90);
});

test('pull to refresh: past the threshold it ticks once and refreshes on release; short of it, nothing', async () => {
  const root = withTouchRoot();
  let ticks = 0;
  globalThis.quadraHaptic = () => ticks++;
  let calls = 0;
  let release;
  const stop = ui.pullToRefresh(() => (calls++, new Promise(r => (release = r))));
  // Short of the threshold.
  root.dispatch('touchstart', touch('touchstart', 100, 100));
  let e = root.dispatch('touchmove', touch('touchmove', 100, 150));
  assert.equal(e.defaultPrevented, true, 'the page does not scroll under the pull');
  assert.ok(ptr(), 'a spinner follows the finger');
  root.dispatch('touchend');
  assert.equal(calls, 0);
  assert.equal(ticks, 0);
  // Past it.
  root.dispatch('touchstart', touch('touchstart', 100, 100));
  root.dispatch('touchmove', touch('touchmove', 100, 140));
  root.dispatch('touchmove', touch('touchmove', 100, 200));
  root.dispatch('touchmove', touch('touchmove', 100, 230));
  assert.equal(ticks, 1, 'one tick as it passes the threshold');
  assert.ok(ptr().classList.contains('armed'));
  root.dispatch('touchend');
  assert.equal(calls, 1);
  assert.ok(ptr().classList.contains('hold'), 'it turns while the refresh runs');
  // A second pull while one runs is ignored.
  root.dispatch('touchstart', touch('touchstart', 100, 100));
  root.dispatch('touchmove', touch('touchmove', 100, 300));
  root.dispatch('touchend');
  assert.equal(calls, 1);
  release();
  await new Promise(r => setTimeout(r, 750));
  assert.equal(ptr()?.classList.contains('hold') ?? false, false, 'let go of when it settles');
  // Again, now that it is done.
  root.dispatch('touchstart', touch('touchstart', 100, 100));
  root.dispatch('touchmove', touch('touchmove', 100, 190));
  root.dispatch('touchend');
  assert.equal(calls, 2);
  stop();
  assert.equal((root.listeners.touchstart || []).length, 0, 'stop() unhooks');
  delete globalThis.quadraHaptic;
});

test('pull to refresh: not from a scrolled page, a sheet, a sideways list, sideways, up, or while disabled', () => {
  let calls = 0;
  let off = false;
  const stop = ui.pullToRefresh(() => calls++, { disabled: () => off });
  const pull = (target = body, dx = 0) => {
    doc.dispatch('touchstart', touch('touchstart', 100, 100, target));
    doc.dispatch('touchmove', touch('touchmove', 100 + dx, 120, target));
    doc.dispatch('touchmove', touch('touchmove', 100 + dx, 260, target));
    doc.dispatch('touchend');
  };
  reset();
  doc.scrollingElement.scrollTop = 40;
  pull();
  assert.equal(calls, 0, 'the page is scrolled');
  reset();
  const dlg = new FakeEl('dialog');
  dlg.open = true;
  body.append(dlg);
  pull();
  assert.equal(calls, 0, 'a sheet is open');
  reset();
  const chips = new FakeEl('div');
  chips.classList.add('q-chips');
  body.append(chips);
  pull(chips);
  assert.equal(calls, 0, 'a sideways list');
  reset();
  off = true;
  pull();
  assert.equal(calls, 0, 'a load is running');
  off = false;
  doc.dispatch('touchstart', touch('touchstart', 100, 100));
  doc.dispatch('touchmove', touch('touchmove', 200, 110));
  doc.dispatch('touchmove', touch('touchmove', 300, 250));
  doc.dispatch('touchend');
  assert.equal(calls, 0, 'sideways');
  doc.dispatch('touchstart', touch('touchstart', 100, 100));
  doc.dispatch('touchmove', touch('touchmove', 100, 80));
  doc.dispatch('touchmove', touch('touchmove', 100, 300));
  doc.dispatch('touchend');
  assert.equal(calls, 0, 'up first');
  stop();
});

// ---- topActions ----
const session = () => ({ lang: 'zh', app: 'stock', wallet: null, on() {} });
const bar = () => ({ classList: { add() {} }, kids: [], replaceChildren(...x) { this.kids = x; } });
const ids = into => into.kids.map(k => k.attrs?.id || k.className);
test('topActions on a phone: no help button, no refresh button, pull to refresh instead', () => {
  reset();
  globalThis.matchMedia = q => ({ matches: /coarse/.test(q) });
  let calls = 0;
  const into = bar();
  const r = quadra.topActions(session(), { refresh: () => calls++, into });
  assert.deepEqual(ids(into), ['q-account'], 'only the account');
  assert.equal(r.help, null);
  assert.equal(r.refresh.hidden, true, 'a real button, kept hidden (apps look up #refresh)');
  r.refresh.disabled = true; // an app that sets it while loading holds the pull off
  doc.dispatch('touchstart', touch('touchstart', 100, 100));
  doc.dispatch('touchmove', touch('touchmove', 100, 130));
  doc.dispatch('touchmove', touch('touchmove', 100, 260));
  doc.dispatch('touchend');
  assert.equal(calls, 0);
  // The page is pulled: the app's refresh runs.
  r.refresh.disabled = false;
  doc.dispatch('touchstart', touch('touchstart', 100, 100));
  doc.dispatch('touchmove', touch('touchmove', 100, 130));
  doc.dispatch('touchmove', touch('touchmove', 100, 260));
  doc.dispatch('touchend');
  assert.equal(calls, 1);
  // Called again (the app redraws its bar): one listener, not two.
  quadra.topActions(session(), { refresh: () => calls++, into: bar() });
  assert.equal(doc.listeners.touchstart.length, 1);
  delete globalThis.matchMedia;
});

test('topActions on a computer keeps the refresh button; an app help() keeps its 說明 button', () => {
  reset();
  globalThis.matchMedia = q => ({ matches: false });
  const into = bar();
  const r = quadra.topActions(session(), { refresh() {}, into });
  assert.deepEqual(ids(into), ['refresh', 'q-account']);
  assert.ok(r.refresh.classList.contains('q-refresh'));
  const own = bar();
  quadra.topActions(session(), { help() {}, into: own });
  assert.deepEqual(ids(own), ['help-button', 'q-account']);
  const plain = bar();
  quadra.topActions(session(), { into: plain });
  assert.deepEqual(ids(plain), ['q-account'], 'the Pass sheet has the guide');
  delete globalThis.matchMedia;
});

test('the Pass sheet has a 說明 tab for every app', async () => {
  const help = await import('../kit/help.mjs');
  const src = readFileSync(new URL('../kit/pass.mjs', import.meta.url), 'utf8');
  assert.match(src, /const TABS = \[[^\]]*'help'\]/);
  // (An app without a guide of its own opens the Pass's general one: renderHelp falls back to 'pass'.)
  assert.match(src, /const at = HELP_ORDER\.includes\(app\) \? app : 'pass'/);
  assert.ok(help.HELP_ORDER.includes('pass'));
  for (const id of ['stock', 'odds', 'vocab', 'orbit', 'weather', 'transit', 'beats']) assert.ok(help.HELP_ORDER.includes(id) && quadra.APPS[id], `${id} has a guide`);
});

// ---- the stylesheet ----
test('the stylesheet: a chosen chip is accent on a 14% wash, the shell section is not last', () => {
  const chosen = css.match(/\.q-chip:is\(\[aria-pressed='true'\][^{]*\{([^}]*)\}/)[1];
  assert.match(chosen, /color-mix\(in srgb, var\(--q-accent\) 14%, transparent\)/);
  assert.match(chosen, /color:\s*var\(--q-accent\)/);
  assert.doesNotMatch(chosen, /--q-label/);
  assert.match(css, /\.q-pass-tabs \.q-chip\[aria-selected='true'\] \{ background: var\(--accent-wash\)/);
  for (const c of ['q-has-foot', 'q-navbar', 'q-navbar-title', 'q-nav-title', 'q-ptr']) assert.match(css, new RegExp(`\\.${c}(?![\\w-])`), `.${c}`);
  assert.match(css, /\.q-sheet\[data-detent='medium'\]/);
  assert.match(css, /\.q-sheet\[data-detent='large'\]/);
  const at = rawCss.indexOf('Shell (design review)');
  assert.ok(at > 0 && rawCss.indexOf('/* ====', at + 10) === -1 && at < rawCss.length - 800, 'the section sits inside the last one, before its end');
  const mine = rawCss.slice(at, rawCss.indexOf("/* -- Saved places' tiles"));
  assert.doesNotMatch(mine, /#[0-9a-fA-F]{3,8}\b/, 'no hex colours');
  assert.match(mine, /prefers-reduced-motion/);
});

// ---- HTML twins ----
const evil = `<u>"x"</u>&'`;
const noRaw = (out, what) => {
  assert.doesNotMatch(out, /<u>/, `${what}: no raw tag`);
  assert.doesNotMatch(out, /"x"/, `${what}: no raw quote`);
  assert.match(out, /&#60;u&#62;/, `${what}: the text is there, escaped`);
};
test('escHtml and the twins escape every text', () => {
  assert.equal(ui.escHtml(`<a href="x">&'`), '&#60;a href=&#34;x&#34;&#62;&#38;&#39;');
  assert.equal(ui.escHtml(null), '');
  noRaw(ui.emptyHtml({ icon: '🎫', title: evil, body: evil, action: { label: evil, tap: evil } }), 'emptyHtml');
  noRaw(ui.tileHtml(evil), 'tileHtml');
  noRaw(ui.tagHtml(evil, evil), 'tagHtml');
  noRaw(ui.navTitleHtml(evil), 'navTitleHtml');
  noRaw(ui.heroCardHtml({ eyebrow: evil, title: evil, big: evil, sub: evil, pill: evil, tap: evil, actions: [{ label: evil, tap: evil }] }), 'heroCardHtml');
  noRaw(ui.statsHtml([{ label: evil, value: evil, href: evil }]), 'statsHtml');
  noRaw(ui.sectionHtml(evil, '', { more: evil, moreHref: evil }), 'sectionHtml');
  noRaw(ui.sectionHeadHtml(evil, { more: evil, count: evil, data: { a: evil } }), 'sectionHeadHtml');
  noRaw(ui.logoTileHtml(evil, { alt: evil, fallbackText: evil }), 'logoTileHtml');
  noRaw(ui.logoTileHtml('', { alt: '<u>"x"</u>' }) + ui.escHtml('<u>"x"</u>'), 'logoTileHtml letter');
  noRaw(ui.sheetHeroHtml({ eyebrow: evil, big: evil, sub: evil, tags: [evil] }), 'sheetHeroHtml');
});

test('a colour or length can not end its style declaration', () => {
  const out = ui.tileHtml('x', 'red;position:fixed;background:url("//e")');
  assert.doesNotMatch(out, /;position/);
  assert.doesNotMatch(out, /"\/\/e/);
  assert.doesNotMatch(ui.logoTileHtml('a.png', { size: '40px;x:y' }), /;x:y/);
});

test('data attributes: names are cleaned, values escaped', () => {
  const out = ui.sectionHeadHtml('t', { more: 'm', data: { 'a b"c': 'v"w' } });
  assert.match(out, / data-abc="v&#34;w"/);
});

test('twins carry the DOM builders\' classes', () => {
  const cases = [
    ['tile', () => ui.tile('<svg></svg>', 'red', 'sm'), () => ui.tileHtml('<svg></svg>', 'red', 'sm')],
    ['tag', () => ui.tag('直播', 'red'), () => ui.tagHtml('直播', 'red')],
    ['tag tint', () => ui.tag('3', '', '#abc'), () => ui.tagHtml('3', '', '#abc')],
    ['empty tile', () => ui.empty({ icon: 'ticket', title: 't', body: 'b', action: { label: 'go', onTap() {} } }), () => ui.emptyHtml({ icon: 'ticket', title: 't', body: 'b', action: { label: 'go', tap: 1 } })],
    ['empty emoji', () => ui.empty({ icon: '🎫', title: 't' }), () => ui.emptyHtml({ icon: '🎫', title: 't' })],
    ['empty link', () => ui.empty({ title: 't', action: { label: 'go', href: '#' } }), () => ui.emptyHtml({ title: 't', action: { label: 'go', href: '#' } })],
    ['stats', () => ui.stats([{ label: 'l', value: 'v', icon: 'x', tint: true, href: '#' }]), () => ui.statsHtml([{ label: 'l', value: 'v', icon: 'x', tint: true, href: '#' }])],
    ['section', () => ui.section('t', [], { more: 'm', onMore() {} }), () => ui.sectionHtml('t', '', { more: 'm', moreTap: 1 })],
    ['sectionHead', () => ui.sectionHead('t', { more: 'm', count: 3, onMore() {} }), () => ui.sectionHeadHtml('t', { more: 'm', count: 3, moreTap: 1 })],
    ['logo img', () => ui.logoTile('a.png', { size: 32 }), () => ui.logoTileHtml('a.png', { size: 32 })],
    ['logo text', () => ui.logoTile('', { fallbackText: '蒙札' }), () => ui.logoTileHtml('', { fallbackText: '蒙札' })],
    ['sheetHero', () => ui.sheetHero({ eyebrow: 'e', big: 'b', sub: 's', logos: ['a.png'], tags: ['t'] }), () => ui.sheetHeroHtml({ eyebrow: 'e', big: 'b', sub: 's', logos: ['a.png'], tags: ['t'] })],
    ['placeTile', () => ui.placeTile('work', 'sm'), () => ui.placeTileHtml('work', 'sm')]
  ];
  for (const [name, dom, html] of cases) assert.deepEqual(sorted(classesOfHtml(html())), sorted(classesOfTree(dom())), name);
});

test('the twins mirror the DOM builders\' text and flags', () => {
  assert.match(ui.logoTileHtml('a.png', { fallbackText: 'AB', tint: 'red' }), /data-fallback="team" data-tint="red"/);
  assert.match(ui.logoTileHtml('a.png', { kind: 'person' }), /data-fallback="person"/);
  assert.match(ui.logoTileHtml('', { fallbackText: '蒙札', tint: 'red', size: 24 }), /class="q-logo text" role="img" aria-label="蒙札" style="--s:24px;--t:red"><svg/);
});

test('sheet(): a subtitle under the title, before the ✕; none by default', () => {
  reset();
  const s = ui.sheet({ title: 'T', subtitle: '2330 · 台股' });
  assert.equal(s.head.children[1].tag, 'h2');
  assert.equal(s.head.children[2].className, 'q-sheet-sub');
  assert.equal(s.head.children[2].textContent, '2330 · 台股');
  assert.ok(s.head.children[3].classList.contains('q-close'), 'the ✕ stays last');
  assert.equal(ui.sheet({ title: 'T' }).head.children.length, 3);
});

test('navTitle: a collapsed title hidden with its tab lets the bar go (no intersection change comes), and asks again when shown', () => {
  reset();
  globalThis.IntersectionObserver = FakeIO;
  globalThis.MutationObserver = FakeMO;
  const ros = [];
  globalThis.ResizeObserver = class {
    constructor(cb) {
      this.cb = cb;
      ros.push(this);
    }
    observe() {}
    disconnect() {}
  };
  try {
    FakeIO.all.length = 0;
    const h1 = ui.navTitle('彩券');
    let shown = true;
    h1.getClientRects = () => (shown ? [{}] : []);
    const bar = () => body.querySelector('.q-navbar');
    FakeIO.all.at(-1).cb([{ isIntersecting: false, boundingClientRect: { top: -60, bottom: -20, height: 40 }, rootBounds: { top: 0 } }]);
    assert.equal(bar().classList.contains('on'), true, 'collapsed into the bar');
    shown = false;
    ros[0].cb();
    assert.equal(bar().classList.contains('on'), false, 'its tab hidden: the bar no longer says 彩券');
    const before = FakeIO.all.length;
    shown = true;
    ros[0].cb();
    assert.equal(FakeIO.all.length, before + 1, 'shown again: watched afresh');
  } finally {
    delete globalThis.ResizeObserver;
  }
});
