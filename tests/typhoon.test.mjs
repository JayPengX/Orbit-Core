// Orbit Weather's typhoon day off (typhoon.js): CWA's warning from NCDR's
// feed (a real one, 薔琵, 2026-10-22 08:30), the 人事行政總處 page, and the
// chance from the 停班停課 rule.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { feedTyphoon, parseTyphoonCap, parseLamps, parseDgpa, officialLines, dayOffChance, dayOffFor, circleReaches, beaufortKmh, targetDay, readTyphoon, readDgpa, DGPA_NDS } from '../typhoon.js';

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
  assert.deepEqual(ty.track[0], { t: Date.parse('2026-10-22T00:00:00Z'), lat: 20.3, lon: 126, r7: 300 });
  assert.deepEqual(ty.lamps['臺中市'], [{ dom: 22, wind: 9, gust: 11 }]);
  assert.deepEqual(ty.lamps['新竹市'], [{ dom: 22, wind: 6, gust: 8 }]);
  assert.deepEqual(parseTyphoonCap(landCap(), NOW).land, ['新竹市', '屏東縣', '臺東縣']);
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
  assert.match(d.counties['臺東縣'], /^蘭嶼鄉:明天停止上班、停止上課。 綠島鄉/);
  assert.deepEqual(parseDgpa('<table><tr><td>縣市名稱</td></tr><tr><td>無停班停課訊息。</td></tr></table>').counties, {});
  assert.deepEqual(officialLines('今天照常上班、照常上課。 明天停止上課。'), [{ text: '今天照常上班、照常上課', off: null }, { text: '明天停止上課', off: 'class' }]);
});

test('the chance follows the rule: the bar, the circle, the warning', () => {
  assert.equal(beaufortKmh(61), 7);
  assert.equal(beaufortKmh(89), 10);
  assert.equal(beaufortKmh(40), 6);
  // Calm, far: the floor.
  assert.equal(dayOffChance({ wind: 3, gust: 5, mm: 10, land: false, reach: false }), 5);
  // Gusts at the bar without a land warning: still capped.
  assert.equal(dayOffChance({ wind: 7, gust: 10, mm: 50, land: false, reach: false }), 25);
  // The same under the warning: likely.
  assert.ok(dayOffChance({ wind: 7, gust: 10, mm: 50, land: true, reach: true }) >= 70);
  // Rain alone can do it.
  assert.ok(dayOffChance({ wind: 4, gust: 6, mm: 400, land: true, reach: false }) >= 80);
  // Never 0 or 100.
  assert.equal(dayOffChance({ wind: 12, gust: 12, mm: 900, land: true, reach: true }), 95);
});

test('the day asked about and the storm circle', () => {
  assert.equal(targetDay(Date.parse('2026-10-22T01:00:00Z')), '2026-10-22'); // 09:00
  assert.equal(targetDay(NOW), '2026-10-23');
  const track = [{ t: 0, lat: 22, lon: 124, r7: 300 }, { t: 10 * HOUR, lat: 24.8, lon: 121.5, r7: 250 }];
  assert.equal(circleReaches(track, HSINCHU, 0, 2 * HOUR), false);
  assert.equal(circleReaches(track, HSINCHU, 0, 10 * HOUR), true);
  assert.equal(circleReaches(track, HSINCHU, 11 * HOUR, 20 * HOUR), false); // past the track: unknown
});

test('a place: the official word first, else the chance with its reasons', () => {
  const ty = parseTyphoonCap(raw('warning-sea.cap'), NOW);
  const dg = parseDgpa(raw('dgpa.html'));
  const off = dayOffFor(place('台北市'), ty, dg, NOW, HSINCHU);
  assert.deepEqual(off.official.lines, [{ text: '明天停止上班、停止上課', off: 'all' }]);
  assert.equal(off.chance, undefined);
  // 新竹市 named nothing for tomorrow on a quiet page: the chance.
  const calm = dayOffFor(place('新竹市'), ty, { counties: {} }, NOW, HSINCHU);
  assert.equal(calm.date, '2026-10-23');
  assert.equal(calm.name, '薔琵');
  assert.deepEqual(calm.why, { wind: 4, gust: 5, mm: 0, land: false, reach: false });
  assert.equal(calm.chance, 5);
  // Under a land warning with gusts of 10級 and heavy rain tomorrow: high.
  const wild = dayOffFor(place('新竹市', { wind: { speed: 63, gust: 95 }, mm: 12 }), parseTyphoonCap(landCap(), NOW), null, NOW, HSINCHU);
  assert.equal(wild.why.land, true);
  assert.equal(wild.why.gust, 10);
  assert.ok(wild.chance >= 80, wild.chance);
  // No warning, or abroad: nothing.
  assert.equal(dayOffFor(place('新竹市'), null, null, NOW), null);
  assert.equal(dayOffFor(place(null), ty, null, NOW), null);
});

test('reads: the CAP only from NCDR, the page through the relay', async () => {
  const seen = [];
  const res = body => ({ ok: true, status: 200, headers: new Headers({ 'content-type': 'text/xml; charset=utf-8' }), arrayBuffer: async () => new TextEncoder().encode(body).buffer });
  const fetchFn = async url => (seen.push(url), res(url.includes('RssAtomFeed') ? raw('feed.xml') : raw('warning-sea.cap')));
  assert.equal((await readTyphoon(fetchFn, NOW)).name, '薔琵');
  assert.equal(seen.length, 2);
  const elsewhere = async url => res(url.includes('RssAtomFeed') ? raw('feed.xml').replace(/https:\/\/alerts\.ncdr\.nat\.gov\.tw\/Capstorage/, 'https://evil.example/Capstorage') : '');
  assert.equal(await readTyphoon(elsewhere, NOW), null);
  // Long past its end, unrenewed: over.
  assert.equal(await readTyphoon(fetchFn, Date.parse('2026-10-23T00:00:00Z')), null);
  const relayed = [];
  const env = { GEMINI_RELAY: { fetch: async url => (relayed.push(url), res(raw('dgpa.html'))) } };
  assert.equal((await readDgpa(env, fetchFn)).counties['臺北市'], '明天停止上班、停止上課。');
  assert.equal(relayed[0], `https://gemini-relay/?to=${encodeURIComponent(DGPA_NDS)}`);
});
