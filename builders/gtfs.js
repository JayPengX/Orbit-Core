// Taiwan's bus packs from TDX's GTFS (its free download, 0 points): the
// weekly bus build's source from 2026-11 (tools/gtfs-buses.mjs, run by
// GitHub: the zip is 470 MB, past what a Worker holds). This is its pure
// part: GTFS's rows made into the packs builders/buses.js made from TDX's
// API, in the same shape (Transit's packs.mjs reads either).
//
// What GTFS has as TDX's API had it (checked city by city, 2026-11-10):
// each timed trip's stops and times, its days and special days, the stops'
// names and places, each sub-route's line. What it lacks:
// - a sub-route with no timetable has no trips, so no stops (臺北's 641
//   ways, 高雄's…): those ways are kept from the last pack, and a new one,
//   or one whose timetable's stops changed, is asked of TDX by the build
//   (`wayPlan`: a few filtered calls, not a city's whole StopOfRoute);
// - a headway run's least and most wait (GTFS keeps their mean): a run the
//   last pack had is kept with its two;
// - special days (a trip 未營運 for a month): TDX's GTFS has none for buses.
//   A sub-route the last pack had them for is asked of TDX's Schedule again
//   (a filtered call), its entry TDX's own; with no TDX, the last pack's
//   special days still to come are kept on the same trips;
// - a trip TDX timed at its first stop only (新北's, 臺北's…) is in GTFS
//   with a time at each stop, worked out between: kept at its first stop,
//   as the last pack had it (the app adds the ride itself).
//
// A pack: { v, city, built, stops: { uid: [name, lat, lon] }, routes: [{
// uid, name, ways: [[sub, subName, dir, [stopUid…]]], sched: [[sub, dir,
// [stopUid…], trips, freq]] }] }, a trip [days (bit 0 Sunday), times | one,
// special?], a run [days, 'HH:MM', 'HH:MM', min, max].

import { simplify, encode, squareOf } from './buses.js';

// Each pack's routes by their UIDs' first three letters (公路客運: THB).
export const CITY_CODE = { Taipei: 'TPE', NewTaipei: 'NWT', Taoyuan: 'TAO', Taichung: 'TXG', Tainan: 'TNN', Kaohsiung: 'KHH', Keelung: 'KEE', Hsinchu: 'HSZ', HsinchuCounty: 'HSQ', MiaoliCounty: 'MIA', ChanghuaCounty: 'CHA', NantouCounty: 'NAN', YunlinCounty: 'YUN', Chiayi: 'CYI', ChiayiCounty: 'CYQ', PingtungCounty: 'PIF', YilanCounty: 'ILA', HualienCounty: 'HUA', TaitungCounty: 'TTT', KinmenCounty: 'KIN', PenghuCounty: 'PEN', LienchiangCounty: 'LIE', InterCity: 'THB' };
export const CODE_CITY = Object.fromEntries(Object.entries(CITY_CODE).map(([c, k]) => [k, c]));
const DAY_COLS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const r5 = x => Math.round(Number(x) * 1e5) / 1e5;

// '25:10:00' → 70 (a day's minutes: TDX's own times wrap at midnight).
export function gtfsMins(t) {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(t || ''));
  return m ? (Number(m[1]) * 60 + Number(m[2])) % 1440 : -1;
}
const hm = t => {
  const m = gtfsMins(t);
  return m < 0 ? '' : `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};
// calendar.txt's row → its days (bit 0 Sunday, as buses.js daysOf). (A
// service of no days and no added ones is TDX's with no ServiceDay: every
// day, as buses.js had it; tripDays.)
export const calendarBits = row => DAY_COLS.reduce((a, d, i) => a | (String(row?.[d]) === '1' ? 1 << i : 0), 0);
export const tripDays = (bits, ex) => (bits || ex?.add?.length ? bits : 127);
const isoDay = d => (/^\d{8}$/.test(d) ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6)}` : '');
// A service's added and dropped days (calendar_dates.txt) as TDX's SpecialDays: or null.
export function specialOf(ex) {
  const out = [];
  if (ex?.drop?.length) out.push({ Dates: ex.drop.map(isoDay).filter(Boolean).sort(), ServiceStatus: 0 });
  if (ex?.add?.length) out.push({ Dates: ex.add.map(isoDay).filter(Boolean).sort(), ServiceStatus: 1 });
  return out.length ? out : null;
}

