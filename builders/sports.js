// Every league's season from ESPN, for Orbit Sports and Quadra Play: a
// season's games come from here, not through the data proxy (a season's page
// is 6 MB: parsing them froze phones). Built each night by the proxy
// (builders/run.js, 16:17 UTC: midnight in Taiwan) into the family's data
// (R2).
//
// Lean: a league-year's months already over are kept from its last pack, ESPN
// read only from the month ten days back (and any earlier month with a game
// not over); one league at a time (a pack's whole season in memory); each
// file written only when it changed (builders/store.js).
//
// → sports/<league>/<year>.json ({ leagues: [the league, its calendar],
// events }, slimmed); sports/<league>/days.json (the kept season's game days,
// Taiwan's, and its askable bounds); sports/index.json; sports/bounds.json
// (every league's askable days, Asia's from their months).
//
// A league-year with a month that can't be read isn't written (the last
// pack stays). A year no longer kept goes.

import { CATALOG, asiaMonthUrl } from '../kit/catalog.mjs';
import { mirrorPath } from '../kit/mirror.mjs';
import { twDay } from '../kit/format.mjs';
import { asiaBaseballResponse } from '../asia-baseball.js';
import { keptFrom, seasonBounds, seasonState, yearSeason } from './season.js';
import { within } from './within.js';

const SITE = 'https://site.api.espn.com/apis/site/v2/sports';
const DAY = 86_400_000;

// What no app reads of a scoreboard (the heavy part of it).
const DROP = new Set(['links', 'logos', 'leaders', 'statistics', 'headlines', 'odds', 'tickets', 'geoBroadcasts', 'uid', '$ref', 'guid', 'format', 'situation', 'recent', 'alternateIds', 'playByPlayAvailable', 'wasSuspended', 'highlights']);
export function slim(x) {
  if (Array.isArray(x)) return x.map(slim);
  if (!x || typeof x !== 'object') return x;
  const out = {};
  for (const [k, v] of Object.entries(x)) if (!DROP.has(k)) out[k] = slim(v);
  // A team's logo kept as the one the apps use (logo, else the first of logos).
  if (!out.logo && Array.isArray(x.logos) && x.logos[0]?.href) out.logo = x.logos[0].href;
  return out;
}

// The years a league's packs cover now: this one and the next; and the last
// while the league's season began in it (the NBA's, Europe's football's:
// Sports counts a matchweek from the season's start), or while last season
// is kept (season.mjs, the owner's rule: until a game of this one
// is played, preseason too; `lastKept`). `start`: the season's start (ESPN's scoreboard),
// unknown → until July as before.
export function yearsAt(now = new Date(), start = NaN, lastKept = false) {
  const y = now.getUTCFullYear();
  const last = lastKept || (Number.isFinite(start) ? start < Date.UTC(y, 0, 1) : now.getUTCMonth() < 6);
  return [...(last ? [y - 1] : []), y, y + 1];
}

// The first month (1-12) to read again: the one ten days back, or an earlier
// one with a game not over (put back, or yet to be played). 1 without a pack.
export function firstUnsettled(old, year, now = Date.now()) {
  if (!old?.events) return 1;
  const recent = new Date(now - 10 * DAY);
  let first = recent.getUTCFullYear() > year ? 13 : recent.getUTCFullYear() < year ? 1 : recent.getUTCMonth() + 1;
  for (const e of old.events) {
    const state = e.status?.type?.state || e.competitions?.[0]?.status?.type?.state;
    const d = new Date(e.date);
    if (state !== 'post' && d.getUTCFullYear() === year) first = Math.min(first, d.getUTCMonth() + 1);
  }
  return first;
}

