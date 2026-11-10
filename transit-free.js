// Orbit Transit's live data from the operators' own free sources, in TDX's
// shape, so TDX's free tier (3 points a month, from 2026-12-01) is left for
// what only TDX has. Each reader answers what tdxGet (transit.js) was asked,
// or null: then TDX is asked as before (the backup).
//
//   - YouBike: YouBike's own list of every 2.0 station in Taiwan with what's
//     there now (apis.youbike.com.tw/json/station-yb2.json: 9,800 stations,
//     685 KB gzipped, refreshed by YouBike each minute), read once a minute
//     at most and kept here; a city's list or the stations near a point.
//   - 新竹's buses (竹塹交通資訊網), 臺北's and 新北's (the cities' open data),
//     臺中's and 桃園's (their own bus sites; 高雄's, the same maker's,
//     answers only Taiwan's own networks: read by the phones themselves).
//   - 台鐵's day of trains (台鐵's own open data, ods.railway.gov.tw); its
//     notices while every line runs whole (its 路線運行狀態 page); a train's
//     delay (its 車次查詢).
//   - 臺北捷運's trains coming in (the metro's own open file); 高雄捷運's and
//     輕軌's next trains at a station (KRTC's 高捷e遊行); 機場捷運's (its
//     platform screens).
//   - 高鐵's day and the metros' maps and timetables: the weekly build's
//     copies in R2 (rail/: TDX's GTFS, 0 points; the metros asked of TDX
//     only when GTFS says they changed); the bus route lists and 台鐵's and
//     高鐵's stations (tdx/: asked of TDX a month on).
//
// Nothing here is counted as TDX's: no points.

import { twClock, twNow, ebAlertRows, ebNewsRows, EB_ALERTS_ASK, EB_NEWS_ASK } from './kit/ebus.mjs';
import { EBUS, ebAsk, ebusRow, ebEta as ebRead, ebGps as ebBuses, packIndex, keeper, TN_PATH, tnRows, tnEta as tnRead, tnGps as tnBuses } from './kit/ebus-read.mjs';

