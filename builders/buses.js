// Taiwan's bus routes and timetables (one compact pack a city), each line's
// shape, the stations and where.json (which packs and YouBike cities are near each point),
// for Orbit Transit to work out a trip's buses on the phone. Built by the
// proxy (builders/run.js) into the family's data (R2).
//
// Lean, and within a Worker's memory: TDX is read a small page at a time and
// each page made compact at once (a big city's timetables are tens of MB as
// TDX gives them); a city is rebuilt once a week (its pack over six days
// old), a few each hourly run within a time budget, TDX asked twice a second
// (the paid plan allows five: the app's live calls keep the rest); where.json
// once every city is fresh; each file written only when it changed.
//
// → bus/<City>.json, bus/InterCity/<lat>_<lon>.json (the 公路客運 in 0.25°
// squares), shape/bus/<City>.json, shape/bus/InterCity/<sq>.json,
// shape/rail.json, where.json, station/<City>/<lat>_<lon>.json (a city's bus
// stations in 0.05° tiles: cityStations), station/index.json, index.json ({
// built, cities: { City: { routes, bytes, built } }, squares, shapes,
// stations: { City: { stations, tiles, built } } }). A pack: { v, city, built,
// stops: { uid: [name, lat, lon] }, routes: [{ uid, name, ways: [[sub,
// subName, dir, [stopUid…]]], sched: [[sub, dir, [stopUid…], trips, freq]] }] }
// where a trip is [days (7 bits, bit 0 Sunday), times, special?].

import { tdxBody, tallyTdx } from '../transit.js';
import { fillNewTaipei } from './ntpc.js';

const TDX = 'https://tdx.transportdata.tw/api/';
const AUTH = 'https://tdx.transportdata.tw/auth/realms/TDXConnect/protocol/openid-connect/token';
export const CITIES = ['Taipei', 'NewTaipei', 'Taoyuan', 'Taichung', 'Tainan', 'Kaohsiung', 'Keelung', 'Hsinchu', 'HsinchuCounty', 'MiaoliCounty', 'ChanghuaCounty', 'NantouCounty', 'YunlinCounty', 'Chiayi', 'ChiayiCounty', 'PingtungCounty', 'YilanCounty', 'HualienCounty', 'TaitungCounty', 'KinmenCounty', 'PenghuCounty', 'LienchiangCounty', 'InterCity'];
const METROS = ['TRTC', 'KRTC', 'TYMC', 'NTDLRT', 'TRTCMG', 'KLRT', 'TMRT', 'NTALRT'];
const BIKE_CITIES = ['Taipei', 'NewTaipei', 'Taoyuan', 'Hsinchu', 'HsinchuCounty', 'MiaoliCounty', 'Taichung', 'ChanghuaCounty', 'YunlinCounty', 'ChiayiCounty', 'Chiayi', 'Tainan', 'Kaohsiung', 'PingtungCounty', 'TaitungCounty'];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const WEEK = 6 * 86_400_000;
export const SQUARE = 0.25;
export const CELL = 0.02;
export const squareOf = (lat, lon) => `${(Math.floor(lat / SQUARE) * SQUARE).toFixed(2)}_${(Math.floor(lon / SQUARE) * SQUARE).toFixed(2)}`;
const zh = x => (typeof x === 'string' ? x : x?.Zh_tw || '');
const mins = t => {
  const [h, m] = String(t || '').split(':').map(Number);
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : -1;
};
const daysOf = sd => (sd ? DAYS.reduce((a, d, i) => a | (Number(sd[d]) === 1 ? 1 << i : 0), 0) : 127);
const r5 = x => Math.round(Number(x) * 1e5) / 1e5;

