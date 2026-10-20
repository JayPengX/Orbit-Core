// The proxy following the bill's pace (pace.js, set by guard.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { paceOf, forgetPace, builderAllowed } from '../pace.js';
import { runBuilders } from '../builders/run.js';
import { memoryBucket } from './fixtures/bucket.mjs';

const kvWith = v => ({ get: async (k, o) => (k === 'guard:pace' && v ? (o?.type === 'json' ? v : JSON.stringify(v)) : null) });

test('no pace written: as configured', async () => {
  forgetPace();
  const p = await paceOf({ RATE_LIMIT_KV: kvWith(null) });
  assert.deepEqual([p.pace, p.slow, p.reads], [0, 1, 1]);
});

test('a pace read once a minute, its slowing and reads from the guard\'s table', async () => {
  forgetPace();
  const env = { RATE_LIMIT_KV: kvWith({ pace: 2, at: 1 }) };
  const p = await paceOf(env, 1_000);
  assert.deepEqual([p.pace, p.slow, p.reads], [2, 4, 0.5]);
  env.RATE_LIMIT_KV = kvWith({ pace: 0 });
  assert.equal((await paceOf(env, 30_000)).pace, 2, 'kept a minute');
  assert.equal((await paceOf(env, 70_000)).pace, 0);
  forgetPace();
});

test('builders at a pace: at 1 only what phones would miss; from 2 none; by hand always', async () => {
  assert.ok(builderAllowed(0, 'photos'));
  assert.ok(builderAllowed(1, 'watch') && !builderAllowed(1, 'cutouts') && !builderAllowed(1, 'buses'));
  assert.ok(!builderAllowed(2, 'watch'));
  const env = { DATA: memoryBucket() };
  const r = await runBuilders(env, { proxy: async () => null, job: 'cutouts', pace: 1, log: () => {} });
  assert.deepEqual(r.cutouts, { paced: 1 });
  const w = await runBuilders(env, { proxy: async () => null, job: 'watch', pace: 2, log: () => {} });
  assert.deepEqual(w.watch, { paced: 2 });
});
