// ---- A phone's own outside reads, counted and sent back (Jay 2026-11-10) ----
// Some sources a phone reads itself, never through the proxy (ESPN, MLB,
// Jolpica, YouBike, TheSportsDB: orbit.mjs DEVICE_FIRST, SELF_TOO, an app's
// own reads). When one of them breaks, only phones see it. So every
// cross-origin fetch a page makes is counted by its host (answered, failed,
// how long), and the counts go back to the proxy (POST /sources, sources.js)
// for the admin panel's 外部來源:
//
//   - with one sendBeacon as the page is put away, and only when something
//     failed or 6 hours have passed since the last one; while the page is
//     open, a failure is sent after 10 minutes at the latest;
//   - at most one every 10 minutes a phone (localStorage), a few hundred
//     bytes, nothing about the person (hosts and counts only);
//   - never from a page off our domain (a local preview, a test), and a
//     read that fails while the phone is offline isn't the source's fault.
// The proxy keeps only the hosts kit/sources.mjs names.

import { API, onDomain } from './domain.mjs';

const KEY = 'orbit.sources.v1';
const EVERY_MS = 10 * 60_000;
const SUMMARY_MS = 6 * 3_600_000;
const MAX_HOSTS = 40;

const counts = new Map();
let failedSince = 0;

const read = () => {
  try {
    return JSON.parse(localStorage.getItem(KEY) || 'null') || {};
  } catch {
    return {};
  }
};
const write = v => {
  try {
    localStorage.setItem(KEY, JSON.stringify(v));
  } catch {}
};

// [ok, fail, ms, lastOk, lastFail, err] a host.
function note(host, ok, ms, err) {
  let c = counts.get(host);
  if (!c) {
    if (counts.size >= MAX_HOSTS) return;
    counts.set(host, (c = [0, 0, 0, 0, 0, '']));
  }
  const now = Date.now();
  c[ok ? 0 : 1]++;
  c[2] += Math.round(ms);
  if (ok) c[3] = now;
  else {
    c[4] = now;
    c[5] = String(err).slice(0, 60);
    failedSince ||= now;
  }
}

// The counts sent, if it's time (`leaving`: the page is going away).
export function sendSources(leaving = false) {
  if (!counts.size || typeof navigator?.sendBeacon !== 'function') return false;
  const now = Date.now();
  const kept = read();
  if (now - (kept.sent || 0) < EVERY_MS) return false;
  const due = failedSince ? leaving || now - failedSince >= EVERY_MS : now - (kept.summary || 0) >= SUMMARY_MS && leaving;
  if (!due) return false;
  const body = JSON.stringify({ h: Object.fromEntries(counts) });
  let sent = false;
  try {
    sent = navigator.sendBeacon(`${API}/sources`, new Blob([body], { type: 'text/plain' }));
  } catch {}
  if (!sent) return false;
  counts.clear();
  failedSince = 0;
  write({ sent: now, summary: now });
  return true;
}

export function watchSources() {
  const g = globalThis;
  if (g.__orbitSourceWatch || typeof g.fetch !== 'function' || !g.location || !onDomain) return;
  g.__orbitSourceWatch = true;
  const inner = g.fetch;
  const here = g.location.host;
  g.fetch = function (input, init) {
    const t = performance.now();
    const p = inner.call(this, input, init);
    let host = '';
    try {
      const u = new URL(typeof input === 'string' ? input : input?.url || String(input), g.location.href);
      if (u.host !== here && /^https?:$/.test(u.protocol)) host = u.hostname;
    } catch {}
    if (!host) return p;
    Promise.resolve(p).then(
      res => {
        // (A no-cors answer can't be read: not counted.)
        if (res.type === 'opaque') return;
        const bad = res.status >= 500 || res.status === 429 || res.status === 401 || res.status === 403;
        note(host, !bad, performance.now() - t, bad ? `HTTP ${res.status}` : '');
      },
      e => {
        // (Cancelled by the page, or the phone offline: not the source's fault.)
        if (e?.name === 'AbortError' || navigator.onLine === false) return;
        note(host, false, performance.now() - t, e?.name === 'TimeoutError' ? 'timeout' : 'no answer');
      }
    );
    return p;
  };
  const away = () => document.visibilityState === 'hidden' && sendSources(true);
  document.addEventListener('visibilitychange', away);
  g.addEventListener('pagehide', () => sendSources(true));
  setInterval(() => document.visibilityState === 'visible' && sendSources(false), EVERY_MS);
}

watchSources();
