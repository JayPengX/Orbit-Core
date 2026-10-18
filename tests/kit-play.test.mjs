// Play's money in the kit: each pick settled from its result (settle.mjs),
// a slip paid once (applyResults, settleSlip), its odds math (play-odds.mjs),
// cash out (play-cashout.mjs), the lottery and scratch cards.
import test from 'node:test';
import assert from 'node:assert/strict';
import { legResult, applyResults, topInning, runOrder, espnDates, sameSide, sideScore, sideOfGame, sidesMatch, parseOpenF1Flags, parseFutureResult, futureTeamName, asiaResult, teamCorners } from '../kit/settle.mjs';
import { settleSlip, evaluateSlip, slipPayoutTable, slipOutlook, analyzeSlip, afterTax, prizeAfterTax, SLIP_RULES, combosBySize, comboCount, slipErrors, slipSizes, choose, maskChance, exclusiveMasks, estimateLineOdds, estimateFuturesOdds, estimateF1Odds, devigPower, devigTwoWay, devigProportional, americanToProbability, boostRate, seededRandom, quantile, median } from '../kit/play-odds.mjs';
import { cashOutState, CASHOUT_KEEP, CASHOUT_MAX_OPEN } from '../kit/play-cashout.mjs';
import { houseRule, shadeLong, minLegsProblem, HOUSE_RULES, LONG_FROM } from '../kit/play-rules.mjs';
import { GAMES, ticketPrize, settleTicket, buyTicket, nextDraw, checkSelection, betCount, boxWays, expectedReturn, mergeTickets, addTickets, HOUSE_SLOT, BINGO_DRAWS } from '../kit/play-lottery.mjs';
import { CARD_ORDER, face, facePays, tiersOf, drawPrize, buyScratch, revealScratch, expectedReturn as scratchReturn } from '../kit/play-scratch.mjs';
import { propResult } from '../kit/play-props.mjs';
import { parseOffers } from '../kit/play-offers.mjs';
import { attachKambi, pricedByKambi } from '../kit/play-sources.mjs';

const game = (awayScore, homeScore, extra = {}) => ({ status: 'final', awayScore, homeScore, ...extra });

// ---- One pick from its result -------------------------------------------------

test('a game pick from the final score: winners, lines with a push, part-game markets', () => {
  const r = (leg, o) => legResult(leg, o);
  assert.equal(r({ kind: 'ml', side: 'away' }, game(3, 2)), 'won');
  assert.equal(r({ kind: 'ml', side: 'home' }, game(3, 2)), 'lost');
  assert.equal(r({ kind: 'ml', side: 'draw' }, game(1, 1)), 'won');
  // A two-way winner on a tie (NPB, KBO, CPBL level after 12, an NFL tie): void,
  // not lost; soccer's three-way winner on a draw is lost.
  for (const sport of ['npb', 'kbo', 'cpbl', 'mlb', 'nfl', 'nba']) {
    assert.equal(r({ kind: 'ml', side: 'home', sport }, game(2, 2)), 'void', sport);
    assert.equal(r({ kind: 'ml', side: 'away', sport }, game(2, 2)), 'void', sport);
  }
  assert.equal(r({ kind: 'ml', side: 'home', sport: 'npb' }, game(2, 3)), 'won');
  assert.equal(r({ kind: 'ml', side: 'home', sport: 'epl' }, game(1, 1)), 'lost');
  assert.equal(r({ kind: 'ml', side: 'draw', sport: 'epl' }, game(1, 1)), 'won');
  assert.equal(r({ kind: 'total', side: 'over', line: 5.5 }, game(3, 2)), 'lost');
  assert.equal(r({ kind: 'total', side: 'under', line: 5.5 }, game(3, 2)), 'won');
  assert.equal(r({ kind: 'total', side: 'over', line: 5 }, game(3, 2)), 'void', 'a whole line landed on: the stake back');
  assert.equal(r({ kind: 'runline', side: 'away', line: 1.5 }, game(2, 3)), 'won');
  assert.equal(r({ kind: 'runline', side: 'home', line: -1.5 }, game(2, 3)), 'lost');
  assert.equal(r({ kind: 'runline', side: 'home', line: -1 }, game(2, 3)), 'void');
  assert.equal(r({ kind: 'teamtotal', team: 'home', side: 'over', line: 2.5 }, game(2, 3)), 'won');
  assert.equal(r({ kind: 'oddeven', side: 'odd' }, game(2, 3)), 'won');
  assert.equal(r({ kind: 'btts', side: 'yes' }, game(0, 3)), 'lost');
  assert.equal(r({ kind: 'btts', side: 'no' }, game(0, 3)), 'won');
  assert.equal(r({ kind: 'margin', team: 'home', lo: 1, hi: 2 }, game(2, 4)), 'won');
  assert.equal(r({ kind: 'margin', team: 'home', lo: 3, hi: null }, game(2, 4)), 'lost');
  assert.equal(r({ kind: 'margin', team: 'away', lo: 1, hi: 1 }, game(2, 4)), 'lost');
  // Correct score, written home-away; 'other' any score not listed.
  assert.equal(r({ kind: 'score', score: '2-1' }, game(1, 2)), 'won');
  assert.equal(r({ kind: 'score', score: '1-2' }, game(1, 2)), 'lost');
  assert.equal(r({ kind: 'score', score: 'other', listed: ['1-0', '2-1'] }, game(3, 3)), 'won');
  assert.equal(r({ kind: 'score', score: 'other', listed: ['3-3'] }, game(3, 3)), 'lost');
  assert.equal(r({ kind: 'dc', side: 'home|draw' }, game(1, 1)), 'won');
  assert.equal(r({ kind: 'dc', side: 'home|draw' }, game(2, 1)), 'lost');
  assert.equal(r({ kind: 'dnb', side: 'home' }, game(1, 1)), 'void');
  assert.equal(r({ kind: 'dnb', side: 'home' }, game(0, 1)), 'won');
  assert.equal(r({ kind: 'goalbands', lo: 2, hi: 3 }, game(1, 2)), 'won');
  assert.equal(r({ kind: 'goalbands', lo: 4, hi: null }, game(1, 2)), 'lost');
  // Soccer's half-time / full-time and first half are one period; basketball's first half two quarters.
  const soccer = game(1, 1, { awayInnings: [0, 1], homeInnings: [1, 0] });
  assert.equal(r({ kind: 'htft', ht: 'home', ft: 'draw' }, soccer), 'won');
  assert.equal(r({ kind: 'htft', ht: 'draw', ft: 'draw' }, soccer), 'lost');
  assert.equal(r({ kind: 'half', side: 'home', sport: 'epl' }, soccer), 'won');
  assert.equal(r({ kind: 'htotal', side: 'over', line: 0.5, sport: 'epl' }, soccer), 'won');
  const hoops = game(100, 98, { awayInnings: [20, 30, 25, 25], homeInnings: [30, 25, 20, 23] });
  assert.equal(r({ kind: 'half', side: 'home', sport: 'nba' }, hoops), 'won', '55-50 at the half');
  assert.equal(r({ kind: 'q1', side: 'home', sport: 'nba' }, hoops), 'won');
  assert.equal(r({ kind: 'htotal', side: 'under', line: 105, sport: 'nba' }, hoops), 'void', '105 exactly');
  // Hockey's regulation: three periods (overtime's goal left out).
  assert.equal(r({ kind: 'regulation', side: 'draw' }, game(3, 2, { awayInnings: [1, 0, 1, 1], homeInnings: [0, 1, 1, 0] })), 'won');
  // Baseball's first five innings; a game called before five: the stake back.
  const nine = game(4, 2, { awayInnings: [0, 0, 0, 0, 1, 3, 0, 0, 0], homeInnings: [1, 0, 0, 1, 0, 0, 0, 0] });
  assert.equal(r({ kind: 'f5', side: 'home' }, nine), 'won', '2-1 after five');
  assert.equal(r({ kind: 'f5total', side: 'over', line: 2.5 }, nine), 'won');
  assert.equal(r({ kind: 'f5total', side: 'over', line: 2.5 }, game(1, 0, { awayInnings: [1, 0, 0, 0], homeInnings: [0, 0, 0, 0] })), 'void');
  assert.equal(r({ kind: 'firstinning', side: 'yes' }, nine), 'won');
  assert.equal(r({ kind: 'firstinning', side: 'no' }, nine), 'lost');
  assert.equal(r({ kind: 'firstinning', side: 'yes' }, game(1, 0)), null, 'no innings read: not decided');
  assert.equal(r({ kind: 'inning', inning: 5 }, nine), 'won', 'the sixth (index 5) scored the most');
  assert.equal(topInning([1, 0, 0], [0, 1, 0]), 9, 'a tie for the most');
  assert.equal(r({ kind: 'nextrun', line: 1, side: 'home' }, game(2, 1, { runOrder: ['home', 'away', 'away'] })), 'won');
  assert.equal(r({ kind: 'nextrun', line: 4, side: 'none' }, game(2, 1, { runOrder: ['home', 'away', 'away'] })), 'won', 'the game ended first');
  assert.equal(r({ kind: 'corners', side: 'over', line: 9.5 }, game(1, 1, { corners: { home: 6, away: 4 } })), 'won');
  assert.equal(r({ kind: 'corners', side: 'over', line: 9.5 }, game(1, 1)), null);
});

