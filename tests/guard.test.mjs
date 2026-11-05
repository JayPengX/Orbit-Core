import test from 'node:test';
import assert from 'node:assert/strict';
import { period, chunks, judge, guardRun, PLAN, STATE_KEY, BLIND_MS, WORKERS } from '../guard.js';

const DAY = 86_400_000;
const T = s => Date.parse(s);

test('period: from the renewal day, counted from the day before; a 31st in a short month is its last day', () => {
  const p = period(T('2026-10-20T05:00:00Z'), 13);
  assert.equal(p.start, T('2026-10-13T00:00:00Z'));
  assert.equal(p.end, T('2026-11-13T00:00:00Z'));
  assert.equal(p.from, T('2026-10-12T00:00:00Z'));
  assert.equal(period(T('2026-10-05T00:00:00Z'), 13).start, T('2026-09-13T00:00:00Z'));
  assert.equal(period(T('2027-01-02T00:00:00Z'), 13).start, T('2026-12-13T00:00:00Z'));
  assert.equal(period(T('2026-02-28T12:00:00Z'), 31).start, T('2026-02-28T00:00:00Z'));
  assert.equal(period(T('2026-02-28T12:00:00Z'), 31).end, T('2026-03-31T00:00:00Z'));
});

test('chunks: a period in pieces of a week at most, end to end', () => {
  const c = chunks(0, 20 * DAY);
  assert.deepEqual(c, [[0, 7 * DAY], [7 * DAY, 14 * DAY], [14 * DAY, 20 * DAY]]);
});

test('judge: any count at 90% of the plan is over', () => {
  assert.deepEqual(judge({ requests: 8_999_999 }).over, []);
  assert.deepEqual(judge({ requests: 9_000_000 }).over, ['requests']);
  const j = judge({ requests: 1e6, cpuMs: 28e6, kvWrite: 950_000 });
  assert.deepEqual(j.over.sort(), ['cpuMs', 'kvWrite']);
  assert.equal(j.top, 'kvWrite');
});

