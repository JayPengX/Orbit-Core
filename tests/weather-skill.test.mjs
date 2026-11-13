// Who's been right (weather-skill.js): snapshots, scores, the weights.
import test from 'node:test';
import assert from 'node:assert/strict';
import { scoreHour, takeSnapshot, summarize, nextWeights, weatherCron, skillReport, FLOOR, STEP, BIAS_MIN } from '../weather-skill.js';
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
  assert.deepEqual(sk.snaps[0].h[0], [T0, 80, 20, 25, 27, null]);
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
  const served = { snaps: [{ at: T0, h: [[T0 + 2 * H, 80, 20, 25, 28, 26.5]] }], days: {}, lastRain: 0, lastTemp: 0 };
  scoreHour(served, { obs: { at: T0 + 2 * H, temp: 27 } }, T0 + 3 * H);
  assert.deepEqual(served.days['2026-10-02'].temp.short.served, [0.5, 1], 'what the app showed, scored beside the sources');
  assert.deepEqual(nextWeights({ google: 0.6, cwa: 0.4 }, { google: 2, cwa: 1, served: 0.5 }, 'temp'), nextWeights({ google: 0.6, cwa: 0.4 }, { google: 2, cwa: 1 }, 'temp'), 'never a weight');
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

test('the served temperature beside the sources by lead, over the same hours only', () => {
  const days = {
    '2026-11-09': { temp: { short: { google: [30, 10], cwa: [20, 10] } } },
    '2026-11-11': { temp: { short: { google: [12, 10], cwa: [10, 10], served: [8, 10] }, long: { google: [15, 10], cwa: [14, 10], served: [16, 10] } } }
  };
  const { byLead } = summarize([{ days }]);
  assert.deepEqual(byLead.short, { google: 1.2, cwa: 1, served: 0.8, n: { google: 10, cwa: 10, served: 10 } });
  assert.equal(byLead.long.served, 1.6);
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

test('a place that runs 2° warm: its usual error learned past the anchor hours, the corrected hours scored in the shadow', () => {
  const sk = { snaps: [], days: {}, lastRain: 0, lastTemp: 0 };
  const truth = t => 20 + 4 * Math.sin((t / H / 24) * 2 * Math.PI);
  // A snapshot each hour for three days, served always 2° warm.
  for (let i = 0; i < 72; i++) {
    const at = T0 + i * H;
    sk.snaps.push({ at, h: Array.from({ length: 24 }, (_, k) => { const t = at + k * H; return [t, null, null, truth(t) + 2.5, truth(t) + 1.5, truth(t) + 2]; }) });
    sk.snaps = sk.snaps.filter(s => at - s.at < 26 * H);
    scoreHour(sk, { obs: { temp: truth(at), at } }, at);
  }
  assert.ok(sk.bias.n >= BIAS_MIN);
  assert.ok(Math.abs(sk.bias.v - 2) < 0.01, String(sk.bias.v));
  const { byLead } = summarize([sk]);
  assert.ok(byLead.long.biased < 0.2 && byLead.long.served === 2, JSON.stringify(byLead.long));
  assert.ok(byLead.short.biased < byLead.short.served, 'faded in over the first 6 hours');
});
