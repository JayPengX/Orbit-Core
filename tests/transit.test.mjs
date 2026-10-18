// Orbit Transit (transit.js): the TDX allowlist and shared cache, the
// monthly caps on Google's billed calls, and the route plans made one shape.
// No network: every upstream is answered here.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  tdxRequest, tdxGet, SLOW_MS, tdxAccess, resetTdxToken, resetPace, resetTurns, resetMeter, spend, usage, flushUse, billingMonth, CAPS,
  parseGoogleRoutes, parseAutocomplete, nearFirst, parseNominatim, parsePlace, parseTdxRoutes, planSig, googleRouteBody, handleTransit, GOOGLE_ROUTE_FIELDS, tdxPoints, tdxGuard, onceName
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

test('TDX slow past a copy’s stale time: that copy after SLOW_MS (its age said), TDX’s answer kept for the next ask', async () => {
  fresh();
  const env = { TDX_CLIENT_ID: 'id', TDX_CLIENT_SECRET: 'secret', RATE_LIMIT_KV: memKv(), TDX_PER_MIN: '240' };
  const cache = memCache();
  let n = 0;
  let hang = false;
  const fetchFn = async url => {
    if (url.includes('token')) return json({ access_token: 'T', expires_in: 86400 });
    n++;
    if (hang) await new Promise(r => setTimeout(r, SLOW_MS + 1500));
    return json([{ StopUID: 'S1', EstimateTime: 60 * n }]);
  };
  const path = 'basic/v2/Bus/EstimatedTimeOfArrival/City/Taipei';
  await tdxGet(env, path, { fetchFn, cache, now: NOW });
  hang = true;
  const waits = [];
  const t0 = Date.now();
  // 3 minutes on: past its stale minute, still kept (a live copy 10 minutes).
  const old = await tdxGet(env, path, { fetchFn, cache, now: NOW + 3 * 60_000, ctx: { waitUntil: p => waits.push(p) } });
  assert.ok(Date.now() - t0 < SLOW_MS + 800, 'answered after SLOW_MS, not when TDX did');
  assert.equal(old.state, 'stale');
  assert.equal(old.age, 3 * 60_000);
  assert.equal(JSON.parse(old.body)[0].EstimateTime, 60);
  // (The refresh, then the cache write it hands to waitUntil.)
  for (let i = 0; i < 3; i++) await Promise.all(waits);
  const next = await tdxGet(env, path, { fetchFn, cache, now: NOW + 3 * 60_000 + 1000 });
  assert.equal(next.state, 'hit');
  assert.equal(JSON.parse(next.body)[0].EstimateTime, 120);
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
  assert.deepEqual(out.items[0], { id: 'osm:n42', name: '新竹車站', sub: '中華路二段 東區 新竹市', lat: 24.8016, lon: 120.9716, dist: 240 });
  assert.match(seen.at(-1), /nominatim\.openstreetmap\.org\/search\?.*countrycodes=tw/);
});

