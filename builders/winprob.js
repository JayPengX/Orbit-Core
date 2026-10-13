// Past games' win probability (and F1 races' chances by lap), while Orbit
// Sports can show them. Built once a day by the proxy (builders/run.js) into
// the family's data (R2): a game over doesn't change, so its line is read
// once (Polymarket's market on it, where ESPN draws none) and kept, never
// read again; let go with its season (season.js). Was Shared-Data's
// winprob.mjs; the same logic, its files in R2.
//
// Efficient: Polymarket's pages (~11 MB each) are read through the data
// proxy's route in place, trimmed and kept in its edge cache (the phones'
// reads share it), never whole here; a game already kept is never read again;
// the archive written only where it changed (builders/store.js).
//
// → winprob/<league>/<YYYY-MM>.json ({ games: { key: line | { none } } }, the
// format the kit's sports-winprob.mjs reads) and winprob/index.json.

import { CATALOG, asiaMonthUrl, asiaMonthOf } from '../kit/catalog.mjs';
import { mirrorPath } from '../kit/mirror.mjs';
import { polymarketLine, packLine, gameKey, PM_LEAGUE, PM_PACK, raceLine, raceLaps, raceEvents, packRace, raceKey } from '../kit/sports-winprob.mjs';
import { asiaBaseballResponse } from '../asia-baseball.js';
import { seasonState, yearSeason, keeps, keptFrom } from './season.js';
import { within } from './within.js';

const SITE = 'https://site.api.espn.com/apis/site/v2/sports';
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
// A game's market can take a while to settle; two days on without one, none.
const GIVE_UP = 2 * DAY;
// Where ESPN draws its own (all but a game now and then), only the last week is looked at.
const ESPN_DRAWS = new Set(['baseball', 'basketball', 'football', 'hockey']);
// What a race's turns hold, and how its line is drawn: one kept with less is read again once.
export const TURNS = 8;
export const LINE = 2;
const month = ms => new Date(ms).toISOString().slice(0, 7);

