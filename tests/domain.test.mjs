import test from 'node:test';
import assert from 'node:assert/strict';
import { homes, DOMAIN, API, SITE, ORIGINS, WORKERS_DEV, PAGES } from '../kit/domain.mjs';
import { isAllowedOrigin } from '../http.js';

test('domain: none set, everything where it always was', () => {
  if (DOMAIN) return;
  assert.equal(API, WORKERS_DEV);
  assert.equal(SITE, PAGES);
  assert.deepEqual(ORIGINS, [PAGES]);
  assert.ok(isAllowedOrigin('https://jaypengx.github.io'));
  assert.ok(!isAllowedOrigin('https://example.tw'));
});

test('domain: set, a page on it reaches api.<domain>; GitHub Pages still workers.dev; both may call', () => {
  const on = homes('Example.TW', 'example.tw');
  assert.equal(on.api, 'https://api.example.tw');
  assert.equal(on.site, 'https://example.tw');
  assert.deepEqual(on.origins, ['https://jaypengx.github.io', 'https://example.tw']);
  assert.ok(on.isApi('https://api.example.tw/law-chat'));
  assert.ok(on.isApi('https://orbit-workers-proxy.pengzjay.workers.dev/eco'));
  assert.ok(!on.isApi('https://example.tw/Orbit-Law/'));
  const old = homes('example.tw', 'jaypengx.github.io');
  assert.equal(old.api, WORKERS_DEV);
  assert.equal(old.site, 'https://example.tw');
  assert.equal(homes('example.tw', undefined).api, WORKERS_DEV, 'the Workers themselves');
  assert.ok(!homes('example.tw', 'api.example.tw.evil.com').on);
});
