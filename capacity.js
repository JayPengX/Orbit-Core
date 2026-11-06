// How many people use Orbit, and whether the plans the family
// runs on hold at that many: the admin panel's 容量 (開發), and the Worker's
// own adjustment when 依人數自動調整 is on.
//
// The budget that grows with every person is Cloudflare's Workers Paid plan
// ($5: 10M requests a month for the whole account, both Workers and every
// app; guard.js stops both proxies at 90% of it, so nothing is ever billed
// past the $5):
// each phone asks again every few seconds while something is live, so the
// requests a day are people × how long they watch ÷ how often they ask.
// The live refresh settings (kit/brand.mjs DEV) are what can give: when the
// people expected would run past the plan, every one of them is slowed by
// the same factor (never past its own slowest), and back to the owner's own
// numbers once there's room.
//
// The others are shown with how many people they hold: TDX (its points a
// month: shared by the Worker's cache, so they grow with how many stops are
// watched, not people, and tdxGuard in transit.js already slows it), Google
// Maps (each SKU's free monthly cap, by Transit's people) and Google Weather
// (its daily cap, by place, not person).

import { DEV } from './kit/brand.mjs';
import { PLAN, STOP_AT } from './guard.js';

const DAY = 86_400_000;
const HOUR = 3_600_000;
// The plan a day: guard.js's stop (90% of 10M a month) over a 31-day month;
// and the share left after the rest (opening pages, the crons, Weather).
export const CF_DAY = 290_000;
export const CF_SHARE = 0.8;
// What one person who used an app that day does in it, in minutes on a
// screen that refreshes itself (a guess the measurements below correct as
// they come: kept small so it errs towards slowing down early), and the
// requests that aren't refreshes (opening, syncing, a search).
export const WATCH = {
  sportsList: { app: 'match', min: 40 },
  sportsGame: { app: 'match', min: 15 },
  f1Board: { app: 'match', min: 4 },
  f1Feed: { app: 'match', min: 6 },
  transitLive: { app: 'transit', min: 12 },
  transitBike: { app: 'transit', min: 8 }
};
export const BASE_REQ = { match: 60, stock: 60, transit: 40, weather: 12, orbit: 10, vocab: 10, beats: 2, money: 4 };
// The settings that may be slowed (the live refreshes on the phones).
export const SCALED = Object.keys(WATCH);
// Of a week's people, about this share open an app on a given day (until the
// day's own count says more).
const DAILY = 0.55;

// People: active today, this week and month, per app this week, and how many
// are expected in 30 days (the last two weeks' new passes, carried on).
export function estimateUsers({ active = {}, apps = {}, newWeek = 0, newPrev = null } = {}) {
  const week = active.week || 0;
  const pace = newPrev == null ? newWeek : (newWeek + newPrev) / 2;
  const expected = Math.round(week + (Math.max(0, pace) * 30) / 7);
  const growth = week ? expected / week : 1;
  // Each app's people on a day: its week's share of the day, the day's own count when higher.
  const ratio = week ? Math.max(DAILY, (active.day || 0) / week) : DAILY;
  const daily = {};
  for (const [app, a] of Object.entries(apps)) daily[app] = (a.week || 0) * ratio;
  return { day: active.day || 0, week, month: active.month || 0, expected, growth, ratio, daily };
}

// Requests a day on Cloudflare at these settings, for these people per app.
export function cfLoad(dev, daily, factor = 1) {
  let n = 0;
  const by = {};
  for (const [app, people] of Object.entries(daily)) {
    const base = (BASE_REQ[app] || 10) * people * factor;
    by[app] = (by[app] || 0) + base;
    n += base;
  }
  for (const [k, w] of Object.entries(WATCH)) {
    const every = Math.max(1, dev[k] || DEV[k].def);
    const r = ((w.min * 60) / every) * (daily[w.app] || 0) * factor;
    by[w.app] = (by[w.app] || 0) + r;
    n += r;
  }
  return { total: Math.round(n), by: Object.fromEntries(Object.entries(by).map(([k, v]) => [k, Math.round(v)])) };
}

