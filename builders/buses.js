// Taiwan's bus routes and timetables (one compact pack a city), each line's
// shape and where.json (which packs and YouBike cities are near each point),
// for Orbit Transit to work out a trip's buses on the phone. Built by the
// proxy (builders/run.js) into the family's data (R2). Was Shared-Data's
// build.mjs, shapes.mjs and where.mjs (GitHub, weekly).
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
// shape/rail.json, where.json, index.json ({ built, cities: { City: {
// routes, bytes, built } }, squares, shapes }). A pack: { v, city, built,
// stops: { uid: [name, lat, lon] }, routes: [{ uid, name, ways: [[sub,
// subName, dir, [stopUid…]]], sched: [[sub, dir, [stopUid…], trips, freq]] }] }
// where a trip is [days (7 bits, bit 0 Sunday), times, special?].

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
export function tdxClient(env, { get = fetch, sleep = ms => new Promise(r => setTimeout(r, ms)), gap = 500 } = {}) {
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
      const res = await get(`${TDX}${path}${path.includes('?') ? '&' : '?'}$format=JSON`, { headers: { Authorization: `Bearer ${token}`, 'Accept-Encoding': 'gzip' } }).catch(e => ({ ok: false, status: String(e) }));
      if (res.ok) return res.json();
      if (res.status === 401) await auth();
      if (tries >= 4) throw new Error(`${path}: ${res.status}`);
      await sleep(2000 * (tries + 1));
    }
  };
  // Every row, `top` at a time, each page to `each` (and let go).
  const pages = async (path, top, each) => {
    for (let skip = 0; ; skip += top) {
      const rows = await ask(`${path}${path.includes('?') ? '&' : '?'}$top=${top}&$skip=${skip}`);
      const list = Array.isArray(rows) ? rows : rows?.Routes || rows?.data || [];
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
    for (const r of rows) {
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
      route(r.RouteUID, zh(r.RouteName)).sched.push([r.SubRouteUID || '', Number(r.Direction) || 0, order, trips, freq]);
    }
  });
  return { v: 1, city, built, stops, routes: [...routes.values()] };
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
      const k = packs.length;
      let n = 0;
      await tdx.pages(`basic/v2/Bike/Station/City/${city}?$select=StationUID,StationPosition`, 1000, rows => {
        for (const s of rows) mark(Number(s.StationPosition?.PositionLat), Number(s.StationPosition?.PositionLon), k), n++;
      });
      if (n) packs.push(`bike:${city}`);
    } catch {}
  }
  await store.put('where.json', { v: 1, built, cell: CELL, packs, cells: Object.fromEntries([...cells].map(([c, s]) => [c, [...s].sort((a, b) => a - b)])) });
}

// The run: the cities whose pack is over six days old, rebuilt until `until`;
// the rail lines' shapes weekly too; where.json once every city is fresh.
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
      if (city === 'InterCity') {
        const parts = squares(p);
        for (const [k, sq] of Object.entries(parts)) await store.put(`bus/InterCity/${k}.json`, sq);
        index.squares = Object.fromEntries(Object.entries(parts).map(([k, sq]) => [k, JSON.stringify(sq).length]));
        index.cities[city] = { routes: p.routes.length, bytes: Object.values(index.squares).reduce((a, b) => a + b, 0), squares: Object.keys(parts).length, built };
      } else {
        const text = JSON.stringify(p);
        await store.put(`bus/${city}.json`, text);
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
    await store.put('index.json', index);
    // Every city fresh this week: where.json, from them.
    if (!CITIES.some(c => age(c) > WEEK && !done.includes(c))) await buildWhere(store, tdx, index, built);
  }
  return { stale: stale.length, built: done };
}
