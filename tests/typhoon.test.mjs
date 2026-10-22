// Orbit Weather's typhoon day off (typhoon.js): CWA's warning from NCDR's
// feed (a real one, 薔琵, 2026-10-22 08:30), the 人事行政總處 page, and the
// chance from the 停班停課 rule.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { NEIGHBOURS, parseTrack, stormAt, circleEdge, offOf, feedTyphoon, parseTyphoonCap, parseLamps, parseDgpa, officialLines, dayOffChance, dayOffFor, circleReaches, beaufortKmh, targetDay, readTyphoon, readDgpa, readSeatRain, DGPA_NDS } from '../typhoon.js';

const raw = name => readFileSync(new URL(`./fixtures/typhoon/${name}`, import.meta.url), 'utf8');
const NOW = Date.parse('2026-10-22T02:10:00Z'); // 10:10 in Taiwan
const HOUR = 3_600_000;
const HSINCHU = { lat: 24.8, lon: 120.97 };
// A land warning: the same storm, its land areas filled in.
const landCap = () => raw('warning-sea.cap').replace('<headline>海上颱風警報</headline>', '<headline>海上陸上颱風警報</headline>').replace('海上：巴士海峽', '陸上：臺東縣、屏東縣、新竹市。海上：巴士海峽');

test('the newest typhoon warning in the feed, and its CAP', () => {
  const hit = feedTyphoon(raw('feed.xml'));
  assert.match(hit.href, /^https:\/\/alerts\.ncdr\.nat\.gov\.tw\/Capstorage\/CWA\/.+typhoon-warning.+\.cap$/);
  assert.equal(feedTyphoon('<feed><entry><id>x</id><title>強風</title><category term="強風" /></entry></feed>'), null);
  // A test message is never a warning.
  assert.equal(feedTyphoon(raw('feed.xml').replace('<cap:status>Actual</cap:status>', '<cap:status>Test</cap:status>')), null);
  const ty = parseTyphoonCap(raw('warning-sea.cap'), NOW);
  assert.equal(ty.name, '薔琵');
  assert.equal(ty.nameEn, 'CHAMPI');
  assert.equal(ty.warning, '海上颱風警報');
  assert.deepEqual(ty.land, []);
  assert.equal(ty.track.length, 2);
  assert.deepEqual(ty.track[0], { t: Date.parse('2026-10-22T00:00:00Z'), lat: 20.3, lon: 126, r7: 300, v: 51 });
  assert.deepEqual(ty.lamps['臺中市'], [{ dom: 22, wind: 9, gust: 11 }]);
  assert.deepEqual(ty.lamps['新竹市'], [{ dom: 22, wind: 6, gust: 8 }]);
  assert.deepEqual(parseTyphoonCap(landCap(), NOW).land, ['新竹市', '屏東縣', '臺東縣']);
  // The land warning three hours on (11:24): its areas, short names in its words.
  const land = parseTyphoonCap(raw('warning-land.cap'), NOW);
  assert.equal(land.warning, '海上陸上颱風警報');
  assert.deepEqual(land.land, ['屏東縣', '宜蘭縣', '花蓮縣', '臺東縣']);
  assert.equal(land.track[0].r7, 320);
  // One lamp sentence for both days.
  assert.deepEqual(land.lamps['臺中市'].map(x => x.dom), [22, 23]);
  assert.equal(parseTyphoonCap(raw('warning-sea.cap').replace('<msgType>Update</msgType>', '<msgType>Cancel</msgType>'), NOW), null);
});

test('lamps carry their day to the sentences after', () => {
  const l = parseLamps('今(22)日臺中市局部地區有平均風9級以上或陣風11級以上發生的機率(橙色燈號)，基隆市局部地區有平均風6級以上或陣風8級以上發生的機率(黃色燈號)；明(23)日台北市局部地區有平均風10級以上或陣風12級以上發生的機率(紅色燈號)。');
  assert.deepEqual(l['基隆市'], [{ dom: 22, wind: 6, gust: 8 }]);
  assert.deepEqual(l['臺北市'], [{ dom: 23, wind: 10, gust: 12 }]);
});