// A fake Cloudflare: analytics answering `use`, the Workers' addresses and crons.
function fakeCf(use, { cpuField = true, fail = false, d1Fail = false } = {}) {
  const seen = new Set();
  const workers = Object.fromEntries(WORKERS.map(w => [w, { on: true, crons: w === 'sports-proxy' ? ['* * * * SUN'] : ['*/2 * * * *', '1-59/2 * * * *'] }]));
  const calls = [];
  const domains = [];
  const routes = [];
  const fetcher = async (url, init = {}) => {
    calls.push(`${init.method || 'GET'} ${url.replace(/^.*\/client\/v4/, '')}`);
    const json = b => ({ ok: true, status: 200, json: async () => b });
    if (url.endsWith('/graphql')) {
      if (fail) return { ok: false, status: 500, json: async () => ({}) };
      const q = JSON.parse(init.body).query;
      if (!cpuField && q.includes('cpuTimeUs')) return json({ errors: [{ message: 'unknown field "cpuTimeUs"' }] });
      const acc = x => json({ data: { viewer: { accounts: [x] } } });
      // (Every count in the first week's piece.)
      const once = kind => (seen.has(kind) ? {} : (seen.add(kind), use));
      if (q.includes('workersInvocationsAdaptive')) {
        const piece = once('w');
        return acc({ w: [{ sum: { requests: piece.requests || 0, cpuTimeUs: (piece.cpuMs || 0) * 1000 }, quantiles: { cpuTimeP99: 5000 }, dimensions: { scriptName: 'sports-proxy' } }] });
      }
      if (q.includes('kvOperationsAdaptiveGroups')) return acc({ x: [{ sum: { requests: once('kv').kvWrite || 0 }, dimensions: { actionType: 'write' } }] });
      if (q.includes('durableObjectsInvocationsAdaptiveGroups')) return acc({ x: [{ sum: { requests: once('do').doRequests || 0 } }] });
      if (q.includes('r2OperationsAdaptiveGroups')) {
        const piece = once('r2');
        return acc({ x: [{ sum: { requests: piece.r2Put || 0 }, dimensions: { actionType: 'PutObject' } }, { sum: { requests: piece.r2Get || 0 }, dimensions: { actionType: 'GetObject' } }, { sum: { requests: 5 }, dimensions: { actionType: 'DeleteObject' } }, { sum: { requests: piece.r2Odd || 0 }, dimensions: { actionType: 'SomethingNew' } }] });
      }
      if (q.includes('d1AnalyticsAdaptiveGroups')) return d1Fail ? json({ errors: [{ message: 'unknown field "rowsRead"' }] }) : acc({ x: [{ sum: { rowsRead: 0, rowsWritten: once('d1').d1RowsWritten || 0 } }] });
      if (q.includes('kvStorageAdaptiveGroups')) return acc({ x: [{ max: { byteCount: use.kvBytes || 0 }, dimensions: { date: '2026-10-20' } }] });
      if (q.includes('r2StorageAdaptiveGroups')) return acc({ x: [{ max: { payloadSize: use.r2Bytes || 0, metadataSize: 0 }, dimensions: { bucketName: 'orbit-data', datetime: '2026-10-20T00:00:00Z' } }, { max: { payloadSize: 1, metadataSize: 0 }, dimensions: { bucketName: 'orbit-data', datetime: '2026-10-19T00:00:00Z' } }] });
      return acc({ x: [] });
    }
    if (url.endsWith('/accounts')) return json({ success: true, result: [{ id: 'acct-1' }] });
    const dm = /workers\/domains(?:\?service=([^&]+)|\/([^/?]+))?$/.exec(url);
    if (dm) {
      const method = init.method || 'GET';
      if (method === 'GET') return json({ success: true, result: domains.filter(d => d.service === decodeURIComponent(dm[1])) });
      if (method === 'DELETE') domains.splice(domains.findIndex(d => d.id === dm[2]), 1);
      if (method === 'PUT') domains.push({ id: `d${domains.length + 9}`, ...JSON.parse(init.body) });
      return json({ success: true, result: null });
    }
    const rm = /zones\/([^/]+)\/workers\/routes(?:\/([^/?]+))?$/.exec(url);
    if (rm) {
      const method = init.method || 'GET';
      if (method === 'GET') return json({ success: true, result: routes.filter(r => r.zone === rm[1]) });
      if (method === 'DELETE') routes.splice(routes.findIndex(r => r.id === rm[2]), 1);
      if (method === 'POST') routes.push({ id: `r${routes.length + 9}`, zone: rm[1], ...JSON.parse(init.body) });
      return json({ success: true, result: null });
    }
    const m = /scripts\/([^/]+)\/(subdomain|schedules)$/.exec(url);
    const w = workers[m[1]];
    if (!w) return { ok: false, status: 404, json: async () => ({ success: false, errors: [{ message: 'This Worker does not exist on your account.' }] }) };
    const method = init.method || 'GET';
    if (m[2] === 'subdomain') {
      if (method === 'DELETE') w.on = false;
      if (method === 'POST') w.on = JSON.parse(init.body).enabled;
      return json({ success: true, result: { enabled: w.on } });
    }
    if (method === 'PUT') w.crons = JSON.parse(init.body).map(s => s.cron);
    return json({ success: true, result: { schedules: w.crons.map(cron => ({ cron })) } });
  };
  return { fetcher, workers, calls, domains, routes };
}
function fakeKv() {
  const m = new Map();
  return { m, get: async k => m.get(k) ?? null, put: async (k, v) => void m.set(k, v) };
}
const env = { CF_GUARD_TOKEN: 't', CF_ACCOUNT_ID: 'a', PERIOD_DAY: '13', RATE_LIMIT_KV: null };

