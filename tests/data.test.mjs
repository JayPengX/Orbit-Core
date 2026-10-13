import test from 'node:test';
import assert from 'node:assert/strict';
import { frame, frames, cleanPath, PAGES } from '../data.js';

const worker = (await import('../worker.js')).default;
const ctx = { waitUntil() {}, passThroughOnException() {} };
const enc = s => new TextEncoder().encode(s);

// A fake R2 bucket.
function fakeR2() {
  const m = new Map();
  return {
    m,
    async get(k) {
      const v = m.get(k);
      return v ? { body: new Blob([v.bytes]).stream(), httpEtag: `"${v.etag}"` } : null;
    },
    async put(k, bytes) {
      m.set(k, { bytes: new Uint8Array(bytes), etag: `e${m.size}` });
    },
    async delete(k) {
      m.delete(k);
    },
    async list({ prefix } = {}) {
      return { objects: [...m.keys()].filter(k => !prefix || k.startsWith(prefix)).map(k => ({ key: k, etag: m.get(k).etag, size: m.get(k).bytes.length })), truncated: false };
    }
  };
}
const ask = (path, init = {}, env = {}) => worker.fetch(new Request(`https://orbit-workers-proxy.test${path}`, { headers: { Origin: 'https://jaypengx.github.io', ...(init.headers || {}) }, ...init }), env, ctx);
const streamOf = parts => new Blob(parts).stream();

test('frames: written and read back, a deletion among them, split across chunks', async () => {
  const bytes = [frame('sports/mlb/2026.json', enc('{"a":1}')), frame('mirror/old.json.gz', null), frame('bus/Hsinchu.json', enc('x'.repeat(70_000)))];
  const whole = new Uint8Array(bytes.reduce((n, b) => n + b.length, 0));
  let at = 0;
  for (const b of bytes) whole.set(b, (at += b.length) - b.length);
  // Delivered in odd pieces, as a network does.
  const pieces = [];
  for (let i = 0; i < whole.length; i += 777) pieces.push(whole.slice(i, i + 777));
  const out = [];
  for await (const f of frames(streamOf(pieces))) out.push(f);
  assert.equal(out.length, 3);
  assert.equal(out[0].path, 'sports/mlb/2026.json');
  assert.equal(new TextDecoder().decode(out[0].bytes), '{"a":1}');
  assert.deepEqual(out[1], { path: 'mirror/old.json.gz', del: true });
  assert.equal(out[2].bytes.length, 70_000);
});

test('paths: no climbing out, no empty parts', () => {
  assert.equal(cleanPath('sports/index.json'), 'sports/index.json');
  assert.equal(cleanPath('mirror/_/site.api.espn.com/x~3Fy.json.gz'), 'mirror/_/site.api.espn.com/x~3Fy.json.gz');
  for (const bad of ['../secret', 'a//b', '/abs', 'a/./b', '%2e%2e/x', '']) assert.equal(cleanPath(bad), null, bad);
});

test('push: only with the secret; files written and deleted; then read, with the Worker\'s CORS and an ETag', async () => {
  const DATA = fakeR2();
  const env = { DATA, DATA_PUSH_SECRET: 's3cret' };
  const body = new Blob([frame('sports/index.json', enc('{"built":1}')), frame('where.json', enc('{"v":1}'))]);
  assert.equal((await ask('/data/push', { method: 'POST', body }, env)).status, 401);
  assert.equal((await ask('/data/push', { method: 'POST', body, headers: { Authorization: 'Bearer wrong' } }, env)).status, 401);
  const ok = await ask('/data/push', { method: 'POST', body, headers: { Authorization: 'Bearer s3cret' } }, env);
  assert.deepEqual(await ok.json(), { put: 2, gone: 0, bad: [] });
  const del = await ask('/data/push', { method: 'POST', body: new Blob([frame('where.json', null), frame('../x', enc('no'))]), headers: { Authorization: 'Bearer s3cret' } }, env);
  assert.deepEqual(await del.json(), { put: 0, gone: 1, bad: ['../x'] });
  assert.deepEqual([...DATA.m.keys()], ['sports/index.json']);

  const res = await ask('/data/sports/index.json', {}, env);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { built: 1 });
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), 'https://jaypengx.github.io');
  assert.equal(res.headers.get('Content-Type'), 'application/json');
  const tag = res.headers.get('ETag');
  assert.ok(tag);
  assert.equal((await ask('/data/sports/index.json', { headers: { 'If-None-Match': tag } }, env)).status, 304);

  const listed = await (await ask('/data/_list', { headers: { Authorization: 'Bearer s3cret' } }, env)).json();
  assert.deepEqual(listed.files.map(f => f[0]), ['sports/index.json']);
});

test('a file not moved yet: Shared-Data\'s Pages copy; not there either: 404', async () => {
  const real = globalThis.fetch;
  const asked = [];
  globalThis.fetch = async url => {
    asked.push(String(url));
    return String(url).endsWith('bus/Hsinchu.json') ? new Response('{"v":2}', { status: 200 }) : new Response('', { status: 404 });
  };
  try {
    const env = { DATA: fakeR2() };
    const res = await ask('/data/bus/Hsinchu.json', {}, env);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { v: 2 });
    assert.equal(asked[0], `${PAGES}bus/Hsinchu.json`);
    assert.equal((await ask('/data/bus/Nowhere.json', {}, env)).status, 404);
  } finally {
    globalThis.fetch = real;
  }
});

test('no bucket yet: pushing says so (the builder carries on), reading is Pages\'', async () => {
  const res = await ask('/data/push', { method: 'POST', body: new Blob([]), headers: { Authorization: 'Bearer s' } }, { DATA_PUSH_SECRET: 's' });
  assert.equal(res.status, 503);
});