// A sub-route's stops in its timetable's order, as buses.js packCity made
// it: each trip's stops in turn, each stop once, the first time it's seen.
export function orderOf(trips) {
  const seen = new Set();
  const order = [];
  for (const t of trips) for (const u of t.stops) if (!seen.has(u)) seen.add(u), order.push(u);
  return order;
}
// The stops of a sub-route's longest pattern (the most stops; of those the
// one most trips run): its way, where TDX's isn't had.
export function longestPattern(trips) {
  const count = new Map();
  for (const t of trips) {
    const k = t.stops.join(',');
    const c = count.get(k) || { stops: t.stops, n: 0 };
    c.n++;
    count.set(k, c);
  }
  let best = null;
  for (const c of count.values()) if (!best || c.stops.length > best.stops.length || (c.stops.length === best.stops.length && c.n > best.n)) best = c;
  return best ? best.stops : [];
}
const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

// One sub-route's timetable entry from its GTFS trips: `timed` [{ days,
// special, stops, times }] and `runs` [{ days, start, end, secs }]; `old`
// the last pack's entry for it, if any. → [sub, dir, order, trips, freq] or null.
export function subSched(sub, dir, { timed = [], runs = [] }, old = null, today = '') {
  // (Timed at its first stop only, as TDX had it: kept so.)
  const firstOnly = old && old[2].length === 1 && old[3].length;
  let order = orderOf(timed);
  if (firstOnly && order.length) order = [order.includes(old[2][0]) ? old[2][0] : order[0]];
  const at = new Map(order.map((u, i) => [u, i]));
  const trips = timed
    .map(t => {
      let times;
      if (firstOnly) {
        const k = t.stops.indexOf(order[0]);
        times = [t.times[k >= 0 ? k : 0]];
      } else {
        times = Array(order.length).fill(-1);
        t.stops.forEach((u, k) => (times[at.get(u)] = t.times[k]));
      }
      const set = new Set(times.filter(x => x >= 0));
      const one = set.size <= 1 ? ([...set][0] ?? -1) : null;
      const trip = [t.days, one ?? times];
      const special = t.special || keptSpecial(old, trip, today);
      if (special) trip.push(special);
      return trip;
    })
    .sort((a, b) => (typeof a[1] === 'number' ? a[1] : a[1].find(x => x >= 0) ?? -1) - (typeof b[1] === 'number' ? b[1] : b[1].find(x => x >= 0) ?? -1) || a[0] - b[0]);
  // (A run the last pack had, its least and most wait kept: GTFS's one is their mean, rounded down.)
  const had = old?.[4] || [];
  const freq = runs
    .map(r => {
      const start = hm(r.start);
      const end = hm(r.end);
      const mean = r.secs >= 60 ? Math.round(r.secs / 60) : r.secs;
      const was = had.find(f => f[0] === r.days && f[1] === start && f[2] === end && Math.floor((f[3] + f[4]) / 2) === mean);
      return was ? was.slice() : [r.days, start, end, mean, mean];
    })
    .filter(f => f[1] && f[2]);
  // (A run to midnight, '21:00' to '00:00', TDX's GTFS leaves out: the last
  // pack's kept, on the days the route still runs.)
  const ran = freq.reduce((a, f) => a | f[0], 0);
  for (const f of had) if (f[2] <= f[1] && f[0] & ran && !freq.some(x => x[0] === f[0] && x[1] === f[1])) freq.push(f.slice());
  const runsOnly = !timed.length;
  if (!trips.length && !freq.length) return null;
  return [sub, dir, runsOnly ? [] : order, trips, freq];
}

