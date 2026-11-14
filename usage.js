// ---- usage.js: how Orbit is used, as counts (Jay 2026-11-14) ----
//
// Phones send a beacon as a page is put away (kit/usage.mjs): which app,
// whether it's that device's first open today / this week / this month /
// ever (flags, never an id), the kind of device, the tabs opened, how long
// the loading screen took, what broke, steps in sign-in and setup. Nothing
// here can tell one person or device from another: no account, no device
// id, no address is kept (the address only paces beacons, in memory).
//
//   - Kept: in the isolate's memory, then one D1 statement adds it all to
//     `usage` (a row a Taiwan day, app, kind and key: a count) once the
//     oldest count is 2 minutes old, or as a beacon comes to an isolate that
//     wrote nothing in the last 2 minutes; at the end of each cron tick too.
//   - Retention (cohorts) as `ret` rows: app '*', day = the week's Monday,
//     key = the Monday of the week the device first opened Orbit.
//   - Rows go after 400 days (errors after 30): the nightly backup's slot.
//   - Read: the admin panel's 使用 (eco-admin.js `use`), on demand.

import { cleanBeacon, loadBucket, weekOf, twDayOf } from './kit/usage.mjs';

const MIN = 60_000;
const DAY = 86_400_000;
export const KEEP_DAYS = 400;
export const ERR_DAYS = 30;
const FLUSH_MS = 2 * MIN;

const pending = new Map();
let oldest = 0;
let lastFlush = 0;
let flushing = null;

const bump = (day, app, kind, key, n) => {
  if (!n) return;
  const k = `${day}|${app}|${kind}|${key}`;
  pending.set(k, (pending.get(k) || 0) + n);
};

// One beacon into the counts: true when it was one.
export function takeUsage(body, now = Date.now()) {
  const b = cleanBeacon(body);
  if (!b) return false;
  const day = twDayOf(now);
  const week = weekOf(day);
  for (const [i, app] of [b.app, '*'].entries()) {
    bump(day, app, 'day', '', b.day[i]);
    bump(day, app, 'week', '', b.week[i]);
    bump(day, app, 'month', '', b.month[i]);
    bump(day, app, 'new', '', b.fresh[i]);
  }
  bump(day, b.app, 'open', '', b.open);
  // (The kind of device: once a device a day, as it opens.)
  if (b.day[0]) for (const [k, v] of Object.entries(b.dims)) bump(day, b.app, 'dim', `${k}:${v}`, 1);
  if (b.day[1]) for (const [k, v] of Object.entries(b.dims)) bump(day, '*', 'dim', `${k}:${v}`, 1);
  if (b.week[1] && b.coh && b.coh <= week) bump(week, '*', 'ret', b.coh, 1);
  for (const [k, n] of Object.entries(b.tabs)) bump(day, b.app, 'tab', k, n);
  for (const [k, n] of Object.entries(b.step)) bump(day, b.app, 'step', k, n);
  for (const [k, n] of Object.entries(b.err)) bump(day, b.app, 'err', k, n);
  if (b.load != null && b.load > 0) bump(day, b.app, 'load', loadBucket(b.load), 1);
  bump(day, b.app, 'sec', '', b.sec);
  if (!oldest) oldest = now;
  return true;
}

const TABLE = 'CREATE TABLE IF NOT EXISTS usage (day TEXT NOT NULL, app TEXT NOT NULL, kind TEXT NOT NULL, key TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (day, app, kind, key))';
const ADD = `INSERT INTO usage (day, app, kind, key, n)
  SELECT json_extract(value, '$[0]'), json_extract(value, '$[1]'), json_extract(value, '$[2]'), json_extract(value, '$[3]'), json_extract(value, '$[4]') FROM json_each(?1) WHERE true
  ON CONFLICT (day, app, kind, key) DO UPDATE SET n = n + excluded.n`;
const ready = new WeakSet();
async function table(db) {
  if (ready.has(db)) return;
  await db.prepare(TABLE).run();
  ready.add(db);
}

// What this isolate counted, added to D1 when due (`soon`: a beacon just
// came; `force`: now).
export function flushUsage(env, ctx = null, { now = Date.now(), force = false, soon = false } = {}) {
  if (!pending.size || !env?.STORE || flushing) return null;
  if (!force && now - oldest < FLUSH_MS && !(soon && now - lastFlush >= FLUSH_MS)) return null;
  lastFlush = now;
  const rows = [...pending].map(([k, n]) => [...k.split('|'), n]);
  pending.clear();
  oldest = 0;
  const p = (async () => {
    await table(env.STORE);
    await env.STORE.prepare(ADD).bind(JSON.stringify(rows)).run();
  })()
    .catch(e => console.log('usage flush failed', String(e?.message || e).slice(0, 160)))
    .finally(() => (flushing = null));
  flushing = p;
  ctx?.waitUntil?.(p);
  return p;
}

// Rows past their days, gone (the nightly slot).
export async function pruneUsage(env, now = Date.now()) {
  if (!env?.STORE) return { off: true };
  await table(env.STORE);
  const r = await env.STORE.prepare("DELETE FROM usage WHERE day < ?1 OR (kind = 'err' AND day < ?2)")
    .bind(twDayOf(now - KEEP_DAYS * DAY), twDayOf(now - ERR_DAYS * DAY))
    .run();
  return { removed: r?.meta?.changes ?? 0 };
}

// The last `days` days' rows, as { rows: [[day, app, kind, key, n]], from, to }.
export async function readUsage(env, { days = 35, now = Date.now() } = {}) {
  if (!env?.STORE) return { rows: [] };
  await table(env.STORE);
  const from = twDayOf(now - Math.min(Math.max(days, 1), 120) * DAY);
  const retFrom = twDayOf(now - 12 * 7 * DAY);
  const { results } = await env.STORE.prepare("SELECT day, app, kind, key, n FROM usage WHERE day >= ?1 OR (kind = 'ret' AND day >= ?2)").bind(from, retFrom).all();
  return { from, to: twDayOf(now), rows: (results || []).map(r => [r.day, r.app, r.kind, r.key, r.n]) };
}

// (Tests.)
export const _pending = () => pending;
export function _reset() {
  pending.clear();
  oldest = 0;
  lastFlush = 0;
  flushing = null;
}
