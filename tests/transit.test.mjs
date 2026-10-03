// Orbit Transit (transit.js): the TDX allowlist and shared cache, the
// monthly caps on Google's billed calls, and the route plans made one shape.
// No network: every upstream is answered here.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  tdxRequest, tdxGet, tdxAccess, resetTdxToken, resetPace, resetTurns, resetMeter, spend, usage, flushUse, billingMonth, CAPS,
  parseGoogleRoutes, parseAutocomplete, parseNominatim, parsePlace, parseTdxRoutes, planSig, googleRouteBody, handleTransit, GOOGLE_ROUTE_FIELDS
} from '../transit.js';

const NOW = Date.parse('2026-10-03T01:00:00Z');
const memKv = () => {
  const store = new Map();
  return { store, get: async k => store.get(k) ?? null, put: async (k, v) => void store.set(k, v) };
};
const memCache = () => {
  const store = new Map();
  return {
    store,
    match: async req => {
      const hit = store.get(req.url);
      return hit ? new Response(hit.body, { headers: hit.headers }) : undefined;
    },
    put: async (req, res) => void store.set(req.url, { body: await res.text(), headers: Object.fromEntries(res.headers) })
  };
};
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const fresh = () => {
  resetTdxToken();
  resetPace();
  resetTurns();
  resetMeter();
};

test('the TDX allowlist takes the app’s paths and nothing else', () => {
  const r = tdxRequest("basic/v2/Bus/EstimatedTimeOfArrival/City/Hsinchu/藍1?$filter=StopUID eq 'HSZ1234'&$select=StopUID,EstimateTime");
  assert.ok(r);
  assert.equal(r.rule.tier, 'live');
  assert.match(r.path, /City\/Hsinchu\/%E8%97%8D1$/);
  assert.match(r.query, /\$format=JSON$/);
  assert.equal(tdxRequest('basic/v3/Rail/TRA/DailyTrainTimetable/TrainDate/2026-10-03').rule.tier, 'timetable');
  assert.equal(tdxRequest('advanced/v2/Bike/Availability/NearBy?$spatialFilter=nearby(24.80, 120.97, 800)').rule.tier, 'live');
  assert.equal(tdxRequest('basic/v2/Rail/Metro/StationOfLine/TRTC').rule.tier, 'static');
  // Not allowed: other paths, other parameters, a bad spatial filter.
  assert.equal(tdxRequest('basic/v2/Tourism/ScenicSpot'), null);
  assert.equal(tdxRequest('basic/v2/Bus/Route/City/Hsinchu?$expand=x'), null);
  assert.equal(tdxRequest('advanced/v2/Bike/Station/NearBy?$spatialFilter=nearby(1,2,3);drop'), null);
  assert.equal(tdxRequest('../auth/token'), null);
  // The same question in any order is one cache entry.
  assert.equal(tdxRequest('basic/v2/Bus/Route/City/Taipei?$top=5&$select=RouteUID').query, tdxRequest('basic/v2/Bus/Route/City/Taipei?$select=RouteUID&$top=5').query);
});

test('a TDX token is fetched once and kept', async () => {
  fresh();
  const env = { TDX_CLIENT_ID: 'id', TDX_CLIENT_SECRET: 'secret', RATE_LIMIT_KV: memKv() };
  let calls = 0;
  const fetchFn = async (url, o) => {
    calls++;
    assert.match(url, /openid-connect\/token$/);
    assert.match(o.body, /grant_type=client_credentials/);
    return json({ access_token: 'T1', expires_in: 86400 });
  };
  assert.equal(await tdxAccess(env, fetchFn, NOW), 'T1');
  assert.equal(await tdxAccess(env, fetchFn, NOW + 60_000), 'T1');
  resetTdxToken();
  assert.equal(await tdxAccess(env, fetchFn, NOW + 120_000), 'T1', 'from KV');
  assert.equal(calls, 1);
  assert.equal(await tdxAccess({}, fetchFn, NOW), null, 'no key, no token');
});