test('search: a narrow answer (under 3 suggestions) topped up by Text Search, each place once, with its position', async () => {
  fresh();
  const env = { RATE_LIMIT_KV: memKv(), GOOGLE_MAPS_KEY: 'k' };
  let texts = 0;
  const fetchFn = async (url, o) => {
    if (url.includes('places:autocomplete')) return json({ suggestions: [{ placePrediction: { placeId: 'A1', structuredFormat: { mainText: { text: 'LaLaport南港' }, secondaryText: { text: '南港區' } }, distanceMeters: 71000 } }] });
    if (url.includes('places:searchText')) {
      texts++;
      assert.equal(JSON.parse(o.body).textQuery, 'lalaport 南港');
      assert.match(o.headers['X-Goog-FieldMask'], /places\.location/);
      return json({ places: [{ id: 'A1', displayName: { text: 'LaLaport南港' }, formattedAddress: '115台灣台北市南港區經貿二路131號', location: { latitude: 25.0553, longitude: 121.6176 } }, { id: 'B2', displayName: { text: 'Mitsui Shopping Park LaLaport 南港' }, formattedAddress: '115台灣台北市南港區經貿二路131號', location: { latitude: 25.0556, longitude: 121.6172 } }] });
    }
    return json([]);
  };
  const out = await (await handleTransit(new Request('https://w/transit/search?q=lalaport%20%E5%8D%97%E6%B8%AF&lat=24.8&lon=120.97'), env, {}, '/transit/search', { session: { s: 'S' }, fetchFn, now: NOW, cache: memCache() })).json();
  assert.equal(texts, 1);
  assert.deepEqual(out.items.map(i => i.id), ['A1', 'B2']);
  assert.equal(out.items[1].sub, '台北市南港區經貿二路131號');
  assert.equal(out.items[1].lat, 25.0556);
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
  assert.deepEqual({ ...out.sources, ms: undefined }, { google: 'ok', tdx: 'ok', tdxBike: 'ok', ms: undefined });
  assert.deepEqual(Object.keys(out.sources.ms).sort(), ['google', 'tdx', 'tdxBike']);
  // The train is one plan (TDX's copy has no walks, so it arrives first).
  assert.equal(out.plans.length, 2);
  assert.equal(out.plans[0].src, 'tdx');
  assert.equal(out.plans[1].legs[0].short, '5608');
  const again = await (await ask()).json();
  assert.equal(again.cached, true);
  assert.equal(google, 1);
  assert.equal(tdx, 2);
  // One planner alone (the app asks for Google's and TDX's apart, showing Google's at once).
  const only = async src => (await handleTransit(new Request(`https://w/transit/route?from=24.8,120.97&to=24.84,121.012&at=${NOW}&src=${src}`), env, {}, '/transit/route', { session: { s: 'S' }, fetchFn, now: NOW, cache })).json();
  const g = await only('google');
  assert.deepEqual(Object.keys(g.sources.ms), ['google']);
  assert.equal(google, 2);
  assert.equal(tdx, 2);
  const t = await only('tdx');
  assert.deepEqual(Object.keys(t.sources.ms).sort(), ['tdx', 'tdxBike']);
  assert.equal(google, 2);
  assert.equal(tdx, 4);
  const bad = await handleTransit(new Request('https://w/transit/route?from=35,139&to=24.8,120.9'), env, {}, '/transit/route', { session: { s: 'S' }, fetchFn, now: NOW, cache });
  assert.equal(bad.status, 400);
});

test('autocomplete and OpenStreetMap parsing drop what can’t be used', () => {
  assert.deepEqual(parseAutocomplete({ suggestions: [{ queryPrediction: {} }, { placePrediction: { place: 'places/XYZ12345', text: { text: '城隍廟' } } }] }), [{ id: 'XYZ12345', name: '城隍廟', sub: '', dist: null, types: [] }]);
  assert.deepEqual(parseNominatim([{ name: 'x' }]), []);
});

