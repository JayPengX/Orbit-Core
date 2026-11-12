// ---- kit/suite.mjs: Orbit, every app in one home-screen app (Jay 2026-11-12) ----
// orbit.<domain>/app/ installs as one home-screen app, "Orbit", whose scope
// is the whole site: every app opens in its window full screen, as itself,
// and they all share one storage, so one sign-in, one family notebook
// (family.mjs) and one set of notices. The separate apps stay as they are;
// none of this runs in them (orbit.mjs inSuite()).
//
// What the window adds, and only in it:
//   - a switcher at the top line's left (the account's mirror; on a rail or
//     a computer, beside the account at the rail's foot): this app's icon,
//     tapped for the sheet of every app;
//   - back and forward across apps, as iOS's "◀ App": a hop from Sports to
//     Transit shows "‹ Sports", which goes back to the very page and place
//     left; then a forward button to Transit again;
//   - each app opened again where it was left (its address and scroll), as
//     an app on the phone keeps its place;
//   - links between apps (the kit's s.go, an <a> to another app, a notice)
//     open in place: no handed-over sign-in, no Safari sheet.
//
// Kept on the device:
//   localStorage orbit.suite.v1    { on, t, apps: { <id>: { url, y, t, home } } }  where each app was left
//                                  (read by /app/'s first lines too: site/app/index.html)
//   sessionStorage orbit.suite     '1': this window is Orbit
//   sessionStorage orbit.suite.trail { list: [{ app, url, y }], i }  the hops, for back and forward
import { APP_ORDER, BRANDS, appIcon, pathOf } from './brand.mjs';

export const SUITE_KEY = 'orbit.suite.v1';
export const SUITE_TAB = 'orbit.suite';
export const TRAIL_KEY = 'orbit.suite.trail';
const PLACE_KEY = 'orbit.place';
// Hops kept for back (iOS keeps no more than a handful either).
export const TRAIL_MAX = 30;
// An app left longer ago opens at its start, not on yesterday's game.
export const RESUME_MS = 4 * 3_600_000;

// ---- The rules, kept apart from the page (tests/kit-suite.test.mjs) ----

// The app an address is in, by its folder (/sports/ on the domain,
// /Orbit-Sports/ on a computer's preview), or null (the Pass's page, /app/).
export function appAt(pathname, paths = Object.fromEntries(APP_ORDER.map(id => [id, pathOf(id)]))) {
  const p = String(pathname || '');
  for (const [id, path] of Object.entries(paths)) if (p === path || p.startsWith(path) || `${p}/` === path) return id;
  return null;
}
// An address worth going back to: one-shot parts taken out (a sign-in handed
// over, a question asked once).
const ONCE = /^(qh|ask)=/;
export function keepable(url) {
  const s = String(url || '');
  const at = s.indexOf('#');
  if (at < 0) return s;
  const parts = s
    .slice(at + 1)
    .split('&')
    .filter(x => x && !ONCE.test(x));
  return parts.length ? `${s.slice(0, at)}#${parts.join('&')}` : s.slice(0, at);
}
const fresh = () => ({ list: [], i: -1 });
const trim = t => {
  const cut = Math.max(0, t.list.length - TRAIL_MAX);
  return cut ? { list: t.list.slice(cut), i: Math.max(0, t.i - cut) } : t;
};
export function sane(t) {
  if (!t || !Array.isArray(t.list) || !t.list.length) return fresh();
  const list = t.list.filter(e => e && BRANDS[e.app]);
  if (!list.length) return fresh();
  return { list, i: Math.min(Math.max(0, Number(t.i) | 0), list.length - 1) };
}
// A page of `app` has opened at `url`: the hop it was planned as (back,
// forward, a jump: the trail already points there), the same app again (a
// reload, an update, its own pages), or a hop from elsewhere (a link, a
// notice, the browser's own back): then it's a jump.
export function arrive(t, app, url) {
  t = sane(t);
  const cur = t.list[t.i];
  if (cur?.app === app) return { list: t.list.map((e, k) => (k === t.i ? { ...e, url } : e)), i: t.i };
  return trim({ list: [...t.list.slice(0, t.i + 1), { app, url }], i: t.i + 1 });
}
// Where the person is now (before leaving it).
export function record(t, url, y = 0) {
  t = sane(t);
  if (t.i < 0) return t;
  return { list: t.list.map((e, k) => (k === t.i ? { ...e, url, y: Math.max(0, Math.round(y) || 0) } : e)), i: t.i };
}
// A jump to another app: what was ahead is dropped, as a browser's history.
export function jump(t, app, url = null) {
  t = sane(t);
  return trim({ list: [...t.list.slice(0, t.i + 1), { app, url }], i: t.i + 1 });
}
export const backOf = t => (sane(t).i > 0 ? sane(t).list[sane(t).i - 1] : null);
export const forwardOf = t => {
  const s = sane(t);
  return s.i >= 0 && s.i < s.list.length - 1 ? s.list[s.i + 1] : null;
};
export const step = (t, by) => {
  const s = sane(t);
  const i = s.i + by;
  return i < 0 || i >= s.list.length ? s : { list: s.list, i };
};
// Where an app opens from the switcher: where it was left, if lately.
export function resumeOf(saved, app, now = Date.now()) {
  const at = saved?.apps?.[app];
  if (at?.url && now - (Number(at.t) || 0) < RESUME_MS) return { url: at.url, y: Number(at.y) || 0 };
  return { url: pathOf(app), y: 0 };
}
// The app used last (Orbit's icon opens on it).
export function lastApp(saved) {
  let best = null;
  for (const [id, v] of Object.entries(saved?.apps || {})) if (BRANDS[id] && (!best || (Number(v?.t) || 0) > best.t)) best = { id, t: Number(v?.t) || 0 };
  return best?.id || null;
}

