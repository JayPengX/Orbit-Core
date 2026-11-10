// 臺中's and 桃園's buses from the cities' own bus sites, read the same way by
// the proxy (transit-free.js) and by a phone (Orbit Transit's ebbus.mjs: the
// sites answer any page, CORS open, no key; Jay 2026-11-10: "Everything in
// our apps that could be read from our phone should be read from our phone",
// so a phone reads them itself and the proxy is its fallback).
//
// 臺中市's 公車動態 site (citybus.taichung.gov.tw/ebus) and 桃園市's
// (ebus.tycg.gov.tw/ebus), one maker's, read their buses from an open
// GraphQL service, no key: a route's every stop with the buses coming to it
// (estimateTimes: each bus's plate and minutes, the next timetabled time),
// chosen stops' (stationEstimates: a route, a station and a way each), each
// bus's GPS (buses). Their ids are TDX's: a route's xno is TDX's RouteID;
// 桃園's station id is TDX's StopID, 臺中's sid is (its station each way is
// the route's: stations, kept a day; 臺中酒廠 on 101 is station 787 going,
// 786 back, and TDX's station lists know only one); goBack 1 and 2 are TDX's
// Direction 0 and 1, but a route TDX runs one way (a loop) is Direction 0
// both halves. Fresher than TDX's copy (2026-11-10: TDX a stop or two behind
// the same bus's GPS) and every bus coming, not one. Read as often as their
// own pages (20 s). A route they don't know answers id 0 (and some other
// route's buses): left to TDX.
// (高雄's, ibus.tbkc.gov.tw/ibus/graphql, is the same maker's but answers
// only Taiwan's own networks: refused and timed out (522) even from
// Cloudflare in Taiwan, through gemini-relay.js, 2026-11-10. Phones in
// Taiwan read it themselves (Orbit Transit's khbus.mjs); the proxy's is TDX's.)
//
// Each side brings its own keeper (`keeper()`, below), its fetch, its clock
// and its city's pack (`packIndex` of Orbit's bus/<city>.json, as both have it).

import { ebusState, twNow } from './ebus.mjs';

const MIN = 60_000;
const DAY = 24 * 60 * MIN;

export const EBUS = {
  Taichung: { gql: 'https://citybus.taichung.gov.tw/ebus/graphql', pre: 'TXG', bySid: true, eta: 'comeTime isOperationDay isSuspended clogType etas { etaTime isLast busId }', bus: 'id lat lon azimuth dataTime', chunk: 300, routes: 40 },
  // (桃園's answers one part after another, ~0.1 s a stop's route and way, ~0.2 s a route: 12 and 6 an ask, the asks at once.)
  Taoyuan: { gql: 'https://ebus.tycg.gov.tw/ebus/graphql', pre: 'TAO', bySid: false, eta: 'comeTime isOperationDay isSuspended isConstruction isEvent etas { etaTime isLast busId }', bus: 'id lat lon azimuth', chunk: 12, routes: 6 }
};
// A route's stops as the site has them, kept a day → [[TDX's StopID, goBack, station]…]: 臺中's stations
// (a stop is its sid), 桃園's estimates (a stop is its station; asked a way it isn't on, 桃園 answers 今日未營運).
const PLACES = { true: 'stations { edges { sid goBack node { id } } }', false: 'estimateTimes { edges { node { id goBack } } }' };
const placesOf = (bySid, v) => (bySid ? (v?.stations?.edges || []).map(e => [String(e?.sid), e?.goBack, String(e?.node?.id)]) : (v?.estimateTimes?.edges || []).map(e => [String(e?.node?.id), e?.node?.goBack, String(e?.node?.id)])).filter(([, , st]) => /^\d+$/.test(st));
export const EB_FRESH = 20_000;
const EB_KEEP = 2 * MIN;
const ebUid = (city, u) => (String(u).startsWith(EBUS[city].pre) && /^\d{1,6}$/.test(String(u).slice(3)) ? String(u).slice(3) : '');
// (Asked at most this many stops and routes an ask: the rest TDX's.)
export const EB_MAX_STOPS = 30;
export const EB_MAX_ROUTES = 12;

// One ask of a city's site → its data (throws on an HTTP failure or a GraphQL error).
export async function ebAsk(city, fetchFn, query, variables, ms = 8000) {
  const res = await fetchFn(EBUS[city].gql, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(variables ? { query, variables } : { query }), signal: AbortSignal.timeout?.(ms) });
  if (!res.ok) throw new Error(`${city} ${res.status}`);
  const j = await res.json();
  if (!j?.data) throw new Error(`${city}: ${String(j?.errors?.[0]?.message || 'no data').slice(0, 80)}`);
  return j.data;
}

