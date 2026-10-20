// ---- sports.js: /sports-proxy, the data proxy ----
// One of the Worker's routes (worker.js routes it, beside /eco, /transit,
// /weather…): a host-allowlisted pass-through to the public sources Orbit
// Sports, Quadra Play and Quadra Securities read (ESPN, MLB, Jolpica,
// Polymarket, Kambi, Yahoo, ELTA, YouTube, formula1.com, F1's live timing,
// the Asian leagues), with the shared edge cache by tier, trims and batches.
// It and the F1 lap log's cron (sportsCron) run in the same Worker as the
// rest (the owner, 2026-10-13: one proxy). The old address
// (sports-proxy.pengzjay.workers.dev) is retired (deploy.yml).
//
// A Quadra Pass is required: every request carries `qt=<session token>`
// (from /eco), checked with ECO_TOKEN_SECRET and counted per session and app
// in this isolate's memory, never in KV. A localhost page without one is let
// in by the dev door (SPORTS_DEV).
import { paceOf } from './pace.js';
import { readToken, sessionLimited } from './quadra-token.js';
import { BRANDS } from './kit/brand.mjs';
import { ASIA_HOST, asiaBaseballResponse, asiaTarget, cpblBoxTarget } from './asia-baseball.js';
import { F1_LIVE_HOST, f1LiveResponse, doLog, sampleLive } from './f1-live.js';
import { cleanDev } from './kit/devconfig.mjs';
import { json, LOCAL_ORIGIN } from './http.js';
import { mirrorPath } from './kit/mirror.mjs';

// ==== /sports-proxy - CORS passthrough for public sports data ==============
const ELTA_HOST = 'piceltaott-elta.cdn.hinet.net';
// formula1.com's driver and team pages: the official season, career and
// profile figures (only /en/drivers/<slug> and /en/teams/<slug>, trimmed).
const F1_HOST = 'www.formula1.com';
// ELTA.tv's sports videos: a league's season of whole games (/sports/play/1/<n>),
// for a finished game's replay once ELTA's 48 hours of 回看 are over (only
// those pages, trimmed to their episodes).
const ELTA_VOD_HOST = 'eltaott.tv';
// YouTube's search and a video's page: a finished game's highlights, the
// official video itself (Orbit Sports' highlights row), only those two pages,
// each trimmed to a few fields.
const YT_HOST = 'www.youtube.com';
// FotMob's league and team pages (their stats' leaders and table) and its
// stat lists: Orbit Sports' 數據領先 for football, the forty stats the
// leagues' own sites show where ESPN has two (goals, assists). Always trimmed.
const FOTMOB_HOST = 'www.fotmob.com';
const FOTMOB_DATA_HOST = 'data.fotmob.com';
const SPORTS_PROXY_FETCH_USER_AGENT = 'Orbit-Sports-Bot/1.0 (+https://github.com/JayPengX/Orbit-Sports)';
const SPORTS_PROXY_ALLOWED_HOSTS = [
  'site.api.espn.com',
  // Per-fixture odds (Match Find's pre-game line for games already in
  // progress - the scoreboard drops it once a game starts).
  'sports.core.api.espn.com',
  'statsapi.mlb.com',
  'api.jolpi.ca',
  'gamma-api.polymarket.com',
  // Polymarket's price history of one market (only /prices-history): Orbit
  // Sports' win probability line where ESPN draws none (soccer, MLB live, CPBL).
  'clob.polymarket.com',
  // Kambi's public odds feed: Play's Asian baseball, EuroLeague and K League
  // odds and live scores.
  'eu-offering-api.kambicdn.com',
  // OpenF1's race control messages: Quadra Play's safety car, VSC and red
  // flag picks are settled from them.
  'api.openf1.org',
  // Yahoo Finance's public chart, spark and search endpoints (no key): Stock
  // Study's quotes, charts, dividends and splits for stocks, ETFs, funds,
  // currencies, crypto, metals and indexes worldwide.
  'query1.finance.yahoo.com',
  'query2.finance.yahoo.com',
  // TWSE's list of public subscriptions (新股申購, kit/stock-ipo.mjs):
  // Securities' applications and the Worker's draw (only that announcement).
  'www.twse.com.tw',
  // Google's translate endpoint (the Chrome dictionary's, no key): a
  // company's description in the reader's language (Securities). Only
  // /translate_a/t; sent upstream as a POST (see fetchUpstream), kept a month.
  'clients5.google.com',
  // ELTA's (愛爾達) sports schedule: which game each of its channels carries,
  // for Orbit Sports' "where to watch" (only the one list, always trimmed).
  ELTA_HOST,
  ELTA_VOD_HOST,
  F1_HOST,
  YT_HOST,
  FOTMOB_HOST,
  FOTMOB_DATA_HOST,
  // Not a real host: Asian baseball's schedules and scores, gathered by this
  // Worker from the leagues' own sites (asia-baseball.js).
  ASIA_HOST,
  // Not a real host either: F1's own live timing, one snapshot (f1-live.js).
  F1_LIVE_HOST
];
const ELTA_PATH = '/production/json/program_list/sports_live_program_list.json';
// Per signed-in session and app, a minute, in memory (cache hits included). Looking
// through every league in Sports, with a few followed, asks about 350 a
// minute (the preview tool's --live prints the busiest minute).
const SESSION_RATE_LIMIT = 600;
const SPORTS_PROXY_UPSTREAM_TIMEOUT_MS = 8_000;

// ---- Shared cache lifetimes ------------------------------------------------
// Every successful upstream response is kept in this colo's cache and served
// to every viewer who asks for the same URL - one upstream fetch, shared by
// everyone. How long a copy counts as fresh depends on how fast that data
// actually changes: today's scores need to be seconds old, a fixture ten
// days out or a standings table doesn't.
//
// `fresh`: served as-is, no upstream request.
// `stale`: past `fresh` but within this extra window, the saved copy is
// STILL returned immediately and the refresh happens in the background
// (stale-while-revalidate), so the viewer never waits on the upstream API
// for slow-moving data - the next viewer gets the refreshed copy. 0 means
// an expired copy is never served (live scores).
const SECOND = 1;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
// Live scores and odds: 10 s, so a 15-second refresh never gets a copy a whole beat old.
const CACHE_LIVE = { tier: 'live', fresh: 10 * SECOND, stale: 0 };
// A game over (its box score), or a day whose every game is over: it won't
// change, so the first read after the final serves everyone for a day (it
// was read from ESPN every 10 seconds of viewing until the night's mirror).
const CACHE_FINAL = { tier: 'final', fresh: DAY, stale: 0 };

// The developer settings (kit/devconfig.mjs, the admin panel's 開發), read
// at most once a minute through worker.js's reader (`useDevSettings`, the
// one GET /config answers from): how long a live answer and a game over are
// kept here.
let dev = cleanDev();
let devAt = 0;
let devReader = null;
export function useDevSettings(fn) {
  devReader = fn;
}
function refreshDev(env, ctx) {
  if (!devReader || Date.now() - devAt < 60_000) return;
  devAt = Date.now();
  ctx.waitUntil(
    Promise.resolve()
      .then(() => devReader(env, ctx))
      .then(x => x && (dev = cleanDev(x)))
      .catch(() => {})
  );
}
// How long an answer is fresh here, by the settings: a game over its hours;
// a live one (tier 'live') the seconds set, or with 0 half what the source
// says it may be kept (ESPN's max-age: 4 to 10 s), 2 to 5 s.
export function freshFor(policy, result, settings = dev) {
  if (result?.final) return settings.proxyFinalH * 3600;
  if (policy.tier !== 'live') return policy.fresh;
  const live = settings.proxyLive > 0 ? settings.proxyLive : result?.maxAge > 0 ? Math.min(5, Math.max(2, Math.round(result.maxAge / 2))) : policy.fresh;
  // A scoreboard with no game on: until shortly before its next game (quietFor).
  return Math.max(live, result?.quiet || 0);
}
// Polymarket's pages mix every open market for a league, today's games
// included, and Match Find's live-odds poll asks for them every 30s - so
// they follow the same strict rule as live scores. (An earlier version
// served a copy up to 2 minutes old while refreshing in the background;
// since the poll interval is longer than any short fresh window, every
// poll then got the PREVIOUS poll's odds - always one tick behind.)
const CACHE_ODDS = { tier: 'odds', fresh: 10 * SECOND, stale: 0 };
// F1's live timing: a few seconds, shared by everyone watching.
const CACHE_F1_LIVE = { tier: 'f1-live', fresh: 4 * SECOND, stale: 0 };
const CACHE_F1_LAPS = { tier: 'f1-live', fresh: 15 * SECOND, stale: 0 };
// OpenF1 (a race's sessions, race control, laps, pits): read only once a
// session is over (it's closed while one runs), so minutes old is new
// enough. It turns away an address asking more than about 30 a minute, and
// the proxy's address is shared with every other Worker: a refusal answers
// the copy kept here (up to a day), never nothing (健康 showed 429, 2026-10-20).
const CACHE_OPENF1 = { tier: 'openf1', fresh: 5 * MINUTE, stale: DAY };
const CACHE_SCHEDULE = { tier: 'schedule', fresh: 10 * MINUTE, stale: DAY };
const CACHE_SEASON = { tier: 'season', fresh: 3 * MINUTE, stale: 30 * MINUTE };
const CACHE_STANDINGS = { tier: 'standings', fresh: 30 * MINUTE, stale: DAY };
const CACHE_TEAM_SCHEDULE = { tier: 'team-schedule', fresh: 3 * MINUTE, stale: DAY };
// ESPN core odds is only ever asked for a game's PRE-game line, which
// can't change once the game has started.
const CACHE_PREGAME_LINE = { tier: 'pregame-line', fresh: HOUR, stale: DAY };
// A side's roster for one game (ESPN core): its starters are marked as the
// team announces them, half an hour before an NBA tip-off (Sports' 先發陣容).
const CACHE_LINEUP = { tier: 'lineup', fresh: MINUTE, stale: 10 * MINUTE };
// Pre-match odds from Kambi's list views move slowly (minutes, not seconds),
// and every viewer asks for the same few leagues: one upstream fetch every 2
// minutes per colo, a slightly older copy while it refreshes.
const CACHE_PREMATCH = { tier: 'prematch', fresh: 2 * MINUTE, stale: 10 * MINUTE };
// Championship markets (Polymarket's search) change over days.
const CACHE_FUTURES = { tier: 'futures', fresh: 10 * MINUTE, stale: DAY };
// Yahoo Finance (Stock Study). Today's quotes (spark or chart over a day or
// five) move every few seconds but the page polls them every 45 seconds:
// 30 seconds fresh, never served expired, so an order always fills at a
// price under a minute old. Longer charts (a month and up, daily points or
// wider) only gain a point a day. Search results barely change.
const CACHE_QUOTES = { tier: 'quotes', fresh: 30 * SECOND, stale: 0 };
const CACHE_HISTORY = { tier: 'history', fresh: 30 * MINUTE, stale: DAY };
const CACHE_SEARCH = { tier: 'search', fresh: DAY, stale: 7 * DAY };
// A company's numbers (P/E, market value, dividend yield, what it does)
// change with the price at most: an hour fresh, a day's copy while it
// refreshes. Search with news (newsCount > 0) is kept 30 minutes.
const CACHE_FUNDAMENTALS = { tier: 'fundamentals', fresh: HOUR, stale: DAY };
const CACHE_NEWS = { tier: 'news', fresh: 30 * MINUTE, stale: DAY };
const CACHE_TRANSLATE = { tier: 'translate', fresh: 30 * DAY, stale: 30 * DAY };
// YouTube: a game's highlights go up within hours of it ending (a search
// read again after 20 minutes); a video's page (where it plays) for a week.
const CACHE_YT_SEARCH = { tier: 'yt-search', fresh: 20 * MINUTE, stale: 6 * HOUR };
const CACHE_YT_VIDEO = { tier: 'yt-video', fresh: 7 * DAY, stale: 7 * DAY };

