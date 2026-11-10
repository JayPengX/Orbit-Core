// Orbit Transit's live data from the operators' own free sources, in TDX's
// shape, so TDX's free tier (3 points a month, from 2026-12-01) is left for
// what only TDX has. Each reader answers what tdxGet (transit.js) was asked,
// or null: then TDX is asked as before (the backup).
//
//   - YouBike: YouBike's own list of every 2.0 station in Taiwan with what's
//     there now (apis.youbike.com.tw/json/station-yb2.json: 9,800 stations,
//     685 KB gzipped, refreshed by YouBike each minute), read once a minute
//     at most and kept here; a city's list or the stations near a point.
//   - 新竹's buses (竹塹交通資訊網), 臺北's and 新北's (the cities' open data).
//   - 台鐵's day of trains (台鐵's own open data, ods.railway.gov.tw).
//   - 高鐵's day and the metros' maps and timetables: the weekly build's
//     copies in R2 (rail/: TDX's GTFS, 0 points; the metros asked of TDX
//     only when GTFS says they changed); the bus route lists and 台鐵's and
//     高鐵's stations (tdx/: asked of TDX a month on).
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

// A small keeper: each answer `fresh` long, its last `keep` long when the site fails.
const kept = new Map(); // key → { at, val }
const unknown = new Map(); // a stop id the site said it doesn't know → when
const going = new Map();
// (A source slower than `slow` ms with a last answer still kept: that one now, the new one for the next ask.)
async function held(key, fresh, keep, load, now, slow = 1500) {
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
    const job = going.get(key);
    if (k && now - k.at < keep) {
      const late = Symbol('late');
      let timer;
      const got = await Promise.race([job, new Promise(r => (timer = setTimeout(r, slow, late)))]).finally(() => clearTimeout(timer));
      if (got === late) {
        job.catch(() => {});
        return k;
      }
      return got;
    }
    return await job;
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

// Orbit's pack for a city → { route: Map(uid → name), stop: Map(uid → [zh]), ways: Map(stopUID@routeUID → [dir…]) }.
async function cityPack(city, deps) {
  if (!deps.env?.DATA) return null;
  const got = await held(`pack:${city}`, 6 * 3_600_000, 14 * 86_400_000, async () => {
    const o = await deps.env.DATA.get(`bus/${city}.json`);
    if (!o) throw new Error(`no pack ${city}`);
    const j = await o.json();
    const route = new Map();
    const ways = new Map();
    const sub = new Map(); // (a way's id → its route's: GetBusData names a bus's way)
    for (const r of j.routes || []) {
      route.set(r.uid, r.name);
      for (const [w] of r.ways || []) sub.set(w, r.uid);
      for (const [, , dir, stops] of r.ways || []) for (const st of stops || []) {
        const k = `${st}@${r.uid}`;
        const d = ways.get(k) || [];
        if (!d.includes(dir)) ways.set(k, [...d, dir]);
      }
    }
    const stop = new Map(Object.entries(j.stops || {}).map(([k, v]) => [k, v?.[0] || '']));
    return { route, stop, ways, sub };
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

// The cities whose buses a free source reads (TDX's city names).
export const FREE_BUS = /^(Hsinchu|HsinchuCounty|InterCity|Taipei|NewTaipei)$/;
const MAX_STOPS = 30;
const MAX_ROUTES = 12;

// /transit/eta's stops or routes from the free sources → { rows, missing: { stops, routes }, age }.
// What a source doesn't know (a 公路客運 stop far from 新竹) is left for TDX.
export async function freeEta(city, { stops = [], routes = [] }, { fetchFn = fetch, now = Date.now(), env = null } = {}) {
  if (!FREE_BUS.test(city)) return null;
  const deps = { fetchFn, now, env };
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
  return { rows, missing, age: Math.max(0, now - oldest) };
}

// /transit/gps's routes → { rows, missing, age }.
export async function freeGps(city, routes, { fetchFn = fetch, now = Date.now(), env = null } = {}) {
  if (!FREE_BUS.test(city)) return null;
  const deps = { fetchFn, now, env };
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
    const got = (await bikes(p, q, { fetchFn, now })) ?? (await traFree(p, q, { fetchFn, now })) ?? (await hsrFree(p, q, { env, now })) ?? (await metroFree(p, q, { env, now })) ?? (await copiedFree(p, q, { env, now }));
    if (got !== undefined) return got;
  } catch (err) {
    console.log('free source failed', path.slice(0, 80), String(err?.message || err).slice(0, 120));
  }
  return null;
}

// Whether a /transit/tdx ask is one the free sources answer (worker.js sends
// those to the Runner: a list of all Taiwan read and kept there, not in each
// isolate's 10 ms).
export const freeHeavy = p => /^((basic|advanced)\/v2\/Bike\/|basic\/v3\/Rail\/TRA\/DailyTrainTimetable\/TrainDate\/)/.test(String(p || '').replace(/^\/+/, ''));
// (A route's whole list of stops, or its buses, from 新竹's site: read in the Runner too.)
export const freeRoutesHeavy = (path, q) => (path === '/transit/gps' || (path === '/transit/eta' && (q.get('routes') || q.get('route') || CITY_FEEDS[q.get('city')]))) && FREE_BUS.test(q.get('city') || '');
