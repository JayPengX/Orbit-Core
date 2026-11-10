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
export const resetYouBike = () => ((yb = null), (ybGoing = null));

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
