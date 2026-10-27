import { ORIGINS } from './kit/domain.mjs';

// What every route of the proxy answers with (worker.js routes; sports.js,
// transit.js, weather.js, … handle): who may call it, the CORS headers, and
// a JSON answer.

// The apps' pages (kit/domain.mjs: GitHub Pages, and the family's own domain once set).
export const ALLOWED_ORIGINS = ORIGINS;
// A page served from this computer (the preview tool; over --h2 an https
// one, as Pages serves a phone): the dev doors let it in (sports.js, worker.js).
export const LOCAL_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1):\d+$/;

// The part of an address that counts as one caller: an IPv4 address whole,
// an IPv6 one by its first 64 bits (a home's or a phone's whole block).
export function ipBucket(ip) {
  const a = String(ip || '');
  if (!a.includes(':')) return a;
  const [head, tail = ''] = a.toLowerCase().split('::');
  const h = head ? head.split(':') : [];
  const t = a.includes('::') ? (tail ? tail.split(':') : []) : [];
  const groups = [...h, ...Array(Math.max(0, 8 - h.length - t.length)).fill('0'), ...t];
  return `${groups.slice(0, 4).map(g => g.replace(/^0+(?=.)/, '')).join(':')}::/64`;
}

export function isAllowedOrigin(origin) {
  return ALLOWED_ORIGINS.includes(origin) || LOCAL_ORIGIN.test(origin || '');
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
    'Access-Control-Expose-Headers': 'X-Worker-Colo, X-Transit-Cache, X-Transit-Age, X-Sports-Proxy-Cache, X-Sports-Proxy-Cache-Tier, X-Sports-Proxy-Age, X-Sports-Proxy-Final, Server-Timing',
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

// A text's SHA-256 as hex.
export async function sha256Hex(text) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(d), b => b.toString(16).padStart(2, '0')).join('');
}

// A request's body as text, or null past `max` bytes: read as it comes and
// stopped there (a client may send Cloudflare's 100 MB, more than an
// isolate's 128 MB holds, and a crash takes every request in it along).
export async function bodyText(request, max) {
  if (Number(request.headers.get('Content-Length')) > max) return null;
  if (!request.body) return '';
  const reader = request.body.getReader();
  const parts = [];
  let n = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    n += value.byteLength;
    if (n > max) {
      reader.cancel().catch(() => {});
      return null;
    }
    parts.push(value);
  }
  const out = new Uint8Array(n);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.byteLength;
  }
  return new TextDecoder().decode(out);
}