test('under the plan: nothing stopped, the bill kept for the panel', async () => {
  const cf = fakeCf({ requests: 2_000_000, cpuMs: 4_000_000, kvWrite: 20_000 });
  const kv = fakeKv();
  const s = await guardRun(env, { fetcher: cf.fetcher, kv, now: T('2026-10-20T00:00:00Z') });
  assert.equal(s.stopped, undefined);
  assert.equal(s.use.requests, 2_000_000);
  assert.equal(s.use.cpuMs, 4_000_000);
  assert.ok(cf.workers['sports-proxy'].on);
  assert.ok(JSON.parse(kv.m.get(STATE_KEY)).armed);
});

test('at 90% of a count: both proxies off the air, crons kept; back on when the next period starts', async () => {
  const cf = fakeCf({ requests: 9_100_000 });
  const kv = fakeKv();
  const s = await guardRun(env, { fetcher: cf.fetcher, kv, now: T('2026-10-30T00:00:00Z') });
  assert.deepEqual(s.stopped.why, ['requests']);
  for (const w of WORKERS) {
    assert.equal(cf.workers[w].on, false);
    assert.deepEqual(cf.workers[w].crons, []);
  }
  // A deploy turns sports-proxy's address back on: off again the next run.
  cf.workers['sports-proxy'].on = true;
  cf.workers['sports-proxy'].crons = ['* * * * SUN'];
  const cf2 = fakeCf({ requests: 9_200_000 });
  cf2.workers['sports-proxy'] = cf.workers['sports-proxy'];
  cf2.workers['orbit-workers-proxy'] = cf.workers['orbit-workers-proxy'];
  await guardRun(env, { fetcher: cf2.fetcher, kv, now: T('2026-10-30T00:05:00Z') });
  assert.equal(cf.workers['sports-proxy'].on, false);
  // The new period: the counts start again, the addresses and crons come back.
  const cf3 = fakeCf({ requests: 1000 });
  cf3.workers['sports-proxy'] = cf.workers['sports-proxy'];
  cf3.workers['orbit-workers-proxy'] = cf.workers['orbit-workers-proxy'];
  const back = await guardRun(env, { fetcher: cf3.fetcher, kv, now: T('2026-11-13T00:05:00Z') });
  assert.equal(back.stopped, null);
  assert.ok(cf.workers['sports-proxy'].on && cf.workers['orbit-workers-proxy'].on);
  assert.deepEqual(cf.workers['orbit-workers-proxy'].crons, ['*/2 * * * *', '1-59/2 * * * *']);
  assert.deepEqual(cf.workers['sports-proxy'].crons, ['* * * * SUN']);
});

test('still over in the same period: stays stopped', async () => {
  const cf = fakeCf({ cpuMs: 27_500_000 });
  const kv = fakeKv();
  await guardRun(env, { fetcher: cf.fetcher, kv, now: T('2026-10-30T00:00:00Z') });
  const s = await guardRun(env, { fetcher: fakeCf({ cpuMs: 27_600_000 }).fetcher, kv, now: T('2026-11-01T00:00:00Z') });
  assert.ok(s.stopped);
});

test('no cpuTimeUs in the API: CPU from each Worker\'s 99th percentile (more, never less)', async () => {
  const cf = fakeCf({ requests: 1_000_000 }, { cpuField: false });
  const s = await guardRun(env, { fetcher: cf.fetcher, kv: fakeKv(), now: T('2026-10-20T00:00:00Z') });
  assert.equal(s.cpuWay, 'p99');
  assert.equal(s.use.cpuMs, 5_000_000);
});

test('unarmed (no token): says so, touches nothing', async () => {
  const cf = fakeCf({ requests: 9_900_000 });
  const s = await guardRun({ PERIOD_DAY: '13' }, { fetcher: cf.fetcher, kv: fakeKv(), now: T('2026-10-20T00:00:00Z') });
  assert.equal(s.armed, false);
  assert.match(s.error, /CF_GUARD_TOKEN/);
  assert.equal(cf.calls.length, 0);
});

