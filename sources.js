// ---- sources.js: how the outside sources answer us ----
//
// The admin panel's 健康 › 外部來源 (Jay, 2026-11-10: the apps "rely heavily on
// outside sources… so when it break I can come back to you"). No polling of
// our own: every outside call the proxy makes anyway is counted, and phones
// count theirs and send it back now and then (kit/source-watch.mjs).
//
//   - The proxy: `fetch` is wrapped once, on import, before the Runner's own
//     wrapper (runner.js), so a call is counted once, where it is really
//     made: answered (any status under 500, but 401, 403, 429), failed
//     (those, 5xx, or no answer), and how long it took, by its host's source
//     (kit/sources.mjs). A call the Taiwan relay makes for us (GEMINI_RELAY)
//     is counted by the address it was sent to. Our tools' calls (a page on
//     localhost, the dev door: nine in ten of the Worker's requests,
//     2026-11-10) are never counted.
//   - Phones: POST /sources, a beacon from our own pages only, at most every
//     10 minutes a phone (source-watch.mjs), one a minute an address here.
//   - Kept: in the isolate's memory, then one D1 statement adds it all to
//     `sources` (a row a source, hour and side) once the oldest count is 5
//     minutes old, or a minute while something fails; a phone's beacon at
//     once when this isolate kept nothing in the last 5 minutes (a quiet
//     isolate may see no request after it, and its counts would go with
//     it; 2026-11-10). Rows a week old go
//     with the nightly backup's slot (pruneSources).
//   - Read: the admin panel's `sources` (eco-admin.js), on demand.

import { AsyncLocalStorage } from 'node:async_hooks';
import { sourceOf, SOURCE_BY_ID } from './kit/sources.mjs';

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
export const KEEP_DAYS = 8;
const FLUSH_MS = 5 * MIN;
const FLUSH_FAILING_MS = MIN;
// The sides a count comes from (the panel's 從哪裡讀).
export const SIDES = ['worker', 'cron', 'relay', 'phone'];

// What a call was made for: { quiet } (our tools'), { job } (a cron job's), { side }.
const callFor = new AsyncLocalStorage();
export const sourceCall = () => callFor.getStore() || null;
export const asSourceCall = (c, fn) => callFor.run({ ...(callFor.getStore() || {}), ...c }, fn);

// ---- Counting (in the isolate) ----
const pending = new Map();
let oldest = 0;
let failing = false;
let flushing = null;
let lastFlush = 0;