async function leagueYear(page, espn, year, old = null, now = Date.now()) {
  const head = await page(`${SITE}/${espn}/scoreboard?dates=${year}&limit=1`);
  const seen = new Map();
  const from = firstUnsettled(old, year, now);
  for (let m = from; m <= 12; m++) {
    const data = await page(`${SITE}/${espn}/scoreboard?dates=${year}${String(m).padStart(2, '0')}&limit=1000`);
    for (const e of data.events || []) if (!seen.has(e.id)) seen.set(e.id, slim(e));
  }
  // The months before, as last night (a day's grace past the first month read:
  // a late game there is on its US day's page, the month before's).
  const carryTo = from > 12 ? Infinity : Date.UTC(year, from - 1, 2);
  let carried = 0;
  if (from > 1) for (const e of old.events) if (!seen.has(e.id) && Date.parse(e.date) < carryTo) seen.set(e.id, e), carried++;
  const events = [...seen.values()].filter(e => String(e.date || '').startsWith(String(year)) || !e.date).sort((a, b) => String(a.date).localeCompare(String(b.date)));
  return { leagues: slim((head.leagues || []).slice(0, 1)), events, carried, read: Math.max(0, 13 - from) };
}

// The kept seasons' game days as Taipei dates ('YYYY-MM-DD'), from `start`
// (season.mjs keptFrom; unknown: every day given); a game called off left out.
export function seasonDays(events, start = NaN) {
  const from = Number.isFinite(start) ? start - DAY : -Infinity;
  const days = new Set();
  for (const e of events) {
    const t = Date.parse(e.date || '');
    const state = e.status?.type || e.competitions?.[0]?.status?.type || {};
    if (!Number.isFinite(t) || t < from || /postponed|canceled|cancelled|abandoned/i.test(state.name || state.description || '')) continue;
    days.add(twDay(t));
  }
  return [...days].sort();
}

// Where a season's last games can fall before they're scheduled: a league
// with playoffs (America's, MLS too) ESPN's season end; a cup its final's
// (the calendar's last stage); a football league or F1, its schedule is
// whole (NaN: its last game).
export function lastPossible(l, board) {
  const L = board?.leagues?.[0];
  const stage = (L?.calendar || []).flatMap(c => (c && typeof c === 'object' ? c.entries || [] : [])).at(-1);
  if (stage?.startDate) return Date.parse(stage.startDate);
  if (l.espn.startsWith('racing/') || (l.espn.startsWith('soccer/') && l.espn !== 'soccer/usa.1')) return NaN;
  return Date.parse(L?.season?.endDate || '');
}
// Asia's leagues' askable days (their own month lists, no ESPN): from the
// kept year's first game (season.mjs yearSeason: this year's once begun),
// to this year's last game listed, the end of November at the earliest
// (its playoffs are listed as they're set). Unread: March of the kept year on.
export async function asiaBounds(league, asiaMonth, now = Date.now()) {
  const pad = m => String(m).padStart(2, '0');
  const month = async (yy, m) => ((await asiaMonth(league, `${yy}-${pad(m)}`)) || []).filter(g => g.state !== 'void' && Date.parse(g.start));
  // A year's first game (its opening is in spring) and its last (autumn's), a month at a time.
  const firstOf = async yy => {
    for (let m = 1; m <= 6; m++) {
      const games = await month(yy, m);
      if (games.length) return { games, t: Math.min(...games.map(g => Date.parse(g.start))) };
    }
    return { games: [], t: NaN };
  };
  const y = new Date(now + 8 * 3_600_000).getUTCFullYear();
  const now0 = await firstOf(y);
  const from = yearSeason(now0.games, now).begun ? now0.t : (await firstOf(y - 1)).t;
  let last = Date.UTC(y, 10, 30);
  for (let m = 12; m >= 9; m--) {
    const games = await month(y, m);
    if (games.length) {
      last = Math.max(last, ...games.map(g => Date.parse(g.start)));
      break;
    }
  }
  if (Number.isFinite(from)) return { from: twDay(from), to: twDay(last) };
  // Its lists unread from here (CPBL's site turns servers away): the
  // calendar's, from March of the kept year (no season opens earlier).
  return { from: `${yearSeason([], now).begun ? y : y - 1}-03-01`, to: twDay(last) };
}