// The factor the live refreshes need for `people` (×growth of today's) to
// fit the plan: 1 when they fit at the owner's numbers.
export function scaleFor(base, daily, factor = 1) {
  const budget = CF_DAY * CF_SHARE;
  const all = cfLoad(base, daily, factor).total;
  if (all <= budget) return 1;
  // Only the refreshes slow; what isn't one stays.
  const fixed = cfLoad(Object.fromEntries(SCALED.map(k => [k, Infinity])), daily, factor).total;
  const refresh = all - fixed;
  const room = budget - fixed;
  return room > 0 ? Math.round((refresh / room) * 100) / 100 : Infinity;
}

// The settings to run: the owner's own (`base`), each live refresh slowed by
// `scale`, never past its own slowest.
export function applyScale(base, scale) {
  const out = { ...base };
  if (!(scale > 1)) return out;
  for (const k of SCALED) out[k] = Math.min(DEV[k].max, Math.ceil((base[k] ?? DEV[k].def) * scale));
  return out;
}

// ---- Each quota, from what was really used ----
// The model above is a guess of minutes on a screen; the panel's 撐得住 is
// worked out from the bill itself. For every quota: its use a day, the part
// that is there whoever comes (the crons, the builders, the guard) and the
// part that grows with people; the people it holds = this week's people ×
// (room left after the fixed part ÷ what people use now). The fewest is the
// family's limit, and the quota that sets it is named.

// Workers' requests and CPU a day, what people use and the rest: the last 7
// days hour by hour (guard.js useByHour). People's: the proxy's requests from
// the apps' pages on the family's domain, in any country (`who: 'caller'`,
// the Workers Logs' share), else those answered near Taiwan (`'place'`); the
// rest is there whoever comes (the crons, the builders, our own tools and
// checks: 2026-11-06, most of the week's CPU), so it's fixed.
// Without people's part read (`near` false: an older guard, analytics without
// it), the steady floor: the quietest tenth of the hours is what runs with
// nobody there, × 24 a day, and what people add at least a tenth of the day,
// so the people it holds err low. Under 5 days of hours: unknown.
export const QUIET = 0.1;
export function splitHours(h, now = Date.now()) {
  const rows = h?.hours;
  if (!Array.isArray(rows)) return null;
  const end = Math.floor(now / HOUR) * HOUR;
  const from = end - 7 * DAY;
  const seen = rows.filter(r => r[0] >= from && r[0] < end);
  if (seen.length < 5 * 24) return null;
  const near = h.people === true && seen.every(r => r.length >= 5);
  const out = {};
  for (const [i, k] of [[1, 'requests'], [2, 'cpuMs']]) {
    const v = new Array(7 * 24).fill(0);
    for (const r of seen) v[Math.floor((r[0] - from) / HOUR)] = r[i] || 0;
    const day = v.reduce((a, b) => a + b, 0) / 7;
    if (near) {
      const people = Math.min(day, seen.reduce((a, r) => a + (r[i + 2] || 0), 0) / 7);
      out[k] = { day, fixed: day - people, people, near: true, who: h.who === 'caller' ? 'caller' : 'place' };
      continue;
    }
    const quiet = [...v].sort((a, b) => a - b)[Math.floor(v.length * QUIET)];
    const fixed = Math.min(day, quiet * 24);
    out[k] = { day, fixed, people: Math.max(day - fixed, day * 0.1), near: false };
  }
  return out;
}

