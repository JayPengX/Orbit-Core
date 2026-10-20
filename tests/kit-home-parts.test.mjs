// Home parts (r4): ring, month calendar, panel grid, league tile.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as ui from '../kit/ui.mjs';

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


// A FakeEl's descendants, for asking what a builder made.
const all = (n, out = []) => (n.children.forEach(c => c instanceof FakeEl && (out.push(c), all(c, out))), out);
const withCls = (n, c) => all(n).filter(x => x.classList.contains(c));
const px = (el, k) => el.style.props[k];

// ---- exports ----
test('every r4 builder is exported (panelGrid also as HTML)', () => {
  for (const name of ['progressRing', 'monthCalendar', 'monthGrid', 'panelGrid', 'panelGridHtml', 'leagueTile']) assert.equal(typeof ui[name], 'function', name);
});

// ---- ring ----
test('progressRing: track, arc as a percent of the path, label centred, clamped', () => {
  const r = ui.progressRing(0.7, { size: 64, stroke: 8, label: '14/20', sub: '今日', tint: '#ff2d55' });
  assert.ok(r.classList.contains('q-ring') && r.classList.contains('tinted'));
  assert.equal(px(r, '--s'), '64px');
  assert.equal(px(r, '--t'), '#ff2d55');
  assert.equal(r.getAttribute('aria-valuenow'), '70');
  assert.match(r.innerHTML, /stroke-dasharray="70 100"/);
  assert.match(r.innerHTML, /r="28"/, 'radius = (size - stroke) / 2');
  assert.equal(withCls(r, 'q-ring-l')[0].textContent, '14/20');
  assert.equal(withCls(r, 'q-ring-s')[0].textContent, '今日');
  assert.match(ui.progressRing(2).innerHTML, /stroke-dasharray="100 100"/);
  assert.doesNotMatch(ui.progressRing(-1).innerHTML, /q-ring-arc/, 'an empty ring draws no arc (no round-cap dot)');
  assert.equal(ui.progressRing(NaN).getAttribute('aria-valuenow'), '0');
  assert.equal(withCls(ui.progressRing(0.456), 'q-ring-l')[0].textContent, '46%', 'the percent is the default label');
});

// ---- calendar ----
test('monthGrid: weekday of the 1st (Sunday = 0) and days, incl. leap years', () => {
  assert.deepEqual(ui.monthGrid(2026, 10), { offset: 4, days: 31 }, 'Oct 1 2026 is a Thursday');
  assert.deepEqual(ui.monthGrid(2026, 2), { offset: 0, days: 28 }, 'Feb 2026 starts on a Sunday');
  assert.deepEqual(ui.monthGrid(2024, 2), { offset: 4, days: 29 }, 'leap Feb 2024');
  assert.deepEqual(ui.monthGrid(2100, 2), { offset: 1, days: 28 }, '2100 is not a leap year');
  assert.deepEqual(ui.monthGrid(2000, 2), { offset: 2, days: 29 }, '2000 is');
  assert.deepEqual(ui.monthGrid(2026, 11), { offset: 0, days: 30 });
  assert.deepEqual(ui.monthGrid(2025, 12), { offset: 1, days: 31 });
  assert.deepEqual(ui.monthGrid(2026, 1), { offset: 4, days: 31 });
});

test('monthCalendar: weekday labels, days, offset of the 1st, marks, today', () => {
  const c = ui.monthCalendar({ year: 2024, month: 2, marks: { '2024-02-03': 'done', '2024-02-04': 'part', '2024-02-29': 'miss' }, today: '2024-02-04', lang: 'zh' });
  assert.deepEqual(withCls(c, 'q-cal-w').map(w => w.textContent), ['日', '一', '二', '三', '四', '五', '六']);
  const days = withCls(c, 'q-cal-d');
  assert.equal(days.length, 29);
  assert.equal(days[0].textContent, '1');
  assert.equal(px(c, '--off'), '4');
  assert.equal(px(days[0], 'grid-column-start'), '5', 'Thursday is the fifth column');
  assert.ok(days[2].classList.contains('m-done') && days[3].classList.contains('m-part') && days[28].classList.contains('m-miss'));
  assert.ok(days[3].classList.contains('today') && days[3].getAttribute('aria-current') === 'date');
  assert.equal(withCls(c, 'today').length, 1);
  assert.equal(days[0].tag, 'span', 'no handler, no button');
  assert.deepEqual(withCls(ui.monthCalendar({ year: 2026, month: 10, lang: 'en' }), 'q-cal-w').map(w => w.textContent), ['S', 'M', 'T', 'W', 'T', 'F', 'S']);
  assert.equal(withCls(ui.monthCalendar({ year: 2026, month: 2, today: new Date(2026, 1, 14) }), 'today')[0].textContent, '14', 'today as a Date');
  assert.equal(withCls(ui.monthCalendar({ year: 2026, month: 3, today: '2026-02-14' }), 'today').length, 0, 'today in another month is not drawn');
});

