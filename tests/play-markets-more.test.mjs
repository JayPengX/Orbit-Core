// The rest of 運彩's 玩法 list (article.sportslottery.com.tw innovation/2):
// each sport's new markets, how each is priced, and how each settles.
import test from 'node:test';
import assert from 'node:assert/strict';
import { legResult, parseEspnResults, soccerGoals, runOrder } from '../kit/settle.mjs';
import { pointsModel, pointsMarkets, fitHockey, goalMarkets, baseballMarkets, HALF_SCORES } from '../kit/play-markets.mjs';
import { fitGoals } from '../kit/play-live.mjs';

const game = (away, home, extra = {}) => ({ status: 'final', awayScore: away, homeScore: home, awayInnings: [], homeInnings: [], ...extra });
const sum = picks => picks.reduce((s, p) => s + p.fair, 0);
const kinds = markets => new Set(markets.map(m => m.kind));

test('basketball: 單雙, 半場讓分, 單節讓分 and 大小, 得分最高單節, 先得20分, 不讓分/大小; the NFL 單雙 and 單節大小 alone', () => {
  const nba = pointsModel('nba', { homeWin: 0.7, spread: { awayLine: 6.5, awayFair: 0.5 }, total: { line: 225.5, overFair: 0.5 } });
  const m = pointsMarkets(nba, { spreadLine: 6.5, totalLine: 225.5 });
  for (const k of ['oddeven', 'hrunline', 'qrunline', 'qtotal', 'topperiod', 'raceto', 'mltotal']) assert.ok(kinds(m).has(k), k);
  for (const x of m.filter(x => ['oddeven', 'topperiod', 'raceto', 'mltotal'].includes(x.kind))) assert.ok(Math.abs(sum(x.picks) - 1) < 1e-9, x.kind);
  const top = m.find(x => x.kind === 'topperiod');
  assert.deepEqual(top.picks.map(p => p.side), ['1', '2', '3', '4', 'tie']);
  assert.ok(top.picks[4].fair > 0.01 && top.picks[4].fair < 0.1);
  // The home favourite gets to 20 first more often.
  const race = m.find(x => x.kind === 'raceto');
  assert.ok(race.picks.find(p => p.side === 'home').fair > 0.55);
  const q = m.find(x => x.kind === 'qtotal' && x.posted);
  assert.ok(Math.abs(q.line - 56.5) <= 1, q.line);

  const nfl = pointsModel('nfl', { homeWin: 0.7, spread: { awayLine: 6.5, awayFair: 0.5 }, total: { line: 45.5, overFair: 0.5 } });
  const f = kinds(pointsMarkets(nfl, { spreadLine: 6.5, totalLine: 45.5 }));
  assert.ok(f.has('oddeven') && f.has('qtotal') && f.has('hrunline'));
  for (const k of ['qrunline', 'topperiod', 'raceto', 'mltotal']) assert.ok(!f.has(k), k);
});

test('soccer: 單雙, 主(客)隊正確進球數, 半場雙勝, 上半場正確比數, 第一球, 最後進球, 得分較高半場 and the two combos; hockey: its 單節 markets', () => {
  const m = goalMarkets(fitGoals(0.5, 0.25), { family: 'soccer' });
  for (const k of ['oddeven', 'teamgoals', 'hdc', 'hscore', 'firstgoal', 'lastgoal', 'higherhalf', 'mltotal', 'mlbtts']) assert.ok(kinds(m).has(k), k);
  for (const x of m.filter(x => ['oddeven', 'teamgoals', 'hscore', 'firstgoal', 'higherhalf', 'mltotal', 'mlbtts'].includes(x.kind))) assert.ok(Math.abs(sum(x.picks) - 1) < 1e-6, x.kind);
  assert.deepEqual(m.find(x => x.kind === 'hscore').picks.map(p => p.side), [...HALF_SCORES, 'other']);
  // The second half has more goals.
  const hh = m.find(x => x.kind === 'higherhalf').picks;
  assert.ok(hh.find(p => p.side === 'second').fair > hh.find(p => p.side === 'first').fair);
  assert.equal(m.filter(x => x.kind === 'teamgoals').length, 2);

  const h = goalMarkets(fitHockey(0.6, { line: 6.5, overFair: 0.5 }), { family: 'hockey', totalLine: 6.5 });
  for (const k of ['oddeven', 'teamgoals', 'q1', 'qtotal', 'topperiod', 'mltotal']) assert.ok(kinds(h).has(k), k);
  for (const k of ['hdc', 'firstgoal', 'mlbtts']) assert.ok(!kinds(h).has(k), k);
  assert.deepEqual(h.find(x => x.kind === 'topperiod').picks.map(p => p.side), ['1', '2', '3', 'tie']);
});

