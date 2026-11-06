// ---- transit.js ----
// Orbit Transit's server side: Taiwan's transit data (TDX, the Ministry of
// Transportation's platform), Google's map, place search and transit routes,
// all behind a Orbit Pass session, all cached and shared, and every billed
// Google call counted against a monthly cap kept under Google's free tier.
//
//   GET /transit/config   the map to draw: Google's (with the browser key,
//                         counted as one map load) while this month is under
//                         its cap, else Taiwan's NLSC map (free, no key)
//   GET /transit/tdx      a TDX API path from the allowlist (TDX_RULES), cached
//                         for as long as that data stays true (live: the
//                         admin panel's 開發, 10 s; timetables 6 h; stations a day), shared
//   GET /transit/search   places by name: Google's autocomplete, or
//                         OpenStreetMap's search past the cap
//   GET /transit/place    one place's position and name (Google Place Details)
//   GET /transit/running  ?city=: which of a city's bus routes have a bus on
//                         the road now (from TDX's estimates, one ask a city)
//   GET /transit/eta      ?city=&stops= (or &route=, &routes=): those stops'
//                         (routes') buses due, from one ask of the whole
//                         city's estimates, shared
//   GET /transit/gps      ?city=&routes=: where those routes' buses are (a
//                         city's from one ask of its whole list, shared)
//   GET /transit/route    plans from A to B: Google's transit routes and TDX's
//                         planner, made one shape (the app adds YouBike plans)
//   GET /transit/status   (open) this month's use against each cap, which
//                         keys are set; never a key itself. ?sample=<name>:
//                         one fixed real ask (a session's or the dev door's)
//
// Secrets: TDX_CLIENT_ID, TDX_CLIENT_SECRET (tdx.transportdata.tw → 會員中心 →
// API 金鑰); GOOGLE_MAPS_BROWSER_KEY (Maps JavaScript API only, restricted to
// https://jaypengx.github.io/*); GOOGLE_MAPS_KEY (Places API (New) and Routes
// API; GOOGLE_WEATHER_KEY is used when it isn't set). Optional var
// TDX_PER_MIN: TDX calls a minute this Worker allows itself (TDX's free
// tier allows 5, 銅級 300).
//
// The caps are this Worker's own count (KV, flushed in batches so KV's
// million writes a month aren't spent on counting): the hard stop is
// Google Cloud's per-day quotas, which the owner sets on each API (the
// CLAUDE.md, §4).

import { SHOWCASE_ORIGINS } from './showcase.js';
import { cleanDev } from './kit/devconfig.mjs';
import { twDay } from './kit/format.mjs';
import { kvJson, kvPut } from './weather.js';

export const TDX_BASE = 'https://tdx.transportdata.tw/api/';
export const TDX_AUTH = 'https://tdx.transportdata.tw/auth/realms/TDXConnect/protocol/openid-connect/token';
export const PLACES = 'https://places.googleapis.com/v1/';
export const ROUTES = 'https://routes.googleapis.com/directions/v2:computeRoutes';
export const MATRIX = 'https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix';
export const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
export const TEXT_SEARCH = 'https://places.googleapis.com/v1/places:searchText';

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

// Google's free monthly use per SKU (since March 2025: 10,000 for Essentials,
// 5,000 for Pro), and the share of it this Worker spends before stopping.
export const CAPS = {
  maps: 9_000, // Dynamic Maps (a Maps JavaScript API map load), Essentials 10,000
  autocomplete: 9_000, // Autocomplete Requests, Essentials 10,000
  details: 9_000, // Place Details Essentials (position, address), 10,000
  detailsPro: 4_500, // Place Details Pro (a place's name), 5,000
  textSearch: 4_500, // Text Search Pro (a search's places with their names and positions), 5,000
  routes: 9_000, // Compute Routes Essentials (transit, and a walk with its line), 10,000
  matrix: 9_000, // Compute Route Matrix Essentials (walks, an element each), 10,000
  showcaseMaps: 600, // the showcase's Transit demo (no sign-in): its own share, each also counted as a map load above
  // The showcase's live demo (a showcase pass, showcase.js): every ask, and
  // the paid ones (search, a place, a route, a walk) out of their own share;
  // past either the demo plays its recording.
  showcaseAsks: 30_000,
  showcasePaid: 1_500
};
// The asks that spend Google's paid calls (a map load is counted apart, showcaseMaps).
const SHOWCASE_PAID = new Set(['/transit/search', '/transit/place', '/transit/route', '/transit/walk']);

// Google bills by the calendar month on Pacific time: counted the same way
// (UTC-8, a little early in summer, never late).
export const billingMonth = (now = Date.now()) => new Date(now - 8 * HOUR).toISOString().slice(0, 7);

// ---- The monthly meter ----------------------------------------------------------------
//
// Every count is added in D1 (STORE, table `meter`: a row a month and key)
// by D1 itself (INSERT … ON CONFLICT DO UPDATE SET n = n + …), an isolate's
// counts of 2 s in one statement: none held, none written over. Until
// 2026-11-06 each isolate held its counts (TDX's until a call came 10 minutes
// later) and wrote KV's copy by reading, adding and writing it: the counts of
// an isolate that went quiet or was replaced by a deploy were lost, and two
// isolates writing at once kept one's (TDX's own page said 41 points for the
// month's first five days, the meter 17).
// Reads stay on KV's copy (transit:use:<month>, read at most once a minute),
// written from D1 by the cron each 2 minutes (mirrorMeter: one writer), with
// what D1 answered this isolate's own adds on top. With no D1 (the tests, the
// preview) KV's copy is the meter, written as before.

const meter = { month: '', stored: null, readAt: 0, pending: {}, flushedAt: 0, timer: null, timerAt: 0 };
export function resetMeter() {
  Object.assign(meter, { month: '', stored: null, readAt: 0, pending: {}, flushedAt: 0, timer: null, timerAt: 0 });
  Object.assign(lastMeter, { month: '', stored: null, readAt: 0 });
}
const meterKey = month => `transit:use:${month}`;
const FLUSH_MS = 2000;

async function readUse(env, now) {
  const month = billingMonth(now);
  // (A new month: counts not yet written go to it, never dropped.)
  if (meter.month !== month) Object.assign(meter, { month, stored: null, readAt: 0, flushedAt: now });
  if (!meter.stored || now - meter.readAt > MIN) {
    const kv = (await kvJson(env, meterKey(month))) || {};
    // (KV's copy can be behind what D1 answered this isolate's adds: each count the larger.)
    for (const [k, v] of Object.entries(meter.stored || {})) if (!(kv[k] >= v)) kv[k] = v;
    meter.stored = kv;
    meter.readAt = now;
  }
  return meter;
}
export async function usage(env, now = Date.now()) {
  const m = await readUse(env, now);
  const out = {};
  for (const k of Object.keys(CAPS)) out[k] = (m.stored[k] || 0) + (m.pending[k] || 0);
  for (const k of Object.keys(m.stored)) if (!(k in out)) out[k] = (m.stored[k] || 0) + (m.pending[k] || 0);
  for (const k of Object.keys(m.pending)) if (!(k in out)) out[k] = m.pending[k];
  return out;
}
// Counts added (none checked). With D1: written within FLUSH_MS, one
// statement for all this isolate's (behind the request, or at once when
// there's none to wait on: a cron's, a builder's). Without: KV's copy as
// before, a count only (`countOnly`) each 10 minutes, a capped one each 10
// calls or 2 minutes.
async function meterAdd(env, adds, now, ctx, countOnly) {
  for (const [k, v] of Object.entries(adds)) if (v) meter.pending[k] = (meter.pending[k] || 0) + v;
  if (env?.STORE) {
    if (!ctx?.waitUntil) return flushUse(env, now);
    // (A flush asked for and not done within 30 s died with its request: another.)
    if (meter.timer && now - meter.timerAt < 30_000) return;
    const p = sleep(FLUSH_MS).then(() => flushUse(env, Date.now()));
    Object.assign(meter, { timer: p, timerAt: now });
    ctx.waitUntil(p.catch(() => {}).finally(() => meter.timer === p && (meter.timer = null)));
    return;
  }
  const gathered = Object.entries(meter.pending).reduce((a, [k, v]) => a + (CAPS[k] != null ? v : 0), 0);
  if (countOnly ? now - meter.flushedAt > 10 * MIN : gathered >= 10 || now - meter.flushedAt > 2 * MIN) {
    const p = flushUse(env, now);
    if (ctx?.waitUntil) ctx.waitUntil(p);
    else await p;
  }
}
// True (and counted) while `sku` has room for `n` more this month.
// `by`: who spent it when it isn't a person: 'dev' (our own tools, the dev
// door), 'show' (the showcase's demo) or 'build' (the builders), also counted
// as `dev:<sku>`, …, so the admin panel's 容量 counts people's use without
// ours (capacity.js). Our tools yield to people: none past half of a free
// month (DEV_SHARE), the rest is theirs.
export const DEV_SHARE = 0.5;
export async function spend(env, sku, n = 1, now = Date.now(), ctx = null, { countOnly = false, by = '' } = {}) {
  const used = await usage(env, now);
  if (CAPS[sku] != null && used[sku] + n > CAPS[sku] * (by === 'dev' ? DEV_SHARE : 1)) return false;
  await meterAdd(env, { [sku]: n, ...(by ? { [`${by}:${sku}`]: n } : {}) }, now, ctx, countOnly);
  return true;
}
// Counted only (errors, for the panel): no cap.
export const tally = (env, key, n = 1, now = Date.now(), ctx = null) => spend(env, key, n, now, ctx, { countOnly: true });
// TDX's plan is points: 200 a month. TDX bills each call, a point per 1,500
// basic ones (basic/…) or per 200 advanced (advanced/…), and what it sends
// besides, a point per 150 MB (basic) or 20 MB (advanced), the two added
// (TDX's 資料服務定價, each API's 計費方式). The planner (maas/…) TDX doesn't
// price: counted as advanced. Each call counted by kind and Taiwan's day
// (`tdx:b:2026-11-06`, `tdx:a:…`, `tdx:m:…`) and its bytes as read
// (`tdx:vb:…`, `tdx:va:…`, `tdx:vm:…`; the admin panel's 用量, beside TDX's
// own page). Until 2026-11-06 the bytes weren't counted: a fifth of the
// points, and most where a city's whole list was read.
// (How the bytes travelled, to learn what TDX bills of them: `tdx:gz:…`
// the calls TDX answered compressed, `tdx:z:…` the bytes it said it sent,
// Content-Length, of `tdx:zn:…` calls that said.)
export const TDX_POINTS = { month: 200, basic: 1500, advanced: 200, basicMB: 150, advancedMB: 20 };
// (TDX's MB is 1,024 KB: its own 明細, 2026-11-06, each row exactly: 921
// advanced calls and 3,267 KB 4.765 points = 921/200 + 3,267/1,024/20; 公路客運's
// 1,527 basic calls and 73,530 KB 1.497 = 1,527/1,500 + 73,530/1,024/150.)
const MB = 1024 * 1024;
export const tdxKind = path => (String(path).startsWith('basic/') ? 'b' : String(path).startsWith('maas/') ? 'm' : 'a');
const TDX_RATE = { b: 1 / TDX_POINTS.basic, a: 1 / TDX_POINTS.advanced, m: 1 / TDX_POINTS.advanced, vb: 1 / (TDX_POINTS.basicMB * MB), va: 1 / (TDX_POINTS.advancedMB * MB), vm: 1 / (TDX_POINTS.advancedMB * MB) };
// A TDX answer read: its text, its bytes, and how it travelled.
export async function tdxBody(res) {
  let text = '';
  let bytes = 0;
  try {
    if (typeof res.arrayBuffer === 'function') {
      const buf = await res.arrayBuffer();
      bytes = buf.byteLength;
      text = new TextDecoder().decode(buf);
    } else {
      text = String(await res.text());
      bytes = new TextEncoder().encode(text).length;
    }
  } catch {}
  const header = name => (typeof res.headers?.get === 'function' ? res.headers.get(name) || '' : '');
  return { text, bytes, zipped: /gzip|br|deflate/i.test(header('content-encoding')), sent: Number(header('content-length')) || 0 };
}
export async function tallyTdx(env, path, now = Date.now(), ctx = null, by = '', read = null) {
  const kind = tdxKind(path);
  const day = twDay(now);
  const adds = { [`tdx:${kind}:${day}`]: 1, [`tdx:v${kind}:${day}`]: read?.bytes || 0, [`tdx:gz:${day}`]: read?.zipped ? 1 : 0, [`tdx:z:${day}`]: read?.sent || 0, [`tdx:zn:${day}`]: read?.sent ? 1 : 0 };
  if (by) Object.assign(adds, { [`${by}:tdx:${kind}:${day}`]: 1, [`${by}:tdx:v${kind}:${day}`]: read?.bytes || 0 });
  await meterAdd(env, adds, now, ctx, true);
}
// Our own tools (the dev door: previews, screenshots, the layout check each
// push runs) yield TDX's month to people: a copy up to 10 minutes old
// answers them as it is (DEV_OLDEST; a live answer is kept that long), they
// never keep YouBike warm, and past DEV_TDX_DAY points a Taiwan day they get
// copies only (TDX_BUSY's cousin, DEV_TDX_CAP, where there's none). On
// 2026-11-06 they made six of every seven calls the meter counted.
export const DEV_TDX_DAY = 0.5;
export const DEV_OLDEST = 10 * MIN;
const DEV_TDX = /^dev:tdx:(v?[bam]):(\d{4}-\d{2}-\d{2})$/;
export async function devTdxRoom(env, now = Date.now()) {
  const day = twDay(now);
  let points = 0;
  for (const [k, n] of Object.entries(await usage(env, now))) {
    const m = DEV_TDX.exec(k);
    if (m && m[2] === day) points += n * TDX_RATE[m[1]];
  }
  return points < DEV_TDX_DAY;
}
// TDX's counts this Taiwan month, by kind and day. TDX's month starts at
// 00:00 on the 1st in Taiwan; the meter's (Google's, Pacific) 16 hours
// later, so the 1st's first 16 hours sit in last month's meter: read too
// (once a minute), or they dropped out of the month at 16:00 on the 1st.
const lastMeter = { month: '', stored: null, readAt: 0 };
const prevMonth = month => new Date(Date.UTC(+month.slice(0, 4), +month.slice(5, 7) - 2, 1)).toISOString().slice(0, 7);
const TDX_KEY = /^tdx:(v?[bam]|gz|zn?):(\d{4}-\d{2})-\d{2}$/;
// (`prefix` 'dev:', 'show:' or 'build:': ours alone, by the same keys without it.)
export async function tdxUse(env, now = Date.now(), prefix = '') {
  const month = twDay(now).slice(0, 7);
  const out = {};
  const take = from => {
    for (const [k, n] of Object.entries(from || {})) {
      if (!k.startsWith(prefix)) continue;
      const key = k.slice(prefix.length);
      if (TDX_KEY.exec(key)?.[2] === month) out[key] = (out[key] || 0) + n;
    }
  };
  take(await usage(env, now));
  if (billingMonth(now) === month) {
    const last = prevMonth(month);
    if (lastMeter.month !== last || now - lastMeter.readAt > MIN) Object.assign(lastMeter, { month: last, stored: (await kvJson(env, meterKey(last))) || {}, readAt: now });
    take(lastMeter.stored);
  }
  return out;
}
const METER_TABLE = 'CREATE TABLE IF NOT EXISTS meter (month TEXT NOT NULL, k TEXT NOT NULL, n REAL NOT NULL, PRIMARY KEY (month, k))';
const METER_ADD = "INSERT INTO meter (month, k, n) SELECT ?1, key, value FROM json_each(?2) WHERE type IN ('integer', 'real') ON CONFLICT (month, k) DO UPDATE SET n = n + excluded.n";
const meterReady = new WeakSet();
async function meterTable(env) {
  if (meterReady.has(env.STORE)) return;
  await env.STORE.prepare(METER_TABLE).run();
  meterReady.add(env.STORE);
}
export async function flushUse(env, now = Date.now()) {
  const pending = meter.pending;
  if (!Object.keys(pending).length) return;
  meter.pending = {};
  meter.flushedAt = now;
  const month = meter.month || billingMonth(now);
  if (env?.STORE) {
    try {
      await meterTable(env);
      const { results } = await env.STORE.prepare(`${METER_ADD} RETURNING k, n`).bind(month, JSON.stringify(pending)).all();
      // (Each count as D1 holds it now, everyone's adds in: this isolate's at
      // once, before the cron's copy reaches KV. KV's still read when due.)
      if (!meter.month || meter.month === month) {
        meter.month = month;
        meter.stored ||= {};
        for (const r of results || []) meter.stored[r.k] = Math.max(meter.stored[r.k] || 0, Number(r.n) || 0);
      }
    } catch {
      // (D1 failing: the counts wait for the next flush.)
      for (const [k, v] of Object.entries(pending)) meter.pending[k] = (meter.pending[k] || 0) + v;
    }
    return;
  }
  const key = meterKey(month);
  const fresh = (await kvJson(env, key)) || {};
  for (const [k, v] of Object.entries(pending)) fresh[k] = (fresh[k] || 0) + v;
  await kvPut(env, key, fresh, 62 * 86_400);
  meter.stored = fresh;
  meter.readAt = now;
}
// The cron's, each 2 minutes: KV's copy of the month (and of the month just
// ended, its last adds, for its first two hours) written from D1. A month
// first seen here gets KV's counts from before D1 kept them added in, once
// (`_seeded`, in the same transaction as the adds).
export async function mirrorMeter(env, now = Date.now()) {
  if (!env?.STORE || !env.RATE_LIMIT_KV) return { off: true };
  await meterTable(env);
  const out = {};
  for (const month of new Set([billingMonth(now), billingMonth(now - 2 * HOUR)])) {
    const seeded = await env.STORE.prepare("SELECT n FROM meter WHERE month = ?1 AND k = '_seeded'").bind(month).first();
    if (!seeded) {
      const old = (await kvJson(env, meterKey(month))) || {};
      await env.STORE.batch([
        env.STORE.prepare(METER_ADD.replace('WHERE', "WHERE NOT EXISTS (SELECT 1 FROM meter WHERE month = ?1 AND k = '_seeded') AND")).bind(month, JSON.stringify(old)),
        env.STORE.prepare("INSERT INTO meter (month, k, n) VALUES (?1, '_seeded', 1) ON CONFLICT (month, k) DO NOTHING").bind(month)
      ]);
      out.seeded = month;
    }
    const { results } = await env.STORE.prepare("SELECT k, n FROM meter WHERE month = ?1 AND k != '_seeded'").bind(month).all();
    const doc = Object.fromEntries((results || []).map(r => [r.k, Number(r.n) || 0]));
    await kvPut(env, meterKey(month), doc, 62 * 86_400);
    out[month] = Object.keys(doc).length;
  }
  // (Months past the last three gone.)
  await env.STORE.prepare('DELETE FROM meter WHERE month < ?1').bind(prevMonth(prevMonth(billingMonth(now)))).run();
  return out;
}

