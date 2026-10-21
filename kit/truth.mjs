// Quadra Truth: how the money in Quadra moves and how the house earns, in
// real numbers: the kit's (the pay, loans, VIP, overdrafts), Play's and
// Securities' own rules (mirrored below: those apps don't share their
// pricing modules), and this account's own record in the wallet. Pure
// functions, tested directly.
import { VIP, FREEBET, OVERDRAFT_RATE, moneySides } from '#kit/quadra.mjs';
import { MARKETS, CURRENCIES } from './stock-markets.mjs';
import { BASE_CUT } from './play-rules.mjs';
import { SLIP_RULES } from './play-odds.mjs';
import { DEFAULT_PENALTY } from './stock-account.mjs';

// ---- Quadra Play's prices (its lib/rules.mjs, odds.mjs) ---------------------
//
// Every two-way market (win, totals, lines) is priced at a 1.158 overround,
// as Taiwan Sports Lottery was measured pricing them: the chances behind
// the odds add up to 115.8%.
export const PLAY = {
  cut: BASE_CUT.twoWay,
  // No parlay boost, cash out or free bets since 2026-10-21 (台灣運彩 has none).
  // A slip whose whole prize is over NT$5,000 loses 20% income tax; a
  // member (online) account, which Play is, pays no 4‰ stamp duty. (Play's own rules.)
  taxFree: SLIP_RULES.taxFree,
  tax: SLIP_RULES.taxRate,
  // 刮刮樂's payback by the card's price (its lib/scratch.mjs).
  scratch: [[100, 0.63], [200, 0.65], [300, 0.66], [500, 0.7], [1_000, 0.74], [2_000, 0.75]],
  // Draw games (威力彩, 大樂透, 今彩539…) pay back about half of what's staked.
  draw: 0.5
};
// What the house keeps of a parlay of `legs` two-way picks, on average.
export const houseKeep = (legs = 1, cut = PLAY.cut) => 1 - cut ** -legs;

// ---- Quadra Securities' costs (the kit's market table, Taiwan) -----------------------------
// Read from the rules Securities itself trades by, so this page can't fall behind them.
const TW = MARKETS.TW;
export const STOCK = {
  commission: TW.commission.rate,
  commissionMin: TW.commission.min,
  // Securities transaction tax on a sale (ETFs 0.1%); a 當沖 (sold the day it was bought) pays half.
  tax: TW.sell.stock.tax,
  dayTradeTax: Date.now() < TW.sell.stock.dayTradeUntil ? TW.sell.stock.dayTrade : TW.sell.stock.tax,
  // Yearly margin interest on NT$.
  loanRate: CURRENCIES.TWD.loanRate,
  // A default on an overdraft: this share of what's owed.
  penalty: DEFAULT_PENALTY
};
// A Taiwan stock bought and sold for `amount`: commission both ways and
// the tax on the sale.
export function roundTrip(amount, { dayTrade = false } = {}) {
  const fee = Math.max(STOCK.commissionMin, Math.floor(amount * STOCK.commission));
  const tax = Math.floor(amount * (dayTrade ? STOCK.dayTradeTax : STOCK.tax));
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