export const SPORTS_HOUR = 16;
export async function runSports({ store, get = fetch, now = Date.now(), sleep = ms => new Promise(r => setTimeout(r, ms)), only = [] }) {
  const page = async url => {
    for (let attempt = 0; ; attempt++) {
      try {
        return await within(60_000, async signal => {
          const res = await get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (orbit-sports-pack)' }, signal });
          if (res.status === 200) return res.json();
          throw new Error(`HTTP ${res.status}`);
        });
      } catch (error) {
        if (attempt >= 3) throw new Error(`${url}: ${error.message}`);
        await sleep(2000 * (attempt + 1));
      }
    }
  };
  // Asia's months: the whole copy kept in R2 (builders/asia.js), else the route's.
  const asiaMonth = async (league, ym) => {
    const url = asiaMonthUrl(league, ym);
    const copy = await store.json(`${mirrorPath(url, '')}.gz`).catch(() => null);
    if (copy?.data?.games) return copy.data.games;
    return (await (await asiaBaseballResponse(new URL(url))).json().catch(() => null))?.games || [];
  };
  const leagues = Object.entries(CATALOG).filter(([key, l]) => l.data === 'espn' && l.espn && (!only.length || only.includes(key)));
  const built = new Date(now).toISOString();
  const old = (await store.json('sports/index.json')) || { leagues: {} };
  const index = { built, leagues: {} };
  const failed = [];
  const y = new Date(now).getUTCFullYear();
  for (const [key, l] of leagues) {
    const entry = (index.leagues[key] = { espn: l.espn, years: {} });
    const all = [];
    const board = await page(`${SITE}/${l.espn}/scoreboard?limit=1`).catch(() => null);
    const start = Date.parse(board?.leagues?.[0]?.season?.startDate || '');
    const end = Date.parse(board?.leagues?.[0]?.season?.endDate || '');
    // Last season kept while no game of this one is played (by the packs; unknown: kept).
    const packs = new Map();
    const pack = year => (packs.has(year) ? packs.get(year) : packs.set(year, store.json(`sports/${key}/${year}.json`).catch(() => null)).get(year));
    const events = (await Promise.all([y, y + 1].map(pack))).flatMap(p => p?.events || []);
    const season = seasonState(board, events, now);
    const years = yearsAt(new Date(now), start, season.begun !== true);
    for (const year of years) {
      try {
        // Next season's schedule: read once this season's last possible day
        // has passed; before that a year wholly after it is an empty pack.
        if (Date.UTC(year, 0, 1) > end && now < end) {
          await store.put(`sports/${key}/${year}.json`, { leagues: [], events: [], from: new Date(end).toISOString() });
          entry.years[year] = { events: 0, bytes: 0, from: new Date(end).toISOString() };
          continue;
        }
        const { carried: _c, read: _r, ...fresh } = await leagueYear(page, l.espn, year, await pack(year), now);
        const text = JSON.stringify(fresh);
        await store.put(`sports/${key}/${year}.json`, text);
        entry.years[year] = { events: fresh.events.length, bytes: text.length };
        all.push(...fresh.events);
      } catch {
        failed.push(`${key} ${year}`);
        // (Unread: last night's stays, and is still counted.)
        const had = old.leagues?.[key]?.years?.[year];
        if (had) (entry.years[year] = had), all.push(...((await pack(year))?.events || []));
      }
      packs.delete(year);
    }
    // A year no longer kept: gone.
    for (const year of Object.keys(old.leagues?.[key]?.years || {})) if (!(year in entry.years)) await store.delete(`sports/${key}/${year}.json`);
    const bounds = seasonBounds(all, season, lastPossible(l, board));
    if (bounds.from && bounds.to) entry.bounds = bounds;
    const gameDays = seasonDays(all, keptFrom(season)).filter(d => !bounds.to || d <= bounds.to);
    // (Dated by the day: the same days, the same file.)
    if (gameDays.length) await store.put(`sports/${key}/days.json`, { built: built.slice(0, 10), start: Number.isFinite(start) ? new Date(start).toISOString() : null, ...bounds, days: gameDays });
  }
  // Most of it missing: something's wrong (ESPN down): the index as it was.
  if (failed.length > leagues.length) return { failed };
  await store.put('sports/index.json', index);
  if (!only.length) {
    const askable = Object.fromEntries(Object.entries(index.leagues).filter(([, v]) => v.bounds).map(([k, v]) => [k, v.bounds]));
    for (const [key, l] of Object.entries(CATALOG).filter(([, l]) => l.asia)) {
      const b = await asiaBounds(l.asia, asiaMonth, now).catch(() => null);
      if (b) askable[key] = b;
    }
    await store.put('sports/bounds.json', { built: built.slice(0, 10), leagues: askable });
  }
  return { leagues: leagues.length, failed };
}
