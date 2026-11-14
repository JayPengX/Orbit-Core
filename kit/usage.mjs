// ---- How Orbit is used, counted without knowing who (Jay 2026-11-14) ----
// Jay: "if collecting data from users could help our app or give us
// analytical data, start collecting". What helps: which apps and tabs are
// opened, how fast they open, what breaks, where people stop in sign-in or
// setup, and on what kind of screen. What doesn't, and is never sent: who
// you are (no account id, no device id, no address kept), what you type or
// keep (notes, money, searches, schedules), where you are, what a page's
// address carries after its tab name (#qh= sign-ins, a stock, a law).
//
//   - Counts only. The phone keeps, for itself, the day it first opened each
//     app and the last day, week and month it did (localStorage
//     `orbit.usage.days.v1`); a beacon then says "first open today" as a flag,
//     never an id, so the proxy (usage.js) can add up devices a day, a week,
//     a month, and how many come back, without telling one from another.
//   - A beacon (sendBeacon, a few hundred bytes) as the page is put away,
//     at most one every 30 s; what wasn't sent waits on the phone for the
//     next one. Never from a page off our domain (a preview, a test).
//   - Off: the Pass sheet's 使用統計 switch (following the account, as
//     連結 does), or a browser asking sites not to track (Global Privacy
//     Control). Off sends nothing and clears what waits.
//   - What is said, why and for how long: /privacy/ (site/privacy/).
//
// The proxy reads the same shapes with `cleanBeacon` (used both sides).

import { BRANDS } from './brand.mjs';
import { API, onDomain } from './domain.mjs';

const WAIT_KEY = 'orbit.usage.wait.v1:'; // + the app: what waits to be sent
const DAYS_KEY = 'orbit.usage.days.v1'; // each app's first, last day, week and month here
const OFF_KEY = 'orbit.usage.off.v1';
const NOTICE_KEY = 'orbit.usage.notice.v1';
const EVERY_MS = 30_000;
const DAY_MS = 86_400_000;

// ---- The shapes (both sides) ----
// An app's id: the kit's (BRANDS), Orbit itself ('suite'), the Pass's page,
// the giveaway, the policy pages.
export const USAGE_APPS = [...Object.keys(BRANDS), 'suite', 'pass', 'key', 'legal'];
const NAME = /^[a-z][a-z0-9-]{0,23}$/;
const STEP = /^[a-z][a-z0-9-]{0,23}:[a-z][a-z0-9-]{0,31}$/;
// Load times, in buckets (ms: the upper edge).
export const LOAD_EDGES = [500, 1000, 1500, 2000, 3000, 5000, 8000, 15000];
export const loadBucket = ms => String(LOAD_EDGES.find(e => ms < e) || 'more');
export const DIMS = {
  where: ['orbit', 'home', 'web'],
  dev: ['phone', 'tablet', 'computer'],
  os: ['ios', 'android', 'mac', 'windows', 'other'],
  lang: ['zh', 'en'],
  theme: ['dark', 'light'],
  signed: ['yes', 'no']
};

// Taiwan's day, its week (the Monday) and its month: the proxy counts by Taiwan's.
export const twDayOf = (t = Date.now()) => new Date(t + 8 * 3_600_000).toISOString().slice(0, 10);
export function weekOf(day) {
  const d = new Date(`${day}T00:00:00Z`);
  return new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * DAY_MS).toISOString().slice(0, 10);
}