// Asian baseball by month: this month and next change with every score (a
// minute); a past month only with a late fix.
// This month's: read again after 2 minutes (each read is a page and a few
// day lists), the last good copy answered for 6 hours if a read fails.
const CACHE_ASIA_NOW = { tier: 'asia-now', fresh: 2 * MINUTE, stale: 6 * HOUR };
// A month over: its results don't change.
const CACHE_ASIA_PAST = { tier: 'asia-past', fresh: 12 * HOUR, stale: 7 * DAY };
// A CPBL game's box score: a game on changes with every pitch (its 15
// seconds, as a scoreboard's); one over is kept as long as a month over.
function asiaPolicy(url) {
  if (cpblBoxTarget(url)) return CACHE_LIVE;
  const target = asiaTarget(url);
  if (!target) return CACHE_LIVE;
  const now = new Date();
  const months = target.year * 12 + target.month - (now.getUTCFullYear() * 12 + now.getUTCMonth() + 1);
  // Last month too on the 1st (a game the evening before, Asian time).
  return months >= 0 || (months === -1 && now.getUTCDate() <= 2) ? CACHE_ASIA_NOW : CACHE_ASIA_PAST;
}

function yahooPolicy(url) {
  if (url.pathname.startsWith('/v1/finance/search')) return Number(url.searchParams.get('newsCount')) > 0 ? CACHE_NEWS : CACHE_SEARCH;
  if (needsYahooCrumb(url)) return CACHE_FUNDAMENTALS;
  const range = url.searchParams.get('range') || '1d';
  return range === '1d' || range === '5d' ? CACHE_QUOTES : CACHE_HISTORY;
}

function utcDayNumber(yyyymmdd) {
  const ms = Date.UTC(Number(yyyymmdd.slice(0, 4)), Number(yyyymmdd.slice(4, 6)) - 1, Number(yyyymmdd.slice(6, 8)));
  return Math.floor(ms / (DAY * 1000));
}

// A scoreboard is "live" when any day it covers is within a day of today
// (UTC) - that span holds every game that can still be in progress, since a
// US-evening game's ESPN date runs up to ~1 UTC day behind. Everything
// further out is either already final or not yet started.
function scoreboardPolicy(url) {
  const dates = url.searchParams.get('dates');
  if (!dates) return CACHE_LIVE;
  // A whole year (a race series' or tour's season): a few minutes fresh.
  if (/^\d{4}$/.test(dates)) return CACHE_SEASON;
  const match = /^(\d{8})(?:-(\d{8}))?$/.exec(dates);
  if (!match) return CACHE_LIVE;
  const today = Math.floor(Date.now() / (DAY * 1000));
  const from = utcDayNumber(match[1]);
  const to = match[2] ? utcDayNumber(match[2]) : from;
  if (!Number.isFinite(from) || !Number.isFinite(to)) return CACHE_LIVE;
  return from <= today + 1 && to >= today - 1 ? CACHE_LIVE : CACHE_SCHEDULE;
}

// A month's board as Play reads it (`&trim=espn-board`: games to come and
// their lines, no scores): two minutes, as Kambi's pre-match lists. Read
// whole every 10 seconds before (the live tier), megabytes each. A month
// read untrimmed (Orbit Sports' cups, with scores) stays live.
const CACHE_BOARD_MONTH = { tier: 'board-month', fresh: 2 * MINUTE, stale: 0 };
const policyOf = (url, trim) => (trim === TRIM_ESPN_BOARD && /^\d{6}$/.test(url.searchParams.get('dates') || '') ? CACHE_BOARD_MONTH : cachePolicyFor(url));

function cachePolicyFor(url) {
  switch (url.hostname) {
    case 'site.api.espn.com':
      // A team's schedule has its games' scores: minutes, not a table's half hour.
      // A game's own page (box score, plays) is live while it's on: a game
      // sheet open on a game in play reads it every 15 s and was getting a
      // copy up to half an hour old. A finished one comes from the mirror.
      if (url.pathname.endsWith('/summary')) return CACHE_LIVE;
      // News: minutes (a penalty or an injury is told the day it happens).
      if (url.pathname.endsWith('/news')) return CACHE_TEAM_SCHEDULE;
      // A team's injuries on game day (Sports' game sheet reads its roster for them): minutes.
      if (url.pathname.endsWith('/roster') && url.searchParams.get('enable') === 'injuries') return CACHE_TEAM_SCHEDULE;
      return url.pathname.endsWith('/scoreboard') ? scoreboardPolicy(url) : url.pathname.endsWith('/schedule') ? CACHE_TEAM_SCHEDULE : CACHE_STANDINGS;
    case 'sports.core.api.espn.com':
      return /\/competitors\/\d+\/roster$/.test(url.pathname) ? CACHE_LINEUP : CACHE_PREGAME_LINE;
    case 'statsapi.mlb.com':
      // A day's games with their linescore (Sports' live count, runners,
      // batter and pitcher when ESPN's feed leaves them out): live.
      if (url.pathname === '/api/v1/schedule' && /linescore/.test(url.searchParams.get('hydrate') || '')) return CACHE_LIVE;
      // The postseason still to come (kit/postseason.mjs): a time set or a
      // game dropped as soon as a game ends, so minutes.
      if (url.pathname === '/api/v1/schedule' && url.searchParams.get('gameType')) return CACHE_TEAM_SCHEDULE;
      return CACHE_STANDINGS;
    case 'api.jolpi.ca':
      return CACHE_STANDINGS;
    case 'api.openf1.org':
      return CACHE_OPENF1;
    case 'clob.polymarket.com':
      return CACHE_ODDS;
    case 'gamma-api.polymarket.com':
      return url.pathname === '/public-search' ? CACHE_FUTURES : CACHE_ODDS;
    case 'eu-offering-api.kambicdn.com':
      // A league's matches in play (Play's live board) move by the second.
      if (url.pathname.endsWith('/in-play.json')) return CACHE_ODDS;
      // A match's own markets: pre-match lists move like the league's (a live
      // match's are asked for in play, at the live list's pace).
      if (url.pathname.includes('/betoffer/')) return url.searchParams.get('live') ? CACHE_ODDS : CACHE_PREMATCH;
      return url.pathname.includes('/listView/') ? CACHE_PREMATCH : CACHE_LIVE;
    case 'query1.finance.yahoo.com':
    case 'query2.finance.yahoo.com':
      return yahooPolicy(url);
    // 新股申購's list: a draw's rate comes out on its day (minutes).
    case 'www.twse.com.tw':
      return CACHE_TEAM_SCHEDULE;
    case 'clients5.google.com':
      return CACHE_TRANSLATE;
    case ELTA_HOST:
    case ELTA_VOD_HOST:
    case F1_HOST:
      return CACHE_STANDINGS;
    case YT_HOST:
      return url.pathname === '/watch' ? CACHE_YT_VIDEO : CACHE_YT_SEARCH;
    case ASIA_HOST:
      return asiaPolicy(url);
    case F1_LIVE_HOST:
      // A finished session from F1's archive (f1-live.js /session.json): it doesn't change.
      if (url.pathname === '/session.json' || url.pathname === '/circuit.json') return CACHE_STANDINGS;
      // Every car's laps: while a session runs, read again each 15 seconds (over: ?final=1, kept).
      if (url.pathname === '/laps.json') return url.searchParams.get('final') ? CACHE_STANDINGS : CACHE_F1_LAPS;
      return CACHE_F1_LIVE;
    default:
      return CACHE_LIVE;
  }
}

// Background refreshes already running in this isolate, so a burst of
// viewers hitting the same stale entry triggers one upstream fetch, not one
// each.
const refreshesInFlight = new Set();

// Opt-in (`&trim=polymarket-events`) response trimming for Gamma's
// /events pages. Each page nests every market of every event with ~80
// fields apiece (descriptions, token ids, fee schedules...) - live-measured
// at 11.5MB raw / ~1MB gzipped for one 100-event MLB page, of which Match
// Find reads only the fields kept below (see public/lib/polymarket.mjs's
// findTeamEvent / parse*Markets / find*WinnerEvent in that repo). Trimmed,
// the same page is ~0.45MB raw (a few dozen KB compressed), which is what
// lets odds arrive together with the match list instead of seconds after.
// Opt-in rather than automatic so the client can fall back to the plain
// passthrough if this parse-and-rebuild step ever fails here (it's the one
// place this Worker does real CPU work) - and the cached copy is the
// trimmed one, so that work happens at most once per TTL per colo.
const TRIM_POLYMARKET_EVENTS = 'polymarket-events';
// Opt-in (`&trim=polymarket-games`) for Gamma's /events of a league's days:
// only each game's own event (not its props, corners or "more markets") and
// only its moneyline markets with their token ids, for Orbit Sports' win
// probability (lib/polymarket.mjs there). One day of the Premier League is
// ~2.8MB raw, ~10KB trimmed.
const TRIM_POLYMARKET_GAMES = 'polymarket-games';
// Opt-in (`&trim=polymarket-markets`) for Gamma's /markets (Play's games'
// winner markets, read apart from their events: kit/play-sources.mjs
// polymarketGames): each market's prices, liquidity and its event's id.
const TRIM_POLYMARKET_MARKETS = 'polymarket-markets';
// Opt-in (`&trim=kambi-events`) trimming for Kambi's list views and live
// feed: only the fields Odds Study reads (lib/kambi.mjs), a small fraction
// of each event's full record.
const TRIM_KAMBI_EVENTS = 'kambi-events';

function trimKambi(data) {
  if (!data || typeof data !== 'object') return data;
  const event = e =>
    e && { id: e.id, name: e.name, homeName: e.homeName, awayName: e.awayName, start: e.start, state: e.state, group: e.group, sport: e.sport, path: Array.isArray(e.path) ? e.path.map(p => p.termKey) : undefined };
  const offers = list =>
    Array.isArray(list)
      ? list.map(o => ({
          criterion: { englishLabel: o.criterion?.englishLabel },
          betOfferType: { englishName: o.betOfferType?.englishName },
          outcomes: (o.outcomes || []).map(x => ({ type: x.type, odds: x.odds, line: x.line, status: x.status }))
        }))
      : list;
  const live = d => d && { score: d.score, statistics: d.statistics?.sets ? { sets: d.statistics.sets } : undefined, matchClock: d.matchClock ? { periodId: d.matchClock.periodId, minute: d.matchClock.minute, running: d.matchClock.running } : undefined };
  return {
    events: Array.isArray(data.events) ? data.events.map(item => ({ event: event(item.event), betOffers: offers(item.betOffers), liveData: live(item.liveData) })) : undefined,
    liveEvents: Array.isArray(data.liveEvents) ? data.liveEvents.map(item => ({ event: event(item.event), liveData: live(item.liveData) })) : undefined
  };
}

