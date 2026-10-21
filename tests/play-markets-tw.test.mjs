// Play's markets as 台灣運彩 sells them (the round 6 realism audit): what's
// on sale, how each new market is priced, and how each settles.
import test from 'node:test';
import assert from 'node:assert/strict';
import { legResult, touchdowns, kambiSets, decidedSetMatch, decidedTeamGame, parseKambiLiveData } from '../kit/settle.mjs';
import { pointsModel, pointsMarkets, BASKETBALL_BANDS, fitHockey, goalMarkets, baseballMarkets } from '../kit/play-markets.mjs';
import { parseOffers } from '../kit/play-offers.mjs';
import { gameOptions } from '../kit/play-board.mjs';
import { houseRule, withRules, estimatedMinLegs } from '../kit/play-rules.mjs';

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

test("限2關 / 限3關: a game's or market's own minimum (運彩 §21), and 2 for a price under 1.25 (the tax)", () => {
  assert.deepEqual(houseRule('ml', 1.5), { lock: null, minLegs: 1 }, 'none known: a single');
  assert.deepEqual(houseRule('ml', 1.2), { lock: null, minLegs: 2 }, 'under 1.25: 限2關');
  assert.equal(houseRule('ml', 1.05).lock, 'low', 'under 1.12: locked');
  assert.deepEqual(houseRule('ml', 2.4, { event: 2 }), { lock: null, minLegs: 2 }, 'a game 限2關 at any price');
  assert.deepEqual(houseRule('ml', 1.15, { event: 3 }), { lock: null, minLegs: 3 });
  const g = { id: 'g', sport: 'epl', startUtc: '2026-10-20T11:30:00Z', home: { en: 'Arsenal' }, away: { en: 'Leeds United' }, draftKings: { home: 0.6, draw: 0.25, away: 0.15 }, total: { line: 2.5, overFair: 0.5 } };
  const plain = gameOptions(g);
  const ruled = gameOptions({ ...g, minLegs: 3 });
  assert.ok(plain.some(o => !o.lock && o.minLegs === 1));
  assert.ok(ruled.filter(o => !o.lock).every(o => o.minLegs === 3), "the game's 限3關 on every market");
  assert.equal(withRules({ kind: 'ml', estOdds: 1.1, eventMinLegs: 2, m: { minLegs: 3 } }).minLegs, 2, "the pick's own first");
  assert.equal(withRules({ kind: 'score', estOdds: 9, m: { minLegs: 3 }, game: { minLegs: 1 } }).minLegs, 3, "then the market's, then the game's");
  // None known: 運彩's usual pattern, an estimate: 限2關 until the game's day (Taipei), then singles.
  const now = Date.parse('2026-10-19T23:20:00Z'); // 07:20 on the 20th in Taipei
  assert.equal(estimatedMinLegs({ kind: 'ml', start: '2026-10-20T00:08:00Z' }, now), null, "today's game: a single");
  assert.equal(estimatedMinLegs({ kind: 'ml', start: '2026-10-20T15:59:00Z' }, now), null, 'still today in Taipei');
  assert.equal(estimatedMinLegs({ kind: 'total', start: '2026-10-20T19:00:00Z' }, now), 2, "tomorrow's game: 限2關");
  assert.equal(estimatedMinLegs({ kind: 'future', start: '2026-11-01T00:00:00Z' }, now), null, 'championships: singles');
  assert.equal(estimatedMinLegs({ id: 'live|x|ml|home', kind: 'ml', start: '2026-10-21T00:00:00Z' }, now), null, 'in play: singles');
  const later = withRules({ kind: 'ml', estOdds: 1.8, start: new Date(Date.now() + 3 * 86_400_000).toISOString() });
  assert.deepEqual([later.minLegs, later.minLegsEst], [2, true], 'marked as estimated');
  assert.equal(withRules({ kind: 'ml', estOdds: 1.8, start: new Date(Date.now() + 3 * 86_400_000).toISOString(), game: { minLegs: 1 } }).minLegs, 1, "the game's own wins over the estimate");
});