test('a pick is undecided until its game is final; a game called off is the stake back; garbage is never a result', () => {
  assert.equal(legResult({ kind: 'ml', side: 'home' }, { status: 'pending', awayScore: 0, homeScore: 9 }), null);
  assert.equal(legResult({ kind: 'ml', side: 'home' }, { status: 'void' }), 'void');
  assert.equal(legResult({ kind: 'ml', side: 'home' }, null), null);
  assert.equal(legResult({ kind: 'ml', side: 'home' }, { status: 'final', awayScore: 'x', homeScore: 1 }), null);
  assert.equal(legResult({ kind: 'ml', side: 'home' }, { status: 'final' }), null);
  assert.equal(legResult({ kind: 'nonsense' }, game(1, 2)), null);
});

test('F1 and championship picks: names matched without accents or case, positions, head to heads, flags', () => {
  const order = ['Max Verstappen', 'Lando Norris', 'Charles Leclerc', 'Oscar Piastri', 'Lewis Hamilton', 'George Russell', 'Kimi Antonelli', 'Fernando Alonso', 'Carlos Sainz', 'Nico Hülkenberg', 'Pierre Gasly'];
  const race = { status: 'final', winner: 'Max Verstappen', podium: order.slice(0, 3), order, flags: { sc: true, vsc: false, red: false } };
  assert.equal(legResult({ kind: 'f1', driver: 'max verstappen' }, race), 'won');
  assert.equal(legResult({ kind: 'f1podium', driver: 'Charles Leclerc' }, race), 'won');
  assert.equal(legResult({ kind: 'f1podium', driver: 'Oscar Piastri' }, race), 'lost');
  assert.equal(legResult({ kind: 'f1top6', driver: 'George Russell' }, race), 'won');
  assert.equal(legResult({ kind: 'f1top6', driver: 'Kimi Antonelli' }, race), 'lost');
  assert.equal(legResult({ kind: 'f1top10', driver: 'Nico Hulkenberg' }, race), 'won', 'Hülkenberg without the umlaut');
  assert.equal(legResult({ kind: 'f1top10', driver: 'Nobody Here' }, race), 'lost', 'not classified');
  assert.equal(legResult({ kind: 'f1h2h', driver: 'Lando Norris', rival: 'Oscar Piastri' }, race), 'won');
  assert.equal(legResult({ kind: 'f1h2h', driver: 'Lando Norris', id: 'f1h2h|Lando Norris|Max Verstappen' }, race), 'lost', 'the rival from the id');
  assert.equal(legResult({ kind: 'f1h2h', driver: 'A', rival: 'B' }, race), 'void', 'neither classified: the stake back');
  assert.equal(legResult({ kind: 'f1sc', pick: 'yes' }, race), 'won');
  assert.equal(legResult({ kind: 'f1vsc', pick: 'yes' }, race), 'lost');
  assert.equal(legResult({ kind: 'f1red', pick: 'no' }, race), 'won');
  assert.equal(legResult({ kind: 'f1sc', pick: 'yes' }, { status: 'final', winner: 'X' }), null, 'no flags read');
  assert.equal(legResult({ kind: 'f1podium', driver: 'X' }, { status: 'final', winner: 'X' }), null, 'no podium read');
  assert.equal(legResult({ kind: 'f1pole', driver: 'Lando Norris' }, { status: 'final', pole: 'Lando Norris' }), 'won');
  assert.equal(legResult({ kind: 'future', team: 'Los Angeles Dodgers' }, { status: 'final', winner: 'Los Angeles Dodgers' }), 'won');
  assert.equal(legResult({ kind: 'future', team: 'New York Yankees' }, { status: 'final', winner: 'Los Angeles Dodgers' }), 'lost');
  // A player pick: over and under push on a whole line; one who didn't play is void.
  assert.equal(propResult({ side: 'over', line: 2 }, { status: 'final', value: 2 }), 'void');
  assert.equal(propResult({ side: 'over', line: 1.5 }, { status: 'final', value: 2 }), 'won');
  assert.equal(propResult({ side: 'under', line: 1.5 }, { status: 'final', value: 2 }), 'lost');
  assert.equal(propResult({ side: 'yes', line: 1 }, { status: 'final', value: 1 }), 'won');
  assert.equal(propResult({ stat: 'first' }, { status: 'final', value: 0 }), 'lost');
  assert.equal(propResult({ side: 'over', line: 1 }, { status: 'void' }), 'void');
  assert.equal(legResult({ kind: 'prop', side: 'over', line: 0.5 }, { status: 'final', prop: { status: 'final', value: 1 } }), 'won');
});

