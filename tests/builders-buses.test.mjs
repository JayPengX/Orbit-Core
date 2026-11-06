import { test } from 'node:test';
import assert from 'node:assert/strict';

test('shapes: a multi-part line split into its parts, simplified within 12 m, encoded as Google does', async () => {
  const { wktParts, simplify, encode } = await import('../builders/buses.js');
  const parts = wktParts('MULTILINESTRING((121.5 25.0,121.51 25.0),(121.6 25.1,121.61 25.1))');
  assert.equal(parts.length, 2);
  assert.deepEqual(parts[0][0], [25, 121.5]);
  // A point 1 m off a straight line goes; one 50 m off stays.
  assert.equal(simplify([[25, 121.5], [25.00001, 121.505], [25, 121.51]]).length, 2);
  assert.equal(simplify([[25, 121.5], [25.0005, 121.505], [25, 121.51]]).length, 3);
  // Google's own example.
  assert.equal(encode([[38.5, -120.2], [40.7, -120.95], [43.252, -126.453]]), '_p~iF~ps|U_ulLnnqC_mqNvxq`@');
});

test('bus packs on R2: only a city over six days old is rebuilt, its timetables made compact a page at a time', async () => {
  const { runBuses } = await import('../builders/buses.js');
  const { r2Store } = await import('../builders/store.js');
  const { memoryBucket } = await import('./fixtures/bucket.mjs');
  const now = Date.parse('2026-10-20T16:17:00Z');
  const fresh = new Date(now - 86_400_000).toISOString();
  const old = new Date(now - 8 * 86_400_000).toISOString();
  const cities = Object.fromEntries((await import('../builders/buses.js')).CITIES.map(c => [c, { routes: 1, bytes: 1, built: fresh }]));
  cities.Hsinchu.built = old;
  const store = r2Store(memoryBucket({ 'index.json': { built: fresh, cities } }));
  const asked = [];
  const tdx = {
    pages: async (path, top, each) => {
      asked.push([path, top]);
      if (path.includes('StopOfRoute')) each([{ RouteUID: 'R1', RouteName: { Zh_tw: '182' }, Direction: 0, Stops: [{ StopUID: 'S1', StopSequence: 1, StopName: { Zh_tw: '新竹站' }, StopPosition: { PositionLat: 24.8, PositionLon: 120.97 } }] }]);
      if (path.includes('Schedule')) each([{ RouteUID: 'R1', RouteName: { Zh_tw: '182' }, Direction: 0, Timetables: [{ ServiceDay: { Monday: 1 }, StopTimes: [{ StopUID: 'S1', StopSequence: 1, DepartureTime: '07:05' }] }] }]);
    }
  };
  // (Its time budget on the real clock: the run checks Date.now against it.)
  const r = await runBuses({ store, env: {}, now, tdx, until: Date.now() + 60_000 });
  assert.deepEqual(r.built, ['Hsinchu']);
  const pack = await store.json('bus/Hsinchu.json');
  assert.deepEqual(pack.routes[0].sched[0][3], [[2, 425]]);
  assert.ok(asked.some(([p, top]) => p.includes('Schedule') && top <= 50), 'timetables a few routes a page');
  assert.equal((await store.json('index.json')).cities.Hsinchu.built, new Date(now).toISOString());
});

test("a bus pack read wrong (TDX's answer not a list, or no routes) is never written over the good one", async () => {
  const { runBuses, tdxClient, CITIES } = await import('../builders/buses.js');
  const { r2Store } = await import('../builders/store.js');
  const { memoryBucket } = await import('./fixtures/bucket.mjs');
  const now = Date.parse('2026-10-20T16:17:00Z');
  const fresh = new Date(now - 86_400_000).toISOString();
  const cities = Object.fromEntries(CITIES.map(c => [c, { routes: 120, bytes: 1, built: c === 'Hsinchu' ? new Date(now - 8 * 86_400_000).toISOString() : fresh }]));
  const store = r2Store(memoryBucket({ 'index.json': { built: fresh, cities }, 'bus/Hsinchu.json': { v: 1, city: 'Hsinchu', routes: new Array(120).fill({ uid: 'x' }) } }));
  const get = async url => (url.includes('token') ? Response.json({ access_token: 'T' }) : Response.json({ Message: 'temporarily unavailable' }));
  const r = await runBuses({ store, env: {}, now, until: Date.now() + 60_000, tdx: tdxClient({}, { get, sleep: async () => {}, gap: 0 }) });
  assert.deepEqual(r.built, []);
  assert.equal((await store.json('bus/Hsinchu.json')).routes.length, 120);
  assert.equal((await store.json('index.json')).cities.Hsinchu.routes, 120);
});

test("where.json: a YouBike city that fails half way marks nothing, never its stations under the next city's name", async () => {
  const { buildWhere } = await import('../builders/buses.js');
  const { r2Store } = await import('../builders/store.js');
  const { memoryBucket } = await import('./fixtures/bucket.mjs');
  const store = r2Store(memoryBucket({}));
  const tdx = {
    pages: async (path, top, each) => {
      const city = /City\/(\w+)\?/.exec(path)[1];
      if (city === 'Taipei') {
        each([{ StationPosition: { PositionLat: 25.04, PositionLon: 121.51 } }]);
        throw new Error('page 2 failed');
      }
      if (city === 'NewTaipei') each([{ StationPosition: { PositionLat: 25.01, PositionLon: 121.46 } }]);
    }
  };
  await buildWhere(store, tdx, { cities: {} }, 'b');
  const w = await store.json('where.json');
  assert.deepEqual(w.packs, ['bike:NewTaipei']);
  assert.equal(w.cells[`${Math.floor(25.04 / w.cell)}_${Math.floor(121.51 / w.cell)}`], undefined);
});

