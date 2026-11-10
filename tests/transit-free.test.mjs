import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { freeTdx, indexYouBike, resetYouBike, freeHeavy, YB_URL } from '../transit-free.js';
import { tdxGet } from '../transit.js';
import { runsInRunner } from '../runner.js';

const list = JSON.parse(readFileSync(new URL('./fixtures/youbike-yb2.json', import.meta.url), 'utf8'));
const NOW = Date.parse('2026-11-10T03:00:00Z');
const json = b => new Response(JSON.stringify(b), { headers: { 'Content-Type': 'application/json' } });

test("YouBike's own list in TDX's shape: TDX's ids (city prefix and YouBike's number), bikes, e-bikes and docks", () => {
  const { cities, all } = indexYouBike(list);
  assert.deepEqual([...cities.keys()].sort(), ['Hsinchu', 'Taipei']);
  const st = cities.get('Hsinchu').stations[0];
  assert.equal(st.StationUID, 'HSZ500401001');
  assert.match(st.StationName.Zh_tw, /^YouBike2\.0_/);
  assert.equal(typeof st.StationPosition.PositionLat, 'number');
  const live = cities.get('Hsinchu').live[0];
  const src = list[0];
  assert.equal(live.AvailableRentBikes, src.available_spaces);
  assert.equal(live.AvailableReturnBikes, src.empty_spaces);
  assert.equal(live.AvailableRentBikesDetail.ElectricBikes, src.available_spaces_detail.eyb);
  assert.match(live.UpdateTime, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\+08:00$/);
  assert.equal(all.length, list.length);
});

test('a city\'s bikes and the ones near a point come from YouBike, read once a minute; TDX is never asked', async () => {
  resetYouBike();
  const asked = [];
  const fetchFn = async url => (asked.push(url), url === YB_URL ? json(list) : assert.fail(`asked ${url}`));
  const city = await tdxGet({}, 'basic/v2/Bike/Availability/City/Hsinchu?$select=StationUID,AvailableRentBikes', { fetchFn, now: NOW, cache: null });
  assert.equal(city.state, 'free');
  const rows = JSON.parse(city.body);
  assert.equal(rows.length, 6);
  assert.deepEqual(Object.keys(rows[0]), ['StationUID', 'AvailableRentBikes']);
  const [lat, lon] = [Number(list[0].lat), Number(list[0].lng)];
  const near = await tdxGet({}, `advanced/v2/Bike/Station/NearBy?$spatialFilter=nearby(${lat},${lon},9000)&$top=3`, { fetchFn, now: NOW + 1000, cache: null });
  const got = JSON.parse(near.body);
  assert.equal(got.length, 3);
  assert.equal(got[0].StationUID, `HSZ${list[0].station_no}`, 'nearest first');
  assert.equal(asked.length, 1, 'one read for both');
});

test("YouBike's site down: its last list for 10 minutes, then TDX; a city YouBike doesn't run and a TDX filter go to TDX", async () => {
  resetYouBike();
  let up = true;
  const fetchFn = async url => (up ? json(list) : new Response('down', { status: 503 }));
  assert.ok(await freeTdx('basic/v2/Bike/Station/City/Hsinchu', '', { fetchFn, now: NOW }));
  up = false;
  assert.ok(await freeTdx('basic/v2/Bike/Station/City/Hsinchu', '', { fetchFn, now: NOW + 2 * 60_000 }), 'the last list');
  assert.equal(await freeTdx('basic/v2/Bike/Station/City/Hsinchu', '', { fetchFn, now: NOW + 11 * 60_000 }), null, 'then TDX');
  assert.equal(await freeTdx('basic/v2/Bike/Station/City/YunlinCounty', '', { fetchFn, now: NOW }), null);
  assert.equal(await freeTdx('basic/v2/Bike/Station/City/Hsinchu', "$filter=StationUID eq 'X'", { fetchFn, now: NOW }), null);
  assert.equal(await freeTdx('basic/v2/Bus/EstimatedTimeOfArrival/City/Hsinchu', '', { fetchFn, now: NOW }), null);
});