// Opt-in (`&trim=kambi-offers`) for one match's full list of markets
// (betoffer/event/<id>.json, Play's game page: every line, half, corner and
// player market): each offer's label, kind and outcomes (who, line, price),
// about a fifth of Kambi's record.
const TRIM_KAMBI_OFFERS = 'kambi-offers';
export function trimKambiOffers(data) {
  if (!data || typeof data !== 'object') return data;
  const offers = Array.isArray(data.betOffers)
    ? data.betOffers.map(o => ({
        id: o.id,
        eventId: o.eventId,
        criterion: { englishLabel: o.criterion?.englishLabel, shortEnglishLabel: o.criterion?.shortEnglishLabel, occurrenceType: o.criterion?.occurrenceType, lifetime: o.criterion?.lifetime },
        betOfferType: { englishName: o.betOfferType?.englishName },
        tags: Array.isArray(o.tags) ? o.tags.filter(t => t === 'MAIN_LINE' || t === 'OFFERED_LIVE') : undefined,
        suspended: o.suspended || undefined,
        outcomes: (o.outcomes || []).map(x => ({ type: x.type, odds: x.odds, line: x.line, status: x.status, label: x.englishLabel, participant: x.participant, participantId: x.participantId }))
      }))
    : undefined;
  const events = Array.isArray(data.events) ? data.events.map(e => ({ id: e.id, homeName: e.homeName, awayName: e.awayName, start: e.start, state: e.state })) : undefined;
  return { betOffers: offers, events };
}

// Opt-in (`&trim=espn-roster`) for a team's roster (Play's players): each
// player's id, name, position, headshot and injury, and (soccer) the
// season's numbers, in ESPN's own shape (grouped by position or not).
const TRIM_ESPN_ROSTER = 'espn-roster';
export function trimEspnRoster(data) {
  if (!data || typeof data !== 'object' || !Array.isArray(data.athletes)) return data;
  const player = a =>
    a && {
      id: a.id,
      displayName: a.displayName,
      jersey: a.jersey,
      position: a.position ? { abbreviation: a.position.abbreviation } : undefined,
      headshot: a.headshot?.href ? { href: a.headshot.href } : undefined,
      injuries: Array.isArray(a.injuries) && a.injuries.length ? a.injuries.slice(0, 1).map(i => ({ status: i.status })) : undefined,
      statistics: a.statistics?.splits?.categories
        ? { splits: { categories: a.statistics.splits.categories.map(c => ({ name: c.name, stats: (c.stats || []).map(x => ({ name: x.name, value: x.value })) })) } }
        : undefined
    };
  const athletes = data.athletes.map(x => (Array.isArray(x?.items) ? { position: x.position, items: x.items.map(player) } : player(x)));
  return { team: data.team ? { id: data.team.id, displayName: data.team.displayName } : undefined, athletes };
}

// Opt-in (`&trim=espn-teams`) for a league's team list (Play's logos and
// clubs, kit/play-sources.mjs loadLeagueTeams): each club's name, nickname
// and first logo, in ESPN's own shape. The 11 lists Play reads on its first
// open were 2.3 MB; this is about a twentieth.
const TRIM_ESPN_TEAMS = 'espn-teams';
export function trimEspnTeams(data) {
  const teams = data?.sports?.[0]?.leagues?.[0]?.teams;
  if (!Array.isArray(teams)) return data;
  const team = t => t && { displayName: t.displayName, name: t.name, shortDisplayName: t.shortDisplayName, logos: t.logos?.[0]?.href ? [{ href: t.logos[0].href }] : [] };
  return { sports: [{ leagues: [{ teams: teams.map(x => ({ team: team(x?.team) })) }] }] };
}

// Opt-in (`&trim=espn-standings`) for a league's table (Play's house prices,
// kit/play-house.mjs parseStandings): each team's name and its record
// (wins, losses, ties, games, share), the season, and the tables' nesting,
// in ESPN's own shape. A table carries dozens of stats and notes per team:
// the ones Play reads on its first open were several MB.
const TRIM_ESPN_STANDINGS = 'espn-standings';
const STANDING_STATS = new Set(['wins', 'losses', 'ties', 'otLosses', 'gamesPlayed', 'winPercent']);
export function trimEspnStandings(data) {
  const node = n => {
    if (!n || typeof n !== 'object') return undefined;
    const out = {};
    if (n.standings) {
      out.standings = {
        season: n.standings.season,
        entries: (n.standings.entries || []).map(e => ({
          team: { displayName: e?.team?.displayName },
          stats: (e?.stats || []).filter(x => STANDING_STATS.has(x?.name) || STANDING_STATS.has(x?.type)).map(x => ({ name: x.name, type: x.type, value: x.value }))
        }))
      };
    }
    if (Array.isArray(n.children)) out.children = n.children.map(node);
    return out;
  };
  if (!data || typeof data !== 'object') return data;
  const out = node(data);
  if (Array.isArray(data.seasons)) out.seasons = data.seasons.slice(0, 1).map(x => ({ year: x?.year }));
  if (data.season) out.season = { year: data.season.year };
  return out;
}

// Opt-in (`&trim=espn-news`) for a league's or a team's news (Sports' news
// on a team, a player, a driver): each story's headline, summary, time, one
// picture, its link and who it's about, in ESPN's own shape. ~210 KB of 50
// stories falls to ~40 KB.
const TRIM_ESPN_NEWS = 'espn-news';
export function trimEspnNews(data) {
  if (!data || typeof data !== 'object' || !Array.isArray(data.articles)) return data;
  return {
    articles: data.articles.map(a => ({
      id: a.id,
      type: a.type,
      headline: a.headline,
      description: a.description,
      published: a.published,
      premium: a.premium || undefined,
      images: a.images?.[0]?.url ? [{ url: a.images[0].url }] : undefined,
      links: a.links?.web?.href ? { web: { href: a.links.web.href } } : undefined,
      categories: (a.categories || []).filter(c => c.type === 'athlete' || c.type === 'team').map(c => ({ type: c.type, athleteId: c.athleteId ?? c.athlete?.id, teamId: c.teamId ?? c.team?.id, description: c.description }))
    }))
  };
}

// Opt-in (`&trim=espn-athletes`) for a league's players' season numbers
// (statistics/byathlete): each player's id, name, team and the numbers, the
// category names once. A league's whole list falls from ~5 MB to ~150 KB.
const TRIM_ESPN_ATHLETES = 'espn-athletes';
export function trimEspnAthletes(data) {
  if (!data || typeof data !== 'object' || !Array.isArray(data.athletes)) return data;
  return {
    pagination: data.pagination ? { count: data.pagination.count, pages: data.pagination.pages, page: data.pagination.page } : undefined,
    requestedSeason: data.requestedSeason ? { year: data.requestedSeason.year, displayName: data.requestedSeason.displayName, type: { name: data.requestedSeason.type?.name } } : undefined,
    categories: (data.categories || []).map(c => ({ name: c.name, names: c.names })),
    athletes: data.athletes.map(x => ({
      athlete: { id: x.athlete?.id, displayName: x.athlete?.displayName, teamId: x.athlete?.teamId, position: x.athlete?.position ? { abbreviation: x.athlete.position.abbreviation } : undefined },
      // (Three places are all any stat writes: 35.765625 minutes is 35.766.)
      categories: (x.categories || []).map(c => ({ name: c.name, values: Array.isArray(c.values) ? c.values.map(v => (typeof v === 'number' ? Math.round(v * 1000) / 1000 : v)) : c.values }))
    }))
  };
}

// Opt-in (`&trim=espn-leaders`) for a league's leaders, as Orbit Sports'
// 數據領先 reads them (its lib/leaders.mjs): basketball's and baseball's
// list (site v3 /leaders) and football's top scorers and assists (site v2
// /statistics), each category's name and each leader's number, person and
// club. MLB's ten a category falls from ~3 MB to ~40 KB.
const TRIM_ESPN_LEADERS = 'espn-leaders';
export function trimEspnLeaders(data) {
  if (!data || typeof data !== 'object') return data;
  const cats = data.leaders?.categories || data.stats;
  if (!Array.isArray(cats)) return data;
  const s = data.requestedSeason || data.season;
  return {
    season: s ? { year: s.year, displayName: s.displayName } : undefined,
    categories: cats.map(c => ({
      name: c.name,
      leaders: (c.leaders || []).map(l => ({
        value: l.value,
        displayValue: String(l.displayValue || '').slice(0, 40),
        team: { id: l.team?.id ?? l.athlete?.team?.id },
        athlete: { id: l.athlete?.id, displayName: l.athlete?.displayName, shortName: l.athlete?.shortName, headshot: l.athlete?.headshot?.href }
      }))
    }))
  };
}

// Opt-in (`&trim=jolpica-results`) for a season's race results (Jolpica's
// /results.json, a hundred a page), as Orbit Sports' F1 數據領先 counts them
// (wins, podiums, top tens, fastest laps, places gained): each race's round
// and each result's place, grid, points, laps, status, fastest-lap rank and
// driver. A page falls from ~64 KB to ~12 KB.
const TRIM_JOLPICA_RESULTS = 'jolpica-results';
export function trimJolpicaResults(data) {
  const m = data?.MRData;
  if (!m?.RaceTable?.Races) return data;
  return {
    MRData: {
      total: m.total,
      limit: m.limit,
      offset: m.offset,
      RaceTable: {
        season: m.RaceTable.season,
        Races: m.RaceTable.Races.map(r => ({
          season: r.season,
          round: r.round,
          Results: (r.Results || r.QualifyingResults || []).map(x => ({
            position: x.position,
            positionText: x.positionText,
            grid: x.grid,
            points: x.points,
            laps: x.laps,
            status: x.status,
            FastestLap: x.FastestLap ? { rank: x.FastestLap.rank } : undefined,
            Driver: { driverId: x.Driver?.driverId, code: x.Driver?.code, givenName: x.Driver?.givenName, familyName: x.Driver?.familyName },
            Constructor: { constructorId: x.Constructor?.constructorId, name: x.Constructor?.name }
          }))
        }))
      }
    }
  };
}