test("bus stations on R2: each city's in 0.05° tiles as TDX's NearBy gives them, weekly on their own; the phone's list once every city has its", async () => {
  const { runBuses, CITIES, tileOf, TILE } = await import('../builders/buses.js');
  const { r2Store } = await import('../builders/store.js');
  const { memoryBucket } = await import('./fixtures/bucket.mjs');
  const now = Date.parse('2026-11-06T10:24:00Z');
  const fresh = new Date(now - 86_400_000).toISOString();
  const cities = Object.fromEntries(CITIES.map(c => [c, { routes: 1, bytes: 1, built: fresh }]));
  // Every city's packs fresh; every city's stations but 新竹市's and 公路客運's built this week.
  const stations = Object.fromEntries(CITIES.filter(c => c !== 'Hsinchu' && c !== 'InterCity').map(c => [c, { stations: 1, tiles: ['25.00_121.50'], built: fresh }]));
  const store = r2Store(memoryBucket({ 'index.json': { built: fresh, cities, stations } }));
  const station = (uid, lat, lon, stops, code = 'HSZ') => ({ StationUID: uid, StationID: uid.slice(3), StationName: { Zh_tw: '新竹站', En: 'Hsinchu Station' }, StationPosition: { PositionLat: lat, PositionLon: lon }, Stops: stops, LocationCityCode: code, Bearing: 'W' });
  const stop = (uid, route, name) => ({ StopUID: uid, RouteUID: route, RouteName: { Zh_tw: name, En: name } });
  let asked = [];
  let interCity = () => {
    throw new Error('TDX: 503');
  };
  let hsinchu = [station('HSZ2', 24.80168, 120.97162, [stop('HSZ20', 'HSZ0010', '10')]), station('HSZ1', 24.80171, 120.97166, [stop('HSZ12', 'HSZ0020', '20'), stop('HSZ11', 'HSZ0010', '10')]), station('HSZ9', 0, 0, [])];
  const tdx = {
    pages: async (path, top, each) => {
      asked.push(path);
      if (path.startsWith('basic/v2/Bus/Station/City/Hsinchu?')) each(hsinchu);
      if (path.startsWith('basic/v2/Bus/Station/InterCity?')) each(interCity());
    }
  };
  let r = await runBuses({ store, env: {}, now, tdx, until: Date.now() + 60_000 });
  assert.deepEqual(r.built, []);
  assert.deepEqual(r.stations, ['Hsinchu']);
  // Only the two not built this week asked, with what the phone reads.
  assert.deepEqual(asked.filter(p => p.includes('/Station/')).map(p => p.split('?')[0]), ['basic/v2/Bus/Station/City/Hsinchu', 'basic/v2/Bus/Station/InterCity']);
  assert.ok(asked.every(p => !p.includes('/Station/') || p.includes('$select=StationUID,StationID,StationName,StationPosition,Stops,LocationCityCode,Bearing')));
  assert.equal(tileOf(24.80168, 120.97162), '24.80_120.95');
  const tile = await store.json('station/Hsinchu/24.80_120.95.json');
  // In order (the same stations, the same bytes), TDX's 0,0 left out, each route's names once.
  assert.deepEqual(tile.stations, [
    ['HSZ1', '1', '新竹站', 'Hsinchu Station', 24.80171, 120.97166, 'HSZ', 'W', [['HSZ11', 'HSZ0010'], ['HSZ12', 'HSZ0020']]],
    ['HSZ2', '2', '新竹站', 'Hsinchu Station', 24.80168, 120.97162, 'HSZ', 'W', [['HSZ20', 'HSZ0010']]]
  ]);
  assert.deepEqual(tile.routes, { HSZ0010: ['10', '10'], HSZ0020: ['20', '20'] });
  assert.deepEqual((await store.json('index.json')).stations.Hsinchu, { stations: 2, tiles: ['24.80_120.95'], built: new Date(now).toISOString() });
  // 公路客運's failed: no phone's list yet (its stops would be off the map; TDX's search till then).
  assert.equal(await store.json('station/index.json'), null);

  // The next run: 公路客運's read, and the list for the phone, every city's tiles.
  asked = [];
  interCity = () => [station('THB103245', 24.80227, 120.97838, [stop('THB273805', 'THB1728', '1728')], 'HSZ')];
  r = await runBuses({ store, env: {}, now: now + 3_600_000, tdx, until: Date.now() + 60_000 });
  assert.deepEqual(r.stations, ['InterCity']);
  const list = await store.json('station/index.json');
  assert.equal(list.tile, TILE);
  assert.deepEqual(Object.keys(list.cities), CITIES);
  assert.deepEqual(list.cities.Hsinchu, ['24.80_120.95']);
  assert.deepEqual(list.cities.InterCity, ['24.80_120.95']);
  assert.deepEqual((await store.json('station/InterCity/24.80_120.95.json')).stations[0].slice(0, 3), ['THB103245', '103245', '新竹站']);

  // A week on, a read of under half the stations it had is a read gone wrong: the tiles there stay.
  const index = await store.json('index.json');
  index.stations.Hsinchu.stations = 5;
  await store.put('index.json', index);
  r = await runBuses({ store, env: {}, now: now + 7 * 86_400_000, tdx, until: Date.now() + 60_000 });
  assert.ok(!r.stations.includes('Hsinchu'));
  assert.equal((await store.json('station/Hsinchu/24.80_120.95.json')).stations.length, 2);
  assert.equal((await store.json('index.json')).stations.Hsinchu.stations, 5);
});
