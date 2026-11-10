#!/usr/bin/env node
// The weekly bus build, on GitHub (.github/workflows/buses.yml): Taiwan's
// bus packs, their lines and where.json made from TDX's GTFS (its free
// download: 0 points; 470 MB zipped, past what a Worker holds), with the
// last packs' ways kept and TDX asked only for what GTFS can't say (new or
// changed sub-routes, a few filtered calls: builders/gtfs.js). The rules are
// builders/gtfs.js's; this reads the files, asks the proxy, writes the result.
//
//   node tools/gtfs-buses.mjs [--gtfs <dir> | --zip <file>] [--out <dir>]
//        [--only Taipei,Hsinchu] [--no-tdx] [--stations N] [--push]
//
// Through the proxy (ORBIT_API, its workers.dev address by default) with
// DATA_PUSH_SECRET: /transit/gtfs (the zip), /transit/tdx (the build door,
// its own month of TDX points: transit.js buildTdxRoom), /data/push (only the
// files that changed: a pack whose routes didn't change keeps its bytes and
// phones keep theirs). Without --push it only writes --out (to compare).

import { createReadStream, existsSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { CITIES, squares, cityStations, TILE, simplify, schedOf } from '../builders/buses.js';
import { CITY_CODE, CODE_CITY, calendarBits, tripDays, specialOf, gtfsMins, wayPlan, cityPack, tdxWays, cityLines, whereOf, specialSubs, hsrPack, METRO, METRO_KINDS, metroOf, metroDue, metroFiles } from '../builders/gtfs.js';
import { fillNewTaipei } from '../builders/ntpc.js';
import { tdxPlan } from '../transit.js';

const args = process.argv.slice(2);
const opt = (name, dflt = null) => {
  const i = args.indexOf(`--${name}`);
  return i < 0 ? dflt : args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true;
};
const API = (process.env.ORBIT_API || 'https://orbit-workers-proxy.pengzjay.workers.dev').replace(/\/$/, '');
const SECRET = process.env.DATA_PUSH_SECRET || '';
const ONLY = opt('only') ? String(opt('only')).split(',') : null;
// 高鐵's days and the metros: on a whole run, or `--only Rail`.
const RAIL = !ONLY || ONLY.includes('Rail');
const NO_TDX = Boolean(opt('no-tdx')) || !SECRET;
const OUT = opt('out');
const PUSH = Boolean(opt('push'));
const now = Date.now();
const built = new Date(now).toISOString();
const today = new Date(now + 8 * 3_600_000).toISOString().slice(0, 10);
const paid = tdxPlan(now).paid;
// TDX's bytes this run may read (its billed size: 150 MB a basic point): the
// free tier's 3 points a month are people's first.
const TDX_BYTES = Number(opt('tdx-mb', paid ? 80 : 24)) * 1e6;
// A city's stations asked again once this old, this many cities a run.
const STATION_DAYS = paid ? 21 : 60;
const STATIONS = Number(opt('stations', paid ? 23 : 2));
const log = (...a) => console.log(...a);
const cities = CITIES.filter(c => !ONLY || ONLY.includes(c));

// ---- The proxy ----------------------------------------------------------------------------

const auth = SECRET ? { Authorization: `Bearer ${SECRET}` } : {};
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function data(path) {
  for (let tries = 0; ; tries++) {
    const r = await fetch(`${API}/data/${path}`).catch(e => ({ ok: false, status: String(e) }));
    if (r.ok) return r.json();
    if (r.status === 404) return null;
    if (tries >= 3) throw new Error(`${path}: ${r.status}`);
    await sleep(2000 * (tries + 1));
  }
}
let tdxBytes = 0;
let tdxCalls = 0;
// One TDX answer through the build door: waited for when TDX's minute is spent.
async function tdx(path) {
  if (NO_TDX) throw new Error('no TDX');
  if (tdxBytes >= TDX_BYTES) throw Object.assign(new Error('this run’s TDX bytes spent'), { budget: true });
  for (let tries = 0; ; tries++) {
    // (One every 15 s at most on the free tier, its 5 a minute shared with people.)
    await sleep(paid ? 300 : 15_000);
    const r = await fetch(`${API}/transit/tdx?p=${encodeURIComponent(path)}`, { headers: auth }).catch(e => ({ ok: false, status: String(e), text: async () => '' }));
    const text = await r.text();
    if (r.ok) {
      tdxCalls++;
      tdxBytes += Buffer.byteLength(text);
      return JSON.parse(text);
    }
    if (/BUILD_TDX_CAP/.test(text)) throw Object.assign(new Error('the build’s TDX month spent'), { budget: true });
    // (TDX's own no, through the proxy: asked again it says no again.)
    const up = /"upstream":(4\d\d)/.exec(text);
    if (up && up[1] !== '429') throw Object.assign(new Error(`${path.slice(0, 90)}: TDX ${up[1]} ${text.slice(0, 160)}`), { status: Number(up[1]) });
    if (tries >= 5 || r.status === 400 || r.status === 404 || r.status === 403) throw Object.assign(new Error(`${path.slice(0, 90)}: ${r.status} ${text.slice(0, 120)}`), { status: r.status });
    await sleep(20_000 * (tries + 1));
  }
}
// buses.js's client shape (pages of `top`), through the door.
const doorClient = {
  pages: async (path, top, each) => {
    for (let skip = 0; ; skip += top) {
      const rows = await tdx(`${path}${path.includes('?') ? '&' : '?'}$top=${top}&$skip=${skip}`);
      if (!Array.isArray(rows)) throw new Error(`${path}: not a list`);
      each(rows);
      if (rows.length < top) return;
    }
  }
};

// ---- GTFS's files -------------------------------------------------------------------------

function gtfsDir() {
  if (opt('gtfs')) return String(opt('gtfs'));
  const dir = join(tmpdir(), `gtfs-${now}`);
  mkdirSync(dir, { recursive: true });
  let zip = opt('zip');
  if (!zip) {
    zip = join(dir, 'gtfs.zip');
    log('GTFS: downloading');
    execFileSync('curl', ['-sS', '--fail', '--retry', '3', '--max-time', '1200', '-H', `Authorization: Bearer ${SECRET}`, '-o', zip, `${API}/transit/gtfs`], { stdio: 'inherit' });
  }
  const want = ['stops.txt', 'routes.txt', 'trips.txt', 'stop_times.txt', 'calendar.txt', 'calendar_dates.txt', 'frequencies.txt', 'shapes.txt'];
  execFileSync('unzip', ['-o', '-q', zip, ...want, '-d', dir], { stdio: 'inherit' });
  return dir;
}
// A CSV line's cells (GTFS's: quoted only when a comma or quote is in one).
function cells(line) {
  if (!line.includes('"')) return line.split(',');
  const out = [];
  let cell = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i + 1] === '"') (cell += '"'), i++;
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') out.push(cell), (cell = '');
    else cell += c;
  }
  out.push(cell);
  return out;
}
async function eachRow(file, fn) {
  if (!existsSync(file)) return;
  const rl = createInterface({ input: createReadStream(file, { encoding: 'utf8' }), crlfDelay: Infinity });
  let head = null;
  for await (const raw of rl) {
    if (!raw) continue;
    if (!head) {
      head = Object.fromEntries(cells(raw.replace(/^﻿/, '')).map((h, i) => [h.trim(), i]));
      continue;
    }
    fn(cells(raw), head);
  }
}

