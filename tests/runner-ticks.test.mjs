// The cron's slow part, in the Runner: one tick an alarm (2026-11-18: three
// ticks in one alarm passed its 30 s of CPU 188 times, and Weather's scoring
// and the news build stopped for hours). Each tick gets its own alarm, the
// next one set before the work, so a tick cut off never takes the rest along.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeRunner } from '../runner.js';

const store = () => {
  const m = new Map();
  let alarm = null;
  return {
    get: async k => m.get(k),
    put: async (k, v) => void m.set(k, v),
    getAlarm: async () => alarm,
    setAlarm: async t => void (alarm = t),
    clear: () => (alarm = null),
    ticks: () => m.get('ticks') || []
  };
};

test('one tick an alarm, the next alarm set before it runs; a tick that throws leaves the rest queued', async () => {
  const ran = [];
  const Runner = makeRunner(async () => new Response('route'), async ({ scheduledTime }) => {
    ran.push(scheduledTime);
    if (scheduledTime === 2) throw new Error('cut off');
  });
  const storage = store();
  const r = new Runner({ storage }, { RUNNER: { idFromName: n => n, get: () => ({ fetch: async () => new Response('') }) } });
  for (const at of [1, 2, 3]) await r.fetch(new Request('https://runner/__tick', { method: 'POST', body: JSON.stringify({ cron: '*/2 * * * *', at, part: 'slow' }) }));
  assert.deepEqual(storage.ticks().map(t => t.at), [1, 2, 3]);
  storage.clear();
  await r.alarm();
  assert.deepEqual(ran, [1]);
  assert.deepEqual(storage.ticks().map(t => t.at), [2, 3]);
  assert.ok(await storage.getAlarm(), 'the next tick has its alarm');
  storage.clear();
  await r.alarm();
  assert.deepEqual(ran, [1, 2]);
  assert.deepEqual(storage.ticks().map(t => t.at), [3], 'the tick after a failed one still waits');
  storage.clear();
  await r.alarm();
  assert.deepEqual(ran, [1, 2, 3]);
  assert.equal(await storage.getAlarm(), null, 'nothing left: no alarm');
});
