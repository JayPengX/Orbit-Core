// ---- transit.js ----
// Orbit Transit's server side: Taiwan's transit data (TDX, the Ministry of
// Transportation's platform), Google's map, place search and transit routes,
// all behind a Quadra Pass session, all cached and shared, and every billed
// Google call counted against a monthly cap kept under Google's free tier.
//
//   GET /transit/config   the map to draw: Google's (with the browser key,
//                         counted as one map load) while this month is under
//                         its cap, else Taiwan's NLSC map (free, no key)
//   GET /transit/tdx      a TDX API path from the allowlist (TDX_RULES), cached
//                         for as long as that data stays true (live 25 s,
//                         timetables 6 h, stations a day), shared by everyone
//   GET /transit/search   places by name: Google's autocomplete, or
//                         OpenStreetMap's search past the cap
//   GET /transit/place    one place's position and name (Google Place Details)
//   GET /transit/route    plans from A to B: Google's transit routes and TDX's
//                         planner, made one shape (the app adds YouBike plans)
//   GET /transit/status   (open) this month's use against each cap, which
//                         keys are set; never a key itself
//
// Secrets: TDX_CLIENT_ID, TDX_CLIENT_SECRET (tdx.transportdata.tw → 會員中心 →
// API 金鑰); GOOGLE_MAPS_BROWSER_KEY (Maps JavaScript API only, restricted to
// https://jaypengx.github.io/*); GOOGLE_MAPS_KEY (Places API (New) and Routes
// API; GOOGLE_WEATHER_KEY is used when it isn't set). Optional var
// TDX_PER_MIN: TDX calls a minute this Worker allows itself (the free plan
// allows 5, 銅級 300).
//
// The caps are this Worker's own count (KV, flushed in batches so the free
// plan's 1,000 KV writes a day aren't spent on counting): the hard stop is
// Google Cloud's per-day quotas, which the owner sets on each API (see
// docs/HANDOFF.md, Orbit Transit).

export const TDX_BASE = 'https://tdx.transportdata.tw/api/';
export const TDX_AUTH = 'https://tdx.transportdata.tw/auth/realms/TDXConnect/protocol/openid-connect/token';
export const PLACES = 'https://places.googleapis.com/v1/';
export const ROUTES = 'https://routes.googleapis.com/directions/v2:computeRoutes';
export const NOMINATIM = 'https://nominatim.openstreetmap.org/search';

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

// Google's free monthly use per SKU (since March 2025: 10,000 for Essentials,
// 5,000 for Pro), and the share of it this Worker spends before stopping.
export const CAPS = {
  maps: 9_000, // Dynamic Maps (a Maps JavaScript API map load), Essentials 10,000
  autocomplete: 9_000, // Autocomplete Requests, Essentials 10,000
  details: 9_000, // Place Details Essentials (position, address), 10,000
  detailsPro: 4_500, // Place Details Pro (a place's name), 5,000
  routes: 9_000 // Compute Routes Essentials (transit), 10,000
};

// Google bills by the calendar month on Pacific time: counted the same way
// (UTC-8, a little early in summer, never late).
export const billingMonth = (now = Date.now()) => new Date(now - 8 * HOUR).toISOString().slice(0, 7);

// ---- The monthly meter ----------------------------------------------------------------
//
// The stored count is read at most once a minute; what this isolate used
// since is added on top and written back once 10 calls have gathered or 2
// minutes have passed. A lost batch undercounts a little: the caps leave
// 10% under Google's free tier for that.

const meter = { month: '', stored: null, readAt: 0, pending: {}, flushedAt: 0 };
export function resetMeter() {
  Object.assign(meter, { month: '', stored: null, readAt: 0, pending: {}, flushedAt: 0 });
}
const meterKey = month => `transit:use:${month}`;

async function readUse(env, now) {
  const month = billingMonth(now);
  if (meter.month !== month) Object.assign(meter, { month, stored: null, readAt: 0, pending: {}, flushedAt: now });
  if (!meter.stored || now - meter.readAt > MIN) {
    meter.stored = (await kvJson(env, meterKey(month))) || {};
    meter.readAt = now;
  }
  return meter;
}
export async function usage(env, now = Date.now()) {
  const m = await readUse(env, now);
  const out = {};
  for (const k of Object.keys(CAPS)) out[k] = (m.stored[k] || 0) + (m.pending[k] || 0);
  for (const k of Object.keys(m.stored)) if (!(k in out)) out[k] = (m.stored[k] || 0) + (m.pending[k] || 0);
  for (const k of Object.keys(m.pending)) if (!(k in out)) out[k] = m.pending[k];
  return out;
}
// True (and counted) while `sku` has room for `n` more this month.
export async function spend(env, sku, n = 1, now = Date.now(), ctx = null) {
  const used = await usage(env, now);
  if (CAPS[sku] != null && used[sku] + n > CAPS[sku]) return false;
  meter.pending[sku] = (meter.pending[sku] || 0) + n;
  const gathered = Object.values(meter.pending).reduce((a, b) => a + b, 0);
  if (gathered >= 10 || now - meter.flushedAt > 2 * MIN) {
    const p = flushUse(env, now);
    if (ctx?.waitUntil) ctx.waitUntil(p);
    else await p;
  }
  return true;
}
// Counted only (TDX calls, for the status page): no cap.
export const tally = (env, key, n = 1, now = Date.now(), ctx = null) => spend(env, key, n, now, ctx);
export async function flushUse(env, now = Date.now()) {
  const pending = meter.pending;
  if (!Object.keys(pending).length) return;
  meter.pending = {};
  meter.flushedAt = now;
  const key = meterKey(meter.month || billingMonth(now));
  const fresh = (await kvJson(env, key)) || {};
  for (const [k, v] of Object.entries(pending)) fresh[k] = (fresh[k] || 0) + v;
  await kvPut(env, key, fresh, 62 * 86_400);
  meter.stored = fresh;
  meter.readAt = now;
}

