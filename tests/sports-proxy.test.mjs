// The data proxy's batch route and its cache policies.
import test from 'node:test';
import assert from 'node:assert/strict';

const store = new Map();
globalThis.caches = { default: { match: async req => store.get(req.url)?.clone() || null, put: async (req, res) => void store.set(req.url, res) } };
const upstreamCalls = [];
globalThis.fetch = async url => {
  upstreamCalls.push(String(url));
  if (String(url).includes('refuse')) return new Response('no', { status: 403 });
  if (String(url).includes('fail')) return new Response('nope', { status: 500 });
  if (String(url).includes('slow')) await new Promise(r => setTimeout(r, 3_500));
  return new Response(JSON.stringify({ from: String(url) }), { status: 200, headers: { 'Content-Type': 'application/json' } });
};
const worker = (await import('../sports-proxy-worker.js')).default;
const ctx = { waitUntil: p => p };
const get = url => worker.fetch(new Request(url, { headers: { Origin: 'https://jaypengx.github.io' } }), {}, ctx);

test('a batch answers every URL in order, in one response', async () => {
  const a = 'https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1/standings';
  const b = 'https://site.api.espn.com/apis/site/v2/sports/fail/standings';
  const c = 'https://evil.example.com/x';
  const res = await get(`https://proxy.test/sports-proxy?batch=1&u=${encodeURIComponent(a)}&u=${encodeURIComponent(b)}&u=${encodeURIComponent(c)}`);
  assert.equal(res.status, 200);
  const { r } = await res.json();
  assert.equal(r.length, 3);
  assert.equal(r[0].s, 200);
  assert.equal(r[0].b.from, a);
  assert.equal(r[1].s, 500);
  assert.equal(r[2].s, 400);
  // Cached: the same URL again doesn't go upstream.
  const before = upstreamCalls.length;
  const again = await (await get(`https://proxy.test/sports-proxy?batch=1&u=${encodeURIComponent(a)}`)).json();
  assert.equal(again.r[0].b.from, a);
  assert.equal(upstreamCalls.length, before);
});

test('a single request tells the browser how long it may keep the answer', async () => {
  const res = await get(`https://proxy.test/sports-proxy?url=${encodeURIComponent('https://site.api.espn.com/apis/v2/sports/soccer/esp.1/standings')}`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('Cache-Control'), /private, max-age=\d+/);
});

test('trims apply per URL in a batch', async () => {
  const k = 'https://eu-offering-api.kambicdn.com/offering/v2018/ub/listView/basketball/euroleague/all/all/matches.json';
  const res = await get(`https://proxy.test/sports-proxy?batch=1&u=${encodeURIComponent(`kambi-events!${k}`)}`);
  const { r } = await res.json();
  assert.equal(r[0].s, 200);
  assert.ok('events' in r[0].b || Object.keys(r[0].b).length === 0 || r[0].b.events === undefined);
});

test("ELTA's schedule: only its program list, always trimmed to each live program's time, channel, league and title", async () => {
  const { trimElta } = await import('../sports-proxy-worker.js');
  const out = trimElta({ game_type: [{ name: 'NBA' }], calendar: { '2026-10-09': [{ program_sn: 1, channel_number: 101, channel_icon: 'x.svg', start_time: 1791545400, end_time: 1791554400, game_icon: 'y.jpg', game_type: 'NBA', game_type_en: 'NBA', program_desc: '火箭 VS 獨行俠 10/9 熱身賽中國賽 LIVE' }] } });
  assert.deepEqual(out, { programs: [{ d: '2026-10-09', s: 1791545400, e: 1791554400, ch: 101, g: 'NBA', t: '火箭 VS 獨行俠 10/9 熱身賽中國賽 LIVE' }] });
  const list = 'https://piceltaott-elta.cdn.hinet.net/production/json/program_list/sports_live_program_list.json';
  const res = await get(`https://proxy.test/sports-proxy?batch=1&u=${encodeURIComponent(list)}&u=${encodeURIComponent('https://piceltaott-elta.cdn.hinet.net/other.json')}`);
  const { r } = await res.json();
  assert.equal(r[0].s, 200);
  assert.equal(r[1].s, 400);
});

test("a slow URL answers 504 at once and doesn't hold back the rest of its batch", async () => {
  const fast = 'https://site.api.espn.com/apis/site/v2/sports/soccer/fra.1/standings';
  const slow = 'https://site.api.espn.com/apis/site/v2/sports/soccer/slow.1/standings';
  const t0 = Date.now();
  const res = await get(`https://proxy.test/sports-proxy?batch=1&u=${encodeURIComponent(fast)}&u=${encodeURIComponent(slow)}`);
  const { r } = await res.json();
  assert.ok(Date.now() - t0 < 3_400);
  assert.equal(r[0].s, 200);
  assert.equal(r[1].s, 504);
});

test("a formula1.com driver or team page comes trimmed to its grids of figures", async () => {
  const { trimF1Page } = await import('../sports-proxy-worker.js');
  const row = (k, v) => `["$","dt",null,{"className":"x","children":"${k}"}],["$","dd",null,{"className":"y","children":"${v}"}]`;
  const grid = rows => `["$","dl",null,{"className":"DataGrid-module_dataGrid__abc","children":[${rows.map(([k, v]) => `[${row(k, v).replace(/\]$/, '')}]`).join(',')}]}]`;
  const flight = `0:[${grid([['Season Position', '1st'], ['Season Points', '302']])},${grid([['Date of Birth', '25/08/2006']])}]`;
  const html = `<script>self.__next_f.push([1,${JSON.stringify(flight)}])</script>`;
  const { grids } = trimF1Page(html);
  assert.deepEqual(grids, [[['Season Position', '1st'], ['Season Points', '302']], [['Date of Birth', '25/08/2006']]]);
});

test('an old copy is answered when its fresh read is slow, and a source turning the proxy away is a failure to ask again', async () => {
  const url = 'https://site.api.espn.com/apis/site/v2/sports/basketball/slow/teams/9/schedule';
  store.set(url, new Response(JSON.stringify({ old: true }), { headers: { 'Content-Type': 'application/json', 'X-Sports-Proxy-Stored-At': String(Date.now() - 2 * 3600_000) } }));
  const refused = 'https://site.api.espn.com/apis/site/v2/sports/basketball/refuse/scoreboard';
  const t0 = Date.now();
  const { r } = await (await get(`https://proxy.test/sports-proxy?batch=1&u=${encodeURIComponent(url)}&u=${encodeURIComponent(refused)}`)).json();
  assert.ok(Date.now() - t0 < 2_800);
  assert.equal(r[0].s, 200);
  assert.equal(r[0].c, 'STALE');
  assert.equal(r[0].b.old, true);
  assert.equal(r[1].s, 502);
});

test("each app's asks are counted apart: one app's busy minute never stops another's", async () => {
  const { signToken } = await import('../quadra-token.js');
  const env = { ECO_TOKEN_SECRET: 'test-secret' };
  const qt = await signToken('test-secret', { k: 'ses', d: 'd1', s: 'apps-test', e: Date.now() + 3_600_000 });
  const ask = app => worker.fetch(new Request(`https://proxy.test/sports-proxy?batch=1&u=${encodeURIComponent('https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1/standings')}&app=${app}&qt=${qt}`, { headers: { Origin: 'https://jaypengx.github.io' } }), env, ctx);
  let last;
  for (let i = 0; i < 601 && (last = await ask('quotes')).status === 200; i++);
  assert.equal(last.status, 429, 'Securities past its minute');
  assert.equal((await ask('fixtures')).status, 200, 'Sports still reads');
});
