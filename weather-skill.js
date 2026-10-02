// ---- weather-skill.js ----
// Who's been right (docs/WEATHER-PLAN.md C7), so the one answer leans on the
// better source. Never shown in the app; it only moves the blend's weights.
//
// Hourly (worker.js's cron), for the cells people opened lately
// (`weather:recent`):
//   - the cell's latest refresh is kept as a snapshot: what each source said
//     for the next 24 hours (no extra calls: it's what /weather fetched);
//   - what happened is read at the nearest CWA rain gauge (≥ 0.5 mm in the
//     hour: it rained) and automatic station (the temperature);
//   - each source's forecast for that hour is scored: rain by the Brier
//     score (pop/100 − rained)², temperature by the absolute error, by lead
//     time (0–6 h, 6–24 h), a day's sums kept 14 days in
//     `weather:skill:<cell>`.
// Daily, from all those scores: weights ∝ 1 / (score + ε), at least 0.15
// each, moved at most 0.1 a day, written to `weather:weights` (which every
// /weather blend reads). Until 3 days of scores exist, the starting weights.

import { HOUR, kvJson, kvPut, getJson, cwaUrl, nearestStation, parseCwaObs, parseCwaRain, twDate, DEFAULT_WEIGHTS, airSites, addAirReading } from './weather.js';

export const SCORE_CELLS = 6;
export const RAINED_MM = 0.5;
export const FLOOR = 0.15;
export const STEP = 0.1;
export const MIN_DAYS = 3;
const KEEP_DAYS = 14;
const EPS = { pop: 0.01, temp: 0.1 };
const SOURCES = ['google', 'cwa'];

const emptySkill = () => ({ snaps: [], days: {}, lastRain: 0, lastTemp: 0 });
const add = (days, date, kind, lead, source, value) => {
  const d = (days[date] ||= {});
  const k = (d[kind] ||= {});
  const l = (k[lead] ||= {});
  const [sum, n] = l[source] || [0, 0];
  l[source] = [Math.round((sum + value) * 1e4) / 1e4, n + 1];
};

// Scores what happened (`rain`: a gauge reading, `obs`: a station reading)
// against the snapshots. Pure: returns the skill record changed in place.
export function scoreHour(sk, { rain, obs }, now) {
  if (rain?.h1 != null && rain.at) {
    const T = Math.floor(rain.at / HOUR) * HOUR - HOUR;
    if (T > sk.lastRain) {
      const rained = rain.h1 >= RAINED_MM ? 1 : 0;
      for (const s of sk.snaps) {
        const h = s.h.find(x => x[0] === T);
        const lead = T - s.at;
        if (!h || lead < 0 || lead >= 24 * HOUR) continue;
        const bucket = lead < 6 * HOUR ? 'short' : 'long';
        SOURCES.forEach((src, i) => h[1 + i] != null && add(sk.days, twDate(T), 'pop', bucket, src, (h[1 + i] / 100 - rained) ** 2));
      }
      sk.lastRain = T;
    }
  }
  if (obs?.temp != null && obs.at) {
    const T = Math.floor(obs.at / HOUR) * HOUR;
    if (T > sk.lastTemp) {
      for (const s of sk.snaps) {
        const h = s.h.find(x => x[0] === T);
        const lead = T - s.at;
        if (!h || lead < 0 || lead >= 24 * HOUR) continue;
        const bucket = lead < 6 * HOUR ? 'short' : 'long';
        SOURCES.forEach((src, i) => h[3 + i] != null && add(sk.days, twDate(T), 'temp', bucket, src, Math.abs(h[3 + i] - obs.temp)));
      }
      sk.lastTemp = T;
    }
  }
  const oldest = twDate(now - KEEP_DAYS * 86_400_000);
  for (const d of Object.keys(sk.days)) if (d < oldest) delete sk.days[d];
  return sk;
}

// The latest refresh of a cell, as a snapshot (if it's new).
export function takeSnapshot(sk, entry, now) {
  const hours = entry?.bySource?.hours;
  if (hours?.length && entry.at > (sk.snaps[sk.snaps.length - 1]?.at || 0)) {
    sk.snaps.push({
      at: entry.at,
      h: hours.filter(x => x.t >= entry.at - HOUR && x.t < entry.at + 24 * HOUR).map(x => [x.t, x.pop?.google ?? null, x.pop?.cwa ?? null, x.temp?.google ?? null, x.temp?.cwa ?? null])
    });
  }
  sk.snaps = sk.snaps.filter(s => now - s.at < 26 * HOUR);
  return sk;
}

export async function scoreCell(env, cell, { fetchFn = fetch, now = Date.now() } = {}) {
  const [lat, lon] = cell.split(',').map(Number);
  const before = await kvJson(env, `weather:skill:${cell}`);
  const sk = before || emptySkill();
  const was = JSON.stringify(sk);
  takeSnapshot(sk, await kvJson(env, `weather:cell:${cell}`), now);
  const gauge = nearestStation(lat, lon, 'r');
  const auto = nearestStation(lat, lon, 'a');
  const read = (set, s) => (s && s.km <= 10 && env.CWA_KEY ? getJson(fetchFn, cwaUrl(env, set, `&StationId=${s.id}`), env).catch(() => null) : null);
  const [rj, aj] = await Promise.all([read('O-A0002-001', gauge), read('O-A0001-001', auto)]);
  scoreHour(sk, { rain: parseCwaRain(rj), obs: parseCwaObs(aj) }, now);
  if (JSON.stringify(sk) !== was) await kvPut(env, `weather:skill:${cell}`, sk, (KEEP_DAYS + 1) * 86_400);
  return sk;
}

