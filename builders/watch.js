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
// miss?, not? } } }, by the month of its start in UTC) and
// sports/watch/index.json ({ built, checked, leagues: { key: { months, kept
// } } }): the season's, read by the app for a game the recent pack has let
// go. A game's links never change: kept, never looked for again. ELTA's: each
// season page read whole and every game of the season matched each run (its
// video can go up weeks later). Highlights of older games: newest first,
// while the run's time lasts, given up after two misses.
//
// → sports/elta-pages.json: ELTA.tv's sports index ({ built, pages }).

import { CATALOG, asiaMonthOf, asiaMonthUrl } from '../kit/catalog.mjs';
import { teamNameZh } from '../kit/names.mjs';
import * as HL from '../kit/sports-highlights.mjs';
import { BROADCAST, eltaVodsOf, eltaVodUrl, eltaEpisode, eltaSessionEpisode, parseEltaIndex, eltaPages } from '../kit/sports-broadcast.mjs';
import { mirrorPath } from '../kit/quadra.mjs';
import { trimEltaVod } from '../sports.js';
import { asiaBaseballResponse } from '../asia-baseball.js';
import { keeps, keptFrom, seasonBegun, seasonState, yearSeason } from './season.js';
import { within } from './within.js';

const SITE = 'https://site.api.espn.com/apis/site/v2/sports';
const DAY = 86_400_000;
const KEEP = 10 * DAY;
const HL_DAYS = 4 * DAY;
const MISSES = 2;
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

// ---- The season archive: rules carried over from the GitHub build ---------------------

