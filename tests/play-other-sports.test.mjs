// 台灣運彩's sports besides the leagues (its 玩法 list): tennis and the
// other set sports, esports, and the ones sold on their winner (snooker,
// darts, handball, rugby, futsal), all from Kambi.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseKambiEvents } from '../kit/play-kambi.mjs';
import { gameOptions } from '../kit/play-board.mjs';
import { decidedTeamGame, legResult } from '../kit/settle.mjs';
import { teamZh } from '../kit/names.mjs';
import { countryName } from '../kit/logos.mjs';

const START = '2026-10-22T10:00:00Z';
const NOW = new Date('2026-10-21T10:00:00Z');
const offer = (type, label, outcomes) => ({ betOfferType: { englishName: type }, criterion: { englishLabel: label }, outcomes });
const match = (id, path, home, away, outcomes) => ({ event: { id, homeName: home, awayName: away, start: START, state: 'NOT_STARTED', path }, betOffers: [offer('Match', 'Match Odds', outcomes)] });
const two = [{ type: 'OT_ONE', odds: 1700 }, { type: 'OT_TWO', odds: 2100 }];

test('tennis: the tours and the Slams only, the women\'s draws marked', () => {
  const data = { events: [match(1, ['tennis', 'atp', 'lyon'], 'Jannik Sinner', 'Arthur Fils', two), match(2, ['tennis', 'itf_men', 'ithaca'], 'A B', 'C D', two), match(3, ['tennis', 'wta', 'osaka'], 'Naomi Osaka', 'Coco Gauff', two), match(4, ['tennis', 'challenger', 'florence'], 'E F', 'G H', two)] };
  const games = parseKambiEvents(data, 'tennis', NOW);
  assert.deepEqual(games.map(g => g.kambiId).sort(), [1, 3]);
  assert.ok(games.find(g => g.kambiId === 3).women);
  assert.ok(!games.find(g => g.kambiId === 1).women);
  assert.equal(teamZh('tennis', 'Jannik Sinner'), '辛納');
  assert.equal(teamZh('tennis', 'C. Alcaraz/J. Sinner'), '艾卡拉茲/辛納');
});

test('esports: League of Legends and Counter-Strike\'s top events, not Dota or a small cup', () => {
  const data = { events: [match(1, ['esports', 'league_of_legends', 'world_championship'], 'T1', 'Gen.G', two), match(2, ['esports', 'dota_2', 'p_universe'], 'A', 'B', two), match(3, ['esports', 'cs2', 'iem_beijing'], 'Vitality', 'NAVI', two), match(4, ['esports', 'cs2', 'circuit_x'], 'Fluxo', 'Galorys', two)] };
  assert.deepEqual(parseKambiEvents(data, 'esports', NOW).map(g => g.kambiId).sort(), [1, 3]);
  // Settled on the maps won once Kambi has dropped the match.
  const live = { score: { home: 2, away: 1 }, periods: { home: [], away: [] }, sets: null, changedAt: null, clock: null };
  assert.equal(decidedTeamGame(live, 'esports', START, new Date('2026-10-22T14:00:00Z')), null);
  const r = decidedTeamGame(live, 'esports', START, new Date('2026-10-22T14:00:00Z'), { ended: true });
  assert.equal(legResult({ kind: 'ml', side: 'home', sport: 'esports' }, r), 'won');
});

test('handball is three ways (和), its winner the only market; snooker two ways', () => {
  const three = [{ type: 'OT_ONE', odds: 1800 }, { type: 'OT_CROSS', odds: 9000 }, { type: 'OT_TWO', odds: 2100 }];
  const [hb] = parseKambiEvents({ events: [{ ...match(1, ['handball', 'champions_league'], 'Kiel', 'Veszprem', three), betOffers: [offer('Match', 'Match Odds', three), offer('Over/Under', 'Total Goals', [{ type: 'OT_OVER', odds: 1900, line: 60500 }, { type: 'OT_UNDER', odds: 1900, line: 60500 }])] }] }, 'handball', NOW);
  assert.ok(hb.draftKings.draw > 0.05);
  const opts = gameOptions(hb);
  assert.deepEqual([...new Set(opts.map(o => o.kind))], ['ml']);
  assert.deepEqual(opts.map(o => o.side).sort(), ['away', 'draw', 'home']);
  const [sn] = parseKambiEvents({ events: [match(2, ['snooker', 'northern_ireland_open'], 'Zhang Anda', 'Mark Williams', two)] }, 'snooker', NOW);
  assert.deepEqual(gameOptions(sn).map(o => o.side).sort(), ['away', 'home']);
});