// ---- KV ------------------------------------------------------------------------------

async function kvJson(env, key) {
  try {
    const v = env.RATE_LIMIT_KV && (await env.RATE_LIMIT_KV.get(key));
    return v ? JSON.parse(v) : null;
  } catch {
    return null;
  }
}
async function kvPut(env, key, value, ttlS) {
  try {
    if (env.RATE_LIMIT_KV) await env.RATE_LIMIT_KV.put(key, JSON.stringify(value), { expirationTtl: Math.max(60, ttlS) });
  } catch {}
}

// ---- TDX -----------------------------------------------------------------------------

// What may be asked through /transit/tdx, and how long an answer stays true.
// fresh: served as is; stale: served at once while refreshed behind (and when
// TDX fails). Anything else is refused.
export const TDX_RULES = [
  // Live: arrivals, bikes and docks, metro and train boards.
  { re: /^basic\/v2\/Bus\/EstimatedTimeOfArrival\/(City\/[A-Za-z]+(\/[^/]+)?|InterCity(\/[^/]+)?)$/, fresh: 25e3, stale: 60e3, tier: 'live' },
  { re: /^advanced\/v2\/Bus\/EstimatedTimeOfArrival\/(City\/[A-Za-z]+\/PassThrough\/Station\/[^/]+|InterCity\/PassThrough\/Station\/[^/]+|NearBy)$/, fresh: 25e3, stale: 60e3, tier: 'live' },
  { re: /^basic\/v2\/Bike\/Availability\/City\/[A-Za-z]+$/, fresh: 50e3, stale: 3 * MIN, tier: 'live' },
  { re: /^advanced\/v2\/Bike\/Availability\/NearBy$/, fresh: 50e3, stale: 3 * MIN, tier: 'live' },
  { re: /^basic\/v2\/Rail\/Metro\/LiveBoard\/[A-Z]+$/, fresh: 20e3, stale: 60e3, tier: 'live' },
  { re: /^basic\/v3\/Rail\/TRA\/(StationLiveBoard(\/Station\/\d+)?|TrainLiveBoard(\/TrainNo\/\w+)?|Alert)$/, fresh: 50e3, stale: 3 * MIN, tier: 'live' },
  { re: /^basic\/v2\/Rail\/THSR\/AlertInfo$/, fresh: 5 * MIN, stale: 30 * MIN, tier: 'live' },
  // Timetables: a day's trains, a metro station's departures.
  { re: /^basic\/v3\/Rail\/TRA\/DailyTrainTimetable\/(TrainDate\/\d{4}-\d{2}-\d{2}|OD\/\d+\/to\/\d+\/\d{4}-\d{2}-\d{2})$/, fresh: 6 * HOUR, stale: DAY, tier: 'timetable' },
  { re: /^basic\/v2\/Rail\/THSR\/DailyTimetable\/(TrainDate\/\d{4}-\d{2}-\d{2}|OD\/\d+\/to\/\d+\/\d{4}-\d{2}-\d{2})$/, fresh: 6 * HOUR, stale: DAY, tier: 'timetable' },
  { re: /^basic\/v2\/Rail\/Metro\/(StationTimeTable|Frequency|S2STravelTime)\/[A-Z]+$/, fresh: DAY, stale: 7 * DAY, tier: 'timetable' },
  // What changes rarely: routes, stops, stations, lines, fares.
  { re: /^basic\/v2\/Bus\/(Route|StopOfRoute)\/(City\/[A-Za-z]+(\/[^/]+)?|InterCity(\/[^/]+)?)$/, fresh: DAY, stale: 7 * DAY, tier: 'static' },
  { re: /^advanced\/v2\/Bus\/(Station|Stop|Route)\/NearBy$/, fresh: DAY, stale: 7 * DAY, tier: 'static' },
  { re: /^advanced\/v2\/Bus\/(Route|StopOfRoute)\/(City\/[A-Za-z]+|InterCity)\/PassThrough\/Station\/[^/]+$/, fresh: DAY, stale: 7 * DAY, tier: 'static' },
  { re: /^basic\/v2\/Bike\/Station\/City\/[A-Za-z]+$/, fresh: DAY, stale: 7 * DAY, tier: 'static' },
  { re: /^advanced\/v2\/Bike\/Station\/NearBy$/, fresh: DAY, stale: 7 * DAY, tier: 'static' },
  { re: /^basic\/v2\/Rail\/Metro\/(Line|Station|StationOfLine|LineTransfer|StationTransfer|Route|StationOfRoute|StationExit)\/[A-Z]+$/, fresh: DAY, stale: 7 * DAY, tier: 'static' },
  { re: /^advanced\/v2\/Rail\/Metro\/Station\/NearBy$/, fresh: DAY, stale: 7 * DAY, tier: 'static' },
  { re: /^basic\/v3\/Rail\/TRA\/(Station|Line|StationOfLine|LineTransfer|StationTransfer|TrainType|ODFare\/\d+\/to\/\d+)$/, fresh: DAY, stale: 7 * DAY, tier: 'static' },
  { re: /^basic\/v2\/Rail\/THSR\/(Station|StationOfLine|ODFare\/\d+\/to\/\d+)$/, fresh: DAY, stale: 7 * DAY, tier: 'static' }
];
const TDX_QUERY = new Set(['$select', '$filter', '$top', '$skip', '$orderby', '$spatialFilter']);

