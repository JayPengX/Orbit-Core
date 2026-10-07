// ---- sports-proxy-worker.js ----
// /sports-proxy - a thin, host-allowlisted CORS passthrough to ESPN's/the
// MLB Stats API's/the Jolpica F1 API's/Polymarket's Gamma API's own public
// JSON, so Match Find's own browser can fetch and score its whole live
// match list client-side.
//
// Deployed as its own Worker (wrangler.sports-proxy.toml), separate from
// worker.js, for one reason: worker.js's wrangler.toml pinned [placement] to
// region "gcp:us-east4" (Virginia) for Gemini (now "gcp:asia-east1",
// Taiwan), and [placement] is a
// whole-script setting. While /sports-proxy lived there, every Match Find
// request - from a mostly Taiwan-based audience - went through a Virginia
// isolate (confirmed live: `X-Worker-Colo: IAD`), adding a transpacific
// round trip to each of the dozens of requests per refresh. Nothing this
// route calls has Gemini's region restriction, so this Worker has no
// [placement] block and runs near the caller.
//
// The CORS helpers below are a trimmed copy of
// worker.js's. It imports one file, quadra-token.js, to check Quadra Pass
// session tokens (deployed with Wrangler, which bundles it).
//
// A Quadra Pass is required: every request carries `qt=<session token>`
// (from Shared-Proxy's /eco), checked here with the shared ECO_TOKEN_SECRET.
// A request with a valid token is counted per session in this isolate's
// memory, never in KV (this Worker has no KV at all). Until ECO_TOKEN_SECRET
// is set on this Worker the gate is off and each IP is counted the same way.
import { readToken, sessionLimited } from './quadra-token.js';
import { BRANDS } from './kit/brand.mjs';
import { ASIA_HOST, asiaBaseballResponse, asiaTarget } from './asia-baseball.js';
import { F1_LIVE_HOST, f1LiveResponse } from './f1-live.js';

const ALLOWED_ORIGINS = ['https://jaypengx.github.io'];

function isAllowedOrigin(origin) {
  return ALLOWED_ORIGINS.includes(origin) || /^http:\/\/localhost:\d+$/.test(origin || '');
}

function corsHeaders(origin, colo) {
  return {
    'Access-Control-Allow-Origin': isAllowedOrigin(origin) ? origin : 'null',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Expose-Headers': 'X-Worker-Colo, X-Sports-Proxy-Cache, X-Sports-Proxy-Cache-Tier, X-Sports-Proxy-Age',
    'X-Worker-Colo': colo || 'unknown',
    Vary: 'Origin'
  };
}

function json(data, status, headers) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json' }
  });
}

// ==== /sports-proxy - CORS passthrough for public sports data ==============
const ELTA_HOST = 'piceltaott-elta.cdn.hinet.net';
// formula1.com's driver and team pages: the official season, career and
// profile figures (only /en/drivers/<slug> and /en/teams/<slug>, trimmed).
const F1_HOST = 'www.formula1.com';
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
  // Google's translate endpoint (the Chrome dictionary's, no key): a
  // company's description in the reader's language (Securities). Only
  // /translate_a/t; sent upstream as a POST (see fetchUpstream), kept a month.
  'clients5.google.com',
  // ELTA's (愛爾達) sports schedule: which game each of its channels carries,
  // for Orbit Sports' "where to watch" (only the one list, always trimmed).
  ELTA_HOST,
  F1_HOST,
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
// Polymarket's pages mix every open market for a league, today's games
// included, and Match Find's live-odds poll asks for them every 30s - so
// they follow the same strict rule as live scores. (An earlier version
// served a copy up to 2 minutes old while refreshing in the background;
// since the poll interval is longer than any short fresh window, every
// poll then got the PREVIOUS poll's odds - always one tick behind.)
const CACHE_ODDS = { tier: 'odds', fresh: 10 * SECOND, stale: 0 };
// F1's live timing: a few seconds, shared by everyone watching.
const CACHE_F1_LIVE = { tier: 'f1-live', fresh: 4 * SECOND, stale: 0 };
const CACHE_SCHEDULE = { tier: 'schedule', fresh: 10 * MINUTE, stale: DAY };
const CACHE_SEASON = { tier: 'season', fresh: 3 * MINUTE, stale: 30 * MINUTE };
const CACHE_STANDINGS = { tier: 'standings', fresh: 30 * MINUTE, stale: DAY };
const CACHE_TEAM_SCHEDULE = { tier: 'team-schedule', fresh: 3 * MINUTE, stale: DAY };
// ESPN core odds is only ever asked for a game's PRE-game line, which
// can't change once the game has started.
const CACHE_PREGAME_LINE = { tier: 'pregame-line', fresh: HOUR, stale: DAY };
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

