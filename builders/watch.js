// What each game of the season can be watched as, for Orbit Sports: its
// official highlights on YouTube, ELTA.tv's whole game, Apple TV's page of an
// MLS game. Built by the proxy's cron (builders/run.js) into the family's
// data (R2, served at /data/), read once by every phone, so a game's sheet
// has its video the moment it opens, a game from months back too. Was
// Shared-Data's watch.mjs (every 3 hours on GitHub); the logic is the same,
// its files in R2 (builders/store.js).
//
// The picking is the app's own (the kit's sports-highlights.mjs and
// sports-broadcast.mjs); YouTube's searches and videos go through the data
// proxy's route in place (its trims and cache).
//
// → sports/watch.json: { built, games: { '<league>:<id>:<session>': { hl?:
// { id, channel, channelId, length, official }, elta?: { v, eps }, apple?:
// '<the game's page on Apple TV>', at?: its kick-off } } }: the last ten
// days; a game's highlights looked for while it's four days old at most.
//
// → sports/watch/<league>/<YYYY-MM>.json ({ games: { key: { t, hl?, elta?,
// apple?, miss?, not? } } }, by the month of its start in UTC) and
// sports/watch/index.json ({ built, checked, leagues: { key: { months, kept
// } } }): the season's, read by the app for a game the recent pack has let
// go. A game's links never change: kept, never looked for again. ELTA's: each
// season page read whole and every game of the season matched each run (its
// video can go up weeks later). Highlights of older games: newest first,
// while the run's time lasts, given up after two misses.
//
// → sports/elta-pages.json: ELTA.tv's sports index ({ built, pages }).
//
// → sports/apple-mls.json: Apple TV's MLS games read so far ({ built, events:
// { id: { id, url, start, teams } } }), each game's page read once.

import { CATALOG, ESPN_SITE as SITE, asiaMonthOf, asiaMonthUrl } from '../kit/catalog.mjs';
import { teamNameZh } from '../kit/names.mjs';
import * as HL from '../kit/sports-highlights.mjs';
import { BROADCAST, eltaVodsOf, eltaVodUrl, eltaEpisode, eltaSessionEpisode, parseEltaIndex, eltaPages } from '../kit/sports-broadcast.mjs';
import { mirrorPath } from '../kit/mirror.mjs';
import { trimEltaVod } from '../sports.js';
import { asiaBaseballResponse } from '../asia-baseball.js';
import { keeps, keptFrom, seasonBegun, seasonState, yearSeason } from './season.js';
import { within } from './within.js';

const DAY = 86_400_000;
const KEEP = 10 * DAY;
const HL_DAYS = 4 * DAY;
const MISSES = 2;
// Days an older game is looked for on ELTA before it's given up (ELTA puts a
// season's videos up within a week or two, or never: its small sides).
export const ELTA_TRIES = 10;
export const ELTA_A_RUN = 1500;
const ARCHIVE = 'sports/watch';
const sleepFor = ms => new Promise(r => setTimeout(r, ms));
const monthOf = ms => new Date(ms).toISOString().slice(0, 7);
const usDate = ms => new Date(ms - 5 * 3_600_000).toISOString().slice(0, 10).replaceAll('-', '');

// ---- The games: the app's shape, as far as the picking reads it ----------------------

const side = c => ({ id: String(c?.team?.id ?? c?.athlete?.id ?? ''), en: c?.team?.displayName || c?.athlete?.displayName || '', name: c?.team?.displayName || c?.athlete?.displayName || '', short: c?.team?.shortDisplayName || '', score: c?.score?.displayValue ?? (typeof c?.score === 'string' ? c.score : '') });
export function espnGames(data, league) {
  const out = [];
  for (const ev of data?.events || []) {
    if (league === 'f1') {
      // A race weekend's sessions, each its own (the app's `<event>~<FP1>`).
      for (const c of ev.competitions || []) {
        const abbr = c.type?.abbreviation;
        if (!abbr || c.status?.type?.state !== 'post') continue;
        out.push({ id: `${ev.id}~${abbr}`, league, kind: 'field', sessionKey: abbr, name: ev.name, enName: ev.name, start: c.date, official: c.date, status: { state: 'post' } });
      }
      continue;
    }
    const c = ev.competitions?.[0];
    const st = c?.status?.type || ev.status?.type || {};
    if (st.state !== 'post' || /postponed|canceled|cancelled/i.test(st.name || '')) continue;
    const home = c.competitors?.find(x => x.homeAway === 'home');
    const away = c.competitors?.find(x => x.homeAway === 'away');
    if (!home || !away) continue;
    out.push({ id: String(ev.id), league, kind: 'match', start: ev.date, status: { state: 'post' }, home: side(home), away: side(away), note: c.notes?.[0]?.headline || '', series: c.series?.type === 'playoff' ? { summary: c.series.summary || '' } : null });
  }
  return out;
}
const asiaGames = list =>
  list
    .filter(g => g.state === 'post')
    .map(g => ({ id: g.id, league: 'cpbl', kind: 'match', start: g.start, status: { state: 'post' }, home: { id: g.home.en, en: g.home.en, name: g.home.zh, zh: g.home.zh, score: String(g.homeScore ?? '') }, away: { id: g.away.en, en: g.away.en, name: g.away.zh, zh: g.away.zh, score: String(g.awayScore ?? '') }, post: new Date(g.start).getUTCMonth() >= 9 }));

