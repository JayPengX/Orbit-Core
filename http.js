// What every route of the proxy answers with (worker.js routes; sports.js,
// transit.js, weather.js, … handle): who may call it, the CORS headers, and
// a JSON answer.

export const ALLOWED_ORIGINS = ['https://jaypengx.github.io'];

export function isAllowedOrigin(origin) {
  return ALLOWED_ORIGINS.includes(origin) || /^http:\/\/localhost:\d+$/.test(origin || '');
}

// X-Worker-Colo carries the IATA code of the Cloudflare colo the request came
// in through (request.cf.colo), on every answer: what showed Smart Placement
// landing on Hong Kong, which Gemini refuses (wrangler.toml's [placement]).
// Headers an app reads must be listed in Expose-Headers: the sports proxy's
// cache (X-Sports-Proxy-*), Transit's (X-Transit-*).
export function corsHeaders(origin, colo) {
  return {
    'Access-Control-Allow-Origin': isAllowedOrigin(origin) ? origin : 'null',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Expose-Headers': 'X-Worker-Colo, X-Transit-Cache, X-Transit-Age, X-Sports-Proxy-Cache, X-Sports-Proxy-Cache-Tier, X-Sports-Proxy-Age, X-Sports-Proxy-Final',
    // Browsers keep a preflight this long (Chrome caps it at 2 hours): the
    // apps' JSON writes don't each cost a second Worker request.
    'Access-Control-Max-Age': '86400',
    'X-Worker-Colo': colo || 'unknown',
    Vary: 'Origin'
  };
}

export function json(data, status, headers) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json' }
  });
}
