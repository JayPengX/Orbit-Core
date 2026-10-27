// The practice brokerage account. Practice money only.
//
// The account is a log: immutable events (deposits, exchanges, fills,
// dividends, splits, loans) plus orders, whose status moves forward (open →
// filled, cancelled or rejected). Everything else (cash in each currency,
// holdings, average costs, loans with their interest, what was paid in fees
// and taxes) is worked out by replaying the log, so two devices' copies merge
// by uniting their logs and nothing can count twice.
//
// Positions are signed: a negative quantity is a short sale (shares
// borrowed and sold, bought back later), which accrues a borrowing fee and
// counts as owed in the maintenance ratio.
import {
  BASE,
  sessionEnd,
  collateralRate,
  CLOSED_FX_MULTIPLIER,
  MARGIN_CALL,
  MARGIN_LIQUIDATE,
  MARGIN_RESTORE,
  SHORT_FEE,
  SHORT_INITIAL,
  currencyInfo,
  dealPrice,
  divPayDate,
  settleDate,
  marketFill,
  isOddLot,
  oddLotOpen,
  CASH_RATE,
  onTick,
  priceLimits,
  tickSize,
  dividendTaxes,
  nhiPremium,
  isOpen,
  isTradable,
  isShortable,
  isEmerging,
  isFullDelivery,
  cbMaturity,
  qtyStep,
  roundCash,
  roundQty,
  tradeCosts,
  lotProblem,
  mixedLot,
  localDayOf,
  earlyCloseAt,
  isSubBrokered,
  fractional,
  US_FRACTION,
  limitOnly,
  cnBoard,
  usSession,
  usExtendedEnd,
  fundCutoff,
  FUND_NAV_WAIT,
  futureOf,
  futureExpiry,
  FUT_MARGIN,
  SSF_RATE,
  OPTION,
  optionExpiry,
  optionIntrinsic,
  optWriteMargin
} from '#kit/stock-markets.mjs';
import { nextTradingStart, isTradingDay } from '#kit/stock-holidays.mjs';
import { twDay } from '#kit/format.mjs';
import { TD_MIN, tdRate, addMonths, tdInterest, incomeTaxes, lendable, LEND_RATE, LEND_RATE_MIN, LEND_RATE_MAX, LEND_LOT, LEND_RECALL, lendEnds, addWeekdays, lendFee } from '#kit/stock-savings.mjs';
import { BONDS, couponDates } from '#kit/stock-bonds.mjs';
import { accessProblem, accessState, leverageOf, fxCapProblem, ACCESS_SINCE } from '#kit/stock-access.mjs';
import { creditAccount, creditUsed, dayTradeBuyFirst, dayTradeSellFirst, dayTradeRoom, termDue, afterHours, closingAuction, shortDeposit, SHORT_HANDLING, SHORT_INTEREST } from '#kit/stock-credit.mjs';

export const ACCOUNT_VERSION = 1;
// Every new account opens with the same NT$100,000 (Orbit's base amount);
// the range below is only what an older, chosen start can be.
// What Securities itself gave a new account before Orbit paid the opening money.
export const START_AMOUNT = 100_000;
export const MIN_START = 10_000;
export const MAX_START = 1_000_000_000;
const YEAR_MS = 365 * 86_400_000;
const EPS = 1e-9;
// A buy order waiting for its price holds this much more than its estimate
// (a market order placed while the market is shut can open higher).
const RESERVE_BUFFER = 0.03;
const FRESH_BUFFER = 0.005;

export function randomId() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID().replace(/-/g, '').slice(0, 16);
  return Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10);
}

// Taiwan date (YYYY-MM-DD) of a moment.
export const taipeiDay = twDay;

// start 0: an account funded by the Orbit pool alone (a pass that got its
// opening money from Orbit itself).
export function newAccount(start = START_AMOUNT, now = Date.now(), id = randomId()) {
  const amount = Math.round(Number(start));
  if (!(amount === 0 || (amount >= MIN_START && amount <= MAX_START))) throw new Error('start amount out of range');
  return {
    v: ACCOUNT_VERSION,
    id,
    created: now,
    events: amount ? [{ id: 'deposit:start', type: 'deposit', t: now, currency: BASE, amount }] : [],
    orders: [],
    snapshots: {},
    watch: {},
    income: { since: now }
  };
}

const byTime = (a, b) => a.t - b.t || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
const add = (map, key, amount) => (map[key] = (map[key] || 0) + amount);

// ---- Replay ------------------------------------------------------------------

function accrue(s, t) {
  // NT$ cash earns the demand-deposit rate.
  // (Not the futures account's: a futures broker pays none on it.)
  const cash = (s.cash[BASE] || 0) - (s.futSplit ? s.futCash : 0);
  if (t > s.cashLast && cash > 0) s.cashInterest += (cash * CASH_RATE * (t - s.cashLast)) / YEAR_MS;
  s.cashLast = Math.max(s.cashLast, t);
  for (const p of Object.values(s.positions)) {
    if (p.qty < 0 && t > p.feeLast && !p.credit && !p.dayShort && p.kind !== 'opt') p.borrowFee += (-p.cost * SHORT_FEE * (t - p.feeLast)) / YEAR_MS;
    // 融券: the deposit and sale money held earn the account interest.
    if (p.qty < 0 && t > p.feeLast && p.credit) p.shortInterest = (p.shortInterest || 0) + (((p.shortDeposit || 0) + (p.shortHeld || 0)) * SHORT_INTEREST * (t - p.feeLast)) / YEAR_MS;
    p.feeLast = Math.max(p.feeLast ?? t, t);
  }
  for (const loan of Object.values(s.loans)) {
    if (t > loan.last && loan.balance > EPS) {
      const interest = (loan.balance * loan.rate * (t - loan.last)) / YEAR_MS;
      loan.balance += interest;
      loan.interest += interest;
    }
    loan.last = Math.max(loan.last, t);
  }
}

// The state replay starts from.
function startState(account) {
  return {
    cash: { [BASE]: 0 },
    positions: {},
    loans: {},
    deposits: 0,
    // In NT$ at each event's own rate.
    paid: { commission: 0, tax: 0, fee: 0, fx: 0, withheld: 0, nhi: 0, borrow: 0, penalty: 0, lendCut: 0 },
    // Time deposits (定存) open now, and shares lent (借券出借), by event id.
    tds: {},
    lent: {},
    lendIncome: 0,
    // 新股申購 (stock-ipo.mjs) by issue: its application and what came of it ('drawing', 'won', 'lost').
    ipos: {},
    // The futures account's money (期貨保證金專戶, futx): part of the NT$
    // cash, in its own pocket from FUT_SPLIT on (futSplit).
    futCash: 0,
    futSplit: (account?.created ?? 0) >= FUT_SPLIT,
    dividends: 0,
    // Bank interest on NT$ cash: accrued so far, and paid out (net).
    cashInterest: 0,
    cashLast: account?.created ?? 0,
    interestEarned: 0,
    realized: 0,
    closed: [],
    held: {},
    log: []
  };
}
// One event applied (after accrue to its moment).
function applyEvent(s, e) {
    switch (e.type) {
      // 違約金: charged on a default (an overdraft sold for).
      case 'penalty':
        add(s.cash, e.currency, -e.amount);
        s.paid.penalty += e.amount * (e.twd || 1);
        break;
      case 'td':
        add(s.cash, BASE, -e.amount);
        s.tds[e.id] = e;
        break;
      case 'tdend':
        if (!s.tds[e.td]) break;
        delete s.tds[e.td];
        add(s.cash, BASE, e.amount + e.net);
        s.interestEarned += e.net;
        s.paid.withheld += e.withheld || 0;
        s.paid.nhi += e.nhi || 0;
        break;
      case 'lend':
        s.lent[e.id] = { ...e };
        break;
      case 'recall':
        if (s.lent[e.lend]) s.lent[e.lend].back = e.back;
        break;
      case 'lendpay':
        if (!s.lent[e.lend]) break;
        delete s.lent[e.lend];
        add(s.cash, BASE, e.net);
        s.lendIncome += e.net;
        s.paid.lendCut += e.cut || 0;
        s.paid.withheld += e.withheld || 0;
        s.paid.nhi += e.nhi || 0;
        break;
      case 'deposit':
        add(s.cash, e.currency, e.amount);
        s.deposits += e.amount * (e.twd || 1);
        break;
      // 入金 (+) or 出金 (−) between the NT$ cash and the futures account.
      case 'futx':
        if (s.futSplit) s.futCash = Math.max(0, s.futCash + e.amount);
        break;
      case 'fx':
        add(s.cash, e.from, -e.amount);
        add(s.cash, e.to, e.received);
        s.paid.fx += e.spreadTWD || 0;
        break;
      case 'fill':
        applyFill(s, e);
        break;
      // 新股申購: the shares' price and the fee held at applying; a loss's
      // money back after the draw (the fee kept); a win's shares on the
      // listing day at the offer price (already paid), with its NT$50.
      case 'ipo': {
        const key = `${e.code}:${e.draw}`;
        if (s.ipos[key]) break;
        add(s.cash, BASE, -(Math.round(e.price * e.qty) + e.fee));
        s.paid.fee += e.fee;
        s.ipos[key] = { ...e, state: 'drawing' };
        break;
      }
      case 'ipoback': {
        const app = s.ipos[`${e.code}:${e.draw}`];
        if (!app || app.state !== 'drawing') break;
        add(s.cash, BASE, e.amount);
        app.state = 'lost';
        break;
      }
      case 'ipowin': {
        const app = s.ipos[`${e.code}:${e.draw}`];
        if (!app || app.state !== 'drawing') break;
        const total = Math.round(app.price * app.qty);
        applyFill(s, { id: e.id, t: e.t, type: 'fill', side: 'buy', symbol: app.symbol, name: app.name, kind: 'stock', market: 'TW', currency: BASE, qty: app.qty, price: app.price, gross: total, total, commission: 0, tax: 0, fee: 0 });
        // (Paid at applying: the fill's money given back, its fee taken.)
        add(s.cash, BASE, total - e.fee);
        s.paid.fee += e.fee;
        app.state = 'won';
        break;
      }
      // A split: the shares held, the 融資 shares among them and the shares
      // lent out (借券: the borrower returns the split's number, TWSE's
      // 借券 rules for 除權) all times the ratio (a lent lot's price over it: its fee the same); what
      // was paid is the same.
      // A Taiwan 配股 (`par`: its shares' NT$10 face value) gives whole shares
      // only: the fraction is paid in cash at par, and the new shares at par
      // are dividend income, NHI's 2.11% from NT$20,000 (公司法 §240,
      // 二代健保 股利所得).
      case 'split': {
        const p = s.positions[e.symbol];
        if (p && e.par && p.qty > 0) {
          const whole = Math.floor(p.qty * e.ratio + EPS);
          add(s.cash, BASE, (e.cash || 0) - (e.nhi || 0));
          s.dividends += e.cash || 0;
          s.paid.nhi += e.nhi || 0;
          if (p.marginQty > 0) p.marginQty = Math.floor(p.marginQty * e.ratio + EPS);
          if (p.last > 0) p.last /= e.ratio;
          p.qty = whole;
        } else if (p) {
          p.qty *= e.ratio;
          if (p.marginQty > 0) p.marginQty *= e.ratio;
          if (p.last > 0) p.last /= e.ratio;
        }
        for (const l of Object.values(s.lent)) if (l.symbol === e.symbol && l.t < e.t) [l.qty, l.price] = [l.qty * e.ratio, l.price / e.ratio];
        break;
      }
      case 'interest':
        add(s.cash, e.currency, e.net);
        s.interestEarned += e.net;
        s.paid.withheld += e.withheld || 0;
        s.paid.nhi += e.nhi || 0;
        break;
      case 'div':
        add(s.cash, e.currency, e.net);
        s.dividends += e.net * e.twd;
        s.paid.withheld += e.withheld * e.twd;
        s.paid.nhi += (e.nhi || 0) * e.twd;
        break;
      case 'borrow': {
        const loan = (s.loans[e.currency] ||= { currency: e.currency, balance: 0, rate: e.rate, interest: 0, last: e.t, borrowed: 0, repaid: 0 });
        loan.balance += e.amount;
        loan.borrowed += e.amount;
        loan.rate = e.rate;
        add(s.cash, e.currency, e.amount);
        // A purchase's own loan (融資): what of the holding is financed.
        if (e.symbol && s.positions[e.symbol]) {
          const p = s.positions[e.symbol];
          // 融資's six-month term runs from the first loan on the holding.
          if (!(p.financed > 0)) Object.assign(p, { loanSince: e.t, loanExt: 0, loanDue: termDue(e.t) });
          p.financed = (p.financed || 0) + e.amount;
        }
        break;
      }
      // 展延: the term of a 融資 holding or a 融券 short, six months more.
      case 'extend': {
        const p = s.positions[e.symbol];
        if (p?.qty > 0 && p.loanDue) {
          p.loanExt = (p.loanExt || 0) + 1;
          p.loanDue = termDue(p.loanSince, p.loanExt);
        } else if (p?.qty < 0 && p.shortDue) {
          p.shortExt = (p.shortExt || 0) + 1;
          p.shortDue = termDue(p.first, p.shortExt);
        }
        break;
      }
      case 'repay': {
        const loan = s.loans[e.currency];
        if (!loan) break;
        loan.balance -= e.amount;
        loan.repaid += e.amount;
        if (loan.balance < 10 ** -currencyInfo(e.currency).digits / 2) loan.balance = 0;
        add(s.cash, e.currency, -e.amount);
        if (e.symbol && s.positions[e.symbol]) {
          const p = s.positions[e.symbol];
          p.financed = Math.max(0, (p.financed || 0) - e.amount);
          // Paid off (現金償還, or the rest from a sale's cash): its shares are 現股 now.
          if (p.financed < 0.5) {
            delete p.loanDue;
            p.marginQty = 0;
          }
        }
        break;
      }
    }
    s.log.push(e);
}

// Cash, holdings and loans as of `now`, and where the money went.
export function replay(account, now = Date.now()) {
  const s = startState(account);
  for (const e of [...(account?.events || [])].sort(byTime)) {
    // The account as it stood at `now`: later events (a dividend still to be
    // paid, or a moment in the past being checked) don't count yet.
    if (e.t > now) break;
    if (!s.futSplit && e.t >= FUT_SPLIT) splitFutures(s);
    accrue(s, e.t);
    applyEvent(s, e);
  }
  if (!s.futSplit && now >= FUT_SPLIT) splitFutures(s);
  accrue(s, now);
  for (const [cur, v] of Object.entries(s.cash)) if (Math.abs(v) < EPS) s.cash[cur] = 0;
  // Dividends past their ex-date and not paid yet: owed to the account (the
  // price already dropped by them), in NT$ at their own rate.
  s.receivable = (account?.events || []).filter(e => e.type === 'div' && e.ex != null && e.ex <= now && e.t > now).reduce((sum, e) => sum + e.net * (e.twd || 1), 0);
  return s;
}

// ---- The futures account (期貨保證金專戶) ----
// From FUT_SPLIT, TAIFEX futures and options trade from their own account's
// money, as a futures broker keeps it: moved in and out (入金, 出金: `futx`
// events) from the NT$ cash, margins held there, premiums, costs, gains and
// losses paid in and out of it. It stays part of the NT$ cash (worth, the
// pool), a pocket of it: the rest is what stocks and the rest trade from.
// A loss past what's in it comes out of the rest (the broker claims it).
// An account from before: at FUT_SPLIT, the margin its futures and written
// options held then moved in (splitFutures), so they carry on as they were.
export const FUT_SPLIT = ACCESS_SINCE;
// (No accrual step of its own: that would compound the loans' interest once more.)
function splitFutures(s) {
  s.futSplit = true;
  s.futCash = Math.max(0, Math.min(s.cash[BASE] || 0, futMarginHeld(s)));
}
// Money in or out of the futures account with a TAIFEX trade.
const futFlow = (s, e, amount) => {
  if (s.futSplit && e.market === 'TAIFEX') s.futCash = Math.max(0, s.futCash + amount);
};

function applyFill(s, e) {
  if (e.kind === 'fut') return applyFutFill(s, e);
  const twd = e.twd || 1;
  s.paid.commission += e.commission * twd;
  s.paid.tax += e.tax * twd;
  s.paid.fee += e.fee * twd;
  const held = (s.held[e.symbol] ||= { first: e.t, realized: 0, bought: 0, sold: 0 });
  held.market ||= e.market;
  const buy = e.side === 'buy';
  add(s.cash, e.currency, buy ? -e.total : e.total);
  futFlow(s, e, buy ? -e.total : e.total);
  if (buy) held.bought += e.total * twd;
  else held.sold += e.total * twd;
  const p = (s.positions[e.symbol] ||= {
    symbol: e.symbol, name: e.name, kind: e.kind, market: e.market, currency: e.currency, qty: 0, cost: 0, costTWD: 0, first: e.t, borrowFee: 0, feeLast: e.t
  });
  p.last = e.price;
  // (A written option's margin a contract: its latest fill's.)
  if (e.kind === 'opt' && e.im > 0) p.im = e.im;
  let left = e.qty;
  // First, whatever this trade closes: a sale of shares held, or a purchase
  // that buys back a short.
  if (Math.abs(p.qty) > EPS && (p.qty > 0) !== buy) {
    const close = Math.min(left, Math.abs(p.qty));
    const share = close / Math.abs(p.qty);
    const cost = p.cost * share;
    const costTWD = p.costTWD * share;
    const part = (e.total * close) / e.qty;
    let realizedLocal = buy ? -cost - part : part - cost;
    let realized = buy ? -costTWD - part * twd : part * twd - costTWD;
    if (buy && (p.shortDeposit || p.shortHeld)) {
      // A 融券 bought back: that part's deposit and held sale money come back,
      // with their interest (融券利息, the fraction of a dollar dropped).
      const back = (p.shortDeposit + p.shortHeld) * share;
      p.shortDeposit -= p.shortDeposit * share;
      p.shortHeld -= p.shortHeld * share;
      add(s.cash, e.currency, back);
      const f = 10 ** currencyInfo(e.currency).digits;
      const earned = Math.floor(((p.shortInterest || 0) * share * f) + 1e-9) / f;
      p.shortInterest = (p.shortInterest || 0) * (1 - share);
      if (earned > 0) {
        add(s.cash, e.currency, earned);
        s.interestEarned += earned * twd;
        realizedLocal += earned;
        realized += earned * twd;
      }
    }
    if (buy) {
      // Buying back pays the borrowing fee accrued on that part.
      const fee = p.borrowFee * share;
      p.borrowFee -= fee;
      add(s.cash, e.currency, -fee);
      s.paid.borrow += fee * twd;
      realizedLocal -= fee;
      realized -= fee * twd;
    }
    s.realized += realized;
    held.realized += realized;
    s.closed.push({
      id: e.id, t: e.t, symbol: e.symbol, name: e.name, market: e.market, kind: e.kind, currency: e.currency, qty: close, short: buy,
      proceeds: part, cost, realized, realizedLocal, pct: costTWD ? realized / Math.abs(costTWD) : 0, held: e.t - p.first
    });
    p.qty += buy ? close : -close;
    p.cost -= cost;
    p.costTWD -= costTWD;
    left -= close;
    // A sale's 融資 shares (融資賣出): the ones it repaid; never more than are left.
    if (!buy && p.marginQty > 0) p.marginQty = Math.min(p.qty, Math.max(0, p.marginQty - (e.marginQty || 0)));
  }
  // Then what it opens or adds to: shares bought, or shares sold short.
  if (left > EPS) {
    const part = (e.total * left) / e.qty;
    if (Math.abs(p.qty) <= EPS) {
      p.first = e.t;
      p.feeLast = e.t;
      if (!buy && e.credit) Object.assign(p, { credit: true, shortExt: 0, shortDue: termDue(e.t), shortDeposit: 0, shortHeld: 0 });
      if (!buy && e.dayShort) p.dayShort = true;
    }
    // 融券: the seller's 90% deposit and the sale money stay with the broker.
    if (!buy && e.credit) {
      const deposit = shortDeposit((e.gross * left) / e.qty);
      p.shortDeposit = (p.shortDeposit || 0) + deposit;
      p.shortHeld = (p.shortHeld || 0) + part;
      add(s.cash, e.currency, -(deposit + part));
    }
    p.qty += buy ? left : -left;
    p.cost += buy ? part : -part;
    p.costTWD += (buy ? part : -part) * twd;
    // Bought with 融資: these shares are the loan's collateral (融資 shares,
    // sold only with 融資賣出; the rest are 現股, the account's own).
    if (buy && e.financed > 0) p.marginQty = (p.marginQty || 0) + left;
  }
  if (Math.abs(p.qty) <= Math.min(qtyStep(p.kind), US_FRACTION) / 2) delete s.positions[e.symbol];
}

