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
  const { r2Store, memoryBucket } = await import('../builders/store.js');
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
  const r = await runBuses({ store, env: {}, now, tdx });
  assert.deepEqual(r.built, ['Hsinchu']);
  const pack = await store.json('bus/Hsinchu.json');
  assert.deepEqual(pack.routes[0].sched[0][3], [[2, 425]]);
  assert.ok(asked.some(([p, top]) => p.includes('Schedule') && top <= 50), 'timetables a few routes a page');
  assert.equal((await store.json('index.json')).cities.Hsinchu.built, new Date(now).toISOString());
});

test("a bus pack read wrong (TDX's answer not a list, or no routes) is never written over the good one", async () => {
  const { runBuses, tdxClient, CITIES } = await import('../builders/buses.js');
  const { r2Store, memoryBucket } = await import('../builders/store.js');
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
  const { r2Store, memoryBucket } = await import('../builders/store.js');
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
