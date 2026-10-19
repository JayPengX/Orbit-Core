// GET /sports-today: a day of scoreboards on one request (sports-today.js),
// built from the ESPN pages the data proxy reads, kept at the edge, paced by
// the bill's guard; and the kit's event parser (sports-espn.mjs) the same as
// Orbit Sports' own copy.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// The edge cache, and ESPN: the app's own fixtures (Orbit Sports 1b99801 tests/fixtures, with a game on now, a play-off and a cup tie added).
const store = new Map();
globalThis.caches = { default: { match: async req => store.get(req.url)?.clone() || null, put: async (req, res) => void store.set(req.url, res) } };
const fx = name => JSON.parse(readFileSync(new URL(`./fixtures/sports-today/${name}.json`, import.meta.url), 'utf8'));
const boards = fx('boards');
const BOARD_OF = { 'baseball/mlb': 'mlb', 'basketball/nba': 'nba', 'soccer/eng.1': 'epl', 'soccer/uefa.champions': 'ucl', 'racing/f1': 'f1' };
const calls = [];
const failing = new Set();
globalThis.fetch = async input => {
  const url = new URL(String(input));
  calls.push(url);
  const league = url.pathname.replace('/apis/site/v2/sports/', '').replace('/scoreboard', '');
  if (!url.pathname.endsWith('/scoreboard') || failing.has(`${league}|${url.searchParams.get('dates') || ''}`) || failing.has(league)) return new Response('no', { status: 500 });
  return new Response(JSON.stringify(boards[BOARD_OF[league]] || { events: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
};
const worker = (await import('../worker.js')).default;
const { forgetPace } = await import('../pace.js');
const { taipeiDay, keepFor, validDay, forgetBounds, TODAY_LEAGUES, buildDay, TODAY_V } = await import('../sports-today.js');
const espn = await import('../kit/sports-espn.mjs');
const { LEAGUES, parseScoreboard, localEvent, slimEvent, unslimEvent, espnDaysOf } = espn;

const ctx = { waitUntil: p => p };
const DAY = 86_400_000;
const today = taipeiDay(Date.now());
const dayOf = n => taipeiDay(Date.now() + n * DAY);
let who = 0;
const ask = (day, { origin = 'https://jaypengx.github.io', env = {}, ip } = {}) =>
  worker.fetch(new Request(`https://proxy.test/sports-today${day === undefined ? '' : `?day=${day}`}`, { headers: { ...(origin ? { Origin: origin } : {}), 'CF-Connecting-IP': ip || `10.1.0.${++who}` } }), env, ctx);
const fresh = () => {
  store.clear();
  calls.length = 0;
  failing.clear();
  forgetPace();
  forgetBounds();
};
const paced = pace => ({ RATE_LIMIT_KV: { get: async (k, o) => (k === 'guard:pace' ? (o?.type === 'json' ? { pace } : JSON.stringify({ pace })) : null) } });

test('a day answers in one request: the shape, each league read, the events the phone draws', async () => {
  fresh();
  const res = await ask(today);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('X-Sports-Today'), 'MISS');
  const body = await res.json();
  assert.equal(body.v, TODAY_V);
  assert.equal(body.day, today);
  assert.ok(Math.abs(body.built - Date.now()) < 5_000);
  // Every league with an ESPN scoreboard (CPBL is read from its own site by the phone: in neither list).
  const espnLeagues = Object.keys(LEAGUES).filter(k => LEAGUES[k].espn);
  assert.deepEqual(body.covered, espnLeagues);
  assert.deepEqual(body.missed, []);
  assert.ok(!body.covered.includes('cpbl'));
  // A league with no game has no list; the others' lists are the kit's events, slimmed.
  assert.deepEqual(Object.keys(body.events), ['mlb', 'nba', 'epl', 'ucl', 'f1']);
  assert.equal(body.events.mlb.length, 5);
  assert.equal(body.events.epl.length, 6);
  // Pages: two ESPN days for each match league; a race weekend's current page on today (27 reads in all).
  const matchLeagues = espnLeagues.filter(k => LEAGUES[k].kind === 'match');
  assert.equal(calls.length, matchLeagues.length * 2 + 1);
  assert.deepEqual([...new Set(calls.filter(u => u.pathname.includes('/mlb/')).map(u => u.searchParams.get('dates')))].sort(), espnDaysOf(today));
  assert.ok(calls.filter(u => u.pathname.includes('/f1/')).every(u => !u.searchParams.has('dates')));
  // Put back, each event is what the app's parser makes of the page, the ESPN day it was on named.
  for (const [league, list] of Object.entries(body.events)) {
    const parsed = parseScoreboard(boards[league], league);
    assert.deepEqual(list.map(unslimEvent).map(e => ({ ...e, usDay: undefined })), parsed.map(e => ({ ...e, usDay: undefined })), league);
    for (const e of list) assert.match(unslimEvent(e).usDay, /^\d{8}$/);
  }
  // A game on now keeps what the card draws of it; a play-off game its series and hour not set.
  const live = body.events.mlb.map(unslimEvent).find(e => e.status.state === 'in');
  assert.deepEqual([live.live.balls, live.live.outs, live.live.bases], [2, 1, [true, false, true]]);
  const playoff = body.events.mlb.map(unslimEvent).find(e => e.round);
  assert.equal(playoff.series.summary, 'NYY lead series 3-1');
  assert.equal(playoff.timeTbd, true);
  // The phone's own browser keeps it a moment; the proxy's body is the one answer for everyone.
  assert.match(res.headers.get('Cache-Control'), /^private, max-age=15$/);
});

test("a day other than today reads a race weekend by its dated pages, and 28 pages in all", async () => {
  fresh();
  const day = dayOf(-3);
  const body = await (await ask(day)).json();
  assert.equal(calls.length, 28);
  assert.ok(calls.filter(u => u.pathname.includes('/f1/')).every(u => espnDaysOf(day).includes(u.searchParams.get('dates'))));
  assert.ok(body.covered.includes('f1'));
});

test('a league that failed, or a page of it, is missed (never "no games"); the rest still come', async () => {
  fresh();
  failing.add('soccer/ita.1');
  failing.add(`basketball/nba|${espnDaysOf(today)[1]}`);
  const res = await ask(today);
  const body = await res.json();
  assert.deepEqual(body.missed, ['nba', 'seriea'], "in the leagues' own order");
  assert.ok(!body.covered.includes('seriea') && !body.covered.includes('nba'));
  assert.ok(body.covered.includes('mlb') && body.events.mlb.length === 5);
  assert.ok(!('nba' in body.events), 'a league missed has no events: the phone reads it itself');
  // Kept only a moment, so the next ask reads what failed again.
  assert.match(res.headers.get('Cache-Control'), /^private, max-age=0$/);
  const stored = [...store.entries()].find(([k]) => k.includes('orbit-sports-today.quadra'))[1];
  assert.equal(stored.headers.get('X-Sports-Today-Ttl'), '10');
  failing.clear();
  assert.equal((await ask(today)).headers.get('X-Sports-Today'), 'HIT', 'within those seconds the same answer');
  const key = [...store.keys()].find(k => k.includes('orbit-sports-today.quadra'));
  store.set(key, new Response(await stored.clone().text(), { headers: { ...Object.fromEntries(stored.headers), 'X-Sports-Today-Built': String(Date.now() - 11_000) } }));
  const again = await (await ask(today)).json();
  assert.deepEqual(again.missed, []);
  assert.ok(again.events.nba.length === 3 && !again.missed.includes('seriea'));
});

test('read while one is still kept: no read again; past its time: built again; asked at once: one build', async () => {
  fresh();
  const first = await ask(today);
  const n = calls.length;
  assert.equal(first.headers.get('X-Sports-Today'), 'MISS');
  const hit = await ask(today);
  assert.equal(hit.headers.get('X-Sports-Today'), 'HIT');
  assert.equal(calls.length, n, 'a copy kept is answered without a read');
  assert.deepEqual(await hit.json(), await first.json());
  // Its 60 s gone (the edge drops it itself; a copy that's older than it says is never answered).
  const key = [...store.keys()].find(k => k.includes('orbit-sports-today.quadra'));
  const old = store.get(key);
  store.set(key, new Response(await old.clone().text(), { headers: { ...Object.fromEntries(old.headers), 'X-Sports-Today-Built': String(Date.now() - 61_000) } }));
  assert.equal((await ask(today)).headers.get('X-Sports-Today'), 'MISS');
  // Concurrent asks for a day not built: one build, the rest wait for it.
  fresh();
  const day = dayOf(2);
  const [a, b, c] = await Promise.all([ask(day), ask(day), ask(day)]);
  assert.deepEqual([a, b, c].map(r => r.headers.get('X-Sports-Today')).sort(), ['JOIN', 'JOIN', 'MISS']);
  const pages = calls.length;
  assert.equal(pages, 28, 'one build of a day, not three');
  assert.deepEqual(await b.json(), await a.json());
  // Another day is its own build.
  await ask(dayOf(3));
  assert.ok(calls.length > pages);
});

test('how long a day is kept: a minute for today and tomorrow, longer for the days past, a moment when a league is missed', () => {
  const now = Date.parse('2026-10-19T03:00:00Z');
  assert.equal(taipeiDay(now), '2026-10-19');
  assert.deepEqual(keepFor('2026-10-19', now), { ttl: 60, browser: 15 });
  assert.deepEqual(keepFor('2026-10-20', now), { ttl: 60, browser: 15 });
  assert.equal(keepFor('2026-10-21', now).ttl, 600);
  assert.equal(keepFor('2026-10-18', now).ttl, 120);
  assert.equal(keepFor('2026-10-10', now).ttl, 3600);
  assert.deepEqual(keepFor('2026-10-19', now, true), { ttl: 10, browser: 0 });
  // Taiwan's day, whatever the hour in UTC: 17:00Z is already tomorrow there.
  assert.equal(taipeiDay(Date.parse('2026-10-19T17:00:00Z')), '2026-10-20');
  assert.ok(validDay('2026-10-19', now) && !validDay('2026-02-30', now) && !validDay('2026-10-1', now) && !validDay('2024-01-01', now) && !validDay(undefined, now));
});

test("paced by the bill's guard: from pace 2 a 503 { error: 'paced' } and nothing read", async () => {
  fresh();
  for (const pace of [2, 3]) {
    forgetPace();
    const res = await ask(today, { env: paced(pace) });
    assert.equal(res.status, 503);
    assert.deepEqual(await res.json(), { error: 'paced' });
  }
  assert.equal(calls.length, 0);
  assert.equal(store.size, 0);
  // At pace 1 it still answers (what can wait is the builders').
  forgetPace();
  assert.equal((await ask(today, { env: paced(1) })).status, 200);
  forgetPace();
});

test('the origin: a page of ours or a local one; any other, or none, is refused; a bad day is a 400; an address is limited', async () => {
  fresh();
  assert.equal((await ask(today, { origin: 'http://localhost:8123' })).status, 200);
  assert.equal((await ask(today, { origin: 'https://evil.example.com' })).status, 403);
  assert.equal((await ask(today, { origin: '' })).status, 403);
  assert.equal((await ask('2026-13-40')).status, 400);
  assert.equal((await ask(undefined)).status, 400);
  assert.equal((await ask('2019-01-01')).status, 400);
  assert.equal((await worker.fetch(new Request(`https://proxy.test/sports-today?day=${today}`, { method: 'POST', headers: { Origin: 'https://jaypengx.github.io' } }), {}, ctx)).status, 405);
  const ip = '10.9.9.9';
  const statuses = [];
  for (let i = 0; i < 32; i++) statuses.push((await ask(today, { ip })).status);
  assert.equal(statuses.filter(s => s === 429).length, 2);
});

test("a league out of season (Shared-Data's bounds) isn't read, as the phone leaves it out", async () => {
  fresh();
  const bounds = { mlb: { from: '2027-03-01', to: '2027-11-01' }, nba: { from: '2020-01-01', to: '2099-01-01' } };
  const built = await buildDay(today, {
    read: async url => (calls.push(new URL(url)), boards[BOARD_OF[new URL(url).pathname.replace('/apis/site/v2/sports/', '').replace('/scoreboard', '')]] || { events: [] }),
    bounds: async () => bounds
  });
  const body = JSON.parse(built.body);
  assert.ok(body.covered.includes('mlb') && !('mlb' in body.events));
  assert.ok(!calls.some(u => u.pathname.includes('/mlb/')));
  assert.ok(calls.some(u => u.pathname.includes('/nba/')) && body.events.nba.length === 3);
});

test("the proxy's events are the app's: Orbit Sports' own parser's output, in either language, and slimmed they come back whole", () => {
  const app = fx('app-parsed');
  for (const lang of ['zh', 'en']) {
    for (const [league, board] of Object.entries(boards)) {
      // As the app draws them, parsed here…
      assert.deepEqual(JSON.parse(JSON.stringify(parseScoreboard(board, league, { lang }))), app[lang][league], `${league} ${lang}`);
      // …and from the language-free event the proxy sends.
      assert.deepEqual(JSON.parse(JSON.stringify(parseScoreboard(board, league).map(e => localEvent(e, lang)))), app[lang][league], `${league} ${lang} localEvent`);
    }
  }
  for (const [league, board] of Object.entries(boards)) {
    const raw = parseScoreboard(board, league);
    const slim = raw.map(slimEvent);
    assert.deepEqual(JSON.parse(JSON.stringify(slim.map(unslimEvent))), JSON.parse(JSON.stringify(raw)), `${league} slim`);
    assert.ok(JSON.stringify(slim).length <= JSON.stringify(raw).length);
  }
  // A side's name stays ESPN's English until the phone puts its own on.
  const [game] = parseScoreboard(boards.nba, 'nba');
  assert.equal(game.home.name, 'Boston Celtics');
  assert.equal(localEvent(game, 'zh').home.name, '波士頓塞爾提克');
});

test('the leagues the first screen shows: every league of the app with an ESPN scoreboard', () => {
  assert.deepEqual(TODAY_LEAGUES(), Object.keys(LEAGUES).filter(k => LEAGUES[k].espn));
  assert.ok(TODAY_LEAGUES().length <= 24, "the app's first screen reads at most 24 of the others (pickLeagues, then otherLeagues().slice(0, 24))");
});