// ---- Futures (期貨) ----
// A future's margins a contract, NT$ [initial, maintenance]: TAIFEX's on its
// quote, else the kit's table (a stock's future: SSF_RATE of its value at `price`).
export function futMargin(symbol, quote = null, price = quote?.price) {
  if (quote?.margin) return quote.margin;
  const f = futureOf(symbol);
  if (FUT_MARGIN[f?.code]) return FUT_MARGIN[f.code];
  return f?.stock && price > 0 ? SSF_RATE.map(r => Math.round(price * f.mult * r)) : [0, 0];
}
// How many of an order's contracts open a position (the rest close what's held).
export function futOpening(held, side, qty) {
  const dir = side === 'buy' ? 1 : -1;
  return held * dir < 0 ? Math.max(0, qty - Math.abs(held)) : qty;
}
// How many of a sale of `qty` options write new ones (the rest sell what's
// held and not already promised to an open sale).
export function optWriting(account, s, symbol, qty, avail = available(account, s)) {
  return Math.max(0, qty - Math.max(0, avail.qty[symbol] || 0));
}
// The margin buying back `qty` of a written option frees, NT$.
export function optFreed(s, symbol, qty) {
  const p = s.positions[symbol];
  return p?.kind === 'opt' && p.qty < 0 ? Math.min(qty, -p.qty) * (p.im || 0) : 0;
}
// The margin the account's futures and written options hold, NT$ (each at
// its latest fill's margin a contract).
export const futMarginHeld = s =>
  Object.values(s.positions).reduce((sum, p) => sum + (p.kind === 'fut' ? Math.abs(p.qty) * (p.im || futMargin(p.symbol, null, p.last ?? p.mark)[0]) : p.kind === 'opt' && p.qty < 0 ? -p.qty * (p.im || optWriteMargin(p.symbol, p.last || 0, 0)) : 0), 0);
// A futures fill: no contract value changes hands, only the costs; what
// it closes pays its gain or loss since the position's price (`mark`, its
// average), in NT$ at the contract's NT$ a point. `entry` is the same
// average, kept for what's shown. `im`: the initial margin a contract it
// holds (the latest order's).
function applyFutFill(s, e) {
  const f = futureOf(e.symbol);
  const mult = f?.mult || 1;
  const buy = e.side === 'buy';
  const costs = buy ? e.total - e.gross : e.gross - e.total;
  s.paid.commission += e.commission || 0;
  s.paid.tax += e.tax || 0;
  s.paid.fee += e.fee || 0;
  add(s.cash, BASE, -costs);
  futFlow(s, e, -costs);
  const held = (s.held[e.symbol] ||= { first: e.t, realized: 0, bought: 0, sold: 0 });
  held.market ||= e.market;
  const p = (s.positions[e.symbol] ||= {
    symbol: e.symbol, name: e.name, kind: 'fut', market: e.market, currency: BASE, qty: 0, cost: 0, costTWD: 0, mark: e.price, entry: e.price, mult, first: e.t, borrowFee: 0, feeLast: e.t
  });
  p.last = e.price;
  if (e.im > 0) p.im = e.im;
  let left = e.qty;
  const dir = buy ? 1 : -1;
  if (Math.abs(p.qty) > EPS && Math.sign(p.qty) !== dir) {
    const close = Math.min(left, Math.abs(p.qty));
    const side = Math.sign(p.qty);
    const pnl = (e.price - p.mark) * mult * close * side;
    add(s.cash, BASE, pnl);
    futFlow(s, e, pnl);
    const share = costs * (close / e.qty);
    const realized = (e.price - p.entry) * mult * close * side - share;
    s.realized += realized;
    held.realized += realized;
    s.closed.push({
      id: e.id, t: e.t, symbol: e.symbol, name: e.name, market: e.market, kind: 'fut', currency: BASE, qty: close, short: side < 0,
      proceeds: e.price * mult * close, cost: p.entry * mult * close, realized, realizedLocal: realized, pct: p.im ? realized / (p.im * close) : 0, held: e.t - p.first
    });
    p.qty -= side * close;
    left -= close;
  }
  if (left > EPS) {
    if (Math.abs(p.qty) <= EPS) {
      Object.assign(p, { qty: 0, mark: e.price, entry: e.price, first: e.t });
    } else {
      const n = Math.abs(p.qty);
      p.mark = (p.mark * n + e.price * left) / (n + left);
      p.entry = (p.entry * n + e.price * left) / (n + left);
    }
    p.qty += dir * left;
  }
  if (Math.abs(p.qty) <= EPS) delete s.positions[e.symbol];
}

// What a TAIFEX order trades from: the futures account once split, else the NT$ cash.
const futHave = (s, avail) => (s.futSplit ? avail.fut : avail.cash[BASE] || 0);
// The money free for an order at `t`: its currency's cash, or a TAIFEX one's futures account.
function pocketAt(account, t, order) {
  const s = replay(account, t);
  const avail = available(account, s);
  return order.market === 'TAIFEX' ? futHave(s, avail) : avail.cash[order.currency] || 0;
}

// Cash and shares not already promised to open orders (and the futures' margin).
// `fut`: the futures account's money free (its margins and orders held), the
// NT$ cash less all of it; before the split (futSplit), the NT$ cash less the
// margins, `fut` 0.
export function available(account, s) {
  const cash = { ...s.cash };
  const qty = {};
  for (const p of Object.values(s.positions)) qty[p.symbol] = p.qty;
  const margin = futMarginHeld(s);
  let fut = 0;
  if (s.futSplit) {
    cash[BASE] = (cash[BASE] || 0) - s.futCash;
    fut = s.futCash - margin;
  } else if (margin) cash[BASE] = (cash[BASE] || 0) - margin;
  // (A TAIFEX order's hold: the futures account's, once split.)
  const hold = (o, amount) => {
    if (s.futSplit && o.market === 'TAIFEX') fut -= amount;
    else cash[o.currency] = (cash[o.currency] || 0) - amount;
  };
  // Lent shares (until they're back) can't be sold.
  for (const l of Object.values(s.lent || {})) qty[l.symbol] = (qty[l.symbol] || 0) - l.qty;
  for (const o of account.orders || []) {
    if (o.status !== 'open') continue;
    if (o.side === 'buy') hold(o, o.reserve || 0);
    else {
      qty[o.symbol] = (qty[o.symbol] || 0) - o.qty;
      // A 融券 order waiting holds its 90% deposit; a sale opening a future
      // or writing an option, its margin.
      if (o.deposit) cash[o.currency] = (cash[o.currency] || 0) - o.deposit;
      if (o.reserve) hold(o, o.reserve);
    }
  }
  return { cash, qty, fut };
}

// Cash that can leave its market (be exchanged): what's available less sale
// proceeds that haven't settled yet (T+1, T+2).
export function unsettled(account, now = Date.now()) {
  const out = {};
  for (const e of account.events) if (e.type === 'fill' && e.side === 'sell' && e.settle > now && e.t <= now) add(out, e.currency, e.total);
  return out;
}
// When each currency's unsettled sale money is all settled: the latest
// pending settle moment per currency.
export function settlesBy(account, now = Date.now()) {
  const out = {};
  for (const e of account.events) if (e.type === 'fill' && e.side === 'sell' && e.settle > now && e.t <= now) out[e.currency] = Math.max(out[e.currency] || 0, e.settle);
  return out;
}
export function withdrawable(account, s, now = Date.now()) {
  const cash = available(account, s).cash;
  const pending = unsettled(account, now);
  for (const c of Object.keys(pending)) cash[c] = Math.max(0, Math.min(cash[c] || 0, (cash[c] || 0) - pending[c]));
  return cash;
}

// ---- Orders ------------------------------------------------------------------

// What a trade of `qty` at `price` costs or brings in, all in. `first`: the
// account's first trade ever, which pays no commission (the welcome offer,
// Orbit's: taxes and fees as usual). The app marks an account that hasn't
// traded (`withWelcome`); the offer is its first fill.
const traded = account => (account?.events || []).some(e => e.type === 'fill');
export const withWelcome = account => (account && !traded(account) && !account.welcome ? { ...account, welcome: true } : account);
export const firstTrade = account => account?.welcome === true && !traded(account);
// A Taiwan amount mixing whole lots and odd shares (a plan's buy) is two
// trades (TWSE: 整股 and 零股 are separate orders), each with its own costs
// and minimum. `plan`: a monthly plan's buy (its own fee).
export function estimate({ market, kind, currency, side, qty, price, t = Date.now(), dayTrade = false, first = false, plan = false, symbol = '' }) {
  const deal = dealPrice(market, side, price);
  // (An option's price is in points, NT$50 each.)
  const gross = roundCash(deal * qty * (kind === 'opt' ? OPTION.mult : 1), currency);
  const cost = (q, g) => tradeCosts({ market, side, kind, gross: g, qty: q, currency, discount: first ? 0 : 1, oddLot: isOddLot(market, kind, q), dayTrade, t, plan, symbol });
  const mixed = mixedLot(market, kind, qty);
  let costs = cost(qty, gross);
  if (mixed) {
    const lotsGross = roundCash(deal * mixed.lots, currency);
    const [a, b] = [cost(mixed.lots, lotsGross), cost(mixed.odd, gross - lotsGross)];
    costs = { ...a, commission: a.commission + b.commission, tax: a.tax + b.tax, fee: a.fee + b.fee, total: a.total + b.total };
  }
  const total = side === 'buy' ? gross + costs.total : gross - costs.total;
  return { price: deal, gross, ...costs, costs: costs.total, total };
}

// A Taiwan whole-lot order of a listed stock, ETF or bond ETF: it goes
// through the closing call auction (stock-credit.mjs closingAuction).
const LISTED = new Set(['stock', 'etf', 'bond']);
// (Not an emerging-board stock: 興櫃 is traded by negotiation, isEmerging.)
const atClosingAuction = order => order.market === 'TW' && LISTED.has(order.kind) && !order.after && !isOddLot(order.market, order.kind, order.qty) && !isEmerging(order.symbol);
// One match at the close: a buy whose limit is at or above it, a sell at or
// below, a market order at it; a stop order waits.
const crossAt = (order, close) => (order.type === 'limit' ? ((order.side === 'buy' ? order.limit >= close : order.limit <= close) ? close : null) : order.type === 'market' ? close : null);
// Taiwan's closing call auction on this quote: { price } (the close, or null
// when the order doesn't meet it) once the 13:30 match is in (a price of
// 13:25 or later: none trade between), for an order placed before 13:30;
// { price: null } while it's collecting (13:25-13:30) or for an order
// placed during it whose match isn't in yet; null when it doesn't apply.
export function closingMatch(order, quote, now = Date.now()) {
  if (!atClosingAuction(order)) return null;
  const c = closingAuction(now);
  if (!c || order.t >= c.match) return null;
  if (quote?.marketTime >= c.from) return { price: now >= c.match ? crossAt(order, quote.price) : null };
  // (Placed during it: it never matches before 13:30.)
  return order.t >= c.from ? { price: null } : null;
}

// The price an open order fills at on this quote, or null. An order placed
// before the current session started also fills on the session's high or
// low having reached its price (the page can't watch every tick).
// `halt`: the US market-wide halt now (marketHalt), when there's one.
export function triggerPrice(order, quote, now, { halt = null } = {}) {
  if (halt && now < halt.until && order.market === 'US' && LISTED.has(order.kind)) return null;
  // Taiwan's after-hours sessions: one match at 14:30, at the close.
  if (order.after) {
    if (!quote || now < order.after || !(quote.marketTime >= order.after - 3_600_000)) return null;
    return crossAt(order, quote.price);
  }
  // Taiwan's closing call auction (13:25-13:30): one match at 13:30, at the close.
  const closing = quote && closingMatch(order, quote, now);
  if (closing) return closing.price;
  // (A US extended-hours order fills outside the regular session only on
  // the pre- or post-market's own price bars: backfillPrice.)
  if (!quote || !isOpen(quote, now)) return null;
  if (isOddLot(order.market, order.kind, order.qty) && !oddLotOpen(now)) return null;
  if (quote.kind !== 'crypto' && quote.session && quote.marketTime < quote.session.start) return null;
  const p = quote.price;
  const early = quote.session && order.t < quote.session.start;
  const lo = early && Number.isFinite(quote.dayLow) ? quote.dayLow : p;
  const hi = early && Number.isFinite(quote.dayHigh) ? quote.dayHigh : p;
  const buy = order.side === 'buy';
  switch (order.type) {
    case 'market':
      return p;
    case 'limit':
      if (buy) return p <= order.limit ? p : lo <= order.limit ? order.limit : null;
      return p >= order.limit ? p : hi >= order.limit ? order.limit : null;
    case 'stop':
      if (buy) return p >= order.stop ? p : hi >= order.stop ? Math.max(order.stop, p) : null;
      return p <= order.stop ? p : lo <= order.stop ? Math.min(order.stop, p) : null;
    default:
      return null;
  }
}

// (A US stock's fractional shares, a plan's, sell to US_FRACTION.)
function checkQty(qty, kind, sellFraction = false) {
  if (!(qty > 0)) return 'qty';
  if (sellFraction) return Math.abs(Math.round(qty / US_FRACTION) * US_FRACTION - qty) > US_FRACTION * 1e-3 ? 'qtyStep' : null;
  if (Math.abs(roundQty(qty, kind) - qty) > qtyStep(kind) * 1e-3) return 'qtyStep';
  return null;
}

// Good-till-cancelled orders last this long (brokers' 長效單: a month).
export const GTC_DAYS = 30;
// How long after Taiwan's 13:30 close a whole-lot day order waits for its
// closing match to be known (to 14:30).
export const CLOSE_DECIDE = 60 * 60_000;
// When a day order placed now ends: the close of the session it's for (the
// one under way, or the next one when the market is shut), or its early
// close on a half day.
export function dayOrderEnd(quote, now = Date.now()) {
  const s = quote?.session;
  if (!s || !(s.end > s.start)) return now + 86_400_000;
  const end = (start, close) => Math.min(close, earlyCloseAt(quote.market, start) ?? Infinity);
  // (興櫃's session runs to 15:00: sessionEnd.)
  const long = (sessionEnd(quote) ?? s.end) - s.start;
  const close = end(s.start, s.start + long);
  if (now < close && s.start - now < 20 * 3_600_000) return close;
  const start = nextTradingStart(quote.market, s.start, quote.tz, now);
  return end(start, start + long);
}
// Orders past their end: expired, their cash or shares free again.
export function expireOrders(account, now = Date.now()) {
  const due = account.orders.filter(o => o.status === 'open' && o.expires && now >= o.expires && !o.forced);
  if (!due.length) return { account, expired: [] };
  let next = account;
  for (const o of due) next = updateOrder(next, { ...o, status: 'expired', rev: o.rev + 1, done: o.expires });
  return { account: next, expired: due };
}