const HOST = /^[a-z][a-z0-9+.-]*:\/\/([^/:?#]+)([^?#]*)/i;
const failed = status => status >= 500 || status === 429 || status === 401 || status === 403 || status === 0;
// One call's outcome. `err` only when it failed (the host, status, path; never a query: keys ride there).
export function noteSource(src, side, ok, ms, err = '', now = Date.now()) {
  if (!src) return;
  const k = `${src}|${Math.floor(now / HOUR)}|${side}`;
  let r = pending.get(k);
  if (!r) pending.set(k, (r = { ok: 0, fail: 0, ms: 0, lastOk: 0, lastFail: 0, err: '' }));
  if (ok) {
    r.ok++;
    r.lastOk = now;
  } else {
    r.fail++;
    r.lastFail = now;
    r.err = err.slice(0, 160);
    failing = true;
  }
  r.ms += Math.max(0, Math.min(ms, 120_000)) | 0;
  if (!oldest) oldest = now;
}
function noteUrl(url, side, status, ms, why) {
  const m = HOST.exec(url);
  if (!m) return;
  const c = callFor.getStore();
  if (c?.quiet) return;
  const src = sourceOf(m[1], c?.job || '');
  if (!src) return;
  const bad = why ? true : failed(status);
  noteSource(src, c?.side || side, !bad, ms, bad ? `${m[1]} ${why || status} ${m[2].slice(0, 60)}` : '');
}
const urlOf = input => (typeof input === 'string' ? input : input?.url || String(input || ''));

// The global fetch, counted (once, on import: before runner.js wraps it).
export function watchFetch() {
  if (globalThis.__orbitSourcesFetch || typeof globalThis.fetch !== 'function') return;
  const inner = globalThis.fetch;
  globalThis.__orbitSourcesFetch = inner;
  globalThis.fetch = function (input, init) {
    const t = Date.now();
    const p = inner.call(this, input, init);
    Promise.resolve(p).then(
      res => noteUrl(urlOf(input), 'worker', res.status, Date.now() - t),
      // (A call we cancelled ourselves isn't the source's fault.)
      e => e?.name !== 'AbortError' && noteUrl(urlOf(input), 'worker', 0, Date.now() - t, e?.name === 'TimeoutError' ? 'timeout' : 'no answer')
    );
    return p;
  };
}
watchFetch();

// The Taiwan relay (gemini-relay.js), counted by where it was sent: the
// binding wrapped once per env (its own fetch isn't the global one).
export function watchRelay(env) {
  const relay = env?.GEMINI_RELAY;
  if (!relay || relay.__counted) return;
  try {
    env.GEMINI_RELAY = {
      __counted: true,
      fetch(input, init) {
        const to = new URL(urlOf(input), 'https://gemini-relay').searchParams.get('to') || '';
        const t = Date.now();
        const p = relay.fetch(input, init);
        Promise.resolve(p).then(
          res => noteUrl(to, 'relay', res.status, Date.now() - t),
          e => e?.name !== 'AbortError' && noteUrl(to, 'relay', 0, Date.now() - t, e?.name === 'TimeoutError' ? 'timeout' : 'no answer')
        );
        return p;
      }
    };
  } catch {
    // (An env that can't be changed: the relay's calls go uncounted, never stopped.)
  }
}

// ---- Kept (D1) ----
const TABLE = 'CREATE TABLE IF NOT EXISTS sources (src TEXT NOT NULL, hour INTEGER NOT NULL, side TEXT NOT NULL, ok INTEGER NOT NULL DEFAULT 0, fail INTEGER NOT NULL DEFAULT 0, ms INTEGER NOT NULL DEFAULT 0, last_ok INTEGER NOT NULL DEFAULT 0, last_fail INTEGER NOT NULL DEFAULT 0, err TEXT NOT NULL DEFAULT \'\', PRIMARY KEY (src, hour, side))';
const ADD = `INSERT INTO sources (src, hour, side, ok, fail, ms, last_ok, last_fail, err)
  SELECT json_extract(value, '$[0]'), json_extract(value, '$[1]'), json_extract(value, '$[2]'), json_extract(value, '$[3]'), json_extract(value, '$[4]'), json_extract(value, '$[5]'), json_extract(value, '$[6]'), json_extract(value, '$[7]'), json_extract(value, '$[8]') FROM json_each(?1) WHERE true
  ON CONFLICT (src, hour, side) DO UPDATE SET ok = ok + excluded.ok, fail = fail + excluded.fail, ms = ms + excluded.ms, last_ok = MAX(last_ok, excluded.last_ok), last_fail = MAX(last_fail, excluded.last_fail), err = CASE WHEN excluded.last_fail > last_fail THEN excluded.err ELSE err END`;
const ready = new WeakSet();
async function table(db) {
  if (ready.has(db)) return;
  await db.prepare(TABLE).run();
  ready.add(db);
}

// What this isolate counted, added to D1 when it's due (in the background:
// `ctx.waitUntil`). `force`: now (tests, the end of a cron tick). `soon` (a
// phone's beacon): now too, unless this isolate kept something in the last
// 5 minutes (still one D1 statement an isolate every 5 minutes at most).
export function flushSources(env, ctx = null, { now = Date.now(), force = false, soon = false } = {}) {
  if (!pending.size || !env?.STORE || flushing) return null;
  if (!force && now - oldest < (failing ? FLUSH_FAILING_MS : FLUSH_MS) && !(soon && now - lastFlush >= FLUSH_MS)) return null;
  lastFlush = now;
  const rows = [...pending].map(([k, r]) => {
    const [src, hour, side] = k.split('|');
    return [src, Number(hour), side, r.ok, r.fail, r.ms, r.lastOk, r.lastFail, r.err];
  });
  pending.clear();
  oldest = 0;
  failing = false;
  const p = (async () => {
    await table(env.STORE);
    await env.STORE.prepare(ADD).bind(JSON.stringify(rows)).run();
  })()
    .catch(e => console.log('sources flush failed', String(e?.message || e).slice(0, 160)))
    .finally(() => (flushing = null));
  flushing = p;
  ctx?.waitUntil?.(p);
  return p;
}

// Rows past KEEP_DAYS, gone (the nightly slot).
export async function pruneSources(env, now = Date.now()) {
  if (!env?.STORE) return { off: true };
  await table(env.STORE);
  const r = await env.STORE.prepare('DELETE FROM sources WHERE hour < ?1').bind(Math.floor((now - KEEP_DAYS * DAY) / HOUR)).run();
  return { removed: r?.meta?.changes ?? 0 };
}

// Each source's last 7 days ({ [src]: { ok, fail, ms, lastOk, lastFail, err,
// hours: [[hour, ok, fail]] (the last 24 h), week: { ok, fail }, sides: { side: { ok, fail, lastOk, lastFail } } } }):
// ok/fail/ms are the last 24 hours'; lastOk/lastFail/err the week's.
// (`days`: how far back; the alert mails read one day, mail-alerts.js.)
export async function readSources(env, now = Date.now(), days = 7) {
  if (!env?.STORE) return {};
  await table(env.STORE);
  const since = Math.floor((now - days * DAY) / HOUR);
  const dayAgo = Math.floor((now - DAY) / HOUR);
  const { results } = await env.STORE.prepare('SELECT src, hour, side, ok, fail, ms, last_ok, last_fail, err FROM sources WHERE hour >= ?1').bind(since).all();
  const out = {};
  for (const r of results || []) {
    const s = (out[r.src] ||= { ok: 0, fail: 0, ms: 0, lastOk: 0, lastFail: 0, err: '', hours: {}, week: { ok: 0, fail: 0 }, sides: {} });
    s.week.ok += r.ok;
    s.week.fail += r.fail;
    if (r.last_ok > s.lastOk) s.lastOk = r.last_ok;
    if (r.last_fail > s.lastFail) [s.lastFail, s.err] = [r.last_fail, r.err];
    const side = (s.sides[r.side] ||= { ok: 0, fail: 0, lastOk: 0, lastFail: 0 });
    side.lastOk = Math.max(side.lastOk, r.last_ok);
    side.lastFail = Math.max(side.lastFail, r.last_fail);
    if (r.hour < dayAgo) continue;
    s.ok += r.ok;
    s.fail += r.fail;
    s.ms += r.ms;
    side.ok += r.ok;
    side.fail += r.fail;
    const h = (s.hours[r.hour] ||= [r.hour, 0, 0]);
    h[1] += r.ok;
    h[2] += r.fail;
  }
  for (const s of Object.values(out)) s.hours = Object.values(s.hours).sort((a, b) => a[0] - b[0]);
  return out;
}

// ---- A phone's beacon (POST /sources) ----
//
// { h: { <host>: [ok, fail, ms, lastOk, lastFail, err] } }: only the
// sources the kit names (no stranger's host), at most 40 hosts, counted in
// this hour as the phone's.
export function takeBeacon(body, now = Date.now()) {
  const h = body && typeof body === 'object' && body.h && typeof body.h === 'object' ? body.h : null;
  if (!h) return 0;
  let n = 0;
  const when = t => (Number.isFinite(t) && t > now - 7 * DAY && t <= now + MIN ? Math.min(t, now) : 0);
  for (const [host, v] of Object.entries(h).slice(0, 40)) {
    const src = sourceOf(host);
    if (!src || !SOURCE_BY_ID[src] || !Array.isArray(v)) continue;
    const ok = Math.min(Math.max(0, v[0] | 0), 5_000);
    const fail = Math.min(Math.max(0, v[1] | 0), 5_000);
    if (!ok && !fail) continue;
    const ms = Math.min(Math.max(0, v[2] | 0), 600_000);
    const k = `${src}|${Math.floor(now / HOUR)}|phone`;
    const r = pending.get(k) || { ok: 0, fail: 0, ms: 0, lastOk: 0, lastFail: 0, err: '' };
    r.ok += ok;
    r.fail += fail;
    r.ms += Math.min(ms, 120_000 * (ok + fail));
    r.lastOk = Math.max(r.lastOk, ok ? when(Number(v[3])) || now : 0);
    const lastFail = fail ? when(Number(v[4])) || now : 0;
    if (lastFail > r.lastFail) [r.lastFail, r.err] = [lastFail, `${host} ${String(v[5] || '').replace(/[^\w ./:-]/g, '').slice(0, 80)}`.trim()];
    pending.set(k, r);
    if (fail) failing = true;
    if (!oldest) oldest = now;
    n++;
  }
  return n;
}

// (Tests: what's waiting, and a clean start.)
export const _pending = () => pending;
export function _reset() {
  pending.clear();
  oldest = 0;
  failing = false;
  flushing = null;
  lastFlush = 0;
}
