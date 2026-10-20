// ---- kit/ui.mjs: iOS 27's controls, built the same in every app ----
// The pieces the kit's stylesheet draws (quadra.css, "Components") as DOM,
// with what makes them move: a segmented control whose thumb slides on a
// spring, a sheet that rises from the foot (dragged down to close: the
// kit's sheetSwipe), a menu that grows out of its button, a toast, an
// inset-grouped list and its cells, a search field, a switch, an empty
// state. Apps use these instead of their own; a truly custom view (a
// pitch, a map, a chart) stays the app's.
//
//   import { segmented, sheet, menu, toast, list, cell, search, toggle, empty, view } from '#kit/ui.mjs';
//   and icons, tile, pageHead, rowCard, tag, rail, stats, section, sectionHead, logoTile,
//   matchCard, liveStrip, actionGrid, sheetHero, sheetFoot, confirm, stakeInput, stockRow,
//   ballRow, placeTile, progressRing, monthCalendar, panelGrid, leagueTile, ready (lift the
//   loading screen); toast's action / batch and segmented's count (see each below).

// { tab: 'ipo' } as data-tab="ipo" attributes (a builder's `data`, for taps wired by delegation).
// (By path, not #kit/: a page whose import map predates format.mjs still loads ui.mjs.)
import { DASH, pct, price as fmtPrice } from './format.mjs';

const dataProps = (data = null) => Object.fromEntries(Object.entries(data || {}).filter(([, v]) => v != null && v !== false).map(([k, v]) => [`data-${String(k).replace(/[^a-z0-9-]/gi, '')}`, v === true ? '' : String(v)]));
const reduced = () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// An element: h('div', { class, onclick, … }, [children]). Text children
// are text; null and false are skipped.
export function h(tag, props = {}, children = []) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k === 'text') n.textContent = v;
    else if (k === 'html') n.innerHTML = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(n.style, v);
    else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of [].concat(children)) if (c != null && c !== false) n.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return n;
}

// A haptic tick where the phone gives one: the kit's own (globalThis.
// quadraHaptic, iOS's switch trick) and a short vibration where allowed
// (Android; iOS has none, so it's never felt twice).
export function tick() {
  try {
    globalThis.quadraHaptic?.();
    globalThis.navigator?.vibrate?.(8);
  } catch {}
}

// ---- Segmented control ----
// The badge's text: a count above 0 (99+ from a hundred), else nothing.
export const segCount = n => (Number.isFinite(n) && n > 0 ? (n > 99 ? '99+' : String(Math.floor(n))) : '');
const segBadge = n => (segCount(n) ? h('span', { class: 'q-seg-count', text: segCount(n) }) : null);
// items: [{ id, label }]; value: the chosen id; onChange(id). The thumb
// slides to the chosen one (--q-seg-i); a finger dragged along it moves
// the choice with it, as iOS's does. An item may carry a `count` (a number):
// a small badge after its label; 0, null and anything else are not drawn.
export function segmented(items, { value = items[0]?.id, onChange = () => {}, big = false, label = '' } = {}) {
  const root = h('div', { class: `q-seg${big ? ' big' : ''}`, role: 'tablist', ...(label ? { 'aria-label': label } : {}) });
  root.style.setProperty('--q-seg-n', String(items.length));
  let current = value;
  const buttons = items.map((it, i) =>
    h('button', { type: 'button', role: 'tab', 'data-id': it.id, onclick: () => choose(it.id) }, [it.label, segBadge(it.count)])
  );
  const paint = () => {
    const i = Math.max(0, items.findIndex(it => it.id === current));
    root.style.setProperty('--q-seg-i', String(i));
    buttons.forEach((b, j) => b.setAttribute('aria-selected', String(j === i)));
  };
  const choose = id => {
    if (id === current) return;
    current = id;
    paint();
    tick();
    onChange(id);
  };
  // Dragged along the track: the choice follows the finger.
  root.addEventListener('pointermove', e => {
    if (e.pointerType !== 'touch' || !e.buttons) return;
    const r = root.getBoundingClientRect();
    const i = Math.min(items.length - 1, Math.max(0, Math.floor(((e.clientX - r.left) / r.width) * items.length)));
    if (items[i].id !== current) choose(items[i].id);
  });
  root.append(...buttons);
  paint();
  return Object.assign(root, {
    set(id) {
      current = id;
      paint();
    },
    get value() {
      return current;
    }
  });
}

// ---- Sheet ----
// THE sheet (the Pass is this too): a dialog from the foot,
//   sheet({ title, body, onClose, cls, lead, trailing, detent, foot, closeLabel, label })
// title (text, or a node), centred; lead: a node on its left (a ☆ say);
// trailing: a node on its right in place of the ✕ (a Done: its button
// calls close()); detent 'medium' (about half the screen, dragged up to
// large) | 'large' (the screen less its top inset, as iOS's); foot: a node
// stuck to the bottom above the safe area (sheetFoot()); body: nodes.
// Returns { el, close, head, setDetent }. The ✕, Escape, a tap on the
// dimmed page and a swipe down all close it the same way (quadra.mjs's
// closeSheet: it slides to the foot), and onClose fires once.
const DETENTS = ['medium', 'large'];
// A sheet's size: 'medium' (half the screen) or 'large' (full less the top).
// A sheet opened medium stays expandable (data-expandable), and the swipe in
// quadra.mjs moves it between the two.
export function setSheetDetent(d, detent) {
  if (!DETENTS.includes(detent)) return;
  d.setAttribute('data-detent', detent);
}
// Closing, wired onto any <dialog class="q-sheet">, one the app wrote as HTML
// as well as the builder's. A [data-q-close] inside closes it.
// Returns close().
export function bindSheet(d, { onClose = () => {} } = {}) {
  let done = false;
  const shut = () => {
    if (done) return;
    // (quadra.mjs's closeSheet: the slide down, every app's sheets alike.)
    (globalThis.quadraCloseSheet || (x => x.close()))(d);
  };
  d.addEventListener('close', () => {
    if (done) return;
    done = true;
    d.remove();
    onClose();
  });
  // Escape: the browser would drop it at once; it slides away like the rest.
  d.addEventListener('cancel', e => {
    e.preventDefault?.();
    shut();
  });
  d.addEventListener('click', e => {
    if (e.target === d) {
      const r = d.getBoundingClientRect();
      if (e.clientY < r.top || e.clientY > r.bottom || e.clientX < r.left || e.clientX > r.right) shut();
    } else if (e.target?.closest?.('[data-q-close]')) shut();
  });
  return shut;
}
export function sheet({ title = '', body = [], onClose = () => {}, cls = '', lead = null, trailing = null, detent = '', foot = null, closeLabel = '關閉', label = '', subtitle = '' } = {}) {
  const d = h('dialog', { class: `q-sheet ${cls}`.trim(), 'aria-label': label || (typeof title === 'string' ? title : '') || null });
  if (foot) d.classList.add('q-has-foot');
  if (DETENTS.includes(detent)) {
    setSheetDetent(d, detent);
    if (detent === 'medium') d.setAttribute('data-expandable', '');
  }
  const close = h('button', { class: 'q-close', type: 'button', 'aria-label': closeLabel, 'data-q-close': '', text: '✕' });
  const head = h('div', { class: 'q-sheet-head' }, [lead || h('span'), h('h2', {}, [title]), subtitle ? h('small', { class: 'q-sheet-sub', text: String(subtitle) }) : null, trailing || close]);
  d.append(head, ...[].concat(body).filter(Boolean));
  if (foot) d.append(foot);
  const shut = bindSheet(d, { onClose });
  document.body.append(d);
  d.showModal();
  return { el: d, close: shut, head, setDetent: x => setSheetDetent(d, x) };
}

// ---- Menu ----
// items: [{ label, icon?, danger?, onClick } | 'divider'] from `anchor`:
// glass that grows out of it, closed by a choice, a tap elsewhere or Escape.
export function menu(anchor, items) {
  document.querySelector('.q-menu')?.remove();
  const m = h('div', { class: 'q-menu', role: 'menu' });
  for (const it of items) {
    if (it === 'divider') m.append(h('hr'));
    else
      m.append(
        h('button', { type: 'button', role: 'menuitem', class: it.danger ? 'danger' : '', onclick: () => (shut(), it.onClick?.()) }, [h('span', { text: it.label }), it.icon ? h('span', { 'aria-hidden': 'true', text: it.icon }) : null])
      );
  }
  document.body.append(m);
  const r = anchor.getBoundingClientRect();
  const w = m.offsetWidth;
  const left = Math.min(Math.max(16, r.right - w), innerWidth - w - 16);
  const below = r.bottom + 8 + m.offsetHeight < innerHeight - 16;
  Object.assign(m.style, { left: `${left}px`, top: below ? `${r.bottom + 8}px` : `${Math.max(16, r.top - 8 - m.offsetHeight)}px` });
  m.style.setProperty('--q-menu-origin', `${r.left + r.width / 2 - left}px ${below ? '0' : '100%'}`);
  const off = e => {
    if (!m.contains(e.target)) shut();
  };
  const key = e => e.key === 'Escape' && shut();
  setTimeout(() => (document.addEventListener('pointerdown', off, true), document.addEventListener('keydown', key)));
  function shut() {
    document.removeEventListener('pointerdown', off, true);
    document.removeEventListener('keydown', key);
    if (reduced()) return m.remove();
    m.classList.add('out');
    setTimeout(() => m.remove(), 220);
  }
  return { el: m, close: shut };
}

