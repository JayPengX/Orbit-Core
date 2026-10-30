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
// to go at its ground speed plus the approach (etaMin). Nothing is stored:
// each area's planes are kept a minute and each callsign's route a day in
// Cloudflare's cache, so however many phones ask, the sources are asked
// about once a minute an area.
import { json } from './http.js';
import { distKm, etaMin, onRoute } from './kit/flight.mjs';

// Where planes are read: busy airports, 250 nautical miles round each.
// East Asia every time (the people using it are here), and three of the
// rest, changing each minute, so the picks span the world.
export const AREAS = {
  tpe: [25.08, 121.23], nrt: [35.6, 139.9], hkg: [22.3, 113.9], pvg: [31.2, 121.6], icn: [37.46, 126.44],
  sin: [1.35, 103.99], bkk: [13.7, 100.7], dxb: [25.25, 55.36], fra: [50.03, 8.57], lhr: [51.47, -0.45],
  jfk: [40.64, -73.78], lax: [33.94, -118.4], ord: [41.97, -87.9], syd: [-33.94, 151.18], del: [28.56, 77.1]
};
const HOME = ['tpe', 'nrt', 'hkg', 'icn'];
const ABROAD = Object.keys(AREAS).filter(k => !HOME.includes(k));
export const areasFor = minute => [...HOME, ...[0, 1, 2].map(i => ABROAD[(minute * 3 + i) % ABROAD.length])];

export const LIMITS = { minMin: 10, maxMin: 180, lookups: 140, batch: 35, want: 3, timeoutMs: 8000 };
const UA = 'Orbit-Class/1.0 (+https://github.com/JayPengX/Orbit-Class)';
const AREA_TTL = 60;
const ROUTE_TTL = 86_400;
const HEX = /^[0-9a-f]{6}$/;
// An airline's callsign (three letters, a number): not a private plane's registration.
const AIRLINE = /^[A-Z]{3}\d{1,4}[A-Z]{0,2}$/;

const edge = () => (typeof caches !== 'undefined' && caches.default) || null;

