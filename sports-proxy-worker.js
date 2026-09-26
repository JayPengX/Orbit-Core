// ---- sports-proxy-worker.js ----
// /sports-proxy - a thin, host-allowlisted CORS passthrough to ESPN's/the
// MLB Stats API's/the Jolpica F1 API's/Polymarket's Gamma API's own public
// JSON, so Match Find's own browser can fetch and score its whole live
// match list client-side.
//
// Deployed as its own Worker (wrangler.sports-proxy.toml), separate from
// worker.js, for one reason: worker.js's wrangler.toml pins [placement] to
// region "gcp:us-east4" (Virginia), which Gemini needs, and [placement] is a
// whole-script setting. While /sports-proxy lived there, every Match Find
// request - from a mostly Taiwan-based audience - went through a Virginia
// isolate (confirmed live: `X-Worker-Colo: IAD`), adding a transpacific
// round trip to each of the dozens of requests per refresh. Nothing this
// route calls has Gemini's region restriction, so this Worker has no
// [placement] block and runs near the caller.
//
// Deliberately self-contained (no imports) so it can still be pasted into
// the Cloudflare dashboard as a single file; the CORS helpers and KV rate
// limiter below are a trimmed copy of worker.js's.

const ALLOWED_ORIGINS = ['https://jaypengx.github.io'];

function isAllowedOrigin(origin) {
  return ALLOWED_ORIGINS.includes(origin) || /^http:\/\/localhost:\d+$/.test(origin || '');
}