// A game's sides in Chinese, every way they're written ([home's, away's]), as the app's tv.mjs.
const zhSides = e => {
  const l = CATALOG[e.league];
  return [e.home, e.away].map(s => {
    const zh = teamNameZh(l?.bet ?? e.league, s?.en || s?.name, l?.sport);
    return [s?.name, s?.short, s?.zh, zh?.full, zh?.short].filter(Boolean);
  });
};

// ---- Apple TV: each MLS game's own page ------------------------------------------------
//
// Apple TV has every MLS game, live and after, each on a page of its own,
// which the TV app opens at that game. The channel's page in Taiwan's
// storefront lists the games around now; a game it lists without its clubs
// or kick-off is read on its own page. Matched to ESPN's game by kick-off
// (an hour either way: Apple dates a game from its show, half an hour
// before) and at least one club's code (Apple's RBNY is ESPN's NY).
export const APPLE_MLS = 'https://tv.apple.com/tw/channel/mls/tvs.sbd.7000';
const SAFARI = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';
// Every game a page of Apple's lists: { id, url, start?, teams? }, by id
// (each listed again and again, some with the clubs and kick-off, some not).
export function appleEvents(data, into = new Map()) {
  const walk = o => {
    if (Array.isArray(o)) return o.forEach(walk);
    if (!o || typeof o !== 'object') return;
    // (A game's own page has it without a link to itself: its id in its metrics.)
    const id = o.segue?.destination?.id || o.impressionMetrics?.id?.id;
    if (o.type === 'SportingEvent' && typeof id === 'string' && id.startsWith('umc.cse.') && /\svs\.?\s/i.test(o.title || '') && !/^MLS\b/.test(o.title || '')) {
      const was = into.get(id) || { id };
      // (A game to come has its kick-off in its badge.)
      const start = (o.primaryMetadata || []).find(x => x?.isoDatetime)?.isoDatetime || o.badge?.isoDatetime;
      const teams = (o.competitors || []).map(c => c?.abbreviation).filter(Boolean);
      const url = typeof o.segue?.url === 'string' ? o.segue.url.split('?')[0] : was.url;
      into.set(id, { ...was, url: was.url || url, ...(start && !was.start ? { start } : {}), ...(teams.length === 2 && !was.teams ? { teams } : {}) });
    }
    for (const v of Object.values(o)) if (v && typeof v === 'object') walk(v);
  };
  walk(data);
  return into;
}
const code = x => String(x || '').toUpperCase().replace(/[^A-Z]/g, '');
// The Apple game that's this ESPN game (`teams`: its clubs' codes), or null.
export function appleMatch(game, events) {
  const at = Date.parse(game.start);
  const mine = new Set(game.teams.map(code));
  const hits = [...events].filter(x => x.start && x.teams && Math.abs(Date.parse(x.start) - at) <= 60 * 60_000 && x.teams.some(t => mine.has(code(t))));
  return hits.length === 1 ? hits[0] : hits.find(x => x.teams.every(t => mine.has(code(t)))) || null;
}

