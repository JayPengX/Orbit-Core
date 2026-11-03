// ---- Nothing moves the page but the person (Jay 2026-11-01, again; 11-03) ----
// Every app redraws while it's open: a game's score every few seconds, a
// list's live rows, a board's arrivals, a quote; and after every tap (a
// segmented control's other part, a chip, a day, 再看). iPhone's Safari has
// no scroll anchoring (Chromium's keeps what you read in place when the page
// above it changes; Safari's doesn't), and a page made shorter for a moment
// (a card swapped, a spinner where a list was) pulls the scroll up to fit,
// never back down: the person reading lost their place, or went to the top.
//
// So the kit holds the place itself, for every app at once, whatever drew:
//   - every scroller the person scrolled (the page, a sheet, a panel) keeps
//     what's under the top of its view (an anchor: that element, its
//     ancestors, and a signature to find its stand-in when a redraw made a
//     new one), and where it sat. Only a box in the page's flow anchors:
//     never a car on a track map or a dot on a chart (they move on their
//     own: a live map's car, followed, scrolled the page with it, Jay
//     2026-11-02), nor one pinned or laid over the page;
//   - after any change to its contents that the person didn't make, the
//     anchor is put back where it was;
//   - after a tap, the control tapped stays under the finger (a segmented
//     control's other part, a chip, 收起), unless the change grew above it
//     (再看 opening a list over its button): then what was in view stays,
//     and the list reads on below. A swipe to another day keeps the view's
//     place the same way. The code's own scroll (to the top, to a section)
//     is taken as it is;
//   - a page that got shorter than where the person was gets the room back
//     at its end, given back only as they scroll up (never at a touch: that
//     pulled the page up under the finger);
//   - a sheet sized to its content never shrinks while it's open (a day
//     with fewer rows, a part with less in it): it keeps the tallest it has
//     been, as iOS's sheets keep their height;
//   - beats (everyDev) wait while a finger is on the screen or a scroll
//     still runs: iOS stops a fling whose content is swapped under it.
// Apps still draw in place where they can (put(): the same nodes kept);
// this is the floor under every redraw, not a reason to rebuild.

const GESTURE_MS = 900;
const SCROLL_IDLE_MS = 250;
let touching = 0;
let lastGesture = 0;
let lastScroll = 0;
// The control just tapped (or the field typed in): { s, node, sig, y, off, top, at }.
let tap = null;

// A scroll still running, or a finger on the screen: a live redraw waits.
export const scrollBusy = () => touching > 0 || Date.now() - lastScroll < SCROLL_IDLE_MS;
// The person did something just now: a change after it is theirs (a tab, a chip, a row opened).
const theirs = () => Date.now() - lastGesture < GESTURE_MS;

// What an element says, without what a live redraw changes (scores, clocks,
// counts: every digit), for finding the same row in a list drawn anew.
export function signature(tag, cls, text) {
  return `${String(tag || '').toLowerCase()}|${String(cls || '').trim().split(/\s+/).filter(c => c && !/^(fade|is-|q-flash|live|on|now)/.test(c)).sort().join('.')}|${String(text || '').replace(/[\d\s:'’.,+\-–%]/g, '').slice(0, 60)}`;
}
const sigOf = n => signature(n.tagName, n.getAttribute?.('class'), `${n.getAttribute?.('aria-label') || ''}${n.textContent}`);

// A box that moves on its own, not with the page's flow: drawn inside an
// SVG (a car on a track, a line's dot), pinned (fixed, sticky: a stuck day
// strip sits still whatever scrolls) or laid over the page (absolute).
// Pure, for the tests: (is it inside an SVG, its computed position).
export const loose = (inSvg, position) => Boolean(inSvg) || /^(absolute|fixed|sticky)$/.test(String(position || ''));
const looseNode = n => loose(n.ownerSVGElement != null, getComputedStyle(n).position);

const rootOf = s => (s === document.scrollingElement || s === document.documentElement || s === document.body ? document.scrollingElement : s);
const viewTop = s => (s === document.scrollingElement ? 0 : s.getBoundingClientRect().top);
const isPage = s => s === document.scrollingElement;
const hostOf = s => (isPage(s) ? document.body : s);
const roomOf = s => parseFloat(hostOf(s).style.getPropertyValue('--q-hold-room')) || 0;
const shown = n => n.getClientRects().length > 0;

