// ---- sports-proxy-worker.js ----
// /sports-proxy - a thin, host-allowlisted CORS passthrough to ESPN's/the
// MLB Stats API's/the Jolpica F1 API's/Polymarket's Gamma API's own public
// JSON, so Match Find's own browser can fetch/score its whole live match
// list directly, client-side. See worker.js's own top comment for the full
// picture of what this repo serves - this route used to live there too,
// alongside /gemini, /nl-edit, /sync, /vocab-sync, /vocab-ai, until a real,
// live-confirmed latency bug forced it apart into its own deployment:
//
// worker.js's wrangler.toml pins [placement] to region = "gcp:us-east4"
// (Virginia) - necessary for /gemini and /vocab-ai, whose one outbound
// fetch to Google's Gemini API 400s outright from Cloudflare's Hong Kong
// colo (see that file's own [placement] comment for the full story). But
// [placement] is a whole-SCRIPT setting, not a per-route one - Cloudflare
// has no way to pin only some of a Worker's routes to a region while
// leaving others on the default "run near whichever colo the request
// itself arrived at" behavior. So every request to that shared Worker,
// /sports-proxy included, was being forced through an isolate running in
// Virginia regardless of where the actual caller was - confirmed live via
// curl against the deployed Worker: an ordinary /sports-proxy request came
// back with `X-Worker-Colo: IAD`, not a colo anywhere near Match Find's
// actual Taiwan-based audience.
//
// For a viewer in Taiwan, that means every single one of Match Find's
// dozens of near-term/full-window/live-poll requests per refresh was
// paying a full Taiwan<->Virginia round trip on top of whatever the
// upstream API itself took - live-reported as "the first load goes blank
// for 10+ seconds" and "updating data takes 10-20 seconds, inconsistently"
// (this repo's docs/recommendation-engine-audit.md's own Round 25 entry
// documented two other real, smaller contributors to that same symptom -
// buildMatches's own serial fetch stages and this route's own 15s upstream
// timeout - but couldn't reproduce the reported magnitude from a
// US-based sandbox, which is exactly what you'd expect if THIS was the
// dominant cost all along: a US-based tester's own request already lands
// near Virginia with nothing to gain from moving, so the region pin's real
// cost is invisible from there and only shows up for a caller on the other
// side of the world).
//
// The fix is this file: deployed as its own separate Worker (see
// wrangler.sports-proxy.toml, no [placement] block at all), so Cloudflare's
// own default behavior applies - run the isolate at whichever colo actually
// received the request, i.e. near the real caller. Nothing this route calls
// (ESPN, the MLB Stats API, Jolpica, Polymarket) has Gemini's
// region-availability restriction, so there is no reason for it to share
// worker.js's pin at all. worker.js keeps /gemini, /nl-edit, /sync,
// /vocab-sync, /vocab-ai - none of Orbit Class/Vocab's own consuming code
// changes, since none of them ever called /sports-proxy.
//
// Everything below (CORS/rate-limiting/the route handler itself) is
// otherwise unchanged from what used to live in worker.js - see git history
// there for this code's own prior comments/context if needed.

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

async function handleSportsProxyRequest(request, env, headers, ip, ctx) {
  if (request.method !== 'GET') return json({ error: { message: 'GET only' } }, 405, headers);

  const target = new URL(request.url).searchParams.get('url') || '';
  let upstreamUrl;
  try {
    upstreamUrl = new URL(target);
  } catch {
    return json({ error: { message: 'Missing or invalid url' } }, 400, headers);
  }
  if (upstreamUrl.protocol !== 'https:' || !SPORTS_PROXY_ALLOWED_HOSTS.includes(upstreamUrl.hostname)) {
    return json({ error: { message: 'Host not allowed' } }, 400, headers);
  }

  const cache = caches.default;
  const cacheKey = new Request(upstreamUrl.toString());
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

  // The rate-limit check (a KV read - see isRateLimited/isRateLimitedKV)
  // and the actual upstream fetch are independent of each other - neither
  // needs the other's result to START, only this function's own final
  // decision needs both. Running them concurrently instead of awaiting the
  // rate-limit check FIRST removes a real KV round trip from the critical
  // path of every single ordinary (not rate-limited) request, which is the
  // vast majority of traffic under SPORTS_PROXY_RATE_LIMIT's own generous
  // budget. That round trip used to be invisible next to this Worker's own
  // former cross-region [placement] pin (hundreds of ms) - now that it's
  // gone (see this file's own top comment), a KV read is proportionally a
  // much bigger slice of what's left, so it's worth taking off the
  // critical path too. The one trade-off: a request that DOES turn out to
  // be rate-limited still pays for the upstream fetch it didn't need -
  // acceptable since that's the rare, already-abusive case, not the common
  // one this route is actually optimizing for.
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
    const body = await upstream.arrayBuffer();
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
