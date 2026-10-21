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
  assert.equal(LEAGUES.ufc.results, 'mma/ufc');
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
