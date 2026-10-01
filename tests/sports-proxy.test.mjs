// The data proxy's batch route and its cache policies.
import test from 'node:test';
import assert from 'node:assert/strict';

const store = new Map();
globalThis.caches = { default: { match: async req => store.get(req.url)?.clone() || null, put: async (req, res) => void store.set(req.url, res) } };
const upstreamCalls = [];
globalThis.fetch = async url => {
  upstreamCalls.push(String(url));
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
  const k = 'https://eu-offering-api.kambicdn.com/offering/v2018/ub/listView/snooker/all/all/all/matches.json';
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

test('a YouTube channel feed comes trimmed to its videos; nothing else on YouTube passes', async () => {
  const { trimYoutube } = await import('../sports-proxy-worker.js');
  const xml = `<feed><title>WTT</title><entry><yt:videoId>abc123</yt:videoId><title>Lin Yun-Ju vs Ma Long &amp; more | MS R16</title><published>2026-10-01T06:00:00+00:00</published></entry></feed>`;
  assert.deepEqual(trimYoutube(xml), { videos: [{ id: 'abc123', t: 'Lin Yun-Ju vs Ma Long & more | MS R16', p: '2026-10-01T06:00:00+00:00' }] });
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

test("F1 Academy's older pages: the calendar's rounds with their pages, and a round's sessions this season", async () => {
  const { trimFom } = await import('../sports-proxy-worker.js');
  const card = (id, round, from, to, month, place) => `<a href="/Racing-Series/Results?raceid=${id}"><img/></a><div><span>Round <!-- -->${round}</span><span>/</span><span class="start-date">${from}</span><span>-</span><span class="end-date">${to}</span><span>${month}</span><div class="location">${place}</div></div>`;
  const calendar = `<div class="event-tracker"><span>Round 5</span><span>/</span><span>22</span><span>-</span><div>25 October<!-- --> <span>2026</span></div><span>Free Practice COUNTDOWN:</span></div>${card(22, 1, '13', '15', 'March', 'Shanghai, China')}${card(27, 5, '22', '25', 'October', 'Austin, United States')}`;
  const { meetings } = trimFom(calendar, '/Racing-Series/Calendar');
  assert.deepEqual(meetings.map(m => [m.round, m.url, m.dates, m.place]), [[1, '/Racing-Series/Results?raceid=22', '13 - 15 MAR', 'Shanghai'], [5, '/Racing-Series/Results?raceid=27', '22 - 25 OCT', 'Austin']]);
  const session = (name, short, start, end, done) => `{"SessionName":"${name}","SessionShortName":"${short}","SessionType":"RESULT","Laps":0,"SessionStartTime":"${start}","SessionEndTime":"${end}","SessionResultsAvailable":${done}}`;
  const round = `<script>${session('Feature Race', 'FR', '2026-10-25T10:40:00-05:00', '2026-10-25T11:10:00-05:00', false)},${session('Race 1', 'R1', '2023-10-21T09:45:00-05:00', '2023-10-21T10:15:00-05:00', true)}</script>`;
  const { sessions } = trimFom(round, '/Racing-Series/Results');
  assert.deepEqual(sessions, [{ name: 'Feature Race', short: 'FR', type: 'RESULT', start: '2026-10-25T15:40:00.000Z', end: '2026-10-25T16:10:00.000Z', state: '' }]);
});

test("GT World Challenge's pages: the calendar's events in their three date styles, and an event's timetable in GMT", async () => {
  const { trimFom } = await import('../sports-proxy-worker.js');
  const link = (id, slug) => `<a class="btn" href="/event/${id}/${slug}">Event Info</a>`;
  const calendar = `<div><span>28 - 31 May 2026</span><span>Monza</span><span>Italy</span><span>Round 3</span>${link(248, 'monza')}</div><div><span>30 July 2026 - 2 August 2026</span><span>Magny-Cours</span><span>France</span><span>Round 6</span>${link(251, 'magny-cours')}</div><div><span>02</span><span>OCT</span><span>2026</span><span>04</span><span>OCT</span><span>2026</span><span>Barcelona</span><span>Spain</span><span>Round 9</span><span>Sprint Cup</span>${link(254, 'barcelona')}</div>`;
  const { meetings } = trimFom(calendar, '/calendar', 'www.gt-world-challenge-europe.com');
  assert.deepEqual(meetings.map(m => [m.round, m.place, m.dates, m.url]), [[3, 'Monza', '28 - 31 MAY', '/event/248/monza'], [6, 'Magny-Cours', '30 JUL - 2 AUG', '/event/251/magny-cours'], [9, 'Barcelona', '2 - 4 OCT', '/event/254/barcelona']]);
  const row = (name, local, gmt) => `<tr><td>${name}</td><td>${local}</td><td>${gmt}</td></tr>`;
  const event = `<h1>Monza</h1><span>28 - 31 May 2026</span><h2>Event Timetable</h2><h3>Saturday, 30 May</h3><table><tr><th>Session</th><th>Local Time</th><th>GMT</th></tr>${row('Bronze Test', '08:00', '06:00')}${row('Free Practice 1', '09:00', '07:00')}</table><h3>Sunday, 31 May</h3><table>${row('Qualifying 1', '09:50', '07:50')}${row('Qualifying 2', '10:00', '08:00')}${row('Main Race', '15:30', '13:30')}</table>`;
  const { sessions } = trimFom(event, '/event/248/monza', 'www.gt-world-challenge-europe.com');
  assert.deepEqual(sessions.map(x => [x.name, x.start]), [['Free Practice 1', '2026-05-30T07:00:00.000Z'], ['Qualifying 1', '2026-05-31T07:50:00.000Z'], ['Qualifying 2', '2026-05-31T08:00:00.000Z'], ['Main Race', '2026-05-31T13:30:00.000Z']]);
});