// The last pack's special days still to come for the same trip (its days
// and times), or null.
export function keptSpecial(old, trip, today) {
  if (!today) return null;
  const key = JSON.stringify(trip[1]);
  const was = (old?.[3] || []).find(t => t[0] === trip[0] && t[2] && JSON.stringify(t[1]) === key);
  const left = (was?.[2] || [])
    .map(sp => (sp.DatePeriod ? (sp.DatePeriod.EndDate >= today ? sp : null) : { ...sp, Dates: (sp.Dates || []).filter(d => d >= today) }))
    .filter(sp => sp && (sp.DatePeriod || sp.Dates.length));
  return left.length ? left : null;
}
// The sub-routes ('sub_dir') whose trips had special days still to come in the last pack.
export function specialSubs(old, today) {
  const out = new Set();
  for (const r of old?.routes || []) for (const s of r.sched) if (s[3].some(t => keptSpecial(s, t, today))) out.add(s[0]);
  return [...out];
}

// Each way of a city: its stops from the last pack (TDX's own), else from
// GTFS's longest pattern; and the sub-routes TDX is to be asked for (new
// ones GTFS has no trips for, and ones whose timetable's stops changed).
// `list`: TDX's sub-routes now ([{ route, routeName, sub, subName, dir }],
// a cheap select), or null (then the last pack's ways, and GTFS's sub-routes
// of routes it knew). `gtfs`: Map 'sub_dir' → { name, timed, runs }.
export function wayPlan({ old, list, gtfs }) {
  const oldWay = new Map();
  const oldSched = new Map();
  const routeOf = new Map();
  for (const r of old?.routes || []) {
    for (const w of r.ways) oldWay.set(`${w[0]}_${w[2]}`, w), routeOf.set(w[0], r);
    for (const s of r.sched) oldSched.set(`${s[0]}_${s[1]}`, s), routeOf.has(s[0]) || routeOf.set(s[0], r);
  }
  let entries = list;
  if (!entries) {
    entries = [];
    for (const r of old?.routes || []) for (const w of r.ways) entries.push({ route: r.uid, routeName: r.name, sub: w[0], subName: w[1], dir: w[2] });
    const have = new Set(entries.map(e => `${e.sub}_${e.dir}`));
    for (const [k, g] of gtfs) {
      if (have.has(k)) continue;
      const [sub, dir] = [k.slice(0, k.lastIndexOf('_')), Number(k.slice(k.lastIndexOf('_') + 1))];
      const r = routeOf.get(sub);
      if (r) entries.push({ route: r.uid, routeName: r.name, sub, subName: g.name || '', dir });
    }
  }
  const ways = [];
  const ask = new Set();
  for (const e of entries) {
    const k = `${e.sub}_${e.dir}`;
    const g = gtfs.get(k);
    const was = oldWay.get(k);
    const oldS = oldSched.get(k);
    const gOrder = g?.timed?.length ? orderOf(g.timed) : null;
    // (Its timed stops not what they were: the route changed, its way asked again.)
    const changed = Boolean(was && gOrder && oldS && oldS[2].length > 1 && gOrder.length > 1 && !same(gOrder, oldS[2]));
    const fromGtfs = g ? longestPattern([...(g.timed || []), ...(g.runs || [])]) : [];
    const stops = was && !changed ? was[3] : fromGtfs.length ? fromGtfs : was ? was[3] : null;
    if (!was || changed) ask.add(e.sub);
    ways.push({ ...e, stops });
  }
  return { ways, ask: [...ask] };
}