const MIN = 60_000;
const DAY = 86_400_000;
const HOUR = 3_600_000;

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
let ybFailed = 0; // (refused: not asked again for 10 minutes, never the 6 MB at each ask)
async function youBike(fetchFn, now) {
  if (yb && now - yb.at < YB_FRESH) return yb;
  if (now - ybFailed < YB_KEEP) return yb && now - yb.at < YB_KEEP ? yb : null;
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
    ybFailed = now;
    console.log('youbike failed', String(err?.message || err).slice(0, 120));
    return yb && now - yb.at < YB_KEEP ? yb : null;
  }
}
export function resetYouBike() {
  yb = null;
  ybGoing = null;
  ybFailed = 0;
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

// A small keeper (the kit's, kit/ebus-read.mjs): each answer `fresh` long, its last `keep` long when the site fails.
const { held, heldMany, kept, going } = keeper();
const unknown = new Map(); // a stop id the site said it doesn't know → when
export const resetFree = () => (kept.clear(), going.clear(), unknown.clear(), resetYouBike());

// '5分' / '即將進站' / '進站中' / '11:30' / '末班已過' → TDX's StopStatus, EstimateTime (s), NextBusTime.
export function hcTime(text, now = Date.now()) {
  const t = String(text ?? '').trim();
  let m;
  if ((m = t.match(/^(\d+)\s*分/))) return { StopStatus: 0, EstimateTime: Number(m[1]) * 60 };
  if (/進站中|已到站|到站中/.test(t)) return { StopStatus: 0, EstimateTime: 0 };
  if (/即將|將到/.test(t)) return { StopStatus: 0, EstimateTime: 60 };
  // (Taiwan's clock: a time long past is tomorrow's.)
  if (twClock(t, now)) return { StopStatus: 1, NextBusTime: twClock(t, now) };
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
        rows.push({ StopUID: r.pre + s.stop_id, StopID: String(s.stop_id), StopName: { Zh_tw: s.name || '', En: s.name_en || s.name || '' }, RouteUID: r.route, SubRouteUID: r.sub, RouteName: { Zh_tw: routeName(s.routeNo, r.sub), En: routeName(s.routeNo, r.sub) }, Direction: r.dir, ...hcTime(s.time?.[0], deps.now), PlateNumb: s.car_no || '', DataTime: twNow(got.at) });
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

// ---- 臺北's and 新北's buses: the cities' own open data ------------------------------------
//
// 臺北市's every stop's next bus in one file (tcgbusfs: GetEstimateTime.gz,
// 160 KB gzipped, 2 MB; its buses' places in GetBusData.gz), 新北市's on its
// open data (a CSV, 630 KB); no key. Their ids are TDX's without the prefix
// (TPE, NWT). Route names, stop names and a stop's way come from Orbit's own
// bus packs (R2 bus/<city>.json, built weekly), as the phone has them.
export const CITY_FEEDS = {
  Taipei: { pre: 'TPE', eta: 'https://tcgbusfs.blob.core.windows.net/blobbus/GetEstimateTime.gz', bus: 'https://tcgbusfs.blob.core.windows.net/blobbus/GetBusData.gz', fresh: 20_000 },
  NewTaipei: { pre: 'NWT', eta: 'https://data.ntpc.gov.tw/api/datasets/07f7ccb3-ed00-43c4-966d-08e9dab24e95/csv/file', fresh: 30_000 }
};
const CITY_KEEP = 3 * MIN;

// A body that may be a .gz file (served as is, no Content-Encoding) → its text.
async function bodyText(res) {
  const buf = new Uint8Array(await res.arrayBuffer());
  if (buf[0] === 0x1f && buf[1] === 0x8b) return new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
  return new TextDecoder().decode(buf);
}

// Orbit's pack for a city → { route: Map(uid → name), stop: Map(uid → zh), ways: Map(stopUID@routeUID → [dir…]), sub, routes: Map(stopUID → [routeUID…]), dirs: Map(routeUID → Set(dir)) }.
// (公路客運's: bus/InterCity/ways.json, every route's ways without their timetables: the
// phones' packs are by square.) `subs`: each stop's and each route's sub-routes, [[sub, route, dir]…].
async function cityPack(city, deps) {
  if (!deps.env?.DATA) return null;
  const got = await held(`pack:${city}`, 6 * 3_600_000, 14 * 86_400_000, async () => {
    const o = await deps.env.DATA.get(city === 'InterCity' ? 'bus/InterCity/ways.json' : `bus/${city}.json`);
    if (!o) throw new Error(`no pack ${city}`);
    return packIndex(await o.json());
  }, deps.now);
  return got.val;
}

// -1 尚未發車, -2 交管不停靠, -3 末班車已過, -4 今日未營運 (both cities' own words) → TDX's StopStatus.
const SAID = { '-1': 1, '-2': 2, '-3': 3, '-4': 4 };
function cityRows(city, list, at, pack) {
  const { pre } = CITY_FEEDS[city];
  const byStop = new Map();
  const byRoute = new Map();
  const data = twNow(at);
  for (const x of list) {
    const sid = String(x.StopID ?? x.stopid ?? '');
    const rid = String(x.RouteID ?? x.routeid ?? '');
    if (!sid || !rid) continue;
    const stopUID = pre + sid;
    const routeUID = pre + rid;
    const est = Number(x.EstimateTime ?? x.estimatetime);
    const gb = String(x.GoBack ?? x.goback ?? '');
    // (A way the feed doesn't say, a bus not yet out or gone: the stop's own ways from the pack, else both.)
    const dirs = gb === '0' || gb === '1' ? [Number(gb)] : pack?.ways.get(`${stopUID}@${routeUID}`) || [0, 1];
    const name = pack?.route.get(routeUID) || rid;
    const stopName = pack?.stop.get(stopUID);
    for (const d of dirs) {
      const row = { StopUID: stopUID, StopID: sid, RouteUID: routeUID, RouteID: rid, RouteName: { Zh_tw: name, En: name }, ...(stopName ? { StopName: { Zh_tw: stopName, En: stopName } } : {}), Direction: d, ...(Number.isFinite(est) && est >= 0 ? { StopStatus: 0, EstimateTime: est } : { StopStatus: SAID[String(est)] ?? 1 }), DataTime: data };
      if (!byStop.has(stopUID)) byStop.set(stopUID, []);
      byStop.get(stopUID).push(row);
      if (!byRoute.has(routeUID)) byRoute.set(routeUID, []);
      byRoute.get(routeUID).push(row);
    }
  }
  return { byStop, byRoute };
}
const csvRows = text => {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean);
  const head = (lines.shift() || '').split(',').map(h => h.trim());
  return lines.map(l => Object.fromEntries(l.split(',').map((v, i) => [head[i], v.trim()])));
};
async function cityEtaIndex(city, deps) {
  const f = CITY_FEEDS[city];
  const pack = await cityPack(city, deps).catch(() => null);
  const got = await held(`eta:${city}`, f.fresh, CITY_KEEP, async () => {
    const res = await deps.fetchFn(f.eta, { headers: { Accept: '*/*' }, signal: AbortSignal.timeout?.(10_000) });
    if (!res.ok) throw new Error(`${city} ${res.status}`);
    const text = await bodyText(res);
    const list = text.trimStart().startsWith('{') ? JSON.parse(text).BusInfo : text.trimStart().startsWith('[') ? JSON.parse(text) : csvRows(text);
    if (!Array.isArray(list) || !list.length) throw new Error(`${city}: empty`);
    return list;
  }, deps.now);
  // (Rows made once a read, with the pack as it is then.)
  if (got.rows?.pack !== pack) got.rows = { pack, ...cityRows(city, got.val, got.at, pack) };
  return got;
}
async function cityGpsList(city, deps) {
  const f = CITY_FEEDS[city];
  if (!f.bus) return null;
  const pack = await cityPack(city, deps).catch(() => null);
  const got = await held(`bus:${city}`, f.fresh, CITY_KEEP, async () => {
    const res = await deps.fetchFn(f.bus, { signal: AbortSignal.timeout?.(10_000) });
    if (!res.ok) throw new Error(`${city} buses ${res.status}`);
    const list = JSON.parse(await bodyText(res)).BusInfo;
    if (!Array.isArray(list)) throw new Error(`${city} buses: not a list`);
    return list.map(b => ({ RouteUID: pack?.sub.get(f.pre + b.RouteID) || f.pre + b.RouteID, SubRouteUID: f.pre + b.RouteID, PlateNumb: b.BusID || '', Direction: Number(b.GoBack) === 1 ? 1 : 0, BusPosition: { PositionLat: Number(b.Latitude), PositionLon: Number(b.Longitude) }, GPSTime: /^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/.test(b.DataTime || '') ? `${b.DataTime.replace(' ', 'T')}+08:00` : twNow(deps.now), Speed: Number(b.Speed) || 0, Azimuth: Number(b.Azimuth) || 0 })).filter(b => Number.isFinite(b.BusPosition.PositionLat) && Number.isFinite(b.BusPosition.PositionLon));
  }, deps.now);
  return got;
}

// ---- 臺中's and 桃園's buses: the cities' own bus sites -------------------------------------
//
// Read with the kit's reader (kit/ebus-read.mjs, its notes there), the one
// Orbit Transit's phones read them with first (Jay 2026-11-10: what a phone
// can read, it reads): the proxy answers what a phone couldn't, and phones
// on an older app.
export { EBUS, ebusRow };
const ebDeps = deps => ({ ...deps, pack: city => cityPack(city, deps), held, heldMany });

// ---- 臺南's buses: the city's own bus site ---------------------------------------------------
//
// Read with the kit's reader too (kit/ebus-read.mjs tnEta, tnGps, its notes
// there), the one Orbit Transit's phones read it with first.
export { TN_PATH, tnRows };

// ---- 公路客運's and the counties' buses: 公路局's own site ----------------------------------
//
// 公路局's 公路客運乘車資訊服務網 (www.taiwanbus.tw) reads a sub-route one way
// at a time, no key (Query/ws/getRData.ashx?type=4&key=): each stop's time
// in its own words, the bus coming to it (its plate) and the way's buses'
// places (cars). It has every 公路客運 route and the city buses of the
// counties 公路局 oversees (基隆, 苗栗, 彰化, 南投, 雲林, 嘉義, 屏東, 宜蘭, 花蓮,
// 臺東, 澎湖; 新竹's too, after its own site), and its ids are TDX's: the key
// is TDX's SubRouteID (the route's 4, its branch, the way: 1815A1, the code
// one across the counties), a stop's sid TDX's StopID. Matched TDX stop for
// stop and bus for bus (1815 both ways, 苗栗 101, 2026-11-10). Read as often
// as its own page reads (20 s), a few at once; a sub-route it doesn't know
// answers [] (not asked again for an hour).
export const TB_CITIES = { InterCity: 'THB', Hsinchu: 'HSZ', HsinchuCounty: 'HSQ', Keelung: 'KEE', MiaoliCounty: 'MIA', ChanghuaCounty: 'CHA', NantouCounty: 'NAN', YunlinCounty: 'YUN', ChiayiCounty: 'CYQ', Chiayi: 'CYI', PingtungCounty: 'PIF', YilanCounty: 'ILA', HualienCounty: 'HUA', TaitungCounty: 'TTT', PenghuCounty: 'PEN' };
export const TB_URL = 'https://www.taiwanbus.tw/eBUSPage/Query/ws/getRData.ashx?type=4&key=';
const TB_FRESH = 20_000;
const TB_KEEP = 2 * MIN;
const TB_READS = 30; // (an ask's sub-routes and ways, at most: the rest TDX's)
const TB_AT_ONCE = 6;
const TB_SUB = /^([A-Z]{3})([0-9A-Z]{4}[0-9A-Z][12])$/;

// '5分', '1時5分', '即將進站', '進站中', '18:20', '18:20發車', '動態發車' (not out yet),
// '末班車駛離', '末班資訊' (its last gone), '今日未營運' → TDX's StopStatus, EstimateTime, NextBusTime.
export function tbTime(text, now = Date.now()) {
  const t = String(text ?? '').trim();
  const m = t.match(/^(?:(\d+)\s*時)?\s*(?:(\d+)\s*分)?$/);
  if (m && (m[1] || m[2])) return { StopStatus: 0, EstimateTime: (Number(m[1] || 0) * 60 + Number(m[2] || 0)) * 60 };
  const go = t.match(/^(\d{1,2}:\d{2})\s*發車$/);
  if (go) return hcTime(go[1], now);
  if (/動態發車|尚未發車/.test(t)) return { StopStatus: 1 };
  return hcTime(t, now);
}

// A sub-route one way (TDX's SubRouteUID) → { at, val: its answer | null (one it doesn't know) }.
const tbUnknown = new Map();
async function tbWay(sub, deps) {
  const m = TB_SUB.exec(sub);
  if (!m || deps.now - (tbUnknown.get(sub) ?? -Infinity) < 3_600_000) return { at: deps.now, val: null };
  const got = await held(`tb:${sub}`, TB_FRESH, TB_KEEP, async () => {
    const res = await deps.fetchFn(TB_URL + m[2], { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout?.(8000) });
    if (!res.ok) throw new Error(`taiwanbus ${res.status}`);
    const text = (await res.text()).replace(/^\uFEFF/, '').trim();
    const j = text ? JSON.parse(text) : null;
    if (Array.isArray(j) && !j.length) return null;
    if (!Array.isArray(j?.data)) throw new Error('taiwanbus: no stops');
    return j;
  }, deps.now);
  if (got.val === null) tbUnknown.set(sub, deps.now);
  while (tbUnknown.size > 3000) tbUnknown.delete(tbUnknown.keys().next().value);
  return got;
}
// Its answers' time ('17:57:55', Taiwan's) when it's sane, else the read's.
function tbAt(j, at) {
  const m = String(j?.time || '').match(/^(\d{1,2}):(\d{2}):(\d{2})$/);
  if (!m) return at;
  const tw = new Date(at + 8 * 3_600_000);
  const t = Date.UTC(tw.getUTCFullYear(), tw.getUTCMonth(), tw.getUTCDate(), +m[1], +m[2], +m[3]) - 8 * 3_600_000;
  return Math.abs(t - at) < 10 * MIN ? t : at;
}
// One way's answer → TDX's ETA rows (`only`: just these stops). A stop is a
// line for each bus coming to it (the soonest first: TDX's Estimates), else one.
export function tbRows(j, sub, route, dir, pack, at, only = null) {
  const pre = sub.slice(0, 3);
  const name = pack?.route.get(route) || route.slice(3);
  const t = tbAt(j, at);
  const byStop = new Map();
  for (const d of j?.data || []) {
    const sid = String(d?.sid || '');
    if (!/^\d+$/.test(sid) || (only && !only.has(pre + sid))) continue;
    if (!byStop.has(sid)) byStop.set(sid, []);
    byStop.get(sid).push(d);
  }
  const rows = [];
  for (const [sid, list] of byStop) {
    const said = list.map(d => ({ d, state: tbTime(d.ptime, at) }));
    const buses = said.filter(x => x.state.StopStatus === 0).sort((x, y) => x.state.EstimateTime - y.state.EstimateTime);
    const first = buses[0] || said[0];
    const state = buses.length ? { ...first.state, PlateNumb: String(first.d.car || ''), Estimates: buses.map(x => ({ PlateNumb: String(x.d.car || ''), EstimateTime: x.state.EstimateTime })) } : first.state;
    const d = first.d;
    rows.push({ StopUID: pre + sid, StopID: sid, ...(d.na ? { StopName: { Zh_tw: d.na, En: d.ena || d.na } } : {}), RouteUID: route, RouteID: route.slice(3), SubRouteUID: sub, SubRouteID: sub.slice(3), RouteName: { Zh_tw: name, En: name }, Direction: dir, ...state, DataTime: twNow(t) });
  }
  return rows;
}
// Ways to read ([[sub, route, dir]…]) → Map(sub → { at, val }), a few at once.
async function tbWays(list, deps) {
  const out = new Map();
  const todo = [...new Map(list.map(w => [w[0], w])).values()];
  for (let i = 0; i < todo.length; i += TB_AT_ONCE) {
    const got = await Promise.all(todo.slice(i, i + TB_AT_ONCE).map(([sub]) => tbWay(sub, deps).catch(() => null)));
    got.forEach((g, k) => g?.val && out.set(todo[i + k][0], g));
  }
  return out;
}

async function tbEta(city, { stops, routes }, deps) {
  const rows = [];
  const missing = { stops: [], routes: [] };
  let oldest = deps.now;
  const pack = await cityPack(city, deps).catch(() => null);
  if (!pack) return { rows, missing: { stops, routes }, age: 0 };
  const pre = TB_CITIES[city];
  // (Each stop's ways, the soonest asked first; past TB_READS, TDX's.)
  const want = [];
  const wayOf = new Map(); // stop → its ways' subs
  for (const u of stops) {
    const w = String(u).startsWith(pre) ? pack.subs.get(u) || [] : [];
    if (!w.length || want.length + w.length > TB_READS) {
      missing.stops.push(u);
      continue;
    }
    want.push(...w);
    wayOf.set(u, w.map(x => x[0]));
  }
  for (const u of routes) {
    const w = String(u).startsWith(pre) ? pack.subs.get(u) || [] : [];
    if (!w.length || want.length + w.length > TB_READS) {
      missing.routes.push(u);
      continue;
    }
    want.push(...w);
    wayOf.set(u, w.map(x => x[0]));
  }
  const got = await tbWays(want, deps);
  const info = new Map(want.map(w => [w[0], w]));
  const only = new Set(stops);
  const asked = new Set();
  for (const [u, subs] of wayOf) {
    const isStop = only.has(u);
    const have = subs.filter(x => got.has(x));
    if (!have.length) {
      (isStop ? missing.stops : missing.routes).push(u);
      continue;
    }
    for (const x of have) {
      const key = `${x}|${isStop ? 's' : 'r'}`;
      if (asked.has(key)) continue;
      asked.add(key);
      const [, route, dir] = info.get(x);
      const g = got.get(x);
      rows.push(...tbRows(g.val, x, route, dir, pack, g.at, isStop ? only : null));
      oldest = Math.min(oldest, g.at);
    }
  }
  // (A stop asked and on a route asked: once.)
  const seen = new Set();
  const out = rows.filter(r => {
    const k = `${r.StopUID}|${r.SubRouteUID}|${r.Direction}`;
    return !seen.has(k) && seen.add(k);
  });
  return { rows: out, missing, age: Math.max(0, deps.now - oldest) };
}

async function tbGps(city, routes, deps) {
  const rows = [];
  const missing = [];
  let oldest = deps.now;
  const pack = await cityPack(city, deps).catch(() => null);
  if (!pack) return { rows, missing: routes, age: 0 };
  const want = [];
  for (const u of routes) {
    const w = pack.subs.get(u) || [];
    if (!w.length || want.length + w.length > TB_READS) missing.push(u);
    else want.push(...w);
  }
  const got = await tbWays(want, deps);
  for (const u of routes.filter(u => !missing.includes(u))) {
    const ways = want.filter(w => w[1] === u && got.has(w[0]));
    if (!ways.length) {
      missing.push(u);
      continue;
    }
    for (const [sub, , dir] of ways) {
      const g = got.get(sub);
      const t = tbAt(g.val, g.at);
      for (const b of g.val.cars || []) {
        const lat = Number(b?.lat);
        const lon = Number(b?.lon);
        if (!b?.car || !(lat > 21.5 && lat < 26.5) || !(lon > 118 && lon < 122.5)) continue;
        rows.push({ RouteUID: u, SubRouteUID: sub, PlateNumb: String(b.car), Direction: dir, BusPosition: { PositionLat: lat, PositionLon: lon }, GPSTime: twNow(t), Speed: null, Azimuth: null });
      }
      oldest = Math.min(oldest, g.at);
    }
  }
  return { rows, missing, age: Math.max(0, deps.now - oldest) };
}

// 公路客運's notices, TDX's Bus News of InterCity, from 公路局's own 最新消息
// (taiwanbus.tw getNews.ashx): its 營運異動 and 其他 are TDX's News row for
// row (2026-11-10: 54 of TDX's 54, each its NewsURL's td=), listed while up;
// each notice's words read once by its id (four at a time, the answer not
// kept waiting past 4 s: its title meanwhile). TDX's Alert of InterCity (路線通阻)
// stays TDX's: it names each notice's routes (Scope), the site doesn't.
export const TB_NEWS = 'https://www.taiwanbus.tw/eBUSPage/Query/ws/getNews.ashx';
const TB_NOTICE = /^basic\/v2\/Bus\/News\/InterCity$/;
export const TB_NEWS_TYPES = [3, 99];
// '115-11-10' (民國) → '2026-11-10', else ''.
const rocDay = t => {
  const m = /^(\d{2,3})-(\d{1,2})-(\d{1,2})$/.exec(String(t || '').trim());
  return m ? `${Number(m[1]) + 1911}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}` : '';
};
// A notice (the list's row, its words if read) → TDX's News row.
export function tbNewsRow(r, d = null) {
  const at = rocDay(r.time) ? `${rocDay(r.time)}T00:00:00+08:00` : null;
  const words = String(d?.content || r.title || '').replace(/\r\n?/g, '\n').trim();
  return { NewsID: `tb${r.id}`, Title: { Zh_tw: String(r.title || '').replace(/\s*\r?\n\s*/g, ' ').trim() }, Description: words, NewsCategory: 2, PublishTime: at, StartTime: at, NewsURL: d?.url || `https://www.taiwanbus.tw/eBUSPage/NewsD.aspx?td=${r.id}&lan=C`, Department: r.name || '' };
}
let tbWords = Promise.resolve();
async function tbNoticeFree(path, q, { fetchFn, now }) {
  if (!TB_NOTICE.test(path)) return undefined;
  if ([...q.keys()].some(k => k !== '$format')) return null;
  const tbGet = async (qs, ms) => {
    const res = await fetchFn(`${TB_NEWS}?${qs}`, { signal: AbortSignal.timeout?.(ms) });
    if (!res.ok) throw new Error(`公路局 news ${res.status}`);
    return res.json();
  };
  const list = await held('tb:news', 5 * MIN, 2 * HOUR, async () => {
    const j = await tbGet(`type=2&key=${TB_NEWS_TYPES.join(',')}&data=&lan=C`, 10_000);
    if (!Array.isArray(j)) throw new Error('公路局 news: not a list');
    return j.filter(r => TB_NEWS_TYPES.includes(r?.type) && r.id != null);
  }, now, 3000);
  const want = list.val.filter(r => !kept.has(`tb:news:${r.id}`));
  // (The words not read yet: four at a time, one line of reads in all.)
  const reads = [];
  for (let i = 0; i < want.length; i += 4) {
    const batch = want.slice(i, i + 4);
    tbWords = tbWords.then(() => Promise.all(batch.map(r => held(`tb:news:${r.id}`, 30 * DAY, 30 * DAY, () => tbGet(`type=3&key=${encodeURIComponent(r.id)}`, 8000), now, 8000).catch(() => null))));
    reads.push(tbWords);
  }
  if (reads.length) await Promise.race([Promise.all(reads), new Promise(r => setTimeout(r, 4000))]);
  const rows = list.val.map(r => tbNewsRow(r, kept.get(`tb:news:${r.id}`)?.val));
  return { status: 200, body: JSON.stringify(rows), age: Math.max(0, now - list.at), state: 'free' };
}

// The cities whose buses a free source reads (TDX's city names).
export const FREE_BUS = /^(Hsinchu|HsinchuCounty|InterCity|Taipei|NewTaipei|Taichung|Taoyuan|Tainan|Keelung|MiaoliCounty|ChanghuaCounty|NantouCounty|YunlinCounty|ChiayiCounty|Chiayi|PingtungCounty|YilanCounty|HualienCounty|TaitungCounty|PenghuCounty)$/;
const MAX_STOPS = 30;
const MAX_ROUTES = 12;

// /transit/eta's stops or routes from the free sources → { rows, missing: { stops, routes }, age }.
// What a source doesn't know (a 公路客運 stop far from 新竹) is left for TDX.
export async function freeEta(city, { stops = [], routes = [] }, { fetchFn = fetch, now = Date.now(), env = null } = {}) {
  if (!FREE_BUS.test(city)) return null;
  const deps = { fetchFn, now, env };
  if (EBUS[city]) return ebRead(city, { stops, routes }, ebDeps(deps));
  if (city === 'Tainan') return tnRead({ stops, routes }, ebDeps(deps));
  if (CITY_FEEDS[city]) {
    const got = await cityEtaIndex(city, deps).catch(() => null);
    if (!got) return { rows: [], missing: { stops, routes }, age: 0 };
    const rows = [...stops.flatMap(u => got.rows.byStop.get(u) || []), ...routes.flatMap(u => got.rows.byRoute.get(u) || [])];
    // (Nothing at all of what was asked in a whole city's list: ids not the feed's, TDX's to answer.)
    if (!rows.length && (stops.length || routes.length) > 0) return { rows: [], missing: { stops, routes }, age: 0 };
    return { rows, missing: { stops: [], routes: [] }, age: Math.max(0, now - got.at) };
  }
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
  // (What 新竹's site doesn't know, and the counties': 公路局's.)
  if (TB_CITIES[city] && (missing.stops.length || missing.routes.length)) {
    const tb = await tbEta(city, missing, deps).catch(() => null);
    if (tb) {
      rows.push(...tb.rows);
      if (tb.rows.length) oldest = Math.min(oldest, now - tb.age);
      return { rows, missing: tb.missing, age: Math.max(0, now - oldest) };
    }
  }
  return { rows, missing, age: Math.max(0, now - oldest) };
}

// /transit/gps's routes → { rows, missing, age }.
export async function freeGps(city, routes, { fetchFn = fetch, now = Date.now(), env = null } = {}) {
  if (!FREE_BUS.test(city)) return null;
  const deps = { fetchFn, now, env };
  if (EBUS[city]) return ebBuses(city, routes, ebDeps(deps));
  if (city === 'Tainan') return tnBuses(routes, ebDeps(deps));
  if (CITY_FEEDS[city]) {
    const got = CITY_FEEDS[city].bus ? await cityGpsList(city, deps).catch(() => null) : null;
    if (!got) return { rows: [], missing: routes, age: 0 };
    const want = new Set(routes);
    return { rows: got.val.filter(b => want.has(b.RouteUID)), missing: [], age: Math.max(0, now - got.at) };
  }
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
  if (TB_CITIES[city] && missing.length) {
    const tb = await tbGps(city, missing, deps).catch(() => null);
    if (tb) {
      rows.push(...tb.rows);
      if (tb.rows.length) oldest = Math.min(oldest, now - tb.age);
      return { rows, missing: tb.missing, age: Math.max(0, now - oldest) };
    }
  }
  return { rows, missing, age: Math.max(0, now - oldest) };
}

// ---- 台鐵's day: 台鐵's own open data -------------------------------------------------------
//
// 台鐵's 鐵路時刻表 (ods.railway.gov.tw: a JSON file a day, today's and the
// next 59 days', each listed on one page, 2 MB; the day's own changes in it,
// updated daily) and its 車站基本資料集 (each station's names), made TDX's
// day as the proxy trims it (transit.js tdxTrim: what Transit's rail.mjs
// traTrips reads), so 台鐵's 4.4 MB a read no longer comes from TDX (a
// point each 150 MB: the free tier's month in a few weeks of one person's
// trips). Read in the Runner (freeHeavy), kept there and at the edge.
export const TRA_LIST = 'https://ods.railway.gov.tw/tra-ods-web/ods/download/dataResource/railway_schedule/JSON/list';
export const TRA_STATIONS = 'https://ods.railway.gov.tw/tra-ods-web/ods/download/dataResource/0518b833e8964d53bfea3f7691aea0ee';
const TRA_FILE = 'https://ods.railway.gov.tw/tra-ods-web/ods/download/dataResource/exceptionDataResource/';
const TRA_FRESH = 6 * 3_600_000;
// A train's class (台鐵's CarClass, TDX's TrainTypeID) → TDX's TrainTypeCode
// and its names (TDX's TrainType list, 2026-11-10). A class not here: TDX
// answers that day (a new class is rare: a new train set).
export const TRA_TYPES = {
  '1100': ['3', '自強(DMU2800、2900、3000 型柴聯及 EMU 型電車)', 'Tze-Chiang Express'], '1101': ['1', '太魯閣(太魯閣)', 'Taroko Express'], '1102': ['3', '自強(推拉式自強號)', 'Tze-Chiang Express'],
  '1103': ['3', '自強(DMU3100 型有身障座位柴聯)', 'Tze-Chiang Express'], '1104': ['3', '自強(專開列車)', 'Tze-Chiang Express'], '1105': ['3', '自強(郵輪式列車)', 'Tze-Chiang Express'],
  '1106': ['3', '自強(商務專開列車)', 'Tze-Chiang Express'], '1107': ['2', '普悠瑪(普悠瑪)', 'Puyuma Express'], '1108': ['3', '自強(推拉式自強號且無自行車車廂)', 'Tze-Chiang Express'],
  '1109': ['3', '自強(推拉式自強號且無自行車車廂)', 'Tze-Chiang Express'], '110A': ['3', '自強(推拉式自強號且有自行車車廂)', 'Tze-Chiang Express'], '110B': ['3', '自強(EMU1200 型電車)', 'Tze-Chiang Express'],
  '110C': ['3', '自強(EMU300 型電車)', 'Tze-Chiang Express'], '110D': ['3', '自強(DMU2800 型柴聯)', 'Tze-Chiang Express'], '110E': ['3', '自強(DMU2900 型柴聯)', 'Tze-Chiang Express'],
  '110F': ['3', '自強(DMU3100 型柴聯)', 'Tze-Chiang Express'], '110G': ['11', '自強(3000)(EMU3000 型電車)', 'Tze-Chiang 3000 Express '], '110H': ['11', '自強(3000)(EMU3000 型電車)', 'Tze-Chiang 3000 Express '],
  '110K': ['11', '自強(3000)(EMU3000 型電車)', 'Tze-Chiang 3000 Express '], '110M': ['11', '自強(3000)(EMU3000 型電車)', 'Tze-Chiang 3000 Express '], '1110': ['4', '莒光(無身障座位)', 'Chu-Kuang Express'],
  '1111': ['4', '莒光(有身障座位)', 'Chu-Kuang Express'], '1112': ['4', '莒光(專開列車)', 'Chu-Kuang Express'], '1113': ['4', '莒光(郵輪式列車)', 'Chu-Kuang Express'],
  '1114': ['4', '莒光(無身障座位, 有自行車車廂)', 'Chu-Kuang Express'], '1115': ['4', '莒光(有身障座位, 有自行車車廂)', 'Chu-Kuang Express'], '1120': ['5', '復興', 'Fu-Hsing Semi Express'],
  '1121': ['5', '復興(專開列車)', 'Fu-Hsing Semi Express'], '1122': ['5', '復興(郵輪式列車)', 'Fu-Hsing Semi Express'], '1130': ['6', '區間(專開列車)', 'Local Train'],
  '1131': ['6', '區間', 'Local Train'], '1132': ['10', '區間快', 'Fast Local Train'], '1133': ['6', '區間(郵輪式列車)', 'Local Train'],
  '1134': ['6', '區間(專開列車)', 'Local Train'], '1135': ['6', '區間(有身障座位, 有自行車車廂)', 'Local Train'], '113A': ['6', '區間(EMU500 型)', 'Local Train'],
  '113B': ['6', '區間(EMU700 型)', 'Local Train'], '113C': ['6', '區間(EMU800 型)', 'Local Train'], '113D': ['6', '區間(EMU900 型)', 'Local Train'],
  '1140': ['7', '普快', 'Ordinary Train'], '1141': ['6', '區間', 'Local Train'], '1150': ['7', '普快(專開列車)', 'Ordinary Train'],
  '1151': ['7', '普快', 'Ordinary Train'], '1152': ['5', '復興', 'Fu-Hsing Semi Express'], '1154': ['6', '區間(專開列車)', 'Local Train'],
  '1155': ['5', '復興(郵輪式列車)', 'Fu-Hsing Semi Express'], '1270': ['7', '普快', 'Ordinary Train'], '1280': ['7', '普快', 'Ordinary Train'],
  '1281': ['7', '普快', 'Ordinary Train'], '1282': ['7', '普快', 'Ordinary Train'], '12A0': ['7', '普快', 'Ordinary Train'],
  '12A1': ['7', '普快', 'Ordinary Train'], '12B0': ['7', '普快', 'Ordinary Train'], '4200': ['7', '普快', 'Ordinary Train'],
  '5230': ['7', '普快', 'Ordinary Train']
};

// 台鐵's day list page → { '2026-11-10': fileId }.
export function traDays(html) {
  const out = {};
  for (const m of String(html || '').matchAll(/exceptionDataResource\/([0-9a-f]{16,40})"[^>]*>\s*(\d{4})(\d{2})(\d{2})\.json/g)) out[`${m[2]}-${m[3]}-${m[4]}`] = m[1];
  return out;
}
// '19:48:30' → '19:48' (TDX's minute).
const hm = t => String(t || '').slice(0, 5);
// 台鐵's day (its file), its stations (StationID → [zh, en]) and the date →
// TDX's DailyTrainTimetable as tdxTrim leaves it, or null (a class or a
// station it can't name: TDX's to answer).
export function traDay(ods, names, date) {
  const trains = [];
  for (const t of ods?.TrainInfos || []) {
    const type = TRA_TYPES[t.CarClass];
    const stops = (t.TimeInfos || []).slice().sort((a, b) => Number(a.Order) - Number(b.Order));
    const end = names[stops.at(-1)?.Station];
    if (!type || !end || stops.length < 2) return null;
    const info = { TrainNo: String(t.Train), TrainTypeCode: type[0], TrainTypeName: { Zh_tw: type[1], En: type[2] }, TripHeadSign: `往${end[0]}`, EndingStationName: { Zh_tw: end[0], En: end[1] }, TripLine: Number(t.Line) || 0, Note: String(t.Note || ''), BikeFlag: t.Bike === 'Y' ? 1 : 0 };
    trains.push({ TrainInfo: info, StopTimes: stops.map(s => ({ StationID: String(s.Station), ArrivalTime: hm(s.ARRTime || s.DEPTime), DepartureTime: hm(s.DEPTime || s.ARRTime) })) });
  }
  return trains.length ? { TrainDate: date, TrainTimetables: trains } : null;
}
// 台鐵's stations' list → { StationID: [zh, en] }.
export const traNames = list => Object.fromEntries((Array.isArray(list) ? list : []).filter(s => s?.stationCode).map(s => [String(s.stationCode), [String(s.stationName || s.name || ''), String(s.stationEName || s.ename || '')]]));

const TRA_DAY = /^basic\/v3\/Rail\/TRA\/DailyTrainTimetable\/TrainDate\/(\d{4}-\d{2}-\d{2})$/;
async function traFree(path, q, { fetchFn, now }) {
  const m = path.match(TRA_DAY);
  if (!m) return undefined;
  if (q.has('$filter') || q.has('$select') || q.has('$top') || q.has('$skip') || q.has('$orderby')) return null;
  const date = m[1];
  const text = s => (r => (r.ok ? r.text() : Promise.reject(new Error(`tra ${r.status}`))))(s);
  const ask = url => fetchFn(url, { headers: { Accept: '*/*' }, signal: AbortSignal.timeout?.(15_000) });
  const days = await held('tra:list', TRA_FRESH, 2 * 86_400_000, async () => traDays(await text(await ask(TRA_LIST))), now, 4000);
  const id = days.val[date];
  if (!id) return null;
  const names = await held('tra:names', 7 * 86_400_000, 30 * 86_400_000, async () => traNames(JSON.parse(await text(await ask(TRA_STATIONS)))), now, 4000);
  const day = await held(`tra:day:${id}`, TRA_FRESH, 2 * 86_400_000, async () => {
    const got = traDay(JSON.parse(await text(await ask(`${TRA_FILE}${id}`))), names.val, date);
    if (!got) throw new Error(`tra ${date}: a class or station not known`);
    return JSON.stringify(got);
  }, now, 8000);
  return { status: 200, body: day.val, age: Math.max(0, now - day.at), state: 'free' };
}

// ---- 高鐵's day, from TDX's GTFS ------------------------------------------------------------

// THSR's trains for the four weeks TDX's GTFS covers (0 points), written to
// R2 each week by the bus build (tools/gtfs-buses.mjs: rail/thsr.json,
// builders/gtfs.js hsrPack), a day of them in TDX's DailyTimetable shape as
// tdxTrim keeps it (2026-11-11 and 14, against TDX's own: every train, stop
// for stop). A day the pack hasn't, TDX's.
const HSR_DAY = /^basic\/v2\/Rail\/THSR\/DailyTimetable\/TrainDate\/(\d{4}-\d{2}-\d{2})$/;
export const HSR_PACK = 'rail/thsr.json';
export function hsrDay(pack, date) {
  const list = pack?.days?.[date];
  if (!Array.isArray(list) || !list.length) return null;
  return list
    .map(i => pack.trains[i])
    .filter(t => t?.[1]?.length > 1)
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([no, stops]) => {
      const n = pack.stations?.[stops.at(-1)[0]] || ['', ''];
      return { TrainDate: date, DailyTrainInfo: { TrainNo: no, EndingStationName: { Zh_tw: n[0], En: n[1] }, Note: {} }, StopTimes: stops.map(([id, a, d]) => ({ StationID: id, ArrivalTime: a, DepartureTime: d })) };
    });
}
async function hsrFree(path, q, { env, now }) {
  const m = path.match(HSR_DAY);
  if (!m) return undefined;
  if (!env?.DATA || q.has('$filter') || q.has('$select') || q.has('$top') || q.has('$skip') || q.has('$orderby')) return null;
  const pack = await held('hsr:pack', TRA_FRESH, 7 * 86_400_000, async () => {
    const obj = await env.DATA.get(HSR_PACK);
    if (!obj) throw new Error('no thsr pack');
    return JSON.parse(await obj.text());
  }, now, 3000);
  const day = hsrDay(pack.val, m[1]);
  return day ? { status: 200, body: JSON.stringify(day), age: Math.max(0, now - pack.at), state: 'free' } : null;
}

// ---- The metros' maps and timetables ------------------------------------------------------

// Each system's stations, lines, exits, headways and station timetables, as
// TDX answered them, copied to R2 by the weekly build (tools/gtfs-buses.mjs:
// asked again when TDX's GTFS says a system changed, else a month on;
// builders/gtfs.js METRO_KINDS). Asked as Orbit Transit asks: whole, with
// `$select`, or a station's timetable by `$filter=StationID eq '…'`. Not
// copied (live boards, notices, any other ask): TDX's.
const METRO_ASK = /^basic\/v2\/Rail\/Metro\/(Station|StationOfLine|Line|StationOfRoute|LineTransfer|StationExit|Frequency|S2STravelTime|StationTimeTable)\/([A-Z]+)$/;
const METRO_STATION = /^StationID eq '([A-Za-z0-9-]+)'$/;
export function metroFile(path, q) {
  const m = path.match(METRO_ASK);
  if (!m) return undefined;
  const [, kind, sys] = m;
  const keys = [...q.keys()].filter(k => k !== '$format');
  if (kind === 'StationTimeTable') {
    const f = keys.length === 1 && keys[0] === '$filter' && METRO_STATION.exec(q.get('$filter'));
    return f ? { file: `rail/metro/${sys}/StationTimeTable/${f[1]}.json`, select: '' } : null;
  }
  if (keys.some(k => k !== '$select')) return null;
  const select = (q.get('$select') || '').split(',').map(s => s.trim()).filter(Boolean);
  if (select.some(s => !/^[A-Za-z]+$/.test(s))) return null;
  return { file: `rail/metro/${sys}/${kind}.json`, select: select.join(',') };
}
async function metroFree(path, q, { env, now }) {
  const ask = metroFile(path, q);
  if (!ask || !env?.DATA) return ask === undefined ? undefined : null;
  const got = await held(`metro:${ask.file}|${ask.select}`, TRA_FRESH, 7 * 86_400_000, async () => {
    const obj = await env.DATA.get(ask.file);
    if (!obj) throw new Error('not copied');
    const text = await obj.text();
    if (!ask.select) return text;
    const want = ask.select.split(',');
    return JSON.stringify(JSON.parse(text).map(r => Object.fromEntries(want.filter(k => k in r).map(k => [k, r[k]]))));
  }, now, 3000);
  return { status: 200, body: got.val, age: Math.max(0, now - got.at), state: 'free' };
}

// ---- 臺北捷運's trains coming in now --------------------------------------------------------

// TDX's TRTC LiveBoard is 臺北捷運's own open file (a row a train coming into a
// station: where, toward where, when, each 30 s; its minutes always 0), read
// here and put in TDX's shape by the lines' stations in R2 (StationOfLine,
// Line). 環狀線 (新北's) isn't in it. Whole, by `$filter=StationID eq '…'`, `$top`.
export const TRTC_LIVE = 'https://tcgmetro.blob.core.windows.net/stationnames/stations.json';
const TRTC_ASK = /^basic\/v2\/Rail\/Metro\/LiveBoard\/TRTC$/;
const TRTC_FRESH = 10_000;
const TRTC_OLD = 3 * MIN; // (a row this old: that train gone)
// (A name as the file writes it, 「台北車站」, else without its 站: 「忠孝復興站」.)
const stationsOf = (at, s) => at.get(String(s || '').trim()) || at.get(String(s || '').trim().replace(/站$/, '')) || [];
// The file's rows → TDX's. A row's line is the one through both its stations
// (忠孝復興 toward 南港展覽館 on either: 文湖線's, the later listed, as TDX's own board).
export function trtcRows(list, lines, names = [], now = Date.now()) {
  const at = new Map();
  for (const l of Array.isArray(lines) ? lines : []) for (const s of l.Stations || []) at.set(s.StationName?.Zh_tw, [...(at.get(s.StationName?.Zh_tw) || []), { l, s }]);
  const lineName = Object.fromEntries((Array.isArray(names) ? names : []).map(l => [l.LineID, l.LineName]));
  const out = [];
  for (const r of Array.isArray(list) ? list : []) {
    const m = /^(\d{4})(\d\d)(\d\d)(\d\d)(\d\d)(\d\d)$/.exec(String(r?.UpdateTime || ''));
    const src = m && `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}+08:00`;
    if (!src || !(now - Date.parse(src) < TRTC_OLD)) continue;
    const to = stationsOf(at, r.Destination);
    const h = stationsOf(at, r.Station).filter(x => to.some(t => t.l === x.l)).at(-1);
    if (!h) continue;
    const t = to.find(x => x.l === h.l).s;
    out.push({ LineNO: h.l.LineNo || h.l.LineID, LineID: h.l.LineID, LineName: lineName[h.l.LineID] || { Zh_tw: '', En: '' }, StationID: h.s.StationID, StationName: h.s.StationName, TripHeadSign: `往${t.StationName.Zh_tw}`, DestinationStaionID: t.StationID, DestinationStationID: t.StationID, DestinationStationName: t.StationName, ServiceStatus: 0, EstimateTime: 0, SrcUpdateTime: src, UpdateTime: twNow(now) });
  }
  return out;
}
async function trtcFree(path, q, { fetchFn, env, now }) {
  if (!TRTC_ASK.test(path) || !env?.DATA) return undefined;
  const keys = [...q.keys()].filter(k => k !== '$format');
  const one = q.has('$filter') && METRO_STATION.exec(q.get('$filter'));
  const top = q.has('$top') ? Number(q.get('$top')) : Infinity;
  if (keys.some(k => k !== '$filter' && k !== '$top') || (q.has('$filter') && !one) || !(top >= 0)) return null;
  const map = await held('trtc:lines', TRA_FRESH, 7 * DAY, async () => {
    const read = async f => JSON.parse((await (await env.DATA.get(`rail/metro/TRTC/${f}.json`))?.text()) || 'null');
    const [lines, names] = await Promise.all([read('StationOfLine'), read('Line')]);
    if (!lines?.length) throw new Error('not copied');
    return { lines, names };
  }, now, 3000);
  const got = await held('trtc:live', TRTC_FRESH, 2 * MIN, async () => {
    const res = await fetchFn(TRTC_LIVE, { signal: AbortSignal.timeout?.(5000) });
    if (!res.ok) throw new Error(`TRTC ${res.status}`);
    const list = JSON.parse((await res.text()).replace(/^\uFEFF/, ''));
    if (!Array.isArray(list)) throw new Error('TRTC: not a list');
    return trtcRows(list, map.val.lines, map.val.names, now);
  }, now);
  const rows = got.val.filter(r => !one || r.StationID === one[1]);
  return { status: 200, body: JSON.stringify(rows.slice(0, top)), age: Math.max(0, now - got.at), state: 'free' };
}

// ---- 高雄捷運's and 輕軌's next trains -------------------------------------------------------

// TDX's KRTC and KLRT LiveBoards, a station at a time, from KRTC's own 高捷e遊行
// (easygo.krtc.com.tw: a station's next trains each way in minutes, a form
// post a station): its page read once an hour for the form (each station's
// post, ASP.NET's view state), then one post a station asked, kept 20 s.
// A whole system's board (77 posts) is TDX's still.
export const KRTC_EASYGO = 'https://easygo.krtc.com.tw/main2.aspx';
const KRTC_ASK = /^basic\/v2\/Rail\/Metro\/LiveBoard\/(KRTC|KLRT)$/;
const KRTC_FRESH = 20_000;
// (Each column's sign, the end its trains go to.)
const KRTC_TO = { RK1: 'RK1', R3: 'R3', O1: 'O1', 'station-oline-Daliao': 'OT1' };
const KLRT_WAYS = ['順行方向', '逆行方向'];
const cellText = c => c.replace(/<[^>]*>|&nbsp;/g, ' ').replace(/\s+/g, '');
const minsOf = t => (/^\d{1,3}$/.test(t) ? Number(t) : /進站/.test(t) ? 0 : null);
// The page's form: { at: { R16: '10', O5R10: '16', … }, fields }.
export function easygoForm(html) {
  const at = Object.fromEntries([...String(html).matchAll(/imgmapRoute','(\d+)'\)" title="([A-Z0-9]+)"/g)].map(m => [m[2], m[1]]));
  const val = n => (String(html).match(new RegExp(`id="${n}" value="([^"]*)"`)) || [])[1];
  const fields = { __VIEWSTATE: val('__VIEWSTATE'), __VIEWSTATEGENERATOR: val('__VIEWSTATEGENERATOR'), __EVENTVALIDATION: val('__EVENTVALIDATION') };
  return Object.keys(at).length && fields.__VIEWSTATE && fields.__EVENTVALIDATION ? { at, fields } : null;
}
// A station's page → TDX's rows (the next train each way; a column's two
// platforms to one end, the sooner), `lines`: the systems' StationOfLine and Line.
export function easygoRows(html, lines, now = Date.now()) {
  const out = [];
  for (const [, kind, panel] of String(html).matchAll(/id="ctl00_ContentPlaceHolder1_panel([ROC])Line"([\s\S]*?)<\/table>/g)) {
    const sys = kind === 'C' ? 'KLRT' : 'KRTC';
    const id = (panel.match(/class="StationNo">\s*([A-Z0-9]+)\s*</) || [])[1];
    const st = lines[sys]?.at.get(id);
    if (!st) continue;
    const signs = [...panel.matchAll(/src="Images\/point\/([^".]+)\.png"/gi)].map(m => m[1]);
    const next = [...(panel.match(/<tr class="tr2">([\s\S]*?)<\/tr>/) || ['', ''])[1].matchAll(/DisplayMRTInfo[^>]*>([\s\S]*?)<\/td>/g)].map(m => minsOf(cellText(m[1])));
    const said = (String(html).match(/最後更新時間:\s*(\d{4}-\d\d-\d\d) (\d\d:\d\d:\d\d)/) || []).slice(1);
    const src = kind === 'C' && said.length ? `${said[0]}T${said[1]}+08:00` : twNow(now);
    const soon = new Map();
    next.forEach((min, i) => {
      const to = kind === 'C' ? 'C1' : KRTC_TO[signs[i]];
      const k = kind === 'C' ? KLRT_WAYS[i] : to;
      if (min == null || !to || !k || (soon.has(k) && soon.get(k).min <= min)) return;
      soon.set(k, { min, to });
    });
    for (const [k, { min, to }] of soon) {
      const dest = lines[sys].at.get(to);
      if (!dest) continue;
      out.push({ ...(kind === 'C' ? {} : { LineNO: st.line.LineID }), LineID: st.line.LineID, LineName: lines[sys].names[st.line.LineID] || { Zh_tw: '' }, StationID: id, StationName: st.s.StationName, TripHeadSign: kind === 'C' ? k : `往${dest.s.StationName.Zh_tw}`, DestinationStaionID: to, DestinationStationID: to, DestinationStationName: dest.s.StationName, ServiceStatus: 0, EstimateTime: min, SrcUpdateTime: src, UpdateTime: twNow(now) });
    }
  }
  return out;
}
async function krtcFree(path, q, { fetchFn, env, now }) {
  const m = KRTC_ASK.exec(path);
  if (!m || !env?.DATA) return undefined;
  const one = [...q.keys()].every(k => k === '$filter' || k === '$format') && METRO_STATION.exec(q.get('$filter') || '');
  if (!one) return null;
  const lines = (await held('krtc:lines', TRA_FRESH, 7 * DAY, async () => {
    const read = async f => JSON.parse((await (await env.DATA.get(`rail/metro/${f}.json`))?.text()) || 'null');
    const out = {};
    for (const sys of ['KRTC', 'KLRT']) {
      const [sol, names] = await Promise.all([read(`${sys}/StationOfLine`), read(`${sys}/Line`)]);
      if (!sol?.length) throw new Error('not copied');
      out[sys] = { at: new Map(sol.flatMap(line => (line.Stations || []).map(s => [s.StationID, { line, s }]))), names: Object.fromEntries((names || []).map(l => [l.LineID, l.LineName])) };
    }
    return out;
  }, now, 3000)).val;
  if (!lines[m[1]].at.has(one[1])) return null;
  const form = await held('krtc:form', 3_600_000, 6 * 3_600_000, async () => {
    const res = await fetchFn(`${KRTC_EASYGO}?t=${Math.floor(now / 3_600_000)}`, { signal: AbortSignal.timeout?.(8000) });
    const f = res.ok ? easygoForm(await res.text()) : null;
    if (!f) throw new Error(`easygo form ${res.status}`);
    return f;
  }, now, 3000);
  const title = Object.keys(form.val.at).find(t => t.match(/[A-Z]+\d+A?/g).includes(one[1]));
  if (!title) return null;
  const got = await held(`krtc:${title}`, KRTC_FRESH, 2 * MIN, async () => {
    const body = new URLSearchParams({ __EVENTTARGET: 'ctl00$ContentPlaceHolder1$imgmapRoute', __EVENTARGUMENT: form.val.at[title], ...form.val.fields });
    const res = await fetchFn(KRTC_EASYGO, { method: 'POST', body, headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, signal: AbortSignal.timeout?.(6000) });
    const html = res.ok ? await res.text() : '';
    // (No board: the form gone stale, read again for the next ask.)
    if (!/class="StationNo"/.test(html)) throw (kept.delete('krtc:form'), new Error(`easygo ${res.status}`));
    return easygoRows(html, lines, now);
  }, now);
  const rows = got.val.filter(r => r.StationID === one[1]);
  return { status: 200, body: JSON.stringify(rows), age: Math.max(0, now - got.at), state: 'free' };
}

// ---- 桃園機場捷運's next trains ------------------------------------------------------------

// TDX's TYMC LiveBoard from 桃園捷運's own platform screens (its site's
// PIDS_cache.php: every station's platforms, their next trains to the
// second, one file for the line): each train a row, by when it leaves its
// first station and reaches the others; the whole line or a station.
export const TYMC_PIDS = 'https://www.tymetro.com.tw/tymetro-new/tw/_pages/travel-guide/PIDS_cache.php';
const TYMC_ASK = /^basic\/v2\/Rail\/Metro\/LiveBoard\/TYMC$/;
const tymcId = s => String(s || '').replace(/^A0(\d)$/, 'A$1').replace(/^A14A$/, 'A14a');
export function tymcRows(pids, lines, names = [], now = Date.now()) {
  const at = new Map((Array.isArray(lines) ? lines : []).flatMap(line => (line.Stations || []).map(s => [s.StationID, { line, s }])));
  const lineName = Object.fromEntries((Array.isArray(names) ? names : []).map(l => [l.LineID, l.LineName]));
  const said = Date.parse(pids?.SystemDateTime || '');
  if (!Number.isFinite(said)) return [];
  const late = Math.max(0, (now - said) / 1000);
  const out = [];
  for (const [key, trains] of Object.entries(pids || {})) {
    if (!Array.isArray(trains) || !/^A\d+a?_PL\d$/.test(key)) continue;
    for (const t of trains) {
      const here = at.get(tymcId(t?.Station)), to = at.get(tymcId(t?.EndStation));
      const sec = Number(t?.EventType === 'D' ? t.EstDepartureCountdown : t?.EstArrivalCountdown);
      if (!here || !to || here === to || t.TrainStatus === 'OOS' || t.nonstop !== 'stop' || t.EstArrivalCountdown === '' || !Number.isFinite(sec)) continue;
      out.push({ LineNO: here.line.LineNo || here.line.LineID, LineID: here.line.LineID, LineName: lineName[here.line.LineID] || { Zh_tw: '' }, StationID: here.s.StationID, StationName: here.s.StationName, TripHeadSign: `往${to.s.StationName.Zh_tw}`, DestinationStaionID: to.s.StationID, DestinationStationID: to.s.StationID, DestinationStationName: to.s.StationName, ServiceStatus: 0, EstimateTime: Math.floor(Math.max(0, sec - late) / 60), SrcUpdateTime: twNow(said), UpdateTime: twNow(now) });
    }
  }
  const order = s => at.get(s)?.s.Sequence ?? 99;
  return out.sort((a, b) => order(a.StationID) - order(b.StationID) || a.EstimateTime - b.EstimateTime);
}
async function tymcFree(path, q, { fetchFn, env, now }) {
  if (!TYMC_ASK.test(path) || !env?.DATA) return undefined;
  const keys = [...q.keys()].filter(k => k !== '$format');
  const one = q.has('$filter') && METRO_STATION.exec(q.get('$filter'));
  if (keys.some(k => k !== '$filter') || (q.has('$filter') && !one)) return null;
  const map = (await held('tymc:lines', TRA_FRESH, 7 * DAY, async () => {
    const read = async f => JSON.parse((await (await env.DATA.get(`rail/metro/TYMC/${f}.json`))?.text()) || 'null');
    const [lines, names] = await Promise.all([read('StationOfLine'), read('Line')]);
    if (!lines?.length) throw new Error('not copied');
    return { lines, names };
  }, now, 3000)).val;
  const got = await held('tymc:live', KRTC_FRESH, 2 * MIN, async () => {
    const res = await fetchFn(TYMC_PIDS, { signal: AbortSignal.timeout?.(6000) });
    if (!res.ok) throw new Error(`TYMC ${res.status}`);
    const rows = tymcRows(await res.json(), map.lines, map.names, now);
    if (!rows.length) throw new Error('TYMC: no trains');
    return rows;
  }, now);
  const rows = got.val.filter(r => !one || r.StationID === one[1]);
  return { status: 200, body: JSON.stringify(rows), age: Math.max(0, now - got.at), state: 'free' };
}

// ---- 台鐵's notices -------------------------------------------------------------------------

// TDX's TRA Alert is 台鐵's 路線運行狀態 (railway.gov.tw tip711/blockList:
// each line's state and its blocked stretches, a row each: 日期, 線段, 受阻原因,
// 預計通行時間). Every line running whole (the most of the time) is answered
// as TDX words it; a line with stretches listed, a notice of them as TDX
// writes its Description (「八斗子 <--> 菁桐 : …」, each stretch a block); a
// page it can't read whole, TDX's.
export const TRA_BLOCKS = 'https://www.railway.gov.tw/tra-tip-web/tip/tip007/tip711/blockList';
const TRA_ALERT = /^basic\/v3\/Rail\/TRA\/Alert$/;
// The page → TDX's answer when every line runs whole, else null.
export function traAllClear(html) {
  const lines = [...String(html).matchAll(/<dl class="now_status">([\s\S]*?)<\/dl>\s*<table[^>]*>([\s\S]*?)<\/table>/g)];
  if (lines.length < 8 || lines.some(([, head, table]) => !/<label>全線正常運行<\/label>/.test(head) || /<tr/i.test(table))) return null;
  const [, d, t] = String(html).match(/更新時間：\s*(\d{4}\/\d\d\/\d\d)\s+(\d\d:\d\d)/) || [];
  return { Alerts: [{ Title: '全線營運正常', Status: 1, UpdateTime: d ? `${d.replace(/\//g, '-')}T${t}:00+08:00` : null }] };
}
const pageText = h =>
  String(h)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .trim();
// The page → TDX's Alerts: every line whole (traAllClear's), else a notice
// a line with its stretches; null when it can't be read whole.
export function traAlerts(html) {
  const clear = traAllClear(html);
  if (clear) return clear;
  const s = String(html);
  const lines = [...s.matchAll(/<dl class="now_status">([\s\S]*?)<\/dl>\s*<table[^>]*>([\s\S]*?)<\/table>/g)];
  if (lines.length < 8) return null;
  const [, d, t] = s.match(/更新時間：\s*(\d{4}\/\d\d\/\d\d)\s+(\d\d:\d\d)/) || [];
  const at = d ? `${d.replace(/\//g, '-')}T${t}:00+08:00` : null;
  const out = [];
  for (const [, head, table] of lines) {
    const name = pageText((/<dt>([\s\S]*?)<\/dt>/.exec(head) || [])[1] || '');
    const state = pageText((/<label>([\s\S]*?)<\/label>/.exec(head) || [])[1] || '');
    const rows = [...table.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map(r => [...r[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(c => pageText(c[1]))).filter(c => c.length);
    if (!rows.length && state === '全線正常運行') continue;
    // (A line said not whole with no stretch listed, or a row not of four: not read whole.)
    if (!name || !rows.length || rows.some(c => c.length < 3)) return null;
    const blocks = rows.map(([day, seg, why, until]) => {
      const ends = seg.split(/\s*(?:<-+>|<->|[-－~～─—至↔]+)\s*/).filter(Boolean);
      const head = ends.length === 2 ? `${ends[0]} <--> ${ends[1]} : ` : seg ? `${seg} : ` : '';
      return `${head}${why}${until ? `\n預計通行時間：${until}` : ''}${day && !/\d{1,2}[:：]\d{2}/.test(why) ? `\n（${day}）` : ''}`;
    });
    out.push({ AlertID: `tra-${name}`, Title: `${name}${state && state !== '全線正常運行' ? `：${state}` : ''}`, Description: blocks.join('\n'), Status: 2, UpdateTime: at, Scope: {} });
  }
  return out.length ? { Alerts: out } : null;
}
async function traAlertFree(path, q, { fetchFn, now }) {
  if (!TRA_ALERT.test(path)) return undefined;
  if ([...q.keys()].some(k => k !== '$format')) return null;
  const got = await held('tra:alert', 5 * MIN, 30 * MIN, async () => {
    const res = await fetchFn(TRA_BLOCKS, { signal: AbortSignal.timeout?.(8000) });
    if (!res.ok) throw new Error(`TRA blocks ${res.status}`);
    const all = traAlerts(await res.text());
    return all ? JSON.stringify(all) : null;
  }, now, 3000);
  return got.val == null ? null : { status: 200, body: got.val, age: Math.max(0, now - got.at), state: 'free' };
}

// ---- 高鐵's and the metros' state ----------------------------------------------------------

// TDX's THSR AlertInfo from 高鐵's own 列車運行狀況 (the header every page of
// thsrc.com.tw carries: 「全線正常營運」, else its warning and words).
export const THSR_STATE = 'https://www.thsrc.com.tw/ArticleContent/f7f05113-cd27-4dd9-8edc-014f4e920212/index.html';
const THSR_ALERT = /^basic\/v2\/Rail\/THSR\/AlertInfo$/;
// The page → TDX's AlertInfo list, or null when it isn't the page we know.
export function thsrAlertOf(html, now = Date.now()) {
  const s = String(html);
  const head = /<div class="alert-text"[^>]*>([\s\S]*?)<\/div>/.exec(s);
  const title = head ? pageText(head[1]) : '';
  if (!title) return null;
  const i = s.indexOf('class="alert-detail');
  const detail = i < 0 ? '' : pageText(s.slice(s.indexOf('>', i) + 1, s.indexOf('<h1', i) > 0 ? s.indexOf('<h1', i) : undefined));
  const warn = /class="header-alert[^"]*\bwarning\b/.test(s) || !!detail;
  if (!warn && /正常/.test(title)) return [{ Title: title, Status: 1, Description: '', UpdateTime: twNow(now) }];
  return [{ Title: title, Status: 2, Description: detail || title, UpdateTime: twNow(now) }];
}
async function thsrAlertFree(path, q, { fetchFn, now }) {
  if (!THSR_ALERT.test(path)) return undefined;
  if ([...q.keys()].some(k => k !== '$format')) return null;
  const got = await held('thsr:alert', 5 * MIN, 30 * MIN, async () => {
    const res = await fetchFn(THSR_STATE, { signal: AbortSignal.timeout?.(8000) });
    const list = res.ok ? thsrAlertOf(await res.text(), now) : null;
    if (!list) throw new Error(`THSR state ${res.status}`);
    return JSON.stringify(list);
  }, now, 3000);
  return { status: 200, body: got.val, age: Math.max(0, now - got.at), state: 'free' };
}

// TDX's Metro Alert (each system's state) from the metros' own pages: 臺北's
// 路線營運狀況 (web.metro.taipei) and 貓空纜車's board, 桃園's and 高雄's (捷運,
// 輕軌) home pages' 營運狀態, 臺中's RunStatus. 「正常營運」 is TDX's Status
// 1, else a notice in the site's words (Status 2); a page not as we know it: TDX's.
export const METRO_STATE = {
  TRTC: ['https://web.metro.taipei/pages2026/WebServiceStatus', s => [/<p class="realstatus__text">([\s\S]*?)<\/p>/.exec(s)?.[1]]],
  TRTCMG: ['https://ssl.metro.taipei/gondolainfoboard/default.aspx', s => [/<span id="LabelOperation">([\s\S]*?)<\/span>/.exec(s)?.[1], (t => (t ? `今日營運時間 ${t}` : ''))(pageText(/<span id="LabelDisplayTime">([\s\S]*?)<\/span>/.exec(s)?.[1] || ''))]],
  TYMC: ['https://www.tymetro.com.tw/tymetro-new/tw/', s => [/最新營運狀態\s*<span[^>]*>([\s\S]*?)<\/span>/.exec(s)?.[1]]],
  TMRT: ['https://www.tmrt.com.tw/', s => [/"ConfigKey":"RunStatus","ConfigValue":"([^"]*)"/.exec(s)?.[1]]],
  KRTC: ['https://www.krtc.com.tw/', s => [(/<div id="RtStatusMobile">([\s\S]*?)<\/div>\s*<\/div>/.exec(s)?.[1] || '').split(/<\/div>/).map(pageText).find(t => t.startsWith('捷運'))?.replace(/^捷運/, '')]],
  KLRT: ['https://www.krtc.com.tw/', s => [(/<div id="RtStatusMobile">([\s\S]*?)<\/div>\s*<\/div>/.exec(s)?.[1] || '').split(/<\/div>/).map(pageText).find(t => t.startsWith('輕軌'))?.replace(/^輕軌/, '')]]
};
const METRO_ALERT = /^basic\/v2\/Rail\/Metro\/Alert\/([A-Z]+)$/;
const NORMAL = /^(目前)?(全線)?正常(營運|行駛|運行)(中)?(（[^）]*）)?$/;
// A system's page → TDX's Alert answer, or null.
export function metroAlertOf(sys, html, now = Date.now()) {
  const [title, more] = METRO_STATE[sys]?.[1](String(html)) || [];
  const t = pageText(title || '');
  if (!t) return null;
  const ok = NORMAL.test(t);
  // (臺中's 「全線正常營運（目前班距6分鐘）」: the state its title, the headway its words.)
  const [, plain, aside] = /^(.*?)(?:（([^）]*)）)?$/.exec(t);
  return { UpdateTime: twNow(now), Alerts: [{ AlertID: `${sys}-state`, Title: ok ? plain : t, Description: more || (ok ? aside || '' : t), Status: ok ? 1 : 2 }] };
}
async function metroAlertFree(path, q, { fetchFn, now }) {
  const m = METRO_ALERT.exec(path);
  if (!m) return undefined;
  const site = METRO_STATE[m[1]];
  if (!site || [...q.keys()].some(k => k !== '$format')) return null;
  // (One read of a page for every system on it: 高雄's 捷運 and 輕軌.)
  const page = await held(`metro:state:${site[0]}`, 5 * MIN, 30 * MIN, async () => {
    const res = await fetchFn(site[0], { signal: AbortSignal.timeout?.(8000) });
    if (!res.ok) throw new Error(`metro state ${res.status}`);
    return res.text();
  }, now, 3000);
  const answer = metroAlertOf(m[1], page.val, page.at);
  return answer ? { status: 200, body: JSON.stringify(answer), age: Math.max(0, now - page.at), state: 'free' } : null;
}

// ---- 臺中's bus notices --------------------------------------------------------------------

// TDX's Bus Alert of 臺中 (臨時站位, 改道…, a message a route) from 臺中's own
// EBUS: every route's clogMessages in one ask (TDX's ids and words, its 110
// rows, 2026-11-10), kept 10 minutes; its News: the site's own 最新消息 (blogs
// on the shelf today: TDX's set, and the day's new ones before TDX has them).
// Rows as the phone words them (kit/ebus.mjs): phones read them themselves
// (Orbit Transit's ebnotice.mjs), this is their fallback.
const EB_NOTICE = /^basic\/v2\/Bus\/(Alert|News)\/City\/(Taichung)$/;
export const EB_BLOG = 'https://citybus.taichung.gov.tw/ebus/blog/';
const EB_DEPT = { Taichung: '臺中市政府交通局' };
async function ebNoticeFree(path, q, { fetchFn, now }) {
  const m = EB_NOTICE.exec(path);
  if (!m) return undefined;
  if ([...q.keys()].some(k => k !== '$format')) return null;
  const [, kind, city] = m;
  const got = await held(`eb:${city}:${kind}`, 10 * MIN, 6 * HOUR, async () => {
    const d = await ebAsk(city, fetchFn, kind === 'News' ? EB_NEWS_ASK : EB_ALERTS_ASK);
    const list = (kind === 'News' ? d.blogs : d.clogMessages)?.edges;
    if (!Array.isArray(list)) throw new Error(`${city} ${kind}: not a list`);
    return list.map(e => e?.node);
  }, now, 3000);
  const rows = kind === 'News' ? ebNewsRows(got.val, twNow(now).slice(0, 10), got.at, { dept: EB_DEPT[city], blog: EB_BLOG }) : ebAlertRows(got.val, got.at, EB_DEPT[city]);
  return { status: 200, body: JSON.stringify(rows), age: Math.max(0, now - got.at), state: 'free' };
}

// ---- A 台鐵 train's delay -----------------------------------------------------------------

// TDX's TrainLiveBoard of one train (`/TrainNo/<n>`) from 台鐵's own 車次查詢
// (railway.gov.tw tip112 querybytrainno: the train's stops, and on the one it
// last left and the next, 準點 or 誤點 N 分): the site's form token read each
// 20 minutes, a train's page kept a minute. Every train at once is TDX's still.
export const TRA_TRAIN = 'https://www.railway.gov.tw/tra-tip-web/tip/tip001/tip112';
const TRA_ONE = /^basic\/v3\/Rail\/TRA\/TrainLiveBoard\/TrainNo\/(\d{1,5})$/;
const TRA_STATIONS_ASK = 'basic/v3/Rail/TRA/Station';
const zhSt = s => String(s || '').trim().replace(/台/g, '臺');
// A train's page → TDX's row ({ TrainNo, TrainTypeName, StationID, StationName,
// TrainStationStatus: 2 left it, 1 at it, DelayTime, UpdateTime }), or null
// (not running now); `ids`: station name → { StationID, StationName }.
export function traTrainRow(html, no, ids, now = Date.now()) {
  const s = String(html);
  const head = s.match(/icon-train[^"]*">\s*<\/span>\s*<span>\s*([^<]*?)\s*(\d+)\s*<\/span>/);
  if (!head || head[2] !== String(no)) return null;
  const i = s.indexOf('狀態</th>');
  const table = i < 0 ? '' : s.slice(i, s.indexOf('</table>', i));
  const said = [...table.matchAll(/<tr>\s*<td>([^<]*)<\/td>\s*<td>[^<]*<\/td>\s*<td>[^<]*<\/td>\s*<td>([^<]*)<\/td>/g)].map(m => [zhSt(m[1]), m[2].trim()]).filter(([, t]) => t);
  const [name, text] = said[0] || [];
  const st = ids.get(name);
  const late = /^準點$/.test(text || '') ? 0 : Number((/^誤點\s*(\d+)\s*分$/.exec(text || '') || [])[1]);
  if (!st || !Number.isFinite(late)) return null;
  return { TrainNo: String(no), TrainTypeName: { Zh_tw: head[1].trim() }, StationID: st.StationID, StationName: st.StationName, TrainStationStatus: said.length > 1 ? 2 : 1, DelayTime: late, UpdateTime: twNow(now) };
}
// 台鐵's stations (TDX's list, copied to R2): name → { StationID, StationName }, and `id:<StationID>` → the same.
const traIds = async (env, now) =>
  (await held('tra:ids', TRA_FRESH, 7 * DAY, async () => {
    const obj = await env.DATA.get(copyFile(TRA_STATIONS_ASK, new URLSearchParams(tdxCopies([]).find(a => a.startsWith(`${TRA_STATIONS_ASK}?`)).split('?')[1])));
    const list = obj ? JSON.parse(await obj.text()) : null;
    const rows = Array.isArray(list) ? list : list?.Stations;
    if (!rows?.length) throw new Error('not copied');
    const out = new Map();
    for (const r of rows) {
      const st = { StationID: r.StationID, StationName: r.StationName };
      if (!out.has(zhSt(r.StationName?.Zh_tw))) out.set(zhSt(r.StationName?.Zh_tw), st);
      out.set(`id:${r.StationID}`, st);
    }
    return out;
  }, now, 3000)).val;
// The site's form token and its session (one for every form of the site: 車次查詢, 票價試算), read each 20 minutes.
const traForm = (fetchFn, now) =>
  held('tra:form', 20 * MIN, 20 * MIN, async () => {
    const res = await fetchFn(`${TRA_TRAIN}/gobytime`, { signal: AbortSignal.timeout?.(8000) });
    const token = res.ok ? ((await res.text()).match(/name="_csrf" value="([^"]+)"/) || [])[1] : '';
    if (!token) throw new Error(`TRA form ${res.status}`);
    return { token, cookie: (res.headers.getSetCookie?.() || []).map(c => c.split(';')[0]).join('; ') };
  }, now, 3000);
async function traTrainFree(path, q, { fetchFn, env, now }) {
  const m = TRA_ONE.exec(path);
  if (!m || !env?.DATA) return m ? null : undefined;
  if ([...q.keys()].some(k => k !== '$format')) return null;
  const ids = await traIds(env, now);
  const form = await traForm(fetchFn, now);
  const got = await held(`tra:train:${m[1]}`, MIN, 3 * MIN, async () => {
    const day = twNow(now).slice(0, 10).replace(/-/g, '/');
    const res = await fetchFn(`${TRA_TRAIN}/querybytrainno`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...(form.val.cookie ? { cookie: form.val.cookie } : {}) }, body: new URLSearchParams({ _csrf: form.val.token, rideDate: day, trainNo: m[1] }), signal: AbortSignal.timeout?.(8000) });
    const html = res.ok ? await res.text() : '';
    // (No timetable at all: the form gone stale, or no such train today; read the form again for the next ask.)
    if (!html.includes('狀態</th>')) throw (kept.delete('tra:form'), new Error(`TRA train ${res.status}`));
    const row = traTrainRow(html, m[1], ids, now);
    return JSON.stringify({ UpdateTime: twNow(now), AuthorityCode: 'TRA', TrainLiveBoards: row ? [row] : [] });
  }, now);
  return { status: 200, body: got.val, age: Math.max(0, now - got.at), state: 'free' };
}

// ---- A 台鐵 station's board ---------------------------------------------------------------

// TDX's StationLiveBoard of one station (`/Station/<id>`) from 台鐵's own
// 車站時刻 (tip112 querybystation: every train stopping there today, 順行 and
// 逆行, and on those on their way 準點 or 誤點 N 分): the trains due there from
// two hours back (a late one still to come; a train's delay now, for the
// trains through it) to three hours on, a delay only on a train on its way.
// No platforms: the site gives none. The page is a megabyte (five seconds),
// so it's read in the Runner (freeHeavy), a station's kept a minute, one
// station at a time.
const TRA_BOARD = /^basic\/v3\/Rail\/TRA\/StationLiveBoard\/Station\/(\d{4})$/;
// The page → every train of the day there: { no, type, at: 'HH:MM', dir (0 順行, 1 逆行), end, late (minutes; null not on its way), off (cancelled) },
// or null (not the page we know).
export function traBoardRows(html) {
  const s = String(html);
  const a = s.indexOf('id="tab1"');
  const b = s.indexOf('id="tab2"', a);
  if (a < 0 || b < 0) return null;
  const out = [];
  for (const [dir, part] of [[0, s.slice(a, b)], [1, s.slice(b, s.indexOf('</table>', b))]]) {
    for (const [, row] of part.matchAll(/<tr>([\s\S]*?)<\/tr>/g)) {
      if (row.includes('<th')) continue;
      const t = row.match(/querybytrainno\?rideDate=[\d/]+&amp;trainNo=(\d+)[^>]*>\s*([^<]*?)\s*\d+\s*<\/a>/);
      const tds = [...row.matchAll(/<td>\s*([^<]*?)\s*<\/td>/g)].map(m => m[1].trim());
      if (!t || tds.length !== 3 || !/^\d\d:\d\d$/.test(tds[0])) return null;
      const said = tds[2];
      const late = /^準點$/.test(said) ? 0 : /^誤點\s*\d+\s*分$/.test(said) ? Number(said.match(/\d+/)[0]) : null;
      out.push({ no: t[1], type: t[2].trim(), at: tds[0], dir, end: zhSt(tds[1]), late, off: /取消|停駛/.test(said) });
    }
  }
  return out;
}
// The trains of `rows` due from two hours back (those on their way) to three on, in TDX's words.
export function traBoardAnswer(rows, st, at, now = Date.now()) {
  const clock = twNow(now).slice(11, 16);
  const min = hm => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5));
  const n = min(clock);
  const boards = rows
    // (Gone by with no word on it: nothing to say.)
    .filter(r => min(r.at) >= n - 120 && min(r.at) <= n + 180 && (min(r.at) >= n || r.late != null))
    .map(r => ({
      StationID: st.StationID,
      StationName: st.StationName,
      TrainNo: r.no,
      Direction: r.dir,
      TrainTypeName: { Zh_tw: r.type },
      EndingStationName: { Zh_tw: r.end },
      Platform: '',
      ScheduleArrivalTime: `${r.at}:00`,
      ScheduleDepartureTime: `${r.at}:00`,
      ...(r.off ? { RunningStatus: 2 } : r.late != null ? { DelayTime: r.late, RunningStatus: r.late ? 1 : 0 } : {}),
      UpdateTime: twNow(at)
    }));
  return { UpdateTime: twNow(at), AuthorityCode: 'TRA', StationLiveBoards: boards };
}
let traBoardLine = Promise.resolve();
async function traBoardFree(path, q, { fetchFn, env, now }) {
  const m = TRA_BOARD.exec(path);
  if (!m || !env?.DATA) return m ? null : undefined;
  if ([...q.keys()].some(k => k !== '$format')) return null;
  const st = (await traIds(env, now)).get(`id:${m[1]}`);
  if (!st) return null;
  const got = await held(`tra:board:${m[1]}`, MIN, 5 * MIN, () => {
    // (One station's page at a time: a megabyte each.)
    const job = traBoardLine.then(async () => {
      const form = await traForm(fetchFn, now);
      const day = twNow(now).slice(0, 10).replace(/-/g, '/');
      const res = await fetchFn(`${TRA_TRAIN}/querybystation`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...(form.val.cookie ? { cookie: form.val.cookie } : {}) }, body: new URLSearchParams({ _csrf: form.val.token, rideDate: day, station: `${m[1]}-${st.StationName?.Zh_tw || ''}` }), signal: AbortSignal.timeout?.(20000) });
      const rows = res.ok ? traBoardRows(await res.text()) : null;
      // (Not the board: the form gone stale, or the page changed; the form read again for the next ask.)
      if (!rows?.length) throw (kept.delete('tra:form'), new Error(`TRA board ${res.status}`));
      return rows;
    });
    traBoardLine = job.catch(() => {});
    return job;
  }, now, 2500);
  return { status: 200, body: JSON.stringify(traBoardAnswer(got.val, st, got.at, now)), age: Math.max(0, now - got.at), state: 'free' };
}

// ---- 台鐵's fares -------------------------------------------------------------------------

// TDX's ODFare of two stations (each train type's adult one-way fare, the
// short way) from 台鐵's own 票價試算 (railway.gov.tw tip114: one form, every
// type at once; 2026-11-10, 花蓮 → 臺北 and 臺北 → 臺中 as TDX's to the
// dollar), kept in R2 (rail/fare/tra/<a>-<b>.json) 30 days, as fares seldom
// change; one form at a time. The site failing: the copy kept, of any age, else TDX's.
export const TRA_FARE = 'https://www.railway.gov.tw/tra-tip-web/tip/tip001/tip114/query';
const TRA_FARE_ASK = /^basic\/v3\/Rail\/TRA\/ODFare\/(\d{4})\/to\/(\d{4})$/;
const FARE_KEEP = 30 * DAY;
// (The site's train types, TDX's codes: 自強(3000), 太魯閣, 普悠瑪, 自強, 莒光, 復興, 區間快, 區間.)
export const TRA_FARE_TYPES = [
  ['11', '自強(3000)'],
  ['1', '太魯閣'],
  ['2', '普悠瑪'],
  ['3', '自強'],
  ['4', '莒光'],
  ['5', '復興'],
  ['10', '區間快'],
  ['6', '區間']
];
export const traFareFile = (a, b) => `rail/fare/tra/${a}-${b}.json`;
// The form for a pair: one row a train type.
export function traFareForm(token, a, b, day) {
  const f = new URLSearchParams({ _csrf: token });
  TRA_FARE_TYPES.forEach(([code], i) => {
    const r = `tip114QueryVOs[${i}].`;
    for (const [k, v] of [['ticketDeadlineType', 'ONCE'], ['trnDate', day], ['startStation', a], ['endStation', b], ['trainType', code], ['ticketPriceType', '1'], ['seatTypeCode', '301'], ['ticketCount', '1']]) f.append(r + k, v);
  });
  f.append('query', '查詢');
  return f;
}
// The answer page → TDX's ODFares, each row checked for the type it was asked as; [] when it has none.
export function traFareRows(html, a, b) {
  const s = String(html);
  const i = s.indexOf('fare-table');
  if (i < 0) return [];
  const text = h => h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const out = [];
  for (const m of s.slice(i).matchAll(/<tr>\s*<td>(\d+)<\/td>\s*<td class="more">([\s\S]*?)<\/tr>/g)) {
    const type = TRA_FARE_TYPES[Number(m[1]) - 1];
    const tds = [...m[2].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(t => text(t[1]));
    const km = Number((/^([\d.]+)\s*km$/.exec(tds.find(t => /km$/.test(t)) || '') || [])[1]);
    const price = Number((/<span class="red">\s*(\d+)\s*<\/span>/.exec(m[2]) || [])[1]);
    if (!type || !tds.includes(type[1]) || !(price > 0)) continue;
    out.push({ OriginStationID: a, DestinationStationID: b, TrainType: Number(type[0]), ...(Number.isFinite(km) ? { TravelDistance: km } : {}), Fares: [{ TicketType: 1, FareClass: 1, CabinClass: 1, Price: price }] });
  }
  return out;
}
let fareLine = Promise.resolve();
// A fare kept in R2 30 days: R2's copy while that young, else the site's read
// anew (`read` → TDX's body; one at a time across every site) and kept; the
// read failing, the copy of any age, else the failure (TDX's to answer).
async function keptFare(key, file, { env, now }, read) {
  const got = await held(key, DAY, FARE_KEEP, async () => {
    const obj = await env.DATA.get(file);
    const old = obj ? { at: obj.uploaded ? new Date(obj.uploaded).getTime() : 0, body: await obj.text() } : null;
    if (old && now - old.at < FARE_KEEP) return old;
    try {
      const job = fareLine.then(read);
      fareLine = job.catch(() => {});
      const body = await job;
      await env.DATA.put(file, body, { httpMetadata: { contentType: 'application/json' } }).catch(() => {});
      return { at: now, body };
    } catch (err) {
      if (old) return old;
      throw err;
    }
  }, now, 12_000);
  return { status: 200, body: got.val.body, age: Math.max(0, now - got.val.at), state: 'free' };
}
async function traFareFree(path, q, { fetchFn, env, now }) {
  const m = TRA_FARE_ASK.exec(path);
  if (!m || !env?.DATA) return m ? null : undefined;
  if ([...q.keys()].some(k => k !== '$format')) return null;
  const [, a, b] = m;
  if (a === b || now - (unknown.get(`tra:fare:${a}-${b}`) ?? -Infinity) < DAY) return null;
  return keptFare(`tra:fare:${a}-${b}`, traFareFile(a, b), { env, now }, async () => {
    const form = await traForm(fetchFn, now);
    const res = await fetchFn(TRA_FARE, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...(form.val.cookie ? { cookie: form.val.cookie } : {}) }, body: traFareForm(form.val.token, a, b, twNow(now).slice(0, 10).replace(/-/g, '/')), signal: AbortSignal.timeout?.(10_000) });
    const html = res.ok ? await res.text() : '';
    const rows = traFareRows(html, a, b);
    if (rows.length) return JSON.stringify({ UpdateTime: twNow(now), AuthorityCode: 'TRA', ODFares: rows });
    // (A table and no fares: a pair the site doesn't sell, not asked again for a day; no table: the form gone stale, read again for the next ask.)
    if (html.includes('fare-table')) unknown.set(`tra:fare:${a}-${b}`, now);
    else kept.delete('tra:form');
    throw new Error(`TRA fare ${res.status}`);
  });
}

// 高鐵's fares, TDX's ODFare of two stations (標準, 商務, 自由座: adult, one
// way), from 高鐵's own 時刻表與票價查詢 (thsrc.com.tw /TimeTable/Search: its
// PriceTable; 2026-11-10, 臺北 → 左營 1490 / 2440 / 1445 as TDX's), kept as
// 台鐵's. (南港, 臺北, 板橋 between them: no 商務, as the site says.)
export const THSR_SEARCH = 'https://www.thsrc.com.tw/TimeTable/Search';
const THSR_FARE_ASK = /^basic\/v2\/Rail\/THSR\/ODFare\/(\d{4})\/to\/(\d{4})$/;
export const THSR_SITE_IDS = { '0990': 'NanGang', 1000: 'TaiPei', 1010: 'BanQiao', 1020: 'TaoYuan', 1030: 'XinZhu', 1035: 'MiaoLi', 1040: 'TaiZhong', 1043: 'ZhangHua', 1047: 'YunLin', 1050: 'JiaYi', 1060: 'TaiNan', 1070: 'ZuoYing' };
const NO_BUSINESS = new Set(['0990', '1000', '1010']);
// The site's answer → TDX's ODFare list (one row), or null when it has no fares.
export function thsrFareRows(j, a, b) {
  const t = j?.success ? j.data?.PriceTable : null;
  const price = k => Number(String(t?.[k]?.[0] ?? '').replace(/[$,\s]/g, '')) || 0;
  const fares = [[1, 'Coach'], [2, 'Business'], [3, 'Unreserved']].filter(([c]) => c !== 2 || !(NO_BUSINESS.has(a) && NO_BUSINESS.has(b))).map(([c, k]) => ({ TicketType: 1, FareClass: 1, CabinClass: c, Price: price(k) })).filter(f => f.Price > 0);
  if (!fares.some(f => f.CabinClass === 1)) return null;
  return [{ OriginStationID: a, DestinationStationID: b, Direction: a < b ? 0 : 1, Fares: fares }];
}
async function thsrFareFree(path, q, { fetchFn, env, now }) {
  const m = THSR_FARE_ASK.exec(path);
  if (!m || !env?.DATA) return m ? null : undefined;
  const [, a, b] = m;
  if ([...q.keys()].some(k => k !== '$format') || a === b || !THSR_SITE_IDS[a] || !THSR_SITE_IDS[b]) return null;
  return keptFare(`thsr:fare:${a}-${b}`, `rail/fare/thsr/${a}-${b}.json`, { env, now }, async () => {
    // (Tomorrow's, a day the site always answers; fares don't change by the day.)
    const day = twNow(now + DAY).slice(0, 10).replace(/-/g, '/');
    const body = new URLSearchParams({ SearchType: 'S', Lang: 'TW', StartStation: THSR_SITE_IDS[a], EndStation: THSR_SITE_IDS[b], OutWardSearchDate: day, OutWardSearchTime: '10:00', ReturnSearchDate: day, ReturnSearchTime: '10:00', DiscountType: '' });
    const res = await fetchFn(THSR_SEARCH, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body, signal: AbortSignal.timeout?.(12_000) });
    const rows = res.ok ? thsrFareRows(await res.json().catch(() => null), a, b) : null;
    if (!rows) throw new Error(`THSR fare ${res.status}`);
    return JSON.stringify(rows);
  });
}