// "basic/v2/Bus/Route/City/Hsinchu?$select=…" → { path, query, rule } or null.
export function tdxRequest(raw) {
  if (typeof raw !== 'string' || raw.length > 1500) return null;
  const [pathPart, queryPart = ''] = raw.replace(/^\/+/, '').split('?');
  let path;
  try {
    path = pathPart.split('/').map(s => encodeURIComponent(decodeURIComponent(s))).join('/');
  } catch {
    return null;
  }
  const rule = TDX_RULES.find(r => r.re.test(decodeURIComponent(path)));
  if (!rule) return null;
  const q = new URLSearchParams(queryPart);
  const out = [];
  for (const [k, v] of [...q].sort(([a], [b]) => (a < b ? -1 : 1))) {
    if (!TDX_QUERY.has(k)) return null;
    if (k === '$spatialFilter' && !/^nearby\(\s*-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?\s*,\s*\d{1,4}\s*\)$/.test(v)) return null;
    if (k === '$top' && !/^\d{1,5}$/.test(v)) return null;
    // OData's own spelling: `$` kept, spaces as %20.
    out.push(`${k}=${encodeURIComponent(v)}`);
  }
  out.push('$format=JSON');
  return { path, query: out.join('&'), rule };
}

// The access token (a day long): kept in memory and KV, asked for again an
// hour before it ends.
let tdxToken = null;
export const resetTdxToken = () => (tdxToken = null);
export async function tdxAccess(env, fetchFn = fetch, now = Date.now()) {
  if (!env.TDX_CLIENT_ID || !env.TDX_CLIENT_SECRET) return null;
  if (tdxToken && tdxToken.exp - HOUR > now) return tdxToken.token;
  const kept = await kvJson(env, 'transit:tdx:token');
  if (kept?.token && kept.exp - HOUR > now) return (tdxToken = kept).token;
  const res = await fetchFn(TDX_AUTH, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: env.TDX_CLIENT_ID, client_secret: env.TDX_CLIENT_SECRET }).toString()
  });
  if (!res.ok) throw Object.assign(new Error(`TDX auth ${res.status}`), { status: res.status });
  const j = await res.json();
  if (!j.access_token) throw new Error('TDX auth: no token');
  tdxToken = { token: j.access_token, exp: now + (Number(j.expires_in) || 86_400) * 1000 };
  await kvPut(env, 'transit:tdx:token', tdxToken, Math.floor((tdxToken.exp - now) / 1000));
  return tdxToken.token;
}

// TDX's own limit is per key a minute (the free plan 5, 銅級 300): this
// isolate keeps under TDX_PER_MIN, and backs off for 30 s after a 429.
const pace = { minute: 0, n: 0, until: 0 };
export const resetPace = () => Object.assign(pace, { minute: 0, n: 0, until: 0 });
function paced(env, now) {
  if (now < pace.until) return false;
  const minute = Math.floor(now / MIN);
  if (pace.minute !== minute) Object.assign(pace, { minute, n: 0 });
  const limit = Number(env.TDX_PER_MIN) || 5;
  if (pace.n >= limit) return false;
  pace.n++;
  return true;
}

const inflight = new Map();