test('a trip’s ways of moving: Google told which, TDX’s bike plan only with bikes, cached apart', async () => {
  fresh();
  const env = { RATE_LIMIT_KV: memKv(), GOOGLE_MAPS_KEY: 'k', TDX_CLIENT_ID: 'id', TDX_CLIENT_SECRET: 's', TDX_PER_MIN: '300' };
  const bodies = [];
  const miles = [];
  const codes = [];
  const fetchFn = async (url, init) => {
    if (url.includes('token')) return json({ access_token: 'T', expires_in: 86400 });
    if (url.startsWith('https://routes.googleapis.com')) {
      bodies.push(JSON.parse(init.body));
      return json({ routes: [] });
    }
    if (url.includes('/maas/routing')) {
      miles.push(new URL(url).searchParams.get('first_mile_mode'));
      codes.push(new URL(url).searchParams.get('transit'));
      return json({ data: { routes: [] } });
    }
    assert.fail(`unexpected ${url}`);
  };
  const ask = modes => handleTransit(new Request(`https://w/transit/route?from=24.8,120.97&to=24.84,121.012&at=${NOW}${modes ? `&modes=${modes}` : ''}`), env, {}, '/transit/route', { session: { s: 'S' }, fetchFn, now: NOW, cache: memCache() });
  const out = await (await ask('tra,hsr,metro')).json();
  assert.deepEqual(bodies[0].transitPreferences.allowedTravelModes, ['TRAIN', 'SUBWAY', 'LIGHT_RAIL']);
  assert.deepEqual(miles, ['0']);
  assert.deepEqual(codes, ['3,4,6,7,8,9']);
  assert.equal(out.sources.tdxBike, undefined);
  await ask('');
  assert.equal(bodies[1].transitPreferences, undefined);
  assert.deepEqual(miles.slice(1).sort(), ['0', '3']);
  // Bikes only: no planner at all.
  const bike = await (await ask('bike')).json();
  assert.equal(bike.sources.google, 'off');
  assert.equal(bodies.length, 2);
});

test('a TDX answer that fails with a 5xx is asked once more', async () => {
  fresh();
  const env = { RATE_LIMIT_KV: memKv(), TDX_CLIENT_ID: 'id', TDX_CLIENT_SECRET: 's', TDX_PER_MIN: '300' };
  let n = 0;
  const fetchFn = async url => {
    if (url.includes('token')) return json({ access_token: 'T', expires_in: 86400 });
    n++;
    return n === 1 ? new Response('busy', { status: 503 }) : json([{ StationUID: 'A' }]);
  };
  const got = await tdxGet(env, 'basic/v2/Bike/Station/City/Hsinchu', { fetchFn, now: NOW, cache: memCache() });
  assert.equal(got.status, 200);
  assert.equal(n, 2);
});

test('place search: the near branches of a chain first, nearest first; the same chain far away left out while one is near', () => {
  const far = [{ id: 'a', name: '錢都日式涮涮鍋 桃園店', dist: 45000 }, { id: 'b', name: '錢都 中壢店', dist: 38000 }];
  const near = [{ id: 'c', name: '錢都 竹北光明店', dist: 2100 }, { id: 'd', name: '錢都 新竹店', dist: 9000 }, { id: 'e', name: '金錢豹', dist: 900 }];
  // (The name typed whole first among the near; 中壢店 gone, 錢都 being near; 涮涮鍋 another name.)
  assert.deepEqual(nearFirst(far, near, '錢都').map(i => i.id), ['c', 'd', 'e', 'a']);
  assert.deepEqual(nearFirst([{ id: 'x', name: '台北車站', dist: 70000 }], [], '台北車站').map(i => i.id), ['x']);
});