// `proxy(url, trim)`: the data proxy's route in place (Polymarket trimmed and
// cached), its JSON or null. `get`: a plain fetch.
export async function runWinprob({ store, proxy, get = fetch, now = Date.now(), sleep = ms => new Promise(r => setTimeout(r, ms)) }) {
  const read = async (url, { trim = '', missing = null } = {}) => {
    for (let attempt = 0; ; attempt++) {
      try {
        const res = await within(30_000, signal => get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (orbit-winprob)' }, signal }));
        if (res.status === 200) return await res.json();
        if (res.status === 404) return missing;
        if (res.status === 400) return null;
      } catch {}
      if (attempt >= 3) throw new Error(`${url}: unread`);
      await sleep(2000 * (attempt + 1));
    }
  };
  // Polymarket through the proxy (its trims), the rest read here.
  const source = (url, { trim = '' } = {}) => (/^https:\/\/(gamma-api|clob)\.polymarket\.com\//.test(url) ? proxy(url, trim) : read(url, { trim }));
  const asiaMonth = async (l, ym) => {
    const url = asiaMonthUrl(l.asia, ym);
    const copy = await store.json(`${mirrorPath(url, '')}.gz`).catch(() => null);
    if (copy?.data?.whole) return copy.data.games || [];
    return (await (await asiaBaseballResponse(new URL(url))).json().catch(() => null))?.games || [];
  };
  const packs = new Map();
  const pack = (key, y) => (packs.has(`${key}/${y}`) ? packs.get(`${key}/${y}`) : packs.set(`${key}/${y}`, store.json(`sports/${key}/${y}.json`).catch(() => null)).get(`${key}/${y}`));
  const year = new Date(now).getUTCFullYear();
  const seasonOf = async (key, l) => {
    if (l.data === 'asia') return yearSeason(await asiaMonth(l, asiaMonthOf(now)), now);
    const events = [];
    for (const y of [year - 1, year, year + 1]) events.push(...((await pack(key, y))?.events || []));
    return seasonState(await read(`${SITE}/${l.espn}/scoreboard`).catch(() => null), events, now);
  };
  const finishedGames = async (key, l, from) => {
    if (l.data === 'asia') {
      const months = [...new Set([asiaMonthOf(from), asiaMonthOf(now - 31 * DAY), asiaMonthOf(now)])];
      const lists = await Promise.all(months.map(ym => asiaMonth(l, ym)));
      // CPBL's playoffs: from October on.
      return lists.flat().filter(g => g.state === 'post').map(g => ({ id: g.id, start: g.start, home: g.home, away: g.away, post: new Date(g.start).getUTCMonth() >= 9 }));
    }
    const games = [];
    for (const y of new Set([new Date(from).getUTCFullYear(), year])) {
      for (const e of (await pack(key, y))?.events || []) {
        const comp = e.competitions?.[0];
        if ((e.status?.type?.state || comp?.status?.type?.state) !== 'post') continue;
        const team = h => comp?.competitors?.find(c => c.homeAway === h)?.team;
        const [home, away] = [team('home'), team('away')];
        if (home && away) games.push({ id: String(e.id), start: comp?.date || e.date, home: { en: home.displayName || home.name }, away: { en: away.displayName || away.name }, post: e.season?.type === 3 || /post|playoff|play-in/i.test(e.season?.slug || '') });
      }
    }
    return games;
  };

  // The archive as it is.
  const index = (await store.json(`${PM_PACK}/index.json`)) || { leagues: {} };
  const kept = new Map();
  for (const [key, { months = [] } = {}] of Object.entries(index.leagues || {})) {
    const games = new Map();
    for (const m of months) for (const [k, v] of Object.entries((await store.json(`${PM_PACK}/${key}/${m}.json`))?.games || {})) games.set(k, v);
    kept.set(key, games);
  }
  const stats = { lines: 0, espn: 0, none: 0, later: 0, dropped: 0 };

  const league = async (key, l, games) => {
    const season = await seasonOf(key, l);
    const espnDraws = l.data === 'espn' && ESPN_DRAWS.has(l.sport);
    const from = espnDraws ? now - 7 * DAY : keptFrom(season);
    const finished = (await finishedGames(key, l, from)).filter(g => Date.parse(g.start) >= from && Date.parse(g.start) < now - 3 * HOUR);
    for (const g of finished.filter(x => keeps(season, Date.parse(x.start)) && !games.has(gameKey(key, x)))) {
      const t = Date.parse(g.start);
      const entry = { t, post: g.post ? 1 : 0 };
      const k = gameKey(key, g);
      // ESPN's own line where it draws one.
      if (espnDraws) {
        const summary = await read(`${SITE}/${l.espn}/summary?event=${g.id}`).catch(() => null);
        if ((summary?.winprobability || []).length > 3) {
          stats.espn++;
          games.set(k, { ...entry, none: 'espn' });
          continue;
        }
      }
      const line = await polymarketLine(key, { start: g.start, home: g.home.en, away: g.away.en }, source).catch(() => null);
      if (line) stats.lines++, games.set(k, { ...entry, ...packLine(line) });
      else if (now - t > GIVE_UP) stats.none++, games.set(k, { ...entry, none: 'polymarket' });
      else stats.later++;
    }
    for (const [k, v] of games) if (!keeps(season, v.t)) games.delete(k), stats.dropped++;
  };

  // F1: each race's chances by lap (OpenF1's laps once it has them). Kept:
  // this year's races; until this year's first, last year's too.
  const f1 = async games => {
    const races = [];
    for (const y of [year - 1, year]) races.push(...((await read(`https://api.openf1.org/v1/sessions?year=${y}&session_name=Race`).catch(() => null)) || []));
    const started = races.some(r => new Date(r.date_start).getUTCFullYear() === year && Date.parse(r.date_start) < now);
    const keep = t => new Date(t).getUTCFullYear() === year || (!started && new Date(t).getUTCFullYear() === year - 1);
    // OpenF1 lets some 30 reads a minute: two seconds apart, the same one never twice.
    const seen = new Map();
    let next = 0;
    const f1read = (url, o = {}) => {
      if (!url.startsWith('https://api.openf1.org/')) return source(url, o);
      if (!seen.has(url))
        seen.set(
          url,
          (async () => {
            const wait = Math.max(0, next - Date.now());
            next = Math.max(next, Date.now()) + 2100;
            await sleep(wait);
            return read(url);
          })()
        );
      return seen.get(url);
    };
    for (const r of races) {
      const t = Date.parse(r.date_start);
      const k = raceKey(r.date_start);
      let had = games.get(k);
      if (had?.none && had.nv !== TURNS) games.delete(k), (had = undefined);
      if (keep(t) && had?.by === 'lap' && had.lv !== LINE) {
        const laps = await raceLaps(r.date_start, f1read).catch(() => null);
        const line = laps && (await raceLine(r.date_start, f1read, laps).catch(() => null));
        const ev = line && (await raceEvents(r.date_start, f1read, laps, line.drivers).catch(() => null));
        if (ev) games.set(k, { t, ...packRace(Object.assign(line, ev)), bv: TURNS, lv: LINE }), stats.lines++;
        continue;
      }
      if (keep(t) && had?.by === 'lap' && had.bv !== TURNS) {
        const laps = await raceLaps(r.date_start, f1read).catch(() => null);
        const ev = laps && (await raceEvents(r.date_start, f1read, laps, had.d).catch(() => null));
        if (ev) Object.assign(had, { b: ev.bands, e: ev.events, bv: TURNS }), stats.lines++;
        continue;
      }
      if (!keep(t) || had || t > now - 4 * HOUR || r.is_cancelled) continue;
      const laps = await raceLaps(r.date_start, f1read).catch(() => null);
      if (!laps && now - t < GIVE_UP) {
        stats.later++;
        continue;
      }
      const line = await raceLine(r.date_start, f1read, laps).catch(() => null);
      if (line && laps) Object.assign(line, (await raceEvents(r.date_start, f1read, laps, line.drivers).catch(() => null)) || {});
      if (line) stats.lines++, games.set(k, { t, ...packRace(line), ...(line.bands ? { bv: TURNS } : {}), lv: LINE });
      else if (now - t > GIVE_UP) stats.none++, games.set(k, { t, none: 'polymarket', nv: TURNS });
      else stats.later++;
    }
    for (const [k, v] of games) if (!keep(v.t)) games.delete(k), stats.dropped++;
  };

  const files = {};
  const out = { built: new Date(now).toISOString().slice(0, 10), leagues: {} };
  for (const [key, l] of [...Object.entries(CATALOG).filter(([k]) => PM_LEAGUE[k]), ['f1', null]]) {
    const games = kept.get(key) || new Map();
    if (key === 'f1') await f1(games);
    else await league(key, l, games);
    const months = new Map();
    for (const [k, v] of games) {
      const m = month(v.t);
      if (!months.has(m)) months.set(m, {});
      months.get(m)[k] = v;
    }
    for (const [m, list] of months) files[`${PM_PACK}/${key}/${m}.json`] = { games: list };
    out.leagues[key] = { months: [...months.keys()].sort(), kept: games.size };
  }
  files[`${PM_PACK}/index.json`] = out;
  // Written where it changed; a month let go is gone.
  await store.replace(`${PM_PACK}/`, files);
  return stats;
}