test('the 人事行政總處 page, county by county', () => {
  const d = parseDgpa(raw('dgpa.html'));
  assert.equal(d.at, Date.parse('2026-10-22T21:05:12+08:00'));
  assert.equal(d.counties['臺北市'], '明天停止上班、停止上課。');
  assert.equal(d.counties['新竹市'], '今天照常上班、照常上課。 明天停止上課。');
  assert.match(d.counties['臺東縣'], /^蘭嶼鄉:明天停止上班、停止上課。 綠島鄉:明天停止上班、停止上課。 ?(備註：?)?$/);
  assert.equal(officialLines(d.counties['臺東縣']).length, 2);
  // Every way the page words it (from its archive, 2019–2026).
  const say = { '今天停止上班、停止上課': 'all', '明天已達停止上班及上課標準': 'all', '今天未達停止上班及上課標準': 'open', '今天未達停止上班、已達停止上課標準': 'class', '今天照常上班、停止上課': 'class', '12:00起停止上班、停止上課': 'all', '尚未列入警戒區': 'open', '尚未宣布消息': 'wait', '今天照常上班、照常上課': 'open' };
  for (const [t, off] of Object.entries(say)) assert.equal(offOf(t), off, t);
  assert.equal(officialLines('綠島鄉:今天下午停止上班、停止上課。 4.適用範圍為各級政府機關，其尚無停止上班之適用').length, 1);
  assert.deepEqual(parseDgpa('<table><tr><td>縣市名稱</td></tr><tr><td>無停班停課訊息。</td></tr></table>').counties, {});
  assert.deepEqual(officialLines('今天照常上班、照常上課。 明天停止上課。'), [{ text: '今天照常上班、照常上課', off: 'open' }, { text: '明天停止上課', off: 'class' }]);
});

test('the chance: the fitted curve, smooth, 1–99', () => {
  assert.equal(beaufortKmh(61), 7);
  assert.equal(beaufortKmh(89), 10);
  // Cases from the archive it was fitted on: 康芮 2024-10-31 over 臺北 (closed),
  // 山陀兒 2024-10-02 at 高雄 (closed; the model said 41%).
  assert.equal(dayOffChance({ edge: -352.5, islandEdge: -528.7, vmax: 25.7, gust: 29.4, mm: 258 }), 92);
  assert.equal(dayOffChance({ edge: -179.8, islandEdge: -179.8, vmax: 46.3, gust: 17.4, mm: 120.5 }), 41);
  // Its neighbours (臺南市, 屏東縣) both closed: near certain; both open: low.
  assert.ok(dayOffChance({ edge: -179.8, islandEdge: -179.8, vmax: 46.3, gust: 17.4, mm: 120.5 }, { closed: 2, open: 0, of: 2 }) >= 90);
  assert.ok(dayOffChance({ edge: -179.8, islandEdge: -179.8, vmax: 46.3, gust: 17.4, mm: 120.5 }, { closed: 0, open: 2, of: 2 }) <= 10);
  assert.deepEqual(NEIGHBOURS['高雄市'], ['臺南市', '屏東縣']);
  // A storm far off, a breezy day: next to nothing.
  assert.ok(dayOffChance({ edge: 500, islandEdge: 450, vmax: 40, gust: 12, mm: 5 }) <= 2);
  // Every input moves it a little (no steps).
  const base = { edge: 50, islandEdge: 0, vmax: 40, gust: 20, mm: 80 };
  const p0 = dayOffChance(base);
  assert.ok(dayOffChance({ ...base, gust: 24 }) > p0);
  assert.ok(dayOffChance({ ...base, mm: 200 }) > p0);
  assert.ok(dayOffChance({ ...base, edge: -100 }) > p0);
  assert.ok(dayOffChance({ edge: -900, islandEdge: -900, vmax: 70, gust: 60, mm: 900 }) === 99);
});

