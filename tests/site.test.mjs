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
  assert.equal(p.asked[1].url, 'https://jaypengx.github.io/Orbit-Core/brand/pass.svg');
  await site(new Request('https://example.tw/Orbit-Core/kit/orbit.mjs?v=1'), p.fetcher);
  assert.equal(p.asked[2].url, 'https://jaypengx.github.io/Orbit-Core/kit/orbit.mjs?v=1');
  // The repo's old name, which pages a phone keeps still load the kit from.
  await site(new Request('https://example.tw/Shared-Proxy/kit/orbit.mjs?v=1'), p.fetcher);
  assert.equal(p.asked[3].url, 'https://jaypengx.github.io/Orbit-Core/kit/orbit.mjs?v=1');
});

test("site: a repo's own name isn't an address on the domain", async () => {
  const p = pages();
  for (const path of ['/Orbit-Sports/', '/Orbit-Sports/sw.js', '/Longshot/', '/Orbit-Showcase/']) assert.equal((await site(new Request(`https://example.tw${path}`), p.fetcher)).status, 404, path);
  assert.equal(p.asked.length, 0);
});

test("site: Pages' redirects land on the short name; the bare domain opens the family page", async () => {
  const p = pages(301, { Location: 'https://jaypengx.github.io/Orbit-Law/' });
  const res = await site(new Request('https://example.tw/law'), p.fetcher);
  assert.equal(res.headers.get('Location'), 'https://example.tw/law/');
  const kit = pages(301, { Location: 'https://jaypengx.github.io/Orbit-Core/' });
  assert.equal((await site(new Request('https://example.tw/pass'), kit.fetcher)).headers.get('Location'), 'https://example.tw/pass/');
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
