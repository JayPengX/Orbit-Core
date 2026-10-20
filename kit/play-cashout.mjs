// Cash out: an open slip sold back to the house before its games are over,
// priced the way a sportsbook prices it (2026-10-11, the owner: "more
// realistically, greedy").
//
// A sportsbook buys a bet back at its own price for the other side: each
// undecided pick's fair chance now (the market's, its margin taken out, as
// the board prices from) cut by the house's margin on that pick (LEG_CUT:
// before its game, in play, where prices move fastest), then every way those
// picks can still land weighed by those chances, times what the slip would
// pay then (tax, the payout cap and its parlay boost included), less what
// the house keeps on top (CASHOUT_KEEP). So a parlay's
// offer drops with each pick still to play (the cut compounds), a slip all
// but won is still bought back under its payout, and nothing is ever worth
// more cashed out than held.
//
// It pauses, saying why (cashOutState), when a pick has no price now (its
// game in play with no live market, or its market locked), when two
// undecided picks are of one game (not independent), with too many
// undecided picks, and for a free bet's slip.
import { settleSlip } from '#kit/play-odds.mjs';

export const CASHOUT_KEEP = 0.03;
// The house's cut on each undecided pick's chance: before its game, in play.
export const LEG_CUT = { pre: 0.04, live: 0.06 };
// More undecided picks than this: no cash out (2^n ways to weigh).
export const CASHOUT_MAX_OPEN = 8;

// `chances`: one per leg, the fair chance now of each undecided leg (null
// when there's no price now), or { p, live } (live: its game is in play).
// -> { value: whole NT$ | null, reason: '' | 'noPrice' | 'sameGame' | 'tooMany' | 'done' | 'free', leg: index }
export function cashOutState(slip, chances, { keep = CASHOUT_KEEP } = {}) {
  if (!slip || slip.status !== 'open' || slip.recovered || !slip.legs?.length) return { value: null, reason: 'done' };
  // A free bet's slip is never sold back (its stake was never paid).
  if (slip.free) return { value: null, reason: 'free' };
  const open = [];
  slip.legs.forEach((leg, i) => leg.result || open.push(i));
  if (!open.length) return { value: null, reason: 'done' };
  if (open.length > CASHOUT_MAX_OPEN) return { value: null, reason: 'tooMany' };
  const games = open.map(i => slip.legs[i].gameId ?? `#${i}`);
  const twice = games.findIndex((g, k) => games.indexOf(g) !== k);
  if (twice >= 0) return { value: null, reason: 'sameGame', leg: open[twice] };
  const p = [];
  for (const i of open) {
    const c = chances[i];
    const fair = typeof c === 'object' && c ? c.p : c;
    if (!(fair > 0 && fair < 1)) return { value: null, reason: 'noPrice', leg: i };
    p.push(fair * (1 - (typeof c === 'object' && c?.live ? LEG_CUT.live : LEG_CUT.pre)));
  }
  const legs = slip.legs.map(leg => ({ gameId: leg.gameId, odds: leg.odds, result: leg.result }));
  let worth = 0;
  for (let won = 0; won < 1 << open.length; won++) {
    let chance = 1;
    open.forEach((i, k) => {
      const hit = won & (1 << k);
      chance *= hit ? p[k] : 1 - p[k];
      legs[i].result = hit ? 'won' : 'lost';
    });
    if (chance > 0) worth += chance * settleSlip({ legs, sizes: slip.sizes, stake: slip.stake, boost: slip.boost ?? 0 }).net;
  }
  const value = Math.floor(worth * (1 - keep) + 1e-6);
  return value >= 1 ? { value, reason: '' } : { value: null, reason: 'noPrice' };
}
// The price alone (null when paused).
export const cashOutValue = (slip, chances, opts) => cashOutState(slip, chances, opts).value;