test("the sources' results: who scored each run, OpenF1's flags, Polymarket's resolved champion, ESPN's dates", () => {
  assert.deepEqual(runOrder([{ scoringPlay: true, awayScore: 0, homeScore: 2 }, { scoringPlay: false }, { scoringPlay: true, awayScore: 1, homeScore: 2 }, { scoringPlay: true, awayScore: 'x', homeScore: 3 }]), ['home', 'home', 'away']);
  assert.deepEqual(parseOpenF1Flags([]), { status: 'pending' });
  assert.deepEqual(parseOpenF1Flags([{ message: 'SAFETY CAR DEPLOYED' }]), { status: 'pending' }, 'not over yet');
  assert.deepEqual(parseOpenF1Flags([{ message: 'VSC DEPLOYED' }, { flag: 'CHEQUERED', message: '' }]), { status: 'final', flags: { sc: false, vsc: true, red: false } });
  assert.deepEqual(parseOpenF1Flags([{ message: 'Red flag' }, { message: 'chequered flag' }]), { status: 'final', flags: { sc: false, vsc: false, red: true } });
  const markets = [{ groupItemTitle: 'Dodgers', outcomes: '["Yes","No"]', outcomePrices: '["0.995","0.005"]' }, { question: 'Will the Yankees win the World Series?', outcomes: ['Yes', 'No'], outcomePrices: ['0', '1'] }];
  assert.deepEqual(parseFutureResult([{ closed: true, markets }]), { status: 'final', winner: 'Dodgers' });
  assert.deepEqual(parseFutureResult([{ closed: false, markets }]), { status: 'pending' });
  assert.deepEqual(parseFutureResult([{ closed: true, markets: [{ groupItemTitle: 'X', outcomes: 'not json', outcomePrices: '[1]' }] }]), { status: 'pending' }, 'unreadable: never a result');
  assert.equal(futureTeamName({ question: 'Will Lando Norris be the 2026 Drivers Champion?' }), 'Lando Norris');
  // ESPN files a game under the US Eastern date: both sides of daylight saving.
  assert.deepEqual(espnDates('2026-10-18T03:30:00Z'), ['20261017']);
  assert.deepEqual(espnDates('2026-10-18T04:30:00Z'), ['20261018', '20261017']);
  assert.equal(sameSide('Rakuten Monkeys', 'Rakuten'), true);
  assert.equal(sameSide('', 'X'), false);
  assert.deepEqual(asiaResult({ state: 'post', homeScore: '3', awayScore: '1' }), { status: 'final', homeScore: 3, awayScore: 1, awayInnings: [], homeInnings: [] });
  assert.deepEqual(asiaResult({ state: 'post', homeScore: null, awayScore: 1 }), { status: 'pending', state: 'pre' }, 'over without a score: not settled');
  assert.equal(teamCorners({ boxscore: { teams: [{ homeAway: 'home', statistics: [{ name: 'wonCorners', displayValue: '5' }] }] } }), null, "one side's count alone");
});

test("a city's two clubs: which side a name is goes by the surer match, never by a shared city", () => {
  assert.deepEqual([sideScore('Chicago Cubs', 'Chicago Cubs'), sideScore('Inter', 'Inter Milan'), sideScore('Chicago Cubs', 'Chicago White Sox'), sideScore('Cubs', 'Yankees')], [3, 2, 1, 0]);
  assert.equal(sameSide('Chicago Cubs', 'Chicago White Sox'), true, 'alone, a shared word still matches (a source\'s short name)');
  assert.equal(sideOfGame('Chicago White Sox', 'Chicago Cubs', 'Chicago White Sox'), 'away');
  assert.equal(sideOfGame('Chicago', 'Chicago Cubs', 'Chicago White Sox'), null, 'like both alike: not read');
  assert.equal(sidesMatch('Chicago White Sox', 'Chicago Cubs', 'Chicago Cubs', 'Chicago White Sox'), 'flip');
  assert.equal(sidesMatch('Chicago Cubs', 'Chicago White Sox', 'Chicago Cubs', 'Chicago White Sox'), 'same');
  assert.equal(sidesMatch('Man City', 'Manchester United', 'Manchester United', 'Manchester City'), 'flip');
  assert.equal(sidesMatch('Rakuten Monkeys', 'Fubon Guardians', 'Rakuten', 'Fubon'), 'same');
  assert.equal(sidesMatch('Rakuten Monkeys', 'Fubon Guardians', 'Wei Chuan Dragons', 'Fubon'), null);
  // Kambi listing the crosstown game the other way round: its prices turned to ESPN's sides.
  const espn = [{ sport: 'mlb', startUtc: '2026-07-01T23:00:00Z', away: 'Chicago Cubs', home: 'Chicago White Sox' }];
  const kambi = [{ sport: 'mlb', startUtc: '2026-07-01T23:10:00Z', home: { en: 'Chicago Cubs' }, away: { en: 'Chicago White Sox' }, kambiId: 'k1', draftKings: { home: 0.6, away: 0.4 } }];
  const [g] = attachKambi(espn, kambi);
  assert.equal(g.kambi.kambiId, 'k1');
  assert.deepEqual(g.kambi.outcomes, { home: 0.4, away: 0.6 }, "the Cubs' 60% stays the Cubs' (ESPN's away)");
  assert.equal(pricedByKambi(espn[0], kambi), true);
  // A team total named for one of them goes to that one, not to whichever shares the city.
  const event = { events: [{ homeName: 'Chicago Cubs', awayName: 'Chicago White Sox' }], betOffers: [
    { criterion: { englishLabel: 'Total Runs by Chicago White Sox' }, betOfferType: { englishName: 'Over/Under' }, outcomes: [{ type: 'OT_OVER', line: 4500, odds: 1900 }, { type: 'OT_UNDER', line: 4500, odds: 1900 }] },
    { criterion: { englishLabel: 'Total Runs by Chicago Cubs' }, betOfferType: { englishName: 'Over/Under' }, outcomes: [{ type: 'OT_OVER', line: 3500, odds: 1900 }, { type: 'OT_UNDER', line: 3500, odds: 1900 }] }
  ] };
  const { markets } = parseOffers(event, { sport: 'mlb', home: { en: 'Chicago White Sox' }, away: { en: 'Chicago Cubs' } });
  const tt = Object.fromEntries(markets.filter(m => m.kind === 'teamtotal').map(m => [m.team, m.line]));
  assert.deepEqual(tt, { home: 4.5, away: 3.5 }, "ESPN's home is the White Sox");
});