test('the day asked about and the storm circle', () => {
  assert.equal(targetDay(Date.parse('2026-10-22T01:00:00Z')), '2026-10-22'); // 09:00
  assert.equal(targetDay(NOW), '2026-10-23');
  const track = [{ t: 0, lat: 22, lon: 124, r7: 300 }, { t: 10 * HOUR, lat: 24.8, lon: 121.5, r7: 250 }];
  assert.equal(circleReaches(track, HSINCHU, 0, 2 * HOUR), false);
  assert.equal(circleReaches(track, HSINCHU, 0, 10 * HOUR), true);
  // Past the track: on at its last pace for a day, then unknown.
  assert.ok(stormAt(track, 15 * HOUR).lat > 24.8);
  assert.equal(stormAt(track, 40 * HOUR), null);
  assert.ok(circleEdge(track, HSINCHU, 0, 10 * HOUR).edge < 0);
});

test('a county: the official word first, else one chance for the whole county', () => {
  const ty = parseTyphoonCap(raw('warning-sea.cap'), NOW);
  const dg = parseDgpa(raw('dgpa.html'));
  const off = dayOffFor('台北市', ty, dg, NOW);
  assert.deepEqual(off.official.lines, [{ text: '明天停止上班、停止上課', off: 'all' }]);
  assert.equal(off.chance, undefined);
  // 新竹市 named nothing for tomorrow on a quiet page: the chance.
  // (The storm held where it is now, far out at sea; a dry day.)
  const far = { ...ty, track: ty.track.slice(0, 1) };
  const dry = { 新竹市: { '2026-10-23': 0 } };
  const calm = dayOffFor('新竹市', far, { counties: {} }, NOW, dry);
  assert.equal(calm.date, '2026-10-23');
  assert.equal(calm.name, '薔琵');
  assert.deepEqual(calm.why, { wind: null, gust: null, mm: 0, land: false, reach: false });
  assert.ok(calm.chance <= 2, calm.chance);
  // Under a land warning, the circle over it, 10級 gusts in the lamps and heavy rain tomorrow: high.
  const near = { ...parseTyphoonCap(landCap(), NOW), lamps: { 新竹市: [{ dom: 23, wind: 7, gust: 10 }] } };
  near.track = [{ t: NOW, lat: 23.5, lon: 122.5, r7: 250, v: 45 }, { t: NOW + 30 * HOUR, lat: 24.9, lon: 121.0, r7: 250, v: 40 }];
  const wild = dayOffFor('新竹市', near, null, NOW, { 新竹市: { '2026-10-23': 150 } });
  assert.equal(wild.why.land, true);
  assert.equal(wild.why.reach, true);
  assert.equal(wild.why.gust, 10);
  assert.ok(wild.chance >= 80, wild.chance);
  // The lamps' gusts count.
  const lamped = dayOffFor('新竹市', { ...far, lamps: { 新竹市: [{ dom: 23, wind: 9, gust: 11 }] } }, null, NOW, dry);
  assert.equal(lamped.why.gust, 11);
  assert.ok(lamped.chance > calm.chance);
  // CWA's rain warning for the day floors the forecast's rain.
  const warn = { records: { location: [{ locationName: '新竹市', hazardConditions: { hazards: [{ info: { phenomena: '豪雨', significance: '特報' }, validTime: { startTime: '2026-10-23 05:00:00', endTime: '2026-10-23 20:00:00' } }] } }] } };
  assert.equal(dayOffFor('新竹市', far, null, NOW, dry, warn).why.mm, 200);
  // 尚未宣布消息 for the county: still the chance; a few towns' decisions go under it.
  const pending = dayOffFor('臺東縣', far, { at: 1, counties: { 臺東縣: '尚未宣布消息。 綠島鄉:今天下午停止上班、停止上課。' } }, NOW);
  assert.equal(typeof pending.chance, 'number');
  assert.deepEqual(pending.local.lines, [{ text: '綠島鄉:今天下午停止上班、停止上課', off: 'all' }]);
  assert.equal(dayOffFor('新竹市', far, { counties: { 新竹市: '尚未宣布消息' } }, NOW).official, undefined);
  // Neighbours deciding the day move it: closed up, open down; another day's
  // word for the county itself goes under the chance.
  const page = counties => ({ at: Date.parse('2026-10-22T20:00:00+08:00'), counties });
  const alone = dayOffFor('新竹市', ty, page({}), NOW).chance;
  const shut = dayOffFor('新竹市', ty, page({ 新竹縣: '明天停止上班、停止上課。', 桃園市: '明天停止上班、停止上課。', 苗栗縣: '明天停止上班、停止上課。' }), NOW);
  const open = dayOffFor('新竹市', ty, page({ 新竹縣: '明天照常上班、照常上課。', 桃園市: '明天照常上班、照常上課。' }), NOW);
  assert.ok(shut.chance > alone + 10, `${shut.chance} vs ${alone}`);
  assert.equal(shut.why.nearClosed, 3);
  assert.ok(open.chance < alone, `${open.chance} vs ${alone}`);
  const today = dayOffFor('新竹市', ty, page({ 新竹市: '今天照常上班、照常上課。' }), NOW);
  assert.equal(typeof today.chance, 'number');
  assert.deepEqual(today.local.lines, [{ text: '今天照常上班、照常上課', off: 'open' }]);
  // No rain forecast and no lamp: left out, not read as calm and dry.
  const blind = dayOffFor('新竹縣', ty, null, NOW);
  assert.equal(blind.why.mm, null);
  assert.equal(blind.why.gust, null);
  assert.ok(blind.chance > dayOffChance({ edge: 0, islandEdge: 0, vmax: 51, gust: 0, mm: 0 }), `${blind.chance}`);
  // On its own forecast track (heading this way) the circle reaches 新竹 tomorrow.
  assert.equal(dayOffFor('新竹市', ty, null, NOW).why.reach, true);
  // No warning, or abroad: nothing.
  assert.equal(dayOffFor('新竹市', null, null, NOW), null);
  assert.equal(dayOffFor(null, ty, null, NOW), null);
});

