// Play's markets as 台灣運彩 sells them (the round 6 realism audit): what's
// on sale, how each new market is priced, and how each settles.
import test from 'node:test';
import assert from 'node:assert/strict';
import { legResult, touchdowns } from '../kit/settle.mjs';
import { pointsModel, pointsMarkets, BASKETBALL_BANDS } from '../kit/play-markets.mjs';

const game = (away, home, extra = {}) => ({ status: 'final', awayScore: away, homeScore: home, awayInnings: [], homeInnings: [], ...extra });
const sum = picks => picks.reduce((s, p) => s + p.fair, 0);

test('basketball 勝分差 in 運彩 bands (1-5 … 26+, and the 6-pick 1-5 / 6-10 / 11+); none for American football, which gets 半場讓分 and 達陣數大小', () => {
  const nba = pointsModel('nba', { homeWin: 0.7, spread: { awayLine: 6.5, awayFair: 0.5 }, total: { line: 225.5, overFair: 0.5 } });
  const markets = pointsMarkets(nba, { spreadLine: 6.5, totalLine: 225.5 });
  const twelve = markets.find(m => m.market === 'margin');
  assert.equal(twelve.picks.length, 12);
  assert.deepEqual(twelve.picks.filter(p => p.team === 'home').map(p => [p.lo, p.hi]), BASKETBALL_BANDS);
  const six = markets.find(m => m.market === 'margin6');
  assert.deepEqual(six.picks.map(p => p.side), ['home|1', 'home|6', 'home|11', 'away|1', 'away|6', 'away|11']);
  for (const m of [twelve, six]) assert.ok(Math.abs(sum(m.picks) - 1) < 1e-9);
  // Both settle on the band (an old 21+ pick too).
  assert.equal(legResult({ sport: 'nba', kind: 'margin', team: 'home', lo: 11, hi: null }, game(90, 104)), 'won');
  assert.equal(legResult({ sport: 'nba', kind: 'margin', team: 'home', lo: 21, hi: 25 }, game(90, 117)), 'lost');
  assert.equal(legResult({ sport: 'nba', kind: 'margin', team: 'home', lo: 21, hi: null }, game(90, 117)), 'won', 'a pick on the old 21+ band still settles');

  const nfl = pointsModel('nfl', { homeWin: 0.7, spread: { awayLine: 6.5, awayFair: 0.5 }, total: { line: 45.5, overFair: 0.5 } });
  const nflMarkets = pointsMarkets(nfl, { spreadLine: 6.5, totalLine: 45.5 });
  assert.ok(!nflMarkets.some(m => m.kind === 'margin'), "運彩 sells no NFL 勝分差");
  const halves = nflMarkets.filter(m => m.kind === 'hrunline');
  assert.ok(halves.length >= 2 && halves.every(m => m.picks[0].line === m.awayLine && m.picks[1].line === -m.awayLine));
  const main = halves.find(m => m.posted);
  assert.ok(Math.abs(main.picks[0].fair - 0.5) < 0.1, 'the posted half line near even');
  const tds = nflMarkets.filter(m => m.kind === 'tdtotal');
  assert.ok(tds.length >= 2 && tds.find(m => m.posted).line === 5.5, 'about five touchdowns on 45.5 points');
  // 半場讓分 on the first two quarters; 達陣數大小 on the game's touchdowns.
  const q = game(20, 24, { awayInnings: [7, 3, 7, 3], homeInnings: [0, 3, 14, 7] });
  assert.equal(legResult({ sport: 'nfl', kind: 'hrunline', side: 'home', line: 3.5 }, q), 'lost', '3-10 at the half, +3.5');
  assert.equal(legResult({ sport: 'nfl', kind: 'hrunline', side: 'away', line: -3.5 }, q), 'won');
  assert.equal(legResult({ sport: 'nfl', kind: 'hrunline', side: 'away', line: -7 }, q), 'void');
  assert.equal(legResult({ sport: 'nfl', kind: 'hrunline', side: 'away', line: -3.5 }, game(20, 24)), null, 'quarters unread: not decided');
  assert.equal(legResult({ sport: 'nfl', kind: 'tdtotal', side: 'over', line: 4.5 }, { ...q, touchdowns: 5 }), 'won');
  assert.equal(legResult({ sport: 'nfl', kind: 'tdtotal', side: 'over', line: 4.5 }, q), null, 'no scoring plays read: not decided');
  const plays = [{ type: { abbreviation: 'TD', text: 'Passing Touchdown' } }, { type: { abbreviation: 'FG', text: 'Field Goal Good' } }, { type: { abbreviation: 'TD', text: 'Rushing Touchdown' } }, { type: { abbreviation: 'INTTD', text: 'Interception Return Touchdown' } }];
  assert.equal(touchdowns(plays), 3);
});