test('TDX answers are shared: fresh from the cache, stale while refreshing, the last copy when TDX is busy', async () => {
  fresh();
  const env = { TDX_CLIENT_ID: 'id', TDX_CLIENT_SECRET: 'secret', RATE_LIMIT_KV: memKv(), TDX_PER_MIN: '1' };
  const cache = memCache();
  const log = [];
  const fetchFn = async url => {
    if (url.includes('token')) return json({ access_token: 'T', expires_in: 86400 });
    log.push(url);
    return json([{ StationUID: 'HSZ1', AvailableRentBikes: log.length }]);
  };
  const path = 'basic/v2/Bike/Availability/City/Hsinchu';
  const a = await tdxGet(env, path, { fetchFn, cache, now: NOW });
  assert.equal(a.state, 'miss');
  assert.match(log[0], /^https:\/\/tdx\.transportdata\.tw\/api\/basic\/v2\/Bike\/Availability\/City\/Hsinchu\?\$format=JSON$/);
  const b = await tdxGet(env, path, { fetchFn, cache, now: NOW + 10_000 });
  assert.equal(b.state, 'hit');
  assert.equal(log.length, 1);
  // Past fresh (50 s), inside stale: the old copy at once, a refresh behind.
  const waits = [];
  const c = await tdxGet(env, path, { fetchFn, cache, now: NOW + 70_000, ctx: { waitUntil: p => waits.push(p) } });
  assert.equal(c.state, 'stale');
  assert.equal(JSON.parse(c.body)[0].AvailableRentBikes, 1);
  await Promise.all(waits);
  assert.equal(log.length, 2);
  // Over this Worker's own pace: the copy it has, however old.
  const d = await tdxGet(env, 'basic/v2/Bike/Station/City/Hsinchu', { fetchFn, cache, now: NOW + 70_500 });
  assert.equal(d.status, 429);
  assert.equal(JSON.parse(d.body).code, 'TDX_BUSY');
  const e = await tdxGet(env, path, { fetchFn, cache, now: NOW + 70_000 + 5 * 60_000 });
  assert.equal(e.status, 200);
});

test('on a paid plan TDX calls wait their turn (a second’s worth at a time) and a 429 is asked again', async () => {
  fresh();
  const env = { TDX_CLIENT_ID: 'id', TDX_CLIENT_SECRET: 'secret', RATE_LIMIT_KV: memKv(), TDX_PER_MIN: '240', TDX_PER_SEC: '20' };
  const times = [];
  let refused = 0;
  const fetchFn = async url => {
    if (url.includes('token')) return json({ access_token: 'T', expires_in: 86400 });
    times.push(Date.now());
    // TDX refuses the first ask of one path (another isolate took the second).
    if (url.includes('Taipei') && !refused++) return json({ message: 'API rate limit exceeded' }, 429);
    return json([]);
  };
  const cities = ['Hsinchu', 'HsinchuCounty', 'Taipei', 'Taichung', 'Tainan', 'Kaohsiung'];
  const got = await Promise.all(cities.map(c => tdxGet(env, `basic/v2/Bike/Station/City/${c}`, { fetchFn, cache: memCache(), now: NOW })));
  assert.deepEqual(got.map(g => g.status), cities.map(() => 200), 'every one answered, none busy');
  assert.equal(times.length, 7, 'Taipei asked twice');
  const sorted = times.slice().sort((a, b) => a - b);
  for (let i = 1; i < sorted.length; i++) assert.ok(sorted[i] - sorted[i - 1] >= 40, 'spaced 50 ms apart');
});

test('no TDX key: a clear answer, nothing fetched', async () => {
  fresh();
  const got = await tdxGet({ RATE_LIMIT_KV: memKv() }, 'basic/v2/Bus/Route/City/Hsinchu', { fetchFn: async () => assert.fail('no fetch'), cache: memCache(), now: NOW });
  assert.equal(got.status, 503);
  assert.equal(JSON.parse(got.body).code, 'TDX_NO_KEY');
});

