// Quadra Play's home board (builders/play.js, kit/play-boardfile.mjs): built
// from the sources with the phone's own pricing, small, one league's failure
// leaving the rest, and an old board never replaced by an empty one.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { runPlay } from '../builders/play.js';
import { runBuilders, SLOTS, PLAY_MINUTES } from '../builders/run.js';
import { r2Store } from '../builders/store.js';
import { memoryBucket } from './fixtures/bucket.mjs';
import { builderAllowed } from '../pace.js';
import { fakeSources, fakeLottery } from './fixtures/play-board.mjs';
import { BOARD_PATH, BOARD_V, BOARD_HOURS, BOARD_STALE_MS, boardUsable, unpackBoard, packGames, fieldsOf } from '../kit/play-boardfile.mjs';
import * as src from '../kit/play-sources.mjs';
import { boardBets } from '../kit/play-bets.mjs';
import { recommend } from '../kit/play-recommend.mjs';
import { estimateLotteryOdds, devigProportional, americanToProbability } from '../kit/play-odds.mjs';
import { houseCut } from '../kit/play-rules.mjs';
import { LEAGUES } from '../kit/play-teams.mjs';
import { useReads } from '../price.js';

// Nothing here reaches the network (Taiwan Lottery's API, TheSportsDB): a read that isn't faked fails at once.
const realFetch = globalThis.fetch;
globalThis.fetch = async () => {
  throw new Error('offline');
};
after(() => (globalThis.fetch = realFetch));

const NOW = Date.parse('2026-10-19T08:08:00Z');
const HOUR = 3_600_000;

async function build({ down, scale, f1, store = r2Store(memoryBucket()), now = NOW, proxy, lottery = fakeLottery() } = {}) {
  const sources = fakeSources({ now, scale, down, f1 });
  const result = await runPlay({}, { proxy: proxy || sources.proxy, now, store, lottery, log: () => {} });
  return { result, store, board: await store.json(BOARD_PATH), sources };
}

// The same sources priced the long way: each league as the phone loads it, every game's bets.
async function pricedByKit({ down, f1 } = {}) {
  const { proxy } = fakeSources({ now: NOW, down, f1 });
  useReads({ read: async (u, t = '') => { const d = await proxy(u, t); if (d == null) throw new Error('unread'); return d; }, pack: async () => { throw new Error('no pack'); } });
  const games = [];
  for (const key of Object.keys(LEAGUES)) games.push(...(await src.loadLeague(key, new Date(NOW)).catch(() => [])));
  const inWindow = games.filter(g => Date.parse(g.startUtc) > NOW && Date.parse(g.startUtc) <= NOW + BOARD_HOURS * HOUR);
  const race = f1 ? await src.loadF1Race(new Date(NOW)) : null;
  return boardBets({ games: inWindow, ...(race ? { f1: race } : {}), loadedAt: new Date(NOW).toISOString() }, { now: new Date(NOW) });
}

test('the board: its shape, its window, its leagues and the lottery, on a realistic day', async () => {
  const { result, board } = await build();
  assert.equal(board.v, BOARD_V);
  assert.equal(board.built, new Date(NOW).toISOString());
  assert.equal(board.until, new Date(NOW + BOARD_HOURS * HOUR).toISOString());
  assert.equal(board.covered.length, Object.keys(LEAGUES).length);
  assert.deepEqual(board.missed, []);
  assert.ok(board.games.length > 100, `${board.games.length} games`);
  // Each game within the window and not started, sorted, with its winner on it.
  let last = '';
  for (const g of board.games) {
    const t = Date.parse(g.startUtc);
    assert.ok(t > NOW && t <= NOW + BOARD_HOURS * HOUR, g.id);
    assert.ok(g.startUtc >= last);
    last = g.startUtc;
    assert.ok(g.away.en && g.home.en && g.away.zh && g.home.zh);
    assert.ok(g.p.filter(p => p.i.startsWith('ml|')).length >= 2, g.id);
    assert.ok(g.id in { [g.id]: 1 } && g.p.every(p => !('game' in p) && !('gameId' in p) && !('id' in p)));
  }
  // The sport tiles' numbers cover the fortnight, not just the window.
  assert.ok(board.counts.mlb > board.games.filter(g => g.sport === 'mlb').length);
  assert.equal(board.f1, 0, 'no race on sale in the fixture');
  assert.ok(board.live.includes('mlb') && board.live.includes('epl'));
  // The jackpots as the lottery tab's header reads them.
  assert.equal(board.lottery.upcoming.super638.jackpot.amount, 480_000_000);
  assert.deepEqual(board.lottery.latest, { super638: { jackpot: 410_000_000 }, lotto649: { jackpot: 150_000_000 } });
  assert.ok(result.bytes < 200_000, `${result.bytes} bytes`);
  assert.equal(result.failed, undefined);
});