// Asian baseball by month: this month and next change with every score (a
// minute); a past month only with a late fix.
// This month's: read again after 2 minutes (each read is a page and a few
// day lists), the last good copy answered for 6 hours if a read fails.
const CACHE_ASIA_NOW = { tier: 'asia-now', fresh: 2 * MINUTE, stale: 6 * HOUR };
// A month over: its results don't change.
const CACHE_ASIA_PAST = { tier: 'asia-past', fresh: 12 * HOUR, stale: 7 * DAY };
function asiaPolicy(url) {
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

function cachePolicyFor(url) {
  switch (url.hostname) {
    case 'site.api.espn.com':
      // A team's schedule has its games' scores: minutes, not a table's half hour.
      // A game's own page (box score, plays) is live while it's on: a game
      // sheet open on a game in play reads it every 15 s and was getting a
      // copy up to half an hour old. A finished one comes from the mirror.
      if (url.pathname.endsWith('/summary')) return CACHE_LIVE;
      // A team's injuries on game day (Sports' game sheet reads its roster for them): minutes.
      if (url.pathname.endsWith('/roster') && url.searchParams.get('enable') === 'injuries') return CACHE_TEAM_SCHEDULE;
      return url.pathname.endsWith('/scoreboard') ? scoreboardPolicy(url) : url.pathname.endsWith('/schedule') ? CACHE_TEAM_SCHEDULE : CACHE_STANDINGS;
    case 'sports.core.api.espn.com':
      return CACHE_PREGAME_LINE;
    case 'statsapi.mlb.com':
      // A day's games with their linescore (Sports' live count, runners,
      // batter and pitcher when ESPN's feed leaves them out): live.
      if (url.pathname === '/api/v1/schedule' && /linescore/.test(url.searchParams.get('hydrate') || '')) return CACHE_LIVE;
      return CACHE_STANDINGS;
    case 'api.jolpi.ca':
      return CACHE_STANDINGS;
    case 'api.openf1.org':
      return CACHE_ODDS;
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
    case 'clients5.google.com':
      return CACHE_TRANSLATE;
    case ELTA_HOST:
    case F1_HOST:
      return CACHE_STANDINGS;
    case ASIA_HOST:
      return asiaPolicy(url);
    case F1_LIVE_HOST:
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
      categories: (x.categories || []).map(c => ({ name: c.name, values: c.values }))
    }))
  };
}

// ELTA's schedule, a small fraction of it: each live program's day, start
// and end (Unix seconds), channel, league (ELTA's English name) and title.
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
      programs.push({ d: day, s: p.start_time, e: p.end_time, ch: p.channel_number, g: p.game_type_en || p.game_type || '', t: p.program_desc || '' });
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
async function fetchUpstream(upstreamUrl, trim) {
  let upstream;
  try {
    upstream = upstreamUrl.hostname === ASIA_HOST
      ? await asiaBaseballResponse(upstreamUrl)
      : upstreamUrl.hostname === F1_LIVE_HOST
      ? await f1LiveResponse(upstreamUrl)
      : needsYahooCrumb(upstreamUrl)
      ? await fetchYahooWithCrumb(upstreamUrl)
      : upstreamUrl.hostname === 'clients5.google.com'
        ? await translateUpstream(upstreamUrl)
        : await fetch(upstreamUrl.toString(), {
          headers: { 'User-Agent': SPORTS_PROXY_FETCH_USER_AGENT },
          signal: AbortSignal.timeout(SPORTS_PROXY_UPSTREAM_TIMEOUT_MS)
        });
  } catch (error) {
    return { fetchError: error };
  }
  try {
    const contentType = upstream.headers.get('Content-Type') || 'application/json';
    if (upstream.status !== 200) return { status: upstream.status, contentType, body: upstream.body };
    let body = await upstream.arrayBuffer();
    if (trim === TRIM_F1PAGE) return { status: 200, contentType: 'application/json', body: JSON.stringify(trimF1Page(new TextDecoder().decode(body))) };
    if (trim) {
      try {
        const parsed = JSON.parse(new TextDecoder().decode(body));
        body = JSON.stringify(trim === TRIM_KAMBI_EVENTS ? trimKambi(parsed) : trim === TRIM_KAMBI_OFFERS ? trimKambiOffers(parsed) : trim === TRIM_ESPN_ROSTER ? trimEspnRoster(parsed) : trim === TRIM_ESPN_ATHLETES ? trimEspnAthletes(parsed) : trim === TRIM_ELTA ? trimElta(parsed) : trim === TRIM_POLYMARKET_GAMES ? trimPolymarketGames(parsed) : trimPolymarketEvents(parsed));
      } catch {
        // Not the JSON shape expected - pass it through untouched.
      }
    }
    return { status: 200, contentType, body };
  } catch (error) {
    return { fetchError: error };
  }
}