// ---- A slip paid -----------------------------------------------------------------

const slipOf = (legs, extra = {}) => ({ id: 's1', status: 'open', legs, sizes: [legs.length], stake: 100, cost: 100, ...extra });
const acct = slips => ({ v: 1, created: '2026-10-01T00:00:00.000Z', updated: '2026-10-01T00:00:00.000Z', ledger: [], slips });

test('a slip is paid once, when every pick is decided or the moment nothing left can pay', () => {
  const now = new Date('2026-10-18T00:00:00Z');
  const legs = [{ odds: 2, gameId: 'a' }, { odds: 3, gameId: 'b' }];
  let a = acct([slipOf(legs)]);
  a = applyResults(a, 's1', ['won', null], now);
  assert.equal(a.slips[0].status, 'open');
  assert.equal(a.slips[0].legs[0].result, 'won');
  assert.equal(a.ledger.length, 0);
  a = applyResults(a, 's1', [null, 'won'], now);
  assert.equal(a.slips[0].status, 'settled');
  assert.deepEqual(a.ledger.map(e => [e.id, e.amount]), [['payout-s1', 600]]);
  // Again, from another device: nothing paid twice.
  assert.equal(applyResults(a, 's1', ['won', 'won'], now), a);
  // A parlay with a pick lost is lost at once.
  let b = applyResults(acct([slipOf(legs)]), 's1', ['lost', null], now);
  assert.equal(b.slips[0].status, 'settled');
  assert.deepEqual(b.ledger.map(e => [e.id, e.amount]), [['payout-s1', 0]]);
  // A system slip (2 of 3) still pays with one lost: it waits.
  const sys = slipOf([...legs, { odds: 4, gameId: 'c' }], { sizes: [2], cost: 300 });
  const c = applyResults(acct([sys]), 's1', ['lost', null, null], now);
  assert.equal(c.slips[0].status, 'open');
  assert.equal(applyResults(c, 's1', [null, 'won', 'won'], now).ledger[0].amount, 1_200);
  // A void pick counts at 1.00.
  assert.equal(applyResults(acct([slipOf(legs)]), 's1', ['void', 'won'], now).ledger[0].amount, 300);
  // Unknown slips and settled ones are left alone.
  assert.equal(applyResults(a, 'nope', ['won'], now), a);
});

test('a free bet pays only its winnings; a slip refunded while lost has had its cost back; Plus\'s bigger boost is its own entry', () => {
  const now = new Date('2026-10-18T00:00:00Z');
  const free = applyResults(acct([slipOf([{ odds: 2.5, gameId: 'a' }], { free: true, freeValue: 100, cost: 0 })]), 's1', ['won'], now);
  assert.equal(free.ledger[0].amount, 150);
  assert.equal(applyResults(acct([slipOf([{ odds: 2.5, gameId: 'a' }], { free: true, freeValue: 100 })]), 's1', ['lost'], now).ledger[0].amount, 0);
  const refunded = { ...acct([slipOf([{ odds: 2, gameId: 'a' }])]), ledger: [{ id: 'refund-s1', t: '2026-10-02T00:00:00.000Z', kind: 'refund', amount: 100 }] };
  assert.equal(applyResults(refunded, 's1', ['won'], now).ledger.at(-1).amount, 100, 'won 200, less the 100 refunded');
  // Three picks: the 5% boost on the winnings, ×1.5 for a member: 7.5%.
  const legs = [{ odds: 2, gameId: 'a' }, { odds: 2, gameId: 'b' }, { odds: 2, gameId: 'c' }];
  const plus = applyResults(acct([slipOf(legs, { boost: 1.5 })]), 's1', ['won', 'won', 'won'], now);
  assert.deepEqual(plus.ledger.map(e => [e.id, e.amount]), [['payout-s1', 835], ['plus-s1', 17]]);
  assert.equal(plus.slips[0].payout, 100 + 700 * 1.075 - 0.5);
});

test("Taiwan's withholding: each combination over NT$5,000 taxed on its own; the ticket capped at NT$20 million", () => {
  assert.equal(afterTax(5_000), 5_000);
  assert.ok(Math.abs(afterTax(5_001) - 5_001 * 0.796) < 1e-9);
  assert.equal(prizeAfterTax(5_000), 5_000);
  assert.equal(prizeAfterTax(5_001), 3_981);
  assert.equal(prizeAfterTax(0), 0);
  // Two singles of NT$3,000 each: neither is taxed, though they add up past 5,000.
  const two = settleSlip({ legs: [{ odds: 3, result: 'won', gameId: 'a' }, { odds: 3, result: 'won', gameId: 'b' }], sizes: [1], stake: 1_000 });
  assert.deepEqual(two, { gross: 6_000, net: 6_000, taxed: 0 });
  const big = settleSlip({ legs: [{ odds: 10, result: 'won' }], sizes: [1], stake: 1_000 });
  assert.equal(big.net, 10_000 * 0.796);
  assert.equal(big.taxed, 1);
  // A 2-of-3 system: each combination taxed on its own (台灣運彩), so two of three over NT$5,000.
  const sys = settleSlip({ legs: [{ odds: 3, result: 'won', gameId: 'a' }, { odds: 2, result: 'won', gameId: 'b' }, { odds: 2, result: 'won', gameId: 'c' }], sizes: [2], stake: 1_000 });
  assert.equal(sys.taxed, 2, 'NT$6,000, 6,000 and 4,000: two over NT$5,000');
  assert.equal(sys.net, 6_000 * 0.796 * 2 + 4_000);
  const cap = settleSlip({ legs: Array.from({ length: 6 }, (_, i) => ({ odds: 20, result: 'won', gameId: String(i) })), sizes: [6], stake: 1_000 });
  assert.equal(cap.gross, SLIP_RULES.maxPayout);
  assert.ok(Math.abs(cap.net - SLIP_RULES.maxPayout * 0.796) < 1e-6);
  assert.deepEqual(settleSlip({ legs: [{ odds: 3, result: 'void' }], sizes: [1], stake: 100 }), { gross: 100, net: 100, taxed: 0 }, 'a single called off: the stake back');
  assert.deepEqual(settleSlip({ legs: [{ odds: 3, result: 'lost' }], sizes: [1], stake: 100 }), { gross: 0, net: 0, taxed: 0 });
});