test('a bike ask goes to the Runner (all Taiwan read there, not in an isolate\'s 10 ms); other TDX copies stay', () => {
  assert.ok(freeHeavy('basic/v2/Bike/Availability/City/Hsinchu'));
  const req = p => new Request(`https://api.jaypengx.com/transit/tdx?p=${encodeURIComponent(p)}`);
  assert.equal(runsInRunner(req('basic/v2/Bike/Availability/City/Hsinchu'), '/transit/tdx'), true);
  assert.equal(runsInRunner(req('basic/v3/Rail/TRA/Alert'), '/transit/tdx'), false);
});

// ---- 新竹's buses ----
import { hcTime, hcRoute, resetFree } from '../transit-free.js';
import { handleTransit } from '../transit.js';
const hc = JSON.parse(readFileSync(new URL('./fixtures/hsinchu-ibus.json', import.meta.url), 'utf8'));

test("新竹's site's times in TDX's words: minutes to seconds, 即將進站, 進站中, a departure time Taiwan's today, 末班已過", () => {
  const now = Date.parse('2026-11-10T02:50:00Z'); // 10:50 in Taiwan
  assert.deepEqual(hcTime('5分', now), { StopStatus: 0, EstimateTime: 300 });
  assert.deepEqual(hcTime('即將進站', now), { StopStatus: 0, EstimateTime: 60 });
  assert.deepEqual(hcTime('進站中', now), { StopStatus: 0, EstimateTime: 0 });
  assert.deepEqual(hcTime('11:30', now), { StopStatus: 1, NextBusTime: '2026-11-10T11:30:00+08:00' });
  assert.deepEqual(hcTime('05:40', now), { StopStatus: 1, NextBusTime: '2026-11-11T05:40:00+08:00' }, "long past: tomorrow's");
  assert.deepEqual(hcTime('末班已過', now), { StopStatus: 3 });
  assert.deepEqual(hcRoute('THB5606A1_1'), { sub: 'THB5606A1', route: 'THB5606', dir: 0, pre: 'THB' });
  assert.deepEqual(hcRoute('HSZ000702_2'), { sub: 'HSZ000702', route: 'HSZ0007', dir: 1, pre: 'HSZ' });
});

const NOW2 = Date.parse('2026-11-10T02:50:00Z');
function hcFetch(log, { down = false } = {}) {
  return async (url, init = {}) => {
    log.push(url);
    if (url.includes('tdx.transportdata.tw')) {
      if (url.includes('token')) return json({ access_token: 'T', expires_in: 86400 });
      return json([{ StopUID: 'THB99999', RouteUID: 'THB1818', Direction: 0, EstimateTime: 600 }]);
    }
    if (down) return new Response('down', { status: 503 });
    if (url.includes('getStopRouteTime')) return json(url.includes('stopId=21282') ? hc.stop : { stop: null, status: 0, error: '找不到指定站牌' });
    if (url.includes('getRoutesByClass')) return json(JSON.parse(init.body).class === '20' ? hc.class20 : { routes: [] });
    if (url.includes('getRouteDetails')) return json(hc.route);
    if (url.includes('getObuLls')) return json(JSON.parse(init.body).RouteId === 'THB560801_1' ? hc.obu : { Status: 1, Data: [] });
    return assert.fail(`asked ${url}`);
  };
}
const ask = async (path, qs, fetchFn, now = NOW2) => {
  const env = { TDX_CLIENT_ID: 'id', TDX_CLIENT_SECRET: 's', TDX_PER_MIN: '300' };
  const res = await handleTransit(new Request(`https://w${path}?${qs}`), env, {}, path, { session: { s: 'S' }, fetchFn, now, cache: null });
  return { status: res.status, rows: await res.json() };
};