// TDX with the Worker's own key, two asks a second, each page handed on as it comes.
// Each call counted in the proxy's meter as TDX bills it (transit.js
// tallyTdx: the call and its bytes), as the builders' (`build:`): until
// 2026-11-06 they weren't counted at all.
export function tdxClient(env, { get = fetch, sleep = ms => new Promise(r => setTimeout(r, ms)), gap = 500, count = (path, read) => tallyTdx(env, path, Date.now(), null, 'build', read) } = {}) {
  let token = null;
  const auth = async () => {
    const res = await get(AUTH, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'client_credentials', client_id: env.TDX_CLIENT_ID || '', client_secret: env.TDX_CLIENT_SECRET || '' }) });
    if (!res.ok) throw new Error(`TDX sign-in: ${res.status}`);
    token = (await res.json()).access_token;
  };
  const ask = async path => {
    if (!token) await auth();
    for (let tries = 0; ; tries++) {
      await sleep(gap);
      const res = await get(`${TDX}${path}${path.includes('?') ? '&' : '?'}$format=JSON`, { headers: { Authorization: `Bearer ${token}`, 'Accept-Encoding': 'br, gzip' } }).catch(e => ({ ok: false, status: String(e) }));
      const read = await tdxBody(res);
      try {
        await count(path, read);
      } catch {}
      if (res.ok) return JSON.parse(read.text);
      if (res.status === 401) await auth();
      // (Refused, 400 or 404: what TDX doesn't have, never asked again four times.)
      if (tries >= 4 || res.status === 400 || res.status === 404) throw Object.assign(new Error(`${path}: ${res.status}`), { status: res.status });
      await sleep(2000 * (tries + 1));
    }
  };
  // Every row, `top` at a time, each page to `each` (and let go).
  const pages = async (path, top, each) => {
    for (let skip = 0; ; skip += top) {
      const rows = await ask(`${path}${path.includes('?') ? '&' : '?'}$top=${top}&$skip=${skip}`);
      const list = Array.isArray(rows) ? rows : [rows?.Routes, rows?.data].find(Array.isArray);
      // (An answer that isn't a list is a failure, never "no more rows": a pack cut short would be written over a whole one.)
      if (!list) throw new Error(`${path}: not a list`);
      each(list);
      if (list.length < top) return;
    }
  };
  return { ask, pages };
}

// A city's pack, its pages made compact as they come.
export async function packCity(tdx, city, built) {
  const scope = city === 'InterCity' ? 'InterCity' : `City/${city}`;
  const stops = {};
  const routes = new Map();
  const route = (uid, name) => (routes.has(uid) ? routes.get(uid) : routes.set(uid, { uid, name, ways: [], sched: [] }).get(uid));
  await tdx.pages(`basic/v2/Bus/StopOfRoute/${scope}`, 200, rows => {
    for (const r of rows) {
      const list = (r.Stops || []).slice().sort((a, b) => (a.StopSequence || 0) - (b.StopSequence || 0));
      for (const s of list) if (!stops[s.StopUID]) stops[s.StopUID] = [zh(s.StopName), r5(s.StopPosition?.PositionLat), r5(s.StopPosition?.PositionLon)];
      route(r.RouteUID, zh(r.RouteName)).ways.push([r.SubRouteUID || '', zh(r.SubRouteName), Number(r.Direction) || 0, list.map(s => s.StopUID)]);
    }
  });
  // (A big city's timetables: a few routes a page.)
  await tdx.pages(`basic/v2/Bus/Schedule/${scope}`, 30, rows => {
    for (const r of rows) route(r.RouteUID, zh(r.RouteName)).sched.push(schedOf(r, stops));
  });
  return { v: 1, city, built, stops, routes: [...routes.values()] };
}
// One of TDX's Schedule rows made compact: [sub, dir, order, trips, freq]
// (a stop not yet in `stops` added by its name).
export function schedOf(r, stops = {}) {
  const order = [];
  for (const t of r.Timetables || []) for (const st of (t.StopTimes || []).slice().sort((a, b) => (a.StopSequence || 0) - (b.StopSequence || 0))) if (!order.includes(st.StopUID)) order.push(st.StopUID);
  const at = new Map(order.map((u, i) => [u, i]));
  const trips = (r.Timetables || []).map(t => {
    const times = Array(order.length).fill(-1);
    for (const st of t.StopTimes || []) times[at.get(st.StopUID)] = mins(st.DepartureTime || st.ArrivalTime);
    const set = new Set(times.filter(x => x >= 0));
    const one = set.size <= 1 ? [...set][0] ?? -1 : null;
    const trip = [daysOf(t.ServiceDay), one ?? times];
    if (t.SpecialDays?.length) trip.push(t.SpecialDays);
    return trip;
  });
  const freq = (r.Frequencys || []).map(f => [daysOf(f.ServiceDay), f.StartTime, f.EndTime, Number(f.MinHeadwayMins) || 0, Number(f.MaxHeadwayMins) || 0]);
  for (const u of order) if (!stops[u]) stops[u] = [zh((r.Timetables || []).flatMap(t => t.StopTimes || []).find(s => s.StopUID === u)?.StopName), null, null];
  return [r.SubRouteUID || '', Number(r.Direction) || 0, order, trips, freq];
}
// The 公路客運 cut into squares: each route in every square one of its stops is in.
export function squares(p) {
  const by = new Map();
  for (const r of p.routes) {
    const uids = new Set([...r.ways.flatMap(w => w[3]), ...r.sched.flatMap(x => x[2])]);
    for (const k of new Set([...uids].map(u => p.stops[u]).filter(s => s?.[1] != null).map(s => squareOf(s[1], s[2])))) (by.get(k) || by.set(k, []).get(k)).push(r);
  }
  const out = {};
  for (const [k, routes] of by) {
    const used = new Set(routes.flatMap(r => [...r.ways.flatMap(w => w[3]), ...r.sched.flatMap(x => x[2])]));
    out[k] = { ...p, square: k, stops: Object.fromEntries([...used].map(u => [u, p.stops[u]])), routes };
  }
  return out;
}