// ---- Toast ----
// A glass capsule over the tab bar for a moment: text, { tone: 'bad', ms }.
// `action: { label, onTap }` adds a button after the text (Undo, Open): a tap
// runs onTap and closes the toast. `batch: key` stops toasts stacking: one
// with the same key replaces the one shown, and the same text again while
// it's still up shows ×2, ×3… (the time restarts). Without them it is as it
// always was: one toast at a time, the newest.
let lastToast = null;
export function toast(text, { tone = '', ms = 2200, action = null, batch = '' } = {}) {
  const prev = lastToast;
  const again = Boolean(batch) && prev?.key === batch && prev.el.isConnected !== false && !prev.el.classList?.contains('out');
  const n = again && prev.text === text ? prev.n + 1 : 1;
  if (again) {
    clearTimeout(prev.timer);
    clearTimeout(prev.gone);
    prev.el.remove();
  }
  document.querySelector('.q-toast')?.remove();
  const label = n > 1 ? `${text} ×${n}` : text;
  const t = h('div', { class: `q-toast${tone ? ` ${tone}` : ''}`, role: 'status', ...(action || n > 1 ? {} : { text }) });
  const mine = { el: t, key: batch, text, n, timer: 0, gone: 0 };
  const close = () => {
    clearTimeout(mine.timer);
    t.classList.add('out');
    mine.gone = setTimeout(() => t.remove(), 320);
  };
  if (action || n > 1) {
    t.append(h('span', { class: 'q-toast-text', text: label }));
    if (action) {
      t.append(
        h('button', {
          type: 'button',
          class: 'q-toast-action',
          text: action.label,
          onclick: () => {
            close();
            action.onTap?.();
          }
        })
      );
    }
  }
  document.body.append(t);
  mine.timer = setTimeout(close, ms);
  lastToast = batch ? mine : null;
  return t;
}

// ---- Loading screen ----
// Lifts the app's loading cover (#loading, drawn by boot.js) when its first
// screen is ready: ready(firstScreen, { max }). firstScreen is a promise (or
// a function returning one) for the data the first screen needs; the cover
// goes when it settles (done or failed: a broken fetch still shows the
// screen's own empty state) or after `max` ms, whichever comes first, so a
// slow network never keeps the person on the logo. The cover fades for a
// moment, then gets `hidden` (what the kit's scroll restore and the tests
// watch for). Resolves once it is lifted; calling it again does nothing.
export function ready(firstScreen, { max = 4000 } = {}) {
  const lift = () => {
    const box = document.getElementById('loading');
    if (!box || box.hidden) return;
    if (reduced() || typeof setTimeout !== 'function') return box.setAttribute('hidden', '');
    box.classList.add('q-lift');
    setTimeout(() => box.setAttribute('hidden', ''), 220);
  };
  let first;
  try {
    first = Promise.resolve(typeof firstScreen === 'function' ? firstScreen() : firstScreen).catch(() => {});
  } catch {
    first = Promise.resolve();
  }
  let timer;
  const late = new Promise(done => (timer = setTimeout(done, max)));
  return Promise.race([first, late]).then(() => {
    clearTimeout(timer);
    lift();
  });
}

// ---- Lists ----
// A cell: { icon, tint, title, sub, value, chevron, onClick, danger, href, trailing }.
export function cell({ icon = null, tint = '', title = '', sub = '', value = '', chevron = false, onClick = null, danger = false, href = '', trailing = null } = {}) {
  const tag = href ? 'a' : onClick ? 'button' : 'div';
  const c = h(tag, { class: `q-cell${chevron ? ' chevron' : ''}${danger ? ' danger' : ''}`, ...(tag === 'button' ? { type: 'button' } : {}), ...(href ? { href } : {}), ...(onClick ? { onclick: onClick } : {}) });
  if (icon) {
    const i = h('span', { class: 'q-cell-icon', 'aria-hidden': 'true' });
    if (tint) i.style.setProperty('--q-cell-tint', tint);
    if (typeof icon === 'string' && icon.trim().startsWith('<svg')) i.innerHTML = icon;
    else i.append(icon);
    c.append(i);
  }
  c.append(h('span', { class: 'q-cell-text' }, [h('span', { text: title }), sub ? h('small', { text: sub }) : null]));
  if (value !== '' && value != null) c.append(h('span', { class: 'q-cell-value', text: String(value) }));
  if (trailing) c.append(trailing);
  return c;
}
// A grouped list: rows (cells), with a header and footer line.
export function list(rows, { head = '', foot = '', big = false } = {}) {
  const frag = h('section', { class: 'q-list-group' });
  if (head) frag.append(h('h3', { class: `q-list-head${big ? ' big' : ''}`, text: head }));
  frag.append(h('div', { class: 'q-list' }, rows));
  if (foot) frag.append(h('p', { class: 'q-list-foot', text: foot }));
  return frag;
}

// ---- Search field ----
export function search({ placeholder = '搜尋', value = '', onInput = () => {}, onSubmit = null, label = placeholder } = {}) {
  const input = h('input', { type: 'search', placeholder, 'aria-label': label, enterkeyhint: 'search', autocomplete: 'off', autocorrect: 'off', spellcheck: 'false' });
  input.value = value;
  const clear = h('button', { class: 'q-search-clear', type: 'button', 'aria-label': '清除', text: '✕', onclick: () => ((input.value = ''), input.focus(), onInput('')) });
  input.addEventListener('input', () => onInput(input.value));
  if (onSubmit) input.addEventListener('keydown', e => e.key === 'Enter' && onSubmit(input.value));
  const box = h('label', { class: 'q-search' }, [input, clear]);
  return Object.assign(box, { input });
}

// ---- Switch ----
export function toggle({ checked = false, onChange = () => {}, label = '' } = {}) {
  const b = h('button', { class: 'q-switch', type: 'button', role: 'switch', 'aria-checked': String(Boolean(checked)), ...(label ? { 'aria-label': label } : {}) });
  b.addEventListener('click', () => {
    const on = b.getAttribute('aria-checked') !== 'true';
    b.setAttribute('aria-checked', String(on));
    tick();
    onChange(on);
  });
  return b;
}

// ---- Nothing here ----
// empty({ icon, tint, title, body, action }): iOS's ContentUnavailableView, one
// way everywhere. `icon` is a key of `icons` ('ticket': a 56px colour tile,
// `tint` its colour, the app's accent unless given) or anything else (an old
// emoji: the grey disc it always was). One line of title, an optional line
// of body, one button: `action` is { label, onTap | href, data } (a .q-btn.primary;
// `data`: data-* attributes for a tap wired by delegation) or a node the app made.
// (No icon given: the list's own, so an empty state is never a bare sentence.)
export function empty({ icon = 'list', tint = '', title = '', body = '', action = null } = {}) {
  const mark = !icon ? null : isIcon(icon) ? tinted(h('span', { class: 'q-tile q-empty-tile', 'aria-hidden': 'true', html: icons[icon] }), tint || 'var(--q-accent)') : h('span', { class: 'q-empty-icon', 'aria-hidden': 'true', text: icon });
  const button = action && !(action instanceof Node) ? h(action.href ? 'a' : 'button', { class: 'q-btn primary', ...(action.href ? { href: action.href } : { type: 'button', onclick: action.onTap }), ...dataProps(action.data), text: action.label || '' }) : action;
  return h('div', { class: 'q-empty' }, [mark, title ? h('strong', { text: title }) : null, body ? h('p', { text: body }) : null, button]);
}

// ---- A large title that collapses into the bar (iOS's navigation title) ----
// navTitle('賽程', { scroller }) is the 34pt title at a tab's top; scrolled
// up under the top of the screen, a small centred title fades into a glass
// bar there (.q-navbar, one for the page). For a tab that isn't the first:
// the first tab has no large title (it opens straight onto content).
// `scroller`: the element that scrolls, when it isn't the page. Returns the
// <h1>: put it in the tab's panel, setTitle(text) renames it, and it lets go
// of the bar by itself when it leaves the page (or dispose()).
// Wide screens keep the bar where it was: there the title just scrolls away.
let navbar = null;
let navOwner = null;
const navWatched = new Set();
let navMO = null;
const navBar = () => {
  if (navbar?.isConnected) return navbar;
  navbar = h('div', { class: 'q-navbar', 'aria-hidden': 'true' }, [h('span', { class: 'q-navbar-title' })]);
  document.body.append(navbar);
  return navbar;
};
// A title whose element left the page stops watching (one that was never put
// in the page is let go of after a while).
const navSweep = () => {
  for (const w of [...navWatched]) {
    if (w.el.isConnected) w.seen = true;
    else if (w.seen) w.stop();
  }
  if (!navWatched.size) {
    navMO?.disconnect();
    navMO = null;
  }
};
export function bindNavTitle(el, { scroller = null } = {}) {
  if (typeof IntersectionObserver !== 'function') return Object.assign(el, { dispose() {}, setTitle: t => void (el.textContent = t) });
  const token = {};
  let io = null;
  const set = on => {
    const b = navBar();
    if (on) {
      navOwner = token;
      b.firstChild.textContent = el.textContent;
      b.classList.add('on');
    } else if (navOwner === token) {
      navOwner = null;
      b.classList.remove('on');
    }
  };
  const observe = () => {
    io?.disconnect();
    // The top of the screen to the bar's foot is where a title is "under".
    const under = Math.max(0, Math.round((navBar().getBoundingClientRect().height || 44) - (scroller ? scroller.getBoundingClientRect().top : 0)));
    io = new IntersectionObserver(
      entries => {
        const e = entries[entries.length - 1];
        const r = e.boundingClientRect;
        // Collapsed: gone off the top (not below the fold, not a hidden tab's empty box).
        set(!e.isIntersecting && r.height > 0 && r.bottom <= (e.rootBounds ? e.rootBounds.top : under) + 1);
      },
      { root: scroller, rootMargin: `-${under}px 0px 0px 0px`, threshold: 0 }
    );
    io.observe(el);
  };
  // A title hidden with its tab (display:none while already scrolled off) gets
  // no intersection change, so the bar would keep its name: its box going
  // lets the bar go, its box coming back asks again (scrolled off or not).
  let boxed = true;
  const ro =
    typeof ResizeObserver === 'function'
      ? new ResizeObserver(() => {
          const now = el.getClientRects().length > 0;
          if (now === boxed) return;
          boxed = now;
          if (!now) set(false);
          else observe();
        })
      : null;
  ro?.observe(el);
  const w = {
    el,
    seen: false,
    stop() {
      ro?.disconnect();
      io?.disconnect();
      io = null;
      set(false);
      navWatched.delete(w);
      globalThis.removeEventListener?.('resize', observe);
    }
  };
  navWatched.add(w);
  if (!navMO && typeof MutationObserver === 'function') {
    navMO = new MutationObserver(navSweep);
    navMO.observe(document.body, { childList: true, subtree: true });
  }
  setTimeout(() => !w.seen && !el.isConnected && w.stop(), 10_000);
  globalThis.addEventListener?.('resize', observe);
  observe();
  return Object.assign(el, {
    dispose: w.stop,
    setTitle(t) {
      el.textContent = t;
      if (navOwner === token) navBar().firstChild.textContent = t;
    }
  });
}
export function navTitle(title = '', { scroller = null } = {}) {
  return bindNavTitle(h('h1', { class: 'q-nav-title', 'data-q-nav': '', text: title }), { scroller });
}