// ---- On the device ----
const readJson = (store, key) => {
  try {
    return JSON.parse(globalThis[store]?.getItem(key) || 'null');
  } catch {
    return null;
  }
};
const writeJson = (store, key, v) => {
  try {
    globalThis[store]?.setItem(key, JSON.stringify(v));
  } catch {}
};
export const savedSuite = () => readJson('localStorage', SUITE_KEY) || { on: 1, apps: {} };
const readTrail = () => sane(readJson('sessionStorage', TRAIL_KEY));
const writeTrail = t => writeJson('sessionStorage', TRAIL_KEY, t);
// This window is Orbit from now on (the /app/ page, once installed).
export function markSuite(now = Date.now()) {
  try {
    globalThis.sessionStorage?.setItem(SUITE_TAB, '1');
  } catch {}
  const s = savedSuite();
  writeJson('localStorage', SUITE_KEY, { ...s, on: 1, t: s.t || now });
}
const here = () => keepable(`${location.pathname}${location.search}${location.hash}`);
const scrollNow = () => Math.round(globalThis.scrollY || document.scrollingElement?.scrollTop || 0);
let app = null;

// What the page was, kept: the trail's entry and the app's own place.
function remember() {
  if (!app) return;
  const url = here();
  const y = scrollNow();
  writeTrail(record(readTrail(), url, y));
  const s = savedSuite();
  writeJson('localStorage', SUITE_KEY, { ...s, on: 1, apps: { ...(s.apps || {}), [app]: { url, y, t: Date.now(), home: pathOf(app) } } });
}
// Opens `url` with the scroll put back once the app has painted (orbit.mjs
// restorePlace reads it as an update's reload does).
function open(url, y = 0) {
  const to = new URL(url, location.href);
  if (y > 0) {
    try {
      sessionStorage.setItem(PLACE_KEY, JSON.stringify({ path: to.pathname, hash: to.hash, y, t: Date.now() }));
    } catch {}
  }
  location.assign(to.href);
}
// Another app: a deep link (`hash`) as asked, else where it was left.
export function go(other, hash = '') {
  if (!BRANDS[other]) return;
  const h = String(hash || '').replace(/^#/, '');
  if (other === app && !h) return;
  remember();
  const to = h ? { url: `${pathOf(other)}#${h}`, y: 0 } : resumeOf(savedSuite(), other);
  if (other === app) return open(to.url);
  writeTrail(jump(readTrail(), other, to.url));
  open(to.url, to.y);
}
export function back() {
  const t = readTrail();
  const to = backOf(t);
  if (!to) return;
  remember();
  writeTrail(step(readTrail(), -1));
  open(to.url || resumeOf(savedSuite(), to.app).url, to.y || 0);
}
export function forward() {
  const t = readTrail();
  const to = forwardOf(t);
  if (!to) return;
  remember();
  writeTrail(step(readTrail(), 1));
  open(to.url || resumeOf(savedSuite(), to.app).url, to.y || 0);
}

// ---- What's drawn ----
const en = () => /^en/i.test(document.documentElement.lang || '');
const W = (zh, e) => (en() ? e : zh);
const icons = new Map();
const iconOf = id => {
  if (!icons.has(id)) icons.set(id, `data:image/svg+xml,${encodeURIComponent(appIcon(id))}`);
  return icons.get(id);
};
const short = id => BRANDS[id]?.short || id;
const svg = d => `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="${d}"/></svg>`;
const DOWN = 'M7 10l5 5 5-5';
const LEFT = 'M15 5l-7 7 7 7';
const RIGHT = 'M9 5l7 7-7 7';
function el(tag, props = {}, kids = []) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'html') n.innerHTML = v;
    else if (k === 'text') n.textContent = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v === true ? '' : v);
  }
  n.append(...kids.filter(Boolean));
  return n;
}
const img = id => el('img', { src: iconOf(id), alt: '', width: '28', height: '28', draggable: 'false' });

