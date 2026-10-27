import test from 'node:test';
import assert from 'node:assert/strict';
import { site } from '../site.js';
import { SHORT, BRANDS } from '../kit/brand.mjs';

const pages = (status = 200, headers = {}) => {
  const asked = [];
  const fetcher = async (url, init) => (asked.push({ url, init }), new Response(status === 200 ? 'ok' : '', { status, headers }));
  return { asked, fetcher };
};

test('site: an app at its short name is its repo on GitHub Pages, query kept', async () => {
  const p = pages(200, { 'Content-Type': 'text/html', 'Cache-Control': 'max-age=600' });
  const res = await site(new Request('https://example.tw/law/index.html?x=1', { headers: { 'If-None-Match': '"a"', Cookie: 'no' } }), p.fetcher);
  assert.equal(res.status, 200);
  assert.equal(await res.text(), 'ok');
  assert.equal(p.asked[0].url, 'https://jaypengx.github.io/Orbit-Law/index.html?x=1');
  assert.equal(p.asked[0].init.headers.get('If-None-Match'), '"a"');
  assert.equal(p.asked[0].init.headers.get('Cookie'), null);
  assert.equal(res.headers.get('Cache-Control'), 'max-age=600');
  await site(new Request('https://example.tw/pass/brand/pass.svg'), p.fetcher);
  assert.equal(p.asked[1].url, 'https://jaypengx.github.io/Shared-Proxy/brand/pass.svg');
  await site(new Request('https://example.tw/Shared-Proxy/kit/orbit.mjs?v=1'), p.fetcher);
  assert.equal(p.asked[2].url, 'https://jaypengx.github.io/Shared-Proxy/kit/orbit.mjs?v=1');
});

test('site: an old path goes to the short one for good, but a service worker and version.json still answer there', async () => {
  const p = pages();
  const res = await site(new Request('https://example.tw/Orbit-Sports/index.html?a=b'), p.fetcher);
  assert.equal(res.status, 301);
  assert.equal(res.headers.get('Location'), 'https://example.tw/sports/index.html?a=b');
  assert.equal((await site(new Request('https://example.tw/Longshot/'), p.fetcher)).headers.get('Location'), 'https://example.tw/longshot/');
  assert.equal(p.asked.length, 0);
  assert.equal((await site(new Request('https://example.tw/Orbit-Sports/sw.js'), p.fetcher)).status, 200);
  assert.equal(p.asked[0].url, 'https://jaypengx.github.io/Orbit-Sports/sw.js');
});

test("site: Pages' redirects land on the short name; the bare domain opens the family page", async () => {
  const p = pages(301, { Location: 'https://jaypengx.github.io/Orbit-Law/' });
  const res = await site(new Request('https://example.tw/law'), p.fetcher);
  assert.equal(res.headers.get('Location'), 'https://example.tw/law/');
  assert.equal((await site(new Request('https://example.tw/'), p.fetcher)).headers.get('Location'), 'https://example.tw/pass/');
});

test("site: only the family's folders, only reads; every app has a short name", async () => {
  const p = pages();
  assert.equal((await site(new Request('https://example.tw/Some-Other-Repo/'), p.fetcher)).status, 404);
  assert.equal((await site(new Request('https://example.tw/Law/'), p.fetcher)).status, 404);
  assert.equal((await site(new Request('https://example.tw/law/', { method: 'POST', body: 'x' }), p.fetcher)).status, 405);
  assert.equal(p.asked.length, 0);
  for (const b of Object.values(BRANDS)) assert.equal(SHORT[b.slug], b.repo, b.repo);
  assert.deepEqual(['money', 'sports', 'weather', 'transit', 'law', 'class', 'words', 'beats', 'securities', 'pass', 'showcase', 'longshot'].filter(k => !SHORT[k]), []);
});
