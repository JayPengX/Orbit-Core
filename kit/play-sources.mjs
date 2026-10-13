// Fetches upcoming MLB and Premier League odds (DraftKings via ESPN,
// Polymarket), the next F1 race-winner market and championship (futures)
// markets through the shared sports proxy, which adds the CORS headers
// Polymarket doesn't send.
// The reads go through whoever uses this (`useReader`): the phone's kit
// (proxyJson, packJson: memory, the device, the mirror, the proxy), or the
// Worker's own reads when it checks a bet's price.
let reader = { proxyJson: () => Promise.reject(new Error('no reader')), packJson: null };
export const useReader = r => (reader = { ...reader, ...r });
import { americanToProbability, devigProportional, devigPower } from '#kit/play-odds.mjs';
import { normalizeTeamName, teamZh, LEAGUES, familyOf, isSoccer, rememberLogo, rememberTeams, hasTeams } from '#kit/play-teams.mjs';
import { shareLeft } from '#kit/play-live.mjs';
import { KAMBI, kambiUrl, parseKambiEvents, parseKambiInPlay, useKambiToken, fetchKambiLeague, watchKambiMatches, fetchKeptKambi } from '#kit/play-kambi.mjs';
import { KAMBI_LEAGUES } from '#kit/play-teams.mjs';
import { withHousePrices, loadStrengths } from '#kit/play-house.mjs';
import { SOLD_DAYS, ASIA_URL, asiaMonth, asiaMonthOf } from '#kit/catalog.mjs';
import { parseAsiaSchedule } from '#kit/play-schedules.mjs';
import { offersUrl, parseOffers } from '#kit/play-offers.mjs';
import { loadGamePlayers } from '#kit/play-players.mjs';

export const PROXY_URL = 'https://orbit-workers-proxy.pengzjay.workers.dev';
// Reading results and the parsers both the phone and the Worker's settling
// use: the shared kit's (settle.mjs), one copy.
import { yyyymmdd, parseJsonArray, futureTeamName, sameGame, sameSide, parseOpenF1Flags, parseEspnResults, parseEspnRace, parseEspnPole, parseFutureResult, teamCorners, asiaResult, kambiUnresolvable, kambiInPlay, readOutcomes, F1_FLAG_KINDS } from '#kit/settle.mjs';
export { futureTeamName, parseOpenF1Flags, parseEspnResults, parseEspnRace, parseEspnPole, parseFutureResult, teamCorners, asiaResult, kambiUnresolvable, kambiInPlay, F1_FLAG_KINDS };
const ESPN = 'https://site.api.espn.com/apis/site/v2/sports';
const GAMMA = 'https://gamma-api.polymarket.com';
const POLYMARKET_TAG = { mlb: 100381, epl: 306, f1: 100389, nba: 745 };
// Every game on the board starts within this many days (the kit's SOLD_DAYS),
// whatever its league and whoever prices it: a bookmaker, a market, or the
// house (house.mjs). Past the week of daily pages, the month pages (one
// answer a month) fill in the rest.
export const DAYS_AHEAD = SOLD_DAYS;
const DAILY_DAYS = 7;
const DAY_MS = 86_400_000;
const TAIPEI_OFFSET_MS = 8 * 60 * 60 * 1000;

// Taiwan date (YYYY-MM-DD) of a moment. Taiwan has no daylight saving time.
// Kept by the moment asked (every bet of a game asks with its start, a
// redraw thousands of times: a fifth of a second on a phone).
const dayKeys = new Map();
export function taipeiDayKey(date) {
  const at = typeof date === 'string' || typeof date === 'number' ? date : null;
  if (at != null && dayKeys.has(at)) return dayKeys.get(at);
  const key = new Date(new Date(date).getTime() + TAIPEI_OFFSET_MS).toISOString().slice(0, 10);
  if (at != null) {
    if (dayKeys.size > 5000) dayKeys.clear();
    dayKeys.set(at, key);
  }
  return key;
}

// End of the day `days` after today, Taiwan time. MLB games are listed up to
// the end of tomorrow (days = 1).
export function lotteryWindowEnd(now, days = 1) {
  const [y, m, d] = taipeiDayKey(now).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1 + days) - TAIPEI_OFFSET_MS);
}

// The NBA only shows during its season: from opening night (the first
// Tuesday on or after 19 October) to the end of June, after the Finals.
export function nbaInSeason(now) {
  const day = taipeiDayKey(now);
  const year = Number(day.slice(0, 4));
  const opener = new Date(Date.UTC(year, 9, 19));
  opener.setUTCDate(19 + ((2 - opener.getUTCDay() + 7) % 7));
  return day >= opener.toISOString().slice(0, 10) || day <= `${year}-06-30`;
}

const MATCHWEEK_MAX_GAP_MS = 4 * DAY_MS;

// Premier League games of the next matchweek. ESPN doesn't label rounds, but
// every club plays once per round: from the next game, take games in order
// until a club would play twice (or the fixtures stop for over 4 days).
export function nextMatchweek(games) {
  const sorted = [...games].sort((a, b) => a.startUtc.localeCompare(b.startUtc));
  const clubs = new Set();
  const week = [];
  for (const game of sorted) {
    const teams = [normalizeTeamName(game.away.en ?? game.away), normalizeTeamName(game.home.en ?? game.home)];
    const last = week.at(-1);
    if (teams.some(team => clubs.has(team))) break;
    if (last && Date.parse(game.startUtc) - Date.parse(last.startUtc) > MATCHWEEK_MAX_GAP_MS) break;
    teams.forEach(team => clubs.add(team));
    week.push(game);
  }
  return week;
}

// What the page lists: every game the sources have that hasn't started yet
// and starts within DAYS_AHEAD, in start order.
export function lotteryGames(games, now) {
  const t = now.getTime();
  return games.filter(g => Date.parse(g.startUtc) > t && Date.parse(g.startUtc) <= t + DAYS_AHEAD * DAY_MS).sort((a, b) => a.startUtc.localeCompare(b.startUtc));
}

// Championship markets. Polymarket lists next season's market before this
// one ends, so the lowest year in the title wins.
export const FUTURES = [
  { key: 'ws', sport: 'mlb', title: /World Series Champion/i },
  { key: 'al', sport: 'mlb', title: /American League Champion$/i },
  { key: 'nl', sport: 'mlb', title: /National League Champion$/i },
  { key: 'epl', sport: 'epl', title: /^EPL: \d{4} Champion$/i },
  { key: 'nba', sport: 'nba', title: /^NBA: \d{4} Champion$/i }
];

