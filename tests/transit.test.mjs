// Orbit Transit (transit.js): the TDX allowlist and shared cache, the
// monthly caps on Google's billed calls, and the route plans made one shape.
// No network: every upstream is answered here.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  tdxRequest, tdxGet, warmBikes, SLOW_MS, tdxAccess, resetTdxToken, resetPace, resetTurns, resetMeter, spend, usage, flushUse, billingMonth, CAPS,
  parseGoogleRoutes, parseAutocomplete, nearFirst, parseNominatim, parsePlace, parseTdxRoutes, planSig, googleRouteBody, handleTransit, GOOGLE_ROUTE_FIELDS, tdxPoints, tdxGuard, onceName, resetEta, tdxTrim, tdxUse, DEV_SHARE, ETA_ROWS, wholeAt, together, DEV_TDX_DAY, DEV_OLDEST
} from '../transit.js';

const NOW = Date.parse('2026-10-03T01:00:00Z');
const memKv = () => {
  const store = new Map();
  const meta = new Map();
  return {
    store,
    get: async k => store.get(k) ?? null,
    getWithMetadata: async k => ({ value: store.get(k) ?? null, metadata: meta.get(k) ?? null }),
    put: async (k, v, o) => void (store.set(k, v), meta.set(k, o?.metadata ?? null))
  };
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
const memCacheCopy = c => {
  const store = new Map(c.store);
  return { store, match: async req => (store.has(req.url) ? new Response(store.get(req.url).body, { headers: store.get(req.url).headers }) : undefined), put: async (req, res) => void store.set(req.url, { body: await res.text(), headers: Object.fromEntries(res.headers) }) };
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
  const a = await tdxGet(env, path, { fetchFn, cache, now: NOW, free: false });
  assert.equal(a.state, 'miss');
  assert.match(log[0], /^https:\/\/tdx\.transportdata\.tw\/api\/basic\/v2\/Bike\/Availability\/City\/Hsinchu\?\$format=JSON$/);
  const b = await tdxGet(env, path, { fetchFn, cache, now: NOW + 10_000, free: false });
  assert.equal(b.state, 'hit');
  assert.equal(log.length, 1);
  // Past fresh (50 s), inside stale: the old copy at once, a refresh behind.
  const waits = [];
  const c = await tdxGet(env, path, { fetchFn, cache, now: NOW + 70_000, ctx: { waitUntil: p => waits.push(p) }, free: false });
  assert.equal(c.state, 'stale');
  assert.equal(JSON.parse(c.body)[0].AvailableRentBikes, 1);
  await Promise.all(waits);
  assert.equal(log.length, 2);
  // Over this Worker's own pace: the copy it has, however old.
  const d = await tdxGet(env, 'basic/v2/Bike/Station/City/Hsinchu', { fetchFn, cache, now: NOW + 70_500, free: false });
  assert.equal(d.status, 429);
  assert.equal(JSON.parse(d.body).code, 'TDX_BUSY');
  const e = await tdxGet(env, path, { fetchFn, cache, now: NOW + 70_000 + 5 * 60_000, free: false });
  assert.equal(e.status, 200);
});

test('YouBike is kept warm in KV: another colo answers at once from it while TDX hangs, and the cron refreshes the cities asked lately', async () => {
  fresh();
  const env = { TDX_CLIENT_ID: 'id', TDX_CLIENT_SECRET: 'secret', RATE_LIMIT_KV: memKv(), TDX_PER_MIN: '240' };
  let n = 0;
  let hang = false;
  const fetchFn = async url => {
    if (url.includes('token')) return json({ access_token: 'T', expires_in: 86400 });
    n++;
    if (hang) await new Promise(r => setTimeout(r, SLOW_MS + 1500));
    return json([{ StationUID: 'KHH1', AvailableRentBikes: n }]);
  };
  const path = 'basic/v2/Bike/Availability/City/Kaohsiung';
  const waits = [];
  const ctx = { waitUntil: p => waits.push(p) };
  await tdxGet(env, path, { fetchFn, cache: memCache(), now: NOW, ctx, free: false });
  for (let i = 0; i < 3; i++) await Promise.all(waits);
  // Another colo (an empty cache), TDX hanging: KV's copy at once.
  hang = true;
  const t0 = Date.now();
  const other = await tdxGet(env, path, { fetchFn, cache: memCache(), now: NOW + 20_000, ctx, free: false });
  assert.ok(Date.now() - t0 < 500, 'not waiting on TDX');
  assert.equal(other.state, 'hit');
  assert.equal(JSON.parse(other.body)[0].AvailableRentBikes, 1);
  // Two minutes on, the cron: Kaohsiung was asked, so its counts are asked again and kept.
  hang = false;
  for (let i = 0; i < 3; i++) await Promise.all(waits);
  const warmed = await warmBikes(env, { fetchFn, cache: memCache(), now: NOW + 2 * 60_000, free: false });
  assert.deepEqual(warmed, { 'Availability/City/Kaohsiung': 'miss' });
  hang = true;
  const third = await tdxGet(env, path, { fetchFn, cache: memCache(), now: NOW + 2 * 60_000 + 5000, ctx, free: false });
  assert.equal(third.state, 'hit');
  assert.ok(JSON.parse(third.body)[0].AvailableRentBikes > 1, 'the cron’s copy');
  // Not asked for 10 minutes: no longer kept warm (half an hour before 2026-11-06: 15 reads no one saw).
  assert.deepEqual(await warmBikes(env, { fetchFn, cache: memCache(), now: NOW + 11 * 60_000, free: false }), {});
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
  await tdxGet(env, path, { fetchFn, cache, now: NOW, free: false });
  hang = true;
  const waits = [];
  const t0 = Date.now();
  // 3 minutes on: past its stale minute, still kept (a live copy 10 minutes).
  const old = await tdxGet(env, path, { fetchFn, cache, now: NOW + 3 * 60_000, ctx: { waitUntil: p => waits.push(p) }, free: false });
  assert.ok(Date.now() - t0 < SLOW_MS + 800, 'answered after SLOW_MS, not when TDX did');
  assert.equal(old.state, 'stale');
  assert.equal(old.age, 3 * 60_000);
  assert.equal(JSON.parse(old.body)[0].EstimateTime, 60);
  // (The refresh, then the cache write it hands to waitUntil.)
  for (let i = 0; i < 3; i++) await Promise.all(waits);
  const next = await tdxGet(env, path, { fetchFn, cache, now: NOW + 3 * 60_000 + 1000, free: false });
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
  const got = await Promise.all(cities.map(c => tdxGet(env, `basic/v2/Bike/Station/City/${c}`, { fetchFn, cache: memCache(), now: NOW, free: false })));
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
  // A dev page: NLSC's, unless it asks for Google's (the preview's screenshots).
  resetMeter();
  await kv.put(`transit:use:${billingMonth(NOW)}`, JSON.stringify({ maps: 0 }));
  res = await handleTransit(req, env, {}, '/transit/config', { session: { s: 'dev', dev: true }, now: NOW, cache: memCache() });
  assert.deepEqual((await res.json()).map, { provider: 'nlsc' });
  res = await handleTransit(new Request('https://w/transit/config?map=google'), env, {}, '/transit/config', { session: { s: 'dev', dev: true }, now: NOW, cache: memCache() });
  assert.deepEqual((await res.json()).map, { provider: 'google', key: 'browser-key' });
  // No session: nothing.
  res = await handleTransit(req, env, {}, '/transit/config', { session: null, now: NOW });
  assert.equal(res.status, 401);
  // The status page names no key.
  res = await handleTransit(new Request('https://w/transit/status'), env, {}, '/transit/status', { now: NOW });
  const status = await res.json();
  assert.equal(status.keys.mapsBrowser, true);
  assert.ok(!JSON.stringify(status).includes('browser-key'));
});

