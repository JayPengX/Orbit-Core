import test from 'node:test';
import assert from 'node:assert/strict';
import { homes, WORKERS_DEV } from '../kit/domain.mjs';
import { isAllowedOrigin } from '../http.js';

test('domain: one is always set; the old GitHub Pages address may not call', () => {
  assert.throws(() => homes('', 'orbit.example.tw'));
  assert.ok(!isAllowedOrigin('https://jaypengx.github.io'));
  assert.ok(isAllowedOrigin('https://orbit.jaypengx.com'));
});

test('domain: a page on it reaches the proxy at its own /api; anywhere else, workers.dev', () => {
  const on = homes('Example.TW', 'orbit.example.tw');
  assert.ok(on.on);
  assert.equal(on.api, 'https://orbit.example.tw/api');
  assert.equal(homes('example.tw', 'example.tw').api, 'https://example.tw/api', 'the showcase reaches it at its own address too');
  assert.ok(on.isApi('https://orbit.example.tw/api/eco'));
  assert.ok(!on.isApi('https://orbit.example.tw/law/'));
  assert.equal(on.site, 'https://orbit.example.tw');
  assert.equal(on.home, 'https://example.tw');
  assert.deepEqual(on.origins, ['https://orbit.example.tw', 'https://example.tw']);
  assert.ok(homes('example.tw', 'example.tw').on, 'the bare domain (the showcase)');
  assert.ok(!homes('example.tw', 'longshot.example.tw').on, 'another subdomain is not the family');
  assert.ok(on.isApi('https://api.example.tw/law-chat'));
  assert.ok(on.isApi('https://orbit-workers-proxy.pengzjay.workers.dev/eco'));
  assert.ok(!on.isApi('https://example.tw/Orbit-Law/'));
  const old = homes('example.tw', 'jaypengx.github.io');
  assert.equal(old.api, WORKERS_DEV);
  assert.equal(old.site, 'https://orbit.example.tw');
  assert.equal(homes('example.tw', undefined).api, WORKERS_DEV, 'the Workers themselves');
  assert.ok(!homes('example.tw', 'api.example.tw.evil.com').on);
});
