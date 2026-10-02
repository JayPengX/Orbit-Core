// Who's been right (weather-skill.js): snapshots, scores, the weights.
import test from 'node:test';
import assert from 'node:assert/strict';
import { scoreHour, takeSnapshot, summarize, nextWeights, weatherCron, skillReport, FLOOR, STEP } from '../weather-skill.js';
import { DEFAULT_WEIGHTS } from '../weather.js';
import { cleanItems } from '../push.js';

const H = 3_600_000;
const T0 = Date.parse('2026-10-02T00:00:00+08:00');
const memKv = () => {
  const store = new Map();
  return { store, get: async k => store.get(k) ?? null, put: async (k, v) => void store.set(k, v) };
};

test('a snapshot keeps what each source said for the next 24 hours', () => {
  const entry = { at: T0, bySource: { hours: Array.from({ length: 48 }, (_, i) => ({ t: T0 + i * H, pop: { google: 80, cwa: 20 }, temp: { google: 25, cwa: 27 } })) } };
  const sk = takeSnapshot({ snaps: [], days: {}, lastRain: 0, lastTemp: 0 }, entry, T0);
  assert.equal(sk.snaps.length, 1);
  assert.equal(sk.snaps[0].h.length, 24);
  assert.deepEqual(sk.snaps[0].h[0], [T0, 80, 20, 25, 27]);
  takeSnapshot(sk, entry, T0 + H);
  assert.equal(sk.snaps.length, 1, 'the same refresh once');
  takeSnapshot(sk, { ...entry, at: T0 + 2 * H }, T0 + 27 * H);
  assert.deepEqual(sk.snaps.map(x => x.at), [T0 + 2 * H], 'older than 26 hours dropped');
});

test('scores: rain by Brier, temperature by absolute error, by lead time, each hour once', () => {
  const sk = { snaps: [{ at: T0, h: [[T0 + 2 * H, 80, 20, 25, 28]] }, { at: T0 - 10 * H, h: [[T0 + 2 * H, 60, 60, 24, 26]] }], days: {}, lastRain: 0, lastTemp: 0 };
  // It rained 3 mm in 02:00–03:00; at 02:00 it was 27°.
  scoreHour(sk, { rain: { at: T0 + 3 * H, h1: 3 }, obs: { at: T0 + 2 * H, temp: 27 } }, T0 + 3 * H);
  const d = sk.days['2026-10-02'];
  assert.deepEqual(d.pop.short, { google: [0.04, 1], cwa: [0.64, 1] });
  assert.deepEqual(d.pop.long, { google: [0.16, 1], cwa: [0.16, 1] });
  assert.deepEqual(d.temp.short, { google: [2, 1], cwa: [1, 1] });
  scoreHour(sk, { rain: { at: T0 + 3 * H, h1: 3 }, obs: { at: T0 + 2 * H, temp: 27 } }, T0 + 3 * H);
  assert.deepEqual(d.pop.short.google, [0.04, 1], 'not twice');
  // Under 0.5 mm: dry.
  const dry = { snaps: [{ at: T0, h: [[T0 + 2 * H, 80, 20, null, null]] }], days: {}, lastRain: 0, lastTemp: 0 };
  scoreHour(dry, { rain: { at: T0 + 3 * H, h1: 0.2 } }, T0 + 3 * H);
  assert.deepEqual(dry.days['2026-10-02'].pop.short, { google: [0.64, 1], cwa: [0.04, 1] });
});

test('the weights: toward the better source, a floor, a step a day', () => {
  const w = nextWeights({ google: 0.6, cwa: 0.4 }, { google: 0.3, cwa: 0.1 }, 'pop');
  assert.ok(Math.abs(w.cwa - 0.5) < 0.001 && Math.abs(w.google - 0.5) < 0.001, 'moved 0.1 toward CWA');
  let x = { google: 0.6, cwa: 0.4 };
  for (let i = 0; i < 20; i++) x = nextWeights(x, { google: 0.5, cwa: 0.01 }, 'pop');
  assert.ok(x.google >= FLOOR - 0.001, 'never under the floor');
  assert.ok(Math.abs(x.google + x.cwa - 1) < 0.002);
  assert.deepEqual(nextWeights({ google: 0.6, cwa: 0.4 }, { google: 0.2 }, 'pop'), { google: 0.6, cwa: 0.4 }, 'one source unscored: unchanged');
  assert.ok(STEP === 0.1);
});

test('the cron: scores the recent cells, moves the weights once a day after 3 days', async () => {
  const kv = memKv();
  const env = { RATE_LIMIT_KV: kv, CWA_KEY: 'k' };
  const now = Date.parse('2026-10-05T08:10:00+08:00');
  kv.store.set('weather:recent', JSON.stringify({ '25.03,121.57': now - H }));
  const days = {};
  for (const date of ['2026-10-02', '2026-10-03', '2026-10-04']) days[date] = { pop: { short: { google: [0.4, 4], cwa: [0.08, 4] } }, temp: { short: { google: [4, 4], cwa: [4, 4] } } };
  kv.store.set('weather:skill:25.03,121.57', JSON.stringify({ snaps: [], days, lastRain: now, lastTemp: now }));
  const fetchFn = async () => ({ ok: true, status: 200, text: async () => JSON.stringify({ records: { Station: [] } }) });
  const r = await weatherCron(env, { fetchFn, now });
  assert.equal(kv.store.get('weather:aqi:hist'), undefined, 'no MOENV key: no history');
  assert.equal(r.cells, 1);
  assert.ok(r.weights.pop.cwa > DEFAULT_WEIGHTS.pop.cwa, 'CWA was better at rain');
  assert.deepEqual(r.weights.temp, { google: 0.5, cwa: 0.5 }, 'equal at temperature: toward even, a step');
  const again = await weatherCron(env, { fetchFn, now: now + H });
  assert.equal(again.weights, null, 'once a day');
  const rep = await skillReport(env);
  assert.equal(rep.cells, 1);
  assert.ok(!JSON.stringify(rep).includes('25.03'), 'no places in the report');
  assert.equal(summarize([{ days }]).days, 3);
});

test('push accepts weather checks, and only sane ones', () => {
  const now = Date.parse('2026-10-02T00:00:00Z');
  const list = cleanItems([
    { at: now + H, kind: 'brief', title: '天氣', check: { weather: { lat: 25.03412, lon: 121.56456, kind: 'brief' } } },
    { at: now + H, until: now + 10 * H, kind: 'rain', check: { weather: { lat: 25, lon: 121, kind: 'rain' } } },
    { at: now + H, check: { weather: { lat: 95, lon: 121, kind: 'brief' } } },
    { at: now + H, check: { weather: { lat: 25, lon: 121, kind: 'boom' } } }
  ], now);
  assert.equal(list.length, 2);
  assert.deepEqual(list[0].check, { weather: { lat: 25.0341, lon: 121.5646, kind: 'brief' } });
  assert.equal(list[1].until, now + 10 * H);
});