// Orbit's bus pack for a city (bus/<city>.json) → { route: Map(uid → name), stop: Map(uid → zh),
// ways: Map(stopUID@routeUID → [dir…]), sub, routes: Map(stopUID → [routeUID…]), dirs: Map(routeUID → Set(dir)), subs }.
// `subs`: each stop's and each route's sub-routes, [[sub, route, dir]…].
export function packIndex(j) {
  const route = new Map();
  const ways = new Map();
  const sub = new Map(); // (a way's id → its route's: GetBusData names a bus's way)
  const subs = new Map();
  const addSub = (k, v) => (subs.get(k) || subs.set(k, []).get(k)).push(v);
  for (const r of j?.routes || []) {
    route.set(r.uid, r.name);
    for (const [w] of r.ways || []) sub.set(w, r.uid);
    for (const [w, , dir, stops] of r.ways || []) {
      addSub(r.uid, [w, r.uid, dir]);
      for (const st of new Set(stops || [])) addSub(st, [w, r.uid, dir]);
    }
    for (const [, , dir, stops] of r.ways || []) for (const st of stops || []) {
      const k = `${st}@${r.uid}`;
      const d = ways.get(k) || [];
      if (!d.includes(dir)) ways.set(k, [...d, dir]);
    }
  }
  const stop = new Map(Object.entries(j?.stops || {}).map(([k, v]) => [k, v?.[0] || '']));
  // (Each stop's routes and each route's ways: 臺中's and 桃園's stops are asked by their routes.)
  const dirs = new Map((j?.routes || []).map(r => [r.uid, new Set((r.ways || []).map(w => w[2]))]));
  const routes = new Map();
  for (const k of ways.keys()) {
    const [st, r] = k.split('@');
    if (!routes.has(st)) routes.set(st, []);
    routes.get(st).push(r);
  }
  return { route, stop, ways, sub, routes, dirs, subs };
}

// A route TDX runs one way only (a loop: the sites halve it, goBack 1 and 2).
const oneWay = (pack, route) => pack?.dirs.has(route) && !pack.dirs.get(route).has(1);
const wayOf = (pack, route, goBack) => (oneWay(pack, route) || goBack !== 2 ? 0 : 1);

// One estimate (a stop, a route, a way) in TDX's words, as the cities' own
// pages read it (ebus.mjs: the phones' read of 高雄's too).
export function ebusRow(n, stopUID, routeUID, pack, at, now = at) {
  const name = pack?.route.get(routeUID) || routeUID.slice(3);
  const stopName = pack?.stop.get(stopUID);
  const state = ebusState(n, now);
  return { StopUID: stopUID, StopID: stopUID.slice(3), ...(stopName ? { StopName: { Zh_tw: stopName, En: stopName } } : {}), RouteUID: routeUID, RouteID: routeUID.slice(3), SubRouteUID: routeUID, RouteName: { Zh_tw: name, En: name }, Direction: wayOf(pack, routeUID, n.goBack), ...state, DataTime: twNow(at) };
}
// (One row a stop, route and way: a loop's two halves, or a stop at two stations the same way, the sooner.)
export function soonest(rows) {
  const by = new Map();
  const rank = r => (r.StopStatus === 0 ? r.EstimateTime : 1e7 + [0, 0, 2, 3, 4][r.StopStatus] * 10 + (r.NextBusTime ? 0 : 1));
  for (const r of rows) {
    const k = `${r.StopUID}|${r.RouteUID}|${r.Direction}`;
    if (!by.has(k) || rank(r) < rank(by.get(k))) by.set(k, r);
  }
  return [...by.values()];
}

