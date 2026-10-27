import test from 'node:test';
import assert from 'node:assert/strict';
import { site, FOLDERS } from '../site.js';

const pages = (status = 200, headers = {}) => {
  const asked = [];
  const fetcher = async (url, init) => (asked.push({ url, init }), new Response(status === 200 ? 'ok' : '', { status, headers }));
  return { asked, fetcher };
};

test('site: an app on the domain is GitHub Pages at the same path, query kept', async () => {
  const p = pages(200, { 'Content-Type': 'text/html', 'Cache-Control': 'max-age=600' });
  const res = await site(new Request('https://example.tw/Orbit-Law/index.html?x=1', { headers: { 'If-None-Match': '"a"', Cookie: 'no' } }), p.fetcher);
  assert.equal(res.status, 200);
  assert.equal(await res.text(), 'ok');
  assert.equal(p.asked[0].url, 'https://jaypengx.github.io/Orbit-Law/index.html?x=1');
  assert.equal(p.asked[0].init.headers.get('If-None-Match'), '"a"');
  assert.equal(p.asked[0].init.headers.get('Cookie'), null);
  assert.equal(res.headers.get('Cache-Control'), 'max-age=600');
});

test('site: Pages redirects stay on the domain; the bare domain opens the home page', async () => {
  const p = pages(301, { Location: 'https://jaypengx.github.io/Orbit-Law/' });
  const res = await site(new Request('https://example.tw/Orbit-Law'), p.fetcher);
  assert.equal(res.status, 301);
  assert.equal(res.headers.get('Location'), 'https://example.tw/Orbit-Law/');
  const home = await site(new Request('https://example.tw/'), p.fetcher);
  assert.equal(home.headers.get('Location'), 'https://example.tw/Shared-Proxy/');
});

test("site: only the family's folders, only reads", async () => {
  const p = pages();
  assert.equal((await site(new Request('https://example.tw/Some-Other-Repo/'), p.fetcher)).status, 404);
  assert.equal((await site(new Request('https://example.tw/Orbit-Law/', { method: 'POST', body: 'x' }), p.fetcher)).status, 405);
  assert.equal(p.asked.length, 0);
  for (const f of ['Shared-Proxy', 'Orbit-Sports', 'Orbit-Securities', 'Orbit-Class', 'Longshot', 'Orbit-Money']) assert.ok(FOLDERS.has(f), f);
});