test('Google calls stop at the monthly cap, counted in batches', async () => {
  fresh();
  const kv = memKv();
  const env = { RATE_LIMIT_KV: kv };
  const month = billingMonth(NOW);
  assert.equal(month, '2026-10');
  // The month's stored count near the cap.
  await kv.put(`transit:use:${month}`, JSON.stringify({ routes: CAPS.routes - 2 }));
  assert.equal(await spend(env, 'routes', 1, NOW), true);
  assert.equal(await spend(env, 'routes', 1, NOW), true);
  assert.equal(await spend(env, 'routes', 1, NOW), false);
  await flushUse(env, NOW);
  assert.equal(JSON.parse(kv.store.get(`transit:use:${month}`)).routes, CAPS.routes);
  // A new month starts at nothing.
  assert.equal(await spend(env, 'routes', 1, Date.parse('2026-11-01T09:00:00Z')), true);
  assert.equal((await usage(env, Date.parse('2026-11-01T09:00:00Z'))).routes, 1);
  // Pacific time: 2026-11-01 05:00 UTC is still October there.
  assert.equal(billingMonth(Date.parse('2026-11-01T05:00:00Z')), '2026-10');
});

test('the map is Google’s under the cap, Taiwan’s NLSC map past it', async () => {
  fresh();
  const kv = memKv();
  const env = { RATE_LIMIT_KV: kv, GOOGLE_MAPS_BROWSER_KEY: 'browser-key' };
  const req = new Request('https://w/transit/config?qt=x');
  const session = { s: 'S' };
  let res = await handleTransit(req, env, {}, '/transit/config', { session, now: NOW, cache: memCache() });
  assert.deepEqual((await res.json()).map, { provider: 'google', key: 'browser-key' });
  resetMeter();
  await kv.put(`transit:use:${billingMonth(NOW)}`, JSON.stringify({ maps: CAPS.maps }));
  res = await handleTransit(req, env, {}, '/transit/config', { session, now: NOW, cache: memCache() });
  assert.deepEqual((await res.json()).map, { provider: 'nlsc' });
  // No session: nothing.
  res = await handleTransit(req, env, {}, '/transit/config', { session: null, now: NOW });
  assert.equal(res.status, 401);
  // The status page names no key.
  res = await handleTransit(new Request('https://w/transit/status'), env, {}, '/transit/status', { now: NOW });
  const status = await res.json();
  assert.equal(status.keys.mapsBrowser, true);
  assert.ok(!JSON.stringify(status).includes('browser-key'));
});

test('search: Google’s suggestions, OpenStreetMap’s past the cap', async () => {
  fresh();
  const kv = memKv();
  const env = { RATE_LIMIT_KV: kv, GOOGLE_MAPS_KEY: 'server-key' };
  const seen = [];
  const fetchFn = async (url, o) => {
    seen.push(url);
    if (url.includes('places:autocomplete')) {
      const body = JSON.parse(o.body);
      assert.equal(body.input, '新竹火車站');
      assert.deepEqual(body.includedRegionCodes, ['tw']);
      assert.equal(o.headers['X-Goog-Api-Key'], 'server-key');
      return json({ suggestions: [{ placePrediction: { placeId: 'ChIJabc123', text: { text: '新竹火車站, 東區新竹市' }, structuredFormat: { mainText: { text: '新竹火車站' }, secondaryText: { text: '東區新竹市' } }, distanceMeters: 1200, types: ['train_station'] } }, { queryPrediction: { text: { text: '新竹火車站 美食' } } }] });
    }
    return json([{ osm_type: 'node', osm_id: 42, name: '新竹車站', display_name: '新竹車站, 中華路二段, 東區, 新竹市', lat: '24.8016', lon: '120.9716' }]);
  };
  const ask = () => handleTransit(new Request('https://w/transit/search?q=%E6%96%B0%E7%AB%B9%E7%81%AB%E8%BB%8A%E7%AB%99&lat=24.8&lon=120.97&s=abcdefgh12'), env, {}, '/transit/search', { session: { s: 'S' }, fetchFn, now: NOW, cache: memCache() });
  let out = await (await ask()).json();
  assert.equal(out.by, 'google');
  assert.deepEqual(out.items, [{ id: 'ChIJabc123', name: '新竹火車站', sub: '東區新竹市', dist: 1200, types: ['train_station'] }]);
  resetMeter();
  await kv.put(`transit:use:${billingMonth(NOW)}`, JSON.stringify({ autocomplete: CAPS.autocomplete }));
  out = await (await ask()).json();
  assert.equal(out.by, 'osm');
  assert.deepEqual(out.items[0], { id: 'osm:n42', name: '新竹車站', sub: '中華路二段 東區 新竹市', lat: 24.8016, lon: 120.9716 });
  assert.match(seen.at(-1), /nominatim\.openstreetmap\.org\/search\?.*countrycodes=tw/);
});

