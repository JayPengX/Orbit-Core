// What a Taiwan bank and broker offer on money and shares that sit still,
// with their real terms (account.mjs records them as events in the log).
//
// 定存 (time deposits): NT$ locked for a term at the bank's posted fixed
// rate (Bank of Taiwan's board, 2026), paid in full at maturity. Broken
// early, a bank pays 80% of the rate for the term actually held (the
// longest posted term it covers), and nothing under a month. At maturity the
// principal comes back to cash, or rolls over at the rate posted then
// (自動轉存, principal only; the interest is paid out).
//
// 借券出借 (securities lending): Taiwan stocks and ETFs held whole lots,
// settled and not bought on margin, lent through the broker at a yearly
// rate the lender asks (0.01% to 16%, 凱基 有價證券借貸); it lends only when
// a borrower takes it, and borrowers pay the going rate (LEND_RATE), so an
// ask above that finds none. The fee accrues day by day on that day's close
// (TWSE 借券 問答集: 逐日逐筆, 每日收盤價 × 借券數量 × 費率, 算頭不算尾, /365)
// and is paid when the shares come back (於還券了結後收付). The broker keeps
// LEND_CUT of it. Lent shares can't be sold; a recall returns them in
// LEND_RECALL business days. A contract runs six months, renewed at most
// twice by six months each (問答集: 到期可以續借，但僅限二次) where the lender
// agrees to renewals.
//
// Interest and lending fees are income: a payment over NT$20,000 has 10%
// withheld (扣繳), and one of NT$20,000 or more 2.11% supplementary health
// premium (二代健保: a lending fee is 租金收入, 健保署 實務手冊; only 交割,
// 標借, 信託 and 當沖券差 借券 are exempt).
import { NHI_THRESHOLD, nhiPremium } from '#kit/stock-markets.mjs';
import { isTradingDay } from '#kit/stock-holidays.mjs';

const DAY = 86_400_000;
const YEAR_MS = 365 * DAY;
const TPE = 8 * 3_600_000;
// Taiwan midnight of a moment's day.
const dayStart = t => Math.floor((t + TPE) / DAY) * DAY - TPE;

// Bank of Taiwan's posted fixed rates (一般, under NT$5 million), as the
// central bank's 牌告利率資訊網 lists them on 2026-10-18.
export const TD_TERMS = [
  { months: 1, rate: 0.01225 },
  { months: 3, rate: 0.0129 },
  { months: 6, rate: 0.01465 },
  { months: 9, rate: 0.0158 },
  { months: 12, rate: 0.017 }
];
export const TD_MIN = 10_000;
export const TD_EARLY = 0.8;
export const tdRate = months => TD_TERMS.find(x => x.months === months)?.rate ?? null;

// The same day `n` Taiwan months later (the month's last day when it's short).
export function addMonths(t, n) {
  const d = new Date(t + TPE);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + n;
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return Date.UTC(y, m, Math.min(d.getUTCDate(), last), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds(), d.getUTCMilliseconds()) - TPE;
}

// Whole months from `from` to `to`.
export function fullMonths(from, to) {
  let n = 0;
  while (addMonths(from, n + 1) <= to) n++;
  return n;
}

// Income tax withheld and the health premium on one payment of interest or
// a lending fee.
export function incomeTaxes(gross) {
  const big = gross > NHI_THRESHOLD;
  const withheld = big ? Math.round(gross * 0.1) : 0;
  const nhi = nhiPremium(gross);
  return { withheld, nhi, net: gross - withheld - nhi };
}

// A deposit's interest if closed at `at`: in full at or after maturity;
// before it, 80% of the posted rate for the longest term held, for the time
// held; under a month, nothing.
export function tdInterest(td, at) {
  if (at >= td.ends) return { gross: Math.round((td.amount * td.rate * td.months) / 12), early: false };
  const held = fullMonths(td.t, at);
  const term = [...TD_TERMS].reverse().find(x => x.months <= held);
  if (!term) return { gross: 0, early: true };
  return { gross: Math.round((td.amount * term.rate * TD_EARLY * (at - td.t)) / YEAR_MS), early: true };
}

// The going rate borrowers pay now, the most an offer can ask and still lend.
export const LEND_RATE = { stock: 0.012, etf: 0.006 };
export const LEND_RATE_MIN = 0.0001;
export const LEND_RATE_MAX = 0.16;
export const LEND_CUT = 0.3;
export const LEND_LOT = 1_000;
export const LEND_RECALL = 3;
export const LEND_TERM_MONTHS = 6;
export const LEND_RENEWALS = 2;
// When a contract ends by itself: six months on, twelve or eighteen with
// its renewals (`renew`: the lender agreed to them).
export const lendEnds = lend => addMonths(lend.t, LEND_TERM_MONTHS * (1 + (lend.renew ? LEND_RENEWALS : 0)));
export const lendable = (market, kind) => market === 'TW' && Boolean(LEND_RATE[kind]);

// `n` Taiwan business days after `t` (a recall's return day): weekends and
// TWSE's holidays skipped (TWSE 借券 Q&A: recalls count 營業日).
export function addWeekdays(t, n) {
  let x = t;
  for (let left = n; left > 0; ) {
    x += DAY;
    if (isTradingDay('TW', new Date(x + TPE).toISOString().slice(0, 10))) left--;
  }
  return x;
}

// The fee for a lending contract from its start to `until`: gross, the
// broker's cut, the taxes, what's paid. `closes`: the shares' daily closes
// ([{ t, c }], oldest first): each day lent (its first counted, its last
// not) at that day's close, or the last before it (the lending price before
// any); without them, the price when lent for the whole time.
export function lendFee(lend, until, closes = null) {
  let value;
  if (Array.isArray(closes)) {
    value = 0;
    let price = lend.price;
    let i = 0;
    const days = Math.max(0, Math.round((dayStart(until) - dayStart(lend.t)) / DAY));
    for (let d = 0, day = dayStart(lend.t); d < days; d++, day += DAY) {
      while (i < closes.length && closes[i].t < day + DAY) {
        if (closes[i].c > 0) price = closes[i].c;
        i++;
      }
      value += lend.qty * price * DAY;
    }
  } else value = lend.qty * lend.price * Math.max(0, until - lend.t);
  const gross = Math.max(0, Math.round((value * lend.rate) / YEAR_MS));
  const cut = Math.round(gross * LEND_CUT);
  const taxes = incomeTaxes(gross - cut);
  return { gross, cut, ...taxes };
}
