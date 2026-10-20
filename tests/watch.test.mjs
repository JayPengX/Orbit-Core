import { test } from 'node:test';
import assert from 'node:assert/strict';

const { espnGames } = await import('../builders/watch.js');

test("a scoreboard's games over, as the app's highlights picking reads them; a race weekend's sessions each its own", () => {
  const team = (id, name, short, score, homeAway) => ({ homeAway, team: { id, displayName: name, shortDisplayName: short }, score });
  const data = {
    events: [
      { id: '1', date: '2026-10-07T00:08Z', competitions: [{ status: { type: { state: 'post', name: 'STATUS_FINAL' } }, notes: [{ headline: 'NLDS - Game 3' }], series: { type: 'playoff', summary: 'MIL leads 2-1' }, competitors: [team('25', 'San Diego Padres', 'Padres', '4', 'home'), team('8', 'Milwaukee Brewers', 'Brewers', '3', 'away')] }] },
      { id: '2', date: '2026-10-08T00:08Z', competitions: [{ status: { type: { state: 'pre' } }, competitors: [team('1', 'A', 'A', '', 'home'), team('2', 'B', 'B', '', 'away')] }] },
      { id: '3', date: '2026-10-06T00:08Z', competitions: [{ status: { type: { state: 'post', name: 'STATUS_POSTPONED' } }, competitors: [team('1', 'A', 'A', '', 'home'), team('2', 'B', 'B', '', 'away')] }] }
    ]
  };
  const [g, ...rest] = espnGames(data, 'mlb');
  assert.equal(rest.length, 0);
  assert.deepEqual(g, { id: '1', league: 'mlb', kind: 'match', start: '2026-10-07T00:08Z', status: { state: 'post' }, home: { id: '25', en: 'San Diego Padres', name: 'San Diego Padres', short: 'Padres', score: '4' }, away: { id: '8', en: 'Milwaukee Brewers', name: 'Milwaukee Brewers', short: 'Brewers', score: '3' }, note: 'NLDS - Game 3', series: { summary: 'MIL leads 2-1' } });
  const f1 = espnGames({ events: [{ id: '600060990', name: 'Gulf Air Bahrain Grand Prix', competitions: [{ type: { abbreviation: 'Qual' }, date: '2026-10-03T08:00Z', status: { type: { state: 'post' } } }, { type: { abbreviation: 'Race' }, date: '2026-10-04T07:00Z', status: { type: { state: 'pre' } } }] }] }, 'f1');
  assert.deepEqual(f1.map(x => [x.id, x.sessionKey]), [['600060990~Qual', 'Qual']]);
});

