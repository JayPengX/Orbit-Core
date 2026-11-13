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
//     open in place: no handed-over sign-in, no Safari sheet;
//   - every app opened kept running (Jay 2026-11-13): /app/ holds each in a
//     frame of its own and a switch shows another (host, below), so Beats
//     plays on and back is instant. Without the host (a computer's preview),
//     a switch opens the page, and back uses the browser's own history.
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

// ---- Where Orbit opens (Jay 2026-11-13) ----
// Something live (a trip under way, a YouBike rental, a bus alert counting
// down, 專注飛行, Beats playing): that app, on that screen, however long
// away; the one started last if several. Else back within AWAY_MS: the app
// used last, where it was left. Else (or the first time) the list of apps,
// the one used last on top. The same on a return to an Orbit the phone kept.
export const AWAY_MS = 3_600_000;
export const LIVE_KEY = 'orbit.suite.live.v1';
// What's live now: { app, url } entries still running, the latest first.
export function liveNow(live, now = Date.now()) {
  return Object.entries(live || {})
    .filter(([id, v]) => BRANDS[id] && v && (v.until ? Number(v.until) > now : now - (Number(v.t) || 0) < 12 * 3_600_000))
    .sort((a, b) => (Number(b[1].t) || 0) - (Number(a[1].t) || 0))
    .map(([id, v]) => ({ app: id, url: v.url || null }));
}
// The app to open, { app, url, y }, or null for the list.
export function launchTarget(saved, live, now = Date.now(), away = AWAY_MS) {
  const on = liveNow(live, now)[0];
  if (on) return { app: on.app, url: on.url || resumeOf(saved, on.app, now).url, y: on.url ? 0 : resumeOf(saved, on.app, now).y };
  // (Orbit's window says which app it showed and when it was left: kept apps behind it note their own times too.)
  const last = BRANDS[saved?.last] ? saved.last : lastApp(saved);
  const left = Number(saved?.left) || Number(saved?.apps?.[last]?.t) || 0;
  if (!last || now - left >= away) return null;
  return { app: last, ...resumeOf(saved, last, now) };
}
// An app says it's in the middle of something (on) or done (null): Orbit
// opens on it while it lasts. `until`: when it ends by itself (a timer).
export function setLive(id, on, { url = null, until = null } = {}) {
  if (!BRANDS[id]) return;
  const all = readJson('localStorage', LIVE_KEY) || {};
  // (Its start kept: "the one started last" is by when it started, not its latest change.)
  if (on) all[id] = { t: all[id]?.t || Date.now(), url: url ? keepable(url) : null, ...(until ? { until: Number(until) } : {}) };
  else delete all[id];
  writeJson('localStorage', LIVE_KEY, all);
}
export const liveSaved = () => readJson('localStorage', LIVE_KEY) || {};

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
  // (Only while the trail is still on this app: once a hop is under way, it points at the next one.)
  const raw = readJson('sessionStorage', TRAIL_KEY);
  const t = sane(raw);
  if (t.list[t.i]?.app === app) writeTrail({ ...record(t, url, y), ...(raw?.pending ? { pending: raw.pending } : {}) });
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
// Orbit's window holding this app (site/app/: each app in a frame of its
// own, kept running while another is shown), or null.
export function hostOf(w = globalThis) {
  try {
    return (w.parent !== w && w.parent?.ORBIT_HOST) || null;
  } catch {
    return null;
  }
}
// Another app: a deep link (`hash`) as asked, else where it was left.
export function go(other, hash = '') {
  if (!BRANDS[other]) return;
  const h = String(hash || '').replace(/^#/, '');
  if (other === app && !h) return;
  const H = hostOf();
  if (H) return void (remember(), H.go(other, h ? `${pathOf(other)}#${h}` : null));
  // (The app just before or after this one: as it was left, not opened again.)
  if (!h) {
    const t = readTrail();
    if (backOf(t)?.app === other) return back();
    if (forwardOf(t)?.app === other) return forward();
  }
  remember();
  const to = h ? { url: `${pathOf(other)}#${h}`, y: 0 } : resumeOf(savedSuite(), other);
  if (other === app) return open(to.url);
  writeTrail({ ...jump(readTrail(), other, to.url), pending: { by: 0, app: other } });
  open(to.url, to.y);
}
// Back and forward. Where the app before is the browser's own entry right
// behind this page (this page opened from it, nothing pushed since), the
// browser goes back itself: Safari then shows that page as it was left, from
// memory, at once (its back-forward cache), instead of loading it again.
// Otherwise (or if nothing happens) the address is opened as a new page.
let fallback = 0;
function traverse(by, to) {
  writeTrail({ ...step(readTrail(), by), pending: { by, app: to.app, at: to.at || null } });
  clearTimeout(fallback);
  // (Nothing left this page in time: the browser had no such entry.)
  fallback = setTimeout(() => {
    const t = readTrail();
    writeTrail({ list: t.list, i: t.i });
    open(to.url || resumeOf(savedSuite(), to.app).url, to.y || 0);
  }, 900);
  history.go(by);
}
const hlNow = () => globalThis.history?.length || 0;
export function back() {
  const H = hostOf();
  if (H) return void (remember(), H.back());
  const t = readTrail();
  const to = backOf(t);
  if (!to) return;
  remember();
  const cur = readTrail().list[t.i];
  if (cur?.backOk && cur.backOk === hlNow()) return traverse(-1, to);
  writeTrail(step(readTrail(), -1));
  open(to.url || resumeOf(savedSuite(), to.app).url, to.y || 0);
}
export function forward() {
  const H = hostOf();
  if (H) return void (remember(), H.forward());
  const t = readTrail();
  const to = forwardOf(t);
  if (!to) return;
  remember();
  const cur = readTrail().list[t.i];
  if (cur?.fwdOk && cur.fwdOk === hlNow()) return traverse(1, to);
  writeTrail(step(readTrail(), 1));
  open(to.url || resumeOf(savedSuite(), to.app).url, to.y || 0);
}
// A page of this app has opened (or come back from the browser's memory):
// which entry of the trail it is, and stamped so a later return finds it.
export function landing(t, app, url, { tag = null, len = 0, id = () => Math.random().toString(36).slice(2, 10) } = {}) {
  const pending = t?.pending || null;
  let s = sane(t);
  const k = tag ? s.list.findIndex(e => e.at === tag) : -1;
  let how = 'other';
  if (pending && s.list[s.i]?.app === app && (!pending.at || !tag || pending.at === tag)) how = pending.by < 0 ? 'back' : pending.by > 0 ? 'forward' : 'jump';
  else if (k >= 0 && s.list[k].app === app) ((s = { list: s.list, i: k }), (how = 'memory'));
  else {
    // (The same app again: a reload, its own page. Another: opened from the page before, by a link or a notice.)
    how = s.list[s.i]?.app === app ? 'same' : s.i >= 0 ? 'jump' : 'first';
    s = arrive(s, app, url);
  }
  const e = { ...s.list[s.i], url, at: s.list[s.i].at || tag || id() };
  // (Opened from the app before it: that one is right behind. Come back from the one after: it's right ahead.)
  if (how === 'jump' || how === 'forward') e.backOk = len;
  if (how === 'back') e.fwdOk = len;
  if (how === 'jump') delete e.fwdOk;
  return { list: s.list.map((x, n) => (n === s.i ? e : x)), i: s.i };
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
const img = id => el('img', { src: iconOf(id), alt: '', width: '24', height: '24', draggable: 'false' });

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
    b ? el('button', { class: 'q-suite-btn q-suite-back', type: 'button', 'aria-label': W(`回到 ${short(b.app)}`, `Back to ${short(b.app)}`), onclick: back }, [el('span', { class: 'q-suite-chev', html: svg(LEFT) }), img(b.app)]) : null,
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
  if (into.firstElementChild !== bar) into.prepend(bar);
  fit(rail && !document.documentElement.classList.contains('q-desk') ? into : null);
}
// A rail's foot is short of room on a phone on its side (five tabs and an
// action leave about a tab's height): never over a tab. The most that fits,
// in order: this app, back and forward one over the other; without forward;
// this app alone; this app beside the account. (The rest in the sheet.)
const FITS = ['', 'q-suite-lean1', 'q-suite-lean2', 'q-suite-lean2 q-suite-row'];
function fit(foot) {
  const set = cls => {
    bar.className = `q-suite ${cls}`.trim();
    for (const f of document.querySelectorAll('.q-suite-rowed')) if (f !== foot || !/row/.test(cls)) f.classList.remove('q-suite-rowed');
    if (foot && /row/.test(cls)) foot.classList.add('q-suite-rowed');
  };
  if (!foot) return set('');
  let above = 0;
  for (const e of document.querySelectorAll('.q-tabbar, .q-tab-action')) {
    const r = e.getBoundingClientRect();
    if (r.height && getComputedStyle(e).display !== 'none') above = Math.max(above, r.bottom);
  }
  for (const cls of FITS) {
    set(cls);
    if (foot.getBoundingClientRect().top >= above + 8) return;
  }
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

function land() {
  const state = globalThis.history?.state;
  const tag = state && typeof state === 'object' ? state.orbitAt || null : null;
  const t = landing(readJson('sessionStorage', TRAIL_KEY), app, here(), { tag, len: hlNow() });
  writeTrail(t);
  // (The browser's entry for this page carries its id; an app's own state kept as it is.)
  const at = t.list[t.i]?.at;
  if (at && tag !== at && (state == null || (typeof state === 'object' && !Array.isArray(state)))) {
    try {
      history.replaceState({ ...(state || {}), orbitAt: at }, '');
    } catch {}
  }
}

// ---- The other apps, ready before they're opened ----
// Once this app has settled and the phone is idle: each app's own service
// worker put in place (it keeps its page), and the apps this window is
// likely to open next (back, forward, the ones used lately here) have their
// first screen's files fetched into the phone's cache, which every app's
// worker answers from. So a switch opens from the phone, not the network.
// Once a session each; never on a saving connection.
const WARM_KEY = 'orbit.suite.warm';
export function warmOrder(t, saved, here, now = Date.now()) {
  const out = [];
  const add = id => id && id !== here && BRANDS[id] && !out.includes(id) && out.push(id);
  add(backOf(t)?.app);
  add(forwardOf(t)?.app);
  Object.entries(saved?.apps || {})
    .filter(([, v]) => now - (Number(v?.t) || 0) < 14 * 86_400_000)
    .sort((a, b) => (Number(b[1]?.t) || 0) - (Number(a[1]?.t) || 0))
    .forEach(([id]) => add(id));
  return out.slice(0, 5);
}
const pause = ms => new Promise(r => setTimeout(r, ms));
const idle = () => new Promise(r => (globalThis.requestIdleCallback ? requestIdleCallback(() => r(), { timeout: 3000 }) : setTimeout(r, 500)));
function warmSoon() {
  if (globalThis.navigator?.connection?.saveData || !globalThis.navigator?.serviceWorker) return;
  const go = () => setTimeout(() => warm().catch(() => {}), 2500);
  const cover = document.getElementById('loading');
  if (!cover || cover.hidden) return go();
  const look = new MutationObserver(() => cover.hidden && (look.disconnect(), go()));
  look.observe(cover, { attributes: true, attributeFilter: ['hidden'] });
}
async function warm() {
  const done = readJson('sessionStorage', WARM_KEY) || {};
  const sw = navigator.serviceWorker;
  // Every app's worker (each keeps its own page: a first opening starts from the phone).
  for (const id of APP_ORDER) {
    if (id === app || done[`sw:${id}`]) continue;
    await idle();
    const path = pathOf(id);
    if (!(await sw.getRegistration(path).catch(() => null))) await sw.register(`${path}sw.js`).catch(() => {});
    done[`sw:${id}`] = 1;
    writeJson('sessionStorage', WARM_KEY, done);
  }
  // The likely next ones: their first screen's own files (named by their hash, kept until they change).
  for (const id of warmOrder(readTrail(), savedSuite(), app)) {
    if (done[id]) continue;
    await idle();
    const path = pathOf(id);
    const page = await fetch(path, { credentials: 'same-origin' })
      .then(r => (r.ok ? r.text() : ''))
      .catch(() => '');
    for (const m of page.matchAll(/(?:src|href)="(\.\/[^"]+\?v=[0-9a-f]{12})"/g)) {
      await fetch(new URL(m[1], new URL(path, location.href)).href, { credentials: 'same-origin', priority: 'low' }).catch(() => {});
    }
    done[id] = 1;
    writeJson('sessionStorage', WARM_KEY, done);
    await pause(300);
  }
}

let started = false;
export function start() {
  if (started || typeof document === 'undefined') return;
  app = appAt(location.pathname);
  if (!app) return;
  started = true;
  document.documentElement.classList.add('q-in-suite');
  // (Orbit's own loading screen was for its launch only: kit/boot.js.)
  try {
    sessionStorage.removeItem('orbit.launch');
  } catch {}
  const H = hostOf();
  // (Held by Orbit's window: it keeps the trail; asked to redraw when shown.)
  if (H) globalThis.__orbitSuite = { draw: () => draw(), remember: () => remember(), app };
  // An app page opened as the whole window on a phone (a notice, an old
  // trail): into Orbit's window, which holds it with the others.
  else if (globalThis.matchMedia?.('(display-mode: standalone)').matches || globalThis.navigator?.standalone === true) {
    location.replace(`/app/?open=${encodeURIComponent(here())}`);
    return;
  }
  if (!H) land();
  remember();
  const mount = () => {
    draw();
    // (The app may draw its top line later, or redraw the account's box.)
    new MutationObserver(() => place()).observe(document.querySelector('.q-appbar') || document.body, { childList: true, subtree: true });
    new MutationObserver(() => place()).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    // (The tabs may come later; a phone turned on its side.)
    globalThis.addEventListener('resize', () => place());
    for (const ms of [300, 1500, 4000]) setTimeout(place, ms);
  };
  if (document.body) mount();
  else document.addEventListener('DOMContentLoaded', mount, { once: true });
  // Leaving (another app, the home screen): where it was, kept.
  globalThis.addEventListener('pagehide', remember);
  document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && remember());
  // Back from the browser's own memory (a computer's back button): the trail again.
  globalThis.addEventListener('pageshow', e => {
    if (!e.persisted || hostOf()) return;
    // (An app that showed its loading screen on the way out: it is here, as left.)
    document.getElementById('loading')?.setAttribute('hidden', '');
    land();
    draw();
  });
  // (A page left for the browser's memory never opens anything later.)
  globalThis.addEventListener('pagehide', () => clearTimeout(fallback));
  warmSoon();
  globalThis.addEventListener('hashchange', () => remember());
}