test('baseball: 單雙; MLB 安打數大小 and each side\'s; 先得3分 with 無', () => {
  const plain = kinds(baseballMarkets({ homeWin: 0.55, total: { line: 8.5, overFair: 0.5 } }));
  assert.ok(plain.has('oddeven') && !plain.has('hits') && !plain.has('raceto'));
  const m = baseballMarkets({ homeWin: 0.55, total: { line: 8.5, overFair: 0.5 } }, { hits: true, race: true });
  const hits = m.find(x => x.kind === 'hits' && x.posted);
  assert.ok(hits.line >= 15.5 && hits.line <= 18.5, hits.line);
  assert.equal(m.filter(x => x.kind === 'teamhits' && x.posted).length, 2);
  const race = m.find(x => x.kind === 'raceto');
  assert.equal(race.line, 3);
  assert.ok(Math.abs(sum(race.picks) - 1) < 1e-9);
  const none = race.picks.find(p => p.side === 'none').fair;
  assert.ok(none > 0.05 && none < 0.3, none);
});

test('each settles from the game', () => {
  const nba = { sport: 'nba' };
  const q = game(100, 110, { awayInnings: [30, 20, 26, 24], homeInnings: [25, 30, 30, 25] });
  assert.equal(legResult({ ...nba, kind: 'qrunline', period: 1, side: 'home', line: 4.5 }, q), 'lost');
  assert.equal(legResult({ ...nba, kind: 'qtotal', period: 1, side: 'under', line: 56.5 }, q), 'won');
  assert.equal(legResult({ ...nba, kind: 'topperiod', side: '3' }, q), 'won');
  assert.equal(legResult({ ...nba, kind: 'topperiod', side: 'tie' }, game(100, 100, { awayInnings: [30, 20, 25, 25, 10], homeInnings: [20, 30, 25, 25, 10] })), 'won');
  assert.equal(legResult({ ...nba, kind: 'oddeven', side: 'odd' }, q), 'lost');
  assert.equal(legResult({ ...nba, kind: 'mltotal', side: 'home|over', line: 205.5 }, q), 'won');
  assert.equal(legResult({ ...nba, kind: 'raceto', side: 'away', line: 3 }, game(1, 2, { runOrder: ['home', 'away', 'away', 'home', 'away'] })), 'won');
  assert.equal(legResult({ sport: 'mlb', kind: 'raceto', side: 'none', line: 3 }, game(1, 2, { runOrder: ['home', 'away', 'home'] })), 'won');
  assert.equal(legResult({ sport: 'mlb', kind: 'raceto', side: 'none', line: 3 }, game(1, 2)), null);

  const epl = { sport: 'epl' };
  const s = game(1, 2, { awayInnings: [1, 0], homeInnings: [0, 2], goalOrder: ['away', 'home', 'home'] });
  assert.equal(legResult({ ...epl, kind: 'hdc', side: 'draw|away' }, s), 'won');
  assert.equal(legResult({ ...epl, kind: 'hscore', score: '0-1', listed: HALF_SCORES }, s), 'won');
  assert.equal(legResult({ ...epl, kind: 'firstgoal', side: 'away' }, s), 'won');
  assert.equal(legResult({ ...epl, kind: 'lastgoal', side: 'home' }, s), 'won');
  assert.equal(legResult({ ...epl, kind: 'firstgoal', side: 'none' }, game(0, 0, { goalOrder: [] })), 'won');
  assert.equal(legResult({ ...epl, kind: 'higherhalf', side: 'second' }, s), 'won');
  assert.equal(legResult({ ...epl, kind: 'teamgoals', team: 'home', lo: 2, hi: 2 }, s), 'won');
  assert.equal(legResult({ ...epl, kind: 'mlbtts', side: 'home|yes' }, s), 'won');
  assert.equal(legResult({ ...epl, kind: 'mltotal', side: 'home|under', line: 2.5 }, s), 'lost');

  // Hockey on 60 minutes: an overtime goal counts for none of them.
  const nhl = game(3, 2, { awayInnings: [1, 1, 0, 1], homeInnings: [0, 1, 1, 0] });
  assert.equal(legResult({ sport: 'nhl', kind: 'mltotal', side: 'draw|under', line: 5.5 }, nhl), 'won');
  assert.equal(legResult({ sport: 'nhl', kind: 'topperiod', side: '2' }, nhl), 'won');
  assert.equal(legResult({ sport: 'nhl', kind: 'q1', side: 'away' }, nhl), 'won');

  assert.equal(legResult({ sport: 'mlb', kind: 'hits', side: 'over', line: 16.5 }, game(3, 1, { awayHits: 12, homeHits: 5 })), 'won');
  assert.equal(legResult({ sport: 'mlb', kind: 'teamhits', team: 'home', side: 'over', line: 7.5 }, game(3, 1, { awayHits: 12, homeHits: 5 })), 'lost');
  assert.equal(legResult({ sport: 'mlb', kind: 'hits', side: 'over', line: 16.5 }, game(3, 1)), null);
});