// A new order. Fills at once when its market is open and its price is met;
// otherwise it waits (and holds its cash or shares) until it fills or is
// cancelled. Returns { account, order, fill } or { error }.
export function placeOrder(account, req, { quote, rates, valuation, now = Date.now(), id = randomId(), halt = null }) {
  const { side, type = 'market' } = req;
  if (!quote) return { error: 'noQuote' };
  if (!isTradable(quote.kind)) return { error: 'notTradable' };
  const qty = Number(req.qty);
  const qtyError = checkQty(qty, quote.kind, side === 'sell' && fractional(quote.market, quote.kind));
  if (qtyError) return { error: qtyError };
  if (side !== 'buy' && side !== 'sell') return { error: 'side' };
  if (type === 'limit' && !(req.limit > 0)) return { error: 'limit' };
  if (type === 'stop' && !(req.stop > 0)) return { error: 'stop' };
  if (!rates?.[quote.currency]) return { error: 'noRate' };
  // The exchange's own rules: prices on its tick, limit orders inside
  // Taiwan's daily ±10%.
  for (const x of [type === 'limit' ? Number(req.limit) : null, type === 'stop' ? Number(req.stop) : null]) {
    if (x == null) continue;
    const tick = tickSize(quote.market, quote.kind, x, quote.symbol);
    if (!onTick(x, tick)) return { error: 'tick', tick };
  }
  const band = priceLimits(quote, now);
  if (band && type === 'limit' && (req.limit > band.up + EPS || req.limit < band.down - EPS)) return { error: 'priceLimit', ...band };
  const s = replay(account, now);
  const avail = available(account, s);
  // Board lots (Japan 100, a Japanese ETF its own, China's buys 100, Hong Kong each stock's own;
  // one HKEX's list doesn't have can't be sized: lotUnknown).
  const lot = lotProblem(quote.market, quote.symbol, quote.kind, side, qty, Math.max(0, avail.qty[quote.symbol] || 0));
  if (lot) return lot.unknown ? { error: 'lotUnknown' } : { error: 'lot', lot: lot.lot };
  // Taiwan: whole lots and odd lots go in separate orders. (The broker's own
  // sales, forced or to cover, it splits itself.)
  const mixed = !req.forced && !req.cover && mixedLot(quote.market, quote.kind, qty);
  if (mixed) return { error: 'mixedLot', ...mixed };
  // US pre- and post-market (`ext`): a US stock or ETF, a day limit order only.
  if (req.ext && (quote.market !== 'US' || !LISTED.has(quote.kind) || type !== 'limit' || req.tif === 'gtc')) return { error: 'extLimit' };
  // Hong Kong takes limit orders only (limitOnly; the broker's own sales aside).
  if (!req.forced && !req.cover && type !== 'limit' && limitOnly(quote.market, quote.symbol)) return { error: 'limitOnly' };
  // Taiwan's odd lots (盤中 and 盤後零股) take limit orders only (TWSE: 以限價為之).
  if (!req.forced && !req.cover && type !== 'limit' && isOddLot(quote.market, quote.kind, qty)) return { error: 'oddLotLimit' };
  // Stock Connect: STAR and ChiNext shares are bought by institutions only (cnBoard).
  if (side === 'buy' && quote.market === 'CN' && cnBoard(quote.symbol) !== 'main') return { error: 'northboundBoard', board: cnBoard(quote.symbol) };
  // China's T+1: shares bought today can be sold from the next trading day.
  if (side === 'sell' && quote.market === 'CN') {
    const today = localDayOf(now, 'CN');
    const boughtToday = account.events.filter(e => e.type === 'fill' && e.symbol === quote.symbol && e.side === 'buy' && e.t <= now && localDayOf(e.t, 'CN') === today).reduce((sum, e) => sum + e.qty, 0);
    const can = Math.max(0, (avail.qty[quote.symbol] || 0) - boughtToday);
    if (qty > can + EPS) return { error: 'tPlus1', can };
  }
  // What the product needs opened, signed or qualified for first (開戶與交易
  //資格, stock-access.mjs): only for what opens or adds a position.
  if (!req.forced && !req.cover) {
    const opening = quote.market === 'TAIFEX' ? futOpening(s.positions[quote.symbol]?.qty || 0, side, qty) : 0;
    const gate = accessProblem(account, quote, { side, opening, rr: req.rr ?? null }, now);
    if (gate) return gate;
  }
  // A 全額交割股 (isFullDelivery): the price paid and the shares delivered
  // before the order (預收款券): cash and shares already settled, so never
  // on 融資, short, or sold the day (or the two) it was bought.
  const full = quote.market === 'TW' && isFullDelivery(quote.symbol) && !req.forced && !req.cover;
  if (full && req.margin) return { error: 'fullDelivery', part: 'margin' };
  if (full && side === 'sell') {
    const have = Math.max(0, (avail.qty[quote.symbol] || 0) - settlingQty(account, quote.symbol, now));
    if (qty > have + EPS) return { error: 'fullDelivery', part: 'shares', have };
  }
  const order = {
    id,
    symbol: quote.symbol,
    name: quote.name,
    kind: quote.kind,
    market: quote.market,
    currency: quote.currency,
    side,
    type,
    qty,
    t: now,
    status: 'open',
    rev: 1,
    ...(req.fromMargin && side === 'sell' ? { fromMargin: true } : {}),
    ...(side === 'buy' && leverageOf(quote) ? { leveraged: true } : {})
  };
  if (type === 'limit') order.limit = Number(req.limit);
  if (type === 'stop') order.stop = Number(req.stop);
  if (req.ext) order.ext = true;
  if (req.forced) order.forced = true;
  // Sold to collect an overdraft the account didn't cover in time.
  if (req.cover) order.cover = true;
  // Held for a fresh price: it fills only at a quote read after it was
  // placed (processOrders), never at the figure on screen.
  if (req.fresh) order.waitFresh = now;
  // 融資買進: a buy the broker lends part of (the holding's loan value,
  // collateralRate), the shares bought its collateral. Only buys of what it
  // lends against, and only with the account's margin in order. The loan is
  // made when it fills (fillOrder), never as cash beforehand.
  if (req.margin) {
    if (side !== 'buy') return { error: 'side' };
    if (defaulted(account, now)) return { error: 'defaulted' };
    // 複委託 is cash only (isSubBrokered): no 融資 abroad.
    if (isSubBrokered(quote.market)) return { error: 'cashOnly' };
    const rate = collateralRate(quote.kind, quote.market, quote.symbol);
    if (!(rate > 0)) return { error: 'notMarginable' };
    if (!valuation || valuation.margin !== 'ok' || account.call) return { error: 'margin' };
    // 融資 needs the credit account, within its limit.
    const credit = creditAccount(account, now);
    if (!credit.open) return { error: 'creditNeeded' };
    if (quote.market === 'TW') {
      const value = quotaPrice(order, quote, now) * qty;
      const loan = marginLoan('TW', quote.currency, value, value, rate);
      const room = credit.limit - creditUsed(valuation).loan;
      if (loan > room + EPS) return { error: 'creditLimit', room: Math.max(0, Math.floor(room)), limit: credit.limit };
    }
    order.margin = rate;
  }
  // After Taiwan's close and before 14:30: the after-hours sessions (盤後零股
  // from 13:40, 盤後定價 from 14:00), limit or market orders, matched once at
  // 14:30 at the close; what doesn't match ends with the day. Before its
  // session takes orders, one is refused (afterHoursWait: from when).
  if (quote.market === 'TW' && !req.forced && req.expiry == null) {
    const after = afterHours(now, isOddLot(quote.market, quote.kind, qty));
    if (after && type !== 'stop') {
      if (now < after.from && !req.cover) return { error: 'afterHoursWait', from: after.from };
      order.after = after.match;
      order.tif = 'day';
    }
    // The closing call auction (13:25-13:30) takes limit orders only.
    const c = closingAuction(now);
    if (type === 'market' && !req.cover && c && now < c.match && atClosingAuction(order)) return { error: 'closingAuction', match: c.match };
  }
  // A warrant held to its last trading day: sold at that day's close, as
  // its expiry settles it (isWarrant). `expiry` is that day's 13:30 match.
  if (req.expiry != null) {
    const at = Number(req.expiry);
    const close = new Date(at + 8 * 3_600_000);
    if (quote.kind !== 'warrant' || side !== 'sell' || !(at > 0) || close.getUTCHours() !== 13 || close.getUTCMinutes() !== 30) return { error: 'side' };
    order.after = at;
    order.expiry = true;
    order.tif = 'day';
  }
  // A Taiwan fund (境內基金) is bought or redeemed at the NAV of its cutoff's
  // day (fundCutoff), known only that evening: a market order, never a
  // price, waiting a few days for that NAV to come out.
  if (quote.market === 'TWFUND') {
    if (type !== 'market' && !req.forced && !req.cover) return { error: 'navOnly' };
    order.after = fundCutoff(now);
    order.tif = 'day';
  }
  // How long it lasts: a day order ends with its session (what exchanges
  // and brokers do by default); good-till-cancelled lasts GTC_DAYS. Crypto
  // and currency pairs never close, so theirs are GTC.
  if (!order.after) order.tif = req.tif === 'gtc' || quote.kind === 'crypto' || quote.kind === 'fx' ? 'gtc' : 'day';
  // (An extended-hours order lasts its day's post-market, to 18:00 New York time.)
  order.expires = order.after ? order.after + 9 * 3_600_000 : order.tif === 'gtc' ? now + GTC_DAYS * 86_400_000 : order.ext ? usExtendedEnd(now) : dayOrderEnd(quote, now);
  // (A settlement placed after its day, the app closed then: at the close it settled at.)
  if (order.expiry) order.expires = Math.max(order.expires, now + 86_400_000);
  if (quote.market === 'TWFUND') order.expires = order.after + FUND_NAV_WAIT;
  // A Taiwan whole-lot day order is in its day's 13:30 closing match: it
  // lasts until that's known (CLOSE_DECIDE; Yahoo's Taiwan prices run 20
  // minutes behind), ending unmatched after it.
  if (order.tif === 'day' && atClosingAuction(order)) order.expires += CLOSE_DECIDE;
  if (quote.kind === 'opt') {
    // An option trades to its month's last day's 13:30.
    if (!req.forced && !(now < optionExpiry(quote.symbol))) return { error: 'futExpired' };
    // Selling more than is held writes the rest (賣出開倉): the premium comes
    // in and the margin a contract is held (optWriteMargin), so what has to
    // be free is the margin less the premium, and the costs.
    const write = side === 'sell' ? optWriting(account, s, quote.symbol, qty, avail) : 0;
    if (write > EPS) {
      const ref = order.type === 'limit' ? Math.min(order.limit, quote.price) : quote.price;
      const im = optWriteMargin(quote.symbol, ref, quote.index, quote.optMargin);
      const est = estimate({ market: quote.market, kind: 'opt', currency: BASE, side, qty, price: ref, symbol: quote.symbol });
      const reserve = Math.max(0, Math.round(write * (im - ref * OPTION.mult) + est.costs));
      const have = futHave(s, avail);
      if (!req.forced && reserve > have + EPS) return { error: 'optNoWrite', need: reserve, have: Math.max(0, have), currency: BASE };
      order.reserve = reserve;
      order.im = im;
      order.write = write;
    }
  }
  if (quote.kind === 'fut') {
    // A future trades to its last day's 13:30; then TAIFEX settles it.
    if (!req.forced && !(now < futureExpiry(quote.symbol))) return { error: 'futExpired' };
    // What it opens needs its initial margin (and the costs) free; closing needs nothing.
    const opening = futOpening(s.positions[quote.symbol]?.qty || 0, side, qty);
    const im = futMargin(quote.symbol, quote)[0];
    const est = estimate({ market: quote.market, kind: 'fut', currency: BASE, side, qty, price: quote.price, symbol: quote.symbol });
    const reserve = Math.round(opening * im + est.costs);
    const have = futHave(s, avail);
    if (!req.forced && reserve > have + EPS) return { error: 'funds', need: reserve, have: Math.max(0, have), currency: BASE };
    order.reserve = reserve;
    order.im = im;
  } else if (quote.kind === 'opt' && side === 'sell') {
    // (Sold back or written: checked above.)
  } else if (side === 'sell') {
    const have = Math.max(0, avail.qty[quote.symbol] || 0);
    // Shares bought today sell today only as a 現股當沖 (dayTradeBuyFirst:
    // 3 months open and 10 trades, or a credit account); before that a
    // broker refuses the sale until tomorrow (TWSE 現股當日沖銷交易作業要點).
    // An emerging-board stock (興櫃) is never day-traded: today's shares sell tomorrow.
    const noDayTrade = isEmerging(quote.symbol);
    if (quote.market === 'TW' && !req.forced && !req.cover && (noDayTrade || !dayTradeBuyFirst(account, now))) {
      const today = boughtToday(account, quote.symbol, now);
      if (today > EPS && qty > Math.max(0, have - today) + EPS) return { error: noDayTrade ? 'noDayTrade' : 'dayTradeNeeded', have: Math.max(0, have - today) };
    }
    const short = qty - have;
    if (short > EPS) {
      // Selling more than is held sells the rest short; never abroad (複委託
      // is cash only: a foreign stock sells only what's held).
      if (!isShortable(quote.kind, quote.symbol)) return { error: 'shares', have };
      if (isSubBrokered(quote.market) && quote.kind !== 'fx') return { error: 'cashOnly', have };
      if (!valuation) return { error: 'noValuation' };
      if (valuation.margin !== 'ok') return { error: 'margin' };
      if (defaulted(account, now)) return { error: 'defaulted' };
      // A crypto short needs the credit account too (a currency pair borrows
      // nothing: selling it is taking its other side).
      if (quote.market !== 'TW' && quote.kind !== 'fx' && !creditAccount(account, now).open) return { error: 'creditNeeded' };
      // Taiwan: 融券 through the credit account (a 90% deposit, within its
      // limit), or else a day trade sold first (現股當沖) that must be bought
      // back by the close.
      if (quote.market === 'TW') {
        const credit = creditAccount(account, now);
        if (credit.open) {
          const room = credit.limit - creditUsed(valuation).short;
          const value = short * quotaPrice(order, quote, now);
          if (value > room + EPS) return { error: 'creditLimit', room: Math.max(0, Math.floor(room)), limit: credit.limit };
          const deposit = shortDeposit(value);
          const cash = avail.cash[quote.currency] || 0;
          if (deposit > cash + EPS) return { error: 'funds', need: deposit, have: Math.max(0, cash), currency: quote.currency };
          order.short = true;
          order.credit = true;
          order.deposit = deposit;
        } else if (dayTradeSellFirst(account, now) && !order.after && twSession(now)) {
          // Within the day's day-trade limit (當沖額度, stock-credit.mjs).
          const amount = short * quotaPrice(order, quote, now) * rates[quote.currency];
          const room = dayTradeRoom(account, valuation.netWorth, now);
          if (amount > room.left + EPS) return { error: 'dayTradeLimit', room: room.left, limit: room.limit, used: room.used };
          order.short = true;
          order.dayShort = true;
          order.dayTradeTWD = Math.round(amount);
          order.tif = 'day';
        } else return { error: 'creditNeeded' };
      }
      const value = short * quote.price * rates[quote.currency];
      const owed = valuation.debtTWD + valuation.shortTWD + value;
      if (!order.credit && !order.dayShort && (valuation.assets + value) / owed < SHORT_INITIAL - EPS) {
        const room = Math.max(0, (valuation.assets - SHORT_INITIAL * (valuation.debtTWD + valuation.shortTWD)) / (SHORT_INITIAL - 1));
        return { error: 'shortMargin', max: roundQty(have + room / (quote.price * rates[quote.currency]), quote.kind) };
      }
      order.short = true;
    }
  } else {
    // The most it can cost: a limit order at its limit, a stop order at its
    // stop or the price, a market order at the price (plus a margin while it
    // waits for the market to open).
    // (Buying back written options frees their margin.)
    const freed = quote.kind === 'opt' ? optFreed(s, quote.symbol, qty) : 0;
    const reserve = Math.max(0, requiredCash(order, quote, now).reserve - freed);
    const have = quote.market === 'TAIFEX' ? futHave(s, avail) : (avail.cash[quote.currency] || 0) - (full ? unsettled(account, now)[quote.currency] || 0 : 0);
    if (full && reserve > have + EPS) return { error: 'fullDelivery', part: 'cash', need: reserve, have: Math.max(0, have) };
    if (reserve > have + EPS) return { error: 'funds', need: reserve, have: Math.max(0, have), currency: quote.currency };
    order.reserve = reserve;
  }
  let next = { ...account, orders: [...(account.orders || []), order] };
  const price = order.waitFresh ? null : triggerPrice(order, quote, now, { halt });
  if (price === null) return { account: next, order, fill: null };
  const filled = fillOrder(next, order, price, rates, now);
  return { account: filled.account, order: filled.order, fill: filled.fill, error: filled.error, need: filled.need, have: filled.have };
}

// The most a Taiwan market or stop order can fill at, the day's limit-up
// (漲停價), which a broker counts its amount at (兆豐證券: 受託買賣額度一律以
// 漲停價計算): the session's from yesterday's close while it trades, the
// next one's from the last price while shut. Null elsewhere, for a limit
// order, and after hours (盤後 matches at the close).
export function limitUpFor(order, quote, now = Date.now()) {
  if (quote?.market !== 'TW' || order.type === 'limit' || order.after || (order.type === 'market' && afterHours(now))) return null;
  return priceLimits(isOpen(quote, now) ? quote : { ...quote, prev: quote.price }, now)?.up ?? null;
}
// The price an order's amount is counted at (額度, deposits): its limit, a
// Taiwan market or stop order's limit-up, else the price.
const quotaPrice = (order, quote, now) => order.limit ?? limitUpFor(order, quote, now) ?? quote.price;

// What a buy order needs in its currency, the very figure placeOrder checks:
// { est (the all-in estimate), reserve (what's held until it fills),
// buffer (the part of reserve above the estimate, returned when it fills) }.
// A limit order holds its limit's cost; an order that fills right away its
// cost; one that waits for its market (a market or stop order while it's
// shut) holds 3% more, since it can open higher.
export function requiredCash(order, quote, now = Date.now()) {
  const last = order.type === 'stop' ? Math.max(Number(order.stop), quote.price) : quote.price;
  const ref = order.type === 'limit' ? Number(order.limit) : marketFill(quote.market, quote.kind, 'buy', last);
  const est = estimate({ market: quote.market, kind: quote.kind, currency: quote.currency, side: 'buy', qty: order.qty, price: ref });
  const fillsNow = triggerPrice({ ...order, side: 'buy', t: now }, quote, now) !== null;
  // What's held above the estimate: nothing for a limit order (its limit is
  // its most); RESERVE_BUFFER while it waits for its market; FRESH_BUFFER
  // for one held a moment for a fresh price (the price may tick up).
  // A Taiwan market or stop order holds its cost at the limit-up, the most
  // it can fill at, and nothing more.
  const up = limitUpFor(order, quote, now);
  const held = up ? estimate({ market: quote.market, kind: quote.kind, currency: quote.currency, side: 'buy', qty: order.qty, price: up }) : est;
  const extra = order.type === 'limit' || up ? 0 : !fillsNow ? RESERVE_BUFFER : order.waitFresh ? FRESH_BUFFER : 0;
  // On margin, only one's own part is held (自備款); the broker lends the rest.
  const lent = order.margin ? marginLoan(quote.market, quote.currency, held.gross, held.total, order.margin) : 0;
  const reserve = roundCash((held.total - lent) * (1 + extra), quote.currency);
  return { est, reserve, buffer: Math.max(0, reserve - est.total), fillsNow, ref };
}

// What 融資 lends on a purchase: in Taiwan the trade's value (成交價款, before
// costs) times the rate, the part under NT$1,000 not lent (TWSE 融資融券業務
// 操作辦法 §50); elsewhere the rate of all it costs.
export function marginLoan(market, currency, gross, total, rate) {
  if (market === 'TW') return Math.max(0, Math.floor((gross * rate) / 1000 + 1e-9) * 1000);
  return roundCash(total * rate, currency);
}

function updateOrder(account, order) {
  return { ...account, orders: account.orders.map(o => (o.id === order.id ? order : o)) };
}

