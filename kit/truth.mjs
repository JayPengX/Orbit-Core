// Quadra Truth: how the money in Quadra moves and how the house earns, in
// real numbers: the kit's (the pay, loans, VIP, overdrafts), Play's and
// Securities' own rules (mirrored below: those apps don't share their
// pricing modules), and this account's own record in the wallet. Pure
// functions, tested directly.
import { VIP, FREEBET, OVERDRAFT_RATE, moneySides } from '#kit/quadra.mjs';

// ---- Quadra Play's prices (its lib/rules.mjs, odds.mjs, cashout.mjs) ---------------------
//
// Every two-way market (win, totals, lines) is priced at a 1.158 overround,
// as Taiwan Sports Lottery was measured pricing them: the chances behind
// the odds add up to 115.8%.
export const PLAY = {
  cut: 1.158,
  // The parlay boost on the winnings of a winning combination, by its size
  // (3 picks and up), the same for everyone.
  parlayBoost: [0, 0, 0, 0.05, 0.08, 0.12, 0.15, 0.2],
  // Cash out: each undecided pick's chance cut by the house's margin (before
  // its game, in play), then this kept of the slip's worth.
  cashOutLegCut: { pre: 0.04, live: 0.06 },
  cashOutKeep: 0.03,
  // Free bets: every pick at these odds or longer.
  freeMinOdds: 1.5,
  // A slip whose whole prize is over NT$5,000 loses 20% income tax; a
  // member (online) account, which Play is, pays no 4‰ stamp duty.
  taxFree: 5_000,
  tax: 0.2,
  // 刮刮樂's payback by the card's price (its lib/scratch.mjs).
  scratch: [[100, 0.63], [200, 0.65], [300, 0.66], [500, 0.7], [1_000, 0.74], [2_000, 0.75]],
  // Draw games (威力彩, 大樂透, 今彩539…) pay back about half of what's staked.
  draw: 0.5
};
// What the house keeps of a parlay of `legs` two-way picks, on average.
export const houseKeep = (legs = 1, cut = PLAY.cut) => 1 - cut ** -legs;
// The same with the parlay boost on a slip at decimal odds `odds` (the
// product), boost ×`x` (1 by default).
export function boostedKeep(legs, odds, x = 1, cut = PLAY.cut) {
  const boost = (PLAY.parlayBoost[Math.min(legs, PLAY.parlayBoost.length - 1)] || 0) * x;
  return 1 - (1 + (odds - 1) * (1 + boost)) / (odds * cut ** legs);
}
// What a free bet of `face` is worth to the bettor on average, staked on a
// single at `odds`: only the winnings come back, at the house's chances.
export const freeBetWorth = (face, odds = 2, cut = PLAY.cut) => Math.round((face * (odds - 1)) / (odds * cut));

// ---- Quadra Securities' costs (its lib/markets.mjs, Taiwan) -----------------------------
export const STOCK = {
  commission: 0.001425,
  commissionMin: 20,
  // Securities transaction tax on a sale (ETFs 0.1%).
  tax: 0.003,
  // Yearly margin interest on NT$.
  loanRate: 0.065,
  // A default on an overdraft: this share of what's owed.
  penalty: 0.07
};
// A Taiwan stock bought and sold for `amount`: commission both ways and
// the tax on the sale.
export function roundTrip(amount) {
  const fee = Math.max(STOCK.commissionMin, Math.floor(amount * STOCK.commission));
  const tax = Math.floor(amount * STOCK.tax);
  return { fee: fee * 2, tax, total: fee * 2 + tax, share: (fee * 2 + tax) / amount };
}

// ---- This account's own record -------------------------------------------------------
//
// From the wallet: Play's bets (stakes less refunds, and what they paid)
// and its lottery tickets and prizes, the old Plus fees (less its refund),
// overdraft interest, and the three sides of the money (the kit's
// moneySides).
export function record(wallet) {
  const r = { staked: 0, won: 0, tickets: 0, prizes: 0, plusPaid: 0, od: 0, vip: 0, freeBets: 0 };
  for (const e of wallet?.entries || []) {
    const a = Number(e.amount) || 0;
    if (e.app === 'odds') {
      if (e.kind === 'stake' || e.kind === 'refund') r.staked -= a;
      else if (e.kind === 'payout' || e.kind === 'cashout' || e.kind === 'plusboost' || e.kind === 'tax') r.won += a;
      else if (e.kind === 'lottery') r.tickets -= a;
      else if (e.kind === 'prize') r.prizes += a;
    } else if (e.app === 'eco') {
      if (e.kind === 'plus' || e.kind === 'plusrefund') r.plusPaid -= a;
      else if (e.kind === 'od') r.od -= a;
      else if (e.kind === 'vip') r.vip += a;
      else if (e.kind === 'freebet') r.freeBets += Number(e.note) > 0 && Number(e.note) <= FREEBET.max ? Number(e.note) : 0;
    }
  }
  for (const k of Object.keys(r)) r[k] = Math.round(r[k]);
  const back = (paid, out) => (paid > 0 ? out / paid : null);
  return { ...r, betBack: back(r.staked, r.won), ticketBack: back(r.tickets, r.prizes), sides: moneySides(wallet) };
}

// The overdraft's yearly cost: OVERDRAFT_RATE a month, compounded.
export const overdraftYear = () => (1 + OVERDRAFT_RATE) ** 12 - 1;
// VIP cashback against the house's cut on the same stakes: what comes back
// for every NT$100 the house keeps.
export const vipShare = tier => tier.back / houseKeep(1);
export { VIP };
