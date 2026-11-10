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

import { tcRow, TC_GQL } from '../transit-free.js';
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
  const row = x => tcRow(n(x), 'TXG8163', 'TXG101', null, NOW_TC);
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