// ---- Pull to refresh (iOS's) ----
// The finger dragged down from the top of the page: a glass spinner follows it
// with a rubber band, a tick as it passes the threshold, and letting go then
// calls onRefresh() (it may return a promise: the spinner turns until it
// settles). Not while a sheet is open, a load is running (`disabled()`), or
// the finger started in a sideways list, a field or a scrolled box. Returns
// stop(). quadra.mjs's topActions does this for any app that has a refresh.
const PTR_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19.5 11.5a7.5 7.5 0 1 0-2.2 5.4"/><path d="M19.5 4.5v7h-7"/></svg>';
// How far the spinner is drawn for a finger pulled `dy`: 1:1 at first, never past `max`.
export const rubber = (dy, max = 90) => (dy > 0 ? max * (1 - Math.exp(-dy / max)) : 0);
export function pullToRefresh(onRefresh, { threshold = 70, disabled = () => false, root = typeof document === 'undefined' ? null : document } = {}) {
  if (!root || typeof onRefresh !== 'function') return () => {};
  const top = () => (root.scrollingElement || root.documentElement || {}).scrollTop || 0;
  const skip = 'input, textarea, select, [contenteditable], .q-chips, .leaflet-container, [data-no-ptr]';
  let y0 = 0;
  let x0 = 0;
  let live = false;
  let pulling = false;
  let armed = false;
  let busy = false;
  let dot = null;
  let base = 0;
  // The page (its <main>) comes down with the finger, as iOS's does, and the
  // spinner shows in the gap it leaves under the top row.
  let page = null;
  const shift = (y, ease = false) => {
    if (!page) return;
    page.style.transition = ease ? 'transform 0.26s cubic-bezier(0.2, 0.8, 0.2, 1)' : 'none';
    page.style.transform = y ? `translateY(${Math.round(y)}px)` : '';
  };
  const place = (show, ease = false) => {
    if (!dot) return;
    dot.style.transform = `translate(-50%, ${Math.round(base + Math.max(0, show / 2 - 18))}px)`;
    dot.style.opacity = String(Math.min(1, show / 30));
    shift(show, ease);
  };
  const scrolledBox = t => {
    for (let n = t; n && n !== root.body && n !== root.documentElement; n = n.parentElement) {
      if (n.scrollTop > 0 && /auto|scroll/.test(globalThis.getComputedStyle?.(n).overflowY || '')) return true;
    }
    return false;
  };
  const begin = e => {
    live = false;
    if (busy || disabled() || e.touches.length !== 1 || top() > 0) return;
    if (root.querySelector('dialog[open], .loading:not([hidden])') || e.target.closest?.(skip) || scrolledBox(e.target)) return;
    [x0, y0, live, pulling, armed] = [e.touches[0].clientX, e.touches[0].clientY, true, false, false];
  };
  const move = e => {
    if (!live) return;
    const dy = e.touches[0].clientY - y0;
    const dx = e.touches[0].clientX - x0;
    if (!pulling) {
      // Sideways, up, or the page started to scroll: not a pull.
      if (Math.abs(dx) > Math.abs(dy) + 4 || dy < -4 || top() > 0) return void (live = false);
      if (dy < 8) return;
      pulling = true;
      base = root.querySelector('.q-appbar')?.getBoundingClientRect().bottom || 0;
      page = root.querySelector('main');
      dot = h('div', { class: 'q-ptr', 'aria-hidden': 'true', html: PTR_ICON });
      root.body.append(dot);
    }
    if (e.cancelable) e.preventDefault();
    const pulled = dy - 8;
    place(rubber(pulled));
    dot.style.setProperty('--r', `${Math.round(Math.min(1, pulled / threshold) * 270)}deg`);
    if (pulled >= threshold !== armed) {
      armed = pulled >= threshold;
      dot.classList.toggle('armed', armed);
      if (armed) tick();
    }
  };
  const retract = () => {
    const d = dot;
    dot = null;
    if (!d) return;
    d.classList.remove('hold');
    d.classList.add('out');
    d.style.opacity = '0';
    shift(0, true);
    const p = page;
    setTimeout(() => {
      d.remove();
      if (p && !dot) p.style.transition = '';
    }, 260);
  };
  const end = () => {
    const d = dot;
    const go = live && pulling && armed && d;
    live = false;
    pulling = false;
    if (!go) return retract();
    busy = true;
    d.classList.add('hold');
    place(48, true);
    d.style.opacity = '1';
    const t0 = Date.now();
    const done = () => setTimeout(() => ((busy = false), retract()), Math.max(0, 600 - (Date.now() - t0)));
    try {
      Promise.resolve(onRefresh()).then(done, done);
    } catch {
      done();
    }
  };
  root.addEventListener('touchstart', begin, { passive: true });
  root.addEventListener('touchmove', move, { passive: false });
  root.addEventListener('touchend', end);
  root.addEventListener('touchcancel', end);
  return () => {
    root.removeEventListener('touchstart', begin);
    root.removeEventListener('touchmove', move);
    root.removeEventListener('touchend', end);
    root.removeEventListener('touchcancel', end);
    shift(0);
    dot?.remove();
    dot = null;
  };
}

// ---- A change of view, cross-faded where Safari can (View Transitions) ----
export function view(change) {
  if (reduced() || !document.startViewTransition) return void change();
  document.startViewTransition(change);
}

// A segmented control drawn as HTML (an app that redraws a card whole):
// its thumb starts where it was (`from`) and slides to the choice the next
// frame. segHtml([[id, label, count?]…], on, { from, attr: id => attrs }) and,
// after the HTML is in the page, settleSegs(). A third entry is the count
// badge, as segmented's `count`.
export function segHtml(list, on, { from = on, attr = () => '', esc = s => String(s).replace(/[&<>"]/g, c => `&#${c.charCodeAt(0)};`) } = {}) {
  const i = Math.max(0, list.findIndex(([k]) => k === on));
  const j = Math.max(0, list.findIndex(([k]) => k === from));
  return `<div class="q-seg" role="tablist" style="--q-seg-n:${list.length};--q-seg-i:${j}" data-to="${i}">${list.map(([k, name, count]) => `<button type="button" role="tab" aria-selected="${k === on}" ${attr(k)}>${esc(name)}${segCount(count) ? `<span class="q-seg-count">${segCount(count)}</span>` : ''}</button>`).join('')}</div>`;
}
export function settleSegs(root = document) {
  // Each one's target read now: two calls in one redraw (an app settling
  // each of its controls) both hold a control, and the second, reading it
  // after the first had cleared it, set --q-seg-i to "undefined" (no place:
  // the thumb stuck on the first option whatever was picked).
  const segs = [...root.querySelectorAll('.q-seg[data-to]')].map(s => [s, s.dataset.to]);
  if (!segs.length) return;
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      for (const [s, to] of segs) {
        if (s.dataset.to !== to) continue;
        s.style.setProperty('--q-seg-i', to);
        delete s.dataset.to;
      }
    })
  );
}

