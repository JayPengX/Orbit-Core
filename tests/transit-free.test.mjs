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

// ---- 台鐵's day from 台鐵's own open data ------------------------------------------------------

import { traDay, traDays, traNames, TRA_LIST, TRA_STATIONS } from '../transit-free.js';
const tra = name => readFileSync(new URL(`./fixtures/tra-ods-2026-11-10/${name}`, import.meta.url), 'utf8');

test("台鐵's own day (ods.railway.gov.tw) made TDX's: the same trains, classes, headsigns, lines, notes, bikes and every stop's times as TDX's day (real, 2026-11-10)", () => {
  const mine = traDay(JSON.parse(tra('ods.json')), traNames(JSON.parse(tra('stations.json'))), '2026-11-10');
  const tdx = JSON.parse(tra('tdx.json'));
  assert.equal(mine.TrainDate, '2026-11-10');
  const byNo = new Map(tdx.TrainTimetables.map(t => [t.TrainInfo.TrainNo, t]));
  assert.equal(mine.TrainTimetables.length, byNo.size);
  for (const t of mine.TrainTimetables) {
    const want = byNo.get(t.TrainInfo.TrainNo);
    assert.ok(want, t.TrainInfo.TrainNo);
    assert.deepEqual(t.TrainInfo, want.TrainInfo, t.TrainInfo.TrainNo);
    assert.deepEqual(t.StopTimes, want.StopTimes.map(({ SuspendedFlag, ...s }) => s), t.TrainInfo.TrainNo);
  }
  // A class it doesn't know: TDX's day instead.
  const odd = JSON.parse(tra('ods.json'));
  odd.TrainInfos[0].CarClass = 'ZZZZ';
  assert.equal(traDay(odd, traNames(JSON.parse(tra('stations.json'))), '2026-11-10'), null);
  assert.deepEqual(traDays(tra('list.html')), { '2026-11-11': '8ae4c984a1c0ece301a1c1d32c481b8e', '2026-11-10': '8ae4c984a1c0ece301a1c1d32c171b8d' });
});

test("a day's trains asked of TDX come from 台鐵's own site (read in the Runner, kept); a day it doesn't list, or a site that fails, is TDX's", async () => {
  resetFree();
  const asked = [];
  const text = (b, status = 200) => new Response(b, { status });
  const fetchFn = async url => {
    asked.push(url);
    if (url === TRA_LIST) return text(tra('list.html'));
    if (url === TRA_STATIONS) return text(tra('stations.json'));
    if (url.endsWith('8ae4c984a1c0ece301a1c1d32c171b8d')) return text(tra('ods.json'));
    if (url.includes('token')) return json({ access_token: 'T', expires_in: 86400 });
    if (url.includes('tdx.transportdata.tw')) return json({ TrainDate: 'x', TrainTimetables: [] });
    return text('', 404);
  };
  const path = d => `basic/v3/Rail/TRA/DailyTrainTimetable/TrainDate/${d}`;
  const env = { TDX_CLIENT_ID: 'id', TDX_CLIENT_SECRET: 's', TDX_PER_MIN: '300' };
  const got = await tdxGet(env, path('2026-11-10'), { fetchFn, now: NOW, cache: null });
  assert.equal(got.state, 'free');
  assert.equal(JSON.parse(got.body).TrainTimetables.length, 44);
  assert.ok(asked.every(u => !u.includes('tdx.transportdata.tw')));
  // Kept: asked again, nothing read.
  const n = asked.length;
  assert.equal((await tdxGet(env, path('2026-11-10'), { fetchFn, now: NOW + 60_000, cache: null })).state, 'free');
  assert.equal(asked.length, n);
  // A day 台鐵's list doesn't have: TDX's.
  const far = await tdxGet(env, path('2027-03-01'), { fetchFn, now: NOW, cache: null });
  assert.equal(far.state, 'miss');
  assert.ok(asked.some(u => u.includes('tdx.transportdata.tw')));
  assert.ok(freeHeavy(path('2026-11-10')), 'in the Runner: a 2 MB day');
  assert.ok(!freeHeavy('basic/v3/Rail/TRA/StationLiveBoard'));
});

test("高鐵's day from the weekly GTFS pack (rail/thsr.json in R2): TDX's trimmed shape, trains by number, a day it hasn't left to TDX", async () => {
  const { hsrPack } = await import('../builders/gtfs.js');
  const { hsrDay, HSR_PACK } = await import('../transit-free.js');
  const stops = [['THSR_1070', '07:55', '07:55'], ['THSR_1040', '08:37', '08:39'], ['THSR_0990', '09:40', '09:40']];
  const pack = hsrPack(
    [
      { no: '0109', dates: ['20261111'], stops: stops.slice().reverse() },
      { no: '0108', dates: ['20261111', '20261114'], stops },
      { no: '0108', dates: ['20261112'], stops }
    ],
    { THSR_1070: '左營', THSR_1040: '台中', THSR_0990: '南港' },
    'b'
  );
  assert.equal(pack.trains.length, 2, 'each timetable once');
  const day = hsrDay(pack, '2026-11-11');
  assert.deepEqual(day.map(t => t.DailyTrainInfo.TrainNo), ['0108', '0109']);
  assert.equal(JSON.stringify(day[0]), JSON.stringify({ TrainDate: '2026-11-11', DailyTrainInfo: { TrainNo: '0108', EndingStationName: { Zh_tw: '南港', En: 'Nangang' }, Note: {} }, StopTimes: [{ StationID: '1070', ArrivalTime: '07:55', DepartureTime: '07:55' }, { StationID: '1040', ArrivalTime: '08:37', DepartureTime: '08:39' }, { StationID: '0990', ArrivalTime: '09:40', DepartureTime: '09:40' }] }));
  assert.equal(hsrDay(pack, '2026-12-25'), null);
  resetFree();
  const env = { DATA: { get: async k => (k === HSR_PACK ? { text: async () => JSON.stringify(pack) } : null) } };
  const got = await freeTdx('basic/v2/Rail/THSR/DailyTimetable/TrainDate/2026-11-14', '$format=JSON', { env, now: Date.parse('2026-11-10T00:00:00Z'), fetchFn: async () => assert.fail('no network') });
  assert.equal(got.state, 'free');
  assert.deepEqual(JSON.parse(got.body).map(t => t.DailyTrainInfo.TrainNo), ['0108']);
  assert.equal(await freeTdx('basic/v2/Rail/THSR/DailyTimetable/TrainDate/2026-12-25', '$format=JSON', { env, now: Date.parse('2026-11-10T00:00:00Z') }), null);
});

test("A metro's maps and timetables from the weekly copy in R2 (rail/metro/…): whole, by `$select`, a station's timetable by its filter; live boards and other asks left to TDX", async () => {
  const { metroFiles } = await import('../builders/gtfs.js');
  const { metroFile } = await import('../transit-free.js');
  const station = [
    { StationUID: 'TRTC-BL01', StationID: 'BL01', StationName: { Zh_tw: '頂埔' }, StationAddress: 'x', StationPosition: { PositionLat: 24.95, PositionLon: 121.41 } },
    { StationUID: 'TRTC-BR01', StationID: 'BR01', StationName: { Zh_tw: '動物園' }, StationAddress: 'y', StationPosition: { PositionLat: 24.99, PositionLon: 121.57 } }
  ];
  const tt = [
    { LineID: 'BL', StationID: 'BL01', Direction: 0, Timetables: [{ Sequence: 1, DepartureTime: '06:00' }] },
    { LineID: 'BL', StationID: 'BL01', Direction: 1, Timetables: [{ Sequence: 1, DepartureTime: '06:05' }] }
  ];
  const files = new Map(metroFiles('TRTC', { Station: station, StationTimeTable: tt }).map(([p, rows]) => [p, JSON.stringify(rows)]));
  assert.deepEqual([...files.keys()].sort(), ['rail/metro/TRTC/Station.json', 'rail/metro/TRTC/StationTimeTable/BL01.json', 'rail/metro/TRTC/StationTimeTable/BR01.json']);
  assert.equal(files.get('rail/metro/TRTC/StationTimeTable/BR01.json'), '[]', 'a station TDX has no timetable for: what its filter answers');
  const q = s => new URLSearchParams(s);
  assert.equal(metroFile('basic/v2/Rail/Metro/LiveBoard/TRTC', q('')), undefined);
  assert.equal(metroFile('basic/v2/Rail/Metro/StationOfRoute/TRTC', q('$top=1')), null);
  assert.equal(metroFile('basic/v2/Rail/Metro/StationTimeTable/TRTC', q('')), null);
  resetFree();
  const env = { DATA: { get: async k => (files.has(k) ? { text: async () => files.get(k) } : null) } };
  const opts = { env, now: NOW, fetchFn: async () => assert.fail('no network') };
  const sel = await freeTdx('basic/v2/Rail/Metro/Station/TRTC', '%24select=StationUID%2CStationID%2CStationName%2CStationPosition%2CLocationCity&$format=JSON', opts);
  assert.equal(sel.state, 'free');
  assert.deepEqual(JSON.parse(sel.body)[0], { StationUID: 'TRTC-BL01', StationID: 'BL01', StationName: { Zh_tw: '頂埔' }, StationPosition: { PositionLat: 24.95, PositionLon: 121.41 } });
  const one = await freeTdx('basic/v2/Rail/Metro/StationTimeTable/TRTC', `%24filter=${encodeURIComponent("StationID eq 'BL01'")}&$format=JSON`, opts);
  assert.deepEqual(JSON.parse(one.body).map(r => r.Direction), [0, 1]);
  // (Not copied yet: TDX's.)
  assert.equal(await freeTdx('basic/v2/Rail/Metro/Line/KRTC', '$format=JSON', opts), null);
});