test('showcase map: Google’s from the showcase’s address within its share, NLSC otherwise', async () => {
  fresh();
  const kv = memKv();
  const env = { RATE_LIMIT_KV: kv, GOOGLE_MAPS_BROWSER_KEY: 'browser-key' };
  const ask = origin => handleTransit(new Request('https://w/transit/showcase-map', { headers: origin ? { Origin: origin } : {} }), env, {}, '/transit/showcase-map', { now: NOW });
  assert.deepEqual((await (await ask('https://jaypengx.com')).json()).map, { provider: 'google', key: 'browser-key' });
  assert.deepEqual((await (await ask('https://elsewhere.example')).json()).map, { provider: 'nlsc' });
  assert.deepEqual((await (await ask('')).json()).map, { provider: 'nlsc' });
  resetMeter();
  await kv.put(`transit:use:${billingMonth(NOW)}`, JSON.stringify({ showcaseMaps: CAPS.showcaseMaps }));
  assert.deepEqual((await (await ask('https://jaypengx.com')).json()).map, { provider: 'nlsc' });
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
  const got = await tdxGet(env, 'basic/v2/Bike/Station/City/Hsinchu', { fetchFn, now: NOW, cache: memCache(), free: false });
  assert.equal(got.status, 200);
  assert.equal(n, 2);
});

