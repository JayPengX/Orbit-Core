// ---- flight.js: GET /flight, Orbit Class's 專注飛行 ----
// A focus timer that follows a real plane: pick one in the air now that
// lands in about the minutes asked, then follow it.
//
//   /flight?min=25&qt=   → { flights: [up to 3, closest first], at }
//   /flight?hex=780abc&qt= → { fix } (its latest position) or { fix: null } (out of range)
//
// Positions come from ADS-B (adsb.lol, else adsb.fi: free, no key) around
// busy airports; ADS-B has no route, so a callsign's origin and destination
// come from adsbdb.com (free) and are checked against where the plane is and
// where it's heading (kit/flight.mjs onRoute). The time left is the distance
// to go at its ground speed plus the approach (etaMin).
//
// The pool is built off Cloudflare (2026-11-11): adsb.lol allows an address
// 500 asks a day and Cloudflare's addresses are shared, so from Workers it
// answers 429; adsb.fi refuses Workers (403); and neither lets a phone read it
// (no CORS). So GitHub Actions builds it every ten minutes
// (tools/flight-pool.mjs, flight.yml) into R2 `flight/pool.json`; the proxy
// answers with that copy, builds one itself only when it is old, and when that
// fails too answers the old copy (its planes still in the air: the phone flies
// each on from its fix). A plane followed (?hex=) is the proxy's ask: when it
// fails the phone flies it on from its last fix.
import { json } from './http.js';
import { distKm, etaMin, onRoute, choose } from './kit/flight.mjs';

// Where planes are read: busy airports, 250 nautical miles round each.
export const AREAS = {
  tpe: [25.08, 121.23], nrt: [35.6, 139.9], hkg: [22.3, 113.9], pvg: [31.2, 121.6], icn: [37.46, 126.44],
  sin: [1.35, 103.99], bkk: [13.7, 100.7], dxb: [25.25, 55.36], fra: [50.03, 8.57], lhr: [51.47, -0.45],
  jfk: [40.64, -73.78], lax: [33.94, -118.4], ord: [41.97, -87.9], syd: [-33.94, 151.18], del: [28.56, 77.1]
};

// (A whole pick answers within budgetMs: a slow source or lookup is left out, never waited on.)
export const LIMITS = { minMin: 10, maxMin: 180, lookups: 900, batch: 150, want: 6, areaMs: 4000, routeMs: 2500, budgetMs: 7000 };
const UA = 'Orbit-Class/1.0 (+https://github.com/JayPengX/Orbit-Class)';
const AREA_TTL = 60;
const ROUTE_TTL = 86_400;
const HEX = /^[0-9a-f]{6}$/;
// An airline's callsign (three letters, a number): not a private plane's registration.
const AIRLINE = /^[A-Z]{3}\d{1,4}[A-Z]{0,2}$/;

const edge = () => (typeof caches !== 'undefined' && caches.default) || null;

// A source that turned us away (429, 403) is left alone two minutes: every
// phone following a plane asks every 15 s, and asking again only digs deeper.
const shut = new Map();
const SHUT_MS = 120_000;
const hostOf = url => {
  try {
    return new URL(url).host;
  } catch {
    return '';
  }
};

// A JSON read through Cloudflare's cache (`ttl` seconds), a failure as null.
async function cachedJson(key, url, ttl, fetchFn, ms, opts = {}) {
  const c = edge();
  const req = new Request(key);
  const hit = c && (await c.match(req).catch(() => null));
  if (hit) return hit.json().catch(() => null);
  const host = hostOf(url);
  if (Date.now() < (shut.get(host) || 0)) return null;
  let res;
  try {
    res = await fetchFn(url, { ...opts, headers: { 'User-Agent': UA, Accept: 'application/json', ...(opts.headers || {}) }, signal: AbortSignal.timeout(ms) });
  } catch {
    return null;
  }
  // (adsbdb answers 404 for a callsign it has no route for: kept as "none".)
  if (res.status === 404) {
    if (c) await c.put(req, new Response('null', { headers: { 'Cache-Control': `max-age=${ttl}` } })).catch(() => {});
    return null;
  }
  if (res.status === 429 || res.status === 403) shut.set(host, Date.now() + SHUT_MS);
  if (!res.ok) return null;
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  if (c) await c.put(req, new Response(text, { headers: { 'Cache-Control': `max-age=${ttl}` } })).catch(() => {});
  return data;
}