// FotMob's league or team page (always): its stats, each with its top three
// and where its whole list is, and the table's teams (to match ESPN's by
// name). A league's page falls from ~850 KB to ~25 KB.
const TRIM_FOTMOB_PAGE = 'fotmob-page';
const fotmobPerson = x => ({ id: x?.id, name: x?.name, teamId: x?.teamId, teamName: x?.teamName, value: x?.value });
export function trimFotmobPage(data) {
  if (!data || typeof data !== 'object') return data;
  const st = data.stats || {};
  const list = Array.isArray(st.players) ? st.players : Object.values(st.players || {});
  const tables = (data.table || []).flatMap(t => [t?.data?.table, ...(t?.data?.tables || []).map(x => x?.table)]).filter(Boolean);
  const teams = new Map();
  for (const t of tables) for (const r of t.all || []) if (r?.id != null) teams.set(r.id, { id: r.id, name: r.name, shortName: r.shortName });
  return {
    id: data.details?.id,
    season: data.details?.selectedSeason || '',
    teamId: st.teamId,
    stats: list.map(x => ({ header: x.header, name: x.participant?.stat?.name || '', format: x.participant?.stat?.format || '', fractions: x.participant?.stat?.fractions ?? 0, url: x.fetchAllUrl || '', top: (x.topThree || []).map(fotmobPerson) })),
    teams: [...teams.values()]
  };
}
// One of FotMob's stat lists (always): its name and the top hundred, each
// with his club and games. ~140 KB to ~25 KB.
const TRIM_FOTMOB_STAT = 'fotmob-stat';
export function trimFotmobStat(data) {
  const t = data?.TopLists?.[0];
  if (!t) return data;
  return {
    name: t.StatName,
    title: t.Title,
    format: t.StatFormat,
    decimals: t.StatDecimals,
    list: (t.StatList || []).slice(0, 100).map(x => ({ id: x.ParticiantId ?? x.ParticipantId, name: x.ParticipantName, teamId: x.TeamId, teamName: x.TeamName, value: x.StatValue, sub: x.SubStatValue, games: x.MatchesPlayed, mins: x.MinutesPlayed, rank: x.Rank }))
  };
}

// Opt-in (`&trim=espn-board`) for a league's scoreboard as Play's board
// reads it (kit/play-sources.mjs parseEspnScoreboard and mlbPostseason): each
// game's id, time, season type and state, its sides and DraftKings' closing
// lines; and what this proxy reads of it (settledData, quietFor). NHL's
// month falls from ~4.5 MB to ~0.13 MB.
const TRIM_ESPN_BOARD = 'espn-board';
export function trimEspnBoard(data) {
  if (!data || typeof data !== 'object' || !Array.isArray(data.events)) return data;
  const type = t => t && { state: t.state, completed: t.completed };
  const status = x => x && { type: type(x.type) };
  const close = x => x && { close: x.close && { odds: x.close.odds, line: x.close.line } };
  const sides = (x, keys) => x && Object.fromEntries(keys.map(k => [k, close(x[k])]));
  const team = t => t && { id: t.id, displayName: t.displayName, abbreviation: t.abbreviation, logo: t.logo };
  const game = c =>
    c && {
      date: c.date,
      timeValid: c.timeValid,
      neutralSite: c.neutralSite,
      notes: Array.isArray(c.notes) ? c.notes.slice(0, 1).map(n => ({ headline: n?.headline })) : undefined,
      status: status(c.status),
      competitors: Array.isArray(c.competitors) ? c.competitors.map(x => x && { homeAway: x.homeAway, team: team(x.team) }) : c.competitors,
      odds: Array.isArray(c.odds) ? c.odds.slice(0, 1).map(o => o && { moneyline: sides(o.moneyline, ['away', 'home', 'draw']), total: sides(o.total, ['over', 'under']), pointSpread: sides(o.pointSpread, ['away', 'home']) }) : undefined
    };
  return {
    events: data.events.map(e => e && { id: e.id, date: e.date, season: e.season && { type: e.season.type }, status: status(e.status), competitions: Array.isArray(e.competitions) ? e.competitions.slice(0, 1).map(game) : e.competitions })
  };
}

// Opt-in (`&trim=espn-injuries`) for a league's injury report (Sports' team
// page): each team's id and each player's name, card link, headshot, status,
// what and until when, and ESPN's comment, in ESPN's own shape. MLB's 3.1 MB
// (every player's dozen links, his whole profile) falls to a fraction.
const TRIM_ESPN_INJURIES = 'espn-injuries';
export function trimEspnInjuries(data) {
  if (!data || typeof data !== 'object' || !Array.isArray(data.injuries)) return data;
  const card = a => (a?.links || []).find(l => Array.isArray(l?.rel) && l.rel.includes('playercard'));
  return {
    injuries: data.injuries.map(t => ({
      id: t?.id,
      injuries: (t?.injuries || []).map(i => ({
        status: i?.status,
        type: i?.type?.description ? { description: i.type.description } : undefined,
        details: i?.details ? { type: i.details.type, detail: i.details.detail, returnDate: i.details.returnDate } : undefined,
        date: i?.date,
        shortComment: i?.shortComment,
        longComment: i?.shortComment ? undefined : i?.longComment,
        athlete: i?.athlete && { displayName: i.athlete.displayName, headshot: i.athlete.headshot?.href ? { href: i.athlete.headshot.href } : undefined, links: card(i.athlete) ? [{ rel: ['playercard'], href: card(i.athlete).href }] : undefined }
      }))
    }))
  };
}

// ELTA's schedule, a small fraction of it: each live program's day, start
// and end (Unix seconds), channel, league (ELTA's English name and its Chinese one) and title.
const TRIM_ELTA = 'elta';
// The text a Next.js page carries in its pushes (formula1.com's pages).
function nextText(html) {
  let out = '';
  for (const m of String(html || '').matchAll(/self\.__next_f\.push\(\[1,"((?:[^"\\]|\\.)*)"\]\)/g)) {
    try {
      out += JSON.parse(`"${m[1]}"`);
    } catch {}
  }
  return out;
}

// An ELTA.tv sports video page's episodes, newest first, as it lists them:
// { episodes: [{ id, title }] } ("10/6 美聯分區賽G2 白襪 VS 守護者"). The
// newest 120 here (a season's page lists ~2,000: the watch builder
// reads it whole, `limit` Infinity, and keeps each game's for the season).
const TRIM_ELTA_VOD = 'eltavod';
export function trimEltaVod(html, limit = 120) {
  const seen = new Set();
  const episodes = [];
  for (const m of String(html || '').matchAll(/data-episode="(\d+)"[\s\S]{0,600}?\btitle="([^"]{1,160})"/g)) {
    if (seen.has(m[1])) continue;
    seen.add(m[1]);
    episodes.push({ id: m[1], title: m[2].replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").trim() });
    if (episodes.length >= limit) break;
  }
  return { episodes };
}

// YouTube's pages carry their data as one JSON object in a script
// (`var ytInitialData = {…};`): that object, or null.
function ytObject(html, name) {
  const text = String(html || '');
  const at = text.search(new RegExp(`(?:var |window\\[")${name}"?\\]?\\s*=\\s*\\{`));
  if (at < 0) return null;
  const start = text.indexOf('{', at);
  // Its script ends right after it (`…};</script>`): parsed whole there, no
  // walking a megabyte of page a character at a time (2026-10-12: that
  // walk, two searches at once, put the Worker over Cloudflare's limits, 1102).
  const end = text.indexOf(';</script>', start);
  if (end > start) {
    try {
      return JSON.parse(text.slice(start, end));
    } catch {}
  }
  return objectAt(text, start);
}
// The JSON object starting at `start` ('{'), parsed where its braces close
// (strings skipped); null when it doesn't parse.
function objectAt(text, start) {
  let depth = 0;
  let quote = '';
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      if (c === '\\') i++;
      else if (c === quote) quote = '';
    } else if (c === '"') quote = c;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) {
      try {
        return JSON.parse(text.slice(start, i + 1));
      } catch {
        return null;
      }
    }
  }
  return null;
}
// A search page's first videos (each `"videoRenderer":{…}`, in the page's
// order), each parsed alone: a few kilobytes each, not the megabyte of
// ytInitialData whole (the Worker's CPU: sustained searches still met
// Cloudflare's limit, 1102, with the whole object parsed). Null without
// ytInitialData (a consent or robot page).
function ytVideoRenderers(html, most = 40) {
  const text = String(html || '');
  const from = text.search(/(?:var |window\[")ytInitialData"?\]?\s*=\s*\{/);
  if (from < 0) return null;
  const key = '"videoRenderer":{';
  const out = [];
  for (let at = text.indexOf(key, from); at >= 0 && out.length < most; at = text.indexOf(key, at + key.length)) {
    const v = objectAt(text, at + key.length - 1);
    if (v) out.push(v);
  }
  return out;
}
function* ytFind(node, key, depth = 0) {
  if (!node || typeof node !== 'object' || depth > 40) return;
  if (Array.isArray(node)) {
    for (const x of node) yield* ytFind(x, key, depth + 1);
    return;
  }
  if (key in node) yield node[key];
  for (const v of Object.values(node)) if (v && typeof v === 'object') yield* ytFind(v, key, depth + 1);
}
const ytText = t => (t?.simpleText ?? (t?.runs || []).map(r => r.text || '').join('')) || '';
// A search's videos, in YouTube's order: { videos: [{ id, title, channel,
// channelId, verified, age ('11h ago'), length ('9:52') }] }; null when the
// page has none of its data (a consent or robot page: a failure, not kept).
const TRIM_YT_SEARCH = 'ytsearch';
export function trimYtSearch(html) {
  let found = ytVideoRenderers(html);
  if (!found) return null;
  // (None found that way: the whole object, as it was read before.)
  if (!found.length) {
    const data = ytObject(html, 'ytInitialData');
    if (!data) return null;
    found = ytFind(data, 'videoRenderer');
  }
  const videos = [];
  for (const v of found) {
    if (!v?.videoId || videos.some(x => x.id === v.videoId)) continue;
    const owner = v.ownerText?.runs?.[0] || v.longBylineText?.runs?.[0] || {};
    const badges = (v.ownerBadges || []).map(b => b.metadataBadgeRenderer?.style || '');
    videos.push({
      id: v.videoId,
      title: ytText(v.title).slice(0, 200),
      channel: owner.text || '',
      channelId: owner.navigationEndpoint?.browseEndpoint?.browseId || '',
      verified: badges.some(b => /VERIFIED/.test(b)),
      age: ytText(v.publishedTimeText),
      length: ytText(v.lengthText)
    });
    if (videos.length >= 20) break;
  }
  return { videos };
}
// A video's page: whether it plays in Taiwan (its list of countries; null
// when the page doesn't say), when it went up, its channel. Null without
// the page's data.
const TRIM_YT_VIDEO = 'ytvideo';
export function trimYtVideo(html) {
  const p = ytObject(html, 'ytInitialPlayerResponse');
  if (!p) return null;
  const mf = p.microformat?.playerMicroformatRenderer || {};
  const countries = Array.isArray(mf.availableCountries) ? mf.availableCountries : null;
  return {
    id: p.videoDetails?.videoId || '',
    title: String(p.videoDetails?.title || '').slice(0, 200),
    channel: p.videoDetails?.author || '',
    channelId: p.videoDetails?.channelId || '',
    published: mf.publishDate || mf.uploadDate || '',
    tw: countries ? countries.includes('TW') : null,
    playable: p.playabilityStatus?.status || ''
  };
}

// A formula1.com driver or team page's figures, as the page shows them: its
// grids of label and value, in order ({ grids: [[[label, value], …], …] }),
// e.g. the season's (position, points), its Grand Prix and Sprint numbers,
// the career's, the biography or the team's profile.
const TRIM_F1PAGE = 'f1page';
export function trimF1Page(html) {
  const text = nextText(html);
  const grids = [];
  let cur = null;
  for (const m of text.matchAll(/DataGrid-module_dataGrid|"children":"([^"]{1,48})"\}\],\["\$","dd",null,\{"className":"[^"]*","children":"([^"]{0,96})"/g)) {
    if (!m[1]) {
      cur = [];
      grids.push(cur);
    } else if (cur) cur.push([m[1], m[2]]);
  }
  return { grids: grids.filter(g => g.length) };
}