test('the odds math: combinations, exclusive picks, the expected payout against a brute force', () => {
  assert.deepEqual(combosBySize([{ gameId: 'a' }, { gameId: 'a' }, { gameId: 'b' }]), [1, 3, 2]);
  assert.equal(comboCount([{}, {}, {}, {}], [2, 3]), 6 + 4);
  assert.deepEqual([choose(5, 2), choose(49, 6), choose(3, 4), choose(3, -1)], [10, 13_983_816, 0, 0]);
  assert.deepEqual(slipSizes('system', 4, [3, 2, 2, 5, 1, 0]), [1, 2, 3]);
  // 過關組合: 2 to 12 games, 過1關 to 過N關 (台灣運彩: 過1關 … 過12關).
  const two = [{ gameId: 'a', odds: 2 }, { gameId: 'b', odds: 3 }];
  assert.deepEqual(slipSizes('system', 2, [1, 2]), [1, 2]);
  assert.deepEqual(slipErrors({ mode: 'system', legs: two, sizes: [1, 2], stake: 100 }), [], 'two games, 過1關 and 過2關');
  assert.equal(comboCount(two, [1, 2]), 3);
  assert.deepEqual(slipErrors({ mode: 'system', legs: two, sizes: [1], stake: 100 }), [], '過1關 alone');
  assert.deepEqual(slipErrors({ mode: 'system', legs: two, sizes: [], stake: 100 }), ['noSizes']);
  assert.deepEqual(slipErrors({ mode: 'system', legs: [{ gameId: 'a', odds: 2 }], sizes: [1], stake: 100 }), ['systemNeedsTwo']);
  assert.ok(slipErrors({ mode: 'system', legs: [{ gameId: 'a', odds: 2 }, { gameId: 'a', odds: 3 }], sizes: [1], stake: 100 }).includes('systemNeedsTwo'), 'two picks of one game are one game');
  // 包牌: 7 picks on 6 games (the lottery's own example): 過1關 7, 過2關 20, 過3關 30, 過4關 25 = 82 combinations.
  const seven = ['a', 'b', 'c', 'd', 'e', 'f', 'f'].map(gameId => ({ gameId, odds: 10 }));
  assert.deepEqual([1, 2, 3, 4].map(k => comboCount(seven, [k])), [7, 20, 30, 25]);
  assert.deepEqual(slipErrors({ mode: 'system', legs: seven, sizes: [1, 2, 3, 4], stake: 10 }), []);
  // A 限2關 pick can't be in a 過1關.
  assert.ok(slipErrors({ mode: 'system', legs: [{ gameId: 'a', odds: 2, minLegs: 2 }, { gameId: 'b', odds: 3 }], sizes: [1, 2], stake: 100 }).includes('minLegs'));
  // Paid: 過1關 and 過2關 on two games, one won one lost: the winner's single.
  assert.equal(settleSlip({ legs: [{ ...two[0], result: 'won' }, { ...two[1], result: 'lost' }], sizes: [1, 2], stake: 100 }).gross, 200);
  assert.equal(settleSlip({ legs: [{ ...two[0], result: 'won' }, { ...two[1], result: 'won' }], sizes: [1, 2], stake: 100 }).gross, 200 + 300 + 600);
  assert.deepEqual(slipSizes('parlay', 1), []);
  assert.deepEqual(slipErrors({ mode: 'parlay', legs: [{ gameId: 'a', odds: 2 }, { gameId: 'a', odds: 2 }], sizes: [2], stake: 100 }), ['sameGame']);
  assert.deepEqual(slipErrors({ mode: 'single', legs: [{ odds: 2 }], sizes: [1], stake: 15 }), ['stakeUnit', 'ticketMin']);
  // Odds of 1.00 or less are never offered: such a pick can't be bought.
  for (const odds of [1, 0.9, 0, undefined, 'x']) assert.deepEqual(slipErrors({ mode: 'single', legs: [{ odds }], sizes: [1], stake: 100 }), ['odds'], String(odds));
  assert.deepEqual(slipErrors({ mode: 'single', legs: [{ odds: 1.01 }], sizes: [1], stake: 100 }), []);
  assert.ok(slipErrors({ mode: 'single', legs: [{ cap: 'prop' }], sizes: [1], stake: 2_000 }).includes('ticketCapped'));
  assert.ok(slipErrors({ mode: 'single', legs: Array.from({ length: 13 }, () => ({})), sizes: [1], stake: 100 }).includes('tooManyLegs'));
  assert.deepEqual(slipErrors({ mode: 'single', legs: [], sizes: [], stake: 100 }), ['empty']);
  // Both sides of one market: one draw, at most one wins.
  const both = [{ gameId: 'g', market: 'ml', fairChance: 0.6, odds: 1.5 }, { gameId: 'g', market: 'ml', fairChance: 0.4, odds: 2.2 }];
  assert.deepEqual(exclusiveMasks(both), [3]);
  assert.equal(maskChance(both, 3), 0);
  assert.ok(Math.abs(maskChance(both, 0)) < 1e-12);
  // Expected payout: every way the legs land, by hand.
  const rand = seededRandom(11);
  for (let k = 0; k < 200; k++) {
    const n = 1 + Math.floor(rand() * 5);
    const legs = Array.from({ length: n }, (_, i) => ({ gameId: `g${i}`, odds: 1.2 + rand() * 6, fairChance: 0.1 + rand() * 0.8 }));
    const sizes = [1 + Math.floor(rand() * n)];
    const stake = 10 * (1 + Math.floor(rand() * 300));
    let expectedNet = 0;
    for (let won = 0; won < 1 << n; won++) {
      let p = 1;
      for (let i = 0; i < n; i++) p *= won & (1 << i) ? legs[i].fairChance : 1 - legs[i].fairChance;
      expectedNet += p * settleSlip({ legs: legs.map((l, i) => ({ ...l, result: won & (1 << i) ? 'won' : 'lost' })), sizes, stake }).net;
    }
    const e = evaluateSlip({ legs, sizes, stake });
    assert.ok(Math.abs(e.expectedNet - expectedNet) < 1e-6 * Math.max(1, expectedNet));
    assert.ok(Math.abs(slipOutlook({ legs, sizes, stake }).mean - expectedNet) < 1e-6 * Math.max(1, expectedNet));
    assert.ok(Math.abs(analyzeSlip({ legs, sizes, stake }).expectedNet - expectedNet) < 1e-6 * Math.max(1, expectedNet));
    assert.ok(Math.abs(e.byHits.reduce((s, r) => s + r.chance, 0) - 1) < 1e-9);
    assert.equal(slipPayoutTable({ legs, sizes, stake }).gross[(1 << n) - 1], e.best);
  }
  assert.deepEqual([boostRate(2), boostRate(3), boostRate(7), boostRate(12), boostRate(3, 1.5), boostRate(3, 0)], [0, 0.05, 0.2, 0.2, 0.07500000000000001, 0]);
});