// Too few people a week to tell what one uses (FEW: the owner and a friend,
// testing everything, ~17 s of CPU a day each on 2026-11-06): every quota's
// people then by a typical person's use instead (TYPICAL_DAY), the headline the
// fewest of them, named. One recipe for every quota: on about half the days
// (ACTIVE) a person opens Orbit, and that day uses three apps' whole sessions
// (Transit opened twice), 45 minutes of live screens (a bus stop's card,
// Transit's map, a live game: a third each), plans a trip, and every other
// such day searches a place. What each of those costs was measured on the
// live Worker on 2026-11-06 (tools/speed.mjs, tools/preview.mjs --live
// --requests, at 新竹車站, whose stops have three cities' buses: a quieter
// stop costs less, so the people held err low):
//   CPU: a session 28–491 ms (three 0.47 s), a stop card 6.7 s an hour,
//     Transit's map 1.2 s, a live game nothing (ESPN from the phone);
//   requests: a session ~30, a stop card ~30 a minute, the map ~15;
//   TDX: an opening of Transit and a stop card 0.0187 points (stations,
//     operators' notices, each city's first asks) and the city's YouBike
//     counts the Worker keeps warm for 10 minutes after (5 reads, 0.0033;
//     transit.js WARM_FOR), then a stop card 0.54 points an hour, the map
//     0.20, a planned trip 0.02 (TDX's reads aren't shared here: one
//     person's alone, so it errs low). The map's bus stops are the weekly
//     station tiles' (no TDX search around each spot since 2026-11-06);
//   Google: an opening of Transit a map load; a search 3 asks as it's typed
//     (each one Autocomplete and Text Search, the place picked 1 Place
//     Details); a Google place tapped on the map its name (Pro); a trip 2
//     route asks; walks from a spot not walked from before 5 (a known
//     spot's are kept a month: none).
// Cloudflare's other counts move with the requests (kept use, the crons' own):
// each at its own rate a request. Gemini is behind a tap and the owner's
// own cap a day: shown at the use seen, never the headline here.
export const FEW = 10;
export const ACTIVE = 0.5;
// A person's use on a day they open Orbit.
export const TYPICAL_DAY = {
  'cf:cpuMs': 2400,
  'cf:requests': 800,
  'maps:maps': 2,
  'maps:autocomplete': 1.5,
  'maps:textSearch': 1.5,
  'maps:details': 0.5,
  'maps:detailsPro': 0.5,
  'maps:routes': 2,
  'maps:matrix': 5,
  'tdx:points': 2 * (0.0187 + 5 / 1500) + (13 / 60) * 0.54 + (15 / 60) * 0.2 + 0.02
};
// (A week's person, a day: 1.2 s of CPU.)
export const TYPICAL_CPU_MS = TYPICAL_DAY['cf:cpuMs'] * ACTIVE;
// The people a quota holds: this week's × room ÷ use (null with nobody yet or nothing used).
const holdsOf = (week, room, use) => (week > 0 && use > 0 ? Math.max(0, Math.floor((week * room) / use)) : null);
// …and at a typical person's use (`one`: theirs over the same span as `room`).
const holdsBy = (room, one) => (one > 0 ? Math.max(0, Math.floor(room / one)) : null);

