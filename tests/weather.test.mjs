// Orbit Weather (weather.js): the sources' parsing, the blend, the advice,
// the cell cache and the key check, on real answers saved in
// tests/fixtures/weather/ (Taipei 101, 2026-10-02 evening), without network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  weatherStatus, handleWeather, scrub, cellOf, nearestStation, townIds, airArea, parseCwaTown, cwaAt, parseGoogleDay, parseGoogleHour,
  blend, buildCell, cellForecast, advise, adviceWindow, parseCwaWarnings, aqiLevel, uvLevel, num, DEFAULT_WEIGHTS
} from '../weather.js';
import { STATIONS } from '../weather-stations.js';

const fx = name => JSON.parse(readFileSync(new URL(`./fixtures/weather/${name}.json`, import.meta.url), 'utf8'));
const NOW = Date.parse('2026-10-02T11:46:00Z');
const env = { GOOGLE_WEATHER_KEY: 'g-secret-key-123', CWA_KEY: 'CWA-SECRET-0000', MOENV_KEY: 'moenv-key-0000' };
const answer = (status, body) => ({ ok: status < 400, status, text: async () => (typeof body === 'string' ? body : JSON.stringify(body)) });
const memKv = () => {
  const store = new Map();
  return { store, get: async k => store.get(k) ?? null, put: async (k, v) => void store.set(k, v) };
};

// Every upstream the Worker calls, answered from the fixtures.
function upstream(log = []) {
  const hours = fx('google-hours');
  const page2 = { forecastHours: hours.forecastHours.map(h => ({ ...h, interval: { startTime: new Date(Date.parse(h.interval.startTime) + 86_400_000).toISOString() } })) };
  const oneStation = (file, id) => {
    const j = fx(file);
    return { ...j, records: { ...j.records, Station: j.records.Station.filter(s => s.StationId === id) } };
  };
  return async url => {
    const u = new URL(url);
    log.push(u.pathname + (u.searchParams.get('pageToken') ? '#2' : ''));
    if (u.host === 'weather.googleapis.com') {
      if (u.pathname.endsWith('currentConditions:lookup')) return answer(200, fx('google-current'));
      if (u.pathname.endsWith('hours:lookup')) return answer(200, u.searchParams.get('pageToken') ? page2 : hours);
      if (u.pathname.endsWith('days:lookup')) return answer(200, fx('google-days'));
    }
    if (u.host === 'opendata.cwa.gov.tw') {
      const id = u.pathname.split('/').pop();
      assert.equal(u.searchParams.get('Authorization'), env.CWA_KEY);
      if (id === 'F-D0047-061') return answer(200, fx('cwa-town-3d'));
      if (id === 'F-D0047-063') return answer(200, fx('cwa-town-1w'));
      if (id === 'O-A0001-001') return answer(200, oneStation('cwa-stations', u.searchParams.get('StationId')));
      if (id === 'O-A0003-001') return answer(200, oneStation('cwa-manned', u.searchParams.get('StationId')));
      if (id === 'O-A0002-001') return answer(200, oneStation('cwa-rain', u.searchParams.get('StationId')));
      if (id === 'W-C0033-001') return answer(200, fx('cwa-warn'));
    }
    if (u.host === 'data.moenv.gov.tw') {
      if (u.pathname.endsWith('aqx_p_432')) return answer(200, fx('moenv-aqi'));
      if (u.pathname.endsWith('aqf_p_01')) return answer(200, fx('moenv-aqf'));
    }
    return answer(404, 'no fixture for ' + url);
  };
}

test('cells round to 0.01°, about a kilometre', () => {
  assert.equal(cellOf(25.0339, 121.5645), '25.03,121.56');
  assert.equal(cellOf(25.035, 121.565), '25.04,121.57');
  assert.equal(cellOf(-0.004, 0), '0.00,0.00');
});

test('the station table finds the township and the nearest stations', () => {
  assert.ok(STATIONS.length > 1000);
  const s = nearestStation(25.034, 121.565, 'r');
  assert.equal(s.county, '臺北市');
  assert.ok(s.km < 3);
  assert.deepEqual(townIds('臺北市'), ['F-D0047-061', 'F-D0047-063']);
  assert.deepEqual(townIds('金門縣'), ['F-D0047-085', 'F-D0047-087']);
  assert.equal(townIds('東京都'), null);
  assert.equal(airArea('台北市'), '北部');
  assert.equal(airArea('花蓮縣'), '花東');
});

test('CWA township forecast: hourly temperature, 3-hour rain, the week by halves', () => {
  const t = parseCwaTown(fx('cwa-town-3d'), fx('cwa-town-1w'));
  assert.equal(t.town, '信義區');
  assert.ok(t.temp.length > 40 && t.pop.length > 20);
  const at = Date.parse('2026-10-02T19:00:00+08:00');
  assert.equal(cwaAt(t.pop, at), 40); // 18:00–21:00 interval
  assert.equal(typeof cwaAt(t.temp, at), 'number');
  const d = t.days['2026-10-03'];
  assert.ok(d.hi >= d.lo && d.popDay != null && d.popNight != null && d.uv != null);
  assert.equal(num('-99'), null);
  assert.equal(num('-99.0'), null);
  assert.equal(num('-3'), -3);
});