test('place search: LaLaport is LaLaport, not its cinema, its car parks or a shop in it; two branches of a chain stay two; a shop asked by name stays', async () => {
  const { folded } = await import('../transit.js');
  const at = (id, name, lat, lon, types, dist = null) => ({ id, name, lat, lon, types, dist });
  // LaLaport 台中 and what's in it or beside it; LaLaport 南港, far.
  const mall = at('m', 'Mitsui Shopping Park LaLaport 台中', 24.1385, 120.6885, ['shopping_mall', 'point_of_interest']);
  const list = [
    mall,
    at('p1', 'LaLaport台中 P1停車場', 24.1392, 120.6879, ['parking']),
    at('c', '威秀影城 台中LaLaport影城', 24.1383, 120.6888, ['movie_theater']),
    at('r', '鼎泰豐 LaLaport台中店', 24.1386, 120.6884, ['restaurant']),
    at('n', 'Mitsui Shopping Park LaLaport 南港', 25.0556, 121.6172, ['shopping_mall']),
    { id: 'p2', name: 'LaLaport 台中 東側停車場', sub: '台中市東區', dist: 1520, types: ['parking'] },
    { id: 'm', name: 'Mitsui Shopping Park LaLaport 台中', sub: '台中市東區', dist: 1400, types: ['shopping_mall'] }
  ].map(i => (i.lat != null ? { ...i, dist: Math.round(Math.hypot(i.lat - 24.15, i.lon - 120.68) * 111_000) } : i));
  list[0].dist = 1400;
  assert.deepEqual(folded(list, 'lalaport').map(i => i.id), ['m', 'n', 'm'], 'the two malls (and the mall’s own other copy); its parts gone');
  // A shop asked by its own name: the mall doesn't carry those words, nothing folds.
  assert.deepEqual(folded(list, '鼎泰豐 lalaport').map(i => i.id), list.map(i => i.id));
  // 新竹 by 新竹車站: 新竹轉運站 is a place of its own (a bus station), it stays; the station's car park and an exit fold.
  const hc = [
    at('st', '新竹車站', 24.8016, 120.9716, ['train_station', 'transit_station']),
    at('bt', '新竹轉運站', 24.8027, 120.9733, ['bus_station', 'transit_station']),
    at('pk', '新竹車站前站停車場', 24.8020, 120.9712, ['parking']),
    at('ex', '新竹車站 後站出口', 24.8008, 120.9711, ['transit_station'])
  ];
  assert.deepEqual(folded(hc, '新竹').map(i => i.id), ['st', 'bt']);
  // A chain's branches side by side (no whole place among them): both stay.
  const two = [at('a', '八方雲集 竹北成功店', 24.818, 121.015, ['restaurant']), at('b', '八方雲集 竹北光明店', 24.819, 121.016, ['restaurant'])];
  assert.deepEqual(folded(two, '八方雲集').map(i => i.id), ['a', 'b']);
  // Through the search: LaLaport 台中 once (南港, the same chain 140 km off, left out while 台中's near).
  assert.deepEqual(nearFirst([list[6], list[5]], list.slice(0, 5), 'LaLaport').map(i => i.id), ['m']);
});

test("place search, a chain typed with a typo from 成功九街 (八分雲集): every 八方雲集 near you, nearest first, none from another city while one's near; an address still there", async () => {
  fresh();
  const env = { GOOGLE_MAPS_KEY: 'k', RATE_LIMIT_KV: memKv() };
  const cache = memCache();
  let text = 0;
  const at = (id, name, lat, lon) => ({ id, displayName: { text: name }, formattedAddress: '302新竹縣竹北市', location: { latitude: lat, longitude: lon } });
  const fetchFn = async (url, opts) => {
    const body = JSON.parse(opts.body);
    if (String(url).includes('autocomplete')) {
      assert.equal(body.input, '八分雲集');
      // Autocomplete: two far branches (台北, 台中), and a road by that name.
      return json({ suggestions: [
        { placePrediction: { placeId: 'tp', structuredFormat: { mainText: { text: '八方雲集 台北南京店' }, secondaryText: { text: '台北市' } }, distanceMeters: 70_000 } },
        { placePrediction: { placeId: 'tc', structuredFormat: { mainText: { text: '八方雲集(台中公益店)' }, secondaryText: { text: '台中市' } }, distanceMeters: 90_000 } },
        { placePrediction: { placeId: 'rd', structuredFormat: { mainText: { text: '八分路' }, secondaryText: { text: '某縣' } }, distanceMeters: 120_000 } }
      ] });
    }
    if (String(url).includes('searchText')) {
      text++;
      assert.equal(body.pageSize, 20);
      assert.equal(body.locationBias.circle.radius, 10_000);
      // Text Search, near you (Google's spelling): four branches, one far.
      return json({ places: [at('b3', '八方雲集 新竹光復店', 24.7960, 120.9960), at('b1', '八方雲集(竹北成功店)', 24.8180, 121.0150), at('b2', '八方雲集 竹北光明店', 24.8300, 121.0050), at('tp', '八方雲集 台北南京店', 25.0520, 121.5440)] });
    }
    assert.fail(`unexpected ${url}`);
  };
  const ask = () => handleTransit(new Request('https://w/transit/search?q=八分雲集&lat=24.81774&lon=121.0163'), env, {}, '/transit/search', { session: { s: 'S' }, fetchFn, now: NOW, cache }).then(r => r.json());
  const out = await ask();
  assert.equal(out.by, 'google');
  assert.deepEqual(out.items.map(i => i.id), ['b1', 'b2', 'b3', 'rd'], 'near branches nearest first, the far ones gone, the road kept');
  assert.ok(out.items[0].dist < out.items[1].dist && out.items[1].dist < out.items[2].dist);
  // The same words near the same spot: Text Search's answer kept (a day).
  await ask();
  assert.equal(text, 1);
});

