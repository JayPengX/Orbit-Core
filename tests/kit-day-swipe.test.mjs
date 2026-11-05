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
    return sel.split(',').some(s => s.trim() === `.${this.cls}`);
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
globalThis.document = { querySelectorAll: () => [] };
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