test('trimmed: only picks the home names from the pick alone, none of the markets 台灣運彩 does not sell, nothing the home does not draw', async () => {
  const { board } = await build();
  const { bets } = unpackBoard(board);
  const kinds = new Set(bets.map(b => b.kind));
  assert.deepEqual([...kinds].filter(k => !['ml', 'total', 'runline', 'teamtotal'].includes(k)), []);
  assert.ok(kinds.has('ml') && kinds.has('runline'));
  // (Play's NOT_SOLD: soccer 和局退款, hockey 兩隊都進球 and goal bands, football 勝分差, baseball 首局得分.)
  const NOT_SOLD = { soccer: ['dnb'], hockey: ['btts', 'goalbands'], football: ['margin'], baseball: ['firstinning'] };
  for (const b of bets) assert.ok(!NOT_SOLD[LEAGUES[b.sport].family]?.includes(b.kind), b.id);
  // Per game: its winners, the posted handicaps and at most two others.
  for (const g of board.games) assert.ok(bets.filter(b => b.gameId === g.id && !(b.kind === 'ml' || (b.kind === 'runline' && b.posted))).length <= 2, g.id);
  // Nothing of the pricing's workings, and a pick says of itself only what its id doesn't.
  const text = JSON.stringify(board);
  for (const gone of ['"cut"', '"fairMargin"', '"errKey"', '"typicalMargin"', '"gameId"', '"draftKings"', '"polymarket"', '"market"', '"kind"']) assert.ok(!text.includes(gone), gone);
  for (const g of board.games) for (const p of g.p) if (p.i.startsWith('ml|') && g.sport !== 'nhl') assert.deepEqual(Object.keys(p).filter(k => !['tag', 'cap', 'lock', 'minLegs', 'minLegsEst'].includes(k)).sort(), ['estOdds', 'fairChance', 'i'], p.i);
  // (Hockey's winner says it is settled on the 60 minutes.)
  assert.deepEqual(board.games.find(g => g.sport === 'nhl').p.find(p => p.i === 'ml|home').settle, { threeWay: true });
  // Small: about a hundred bytes a pick.
  const picks = board.games.reduce((n, g) => n + g.p.length, 0);
  assert.ok(text.length / picks < 160, `${Math.round(text.length / picks)} bytes a pick`);
});

