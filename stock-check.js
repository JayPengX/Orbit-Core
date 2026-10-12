// ---- stock-check.js ----
// Quadra Securities' cash, counted by this Worker (the owner's lock-down,
// 2026-10-12: no app adds money to the pool; the proxy does). Securities
// keeps its whole brokerage on the phone and saves it to the pass; when it
// does, the Worker replays the account with Securities' own code (the kit's
// stock-account) and checks every event that adds cash against the market
// before it counts:
//   fill      its price within the market's own range at that moment (Yahoo's
//             5-minute bars, 1% slack), its money the price times the shares
//   div       the dividend Yahoo lists for that ex-date, on no more shares
//             than were held then; a bond's coupon within its own rate
//   fx        the rate within the day's range for that pair (1% slack)
//   split     the ratio Yahoo lists
//   interest, tdend, lendpay   within their rates' bounds
//   deposit   only money from the pool (an entry the wallet has)
//   borrow    a purchase's own loan, at most 70% of it
// An event that fails is left out of the account's money (the pool never
// sees it); one whose market data can't be read now is left out until it
// can. Events the account had before the lock-down (on the first check) are
// taken as they were. The figure the pool counts (snap.stock.cash) is the
// Worker's, and the holdings ranks count are at what was paid for them.
//
// deps: { read(url) -> JSON, fsGet, fsWrite }.
import { replay, ownCash } from './kit/stock-account.mjs';
import { unpack } from './kit/stock-codec.mjs';
import { BONDS } from './kit/stock-bonds.mjs';
import { CASH_RATE } from './kit/stock-markets.mjs';

export const VERIFIED_COLLECTION = 'stock-verified';
const YAHOO = 'https://query1.finance.yahoo.com';
const SLACK = 0.01;
const MIN = 60_000;
const DAY = 86_400_000;
const near = (a, b, tol) => Math.abs(a - b) <= tol;

const chartUrl = (symbol, from, to, interval, events = false) =>
  `${YAHOO}/v8/finance/chart/${encodeURIComponent(symbol)}?period1=${Math.floor(from / 1000)}&period2=${Math.ceil(to / 1000)}&interval=${interval}${events ? '&events=div%2Csplit' : ''}`;
// The highest and lowest traded between two moments: { high, low } or null
// (no bars: the data isn't there to check against).
async function range(read, symbol, from, to, interval) {
  const r = (await read(chartUrl(symbol, from, to, interval)))?.chart?.result?.[0];
  const q = r?.indicators?.quote?.[0];
  const t = r?.timestamp || [];
  let high = -Infinity;
  let low = Infinity;
  t.forEach((s, i) => {
    if (s * 1000 < from - 5 * MIN || s * 1000 > to + 5 * MIN) return;
    const h = q?.high?.[i];
    const l = q?.low?.[i];
    if (Number.isFinite(h)) high = Math.max(high, h);
    if (Number.isFinite(l)) low = Math.min(low, l);
  });
  return Number.isFinite(high) && Number.isFinite(low) ? { high, low } : null;
}
// Yahoo's dividends and splits around a moment: { divs: [{ date, amount }], splits: [{ date, ratio }] }.
async function corporate(read, symbol, at) {
  const r = (await read(chartUrl(symbol, at - 10 * DAY, at + 10 * DAY, '1d', true)))?.chart?.result?.[0];
  const ev = r?.events || {};
  return {
    divs: Object.values(ev.dividends || {}).map(d => ({ date: d.date * 1000, amount: d.amount })),
    splits: Object.values(ev.splits || {}).map(s => ({ date: s.date * 1000, ratio: s.numerator / s.denominator }))
  };
}
const bondOf = symbol => BONDS[symbol] || Object.values(BONDS).find(b => b.id === symbol || symbol?.includes(b.id));