test('ESPN\'s soccer scoreboard: halves and goal order from its goals; MLB\'s hits', () => {
  const comp = (details, extra = {}) => ({ events: [{ id: '1', date: '2026-10-18T14:00Z', competitions: [{ status: { type: { name: 'STATUS_FULL_TIME', completed: true, state: 'post' } }, details, competitors: [
    { homeAway: 'home', score: '2', team: { id: '9', displayName: 'Home FC' }, ...extra.home },
    { homeAway: 'away', score: '1', team: { id: '7', displayName: 'Away FC' }, ...extra.away }
  ] }] }] });
  const goal = (team, clock, more = {}) => ({ scoringPlay: true, team: { id: team }, clock: { displayValue: clock }, ...more });
  const [g] = parseEspnResults(comp([goal('7', "12'"), { scoringPlay: false, team: { id: '9' }, clock: { displayValue: "30'" } }, goal('9', "45'+2'", { ownGoal: true }), goal('9', "88'")]), 'epl');
  assert.deepEqual([g.awayInnings, g.homeInnings, g.goalOrder], [[1, 0], [1, 1], ['away', 'home', 'home']]);
  // Goals that don't add up: no halves (unsettled, never wrong).
  assert.equal(soccerGoals({ details: [goal('7', "12'")] }, { team: { id: '7' }, score: '1' }, { team: { id: '9' }, score: '2' }), null);
  // Extra time: the score on 90 minutes, its goal out of the order.
  const aet = comp([goal('7', "12'"), goal('9', "70'"), goal('9', "104'")]);
  aet.events[0].competitions[0].status.type.name = 'STATUS_FINAL_AET';
  const [e] = parseEspnResults(aet, 'epl');
  assert.deepEqual([e.awayScore, e.homeScore, e.goalOrder], [1, 1, ['away', 'home']]);
  const [b] = parseEspnResults(comp([], { home: { hits: 9, linescores: [{ value: 2 }] }, away: { hits: 6, linescores: [{ value: 1 }] } }), 'mlb');
  assert.deepEqual([b.awayHits, b.homeHits], [6, 9]);
  assert.deepEqual(runOrder([{ scoringPlay: true, awayScore: 0, homeScore: 3 }]), ['home', 'home', 'home']);
});

test('下一球 (the 2nd and 3rd goals) and 半場單雙', () => {
  const m = goalMarkets(fitGoals(0.5, 0.25), { family: 'soccer' });
  const next = m.filter(x => x.kind === 'nextgoal');
  assert.deepEqual(next.map(x => x.line), [2, 3]);
  for (const x of next) assert.ok(Math.abs(sum(x.picks) - 1) < 1e-6);
  // Fewer goals than the third more often than fewer than the second.
  assert.ok(next[1].picks.find(p => p.side === 'none').fair > next[0].picks.find(p => p.side === 'none').fair);
  assert.ok(m.some(x => x.kind === 'hoddeven'));
  const s = game(1, 2, { awayInnings: [1, 0], homeInnings: [0, 2], goalOrder: ['away', 'home', 'home'] });
  assert.equal(legResult({ sport: 'epl', kind: 'nextgoal', line: 2, side: 'home' }, s), 'won');
  assert.equal(legResult({ sport: 'epl', kind: 'nextgoal', line: 4, side: 'none' }, s), 'won');
  assert.equal(legResult({ sport: 'epl', kind: 'hoddeven', side: 'odd' }, s), 'won');
  assert.equal(legResult({ sport: 'nfl', kind: 'hoddeven', side: 'even' }, game(20, 24, { awayInnings: [7, 3, 7, 3], homeInnings: [7, 7, 3, 7] })), 'won');
  const nfl = pointsModel('nfl', { homeWin: 0.6, spread: { awayLine: 3.5, awayFair: 0.5 }, total: { line: 45.5, overFair: 0.5 } });
  assert.ok(pointsMarkets(nfl, { spreadLine: 3.5, totalLine: 45.5 }).some(x => x.kind === 'hoddeven'));
});