// The share of a Taiwan sale that's a day trade (現股當沖, 證券交易稅條例
// §2-2: 同一營業日現款買進與現券賣出同種類同數量): the quantity the day's
// cash buys of whole lots leave after the day's earlier sales, over the
// sale's. Odd lots can't be day-traded (TWSE 當日沖銷交易作業辦法: 零股交易
// 不適用), nor can 融資 buys (not 現款), so they match nothing. 0 when none.
export function dayTradeShare(account, order, at) {
  if (order.market !== 'TW' || order.side !== 'sell' || !(order.qty > 0) || isOddLot(order.market, order.kind, order.qty)) return 0;
  const day = localDayOf(at, 'TW');
  let bought = 0;
  let sold = 0;
  for (const e of account.events) {
    if (e.type !== 'fill' || e.symbol !== order.symbol || e.t > at || e.orderId === order.id || localDayOf(e.t, 'TW') !== day) continue;
    const lots = e.qty - (Math.round(e.qty) % 1000);
    if (e.side === 'buy' && !e.financed) bought += lots;
    else if (e.side === 'sell') sold += lots;
  }
  return Math.min(order.qty, Math.max(0, bought - sold)) / order.qty;
}

// Shares of `symbol` bought on Taiwan's day of `at`: what can't be sold
// again before tomorrow without 當沖 (the day's sales were of older shares).
// Shares bought and not yet settled (T+2: not delivered yet).
function settlingQty(account, symbol, now) {
  let qty = 0;
  for (const e of account.events) if (e.type === 'fill' && e.side === 'buy' && e.symbol === symbol && e.t <= now && e.settle > now) qty += e.qty;
  return qty;
}
function boughtToday(account, symbol, at) {
  const day = localDayOf(at, 'TW');
  let qty = 0;
  for (const e of account.events) if (e.type === 'fill' && e.side === 'buy' && e.symbol === symbol && e.t <= at && localDayOf(e.t, 'TW') === day) qty += e.qty;
  return qty;
}

// Fills `order` at `price`. The fill is dated `at` (a past moment when it's
// found in the price history); cash and shares are checked as of `now`.
function fillOrder(account, order, price, rates, now, at = now) {
  // A market (or triggered stop) order crosses the spread: it buys at the
  // ask and sells at the bid. A limit order fills at its price or better.
  const quote = price;
  // (Taiwan's single-price matches, the 13:30 closing auction and 14:30
  // 盤後定價, fill everyone at that one price: nothing to cross.)
  const single = order.after || (atClosingAuction(order) && closingAuction(at)?.match <= at);
  if (order.type !== 'limit' && !single) price = marketFill(order.market, order.kind, order.side, price);
  else price = order.side === 'buy' ? Math.min(price, order.limit) : Math.max(price, order.limit);
  // A Taiwan stock sold the day it was bought pays the day-trade tax (half),
  // once the account may day trade buying first (3 months open, 10 trades in
  // the year: dayTradeBuyFirst, as Help says); before that, the full tax.
  const dayTrade = order.side === 'sell' && order.market === 'TW' && (order.dayShort || (dayTradeBuyFirst(account, at) && dayTradeShare(account, order, at)));
  let est = estimate({ market: order.market, kind: order.kind, currency: order.currency, side: order.side, qty: order.qty, price, t: at, dayTrade, first: firstTrade(account), plan: Boolean(order.plan), symbol: order.symbol });
  // 融券手續費: 0.08% of what's sold short (Taiwan drops the fraction).
  if (order.credit) {
    const held = Math.max(0, replay(account, at).positions[order.symbol]?.qty || 0);
    const handling = Math.floor((est.gross * Math.max(0, order.qty - held)) / order.qty * SHORT_HANDLING);
    if (handling > 0) est = { ...est, fee: est.fee + handling, costs: est.costs + handling, total: est.total - handling, handling };
  }
  // A fill found in the past must have fitted the cash (or shares) at that
  // moment and still fit today's.
  const moments = at < now ? [at, now] : [now];
  let writeIm = 0;
  if (order.kind === 'fut') {
    // A future: the margin for what it opens, and its costs, free then and now.
    if (!order.forced) {
      const have = Math.min(...moments.map(tt => pocketAt(account, tt, order))) + (order.reserve || 0);
      const opening = futOpening(replay(account, at).positions[order.symbol]?.qty || 0, order.side, order.qty);
      const need = opening * (order.im || futMargin(order.symbol, null, order.price || order.limit)[0]) + est.costs;
      if (need > have + EPS) {
        const rejected = { ...order, status: 'rejected', reason: 'funds', rev: order.rev + 1, done: now };
        return { account: updateOrder(account, rejected), order: rejected, fill: null, error: 'funds', need, have };
      }
    }
  } else if (order.kind === 'opt' && order.side === 'sell') {
    // An option sold: what's held is sold back, the rest written, its margin
    // less the premium (and the costs) free then and now.
    const held = Math.max(0, Math.min(...moments.map(tt => replay(account, tt).positions[order.symbol]?.qty || 0)));
    const write = Math.max(0, order.qty - held);
    if (write > EPS) {
      writeIm = order.im || optWriteMargin(order.symbol, est.price, 0);
      const have = Math.min(...moments.map(tt => pocketAt(account, tt, order))) + (order.reserve || 0);
      const need = Math.round(write * (writeIm - est.price * OPTION.mult) + est.costs);
      if (!order.forced && need > have + EPS) {
        const rejected = { ...order, status: 'rejected', reason: 'funds', rev: order.rev + 1, done: now };
        return { account: updateOrder(account, rejected), order: rejected, fill: null, error: 'funds', need, have };
      }
    }
  } else if (order.side === 'buy' && !order.forced) {
    // This order's own hold is released as it fills (and buying back written
    // options, their margin).
    const freed = order.kind === 'opt' ? Math.min(...moments.map(tt => optFreed(replay(account, tt), order.symbol, order.qty))) : 0;
    const have = Math.min(...moments.map(tt => pocketAt(account, tt, order))) + (order.reserve || 0) + freed;
    const lent = order.margin ? marginLoan(order.market, order.currency, est.gross, est.total, order.margin) : 0;
    if (est.total - lent > have + EPS) {
      const rejected = { ...order, status: 'rejected', reason: 'funds', rev: order.rev + 1, done: now };
      return { account: updateOrder(account, rejected), order: rejected, fill: null, error: 'funds', need: est.total - lent, have };
    }
  } else if (order.side === 'sell' && (!order.short || !isShortable(order.kind, order.symbol))) {
    const held = Math.min(...moments.map(tt => replay(account, tt).positions[order.symbol]?.qty || 0));
    if (held + EPS < order.qty) {
      const rejected = { ...order, status: 'rejected', reason: 'shares', rev: order.rev + 1, done: now };
      return { account: updateOrder(account, rejected), order: rejected, fill: null, error: 'shares' };
    }
  }
  const fill = {
    id: `fill:${order.id}`,
    type: 'fill',
    t: at,
    orderId: order.id,
    symbol: order.symbol,
    name: order.name,
    kind: order.kind,
    market: order.market,
    currency: order.currency,
    side: order.side,
    qty: order.qty,
    price: est.price,
    quote,
    settle: settleDate(order.market, at),
    gross: est.gross,
    commission: est.commission,
    tax: est.tax,
    fee: est.fee,
    total: est.total,
    twd: rates[order.currency],
    ...(order.leveraged ? { leveraged: true } : {})
  };
  if (order.forced) fill.forced = true;
  if (order.cover) fill.cover = true;
  if (order.credit) fill.credit = true;
  if (order.im) fill.im = order.im;
  if (writeIm) fill.im = writeIm;
  if (order.dayShort) fill.dayShort = true;
  if (est.handling) fill.handling = est.handling;
  if (order.after) fill.after = true;
  const extra = [];
  // 融資買進: the loan for this purchase, made as it fills, tied to the stock.
  if (order.side === 'buy' && order.margin) {
    const amount = marginLoan(order.market, order.currency, est.gross, est.total, order.margin);
    if (amount > 0) {
      fill.financed = amount;
      extra.push({ id: `loan:${order.id}`, type: 'borrow', t: at, currency: order.currency, amount, rate: loanRateAt(order.currency, at), symbol: order.symbol });
    }
  }
  // Selling shares bought on margin repays their loan first (融資賣出,
  // 償還): that share of what's financed, out of the proceeds.
  if (order.side === 'sell') {
    const s0 = replay(account, at);
    const pos = s0.positions[order.symbol];
    const loan = s0.loans[order.currency];
    if (pos?.financed > 0 && pos.qty > 0 && loan?.balance > 0) {
      // Which shares it sells: 現股 first, then 融資 shares (融資賣出), unless
      // it's the broker's sale of the 融資 shares (fromMargin).
      const mq = Math.min(pos.qty, pos.marginQty ?? pos.qty);
      const fromMargin = order.fromMargin ? Math.min(order.qty, mq) : Math.max(0, order.qty - (pos.qty - mq));
      const amount = fromMargin > 0 ? roundCash(Math.min(pos.financed * Math.min(1, fromMargin / mq), loan.balance, est.total), order.currency) : 0;
      if (fromMargin > 0) fill.marginQty = fromMargin;
      if (amount > 0) {
        fill.repaid = amount;
        extra.push({ id: `repay:${order.id}`, type: 'repay', t: at, currency: order.currency, amount, symbol: order.symbol });
      }
    }
  }
  const done = { ...order, status: 'filled', rev: order.rev + 1, done: at, fillId: fill.id, price: est.price };
  const next = updateOrder({ ...account, events: [...account.events, fill, ...extra] }, done);
  return { account: next, order: done, fill };
}

export function cancelOrder(account, orderId, now = Date.now()) {
  const order = account.orders.find(o => o.id === orderId);
  if (!order || order.status !== 'open') return account;
  return updateOrder(account, { ...order, status: 'cancelled', rev: order.rev + 1, done: now });
}

// Fills every open order whose price is met on these quotes.
export function processOrders(account, quotes, rates, now = Date.now(), { halt = null } = {}) {
  let next = account;
  const filled = [];
  const rejected = [];
  for (const order of account.orders.filter(o => o.status === 'open' && !(o.expires && now >= o.expires && !o.forced)).sort(byTime)) {
    const quote = quotes.get(order.symbol);
    if (!quote || !rates?.[order.currency]) continue;
    if (order.waitFresh && !(quote.got >= order.waitFresh)) continue;
    const price = triggerPrice(order, quote, now, { halt });
    if (price === null) continue;
    const r = fillOrder(next, order, price, rates, now);
    next = r.account;
    if (r.fill) filled.push(r.fill);
    else rejected.push(r.order);
  }
  return { account: next, filled, rejected };
}

// The proxy's fills (the owner, 2026-10-14: Securities' orders filled by the
// proxy): { orderId: { quote, t, twd } } from its own fresh
// quote (Orbit-Core stock-fill.js), each applied to its open order at
// that price and moment; the account's own rules (cash, shares, the
// spread, costs) as fillOrder has them. Orders it hasn't filled stay open.
export function applyFills(account, fills, rates, now = Date.now()) {
  let next = account;
  const filled = [];
  const rejected = [];
  for (const order of account.orders.filter(o => o.status === 'open' && fills?.[o.id]).sort(byTime)) {
    const f = fills[order.id];
    // The proxy's NT$ rate for its currency, where it gave one.
    const at = f.twd > 0 ? { ...rates, [order.currency]: f.twd } : rates;
    if (!at?.[order.currency]) continue;
    const r = fillOrder(next, order, f.quote, at, Math.max(now, f.t), f.t);
    next = r.account;
    if (r.fill) filled.push(r.fill);
    else rejected.push(r.order);
  }
  return { account: next, filled, rejected };
}

// Whether the phone asks the proxy about an open order now (askFills): when
// will make no difference to its price (the proxy fills from the bars since
// it last looked, stock-fill.js), only to how soon a fill shows. At once
// for one it hasn't asked about, a session begun since it last asked, an
// after-hours order past its match, and a price at or within 1% of its
// trigger; else every FILL_ASK_EVERY.
export const FILL_ASK_EVERY = 10 * 60_000;
export function fillAskDue(order, quote, lastAsk, now = Date.now()) {
  if (!(lastAsk > 0) || now - lastAsk >= FILL_ASK_EVERY) return true;
  const s = quote?.session;
  if (s && s.start > lastAsk && now >= s.start) return true;
  if (order.after) return now >= order.after && lastAsk < order.after;
  const p = quote?.price;
  if (!(p > 0)) return false;
  const buy = order.side === 'buy';
  if (order.type === 'limit') return buy ? p <= order.limit * 1.01 : p >= order.limit * 0.99;
  if (order.type === 'stop') return buy ? p >= order.stop * 0.99 : p <= order.stop * 1.01;
  return false;
}

// When an order waiting while the page was closed would have filled: the
// first price bar after it was placed that reaches its price (bars:
// [{ t, o, h, l, c }], oldest first). A gap through the price fills at the
// bar's open, like a real order. A Taiwan whole-lot order's bars from 13:25
// are the closing call auction's: nothing trades in it until the 13:30
// match, so such a bar is the close, and an order placed before 13:30 that
// meets it fills there at 13:30 (once that's past by `now`).
export function backfillPrice(order, bars, now = Date.now()) {
  const odd = isOddLot(order.market, order.kind, order.qty);
  const closing = atClosingAuction(order);
  for (const b of bars) {
    if (order.expires && b.t >= order.expires) break;
    if (!Number.isFinite(b.o)) continue;
    const c = closing ? closingAuction(b.t) : null;
    if (c) {
      if (order.t >= c.match || now < c.match || !Number.isFinite(b.c)) continue;
      const price = crossAt(order, b.c);
      if (price != null) return { t: c.match, price };
      continue;
    }
    if (b.t < order.t) continue;
    if (odd && !oddLotOpen(b.t)) continue;
    // A US stock's pre- and post-market bars (read with them) fill only an
    // extended-hours order.
    if (order.market === 'US' && LISTED.has(order.kind) && !order.ext && usSession(b.t) !== 'regular') continue;
    const buy = order.side === 'buy';
    if (order.type === 'market') return { t: b.t, price: b.o };
    if (order.type === 'limit') {
      if (buy && b.l <= order.limit) return { t: b.t, price: Math.min(b.o, order.limit) };
      if (!buy && b.h >= order.limit) return { t: b.t, price: Math.max(b.o, order.limit) };
    } else if (order.type === 'stop') {
      if (buy && b.h >= order.stop) return { t: b.t, price: Math.max(b.o, order.stop) };
      if (!buy && b.l <= order.stop) return { t: b.t, price: Math.min(b.o, order.stop) };
    }
  }
  return null;
}

// ---- Currency exchange -------------------------------------------------------

export function fxSpread(from, to, fxOpen = true, t = Date.now()) {
  return Math.max(currencyInfo(from).spread, currencyInfo(to).spread) * (fxOpen ? 1 : CLOSED_FX_MULTIPLIER);
}

// What `amount` of `from` buys in `to` at `t`: the middle rate less the
// spread (a bank charges the spread of the moment of the exchange, never
// of today), rounded down to
// the currency's smallest unit.
export function quoteExchange(from, to, amount, rates, fxOpen = true, t = Date.now()) {
  if (!rates?.[from] || !rates?.[to] || from === to || !(amount > 0)) return null;
  const mid = rates[from] / rates[to];
  const spread = fxSpread(from, to, fxOpen, t);
  const f = 10 ** currencyInfo(to).digits;
  const received = Math.floor(amount * mid * (1 - spread) * f + 1e-7) / f;
  return { from, to, amount, mid, spread, rate: received / amount, received, spreadTWD: amount * rates[from] - received * rates[to] };
}

// How much `from` it takes to receive `need` of `to`.
export function amountFor(from, to, need, rates, fxOpen = true, t = Date.now()) {
  if (!rates?.[from] || !rates?.[to] || !(need > 0)) return null;
  const f = 10 ** currencyInfo(from).digits;
  let amount = Math.ceil(((need / (rates[from] / rates[to])) / (1 - fxSpread(from, to, fxOpen, t))) * f - 1e-7) / f;
  // Rounding can leave it a unit short.
  for (let i = 0; i < 3 && quoteExchange(from, to, amount, rates, fxOpen, t).received < need; i++) amount += 1 / f;
  return Math.round(amount * f) / f;
}

export function exchange(account, { from, to, amount }, { rates, fxOpen = true, now = Date.now(), id = randomId() }) {
  amount = roundCash(Number(amount), from);
  const q = quoteExchange(from, to, amount, rates, fxOpen, now);
  if (!q) return { error: 'fx' };
  if (!(q.received > 0)) return { error: 'tooSmall' };
  // A person's 結匯 is US$5,000,000 a year each way (stock-access.mjs).
  const cap = fxCapProblem(account, { from, to, amount, received: q.received }, rates, now);
  if (cap) return cap;
  const free = withdrawable(account, replay(account, now), now);
  if ((free[from] || 0) + EPS < amount) {
    const pending = unsettled(account, now)[from] || 0;
    return { error: pending > EPS ? 'unsettled' : 'funds', need: amount, have: Math.max(0, free[from] || 0), currency: from };
  }
  const event = {
    id: `fx:${id}`,
    type: 'fx',
    t: now,
    from,
    to,
    amount,
    received: q.received,
    rate: q.rate,
    mid: q.mid,
    spread: q.spread,
    spreadTWD: q.spreadTWD,
    twdFrom: rates[from],
    twdTo: rates[to],
    usd: rates.USD
  };
  return { account: { ...account, events: [...account.events, event] }, event };
}

// Add money (NT$) to the account; tracked apart from returns.
// The futures account (期貨保證金專戶, FUT_SPLIT): what can be taken out
// (出金): its money free of the margins and orders it holds, less any open
// loss (an open gain isn't money yet). `valuation`: for that open loss.
export function futWithdrawable(account, valuation, now = Date.now()) {
  const s = replay(account, now);
  if (!s.futSplit) return 0;
  return Math.max(0, Math.floor(available(account, s).fut + Math.min(0, valuation?.futTWD || 0)));
}
// 入金 (amount > 0) from the NT$ cash, settled money only (a sale's money
// that hasn't settled isn't in the bank yet), or 出金 (amount < 0) back to
// it. Only with the futures account open (stock-access.mjs). Returns
// { account, event } or { error }.
export function futTransfer(account, amount, { valuation, now = Date.now(), id = randomId() } = {}) {
  const s = replay(account, now);
  amount = Math.round(Number(amount));
  if (!s.futSplit) return { error: 'futNotYet' };
  if (!accessState(account, 'futures', now).open) return { error: 'accessNeeded', key: 'futures', pending: accessState(account, 'futures', now).pending };
  if (!(Math.abs(amount) >= 1 && Math.abs(amount) <= MAX_START)) return { error: 'amount' };
  if (amount > 0) {
    const have = Math.floor(withdrawable(account, s, now)[BASE] || 0);
    if (amount > have) return { error: 'funds', need: amount, have: Math.max(0, have), currency: BASE };
  } else {
    const have = futWithdrawable(account, valuation, now);
    if (-amount > have) return { error: 'futOut', have };
  }
  const event = { id: `futx:${id}`, type: 'futx', t: now, currency: BASE, amount };
  return { account: { ...account, events: [...account.events, event] }, event };
}