test("Apple TV's MLS games: each with its page, kick-off and clubs, matched to ESPN's by kick-off and a club's code", async () => {
  const { appleEvents, appleMatch } = await import('../builders/watch.js');
  const lockup = (id, title, extra) => ({ type: 'SportingEvent', title, segue: { destination: { id }, url: `https://tv.apple.com/tw/sporting-event/x/${id}?ctx_brand=tvs.sbd.7000` }, ...extra });
  const page = {
    shelves: [
      { items: [lockup('umc.cse.a', '紐約紅牛 vs 聖地亞哥', { primaryMetadata: ['MLS', { isoDatetime: '2026-10-10T23:30:00.000Z' }], competitors: [{ abbreviation: 'RBNY' }, { abbreviation: 'SD' }] })] },
      // Listed again with nothing: kept as first known; a show isn't a game.
      { items: [lockup('umc.cse.a', '紐約 vs 聖地亞哥', {}), lockup('umc.cse.s', 'MLS 360', {}), lockup('umc.cse.b', '聖路易斯 vs 洛杉磯銀河', { badge: { isoDatetime: '2026-10-11T22:30:00.000Z' }, competitors: [{ abbreviation: 'STL' }, { abbreviation: 'LA' }] })] },
      // A game's own page: no link to itself, its id in its metrics.
      { $kind: 'SuperheroLockup', type: 'SportingEvent', title: 'LAFC vs 溫哥華', impressionMetrics: { id: { id: 'umc.cse.c' } }, primaryMetadata: [{ isoDatetime: '2026-10-11T02:30:00.000Z' }], competitors: [{ abbreviation: 'LAFC' }, { abbreviation: 'VAN' }] }
    ]
  };
  const ev = appleEvents(page);
  assert.deepEqual([...ev.keys()].sort(), ['umc.cse.a', 'umc.cse.b', 'umc.cse.c']);
  assert.equal(ev.get('umc.cse.a').url, 'https://tv.apple.com/tw/sporting-event/x/umc.cse.a');
  assert.deepEqual(ev.get('umc.cse.a').teams, ['RBNY', 'SD']);
  // ESPN's NY is Apple's RBNY: one club's code and the kick-off are enough.
  assert.equal(appleMatch({ start: '2026-10-10T23:30Z', teams: ['NY', 'SD'] }, ev.values()).id, 'umc.cse.a');
  // Apple dates a game from its show, half an hour early.
  assert.equal(appleMatch({ start: '2026-10-11T23:00Z', teams: ['STL', 'LA'] }, ev.values()).id, 'umc.cse.b');
  assert.equal(appleMatch({ start: '2026-10-12T23:00Z', teams: ['STL', 'LA'] }, ev.values()), null);
  assert.equal(appleMatch({ start: '2026-10-10T23:30Z', teams: ['ATL', 'CIN'] }, ev.values()), null);
});

test("Apple TV's clubs' pages (each its last games and next) and the season's MLS games to match them to", async () => {
  const { appleClubs, mlsGames } = await import('../builders/watch.js');
  const club = id => ({ type: 'Team', segue: { url: `https://tv.apple.com/tw/team/x/umc.cst.${id}?ctx_brand=tvs.sbd.7000` } });
  assert.deepEqual(appleClubs({ shelves: [{ items: [club('a'), club('b'), club('a'), { segue: { url: 'https://tv.apple.com/tw/shelf/x/edt.col.1' } }] }] }), ['https://tv.apple.com/tw/team/x/umc.cst.a', 'https://tv.apple.com/tw/team/x/umc.cst.b']);
  const ev = (id, state, name = '') => ({ id, date: '2026-11-08T00:00Z', competitions: [{ status: { type: { state, name } }, competitors: [{ team: { abbreviation: 'SEA' } }, { team: { abbreviation: 'LAFC' } }] }] });
  // Played or to come, never one called off.
  assert.deepEqual(
    mlsGames({ events: [ev(1, 'post'), ev(2, 'pre'), ev(3, 'post', 'STATUS_POSTPONED')] }).map(g => g.id),
    ['1', '2']
  );
  assert.deepEqual(mlsGames({ events: [ev(2, 'pre')] })[0], { id: '2', league: 'mls', kind: 'match', start: '2026-11-08T00:00Z', teams: ['SEA', 'LAFC'] });
});