test('prices from chances: never under 1.01, the long end capped, the books\' margin taken out', () => {
  assert.equal(estimateLineOdds(0.999, 1.158), 1.01);
  assert.equal(estimateLineOdds(0.5, 1.158), 1.73);
  assert.equal(estimateLineOdds(0.9, 1.158), Math.round(100 / 0.95) / 100, 'never more than halfway to certain');
  assert.equal(estimateF1Odds(0), 500);
  assert.equal(estimateF1Odds(0.9), 1.01);
  const fut = estimateFuturesOdds([0.6, 0.3, 0.003, 0.001], 1.8);
  assert.equal(fut[2], 133);
  assert.equal(fut[3], 300);
  assert.ok(fut[0] >= 1.01 && fut[0] < fut[1]);
  assert.equal(americanToProbability(-200), 2 / 3);
  assert.equal(americanToProbability(100), 0.5);
  assert.equal(americanToProbability(0), null);
  assert.equal(americanToProbability('x'), null);
  assert.equal(devigTwoWay(0.55, 0.55), 0.5);
  assert.equal(devigTwoWay(0, 0.5), null);
  assert.deepEqual(devigProportional([0.5, 0.3, 0.3]).map(x => Math.round(x * 1e6) / 1e6), [0.454545, 0.272727, 0.272727]);
  assert.ok(Math.abs(devigPower([0.6, 0.3, 0.2]).reduce((s, p) => s + p, 0) - 1) < 1e-9);
  assert.deepEqual(devigPower([0, 0]), [0, 0]);
  assert.equal(quantile([1, 2, 3, 4], 0.5), 2.5);
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([]), null);
});

test("the house's rules: locked at both ends, a short price only in a parlay, the long end shaded", () => {
  assert.deepEqual(houseRule('ml', 1.03), { lock: 'low', minLegs: 1 });
  assert.deepEqual(houseRule('ml', 1.05), { lock: null, minLegs: 3 });
  assert.deepEqual(houseRule('ml', 1.2), { lock: null, minLegs: 2 });
  assert.deepEqual(houseRule('ml', 1.25), { lock: null, minLegs: 1 });
  assert.deepEqual(houseRule('ml', 30), { lock: 'high', minLegs: 1 });
  assert.deepEqual(houseRule('score', 30), { lock: null, minLegs: 1 }, 'many-outcome markets go to 150');
  assert.deepEqual(houseRule('f1', 1.1), { lock: 'low', minLegs: 2 });
  assert.deepEqual(houseRule('f1', 200), { lock: null, minLegs: 1 });
  assert.deepEqual(houseRule('ml', NaN), { lock: null, minLegs: 1 });
  assert.equal(shadeLong('ml', LONG_FROM), LONG_FROM);
  assert.equal(shadeLong('ml', 16), 14.5);
  assert.equal(shadeLong('score', 16), 16);
  assert.equal(minLegsProblem([{ minLegs: 3 }, {}], [2]), 3);
  assert.equal(minLegsProblem([{ minLegs: 2 }, {}], [2]), 0);
  assert.equal(HOUSE_RULES.lockLow < HOUSE_RULES.threeLegsUnder, true);
});

// ---- Cash out --------------------------------------------------------------------

test('cash out: paused when it should be, and never worth more than holding the slip', () => {
  const legs = [{ odds: 2, gameId: 'a' }, { odds: 2.5, gameId: 'b' }, { odds: 1.8, gameId: 'c', result: 'won' }];
  const slip = { id: 's', status: 'open', legs, sizes: [3], stake: 100 };
  assert.deepEqual(cashOutState({ ...slip, free: true }, [0.5, 0.4, null]), { value: null, reason: 'free' });
  assert.equal(cashOutState({ ...slip, status: 'settled' }, []).reason, 'done');
  assert.equal(cashOutState(slip, [0.5, null, null]).reason, 'noPrice');
  assert.equal(cashOutState(slip, [0.5, 1, null]).reason, 'noPrice', 'a chance of 1 is no price');
  assert.deepEqual(cashOutState({ ...slip, legs: [{ odds: 2, gameId: 'a' }, { odds: 2, gameId: 'a' }], sizes: [1] }, [0.5, 0.5]), { value: null, reason: 'sameGame', leg: 1 });
  const many = { ...slip, legs: Array.from({ length: CASHOUT_MAX_OPEN + 1 }, (_, i) => ({ odds: 2, gameId: String(i) })) };
  assert.equal(cashOutState(many, many.legs.map(() => 0.5)).reason, 'tooMany');
  // Worth: the fair hold value (both open legs at their fair chances), less the cuts and the keep.
  const p = [0.5, 0.4];
  const hold = p[0] * p[1] * settleSlip({ legs: [{ odds: 2, result: 'won' }, { odds: 2.5, result: 'won' }, { odds: 1.8, result: 'won' }], sizes: [3], stake: 100 }).net;
  const { value } = cashOutState(slip, [p[0], { p: p[1], live: true }, null]);
  assert.equal(value, Math.floor(0.5 * 0.96 * 0.4 * 0.94 * 900 * (1 - CASHOUT_KEEP) + 1e-6));
  assert.ok(value < hold);
  // A Plus member keeps more of it.
  assert.ok(cashOutState(slip, [0.5, 0.4, null], { keep: 0.02 }).value > cashOutState(slip, [0.5, 0.4, null]).value);
});