test('prices equal the kit\'s: every pick on the board is the phone\'s own price for the same game', async () => {
  const { board } = await build();
  const phone = new Map((await pricedByKit()).map(b => [b.id, b]));
  const { bets, games } = unpackBoard(board);
  assert.ok(bets.length > 500);
  for (const b of bets) {
    const p = phone.get(b.id);
    assert.ok(p, `${b.id} is on the phone's board`);
    assert.equal(b.estOdds, p.estOdds, b.id);
    assert.equal(b.fairChance, Math.round(p.fairChance * 1e4) / 1e4, b.id);
    // (A flag off is a flag absent: the phone reads them as true or not.)
    const norm = v => JSON.parse(JSON.stringify(v === false || v === undefined ? null : v));
    for (const k of ['kind', 'side', 'market', 'lock', 'minLegs', 'cap', 'posted', 'mainLine', 'totalLine', 'runLine', 'awayLine', 'giver', 'team', 'teamLine', 'settle']) assert.deepEqual(norm(b[k]), norm(p[k]), `${b.id} ${k}`);
    assert.equal(b.start, p.start);
    assert.equal(b.gameId, p.gameId);
  }
  // And one worked out by hand: an MLB game's home winner from DraftKings' American odds on ESPN's page, devigged, at the house's cut.
  const hm = board.games.find(g => g.sport === 'mlb' && g.p.some(p => p.i === 'ml|home'));
  const page = await fakeSources({ now: NOW }).proxy('https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/scoreboard?dates=202610&limit=1000', 'espn-board');
  const side = (e, homeAway) => e.competitions[0].competitors.find(c => c.homeAway === homeAway).team.displayName;
  const e = page.events.find(x => side(x, 'home') === hm.home.en && side(x, 'away') === hm.away.en && x.date === hm.startUtc);
  const ml = e.competitions[0].odds[0].moneyline;
  const fair = devigProportional([americanToProbability(ml.away.close.odds), americanToProbability(ml.home.close.odds)]);
  assert.equal(hm.p.find(p => p.i === 'ml|home').estOdds, estimateLotteryOdds(fair[1], houseCut({ base: 'twoWay', sport: 'mlb' })), 'the home winner, by hand from DraftKings');
  assert.equal(games.length, board.games.length);
});

test('tags are the kit\'s recommend() over the window\'s picks, on the picks it is given', async () => {
  const { board } = await build();
  const phone = await pricedByKit();
  const recs = recommend(phone);
  const { recs: onBoard, bets } = unpackBoard(board);
  assert.ok(onBoard.size > 0);
  for (const [id, r] of onBoard) assert.equal(r.tag, recs.get(id)?.tag, id);
  // A pick the board carries and the kit tags carries its tag.
  for (const b of bets) if (recs.has(b.id)) assert.ok(onBoard.has(b.id), b.id);
});

test("a race on sale: a sport tile of its own, and its picks are in the pool the tags are drawn from, as on the phone", async () => {
  const { board } = await build({ f1: true });
  assert.equal(board.f1, 1);
  assert.ok(board.covered.length === Object.keys(LEAGUES).length);
  const recs = recommend(await pricedByKit({ f1: true }));
  const { recs: onBoard } = unpackBoard(board);
  assert.ok(onBoard.size > 0);
  for (const [id, r] of onBoard) assert.equal(r.tag, recs.get(id)?.tag, id);
  // (Its own picks are not on the board: the home does not draw them.)
  assert.ok(!board.games.some(g => g.sport === 'f1'));
  // A race whose sources can't be read is no race found; the leagues are written all the same.
  const unread = await build({ f1: true, down: url => url.includes('formula_1') || url.includes('betoffer') });
  assert.equal(unread.board.f1, 0);
  assert.ok(unread.board.games.length > 100);
});