export function trimElta(data) {
  const programs = [];
  for (const [day, list] of Object.entries(data?.calendar || {})) {
    for (const p of Array.isArray(list) ? list : []) {
      if (!p || !p.start_time) continue;
      // Its league by both of ELTA's names (z: the Chinese one; the English one changes: UCL became "UEFA Champions League").
      programs.push({ d: day, s: p.start_time, e: p.end_time, ch: p.channel_number, g: p.game_type_en || p.game_type || '', z: p.game_type || '', t: p.program_desc || '' });
    }
  }
  return { programs };
}

const GAME_SLUG = /^[a-z0-9]+-[a-z0-9]+-[a-z0-9]+-\d{4}-\d{2}-\d{2}$/;
// An F1 race's (or sprint's) winner: a yes-or-no market for each driver, with how much it's traded.
const RACE_SLUG = /^f1-[a-z0-9-]+-winner-\d{4}-\d{2}-\d{2}$/;
export function trimPolymarketGames(events) {
  if (!Array.isArray(events)) return events;
  return events
    .filter(event => GAME_SLUG.test(event?.slug || '') || RACE_SLUG.test(event?.slug || ''))
    .map(event => {
      // A race's winner: every market is a driver's (older ones carry no market type).
      const race = RACE_SLUG.test(event.slug || '');
      return {
        slug: event.slug,
        title: event.title,
        startTime: event.startTime,
        teams: Array.isArray(event.teams) ? event.teams.map(t => ({ name: t.name, abbreviation: t.abbreviation, alias: t.alias })) : [],
        markets: (event.markets || [])
          .filter(m => (race ? m.groupItemTitle : m.sportsMarketType === 'moneyline'))
          .map(m => ({ question: m.question, groupItemTitle: m.groupItemTitle, outcomes: m.outcomes, clobTokenIds: m.clobTokenIds, ...(race ? { volume: Number(m.volume) || 0 } : {}) }))
      };
    });
}
export function trimPolymarketMarkets(markets) {
  if (!Array.isArray(markets)) return markets;
  return markets.map(m => ({ question: m.question, outcomes: m.outcomes, outcomePrices: m.outcomePrices, liquidity: m.liquidity, event: m.events?.[0]?.id }));
}

function trimPolymarketEvents(events) {
  if (!Array.isArray(events)) return events;
  return events.map(event => ({
    id: event.id,
    slug: event.slug,
    title: event.title,
    startDate: event.startDate,
    startTime: event.startTime,
    eventDate: event.eventDate,
    teams: event.teams,
    markets: Array.isArray(event.markets)
      ? event.markets.map(market => ({
          question: market.question,
          outcomes: market.outcomes,
          outcomePrices: market.outcomePrices,
          liquidity: market.liquidity
        }))
      : event.markets
  }));
}

// ---- Yahoo's crumb -----------------------------------------------------------
// Yahoo's quote and quoteSummary endpoints (a company's P/E, market value,
// dividend yield and profile) want a session: the cookie fc.yahoo.com sets,
// and a "crumb" token fetched with it. The Worker gets one, keeps it for 6
// hours in this isolate, adds both to those requests only (never to the
// cache key), and gets a new one once if Yahoo turns the old one down.
const YAHOO_CRUMB_PATHS = ['/v7/finance/quote', '/v10/finance/quoteSummary/'];
const YAHOO_SESSION_MS = 6 * 3600 * 1000;
// A browser's User-Agent: Yahoo refuses the crumb to a bot's (HTTP 429).
const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
let yahooSession = null;

function needsYahooCrumb(url) {
  return (url.hostname === 'query1.finance.yahoo.com' || url.hostname === 'query2.finance.yahoo.com') && YAHOO_CRUMB_PATHS.some(p => url.pathname.startsWith(p));
}

async function getYahooSession(renew = false) {
  if (!renew && yahooSession && Date.now() - yahooSession.at < YAHOO_SESSION_MS) return yahooSession;
  const first = await fetch('https://fc.yahoo.com/', {
    headers: { 'User-Agent': BROWSER_UA },
    redirect: 'manual',
    signal: AbortSignal.timeout(SPORTS_PROXY_UPSTREAM_TIMEOUT_MS)
  });
  const setCookies = typeof first.headers.getSetCookie === 'function' ? first.headers.getSetCookie() : [first.headers.get('Set-Cookie') || ''];
  const cookie = setCookies.map(c => c.split(';')[0]).filter(Boolean).join('; ');
  if (!cookie) throw new Error('Yahoo session unavailable');
  const res = await fetch('https://query2.finance.yahoo.com/v1/test/getcrumb', {
    headers: { 'User-Agent': BROWSER_UA, Cookie: cookie },
    signal: AbortSignal.timeout(SPORTS_PROXY_UPSTREAM_TIMEOUT_MS)
  });
  const crumb = (await res.text()).trim();
  if (res.status !== 200 || !crumb || crumb.length > 64 || /\s|</.test(crumb)) throw new Error('Yahoo crumb unavailable');
  yahooSession = { cookie, crumb, at: Date.now() };
  return yahooSession;
}

async function fetchYahooWithCrumb(upstreamUrl) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const session = await getYahooSession(attempt > 0);
    const url = new URL(upstreamUrl.toString());
    url.searchParams.set('crumb', session.crumb);
    const res = await fetch(url.toString(), {
      headers: { 'User-Agent': BROWSER_UA, Cookie: session.cookie },
      signal: AbortSignal.timeout(SPORTS_PROXY_UPSTREAM_TIMEOUT_MS)
    });
    if ((res.status !== 401 && res.status !== 403) || attempt > 0) return res;
  }
}

// Yahoo (quotes, charts, search, a company's numbers), asked as a browser:
// Yahoo limits an address, and the proxy's is shared (in Taiwan, with every
// other Worker there), so a refusal (429, or a 403 or 5xx while it does) is
// asked of its twin host (2026-10-14: query1 refused, query2 answered), then
// as a signed-in visitor (the cookie and crumb), whom it turns away least
// (走勢圖載入失敗 now and then, 2026-10-15). A bot's name was refused first.
const yahooRefused = res => res.status === 429 || res.status === 403 || res.status >= 500;
// (Exported for tools/preview.mjs, which asks Yahoo as the Worker does.)
export async function fetchYahoo(upstreamUrl) {
  const twin = new URL(upstreamUrl.toString());
  twin.hostname = upstreamUrl.hostname === 'query1.finance.yahoo.com' ? 'query2.finance.yahoo.com' : 'query1.finance.yahoo.com';
  const plain = url => fetch(url.toString(), { headers: { 'User-Agent': BROWSER_UA }, signal: AbortSignal.timeout(SPORTS_PROXY_UPSTREAM_TIMEOUT_MS) });
  const tries = needsYahooCrumb(upstreamUrl) ? [() => fetchYahooWithCrumb(upstreamUrl), () => fetchYahooWithCrumb(twin)] : [() => plain(upstreamUrl), () => plain(twin), () => fetchYahooWithCrumb(twin)];
  let res = null;
  let failure = null;
  for (const ask of tries) {
    const next = await ask().catch(error => void (failure = error));
    if (!next) continue;
    res?.body?.cancel?.().catch(() => {});
    res = next;
    if (!yahooRefused(res)) break;
  }
  if (!res) throw failure;
  return res;
}

// A translate answer with no text in it.
export function emptyTranslation(text) {
  try {
    const got = JSON.parse(text);
    const out = Array.isArray(got) ? (Array.isArray(got[0]) ? got[0][0] : got[0]) : null;
    return typeof out !== 'string' || !out.trim();
  } catch {
    return true;
  }
}

