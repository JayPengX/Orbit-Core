import test from 'node:test';
import assert from 'node:assert/strict';
import { site } from '../site.js';
import { SHORT, BRANDS } from '../kit/brand.mjs';

test('site: longshot.<domain> is the shutdown notice, at every address', async () => {
  const n = await site(new Request('https://longshot.example.tw/'));
  assert.equal(n.status, 200);
  assert.match(await n.text(), /Longshot 已停止服務/);
  assert.equal((await site(new Request('https://longshot.example.tw/admin/'))).status, 410);
  const sw = await site(new Request('https://longshot.example.tw/sw.js'));
  assert.match(sw.headers.get('Content-Type'), /javascript/);
  assert.match(await sw.text(), /unregister/);
});

test("site: nothing else is read here (each repo's site is on Cloudflare's routes)", async () => {
  assert.equal((await site(new Request('https://orbit.example.tw/law/'))).status, 404);
  assert.equal((await site(new Request('https://example.tw/'))).status, 404);
  assert.equal((await site(new Request('https://orbit.example.tw/law/', { method: 'POST', body: 'x' }))).status, 405);
});

test('every app has a short name', () => {
  for (const b of Object.values(BRANDS)) assert.equal(SHORT[b.slug], b.repo, b.repo);
  assert.deepEqual(['money', 'news', 'sports', 'weather', 'transit', 'law', 'class', 'words', 'beats', 'securities', 'pass'].filter(k => !SHORT[k]), []);
});