// ---- KV ------------------------------------------------------------------------------


// ---- TDX -----------------------------------------------------------------------------

// What may be asked through /transit/tdx, and how long an answer stays true.
// fresh: served as is; stale: served at once while refreshed behind (and when
// TDX fails). Anything else is refused.
export const TDX_RULES = [
  // Live: arrivals, bikes and docks, metro and train boards.
  { re: /^basic\/v2\/Bus\/EstimatedTimeOfArrival\/(City\/[A-Za-z]+(\/[^/]+)?|InterCity(\/[^/]+)?)$/, fresh: 25e3, stale: 60e3, tier: 'live' },
  { re: /^advanced\/v2\/Bus\/EstimatedTimeOfArrival\/(City\/[A-Za-z]+\/PassThrough\/Station\/[^/]+|InterCity\/PassThrough\/Station\/[^/]+|NearBy)$/, fresh: 25e3, stale: 60e3, tier: 'live' },
  // Where a route's buses are (A1 GPS, A2 at a stop): a bus whose estimates stopped (快捷8號, 2026-11-03);
  // a plan's routes in one ask, the city's with a filter of them (2026-11-06).
  { re: /^basic\/v2\/Bus\/(RealTimeByFrequency|RealTimeNearStop)\/(City\/[A-Za-z]+(\/[^/]+)?|InterCity(\/[^/]+)?)$/, fresh: 15e3, stale: 60e3, tier: 'live' },
  { re: /^basic\/v2\/Bike\/Availability\/City\/[A-Za-z]+$/, fresh: 50e3, stale: 3 * MIN, tier: 'live' },
  { re: /^advanced\/v2\/Bike\/Availability\/NearBy$/, fresh: 50e3, stale: 3 * MIN, tier: 'live' },
  { re: /^basic\/v2\/Rail\/Metro\/LiveBoard\/[A-Z]+$/, fresh: 20e3, stale: 60e3, tier: 'live' },
  { re: /^basic\/v3\/Rail\/TRA\/(StationLiveBoard(\/Station\/\d+)?|TrainLiveBoard(\/TrainNo\/\w+)?)$/, fresh: 50e3, stale: 3 * MIN, tier: 'live' },
  // Operators' notices: a bus route, a metro line or trains stopped or
  // changed (typhoons, works). Posted hours ahead, never by the minute: read
  // again each 10 minutes, not at the live speed (as 'live' they were read
  // again at each phone's ask past 10 s: six a city, a third of what an open
  // map asked TDX; 2026-11-06). The phone asks each 3 (Transit service.mjs
  // NOTICE_FRESH): what's here answers.
  { re: /^basic\/v3\/Rail\/TRA\/Alert$/, fresh: 10 * MIN, stale: 30 * MIN, tier: 'notice' },
  { re: /^basic\/v2\/Rail\/THSR\/AlertInfo$/, fresh: 10 * MIN, stale: 30 * MIN, tier: 'notice' },
  { re: /^basic\/v2\/Bus\/(Alert|News)\/(City\/[A-Za-z]+|InterCity)$/, fresh: 10 * MIN, stale: 30 * MIN, tier: 'notice' },
  { re: /^basic\/v2\/Rail\/Metro\/(Alert|News)\/[A-Z]+$/, fresh: 10 * MIN, stale: 30 * MIN, tier: 'notice' },
  // Timetables: a day's trains, a metro station's departures.
  { re: /^basic\/v3\/Rail\/TRA\/DailyTrainTimetable\/(TrainDate\/\d{4}-\d{2}-\d{2}|OD\/\d+\/to\/\d+\/\d{4}-\d{2}-\d{2})$/, fresh: 6 * HOUR, stale: DAY, tier: 'timetable' },
  { re: /^basic\/v2\/Rail\/THSR\/DailyTimetable\/(TrainDate\/\d{4}-\d{2}-\d{2}|OD\/\d+\/to\/\d+\/\d{4}-\d{2}-\d{2})$/, fresh: 6 * HOUR, stale: DAY, tier: 'timetable' },
  { re: /^basic\/v2\/Rail\/Metro\/(StationTimeTable|Frequency|S2STravelTime)\/[A-Z]+$/, fresh: DAY, stale: 7 * DAY, tier: 'timetable' },
  // A bus route's timetable (departures from its first stop, or its headways); or a whole city's (the bus builder's, builders/buses.js).
  { re: /^basic\/v2\/Bus\/Schedule\/(City\/[A-Za-z]+(\/[^/]+)?|InterCity(\/[^/]+)?)$/, fresh: 6 * HOUR, stale: 7 * DAY, tier: 'timetable' },
  // What changes rarely: routes, stops, stations, lines, fares.
  { re: /^basic\/v2\/Bus\/(Route|StopOfRoute)\/(City\/[A-Za-z]+(\/[^/]+)?|InterCity(\/[^/]+)?)$/, fresh: DAY, stale: 7 * DAY, tier: 'static' },
  // The lines' shapes, buses' and rails' (the bus builder's shape packs).
  { re: /^basic\/v2\/Bus\/Shape\/(City\/[A-Za-z]+(\/[^/]+)?|InterCity(\/[^/]+)?)$/, fresh: DAY, stale: 7 * DAY, tier: 'static' },
  { re: /^basic\/v2\/Rail\/((TRA|THSR)\/Shape|Metro\/Shape\/[A-Z]+)$/, fresh: DAY, stale: 7 * DAY, tier: 'static' },
  { re: /^advanced\/v2\/Bus\/(Station|Stop|Route)\/NearBy$/, fresh: DAY, stale: 7 * DAY, tier: 'static' },
  { re: /^advanced\/v2\/Bus\/(Route|StopOfRoute)\/(City\/[A-Za-z]+|InterCity)\/PassThrough\/Station\/[^/]+$/, fresh: DAY, stale: 7 * DAY, tier: 'static' },
  { re: /^basic\/v2\/Bike\/Station\/City\/[A-Za-z]+$/, fresh: DAY, stale: 7 * DAY, tier: 'static' },
  { re: /^advanced\/v2\/Bike\/Station\/NearBy$/, fresh: DAY, stale: 7 * DAY, tier: 'static' },
  { re: /^basic\/v2\/Rail\/Metro\/(Line|Station|StationOfLine|LineTransfer|StationTransfer|Route|StationOfRoute|StationExit)\/[A-Z]+$/, fresh: DAY, stale: 7 * DAY, tier: 'static' },
  { re: /^advanced\/v2\/Rail\/Metro\/Station\/NearBy$/, fresh: DAY, stale: 7 * DAY, tier: 'static' },
  { re: /^basic\/v3\/Rail\/TRA\/(Station|Line|StationOfLine|LineTransfer|StationTransfer|TrainType|ODFare\/\d+\/to\/\d+)$/, fresh: DAY, stale: 7 * DAY, tier: 'static' },
  { re: /^basic\/v2\/Rail\/THSR\/(Station|StationOfLine|ODFare\/\d+\/to\/\d+)$/, fresh: DAY, stale: 7 * DAY, tier: 'static' }
];
const TDX_QUERY = new Set(['$select', '$filter', '$top', '$skip', '$orderby', '$spatialFilter']);

// "basic/v2/Bus/Route/City/Hsinchu?$select=…" → { path, query, rule } or null.
export function tdxRequest(raw) {
  if (typeof raw !== 'string' || raw.length > 1500) return null;
  const [pathPart, queryPart = ''] = raw.replace(/^\/+/, '').split('?');
  let path;
  try {
    const parts = pathPart.split('/').map(s => decodeURIComponent(s));
    // (No "." or ".." segment: the address would be read a level up, past the allowlist.)
    if (parts.some(s => s === '.' || s === '..')) return null;
    path = parts.map(s => encodeURIComponent(s)).join('/');
  } catch {
    return null;
  }
  const rule = TDX_RULES.find(r => r.re.test(decodeURIComponent(path)));
  if (!rule) return null;
  const q = new URLSearchParams(queryPart);
  const out = [];
  for (const [k, v] of [...q].sort(([a], [b]) => (a < b ? -1 : 1))) {
    if (!TDX_QUERY.has(k)) return null;
    if (k === '$spatialFilter' && !/^nearby\(\s*-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?\s*,\s*\d{1,4}\s*\)$/.test(v)) return null;
    if (k === '$top' && !/^\d{1,5}$/.test(v)) return null;
    // OData's own spelling: `$` kept, spaces as %20.
    out.push(`${k}=${encodeURIComponent(v)}`);
  }
  out.push('$format=JSON');
  return { path, query: out.join('&'), rule };
}

// ---- A day's trains, as the phone reads them ------------------------------------------

// A whole day's timetable (台鐵's: 4.4 MB, 900 trains; 高鐵's) keeps only
// what Orbit Transit reads (its lib/rail.mjs traTrips and hsrTrips): each
// train's number, type, headsign, line, note and bike flag, each stop's
// station and times, names in Chinese and English. Stations' names, flags
// and other languages go (台鐵's day 4.1 MB to 1.6 MB, 237 KB to 143 KB
// sent), and so does a train 台鐵 says won't run (the phone drops it). Kept
// so, in the cache too. (A new field read there is added here; Transit's
// tests/rail-trim.test.mjs reads a real day both ways.)
const DAY_TRA = /^basic\/v3\/Rail\/TRA\/DailyTrainTimetable\/TrainDate\//;
const DAY_HSR = /^basic\/v2\/Rail\/THSR\/DailyTimetable\/TrainDate\//;
const TRA_INFO = ['TrainNo', 'TrainDate', 'TrainTypeCode', 'TrainTypeName', 'TripHeadSign', 'EndingStationName', 'TripLine', 'Note', 'BikeFlag'];
const HSR_INFO = ['TrainNo', 'EndingStationName', 'Note'];
const named = v => (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(['Zh_tw', 'En'].filter(k => v[k] != null).map(k => [k, v[k]])) : v);
const pick = (o, keys) => Object.fromEntries(keys.filter(k => o?.[k] !== undefined).map(k => [k, named(o[k])]));
const stopOf = s => ({ ...pick(s, ['StationID', 'ArrivalTime', 'DepartureTime']), ...(s?.SuspendedFlag === 1 ? { SuspendedFlag: 1 } : {}) });
export function tdxTrim(path, text) {
  const tra = DAY_TRA.test(path);
  if (!tra && !DAY_HSR.test(path)) return text;
  let j;
  try {
    j = JSON.parse(text);
  } catch {
    return text;
  }
  if (tra && Array.isArray(j?.TrainTimetables)) {
    const trains = j.TrainTimetables.filter(t => t?.TrainInfo && t.TrainInfo.SuspendedFlag !== 1);
    return JSON.stringify({ TrainDate: j.TrainDate, TrainTimetables: trains.map(t => ({ TrainInfo: pick(t.TrainInfo, TRA_INFO), StopTimes: (t.StopTimes || []).map(stopOf) })) });
  }
  if (!tra && Array.isArray(j)) return JSON.stringify(j.map(t => ({ TrainDate: t?.TrainDate, DailyTrainInfo: pick(t?.DailyTrainInfo || {}, HSR_INFO), StopTimes: (t?.StopTimes || []).map(stopOf) })));
  return text;
}

