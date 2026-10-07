// Orbit Weather (weather.js): the sources' parsing, the blend, the advice,
// the cell cache and the key check, on real answers saved in
// tests/fixtures/weather/ (Taipei 101, 2026-10-02 evening), without network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  airForecast, parseGoogleAir, googleAirBody, parseAirHistory,
  weatherStatus, handleWeather, scrub, cellOf, nearestStation, townIds, airArea, parseCwaTown, cwaAt, parseGoogleDay, parseGoogleHour,
  blend, buildCell, GOOGLE_DAILY_CALLS, parseVillage, whereIs, addAirReading, briefText, rainPhrase, weatherCheck, noteRecent, cellForecast, advise, adviceWindow, parseCwaWarnings, aqiLevel, uvLevel, num, DEFAULT_WEIGHTS
, popStep, keepJson, keptJson, KV_EVERY_MS } from '../weather.js';
import { STATIONS } from '../weather-stations.js';
import { upstream as fixtureUpstream } from './fixtures/weather/upstream.mjs';

const fx = name => JSON.parse(readFileSync(new URL(`./fixtures/weather/${name}.json`, import.meta.url), 'utf8'));
const NOW = Date.parse('2026-10-02T11:46:00Z');
const env = { GOOGLE_WEATHER_KEY: 'g-secret-key-123', CWA_KEY: 'CWA-SECRET-0000', MOENV_KEY: 'moenv-key-0000' };
const answer = (status, body) => ({ ok: status < 400, status, text: async () => (typeof body === 'string' ? body : JSON.stringify(body)) });
const memKv = () => {
  const store = new Map();
  return { store, get: async k => store.get(k) ?? null, put: async (k, v) => void store.set(k, v) };
};

// Every upstream the Worker calls, answered from the fixtures (with the
// CWA key checked).
const upstream = (log = [], opts) => {
  const f = fixtureUpstream(log, opts);
  return async (url, o) => {
    if (url.includes('opendata.cwa.gov.tw')) assert.equal(new URL(url).searchParams.get('Authorization'), env.CWA_KEY);
    return f(url, o);
  };
};

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
  const { resp, parts, bySource, sources } = await buildCell(e, 25.034, 121.565, { fetchFn: upstream(log), now: NOW });
  assert.deepEqual(sources, { google: 'ok', cwa: 'ok', moenv: 'ok' });
  assert.equal(resp.partial, false);
  assert.equal(resp.cell, '25.03,121.57');
  assert.deepEqual(resp.place, { county: '臺北市', town: '信義區' });
  assert.equal(resp.hours.length, 240, 'hourly for 10 days');
  const h = resp.hours[0];
  assert.deepEqual(bySource.hours[0].pop, { google: 20, cwa: 40 });
  assert.equal(h.pop, 30, 'the blend (28) in steps of 10, as Taiwan reads a rain chance');
  assert.ok(resp.hours.every(x => x.pop == null || x.pop % 10 === 0) && resp.days.every(d => d.pop == null || d.pop % 10 === 0), 'every hour and day in steps of 10');
  assert.equal(resp.days.length, 10);
  assert.ok(bySource.days[1].pop.cwa != null);
  assert.ok(resp.now.station && resp.now.station.km < 5);
  assert.equal(resp.now.temp, resp.now.station.temp, 'a station 0.4 km away, measured within the hour');
  assert.equal(bySource.now.temp.google, 24.3);
  assert.ok(!resp.advice.find(x => x.kind === 'week')?.why.worst.startsWith('2026-10-02'), 'the week starts at the advice day');
  assert.ok(resp.now.gauge && resp.now.rain1h != null);
  assert.ok(resp.air && resp.air.aqi != null && resp.air.station.km < 5);
  assert.equal(resp.air.forecast.area, '北部');
  // MOENV's 4 days, then Google's air hours alone to 10/6; hourly to 96 hours.
  assert.deepEqual(resp.air.forecast.days.map(d => d.date), ['2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05', '2026-10-06']);
  assert.equal(resp.air.hourly.length, 96);
  assert.ok(resp.air.history.length >= 1, 'the station reading ends the history');
  assert.equal(resp.air.forecast.days[1].level, '普通');
  assert.ok(Array.isArray(resp.advice) && resp.advice.length > 0);
  assert.ok(parts.google && parts.cwa);
  // Google: current, 10 hour pages (the far ones on a first build), days; no alerts in Taiwan.
  assert.equal(log.filter(p => p.startsWith('/v1/')).length, 12);
  // And Google's air hours, once.
  assert.equal(log.filter(p => p.startsWith('air:')).length, 1);
  assert.equal(JSON.parse(e.RATE_LIMIT_KV.store.get('weather:google:2026-10-02')), 13);
  assert.ok(!JSON.stringify(resp).includes('gstatic'), 'no icon addresses');
  assert.ok(!log.some(p => p.includes('publicAlerts')));
});