export function deposit(account, amount, now = Date.now(), id = randomId()) {
  amount = Math.round(Number(amount));
  if (!(amount > 0 && amount <= MAX_START)) return { error: 'amount' };
  const event = { id: `deposit:${id}`, type: 'deposit', t: now, currency: BASE, amount };
  return { account: { ...account, events: [...account.events, event] }, event };
}

// ---- Time deposits (定存) and securities lending (借券出借) ----------------------
// (savings.mjs has the terms.)

// NT$ cash settled and not held for orders: what can go into a deposit.
const freeCash = (account, s, now) => Math.max(0, withdrawable(account, s, now)[BASE] || 0);

export function openDeposit(account, { amount, months, renew = false }, now = Date.now(), id = randomId()) {
  amount = Math.round(Number(amount));
  const rate = tdRate(Number(months));
  if (rate == null) return { error: 'tdTerm' };
  if (!(amount >= TD_MIN)) return { error: 'tdMin', min: TD_MIN };
  const have = freeCash(account, replay(account, now), now);
  if (amount > have + EPS) return { error: 'funds', need: amount, have, currency: BASE };
  const event = { id: `td:${id}`, type: 'td', t: now, currency: BASE, amount, months: Number(months), rate, ends: addMonths(now, Number(months)), renew: Boolean(renew) };
  return { account: { ...account, events: [...account.events, event] }, event };
}

function tdEnd(td, at) {
  const { gross, early } = tdInterest(td, at);
  return { id: `tdend:${td.id.slice(3)}`, type: 'tdend', t: at, td: td.id, currency: BASE, amount: td.amount, interest: gross, ...incomeTaxes(gross), early };
}

// 解約: closed before maturity, at the early rate.
export function breakDeposit(account, tdId, now = Date.now()) {
  const td = replay(account, now).tds[tdId];
  if (!td) return { error: 'tdGone' };
  const event = tdEnd(td, now);
  return { account: { ...account, events: [...account.events, event] }, event };
}

// Deposits that reached maturity: paid back (dated then), and rolled over
// at the rate posted then when they were set to.
export function matureDeposits(account, now = Date.now()) {
  let next = account;
  for (let guard = 0; guard < 240; guard++) {
    const s = replay(next, now);
    const due = Object.values(s.tds).filter(td => td.ends <= now).sort((a, b) => a.ends - b.ends)[0];
    if (!due) break;
    const events = [tdEnd(due, due.ends)];
    if (due.renew) {
      events.push({ ...due, id: `${due.id}r`, t: due.ends, rate: tdRate(due.months) ?? due.rate, ends: addMonths(due.ends, due.months) });
    }
    next = { ...next, events: [...next.events, ...events] };
  }
  return next;
}

// Shares of a holding that can be lent now: whole lots, settled, not lent
// already, not promised to a sell order, not bought on margin.
export function lendableQty(account, symbol, now = Date.now()) {
  const s = replay(account, now);
  const p = s.positions[symbol];
  if (!p || p.qty <= 0 || !lendable(p.market, p.kind) || p.financed > 0) return 0;
  const free = available(account, s).qty[symbol] || 0;
  const settling = settlingQty(account, symbol, now);
  return Math.max(0, Math.floor((Math.min(free, p.qty - settling) + EPS) / LEND_LOT) * LEND_LOT);
}

// An offer to lend `qty` at a yearly `rate` (the going rate by default):
// lent at once when a borrower takes it, at that rate (one above the going
// rate finds none: lendNoTaker). `renew`: the lender agrees to its two
// renewals (lendEnds).
export function lendShares(account, { symbol, qty, price, rate, renew = false }, now = Date.now(), id = randomId()) {
  const s = replay(account, now);
  const p = s.positions[symbol];
  if (!p || !lendable(p.market, p.kind)) return { error: 'notLendable' };
  if (p.financed > 0) return { error: 'lendFinanced' };
  qty = Number(qty);
  if (!(qty >= LEND_LOT) || qty % LEND_LOT) return { error: 'lendLot', lot: LEND_LOT };
  const can = lendableQty(account, symbol, now);
  if (qty > can + EPS) return { error: 'lendQty', can };
  if (!(price > 0)) return { error: 'noQuote' };
  const going = LEND_RATE[p.kind];
  rate = rate == null ? going : Number(rate);
  if (!(rate >= LEND_RATE_MIN - EPS && rate <= LEND_RATE_MAX + EPS)) return { error: 'lendRate', min: LEND_RATE_MIN, max: LEND_RATE_MAX };
  if (rate > going + EPS) return { error: 'lendNoTaker', rate: going };
  const event = { id: `lend:${id}`, type: 'lend', t: now, symbol, name: p.name, market: p.market, kind: p.kind, currency: p.currency, qty, price, rate, ...(renew ? { renew: true } : {}) };
  return { account: { ...account, events: [...account.events, event] }, event };
}

function lendEnd(lend, at, back, closes = null) {
  const key = lend.id.slice(5);
  const fee = lendFee(lend, back, closes);
  return [
    { id: `recall:${key}`, type: 'recall', t: at, lend: lend.id, back },
    { id: `lendpay:${key}`, type: 'lendpay', t: back, lend: lend.id, symbol: lend.symbol, currency: BASE, ...fee }
  ];
}

// 召回: the shares come back (and the fee is paid) in LEND_RECALL business
// days. `closes`: the shares' daily closes since it was lent (lendFee), for
// the fee day by day.
export function recallShares(account, lendId, now = Date.now(), { closes = null } = {}) {
  const l = replay(account, now).lent[lendId];
  if (!l) return { error: 'lendGone' };
  if (l.back) return { account, back: l.back };
  const back = addWeekdays(now, LEND_RECALL);
  return { account: { ...account, events: [...account.events, ...lendEnd(l, now, back, closes)] }, back };
}

// Contracts past their term end by themselves (dated then). `closesOf`:
// symbol → its daily closes (lendFee).
export function matureLending(account, now = Date.now(), { closesOf = null } = {}) {
  const s = replay(account, now);
  const due = Object.values(s.lent).filter(l => !l.back && lendEnds(l) <= now);
  if (!due.length) return account;
  return { ...account, events: [...account.events, ...due.flatMap(l => lendEnd(l, lendEnds(l), lendEnds(l), closesOf?.(l.symbol) ?? null))] };
}

// Everything lent is called back (a default or a margin call: the broker
// needs the shares to sell).
export function recallAll(account, now = Date.now()) {
  let next = account;
  for (const id of Object.keys(replay(account, now).lent)) next = recallShares(next, id, now).account || next;
  return next;
}

// ---- Valuation ---------------------------------------------------------------

// Everything in NT$ at today's prices and rates. A holding with no quote is
// valued at its last trade price and listed in `stale`.
export function valuate(s, quotes, rates) {
  const rate = cur => rates?.[cur] ?? null;
  const out = { cash: [], positions: [], loans: [], stale: [], missingRates: [] };
  let cashTWD = 0;
  for (const [currency, amount] of Object.entries(s.cash)) {
    const r = rate(currency);
    if (r === null) out.missingRates.push(currency);
    const twd = amount * (r ?? 0);
    cashTWD += twd;
    if (Math.abs(amount) > EPS || currency === BASE) out.cash.push({ currency, amount, twd });
  }
  let longTWD = 0;
  let shortTWD = 0;
  let feesTWD = 0;
  let dayChange = 0;
  let collateral = 0;
  // 融券 collateral the broker holds (the deposit and the sale money): the
  // account's own, counted in its assets.
  let shortCashTWD = 0;
  // Futures: what they'd pay or cost closed now (their margin is in the cash).
  let futTWD = 0;
  let futMarginTWD = 0;
  let futMaintTWD = 0;
  // Written options: what buying them back costs now (their premium came
  // into the cash; their margin is held there, with the futures').
  let optShortTWD = 0;
  // The initial margin the risk indicator measures against.
  let futInitTWD = 0;
  for (const p of Object.values(s.positions)) {
    const q = quotes?.get?.(p.symbol);
    if (p.kind === 'opt' && p.qty < 0) {
      if (!q) out.stale.push(p.symbol);
      const m = OPTION.mult;
      const avg = Math.abs(p.cost / p.qty / m);
      const price = q?.price ?? p.last ?? avg;
      const value = price * p.qty * m;
      const pl = value - p.costTWD;
      const from = q ? (p.first > (q.session?.start ?? Infinity) ? avg : q.prev) : price;
      const day = (price - from) * p.qty * m;
      optShortTWD -= value;
      futMarginTWD += -p.qty * (p.im || optWriteMargin(p.symbol, price, q?.index, q?.optMargin));
      // (Against the equity, which has their cost to buy back taken off: the margin past the premium.)
      futInitTWD += -p.qty * (optWriteMargin(p.symbol, price, q?.index, q?.optMargin) - price * m);
      futMaintTWD += -p.qty * (optWriteMargin(p.symbol, price, q?.index, q?.optMargin, true) - price * m);
      dayChange += day;
      out.positions.push({
        ...p, short: true, quote: q || null, price, avg, value, valueTWD: value, pl, plLocal: pl, plPct: p.costTWD ? pl / Math.abs(p.costTWD) : 0, dayTWD: day, dayPct: q ? q.pct : 0
      });
      continue;
    }
    if (p.kind === 'fut') {
      if (!q) out.stale.push(p.symbol);
      const price = q?.price ?? p.last ?? p.mark;
      const mult = p.mult || 1;
      const open = (price - p.mark) * mult * p.qty;
      const pl = (price - p.entry) * mult * p.qty;
      const from = q ? (p.first > (q.session?.start ?? Infinity) ? p.entry : q.prev) : price;
      const day = (price - from) * mult * p.qty;
      const [im, mm] = futMargin(p.symbol, q, price);
      futTWD += open;
      futMarginTWD += Math.abs(p.qty) * (p.im || im);
      futInitTWD += Math.abs(p.qty) * (p.im || im);
      futMaintTWD += Math.abs(p.qty) * mm;
      dayChange += day;
      out.positions.push({
        ...p, short: p.qty < 0, quote: q || null, price, avg: p.entry, value: open, valueTWD: open, notional: price * mult * Math.abs(p.qty),
        pl, plLocal: pl, plPct: p.im ? pl / (p.im * Math.abs(p.qty)) : 0, dayTWD: day, dayPct: q ? q.pct : 0
      });
      continue;
    }
    const r = rate(p.currency);
    if (r === null) out.missingRates.push(p.currency);
    if (!q) out.stale.push(p.symbol);
    // (An option's price is in points: NT$ OPTION.mult each.)
    const m = p.kind === 'opt' ? OPTION.mult : 1;
    const price = q?.price ?? p.last ?? Math.abs(p.cost / p.qty / m);
    const value = price * p.qty * m;
    const valueTWD = value * (r ?? 0);
    const fee = (p.borrowFee || 0) * (r ?? 0);
    const pl = valueTWD - p.costTWD - fee;
    // Today's move, in NT$ at today's rate (a position opened today moves
    // from its own price, not yesterday's close).
    const from = q ? (p.first > (q.session?.start ?? Infinity) ? Math.abs(p.cost / p.qty / m) : q.prev) : price;
    const day = (price - from) * p.qty * m * (r ?? 0);
    dayChange += day;
    if (p.qty > 0) {
      longTWD += valueTWD;
      collateral += valueTWD * collateralRate(p.kind, p.market, p.symbol);
    } else {
      shortTWD -= valueTWD;
      feesTWD += fee;
      shortCashTWD += ((p.shortDeposit || 0) + (p.shortHeld || 0) + (p.shortInterest || 0)) * (r ?? 0);
    }
    out.positions.push({
      ...p,
      short: p.qty < 0,
      quote: q || null,
      price,
      avg: Math.abs(p.cost / p.qty / m),
      value,
      valueTWD,
      pl,
      plLocal: value - p.cost - (p.borrowFee || 0),
      plPct: p.costTWD ? pl / Math.abs(p.costTWD) : 0,
      dayTWD: day,
      dayPct: q ? q.pct : 0
    });
  }
  let debtTWD = feesTWD;
  for (const loan of Object.values(s.loans)) {
    if (loan.balance <= EPS) continue;
    const twd = loan.balance * (rate(loan.currency) ?? 0);
    debtTWD += twd;
    out.loans.push({ ...loan, twd });
  }
  const assets = cashTWD + longTWD + shortCashTWD + futTWD;
  const owed = debtTWD + shortTWD;
  const receivable = s.receivable || 0;
  // Time deposits are the bank's, not collateral: in net worth, not assets.
  const tds = Object.values(s.tds || {}).sort((a, b) => a.ends - b.ends);
  const savedTWD = tds.reduce((sum, td) => sum + td.amount, 0);
  const lentByPos = {};
  for (const l of Object.values(s.lent || {})) lentByPos[l.symbol] = (lentByPos[l.symbol] || 0) + l.qty;
  for (const p of out.positions) p.lent = lentByPos[p.symbol] || 0;
  const netWorth = assets + receivable + savedTWD - owed - optShortTWD;
  for (const p of out.positions) p.weight = assets ? Math.abs(p.valueTWD) / assets : 0;
  out.positions.sort((a, b) => Math.abs(b.valueTWD) - Math.abs(a.valueTWD));
  out.cash.sort((a, b) => (a.currency === BASE ? -1 : b.currency === BASE ? 1 : b.twd - a.twd));
  const interestTWD = Object.values(s.loans).reduce((sum, l) => sum + l.interest * (rate(l.currency) ?? 0), 0);
  const ratio = owed > EPS ? assets / owed : Infinity;
  return {
    ...out,
    cashTWD,
    shortCashTWD,
    tds,
    savedTWD,
    lent: Object.values(s.lent || {}).sort((a, b) => a.t - b.t),
    lendIncome: s.lendIncome || 0,
    holdingsTWD: longTWD - shortTWD + futTWD - optShortTWD,
    // Futures: their open gain or loss, margin held, and whether the account's
    // NT$ (with that) is under the maintenance margin (保證金追繳) or a quarter
    // of the initial (風險指標 25%: the broker closes them, futRisk).
    futTWD,
    futMarginTWD,
    // (Written options count in both: their margin, and what buying them back costs.)
    optShortTWD,
    // (The futures account's money once split: 權益數 is it, the open gains
    // and losses, less what buying back written options costs.)
    futCash: s.futSplit ? s.futCash : null,
    futEquity: (s.futSplit ? s.futCash : s.cash[BASE] || 0) + futTWD - optShortTWD,
    futCall: futMarginTWD > 0 && (s.futSplit ? s.futCash : s.cash[BASE] || 0) + futTWD - optShortTWD < futMaintTWD,
    futRisk: futMarginTWD > 0 && (s.futSplit ? s.futCash : s.cash[BASE] || 0) + futTWD - optShortTWD < futInitTWD * 0.25,
    longTWD,
    shortTWD,
    assets,
    debtTWD,
    owed,
    netWorth,
    receivable,
    deposits: s.deposits,
    totalReturn: netWorth - s.deposits,
    totalReturnPct: s.deposits ? netWorth / s.deposits - 1 : 0,
    dayChange,
    unrealized: out.positions.reduce((sum, p) => sum + p.pl, 0),
    realized: s.realized,
    dividends: s.dividends,
    interestTWD,
    paid: { ...s.paid, interest: interestTWD, borrow: s.paid.borrow + feesTWD },
    collateral,
    capacity: Math.max(0, collateral - debtTWD - shortTWD * 0.5),
    ratio,
    margin: ratio < MARGIN_LIQUIDATE ? 'liquidate' : ratio < MARGIN_CALL ? 'call' : 'ok',
    byKind: groupBy(out.positions.filter(p => !p.short), p => p.kind, cashTWD),
    byCurrency: currencyExposure(s, out.positions, rates)
  };
}

function groupBy(positions, key, cashTWD) {
  const groups = {};
  for (const p of positions) groups[key(p)] = (groups[key(p)] || 0) + p.valueTWD;
  if (cashTWD > EPS) groups.cash = cashTWD;
  return groups;
}

// How much of the account (holdings, cash, less loans) is in each currency.
function currencyExposure(s, positions, rates) {
  const out = {};
  for (const [cur, amount] of Object.entries(s.cash)) out[cur] = (out[cur] || 0) + amount * (rates?.[cur] ?? 0);
  for (const p of positions) out[p.currency] = (out[p.currency] || 0) + p.valueTWD;
  for (const loan of Object.values(s.loans)) out[loan.currency] = (out[loan.currency] || 0) - loan.balance * (rates?.[loan.currency] ?? 0);
  for (const k of Object.keys(out)) if (Math.abs(out[k]) < 0.5) delete out[k];
  return out;
}

// ---- Loans -------------------------------------------------------------------

// The yearly rate a loan taken now carries.
export const loanRateAt = currency => currencyInfo(currency).loanRate;
export function borrow(account, { currency, amount }, { valuation, rates, now = Date.now(), id = randomId() }) {
  amount = roundCash(Number(amount), currency);
  if (!(amount > 0)) return { error: 'amount' };
  if (!rates?.[currency]) return { error: 'noRate' };
  if (valuation.margin !== 'ok') return { error: 'margin' };
  if (amount * rates[currency] > valuation.capacity + EPS) return { error: 'capacity', capacity: valuation.capacity };
  const event = { id: `borrow:${id}`, type: 'borrow', t: now, currency, amount, rate: loanRateAt(currency, now) };
  return { account: { ...account, events: [...account.events, event] }, event };
}

export function repay(account, { currency, amount, symbol }, { now = Date.now(), id = randomId() } = {}) {
  const s = replay(account, now);
  const loan = s.loans[currency];
  if (!loan || loan.balance <= EPS) return { error: 'noLoan' };
  const avail = available(account, s).cash[currency] || 0;
  const f = 10 ** currencyInfo(currency).digits;
  // Paying "everything" pays the interest accrued to this moment, rounded up.
  const owed = Math.ceil(loan.balance * f - 1e-7) / f;
  amount = Math.min(roundCash(Number(amount), currency), owed);
  if (!(amount > 0)) return { error: 'amount' };
  if (amount > avail + EPS) return { error: 'funds', need: amount, have: Math.max(0, avail), currency };
  const event = { id: `repay:${id}`, type: 'repay', t: now, currency, amount };
  // Paid against one holding's 融資 (補繳, 現金償還): that holding's loan goes down.
  if (symbol) event.symbol = symbol;
  return { account: { ...account, events: [...account.events, event] }, event };
}