// ---- TDX's slow lists, copied ------------------------------------------------------------

// What every phone asks the same way and seldom changes (a city's bus routes,
// for search; 台鐵's and 高鐵's stations and lines), copied from TDX by the
// weekly build (tools/gtfs-buses.mjs: a month on, or when a city's new pack
// has a route its list hasn't; each run while TDX is paid) to R2
// tdx/<ask>.json and answered from there. Asked any other way: TDX's.
export const ROUTE_SELECT = 'RouteUID,RouteID,RouteName,DepartureStopNameZh,DestinationStopNameZh,BusRouteType';
export const tdxCopies = (cities, rail = true) => [
  ...cities.map(c => `basic/v2/Bus/Route/${c === 'InterCity' ? c : `City/${c}`}?$select=${ROUTE_SELECT}`),
  ...(rail ? ['basic/v3/Rail/TRA/Station?$select=StationUID,StationID,StationName,StationPosition,StationAddress,StationClass', 'basic/v3/Rail/TRA/StationOfLine', 'basic/v3/Rail/TRA/Line', 'basic/v2/Rail/THSR/Station'] : [])
];
const COPIED = /^(basic\/v2\/Bus\/Route\/(City\/[A-Za-z]+|InterCity)|basic\/v3\/Rail\/TRA\/(Station|StationOfLine|Line)|basic\/v2\/Rail\/THSR\/Station)$/;
const fnv = s => {
  let h = 0x811c9dc5;
  for (const c of new TextEncoder().encode(s)) h = Math.imul(h ^ c, 0x01000193) >>> 0;
  return h.toString(36);
};
// An ask (its decoded path, its query) → its copy's R2 path, or undefined when not one copied.
export function copyFile(path, q) {
  if (!COPIED.test(path)) return undefined;
  const query = [...q].filter(([k]) => k !== '$format').sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, v]) => `${k}=${v}`).join('&');
  return `tdx/${path}${query ? `@${fnv(query)}` : ''}.json`;
}
async function copiedFree(path, q, { env, now }) {
  const file = copyFile(path, q);
  if (!file || !env?.DATA) return file === undefined ? undefined : null;
  const got = await held(`copy:${file}`, TRA_FRESH, 7 * 86_400_000, async () => {
    const obj = await env.DATA.get(file);
    if (!obj) throw new Error('not copied');
    return obj.text();
  }, now, 3000);
  return { status: 200, body: got.val, age: Math.max(0, now - got.at), state: 'free' };
}