test('set sports (tennis, volleyball, badminton, table tennis, esports): Kambi\'s read, each settled from the sets', () => {
  // Kambi's live data: each set's games, -1 for one not played; best of the entries.
  const live = { sets: { home: [6, 6, 5, -1, -1], away: [3, 7, 7, -1, -1] } };
  assert.deepEqual(kambiSets(live), { home: [6, 6, 5], away: [3, 7, 7], bestOf: 5 });
  assert.equal(decidedSetMatch(live, 'tennis'), null, '1-2 in a best of five: not over');
  const done = decidedSetMatch({ sets: { home: [6, 6, 5], away: [3, 7, 7] } }, 'tennis');
  assert.deepEqual([done.homeScore, done.awayScore], [1, 2]);
  assert.equal(decidedSetMatch({ sets: { home: [6, 6, 5], away: [3, 7, 4] } }, 'tennis'), null, 'third set under way');
  assert.equal(decidedSetMatch({ sets: { home: [25, 23, 15, -1, -1], away: [20, 25, 13, -1, -1] } }, 'volleyball'), null, 'a third set at 15 is not over in volleyball');
  assert.equal(decidedSetMatch({ sets: { home: [25, 23, 25, 20, 15], away: [20, 25, 13, 25, 13] } }, 'volleyball').homeScore, 3, 'the fifth to 15');
  assert.equal(decidedSetMatch({ sets: { home: [11, 13, -1], away: [5, 11, -1] } }, 'tabletennis').homeScore, 2, '13-11: a two-point lead past 11');
  const kambi = parseKambiLiveData({ liveData: { score: { home: '0', away: '0', version: 1 }, statistics: { sets: { home: [6, 6, -1], away: [3, 7, -1] } } } });
  assert.equal(decidedTeamGame(kambi, 'tennis', '2026-10-18T00:00:00Z'), null, '1-1: a third set to come');
  kambi.sets = { home: [6, 6, 6], away: [3, 7, 2] };
  assert.equal(decidedTeamGame(kambi, 'tennis', '2026-10-18T00:00:00Z').homeScore, 2);
  // Settled from the sets: 讓盤 on sets won, 大小 and 讓局 on games, 正確比數, the first set.
  const g = { status: 'final', ...done };
  assert.equal(legResult({ sport: 'tennis', kind: 'ml', side: 'away' }, g), 'won');
  assert.equal(legResult({ sport: 'tennis', kind: 'sethcap', side: 'home', line: 1.5 }, g), 'won');
  assert.equal(legResult({ sport: 'tennis', kind: 'setscore', score: '1-2' }, g), 'won');
  assert.equal(legResult({ sport: 'tennis', kind: 'gametotal', side: 'over', line: 33.5 }, g), 'won', '34 games');
  assert.equal(legResult({ sport: 'tennis', kind: 'gamehcap', side: 'away', line: 0.5 }, g), 'won', '17-17 in games');
  assert.equal(legResult({ sport: 'tennis', kind: 'set1', side: 'home' }, g), 'won');
  // Kambi's labels for them.
  const k = (label, type, outcomes) => ({ criterion: { englishLabel: label }, betOfferType: { englishName: type }, outcomes });
  const page = { events: [{ homeName: 'A Player', awayName: 'B Player' }], betOffers: [
    k('Total Games', 'Over/Under', [{ type: 'OT_OVER', line: 22500, odds: 1900 }, { type: 'OT_UNDER', line: 22500, odds: 1900 }]),
    k('Game Handicap', 'Handicap', [{ type: 'OT_ONE', line: -3500, odds: 1900 }, { type: 'OT_TWO', line: 3500, odds: 1900 }]),
    k('Set Betting', 'Correct Score', [{ label: '2-0', odds: 2500 }, { label: '2-1', odds: 4000 }, { label: '1-2', odds: 5000 }, { label: '0-2', odds: 4500 }]),
    k('Set 1', 'Match', [{ type: 'OT_ONE', odds: 1600 }, { type: 'OT_TWO', odds: 2300 }])
  ] };
  const { markets } = parseOffers(page, { sport: 'tennis', home: { en: 'A Player' }, away: { en: 'B Player' } });
  assert.deepEqual(markets.map(m => m.market).sort(), ['gh|3.5', 'gt|22.5', 'set1', 'setscore']);
});

