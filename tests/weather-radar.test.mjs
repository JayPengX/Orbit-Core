// Orbit Weather's next two hours of rain from CWA's radar echoes, tracked
// (weather-radar.js), read by the kit's rain-now.mjs, said by the rain notice
// (weather.js radarNotice).
import test from 'node:test';
import assert from 'node:assert/strict';
import { packEcho, radarCron, radarAt, cellAt, encodeDbz, decodeDbz, rateOf, motionOf, NX, NY, RADAR_KEY, STEPS } from '../weather-radar.js';
import { rainNow, rainWord, RAIN_WORDS } from '../kit/rain-now.mjs';
import { radarNotice } from '../weather.js';

const MIN = 60_000;
const AT = '2026-11-10T20:10:00+08:00';
const EX = 921;
const EY = 881;
// CWA's whole grid (115°E, 18°N): -99 (no echo) but the cells given, dBZ;
// `cells` in Taiwan's part (the packed grid's row and column).
function cwaFile(at, cells = []) {
  const v = new Array(EX * EY).fill('-9.900E+01');
  v[0] = '-9.990E+02';
  for (const [row, col, dbz] of cells) v[(row + 160) * EX + col + 240] = Number(dbz).toExponential(3).toUpperCase();
  return { cwaopendata: { dataset: { datasetInfo: { parameterSet: { StartPointLongitude: '115.0', StartPointLatitude: '18.0', GridResolution: '0.0125', DateTime: at, GridDimensionX: String(EX), GridDimensionY: String(EY) } }, contents: { content: v.join(',') } } } };
}
// A shower: a 12 × 12 block of `dbz`, its south-west corner at (row, col).
const blob = (row, col, dbz = 35) => Array.from({ length: 144 }, (_, i) => [row + Math.floor(i / 12), col + (i % 12), dbz]);
// R2 as the Worker sees it: get (with a range), put.
function bucket() {
  const files = new Map();
  return {
    files,
    put: async (k, bytes, o) => void files.set(k, { bytes: new Uint8Array(bytes), meta: o.customMetadata }),
    get: async (k, o) => {
      const f = files.get(k);
      if (!f) return null;
      const { offset = 0, length = f.bytes.length } = o?.range || {};
      const part = f.bytes.slice(offset, offset + length);
      return { customMetadata: f.meta, arrayBuffer: async () => part.buffer };
    }
  };
}

test('one byte a cell in half dBZ; under 18 dBZ is dry; rain by Marshall–Palmer', () => {
  for (const v of [0.5, 18, 32.5, 55]) assert.equal(decodeDbz(encodeDbz(v)), v);
  assert.equal(encodeDbz(-99), 0, 'no echo');
  assert.equal(decodeDbz(encodeDbz(-999)), null, 'outside the radars');
  assert.equal(rateOf(15), 0);
  assert.equal(rateOf(20), 0.6);
  assert.equal(rateOf(40), 11.5);
});

test('motion: a shower 2 cells east in 10 minutes moves 2 cells east every 10 minutes', () => {
  const at = Date.parse(AT);
  const a = packEcho(cwaFile(AT, blob(300, 200))).bytes;
  const b = packEcho(cwaFile(new Date(at + 10 * MIN).toISOString(), blob(300, 202))).bytes;
  const m = motionOf(a, b, 10);
  const tx = Math.floor(205 / 32);
  const ty = Math.floor(305 / 32);
  const i = (ty * Math.ceil(NX / 32) + tx) * 2;
  assert.deepEqual([m[i] / 2, m[i + 1] / 2], [2, 0]);
  assert.deepEqual([m[0] / 2, m[1] / 2], [2, 0], 'a tile with no rain takes the others’');
  const still = motionOf(a, a, 10);
  assert.deepEqual([still[i], still[i + 1]], [0, 0]);
});

