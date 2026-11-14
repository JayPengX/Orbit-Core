// The security audit (2026-11-14): every answer of the proxy is data a page
// fetches, never a page that runs on the site's address (where the Pass's
// sign-in and the admin key are kept); no Orbit page sits in another site's
// frame, and the owner's panel in none at all.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker.js';
import { LOCKED } from '../http.js';
import { SITE_HEADERS, ownHeaders, siteFor } from '../deploy/cf-site.mjs';
import { readFileSync } from 'node:fs';

const env = { ECO_TOKEN_SECRET: 'headers-secret' };
const ctx = { waitUntil: () => {}, passThroughOnException: () => {} };

test('every proxy answer, found or refused, carries nosniff and a sandbox with no frame', async () => {
  assert.match(LOCKED['Content-Security-Policy'], /\bsandbox\b/);
  assert.match(LOCKED['Content-Security-Policy'], /frame-ancestors 'none'/);
  assert.match(LOCKED['Content-Security-Policy'], /default-src 'none'/);
  for (const [path, init] of [
    ['/guard', {}],
    ['/nowhere', {}],
    ['/gemini', { method: 'POST', headers: { Origin: 'https://example.com' }, body: '{}' }],
    ['/api/sports-today', {}]
  ]) {
    const r = await worker.fetch(new Request(`https://orbit.jaypengx.com${path}`, init), env, ctx);
    for (const [k, v] of Object.entries(LOCKED)) assert.equal(r.headers.get(k), v, `${path} ${k}`);
  }
});

test('every static site: nosniff and framed only by its own pages; the admin panel never framed', () => {
  assert.match(SITE_HEADERS, /^\/\*\n/);
  assert.match(SITE_HEADERS, /X-Content-Type-Options: nosniff/);
  assert.match(SITE_HEADERS, /Content-Security-Policy: frame-ancestors 'self'/);
  // (The kit stays readable from the bare domain: the showcase loads it.)
  assert.match(SITE_HEADERS, /Access-Control-Allow-Origin: \*/);
  const admin = ownHeaders(readFileSync(new URL('../site/_headers', import.meta.url), 'utf8'), siteFor('Orbit-Core').put);
  for (const at of ['/pass/admin/*', '/Orbit-Core/admin/*']) {
    const block = admin.split(/\n(?=\/)/).find(b => b.startsWith(at));
    assert.ok(block, at);
    assert.match(block, /frame-ancestors 'none'/);
    assert.match(block, /X-Frame-Options: DENY/);
  }
});