test('the bill unreadable for 6 hours while armed: stopped (never watched blind)', async () => {
  const kv = fakeKv();
  const cf = fakeCf({}, { fail: true });
  const t0 = T('2026-10-20T00:00:00Z');
  let s = await guardRun(env, { fetcher: cf.fetcher, kv, now: t0 });
  assert.ok(!s.stopped);
  s = await guardRun(env, { fetcher: cf.fetcher, kv, now: t0 + BLIND_MS - 60_000 });
  assert.ok(!s.stopped);
  s = await guardRun(env, { fetcher: cf.fetcher, kv, now: t0 + BLIND_MS + 60_000 });
  assert.deepEqual(s.stopped.why, ['blind']);
  assert.equal(cf.workers['sports-proxy'].on, false);
});

test('the plan\'s amounts are the $5 plan\'s (developers.cloudflare.com, 2026-10-13)', () => {
  assert.deepEqual(PLAN, { requests: 10e6, cpuMs: 30e6, kvRead: 10e6, kvWrite: 1e6, kvDelete: 1e6, kvList: 1e6, kvBytes: 1e9, doRequests: 1e6, doBytes: 5e9, r2ClassA: 1e6, r2ClassB: 10e6, r2Bytes: 10e9, d1RowsRead: 25e9, d1RowsWritten: 50e6, d1Bytes: 5e9 });
});

test('R2: writes Class A, reads Class B, deletes free, anything unknown counted as Class A; the bucket\'s latest size', async () => {
  const cf = fakeCf({ r2Put: 800_000, r2Get: 3_000_000, r2Odd: 150_000, r2Bytes: 2_000_000_000 });
  const s = await guardRun(env, { fetcher: cf.fetcher, kv: fakeKv(), now: T('2026-10-20T00:00:00Z') });
  assert.equal(s.use.r2ClassA, 950_000);
  assert.equal(s.use.r2ClassB, 3_000_000);
  assert.equal(s.use.r2Bytes, 2_000_000_000);
  assert.deepEqual(s.stopped.why, ['r2ClassA']);
});

test('every Worker\'s entry exports only handlers and classes (anything else stops the Worker from starting)', async () => {
  for (const entry of ['../worker.js', '../guard-worker.js', '../gemini-relay.js']) {
    const m = await import(entry);
    for (const [k, v] of Object.entries(m)) assert.ok(typeof v === 'function' || (k === 'default' && typeof v === 'object'), `${entry} exports ${k}`);
  }
});

test('a count the API won\'t read loses that count alone (reported), never the bill; the rest still stops the proxy', async () => {
  const cf = fakeCf({ requests: 9_500_000, d1RowsWritten: 1 }, { d1Fail: true });
  const s = await guardRun(env, { fetcher: cf.fetcher, kv: fakeKv(), now: T('2026-10-20T00:00:00Z') });
  assert.match(s.partial.d1, /rowsRead/);
  assert.equal(s.error, null);
  assert.deepEqual(s.stopped.why, ['requests']);
});

test('the guard\'s clock: a wake starts it once; each alarm runs the guard and sets the next on a five-minute mark', async () => {
  const { GuardClock } = await import('../guard-worker.js');
  let alarm = null;
  const state = { storage: { getAlarm: async () => alarm, setAlarm: async t => void (alarm = t) } };
  const kv = fakeKv();
  const clock = new GuardClock(state, { RATE_LIMIT_KV: kv, PERIOD_DAY: '13' });
  assert.equal(await (await clock.fetch()).text(), 'started');
  assert.equal(await (await clock.fetch()).text(), 'running', 'woken again: nothing doubled');
  await clock.alarm();
  assert.equal(alarm % (5 * 60_000), 0);
  assert.ok(alarm > Date.now());
  assert.equal(JSON.parse(kv.m.get(STATE_KEY)).armed, false, 'the guard ran (unarmed here)');
});

