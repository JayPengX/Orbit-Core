import test from 'node:test';
import assert from 'node:assert/strict';

// The platform's own count of an invocation's outside calls has those made
// other ways too (a binding's, the AI's): refused there "Too many
// subrequests", a call goes through a relay, and the rest of the run's with
// it (2026-11-13: 重大訊息's lists failed every AI builder run for 3 hours).
test('a call the platform refuses for too many subrequests is relayed, and the ones after it', async () => {
  const direct = [];
  globalThis.fetch = async input => {
    direct.push(String(input?.url || input));
    if (direct.length >= 3) throw new Error('Too many subrequests by single Worker invocation.');
    return new Response('direct');
  };
  const { makeRunner } = await import('../runner.js');
  const relayed = [];
  const ns = {
    idFromName: name => name,
    get: name => ({ fetch: async req => (relayed.push([name, req.url, req.headers.get('x-orbit-relay')]), new Response('relayed')) })
  };
  const got = [];
  const Runner = makeRunner(async () => {
    for (const u of ['https://a.example/1', 'https://a.example/2', 'https://a.example/3', 'https://a.example/4']) got.push(await (await fetch(u)).text());
    return new Response('done');
  }, async () => {});
  const r = new Runner({ storage: {} }, { RUNNER: ns });
  assert.equal(await (await r.fetch(new Request('https://proxy/route'))).text(), 'done');
  assert.deepEqual(got, ['direct', 'direct', 'relayed', 'relayed']);
  assert.deepEqual(direct.length, 3);
  assert.deepEqual(relayed.map(x => [x[1], x[2]]), [['https://a.example/3', '1'], ['https://a.example/4', '1']]);
});