test("The slow lists every phone asks the same way (a city's bus routes, 台鐵's and 高鐵's stations and lines) from the build's copies (tdx/…); asked another way, TDX's", async () => {
  const { tdxCopies, copyFile } = await import('../transit-free.js');
  const { tdxRequest } = await import('../transit.js');
  const asks = tdxCopies(['Taipei', 'InterCity']);
  const files = new Map(asks.map(a => {
    const r = tdxRequest(a);
    return [copyFile(decodeURIComponent(r.path), new URLSearchParams(r.query)), JSON.stringify([{ ask: a }])];
  }));
  assert.equal(files.size, asks.length, 'each its own file');
  assert.ok(files.has('tdx/basic/v2/Rail/THSR/Station.json'));
  resetFree();
  const env = { DATA: { get: async k => (files.has(k) ? { text: async () => files.get(k) } : null) } };
  const opts = { env, now: NOW, fetchFn: async () => assert.fail('no network') };
  // (As the phone asks: tdxRequest's order and spelling.)
  for (const a of asks) {
    const r = tdxRequest(a);
    const got = await freeTdx(r.path, r.query, opts);
    assert.equal(got?.state, 'free', a);
    assert.equal(JSON.parse(got.body)[0].ask, a);
  }
  const other = tdxRequest('basic/v2/Bus/Route/City/Taipei?$select=RouteUID');
  assert.equal(await freeTdx(other.path, other.query, opts), null);
  assert.equal(copyFile('basic/v2/Bus/Route/City/Taipei/307', new URLSearchParams()), undefined);
});

// ---- 臺中's buses: the city's own bus site ----------------------------------------------------