test('Google parsing: hours and days', () => {
  const h = parseGoogleHour(fx('google-hours').forecastHours[0]);
  assert.equal(h.t, Date.parse('2026-10-02T11:00:00Z'));
  assert.equal(h.pop, 20);
  assert.equal(h.condition.text, '陰');
  const d = parseGoogleDay(fx('google-days').forecastDays[0]);
  assert.equal(d.date, '2026-10-02');
  assert.equal(d.pop, 60);
  assert.equal(d.uvMax, 5);
  assert.equal(d.moon.phase, 'WANING_GIBBOUS');
  assert.ok(d.sunrise < d.sunset);
});

test('the blend weighs the sources that have a value', () => {
  assert.equal(blend({ google: 80, cwa: 50 }, { google: 0.6, cwa: 0.4 }), 68);
  assert.equal(blend({ google: 80, cwa: null }, { google: 0.6, cwa: 0.4 }), 80);
  assert.equal(blend({ google: null, cwa: null }, { google: 0.6, cwa: 0.4 }), null);
});

test('a whole cell from the three sources', async () => {
  const log = [];
  const e = { ...env, RATE_LIMIT_KV: memKv() };
  const { resp, parts } = await buildCell(e, 25.034, 121.565, { fetchFn: upstream(log), now: NOW });
  assert.deepEqual(resp.sources, { google: 'ok', cwa: 'ok', moenv: 'ok' });
  assert.equal(resp.cell, '25.03,121.57');
  assert.deepEqual(resp.place, { county: '臺北市', town: '信義區' });
  assert.equal(resp.hours.length, 48);
  const h = resp.hours[0];
  assert.equal(h.popBy.google, 20);
  assert.equal(h.popBy.cwa, 40);
  assert.equal(h.pop, Math.round(0.6 * 20 + 0.4 * 40));
  assert.equal(resp.days.length, 10);
  assert.ok(resp.days[1].popBy.cwa != null);
  assert.ok(resp.now.station && resp.now.station.km < 5);
  assert.equal(resp.now.temp, resp.now.station.temp, 'a station 0.4 km away, measured within the hour');
  assert.equal(resp.now.tempBy.google, 24.3);
  assert.ok(!resp.advice.find(x => x.kind === 'week')?.why.worst.startsWith('2026-10-02'), 'the week starts at the advice day');
  assert.ok(resp.now.gauge && resp.now.rain1h != null);
  assert.ok(resp.air && resp.air.aqi != null && resp.air.station.km < 5);
  assert.equal(resp.air.forecast.area, '北部');
  assert.ok(Array.isArray(resp.advice) && resp.advice.length > 0);
  assert.ok(parts.google && parts.cwa);
  // Google: current, 2 hour pages, days; no alerts in Taiwan.
  assert.equal(log.filter(p => p.startsWith('/v1/')).length, 4);
  assert.ok(!log.some(p => p.includes('publicAlerts')));
});

test('a failing source: the others answer, the last good copy is used', async () => {
  const e = { ...env, RATE_LIMIT_KV: memKv() };
  const good = await buildCell(e, 25.034, 121.565, { fetchFn: upstream(), now: NOW });
  const ok = upstream();
  const googleDown = async url => (url.includes('googleapis') ? answer(500, 'down') : ok(url));
  const later = await buildCell(e, 25.034, 121.565, { fetchFn: googleDown, now: NOW + 3_600_000, prev: good });
  assert.equal(later.resp.sources.google, 'stale');
  assert.equal(later.resp.hours.length, 48);
  const cold = await buildCell({ ...env, RATE_LIMIT_KV: memKv() }, 25.034, 121.565, { fetchFn: googleDown, now: NOW });
  assert.equal(cold.resp.sources.google, 'error');
  assert.ok(cold.resp.hours.length > 0, 'CWA alone still gives hours');
  assert.ok(cold.resp.days.length >= 5, 'and the week');
  assert.equal(cold.resp.hours[0].popBy.google, null);
});

test('abroad: Google only, with its alerts', async () => {
  const log = [];
  const ok = upstream(log);
  const f = async url => (url.includes('publicAlerts') ? answer(200, { weatherAlerts: [] }) : ok(url));
  const { resp } = await buildCell({ ...env, RATE_LIMIT_KV: memKv() }, 35.68, 139.76, { fetchFn: f, now: NOW });
  assert.equal(resp.sources.cwa, 'n/a');
  assert.equal(resp.place, null);
  assert.equal(resp.air, null);
  assert.ok(!log.some(p => p.includes('datastore') || p.includes('api/v2')));
});