// '24:10:00' → '00:10'.
const clock = t => {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(t || ''));
  return m ? `${String(Number(m[1]) % 24).padStart(2, '0')}:${m[2]}` : '';
};
async function readGtfs(dir) {
  // (高鐵's too, THSR_…: its days for transit-free.js hsrDay.)
  const codes = new Set([...cities.map(c => CITY_CODE[c]), ...(RAIL ? ['THS'] : [])]);
  const mine = id => codes.has(String(id).slice(0, 3));
  // Each metro's GTFS (its stops, routes, trips, times, days: not the dates
  // they're good from and to), as one fingerprint: asked of TDX again when it changes.
  const sig = new Map();
  const mark = (sys, c) => RAIL && sys && (sig.get(sys) || sig.set(sys, createHash('sha1')).get(sys)).update(`${c.join(',')}\n`);
  const metroTrip = new Map();
  const stops = new Map();
  const intern = new Map();
  const sid = u => intern.get(u) || (intern.set(u, u), u);
  await eachRow(join(dir, 'stops.txt'), (c, h) => {
    const id = c[h.stop_id];
    mark(metroOf(id), c);
    if (!mine(id) || (c[h.location_type] && c[h.location_type] !== '0')) return;
    const lat = Number(c[h.stop_lat]);
    const lon = Number(c[h.stop_lon]);
    stops.set(sid(id), [c[h.stop_name] || '', lat > 0 ? lat : null, lon > 0 ? lon : null]);
  });
  const routes = new Map();
  await eachRow(join(dir, 'routes.txt'), (c, h) => (mark(metroOf(c[h.route_id]), c), mine(c[h.route_id]) && routes.set(c[h.route_id], c[h.route_short_name] || c[h.route_long_name] || '')));
  const cal = new Map();
  await eachRow(join(dir, 'calendar.txt'), (c, h) => {
    mark(metroOf(c[h.service_id]), c.filter((_, i) => i !== h.start_date && i !== h.end_date));
    cal.set(c[h.service_id], calendarBits(Object.fromEntries(Object.entries(h).map(([k, i]) => [k, c[i]]))));
  });
  const ex = new Map();
  await eachRow(join(dir, 'calendar_dates.txt'), (c, h) => {
    const s = c[h.service_id];
    const e = ex.get(s) || ex.set(s, { add: [], drop: [] }).get(s);
    (c[h.exception_type] === '1' ? e.add : e.drop).push(c[h.date]);
  });
  const trips = new Map();
  await eachRow(join(dir, 'trips.txt'), (c, h) => {
    const r = c[h.route_id];
    const ms = metroOf(r);
    if (ms && RAIL) mark(ms, c), metroTrip.set(c[h.trip_id], ms);
    if (routes.has(r)) trips.set(c[h.trip_id], { route: r, service: c[h.service_id], shape: c[h.shape_id] || r, stops: null, times: null, rail: r.startsWith('THSR_') });
  });
  const freq = new Map();
  await eachRow(join(dir, 'frequencies.txt'), (c, h) => {
    mark(metroTrip.get(c[h.trip_id]), c);
    if (!trips.has(c[h.trip_id])) return;
    (freq.get(c[h.trip_id]) || freq.set(c[h.trip_id], []).get(c[h.trip_id])).push({ start: c[h.start_time], end: c[h.end_time], secs: Number(c[h.headway_secs]) || 0 });
  });
  // Each trip's stops (one shared list for each pattern) and times, a trip at a time.
  const patterns = new Map();
  let cur = null;
  let rows = [];
  const flush = () => {
    const t = cur && trips.get(cur);
    if (t && rows.length) {
      rows.sort((a, b) => a[0] - b[0]);
      const list = rows.map(r => r[1]);
      const k = list.join(',');
      const stopsOf = patterns.get(k) || patterns.set(k, list).get(k);
      // (A trip's rows met twice: joined. GTFS's are each in one run.)
      if (t.stops) {
        const both = [...t.stops.map((u, i) => [i, u, t.times[i]]), ...rows.map((r, i) => [t.stops.length + i, r[1], r[2]])];
        t.stops = both.map(x => x[1]);
        t.times = both.map(x => x[2]);
      } else {
        t.stops = stopsOf;
        t.times = Int16Array.from(rows.map(r => r[2]));
        if (t.rail) t.hm = rows.map(r => [r[3], r[4]]);
      }
    }
    rows = [];
  };
  await eachRow(join(dir, 'stop_times.txt'), (c, h) => {
    const id = c[h.trip_id];
    if (id !== cur) flush(), (cur = id);
    const t = trips.get(id);
    if (!t) return void mark(metroTrip.get(id), c);
    rows.push([Number(c[h.stop_sequence]), sid(c[h.stop_id]), gtfsMins(c[h.departure_time] || c[h.arrival_time]), ...(t.rail ? [clock(c[h.arrival_time]), clock(c[h.departure_time])] : [])]);
  });
  flush();
  // By city, by sub-route ('sub_dir'), in trips.txt's order.
  const byCity = new Map(cities.map(c => [c, new Map()]));
  for (const [id, t] of trips) {
    if (!t.stops) continue;
    const city = CODE_CITY[t.route.slice(0, 3)];
    const m = byCity.get(city);
    if (!m) continue;
    const g = m.get(t.route) || m.set(t.route, { name: routes.get(t.route), timed: [], runs: [], shape: t.shape }).get(t.route);
    const days = tripDays(cal.get(t.service) ?? 0, ex.get(t.service));
    const f = freq.get(id);
    if (f) for (const x of f) g.runs.push({ days, start: x.start, end: x.end, secs: x.secs, stops: t.stops });
    else g.timed.push({ days, special: specialOf(ex.get(t.service)), stops: t.stops, times: [...t.times] });
  }
  const hsr = [...trips.values()].filter(t => t.rail && t.hm).map(t => ({ no: t.route.split('_')[1], dates: ex.get(t.service)?.add || [], stops: t.stops.map((u, i) => [u, ...t.hm[i]]) }));
  const hsrNames = Object.fromEntries([...stops].filter(([u]) => u.startsWith('THSR_')).map(([u, v]) => [u, v[0]]));
  log(`GTFS: ${stops.size} stops, ${trips.size} trips, ${patterns.size} patterns, ${hsr.length} 高鐵 trips, metros ${[...sig.keys()].join(' ')}`);
  return { stops, byCity, hsr, hsrNames, metroSigs: Object.fromEntries([...sig].map(([k, v]) => [k, v.digest('hex').slice(0, 16)])) };
}
// GTFS's lines by shape id, simplified as they come (only the ones wanted).
async function readLines(dir, want) {
  const lines = new Map();
  let cur = null;
  let pts = [];
  const flush = () => {
    if (cur && pts.length > 1) lines.set(cur, simplify(pts.sort((a, b) => a[2] - b[2]).map(p => [p[0], p[1]])));
    pts = [];
  };
  await eachRow(join(dir, 'shapes.txt'), (c, h) => {
    const id = c[h.shape_id];
    if (id !== cur) flush(), (cur = id);
    if (want.has(id)) pts.push([Number(c[h.shape_pt_lat]), Number(c[h.shape_pt_lon]), Number(c[h.shape_pt_sequence])]);
  });
  flush();
  return lines;
}