// One plane as the apps read it, from either source's record.
export function fixOf(a, now) {
  if (!a || !Number.isFinite(a.lat) || !Number.isFinite(a.lon)) return null;
  const ground = a.alt_baro === 'ground';
  return {
    lat: a.lat,
    lon: a.lon,
    track: Number.isFinite(a.track) ? a.track : null,
    gs: Number.isFinite(a.gs) ? a.gs : 0,
    alt: ground ? 0 : Number.isFinite(a.alt_baro) ? a.alt_baro : Number.isFinite(a.alt_geom) ? a.alt_geom : null,
    vs: Number.isFinite(a.baro_rate) ? a.baro_rate : Number.isFinite(a.geom_rate) ? a.geom_rate : 0,
    ground,
    at: Math.round(now - (Number(a.seen_pos ?? a.seen) || 0) * 1000)
  };
}

// The planes round one area: adsb.lol's or adsb.fi's, whichever answers
// first (one of them can be slow or shut from a Cloudflare city).
async function areaPlanes(key, fetchFn) {
  const [lat, lon] = AREAS[key];
  const listOf = d => (Array.isArray(d?.ac) ? d.ac : Array.isArray(d?.aircraft) ? d.aircraft : null);
  const ask = (k, url) => cachedJson(`https://flight.orbit/${k}/${key}`, url, AREA_TTL, fetchFn, LIMITS.areaMs).then(d => listOf(d) || Promise.reject(new Error('none')));
  return Promise.any([ask('area', `https://api.adsb.lol/v2/point/${lat}/${lon}/250`), ask('area-fi', `https://opendata.adsb.fi/api/v2/lat/${lat}/lon/${lon}/dist/250`)]).catch(() => null);
}

// A callsign's route (adsbdb), as { airline, from, to } or null.
const place = p =>
  p && Number.isFinite(p.latitude) && Number.isFinite(p.longitude)
    ? { iata: p.iata_code || '', icao: p.icao_code || '', city: p.municipality || p.name || '', country: p.country_iso_name || '', lat: p.latitude, lon: p.longitude }
    : null;
export function routeOf(data) {
  const r = data?.response?.flightroute;
  const from = place(r?.origin);
  const to = place(r?.destination);
  if (!from || !to) return null;
  return { no: r.callsign_iata || '', airline: { name: r.airline?.name || '', iata: r.airline?.iata || '', icao: r.airline?.icao || '' }, from, to };
}
export const routeFor = (cs, fetchFn) => cachedJson(`https://flight.orbit/route/${cs}`, `https://api.adsbdb.com/v0/callsign/${cs}`, ROUTE_TTL, fetchFn, LIMITS.routeMs).then(routeOf);

// The planes worth looking up: airliners in the air, flying, seen just now,
// once each.
export function candidates(lists, now) {
  const seen = new Set();
  const out = [];
  for (const list of lists)
    for (const a of list || []) {
      const cs = String(a?.flight || '').trim();
      const hex = String(a?.hex || '').toLowerCase();
      if (!AIRLINE.test(cs) || !HEX.test(hex) || seen.has(hex)) continue;
      const fix = fixOf(a, now);
      if (!fix || fix.ground || fix.gs < 180 || !(fix.alt > 3000) || now - fix.at > 60_000) continue;
      seen.add(hex);
      out.push({ hex, cs, type: a.t || '', reg: a.r || '', fix });
    }
  return out;
}

// A plane with its route, if the route fits it: when it lands.
export function flightOf(c, route, now) {
  if (!route || !onRoute(c.fix, c.fix.track, route.from, route.to)) return null;
  const min = etaMin(c.fix, route.to, c.fix.gs);
  return { hex: c.hex, cs: c.cs, no: route.no || c.cs, airline: route.airline, from: route.from, to: route.to, type: c.type, reg: c.reg, fix: c.fix, total: Math.round(distKm(route.from, route.to)), eta: Math.round(c.fix.at + min * 60_000), left: Math.round(min * 10) / 10 };
}