// scroller -> { top, anchors: [{ node, sig, y }] }
const held = new Map();

// The anchors at one point: the element there and up to six ancestors
// inside the scroller that move with the flow (anything under a loose box
// left out: it moves with that box).
function anchorsAt(s, n) {
  const anchors = [];
  for (let k = n; k && k !== s && k !== document.body && anchors.length < 7; k = k.parentElement) {
    if (looseNode(k)) {
      anchors.length = 0;
      continue;
    }
    const r = k.getBoundingClientRect();
    if (r.height < 8) continue;
    anchors.push({ node: k, sig: sigOf(k), y: r.top });
  }
  return anchors;
}
// What sits under the top of the view (a little in, past a sticky bar).
function anchor(s) {
  const top = viewTop(s);
  const box = isPage(s) ? { left: 0, width: innerWidth, height: innerHeight } : s.getBoundingClientRect();
  const x = box.left + box.width / 2;
  const h = isPage(s) ? innerHeight : s.clientHeight;
  // (Best a box that starts inside the view: a gap between two cards hits
  // their container, whose top is far above and doesn't move when a card
  // above grows; the next point down finds a card.)
  let anchors = null;
  for (const f of [0.3, 0.45, 0.6]) {
    const n = document.elementFromPoint(x, top + h * f);
    if (!n || n === s || !s.contains(n)) continue;
    const got = anchorsAt(s, n);
    if (!got.length) continue;
    anchors ||= got;
    if (got[0].y >= top - 1) {
      anchors = got;
      break;
    }
  }
  held.set(s, { top: s.scrollTop, anchors: anchors || [] });
  trimRoom(s);
}

// An element's stand-in after a redraw: one saying the same (its
// signature) nearest where it was. `toggle`: a tapped control whose words
// change with it (再看 7 則 → 收起) is found by its tag and classes too.
function standIn(s, a, toggle = false) {
  const [, kind, words] = a.sig.split('|');
  // (A stand-in only by what it says: an empty box's twin is anywhere.)
  const flip = toggle && kind && a.node.hasAttribute?.('aria-expanded');
  if (words.length < 2 && !flip) return null;
  const cls = a.node.classList?.[0];
  const all = [...s.querySelectorAll(cls ? `${a.node.tagName}.${CSS.escape(cls)}` : a.node.tagName)].filter(shown);
  let same = all.filter(n => sigOf(n) === a.sig);
  if (!same.length && flip) same = all.filter(n => n.hasAttribute('aria-expanded') && sigOf(n).split('|')[1] === kind);
  let best = null;
  let gap = Infinity;
  for (const n of same) {
    const d = Math.abs(n.getBoundingClientRect().top - a.y);
    if (d < gap) (gap = d), (best = n);
  }
  return best;
}
// The anchor after a redraw: itself, or its stand-in; else the nearest ancestor still there.
function findAnchor(s, st) {
  // (Only what's drawn: a hidden tab's row has no place to keep.)
  for (const a of st.anchors) {
    if (a.node.isConnected && s.contains(a.node)) {
      if (shown(a.node)) return a;
      continue;
    }
    const n = standIn(s, a);
    if (n) return { ...a, node: n };
  }
  return null;
}