test("a 新竹 stop's buses from 竹塹交通資訊網, TDX's rows, no TDX; a stop it doesn't know is TDX's, and not asked of the site again that day", async () => {
  resetFree();
  const log = [];
  const fetchFn = hcFetch(log);
  const a = await ask('/transit/eta', 'city=InterCity&stops=THB21282', fetchFn);
  assert.equal(a.status, 200);
  const r5608 = a.rows.find(r => r.RouteUID === 'THB5608');
  assert.deepEqual({ ...r5608, DataTime: undefined }, { StopUID: 'THB21282', StopID: '21282', RouteUID: 'THB5608', SubRouteUID: 'THB560801', RouteName: { Zh_tw: '5608', En: '5608' }, Direction: 0, StopStatus: 1, NextBusTime: '2026-11-10T11:00:00+08:00', DataTime: undefined });
  assert.equal(a.rows.find(r => r.SubRouteUID === 'THB5606A1').RouteName.Zh_tw, '5606', "a branch's route by its route's name");
  assert.ok(!log.some(u => u.includes('tdx')), 'no TDX');
  // Again within 20 s: the same read.
  await ask('/transit/eta', 'city=InterCity&stops=THB21282', fetchFn, NOW2 + 10_000);
  assert.equal(log.length, 1);
  // A stop far from 新竹 beside it: TDX for that one only, both answered.
  log.length = 0;
  const b = await ask('/transit/eta', 'city=InterCity&stops=THB21282,THB99999', fetchFn, NOW2 + 30_000);
  assert.ok(b.rows.some(r => r.StopUID === 'THB99999') && b.rows.some(r => r.StopUID === 'THB21282'));
  assert.ok(log.some(u => u.includes('tdx') && u.includes('THB99999') && !u.includes('THB21282')), 'TDX asked for the far stop only');
  log.length = 0;
  await ask('/transit/eta', 'city=InterCity&stops=THB99999', fetchFn, NOW2 + 90_000);
  assert.ok(!log.some(u => u.includes('getStopRouteTime')), 'not asked of the site again');
});

test("a 新竹 route's every stop with its bus's plate, and its buses' GPS, from the site; the site down past 2 minutes: TDX", async () => {
  resetFree();
  const log = [];
  const e = await ask('/transit/eta', 'city=InterCity&routes=THB5608', hcFetch(log));
  const at = e.rows.find(r => r.StopUID === 'THB135010');
  assert.equal(at.EstimateTime, 300);
  assert.equal(at.PlateNumb, 'KKA-3061');
  assert.equal(e.rows.find(r => r.StopUID === 'THB135007').EstimateTime, 0);
  const g = await ask('/transit/gps', 'city=InterCity&routes=THB5608', hcFetch(log));
  assert.deepEqual(g.rows.map(r => [r.PlateNumb, r.Direction, r.BusPosition.PositionLat]), [['KKA-3061', 0, 24.7832]]);
  assert.match(g.rows[0].GPSTime, /^2026-11-10T10:52:18\+08:00$/);
  assert.ok(!log.some(u => u.includes('tdx')), 'no TDX');
  log.length = 0;
  const later = await ask('/transit/gps', 'city=InterCity&routes=THB5608', hcFetch(log, { down: true }), NOW2 + 60_000);
  assert.equal(later.rows.length, 1, 'its last answer');
  assert.ok(!log.some(u => u.includes('tdx')));
  log.length = 0;
  await ask('/transit/gps', 'city=InterCity&routes=THB5608', hcFetch(log, { down: true }), NOW2 + 5 * 60_000);
  assert.ok(log.some(u => u.includes('tdx')), 'then TDX');
});

test("bus times and a route's buses go to the Runner (新竹's whole routes read there, one in eight stop times passed 10 ms)", () => {
  const req = qs => new Request(`https://api.jaypengx.com/transit/x?${qs}`);
  assert.equal(runsInRunner(req('city=Hsinchu&routes=HSZ0007'), '/transit/gps'), true);
  assert.equal(runsInRunner(req('city=InterCity&routes=THB5608'), '/transit/eta'), true);
  assert.equal(runsInRunner(req('city=InterCity&stops=THB21282'), '/transit/eta'), true);
  assert.equal(runsInRunner(req('city=Taichung&routes=TXG300'), '/transit/gps'), true, 'gps was the Runner\'s already');
});

