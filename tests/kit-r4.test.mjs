// Home parts (r4): ring, pass stack, day timeline, month calendar, panel grid, league tile, and their twins.
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

const reset = () => {
  for (const c of body.children) if (c instanceof FakeEl) connect(c, false);
  body.children = [];
  doc.scrollingElement.scrollTop = 0;
};


// A FakeEl's descendants, for asking what a builder made.
const all = (n, out = []) => (n.children.forEach(c => c instanceof FakeEl && (out.push(c), all(c, out))), out);
const withCls = (n, c) => all(n).filter(x => x.classList.contains(c));
const px = (el, k) => el.style.props[k];
const num = v => parseFloat(v);

// ---- exports ----
test('every r4 builder has a DOM builder and an HTML twin', () => {
  for (const name of ['progressRing', 'passStack', 'dayTimeline', 'monthCalendar', 'panelGrid', 'leagueTile']) {
    assert.equal(typeof ui[name], 'function', name);
    assert.equal(typeof ui[`${name}Html`], 'function', `${name}Html`);
  }
  for (const name of ['wirePassStacks', 'wireTimelines', 'monthGrid', 'nowPct', 'timelineLayout', 'clockMin']) assert.equal(typeof ui[name], 'function', name);
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

test('progressRingHtml: escapes, and the same classes', () => {
  const o = { size: 56, label: '<b>', sub: 'a"b', tint: 'red;x{}' };
  const html = ui.progressRingHtml(0.5, o);
  assert.ok(!html.includes('<b>&') && html.includes('&#60;b&#62;') && html.includes('a&#34;b'));
  assert.ok(!/--t:[^"]*[;{}]/.test(html.replace(/--s:56px;/, '')), 'a tint cannot end the declaration');
  assert.deepEqual(sorted(classesOfHtml(html)), sorted(classesOfTree(ui.progressRing(0.5, o))));
  assert.deepEqual(sorted(classesOfHtml(ui.progressRingHtml(0.5))), sorted(classesOfTree(ui.progressRing(0.5))));
});

// ---- pass stack ----
const passes = () => [
  { title: '3串1', sub: 'NBA', big: 'NT$200', tint: '#ff9500', tags: ['進行中'], logos: ['a.png'], data: { id: 'p1' } },
  { title: '單場', sub: 'MLB', big: 'NT$300' },
  { title: '2串1', sub: '英超' }
];
test('passStack: one card per item, ordered, peek and count as variables', () => {
  const s = ui.passStack(passes(), { peek: 48 });
  assert.equal(px(s, '--n'), '3');
  assert.equal(px(s, '--peek'), '48px');
  const cards = withCls(s, 'q-pass');
  assert.equal(cards.length, 3);
  assert.deepEqual(cards.map(c => px(c, '--i')), ['0', '1', '2']);
  assert.equal(px(cards[0], '--t'), '#ff9500');
  assert.equal(cards[0].getAttribute('data-id'), 'p1');
  assert.equal(withCls(cards[0], 'q-pass-big')[0].textContent, 'NT$200');
  assert.equal(withCls(cards[0], 'q-pass-more').length, 1);
  assert.equal(withCls(cards[2], 'q-pass-more').length, 0, 'no logos or tags, no row');
  assert.equal(ui.passStack(passes()).style.props['--peek'], '56px');
});

test('passStack: a tap spreads; a tap on a spread card opens it and folds; outside folds', () => {
  reset();
  const opened = [];
  const s = ui.passStack(passes(), { onOpen: (it, i) => opened.push([it.title, i]) });
  body.append(s);
  const [c0, c1] = withCls(s, 'q-pass');
  c1.dispatch('click');
  assert.ok(s.classList.contains('spread'));
  assert.deepEqual(opened, [], 'the first tap only spreads');
  c1.dispatch('click');
  assert.deepEqual(opened, [['單場', 1]]);
  assert.ok(!s.classList.contains('spread'));
  c0.dispatch('click');
  assert.ok(s.classList.contains('spread'));
  const outside = new FakeEl('p');
  body.append(outside);
  doc.dispatch('click', { target: outside });
  assert.ok(!s.classList.contains('spread'), 'a tap outside folds it');
  assert.deepEqual(opened.length, 1);
  c0.dispatch('click');
  doc.dispatch('keydown', { key: 'Escape', target: body });
  assert.ok(!s.classList.contains('spread'), 'Escape folds it');
});

test('passStack: a card\'s own onOpen wins; one card opens at once', () => {
  reset();
  const got = [];
  const s = ui.passStack([{ title: 'a', onOpen: () => got.push('own') }], { onOpen: () => got.push('stack') });
  body.append(s);
  withCls(s, 'q-pass')[0].dispatch('click');
  assert.deepEqual(got, ['own']);
  assert.ok(!s.classList.contains('spread'));
});

test('passStackHtml: escapes, data-pass, and the same classes', () => {
  const items = [{ id: 'x"y', title: '<i>', sub: '&', big: '1', tint: '#f00;', tags: ['<t>'], logos: [] }, { title: 'b', data: { k: '"' } }];
  const html = ui.passStackHtml(items);
  assert.ok(!html.includes('<i>') && !html.includes('<t>'));
  assert.ok(html.includes('data-pass="x&#34;y"') && html.includes('data-pass="1"'), 'the id, else the index');
  assert.ok(html.includes('data-k="&#34;"'));
  assert.ok(!html.includes('#f00;'));
  assert.deepEqual(sorted(classesOfHtml(html)), sorted(classesOfTree(ui.passStack(items))));
  assert.deepEqual(sorted(classesOfHtml(ui.passStackHtml(passes()))), sorted(classesOfTree(ui.passStack(passes()))));
});

// ---- timeline ----
test('clockMin and nowPct: the maths', () => {
  assert.equal(ui.clockMin('08:10'), 490);
  assert.equal(ui.clockMin('7:05'), 425);
  assert.ok(Number.isNaN(ui.clockMin('25:00')) && Number.isNaN(ui.clockMin('x')) && Number.isNaN(ui.clockMin('08:60')));
  assert.equal(ui.nowPct(new Date(2026, 9, 19, 7, 0)), 0);
  assert.equal(ui.nowPct(new Date(2026, 9, 19, 12, 0)), 50);
  assert.equal(ui.nowPct(new Date(2026, 9, 19, 17, 0)), 100);
  assert.equal(ui.nowPct(new Date(2026, 9, 19, 6, 59)), null);
  assert.equal(ui.nowPct(new Date(2026, 9, 19, 17, 1)), null);
  assert.equal(ui.nowPct(new Date(2026, 9, 19, 9, 30), '08:00', '12:00'), 37.5);
});

test('timelineLayout: positions as percents, clipped to the range, overlaps side by side', () => {
  const lay = ui.timelineLayout([{ start: '08:10', end: '09:00', title: 'a' }, { start: '06:00', end: '07:30', title: 'early' }, { start: '16:30', end: '18:00', title: 'late' }, { start: '20:00', end: '21:00', title: 'out' }]);
  assert.equal(lay.length, 3, 'one wholly outside is dropped');
  const [early, a, late] = lay;
  assert.equal(early.top, 0);
  assert.equal(early.height, 5, '07:00-07:30 of 600 minutes');
  assert.ok(Math.abs(a.top - (70 / 600) * 100) < 1e-9 && Math.abs(a.height - (50 / 600) * 100) < 1e-9);
  assert.ok(Math.abs(late.top - 95) < 1e-9 && Math.abs(late.height - 5) < 1e-9, 'cut at 17:00');
  assert.deepEqual([a.col, a.cols], [0, 1]);
  const two = ui.timelineLayout([{ start: '09:00', end: '10:00', title: 'x' }, { start: '09:30', end: '10:30', title: 'y' }, { start: '10:30', end: '11:00', title: 'z' }]);
  assert.deepEqual(two.map(b => [b.title, b.col, b.cols]), [['x', 0, 2], ['y', 1, 2], ['z', 0, 1]]);
});

test('dayTimeline: hours, blocks placed by time, now-line at its percent', () => {
  const now = new Date(2026, 9, 19, 10, 30);
  const t = ui.dayTimeline([{ start: '08:10', end: '09:00', title: '國文', sub: 'A201', tint: '#ff6b6b' }, { start: '10:10', end: '11:00', title: '英文' }], { now });
  t.stop();
  assert.equal(px(t, '--hrs'), '10');
  const hours = withCls(t, 'q-tl-h');
  assert.equal(hours.length, 11, '07:00 to 17:00 inclusive');
  assert.equal(hours[0].textContent, '07:00');
  assert.equal(px(hours[5], '--tl-top'), '50%');
  const [b1, b2] = withCls(t, 'q-tl-b');
  assert.equal(num(px(b1, '--tl-top')).toFixed(3), (70 / 6).toFixed(3));
  assert.equal(num(px(b1, '--tl-h')).toFixed(3), (50 / 6).toFixed(3));
  assert.equal(px(b1, '--t'), '#ff6b6b');
  assert.ok(!b1.classList.contains('on') && b2.classList.contains('on'), 'the block holding now is marked');
  const line = withCls(t, 'q-tl-now')[0];
  assert.equal(num(px(line, '--tl-top')).toFixed(3), (210 / 6).toFixed(3), '10:30 is 210 of 600 minutes');
  assert.equal(line.hidden, false);
  const late = ui.dayTimeline([], { now: new Date(2026, 9, 19, 20, 0) });
  late.stop();
  assert.equal(withCls(late, 'q-tl-now')[0].hidden, true, 'outside the range there is no line');
  assert.equal(px(ui.dayTimeline([], { from: '08:00', to: '12:30', now }), '--hrs'), '4.5');
});

test('dayTimeline: the now-line moves each minute while mounted, and lets go once removed', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: new Date(2026, 9, 19, 10, 0, 30).getTime() });
  reset();
  const el = ui.dayTimeline([]);
  body.append(el);
  const line = withCls(el, 'q-tl-now')[0];
  const at = () => num(px(line, '--tl-top'));
  assert.equal(at().toFixed(3), (180 / 6).toFixed(3));
  t.mock.timers.tick(31000);
  assert.equal(at().toFixed(3), (181 / 6).toFixed(3), 'a minute on');
  t.mock.timers.tick(60000);
  assert.equal(at().toFixed(3), (182 / 6).toFixed(3));
  el.remove();
  t.mock.timers.tick(60000 * 3);
  const frozen = at();
  t.mock.timers.tick(60000 * 5);
  assert.equal(at(), frozen, 'nothing moves it once removed');
});

test('dayTimeline: stop() ends the loop', t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: new Date(2026, 9, 19, 10, 0, 30).getTime() });
  reset();
  const el = ui.dayTimeline([]);
  body.append(el);
  el.stop();
  const line = withCls(el, 'q-tl-now')[0];
  const before = px(line, '--tl-top');
  t.mock.timers.tick(120000);
  assert.equal(px(line, '--tl-top'), before);
});