test('the cell cache: fresh from KV, old answered at once and refreshed behind', async () => {
  const kv = memKv();
  const e = { ...env, RATE_LIMIT_KV: kv };
  let calls = 0;
  const ok = upstream();
  const f = async url => (calls++, ok(url));
  await cellForecast(e, null, 25.034, 121.565, { fetchFn: f, now: NOW });
  const n = calls;
  const again = await cellForecast(e, null, 25.034, 121.565, { fetchFn: f, now: NOW + 10 * 60_000 });
  assert.equal(calls, n);
  assert.equal(again.cached, true);
  const waits = [];
  const old = await cellForecast(e, { waitUntil: p => waits.push(p) }, 25.034, 121.565, { fetchFn: f, now: NOW + 60 * 60_000 });
  assert.equal(old.refreshing, true);
  assert.equal(old.at, NOW);
  await Promise.all(waits);
  assert.ok(calls > n);
  assert.equal(JSON.parse(kv.store.get('weather:cell:25.03,121.57')).at, NOW + 60 * 60_000);
});

test('advice: umbrella, sun window, wear, mask, by the thresholds', () => {
  const at = Date.parse('2026-10-03T07:00:00+08:00');
  const hour = (h, o) => ({ t: Date.parse(`2026-10-03T${String(h).padStart(2, '0')}:00:00+08:00`), temp: 24, feels: 24, uv: 0, pop: 10, popBy: { google: 10, cwa: 10 }, ...o });
  const hours = Array.from({ length: 24 }, (_, h) => hour(h));
  hours[15] = hour(15, { pop: 70, popBy: { google: 80, cwa: 55 }, feels: 33 });
  for (const h of [10, 11, 12, 13]) hours[h] = hour(h, { uv: 9, feels: 31 });
  const advice = advise({ hours, days: [], air: { aqi: 120, pm25: 40, level: '對敏感族群不健康', station: { name: '松山' } } }, at);
  const k = Object.fromEntries(advice.map(a => [a.kind, a]));
  assert.equal(k.umbrella.level, 'yes');
  assert.match(k.umbrella.text, /15:00 降雨機率 70%/);
  assert.match(k.sun.text, /10:00–14:00 UV 9（過量）/);
  assert.equal(k.wear.level, 'sleeves');
  assert.equal(k.wear.why.layers, true);
  assert.ok(k.mask);
  assert.ok(!k.heat);
  // After school: tomorrow's window.
  assert.equal(adviceWindow(Date.parse('2026-10-03T18:00:00+08:00')).date, '2026-10-04');
  assert.equal(uvLevel(2), '低');
  assert.equal(uvLevel(11), '危險');
  assert.equal(aqiLevel(101), '對敏感族群不健康');
});

test('CWA warnings for the county', () => {
  const w = parseCwaWarnings(fx('cwa-warn'), '臺中市');
  assert.ok(w.length >= 1);
  assert.match(w[0].title, /特報$/);
  assert.ok(w[0].from < w[0].to);
});

test('/weather needs a session and a place', async () => {
  const e = { ...env, RATE_LIMIT_KV: memKv() };
  const get = (q, opts) => handleWeather(new Request('https://w.example/weather' + q), e, {}, '/weather', { fetchFn: upstream(), ...opts });
  assert.equal((await get('?lat=25&lon=121.5')).status, 401);
  assert.equal((await get('?lat=x&lon=121.5', { session: { s: 'a' } })).status, 400);
  assert.equal((await get('?lat=25.03&lon=121.56', { session: { s: 'a' }, limited: () => true })).status, 429);
  const res = await get('?lat=25.034&lon=121.565', { session: { s: 'a' } });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).place.town, '信義區');
});

test('status says which keys are set and answer, never the keys', async () => {
  const fetchFn = async url => (url.includes('googleapis') ? answer(200, { temperature: { degrees: 28 } }) : answer(401, `bad key CWA-SECRET-0000 in ${url}`));
  const r = await weatherStatus({ ...env, MOENV_KEY: '' }, fetchFn);
  assert.equal(r.sources.google.ok, true);
  assert.equal(r.sources.cwa.ok, false);
  assert.equal(r.sources.cwa.status, 401);
  assert.deepEqual(r.sources.moenv, { key: false, ok: false, note: 'not set' });
  assert.ok(!JSON.stringify(r).includes('CWA-SECRET-0000'));
  assert.equal(scrub('a g-secret-key-123 b', env), 'a *** b');
});

test('samples are a fixed list, cached in KV', async () => {
  const kv = memKv();
  let calls = 0;
  const fetchFn = async () => (calls++, answer(200, { ok: 1, echo: 'g-secret-key-123' }));
  const req = q => new Request('https://w.example/weather/status' + q);
  const bad = await handleWeather(req('?sample=../x'), { ...env, RATE_LIMIT_KV: kv }, {}, '/weather/status', { fetchFn });
  assert.equal(bad.status, 404);
  for (let i = 0; i < 2; i++) {
    const j = await (await handleWeather(req('?sample=google-current'), { ...env, RATE_LIMIT_KV: kv }, {}, '/weather/status', { fetchFn })).json();
    assert.equal(j.status, 200);
    assert.ok(!j.body.includes('g-secret-key-123'));
  }
  assert.equal(calls, 1);
});

test('default weights start Google 0.6, CWA 0.4', () => {
  assert.deepEqual(DEFAULT_WEIGHTS.pop, { google: 0.6, cwa: 0.4 });
});