test('a Worker that is gone (the old sports-proxy, deleted) never keeps the proxy stopped', async () => {
  const cf = fakeCf({ requests: 9_100_000 });
  delete cf.workers['sports-proxy'];
  const kv = fakeKv();
  const s = await guardRun(env, { fetcher: cf.fetcher, kv, now: T('2026-10-30T00:00:00Z') });
  assert.equal(cf.workers['orbit-workers-proxy'].on, false);
  assert.ok(!s.acts.some(a => a.includes('failed')));
  const cf2 = fakeCf({ requests: 1000 });
  delete cf2.workers['sports-proxy'];
  cf2.workers['orbit-workers-proxy'] = cf.workers['orbit-workers-proxy'];
  const back = await guardRun(env, { fetcher: cf2.fetcher, kv, now: T('2026-11-13T00:05:00Z') });
  assert.equal(back.stopped, null);
  assert.ok(cf.workers['orbit-workers-proxy'].on);
});

test('pacing: only real use paces, past its mark and only while the last days\' rate would reach the stop before the period ends (the owner, 2026-11-05: a forecast alone never rate-limits); up at once, down 5 points under or 10 under the stop', async () => {
  const { paceFor, alertFor, PACES } = await import('../guard.js');
  const perDay = (k, n) => ({ [k]: n / DAY });
  const req = n => perDay('requests', n);
  // A forecast alone: 30% used at a rate that would end at 290%: nobody slowed.
  assert.equal(paceFor({ requests: 3_000_000 }, { rate: req(2_000_000), left: 13 * DAY }).pace, 0);
  // 61% used, the rest lasts the period: none; it wouldn't: 1.
  assert.equal(paceFor({ requests: 6_100_000 }, { rate: req(200_000), left: 10 * DAY }).pace, 0);
  assert.equal(paceFor({ requests: 6_100_000 }, { rate: req(400_000), left: 10 * DAY }).pace, 1);
  assert.equal(paceFor({ cpuMs: 24_000_000 }, { rate: perDay('cpuMs', 1_000_000), left: 5 * DAY }).pace, 2);
  const basics = paceFor({ kvWrite: 860_000 }, { rate: perDay('kvWrite', 20_000), left: 3 * DAY });
  assert.equal(basics.pace, 3);
  assert.deepEqual(basics.why, { key: 'kvWrite', share: 0.86, end: 0.92 });
  // Basics first: nobody new let in at 3 only.
  assert.deepEqual(PACES.map(p => p.newcomers), [true, true, true, false]);
  assert.deepEqual(PACES.map(p => p.slow), [1, 2, 4, 8]);
  // 86% used, an hour left at the usual rate: the stop isn't reached, nobody slowed.
  assert.equal(paceFor({ requests: 8_600_000 }, { rate: req(200_000), left: 3_600_000 }).pace, 0);
  // Held: 81% is within 5 points of 85%, 79% isn't.
  assert.equal(paceFor({ requests: 8_100_000 }, { rate: req(400_000), left: 5 * DAY, last: 3 }).pace, 3);
  assert.equal(paceFor({ requests: 7_900_000 }, { rate: req(400_000), left: 5 * DAY, last: 3 }).pace, 2);
  // Ending at 85% with pace 1 on: held (the slower pace lowered the rate); at 75%: eased.
  assert.equal(paceFor({ requests: 6_500_000 }, { rate: req(200_000), left: 10 * DAY, last: 1 }).pace, 1);
  assert.equal(paceFor({ requests: 6_500_000 }, { rate: req(200_000), left: 10 * DAY }).pace, 0);
  assert.equal(paceFor({ requests: 6_500_000 }, { rate: req(100_000), left: 10 * DAY, last: 1 }).pace, 0);
  assert.equal(paceFor({ kvBytes: 999_000_000 }, { rate: { kvBytes: 1 }, left: DAY }).pace, 0, 'storage is never paced');
  assert.equal(alertFor({ requests: 0.2, cpuMs: 0.55 }), 1);
  assert.equal(alertFor({ requests: 0.91 }), 3);
});