test("a game's ELTA.tv episodes for the season's archive: its 原音 cut and ELTA's own, on its day in Taiwan; the season kept, last season's playoffs before the next", async () => {
  const { eltaOf, keeps } = await import('../builders/watch.js');
  const e = { id: '9', league: 'mlb', kind: 'match', start: '2026-10-01T01:08Z', status: { state: 'post' }, home: { en: 'Houston Astros' }, away: { en: 'Chicago White Sox' } };
  const sides = [['太空人'], ['白襪']];
  const eps = [
    { id: '72745', title: '10/1 美聯外卡G2 白襪VS太空人' },
    { id: '72743', title: '10/1 白襪 VS 太空人 美聯外卡賽G2 (原音)' },
    { id: '72700', title: '9/30 白襪 VS 太空人 美聯外卡賽G1 (原音)' },
    { id: '72800', title: '10/2 白襪 VS 太空人 精華' }
  ];
  assert.deepEqual(eltaOf(eps, e, sides, 2150), { v: 2150, eps: [['72743', '10/1 白襪 VS 太空人 美聯外卡賽G2 (原音)'], ['72745', '10/1 美聯外卡G2 白襪VS太空人']] });
  assert.equal(eltaOf(eps.slice(2), e, sides, 2150), null);
  // The owner's rule: a season whole until the next one's first game (its preseason's too).
  const { seasonBegun } = await import('../builders/watch.js');
  const season = { start: Date.parse('2026-09-30T00:00Z'), year: 2027 };
  const ev = (date, type, slug) => ({ date, season: { year: 2027, type, slug } });
  const now = Date.parse('2026-10-12T00:00Z');
  assert.equal(seasonBegun([ev('2026-10-03T00:00Z', 1, 'preseason'), ev('2026-10-21T00:00Z', 2, 'regular-season')], 2027, now), true, 'a preseason game played');
  assert.equal(seasonBegun([ev('2026-10-21T00:00Z', 2, 'regular-season')], 2027, now), false, 'nothing played yet');
  const pre = { ...season, begun: false };
  assert.equal(keeps(pre, Date.parse('2026-04-15T00:00Z')), true, "last season's regular season kept until the new one's first game");
  assert.equal(keeps(pre, Date.parse('2026-06-15T00:00Z')), true, 'its playoffs too');
  const on = { ...season, begun: true };
  assert.equal(keeps(on, Date.parse('2026-06-15T00:00Z')), false, 'let go once a game of the new season is played');
  assert.equal(keeps(on, Date.parse('2026-10-01T00:00Z')), true);
});

test("recheck: once, every football game's highlights looked for again", async () => {
  const { recheck, CHECKED } = await import('../builders/watch.js');
  const store = () => new Map([
    ['mls', new Map([['a', { t: 1, hl: { id: 'X' }, miss: 1 }], ['c', { t: 3, hl: { id: 'Y' } }]])],
    ['mlb', new Map([['d', { t: 4, hl: { id: 'Z' } }], ['e', { t: 5, miss: 2 }]])]
  ]);
  const soccer = key => key === 'mls';
  const s1 = store();
  assert.equal(recheck(s1, CHECKED, soccer), 0);
  // 2: the leagues in innings, quarters or periods (MLB's inning cut, 2026-10-13).
  const s2 = store();
  assert.equal(recheck(s2, 2, soccer), 1);
  assert.equal(s2.get('mls').get('c').hl.id, 'Y');
  assert.equal(s2.get('mlb').get('d').hl, undefined);
  assert.equal(s2.get('mlb').get('e').miss, 2);
  const s15 = store();
  assert.equal(recheck(s15, 1, soccer), 3);
  const s0 = store();
  assert.equal(recheck(s0, 0, soccer), 3);
  assert.deepEqual([...s0.get('mls').values()], [{ t: 1 }, { t: 3 }]);
  assert.deepEqual(s0.get('mlb').get('d'), { t: 4 });
  assert.equal(s0.get('mlb').get('e').miss, 2);
});

test("shareOut: a video on two games is the one begun last before it went up; the other never gets it again", async () => {
  const { shared, shareOut } = await import('../builders/watch.js');
  const H = 3_600_000;
  const store = new Map([['mlb', new Map([['g1', { t: 10 * H, hl: { id: 'V' } }], ['g2', { t: 16 * H, hl: { id: 'V' } }], ['g3', { t: 20 * H, hl: { id: 'W' } }]])]]);
  const list = shared(store).get('V');
  assert.equal(shared(store).size, 1);
  // Up at 14:00, before the second game: the first's.
  assert.equal(shareOut(store, 'V', list, 14 * H), 1);
  assert.equal(store.get('mlb').get('g1').hl.id, 'V');
  assert.deepEqual(store.get('mlb').get('g2'), { t: 16 * H, not: ['V'] });
  // Its time unknown: both looked for again, neither told.
  const s2 = new Map([['mls', new Map([['a', { t: 1, hl: { id: 'X' } }], ['b', { t: 2, hl: { id: 'X' } }]])]]);
  assert.equal(shareOut(s2, 'X', shared(s2).get('X'), NaN), 2);
  assert.deepEqual([...s2.get('mls').values()], [{ t: 1 }, { t: 2 }]);
});

