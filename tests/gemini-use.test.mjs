import test from 'node:test';
import assert from 'node:assert/strict';
import { fakeD1 } from './fake-d1.mjs';
import { logCall, aiUse, ptDay, ptNextDay, ptMonthStart, summarize } from '../gemini-use.js';
import { tdxUse, tallyTdx, flushUse, resetMeter } from '../transit.js';

test("Google's day is Pacific's, summer time included: it ends 15:00 in Taiwan in summer, 16:00 in winter", () => {
  // 2026-10-31 18:30 UTC: 11:30 on the 31st in California (PDT).
  const now = Date.parse('2026-10-31T18:30:00Z');
  assert.equal(ptDay(now), '2026-10-31');
  assert.equal(new Date(ptNextDay(now)).toISOString(), '2026-11-01T07:00:00.000Z'); // 15:00 in Taiwan
  // After summer time (from 2026-11-01 02:00 PDT): midnight is 08:00 UTC.
  assert.equal(new Date(ptNextDay(Date.parse('2026-11-05T12:00:00Z'))).toISOString(), '2026-11-06T08:00:00.000Z');
  assert.equal(new Date(ptMonthStart(now)).toISOString(), '2026-10-01T07:00:00.000Z');
  assert.equal(new Date(ptMonthStart(Date.parse('2026-12-10T00:00:00Z'))).toISOString(), '2026-12-01T08:00:00.000Z');
});

test('every Gemini call is a row: Law and Money counted at once, refusals apart, the busiest minute, the bill by feature', async () => {
  const env = { STORE: fakeD1() };
  const at = Date.parse('2026-10-31T18:00:00Z'); // 02:00 on 11-01 in Taiwan, 11:00 on 10-31 in California
  const usage = { promptTokenCount: 1000, cachedContentTokenCount: 200, candidatesTokenCount: 50, thoughtsTokenCount: 30 };
  await logCall(env, { feature: 'law-ask', model: 'gemini-3.5-flash-lite', status: 200, usage, at });
  await logCall(env, { feature: 'law-chat', model: 'gemini-3.7-flash', status: 200, usage, at: at + 1000 });
  await logCall(env, { feature: 'money-read', model: 'gemini-3.5-flash-lite', status: 200, usage, at: at + 2000 });
  await logCall(env, { feature: 'money-read', model: 'gemini-3.5-flash-lite', status: 429, at: at + 3000 });
  await logCall(env, { feature: 'law-ask', model: 'gemini-3.5-flash-lite', status: 200, usage, at: at + 90_000 });
  const u = await aiUse(env, at + 100_000);
  assert.equal(u.byFeature['law-ask']['2026-11-01'], 2);
  assert.equal(u.byFeature['money-read']['2026-11-01'], 1, 'a refusal answered nothing');
  assert.equal(u.byFeature['law-chat']['2026-11-01'], 1);
  assert.equal(u.googleDay, '2026-10-31');
  assert.deepEqual(u.google['gemini-3.5-flash-lite'], { calls: 3, refused: 1, peakMinute: 2 });
  assert.deepEqual(u.features['money-read']['gemini-3.5-flash-lite'], { in: 800, cached: 200, out: 80, n: 1 });
  assert.deepEqual(u.gemini['gemini-3.7-flash']['2026-10-31'], { in: 800, cached: 200, out: 80 });
  // Google's next day: its count starts again; Taiwan's week keeps the calls.
  const next = summarize(await (await import('../gemini-use.js')).callsSince(env, 0), Date.parse('2026-11-01T08:00:00Z'));
  assert.deepEqual(next.google, {});
  assert.equal(next.byFeature['law-ask']['2026-11-01'], 2);
});

test("TDX's month starts on the 1st in Taiwan and keeps the 1st's first 16 hours after Google's meter turns over", async () => {
  resetMeter();
  const kv = new Map();
  const env = { RATE_LIMIT_KV: { get: async (k, o) => (kv.has(k) ? (o?.type === 'json' || o === 'json' ? JSON.parse(kv.get(k)) : kv.get(k)) : null), put: async (k, v) => kv.set(k, v) } };
  // 10-31 in Taiwan, then 01:00 on 11-01 in Taiwan (still October's meter).
  await tallyTdx(env, 'advanced/x', Date.parse('2026-10-31T03:00:00Z'));
  for (let i = 0; i < 200; i++) await tallyTdx(env, 'advanced/x', Date.parse('2026-10-31T17:00:00Z'));
  await flushUse(env, Date.parse('2026-10-31T17:00:00Z'));
  // 20:00 on 11-01 in Taiwan: November's meter, the 1st's early calls still this month's.
  resetMeter();
  const at = Date.parse('2026-11-01T12:00:00Z');
  await tallyTdx(env, 'basic/x', at);
  const used = await tdxUse(env, at);
  assert.deepEqual(used, { 'tdx:a:2026-11-01': 200, 'tdx:b:2026-11-01': 1 });
});