test("walks by Google's streets: five in one matrix call, each kept a month; with its line, one route; past the month's cap, none (the app's router then)", async () => {
  fresh();
  const env = { GOOGLE_MAPS_KEY: 'k', RATE_LIMIT_KV: memKv() };
  const cache = memCache();
  let matrix = 0;
  let route = 0;
  const fetchFn = async (url, opts) => {
    const body = JSON.parse(opts.body);
    assert.equal(body.travelMode, 'WALK');
    if (String(url).includes('computeRouteMatrix')) {
      matrix++;
      assert.match(opts.headers['X-Goog-FieldMask'], /distanceMeters/);
      // (成功九街 to 成功國中's station by its lane, 210 m; one with no way on foot.)
      return json(body.destinations.map((d, i) => (d.waypoint.location.latLng.latitude === 24.9 ? { originIndex: 0, destinationIndex: i, condition: 'ROUTE_NOT_FOUND' } : { originIndex: 0, destinationIndex: i, condition: 'ROUTE_EXISTS', distanceMeters: 210 + i, duration: `${150 + i}s` })));
    }
    if (String(url).includes('computeRoutes')) {
      route++;
      return json({ routes: [{ distanceMeters: 210, duration: '150s', polyline: { encodedPolyline: 'abc' } }] });
    }
    assert.fail(`unexpected ${url}`);
  };
  const ask = qs => handleTransit(new Request(`https://w/transit/walk?${qs}`), env, {}, '/transit/walk', { session: { s: 'S' }, fetchFn, now: NOW, cache }).then(r => r.json());
  const five = 'from=24.8177,121.0163&to=24.81872,121.01597;24.8162,121.0171;24.9,121.0;24.8129,121.0233;24.81,121.02';
  const a = await ask(five);
  assert.equal(a.src, 'google');
  assert.deepEqual(a.walks.map(w => w && w.dist), [210, 211, null, 213, 214]);
  assert.equal(a.walks[0].dur, 150);
  assert.equal(matrix, 1, 'one call for all five');
  // Again: from the month's copy, only the one with no way asked again.
  const b = await ask(five);
  assert.deepEqual(b.walks.map(w => w && w.dist), [210, 211, null, 213, 214]);
  assert.equal(matrix, 2);
  assert.equal((await usage(env, NOW)).matrix, 6, 'an element each');
  // One walk with its line.
  const c = await ask('from=24.8177,121.0163&to=24.81872,121.01597&line=1');
  assert.deepEqual(c.walks[0], { dist: 210, dur: 150, poly: 'abc' });
  await ask('from=24.8177,121.0163&to=24.81872,121.01597&line=1');
  assert.equal(route, 1);
  // Past the month's cap: nothing asked.
  fresh();
  const full = { ...env, RATE_LIMIT_KV: memKv() };
  await full.RATE_LIMIT_KV.put(`transit:use:${billingMonth(NOW)}`, JSON.stringify({ matrix: CAPS.matrix }));
  const d = await handleTransit(new Request('https://w/transit/walk?from=24.8177,121.0163&to=24.82,121.02'), full, {}, '/transit/walk', { session: { s: 'S' }, fetchFn, now: NOW, cache: memCache() }).then(r => r.json());
  assert.deepEqual(d, { walks: [null], src: 'cap' });
  assert.equal(matrix, 2);
  // Outside Taiwan, or none: refused.
  assert.equal((await handleTransit(new Request('https://w/transit/walk?from=35,139&to=24.8,120.9'), env, {}, '/transit/walk', { session: { s: 'S' }, fetchFn, now: NOW, cache })).status, 400);
});