let bar = null;
function draw() {
  if (!app) return;
  const t = readTrail();
  const b = backOf(t);
  const f = forwardOf(t);
  bar ||= el('div', { class: 'q-suite', role: 'group', 'aria-label': 'Orbit' });
  bar.replaceChildren(
    ...[
      el('button', { class: 'q-suite-btn q-suite-switch', type: 'button', 'aria-label': W(`切換 App（現在：${short(app)}）`, `Switch apps (now ${short(app)})`), onclick: () => switcher() }, [img(app), el('span', { class: 'q-suite-chev', html: svg(DOWN) })]),
    b ? el('button', { class: 'q-suite-btn q-suite-back', type: 'button', 'aria-label': W(`回到 ${short(b.app)}`, `Back to ${short(b.app)}`), onclick: back }, [el('span', { class: 'q-suite-chev', html: svg(LEFT) }), img(b.app), el('span', { class: 'q-suite-label', text: short(b.app) })]) : null,
    f ? el('button', { class: 'q-suite-btn q-suite-fwd', type: 'button', 'aria-label': W(`前往 ${short(f.app)}`, `Forward to ${short(f.app)}`), onclick: forward }, [img(f.app), el('span', { class: 'q-suite-chev', html: svg(RIGHT) })]) : null
    ].filter(Boolean)
  );
  place();
}
// Where it stands: the top line's left on a phone held upright; at the
// rail's foot with the account on a phone on its side, a tablet's rail and
// a computer's side bar (the account's own box, which the app may redraw:
// put back each time).
function place() {
  if (!bar) return;
  const rail = document.documentElement.classList.contains('q-tabrail');
  const into = rail ? document.getElementById('top-actions') : document.querySelector('.q-appbar-inner');
  if (!into) return;
  if (bar.parentNode !== into || (!rail && into.firstElementChild !== bar)) into.prepend(bar);
}

let sheetOpen = null;
async function switcher() {
  if (sheetOpen) return;
  const ui = await import('./ui.mjs');
  const t = readTrail();
  const b = backOf(t);
  const f = forwardOf(t);
  const hops = b || f ? el('div', { class: 'q-suite-hops' }, [b ? el('button', { class: 'q-btn', type: 'button', onclick: () => (close(), back()) }, [el('span', { class: 'q-suite-chev', html: svg(LEFT) }), img(b.app), el('span', { text: W(`回到 ${short(b.app)}`, `Back to ${short(b.app)}`) })]) : null, f ? el('button', { class: 'q-btn', type: 'button', onclick: () => (close(), forward()) }, [img(f.app), el('span', { text: W(`前往 ${short(f.app)}`, `Forward to ${short(f.app)}`) }), el('span', { class: 'q-suite-chev', html: svg(RIGHT) })]) : null]) : null;
  const rows = APP_ORDER.map(id =>
    ui.cell({
      icon: img(id),
      title: short(id),
      sub: BRANDS[id].role?.[en() ? 'en' : 'zh'] || '',
      trailing: id === app ? el('span', { class: 'q-suite-now', text: W('目前', 'Open') }) : null,
      onClick: () => (close(), id === app ? null : go(id))
    })
  );
  const s = ui.sheet({ title: 'Orbit', cls: 'q-suite-sheet', body: [hops, ui.list(rows)], onClose: () => (sheetOpen = null) });
  sheetOpen = s;
  function close() {
    s.close?.();
    sheetOpen = null;
  }
}