// ---- Orbit's window: every app held at once (site/app/) ----
// Jay 2026-11-13: an app switched away from keeps running, Beats playing
// on, however many apps are opened after it; back shows an app as it was
// left, never loaded again. Each app opens in a frame of its own, the
// whole window (inside the phone's safe area); a switch shows another
// frame. Kept: the one shown, any that's playing sound (never closed), and
// the KEEP (3) most lately used others (a phone's memory); past that the oldest quiet one is
// closed (where it was is kept, so it opens there again). A hidden frame
// reads as hidden to its app (document.visibilityState), so its live
// updates pause as on a locked phone, unless it's playing.
export const KEEP = 3;
// The frames to close: never the one shown or a playing one; the oldest first.
export function toClose(frames, shown, keep = KEEP) {
  const quiet = frames.filter(f => f.app !== shown && !f.playing).sort((a, b) => b.used - a.used);
  return quiet.slice(keep).map(f => f.app);
}
// Playing sound: the app says so to the phone (Beats' now playing) or a sound or video of its own is running.
function playing(w) {
  try {
    if (w?.navigator?.mediaSession?.playbackState === 'playing') return true;
    for (const m of w?.document?.querySelectorAll?.('audio, video') || []) if (!m.paused && !m.ended && !m.muted) return true;
  } catch {}
  return false;
}
export function host(box, { first = null, list = null } = {}) {
  const frames = new Map();
  let shown = null;
  const top = document;
  // Hidden to the app inside: shown only while this one is (and the phone's screen is).
  const look = (f, on) => {
    const d = f.el.contentDocument;
    if (!d || !f.el.contentWindow) return;
    const away = !on && !playing(f.el.contentWindow);
    if (!d.__orbitLook) {
      d.__orbitLook = true;
      try {
        Object.defineProperty(d, 'visibilityState', { configurable: true, get: () => (d.__orbitAway || top.visibilityState === 'hidden' ? 'hidden' : 'visible') });
        Object.defineProperty(d, 'hidden', { configurable: true, get: () => d.visibilityState === 'hidden' });
      } catch {}
    }
    if (d.__orbitAway === away) return;
    d.__orbitAway = away;
    d.dispatchEvent(new Event('visibilitychange'));
  };
  const make = (id, url, y) => {
    const to = new URL(url || resumeOf(savedSuite(), id).url, location.href);
    if (y > 0) writeJson('sessionStorage', PLACE_KEY, { path: to.pathname, hash: to.hash, y, t: Date.now() });
    const el = document.createElement('iframe');
    el.className = 'q-suite-frame';
    el.title = short(id);
    el.setAttribute('allow', 'autoplay; fullscreen; geolocation; microphone; camera; clipboard-read; clipboard-write; web-share; publickey-credentials-get; publickey-credentials-create; screen-wake-lock');
    el.src = to.href;
    const f = { app: id, el, used: Date.now() };
    // A frame that went to another app's page (a link, a notice): that app's
    // frame takes the page; this one goes back to where it was.
    el.addEventListener('load', () => {
      let w;
      try {
        w = el.contentWindow;
        void w.location.pathname;
      } catch {
        return;
      }
      const there = appAt(w.location.pathname);
      if (there && there !== id) {
        const url = keepable(`${w.location.pathname}${w.location.search}${w.location.hash}`);
        el.src = resumeOf(savedSuite(), id).url;
        api.go(there, url);
        return;
      }
      look(f, shown === id);
      if (shown === id) w.__orbitSuite?.draw?.();
    });
    frames.set(id, f);
    box.append(el);
    return f;
  };
  const tidy = () => {
    const list = [...frames.values()].map(f => ({ app: f.app, used: f.used, playing: playing(f.el.contentWindow) }));
    for (const id of toClose(list, shown)) {
      const f = frames.get(id);
      try {
        f.el.contentWindow?.__orbitSuite?.remember?.();
      } catch {}
      f.el.remove();
      frames.delete(id);
    }
  };
  const show = (id, url = null, y = 0) => {
    if (!BRANDS[id]) return;
    let f = frames.get(id);
    if (!f) f = make(id, url, y);
    else if (url) {
      try {
        const w = f.el.contentWindow;
        const to = new URL(url, location.href);
        if (to.pathname === w.location.pathname && to.search === w.location.search) {
          if (to.hash !== w.location.hash) w.location.hash = to.hash;
        } else w.location.assign(to.href);
      } catch {
        f.el.src = url;
      }
    }
    const was = shown;
    shown = id;
    f.used = Date.now();
    for (const g of frames.values()) {
      const on = g === f;
      g.el.classList.toggle('q-suite-shown', on);
      g.el.toggleAttribute('inert', !on);
      g.el.setAttribute('aria-hidden', on ? 'false' : 'true');
      look(g, on);
    }
    if (was !== id) {
      try {
        f.el.contentWindow?.__orbitSuite?.draw?.();
        f.el.contentWindow?.focus?.();
      } catch {}
    }
    document.title = 'Orbit';
    writeJson('localStorage', SUITE_KEY, { ...savedSuite(), last: id, left: 0 });
    tidy();
  };
  const api = {
    go(id, url = null) {
      if (!BRANDS[id]) return;
      if (id !== shown) writeTrail(jump(readTrail(), id, url || (frames.has(id) ? null : resumeOf(savedSuite(), id).url)));
      show(id, url);
    },
    back() {
      const t = readTrail();
      const to = backOf(t);
      if (!to) return;
      writeTrail(step(t, -1));
      show(to.app, frames.has(to.app) ? null : to.url, to.y || 0);
    },
    forward() {
      const t = readTrail();
      const to = forwardOf(t);
      if (!to) return;
      writeTrail(step(t, 1));
      show(to.app, frames.has(to.app) ? null : to.url, to.y || 0);
    },
    // An address (a notice's): its app shown there.
    open(url) {
      const id = appAt(new URL(url, location.href).pathname);
      if (id) api.go(id, url);
    },
    shown: () => shown,
    held: () => [...frames.keys()]
  };
  globalThis.ORBIT_HOST = api;
  // Off the phone's screen: which app, and when (where Orbit opens next). Back
  // on it: the rules of launchTarget again, with a playing app live too.
  let awayAt = 0;
  top.addEventListener('visibilitychange', () => {
    if (top.visibilityState === 'hidden') {
      awayAt = Date.now();
      if (shown) writeJson('localStorage', SUITE_KEY, { ...savedSuite(), last: shown, left: awayAt });
    }
    for (const f of frames.values()) {
      const d = f.el.contentDocument;
      if (d) d.dispatchEvent(new Event('visibilitychange'));
    }
    if (top.visibilityState !== 'visible' || !awayAt) return;
    const live = { ...liveSaved() };
    for (const f of frames.values()) if (playing(f.el.contentWindow) && !live[f.app]) live[f.app] = { t: f.used };
    const to = launchTarget(savedSuite(), live);
    awayAt = 0;
    if (!to) return void list?.();
    if (to.app !== shown) api.go(to.app, frames.has(to.app) && !liveSaved()[to.app]?.url ? null : to.url);
  });
  setInterval(() => {
    for (const f of frames.values()) if (f.app !== shown) look(f, false);
    tidy();
  }, 15000);
  if (first) {
    const t = readTrail();
    writeTrail(t.list[t.i]?.app === first.app ? t : arrive(t, first.app, first.url));
    show(first.app, first.url, first.y || 0);
  }
  return api;
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
