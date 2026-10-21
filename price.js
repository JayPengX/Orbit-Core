// ---- price.js ----
// A slip placed in Quadra Play, checked before it counts (the owner's
// lock-down, 2026-10-12): every pick priced again here with Play's own code
// (the kit's play-sources and play-bets), read through the sports proxy (its
// cache and trims), and the slip's money checked against the pass's wallet.
//
// A pick passes when the house would sell it at that price now: its price
// is no better than the house's (with or without the game's own Kambi
// markets and players read, either of which Play may have shown: each read
// only where it can change the pick), give or take a cent's rounding and 1%
// for a board a moment old. A pre-game pick's
// game must not have started (by this read, not the phone's clock); a live
// pick must be on the live board. A pick refused comes back with the
// house's price now (null: not on sale), and Play asks again at it.
//
// deps: { read(url, trim) -> JSON (throws on failure), pack(path) -> JSON }.
import * as src from './kit/play-sources.mjs';
import { boardBets, futureBets, liveBets, legOf } from './kit/play-bets.mjs';
import { comboCount, slipSizes, slipErrors } from './kit/play-odds.mjs';
import { LIVE_MIN_LIQUIDITY } from './kit/play-live.mjs';

// How much better than the house's a price may be: rounding to the cent,
// and a board read a moment before this one.
export const PRICE_SLACK = 0.01;
export const priceOk = (asked, house) => asked <= house * (1 + PRICE_SLACK) + 0.005;

// The reads of one check: each URL once, through the deps.
export function useReads(deps) {
  const memo = new Map();
  const once = (key, f) => {
    if (!memo.has(key)) memo.set(key, Promise.resolve().then(f));
    return memo.get(key);
  };
  src.useReader({ proxyJson: (url, { trim = '' } = {}) => once(`${trim}!${url}`, () => deps.read(url, trim)), packJson: path => once(`pack:${path}`, () => deps.pack(path)) });
  return once;
}

const usable = b => b && !b.lock && b.estOdds > 1;

// The house's bet for a pick now, with the most it may sell it at:
// { bet, odds } or { gone: true } (not on sale) or { started: true }.
export async function housePick(leg, now, once) {
  const t = now.getTime();
  if (leg.kind === 'future') {
    const key = leg.market || String(leg.id).split('|')[1];
    const market = await once(`future:${key}`, () => src.loadFuture(key, now));
    const bet = market ? futureBets([market]).find(b => b.id === leg.id) : null;
    return usable(bet) ? { bet, odds: bet.estOdds } : { gone: true };
  }
  if (leg.sport === 'f1') {
    const race = await once('f1', () => src.loadF1Race(now));
    const bet = race ? boardBets({ games: [], f1: race, loadedAt: now.toISOString() }, { now }).find(b => b.id === leg.id) : null;
    if (!usable(bet)) return { gone: true };
    if (Date.parse(bet.start) <= t && !(bet.waitsUntil > t)) return { started: true };
    return { bet, odds: bet.estOdds };
  }
  if (leg.live) {
    const data = await once(`live:${leg.sport}`, () => src.loadLive(now, LIVE_MIN_LIQUIDITY, { only: [leg.sport] }));
    const board = liveBets(data);
    const plain = board.bets.find(b => b.id === leg.id);
    // (The winner is never the game's own markets': the same bet without them.)
    if (plain?.kind === 'ml') return usable(plain) ? { bet: plain, odds: plain.estOdds } : { gone: true };
    const game = board.games.find(g => g.id === leg.gameId);
    const offers = game?.kambiId ? await once(`offers:live:${game.kambiId}`, () => src.loadGameOffers(game, { live: true }).catch(() => null)) : null;
    const rich = offers ? liveBets(data, { offersOf: g => (g.id === game.id ? offers : null) }).bets.find(b => b.id === leg.id) : null;
    const best = [plain, rich].filter(usable).sort((a, b) => b.estOdds - a.estOdds)[0];
    return best ? { bet: best, odds: best.estOdds } : { gone: true };
  }
  const games = await once(`league:${leg.sport}`, () => src.loadLeague(leg.sport, now));
  const game = games.find(g => g.id === leg.gameId);
  if (!game) return { gone: true };
  // (Listed only while it's to come: a game past its time is listed while ESPN says it hasn't begun, lateUntil.)
  if (Date.parse(game.startUtc) <= t && !(game.lateUntil > t)) return { started: true };
  const plain = boardBets({ games: [game] }, { now }).find(b => b.id === leg.id);
  // With the game's own markets and its players' numbers (Play reads them
  // when the game is opened): the house's richer prices. Only what can
  // change this pick is read (the same bet either way): the winner is never
  // the game's own markets' nor its players', and players only add their
  // own picks (a pick on the plain board isn't one).
  if (plain?.kind === 'ml') return usable(plain) ? { bet: plain, odds: plain.estOdds } : { gone: true };
  const [offers, players] = await Promise.all([
    game.kambiId ? once(`offers:${game.kambiId}`, () => src.loadGameOffers(game).catch(() => null)) : null,
    plain ? null : once(`players:${game.id}`, () => src.loadPlayers(game).catch(() => null))
  ]);
  const rich = offers || players?.length ? boardBets({ games: [{ ...game, ...(offers ? { offers } : {}), ...(players?.length ? { players } : {}) }] }, { now }).find(b => b.id === leg.id) : null;
  const best = [plain, rich].filter(usable).sort((a, b) => b.estOdds - a.estOdds)[0];
  return best ? { bet: best, odds: best.estOdds } : { gone: true };
}