// Each source's mean score over all the cells' days: { pop: { google, cwa },
// temp: {…}, days }.
export function summarize(skills) {
  const sums = { pop: {}, temp: {} };
  const dates = new Set();
  for (const sk of skills) {
    for (const [date, d] of Object.entries(sk?.days || {})) {
      dates.add(date);
      for (const kind of ['pop', 'temp']) {
        for (const bucket of Object.values(d[kind] || {})) {
          for (const [src, [sum, n]] of Object.entries(bucket)) {
            const t = (sums[kind][src] ||= [0, 0]);
            t[0] += sum;
            t[1] += n;
          }
        }
      }
    }
  }
  const mean = o => Object.fromEntries(Object.entries(o).map(([s, [sum, n]]) => [s, n ? Math.round((sum / n) * 1e4) / 1e4 : null]));
  const count = o => Object.fromEntries(Object.entries(o).map(([s, [, n]]) => [s, n]));
  return { pop: mean(sums.pop), temp: mean(sums.temp), n: { pop: count(sums.pop), temp: count(sums.temp) }, days: dates.size };
}

// Where the weights go from `prev` given the scores (lower is better).
export function nextWeights(prev, scores, kind) {
  const have = SOURCES.filter(s => scores?.[s] != null);
  if (have.length < SOURCES.length) return { ...prev };
  const inv = Object.fromEntries(SOURCES.map(s => [s, 1 / (scores[s] + EPS[kind])]));
  const total = SOURCES.reduce((a, s) => a + inv[s], 0);
  // Shares; a source under the floor is held at it and the rest share the remainder.
  const share = Object.fromEntries(SOURCES.map(s => [s, inv[s] / total]));
  const low = SOURCES.filter(s => share[s] < FLOOR);
  const restSum = SOURCES.filter(s => !low.includes(s)).reduce((a, s) => a + share[s], 0);
  const target = Object.fromEntries(SOURCES.map(s => [s, low.includes(s) ? FLOOR : (share[s] / restSum) * (1 - FLOOR * low.length)]));
  const moved = Object.fromEntries(SOURCES.map(s => [s, prev[s] + Math.max(-STEP, Math.min(STEP, target[s] - prev[s]))]));
  const t3 = SOURCES.reduce((a, s) => a + moved[s], 0);
  return Object.fromEntries(SOURCES.map(s => [s, Math.round((moved[s] / t3) * 1000) / 1000]));
}

// The cron's hour: each AQI site's reading kept (48 hours, for the air
// graph), the recent cells scored; once a day, the weights moved.
export async function weatherCron(env, { fetchFn = fetch, now = Date.now() } = {}) {
  if (env.MOENV_KEY) {
    const sites = await airSites(env, fetchFn, now).catch(() => null);
    if (sites?.data) await kvPut(env, 'weather:aqi:hist', addAirReading(await kvJson(env, 'weather:aqi:hist'), sites.data, now), 3 * 86_400);
  }
  const recent = (await kvJson(env, 'weather:recent')) || {};
  const cells = Object.entries(recent)
    .sort((a, b) => b[1] - a[1])
    .slice(0, SCORE_CELLS)
    .map(([c]) => c);
  const skills = [];
  for (const cell of cells) skills.push(await scoreCell(env, cell, { fetchFn, now }).catch(() => null));
  const prev = (await kvJson(env, 'weather:weights')) || { ...DEFAULT_WEIGHTS };
  const today = twDate(now);
  let weights = null;
  if (prev.date !== today) {
    const sum = summarize(skills.filter(Boolean));
    if (sum.days >= MIN_DAYS) {
      weights = { pop: nextWeights(prev.pop, sum.pop, 'pop'), temp: nextWeights(prev.temp, sum.temp, 'temp'), date: today, scores: { pop: sum.pop, temp: sum.temp }, n: sum.n, days: sum.days };
      await kvPut(env, 'weather:weights', weights, 30 * 86_400);
    }
  }
  return { cells: cells.length, weights };
}

// GET /weather/skill: the weights and each source's mean scores (no cells:
// they'd say where people are).
export async function skillReport(env) {
  const recent = (await kvJson(env, 'weather:recent')) || {};
  const skills = await Promise.all(Object.keys(recent).slice(0, SCORE_CELLS).map(c => kvJson(env, `weather:skill:${c}`)));
  const weights = (await kvJson(env, 'weather:weights')) || { ...DEFAULT_WEIGHTS, date: null };
  return { weights: { pop: weights.pop, temp: weights.temp, date: weights.date || null }, scores: summarize(skills.filter(Boolean)), cells: Object.keys(recent).length };
}