// A city's pack. `ways` from wayPlan (each way's `stops` replaced by
// `fetched` where TDX was asked: Map 'sub_dir' → [stopUid…]); `gtfs` its
// sub-routes' trips; `stops` GTFS's stops (Map uid → [name, lat, lon]),
// `fetchedStops` those TDX gave, the last pack's for the rest.
export function cityPack({ city, built, old, ways, fetched = new Map(), gtfs, stops, fetchedStops = {}, own = new Map(), today = '' }) {
  const routes = new Map();
  const route = (uid, name) => (routes.has(uid) ? routes.get(uid) : routes.set(uid, { uid, name, ways: [], sched: [] }).get(uid));
  const oldSched = new Map();
  const routeOf = new Map();
  for (const r of old?.routes || []) for (const s of r.sched) oldSched.set(`${s[0]}_${s[1]}`, s);
  for (const w of ways) {
    const k = `${w.sub}_${w.dir}`;
    const list = fetched.get(k) || w.stops;
    routeOf.set(w.sub, [w.route, w.routeName]);
    if (!list) continue;
    route(w.route, w.routeName).ways.push([w.sub, w.subName, w.dir, list]);
  }
  // (A sub-route with a timetable and no way of its own: under the route its others are, else the last pack's.)
  for (const r of old?.routes || []) for (const s of r.sched) if (!routeOf.has(s[0])) routeOf.set(s[0], [r.uid, r.name]);
  // Timetables in the last pack's order, then new ones.
  // (`own`: TDX's own entries, 'sub_dir' → entry, over GTFS's.)
  const keys = [...new Set([...oldSched.keys(), ...gtfs.keys(), ...own.keys()])];
  for (const k of keys) {
    const g = gtfs.get(k);
    if (!g && !own.has(k)) continue;
    const i = k.lastIndexOf('_');
    const [sub, dir] = [k.slice(0, i), Number(k.slice(i + 1))];
    const r = routeOf.get(sub);
    if (!r) continue;
    const s = own.get(k) || subSched(sub, dir, g, oldSched.get(k), today);
    if (s) route(r[0], r[1]).sched.push(s);
  }
  const oldStops = old?.stops || {};
  const used = new Set();
  for (const r of routes.values()) {
    for (const w of r.ways) for (const u of w[3]) used.add(u);
    for (const s of r.sched) for (const u of s[2]) used.add(u);
  }
  const packStops = {};
  for (const u of used) {
    const s = stops.get(u) || fetchedStops[u] || oldStops[u];
    packStops[u] = s ? [s[0], s[1] == null ? null : r5(s[1]), s[2] == null ? null : r5(s[2])] : ['', null, null];
  }
  // Routes in the last pack's order, then new ones.
  const rank = new Map((old?.routes || []).map((r, i) => [r.uid, i]));
  const list = [...routes.values()].filter(r => r.ways.length || r.sched.length);
  list.sort((a, b) => (rank.get(a.uid) ?? 1e9) - (rank.get(b.uid) ?? 1e9));
  return { v: 1, city, built, stops: packStops, routes: list };
}

// TDX's StopOfRoute rows (asked for the subs wayPlan named) → their ways
// and stops: { ways: Map 'sub_dir' → [uid…], stops: { uid: [name, lat, lon] } }.
export function tdxWays(rows) {
  const ways = new Map();
  const stops = {};
  const zh = x => (typeof x === 'string' ? x : x?.Zh_tw || '');
  for (const r of rows || []) {
    const list = (r.Stops || []).slice().sort((a, b) => (a.StopSequence || 0) - (b.StopSequence || 0));
    for (const s of list) stops[s.StopUID] ||= [zh(s.StopName), r5(s.StopPosition?.PositionLat), r5(s.StopPosition?.PositionLon)];
    ways.set(`${r.SubRouteUID || ''}_${Number(r.Direction) || 0}`, list.map(s => s.StopUID));
  }
  return { ways, stops };
}