function corsHeaders(origin, colo) {
  return {
    'Access-Control-Allow-Origin': isAllowedOrigin(origin) ? origin : 'null',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
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

// ---- Rate limiting (Workers KV, one counter per IP+hour) -------------------
// Same mechanism as worker.js's own isRateLimited - see that file for the
// full reasoning on why KV-with-in-memory-fallback and why batched writes.
// Only one feature lives in this Worker, so there's no need for the
// `feature` key worker.js's version uses to keep several routes' counters
// independent.
const RATE_WINDOW_MS = 60 * 60 * 1000;
const RATE_WINDOW_SECONDS = RATE_WINDOW_MS / 1000;
const KV_FLUSH_INTERVAL_MS = 60 * 1000;
const pendingCounters = new Map();

async function flushPendingCounter(kv, key, pending) {
  const total = pending.base + pending.delta;
  pending.base = total;
  pending.delta = 0;
  pending.lastFlushAt = Date.now();
  await kv.put(key, String(total), { expirationTtl: RATE_WINDOW_SECONDS + 60 });
}

async function isRateLimitedKV(kv, bucketKey, limit) {
  const windowBucket = Math.floor(Date.now() / RATE_WINDOW_MS);
  let pending = pendingCounters.get(bucketKey);
  if (pending && pending.windowBucket !== windowBucket) {
    if (pending.delta > 0) {
      await flushPendingCounter(kv, `rl:${bucketKey}:${pending.windowBucket}`, pending).catch(() => {});
    }
    pending = null;
  }
  if (!pending) {
    const stored = Number((await kv.get(`rl:${bucketKey}:${windowBucket}`)) || '0');
    pending = { windowBucket, base: stored, delta: 0, lastFlushAt: Date.now() };
    pendingCounters.set(bucketKey, pending);
  }
  if (pending.base + pending.delta >= limit) return true;
  pending.delta += 1;
  if (Date.now() - pending.lastFlushAt >= KV_FLUSH_INTERVAL_MS) {
    await flushPendingCounter(kv, `rl:${bucketKey}:${windowBucket}`, pending);
  }
  return false;
}

const requestLog = new Map();
function isRateLimitedInMemory(bucketKey, limit) {
  const now = Date.now();
  const timestamps = (requestLog.get(bucketKey) || []).filter(time => now - time < RATE_WINDOW_MS);
  const limited = timestamps.length >= limit;
  timestamps.push(now);
  requestLog.set(bucketKey, timestamps);
  return limited;
}

async function isRateLimited(env, ip, limit) {
  if (env.RATE_LIMIT_KV) {
    try {
      return { limited: await isRateLimitedKV(env.RATE_LIMIT_KV, ip, limit), backend: 'kv' };
    } catch (error) {
      return { limited: isRateLimitedInMemory(ip, limit), backend: `kv-error:${(error && error.message) || error}` };
    }
  }
  return { limited: isRateLimitedInMemory(ip, limit), backend: 'memory-no-binding' };
}

// ==== /sports-proxy - CORS passthrough for public sports data ==============
const SPORTS_PROXY_FETCH_USER_AGENT = 'Match-Find-Bot/1.0 (+https://github.com/JayPengX/Match-Find)';
const SPORTS_PROXY_ALLOWED_HOSTS = [
  'site.api.espn.com',
  // Per-fixture odds (Match Find's pre-game line for games already in
  // progress - the scoreboard drops it once a game starts).
  'sports.core.api.espn.com',
  'statsapi.mlb.com',
  'api.jolpi.ca',
  'gamma-api.polymarket.com',
  // Kambi's public odds feed: Odds Study's tennis, badminton, table tennis,
  // volleyball, snooker and Asian baseball/basketball odds and live scores.
  'eu-offering-api.kambicdn.com',
  // Yahoo Finance's public chart, spark and search endpoints (no key): Stock
  // Study's quotes, charts, dividends and splits for stocks, ETFs, funds,
  // currencies, crypto, metals and indexes worldwide.
  'query1.finance.yahoo.com',
  'query2.finance.yahoo.com'
];
const SPORTS_PROXY_RATE_LIMIT = 600;
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
const CACHE_LIVE = { tier: 'live', fresh: 20 * SECOND, stale: 0 };
// Polymarket's pages mix every open market for a league, today's games
// included, and Match Find's live-odds poll asks for them every 30s - so
// they follow the same strict rule as live scores. (An earlier version
// served a copy up to 2 minutes old while refreshing in the background;
// since the poll interval is longer than any short fresh window, every
// poll then got the PREVIOUS poll's odds - always one tick behind.)
const CACHE_ODDS = { tier: 'odds', fresh: 20 * SECOND, stale: 0 };
const CACHE_SCHEDULE = { tier: 'schedule', fresh: 10 * MINUTE, stale: DAY };
const CACHE_STANDINGS = { tier: 'standings', fresh: 30 * MINUTE, stale: DAY };
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
      return url.pathname.endsWith('/scoreboard') ? scoreboardPolicy(url) : CACHE_STANDINGS;
    case 'sports.core.api.espn.com':
      return CACHE_PREGAME_LINE;
    case 'statsapi.mlb.com':
    case 'api.jolpi.ca':
      return CACHE_STANDINGS;
    case 'gamma-api.polymarket.com':
      return url.pathname === '/public-search' ? CACHE_FUTURES : CACHE_ODDS;
    case 'eu-offering-api.kambicdn.com':
      return url.pathname.includes('/listView/') ? CACHE_PREMATCH : CACHE_LIVE;
    case 'query1.finance.yahoo.com':
    case 'query2.finance.yahoo.com':
      return yahooPolicy(url);
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
// Opt-in (`&trim=kambi-events`) trimming for Kambi's list views and live
// feed: only the fields Odds Study reads (lib/kambi.mjs), a small fraction
// of each event's full record.
const TRIM_KAMBI_EVENTS = 'kambi-events';

function trimKambi(data) {
  if (!data || typeof data !== 'object') return data;
  const event = e =>
    e && { id: e.id, name: e.name, homeName: e.homeName, awayName: e.awayName, start: e.start, state: e.state, group: e.group, sport: e.sport };
  const offers = list =>
    Array.isArray(list)
      ? list.map(o => ({
          criterion: { englishLabel: o.criterion?.englishLabel },
          betOfferType: { englishName: o.betOfferType?.englishName },
          outcomes: (o.outcomes || []).map(x => ({ type: x.type, odds: x.odds, line: x.line }))
        }))
      : list;
  const live = d => d && { score: d.score, statistics: d.statistics?.sets ? { sets: d.statistics.sets } : undefined };
  return {
    events: Array.isArray(data.events) ? data.events.map(item => ({ event: event(item.event), betOffers: offers(item.betOffers) })) : undefined,
    liveEvents: Array.isArray(data.liveEvents) ? data.liveEvents.map(item => ({ event: event(item.event), liveData: live(item.liveData) })) : undefined
  };
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
// Yahoo refuses the crumb to a bot's User-Agent (HTTP 429).
const YAHOO_BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
let yahooSession = null;

function needsYahooCrumb(url) {
  return (url.hostname === 'query1.finance.yahoo.com' || url.hostname === 'query2.finance.yahoo.com') && YAHOO_CRUMB_PATHS.some(p => url.pathname.startsWith(p));
}

async function getYahooSession(renew = false) {
  if (!renew && yahooSession && Date.now() - yahooSession.at < YAHOO_SESSION_MS) return yahooSession;
  const first = await fetch('https://fc.yahoo.com/', {
    headers: { 'User-Agent': YAHOO_BROWSER_UA },
    redirect: 'manual',
    signal: AbortSignal.timeout(SPORTS_PROXY_UPSTREAM_TIMEOUT_MS)
  });
  const setCookies = typeof first.headers.getSetCookie === 'function' ? first.headers.getSetCookie() : [first.headers.get('Set-Cookie') || ''];
  const cookie = setCookies.map(c => c.split(';')[0]).filter(Boolean).join('; ');
  if (!cookie) throw new Error('Yahoo session unavailable');
  const res = await fetch('https://query2.finance.yahoo.com/v1/test/getcrumb', {
    headers: { 'User-Agent': YAHOO_BROWSER_UA, Cookie: cookie },
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
      headers: { 'User-Agent': YAHOO_BROWSER_UA, Cookie: session.cookie },
      signal: AbortSignal.timeout(SPORTS_PROXY_UPSTREAM_TIMEOUT_MS)
    });
    if ((res.status !== 401 && res.status !== 403) || attempt > 0) return res;
  }
}

// Fetches `upstreamUrl`, applies the optional trim, and saves a 200 into the
// shared cache. Resolves to { status, contentType, body } or
// { fetchError }. Never throws.
async function fetchUpstream(upstreamUrl, trim) {
  let upstream;
  try {
    upstream = needsYahooCrumb(upstreamUrl)
      ? await fetchYahooWithCrumb(upstreamUrl)
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
    if (trim) {
      try {
        const parsed = JSON.parse(new TextDecoder().decode(body));
        body = JSON.stringify(trim === TRIM_KAMBI_EVENTS ? trimKambi(parsed) : trimPolymarketEvents(parsed));
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

async function handleSportsProxyRequest(request, env, headers, ip, ctx) {
  if (request.method !== 'GET') return json({ error: { message: 'GET only' } }, 405, headers);

  const requestParams = new URL(request.url).searchParams;
  const target = requestParams.get('url') || '';
  let upstreamUrl;
  try {
    upstreamUrl = new URL(target);
  } catch {
    return json({ error: { message: 'Missing or invalid url' } }, 400, headers);
  }
  if (upstreamUrl.protocol !== 'https:' || !SPORTS_PROXY_ALLOWED_HOSTS.includes(upstreamUrl.hostname)) {
    return json({ error: { message: 'Host not allowed' } }, 400, headers);
  }

  const trimParam = requestParams.get('trim');
  const trim =
    trimParam === TRIM_POLYMARKET_EVENTS && upstreamUrl.hostname === 'gamma-api.polymarket.com' && upstreamUrl.pathname === '/events'
      ? TRIM_POLYMARKET_EVENTS
      : trimParam === TRIM_KAMBI_EVENTS && upstreamUrl.hostname === 'eu-offering-api.kambicdn.com'
        ? TRIM_KAMBI_EVENTS
        : null;
  const policy = cachePolicyFor(upstreamUrl);
  headers['X-Sports-Proxy-Cache-Tier'] = policy.tier;

  const cache = caches.default;
  // A trimmed response is cached under its own key (a marker param on the
  // cache key only - never sent upstream), so it can't be served to a
  // caller that asked for the full passthrough, or vice versa.
  const cacheKeyUrl = new URL(upstreamUrl.toString());
  if (trim) cacheKeyUrl.searchParams.set('__sports_proxy_trim', trim);
  const cacheKey = new Request(cacheKeyUrl.toString());
  const cached = await cache.match(cacheKey);
  if (cached) {
    const storedAt = Number(cached.headers.get('X-Sports-Proxy-Stored-At'));
    // Entries from before this header existed carry the old 20s lifetime,
    // so they're simply treated as fresh until the cache drops them.
    const ageSeconds = Number.isFinite(storedAt) && storedAt > 0 ? (Date.now() - storedAt) / 1000 : 0;
    const isFresh = ageSeconds <= policy.fresh;
    if (isFresh || ageSeconds <= policy.fresh + policy.stale) {
      if (!isFresh && !refreshesInFlight.has(cacheKey.url)) {
        refreshesInFlight.add(cacheKey.url);
        ctx.waitUntil(
          fetchUpstream(upstreamUrl, trim)
            .then(result => (result.status === 200 ? cache.put(cacheKey, cacheEntry(result, policy)) : null))
            .catch(() => {})
            .finally(() => refreshesInFlight.delete(cacheKey.url))
        );
      }
      return new Response(cached.body, {
        status: cached.status,
        headers: {
          ...headers,
          'Content-Type': cached.headers.get('Content-Type') || 'application/json',
          'X-Sports-Proxy-Cache': isFresh ? 'HIT' : 'STALE',
          'X-Sports-Proxy-Age': String(Math.round(ageSeconds))
        }
      });
    }
  }

  // The rate-limit check (a KV read) and the upstream fetch run
  // concurrently rather than one after the other, taking a KV round trip
  // off the critical path of every ordinary request. The trade-off: a
  // request that turns out to be rate-limited still pays for the upstream
  // fetch - acceptable, since that's the rare, already-abusive case.
  const [rateLimit, result] = await Promise.all([isRateLimited(env, ip, SPORTS_PROXY_RATE_LIMIT), fetchUpstream(upstreamUrl, trim)]);
  headers['X-RateLimit-Backend'] = rateLimit.backend;
  if (rateLimit.limited) {
    return json({ error: { message: 'Too many requests, please try again later.' } }, 429, headers);
  }
  if (result.fetchError) {
    return json({ error: { message: result.fetchError.message || 'Upstream request failed' } }, 502, headers);
  }
  if (result.status !== 200) {
    return new Response(result.body, { status: result.status, headers: { ...headers, 'Content-Type': result.contentType } });
  }
  ctx.waitUntil(cache.put(cacheKey, cacheEntry(result, policy)));
  return new Response(result.body, {
    status: 200,
    headers: { ...headers, 'Content-Type': result.contentType, 'X-Sports-Proxy-Cache': 'MISS' }
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

    if (path === '/sports-proxy') return handleSportsProxyRequest(request, env, headers, ip, ctx);
    return json({ error: { message: 'Not found' } }, 404, headers);
  }
};