test("a sample spends a real ask: none without a session or past the limit (a stranger can't use up the month's Google routes or TDX's points)", async () => {
  fresh();
  const env = { GOOGLE_MAPS_KEY: 'GK', TDX_CLIENT_ID: 'id', TDX_CLIENT_SECRET: 's', RATE_LIMIT_KV: memKv() };
  let asked = 0;
  const fetchFn = async url => (url.includes('token') ? json({ access_token: 'T', expires_in: 86400 }) : (asked++, json({ routes: [], data: { routes: [] } })));
  for (const [session, limited] of [[null, () => false], [{ s: 'u' }, () => true]])
    for (const q of ['sample=google-route&fresh=1', 'sample=maas&fresh=1', 'sample=google-route&transit=7']) {
      const res = await handleTransit(new Request(`https://w/transit/status?${q}`), env, {}, '/transit/status', { session, limited, fetchFn, cache: memCache(), now: NOW });
      assert.ok(res.status === 401 || res.status === 429);
    }
  assert.equal(asked, 0);
  assert.equal((await usage(env, NOW)).routes || 0, 0);
  // The usage page itself stays open.
  assert.equal((await handleTransit(new Request('https://w/transit/status'), env, {}, '/transit/status', { now: NOW })).status, 200);
});

test('anything a transit ask throws is its failure in JSON with the CORS headers, never the Worker crashing: a time no Date holds, a place Google drops or answers in HTML', async () => {
  fresh();
  const env = { GOOGLE_MAPS_KEY: 'GK', TDX_CLIENT_ID: 'id', TDX_CLIENT_SECRET: 's', RATE_LIMIT_KV: memKv() };
  const headers = { 'Access-Control-Allow-Origin': 'https://jaypengx.github.io' };
  const ok = async url => (url.includes('token') ? json({ access_token: 'T', expires_in: 86400 }) : json({}));
  const route = await handleTransit(new Request('https://w/transit/route?from=24.8,120.97&to=25.04,121.5&at=1e17'), env, headers, '/transit/route', { session: { s: 'u' }, fetchFn: ok, cache: memCache(), now: NOW });
  assert.equal(route.status, 200);
  assert.ok((await route.json()).at <= NOW + 61 * 86_400_000);
  for (const fetchFn of [async () => { throw new TypeError('Network connection lost'); }, async () => new Response('<html>oops</html>', { status: 200 })]) {
    const res = await handleTransit(new Request('https://w/transit/place?id=ChIJabcdefghijk'), env, headers, '/transit/place', { session: { s: 'u' }, fetchFn, cache: memCache(), now: NOW });
    assert.equal(res.status, 502);
    assert.equal(res.headers.get('Access-Control-Allow-Origin'), headers['Access-Control-Allow-Origin']);
    assert.equal((await res.json()).code, 'PLACE_FAILED');
  }
});