test('a run on R2: the recent pack written, the season\'s archive kept as it was when nothing new is found, no source refused twice', async () => {
  const { runWatch } = await import('../builders/watch.js');
  const { r2Store } = await import('../builders/store.js');
  const { memoryBucket } = await import('./fixtures/bucket.mjs');
  const now = Date.parse('2026-10-13T12:00:00Z');
  const t = Date.parse('2026-09-20T01:00:00Z');
  const store = r2Store(
    memoryBucket({
      'sports/watch/index.json': { built: 'x', checked: 3, leagues: { mlb: { months: ['2026-09'], kept: 1 } } },
      'sports/watch/mlb/2026-09.json': { games: { 'mlb:1:': { t, hl: { id: 'abc' } } } },
      'sports/watch.json': { built: 'x', games: {} }
    })
  );
  const asked = [];
  const get = async url => (asked.push(String(url)), new Response('', { status: 404 }));
  // (Asia's months read by asia-baseball.js with the global fetch: refused too, no network.)
  const real = globalThis.fetch;
  globalThis.fetch = get;
  let r;
  try {
    r = await runWatch({ store, proxy: async () => null, get, now, until: now, sleep: async () => {} });
  } finally {
    globalThis.fetch = real;
  }
  assert.equal(r.recent, 0);
  const pack = await store.json('sports/watch.json');
  assert.equal(pack.built, '2026-10-13', 'dated by the day: the same games, the same file, nothing written');
  const month = await store.json('sports/watch/mlb/2026-09.json');
  assert.deepEqual(month.games['mlb:1:'], { t, hl: { id: 'abc' } });
  assert.ok(asked.length > 0);
});

test('an hourly run reads only the last two US days from ESPN and the months its games are in; a full run is the daily one', async () => {
  const { runWatch, FULL_HOUR } = await import('../builders/watch.js');
  const { r2Store } = await import('../builders/store.js');
  const { memoryBucket } = await import('./fixtures/bucket.mjs');
  const now = Date.parse('2026-10-13T12:00:00Z');
  const store = r2Store(memoryBucket({ 'sports/watch/index.json': { checked: 3, leagues: { mlb: { months: ['2026-04', '2026-10'] } } }, 'sports/watch/_pending.json': { games: [] }, 'sports/watch.json': { games: {} } }));
  const asked = [];
  const get = async url => (asked.push(String(url)), new Response('', { status: 404 }));
  const real = globalThis.fetch;
  globalThis.fetch = get;
  let r;
  try {
    r = await runWatch({ store, proxy: async () => null, get, now, until: now, sleep: async () => {} });
  } finally {
    globalThis.fetch = real;
  }
  assert.equal(r.full, false);
  const days = asked.filter(u => /scoreboard\?dates=\d{8}$/.test(u)).map(u => u.slice(-8));
  assert.deepEqual([...new Set(days)].sort(), ['20261012', '20261013']);
  assert.ok(!asked.some(u => u.includes('eltaott.tv')), 'nothing waiting for ELTA: ELTA not read');
  assert.equal(new Date(Date.UTC(2026, 9, 13, FULL_HOUR)).getUTCHours(), 20);
});