// Stops (TDX's StopUIDs) → Map(uid → { at, val: [[routeUID, node]…] | null }), one ask for all not fresh.
async function ebStops(city, uids, pack, deps) {
  const { bySid, eta } = EBUS[city];
  const keyOf = u => `eb:${city}:s:${u}`;
  const got = await deps.heldMany(uids.map(keyOf), EB_FRESH, EB_KEEP, async keys => {
    const asks = keys.map(key => {
      const uid = key.slice(keyOf('').length);
      return { key, uid, id: uid.slice(3), routes: (pack.routes.get(uid) || []).filter(r => ebUid(city, r)) };
    });
    const places = await ebRoutes(city, 'p', [...new Set(asks.flatMap(a => a.routes))], PLACES[bySid], deps, DAY);
    const want = new Map(); // `${xno}|${station}|${goBack}` → [[key, routeUID]…]
    const add = (xno, station, goBack, key, route) => {
      const k = `${xno}|${station}|${goBack}`;
      if (!want.has(k)) want.set(k, []);
      want.get(k).push([key, route]);
    };
    for (const { key, uid, id, routes } of asks) {
      for (const route of routes) {
        const backs = oneWay(pack, route) ? [1, 2] : (pack.ways.get(`${uid}@${route}`) || []).map(d => d + 1);
        // (The stop's station each way it's on: one stop can be two stations, a loop's stop on either half.)
        for (const [stop, g, station] of placesOf(bySid, places.get(route)?.val)) if (stop === id && backs.includes(g)) add(route.slice(3), station, g, key, route);
      }
    }
    const targets = [...want.keys()].map(k => k.split('|').map(Number)).map(([xno, stationId, goBack]) => ({ xno, stationId, goBack }));
    const vals = new Map();
    const size = Math.max(EBUS[city].chunk, Math.ceil(targets.length / 6));
    const parts = Array.from({ length: Math.ceil(targets.length / size) }, (_, i) => targets.slice(i * size, i * size + size));
    const got = await Promise.allSettled(parts.map(t => ebAsk(city, deps.fetchFn, `query($t: [EstimateStationInput!]!) { stationEstimates(targets: $t) { edges { node { xno id goBack ${eta} } } } }`, { t }, deps.ms)));
    if (parts.length && got.every(g => g.status === 'rejected')) throw got[0].reason;
    for (const g of got) for (const { node: n } of (g.status === 'fulfilled' && g.value.stationEstimates?.edges) || []) for (const [key, route] of want.get(`${n?.xno}|${n?.id}|${n?.goBack}`) || []) vals.set(key, [...(vals.get(key) || []), [route, n]]);
    // (A stop with none of its routes answered, or its ask failed: TDX's.)
    return vals;
  }, deps.now);
  return new Map(uids.map(u => [u, got.get(keyOf(u))]));
}

// Routes (TDX's RouteUIDs) → Map(uid → { at, val }), one ask for all not fresh (`fresh` long): `what` each route's fields.
async function ebRoutes(city, kind, uids, what, deps, fresh = EB_FRESH) {
  if (!uids.length) return new Map();
  const keyOf = u => `eb:${city}:${kind}:${u}`;
  const got = await deps.heldMany(uids.map(keyOf), fresh, Math.max(EB_KEEP, fresh * 14), async keys => {
    const xs = keys.map(k => ebUid(city, k.slice(keyOf('').length)));
    const size = Math.max(EBUS[city].routes, Math.ceil(xs.length / 12));
    const parts = Array.from({ length: Math.ceil(xs.length / size) }, (_, i) => xs.slice(i * size, i * size + size));
    const got = await Promise.allSettled(parts.map(p => ebAsk(city, deps.fetchFn, `query { ${p.map(x => `r${x}: route(xno: ${x}, lang: "zh") { id ${what} }`).join(' ')} }`, null, deps.ms)));
    if (got.every(g => g.status === 'rejected')) throw got[0].reason;
    const d = Object.assign({}, ...got.map(g => (g.status === 'fulfilled' ? g.value : {})));
    // (Only a route it says it is: an id it doesn't know answers 0.)
    return new Map(keys.map((k, i) => [k, d[`r${xs[i]}`]?.id === xs[i] ? d[`r${xs[i]}`] : null]).filter(([, v]) => v));
  }, deps.now);
  return new Map(uids.map(u => [u, got.get(keyOf(u))]));
}

// A city's stops' and routes' estimates → { rows (TDX's), missing: { stops, routes } (TDX's to answer), age (ms) }.
// `deps`: { fetchFn, now (ms), pack: city → Promise(packIndex), heldMany (a keeper's), ms? (an ask's wait) }.
export async function ebEta(city, { stops = [], routes = [] }, deps) {
  const { pre, bySid, eta } = EBUS[city];
  const rows = [];
  const missing = { stops: [], routes: [] };
  let oldest = deps.now;
  const pack = await Promise.resolve()
    .then(() => deps.pack(city))
    .catch(() => null);
  if (!pack) return { rows, missing: { stops, routes }, age: 0 };
  const mine = stops.filter(u => ebUid(city, u));
  missing.stops.push(...stops.filter(u => !ebUid(city, u)), ...mine.slice(EB_MAX_STOPS));
  if (mine.length) {
    const got = await ebStops(city, mine.slice(0, EB_MAX_STOPS), pack, deps).catch(() => new Map());
    for (const u of mine.slice(0, EB_MAX_STOPS)) {
      const g = got.get(u);
      if (!g?.val) {
        missing.stops.push(u);
        continue;
      }
      for (const [route, n] of g.val) rows.push(ebusRow(n, u, route, pack, g.at, deps.now));
      oldest = Math.min(oldest, g.at);
    }
  }
  const rs = routes.filter(u => ebUid(city, u));
  missing.routes.push(...routes.filter(u => !ebUid(city, u)), ...rs.slice(EB_MAX_ROUTES));
  if (rs.length) {
    const got = await ebRoutes(city, 'r', rs.slice(0, EB_MAX_ROUTES), `estimateTimes { edges { node { ${bySid ? 'sid' : 'id'} goBack ${eta} } } }`, deps).catch(() => new Map());
    for (const u of rs.slice(0, EB_MAX_ROUTES)) {
      const g = got.get(u);
      if (!g?.val) {
        missing.routes.push(u);
        continue;
      }
      for (const e of g.val.estimateTimes?.edges || []) {
        const id = bySid ? e?.node?.sid : e?.node?.id;
        const stop = `${pre}${id}`;
        // (Only a stop and way TDX has the route at, as the pack says.)
        if (id == null || !(pack.ways.get(`${stop}@${u}`) || []).includes(wayOf(pack, u, e.node.goBack))) continue;
        rows.push(ebusRow(e.node, stop, u, pack, g.at, deps.now));
      }
      oldest = Math.min(oldest, g.at);
    }
  }
  return { rows: soonest(rows), missing, age: Math.max(0, deps.now - oldest) };
}