// ---- HTML-string twins: the builders for apps that draw with template strings ----
// Same classes and structure as the DOM builder, returned as a string, every
// text escaped. A string can't hold a handler, so where the DOM builder takes
// onClick/onTap/onOpen the twin takes a value that it writes as a data-attribute
// (tap -> data-tap, open -> data-open); the app wires them on the container.
// Children (…Html options, arrays of strings) are markup already made by
// these or by the app; anything else is text and escaped here.
export const escHtml = s => String(s ?? '').replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
const E = escHtml;
const joinHtml = x => [].concat(x ?? []).filter(Boolean).join('');
// A CSS value in a style="" (a colour, a length, var(…)): nothing that could end the declaration.
const cssv = v => String(v).replace(/[;{}<>"'\\]/g, '');
const styleOf = (...pairs) => {
  const s = pairs.filter(([, v]) => v !== '' && v != null && v !== false).map(([k, v]) => `${k}:${E(cssv(v))}`).join(';');
  return s ? ` style="${s}"` : '';
};
const dataOf = (data = {}) => Object.entries(data || {}).filter(([, v]) => v != null && v !== false).map(([k, v]) => ` data-${String(k).replace(/[^a-z0-9-]/gi, '')}="${v === true ? '' : E(v)}"`).join('');
const clsOf = (...c) => c.filter(Boolean).join(' ');
// An svg string (the kit's icons) as it is, anything else as text.
const glyphHtml = x => (typeof x === 'string' && x.trim().startsWith('<svg') ? x : E(x));
const elOf = (href, tap, base) => (href ? ['a', ` href="${E(href)}"`] : tap != null ? ['button', ` type="button"${dataOf(base)}`] : ['div', '']);

export function tileHtml(icon, color = '', size = '') {
  return `<span class="${clsOf('q-tile', size && E(size))}" aria-hidden="true"${styleOf(['--t', color])}>${glyphHtml(icon)}</span>`;
}
const tagObjHtml = t => {
  const o = typeof t === 'string' ? { text: t } : t;
  return `<span class="${clsOf('q-tag', o.tone && E(o.tone))}"${styleOf(['--t', o.color])}>${E(o.text)}</span>`;
};
// tagHtml('直播', 'red') or tagHtml('3 天', '', '#hex').
export function tagHtml(text, tone = '', color = '') {
  return tagObjHtml({ text, tone: color ? `${tone} tint` : tone, color });
}
export function emptyHtml({ icon = 'list', tint = '', title = '', body = '', action = null } = {}) {
  const mark = !icon ? '' : isIcon(icon) ? `<span class="q-tile q-empty-tile" aria-hidden="true"${styleOf(['--t', tint || 'var(--q-accent)'])}>${icons[icon]}</span>` : `<span class="q-empty-icon" aria-hidden="true">${E(icon)}</span>`;
  const button = !action ? '' : typeof action === 'string' ? action : action.href ? `<a class="q-btn primary" href="${E(action.href)}"${dataOf(action.data)}>${E(action.label)}</a>` : `<button class="q-btn primary" type="button"${dataOf({ tap: action.tap, ...action.data })}>${E(action.label)}</button>`;
  return `<div class="q-empty">${mark}${title ? `<strong>${E(title)}</strong>` : ''}${body ? `<p>${E(body)}</p>` : ''}${button}</div>`;
}
// navTitleHtml(title), then wireNavTitles(root, { scroller }) once it's in the page.
export function navTitleHtml(title = '') {
  return `<h1 class="q-nav-title" data-q-nav>${E(title)}</h1>`;
}
export function wireNavTitles(root = document, { scroller = null } = {}) {
  for (const el of root.querySelectorAll('[data-q-nav]:not([data-q-bound])')) {
    el.setAttribute('data-q-bound', '');
    bindNavTitle(el, { scroller });
  }
}
// heroCardHtml({ eyebrow, icon (svg), title, big, sub, pill, actions: [{ label, tap, href, ghost }], tap, href, color, color2 }, childrenHtml)
export function heroCardHtml({ eyebrow = '', icon = '', title = '', big = '', sub = '', pill = '', actions = [], href = '', tap = null, color = '', color2 = '' } = {}, childrenHtml = '') {
  const [tag, at] = elOf(href, tap, { tap });
  return `<${tag} class="${clsOf('q-hero-card', tag !== 'div' && 'q-press')}"${at}${styleOf(['--q-hc-b', color], ['--q-hc-a', color2])}>${eyebrow || icon ? `<span class="q-hc-eyebrow">${icon || ''}<span>${E(eyebrow)}</span></span>` : ''}${big !== '' && big != null ? `<strong class="q-hc-big">${E(big)}</strong>` : ''}${title ? `<strong class="q-hc-title">${E(title)}</strong>` : ''}${sub ? `<p class="q-hc-sub">${E(sub)}</p>` : ''}${pill ? `<span class="q-hc-pill"><span>${E(pill)}</span><i>${icons.send}</i></span>` : ''}${
    actions.length
      ? `<div class="q-hc-row">${actions
          .map(a => {
            const [t2, at2] = a.href ? ['a', ` href="${E(a.href)}"`] : ['button', ` type="button"${dataOf({ tap: a.tap })}`];
            return `<${t2} class="${clsOf('q-hc-btn', a.ghost && 'ghost')}"${at2}>${E(a.label)}</${t2}>`;
          })
          .join('')}</div>`
      : ''
  }${joinHtml(childrenHtml)}</${tag}>`;
}
export function statsHtml(items) {
  return `<div class="q-stats"${styleOf(['--q-stats-n', Math.min(items.length, 3)])}>${items
    .map(it => {
      const tag = it.href ? 'a' : 'div';
      return `<${tag} class="q-stat"${it.href ? ` href="${E(it.href)}"` : ''}>${it.icon ? tileHtml(it.icon, it.color, 'sm') : ''}<small>${E(it.label)}</small><strong${it.tint ? ' class="tint"' : ''}>${E(it.value)}</strong></${tag}>`;
    })
    .join('')}</div>`;
}
// sectionHtml(title, bodyHtml, { more, moreHref, moreTap })
export function sectionHtml(title, bodyHtml, { more = '', moreHref = '', moreTap = null } = {}) {
  const link = !more ? '' : moreHref ? `<a href="${E(moreHref)}">${E(more)}</a>` : `<button type="button"${dataOf({ more: moreTap })}>${E(more)}</button>`;
  return `<section class="q-section"><div class="q-section-head"><h2>${E(title)}</h2>${link}</div>${joinHtml(bodyHtml)}</section>`;
}
export function sectionHeadHtml(title, { more = '', moreTap = null, moreHref = '', count = null, data = null } = {}) {
  const chev = `<span style="display:contents">${icons.chevron}</span>`;
  const link = !more ? '' : moreHref ? `<a class="q-sh-more" href="${E(moreHref)}"${dataOf(data)}>${E(more)}${chev}</a>` : `<button class="q-sh-more" type="button"${dataOf({ more: moreTap, ...data })}>${E(more)}${chev}</button>`;
  return `<div class="q-section-head q-shd"><h2>${E(title)}</h2>${count != null && count !== '' ? `<span class="q-sh-count num">${E(count)}</span>` : ''}${link}</div>`;
}
// A logo tile with no picture (none known, or every URL broken) shows a
// picture of its kind on its tint, never a letter: a shield for a team (the
// default), a face's outline for a person, a cup for a league, columns for a
// company, a flag. kind: 'team' | 'person' | 'league' | 'company' | 'flag'.
// (wireLogos(root) once the HTML is in the page, for the HTML builder.)
const LOGO_KINDS = { team: 'shield', person: 'user', league: 'trophy', company: 'bank', flag: 'flag' };
const logoMark = kind => icons[LOGO_KINDS[kind] || 'shield'] || icons.shield;
// A src or a list of them, as the non-empty strings in order.
const srcList = src => [].concat(src || []).filter(s => s && typeof s === 'string');
// (A list's later URLs wait in data-srcs, a JSON array, for wireLogos.)
export function logoTileHtml(src, { size = 40, alt = '', fallbackText = '', tint = '', kind = 'team' } = {}) {
  const [first, ...rest] = srcList(src);
  if (first) return `<span class="q-logo"${styleOf(['--s', `${size}px`])}><img src="${E(first)}" alt="${E(alt)}" loading="lazy" decoding="async"${dataOf({ fallback: kind, tint })}${rest.length ? dataOf({ srcs: JSON.stringify(rest) }) : ''}></span>`;
  return `<span class="q-logo text" role="img" aria-label="${E(alt || fallbackText)}"${styleOf(['--s', `${size}px`], ['--t', tint])}>${logoMark(kind)}</span>`;
}
export function wireLogos(root = document) {
  const fall = img => {
    const t = img.closest?.('.q-logo');
    // The next URL of a list first, the letter once they are used up.
    let rest = [];
    try { rest = JSON.parse(img.getAttribute('data-srcs') || '[]'); } catch {}
    if (rest.length) {
      img.setAttribute('data-srcs', JSON.stringify(rest.slice(1)));
      img.setAttribute('src', rest[0]);
      return;
    }
    if (!t) return;
    t.className = 'q-logo text';
    t.innerHTML = logoMark(img.getAttribute('data-fallback'));
    if (img.getAttribute('data-tint')) t.style.setProperty('--t', img.getAttribute('data-tint'));
  };
  // (An image that already failed before this ran.)
  for (const img of root.querySelectorAll('.q-logo img')) if (img.complete && img.naturalWidth === 0) fall(img);
  if (root.__quadraLogos) return;
  root.__quadraLogos = true;
  root.addEventListener('error', e => e.target?.tagName === 'IMG' && fall(e.target), true);
}
// (logoHtml / statusHtml: trusted markup for the `logo` and `status` slots; status may also be a list of tags.)
export function sheetHeroHtml({ eyebrow = '', big = '', sub = '', tint = '', logos = [], tags = [], logoHtml = '', status = null, statusHtml = '' } = {}) {
  const st = statusHtml || (Array.isArray(status) ? status.map(tagObjHtml).join('') : '');
  return `<div class="q-sheet-hero"${styleOf(['--t', tint])}>${logoHtml ? `<div class="q-sh-logos">${logoHtml}</div>` : logos.length ? `<div class="q-sh-logos">${logos.map(l => logoTileHtml(l, { size: 48 })).join('')}</div>` : ''}${eyebrow ? `<span class="q-sh-eyebrow">${E(eyebrow)}</span>` : ''}${big !== '' && big != null ? `<span class="q-sh-big">${E(big)}</span>` : ''}${sub ? `<span class="q-sh-sub">${E(sub)}</span>` : ''}${tags.length ? `<div class="q-sh-row">${tags.map(tagObjHtml).join('')}</div>` : ''}${st ? `<div class="q-sh-row q-sh-status">${st}</div>` : ''}</div>`;
}
// movePillHtml(changePct, { solid, digits }); stockRowHtml({ logo, name, sub, spark, price, change, changePct, currency, open (a value → data-open), data })
export function movePillHtml(changePct, { solid = true, digits = 2 } = {}) {
  return `<span class="q-move ${moveTone(changePct, digits)}${solid ? ' solid' : ''}">${E(moveText(changePct, digits))}</span>`;
}
export function stockRowHtml({ logo = '', name = '', sub = '', spark = [], price = null, change = null, changePct = null, currency = '', open = null, data = null } = {}) {
  const { tone } = stockMove({ spark, changePct, change });
  const own = stockPill({ changePct, change, currency });
  const chart = sparkSvg(spark, tone);
  return `<div class="q-stock"${open != null ? ` role="button" tabindex="0"${dataOf({ open })}` : ''}${dataOf(data)}>${logoTileHtml(logo, { size: 40, alt: name, fallbackText: name, kind: 'company' })}<div class="q-stock-id"><b>${E(name)}</b>${sub ? `<small>${E(sub)}</small>` : ''}</div>${chart ? `<span class="q-stock-spark">${chart}</span>` : ''}<div class="q-stock-px"><b class="num" data-q-live>${E(stockPrice(price, currency))}</b>${own == null ? movePillHtml(changePct) : `<span class="q-move ${tone} solid">${E(own)}</span>`}</div></div>`;
}
export function placeTileHtml(kind = 'pin', size = '') {
  const k = ['home', 'work', 'school', 'pin', 'star'].includes(kind) ? kind : 'pin';
  return `<span class="${clsOf('q-tile', size && E(size), 'q-place', k)}" aria-hidden="true">${icons[k]}</span>`;
}

// ---- The premium layer (quadra.css "Premium layer"): Law's and Beats' look ----
// Glyphs drawn on one 24-unit grid with round 2px strokes, for tiles, hero
// cards and rows: icons.home, icons.spark… (a string of SVG).
const g = (d, fill = false) => `<svg viewBox="0 0 24 24" ${fill ? 'fill="currentColor"' : 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"'} aria-hidden="true">${d}</svg>`;
export const icons = {
  home: g('<path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-4.5v-6h-5v6H5a1 1 0 0 1-1-1z"/>'),
  calendar: g('<rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/>'),
  clock: g('<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>'),
  star: g('<path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/>'),
  search: g('<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>'),
  chart: g('<path d="M4 19h16M7 15l4-4 3 3 5-6"/>'),
  bars: g('<path d="M6 20V11M12 20V5M18 20v-6"/>'),
  bell: g('<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15zM10 20.5h4"/>'),
  bus: g('<rect x="5" y="3.5" width="14" height="14" rx="3"/><path d="M5 11h14M8.5 20.5v-3M15.5 20.5v-3"/><circle cx="8.5" cy="14.5" r=".6"/><circle cx="15.5" cy="14.5" r=".6"/>'),
  train: g('<rect x="6" y="3.5" width="12" height="13" rx="4"/><path d="M6 10.5h12M9 20.5l1.5-4M15 20.5l-1.5-4"/>'),
  walk: g('<circle cx="13.5" cy="4.3" r="1.9" fill="currentColor" stroke="none"/><path d="M12.6 8.2 11 14.2l-2.6 6.3M11 14.2l2.8 2.6.9 3.7M7.5 12l2.2-3.3 2.9-.5 2.1 3 2.8 1"/>'),
  bike: g('<circle cx="6" cy="16" r="3.5"/><circle cx="18" cy="16" r="3.5"/><path d="M6 16l4-7h5l3 7M10 9 8.5 6H7M12 16l3-7"/>'),
  map: g('<path d="M9 4.5 3.5 6.5v13l5.5-2 6 2 5.5-2v-13l-5.5 2-6-2zM9 4.5v13M15 6.5v13"/>'),
  pin: g('<path d="M12 21s-6.5-6.2-6.5-11a6.5 6.5 0 0 1 13 0c0 4.8-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/>'),
  ball: g('<circle cx="12" cy="12" r="8.5"/><path d="m12 7.5 3.8 2.8-1.5 4.4H9.7l-1.5-4.4zM12 3.5v4M20 10l-4.2.3M16.5 19.5l-2.2-4.8M7.5 19.5l2.2-4.8M4 10l4.2.3"/>'),
  trophy: g('<path d="M8 4h8v5a4 4 0 0 1-8 0zM8 6H4.5c0 3 1.5 4.5 3.7 4.8M16 6h3.5c0 3-1.5 4.5-3.7 4.8M12 13v4M8.5 20.5h7M9.5 17h5v3.5h-5z"/>'),
  tv: g('<rect x="3" y="5.5" width="18" height="12.5" rx="2.5"/><path d="M8 21h8M8.5 2.5 12 5.5l3.5-3"/>'),
  book: g('<path d="M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15H6.5A1.5 1.5 0 0 0 5 19.5zM5 19.5A1.5 1.5 0 0 0 6.5 21H19v-3M9 7.5h6"/>'),
  ticket: g('<path d="M3.5 7.5A1.5 1.5 0 0 1 5 6h14a1.5 1.5 0 0 1 1.5 1.5V10a2 2 0 0 0 0 4v2.5A1.5 1.5 0 0 1 19 18H5a1.5 1.5 0 0 1-1.5-1.5V14a2 2 0 0 0 0-4zM9 10h6M9 14h6"/>'),
  wallet: g('<path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H18v3M4 7.5V17a2.5 2.5 0 0 0 2.5 2.5H20V8H6.5A2.5 2.5 0 0 1 4 7.5z"/><circle cx="16" cy="14" r="1.2"/>'),
  coin: g('<circle cx="12" cy="12" r="8.5"/><path d="M14.5 9.5c-.5-1-1.5-1.5-2.5-1.5-1.4 0-2.5.8-2.5 2s1.1 1.6 2.5 2 2.5.8 2.5 2-1.1 2-2.5 2c-1 0-2-.5-2.5-1.5M12 6.5v11"/>'),
  sun: g('<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>'),
  cloud: g('<path d="M7 18.5a4.5 4.5 0 0 1-.4-9 6 6 0 0 1 11.4 1.6A3.8 3.8 0 0 1 17.5 18.5z"/>'),
  rain: g('<path d="M7 15.5a4.5 4.5 0 0 1-.4-9 6 6 0 0 1 11.4 1.6 3.8 3.8 0 0 1-.5 7.4zM8 18.5l-1 2M12 18.5l-1 2M16 18.5l-1 2"/>'),
  drop: g('<path d="M12 3.5s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/>'),
  wind: g('<path d="M3 9h11a3 3 0 1 0-3-3M3 15h15a3 3 0 1 1-3 3M3 12h8"/>'),
  user: g('<circle cx="12" cy="8" r="4"/><path d="M4.5 20.5a7.5 7.5 0 0 1 15 0"/>'),
  list: g('<path d="M9 6.5h11M9 12h11M9 17.5h11"/><circle cx="4.5" cy="6.5" r=".8"/><circle cx="4.5" cy="12" r=".8"/><circle cx="4.5" cy="17.5" r=".8"/>'),
  grid: g('<rect x="4" y="4" width="7" height="7" rx="2"/><rect x="13" y="4" width="7" height="7" rx="2"/><rect x="4" y="13" width="7" height="7" rx="2"/><rect x="13" y="13" width="7" height="7" rx="2"/>'),
  flame: g('<path d="M12 21a6.5 6.5 0 0 0 6.5-6.5c0-4-3-6-4-9.5-2 1.5-3 3.5-3 5.5-1-.5-2-1.5-2.3-3C7 9.5 5.5 12 5.5 14.5A6.5 6.5 0 0 0 12 21z"/>'),
  check: g('<path d="m5 12.5 4.5 4.5L19 7.5"/>'),
  plus: g('<path d="M12 5v14M5 12h14"/>'),
  send: g('<path d="M12 19V5M6 11l6-6 6 6"/>'),
  play: g('<path d="M8 5.5v13l10.5-6.5z"/>', true),
  live: g('<circle cx="12" cy="12" r="2"/><path d="M8.5 8.5a5 5 0 0 0 0 7M15.5 8.5a5 5 0 0 1 0 7M5.6 5.6a9 9 0 0 0 0 12.8M18.4 5.6a9 9 0 0 1 0 12.8"/>'),
  swap: g('<path d="M7 4 3.5 7.5 7 11M3.5 7.5h13M17 13l3.5 3.5L17 20M20.5 16.5h-13"/>'),
  history: g('<path d="M4 12a8 8 0 1 0 2.3-5.6L4 8.5M4 4v4.5h4.5M12 8v4l3 2"/>'),
  camera: g('<path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h2.3L9.5 4.5h5L16.2 7h2.3A1.5 1.5 0 0 1 20 8.5v10a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5z"/><circle cx="12" cy="13" r="3.5"/>'),
  pencil: g('<path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4"/>'),
  key: g('<circle cx="8" cy="15" r="4"/><path d="m11 12 8.5-8.5M16 7l2.5 2.5M14 9l2 2"/>'),
  backpack: g('<path d="M6 10a6 6 0 0 1 12 0v10a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1zM9.5 4.5V3.5h5v1M9 14h6v4H9z"/>'),
  moon: g('<path d="M19 14.5A7.5 7.5 0 0 1 9.5 5 7.5 7.5 0 1 0 19 14.5z"/>'),
  spark: g('<path d="M12 2.5c.5 3.8 2.2 6.4 6.6 7.4-4.4 1-6.1 3.6-6.6 7.4-.5-3.8-2.2-6.4-6.6-7.4 4.4-1 6.1-3.6 6.6-7.4zM19 15c.3 1.9 1.1 3 3 3.5-1.9.5-2.7 1.6-3 3.5-.3-1.9-1.1-3-3-3.5 1.9-.5 2.7-1.6 3-3.5z"/>', true),
  share: g('<path d="M12 15V4M8 8l4-4 4 4M6 12H5.5A1.5 1.5 0 0 0 4 13.5v5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5v-5a1.5 1.5 0 0 0-1.5-1.5H18"/>'),
  trash: g('<path d="M4 7h16M9 7V4.5h6V7M6.5 7l.8 12a1.5 1.5 0 0 0 1.5 1.5h6.4a1.5 1.5 0 0 0 1.5-1.5l.8-12M10 11v6M14 11v6"/>'),
  x: g('<path d="M6 6l12 12M18 6 6 18"/>'),
  bank: g('<path d="M3.5 9.5 12 4l8.5 5.5zM6 12v5.5M10 12v5.5M14 12v5.5M18 12v5.5M4 20.5h16"/>'),
  lock: g('<rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5M12 14.5v2"/>'),
  exchange: g('<path d="M4 8h14M14.5 4.5 18 8l-3.5 3.5M20 16H6M9.5 12.5 6 16l3.5 3.5"/>'),
  cup: g('<path d="M5 8h11v6a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5zM16 9.5h1.5a2.5 2.5 0 0 1 0 5H16M8 3.5v2M12 3.5v2M5 21h11"/>'),
  flag: g('<path d="M5.5 21V4M5.5 5h12l-2.5 4 2.5 4h-12"/>'),
  shield: g('<path d="M12 3.5 5 6v5.5c0 4.4 3 7.8 7 9 4-1.2 7-4.6 7-9V6z"/>'),
  target: g('<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r=".8"/>'),
  chevron: g('<path d="m9 5 7 7-7 7"/>'),
  // Saved places (with home, pin and star above).
  work: g('<rect x="3.5" y="7.5" width="17" height="12" rx="2.5"/><path d="M9 7.5V6a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 6v1.5M3.5 13h17M10.5 13v1.5h3V13"/>'),
  school: g('<path d="m12 4.5 9 4.5-9 4.5L3 9zM7 11.5v4.2c0 1.2 2.2 2.3 5 2.3s5-1.1 5-2.3v-4.2M21 9v5"/>')
};
const isIcon = x => typeof x === 'string' && Object.hasOwn(icons, x);
const glyph = x => (typeof x === 'string' && x.trim().startsWith('<svg') ? { html: x } : { text: x == null ? '' : String(x) });
const tinted = (n, color) => (color && n.style.setProperty('--t', color), n);

// A colour tile holding a glyph (an icons.x string, an emoji, an <img>).
export function tile(icon, color = '', size = '') {
  const t = tinted(h('span', { class: `q-tile${size ? ` ${size}` : ''}`, 'aria-hidden': 'true', ...(icon instanceof Node ? {} : glyph(icon)) }), color);
  if (icon instanceof Node) t.append(icon);
  return t;
}
// The page's own head: a small grey line over its large title.
export function pageHead(title, { over = '', tint = false, trailing = null } = {}) {
  return h('header', { class: 'q-page-head' }, [over ? h('p', { class: `q-over${tint ? ' tint' : ''}`, text: over }) : null, h('h1', { text: title }), trailing]);
}
// A card of rows: [{ icon, color, title, sub, value, tags, href, onClick,
// chevron, trailing }]; a row with neither href nor onClick stays still.
export function rowCard(rows) {
  return h(
    'div',
    { class: 'q-rowcard' },
    rows.filter(Boolean).map(r => {
      const tag = r.href ? 'a' : r.onClick ? 'button' : 'div';
      const row = h(tag, { class: `q-ritem${r.chevron ?? tag !== 'div' ? ' chevron' : ''}`, ...(r.href ? { href: r.href } : {}), ...(tag === 'button' ? { type: 'button', onclick: r.onClick } : {}) });
      if (r.icon != null && r.icon !== '') row.append(tile(r.icon, r.color, r.size || ''));
      row.append(h('span', { class: 'q-ritem-text' }, [h('span', { class: 'q-ritem-title', text: r.title }), r.sub ? h('small', { text: r.sub }) : null, r.tags?.length ? h('span', { class: 'q-tags' }, r.tags.map(t => tag_(t))) : null]));
      if (r.value !== undefined && r.value !== '') row.append(h('span', { class: 'q-ritem-value', text: String(r.value) }));
      if (r.trailing) row.append(r.trailing);
      return row;
    })
  );
}
const tag_ = t => (typeof t === 'string' ? h('span', { class: 'q-tag', text: t }) : tinted(h('span', { class: `q-tag ${t.tone || ''}`.trim(), text: t.text }), t.color));
// A tinted capsule: tag('直播', 'red') or tag('3 天', '', '#hex').
export function tag(text, tone = '', color = '') {
  return tag_({ text, tone: color ? `${tone} tint` : tone, color });
}
// Cards that scroll sideways to the screen's edge.
export function rail(children, { small = false } = {}) {
  return h('div', { class: `q-rail${small ? ' small' : ''}` }, children);
}
// Big numbers with their names: [{ label, value, icon, color, tint, href }].
export function stats(items) {
  const s = h('div', { class: 'q-stats' });
  s.style.setProperty('--q-stats-n', String(Math.min(items.length, 3)));
  for (const it of items) s.append(h(it.href ? 'a' : 'div', { class: 'q-stat', ...(it.href ? { href: it.href } : {}) }, [it.icon ? tile(it.icon, it.color, 'sm') : null, h('small', { text: it.label }), h('strong', { class: it.tint ? 'tint' : '', text: it.value })]));
  return s;
}
// A section: a title, an optional link on its right, and its body.
export function section(title, body, { more = '', moreHref = '', onMore = null } = {}) {
  const head = h('div', { class: 'q-section-head' }, [h('h2', { text: title }), more ? h(moreHref ? 'a' : 'button', { ...(moreHref ? { href: moreHref } : { type: 'button', onclick: onMore }), text: more }) : null]);
  return h('section', { class: 'q-section' }, [head, ...[].concat(body)]);
}

// ---- More components (quadra.css "Premium components (round 3)") ----

// A section's head: its title, a count beside it, a link to the rest on the
// right. sectionHead('為你推薦', { count: 4, more: '全部', onMore | data: { tab: 'all' } }); the same
// .q-section-head as section()'s, drawn 20px with a 44px tap target (.q-shd).
export function sectionHead(title, { more = '', onMore = null, moreHref = '', count = null, data = null } = {}) {
  const chev = h('span', { html: icons.chevron, style: { display: 'contents' } });
  return h('div', { class: 'q-section-head q-shd' }, [
    h('h2', { text: title }),
    count != null && count !== '' ? h('span', { class: 'q-sh-count num', text: String(count) }) : null,
    more ? h(moreHref ? 'a' : 'button', { class: 'q-sh-more', ...(moreHref ? { href: moreHref } : { type: 'button', onclick: onMore }), ...dataProps(data) }, [more, chev]) : null
  ]);
}

// A logo, the hero of its card: white rounded square, the image contained.
// logoTile(src, { size: 40, alt, fallbackText, tint }). No src (or a broken
// one) shows fallbackText on `tint` instead. `src` may be a list of URLs:
// each is tried in turn on error, then fallbackText.
export function logoTile(src, { size = 40, alt = '', fallbackText = '', tint = '', kind = 'team' } = {}) {
  const t = h('span', { class: 'q-logo' });
  t.style.setProperty('--s', `${size}px`);
  const mark = () => {
    t.className = 'q-logo text';
    t.setAttribute('role', 'img');
    t.setAttribute('aria-label', alt || fallbackText);
    t.innerHTML = logoMark(kind);
    if (tint) t.style.setProperty('--t', tint);
  };
  const srcs = srcList(src);
  if (srcs.length) {
    const img = h('img', { src: srcs[0], alt, loading: 'lazy', decoding: 'async' });
    let at = 0;
    img.addEventListener('error', () => (++at < srcs.length ? img.setAttribute('src', srcs[at]) : mark()));
    t.append(img);
  } else mark();
  return t;
}

// A match: its league and time, two sides, the prices in one equal row.
// matchCard({ league, leagueLogo, when, live, tag, wide, sides: [{ logo, name,
// score }], prices: [{ label, odds, onTap, selected, locked }], onOpen }).
// Scores show as "2 : 1", else "VS". wide = a full-width card for a list.
export function matchCard({ league = '', leagueLogo = '', when = '', live = false, tag = null, wide = false, sides = [], prices = [], onOpen = null } = {}) {
  const [a = {}, b = {}] = sides;
  const px = wide ? 40 : 48;
  const side = s => h('div', { class: 'q-match-side' }, [logoTile(s.logo, { size: px, alt: s.name, fallbackText: s.name }), h('b', { text: s.name || '' })]);
  const scored = a.score != null && b.score != null;
  // (A tag with no text shows nothing: never an empty capsule.)
  const t = tag ? (typeof tag === 'string' ? { text: tag } : tag) : null;
  const card = h('article', { class: `q-match${live ? ' live' : ''}${wide ? ' wide' : ''}`, ...(onOpen ? { role: 'button', tabindex: '0', onclick: onOpen, onkeydown: e => e.key === 'Enter' && onOpen(e) } : {}) }, [
    h('div', { class: 'q-match-top' }, [leagueLogo ? logoTile(leagueLogo, { size: 20, alt: league }) : null, h('span', { class: 'q-match-lg', text: league }), t?.text ? tag_(t) : null, h('span', { class: 'q-match-when', text: when })]),
    h('div', { class: 'q-match-teams' }, [side(a), h('div', { class: `q-match-mid num${scored ? '' : ' vs'}`, text: scored ? `${a.score} : ${b.score}` : 'VS' }), side(b)]),
    prices.length
      ? prices.some(p => p.locked)
        ? lockedRow()
        : h(
            'div',
            { class: 'q-match-prices' },
            prices.map(p => h('button', { class: 'q-price', type: 'button', 'aria-pressed': String(Boolean(p.selected)), onclick: e => (e.stopPropagation(), p.onTap?.(e)) }, [h('small', { text: p.label || '' }), h('b', { class: 'num', text: p.odds == null ? '' : String(p.odds) })]))
          )
      : null
  ]);
  return card;
}

// A market that can't be bet right now: one calm bar across the whole row
// (a lock and 暫停投注), never some prices open beside locked ones. Any
// price of a market locked locks the market (matchCard does this itself).
// lockedRow({ text }) / lockedRowHtml({ text }).
const lockText = () => (globalThis.document?.documentElement.lang || 'zh').startsWith('zh') ? '暫停投注' : 'Betting paused';
export function lockedRow({ text = lockText() } = {}) {
  return h('div', { class: 'q-locked-row', role: 'status', html: `${icons.lock}<span>${E(text)}</span>` });
}
export function lockedRowHtml({ text = lockText() } = {}) {
  return `<div class="q-locked-row" role="status">${icons.lock}<span>${E(text)}</span></div>`;
}

// A compact rail of games on now: liveStrip([{ min, rows: [{ logo, name,
// score }], onOpen }]); each card has the minute in red, then a row per side.
export function liveStrip(items) {
  return h(
    'div',
    { class: 'q-live-strip' },
    items.map(it =>
      h('button', { class: 'q-live-card', type: 'button', onclick: it.onOpen }, [
        h('span', { class: 'q-live-min', text: it.min || '' }),
        ...it.rows.flatMap(r => [logoTile(r.logo, { size: 28, alt: r.name, fallbackText: r.name }), h('b', { text: r.name || '' }), h('span', { class: 'num', text: r.score == null ? '' : String(r.score) })])
      ])
    )
  );
}

// Quick actions as colour tiles: actionGrid([{ icon (an icons key), tint,
// label, badge, onTap | data: { tab: 'ipo' } }]). A badge of 0 is not drawn.
export function actionGrid(items) {
  return h(
    'div',
    { class: 'q-actions-grid' },
    items.map(it =>
      h('button', { class: 'q-action', type: 'button', onclick: it.onTap, ...dataProps(it.data) }, [tile(icons[it.icon] || it.icon, it.tint), h('span', { text: it.label }), it.badge ? h('span', { class: 'q-badge', text: String(it.badge) }) : null])
    )
  );
}

// A hero inside a sheet, under its head: sheetHero({ eyebrow, big, sub, tint,
// logos: [src], tags: [text] }). tint is a colour (default the accent).
// `logo` (a node, e.g. a logoTile) stands in for the logos list; `status`
// (a list of tags, or a node) is a row of its own under the tags.
export function sheetHero({ eyebrow = '', big = '', sub = '', tint = '', logos = [], tags = [], logo = null, status = null } = {}) {
  const st = status instanceof Node ? [status] : [].concat(status || []).map(x => (x instanceof Node ? x : tag_(typeof x === 'string' ? { text: x } : x)));
  const c = h('div', { class: 'q-sheet-hero' }, [
    logo ? h('div', { class: 'q-sh-logos' }, [logo]) : logos.length ? h('div', { class: 'q-sh-logos' }, logos.map(l => logoTile(l, { size: 48 }))) : null,
    eyebrow ? h('span', { class: 'q-sh-eyebrow', text: eyebrow }) : null,
    big !== '' && big != null ? h('span', { class: 'q-sh-big', text: String(big) }) : null,
    sub ? h('span', { class: 'q-sh-sub', text: sub }) : null,
    tags.length ? h('div', { class: 'q-sh-row' }, tags.map(x => tag_(typeof x === 'string' ? { text: x } : x))) : null,
    st.length ? h('div', { class: 'q-sh-row q-sh-status' }, st) : null
  ]);
  return tinted(c, tint);
}

// The sticky action bar at a sheet's foot: sheetFoot({ summary: { small,
// big }, button: { label, onClick, disabled, danger } }). .q-sheet-foot.q-sf.
export function sheetFoot({ summary = null, button = {} } = {}) {
  return h('div', { class: 'q-sheet-foot q-sf' }, [
    summary ? h('div', { class: 'q-sf-sum' }, [h('small', { text: summary.small || '' }), h('b', { class: 'num', text: summary.big == null ? '' : String(summary.big) })]) : null,
    h('button', { class: `q-btn ${button.danger ? 'danger' : 'primary'}`, type: 'button', ...(button.disabled ? { disabled: true } : {}), onclick: button.onClick, text: button.label || '' })
  ]);
}

// A confirm dialog: confirm({ icon, tint, title, body, ok, cancel, danger })
// resolves true or false. quadra.mjs's ask(); `icon` a key of `icons` shows
// as a 56px colour tile, anything else (an emoji) as it always did.
export async function confirm(opts = {}) {
  return (await import('./quadra.mjs')).ask(opts);
}

// An amount to stake: stakeInput({ value, presets: [100, 500…], onChange,
// currency, decimals }). The number is typed or one preset tapped; .value
// reads it. decimals (default 0: whole amounts) is the places a crypto or FX
// amount keeps: what is typed, shown, a preset or set() stops there.
const stakeDp = d => Math.min(8, Math.max(0, Math.floor(Number(d) || 0)));
const stakeNum = (n, dp) => {
  const x = Number(n);
  return dp ? (x > 0 && Number.isFinite(x) ? Math.floor(x * 10 ** dp + 1e-7) / 10 ** dp : 0) : Math.max(0, Math.floor(x || 0));
};
const stakeText = (n, dp) => (dp ? n.toFixed(dp) : String(n));
const stakeLabel = (p, dp) => Number(p).toLocaleString('en-US', dp ? { maximumFractionDigits: dp } : {});
export function stakeInput({ value = 0, presets = [], onChange = () => {}, currency = 'NT$', decimals = 0 } = {}) {
  const dp = stakeDp(decimals);
  let cur = dp ? stakeNum(value, dp) : Number(value) || 0;
  const input = h('input', { type: 'text', inputmode: dp ? 'decimal' : 'numeric', autocomplete: 'off', 'aria-label': currency, value: stakeText(cur, dp) });
  const btns = presets.map(p => h('button', { type: 'button', onclick: () => set(p, true) }, [stakeLabel(p, dp)]));
  const paint = () => btns.forEach((b, i) => b.setAttribute('aria-pressed', String(dp ? stakeNum(presets[i], dp) === cur : presets[i] === cur)));
  const set = (n, fromTap = false) => {
    cur = stakeNum(n, dp);
    if (fromTap || document.activeElement !== input) input.value = stakeText(cur, dp);
    paint();
    onChange(cur);
  };
  input.addEventListener('input', () => {
    if (!dp) return set(input.value.replace(/\D/g, ''));
    // Digits and one point, at most `decimals` places; what is typed stays (a "0." too).
    const [whole, ...frac] = input.value.replace(/[^\d.]/g, '').split('.');
    const text = frac.length ? `${whole}.${frac.join('').slice(0, dp)}` : whole;
    if (text !== input.value) input.value = text;
    set(text);
  });
  const root = h('div', { class: 'q-stake' }, [h('label', { class: 'q-stake-amt' }, [h('small', { text: currency }), input]), btns.length ? h('div', { class: 'q-stake-presets' }, btns) : null]);
  root.style.setProperty('--n', String(btns.length || 5));
  paint();
  return Object.defineProperties(root, { value: { get: () => cur }, set: { value: n => set(n, true) } });
}

// A move as a solid pill: movePill(changePct, { solid, digits }) with the
// percent as a number (1.23 is +1.23%). Red up, green down, grey flat (the
// Taiwan way: --q-up/--q-down/--q-flat); white text. A flat figure has no
// sign (0.00%), a missing one is a dash. solid: false is the colour as text.
const moveTone = (p, digits) => (Number.isFinite(p) ? (Math.abs(p) >= 0.5 * 10 ** -digits ? (p > 0 ? 'up' : 'down') : 'flat') : 'flat');
const moveText = (p, digits) => (Number.isFinite(p) ? pct(p / 100, { digits }) : DASH);
export function movePill(changePct, { solid = true, digits = 2 } = {}) {
  return h('span', { class: `q-move ${moveTone(changePct, digits)}${solid ? ' solid' : ''}`, text: moveText(changePct, digits) });
}

// A stock in a list: stockRow({ logo, name, sub, spark: [numbers], price,
// change, changePct, currency, onOpen | data }), 56px high. logo is a src (or
// a list of them) for logoTile; price a number (format.mjs price, in
// `currency`, default TWD) or text; a sparkline drawn from `spark` (2+
// numbers) is coloured by the move; the pill under the price is movePill
// (changePct in percent). `change` (the amount) only stands in when there's
// no changePct: the pill shows it, coloured by its sign.
const sparkSvg = (nums, tone) => {
  const v = (nums || []).filter(Number.isFinite);
  if (v.length < 2) return '';
  const lo = Math.min(...v);
  const span = Math.max(...v) - lo || 1;
  const pts = v.map((n, i) => `${((i / (v.length - 1)) * 56).toFixed(1)},${(22 - ((n - lo) / span) * 20).toFixed(1)}`).join(' ');
  return `<svg class="q-spark ${tone}" viewBox="0 0 56 24" aria-hidden="true"><polyline points="${pts}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
};
const stockMove = ({ spark, changePct, change }) => {
  const x = Number.isFinite(changePct) ? changePct : Number.isFinite(change) ? change : null;
  if (x != null) return { tone: moveTone(x, 2) };
  const v = (spark || []).filter(Number.isFinite);
  return { tone: v.length > 1 ? (v.at(-1) > v[0] ? 'up' : v.at(-1) < v[0] ? 'down' : 'flat') : 'flat' };
};
const stockPrice = (p, currency) => (typeof p === 'number' ? fmtPrice(p, currency || 'TWD') : p == null || p === '' ? DASH : String(p));
const stockPill = ({ changePct, change, currency }) => (Number.isFinite(changePct) || change == null || change === '' ? null : typeof change === 'number' ? (change < 0 ? '−' : change > 0 ? '+' : '') + fmtPrice(Math.abs(change), currency || 'TWD') : String(change));
export function stockRow({ logo = '', name = '', sub = '', spark = [], price = null, change = null, changePct = null, currency = '', onOpen = null, data = null } = {}) {
  const { tone } = stockMove({ spark, changePct, change });
  const own = stockPill({ changePct, change, currency });
  const pill = own == null ? movePill(changePct) : h('span', { class: `q-move ${tone} solid`, text: own });
  const chart = sparkSvg(spark, tone);
  return h('div', { class: 'q-stock', ...(onOpen ? { role: 'button', tabindex: '0', onclick: onOpen, onkeydown: e => { if (e.key === 'Enter' || e.key === ' ') { if (e.key === ' ') e.preventDefault?.(); onOpen(e); } } } : {}), ...dataProps(data) }, [
    logoTile(logo, { size: 40, alt: name, fallbackText: name, kind: 'company' }),
    h('div', { class: 'q-stock-id' }, [h('b', { text: name }), sub ? h('small', { text: sub }) : null]),
    chart ? h('span', { class: 'q-stock-spark', html: chart }) : null,
    h('div', { class: 'q-stock-px' }, [h('b', { class: 'num', 'data-q-live': '', text: stockPrice(price, currency) }), pill])
  ]);
}

// Lottery balls: ballRow([5, 12, …], { special, hit: [numbers drawn], size }).
// A null among the numbers is an empty ball, still to pick. `special` (one
// number or a list) is drawn red after the rest.
export function ballRow(nums, { special = [], hit = [], size = 28 } = {}) {
  const row = h('div', { class: 'q-balls' });
  if (size !== 28) row.style.setProperty('--b', `${size}px`);
  const ball = (n, cls) => h('span', { class: `q-ball${cls ? ` ${cls}` : ''}${n == null ? ' empty' : ''}${hit.includes(n) ? ' hit' : ''}`, text: n == null ? '' : String(n) });
  row.append(...nums.map(n => ball(n, '')), ...[].concat(special ?? []).map(n => ball(n, 'sp')));
  return row;
}

// A saved place's tile: placeTile('home' | 'work' | 'school' | 'pin' | 'star'),
// in its own colour (--q-place-*).
export function placeTile(kind = 'pin', size = '') {
  const k = ['home', 'work', 'school', 'pin', 'star'].includes(kind) ? kind : 'pin';
  const t = tile(icons[k], '', size);
  t.className += ` q-place ${k}`;
  return t;
}

// ---- Home parts: ring, month calendar, panels, league tile (quadra.css "Home parts (r4)") ----
const clamp01 = v => (Number.isFinite(Number(v)) ? Math.min(1, Math.max(0, Number(v))) : 0);
const pad2 = n => String(n).padStart(2, '0');
// An icon slot: an icons key or an svg string is a glyph, anything else text.
const iconHtml = x => (isIcon(x) ? icons[x] : glyphHtml(x ?? ''));

// -- Progress ring --
const ringSvg = (v, size, stroke) => {
  const r = (size - stroke) / 2;
  const c = size / 2;
  const arc = v > 0 ? `<circle class="q-ring-arc" cx="${c}" cy="${c}" r="${r}" fill="none" stroke-width="${stroke}" stroke-linecap="round" pathLength="100" stroke-dasharray="${+(v * 100).toFixed(2)} 100" transform="rotate(-90 ${c} ${c})"/>` : '';
  return `<svg class="q-ring-svg" viewBox="0 0 ${size} ${size}" aria-hidden="true"><circle class="q-ring-track" cx="${c}" cy="${c}" r="${r}" fill="none" stroke-width="${stroke}"/>${arc}</svg>`;
};
const ringParts = (value, { size = 56, stroke = 6, label, sub = '', done = false, doneCheck = false } = {}) => {
  const v = done === true ? 1 : clamp01(value);
  const check = done === true || (doneCheck === true && v >= 1);
  return { v, check, size: Math.max(16, Number(size) || 56), stroke: Math.max(1, Number(stroke) || 6), label: label ?? `${Math.round(v * 100)}%`, sub };
};
// progressRing(0.7, { size: 56, stroke: 6, label: '70%', sub: '', tint }): value 0..1 (clamped);
// label centred (default the percent), sub a small line under it. `done: true` (or value >= 1 with
// `doneCheck: true`): the ring full and a check glyph centred in place of the label.
export function progressRing(value, opts = {}) {
  const p = ringParts(value, opts);
  const root = h('div', { class: clsOf('q-ring', opts.tint && 'tinted', p.check && 'done'), role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(Math.round(p.v * 100)), html: ringSvg(p.v, p.size, p.stroke) }, [h('span', { class: 'q-ring-txt' }, [p.check ? h('i', { class: 'q-ring-check', 'aria-hidden': 'true', html: icons.check }) : h('b', { class: 'q-ring-l', text: String(p.label) }), p.sub ? h('small', { class: 'q-ring-s', text: String(p.sub) }) : null])]);
  root.style.setProperty('--s', `${p.size}px`);
  if (opts.tint) root.style.setProperty('--t', opts.tint);
  return root;
}

// -- Month calendar --
const WEEK = { zh: ['日', '一', '二', '三', '四', '五', '六'], en: ['S', 'M', 'T', 'W', 'T', 'F', 'S'] };
// month is 1..12. offset: blank cells before the 1st (Sunday-first week).
export function monthGrid(year, month) {
  const first = new Date(Date.UTC(year, month - 1, 1));
  return { offset: first.getUTCDay(), days: new Date(Date.UTC(year, month, 0)).getUTCDate() };
}
const isoDay = (y, m, d) => `${y}-${pad2(m)}-${pad2(d)}`;
const todayKey = t => (t instanceof Date ? isoDay(t.getFullYear(), t.getMonth() + 1, t.getDate()) : typeof t === 'string' && t ? t : todayKey(new Date()));
const calLang = lang => lang || (/^en/i.test(globalThis.document?.documentElement?.lang || '') ? 'en' : 'zh');
const calParts = ({ year, month, marks = {}, today, lang, last } = {}) => {
  const tk = todayKey(today);
  const cell = (key, d) => { const mark = marks?.[key]; return { d, key, mark: mark ? String(mark).replace(/[^\w-]/g, '') : '', today: key === tk }; };
  const week = WEEK[calLang(lang)] || WEEK.zh;
  const n = Math.floor(Number(last));
  if (n >= 1) {
    const [ty, tm, td] = tk.split('-').map(Number);
    const end = Date.UTC(ty, tm - 1, td);
    const days_ = Array.from({ length: n }, (_, i) => { const t = new Date(end - (n - 1 - i) * 864e5); return cell(isoDay(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate()), t.getUTCDate()); });
    return { offset: new Date(end - (n - 1) * 864e5).getUTCDay(), days: n, tk, week, days_, label: `last ${n}` };
  }
  const g = monthGrid(year, month);
  return { ...g, tk, week, label: `${year}-${pad2(month)}`, days_: Array.from({ length: g.days }, (_, i) => cell(isoDay(year, month, i + 1), i + 1)) };
};
// monthCalendar({ year, month (1..12), marks: { 'YYYY-MM-DD': 'done' | 'part' | any word }, today, onPick(key) | data }).
// `last: N` instead of year/month: the trailing N days ending today, in Sunday-first week rows (leading blanks).
// today: a Date or 'YYYY-MM-DD' (default now). Marks are `.m-<word>`; done is a filled dot, part a soft one.
export function monthCalendar({ year, month, marks = {}, today, lang, onPick = null, data = null, last = null } = {}) {
  const p = calParts({ year, month, marks, today, lang, last });
  const root = h('div', { class: 'q-cal', role: 'group', 'aria-label': p.label });
  root.style.setProperty('--off', String(p.offset));
  root.append(...p.week.map(w => h('span', { class: 'q-cal-w', 'aria-hidden': 'true', text: w })));
  for (const [i, d] of p.days_.entries()) {
    const cls = clsOf('q-cal-d', d.mark && `m-${d.mark}`, d.today && 'today');
    const props = { class: cls, 'aria-label': d.key + (d.mark ? ` ${d.mark}` : ''), ...(d.today ? { 'aria-current': 'date' } : {}), text: String(d.d) };
    const el = onPick || data ? h('button', { type: 'button', ...props, ...dataProps(data), 'data-day': d.key, onclick: () => onPick?.(d.key) }) : h('span', props);
    if (i === 0) el.style.setProperty('grid-column-start', String(p.offset + 1));
    root.append(el);
  }
  return root;
}

// -- Panel grid --
// panelGrid([{ label, big, sub, icon (an icons key / svg / text), tint, unit, level, art, data, onOpen }]): two columns of tiles.
// unit: a <small> right after the big number ('°', 'mm'); level: a small tag (a string or { text, tone }); art: a node
// (or trusted HTML) drawn beside the big value, e.g. a sparkline; data: data-* attributes; onOpen makes the tile a
// role=button (Enter/Space too). The twin: `open` (a value) makes it role=button tabindex=0 data-open.
const panelTone = t => (typeof t === 'object' && t && t.tone ? String(t.tone).replace(/[^\w-]/g, '') : '');
const panelLevel = t => (typeof t === 'object' && t ? t.text : t);
const hasLevel = t => { const x = panelLevel(t); return x != null && x !== ''; };
export function panelGrid(items) {
  return h('div', { class: 'q-panels' }, (items || []).map(it => {
    const lv = hasLevel(it.level) ? h('span', { class: clsOf('q-panel-lv', panelTone(it.level)), text: String(panelLevel(it.level)) }) : null;
    const big = h('b', { class: 'q-panel-v' }, [String(it.big ?? ''), it.unit != null && it.unit !== '' ? h('small', { class: 'q-panel-u', text: String(it.unit) }) : null]);
    const art = it.art == null || it.art === '' ? null : typeof it.art === 'string' ? h('span', { class: 'q-panel-art', 'aria-hidden': 'true', html: it.art }) : h('span', { class: 'q-panel-art', 'aria-hidden': 'true' }, [it.art]);
    const el = h('div', { class: 'q-panel', ...(it.onOpen ? { role: 'button', tabindex: '0', onclick: it.onOpen, onkeydown: e => { if (e.key === 'Enter' || e.key === ' ') { if (e.key === ' ') e.preventDefault?.(); it.onOpen(e); } } } : {}), ...dataProps(it.data) }, [
      h('span', { class: 'q-panel-l' }, [it.icon ? h('i', { 'aria-hidden': 'true', html: iconHtml(it.icon) }) : null, h('span', { text: it.label ?? '' }), lv]),
      art ? h('div', { class: 'q-panel-row' }, [big, art]) : big,
      it.sub ? h('small', { class: 'q-panel-s', text: it.sub }) : null
    ]);
    if (it.tint) el.style.setProperty('--t', it.tint);
    return el;
  }));
}
export function panelGridHtml(items) {
  return `<div class="q-panels">${(items || []).map(it => {
    const lv = hasLevel(it.level) ? `<span class="${clsOf('q-panel-lv', E(panelTone(it.level)))}">${E(panelLevel(it.level))}</span>` : '';
    const big = `<b class="q-panel-v">${E(it.big ?? '')}${it.unit != null && it.unit !== '' ? `<small class="q-panel-u">${E(it.unit)}</small>` : ''}</b>`;
    const art = typeof it.art === 'string' && it.art ? `<span class="q-panel-art" aria-hidden="true">${it.art}</span>` : '';
    return `<div class="q-panel"${it.open != null ? ` role="button" tabindex="0"${dataOf({ open: it.open })}` : ''}${dataOf(it.data)}${styleOf(['--t', it.tint])}><span class="q-panel-l">${it.icon ? `<i aria-hidden="true">${iconHtml(it.icon)}</i>` : ''}<span>${E(it.label ?? '')}</span>${lv}</span>${art ? `<div class="q-panel-row">${big}${art}</div>` : big}${it.sub ? `<small class="q-panel-s">${E(it.sub)}</small>` : ''}</div>`;
  }).join('')}</div>`;
}

// -- League tile --
// leagueTile({ logo (src or list), name, sub, onOpen | data }): a 56px logo over the name; for a rail.
export function leagueTile({ logo = '', name = '', sub = '', onOpen = null, data = null } = {}) {
  return h('button', { class: 'q-league', type: 'button', ...dataProps(data), ...(onOpen ? { onclick: onOpen } : {}) }, [logoTile(logo, { size: 56, alt: name, fallbackText: name }), h('strong', { text: name }), sub ? h('small', { text: sub }) : null]);
}