// Room held at a scroller's end so a shorter page can't pull it up.
function holdRoom(s, px) {
  const host = hostOf(s);
  if (px > 0) {
    host.classList.add('q-hold-room');
    host.style.setProperty('--q-hold-room', `${Math.ceil(px)}px`);
  } else if (host.classList.contains('q-hold-room')) {
    host.classList.remove('q-hold-room');
    host.style.removeProperty('--q-hold-room');
  }
}
// Only as much room as where the person is needs: less as they go up, none once the page reaches past them again.
function trimRoom(s) {
  const room = roomOf(s);
  if (!room) return;
  const need = s.scrollTop < 1 ? 0 : Math.max(0, s.scrollTop + s.clientHeight - (s.scrollHeight - room));
  if (need < room - 0.5) holdRoom(s, need);
}
// The scroller at `want`, with room at its end if it's shorter than that
// (measured again after each try: a page shorter than the screen grows only
// past the screen's height).
function place(s, want) {
  const max = s.scrollHeight - s.clientHeight;
  let r = Math.max(0, want - (max - roomOf(s)));
  for (let i = 0; i < 3; i++) {
    holdRoom(s, r);
    const short = want - (s.scrollHeight - s.clientHeight);
    if (short < 1 || !r) break;
    r += short;
  }
  if (Math.abs(s.scrollTop - want) >= 1) s.scrollTop = want;
}
// Moved by the code that drew (it scrolled on purpose: to the top, to a
// section), not by the page getting shorter under it.
function scrolledByCode(s, was) {
  const max = s.scrollHeight - s.clientHeight;
  return Math.abs(s.scrollTop - was) > 1 && !(s.scrollTop < was && s.scrollTop >= max - 1);
}

function restore(s) {
  const st = held.get(s);
  if (!st || !s.isConnected) return held.delete(s);
  // At the top: nothing above to lose.
  if (st.top < 1) return anchor(s);
  if (scrolledByCode(s, st.top)) return anchor(s);
  // Where the anchor is in the scroller now (its place on screen, plus how far it's scrolled), so it sits where it sat.
  const a = findAnchor(s, st);
  place(s, Math.max(0, a ? a.node.getBoundingClientRect().top + s.scrollTop - a.y : st.top));
  anchor(s);
}

// ---- The tapped control stays under the finger ----
const CONTROL = 'button, a[href], [role="tab"], [role="button"], [role="switch"], label, summary, input, select, textarea';
// The scroller a node scrolls in: the nearest box that scrolls up and down, else the page.
function scrollerOf(n) {
  for (let k = n.parentElement; k && k !== document.body && k !== document.documentElement; k = k.parentElement) {
    if (k.scrollHeight > k.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(k).overflowY)) return k;
  }
  return document.scrollingElement;
}
function noteTap(target) {
  tap = null;
  if (!(target instanceof Element) || target === document.documentElement || target === document.body) return;
  let n = target.closest(CONTROL) || target;
  // (In a drawing, the drawing: a car on the map, a chart.)
  while (n.ownerSVGElement) n = n.ownerSVGElement;
  const s = rootOf(scrollerOf(n));
  // Pinned or laid over (the tab bar, a stuck day strip, a floating
  // button): it never moves with the page; what was in view keeps its place instead.
  for (let k = n; k && k !== s && k !== document.body; k = k.parentElement) if (looseNode(k)) return void (s.scrollTop > 0 && anchor(s));
  const r = n.getBoundingClientRect();
  if (!r.height) return;
  tap = { s, node: n, sig: sigOf(n), y: r.top, off: r.top - viewTop(s) + s.scrollTop, top: s.scrollTop, at: Date.now() };
  // (And the view's own anchor, read now: a change above the control keeps that instead.)
  if (s.scrollTop > 0) anchor(s);
}
const tapLive = () => tap && Date.now() - tap.at < GESTURE_MS && tap.s.isConnected && lastScroll <= tap.at;
function keepTap(t) {
  const s = t.s;
  if (scrolledByCode(s, t.top)) {
    tap = null;
    return anchor(s);
  }
  const n = t.node.isConnected && shown(t.node) ? t.node : standIn(s, { node: t.node, sig: t.sig, y: t.y }, true);
  // Gone (a part with no such control), or grown above it (a list opened over its 再看): the view's place.
  const off = n ? n.getBoundingClientRect().top - viewTop(s) + s.scrollTop : 0;
  if (!n || off > t.off + 1) {
    if (held.has(s)) restore(s);
    return;
  }
  t.node = n;
  place(s, Math.max(0, s.scrollTop + n.getBoundingClientRect().top - t.y));
  t.top = s.scrollTop;
  if (s.scrollTop > 0) anchor(s);
}

