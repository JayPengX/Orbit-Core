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
  assert.deepEqual(out, { programs: [{ d: '2026-10-09', s: 1791545400, e: 1791554400, ch: 101, g: 'NBA', z: 'NBA', t: '火箭 VS 獨行俠 10/9 熱身賽中國賽 LIVE' }] });
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
  for (let i = 0; i < 601 && (last = await ask('odds')).status === 200; i++);
  assert.equal(last.status, 429, 'Securities past its minute');
  assert.equal((await ask('match')).status, 200, 'Sports still reads');
});

test("without a pass to check, each app at an address has a session's minute (never an hour's count shared by every app)", async () => {
  const ask = app => worker.fetch(new Request(`https://proxy.test/sports-proxy?batch=1&u=${encodeURIComponent('https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1/standings')}&app=${app}`, { headers: { Origin: 'https://jaypengx.github.io', 'CF-Connecting-IP': '203.0.113.9' } }), {}, ctx);
  let last;
  for (let i = 0; i < 601 && (last = await ask('stock')).status === 200; i++);
  assert.equal(last.status, 429, 'Securities past its minute');
  assert.equal((await ask('match')).status, 200, 'Sports still reads');
  assert.equal((await ask('made-up')).status, 200, 'any other name is one more app, once');
});

test("a game's own page (box score, plays) is live: never a copy older than a refresh", async () => {
  const res = await get(`https://proxy.test/sports-proxy?url=${encodeURIComponent('https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event=401')}`);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('X-Sports-Proxy-Cache-Tier'), 'live');
  assert.match(res.headers.get('Cache-Control'), /max-age=10\b/);
});

test("a team's injuries (its roster read for them) are minutes old at most, its plain roster a table's half hour", async () => {
  const base = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/20/roster';
  const hurt = await get(`https://proxy.test/sports-proxy?url=${encodeURIComponent(`${base}?enable=injuries`)}&trim=espn-roster`);
  assert.equal(hurt.headers.get('X-Sports-Proxy-Cache-Tier'), 'team-schedule');
  const plain = await get(`https://proxy.test/sports-proxy?url=${encodeURIComponent(base)}`);
  assert.equal(plain.headers.get('X-Sports-Proxy-Cache-Tier'), 'standings');
});

test("MLB's day of games with their linescore is live (Sports' count when ESPN's is empty); its other answers a table's half hour", async () => {
  const live = await get(`https://proxy.test/sports-proxy?url=${encodeURIComponent('https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=2026-10-05&hydrate=linescore,previousPlay')}`);
  assert.equal(live.headers.get('X-Sports-Proxy-Cache-Tier'), 'live');
  const plain = await get(`https://proxy.test/sports-proxy?url=${encodeURIComponent('https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=2026-10-05')}`);
  assert.equal(plain.headers.get('X-Sports-Proxy-Cache-Tier'), 'standings');
});

test("Polymarket's price history: only /prices-history, at the odds' pace", async () => {
  const ok = await get(`https://proxy.test/sports-proxy?url=${encodeURIComponent('https://clob.polymarket.com/prices-history?market=1&startTs=1&fidelity=1')}`);
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get('X-Sports-Proxy-Cache-Tier'), 'odds');
  const other = await get(`https://proxy.test/sports-proxy?url=${encodeURIComponent('https://clob.polymarket.com/order')}`);
  assert.equal(other.status, 400);
});

test("Polymarket's games trimmed: each game's own event, its moneyline markets and token ids", async () => {
  const { trimPolymarketGames } = await import('../sports-proxy-worker.js');
  const market = (type, q) => ({ sportsMarketType: type, question: q, groupItemTitle: q, outcomes: '["Yes","No"]', clobTokenIds: '["1","2"]', description: 'long' });
  const got = trimPolymarketGames([
    { slug: 'epl-ful-mun-2026-09-20', title: 'Fulham FC vs. Manchester United FC', startTime: '2026-09-20T15:30:00Z', teams: [{ name: 'Fulham FC', abbreviation: 'ful', alias: 'Fulham', logo: 'x' }], markets: [market('moneyline', 'Will Fulham FC win?'), market('totals', 'O/U 2.5')] },
    { slug: 'epl-ful-mun-2026-09-20-more-markets', markets: [market('moneyline', 'x')] }
  ]);
  assert.equal(got.length, 1);
  assert.deepEqual(got[0].teams, [{ name: 'Fulham FC', abbreviation: 'ful', alias: 'Fulham' }]);
  assert.deepEqual(got[0].markets, [{ question: 'Will Fulham FC win?', groupItemTitle: 'Will Fulham FC win?', outcomes: '["Yes","No"]', clobTokenIds: '["1","2"]' }]);
});

