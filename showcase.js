// The showcase's live demos (jaypengx.com/showcase, Jay 2026-10-30): the real
// apps on today's data, without an Orbit Pass, and never a way round it.
//
// The showcase page asks POST /showcase/pass for a showcase pass: a token of
// its own kind ('show', orbit-token.js), so no route that wants a real Pass
// session ('ses') ever takes it. It is good for SHOW_MS, only from the
// showcase's address, and only from the address it was given to (its IP's
// block or an IPv4 /24, placeOf). It opens reads only, and only these: Transit and
// Weather (worker.js) and the data proxy's reads for Sports (sports.js). The
// Pass, wallets, orders, AI, notices and every write still want a real Pass.
//
// The limits: a few passes an hour per address, SHOW_DAY_CAP passes a day for
// everyone (a KV count by Taiwan's day), each pass's asks a minute (the
// callers' limiters), and Transit's paid Google asks out of their own monthly
// share (transit.js CAPS.showcasePaid). Past any of them the showcase plays
// its recording instead.
import { signToken, readToken, tokenSecret, sessionLimited } from './orbit-token.js';
import { ipBucket } from './http.js';

// Where the showcase runs (an Origin is only text: the caps below are the real bound).
export const SHOWCASE_ORIGINS = new Set(['https://jaypengx.com', 'https://jaypengx.github.io']);
export const SHOW_KIND = 'show';
export const SHOW_MS = 30 * 60_000;
// Passes an address may take an hour (a /24 can be a carrier's many phones).
export const SHOW_PER_HOUR = 30;
// Passes a day, everyone together.
export const SHOW_DAY_CAP = 2_000;
// Asks a minute a pass may make, per app (the callers count them).
export const SHOW_PER_MIN = 60;

// The address a pass is bound to: an IPv6 block (/64, http.js ipBucket), or
// an IPv4 address's /24 (a phone's carrier, or an office, moves its outgoing
// address around within one, request by request).
export const placeOf = ip => {
  const b = ipBucket(ip);
  return b.includes(':') ? b : b.split('.').slice(0, 3).join('.') + '.0/24';
};

const twDay = now => new Date(now + 8 * 3_600_000).toISOString().slice(0, 10);
const dayKey = now => `showcase:passes:${twDay(now)}`;

// POST /showcase/pass → { qt, e } or 403 / 429 (the showcase then plays its recording).
export async function handleShowcasePass(request, env, headers, { ip = '', origin = '', now = Date.now(), ctx = null } = {}) {
  const send = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...headers, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
  if (request.method !== 'POST') return send({ code: 'POST_ONLY' }, 405);
  if (!SHOWCASE_ORIGINS.has(origin)) return send({ code: 'FORBIDDEN_ORIGIN' }, 403);
  const who = placeOf(ip);
  if (sessionLimited(`show:mint:${who}`, SHOW_PER_HOUR, 3_600_000, now)) return send({ code: 'RATE_LIMITED' }, 429);
  const kv = env.RATE_LIMIT_KV;
  const used = Number((await kv?.get(dayKey(now)).catch(() => null)) || 0);
  if (used >= SHOW_DAY_CAP) return send({ code: 'DAY_CAP' }, 429);
  const secret = await tokenSecret(env);
  if (!secret) return send({ code: 'NO_SECRET' }, 503);
  const put = kv?.put(dayKey(now), String(used + 1), { expirationTtl: 2 * 86_400 }).catch(() => {});
  if (put) ctx?.waitUntil ? ctx.waitUntil(put) : await put;
  const e = now + SHOW_MS;
  const qt = await signToken(secret, { k: SHOW_KIND, s: `show:${who}`, ip: who, e });
  return send({ qt, e });
}

// The showcase pass a request carries (`qt=`), from the showcase's address
// and the address it was given to, as a session ({ s, showcase: true }); else null.
export async function showcaseOf(request, env, { ip = '', origin = '', now = Date.now() } = {}) {
  if (!SHOWCASE_ORIGINS.has(origin)) return null;
  const qt = new URL(request.url).searchParams.get('qt');
  if (!qt) return null;
  const claims = await readToken(await tokenSecret(env), qt, SHOW_KIND, now);
  if (!claims || claims.ip !== placeOf(ip)) return null;
  return { s: claims.s, showcase: true };
}