test('the cron keeps each frame once with its motion; a place reads when the shower reaches it', async () => {
  const DATA = bucket();
  const at = Date.parse(AT);
  const later = new Date(at + 10 * MIN).toISOString();
  const frames = [cwaFile(AT, blob(300, 200)), cwaFile(later, blob(300, 202))];
  let k = 0;
  const fetchFn = async () => new Response(JSON.stringify(frames[k]));
  const first = await radarCron({ DATA }, { fetchFn });
  assert.equal(first.at, at);
  assert.equal(first.moving, false, 'no frame before it: no motion yet');
  assert.deepEqual(await radarCron({ DATA }, { fetchFn }), { same: at }, 'the same frame: no write');
  k = 1;
  const second = await radarCron({ DATA }, { fetchFn });
  assert.deepEqual(second, { at: at + 10 * MIN, wet: 144, moving: true });
  assert.equal(DATA.files.get(RADAR_KEY).bytes.length, NX * NY);
  // A place 6 cells east of the shower's east edge (cell 213 → 219): about 30 minutes away at 2 cells in 10.
  const lat = 306 * 0.0125 + 20 - 0.00225;
  const lon = 219 * 0.0125 + 118 + 0.008;
  assert.deepEqual(Object.values(cellAt(lat, lon)).map(Math.round), [306, 219]);
  const got = await radarAt({ DATA }, lat, lon, at + 20 * MIN);
  assert.equal(got.at, at + 10 * MIN);
  assert.equal(got.rate.length, STEPS);
  const firstWet = got.rate.findIndex(v => v > 0);
  assert.ok(firstWet >= 5 && firstWet <= 7, `starts in about 30 minutes (step ${firstWet})`);
  assert.equal(Math.max(...got.rate), 5.6, '35 dBZ: 5.6 mm an hour');
  assert.ok(got.rate.slice(firstWet + 14).every(v => v === 0), 'and has passed about an hour later (12 cells wide)');
  assert.ok(got.mm > 0, 'the next hour’s sum, as older pages read it');
  assert.equal(await radarAt({ DATA }, 25, 121.3, at + 60 * MIN), null, 'an old frame is not now');
  assert.equal(await radarAt({ DATA }, 35.7, 139.7), null, 'off the grid (Tokyo)');
  assert.equal(packEcho({ cwaopendata: { dataset: { datasetInfo: { parameterSet: { GridDimensionX: '440' } } } } }), null, 'another grid: not read');
});

test('rain now: when it starts and stops, how hard in words', () => {
  const at = Date.parse(AT);
  const radar = rate => ({ at, step: 5, rate });
  const dry = new Array(25).fill(0);
  assert.equal(rainNow(radar(dry), at + 45 * MIN), null, 'an old frame says nothing');
  assert.equal(rainNow(radar(dry), at + 10 * MIN).kind, 'dry');
  const shower = dry.slice();
  for (let i = 6; i < 12; i++) shower[i] = i === 8 ? 0 : 2.5;
  shower[9] = 6;
  const r = rainNow(radar(shower), at + 12 * MIN);
  assert.equal(r.kind, 'start');
  assert.equal(r.from, at + 30 * MIN);
  assert.equal(r.to, at + 60 * MIN, 'a single dry step inside it kept');
  assert.equal(r.peak, 6);
  assert.equal(r.bars[0].t, at + 12 * MIN, 'the bars start now');
  assert.equal(rainNow(radar(shower), at + 32 * MIN).kind, 'now');
  const unknown = shower.slice(0, 10).concat(new Array(15).fill(null));
  assert.equal(rainNow(radar(unknown), at).to, null, 'still raining where the radars stop saying');
  assert.equal(rainNow(radar(unknown), at).until, at + 50 * MIN);
  assert.deepEqual(RAIN_WORDS.map(w => rainWord(w.upTo - 0.1).zh), ['毛毛雨', '小雨', '中雨', '大雨', '豪大雨']);
});

test('the notice: when, how hard and until when, in words; drizzle or more than an hour away is not sent', () => {
  const now = Date.parse(AT);
  const say = (from, to, peak, until = now + 110 * MIN) => radarNotice({ kind: 'start', from, to, peak, until }, now, 'Asia/Taipei');
  assert.deepEqual(say(now + 15 * MIN, now + 45 * MIN, 2.5), { title: '{title} · 20:25 起小雨', body: '約 15 分鐘後開始，約 20:55 停（下 30 分鐘左右），記得帶傘。雷達追蹤雨雲，約 1.5 公里內' });
  assert.match(say(now + 15 * MIN, null, 12).body, /至少下到 22:00，晚點再出門/);
  assert.equal(say(now + 15 * MIN, now + 45 * MIN, 0.8), null, 'a drizzle');
  assert.equal(say(now + 70 * MIN, null, 5), null, 'past the hour: asked again later');
  assert.equal(radarNotice({ kind: 'now', from: now, to: null, peak: 5, until: now }, now), null, 'already raining: no 快下雨了');
});
