// The outside sources' health (Jay 2026-11-10: "make sure our admin panel
// reflect the status of it, so when it break I can come back to you"):
// sources.js counts the proxy's own outside calls and phones' beacons;
// kit/sources.mjs names the sources and tells a state.
import { test } from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import assert from 'node:assert/strict';
import { fakeD1 } from './fake-d1.mjs';
import { noteSource, flushSources, readSources, pruneSources, takeBeacon, asSourceCall, _pending, _reset } from '../sources.js';
import { sourceOf, stateOf, lateOf, SOURCES, GROUPS } from '../kit/sources.mjs';

const HOUR = 3_600_000;

test('a host to its source: exact names, patterns, a job’s outlets; ours never; a stranger by its name', () => {
  assert.equal(sourceOf('tdx.transportdata.tw'), 'tdx');
  assert.equal(sourceOf('hisatisfy.hccg.gov.tw'), 'hccg-bus');
  assert.equal(sourceOf('law.taichung.gov.tw'), 'local-rules');
  assert.equal(sourceOf('www.example-gov.gov.tw'), 'gov-pages');
  assert.equal(sourceOf('news.ltn.com.tw', 'build:news'), 'news');
  assert.equal(sourceOf('orbit.jaypengx.com'), '');
  assert.equal(sourceOf('orbit-workers-proxy.pengzjay.workers.dev'), '');
  assert.equal(sourceOf('weather.cache'), '');
  assert.equal(sourceOf('runner'), '');
  assert.equal(sourceOf('new.example.com'), 'host:new.example.com');
});

test('every source: a unique id, a known group, somewhere it is read', () => {
  const ids = SOURCES.map(s => s.id);
  assert.equal(new Set(ids).size, ids.length);
  const groups = new Set(GROUPS.map(g => g[0]));
  for (const s of SOURCES) {
    assert.ok(groups.has(s.group), s.id);
    assert.ok(s.where.length, s.id);
    assert.ok(s.hosts.length || s.match || s.fresh, `${s.id}: counted or aged somehow`);
  }
});

test('counted, kept in D1 once due (sooner while failing), read back by source', async () => {
  _reset();
  const env = { STORE: fakeD1() };
  const t = 1_800_000_000_000;
  noteSource('cwa', 'worker', true, 120, '', t);
  noteSource('cwa', 'worker', true, 80, '', t + 1000);
  assert.equal(flushSources(env, null, { now: t + 30_000 }), null, 'not due yet');
  noteSource('cwa', 'worker', false, 8000, 'opendata.cwa.gov.tw timeout /api/v1', t + 2000);
  assert.equal(flushSources(env, null, { now: t + 30_000 }), null, 'a failure waits a minute');
  await flushSources(env, null, { now: t + 61_000 });
  assert.equal(_pending().size, 0);
  noteSource('cwa', 'phone', true, 50, '', t + 3000);
  await flushSources(env, null, { now: t + 3000, force: true });
  const r = (await readSources(env, t + 5000)).cwa;
  assert.equal(r.ok, 3);
  assert.equal(r.fail, 1);
  assert.equal(r.lastFail, t + 2000);
  assert.match(r.err, /timeout/);
  assert.deepEqual(Object.keys(r.sides).sort(), ['phone', 'worker']);
  assert.equal(r.hours.length, 1);
  // A week on, gone.
  assert.equal((await pruneSources(env, t + 9 * 24 * HOUR)).removed, 2);
});

test('the global fetch counted by host; our tools’ calls (quiet) never', async () => {
  _reset();
  const was = globalThis.__orbitSourcesFetch;
  assert.equal(typeof was, 'function', 'wrapped on import');
  // (The wrapper calls whatever fetch it wrapped: here, one that answers at once.)
  const { watchFetch } = await import('../sources.js');
  delete globalThis.__orbitSourcesFetch;
  const real = globalThis.fetch;
  globalThis.fetch = async u => new Response('', { status: String(u).includes('bad') ? 503 : 200 });
  watchFetch();
  await fetch('https://opendata.cwa.gov.tw/api/x?Authorization=SECRET');
  await fetch('https://api.openf1.org/bad/v1');
  await asSourceCall({ quiet: true }, () => fetch('https://ods.railway.gov.tw/x'));
  await new Promise(r => setTimeout(r, 0));
  const keys = [..._pending().keys()].map(k => k.split('|')[0]).sort();
  assert.deepEqual(keys, ['cwa', 'openf1']);
  const f1 = [..._pending().entries()].find(([k]) => k.startsWith('openf1'))[1];
  assert.equal(f1.fail, 1);
  assert.match(f1.err, /^api\.openf1\.org 503 \/bad\/v1$/);
  for (const v of _pending().values()) assert.ok(!v.err.includes('SECRET'), 'never a query');
  globalThis.fetch = real;
  globalThis.__orbitSourcesFetch = was;
  _reset();
});

