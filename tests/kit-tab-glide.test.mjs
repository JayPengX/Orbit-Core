// The tab bar's switch stays smooth however much a tab holds (Jay
// 2026-11-05: Sports' 轉播 "laggy and jump", "especially when that tab has
// more content"). A tab drawn before is shown at once, as it was left, and
// the app is asked to draw it again only after the pill's slide; a tap never
// reads the page's layout; the pill and the icon ride bézier curves, never
// a linear() spring (run by the page in Safari, so it stopped while a tab drew).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
// (Imported before there's a document: its start-up hooks stay out of the way.)
import { tabBar } from '../kit/orbit.mjs';

const css = readFileSync(new URL('../kit/orbit.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

// ---- A just-enough DOM and clock ----
let now = 0;
let timers = [];
const later = (fn, ms = 0) => (timers.push({ at: now + ms, fn, id: timers.length + 1 }), timers.length);
const cancel = id => (timers = timers.map(t => (t.id === id ? { ...t, fn: null } : t)));
const run = ms => {
  const until = now + ms;
  for (;;) {
    const next = timers.filter(t => t.fn && t.at <= until).sort((a, b) => a.at - b.at)[0];
    if (!next) break;
    now = next.at;
    const fn = next.fn;
    next.fn = null;
    fn();
  }
  now = until;
};
let reads = 0;
class El {
  constructor(tag) {
    this.tag = tag;
    this.attrs = {};
    this.kids = [];
    this.listeners = {};
    this.hidden = false;
    this.className = '';
    this.style = { setProperty() {}, removeProperty() {} };
    this.classList = { add() {}, remove() {}, toggle() {}, contains: () => false };
    this.parts = {};
  }
  setAttribute(k, v) {
    this.attrs[k] = String(v);
  }
  getAttribute(k) {
    return this.attrs[k] ?? null;
  }
  addEventListener(type, fn) {
    (this.listeners[type] ||= []).push(fn);
  }
  fire(type, ev = {}) {
    for (const fn of this.listeners[type] || []) fn({ isPrimary: true, button: 0, ...ev });
  }
  querySelector(sel) {
    return (this.parts[sel] ||= new El('span'));
  }
  replaceChildren(...k) {
    this.kids = k;
  }
  append(...k) {
    this.kids.push(...k);
  }
  after() {}
  get offsetLeft() {
    reads++;
    return 100 * Object.keys(buttons).indexOf(this.attrs['data-tab']);
  }
  get offsetTop() {
    reads++;
    return 0;
  }
  get offsetWidth() {
    reads++;
    return 100;
  }
  get offsetHeight() {
    reads++;
    return 54;
  }
}
const buttons = { home: 1, matches: 1, live: 1, following: 1 };
const panels = Object.fromEntries(Object.keys(buttons).map(id => [id, new El('section')]));
const nav = new El('nav');
let scrolled = 0;
Object.assign(globalThis, {
  document: {
    createElement: tag => new El(tag),
    createTextNode: t => ({ t }),
    getElementById: id => (id === 'tabs' ? nav : panels[id.replace('panel-', '')] || null),
    documentElement: new El('html'),
    body: null
  },
  Node: El,
  requestAnimationFrame: fn => later(fn, 16),
  cancelAnimationFrame: cancel,
  setTimeout: later,
  clearTimeout: cancel,
  scrollTo: (x, y) => (scrolled = typeof x === 'object' ? x.top : y),
  history: { replaceState() {} },
  location: { hash: '', pathname: '/', search: '' }
});
Object.defineProperty(globalThis, 'scrollY', { get: () => scrolled, configurable: true });

test('a tab drawn before shows at once; the app draws it after the slide', () => {
  const asked = [];
  const bar = tabBar({ tabs: Object.keys(buttons).map(id => ({ id, label: id, icon: 'home' })), onSelect: id => asked.push([id, now]), nav });
  const tab = id => nav.kids.find(b => b.attrs['data-tab'] === id);
  bar.select('home');
  run(50);
  // live, the first time: nothing drawn to show, so the app draws it after the next paint.
  const first = now;
  tab('live').fire('pointerdown');
  run(100);
  assert.deepEqual(asked.map(a => a[0]), ['live']);
  assert.ok(asked[0][1] - first < 50, 'a first visit is drawn at once');
  bar.select('live');
  assert.equal(panels.live.hidden, false);
  scrolled = 600;
  run(50);
  // Back home, drawn before: shown in the tap itself, as it was left, the app asked only after the pill's slide.
  reads = 0;
  const t0 = now;
  tab('home').fire('pointerdown');
  assert.equal(reads, 0, 'the tap reads no layout');
  assert.equal(panels.home.hidden, false);
  assert.equal(panels.live.hidden, true);
  assert.equal(bar.current, 'home');
  assert.equal(scrolled, 0, 'home where it was left');
  // (The app's redraw of the tab it still thinks open, meanwhile: home stays.)
  bar.select('live');
  assert.equal(panels.home.hidden, false);
  run(300);
  assert.equal(asked.length, 1, 'not drawn during the slide');
  run(200);
  assert.deepEqual(asked.at(-1)[0], 'home');
  assert.ok(asked.at(-1)[1] - t0 >= 340);
  bar.select('home');
  assert.equal(bar.current, 'home');
  // live again: its place (600) back with it.
  tab('live').fire('pointerdown');
  assert.equal(scrolled, 600);
  assert.equal(panels.live.hidden, false);
  run(500);
  bar.select('live');
  // An app that refuses a tab (a gate): back to the one open.
  tab('home').fire('pointerdown');
  run(2500);
  assert.equal(bar.current, 'live');
  assert.equal(panels.live.hidden, false);
  assert.equal(panels.home.hidden, true);
});

test('the pill and the tab icons ride béziers, never a linear() spring', () => {
  const rule = sel => css.slice(css.indexOf(sel)).split('}')[0];
  for (const sel of ['.q-tabbar.q-tabbar::before {', 'html.q-tabrail .q-tabbar.q-tabbar::before {', '.q-tab-icon {']) {
    const r = rule(sel);
    assert.match(r, /transition:[^;]*cubic-bezier/, sel);
    assert.doesNotMatch(r, /transition:[^;]*--q-spring/, sel);
  }
});
