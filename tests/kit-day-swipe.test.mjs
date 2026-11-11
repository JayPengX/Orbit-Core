// A swipe across a page (a day in Sports, a place in Weather, a list in Law)
// moves the same way every time (Jay 2026-11-05, Weather: "swipe animation is
// inconsistent and weird"): let go short of a swipe, or with nothing beside,
// and the page glides home, never snaps; a swipe slides the new page in from
// the side it was sent, and a part drawn again while that runs (an answer
// landing) carries on from the same moment instead of starting the slide over.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { daySwipe, SWIPE_IN_MS } from '../kit/ui.mjs';

const css = readFileSync(new URL('../kit/orbit.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

// ---- A just-enough DOM and clock ----
let now = 0;
let timers = [];
let observers = [];
const classes = () => {
  const set = new Set();
  return { set, add: (...c) => c.forEach(x => set.add(x)), remove: (...c) => c.forEach(x => set.delete(x)), contains: c => set.has(c), toggle: (c, on) => (on ?? !set.has(c) ? set.add(c) : set.delete(c)) };
};
class El {
  constructor(cls = '') {
    this.nodeType = 1;
    this.listeners = {};
    this.children = [];
    this.parentNode = null;
    this.classList = classes();
    this.cls = cls;
    this.props = {};
    this.style = { setProperty: (k, v) => (this.props[k] = v), removeProperty: k => delete this.props[k] };
    this.anims = [];
    this.scrollWidth = this.clientWidth = 300;
  }
  get parentElement() {
    return this.parentNode;
  }
  get offsetWidth() {
    return 300;
  }
  matches(sel) {
    return sel.split(',').some(s => s.trim() === `.${this.cls}` || (s.trim() === '[hidden]' && this.hidden) || s.trim() === this.tag);
  }
  contains(n) {
    for (; n; n = n.parentNode) if (n === this) return true;
    return false;
  }
  closest(sel) {
    for (let n = this; n; n = n.parentNode) if (n.matches(sel)) return n;
    return null;
  }
  get isConnected() {
    return this.closest('.root') != null;
  }
  getClientRects() {
    return [{}];
  }
  addEventListener(type, fn) {
    this.listeners[type] = fn;
  }
  append(...kids) {
    for (const k of kids) {
      k.parentNode = this;
      this.children.push(k);
    }
    for (const o of observers) if (o.target === this) o.fn([{ addedNodes: kids }]);
  }
  replace(...kids) {
    this.children = [];
    this.append(...kids);
  }
  animate(frames, opts) {
    const a = { frames, opts, cancelled: false, cancel: () => (a.cancelled = true) };
    this.anims.push(a);
    return a;
  }
}
const docListeners = {};
globalThis.document = { querySelectorAll: () => [], addEventListener: (k, fn) => (docListeners[k] ||= []).push(fn), removeEventListener: (k, fn) => (docListeners[k] = (docListeners[k] || []).filter(f => f !== fn)) };
// (A touch the page gets: its target's own listeners first, as it bubbles, then the document's.)
const fire = (k, ev) => {
  for (let n = ev.target; n; n = n.parentNode) n.listeners?.[k]?.(ev);
  for (const fn of docListeners[k] || []) fn(ev);
};
globalThis.getComputedStyle = () => ({ overflowX: 'visible' });
globalThis.matchMedia = () => ({ matches: false });
globalThis.performance = { now: () => now };
globalThis.setTimeout = (fn, ms = 0) => (timers.push({ at: now + ms, fn }), timers.length);
globalThis.clearTimeout = id => timers[id - 1] && (timers[id - 1].fn = null);
globalThis.MutationObserver = class {
  constructor(fn) {
    this.fn = fn;
  }
  observe(target) {
    this.target = target;
    observers.push(this);
  }
  disconnect() {
    observers = observers.filter(o => o !== this);
  }
};
const run = ms => {
  const until = now + ms;
  for (;;) {
    const t = timers.filter(x => x.fn && x.at <= until).sort((a, b) => a.at - b.at)[0];
    if (!t) break;
    now = t.at;
    const fn = t.fn;
    t.fn = null;
    fn();
  }
  now = until;
};
const page = (step = () => true) => {
  const panel = new El();
  const part = new El('part');
  panel.append(part);
  daySwipe(panel, step);
  return { panel, part };
};
const drag = (panel, dx, { ms = 400 } = {}) => {
  const at = Date.now;
  const t0 = at();
  Date.now = () => t0;
  panel.listeners.touchstart({ touches: [{ clientX: 200, clientY: 300 }], target: panel.children.at(-1) });
  for (let i = 1; i <= 5; i++) panel.listeners.touchmove({ touches: [{ clientX: 200 + (dx * i) / 5, clientY: 300 }], preventDefault() {} });
  Date.now = () => t0 + ms;
  panel.listeners.touchend({ changedTouches: [{ clientX: 200 + dx, clientY: 300 }] });
  Date.now = at;
};

test('a drag follows the finger and fades as it goes, never a step down at its start', () => {
  const { panel } = page();
  panel.listeners.touchstart({ touches: [{ clientX: 200, clientY: 300 }], target: panel.children.at(-1) });
  panel.listeners.touchmove({ touches: [{ clientX: 185, clientY: 300 }], preventDefault() {} });
  assert.ok(panel.classList.contains('swiping'));
  assert.equal(panel.props['--swipe'], '-7px');
  assert.ok(Number(panel.props['--swipe-fade']) > 0.95, 'barely faded a few pixels in');
  assert.doesNotMatch(css, /\.q-day-swipe\.swiping[^{]*\{[^}]*opacity:\s*0\.85/, 'no fixed fade the moment it moves');
});

test('let go short of a swipe, or with nothing beside, the page glides home', () => {
  for (const [dx, step] of [[-40, () => true], [-200, () => false]]) {
    const { panel, part } = page(step);
    drag(panel, dx);
    assert.ok(!panel.classList.contains('swiping'));
    assert.ok(panel.classList.contains('swipe-back'), `glides home (${dx})`);
    assert.equal(part.anims.length, 0, 'no slide in: nothing new came');
    run(400);
    assert.ok(!panel.classList.contains('swipe-back'));
  }
  assert.match(css, /\.q-day-swipe\.swipe-back[^{]*\{[^}]*transition:[^}]*transform/);
});

test('a swipe slides the new page in from the side it was sent, and a redraw mid-slide carries on', () => {
  const steps = [];
  const { panel, part } = page(dir => (steps.push(dir), true));
  drag(panel, -200);
  assert.deepEqual(steps, [1]);
  assert.ok(!panel.classList.contains('swipe-back'), 'gone on, not back');
  assert.equal(part.anims.length, 1);
  assert.equal(part.anims[0].frames[0].transform, 'translateX(36px)');
  assert.equal(part.anims[0].opts.delay, -0);
  // The forecast lands 100 ms in: the new part picks up at 100 ms, not at the start.
  run(100);
  const fresh = new El('part');
  panel.replace(fresh);
  assert.equal(fresh.anims.length, 1);
  assert.equal(fresh.anims[0].opts.delay, -100);
  // After the slide, a redraw stands still.
  run(SWIPE_IN_MS + 100);
  const later = new El('part');
  panel.replace(later);
  assert.equal(later.anims.length, 0);
  // The other way: from the left.
  const back = page();
  drag(back.panel, 200);
  assert.equal(back.part.anims[0].frames[0].transform, 'translateX(-36px)');
});

test('a part that stays put (the day bar) never slides', () => {
  const panel = new El();
  const bar = new El('q-day-bar');
  const part = new El('part');
  panel.append(bar, part);
  daySwipe(panel, () => true);
  drag(panel, -200);
  assert.equal(bar.anims.length, 0);
  assert.equal(part.anims.length, 1);
});

test('the page’s empty space swipes too, never a bar beside the panel or a hidden tab (Jay 2026-11-06, an iPad)', () => {
  const root = new El('root');
  const main = new El('page');
  const bar = new El('tabbar');
  const panel = new El();
  const other = new El();
  const part = new El('part');
  panel.append(part);
  main.append(panel, other);
  root.append(main, bar);
  const steps = [];
  daySwipe(panel, dir => (steps.push(dir), true));
  other.hidden = true;
  daySwipe(other, () => (steps.push('hidden tab'), true));
  const swipeOn = target => {
    const at = Date.now;
    const t0 = at();
    Date.now = () => t0;
    fire('touchstart', { target, touches: [{ clientX: 300, clientY: 700 }] });
    for (let i = 1; i <= 5; i++) fire('touchmove', { target, touches: [{ clientX: 300 - 40 * i, clientY: 700 }], preventDefault() {} });
    Date.now = () => t0 + 400;
    fire('touchend', { target, changedTouches: [{ clientX: 100, clientY: 700 }] });
    Date.now = at;
  };
  // Under a short day: the finger on the page itself, outside the panel.
  swipeOn(main);
  assert.deepEqual(steps, [1], 'the next day, from the empty page');
  assert.equal(part.anims.length, 1, 'slid in');
  // On what's drawn: once, not twice (the panel's own and the page's).
  swipeOn(part);
  assert.deepEqual(steps, [1, 1]);
  // On the tab bar beside it: nothing.
  swipeOn(bar);
  assert.deepEqual(steps, [1, 1]);
  // Gone from the page: it lets the document go.
  const n = docListeners.touchstart.length;
  main.children = [];
  panel.parentNode = null;
  fire('touchstart', { target: root, touches: [{ clientX: 0, clientY: 0 }] });
  assert.equal(docListeners.touchstart.length, n - 1);
});

test('nothing that way: the page never follows the finger (Jay 2026-11-11, Law 議會: "it can swipe but it does nothing")', () => {
  const steps = [];
  const panel = new El();
  const part = new El('part');
  panel.append(part);
  daySwipe(panel, dir => (steps.push(dir), true), { can: dir => dir < 0 });
  // Toward a next day there is none: no drag, no step, no glide home.
  panel.listeners.touchstart({ touches: [{ clientX: 200, clientY: 300 }], target: part });
  panel.listeners.touchmove({ touches: [{ clientX: 150, clientY: 300 }], preventDefault() {} });
  assert.ok(!panel.classList.contains('swiping'));
  panel.listeners.touchend({ changedTouches: [{ clientX: 0, clientY: 300 }] });
  assert.deepEqual(steps, []);
  assert.ok(!panel.classList.contains('swipe-back'));
  // The other way there is: it follows and steps.
  drag(panel, 200);
  assert.deepEqual(steps, [-1]);
});

test('page: false: only a finger on the panel, never the page around it', () => {
  const n = (docListeners.touchstart || []).length;
  const panel = new El();
  panel.append(new El('part'));
  daySwipe(panel, () => true, { page: false });
  assert.equal((docListeners.touchstart || []).length, n);
  assert.ok(panel.listeners.touchstart, 'its own still swipes');
});