// A slip as Play sends it to be placed: its shape and money first, then
// every pick's price. { ok: true } or { problem, moved?: [{ id, odds }] }.
export async function checkSlip(slip, wallet, deps, now = new Date(), reads = null) {
  const once = reads ?? useReads(deps);
  const legs = slip.legs;
  const n = legs.length;
  if (new Set(legs.map(l => l.id)).size !== n) return { problem: 'legs' };
  if (!['single', 'parlay', 'system'].includes(slip.mode)) return { problem: 'mode' };
  const want = slipSizes(slip.mode, n, slip.sizes);
  if (want.length !== slip.sizes.length || want.some((k, i) => k !== slip.sizes[i])) return { problem: 'sizes' };
  // No parlay boost and no free bets since 2026-10-21: a 台灣運彩 ticket
  // pays its odds, and is paid for in full (a slip bought before keeps its
  // boost when it settles).
  if (Number(slip.boost)) return { problem: 'boost' };
  if (slip.free) return { problem: 'free' };
  // The money: every combination at the stake.
  const checked = await Promise.all(legs.map(leg => housePick(leg, now, once).catch(() => ({ unread: true }))));
  if (checked.some(c => c.unread)) return { problem: 'unread' };
  const moved = [];
  legs.forEach((leg, i) => {
    const c = checked[i];
    if (c.gone || c.started) moved.push({ id: leg.id, odds: null });
    else if (!priceOk(Number(leg.odds), c.odds)) moved.push({ id: leg.id, odds: Math.round(c.odds * 100) / 100 });
  });
  if (moved.length) return { problem: 'moved', moved };
  // The house's rules on its own bets now (locks, parlay-only picks, the ticket's limits).
  const house = checked.map((c, i) => ({ ...c.bet, odds: Number(legs[i].odds) }));
  if (Math.abs(comboCount(house, slip.sizes) * slip.stake - slip.cost) > 0.01) return { problem: 'cost' };
  const errors = slipErrors({ mode: slip.mode, legs: house, sizes: slip.sizes, stake: slip.stake });
  if (errors.length) return { problem: errors[0] };
  // The picks as the slip keeps them: the house's own bets (what settling
  // reads), at the price asked; only the names and pictures the phone's.
  return { ok: true, legs: legs.map((leg, i) => keptLeg(leg, checked[i].bet)) };
}
const text = (v, max) => (typeof v === 'string' && v ? v.slice(0, max) : undefined);
export function keptLeg(leg, bet) {
  const own = legOf(bet);
  return { ...own, label: own.label ?? text(leg.label, 160), shortLabel: own.shortLabel ?? text(leg.shortLabel, 80), matchup: own.matchup ?? text(leg.matchup, 160), odds: Number(leg.odds), ...(text(leg.logo, 400) ? { logo: text(leg.logo, 400) } : {}) };
}