test('the winner-only sports settle on Kambi\'s last score', () => {
  const live = (home, away, changedAt = null) => ({ score: { home, away }, periods: { home: [], away: [] }, sets: null, changedAt, clock: null });
  const late = new Date('2026-10-22T13:30:00Z');
  // Snooker: first to frames Kambi doesn't say: only once the match is dropped.
  assert.equal(decidedTeamGame(live(4, 2), 'snooker', START, late), null);
  assert.equal(legResult({ kind: 'ml', side: 'home', sport: 'snooker' }, decidedTeamGame(live(4, 2), 'snooker', START, late, { ended: true })), 'won');
  // Handball: a level score still long past its start is a draw.
  const draw = decidedTeamGame(live(30, 30), 'handball', START, late);
  assert.equal(legResult({ kind: 'ml', side: 'draw', sport: 'handball' }, draw), 'won');
  assert.equal(legResult({ kind: 'ml', side: 'home', sport: 'handball' }, draw), 'lost');
  // Rugby's two-way winner: level is void.
  assert.equal(legResult({ kind: 'ml', side: 'home', sport: 'rugbyunion' }, decidedTeamGame(live(20, 20), 'rugbyunion', START, late)), 'void');
  // Still going (the score changed a minute ago): not yet.
  assert.equal(decidedTeamGame(live(25, 24, late.getTime() - 60_000), 'handball', START, late), null);
});

test('a women\'s national side reads as one', () => {
  assert.equal(countryName('Belgium (W)'), '比利時(女)');
  assert.equal(teamZh('volleyball', 'Poland'), '波蘭');
});

test('UFC: Kambi prices, the winner from ESPN card, a draw void', async () => {
  const { CATALOG } = await import('../kit/catalog.mjs');
  const { LEAGUES, boutResult, readOutcomes } = await import('../kit/settle.mjs');
  assert.equal(CATALOG.ufc.sport, 'mma');
  assert.equal(LEAGUES.ufc.results, 'mma/ufc/scoreboard');
  const bout = (x, y, wx, wy, name = 'STATUS_FINAL', completed = true) => ({ events: [{ date: '2026-10-17T21:00Z', status: { type: { completed: true } }, competitions: [{ status: { type: { name, completed, state: completed ? 'post' : 'pre' } }, competitors: [{ athlete: { displayName: x }, winner: wx }, { athlete: { displayName: y }, winner: wy }] }] }] });
  assert.deepEqual(boutResult(bout('SuYoung You', 'Cody Chovancek', true, false), 'SuYoung You', 'Cody Chovancek'), { status: 'final', homeScore: 1, awayScore: 0 });
  assert.deepEqual(boutResult(bout('Cody Chovancek', 'SuYoung You', false, true), 'SuYoung You', 'Cody Chovancek'), { status: 'final', homeScore: 1, awayScore: 0 });
  assert.deepEqual(boutResult(bout('A Fighter', 'B Fighter', false, false), 'A Fighter', 'B Fighter'), { status: 'void' });
  assert.equal(boutResult(bout('A Fighter', 'B Fighter', false, false, 'STATUS_SCHEDULED', false), 'A Fighter', 'B Fighter'), null);
  assert.equal(boutResult(bout('A Fighter', 'B Fighter', true, false), 'C Other', 'D Other'), null);
  const card = bout('Cody Chovancek', 'SuYoung You', false, true);
  const leg = { id: 'l1', sport: 'ufc', kind: 'ml', kambiId: 1, home: 'SuYoung You', away: 'Cody Chovancek', start: '2026-10-17T21:00:00Z' };
  const read = url => (url.includes('mma/ufc/scoreboard?dates=20261017') ? card : { events: [] });
  const out = await readOutcomes([leg], { read, now: new Date('2026-10-18T06:00:00Z') });
  assert.equal(out.get('l1').status, 'final');
  assert.equal(out.get('l1').homeScore, 1);
  // The card over without the bout: void.
  const gone = await readOutcomes([{ ...leg, home: 'X Nobody', away: 'Y Nobody' }], { read, now: new Date('2026-10-18T06:00:00Z') });
  assert.equal(gone.get('l1').status, 'void');
});