test('place search: the near branches of a chain first, nearest first; the same chain far away left out while one is near', () => {
  const far = [{ id: 'a', name: '錢都日式涮涮鍋 桃園店', dist: 45000 }, { id: 'b', name: '錢都 中壢店', dist: 38000 }];
  const near = [{ id: 'c', name: '錢都 竹北光明店', dist: 2100 }, { id: 'd', name: '錢都 新竹店', dist: 9000 }, { id: 'e', name: '金錢豹', dist: 900 }];
  // (The name typed whole first among the near; 中壢店 gone, 錢都 being near; 涮涮鍋 another name.)
  assert.deepEqual(nearFirst(far, near, '錢都').map(i => i.id), ['c', 'd', 'e', 'a']);
  assert.deepEqual(nearFirst([{ id: 'x', name: '台北車站', dist: 70000 }], [], '台北車站').map(i => i.id), ['x']);
  // The place named exactly what was typed first, though a part of it (a class, a hall) is a few metres nearer.
  assert.deepEqual(nearFirst([], [{ id: 'k', name: '新竹高中214班', dist: 1390 }, { id: 's', name: '新竹高中', dist: 1430 }, { id: 'g', name: '新竹高中劍道館', dist: 1500 }], '新竹高中').map(i => i.id), ['s', 'k', 'g']);
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

// Jay 2026-11-07: Google's matrix answered 403 while Compute Routes answered;
// every station's walk fell to OpenStreetMap's (成功國中 → 成功九街 460 m round
// the school, Google's 267 by the lane) and the bike went back at the wrong station.
test("the matrix refused: each walk by Compute Routes instead, counted on its share, never left to the app's router", async () => {
  fresh();
  const env = { GOOGLE_MAPS_KEY: 'k', RATE_LIMIT_KV: memKv() };
  let routes = 0;
  const fetchFn = async (url, opts) => {
    if (String(url).includes('computeRouteMatrix')) return new Response('{}', { status: 403 });
    routes++;
    const lat = JSON.parse(opts.body).destination.location.latLng.latitude;
    assert.doesNotMatch(opts.headers['X-Goog-FieldMask'], /polyline/);
    return lat === 24.9 ? json({}) : json({ routes: [{ distanceMeters: lat === 24.81872 ? 267 : 300, duration: '200s' }] });
  };
  const r = await handleTransit(new Request('https://w/transit/walk?from=24.8176,121.0165&to=24.81872,121.01597;24.81614,121.0171;24.9,121.0'), env, {}, '/transit/walk', { session: { s: 'S' }, fetchFn, now: NOW, cache: memCache() }).then(x => x.json());
  assert.equal(r.src, 'google-routes');
  assert.deepEqual(r.walks.map(w => w && w.dist), [267, 300, null]);
  assert.equal(routes, 3);
  const used = await usage(env, NOW);
  assert.equal(used.routes, 3);
});

// Google's Compute Routes stops at 100 asks a day on this project (2026-11-10:
// 429 RESOURCE_EXHAUSTED by 10:50 Taiwan time, back at 16:00): from the first
// 429 nothing more is asked or counted till its window turns, neither a trip
// nor a walk; the matrix's per-walk stand-in never spends the trips' day.
test("Google's day used up (429): neither a trip nor a walk asks it again till its window turns", async () => {
  fresh();
  const env = { GOOGLE_MAPS_KEY: 'k', RATE_LIMIT_KV: memKv() };
  const start = Math.floor((NOW - 8 * 3_600_000) / 86_400_000) * 86_400_000 + 8 * 3_600_000; // midnight Pacific (UTC−8), as Google's window
  let google = 0;
  const quota = { error: { code: 429, status: 'RESOURCE_EXHAUSTED', details: [{ reason: 'RATE_LIMIT_EXCEEDED', metadata: { window_start_time: String(start / 1000), quota_unit: '1/d/{project}', quota_limit: 'ComputeRoutesRequestsPerDay', quota_limit_value: '100' } }] } };
  const fetchFn = async url => {
    if (String(url).includes('googleapis')) {
      google++;
      return String(url).includes('computeRouteMatrix') ? new Response('{}', { status: 403 }) : new Response(JSON.stringify(quota), { status: 429 });
    }
    return new Response('{}', { status: 503 });
  };
  const trip = at => handleTransit(new Request('https://w/transit/route?from=24.8,120.97&to=24.84,121.012&src=google'), env, {}, '/transit/route', { session: { s: 'S' }, fetchFn, now: at, cache: memCache() }).then(r => r.json());
  const walk = (at, qs) => handleTransit(new Request(`https://w/transit/walk?from=24.8177,121.0163&${qs}`), env, {}, '/transit/walk', { session: { s: 'S' }, fetchFn, now: at, cache: memCache() }).then(r => r.json());
  assert.equal((await trip(NOW)).sources.google, 'http 429');
  assert.equal(google, 1);
  const used = (await usage(env, NOW)).routes;
  assert.equal((await trip(NOW + 60_000)).sources.google, 'out', 'not asked again');
  assert.deepEqual(await walk(NOW + 60_000, 'to=24.81872,121.01597&line=1'), { walks: [null], src: 'out' });
  // The matrix (403) asked, its per-walk stand-in on Compute Routes not.
  const m = await walk(NOW + 60_000, 'to=24.81872,121.01597;24.8162,121.0171');
  assert.equal(m.src, 'http 403');
  assert.equal(google, 2, 'only the matrix');
  assert.equal((await usage(env, NOW)).routes, used, 'nothing counted while out');
  // Its window turned: asked again.
  assert.equal((await trip(start + 86_400_000 + 1000)).sources.google, 'http 429');
  assert.equal(google, 3);
});

// Nothing asks Google's traffic matrix (a bus's drive to its stops): the
// address had no app calling it, only a test page, and its share was counted
// as people's on the admin panel's 容量 (Jay 2026-11-06: "3 people"). Gone.
test('no Google traffic matrix: /transit/drive is no address, nothing spent', async () => {
  fresh();
  const env = { GOOGLE_MAPS_KEY: 'k', RATE_LIMIT_KV: memKv() };
  let calls = 0;
  const r = await handleTransit(new Request('https://w/transit/drive?from=24.8177,121.0163&to=24.82,121.02'), env, {}, '/transit/drive', { session: { s: 'S' }, fetchFn: async () => (calls++, json([])), now: NOW, cache: memCache() });
  assert.equal(r.status, 404);
  assert.equal(calls, 0);
  assert.equal('drive' in CAPS, false);
});

test("our tools' spends (the dev door) and the showcase's counted apart for the admin's people count; our tools stop at half a free month, people go on to the cap", async () => {
  fresh();
  const env = { GOOGLE_MAPS_KEY: 'k', RATE_LIMIT_KV: memKv() };
  const fetchFn = async (url, opts) => json(JSON.parse(opts.body).destinations.map((d, i) => ({ originIndex: 0, destinationIndex: i, condition: 'ROUTE_EXISTS', distanceMeters: 800, duration: '600s' })));
  const ask = (to, session) => handleTransit(new Request(`https://w/transit/walk?from=24.8177,121.0163&to=${to}`), env, {}, '/transit/walk', { session, fetchFn, now: NOW, cache: memCache() }).then(r => r.json());
  assert.equal((await ask('24.82,121.02;24.83,121.03', { s: 'dev', dev: true })).src, 'google');
  assert.equal((await ask('24.84,121.04', { s: 'S' })).src, 'google');
  const used = await usage(env, NOW);
  assert.equal(used.matrix, 3, 'everyone against the cap');
  assert.equal(used['dev:matrix'], 2, "our tools' apart");
  assert.equal(used['dev:matrix'] + (used['show:matrix'] || 0), 2);
  // Half the month used: our tools get the fallback; a person still Google's.
  fresh();
  await env.RATE_LIMIT_KV.put(`transit:use:${billingMonth(NOW)}`, JSON.stringify({ matrix: CAPS.matrix * DEV_SHARE }));
  assert.equal((await ask('24.85,121.05', { s: 'dev', dev: true })).src, 'cap');
  assert.equal((await ask('24.86,121.06', { s: 'S' })).src, 'google');
  // TDX's points: ours apart too, read by tdxUse with the prefix (the same keys without it).
  fresh();
  const kv = memKv();
  const tdxEnv = { TDX_CLIENT_ID: 'id', TDX_CLIENT_SECRET: 's', RATE_LIMIT_KV: kv };
  const tdxFetch = async url => (url.includes('token') ? json({ access_token: 'T', expires_in: 86400 }) : json([]));
  await tdxGet(tdxEnv, 'basic/v2/Bus/Route/City/Hsinchu', { fetchFn: tdxFetch, cache: memCache(), now: NOW, by: 'dev' });
  await tdxGet(tdxEnv, 'basic/v2/Bus/Route/City/Taipei', { fetchFn: tdxFetch, cache: memCache(), now: NOW });
  const all = await tdxUse(tdxEnv, NOW);
  const ours = await tdxUse(tdxEnv, NOW, 'dev:');
  const day = Object.keys(all)[0].slice(-10);
  // (Each call and the bytes it brought: `[]`, 2 bytes each.)
  assert.deepEqual(all, { [`tdx:b:${day}`]: 2, [`tdx:vb:${day}`]: 4 });
  assert.deepEqual(ours, { [`tdx:b:${day}`]: 1, [`tdx:vb:${day}`]: 2 });
  assert.equal(tdxPoints(ours, NOW).month, 1 / 1500 + 2 / (150 * 2 ** 20));
});

test("our tools (the dev door) yield TDX's month to people: a copy up to 10 minutes old as it is, no YouBike kept warm for them, and past half a point a Taiwan day copies only", async () => {
  fresh();
  const kv = memKv();
  const env = { TDX_CLIENT_ID: 'id', TDX_CLIENT_SECRET: 's', RATE_LIMIT_KV: kv, TDX_PER_MIN: '100' };
  const cache = memCache();
  let calls = 0;
  const fetchFn = async url => (url.includes('token') ? json({ access_token: 'T', expires_in: 86400 }) : (calls++, json([{ n: calls }])));
  const get = (path, now, by = 'dev') => tdxGet(env, path, { fetchFn, cache, now, by });
  const bikes = 'basic/v2/Bike/Availability/City/Keelung';
  assert.equal(DEV_OLDEST, 10 * 60_000);
  assert.equal((await get(bikes, NOW)).state, 'miss');
  // Nine minutes on: ours the copy as it is (a person's would read TDX); eleven: TDX.
  assert.equal((await get(bikes, NOW + 9 * 60_000)).state, 'hit');
  assert.equal(calls, 1);
  assert.equal((await get(bikes, NOW + 11 * 60_000)).state, 'miss');
  assert.equal(calls, 2);
  await new Promise(r => setTimeout(r, 0));
  assert.equal(kv.store.has('tdx:warm:active'), false, 'never kept warm for our tools');
  // Past half a point today (750 basic calls): ours get copies only, however old; none, DEV_TDX_CAP. People's go on.
  fresh();
  await kv.put(`transit:use:${billingMonth(NOW)}`, JSON.stringify({ 'dev:tdx:b:2026-10-03': DEV_TDX_DAY * 1500 }));
  const old = await get(bikes, NOW + 60 * 60_000);
  assert.deepEqual([old.state, JSON.parse(old.body)[0].n, calls], ['stale', 2, 2]);
  const none = await get('basic/v2/Bike/Availability/City/Yilan', NOW + 60 * 60_000);
  assert.deepEqual([none.status, JSON.parse(none.body).code, calls], [429, 'DEV_TDX_CAP', 2]);
  assert.equal((await get('basic/v2/Bike/Availability/City/Yilan', NOW + 60 * 60_000, '')).state, 'miss');
  assert.equal(calls, 3);
  // (A person's ask keeps their city warm, as before.)
  await get(bikes, NOW + 61 * 60_000, '');
  await new Promise(r => setTimeout(r, 0));
  assert.ok(JSON.parse(kv.store.get('tdx:warm:active') || '{}')[bikes]);
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
  assert.equal(tdxPoints(used, now, {}).month, 0);
  assert.equal(tdxGuard(tdxPoints(used, now, {}), now).why, '');
  assert.ok(tdxPoints(used, Date.parse('2026-10-31T03:00:00Z')).month > 190, 'October itself still counts');
});

test('the TDX allowlist takes no "." or ".." (read a level up, past the rule)', () => {
  for (const p of ['basic/v2/Bus/Route/InterCity/..', 'basic/v2/Bus/Schedule/City/Taipei/%2E%2E', 'basic/v2/Bus/Route/City/./Hsinchu']) assert.equal(tdxRequest(p), null, p);
  assert.ok(tdxRequest('basic/v2/Bus/Route/City/Hsinchu'));
  // (A plan's buses' places, several routes in one ask.)
  for (const scope of ['City/HsinchuCounty', 'InterCity']) assert.ok(tdxRequest(`basic/v2/Bus/RealTimeByFrequency/${scope}?$filter=RouteUID eq 'HSQ0747' or RouteUID eq 'HSQ0748'&$select=RouteUID,PlateNumb,Direction,BusPosition,GPSTime`), scope);
});

test("TDX's plans: a metro exit's doubled station said once (台北車站 M1, not 台北車站台北車站 M1); a walk of no length is a wait, no step", () => {
  // (A wait starts and ends at one point: TDX's 0 m, 436 s "walk" at 桃園.)
  const sec = (type, mode, from, to, dep, arr, length) => ({ type, transport: { mode }, departure: { time: dep, place: { name: from, location: { lat: 25.04, lng: 121.51 } } }, arrival: { time: arr, place: { name: to, location: length ? { lat: 25.05, lng: 121.52 } : { lat: 25.04, lng: 121.51 } } }, travelSummary: { length, duration: (Date.parse(arr) - Date.parse(dep)) / 1000 } });
  const [p] = parseTdxRoutes({ data: { routes: [{ sections: [sec('pedestrian', 'pedestrian', '起點', '台北車站台北車站 M1', '2026-10-18T09:00:00+08:00', '2026-10-18T09:05:00+08:00', 300), sec('pedestrian', 'pedestrian', '台北車站台北車站 M1', '台北車站台北車站 M1', '2026-10-18T09:05:00+08:00', '2026-10-18T09:12:00+08:00', 0), sec('transit', 'subway', '台北車站', '板橋板橋站 出口3', '2026-10-18T09:12:00+08:00', '2026-10-18T09:25:00+08:00', 7000)] }] } });
  assert.deepEqual(p.legs.map(l => l.to.name), ['台北車站 M1', '板橋站 出口3']);
  assert.ok(p.legs.every(l => !(l.mode === 'walk' && l.dist < 5)));
  for (const n of ['高高屏', '新竹', '台北車站', '屏東屏東']) assert.equal(onceName(n), n === '屏東屏東' ? '屏東' : n);
});

test("buses due: a city's stops (or routes) asked alone, a big one never whole however busy; which routes run from the city's buses' places, kept 10 minutes at the edge; a path TDX refuses is not asked again", async () => {
  fresh();
  resetEta();
  const index = { cities: { Taipei: { routes: 416 }, InterCity: { routes: 485 } } };
  const env = { TDX_CLIENT_ID: 'id', TDX_CLIENT_SECRET: 'secret', RATE_LIMIT_KV: memKv(), TDX_PER_MIN: '100', DATA: { get: async k => (k === 'index.json' ? { json: async () => index } : null) } };
  const cache = memCache();
  const log = [];
  const all = [
    { StopUID: 'TPE1', RouteUID: 'TPE10', EstimateTime: 60 },
    { StopUID: 'TPE1', RouteUID: 'TPE11', EstimateTime: 300 },
    { StopUID: 'TPE2', RouteUID: 'TPE10', EstimateTime: 120 },
    { StopUID: 'TPE3', RouteUID: 'TPE12', StopStatus: 1 }
  ];
  const buses = [{ RouteUID: 'TPE10', PlateNumb: 'A' }, { RouteUID: 'TPE10', PlateNumb: 'B' }, { RouteUID: 'TPE11', PlateNumb: 'C' }];
  // (TDX's filter: the rows of the stops or routes it names.)
  const fetchFn = async url => {
    if (url.includes('token')) return json({ access_token: 'T', expires_in: 86400 });
    log.push(url);
    if (url.includes('S2STravelTime')) return new Response('{"Message":"RailSystem: \'TRTCMG\' is not accepted"}', { status: 400 });
    if (url.includes('RealTimeByFrequency')) return json(buses);
    const named = [...decodeURIComponent(url).matchAll(/(StopUID|RouteUID) eq '([^']+)'/g)];
    return json(named.length ? all.filter(r => named.some(([, f, v]) => r[f] === v)) : all);
  };
  const ask = (qs, now = NOW) => handleTransit(new Request(`https://w/transit/eta?${qs}`), env, {}, '/transit/eta', { session: { s: 'S' }, fetchFn, now, cache, free: false });
  const runningAt = (city, now) => handleTransit(new Request(`https://w/transit/running?city=${city}`), env, {}, '/transit/running', { session: { s: 'S' }, fetchFn, now, cache, free: false }).then(r => r.json());
  const a = await (await ask('city=Taipei&stops=TPE1,TPE3')).json();
  assert.deepEqual(a.map(r => r.RouteUID), ['TPE10', 'TPE11', 'TPE12']);
  assert.equal(log.length, 1, 'a quiet city: these stops alone, not the whole city');
  assert.match(decodeURIComponent(log[0]), /City\/Taipei\?\$filter=StopUID eq 'TPE1' or StopUID eq 'TPE3'&\$select=/);
  // Busy here (twenty stop lists in twenty seconds): still each its own read,
  // 台北's whole list (10 MB, a point every 150 MB) costing more than them.
  for (let i = 1; i < 20; i++) await ask(`city=Taipei&stops=TPE${i}`, NOW + i * 1000);
  assert.ok(!log.some(u => /\$top=60000/.test(decodeURIComponent(u))), 'never the whole city');
  assert.equal(wholeAt('Taipei'), Infinity);
  // Which routes have buses on the road: the city's buses' places (A1), the city's routes from the packs' index.
  const n = log.length;
  const run = await runningAt('Taipei', NOW + 20_500);
  assert.deepEqual(run.routes, { TPE10: 2, TPE11: 1 });
  assert.equal(run.total, 416);
  assert.equal(log.length, n + 1);
  assert.match(decodeURIComponent(log.at(-1)), /RealTimeByFrequency\/City\/Taipei\?\$select=RouteUID,/);
  // The running list from this colo's cache in another isolate (none of its own): no TDX call.
  resetEta();
  assert.deepEqual((await runningAt('Taipei', NOW + 30_000)).routes, run.routes);
  // Nine minutes on, still that one; past ten, read again.
  resetEta();
  await runningAt('Taipei', NOW + 20_500 + 9 * 60_000);
  assert.equal(log.length, n + 1, 'kept 10 minutes');
  resetEta();
  await runningAt('Taipei', NOW + 20_500 + 11 * 60_000);
  assert.equal(log.length, n + 2);
  // 公路客運's: its buses' places, all Taiwan (725 KB a read, where every stop's estimates were 14.7 MB).
  const inter = await runningAt('InterCity', NOW + 30_000);
  assert.equal(inter.total, 485);
  assert.match(decodeURIComponent(log.at(-1)), /RealTimeByFrequency\/InterCity\?\$select=RouteUID,/);
  assert.ok(!log.some(u => /EstimatedTimeOfArrival\/InterCity\?\$select/.test(decodeURIComponent(u))));
  assert.equal((await ask('city=Taipei&stops=nope')).status, 400);
  // 公路客運 (all Taiwan, too big to keep whole): its stops' own ask.
  const m = log.length;
  const many = Array.from({ length: 50 }, (_, i) => `THB${100 + i}`);
  await ask(`city=InterCity&stops=${many.join(',')}`);
  const asked = log.slice(m).map(decodeURIComponent);
  assert.equal(asked.length, 2, '40 stops a call');
  assert.ok(asked.every(u => /InterCity\?\$filter=StopUID eq 'THB\d+'( or StopUID eq 'THB\d+')*&\$select=/.test(u)));
  await ask('city=InterCity&routes=THB5700,THB5900');
  assert.match(decodeURIComponent(log.at(-1)), /InterCity\?\$filter=RouteUID eq 'THB5700' or RouteUID eq 'THB5900'&\$select=/);
  await ask('city=InterCity&route=THB5608');
  assert.match(decodeURIComponent(log.at(-1)), /InterCity\?\$filter=RouteUID eq 'THB5608'&\$select=/, 'one route asked as before');
  const path = 'basic/v2/Rail/Metro/S2STravelTime/TRTCMG';
  assert.equal((await tdxGet(env, path, { fetchFn, cache, now: NOW })).status, 502);
  assert.equal((await tdxGet(env, path, { fetchFn, cache, now: NOW + 60_000 })).status, 502);
  assert.equal(log.filter(u => u.includes('S2STravelTime')).length, 1, 'refused once, never asked again that day');
});

test("buses due, had=<s> (the phone's copy that old): a copy here no newer is read again now, not answered with and read behind; a newer one answers as it is", async () => {
  fresh();
  resetEta();
  const env = { TDX_CLIENT_ID: 'id', TDX_CLIENT_SECRET: 'secret', RATE_LIMIT_KV: memKv(), TDX_PER_MIN: '100' };
  const cache = memCache();
  let n = 0;
  const fetchFn = async url => (url.includes('token') ? json({ access_token: 'T', expires_in: 86400 }) : json([{ StopUID: 'HSZ1', RouteUID: 'HSZ10', EstimateTime: 600 - 30 * n++ }]));
  const ask = async (qs, now) => {
    const res = await handleTransit(new Request(`https://w/transit/eta?${qs}`), env, {}, '/transit/eta', { session: { s: 'S' }, fetchFn, now, cache, free: false });
    return { est: (await res.json()).map(r => r.EstimateTime), age: Number(res.headers.get('X-Transit-Age')) };
  };
  assert.deepEqual(await ask('city=Hsinchu&stops=HSZ1', NOW), { est: [600], age: 0 });
  // Past its fresh time (10 s), asked plainly: the copy at once (TDX read behind it), its age to a tenth of a second…
  assert.deepEqual(await ask('city=Hsinchu&stops=HSZ1', NOW + 15_300), { est: [600], age: 15.3 });
  await new Promise(r => setTimeout(r, 0));
  // …asked by a phone whose copy is 9 s old: the copy here (9.7 s, inside its fresh time) is no newer, so TDX now.
  assert.deepEqual(await ask('city=Hsinchu&stops=HSZ1&had=9', NOW + 25_000), { est: [540], age: 0 });
  // A phone whose copy is 20 s old: this one (5 s) is newer, it answers as it is.
  assert.deepEqual(await ask('city=Hsinchu&stops=HSZ1&had=20', NOW + 30_000), { est: [540], age: 5 });
  assert.equal(n, 3);
  // 公路客運's and a plan's routes too.
  assert.deepEqual((await ask('city=InterCity&routes=THB5700,THB5900', NOW)).est, [510]);
  assert.deepEqual((await ask('city=InterCity&routes=THB5700,THB5900&had=8', NOW + 9_000)).est, [480]);
});

// A small city's whole list for a crowd at its own stops (a school's students
// before and after class): one TDX read each time its estimates change, for
// every stop and phone, once that costs less than the stops' own reads.
test("buses due in a small city (新竹市): its whole list read once more stop lists are asked within a minute than it costs (7), for every stop and phone; fewer each their own; had= on the whole list; a big city never", async () => {
  fresh();
  resetEta();
  const env = { TDX_CLIENT_ID: 'id', TDX_CLIENT_SECRET: 'secret', RATE_LIMIT_KV: memKv(), TDX_PER_MIN: '100' };
  const cache = memCache();
  const log = [];
  let made = 0;
  const all = t => [
    ...Array.from({ length: 8 }, (_, i) => ({ StopUID: `HSZ${i + 1}`, RouteUID: i < 4 ? 'HSZ10' : 'HSZ20', EstimateTime: 60 * (i + 1), DataTime: `t${t}` })),
    { StopUID: 'TPE1', RouteUID: 'TPE10', EstimateTime: 90, DataTime: `t${t}` },
    { StopUID: 'TPE2', RouteUID: 'TPE10', EstimateTime: 30, DataTime: `t${t}` }
  ];
  const fetchFn = async url => {
    if (url.includes('token')) return json({ access_token: 'T', expires_in: 86400 });
    const u = decodeURIComponent(url);
    log.push(u);
    const t = made++;
    const named = [...u.matchAll(/(StopUID|RouteUID) eq '([^']+)'/g)];
    if (named.length) return json(all(t).filter(r => named.some(([, f, v]) => r[f] === v)));
    // (The whole list as big as 新竹市's: 590 KB.)
    return new Response(JSON.stringify(all(t)).padEnd(590_000, ' '), { headers: { 'Content-Type': 'application/json' } });
  };
  const ask = async (qs, now) => {
    const res = await handleTransit(new Request(`https://w/transit/eta?${qs}`), env, {}, '/transit/eta', { session: { s: 'S' }, fetchFn, now, cache, free: false });
    return { stops: (await res.json()).map(r => `${r.StopUID} ${r.DataTime}`), age: Number(res.headers.get('X-Transit-Age')) };
  };
  const whole = u => /EstimatedTimeOfArrival\/City\/\w+\?\$select=StopUID,[^&]*&\$top=60000(&|$)/.test(u);
  assert.equal(wholeAt('Hsinchu'), 7, '1,766 rows, 590 KB: worth seven stop lists');
  assert.equal(wholeAt('MiaoliCounty'), 2);
  assert.ok(wholeAt('Keelung') > 20 && wholeAt('Taipei') === Infinity);
  assert.equal(ETA_ROWS.HsinchuCounty, 3078);
  // Six stop lists within the minute (phones at six stops): each its own read.
  for (let i = 1; i <= 6; i++) assert.deepEqual((await ask(`city=Hsinchu&stops=HSZ${i}`, NOW + i * 1000)).stops.map(s => s.split(' ')[0]), [`HSZ${i}`]);
  assert.equal(log.length, 6);
  assert.ok(!log.some(whole));
  // A seventh: the city's whole list.
  assert.deepEqual((await ask('city=Hsinchu&stops=HSZ7,HSZ8', NOW + 7_000)).stops.map(s => s.split(' ')[0]), ['HSZ7', 'HSZ8']);
  assert.ok(log.some(whole), 'the whole city read');
  const n = log.length;
  const at = log.findIndex(whole);
  // Then every stop list and a plan's routes from it, no read: a phone whose copy (6 s) is older than it (1 s).
  assert.deepEqual(await ask('city=Hsinchu&stops=HSZ1&had=6', NOW + 8_000), { stops: [`HSZ1 t${at}`], age: 1 });
  assert.deepEqual((await ask('city=Hsinchu&routes=HSZ10', NOW + 9_000)).stops.map(s => s.split(' ')[0]), ['HSZ1', 'HSZ2', 'HSZ3', 'HSZ4']);
  assert.equal(log.length, n, 'one read for every stop list');
  // A phone whose copy is as old as the city's here (13 s), the crowd still about: the whole list read again now.
  const later = await ask('city=Hsinchu&stops=HSZ2,HSZ3&had=13', NOW + 20_000);
  assert.equal(later.age, 0);
  assert.ok(whole(log.at(-1)), 'the whole list again');
  assert.equal(log.length, n + 1);
  // Long after, one stop list alone again: its own read.
  await ask('city=Hsinchu&stops=HSZ1', NOW + 300_000);
  assert.ok(!whole(log.at(-1)));
  // A big city (台北, 10 MB): many stop lists are still their own reads.
  const m = log.length;
  for (let i = 1; i <= 8; i++) await ask(`city=Taipei&stops=TPE${i}`, NOW + 300_000 + i);
  assert.equal(log.length, m + 8);
  assert.ok(!log.slice(m).some(whole));
});

// 公路客運 (all Taiwan, never read whole): a crowd at its own stops asked
// together, a few reads of every stop (route) asked here this minute.
test("公路客運's stops and routes asked together: a crowd at its own stops shares a few reads of all of them; one phone alone its own read; a stop coming changes only its own group", async () => {
  fresh();
  resetEta();
  const env = { TDX_CLIENT_ID: 'id', TDX_CLIENT_SECRET: 'secret', RATE_LIMIT_KV: memKv(), TDX_PER_MIN: '1000' };
  const cache = memCache();
  const log = [];
  const fetchFn = async url => {
    if (url.includes('token')) return json({ access_token: 'T', expires_in: 86400 });
    const u = decodeURIComponent(url);
    log.push(u);
    const named = [...u.matchAll(/(StopUID|RouteUID) eq '([^']+)'/g)].map(m => m[2]);
    if (u.includes('RealTimeByFrequency')) return json(named.map(id => ({ RouteUID: id, PlateNumb: `${id}-bus`, Direction: 0, BusPosition: { PositionLat: 24.7, PositionLon: 121.1 }, GPSTime: 't' })));
    return json(named.map(id => ({ StopUID: id, RouteUID: 'THB5700', EstimateTime: 60 })));
  };
  const eta = async (stops, now, had = 0) => (await (await handleTransit(new Request(`https://w/transit/eta?city=InterCity&stops=${stops.join(',')}${had ? `&had=${had}` : ''}`), env, {}, '/transit/eta', { session: { s: 'S' }, fetchFn, now, cache, free: false })).json()).map(r => r.StopUID);
  const gps = async (routes, now, had = 0) => (await (await handleTransit(new Request(`https://w/transit/gps?city=InterCity&routes=${routes.join(',')}${had ? `&had=${had}` : ''}`), env, {}, '/transit/gps', { session: { s: 'S' }, fetchFn, now, cache, free: false })).json()).map(r => r.RouteUID);
  // One phone alone: its own stops' read, as before.
  assert.deepEqual(await eta(['THB102', 'THB101'], NOW), ['THB102', 'THB101']);
  assert.equal(log.length, 1);
  assert.match(log[0], /InterCity\?\$filter=StopUID eq 'THB102' or StopUID eq 'THB101'&/);
  // Another phone's stop: one read of all three in one order, each phone its own rows…
  assert.deepEqual(await eta(['THB201'], NOW + 3_000), ['THB201']);
  assert.match(log.at(-1), /InterCity\?\$filter=StopUID eq 'THB101' or StopUID eq 'THB102' or StopUID eq 'THB201'&/);
  // …and the first phone's next ask from that same read (its copy 5 s old, this one 2 s).
  assert.deepEqual(await eta(['THB102', 'THB101'], NOW + 5_000, 5), ['THB101', 'THB102']);
  assert.equal(log.length, 2);
  // 50 phones each at its own stop: once they're all asked, a round of every
  // one's next ask is a couple of reads (two groups), not 50.
  const crowd = Array.from({ length: 50 }, (_, i) => `THB${3000 + i * 7}`);
  for (const [i, s] of crowd.entries()) assert.deepEqual(await eta([s], NOW + 6_000 + i * 100), [s]);
  const n = log.length;
  for (const [i, s] of crowd.entries()) assert.deepEqual(await eta([s], NOW + 36_000 + i * 100, 30), [s], 'each phone its own stop');
  assert.ok(log.length - n <= 4, `a round of 50 asks: ${log.length - n} reads`);
  assert.ok(log.slice(n).every(u => (u.match(/StopUID eq/g) || []).length > 10), 'each a group of stops');
  // A stop coming changes only its own group: the others' reads stay as they were.
  const groupOf = async (id, at) => (await together('eta', [id], 40, { cache }, at))?.find(g => g.includes(id))?.join(',');
  const g0 = await groupOf(crowd[0], NOW + 40_100);
  let coming = null;
  for (let i = 0; i < 40 && !coming; i++) {
    const id = `THB9${i}`;
    const sees = (await together('eta', [id], 40, { cache: memCacheCopy(cache) }, NOW + 40_200)) || [];
    if (!sees.some(g => g.includes(crowd[0]))) coming = id;
  }
  assert.ok(g0 && coming);
  await together('eta', [coming], 40, { cache }, NOW + 40_300);
  assert.equal(await groupOf(crowd[0], NOW + 40_400), g0, "another group's stop coming leaves this group's read as it was");
  // Buses' places: two phones' lagging routes, one read of both; then each from it.
  const m = log.length;
  assert.deepEqual(await gps(['THB5700'], NOW), ['THB5700']);
  assert.match(log.at(-1), /RealTimeByFrequency\/InterCity\?\$filter=RouteUID eq 'THB5700'&/);
  assert.deepEqual(await gps(['THB5630', 'THB5608'], NOW + 2_000), ['THB5608', 'THB5630']);
  assert.match(log.at(-1), /RouteUID eq 'THB5608' or RouteUID eq 'THB5630' or RouteUID eq 'THB5700'&/);
  assert.deepEqual(await gps(['THB5700'], NOW + 4_000, 4), ['THB5700']);
  assert.equal(log.length, m + 2);
});

test("a route's buses' places, had=<s>: a copy here no newer than the phone's is read again now (a bus sends its place each 20 s); operators' notices kept 10 minutes", async () => {
  fresh();
  const env = { TDX_CLIENT_ID: 'id', TDX_CLIENT_SECRET: 'secret', RATE_LIMIT_KV: memKv(), TDX_PER_MIN: '100' };
  const cache = memCache();
  let n = 0;
  const fetchFn = async url => (url.includes('token') ? json({ access_token: 'T', expires_in: 86400 }) : json([{ PlateNumb: 'KKA-1', GPSTime: `t${n++}` }]));
  const gps = encodeURIComponent("basic/v2/Bus/RealTimeByFrequency/City/Hsinchu?$filter=RouteUID eq 'HSZ10' or RouteUID eq 'HSZ20'&$select=RouteUID,PlateNumb,Direction,BusPosition,GPSTime");
  const ask = async (qs, now) => {
    const res = await handleTransit(new Request(`https://w/transit/tdx?${qs}`), env, {}, '/transit/tdx', { session: { s: 'S' }, fetchFn, now, cache });
    return { at: (await res.json())[0]?.GPSTime, state: res.headers.get('X-Transit-Cache') };
  };
  assert.deepEqual(await ask(`p=${gps}`, NOW), { at: 't0', state: 'miss' });
  // 20 s on, asked plainly: the copy (20 s old) at once, TDX read behind it…
  assert.deepEqual(await ask(`p=${gps}`, NOW + 20_000), { at: 't0', state: 'stale' });
  await new Promise(r => setTimeout(r, 0));
  // …by a phone whose copy is 20 s old: the copy here (from 20 s on) is no newer, so TDX now.
  assert.deepEqual(await ask(`p=${gps}&had=20`, NOW + 40_000), { at: 't2', state: 'miss' });
  // A phone whose copy is older than this one: it answers as it is.
  assert.deepEqual(await ask(`p=${gps}&had=30`, NOW + 45_000), { at: 't2', state: 'hit' });
  assert.equal(n, 3);
  // Notices: read once, kept 10 minutes.
  for (const p of ['basic/v2/Bus/Alert/City/Hsinchu', 'basic/v2/Bus/News/InterCity', 'basic/v3/Rail/TRA/Alert', 'basic/v2/Rail/THSR/AlertInfo', 'basic/v2/Rail/Metro/Alert/TRTC']) {
    const was = n;
    assert.equal((await ask(`p=${encodeURIComponent(p)}`, NOW)).state, 'miss');
    assert.equal((await ask(`p=${encodeURIComponent(p)}`, NOW + 9 * 60_000)).state, 'hit', p);
    assert.equal(n, was + 1);
  }
  // (台鐵's boards stay live.)
  assert.equal(tdxRequest('basic/v3/Rail/TRA/StationLiveBoard/Station/1210').rule.fresh, 50e3);
});

// A city's buses' places: one read of its whole list for every route and
// every phone (each stop card asked its own lagging routes, a TDX read a stop
// each 20 s); 公路客運's (all Taiwan) by its routes.
test("buses' places, /transit/gps: a city's whole list read once for every route asked, each ask its own routes'; 公路客運's by its routes; had= as eta's", async () => {
  fresh();
  const env = { TDX_CLIENT_ID: 'id', TDX_CLIENT_SECRET: 'secret', RATE_LIMIT_KV: memKv(), TDX_PER_MIN: '100' };
  const cache = memCache();
  const reads = [];
  const fetchFn = async url => {
    if (url.includes('token')) return json({ access_token: 'T', expires_in: 86400 });
    reads.push(decodeURIComponent(url.replace(/^.*?\/api\//, '')));
    const ids = url.includes('InterCity') ? [...decodeURIComponent(url).matchAll(/RouteUID eq '([^']+)'/g)].map(m => m[1]) : ['HSZ10', 'HSZ20', 'HSZ30'];
    return json(ids.map(id => ({ RouteUID: id, PlateNumb: `${id}-${reads.length}`, Direction: 0, BusPosition: { PositionLat: 24.8, PositionLon: 120.97, GeoHash: 'wsqh' }, Speed: 30, Azimuth: 90, DutyStatus: 1, GPSTime: 't', UpdateTime: 'u' })));
  };
  const ask = async (qs, now) => {
    const res = await handleTransit(new Request(`https://w/transit/gps?${qs}`), env, {}, '/transit/gps', { session: { s: 'S' }, fetchFn, now, cache, free: false });
    return { status: res.status, plates: (await res.json()).map?.(r => r.PlateNumb), age: res.headers.get('X-Transit-Age') };
  };
  // Two stop cards' lagging routes, a moment apart: one read of the city's whole list.
  assert.deepEqual(await ask('city=Hsinchu&routes=HSZ10,HSZ20', NOW), { status: 200, plates: ['HSZ10-1', 'HSZ20-1'], age: '0' });
  assert.deepEqual(await ask('city=Hsinchu&routes=HSZ30', NOW + 2000), { status: 200, plates: ['HSZ30-1'], age: '2' });
  assert.equal(reads.length, 1);
  assert.match(reads[0], /RealTimeByFrequency\/City\/Hsinchu\?\$select=RouteUID,PlateNumb,Direction,BusPosition,GPSTime/);
  // Each bus only as the phone reads it.
  const one = await (await handleTransit(new Request('https://w/transit/gps?city=Hsinchu&routes=HSZ10'), env, {}, '/transit/gps', { session: { s: 'S' }, fetchFn, now: NOW + 3000, cache, free: false })).json();
  assert.deepEqual(one, [{ RouteUID: 'HSZ10', PlateNumb: 'HSZ10-1', Direction: 0, BusPosition: { PositionLat: 24.8, PositionLon: 120.97 }, GPSTime: 't' }]);
  assert.doesNotMatch(reads[0], /filter/);
  // A phone whose copy is 20 s old, 20 s on: no newer here, so read now.
  assert.deepEqual((await ask('city=Hsinchu&routes=HSZ10&had=20', NOW + 20_000)).plates, ['HSZ10-2']);
  // 公路客運: its routes' own read.
  assert.deepEqual((await ask('city=InterCity&routes=THB5608,THB5801', NOW)).plates, ['THB5608-3', 'THB5801-3']);
  assert.match(reads[2], /RealTimeByFrequency\/InterCity\?\$filter=RouteUID eq 'THB5608' or RouteUID eq 'THB5801'&\$select=/);
  // Nothing to ask, or not a city: refused, no read.
  assert.equal((await ask('city=Hsinchu&routes=', NOW)).status, 400);
  assert.equal((await ask('city=../x&routes=HSZ10', NOW)).status, 400);
  assert.equal(reads.length, 3);
});

test("a day's trains keep only what the phone reads (台鐵's 4 MB day to 40%): each train's number, type, headsign, line, note and bike flag, each stop's station and times, names in Chinese and English; a train that won't run left out; kept so", async () => {
  fresh();
  const name = (zh, en) => ({ Zh_tw: zh, En: en, Ja: zh, Kr: '타이베이' });
  const stop = (id, t, more = {}) => ({ StopSequence: 1, StationID: id, StationName: name('臺北', 'Taipei'), ArrivalTime: t, DepartureTime: t, SuspendedFlag: 0, ...more });
  const train = (no, more = {}) => ({
    TrainInfo: { TrainNo: no, Direction: 0, TrainTypeID: '1132', TrainTypeCode: '10', TrainTypeName: name('區間快', 'Fast Local Train'), TripHeadSign: '往七堵', StartingStationID: '5050', StartingStationName: name('潮州', 'Chaozhou'), EndingStationID: '0930', EndingStationName: name('七堵', 'Qidu'), TripLine: 2, WheelChairFlag: 0, BikeFlag: 1, DailyFlag: 1, SuspendedFlag: 0, ServiceType: 1, Note: '每日行駛。', ...more },
    StopTimes: [stop('5050', '06:37'), stop('4400', '07:10', { SuspendedFlag: 1 }), stop('0930', '11:02')]
  });
  const tra = { UpdateTime: 'x', UpdateInterval: 1440, SrcUpdateTime: 'x', SrcUpdateInterval: 1440, TrainDate: '2026-11-05', TrainTimetables: [train('1006'), train('1008', { SuspendedFlag: 1 })] };
  const path = 'basic/v3/Rail/TRA/DailyTrainTimetable/TrainDate/2026-11-05';
  const lean = JSON.parse(tdxTrim(path, JSON.stringify(tra)));
  assert.deepEqual(lean, {
    TrainDate: '2026-11-05',
    TrainTimetables: [{
      TrainInfo: { TrainNo: '1006', TrainTypeCode: '10', TrainTypeName: { Zh_tw: '區間快', En: 'Fast Local Train' }, TripHeadSign: '往七堵', EndingStationName: { Zh_tw: '七堵', En: 'Qidu' }, TripLine: 2, Note: '每日行駛。', BikeFlag: 1 },
      StopTimes: [{ StationID: '5050', ArrivalTime: '06:37', DepartureTime: '06:37' }, { StationID: '4400', ArrivalTime: '07:10', DepartureTime: '07:10', SuspendedFlag: 1 }, { StationID: '0930', ArrivalTime: '11:02', DepartureTime: '11:02' }]
    }]
  });
  assert.equal(tdxTrim(path, JSON.stringify(lean)), JSON.stringify(lean), 'trimmed twice: the same');
  const hsr = [{ TrainDate: '2026-11-05', DailyTrainInfo: { TrainNo: '0108', Direction: 1, StartingStationID: '1070', StartingStationName: name('左營', 'Zuoying'), EndingStationID: '0990', EndingStationName: { Zh_tw: '南港', En: 'Nangang', Ja: null, Ko: null }, Note: {}, Overnight: false }, StopTimes: [{ StopSequence: 1, StationID: '1070', StationName: name('左營', 'Zuoying'), DepartureTime: '07:55' }, { StopSequence: 2, StationID: '0990', StationName: name('南港', 'Nangang'), ArrivalTime: '09:40', DepartureTime: '09:40' }] }];
  assert.deepEqual(JSON.parse(tdxTrim('basic/v2/Rail/THSR/DailyTimetable/TrainDate/2026-11-05', JSON.stringify(hsr))), [{ TrainDate: '2026-11-05', DailyTrainInfo: { TrainNo: '0108', EndingStationName: { Zh_tw: '南港', En: 'Nangang' }, Note: {} }, StopTimes: [{ StationID: '1070', DepartureTime: '07:55' }, { StationID: '0990', ArrivalTime: '09:40', DepartureTime: '09:40' }] }]);
  // Anything else, or an answer not in TDX's shape, as it came.
  for (const [p, t] of [['basic/v2/Bike/Availability/City/Hsinchu', '[{"a":1}]'], [path, 'not json'], [path, '{"Message":"x"}'], ['basic/v3/Rail/TRA/DailyTrainTimetable/OD/1000/to/1210/2026-11-05', JSON.stringify(tra)]]) assert.equal(tdxTrim(p, t), t);
  // Through the shared cache: what's kept and sent is the trimmed day.
  const env = { TDX_CLIENT_ID: 'id', TDX_CLIENT_SECRET: 'secret', RATE_LIMIT_KV: memKv() };
  const cache = memCache();
  const fetchFn = async url => (url.includes('token') ? json({ access_token: 'T', expires_in: 86400 }) : json(tra));
  const got = await tdxGet(env, path, { fetchFn, cache, now: NOW });
  assert.deepEqual(JSON.parse(got.body), lean);
  assert.deepEqual(JSON.parse((await tdxGet(env, path, { fetchFn: () => assert.fail('cached'), cache, now: NOW + 1000 })).body), lean);
});

// Jay 2026-11-10: TDX's 高鐵訂票導訂 approved for our key (臺鐵's pending).
test('高鐵 booking: a link into 高鐵’s own booking, the trip filled in, asked of TDX on a tap and never kept; anything else refused', async () => {
  const { bookPath, hsrName, linkIn } = await import('../transit.js');
  fresh();
  const env = { TDX_CLIENT_ID: 'id', TDX_CLIENT_SECRET: 's', RATE_LIMIT_KV: memKv() };
  const asked = [];
  const fetchFn = async url => {
    if (/openid-connect\/token$/.test(url)) return json({ access_token: 'T', expires_in: 86400 });
    asked.push(decodeURIComponent(String(url)));
    return json({ result: 'success', data: { url: 'https://irs.thsrc.com.tw/IMINT/?deeplinkToken=abc' } });
  };
  const ask = qs => handleTransit(new Request(`https://w/transit/book?${qs}`), env, {}, '/transit/book', { session: { s: 'S' }, fetchFn, now: NOW, cache: memCache() });
  const web = await ask('sys=hsr&from=新竹&to=臺北&date=2026-11-10&time=13:10&no=123');
  assert.equal(web.status, 200);
  assert.deepEqual(await web.json(), { url: 'https://irs.thsrc.com.tw/IMINT/?deeplinkToken=abc' });
  assert.match(asked[0], /maas-thsr\/booking\/deeplink\/web\/hsr\?/);
  assert.match(asked[0], /start_station=新竹&end_station=台北&departure_date=20261110&departure_number=0123/, 'its own names (台 not 臺), the number in 4 digits');
  assert.match(asked[0], /ticket_type=S&carriage_type=Y&adult_ticket=1/, 'one adult, one way, standard');
  await ask('sys=hsr&from=高鐵新竹站&to=左營&date=2026-11-10&time=13:10&no=123&app=1');
  assert.match(asked[1], /deeplink\/direct\/hsr\?start_station=新竹&end_station=左營&train_date=2026-11-10&train_time=13:10&train_number=123$/);
  for (const bad of ['sys=tra&from=新竹&to=台北&date=2026-11-10&no=123', 'from=新竹&to=新竹&date=2026-11-10&no=123', 'from=竹北&to=台北&date=2026-11-10&no=123', 'from=新竹&to=台北&date=11/10&no=123', 'from=新竹&to=台北&date=2026-11-10&no=12345'])
    assert.equal((await ask(bad)).status, 400, bad);
  assert.equal(asked.length, 2, 'never asked for those');
  assert.equal(hsrName('臺中'), '台中');
  assert.equal(bookPath(new URLSearchParams('from=新竹&to=台北&date=2026-11-10&no=1&app=1')), null, 'the app’s needs its time');
  // TDX refusing (not approved): said so, no link.
  const refused = await handleTransit(new Request('https://w/transit/book?from=新竹&to=台北&date=2026-11-10&no=123'), env, {}, '/transit/book', { session: { s: 'S' }, fetchFn: async () => new Response(JSON.stringify({ result: 'fail', error: { code: 99999, msg: 'Forbidden' } }), { status: 403 }), now: NOW, cache: memCache() });
  assert.equal(refused.status, 502);
  assert.equal((await refused.json()).code, 'NOT_ALLOWED');
  assert.equal(linkIn({ result: 'success', data: { a: 'x', deeplink: 'texapp://book?x=1' } }), 'texapp://book?x=1');
});
