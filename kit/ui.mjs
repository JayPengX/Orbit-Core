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

// A haptic tick where the phone gives one (iOS: a switch's own; elsewhere a
// short vibration where allowed).
export function tick() {
  try {
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
export function empty({ icon = '', title = '', body = '', action = null } = {}) {
  return h('div', { class: 'q-empty' }, [icon ? h('span', { class: 'q-empty-icon', 'aria-hidden': 'true', text: icon }) : null, title ? h('strong', { text: title }) : null, body ? h('p', { text: body }) : null, action]);
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