test('one truth: the answer names no source and carries no second opinion', async () => {
  const kv = memKv();
  const resp = await cellForecast({ ...env, RATE_LIMIT_KV: kv }, null, 25.034, 121.565, { fetchFn: upstream(), now: NOW });
  const text = JSON.stringify(resp);
  for (const word of ['google', 'cwa', 'moenv', 'By"', 'split', 'weights', 'sources']) assert.ok(!text.toLowerCase().includes(word.toLowerCase()), word);
  // The breakdown is kept for scoring, in KV only.
  const entry = JSON.parse(kv.store.get('weather:cell:25.03,121.57'));
  assert.equal(entry.bySource.hours.length, 49, 'this hour and the next 48');
});

test('a failing source: the others answer, the last good copy is used', async () => {
  const e = { ...env, RATE_LIMIT_KV: memKv() };
  const good = await buildCell(e, 25.034, 121.565, { fetchFn: upstream(), now: NOW });
  const ok = upstream();
  const googleDown = async url => (url.includes('googleapis') ? answer(500, 'down') : ok(url));
  const later = await buildCell(e, 25.034, 121.565, { fetchFn: googleDown, now: NOW + 3_600_000, prev: good });
  assert.equal(later.sources.google, 'stale');
  assert.equal(later.resp.partial, true);
  assert.equal(later.resp.hours.length, 240, 'the far hours kept');
  const cold = await buildCell({ ...env, RATE_LIMIT_KV: memKv() }, 25.034, 121.565, { fetchFn: googleDown, now: NOW });
  assert.equal(cold.sources.google, 'error');
  assert.ok(cold.resp.hours.length > 0, 'CWA alone still gives hours');
  assert.ok(cold.resp.days.length >= 5, 'and the week');
  assert.equal(cold.bySource.hours[0].pop.google, null);
});

test('abroad: Google only, with its alerts', async () => {
  const log = [];
  const ok = upstream(log);
  const f = async url => (url.includes('publicAlerts') ? answer(200, { weatherAlerts: [] }) : ok(url));
  const { resp, sources } = await buildCell({ ...env, RATE_LIMIT_KV: memKv() }, 35.68, 139.76, { fetchFn: f, now: NOW });
  assert.equal(sources.cwa, 'n/a');
  assert.equal(resp.partial, false);
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
  const hour = (h, o) => ({ t: Date.parse(`2026-10-03T${String(h).padStart(2, '0')}:00:00+08:00`), temp: 24, feels: 24, uv: 0, pop: 10, ...o });
  const hours = Array.from({ length: 24 }, (_, h) => hour(h));
  hours[15] = hour(15, { pop: 70, feels: 33 });
  for (const h of [10, 11, 12, 13]) hours[h] = hour(h, { uv: 9, feels: 31 });
  const advice = advise({ hours, days: [], air: { aqi: 120, pm25: 40, level: '對敏感族群不健康', station: { name: '松山' } } }, at);
  const k = Object.fromEntries(advice.map(a => [a.kind, a]));
  assert.equal(k.umbrella.level, 'yes');
  assert.equal(k.umbrella.text, '帶傘：15時 70% 會下雨');
  assert.equal(k.sun.text, '防曬：10–14時 UV 9 過量');
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
  assert.equal(w[0].source, undefined);
  assert.ok(w[0].from < w[0].to);
});