test('a place: Essentials fields unless the name is asked for', async () => {
  fresh();
  const env = { RATE_LIMIT_KV: memKv(), GOOGLE_MAPS_KEY: 'k' };
  const masks = [];
  const fetchFn = async (url, o) => {
    masks.push(o.headers['X-Goog-FieldMask']);
    return json({ id: 'ChIJabc123', displayName: { text: '巨城購物中心' }, location: { latitude: 24.8095, longitude: 120.9746 }, formattedAddress: '300新竹市東區中央路229號', types: ['shopping_mall'] });
  };
  const ask = name => handleTransit(new Request(`https://w/transit/place?id=ChIJabc123${name ? '&name=1' : ''}`), env, {}, '/transit/place', { session: { s: 'S' }, fetchFn, now: NOW, cache: memCache() });
  assert.deepEqual(await (await ask(false)).json(), { id: 'ChIJabc123', name: '巨城購物中心', lat: 24.8095, lon: 120.9746, address: '300新竹市東區中央路229號', types: ['shopping_mall'] });
  await ask(true);
  assert.deepEqual(masks, ['id,location,formattedAddress,types', 'id,location,formattedAddress,types,displayName']);
  assert.equal((await usage(env, NOW)).details, 1);
  assert.equal((await usage(env, NOW)).detailsPro, 1);
  assert.equal(parsePlace({}), null);
});

// A Google transit answer in its documented shape (Routes API v2): walk,
// TRA 區間車 新竹 → 竹北 (a branch-line trip would look the same), walk.
const GOOGLE = {
  routes: [
    {
      duration: '1500s',
      distanceMeters: 9800,
      travelAdvisory: { transitFare: { currencyCode: 'TWD', units: '19' } },
      legs: [
        {
          steps: [
            { travelMode: 'WALK', staticDuration: '120s', distanceMeters: 150, polyline: { encodedPolyline: 'abc' }, startLocation: { latLng: { latitude: 24.8, longitude: 120.97 } }, endLocation: { latLng: { latitude: 24.801, longitude: 120.971 } } },
            { travelMode: 'WALK', staticDuration: '60s', distanceMeters: 60, polyline: { encodedPolyline: 'def' }, startLocation: { latLng: { latitude: 24.801, longitude: 120.971 } }, endLocation: { latLng: { latitude: 24.8016, longitude: 120.9716 } } },
            {
              travelMode: 'TRANSIT',
              staticDuration: '600s',
              distanceMeters: 9000,
              polyline: { encodedPolyline: 'ghi' },
              transitDetails: {
                stopDetails: { departureStop: { name: '新竹', location: { latLng: { latitude: 24.8016, longitude: 120.9716 } } }, arrivalStop: { name: '竹北', location: { latLng: { latitude: 24.8392, longitude: 121.0093 } } }, departureTime: '2026-10-03T01:10:00Z', arrivalTime: '2026-10-03T01:20:00Z' },
                headsign: '基隆',
                stopCount: 2,
                transitLine: { name: '西部幹線', nameShort: '區間車', color: '#0b62a4', textColor: '#ffffff', agencies: [{ name: '臺灣鐵路' }], vehicle: { type: 'HEAVY_RAIL', name: { text: '火車' } } }
              }
            },
            { travelMode: 'WALK', staticDuration: '300s', distanceMeters: 400, polyline: { encodedPolyline: 'jkl' }, startLocation: { latLng: { latitude: 24.8392, longitude: 121.0093 } }, endLocation: { latLng: { latitude: 24.84, longitude: 121.012 } } }
          ]
        }
      ]
    }
  ]
};