// ---- The lottery -----------------------------------------------------------------

test("lottery prizes by Taiwan Lottery's tables, each game", () => {
  const t = (game, sel, draw, extra = {}) => ticketPrize({ game, sel, ...extra }, draw);
  const sp = { numbers: [1, 2, 3, 4, 5, 6], zone2: 7, pools: { jackpot: { perPrize: 0, winners: 0, pool: 300_000_000 }, second: { perPrize: 1_000_000, winners: 3, pool: 0 } } };
  assert.equal(t('super638', { zones: [[1, 2, 3, 4, 5, 6], [7]] }, sp).prize, 300_000_000, 'nobody else won: the whole pool');
  assert.equal(t('super638', { zones: [[1, 2, 3, 4, 5, 6], [8]] }, sp).prize, 750_000, 'shared with the three real winners');
  assert.deepEqual(t('super638', { zones: [[1, 2, 3, 10, 11, 12], [7]] }, sp), { prize: 400, tier: 'seventh', detail: [3, 1] });
  assert.equal(t('super638', { zones: [[1, 20, 21, 22, 23, 24], [7]] }, sp).prize, 100, '普獎: one and the second zone');
  assert.equal(t('super638', { zones: [[1, 20, 21, 22, 23, 24], [8]] }, sp).prize, 0);
  const lotto = { numbers: [1, 2, 3, 4, 5, 6], special: 7, pools: {} };
  assert.deepEqual(t('lotto649', { zones: [[1, 2, 7, 40, 41, 42]] }, lotto), { prize: 400, tier: 'seventh', detail: [2, 1] });
  assert.equal(t('lotto649', { zones: [[1, 2, 3, 40, 41, 42]] }, lotto).tier, 'normal');
  assert.equal(t('lotto649', { zones: [[1, 2, 3, 7, 41, 42]] }, lotto).tier, 'sixth');
  assert.equal(t('lotto649', { zones: [[1, 2, 40, 41, 42, 43]] }, lotto).prize, 0);
  assert.equal(t('daily539', { zones: [[1, 2, 3, 30, 31]] }, { numbers: [1, 2, 3, 4, 5] }).prize, 300);
  // 3星彩: straight, box by the digits' orders, the last two in order.
  const star3 = { digits: [1, 2, 3] };
  assert.equal(t('star3', { play: 'straight', digits: [1, 2, 3] }, star3).prize, 12_500);
  assert.equal(t('star3', { play: 'box', digits: [3, 2, 1] }, star3).prize, 2_000);
  assert.equal(t('star3', { play: 'box', digits: [1, 1, 2] }, { digits: [1, 2, 1] }).prize, 4_000);
  assert.equal(t('star3', { play: 'pair', digits: [9, 2, 3] }, star3).prize, 1_250);
  assert.equal(t('star4', { play: 'box', digits: [1, 1, 2, 2] }, { digits: [2, 1, 2, 1] }).prize, 20_000);
  assert.equal(boxWays([1, 1, 1]), 1);
  assert.equal(boxWays([1, 2, 3, 4]), 24);
  // 樂合彩: every combination inside the draw wins.
  assert.equal(t('m39', { numbers: [1, 2, 3, 30], size: 2 }, { numbers: [1, 2, 3, 4, 5] }).prize, 3 * 1_125);
  assert.equal(betCount('m39', { numbers: [1, 2, 3, 30], size: 2 }), 6);
  // BINGO: stars and their hits, the sides; its prize already counts the multiple.
  const bingo = { numbers: Array.from({ length: 20 }, (_, i) => 41 + i * 2), bull: 79 };
  assert.equal(t('bingo', { numbers: [41, 43, 1] }, bingo, { multiple: 2 }).prize, 25 * 2 * 2, '2 of 3 stars');
  assert.equal(t('bingo', { numbers: [1, 2, 3, 4, 5, 6, 7, 8] }, bingo).prize, 25, '8 stars, none hit: the stake back');
  assert.equal(t('bingo', { side: 'big' }, bingo).prize, 150);
  assert.equal(t('bingo', { side: 'small' }, bingo).prize, 0);
  assert.equal(t('bingo', { side: 'odd' }, bingo).prize, 150);
  assert.equal(t('bingo', { side: 'bullseye', bull: 79 }, bingo).prize, 1_200);
  // 雙贏彩: all twelve or none pay the top prize.
  assert.equal(t('lotto1224', { zones: [[13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24]] }, { numbers: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] }).prize, 15_000_000);
  assert.equal(t('lotto1224', { zones: [[1, 2, 3, 4, 5, 6, 13, 14, 15, 16, 17, 18]] }, { numbers: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] }).prize, 0);
  assert.equal(t('lotto740', { zones: [[1, 2, 3, 30, 31, 32, 33]] }, { numbers: [1, 2, 3, 4, 5, 6, 7] }).prize, 200);
});