test('monthCalendar: onPick makes day buttons', () => {
  const got = [];
  const c = ui.monthCalendar({ year: 2026, month: 10, onPick: k => got.push(k), data: { cal: 'w' } });
  const d = withCls(c, 'q-cal-d')[18];
  assert.equal(d.tag, 'button');
  assert.equal(d.getAttribute('data-day'), '2026-10-19');
  assert.equal(d.getAttribute('data-cal'), 'w');
  d.dispatch('click');
  assert.deepEqual(got, ['2026-10-19']);
});

// ---- panels ----
test('panelGrid: label with icon, big, sub; twin matches and escapes', () => {
  const items = [{ label: '體感', big: '27°', sub: '偏熱', icon: 'clock', tint: '#ff9500' }, { label: '<濕度>', big: '80%' }];
  const g = ui.panelGrid(items);
  assert.equal(g.className, 'q-panels');
  const panels = withCls(g, 'q-panel');
  assert.equal(panels.length, 2);
  assert.equal(px(panels[0], '--t'), '#ff9500');
  assert.equal(withCls(panels[0], 'q-panel-v')[0].textContent, '27°');
  assert.equal(withCls(panels[0], 'q-panel-s')[0].textContent, '偏熱');
  assert.equal(withCls(panels[1], 'q-panel-s').length, 0);
  const html = ui.panelGridHtml(items);
  assert.ok(html.includes('&#60;濕度&#62;') && !html.includes('<濕度>'));
  assert.ok(html.includes('<i aria-hidden="true"><svg'), 'an icons key draws its glyph');
  assert.deepEqual(sorted(classesOfHtml(html)), sorted(classesOfTree(g)));
});

// ---- league tile ----
test('leagueTile: 56px logo over the name', () => {
  let opened = 0;
  const t = ui.leagueTile({ logo: 'nba.png', name: 'NBA', sub: '12 場', onOpen: () => opened++ });
  assert.equal(t.tag, 'button');
  assert.equal(t.className, 'q-league');
  const logo = withCls(t, 'q-logo')[0];
  assert.equal(px(logo, '--s'), '56px');
  assert.equal(t.children[1].textContent, 'NBA');
  t.dispatch('click');
  assert.equal(opened, 1);
  const none = withCls(ui.leagueTile({ name: '英超' }), 'q-logo')[0];
  assert.equal(none.className, 'q-logo text', 'no logo: a picture of its kind, never a letter');
  assert.equal(none.textContent, '');
  assert.match(none.innerHTML, /<svg/);
});