test("the seats' rain: MET Norway's by Taiwan day, else Open-Meteo's in one ask", async () => {
  const hour = (time, mm, k = 'next_1_hours') => ({ time, data: { [k]: { details: { precipitation_amount: mm } } } });
  const met = { properties: { timeseries: [hour('2026-10-22T15:00:00Z', 2), hour('2026-10-22T16:00:00Z', 3), hour('2026-10-23T12:00:00Z', 6, 'next_6_hours'), hour('2026-10-23T15:00:00Z', 9, 'next_6_hours'), hour('2026-10-23T18:00:00Z', 1, 'next_6_hours')] } };
  const ok = j => ({ ok: true, json: async () => j });
  const rain = await readSeatRain(async () => ok(met));
  assert.equal(Object.keys(rain).length, 22);
  // 15:00Z is 23:00 the 22nd in Taiwan; the 6-hourly ones overlapping a counted span are skipped.
  assert.deepEqual(rain['基隆市'], { '2026-10-22': 2, '2026-10-23': 9, '2026-10-24': 1 });
  let asked = 0;
  const fallback = async url => {
    if (url.includes('met.no')) return { ok: false, status: 503 };
    asked++;
    const n = new URL(url).searchParams.get('latitude').split(',').length;
    return ok(Array.from({ length: n }, (_, i) => ({ daily: { time: ['2026-10-22', '2026-10-23'], precipitation_sum: [i, 10 + i] } })));
  };
  assert.equal((await readSeatRain(fallback))['基隆市']['2026-10-23'], 10);
  assert.equal(asked, 1);
  await assert.rejects(readSeatRain(async url => (url.includes('met.no') ? { ok: false, status: 503 } : ok([]))));
});

test("CWA's track forecast: five days of the storm, its circle and strength", () => {
  const ty = parseTyphoonCap(raw('warning-land.cap'), NOW);
  const track = parseTrack(JSON.parse(raw('track.json')), ty);
  assert.deepEqual(track[0], { t: Date.parse('2026-10-22T11:00:00+08:00'), lat: 20.6, lon: 125.7, r7: 320, v: 51 });
  assert.deepEqual(track[5], { t: Date.parse('2026-10-23T23:00:00+08:00'), lat: 24.4, lon: 122.4, r7: 300, v: 43 });
  assert.equal(parseTrack(JSON.parse(raw('track.json')), { name: '別的', nameEn: 'OTHER' }), null);
  // Tomorrow along it: 宜蘭 inside the circle, 金門 far outside.
  const day = [Date.parse('2026-10-23T00:00:00+08:00'), Date.parse('2026-10-24T00:00:00+08:00')];
  assert.ok(circleEdge(track, { lat: 24.73, lon: 121.76 }, ...day).edge < -100);
  assert.ok(circleEdge(track, { lat: 24.44, lon: 118.32 }, ...day).edge > 100);
});

