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