// One event checked: 'ok', 'bad' (left out for good) or 'later' (the data
// to check it isn't there now). `account`: the account with only the events
// counted so far, for what was held when.
export async function checkEvent(e, account, wallet, read) {
  switch (e.type) {
    case 'fill': {
      const gross = e.price * e.qty;
      // The money is the price times the shares, the fees only taking from it.
      if (!(e.qty > 0) || !(e.price > 0)) return 'bad';
      if (e.side === 'sell' ? e.total > gross * (1 + SLACK) + 1 : e.total < gross * (1 - SLACK) - 1) return 'bad';
      if (e.market === 'BOND' || e.kind === 'govbond') {
        const bond = bondOf(e.symbol);
        return bond && e.price <= (bond.face || 100) * 1.3 + 1 ? 'ok' : 'bad';
      }
      const bars = await range(read, e.symbol, e.t - 10 * MIN, e.t + 10 * MIN, '5m');
      if (!bars) return Date.now() - e.t > 60 * DAY ? 'bad' : 'later';
      if (e.side === 'sell' ? e.price > bars.high * (1 + SLACK) : e.price < bars.low * (1 - SLACK)) return 'bad';
      return 'ok';
    }
    case 'div': {
      if (!(e.net <= e.gross + 0.01) || !(e.shares > 0)) return e.net <= 0 ? 'ok' : 'bad';
      if (e.coupon) {
        const bond = bondOf(e.symbol);
        const rate = bond ? (bond.coupon > 1 ? bond.coupon / 100 : bond.coupon) : 0;
        return bond && e.gross <= e.shares * (bond.face || 100) * rate * 1.05 + 1 ? 'ok' : 'bad';
      }
      const held = replay(account, e.ex).positions[e.symbol]?.qty || 0;
      if (e.shares > held + 1e-6) return 'bad';
      const { divs } = await corporate(read, e.symbol, e.ex);
      const d = divs.find(x => near(x.date, e.ex, 3 * DAY));
      if (!d) return Date.now() - e.ex > 30 * DAY ? 'bad' : 'later';
      return e.perShare <= d.amount * (1 + SLACK) + 1e-9 && e.gross <= e.shares * d.amount * (1 + SLACK) + 1 ? 'ok' : 'bad';
    }
    case 'split': {
      const { splits } = await corporate(read, e.symbol, e.t);
      const s = splits.find(x => near(x.date, e.t, 3 * DAY));
      if (!s) return Date.now() - e.t > 30 * DAY ? 'bad' : 'later';
      return near(s.ratio, e.ratio, 1e-6) ? 'ok' : 'bad';
    }
    case 'fx': {
      if (!(e.amount > 0) || !(e.received > 0)) return 'bad';
      if (e.from === e.to) return 'bad';
      const pair = `${e.from === 'TWD' && e.to === 'TWD' ? '' : `${e.from}${e.to}`}=X`;
      const bars = await range(read, pair, e.t - DAY, e.t + DAY, '1h');
      if (!bars) return Date.now() - e.t > 60 * DAY ? 'bad' : 'later';
      return e.received <= e.amount * bars.high * (1 + SLACK) ? 'ok' : 'bad';
    }
    case 'interest': {
      // A month's bank interest on the NT$ cash held (the most of now and a
      // month before), at most, with room to spare (2.5 times the rate).
      const cash = Math.max(0, replay(account, e.t).cash.TWD || 0, replay(account, e.t - 31 * DAY).cash.TWD || 0);
      return e.gross <= (cash * CASH_RATE * 2.5 * 45) / 365 + 1 && e.net <= e.gross + 0.01 ? 'ok' : 'bad';
    }
    case 'tdend': {
      const td = account.events.find(x => x.id === e.td && x.type === 'td');
      if (!td || !near(e.amount, td.amount, 0.01)) return 'bad';
      // A time deposit's interest: Bank of Taiwan's rates are under 2.5% a year.
      const years = Math.max(0, e.t - td.t) / (365 * DAY);
      return (e.interest ?? e.net) <= td.amount * 0.025 * years + 1 && e.net <= (e.interest ?? e.net) + 0.01 ? 'ok' : 'bad';
    }
    case 'lendpay': {
      const lend = account.events.find(x => x.id === e.lend && x.type === 'lend');
      if (!lend) return 'bad';
      // A lending fee: under 5% a year of the shares' worth at their last price.
      const s = replay(account, e.t);
      const price = s.positions[lend.symbol]?.last || 0;
      const years = Math.max(0, e.t - lend.t) / (365 * DAY);
      return e.net <= (lend.qty || 0) * price * 0.05 * years + 1 ? 'ok' : 'bad';
    }
    case 'deposit': {
      // Money from the pool only: the wallet's own entry, the same amount.
      if (!e.pool) return 'bad';
      const entry = (wallet?.entries || []).find(x => `x:${x.id}` === e.id);
      return entry && near(entry.amount, e.amount, 0.01) ? 'ok' : 'bad';
    }
    case 'borrow': {
      if (!(e.amount > 0)) return 'bad';
      const fill = account.events.find(x => x.type === 'fill' && x.side === 'buy' && x.symbol === e.symbol && near(x.t, e.t, MIN));
      return fill && e.amount <= fill.total * 0.7 + 1 ? 'ok' : 'bad';
    }
    // What only takes money out, or moves nothing: as it is.
    case 'td':
    case 'repay':
    case 'penalty':
    case 'lend':
    case 'recall':
    case 'extend':
    case 'credit':
      return 'ok';
    default:
      return 'bad';
  }
}