// Highlights looked for again (an entry's hl and misses dropped), each once
// (the archive's `checked` below it): 1, every football game's (a return
// leg's video counted); 2, MLS's ("New York" named both clubs, 2026-10-12);
// 3, the leagues played in innings, quarters or periods (a part of a game's
// cut counted, 2026-10-13). How many, back.
export const CHECKED = 3;
// (As the kit's sports-highlights.mjs has them.)
export const TIMED = new Set(['mlb', 'cpbl', 'npb', 'kbo', 'nba', 'wnba', 'nbl', 'nhl', 'nfl', 'ncaaf']);
export function recheck(store, checked, isSoccer) {
  const again = new Set();
  const due = key => (checked < 1 && isSoccer(key)) || (checked < 2 && key === 'mls') || (checked < 3 && TIMED.has(key));
  for (const [key, games] of store) if (due(key)) for (const [k, v] of games) if (v.hl) again.add(`${key}\n${k}`);
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

// ---- The run ---------------------------------------------------------------------------
//
// `store`: builders/store.js. `proxy(url)`: a read through the data proxy's
// route (YouTube's trims), resolving to its JSON or null. `get(url, init)`:
// a plain fetch. `now`; `until`: when to stop looking for older games'
// highlights (the rest is quick). Returns what it did.
export async function runWatch({ store, proxy, get = fetch, now = Date.now(), until = now + 10 * 60_000, sleep = sleepFor }) {
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
  const seasonOf = async (key, l) => {
    if (l.data === 'asia') return yearSeason(await asiaMonth(asiaMonthOf(now)), now);
    const y = new Date(now).getUTCFullYear();
    const events = [];
    for (const year of [y - 1, y, y + 1]) events.push(...((await seasonPack(key, year))?.events || []));
    return seasonState(await json(`${SITE}/${l.espn}/scoreboard`).catch(() => null), events, now);
  };
  const seasonGames = async (key, l, season) => {
    if (l.data === 'asia') {
      const months = [];
      for (let m = new Date(Date.UTC(new Date(keptFrom(season)).getUTCFullYear(), 0, 1)); m.getTime() <= now; m = new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() + 1, 1))) months.push(asiaMonthOf(m.getTime() + DAY));
      return asiaGames((await Promise.all(months.map(asiaMonth))).flat());
    }
    const out = [];
    const y = new Date(now).getUTCFullYear();
    for (const year of [y - 1, y, y + 1]) {
      const pack = await seasonPack(key, year);
      const post = new Map((pack?.events || []).map(ev => [String(ev.id), ev.season?.type === 3 || /post|playoff|play-in/i.test(ev.season?.slug || '')]));
      for (const g of espnGames(pack, key)) out.push({ ...g, post: post.get(g.id.split('~')[0]) || false });
    }
    return out.filter(g => Date.parse(g.start) < now && keeps(season, Date.parse(g.start)));
  };
  // ELTA.tv's sports index and a season page whole (straight from ELTA; the proxy's keeps the newest 120).
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
    return eps.length ? eps : ((await proxy(eltaVodUrl(vod)).catch(() => null))?.episodes || []);
  };
  const read = url => proxy(url);

  const leagues = Object.keys(BROADCAST).filter(k => CATALOG[k]);
  const old = (await store.json('sports/watch.json'))?.games || {};
  // Every recent game over: ESPN's leagues day by day (US days, from ten days back), CPBL's from its months.
  const days = Array.from({ length: Math.ceil(KEEP / DAY) + 1 }, (_, i) => usDate(now - i * DAY));
  const games = [];
  for (const key of leagues) {
    const l = CATALOG[key];
    if (l.data === 'asia') {
      games.push(...asiaGames((await Promise.all([...new Set([now, now - KEEP].map(asiaMonthOf))].map(asiaMonth))).flat()));
      continue;
    }
    if (l.data !== 'espn' || !l.espn) continue;
    if (key === 'f1') {
      games.push(...espnGames(await json(`${SITE}/${l.espn}/scoreboard`).catch(() => null), key));
      continue;
    }
    for (const d of days) games.push(...espnGames(await json(`${SITE}/${l.espn}/scoreboard?dates=${d}`).catch(() => null), key));
  }
  const recent = games.filter(e => now - Date.parse(e.start) < KEEP && Date.parse(e.start) < now);
  const out = {};
  for (const e of recent) {
    const k = HL.watchKey(e);
    if (old[k]) out[k] = old[k];
  }
  // The archive as it is.
  const index = await store.json(`${ARCHIVE}/index.json`);
  const archive = new Map();
  for (const [key, { months = [] } = {}] of Object.entries(index?.leagues || {})) {
    const list = new Map();
    for (const m of months) for (const [k, v] of Object.entries((await store.json(`${ARCHIVE}/${key}/${m}.json`))?.games || {})) list.set(k, v);
    archive.set(key, list);
  }
  // A rule fixed since: the recent pack's highlights of those leagues looked for again too.
  if ((index?.checked || 0) < CHECKED) for (const k of Object.keys(out)) if (TIMED.has(k.split(':')[0])) delete out[k].hl;
  recheck(archive, index?.checked || 0, key => CATALOG[key]?.sport === 'soccer');
  for (const [id, list] of shared(archive)) shareOut(archive, id, list, Date.parse((await read(`${HL.YT}/watch?v=${id}`).catch(() => null))?.published || ''));

  // Highlights: each recent game not yet found, four days at most after it (one search at a time: the proxy's pace).
  let found = 0;
  let failed = 0;
  const todo = recent.filter(e => !out[HL.watchKey(e)]?.hl && now - Date.parse(e.start) < HL_DAYS);
  for (const e of todo) {
    try {
      const v = await HL.findHighlights(e, read, now);
      if (v) (out[HL.watchKey(e)] = { ...out[HL.watchKey(e)], hl: v }), found++;
    } catch {
      failed++;
      await sleep(5000);
    }
  }

  // The season's games, league by league.
  const seasons = new Map();
  const season = [];
  for (const key of leagues) {
    const l = CATALOG[key];
    if (!(l.data === 'asia' || (l.data === 'espn' && l.espn))) continue;
    const s = await seasonOf(key, l);
    seasons.set(key, s);
    season.push(...(await seasonGames(key, l, s).catch(() => [])));
  }
  const stored = e => archive.get(e.league)?.get(HL.watchKey(e));
  const keep = (e, v) => {
    if (!archive.has(e.league)) archive.set(e.league, new Map());
    archive.get(e.league).set(HL.watchKey(e), { ...stored(e), t: Date.parse(e.start), ...v });
  };

  // ELTA's whole game: each season page read once, every game not yet found matched as the app does.
  const pagesIndex = await eltaText('https://eltaott.tv/sports').then(t => (t ? parseEltaIndex(t) : []));
  const eltaSeasons = pagesIndex.length ? eltaPages(pagesIndex) : null;
  if (pagesIndex.length) await store.put('sports/elta-pages.json', { built: new Date(now).toISOString(), pages: pagesIndex });
  const pages = new Map();
  let elta = 0;
  const all = [...new Map([...season, ...recent].map(e => [HL.watchKey(e), e])).values()];
  for (const e of all) {
    const k = HL.watchKey(e);
    const has = x => typeof x?.elta === 'object';
    if (has(out[k]) || has(stored(e))) {
      if (!has(out[k]) && out[k]) out[k].elta = stored(e).elta;
      continue;
    }
    const sides = zhSides(e);
    let hit = null;
    for (const vod of eltaVodsOf(e, sides[0], eltaSeasons)) {
      if (!pages.has(vod)) pages.set(vod, await eltaSeason(vod));
      if ((hit = eltaOf(pages.get(vod), e, sides, vod))) break;
    }
    if (!hit) continue;
    elta++;
    if (out[k]) out[k].elta = hit;
    else if (now - Date.parse(e.start) < KEEP) out[k] = { elta: hit };
    keep(e, { elta: hit });
  }

  // Older games' highlights, the newest first, while the run's time lasts.
  let back = 0;
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

  // Apple TV's page of each MLS game (kept as the games are: ten days, or to come).
  for (const [k, v] of Object.entries(old)) if (v.apple && !out[k] && now - (v.at || 0) < KEEP) out[k] = v;
  let apple = { listed: 0, matched: 0 };
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
      let readPages = 0;
      for (const x of events.values()) {
        if ((x.start && x.teams) || !x.url || readPages >= 60) continue;
        readPages++;
        const page = await appleData(x.url);
        if (page) appleEvents(page, new Map([[x.id, x]])).forEach((v, id) => id === x.id && events.set(id, v));
      }
      let matched = 0;
      for (let i = -1; i <= 7; i++) {
        const day = await json(`${SITE}/soccer/usa.1/scoreboard?dates=${usDate(now + i * DAY)}`).catch(() => null);
        for (const ev of day?.events || []) {
          const c = ev.competitions?.[0];
          const teams = (c?.competitors || []).map(x => x.team?.abbreviation).filter(Boolean);
          if (teams.length !== 2) continue;
          const g = { id: String(ev.id), league: 'mls', kind: 'match', start: ev.date, teams };
          const hit = appleMatch(g, events.values());
          if (!hit?.url) continue;
          const k = HL.watchKey(g);
          out[k] = { ...out[k], apple: hit.url, at: Date.parse(g.start) };
          matched++;
        }
      }
      apple = { listed: events.size, matched };
    }
  } catch {}

  const built = new Date(now).toISOString();
  await store.put('sports/watch.json', { built, games: out });
  // The season's: the recent pack's links in, each league's kept season, a month a file.
  for (const e of all) {
    const v = out[HL.watchKey(e)];
    if (v?.hl || v?.elta) keep(e, { ...(v.hl ? { hl: v.hl } : {}), ...(v.elta ? { elta: v.elta } : {}) });
  }
  const files = {};
  const archiveIndex = { built, checked: CHECKED, leagues: {} };
  let kept = 0;
  for (const [key, list] of archive) {
    const s = seasons.get(key);
    const months = new Map();
    for (const [k, v] of list) {
      // Let go: a season whose next one has begun.
      if (s && !keeps(s, v.t)) continue;
      const m = monthOf(v.t);
      if (!months.has(m)) months.set(m, {});
      months.get(m)[k] = v;
      kept++;
    }
    if (!months.size) continue;
    for (const [m, monthGames] of months) files[`${ARCHIVE}/${key}/${m}.json`] = { games: monthGames };
    archiveIndex.leagues[key] = { months: [...months.keys()].sort(), kept: [...months.values()].reduce((n, x) => n + Object.keys(x).length, 0) };
  }
  files[`${ARCHIVE}/index.json`] = archiveIndex;
  // (Nothing of the archive read: never written over with less.)
  if (index || kept) await store.replace(`${ARCHIVE}/`, files);
  return { recent: recent.length, kept: Object.keys(out).length, found, looked: todo.length, failed, elta, season: kept, back, apple };
}