// One TDX answer, from the shared cache when it's fresh enough.
// → { status, body (text), age (ms), state: 'hit' | 'miss' | 'stale' | 'busy' | 'error' }
export async function tdxGet(env, raw, { fetchFn = fetch, cache = globalThis.caches?.default, ctx = null, now = Date.now() } = {}) {
  const req = tdxRequest(raw);
  if (!req) return { status: 400, body: JSON.stringify({ code: 'TDX_NOT_ALLOWED' }), state: 'error' };
  const url = `${TDX_BASE}${req.path}?${req.query}`;
  const key = new Request(`https://transit-cache.quadra/${req.path}?${req.query}`);
  let hit = null;
  try {
    hit = cache ? await cache.match(key) : null;
  } catch {}
  const at = hit ? Number(hit.headers.get('X-Fetched-At')) || 0 : 0;
  const age = now - at;
  if (hit && age < req.rule.fresh) return { status: 200, body: await hit.text(), age, state: 'hit' };
  const refresh = async () => {
    if (inflight.has(url)) return inflight.get(url);
    const p = (async () => {
      if (!paced(env, now)) return { status: 429, state: 'busy' };
      const token = await tdxAccess(env, fetchFn, now);
      if (!token) return { status: 503, state: 'nokey' };
      const res = await fetchFn(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'Accept-Encoding': 'br, gzip' } });
      await tally(env, 'tdx', 1, now, ctx);
      if (res.status === 429) pace.until = now + 30_000;
      if (res.status === 401) resetTdxToken();
      if (!res.ok) return { status: res.status, state: 'error' };
      const body = await res.text();
      if (cache) {
        const put = cache.put(key, new Response(body, { headers: { 'Content-Type': 'application/json; charset=utf-8', 'X-Fetched-At': String(now), 'Cache-Control': `public, max-age=${Math.ceil(req.rule.stale / 1000)}` } })).catch(() => {});
        if (ctx?.waitUntil) ctx.waitUntil(put);
        else await put;
      }
      return { status: 200, body, age: 0, state: 'miss' };
    })().finally(() => inflight.delete(url));
    inflight.set(url, p);
    return p;
  };
  if (hit && age < req.rule.stale) {
    // At once, refreshed behind.
    const p = refresh().catch(() => {});
    if (ctx?.waitUntil) ctx.waitUntil(p);
    return { status: 200, body: await hit.text(), age, state: 'stale' };
  }
  let got;
  try {
    got = await refresh();
  } catch {
    got = { status: 502, state: 'error' };
  }
  if (got.status === 200) return got;
  // TDX busy or failing: the last copy, however old the cache still has it.
  if (hit) return { status: 200, body: await hit.text(), age, state: 'stale' };
  const code = got.state === 'nokey' ? 'TDX_NO_KEY' : got.state === 'busy' || got.status === 429 ? 'TDX_BUSY' : 'TDX_FAILED';
  return { status: got.state === 'nokey' ? 503 : got.status === 429 || got.state === 'busy' ? 429 : 502, body: JSON.stringify({ code }), state: got.state || 'error' };
}

// ---- Google: places -------------------------------------------------------------------

const googleKey = env => env.GOOGLE_MAPS_KEY || env.GOOGLE_WEATHER_KEY || '';
const num = v => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
const inTaiwan = (lat, lon) => lat >= 21.7 && lat <= 26.5 && lon >= 118 && lon <= 122.2;

