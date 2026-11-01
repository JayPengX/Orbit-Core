// ---- A live redraw never moves the page (Jay 2026-11-01, again) ----
// Every app redraws while it's open: a game's score every few seconds, a
// list's live rows, a board's arrivals, a quote. iPhone's Safari has no
// scroll anchoring (Chromium's keeps what you read in place when the page
// above it changes; Safari's doesn't), and a page made shorter for a moment
// (a card swapped, a spinner where a list was) pulls the scroll up to fit,
// never back down: the person reading lost their place, or went to the top.
//
// So the kit holds the place itself, for every app at once, whatever drew:
//   - every scroller the person scrolled (the page, a sheet, a panel) keeps
//     what's under the top of its view (an anchor: that element, its
//     ancestors, and a signature to find its stand-in when a redraw made a
//     new one), and where it sat;
//   - after any change to its contents that the person didn't make (no tap,
//     key or scroll just before), the anchor is put back where it was;
//   - a page that got shorter than where the person was gets the room back
//     at its end (held until they next touch it), so it never jumps up;
//   - beats (everyDev) wait while a finger is on the screen or a scroll
//     still runs: iOS stops a fling whose content is swapped under it.
// Apps still draw in place where they can (put(): the same nodes kept);
// this is the floor under every redraw, not a reason to rebuild.

const GESTURE_MS = 900;
const SCROLL_IDLE_MS = 250;
let touching = 0;
let lastGesture = 0;
let lastScroll = 0;

// A scroll still running, or a finger on the screen: a live redraw waits.
export const scrollBusy = () => touching > 0 || Date.now() - lastScroll < SCROLL_IDLE_MS;
// The person did something just now: a change after it is theirs (a tab, a chip, a row opened).
const theirs = () => Date.now() - lastGesture < GESTURE_MS;

// What an element says, without what a live redraw changes (scores, clocks,
// counts: every digit), for finding the same row in a list drawn anew.
export function signature(tag, cls, text) {
  return `${String(tag || '').toLowerCase()}|${String(cls || '').trim().split(/\s+/).filter(c => c && !/^(fade|is-|q-flash|live|on|now)/.test(c)).sort().join('.')}|${String(text || '').replace(/[\d\s:'’.,+\-–%]/g, '').slice(0, 60)}`;
}
const sigOf = n => signature(n.tagName, n.getAttribute?.('class'), n.textContent);

const rootOf = s => (s === document.scrollingElement || s === document.documentElement || s === document.body ? document.scrollingElement : s);
const viewTop = s => (s === document.scrollingElement ? 0 : s.getBoundingClientRect().top);
const isPage = s => s === document.scrollingElement;

// scroller -> { top, anchors: [{ node, sig, y }] }
const held = new Map();

// What sits under the top of the view (a little in, past a sticky bar): the
// element there and up to six ancestors inside the scroller.
function anchor(s) {
  const top = viewTop(s);
  const box = isPage(s) ? { left: 0, width: innerWidth, height: innerHeight } : s.getBoundingClientRect();
  const x = box.left + box.width / 2;
  const h = isPage(s) ? innerHeight : s.clientHeight;
  let n = null;
  for (const f of [0.3, 0.45, 0.6]) {
    n = document.elementFromPoint(x, top + h * f);
    if (n && n !== s && s.contains(n)) break;
    n = null;
  }
  const anchors = [];
  for (let k = n; k && k !== s && k !== document.body && anchors.length < 7; k = k.parentElement) {
    const r = k.getBoundingClientRect();
    if (r.height < 8) continue;
    anchors.push({ node: k, sig: sigOf(k), y: r.top });
  }
  held.set(s, { top: s.scrollTop, anchors });
}

// The anchor's stand-in after a redraw: itself, or the element with its
// signature nearest where it was; else the nearest ancestor still there.
function findAnchor(s, st) {
  // (Only what's drawn: a hidden tab's row has no place to keep.)
  const shown = n => n.getClientRects().length > 0;
  for (const a of st.anchors) {
    if (a.node.isConnected && s.contains(a.node)) {
      if (shown(a.node)) return a;
      continue;
    }
    // (A stand-in only by what it says: an empty box's twin is anywhere.)
    if (a.sig.split('|')[2].length < 2) continue;
    const cls = a.node.classList?.[0];
    const same = [...s.querySelectorAll(cls ? `${a.node.tagName}.${CSS.escape(cls)}` : a.node.tagName)].filter(n => sigOf(n) === a.sig && shown(n));
    if (!same.length) continue;
    let best = same[0];
    let gap = Infinity;
    for (const n of same) {
      const d = Math.abs(n.getBoundingClientRect().top - a.y);
      if (d < gap) (gap = d), (best = n);
    }
    return { ...a, node: best };
  }
  return null;
}

