// Orbit Weather's next hour of rain from CWA's radar (weather-radar.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { packRadar, radarCron, radarAt, cellAt, encodeMm, decodeMm, NX, NY, RADAR_KEY } from '../weather-radar.js';

const AT = '2026-11-10T10:30:00+08:00';
// CWA's file: every cell -99 (no echo) but those given, mm.
function cwaFile(wet = {}) {
  const v = new Array(NX * NY).fill('-9.900E+01');
  for (const [i, mm] of Object.entries(wet)) v[i] = Number(mm).toExponential(3).toUpperCase();
  return { cwaopendata: { dataset: { datasetInfo: { parameterSet: { StartPointLongitude: '118', StartPointLatitude: '20', GridResolution: '0.0125', DateTime: AT, GridDimensionX: '441', GridDimensionY: '561' } }, contents: { content: v.join(',') } } } };
}
// R2 as the Worker sees it: get with a range, head, put.
function bucket() {
  const files = new Map();
  return {
    files,
    head: async k => (files.has(k) ? { customMetadata: files.get(k).meta } : null),
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

test('one byte a cell: tenths to 10 mm, halves past it, CWA’s -99 dry', () => {
  for (const mm of [0, 0.1, 0.5, 3.2, 9.9, 10, 12.5, 40, 87]) assert.ok(Math.abs(decodeMm(encodeMm(mm)) - mm) <= 0.25, String(mm));
  assert.equal(encodeMm(-99), 0);
  assert.equal(decodeMm(encodeMm(500)), 87);
  assert.equal(decodeMm(encodeMm(NaN)), null);
});

test('the cron packs CWA’s file once a time; a place reads its cell and the most within ~2 km', async () => {
  const taipei = cellAt(25.04, 121.56);
  const i = taipei.row * NX + taipei.col;
  const DATA = bucket();
  const file = cwaFile({ [i]: 3.2, [i + NX + 1]: 6 });
  const fetchFn = async () => new Response(JSON.stringify(file));
  const r = await radarCron({ DATA }, { fetchFn });
  assert.equal(r.at, Date.parse(AT));
  assert.equal(r.wet, 2);
  assert.equal(DATA.files.get(RADAR_KEY).bytes.length, NX * NY);
  assert.deepEqual(await radarCron({ DATA }, { fetchFn }), { same: Date.parse(AT) }, 'the same forecast: no write');
  const got = await radarAt({ DATA }, 25.04, 121.56, Date.parse(AT) + 15 * 60_000);
  assert.deepEqual(got, { at: Date.parse(AT), mm: 3.2, near: 6 });
  assert.equal(await radarAt({ DATA }, 24, 121, Date.parse(AT) + 60 * 60_000), null, 'an old forecast is no next hour');
  assert.equal(await radarAt({ DATA }, 35.7, 139.7), null, 'off the grid (Tokyo)');
  assert.equal(packRadar({ cwaopendata: { dataset: { datasetInfo: { parameterSet: { GridDimensionX: '440' } } } } }), null, 'another grid: not read');
});