// The translate endpoint: the text goes in a POST body (a GET mixes in
// simplified characters for zh-TW, and long texts don't fit an address).
async function translateUpstream(upstreamUrl) {
  const url = new URL(upstreamUrl.toString());
  const q = url.searchParams.get('q') || '';
  url.searchParams.delete('q');
  return fetch(url.toString(), {
    method: 'POST',
    headers: { 'User-Agent': BROWSER_UA, 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
    body: new URLSearchParams({ q }).toString(),
    signal: AbortSignal.timeout(SPORTS_PROXY_UPSTREAM_TIMEOUT_MS)
  });
}

// Fetches `upstreamUrl`, applies the optional trim, and saves a 200 into the
// shared cache. Resolves to { status, contentType, body } or
// { fetchError }. Never throws.
// The F1 lap log (env.F1_LOG), set by the first request this isolate serves.
let f1Log = null;
const YAHOO_HOSTS = new Set(['query1.finance.yahoo.com', 'query2.finance.yahoo.com']);
async function fetchUpstream(upstreamUrl, trim) {
  let upstream;
  try {
    upstream = upstreamUrl.hostname === ASIA_HOST
      ? await asiaBaseballResponse(upstreamUrl)
      : upstreamUrl.hostname === F1_LIVE_HOST
      ? await f1LiveResponse(upstreamUrl, { log: f1Log })
      : YAHOO_HOSTS.has(upstreamUrl.hostname)
      ? await fetchYahoo(upstreamUrl)
      : upstreamUrl.hostname === 'clients5.google.com'
        ? await translateUpstream(upstreamUrl)
        : await fetchAllowed(upstreamUrl, {
          // YouTube in English, past its cookie notice, as a browser sees it.
          headers: upstreamUrl.hostname === YT_HOST ? { 'User-Agent': BROWSER_UA, 'Accept-Language': 'en-US,en;q=0.9', Cookie: 'SOCS=CAI; CONSENT=YES+' } : { 'User-Agent': SPORTS_PROXY_FETCH_USER_AGENT },
          signal: AbortSignal.timeout(SPORTS_PROXY_UPSTREAM_TIMEOUT_MS)
        });
  } catch (error) {
    return { fetchError: error };
  }
  try {
    const contentType = upstream.headers.get('Content-Type') || 'application/json';
    // Yahoo turning the proxy away is the source's failure (503), never the
    // phone's limit (429): the kit asks again, where a 429 held it a minute.
    if (upstream.status !== 200) return { status: upstream.status === 429 && YAHOO_HOSTS.has(upstreamUrl.hostname) ? 503 : upstream.status, contentType, body: upstream.body };
    let body = await upstream.arrayBuffer();
    // Google sometimes answers a translation with nothing ([[""]], when it's
    // busy): a failure, not kept (it was, a month, and the line stayed English).
    if (upstreamUrl.hostname === 'clients5.google.com' && emptyTranslation(new TextDecoder().decode(body))) return { status: 502, contentType, body: '' };
    if (trim === TRIM_ELTA_VOD) return { status: 200, contentType: 'application/json', body: JSON.stringify(trimEltaVod(new TextDecoder().decode(body))) };
    if (trim === TRIM_YT_SEARCH || trim === TRIM_YT_VIDEO) {
      const out = (trim === TRIM_YT_SEARCH ? trimYtSearch : trimYtVideo)(new TextDecoder().decode(body));
      return out ? { status: 200, contentType: 'application/json', body: JSON.stringify(out) } : { status: 502, contentType: 'application/json', body: '' };
    }
    if (trim === TRIM_F1PAGE) return { status: 200, contentType: 'application/json', body: JSON.stringify(trimF1Page(new TextDecoder().decode(body))) };
    if (trim) {
      try {
        const parsed = JSON.parse(new TextDecoder().decode(body));
        body = JSON.stringify(trim === TRIM_KAMBI_EVENTS ? trimKambi(parsed) : trim === TRIM_KAMBI_OFFERS ? trimKambiOffers(parsed) : trim === TRIM_ESPN_ROSTER ? trimEspnRoster(parsed) : trim === TRIM_ESPN_TEAMS ? trimEspnTeams(parsed) : trim === TRIM_ESPN_STANDINGS ? trimEspnStandings(parsed) : trim === TRIM_ESPN_ATHLETES ? trimEspnAthletes(parsed) : trim === TRIM_ESPN_NEWS ? trimEspnNews(parsed) : trim === TRIM_ESPN_LEADERS ? trimEspnLeaders(parsed) : trim === TRIM_JOLPICA_RESULTS ? trimJolpicaResults(parsed) : trim === TRIM_FOTMOB_PAGE ? trimFotmobPage(parsed) : trim === TRIM_FOTMOB_STAT ? trimFotmobStat(parsed) : trim === TRIM_ESPN_INJURIES ? trimEspnInjuries(parsed) : trim === TRIM_ESPN_BOARD ? trimEspnBoard(parsed) : trim === TRIM_ELTA ? trimElta(parsed) : trim === TRIM_POLYMARKET_GAMES ? trimPolymarketGames(parsed) : trim === TRIM_POLYMARKET_MARKETS ? trimPolymarketMarkets(parsed) : trimPolymarketEvents(parsed));
      } catch {
        // Not the JSON shape expected - pass it through untouched.
      }
    }
    const maxAge = Number(/max-age=(\d+)/.exec(upstream.headers.get('Cache-Control') || '')?.[1]) || 0;
    // (Read once, for both: over for good, or quiet until its next game.)
    const data = settleable(upstreamUrl) ? parsed(body) : null;
    const final = data != null && settledData(upstreamUrl, data);
    return { status: 200, contentType, body, final, quiet: data != null && !final ? quietFor(upstreamUrl, data) : 0, maxAge };
  } catch (error) {
    return { fetchError: error };
  }
}

// Whether ESPN's answer is over for good: a game's summary with its game
// completed, or one day's scoreboard (dates=YYYYMMDD; "today" moves on to the
// next day's games) with games, every one of them over.
export function settled(url, body) {
  if (!settleable(url)) return false;
  const data = parsed(body);
  return data != null && settledData(url, data);
}
function parsed(body) {
  try {
    return JSON.parse(typeof body === 'string' ? body : new TextDecoder().decode(body));
  } catch {
    return null;
  }
}
// How long a live-tier scoreboard (a day's or a month's) can't change: with
// no game on, until shortly before its next game starts (QUIET_LEAD), at
// most QUIET_MAX; 0 while any game is on or one is past its start and not
// over. A day of no games or of games all hours away was read again every
// 10 seconds: each opening of Sports waited about a second on ESPN for every
// league's yesterday and today.
const QUIET_MAX = 10 * MINUTE;
const QUIET_LEAD = 5 * MINUTE;
export function quietFor(url, data, now = Date.now()) {
  if (url.hostname !== 'site.api.espn.com' || !url.pathname.endsWith('/scoreboard') || !data || !Array.isArray(data.events)) return 0;
  let next = Infinity;
  for (const e of data.events) {
    const type = e?.status?.type ?? e?.competitions?.[0]?.status?.type;
    const state = type?.state;
    if (state === 'post' || type?.completed === true) continue;
    if (state !== 'pre') return 0;
    const start = Date.parse(e?.date ?? e?.competitions?.[0]?.date);
    if (!Number.isFinite(start)) return 0;
    next = Math.min(next, start);
  }
  return Math.max(0, Math.min(QUIET_MAX, Math.floor((next - now) / 1000) - QUIET_LEAD));
}
// The reads that can be over for good: a game's summary, a day's or a
// month's scoreboard (ESPN), a month of Asia's baseball.
export function settleable(url) {
  if (url.hostname === 'site.api.espn.com') return url.pathname.endsWith('/summary') || (url.pathname.endsWith('/scoreboard') && /^\d{6}(\d{2})?$/.test(url.searchParams.get('dates') || ''));
  return url.hostname === ASIA_HOST && /\/\d{4}-\d{2}\.json$/.test(url.pathname);
}
// …and whether this answer of one is: the game completed; every game of the
// day or month completed (a month's last day passed); every game of an Asian
// month over, called off or six hours past a start it never had.
export function settledData(url, data, now = Date.now()) {
  if (url.hostname === ASIA_HOST) {
    const [y, m] = (/(\d{4})-(\d{2})\.json$/.exec(url.pathname) || []).slice(1).map(Number);
    if (!y || Date.UTC(y, m, 1) > now) return false;
    const games = data?.games || [];
    return games.length > 0 && games.every(g => g.state === 'post' || g.state === 'void' || (g.state === 'pre' && Date.parse(g.start) < now - 6 * 3_600_000));
  }
  if (url.pathname.endsWith('/summary')) return data?.header?.competitions?.[0]?.status?.type?.completed === true;
  const dates = url.searchParams.get('dates') || '';
  if (dates.length === 6 && Date.UTC(+dates.slice(0, 4), +dates.slice(4, 6), 2) > now) return false;
  const events = data?.events || [];
  return events.length > 0 && events.every(e => (e?.status?.type ?? e?.competitions?.[0]?.status?.type)?.completed === true);
}

function cacheEntry(result, policy) {
  const p = result.final ? CACHE_FINAL : policy;
  const fresh = freshFor(policy, result);
  return new Response(result.body, {
    status: 200,
    headers: {
      'Content-Type': result.contentType,
      // The cache itself keeps the entry for the whole fresh + stale span;
      // X-Sports-Proxy-Stored-At is what decides which of the two it's in.
      'Cache-Control': `public, max-age=${fresh + p.stale}`,
      'X-Sports-Proxy-Stored-At': String(Date.now()),
      // How long it's fresh (the settings, the source's own max-age), read back on the next ask.
      'X-Sports-Proxy-Fresh': String(fresh),
      // Over for good (settled): kept a day, whatever its address's policy.
      ...(result.final ? { 'X-Sports-Proxy-Final': '1' } : {})
    }
  });
}

// Which trim (if any) applies to a URL: only the hosts each one is for.
function trimFor(trimParam, upstreamUrl) {
  if (upstreamUrl.hostname === ELTA_HOST) return TRIM_ELTA;
  if (upstreamUrl.hostname === F1_HOST) return TRIM_F1PAGE;
  if (upstreamUrl.hostname === ELTA_VOD_HOST) return TRIM_ELTA_VOD;
  if (upstreamUrl.hostname === FOTMOB_HOST) return TRIM_FOTMOB_PAGE;
  if (upstreamUrl.hostname === FOTMOB_DATA_HOST) return TRIM_FOTMOB_STAT;
  if (upstreamUrl.hostname === YT_HOST) return upstreamUrl.pathname === '/watch' ? TRIM_YT_VIDEO : TRIM_YT_SEARCH;
  if (trimParam === TRIM_POLYMARKET_EVENTS && upstreamUrl.hostname === 'gamma-api.polymarket.com' && upstreamUrl.pathname === '/events') return TRIM_POLYMARKET_EVENTS;
  if (trimParam === TRIM_POLYMARKET_GAMES && upstreamUrl.hostname === 'gamma-api.polymarket.com' && upstreamUrl.pathname === '/events') return TRIM_POLYMARKET_GAMES;
  if (trimParam === TRIM_POLYMARKET_MARKETS && upstreamUrl.hostname === 'gamma-api.polymarket.com' && upstreamUrl.pathname === '/markets') return TRIM_POLYMARKET_MARKETS;
  if (trimParam === TRIM_KAMBI_EVENTS && upstreamUrl.hostname === 'eu-offering-api.kambicdn.com') return TRIM_KAMBI_EVENTS;
  if (trimParam === TRIM_ESPN_ROSTER && upstreamUrl.hostname === 'site.api.espn.com' && upstreamUrl.pathname.endsWith('/roster')) return TRIM_ESPN_ROSTER;
  if (trimParam === TRIM_ESPN_TEAMS && upstreamUrl.hostname === 'site.api.espn.com' && upstreamUrl.pathname.endsWith('/teams')) return TRIM_ESPN_TEAMS;
  if (trimParam === TRIM_ESPN_STANDINGS && upstreamUrl.hostname === 'site.api.espn.com' && upstreamUrl.pathname.endsWith('/standings')) return TRIM_ESPN_STANDINGS;
  if (trimParam === TRIM_ESPN_ATHLETES && upstreamUrl.hostname === 'site.api.espn.com' && upstreamUrl.pathname.endsWith('/statistics/byathlete')) return TRIM_ESPN_ATHLETES;
  if (trimParam === TRIM_ESPN_LEADERS && upstreamUrl.hostname === 'site.api.espn.com' && /\/(leaders|statistics)$/.test(upstreamUrl.pathname)) return TRIM_ESPN_LEADERS;
  if (trimParam === TRIM_JOLPICA_RESULTS && upstreamUrl.hostname === 'api.jolpi.ca' && /\/(results|qualifying\/1)\.json$/.test(upstreamUrl.pathname)) return TRIM_JOLPICA_RESULTS;
  if (trimParam === TRIM_ESPN_NEWS && upstreamUrl.hostname === 'site.api.espn.com' && upstreamUrl.pathname.endsWith('/news')) return TRIM_ESPN_NEWS;
  if (trimParam === TRIM_ESPN_BOARD && upstreamUrl.hostname === 'site.api.espn.com' && upstreamUrl.pathname.endsWith('/scoreboard')) return TRIM_ESPN_BOARD;
  if (trimParam === TRIM_ESPN_INJURIES && upstreamUrl.hostname === 'site.api.espn.com' && upstreamUrl.pathname.endsWith('/injuries')) return TRIM_ESPN_INJURIES;
  if (trimParam === TRIM_KAMBI_OFFERS && upstreamUrl.hostname === 'eu-offering-api.kambicdn.com' && upstreamUrl.pathname.includes('/betoffer/')) return TRIM_KAMBI_OFFERS;
  return null;
}

// A redirect is followed only to an address the proxy would take itself
// (parseTarget) or the same site's (its CDN), three at most: an open
// redirect on a listed site can't send the proxy, and its cache, anywhere
// else. Any other is a 502.
const siteOf = host => host.split('.').slice(/\.(com|org|gov|edu|net)\.\w\w$/.test(host) ? -3 : -2).join('.');
export async function fetchAllowed(url, init, fetchFn = fetch) {
  for (let hops = 0; ; hops++) {
    const res = await fetchFn(url.toString(), { ...init, redirect: 'manual' });
    if (res.status < 300 || res.status > 399 || !res.headers.get('Location')) return res;
    const to = new URL(res.headers.get('Location'), url);
    const next = hops >= 3 ? null : parseTarget(to.toString()) || (to.protocol === 'https:' && siteOf(to.hostname) === siteOf(url.hostname) ? to : null);
    if (!next) return new Response('', { status: 502 });
    url = next;
  }
}

function parseTarget(target) {
  try {
    const u = new URL(target);
    if (u.hostname === 'clients5.google.com' && (u.pathname !== '/translate_a/t' || (u.searchParams.get('q') || '').length > 5000)) return null;
    if (u.hostname === ELTA_HOST && u.pathname !== ELTA_PATH) return null;
    if (u.hostname === 'clob.polymarket.com' && u.pathname !== '/prices-history') return null;
    // TWSE's announcement lists: 公開申購 (publicForm), 處置 (punish), 注意 (notice).
    if (u.hostname === 'www.twse.com.tw' && !/^\/rwd\/zh\/announcement\/(publicForm|punish|notice)$/.test(u.pathname)) return null;
    if (u.hostname === ELTA_VOD_HOST && (!/^\/sports\/play\/1\/\d{1,6}$/.test(u.pathname) || u.search)) return null;
    // A search (its words, in English as seen from Taiwan) or a video's page, nothing else.
    if (u.hostname === YT_HOST && !(u.pathname === '/results' ? [...u.searchParams.keys()].every(k => ['search_query', 'hl', 'gl'].includes(k)) && (u.searchParams.get('search_query') || '').length > 0 && (u.searchParams.get('search_query') || '').length <= 200 : u.pathname === '/watch' && [...u.searchParams.keys()].join() === 'v' && /^[\w-]{11}$/.test(u.searchParams.get('v')))) return null;
    if (u.hostname === F1_HOST && !/^\/en\/(drivers|teams)\/[a-z-]+$/.test(u.pathname)) return null;
    if (u.hostname === FOTMOB_HOST && !(/^\/api\/data\/(leagues|teams)$/.test(u.pathname) && [...u.searchParams.keys()].join() === 'id' && /^\d{1,8}$/.test(u.searchParams.get('id')))) return null;
    if (u.hostname === FOTMOB_DATA_HOST && (!/^\/stats\/\d{1,8}\/season\/\d{1,8}\/[a-z0-9_]{2,60}\.json$/.test(u.pathname) || u.search)) return null;
    return u.protocol === 'https:' && SPORTS_PROXY_ALLOWED_HOSTS.includes(u.hostname) ? u : null;
  } catch {
    return null;
  }
}

// One upstream URL through the shared cache: { status, contentType, body,
// cache, age } or { fetchError }. `body` is a stream or an ArrayBuffer.
// How long an old copy's fresh read is waited for before the old copy is
// answered (a batch's item waits 3 s in all).
const FRESH_WAIT_MS = 2_000;
// The family's data (R2), set by each request (env.DATA).
let dataBucket = null;

// Kept on first read (the family's data, R2): a read over for good (a game
// completed, a day or month of them, a past Asian month) is kept the first
// time anyone reads it, and every later read, from anywhere, once the edge's
// copy has gone, is answered from it: the source asked once, ever. What
// nobody opens is never fetched (the nightly mirror read every game of the
// season, opened or not). Kept as the mirror kept them ({ until, data }
// gzipped at its mirrorPath, ESPN's slimmed of what no app reads).
export const FOREVER = 8.64e15;
const DROP = new Set(['links', 'news', 'videos', 'article', 'articles', 'ticketsInfo', 'quicklinks', 'playerSwitcher', 'guid', 'alternateIds', 'geoBroadcasts', 'fantasy', 'headlines', '$ref', 'college', 'birthCountry', 'experience', 'lastUpdated', 'parent', 'contracts', 'draft']);
export function slimEspn(x) {
  if (Array.isArray(x)) return x.map(slimEspn);
  if (!x || typeof x !== 'object') return x;
  const out = {};
  for (const [k, v] of Object.entries(x)) if (!DROP.has(k)) out[k] = k === 'logos' && Array.isArray(v) ? v.slice(0, 1).map(l => ({ href: l?.href })) : slimEspn(v);
  return out;
}
const gz = async bytes => new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
const gunzipped = async raw => (raw[0] === 0x1f && raw[1] === 0x8b ? new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer()) : raw);
// A key R2 was just found not to have (a game not over yet, a day still to
// play) isn't asked of R2 again for a while: a live game's sheet missed the
// edge's 2-second copy at every beat, an R2 read (and a round trip) each time.
const NOT_KEPT_MS = 10 * MINUTE;
const notKept = new Map(); // key → until when it isn't asked again
async function readKept(key, url) {
  if (notKept.get(key) > Date.now()) return null;
  const obj = await dataBucket.get(key).catch(() => null);
  if (!obj) {
    if (notKept.size > 5000) notKept.clear();
    notKept.set(key, Date.now() + NOT_KEPT_MS);
    return null;
  }
  try {
    const copy = JSON.parse(new TextDecoder().decode(await gunzipped(new Uint8Array(await obj.arrayBuffer()))));
    // (The nightly mirror's copies carry a day's `until`; one that's over for good is kept for good.)
    return copy?.until > Date.now() || settledData(url, copy?.data) ? JSON.stringify(copy.data) : null;
  } catch {
    return null;
  }
}
async function keep(key, url, body) {
  try {
    const data = JSON.parse(typeof body === 'string' ? body : new TextDecoder().decode(body));
    const text = JSON.stringify({ until: FOREVER, data: url.hostname === 'site.api.espn.com' ? slimEspn(data) : data });
    await dataBucket.put(key, await gz(new TextEncoder().encode(text)), { httpMetadata: { contentType: 'application/gzip' } });
    notKept.delete(key);
  } catch {}
}

