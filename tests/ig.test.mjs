// orbit-ig's probe: status and size per Instagram page, a failure as a failure.
import test from 'node:test';
import assert from 'node:assert/strict';
import { probe, TARGETS } from '../ig.js';

test('reports each page as the Worker saw it', async () => {
  const seen = [];
  const out = await probe(async url => {
    seen.push(url);
    if (url.includes('/api/')) throw new Error('reset');
    return new Response('x'.repeat(10), { status: url.endsWith('/') ? 429 : 200 });
  });
  assert.deepEqual(seen, Object.values(TARGETS));
  assert.equal(out.login.status, 429);
  assert.equal(out.login.bytes, 10);
  assert.equal(out.profileApi.error, 'reset');
});