test('pack and unpack: a pick comes back as the kit made it, whatever kind it is', () => {
  const g = { id: 'x_g', sport: 'mlb', startUtc: new Date(NOW + HOUR).toISOString(), away: { en: 'A', zh: '甲' }, home: { en: 'B', zh: '乙' } };
  const bet = (id, extra) => ({ id: `${g.id}|${id}`, gameId: g.id, sport: 'mlb', start: g.startUtc, game: g, fairMargin: 0.02, errKey: 'mlb', cut: 1.16, fairChance: 0.123456789, estOdds: 8.1, lock: null, minLegs: 1, ...extra });
  const bets = [
    bet('ml|home', { kind: 'ml', side: 'home', market: 'ml', lock: 'high', minLegs: 2, cap: 'house' }),
    bet('rl|-1.5|away', { kind: 'runline', side: 'away', runLine: -1.5, awayLine: -1.5, giver: 'away', posted: true, market: 'rl|-1.5' }),
    bet('rl|-1.5|home', { kind: 'runline', side: 'home', runLine: 1.5, awayLine: -1.5, giver: 'away', posted: true, market: 'rl|-1.5' }),
    bet('tt|home|2.5|over', { kind: 'teamtotal', side: 'over', team: 'home', teamLine: 2.5, market: 'tt|home|2.5', posted: false }),
    bet('total|total|212.5|over', { kind: 'total', side: 'over', totalLine: 212.5, mainLine: true, posted: true, market: 'total|212.5' }),
    // (A market's pick, unnamed from the pick alone: not carried.)
    bet('dc|x|home|draw', { kind: 'dc', side: 'home|draw', m: {}, pick: {} })
  ];
  const recs = new Map(bets.map((b, i) => [b.id, { tag: i === 3 ? 'value' : i === 4 ? 'steady' : null, back: 100 - i }]).filter(([, r]) => r.tag));
  const [packed] = packGames({ games: [g], bets, recs, now: NOW });
  assert.equal(packed.p.length, 5);
  const back = unpackBoard({ games: [packed] });
  for (const b of back.bets) {
    const was = bets.find(x => x.id === b.id);
    for (const k of ['kind', 'side', 'market', 'runLine', 'awayLine', 'giver', 'team', 'teamLine', 'totalLine', 'lock', 'minLegs', 'cap']) assert.deepEqual(b[k] ?? null, was[k] ?? null, `${b.id} ${k}`);
    for (const k of ['posted', 'mainLine']) assert.equal(Boolean(b[k]), Boolean(was[k]), `${b.id} ${k}`);
    assert.equal(b.fairChance, 0.1235);
    assert.equal(b.estOdds, 8.1);
    assert.equal(b.game, back.games[0]);
  }
  assert.equal(back.recs.get(`${g.id}|tt|home|2.5|over`).tag, 'value');
  assert.deepEqual(fieldsOf('prop|goals|1|Saka|yes'), {});
});

test('one league that cannot be read is left out and the rest written; the phone is told which', async () => {
  const { result, board } = await build({ down: url => url.includes('/basketball/nba/') });
  assert.deepEqual(board.missed, ['nba']);
  assert.ok(!board.covered.includes('nba') && board.covered.length === Object.keys(LEAGUES).length - 1);
  assert.ok(!('nba' in board.counts) && !board.games.some(g => g.sport === 'nba'));
  assert.ok(board.games.some(g => g.sport === 'mlb') && board.games.some(g => g.sport === 'epl'));
  assert.equal(result.failed, undefined, 'one league of thirty is not a failure');
});

test('a league that had games ten minutes ago and answers none now is not believed (an empty list is how some sources fail)', async () => {
  const first = await build();
  assert.ok(first.board.counts.euroleague > 0);
  // Kambi's list for EuroLeague answers nothing, as a read that failed quietly does.
  const sources = fakeSources({ now: NOW + 10 * 60_000 });
  const proxy = async (url, trim) => (/basketball\/euroleague/.test(url) ? { events: [] } : sources.proxy(url, trim));
  const again = await build({ store: first.store, now: NOW + 10 * 60_000, proxy });
  assert.deepEqual(again.board.missed, ['euroleague']);
  assert.ok(!('euroleague' in again.board.counts));
  // (Believed next time round: it said none twice.)
  const third = await build({ store: first.store, now: NOW + 20 * 60_000, proxy: async (url, trim) => (/basketball\/euroleague/.test(url) ? { events: [] } : fakeSources({ now: NOW + 20 * 60_000 }).proxy(url, trim)) });
  assert.deepEqual(third.board.missed, []);
});

test('the lottery down: the board is written without its jackpots; the phone reads them itself', async () => {
  const { board } = await build({ lottery: fakeLottery({ fail: true }) });
  assert.equal(board.lottery, null);
  assert.ok(board.games.length > 100);
});

test('an old board is not overwritten by an empty one (everything down, or every list quietly empty)', async () => {
  const first = await build();
  const before = await first.store.bytes(BOARD_PATH);
  const later = NOW + 10 * 60_000;
  // Nothing reads.
  const down = await build({ store: first.store, now: later, proxy: async () => null });
  assert.ok(down.result.failed, 'said so to the heartbeat');
  // Every source answers, with nothing on it.
  const quiet = await build({ store: first.store, now: later, proxy: async url => (url.includes('asia-baseball') ? { games: [] } : /gamma-api/.test(url) ? [] : { events: [] }) });
  assert.ok(quiet.result.failed, JSON.stringify(quiet.result) + JSON.stringify((await quiet.store.json(BOARD_PATH)).games.map(g => g.id)));
  assert.deepEqual(await first.store.bytes(BOARD_PATH), before);
  // With no old board, a board with nothing on it is still written (a quiet night is not a failure).
  const none = await build({ now: later, proxy: async url => (url.includes('asia-baseball') ? { games: [] } : /gamma-api/.test(url) ? [] : { events: [] }) });
  assert.equal(none.board?.games.length, 0);
});

