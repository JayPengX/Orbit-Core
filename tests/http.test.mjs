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

test('a caller is an IPv4 address, or an IPv6 /64 (a guesser changing address within its block counts as one)', async () => {
  const { ipBucket } = await import('../http.js');
  assert.equal(ipBucket('1.2.3.4'), '1.2.3.4');
  assert.equal(ipBucket('2001:db8::1'), ipBucket('2001:0db8:0000:0000:ffff::9'));
  assert.notEqual(ipBucket('2001:db8:0:1::1'), ipBucket('2001:db8:0:2::1'));
});

test('gzipLines: gzip as it goes, read back whole by zlib; each write readable at once (a sync flush), before the next is written', async () => {
  const { gzipLines } = await import('../http.js');
  const { gunzipSync, createGunzip } = await import('node:zlib');
  const cat = parts => Buffer.concat(parts.map(p => Buffer.from(p)));
  let seed = 11;
  const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const cases = [[], [new Uint8Array(0)], [new Uint8Array(1)], [new Uint8Array(70_000)], [new TextEncoder().encode('ab'), new TextEncoder().encode('c')]];
  for (let t = 0; t < 120; t++) {
    const chunks = [];
    for (let j = 0, k = 1 + Math.floor(rnd() * 4); j < k; j++) {
      const c = new Uint8Array(Math.floor(rnd() ** 3 * 120_000));
      const alpha = 1 + Math.floor(rnd() * 255);
      // (Runs and repeats from up to 40 KB back, past the 32 KB window: every length and distance.)
      for (let i = 0; i < c.length; i++) c[i] = i > 300 && rnd() < 0.4 ? c[i - 1 - Math.floor(rnd() ** 4 * Math.min(i, 40_000))] : Math.floor(rnd() * alpha);
      chunks.push(c);
    }
    cases.push(chunks);
  }
  for (const chunks of cases) {
    const g = gzipLines();
    const z = cat([...chunks.map(c => g.write(c)), g.end()]);
    assert.deepEqual(gunzipSync(z), cat(chunks));
  }
  // Fed only the first write's bytes, a streaming reader has all of the first line.
  const line = (k, n) => new TextEncoder().encode(`${JSON.stringify({ k, hours: Array.from({ length: n }, (_, i) => ({ t: i * 3600, temp: 20 + (i % 7), pop: (i * 13) % 100 })) })}\n`);
  const g = gzipLines();
  const one = line(1, 300);
  const first = g.write(one);
  const un = createGunzip();
  const got = [];
  un.on('data', d => got.push(d));
  un.write(first);
  await new Promise(r => setTimeout(r, 20));
  assert.deepEqual(Buffer.concat(got), Buffer.from(one));
  const two = line(2, 300);
  un.end(cat([g.write(two), g.end()]));
  await new Promise(r => un.on('end', r));
  assert.deepEqual(Buffer.concat(got), cat([one, two]));
  assert.ok(first.length < one.length / 3, `${first.length} of ${one.length}`);
});

test('lineAnswer: gzipped where the caller takes gzip, each line flushed as written; as it was where not', async () => {
  const { lineAnswer } = await import('../http.js');
  const { gunzipSync, createGunzip } = await import('node:zlib');
  const answer = async (accept, lines) => {
    const a = lineAnswer(new Request('https://w.example/', { headers: accept ? { 'Accept-Encoding': accept } : {} }), { Vary: 'Origin', 'X-A': '1' });
    const reading = (async () => {
      const r = a.response.body.getReader();
      const parts = [];
      for (;;) {
        const { done, value } = await r.read();
        if (done) return parts;
        parts.push(value);
      }
    })();
    for (const l of lines) await a.line(l);
    await a.end();
    return { res: a.response, parts: await reading };
  };
  const lines = [{ quick: true, hours: [1, 2, 3] }, { whole: true, hours: [1, 2, 3, 4] }];
  const zipped = await answer('gzip, deflate, br', lines);
  assert.equal(zipped.res.headers.get('Content-Encoding'), 'gzip');
  assert.equal(zipped.res.headers.get('Vary'), 'Origin, Accept-Encoding');
  assert.equal(zipped.res.headers.get('X-A'), '1');
  assert.match(zipped.res.headers.get('Content-Type'), /x-ndjson/);
  assert.equal(gunzipSync(Buffer.concat(zipped.parts)).toString(), lines.map(l => `${JSON.stringify(l)}\n`).join(''));
  // The first part alone: the first line, whole.
  const un = createGunzip();
  const got = [];
  un.on('data', d => got.push(d));
  un.write(zipped.parts[0]);
  await new Promise(r => setTimeout(r, 20));
  assert.equal(Buffer.concat(got).toString(), `${JSON.stringify(lines[0])}\n`);
  un.destroy();
  const plain = await answer('', lines);
  assert.equal(plain.res.headers.get('Content-Encoding'), null);
  assert.equal(Buffer.concat(plain.parts).toString(), lines.map(l => `${JSON.stringify(l)}\n`).join(''));
});