// ---- 臺北's and 新北's buses ----
import { gzipSync } from 'node:zlib';
import { CITY_FEEDS } from '../transit-free.js';
const cb = JSON.parse(readFileSync(new URL('./fixtures/city-buses.json', import.meta.url), 'utf8'));
const cityEnv = { DATA: { get: async k => ({ json: async () => (k === 'bus/Taipei.json' ? cb.tpack : cb.npack) }) }, TDX_CLIENT_ID: 'id', TDX_CLIENT_SECRET: 's', TDX_PER_MIN: '300' };
function cityFetch(log, { slow = 0 } = {}) {
  return async url => {
    log.push(url);
    if (url.includes('tdx.transportdata.tw')) return url.includes('token') ? json({ access_token: 'T', expires_in: 86400 }) : json([]);
    if (slow) await new Promise(r => setTimeout(r, slow));
    if (url === CITY_FEEDS.Taipei.eta) return new Response(gzipSync(JSON.stringify(cb.eta)));
    if (url === CITY_FEEDS.Taipei.bus) return new Response(gzipSync(JSON.stringify(cb.bus)));
    if (url === CITY_FEEDS.NewTaipei.eta) return new Response(cb.ncsv);
    return assert.fail(`asked ${url}`);
  };
}
const askCity = async (path, qs, fetchFn, now = NOW2) => {
  const res = await handleTransit(new Request(`https://w${path}?${qs}`), cityEnv, {}, path, { session: { s: 'S' }, fetchFn, now, cache: null });
  return { status: res.status, rows: await res.json() };
};

test("臺北's stops from the city's own file (gzipped): TDX's rows with the pack's names; a way the feed doesn't say, the stop's own from the pack; no TDX", async () => {
  resetFree();
  const log = [];
  const live = cb.eta.BusInfo.find(x => Number(x.EstimateTime) >= 0);
  const a = await askCity('/transit/eta', `city=Taipei&stops=TPE${live.StopID}`, cityFetch(log));
  const row = a.rows.find(r => r.RouteUID === 'TPE16111' && r.Direction === Number(live.GoBack));
  assert.equal(row.EstimateTime, Number(live.EstimateTime));
  assert.equal(row.RouteName.Zh_tw, '307');
  assert.ok(!log.some(u => u.includes('tdx')));
  const odd = cb.eta.BusInfo.at(-1);
  const b = await askCity('/transit/eta', `city=Taipei&stops=TPE${odd.StopID}`, cityFetch(log));
  const dirs = cb.tpack.routes[0].ways.filter(w => w[3].includes(`TPE${odd.StopID}`)).map(w => w[2]);
  assert.deepEqual(b.rows.map(r => r.Direction).sort(), dirs.sort());
  assert.equal(b.rows[0].StopStatus, 1, '-1: 尚未發車');
  assert.equal(log.filter(u => u === CITY_FEEDS.Taipei.eta).length, 1, 'the city read once for both');
});

test("臺北's buses' places by their route (the feed names a way: the pack's route); 新北's stops from its CSV, a way from the pack when it says 3", async () => {
  resetFree();
  const log = [];
  const g = await askCity('/transit/gps', 'city=Taipei&routes=TPE16111', cityFetch(log));
  assert.equal(g.rows.length, cb.bus.BusInfo.length);
  assert.ok(g.rows.every(r => r.RouteUID === 'TPE16111' && r.PlateNumb));
  const n = await askCity('/transit/eta', `city=NewTaipei&stops=${cb.nfirst},${cb.nsecond}`, cityFetch(log));
  const first = n.rows.find(r => r.StopUID === cb.nfirst);
  assert.deepEqual([first.Direction, first.EstimateTime, first.RouteName.Zh_tw], [0, 125, '231']);
  assert.equal(n.rows.find(r => r.StopUID === cb.nsecond).StopStatus, 3);
  assert.ok(!log.some(u => u.includes('tdx')));
});

test("a city's feed slow: its last list at once (1.5 s), the new one for the next ask; ids the feed doesn't have at all: TDX's", async () => {
  resetFree();
  const log = [];
  await askCity('/transit/eta', `city=NewTaipei&stops=${cb.nfirst}`, cityFetch(log));
  const t = Date.now();
  const again = await askCity('/transit/eta', `city=NewTaipei&stops=${cb.nfirst}`, cityFetch(log, { slow: 2500 }), NOW2 + 40_000);
  assert.ok(Date.now() - t < 2200, 'not held for the slow read');
  assert.equal(again.rows.length, 1);
  log.length = 0;
  await askCity('/transit/eta', 'city=NewTaipei&stops=NWT1', cityFetch(log), NOW2 + 45_000);
  assert.ok(log.some(u => u.includes('tdx') && u.includes('NWT1')));
  assert.equal(runsInRunner(new Request('https://w/transit/eta?city=Taipei&stops=TPE1'), '/transit/eta'), true, "a whole city's file read in the Runner");
});