test("soccer's 讓分 is 運彩's three ways on whole goals (主-1 / 讓分和 / 客+1), no half-goal two-way line; how it settles", () => {
  const g = { id: 's', sport: 'epl', startUtc: '2026-10-20T11:30:00Z', home: { en: 'Arsenal' }, away: { en: 'Leeds United' }, draftKings: { home: 0.6, draw: 0.24, away: 0.16 }, total: { line: 2.5, overFair: 0.55 } };
  const opts = gameOptions(g);
  assert.ok(!opts.some(o => o.kind === 'runline'), 'no Asian handicap');
  const h3 = opts.filter(o => o.kind === 'hcap3');
  const markets = [...new Set(h3.map(o => o.market))];
  assert.deepEqual(markets, ['h3|1', 'h3|2'], 'the home favourite 讓1分 and 讓2分');
  for (const market of markets) {
    const picks = h3.filter(o => o.market === market);
    assert.deepEqual(picks.map(o => o.side), ['home', 'draw', 'away']);
    assert.ok(Math.abs(picks.reduce((s, o) => s + o.fairChance, 0) - 1) < 1e-9);
    // Priced at the three-way cut, as 不讓分 is.
    const book = picks.reduce((s, o) => s + 1 / o.estOdds, 0);
    assert.ok(Math.abs(book - 1.2) < 0.02, `${market} adds up to ${book}`);
    assert.ok(picks.every(o => o.settle.line === picks[0].awayLine));
  }
  assert.equal(h3.filter(o => o.posted).map(o => o.market)[0], 'h3|1');
  // The home favourite gives one: 2-0 is home's, 1-0 讓分和, 1-1 away's; never a refund.
  const leg = side => ({ sport: 'epl', kind: 'hcap3', side, line: 1 });
  assert.equal(legResult(leg('home'), game(0, 2)), 'won');
  assert.equal(legResult(leg('home'), game(0, 1)), 'lost');
  assert.equal(legResult(leg('draw'), game(0, 1)), 'won');
  assert.equal(legResult(leg('away'), game(1, 1)), 'won');
  assert.equal(legResult(leg('draw'), game(1, 1)), 'lost');
  // An away favourite gives the goals: line −1 from its side.
  const away = gameOptions({ ...g, draftKings: { home: 0.15, draw: 0.23, away: 0.62 } }).filter(o => o.kind === 'hcap3' && o.posted);
  assert.equal(away[0].awayLine, -1);
  assert.equal(legResult({ sport: 'epl', kind: 'hcap3', side: 'away', line: -1 }, game(3, 1)), 'won');
  // Kambi's Asian handicap isn't read for soccer.
  const ah = { criterion: { englishLabel: 'Asian Handicap' }, betOfferType: { englishName: 'Asian Handicap' }, outcomes: [{ type: 'OT_UNTYPED', odds: 1900, line: -1500, participant: 'Arsenal' }, { type: 'OT_UNTYPED', odds: 1900, line: 1500, participant: 'Leeds United' }] };
  assert.equal(parseOffers({ events: [{ homeName: 'Arsenal', awayName: 'Leeds United' }], betOffers: [ah] }, g).markets.length, 0);
});

