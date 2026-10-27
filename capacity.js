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

const DAY = 86_400_000;
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

// What the panel shows and the cron applies: people, each budget against
// them, and the settings for the people expected.
export function plan({ users, base, inUse = base, usage = {}, now = Date.now() }) {
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
    maps[k] = { used: v.used, cap: v.cap, month: Math.round(month), expected: Math.round(month * users.growth), holds: users.apps?.transit && month ? Math.floor((v.cap / month) * users.apps.transit) : null };
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
    tdx: usage.tdx ? { month: usage.tdx.points, plan: usage.tdx.plan?.month, guard: usage.tdx.guard } : null
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