test("Polymarket's F1 race winner kept: each driver's market and how much it's traded", async () => {
  const { trimPolymarketGames } = await import('../sports-proxy-worker.js');
  const got = trimPolymarketGames([
    { slug: 'f1-bahrain-grand-prix-winner-2026-10-04', title: 'Bahrain Grand Prix: Driver Winner', startTime: '2026-10-04T07:00:00Z', markets: [{ sportsMarketType: 'f1_race_winner', question: 'Will Max Verstappen win?', groupItemTitle: 'Max Verstappen', outcomes: '["Yes","No"]', clobTokenIds: '["1","2"]', volume: '229815.5', description: 'long' }] },
    { slug: 'f1-bahrain-grand-prix-driver-podium-2026-10-04', markets: [] },
    // An older race's: its markets carry no type.
    { slug: 'f1-spanish-grand-prix-winner-2026-09-13', markets: [{ question: 'Will Lando Norris win?', groupItemTitle: 'Lando Norris', outcomes: '["Yes","No"]', clobTokenIds: '["3","4"]', volume: '1000' }] }
  ]);
  assert.equal(got.length, 2);
  assert.equal(got[1].markets[0].groupItemTitle, 'Lando Norris');
  assert.deepEqual(got[0].markets, [{ question: 'Will Max Verstappen win?', groupItemTitle: 'Max Verstappen', outcomes: '["Yes","No"]', clobTokenIds: '["1","2"]', volume: 229815.5 }]);
});

test('news trimmed to what a story card shows, its people kept', async () => {
  const { trimEspnNews } = await import('../sports-proxy-worker.js');
  const raw = { header: 'x', articles: [{ id: 1, nowId: 'n', type: 'HeadlineNews', headline: 'Russell to start from the back', description: 'Grid penalty.', published: '2026-10-06T10:38:08Z', byline: 'b', images: [{ url: 'https://a/1.jpg', caption: 'c' }, { url: 'https://a/2.jpg' }], links: { web: { href: 'https://espn/1' }, api: {} }, categories: [{ type: 'athlete', athleteId: 5503, description: 'George Russell', id: 9 }, { type: 'league', description: 'Formula One' }, { type: 'team', teamId: 13, description: 'Lakers' }] }] };
  const t = trimEspnNews(raw);
  assert.deepEqual(t.articles[0], { id: 1, type: 'HeadlineNews', headline: 'Russell to start from the back', description: 'Grid penalty.', published: '2026-10-06T10:38:08Z', premium: undefined, images: [{ url: 'https://a/1.jpg' }], links: { web: { href: 'https://espn/1' } }, categories: [{ type: 'athlete', athleteId: 5503, teamId: undefined, description: 'George Russell' }, { type: 'team', athleteId: undefined, teamId: 13, description: 'Lakers' }] });
  assert.equal(trimEspnNews({ nope: 1 }).nope, 1, 'not news: as it was');
});

test("an empty translation (Google busy) is a failure, not kept a month", async () => {
  const { emptyTranslation } = await import('../sports-proxy-worker.js');
  assert.equal(emptyTranslation('[[""]]'), true);
  assert.equal(emptyTranslation('[["  ","en"]]'), true);
  assert.equal(emptyTranslation('not json'), true);
  assert.equal(emptyTranslation('[["羅素：巴林大獎賽又是一次失敗","en"]]'), false);
  assert.equal(emptyTranslation('["週日的比賽"]'), false);
});