// Every quota as a row: { key, kind, name, used, cap, day, fixedDay,
// perPerson, holds, by }. `by`: 'people' (grows with them),
// 'place' (Google Weather: by area), 'store' (what's kept).
export function quotas({ users = {}, guard = null, hours = null, usage = {}, maps = {}, now = Date.now() }) {
  const week = users.week || 0;
  // (Too few this week to tell what one uses: by a typical person's, TYPICAL_DAY.)
  const few = week > 0 && week < FEW;
  const rows = [];
  const tw = new Date(now + 8 * HOUR);
  const monthDays = new Date(Date.UTC(tw.getUTCFullYear(), tw.getUTCMonth() + 1, 0)).getUTCDate();
  // A typical person's use of a quota, a day (the week's days averaged).
  const typicalOf = key => (TYPICAL_DAY[key] != null ? TYPICAL_DAY[key] * ACTIVE : null);
  // Cloudflare's $5 plan (the guard's last read of the bill).
  if (guard?.use) {
    const planOf = guard.plan || PLAN;
    const stop = guard.stopAt ?? STOP_AT;
    const p = guard.period;
    const pdays = p ? (p.end - p.from) / DAY : 31;
    const split = splitHours(hours, now);
    // (The counts read only as the period's total move with the requests: the
    // part that's people's is the requests' share from who called, and a
    // person's is their requests' worth of it.)
    const req = split?.requests;
    const reqDay = req ? req.day : (guard.projected?.requests ?? guard.use.requests ?? 0) / pdays;
    for (const k of Object.keys(PLAN)) {
      if (planOf[k] == null) continue;
      const cap = planOf[k] * stop;
      if (/Bytes$/.test(k)) {
        rows.push({ key: `cf:${k}`, kind: 'cf', count: k, used: guard.use[k] || 0, cap, by: 'store' });
        continue;
      }
      const s = split?.[k];
      // A day's use: the last 7 days' where they were read, else the period's pace.
      const day = s ? s.day : (guard.projected?.[k] ?? guard.use[k] ?? 0) / pdays;
      const via = !s && req?.near && req.day > 0;
      const fixedDay = s ? s.fixed : via ? (day * req.fixed) / req.day : 0;
      const people = day - fixedDay;
      const capDay = cap / pdays;
      const typical = typicalOf(`cf:${k}`) ?? (reqDay > 0 ? (day / reqDay) * typicalOf('cf:requests') : null);
      // (A typical person on top of today's use when its fixed part isn't known: all of it counted fixed, erring low.)
      // (Nobody is slowed before this many either: guard.js paces only a
      // count that would reach the stop before the period ends.)
      rows.push({ key: `cf:${k}`, kind: 'cf', count: k, by: 'people', measured: s ? true : via ? 'requests' : false, near: !!s?.near, used: guard.use[k] || 0, projected: guard.projected?.[k] ?? null, cap, day, capDay, fixedDay, peopleDay: people, perPerson: week ? people / week : null, holds: holdsOf(week, capDay - fixedDay, people), typical, typicalHolds: holdsBy(capDay - (s || via ? fixedDay : day), typical) });
    }
  }
  // Gemini: each feature's cap a day against its busiest day of the week.
  for (const a of usage.ai || []) {
    const days = a.days || [];
    const top = days.length ? Math.max(...days) : 0;
    rows.push({ key: `ai:${a.key}`, kind: 'ai', count: a.key, by: 'people', used: days.at(-1) || 0, top, cap: a.cap || 0, paused: !a.cap, perPerson: week ? top / week : null, holds: a.cap ? holdsOf(week, a.cap, top) : null });
  }
  // Google Maps (Transit): each SKU's free month against this month carried to its end,
  // what our tools and the showcase's demo spent of it (`fixed`) taken off first.
  // (The showcase's own shares are its demo's, not people's: left out.)
  for (const [k, m] of Object.entries(maps)) {
    if (k.startsWith('showcase')) continue;
    const fixed = Math.min(m.month, m.fixed || 0);
    const typical = typicalOf(`maps:${k}`);
    rows.push({ key: `maps:${k}`, kind: 'maps', count: k, by: 'people', used: m.used, month: m.month, fixedMonth: fixed, cap: m.cap, perPerson: week ? (m.month - fixed) / week : null, holds: holdsOf(week, m.cap - fixed, m.month - fixed), typical, typicalHolds: typical == null ? null : holdsBy(m.cap - fixed, typical * monthDays) });
  }
  // Google Weather: shared by area (a 5 km square), not by person.
  if (usage.weather?.cap) rows.push({ key: 'weather:google', kind: 'weather', by: 'place', used: usage.weather.googleToday || 0, cap: usage.weather.cap });
  // TDX's month of points, carried to its end (Taiwan's month).
  const tdx = usage.tdx;
  if (tdx?.plan?.month) {
    const dayOf = tw.getUTCDate() - 1 + tw.getUTCHours() / 24 + tw.getUTCMinutes() / 1440;
    // (The first day's hours alone say too little: a day at least.)
    const carried = n => (n / Math.max(1, dayOf)) * monthDays;
    const month = carried(tdx.points || 0);
    // (Our tools' and the showcase's points, taken off as Maps' are.)
    const fixed = Math.min(month, carried((tdx.devPoints || 0) + (tdx.showPoints || 0)));
    const typical = typicalOf('tdx:points');
    rows.push({ key: 'tdx:points', kind: 'tdx', by: 'people', used: tdx.points || 0, month, fixedMonth: fixed, cap: tdx.plan.month, slowed: !!tdx.guard?.why, perPerson: week ? (month - fixed) / week : null, holds: holdsOf(week, tdx.plan.month - fixed, month - fixed), typical, typicalHolds: holdsBy(tdx.plan.month - fixed, typical * monthDays) });
  }
  // Few people: each quota's people at a typical person's use (what this
  // week's few used: `seen`); Gemini's (no typical use) not the headline.
  if (few) for (const r of rows) if (r.typical != null) Object.assign(r, { seen: r.holds, holds: r.typicalHolds, byTypical: true });
  const least = (f, ok = () => true) => rows.filter(r => r.by === 'people' && r[f] != null && !r.paused && ok(r)).reduce((a, r) => (!a || r[f] < a[f] ? r : a), null);
  const h = least('holds', r => !few || r.byTypical);
  const t = least('typicalHolds');
  const split = splitHours(hours, now);
  // (By typical use, every quota: the fewest people, and which.)
  const typical = t ? { people: t.typicalHolds, key: t.key, ms: TYPICAL_CPU_MS, few } : null;
  return { rows, week, holds: h ? { people: h.holds, key: h.key } : null, typical, measured: !!split, near: !!split?.cpuMs?.near, who: split?.cpuMs?.who || null };
}