test('cricket: one-day and T20 internationals and the big leagues, the winner from ESPN, a draw or no result void', async () => {
  const { CATALOG } = await import('../kit/catalog.mjs');
  const { winnerResult, readOutcomes } = await import('../kit/settle.mjs');
  const only = CATALOG.cricket.only;
  for (const p of ['cricket/international_one_day/matches', 'cricket/international_twenty20__w_/matches', 'cricket/indian_premier_league', 'cricket/t20_big_bash']) assert.ok(only.test(p), p);
  for (const p of ['cricket/international_test_cricket/matches', 'cricket/south_africa/pro20_cup', 'cricket/t20_womens_big_bash']) assert.ok(!only.test(p), p);
  const panel = (x, y, wx, wy, state = 'post', date = '2026-10-22T08:00Z') => ({ scores: [{ events: [{ date, competitions: [{ status: { type: { state } }, competitors: [{ team: { displayName: x }, winner: wx }, { team: { displayName: y }, winner: wy }] }] }] }] });
  assert.deepEqual(winnerResult(panel('Sri Lanka', 'England', 'false', 'true'), 'Sri Lanka', 'England', '2026-10-22T08:00:00Z'), { status: 'final', homeScore: 0, awayScore: 1 });
  assert.deepEqual(winnerResult(panel('Sri Lanka', 'England', 'false', 'false'), 'Sri Lanka', 'England', '2026-10-22T08:00:00Z'), { status: 'void' });
  assert.equal(winnerResult(panel('Sri Lanka', 'England', 'false', 'true'), 'Sri Lanka', 'England', '2026-10-25T08:00:00Z'), null);
  assert.equal(winnerResult(panel('Sri Lanka', 'England', 'false', 'false', 'in'), 'Sri Lanka', 'England', '2026-10-22T08:00:00Z').state, 'in');
  const leg = { id: 'c', sport: 'cricket', kind: 'ml', kambiId: 2, home: 'Sri Lanka', away: 'England', start: '2026-10-22T08:00:00Z' };
  const read = url => (url.includes('cricket/scorepanel?dates=20261022') ? panel('Sri Lanka', 'England', 'true', 'false') : { scores: [] });
  assert.equal((await readOutcomes([leg], { read, now: new Date('2026-10-22T20:00:00Z') })).get('c').homeScore, 1);
  // Nothing listed yet a day on: no answer (not void).
  assert.equal((await readOutcomes([{ ...leg, home: 'Nepal', away: 'Oman' }], { read, now: new Date('2026-10-23T20:00:00Z') })).has('c'), false);
});

test('a Kambi group that is only "Matches" reads as the competition above it', async () => {
  const { parseKambiEvents } = await import('../kit/play-kambi.mjs');
  const offer = { betOfferType: { englishName: 'Match' }, criterion: { englishLabel: 'Match Odds' }, outcomes: [{ type: 'OT_ONE', odds: 1500, status: 'OPEN' }, { type: 'OT_TWO', odds: 2500, status: 'OPEN' }] };
  const path = [{ englishName: 'Cricket', termKey: 'cricket' }, { englishName: 'International One Day', termKey: 'international_one_day' }, { englishName: 'Matches', termKey: 'matches' }];
  const data = { events: [{ event: { id: 1, state: 'NOT_STARTED', homeName: 'Sri Lanka', awayName: 'England', start: '2030-01-01T08:00:00Z', group: 'Matches', path }, betOffers: [offer] }] };
  assert.equal(parseKambiEvents(data, 'cricket', new Date('2029-12-31T00:00:00Z'))[0].group, 'International One Day');
  // Trimmed by the proxy: termKeys.
  data.events[0].event.path = ['cricket', 'international_twenty20__w_', 'matches'];
  assert.equal(parseKambiEvents(data, 'cricket', new Date('2029-12-31T00:00:00Z'))[0].group, 'International Twenty20 (W)');
});