// Pays off every loan it can: first from cash in the loan's own currency,
// then by exchanging NT$ and other cash. Used after a forced sale.
export function repayAll(account, rates, fxOpen, now = Date.now()) {
  let next = account;
  let seq = 0;
  const nextId = () => `${now.toString(36)}${(seq++).toString(36)}`;
  for (const currency of Object.keys(replay(next, now).loans)) {
    for (let round = 0; round < 12; round++) {
      const s = replay(next, now);
      const loan = s.loans[currency];
      if (!loan || loan.balance <= EPS) break;
      const avail = available(next, s).cash;
      const own = avail[currency] || 0;
      if (own > EPS) {
        // Against the holding bought on margin (largest first), so it's no
        // longer counted as financed; then any loan not tied to one.
        const tied = Object.values(s.positions).filter(p => p.currency === currency && p.financed > EPS).sort((a, b) => b.financed - a.financed)[0];
        const amount = tied ? Math.min(own, tied.financed, loan.balance) : Math.min(own, loan.balance + 1);
        const r = repay(next, { currency, amount, symbol: tied?.symbol }, { now, id: nextId() });
        if (r.error) break;
        next = r.account;
        continue;
      }
      // Other cash, NT$ first, then the largest: settled only (交割中 sale
      // money can't be exchanged until it's in).
      const sources = Object.entries(withdrawable(next, s, now))
        .filter(([c, v]) => c !== currency && v > EPS && rates?.[c])
        .sort(([a, va], [b, vb]) => (a === BASE ? -1 : b === BASE ? 1 : vb * rates[b] - va * rates[a]));
      if (!sources.length) break;
      const [from, has] = sources[0];
      const need = amountFor(from, currency, Math.ceil(loan.balance * 100) / 100, rates, fxOpen, now);
      const x = exchange(next, { from, to: currency, amount: Math.min(has, need) }, { rates, fxOpen, now, id: nextId() });
      if (x.error) break;
      next = x.account;
    }
  }
  return next;
}

// Below the liquidation ratio, the broker sells: the largest holdings first,
// until what's sold covers the debt. Returns the orders to place (none while
// earlier forced sales are still open).
// A default (an overdraft the account let run past its deadline, sold for)
// is on its record: DEFAULT_PENALTY of what was owed is charged (違約金, the
// most Taiwan's rules allow), and for DEFAULT_BAN no 融資 and no short
// selling (a broker's credit account goes with a default).
export const DEFAULT_PENALTY = 0.07;
export const DEFAULT_BAN = 5 * 365 * 86_400_000;
export const defaulted = (account, now = Date.now()) => Boolean(account?.defaultAt) && now - account.defaultAt < DEFAULT_BAN;
export const penaltyEvent = (owedTWD, now = Date.now()) => ({ id: `penalty:${now}`, type: 'penalty', t: now, currency: BASE, amount: Math.ceil(owedTWD * DEFAULT_PENALTY - 1e-6) });

// A margin call not met by its deadline (斷頭): every short bought back and
// every holding bought on margin sold whole; with loans from before 融資 was
// tied to purchases, holdings largest first until the loans are covered.
export function callPlan(account, valuation) {
  if (account.orders.some(o => o.status === 'open' && o.forced)) return [];
  const plan = valuation.positions.filter(p => p.short).map(p => ({ symbol: p.symbol, side: 'buy', type: 'market', qty: -p.qty, forced: true }));
  const financed = valuation.positions.filter(p => !p.short && p.financed > 0);
  for (const p of financed) plan.push({ symbol: p.symbol, side: 'sell', type: 'market', qty: p.qty, forced: true });
  // (Bought on margin, so never lent.)
  let covered = valuation.cashTWD - valuation.shortTWD + financed.reduce((sum, p) => sum + p.valueTWD, 0);
  for (const p of valuation.positions.filter(x => !x.short && !(x.financed > 0) && x.qty - (x.lent || 0) > EPS)) {
    if (covered >= valuation.debtTWD * 1.02) break;
    const qty = p.qty - (p.lent || 0);
    plan.push({ symbol: p.symbol, side: 'sell', type: 'market', qty, forced: true });
    covered += (p.valueTWD * qty) / p.qty;
  }
  return plan;
}

// ---- 追繳: a margin call, as Taiwan's brokers run it -------------------------------
//
// The ratio is judged on closing prices: a dip under 130% while Taiwan is
// trading calls nothing yet. After the close it's a call (追繳通知), due by
// the close of the second business day after. Paying cash against the loans
// (補繳), repaying or selling can meet it; it's cancelled back at 166%, or
// once the 差額 notified (call.need) is paid in full, bit by bit or at once
// (TWSE 融資融券業務操作辦法 §55(3), (4)). At the deadline: under 130% still, the margin holdings are sold from the
// next business day (the orders wait for its open); between 130% and 166%
// nothing is sold yet, but the call stands, and a later fall under 130% is
// sold the next business day with no new grace.
const twTime = (day, hm) => Date.parse(`${day}T${hm}:00+08:00`);
export const twSession = t => {
  const day = taipeiDay(t);
  return isTradingDay('TW', day) && t >= twTime(day, '09:00') && t < twTime(day, '13:30');
};
// The last Taiwan close at or before `t`.
export function lastTwClose(t) {
  let day = taipeiDay(t);
  for (let i = 0; i < 40; i++) {
    if (isTradingDay('TW', day) && twTime(day, '13:30') <= t) return twTime(day, '13:30');
    day = taipeiDay(twTime(day, '12:00') - 86_400_000);
  }
  return t;
}
// The deadline of a call issued at `t`: the close of the second business day
// after the close it was judged on.
export function callDeadline(t) {
  let x = lastTwClose(t);
  for (let n = 0, i = 0; n < 2 && i < 40; i++) {
    x += 86_400_000;
    if (isTradingDay('TW', taipeiDay(x))) n++;
  }
  return x;
}
// NT$ to pay against the loans to bring the ratio back to 166% (補繳金額):
// paying x takes x off both sides, (assets − x) / (owed − x) = 166%. Only
// loans can be paid down; a call from shorts beyond that needs buying back.
export function callNeed(v) {
  if (!(v.owed > EPS) || v.ratio >= MARGIN_RESTORE) return 0;
  return Math.max(0, Math.ceil((MARGIN_RESTORE * v.owed - v.assets) / (MARGIN_RESTORE - 1)));
}
// NT$ paid against the loans since a call was issued (補繳): the account's
// own cash paid in (repay events), not what a sale repaid. Another
// currency's at `rates` (NT$ per unit), left out without one.
export function callPaid(account, call, rates = {}) {
  if (!call) return 0;
  const sold = new Set((account?.events || []).filter(e => e.type === 'fill' && e.side === 'sell').map(e => `repay:${e.orderId}`));
  let paid = 0;
  for (const e of account?.events || []) {
    if (e.type !== 'repay' || !(e.t >= call.since) || sold.has(e.id)) continue;
    const r = e.currency === BASE ? 1 : rates?.[e.currency];
    if (r > 0) paid += e.amount * r;
  }
  return paid;
}
// Where a call stands at a check: { call (to keep on the account, or null),
// sell (sell the margin holdings now), event ('issued' | 'met' | 'cleared' |
// 'intraday' | null), paid (met by paying the 差額 in full) }. `paid`: NT$
// paid since it was issued (callPaid).
export function callState(call, v, now = Date.now(), paid = 0) {
  if (!(v.owed > EPS)) return { call: null, sell: false, event: call ? 'cleared' : null };
  if (call && v.ratio >= MARGIN_RESTORE) return { call: null, sell: false, event: 'met' };
  if (call && call.need > 0 && paid >= call.need - 0.5) return { call: null, sell: false, event: 'met', paid: true };
  if (!call) {
    if (v.ratio >= MARGIN_CALL) return { call: null, sell: false, event: null };
    if (twSession(now)) return { call: null, sell: false, event: 'intraday' };
    return { call: { since: now, due: callDeadline(now), need: callNeed(v) }, sell: false, event: 'issued' };
  }
  const due = call.due ?? callDeadline(call.since);
  return { call: { ...call, due }, sell: now >= due && v.ratio < MARGIN_CALL, event: null };
}

// Pays up to `amountTWD` of the loans from the account's own cash (補繳 or
// 現金償還): NT$ loans first, each against the holdings bought on margin
// (largest loan first, then any loan not tied to one); a loan in another
// currency from cash in it, then by exchanging NT$. Returns { account, paid }.
export function payDown(account, amountTWD, { rates, fxOpen = true, now = Date.now() } = {}) {
  let next = account;
  let left = Math.max(0, Number(amountTWD) || 0);
  let seq = 0;
  const nextId = () => `pd${now.toString(36)}${(seq++).toString(36)}`;
  const first = replay(account, now);
  const currencies = Object.keys(first.loans).filter(c => first.loans[c].balance > EPS && rates?.[c]).sort((a, b) => (a === BASE ? -1 : b === BASE ? 1 : 0));
  for (const currency of currencies) {
    const r = rates[currency];
    for (let round = 0; round < 24 && left >= 0.5; round++) {
      const s = replay(next, now);
      const loan = s.loans[currency];
      if (!loan || loan.balance <= EPS) break;
      const avail = available(next, s).cash;
      const own = Math.max(0, avail[currency] || 0);
      const want = Math.min(loan.balance, left / r);
      if (own > EPS) {
        const tied = Object.values(s.positions).filter(p => p.currency === currency && p.financed > EPS).sort((a, b) => b.financed - a.financed)[0];
        const amount = Math.min(own, want, tied ? tied.financed : Infinity);
        const x = repay(next, { currency, amount, symbol: tied?.symbol }, { now, id: nextId() });
        if (x.error) break;
        next = x.account;
        left -= x.event.amount * r;
        continue;
      }
      if (currency === BASE) break;
      // NT$ to exchange: settled only (not 交割中 sale money).
      const has = Math.max(0, withdrawable(next, s, now)[BASE] || 0);
      if (has <= EPS) break;
      const fx = exchange(next, { from: BASE, to: currency, amount: Math.min(has, amountFor(BASE, currency, want, rates, fxOpen, now)) }, { rates, fxOpen, now, id: nextId() });
      if (fx.error) break;
      next = fx.account;
    }
  }
  return { account: next, paid: Math.max(0, Number(amountTWD) || 0) - Math.max(0, left) };
}

export function liquidationPlan(account, valuation) {
  if (valuation.margin !== 'liquidate') return [];
  if (account.orders.some(o => o.status === 'open' && o.forced)) return [];
  // Every short is bought back; then holdings are sold, largest first,
  // until what's sold covers the loans.
  const plan = valuation.positions.filter(p => p.short).map(p => ({ symbol: p.symbol, side: 'buy', type: 'market', qty: -p.qty, forced: true }));
  let covered = valuation.cashTWD - valuation.shortTWD;
  // Lent shares can't be sold until they're back (recallAll calls them).
  for (const p of valuation.positions.filter(x => !x.short && x.qty - (x.lent || 0) > EPS)) {
    if (covered >= valuation.debtTWD * 1.02) break;
    const qty = p.qty - (p.lent || 0);
    plan.push({ symbol: p.symbol, side: 'sell', type: 'market', qty, forced: true });
    covered += (p.valueTWD * qty) / p.qty;
  }
  return plan;
}

// Selling to cover an overdraft (the Orbit pool below zero, NT$ cash
// negative): the fewest sales that raise `owedTWD` (plus 1% for costs), from
// the largest holdings down, each only as much as it needs (rounded up to
// what can be traded). Holdings with no price now are skipped.
export function coverPlan(valuation, owedTWD) {
  const plan = [];
  let left = owedTWD * 1.01;
  const longs = valuation.positions.filter(p => !p.short && p.qty > 0 && p.valueTWD > 0 && isTradable(p.kind)).sort((a, b) => b.valueTWD - a.valueTWD);
  for (const p of longs) {
    if (left <= 0) break;
    const unit = p.valueTWD / p.qty;
    const step = qtyStep(p.kind);
    const free = p.qty - (p.lent || 0);
    let qty = Math.min(free, Math.ceil(left / unit / step) * step);
    qty = roundQty(qty, p.kind);
    if (!(qty > 0)) continue;
    plan.push({ symbol: p.symbol, qty, twd: qty * unit, all: qty >= p.qty });
    left -= qty * unit;
  }
  return { plan, covered: left <= 0 };
}

// While the page was closed, a loan or a short could have fallen below the
// liquidation ratio and recovered since; a broker would have sold then. This
// walks `times` (the moments prices are known for, oldest first), values
// the account at each with priceAt(symbol, t) and rateAt(currency, t), and
// where it's below the line, buys shorts back and sells holdings at that
// moment's prices, dated then, and repays the loans. Returns the forced fills.
export function marginHistory(account, { times, priceAt, rateAt }) {
  let next = account;
  const forced = [];
  for (const t of times) {
    const s = replay(next, t);
    const owes = Object.values(s.loans).some(l => l.balance > EPS) || Object.values(s.positions).some(p => p.qty < -EPS);
    if (!owes) continue;
    const rates = { [BASE]: 1 };
    const currencies = new Set([...Object.keys(s.cash), ...Object.keys(s.loans), ...Object.values(s.positions).map(p => p.currency)]);
    let known = true;
    for (const c of currencies) {
      if (c === BASE) continue;
      rates[c] = rateAt(c, t);
      if (!(rates[c] > 0)) known = false;
    }
    if (!known) continue;
    const quotes = new Map();
    for (const p of Object.values(s.positions)) {
      const price = priceAt(p.symbol, t) ?? p.last;
      quotes.set(p.symbol, { symbol: p.symbol, price, prev: price, kind: p.kind, market: p.market, currency: p.currency });
    }
    const v = valuate(s, quotes, rates);
    if (v.margin !== 'liquidate') continue;
    for (const plan of liquidationPlan(next, v)) {
      const p = s.positions[plan.symbol];
      const order = {
        id: `forced:${plan.symbol}:${t}`, symbol: plan.symbol, name: p.name, kind: p.kind, market: p.market, currency: p.currency,
        side: plan.side, type: 'market', qty: plan.qty, t, status: 'open', rev: 1, forced: true, reserve: 0
      };
      const r = fillOrder({ ...next, orders: [...next.orders, order] }, order, quotes.get(plan.symbol).price, rates, t, t);
      next = r.account;
      if (r.fill) forced.push(r.fill);
    }
    next = repayAll(next, rates, true, t);
  }
  return { account: next, forced };
}

// ---- Dividends and splits ----------------------------------------------------

// Shares of `symbol` held just before `t`: bought and sold, split, and a
// 新股申購 won (its shares the account's from the listing day, as replay
// counts them: only for an application it has).
function sharesAt(account, symbol, t) {
  let qty = 0;
  const applied = new Set(account.events.filter(e => e.type === 'ipo').map(e => `${e.code}:${e.draw}`));
  for (const e of [...account.events].sort(byTime)) {
    if (e.t >= t) break;
    if (e.symbol !== symbol) continue;
    if (e.type === 'fill') qty += e.side === 'buy' ? e.qty : -e.qty;
    else if (e.type === 'ipowin' && applied.has(`${e.code}:${e.draw}`)) qty += e.qty;
    else if (e.type === 'split') qty = e.par && qty > 0 ? Math.floor(qty * e.ratio + EPS) : qty * e.ratio;
  }
  return Math.abs(qty) > EPS ? qty : 0;
}
// What puts shares of `symbol` in the account: a trade, or a 新股申購 won.
const holdingEvents = (account, symbol) => account.events.filter(e => (e.type === 'fill' || e.type === 'ipowin') && e.symbol === symbol);

// Yahoo's pay date for the dividend that went ex at `ex`: its fundamentals'
// dividendDate when their exDividendDate (a UTC midnight) is that day.
const utcDay = t => new Date(t).toISOString().slice(0, 10);
const payDayOf = (market, ex, exDividendDate, dividendDate) => (exDividendDate > 0 && dividendDate > 0 && utcDay(exDividendDate) === localDayOf(ex, market) ? dividendDate : null);

// Credits the dividends and applies the splits of `symbol` that happened
// while it was held. Yahoo's dividend amounts are adjusted for later splits,
// so each is scaled back to the shares of its own day. A dividend counts on
// its ex-date (shares held then) and is paid on its pay date: Yahoo's
// (fundamentals' dividendDate, for the dividend that went ex on their
// exDividendDate) where it's given, else its market's usual pay day, a
// trading day (divPayDate).
export function applyCorporateActions(account, symbol, { dividends = [], splits = [], exDividendDate = null, dividendDate = null }, { rates, now = Date.now() }) {
  const fills = holdingEvents(account, symbol);
  if (!fills.length) return { account, added: [] };
  const first = Math.min(...fills.map(e => e.t));
  const info = fills[0];
  const have = new Set(account.events.map(e => e.id));
  let next = account;
  const added = [];
  for (const sp of splits) {
    const id = `split:${symbol}:${taipeiDay(sp.date)}`;
    if (sp.date <= first || sp.date > now || have.has(id) || !(sp.ratio > 0) || sp.ratio === 1) continue;
    if (!sharesAt(next, symbol, sp.date)) continue;
    const event = { id, type: 'split', t: sp.date, symbol, ratio: sp.ratio };
    // A Taiwan 配股 (a ratio like 1.05): whole shares, the fraction in cash
    // at the NT$10 par, NHI on the new shares at par (replay).
    const held = sharesAt(next, symbol, sp.date);
    if (info.market === 'TW' && sp.ratio > 1 && !Number.isInteger(sp.ratio) && held > 0) {
      const whole = Math.floor(held * sp.ratio + EPS);
      Object.assign(event, { par: 10, cash: Math.floor((held * sp.ratio - whole) * 10 + EPS), nhi: nhiPremium((whole - held) * 10) });
    }
    next = { ...next, events: [...next.events, event] };
    added.push(event);
    // An order waiting from before it is deleted, as a Taiwan broker deletes
    // its 長效單 on a stock's 除權 or 面額變更 (its price and shares were the old
    // stock's); the money or shares it held come free.
    for (const o of next.orders || []) if (o.status === 'open' && o.symbol === symbol && o.t < sp.date) next = updateOrder(next, { ...o, status: 'cancelled', reason: 'split', rev: (o.rev || 0) + 1, done: sp.date });
  }
  const rate = rates?.[info.currency];
  if (!rate) return { account: next, added };
  for (const d of dividends) {
    const id = `div:${symbol}:${taipeiDay(d.date)}`;
    if (d.date <= first || d.date > now || have.has(id) || !(d.amount > 0)) continue;
    const shares = sharesAt(next, symbol, d.date);
    if (!shares) continue;
    const later = splits.filter(sp => sp.date > d.date).reduce((k, sp) => k * sp.ratio, 1);
    const perShare = d.amount * later;
    const gross = roundCash(shares * perShare, info.currency);
    if (!gross) continue;
    // A short position pays the dividend to the lender, untaxed.
    const taxes = gross > 0 ? dividendTaxes(info.market, gross, symbol) : { withheld: 0, nhi: 0, fee: 0, net: gross };
    // Owed from the ex-date, paid some days later (until then it's pending).
    const event = {
      id, type: 'div', t: divPayDate(info.market, d.date, payDayOf(info.market, d.date, exDividendDate, dividendDate)), ex: d.date, symbol, name: info.name, market: info.market, kind: info.kind, currency: info.currency,
      shares, perShare, gross, withheld: taxes.withheld, nhi: taxes.nhi, ...(taxes.fee ? { fee: taxes.fee } : {}), net: roundCash(taxes.net, info.currency), twd: rate
    };
    next = { ...next, events: [...next.events, event] };
    added.push(event);
  }
  return { account: next, added };
}

