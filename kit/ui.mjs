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
//   and the premium layer: icons, tile, pageHead, heroCard, rowCard, tag, rail, stats, section;
//   round 3: sectionHead, logoTile, matchCard, liveStrip, actionGrid, sheetHero, sheetFoot,
//   confirm, stakeInput, ballRow, placeTile, schedLine, rideRow.

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
// items: [{ id, label }]; value: the chosen id; onChange(id). The thumb
// slides to the chosen one (--q-seg-i); a finger dragged along it moves
// the choice with it, as iOS's does.
export function segmented(items, { value = items[0]?.id, onChange = () => {}, big = false, label = '' } = {}) {
  const root = h('div', { class: `q-seg${big ? ' big' : ''}`, role: 'tablist', ...(label ? { 'aria-label': label } : {}) });
  root.style.setProperty('--q-seg-n', String(items.length));
  let current = value;
  const buttons = items.map((it, i) =>
    h('button', { type: 'button', role: 'tab', 'data-id': it.id, onclick: () => choose(it.id) }, [it.label])
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
// A sheet from the foot: { title, body (nodes), onClose, cls, actions }.
// Returns { el, close }. Dragged down, it closes (quadra.mjs sheetSwipe);
// so do the ✕, Escape and a tap on the dimmed page behind.
export function sheet({ title = '', body = [], onClose = () => {}, cls = '', lead = null, closeLabel = '關閉' } = {}) {
  const d = h('dialog', { class: `q-sheet ${cls}`.trim() });
  const close = h('button', { class: 'q-close', type: 'button', 'aria-label': closeLabel, text: '✕', onclick: () => shut() });
  const head = h('div', { class: 'q-sheet-head' }, [lead || h('span'), h('h2', { text: title }), close]);
  d.append(head, ...[].concat(body).filter(Boolean));
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
  d.addEventListener('click', e => {
    if (e.target === d) {
      const r = d.getBoundingClientRect();
      if (e.clientY < r.top || e.clientY > r.bottom || e.clientX < r.left || e.clientX > r.right) shut();
    }
  });
  document.body.append(d);
  d.showModal();
  return { el: d, close: shut, head };
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
export function toast(text, { tone = '', ms = 2200 } = {}) {
  document.querySelector('.q-toast')?.remove();
  const t = h('div', { class: `q-toast${tone ? ` ${tone}` : ''}`, role: 'status', text });
  document.body.append(t);
  setTimeout(() => {
    t.classList.add('out');
    setTimeout(() => t.remove(), 320);
  }, ms);
  return t;
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
// `icon` is a key of `icons` ('ticket': a 56px colour tile, `tint` its
// colour) or anything else (an old emoji: the grey disc it always was).
export function empty({ icon = '', tint = '', title = '', body = '', action = null } = {}) {
  const mark = !icon ? null : isIcon(icon) ? tinted(h('span', { class: 'q-tile q-empty-tile', 'aria-hidden': 'true', html: icons[icon] }), tint) : h('span', { class: 'q-empty-icon', 'aria-hidden': 'true', text: icon });
  return h('div', { class: 'q-empty' }, [mark, title ? h('strong', { text: title }) : null, body ? h('p', { text: body }) : null, action]);
}

// ---- A change of view, cross-faded where Safari can (View Transitions) ----
export function view(change) {
  if (reduced() || !document.startViewTransition) return void change();
  document.startViewTransition(change);
}

// ---- A number that counts to its new value (iOS's numericText) ----
export function countTo(el, to, { from = Number(el.dataset.value) || 0, format = n => Math.round(n).toLocaleString(), ms = 600 } = {}) {
  el.dataset.value = String(to);
  if (reduced() || from === to) return void (el.textContent = format(to));
  const t0 = performance.now();
  const step = t => {
    const p = Math.min(1, (t - t0) / ms);
    const e = 1 - Math.pow(1 - p, 3);
    el.textContent = format(from + (to - from) * e);
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// A segmented control drawn as HTML (an app that redraws a card whole):
// its thumb starts where it was (`from`) and slides to the choice the next
// frame. segHtml([[id, label]…], on, { from, attr: id => attrs }) and, after
// the HTML is in the page, settleSegs().
export function segHtml(list, on, { from = on, attr = () => '', esc = s => String(s).replace(/[&<>"]/g, c => `&#${c.charCodeAt(0)};`) } = {}) {
  const i = Math.max(0, list.findIndex(([k]) => k === on));
  const j = Math.max(0, list.findIndex(([k]) => k === from));
  return `<div class="q-seg" role="tablist" style="--q-seg-n:${list.length};--q-seg-i:${j}" data-to="${i}">${list.map(([k, name]) => `<button type="button" role="tab" aria-selected="${k === on}" ${attr(k)}>${esc(name)}</button>`).join('')}</div>`;
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
// The one thing to do first, on the app's colour: { eyebrow, icon, title,
// big, sub, pill, actions: [{ label, onClick, href, ghost }], href, onClick,
// color, color2 } and any extra children (the app's own element).
export function heroCard({ eyebrow = '', icon = '', title = '', big = '', sub = '', pill = '', actions = [], href = '', onClick = null, color = '', color2 = '' } = {}, children = []) {
  const tag = href ? 'a' : onClick ? 'button' : 'div';
  const c = h(tag, { class: `q-hero-card${tag === 'div' ? '' : ' q-press'}`, ...(href ? { href } : {}), ...(tag === 'button' ? { type: 'button', onclick: onClick } : {}) });
  if (color) c.style.setProperty('--q-hc-b', color);
  if (color2) c.style.setProperty('--q-hc-a', color2);
  if (eyebrow || icon) c.append(h('span', { class: 'q-hc-eyebrow', html: `${icon || ''}<span></span>` }));
  if (eyebrow) c.querySelector('.q-hc-eyebrow span').textContent = eyebrow;
  if (big !== '') c.append(h('strong', { class: 'q-hc-big', text: big }));
  if (title) c.append(h('strong', { class: 'q-hc-title', text: title }));
  if (sub) c.append(h('p', { class: 'q-hc-sub', text: sub }));
  if (pill) c.append(h('span', { class: 'q-hc-pill' }, [h('span', { text: pill }), h('i', { html: icons.send })]));
  if (actions.length) c.append(h('div', { class: 'q-hc-row' }, actions.map(a => h(a.href ? 'a' : 'button', { class: `q-hc-btn${a.ghost ? ' ghost' : ''}`, ...(a.href ? { href: a.href } : { type: 'button', onclick: a.onClick }) }, [a.label]))));
  for (const x of [].concat(children)) if (x) c.append(x);
  return c;
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

// ---- Round 3 premium components (quadra.css "Premium components (round 3)") ----

// A section's head: its title, a count beside it, a link to the rest on the
// right. sectionHead('為你推薦', { count: 4, more: '全部', onMore }); the same
// .q-section-head as section()'s, drawn 20px with a 44px tap target (.q-shd).
export function sectionHead(title, { more = '', onMore = null, moreHref = '', count = null } = {}) {
  const chev = h('span', { html: icons.chevron, style: { display: 'contents' } });
  return h('div', { class: 'q-section-head q-shd' }, [
    h('h2', { text: title }),
    count != null && count !== '' ? h('span', { class: 'q-sh-count num', text: String(count) }) : null,
    more ? h(moreHref ? 'a' : 'button', { class: 'q-sh-more', ...(moreHref ? { href: moreHref } : { type: 'button', onclick: onMore }) }, [more, chev]) : null
  ]);
}

// A logo, the hero of its card: white rounded square, the image contained.
// logoTile(src, { size: 40, alt, fallbackText, tint }). No src (or a broken
// one) shows fallbackText on `tint` instead.
export function logoTile(src, { size = 40, alt = '', fallbackText = '', tint = '' } = {}) {
  const t = h('span', { class: 'q-logo' });
  t.style.setProperty('--s', `${size}px`);
  const text = () => {
    t.className = 'q-logo text';
    t.replaceChildren(String(fallbackText || alt || '').trim().slice(0, 1));
    if (tint) t.style.setProperty('--t', tint);
  };
  if (src) {
    const img = h('img', { src, alt, loading: 'lazy', decoding: 'async' });
    if (fallbackText) img.addEventListener('error', text);
    t.append(img);
  } else if (fallbackText || alt) text();
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
  const t = tag ? (typeof tag === 'string' ? { text: tag } : tag) : null;
  const card = h('article', { class: `q-match${live ? ' live' : ''}${wide ? ' wide' : ''}`, ...(onOpen ? { role: 'button', tabindex: '0', onclick: onOpen, onkeydown: e => e.key === 'Enter' && onOpen(e) } : {}) }, [
    h('div', { class: 'q-match-top' }, [leagueLogo ? logoTile(leagueLogo, { size: 20, alt: league }) : null, h('span', { class: 'q-match-lg', text: league }), t ? tag_(t) : null, h('span', { class: 'q-match-when', text: when })]),
    h('div', { class: 'q-match-teams' }, [side(a), h('div', { class: `q-match-mid num${scored ? '' : ' vs'}`, text: scored ? `${a.score} : ${b.score}` : 'VS' }), side(b)]),
    prices.length
      ? h(
          'div',
          { class: 'q-match-prices' },
          prices.map(p => h('button', { class: 'q-price', type: 'button', 'aria-pressed': String(Boolean(p.selected)), ...(p.locked ? { disabled: true } : {}), onclick: e => (e.stopPropagation(), p.onTap?.(e)) }, [h('small', { text: p.label || '' }), h('b', { class: 'num', text: p.odds == null ? '' : String(p.odds) })]))
        )
      : null
  ]);
  return card;
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
// label, badge, onTap }]). A badge of 0 is not drawn.
export function actionGrid(items) {
  return h(
    'div',
    { class: 'q-actions-grid' },
    items.map(it =>
      h('button', { class: 'q-action', type: 'button', onclick: it.onTap }, [tile(icons[it.icon] || it.icon, it.tint), h('span', { text: it.label }), it.badge ? h('span', { class: 'q-badge', text: String(it.badge) }) : null])
    )
  );
}

// A hero inside a sheet, under its head: sheetHero({ eyebrow, big, sub, tint,
// logos: [src], tags: [text] }). tint is a colour (default the accent).
export function sheetHero({ eyebrow = '', big = '', sub = '', tint = '', logos = [], tags = [] } = {}) {
  const c = h('div', { class: 'q-sheet-hero' }, [
    logos.length ? h('div', { class: 'q-sh-logos' }, logos.map(l => logoTile(l, { size: 48 }))) : null,
    eyebrow ? h('span', { class: 'q-sh-eyebrow', text: eyebrow }) : null,
    big !== '' && big != null ? h('span', { class: 'q-sh-big', text: String(big) }) : null,
    sub ? h('span', { class: 'q-sh-sub', text: sub }) : null,
    tags.length ? h('div', { class: 'q-sh-row' }, tags.map(x => tag_(typeof x === 'string' ? { text: x } : x))) : null
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
// currency }). The number is typed or one preset tapped; .value reads it.
export function stakeInput({ value = 0, presets = [], onChange = () => {}, currency = 'NT$' } = {}) {
  let cur = Number(value) || 0;
  const input = h('input', { type: 'text', inputmode: 'numeric', autocomplete: 'off', 'aria-label': currency, value: String(cur) });
  const btns = presets.map(p => h('button', { type: 'button', onclick: () => set(p, true) }, [Number(p).toLocaleString('en-US')]));
  const paint = () => btns.forEach((b, i) => b.setAttribute('aria-pressed', String(presets[i] === cur)));
  const set = (n, fromTap = false) => {
    cur = Math.max(0, Math.floor(Number(n) || 0));
    if (fromTap || document.activeElement !== input) input.value = String(cur);
    paint();
    onChange(cur);
  };
  input.addEventListener('input', () => set(input.value.replace(/\D/g, '')));
  const root = h('div', { class: 'q-stake' }, [h('label', { class: 'q-stake-amt' }, [h('small', { text: currency }), input]), btns.length ? h('div', { class: 'q-stake-presets' }, btns) : null]);
  root.style.setProperty('--n', String(btns.length || 5));
  paint();
  return Object.defineProperties(root, { value: { get: () => cur }, set: { value: n => set(n, true) } });
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

// A schedule as one wrapping line of whole tokens: schedLine(['17:10', '17:25',
// …]). The first is the one to take (heavier); a token never splits.
export function schedLine(tokens) {
  return h('div', { class: 'q-sched' }, tokens.map(t => h('span', { text: String(t) })));
}

// A ride or plan row: the times over the full-width legs, a star at the
// right: rideRow({ time, legs (a node), starred, onStar, onOpen }).
export function rideRow({ time = '', legs = null, starred = false, onStar = null, onOpen = null, starLabel = '' } = {}) {
  const row = h('div', { class: 'q-ride', ...(onOpen ? { role: 'button', tabindex: '0', onclick: onOpen } : {}) }, [h('div', { class: 'q-ride-time', text: time }), legs ? h('div', { class: 'q-ride-legs' }, [legs]) : null]);
  if (onStar) row.append(h('button', { class: `q-ride-star${starred ? ' on' : ''}`, type: 'button', 'aria-pressed': String(Boolean(starred)), ...(starLabel ? { 'aria-label': starLabel } : {}), html: icons.star, onclick: e => (e.stopPropagation(), onStar(e)) }));
  return row;
}