async function resolveOne(upstreamUrl, trim, ctx, { mirror = true, within } = {}) {
  let policy = policyOf(upstreamUrl, trim);
  const cache = caches.default;
  // A trimmed response is cached under its own key (a marker param on the
  // cache key only - never sent upstream), so it can't be served to a
  // caller that asked for the full passthrough, or vice versa.
  const cacheKeyUrl = new URL(upstreamUrl.toString());
  if (trim) cacheKeyUrl.searchParams.set('__sports_proxy_trim', trim);
  const cacheKey = new Request(cacheKeyUrl.toString());
  const match = await cache.match(cacheKey);
  // Read at once, never held open: a Worker call keeps six connections, and
  // a cached answer left unread while its item reads upstream (CPBL's month:
  // a page and a dozen days) was closed under it ("Response closed due to
  // connection limit"), failing the item.
  let cached = match && { status: match.status, contentType: match.headers.get('Content-Type') || 'application/json', storedAt: Number(match.headers.get('X-Sports-Proxy-Stored-At')), body: await match.arrayBuffer() };
  // This Worker's own check of a live bet (price.js): only a copy this many seconds old.
  if (cached && within != null && !(Date.now() - cached.storedAt <= within * 1000)) cached = null;
  if (cached) {
    // A copy over for good is fresh a day (CACHE_FINAL), not its address's seconds.
    if (match.headers.get('X-Sports-Proxy-Final') === '1') policy = CACHE_FINAL;
    const kept = Number(match.headers.get('X-Sports-Proxy-Fresh'));
    if (kept > 0) policy = { ...policy, fresh: kept };
    const storedAt = cached.storedAt;
    // Entries from before this header existed carry the old 20s lifetime,
    // so they're simply treated as fresh until the cache drops them.
    const ageSeconds = Number.isFinite(storedAt) && storedAt > 0 ? (Date.now() - storedAt) / 1000 : 0;
    const isFresh = ageSeconds <= policy.fresh;
    const old = cache => ({ status: cached.status, contentType: cached.contentType, body: cached.body, cache, age: Math.round(ageSeconds), policy });
    // Served while it's read again behind it only when it's barely past its
    // time (as long again as it's fresh, a minute at least). Older, it's read
    // now and the old copy is only what's answered if that fails or is slow
    // (FRESH_WAIT_MS; the read goes on into the cache): with few viewers, the
    // first ask after a while is nearly every ask, and it was getting a copy
    // up to a day old (a game over shown not begun).
    const barely = ageSeconds <= policy.fresh + Math.min(policy.stale, Math.max(policy.fresh, 60));
    if (!isFresh && !barely && ageSeconds <= policy.fresh + policy.stale) {
      const reading = fetchUpstream(upstreamUrl, trim).then(result => {
        if (result.status === 200) return cache.put(cacheKey, cacheEntry(result, policy)).then(() => result, () => result);
        if (result.body?.cancel) result.body.cancel().catch(() => {});
        return result;
      });
      ctx.waitUntil(reading.catch(() => {}));
      let timer;
      const result = await Promise.race([reading, new Promise(resolve => (timer = setTimeout(() => resolve(null), FRESH_WAIT_MS)))]).finally(() => clearTimeout(timer));
      if (result?.status === 200) return { ...result, cache: 'MISS', age: 0, policy: result.final ? CACHE_FINAL : policy };
      return old('STALE');
    }
    if (isFresh || barely) {
      if (!isFresh && !refreshesInFlight.has(cacheKey.url)) {
        refreshesInFlight.add(cacheKey.url);
        ctx.waitUntil(
          fetchUpstream(upstreamUrl, trim)
            .then(result => (result.status === 200 ? cache.put(cacheKey, cacheEntry(result, policy)) : null))
            .catch(() => {})
            .finally(() => refreshesInFlight.delete(cacheKey.url))
        );
      }
      return old(isFresh ? 'HIT' : 'STALE');
    }
  }
  const keepKey = mirror && dataBucket && dev.mirror !== false && settleable(upstreamUrl) ? `${mirrorPath(upstreamUrl.toString(), trim)}.gz` : null;
  const kept = keepKey ? await readKept(keepKey, upstreamUrl) : null;
  if (kept) {
    const result = { status: 200, contentType: 'application/json', body: kept, final: true };
    ctx.waitUntil(cache.put(cacheKey, cacheEntry(result, CACHE_FINAL)));
    return { ...result, cache: 'KEPT', age: 0, policy: CACHE_FINAL };
  }
  const result = await fetchUpstream(upstreamUrl, trim);
  if (result.status === 200) {
    // (The body is read once: the edge's copy and R2's from the same bytes.)
    if (result.body && typeof result.body !== 'string' && !(result.body instanceof ArrayBuffer) && !ArrayBuffer.isView(result.body)) result.body = await new Response(result.body).arrayBuffer();
    ctx.waitUntil(cache.put(cacheKey, cacheEntry(result, policy)));
    if (keepKey && result.final) ctx.waitUntil(keep(keepKey, upstreamUrl, result.body));
  }
  return { ...result, cache: 'MISS', age: 0, policy: result.final ? CACHE_FINAL : policy };
}

// How long the browser may keep an answer itself (its own copy, by the
// address it asked for): the fresh part of the cache policy, at most 10
// minutes. Live data only a few seconds.
const browserMaxAge = policy => Math.min(policy.fresh, 600);