// (A bus whose last place is older than this is parked, not on the road.)
const EB_GPS_OLD = 10 * MIN;
// A city's routes' buses → { rows (TDX's BusA1Data), missing (TDX's to answer), age (ms) }; `deps` as ebEta's.
export async function ebGps(city, routes, deps) {
  const rows = [];
  const missing = [];
  let oldest = deps.now;
  const rs = routes.filter(u => ebUid(city, u));
  missing.push(...routes.filter(u => !ebUid(city, u)), ...rs.slice(EB_MAX_ROUTES));
  const pack = await Promise.resolve()
    .then(() => deps.pack(city))
    .catch(() => null);
  const got = rs.length ? await ebRoutes(city, 'g', rs.slice(0, EB_MAX_ROUTES), `buses { edges { goBack node { ${EBUS[city].bus} } } }`, deps).catch(() => new Map()) : new Map();
  for (const u of rs.slice(0, EB_MAX_ROUTES)) {
    const g = got.get(u);
    if (!g?.val) {
      missing.push(u);
      continue;
    }
    for (const e of g.val.buses?.edges || []) {
      const b = e?.node;
      // (桃園's buses carry no time: the read's.)
      const t = b?.dataTime != null ? Number(b.dataTime) * 1000 : g.at;
      if (!b?.id || !Number.isFinite(b.lat) || !Number.isFinite(b.lon) || !(b.lat > 0) || !(t > g.at - EB_GPS_OLD)) continue;
      rows.push({ RouteUID: u, SubRouteUID: u, PlateNumb: b.id, Direction: wayOf(pack, u, e.goBack), BusPosition: { PositionLat: b.lat, PositionLon: b.lon }, GPSTime: twNow(t), Speed: null, Azimuth: b.azimuth >= 0 && b.azimuth < 360 ? b.azimuth : null });
    }
    oldest = Math.min(oldest, g.at);
  }
  return { rows, missing, age: Math.max(0, deps.now - oldest) };
}

// ---- A small keeper ---------------------------------------------------------------------------
//
// Each answer `fresh` long, its last `keep` long when the source fails; a
// source slower than `slow` ms with a last answer still kept: that one now,
// the new one for the next ask. → { held, heldMany, kept, going, clear }.
export function keeper(max = 3000) {
  const kept = new Map(); // key → { at, val }
  const going = new Map();
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
            while (kept.size > max) kept.delete(kept.keys().next().value);
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
  // Many keys in one load (one request for every key not fresh), each kept as held()'s.
  async function heldMany(keys, fresh, keep, load, now, slow = 1500) {
    const out = new Map();
    const need = [];
    for (const key of keys) {
      const k = kept.get(key);
      if (k && now - k.at < fresh) out.set(key, k);
      else if (!going.has(key)) need.push(key);
    }
    if (need.length) {
      const job = load(need).then(vals => {
        for (const key of need) {
          kept.delete(key);
          kept.set(key, { at: now, val: vals.get(key) ?? null });
        }
        while (kept.size > max) kept.delete(kept.keys().next().value);
      });
      for (const key of need) going.set(key, job.then(() => kept.get(key)));
      job.then(
        () => {},
        () => {}
      ).then(() => need.forEach(key => going.delete(key)));
    }
    await Promise.all(
      keys
        .filter(key => !out.has(key))
        .map(async key => {
          const k = kept.get(key);
          const job = going.get(key);
          try {
            if (k && now - k.at < keep) {
              const late = Symbol('late');
              let timer;
              const got = await Promise.race([job, new Promise(r => (timer = setTimeout(r, slow, late)))]).finally(() => clearTimeout(timer));
              if (got === late) job.catch(() => {});
              out.set(key, got === late ? k : got);
            } else out.set(key, await job);
          } catch {
            if (k && now - k.at < keep) out.set(key, k);
          }
        })
    );
    return out;
  }
  return { held, heldMany, kept, going, clear: () => (kept.clear(), going.clear()) };
}