// A city's bus stations (TDX's Station list: what its NearBy search gives),
// in 0.05° tiles: the map's stops and the stops near a point are read on
// the phone from here (Transit packs.mjs stationRows), never from TDX's
// search around each spot (an advanced ask, 7.5 basic ones' points, at each
// new ~200 m; 2026-11-06). A tile: { routes: { RouteUID: [zh, en] },
// stations: [[StationUID, StationID, zh, en, lat, lon, cityCode, bearing,
// [[StopUID, RouteUID]…]]] }, each in order (a week's rebuild of the same
// stations is the same bytes: not written, phones keep theirs).
export const TILE = 0.05;
export const tileOf = (lat, lon) => `${(Math.floor(lat / TILE) * TILE).toFixed(2)}_${(Math.floor(lon / TILE) * TILE).toFixed(2)}`;
export const STATION_SELECT = 'StationUID,StationID,StationName,StationPosition,Stops,LocationCityCode,Bearing';
// (A page of 1000 of 臺北市's stations, a dozen routes at some, failed where
// 新北市's passed, 2026-11-06: a few hundred a page.)
export const STATION_PAGE = 250;
const enOf = x => (x && typeof x === 'object' && x.En) || '';
const byFirst = (a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0);
export async function cityStations(tdx, city) {
  const scope = city === 'InterCity' ? 'InterCity' : `City/${city}`;
  const tiles = {};
  let stations = 0;
  await tdx.pages(`basic/v2/Bus/Station/${scope}?$select=${STATION_SELECT}`, STATION_PAGE, rows => {
    for (const s of rows) {
      const lat = r5(s.StationPosition?.PositionLat);
      const lon = r5(s.StationPosition?.PositionLon);
      // (No place, or TDX's 0,0: on no one's map.)
      if (!s.StationUID || !(lat > 0) || !(lon > 0)) continue;
      const t = (tiles[tileOf(lat, lon)] ||= { routes: {}, stations: [] });
      const stops = [];
      for (const x of s.Stops || []) {
        if (!x.StopUID || !x.RouteUID) continue;
        stops.push([x.StopUID, x.RouteUID]);
        t.routes[x.RouteUID] ||= [zh(x.RouteName), enOf(x.RouteName)];
      }
      t.stations.push([s.StationUID, s.StationID || '', zh(s.StationName), enOf(s.StationName), lat, lon, s.LocationCityCode || '', s.Bearing || '', stops.sort((a, b) => byFirst(a, b) || (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0))]);
      stations++;
    }
  });
  for (const t of Object.values(tiles)) {
    t.stations.sort(byFirst);
    t.routes = Object.fromEntries(Object.entries(t.routes).sort(byFirst));
  }
  return { stations, tiles };
}