// ---- Government bonds: coupons and repayment -----------------------------------

// Credits each coupon paid while the bond was held (less the issuer's tax)
// and, once it matures, repays the face value (a sale at par, no costs).
export function applyBondCashflows(account, symbol, { rates, now = Date.now() }) {
  const bond = BONDS[symbol];
  const fills = account.events.filter(e => e.type === 'fill' && e.symbol === symbol);
  if (!bond || !fills.length) return { account, added: [] };
  const rate = rates?.[bond.currency];
  if (!rate) return { account, added: [] };
  const first = Math.min(...fills.map(e => e.t));
  const info = fills[0];
  const have = new Set(account.events.map(e => e.id));
  let next = account;
  const added = [];
  const perBond = (bond.face * bond.coupon) / 100 / bond.freq;
  if (perBond > 0) {
    for (const d of couponDates(bond, first)) {
      const id = `cpn:${symbol}:${taipeiDay(d)}`;
      if (d <= first || d > now || have.has(id)) continue;
      const shares = sharesAt(next, symbol, d);
      if (!(shares > 0)) continue;
      const gross = roundCash(shares * perBond, bond.currency);
      const withheld = roundCash(gross * bond.tax, bond.currency);
      const event = {
        id, type: 'div', coupon: true, t: d, symbol, name: info.name, market: 'BOND', kind: 'govbond', currency: bond.currency,
        shares, perShare: perBond, gross, withheld, nhi: 0, net: roundCash(gross - withheld, bond.currency), twd: rate
      };
      next = { ...next, events: [...next.events, event] };
      added.push(event);
    }
  }
  const matureId = `mature:${symbol}`;
  if (now >= bond.maturity && !have.has(matureId)) {
    const shares = sharesAt(next, symbol, bond.maturity + 1);
    if (shares > 0) {
      const total = roundCash(shares * bond.face, bond.currency);
      const event = {
        id: matureId, type: 'fill', maturity: true, t: bond.maturity + 1, orderId: null, symbol, name: info.name, kind: 'govbond', market: 'BOND',
        currency: bond.currency, side: 'sell', qty: shares, price: bond.face, quote: bond.face, gross: total, commission: 0, tax: 0, fee: 0, total, twd: rate
      };
      next = { ...next, events: [...next.events, event] };
      added.push(event);
    }
  }
  return { account: next, added };
}

// A Taiwan convertible bond held to its maturity (cbMaturity): repaid at
// face, 100 a unit (NT$100,000 a 張), with no costs, on the day.
export function applyCbMaturity(account, symbol, { now = Date.now() } = {}) {
  const maturity = cbMaturity(symbol);
  const id = `mature:${symbol}`;
  if (!maturity || now < maturity || account.events.some(e => e.id === id)) return { account, added: [] };
  const info = account.events.find(e => e.type === 'fill' && e.symbol === symbol);
  const qty = info ? sharesAt(account, symbol, maturity) : 0;
  if (!(qty > 0)) return { account, added: [] };
  const total = qty * 100;
  const event = {
    id, type: 'fill', maturity: true, t: maturity, orderId: null, symbol, name: info.name, kind: 'cb', market: 'TW',
    currency: 'TWD', side: 'sell', qty, price: 100, quote: 100, gross: total, commission: 0, tax: 0, fee: 0, total, twd: 1
  };
  return { account: { ...account, events: [...account.events, event] }, added: [event] };
}

// A future held at its expiry: closed at TAIFEX's final settlement price
// (`final`, the month's), at the expiry, with no commission (期交稅 on the
// final settlement's value only).
export function applyFutExpiry(account, symbol, final, { now = Date.now() } = {}) {
  const expiry = futureExpiry(symbol);
  const id = `mature:${symbol}`;
  if (!expiry || now < expiry || !(final > 0) || account.events.some(e => e.id === id)) return { account, added: [] };
  const held = replay(account, expiry).positions[symbol];
  if (!held || Math.abs(held.qty) <= EPS) return { account, added: [] };
  const side = held.qty > 0 ? 'sell' : 'buy';
  const qty = Math.abs(held.qty);
  const gross = final * qty;
  const { tax } = tradeCosts({ market: 'TAIFEX', side, kind: 'fut', gross, qty, currency: BASE, discount: 0, symbol });
  const event = {
    id, type: 'fill', maturity: true, t: expiry, orderId: null, symbol, name: held.name, kind: 'fut', market: 'TAIFEX',
    currency: BASE, side, qty, price: final, quote: final, gross, commission: 0, tax, fee: 0, total: side === 'sell' ? gross - tax : gross + tax, twd: 1
  };
  return { account: { ...account, events: [...account.events, event] }, added: [event] };
}

// An option held at its expiry: settled in cash at what it's worth at
// TAIFEX's final price (`final`), sold at that (no commission, the 期交稅 on
// what it pays); one that pays nothing just ends (sold at 0). A written one
// is assigned: bought back at that value (its margin freed).
export function applyOptExpiry(account, symbol, final, { now = Date.now() } = {}) {
  const expiry = optionExpiry(symbol);
  const id = `mature:${symbol}`;
  if (!expiry || now < expiry || !(final > 0) || account.events.some(e => e.id === id)) return { account, added: [] };
  const held = replay(account, expiry).positions[symbol];
  if (!held || Math.abs(held.qty) <= EPS) return { account, added: [] };
  const side = held.qty > 0 ? 'sell' : 'buy';
  const qty = Math.abs(held.qty);
  const price = optionIntrinsic(symbol, final);
  const gross = price * qty * OPTION.mult;
  const tax = Math.round(gross * tradeCosts({ market: 'TAIFEX', side, kind: 'opt', gross: 1, qty: 0, currency: BASE }).taxRate);
  const event = {
    id, type: 'fill', maturity: true, t: expiry, orderId: null, symbol, name: held.name, kind: 'opt', market: 'TAIFEX',
    currency: BASE, side, qty, price, quote: final, gross, commission: 0, tax, fee: 0, total: side === 'sell' ? gross - tax : gross + tax, twd: 1
  };
  return { account: { ...account, events: [...account.events, event] }, added: [event] };
}

// ---- History: net worth over time, benchmarks --------------------------------

// Net worth at the end of each of `days`, rebuilt from the log and each
// day's closing prices and rates: priceAt(symbol, t) and rateAt(currency, t)
// return null when unknown (the last trade price is used then).
export function netWorthSeries(account, days, priceAt, rateAt) {
  // One pass over the log (days in order): the account at each day is the
  // one before it plus that day's events; what accrues to the day itself
  // (loan interest, a short's fee) is added to the figures, not kept, so
  // each day's is exactly replay(account, day)'s.
  const order = days.map((t, i) => [t, i]).sort((a, b) => a[0] - b[0]);
  const events = [...(account.events || [])].sort(byTime);
  const divs = events.filter(e => e.type === 'div' && e.ex != null);
  const s = startState(account);
  const found = [];
  let i = 0;
  for (const [t, at] of order) {
    if (t < account.created) continue;
    for (; i < events.length && events[i].t <= t; i++) {
      accrue(s, events[i].t);
      applyEvent(s, events[i]);
    }
    let nw = divs.reduce((sum, e) => (e.ex <= t && e.t > t ? sum + e.net * (e.twd || 1) : sum), 0);
    let ok = true;
    for (const [cur, amount] of Object.entries(s.cash)) {
      if (!amount || Math.abs(amount) < EPS) continue;
      const r = rateAt(cur, t);
      if (!r) ok = false;
      nw += amount * (r || 0);
    }
    for (const p of Object.values(s.positions)) {
      const r = rateAt(p.currency, t);
      if (!r) ok = false;
      const fee = p.borrowFee + (p.qty < 0 && t > p.feeLast && !p.credit && !p.dayShort && p.kind !== 'opt' ? (-p.cost * SHORT_FEE * (t - p.feeLast)) / YEAR_MS : 0);
      const at = priceAt(p.symbol, t) ?? p.last;
      // (A future is worth its gain since its mark, its margin being in the cash; an option NT$50 a point.)
      nw += (p.kind === 'fut' ? (at - p.mark) * (p.mult || 1) * p.qty : p.qty * at * (p.kind === 'opt' ? OPTION.mult : 1)) * (r || 0) - (fee || 0) * (r || 0);
      // 融券: the deposit and the sale money the broker holds are the account's (as valuate counts them).
      if (p.qty < 0) {
        const held = (p.shortDeposit || 0) + (p.shortHeld || 0);
        const interest = (p.shortInterest || 0) + (p.credit && t > p.feeLast ? (held * SHORT_INTEREST * (t - p.feeLast)) / YEAR_MS : 0);
        nw += (held + interest) * (r || 0);
      }
    }
    for (const loan of Object.values(s.loans)) {
      const balance = loan.balance + (t > loan.last && loan.balance > EPS ? (loan.balance * loan.rate * (t - loan.last)) / YEAR_MS : 0);
      nw -= balance * (rateAt(loan.currency, t) || 0);
    }
    if (ok) found.push([at, [t, nw, s.deposits]]);
  }
  return found.sort((a, b) => a[0] - b[0]).map(x => x[1]);
}

// Records today's net worth (and money put in) once every 10 minutes at most.
export function recordSnapshot(account, now, netWorth, deposits) {
  const day = taipeiDay(now);
  const last = account.snapshots?.[day];
  if (last && now - last.t < 10 * 60_000) return account;
  return { ...account, snapshots: { ...(account.snapshots || {}), [day]: { t: now, nw: Math.round(netWorth), dep: Math.round(deposits) } } };
}

// What the same deposits would be worth in one benchmark: each deposit buys
// it at the price of its day (points: [t, price in NT$], oldest first).
export function benchmarkValue(deposits, points, price) {
  if (!points?.length) return null;
  let units = 0;
  for (const d of deposits) {
    let p = points[0][1];
    for (const [t, c] of points) {
      if (t > d.t) break;
      p = c;
    }
    // Deposited after the last point (today): at today's price.
    if (price != null && d.t > points.at(-1)[0]) p = price;
    units += d.amount / p;
  }
  return units * (price ?? points.at(-1)[1]);
}

// ---- Merge (sync) ------------------------------------------------------------

// (Every status an order can end in: one missing ranks as NaN and loses to
// whichever copy came first, so an expired order came back open.)
const STATUS_RANK = { open: 0, cancelled: 1, rejected: 1, expired: 1, filled: 2 };

// Two copies of the account become one. A copy started over (a new id) wins
// if it's the newer start.
export function mergeAccounts(a, b) {
  if (!a) return b;
  if (!b) return a;
  if (a.id !== b.id) return b.created > a.created ? b : a;
  const events = new Map();
  for (const e of [...a.events, ...b.events]) if (!events.has(e.id)) events.set(e.id, e);
  const orders = new Map();
  for (const o of [...a.orders, ...b.orders]) {
    const had = orders.get(o.id);
    if (!had) orders.set(o.id, o);
    else {
      const rank = STATUS_RANK[o.status] - STATUS_RANK[had.status];
      if (rank > 0 || (rank === 0 && (o.rev || 0) > (had.rev || 0))) orders.set(o.id, o);
    }
  }
  // An order with a fill anywhere is filled.
  for (const e of events.values()) {
    if (e.type !== 'fill') continue;
    const o = orders.get(e.orderId);
    if (o && o.status !== 'filled') orders.set(o.id, { ...o, status: 'filled', rev: (o.rev || 0) + 1, done: e.t, fillId: e.id, price: e.price });
  }
  const snapshots = { ...(a.snapshots || {}) };
  for (const [day, snap] of Object.entries(b.snapshots || {})) if (!snapshots[day] || snap.t > snapshots[day].t) snapshots[day] = snap;
  const latest = (x = {}, y = {}) => {
    const out = { ...x };
    for (const [k, v] of Object.entries(y)) if (!out[k] || v.t > out[k].t) out[k] = v;
    return out;
  };
  const merged = {
    ...a,
    events: [...events.values()].sort(byTime),
    orders: [...orders.values()].sort(byTime),
    snapshots,
    watch: latest(a.watch, b.watch)
  };
  if (a.plans || b.plans) merged.plans = latest(a.plans, b.plans);
  // Paydays began at the earlier of the two.
  if (a.income || b.income) merged.income = { since: Math.min(a.income?.since ?? Infinity, b.income?.since ?? Infinity) };
  if (a.alerts || b.alerts) merged.alerts = latest(a.alerts, b.alerts);
  // The account's standing with the broker, whichever copy saw it first:
  // an overdraft's and a margin call's clocks run from the earlier start
  // (each check clears one that's over, so a copy that cleared it loses
  // nothing), and a default stays on the record (its 違約金 is charged once
  // per overdraft by `defaultAt`: a copy without it charged it again, and
  // its ban on margin and shorts was gone).
  const earlier = (x, y) => (!x ? y : !y ? x : (y.since ?? Infinity) < (x.since ?? Infinity) ? y : x);
  for (const key of ['od', 'call']) {
    const kept = earlier(a[key], b[key]);
    if (kept) merged[key] = kept;
  }
  if (a.defaultAt || b.defaultAt) merged.defaultAt = Math.max(a.defaultAt || 0, b.defaultAt || 0);
  if (a.welcome === true || b.welcome === true) merged.welcome = true;
  return merged;
}

// A saved copy, checked: anything that isn't an account is refused.
export function isAccount(value) {
  return Boolean(value && typeof value === 'object' && value.v === ACCOUNT_VERSION && typeof value.id === 'string' && Array.isArray(value.events) && Array.isArray(value.orders));
}

export function toggleWatch(account, symbol, now = Date.now()) {
  const on = !account.watch?.[symbol]?.on;
  return { ...account, watch: { ...(account.watch || {}), [symbol]: { on, t: now } } };
}
export const watched = account => Object.entries(account?.watch || {}).filter(([, w]) => w.on).sort((a, b) => a[1].t - b[1].t).map(([s]) => s);

// ---- Monthly plans (定期定額) --------------------------------------------------
//
// A plan buys `amount` NT$ worth of one symbol on day `day` of every month
// (1-31; a shorter month's last day; the first price on or after that day,
// 00:00 Taiwan time). A Taiwan stock or ETF is bought as brokers do: a limit
// order in the intraday odd-lot session, at its first match (planFillBar),
// the whole lots in it split off as their own trade (estimate). A foreign
// symbol's NT$ is exchanged first, at that moment's rate. Each month's buy
// is an order with a fixed id (plan:<plan>:<YYYY-MM>), so a month runs once
// however many devices catch up on it. Plans merge like the watchlist: the
// latest change wins. Three months running without the cash end the plan,
// as brokers do (國票 點點投 Q4: 連續三次扣款失敗則停止執行).
//
// From NT$100 on any day 1-31 (國泰證券 定期定額: 每筆最低新台幣100元, 每月1~31號,
// 遇非交易日順延).
export const PLAN_MIN = 100;
export const PLAN_DAY_MAX = 31;
export const PLAN_FAIL_LIMIT = 3;
export const PLAN_MAX_CATCHUP = 24;
// Listed shares by plan only in Taiwan and the US (國泰證券: 台股 and 美股
// 定期定額; none abroad else, where whole board lots trade); a US one from
// US$10 a buy (國泰, 2026), its NT$ exchanged first.
export const PLAN_MARKETS = ['TW', 'US'];
export const PLAN_MIN_LOCAL = { US: 10 };
// (Never a future, an option, a warrant or a convertible: no broker plans those.)
const NO_PLAN = new Set(['fut', 'opt', 'warrant', 'cb']);
export const planAllowed = ({ market, kind } = {}) => !NO_PLAN.has(kind) && (!LISTED.has(kind) || PLAN_MARKETS.includes(market));
const MARKET_CURRENCY = { US: 'USD' };
// The least NT$ a plan's buy can be: NT$100, or what exchanges for US$10
// at `twd` NT$ a dollar (a US one).
export function planMinTWD(market, twd) {
  const local = PLAN_MIN_LOCAL[market];
  if (!local || !(twd > 0)) return PLAN_MIN;
  const cur = MARKET_CURRENCY[market];
  return Math.max(PLAN_MIN, Math.ceil(amountFor(BASE, cur, local, { [BASE]: 1, [cur]: twd }) - 1e-9));
}
// `twd`: NT$ a unit of its currency now, to hold a US plan to its US$10.
export function setPlan(account, { id, symbol, amount, day, on = true, name, kind, market, currency, twd }, now = Date.now()) {
  // One plan a symbol: starting another changes the one there is.
  id ||= Object.values(account.plans || {}).find(p => p.on && p.symbol === symbol)?.id || randomId();
  amount = Math.round(Number(amount));
  day = Math.round(Number(day));
  const old = account.plans?.[id];
  if (on && market && kind && !planAllowed({ market, kind })) return { error: 'planMarket' };
  const min = planMinTWD(market ?? old?.market, twd);
  if (on && !(amount >= min && amount <= MAX_START)) return { error: 'planAmount', min };
  if (on && !(day >= 1 && day <= PLAN_DAY_MAX)) return { error: 'planDay' };
  const plan = { ...(old || {}), id, symbol: symbol ?? old?.symbol, amount: amount || old?.amount, day: day || old?.day, on, t: now, since: old?.since ?? now };
  for (const [k, v] of Object.entries({ name, kind, market, currency })) if (v) plan[k] = v;
  return { account: { ...account, plans: { ...(account.plans || {}), [id]: plan } }, plan };
}

export const activePlans = account => Object.values(account?.plans || {}).filter(p => p.on).sort((a, b) => a.since - b.since);

// Plans started more than once for a symbol (a tap that registered several
// times): the first kept, the rest stopped. Returns the account unchanged when
// there are none.
export function dedupePlans(account, now = Date.now()) {
  const seen = new Set();
  let plans = null;
  for (const p of activePlans(account)) {
    if (!seen.has(p.symbol)) {
      seen.add(p.symbol);
      continue;
    }
    plans ||= { ...account.plans };
    plans[p.id] = { ...p, on: false, t: now };
  }
  return plans ? { ...account, plans } : account;
}