test('lottery tickets: checked, bought at their draw, settled once with the tax, merged settled-first', () => {
  assert.deepEqual(checkSelection('super638', { zones: [[1, 2, 3, 4, 5, 6], [9]] }), { error: 'numbers' });
  assert.deepEqual(checkSelection('super638', { zones: [[1, 2, 3, 4, 5, 5], [1]] }), { error: 'numbers' });
  assert.deepEqual(checkSelection('star3', { play: 'box', digits: [7, 7, 7] }), { error: 'boxSame' });
  assert.deepEqual(checkSelection('bingo', { numbers: Array.from({ length: 11 }, (_, i) => i + 1) }), { error: 'numbers' });
  assert.deepEqual(checkSelection('bingo', { side: 'bullseye', bull: 81 }), { error: 'side' });
  assert.deepEqual(checkSelection('m38', { numbers: [1, 2], size: 3 }), { error: 'numbers' });
  const now = new Date('2026-10-19T10:00:00Z'); // Monday 18:00 Taipei: tonight's 威力彩
  const acc = { ledger: [{ id: 'start', amount: 1_000, t: '' }], tickets: [] };
  const bought = buyTicket(acc, { id: 't1', game: 'super638', sel: { zones: [[1, 2, 3, 4, 5, 6], [7]] }, multiple: 3 }, now);
  assert.equal(bought.ticket.draw.date, '2026-10-19');
  assert.equal(bought.ticket.cost, 300);
  assert.equal(buyTicket({ ledger: [] }, { id: 't', game: 'super638', sel: { zones: [[1, 2, 3, 4, 5, 6], [7]] } }, now).error, 'funds');
  // 3 × NT$150,000 (5 + the second zone): each bet taxed, 3 × 119,400.
  const won = settleTicket(bought.account, 't1', { numbers: [1, 2, 3, 4, 5, 40], zone2: 7, pools: {} }, now);
  assert.equal(won.tickets[0].gross, 450_000);
  assert.equal(won.tickets[0].prize, 358_200);
  assert.equal(won.ledger.at(-1).amount, 358_200);
  assert.equal(settleTicket(won, 't1', { numbers: [1, 2, 3, 4, 5, 6], zone2: 7, pools: {} }, now), won, 'settled once');
  // Tax is withheld bet by bet, never on the ticket's total: six 二合 of
  // NT$1,250 (7,500 together) paid whole; a 三合 of NT$12,500 taxed on its own;
  // ten BINGO multiples of NT$1,000 paid whole.
  const pay = (game, sel, draw, multiple = 1) => {
    const b = buyTicket({ ledger: [{ id: 'start', amount: 100_000, t: '' }], tickets: [] }, { id: 'x', game, sel, multiple }, now);
    return settleTicket(b.account, 'x', draw, now).tickets[0];
  };
  const six = { numbers: [1, 2, 3, 4, 5, 6] };
  const pairs = pay('m49', { numbers: [1, 2, 3, 30], size: 2 }, six, 2);
  assert.deepEqual([pairs.gross, pairs.prize], [7_500, 7_500], 'six bets of NT$1,250: none taxed');
  const triples = pay('m49', { numbers: [1, 2, 3, 4, 30], size: 3 }, six);
  assert.deepEqual([triples.gross, triples.prize], [4 * 12_500, 4 * 9_950], 'four bets of NT$12,500, each taxed');
  const stars = pay('bingo', { numbers: [41, 43, 45, 47] }, { numbers: Array.from({ length: 20 }, (_, i) => 41 + i * 2), bull: 79 }, 10);
  assert.deepEqual([stars.gross, stars.prize], [10_000, 10_000], 'ten bets of NT$1,000: none taxed');
  const open = bought.account.tickets[0];
  const settled = won.tickets[0];
  assert.equal(mergeTickets([open], [settled])[0].status, 'settled');
  assert.equal(mergeTickets([settled], [open])[0].status, 'settled');
  // The Worker's tickets put on the account once, with their cost.
  const withWorker = addTickets({ ledger: [], tickets: [] }, [{ id: 'w1', t: '2026-10-19T00:00:00.000Z', cost: 50 }], now);
  assert.deepEqual(withWorker.ledger.map(e => [e.id, e.amount]), [['lotto-w1', -50]]);
  assert.equal(addTickets(withWorker, [{ id: 'w1', t: '', cost: 50 }], now), withWorker);
});

test('draw times: sales close half an hour before 20:30, BINGO every five minutes from 07:05 to 23:55', () => {
  const at = s => Date.parse(s);
  assert.equal(nextDraw('super638', at('2026-10-19T11:59:59Z')).date, '2026-10-19');
  assert.equal(nextDraw('super638', at('2026-10-19T12:00:00Z')).date, '2026-10-22', 'closed at 20:00: Thursday');
  assert.equal(nextDraw('daily539', at('2026-10-17T13:00:00Z')).date, '2026-10-19', 'none on Sunday');
  assert.deepEqual(nextDraw('bingo', at('2026-10-18T23:04:00Z')), { date: '2026-10-19', slot: 0, at: at('2026-10-18T23:05:00Z') });
  assert.equal(nextDraw('bingo', at('2026-10-18T23:05:00Z')).slot, 1);
  assert.equal(nextDraw('bingo', at('2026-10-19T15:53:59Z')).slot, BINGO_DRAWS - 1, '23:55, the last');
  assert.equal(nextDraw('bingo', at('2026-10-19T15:54:00Z')).slot, BINGO_DRAWS - 1, 'a minute before the draw: still in it');
  assert.deepEqual(nextDraw('bingo', at('2026-10-19T15:54:01Z')), { date: '2026-10-20', slot: 0, at: at('2026-10-19T23:05:00Z') });
  assert.equal(HOUSE_SLOT, 161, "20:30's BINGO draw");
  // What the fixed-prize tables pay back on average, as a real lottery's.
  for (const id of ['daily539', 'lotto740', 'lotto1224']) assert.ok(expectedReturn(id) > 0.3 && expectedReturn(id) < 0.9, id);
  for (const stars of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) assert.ok(expectedReturn('bingo', { stars }) > 0.4 && expectedReturn('bingo', { stars }) < 0.9, `bingo ${stars}`);
  assert.equal(Object.keys(GAMES).length, 11);
});

test('scratch cards: every face pays exactly its prize, the prize taxed once over NT$5,000', () => {
  for (const id of CARD_ORDER) {
    const prizes = [0, ...new Set(tiersOf(id).map(t => t.prize))];
    for (const prize of prizes) for (let seed = 1; seed < 6; seed++) assert.equal(facePays(id, face(id, prize, seed * 7919)), prize, `${id} ${prize} ${seed}`);
    assert.ok(scratchReturn(id) > 0.5 && scratchReturn(id) < 0.85, id);
    assert.equal(drawPrize(id, () => 0.999999), 0);
  }
  const acc = { ledger: [{ id: 'start', amount: 10_000, t: '' }], tickets: [] };
  const now = new Date('2026-10-18T00:00:00Z');
  // A draw that lands on the top tier (the table's chances in order, the last one's start).
  const tiers = tiersOf('million');
  const top = tiers.slice(0, -1).reduce((s, t) => s + 1 / t.odds, 0) + 1e-12;
  const { account, ticket } = buyScratch(acc, { id: 'c1', card: 'million' }, now, { rand: () => top, seed: 1 });
  assert.equal(ticket.prize, tiers.at(-1).prize);
  assert.ok(ticket.prize > 5_000, 'the top prize');
  const after = revealScratch(account, 'c1', now);
  assert.equal(after.ledger.at(-1).amount, prizeAfterTax(ticket.prize));
  assert.equal(revealScratch(after, 'c1', now), after);
  assert.equal(buyScratch({ ledger: [] }, { id: 'x', card: 'million' }, now).error, 'funds');
});