// "LINESTRING(lon lat, …)" → [[lat, lon]…]; "MULTILINESTRING((…),(…))" its
// parts, each its own (a branch joined to the trunk would jump across town).
export function wktParts(wkt) {
  const text = String(wkt || '');
  const parts = /MULTI/i.test(text) ? [...text.matchAll(/\(([^()]+)\)/g)].map(m => m[1]) : [text];
  return parts.map(part => [...part.matchAll(/(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)/g)].map(m => [Number(m[2]), Number(m[1])])).filter(p => p.length > 1);
}
// Metres off the line from a to b, on a plane near Taiwan (fine at these sizes).
const KX = 101_000;
const KY = 111_000;
function offLine(p, a, b) {
  const [px, py, ax, ay, bx, by] = [p[1] * KX, p[0] * KY, a[1] * KX, a[0] * KY, b[1] * KX, b[0] * KY];
  const dx = bx - ax;
  const dy = by - ay;
  const len = dx * dx + dy * dy;
  const t = len ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len)) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}
// Douglas–Peucker, iterative.
export function simplify(pts, tolerance = 12) {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [i, j] = stack.pop();
    let far = -1;
    let at = -1;
    for (let k = i + 1; k < j; k++) {
      const d = offLine(pts[k], pts[i], pts[j]);
      if (d > far) [far, at] = [d, k];
    }
    if (far > tolerance) {
      keep[at] = 1;
      stack.push([i, at], [at, j]);
    }
  }
  return pts.filter((_, k) => keep[k]);
}
// Google's encoded polyline (precision 5).
export function encode(pts) {
  let out = '';
  let [plat, plon] = [0, 0];
  const one = v => {
    let n = v < 0 ? ~(v << 1) : v << 1;
    while (n >= 0x20) {
      out += String.fromCharCode((0x20 | (n & 0x1f)) + 63);
      n >>= 5;
    }
    out += String.fromCharCode(n + 63);
  };
  for (const [lat, lon] of pts) {
    const [a, b] = [Math.round(lat * 1e5), Math.round(lon * 1e5)];
    one(a - plat);
    one(b - plon);
    [plat, plon] = [a, b];
  }
  return out;
}
// Parts that meet end to end (within 30 m, either way round) joined into
// one line: TDX cuts a line into pieces, and a ride runs across them.
const near = (a, b) => Math.hypot((a[0] - b[0]) * KY, (a[1] - b[1]) * KX) <= 30;
export function chain(parts) {
  const left = parts.map(p => p.slice());
  const out = [];
  while (left.length) {
    let cur = left.shift();
    for (let grew = true; grew; ) {
      grew = false;
      for (let k = 0; k < left.length; k++) {
        const p = left[k];
        const [a, b] = [cur[0], cur.at(-1)];
        const join = near(b, p[0]) ? p : near(b, p.at(-1)) ? p.slice().reverse() : null;
        const head = !join && (near(a, p.at(-1)) ? p : near(a, p[0]) ? p.slice().reverse() : null);
        if (!join && !head) continue;
        cur = join ? cur.concat(join.slice(1)) : head.concat(cur.slice(1));
        left.splice(k, 1);
        grew = true;
        break;
      }
    }
    out.push(cur);
  }
  return out;
}
// Each part of a shape (pieces chained), simplified and encoded.
const lines = wkt =>
  chain(wktParts(wkt))
    .map(p => simplify(p))
    .filter(pts => pts.length > 1)
    .map(pts => ({ pts, enc: encode(pts) }));

