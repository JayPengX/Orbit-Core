// Quadra Truth: how the money in Quadra moves and how the house earns, in
// real numbers: the kit's (the pay, loans, overdrafts), Play's and
// Securities' own rules (mirrored below: those apps don't share their
// pricing modules), and this account's own record in the wallet. Pure
// functions, tested directly.
import { FREEBET, OVERDRAFT_RATE, moneySides } from '#kit/quadra.mjs';
import { MARKETS, CURRENCIES } from './stock-markets.mjs';
import { BASE_CUT } from './play-rules.mjs';
import { SLIP_RULES } from './play-odds.mjs';
import { DEFAULT_PENALTY } from './stock-account.mjs';
import { CARDS, CARD_ORDER, onSale, expectedReturn } from './play-scratch.mjs';

// ---- Quadra Play's prices (its lib/rules.mjs, odds.mjs) ---------------------
//
// Every two-way market (win, totals, lines) is priced at a 1.158 overround
// for baseball and about 1.17 for basketball and soccer, as Taiwan Sports
// Lottery's boards were measured (2026-10-20); 1X2 at 1.2.
export const PLAY = {
  cut: BASE_CUT.twoWay,
  cutHigh: 1.17,
  threeWay: BASE_CUT.threeWay,
  // No parlay boost, cash out or free bets since 2026-10-21 (台灣運彩 has none).
  // A slip whose whole prize is over NT$5,000 loses 20% income tax; a
  // member (online) account, which Play is, pays no 4‰ stamp duty. (Play's own rules.)
  taxFree: SLIP_RULES.taxFree,
  tax: SLIP_RULES.taxRate,
  // Draw games (威力彩, 大樂透, 今彩539…) pay back about 56% of what's staked
  // (their prize tables with no jackpot carried over, play-lottery.mjs).
  draw: 0.56
};
// 刮刮樂's payback by price, from the cards on sale now (Taiwan Lottery's
// own prize tables, play-scratch.mjs): [price, lowest, highest], cheapest
// first. Only prices a card is sold at (no NT$2,000 card since 2026-10).
export function scratchBacks(now = new Date()) {
  const by = new Map();
  for (const id of CARD_ORDER) {
    if (!onSale(id, now)) continue;
    const back = expectedReturn(id);
    const had = by.get(CARDS[id].price);
    by.set(CARDS[id].price, had ? [Math.min(had[0], back), Math.max(had[1], back)] : [back, back]);
  }
  return [...by].sort((a, b) => a[0] - b[0]).map(([price, [lo, hi]]) => [price, lo, hi]);
}
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
// Test slips the owner asked off the record (2026-10-20): his 1.08 single
// for NT$28,630 placed that morning, paid NT$30,920. Found by its wallet
// entries; the wallet keeps them (the balance doesn't move), the record
// (here and Play's account) leaves them out.
export const OFF_RECORD = [{ day: '2026-10-20', cost: 28_630, paid: 30_920 }];
export function offRecord(wallet) {
  const entries = (wallet?.entries || []).filter(e => e?.app === 'odds' && typeof e.id === 'string');
  const paid = new Map(entries.filter(e => e.id.startsWith('odds:payout-')).map(e => [e.id.slice(12), e.amount]));
  const out = new Set();
  for (const e of entries) {
    if (!e.id.startsWith('odds:stake-') || !Number.isFinite(new Date(e.t).getTime())) continue;
    const id = e.id.slice(11);
    const day = new Date(e.t).toISOString().slice(0, 10);
    if (OFF_RECORD.some(x => x.day === day && -e.amount === x.cost && paid.get(id) === x.paid)) out.add(id);
  }
  return out;
}
const slipOfId = id => /^odds:(?:stake|payout|refund|tax|plus\w*|cashout)-(.+)$/.exec(id || '')?.[1];

export function record(wallet) {
  const r = { staked: 0, won: 0, tickets: 0, prizes: 0, plusPaid: 0, od: 0, vip: 0, freeBets: 0 };
  const off = offRecord(wallet);
  // A lottery ticket's refund (a game no longer sold, lotto.js) is the ticket's, not a bet's.
  const lotto = new Set((wallet?.entries || []).filter(e => e?.kind === 'lottery' && typeof e.id === 'string').map(e => e.id.replace(/^odds:lotto-/, '')));
  for (const e of wallet?.entries || []) {
    const a = Number(e.amount) || 0;
    if (e.app === 'odds') {
      if (off.size && off.has(slipOfId(e.id))) continue;
      if (e.kind === 'refund' && lotto.has(slipOfId(e.id))) r.tickets -= a;
      else if (e.kind === 'stake' || e.kind === 'refund') r.staked -= a;
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