test("Apple TV in the daily run: the clubs' pages too, each game's page read once, an older game's page kept in its month for good", async () => {
  const { runWatch, APPLE_MLS, APPLE_SEARCH } = await import('../builders/watch.js');
  const { r2Store } = await import('../builders/store.js');
  const { memoryBucket } = await import('./fixtures/bucket.mjs');
  const now = Date.parse('2026-10-15T20:00:00Z');
  const ev = (id, date, state) => ({ id, date, season: { year: 2026 }, competitions: [{ status: { type: { state } }, competitors: [{ homeAway: 'home', team: { id: '1', abbreviation: 'ATL', displayName: 'Atlanta United FC' }, score: '1' }, { homeAway: 'away', team: { id: '2', abbreviation: 'MIA', displayName: 'Inter Miami CF' }, score: '0' }] }] });
  const store = r2Store(memoryBucket({ 'sports/watch/_pending.json': { games: [] }, 'sports/watch.json': { games: {} }, 'sports/mls/2026.json': { events: [ev('700', '2026-03-01T00:30Z', 'post'), ev('701', '2026-08-17T00:30Z', 'post'), ev('702', '2026-10-25T23:30Z', 'pre'), ev('703', '2026-10-31T17:00Z', 'pre')] } }));
  const page = data => new Response(`<html><script type="application/json" id="serialized-server-data">${JSON.stringify(data)}</script></html>`);
  const game = (id, title, extra = {}) => ({ type: 'SportingEvent', title, segue: { destination: { id }, url: `https://tv.apple.com/tw/sporting-event/x/${id}` }, ...extra });
  const club = 'https://tv.apple.com/tw/team/x/umc.cst.atl';
  const asked = [];
  const get = async url => {
    url = String(url);
    asked.push(url);
    if (url === APPLE_MLS) return page({ shelves: [{ items: [{ type: 'Team', segue: { url: club } }] }] });
    if (url === club) return page({ shelves: [{ items: [game('umc.cse.old', '亞特蘭大 vs 邁阿密'), game('umc.cse.next', '亞特蘭大 vs 邁阿密', { badge: { isoDatetime: '2026-10-25T23:30:00.000Z' }, competitors: [{ abbreviation: 'ATL' }, { abbreviation: 'MIA' }] })] }] });
    // The game its club's page left out: Apple's search for its home club.
    if (url === `${APPLE_SEARCH}${encodeURIComponent('Atlanta United FC')}`) return page({ shelves: [{ items: [game('umc.cse.srch', '亞特蘭大 vs 邁阿密', { badge: { isoDatetime: '2026-10-31T17:00:00.000Z' } }), game('umc.cse.far', '亞特蘭大 vs 邁阿密', { badge: { isoDatetime: '2026-11-30T17:00:00.000Z' } })] }] });
    if (url.endsWith('/umc.cse.srch')) return page({ type: 'SportingEvent', title: '亞特蘭大 vs 邁阿密', impressionMetrics: { id: { id: 'umc.cse.srch' } }, badge: { isoDatetime: '2026-10-31T17:00:00.000Z' }, competitors: [{ abbreviation: 'ATL' }, { abbreviation: 'MIA' }] });
    if (url.endsWith('/umc.cse.old')) return page({ type: 'SportingEvent', title: '亞特蘭大 vs 邁阿密', impressionMetrics: { id: { id: 'umc.cse.old' } }, primaryMetadata: [{ isoDatetime: '2026-08-17T00:00:00.000Z' }], competitors: [{ abbreviation: 'ATL' }, { abbreviation: 'MIA' }] });
    return new Response('', { status: 404 });
  };
  const run = async () => {
    const real = globalThis.fetch;
    globalThis.fetch = get;
    try {
      return await runWatch({ store, proxy: async () => null, get, now, until: now, sleep: async () => {}, full: true });
    } finally {
      globalThis.fetch = real;
    }
  };
  const r = await run();
  assert.equal(r.apple.matched, 3);
  // The games to come: in the recent pack (the one the club's page left out found by search, the game at another time not read); the one two months back: in its month, for good.
  assert.equal((await store.json('sports/watch.json')).games['mls:703:'].apple, 'https://tv.apple.com/tw/sporting-event/x/umc.cse.srch');
  assert.ok(!asked.some(u => u.endsWith('/umc.cse.far')));
  assert.equal((await store.json('sports/watch.json')).games['mls:702:'].apple, 'https://tv.apple.com/tw/sporting-event/x/umc.cse.next');
  assert.equal((await store.json('sports/watch/mls/2026-08.json')).games['mls:701:'].apple, 'https://tv.apple.com/tw/sporting-event/x/umc.cse.old');
  assert.ok(!(await store.json('sports/watch/mls/2026-03.json'))?.games?.['mls:700:']?.apple);
  // The next day no game's own page is read again, nor searched for.
  asked.length = 0;
  await run();
  assert.ok(!asked.some(u => u.endsWith('/umc.cse.old') || u.endsWith('/umc.cse.srch') || u.startsWith(APPLE_SEARCH)));
  assert.equal((await store.json('sports/watch/mls/2026-08.json')).games['mls:701:'].apple, 'https://tv.apple.com/tw/sporting-event/x/umc.cse.old');
});