// Every airliner in the air now with a route that fits it, landing within
// three hours, built in each Cloudflare city and kept there (poolNow). (Its
// fixes a few minutes old: the phone flies each plane on from its fix, and
// asks for a new one as soon as it follows one.) The phone
// picks from it itself (kit/flight.mjs choose), whatever the minutes.
// (Off Cloudflare, tools/flight-pool.mjs passes its own route lookup, kept in
// R2, and a longer budget.)
export async function buildPool({ fetchFn = fetch, now = Date.now(), routes = cs => routeFor(cs, fetchFn), budgetMs = LIMITS.budgetMs } = {}) {
  const t0 = Date.now();
  const lists = await Promise.all(Object.keys(AREAS).map(k => areaPlanes(k, fetchFn)));
  if (lists.every(x => !x)) return null;
  const order = candidates(lists, now).slice(0, LIMITS.lookups);
  const found = [];
  for (let i = 0; i < order.length && Date.now() - t0 < budgetMs - LIMITS.routeMs; i += LIMITS.batch) {
    const part = order.slice(i, i + LIMITS.batch);
    const got = await Promise.all(part.map(c => routes(c.cs)));
    part.forEach((c, j) => found.push(flightOf(c, got[j], now)));
  }
  return found.filter(f => f && f.eta - now <= (LIMITS.maxMin + 30) * 60_000 && f.eta > now).map(slim);
}
// (What the phone reads of each, nothing more.)
const placeSlim = p => ({ iata: p.iata, icao: p.icao, city: p.city, lat: p.lat, lon: p.lon });
const slim = f => ({ hex: f.hex, cs: f.cs, no: f.no, airline: f.airline, from: placeSlim(f.from), to: placeSlim(f.to), type: f.type, fix: f.fix, eta: f.eta });

const POOL_FRESH_MS = 180_000;
const POOL_KEEP_S = 1800;
// The copy GitHub Actions builds (flight-pool.mjs): taken as it is while it
// is this young; older, a build here is tried first.
export const KEPT_FRESH_MS = 20 * 60_000;
// Older still, it answers only when nothing newer can be had, and only for
// as long as enough of its planes are still up.
const KEPT_MAX_MS = 4 * 3_600_000;
const BUILD_REST_MS = 5 * 60_000;
let poolMem = null;
let building = null;
let failedAt = 0;
let keptMem = null;

// R2's copy ({ at, flights }), read at most once a minute an isolate.
async function keptPool(data, now) {
  if (!data) return null;
  if (keptMem?.data === data && Math.abs(now - keptMem.read) < 60_000) return keptMem.pool;
  const pool = await data
    .get('flight/pool.json')
    .then(o => o?.json())
    .catch(() => null);
  keptMem = { data, read: now, pool: pool && Number.isFinite(pool.at) && Array.isArray(pool.flights) ? pool : null };
  return keptMem.pool;
}
// A kept pool's planes still flying (a minute to go at least).
export const stillUp = (flights, now) => flights.filter(f => f && f.eta > now + 60_000);

// The pool: R2's copy while young; else one built here (kept three minutes
// fresh, up to half an hour answered at once while a new one is built
// behind, `ctx.waitUntil`); else R2's copy of any age up to four hours.
export async function poolNow({ fetchFn = fetch, now = Date.now(), ctx = null, data = null } = {}) {
  const kept = await keptPool(data, now);
  if (kept && now - kept.at <= KEPT_FRESH_MS) {
    const up = stillUp(kept.flights, now);
    if (up.length) return up;
  }
  const built = await builtPool({ fetchFn, now, ctx }).catch(() => null);
  if (built?.length) return built;
  if (kept && now - kept.at <= KEPT_MAX_MS) {
    const up = stillUp(kept.flights, now);
    if (up.length) return up;
  }
  return built || null;
}

async function builtPool({ fetchFn, now, ctx }) {
  // (Sources faked, as the tests do: built each time.)
  if (fetchFn !== globalThis.fetch) return buildPool({ fetchFn, now });
  const c = edge();
  const key = new Request('https://flight.orbit/pool/v2');
  const build = () =>
    (building ||= buildPool({ fetchFn, now })
      .then(async pool => {
        if (!pool) {
          failedAt = Date.now();
          return null;
        }
        poolMem = { at: now, pool };
        if (c) await c.put(key, new Response(JSON.stringify(poolMem), { headers: { 'Cache-Control': `max-age=${POOL_KEEP_S}` } })).catch(() => {});
        return pool;
      })
      .finally(() => (building = null)));
  if (!poolMem && c) poolMem = await c.match(key).then(r => r?.json()).catch(() => null);
  const resting = Date.now() - failedAt < BUILD_REST_MS;
  if (!poolMem || now - poolMem.at > POOL_KEEP_S * 1000) return resting ? null : build();
  if (now - poolMem.at > POOL_FRESH_MS && !resting) {
    const next = build().catch(() => null);
    ctx?.waitUntil?.(next);
  }
  return poolMem.pool;
}

