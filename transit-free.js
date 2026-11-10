// Orbit Transit's live data from the operators' own free sources, in TDX's
// shape, so TDX's free tier (3 points a month, from 2026-12-01) is left for
// what only TDX has. Each reader answers what tdxGet (transit.js) was asked,
// or null: then TDX is asked as before (the backup).
//
//   - YouBike: YouBike's own list of every 2.0 station in Taiwan with what's
//     there now (apis.youbike.com.tw/json/station-yb2.json: 9,800 stations,
//     685 KB gzipped, refreshed by YouBike each minute), read once a minute
//     at most and kept here; a city's list or the stations near a point.
//
// Nothing here is counted as TDX's: no points.

const MIN = 60_000;

// ---- YouBike -------------------------------------------------------------------------------

export const YB_URL = 'https://apis.youbike.com.tw/json/station-yb2.json';
// A station's number's first four digits → TDX's city and its id's prefix
// (TDX's StationUID is the prefix and YouBike's number: HSZ500401001).
// 5082: 新竹科學園區, listed by TDX with 新竹市's.
export const YB_CITY = {
  5001: ['Taipei', 'TPE'],
  5002: ['NewTaipei', 'NWT'],
  5003: ['Taoyuan', 'TAO'],
  5004: ['Hsinchu', 'HSZ'],
  5082: ['Hsinchu', 'HSZ'],
  5005: ['HsinchuCounty', 'HSQ'],
  5006: ['Taichung', 'TXG'],
  5007: ['MiaoliCounty', 'MIA'],
  5010: ['Chiayi', 'CYI'],
  5011: ['ChiayiCounty', 'CYQ'],
  5012: ['Kaohsiung', 'KHH'],
  5013: ['Tainan', 'TNN'],
  5014: ['PingtungCounty', 'PIF'],
  5015: ['TaitungCounty', 'TTT']
};
export const YB_FRESH = 50_000;
const YB_KEEP = 10 * MIN; // (YouBike's site failing: its last list this long, then TDX)

// YouBike's '2026-11-10 10:45:31' (Taiwan's time) → TDX's '2026-11-10T10:45:31+08:00'.
const twIso = s => (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(String(s || '')) ? `${s.replace(' ', 'T')}+08:00` : null);

// YouBike's list → { cities: Map(city → { stations, live }), all: [[lat, lon, city, i]] }, TDX's rows.
export function indexYouBike(list) {
  const cities = new Map();
  const all = [];
  for (const s of Array.isArray(list) ? list : []) {
    const no = String(s?.station_no || '');
    const c = YB_CITY[no.slice(0, 4)];
    const lat = Number(s.lat);
    const lon = Number(s.lng);
    if (!c || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const [city, pre] = c;
    const uid = pre + no;
    if (!cities.has(city)) cities.set(city, { stations: [], live: [] });
    const box = cities.get(city);
    const d = s.available_spaces_detail || {};
    const at = twIso(s.updated_at) || twIso(s.time);
    box.stations.push({
      StationUID: uid,
      StationID: no,
      StationName: { Zh_tw: `YouBike2.0_${s.name_tw || ''}`, En: `YouBike2.0_${s.name_en || s.name_tw || ''}` },
      StationPosition: { PositionLat: lat, PositionLon: lon },
      StationAddress: { Zh_tw: `${s.district_tw || ''}${s.address_tw || ''}`, En: [s.address_en, s.district_en].filter(Boolean).join(', ') },
      BikesCapacity: Number(s.parking_spaces) || 0,
      ServiceType: 2,
      ...(at ? { UpdateTime: at } : {})
    });
    box.live.push({
      StationUID: uid,
      StationID: no,
      // (YouBike's 1 in service, 2 paused; TDX's 1 and 2 the same, 0 stopped.)
      ServiceStatus: Number(s.status) === 1 ? 1 : Number(s.status) === 2 ? 2 : 0,
      AvailableRentBikes: Number(s.available_spaces) || 0,
      AvailableReturnBikes: Number(s.empty_spaces) || 0,
      AvailableRentBikesDetail: { GeneralBikes: (Number(d.yb2) || 0) + (Number(d.yb1) || 0), ElectricBikes: Number(d.eyb) || 0 },
      ...(at ? { UpdateTime: at, SrcUpdateTime: at } : {})
    });
    all.push([lat, lon, city, box.stations.length - 1]);
  }
  return { cities, all };
}

let yb = null; // { at, idx }
let ybGoing = null;
async function youBike(fetchFn, now) {
  if (yb && now - yb.at < YB_FRESH) return yb;
  if (!ybGoing) {
    ybGoing = (async () => {
      const res = await fetchFn(YB_URL, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout?.(8000) });
      if (!res.ok) throw new Error(`youbike ${res.status}`);
      const idx = indexYouBike(await res.json());
      if (!idx.all.length) throw new Error('youbike empty');
      yb = { at: now, idx };
      return yb;
    })().finally(() => (ybGoing = null));
  }
  try {
    return await ybGoing;
  } catch (err) {
    console.log('youbike failed', String(err?.message || err).slice(0, 120));
    return yb && now - yb.at < YB_KEEP ? yb : null;
  }
}
export function resetYouBike() {
  yb = null;
  ybGoing = null;
}

