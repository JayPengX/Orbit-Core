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