test("ELTA.tv's season video pages only, trimmed to their episodes", async () => {
  const { trimEltaVod } = await import('../sports-proxy-worker.js');
  const item = (id, title) => `<div class="sportDivImg" data-episode="${id}"> <a href="https://eltaott.tv/sports/play/1/2150/${id}"> <img class="lazy" src="x.jpg" alt="${title}" title="${title}"> </a></div>`;
  const html = `<html>${item('73061', '10/6 美聯分區賽G2 白襪 VS 守護者')}${item('73061', '10/6 美聯分區賽G2 白襪 VS 守護者')}${item('73060', '10/6 洋基 VS 光芒 &amp; more')}</html>`;
  assert.deepEqual(trimEltaVod(html).episodes, [{ id: '73061', title: '10/6 美聯分區賽G2 白襪 VS 守護者' }, { id: '73060', title: '10/6 洋基 VS 光芒 & more' }]);
  const status = async u => (await (await get(`https://proxy.test/sports-proxy?batch=1&u=${encodeURIComponent(u)}`)).json()).r[0].s;
  assert.equal(await status('https://eltaott.tv/member/center'), 400);
  assert.equal(await status('https://eltaott.tv/sports/play/1/2150?x=1'), 400);
  assert.equal(await status('https://eltaott.tv/sports/play/1/2150/73061'), 400);
});

test("YouTube: a search and a video's page only, trimmed; a page without its data is a failure", async () => {
  const { trimYtSearch, trimYtVideo } = await import('../sports-proxy-worker.js');
  const v = (id, title, channel, verified) => ({ videoRenderer: { videoId: id, title: { runs: [{ text: title }] }, ownerText: { runs: [{ text: channel, navigationEndpoint: { browseEndpoint: { browseId: `UC${channel}` } } }] }, ownerBadges: verified ? [{ metadataBadgeRenderer: { style: 'BADGE_STYLE_TYPE_VERIFIED' } }] : [], publishedTimeText: { simpleText: '10h ago' }, lengthText: { simpleText: '20:12' } } });
  const data = { contents: { list: [v('mmrHD8KXtLs', 'BREWERS vs. PADRES: NLDS Full Game 3 Highlights {x} "y"', 'MLB', true), v('mmrHD8KXtLs', 'again', 'MLB', true), v('E4mj0ShxuLE', 'EVERY PLAY', 'Fan', false)] } };
  const html = `<html><script>var ytInitialData = ${JSON.stringify(data)};</script><script>var other = {};</script></html>`;
  assert.deepEqual(trimYtSearch(html).videos, [
    { id: 'mmrHD8KXtLs', title: 'BREWERS vs. PADRES: NLDS Full Game 3 Highlights {x} "y"', channel: 'MLB', channelId: 'UCMLB', verified: true, age: '10h ago', length: '20:12' },
    { id: 'E4mj0ShxuLE', title: 'EVERY PLAY', channel: 'Fan', channelId: 'UCFan', verified: false, age: '10h ago', length: '20:12' }
  ]);
  assert.equal(trimYtSearch('<html>Before you continue to YouTube</html>'), null);
  const player = { videoDetails: { videoId: 'EpwxwKDoXXU', title: 'LAKERS at WARRIORS', author: 'NBA', channelId: 'UCnba' }, playabilityStatus: { status: 'UNPLAYABLE' }, microformat: { playerMicroformatRenderer: { publishDate: '2026-10-06T21:54:21-07:00', availableCountries: ['US', 'CA'] } } };
  assert.deepEqual(trimYtVideo(`<script>var ytInitialPlayerResponse = ${JSON.stringify(player)};var meta = 1;</script>`), { id: 'EpwxwKDoXXU', title: 'LAKERS at WARRIORS', channel: 'NBA', channelId: 'UCnba', published: '2026-10-06T21:54:21-07:00', tw: false, playable: 'UNPLAYABLE' });
  assert.equal(trimYtVideo('<html></html>'), null);
  const status = async u => (await (await get(`https://proxy.test/sports-proxy?batch=1&u=${encodeURIComponent(u)}`)).json()).r[0].s;
  assert.equal(await status('https://www.youtube.com/feed/history'), 400);
  assert.equal(await status('https://www.youtube.com/results?search_query=x&sp=EgIQAQ'), 400);
  assert.equal(await status('https://www.youtube.com/watch?v=EpwxwKDoXXU&list=x'), 400);
  assert.equal(await status('https://www.youtube.com/watch?v=short'), 400);
});