test('reads: the CAP only from NCDR, the page through the relay', async () => {
  const seen = [];
  const res = body => ({ ok: true, status: 200, headers: new Headers({ 'content-type': 'text/xml; charset=utf-8' }), arrayBuffer: async () => new TextEncoder().encode(body).buffer });
  const fetchFn = async url => (seen.push(url), res(url.includes('RssAtomFeed') ? raw('feed.xml') : raw('warning-sea.cap')));
  assert.equal((await readTyphoon(fetchFn, NOW)).name, '薔琵');
  assert.equal(seen.length, 2);
  // With CWA's track: five days of it; a track that won't read keeps the warning's.
  const withTrack = async url => (url.includes('W-C0034-005') ? res(raw('track.json').replace('薔琵', '薔琵')) : fetchFn(url));
  assert.equal((await readTyphoon(withTrack, NOW, 'https://opendata.cwa.gov.tw/api/v1/rest/datastore/W-C0034-005?x')).track.length, 9);
  const broken = async url => (url.includes('W-C0034-005') ? res('nope') : fetchFn(url));
  assert.equal((await readTyphoon(broken, NOW, 'https://opendata.cwa.gov.tw/api/v1/rest/datastore/W-C0034-005?x')).track.length, 2);
  const elsewhere = async url => res(url.includes('RssAtomFeed') ? raw('feed.xml').replace(/https:\/\/alerts\.ncdr\.nat\.gov\.tw\/Capstorage/, 'https://evil.example/Capstorage') : '');
  assert.equal(await readTyphoon(elsewhere, NOW), null);
  // Long past its end, unrenewed: over.
  assert.equal(await readTyphoon(fetchFn, Date.parse('2026-10-23T00:00:00Z')), null);
  const relayed = [];
  const env = { GEMINI_RELAY: { fetch: async url => (relayed.push(url), res(raw('dgpa.html'))) } };
  assert.equal((await readDgpa(env, fetchFn)).counties['臺北市'], '明天停止上班、停止上課。');
  assert.equal(relayed[0], `https://gemini-relay/?to=${encodeURIComponent(DGPA_NDS)}`);
});

test('without Google: the sun worked out, and 體感 from the station', async () => {
  const { sunUp, apparentTemp } = await import('../weather.js');
  assert.equal(sunUp(24.83, 121.01, Date.parse('2026-10-22T11:17:00Z')), false); // 19:17
  assert.equal(sunUp(24.83, 121.01, Date.parse('2026-10-22T04:00:00Z')), true);
  assert.equal(apparentTemp(21.7, 88, 9.7), 23.3);
  assert.equal(apparentTemp(21.7, null, 9.7), null);
});

test("without Google: CWA's hours fill the word, wind and dew point", async () => {
  const { assemble, parseCwaTown, dewPoint } = await import('../weather.js');
  const read = n => JSON.parse(readFileSync(new URL(`./fixtures/weather/${n}`, import.meta.url), 'utf8'));
  const fc = parseCwaTown(read('cwa-town-3d.json'), read('cwa-town-1w.json'));
  const t0 = Date.parse('2026-10-02T19:00:00+08:00');
  const { resp } = assemble({ cell: '25.03,121.56', now: t0, google: null, cwa: { county: '臺北市', town: '信義區', forecast: fc, station: { name: 'x', km: 1, temp: 27, humidity: 85, wind: { dir: 40, speed: 20, gust: null }, at: t0, vis: 21 } }, air: null, warnings: [] });
  const h = resp.hours[0];
  assert.equal(h.condition.text, '短暫陣雨');
  assert.equal(h.wind.dir, 90);
  assert.equal(h.day, false);
  assert.ok(h.dew != null);
  assert.equal(resp.now.vis, 21);
  assert.equal(resp.now.dew, dewPoint(27, 85));
  assert.ok(resp.days[0].day.condition.text);
});