test('Google’s transit routes become plans: walks joined and timed, the ride named, the fare', () => {
  const [p] = parseGoogleRoutes(GOOGLE, NOW);
  assert.equal(p.src, 'google');
  assert.equal(p.legs.length, 3);
  assert.deepEqual(p.legs.map(l => l.mode), ['walk', 'tra', 'walk']);
  const [w, ride, w2] = p.legs;
  assert.equal(w.dur, 180);
  assert.equal(w.dist, 210);
  assert.deepEqual(w.poly, ['abc', 'def']);
  assert.equal(w.arr, Date.parse('2026-10-03T01:10:00Z'));
  assert.equal(w.dep, Date.parse('2026-10-03T01:07:00Z'));
  assert.equal(ride.short, '區間車');
  assert.equal(ride.from.name, '新竹');
  assert.equal(ride.to.name, '竹北');
  assert.equal(ride.agency, '臺灣鐵路');
  assert.equal(w2.dep, Date.parse('2026-10-03T01:20:00Z'));
  assert.equal(p.dur, 1080);
  assert.equal(p.fare, 19);
  assert.equal(p.transfers, 0);
  assert.equal(p.walk, 610);
  assert.equal(planSig(p), 'tra:區間車:新竹>竹北');
});

test('the Google request asks for transit with alternatives, in Chinese, and only the fields read', () => {
  const b = googleRouteBody({ lat: 24.8, lon: 120.97 }, { lat: 25.04, lon: 121.51 }, { at: NOW, by: 'arrive' });
  assert.equal(b.travelMode, 'TRANSIT');
  assert.equal(b.computeAlternativeRoutes, true);
  assert.equal(b.languageCode, 'zh-TW');
  assert.equal(b.arrivalTime, new Date(NOW).toISOString());
  assert.ok(!('routingPreference' in b), 'no traffic-aware preference: that would bill as Pro');
  assert.ok(!GOOGLE_ROUTE_FIELDS.includes('*'));
});

test('TDX’s planner is read loosely: sections as a list or an object, missing fields left empty', () => {
  const j = {
    result: 'success',
    data: {
      routes: [
        {
          travel_time: 4114,
          start_time: '2022-06-28T21:56:50.0000000+08:00',
          end_time: '2022-06-28T23:05:24.0000000+08:00',
          transfers: 0,
          sections: [
            { type: 'pedestrian', departure: { time: '2022-06-28T21:56:50+08:00', place: { location: { lat: 25.0477, lng: 121.5163 } } }, arrival: { time: '2022-06-28T22:01:00+08:00', place: { name: '臺北', location: { lat: 25.0478, lng: 121.5170 } } }, travelSummary: { duration: 250, length: 300 } },
            { type: 'transit', transport: { mode: 'highSpeedTrain', name: '高鐵', shortName: '0611', headsign: '左營' }, departure: { time: '2022-06-28T22:01:00+08:00', place: { name: '臺北' } }, arrival: { time: '2022-06-28T22:30:00+08:00', place: { name: '新竹' } }, polyline: 'BFoz5xJ67i1B1B7PzIhaxL7Y' }
          ]
        },
        { sections: { a: { type: 'pedestrian', departure: { time: '2022-06-28T21:00:00+08:00' }, arrival: { time: '2022-06-28T21:10:00+08:00' } } } }
      ]
    }
  };
  const plans = parseTdxRoutes(j);
  assert.equal(plans.length, 2);
  assert.deepEqual(plans[0].legs.map(l => l.mode), ['walk', 'hsr']);
  assert.equal(plans[0].legs[1].short, '0611');
  assert.equal(plans[0].legs[1].dur, 29 * 60);
  assert.equal(plans[0].legs[1].fmt, 'f');
  assert.equal(plans[0].dur, Math.round((Date.parse('2022-06-28T22:30:00+08:00') - Date.parse('2022-06-28T21:56:50+08:00')) / 1000));
  assert.equal(plans[1].legs[0].dur, 600);
  assert.deepEqual(parseTdxRoutes({}), []);
  // As TDX answers live: modes in its own words, zero-length cycle / taxi stubs at the ends.
  const at = (t, lat, lng, name) => ({ time: t, place: { name, location: { lat, lng } } });
  const live = parseTdxRoutes({
    data: {
      routes: [
        {
          sections: [
            { type: 'cycle', transport: { mode: 'cycle' }, travelSummary: { duration: 0, length: 1.5 }, departure: at('2026-10-03T17:22:00', 24.8016, 120.9716), arrival: at('2026-10-03T17:22:00', 24.8016, 120.9716, '新竹') },
            { type: 'transit', transport: { mode: 'TRA', name: '高雄-七堵', headsign: '七堵' }, travelSummary: { duration: 4260, length: 0 }, departure: at('2026-10-03T17:22:00', 24.8016, 120.9716, '新竹'), arrival: at('2026-10-03T18:33:00', 25.0478, 121.5171, '臺北') },
            { type: 'drive', transport: { mode: 'YOXI' }, travelSummary: { duration: 1, length: 16 }, departure: at('2026-10-03T18:33:00', 25.0478, 121.5171, '臺北'), arrival: at('2026-10-03T18:33:01', 25.0477, 121.517) }
          ]
        }
      ]
    }
  });
  assert.deepEqual(live[0].legs.map(l => l.mode), ['tra']);
  assert.equal(live[0].dep, Date.parse('2026-10-03T17:22:00+08:00'), 'TDX’s zoneless times are Taiwan’s');
  assert.ok(live[0].legs[0].dist > 30_000);
});