export async function cityShapes(tdx, city) {
  const scope = city === 'InterCity' ? 'InterCity' : `City/${city}`;
  const shapes = {};
  const sq = new Map();
  await tdx.pages(`basic/v2/Bus/Shape/${scope}`, 200, rows => {
    for (const r of rows) {
      if (!r.RouteUID) continue;
      const key = `${r.RouteUID}|${Number(r.Direction) || 0}`;
      for (const l of lines(r.Geometry)) {
        (shapes[key] ||= []).push([r.SubRouteUID || '', l.enc]);
        if (city === 'InterCity') for (const s of new Set(l.pts.map(([a, b]) => squareOf(a, b)))) (sq.get(s) || sq.set(s, new Set()).get(s)).add(key);
      }
    }
  });
  return { shapes, squares: sq };
}
async function railShapes(tdx) {
  const out = [];
  const add = async (sys, op, path) => tdx.pages(path, 200, rows => {
    for (const r of rows) for (const l of lines(r.Geometry)) out.push({ sys, op, id: r.LineID || r.LineNo || '', name: r.LineName?.Zh_tw || '', line: l.enc });
  });
  await add('tra', 'TRA', 'basic/v2/Rail/TRA/Shape');
  await add('hsr', 'THSR', 'basic/v2/Rail/THSR/Shape');
  for (const op of METROS) await add('metro', op, `basic/v2/Rail/Metro/Shape/${op}`).catch(() => {});
  return out;
}

// where.json: Taiwan in 0.02° cells, each with the packs with a stop in it
// and the cities with a YouBike station in it.
export async function buildWhere(store, tdx, index, built) {
  const cellOf = (lat, lon) => `${Math.floor(lat / CELL)}_${Math.floor(lon / CELL)}`;
  const names = [...Object.keys(index.cities || {}).filter(c => c !== 'InterCity'), ...Object.keys(index.squares || {}).map(k => `InterCity/${k}`)];
  const packs = [];
  const cells = new Map();
  const mark = (lat, lon, k) => {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
    const c = cellOf(lat, lon);
    (cells.get(c) || cells.set(c, new Set()).get(c)).add(k);
  };
  for (const name of names) {
    const p = await store.json(`bus/${name}.json`);
    if (!p) continue;
    const k = packs.push(name) - 1;
    const [la, lo] = name.startsWith('InterCity/') ? name.slice(10).split('_').map(Number) : [null, null];
    for (const [, lat, lon] of Object.values(p.stops)) if (la == null || (lat >= la && lat < la + SQUARE && lon >= lo && lon < lo + SQUARE)) mark(lat, lon, k);
  }
  for (const city of BIKE_CITIES) {
    try {
      // (Marked once every page is in: a city that failed half way would leave its stations under the next city's number.)
      const at = [];
      await tdx.pages(`basic/v2/Bike/Station/City/${city}?$select=StationUID,StationPosition`, 1000, rows => {
        for (const s of rows) at.push([Number(s.StationPosition?.PositionLat), Number(s.StationPosition?.PositionLon)]);
      });
      if (!at.length) continue;
      const k = packs.push(`bike:${city}`) - 1;
      for (const [lat, lon] of at) mark(lat, lon, k);
    } catch {}
  }
  await store.put('where.json', { v: 1, built, cell: CELL, packs, cells: Object.fromEntries([...cells].map(([c, s]) => [c, [...s].sort((a, b) => a - b)])) });
}