// ---- The last build ----------------------------------------------------------------------

// InterCity's squares as one pack again (each route once).
function joinSquares(parts) {
  const stops = {};
  const routes = new Map();
  for (const p of parts) {
    Object.assign(stops, p.stops);
    for (const r of p.routes) if (!routes.has(r.uid)) routes.set(r.uid, r);
  }
  return { v: 1, city: 'InterCity', stops, routes: [...routes.values()] };
}

// ---- The run -----------------------------------------------------------------------------

const out = new Map(); // path → data
const old = new Map(); // path → data, as the site has it
const put = (path, d) => out.set(path, d);

async function main() {
  const index = (await data('index.json')) || { cities: {} };
  old.set('index.json', JSON.parse(JSON.stringify(index)));
  const dir = gtfsDir();
  const { stops, byCity, hsr, hsrNames, metroSigs } = await readGtfs(dir);
  // 高鐵's next four weeks (a day TDX's GTFS has, the proxy answers without TDX).
  if (RAIL) {
    const p = hsrPack(hsr, hsrNames, built);
    if (Object.keys(p.days).length >= 7 && p.trains.length >= 100) put('rail/thsr.json', p);
    else log(`高鐵: ${Object.keys(p.days).length} days, ${p.trains.length} trains: not written`);
  }
  const done = [];
  const failed = {};
  const asked = {};
  const packs = new Map();
  for (const city of cities) {
    try {
      let last;
      if (city === 'InterCity') {
        const parts = [];
        for (const k of Object.keys(index.squares || {})) {
          const p = await data(`bus/InterCity/${k}.json`);
          if (p) parts.push(p), old.set(`bus/InterCity/${k}.json`, p);
        }
        last = parts.length ? joinSquares(parts) : null;
      } else {
        last = await data(`bus/${city}.json`);
        if (last) old.set(`bus/${city}.json`, last);
      }
      const gtfs = byCity.get(city) || new Map();
      // TDX's sub-routes now (a cheap select: no stops), else the last pack's.
      const scope = city === 'InterCity' ? 'InterCity' : `City/${city}`;
      let list = null;
      try {
        const rows = await tdx(`basic/v2/Bus/StopOfRoute/${scope}?$select=RouteUID,RouteName,SubRouteUID,SubRouteName,Direction&$top=20000`);
        const zh = x => (typeof x === 'string' ? x : x?.Zh_tw || '');
        if (Array.isArray(rows) && rows.length) list = rows.map(r => ({ route: r.RouteUID, routeName: zh(r.RouteName), sub: r.SubRouteUID || '', subName: zh(r.SubRouteName), dir: Number(r.Direction) || 0 }));
      } catch (e) {
        log(`${city}: TDX's list not had (${e.message}): the last pack's ways`);
      }
      const plan = wayPlan({ old: last, list, gtfs });
      // The sub-routes GTFS can't say, from TDX: 20 to a call.
      const fetched = new Map();
      let fetchedStops = {};
      if (plan.ask.length && !NO_TDX) {
        for (let i = 0; i < plan.ask.length; i += 20) {
          const subs = plan.ask.slice(i, i + 20);
          try {
            const rows = await tdx(`basic/v2/Bus/StopOfRoute/${scope}?$filter=${subs.map(s => `SubRouteUID eq '${s}'`).join(' or ')}&$top=200`);
            const got = tdxWays(rows);
            for (const [k, v] of got.ways) fetched.set(k, v);
            fetchedStops = { ...fetchedStops, ...got.stops };
          } catch (e) {
            if (e.budget) break;
            log(`${city}: ways asked of TDX failed (${e.message})`);
          }
        }
        asked[city] = { ask: plan.ask.length, got: fetched.size };
      }
      // The sub-routes with special days (未營運 a while): TDX's own timetable for them (GTFS has none).
      const own = new Map();
      const spec = specialSubs(last, today);
      if (spec.length && !NO_TDX) {
        for (let i = 0; i < spec.length; i += 20) {
          try {
            const rows = await tdx(`basic/v2/Bus/Schedule/${scope}?$filter=${spec.slice(i, i + 20).map(s => `SubRouteUID eq '${s}'`).join(' or ')}&$top=200`);
            for (const r of Array.isArray(rows) ? rows : []) {
              const e = schedOf(r, {});
              own.set(`${e[0]}_${e[1]}`, e);
            }
          } catch (e) {
            if (e.budget) break;
            log(`${city}: special days asked of TDX failed (${e.message})`);
          }
        }
        asked[city] = { ...asked[city], special: spec.length, gotSpecial: own.size };
      }
      const pack = cityPack({ city, built, old: last, ways: plan.ways, fetched, gtfs, stops, fetchedStops, own, today });
      if (city === 'NewTaipei') await fillNewTaipei(pack).catch(() => 0);
      // (No routes, or under half what it had: a read gone wrong, the pack there stays.)
      const had = last?.routes?.length || index.cities?.[city]?.routes || 0;
      if (!pack.routes.length || pack.routes.length < had / 2) throw new Error(`${pack.routes.length} routes, had ${had}`);
      packs.set(city, pack);
      done.push(city);
    } catch (e) {
      failed[city] = String(e?.message || e).slice(0, 200);
      log(`${city}: kept as it was (${failed[city]})`);
    }
  }
  // Their lines: GTFS's, the last ones where it has none.
  const want = new Set();
  for (const g of byCity.values()) for (const v of g.values()) want.add(v.shape);
  const lines = await readLines(dir, want);
  const byShape = new Map();
  for (const g of byCity.values()) for (const [k, v] of g) if (lines.has(v.shape)) byShape.set(k, lines.get(v.shape));
  for (const [city, pack] of packs) {
    let oldShapes = {};
    if (city === 'InterCity') {
      for (const f of (index.shapes || []).filter(s => s.startsWith('shape/bus/InterCity/'))) {
        const s = await data(f);
        if (s) old.set(f, s), Object.assign(oldShapes, s.shapes);
      }
    } else {
      const s = await data(`shape/bus/${city}.json`);
      if (s) old.set(`shape/bus/${city}.json`, s), (oldShapes = s.shapes || {});
    }
    const { shapes, squares: sq } = cityLines(pack, byShape, oldShapes);
    if (city === 'InterCity') {
      const parts = squares(pack);
      for (const [k, p] of Object.entries(parts)) put(`bus/InterCity/${k}.json`, p);
      index.squares = Object.fromEntries(Object.entries(parts).map(([k, p]) => [k, JSON.stringify(p).length]));
      index.cities[city] = { routes: pack.routes.length, bytes: Object.values(index.squares).reduce((a, b) => a + b, 0), squares: Object.keys(parts).length, built };
      for (const [k, keys] of sq) put(`shape/bus/InterCity/${k}.json`, { v: 1, city, square: k, built, shapes: Object.fromEntries([...keys].sort().map(x => [x, shapes[x]])) });
    } else {
      put(`bus/${city}.json`, pack);
      index.cities[city] = { routes: pack.routes.length, bytes: JSON.stringify(pack).length, built };
      put(`shape/bus/${city}.json`, { v: 1, city, built, shapes });
    }
  }
  // where.json from every pack (the ones not rebuilt as they were).
  if (packs.size) {
    const all = [];
    for (const c of CITIES.filter(c => c !== 'InterCity')) {
      const p = packs.get(c) || old.get(`bus/${c}.json`) || (await data(`bus/${c}.json`));
      if (p) all.push([c, p]);
    }
    for (const k of Object.keys(index.squares || {})) {
      const p = out.get(`bus/InterCity/${k}.json`) || old.get(`bus/InterCity/${k}.json`) || (await data(`bus/InterCity/${k}.json`));
      if (p) all.push([`InterCity/${k}`, p]);
    }
    const lastWhere = await data('where.json');
    if (lastWhere) old.set('where.json', lastWhere);
    if (!ONLY) put('where.json', whereOf(all, lastWhere, built));
    index.built = built;
  }
  // The stations: the cities asked longest ago, once that old, a few a run.
  const stationAge = c => now - (Date.parse(index.stations?.[c]?.built || '') || 0);
  const stale = cities.filter(c => stationAge(c) > STATION_DAYS * 86_400_000).sort((a, b) => stationAge(b) - stationAge(a)).slice(0, STATIONS);
  const stationsDone = [];
  for (const city of NO_TDX ? [] : stale) {
    try {
      const got = await cityStations(doorClient, city);
      const had = index.stations?.[city]?.stations || 0;
      if (!got.stations || got.stations < had / 2) throw new Error(`${got.stations} stations, had ${had}`);
      for (const [k, t] of Object.entries(got.tiles)) put(`station/${city}/${k}.json`, { v: 1, city, tile: k, built, ...t });
      (index.stations ||= {})[city] = { stations: got.stations, tiles: Object.keys(got.tiles).sort(), built };
      stationsDone.push(city);
    } catch (e) {
      if (e?.status === 400 || e?.status === 404) (index.stations ||= {})[city] = { stations: 0, tiles: [], built, refused: e.status };
      else failed[`stations:${city}`] = String(e?.message || e).slice(0, 160);
      if (e?.budget) break;
    }
  }
  // The metros last (the buses' asks first, on a small month).
  const metro = RAIL ? await metros(metroSigs, failed) : null;
  if (stationsDone.length && CITIES.every(c => index.stations?.[c])) put('station/index.json', { v: 1, built, tile: TILE, cities: Object.fromEntries(CITIES.map(c => [c, index.stations[c].tiles])) });
  index.shapes = [...new Set([...(index.shapes || []).filter(s => !s.startsWith('shape/bus/InterCity/') || !packs.has('InterCity')), ...[...out.keys()].filter(p => p.startsWith('shape/'))])].sort();
  if (done.length || stationsDone.length) put('index.json', index);

  // What changed (each file's meaning, its `built` stamp aside).
  const meaning = d => JSON.stringify({ ...d, built: undefined });
  const changed = [];
  for (const [path, d] of out) {
    let was = old.get(path);
    if (was === undefined && !/^(station|rail\/metro)\//.test(path)) was = await data(path).catch(() => null);
    if (path === 'index.json' || !was || meaning(was) !== meaning(d)) changed.push(path);
  }
  if (OUT) {
    for (const [path, d] of out) {
      const f = join(String(OUT), path);
      mkdirSync(dirname(f), { recursive: true });
      writeFileSync(f, JSON.stringify(d));
    }
  }
  const report = { built, gtfs: true, cities: done.length, failed, asked, metro, tdx: { calls: tdxCalls, mb: Math.round(tdxBytes / 1e4) / 100, points: Math.round((tdxBytes / 150e6 + tdxCalls / 1500) * 1000) / 1000 }, stations: stationsDone, files: out.size, changed: changed.length };
  if (PUSH && changed.length) report.pushed = await push(changed);
  log(JSON.stringify(report, null, 1));
  if (!opt('gtfs') && !opt('keep')) rmSync(dir, { recursive: true, force: true });
  if (!done.length && cities.length) process.exitCode = 1;
}

// ---- The metros ---------------------------------------------------------------------------

// Each system TDX's GTFS says changed (or a month on; each run while TDX is
// paid): its stations, lines, exits, headways and timetables asked whole
// (builders/gtfs.js METRO_KINDS, ~14 MB for all nine), only the files that
// changed written (rail/metro/index.json keeps each file's fingerprint).
// A kind TDX didn't give, or gave under half of what it had: the last copy stays.
async function metros(sigs, failed) {
  const index = (await data('rail/metro/index.json')) || { v: 1, systems: {} };
  old.set('rail/metro/index.json', JSON.parse(JSON.stringify(index)));
  const due = NO_TDX ? [] : metroDue(index, sigs, { paid, now });
  const done = [];
  let spent = false;
  for (const sys of due) {
    const got = {};
    const was = index.systems[sys] || { kinds: {}, files: {} };
    let whole = true;
    for (const kind of METRO_KINDS[sys]) {
      try {
        const rows = await tdx(`basic/v2/Rail/Metro/${kind}/${sys}`);
        if (!Array.isArray(rows)) throw new Error('not a list');
        if (rows.length < (was.kinds?.[kind] || 0) / 2) throw new Error(`${rows.length} rows, had ${was.kinds[kind]}`);
        got[kind] = rows;
      } catch (e) {
        whole = false;
        failed[`metro:${sys}:${kind}`] = String(e?.message || e).slice(0, 160);
        if (e?.budget) {
          spent = true;
          break;
        }
      }
    }
    // (A timetable split by station needs the stations: without them, the last ones.)
    if (got.StationTimeTable && !got.Station) delete got.StationTimeTable;
    if (!Object.keys(got).length) {
      if (spent) break;
      continue;
    }
    const files = { ...was.files };
    let changed = 0;
    for (const [path, rows] of metroFiles(sys, got)) {
      const text = JSON.stringify(rows);
      const fp = createHash('sha1').update(text).digest('hex').slice(0, 12);
      const k = path.slice(`rail/metro/${sys}/`.length, -'.json'.length);
      if (files[k] !== fp) put(path, rows), changed++;
      files[k] = fp;
    }
    // (Asked again next run when a kind was missed: `sig` only once all came.)
    index.systems[sys] = { sig: whole ? sigs[sys] || '' : was.sig || '', asked: whole ? built : was.asked || '', kinds: { ...was.kinds, ...Object.fromEntries(Object.entries(got).map(([k, v]) => [k, v.length])) }, files };
    done.push([sys, changed]);
    if (spent) break;
  }
  if (done.length) put('rail/metro/index.json', { ...index, v: 1, built });
  return { due, done: Object.fromEntries(done) };
}

// The changed files to R2 (data.js /data/push: frames of [u32 path length][path][u32 size][bytes]), ~20 MB a request.
function frame(path, bytes) {
  const p = Buffer.from(path);
  const head = Buffer.alloc(8 + p.length);
  head.writeUInt32BE(p.length, 0);
  p.copy(head, 4);
  head.writeUInt32BE(bytes.length, 4 + p.length);
  return Buffer.concat([head, bytes]);
}
async function push(paths) {
  // (index.json last: phones see the new list once its files are there.)
  const order = [...paths.filter(p => p !== 'index.json'), ...paths.filter(p => p === 'index.json')];
  let batch = [];
  let size = 0;
  const sent = { put: 0, bad: [] };
  const send = async () => {
    if (!batch.length) return;
    for (let tries = 0; ; tries++) {
      const r = await fetch(`${API}/data/push`, { method: 'POST', headers: { ...auth, 'Content-Type': 'application/octet-stream' }, body: Buffer.concat(batch) }).catch(e => ({ ok: false, status: String(e) }));
      if (r.ok) {
        const j = await r.json();
        sent.put += j.put || 0;
        sent.bad.push(...(j.bad || []));
        break;
      }
      if (tries >= 3) throw new Error(`push: ${r.status}`);
      await sleep(3000 * (tries + 1));
    }
    batch = [];
    size = 0;
  };
  for (const p of order) {
    const f = frame(p, Buffer.from(JSON.stringify(out.get(p))));
    batch.push(f);
    size += f.length;
    if (size > 20e6) await send();
  }
  await send();
  return sent;
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
