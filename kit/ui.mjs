// ---- kit/ui.mjs: iOS 27's controls, built the same in every app ----
// The pieces the kit's stylesheet draws (orbit.css, "Components") as DOM,
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
//   loading screen), reorder + grip (a list put in order by dragging); toast's action / batch
//   and segmented's count (see each below).

// { tab: 'ipo' } as data-tab="ipo" attributes (a builder's `data`, for taps wired by delegation).
// (By path, not #kit/: a page whose import map predates format.mjs still loads ui.mjs.)
import { DASH, pct, price as fmtPrice, twDay, addDays as dayAdd } from './format.mjs';
// (A live redraw never moves the page: the kit holds every scroller's place, hold-place.mjs.)
export { scrollBusy, freshScreen } from './hold-place.mjs';
import { letGo } from './hold-place.mjs';

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
// orbitHaptic, iOS's switch trick) and a short vibration where allowed
// (Android; iOS has none, so it's never felt twice).
export function tick() {
  try {
    globalThis.orbitHaptic?.();
    globalThis.navigator?.vibrate?.(8);
  } catch {}
}

// ---- A strip of days: THE date selector of every app (one copy) ----
// dayStrip(s, opts): a row of day chips (the weekday or 今天 over the date)
// and a 📅 for any day, in a bar the app pins under the status bar
// (.q-day-bar; it takes the page's colour once stuck; dayBar makes the bar).
// `s` is the strip's own record, kept by the app ({} the first time): the
// strip is made once and changed in place on every draw after (a new row
// under a finger made it jump on iPhone, a new date input closed iOS's
// open picker). A swipe across the page goes a day either way (daySwipe,
// dayStep).
//   days: the days shown ('YYYY-MM-DD', in order); current: the day chosen;
//   onPick(day): a day chosen (a tap, 📅); label(day) / sub(day): a chip's
//   two lines (dayTop / dayNum unless given); today (Taiwan's unless given);
//   cls(day): more classes for a chip (none unless given; a new month needs no
//   mark: its date says 11/1, and a line at its edge showed beside 📅 as a stray divider);
//   clamp(day): the day 📅's date becomes (unless given: the first shown
//   on or after it, else the last); bounds {from, to}: 📅's limits (the
//   days' ends unless given; null: none); follow: every new day to the middle, a tapped
//   one too; pickLabel: 📅's name; lang: 'zh' | 'en' (the page's).
// Returns the strip (.q-day-strip-wrap) to put in the bar.
// (The page's lang, else the Orbit language saved by any app: the kit's own words follow it.)
const pageLang = () => {
  const html = globalThis.document?.documentElement?.lang || '';
  if (html) return /^en/i.test(html) ? 'en' : 'zh';
  try {
    return globalThis.localStorage?.getItem('orbit.lang') === 'en' ? 'en' : 'zh';
  } catch {
    return 'zh';
  }
};
const dayLang = lang => lang || pageLang();
const kitW = (zh, en) => (pageLang() === 'en' ? en : zh);
// Taiwan's today, 'YYYY-MM-DD'.
export const dayToday = () => twDay(Date.now());
// The days from `from` to `to` ('YYYY-MM-DD', both kept), in order.
export function dayList(from, to) {
  const out = [];
  for (let d = from; d && to && d <= to && out.length < 800; d = dayAdd(d, 1)) out.push(d);
  return out;
}
// A chip's top line: 今天 / 明天 / 昨天, else the weekday (週三, Wed).
export function dayTop(d, { today = dayToday(), lang } = {}) {
  const zh = dayLang(lang) === 'zh';
  if (d === today) return zh ? '今天' : 'Today';
  if (d === dayAdd(today, 1)) return zh ? '明天' : 'Tmrw';
  if (d === dayAdd(today, -1)) return zh ? '昨天' : 'Yday';
  const wd = new Date(`${d}T12:00:00Z`).getUTCDay();
  return zh ? `週${'日一二三四五六'[wd]}` : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][wd];
}
// Its date: 10/22 (26/1/3 in another year).
export function dayNum(d, { today = dayToday() } = {}) {
  const [y, m, n] = d.split('-').map(Number);
  return `${y !== Number(today.slice(0, 4)) ? `${String(y).slice(2)}/` : ''}${m}/${n}`;
}
// The day before or after `current` among `days` (null at an end, or when it isn't one of them).
export function dayStep(days, current, dir) {
  const i = days.indexOf(current);
  return i < 0 ? null : days[i + dir] ?? null;
}
// The bar the strip sits in, made once into s.bar: pinned under the status
// bar (a page's), or `flat` where it sits in a sheet or a card. Every later
// call changes the strip in place; the bar is the same node.
export function dayBar(s, { flat = false, ...opts } = {}) {
  const strip = dayStrip(s, opts);
  s.bar ??= h('div', { class: `q-day-bar${flat ? ' flat' : ''}` });
  if (strip.parentElement !== s.bar) s.bar.replaceChildren(strip);
  return s.bar;
}
const CAL_ICON = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4.5" width="18" height="16.5" rx="3"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4"/><path d="M7.5 13.5h2M11 13.5h2M14.5 13.5h2M7.5 17h2M11 17h2"/></svg>';
export function dayStrip(s, { days = [], current = null, onPick = () => {}, label = null, sub = null, today = dayToday(), cls = null, clamp = null, bounds, follow = false, pickLabel = '', lang } = {}) {
  label ??= d => dayTop(d, { today, lang });
  sub ??= d => dayNum(d, { today });
  cls ??= () => '';
  clamp ??= v => days.find(d => d >= v) ?? days.at(-1) ?? v;
  if (bounds === undefined) bounds = days.length ? { from: days[0], to: days.at(-1) } : null;
  pickLabel ||= dayLang(lang) === 'zh' ? '選擇日期' : 'Pick a date';
  if (!s.row) {
    s.row = h('div', { class: 'q-chips q-day-strip day-strip' });
    // A tap: the chip shows it at once, the page follows off the tap's stack.
    s.pick = d => {
      for (const chip of s.row.children) chip.setAttribute('aria-pressed', String(chip.dataset.day === d));
      s.tapped = true;
      requestAnimationFrame(() => setTimeout(() => s.onPick(d)));
    };
    // Any day: the browser's own picker, its day taken the moment it's chosen
    // (the page behind changes, the picker stays open on iPhone).
    s.input = h('input', { class: 'q-day-pick-input day-pick-input', type: 'date', 'aria-label': pickLabel });
    s.input.addEventListener('change', () => {
      if (!s.input.value) return;
      const d = s.clamp(s.input.value);
      if (d && d !== s.current) s.onPick(d);
    });
    // Closed: it shows the day picked (one past the bounds, which iOS lets through, shows where it came to).
    s.input.addEventListener('blur', () => daySync(s));
    // (The edges fade only where there's more to scroll: the first chip, chosen, is never faded or cut.)
    s.edges = () => {
      const r = s.row;
      r.classList.toggle('q-more-before', r.scrollLeft > 1);
      r.classList.toggle('q-more-after', r.scrollLeft + r.clientWidth < r.scrollWidth - 1);
    };
    // Whole days only: as many chips as fit, sharing the row's width (never one
    // cut in half beside the 📅), each at least 62px (the date with room on iPhone's
    // wider digits); the row comes to rest on a chip's edge. (The look can say
    // otherwise: Native's week row is seven days, each at least 40px:
    // --q-day-n and --q-day-min on the row.)
    s.fit = () => {
      const r = s.row;
      if (!r.clientWidth) return;
      const cs = getComputedStyle(r);
      const room = r.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      const gap = parseFloat(cs.columnGap) || 0;
      const least = parseFloat(cs.getPropertyValue('--q-day-min')) || 62;
      const most = parseFloat(cs.getPropertyValue('--q-day-n')) || Infinity;
      const n = Math.max(1, Math.min(most, Math.floor((room + gap) / (least + gap))));
      const w = `${Math.floor(((room - gap * (n - 1)) / n) * 10) / 10}px`;
      if (r.style.getPropertyValue('--q-day-w') !== w) {
        r.style.setProperty('--q-day-w', w);
        // (Every chip a new width: the scroll that centred the chosen day is
        // stale (a computer's wide row left it half out of view). Centred again.)
        const chip = r.querySelector('[aria-pressed="true"]');
        if (chip) r.scrollLeft = chip.offsetLeft - r.offsetLeft - r.clientWidth / 2 + chip.clientWidth / 2;
      }
      s.edges();
    };
    s.row.addEventListener('scroll', s.edges, { passive: true });
    if (typeof ResizeObserver !== 'undefined') new ResizeObserver(s.fit).observe(s.row);
    s.wrap = h('div', { class: 'q-day-strip-wrap day-strip-wrap' }, [s.row, h('label', { class: 'q-chip q-day-pick day-pick', title: pickLabel }, [h('span', { class: 'day-pick-icon', 'aria-hidden': 'true', html: CAL_ICON }), s.input])]);
  }
  Object.assign(s, { onPick, bounds, clamp });
  // Back on the page after another view: on its day at once.
  if (!s.row.isConnected) (s.shown = false), (s.reveal = 'center');
  // Other days (a sport picked, midnight, the language): the chips made again
  // inside the same row, the day first in view kept where it was.
  const key = `${today}|${days.join()}|${days.map(d => label(d) + sub(d)).join()}`;
  if (key !== s.key) {
    const anchor = s.row.isConnected && s.row.clientWidth ? firstDayInView(s.row) : null;
    s.row.replaceChildren(...days.map(d => h('button', { class: `q-chip day${d === today ? ' is-today' : ''}${cls(d) ? ` ${cls(d)}` : ''}`, type: 'button', 'aria-pressed': String(d === current), 'data-day': d, onclick: () => s.pick(d) }, [h('span', { text: label(d) }), h('small', { class: 'num', text: sub(d) })])));
    s.key = key;
    const again = anchor && s.row.querySelector(`[data-day="${anchor.day}"]`);
    if (again) s.row.scrollLeft += again.getBoundingClientRect().left - s.row.getBoundingClientRect().left - anchor.at;
    else s.reveal ??= 'jump';
  }
  for (const chip of s.row.children) chip.setAttribute('aria-pressed', String(chip.dataset.day === current));
  // A day chosen elsewhere (📅, a swipe): brought into view; one tapped on the
  // strip is in view already and stays where it is, unless `follow`.
  if (current !== s.current) {
    if (s.current !== undefined && (!s.tapped || follow)) s.reveal ??= 'center';
    s.current = current;
  }
  s.tapped = false;
  if (s.current != null && !s.shown) s.reveal ??= 'center';
  // (The input never touched while it's open: iOS's picker would close.)
  if (document.activeElement !== s.input) daySync(s);
  if (s.reveal) dayReveal(s);
  s.edges();
  return s.wrap;
}
// A section switched to (a tab, a door, a topic) comes in from the side of
// the one it's beside, a short glide on the screen's own thread (opacity and
// a move: nothing laid out again), never a cut (Jay 2026-11-14: "switching
// between these should be more animated and smooth"). dir: 1 from the right,
// -1 from the left, 0 rising in place. Returns the animation (or null).
export const GLIDE_MS = 240;
export function glideIn(el, dir = 0) {
  if (!el || reduced() || typeof el.animate !== 'function') return null;
  el.getAnimations?.().forEach(a => a.id === 'q-glide' && a.cancel());
  const from = dir ? `translateX(${Math.sign(dir) * 24}px)` : 'translateY(8px)';
  const a = el.animate([{ transform: from, opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: GLIDE_MS, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' });
  a.id = 'q-glide';
  return a;
}
// dayStrip's record: the next draw brings the chosen day to the middle, at
// once (days come in, the page drawn again: nobody moved, nothing glides;
// Jay 2026-11-14, Law's 議程 "animate and scroll when I come").
export const dayRecenter = s => void (s.reveal = 'jump');
function daySync(s) {
  const v = s.clamp(s.current || new Date().toISOString().slice(0, 10)) || '';
  if (s.input.value !== v) s.input.value = v;
  for (const [k, b] of [['min', s.bounds?.from], ['max', s.bounds?.to]]) b ? s.input.setAttribute(k, b) : s.input.removeAttribute(k);
}
function firstDayInView(row) {
  const left = row.getBoundingClientRect().left;
  const chip = [...row.children].find(c => c.getBoundingClientRect().right > left + 1);
  return chip ? { day: chip.dataset.day, at: chip.getBoundingClientRect().left - left } : null;
}
// The chosen chip to the middle of the row once the row has a width (drawn
// under the loading screen it has none): at once the first time and when the
// days were only drawn again ('jump'), gently for a day the person chose.
function dayReveal(s) {
  const go = () => {
    const chip = s.row.querySelector('[aria-pressed="true"]');
    if (!chip || !s.row.isConnected || !s.row.clientWidth) return false;
    s.row.scrollTo({ left: chip.offsetLeft - s.row.offsetLeft - s.row.clientWidth / 2 + chip.clientWidth / 2, behavior: s.shown && s.reveal !== 'jump' ? 'smooth' : 'auto' });
    s.reveal = null;
    s.shown = true;
    return true;
  };
  requestAnimationFrame(() => {
    if (go() || typeof ResizeObserver === 'undefined' || s.waiting) return;
    s.waiting = new ResizeObserver(() => s.row.clientWidth && (s.waiting.disconnect(), (s.waiting = null), s.reveal && go()));
    s.waiting.observe(s.row);
  });
}
// A swipe across a page or a sheet's days (not across a row that scrolls
// sideways, a field or the strip): step(+1 | -1) goes a day either way and
// says whether it did; the page follows the finger and the new day slides
// in (.q-day-swipe; the strip, a sheet's head and a .q-day-still stay put).
// `can(dir)`: is there anything that way now (false: the page never follows
// the finger, a drag that leads nowhere; Jay 2026-11-11, Law's 議會: "it can
// swipe left and right but it does nothing"); `page: false`: only a finger on
// the panel itself (a part of a page, not the whole page's days).
export function daySwipe(panel, step, { can = null, page = true } = {}) {
  if (!panel) return;
  panel.classList.add('q-day-swipe');
  let start = null;
  // What a finger lands on: true (its own swipe: a field, a chip row), a
  // box scrolling sideways (its swipe while it can go that way; at its edge
  // the page's: a bracket's first round, swiped right, goes back a tab), or null.
  const sideways = node => {
    for (let n = node; n && n !== panel; n = n.parentElement) {
      if (n.matches?.('input, select, textarea, .q-seg, .q-day-bar, .day-bar, [data-noswipe]')) return true;
      if (n.scrollWidth > n.clientWidth + 2 && /auto|scroll/.test(getComputedStyle(n).overflowX)) return n;
    }
    return null;
  };
  const canScroll = (n, dx) => (dx < 0 ? n.scrollLeft + n.clientWidth < n.scrollWidth - 2 : n.scrollLeft > 2);
  // Let go: the page goes back under the finger's drag the same way every
  // time, gliding home (`back`: a swipe too short, or nothing beside), never
  // snapping (Jay 2026-11-05, Weather: "swipe animation is inconsistent").
  const settle = (back = false) => {
    if (back && panel.classList.contains('swiping') && !reduced()) {
      panel.classList.add('swipe-back');
      clearTimeout(panel.backTimer);
      panel.backTimer = setTimeout(() => panel.classList.remove('swipe-back'), SWIPE_BACK_MS + 40);
    }
    panel.classList.remove('swiping');
    panel.style.removeProperty('--swipe');
    panel.style.removeProperty('--swipe-fade');
  };
  const begin = (ev, src) => {
    // (Not under a sheet: one open over the page has the finger; a panel inside that sheet swipes.)
    const over = [...document.querySelectorAll('dialog[open]')].some(d => !d.contains(panel));
    const box = ev.touches.length === 1 && !over ? (src === 'panel' ? sideways(ev.target) : null) : true;
    start = box !== true ? { x: ev.touches[0].clientX, y: ev.touches[0].clientY, at: Date.now(), lock: null, box, src } : null;
  };
  const move = ev => {
    const dx = ev.touches[0].clientX - start.x;
    const dy = ev.touches[0].clientY - start.y;
    if (start.lock == null && Math.hypot(dx, dy) > 10) start.lock = Math.abs(dx) > Math.abs(dy) * 1.3 && !(start.box && canScroll(start.box, dx)) && (!can || can(dx < 0 ? 1 : -1)) ? 'x' : 'y';
    if (start.lock !== 'x') return;
    ev.preventDefault();
    // (A slide still running lets go of the page: the finger has it now.)
    if (!panel.classList.contains('swiping')) stopSlide(panel);
    panel.classList.remove('swipe-back');
    panel.classList.add('swiping');
    panel.style.setProperty('--swipe', `${Math.round(dx * 0.45)}px`);
    // (Fading as it goes, never a step down the moment the drag starts.)
    panel.style.setProperty('--swipe-fade', String(Math.round((1 - Math.min(Math.abs(dx) / 600, 0.2)) * 100) / 100));
  };
  const end = ev => {
    const s = start;
    start = null;
    if (!s || s.lock !== 'x') return settle(true);
    const dx = (ev.changedTouches?.[0]?.clientX ?? s.x) - s.x;
    const fast = Math.abs(dx) > 30 && Date.now() - s.at < 250;
    const dir = Math.abs(dx) > 70 || fast ? (dx < 0 ? 1 : -1) : 0;
    // (Drawn while the drag still holds it, in the same moment: nothing painted between.)
    if (!dir || !step(dir)) return settle(true);
    settle();
    slideIn(panel, dir);
  };
  panel.addEventListener('touchstart', ev => begin(ev, 'panel'), { passive: true });
  panel.addEventListener('touchmove', ev => start?.src === 'panel' && move(ev), { passive: false });
  panel.addEventListener('touchend', ev => (!start || start.src === 'panel') && end(ev), { passive: true });
  panel.addEventListener('touchcancel', () => ((start = null), settle(true)), { passive: true });
  // Two fingers sideways on a trackpad (a Mac's, a PC's precision one: a
  // wheel going sideways) do what a finger's swipe does (Jay 2026-11-14:
  // "let's support it"): the page follows, then the day or place beside, one
  // step a gesture, its glide after it never a second step. Up and down stays
  // the page's scroll; a row that scrolls sideways keeps its own; with
  // nothing beside, the browser's own back swipe is left alone.
  const W = { acc: 0, done: false, timer: 0 };
  const wheelEnd = () => {
    if (!W.done) settle(true);
    W.acc = 0;
    W.done = false;
  };
  panel.addEventListener(
    'wheel',
    ev => {
      if (ev.ctrlKey || Math.abs(ev.deltaX) <= Math.abs(ev.deltaY) * 1.5) return;
      const over = [...document.querySelectorAll('dialog[open]')].some(d => !d.contains(panel));
      const box = over ? true : sideways(ev.target);
      const dir = ev.deltaX > 0 ? 1 : -1;
      if (box === true || (box && canScroll(box, -ev.deltaX)) || (can && !can(dir) && !W.acc)) return;
      ev.preventDefault();
      clearTimeout(W.timer);
      W.timer = setTimeout(wheelEnd, 180);
      if (W.done) return;
      W.acc += ev.deltaX * (ev.deltaMode === 1 ? 16 : 1);
      if (Math.abs(W.acc) >= 110) {
        W.done = true;
        const d = W.acc > 0 ? 1 : -1;
        if (!step(d)) return settle(true);
        settle();
        return slideIn(panel, d);
      }
      if (!panel.classList.contains('swiping')) stopSlide(panel);
      panel.classList.remove('swipe-back');
      panel.classList.add('swiping');
      panel.style.setProperty('--swipe', `${Math.round(-W.acc * 0.45)}px`);
    },
    { passive: false }
  );
  // The page's empty space swipes too, not only what's drawn on it (Jay
  // 2026-11-06, Sports on an iPad: below a short day, nothing moved): a
  // finger on what holds the panel (the page, its main) while the panel
  // shows; never in a sheet (its backdrop is the sheet's), never on a bar or
  // anything else beside the panel. Let go once the panel is gone.
  if (!page) return;
  let seen = false;
  const onPage = ev => {
    if (!panel.isConnected) return seen && off();
    seen = true;
    const t = ev.target;
    if (panel.contains(t) || !t?.contains?.(panel) || panel.closest('dialog, [hidden]') || !panel.getClientRects().length) return;
    begin(ev, 'page');
  };
  const pageMove = ev => start?.src === 'page' && move(ev);
  const pageEnd = ev => start?.src === 'page' && end(ev);
  const pageCancel = () => start?.src === 'page' && ((start = null), settle(true));
  const off = () => {
    document.removeEventListener('touchstart', onPage);
    document.removeEventListener('touchmove', pageMove);
    document.removeEventListener('touchend', pageEnd);
    document.removeEventListener('touchcancel', pageCancel);
  };
  document.addEventListener('touchstart', onPage, { passive: true });
  document.addEventListener('touchmove', pageMove, { passive: false });
  document.addEventListener('touchend', pageEnd, { passive: true });
  document.addEventListener('touchcancel', pageCancel, { passive: true });
}
// The new day or place comes in from the side the finger sent it, the same
// slide every time: started on the parts drawn by step(); a part drawn again
// while it runs (an answer landing) carries on from the same moment instead
// of starting over, and parts drawn after it stand still.
export const SWIPE_IN_MS = 280;
export const SWIPE_BACK_MS = 240;
const DAY_STILL = '.q-day-bar, .q-sheet-head, .q-day-still';
function stopSlide(panel) {
  panel.slideStop?.();
  for (const a of panel.slides || []) a.cancel?.();
  panel.slides = [];
}
function slideIn(panel, dir) {
  stopSlide(panel);
  if (reduced()) return;
  // (No Web Animations: the old way, by class.)
  if (typeof panel.animate !== 'function') {
    panel.classList.remove('day-in-next', 'day-in-prev');
    void panel.offsetWidth;
    panel.classList.add(dir > 0 ? 'day-in-next' : 'day-in-prev');
    clearTimeout(panel.swipeTimer);
    panel.swipeTimer = setTimeout(() => panel.classList.remove('day-in-next', 'day-in-prev'), SWIPE_IN_MS + 40);
    return;
  }
  const frames = [{ transform: `translateX(${dir * 36}px)`, opacity: 0 }, { transform: 'none', opacity: 1 }];
  const t0 = globalThis.performance?.now?.() ?? Date.now();
  const go = (el, done = 0) => {
    if (el.nodeType !== 1 || el.matches?.(DAY_STILL)) return;
    const a = el.animate(frames, { duration: SWIPE_IN_MS, delay: -done, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' });
    panel.slides.push(a);
  };
  for (const el of [...panel.children]) go(el);
  const watch = typeof MutationObserver === 'function'
    ? new MutationObserver(list => {
        const done = (globalThis.performance?.now?.() ?? Date.now()) - t0;
        if (done >= SWIPE_IN_MS) return panel.slideStop?.();
        for (const m of list) for (const n of m.addedNodes) if (n.parentNode === panel) go(n, done);
      })
    : null;
  watch?.observe(panel, { childList: true });
  const timer = setTimeout(() => panel.slideStop?.(), SWIPE_IN_MS + 40);
  panel.slideStop = () => {
    watch?.disconnect();
    clearTimeout(timer);
    panel.slideStop = null;
  };
}
// A day bar stuck under the status bar takes the page's colour (.stuck); at
// rest it has none. Every .q-day-bar, nothing to call.
if (typeof document !== 'undefined' && !globalThis.__orbitDayBars) {
  globalThis.__orbitDayBars = true;
  globalThis.addEventListener?.('scroll', () => {
    for (const bar of document.querySelectorAll('.q-day-bar')) if (bar.isConnected && bar.offsetParent) bar.classList.toggle('stuck', globalThis.scrollY > 0 && bar.getBoundingClientRect().top <= parseFloat(getComputedStyle(bar).top) + 0.5);
  }, { passive: true });
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

// The same control for a view that draws itself again on each pick:
//   pickSeg([[id, label, count?] | { id, label, count }…], current, onPick, { cls, chips, seg, label })
// A few (four, or up to seven with `seg`) are the capsule, its thumb sliding
// from the last pick (remembered per cls and set of ids); more, or
// `chips`, are the chips row that scrolls. Buttons are aria-pressed, and a
// tap on the one already on does nothing.
const lastPicks = new Map();
export function pickSeg(options, current, onPick, { cls = '', chips = false, seg = false, label = '' } = {}) {
  const list = options.map(o => (Array.isArray(o) ? { id: o[0], label: o[1], count: o[2] } : o));
  const few = !chips && (list.length <= 4 || (seg && list.length <= 7));
  const attrs = { class: `${few ? 'q-seg' : 'q-chips'} ${cls}`.trim(), role: 'group', ...(label ? { 'aria-label': label } : {}) };
  // (The pick kept here as it changes: a row the app doesn't draw again on
  // a pick still shows it, and a tap back on the first one isn't ignored.)
  let now = current;
  const pick = id => {
    if (id === now) return;
    now = id;
    buttons.forEach((b, i) => b.setAttribute('aria-pressed', String(list[i].id === id)));
    if (few) root.style.setProperty('--q-seg-i', String(at(id)));
    onPick(id);
  };
  const buttons = list.map(o =>
    h('button', { type: 'button', ...(few ? {} : { class: 'q-chip' }), 'aria-pressed': String(o.id === current), onclick: () => pick(o.id) }, [o.label, segBadge(o.count)])
  );
  let root = null;
  if (!few) return (root = h('div', attrs, buttons));
  const key = `${cls}:${list.map(o => o.id).join('|')}`;
  const at = id => Math.max(0, list.findIndex(o => o.id === id));
  const from = lastPicks.has(key) ? lastPicks.get(key) : current;
  lastPicks.set(key, current);
  const to = String(at(current));
  root = h('div', { ...attrs, style: `--q-seg-n:${list.length};--q-seg-i:${at(from)}`, 'data-to': to }, buttons);
  // (Not in the page yet: no slide, straight to the pick.)
  queueMicrotask(() => {
    if (root.isConnected) return settleSegs(root.parentNode);
    root.style.setProperty('--q-seg-i', to);
    root.removeAttribute('data-to');
  });
  return root;
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
// dimmed page and a swipe down all close it the same way (orbit.mjs's
// closeSheet: it slides to the foot), and onClose fires once.
const DETENTS = ['medium', 'large'];
// A sheet's size: 'medium' (half the screen) or 'large' (full less the top).
// A sheet opened medium stays expandable (data-expandable), and the swipe in
// orbit.mjs moves it between the two.
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
    // (orbit.mjs's closeSheet: the slide down, every app's sheets alike.)
    (globalThis.orbitCloseSheet || (x => x.close()))(d);
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
export function sheet({ title = '', body = [], onClose = () => {}, cls = '', lead = null, trailing = null, detent = '', foot = null, closeLabel = kitW('關閉', 'Close'), label = '', subtitle = '' } = {}) {
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
// items: [{ label, icon?, lead?, danger?, onClick } | 'divider'] from `anchor`
// (lead: a picture before the label, an account's logo):
// glass that grows out of it, closed by a choice, a tap elsewhere or Escape.
export function menu(anchor, items) {
  document.querySelector('.q-menu')?.remove();
  const m = h('div', { class: 'q-menu', role: 'menu' });
  for (const it of items) {
    if (it === 'divider') m.append(h('hr'));
    else
      m.append(
        h('button', { type: 'button', role: 'menuitem', class: it.danger ? 'danger' : '', onclick: () => (shut(), it.onClick?.()) }, [it.lead ? h('span', { class: 'q-menu-lead', 'aria-hidden': 'true' }, [it.lead]) : null, h('span', { text: it.label }), it.icon ? h('span', { 'aria-hidden': 'true', text: it.icon }) : null])
      );
  }
  // (Inside an open sheet when it's from one: a menu in the page lay under the
  // sheet, out of sight, and the tap meant for it closed the sheet: Money's
  // 付款方式, Jay 2026-10-27.)
  const host = anchor.closest?.('dialog[open]') || document.body;
  // (A sheet that moves, as one sliding up does, places its fixed children
  // from its own corner, not the screen's: a probe there finds how far off
  // that corner is, and the menu is measured at the screen's corner with all
  // its width, so nothing lands off screen or squeezed. iPhone, Jay 2026-10-27.)
  const probe = h('i', { style: 'position:fixed;left:0;top:0;width:0;height:0;visibility:hidden' });
  host.append(probe);
  const o = probe.getBoundingClientRect();
  probe.remove();
  Object.assign(m.style, { left: `${-o.left}px`, top: `${-o.top}px`, maxWidth: `${innerWidth - 32}px` });
  host.append(m);
  const r = anchor.getBoundingClientRect();
  const w = m.offsetWidth;
  const left = Math.min(Math.max(16, r.right - w), innerWidth - w - 16);
  const below = r.bottom + 8 + m.offsetHeight < innerHeight - 16;
  const top = below ? r.bottom + 8 : Math.max(16, r.top - 8 - m.offsetHeight);
  Object.assign(m.style, { left: `${left - o.left}px`, top: `${top - o.top}px` });
  m.style.setProperty('--q-menu-origin', `${r.left + r.width / 2 - left}px ${below ? '0' : '100%'}`);
  const off = e => {
    if (!m.contains(e.target)) shut();
  };
  // (Escape closes the menu alone: let through, it also closed the sheet the
  // menu came from, and what was typed there with it. Money, 2026-11-12.)
  const key = e => e.key === 'Escape' && (e.preventDefault(), e.stopPropagation(), shut());
  setTimeout(() => (document.addEventListener('pointerdown', off, true), document.addEventListener('keydown', key, true)));
  function shut() {
    document.removeEventListener('pointerdown', off, true);
    document.removeEventListener('keydown', key, true);
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
  // (A toast taken away is marked gone first: a sheet's watch below never puts it back.)
  const drop = el => el && (el.classList?.add('out'), el.remove());
  if (again) {
    clearTimeout(prev.timer);
    clearTimeout(prev.gone);
    drop(prev.el);
  }
  drop(document.querySelector('.q-toast'));
  const label = n > 1 ? `${text} ×${n}` : text;
  const t = h('div', { class: `q-toast${tone ? ` ${tone}` : ''}`, role: 'status', ...(action || n > 1 ? {} : { text }) });
  const mine = { el: t, key: batch, text, n, timer: 0, gone: 0 };
  const close = () => {
    clearTimeout(mine.timer);
    t.classList.add('out');
    mine.gone = setTimeout(() => (t.remove(), mine.watch?.disconnect()), 320);
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
  // Over an open sheet (a modal dialog: the page under it is inert, its 復原
  // couldn't be tapped): inside the sheet, as a popover in the top layer
  // above it, so it sits at the screen's foot whatever the sheet's scroll.
  // (Not one sliding away: a toast put in the sheet that a save had just
  // closed left with it half a second later, 記好了 and its 復原 too. And
  // should its sheet close while it's up, it moves to the page. Money, 2026-11-12.)
  const over = [...(document.querySelectorAll?.('dialog[open]') || [])].filter(x => !x.classList?.contains('q-leaving')).at(-1);
  if (over && typeof t.showPopover === 'function') {
    const show = () => {
      over.append(t);
      try {
        t.setAttribute('popover', 'manual');
        t.showPopover();
      } catch {}
    };
    show();
    // A sheet that draws itself again (its innerHTML: Transit's place sheet
    // every 20 s, and as a bus pinned from it is saved) took the toast with it
    // at once: 已加入「上學」 never seen (Transit, 2026-11-12). Put back while it's up.
    const watch = typeof MutationObserver === 'function' ? new MutationObserver(() => !t.isConnected && !t.classList.contains('out') && over.open && show()) : null;
    watch?.observe(over, { childList: true });
    mine.watch = watch;
    over.addEventListener?.(
      'close',
      () => {
        watch?.disconnect();
        if (t.parentElement !== over || t.classList.contains('out')) return;
        try {
          t.hidePopover?.();
        } catch {}
        t.removeAttribute('popover');
        document.body.append(t);
      },
      { once: true }
    );
  } else document.body.append(t);
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
export function list(rows, { head = '', foot = '', big = false, ai = false } = {}) {
  const frag = h('section', { class: 'q-list-group' });
  if (head) frag.append(ai ? h('h3', { class: `q-list-head q-h-ai${big ? ' big' : ''}` }, [aiMark(), h('span', { text: head })]) : h('h3', { class: `q-list-head${big ? ' big' : ''}`, text: head }));
  frag.append(h('div', { class: 'q-list' }, rows));
  if (foot) frag.append(h('p', { class: 'q-list-foot', text: foot }));
  return frag;
}

// ---- Search field ----
export function search({ placeholder = kitW('搜尋', 'Search'), value = '', onInput = () => {}, onSubmit = null, label = placeholder } = {}) {
  const input = h('input', { type: 'search', placeholder, 'aria-label': label, enterkeyhint: 'search', autocomplete: 'off', autocorrect: 'off', spellcheck: 'false' });
  input.value = value;
  const clear = h('button', { class: 'q-search-clear', type: 'button', 'aria-label': kitW('清除', 'Clear'), text: '✕', onclick: () => ((input.value = ''), input.focus(), onInput('')) });
  input.addEventListener('input', () => onInput(input.value));
  // Enter sends: never while 注音/IME is still choosing (that Enter only commits the word), and the
  // key's default is stopped, so a sheet the search opens isn't shut by the same key landing on its ✕.
  if (onSubmit) input.addEventListener('keydown', e => e.key === 'Enter' && !e.isComposing && e.keyCode !== 229 && (e.preventDefault(), onSubmit(input.value)));
  const box = h('label', { class: 'q-search' }, [input, clear]);
  return Object.assign(box, { input });
}

// ---- Switch ----
export function toggle({ checked = false, onChange = () => {}, label = '' } = {}) {
  const b = h('button', { class: 'q-switch', type: 'button', role: 'switch', 'aria-checked': String(Boolean(checked)), ...(label ? { 'aria-label': label } : {}) });
  b.addEventListener('click', () => {
    const on = b.getAttribute('aria-checked') !== 'true';
    b.setAttribute('aria-checked', String(on));
    // (Felt and dragged by orbit.mjs's switchGlide, as every switch is.)
    onChange(on);
  });
  return b;
}

// ---- Reorder: a list put in order by its grips (Jay 2026-11-03) ----
// One way in every app to put rows in order: each row carries a grip (three
// lines, `grip()` / `gripHtml()`) at its end; a finger on it lifts the row,
// the row follows the finger, the others slide aside to make its room, and
// it settles where it's let go. No arrows, no tap-then-往後.
//   reorder(container, { items, onChange, label })
// container: the box holding the rows (a .q-list, a .q-rowcard); items: the
// rows inside it (default its children with data-q-key); onChange(keys,
// { from, to }) once a row has moved, keys in their new order (the row's
// data-q-key), the DOM already in that order (the app saves; it needn't
// redraw). Wired once on the container by delegation, so the app may
// redraw the rows inside it. On a touch screen the grip is held still a
// moment (HOLD_MS) before the row lifts: a swipe through it scrolls the
// list, as everywhere else. Keyboard: the grip is a button, ↑ and ↓ move
// its row one place. Returns a function that unwires it.
const GRIP_HOLD_MS = 150;
const GRIP_SLOP = 8;
const GRIP_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 8h14M5 12h14M5 16h14"/></svg>';
export function grip(label = kitW('拖曳排序', 'Drag to reorder')) {
  return h('button', { class: 'q-grip', type: 'button', 'aria-label': label, 'data-no-sheet-swipe': '', html: GRIP_SVG });
}
export function gripHtml(label = kitW('拖曳排序', 'Drag to reorder')) {
  return `<button class="q-grip" type="button" aria-label="${escHtml(label)}" data-no-sheet-swipe>${GRIP_SVG}</button>`;
}
// Where a row lifted from `from` lands with its middle at `y`: rows are
// [{ top, height }] as laid out before the lift (pure, for the tests).
export function reorderSlot(rows, from, y) {
  let to = from;
  for (let j = from + 1; j < rows.length; j++) if (y > rows[j].top + rows[j].height / 2) to = j;
  for (let j = from - 1; j >= 0; j--) if (y < rows[j].top + rows[j].height / 2) to = j;
  return to;
}
// keys with the one at `from` moved to `to` (pure).
export function moveKey(keys, from, to) {
  const out = [...keys];
  if (from < 0 || from >= out.length || to < 0 || to >= out.length) return out;
  out.splice(to, 0, ...out.splice(from, 1));
  return out;
}
const scrollBoxOf = n => {
  for (let k = n?.parentElement; k && k !== document.body && k !== document.documentElement; k = k.parentElement) {
    if (k.scrollHeight > k.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(k).overflowY)) return k;
  }
  return document.scrollingElement;
};
export function reorder(container, { items = ':scope > [data-q-key]', onChange = () => {}, label = '' } = {}) {
  if (!container) return () => {};
  container.__qReorder?.();
  container.classList.add('q-reorder');
  if (label) container.setAttribute('aria-label', label);
  const rowsOf = () => [...container.querySelectorAll(items)];
  const keyOf = n => n.getAttribute('data-q-key');
  const done = (from, to) => from !== to && onChange(rowsOf().map(keyOf), { from, to });
  // The DOM in its new order (the row put before the one now after it).
  const place = (list, row, to) => {
    const rest = list.filter(n => n !== row);
    const after = rest[to];
    if (after) after.before(row);
    else rest.at(-1)?.after(row);
  };
  let g = null;
  const viewOf = s => (s === document.scrollingElement ? { top: 0, bottom: innerHeight } : s.getBoundingClientRect());
  const clear = list => {
    for (const n of list) {
      n.style.transform = '';
      n.style.transition = '';
      n.classList.remove('q-reorder-lift', 'q-reorder-shift');
    }
    container.classList.remove('q-reordering');
  };
  const paint = () => {
    const { row, list, rows, from, s, y0, s0 } = g;
    const r = rows[from];
    const top = rows[0].top;
    const bottom = rows.at(-1).top + rows.at(-1).height;
    // Within the list's own ends (never dragged out of it); its place follows the finger,
    // so past either end it is first or last (the drawn row, held at the end, sits on that
    // row's middle and never crossed it).
    const want = g.y - y0 + (s.scrollTop - s0);
    const dy = Math.max(top - r.top, Math.min(bottom - r.top - r.height, want));
    row.style.transform = `translate3d(0, ${dy}px, 0)`;
    const to = reorderSlot(rows, from, r.top + want + r.height / 2);
    if (to !== g.to) {
      g.to = to;
      tick();
    }
    // The rows between make room: each slides by the lifted row's step.
    list.forEach((n, j) => {
      if (n === row) return;
      const by = from < to && j > from && j <= to ? -g.step : from > to && j < from && j >= to ? g.step : 0;
      n.style.transform = by ? `translate3d(0, ${by}px, 0)` : '';
    });
  };
  // Near the top or the foot of what scrolls: it scrolls, the row with it.
  const roll = () => {
    if (!g?.lifted) return;
    const v = viewOf(g.s);
    const edge = 56;
    const sp = g.y < v.top + edge ? -Math.ceil((v.top + edge - g.y) / 5) : g.y > v.bottom - edge ? Math.ceil((g.y - (v.bottom - edge)) / 5) : 0;
    if (sp) {
      const before = g.s.scrollTop;
      g.s.scrollTop = before + sp;
      if (g.s.scrollTop !== before) paint();
    }
    g.raf = requestAnimationFrame(roll);
  };
  const lift = () => {
    if (!g || g.lifted || g.scrolling) return;
    const list = rowsOf();
    const from = list.indexOf(g.row);
    if (from < 0 || list.length < 2) return void (g = null);
    // (Rows as laid out at the lift, in the view; a scroll since is added back in paint.)
    const s0 = g.s.scrollTop;
    const rows = list.map(n => {
      const b = n.getBoundingClientRect();
      return { top: b.top, height: b.height };
    });
    // (Its step: its own height and the gap between rows, rows of any height.)
    const r = rows[from];
    const gap = rows[from + 1] ? rows[from + 1].top - (r.top + r.height) : r.top - (rows[from - 1].top + rows[from - 1].height);
    g = { ...g, lifted: true, list, rows, from, to: from, s0, y0: g.y, step: r.height + Math.max(0, gap) };
    letGo();
    tick();
    container.classList.add('q-reordering');
    for (const n of list) n.classList.add(n === g.row ? 'q-reorder-lift' : 'q-reorder-shift');
    g.raf = requestAnimationFrame(roll);
  };
  const move = e => {
    if (!g || e.pointerId !== g.id) return;
    if (e.cancelable) e.preventDefault();
    if (g.lifted) {
      g.y = e.clientY;
      return paint();
    }
    if (g.scrolling) {
      // (The grip owns the touch, touch-action none: the list is scrolled by hand.)
      g.s.scrollTop -= e.clientY - g.y;
      g.y = e.clientY;
      return;
    }
    const dx = e.clientX - g.x;
    const dy = e.clientY - g.yStart;
    if (dx * dx + dy * dy < GRIP_SLOP * GRIP_SLOP) return;
    clearTimeout(g.arm);
    if (g.touch) {
      g.scrolling = true;
      g.y = e.clientY;
    } else {
      g.y = e.clientY;
      lift();
      if (g?.lifted) paint();
    }
  };
  const end = e => {
    if (!g || (e && e.pointerId != null && e.pointerId !== g.id)) return;
    const was = g;
    g = null;
    clearTimeout(was.arm);
    cancelAnimationFrame(was.raf);
    removeEventListener('pointermove', move);
    removeEventListener('pointerup', end);
    removeEventListener('pointercancel', end);
    removeEventListener('blur', end);
    if (!was.lifted) return;
    const { row, list, rows, from, to } = was;
    // The row settles into its place, then the DOM takes the order.
    const land = (from < to ? rows[to].top + rows[to].height - rows[from].height : rows[to].top) - rows[from].top;
    const finish = () => {
      if (row.__qLand !== finish) return;
      row.__qLand = null;
      clear(list);
      place(list, row, to);
      done(from, to);
    };
    row.__qLand = finish;
    if (reduced()) return finish();
    row.style.transition = 'transform 0.2s var(--q-spring-snappy, ease)';
    row.style.transform = `translate3d(0, ${land}px, 0)`;
    row.classList.remove('q-reorder-lift');
    row.classList.add('q-reorder-land');
    setTimeout(() => (row.classList.remove('q-reorder-land'), finish()), 200);
  };
  const down = e => {
    const handle = e.target.closest?.('.q-grip');
    if (!handle || handle.closest('.q-reorder') !== container || g || (e.button != null && e.button !== 0)) return;
    const row = handle.closest(items.replace(/^:scope\s*>\s*/, ''));
    if (!row || !rowsOf().includes(row)) return;
    e.preventDefault();
    g = { id: e.pointerId, row, handle, x: e.clientX, yStart: e.clientY, y: e.clientY, touch: e.pointerType === 'touch', s: scrollBoxOf(container), lifted: false, scrolling: false };
    try {
      handle.setPointerCapture?.(e.pointerId);
    } catch {}
    addEventListener('pointermove', move, { passive: false });
    addEventListener('pointerup', end);
    addEventListener('pointercancel', end);
    addEventListener('blur', end);
    g.arm = setTimeout(lift, g.touch ? GRIP_HOLD_MS : 0);
  };
  // ↑ ↓ on a grip: its row one place.
  const key = e => {
    const handle = e.target.closest?.('.q-grip');
    if (!handle || handle.closest('.q-reorder') !== container || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
    const list = rowsOf();
    const row = handle.closest(items.replace(/^:scope\s*>\s*/, ''));
    const from = list.indexOf(row);
    const to = from + (e.key === 'ArrowUp' ? -1 : 1);
    if (from < 0 || to < 0 || to >= list.length) return;
    e.preventDefault();
    place(list, row, to);
    handle.focus();
    done(from, to);
  };
  // (A grip's click does nothing else: never the row's own tap.)
  const swallow = e => e.target.closest?.('.q-grip')?.closest('.q-reorder') === container && (e.preventDefault(), e.stopPropagation());
  container.addEventListener('pointerdown', down);
  container.addEventListener('keydown', key);
  container.addEventListener('click', swallow, true);
  const off = () => {
    end();
    container.removeEventListener('pointerdown', down);
    container.removeEventListener('keydown', key);
    container.removeEventListener('click', swallow, true);
    container.__qReorder = null;
  };
  container.__qReorder = off;
  return off;
}

// ---- Nothing here ----
// empty({ icon, tint, title, body, action }): iOS's ContentUnavailableView, one
// way everywhere. `icon` is a key of `icons` ('ticket': a 56px colour tile,
// `tint` its colour, the app's accent unless given) or anything else (an old
// emoji: the grey disc it always was). One line of title, an optional line
// of body, one button: `action` is { label, onTap | href, data } (a .q-btn.primary;
// `data`: data-* attributes for a tap wired by delegation) or a node the app made.
// (No icon given: the list's own, so an empty state is never a bare sentence.)
// cls: the app's own class beside .q-empty.
export function empty({ icon = 'list', tint = '', title = '', body = '', action = null, cls = '' } = {}) {
  const mark = !icon ? null : isIcon(icon) ? tinted(h('span', { class: 'q-tile q-empty-tile', 'aria-hidden': 'true', html: icons[icon] }), tint || 'var(--q-accent)') : h('span', { class: 'q-empty-icon', 'aria-hidden': 'true', text: icon });
  const button = action && !(action instanceof Node) ? h(action.href ? 'a' : 'button', { class: 'q-btn primary', ...(action.href ? { href: action.href } : { type: 'button', onclick: action.onTap }), ...dataProps(action.data), text: action.label || '' }) : action;
  return h('div', { class: cls ? `q-empty ${cls}` : 'q-empty' }, [mark, title ? h('strong', { text: title }) : null, body ? h('p', { text: body }) : null, button]);
}

const CHEV_DOWN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';

// ---- A list's more: 再看 7 則 / 收起 (Jay 2026-11-03: "I hate this kind of orange expand text") ----
// One look in every app: a quiet bar the list's width under it, grey words
// and a chevron that turns as it opens; never accent-coloured text.
//   moreToggle({ more, less, open, onToggle, cls })
// more: its words while closed (再看 7 則); less: while open (收起), or
// null for a pager (再看 25 位: each tap shows more and never folds; the
// app sets the next words with .set(false, words), or hides it);
// onToggle(open). Keep the same node through a toggle (the kit holds it
// under the finger as the list folds above it, hold-place.mjs).
export function moreToggle({ more = kitW('顯示更多', 'Show more'), less = kitW('收起', 'Show less'), open = false, onToggle = () => {}, cls = '' } = {}) {
  const words = h('span');
  const b = h('button', { type: 'button', class: cls ? `q-more ${cls}` : 'q-more' }, [words]);
  b.insertAdjacentHTML('beforeend', CHEV_DOWN);
  const paint = () => {
    words.textContent = open && less != null ? less : more;
    b.setAttribute('aria-expanded', String(Boolean(open && less != null)));
  };
  b.addEventListener('click', () => {
    if (less != null) open = !open;
    paint();
    onToggle(less != null ? open : true);
  });
  paint();
  return Object.assign(b, {
    set(o, m = more, l = less) {
      (open = o), (more = m), (less = l);
      paint();
    }
  });
}

// ---- A part still being read: its place held in the shape that's coming ----
// waiting(shape, { keep }): a part of the page a later read fills (who
// starts, the season's leaders, who's out), drawn from the page's first
// drawing in the shape it will have, so nothing under it moves when it lands
// (Jay 2026-11-03: 預計先發 came in last and pushed the whole page down; the
// keeper, hold-place.mjs, can't hold a page read from its top). `shape` is
// the app's own card built on stand-ins: rows of the count that comes, each
// name a few characters (never seen; not blank spaces, which hang past a
// line's end), a face left empty; so it is the real card's size at every width. Its words and pictures turn to the kit's
// quiet shimmer; what matches `keep` (the card's title) stays as it is. The
// app puts the real part in its place when the read lands, or nothing if it
// brings none. An app drawing with strings calls it on the node once in the page.
export function waiting(shape, { keep = '' } = {}) {
  if (!shape?.querySelectorAll) return shape || null;
  const media = /^(img|svg|picture|canvas|video)$/i;
  const mark = n => {
    for (const k of [...n.childNodes]) {
      // Words: a bar of their own width, where they sit.
      if (k.nodeType === 3 && /[^ \t\n\r]/.test(k.data)) {
        const bar = shape.ownerDocument.createElement('span');
        bar.className = 'q-wait-bit';
        bar.textContent = k.data;
        k.replaceWith(bar);
      } else if (k.nodeType === 1 && !k.classList.contains('q-wait-bit') && !(keep && k.matches(keep))) {
        // A picture, or a box with nothing in it (a face, a bar, a pill): its own shape.
        if (media.test(k.tagName) || !k.childNodes.length) k.classList.add('q-wait-bit');
        else mark(k);
      }
    }
  };
  mark(shape);
  // (Words a builder puts in later, a name fitted once it's on the page: a bar too, before it's drawn.)
  if (typeof MutationObserver === 'function') new MutationObserver(() => mark(shape)).observe(shape, { childList: true, subtree: true, characterData: true });
  shape.classList.add('q-wait');
  shape.setAttribute('aria-busy', 'true');
  shape.inert = true;
  return shape;
}

// ---- A large title (iOS's navigation title) ----
// navTitle('賽程') is the 34pt title at a tab's top; it scrolls away with the
// page (no bar takes its place). For a tab that isn't the first: the first
// tab has no large title (it opens straight onto content). Returns the <h1>:
// put it in the tab's panel; setTitle(text) renames it.
export function bindNavTitle(el) {
  return Object.assign(el, { dispose() {}, setTitle: t => void (el.textContent = t) });
}
export function navTitle(title = '') {
  return bindNavTitle(h('h1', { class: 'q-nav-title', 'data-q-nav': '', text: title }));
}

// ---- Pull to refresh (iOS's) ----
// The finger dragged down from the top of the page: a glass spinner follows it
// with a rubber band, a tick as it passes the threshold, and letting go then
// calls onRefresh() (it may return a promise: the spinner turns until it
// settles). Not while a sheet is open, a load is running (`disabled()`), or
// the finger started in a sideways list, a field or a scrolled box. Returns
// stop(). orbit.mjs's topActions does this for any app that has a refresh.
const PTR_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19.5 11.5a7.5 7.5 0 1 0-2.2 5.4"/><path d="M19.5 4.5v7h-7"/></svg>';
// How far the spinner is drawn for a finger pulled `dy`: 1:1 at first, never past `max`.
export const rubber = (dy, max = 90) => (dy > 0 ? max * (1 - Math.exp(-dy / max)) : 0);
export function pullToRefresh(onRefresh, { threshold = 70, disabled = () => false, root = typeof document === 'undefined' ? null : document } = {}) {
  if (!root || typeof onRefresh !== 'function') return () => {};
  const top = () => (root.scrollingElement || root.documentElement || {}).scrollTop || 0;
  // (The tab bar too: a tab's touch read the page's layout here, in the frame
  // its pill starts to slide.)
  const skip = 'input, textarea, select, [contenteditable], .q-chips, .leaflet-container, [data-no-ptr], .q-tabbar, .q-tab-action';
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
    if (busy || e.touches.length !== 1 || e.target.closest?.(skip) || disabled() || top() > 0) return;
    if (root.querySelector('dialog[open], #loading:not([hidden])') || scrolledBox(e.target)) return;
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
// frame. segHtml([[id, label, count?]…], on, { from, attr: id => attrs, cls, pressed }) and,
// after the HTML is in the page, settleSegs(). A third entry is the count
// badge, as segmented's `count`.
export function segHtml(list, on, { from = on, attr = () => '', cls = '', pressed = false, esc = s => String(s).replace(/[&<>"]/g, c => `&#${c.charCodeAt(0)};`) } = {}) {
  const i = Math.max(0, list.findIndex(([k]) => k === on));
  const j = Math.max(0, list.findIndex(([k]) => k === from));
  const pick = k => (pressed ? `aria-pressed="${k === on}"` : `role="tab" aria-selected="${k === on}"`);
  return `<div class="${cls ? `q-seg ${cls}` : 'q-seg'}" role="${pressed ? 'group' : 'tablist'}" style="--q-seg-n:${list.length};--q-seg-i:${j}" data-to="${i}">${list.map(([k, name, count]) => `<button type="button" ${pick(k)} ${attr(k)}>${esc(name)}${segCount(count) ? `<span class="q-seg-count">${segCount(count)}</span>` : ''}</button>`).join('')}</div>`;
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
// A way on to another view at a card's foot (全部球隊數據 ›, 看完整賽程):
// the same quiet bar, a › for where it goes; never accent text (Jay 2026-11-03).
//   goBar(label, onTap | { href }, cls) / goHtml({ label, href, attr, cls }): a link (href) or a button.
export function goBar(label, onTap = () => {}, cls = '') {
  const href = typeof onTap === 'object' && onTap ? onTap.href : '';
  return h(href ? 'a' : 'button', { class: `q-more q-more-go${cls ? ` ${cls}` : ''}`, ...(href ? { href } : { type: 'button', onclick: onTap }) }, [h('span', { text: label }), h('span', { class: 'q-more-chev', 'aria-hidden': 'true', text: '›' })]);
}
export function goHtml({ label = '', href = '', attr = '', cls = '' } = {}) {
  const tag = href ? `a href="${E(href)}"` : 'button type="button"';
  return `<${tag} class="${clsOf('q-more q-more-go', cls)}"${attr ? ` ${attr}` : ''}><span>${E(label)}</span><span class="q-more-chev" aria-hidden="true">›</span></${href ? 'a' : 'button'}>`;
}
// A disclosure drawn as the bar: summaryHtml(words) inside a <details>.
export function summaryHtml(words = '') {
  return `<summary class="q-more"><span>${E(words)}</span>${CHEV_DOWN}</summary>`;
}

// tagHtml('直播', 'red') or tagHtml('3 天', '', '#hex').
export function tagHtml(text, tone = '', color = '') {
  return tagObjHtml({ text, tone: color ? `${tone} tint` : tone, color });
}
export function emptyHtml({ icon = 'list', tint = '', title = '', body = '', action = null, cls = '' } = {}) {
  const mark = !icon ? '' : isIcon(icon) ? `<span class="q-tile q-empty-tile" aria-hidden="true"${styleOf(['--t', tint || 'var(--q-accent)'])}>${icons[icon]}</span>` : `<span class="q-empty-icon" aria-hidden="true">${E(icon)}</span>`;
  const button = !action ? '' : typeof action === 'string' ? action : action.href ? `<a class="q-btn primary" href="${E(action.href)}"${dataOf(action.data)}>${E(action.label)}</a>` : `<button class="q-btn primary" type="button"${dataOf({ tap: action.tap, ...action.data })}>${E(action.label)}</button>`;
  return `<div class="${clsOf('q-empty', cls)}">${mark}${title ? `<strong>${E(title)}</strong>` : ''}${body ? `<p>${E(body)}</p>` : ''}${button}</div>`;
}
// moreToggle's twin: moreHtml({ more, less, open, attr }) (attr: the app's data-… for its own tap).
export function moreHtml({ more = kitW('顯示更多', 'Show more'), less = kitW('收起', 'Show less'), open = false, attr = '', cls = '' } = {}) {
  const on = Boolean(open && less != null);
  return `<button type="button" class="${clsOf('q-more', cls)}" aria-expanded="${on}"${attr ? ` ${attr}` : ''}><span>${E(on ? less : more)}</span>${CHEV_DOWN}</button>`;
}
// navTitleHtml(title), then wireNavTitles(root) once it's in the page.
export function navTitleHtml(title = '') {
  return `<h1 class="q-nav-title" data-q-nav>${E(title)}</h1>`;
}
export function wireNavTitles(root = document) {
  for (const el of root.querySelectorAll('[data-q-nav]:not([data-q-bound])')) {
    el.setAttribute('data-q-bound', '');
    bindNavTitle(el);
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
// The Orbit AI mark: on every smart thing, made by AI or by code (Jay 11-11).
// aiMark() → Node, aiMarkHtml() → string; a head takes it with { ai: true }.
export const aiMarkHtml = (cls = '') => `<span class="${clsOf('q-ai-mark', cls)}" aria-hidden="true">${icons.ai}</span>`;
export const aiMark = (cls = '') => h('span', { class: clsOf('q-ai-mark', cls), 'aria-hidden': 'true', html: icons.ai });
const titleHtml = (title, ai) => (ai ? `<h2 class="q-h-ai">${aiMarkHtml()}<span>${E(title)}</span></h2>` : `<h2>${E(title)}</h2>`);
const titleNode = (title, ai) => (ai ? h('h2', { class: 'q-h-ai' }, [aiMark(), h('span', { text: title })]) : h('h2', { text: title }));
// sectionHtml(title, bodyHtml, { more, moreHref, moreTap, cls, ai })
export function sectionHtml(title, bodyHtml, { more = '', moreHref = '', moreTap = null, cls = '', ai = false } = {}) {
  const link = !more ? '' : moreHref ? `<a href="${E(moreHref)}">${E(more)}</a>` : `<button type="button"${dataOf({ more: moreTap })}>${E(more)}</button>`;
  return `<section class="${clsOf('q-section', cls)}"><div class="q-section-head">${titleHtml(title, ai)}${link}</div>${joinHtml(bodyHtml)}</section>`;
}
export function sectionHeadHtml(title, { more = '', moreTap = null, moreHref = '', count = null, data = null, ai = false } = {}) {
  const chev = `<span style="display:contents">${icons.chevron}</span>`;
  const link = !more ? '' : moreHref ? `<a class="q-sh-more" href="${E(moreHref)}"${dataOf(data)}>${E(more)}${chev}</a>` : `<button class="q-sh-more" type="button"${dataOf({ more: moreTap, ...data })}>${E(more)}${chev}</button>`;
  return `<div class="q-section-head q-shd">${titleHtml(title, ai)}${count != null && count !== '' ? `<span class="q-sh-count num">${E(count)}</span>` : ''}${link}</div>`;
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
    // (Its dark-screen version missing: orbit.mjs darkLogos put the ordinary one back.)
    if (img.dataset?.qDarkFailed) return;
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
  if (root.__orbitLogos) return;
  root.__orbitLogos = true;
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
  return `<div class="q-stock"${open != null ? ` role="button" tabindex="0"${dataOf({ open })}` : ''}${dataOf(data)}>${logoTileHtml(logo, { size: 40, alt: name, fallbackText: name, kind: 'company' })}<div class="q-stock-id"><b class="q-fit">${E(name)}</b>${sub ? `<small>${E(sub)}</small>` : ''}</div>${chart ? `<span class="q-stock-spark">${chart}</span>` : ''}<div class="q-stock-px"><b class="num" data-q-live>${E(stockPrice(price, currency))}</b>${own == null ? movePillHtml(changePct) : `<span class="q-move ${tone} solid">${E(own)}</span>`}</div></div>`;
}
export function placeTileHtml(kind = 'pin', size = '') {
  const k = ['home', 'work', 'school', 'pin', 'star'].includes(kind) ? kind : 'pin';
  return `<span class="${clsOf('q-tile', size && E(size), 'q-place', k)}" aria-hidden="true">${icons[k]}</span>`;
}

// ---- The premium layer (orbit.css "Premium layer"): Law's and Beats' look ----
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
  // A compass: a link out to the web (the Pass sheet's 打開連結).
  compass: g('<circle cx="12" cy="12" r="8.5"/><path d="m15.5 8.5-2 5-5 2 2-5z"/>'),
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
  chat: g('<path d="M5 4.5h14a1.5 1.5 0 0 1 1.5 1.5v9a1.5 1.5 0 0 1-1.5 1.5h-8.5l-4.5 3.6v-3.6H5A1.5 1.5 0 0 1 3.5 15V6A1.5 1.5 0 0 1 5 4.5z"/>'),
  // Orbit AI: the spark inside Orbit's ring, a moon on it; in --q-ai's colours (orbit.css), on anything AI wrote or asks.
  ai: '<svg viewBox="0 0 24 24" aria-hidden="true"><ellipse cx="12" cy="12" rx="10.6" ry="5.2" transform="rotate(-28 12 12)" fill="none" style="stroke:var(--q-ai,currentColor)" stroke-width="1.7" stroke-opacity=".35"/><path style="fill:var(--q-ai-2,currentColor)" d="M12 3.2c.7 5.3 3.4 8 8.4 8.8-5 .8-7.7 3.5-8.4 8.8-.7-5.3-3.4-8-8.4-8.8 5-.8 7.7-3.5 8.4-8.8z"/><path d="M21.36 7.03A10.6 5.2 -28 0 1 2.64 16.97" fill="none" style="stroke:var(--q-ai,currentColor)" stroke-width="1.7" stroke-linecap="round"/><circle cx="18.9" cy="5.4" r="1.8" style="fill:var(--q-ai,currentColor)"/></svg>',
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
// One follow button for the family (Orbit Sports' teams and players, Orbit
// News' people, topics and outlets): a small graphite pill, `+ 追蹤` until
// followed, then quiet `✓ 追蹤中` (Jay 2026-11-03: never an orange pill).
// isOn() says whether it's followed now; toggle() flips it; the tap never
// reaches a row under it. `label`/`on`: other words for the two states.
export function followButton(isOn, toggle, { label = kitW('追蹤', 'Follow'), on = kitW('追蹤中', 'Following'), cls = '' } = {}) {
  const b = h('button', { class: `q-follow${cls ? ` ${cls}` : ''}`, type: 'button' });
  const paint = () => {
    const yes = Boolean(isOn());
    b.textContent = yes ? `✓ ${on}` : `+ ${label}`;
    b.classList.toggle('on', yes);
    b.setAttribute('aria-pressed', String(yes));
  };
  b.addEventListener('click', e => (e.stopPropagation(), toggle(), paint()));
  paint();
  return Object.assign(b, { paint });
}
// Cards that scroll sideways to the screen's edge.
// ---- A page's sections in columns (docs/DESIGN.md §10) ----
// flowColumns(root): every .q-flow under root (or root itself) has its
// children (a tab's sections, in the phone's order) dealt into columns by
// its own width (flowCount below): each, measured at a
// column's width, to the shortest column so far, so the tops read left to
// right in the phone's order and no column is left short (Jay 2026-11-01, an
// iPad: one column long, the other one shelf, half the screen empty). One
// under 100px (a link row) stays under the one before it. Upright: one
// column, as it was. Call it after drawing, and again on onScreen().
// (By its own width, wherever it is: a page, a wide sheet (.q-sheet-wide), one side of a
// split. Two from 600, three from 960 (q-flow-2: two at most), each column a
// phone's. It deals itself again when its width crosses one of those.)
export function flowCount(w, two = false) {
  return w >= 960 && !two ? 3 : w >= 600 ? 2 : 1;
}
let flowSeen = null;
let partSeen = null;
// Each part's column, as flowColumns deals them: to the shortest column so
// far, one under 100px under the one before it. hs: each part's height.
function dealParts(hs, n) {
  const cols = Array.from({ length: n }, () => ({ h: 0, kids: [] }));
  let last = null;
  hs.forEach((x, i) => {
    const c = last && x < 100 ? last : cols.reduce((a, b) => (b.h < a.h - 1 ? b : a));
    c.kids.push(i);
    c.h += x;
    last = c;
  });
  return cols;
}
// (.q-flow-refit: a flow whose parts fill in after it's dealt (a section
// read later, a list that grows) is dealt again when that would move a
// part, never while something in it is being typed in. Jay's iPad
// 2026-11-11: Class's 今天 dealt while its to-dos and notices were empty
// left one class on the left beside a long right column.)
function refitFlow(f) {
  clearTimeout(f.__qRefit);
  f.__qRefit = setTimeout(() => {
    if (!f.isConnected || !f.classList.contains('q-flow-laid') || !f.getClientRects().length) return;
    const a = document.activeElement;
    if (a && f.contains(a) && a.matches('input, textarea, select, [contenteditable]')) return a.addEventListener('focusout', () => refitFlow(f), { once: true });
    const items = f.__qItems || [];
    const hs = items.map((it, i) => it.getBoundingClientRect().height + (f.__qMargins?.[i] || 0));
    const now = items.map(it => [...f.children].indexOf(it.parentNode)).join();
    const next = dealParts(hs, f.__qFlowN || 1);
    const want = new Array(items.length);
    next.filter(c => c.kids.length).forEach((c, k) => c.kids.forEach(i => (want[i] = k)));
    if (want.join() !== now) flowColumns(f);
  }, 150);
}
function watchFlow(f) {
  if (typeof ResizeObserver === 'undefined') return;
  flowSeen ||= new ResizeObserver(rows => {
    for (const { target: f } of rows) {
      if (!f.isConnected || !f.getClientRects().length) continue;
      if (flowCount(f.clientWidth, f.classList.contains('q-flow-2')) !== (f.__qFlowN || 1)) flowColumns(f);
    }
  });
  if (!f.__qFlowWatched) {
    f.__qFlowWatched = true;
    flowSeen.observe(f);
  }
  if (!f.classList.contains('q-flow-refit')) return;
  partSeen ||= new ResizeObserver(rows => {
    const flows = new Set(rows.map(r => r.target.__qFlowOf).filter(Boolean));
    for (const f of flows) if (f.classList.contains('q-flow-laid')) refitFlow(f);
  });
  for (const it of f.__qItems || []) {
    if (it.__qFlowOf === f) continue;
    it.__qFlowOf = f;
    partSeen.observe(it);
  }
}
export function flowColumns(root = document) {
  if (typeof document === 'undefined') return;
  const list = root?.classList?.contains('q-flow') ? [root] : [...(root?.querySelectorAll?.('.q-flow') || [])];
  for (const f of list) {
    // (Not shown, it has no size: dealt when it's drawn again shown.)
    if (!f.getClientRects().length) continue;
    const n = flowCount(f.clientWidth, f.classList.contains('q-flow-2'));
    f.__qFlowN = n;
    const items = f.__qItems?.every(i => i.parentNode?.parentNode === f || i.parentNode === f) ? f.__qItems : [...f.children].flatMap(c => (c.classList.contains('q-flow-col') ? [...c.children] : [c]));
    f.__qItems = items;
    watchFlow(f);
    // (Dealt again while read (a live game every few seconds): the page and its
    // sheet stay where they were scrolled. The columns' height is held while
    // they're taken apart, so the box never shrinks and drops the reader to the
    // top (Jay 2026-11-01: live updates reset the scroll).)
    const scrollers = [];
    for (let p = f.parentElement; p; p = p.parentElement) if (p.scrollTop) scrollers.push([p, p.scrollTop]);
    const se = document.scrollingElement;
    if (se?.scrollTop && !scrollers.some(([p]) => p === se)) scrollers.push([se, se.scrollTop]);
    const held = f.style.minHeight;
    if (scrollers.length) f.style.minHeight = `${f.offsetHeight}px`;
    f.classList.remove('q-flow-laid', 'q-flow-measure');
    const settle = () => {
      if (!scrollers.length) return;
      f.style.minHeight = held;
      for (const [p, top] of scrollers) if (p.scrollTop !== top) p.scrollTop = top;
    };
    if (n < 2 || items.length < 2) {
      f.replaceChildren(...items);
      settle();
      continue;
    }
    f.style.setProperty('--q-flow-n', n);
    f.classList.add('q-flow-measure');
    f.replaceChildren(...items);
    f.__qMargins = items.map(i => parseFloat(getComputedStyle(i).marginTop) || 0);
    const hs = items.map((it, i) => it.getBoundingClientRect().height + f.__qMargins[i]);
    f.classList.remove('q-flow-measure');
    const cols = dealParts(hs, n);
    f.replaceChildren(...cols.filter(c => c.kids.length).map(c => h('div', { class: 'q-flow-col' }, c.kids.map(i => items[i]))));
    f.classList.add('q-flow-laid');
    settle();
  }
}

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
// shd: the 20px head of sectionHead() (with its count and chevron link);
// action: a node put at the head's end; sub: a line under the head.
export function section(title, body, { more = '', moreHref = '', onMore = null, cls = '', sub = '', action = null, shd = false, count = null, ai = false } = {}) {
  const head = shd
    ? sectionHead(title, { more, moreHref, onMore, count, ai })
    : h('div', { class: 'q-section-head' }, [titleNode(title, ai), more ? h(moreHref ? 'a' : 'button', { ...(moreHref ? { href: moreHref } : { type: 'button', onclick: onMore }), text: more }) : null]);
  if (action) head.append(action);
  return h('section', { class: cls ? `q-section ${cls}` : 'q-section' }, [head, sub ? h('p', { class: 'section-sub', text: sub }) : null, ...[].concat(body)]);
}

// ---- More components (orbit.css "Premium components (round 3)") ----

// A section's head: its title, a count beside it, a link to the rest on the
// right. sectionHead('為你推薦', { count: 4, more: '全部', onMore | data: { tab: 'all' } }); the same
// .q-section-head as section()'s, drawn 20px with a 44px tap target (.q-shd).
export function sectionHead(title, { more = '', onMore = null, moreHref = '', count = null, data = null, ai = false } = {}) {
  const chev = h('span', { html: icons.chevron, style: { display: 'contents' } });
  return h('div', { class: 'q-section-head q-shd' }, [
    titleNode(title, ai),
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

// A match: its league and time and two sides.
// matchCard({ league, leagueLogo, when, live, tag, wide, sides: [{ logo, name,
// score }], onOpen }).
// Scores show as "2 : 1", else "VS". wide = a full-width card for a list.
export function matchCard({ league = '', leagueLogo = '', when = '', live = false, tag = null, wide = false, sides = [], onOpen = null } = {}) {
  const [a = {}, b = {}] = sides;
  // (The logos large in their tiles: Jay 2026-10-21, "small and weird".)
  const px = wide ? 48 : 52;
  const side = s => h('div', { class: 'q-match-side' }, [logoTile(s.logo, { size: px, alt: s.name, fallbackText: s.name }), h('b', { text: s.name || '' })]);
  const scored = a.score != null && b.score != null;
  // (A tag with no text shows nothing: never an empty capsule.)
  const t = tag ? (typeof tag === 'string' ? { text: tag } : tag) : null;
  const top = Boolean(league || leagueLogo || t?.text);
  const card = h('article', { class: `q-match${live ? ' live' : ''}${wide ? ' wide' : ''}${top ? '' : ' no-top'}`, ...(onOpen ? { role: 'button', tabindex: '0', onclick: onOpen, onkeydown: e => e.key === 'Enter' && onOpen(e) } : {}) }, [
    // A head only with a league or a tag beside the time; with neither, the
    // time (完賽, 第3節) sits under the score, never alone over an empty band.
    top ? h('div', { class: 'q-match-top' }, [leagueLogo ? logoTile(leagueLogo, { size: 20, alt: league }) : null, h('span', { class: 'q-match-lg', text: league }), t?.text ? tag_(t) : null, h('span', { class: 'q-match-when', text: when })]) : null,
    h('div', { class: 'q-match-teams' }, [
      side(a),
      h('div', { class: `q-match-mid num${scored ? '' : ' vs'}` }, [h('span', { class: 'q-match-score', text: scored ? `${a.score} : ${b.score}` : 'VS' }), !top && when ? h('small', { class: 'q-match-when', text: when }) : null]),
      side(b)
    ])
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
// resolves true or false. orbit.mjs's ask(); `icon` a key of `icons` shows
// as a 56px colour tile, anything else (an emoji) as it always did.
export async function confirm(opts = {}) {
  return (await import('./orbit.mjs')).ask(opts);
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
    h('div', { class: 'q-stock-id' }, [h('b', { class: 'q-fit', text: name }), sub ? h('small', { text: sub }) : null]),
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

// ---- Home parts: ring, month calendar, panels, league tile (orbit.css "Home parts (r4)") ----
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
const calLang = lang => lang || pageLang();
const calParts = ({ year, month, marks = {}, today, lang, last } = {}) => {
  const tk = todayKey(today);
  const cell = (key, d) => { const mark = marks?.[key]; return { d, key, mark: mark ? String(mark).replace(/[^\w-]/g, '') : '', today: key === tk }; };
  const week = WEEK[calLang(lang)] || WEEK.zh;
  const n = Math.floor(Number(last));
  if (n >= 1) {
    const [ty, tm, td] = tk.split('-').map(Number);
    const end = Date.UTC(ty, tm - 1, td);
    const days_ = Array.from({ length: n }, (_, i) => { const t = new Date(end - (n - 1 - i) * 864e5); return cell(isoDay(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate()), t.getUTCDate()); });
    return { offset: new Date(end - (n - 1) * 864e5).getUTCDay(), days: n, tk, week, days_, label: calLang(lang) === 'en' ? `Last ${n} days` : `最近 ${n} 天` };
  }
  const g = monthGrid(year, month);
  return { ...g, tk, week, label: calLang(lang) === 'en' ? `${year}-${pad2(month)}` : `${year} 年 ${month} 月`, days_: Array.from({ length: g.days }, (_, i) => cell(isoDay(year, month, i + 1), i + 1)) };
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

// A swipe in from the screen's left edge goes back, as iOS's own back gesture does (a Home
// Screen app has none of Safari's): the page follows the finger, the one under it shows through
// its shadow, and past a third of the width, or flicked, it slides off and back() runs; short of
// that it glides home. target(): the page to move (the screen's open page with a way back), or
// null when there is nowhere to go back to (a tab's first screen). Never under an open sheet, a
// field, or a row that scrolls sideways. within(): a page inside a sheet (Securities' 資格): the
// sheet (or null when it has no inner page open), its own left edge, only while it is the top one.
// Returns a function that stops it.
export function edgeBack({ target, back, edge = 24, within = null } = {}) {
  if (typeof document === 'undefined' || !target || !back) return () => {};
  let el = null, x0 = 0, y0 = 0, t0 = 0, dx = 0, on = false;
  const clear = () => {
    if (!el) return;
    el.style.removeProperty('transform');
    el.style.removeProperty('transition');
    el.classList.remove('q-edge-back');
    el = null;
  };
  const down = e => {
    const t = e.touches?.[0];
    if (!t || e.touches.length > 1) return;
    const root = within?.();
    if (within) {
      if (!root || !root.contains(e.target) || [...document.querySelectorAll('dialog[open]')].at(-1) !== root.closest('dialog') || t.clientX - root.getBoundingClientRect().left > edge) return;
    } else if (t.clientX > edge || document.querySelector('dialog[open]')) return;
    if (e.target.closest?.('input, textarea, select, [contenteditable], [data-noswipe]')) return;
    const page = target();
    if (!page) return;
    el = page;
    x0 = t.clientX;
    y0 = t.clientY;
    t0 = performance.now();
    dx = 0;
    on = false;
  };
  const move = e => {
    if (!el) return;
    const t = e.touches[0];
    const mx = t.clientX - x0, my = t.clientY - y0;
    if (!on) {
      if (Math.abs(my) > 10 && Math.abs(my) > Math.abs(mx)) return void (el = null); // a scroll, not a swipe
      if (mx < 8) return;
      on = true;
      el.classList.add('q-edge-back');
      el.style.transition = 'none';
    }
    e.preventDefault();
    dx = Math.max(0, mx);
    el.style.transform = `translateX(${dx}px)`;
  };
  const up = () => {
    if (!el) return;
    if (!on) return void (el = null);
    const page = el;
    const w = page.getBoundingClientRect().width || innerWidth;
    const fast = dx / Math.max(1, performance.now() - t0) > 0.5 && dx > 40;
    const go = dx > w / 3 || fast;
    page.style.transition = `transform ${go ? 220 : 260}ms cubic-bezier(.2,.8,.2,1)`;
    page.style.transform = `translateX(${go ? w : 0}px)`;
    setTimeout(() => {
      el = page;
      if (go) {
        back();
        // (The page drawn again for where back() lands: shown in place, no slide in.)
        requestAnimationFrame(() => (clear(), tick()));
      } else clear();
    }, go ? 210 : 260);
  };
  addEventListener('touchstart', down, { passive: true });
  addEventListener('touchmove', move, { passive: false });
  addEventListener('touchend', up, { passive: true });
  addEventListener('touchcancel', up, { passive: true });
  return () => {
    removeEventListener('touchstart', down);
    removeEventListener('touchmove', move);
    removeEventListener('touchend', up);
    removeEventListener('touchcancel', up);
  };
}