// The run: the cities whose pack is over six days old, rebuilt until `until`;
// the rail lines' shapes weekly too; where.json once every city is fresh;
// then each city's stations over six days old, in the time left.
export async function runBuses({ store, env, now = Date.now(), until = now + 8 * 60_000, tdx = tdxClient(env) }) {
  const index = (await store.json('index.json')) || { cities: {} };
  const built = new Date(now).toISOString();
  const age = k => now - (Date.parse(index.cities?.[k]?.built || index.built || '') || 0);
  const stale = CITIES.filter(c => age(c) > WEEK);
  const done = [];
  for (const city of stale) {
    if (Date.now() >= until) break;
    try {
      const p = await packCity(tdx, city, built);
      // (新北's ways TDX has no timetable for, from 新北's own list: ntpc.js.)
      if (city === 'NewTaipei') await fillNewTaipei(p).catch(() => 0);
      // (A pack with no routes, or under half what it had, is a read gone wrong: the one there stays.)
      const had = index.cities?.[city]?.routes || 0;
      if (!p.routes.length || p.routes.length < had / 2) throw new Error(`${city}: ${p.routes.length} routes, had ${had}`);
      if (city === 'InterCity') {
        const parts = squares(p);
        for (const [k, sq] of Object.entries(parts)) await store.put(`bus/InterCity/${k}.json`, sq);
        index.squares = Object.fromEntries(Object.entries(parts).map(([k, sq]) => [k, JSON.stringify(sq).length]));
        index.cities[city] = { routes: p.routes.length, bytes: Object.values(index.squares).reduce((a, b) => a + b, 0), squares: Object.keys(parts).length, built };
      } else {
        const text = JSON.stringify(p);
        await store.put(`bus/${city}.json`, p);
        index.cities[city] = { routes: p.routes.length, bytes: text.length, built };
      }
      const { shapes, squares: sq } = await cityShapes(tdx, city);
      if (city === 'InterCity') for (const [k, keys] of sq) await store.put(`shape/bus/InterCity/${k}.json`, { v: 1, city, square: k, built, shapes: Object.fromEntries([...keys].map(x => [x, shapes[x]])) });
      else await store.put(`shape/bus/${city}.json`, { v: 1, city, built, shapes });
      done.push(city);
    } catch {
      // Left as it was (the app keeps the pack it has); tried again next run.
    }
  }
  if (done.length) {
    if (age('rail') > WEEK) {
      try {
        await store.put('shape/rail.json', { v: 1, built, lines: await railShapes(tdx) });
        (index.cities ||= {}).rail = { built };
      } catch {}
    }
    index.built = built;
    index.shapes = (await store.list('shape/')).sort();
  }
  // The stations, each city's once a week on their own (the time left).
  const stationAge = k => now - (Date.parse(index.stations?.[k]?.built || '') || 0);
  const stations = [];
  const failed = {};
  for (const city of CITIES.filter(c => stationAge(c) > WEEK)) {
    if (Date.now() >= until) break;
    try {
      const got = await cityStations(tdx, city);
      // (None, or under half what it had: a read gone wrong, the tiles there stay.)
      const had = index.stations?.[city]?.stations || 0;
      if (!got.stations || got.stations < had / 2) throw new Error(`${city}: ${got.stations} stations, had ${had}`);
      for (const [k, t] of Object.entries(got.tiles)) await store.put(`station/${city}/${k}.json`, { v: 1, city, tile: k, built, ...t });
      (index.stations ||= {})[city] = { stations: got.stations, tiles: Object.keys(got.tiles).sort(), built };
      stations.push(city);
    } catch (e) {
      // Stations TDX doesn't have for a city (連江縣's list is refused, 400,
      // and its search around a point there finds none, 2026-11-06): none,
      // asked again in a week. Else left as they were, tried again next run
      // (why, in the run's answer).
      if (e?.status === 400 || e?.status === 404) {
        (index.stations ||= {})[city] = { stations: 0, tiles: [], built, refused: e.status };
        stations.push(city);
      } else failed[city] = String(e?.message || e).slice(0, 160);
    }
  }
  if (done.length || stations.length) await store.put('index.json', index);
  // Every city fresh this week: where.json, from them.
  if (done.length && !CITIES.some(c => age(c) > WEEK && !done.includes(c))) await buildWhere(store, tdx, index, built);
  // The phone's list of every city's tiles, once every city has its stations
  // (one missing would leave its stops off the map: TDX is asked till then).
  if (stations.length && CITIES.every(c => index.stations?.[c])) await store.put('station/index.json', { v: 1, built, tile: TILE, cities: Object.fromEntries(CITIES.map(c => [c, index.stations[c].tiles])) });
  return { stale: stale.length, built: done, stations, ...(Object.keys(failed).length ? { failed } : {}) };
}