test('a phone’s beacon: only named sources, numbers bounded, counted as the phone’s', () => {
  _reset();
  const now = 1_800_000_000_000;
  const n = takeBeacon({ h: { 'site.api.espn.com': [10, 2, 3000, now - 1000, now - 500, 'HTTP 503<script>'], 'evil.example': [1, 0, 1, now, 0, ''], 'apis.youbike.com.tw': [999999, 0, 1, now, 0, ''] } }, now);
  assert.equal(n, 2);
  const espn = _pending().get(`espn|${Math.floor(now / HOUR)}|phone`);
  assert.equal(espn.fail, 2);
  assert.equal(espn.lastFail, now - 500);
  assert.equal(espn.err, 'site.api.espn.com HTTP 503script');
  assert.equal(_pending().get(`youbike|${Math.floor(now / HOUR)}|phone`).ok, 5000);
  assert.equal(takeBeacon(null, now), 0);
  _reset();
});

test("a phone's beacon kept at once in a quiet isolate (no later request may come), never twice in 5 minutes", async () => {
  _reset();
  const env = { STORE: fakeD1() };
  const t = 1_800_000_000_000;
  takeBeacon({ h: { '2384.tainan.gov.tw': [4, 0, 2000, t - 1000, 0, ''] } }, t);
  await flushSources(env, null, { now: t, soon: true });
  assert.equal(_pending().size, 0, 'kept at once');
  takeBeacon({ h: { '2384.tainan.gov.tw': [2, 0, 900, t, 0, ''] } }, t + 60_000);
  assert.equal(flushSources(env, null, { now: t + 60_000, soon: true }), null, 'not twice in 5 minutes');
  await flushSources(env, null, { now: t + 6 * 60_000, soon: true });
  assert.equal((await readSources(env, t + 7 * 60_000))['tnn-bus'].sides.phone.ok, 6);
  _reset();
});

test('a state: broken when the last calls failed and nothing worked since; data late; nobody asking is no problem', () => {
  const now = 1_800_000_000_000;
  const h = Math.floor(now / HOUR);
  assert.equal(stateOf({ ok: 50, fail: 0, lastOk: now - 60_000, lastFail: 0, hours: [[h, 50, 0]] }, null, now), 'ok');
  assert.equal(stateOf({ ok: 50, fail: 3, lastOk: now - 2 * HOUR, lastFail: now - 60_000, hours: [[h, 0, 3], [h - 4, 50, 0]] }, null, now), 'bad');
  assert.equal(stateOf({ ok: 80, fail: 20, lastOk: now, lastFail: now - HOUR, hours: [[h, 80, 20]] }, null, now), 'warn');
  assert.equal(stateOf(undefined, null, now), 'idle');
  assert.equal(stateOf(undefined, { at: now - 3 * HOUR, late: lateOf(now - 3 * HOUR, HOUR, now) }, now), 'bad');
  assert.equal(stateOf(undefined, { at: now - 1.5 * HOUR, late: lateOf(now - 1.5 * HOUR, HOUR, now) }, now), 'warn');
  assert.equal(stateOf(undefined, { at: now - 10_000, late: 0 }, now), 'ok');
});

test('every outside host the Workers name has its source row (a new source: a row in kit/sources.mjs)', () => {
  const root = new URL('../', import.meta.url);
  // (News' outlets count as 新聞 by their builder's job; the guard is its own Worker.)
  const files = [...readdirSync(root).filter(f => f.endsWith('.js') && f !== 'guard.js'), ...readdirSync(new URL('builders/', root)).filter(f => f.endsWith('.js') && f !== 'news.js').map(f => `builders/${f}`)];
  const missing = new Set();
  for (const f of files)
    for (const [, h] of readFileSync(new URL(f, root), 'utf8').matchAll(/https:\/\/([a-z0-9.-]+\.[a-z]{2,})/gi)) if (sourceOf(h).startsWith('host:')) missing.add(`${h} (${f})`);
  assert.deepEqual([...missing], []);
});