// More championships, found with Polymarket's search after the page opens
// (they aren't under the tags the page already reads).
export const EXTRA_FUTURES = [
  { key: 'nfl', sport: 'nfl', query: 'Pro Football Champion', title: /^Pro Football: \d{4} Champion$/i },
  { key: 'nhl', sport: 'nhl', query: 'NHL Champion', title: /^NHL: \d{4} Champion$/i },
  { key: 'wnba', sport: 'wnba', query: 'WNBA Champion', title: /^WNBA: \d{4} Champion$/i },
  { key: 'ucl', sport: 'ucl', query: 'UEFA Champions League Champion', title: /^UEFA Champions League: \d{4} Champion$/i },
  { key: 'uel', sport: 'uel', query: 'UEFA Europa League Champion', title: /^UEFA Europa League: \d{4} Champion$/i },
  { key: 'laliga', sport: 'laliga', query: 'LALIGA Champion', title: /^LALIGA: \d{4} Champion$/i },
  { key: 'seriea', sport: 'seriea', query: 'Serie A Champion', title: /^Serie A: \d{4} Champion$/i },
  { key: 'bundesliga', sport: 'bundesliga', query: 'Bundesliga Champion', title: /^Bundesliga: \d{4} Champion$/i },
  { key: 'ligue1', sport: 'ligue1', query: 'Ligue 1 Champion', title: /^Ligue 1: \d{4} Champion$/i },
  { key: 'mls', sport: 'mls', query: 'MLS Cup Winner', title: /^MLS Cup Winner \d{4}$/i },
  { key: 'f1drivers', sport: 'f1', query: "F1 Drivers' Champion", title: /^F1 Drivers' Champion$/i },
  { key: 'f1constructors', sport: 'f1', query: "F1 Constructors' Champion", title: /^F1 Constructors' Champion$/i }
];

// The proxy answers signed-in apps only: the Quadra session (quadra.mjs)
// supplies the token.
let session = null;
export function useSourcesSession(s) {
  session = s;
  useKambiToken(() => session?.token || '');
}

// Through the kit's proxyJson: the dozens of lists the page asks for at
// start-up go in batches (one Worker request per 12), and each answer is
// kept (memory, and on the device when it lasts) for as long as that data
// stays useful: live scores and odds 20 seconds (Kambi's in-play lists too),
// Kambi's pre-match lists 2 minutes, championship markets 10 minutes, a game's pre-game line an hour.
function ttlFor(url) {
  if (url.includes('/public-search')) return 10 * 60_000;
  if (url.includes('/in-play.json')) return LIVE_TTL;
  // A game's own markets (offers.mjs): a live game's at the live pace.
  if (url.includes('/betoffer/')) return url.includes('live=1') ? LIVE_TTL : 2 * 60_000;
  // A Kambi match's own score (open bets in play).
  if (url.includes('/livedata.json')) return LIVE_TTL;
  if (url.includes('/listView/')) return 2 * 60_000;
  if (url.includes('/summary?event=')) return 60 * 60_000;
  if (url.includes('/standings') || url.includes('/rankings')) return 6 * 60 * 60_000;
  // Rosters and players' seasons (players.mjs): a few hours.
  if (url.includes('/roster') || url.includes('/statistics/byathlete')) return 3 * 60 * 60_000;
  if (url.startsWith(ASIA_URL)) return 10 * 60_000;
  if (url.includes('statsapi.mlb.com') && url.includes('gameType=')) return 5 * 60_000;
  if (/scoreboard\?dates=\d{6}$/.test(url)) return 10 * 60_000;
  // A day's scoreboard: live around today (games on now), else a minute.
  const day = /scoreboard\?dates=(\d{8})$/.exec(url)?.[1];
  if (day) return Math.abs(Date.parse(`${day.slice(0, 4)}-${day.slice(4, 6)}-${day.slice(6)}T12:00:00Z`) - Date.now()) < 36 * 3_600_000 ? LIVE_TTL : 60_000;
  if (/scoreboard\?dates=/.test(url)) return 60_000;
  // A finished F1 session from F1's archive: it doesn't change.
  if (url.startsWith('https://f1-live.quadra/session.json')) return 24 * 3_600_000;
  return LIVE_TTL;
}
// What's on now is read again after this long (the proxy keeps it 10 s).
// Kept on the phone only to share one read: the refresh speed is the admin panel's (kit dev).
const LIVE_TTL = 2_000;
// The kit already asks a failing list again (a batch's failure on its own,
// then once more): no third and fourth try here.
export function getJson(url, trim) {
  const ttl = ttlFor(url);
  return reader.proxyJson(url, { ttl, trim: trim || '', persist: ttl >= 60_000, timeout: 30_000 });
}

// ---- ESPN (DraftKings) --------------------------------------------------------

function closeProbability(side) {
  return americanToProbability(side?.close?.odds);
}

// Every league's game starts seen on its scoreboards (which leagues may have
// a game on now, for the live board), and each game's pregame line by ESPN
// id (its live odds' starting point, without asking for the game's summary).
const seenStarts = new Map();
const espnPregame = new Map();

export function parseEspnScoreboard(data, sport, post = null) {
  const games = [];
  for (const event of data.events || []) {
    const comp = event.competitions?.[0];
    if (comp && Number.isFinite(Date.parse(event.date))) {
      if (!seenStarts.has(sport)) seenStarts.set(sport, new Set());
      seenStarts.get(sport).add(Date.parse(event.date));
    }
    if (!comp || comp.status?.type?.state !== 'pre') continue;
    // MLB's own list of its postseason (kit/postseason.mjs), over ESPN's
    // copy of it: whether the game is still "If Necessary", its time, and
    // whether it's off the list (its series over).
    const note = comp.notes?.[0]?.headline || '';
    const sides = Object.fromEntries((comp.competitors || []).map(c => [c.homeAway, { displayName: c.team?.displayName }]));
    const mlb = post?.list && note ? post.k.mlbGameFor(post.list, { note, ...sides }) : null;
    if (post?.list && !mlb && post.k.mlbGone?.(post.list, { note, ...sides }, mlbDay(event.date), post.from)) continue;
    // A play-off game not to sell: a side not known yet ("TBD", "CLE/CHW"),
    // or one only played if needed (sold once it's sure, by Kambi or ESPN).
    if (comp.competitors.some(c => undecidedSide(c.team)) || (mlb ? mlb.maybe : /if necessary/i.test(note))) continue;
    const teams = Object.fromEntries(comp.competitors.map(c => [c.homeAway, c.team.displayName]));
    // ESPN's team ids: the rosters of the game's players (players.mjs).
    const teamIds = Object.fromEntries(comp.competitors.map(c => [c.homeAway, c.team.id ? String(c.team.id) : null]));
    for (const c of comp.competitors) rememberLogo(sport, c.team.displayName, c.team.logo);
    const odds = comp.odds?.[0];
    const ml = odds?.moneyline;
    let outcomes = null;
    if (isSoccer(sport)) {
      const fair = devigProportional([closeProbability(ml?.away), closeProbability(ml?.draw), closeProbability(ml?.home)]);
      if (fair) outcomes = { away: fair[0], draw: fair[1], home: fair[2] };
    } else {
      const fair = devigProportional([closeProbability(ml?.away), closeProbability(ml?.home)]);
      if (fair) outcomes = { away: fair[0], home: fair[1] };
    }
    let total = null;
    const over = odds?.total?.over?.close;
    const under = odds?.total?.under?.close;
    if (over?.line && under) {
      const line = Number(String(over.line).replace(/^[ou]/, ''));
      const fair = devigProportional([americanToProbability(over.odds), americanToProbability(under.odds)]);
      if (Number.isFinite(line) && fair) total = { line, overFair: fair[0] };
    }
    // Run line / handicap from the away team's side: { awayLine: -1.5, awayFair }.
    let spread = null;
    const awaySpread = odds?.pointSpread?.away?.close;
    const homeSpread = odds?.pointSpread?.home?.close;
    if (awaySpread?.line && homeSpread) {
      const awayLine = Number(awaySpread.line);
      const fair = devigProportional([americanToProbability(awaySpread.odds), americanToProbability(homeSpread.odds)]);
      // Baseball and soccer lines are half runs/goals; football and basketball
      // lines can be whole points (a push is rare enough to ignore).
      const whole = ['football', 'basketball'].includes(familyOf(sport));
      if (Number.isFinite(awayLine) && (whole || awayLine % 1 !== 0) && fair) spread = { awayLine, awayFair: fair[0] };
    }
    if (outcomes) espnPregame.set(`${sport}|${event.id}`, { homeWin: outcomes.home, awayWin: outcomes.away, draw: outcomes.draw ?? 0, totalLine: total?.line ?? null, overFair: total?.overFair ?? 0.5 });
    // Dated but not timed yet (timeValid false: the day's 00:00 in New
    // York): a book's time for it (Kambi's, Polymarket's) when one lists it,
    // else the earliest it can start (noon there, 00:00 the next day here),
    // sold until then, its time shown as 待定.
    const timeTbd = (mlb ? mlb.timeTbd : comp.timeValid === false) || undefined;
    const start = mlb ? (timeTbd ? Date.parse(`${mlb.day}T16:00:00Z`) : Date.parse(mlb.start)) : timeTbd && ET_MIDNIGHT.test(event.date) ? Date.parse(event.date) + 12 * 3_600_000 : Date.parse(event.date);
    games.push({ sport, startUtc: new Date(start).toISOString(), away: teams.away, home: teams.home, teamIds, neutral: Boolean(comp.neutralSite), preseason: event.season?.type === 1, outcomes, total, spread, ...(timeTbd ? { timeTbd } : {}) });
  }
  return games;
}
// A play-off place still being played for: ESPN's "TBD", "CLE/CHW", an id of 0 or less.
const undecidedSide = t => !t || /^tbd$/i.test(String(t.abbreviation || t.displayName || '').trim()) || String(t.abbreviation || '').includes('/') || Number(t.id) <= 0 || /\//.test(String(t.displayName || ''));
const ET_MIDNIGHT = /T0[45]:00(:00)?(\.000)?Z$/;
// A game without its time an hour within which a book's own listing can stand for it.
const TBD_MATCH_MS = 30 * 3_600_000;

// Past the daily pages (football's: its current week, so from now), up to
// DAYS_AHEAD: the games on the months' pages (ESPN answers `dates=YYYYMM`
// with the whole month), none already listed.
export function monthsAhead(now, fromDay = DAILY_DAYS) {
  const months = new Set();
  for (let d = fromDay; d <= DAYS_AHEAD; d++) months.add(yyyymmdd(new Date(now.getTime() + d * DAY_MS)).slice(0, 6));
  return [...months];
}
export function laterGames(games, listed, now, fromDay = DAILY_DAYS) {
  const from = now.getTime() + fromDay * DAY_MS;
  const to = now.getTime() + DAYS_AHEAD * DAY_MS;
  const key = g => `${g.startUtc}|${normalizeTeamName(g.away)}|${normalizeTeamName(g.home)}`;
  const seen = new Set(listed.map(key));
  return games.filter(g => {
    const t = Date.parse(g.startUtc);
    if (t <= from || t > to || seen.has(key(g))) return false;
    seen.add(key(g));
    return true;
  });
}
async function withLaterGames(sport, path, listed, now, fromDay = DAILY_DAYS) {
  const pages = await Promise.all(monthsAhead(now, fromDay).map(m => getJson(`${ESPN}/${path}/scoreboard?dates=${m}`).catch(() => null)));
  const later = laterGames(pages.filter(Boolean).flatMap(page => parseEspnScoreboard(page, sport)), listed, now, fromDay);
  return withHousePrices(await withKambiBook([...listed, ...later], sport, now), sport, path, getJson);
}

// ---- Kambi first ----------------------------------------------------------------
//
// An ESPN league Kambi lists too (the catalogue's `kambi` path, LEAGUES' `book`):
// each game gets Kambi's prices as `kambi` ({ outcomes, spread, total,
// kambiId }), turned to ESPN's home and away. Kambi's list is the board's first
// price, DraftKings' (through ESPN) the second; the house's own only where
// neither prices the game (house.mjs). The Kambi id also opens the game's
// full list of markets and players (kambi.mjs offers).
export function attachKambi(games, kambiGames) {
  const used = new Set();
  return games.map(g => {
    const t = Date.parse(g.startUtc);
    let flip = false;
    const i = kambiGames.findIndex((k, j) => {
      if (used.has(j) || Math.abs(Date.parse(k.startUtc) - t) > (g.timeTbd ? TBD_MATCH_MS : 12 * 3_600_000)) return false;
      if (sameSide(k.home.en, g.home) && sameSide(k.away.en, g.away)) return !(flip = false);
      if (sameSide(k.home.en, g.away) && sameSide(k.away.en, g.home)) return (flip = true);
      return false;
    });
    if (i < 0) return g;
    used.add(i);
    const k = kambiGames[i];
    const o = k.draftKings;
    const outcomes = o ? (flip ? { ...o, home: o.away, away: o.home } : { ...o }) : null;
    const spread = k.spread ? (flip ? { awayLine: -k.spread.awayLine, awayFair: 1 - k.spread.awayFair } : k.spread) : null;
    // (Its time, where ESPN hasn't set one: Kambi's.)
    const timed = g.timeTbd ? { startUtc: k.startUtc, timeTbd: undefined } : {};
    return { ...g, ...timed, kambi: { outcomes, spread, total: k.total, kambiId: k.kambiId } };
  });
}
// Each league's Kambi list, asked for alongside its ESPN pages (not after them).
const bookLists = new Map();
function kambiBook(key) {
  const book = LEAGUES[key]?.book;
  if (!book) return Promise.resolve(null);
  const url = kambiUrl(book);
  if (!bookLists.has(url) || Date.now() - bookLists.get(url).at > 60_000) bookLists.set(url, { at: Date.now(), p: getJson(url, 'kambi-events').catch(() => null) });
  return bookLists.get(url).p;
}
async function withKambiBook(games, key, now) {
  if (!LEAGUES[key]?.book || !games.length) return games;
  const data = await kambiBook(key);
  return data ? attachKambi(games, parseKambiEvents(data, key, now)) : games;
}

const fetchEspnMlb = now => fetchMonths('mlb', 'baseball/mlb', now);

// MLB's postseason list (kit/postseason.mjs; an older kit without it: none),
// read with MLB's months while any of its games to come is a play-off one.
const mlbDay = t => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date(t));
const postKit = import('#kit/postseason.mjs').catch(() => null);
const f1Kit = import('#kit/f1live.mjs').catch(() => null);
async function mlbPostseason(pages, now) {
  const playoff = pages.some(p => (p?.events || []).some(e => e.season?.type === 3 && e.status?.type?.state === 'pre'));
  const k = playoff ? await postKit : null;
  if (!k?.mlbPostseason) return null;
  const from = mlbDay(now.getTime() - DAY_MS);
  const data = await getJson(k.mlbPostseasonUrl(from.slice(0, 4))).catch(() => null);
  return data?.dates ? { k, from, list: k.mlbPostseason(data) } : null;
}
const fetchEspnEpl = now => fetchMonths('epl', LEAGUES.epl.path, now);

// A league's games from the months' pages (ESPN answers `dates=YYYYMM` with
// the whole month, odds and all) within the board's reach: one or two
// requests a league where day pages took nine. Cups and national teams too
// (their default page can be a round long past, their calendar lists stages).
async function fetchMonths(key, path, now) {
  kambiBook(key);
  loadStrengths(key, path, getJson).catch(() => {});
  const pages = await Promise.all(monthsAhead(now, -1).map(m => getJson(`${ESPN}/${path}/scoreboard?dates=${m}&limit=1000`).catch(() => null)));
  if (pages.every(p => p === null)) throw new Error(`ESPN ${key} unreachable`);
  const post = key === 'mlb' ? await mlbPostseason(pages, now) : null;
  const games = laterGames(pages.filter(Boolean).flatMap(page => parseEspnScoreboard(page, key, post)), [], now, -1);
  return withHousePrices(await withKambiBook(games, key, now), key, path, getJson);
}

// Every other league: its months' pages; football its current week (the
// default page: college football's month pages list only ranked teams) and
// the months after.
async function fetchLeague(key, now) {
  const { family, path } = LEAGUES[key];
  if (family !== 'football') return fetchMonths(key, path, now);
  kambiBook(key);
  loadStrengths(key, path, getJson).catch(() => {});
  return withLaterGames(key, path, parseEspnScoreboard(await getJson(`${ESPN}/${path}/scoreboard`), key), now, 0);
}

// Leagues fetched from ESPN alone (DraftKings); MLB and the Premier League
// also have Polymarket.
export const EXTRA_LEAGUES = Object.keys(LEAGUES).filter(key => LEAGUES[key].path && !['mlb', 'epl'].includes(key));

// ---- Polymarket ---------------------------------------------------------------

async function fetchPolymarketEvents(tagId, trim) {
  const events = [];
  for (let page = 0; page < 10; page++) {
    const batch = await getJson(
      `${GAMMA}/events?tag_id=${tagId}&closed=false&limit=100&offset=${page * 100}&order=startTime&ascending=true`,
      trim
    );
    events.push(...batch);
    if (batch.length < 100) break;
  }
  return events;
}

function eventTeams(event) {
  if (!Array.isArray(event.teams) || event.teams.length !== 2) return null;
  const away = event.teams.find(t => t.ordering === 'away')?.name;
  const home = event.teams.find(t => t.ordering === 'home')?.name;
  return away && home ? { away, home } : null;
}

// MLB: one combined market whose question is the event title.
export function parsePolymarketMlb(events, now) {
  const games = [];
  for (const event of events) {
    const start = Date.parse(event.startTime);
    if (!Number.isFinite(start) || start <= now.getTime()) continue;
    const market = (event.markets || []).find(m => m.question === event.title);
    const prices = market && parseJsonArray(market.outcomePrices)?.map(Number);
    const outcomes = market && parseJsonArray(market.outcomes);
    if (!prices || !outcomes) continue;
    const teams = eventTeams(event) ?? { away: outcomes[0], home: outcomes[1] };
    const iAway = outcomes.indexOf(teams.away);
    const iHome = outcomes.indexOf(teams.home);
    if (iAway < 0 || iHome < 0) continue;
    const fair = devigProportional([prices[iAway], prices[iHome]]);
    if (!fair) continue;
    games.push({
      sport: 'mlb',
      startUtc: new Date(start).toISOString(),
      ...teams,
      outcomes: { away: fair[0], home: fair[1] },
      liquidity: Math.round(Number(market.liquidity) || 0)
    });
  }
  return games;
}

// EPL: three separate Yes/No markets per match ("Will X win on …?",
// "Will X vs. Y end in a draw?", "Will Y win on …?").
export function parsePolymarketEpl(events, now) {
  const games = [];
  for (const event of events) {
    const start = Date.parse(event.startTime);
    const teams = eventTeams(event);
    if (!Number.isFinite(start) || start <= now.getTime() || !teams) continue;
    const yes = {};
    let liquidity = Infinity;
    for (const market of event.markets || []) {
      const outcomes = parseJsonArray(market.outcomes);
      const prices = parseJsonArray(market.outcomePrices);
      if (!outcomes || !prices || outcomes.length !== 2) continue;
      const price = Number(prices[outcomes.findIndex(o => /^yes$/i.test(o))]);
      if (!(price >= 0)) continue;
      const question = market.question || '';
      let key = null;
      if (/end in a draw/i.test(question)) key = 'draw';
      else {
        const who = /^will (.+?) win\b/i.exec(question)?.[1];
        if (who && normalizeTeamName(who) === normalizeTeamName(teams.away)) key = 'away';
        else if (who && normalizeTeamName(who) === normalizeTeamName(teams.home)) key = 'home';
      }
      if (!key || key in yes) continue;
      yes[key] = price;
      liquidity = Math.min(liquidity, Number(market.liquidity) || 0);
    }
    const fair = devigProportional([yes.away, yes.draw, yes.home]);
    if (!fair) continue;
    games.push({
      sport: 'epl',
      startUtc: new Date(start).toISOString(),
      ...teams,
      outcomes: { away: fair[0], draw: fair[1], home: fair[2] },
      liquidity: Math.round(liquidity)
    });
  }
  return games;
}

// A race's winner board counts only when it's a market, not empty books:
// its prices add up to about one (an untraded driver's price is the middle
// of a 1%-60% book; Singapore 2026's "chances" came to 500%, and the
// favourites' rivals were priced at 65), and most of it is quoted tight.
const BOARD_MAX_SUM = 1.35;
export function trustedBoard(markets) {
  const books = markets.map(m => ({ p: Number(parseJsonArray(m.outcomePrices)?.[0]) || 0, bid: Number(m.bestBid), ask: Number(m.bestAsk) })).filter(b => b.p > 0);
  const sum = books.reduce((t, b) => t + b.p, 0);
  if (!books.length || sum > BOARD_MAX_SUM) return false;
  const quoted = books.filter(b => Number.isFinite(b.bid) && Number.isFinite(b.ask) && b.ask > 0);
  if (!quoted.length) return true;
  const tight = quoted.filter(b => b.ask - b.bid <= Math.max(0.04, 0.4 * b.p));
  return tight.reduce((t, b) => t + b.p, 0) >= 0.7 * quoted.reduce((t, b) => t + b.p, 0);
}
// A driver's quote that money stands behind: $1,000 traded on it and the book
// tight (bid to ask within a point, or a quarter of the price). Singapore 2026:
// Russell at 2.6-3.0% on $3.7k, his grid penalty priced in; Kambi still had 8.0.
export const FIRM_VOLUME = 1000;
export function firmQuote(m) {
  const bid = Number(m.bestBid);
  const ask = Number(m.bestAsk);
  if (!(Number(m.volume) >= FIRM_VOLUME) || !(bid > 0) || !(ask > bid)) return false;
  return ask - bid <= Math.max(0.01, 0.25 * ((bid + ask) / 2));
}
export function parseF1RaceWinner(events, now) {
  const event = events
    .filter(e => /^f1-.*-grand-prix-winner-\d{4}-\d{2}-\d{2}$/.test(e.slug) && Date.parse(e.startTime) > now.getTime())
    .sort((a, b) => Date.parse(a.startTime) - Date.parse(b.startTime))[0];
  if (!event) return null;
  const drivers = (event.markets || [])
    .filter(m => !m.closed)
    // Its last trade too, where it has traded: a price someone paid.
    .map(m => ({ name: m.groupItemTitle || m.question, raw: Number(parseJsonArray(m.outcomePrices)?.[0]), last: Number(m.volume) > 0 ? Number(m.lastTradePrice) || 0 : 0, firm: firmQuote(m), ask: Number(m.bestAsk) }))
    // Every priced driver, like the lottery's full list; Polymarket's unpriced
    // placeholders ("Driver A", "Other") drop out here.
    .filter(d => d.raw > 0 && !/^(driver [a-z]|other)$/i.test(d.name));
  if (!trustedBoard(event.markets.filter(m => !m.closed))) return null;
  const fair = devigPower(drivers.map(d => d.raw));
  return {
    title: event.title,
    slug: event.slug,
    source: 'polymarket',
    startUtc: new Date(event.startTime).toISOString(),
    drivers: drivers
      // A firm quote is the market's word now (an older trade may be from
      // before a grid penalty), at its ask: what buying it there costs, so
      // the house never pays out longer than the market (the cut on top).
      .map((d, i) => (d.firm ? { name: d.name, fair: Math.max(d.raw, d.ask), firm: true } : { name: d.name, fair: Math.max(fair[i], d.last > 0 && d.last < 1 ? d.last : 0) }))
      .sort((a, b) => b.fair - a.fair)
  };
}

// The race's boards as one: each driver at the most any of them gives
// (a bookmaker's board and a prediction market's quote and trades), so a
// thin board can't make a contender a longshot. A firm quote (firmQuote:
// traded and tight) stands over the others, the most of the firm ones:
// it moves with the news (Singapore 2026: Russell from the back of the grid,
// 3% on Polymarket's traded book while Kambi still had ~10%). Drivers
// matched by surname.
const surnameKey = n => {
  const words = String(n || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\b(jr|sr)\b\.?/g, '').trim().split(/\s+/);
  return words.at(-1).replace(/[^a-z]/g, '');
};
export function mergeF1Boards(...boards) {
  const out = new Map();
  for (const board of boards.filter(Boolean))
    for (const d of board.drivers || []) {
      const k = surnameKey(d.name);
      const had = out.get(k);
      const firm = !!d.firm;
      if (!had || (firm && !had.firm) || (firm === !!had.firm && d.fair > had.fair)) out.set(k, { name: had?.name ?? d.name, fair: d.fair, ...(firm || had?.firm ? { firm: true } : {}) });
    }
  return [...out.values()].sort((a, b) => b.fair - a.fair);
}

// Kambi's F1 race, for when Polymarket hasn't opened the next one yet (it
// opens some races only a few days out, some not at all): the next "Race:"
// event of its F1 list, and the drivers' chances from its winner prices.
const KAMBI_F1_LIST = `${KAMBI}/listView/formula_1/all/all/all/competitions.json?lang=en_GB&market=GB&useCombined=true`;
export function nextKambiF1Race(list, now) {
  return (list?.events || [])
    .map(x => x.event)
    // A Grand Prix ("Race: Bahrain GP 2026", "Singapore GP 2026"), not the season's
    // championships nor the weekend's other sessions (" Practice 1: Singapore GP 2026",
    // two days before the race and with no winner board: Russell went 3% on Polymarket alone).
    .filter(e => e && /^race:|\bGP\b|grand prix/i.test(e.name || '') && !/champion|practice|qualifying|sprint|shootout/i.test(e.name || '') && e.state === 'NOT_STARTED' && Date.parse(e.start) > now.getTime())
    .sort((a, b) => Date.parse(a.start) - Date.parse(b.start))[0] ?? null;
}
export function parseKambiF1Race(event, offers) {
  const offer = (offers?.betOffers || []).find(o => o.criterion?.englishLabel === 'GP Winner' && o.from === 1 && o.to === 1 && !o.suspended);
  const drivers = (offer?.outcomes || []).filter(o => o.odds > 1000 && o.participant).map(o => ({ name: o.participant, raw: 1000 / o.odds }));
  if (drivers.length < 10) return null;
  const fair = devigPower(drivers.map(d => d.raw));
  const gp = event.name.replace(/^race:\s*/i, '').replace(/\s*\d{4}$/, '').replace(/\bGP\b/, 'Grand Prix');
  return {
    title: gp,
    slug: `kambi-${event.id}`,
    source: 'kambi',
    startUtc: new Date(event.start).toISOString(),
    drivers: drivers.map((d, i) => ({ name: d.name, fair: fair[i] })).sort((a, b) => b.fair - a.fair)
  };
}

// Pole position (排位賽第一): Polymarket's driver pole market for the race
// weekend ("f1-…-grand-prix-driver-pole-position-<date>", opened a few days
// before), else Kambi's when it lists one. { source, drivers: [{ name, fair }] }
// or null (the page then prices it from the race winner's chances).
export function parseF1Pole(events, raceUtc) {
  const event = (events || []).find(e => /-driver-pole-position-\d{4}-\d{2}-\d{2}$/.test(e.slug || '') && !/sprint/.test(e.slug) && Math.abs(Date.parse(e.startTime || e.endDate) - Date.parse(raceUtc)) < 3 * DAY_MS);
  const drivers = (event?.markets || [])
    .filter(m => !m.closed)
    .map(m => ({ name: m.groupItemTitle || futureTeamName(m) || m.question, raw: Number(parseJsonArray(m.outcomePrices)?.[0]) }))
    .filter(d => d.raw > 0 && !/^(driver [a-z]|other)$/i.test(d.name));
  if (drivers.length < 10 || !trustedBoard(event.markets.filter(m => !m.closed))) return null;
  const fair = devigPower(drivers.map(d => d.raw));
  // How much it's traded (the pole model trusts it by this): the event's, else its markets'.
  const volume = Number(event.volume) || (event.markets || []).reduce((a, m) => a + (Number(m.volume) || 0), 0);
  return { source: 'polymarket', volume, drivers: drivers.map((d, i) => ({ name: d.name, fair: fair[i] })).sort((a, b) => b.fair - a.fair) };
}
export function parseKambiF1Pole(offers) {
  const offer = (offers?.betOffers || []).find(o => /pole|qualifying/i.test(o.criterion?.englishLabel || '') && !/sprint|team|constructor/i.test(o.criterion?.englishLabel || '') && !o.suspended);
  const drivers = (offer?.outcomes || []).filter(o => o.odds > 1000 && o.participant).map(o => ({ name: o.participant, raw: 1000 / o.odds }));
  if (drivers.length < 10) return null;
  const fair = devigPower(drivers.map(d => d.raw));
  // (A bookmaker's own prices: taken as fully traded.)
  return { source: 'kambi', volume: Infinity, drivers: drivers.map((d, i) => ({ name: d.name, fair: fair[i] })).sort((a, b) => b.fair - a.fair) };
}

// Safety car, virtual safety car and red flag during the race: yes or no.
// Polymarket's price when it has the race's market; else how often each
// happened in the 85 races of 2023 to Azerbaijan 2026 (OpenF1's race
// control messages): a safety car in 41, a VSC in 37, a red flag in 11.
export const F1_FLAG_BASE = { sc: 0.48, vsc: 0.44, red: 0.13 };
const FLAG_SLUG = { sc: /-safety-car-\d{4}-\d{2}-\d{2}$/, vsc: /-virtual-safety-car-\d{4}-\d{2}-\d{2}$/, red: /-red-flag-\d{4}-\d{2}-\d{2}$/ };
export function parseF1Flags(events, startUtc) {
  const out = {};
  for (const [key, slug] of Object.entries(FLAG_SLUG)) {
    const event = (events || []).find(e => slug.test(e.slug) && !(key === 'sc' && /virtual/.test(e.slug)) && Math.abs(Date.parse(e.startTime) - Date.parse(startUtc)) < 2 * DAY_MS);
    const market = event?.markets?.find(m => !m.closed);
    const yes = Number(parseJsonArray(market?.outcomePrices)?.[parseJsonArray(market?.outcomes)?.findIndex(o => /^yes$/i.test(o)) ?? 0]);
    const known = yes > 0.02 && yes < 0.98;
    out[key] = { fair: known ? yes : F1_FLAG_BASE[key], source: known ? 'polymarket' : 'history' };
  }
  return out;
}

// The next race weekend's qualifying and race start from ESPN's F1
// scoreboard: { qualifyingUtc, raceUtc } for the race nearest `startUtc`.
export function parseF1Schedule(data, startUtc) {
  let best = null;
  for (const event of data?.events || []) {
    const comps = event.competitions || [];
    const race = comps.find(c => c.type?.abbreviation === 'Race');
    const qual = comps.find(c => c.type?.abbreviation === 'Qual');
    if (!race) continue;
    const gap = Math.abs(Date.parse(race.date) - Date.parse(startUtc));
    if (gap > 4 * DAY_MS || (best && gap >= best.gap)) continue;
    best = { gap, raceUtc: new Date(race.date).toISOString(), qualifyingUtc: qual ? new Date(qual.date).toISOString() : null };
  }
  return best ? { raceUtc: best.raceUtc, qualifyingUtc: best.qualifyingUtc } : null;
}

// Each driver's places in the season's qualifying sessions before `beforeUtc`
// (ESPN's season scoreboard), newest first: [{ name, places }] (the pole model's form).
export function parseF1QualiForm(data, beforeUtc) {
  const sessions = (data?.events || [])
    .map(e => (e.competitions || []).find(c => c.type?.abbreviation === 'Qual' && c.status?.type?.completed))
    .filter(c => c && Date.parse(c.date) < Date.parse(beforeUtc))
    .sort((a, b) => Date.parse(b.date) - Date.parse(a.date))
    .slice(0, 8);
  const by = new Map();
  sessions.forEach((c, i) => {
    for (const x of c.competitors || []) {
      const name = x.athlete?.displayName;
      if (!name || !(Number(x.order) > 0)) continue;
      if (!by.has(name)) by.set(name, Array(sessions.length).fill(0));
      by.get(name)[i] = Number(x.order);
    }
  });
  return [...by].map(([name, places]) => ({ name, places }));
}

// ---- Futures ---------------------------------------------------------------

// "2026" for MLB; "2026/27" for leagues whose season spans two years (the
// questions say "2026-27", the titles only "2027").
function seasonLabel(event, sport) {
  const span = /(\d{4})-(\d{2})\b/.exec((event.markets || []).map(m => m.question).join(' '));
  if (span) return `${span[1]}/${span[2]}`;
  const year = Number(/\d{4}/.exec(event.title)?.[0]);
  if (!year) return '';
  // Seasons inside one calendar year (baseball, the WNBA, MLS, racing): the year alone.
  return ['mlb', 'wnba', 'mls', 'f1', 'cpbl', 'npb', 'kbo'].includes(sport) ? String(year) : `${year - 1}/${String(year).slice(2)}`;
}

// "Will (the) Los Angeles Dodgers win the 2026 World Series?" -> the team.
// Polymarket's placeholder markets ("Team C", "another team") are dropped, and
// so are eliminated teams (price 0).
export function parseFutures(events, sport, markets = FUTURES.filter(f => f.sport === sport)) {
  const out = [];
  for (const market of markets) {
    const year = e => Number(/\d{4}/.exec(e.title)?.[0] ?? 9999);
    const event = events.filter(e => market.title.test(e.title || '') && !e.closed).sort((a, b) => year(a) - year(b))[0];
    if (!event) continue;
    const teams = [];
    for (const m of event.markets || []) {
      const name = futureTeamName(m);
      if (!name || m.closed || /^(team [a-z]{1,3}|another team|other|driver [a-z]{1,3})$/i.test(name)) continue;
      const outcomes = parseJsonArray(m.outcomes);
      const prices = parseJsonArray(m.outcomePrices);
      const price = Number(prices?.[outcomes?.findIndex(o => /^yes$/i.test(o)) ?? 0]);
      if (price > 0) teams.push({ name, price });
    }
    const fair = devigProportional(teams.map(t => t.price));
    if (!fair || teams.length < 2) continue;
    out.push({
      key: market.key,
      sport: market.sport,
      slug: event.slug,
      season: seasonLabel(event, market.sport),
      teams: teams
        .map((t, i) => ({ name: { en: t.name, zh: teamZh(market.sport, t.name) }, fair: fair[i] }))
        .sort((a, b) => b.fair - a.fair)
    });
  }
  return out;
}

// The championships found by search, loaded in the background.
export async function loadExtraFutures() {
  const results = await Promise.allSettled(
    EXTRA_FUTURES.map(market => getJson(`${GAMMA}/public-search?q=${encodeURIComponent(market.query)}&limit_per_type=8&events_status=active`).then(d => parseFutures(d?.events || [], market.sport, [market])))
  );
  return results.flatMap(r => (r.status === 'fulfilled' ? r.value : []));
}

// ---- Merge --------------------------------------------------------------------

// DraftKings team names win (ESPN's naming is the stabler of the two).
// `scheduled`: the sports whose ESPN schedule was read: a Polymarket game
// not on it isn't one (Polymarket keeps a play-off's possible games open,
// Yankees–Rays game 5 after the Rays had swept). A game ESPN hasn't timed
// takes Polymarket's time, or isn't sold.
export function mergeGames(dkGames, pmGames, { scheduled = new Set() } = {}) {
  const used = new Set();
  const merged = dkGames.map(dk => {
    const i = pmGames.findIndex((pm, j) => !used.has(j) && (sameGame(dk, pm) || (dk.timeTbd && sameGame({ ...dk, startUtc: pm.startUtc }, pm) && Math.abs(Date.parse(dk.startUtc) - Date.parse(pm.startUtc)) <= TBD_MATCH_MS)));
    if (i >= 0) used.add(i);
    const pm = i >= 0 ? pmGames[i] : null;
    const base = dk.timeTbd && pm ? { ...dk, startUtc: pm.startUtc, timeTbd: undefined } : dk;
    return { base, dk: base, pm };
  });
  pmGames.forEach((pm, j) => {
    if (!used.has(j) && !scheduled.has(pm.sport)) merged.push({ base: pm, dk: null, pm });
  });
  return merged
    .map(({ base, dk, pm }) => ({
      id: `${base.sport}_${base.startUtc.slice(0, 13)}_${normalizeTeamName(base.away)}_${normalizeTeamName(base.home)}`.replaceAll(' ', ''),
      sport: base.sport,
      startUtc: base.startUtc,
      away: { en: base.away, zh: teamZh(base.sport, base.away) },
      home: { en: base.home, zh: teamZh(base.sport, base.home) },
      draftKings: dk?.outcomes ?? null,
      polymarket: pm?.outcomes ?? null,
      polymarketLiquidity: pm?.liquidity ?? null,
      // Kambi's prices (attachKambi), the first of the books.
      kambi: dk?.kambi?.outcomes ?? null,
      ...(dk?.kambi?.kambiId ? { kambiId: dk.kambi.kambiId } : {}),
      total: dk?.total ?? dk?.kambi?.total ?? null,
      spread: dk?.spread ?? dk?.kambi?.spread ?? null,
      // The house's own chances, where no bookmaker prices the game (house.mjs).
      house: dk && !dk.outcomes && !dk.kambi?.outcomes && !pm ? (dk.house ?? null) : null,
      // Settled from a final score alone (schedules.mjs): no markets on parts of it.
      scoreOnly: dk?.scoreOnly || undefined,
      ...(base.timeTbd ? { timeTbd: true } : {}),
      ...(dk?.teamIds?.home && dk?.teamIds?.away ? { espnTeams: dk.teamIds } : {})
    }))
    .filter(g => g.draftKings || g.polymarket || g.kambi || g.house)
    .sort((a, b) => a.startUtc.localeCompare(b.startUtc));
}

// `onProgress(share)` is called as each source finishes (0 to 1).
export async function loadOdds(now = new Date(), onProgress) {
  let finished = 0;
  const track = (promise, _, all) => promise.finally(() => onProgress?.(++finished / all.length));
  const results = await Promise.allSettled(
    [
      fetchEspnMlb(now),
      fetchPolymarketEvents(POLYMARKET_TAG.mlb, 'polymarket-events'),
      fetchEspnEpl(now),
      fetchPolymarketEvents(POLYMARKET_TAG.epl, 'polymarket-events'),
      fetchPolymarketEvents(POLYMARKET_TAG.f1),
      fetchPolymarketEvents(POLYMARKET_TAG.nba, 'polymarket-events'),
      // The whole season (the plain scoreboard stays on the last race until the
      // week's first session): the next race's qualifying time.
      // (Last night's pack: never the 6 MB page through the proxy.)
      (reader.packJson ? reader.packJson(`sports/f1/${now.getUTCFullYear()}.json`) : Promise.reject(new Error('no packs'))).catch(() => getJson(`${ESPN}/racing/f1/scoreboard?dates=${now.getUTCFullYear()}`)),
      getJson(KAMBI_F1_LIST)
    ].map(track)
  );
  if (results.every(r => r.status === 'rejected')) throw results[0].reason;
  const [mlbDk, mlbPm, eplDk, eplPm, f1, nbaPm, f1Espn, f1Kambi] = results.map(r => (r.status === 'fulfilled' ? r.value : []));
  // MotoGP is no longer sold (open bets still settle from its results).
  const moto = null;
  const race = await f1Race(f1, f1Espn, f1Kambi, now);
  return {
    loadedAt: now.toISOString(),
    games: lotteryGames(mergeGames([...mlbDk, ...eplDk], [...parsePolymarketMlb(mlbPm, now), ...parsePolymarketEpl(eplPm, now)], { scheduled: new Set([results[0].status === 'fulfilled' && 'mlb', results[2].status === 'fulfilled' && 'epl'].filter(Boolean)) }), now),
    f1: race,
    moto,
    futures: [...parseFutures(mlbPm, 'mlb'), ...parseFutures(eplPm, 'epl'), ...(nbaInSeason(now) ? parseFutures(nbaPm, 'nba') : [])]
  };
}

// The next race's board from Polymarket's F1 events, ESPN's season (its
// qualifying time and form) and Kambi's F1 list (its own board when
// Polymarket hasn't opened the race): null when neither prices it.
export async function f1Race(f1, f1Espn, f1Kambi, now = new Date()) {
  let race = parseF1RaceWinner(f1, now);
  // Kambi's board for the same race (or the next one when Polymarket hasn't opened it).
  const kambiRace = nextKambiF1Race(f1Kambi, now);
  let kambiOffers = null;
  if (kambiRace && (!race || Date.parse(kambiRace.start) < Date.parse(race.startUtc) + DAY_MS)) kambiOffers = await getJson(`${KAMBI}/betoffer/event/${kambiRace.id}.json?lang=en_GB&market=GB`).catch(() => null);
  const kambiBoard = kambiRace ? parseKambiF1Race(kambiRace, kambiOffers) : null;
  if (kambiBoard && (!race || Date.parse(kambiRace.start) < Date.parse(race.startUtc) - DAY_MS)) race = kambiBoard;
  else if (kambiBoard && race && Math.abs(Date.parse(kambiRace.start) - Date.parse(race.startUtc)) < DAY_MS) race = { ...race, source: 'polymarket+kambi', drivers: mergeF1Boards(race, kambiBoard) };
  if (race) {
    const sameRace = kambiRace && Math.abs(Date.parse(kambiRace.start) - Date.parse(race.startUtc)) < DAY_MS;
    Object.assign(race, {
      qualifyingUtc: parseF1Schedule(f1Espn, race.startUtc)?.qualifyingUtc ?? null,
      flags: parseF1Flags(f1, race.startUtc),
      pole: parseF1Pole(f1, race.startUtc) ?? (sameRace ? parseKambiF1Pole(kambiOffers) : null),
      qualiForm: parseF1QualiForm(f1Espn, race.startUtc)
    });
    // Its qualifying past its time and F1's own feed saying it hasn't begun
    // (a delay: Singapore 2026's ran half an hour late, and 排位賽第一 was off
    // the board all that time): still sold until it does. Unread, not.
    if (race.qualifyingUtc && Date.now() >= Date.parse(race.qualifyingUtc) && Date.now() - Date.parse(race.qualifyingUtc) < 3 * 3_600_000) {
      const kit = await f1Kit;
      const feed = kit ? await getJson(kit.F1_LIVE).catch(() => null) : null;
      const waiting = feed && kit.sameSession(feed, 'Qualifying', race.qualifyingUtc) && !feed.clock?.running && (feed.part || 0) <= 1 && /^(Inactive|)$/i.test(feed.session?.status || '') && !(feed.cars || []).some(c => c.best);
      race.qualifyingWaits = Boolean(waiting);
    }
  }
  return race;
}

// The next race's board read on its own (the Worker checking an F1 pick).
export async function loadF1Race(now = new Date()) {
  const [f1, f1Espn, f1Kambi] = await Promise.all([
    fetchPolymarketEvents(POLYMARKET_TAG.f1).catch(() => []),
    (reader.packJson ? reader.packJson(`sports/f1/${now.getUTCFullYear()}.json`) : Promise.reject(new Error('no packs'))).catch(() => getJson(`${ESPN}/racing/f1/scoreboard?dates=${now.getUTCFullYear()}`)).catch(() => []),
    getJson(KAMBI_F1_LIST).catch(() => [])
  ]);
  return f1Race(f1, f1Espn, f1Kambi, now);
}

// One game's own markets and players' markets from Kambi (offers.mjs), for
// a game with a Kambi id: { markets, props }, or null when Kambi can't be read.
export async function loadGameOffers(game, { live = false } = {}) {
  if (!game?.kambiId) return null;
  const data = await getJson(offersUrl(KAMBI, game.kambiId, live), 'kambi-offers').catch(() => null);
  return data ? parseOffers(data, game) : null;
}

// One game's players with their season numbers (players.mjs), or null.
// Rejects when a list couldn't be read (the app tries again later).
export const loadPlayers = game => loadGamePlayers(game, getJson);

// ---- Results (for saved slips) ------------------------------------------------


// Each league's ESPN path (its scoreboard), for the live boards.
const ESPN_PATH = Object.fromEntries(Object.entries(LEAGUES).map(([key, league]) => [key, league.path]));

// Outcomes for saved-slip legs that have started: legId -> outcome (see
// legResult). The reading is the shared kit's (settle.mjs readOutcomes), the
// same the Worker settles with; Kambi matches with bets on them are watched
// by the Worker (their scores kept from now on).
export async function fetchOutcomes(legs, now = new Date()) {
  watchKambiMatches(legs.filter(l => LEAGUES[l.sport]?.kambi && l.kambiId)).catch(() => {});
  return readOutcomes(legs, { read: getJson, keptKambi: fetchKeptKambi, now });
}

// ---- Live (場中) ------------------------------------------------------------------

// A baseball game's state from ESPN's short detail ("Top 4th", "Mid 4th",
// "Bot 4th", "End 4th", possibly after "Rain Delay, ").
export function parseInning(detail, period) {
  const half = /\b(Top|Mid|Bot|End)\b/.exec(detail || '')?.[1];
  const map = { Top: 'top', Mid: 'mid', Bot: 'bottom', End: 'end' };
  return half ? { inning: Number(period) || 1, half: map[half] } : null;
}

// Games in progress on an ESPN scoreboard, with their live state.
export function parseEspnLive(data, sport) {
  const games = [];
  for (const event of data.events || []) {
    const comp = event.competitions?.[0];
    if (!comp || comp.status?.type?.state !== 'in') continue;
    const side = ha => comp.competitors.find(c => c.homeAway === ha);
    const away = side('away');
    const home = side('home');
    if (!away || !home) continue;
    const game = {
      espnId: event.id,
      sport,
      startUtc: new Date(event.date).toISOString(),
      away: away.team.displayName,
      home: home.team.displayName,
      awayScore: Number(away.score) || 0,
      homeScore: Number(home.score) || 0,
      detail: comp.status.type.shortDetail || '',
      delayed: /delay|suspend/i.test(comp.status.type.shortDetail || '')
    };
    const family = familyOf(sport);
    if (family === 'baseball') {
      const inning = parseInning(game.detail, comp.status.period);
      if (!inning) continue;
      Object.assign(game, inning, { outs: Number(comp.situation?.outs) || 0 });
    } else if (family !== 'soccer') {
      // Hockey, football, basketball: the period and the seconds left in it.
      const period = Number(comp.status.period) || 0;
      const left = shareLeft(sport, period, comp.status.clock);
      if (left == null) continue;
      Object.assign(game, { period, clock: comp.status.displayClock || '', left });
    } else {
      // "67'" or "45'+2'"; half time counts as 45 played.
      const minute = /^(\d+)/.exec(comp.status.displayClock || '')?.[1];
      game.minute = /half/i.test(game.detail) ? 45 : Math.min(90, Number(minute) || 0);
    }
    games.push(game);
  }
  return games;
}

// Pregame lines from ESPN's game summary (DraftKings), with the margin removed.
export function parsePregameLines(summary) {
  const pick = (summary?.pickcenter || []).find(p => p.homeTeamOdds?.moneyLine != null) ?? summary?.pickcenter?.[0];
  if (!pick) return null;
  const home = americanToProbability(pick.homeTeamOdds?.moneyLine);
  const away = americanToProbability(pick.awayTeamOdds?.moneyLine);
  const draw = americanToProbability(pick.drawOdds?.moneyLine);
  const win = draw ? devigProportional([home, draw, away]) : devigProportional([home, away]);
  const total = devigProportional([americanToProbability(pick.overOdds), americanToProbability(pick.underOdds)]);
  if (!win) return null;
  return {
    homeWin: win[0],
    awayWin: win.at(-1),
    draw: draw ? win[1] : 0,
    totalLine: Number(pick.overUnder) || null,
    overFair: total ? total[0] : 0.5
  };
}

const pmNumber = (market, outcome) => {
  const outcomes = parseJsonArray(market.outcomes);
  const prices = parseJsonArray(market.outcomePrices);
  const i = outcomes?.findIndex(o => o === outcome || normalizeTeamName(o) === normalizeTeamName(outcome)) ?? -1;
  const price = Number(prices?.[i]);
  return i >= 0 && price > 0 && price < 1 ? price : null;
};

// Polymarket's live winner price for one game (the away team's chance), when
// enough money is behind it.
export function parsePolymarketLive(event, game, minLiquidity) {
  const market = (event.markets || []).find(m => m.question === event.title);
  if (!market || (Number(market.liquidity) || 0) < minLiquidity) return { awayWin: null };
  return { awayWin: pmNumber(market, game.away) };
}

const pregameCache = new Map();

// How long a game can run, by kind of sport: a league whose scoreboard showed
// a start within this long before now may have a game on.
const LIVE_HOURS = { baseball: 5, soccer: 2.5, football: 4.5, basketball: 3, hockey: 3.5 };

// The ESPN leagues that may have a game on now: MLB and the Premier League
// always, every other one whose scoreboard (read for the board) had a game
// starting within its sport's length.
export function liveLeagues(now = new Date()) {
  const t = now.getTime();
  const out = new Set(['mlb', 'epl']);
  for (const [sport, starts] of seenStarts) {
    const hours = LIVE_HOURS[familyOf(sport)];
    if (!hours || !ESPN_PATH[sport]) continue;
    for (const start of starts) {
      if (start <= t + 60_000 && start >= t - hours * 3_600_000) {
        out.add(sport);
        break;
      }
    }
  }
  return [...out];
}

// Every game in progress with its state and pregame lines: the ESPN leagues
// (MLB with Polymarket's live price too) and Kambi's, with Kambi's own live
// prices (`kambi`). Pregame lines come from the board's scoreboards or, for a
// game that had started before the page opened, its summary (once per game).
// A league's pages with its games on now: the default scoreboard, but for
// soccer today's dated pages (US dates run up to six hours behind): a cup's
// default page can be a round long past.
function liveEspnPages(key, now) {
  if (familyOf(key) !== 'soccer') return Promise.all([getJson(`${ESPN}/${ESPN_PATH[key]}/scoreboard`)]);
  const dates = [...new Set([now, new Date(now.getTime() - 6 * 3_600_000)].map(yyyymmdd))];
  return Promise.all(dates.map(d => getJson(`${ESPN}/${ESPN_PATH[key]}/scoreboard?dates=${d}`).catch(() => ({ events: [] }))));
}
const dedupe = games => [...new Map(games.map(g => [g.espnId, g])).values()];

export async function loadLive(now = new Date(), minLiquidity = 5000, { also = [] } = {}) {
  // (`also`: a league known to have a game on, which this page's reads may not have seen.)
  const leagues = [...new Set([...liveLeagues(now), ...also.filter(key => ESPN_PATH[key]).filter(key => !KAMBI_LEAGUES.includes(key))])];
  const [espn, kambi, books] = await Promise.all([
    Promise.all(leagues.map(key => liveEspnPages(key, now).then(pages => dedupe(pages.flatMap(d => parseEspnLive(d, key)))).catch(() => []))),
    Promise.all(KAMBI_LEAGUES.map(key => getJson(kambiUrl(LEAGUES[key].kambi, 'in-play'), 'kambi-events').then(d => parseKambiInPlay(d, key)).catch(() => []))),
    // Kambi's live prices of the ESPN leagues on now.
    Promise.all(leagues.filter(key => LEAGUES[key]?.book).map(key => getJson(kambiUrl(LEAGUES[key].book, 'in-play'), 'kambi-events').then(d => parseKambiInPlay(d, key)).catch(() => [])))
  ]);
  const games = attachKambiLive(espn.flat(), books.flat());
  const pmMlb = games.some(g => g.sport === 'mlb') ? await fetchPolymarketLiveEvents(POLYMARKET_TAG.mlb, now).catch(() => []) : [];
  await Promise.all(
    games.map(async game => {
      const key = `${game.sport}|${game.espnId}`;
      game.pregame = espnPregame.get(key) ?? null;
      if (!game.pregame) {
        if (!pregameCache.has(key)) pregameCache.set(key, getJson(`${ESPN}/${ESPN_PATH[game.sport]}/summary?event=${game.espnId}`).then(parsePregameLines).catch(() => null));
        game.pregame = await pregameCache.get(key);
        // Not read this time: asked again on the next refresh.
        if (!game.pregame) pregameCache.delete(key);
      }
      if (game.sport !== 'mlb') return;
      // The game's own event, not its side events ("… - 1st Inning Winner").
      const event = pmMlb.find(e => {
        if (/ - /.test(e.title || '')) return false;
        const teams = eventTeams(e);
        return teams && sameGame({ sport: game.sport, away: teams.away, home: teams.home, startUtc: new Date(e.startTime).toISOString() }, game);
      });
      game.pm = event ? parsePolymarketLive(event, game, minLiquidity) : null;
    })
  );
  return { loadedAt: now.toISOString(), games: games.filter(g => g.pregame || g.kambi), kambi: kambi.flat() };
}

// An ESPN game in play gets Kambi's live prices as `kambi` ({ kambiId, ml,
// spread, total }), turned to ESPN's sides: the board sells those where Kambi
// has them, the model the rest.
export function attachKambiLive(games, kambiGames) {
  return games.map(g => {
    let flip = false;
    const k = kambiGames.find(x => {
      if (x.sport !== g.sport) return false;
      if (sameSide(x.home, g.home) && sameSide(x.away, g.away)) return !(flip = false);
      if (sameSide(x.home, g.away) && sameSide(x.away, g.home)) return (flip = true);
      return false;
    });
    if (!k) return g;
    const ml = k.ml && flip ? { ...k.ml, home: k.ml.away, away: k.ml.home } : k.ml;
    const spread = k.spread && flip ? { awayLine: -k.spread.awayLine, awayFair: 1 - k.spread.awayFair } : k.spread;
    return { ...g, kambi: { kambiId: k.kambiId, ml, spread, total: k.total } };
  });
}

// Polymarket events that started in the last six hours (games in progress).
async function fetchPolymarketLiveEvents(tagId, now) {
  const since = new Date(now.getTime() - 6 * 3_600_000).toISOString();
  return getJson(`${GAMMA}/events?tag_id=${tagId}&closed=false&limit=100&order=startTime&ascending=true&start_time_min=${since}`, 'polymarket-events');
}

// A Kambi league's own schedule (schedules.mjs), every game on it the house
// prices; Kambi's priced ones are taken over them (loadExtraLeagues).
async function fetchSchedule(key, now) {
  const schedule = LEAGUES[key].schedule;
  if (!schedule) return [];
  if (schedule.asia) {
    // This season's results for the clubs' strengths: the last two months too.
    const months = new Set();
    for (let d = -60; d <= DAYS_AHEAD; d++) months.add(asiaMonthOf(now.getTime() + d * DAY_MS));
    const lists = await Promise.all([...months].map(m => asiaMonth(getJson, schedule.asia, m).catch(() => [])));
    return parseAsiaSchedule(lists.flat(), key, now);
  }
  return [];
}

// A schedule's game Kambi prices already (the two sides, either order, near its start).
export function pricedByKambi(game, kambiGames) {
  const t = Date.parse(game.startUtc);
  return kambiGames.some(
    k =>
      k.sport === game.sport &&
      Math.abs(Date.parse(k.startUtc) - t) < 12 * 3_600_000 &&
      ((sameSide(k.home.en, game.home) && sameSide(k.away.en, game.away)) || (sameSide(k.home.en, game.away) && sameSide(k.away.en, game.home)))
  );
}

// Every other league (ESPN / DraftKings, Kambi, Kambi leagues' own
// schedules), fetched after the page opens so they don't hold it up. A league
// that fails is left out.
// Every other league, each handed to `onPart` (its games) the moment it's
// read, so one slow league never holds back the rest; resolves to them all.
export async function loadExtraLeagues(now = new Date(), onPart) {
  const part = promise =>
    promise.then(listed => {
      onPart?.(listed);
      return listed;
    });
  const results = await Promise.allSettled([...EXTRA_LEAGUES, ...KAMBI_LEAGUES].map(key => part(extraLeague(key, now))));
  return results.flatMap(r => (r.status === 'fulfilled' ? r.value : []));
}
// One of those leagues' games on the board.
async function extraLeague(key, now) {
  if (!KAMBI_LEAGUES.includes(key)) return lotteryGames(mergeGames(await fetchLeague(key, now), []), now);
  const [p, s] = await Promise.allSettled([fetchKambiLeague(key, now, getJson), fetchSchedule(key, now)]);
  const priced = p.status === 'fulfilled' ? p.value : [];
  const scheduled = mergeGames((s.status === 'fulfilled' ? s.value : []).filter(g => !pricedByKambi(g, priced)), []);
  return lotteryGames([...priced, ...scheduled], now);
}

// One league's games on the board, as loadOdds and loadExtraLeagues list
// them (the Worker checking a pick reads only its league).
export async function loadLeague(key, now = new Date()) {
  if (key !== 'mlb' && key !== 'epl') return extraLeague(key, now);
  const [dk, pm] = await Promise.allSettled([fetchMonths(key, LEAGUES[key].path, now), fetchPolymarketEvents(POLYMARKET_TAG[key], 'polymarket-events')]);
  if (dk.status === 'rejected' && pm.status === 'rejected') throw dk.reason;
  const pmGames = pm.status === 'fulfilled' ? (key === 'mlb' ? parsePolymarketMlb : parsePolymarketEpl)(pm.value, now) : [];
  return lotteryGames(mergeGames(dk.status === 'fulfilled' ? dk.value : [], pmGames, { scheduled: new Set(dk.status === 'fulfilled' ? [key] : []) }), now);
}

// One championship market (a pick's `market`), as loadOdds and
// loadExtraFutures read it; null when it isn't on sale.
export async function loadFuture(key, now = new Date()) {
  const tagged = FUTURES.find(f => f.key === key);
  if (tagged) {
    if (tagged.sport === 'nba' && !nbaInSeason(now)) return null;
    return parseFutures(await fetchPolymarketEvents(POLYMARKET_TAG[tagged.sport], 'polymarket-events'), tagged.sport, [tagged])[0] ?? null;
  }
  const extra = EXTRA_FUTURES.find(f => f.key === key);
  if (!extra) return null;
  const d = await getJson(`${GAMMA}/public-search?q=${encodeURIComponent(extra.query)}&limit_per_type=8&events_status=active`);
  return parseFutures(d?.events || [], extra.sport, [extra])[0] ?? null;
}

// A league's clubs, logos and nicknames from ESPN's team list (for the
// ticket sorting quiz), remembered in teams.mjs. The Asian leagues use our
// own tables.
export async function loadLeagueTeams(sport) {
  if (hasTeams(sport)) return true;
  // Our leagues by key, or any ESPN league as 'espn:<path>' (the rest of
  // Europe's clubs, for the UEFA competitions' championship boards).
  const path = LEAGUES[sport]?.path ?? (sport.startsWith('espn:') ? sport.slice(5) : null);
  if (!path) return false;
  // Every club: ESPN's list stops at its first page (college football's is long) without a limit.
  const url = `${ESPN}/${path}/teams?limit=1000`;
  let teams = await storedTeams(url);
  if (!teams) {
    const data = await getJson(url).catch(() => null);
    teams = (data?.sports?.[0]?.leagues?.[0]?.teams ?? [])
      .map(x => x.team)
      .filter(t => t?.displayName && t.logos?.[0]?.href)
      .map(t => ({ name: t.displayName, logo: t.logos[0].href, nick: t.name || t.shortDisplayName || t.displayName }));
    if (teams.length) storeTeams(url, teams);
  }
  if (teams.length) rememberTeams(sport, teams);
  return teams.length > 0;
}

// The team lists kept on the device for a week (clubs change once a
// season), so opening the app doesn't download every league's again. In
// the browser's Cache Storage, shared by the Quadra apps on this site; the
// service workers never clear it.
const TEAMS_CACHE = 'quadra-teams-v1';
const TEAMS_FRESH_MS = 7 * 24 * 3600 * 1000;
async function storedTeams(url) {
  try {
    const hit = await (await globalThis.caches?.open(TEAMS_CACHE))?.match(url);
    if (!hit) return null;
    const { at, teams } = await hit.json();
    return Date.now() - at < TEAMS_FRESH_MS && Array.isArray(teams) && teams.length ? teams : null;
  } catch {
    return null;
  }
}
async function storeTeams(url, teams) {
  try {
    const cache = await globalThis.caches?.open(TEAMS_CACHE);
    await cache?.put(url, new Response(JSON.stringify({ at: Date.now(), teams }), { headers: { 'content-type': 'application/json' } }));
  } catch {}
}


// The leagues whose clubs a championship market is about, for their logos
// (findTeamLogo): the league itself, or for the UEFA competitions every
// European league with clubs in them.
const EUROPE = ['epl', 'laliga', 'seriea', 'bundesliga', 'ligue1', 'eredivisie', 'primeira', ...['sco.1', 'tur.1', 'bel.1', 'aut.1', 'gre.1', 'cze.1', 'den.1', 'nor.1', 'sui.1', 'cro.1', 'srb.1', 'swe.1', 'pol.1', 'ukr.1'].map(l => `espn:soccer/${l}`)];
// The competitions' own entrant lists first (clubs from smaller leagues too).
export const FUTURE_TEAM_LEAGUES = { ucl: ['ucl', 'uel', ...EUROPE], uel: ['uel', 'ucl', 'espn:soccer/uefa.europa.conf', ...EUROPE] };
export const futureTeamLeagues = sport => FUTURE_TEAM_LEAGUES[sport] ?? [sport];

// Loads every team list the championship boards need; resolves when done.
export function loadFutureTeams(futures) {
  const leagues = [...new Set(futures.filter(f => f.sport !== 'f1').flatMap(f => futureTeamLeagues(f.sport)))];
  return Promise.all(leagues.map(l => loadLeagueTeams(l).catch(() => false)));
}