// The clubs' pages the channel's page links (each its last games and next ones).
export function appleClubs(data) {
  const out = new Set();
  const walk = o => {
    if (Array.isArray(o)) return o.forEach(walk);
    if (!o || typeof o !== 'object') return;
    const url = typeof o.segue?.url === 'string' ? o.segue.url : typeof o.url === 'string' ? o.url : '';
    if (/^https:\/\/tv\.apple\.com\/tw\/team\/[^?]*\/umc\.cst\.\w+/.test(url)) out.add(url.split('?')[0]);
    for (const v of Object.values(o)) if (v && typeof v === 'object') walk(v);
  };
  walk(data);
  return [...out];
}
// A season pack's (or ESPN day's) MLS games, played or to come: { id, league, kind, start, teams, home? (its name) }.
export function mlsGames(data) {
  const out = [];
  for (const ev of data?.events || []) {
    const c = ev.competitions?.[0];
    if (/postponed|canceled|cancelled/i.test(c?.status?.type?.name || '')) continue;
    const teams = (c?.competitors || []).map(x => x.team?.abbreviation).filter(Boolean);
    const home = c?.competitors?.find(x => x.homeAway === 'home')?.team?.displayName;
    if (teams.length === 2 && ev.date) out.push({ id: String(ev.id), league: 'mls', kind: 'match', start: ev.date, teams, ...(home ? { home } : {}) });
  }
  return out;
}
// Apple's games read on their own pages, kept (each read once; about 400 a
// season, so the first runs take three days).
const APPLE_KNOWN = 'sports/apple-mls.json';
const APPLE_READS = 150;
// Apple TV's search (a club's name: its games around now), for a game its club's page left out.
export const APPLE_SEARCH = 'https://tv.apple.com/tw/search?term=';
const APPLE_SEARCHES = 40;

// ---- The season archive: rules carried over from the GitHub build ---------------------

// Highlights looked for again (an entry's hl and misses dropped), each once
// (the archive's `checked` below it): 1, every football game's (a return
// leg's video counted); 2, MLS's ("New York" named both clubs, 2026-10-12);
// 3, the leagues played in innings, quarters or periods (a part of a game's
// cut counted, 2026-10-13); 4, football's last three weeks without the
// extended cut (Jay, 2026-10-23); 5, the same again with the phones' rule
// (a football video kept only with ext, or x: the extended cut looked for). How many, back.
export const CHECKED = 5;
// (As the kit's sports-highlights.mjs has them.)
export const TIMED = new Set(['mlb', 'cpbl', 'npb', 'kbo', 'nba', 'wnba', 'nbl', 'nhl', 'nfl', 'ncaaf']);
export function recheck(store, checked, isSoccer, now = Date.now()) {
  const again = new Set();
  const due = key => (checked < 1 && isSoccer(key)) || (checked < 2 && key === 'mls') || (checked < 3 && TIMED.has(key));
  for (const [key, games] of store) if (due(key)) for (const [k, v] of games) if (v.hl) again.add(`${key}\n${k}`);
  if (checked < 5) for (const [key, games] of store) if (isSoccer(key)) for (const [k, v] of games) if (v.hl && !v.hl.ext && !v.hl.x && v.t > now - 21 * 86_400_000) again.add(`${key}\n${k}`);
  for (const x of again) {
    const [key, k] = x.split('\n');
    const { hl: _hl, miss: _miss, ...rest } = store.get(key).get(k);
    store.get(key).set(k, rest);
  }
  return again.size;
}
// The videos on two games or more ({ id: [[league, key], …] }).
export function shared(store) {
  const on = new Map();
  for (const [key, games] of store) for (const [k, v] of games) if (v.hl?.id) (on.get(v.hl.id) || on.set(v.hl.id, []).get(v.hl.id)).push([key, k]);
  return new Map([...on].filter(([, list]) => list.length > 1));
}
// A video on two games is one game's: the one begun last before it went up
// (`up`: its page's time, ms; an hour's grace). The others are looked for
// again, never with it (`not`). Its time unknown: looked for again on all.
export function shareOut(store, id, list, up) {
  const games = list.map(([key, k]) => ({ key, k, v: store.get(key).get(k) }));
  const owner = Number.isFinite(up) ? games.filter(g => g.v.t <= up + 3_600_000).sort((a, b) => b.v.t - a.v.t)[0] : null;
  let moved = 0;
  for (const g of games) {
    if (g === owner) continue;
    const { hl: _hl, miss: _miss, ...rest } = g.v;
    store.get(g.key).set(g.k, owner ? { ...rest, not: [...new Set([...(rest.not || []), id])] } : rest);
    moved++;
  }
  return moved;
}
export { keeps, seasonBegun };