// ---- A sheet keeps its height while open ----
// The tallest it has been (--q-sheet-floor, its min-height in orbit.css,
// never past the screen); a sheet with a detent has its own height. Reset
// when the screen changes size (turned, the keyboard).
const floored = new WeakSet();
function floorSheet(d) {
  if (floored.has(d) || typeof ResizeObserver === 'undefined') return;
  floored.add(d);
  new ResizeObserver(() => {
    // (Closed: the next opening starts from its own height.)
    if (!d.open) {
      d.__qFloor = 0;
      d.style.removeProperty('--q-sheet-floor');
      return;
    }
    if (d.hasAttribute('data-detent') || d.classList.contains('q-leaving')) return;
    const h = d.offsetHeight;
    if (h > (d.__qFloor || 0) + 0.5) {
      d.__qFloor = h;
      d.style.setProperty('--q-sheet-floor', `${h}px`);
    }
  }).observe(d);
}
const unfloor = () => {
  for (const d of document.querySelectorAll('dialog.q-sheet')) {
    d.__qFloor = 0;
    d.style.removeProperty('--q-sheet-floor');
  }
};

if (typeof document !== 'undefined' && typeof MutationObserver !== 'undefined' && !globalThis.__orbitHoldPlace) {
  globalThis.__orbitHoldPlace = true;
  addEventListener('pointerdown', ev => ((lastGesture = Date.now()), noteTap(ev.target)), true);
  // (The window counts from the finger lifting: a slow swipe's day lands after it.)
  addEventListener('pointerup', () => ((lastGesture = Date.now()), tap && (tap.at = Date.now())), true);
  // Typing: the field stays where it is while what it finds changes under it.
  addEventListener('keydown', ev => ((lastGesture = Date.now()), noteTap(ev.target)), true);
  addEventListener('wheel', () => ((lastGesture = Date.now()), (tap = null)), { capture: true, passive: true });
  addEventListener('touchstart', () => (touching++, (lastGesture = Date.now())), { capture: true, passive: true });
  const lift = () => {
    touching = Math.max(0, touching - 1);
    lastGesture = Date.now();
    if (tap) tap.at = Date.now();
  };
  addEventListener('touchend', lift, { capture: true, passive: true });
  addEventListener('touchcancel', lift, { capture: true, passive: true });
  addEventListener('resize', unfloor);
  globalThis.visualViewport?.addEventListener('resize', unfloor);
  // Any scroller the person moves is held from then on; its anchor read once the scroll settles.
  const settle = new Map();
  addEventListener(
    'scroll',
    ev => {
      const s = rootOf(ev.target === document ? document.scrollingElement : ev.target);
      if (!s || s.nodeType !== 1) return;
      const st = held.get(s);
      if (st && st.top === s.scrollTop) return;
      if (!st && !s.scrollTop) return;
      lastScroll = Date.now();
      clearTimeout(settle.get(s));
      settle.set(
        s,
        setTimeout(() => {
          settle.delete(s);
          if (s.isConnected) s.scrollTop > 0 ? anchor(s) : (held.delete(s), trimRoom(s));
        }, SCROLL_IDLE_MS)
      );
    },
    { capture: true, passive: true }
  );
  // After every change to what's shown (the redraw's own task done, before
  // the frame is painted): the tapped control kept under the finger, then
  // each held scroller it touched put back.
  const touched = (s, list) => (isPage(s) ? list.some(m => !m.target.closest?.('dialog[open]') || m.target === document.body) : list.some(m => s.contains(m.target)));
  new MutationObserver(list => {
    for (const m of list) for (const n of m.addedNodes) if (n.nodeName === 'DIALOG' && n.classList.contains('q-sheet')) floorSheet(n);
    const t = tapLive() ? tap : null;
    if (t && !settle.has(t.s) && touched(t.s, list)) keepTap(t);
    if (!held.size) return;
    if (theirs() || touching) {
      for (const s of held.keys()) (t && s === t.s) || settle.has(s) || (s.isConnected ? anchor(s) : held.delete(s));
      return;
    }
    for (const s of [...held.keys()]) {
      if (settle.has(s)) continue;
      if (!s.isConnected) {
        held.delete(s);
        continue;
      }
      if (touched(s, list)) restore(s);
    }
  }).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden'] });
}
