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

const ALLOWED_ORIGINS = ['https://jaypengx-collab.github.io'];

function isAllowedOrigin(origin) {
  return ALLOWED_ORIGINS.includes(origin) || /^http:\/\/localhost:\d+$/.test(origin || '');
}

function corsHeaders(origin, colo) {
  return {
    'Access-Control-Allow-Origin': isAllowedOrigin(origin) ? origin : 'null',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Expose-Headers': 'X-Worker-Colo',
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
const SPORTS_PROXY_FETCH_USER_AGENT = 'Match-Find-Bot/1.0 (+https://github.com/jaypengx-collab/Match-Find)';
const SPORTS_PROXY_ALLOWED_HOSTS = [
  'site.api.espn.com',
  // Per-fixture odds (Match Find's pre-game line for games already in
  // progress - the scoreboard drops it once a game starts).
  'sports.core.api.espn.com',
  'statsapi.mlb.com',
  'api.jolpi.ca',
  'gamma-api.polymarket.com'
];
const SPORTS_PROXY_RATE_LIMIT = 600;
const SPORTS_PROXY_UPSTREAM_TIMEOUT_MS = 8_000;
const SPORTS_PROXY_CACHE_TTL_SECONDS = 20;

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

  const trim =
    requestParams.get('trim') === TRIM_POLYMARKET_EVENTS &&
    upstreamUrl.hostname === 'gamma-api.polymarket.com' &&
    upstreamUrl.pathname === '/events';

  const cache = caches.default;
  // A trimmed response is cached under its own key (a marker param on the
  // cache key only - never sent upstream), so it can't be served to a
  // caller that asked for the full passthrough, or vice versa.
  const cacheKeyUrl = new URL(upstreamUrl.toString());
  if (trim) cacheKeyUrl.searchParams.set('__sports_proxy_trim', TRIM_POLYMARKET_EVENTS);
  const cacheKey = new Request(cacheKeyUrl.toString());
  const cached = await cache.match(cacheKey);
  if (cached) {
    return new Response(cached.body, {
      status: cached.status,
      headers: {
        ...headers,
        'Content-Type': cached.headers.get('Content-Type') || 'application/json',
        'X-Sports-Proxy-Cache': 'HIT'
      }
    });
  }

  // The rate-limit check (a KV read) and the upstream fetch run
  // concurrently rather than one after the other, taking a KV round trip
  // off the critical path of every ordinary request. The trade-off: a
  // request that turns out to be rate-limited still pays for the upstream
  // fetch - acceptable, since that's the rare, already-abusive case.
  const upstreamPromise = fetch(upstreamUrl.toString(), {
    headers: { 'User-Agent': SPORTS_PROXY_FETCH_USER_AGENT },
    signal: AbortSignal.timeout(SPORTS_PROXY_UPSTREAM_TIMEOUT_MS)
  }).catch(error => ({ fetchError: error }));
  const [rateLimit, upstreamResult] = await Promise.all([
    isRateLimited(env, ip, SPORTS_PROXY_RATE_LIMIT),
    upstreamPromise
  ]);
  headers['X-RateLimit-Backend'] = rateLimit.backend;
  if (rateLimit.limited) {
    return json({ error: { message: 'Too many requests, please try again later.' } }, 429, headers);
  }
  if (upstreamResult.fetchError) {
    return json({ error: { message: upstreamResult.fetchError.message || 'Upstream request failed' } }, 502, headers);
  }

  try {
    const upstream = upstreamResult;
    const contentType = upstream.headers.get('Content-Type') || 'application/json';
    if (upstream.status !== 200) {
      return new Response(upstream.body, { status: upstream.status, headers: { ...headers, 'Content-Type': contentType } });
    }
    let body = await upstream.arrayBuffer();
    if (trim) {
      try {
        body = JSON.stringify(trimPolymarketEvents(JSON.parse(new TextDecoder().decode(body))));
      } catch {
        // Not the JSON array shape expected - pass it through untouched.
      }
    }
    ctx.waitUntil(
      cache.put(
        cacheKey,
        new Response(body, {
          status: 200,
          headers: { 'Content-Type': contentType, 'Cache-Control': `public, max-age=${SPORTS_PROXY_CACHE_TTL_SECONDS}` }
        })
      )
    );
    return new Response(body, { status: 200, headers: { ...headers, 'Content-Type': contentType, 'X-Sports-Proxy-Cache': 'MISS' } });
  } catch (error) {
    return json({ error: { message: error.message || 'Upstream request failed' } }, 502, headers);
  }
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