// ---- Which buses are on the road ------------------------------------------------------

// A city's estimates (TDX N1, every stop of every route) → { RouteUID: n }:
// how many of its stops have a bus coming now (0: none on the road), -1 when
// TDX says 今日未營運 at every stop.
export function runningOf(rows) {
  const out = {};
  const off = {};
  for (const r of Array.isArray(rows) ? rows : []) {
    const uid = r?.RouteUID;
    if (!uid) continue;
    out[uid] ??= 0;
    off[uid] ??= true;
    const st = Number(r.StopStatus) || 0;
    if (st === 0 && r.EstimateTime != null) out[uid]++;
    if (st !== 4) off[uid] = false;
  }
  for (const uid of Object.keys(out)) if (!out[uid] && off[uid]) out[uid] = -1;
  return out;
}
// A city's buses on the road (TDX A1, each bus's place) → { RouteUID: buses }.
export function runningOfGps(rows) {
  const out = {};
  for (const r of Array.isArray(rows) ? rows : []) if (r?.RouteUID) out[r.RouteUID] = (out[r.RouteUID] || 0) + 1;
  return out;
}
const RUN_CITY = /^(InterCity|[A-Z][A-Za-z]+)$/;
const runMemo = new Map();
// GET /transit/running?city=: { at, routes, total }, which of a city's routes
// have buses on the road, to tell a route that isn't running (a typhoon, most
// of 新竹's buses on 2026-10-23) from one between its buses: a phone reads
// this (a few KB) instead of the city's whole answer. It changes in hours,
// not seconds: read again each 10 minutes at most, from the city's buses'
// places (TDX A1: 新竹市's 23 KB, 台北's 425 KB, 公路客運's 725 KB; the same
// read as /transit/gps's), `total` its routes (the weekly packs' index), the
// share on the road out of. Until 2026-11-06 it was every stop's estimate,
// read each minute: 公路客運's 14.7 MB a read (TDX bills what it sends: a
// tenth of a point each), a city's up to 8 MB. A busy city's whole estimates
// here, when young: from them (every route, TDX's 今日未營運 too).
const RUN_FRESH = 10 * MIN;
const runKey = city => new Request(`https://transit-cache.orbit/running/${city}`);
const routesKept = { at: 0, cities: null };
async function routesOf(env, city, now) {
  if (!env?.DATA) return null;
  if (!routesKept.cities || now - routesKept.at > 6 * HOUR) {
    try {
      const obj = await env.DATA.get('index.json');
      routesKept.cities = obj ? (await obj.json())?.cities || {} : {};
    } catch {
      routesKept.cities ||= {};
    }
    routesKept.at = now;
  }
  return Number(routesKept.cities[city]?.routes) || null;
}
export async function running(env, city, deps = {}) {
  if (!RUN_CITY.test(city)) return { status: 400, body: { code: 'BAD_CITY' } };
  const now = deps.now ?? Date.now();
  const cache = deps.cache === undefined ? globalThis.caches?.default : deps.cache;
  let kept = runMemo.get(city);
  if (kept && now - kept.at < RUN_FRESH) return { status: 200, body: kept };
  try {
    const hit = cache ? await cache.match(runKey(city)) : null;
    const shared = hit ? await hit.json() : null;
    if (shared?.routes && (!kept || shared.at > kept.at)) runMemo.set(city, (kept = shared));
    if (kept && now - kept.at < RUN_FRESH) return { status: 200, body: kept };
  } catch {}
  const share = body => {
    runMemo.set(city, body);
    if (!cache) return;
    const put = cache.put(runKey(city), new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${Math.ceil(RUN_FRESH / 1000)}` } })).catch(() => {});
    if (deps.ctx?.waitUntil) deps.ctx.waitUntil(put);
  };
  const total = await routesOf(env, city, now);
  // A busy city's whole copy here, when young: from it.
  const idx = etaIndex.get(city);
  if (idx && now - idx.at < (await freshOf(TDX_RULES[0], null))) {
    const body = { at: idx.at, routes: (idx.running ||= runningOf(idx.rows)), ...(total ? { total } : {}) };
    share(body);
    return { status: 200, body };
  }
  // Else its buses' places: a copy up to 10 minutes old as it is.
  const path = city === 'InterCity' ? `basic/v2/Bus/RealTimeByFrequency/InterCity?$select=${GPS_SELECT}` : cityGpsPath(city);
  const got = await tdxGet(env, path, { ...deps, oldest: RUN_FRESH });
  let rows = null;
  try {
    rows = got.status === 200 && got.body != null ? JSON.parse(got.body) : null;
  } catch {}
  if (!Array.isArray(rows)) return kept ? { status: 200, body: kept } : { status: got.status || 502, body: { code: 'TDX_FAILED' } };
  const body = { at: now - (got.age || 0), routes: runningOfGps(rows), ...(total ? { total } : {}), by: 'gps' };
  share(body);
  return { status: 200, body };
}

// ---- A city's buses due, one TDX call for every stop -------------------------------------
//
// Every stop's estimates in a city (TDX N1, the whole city at once: 33,000
// rows, 9 MB, for 新北) kept and refreshed as any TDX answer (fresh at the
// live speed, served at once and refreshed behind for a minute), read once an
// isolate a copy, and each ask answered with its own stops' rows (or one
// route's). A trip asked TDX ten to forty times a city, a stop list each,
// every call queued at 4 a second: 2–6 s of a plan's wait (2026-10-30).
// Kept a little longer than one stop's (2 minutes at once, refreshed behind):
// each row says when it was estimated, and the phone counts from then.
// 公路客運 (InterCity, all Taiwan: 60,000 rows) is asked by its stops instead.
// A city's whole list is read only when it costs less than the reads it
// replaces: TDX bills each read's bytes besides the call (a point per 150 MB
// and per 1,500 calls), and the whole list is 334 bytes a row as TDX sends it
// (新竹市's 1,766 rows 590 KB, 新竹縣's 3,078 1 MB, 2026-11-06), a stop list's
// own read a call and a few KB. So the whole is read once 1 + KB/100 stop
// lists (or a plan's routes) are asked here within a minute (wholeAt,
// SPREAD_MS; 苗栗 2, 新竹市 7, 新竹縣 12): one TDX read each time the city's
// estimates change, for every stop and phone in it, a crowd at its own stops
// (a school's students before and after class). Below that each list is its
// own filtered read, kept at the edge; a big city (台北, 新北: 30,000 rows,
// 10 MB) always (until 2026-11-06 two lists in a small city, twenty asks in
// a big one, read the whole: each a few hundred stop lists' worth of points).
export const ETA_SELECT = 'StopUID,RouteUID,RouteName,Direction,EstimateTime,StopStatus,NextBusTime,PlateNumb,IsLastBus,Estimates,StopCountDown,DataTime';
const ETA_STALE = 2 * MIN;
export const cityEtaPath = city => `basic/v2/Bus/EstimatedTimeOfArrival/${city === 'InterCity' ? 'InterCity' : `City/${city}`}?$select=${ETA_SELECT}&$top=60000`;
const etaIndex = new Map(); // city → { at, rows, stops: Map(uid → rows), routes: Map(uid → rows), running }
export const resetEta = () => (etaIndex.clear(), runMemo.clear(), etaLists.clear(), etaBytes.clear(), Object.assign(routesKept, { at: 0, cities: null }));
// (Measured 2026-11-06, each city's whole list in rows: 桃園 29,006, 台中
// 37,444, 高雄 19,281; 台北's and 新北's past 30,000.)
export const ETA_ROWS = { Keelung: 6955, Hsinchu: 1766, HsinchuCounty: 3078, MiaoliCounty: 132, ChanghuaCounty: 1030, NantouCounty: 807, YunlinCounty: 518, ChiayiCounty: 1698, Chiayi: 633, PingtungCounty: 5464, YilanCounty: 6394, HualienCounty: 516, TaitungCounty: 126, KinmenCounty: 4762, PenghuCounty: 8709, LienchiangCounty: 1081, Tainan: 9065 };
const etaBytes = new Map(); // city → its whole list's bytes, as last read here
export const wholeAt = city => {
  const bytes = etaBytes.get(city) ?? (ETA_ROWS[city] ? ETA_ROWS[city] * 334 : Infinity);
  return Math.ceil(1 + bytes / 100_000);
};
const SPREAD_MS = 60_000;
const etaLists = new Map(); // city → Map(a stop list or routes asked → when, ms)
function spreadCity(city, list, now) {
  const need = wholeAt(city);
  if (need > 20) return false;
  const seen = etaLists.get(city) || new Map();
  etaLists.set(city, seen);
  seen.delete(list);
  seen.set(list, now);
  for (const [k, t] of seen) if (now - t >= SPREAD_MS) seen.delete(k);
  while (seen.size > 20) seen.delete(seen.keys().next().value);
  return seen.size >= need;
}
function indexEta(rows, at) {
  const stops = new Map();
  const routes = new Map();
  for (const r of rows) {
    if (!r?.StopUID) continue;
    if (!stops.has(r.StopUID)) stops.set(r.StopUID, []);
    stops.get(r.StopUID).push(r);
    if (!routes.has(r.RouteUID)) routes.set(r.RouteUID, []);
    routes.get(r.RouteUID).push(r);
  }
  return { at, rows, stops, routes, running: null };
}
// → { idx } or { status } when there's no copy at all. `young` (the phone's
// copy that old, less a moment): a copy here no newer is read again now.
export async function cityEta(env, city, deps = {}) {
  const now = deps.now ?? Date.now();
  const idx = etaIndex.get(city);
  // (This isolate's copy while it's fresh: the 9 MB never read again for each ask.)
  if (idx && now - idx.at < Math.min(await freshOf(TDX_RULES[0], null), deps.young ?? Infinity)) return { idx, age: now - idx.at };
  const got = await tdxGet(env, cityEtaPath(city), { ...deps, stale: deps.young != null ? 0 : ETA_STALE });
  if (got.status !== 200 || got.body == null) return idx ? { idx, age: now - idx.at } : { status: got.status || 502 };
  const at = now - (got.age || 0);
  if (idx?.at === at) return { idx, age: got.age || 0 };
  let rows;
  try {
    rows = JSON.parse(got.body);
  } catch {
    return idx ? { idx, age: now - idx.at } : { status: 502 };
  }
  if (!Array.isArray(rows)) return idx ? { idx, age: now - idx.at } : { status: 502 };
  etaBytes.set(city, got.body.length);
  const next = indexEta(rows, at);
  etaIndex.delete(city);
  etaIndex.set(city, next);
  // (A few cities at a time in memory: the oldest asked goes.)
  while (etaIndex.size > 3) etaIndex.delete(etaIndex.keys().next().value);
  return { idx: next, age: got.age || 0 };
}
// GET /transit/eta?city=<TDX city | InterCity>&stops=<StopUID,…> (or
// &route=<RouteUID>, or &routes=<RouteUID,…>: a plan's buses in one ask, not
// one a route): the rows of those stops (or routes), as TDX's own filtered ask
// would answer.
const UID = /^[A-Z]{3}[0-9A-Za-z_-]{1,24}$/;
export async function etaRows(env, q, deps = {}) {
  const city = q.get('city') || '';
  if (!RUN_CITY.test(city)) return { status: 400, body: { code: 'BAD_CITY' } };
  const stops = (q.get('stops') || '').split(',').filter(u => UID.test(u)).slice(0, 400);
  const routes = [...new Set([q.get('route') || '', ...(q.get('routes') || '').split(',')].filter(u => UID.test(u)))].slice(0, 40);
  if (!stops.length && !routes.length) return { status: 400, body: { code: 'BAD_STOPS' } };
  // (`had=<s>`: the phone's copy is that many seconds old, so a copy here no
  // newer is no use to it: TDX is read then (given 3 s, then the copy as
  // before), not that copy answered with a read behind it. A phone asking
  // alone saw each estimate a beat late, and one that asks only when a new
  // one can be there (Transit api.mjs busEta) would have seen it a step
  // late. A newer copy, another phone's read, answers as it is.)
  const had = Number(q.get('had')) || 0;
  const mine = had > 0 ? Math.max(0, had * 1000 - 1500) : null;
  const filtered = mine != null ? { ...deps, stale: 0, young: mine } : deps;
  const now = deps.now ?? Date.now();
  if (city === 'InterCity') {
    // (Its stops asked together with every other stop asked here this minute: the same reads for every phone.)
    const groups = stops.length ? await together('eta', stops, 40, deps, now) : null;
    if (groups) {
      const all = await Promise.all(groups.map(g => etaAsked(env, city, g, [], filtered)));
      if (all.every(g => g.status === 200)) {
        const want = new Set(stops);
        return { status: 200, body: all.flatMap(g => g.body).filter(r => want.has(r?.StopUID)), age: Math.max(...all.map(g => g.age || 0)) };
      }
    }
    return etaAsked(env, city, stops, routes, filtered);
  }
  const pick = got => ({ status: 200, body: stops.length ? stops.flatMap(u => got.idx.stops.get(u) || []) : routes.flatMap(u => got.idx.routes.get(u) || []), age: got.age });
  // (Every list counted, the busy and the answered-from-a-copy too: a minute's spread.)
  const spread = spreadCity(city, stops.length ? stops.join(',') : `r:${routes.join(',')}`, now);
  const idx = etaIndex.get(city);
  if (idx && now - idx.at < Math.min(await freshOf(TDX_RULES[0], null), mine ?? Infinity)) return pick({ idx, age: now - idx.at });
  if (!spread) {
    // (A quiet city here: these stops' own read; the copy here, if young enough, when TDX fails.)
    const own = await etaAsked(env, city, stops, routes, filtered);
    return own.status !== 200 && idx && now - idx.at < ETA_STALE ? pick({ idx, age: now - idx.at }) : own;
  }
  const whole = cityEta(env, city, mine != null ? { ...deps, young: mine } : deps);
  if (idx && now - idx.at < ETA_STALE) {
    const got = await whole;
    return got.idx ? pick(got) : { status: 502, body: { code: 'TDX_FAILED' } };
  }
  // No copy young enough here (the city's first ask in a while): these stops'
  // own ask beside the city's, whichever answers first; the city's goes on
  // for the next ask (a stop's card waited 3 s for a whole city it needed 10 rows of).
  const own = etaAsked(env, city, stops, routes, filtered);
  const young = got => got.idx && now - got.idx.at < ETA_STALE;
  const first = await Promise.any([whole.then(g => (young(g) ? pick(g) : Promise.reject())), own.then(g => (g.status === 200 ? g : Promise.reject()))]).catch(() => null);
  if (deps.ctx?.waitUntil) deps.ctx.waitUntil(whole.catch(() => {}));
  if (first) return first;
  const got = await whole.catch(() => ({}));
  return got.idx ? pick(got) : own;
}
// Those stops' (or routes') own ask of TDX, 40 a call (TDX_RULES' 1,500 characters).
async function etaAsked(env, city, stops, routes, deps) {
  const scope = city === 'InterCity' ? 'InterCity' : `City/${city}`;
  const [field, uids] = stops.length ? ['StopUID', stops] : ['RouteUID', routes];
  const parts = [];
  for (let i = 0; i < uids.length; i += 40) parts.push(uids.slice(i, i + 40).map(u => `${field} eq '${u}'`).join(' or '));
  const all = await Promise.all(parts.map(f => tdxGet(env, `basic/v2/Bus/EstimatedTimeOfArrival/${scope}?$filter=${f}&$select=${ETA_SELECT}`, deps)));
  if (all.some(g => g.status !== 200 || g.body == null)) {
    const busy = all.some(g => g.status === 429);
    return { status: busy ? 429 : 502, body: { code: busy ? 'TDX_BUSY' : 'TDX_FAILED' } };
  }
  try {
    return { status: 200, body: all.flatMap(g => JSON.parse(g.body)), age: Math.max(...all.map(g => g.age || 0)) };
  } catch {
    return { status: 502, body: { code: 'TDX_FAILED' } };
  }
}

// ---- 公路客運's asks together ------------------------------------------------------------
//
// 公路客運 (InterCity: all Taiwan, 60,000 estimates, 24 MB; 1,848 buses) is
// never read whole, so each stop card was its own read of its stops' times
// (each 30 s) and its lagging routes' places (each 20 s): a crowd at its own
// stops as many reads (竹東's: 13 of the 17 buses within 4 km were
// 公路客運's, 2026-11-06). The stops (routes) this colo was asked within
// SPREAD_MS are kept at the edge, one small list each (`kind`), split into
// groups by a hash of each id (2, 4, 8… as the list grows, about `per`
// each), and an ask reads the whole groups its ids are in, each in one
// order: every phone and isolate here asks TDX the same few reads, and a
// stop coming or going changes only its own group's. Nothing else asked
// here: null (its own read, as before).
const TOGETHER = kind => new Request(`https://transit-cache.orbit/together/${kind}`);
const TOGETHER_BEAT = 20_000; // (an id's time written again at most this often: fewer writes)
const TOGETHER_MAX = 2000;
const fnv = s => {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
  return h;
};
export async function together(kind, ids, per, deps = {}, now = Date.now()) {
  const cache = deps.cache === undefined ? globalThis.caches?.default : deps.cache;
  const mine = [...new Set(ids)];
  if (!cache || !mine.length) return null;
  let seen = {};
  try {
    const hit = await cache.match(TOGETHER(kind));
    const got = hit ? await hit.json() : null;
    if (got && typeof got === 'object' && !Array.isArray(got)) seen = got;
  } catch {}
  let changed = false;
  for (const [id, t] of Object.entries(seen)) {
    if (now - t < SPREAD_MS && UID.test(id)) continue;
    delete seen[id];
    changed = true;
  }
  for (const id of mine) {
    if (now - (seen[id] ?? -Infinity) < TOGETHER_BEAT) continue;
    seen[id] = now;
    changed = true;
  }
  let all = Object.keys(seen);
  if (all.length > TOGETHER_MAX) {
    for (const id of all.sort((a, b) => seen[a] - seen[b]).slice(0, all.length - TOGETHER_MAX)) delete seen[id];
    all = Object.keys(seen);
  }
  if (changed) {
    const put = cache.put(TOGETHER(kind), new Response(JSON.stringify(seen), { headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${Math.ceil((2 * SPREAD_MS) / 1000)}` } })).catch(() => {});
    if (deps.ctx?.waitUntil) deps.ctx.waitUntil(put);
    else await put;
  }
  if (all.length <= mine.length) return null;
  const n = all.length <= per ? 1 : 2 ** Math.ceil(Math.log2(all.length / (per * 0.75)));
  const want = new Set(mine.map(id => fnv(id) % n));
  const groups = new Map();
  for (const id of all.sort()) {
    const g = fnv(id) % n;
    if (!want.has(g)) continue;
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(id);
  }
  return [...groups.values()];
}

// ---- Where routes' buses are, one TDX read a city -----------------------------------------
//
// GET /transit/gps?city=<TDX city | InterCity>&routes=<RouteUID,…>[&had=<s>]:
// those routes' buses' places (TDX RealTimeByFrequency, A1: each bus's GPS,
// sent each 20 s), as TDX's read filtered by them would answer. A city's
// whole list is one small read (新竹市's 61 buses, 23 KB; 新竹縣's 37,
// 14 KB; 2026-11-06), so every route and every phone in the city shares it:
// each stop card asked its own lagging routes, a TDX read a stop each 20 s,
// a crowd at different stops as many. 公路客運's (InterCity: all Taiwan,
// 1,848 buses, 714 KB) by its routes, asked together with the other routes
// asked here (together()). `had=`: as /transit/eta's.
export const GPS_SELECT = 'RouteUID,PlateNumb,Direction,BusPosition,GPSTime';
export const cityGpsPath = city => `basic/v2/Bus/RealTimeByFrequency/City/${city}?$select=${GPS_SELECT}`;
export async function gpsRows(env, q, deps = {}) {
  const city = q.get('city') || '';
  if (!RUN_CITY.test(city)) return { status: 400, body: { code: 'BAD_CITY' } };
  const routes = [...new Set((q.get('routes') || '').split(',').filter(u => UID.test(u)))].slice(0, 20);
  if (!routes.length) return { status: 400, body: { code: 'BAD_ROUTES' } };
  const had = Number(q.get('had')) || 0;
  const d = had > 0 ? { ...deps, stale: 0, young: Math.max(0, had * 1000 - 1500) } : deps;
  // (公路客運's routes asked together with every other route asked here this minute: the same reads for every phone.)
  const icity = city === 'InterCity' ? ((await together('gps', routes, 20, deps, deps.now ?? Date.now())) || [routes]).flatMap(g => Array.from({ length: Math.ceil(g.length / 40) }, (_, i) => g.slice(i * 40, i * 40 + 40))) : null;
  const paths = icity ? icity.map(g => `basic/v2/Bus/RealTimeByFrequency/InterCity?$filter=${g.map(u => `RouteUID eq '${u}'`).join(' or ')}&$select=${GPS_SELECT}`) : [cityGpsPath(city)];
  const gots = await Promise.all(paths.map(p => tdxGet(env, p, d)));
  const bad = gots.find(g => g.status !== 200 || g.body == null);
  if (bad) return { status: bad.status === 429 ? 429 : 502, body: { code: bad.status === 429 ? 'TDX_BUSY' : 'TDX_FAILED' } };
  const rows = [];
  try {
    for (const g of gots) {
      const list = JSON.parse(g.body);
      if (!Array.isArray(list)) throw new Error('not a list');
      rows.push(...list);
    }
  } catch {
    return { status: 502, body: { code: 'TDX_FAILED' } };
  }
  // (Only what the phone reads: TDX sends each bus's speed, heading, statuses and times too, ~390 bytes a bus.)
  const want = new Set(routes);
  const slim = r => ({ RouteUID: r.RouteUID, PlateNumb: r.PlateNumb, Direction: r.Direction, BusPosition: r.BusPosition ? { PositionLat: r.BusPosition.PositionLat, PositionLon: r.BusPosition.PositionLon } : null, GPSTime: r.GPSTime });
  return { status: 200, body: rows.filter(r => want.has(r?.RouteUID)).map(slim), age: Math.max(...gots.map(g => g.age || 0)), state: gots[0].state };
}

// The access token (a day long): kept in memory and KV, asked for again an
// hour before it ends.
let tdxToken = null;
export const resetTdxToken = () => (tdxToken = null);
export async function tdxAccess(env, fetchFn = fetch, now = Date.now()) {
  if (!env.TDX_CLIENT_ID || !env.TDX_CLIENT_SECRET) return null;
  if (tdxToken && tdxToken.exp - HOUR > now) return tdxToken.token;
  const kept = await kvJson(env, 'transit:tdx:token');
  if (kept?.token && kept.exp - HOUR > now) return (tdxToken = kept).token;
  const res = await fetchFn(TDX_AUTH, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: env.TDX_CLIENT_ID, client_secret: env.TDX_CLIENT_SECRET }).toString(),
    signal: timeout(10_000)
  });
  if (!res.ok) throw Object.assign(new Error(`TDX auth ${res.status}`), { status: res.status });
  const j = await res.json();
  if (!j.access_token) throw new Error('TDX auth: no token');
  tdxToken = { token: j.access_token, exp: now + (Number(j.expires_in) || 86_400) * 1000 };
  await kvPut(env, 'transit:tdx:token', tdxToken, Math.floor((tdxToken.exp - now) / 1000));
  return tdxToken.token;
}

// TDX's own limit is per key a minute (the free plan 5, 銅級 300): this
// isolate keeps under TDX_PER_MIN, and backs off for 30 s after a 429.
const pace = { minute: 0, n: 0, until: 0 };
export const resetPace = () => Object.assign(pace, { minute: 0, n: 0, until: 0 });
function paced(env, now) {
  if (now < pace.until) return false;
  const minute = Math.floor(now / MIN);
  if (pace.minute !== minute) Object.assign(pace, { minute, n: 0 });
  const limit = Number(env.TDX_PER_MIN) || 5;
  if (pace.n >= limit) return false;
  pace.n++;
  return true;
}

// TDX's paid plans count calls a second (5 on 銅級; past it: 429 "API rate
// limit exceeded"), and an app opening fires twenty at once. With
// TDX_PER_SEC set, calls here wait their turn, spaced evenly, instead of
// failing; a turn more than 8 s away is "busy".
const turn = { next: 0 };
export const resetTurns = () => (turn.next = 0);
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function myTurn(env) {
  const perSec = Number(env.TDX_PER_SEC) || 0;
  if (!perSec) return true;
  const t = Date.now();
  const at = Math.max(t, turn.next);
  if (at - t > 8000) return false;
  turn.next = at + Math.ceil(1000 / perSec);
  if (at > t) await sleep(at - t);
  return true;
}

// The developer settings (the admin panel's 開發): how long a live answer is
// fresh here. GET /config's copy in this colo's cache, looked at once a
// minute; none there (no app has asked lately), the defaults.
const devT = { at: 0, v: cleanDev() };
async function devNow() {
  if (Date.now() - devT.at < 60_000) return devT.v;
  devT.at = Date.now();
  try {
    const hit = await globalThis.caches?.default?.match(new Request('https://orbit-config.orbit/dev'));
    if (hit) devT.v = cleanDev(await hit.json());
  } catch {}
  return devT.v;
}
// TDX's own numbers (its 會員中心, the owner's page, 2026-11-06) for the days
// the meter counted short (calls lost, bytes not counted): those days are
// TDX's, not the meter's, in the month's points (the guard, 容量).
export const TDX_BOOK = {
  '2026-11-01': { calls: 3953, kb: 218826, points: 5.658 },
  '2026-11-02': { calls: 931, kb: 32696, points: 1.402 },
  '2026-11-03': { calls: 16810, kb: 650334, points: 20.009 },
  '2026-11-04': { calls: 4385, kb: 169494, points: 5.353 },
  '2026-11-05': { calls: 8010, kb: 432885, points: 8.649 }
};
// TDX's month in points (TDX_POINTS) from the counts: each day's calls by
// kind and the bytes they brought (a day in TDX_BOOK: TDX's own).
export function tdxPoints(used, now = Date.now(), book = TDX_BOOK) {
  const today = twDay(now);
  // (TDX's month is Taiwan's: a day of another month in `used` never counts in this one.)
  const thisMonth = today.slice(0, 7);
  let month = 0, todayPts = 0;
  for (const [k, n] of Object.entries(used || {})) {
    const m = /^tdx:(v?[bam]):(\d{4}-\d{2}-\d{2})$/.exec(k);
    if (!m || !m[2].startsWith(thisMonth) || book[m[2]]) continue;
    const p = n * TDX_RATE[m[1]];
    month += p;
    if (m[2] === today) todayPts += p;
  }
  for (const [day, b] of Object.entries(book || {})) {
    if (!day.startsWith(thisMonth) || day > today) continue;
    month += b.points;
    if (day === today) todayPts += b.points;
  }
  return { month, today: todayPts };
}
// The guard (the owner navigates by it: the month's 200 points must last,
// and a day it's needed must never be cut short): nothing at all while what
// would be left can still carry the rest of the month at the owner's own
// pace (the days so far, a point a day at least; a day not used leaves more
// for the rest). Only a day eating into that keeps live TDX longer: 2x when
// up to 10% short of it, 4x to 25%, 8x past; the month's last 5% of points:
// an advanced answer every 5 minutes at most (30x), basic ones 3x. Slower,
// never off.
export function tdxGuard({ month, today }, now = Date.now()) {
  const tw = new Date(now + 8 * HOUR);
  const day = tw.getUTCDate();
  const monthDays = new Date(Date.UTC(tw.getUTCFullYear(), tw.getUTCMonth() + 1, 0)).getUTCDate();
  const left = TDX_POINTS.month - month;
  if (left <= TDX_POINTS.month * 0.05) return { advanced: 30, basic: 3, why: 'month' };
  const pace = Math.max(1, day > 1 ? (month - today) / (day - 1) : 0);
  const need = pace * (monthDays - day);
  const room = left - need;
  if (room >= 0) return { advanced: 1, basic: 1, why: '', room, pace };
  const short = -room / Math.max(need, 1);
  return { advanced: short < 0.1 ? 2 : short < 0.25 ? 4 : 8, basic: 1, why: 'day', room, pace };
}
// A rule's fresh time now: a live one's from the settings (YouBike its own),
// stretched by the guard for its kind; the rest as written.
export async function freshOf(rule, env = null, path = '', now = Date.now()) {
  if (rule.tier !== 'live' || /THSR/.test(rule.re.source)) return rule.fresh;
  const d = await devNow();
  const base = (/Bike/.test(rule.re.source) ? d.tdxBike : d.tdxLive) * 1000;
  if (!env) return base;
  const g = tdxGuard(tdxPoints(await tdxUse(env, now).catch(() => ({})), now), now);
  return base * (tdxKind(path) === 'b' ? g.basic : g.advanced);
}

const inflight = new Map();
// How long TDX gets when an older copy is there to answer with instead.
export const SLOW_MS = 3000;
// How long a copy stays in the cache: its stale time, a live one 10 minutes,
// YouBike's 30 (only ever an answer when TDX is slow or failing, with its age:
// a station's place and its bikes half an hour ago beat a trip held up by a
// TDX that hangs, 2026-10-22).
const keptFor = rule => Math.max(rule.stale, rule.tier === 'live' ? (/Bike/.test(rule.re.source) ? 30 : 10) * MIN : 0);
const timeout = ms => (typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(ms) : undefined);

// ---- YouBike kept warm --------------------------------------------------------------------
//
// Bikes are part of nearly every trip (Jay 2026-10-22: "bike is crucial"),
// and a city's list missing from a colo's cache meant waiting on TDX, which
// sometimes hangs: a trip held 30 s and more. So a city's stations and counts
// are also kept in KV (one copy for every colo, with when it's from), and
// the cron refreshes the counts of every city asked in the last 10 minutes
// each 2 minutes (the stations daily). An ask finds a copy at once; TDX is
// asked behind it. (Half an hour before 2026-11-06: after a person's last
// look, up to 15 reads of their city that no one saw, a fifth of what a
// typical day's map costs. Back later, the phone shows its own counts at
// once and the proxy reads TDX within SLOW_MS, as before.)
const WARM = /^basic\/v2\/Bike\/(Station|Availability)\/City\/[A-Za-z]+$/;
const WARM_ACTIVE = 'tdx:warm:active';
export const WARM_FOR = 10 * MIN;
const warmKey = req => `tdx:warm:${req.path}?${req.query}`;
const warmMarked = new Map(); // raw path → when this isolate last marked it
async function warmRead(env, req) {
  try {
    const r = await env.RATE_LIMIT_KV?.getWithMetadata(warmKey(req));
    return r?.value ? { body: r.value, at: Number(r.metadata?.at) || 0 } : null;
  } catch {
    return null;
  }
}
async function warmWrite(env, req, body, at) {
  try {
    await env.RATE_LIMIT_KV?.put(warmKey(req), body, { metadata: { at }, expirationTtl: req.rule.tier === 'live' ? 2 * 86_400 : 14 * 86_400 });
  } catch {}
}
// (A city asked: kept warm for the next 10 minutes. Once each 5 minutes an isolate.)
async function warmMark(env, raw, now) {
  if (now - (warmMarked.get(raw) || 0) < 5 * MIN) return;
  warmMarked.set(raw, now);
  const list = (await kvJson(env, WARM_ACTIVE)) || {};
  list[raw] = now;
  for (const [k, t] of Object.entries(list)) if (now - t > WARM_FOR) delete list[k];
  await kvPut(env, WARM_ACTIVE, list, 86_400);
}
// The cron (worker.js, the even minutes): each city asked lately, refreshed
// once its copy is past its fresh time. → { 'Availability/City/Hsinchu': state }
export async function warmBikes(env, deps = {}) {
  const now = deps.now ?? Date.now();
  const list = (await kvJson(env, WARM_ACTIVE)) || {};
  const out = {};
  for (const [raw, t] of Object.entries(list)) {
    if (now - t > WARM_FOR) continue;
    const got = await tdxGet(env, raw, { ...deps, now, warm: true });
    out[raw.split('?')[0].split('/').slice(-3).join('/')] = got.state;
  }
  return out;
}

// One TDX answer, from the shared cache when it's fresh enough.
// → { status, body (text), age (ms), state: 'hit' | 'miss' | 'stale' | 'busy' | 'error' }
// `warm` (the cron's): refreshed when its copy is past its fresh time, else 'warm'.
export async function tdxGet(env, raw, { fetchFn = fetch, cache = globalThis.caches?.default, ctx = null, now = Date.now(), warm = false, stale = null, young = null, oldest = 0, by = '' } = {}) {
  const req = tdxRequest(raw);
  // (`stale`: served at once that long, instead of the rule's.)
  const staleMs = stale ?? req?.rule.stale;
  if (!req) return { status: 400, body: JSON.stringify({ code: 'TDX_NOT_ALLOWED' }), state: 'error' };
  const url = `${TDX_BASE}${req.path}?${req.query}`;
  const key = new Request(`https://transit-cache.orbit/${req.path}?${req.query}`);
  const keepWarm = WARM.test(req.path);
  const dev = by === 'dev';
  const later = p => (ctx?.waitUntil ? ctx.waitUntil(p.catch(() => {})) : p.catch(() => {}));
  if (keepWarm && !warm && !dev) later(warmMark(env, raw, now));
  // (A path TDX refused (400, 404: a system it doesn't have, 'TRTCMG' for S2STravelTime) is refused here for a day, never asked again at each launch.)
  const refusedKey = new Request(`https://transit-cache.orbit/refused/${req.path}?${req.query}`);
  let hit = null;
  try {
    const no = cache ? await cache.match(refusedKey) : null;
    if (no) return { status: 502, body: JSON.stringify({ code: 'TDX_FAILED', upstream: Number(no.headers.get('X-Upstream')) || 400, why: 'refused' }), state: 'error' };
    hit = cache ? await cache.match(key) : null;
  } catch {}
  let at = hit ? Number(hit.headers.get('X-Fetched-At')) || 0 : 0;
  let body = hit ? await hit.text() : null;
  // (This colo's copy missing or past its stale time: KV's, when newer.)
  if (keepWarm && (warm || !hit || now - at >= staleMs)) {
    const w = await warmRead(env, req);
    if (w && (body == null || w.at > at)) [body, at] = [w.body, w.at];
  }
  const age = now - at;
  // (`young`: a copy fresh only that young at most, the asker's own being older;
  // `oldest`: one up to that old as it is, the asker needing no newer; our tools' DEV_OLDEST.)
  const fresh = Math.max(oldest, dev ? DEV_OLDEST : 0, Math.min(await freshOf(req.rule, env, req.path, now), young ?? Infinity));
  if (warm && body != null && age < Math.max(fresh, 90_000)) return { status: 200, age, state: 'warm' };
  if (!warm && body != null && age < fresh) return { status: 200, body, age, state: 'hit' };
  const refresh = async () => {
    if (inflight.has(url)) return inflight.get(url);
    const p = (async () => {
      if (dev && !(await devTdxRoom(env, now))) return { status: 429, state: 'devcap' };
      if (!paced(env, now)) return { status: 429, state: 'busy' };
      const token = await tdxAccess(env, fetchFn, now);
      if (!token) return { status: 503, state: 'nokey' };
      let res, read;
      // Another isolate may share the second: a 429 waits a moment and asks again (twice).
      for (let tries = 0; ; tries++) {
        if (!(await myTurn(env))) return { status: 429, state: 'busy' };
        // TDX sometimes hangs or answers 5xx for a moment: 12 s at most, and
        // one more try (the app said 暫時無法取得資料 for these).
        res = await fetchFn(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'Accept-Encoding': 'br, gzip' }, signal: timeout(12_000) }).catch(err => ({ ok: false, status: 504, text: async () => String(err?.name || err) }));
        read = await tdxBody(res);
        await tallyTdx(env, req.path, now, ctx, by, read);
        if (res.status >= 500 && tries < 1) continue;
        if (res.status !== 429 || tries >= 2 || !Number(env.TDX_PER_SEC)) break;
        turn.next = Math.max(turn.next, Date.now() + 1100);
      }
      // On the free plan (no TDX_PER_SEC) a 429 means the minute is spent.
      if (res.status === 429 && !Number(env.TDX_PER_SEC)) pace.until = now + 30_000;
      if (res.status === 401) resetTdxToken();
      if ((res.status === 400 || res.status === 404) && cache) {
        const put = cache.put(refusedKey, new Response('', { headers: { 'X-Upstream': String(res.status), 'Cache-Control': 'public, max-age=86400' } })).catch(() => {});
        if (ctx?.waitUntil) ctx.waitUntil(put);
        else await put;
      }
      if (!res.ok) return { status: res.status, state: 'error', why: read.text.slice(0, 160) };
      const text = tdxTrim(req.path, read.text);
      const puts = [];
      if (cache) puts.push(cache.put(key, new Response(text, { headers: { 'Content-Type': 'application/json; charset=utf-8', 'X-Fetched-At': String(now), 'Cache-Control': `public, max-age=${Math.ceil(keptFor(req.rule) / 1000)}` } })).catch(() => {}));
      if (keepWarm) puts.push(warmWrite(env, req, text, now));
      const put = Promise.all(puts);
      if (ctx?.waitUntil) ctx.waitUntil(put);
      else await put;
      return { status: 200, body: text, age: 0, state: 'miss' };
    })().finally(() => inflight.delete(url));
    inflight.set(url, p);
    return p;
  };
  if (warm) {
    const got = await refresh().catch(err => ({ status: 502, state: 'error', why: String(err?.message || err) }));
    return { status: got.status, age: 0, state: got.state };
  }
  if (body != null && age < staleMs) {
    // At once, refreshed behind.
    later(refresh());
    return { status: 200, body, age, state: 'stale' };
  }
  let got;
  try {
    // Past its stale time, a copy still kept (a live one up to 10 minutes,
    // YouBike's in KV): TDX given SLOW_MS, then that copy (with its age) and
    // TDX's answer kept for the next ask. A slow TDX used to hold a card 12 s and more.
    const job = refresh();
    if (body != null) {
      const late = Symbol('late');
      got = await Promise.race([job, sleep(SLOW_MS).then(() => late)]);
      if (got === late) {
        later(job);
        return { status: 200, body, age, state: 'stale' };
      }
    } else got = await job;
  } catch (err) {
    got = { status: 502, state: 'error', why: String(err?.message || err).slice(0, 120) };
  }
  if (got.status === 200) return got;
  // TDX busy or failing: the last copy, however old the cache (or KV) still has it.
  if (body != null) return { status: 200, body, age, state: 'stale' };
  const code = got.state === 'nokey' ? 'TDX_NO_KEY' : got.state === 'devcap' ? 'DEV_TDX_CAP' : got.state === 'busy' || got.status === 429 ? 'TDX_BUSY' : 'TDX_FAILED';
  return { status: got.state === 'nokey' ? 503 : got.status === 429 || got.state === 'busy' ? 429 : 502, body: JSON.stringify({ code, upstream: got.status, why: got.why || '' }), state: got.state || 'error' };
}

// ---- Google: places -------------------------------------------------------------------

const googleKey = env => env.GOOGLE_MAPS_KEY || env.GOOGLE_WEATHER_KEY || '';
const num = v => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
const inTaiwan = (lat, lon) => lat >= 21.7 && lat <= 26.5 && lon >= 118 && lon <= 122.2;

export function parseAutocomplete(j) {
  return (j?.suggestions || [])
    .map(s => s.placePrediction)
    .filter(Boolean)
    .map(p => ({
      id: p.placeId || String(p.place || '').replace(/^places\//, ''),
      name: p.structuredFormat?.mainText?.text || p.text?.text || '',
      sub: p.structuredFormat?.secondaryText?.text || '',
      dist: num(p.distanceMeters),
      types: (p.types || []).slice(0, 4)
    }))
    .filter(p => p.id && p.name);
}

// Text Search's places ({ places: [{ id, displayName, formattedAddress, location }] }),
// their address short (no postcode, no 台灣), each with its position (no details asked after).
export function parseTextSearch(j, lat = null, lon = null) {
  return (j?.places || [])
    .map(p => {
      const plat = num(p.location?.latitude);
      const plon = num(p.location?.longitude);
      const sub = String(p.formattedAddress || '').replace(/^\d{3,6}/, '').replace(/^(臺灣|台灣)/, '').trim();
      return { id: p.id || '', name: p.displayName?.text || '', sub, lat: plat, lon: plon, dist: lat != null && plat != null ? Math.round(distM(lat, lon, plat, plon)) : null, types: (p.types || []).slice(0, 8) };
    })
    .filter(p => p.id && p.name && p.lat != null);
}

export function parseNominatim(list) {
  return (Array.isArray(list) ? list : [])
    .map(p => {
      const parts = String(p.display_name || '').split(',').map(s => s.trim()).filter(Boolean);
      return { id: `osm:${p.osm_type?.[0] || 'n'}${p.osm_id}`, name: p.name || parts[0] || '', sub: parts.slice(1, 4).join(' '), lat: num(p.lat), lon: num(p.lon) };
    })
    .filter(p => p.name && p.lat != null && p.lon != null);
}

// The near ones that carry the whole name first (nearest first), then
// Google's order; each place once.
const squash = s => String(s || '').replace(/\s+/g, '').replace(/台/g, '臺').toLowerCase();
const distM = (a, b, c, d) => {
  const R = 6371000;
  const r = x => (x * Math.PI) / 180;
  const h = Math.sin(r(c - a) / 2) ** 2 + Math.cos(r(a)) * Math.cos(r(c)) * Math.sin(r(d - b) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};
// A chain's name before its branch: 八方雲集(竹北成功店), 八方雲集 新竹店 → 八方雲集.
const stem = name => squash(String(name || '').split(/[\s(（\-－·・]/)[0]);
const NEAR_M = 25_000;
// The places found, nearest first: every branch of a chain near you (Text
// Search's, Google's own spelling of the name: 八分雲集 → 八方雲集) before
// anything else, and a branch in another city left out while one's near;
// then the rest (an address, a place with no position). 15 at most.
// A place and its parts (LaLaport and its cinema, its car parks, a shop in
// it): when the words typed are in each one's name, they're within 400 m of
// a whole place by Google's own type (a mall, a station, an airport…), and
// each is plainly a part (its type a car park, a cinema, a shop…, or the
// whole place's name in its own: 台北車站 M3出口), only the whole place. Nothing folds without one: two branches of a chain
// stay two. A part only by its distance (no position: Autocomplete's) folds
// when its distance from you is within 400 m of the whole place's.
const WHOLE = new Set(['shopping_mall', 'department_store', 'airport', 'train_station', 'subway_station', 'university', 'hospital', 'stadium', 'amusement_park', 'zoo', 'museum']);
// What sits in a whole place (a car park, a cinema, a shop, somewhere to eat): a place of its own beside one (新竹轉運站 by 新竹車站) is none of these.
const PART = new Set(['parking', 'parking_lot', 'parking_garage', 'movie_theater', 'restaurant', 'cafe', 'bakery', 'food_court', 'fast_food_restaurant', 'store', 'supermarket', 'atm', 'bank', 'electric_vehicle_charging_station', 'gym', 'beauty_salon', 'hair_salon', 'pharmacy', 'drugstore', 'bar', 'book_store']);
const isPart = types => (types || []).some(x => PART.has(x) || /_store$|_restaurant$|_shop$/.test(x));
export function folded(list, text) {
  const t = squash(text);
  const named = i => t.length >= 2 && squash(i.name).includes(t);
  const wholes = list.filter(i => named(i) && i.lat != null && (i.types || []).some(x => WHOLE.has(x)));
  if (!wholes.length) return list;
  const partOf = i =>
    named(i) &&
    !wholes.some(w => w.id === i.id) &&
    wholes.some(w => (i.lat != null ? distM(w.lat, w.lon, i.lat, i.lon) <= 400 : i.dist != null && w.dist != null && Math.abs(i.dist - w.dist) <= 400) && (isPart(i.types) || squash(i.name).includes(squash(w.name))));
  return list.filter(i => !partOf(i));
}
export function nearFirst(found, near, text) {
  const t = squash(text);
  const all = folded([...near, ...found], text);
  const items = found.filter(i => all.includes(i));
  near = near.filter(i => all.includes(i));
  const close = all.filter(i => i.dist != null && i.dist <= NEAR_M).sort((a, b) => a.dist - b.dist);
  // (A name typed whole, found near: those first among the near ones, the
  // place called exactly that before the ones it is part of: 新竹高中 over 新竹高中214班.)
  const whole = close.filter(i => squash(i.name).includes(t)).sort((a, b) => (squash(b.name) === t) - (squash(a.name) === t));
  const chains = new Set(close.map(i => stem(i.name)).filter(Boolean));
  const rest = [...items, ...near].filter(i => !(i.dist != null && i.dist > NEAR_M && chains.has(stem(i.name))));
  const seen = new Set();
  return [...whole, ...close, ...rest].filter(i => !seen.has(i.id) && seen.add(i.id)).slice(0, 15);
}

async function search(env, q, { fetchFn, ctx, now, cache, by }) {
  const text = String(q.get('q') || '').trim().slice(0, 80);
  if (!text) return { items: [] };
  const lat = num(q.get('lat'));
  const lon = num(q.get('lon'));
  const session = /^[A-Za-z0-9_-]{8,64}$/.test(q.get('s') || '') ? q.get('s') : '';
  if (googleKey(env) && (await spend(env, 'autocomplete', 1, now, ctx, { by }))) {
    const body = { input: text, languageCode: 'zh-TW', regionCode: 'tw', includedRegionCodes: ['tw'], ...(session ? { sessionToken: session } : {}) };
    if (lat != null && lon != null && inTaiwan(lat, lon)) Object.assign(body, { origin: { latitude: lat, longitude: lon }, locationBias: { circle: { center: { latitude: lat, longitude: lon }, radius: 30_000 } } });
    // (Asked once more on a failure before OpenStreetMap: its search is far weaker in Taiwan.)
    const ask = async b => {
      for (let k = 0; k < 2; k++) {
        const res = await fetchFn(`${PLACES}places:autocomplete`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': googleKey(env) }, body: JSON.stringify(b), signal: timeout(8000) }).catch(() => null);
        if (res?.ok) return parseAutocomplete(await res.json());
        if (res && res.status < 500 && res.status !== 429) return null;
      }
      return null;
    };
    // Autocomplete gives five at most, and for a chain (八方雲集) branches
    // anywhere: Text Search's places beside it (up to 20, near you first,
    // fuzzier: a typo still finds the name), under its own cap, kept a day
    // for the same words within ~1 km.
    const near = async origin => {
      if (text.length < 2) return [];
      const key = new Request(`https://transit-cache.orbit/text/${encodeURIComponent(squash(text))}/${origin ? `${origin.latitude.toFixed(2)},${origin.longitude.toFixed(2)}` : 'tw'}`);
      try {
        const hit = cache && (await cache.match(key));
        if (hit) return parseTextSearch(await hit.json(), lat, lon).filter(p => inTaiwan(p.lat, p.lon));
      } catch {}
      if (!(await spend(env, 'textSearch', 1, now, ctx, { by }))) return [];
      const tb = { textQuery: text, languageCode: 'zh-TW', regionCode: 'tw', pageSize: 20, ...(origin ? { locationBias: { circle: { center: origin, radius: 10_000 } } } : {}) };
      const res = await fetchFn(TEXT_SEARCH, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': googleKey(env), 'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location,places.types' }, body: JSON.stringify(tb), signal: timeout(8000) }).catch(() => null);
      if (!res?.ok) return [];
      const j = await res.json();
      if (cache) {
        const put = cache.put(key, new Response(JSON.stringify(j), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=86400' } })).catch(() => {});
        if (ctx?.waitUntil) ctx.waitUntil(put);
      }
      return parseTextSearch(j, lat, lon).filter(p => inTaiwan(p.lat, p.lon));
    };
    try {
      const [items, found] = await Promise.all([ask(body), near(body.origin).catch(() => [])]);
      if (items || found.length) return { items: nearFirst(items || [], found, text), by: 'google' };
    } catch {}
  }
  // OpenStreetMap's search (Nominatim: a second a request at most, so cached a day).
  const params = new URLSearchParams({ q: text, format: 'jsonv2', countrycodes: 'tw', 'accept-language': 'zh-TW', limit: '8' });
  if (lat != null && lon != null) params.set('viewbox', `${lon - 0.3},${lat + 0.3},${lon + 0.3},${lat - 0.3}`);
  const url = `${NOMINATIM}?${params}`;
  const key = new Request(`https://transit-cache.orbit/osm?${params}`);
  try {
    const hit = cache && (await cache.match(key));
    if (hit) return { items: nearFirst(parseNominatim(await hit.json()).map(i => ({ ...i, dist: lat != null && lon != null ? Math.round(distM(lat, lon, i.lat, i.lon)) : null })), [], text), by: 'osm' };
    const res = await fetchFn(url, { headers: { 'User-Agent': 'OrbitTransit/1.0 (https://orbit.jaypengx.com/transit/)', Accept: 'application/json' }, signal: timeout(8000) });
    if (!res.ok) return { items: [], by: 'osm' };
    const list = await res.json();
    if (cache) {
      const put = cache.put(key, new Response(JSON.stringify(list), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=86400' } })).catch(() => {});
      if (ctx?.waitUntil) ctx.waitUntil(put);
    }
    const items = parseNominatim(list).map(i => ({ ...i, dist: lat != null && lon != null ? Math.round(distM(lat, lon, i.lat, i.lon)) : null }));
    return { items: nearFirst(items, [], text), by: 'osm' };
  } catch {
    return { items: [], by: 'osm' };
  }
}

export function parsePlace(j) {
  const lat = num(j?.location?.latitude);
  const lon = num(j?.location?.longitude);
  if (lat == null || lon == null) return null;
  return { id: j.id || '', name: j.displayName?.text || '', lat, lon, address: j.formattedAddress || '', types: (j.types || []).slice(0, 6) };
}

async function place(env, q, { fetchFn, ctx, now, cache, by }) {
  const id = String(q.get('id') || '');
  if (!/^[A-Za-z0-9_-]{10,300}$/.test(id)) return [{ code: 'BAD_PLACE' }, 400];
  if (!googleKey(env)) return [{ code: 'NO_KEY' }, 503];
  // A place's name is Pro; its position and address Essentials. A copy kept
  // here is looked for first: only a call Google bills counts toward its cap.
  const keyOf = pro => new Request(`https://transit-cache.orbit/place/${id}?pro=${pro ? 1 : 0}`);
  const kept = async pro => {
    try {
      const hit = cache && (await cache.match(keyOf(pro)));
      return hit ? await hit.json() : null;
    } catch {
      return null;
    }
  };
  const wantName = q.get('name') === '1';
  const named = wantName ? await kept(true) : null;
  if (named) return [named, 200];
  const pro = wantName && (await spend(env, 'detailsPro', 1, now, ctx, { by }));
  const plain = pro ? null : await kept(false);
  if (plain) return [plain, 200];
  const key = keyOf(pro);
  if (!pro && !(await spend(env, 'details', 1, now, ctx, { by }))) return [{ code: 'CAP_REACHED' }, 429];
  const session = /^[A-Za-z0-9_-]{8,64}$/.test(q.get('s') || '') ? `&sessionToken=${q.get('s')}` : '';
  const fields = `id,location,formattedAddress,types${pro ? ',displayName' : ''}`;
  const res = await fetchFn(`${PLACES}places/${encodeURIComponent(id)}?languageCode=zh-TW&regionCode=tw${session}`, { headers: { 'X-Goog-Api-Key': googleKey(env), 'X-Goog-FieldMask': fields }, signal: timeout(8000) }).catch(() => null);
  if (!res?.ok) return [{ code: 'PLACE_FAILED', status: res?.status }, 502];
  const out = parsePlace(await res.json().catch(() => null));
  if (!out) return [{ code: 'PLACE_FAILED' }, 502];
  // Kept a day (Google allows place ids kept; positions are refreshed daily).
  if (cache) {
    const put = cache.put(key, new Response(JSON.stringify(out), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=86400' } })).catch(() => {});
    if (ctx?.waitUntil) ctx.waitUntil(put);
  }
  return [out, 200];
}

// ---- Routes: Google's and TDX's plans in one shape -----------------------------------------
//
// A plan: { src, dep, arr, dur (s), walk (m), fare, transfers, legs: [leg] }
// A leg: { mode: walk|bike|bus|metro|lightrail|tra|hsr|ferry|gondola|rail,
//   name, short, color, text, headsign, agency, stops, dep, arr, dur, dist,
//   from: { name, lat, lon }, to: {…}, poly, fmt: 'g' (Google's encoding) | 'f' (HERE's flexible) }

const G_MODES = {
  BUS: 'bus', INTERCITY_BUS: 'bus', TROLLEYBUS: 'bus', SHARE_TAXI: 'bus',
  SUBWAY: 'metro', METRO_RAIL: 'metro', MONORAIL: 'metro',
  LIGHT_RAIL: 'lightrail', TRAM: 'lightrail',
  HIGH_SPEED_TRAIN: 'hsr',
  HEAVY_RAIL: 'tra', RAIL: 'tra', COMMUTER_TRAIN: 'tra', LONG_DISTANCE_TRAIN: 'tra',
  FERRY: 'ferry', CABLE_CAR: 'gondola', GONDOLA_LIFT: 'gondola', FUNICULAR: 'gondola'
};
const secs = s => (typeof s === 'string' ? Number(s.replace(/s$/, '')) || 0 : Number(s) || 0);
// A time without a zone (TDX's planner: "2026-10-03T17:22:00") is Taiwan's.
const ms = t => {
  const v = t ? Date.parse(/(Z|[+-]\d\d:?\d\d)$/.test(t) ? t : `${t}+08:00`) : NaN;
  return Number.isFinite(v) ? v : null;
};
const pt = (name, ll) => ({ name: name || '', lat: num(ll?.latitude ?? ll?.lat), lon: num(ll?.longitude ?? ll?.lng ?? ll?.lon) });
// TDX names a metro exit after its station, then the station again (台北車站台北車站 M1, 板橋板橋站 出口3): said once.
export const onceName = n => String(n || '').replace(/^(.{2,}?)\1/, '$1');

export const GOOGLE_ROUTE_FIELDS = [
  'routes.duration',
  'routes.distanceMeters',
  'routes.travelAdvisory.transitFare',
  'routes.legs.steps.travelMode',
  'routes.legs.steps.staticDuration',
  'routes.legs.steps.distanceMeters',
  'routes.legs.steps.polyline.encodedPolyline',
  'routes.legs.steps.startLocation',
  'routes.legs.steps.endLocation',
  'routes.legs.steps.transitDetails'
].join(',');

// The ways of moving a trip may use (the app's 交通偏好): bus, tra, hsr, metro, bike.
export const MODES = ['bus', 'tra', 'hsr', 'metro', 'bike'];
export function parseModes(raw) {
  if (!raw) return new Set(MODES);
  const set = new Set(String(raw).split(',').filter(m => MODES.includes(m)));
  return set.size ? set : new Set(MODES);
}
// Google's names for them (TRAIN is 台鐵 and 高鐵 both; RAIL would be every rail).
export function googleModes(modes) {
  const out = [];
  if (modes.has('bus')) out.push('BUS');
  if (modes.has('tra') || modes.has('hsr')) out.push('TRAIN');
  if (modes.has('metro')) out.push('SUBWAY', 'LIGHT_RAIL');
  return out;
}

// TDX's planner's transit codes, learned by asking (status?sample=maas&transit=):
// 5 is every bus; 3 and 4 together are 台鐵 and 高鐵 (4 alone is refused, 3
// alone finds nothing); 6–9 add the metros (only beside 3,4). The app drops
// what it doesn't want from the rest.
export function tdxTransit(modes) {
  const codes = [];
  if (modes.has('tra') || modes.has('hsr') || modes.has('metro')) codes.push(3, 4);
  if (modes.has('bus')) codes.push(5);
  if (modes.has('metro')) codes.push(6, 7, 8, 9);
  return codes.join(',');
}

export function googleRouteBody(from, to, { at = null, by = 'depart', prefer = '', modes = null } = {}) {
  const body = {
    origin: { location: { latLng: { latitude: from.lat, longitude: from.lon } } },
    destination: { location: { latLng: { latitude: to.lat, longitude: to.lon } } },
    travelMode: 'TRANSIT',
    computeAlternativeRoutes: true,
    languageCode: 'zh-TW',
    regionCode: 'tw',
    units: 'METRIC'
  };
  if (at) body[by === 'arrive' ? 'arrivalTime' : 'departureTime'] = new Date(at).toISOString();
  if (prefer === 'walk') body.transitPreferences = { routingPreference: 'LESS_WALKING' };
  if (prefer === 'transfers') body.transitPreferences = { routingPreference: 'FEWER_TRANSFERS' };
  const allowed = modes ? googleModes(modes) : [];
  if (allowed.length && allowed.length < 4) body.transitPreferences = { ...body.transitPreferences, allowedTravelModes: allowed };
  return body;
}

export function parseGoogleRoutes(j, now = Date.now()) {
  const plans = [];
  for (const r of j?.routes || []) {
    const steps = (r.legs || []).flatMap(l => l.steps || []);
    const legs = [];
    for (const s of steps) {
      const td = s.transitDetails;
      if (s.travelMode === 'TRANSIT' && td) {
        const line = td.transitLine || {};
        const sd = td.stopDetails || {};
        legs.push({
          mode: G_MODES[line.vehicle?.type] || 'rail',
          name: line.name || line.nameShort || '',
          // Rail lines' short names come in English (Local Train) beside a Chinese name (區間車).
          short: /[\u4e00-\u9fff]/.test(line.name || '') && /^[A-Za-z][A-Za-z .-]*$/.test(line.nameShort || '') ? '' : line.nameShort || '',
          color: line.color || '',
          text: line.textColor || '',
          vehicle: line.vehicle?.name?.text || '',
          agency: line.agencies?.[0]?.name || '',
          headsign: td.headsign || '',
          stops: Number(td.stopCount) || 0,
          headway: secs(td.headway) || null,
          dep: ms(sd.departureTime),
          arr: ms(sd.arrivalTime),
          dur: secs(s.staticDuration),
          dist: Number(s.distanceMeters) || 0,
          from: pt(sd.departureStop?.name, sd.departureStop?.location?.latLng),
          to: pt(sd.arrivalStop?.name, sd.arrivalStop?.location?.latLng),
          poly: s.polyline?.encodedPolyline || '',
          fmt: 'g'
        });
      } else {
        // Walking steps run together into one walk.
        const last = legs.at(-1);
        const step = { dur: secs(s.staticDuration), dist: Number(s.distanceMeters) || 0, poly: s.polyline?.encodedPolyline || '' };
        if (last?.mode === 'walk') {
          last.dur += step.dur;
          last.dist += step.dist;
          last.polys.push(step.poly);
          last.to = pt('', s.endLocation?.latLng);
        } else legs.push({ mode: 'walk', dur: step.dur, dist: step.dist, polys: [step.poly], from: pt('', s.startLocation?.latLng), to: pt('', s.endLocation?.latLng), fmt: 'g' });
      }
    }
    if (!legs.length) continue;
    timeWalks(legs, now);
    for (const l of legs) if (l.polys) {
      l.poly = l.polys.filter(Boolean);
      delete l.polys;
    }
    const fare = r.travelAdvisory?.transitFare;
    plans.push(finishPlan({ src: 'google', legs, fare: fare?.units != null ? Number(fare.units) : null }));
  }
  return plans;
}

// Walks take their times from the rides around them (Google gives a walk
// only its length).
function timeWalks(legs, now) {
  for (let i = 0; i < legs.length; i++) {
    const l = legs[i];
    if (l.mode !== 'walk' || (l.dep != null && l.arr != null)) continue;
    const next = legs.slice(i + 1).find(x => x.dep != null);
    const prev = legs.slice(0, i).reverse().find(x => x.arr != null);
    if (prev?.arr != null) {
      l.dep = prev.arr;
      l.arr = prev.arr + l.dur * 1000;
    } else if (next?.dep != null) {
      l.arr = next.dep;
      l.dep = next.dep - l.dur * 1000;
    } else {
      l.dep = now;
      l.arr = now + l.dur * 1000;
    }
  }
}

function finishPlan(p) {
  const legs = p.legs;
  const rides = legs.filter(l => l.mode !== 'walk' && l.mode !== 'bike');
  const dep = legs[0]?.dep ?? null;
  const arr = legs.at(-1)?.arr ?? null;
  return {
    ...p,
    dep,
    arr,
    dur: dep != null && arr != null ? Math.round((arr - dep) / 1000) : legs.reduce((a, l) => a + (l.dur || 0), 0),
    walk: legs.filter(l => l.mode === 'walk').reduce((a, l) => a + (l.dist || 0), 0),
    transfers: Math.max(0, rides.length - 1)
  };
}

// TDX's planner (MaaS 公共運輸旅運規劃): routes with sections in HERE's
// public-transit shape. Read loosely: a field it doesn't send is left empty.
const T_MODES = {
  pedestrian: 'walk', walk: 'walk',
  bicycle: 'bike', bike: 'bike', bikeShare: 'bike', rentedBike: 'bike', sharedBike: 'bike',
  highSpeedTrain: 'hsr', intercityTrain: 'tra', interRegionalTrain: 'tra', regionalTrain: 'tra', cityTrain: 'tra', train: 'tra',
  subway: 'metro', monorail: 'metro', lightRail: 'lightrail', tram: 'lightrail',
  bus: 'bus', privateBus: 'bus', busRapid: 'bus', coach: 'bus',
  ferry: 'ferry', aerial: 'gondola', inclined: 'gondola', cableCar: 'gondola',
  // TDX's own words (seen live): cycle, TRA, YOXI (a taxi), and the operators' codes.
  cycle: 'bike', drive: 'car', car: 'car', taxi: 'car', YOXI: 'car',
  TRA: 'tra', THSR: 'hsr', HSR: 'hsr', MRT: 'metro', METRO: 'metro', Metro: 'metro',
  TRTC: 'metro', KRTC: 'metro', TYMC: 'metro', TMRT: 'metro', NTMC: 'metro',
  KLRT: 'lightrail', NTALRT: 'lightrail', LRT: 'lightrail',
  BUS: 'bus', Bus: 'bus', CityBus: 'bus', InterCityBus: 'bus', THB: 'bus',
  FERRY: 'ferry', Ferry: 'ferry', AIR: 'plane'
};
const tdxMode = (s, t) => {
  for (const k of [t.mode, t.type, t.category]) if (k && T_MODES[k]) return T_MODES[k];
  const all = `${t.mode || ''} ${t.type || ''} ${t.category || ''} ${s.type || ''}`;
  if (s.type === 'pedestrian' || /walk|pedestrian/i.test(all)) return 'walk';
  if (/bike|bicycle|cycle/i.test(all)) return 'bike';
  if (/bus/i.test(all)) return 'bus';
  if (/drive|car|taxi/i.test(all)) return 'car';
  if (/thsr|hsr|high/i.test(all)) return 'hsr';
  if (/metro|mrt|subway/i.test(all)) return 'metro';
  return s.type === 'transit' ? 'tra' : 'walk';
};
// A section without its length: the straight line between its ends, ×1.3 for the streets.
function roughMeters(a, b) {
  const [la1, lo1, la2, lo2] = [a?.lat, a?.lng, b?.lat, b?.lng].map(Number);
  if (![la1, lo1, la2, lo2].every(Number.isFinite)) return 0;
  const r = Math.PI / 180;
  const x = (lo2 - lo1) * r * Math.cos(((la1 + la2) / 2) * r);
  const y = (la2 - la1) * r;
  return Math.round(Math.sqrt(x * x + y * y) * 6_371_000 * 1.3);
}
export function parseTdxRoutes(j) {
  const routes = j?.data?.routes || j?.routes || [];
  const plans = [];
  for (const r of routes) {
    const sections = Array.isArray(r.sections) ? r.sections : Object.values(r.sections || {});
    const legs = sections.map(s => {
      const t = s.transport || {};
      const mode = tdxMode(s, t);
      const dep = ms(s.departure?.time);
      const arr = ms(s.arrival?.time);
      return {
        mode,
        name: t.name || t.longName || '',
        short: t.shortName || '',
        color: t.color || '',
        text: t.textColor || '',
        agency: s.agency?.name || '',
        headsign: t.headsign || '',
        stops: Array.isArray(s.intermediateStops) ? s.intermediateStops.length + 1 : 0,
        dep,
        arr,
        dur: Number(s.travelSummary?.duration ?? s.duration) || (dep != null && arr != null ? (arr - dep) / 1000 : 0),
        dist: Number(s.travelSummary?.length ?? s.length) || roughMeters(s.departure?.place?.location, s.arrival?.place?.location),
        from: pt(onceName(s.departure?.place?.name), s.departure?.place?.location),
        to: pt(onceName(s.arrival?.place?.name), s.arrival?.place?.location),
        poly: s.polyline || '',
        fmt: 'f'
      };
    });
    // TDX pads a trip with zero-length cycle / taxi stubs at its ends: those
    // are no legs; nor a "walk" of no length (a wait for the next ride, said
    // by that ride's time, never shown as walking 23 minutes).
    const real = legs.filter(l => !(l.mode !== 'walk' && !/^(tra|hsr|metro|lightrail|bus|ferry|gondola|plane)$/.test(l.mode) && l.dist < 60 && l.dur < 120) && !(l.mode === 'walk' && l.dist < 5 && l.from.lat != null && l.to.lat != null));
    if (!real.length) continue;
    plans.push(finishPlan({ src: 'tdx', legs: real, fare: num(r.total_price ?? r.price ?? r.fare) }));
  }
  return plans;
}

// Two plans riding the same lines between the same stops are one.
export const planSig = p =>
  p.legs
    .filter(l => l.mode !== 'walk')
    .map(l => `${l.mode}:${l.short || l.name}:${l.from?.name}>${l.to?.name}`)
    .join('|');

const twIso = t => new Date(t + 8 * HOUR).toISOString().slice(0, 19);

async function routes(env, q, { fetchFn, ctx, now, cache, by: who }) {
  const ll = s => {
    const m = /^(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/.exec(s || '');
    return m && inTaiwan(Number(m[1]), Number(m[2])) ? { lat: Number(m[1]), lon: Number(m[2]) } : null;
  };
  const from = ll(q.get('from'));
  const to = ll(q.get('to'));
  if (!from || !to) return [{ code: 'BAD_LOCATION' }, 400];
  const by = q.get('by') === 'arrive' ? 'arrive' : 'depart';
  const modes = parseModes(q.get('modes'));
  const modeKey = MODES.filter(m => modes.has(m)).join('');
  const atRaw = Number(q.get('at'));
  // (Never further ahead than 60 days: a time no Date can hold would throw.)
  const at = Number.isFinite(atRaw) && atRaw > now - 5 * MIN ? Math.min(Math.max(atRaw, now), now + 60 * 1440 * MIN) : now;
  // Plans for the same ~100 m and 5 minutes are shared.
  const round = v => v.toFixed(3);
  const slot = Math.floor(at / (5 * MIN));
  // `src`: one planner's plans alone (google, or tdx: TDX's two), so the app
  // shows Google's (a tenth of a second) without waiting for TDX's (seconds).
  const src = ['google', 'tdx'].includes(q.get('src')) ? q.get('src') : '';
  const cacheKey = new Request(`https://transit-cache.orbit/route/${round(from.lat)},${round(from.lon)}/${round(to.lat)},${round(to.lon)}/${by}/${slot}/${modeKey}${src ? `/${src}` : ''}`);
  try {
    const hit = cache && (await cache.match(cacheKey));
    if (hit) return [{ ...(await hit.json()), cached: true }, 200];
  } catch {}
  const sources = {};
  // How long each planner took (ms), for the app's 除錯紀錄 and for seeing which one a slow plan waited on.
  const took = {};
  const timed = (key, job) => {
    const t = Date.now();
    return job.finally(() => (took[key] = Date.now() - t));
  };
  const jobs = [];
  const railOrBus = modes.has('bus') || modes.has('tra') || modes.has('hsr') || modes.has('metro');
  if (src === 'tdx') {
    // (TDX's alone.)
  } else if (!railOrBus) sources.google = 'off';
  else if (googleKey(env) && (await spend(env, 'routes', 1, now, ctx, { by: who }))) {
    jobs.push(timed('google',
      fetchFn(ROUTES, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': googleKey(env), 'X-Goog-FieldMask': GOOGLE_ROUTE_FIELDS }, body: JSON.stringify(googleRouteBody(from, to, { at: by === 'arrive' || at > now + MIN ? at : null, by, modes })), signal: timeout(15_000) })
        .then(async r => {
          sources.google = r.ok ? 'ok' : `http ${r.status}`;
          return r.ok ? parseGoogleRoutes(await r.json(), at) : [];
        })
        .catch(() => ((sources.google = 'error'), []))
    ));
  } else sources.google = googleKey(env) ? 'cap' : 'nokey';
  if (src === 'google') {
    // (Google's alone.)
  } else if (env.TDX_CLIENT_ID) {
    // Twice: walking to and from the stops, and by 共享單車 (YouBike) for the
    // first and last mile (TDX's mode 3), which reaches the express buses and
    // stations a walk doesn't (the owner: bike to 快捷8號, bike from 竹東).
    const ask = (key, mile, minutes) => {
      const params = new URLSearchParams({ origin: `${from.lat},${from.lon}`, destination: `${to.lat},${to.lon}`, gc: '1.0', top: '5', transit: tdxTransit(modes), transfer_time: '0,60', first_mile_mode: mile, first_mile_time: minutes, last_mile_mode: mile, last_mile_time: minutes });
      params.set(by === 'arrive' ? 'arrival' : 'depart', twIso(at + (by === 'arrive' ? 0 : MIN)));
      return (async () => {
        if (who === 'dev' && !(await devTdxRoom(env, now))) return ((sources[key] = 'devcap'), []);
        if (!paced(env, now)) return ((sources[key] = 'busy'), []);
        if (!(await myTurn(env))) return ((sources[key] = 'busy'), []);
        const token = await tdxAccess(env, fetchFn, now);
        if (!token) return ((sources[key] = 'nokey'), []);
        const r = await fetchFn(`${TDX_BASE}maas/routing?${params}`, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'Accept-Encoding': 'br, gzip' }, signal: timeout(15_000) });
        const read = await tdxBody(r);
        await tallyTdx(env, 'maas/routing', now, ctx, who, read);
        sources[key] = r.ok ? 'ok' : `http ${r.status}`;
        return r.ok ? parseTdxRoutes(JSON.parse(read.text)).map(p => ({ ...p, src: key === 'tdx' ? 'tdx' : 'tdx-bike' })) : [];
      })().catch(() => ((sources[key] = 'error'), []));
    };
    if (railOrBus) jobs.push(timed('tdx', ask('tdx', '0', '15')));
    if (railOrBus && modes.has('bike')) jobs.push(timed('tdxBike', ask('tdxBike', '3', '20')));
  } else sources.tdx = 'nokey';
  const all = (await Promise.all(jobs)).flat();
  const seen = new Set();
  const plans = all
    .filter(p => p.legs.length && p.arr != null)
    .sort((a, b) => a.arr - b.arr)
    .filter(p => {
      const s = planSig(p);
      if (seen.has(s)) return false;
      seen.add(s);
      return true;
    })
    // The app ranks them (by what's practical, not only the soonest there): it gets them all.
    .slice(0, 16);
  const out = { from, to, at, by, plans, sources: { ...sources, ms: took } };
  // Only a whole answer is kept: a planner that failed (busy, an error) leaves it out, never shared for 5 minutes (TRUTH §7).
  const failed = Object.values(sources).some(v => v === 'busy' || v === 'error' || String(v).startsWith('http'));
  if (cache && plans.length && !failed) {
    const put = cache.put(cacheKey, new Response(JSON.stringify(out), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=300' } })).catch(() => {});
    if (ctx?.waitUntil) ctx.waitUntil(put);
  }
  return [out, 200];
}

// ---- Checks --------------------------------------------------------------------------------
//
// /transit/status?sample=<name>: one small, fixed ask each (a few rows, around
// 新竹車站), cached like any other (TDX's by its rule, the planners' an hour),
// to see TDX's and Google's real answers (a session's, or the dev door's:
// each spends a real ask). Never an arbitrary path: only these.
const AT = { lat: 24.8016, lon: 120.9716 }; // 新竹車站
const TO = { lat: 25.0478, lon: 121.517 }; // 台北車站
export const SAMPLES = {
  'bike-station': `basic/v2/Bike/Station/City/Hsinchu?$top=2`,
  'bike-live': `basic/v2/Bike/Availability/City/Hsinchu?$top=2`,
  'bike-near': `advanced/v2/Bike/Availability/NearBy?$spatialFilter=nearby(${AT.lat},${AT.lon},300)&$top=2`,
  'bus-near': `advanced/v2/Bus/Station/NearBy?$spatialFilter=nearby(${AT.lat},${AT.lon},200)&$top=2`,
  'bus-eta': `advanced/v2/Bus/EstimatedTimeOfArrival/NearBy?$spatialFilter=nearby(${AT.lat},${AT.lon},150)&$top=3`,
  'bus-route': `basic/v2/Bus/Route/City/Hsinchu?$top=2&$select=RouteUID,RouteName,DepartureStopNameZh,DestinationStopNameZh`,
  'tra-station': `basic/v3/Rail/TRA/Station?$top=2`,
  'tra-live': `basic/v3/Rail/TRA/StationLiveBoard/Station/1210?$top=2`,
  'hsr-station': `basic/v2/Rail/THSR/Station?$top=2`,
  'metro-route': `basic/v2/Rail/Metro/StationOfRoute/TRTC?$top=1`,
  'metro-live': `basic/v2/Rail/Metro/LiveBoard/TRTC?$top=2`
};
// fetch called as a method of another object throws in Workers (Illegal invocation).
const fetchOf = deps => (...a) => (0, deps.fetchFn)(...a);
async function statusSample(env, name, dependencies) {
  // (A sample is a check: ours, whoever asks it.)
  const deps = { ...dependencies, by: 'dev' };
  const cut = text => String(text || '').slice(0, 6000);
  if (SAMPLES[name]) {
    const got = await tdxGet(env, SAMPLES[name], deps);
    return { name, status: got.status, state: got.state, body: cut(got.body) };
  }
  const key = new Request(`https://transit-cache.orbit/sample/${name}${deps.transit ? `?transit=${encodeURIComponent(deps.transit)}` : ''}`);
  // fresh=1: ask again now (after a key's settings changed).
  const hit = !deps.fresh && deps.cache && (await deps.cache.match(key).catch(() => null));
  if (hit) return { ...(await hit.json()), cached: true };
  let out;
  if (name === 'maas' || name === 'maas-local') {
    const token = await tdxAccess(env, deps.fetchFn, deps.now);
    if (!token) return { name, status: 503, body: 'no TDX key' };
    if (deps.by === 'dev' && !(await devTdxRoom(env, deps.now))) return { name, status: 429, body: 'DEV_TDX_CAP' };
    if (!paced(env, deps.now) || !(await myTurn(env))) return { name, status: 429, body: 'busy' };
    // maas-local: across Hsinchu (新竹車站 → 竹北 光明六路), where buses do the work.
    const to = name === 'maas' ? TO : { lat: 24.839, lon: 121.008 };
    // transit=: which of TDX's transit codes to allow (to learn what each one is).
    const codes = /^[0-9](,[0-9]){0,9}$/.test(deps.transit || '') ? deps.transit : '3,4,5,6,7,8,9';
    const params = new URLSearchParams({ origin: `${AT.lat},${AT.lon}`, destination: `${to.lat},${to.lon}`, gc: '1.0', top: '5', transit: codes, transfer_time: '0,60', first_mile_mode: '0', first_mile_time: '15', last_mile_mode: '0', last_mile_time: '15' });
    const r = await fetchOf(deps)(`${TDX_BASE}maas/routing?${params}`, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'Accept-Encoding': 'br, gzip' }, signal: timeout(15_000) });
    const read = await tdxBody(r);
    await tallyTdx(env, 'maas/routing', deps.now, deps.ctx, deps.by, read);
    const text = read.text;
    let parsed = null;
    try {
      parsed = parseTdxRoutes(JSON.parse(text)).map(p => ({ dur: p.dur, legs: p.legs.map(l => `${l.mode}:${l.short || l.name}:${l.from.name}>${l.to.name}`) }));
    } catch {}
    let shape = null;
    try {
      // What each section says it is: the parser's modes come from these.
      shape = (JSON.parse(text)?.data?.routes || []).map(rt => (rt.sections || []).map(x => [x.type, x.transport?.mode, x.transport?.type, x.transport?.category, x.transport?.name, x.travelSummary?.length, x.travelSummary?.duration].join('|')));
    } catch {}
    out = { name, status: r.status, body: cut(text), shape, parsed };
  } else if (name === 'google-route') {
    if (!googleKey(env) || !(await spend(env, 'routes', 1, deps.now, deps.ctx, { by: deps.by }))) return { name, status: 503, body: 'no key or cap' };
    const r = await fetchOf(deps)(ROUTES, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': googleKey(env), 'X-Goog-FieldMask': GOOGLE_ROUTE_FIELDS }, body: JSON.stringify(googleRouteBody(AT, TO)), signal: timeout(15_000) });
    const text = await r.text();
    let parsed = null;
    try {
      parsed = parseGoogleRoutes(JSON.parse(text), deps.now).map(p => ({ dur: p.dur, legs: p.legs.map(l => `${l.mode}:${l.short || l.name}:${l.from.name}>${l.to.name}`) }));
    } catch {}
    out = { name, status: r.status, body: cut(scrubKey(text, env)), parsed };
  } else return { code: 'NOT_FOUND', samples: [...Object.keys(SAMPLES), 'maas', 'maas-local', 'google-route'] };
  if (deps.cache) await deps.cache.put(key, new Response(JSON.stringify(out), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600' } })).catch(() => {});
  return out;
}
const scrubKey = (text, env) => [env.GOOGLE_MAPS_KEY, env.GOOGLE_WEATHER_KEY, env.GOOGLE_MAPS_BROWSER_KEY].filter(Boolean).reduce((t, k) => t.split(k).join('[key]'), text);

// ---- Route --------------------------------------------------------------------------------

// ---- Walks ----------------------------------------------------------------------------
//
// Walking from a spot to up to five others, by Google (it knows the lanes
// and short cuts OpenStreetMap's router doesn't: 210 m from 成功九街 to 成功國中's
// YouBike, not 485 round the block): its route matrix, an element each, or
// with `line=1` one walk with its line (Compute Routes). Each walk kept a
// month (streets don't move), so a walk asked once is never paid for again.
//   ?from=lat,lon&to=lat,lon;lat,lon…  → { walks: [{ dist, dur, poly? } | null], src }
const WALK_KEEP_S = 30 * 86_400;
async function walks(env, q, { fetchFn, ctx, now, cache, by }) {
  const ll = s => {
    const m = /^(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/.exec(s || '');
    return m && inTaiwan(Number(m[1]), Number(m[2])) ? { lat: Number(m[1]), lon: Number(m[2]) } : null;
  };
  const from = ll(q.get('from'));
  const tos = String(q.get('to') || '').split(';').filter(Boolean).slice(0, 5).map(ll);
  if (!from || !tos.length || tos.some(t => !t)) return [{ code: 'BAD_LOCATION' }, 400];
  const line = q.get('line') === '1' && tos.length === 1;
  const p5 = v => v.toFixed(5);
  const keyOf = t => new Request(`https://transit-cache.orbit/walk/${p5(from.lat)},${p5(from.lon)}/${p5(t.lat)},${p5(t.lon)}${line ? '/line' : ''}`);
  const out = await Promise.all(tos.map(async t => {
    try {
      const hit = cache && (await cache.match(keyOf(t)));
      return hit ? await hit.json() : null;
    } catch {
      return null;
    }
  }));
  const todo = tos.map((t, i) => (out[i] ? -1 : i)).filter(i => i >= 0);
  let src = 'cached';
  if (todo.length) {
    const sku = line ? 'routes' : 'matrix';
    if (!googleKey(env)) src = 'nokey';
    else if (!(await spend(env, sku, todo.length, now, ctx, { by }))) src = 'cap';
    else {
      const pt = p => ({ location: { latLng: { latitude: p.lat, longitude: p.lon } } });
      const secs = d => Number(String(d || '').replace('s', '')) || 0;
      try {
        if (line) {
          const r = await fetchFn(ROUTES, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': googleKey(env), 'X-Goog-FieldMask': 'routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline' }, body: JSON.stringify({ origin: pt(from), destination: pt(tos[0]), travelMode: 'WALK', languageCode: 'zh-TW', regionCode: 'tw', units: 'METRIC' }), signal: timeout(8000) });
          const j = r.ok ? await r.json() : null;
          const w = j?.routes?.[0];
          if (w) out[0] = { dist: Number(w.distanceMeters) || 0, dur: secs(w.duration), poly: w.polyline?.encodedPolyline || '' };
          src = r.ok ? 'google' : `http ${r.status}`;
        } else {
          const r = await fetchFn(MATRIX, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': googleKey(env), 'X-Goog-FieldMask': 'originIndex,destinationIndex,distanceMeters,duration,condition' }, body: JSON.stringify({ origins: [{ waypoint: pt(from) }], destinations: todo.map(i => ({ waypoint: pt(tos[i]) })), travelMode: 'WALK', languageCode: 'zh-TW', regionCode: 'tw', units: 'METRIC' }), signal: timeout(8000) });
          const j = r.ok ? await r.json() : null;
          for (const el of Array.isArray(j) ? j : []) {
            const i = todo[el.destinationIndex || 0];
            if (i != null && el.condition === 'ROUTE_EXISTS') out[i] = { dist: Number(el.distanceMeters) || 0, dur: secs(el.duration) };
          }
          src = r.ok ? 'google' : `http ${r.status}`;
        }
      } catch {
        src = 'error';
      }
      for (const i of todo) {
        if (!out[i] || !cache) continue;
        const put = cache.put(keyOf(tos[i]), new Response(JSON.stringify(out[i]), { headers: { 'Content-Type': 'application/json', 'Cache-Control': `max-age=${WALK_KEEP_S}` } })).catch(() => {});
        if (ctx?.waitUntil) ctx.waitUntil(put);
        else await put;
      }
    }
  }
  return [{ walks: out, src }, 200];
}

// Anything that throws is that ask's failure, said in JSON with the CORS headers (never the Worker's 1101 page).
export async function handleTransit(request, env, headers, path, opts = {}) {
  try {
    return await transitRoute(request, env, headers, path, opts);
  } catch {
    return new Response(JSON.stringify({ code: 'TRANSIT_FAILED' }), { status: 502, headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8' } });
  }
}
async function transitRoute(request, env, headers, path, { session = null, limited = () => false, ctx = null, fetchFn = fetch, cache = globalThis.caches?.default, now = Date.now() } = {}) {
  const send = (data, status = 200, extra = {}) => new Response(typeof data === 'string' ? data : JSON.stringify(data), { status, headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8', ...extra } });
  if (request.method !== 'GET') return send({ code: 'GET_ONLY' }, 405);
  const q = new URL(request.url).searchParams;
  // (Who spends Google's and TDX's counts when it isn't a person: our tools, the showcase's demo.)
  const by = session?.dev ? 'dev' : session?.showcase ? 'show' : '';
  const deps = { fetchFn, ctx, now, cache, by };
  if (path === '/transit/status') {
    const sample = q.get('sample');
    if (!sample) return send({ month: billingMonth(now), used: await usage(env, now), caps: CAPS, keys: { tdx: Boolean(env.TDX_CLIENT_ID && env.TDX_CLIENT_SECRET), mapsBrowser: Boolean(env.GOOGLE_MAPS_BROWSER_KEY), google: Boolean(googleKey(env)) }, tdxPerMin: Number(env.TDX_PER_MIN) || 5 });
  }
  if (path === '/transit/showcase-map') {
    // The showcase's Transit demo draws Google's map like the real app: one
    // map load, from its own small share and the month's cap; NLSC's past either.
    const google = SHOWCASE_ORIGINS.has(request.headers.get('Origin') || '') && Boolean(env.GOOGLE_MAPS_BROWSER_KEY) && !limited() && (await usage(env, now)).maps < CAPS.maps && (await spend(env, 'showcaseMaps', 1, now, ctx)) && (await spend(env, 'maps', 1, now, ctx, { by: 'show' }));
    return send({ map: google ? { provider: 'google', key: env.GOOGLE_MAPS_BROWSER_KEY } : { provider: 'nlsc' } });
  }
  if (!session) return send({ code: 'ECO_TOKEN_INVALID' }, 401);
  if (limited()) return send({ code: 'RATE_LIMITED' }, 429);
  if (session.showcase) {
    if (path === '/transit/status') return send({ code: 'ECO_TOKEN_INVALID' }, 401);
    if (!(await spend(env, 'showcaseAsks', 1, now, ctx))) return send({ code: 'CAP_REACHED' }, 429);
    if (SHOWCASE_PAID.has(path) && !(await spend(env, 'showcasePaid', 1, now, ctx))) return send({ code: 'CAP_REACHED' }, 429);
  }
  // A sample spends a real ask (Google's routes, TDX's points): a session's or the dev door's, never anyone's.
  if (path === '/transit/status') return send(await statusSample(env, q.get('sample'), { ...deps, fresh: q.get('fresh') === '1', transit: q.get('transit') || '' }));
  if (path === '/transit/config') {
    // One map load per call (the app asks once each time it opens).
    // (A dev page gets NLSC's map: the browser key works only on the site, and no map load is spent;
    // unless it asks ?map=google, as the preview's screenshots do, seen as the site.)
    const google = (!session.dev || q.get('map') === 'google') && Boolean(env.GOOGLE_MAPS_BROWSER_KEY) && (!session.showcase || (await spend(env, 'showcaseMaps', 1, now, ctx))) && (await spend(env, 'maps', 1, now, ctx, { by }));
    return send({ map: google ? { provider: 'google', key: env.GOOGLE_MAPS_BROWSER_KEY } : { provider: 'nlsc' }, search: googleKey(env) ? 'google' : 'osm', tdx: Boolean(env.TDX_CLIENT_ID) });
  }
  if (path === '/transit/running') {
    const got = await running(env, q.get('city') || '', deps);
    return send(got.body, got.status);
  }
  if (path === '/transit/eta') {
    const got = await etaRows(env, q, deps);
    // (Its age to a tenth of a second: the phone learns from it when each estimate can be read.)
    return send(got.body, got.status, got.age != null ? { 'X-Transit-Age': String(Math.round(got.age / 100) / 10) } : {});
  }
  if (path === '/transit/gps') {
    const got = await gpsRows(env, q, deps);
    return send(got.body, got.status, got.age != null ? { 'X-Transit-Age': String(Math.round(got.age / 100) / 10), 'X-Transit-Cache': got.state || '' } : {});
  }
  if (path === '/transit/tdx') {
    // (`had=<s>`: the phone's copy that many seconds old, so a copy here no
    // newer is no use to it: TDX read then (given 3 s, then the copy), as
    // /transit/eta's. A route's buses' places, asked once each 20 s they can
    // move (Transit bus.mjs routeGps): the copy here was always a step old.)
    const had = Number(q.get('had')) || 0;
    const got = await tdxGet(env, q.get('p') || '', had > 0 ? { ...deps, stale: 0, young: Math.max(0, had * 1000 - 1500) } : deps);
    return send(got.body || '{}', got.status, { 'X-Transit-Cache': got.state, ...(got.age != null ? { 'X-Transit-Age': String(Math.round(got.age / 1000)) } : {}) });
  }
  if (path === '/transit/search') return send(await search(env, q, deps));
  if (path === '/transit/place') {
    const [body, status] = await place(env, q, deps);
    return send(body, status);
  }
  if (path === '/transit/route') {
    const [body, status] = await routes(env, q, deps);
    return send(body, status);
  }
  if (path === '/transit/walk') {
    const [body, status] = await walks(env, q, deps);
    return send(body, status);
  }
  return send({ code: 'NOT_FOUND' }, 404);
}
