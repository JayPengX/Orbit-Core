// ---- stock-check.js ----
// Quadra Securities' cash, counted by this Worker (the owner's lock-down,
// 2026-10-12: no app adds money to the pool; the proxy does; and 2026-10-14:
// Quadra's money impossible to exploit). Securities keeps its whole
// brokerage on the phone and saves it to the pass; when it does, the Worker
// replays the account with Securities' own code (the kit's stock-account)
// and checks every event that adds money before it counts:
//   fill      one this Worker issued (stock-fill.js), matching it exactly:
//             the order's terms as first seen, its quote and moment, the
//             price the kit's own rule makes of that quote, the NT$ rate it
//             gave, once per order (a monthly plan's: no more than its
//             amount), and only with the cash (or shares, or margin) the
//             account had then. Any other fill (one found on
//             the phone in the price history) counts at the worst price the
//             market traded since its moment, so no moment chosen after the
//             fact can win anything; a bond's only at its maturity.
//   fx        at most the market's rate at its moment (the last 5-minute
//             close), less the narrowest spread; one saved later than 5
//             minutes after, the worst rate since its moment
//   div       the dividend Yahoo lists for that ex-date, in the stock's own
//             currency, on no more shares than were held then, once; a
//             bond's coupon within its own rate, once a date
//   split     the ratio Yahoo lists, once
//   interest  no more than the account's own interest earned and unpaid
//   tdend, lendpay   within their rates' bounds (the replay pays each once)
//   deposit   only money from the pool (an entry the wallet has)
//   borrow    a purchase's own loan, as its fill says, at most 70% of it
// An event that fails is left out of the account's money (the pool never
// sees it); one whose market data can't be read now is left out until it
// can; one counted at a worse figure than the phone's is kept with that
// figure. Events the account had before the lock-down (on the first check)
// are taken as they were. Duplicate ids count once.
//
// What the pool counts (snap.stock.cash) is the Worker's: the NT$ the
// account can spend, never what it owes (loans, shares sold short), and the
// holdings ranks count at what was paid for them, less the rest of what's
// owed. Borrowed money can't leave Securities.
//
// deps: { read(url) -> JSON, fsGet, fsWrite }.
import { replay, ownCash, applyFills } from './kit/stock-account.mjs';
import { unpack } from './kit/stock-codec.mjs';
import { BONDS } from './kit/stock-bonds.mjs';
import { marketFill, dealPrice, currencyInfo } from './kit/stock-markets.mjs';
import { fxSymbol } from './kit/stock-quotes.mjs';
import { readFillsBook, decideFills } from './stock-fill.js';