// What the panel shows and the cron applies: people, each budget against
// them, and the settings for the people expected.
export function plan({ users, base, inUse = base, usage = {}, guard = null, hours = null, now = Date.now() }) {
  const scale = scaleFor(base, users.daily, users.growth);
  const applied = applyScale(base, Number.isFinite(scale) ? scale : Infinity);
  // Today's people at the settings running now.
  const nowLoad = cfLoad(inUse, users.daily);
  const thenLoad = cfLoad(applied, users.daily, users.growth);
  // Requests a day for each person of the week (not all open every app every day).
  const perPerson = users.week ? nowLoad.total / users.week : 0;
  // How many people of a week the plan holds at the owner's numbers.
  const one = cfLoad(base, Object.fromEntries(Object.entries(users.daily).map(([k, v]) => [k, users.week ? v / users.week : DAILY]))).total;
  const holds = one ? Math.floor((CF_DAY * CF_SHARE) / one) : null;
  // Google Maps by Transit's people: the month so far, carried to its end.
  const tw = new Date(now + 8 * 3_600_000);
  const dayOf = tw.getUTCDate();
  const monthDays = new Date(Date.UTC(tw.getUTCFullYear(), tw.getUTCMonth() + 1, 0)).getUTCDate();
  const maps = {};
  for (const [k, v] of Object.entries(usage.transit || {})) {
    if (!v?.cap) continue;
    const month = (v.used / Math.max(1, dayOf)) * monthDays;
    // (What our tools and the showcase's demo spent: not people's.)
    const fixed = Math.min(month, (((v.dev || 0) + (v.show || 0)) / Math.max(1, dayOf)) * monthDays);
    const people = month - fixed;
    maps[k] = { used: v.used, cap: v.cap, month: Math.round(month), fixed: Math.round(fixed), expected: Math.round(fixed + people * users.growth), holds: users.apps?.transit && people ? Math.floor(((v.cap - fixed) / people) * users.apps.transit) : null };
  }
  const weather = usage.weather?.cap ? { today: usage.weather.googleToday || 0, cap: usage.weather.cap } : null;
  return {
    at: now,
    users: { ...users, apps: users.apps },
    cf: { budget: CF_DAY * CF_SHARE, plan: CF_DAY, now: nowLoad, expected: thenLoad, perPerson: Math.round(perPerson), holds },
    scale: Number.isFinite(scale) ? scale : null,
    over: !Number.isFinite(scale) || SCALED.some(k => applied[k] >= DEV[k].max && (base[k] ?? DEV[k].def) * scale > DEV[k].max),
    applied,
    maps,
    weather,
    tdx: usage.tdx ? { month: usage.tdx.points, ours: (usage.tdx.devPoints || 0) + (usage.tdx.showPoints || 0), plan: usage.tdx.plan?.month, guard: usage.tdx.guard } : null,
    // Every quota from what was really used, and the people each holds.
    quotas: quotas({ users, guard, hours, usage, maps, now })
  };
}

// People from the wallets (eco-admin's overview counts the same way).
export function usersFrom(list, now, lastUsed, appsOf) {
  const active = ms => list.filter(w => now - lastUsed(w) < ms).length;
  const apps = {};
  for (const w of list)
    for (const a of appsOf(w)) {
      apps[a.app] ||= { users: 0, week: 0 };
      apps[a.app].users++;
      if (now - (a.last || 0) < 7 * DAY) apps[a.app].week++;
    }
  const newWeek = list.filter(w => now - (w.created || 0) < 7 * DAY).length;
  const newPrev = list.filter(w => now - (w.created || 0) >= 7 * DAY && now - (w.created || 0) < 14 * DAY).length;
  const u = estimateUsers({ active: { day: active(DAY), week: active(7 * DAY), month: active(30 * DAY) }, apps, newWeek, newPrev });
  return { ...u, newWeek, newPrev, apps: Object.fromEntries(Object.entries(apps).map(([k, v]) => [k, v.week])) };
}