// A JSON read through Cloudflare's cache (`ttl` seconds), a failure as null.
async function cachedJson(key, url, ttl, fetchFn, opts = {}) {
  const c = edge();
  const req = new Request(key);
  const hit = c && (await c.match(req).catch(() => null));
  if (hit) return hit.json().catch(() => null);
  let res;
  try {
    res = await fetchFn(url, { ...opts, headers: { 'User-Agent': UA, Accept: 'application/json', ...(opts.headers || {}) }, signal: AbortSignal.timeout(LIMITS.timeoutMs) });
  } catch {
    return null;
  }
  // (adsbdb answers 404 for a callsign it has no route for: kept as "none".)
  if (res.status === 404) {
    if (c) await c.put(req, new Response('null', { headers: { 'Cache-Control': `max-age=${ttl}` } })).catch(() => {});
    return null;
  }
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

// The planes round one area: adsb.lol's, else adsb.fi's.
async function areaPlanes(key, fetchFn) {
  const [lat, lon] = AREAS[key];
  const a = await cachedJson(`https://flight.orbit/area/${key}`, `https://api.adsb.lol/v2/point/${lat}/${lon}/250`, AREA_TTL, fetchFn);
  if (Array.isArray(a?.ac)) return a.ac;
  const b = await cachedJson(`https://flight.orbit/area-fi/${key}`, `https://opendata.adsb.fi/api/v2/lat/${lat}/lon/${lon}/dist/250`, AREA_TTL, fetchFn);
  return Array.isArray(b?.aircraft) ? b.aircraft : Array.isArray(b?.ac) ? b.ac : null;
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
const routeFor = (cs, fetchFn) => cachedJson(`https://flight.orbit/route/${cs}`, `https://api.adsbdb.com/v0/callsign/${cs}`, ROUTE_TTL, fetchFn).then(routeOf);

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

// The picks: those landing within a tenth of the minutes (at least two
// minutes either way), closest first, one per destination and, while there
// are enough, per airline. `wide`: a fifth, when the tenth finds too few.
export function choose(flights, minutes, now, want = LIMITS.want) {
  const off = f => Math.abs((f.eta - now) / 60_000 - minutes);
  const sorted = flights.filter(Boolean).sort((a, b) => off(a) - off(b));
  for (const share of [0.1, 0.2]) {
    const near = sorted.filter(f => off(f) <= Math.max(2, minutes * share));
    if (near.length < want && share < 0.2) continue;
    const out = [];
    const to = new Set();
    const by = new Set();
    for (const strict of [true, false])
      for (const f of near) {
        if (out.length >= want) break;
        if (out.includes(f) || to.has(f.to.iata || f.to.icao) || (strict && by.has(f.airline.icao || f.cs.slice(0, 3)))) continue;
        out.push(f);
        to.add(f.to.iata || f.to.icao);
        by.add(f.airline.icao || f.cs.slice(0, 3));
      }
    return out;
  }
  return [];
}

// The order to look planes up in: the ones that look like landing in about
// the time first (nearly at an area's airport with about that time to fly
// at its speed), then the rest, mixed by the minute (a new set each minute).
export function lookupOrder(list, minutes, minute) {
  const score = c => {
    let best = Infinity;
    for (const [lat, lon] of Object.values(AREAS)) {
      const m = etaMin(c.fix, { lat, lon }, c.fix.gs);
      if (m < 60) best = Math.min(best, Math.abs(m - minutes));
    }
    return best;
  };
  const mix = s => {
    let h = minute;
    for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return h;
  };
  const near = Math.max(3, minutes * 0.25);
  return list
    .map(c => ({ c, likely: score(c) <= near, m: mix(c.hex) }))
    .sort((a, b) => Number(b.likely) - Number(a.likely) || a.m - b.m)
    .map(x => x.c);
}

export async function pickFlights(minutes, { fetchFn = fetch, now = Date.now() } = {}) {
  const minute = Math.floor(now / 60_000);
  const lists = await Promise.all(areasFor(minute).map(k => areaPlanes(k, fetchFn)));
  if (lists.every(x => !x)) return null;
  const order = lookupOrder(candidates(lists, now), minutes, minute).slice(0, LIMITS.lookups);
  const found = [];
  for (let i = 0; i < order.length; i += LIMITS.batch) {
    const part = order.slice(i, i + LIMITS.batch);
    const routes = await Promise.all(part.map(c => routeFor(c.cs, fetchFn)));
    part.forEach((c, j) => found.push(flightOf(c, routes[j], now)));
    if (choose(found, minutes, now).length >= LIMITS.want) break;
  }
  return choose(found, minutes, now);
}

// One plane's latest fix (kept 8 s: every phone following it shares it).
export async function trackFlight(hex, { fetchFn = fetch, now = Date.now() } = {}) {
  const a = await cachedJson(`https://flight.orbit/hex/${hex}/${Math.floor(now / 8000)}`, `https://api.adsb.lol/v2/hex/${hex}`, 8, fetchFn);
  let list = Array.isArray(a?.ac) ? a.ac : null;
  if (!list) {
    const b = await cachedJson(`https://flight.orbit/hex-fi/${hex}/${Math.floor(now / 8000)}`, `https://opendata.adsb.fi/api/v2/hex/${hex}`, 8, fetchFn);
    list = Array.isArray(b?.aircraft) ? b.aircraft : Array.isArray(b?.ac) ? b.ac : null;
  }
  if (!list) return undefined;
  return fixOf(list.find(x => String(x?.hex || '').toLowerCase() === hex) || null, now);
}

export async function handleFlight(request, headers, { session, limited, fetchFn = fetch }) {
  if (!session) return json({ error: { code: 'NO_SESSION' } }, 401, headers);
  if (limited()) return json({ error: { code: 'RATE_LIMITED' } }, 429, headers);
  const q = new URL(request.url).searchParams;
  const hex = String(q.get('hex') || '').toLowerCase();
  if (hex) {
    if (!HEX.test(hex)) return json({ error: { code: 'BAD_HEX' } }, 400, headers);
    const fix = await trackFlight(hex, { fetchFn });
    return fix === undefined ? json({ error: { code: 'UPSTREAM' } }, 502, headers) : json({ fix }, 200, headers);
  }
  const minutes = Math.round(Number(q.get('min')));
  if (!(minutes >= LIMITS.minMin && minutes <= LIMITS.maxMin)) return json({ error: { code: 'BAD_MINUTES' } }, 400, headers);
  const flights = await pickFlights(minutes, { fetchFn });
  return flights ? json({ flights, at: Date.now() }, 200, headers) : json({ error: { code: 'UPSTREAM' } }, 502, headers);
}