import { ebusRow, EBUS } from '../transit-free.js';
const TC_GQL = EBUS.Taichung.gql;
const tc = JSON.parse(readFileSync(new URL('./fixtures/taichung-buses.json', import.meta.url), 'utf8'));
const NOW_TC = Date.parse(tc.at);
const tcEnv = { DATA: { get: async k => (k === 'bus/Taichung.json' ? { json: async () => tc.pack } : null) }, TDX_CLIENT_ID: 'id', TDX_CLIENT_SECRET: 's', TDX_PER_MIN: '300' };
// (臺中's GraphQL answered from a real read of routes 101 and 300, 2026-11-10: a stop's estimate is its route's at that station and way.)
function tcFetch(log, { down = false } = {}) {
  return async (url, init) => {
    if (url.includes('tdx.transportdata.tw')) {
      log.push(url);
      return url.includes('token') ? json({ access_token: 'T', expires_in: 86400 }) : json([]);
    }
    if (url !== TC_GQL) return assert.fail(`asked ${url}`);
    const body = JSON.parse(init.body);
    log.push(body);
    if (down) throw new Error('down');
    if (body.variables?.t) {
      const edges = body.variables.t.flatMap(t => (tc.routes[t.xno]?.estimateTimes.edges || []).filter(e => e.node.id === String(t.stationId) && e.node.goBack === t.goBack).map(e => ({ node: { xno: t.xno, ...e.node } })));
      return json({ data: { stationEstimates: { edges } } });
    }
    const data = {};
    for (const [, alias, x] of body.query.matchAll(/(r\d+): route\(xno: (\d+)/g)) {
      const r = tc.routes[x];
      const buses = r ? { edges: [...r.buses.edges, { goBack: 1, node: { id: 'OLD-1', lat: 24.2, lon: 120.6, azimuth: 0, dataTime: String(NOW_TC / 1000 - 3600) } }, { goBack: 2, node: { id: 'NOW-1', lat: 24.2, lon: 120.6, azimuth: 65535, dataTime: String(NOW_TC / 1000 - 5) } }] } : { edges: [{ goBack: 2, node: { id: 'SOMEONE-ELSE', lat: 24.2, lon: 120.6, azimuth: 0, dataTime: String(NOW_TC / 1000) } }] };
      data[alias] = r ? { id: x, stations: r.stations, estimateTimes: r.estimateTimes, buses } : { id: '0', stations: { edges: [] }, estimateTimes: { edges: [] }, buses };
    }
    return json({ data });
  };
}
const askTc = async (path, qs, fetchFn, now = NOW_TC) => {
  const res = await handleTransit(new Request(`https://w${path}?${qs}`), tcEnv, {}, path, { session: { s: 'S' }, fetchFn, now, cache: null });
  return { status: res.status, rows: await res.json() };
};

test("臺中's times in TDX's words, as its own page reads them: 今日未營運, 末班駛離, not stopping, the buses coming (soonest first), else the timetable's next", () => {
  const n = x => ({ goBack: 1, comeTime: '', isOperationDay: true, isSuspended: false, clogType: 0, etas: [], ...x });
  const row = x => ebusRow(n(x), 'TXG8163', 'TXG101', null, NOW_TC);
  const bus = [{ etaTime: 2, isLast: false, busId: 'A' }];
  assert.equal(row({ isOperationDay: false, etas: bus }).StopStatus, 4);
  assert.equal(row({ isSuspended: true, comeTime: '15:00' }).StopStatus, 3);
  assert.equal(row({ clogType: -8, etas: bus }).StopStatus, 2, '取消停靠');
  assert.equal(row({ clogType: -5 }).StopStatus, 2, '施工改道');
  assert.equal(row({ clogType: -7, etas: bus }).EstimateTime, 120, '臨時站位: it still stops');
  const coming = row({ comeTime: '15:44', etas: [{ etaTime: 34, isLast: false, busId: 'B' }, { etaTime: 3, isLast: true, busId: 'A' }] });
  assert.deepEqual([coming.StopStatus, coming.EstimateTime, coming.PlateNumb, coming.IsLastBus, coming.Estimates.map(e => [e.PlateNumb, e.EstimateTime]), coming.NextBusTime], [0, 180, 'A', true, [['A', 180], ['B', 2040]], '2026-11-10T15:44:00+08:00']);
  const planned = row({ comeTime: '15:44', goBack: 2 });
  assert.deepEqual([planned.StopStatus, planned.NextBusTime, planned.Direction, planned.EstimateTime, planned.RouteUID, planned.StopID], [1, '2026-11-10T15:44:00+08:00', 1, undefined, 'TXG101', '8163']);
  assert.equal(row({}).StopStatus, 1, '未發車');
});

test("a 臺中 stop's every route each way from the city's own site, each way at its own station (臺中酒廠 on 101: 787 going, 786 back); no TDX", async () => {
  resetFree();
  const log = [];
  const a = await askTc('/transit/eta', 'city=Taichung&stops=TXG8163', tcFetch(log));
  assert.equal(a.status, 200);
  const back = a.rows.find(r => r.RouteUID === 'TXG101' && r.Direction === 1);
  assert.deepEqual([back.StopStatus, back.EstimateTime, back.PlateNumb, back.StopName.Zh_tw, back.RouteName.Zh_tw], [0, 34 * 60, '901-U8', '臺中酒廠(復興路)', '101']);
  assert.deepEqual([a.rows.find(r => r.RouteUID === 'TXG101' && r.Direction === 0).NextBusTime], ['2026-11-10T14:54:00+08:00']);
  assert.ok(!log.some(x => typeof x === 'string'), 'no TDX');
  const asked = log.find(x => x.variables).variables.t;
  assert.deepEqual(asked.filter(t => t.xno === 101), [{ xno: 101, stationId: 787, goBack: 1 }, { xno: 101, stationId: 786, goBack: 2 }]);
  // Again 30 s on: its times asked again, the routes' stations not (a day).
  log.length = 0;
  await askTc('/transit/eta', 'city=Taichung&stops=TXG8163', tcFetch(log), NOW_TC + 30_000);
  assert.deepEqual(log.map(x => (x.variables ? 'times' : 'stations')), ['times']);
  // A stop not in the pack beside it: TDX's, that one alone.
  log.length = 0;
  const b = await askTc('/transit/eta', 'city=Taichung&stops=TXG8163,TXG1', tcFetch(log), NOW_TC + 40_000);
  assert.ok(b.rows.some(r => r.StopUID === 'TXG8163'));
  assert.ok(log.some(x => typeof x === 'string' && x.includes('TXG1') && !x.includes('TXG8163')), 'TDX asked for the other stop only');
});

test("a 臺中 route's every stop, and its buses (parked ones left out); a route the site doesn't know (it answers id 0, and someone else's buses) is TDX's", async () => {
  resetFree();
  const log = [];
  const e = await askTc('/transit/eta', 'city=Taichung&routes=TXG300,TXG999', tcFetch(log));
  assert.equal(e.rows.filter(r => r.RouteUID === 'TXG300').length, tc.routes[300].estimateTimes.edges.length);
  assert.ok(e.rows.every(r => r.RouteUID === 'TXG300'));
  assert.ok(log.some(x => typeof x === 'string' && x.includes('TXG999') && !x.includes('TXG300')), 'TDX asked for TXG999 only');
  log.length = 0;
  const g = await askTc('/transit/gps', 'city=Taichung&routes=TXG300,TXG999', tcFetch(log));
  const mine = g.rows.filter(r => r.RouteUID === 'TXG300');
  assert.equal(mine.length, tc.routes[300].buses.edges.length + 1);
  assert.ok(!g.rows.some(r => r.PlateNumb === 'OLD-1' || r.PlateNumb === 'SOMEONE-ELSE'));
  const now1 = mine.find(r => r.PlateNumb === 'NOW-1');
  assert.deepEqual([now1.Direction, now1.Azimuth, now1.GPSTime], [1, null, '2026-11-10T14:10:58+08:00']);
  assert.ok(log.some(x => typeof x === 'string' && x.includes('RealTimeByFrequency')), 'TDX for TXG999');
});

test("臺中's site down: its last answer for 2 minutes, then TDX; a 臺中 stop is read in the Runner (the city's pack read there)", async () => {
  resetFree();
  const log = [];
  await askTc('/transit/eta', 'city=Taichung&stops=TXG8163', tcFetch(log));
  log.length = 0;
  const later = await askTc('/transit/eta', 'city=Taichung&stops=TXG8163', tcFetch(log, { down: true }), NOW_TC + 60_000);
  assert.ok(later.rows.some(r => r.RouteUID === 'TXG101' && r.EstimateTime === 34 * 60), 'its last answer');
  assert.ok(!log.some(x => typeof x === 'string'));
  log.length = 0;
  await askTc('/transit/eta', 'city=Taichung&stops=TXG8163', tcFetch(log, { down: true }), NOW_TC + 5 * 60_000);
  assert.ok(log.some(x => typeof x === 'string' && x.includes('TXG8163')), 'then TDX');
  assert.equal(runsInRunner(new Request('https://w/transit/eta?city=Taichung&stops=TXG8163'), '/transit/eta'), true);
});

// ---- 桃園's buses: the same maker's site as 臺中's ---------------------------------------------

const ty = JSON.parse(readFileSync(new URL('./fixtures/taoyuan-buses.json', import.meta.url), 'utf8'));
const NOW_TY = Date.parse(ty.at);
const tyEnv = { DATA: { get: async k => (k === 'bus/Taoyuan.json' ? { json: async () => ty.pack } : null) }, TDX_CLIENT_ID: 'id', TDX_CLIENT_SECRET: 's', TDX_PER_MIN: '300' };
// (桃園's GraphQL answered from a real read of routes 712 (a loop: TDX's one way, the site's two halves) and 3550, 2026-11-10.
// Asked a way a stop isn't on, 桃園 answers 今日未營運, as it does.)
function tyFetch(log) {
  return async (url, init) => {
    if (url.includes('tdx.transportdata.tw')) {
      log.push(url);
      return url.includes('token') ? json({ access_token: 'T', expires_in: 86400 }) : json([]);
    }
    if (url !== EBUS.Taoyuan.gql) return assert.fail(`asked ${url}`);
    const body = JSON.parse(init.body);
    log.push(body);
    if (body.variables?.t) {
      const edges = body.variables.t.map(t => ({ node: { xno: t.xno, ...((ty.routes[t.xno]?.estimateTimes.edges || []).find(e => e.node.id === t.stationId && e.node.goBack === t.goBack)?.node || { comeTime: '', isOperationDay: false, isSuspended: false, isConstruction: false, isEvent: false, etas: [], goBack: t.goBack }), id: String(t.stationId) } }));
      return json({ data: { stationEstimates: { edges } } });
    }
    const data = {};
    for (const [, alias, x] of body.query.matchAll(/(r\d+): route\(xno: (\d+)/g)) data[alias] = ty.routes[x] ? { id: x, ...ty.routes[x] } : { id: '0', estimateTimes: { edges: [] }, buses: { edges: [] } };
    return json({ data });
  };
}
const askTy = async (path, qs, fetchFn, now = NOW_TY) => {
  const res = await handleTransit(new Request(`https://w${path}?${qs}`), tyEnv, {}, path, { session: { s: 'S' }, fetchFn, now, cache: null });
  return { status: res.status, rows: await res.json() };
};

test("桃園's buses from its own site (臺中's maker): a stop's routes only the ways it's on, a loop's two halves TDX's one way (the sooner), a route's stops, its buses; no TDX", async () => {
  resetFree();
  const log = [];
  const halves = ty.routes[712].estimateTimes.edges.filter(e => e.node.id === 9566).map(e => e.node);
  assert.equal(halves.length, 2, 'the loop turns at 9566: on both halves');
  const a = await askTy('/transit/eta', 'city=Taoyuan&stops=TAO9566,TAO611', tyFetch(log));
  const loop = a.rows.filter(r => r.StopUID === 'TAO9566' && r.RouteUID === 'TAO712');
  assert.equal(loop.length, 1);
  assert.equal(loop[0].Direction, 0);
  const soon = Math.min(...halves.flatMap(n => n.etas.map(e => e.etaTime * 60)));
  if (Number.isFinite(soon)) assert.equal(loop[0].EstimateTime, soon);
  const first = a.rows.find(r => r.StopUID === 'TAO611' && r.RouteUID === 'TAO3550');
  assert.equal(first.Direction, 1);
  assert.notEqual(first.StopStatus, 4, 'never the way it isn\'t on (桃園: 今日未營運)');
  const asked = log.filter(x => x.variables).flatMap(x => x.variables.t);
  assert.deepEqual(asked.filter(t => t.stationId === 611), [{ xno: 3550, stationId: 611, goBack: 2 }]);
  assert.ok(!log.some(x => typeof x === 'string'), 'no TDX');
  // A route's every stop, one row a stop and way; its buses one way, timed by the read.
  const r = await askTy('/transit/eta', 'city=Taoyuan&routes=TAO712', tyFetch(log));
  const keys = r.rows.map(x => `${x.StopUID}|${x.Direction}`);
  assert.equal(new Set(keys).size, keys.length);
  assert.ok(r.rows.length > 40 && r.rows.every(x => x.Direction === 0 && x.RouteUID === 'TAO712'));
  const g = await askTy('/transit/gps', 'city=Taoyuan&routes=TAO712', tyFetch(log));
  assert.equal(g.rows.length, ty.routes[712].buses.edges.length);
  assert.ok(g.rows.every(b => b.Direction === 0 && b.GPSTime === '2026-11-10T14:28:09+08:00'));
});

test("桃園's site answers a part at a time: a board's stops 12 an ask and the asks at once, a route's stops 6 routes an ask", async () => {
  resetFree();
  const log = [];
  const stops = [...new Set(ty.pack.routes.flatMap(r => r.ways.flatMap(w => w[3])))].slice(0, 20);
  const a = await askTy('/transit/eta', `city=Taoyuan&stops=${stops.join(',')}`, tyFetch(log));
  assert.ok(a.rows.length >= 20);
  const times = log.filter(x => x.variables);
  assert.ok(times.length > 1 && times.every(x => x.variables.t.length <= 12));
  assert.ok(log.filter(x => x.query && !x.variables).every(x => x.query.match(/route\(xno/g).length <= 6));
});

// ---- 臺南's buses: the city's own bus site ------------------------------------------------------

import { tnRows, TN_PATH } from '../transit-free.js';
const tn = JSON.parse(readFileSync(new URL('./fixtures/tainan-buses.json', import.meta.url), 'utf8'));
const NOW_TN = Date.parse(tn.at);
const tnEnv = { DATA: { get: async k => (k === 'bus/Tainan.json' ? { json: async () => tn.pack } : null) }, TDX_CLIENT_ID: 'id', TDX_CLIENT_SECRET: 's', TDX_PER_MIN: '300' };
// (臺南's site answered from a real read of route 19 both ways, 2026-11-10; a route it doesn't know: 500, as it does.)
function tnFetch(log) {
  return async url => {
    log.push(url);
    if (url.includes('tdx.transportdata.tw')) return url.includes('token') ? json({ access_token: 'T', expires_in: 86400 }) : json([]);
    const u = new URL(url);
    if (`${u.origin}${u.pathname}` !== TN_PATH) return assert.fail(`asked ${url}`);
    const way = tn.ways[`${u.searchParams.get('id')}|${u.searchParams.get('goback')}`];
    return way ? json(way) : new Response('<html>50x</html>', { status: 500 });
  };
}
const askTn = async (path, qs, fetchFn, now = NOW_TN) => {
  const res = await handleTransit(new Request(`https://w${path}?${qs}`), tnEnv, {}, path, { session: { s: 'S' }, fetchFn, now, cache: null });
  return { status: res.status, rows: await res.json() };
};

test("臺南's way in TDX's words: seconds, the bus coming to each stop (the last one before it), 交管不停靠, its sub-route; the next trip's time is no plate", () => {
  const rows = tnRows(tn.ways['10019|0'], 'TNN10019', 0, null, NOW_TN);
  const at = id => rows.find(r => r.StopID === id);
  assert.deepEqual([at('16077').StopStatus, at('16077').EstimateTime, at('16077').PlateNumb, at('16077').SubRouteUID, at('16077').Direction], [0, 0, 'EAL-2367', 'TNN100190', 0]);
  assert.equal(at('16084').PlateNumb, 'EAL-2367', 'downstream: the same bus');
  assert.equal(at('16089').PlateNumb, 'EAL-2561', 'past the next bus: that one');
  assert.equal(at('16067').StopStatus, 2);
  assert.equal(at('35512').PlateNumb, undefined, 'before any bus: none');
  assert.equal(at('16932').PlateNumb, undefined, '16:30 is a time, not a plate');
  assert.equal(at('16932').SubRouteUID, 'TNN100196');
});

test("a 臺南 stop's routes the ways it's on from the city's own site, a route both ways, its buses; a route it doesn't know (500): TDX's", async () => {
  resetFree();
  const log = [];
  const a = await askTn('/transit/eta', 'city=Tainan&stops=TNN16077', tnFetch(log));
  assert.deepEqual(a.rows.map(r => [r.RouteUID, r.Direction, r.EstimateTime, r.PlateNumb]), [['TNN10019', 0, 0, 'EAL-2367']]);
  assert.deepEqual(log.map(u => new URL(u).searchParams.get('goback')), ['0'], 'only the way it is on');
  const r = await askTn('/transit/eta', 'city=Tainan&routes=TNN10019,TNN99999', tnFetch(log));
  assert.equal(r.rows.filter(x => x.RouteUID === 'TNN10019').length, new Set([...tn.ways['10019|0'].data.map(x => `${x.id}|0`), ...tn.ways['10019|1'].data.map(x => `${x.id}|1`)]).size);
  assert.ok(log.some(u => u.includes('tdx') && u.includes('TNN99999') && !u.includes('TNN10019')), 'TDX for the one it doesn\'t know');
  const g = await askTn('/transit/gps', 'city=Tainan&routes=TNN10019', tnFetch(log));
  assert.deepEqual(g.rows.map(b => [b.PlateNumb, b.Direction, b.SubRouteUID]).sort(), [['EAL-2360', 1, 'TNN100191'], ['EAL-2367', 0, 'TNN100190'], ['EAL-2376', 1, 'TNN100197'], ['EAL-2561', 0, 'TNN100190']]);
  assert.equal(g.rows.find(b => b.PlateNumb === 'EAL-2561').GPSTime, '2026-11-10T14:37:41+08:00');
  assert.equal(runsInRunner(new Request('https://w/transit/eta?city=Tainan&stops=TNN16077'), '/transit/eta'), true);
});

test("臺北捷運's trains coming in from its own open file, in TDX's shape (each row's line the one through both its stations); a station's by its filter; the file down past 2 minutes: TDX", async () => {
  const { trtcRows, TRTC_LIVE } = await import('../transit-free.js');
  const fx = JSON.parse(readFileSync(new URL('./fixtures/trtc-live.json', import.meta.url), 'utf8'));
  const now = Date.parse('2026-11-10T16:25:00+08:00');
  const rows = trtcRows(fx.blob, fx.StationOfLine, fx.Line, now);
  const of = (st, to) => rows.filter(r => r.StationName.Zh_tw === st && r.DestinationStationName.Zh_tw === to).map(r => `${r.LineID} ${r.StationID}→${r.DestinationStationID}`);
  assert.deepEqual(of('台北車站', '南港展覽館'), ['BL BL12→BL23']);
  assert.deepEqual(of('忠孝復興', '動物園'), ['BR BR10→BR01']);
  assert.deepEqual(of('忠孝復興', '南港展覽館'), ['BR BR10→BR24'], 'either line: 文湖線, as TDX says');
  assert.equal(rows.filter(r => r.StationName.Zh_tw === '板橋').length, 0, '環狀線 (新北產業園區) is not TRTC');
  assert.equal(rows.length, fx.blob.length - 1);
  assert.deepEqual(rows.find(r => r.StationID === 'BR10' && r.DestinationStationID === 'BR01'), {
    LineNO: 'BR', LineID: 'BR', LineName: { Zh_tw: '文湖線', En: 'Wenhu Line', Ja: '文湖線', Ko: '원후선' }, StationID: 'BR10', StationName: fx.StationOfLine.find(l => l.LineID === 'BR').Stations.find(s => s.StationID === 'BR10').StationName,
    TripHeadSign: '往動物園', DestinationStaionID: 'BR01', DestinationStationID: 'BR01', DestinationStationName: fx.StationOfLine.find(l => l.LineID === 'BR').Stations.find(s => s.StationID === 'BR01').StationName,
    ServiceStatus: 0, EstimateTime: 0, SrcUpdateTime: '2026-11-10T16:24:37+08:00', UpdateTime: '2026-11-10T16:25:00+08:00'
  });
  assert.equal(trtcRows(fx.blob, fx.StationOfLine, fx.Line, now + 4 * 60_000).length, 0, 'rows 3 minutes old: those trains gone');

  resetFree();
  const files = new Map([['rail/metro/TRTC/StationOfLine.json', JSON.stringify(fx.StationOfLine)], ['rail/metro/TRTC/Line.json', JSON.stringify(fx.Line)]]);
  const env = { DATA: { get: async k => (files.has(k) ? { text: async () => files.get(k) } : null) } };
  let asked = 0, down = false;
  const fetchFn = async u => (assert.equal(String(u), TRTC_LIVE), asked++, down ? new Response('', { status: 503 }) : new Response('﻿' + JSON.stringify(fx.blob)));
  const whole = await freeTdx('basic/v2/Rail/Metro/LiveBoard/TRTC', '$format=JSON', { env, fetchFn, now });
  assert.equal(whole.state, 'free');
  assert.equal(JSON.parse(whole.body).length, rows.length);
  const one = await freeTdx('basic/v2/Rail/Metro/LiveBoard/TRTC', `%24filter=${encodeURIComponent("StationID eq 'BR10'")}&$format=JSON`, { env, fetchFn, now: now + 5000 });
  assert.deepEqual(JSON.parse(one.body).map(r => r.DestinationStationID).sort(), ['BR01', 'BR24']);
  assert.equal(asked, 1, 'read once in 10 s');
  assert.equal(JSON.parse((await freeTdx('basic/v2/Rail/Metro/LiveBoard/TRTC', '%24top=2', { env, fetchFn, now })).body).length, 2);
  assert.equal(await freeTdx('basic/v2/Rail/Metro/LiveBoard/TRTC', `%24filter=${encodeURIComponent("LineID eq 'BL'")}`, { env, fetchFn, now }), null, 'another ask: TDX');
  assert.equal(await freeTdx('basic/v2/Rail/Metro/LiveBoard/KRTC', '', { env, fetchFn, now }), null);
  down = true;
  assert.equal((await freeTdx('basic/v2/Rail/Metro/LiveBoard/TRTC', '', { env, fetchFn, now: now + 60_000 })).state, 'free', 'its last copy a while');
  assert.equal(await freeTdx('basic/v2/Rail/Metro/LiveBoard/TRTC', '', { env, fetchFn, now: now + 3 * 60_000 }), null);
});

test("高雄捷運's and 輕軌's next trains at a station from KRTC's 高捷e遊行 (its form read once an hour, a post a station), in TDX's shape; a whole system, or the page down past 2 minutes: TDX", async () => {
  const { easygoForm, easygoRows, KRTC_EASYGO } = await import('../transit-free.js');
  const fx = JSON.parse(readFileSync(new URL('./fixtures/krtc-easygo.json', import.meta.url), 'utf8'));
  const now = Date.parse('2026-11-10T16:43:00+08:00');
  const form = easygoForm(fx.form);
  assert.equal(form.at.R16, '10');
  assert.equal(form.at.O5R10, '16');
  assert.equal(form.at.C3, '40');
  assert.equal(Object.keys(form.at).length, 76, '38 stations of 捷運 (美麗島 one), 38 of 輕軌');
  const lines = Object.fromEntries(['KRTC', 'KLRT'].map(sys => [sys, { at: new Map(fx[sys].StationOfLine.flatMap(line => line.Stations.map(s => [s.StationID, { line, s }]))), names: Object.fromEntries(fx[sys].Line.map(l => [l.LineID, l.LineName])) }]));
  const said = page => easygoRows(fx.pages[page], lines, now).map(r => `${r.StationID} ${r.TripHeadSign} ${r.DestinationStationID} ${r.EstimateTime}`);
  assert.deepEqual(said('O5R10'), ['O5 往大寮 OT1 1', 'O5 往哈瑪星 O1 3', 'R10 往岡山車站 RK1 3', 'R10 往小港 R3 1']);
  assert.deepEqual(said('R16'), ['R16 往岡山車站 RK1 0', 'R16 往小港 R3 4'], '進站中: 0');
  assert.deepEqual(said('RK1'), ['RK1 往小港 R3 1'], 'two platforms to one end: the sooner');
  assert.deepEqual(said('C3'), ['C3 順行方向 C1 9', 'C3 逆行方向 C1 5'], "輕軌: left 順行, right 逆行, toward C1 as TDX's");
  const [c3] = easygoRows(fx.pages.C3, lines, now);
  assert.equal(c3.SrcUpdateTime, '2026-11-10T16:42:14+08:00');
  assert.equal(c3.LineNO, undefined);
  assert.deepEqual(c3.LineName, { Zh_tw: '環狀輕軌' });
  assert.deepEqual(easygoRows(fx.pages.R16, lines, now)[0], {
    LineNO: 'R', LineID: 'R', LineName: { Zh_tw: '紅線' }, StationID: 'R16', StationName: { Zh_tw: '左營', En: 'Zuoying', Ja: null, Ko: null }, TripHeadSign: '往岡山車站', DestinationStaionID: 'RK1', DestinationStationID: 'RK1', DestinationStationName: { Zh_tw: '岡山車站', En: 'Gangshan Station', Ja: null, Ko: null }, ServiceStatus: 0, EstimateTime: 0, SrcUpdateTime: '2026-11-10T16:43:00+08:00', UpdateTime: '2026-11-10T16:43:00+08:00'
  });

  resetFree();
  const files = new Map(['KRTC', 'KLRT'].flatMap(sys => [[`rail/metro/${sys}/StationOfLine.json`, JSON.stringify(fx[sys].StationOfLine)], [`rail/metro/${sys}/Line.json`, JSON.stringify(fx[sys].Line)]]));
  const env = { DATA: { get: async k => (files.has(k) ? { text: async () => files.get(k) } : null) } };
  const asked = [];
  let stale = false;
  const fetchFn = async (u, o = {}) => {
    assert.ok(String(u).startsWith(KRTC_EASYGO));
    if (o.method !== 'POST') return asked.push('form'), new Response(fx.form);
    const b = new URLSearchParams(o.body);
    assert.equal(b.get('__VIEWSTATE'), form.fields.__VIEWSTATE);
    const page = Object.keys(form.at).find(t => form.at[t] === b.get('__EVENTARGUMENT'));
    asked.push(page);
    return new Response(stale ? '此網頁已過期' : fx.pages[page]);
  };
  const ask = (sys, id, t = now) => freeTdx(`basic/v2/Rail/Metro/LiveBoard/${sys}`, `%24filter=${encodeURIComponent(`StationID eq '${id}'`)}&$format=JSON`, { env, fetchFn, now: t });
  const o5 = await ask('KRTC', 'O5');
  assert.equal(o5.state, 'free');
  assert.deepEqual(JSON.parse(o5.body).map(r => r.DestinationStationID), ['OT1', 'O1']);
  assert.deepEqual(JSON.parse((await ask('KRTC', 'R10', now + 5000)).body).map(r => r.DestinationStationID), ['RK1', 'R3']);
  assert.deepEqual(JSON.parse((await ask('KLRT', 'C3')).body).map(r => r.EstimateTime), [9, 5]);
  assert.deepEqual(asked, ['form', 'O5R10', 'C3'], 'the form once, 美麗島 once for both its lines');
  assert.equal(await ask('KRTC', 'C3'), null, 'a station not of that system: TDX');
  assert.equal(await freeTdx('basic/v2/Rail/Metro/LiveBoard/KRTC', '$format=JSON', { env, fetchFn, now }), null, 'a whole system: TDX');
  stale = true;
  assert.equal(await ask('KRTC', 'R16'), null, 'no board, none kept: TDX');
  assert.equal(JSON.parse((await ask('KRTC', 'O5', now + 60_000)).body).length, 2, 'the last answer a while');
  assert.equal(asked.filter(a => a === 'form').length, 2, 'the form read again after a post found no board');
  assert.equal(await ask('KRTC', 'O5', now + 3 * 60_000), null);
});

test("桃園機場捷運's next trains from its own platform screens (PIDS), in TDX's shape: each train a row, minutes to when it leaves its first station or reaches the others, from when the file was said; the whole line or a station", async () => {
  const { tymcRows, TYMC_PIDS } = await import('../transit-free.js');
  const fx = JSON.parse(readFileSync(new URL('./fixtures/tymc-pids.json', import.meta.url), 'utf8'));
  const said = Date.parse(fx.pids.SystemDateTime);
  const rows = tymcRows(fx.pids, fx.StationOfLine, fx.Line, said);
  const at = id => rows.filter(r => r.StationID === id).map(r => `${r.TripHeadSign} ${r.EstimateTime}`);
  assert.deepEqual(at('A1'), ['往環北站 12', '往機場第二航廈站 27', '往機場第二航廈站 42', '往機場第二航廈站 57'], 'at its first station: when it leaves (the express to 環北 in at 16:49, out 17:00)');
  assert.deepEqual(at('A13').slice(0, 3), ['往台北車站 0', '往台北車站 5', '往老街溪站 11'], 'trains ending here (no end said) left out');
  assert.equal(at('A14').length, 0, 'a station TDX has no row for (第三航廈): none');
  assert.ok(at('A14a').length > 0, 'A14A, A14a: one station');
  assert.deepEqual(rows.find(r => r.StationID === 'A3' && r.DestinationStationID === 'A1'), {
    LineNO: 'A', LineID: 'A', LineName: fx.Line[0].LineName, StationID: 'A3', StationName: fx.StationOfLine[0].Stations.find(s => s.StationID === 'A3').StationName, TripHeadSign: '往台北車站', DestinationStaionID: 'A1', DestinationStationID: 'A1', DestinationStationName: fx.StationOfLine[0].Stations.find(s => s.StationID === 'A1').StationName,
    ServiceStatus: 0, EstimateTime: 6, SrcUpdateTime: '2026-11-10T16:48:19+08:00', UpdateTime: '2026-11-10T16:48:19+08:00'
  });
  assert.equal(tymcRows(fx.pids, fx.StationOfLine, fx.Line, said + 120_000).find(r => r.StationID === 'A3' && r.DestinationStationID === 'A1').EstimateTime, 4, 'read 2 minutes after it was said: 2 minutes sooner');

  resetFree();
  const files = new Map([['rail/metro/TYMC/StationOfLine.json', JSON.stringify(fx.StationOfLine)], ['rail/metro/TYMC/Line.json', JSON.stringify(fx.Line)]]);
  const env = { DATA: { get: async k => (files.has(k) ? { text: async () => files.get(k) } : null) } };
  let asked = 0;
  const fetchFn = async u => (assert.equal(String(u), TYMC_PIDS), asked++, json(fx.pids));
  const whole = await freeTdx('basic/v2/Rail/Metro/LiveBoard/TYMC', '$format=JSON', { env, fetchFn, now: said });
  assert.equal(whole.state, 'free');
  assert.equal(JSON.parse(whole.body).length, rows.length);
  const one = await freeTdx('basic/v2/Rail/Metro/LiveBoard/TYMC', `%24filter=${encodeURIComponent("StationID eq 'A21'")}`, { env, fetchFn, now: said + 5000 });
  assert.ok(JSON.parse(one.body).every(r => r.StationID === 'A21'));
  assert.equal(asked, 1);
  assert.equal(await freeTdx('basic/v2/Rail/Metro/LiveBoard/TYMC', '%24top=3', { env, fetchFn, now: said }), null);
});

test("台鐵's notices: every line running whole on its 路線運行狀態 page is TDX's 全線營運正常, no TDX; a line with a stretch listed, or the page down, is TDX's to say", async () => {
  const { traAllClear, TRA_BLOCKS } = await import('../transit-free.js');
  const page = readFileSync(new URL('./fixtures/tra-blocklist.html', import.meta.url), 'utf8');
  assert.deepEqual(traAllClear(page), { Alerts: [{ Title: '全線營運正常', Status: 1, UpdateTime: '2026-11-10T17:00:00+08:00' }] });
  const blocked = page.replace(/(<dt>平溪線<\/dt>[\s\S]*?<CAPTION[^>]*>[^<]*<\/CAPTION>)/, '$1<tr><td>2026/11/10</td><td>十分-菁桐</td><td>落石</td><td>17:30</td></tr>');
  assert.notEqual(blocked, page);
  assert.equal(traAllClear(blocked), null);
  assert.equal(traAllClear(page.replace('<dt>南迴線</dt>', '<dt>南迴線</dt><dd></dd><label>列車延誤 (Delay)</label>').replace(/(<dt>南迴線<\/dt>[\s\S]*?)<label>全線正常運行<\/label>/, '$1')), null, 'a line not 全線正常運行');
  assert.equal(traAllClear('<html>維護中</html>'), null);
  resetFree();
  let asked = 0, body = page;
  const fetchFn = async u => (assert.equal(String(u), TRA_BLOCKS), asked++, new Response(body));
  const got = await freeTdx('basic/v3/Rail/TRA/Alert', '$format=JSON', { fetchFn, now: NOW });
  assert.equal(got.state, 'free');
  assert.equal(JSON.parse(got.body).Alerts[0].Status, 1);
  body = blocked;
  assert.equal((await freeTdx('basic/v3/Rail/TRA/Alert', '', { fetchFn, now: NOW + 60_000 })).state, 'free', 'read again each 5 minutes');
  assert.equal(await freeTdx('basic/v3/Rail/TRA/Alert', '', { fetchFn, now: NOW + 6 * 60_000 }), null, 'a stretch blocked: TDX');
  assert.equal(asked, 2);
});

test("a 台鐵 train's delay from 台鐵's own 車次查詢 (the station it last left and the next say 誤點 N 分), in TDX's TrainLiveBoard/TrainNo shape; the form read once, a train's page kept a minute; a train not running: no row", async () => {
  const { traTrainRow, TRA_TRAIN, copyFile, tdxCopies } = await import('../transit-free.js');
  const fx = JSON.parse(readFileSync(new URL('./fixtures/tra-trains.json', import.meta.url), 'utf8'));
  const now = Date.parse('2026-11-10T17:08:00+08:00');
  const ids = new Map(fx.Stations.Stations.map(s => [s.StationName.Zh_tw, { StationID: s.StationID, StationName: s.StationName }]));
  assert.deepEqual(traTrainRow(fx.pages['2194'], '2194', ids, now), { TrainNo: '2194', TrainTypeName: { Zh_tw: '區間' }, StationID: '1000', StationName: fx.Stations.Stations.find(s => s.StationID === '1000').StationName, TrainStationStatus: 2, DelayTime: 4, UpdateTime: '2026-11-10T17:08:00+08:00' });
  const brief = r => r && [r.StationID, r.TrainStationStatus, r.DelayTime];
  assert.deepEqual(brief(traTrainRow(fx.pages['3247'], '3247', ids, now)), ['3470', 2, 5], '斗六 left, 5 late');
  const lastOnly = fx.pages['3247'].replace(/<td>誤點 5 分<\/td>(?![\s\S]*<td>誤點 5 分<\/td>)/, '<td></td>');
  assert.deepEqual(brief(traTrainRow(lastOnly, '3247', ids, now)), ['3470', 1, 5], 'one stop said: at it');
  assert.equal(traTrainRow(fx.pages['1754'], '1754', ids, now), null, 'run its course: none');
  assert.equal(traTrainRow(fx.pages['2194'], '2195', ids, now), null, "another train's page");
  assert.equal(traTrainRow(fx.pages['2194'].replace('誤點 4 分', '準點').replace('誤點 4 分', '準點'), '2194', ids, now).DelayTime, 0);
  assert.equal(traTrainRow(fx.pages['2194'].replace('icon-train"', 'icon-train tzechiang"').replace('區間2194', '自強2194'), '2194', ids, now).TrainTypeName.Zh_tw, '自強', "a class's own mark");

  resetFree();
  const ask = tdxCopies([]).find(a => a.startsWith('basic/v3/Rail/TRA/Station?'));
  const file = copyFile('basic/v3/Rail/TRA/Station', new URLSearchParams(ask.split('?')[1]));
  const env = { DATA: { get: async k => (k === file ? { text: async () => JSON.stringify(fx.Stations) } : null) } };
  const asked = [];
  const fetchFn = async (u, o = {}) => {
    assert.ok(String(u).startsWith(TRA_TRAIN));
    if (!o.method) return asked.push('form'), new Response('<input type="hidden" name="_csrf" value="tok-1"/>', { headers: { 'Set-Cookie': 'T4TIPSESSIONID=abc; path=/' } });
    const b = new URLSearchParams(o.body);
    assert.equal(b.get('_csrf'), 'tok-1');
    assert.equal(b.get('rideDate'), '2026/11/10');
    asked.push(b.get('trainNo'));
    return new Response(fx.pages[b.get('trainNo')] || '<html>查無資料</html>');
  };
  const one = no => freeTdx(`basic/v3/Rail/TRA/TrainLiveBoard/TrainNo/${no}`, '$format=JSON', { env, fetchFn, now });
  const got = await one('2194');
  assert.equal(got.state, 'free');
  assert.deepEqual(JSON.parse(got.body).TrainLiveBoards.map(r => [r.TrainNo, r.StationID, r.DelayTime]), [['2194', '1000', 4]]);
  assert.deepEqual(JSON.parse((await one('1754')).body).TrainLiveBoards, []);
  await one('2194');
  assert.deepEqual(asked, ['form', '2194', '1754'], 'the form once; a train once a minute');
  assert.equal(await one('9999'), null, 'no such train: TDX');
  assert.equal(await freeTdx('basic/v3/Rail/TRA/TrainLiveBoard', '', { env, fetchFn, now }), null, 'every train: TDX');
});

// ---- 公路客運's and the counties' buses: 公路局's site ----------------------------------------

import { tbTime, tbRows, TB_URL } from '../transit-free.js';
const tb = JSON.parse(readFileSync(new URL('./fixtures/taiwanbus.json', import.meta.url), 'utf8'));
const NOW_TB = Date.parse(tb.at); // 18:04:30 in Taiwan
const tbEnv = { DATA: { get: async k => (k === 'bus/InterCity/ways.json' ? { json: async () => tb.ways } : k === 'bus/Keelung.json' ? { json: async () => tb.keelung } : null) }, TDX_CLIENT_ID: 'id', TDX_CLIENT_SECRET: 's', TDX_PER_MIN: '300' };
// (公路局's site answered from real reads of 1815 both ways, 1815A going and 基隆 107, 2026-11-10;
// a sub-route it doesn't know answers []. 新竹's site doesn't know a stop by 臺北車站.)
function tbFetch(log, { down = false } = {}) {
  return async url => {
    if (url.includes('tdx.transportdata.tw')) {
      log.push(url);
      return url.includes('token') ? json({ access_token: 'T', expires_in: 86400 }) : json([]);
    }
    if (url.includes('/ibus_gis/')) return log.push('hc'), json({ status: 0 });
    if (!url.startsWith(TB_URL)) return assert.fail(`asked ${url}`);
    log.push(url.slice(TB_URL.length));
    if (down) throw new Error('down');
    return json(tb.answers[url.slice(TB_URL.length)] || []);
  };
}
const askTb = async (path, qs, fetchFn, now = NOW_TB) => {
  const res = await handleTransit(new Request(`https://w${path}?${qs}`), tbEnv, {}, path, { session: { s: 'S' }, fetchFn, now, cache: null });
  return { status: res.status, rows: await res.json() };
};

test("公路局's times in TDX's words: minutes, hours and minutes, 即將進站, a departure time, 動態發車, its last gone, not today", () => {
  assert.deepEqual(tbTime('4分', NOW_TB), { StopStatus: 0, EstimateTime: 240 });
  assert.deepEqual(tbTime('1時5分', NOW_TB), { StopStatus: 0, EstimateTime: 3900 });
  assert.deepEqual(tbTime('2時', NOW_TB), { StopStatus: 0, EstimateTime: 7200 });
  assert.deepEqual(tbTime('即將進站', NOW_TB), { StopStatus: 0, EstimateTime: 60 });
  assert.deepEqual(tbTime('進站中', NOW_TB), { StopStatus: 0, EstimateTime: 0 });
  assert.deepEqual(tbTime('18:20發車', NOW_TB), { StopStatus: 1, NextBusTime: '2026-11-10T18:20:00+08:00' });
  assert.deepEqual(tbTime('19:32', NOW_TB), { StopStatus: 1, NextBusTime: '2026-11-10T19:32:00+08:00' });
  assert.deepEqual(tbTime('動態發車', NOW_TB), { StopStatus: 1 });
  assert.deepEqual(tbTime('末班車駛離', NOW_TB), { StopStatus: 3 });
  assert.deepEqual(tbTime('末班資訊', NOW_TB), { StopStatus: 3 });
  assert.deepEqual(tbTime('今日未營運', NOW_TB), { StopStatus: 4 });
});

test('a stop on a 公路客運 way: one row, each bus coming to it the soonest first (TDX\'s Estimates)', () => {
  const rows = tbRows(tb.answers['181501'], 'THB181501', 'THB1815', 0, null, NOW_TB, new Set(['THB292154']));
  assert.equal(rows.length, 1);
  const r = rows[0];
  assert.deepEqual([r.StopUID, r.SubRouteUID, r.Direction, r.StopStatus, r.EstimateTime, r.PlateNumb, r.StopName.Zh_tw], ['THB292154', 'THB181501', 0, 0, 60, 'FAB-918', '自強橋頭']);
  assert.deepEqual(
    r.Estimates.map(e => [e.PlateNumb, e.EstimateTime]),
    [
      ['FAB-918', 60],
      ['KKA-1052', 1140],
      ['829-U5', 1560],
      ['997-U5', 1920],
      ['FAB-081', 3060]
    ]
  );
  assert.equal(r.DataTime, '2026-11-10T18:04:19+08:00', "the site's own time");
});

test("公路客運 stops far from 新竹: 公路局's site, each sub-route through them one way; no TDX", async () => {
  resetFree();
  const log = [];
  const a = await askTb('/transit/eta', 'city=InterCity&stops=THB292154,THB300516', tbFetch(log));
  assert.equal(a.status, 200);
  assert.ok(!log.some(x => x.includes?.('tdx.transportdata.tw')), 'no TDX');
  // (Both on 1815 going and 1815A going, 臺北車站 1815 back's end too: three reads, each once.)
  assert.deepEqual(log.filter(x => /^\w{6}$/.test(x)).sort(), ['181501', '181502', '1815A1']);
  const at = (stop, sub) => a.rows.find(r => r.StopUID === stop && r.SubRouteUID === sub);
  assert.deepEqual([at('THB292154', 'THB181501').EstimateTime, at('THB292154', 'THB181501').RouteName.Zh_tw], [60, '1815']);
  assert.deepEqual([at('THB300516', 'THB1815A1').StopStatus, at('THB300516', 'THB1815A1').NextBusTime], [1, '2026-11-10T18:20:00+08:00']);
  // Again within 20 s: no read.
  log.length = 0;
  await askTb('/transit/eta', 'city=InterCity&stops=THB292154', tbFetch(log), NOW_TB + 10_000);
  assert.deepEqual(log.filter(x => /^\w{6}$/.test(x)), []);
});

test("a 公路客運 route's every stop both ways, and its buses; a sub-route the site doesn't know is left out, a route not in the ways TDX's", async () => {
  resetFree();
  const log = [];
  const e = await askTb('/transit/eta', 'city=InterCity&route=THB1815', tbFetch(log));
  const subs = new Set(e.rows.map(r => r.SubRouteUID));
  assert.deepEqual([...subs].sort(), ['THB181501', 'THB181502', 'THB1815A1']);
  assert.ok(e.rows.filter(r => r.SubRouteUID === 'THB181502').every(r => r.Direction === 1));
  assert.ok(!log.some(x => x.includes?.('tdx.transportdata.tw')), 'no TDX');
  log.length = 0;
  const g = await askTb('/transit/gps', 'city=InterCity&routes=THB1815,THB9999', tbFetch(log));
  const mine = g.rows.filter(r => r.RouteUID === 'THB1815');
  assert.equal(mine.length, tb.answers['181501'].cars.length + tb.answers['181502'].cars.length + tb.answers['1815A1'].cars.length);
  assert.deepEqual([mine[0].SubRouteUID, mine[0].Direction, mine[0].GPSTime], ['THB181501', 0, '2026-11-10T18:04:19+08:00']);
  assert.ok(log.some(x => x.includes?.('RealTimeByFrequency') && x.includes('THB9999')), 'TDX for the route it has no ways for');
});

test("a county's buses (基隆 107) from 公路局's site; the site down: its last answer for 2 minutes, then TDX", async () => {
  resetFree();
  const log = [];
  const a = await askTb('/transit/eta', 'city=Keelung&route=KEE0362', tbFetch(log));
  assert.ok(a.rows.length > 20);
  assert.deepEqual([a.rows[0].StopUID, a.rows[0].RouteName.Zh_tw, a.rows[0].NextBusTime], ['KEE306361', '107', '2026-11-10T19:30:00+08:00']);
  assert.ok(!log.some(x => x.includes?.('tdx.transportdata.tw') || x === 'hc'), 'neither TDX nor 新竹');
  log.length = 0;
  const later = await askTb('/transit/eta', 'city=Keelung&route=KEE0362', tbFetch(log, { down: true }), NOW_TB + 60_000);
  assert.equal(later.rows.length, a.rows.length, 'its last answer');
  assert.ok(!log.some(x => x.includes?.('tdx.transportdata.tw')));
  log.length = 0;
  await askTb('/transit/eta', 'city=Keelung&route=KEE0362', tbFetch(log, { down: true }), NOW_TB + 5 * 60_000);
  assert.ok(log.some(x => x.includes?.('tdx.transportdata.tw')), 'then TDX');
  assert.equal(runsInRunner(new Request('https://w/transit/eta?city=Keelung&stops=KEE306361'), '/transit/eta'), true);
});

// ---- 台鐵's fares: 台鐵's own 票價試算 ---------------------------------------------------------

test("台鐵's fares from 台鐵's own 票價試算 (every type in one form), in TDX's ODFare shape, kept in R2 30 days; the site down: the copy of any age, else TDX; a pair it doesn't sell: TDX, not asked again that day", async () => {
  const { traFareRows, traFareForm, traFareFile, TRA_FARE, TRA_TRAIN, TRA_FARE_TYPES } = await import('../transit-free.js');
  // (花蓮 → 臺北, 2026-11-10: TDX's ODFare said 583 自強 / 太魯閣 / 普悠瑪 / 自強(3000), 450 莒光, 376 復興 / 區間快 / 區間, 194.3 km.)
  const page = readFileSync(new URL('./fixtures/tra-fare.html', import.meta.url), 'utf8');
  const rows = traFareRows(page, '7000', '1000');
  assert.deepEqual(rows.map(r => [r.TrainType, r.Fares[0].Price]), [[11, 583], [1, 583], [2, 583], [3, 583], [4, 450], [5, 376], [10, 376], [6, 376]]);
  assert.ok(rows.every(r => r.TravelDistance === 194.3 && r.OriginStationID === '7000' && r.DestinationStationID === '1000' && r.Fares[0].TicketType === 1 && r.Fares[0].FareClass === 1));
  // (A row the site answered as another type than asked: dropped.)
  assert.deepEqual(traFareRows(page.replace(/(<span>\s*)莒光(\s*<span><\/span>)/, '$1區間$2'), '7000', '1000').map(r => r.TrainType), [11, 1, 2, 3, 5, 10, 6]);
  assert.deepEqual(traFareRows('<html>查無資料</html>', '7000', '1000'), []);
  const form = traFareForm('tok', '7000', '1000', '2026/11/10');
  assert.equal(form.get('tip114QueryVOs[7].trainType'), '6');
  assert.equal(form.get('tip114QueryVOs[0].startStation'), '7000');
  assert.equal([...form.keys()].filter(k => k.endsWith('.trainType')).length, TRA_FARE_TYPES.length);

  resetFree();
  const now = Date.parse('2026-11-10T18:30:00+08:00');
  const files = new Map();
  const env = { DATA: { get: async k => (files.has(k) ? { text: async () => files.get(k).body, uploaded: new Date(files.get(k).at) } : null), put: async (k, body) => void files.set(k, { body, at: now }) } };
  const asked = [];
  let down = false;
  const fetchFn = async (u, o = {}) => {
    if (String(u).startsWith(TRA_TRAIN)) return asked.push('form'), new Response('<input type="hidden" name="_csrf" value="tok-1"/>', { headers: { 'Set-Cookie': 'T4TIPSESSIONID=abc; path=/' } });
    assert.equal(String(u), TRA_FARE);
    if (down) throw new Error('down');
    const b = new URLSearchParams(o.body);
    assert.equal(b.get('_csrf'), 'tok-1');
    assert.equal(o.headers.cookie, 'T4TIPSESSIONID=abc');
    asked.push(`${b.get('tip114QueryVOs[0].startStation')}-${b.get('tip114QueryVOs[0].endStation')}`);
    return new Response(b.get('tip114QueryVOs[0].startStation') === '7000' ? page : '<table class="fare-table"></table>');
  };
  const ask = (a, b, at = now) => freeTdx(`basic/v3/Rail/TRA/ODFare/${a}/to/${b}`, '$format=JSON', { env, fetchFn, now: at });
  const got = await ask('7000', '1000');
  assert.equal(got.state, 'free');
  assert.deepEqual(JSON.parse(got.body).ODFares.map(r => r.Fares[0].Price), [583, 583, 583, 583, 450, 376, 376, 376]);
  assert.ok(files.has(traFareFile('7000', '1000')), 'kept in R2');
  await ask('7000', '1000');
  assert.deepEqual(asked, ['form', '7000-1000'], 'asked of the site once');
  // (A new isolate: R2's copy, the site not asked.)
  resetFree();
  assert.equal(JSON.parse((await ask('7000', '1000', now + 20 * 86_400_000)).body).ODFares.length, 8);
  assert.deepEqual(asked, ['form', '7000-1000']);
  // (Past 30 days and the site down: the old copy still.)
  resetFree();
  down = true;
  assert.equal(JSON.parse((await ask('7000', '1000', now + 40 * 86_400_000)).body).ODFares.length, 8);
  // (Never read, the site down: TDX's.)
  assert.equal(await ask('1000', '3300'), null);
  down = false;
  // (A pair the site doesn't sell: TDX's, and not asked again that day.)
  assert.equal(await ask('0920', '1000'), null);
  assert.equal(await ask('0920', '1000'), null);
  assert.equal(asked.filter(x => x === '0920-1000').length, 1);
  assert.equal(await freeTdx('basic/v3/Rail/TRA/ODFare/7000/to/1000', '$filter=TrainType eq 3', { env, fetchFn, now }), null, 'asked another way: TDX');
  assert.ok(freeHeavy('basic/v3/Rail/TRA/ODFare/7000/to/1000'), 'read in the Runner');
});

test("高鐵's fares from 高鐵's own 時刻表與票價查詢 (its PriceTable), in TDX's ODFare shape, kept in R2 as 台鐵's; 南港, 臺北, 板橋 between them: no 商務", async () => {
  const { thsrFareRows, THSR_SEARCH } = await import('../transit-free.js');
  const fx = JSON.parse(readFileSync(new URL('./fixtures/thsr-fare.json', import.meta.url), 'utf8'));
  // (TDX's 臺北 → 左營, 2026-11-10: 1490 標準, 2440 商務, 1445 自由座.)
  assert.deepEqual(thsrFareRows(fx['1000-1070'], '1000', '1070'), [{ OriginStationID: '1000', DestinationStationID: '1070', Direction: 0, Fares: [{ TicketType: 1, FareClass: 1, CabinClass: 1, Price: 1490 }, { TicketType: 1, FareClass: 1, CabinClass: 2, Price: 2440 }, { TicketType: 1, FareClass: 1, CabinClass: 3, Price: 1445 }] }]);
  assert.deepEqual(thsrFareRows(fx['0990-1000'], '0990', '1000')[0].Fares.map(f => [f.CabinClass, f.Price]), [[1, 40], [3, 35]]);
  assert.equal(thsrFareRows(fx['1000-1070'], '1070', '1000')[0].Direction, 1);
  assert.equal(thsrFareRows({ success: false }, '1000', '1070'), null);

  resetFree();
  const now = Date.parse('2026-11-10T18:30:00+08:00');
  const files = new Map();
  const env = { DATA: { get: async k => (files.has(k) ? { text: async () => files.get(k), uploaded: new Date(now) } : null), put: async (k, body) => void files.set(k, body) } };
  const asked = [];
  const fetchFn = async (u, o = {}) => {
    assert.equal(String(u), THSR_SEARCH);
    const b = new URLSearchParams(o.body);
    asked.push(`${b.get('StartStation')}-${b.get('EndStation')}`);
    assert.equal(b.get('OutWardSearchDate'), '2026/11/11');
    return new Response(JSON.stringify(fx['1000-1070']));
  };
  const got = await freeTdx('basic/v2/Rail/THSR/ODFare/1000/to/1070', '$format=JSON', { env, fetchFn, now });
  assert.equal(got.state, 'free');
  assert.equal(JSON.parse(got.body)[0].Fares[0].Price, 1490);
  await freeTdx('basic/v2/Rail/THSR/ODFare/1000/to/1070', '', { env, fetchFn, now });
  assert.deepEqual(asked, ['TaiPei-ZuoYing']);
  assert.ok(files.has('rail/fare/thsr/1000-1070.json'));
  assert.equal(await freeTdx('basic/v2/Rail/THSR/ODFare/1000/to/9999', '', { env, fetchFn, now }), null, 'a station it has not: TDX');
  assert.ok(freeHeavy('basic/v2/Rail/THSR/ODFare/1000/to/1070'));
});