export async function pickFlights(minutes, { fetchFn = fetch, now = Date.now(), ctx = null, data = null } = {}) {
  const pool = await poolNow({ fetchFn, now, ctx, data });
  return pool ? choose(pool, minutes, now) : null;
}

// One plane's latest fix (kept 8 s: every phone following it shares it).
export async function trackFlight(hex, { fetchFn = fetch, now = Date.now() } = {}) {
  const a = await cachedJson(`https://flight.orbit/hex/${hex}/${Math.floor(now / 8000)}`, `https://api.adsb.lol/v2/hex/${hex}`, 8, fetchFn, LIMITS.areaMs);
  let list = Array.isArray(a?.ac) ? a.ac : null;
  if (!list) {
    const b = await cachedJson(`https://flight.orbit/hex-fi/${hex}/${Math.floor(now / 8000)}`, `https://opendata.adsb.fi/api/v2/hex/${hex}`, 8, fetchFn, LIMITS.areaMs);
    list = Array.isArray(b?.aircraft) ? b.aircraft : Array.isArray(b?.ac) ? b.ac : null;
  }
  if (!list) return undefined;
  return fixOf(list.find(x => String(x?.hex || '').toLowerCase() === hex) || null, now);
}

// ?probe=1: how each source answers from this Cloudflare city (no session:
// nothing of anyone's, the sources asked straight, at most once a minute a city).
export async function probeSources(fetchFn = fetch) {
  const time = async url => {
    const t0 = Date.now();
    try {
      const res = await fetchFn(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(LIMITS.areaMs) });
      await res.arrayBuffer();
      return { status: res.status, ms: Date.now() - t0 };
    } catch (e) {
      return { error: String(e?.name || e), ms: Date.now() - t0 };
    }
  };
  const [lol, fi, adsbdb] = await Promise.all([time('https://api.adsb.lol/v2/point/25.08/121.23/250'), time('https://opendata.adsb.fi/api/v2/lat/25.08/lon/121.23/dist/250'), time('https://api.adsbdb.com/v0/callsign/EVA25')]);
  return { lol, fi, adsbdb };
}

export async function handleFlight(request, headers, { session, limited, fetchFn = fetch, colo = '', ctx = null, data = null }) {
  if (new URL(request.url).searchParams.get('probe') === '1') {
    const c = edge();
    const key = new Request(`https://flight.orbit/probe/${colo}`);
    const hit = c && (await c.match(key).catch(() => null));
    if (hit) return json({ colo, kept: true, ...(await hit.json()) }, 200, headers);
    const out = await probeSources(fetchFn);
    if (c) await c.put(key, new Response(JSON.stringify(out), { headers: { 'Cache-Control': 'max-age=60' } })).catch(() => {});
    return json({ colo, ...out }, 200, headers);
  }
  if (!session) return json({ error: { code: 'NO_SESSION' } }, 401, headers);
  if (limited()) return json({ error: { code: 'RATE_LIMITED' } }, 429, headers);
  const q = new URL(request.url).searchParams;
  const hex = String(q.get('hex') || '').toLowerCase();
  if (hex) {
    if (!HEX.test(hex)) return json({ error: { code: 'BAD_HEX' } }, 400, headers);
    const fix = await trackFlight(hex, { fetchFn });
    return fix === undefined ? json({ error: { code: 'UPSTREAM' } }, 502, headers) : json({ fix }, 200, headers);
  }
  // ?pool=1: the whole pool, for the phone to pick from.
  if (q.get('pool') === '1') {
    const pool = await poolNow({ fetchFn, ctx, data });
    return pool ? json({ flights: pool, at: Date.now() }, 200, headers) : json({ error: { code: 'UPSTREAM' } }, 502, headers);
  }
  const minutes = Math.round(Number(q.get('min')));
  if (!(minutes >= LIMITS.minMin && minutes <= LIMITS.maxMin)) return json({ error: { code: 'BAD_MINUTES' } }, 400, headers);
  const flights = await pickFlights(minutes, { fetchFn, ctx, data });
  return flights ? json({ flights, at: Date.now() }, 200, headers) : json({ error: { code: 'UPSTREAM' } }, 502, headers);
}
