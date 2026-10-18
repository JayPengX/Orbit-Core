// What every route answers with (http.js, worker.js): bodies read only so far, and a crash still answered with CORS.
import test from 'node:test';
import assert from 'node:assert/strict';
import { bodyText } from '../http.js';

const worker = (await import('../worker.js')).default;
const ctx = { waitUntil() {}, passThroughOnException() {} };
const ORIGIN = 'https://jaypengx.github.io';

test('bodyText: the body up to its limit; past it null, read no further', async () => {
  const post = (body, headers = {}) => new Request('https://w/x', { method: 'POST', body, headers });
  assert.equal(await bodyText(post('{"a":"漢字"}'), 100), '{"a":"漢字"}');
  assert.equal(await bodyText(new Request('https://w/x'), 100), '');
  assert.equal(await bodyText(post('x'.repeat(101)), 100), null);
  // A body sent in pieces (no Content-Length): counted as it comes.
  let pulled = 0;
  const endless = new ReadableStream({ pull: c => (pulled++, c.enqueue(new Uint8Array(64))) });
  assert.equal(await bodyText(new Request('https://w/x', { method: 'POST', body: endless, duplex: 'half' }), 1000), null);
  assert.ok(pulled < 40, 'stopped at the limit');
  // A Content-Length past the limit: refused before reading.
  assert.equal(await bodyText({ headers: new Headers({ 'Content-Length': '999999' }), body: null }, 100), null);
});

test('/eco: a body past 8 MB is refused before anything reads it', async () => {
  const big = JSON.stringify({ op: 'login', app: 'stock', pad: 'x'.repeat(8_100_000) });
  const res = await worker.fetch(new Request('https://proxy.test/eco', { method: 'POST', headers: { Origin: ORIGIN }, body: big }), { STORE: {}, ECO_TOKEN_SECRET: 's' }, ctx);
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error.code, 'INVALID_JSON');
});

test('a route that throws answers 500 with the CORS headers, not a blocked request', async () => {
  const env = { RATE_LIMIT_KV: { get: async () => { throw new Error('KV down'); } } };
  const res = await worker.fetch(new Request('https://proxy.test/push/key', { headers: { Origin: ORIGIN } }), env, ctx);
  assert.equal(res.status, 500);
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), ORIGIN);
  assert.equal((await res.json()).error.code, 'WORKER_FAILED');
});