test('win probability on R2: a game kept is never read again, Polymarket only through the proxy, a month let go goes', async () => {
  const { runWinprob } = await import('../builders/winprob.js');
  const { r2Store } = await import('../builders/store.js');
  const { memoryBucket } = await import('./fixtures/bucket.mjs');
  const now = Date.parse('2026-10-13T23:17:00Z');
  const store = r2Store(memoryBucket({ 'winprob/index.json': { leagues: { epl: { months: ['2026-09'] } } }, 'winprob/epl/2026-09.json': { games: { k1: { t: Date.parse('2026-09-20T14:00:00Z'), none: 'polymarket' } } } }));
  const proxied = [];
  const asked = [];
  const real = globalThis.fetch;
  globalThis.fetch = async url => (asked.push(String(url)), new Response('', { status: 404 }));
  try {
    await runWinprob({ store, proxy: async url => (proxied.push(url), null), get: globalThis.fetch, now, sleep: async () => {} });
  } finally {
    globalThis.fetch = real;
  }
  assert.ok(!asked.some(u => u.includes('polymarket.com')), 'Polymarket never read whole here');
  assert.deepEqual((await store.json('winprob/epl/2026-09.json')).games.k1.none, 'polymarket');
});

test("an hourly run keeps a game found days ago in the recent pack for its ten days (NLCS Game 4's video was a search two days on)", async () => {
  const { runWatch } = await import('../builders/watch.js');
  const { r2Store } = await import('../builders/store.js');
  const { memoryBucket } = await import('./fixtures/bucket.mjs');
  const now = Date.parse('2026-10-18T04:00:00Z');
  const at = Date.parse('2026-10-16T00:00:00Z');
  const old = Date.parse('2026-10-06T00:00:00Z');
  const store = r2Store(
    memoryBucket({
      'sports/watch/index.json': { checked: 3, leagues: { mlb: { months: ['2026-10'] } } },
      'sports/watch/_pending.json': { games: [] },
      'sports/watch.json': { games: { 'mlb:33:': { hl: { id: 'ZVjnWhgxzjM' }, at }, 'mlb:9:': { hl: { id: 'gone' }, at: old } } }
    })
  );
  const get = async () => new Response('', { status: 404 });
  const real = globalThis.fetch;
  globalThis.fetch = get;
  try {
    await runWatch({ store, proxy: async () => null, get, now, until: now, sleep: async () => {} });
  } finally {
    globalThis.fetch = real;
  }
  const pack = await store.json('sports/watch.json');
  assert.deepEqual(pack.games['mlb:33:'], { hl: { id: 'ZVjnWhgxzjM' }, at });
  assert.equal(pack.games['mlb:9:'], undefined, 'past ten days: the archive has it');
});