const BIKE_CITY = /^basic\/v2\/Bike\/(Station|Availability)\/City\/([A-Za-z]+)$/;
const BIKE_NEAR = /^advanced\/v2\/Bike\/(Station|Availability)\/NearBy$/;
const NEARBY = /^nearby\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*,\s*(\d{1,5})\s*\)$/;
const metres = (a, b, c, d) => {
  const k = Math.PI / 180;
  const x = (d - b) * k * Math.cos(((a + c) / 2) * k);
  const y = (c - a) * k;
  return 6_371_000 * Math.hypot(x, y);
};
const pick = (rows, select) => (select ? rows.map(r => Object.fromEntries(select.filter(k => k in r).map(k => [k, r[k]]))) : rows);

async function bikes(path, q, { fetchFn, now }) {
  const city = path.match(BIKE_CITY);
  const near = !city && path.match(BIKE_NEAR);
  if (!city && !near) return undefined;
  // (Only what this answers as TDX would: a filter TDX alone reads.)
  if (q.has('$filter') || q.has('$orderby') || q.has('$skip')) return null;
  const kind = (city || near)[1] === 'Station' ? 'stations' : 'live';
  const select = q.get('$select')?.split(',').filter(Boolean) || null;
  if (city && !Object.values(YB_CITY).some(([c]) => c === city[2])) return null;
  const got = await youBike(fetchFn, now);
  if (!got) return null;
  let rows;
  if (city) rows = got.idx.cities.get(city[2])?.[kind] || [];
  else {
    const m = String(q.get('$spatialFilter') || '').match(NEARBY);
    if (!m) return null;
    const [lat, lon, r] = [Number(m[1]), Number(m[2]), Number(m[3])];
    const top = Math.min(Number(q.get('$top')) || 30, 1000);
    rows = got.idx.all
      .map(([a, b, c, i]) => [metres(lat, lon, a, b), c, i])
      .filter(([d]) => d <= r)
      .sort((x, y) => x[0] - y[0])
      .slice(0, top)
      .map(([, c, i]) => got.idx.cities.get(c)[kind][i]);
  }
  return { status: 200, body: JSON.stringify(pick(rows, select)), age: Math.max(0, now - got.at), state: 'free' };
}

// ---- 新竹's buses: 竹塹交通資訊網 -------------------------------------------------------
//
// 新竹市's and 新竹縣's buses (and 公路客運's and 竹科's there) are run by 公路局
// for both, and its site (hisatisfy.hccg.gov.tw, the same app at
// ibus.hsinchu.gov.tw) reads them live, no key: a stop's next bus on each
// route (getStopRouteTime, 4 KB), a route's every stop with the bus coming
// and its plate (getRouteDetails), each bus's GPS (getObuLls). Its ids are
// TDX's: a stop is TDX's StopUID without its prefix (HSZ, HSQ, THB, HSP),
// a route TDX's SubRouteUID and _1 or _2 (going, back). Jay allowed reading
// it 2026-11-06. Read as often as the site's own page (20 s).