// ---- One entry for tdxGet -----------------------------------------------------------------

// A TDX ask (its path and query, as tdxRequest made them) answered from a free
// source → { status, body, age, state: 'free' }, or null (TDX's to answer).
export async function freeTdx(path, query, { fetchFn = fetch, now = Date.now(), env = null } = {}) {
  const q = new URLSearchParams(query);
  try {
    const p = decodeURIComponent(path);
    const got = (await bikes(p, q, { fetchFn, now })) ?? (await traFree(p, q, { fetchFn, now })) ?? (await hsrFree(p, q, { env, now })) ?? (await metroFree(p, q, { env, now })) ?? (await trtcFree(p, q, { fetchFn, env, now })) ?? (await krtcFree(p, q, { fetchFn, env, now })) ?? (await tymcFree(p, q, { fetchFn, env, now })) ?? (await traAlertFree(p, q, { fetchFn, now })) ?? (await thsrAlertFree(p, q, { fetchFn, now })) ?? (await metroAlertFree(p, q, { fetchFn, now })) ?? (await tbNoticeFree(p, q, { fetchFn, now })) ?? (await ebNoticeFree(p, q, { fetchFn, now })) ?? (await traTrainFree(p, q, { fetchFn, env, now })) ?? (await traBoardFree(p, q, { fetchFn, env, now })) ?? (await traFareFree(p, q, { fetchFn, env, now })) ?? (await thsrFareFree(p, q, { fetchFn, env, now })) ?? (await copiedFree(p, q, { env, now }));
    if (got !== undefined) return got;
  } catch (err) {
    console.log('free source failed', path.slice(0, 80), String(err?.message || err).slice(0, 120));
  }
  return null;
}

// Whether a /transit/tdx ask is one the free sources answer (worker.js sends
// those to the Runner: a list of all Taiwan read and kept there, not in each
// isolate's 10 ms).
export const freeHeavy = p => /^((basic|advanced)\/v2\/Bike\/|basic\/v3\/Rail\/TRA\/(DailyTrainTimetable\/TrainDate|ODFare|StationLiveBoard\/Station)\/|basic\/v2\/Rail\/(THSR\/ODFare|Metro\/Alert)\/|basic\/v2\/Bus\/News\/InterCity$)/.test(String(p || '').replace(/^\/+/, ''));
// (A route's whole list of stops, or its buses, from 新竹's site: read in the Runner too.)
export const freeRoutesHeavy = (path, q) => (path === '/transit/gps' || (path === '/transit/eta' && (q.get('routes') || q.get('route') || CITY_FEEDS[q.get('city')] || EBUS[q.get('city')] || TB_CITIES[q.get('city')] || q.get('city') === 'Tainan'))) && FREE_BUS.test(q.get('city') || '');