// The dev door (as worker.js's for transit): a page served from localhost
// (the preview tool testing on the real proxy, its cache and its limits) may
// read without a Quadra Pass, a session's limit for each app at an address. SPORTS_DEV = "off"
// (wrangler.toml [vars]) closes it.
// Which app asks (the kit says): each app's asks are counted apart, so one
// left running in the background never uses up another's minute. Only the
// family's apps (any other name counts as one).
const appOf = requestParams => (Object.hasOwn(BRANDS, requestParams.get('app') || '') ? requestParams.get('app') : '-');
const tooMany = headers => json({ error: { message: 'Too many requests, please try again later.' } }, 429, headers);
async function checkSession(env, requestParams, headers, weight = 1, request = null, ip = '') {
  const app = appOf(requestParams);
  // No pass to check (the gate off: no ECO_TOKEN_SECRET), or the dev door:
  // the same limit as a signed-in session's, for each app at an address, a
  // minute, in memory (an hour's count in KV, shared by every app, was used
  // up by one look through Sports, and each server saw its own count).
  const dev = !requestParams.get('qt') && env.SPORTS_DEV !== 'off' && LOCAL_ORIGIN.test(request?.headers.get('Origin') || '');
  if (!env.ECO_TOKEN_SECRET || dev) {
    for (let i = 0; i < weight; i++) if (sessionLimited(`ip:${app}:${ip}`, SESSION_RATE_LIMIT)) return { error: tooMany(headers) };
    return { session: { s: `ip:${ip}`, dev, open: !env.ECO_TOKEN_SECRET } };
  }
  const session = await readToken(env.ECO_TOKEN_SECRET, requestParams.get('qt') || '', 'ses');
  if (!session) return { error: json({ error: { code: 'QUADRA_PASS_REQUIRED', message: 'Sign in with a Quadra Pass.' } }, 401, headers) };
  // (Paced by the bill's guard: a share of the usual, pace.js.)
  const limit = Math.max(60, Math.round(SESSION_RATE_LIMIT * (await paceOf(env)).reads));
  for (let i = 0; i < weight; i++) if (sessionLimited(`${app}:${session.s}`, limit)) return { error: tooMany(headers) };
  return { session };
}

// A batch: `?batch=1&u=<url>&u=<url>…` (each optionally `<trim>!<url>`),
// answered as one JSON document { r: [{ s: status, b: body } …] } in the
// same order. One Worker request instead of many - the Workers plan bills
// per request, and a page's first paint asks for a dozen lists at once.
// Every URL still goes through the shared cache on its own. 24: a first
// paint asks for about 28 lists at once (12, the free plan's 50 fetches a
// call, sent them as three requests; the $5 plan allows 10,000).
// With `&lines=1` (the kit's, from 2026-10-15) each item is written the
// moment it's in, a line of its own ({ i: its place, s, b }), so the app
// takes each as it comes: answered whole, a batch waited on its slowest
// item, and a first paint's 23 lists ready in a second waited 3 s on one.
const BATCH_MAX = 24;
// One slow upstream mustn't hold back the rest of its batch: an item not
// answered within this answers 504 (the app asks for it again on its own),
// while its fetch goes on in the background into the shared cache. Its own
// line holds back nothing: it waits as long as the app would for it alone.
const BATCH_ITEM_WAIT_MS = 3_000;
const LINE_ITEM_WAIT_MS = 10_000;
async function handleBatch(request, env, headers, ip, ctx, requestParams) {
  const items = requestParams.getAll('u').slice(0, BATCH_MAX);
  if (!items.length) return json({ error: { message: 'Missing u' } }, 400, headers);
  const gate = await checkSession(env, requestParams, headers, items.length, request, ip);
  if (gate.error) return gate.error;
  const lines = requestParams.has('lines');
  const answers = items.map(item => {
    const work = batchItem(item, ctx);
    ctx?.waitUntil?.(work.catch(() => {}));
    let timer;
    const late = new Promise(resolve => (timer = setTimeout(() => resolve('{"s":504}'), lines ? LINE_ITEM_WAIT_MS : BATCH_ITEM_WAIT_MS)));
    return Promise.race([work.finally(() => clearTimeout(timer)), late]);
  });
  // Written out as the bytes came (never decoded, never joined into one
  // string): a season's page is 6 MB, and copies of a few of them at once
  // ran a Worker out of memory, failing every batch on it together.
  const enc = new TextEncoder();
  const { readable, writable } = new TransformStream();
  const w = writable.getWriter();
  // One item: its head (`{"s":…`, its place first on a line), then its body.
  // A line's body has its line breaks as spaces: in JSON they can only be
  // spacing between values (never inside a string), so it's the same JSON.
  const flat = chunk => (lines && chunk.includes(10) ? chunk.map(b => (b === 10 ? 32 : b)) : chunk);
  const writeItem = async (x, i) => {
    const open = lines ? `{"i":${i},` : '{';
    if (typeof x === 'string') return w.write(enc.encode(open + x.slice(1)));
    await w.write(enc.encode(open + x.head.slice(1)));
    if (typeof x.body === 'string') await w.write(enc.encode(lines ? x.body.replaceAll('\n', ' ') : x.body));
    else if (x.body instanceof ArrayBuffer) await w.write(flat(new Uint8Array(x.body)));
    else if (x.body) for await (const chunk of x.body) await w.write(flat(chunk));
    await w.write(enc.encode('}'));
  };
  const pump = (async () => {
    if (lines) {
      // Each in the order it's in; one at a time (a line is never cut by another).
      let chain = Promise.resolve();
      await Promise.all(answers.map((answer, i) => answer.then(x => (chain = chain.then(() => writeItem(x, i)).then(() => w.write(enc.encode('\n')))))));
      await chain;
    } else {
      const results = await Promise.all(answers);
      await w.write(enc.encode('{"r":['));
      for (let i = 0; i < results.length; i++) {
        if (i) await w.write(enc.encode(','));
        await writeItem(results[i], i);
      }
      await w.write(enc.encode(']}'));
    }
    await w.close();
  })().catch(error => w.abort(error).catch(() => {}));
  ctx?.waitUntil?.(pump);
  return new Response(readable, { status: 200, headers: { ...headers, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}
// One item that throws is that item's failure (its error said), never the
// whole batch's: the rest of a first paint (MLB, NBA, the Premier League)
// came down with one month of CPBL.
const batchItem = (item, ctx) => batchItemOf(item, ctx).catch(error => `{"s":500,"e":${JSON.stringify(String(error?.message || error).slice(0, 120))}}`);
async function batchItemOf(item, ctx) {
  const bang = item.indexOf('!');
  const [trimParam, target] = bang > 0 && !item.slice(0, bang).includes(':') ? [item.slice(0, bang), item.slice(bang + 1)] : [null, item];
  const upstreamUrl = parseTarget(target);
  if (!upstreamUrl) return '{"s":400}';
  const t0 = Date.now();
  const r = await resolveOne(upstreamUrl, trimFor(trimParam, upstreamUrl), ctx).catch(error => ({ fetchError: error }));
  if (r.fetchError || r.status !== 200 || !/json|javascript/i.test(r.contentType || '')) {
    if (r.body?.cancel) r.body.cancel().catch(() => {});
    // A source turning the proxy away for a while (ESPN's 403 in a burst) is
    // its failure, not the ask's: answered as one (the app asks again).
    return `{"s":${r.fetchError || r.status === 403 || r.status === 429 ? 502 : r.status === 200 ? 415 : r.status},"ms":${Date.now() - t0}${r.fetchError ? `,"e":${JSON.stringify(String(r.fetchError?.name || r.fetchError).slice(0, 40))}` : ''}}`;
  }
  // (Its bytes as they are: handleBatch writes them out.)
  return { head: `{"s":200,"a":${r.age},"c":"${r.cache}","ms":${Date.now() - t0},"b":`, body: r.body };
}

async function handleSportsProxyRequest(request, env, headers, ip, ctx) {
  if (request.method !== 'GET') return json({ error: { message: 'GET only' } }, 405, headers);

  const requestParams = new URL(request.url).searchParams;
  if (requestParams.has('batch')) return handleBatch(request, env, headers, ip, ctx, requestParams);
  const target = requestParams.get('url') || '';
  const upstreamUrl = parseTarget(target);
  if (!upstreamUrl) return json({ error: { message: target ? 'Host not allowed' : 'Missing or invalid url' } }, 400, headers);

  // The Quadra Pass gate (see the top of this file).
  const gate = await checkSession(env, requestParams, headers, 1, request, ip);
  if (gate.error) return gate.error;
  const trim = trimFor(requestParams.get('trim'), upstreamUrl);
  headers['X-Sports-Proxy-Cache-Tier'] = policyOf(upstreamUrl, trim).tier;

  // (`within`: this Worker's own reads only, a live bet checked on a copy that young.)
  const within = ip === 'worker' && requestParams.has('within') ? Math.max(0, Number(requestParams.get('within')) || 0) : undefined;
  const result = await resolveOne(upstreamUrl, trim, ctx, { mirror: requestParams.get('mirror') !== '0', within });
  if (result.policy) headers['X-Sports-Proxy-Cache-Tier'] = result.policy.tier;
  headers['X-RateLimit-Backend'] = gate.session.open ? 'open' : 'session';
  if (result.fetchError) return json({ error: { message: result.fetchError.message || 'Upstream request failed' } }, 502, headers);
  if (result.status !== 200) return new Response(result.body, { status: result.status, headers: { ...headers, 'Content-Type': result.contentType } });
  return new Response(result.body, {
    status: 200,
    headers: {
      ...headers,
      'Content-Type': result.contentType,
      'Cache-Control': `private, max-age=${browserMaxAge(result.policy)}`,
      'X-Sports-Proxy-Cache': result.cache,
      'X-Sports-Proxy-Age': String(result.age)
    }
  });
}

// ==== The route and the F1 cron (worker.js) =================================

// /sports-proxy, with the Worker's CORS headers. A crash still answers with
// them (the app sees a failure it can try again, not a blocked request) and
// says what it was.
export function handleSports(request, env, ctx, headers, ip) {
  refreshDev(env, ctx);
  f1Log ||= doLog(env.F1_LOG);
  dataBucket = env.DATA || null;
  return handleSportsProxyRequest(request, env, headers, ip, ctx).catch(error => json({ error: { message: String(error?.message || error).slice(0, 200) } }, 500, headers));
}

// One of the proxy's own sources read for this Worker itself (sports-today.js
// builds a day's scoreboards): through resolveOne, as a phone's read is (the
// allowlist, the shared cache, the kept copies of a day over, the trims),
// without a Pass's gate. Parsed JSON, or null when it couldn't be read.
export async function readThrough(env, ctx, url, trim = null) {
  refreshDev(env, ctx);
  dataBucket = env.DATA || null;
  const target = parseTarget(url);
  if (!target) return null;
  const r = await resolveOne(target, trimFor(trim, target), ctx).catch(error => ({ fetchError: error }));
  if (r.fetchError || r.status !== 200 || !/json|javascript/i.test(r.contentType || '')) {
    if (r.body?.cancel) r.body.cancel().catch(() => {});
    return null;
  }
  return parsed(typeof r.body === 'string' || r.body instanceof ArrayBuffer || ArrayBuffer.isView(r.body) ? r.body : await new Response(r.body).arrayBuffer());
}

// Each minute from Thursday to Monday (UTC: every F1 weekend's sessions):
// while an F1 session runs, every car's last lap kept (f1-live.js
// sampleLive), so a phone opened late still has every lap; otherwise one
// look at the index, cached, and nothing more.
export function sportsCron(env, at) {
  return sampleLive(doLog(env.F1_LOG), at)
    .then(r => r !== 'idle' && console.log('f1 laps', r))
    .catch(e => console.log('f1 laps failed', String(e?.message || e)));
}