test('every football and basketball total sits on a half point, as 運彩 posts them (no push)', () => {
  for (const [league, line, spread] of [['nfl', 44.5, 3.5], ['nba', 228.5, 6.5], ['wnba', 165.5, 4.5]]) {
    const m = pointsModel(league, { homeWin: 0.6, spread: { awayLine: spread, awayFair: 0.5 }, total: { line, overFair: 0.5 } });
    const totals = pointsMarkets(m, { spreadLine: spread, totalLine: line }).filter(x => x.kind === 'total');
    assert.ok(totals.length >= 3, league);
    for (const t of totals) assert.equal(Math.abs(t.line % 1), 0.5, `${league} ${t.line}`);
  }
});

test('運彩 two-way cut by sport (its boards, 2026-10-20): basketball and soccer about 1.17, baseball 1.158; basketball 讓分 a point apart', async () => {
  const { houseCut, BASE_CUT } = await import('../kit/play-rules.mjs');
  assert.equal(houseCut({ base: 'twoWay', sport: 'nba' }), 1.168);
  assert.equal(houseCut({ base: 'twoWay', sport: 'epl' }), 1.17);
  assert.equal(houseCut({ base: BASE_CUT.twoWay, sport: 'mlb' }), 1.158);
  assert.equal(houseCut({ base: 'threeWay', sport: 'epl' }), 1.2);
  assert.equal(houseCut({ base: 'live', sport: 'nba' }), BASE_CUT.live);
  const nba = pointsModel('nba', { homeWin: 0.55, spread: { awayLine: 2.5, awayFair: 0.5 }, total: { line: 221.5, overFair: 0.5 } });
  const lines = pointsMarkets(nba, { spreadLine: 2.5, totalLine: 221.5 }).filter(m => m.kind === 'runline').map(m => m.awayLine);
  assert.deepEqual(lines, [0.5, 1.5, 2.5, 3.5, 4.5].filter(l => lines.includes(l)));
  assert.ok(lines.includes(1.5) && lines.includes(3.5));
  const nfl = pointsModel('nfl', { homeWin: 0.6, spread: { awayLine: 3.5, awayFair: 0.5 }, total: { line: 45.5, overFair: 0.5 } });
  assert.deepEqual(pointsMarkets(nfl, { spreadLine: 3.5, totalLine: 45.5 }).filter(m => m.kind === 'runline').map(m => m.awayLine), [-2.5, 0.5, 3.5, 6.5, 9.5]);
});

test('a pennant and the World Series (one sport\'s championships) never go in one parlay', async () => {
  const { futureBets } = await import('../kit/play-bets.mjs');
  const { slipErrors } = await import('../kit/play-odds.mjs');
  const teams = [{ name: { en: 'Brewers' }, fair: 0.4 }, { name: { en: 'Rays' }, fair: 0.3 }, { name: { en: 'Guardians' }, fair: 0.3 }];
  const bets = futureBets([{ key: 'mlb_ws', sport: 'mlb', teams }, { key: 'mlb_nl', sport: 'mlb', teams }, { key: 'nba_west', sport: 'nba', teams }]);
  const pick = (m, t) => ({ ...bets.find(b => b.market === m && b.teamEn === t), odds: 2 });
  assert.deepEqual(slipErrors({ mode: 'parlay', legs: [pick('mlb_ws', 'Brewers'), pick('mlb_nl', 'Brewers')], sizes: [2], stake: 100 }), ['sameGame']);
  assert.deepEqual(slipErrors({ mode: 'parlay', legs: [pick('mlb_ws', 'Brewers'), pick('nba_west', 'Rays')], sizes: [2], stake: 100 }), []);
});

test('corners settle on 90 minutes: a match that went to extra time is void', () => {
  const leg = { sport: 'epl', kind: 'corners', side: 'over', line: 9.5 };
  assert.equal(legResult(leg, game(1, 1, { corners: 'void' })), 'void');
  assert.equal(legResult(leg, game(1, 1, { corners: { home: 6, away: 5 } })), 'won');
});