test('golf 冠軍: the next tournaments from Kambi, settled on ESPN\'s leaderboard', async () => {
  const { parseKambiGolf } = await import('../kit/play-sources.mjs');
  const { golfResult, readOutcomes, legResult } = await import('../kit/settle.mjs');
  const offer = { criterion: { englishLabel: 'Finishing Position' }, from: 1, to: 1, outcomes: Array.from({ length: 30 }, (_, i) => ({ participant: `Player ${String.fromCharCode(65 + i)}`, odds: 5000 + i * 4000, status: 'OPEN' })) };
  const ev = (id, name, path, start, offers = [offer]) => ({ event: { id, name, path, start, state: 'NOT_STARTED' }, betOffers: offers });
  const list = { events: [
    ev(1, 'Butterfield Bermuda Championship 2026', ['golf', 'pga_tour', 'butterfield_bermuda_championship'], '2026-10-22T10:35:00Z'),
    ev(2, 'Winner without Ben James (Butterfield Bermuda Championship 2026)', ['golf', 'pga_tour', 'x'], '2026-10-22T10:35:00Z'),
    ev(3, 'Stifel Charity Classic 2026', ['golf', 'champions_tour', 'x'], '2026-10-23T11:00:00Z'),
    ev(4, 'Genesis Championship 2026', ['golf', 'dp_world_tour', 'x'], '2026-12-01T00:00:00Z')
  ] };
  const boards = parseKambiGolf(list, new Date('2026-10-21T00:00:00Z'));
  assert.deepEqual(boards.map(b => b.key), ['golf1']);
  assert.equal(boards[0].slug, 'golf:pga:20261022:Butterfield Bermuda Championship');
  assert.equal(boards[0].teams.length, 30);
  assert.ok(Math.abs(boards[0].teams.reduce((a, t) => a + t.fair, 0) - 1) < 1e-6);
  // Never longer than Kambi's own price.
  const { futureBets } = await import('../kit/play-bets.mjs');
  for (const b of futureBets(boards)) assert.ok(b.estOdds <= b.futureTeam.book + 1e-9, b.teamEn);
  const board = { events: [{ name: 'Butterfield Bermuda Championship', date: '2026-10-22T04:00Z', status: { type: { completed: true, name: 'STATUS_FINAL' } }, competitions: [{ competitors: [{ order: 2, athlete: { displayName: 'Ben James' } }, { order: 1, athlete: { displayName: 'Player B' } }] }] }] };
  const t = Date.parse('2026-10-22T12:00:00Z');
  assert.deepEqual(golfResult(board, 'Butterfield Bermuda Championship', t), { status: 'final', winner: 'Player B' });
  const leg = { id: 'g', kind: 'future', market: 'golf1', team: 'Player B', eventSlug: boards[0].slug };
  const out = await readOutcomes([leg], { read: url => (url.includes('golf/pga/scoreboard') ? board : null), now: new Date('2026-10-26T00:00:00Z') });
  assert.equal(legResult(leg, out.get('g')), 'won');
  assert.equal(legResult({ ...leg, team: 'Player C' }, out.get('g')), 'lost');
});

test("the translator's second endpoint (client=gtx) answer read as one text", async () => {
  const { gtxText } = await import('../sports.js');
  assert.equal(gtxText(JSON.stringify([[['納克羅斯拉勒；', 'Knack Roeselare; ', null], ['軸吉貝爾坦', 'Axis Guibertin', null]], null, 'en'])), '納克羅斯拉勒；軸吉貝爾坦');
  assert.equal(gtxText('nope'), '');
});