test('written every run, even when nothing moved: its `built` is how old the phone\'s copy may be', async () => {
  const first = await build();
  const again = await build({ store: first.store, now: NOW + 10 * 60_000 });
  assert.equal(again.board.built, new Date(NOW + 10 * 60_000).toISOString());
  assert.equal(first.store.stats.written, 2, 'written both times');
  // Other builders' files still only when changed.
  const s = r2Store(memoryBucket());
  await s.put('x.json', { built: 'a', n: 1 });
  assert.equal(await s.put('x.json', { built: 'b', n: 1 }), false);
});

test('the file is used while it is fresh and its shape is known', () => {
  const file = { v: BOARD_V, built: new Date(NOW).toISOString(), games: [] };
  assert.ok(boardUsable(file, NOW + 60_000));
  assert.ok(boardUsable(file, NOW + BOARD_STALE_MS));
  assert.ok(!boardUsable(file, NOW + BOARD_STALE_MS + 1), 'past 30 minutes');
  assert.ok(!boardUsable({ ...file, v: BOARD_V + 1 }, NOW), 'another shape');
  assert.ok(!boardUsable({ ...file, built: 'soon' }, NOW) && !boardUsable(null, NOW) && !boardUsable({ ...file, games: null }, NOW));
  assert.ok(!boardUsable(file, NOW - 10 * 60_000), 'from the future (a wrong clock)');
});

test('scheduled: six runs an hour on minutes no other job has, even ones; held off from pace 1; by hand at any pace', async () => {
  assert.deepEqual(PLAY_MINUTES, [8, 18, 28, 38, 48, 58]);
  const others = Object.entries(SLOTS).filter(([, job]) => job !== 'play');
  for (const m of PLAY_MINUTES) {
    assert.equal(SLOTS[m], 'play');
    assert.equal(m % 2, 0, 'the even-minute cron');
    assert.ok(m % 10 !== 0, 'not the guard/weather/capacity minutes');
  }
  assert.ok(others.length >= 4 && others.every(([m]) => !PLAY_MINUTES.includes(Number(m))));
  assert.ok(builderAllowed(0, 'play') && !builderAllowed(1, 'play') && !builderAllowed(2, 'play'));
  const { proxy } = fakeSources({ now: NOW });
  const DATA = memoryBucket();
  const paced = await runBuilders({ DATA }, { proxy, now: NOW, job: 'play', pace: 1, log: () => {}, lottery: fakeLottery() });
  assert.deepEqual(paced.play, { paced: 1 });
  assert.equal(await DATA.get(BOARD_PATH), null);
  // (The cron's minute 8 picks the job itself.)
  const fresh = await runBuilders({ DATA }, { proxy, now: NOW, pace: 0, log: () => {}, lottery: fakeLottery() });
  assert.ok(fresh.play.games > 100 && fresh.play.bytes > 0, JSON.stringify(fresh.play).slice(0, 200));
  const file = JSON.parse(new TextDecoder().decode((await (await DATA.get(BOARD_PATH)).arrayBuffer().then(b => new Uint8Array(b)))));
  assert.equal(file.v, BOARD_V);
  const byHand = await runBuilders({ DATA }, { proxy, now: NOW + 10 * 60_000, only: 'play', pace: 2, log: () => {}, lottery: fakeLottery() });
  assert.ok(byHand.play.games > 0);
  // Another minute runs no Play.
  assert.deepEqual(await runBuilders({ DATA }, { proxy, now: NOW + 60_000, log: () => {} }), { off: 'no job this minute' });
});