// An error said without anything a person typed or kept: addresses,
// numbers, quoted text and long words go; at most 100 characters, with the
// file's name (never its path or query) and line.
export function errSig(message, file = '', line = 0) {
  let m = String(message || 'error')
    .replace(/https?:\/\/\S+/g, '<url>')
    .replace(/\S+@\S+/g, '<at>')
    .replace(/(["'`“「])[^"'`”」]*(["'`”」])/g, '$1…$2')
    .replace(/\b[0-9a-f]{12,}\b/gi, '<id>')
    .replace(/\d+(\.\d+)?/g, '#')
    .replace(/[^\x20-\x7e一-鿿…<>#]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100);
  const f = String(file || '')
    .split(/[?#]/)[0]
    .split('/')
    .pop()
    .replace(/[^\w.-]/g, '')
    .slice(0, 40);
  return f ? `${m} @${f}:${Math.max(0, line | 0)}` : m;
}

// A beacon, as the proxy takes it (anything else dropped): null when it's
// no beacon at all.
export function cleanBeacon(b) {
  if (!b || typeof b !== 'object' || b.v !== 1 || !USAGE_APPS.includes(b.app)) return null;
  const n = (v, max) => Math.min(Math.max(0, Math.floor(Number(v) || 0)), max);
  const flags = v => (Array.isArray(v) ? [n(v[0], 1), n(v[1], 1)] : [0, 0]);
  const counts = (o, re, max, limit) =>
    Object.fromEntries(
      Object.entries(o && typeof o === 'object' ? o : {})
        .filter(([k]) => re.test(k))
        .slice(0, limit)
        .map(([k, v]) => [k, n(v, max)])
        .filter(([, v]) => v > 0)
    );
  const dims = {};
  for (const [k, vals] of Object.entries(DIMS)) if (vals.includes(b.dims?.[k])) dims[k] = b.dims[k];
  const coh = typeof b.coh === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(b.coh) ? b.coh : '';
  const errs = {};
  for (const [k, v] of Object.entries(b.err && typeof b.err === 'object' ? b.err : {}).slice(0, 5)) {
    const s = errSig(k.replace(/ @[\w.-]+:\d+$/, ''), (k.match(/ @([\w.-]+):\d+$/) || [])[1] || '', Number((k.match(/:(\d+)$/) || [])[1]) || 0);
    if (s) errs[s] = (errs[s] || 0) + n(v, 50);
  }
  return {
    app: b.app,
    open: n(b.open, 20),
    day: flags(b.day),
    week: flags(b.week),
    month: flags(b.month),
    fresh: flags(b.fresh),
    dims,
    coh,
    tabs: counts(b.tabs, NAME, 500, 30),
    step: counts(b.step, STEP, 50, 20),
    load: b.load == null ? null : n(b.load, 600_000),
    sec: n(b.sec, 6 * 3_600),
    err: errs
  };
}

// ---- On the phone ----
const g = globalThis;
const store = {
  get(k) {
    try {
      return JSON.parse(g.localStorage?.getItem(k) || 'null');
    } catch {
      return null;
    }
  },
  set(k, v) {
    try {
      if (v == null) g.localStorage?.removeItem(k);
      else g.localStorage?.setItem(k, JSON.stringify(v));
    } catch {}
  }
};

// Whether counting is on here: the person's switch (on unless turned off),
// and no Global Privacy Control.
export const usageAsked = () => Boolean(store.get(OFF_KEY));
export function usageOn() {
  if (g.navigator?.globalPrivacyControl === true) return false;
  return store.get(OFF_KEY)?.off !== true;
}
// The switch: kept here (with its time), and on the pass when signed in
// (`s`: the session, as the 連結 switch). Off clears what waits.
export function setUsageOn(on, s = null) {
  const v = { off: !on, t: Date.now() };
  store.set(OFF_KEY, v);
  if (!on) {
    pending = null;
    store.set(WAIT_KEY + appId(), null);
  }
  s?.write?.({ wallet: { settings: { usage: { value: on ? 'on' : 'off', t: v.t } } } })?.catch?.(() => {});
  return on;
}
// The pass's choice, when newer than this device's.
export function adoptUsage(wallet) {
  const held = wallet?.settings?.usage;
  const mine = store.get(OFF_KEY);
  if (!held?.value || !(Number(held.t) > (Number(mine?.t) || 0))) return false;
  store.set(OFF_KEY, { off: held.value === 'off', t: Number(held.t) });
  if (held.value === 'off') pending = null;
  return true;
}
// The first-open notice, seen (kit pass.mjs / orbit.mjs show it once).
export const usageNoticeSeen = () => Boolean(store.get(NOTICE_KEY)) || usageAsked();
export const markUsageNotice = () => store.set(NOTICE_KEY, Date.now());

// What the kit tells us about this page (orbit.mjs fills them in).
export const usageProbe = { signed: () => false, inSuite: () => false };

let pending = null;
let started = false;
let lastSent = 0;
let shownAt = 0;

function appId() {
  const d = g.document?.documentElement?.dataset?.app;
  if (d && USAGE_APPS.includes(d)) return d;
  const first = String(g.location?.pathname || '').split('/')[1] || '';
  if (first === 'app') return 'suite';
  if (first === 'privacy' || first === 'terms') return 'legal';
  if (first === 'pass' || first === '') return 'pass';
  if (first === 'key') return 'key';
  return Object.keys(BRANDS).find(k => BRANDS[k].slug === first) || '';
}
function dims() {
  const ua = String(g.navigator?.userAgent || '');
  const touch = (g.navigator?.maxTouchPoints || 0) > 1;
  const w = Math.min(g.screen?.width || 0, g.screen?.height || 0);
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && touch);
  const os = ios ? 'ios' : /Android/.test(ua) ? 'android' : /Macintosh/.test(ua) ? 'mac' : /Windows/.test(ua) ? 'windows' : 'other';
  const coarse = g.matchMedia?.('(pointer: coarse)').matches;
  const dev = !coarse && !touch ? 'computer' : w >= 600 ? 'tablet' : 'phone';
  const home = g.matchMedia?.('(display-mode: standalone)').matches || g.navigator?.standalone === true;
  let framed = false;
  try {
    framed = g.parent !== g && Boolean(g.parent?.ORBIT_HOST);
  } catch {}
  return {
    where: framed || usageProbe.inSuite() ? 'orbit' : home ? 'home' : 'web',
    dev,
    os,
    lang: /^en/i.test(g.document?.documentElement?.lang || '') ? 'en' : 'zh',
    theme: g.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
    signed: usageProbe.signed() ? 'yes' : 'no'
  };
}
const fresh = () => ({ open: 0, day: [0, 0], week: [0, 0], month: [0, 0], fresh: [0, 0], tabs: {}, step: {}, load: null, sec: 0, err: {} });
function bag() {
  if (!pending) pending = { ...fresh(), ...store.get(WAIT_KEY + appId()) };
  return pending;
}
const add = (o, k, by = 1) => (o[k] = (o[k] || 0) + by);

// This page's opening: first today, this week, this month, ever (this app
// and any app), and the week this phone first opened Orbit.
function opened(now = Date.now()) {
  const app = appId();
  const b = bag();
  b.open = (b.open || 0) + 1;
  const seen = store.get(DAYS_KEY) || {};
  const day = twDayOf(now);
  const week = weekOf(day);
  const month = day.slice(0, 7);
  const mark = (k, idx) => {
    const was = seen[k] || {};
    if (!was.first) {
      was.first = day;
      b.fresh[idx] = 1;
    }
    if (was.day !== day) b.day[idx] = 1;
    if (was.week !== week) b.week[idx] = 1;
    if (was.month !== month) b.month[idx] = 1;
    seen[k] = { ...was, day, week, month };
  };
  mark(app, 0);
  mark('*', 1);
  b.coh = weekOf(seen['*'].first);
  if (b.day[0]) b.dims = dims();
  store.set(DAYS_KEY, seen);
}

export function usageTab(id) {
  if (!started || !NAME.test(String(id))) return;
  add(bag().tabs, String(id));
}
// A step in a flow (sign-in, sign-up, Orbit's setup): 'area:step'.
export function usageStep(name) {
  if (!started || !STEP.test(String(name))) return;
  add(bag().step, String(name));
}
function noteError(message, file, line) {
  const b = bag();
  const k = errSig(message, file, line);
  if (b.err[k] || Object.keys(b.err).length < 5) add(b.err, k);
}

// What waits, sent if it's been 30 s since the last (else kept on the
// phone for the next time): true when a beacon went.
export function sendUsage(now = Date.now()) {
  if (!started || !pending) return false;
  if (!usageOn()) {
    pending = null;
    return false;
  }
  if (shownAt) {
    pending.sec += Math.round((now - shownAt) / 1000);
    shownAt = g.document?.visibilityState === 'visible' ? now : 0;
  }
  const p = pending;
  if (!p.open && !Object.keys(p.tabs).length && !Object.keys(p.step).length && !Object.keys(p.err).length && p.load == null && p.sec < 5) return false;
  const app = appId();
  let sent = false;
  if (now - lastSent >= EVERY_MS) {
    try {
      sent = typeof g.navigator?.sendBeacon === 'function' && g.navigator.sendBeacon(`${API}/usage`, new Blob([JSON.stringify({ v: 1, app, ...p })], { type: 'text/plain' }));
    } catch {}
  }
  if (sent) {
    lastSent = now;
    pending = fresh();
    store.set(WAIT_KEY + app, null);
  } else store.set(WAIT_KEY + app, p);
  return sent;
}

export function watchUsage() {
  if (started || !g.document || !g.location || !onDomain || !usageOn() || !appId()) return;
  started = true;
  opened();
  shownAt = g.document.visibilityState === 'visible' ? Date.now() : 0;
  // How long until the loading cover lifts (boot.js's #loading hidden), from the page's start.
  const cover = g.document.getElementById('loading');
  if (cover && !cover.hidden && typeof MutationObserver === 'function') {
    const mo = new MutationObserver(() => {
      if (!cover.hidden && cover.isConnected) return;
      mo.disconnect();
      if (bag().load == null) bag().load = Math.round(g.performance?.now?.() || 0);
    });
    mo.observe(cover, { attributes: true, attributeFilter: ['hidden'] });
    if (g.document.body) mo.observe(g.document.body, { childList: true });
  }
  g.addEventListener('error', e => e?.message && noteError(e.message, e.filename, e.lineno));
  g.addEventListener('unhandledrejection', e => noteError(e?.reason?.message || String(e?.reason || 'rejected'), '', 0));
  g.document.addEventListener('visibilitychange', () => {
    if (g.document.visibilityState === 'hidden') sendUsage();
    else shownAt = Date.now();
  });
  g.addEventListener('pagehide', () => sendUsage());
}

if (g.document) {
  if (g.document.readyState === 'loading') g.document.addEventListener('DOMContentLoaded', () => watchUsage(), { once: true });
  else setTimeout(() => watchUsage(), 0);
}