// A Securities save checked: the account's money as the pool counts it.
// { cash, held } (held: the holdings at what was paid for them, less loans),
// with each new event checked once (`stock-verified/<account>`).
export async function checkStock(env, docId, payload, wallet, deps, lockSince, now = Date.now()) {
  const account = await unpack(payload).catch(() => null);
  if (!account || !Array.isArray(account.events)) return null;
  const doc = await deps.fsGet(env, VERIFIED_COLLECTION, docId);
  const kept = (doc.exists && JSON.parse(doc.payload)) || { ok: [], bad: [] };
  const ok = new Set(kept.ok);
  const bad = new Set(kept.bad);
  const first = !doc.exists;
  // In time order, each checked against the account as counted so far.
  const events = [...account.events].sort((a, b) => a.t - b.t || (a.id < b.id ? -1 : 1));
  const counted = { ...account, events: [] };
  let checked = 0;
  for (const e of events) {
    if (!e?.id) continue;
    let verdict = ok.has(e.id) ? 'ok' : bad.has(e.id) ? 'bad' : null;
    // The account as it was before the lock-down: taken as it was.
    if (!verdict && first && e.t < lockSince) verdict = 'ok';
    // (A pool deposit follows the wallet: always looked at again.)
    if (e.type === 'deposit' && e.pool) verdict = await checkEvent(e, counted, wallet, deps.read).catch(() => 'later');
    if (!verdict && checked < 40) {
      checked++;
      verdict = await checkEvent(e, counted, wallet, deps.read).catch(() => 'later');
    }
    if (verdict === 'ok') {
      if (!(e.type === 'deposit' && e.pool)) ok.add(e.id);
      counted.events.push(e);
    } else if (verdict === 'bad') bad.add(e.id);
  }
  const next = { ok: [...ok], bad: [...bad], t: now };
  if (first || next.ok.length !== kept.ok.length || next.bad.length !== kept.bad.length) await deps.fsWrite(env, VERIFIED_COLLECTION, docId, JSON.stringify(next)).catch(() => {});
  const s = replay(counted, now);
  const loans = Object.values(s.loans).reduce((sum, l) => sum + (l.currency === 'TWD' ? l.balance : 0), 0);
  const held = Object.values(s.positions).reduce((sum, p) => sum + (p.qty > 0 ? p.costTWD : 0), 0) - loans;
  return { cash: Math.round(ownCash(counted, s, now) * 100) / 100, held: Math.max(0, Math.round(held)), refused: [...bad] };
}