let started = false;
export function start() {
  if (started || typeof document === 'undefined') return;
  app = appAt(location.pathname);
  if (!app) return;
  started = true;
  document.documentElement.classList.add('q-in-suite');
  writeTrail(arrive(readTrail(), app, here()));
  remember();
  const mount = () => {
    draw();
    // (The app may draw its top line later, or redraw the account's box.)
    new MutationObserver(() => place()).observe(document.querySelector('.q-appbar') || document.body, { childList: true, subtree: true });
    new MutationObserver(() => place()).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  };
  if (document.body) mount();
  else document.addEventListener('DOMContentLoaded', mount, { once: true });
  // Leaving (another app, the home screen): where it was, kept.
  globalThis.addEventListener('pagehide', remember);
  document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && remember());
  // Back from the browser's own memory (a computer's back button): the trail again.
  globalThis.addEventListener('pageshow', e => {
    if (!e.persisted) return;
    writeTrail(arrive(readTrail(), app, here()));
    draw();
  });
  globalThis.addEventListener('hashchange', () => remember());
}

// ---- In a separate app: Orbit suggested on a hop to another app ----
// (Jay 2026-11-12: "recommend user to install it, but user can still decide
// not to".) An iPhone or iPad's separate app opens another app in a Safari
// sheet; at such a hop (the kit's s.go) Orbit is offered once in a while:
// 取得 Orbit opens its page in Safari (to be added to the home screen), 先打開
// goes on as always, 不再提醒 never asks again. At most 3 times, 14 days
// apart, on this device; only while the owner's switch is on (DEV suiteAsk).
export const ASK_KEY = 'orbit.suite.ask.v1';
export const ASK_EVERY = 14 * 86_400_000;
export const ASK_MAX = 3;
export function askable(was, now = Date.now()) {
  if (!was) return true;
  if (was.never) return false;
  return (Number(was.n) || 0) < ASK_MAX && now - (Number(was.t) || 0) >= ASK_EVERY;
}
// Resolves 'go' (open the other app as always) or 'stay' (Orbit's page was opened instead).
export async function offer({ to, lang = 'zh', home = '/app/' } = {}) {
  const was = readJson('localStorage', ASK_KEY);
  if (!askable(was)) return 'go';
  writeJson('localStorage', ASK_KEY, { n: (Number(was?.n) || 0) + 1, t: Date.now(), never: false });
  const ui = await import('./ui.mjs');
  const { familyMark } = await import('./brand.mjs');
  const T = (zh, e) => (lang === 'en' ? e : zh);
  const name = short(to);
  return new Promise(done => {
    let answer = 'go';
    const pick = a => () => ((answer = a), s.close?.());
    const mark = el('img', { class: 'q-suite-offer-mark', src: `data:image/svg+xml,${encodeURIComponent(familyMark())}`, alt: '', width: '72', height: '72' });
    const body = el('div', { class: 'q-suite-offer' }, [
      mark,
      el('h3', { text: T('每個 App，都在 Orbit 裡', 'Every app, in Orbit') }),
      el('p', { text: T('App 之間切換、返回都在原地，登入一次。', 'One icon: switch and go back between apps, signed in once.') }),
      el('button', { class: 'q-btn primary block', type: 'button', text: T('取得 Orbit', 'Get Orbit'), onclick: pick('orbit') }),
      el('button', { class: 'q-btn block', type: 'button', text: T(`先打開 ${name}`, `Open ${name} for now`), onclick: pick('go') }),
      el('button', { class: 'q-suite-never', type: 'button', text: T('不再提醒', 'Don’t ask again'), onclick: pick('never') })
    ]);
    const s = ui.sheet({
      title: '',
      label: 'Orbit',
      cls: 'q-suite-sheet',
      body: [body],
      onClose: () => {
        if (answer === 'orbit') {
          // (Safari itself, where the page can be added to the home screen.)
          location.href = `x-safari-${new URL(home, location.href).href}`;
          return done('stay');
        }
        if (answer === 'never') writeJson('localStorage', ASK_KEY, { ...(readJson('localStorage', ASK_KEY) || {}), never: true });
        done('go');
      }
    });
  });
}