test('dayTimelineHtml: escapes, positions match the builder, same classes', () => {
  const now = new Date(2026, 9, 19, 10, 30);
  const blocks = [{ start: '08:10', end: '09:00', title: '<國>', sub: 'a&b', tint: 'red;' }, { start: '10:10', end: '11:00', title: 'x' }];
  const html = ui.dayTimelineHtml(blocks, { now });
  assert.ok(!html.includes('<國>') && html.includes('&#60;國&#62;') && html.includes('a&#38;b'));
  assert.ok(!html.includes('red;'));
  assert.ok(html.includes(`--tl-top:${+(70 / 6).toFixed(3)}%`) && html.includes(`--tl-top:${+(210 / 6).toFixed(3)}%`));
  assert.ok(html.includes('data-from="07:00"') && html.includes('data-s="490"'));
  const dom = ui.dayTimeline(blocks, { now });
  dom.stop();
  assert.deepEqual(sorted(classesOfHtml(html)), sorted(classesOfTree(dom)));
  assert.ok(ui.dayTimelineHtml([], { now: new Date(2026, 9, 19, 20, 0) }).includes('q-tl-now" aria-hidden="true" hidden'));
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

test('monthCalendarHtml: same days and classes, picks as data-pick, escaped', () => {
  const opts = { year: 2026, month: 10, marks: { '2026-10-05': 'done', '2026-10-06': 'x"y' }, today: '2026-10-19', lang: 'zh' };
  const html = ui.monthCalendarHtml(opts);
  assert.equal((html.match(/q-cal-d/g) || []).length, 31);
  assert.ok(html.includes('grid-column-start:5') && html.includes('--off:4'));
  assert.ok(!html.includes('x"y'), 'a mark is cleaned to a word');
  assert.deepEqual(sorted(classesOfHtml(html)), sorted(classesOfTree(ui.monthCalendar(opts))));
  const p = ui.monthCalendarHtml({ ...opts, pick: true });
  assert.ok(p.includes('<button type="button" class="q-cal-d') && p.includes('data-pick="2026-10-19"'));
  assert.deepEqual(sorted(classesOfHtml(p)), sorted(classesOfTree(ui.monthCalendar({ ...opts, onPick: () => {} }))));
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
test('leagueTile: 56px logo over the name; twin matches, escapes, data-open', () => {
  let opened = 0;
  const t = ui.leagueTile({ logo: 'nba.png', name: 'NBA', sub: '12 場', onOpen: () => opened++ });
  assert.equal(t.tag, 'button');
  assert.equal(t.className, 'q-league');
  const logo = withCls(t, 'q-logo')[0];
  assert.equal(px(logo, '--s'), '56px');
  assert.equal(t.children[1].textContent, 'NBA');
  t.dispatch('click');
  assert.equal(opened, 1);
  const html = ui.leagueTileHtml({ logo: 'nba.png', name: '<N>', sub: '12', open: 'nba' });
  assert.ok(html.includes('data-open="nba"') && html.includes('&#60;N&#62;') && html.includes('--s:56px'));
  assert.deepEqual(sorted(classesOfHtml(html)), sorted(classesOfTree(ui.leagueTile({ logo: 'nba.png', name: '<N>', sub: '12' }))));
  assert.equal(withCls(ui.leagueTile({ name: '英超' }), 'q-logo')[0].textContent, '英', 'no logo: the first letter');
});

// ---- CSS ----
test('CSS: Home parts (r4) sits just before Foundations and styles what the parts make', () => {
  const a = rawCss.indexOf('/* ---- Home parts (r4)');
  const b = rawCss.indexOf('/* ---- Foundations (design review)');
  assert.ok(a > 0 && b > a && rawCss.indexOf('/* ---- ', a + 5) === b);
  const sec = rawCss.slice(a, b);
  for (const c of ['.q-ring', '.q-ring-track', '.q-ring-arc', '.q-ring-l', '.q-stack', '.q-stack.spread', '.q-pass', '.q-pass-head', '.q-pass-big', '.q-tl', '.q-tl-h', '.q-tl-b', '.q-tl-b.on', '.q-tl-now', '.q-cal', '.q-cal-w', '.q-cal-d', '.q-cal-d.m-done', '.q-cal-d.m-part', '.q-cal-d.today', '.q-panels', '.q-panel', '.q-panel-v', '.q-league']) assert.ok(sec.includes(`${c} {`) || sec.includes(`${c},`), c);
  assert.equal((sec.match(/{/g) || []).length, (sec.match(/}/g) || []).length, 'balanced braces');
  assert.ok(sec.includes('prefers-reduced-motion'));
  assert.ok(!/#[0-9a-f]{3,8}\b/i.test(sec.replace(/#fff(fff)?\b|#000\b/gi, '')), 'colours are tokens (white aside)');
  assert.ok(sec.includes('min-height: 44px'));
});