test("the last days' rate: since the oldest mark of the last 3½ days at least 12 hours old; before one, the period's own (three days at least)", async () => {
  const { rateOf, marksAfter, forecastOf } = await import('../guard.js');
  const H = 3_600_000;
  const p = { from: 0, start: DAY, end: 32 * DAY };
  const now = 20 * DAY;
  const perDay = r => Math.round(r.requests * DAY);
  assert.equal(perDay(rateOf({ requests: 10_000_000 }, [], p, now)), 500_000, "the period's own: 10M in 20 days");
  assert.equal(perDay(rateOf({ requests: 3_000_000 }, [], p, DAY)), 1_000_000, 'three days at least');
  const marks = [[now - 5 * DAY, { requests: 1 }], [now - 2 * DAY, { requests: 8_000_000 }], [now - 6 * H, { requests: 9_900_000 }]];
  assert.equal(perDay(rateOf({ requests: 10_000_000 }, marks, p, now)), 1_000_000, 'from 2 days ago: 1M a day');
  // Its forecast: 10M + 12 days at 1M = 220% at the end, the stop (9M) already passed: at once.
  const f = forecastOf({ requests: 10_000_000 }, rateOf({ requests: 10_000_000 }, marks, p, now), p, now);
  assert.deepEqual([f.key, f.end, f.warn, f.at], ['requests', 2.2, true, now]);
  assert.equal(forecastOf({ requests: 1_000_000 }, { requests: 100_000 / DAY }, p, now).warn, false);
  // Kept: a new mark every 6 hours, none older than 3½ days, none from the last period.
  let m = marksAfter([], { requests: 5 }, now);
  m = marksAfter(m, { requests: 6 }, now + H);
  assert.equal(m.length, 1, 'under 6 hours: no new mark');
  m = marksAfter(m, { requests: 7 }, now + 6 * H);
  assert.deepEqual(m.map(x => x[1].requests), [5, 7]);
  assert.equal(Object.keys(m[0][1]).some(k => /Bytes$/.test(k)), false, 'storage isn\'t marked');
  assert.deepEqual(marksAfter(m, { requests: 8 }, now + 4 * DAY).map(x => x[1].requests), [8], 'older than 3½ days: gone');
  assert.deepEqual(marksAfter(m, { requests: 1 }, now + 7 * H, true).map(x => x[1].requests), [1], 'a new period starts afresh');
});

test('a busy day early in the period (a school demo) slows nobody: the forecast is a warning only', async () => {
  // Five days in (from Oct 12), 30% used: the period's own rate (600,000 a day) would end at 192%.
  const cf = fakeCf({ requests: 3_000_000 });
  const kv = fakeKv();
  const s = await guardRun(env, { fetcher: cf.fetcher, kv, now: T('2026-10-17T00:00:00Z') });
  assert.equal(s.pace, 0);
  assert.equal(kv.m.get('guard:pace'), undefined);
  assert.equal(s.forecast.warn, true);
  assert.equal(s.forecast.key, 'requests');
  assert.equal(s.paceTop, 1.92);
  assert.equal(s.marks.length, 1);
  assert.equal(s.stopped, undefined);
});