export function parseAutocomplete(j) {
  return (j?.suggestions || [])
    .map(s => s.placePrediction)
    .filter(Boolean)
    .map(p => ({
      id: p.placeId || String(p.place || '').replace(/^places\//, ''),
      name: p.structuredFormat?.mainText?.text || p.text?.text || '',
      sub: p.structuredFormat?.secondaryText?.text || '',
      dist: num(p.distanceMeters),
      types: (p.types || []).slice(0, 4)
    }))
    .filter(p => p.id && p.name);
}

export function parseNominatim(list) {
  return (Array.isArray(list) ? list : [])
    .map(p => {
      const parts = String(p.display_name || '').split(',').map(s => s.trim()).filter(Boolean);
      return { id: `osm:${p.osm_type?.[0] || 'n'}${p.osm_id}`, name: p.name || parts[0] || '', sub: parts.slice(1, 4).join(' '), lat: num(p.lat), lon: num(p.lon) };
    })
    .filter(p => p.name && p.lat != null && p.lon != null);
}

async function search(env, q, { fetchFn, ctx, now, cache }) {
  const text = String(q.get('q') || '').trim().slice(0, 80);
  if (!text) return { items: [] };
  const lat = num(q.get('lat'));
  const lon = num(q.get('lon'));
  const session = /^[A-Za-z0-9_-]{8,64}$/.test(q.get('s') || '') ? q.get('s') : '';
  if (googleKey(env) && (await spend(env, 'autocomplete', 1, now, ctx))) {
    const body = { input: text, languageCode: 'zh-TW', regionCode: 'tw', includedRegionCodes: ['tw'], ...(session ? { sessionToken: session } : {}) };
    if (lat != null && lon != null && inTaiwan(lat, lon)) Object.assign(body, { origin: { latitude: lat, longitude: lon }, locationBias: { circle: { center: { latitude: lat, longitude: lon }, radius: 30_000 } } });
    try {
      const res = await fetchFn(`${PLACES}places:autocomplete`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': googleKey(env) }, body: JSON.stringify(body) });
      if (res.ok) return { items: parseAutocomplete(await res.json()), by: 'google' };
    } catch {}
  }
  // OpenStreetMap's search (Nominatim: a second a request at most, so cached a day).
  const params = new URLSearchParams({ q: text, format: 'jsonv2', countrycodes: 'tw', 'accept-language': 'zh-TW', limit: '8' });
  if (lat != null && lon != null) params.set('viewbox', `${lon - 0.3},${lat + 0.3},${lon + 0.3},${lat - 0.3}`);
  const url = `${NOMINATIM}?${params}`;
  const key = new Request(`https://transit-cache.quadra/osm?${params}`);
  try {
    const hit = cache && (await cache.match(key));
    if (hit) return { items: parseNominatim(await hit.json()), by: 'osm' };
    const res = await fetchFn(url, { headers: { 'User-Agent': 'OrbitTransit/1.0 (https://jaypengx.github.io/Orbit-Transit/)', Accept: 'application/json' } });
    if (!res.ok) return { items: [], by: 'osm' };
    const list = await res.json();
    if (cache) {
      const put = cache.put(key, new Response(JSON.stringify(list), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=86400' } })).catch(() => {});
      if (ctx?.waitUntil) ctx.waitUntil(put);
    }
    return { items: parseNominatim(list), by: 'osm' };
  } catch {
    return { items: [], by: 'osm' };
  }
}

export function parsePlace(j) {
  const lat = num(j?.location?.latitude);
  const lon = num(j?.location?.longitude);
  if (lat == null || lon == null) return null;
  return { id: j.id || '', name: j.displayName?.text || '', lat, lon, address: j.formattedAddress || '', types: (j.types || []).slice(0, 6) };
}

async function place(env, q, { fetchFn, ctx, now, cache }) {
  const id = String(q.get('id') || '');
  if (!/^[A-Za-z0-9_-]{10,300}$/.test(id)) return [{ code: 'BAD_PLACE' }, 400];
  if (!googleKey(env)) return [{ code: 'NO_KEY' }, 503];
  // A place's name is Pro; its position and address Essentials.
  const pro = q.get('name') === '1' && (await spend(env, 'detailsPro', 1, now, ctx));
  const key = new Request(`https://transit-cache.quadra/place/${id}?pro=${pro ? 1 : 0}`);
  try {
    const hit = cache && (await cache.match(key));
    if (hit) return [await hit.json(), 200];
  } catch {}
  if (!pro && !(await spend(env, 'details', 1, now, ctx))) return [{ code: 'CAP_REACHED' }, 429];
  const session = /^[A-Za-z0-9_-]{8,64}$/.test(q.get('s') || '') ? `&sessionToken=${q.get('s')}` : '';
  const fields = `id,location,formattedAddress,types${pro ? ',displayName' : ''}`;
  const res = await fetchFn(`${PLACES}places/${encodeURIComponent(id)}?languageCode=zh-TW&regionCode=tw${session}`, { headers: { 'X-Goog-Api-Key': googleKey(env), 'X-Goog-FieldMask': fields } });
  if (!res.ok) return [{ code: 'PLACE_FAILED', status: res.status }, 502];
  const out = parsePlace(await res.json());
  if (!out) return [{ code: 'PLACE_FAILED' }, 502];
  // Kept a day (Google allows place ids kept; positions are refreshed daily).
  if (cache) {
    const put = cache.put(key, new Response(JSON.stringify(out), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=86400' } })).catch(() => {});
    if (ctx?.waitUntil) ctx.waitUntil(put);
  }
  return [out, 200];
}

// ---- Routes: Google's and TDX's plans in one shape -----------------------------------------
//
// A plan: { src, dep, arr, dur (s), walk (m), fare, transfers, legs: [leg] }
// A leg: { mode: walk|bike|bus|metro|lightrail|tra|hsr|ferry|gondola|rail,
//   name, short, color, text, headsign, agency, stops, dep, arr, dur, dist,
//   from: { name, lat, lon }, to: {…}, poly, fmt: 'g' (Google's encoding) | 'f' (HERE's flexible) }

const G_MODES = {
  BUS: 'bus', INTERCITY_BUS: 'bus', TROLLEYBUS: 'bus', SHARE_TAXI: 'bus',
  SUBWAY: 'metro', METRO_RAIL: 'metro', MONORAIL: 'metro',
  LIGHT_RAIL: 'lightrail', TRAM: 'lightrail',
  HIGH_SPEED_TRAIN: 'hsr',
  HEAVY_RAIL: 'tra', RAIL: 'tra', COMMUTER_TRAIN: 'tra', LONG_DISTANCE_TRAIN: 'tra',
  FERRY: 'ferry', CABLE_CAR: 'gondola', GONDOLA_LIFT: 'gondola', FUNICULAR: 'gondola'
};
const secs = s => (typeof s === 'string' ? Number(s.replace(/s$/, '')) || 0 : Number(s) || 0);
const ms = t => {
  const v = t ? Date.parse(t) : NaN;
  return Number.isFinite(v) ? v : null;
};
const pt = (name, ll) => ({ name: name || '', lat: num(ll?.latitude ?? ll?.lat), lon: num(ll?.longitude ?? ll?.lng ?? ll?.lon) });

export const GOOGLE_ROUTE_FIELDS = [
  'routes.duration',
  'routes.distanceMeters',
  'routes.travelAdvisory.transitFare',
  'routes.legs.steps.travelMode',
  'routes.legs.steps.staticDuration',
  'routes.legs.steps.distanceMeters',
  'routes.legs.steps.polyline.encodedPolyline',
  'routes.legs.steps.startLocation',
  'routes.legs.steps.endLocation',
  'routes.legs.steps.transitDetails'
].join(',');

export function googleRouteBody(from, to, { at = null, by = 'depart', prefer = '' } = {}) {
  const body = {
    origin: { location: { latLng: { latitude: from.lat, longitude: from.lon } } },
    destination: { location: { latLng: { latitude: to.lat, longitude: to.lon } } },
    travelMode: 'TRANSIT',
    computeAlternativeRoutes: true,
    languageCode: 'zh-TW',
    regionCode: 'tw',
    units: 'METRIC'
  };
  if (at) body[by === 'arrive' ? 'arrivalTime' : 'departureTime'] = new Date(at).toISOString();
  if (prefer === 'walk') body.transitPreferences = { routingPreference: 'LESS_WALKING' };
  if (prefer === 'transfers') body.transitPreferences = { routingPreference: 'FEWER_TRANSFERS' };
  return body;
}

export function parseGoogleRoutes(j, now = Date.now()) {
  const plans = [];
  for (const r of j?.routes || []) {
    const steps = (r.legs || []).flatMap(l => l.steps || []);
    const legs = [];
    for (const s of steps) {
      const td = s.transitDetails;
      if (s.travelMode === 'TRANSIT' && td) {
        const line = td.transitLine || {};
        const sd = td.stopDetails || {};
        legs.push({
          mode: G_MODES[line.vehicle?.type] || 'rail',
          name: line.name || line.nameShort || '',
          short: line.nameShort || '',
          color: line.color || '',
          text: line.textColor || '',
          vehicle: line.vehicle?.name?.text || '',
          agency: line.agencies?.[0]?.name || '',
          headsign: td.headsign || '',
          stops: Number(td.stopCount) || 0,
          headway: secs(td.headway) || null,
          dep: ms(sd.departureTime),
          arr: ms(sd.arrivalTime),
          dur: secs(s.staticDuration),
          dist: Number(s.distanceMeters) || 0,
          from: pt(sd.departureStop?.name, sd.departureStop?.location?.latLng),
          to: pt(sd.arrivalStop?.name, sd.arrivalStop?.location?.latLng),
          poly: s.polyline?.encodedPolyline || '',
          fmt: 'g'
        });
      } else {
        // Walking steps run together into one walk.
        const last = legs.at(-1);
        const step = { dur: secs(s.staticDuration), dist: Number(s.distanceMeters) || 0, poly: s.polyline?.encodedPolyline || '' };
        if (last?.mode === 'walk') {
          last.dur += step.dur;
          last.dist += step.dist;
          last.polys.push(step.poly);
          last.to = pt('', s.endLocation?.latLng);
        } else legs.push({ mode: 'walk', dur: step.dur, dist: step.dist, polys: [step.poly], from: pt('', s.startLocation?.latLng), to: pt('', s.endLocation?.latLng), fmt: 'g' });
      }
    }
    if (!legs.length) continue;
    timeWalks(legs, now);
    for (const l of legs) if (l.polys) {
      l.poly = l.polys.filter(Boolean);
      delete l.polys;
    }
    const fare = r.travelAdvisory?.transitFare;
    plans.push(finishPlan({ src: 'google', legs, fare: fare?.units != null ? Number(fare.units) : null }));
  }
  return plans;
}

// Walks take their times from the rides around them (Google gives a walk
// only its length).
function timeWalks(legs, now) {
  for (let i = 0; i < legs.length; i++) {
    const l = legs[i];
    if (l.mode !== 'walk' || (l.dep != null && l.arr != null)) continue;
    const next = legs.slice(i + 1).find(x => x.dep != null);
    const prev = legs.slice(0, i).reverse().find(x => x.arr != null);
    if (prev?.arr != null) {
      l.dep = prev.arr;
      l.arr = prev.arr + l.dur * 1000;
    } else if (next?.dep != null) {
      l.arr = next.dep;
      l.dep = next.dep - l.dur * 1000;
    } else {
      l.dep = now;
      l.arr = now + l.dur * 1000;
    }
  }
}

function finishPlan(p) {
  const legs = p.legs;
  const rides = legs.filter(l => l.mode !== 'walk' && l.mode !== 'bike');
  const dep = legs[0]?.dep ?? null;
  const arr = legs.at(-1)?.arr ?? null;
  return {
    ...p,
    dep,
    arr,
    dur: dep != null && arr != null ? Math.round((arr - dep) / 1000) : legs.reduce((a, l) => a + (l.dur || 0), 0),
    walk: legs.filter(l => l.mode === 'walk').reduce((a, l) => a + (l.dist || 0), 0),
    transfers: Math.max(0, rides.length - 1)
  };
}

// TDX's planner (MaaS 公共運輸旅運規劃): routes with sections in HERE's
// public-transit shape. Read loosely: a field it doesn't send is left empty.
const T_MODES = {
  pedestrian: 'walk', walk: 'walk',
  bicycle: 'bike', bike: 'bike', bikeShare: 'bike', rentedBike: 'bike', sharedBike: 'bike',
  highSpeedTrain: 'hsr', intercityTrain: 'tra', interRegionalTrain: 'tra', regionalTrain: 'tra', cityTrain: 'tra', train: 'tra',
  subway: 'metro', monorail: 'metro', lightRail: 'lightrail', tram: 'lightrail',
  bus: 'bus', privateBus: 'bus', busRapid: 'bus', coach: 'bus',
  ferry: 'ferry', aerial: 'gondola', inclined: 'gondola', cableCar: 'gondola'
};
// A section without its length: the straight line between its ends, ×1.3 for the streets.
function roughMeters(a, b) {
  const [la1, lo1, la2, lo2] = [a?.lat, a?.lng, b?.lat, b?.lng].map(Number);
  if (![la1, lo1, la2, lo2].every(Number.isFinite)) return 0;
  const r = Math.PI / 180;
  const x = (lo2 - lo1) * r * Math.cos(((la1 + la2) / 2) * r);
  const y = (la2 - la1) * r;
  return Math.round(Math.sqrt(x * x + y * y) * 6_371_000 * 1.3);
}
export function parseTdxRoutes(j) {
  const routes = j?.data?.routes || j?.routes || [];
  const plans = [];
  for (const r of routes) {
    const sections = Array.isArray(r.sections) ? r.sections : Object.values(r.sections || {});
    const legs = sections.map(s => {
      const t = s.transport || {};
      const mode = T_MODES[t.mode] || (s.type === 'pedestrian' ? 'walk' : /bike|bicycle/i.test(`${t.mode || s.type}`) ? 'bike' : t.mode ? 'rail' : 'walk');
      const dep = ms(s.departure?.time);
      const arr = ms(s.arrival?.time);
      return {
        mode,
        name: t.name || t.longName || '',
        short: t.shortName || '',
        color: t.color || '',
        text: t.textColor || '',
        agency: s.agency?.name || '',
        headsign: t.headsign || '',
        stops: Array.isArray(s.intermediateStops) ? s.intermediateStops.length + 1 : 0,
        dep,
        arr,
        dur: Number(s.travelSummary?.duration ?? s.duration) || (dep != null && arr != null ? (arr - dep) / 1000 : 0),
        dist: Number(s.travelSummary?.length ?? s.length) || roughMeters(s.departure?.place?.location, s.arrival?.place?.location),
        from: pt(s.departure?.place?.name, s.departure?.place?.location),
        to: pt(s.arrival?.place?.name, s.arrival?.place?.location),
        poly: s.polyline || '',
        fmt: 'f'
      };
    });
    if (!legs.length) continue;
    plans.push(finishPlan({ src: 'tdx', legs, fare: num(r.total_price ?? r.price ?? r.fare) }));
  }
  return plans;
}

// Two plans riding the same lines between the same stops are one.
export const planSig = p =>
  p.legs
    .filter(l => l.mode !== 'walk')
    .map(l => `${l.mode}:${l.short || l.name}:${l.from?.name}>${l.to?.name}`)
    .join('|');

const twIso = t => new Date(t + 8 * HOUR).toISOString().slice(0, 19);

async function routes(env, q, { fetchFn, ctx, now, cache }) {
  const ll = s => {
    const m = /^(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/.exec(s || '');
    return m && inTaiwan(Number(m[1]), Number(m[2])) ? { lat: Number(m[1]), lon: Number(m[2]) } : null;
  };
  const from = ll(q.get('from'));
  const to = ll(q.get('to'));
  if (!from || !to) return [{ code: 'BAD_LOCATION' }, 400];
  const by = q.get('by') === 'arrive' ? 'arrive' : 'depart';
  const atRaw = Number(q.get('at'));
  const at = Number.isFinite(atRaw) && atRaw > now - 5 * MIN ? Math.max(atRaw, now) : now;
  // Plans for the same ~100 m and 5 minutes are shared.
  const round = v => v.toFixed(3);
  const slot = Math.floor(at / (5 * MIN));
  const cacheKey = new Request(`https://transit-cache.quadra/route/${round(from.lat)},${round(from.lon)}/${round(to.lat)},${round(to.lon)}/${by}/${slot}`);
  try {
    const hit = cache && (await cache.match(cacheKey));
    if (hit) return [{ ...(await hit.json()), cached: true }, 200];
  } catch {}
  const sources = {};
  const jobs = [];
  if (googleKey(env) && (await spend(env, 'routes', 1, now, ctx))) {
    jobs.push(
      fetchFn(ROUTES, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': googleKey(env), 'X-Goog-FieldMask': GOOGLE_ROUTE_FIELDS }, body: JSON.stringify(googleRouteBody(from, to, { at: by === 'arrive' || at > now + MIN ? at : null, by })) })
        .then(async r => {
          sources.google = r.ok ? 'ok' : `http ${r.status}`;
          return r.ok ? parseGoogleRoutes(await r.json(), at) : [];
        })
        .catch(() => ((sources.google = 'error'), []))
    );
  } else sources.google = googleKey(env) ? 'cap' : 'nokey';
  if (env.TDX_CLIENT_ID) {
    const params = new URLSearchParams({ origin: `${from.lat},${from.lon}`, destination: `${to.lat},${to.lon}`, gc: '1.0', top: '5', transit: '3,4,5,6,7,8,9', transfer_time: '0,60', first_mile_mode: '0', first_mile_time: '15', last_mile_mode: '0', last_mile_time: '15' });
    params.set(by === 'arrive' ? 'arrival' : 'depart', twIso(at + (by === 'arrive' ? 0 : MIN)));
    jobs.push(
      (async () => {
        if (!paced(env, now)) return ((sources.tdx = 'busy'), []);
        const token = await tdxAccess(env, fetchFn, now);
        if (!token) return ((sources.tdx = 'nokey'), []);
        const r = await fetchFn(`${TDX_BASE}maas/routing?${params}`, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
        await tally(env, 'tdx', 1, now, ctx);
        sources.tdx = r.ok ? 'ok' : `http ${r.status}`;
        return r.ok ? parseTdxRoutes(await r.json()) : [];
      })().catch(() => ((sources.tdx = 'error'), []))
    );
  } else sources.tdx = 'nokey';
  const all = (await Promise.all(jobs)).flat();
  const seen = new Set();
  const plans = all
    .filter(p => p.legs.length && p.arr != null)
    .sort((a, b) => a.arr - b.arr)
    .filter(p => {
      const s = planSig(p);
      if (seen.has(s)) return false;
      seen.add(s);
      return true;
    })
    .slice(0, 8);
  const out = { from, to, at, by, plans, sources };
  if (cache && plans.length) {
    const put = cache.put(cacheKey, new Response(JSON.stringify(out), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=300' } })).catch(() => {});
    if (ctx?.waitUntil) ctx.waitUntil(put);
  }
  return [out, 200];
}

// ---- Route --------------------------------------------------------------------------------

export async function handleTransit(request, env, headers, path, { session = null, limited = () => false, ctx = null, fetchFn = fetch, cache = globalThis.caches?.default, now = Date.now() } = {}) {
  const send = (data, status = 200, extra = {}) => new Response(typeof data === 'string' ? data : JSON.stringify(data), { status, headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8', ...extra } });
  if (request.method !== 'GET') return send({ code: 'GET_ONLY' }, 405);
  const q = new URL(request.url).searchParams;
  const deps = { fetchFn, ctx, now, cache };
  if (path === '/transit/status') {
    return send({ month: billingMonth(now), used: await usage(env, now), caps: CAPS, keys: { tdx: Boolean(env.TDX_CLIENT_ID && env.TDX_CLIENT_SECRET), mapsBrowser: Boolean(env.GOOGLE_MAPS_BROWSER_KEY), google: Boolean(googleKey(env)) }, tdxPerMin: Number(env.TDX_PER_MIN) || 5 });
  }
  if (!session) return send({ code: 'ECO_TOKEN_INVALID' }, 401);
  if (limited()) return send({ code: 'RATE_LIMITED' }, 429);
  if (path === '/transit/config') {
    // One map load per call (the app asks once each time it opens).
    const google = Boolean(env.GOOGLE_MAPS_BROWSER_KEY) && (await spend(env, 'maps', 1, now, ctx));
    return send({ map: google ? { provider: 'google', key: env.GOOGLE_MAPS_BROWSER_KEY } : { provider: 'nlsc' }, search: googleKey(env) ? 'google' : 'osm', tdx: Boolean(env.TDX_CLIENT_ID) });
  }
  if (path === '/transit/tdx') {
    const got = await tdxGet(env, q.get('p') || '', deps);
    return send(got.body || '{}', got.status, { 'X-Transit-Cache': got.state, ...(got.age != null ? { 'X-Transit-Age': String(Math.round(got.age / 1000)) } : {}) });
  }
  if (path === '/transit/search') return send(await search(env, q, deps));
  if (path === '/transit/place') {
    const [body, status] = await place(env, q, deps);
    return send(body, status);
  }
  if (path === '/transit/route') {
    const [body, status] = await routes(env, q, deps);
    return send(body, status);
  }
  return send({ code: 'NOT_FOUND' }, 404);
}
