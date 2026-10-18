import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchAllowed } from '../sports.js';

const answer = map => async url => map[url] ?? new Response('{}', { status: 200 });
const moved = to => new Response('', { status: 302, headers: { Location: to } });

test('the sports proxy follows a redirect only to an address it would take itself', async () => {
  const start = new URL('https://site.api.espn.com/apis/site/v2/a');
  // To another listed address: followed.
  const ok = await fetchAllowed(start, {}, answer({ [start.href]: moved('/apis/site/v2/b') }));
  assert.equal(ok.status, 200);
  // Off the list: a 502, never fetched.
  const seen = [];
  const away = await fetchAllowed(start, {}, async url => (seen.push(url), url === start.href ? moved('https://evil.example/x') : new Response('x')));
  assert.equal(away.status, 502);
  assert.deepEqual(seen, [start.href]);
  // A loop: given up after three.
  const loop = await fetchAllowed(start, {}, async () => moved(start.href));
  assert.equal(loop.status, 502);
});

test("a redirect to the same site's other host (a CDN) is followed; .com.tw counts three labels", async () => {
  const start = new URL('https://site.api.espn.com/apis/site/v2/a');
  assert.equal((await fetchAllowed(start, {}, async url => (url === start.href ? moved('https://a.espncdn.com/x') : new Response('{}')))).status, 502);
  assert.equal((await fetchAllowed(start, {}, async url => (url === start.href ? moved('https://cdn.espn.com/x') : new Response('{}')))).status, 200);
  const tw = new URL('https://www.twse.com.tw/rwd/zh/announcement/notice');
  assert.equal((await fetchAllowed(tw, {}, async url => (url === tw.href ? moved('https://evil.com.tw/x') : new Response('{}')))).status, 502);
});
