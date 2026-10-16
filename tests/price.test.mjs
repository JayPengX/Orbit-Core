// The Worker's check of a pick (price.js housePick): it reads only what can
// change the pick, and decides exactly as reading everything did.
import test from 'node:test';
import assert from 'node:assert/strict';
import { housePick, checkSlip } from '../price.js';
import { boardBets, liveBets, legOf } from '../kit/play-bets.mjs';
import { parseOffers } from '../kit/play-offers.mjs';
import { slipErrors } from '../kit/play-odds.mjs';

const NOW = new Date('2026-10-10T08:00:00Z');
const offer = (label, type, outcomes, tags = []) => ({ criterion: { englishLabel: label }, betOfferType: { englishName: type }, tags, outcomes });
const o = (type, odds, extra = {}) => ({ type, odds, status: 'OPEN', ...extra });
const kambiPage = {
  events: [{ homeName: 'Arsenal', awayName: 'Leeds United' }],
  betOffers: [
    // A total Kambi prices longer than the model and one shorter.
    offer('Total Goals', 'Over/Under', [o('OT_OVER', 2300, { line: 2500 }), o('OT_UNDER', 1600, { line: 2500 })], ['MAIN_LINE']),
    offer('Asian Handicap', 'Asian Handicap', [o('OT_UNTYPED', 1900, { line: -1500, participant: 'Arsenal' }), o('OT_UNTYPED', 1900, { line: 1500, participant: 'Leeds United' })]),
    offer('Draw No Bet', 'Match', [o('OT_ONE', 1100), o('OT_TWO', 6000)]),
    offer('Correct Score', 'Correct Score', [o('OT_UNTYPED', 7000, { label: '2-1' }), o('OT_UNTYPED', 9000, { label: '1-1' })]),
    offer('To Score', 'Player Occurrence Line', [o('OT_YES', 3300, { line: 1000, participant: 'Bukayo Saka' })])
  ]
};
const game = { id: 'epl_g', sport: 'epl', startUtc: '2026-10-10T11:30:00.000Z', home: { en: 'Arsenal' }, away: { en: 'Leeds United' }, kambiId: 7, draftKings: { home: 0.7, draw: 0.18, away: 0.12 }, polymarket: null, house: null, total: { line: 2.5, overFair: 0.55 }, spread: null };
const offers = parseOffers(kambiPage, game);
const players = [{ name: 'Bukayo Saka', side: 'home', pos: 'F', gp: 10, totals: { gp: 10, subIns: 0, goals: 6, assists: 4, sot: 20 } }];

// The reads of one check, from memory; each one asked for noted.
function reads(extra = {}) {
  const asked = [];
  const answers = { 'league:epl': [game], 'offers:7': offers, 'players:epl_g': players, ...extra };
  const once = async (key, f) => {
    asked.push(key);
    if (key in answers) return answers[key];
    return f();
  };
  return { once, asked };
}

// Before: every pick priced with the game's markets and players read, the richer of the two boards.
const usable = b => b && !b.lock && b.estOdds > 1;
function readingEverything(id) {
  const plain = boardBets({ games: [game] }, { now: NOW }).find(b => b.id === id);
  const rich = boardBets({ games: [{ ...game, offers, players }] }, { now: NOW }).find(b => b.id === id);
  const best = [plain, rich].filter(usable).sort((a, b) => b.estOdds - a.estOdds)[0];
  return best ? { bet: best, odds: best.estOdds } : { gone: true };
}
const same = h => (h.bet ? { leg: legOf(h.bet), odds: h.odds, lock: h.bet.lock ?? null, minLegs: h.bet.minLegs, cap: h.bet.cap ?? null } : h);

test('a pick is priced exactly as with everything read, reading only what can change it', async () => {
  const ids = [...new Set(boardBets({ games: [{ ...game, offers, players }] }, { now: NOW }).map(b => b.id))];
  const kinds = new Set();
  for (const id of ids) {
    const { once, asked } = reads();
    const leg = { id, gameId: game.id, sport: 'epl' };
    const h = await housePick(leg, NOW, once);
    assert.deepEqual(same(h), same(readingEverything(id)), id);
    const kind = h.bet?.kind ?? 'gone';
    kinds.add(kind);
    // The winner: the league's board alone. Another of the game's markets:
    // its own markets too. A player's pick: its players as well.
    if (kind === 'ml') assert.deepEqual(asked, ['league:epl'], id);
    else if (kind === 'prop') assert.deepEqual(asked.sort(), ['league:epl', 'offers:7', 'players:epl_g'], id);
    else assert.deepEqual(asked.sort(), ['league:epl', 'offers:7'], id);
  }
  for (const k of ['ml', 'total', 'runline', 'dnb', 'score', 'prop']) assert.ok(kinds.has(k), k);
});

test('a slip is accepted and refused as before, at the house\'s price and just past it', async () => {
  const ids = [...new Set(boardBets({ games: [{ ...game, offers, players }] }, { now: NOW }).map(b => b.id))];
  for (const id of ids) {
    const before = readingEverything(id);
    if (!before.bet) continue;
    for (const odds of [before.odds, Math.round(before.odds * 1.02 * 100) / 100 + 0.01]) {
      const leg = { ...legOf(before.bet), odds };
      const slip = { mode: 'single', sizes: [1], stake: 100, cost: 100, legs: [leg] };
      const r = await checkSlip(slip, { entries: [] }, null, NOW, reads().once);
      // (Reading everything: refused only by the house's rules on its own bet.)
      const ok = !slipErrors({ mode: 'single', legs: [{ ...before.bet, odds }], sizes: [1], stake: 100 }).length;
      if (odds !== before.odds) assert.deepEqual(r, { problem: 'moved', moved: [{ id, odds: Math.round(before.odds * 100) / 100 }] }, id);
      else if (ok) assert.equal(r.ok, true, `${id} ${JSON.stringify(r)}`);
      else assert.ok(r.problem && r.problem !== 'moved', `${id} ${JSON.stringify(r)}`);
    }
  }
});

test('a live winner is priced without the game\'s own markets; its other picks with them', async () => {
  const data = { loadedAt: NOW.toISOString(), games: [], kambi: [{ sport: 'kleague', kambiId: 9, startUtc: '2026-10-10T07:00:00Z', away: 'Ulsan', home: 'Jeonbuk', ml: { home: 0.5, draw: 0.3, away: 0.2 }, total: { line: 2.5, overFair: 0.45 } }] };
  const board = liveBets(data);
  for (const b of board.bets) {
    const { once, asked } = reads({ 'live:kleague': data, 'offers:live:9': null });
    const h = await housePick({ id: b.id, gameId: b.gameId, sport: 'kleague', live: true }, NOW, once);
    assert.equal(h.bet.id, b.id);
    assert.equal(h.odds, b.estOdds);
    assert.deepEqual(asked, b.kind === 'ml' ? ['live:kleague'] : ['live:kleague', 'offers:live:9'], b.id);
  }
});