test('/weather: a Quadra Pass session, a place or where the IP says', async () => {
  const e = { ...env, RATE_LIMIT_KV: memKv() };
  const get = (q, opts) => handleWeather(new Request('https://w.example/weather' + q), e, {}, '/weather', { fetchFn: upstream(), cf: undefined, session: { s: 'x' }, ...opts });
  assert.equal((await get('?lat=25.03&lon=121.56', { session: null })).status, 401);
  assert.equal((await get('?lat=x&lon=121.5')).status, 400);
  assert.equal((await get('?lat=25')).status, 400);
  assert.equal((await get('?lat=25.03&lon=121.56', { limited: () => true })).status, 429);
  const res = await get('?lat=25.034&lon=121.565');
  assert.equal(res.status, 200);
  const j = await res.json();
  assert.equal(j.place.town, '信義區');
  assert.deepEqual(j.located, { by: 'device' });
  const byIp = await (await get('?auto=1', { cf: { latitude: '25.0340', longitude: '121.5650', city: 'Taipei' } })).json();
  assert.deepEqual(byIp.located, { by: 'ip', city: 'Taipei' });
  assert.equal(byIp.place.town, '信義區');
  assert.equal((await get('?auto=1', { cf: {} })).status, 404);
});

test('the township list for the picker', async () => {
  const res = await handleWeather(new Request('https://w.example/weather/places'), env, {}, '/weather/places');
  const list = await res.json();
  assert.ok(list.length > 300);
  const xinyi = list.find(([c, t]) => c === '臺北市' && t === '信義區');
  assert.ok(xinyi && Math.abs(xinyi[2] - 25.03) < 0.05);
  assert.equal(list[0][0], '宜蘭縣');
});

test('Google is asked at most GOOGLE_DAILY_CALLS times a day; far hours every 6 hours; then CWA alone', async () => {
  const kv = memKv();
  kv.store.set('weather:google:2026-10-02', String(GOOGLE_DAILY_CALLS));
  const log = [];
  const { resp, sources } = await buildCell({ ...env, RATE_LIMIT_KV: kv }, 25.034, 121.565, { fetchFn: upstream(log), now: NOW });
  assert.equal(sources.google, 'capped');
  assert.ok(!log.some(p => p.startsWith('/v1/')));
  assert.ok(resp.hours.length > 0 && resp.days.length > 0);
  const kv2 = memKv();
  const first = await buildCell({ ...env, RATE_LIMIT_KV: kv2 }, 25.034, 121.565, { fetchFn: upstream(), now: NOW });
  assert.equal(kv2.store.get('weather:google:2026-10-02'), '13');
  const log2 = [];
  const soon = await buildCell({ ...env, RATE_LIMIT_KV: kv2 }, 25.034, 121.565, { fetchFn: upstream(log2), now: NOW + 3_600_000, prev: first });
  assert.equal(log2.filter(p => p.startsWith('/v1/')).length, 4, 'an hour later: near only');
  assert.equal(soon.resp.hours.length, 240, 'the far hours carried over');
  const log3 = [];
  await buildCell({ ...env, RATE_LIMIT_KV: kv2 }, 25.034, 121.565, { fetchFn: upstream(log3), now: NOW + 7 * 3_600_000, prev: soon });
  assert.equal(log3.filter(p => p.startsWith('/v1/')).length, 12, 'after 6 hours: the far ones again');
  // Room for 4 but not 12: near only.
  kv2.store.set('weather:google:2026-10-03', String(GOOGLE_DAILY_CALLS - 5)); // +14 h is the next Taipei day
  const log4 = [];
  await buildCell({ ...env, RATE_LIMIT_KV: kv2 }, 25.034, 121.565, { fetchFn: upstream(log4), now: NOW + 14 * 3_600_000, prev: soon });
  assert.equal(log4.filter(p => p.startsWith('/v1/')).length, 4);
});