test('route plans: both sources, the same ride once, fastest first, shared for 5 minutes', async () => {
  fresh();
  const env = { RATE_LIMIT_KV: memKv(), GOOGLE_MAPS_KEY: 'k', TDX_CLIENT_ID: 'id', TDX_CLIENT_SECRET: 's', TDX_PER_MIN: '300' };
  const cache = memCache();
  let google = 0;
  let tdx = 0;
  const fetchFn = async url => {
    if (url.includes('token')) return json({ access_token: 'T', expires_in: 86400 });
    if (url.startsWith('https://routes.googleapis.com')) {
      google++;
      return json(GOOGLE);
    }
    if (url.includes('/maas/routing')) {
      tdx++;
      const u = new URL(url);
      assert.equal(u.searchParams.get('origin'), '24.8,120.97');
      assert.equal(u.searchParams.get('gc'), '1.0');
      // Asked walking (0) and by YouBike (3); the bike answer here is the same rides.
      assert.ok(['0', '3'].includes(u.searchParams.get('first_mile_mode')));
      // The same ride as Google's, and a slower bus.
      return json({ data: { routes: [
        { sections: [{ type: 'transit', transport: { mode: 'regionalTrain', shortName: '區間車', name: '西部幹線' }, departure: { time: '2026-10-03T09:10:00+08:00', place: { name: '新竹' } }, arrival: { time: '2026-10-03T09:20:00+08:00', place: { name: '竹北' } } }] },
        { sections: [{ type: 'transit', transport: { mode: 'bus', shortName: '5608' }, departure: { time: '2026-10-03T09:05:00+08:00', place: { name: '新竹站' } }, arrival: { time: '2026-10-03T09:45:00+08:00', place: { name: '竹北' } } }] }
      ] } });
    }
    assert.fail(`unexpected ${url}`);
  };
  const ask = () => handleTransit(new Request(`https://w/transit/route?from=24.8,120.97&to=24.84,121.012&at=${NOW}`), env, {}, '/transit/route', { session: { s: 'S' }, fetchFn, now: NOW, cache });
  const out = await (await ask()).json();
  assert.deepEqual(out.sources, { google: 'ok', tdx: 'ok', tdxBike: 'ok' });
  // The train is one plan (TDX's copy has no walks, so it arrives first).
  assert.equal(out.plans.length, 2);
  assert.equal(out.plans[0].src, 'tdx');
  assert.equal(out.plans[1].legs[0].short, '5608');
  const again = await (await ask()).json();
  assert.equal(again.cached, true);
  assert.equal(google, 1);
  assert.equal(tdx, 2);
  const bad = await handleTransit(new Request('https://w/transit/route?from=35,139&to=24.8,120.9'), env, {}, '/transit/route', { session: { s: 'S' }, fetchFn, now: NOW, cache });
  assert.equal(bad.status, 400);
});

test('autocomplete and OpenStreetMap parsing drop what can’t be used', () => {
  assert.deepEqual(parseAutocomplete({ suggestions: [{ queryPrediction: {} }, { placePrediction: { place: 'places/XYZ12345', text: { text: '城隍廟' } } }] }), [{ id: 'XYZ12345', name: '城隍廟', sub: '', dist: null, types: [] }]);
  assert.deepEqual(parseNominatim([{ name: 'x' }]), []);
});