export const HC_HOSTS = ['https://hisatisfy.hccg.gov.tw/ibusWeb', 'https://ibus.hsinchu.gov.tw/ibusWeb'];
export const HC_FRESH = 20_000;
const HC_KEEP = 2 * MIN; // (the site failing: its last answer this long, then TDX)
const HC_UID = /^(HSZ|HSQ|THB|HSP)([0-9A-Za-z]+)$/;
const HC_CLASSES = [
  [0, ['10', '20', '30', '50', '60', '70']],
  [1, ['41', '42', '43', '44', '45', '46', '47', '48']]
];

async function hcAsk(fetchFn, path, body) {
  let last;
  for (const host of HC_HOSTS) {
    try {
      const res = await fetchFn(`${host}/ibus_gis/${path}`, body ? { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout?.(6000) } : { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout?.(6000) });
      if (!res.ok) throw new Error(`hsinchu ${res.status}`);
      return await res.json();
    } catch (err) {
      last = err;
    }
  }
  throw last;
}

// A small keeper: each answer `fresh` long, its last `keep` long when the site fails.
const kept = new Map(); // key → { at, val }
const unknown = new Map(); // a stop id the site said it doesn't know → when
const going = new Map();
async function held(key, fresh, keep, load, now) {
  const k = kept.get(key);
  if (k && now - k.at < fresh) return k;
  if (!going.has(key))
    going.set(
      key,
      load()
        .then(val => {
          const got = { at: now, val };
          kept.delete(key);
          kept.set(key, got);
          while (kept.size > 3000) kept.delete(kept.keys().next().value);
          return got;
        })
        .finally(() => going.delete(key))
    );
  try {
    return await going.get(key);
  } catch (err) {
    if (k && now - k.at < keep) return k;
    throw err;
  }
}
export const resetFree = () => (kept.clear(), going.clear(), unknown.clear(), resetYouBike());

// '5分' / '即將進站' / '進站中' / '11:30' / '末班已過' → TDX's StopStatus, EstimateTime (s), NextBusTime.
export function hcTime(text, now = Date.now()) {
  const t = String(text ?? '').trim();
  let m;
  if ((m = t.match(/^(\d+)\s*分/))) return { StopStatus: 0, EstimateTime: Number(m[1]) * 60 };
  if (/進站中|已到站|到站中/.test(t)) return { StopStatus: 0, EstimateTime: 0 };
  if (/即將|將到/.test(t)) return { StopStatus: 0, EstimateTime: 60 };
  if ((m = t.match(/^(\d{1,2}):(\d{2})$/))) {
    // (Taiwan's clock: a time long past is tomorrow's.)
    const tw = new Date(now + 8 * 3_600_000);
    let at = Date.UTC(tw.getUTCFullYear(), tw.getUTCMonth(), tw.getUTCDate(), Number(m[1]), Number(m[2])) - 8 * 3_600_000;
    if (at < now - 3 * 3_600_000) at += 86_400_000;
    return { StopStatus: 1, NextBusTime: new Date(at + 8 * 3_600_000).toISOString().slice(0, 19) + '+08:00' };
  }
  if (/末班/.test(t)) return { StopStatus: 3 };
  if (/未營運|停駛|停班/.test(t)) return { StopStatus: 4 };
  if (/不停靠|交管/.test(t)) return { StopStatus: 2 };
  return { StopStatus: 1 };
}

// 'THB5606A1_1' → { sub: 'THB5606A1', route: 'THB5606', dir: 0 }.
export function hcRoute(id) {
  const m = String(id || '').match(/^((HSZ|HSQ|THB|HSP)[0-9A-Za-z]+)_(\d)$/);
  if (!m || m[1].length < 6) return null;
  return { sub: m[1], route: m[1].slice(0, -2), dir: Number(m[3]) - 1, pre: m[2] };
}
// (A route's own name: 5606A, 2支A are its branches' names.)
const routeName = (no, sub) => (/0[12]$/.test(sub) ? no : String(no || '').replace(/(支.*|[A-Z])$/, '') || no);
const twNow = now => new Date(now + 8 * 3_600_000).toISOString().slice(0, 19) + '+08:00';