export const VERIFIED_COLLECTION = 'stock-verified';
const YAHOO = 'https://query1.finance.yahoo.com';
const MIN = 60_000;
const DAY = 86_400_000;
const near = (a, b, tol) => Math.abs(a - b) <= tol;
// A fill or exchange the phone saved within this of its moment is fresh.
const FRESH_MS = 5 * MIN;
// A short sale needs this share of what's sold short in the account's own
// worth (the kit's SHORT_INITIAL is 1.5 times what's owed, all assets in).
const SHORT_COVER = 0.5;

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
// What traded from `from` to now: 5-minute bars for a week, hourly after.
const since = (read, symbol, from, now) => range(read, symbol, from, now, now - from <= 7 * DAY ? '5m' : '1h');
// NT$ per unit of a currency over a span (TWD: 1).
const twdSince = (read, currency, from, now) => (currency === 'TWD' ? { high: 1, low: 1 } : since(read, fxSymbol(currency), from, now));
// NT$ per unit at a moment: the last 5-minute close at or before it.
async function twdAt(read, currency, t) {
  if (currency === 'TWD') return 1;
  const r = (await read(chartUrl(fxSymbol(currency), t - 20 * MIN, t + 5 * MIN, '5m')))?.chart?.result?.[0];
  const times = r?.timestamp || [];
  const close = r?.indicators?.quote?.[0]?.close || [];
  let v = null;
  times.forEach((s, i) => {
    if (s * 1000 <= t && Number.isFinite(close[i])) v = close[i];
  });
  return v;
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

// The price the kit's own rule makes of a quote (fillOrder: a market or
// stop order crosses the spread, a limit fills at its price or better; then
// the market's own spread, estimate's dealPrice).
export function fillPrice({ k, l, side }, quote, market, kind) {
  const p = k === 'limit' && Number.isFinite(l) ? (side === 'buy' ? Math.min(quote, l) : Math.max(quote, l)) : marketFill(market, kind, side, quote);
  return dealPrice(market, side, p);
}

// A fill's money: the price times the shares, the costs only taking from it.
function fillMoneyOk(e) {
  if (!(e.qty > 0) || !(e.price > 0)) return false;
  const gross = e.price * e.qty;
  const unit = 10 ** -(currencyInfo(e.currency).digits ?? 2);
  if (Number.isFinite(e.gross) && !near(e.gross, gross, Math.max(unit, gross * 1e-9) + 1e-9)) return false;
  return e.side === 'sell' ? e.total <= gross + unit : e.total >= gross - unit;
}
// The fill counted at another price: the same shares, the costs as they were.
const repriced = (e, price) => {
  const diff = (price - e.price) * e.qty;
  return { price, gross: price * e.qty, total: e.total + diff };
};

// One event checked: 'ok', 'bad' (left out for good), 'later' (the data to
// check it isn't there now), or { adjust } (counted with those figures).
// `account`: the account with only the events counted so far, for what was
// held when. ctx: { now, used (orderIds already filled) }.
export async function checkEvent(e, account, wallet, read, issued = {}, ctx = {}) {
  const now = ctx.now ?? Date.now();
  switch (e.type) {
    case 'fill': {
      if (!fillMoneyOk(e)) return 'bad';
      const mine = e.orderId ? issued[e.orderId] : null;
      if (mine) {
        if (ctx.used?.has(e.orderId)) return 'bad';
        if (!near(mine.quote, e.quote, 1e-9 * Math.max(1, Math.abs(mine.quote))) || !near(mine.t, e.t, 1000)) return 'bad';
        // Its terms as first seen (fills issued before they were kept: the quote alone).
        if (mine.s != null) {
          if (mine.s !== e.symbol || mine.side !== e.side) return 'bad';
          // A plan's month: no more than its amount (in NT$ at its rate); an order: its shares.
          if (mine.plan ? !(e.total * (e.twd || 1) <= mine.amt + 1) : !near(mine.q, e.qty, 1e-9 * Math.max(1, e.qty))) return 'bad';
          const want = fillPrice({ k: mine.k, l: mine.l, side: e.side }, mine.quote, e.market, e.kind);
          if (!near(e.price, want, 1e-9 * Math.max(1, want) + 1e-9)) return 'bad';
        } else if (e.side === 'buy' ? e.price < mine.quote * (1 - 1e-9) : e.price > mine.quote * (1 + 1e-9)) return 'bad';
        if (e.currency === 'TWD' || !e.currency) return (e.twd ?? 1) === 1 ? 'ok' : 'bad';
        if (mine.twd > 0) return near(e.twd, mine.twd, 1e-9 * mine.twd) ? 'ok' : 'bad';
        const fx = await range(read, fxSymbol(e.currency), e.t - 10 * MIN, e.t + 10 * MIN, '5m');
        if (!fx) return now - e.t > 60 * DAY ? 'bad' : 'later';
        return e.twd > 0 && e.twd <= fx.high ? 'ok' : 'bad';
      }
      // A bond repaid at its maturity: its face, then, on what was held.
      if (e.market === 'BOND' || e.kind === 'govbond') {
        const bond = bondOf(e.symbol);
        if (!e.maturity || !bond || e.side !== 'sell' || ctx.used?.has(`maturity:${e.symbol}`) || !(e.t >= bond.maturity) || e.t > now) return 'bad';
        const held = replay(account, e.t).positions[e.symbol]?.qty || 0;
        return e.price <= (bond.face || 100) + 1e-9 && e.qty <= held + 1e-6 ? 'ok' : 'bad';
      }
      // Found on the phone: at the worst price traded since its moment.
      const bars = await since(read, e.symbol, e.t - 10 * MIN, now);
      if (!bars) return now - e.t > 60 * DAY ? 'bad' : 'later';
      const worst = e.side === 'sell' ? Math.min(e.price, dealPrice(e.market, 'sell', bars.low)) : Math.max(e.price, dealPrice(e.market, 'buy', bars.high));
      if (!(worst > 0)) return 'bad';
      return worst === e.price ? 'ok' : { adjust: repriced(e, worst) };
    }
    case 'div': {
      if (!(e.net <= e.gross + 0.01) || !(e.shares > 0)) return e.net <= 0 ? 'ok' : 'bad';
      const key = `div:${e.symbol}:${e.coupon ? e.t : e.ex}`;
      if (ctx.used?.has(key)) return 'bad';
      const s = replay(account, e.coupon ? e.t : e.ex);
      const held = s.positions[e.symbol]?.qty || 0;
      if (e.shares > held + 1e-6) return 'bad';
      if (e.coupon) {
        const bond = bondOf(e.symbol);
        const rate = bond ? (bond.coupon > 1 ? bond.coupon / 100 : bond.coupon) : 0;
        return bond && e.gross <= e.shares * (bond.face || 100) * rate * 1.05 + 1 ? 'ok' : 'bad';
      }
      // In the stock's own currency.
      const currency = s.positions[e.symbol]?.currency;
      if (currency && e.currency !== currency) return 'bad';
      const { divs } = await corporate(read, e.symbol, e.ex);
      const d = divs.find(x => near(x.date, e.ex, 3 * DAY));
      if (!d) return now - e.ex > 30 * DAY ? 'bad' : 'later';
      return e.perShare <= d.amount * 1.001 + 1e-9 && e.gross <= e.shares * d.amount * 1.001 + 1 ? 'ok' : 'bad';
    }
    case 'split': {
      if (ctx.used?.has(`split:${e.symbol}:${Math.round(e.t / DAY)}`)) return 'bad';
      const { splits } = await corporate(read, e.symbol, e.t);
      const s = splits.find(x => near(x.date, e.t, 3 * DAY));
      if (!s) return now - e.t > 30 * DAY ? 'bad' : 'later';
      return near(s.ratio, e.ratio, 1e-6) ? 'ok' : 'bad';
    }
    case 'fx': {
      if (!(e.amount > 0) || !(e.received > 0) || e.from === e.to) return 'bad';
      // A plan's month (`fx:plan:<plan>:<month>`): the rate its fill was issued at.
      const plan = /^fx:(plan:.+)$/.exec(e.id)?.[1];
      const mine = plan ? issued[plan] : null;
      // The market's rate at its moment when it's fresh; the worst since, when not.
      let mid;
      if (mine?.plan && mine.twd > 0 && e.from === 'TWD' && Math.abs(e.t - mine.t) <= 1000) {
        if (e.amount > mine.amt + 1) return 'bad';
        mid = 1 / mine.twd;
      } else if (now - e.t <= FRESH_MS) {
        const [a, b] = await Promise.all([twdAt(read, e.from, e.t), twdAt(read, e.to, e.t)]);
        if (!(a > 0) || !(b > 0)) return now - e.t > 60 * DAY ? 'bad' : 'later';
        mid = a / b;
      } else {
        const [a, b] = await Promise.all([twdSince(read, e.from, e.t - 10 * MIN, now), twdSince(read, e.to, e.t - 10 * MIN, now)]);
        if (!a || !b) return now - e.t > 60 * DAY ? 'bad' : 'later';
        mid = a.low / b.high;
      }
      const spread = Math.max(currencyInfo(e.from).spread, currencyInfo(e.to).spread) * 0.5;
      const unit = 10 ** -(currencyInfo(e.to).digits ?? 2);
      const most = Math.floor((e.amount * mid * (1 - spread)) / unit) * unit;
      return e.received <= most + unit / 2 ? 'ok' : { adjust: { received: most, rate: most / e.amount } };
    }
    case 'interest': {
      // No more than earned on the NT$ held and not paid yet.
      const s = replay(account, e.t);
      const paid = account.events.filter(x => x.type === 'interest' && x.t <= e.t).reduce((sum, x) => sum + (x.gross || 0), 0);
      const owed = Math.max(0, Math.floor(s.cashInterest - paid + 1e-6));
      if (e.gross <= owed + 1 && e.net <= e.gross + 0.01) return 'ok';
      return { adjust: { gross: owed, withheld: 0, nhi: 0, net: owed } };
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
      // A purchase's own loan (`loan:<order>`), as its fill says.
      if (!(e.amount > 0)) return 'bad';
      const fill = account.events.find(x => x.type === 'fill' && x.side === 'buy' && `loan:${x.orderId}` === e.id);
      return fill && fill.symbol === e.symbol && near(fill.financed || 0, e.amount, 0.01) && e.amount <= fill.total * 0.7 + 1 ? 'ok' : 'bad';
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

// NT$ per unit of each currency, as the account's own counted events last had it.
function twdRates(events) {
  const out = { TWD: 1 };
  for (const e of events) {
    if (e.type === 'fill' && e.twd > 0 && e.currency) out[e.currency] = e.twd;
    if (e.type === 'fx' && e.twdFrom > 0) out[e.from] = e.twdFrom;
    if (e.type === 'fx' && e.twdTo > 0) out[e.to] = e.twdTo;
  }
  return out;
}
// What the account owes, in NT$: its loans and the shares it sold short (at
// what they were sold for).
export function owedTWD(s, rates) {
  const loans = Object.values(s.loans).reduce((sum, l) => sum + Math.max(0, l.balance) * (rates[l.currency] || 0), 0);
  const shorts = Object.values(s.positions).reduce((sum, p) => sum + (p.qty < 0 ? Math.max(0, -p.costTWD) : 0), 0);
  return loans + shorts;
}
const worthTWD = (s, rates) =>
  Object.entries(s.cash).reduce((sum, [c, v]) => sum + v * (rates[c] || 0), 0) + Object.values(s.positions).reduce((sum, p) => sum + (p.qty > 0 ? p.costTWD : 0), 0) - owedTWD(s, rates);

// A new fill only with what the account had: the cash for a purchase (less
// its own loan), the shares for a sale, and for a short sale, worth enough
// behind it.
function affordable(counted, e) {
  const s = replay(counted, e.t);
  const unit = Math.max(1, Math.abs(e.total) * 0.005);
  if (e.side === 'buy') return (s.cash[e.currency] || 0) + (e.financed || 0) + unit >= e.total;
  const held = Math.max(0, s.positions[e.symbol]?.qty || 0);
  if (held + 1e-6 >= e.qty) return true;
  const after = replay({ ...counted, events: [...counted.events, e] }, e.t);
  const rates = twdRates([...counted.events, e]);
  const short = Object.values(after.positions).reduce((sum, p) => sum + (p.qty < 0 ? -p.costTWD : 0), 0);
  return worthTWD(after, rates) + unit >= short * SHORT_COVER;
}

// A Securities save checked: the account's money as the pool counts it.
// { cash, held, opened } (held: the holdings at what was paid for them, less
// what's owed beyond the cash; opened: the account's opening money), with
// each new event checked once (`stock-verified/<account>`).
export async function checkStock(env, docId, payload, wallet, deps, lockSince, now = Date.now()) {
  const account = await unpack(payload).catch(() => null);
  if (!account || !Array.isArray(account.events)) return null;
  const doc = await deps.fsGet(env, VERIFIED_COLLECTION, docId);
  const kept = (doc.exists && JSON.parse(doc.payload)) || { ok: [], bad: [] };
  const ok = new Set(kept.ok);
  const bad = new Set(kept.bad);
  const adj = { ...(kept.adj || {}) };
  const first = !doc.exists;
  // The fills this Worker issued (stock-fill.js).
  const book = await readFillsBook(env, docId, deps.fsGet);
  const issued = { ...book.fills };
  // An order the phone shows cancelled that this Worker didn't let be
  // cancelled: filled if the Worker filled it, or its bars reached its price
  // since the Worker last looked (a phone holding back its ask, then
  // cancelling once the price went against it, still takes the fill). The
  // fill is counted as the Worker's (checked below like any other).
  const filledIds = new Set(account.events.filter(e => e?.type === 'fill' && e.orderId).map(e => e.orderId));
  const dodged = (Array.isArray(account.orders) ? account.orders : []).filter(o => o?.status === 'cancelled' && o.id && !filledIds.has(o.id) && !book.cancelled[o.id] && (book.fills[o.id] || book.open[o.id]));
  const undecided = dodged.filter(o => !issued[o.id]).map(o => ({ id: o.id, ...book.open[o.id] }));
  if (undecided.length) Object.assign(issued, (await decideFills(undecided, { read: deps.read, now }).catch(() => ({ fills: {} }))).fills);
  const forced = [];
  for (const o of dodged.filter(x => issued[x.id])) {
    const reopened = { ...account, orders: account.orders.map(x => (x.id === o.id ? { ...x, status: 'open' } : x)) };
    const r = applyFills(reopened, { [o.id]: issued[o.id] }, { TWD: 1, ...twdRates(account.events) }, now);
    forced.push(...r.filled);
  }
  // In time order, each id once, each checked against the account as counted so far.
  const seen = new Set();
  const events = [...account.events, ...forced]
    .filter(e => e?.id && !seen.has(e.id) && seen.add(e.id))
    .sort((a, b) => a.t - b.t || (a.id < b.id ? -1 : 1));
  // (Open orders only hold money back: a phone's figure can't add any.)
  const orders = (Array.isArray(account.orders) ? account.orders : []).map(o => ({ ...o, reserve: Math.max(0, Number(o?.reserve) || 0), deposit: Math.max(0, Number(o?.deposit) || 0) }));
  const counted = { ...account, orders, events: [] };
  const used = new Set();
  let checked = 0;
  for (const raw of events) {
    let e = adj[raw.id] ? { ...raw, ...adj[raw.id] } : raw;
    let verdict = ok.has(e.id) ? 'ok' : bad.has(e.id) ? 'bad' : null;
    // The account as it was before the lock-down: taken as it was.
    if (!verdict && first && e.t < lockSince) verdict = 'ok';
    // (A pool deposit follows the wallet: always looked at again.)
    if (e.type === 'deposit' && e.pool) verdict = await checkEvent(e, counted, wallet, deps.read, issued, { now, used }).catch(() => 'later');
    if (!verdict && checked < 40) {
      checked++;
      verdict = await checkEvent(e, counted, wallet, deps.read, issued, { now, used }).catch(() => 'later');
      if (verdict?.adjust) {
        adj[e.id] = verdict.adjust;
        e = { ...e, ...verdict.adjust };
        verdict = 'ok';
      }
      // Only with what the account had then.
      if (verdict === 'ok' && e.type === 'fill' && !e.maturity && !affordable(counted, e)) verdict = 'bad';
    }
    if (verdict === 'ok') {
      if (!(e.type === 'deposit' && e.pool)) ok.add(e.id);
      counted.events.push(e);
      if (e.type === 'fill' && e.orderId) used.add(e.orderId);
      if (e.type === 'fill' && e.maturity) used.add(`maturity:${e.symbol}`);
      if (e.type === 'div') used.add(`div:${e.symbol}:${e.coupon ? e.t : e.ex}`);
      if (e.type === 'split') used.add(`split:${e.symbol}:${Math.round(e.t / DAY)}`);
    } else if (verdict === 'bad') {
      bad.add(e.id);
      delete adj[e.id];
    }
  }
  const next = { ok: [...ok], bad: [...bad], ...(Object.keys(adj).length ? { adj } : {}), t: now };
  if (first || next.ok.length !== kept.ok.length || next.bad.length !== kept.bad.length || Object.keys(adj).length !== Object.keys(kept.adj || {}).length) await deps.fsWrite(env, VERIFIED_COLLECTION, docId, JSON.stringify(next)).catch(() => {});
  const s = replay(counted, now);
  const rates = twdRates(counted.events);
  const owed = owedTWD(s, rates);
  const own = Math.round(ownCash(counted, s, now) * 100) / 100;
  // What's owed comes off the cash first (never below nothing), the rest off the holdings.
  const fromCash = Math.min(Math.max(0, own), owed);
  const longs = Object.values(s.positions).reduce((sum, p) => sum + (p.qty > 0 ? p.costTWD : 0), 0);
  const opened = counted.events.filter(e => e.type === 'deposit' && !e.pool && (e.id === 'deposit:start' || e.start)).reduce((sum, e) => sum + e.amount, 0);
  return { cash: Math.round((own - fromCash) * 100) / 100, held: Math.max(0, Math.round(longs - (owed - fromCash))), opened, refused: [...bad] };
}