function cacheEntry(result, policy) {
  return new Response(result.body, {
    status: 200,
    headers: {
      'Content-Type': result.contentType,
      // The cache itself keeps the entry for the whole fresh + stale span;
      // X-Sports-Proxy-Stored-At is what decides which of the two it's in.
      'Cache-Control': `public, max-age=${policy.fresh + policy.stale}`,
      'X-Sports-Proxy-Stored-At': String(Date.now())
    }
  });
}

// Which trim (if any) applies to a URL: only the hosts each one is for.
function trimFor(trimParam, upstreamUrl) {
  if (upstreamUrl.hostname === ELTA_HOST) return TRIM_ELTA;
  if (upstreamUrl.hostname === F1_HOST) return TRIM_F1PAGE;
  if (trimParam === TRIM_POLYMARKET_EVENTS && upstreamUrl.hostname === 'gamma-api.polymarket.com' && upstreamUrl.pathname === '/events') return TRIM_POLYMARKET_EVENTS;
  if (trimParam === TRIM_POLYMARKET_GAMES && upstreamUrl.hostname === 'gamma-api.polymarket.com' && upstreamUrl.pathname === '/events') return TRIM_POLYMARKET_GAMES;
  if (trimParam === TRIM_KAMBI_EVENTS && upstreamUrl.hostname === 'eu-offering-api.kambicdn.com') return TRIM_KAMBI_EVENTS;
  if (trimParam === TRIM_ESPN_ROSTER && upstreamUrl.hostname === 'site.api.espn.com' && upstreamUrl.pathname.endsWith('/roster')) return TRIM_ESPN_ROSTER;
  if (trimParam === TRIM_ESPN_ATHLETES && upstreamUrl.hostname === 'site.api.espn.com' && upstreamUrl.pathname.endsWith('/statistics/byathlete')) return TRIM_ESPN_ATHLETES;
  if (trimParam === TRIM_KAMBI_OFFERS && upstreamUrl.hostname === 'eu-offering-api.kambicdn.com' && upstreamUrl.pathname.includes('/betoffer/')) return TRIM_KAMBI_OFFERS;
  return null;
}

