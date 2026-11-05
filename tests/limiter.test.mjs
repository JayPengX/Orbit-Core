// The per-isolate limiter: a flood of new addresses fills its map, but
// never resets the global daily caps.
import test from 'node:test';
import assert from 'node:assert/strict';
import { isRateLimitedInMemory } from '../worker.js';

test('a full limiter map keeps the global daily caps', () => {
  const DAY = 86_400_000;
  const now = Date.now();
  for (let i = 0; i < 3; i++) isRateLimitedInMemory('daily-cap:law:global', 3, DAY, now);
  assert.equal(isRateLimitedInMemory('daily-cap:law:global', 3, DAY, now), true);
  for (let i = 0; i < 20_010; i++) isRateLimitedInMemory(`gemini:10.0.${i >> 8}.${i & 255}`, 5, 3_600_000, now);
  assert.equal(isRateLimitedInMemory('daily-cap:law:global', 3, DAY, now), true, 'still capped');
  assert.equal(isRateLimitedInMemory('gemini:10.0.0.0', 1, 3_600_000, now), false, 'per-client counts may start over');
});

test("Class's AI caps a day are one count for every Worker (D1, law.js addOne), as the panel sets them; 0 pauses", async () => {
  const { isDailyCapped } = await import('../worker.js');
  const { forgetLawCounts } = await import('../law.js');
  const had = globalThis.caches;
  let dev = JSON.stringify({ aiClassPhoto: 2, aiClassEdit: 1 });
  globalThis.caches = { default: { match: async () => new Response(dev), put: async () => {} } };
  try {
    forgetLawCounts();
    const env = {};
    const ctx = { waitUntil: () => {} };
    assert.deepEqual([await isDailyCapped(env, ctx, 'gemini'), await isDailyCapped(env, ctx, 'gemini'), await isDailyCapped(env, ctx, 'gemini')], [false, false, true]);
    assert.deepEqual([await isDailyCapped(env, ctx, 'nl-edit'), await isDailyCapped(env, ctx, 'nl-edit')], [false, true], 'each feature its own count');
    dev = JSON.stringify({ aiClassPhoto: 0, aiClassEdit: 1 });
    forgetLawCounts();
    assert.equal(await isDailyCapped(env, ctx, 'gemini'), true, '0 pauses it');
  } finally {
    globalThis.caches = had;
    forgetLawCounts();
  }
});