// ---- CSS ----
test('CSS: Home parts (r4) sits just before Foundations and styles what the parts make', () => {
  const a = rawCss.indexOf('/* ---- Home parts (r4)');
  const b = rawCss.indexOf('/* ---- Foundations (design review)');
  assert.ok(a > 0 && b > a && rawCss.indexOf('/* ---- ', a + 5) === b);
  const sec = rawCss.slice(a, b);
  for (const c of ['.q-ring', '.q-ring-track', '.q-ring-arc', '.q-ring-l', '.q-cal', '.q-cal-w', '.q-cal-d', '.q-cal-d.m-done', '.q-cal-d.m-part', '.q-cal-d.today', '.q-panels', '.q-panel', '.q-panel-v', '.q-league']) assert.ok(sec.includes(`${c} {`) || sec.includes(`${c},`), c);
  assert.equal((sec.match(/{/g) || []).length, (sec.match(/}/g) || []).length, 'balanced braces');
  assert.ok(sec.includes('prefers-reduced-motion'));
  assert.ok(!/#[0-9a-f]{3,8}\b/i.test(sec.replace(/#fff(fff)?\b|#000\b/gi, '')), 'colours are tokens (white aside)');
  assert.ok(sec.includes('min-height: 44px'));
});

// ---- additions: panel tiles, trailing calendar, done ring ----
test('panelGrid: unit, level, art, data, onOpen (and the twin: open, art as HTML)', () => {
  let opened = 0;
  const art = new FakeEl('svg');
  const items = [{ label: '雨量', big: '12', unit: 'mm', level: { text: '偏多', tone: 'up' }, art, data: { k: 'rain' }, onOpen: () => opened++ }, { label: 'UV', big: '3', level: '低', art: '<svg class="spk"></svg>' }, { label: '平', big: '1' }];
  const g = ui.panelGrid(items);
  const [a, b, c] = withCls(g, 'q-panel');
  assert.equal(withCls(a, 'q-panel-v')[0].textContent, '12mm');
  assert.equal(withCls(a, 'q-panel-u')[0].tag, 'small');
  assert.equal(withCls(a, 'q-panel-lv')[0].className, 'q-panel-lv up');
  assert.equal(withCls(b, 'q-panel-lv')[0].className, 'q-panel-lv');
  assert.equal(a.getAttribute('data-k'), 'rain');
  assert.equal(a.getAttribute('role'), 'button');
  assert.equal(a.getAttribute('tabindex'), '0');
  a.dispatch('click');
  a.dispatch('keydown', { key: 'Enter' });
  const sp = a.dispatch('keydown', { key: ' ' });
  assert.equal(opened, 3);
  assert.equal(sp.defaultPrevented, true, 'Space does not scroll');
  assert.equal(withCls(a, 'q-panel-art')[0].children[0], art);
  assert.ok(withCls(b, 'q-panel-art')[0].innerHTML.includes('spk'));
  assert.equal(c.getAttribute('role'), null);
  assert.equal(withCls(c, 'q-panel-row').length + withCls(c, 'q-panel-lv').length, 0, 'a plain tile is as before');
  const html = ui.panelGridHtml([{ ...items[0], art: '<i class="x"></i>', open: 'rain' }, items[1], { label: '<x>', big: '1', unit: '<u>', level: '<l>' }]);
  assert.ok(html.includes('role="button" tabindex="0" data-open="rain" data-k="rain"'));
  assert.ok(html.includes('<small class="q-panel-u">mm</small>') && html.includes('<i class="x"></i>') && html.includes('q-panel-lv up'));
  assert.ok(html.includes('&#60;u&#62;') && html.includes('&#60;l&#62;') && !html.includes('<u>'));
  const twinDom = ui.panelGrid([{ ...items[0], art: '<i class="x"></i>' }, items[1], { label: '<x>', big: '1', unit: '<u>', level: '<l>' }]);
  assert.deepEqual(sorted(classesOfHtml(html)), sorted(classesOfTree(twinDom)));
});

test('monthCalendar: last N days ending today, Sunday-first rows, blanks, marks, pick', () => {
  const opts = { last: 35, today: '2026-10-19', lang: 'en', marks: { '2026-10-19': 'done', '2026-09-15': 'part' } };
  const c = ui.monthCalendar(opts);
  const days = withCls(c, 'q-cal-d');
  assert.equal(days.length, 35);
  assert.equal(days[0].getAttribute('data-day') ?? days[0].getAttribute('aria-label').split(' ')[0], '2026-09-15');
  assert.equal(px(c, '--off'), '2', '2026-09-15 is a Tuesday');
  assert.equal(px(days[0], 'grid-column-start'), '3');
  assert.equal(days.at(-1).textContent, '19');
  assert.ok(days.at(-1).classList.contains('today') && days.at(-1).classList.contains('m-done'));
  assert.ok(days[0].classList.contains('m-part'));
  assert.equal(days[16].textContent, '1', 'rolls over the month');
  assert.equal(withCls(c, 'q-cal-w').length, 7, 'weekday header kept');
  const picked = [];
  const pc = ui.monthCalendar({ ...opts, onPick: k => picked.push(k) });
  withCls(pc, 'q-cal-d')[34].dispatch('click');
  assert.deepEqual(picked, ['2026-10-19']);
  assert.equal(withCls(ui.monthCalendar({ last: 1, today: '2026-03-01' }), 'q-cal-d').length, 1);
});

test('progressRing: done fills the ring and centres a check instead of the label', () => {
  const r = ui.progressRing(0.2, { done: true, label: '20%', size: 48 });
  assert.ok(r.classList.contains('done'));
  assert.equal(r.getAttribute('aria-valuenow'), '100');
  assert.match(r.innerHTML, /stroke-dasharray="100 100"/);
  assert.equal(withCls(r, 'q-ring-l').length, 0);
  assert.ok(withCls(r, 'q-ring-check')[0].innerHTML.includes('<svg'));
  assert.equal(withCls(ui.progressRing(1), 'q-ring-check').length, 0, 'value 1 alone is as before');
  assert.equal(withCls(ui.progressRing(1, { doneCheck: true }), 'q-ring-check').length, 1);
  assert.equal(withCls(ui.progressRing(0.9, { doneCheck: true }), 'q-ring-check').length, 0);
});

test('CSS: panel parts, ring check, sheet subtitle', () => {
  for (const sel of ['.q-panel-u', '.q-panel-lv', '.q-panel-art', '.q-ring-check', '.q-sheet-sub']) assert.ok(css.includes(sel), sel);
});