test('the account is the token\'s own (asked once, kept); the pace is written for the proxy only when it changes', async () => {
  const cf = fakeCf({ requests: 8_600_000 });
  const kv = fakeKv();
  const bare = { CF_GUARD_TOKEN: 't', PERIOD_DAY: '13' };
  // 18 days in at 8.6M (86%), 14 days left at the period's rate: 15M, past the stop: pace 3.
  const s = await guardRun(bare, { fetcher: cf.fetcher, kv, now: T('2026-10-30T00:00:00Z') });
  assert.equal(s.account, 'acct-1');
  assert.ok(s.armed);
  assert.equal(s.pace, 3);
  assert.equal(s.paceWhy.key, 'requests');
  const written = JSON.parse(kv.m.get('guard:pace'));
  assert.deepEqual([written.slow, written.reads, written.newcomers], [8, 0.25, false]);
  assert.equal(cf.calls.filter(c => c.endsWith('/accounts')).length, 1);
  assert.equal(JSON.parse(kv.m.get(STATE_KEY)).account, 'acct-1', 'kept at once, not asked again each run');
  kv.m.delete('guard:pace');
  const again = await guardRun(bare, { fetcher: fakeCf({ requests: 8_600_000 }).fetcher, kv, now: T('2026-10-30T00:05:00Z') });
  assert.equal(again.pace, 3);
  assert.equal(kv.m.get('guard:pace'), undefined, 'unchanged: not written again');
});

test('a custom domain (api.<domain>, the site) goes off with its Worker and comes back with it', async () => {
  const cf = fakeCf({ requests: 9_100_000 });
  cf.domains.push({ id: 'd1', hostname: 'api.example.tw', service: 'orbit-workers-proxy', zone_id: 'z1' }, { id: 'd2', hostname: 'example.tw', service: 'orbit-site', zone_id: 'z1' });
  cf.routes.push({ id: 'r1', zone: 'z1', pattern: 'orbit.example.tw/api/*', script: 'orbit-workers-proxy' }, { id: 'r2', zone: 'z1', pattern: 'orbit.example.tw/law*', script: 'orbit-law' });
  const kv = fakeKv();
  const s = await guardRun(env, { fetcher: cf.fetcher, kv, now: T('2026-10-30T00:00:00Z') });
  assert.deepEqual(cf.domains, []);
  assert.deepEqual(cf.routes.map(r => r.script), ['orbit-law'], "the proxy's route off; an app's files (free) stay");
  assert.ok(s.acts.includes('orbit-site off'));
  // A deploy attaches api. again while stopped: off again the next run, still kept once.
  const cf2 = fakeCf({ requests: 9_200_000 });
  Object.assign(cf2.workers, cf.workers);
  cf2.domains.push({ id: 'd3', hostname: 'api.example.tw', service: 'orbit-workers-proxy', zone_id: 'z1' });
  await guardRun(env, { fetcher: cf2.fetcher, kv, now: T('2026-10-30T00:05:00Z') });
  assert.deepEqual(cf2.domains, []);
  const cf3 = fakeCf({ requests: 1000 });
  Object.assign(cf3.workers, cf.workers);
  const back = await guardRun(env, { fetcher: cf3.fetcher, kv, now: T('2026-11-13T00:05:00Z') });
  assert.equal(back.stopped, null);
  assert.deepEqual(cf3.domains.map(d => `${d.service} ${d.hostname} ${d.zone_id}`).sort(), ['orbit-site example.tw z1', 'orbit-workers-proxy api.example.tw z1']);
  assert.deepEqual(cf3.routes.map(r => `${r.script} ${r.pattern} ${r.zone}`), ['orbit-workers-proxy orbit.example.tw/api/* z1']);
});