// A stop's next buses (TDX's StopUID) → TDX's ETA rows, or null (the site doesn't know it).
async function hcStop(uid, deps) {
  const m = uid.match(HC_UID);
  if (!m) return null;
  // (A stop the site doesn't know, 公路客運's far from 新竹: not asked again for a day.)
  if (deps.now - (unknown.get(m[2]) ?? -Infinity) < 86_400_000) return { rows: null, at: deps.now };
  const got = await held(`stop:${m[2]}`, HC_FRESH, HC_KEEP, () => hcAsk(deps.fetchFn, `getStopRouteTime/?stopId=${encodeURIComponent(m[2])}`), deps.now);
  const stop = got.val?.stop;
  if (!stop) {
    if (got.val && got.val.status === 0) unknown.set(m[2], deps.now);
    while (unknown.size > 5000) unknown.delete(unknown.keys().next().value);
    return { rows: null, at: got.at };
  }
  const rows = [];
  for (const t of stop.timeData || []) {
    const r = hcRoute(t.route_id);
    if (!r || r.pre !== m[1]) continue;
    rows.push({ StopUID: uid, StopID: m[2], RouteUID: r.route, SubRouteUID: r.sub, RouteName: { Zh_tw: routeName(t.route_no, r.sub), En: routeName(t.route_no, r.sub) }, Direction: r.dir, ...hcTime(t.time, deps.now), DataTime: twNow(got.at) });
  }
  return { rows: rows.length ? rows : null, at: got.at };
}

// Every route the site reads: TDX's RouteUID → its pairs ('THB560801_1,THB560802_2'), a day.
async function hcRoutes(deps) {
  const got = await held('routes', 86_400_000, 7 * 86_400_000, async () => {
    const byRoute = {};
    const asks = HC_CLASSES.flatMap(([h, list]) => list.map(c => [h, c]));
    const all = await Promise.allSettled(
      asks.map(([h, c]) =>
        deps.fetchFn(`${HC_HOSTS[h]}/ibus_gis/getRoutesByClass/`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ class: c, text: '' }), signal: AbortSignal.timeout?.(8000) }).then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      )
    );
    for (const a of all) {
      if (a.status !== 'fulfilled') continue;
      for (const r of a.value?.routes || []) {
        const one = hcRoute(r.RouteId);
        if (!one || !r.RouteIds) continue;
        (byRoute[one.route] ||= new Set()).add(r.RouteIds);
      }
    }
    if (!Object.keys(byRoute).length) throw new Error('hsinchu: no routes');
    return Object.fromEntries(Object.entries(byRoute).map(([k, v]) => [k, [...v]]));
  }, deps.now);
  return got.val;
}

// A route (TDX's RouteUID) → every stop's next bus with its plate, both ways.
async function hcRouteRows(route, deps) {
  const pairs = (await hcRoutes(deps))[route];
  if (!pairs) return null;
  const rows = [];
  let at = deps.now;
  for (const pair of pairs.slice(0, 4)) {
    const got = await held(`route:${pair}`, HC_FRESH, HC_KEEP, () => hcAsk(deps.fetchFn, 'getRouteDetails/', { routeIds: pair }), deps.now);
    at = Math.min(at, got.at);
    for (const way of ['go', 'back']) {
      for (const s of got.val?.[way] || []) {
        const r = hcRoute(s.routeId);
        if (!r || !s.stop_id) continue;
        rows.push({ StopUID: r.pre + s.stop_id, StopID: String(s.stop_id), RouteUID: r.route, SubRouteUID: r.sub, RouteName: { Zh_tw: routeName(s.routeNo, r.sub), En: routeName(s.routeNo, r.sub) }, Direction: r.dir, ...hcTime(s.time?.[0], deps.now), PlateNumb: s.car_no || '', DataTime: twNow(got.at) });
      }
    }
  }
  return { rows, at };
}

// A route's buses (TDX's RouteUID) → TDX's RealTimeByFrequency rows (GPS).
async function hcGps(route, deps) {
  const pairs = (await hcRoutes(deps))[route];
  if (!pairs) return null;
  const subs = [...new Set(pairs.flatMap(p => p.split(',')))].slice(0, 8);
  const rows = [];
  let at = deps.now;
  for (const id of subs) {
    const got = await held(`gps:${id}`, HC_FRESH, HC_KEEP, () => hcAsk(deps.fetchFn, 'getObuLls/', { RouteId: id }), deps.now);
    at = Math.min(at, got.at);
    const r = hcRoute(id);
    for (const b of got.val?.Data || []) {
      if (!Number.isFinite(Number(b.Latitude)) || !Number.isFinite(Number(b.Longitude))) continue;
      rows.push({ RouteUID: r.route, SubRouteUID: r.sub, PlateNumb: b.PlateNumber || '', Direction: r.dir, BusPosition: { PositionLat: Number(b.Latitude), PositionLon: Number(b.Longitude) }, GPSTime: b.GPSTime ? twNow(Date.parse(b.GPSTime)) : twNow(got.at), Speed: b.Speed ?? null, Azimuth: b.Azimuth ?? null });
    }
  }
  return { rows, at };
}