// A city's shapes, as buses.js cityShapes made them: { 'RouteUID|dir':
// [[sub, encoded]] }, each line simplified within 12 m. `lines`: Map
// 'sub_dir' → [[lat, lon]…] (GTFS's shapes, by their id); a sub-route
// without one keeps the last pack's line.
export function cityLines(pack, lines, old = {}) {
  const shapes = {};
  const squares = new Map();
  for (const r of pack.routes) {
    const subs = new Map();
    for (const w of r.ways) subs.set(`${w[0]}_${w[2]}`, [w[0], w[2]]);
    for (const s of r.sched) subs.has(`${s[0]}_${s[1]}`) || subs.set(`${s[0]}_${s[1]}`, [s[0], s[1]]);
    for (const [k, [sub, dir]] of subs) {
      const key = `${r.uid}|${dir}`;
      const pts = lines.get(k);
      let enc = null;
      let at = null;
      if (pts?.length > 1) {
        at = simplify(pts);
        enc = encode(at);
      } else {
        const was = (old[key] || []).find(x => x[0] === sub);
        if (was) enc = was[1];
      }
      if (!enc) continue;
      const list = (shapes[key] ||= []);
      if (!list.some(x => x[0] === sub)) list.push([sub, enc]);
      if (pack.city === 'InterCity') for (const sq of new Set((at || decode(enc)).map(([a, b]) => squareOf(a, b)))) (squares.get(sq) || squares.set(sq, new Set()).get(sq)).add(key);
    }
  }
  // (A route's line with none from GTFS for any of its sub-routes: the last one whole.)
  for (const r of pack.routes)
    for (const dir of [0, 1, 2]) {
      const key = `${r.uid}|${dir}`;
      if (shapes[key] || !old[key]) continue;
      shapes[key] = old[key];
      if (pack.city === 'InterCity') for (const [, enc] of old[key]) for (const sq of new Set(decode(enc).map(([a, b]) => squareOf(a, b)))) (squares.get(sq) || squares.set(sq, new Set()).get(sq)).add(key);
    }
  return { shapes, squares };
}
// Google's encoded polyline back to [[lat, lon]…].
export function decode(str) {
  const out = [];
  let [i, lat, lon] = [0, 0, 0];
  const one = () => {
    let [b, shift, res] = [0, 0, 0];
    do {
      b = str.charCodeAt(i++) - 63;
      res |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    return res & 1 ? ~(res >> 1) : res >> 1;
  };
  while (i < String(str || '').length) {
    lat += one();
    lon += one();
    out.push([lat / 1e5, lon / 1e5]);
  }
  return out;
}

// where.json: the packs' stops in 0.02° cells, and the YouBike cities' cells
// as the last one had them (their stations come from YouBike's own list now,
// transit-free.js: kept as they were).
export function whereOf(packs, old, built, cell = 0.02) {
  const cellOf = (lat, lon) => `${Math.floor(lat / cell)}_${Math.floor(lon / cell)}`;
  const names = [];
  const cells = new Map();
  const mark = (c, k) => (cells.get(c) || cells.set(c, new Set()).get(c)).add(k);
  for (const [name, p] of packs) {
    const k = names.push(name) - 1;
    const [la, lo] = name.startsWith('InterCity/') ? name.slice(10).split('_').map(Number) : [null, null];
    for (const [, lat, lon] of Object.values(p.stops)) {
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      if (la != null && !(lat >= la && lat < la + 0.25 && lon >= lo && lon < lo + 0.25)) continue;
      mark(cellOf(lat, lon), k);
    }
  }
  const bikes = (old?.packs || []).map((n, i) => [n, i]).filter(([n]) => n.startsWith('bike:'));
  for (const [n, i] of bikes) {
    const k = names.push(n) - 1;
    for (const [c, list] of Object.entries(old.cells || {})) if (list.includes(i)) mark(c, k);
  }
  return { v: 1, built, cell, packs: names, cells: Object.fromEntries([...cells].map(([c, s]) => [c, [...s].sort((a, b) => a - b)])) };
}

// 高鐵's trains from GTFS (route THSR_<no>_<dir>, stops THSR_<id>, a date
// each in calendar_dates) for transit-free.js hsrDay: { v, built, stations:
// { id: [zh, en] }, trains: [[no, [[id, 'HH:MM', 'HH:MM']…]]], days: {
// 'YYYY-MM-DD': [train…] } }, each train's timetable once.
export const HSR_EN = { '0990': 'Nangang', 1000: 'Taipei', 1010: 'Banqiao', 1020: 'Taoyuan', 1030: 'Hsinchu', 1035: 'Miaoli', 1040: 'Taichung', 1043: 'Changhua', 1047: 'Yunlin', 1050: 'Chiayi', 1060: 'Tainan', 1070: 'Zuoying' };
export function hsrPack(trips, names, built) {
  const trains = [];
  const at = new Map();
  const days = {};
  const used = new Set();
  for (const t of trips) {
    const stops = t.stops.map(([id, a, d]) => [String(id).replace(/^THSR_/, ''), a, d]);
    if (stops.length < 2) continue;
    const k = JSON.stringify([t.no, stops]);
    if (!at.has(k)) at.set(k, trains.push([t.no, stops]) - 1);
    for (const s of stops) used.add(s[0]);
    for (const d of t.dates) {
      const day = isoDay(d);
      if (day) (days[day] ||= []).push(at.get(k));
    }
  }
  for (const d of Object.values(days)) d.sort((a, b) => a - b);
  const stations = Object.fromEntries([...used].sort().map(id => [id, [names[`THSR_${id}`] || names[id] || '', HSR_EN[id] || '']]));
  return { v: 1, built, stations, trains, days: Object.fromEntries(Object.entries(days).sort()) };
}

// ---- The metros ---------------------------------------------------------------------------

// What Orbit Transit reads of each system (its lib/metro.mjs and
// metroroute.mjs: TDX refuses the rest), copied whole from TDX to R2
// (rail/metro/<SYS>/<Kind>.json; a station's timetable alone:
// rail/metro/<SYS>/StationTimeTable/<StationID>.json, what TDX's
// `$filter=StationID eq '…'` answers) for transit-free.js metroFree.
const ALL = ['Station', 'StationOfLine', 'Line', 'StationOfRoute'];
export const METRO_KINDS = {
  TRTC: [...ALL, 'LineTransfer', 'StationExit', 'Frequency', 'S2STravelTime', 'StationTimeTable'],
  NTMC: [...ALL, 'LineTransfer', 'StationExit', 'Frequency', 'S2STravelTime', 'StationTimeTable'],
  NTDLRT: [...ALL, 'StationTimeTable'],
  NTALRT: [...ALL, 'StationTimeTable'],
  TRTCMG: [...ALL, 'StationExit'],
  TYMC: [...ALL, 'StationExit', 'Frequency', 'S2STravelTime', 'StationTimeTable'],
  TMRT: [...ALL, 'StationExit', 'Frequency', 'S2STravelTime'],
  KRTC: [...ALL, 'LineTransfer', 'StationExit', 'Frequency', 'S2STravelTime', 'StationTimeTable'],
  KLRT: [...ALL, 'S2STravelTime', 'StationTimeTable']
};
export const METRO = Object.keys(METRO_KINDS);
// A GTFS id's system ('TRTC_BL_BL-1_0_T_…' → 'TRTC'), or '' when not a metro's.
export const metroOf = id => {
  const s = String(id).slice(0, String(id).indexOf('_'));
  return Object.hasOwn(METRO_KINDS, s) ? s : '';
};
// The systems to ask again, the changed first, then the longest asked:
// a system GTFS says changed (its trips, times, stops: `sig`), or a month on
// (each run while TDX is paid).
export function metroDue(index, sigs, { paid = false, now = Date.now(), days = 28 } = {}) {
  const sys = index?.systems || {};
  const age = s => now - (Date.parse(sys[s]?.asked || '') || 0);
  const changed = s => !sys[s] || (sigs[s] && sys[s].sig !== sigs[s]);
  return METRO.filter(s => paid || changed(s) || age(s) > days * 86_400_000).sort((a, b) => changed(b) - changed(a) || age(b) - age(a));
}
// A system's answers ({ Kind: rows }) → its files ([path, rows]): each kind
// whole, the timetable a station at a time (every station of the system,
// [] where TDX has none: what its filter answers).
export function metroFiles(sys, got) {
  const out = [];
  for (const [kind, rows] of Object.entries(got)) {
    if (kind !== 'StationTimeTable') {
      out.push([`${kind}`, rows]);
      continue;
    }
    const by = new Map((got.Station || []).map(s => [s.StationID, []]));
    for (const r of rows) (by.get(r.StationID) || by.set(r.StationID, []).get(r.StationID)).push(r);
    for (const [id, list] of by) if (/^[A-Za-z0-9-]+$/.test(id || '')) out.push([`StationTimeTable/${id}`, list]);
  }
  return out.map(([k, rows]) => [`rail/metro/${sys}/${k}.json`, rows]);
}