// Room held at a scroller's end so a shorter page can't pull it up.
function holdRoom(s, px) {
  const host = isPage(s) ? document.body : s;
  if (px > 0) {
    host.classList.add('q-hold-room');
    host.style.setProperty('--q-hold-room', `${Math.ceil(px)}px`);
  } else if (host.classList.contains('q-hold-room')) {
    host.classList.remove('q-hold-room');
    host.style.removeProperty('--q-hold-room');
  }
}
const releaseRoom = () => {
  for (const n of document.querySelectorAll('.q-hold-room')) {
    n.classList.remove('q-hold-room');
    n.style.removeProperty('--q-hold-room');
  }
};

function restore(s) {
  const st = held.get(s);
  if (!st || !s.isConnected) return held.delete(s);
  // At the top: nothing above to lose.
  if (st.top < 1) return anchor(s);
  const host = isPage(s) ? document.body : s;
  const room = parseFloat(host.style.getPropertyValue('--q-hold-room')) || 0;
  const max = s.scrollHeight - s.clientHeight;
  // Moved by the code that drew (it scrolled on purpose), or by the browser's own anchoring: taken as it is.
  if (Math.abs(s.scrollTop - st.top) > 1 && !(s.scrollTop < st.top && s.scrollTop >= max - 1)) return anchor(s);
  // Where the anchor is in the scroller now (its place on screen, plus how far it's scrolled), so it sits where it sat.
  const a = findAnchor(s, st);
  const want = Math.max(0, a ? a.node.getBoundingClientRect().top + s.scrollTop - a.y : st.top);
  // Shorter than that: room at the end, only as much as it lacks (none once it's long again).
  // (Measured again after each try: a page shorter than the screen grows only past the screen's height.)
  let r = Math.max(0, want - (max - room));
  for (let i = 0; i < 3; i++) {
    holdRoom(s, r);
    const short = want - (s.scrollHeight - s.clientHeight);
    if (short < 1 || !r) break;
    r += short;
  }
  if (Math.abs(s.scrollTop - want) >= 1) s.scrollTop = want;
  anchor(s);
}

if (typeof document !== 'undefined' && typeof MutationObserver !== 'undefined' && !globalThis.__orbitHoldPlace) {
  globalThis.__orbitHoldPlace = true;
  const gesture = () => {
    lastGesture = Date.now();
    releaseRoom();
  };
  addEventListener('pointerdown', gesture, true);
  addEventListener('keydown', gesture, true);
  addEventListener('wheel', () => ((lastGesture = Date.now()), releaseRoom()), { capture: true, passive: true });
  addEventListener('touchstart', () => (touching++, gesture()), { capture: true, passive: true });
  const lift = () => {
    touching = Math.max(0, touching - 1);
    lastGesture = Date.now();
  };
  addEventListener('touchend', lift, { capture: true, passive: true });
  addEventListener('touchcancel', lift, { capture: true, passive: true });
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
          if (s.isConnected) s.scrollTop > 0 ? anchor(s) : held.delete(s);
        }, SCROLL_IDLE_MS)
      );
    },
    { capture: true, passive: true }
  );
  // After every change to what's shown (the redraw's own task done, before
  // the frame is painted): each held scroller it touched, put back.
  new MutationObserver(list => {
    if (!held.size) return;
    if (theirs() || touching) {
      for (const s of held.keys()) settle.has(s) || (s.isConnected ? anchor(s) : held.delete(s));
      return;
    }
    for (const s of [...held.keys()]) {
      if (settle.has(s)) continue;
      if (!s.isConnected) {
        held.delete(s);
        continue;
      }
      if (isPage(s) ? list.some(m => !m.target.closest?.('dialog[open]') || m.target === document.body) : list.some(m => s.contains(m.target))) restore(s);
    }
  }).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden'] });
}
