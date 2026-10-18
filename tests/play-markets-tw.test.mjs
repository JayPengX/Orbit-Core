// Play's markets as 台灣運彩 sells them (the round 6 realism audit): what's
// on sale, how each new market is priced, and how each settles.
import test from 'node:test';
import assert from 'node:assert/strict';
import { legResult, touchdowns } from '../kit/settle.mjs';
import { pointsModel, pointsMarkets, BASKETBALL_BANDS, fitHockey, goalMarkets, baseballMarkets } from '../kit/play-markets.mjs';
import { parseOffers } from '../kit/play-offers.mjs';
import { gameOptions } from '../kit/play-board.mjs';
import { houseRule, withRules } from '../kit/play-rules.mjs';

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

test("hockey sells 正確進球數, not 雙方進球 or goal bands; soccer no draw no bet; picks bought on them still settle", () => {
  const means = fitHockey(0.55, { line: 6.5, overFair: 0.5 });
  const hockey = goalMarkets(means, { family: 'hockey', totalLine: 6.5 });
  const kinds = new Set(hockey.map(m => m.kind));
  for (const k of ['btts', 'goalbands']) assert.ok(!kinds.has(k), k);
  const count = hockey.find(m => m.kind === 'goalcount');
  assert.deepEqual(count.picks.map(p => p.side), ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']);
  assert.ok(Math.abs(sum(count.picks) - 1) < 1e-6);
  // 60 minutes: 2-2 then an overtime goal is 4.
  const ot = game(3, 2, { awayInnings: [1, 0, 1, 1], homeInnings: [0, 1, 1, 0] });
  assert.equal(legResult({ sport: 'nhl', kind: 'goalcount', lo: 4, hi: 4 }, ot), 'won');
  assert.equal(legResult({ sport: 'nhl', kind: 'goalcount', lo: 5, hi: 5 }, ot), 'lost');
  assert.equal(legResult({ sport: 'nhl', kind: 'btts', side: 'yes' }, ot), 'won', 'an old 雙方進球 pick settles');
  // Kambi's hockey 雙方進球 and soccer draw no bet aren't read.
  const yn = { criterion: { englishLabel: 'Both Teams To Score - Regular Time' }, betOfferType: { englishName: 'Yes/No' }, outcomes: [{ type: 'OT_YES', odds: 1500 }, { type: 'OT_NO', odds: 2400 }] };
  assert.equal(parseOffers({ events: [{ homeName: 'Boston Bruins', awayName: 'Detroit Red Wings' }], betOffers: [yn] }, { sport: 'nhl', home: { en: 'Boston Bruins' }, away: { en: 'Detroit Red Wings' } }).markets.length, 0);
  const dnb = { criterion: { englishLabel: 'Draw No Bet' }, betOfferType: { englishName: 'Match' }, outcomes: [{ type: 'OT_ONE', odds: 1400 }, { type: 'OT_TWO', odds: 2800 }] };
  assert.equal(parseOffers({ events: [{ homeName: 'Arsenal', awayName: 'Leeds United' }], betOffers: [dnb] }, { sport: 'epl', home: { en: 'Arsenal' }, away: { en: 'Leeds United' } }).markets.length, 0);
  const epl = gameOptions({ id: 'g', sport: 'epl', startUtc: '2026-10-20T11:30:00Z', home: { en: 'Arsenal' }, away: { en: 'Leeds United' }, draftKings: { home: 0.6, draw: 0.25, away: 0.15 }, total: { line: 2.5, overFair: 0.5 } });
  assert.ok(epl.length > 20 && !epl.some(o => o.kind === 'dnb'));
  assert.ok(epl.some(o => o.kind === 'dc'), '雙勝 stays');
  assert.equal(legResult({ sport: 'epl', kind: 'dnb', side: 'home' }, game(1, 1)), 'void', 'an old draw-no-bet pick settles');
});

test('baseball: 單局大小 and 單局不讓分 on the first inning in place of 首局得分, and [1-5局]讓分; how each settles', () => {
  const markets = baseballMarkets({ homeWin: 0.6, total: { line: 8.5, overFair: 0.5 } });
  assert.ok(!markets.some(m => m.kind === 'firstinning'));
  const it = markets.find(m => m.market === 'itot|1|0.5');
  const ml = markets.find(m => m.market === 'iml|1');
  assert.ok(it && ml && it.period === 1 && ml.period === 1);
  assert.ok(it.picks[0].fair > 0.35 && it.picks[0].fair < 0.65, 'a run in the first about half the time');
  assert.ok(Math.abs(sum(ml.picks) - 1) < 1e-9);
  assert.ok(Math.abs(ml.picks.find(p => p.side === 'draw').fair - it.picks[1].fair) < it.picks[0].fair, 'a scoreless first is a 和');
  const f5 = markets.filter(m => m.kind === 'f5runline');
  assert.deepEqual(f5.map(m => m.awayLine), [0.5, 1.5], 'the home favourite gives the runs');
  assert.equal(f5[0].giver, 'home');
  // The board keeps the inning and the pick's line for settling.
  const opts = gameOptions({ id: 'b', sport: 'mlb', startUtc: '2026-10-20T23:00:00Z', home: { en: 'A' }, away: { en: 'B' }, draftKings: { home: 0.6, away: 0.4 }, total: { line: 8.5, overFair: 0.5 } });
  const o = opts.find(x => x.kind === 'f5runline' && x.side === 'home');
  assert.equal(o.settle.line, -o.awayLine);
  assert.equal(opts.find(x => x.kind === 'inningml').settle.period, 1);
  // Settled from the inning's runs.
  const g = game(4, 5, { awayInnings: [1, 0, 0, 2, 0, 1, 0, 0, 0], homeInnings: [1, 0, 2, 0, 1, 0, 0, 1, 0] });
  assert.equal(legResult({ kind: 'inningtotal', period: 1, side: 'over', line: 1.5 }, g), 'won');
  assert.equal(legResult({ kind: 'inningml', period: 1, side: 'draw' }, g), 'won');
  assert.equal(legResult({ kind: 'inningml', period: 1, side: 'home' }, g), 'lost');
  assert.equal(legResult({ kind: 'inningml', period: 1, side: 'home' }, game(4, 3)), null, 'innings unread: not decided');
  assert.equal(legResult({ kind: 'f5runline', side: 'home', line: -0.5 }, g), 'won', '3-4 after five');
  assert.equal(legResult({ kind: 'f5runline', side: 'home', line: -1.5 }, g), 'lost');
  assert.equal(legResult({ kind: 'f5runline', side: 'home', line: -1 }, g), 'void');
  assert.equal(legResult({ kind: 'f5runline', side: 'home', line: -0.5 }, game(1, 0, { awayInnings: [1, 0, 0, 0], homeInnings: [0, 0, 0, 0] })), 'void', 'called before five');
  assert.equal(legResult({ kind: 'firstinning', side: 'yes' }, g), 'won', 'an old 首局得分 pick settles');
  // Kambi's first-inning total is read as 單局大小.
  const ou = { criterion: { englishLabel: 'Total Runs - Inning 1' }, betOfferType: { englishName: 'Over/Under' }, outcomes: [{ type: 'OT_OVER', line: 500, odds: 2000 }, { type: 'OT_UNDER', line: 500, odds: 1800 }] };
  const [k] = parseOffers({ events: [{ homeName: 'A', awayName: 'B' }], betOffers: [ou] }, { sport: 'mlb', home: { en: 'A' }, away: { en: 'B' } }).markets;
  assert.equal(k.kind, 'inningtotal');
  assert.equal(k.market, 'itot|1|0.5');
});

test("限2關 / 限3關: a game's or market's own minimum (運彩 §21) wins over the price bands; the bands only when none is known", () => {
  assert.deepEqual(houseRule('ml', 1.05), { lock: null, minLegs: 3 }, 'no event minimum: the price bands, as before');
  assert.deepEqual(houseRule('ml', 1.05, { event: 1 }), { lock: null, minLegs: 1 }, 'a game sold single');
  assert.deepEqual(houseRule('ml', 2.4, { event: 2 }), { lock: null, minLegs: 2 }, 'a game 限2關 at any price');
  assert.deepEqual(houseRule('ml', 1.02, { event: 1 }), { lock: 'low', minLegs: 1 }, 'still locked when all but certain');
  const g = { id: 'g', sport: 'epl', startUtc: '2026-10-20T11:30:00Z', home: { en: 'Arsenal' }, away: { en: 'Leeds United' }, draftKings: { home: 0.6, draw: 0.25, away: 0.15 }, total: { line: 2.5, overFair: 0.5 } };
  const plain = gameOptions(g);
  const ruled = gameOptions({ ...g, minLegs: 3 });
  assert.ok(plain.some(o => !o.lock && o.minLegs === 1));
  assert.ok(ruled.filter(o => !o.lock).every(o => o.minLegs === 3), "the game's 限3關 on every market");
  assert.equal(withRules({ kind: 'ml', estOdds: 1.1, eventMinLegs: 2, m: { minLegs: 3 } }).minLegs, 2, "the pick's own first");
  assert.equal(withRules({ kind: 'score', estOdds: 9, m: { minLegs: 3 }, game: { minLegs: 1 } }).minLegs, 3, "then the market's, then the game's");
});