// The Taiwan midnight a month's buy is due: YYYY-MM-DD 00:00 +08:00 (the
// month's last day when it's shorter).
export function planDue(month, day) {
  const [y, m] = month.split('-').map(Number);
  const d = Math.min(day, new Date(Date.UTC(y, m, 0)).getUTCDate());
  return Date.parse(`${month}-${String(d).padStart(2, '0')}T00:00:00+08:00`);
}
// A Taiwan stock, ETF or bond ETF: bought through the odd-lot session.
const planOddLots = ({ market, kind } = {}) => market === 'TW' && LISTED.has(kind);
// How a plan's buy is ordered: a limit order for Taiwan's odd-lot session
// (盤中零股: 以限價為之; the broker's limit is the day's limit-up, so it fills
// at the match), else at the market.
export const planOrderType = meta => (planOddLots(meta) ? 'limit' : 'market');
// The price bar a month's buy fills on (bars oldest first): the first at or
// after it's due with a price, and in Taiwan's odd-lot session from its first
// match (09:10; 09:00 from 2026-12-07).
export function planFillBar(meta, bars, due) {
  const odd = planOddLots(meta);
  return bars.find(b => b.t >= due && b.o > 0 && (!odd || oddLotOpen(b.t))) || null;
}
const monthOf = t => taipeiDay(t).slice(0, 7);
const nextMonth = month => {
  const [y, m] = month.split('-').map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
};

// Every buy due since the plan started, up to now: [{ month, t }].
export function planRuns(plan, now = Date.now()) {
  const out = [];
  if (!plan?.on) return out;
  let month = monthOf(plan.since);
  if (planDue(month, plan.day) < plan.since) month = nextMonth(month);
  for (let i = 0; i < 1200; i++) {
    const t = planDue(month, plan.day);
    if (t > now) break;
    out.push({ month, t });
    month = nextMonth(month);
  }
  return out.slice(-PLAN_MAX_CATCHUP);
}

// When the plan buys next.
export function nextPlanRun(plan, now = Date.now()) {
  let month = monthOf(Math.max(now, plan.since));
  for (let i = 0; i < 3; i++) {
    const t = planDue(month, plan.day);
    if (t > now && t >= plan.since) return t;
    month = nextMonth(month);
  }
  return null;
}

export const planOrderId = (plan, month) => `plan:${plan.id}:${month}`;

// Runs one month's buy at `price` (the first price at or after its due
// time, at moment `at`), `twd` NT$ per unit of its currency then. The NT$
// budget is exchanged (for a foreign symbol) and spent on as many units as
// it covers after costs. Not enough NT$ or too small for one unit: the
// month's order is recorded as rejected, so it isn't tried again.
export function runPlan(account, plan, run, { price, twd, at = run.t, quote }, now = Date.now()) {
  const id = planOrderId(plan, run.month);
  if (account.orders.some(o => o.id === id)) return { account };
  const meta = { symbol: plan.symbol, name: quote?.name || plan.name, kind: quote?.kind || plan.kind, market: quote?.market || plan.market, currency: quote?.currency || plan.currency };
  const type = planOrderType(meta);
  const order = { id, ...meta, side: 'buy', type, ...(type === 'limit' ? { limit: price } : {}), qty: 0, t: at, status: 'open', rev: 1, plan: plan.id, reserve: 0 };
  const reject = reason => {
    const rejected = { ...order, status: 'rejected', reason, rev: 2, done: at };
    let next = { ...account, orders: [...account.orders, rejected] };
    // The PLAN_FAIL_LIMIT-th month running without the cash: the plan ends.
    const mine = next.orders.filter(o => o.plan === plan.id && o.id.startsWith(`plan:${plan.id}:`)).sort((a, b) => (a.id < b.id ? 1 : -1));
    const fails = mine.findIndex(o => !(o.status === 'rejected' && o.reason === 'funds'));
    const ended = reason === 'funds' && (fails < 0 ? mine.length : fails) >= PLAN_FAIL_LIMIT;
    if (ended && next.plans?.[plan.id]?.on) next = { ...next, plans: { ...next.plans, [plan.id]: { ...next.plans[plan.id], on: false, t: Math.max(at, next.plans[plan.id].t || 0), ended: 'funds' } } };
    return { account: next, order: rejected, ...(ended ? { ended: true } : {}) };
  };
  if (!(price > 0) || !(twd > 0) || !meta.currency) return { account };
  if (!planAllowed(meta)) return reject('planMarket');
  const avail = available(account, replay(account, now));
  if ((avail.cash[BASE] || 0) + EPS < plan.amount) return reject('funds');
  const rates = { [BASE]: 1, [meta.currency]: twd };
  let budget = plan.amount;
  let fx = null;
  if (meta.currency !== BASE) {
    fx = quoteExchange(BASE, meta.currency, plan.amount, rates, true, at);
    if (!fx?.received) return reject('tooSmall');
    budget = fx.received;
  }
  // A US buy from US$10 (PLAN_MIN_LOCAL).
  if (budget + EPS < (PLAN_MIN_LOCAL[meta.market] ?? 0)) return reject('planMin');
  // Sized at the price it will actually pay (a market order's ask), with the
  // plan's fee: whole units, a US stock's in fractions (US_FRACTION).
  const ask = type === 'limit' ? price : marketFill(meta.market, meta.kind, 'buy', price);
  const costOf = q => estimate({ ...meta, side: 'buy', qty: q, price: ask, t: at, plan: true }).total;
  const step = fractional(meta.market, meta.kind) ? US_FRACTION : qtyStep(meta.kind);
  const units = q => (step === US_FRACTION ? +(Math.floor(q / step + 1e-6) * step).toFixed(4) : roundQty(q, meta.kind));
  let qty = units(budget / ask);
  const first = qty > 0 ? costOf(qty) : 0;
  if (first > budget) qty = units((qty * budget) / first);
  while (qty > 0 && costOf(qty) > budget + EPS) qty = units(qty - (step >= 1 || step === US_FRACTION ? step : qty * 0.001));
  if (!(qty > 0)) return reject('tooSmall');
  let next = account;
  if (fx) {
    // Only what the units need is exchanged: the rest stays in NT$.
    const cost = costOf(qty);
    const need = amountFor(BASE, meta.currency, cost, rates, true, at);
    const r = exchange(next, { from: BASE, to: meta.currency, amount: Math.min(plan.amount, need) }, { rates, fxOpen: true, now: at, id: `plan:${plan.id}:${run.month}` });
    if (r.error) return reject(r.error === 'funds' || r.error === 'unsettled' ? 'funds' : 'tooSmall');
    next = r.account;
  }
  const open = { ...order, qty };
  next = { ...next, orders: [...next.orders, open] };
  const r = fillOrder(next, open, price, rates, now, at);
  return { account: r.account, order: r.order, fill: r.fill };
}

// ---- Price alerts --------------------------------------------------------------
//
// "Tell me when TSMC goes above / below X": checked on every price update
// and, for the time the page was closed, against the price bars since.
// Alerts merge like the watchlist (the latest change wins).

export function setAlert(account, { id = randomId(), symbol, op, price, on = true, note }, now = Date.now()) {
  const old = account.alerts?.[id];
  price = Number(price ?? old?.price);
  op = op ?? old?.op;
  if (on && !(price > 0)) return { error: 'alertPrice' };
  if (op !== 'above' && op !== 'below') return { error: 'alertPrice' };
  const alert = { id, symbol: symbol ?? old?.symbol, op, price, on, t: now, since: on && !old?.on ? now : old?.since ?? now };
  if (note) alert.note = note;
  if (on) delete alert.hit;
  return { account: { ...account, alerts: { ...(account.alerts || {}), [id]: alert } }, alert };
}

export const activeAlerts = account => Object.values(account?.alerts || {}).filter(a => a.on).sort((a, b) => a.since - b.since);
export const alertsFor = (account, symbol) => Object.values(account?.alerts || {}).filter(a => a.symbol === symbol && (a.on || a.hit)).sort((a, b) => b.t - a.t);

const crossed = (a, price) => (a.op === 'above' ? price >= a.price : price <= a.price);

// Alerts whose price is reached on these quotes: they turn off, marked hit.
export function checkAlerts(account, quotes, now = Date.now()) {
  const hits = [];
  let alerts = account.alerts;
  for (const a of activeAlerts(account)) {
    const q = quotes.get(a.symbol);
    if (!q || !Number.isFinite(q.price) || !crossed(a, q.price)) continue;
    const hit = { ...a, on: false, t: now, hit: { t: now, price: q.price } };
    alerts = { ...alerts, [a.id]: hit };
    hits.push(hit);
  }
  return hits.length ? { account: { ...account, alerts }, hits } : { account, hits };
}

// When a price alert would have gone off in these bars (oldest first).
export function alertHitInBars(alert, bars) {
  for (const b of bars) {
    if (b.t < alert.since) continue;
    if (alert.op === 'above' && b.h >= alert.price) return { t: b.t, price: Math.max(b.o, alert.price) };
    if (alert.op === 'below' && b.l <= alert.price) return { t: b.t, price: Math.min(b.o, alert.price) };
  }
  return null;
}

export function markAlertHit(account, id, { t, price }, now = Date.now()) {
  const a = account.alerts?.[id];
  if (!a?.on) return account;
  return { ...account, alerts: { ...account.alerts, [id]: { ...a, on: false, t: now, hit: { t, price } } } };
}

// ---- Bank interest on NT$ cash ------------------------------------------------------

// Pay days: June 21 and December 21, 00:00 Taiwan time.
function interestDays(from, to) {
  const out = [];
  for (let y = new Date(from + 8 * 3_600_000).getUTCFullYear(); y <= new Date(to + 8 * 3_600_000).getUTCFullYear(); y++)
    for (const m of [6, 12]) {
      const t = Date.UTC(y, m - 1, 21) - 8 * 3_600_000;
      if (t > from && t <= to) out.push(t);
    }
  return out;
}

// Interest earned on NT$ cash since the last payment, paid on each pay day
// up to `now`. As a Taiwan bank: 10% tax withheld from a payment over
// NT$20,000, and the 2.11% NHI premium from one of NT$20,000 or more.
export function applyCashInterest(account, now = Date.now()) {
  const have = new Set(account.events.filter(e => e.type === 'interest').map(e => e.id));
  let next = account;
  const added = [];
  for (const t of interestDays(account.created, now)) {
    const id = `int:${taipeiDay(t).slice(0, 7)}`;
    if (have.has(id)) continue;
    const s = replay(next, t);
    const paid = next.events.filter(e => e.type === 'interest' && e.t < t).reduce((sum, e) => sum + e.gross, 0);
    const gross = Math.floor(s.cashInterest - paid);
    if (gross < 1) continue;
    // (One rule for every interest payment: stock-savings.mjs incomeTaxes.)
    const { withheld, nhi, net } = incomeTaxes(gross);
    const event = { id, type: 'interest', t, currency: BASE, gross, withheld, nhi, net, rate: CASH_RATE };
    next = { ...next, events: [...next.events, event] };
    added.push(event);
  }
  return { account: next, added };
}

// ---- Payday: new money every month ---------------------------------------------
//
// No adding money by hand: like a salary, new NT$ arrives on its own on the
// 1st of every month (00:00 Taiwan time), paid when the app is opened: the
// same ECONOMY.monthly (NT$5,000) for every account. Each payday is a
// deposit with a fixed id (pay:YYYY-MM), paid once however many devices catch up on it. `income.since`: when paydays
// began (the account's opening, or when an older account first got them).

const TPE = 8 * 3_600_000;

// Dividends owed (past their ex-date) but not paid yet.
export const pendingDividends = (account, now = Date.now()) => account.events.filter(e => e.type === 'div' && !e.coupon && e.t > now).sort((a, b) => a.t - b.t);

// Income: dividends, bond coupons and cash interest paid in, in NT$ (at the
// rate of the day each was paid). `months`: the last 12 Taiwan months, oldest
// first, as [YYYY-MM, NT$]; `pending`: dividends owed but not paid yet.
export function incomeSummary(account, now = Date.now()) {
  const month = t => taipeiDay(t).slice(0, 7);
  const thisMonth = month(now);
  const [y, m] = thisMonth.split('-').map(Number);
  const months = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    months.push([d.toISOString().slice(0, 7), 0]);
  }
  const index = new Map(months.map(([k], i) => [k, i]));
  const out = { total: 0, ytd: 0, last12: 0, div: 0, coupon: 0, interest: 0, lending: 0, pending: 0, months, payers: {} };
  for (const e of account?.events || []) {
    if (!['div', 'interest', 'tdend', 'lendpay'].includes(e.type)) continue;
    const twd = e.net * (e.twd || 1);
    if (e.t > now) {
      if (e.type === 'div') out.pending += twd;
      continue;
    }
    out.total += twd;
    const k = month(e.t);
    if (k.slice(0, 4) === thisMonth.slice(0, 4)) out.ytd += twd;
    if (!index.has(k)) continue;
    months[index.get(k)][1] += twd;
    out.last12 += twd;
    if (e.type === 'interest' || e.type === 'tdend') out.interest += twd;
    else if (e.type === 'lendpay') out.lending += twd;
    else if (e.coupon) out.coupon += twd;
    else out.div += twd;
    if (e.type === 'div') out.payers[e.symbol] = (out.payers[e.symbol] || 0) + twd;
  }
  return out;
}

export const startAmount = account => account?.events.find(e => e.id === 'deposit:start')?.amount || 0;

// NT$ a month.
// Securities' own monthly pay before Orbit's payday (months up to 2026-09):
// NT$5,000, what it was then. Orbit's payday is ECONOMY.monthly.
export function incomeAmount() {
  return 5_000;
}

// The first payday after `t`: the next 1st, 00:00 Taiwan time.
export function nextPayday(t) {
  const d = new Date(t + TPE);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1) - TPE;
}

// Paydays due up to `now` and not yet paid, added as deposits.
// From this Taiwan month on, pay comes from Orbit itself into the pool
// (Orbit-Core's eco.js weekly pay), whichever app is opened.
export const INCOME_UNTIL_MONTH = '2026-10';

export function applyIncome(account, now = Date.now()) {
  const since = account?.income?.since;
  if (since == null) return { account, added: [] };
  const have = new Set(account.events.filter(e => e.income).map(e => e.id));
  const amount = incomeAmount(startAmount(account));
  const added = [];
  for (let t = nextPayday(Math.max(since, account.created)), n = 0; t <= now && n < 1200; t = nextPayday(t), n++) {
    const id = `pay:${taipeiDay(t).slice(0, 7)}`;
    if (taipeiDay(t).slice(0, 7) >= INCOME_UNTIL_MONTH) break;
    if (have.has(id) || amount <= 0) continue;
    added.push({ id, type: 'deposit', income: true, t, currency: BASE, amount });
  }
  if (!added.length) return { account, added };
  return { account: { ...account, events: [...account.events, ...added] }, added };
}

// Paydays from now on for an account opened before they existed.
export const startIncome = (account, now = Date.now()) => (account.income ? account : { ...account, income: { since: now } });

// ---- The Orbit pool -----------------------------------------------------------
//
// With a Orbit Pass this account's NT$ cash is the shared money pool (see
// orbit.mjs): money the Worker put in or took out (the pay, 信貸, 紓困,
// overdraft interest) arrives here as NT$ deposits with
// fixed ids ('x:<entry id>', `pool: true`), counted as money put in or taken
// out rather than as return. What this account shares back is its own part:
// its NT$ cash less those deposits.

// The pool's deposits as the wallet has them: its entries from the other
// apps that aren't in the log yet, added, and a deposit whose entry the
// wallet no longer has (the store's clean-up retired it) gone.
export function applyPool(account, wallet) {
  if (!account || !wallet) return { account, added: [] };
  const ids = new Set((wallet.entries || []).map(e => `x:${e.id}`));
  const kept = account.events.filter(e => !e.pool || ids.has(e.id));
  const have = new Set(kept.map(e => e.id));
  const added = [];
  for (const e of wallet.entries || []) {
    if (e.app === 'stock') continue;
    const id = `x:${e.id}`;
    if (have.has(id) || !(Math.abs(e.amount) > 0)) continue;
    const event = { id, type: 'deposit', pool: true, app: e.app, kind: e.kind, t: e.t, currency: BASE, amount: e.amount };
    if (e.note) event.note = e.note;
    if (e.peer) event.peer = e.peer;
    added.push(event);
  }
  if (!added.length && kept.length === account.events.length) return { account, added };
  return { account: { ...account, events: [...kept, ...added] }, added };
}

// This account's own part of the pool: spendable NT$ (open orders' cash
// held back) less what came from the other apps.
export function ownCash(account, s, now = Date.now()) {
  // (Futures' margin, and the futures account's money, are still the account's own.)
  const avail = available(account, s);
  const cash = (avail.cash[BASE] || 0) + (avail.fut || 0) + futMarginHeld(s);
  const pooled = account.events.filter(e => e.pool && e.t <= now).reduce((sum, e) => sum + e.amount, 0);
  return Math.round((cash - pooled) * 100) / 100;
}

// Another, separate account folded in (the Orbit merge tool): both logs,
// with the second's fixed ids ('deposit:start', 'pay:…', 'int:…') renamed so
// both count, and its old pool deposits left out (the merge carried that
// money over already).
export function mergeDistinct(a, b) {
  if (!a) return b;
  if (!b) return a;
  if (a.id === b.id) return mergeAccounts(a, b);
  const tag = `m${b.id}`;
  const have = new Set(a.events.map(e => e.id));
  const events = b.events
    .filter(e => !e.pool)
    .map(e => (have.has(e.id) || /^(deposit:start|pay:|int:)/.test(e.id) ? { ...e, id: `${tag}:${e.id}`, ...(e.id === 'deposit:start' ? { start: true } : {}) } : e));
  const merged = mergeAccounts(a, { ...b, id: a.id, created: a.created, events, snapshots: {} });
  return { ...merged, created: Math.min(a.created, b.created) };
}

// What the account made or lost in each market, in NT$: closed trades
// (fees in) and what's still held at today's prices. Sent in the wallet's
// `snap.stock.pl` for the admin page's totals; dividends, interest and
// exchange are left to the account's whole result.
export function resultByMarket(s, v) {
  const out = {};
  const add = (m, n) => {
    if (m && Number.isFinite(n)) out[m] = (out[m] || 0) + n;
  };
  for (const h of Object.values(s.held || {})) add(h.market, h.realized);
  for (const p of v?.positions || []) add(p.market, p.pl);
  for (const k of Object.keys(out)) out[k] = Math.round(out[k]);
  return out;
}

// Whose day the account's day change is: today's while a market it holds
// trades today (or it holds crypto, which never closes); otherwise the last
// day one of them traded (a weekend shows Friday's move as Friday's, not as
// 今日). `at`: that last trade, for the label.
export function dayOfChange(v, now = Date.now()) {
  let at = 0;
  let tz = 'Asia/Taipei';
  for (const p of v?.positions || []) {
    const q = p.quote;
    if (!q) continue;
    if (q.kind === 'crypto' || isOpen(q, now)) return { today: true, at: now, tz };
    const t = q.marketTime || 0;
    if (t && localDayOf(t, q.market) === localDayOf(now, q.market)) return { today: true, at: t, tz };
    if (t > at) [at, tz] = [t, q.tz || tz];
  }
  return at ? { today: false, at, tz } : { today: true, at: now, tz };
}
