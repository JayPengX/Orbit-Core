// ---- price.js ----
// A slip placed in Quadra Play, checked before it counts (the owner's
// lock-down, 2026-10-12): every pick priced again here with Play's own code
// (the kit's play-sources and play-bets), read through the sports proxy (its
// cache and trims), and the slip's money checked against the pass's wallet.
//
// A pick passes when the house would sell it at that price now: its price
// is no better than the house's (with or without the game's own Kambi
// markets and players read, either of which Play may have shown), give or
// take a cent's rounding and 1% for a board a moment old. A pre-game pick's
// game must not have started (by this read, not the phone's clock); a live
// pick must be on the live board. A pick refused comes back with the
// house's price now (null: not on sale), and Play asks again at it.
//
// deps: { read(url, trim) -> JSON (throws on failure), pack(path) -> JSON }.
import * as src from './kit/play-sources.mjs';
import { boardBets, futureBets, liveBets } from './kit/play-bets.mjs';
import { comboCount, slipSizes, slipErrors } from './kit/play-odds.mjs';
import { LIVE_MIN_LIQUIDITY } from './kit/play-live.mjs';
import { plusMember, PLUS, freeBets } from './kit/plus.mjs';

// How much better than the house's a price may be: rounding to the cent,
// and a board read a moment before this one.
export const PRICE_SLACK = 0.01;
export const priceOk = (asked, house) => asked <= house * (1 + PRICE_SLACK) + 0.005;
// Free bets take odds of this or longer, a parlay's all together (Play's FREE_MIN_ODDS).
export const FREE_MIN_ODDS = 1.5;

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
    const data = await once(`live:${leg.sport}`, () => src.loadLive(now, LIVE_MIN_LIQUIDITY, { also: [leg.sport] }));
    const board = liveBets(data);
    const plain = board.bets.find(b => b.id === leg.id);
    const game = board.games.find(g => g.id === leg.gameId);
    const offers = game?.kambiId ? await once(`offers:live:${game.kambiId}`, () => src.loadGameOffers(game, { live: true }).catch(() => null)) : null;
    const rich = offers ? liveBets(data, { offersOf: g => (g.id === game.id ? offers : null) }).bets.find(b => b.id === leg.id) : null;
    const best = [plain, rich].filter(usable).sort((a, b) => b.estOdds - a.estOdds)[0];
    return best ? { bet: best, odds: best.estOdds } : { gone: true };
  }
  const games = await once(`league:${leg.sport}`, () => src.loadLeague(leg.sport, now));
  const game = games.find(g => g.id === leg.gameId);
  if (!game) return { gone: true };
  if (Date.parse(game.startUtc) <= t) return { started: true };
  const plain = boardBets({ games: [game] }, { now }).find(b => b.id === leg.id);
  // With the game's own markets and its players' numbers (Play reads them
  // when the game is opened): the house's richer prices.
  const [offers, players] = await Promise.all([
    game.kambiId ? once(`offers:${game.kambiId}`, () => src.loadGameOffers(game).catch(() => null)) : null,
    once(`players:${game.id}`, () => src.loadPlayers(game).catch(() => null))
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
  // The parlay boost: a member's (PLUS.odds.boost) or the usual; none on singles.
  const boost = Number(slip.boost) || 0;
  if (slip.mode === 'single' ? boost : boost > (plusMember(wallet, now.getTime()) ? PLUS.odds.boost : 1)) return { problem: 'boost' };
  // The money: every combination at the stake; a free bet's token unspent
  // and worth what it says, its odds long enough, the rest from the balance.
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
  const free = slip.free ? freeBets(wallet, now.getTime()).find(x => x.id === slip.free) : null;
  if (slip.free) {
    if (!free || Number(slip.freeValue) !== free.value) return { problem: 'free' };
    if (legs.reduce((x, l) => x * Number(l.odds), 1) < FREE_MIN_ODDS - 1e-9) return { problem: 'freeOdds' };
    if (Math.round(slip.stake - free.value) !== Math.round(slip.cost) || slip.cost < 0) return { problem: 'cost' };
  } else if (Math.abs(comboCount(house, slip.sizes) * slip.stake - slip.cost) > 0.01) return { problem: 'cost' };
  // (A free bet's stake is its token's value and the top-up: not the stake unit's.)
  const errors = slipErrors({ mode: slip.mode, legs: house, sizes: slip.sizes, stake: slip.stake }).filter(e => !(slip.free && (e === 'stakeUnit' || e === 'ticketMin')));
  if (errors.length) return { problem: errors[0] };
  return { ok: true };
}