// A game's episodes in its season's list: the 原音 cut and ELTA's own, as
// the app picks between them ({ v, eps }), or null.
export function eltaOf(episodes, e, sides, vod) {
  const pick = prefer => (e.kind === 'match' ? eltaEpisode(episodes, e, sides, { prefer }) : eltaSessionEpisode(episodes, e, { prefer }));
  const eps = [...new Map([pick('en'), pick('zh')].filter(Boolean).map(x => [x.id, [x.id, x.title]])).values()];
  return eps.length ? { v: vod, eps } : null;
}

// ---- The run ----------------------------------------------------------------------------
//
// Two kinds of run, so an hour costs only what's new:
//   - every hour (light): the last two US days' games from ESPN and the few
//     recent games still waiting for their highlights or ELTA's replay
//     (sports/watch/_pending.json); only the archive months they touch are
//     read and written;
//   - once a day (full, the 20:00 UTC run, or when there's no pending list):
//     the season packs' last ten days and every kept season's games, ELTA
//     for every game still without it, older games' highlights while the
//     run's time lasts, the archive written whole (a season let go goes).
//
// `store`: builders/store.js. `proxy(url)`: a read through the data proxy's
// route (YouTube's trims), its JSON or null. `get(url, init)`: a plain
// fetch. `until`: when to stop looking for older games' highlights.
export const FULL_HOUR = 20;
export async function runWatch({ store, proxy, get = fetch, now = Date.now(), until = now + 10 * 60_000, sleep = sleepFor, full: fullAsked } = {}) {
  const json = async url => {
    for (let attempt = 0; ; attempt++) {
      try {
        const res = await within(30_000, signal => get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (orbit-watch)' }, signal }));
        if (res.ok) return await res.json();
        if (res.status === 404 || res.status === 400) return null;
      } catch {}
      if (attempt >= 2) throw new Error(`${url.slice(0, 120)}: unread`);
      await sleep(1500 * (attempt + 1));
    }
  };
  // Asia's months: the mirror's whole copy (every game), else read here.
  const asiaMonth = async ym => {
    const url = asiaMonthUrl(CATALOG.cpbl.asia, ym);
    const copy = await store.json(`${mirrorPath(url, '')}.gz`).catch(() => null);
    if (copy?.data?.whole) return copy.data.games || [];
    return (await (await asiaBaseballResponse(new URL(url))).json().catch(() => null))?.games || [];
  };
  const packs = new Map();
  const seasonPack = (key, y) => (packs.has(`${key}/${y}`) ? packs.get(`${key}/${y}`) : packs.set(`${key}/${y}`, store.json(`sports/${key}/${y}.json`).catch(() => null)).get(`${key}/${y}`));
  const year = new Date(now).getUTCFullYear();
  const seasonOf = async (key, l) => {
    if (l.data === 'asia') return yearSeason(await asiaMonth(asiaMonthOf(now)), now);
    const events = [];
    for (const y of [year - 1, year, year + 1]) events.push(...((await seasonPack(key, y))?.events || []));
    return seasonState(await json(`${SITE}/${l.espn}/scoreboard`).catch(() => null), events, now);
  };
  const seasonGames = async (key, l, season) => {
    if (l.data === 'asia') {
      const months = [];
      for (let m = new Date(Date.UTC(new Date(keptFrom(season)).getUTCFullYear(), 0, 1)); m.getTime() <= now; m = new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() + 1, 1))) months.push(asiaMonthOf(m.getTime() + DAY));
      return asiaGames((await Promise.all(months.map(asiaMonth))).flat());
    }
    const out = [];
    for (const y of [year - 1, year, year + 1]) {
      const pack = await seasonPack(key, y);
      const post = new Map((pack?.events || []).map(ev => [String(ev.id), ev.season?.type === 3 || /post|playoff|play-in/i.test(ev.season?.slug || '')]));
      for (const g of espnGames(pack, key)) out.push({ ...g, post: post.get(g.id.split('~')[0]) || false });
    }
    return out.filter(g => Date.parse(g.start) < now && keeps(season, Date.parse(g.start)));
  };
  // ELTA.tv: a page's text, straight from ELTA (a season page whole; the proxy's keeps its newest 120).
  const eltaText = async url => {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await within(60_000, signal => get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (orbit-watch)' }, signal }));
        if (res.ok) return await res.text();
      } catch {}
      await sleep(2000 * (attempt + 1));
    }
    return null;
  };
  const eltaSeason = async vod => {
    const html = await eltaText(eltaVodUrl(vod));
    const eps = html ? trimEltaVod(html, Infinity).episodes : [];
    return eps.length ? eps : (await proxy(eltaVodUrl(vod)).catch(() => null))?.episodes || [];
  };
  const read = url => proxy(url);
  const leagues = Object.keys(BROADCAST).filter(k => CATALOG[k]);
  const has = x => typeof x?.elta === 'object';
  const old = (await store.json('sports/watch.json'))?.games || {};
  const pending = await store.json(`${ARCHIVE}/_pending.json`);
  const full = fullAsked ?? (!pending || new Date(now).getUTCHours() === FULL_HOUR);

  // The recent games over: ESPN for the last two US days; the rest of ten
  // days from the season packs (full) or the pending list (hourly).
  const days = [usDate(now), usDate(now - DAY)];
  const games = [];
  for (const key of leagues) {
    const l = CATALOG[key];
    if (l.data === 'asia') {
      const months = full ? [...new Set([now, now - KEEP].map(asiaMonthOf))] : [asiaMonthOf(now)];
      games.push(...asiaGames((await Promise.all(months.map(asiaMonth))).flat()));
      continue;
    }
    if (l.data !== 'espn' || !l.espn) continue;
    if (key === 'f1') {
      games.push(...espnGames(await json(`${SITE}/${l.espn}/scoreboard`).catch(() => null), key));
      continue;
    }
    const fresh = [];
    for (const d of days) fresh.push(...espnGames(await json(`${SITE}/${l.espn}/scoreboard?dates=${d}`).catch(() => null), key));
    const ids = new Set(fresh.map(g => g.id));
    if (full) for (const y of [year - 1, year]) games.push(...espnGames(await seasonPack(key, y), key).filter(g => !ids.has(g.id) && now - Date.parse(g.start) < KEEP));
    games.push(...fresh);
  }
  if (!full) for (const g of pending?.games || []) if (!games.some(x => x.league === g.league && x.id === g.id)) games.push(g);
  const recent = [...new Map(games.filter(e => now - Date.parse(e.start) < KEEP && Date.parse(e.start) < now).map(e => [HL.watchKey(e), e])).values()];
  const out = {};
  for (const e of recent) {
    const k = HL.watchKey(e);
    if (old[k]) out[k] = old[k];
  }

  // The archive: every month (full), else the months the recent games are in.
  const index = await store.json(`${ARCHIVE}/index.json`);
  const archive = new Map();
  const loaded = new Set();
  const loadMonth = async (key, m) => {
    if (loaded.has(`${key}/${m}`) || !index?.leagues?.[key]?.months?.includes(m)) return;
    loaded.add(`${key}/${m}`);
    if (!archive.has(key)) archive.set(key, new Map());
    for (const [k, v] of Object.entries((await store.json(`${ARCHIVE}/${key}/${m}.json`))?.games || {})) archive.get(key).set(k, v);
  };
  if (full) for (const [key, { months = [] } = {}] of Object.entries(index?.leagues || {})) for (const m of months) await loadMonth(key, m);
  else for (const e of recent) await loadMonth(e.league, monthOf(Date.parse(e.start)));
  const stored = e => archive.get(e.league)?.get(HL.watchKey(e));
  // Each recent game what the archive has of it (found in an earlier run,
  // the recent pack since rebuilt without it: an hourly run reads only two
  // US days, and NLCS Game 4's video, in the archive, was a search on the
  // phone two days on, 2026-10-18); every entry dated, so the next runs
  // carry it for its ten days whatever they read.
  for (const e of recent) {
    const k = HL.watchKey(e);
    const a = stored(e);
    if (a?.hl || has(a)) out[k] = { ...(a.hl ? { hl: a.hl } : {}), ...(has(a) ? { elta: a.elta } : {}), ...out[k] };
    if (out[k]) out[k].at = Date.parse(e.start);
  }
  for (const [k, v] of Object.entries(old)) if (!out[k] && v.at && now - v.at < KEEP && v.at < now) out[k] = v;
  const touched = new Set();
  const keep = (e, v) => {
    if (!archive.has(e.league)) archive.set(e.league, new Map());
    archive.get(e.league).set(HL.watchKey(e), { ...stored(e), t: Date.parse(e.start), ...v });
    touched.add(`${e.league}/${monthOf(Date.parse(e.start))}`);
  };
  if (full) {
    if ((index?.checked || 0) < CHECKED) for (const k of Object.keys(out)) if (((index?.checked || 0) < 3 && TIMED.has(k.split(':')[0])) || (CATALOG[k.split(':')[0]]?.sport === 'soccer' && !out[k].hl?.ext && !out[k].hl?.x)) delete out[k].hl;
    recheck(archive, index?.checked || 0, key => CATALOG[key]?.sport === 'soccer');
    for (const [id, list] of shared(archive)) shareOut(archive, id, list, Date.parse((await read(`${HL.YT}/watch?v=${id}`).catch(() => null))?.published || ''));
  }

  // Highlights: each recent game not yet found, four days at most after it (one search at a time: the proxy's pace).
  let found = 0;
  let failed = 0;
  const todo = recent.filter(e => !out[HL.watchKey(e)]?.hl && !stored(e)?.hl && now - Date.parse(e.start) < HL_DAYS);
  for (const e of todo) {
    try {
      const v = await HL.findHighlights(e, read, now);
      if (v) (out[HL.watchKey(e)] = { ...out[HL.watchKey(e)], hl: v, at: Date.parse(e.start) }), found++;
    } catch {
      failed++;
      await sleep(5000);
    }
  }

  // The kept seasons' games (full only).
  const seasons = new Map();
  const season = [];
  if (full)
    for (const key of leagues) {
      const l = CATALOG[key];
      if (!(l.data === 'asia' || (l.data === 'espn' && l.espn))) continue;
      const s = await seasonOf(key, l);
      seasons.set(key, s);
      season.push(...(await seasonGames(key, l, s).catch(() => [])));
    }

  // ELTA's whole game: a game without it looked for every hour while it's
  // three days old (most go up within a day); older ones in the daily run.
  // The season pages are read only for games looked for, each once a run.
  const all = [...new Map([...season, ...recent].map(e => [HL.watchKey(e), e])).values()];
  const wanted = all.filter(e => {
    const k = HL.watchKey(e);
    if (has(out[k]) || has(stored(e))) {
      if (!has(out[k]) && out[k]) out[k].elta = stored(e).elta;
      return false;
    }
    // (Looked for on ELTA_TRIES days and never found: never looked for again.)
    return (full && (stored(e)?.ea || 0) < ELTA_TRIES) || now - Date.parse(e.start) < 3 * DAY;
  });
  // (Newest first, at most ELTA_A_RUN: a run's CPU is 30 s; the rest the next days.)
  wanted.sort((a, b) => Date.parse(b.start) - Date.parse(a.start)).splice(ELTA_A_RUN);
  let eltaSeasons = null;
  if (wanted.length) {
    const pagesIndex = await eltaText('https://eltaott.tv/sports').then(t => (t ? parseEltaIndex(t) : []));
    if (pagesIndex.length) {
      eltaSeasons = eltaPages(pagesIndex);
      // (Dated by the day, so a run with the same pages writes nothing.)
      await store.put('sports/elta-pages.json', { built: new Date(now).toISOString().slice(0, 10), pages: pagesIndex });
    }
  }
  const pages = new Map();
  let elta = 0;
  for (const e of wanted) {
    const k = HL.watchKey(e);
    const sides = zhSides(e);
    let hit = null;
    for (const vod of eltaVodsOf(e, sides[0], eltaSeasons)) {
      if (!pages.has(vod)) pages.set(vod, await eltaSeason(vod));
      if ((hit = eltaOf(pages.get(vod), e, sides, vod))) break;
    }
    if (!hit) {
      // A game over three days without it: a day's try counted (ELTA puts up most within days).
      if (full && now - Date.parse(e.start) >= 3 * DAY) keep(e, { ea: (stored(e)?.ea || 0) + 1 });
      continue;
    }
    elta++;
    if (out[k]) out[k].elta = hit;
    else if (now - Date.parse(e.start) < KEEP) out[k] = { elta: hit, at: Date.parse(e.start) };
    keep(e, { elta: hit });
  }

  // Older games' highlights, the newest first, while the run's time lasts (full only).
  let back = 0;
  if (full) {
    const older = season
      .filter(e => now - Date.parse(e.start) >= HL_DAYS && !out[HL.watchKey(e)]?.hl && !stored(e)?.hl && (stored(e)?.miss || 0) < MISSES)
      .sort((a, b) => Date.parse(b.start) - Date.parse(a.start));
    for (const e of older) {
      if (Date.now() >= until) break;
      let v;
      try {
        v = await HL.findHighlights(e, read, now);
      } catch {
        failed++;
        await sleep(5000);
        continue;
      }
      if (v && stored(e)?.not?.includes(v.id)) v = null;
      keep(e, v ? { hl: v } : { miss: (stored(e)?.miss || 0) + 1 });
      if (v) back++;
    }
  }

  // Apple TV's page of each MLS game: once a day (its lists change slowly).
  // The channel's page lists only the games around now, so each club's page
  // too (its last 15 games and next 5); a game listed without its kick-off
  // or clubs is read on its own page once, kept in sports/apple-mls.json.
  // Matched to the season's every game (its pack, and ESPN's days around
  // now): a game to come or of the last ten days in the recent pack, one
  // older in the archive for good (the channel's page was all a game a
  // fortnight old had: the person left to find it, 2026-10-15).
  for (const [k, v] of Object.entries(old)) if (v.apple && !out[k] && now - (v.at || 0) < KEEP) out[k] = v;
  let apple = { listed: 0, matched: 0, read: 0, kept: 0 };
  if (full)
    try {
      const appleData = async url => {
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            const res = await within(30_000, signal => get(url, { headers: { 'User-Agent': SAFARI, 'Accept-Language': 'zh-TW' }, signal }));
            if (res.ok) {
              const m = /<script type="application\/json" id="serialized-server-data">([\s\S]*?)<\/script>/.exec(await res.text());
              return m ? JSON.parse(m[1]) : null;
            }
            if (res.status === 404) return null;
          } catch {}
          await sleep(1500 * (attempt + 1));
        }
        return null;
      };
      const data = await appleData(APPLE_MLS);
      if (data) {
        const events = appleEvents(data);
        for (const club of appleClubs(data)) {
          const page = await appleData(club);
          if (page) appleEvents(page, events);
        }
        const stash = (await store.json(APPLE_KNOWN).catch(() => null))?.events || {};
        for (const [id, x] of events) if (stash[id]) events.set(id, { ...stash[id], ...x, start: x.start || stash[id].start, teams: x.teams || stash[id].teams });
        let readPages = 0;
        // The games to come first (a club's page dates them, its clubs on their own page), soonest first; then the rest, older ones.
        const soon = x => (x.start ? Math.abs(Date.parse(x.start) - now) - (Date.parse(x.start) > now ? 1e13 : 0) : Infinity);
        for (const x of [...events.values()].sort((a, b) => soon(a) - soon(b))) {
          if ((x.start && x.teams) || !x.url || readPages >= APPLE_READS) continue;
          readPages++;
          const page = await appleData(x.url);
          if (page) appleEvents(page, new Map([[x.id, x]])).forEach((v, id) => id === x.id && events.set(id, v));
        }
        const espn = new Map();
        for (const y of [year - 1, year]) for (const g of mlsGames(await seasonPack('mls', y))) espn.set(g.id, g);
        for (let i = -1; i <= 7; i++) for (const g of mlsGames(await json(`${SITE}/soccer/usa.1/scoreboard?dates=${usDate(now + i * DAY)}`).catch(() => null))) espn.set(g.id, g);
        // A game to come (or of the last ten days) the clubs' pages left out
        // (a club's page skips some of its next games: 10 of 75, 2026-10-15):
        // Apple's search for its home club, its game at that kick-off read.
        const known = () => [...Object.values(stash), ...events.values()].filter(x => x.start && x.teams);
        let searched = 0;
        let searchReads = 0;
        // (The games to come first, soonest first; then the last ten days'.)
        const upcoming = g => (Date.parse(g.start) > now ? Date.parse(g.start) - now : 1e13 + now - Date.parse(g.start));
        for (const g of [...espn.values()].sort((a, b) => upcoming(a) - upcoming(b))) {
          if (Date.parse(g.start) < now - KEEP || !g.home || appleMatch(g, known()) || searched >= APPLE_SEARCHES) continue;
          searched++;
          const found = appleEvents(await appleData(`${APPLE_SEARCH}${encodeURIComponent(g.home)}`));
          for (const x of found.values()) {
            if (events.get(x.id)?.teams || !x.url || (x.start && Math.abs(Date.parse(x.start) - Date.parse(g.start)) > 60 * 60_000)) continue;
            if (!(x.start && x.teams)) {
              // (Its own reads: the backlog of older games never holds up one to come.)
              if (searchReads >= APPLE_SEARCHES) continue;
              searchReads++;
              const page = await appleData(x.url);
              if (page) appleEvents(page, new Map([[x.id, x]])).forEach((v, id) => id === x.id && found.set(id, v));
            }
            events.set(x.id, found.get(x.id));
          }
        }
        // Each game read kept (a season's: Apple's ids never change), the rest of the year's let go.
        const keptEvents = {};
        for (const x of [...Object.values(stash), ...events.values()]) if (x.start && x.teams && x.url && now - Date.parse(x.start) < 400 * DAY) keptEvents[x.id] = { id: x.id, url: x.url, start: x.start, teams: x.teams };
        await store.put(APPLE_KNOWN, { built: new Date(now).toISOString().slice(0, 10), events: keptEvents });
        const listed = Object.values(keptEvents);
        let matched = 0;
        let archived = 0;
        for (const g of espn.values()) {
          const hit = appleMatch(g, listed);
          if (!hit) continue;
          const k = HL.watchKey(g);
          const at = Date.parse(g.start);
          matched++;
          if (at > now - KEEP) out[k] = { ...out[k], apple: hit.url, at };
          if (at < now && stored(g)?.apple !== hit.url) keep(g, { apple: hit.url }), archived++;
        }
        apple = { listed: events.size, matched, read: readPages, searched, kept: archived };
      }
    } catch {}

  // The recent pack: written when it changed (`built` by the day: the same games, the same file).
  await store.put('sports/watch.json', { built: new Date(now).toISOString().slice(0, 10), games: out });
  for (const e of all) {
    const v = out[HL.watchKey(e)];
    if ((v?.hl && !stored(e)?.hl) || (has(v) && !has(stored(e)))) keep(e, { ...(v.hl ? { hl: v.hl } : {}), ...(has(v) ? { elta: v.elta } : {}) });
  }
  // What's still waiting: recent games without highlights (four days) or ELTA (three).
  const waiting = recent.filter(e => (!out[HL.watchKey(e)]?.hl && now - Date.parse(e.start) < HL_DAYS) || (!has(out[HL.watchKey(e)]) && !has(stored(e)) && now - Date.parse(e.start) < 3 * DAY));
  const pendingFile = { games: waiting.map(({ id, league, kind, start, status, home, away, note, series, sessionKey, name, enName, official }) => ({ id, league, kind, start, status, home, away, note, series, sessionKey, name, enName, official })) };

  // The archive: whole in the full run (a season let go goes), else the months touched.
  const monthFile = (key, m) => {
    const s = seasons.get(key);
    const list = {};
    for (const [k, v] of archive.get(key) || []) if (monthOf(v.t) === m && (!s || keeps(s, v.t))) list[k] = v;
    return list;
  };
  let kept = 0;
  if (full && (index || archive.size)) {
    const files = {};
    const archiveIndex = { built: new Date(now).toISOString().slice(0, 10), checked: CHECKED, leagues: {} };
    for (const key of archive.keys()) {
      const months = [...new Set([...archive.get(key).values()].map(v => monthOf(v.t)))].sort();
      for (const m of months) {
        const list = monthFile(key, m);
        if (!Object.keys(list).length) continue;
        files[`${ARCHIVE}/${key}/${m}.json`] = { games: list };
        (archiveIndex.leagues[key] ||= { months: [], kept: 0 }).months.push(m);
        archiveIndex.leagues[key].kept += Object.keys(list).length;
        kept += Object.keys(list).length;
      }
    }
    files[`${ARCHIVE}/index.json`] = archiveIndex;
    files[`${ARCHIVE}/_pending.json`] = pendingFile;
    await store.replace(`${ARCHIVE}/`, files);
  } else {
    const idx = index || { built: '', checked: CHECKED, leagues: {} };
    let grew = false;
    for (const t of touched) {
      const [key, m] = t.split('/');
      const list = monthFile(key, m);
      await store.put(`${ARCHIVE}/${key}/${m}.json`, { games: list });
      const l = (idx.leagues[key] ||= { months: [], kept: 0 });
      if (!l.months.includes(m)) (l.months = [...l.months, m].sort()), (grew = true);
    }
    if (grew) await store.put(`${ARCHIVE}/index.json`, idx);
    await store.put(`${ARCHIVE}/_pending.json`, pendingFile);
  }
  return { full, recent: recent.length, kept: Object.keys(out).length, found, looked: todo.length, failed, elta, eltaLooked: wanted.length, season: kept, back, apple };
}
