// Orbit Weather's typhoon day off (typhoon.js): CWA's warning from NCDR's
// feed (a real one, 薔琵, 2026-10-22 08:30), the 人事行政總處 page, and the
// chance from the 停班停課 rule.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseTrack, stormAt, circleEdge, offOf, feedTyphoon, parseTyphoonCap, parseLamps, parseDgpa, officialLines, dayOffChance, dayOffFor, circleReaches, beaufortKmh, targetDay, readTyphoon, readDgpa, DGPA_NDS } from '../typhoon.js';

const raw = name => readFileSync(new URL(`./fixtures/typhoon/${name}`, import.meta.url), 'utf8');
const NOW = Date.parse('2026-10-22T02:10:00Z'); // 10:10 in Taiwan
const HOUR = 3_600_000;
const HSINCHU = { lat: 24.8, lon: 120.97 };
// A land warning: the same storm, its land areas filled in.
const landCap = () => raw('warning-sea.cap').replace('<headline>海上颱風警報</headline>', '<headline>海上陸上颱風警報</headline>').replace('海上：巴士海峽', '陸上：臺東縣、屏東縣、新竹市。海上：巴士海峽');
const hours = (from, n, h) => Array.from({ length: n }, (_, i) => ({ t: from + i * HOUR, mm: 0, wind: { speed: 20, gust: 30 }, ...h }));
const place = (county, extra) => ({ place: { county, town: '東區' }, hours: hours(Date.parse('2026-10-22T02:00:00Z'), 48, extra) });

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

test('a place: the official word first, else the chance with its reasons', () => {
  const ty = parseTyphoonCap(raw('warning-sea.cap'), NOW);
  const dg = parseDgpa(raw('dgpa.html'));
  const off = dayOffFor(place('台北市'), ty, dg, NOW, HSINCHU);
  assert.deepEqual(off.official.lines, [{ text: '明天停止上班、停止上課', off: 'all' }]);
  assert.equal(off.chance, undefined);
  // 新竹市 named nothing for tomorrow on a quiet page: the chance.
  // (The storm held where it is now, far out at sea.)
  const far = { ...ty, track: ty.track.slice(0, 1) };
  const calm = dayOffFor(place('新竹市'), far, { counties: {} }, NOW, HSINCHU);
  assert.equal(calm.date, '2026-10-23');
  assert.equal(calm.name, '薔琵');
  assert.deepEqual(calm.why, { wind: 4, gust: 5, mm: 0, land: false, reach: false });
  assert.ok(calm.chance <= 2, calm.chance);
  // Under a land warning, the circle over it, gusts of 10級 and heavy rain tomorrow: high.
  const near = { ...parseTyphoonCap(landCap(), NOW) };
  near.track = [{ t: NOW, lat: 23.5, lon: 122.5, r7: 250, v: 45 }, { t: NOW + 30 * HOUR, lat: 24.9, lon: 121.0, r7: 250, v: 40 }];
  const wild = dayOffFor(place('新竹市', { wind: { speed: 63, gust: 95 }, mm: 12 }), near, null, NOW, HSINCHU);
  assert.equal(wild.why.land, true);
  assert.equal(wild.why.reach, true);
  assert.equal(wild.why.gust, 10);
  assert.ok(wild.chance >= 80, wild.chance);
  // The lamps' gusts count when CWA says more than the forecast.
  const lamped = dayOffFor(place('新竹市'), { ...far, lamps: { 新竹市: [{ dom: 23, wind: 9, gust: 11 }] } }, null, NOW, HSINCHU);
  assert.equal(lamped.why.gust, 11);
  assert.ok(lamped.chance > calm.chance);
  // On its own forecast track (heading this way) the circle reaches 新竹 tomorrow.
  assert.equal(dayOffFor(place('新竹市'), ty, null, NOW, HSINCHU).why.reach, true);
  // No warning, or abroad: nothing.
  assert.equal(dayOffFor(place('新竹市'), null, null, NOW), null);
  assert.equal(dayOffFor(place(null), ty, null, NOW), null);
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