test("each Worker's errors in 24 hours: the family's Workers only, a status apart from success counted", async () => {
  const { workerErrors } = await import('../guard.js');
  const rows = [
    { sum: { requests: 1000, errors: 0 }, dimensions: { scriptName: 'orbit-workers-proxy', status: 'success' } },
    { sum: { requests: 7, errors: 7 }, dimensions: { scriptName: 'orbit-workers-proxy', status: 'scriptThrewException' } },
    { sum: { requests: 9, errors: 9 }, dimensions: { scriptName: 'someone-else', status: 'scriptThrewException' } }
  ];
  let asked = null;
  const fetcher = async (url, init) => ((asked = JSON.parse(init.body)), new Response(JSON.stringify({ data: { viewer: { accounts: [{ x: rows }] } } })));
  const r = await workerErrors({ CF_GUARD_TOKEN: 't', CF_ACCOUNT_ID: 'acc' }, { fetcher, now: Date.parse('2026-10-27T12:00:00Z'), kv: null });
  assert.equal(asked.variables.a, 'acc');
  assert.equal(asked.variables.s, '2026-10-26T12:00:00.000Z');
  assert.deepEqual(r.workers, { 'orbit-workers-proxy': { requests: 1007, errors: 7, by: { scriptThrewException: 7 } } });
  assert.deepEqual(await workerErrors({}), { off: true });
});

test('the last 7 days hour by hour: every Worker summed per hour, kept an hour, the p99 way where the API has no cpuTimeUs', async () => {
  const { useByHour, HOURS_KEY } = await import('../guard.js');
  const rows = [
    { sum: { requests: 100, cpuTimeUs: 2_000_000 }, dimensions: { datetimeHour: '2026-11-03T05:00:00Z', scriptName: 'orbit-workers-proxy' } },
    { sum: { requests: 12, cpuTimeUs: 500_000 }, dimensions: { datetimeHour: '2026-11-03T05:00:00Z', scriptName: 'quota-guard' } },
    { sum: { requests: 80, cpuTimeUs: 1_000_000 }, dimensions: { datetimeHour: '2026-11-03T04:00:00Z', scriptName: 'orbit-workers-proxy' } }
  ];
  const kv = new Map();
  const store = { get: async k => kv.get(k) ?? null, put: async (k, v) => void kv.set(k, v) };
  let asks = 0;
  let vars = null;
  const fetcher = async (url, init) => {
    asks++;
    vars = JSON.parse(init.body).variables;
    return new Response(JSON.stringify({ data: { viewer: { accounts: [{ x: rows }] } } }));
  };
  const now = Date.parse('2026-11-03T06:30:00Z');
  const r = await useByHour({ CF_GUARD_TOKEN: 't', CF_ACCOUNT_ID: 'acc' }, { fetcher, now, kv: store });
  assert.equal(vars.s, '2026-10-27T06:00:00Z');
  assert.deepEqual(r.hours, [
    [Date.parse('2026-11-03T04:00:00Z'), 80, 1000],
    [Date.parse('2026-11-03T05:00:00Z'), 112, 2500]
  ]);
  assert.ok(kv.has(HOURS_KEY));
  // Asked again within the hour: the kept copy, analytics not asked.
  await useByHour({ CF_GUARD_TOKEN: 't', CF_ACCOUNT_ID: 'acc' }, { fetcher, now: now + 30 * 60_000, kv: store });
  assert.equal(asks, 1);
  // No cpuTimeUs: each Worker's hour as requests × its 99th percentile.
  let n = 0;
  const old = async () => {
    n++;
    if (n === 1) return new Response(JSON.stringify({ errors: [{ message: 'unknown field "cpuTimeUs"' }] }));
    return new Response(JSON.stringify({ data: { viewer: { accounts: [{ x: [{ sum: { requests: 10 }, quantiles: { cpuTimeP99: 3000 }, dimensions: { datetimeHour: '2026-11-03T05:00:00Z', scriptName: 'orbit-workers-proxy' } }] }] } } }));
  };
  const p = await useByHour({ CF_GUARD_TOKEN: 't', CF_ACCOUNT_ID: 'acc' }, { fetcher: old, now, kv: null });
  assert.equal(p.cpuWay, 'p99');
  assert.deepEqual(p.hours, [[Date.parse('2026-11-03T05:00:00Z'), 10, 30]]);
  assert.deepEqual(await useByHour({}), { off: true });
});