test("a route answer with a planner that failed isn't kept: the YouBike plans are back on the next ask, not missing for 5 minutes", async () => {
  fresh();
  const env = { GOOGLE_MAPS_KEY: 'GK', TDX_CLIENT_ID: 'id', TDX_CLIENT_SECRET: 's', RATE_LIMIT_KV: memKv() };
  const cache = memCache();
  let bikeUp = false;
  const plan = name => ({ data: { routes: [{ sections: [{ type: 'transit', transport: { mode: 'bus', name }, departure: { time: '2026-10-03T09:02:00', place: { name: 'C' } }, arrival: { time: '2026-10-03T09:10:00', place: { name: 'D' } } }] }] } });
  const fetchFn = async url => {
    if (url.includes('token')) return json({ access_token: 'T', expires_in: 86400 });
    if (url.includes('first_mile_mode=3')) return bikeUp ? json(plan('bike')) : json({}, 429);
    return json(plan('walk'));
  };
  const ask = async () => (await handleTransit(new Request('https://w/transit/route?from=24.8,120.97&to=25.04,121.5&src=tdx'), env, {}, '/transit/route', { session: { s: 'u' }, fetchFn, cache, now: NOW })).json();
  assert.equal((await ask()).sources.tdxBike, 'http 429');
  bikeUp = true;
  const again = await ask();
  assert.ok(!again.cached);
  assert.deepEqual(again.plans.map(p => p.legs[0].name).sort(), ['bike', 'walk']);
  assert.ok((await ask()).cached, 'a whole answer is kept');
});

test("TDX's month is Taiwan's: the first hours of a Taiwan month don't count last month's points (the guard stayed at 30x till 16:00 on the 1st)", () => {
  const used = {};
  for (let d = 1; d <= 31; d++) used[`tdx:a:2026-10-${String(d).padStart(2, '0')}`] = 1239;
  used.tdx = Object.values(used).reduce((a, b) => a + b, 0);
  const now = Date.parse('2026-10-31T17:00:00Z'); // 2026-11-01 01:00 in Taiwan, still October's meter
  assert.equal(tdxPoints(used, now).month, 0);
  assert.equal(tdxGuard(tdxPoints(used, now), now).why, '');
  assert.ok(tdxPoints(used, Date.parse('2026-10-31T03:00:00Z')).month > 190, 'October itself still counts');
});

test('the TDX allowlist takes no "." or ".." (read a level up, past the rule)', () => {
  for (const p of ['basic/v2/Bus/Route/InterCity/..', 'basic/v2/Bus/Schedule/City/Taipei/%2E%2E', 'basic/v2/Bus/Route/City/./Hsinchu']) assert.equal(tdxRequest(p), null, p);
  assert.ok(tdxRequest('basic/v2/Bus/Route/City/Hsinchu'));
});

test("TDX's plans: a metro exit's doubled station said once (台北車站 M1, not 台北車站台北車站 M1); a walk of no length is a wait, no step", () => {
  // (A wait starts and ends at one point: TDX's 0 m, 436 s "walk" at 桃園.)
  const sec = (type, mode, from, to, dep, arr, length) => ({ type, transport: { mode }, departure: { time: dep, place: { name: from, location: { lat: 25.04, lng: 121.51 } } }, arrival: { time: arr, place: { name: to, location: length ? { lat: 25.05, lng: 121.52 } : { lat: 25.04, lng: 121.51 } } }, travelSummary: { length, duration: (Date.parse(arr) - Date.parse(dep)) / 1000 } });
  const [p] = parseTdxRoutes({ data: { routes: [{ sections: [sec('pedestrian', 'pedestrian', '起點', '台北車站台北車站 M1', '2026-10-18T09:00:00+08:00', '2026-10-18T09:05:00+08:00', 300), sec('pedestrian', 'pedestrian', '台北車站台北車站 M1', '台北車站台北車站 M1', '2026-10-18T09:05:00+08:00', '2026-10-18T09:12:00+08:00', 0), sec('transit', 'subway', '台北車站', '板橋板橋站 出口3', '2026-10-18T09:12:00+08:00', '2026-10-18T09:25:00+08:00', 7000)] }] } });
  assert.deepEqual(p.legs.map(l => l.to.name), ['台北車站 M1', '板橋站 出口3']);
  assert.ok(p.legs.every(l => !(l.mode === 'walk' && l.dist < 5)));
  for (const n of ['高高屏', '新竹', '台北車站', '屏東屏東']) assert.equal(onceName(n), n === '屏東屏東' ? '屏東' : n);
});