// The cities whose buses a free source reads (TDX's city names).
export const FREE_BUS = /^(Hsinchu|HsinchuCounty|InterCity)$/;
const MAX_STOPS = 30;
const MAX_ROUTES = 12;

// /transit/eta's stops or routes from the free sources → { rows, missing: { stops, routes }, age }.
// What a source doesn't know (a 公路客運 stop far from 新竹) is left for TDX.
export async function freeEta(city, { stops = [], routes = [] }, { fetchFn = fetch, now = Date.now() } = {}) {
  if (!FREE_BUS.test(city)) return null;
  const deps = { fetchFn, now };
  const rows = [];
  const missing = { stops: [], routes: [] };
  let oldest = now;
  const mine = stops.filter(u => HC_UID.test(u));
  missing.stops.push(...stops.filter(u => !HC_UID.test(u)), ...mine.slice(MAX_STOPS));
  await Promise.all(
    mine.slice(0, MAX_STOPS).map(async u => {
      const got = await hcStop(u, deps).catch(() => null);
      if (!got?.rows) return missing.stops.push(u);
      rows.push(...got.rows);
      oldest = Math.min(oldest, got.at);
    })
  );
  const rs = routes.filter(u => HC_UID.test(u));
  missing.routes.push(...routes.filter(u => !HC_UID.test(u)), ...rs.slice(MAX_ROUTES));
  await Promise.all(
    rs.slice(0, MAX_ROUTES).map(async u => {
      const got = await hcRouteRows(u, deps).catch(() => null);
      if (!got) return missing.routes.push(u);
      rows.push(...got.rows);
      oldest = Math.min(oldest, got.at);
    })
  );
  return { rows, missing, age: Math.max(0, now - oldest) };
}

// /transit/gps's routes → { rows, missing, age }.
export async function freeGps(city, routes, { fetchFn = fetch, now = Date.now() } = {}) {
  if (!FREE_BUS.test(city)) return null;
  const deps = { fetchFn, now };
  const rows = [];
  const missing = [];
  let oldest = now;
  const rs = routes.filter(u => HC_UID.test(u));
  missing.push(...routes.filter(u => !HC_UID.test(u)), ...rs.slice(MAX_ROUTES));
  await Promise.all(
    rs.slice(0, MAX_ROUTES).map(async u => {
      const got = await hcGps(u, deps).catch(() => null);
      if (!got) return missing.push(u);
      rows.push(...got.rows);
      oldest = Math.min(oldest, got.at);
    })
  );
  return { rows, missing, age: Math.max(0, now - oldest) };
}

// ---- One entry for tdxGet -----------------------------------------------------------------

// A TDX ask (its path and query, as tdxRequest made them) answered from a free
// source → { status, body, age, state: 'free' }, or null (TDX's to answer).
export async function freeTdx(path, query, { fetchFn = fetch, now = Date.now() } = {}) {
  const q = new URLSearchParams(query);
  try {
    const got = await bikes(decodeURIComponent(path), q, { fetchFn, now });
    if (got !== undefined) return got;
  } catch (err) {
    console.log('free source failed', path.slice(0, 80), String(err?.message || err).slice(0, 120));
  }
  return null;
}

// Whether a /transit/tdx ask is one the free sources answer (worker.js sends
// those to the Runner: a list of all Taiwan read and kept there, not in each
// isolate's 10 ms).
export const freeHeavy = p => /^(basic|advanced)\/v2\/Bike\//.test(String(p || '').replace(/^\/+/, ''));
// (A route's whole list of stops, or its buses, from 新竹's site: read in the Runner too.)
export const freeRoutesHeavy = (path, q) => (path === '/transit/gps' || (path === '/transit/eta' && (q.get('routes') || q.get('route')))) && FREE_BUS.test(q.get('city') || '');