test('between Google\'s 30-minute forecast refreshes, only its current conditions are asked again', async () => {
  const kv = memKv();
  const first = await buildCell({ ...env, RATE_LIMIT_KV: kv }, 25.034, 121.565, { fetchFn: upstream(), now: NOW });
  const log = [];
  const quarter = await buildCell({ ...env, RATE_LIMIT_KV: kv }, 25.034, 121.565, { fetchFn: upstream(log), now: NOW + 16 * 60_000, prev: first });
  assert.deepEqual(log.filter(p => p.startsWith('/v1/')).map(p => p.split('/').pop()), ['currentConditions:lookup'], '1 call, not 4');
  assert.equal(kv.store.get('weather:google:2026-10-02'), '14');
  assert.equal(quarter.sources.google, 'ok');
  assert.equal(quarter.resp.hours.length, 240, 'the forecast kept');
  assert.equal(quarter.parts.google.fcAt, NOW, 'the forecast\'s own time kept');
  assert.equal(quarter.parts.google.at, NOW + 16 * 60_000);
  const log2 = [];
  await buildCell({ ...env, RATE_LIMIT_KV: kv }, 25.034, 121.565, { fetchFn: upstream(log2), now: NOW + 31 * 60_000, prev: quarter });
  assert.equal(log2.filter(p => p.startsWith('/v1/')).length, 4, 'past 30 minutes: the forecast again');
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

test('one sentence and the morning brief, from the numbers', async () => {
  const { resp } = await buildCell({ ...env, RATE_LIMIT_KV: memKv() }, 25.034, 121.565, { fetchFn: upstream(), now: NOW });
  assert.match(resp.headline, /^現在陰，/);
  assert.match(resp.headline, /明天最高 \d+°、最低 \d+°。$/, 'evening: tomorrow');
  const morning = NOW + 11 * 3_600_000; // 06:46 the next day
  const b = briefText(resp, morning);
  assert.match(b.title, /^信義區 今天天氣$/);
  assert.match(b.body, /最高 \d+° \/ 最低 \d+°/);
  for (const w of ['Google', 'google', 'CWA', '氣象署']) assert.ok(!b.body.includes(w) && !resp.headline.includes(w));
  const t = h => Date.parse('2026-10-03T00:00:00+08:00') + h * 3_600_000;
  assert.equal(rainPhrase([{ t: t(8), pop: 10 }, { t: t(15), pop: 70 }], t(8)), '15 點起可能下雨（70%）');
  assert.equal(rainPhrase([{ t: t(8), pop: 10 }, { t: t(10), pop: 35 }], t(8)), '10 點前後有機會下雨（35%）');
  assert.equal(rainPhrase([{ t: t(8), pop: 10 }], t(8)), '未來 12 小時不太會下雨');
  assert.equal(rainPhrase([{ t: t(8), pop: 80 }], t(8) + 600_000), '正在或即將下雨（80%）');
});

test('the rain alert answers only when the next 2 hours turn wet', async () => {
  const kv = memKv();
  const e = { ...env, RATE_LIMIT_KV: kv };
  // Tomorrow 13:00 is 41% blended in the fixtures: 12:30 → no alert.
  const at = Date.parse('2026-10-03T12:30:00+08:00');
  await cellForecast(e, null, 25.034, 121.565, { fetchFn: upstream(), now: at - 10 * 60_000 });
  assert.equal(await weatherCheck(e, { lat: 25.034, lon: 121.565, kind: 'rain' }, { fetchFn: upstream(), now: at }), null);
  // The same with a wet hour.
  const entry = JSON.parse(kv.store.get('weather:cell:25.03,121.57'));
  entry.resp.hours.find(h => h.t === Date.parse('2026-10-03T13:00:00+08:00')).pop = 75;
  kv.store.set('weather:cell:25.03,121.57', JSON.stringify(entry));
  const alert = await weatherCheck(e, { lat: 25.034, lon: 121.565, kind: 'rain' }, { fetchFn: upstream(), now: at });
  assert.equal(alert.title, '☂️ 快下雨了');
  assert.match(alert.body, /^信義區 13:00 前後降雨機率 75%/);
  const brief = await weatherCheck(e, { lat: 25.034, lon: 121.565, kind: 'brief' }, { fetchFn: upstream(), now: at });
  assert.match(brief.title, /今天天氣/);
});

test('opened cells are noted for the scoring, at most every 6 hours', async () => {
  const kv = memKv();
  const e = { ...env, RATE_LIMIT_KV: kv };
  let writes = 0;
  const put = kv.put;
  kv.put = async (k, v) => (k === 'weather:recent' && writes++, put(k, v));
  await noteRecent(e, '25.03,121.57', NOW);
  await noteRecent(e, '25.03,121.57', NOW + 3_600_000);
  await noteRecent(e, '24.15,120.68', NOW + 3_600_000);
  assert.equal(writes, 2);
  assert.deepEqual(Object.keys(JSON.parse(kv.store.get('weather:recent'))).sort(), ['24.15,120.68', '25.03,121.57']);
});

test('the place to the township (NLSC), cached; no 村里', async () => {
  const xml = '<townVillageItem><ctyCode>63000</ctyCode><ctyName>臺北市</ctyName><townCode>63000020</townCode><townName>信義區</townName><villageCode>63000020001</villageCode><villageName>西村里</villageName></townVillageItem>';
  assert.deepEqual(parseVillage(xml), { county: '臺北市', town: '信義區' });
  assert.deepEqual(parseVillage('<error/>'), { county: null, town: null });
  const store = new Map();
  const cache = { match: async k => (store.has(k) ? new Response(store.get(k)) : undefined), put: async (k, r) => void store.set(k, await r.text()) };
  const urls = [];
  const fetchFn = async url => (urls.push(url), { ok: true, text: async () => xml });
  assert.deepEqual(await whereIs(25.03412, 121.56456, { fetchFn, cache }), { county: '臺北市', town: '信義區' });
  await whereIs(25.0339, 121.5649, { fetchFn, cache });
  assert.deepEqual(urls, ['https://api.nlsc.gov.tw/other/TownVillagePointQuery1/121.565/25.034'], 'the same ~100 m: cached');
  const e = { ...env, RATE_LIMIT_KV: memKv() };
  const res = await handleWeather(new Request('https://w.example/weather/where?lat=25.034&lon=121.565'), e, {}, '/weather/where', { session: { s: 'x' }, fetchFn, cache });
  assert.equal((await res.json()).village, undefined);
  assert.equal((await handleWeather(new Request('https://w.example/weather/where?lat=25&lon=121'), e, {}, '/weather/where', { fetchFn, cache })).status, 401);
});

test('AQI: each site\'s last 48 hours, and the nearest one\'s in the answer', async () => {
  const sites = fx('moenv-aqi');
  const at = Date.parse('2026-10-02T19:00:00+08:00');
  let hist = addAirReading(null, sites, at);
  assert.deepEqual(hist.sites['松山'][0].slice(0, 1), [at]);
  hist = addAirReading(hist, sites, at);
  assert.equal(hist.sites['松山'].length, 1, 'the same reading once');
  hist = addAirReading(hist, sites.map(s => ({ ...s, publishtime: '2026/10/02 20:00:00', aqi: '50' })), at + 3_600_000);
  assert.equal(hist.sites['松山'].length, 2);
  assert.equal(addAirReading(hist, [], at + 50 * 3_600_000).sites['松山'], undefined, 'older than 48 hours dropped');
  const kv = memKv();
  kv.store.set('weather:aqi:hist', JSON.stringify(hist));
  const { resp } = await buildCell({ ...env, RATE_LIMIT_KV: kv }, 25.034, 121.565, { fetchFn: upstream(), now: NOW + 3_600_000 });
  // The cron's readings (the owner wants no more history than that).
  assert.equal(resp.air.history.length, 2);
  assert.deepEqual(Object.keys(resp.air.history[0]), ['t', 'aqi', 'pm25']);
  assert.deepEqual(parseAirHistory([{ datacreationdate: '2026-10-02 21:00', aqi: '36', 'pm2.5': '12' }, { datacreationdate: '', aqi: '1' }]), [[Date.parse('2026-10-02T21:00:00+08:00'), 36, 12]]);
});

test('air: Google hours pulled toward the station, days blended with MOENV, Google alone past it', () => {
  const now = Date.parse('2026-10-02T12:00:00Z'); // 20:00 Taipei
  const g = Array.from({ length: 60 }, (_, i) => ({ t: now + i * 3_600_000, aqi: 50, pm25: 12 }));
  const air = { aqi: 30, at: now - 3_600_000, forecast: { days: [{ date: '2026-10-02', aqi: 40, main: 'x' }, { date: '2026-10-03', aqi: 70, main: 'y' }] } };
  const fc = airForecast(air, g, now);
  assert.equal(fc.hours.length, 60);
  assert.ok(fc.hours[0].aqi < 40, 'starts near the station (30), not Google (50)');
  assert.ok(fc.hours[59].aqi >= 48, 'fades back to Google');
  const day = Object.fromEntries(fc.days.map(d => [d.date, d.aqi]));
  assert.equal(day['2026-10-02'], 40, 'a 4-hour evening: MOENV alone');
  assert.ok(day['2026-10-03'] > 50 && day['2026-10-03'] < 70, 'both: blended');
  assert.equal(day['2026-10-04'], 50, 'Google alone');
  // No Google: MOENV's days as they are.
  assert.deepEqual(airForecast(air, null, now).days.map(d => d.aqi), [40, 70]);
});

test('Google air hours: Taiwan AQI only', () => {
  const j = { hourlyForecasts: [{ dateTime: '2026-10-02T12:00:00Z', indexes: [{ code: 'uaqi', aqi: 70 }, { code: 'twn_epa', aqi: 41 }], pollutants: [{ code: 'pm25', concentration: { value: 9.84 } }] }, { dateTime: '2026-10-02T13:00:00Z', indexes: [{ code: 'uaqi', aqi: 70 }] }] };
  assert.deepEqual(parseGoogleAir(j), [{ t: Date.parse('2026-10-02T12:00:00Z'), aqi: 41, pm25: 9.8 }]);
  const b = googleAirBody(25, 121, Date.parse('2026-10-02T11:46:00Z'));
  assert.equal(b.period.startTime, '2026-10-02T12:00:00.000Z');
  assert.deepEqual(b.customLocalAqis, [{ regionCode: 'tw', aqi: 'twn_epa' }]);
});

test('advice for the week: each kind with a sentence and a mark a day', () => {
  const at = Date.parse('2026-10-03T07:00:00+08:00');
  const hours = Array.from({ length: 24 }, (_, h) => ({ t: Date.parse(`2026-10-03T${String(h).padStart(2, '0')}:00:00+08:00`), temp: 26, feels: 27, uv: 0, pop: 10 }));
  const day = (date, o) => ({ date, hi: 30, lo: 24, feelsHi: 31, feelsLo: 25, pop: 10, uvMax: 5, day: { condition: { code: 'CLOUDY' } }, ...o });
  const days = [
    day('2026-10-03'),
    day('2026-10-04', { pop: 60 }),
    day('2026-10-05', { pop: 35, uvMax: 9 }),
    day('2026-10-06', { hi: 22, lo: 16, feelsHi: 21, feelsLo: 14 }),
    day('2026-10-07', { feelsHi: 36 }),
    day('2026-10-08'),
    day('2026-10-09'),
    day('2026-10-10')
  ];
  const air = { aqi: 40, forecast: { days: [{ date: '2026-10-03', aqi: 45 }, { date: '2026-10-04', aqi: 120 }] } };
  const k = Object.fromEntries(advise({ hours, days, air }, at).map(a => [a.kind, a]));
  assert.equal(k.umbrella.week.text, '週日要帶傘；週一可能有雨');
  assert.equal(k.umbrella.level, 'none', 'nothing today, the week still says');
  assert.equal(k.umbrella.week.days.length, 7);
  assert.deepEqual(k.umbrella.week.days.slice(0, 3).map(d => d.mark), [null, 'yes', 'maybe']);
  assert.match(k.sun.week.text, /週一最強（UV 9 過量）/);
  assert.match(k.wear.week.text, /週二起轉涼，薄外套/);
  assert.equal(k.heat.week.text, '週三體感超過 34°，多喝水');
  assert.equal(k.mask.week.text, '週日空氣差，戴口罩');
  assert.ok(k.week.week.days.some(d => d.mark === 'good'));
});

test('far hours: a failing page is tried again, a partial set kept and asked again in 30 minutes', async () => {
  const kv = memKv();
  const first = await buildCell({ ...env, RATE_LIMIT_KV: kv }, 25.034, 121.565, { fetchFn: upstream([], { failPages: [6] }), now: NOW });
  assert.equal(first.parts.far.partial, true);
  assert.match(first.parts.far.error, /page 6/);
  assert.equal(first.resp.hours.length, 120, '5 pages of 24');
  const log = [];
  const later = await buildCell({ ...env, RATE_LIMIT_KV: kv }, 25.034, 121.565, { fetchFn: upstream(log), now: NOW + 31 * 60_000, prev: first });
  assert.ok(log.some(p => p.endsWith('#p10')), 'asked again after 30 minutes');
  assert.equal(later.resp.hours.length, 240);
  assert.ok(!later.parts.far.partial);
  // A failing page once: the retry gets it.
  let n = 0;
  const flaky = upstream();
  const once = async (url, init) => (url.includes('pageToken=p4') && !n++ ? { ok: false, status: 503, text: async () => 'x' } : flaky(url, init));
  const ok = await buildCell({ ...env, RATE_LIMIT_KV: memKv() }, 25.034, 121.565, { fetchFn: once, now: NOW });
  assert.equal(ok.resp.hours.length, 240);
});

test('advice for daily life: commute, the best hours outside, laundry, the window, sleep, the car', () => {
  const at = Date.parse('2026-10-03T06:30:00+08:00');
  const hour = (d, h, o) => ({ t: Date.parse(`${d}T${String(h).padStart(2, '0')}:00:00+08:00`), temp: 24, feels: 24, uv: 2, pop: 10, humidity: 70, ...o });
  const hours = [...Array.from({ length: 24 }, (_, h) => hour('2026-10-03', h)), ...Array.from({ length: 24 }, (_, h) => hour('2026-10-04', h, { feels: 29 }))];
  hours[18] = hour('2026-10-03', 18, { pop: 65 });
  for (const h of [10, 11, 12, 13, 14]) hours[h] = hour('2026-10-03', h, { feels: 33, uv: 9 });
  const day = (date, o) => ({ date, hi: 28, lo: 23, pop: 10, uvMax: 5, day: { condition: { code: 'PARTLY_CLOUDY' } }, ...o });
  const days = [day('2026-10-03', { pop: 65 }), day('2026-10-04'), day('2026-10-05'), day('2026-10-06'), day('2026-10-07')];
  const k = Object.fromEntries(advise({ hours, days, air: { aqi: 30, level: '良好' } }, at).map(a => [a.kind, a]));
  assert.equal(k.commute.text, '通勤：早上乾爽，傍晚 65% 會下雨');
  assert.equal(k.commute.level, 'yes');
  assert.match(k.run.text, /^跑步：今天 (5|6|7|8|15|16|17|18)–\d+時（24°）；明天 \d+–\d+時/);
  assert.ok(!/今天 1[0-4]–/.test(k.run.text), 'not in the hot hours');
  assert.equal(k.run.week.days[0].v.endsWith('時'), true);
  assert.equal(k.laundry.text, '曬衣：明天、10/5、10/6、10/7（9–16時）'.replace('10/5', '週一').replace('10/6', '週二').replace('10/7', '週三'));
  assert.equal(k.weekend.text, '週末：週日較好（28°，雨 10%）');
  assert.equal(k.laundry.week.days[0].mark, 'bad');
  assert.equal(k.window.text, '開窗：空氣好，可通風');
  assert.equal(k.sleep.text, '睡覺：今晚 28°，開冷氣', 'tonight: 23–5 時, into the 4th');
  assert.equal(k.carwash.text, '洗車：3 天不下雨');
  // Bad air: close the window; rain ahead: no car wash.
  const k2 = Object.fromEntries(advise({ hours, days: days.map(d => ({ ...d, pop: 60 })), air: { aqi: 130, level: '對敏感族群不健康' } }, at).map(a => [a.kind, a]));
  assert.equal(k2.window.text, '開窗：空氣差，關窗');
  assert.ok(!k2.carwash);
  assert.equal(k2.laundry.text, '曬衣：這週用烘乾');
});

test('advice: damp, a drop in the lows, strong wind, thunder, fog', () => {
  const at = Date.parse('2026-10-03T06:30:00+08:00');
  const hour = (h, o) => ({ t: Date.parse(`2026-10-03T${String(h).padStart(2, '0')}:00:00+08:00`), temp: 24, feels: 24, uv: 2, pop: 10, humidity: 92, wind: { gust: 20 }, thunder: 10, vis: 10, ...o });
  const hours = Array.from({ length: 24 }, (_, h) => hour(h));
  hours[15] = hour(15, { thunder: 60, wind: { gust: 62 } });
  hours[16] = hour(16, { thunder: 50 });
  hours[7] = hour(7, { vis: 0.8 });
  const days = [{ date: '2026-10-03', hi: 28, lo: 22, pop: 10 }, { date: '2026-10-04', hi: 22, lo: 16, pop: 10 }];
  const k = Object.fromEntries(advise({ hours, days, air: null }, at).map(a => [a.kind, a]));
  assert.equal(k.humid.text, '除濕：濕度 92%，衣物易潮');
  assert.equal(k.temp.text, '降溫：明早 16°，比今天低 6°');
  assert.equal(k.wind.text, '強風：15時陣風 62 km/h，收好陽台');
  assert.equal(k.thunder.text, '雷雨：15–17時可能打雷，避開戶外');
  assert.equal(k.fog.text, '起霧：7時能見度 0.8 公里，開車小心');
});

test("a rain chance in steps of 10: Google's 5% and CWA's 0% read 0%, not 3%", () => {
  assert.deepEqual([0, 3, 4, 5, 14, 15, 28, 96, 100].map(popStep), [0, 0, 0, 10, 10, 20, 30, 100, 100]);
  assert.equal(popStep(null), null);
  assert.equal(popStep(undefined), null);
});

test("kept answers go to Cloudflare's cache, and to KV at most hourly", async () => {
  const store = new Map();
  globalThis.caches = { default: { match: async k => (store.has(k) ? new Response(store.get(k)) : undefined), put: async (k, r) => void store.set(k, await r.text()) } };
  try {
    const kv = memKv();
    const e = { ...env, RATE_LIMIT_KV: kv };
    const first = await keepJson(e, 'weather:cell:x', { at: NOW, v: 1 }, 3600, null);
    assert.equal(first.kvAt, NOW);
    assert.equal(JSON.parse(kv.store.get('weather:cell:x')).v, 1);
    const second = await keepJson(e, 'weather:cell:x', { at: NOW + 15 * 60_000, v: 2 }, 3600, first);
    assert.equal(JSON.parse(kv.store.get('weather:cell:x')).v, 1, 'KV not written again within the hour');
    assert.equal((await keptJson(e, 'weather:cell:x')).v, 2, 'the cache has the new one');
    await keepJson(e, 'weather:cell:x', { at: NOW + KV_EVERY_MS, v: 3 }, 3600, second);
    assert.equal(JSON.parse(kv.store.get('weather:cell:x')).v, 3, 'an hour on: KV again');
    store.clear();
    assert.equal((await keptJson(e, 'weather:cell:x')).v, 3, 'an emptied cache falls back to KV');
  } finally {
    delete globalThis.caches;
  }
});