function parseTarget(target) {
  try {
    const u = new URL(target);
    if (u.hostname === 'clients5.google.com' && (u.pathname !== '/translate_a/t' || (u.searchParams.get('q') || '').length > 5000)) return null;
    if (u.hostname === ELTA_HOST && u.pathname !== ELTA_PATH) return null;
    if (u.hostname === 'clob.polymarket.com' && u.pathname !== '/prices-history') return null;
    if (u.hostname === F1_HOST && !/^\/en\/(drivers|teams)\/[a-z-]+$/.test(u.pathname)) return null;
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
async function resolveOne(upstreamUrl, trim, ctx) {
  const policy = cachePolicyFor(upstreamUrl);
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
  const cached = match && { status: match.status, contentType: match.headers.get('Content-Type') || 'application/json', storedAt: Number(match.headers.get('X-Sports-Proxy-Stored-At')), body: await match.arrayBuffer() };
  if (cached) {
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
      if (result?.status === 200) return { ...result, cache: 'MISS', age: 0, policy };
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
  const result = await fetchUpstream(upstreamUrl, trim);
  if (result.status === 200) ctx.waitUntil(cache.put(cacheKey, cacheEntry(result, policy)));
  return { ...result, cache: 'MISS', age: 0, policy };
}

// How long the browser may keep an answer itself (its own copy, by the
// address it asked for): the fresh part of the cache policy, at most 10
// minutes. Live data only a few seconds.
const browserMaxAge = policy => Math.min(policy.fresh, 600);

// The dev door (as worker.js's for transit): a page served from localhost
// (the preview tool testing on the real proxy, its cache and its limits) may
// read without a Quadra Pass, a session's limit for each app at an address. SPORTS_DEV = "off"
// (wrangler.sports-proxy.toml [vars]) closes it.
const DEV_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1):\d+$/;
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
  const dev = !requestParams.get('qt') && env.SPORTS_DEV !== 'off' && DEV_ORIGIN.test(request?.headers.get('Origin') || '');
  if (!env.ECO_TOKEN_SECRET || dev) {
    for (let i = 0; i < weight; i++) if (sessionLimited(`ip:${app}:${ip}`, SESSION_RATE_LIMIT)) return { error: tooMany(headers) };
    return { session: { s: `ip:${ip}`, dev, open: !env.ECO_TOKEN_SECRET } };
  }
  const session = await readToken(env.ECO_TOKEN_SECRET, requestParams.get('qt') || '', 'ses');
  if (!session) return { error: json({ error: { code: 'QUADRA_PASS_REQUIRED', message: 'Sign in with a Quadra Pass.' } }, 401, headers) };
  for (let i = 0; i < weight; i++) if (sessionLimited(`${app}:${session.s}`, SESSION_RATE_LIMIT)) return { error: tooMany(headers) };
  return { session };
}

// A batch: `?batch=1&u=<url>&u=<url>…` (each optionally `<trim>!<url>`),
// answered as one JSON document { r: [{ s: status, b: body } …] } in the
// same order. One Worker request instead of many - the Workers plan bills
// per request, and a page's first paint asks for a dozen lists at once.
// Every URL still goes through the shared cache on its own.
const BATCH_MAX = 12;
// One slow upstream mustn't hold back the rest of its batch: an item not
// answered within this answers 504 (the app asks for it again on its own),
// while its fetch goes on in the background into the shared cache.
const BATCH_ITEM_WAIT_MS = 3_000;
async function handleBatch(request, env, headers, ip, ctx, requestParams) {
  const items = requestParams.getAll('u').slice(0, BATCH_MAX);
  if (!items.length) return json({ error: { message: 'Missing u' } }, 400, headers);
  const gate = await checkSession(env, requestParams, headers, items.length, request, ip);
  if (gate.error) return gate.error;
  const results = await Promise.all(
    items.map(item => {
      const work = batchItem(item, ctx);
      ctx?.waitUntil?.(work.catch(() => {}));
      let timer;
      const late = new Promise(resolve => (timer = setTimeout(() => resolve('{"s":504}'), BATCH_ITEM_WAIT_MS)));
      return Promise.race([work.finally(() => clearTimeout(timer)), late]);
    })
  );
  // Written out as the bytes came (never decoded, never joined into one
  // string): a season's page is 6 MB, and copies of a few of them at once
  // ran a Worker out of memory, failing every batch on it together.
  const enc = new TextEncoder();
  const { readable, writable } = new TransformStream();
  const w = writable.getWriter();
  const pump = (async () => {
      await w.write(enc.encode('{"r":['));
      for (let i = 0; i < results.length; i++) {
        const x = results[i];
        if (i) await w.write(enc.encode(','));
        if (typeof x === 'string') await w.write(enc.encode(x));
        else {
          await w.write(enc.encode(x.head));
          if (typeof x.body === 'string') await w.write(enc.encode(x.body));
          else if (x.body instanceof ArrayBuffer) await w.write(new Uint8Array(x.body));
          else if (x.body) for await (const chunk of x.body) await w.write(chunk);
          await w.write(enc.encode('}'));
        }
      }
      await w.write(enc.encode(']}'));
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
  headers['X-Sports-Proxy-Cache-Tier'] = cachePolicyFor(upstreamUrl).tier;

  const result = await resolveOne(upstreamUrl, trim, ctx);
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

// ==== Routing ================================================================

export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get('Origin') || '';
    const headers = corsHeaders(origin, request.cf?.colo);

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });

    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    const path = new URL(request.url).pathname.replace(/\/+$/, '');

    // A crash still answers with CORS (the app sees a failure it can try
    // again, not a blocked request) and says what it was.
    if (path === '/sports-proxy') return handleSportsProxyRequest(request, env, headers, ip, ctx).catch(error => json({ error: { message: String(error?.message || error).slice(0, 200) } }, 500, headers));
    return json({ error: { message: 'Not found' } }, 404, headers);
  },
};
