// Quadra Securities' prices from Yahoo Finance's public endpoints, in the
// kit so the phone and the proxy (stock-fill.js: orders filled at the
// proxy's own quote) read them with one code: the reader is handed in
// (useQuotesReader: the phone's is the kit's proxyJson; the proxy's, its
// data route in place). Quotes come 20 to a request from
// /v7/finance/spark (with the day's price line), charts, dividends and
// splits from /v8/finance/chart, and symbol search from /v1/finance/search.
import { BASE, METALS, GRAMS_PER_OUNCE, FUND_CUTOFF, isTwFund, isWarrant, isFuture, futureOf, isOption, tickSize, toTick as onTickOf, SSF_RATE, optionOf, optionTick, optionExpiry, seriesFuture, OPTION, kindOf, marketOf, normalizeCurrency } from './stock-markets.mjs';
import { BONDS, ISSUERS, CURVE_SYMBOLS, bondQuote, bondLine, curveOf } from './stock-bonds.mjs';

export const PROXY_URL = 'https://orbit-workers-proxy.pengzjay.workers.dev';
const YAHOO = 'https://query1.finance.yahoo.com';
const SPARK_BATCH = 20;


// Through the kit's proxyJson: requests made together go as one batch
// (one Worker request), and each answer is remembered (in memory and on the
// device) for as long as that kind of data stays useful: today's quotes 25
// seconds (orders fill at a price under a minute old), longer charts half an
// hour, company numbers an hour, searches a day.
export function ttlFor(url) {
  if (url.startsWith(FUND_NAV) || url === TAIFEX_URL) return 10 * 60_000;
  if (url.startsWith(FUND_HIST)) return 3 * 3_600_000;
  if (url.startsWith(MIS_URL)) return 25_000;
  if (url.includes('/v1/finance/search')) return 24 * 3_600_000;
  if (url.includes('/v10/finance/quoteSummary')) return 3_600_000;
  const range = /[?&]range=([^&]+)/.exec(url)?.[1] || '1d';
  return range === '1d' || range === '5d' ? 25_000 : 30 * 60_000;
}
let reader = null;
// The reader every fetch here goes through: (url, { ttl, persist, timeout }) -> JSON.
export const useQuotesReader = fn => void (reader = fn);
// Kept on the device: what lasts past a minute, and every chart (a day's
// too: a read Yahoo turns down answers the last one drawn, not an error).
const getJson = url => {
  if (!reader) throw new Error('quotes: no reader');
  const ttl = ttlFor(url);
  return reader(url, { ttl, persist: ttl > 60_000 || url.includes('/v8/finance/chart/'), timeout: 15_000 });
};

// Taiwan's funds' NAVs (境內基金): the proxy's copy of SITCA's daily list
// (fund-nav.js), by 基金統編, FUND_BATCH to a request. A fund is
// `${統編}.TWF`; its price is the NAV dated `date` (that day's, out in the
// evening), as of the cutoff it answers (FUND_CUTOFF).
const FUND_NAV = 'https://funds.quadra/nav.json?codes=';
// A fund's ten years of NAVs and its profile (fund-nav.js /hist.json: Anue's, checked by 統編).
const FUND_HIST = 'https://funds.quadra/hist.json?code=';
const readFundHist = symbol => getJson(FUND_HIST + encodeURIComponent(symbol.slice(0, -4))).catch(() => null);
const FUND_BATCH = 40;

// TWSE's own live quotes (基本市況報導, mis.twse.com.tw): a warrant's or
// 牛熊證's price where Yahoo has none (most trade rarely). Its last trade
// today, else the market maker's best bid (what it can be sold for), else
// the day's reference price; `bid`/`ask` the best of each. MIS_BATCH to a request.
const MIS_URL = 'https://mis.twse.com.tw/stock/api/getStockInfo.jsp?ex_ch=';
const MIS_BATCH = 40;
const misChannel = symbol => `${/\.TWO$/i.test(symbol) ? 'otc' : 'tse'}_${symbol.replace(/\.TWO?$/i, '').toLowerCase()}.tw`;
export function misQuote(symbol, m, now = Date.now()) {
  const n = x => (Number(x) > 0 ? Number(x) : null);
  const best = s => n(String(s || '').split('_')[0]);
  const prev = n(m?.y);
  const bid = best(m?.b);
  const ask = best(m?.a);
  const last = n(m?.z);
  const price = last ?? bid ?? prev;
  if (!price) return null;
  const day = /^\d{8}$/.test(m.d || '') ? `${m.d.slice(0, 4)}-${m.d.slice(4, 6)}-${m.d.slice(6)}` : new Date(now + 8 * 3_600_000).toISOString().slice(0, 10);
  const at = clock => Date.parse(`${day}T${clock}+08:00`);
  const marketTime = /^\d\d:\d\d:\d\d$/.test(m.t || '') ? at(m.t) : now;
  const base = prev || price;
  return {
    symbol,
    name: m.n || symbol,
    shortName: m.n || symbol,
    kind: 'warrant',
    market: 'TW',
    currency: 'TWD',
    price,
    prev: base,
    change: price - base,
    pct: base ? price / base - 1 : 0,
    bid,
    ask,
    dayHigh: n(m.h),
    dayLow: n(m.l),
    high52: null,
    low52: null,
    volume: Number(m.v) || 0,
    exchange: /\.TWO$/i.test(symbol) ? 'TPEx' : 'TWSE',
    tz: 'Asia/Taipei',
    marketTime,
    session: { start: at('09:00:00'), end: at('13:30:00') },
    line: [[at('09:00:00'), base], [marketTime, price]]
  };
}
async function fetchMisQuotes(symbols) {
  const out = new Map();
  const batches = [];
  for (let i = 0; i < symbols.length; i += MIS_BATCH) batches.push(symbols.slice(i, i + MIS_BATCH));
  const results = await Promise.allSettled(batches.map(b => getJson(MIS_URL + b.map(misChannel).join('|'))));
  for (const r of results) {
    if (r.status !== 'fulfilled') continue;
    for (const m of r.value?.msgArray || []) {
      const symbol = symbols.find(s => misChannel(s) === `${m.ex}_${m.c}.tw`.toLowerCase());
      const q = symbol && misQuote(symbol, m);
      if (q) out.set(symbol, q);
    }
  }
  return out;
}
export function fundQuote(symbol, f) {
  if (!f || !(f.nav > 0)) return null;
  const prev = f.prev > 0 ? f.prev : f.nav;
  const marketTime = Date.parse(`${f.date}T${FUND_CUTOFF}:00+08:00`);
  return {
    symbol,
    name: f.name,
    shortName: f.name,
    kind: 'fund',
    market: 'TWFUND',
    currency: normalizeCurrency(f.currency).currency,
    price: f.nav,
    prev,
    change: f.nav - prev,
    pct: prev ? f.nav / prev - 1 : 0,
    dayHigh: null,
    dayLow: null,
    high52: null,
    low52: null,
    volume: null,
    exchange: f.company || '',
    tz: 'Asia/Taipei',
    marketTime,
    session: null,
    line: [[marketTime - 86_400_000, prev], [marketTime, f.nav]]
  };
}
async function fetchFundQuotes(symbols) {
  const codes = symbols.map(s => s.slice(0, -4));
  const out = new Map();
  const batches = [];
  for (let i = 0; i < codes.length; i += FUND_BATCH) batches.push(codes.slice(i, i + FUND_BATCH));
  const results = await Promise.allSettled(batches.map(b => getJson(FUND_NAV + b.map(encodeURIComponent).join(','))));
  for (const r of results)
    if (r.status === 'fulfilled')
      for (const [code, f] of Object.entries(r.value?.funds || {})) {
        const q = fundQuote(`${code}.TWF`, f);
        if (q) out.set(q.symbol, q);
      }
  return { out, failed: results.filter(r => r.status === 'rejected').length, batches: batches.length };
}

// TAIFEX's futures (期貨): TAIFEX publishes no live prices, so a contract is
// what it's on, live (the 加權指數, or a stock or ETF for 股票期貨), plus its
// basis (正逆價差) at the last settlement: its settlement price less that
// day's close of what it's on. The proxy's copy of TAIFEX's table
// (taifex.js): settlement prices, margins and final settlements.
const TAIFEX_URL = 'https://taifex.quadra/fut.json';
const TAIEX = '^TWII';
const taipeiDate = t => new Date(t + 8 * 3_600_000).toISOString().slice(0, 10);
// How far a contract stands above (below) what it's on, or null. `under`:
// that one's quote (the index's for 台指期).
export function futBasis(symbol, under, table) {
  const f = futureOf(symbol);
  const settle = f && table?.settle?.[`${f.code}${f.year}${String(f.month).padStart(2, '0')}`];
  if (!settle || !under) return null;
  // (The table's day: today's close once it's out, else yesterday's, the previous close.)
  const close = taipeiDate(under.marketTime) === table.date ? under.price : under.prev;
  return settle - close;
}
// A contract's margins, NT$ [initial, maintenance] at `price`: TAIFEX's
// amounts (the index's, an ETF's), else its rates of the contract's value.
export function futMarginAt(symbol, price, table) {
  const f = futureOf(symbol);
  if (!f) return null;
  if (table?.margin?.[f.code]) return table.margin[f.code];
  if (!f.stock || !(price > 0)) return null;
  const [im, mm] = table?.ssfRate?.[f.code] || SSF_RATE;
  return [Math.round(price * f.mult * im), Math.round(price * f.mult * mm)];
}
export function futQuote(symbol, under, table) {
  const f = futureOf(symbol);
  const basis = futBasis(symbol, under, table);
  if (basis === null) return null;
  // (The index's futures in whole points; a stock's at its ticks.)
  const at = x => (Number.isFinite(x) ? (f.stock ? onTickOf(x + basis, tickSize('TAIFEX', 'fut', x + basis, symbol)) : Math.round(x + basis)) : null);
  const price = at(under.price);
  const prev = at(under.prev);
  const month = `${f.year}${String(f.month).padStart(2, '0')}`;
  const final = f.stock ? table.ssfFinal?.[`${f.code}${month}`] : table.final?.[month];
  return {
    ...under,
    symbol,
    name: `${f.zh} ${f.month}月`,
    shortName: `${f.zh} ${f.month}月`,
    kind: 'fut',
    market: 'TAIFEX',
    currency: BASE,
    price,
    prev,
    change: price - prev,
    pct: prev ? price / prev - 1 : 0,
    dayHigh: at(under.dayHigh),
    dayLow: at(under.dayLow),
    high52: null,
    low52: null,
    volume: null,
    exchange: 'TAIFEX',
    underlying: f.underlying,
    basis,
    margin: futMarginAt(symbol, price, table),
    ...(final ? { final } : {}),
    line: (under.line || []).map(([t, c]) => [t, c + basis])
  };
}
const readTaifex = () => getJson(TAIFEX_URL);
// TAIFEX's options (臺指選擇權): no live prices either. Each is priced by
// Black-76 on its month's futures price (the live index plus that month's
// basis), at the volatility its last settlement price implies (that day's
// futures settlement, the time then left), to its tick, never under what
// it's worth exercised.
const YEAR = 365 * 86_400_000;
function normCdf(x) {
  // (Abramowitz and Stegun 26.2.17.)
  const k = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = Math.exp((-x * x) / 2) / Math.sqrt(2 * Math.PI);
  const p = d * k * (0.31938153 + k * (-0.356563782 + k * (1.781477937 + k * (-1.821255978 + k * 1.330274429))));
  return x >= 0 ? 1 - p : p;
}
export function black76(right, F, K, T, vol) {
  const intrinsic = Math.max(0, right === 'C' ? F - K : K - F);
  if (!(T > 0) || !(vol > 0)) return intrinsic;
  const sd = vol * Math.sqrt(T);
  const d1 = (Math.log(F / K) + (sd * sd) / 2) / sd;
  const d2 = d1 - sd;
  return right === 'C' ? F * normCdf(d1) - K * normCdf(d2) : K * normCdf(-d2) - F * normCdf(-d1);
}
// The volatility at which Black-76 gives `price` (bisection), or null.
export function impliedVol(right, F, K, T, price) {
  const intrinsic = Math.max(0, right === 'C' ? F - K : K - F);
  if (!(T > 0) || !(price > intrinsic)) return null;
  let [lo, hi] = [0.001, 5];
  if (black76(right, F, K, T, hi) < price) return null;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (black76(right, F, K, T, mid) < price) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}
const toTick = x => {
  const tick = optionTick(x);
  return Math.max(0.1, Math.round(Math.round(x / tick) * tick * 10) / 10);
};
// One option's price from the index at `t` (index points), or null.
export function optPricer(symbol, taiex, table) {
  const o = optionOf(symbol);
  if (!o || !taiex || !table?.date) return null;
  // (A weekly's settlement is under its series; its futures, the month it expires in or the next.)
  const month = o.series;
  const settle = table.opt?.[month]?.[o.right]?.[o.strike];
  const fm = seriesFuture(o.series);
  const fut = `TX${fm}.TF`;
  const F0 = table.settle?.[`TX${fm}`];
  const basis = futBasis(fut, taiex, table);
  const expiry = optionExpiry(symbol);
  if (!(settle > 0) || !(F0 > 0) || basis === null || !expiry) return null;
  // (The settlement's moment: the table's day at 13:45.)
  const T0 = (expiry - Date.parse(`${table.date}T13:45:00+08:00`)) / YEAR;
  // (Deep in the money with no time value left: the intrinsic, at a floor volatility.)
  const vol = impliedVol(o.right, F0, o.strike, T0, settle) ?? 0.05;
  return { basis, settle, month, price: (index, t) => {
    const F = index + basis;
    const intrinsic = Math.max(0, o.right === 'C' ? F - o.strike : o.strike - F);
    return toTick(Math.max(intrinsic, black76(o.right, F, o.strike, (expiry - t) / YEAR, vol)));
  } };
}
export function optQuote(symbol, taiex, table) {
  const o = optionOf(symbol);
  const pricer = optPricer(symbol, taiex, table);
  if (!pricer) return null;
  const t = taiex.marketTime || Date.now();
  const price = pricer.price(taiex.price, t);
  const prev = Number.isFinite(taiex.prev) ? pricer.price(taiex.prev, t) : price;
  // (A weekly by its day: 台指選 10/28週.)
  const due = new Date(optionExpiry(symbol) + 8 * 3_600_000);
  const name = `${OPTION.zh} ${o.week ? `${due.getUTCMonth() + 1}/${due.getUTCDate()}週` : `${o.month}月`} ${o.strike} ${o.right === 'C' ? '買權' : '賣權'}`;
  return {
    ...taiex,
    symbol,
    name,
    shortName: name,
    kind: 'opt',
    market: 'TAIFEX',
    currency: BASE,
    price,
    prev,
    change: Math.round((price - prev) * 10) / 10,
    pct: prev ? price / prev - 1 : 0,
    dayHigh: null,
    dayLow: null,
    high52: null,
    low52: null,
    volume: null,
    exchange: 'TAIFEX',
    right: o.right,
    strike: o.strike,
    underlying: Math.round(taiex.price + pricer.basis),
    // (The index, for a written option's margin: what it's out of the money by.)
    index: taiex.price,
    ...(table.optMargin?.A ? { optMargin: table.optMargin } : {}),
    settle: pricer.settle,
    ...(table.final?.[pricer.month] ? { final: table.final[pricer.month] } : {}),
    line: (taiex.line || []).map(([tt, c]) => [tt, pricer.price(c, tt)])
  };
}
// TAIFEX's table itself (a month's final settlement price after its contract is gone).
export const fetchFutTable = readTaifex;

// The FX symbol for a currency's price in NT$ (USDTWD=X: NT$ per US$).
export const fxSymbol = currency => `${currency}${BASE}=X`;

// One quote from a spark or chart response: meta plus the price line.
export function quoteFromMeta(meta, timestamps = [], closes = [], hint = {}) {
  if (!meta || !Number.isFinite(meta.regularMarketPrice)) return null;
  const { currency, factor } = normalizeCurrency(meta.currency);
  const symbol = meta.symbol;
  const kind = kindOf(meta.instrumentType, symbol, hint.kind);
  const price = meta.regularMarketPrice / factor;
  const prev = (meta.chartPreviousClose ?? meta.previousClose ?? meta.regularMarketPrice) / factor;
  const line = [];
  for (let i = 0; i < closes.length; i++) if (Number.isFinite(closes[i])) line.push([timestamps[i] * 1000, closes[i] / factor]);
  const period = meta.currentTradingPeriod?.regular;
  return {
    symbol,
    name: meta.longName || meta.shortName || symbol,
    shortName: meta.shortName || meta.longName || symbol,
    kind,
    market: marketOf(symbol, kind),
    currency,
    price,
    prev,
    change: price - prev,
    pct: prev ? price / prev - 1 : 0,
    dayHigh: Number.isFinite(meta.regularMarketDayHigh) ? meta.regularMarketDayHigh / factor : null,
    dayLow: Number.isFinite(meta.regularMarketDayLow) ? meta.regularMarketDayLow / factor : null,
    high52: Number.isFinite(meta.fiftyTwoWeekHigh) ? meta.fiftyTwoWeekHigh / factor : null,
    low52: Number.isFinite(meta.fiftyTwoWeekLow) ? meta.fiftyTwoWeekLow / factor : null,
    volume: meta.regularMarketVolume ?? null,
    exchange: meta.fullExchangeName || meta.exchangeName || '',
    tz: meta.exchangeTimezoneName || 'UTC',
    marketTime: (meta.regularMarketTime || 0) * 1000,
    session: period ? { start: period.start * 1000, end: period.end * 1000 } : null,
    line
  };
}

export function parseSpark(json) {
  const out = new Map();
  for (const item of json?.spark?.result || []) {
    const r = item.response?.[0];
    const q = r && quoteFromMeta(r.meta, r.timestamp || [], r.indicators?.quote?.[0]?.close || []);
    if (q) out.set(item.symbol, { ...q, symbol: item.symbol });
  }
  return out;
}

export function parseChart(json) {
  const r = json?.chart?.result?.[0];
  if (!r) return null;
  const quote = quoteFromMeta(r.meta, r.timestamp || [], r.indicators?.quote?.[0]?.close || []);
  if (!quote) return null;
  const { factor } = normalizeCurrency(r.meta.currency);
  const q = r.indicators?.quote?.[0] || {};
  const bars = [];
  // Closes with dividends added back (Yahoo's adjusted close): what holding
  // it and reinvesting every dividend would have made.
  const adj = r.indicators?.adjclose?.[0]?.adjclose || [];
  const adjusted = [];
  for (let i = 0; i < (r.timestamp || []).length; i++) {
    const [o, h, l, c] = [q.open?.[i], q.high?.[i], q.low?.[i], q.close?.[i]];
    if ([o, h, l, c].every(Number.isFinite)) bars.push({ t: r.timestamp[i] * 1000, o: o / factor, h: h / factor, l: l / factor, c: c / factor, v: q.volume?.[i] || 0 });
    if (Number.isFinite(adj[i])) adjusted.push([r.timestamp[i] * 1000, adj[i] / factor]);
  }
  const dividends = Object.values(r.events?.dividends || {})
    .map(d => ({ date: d.date * 1000, amount: d.amount / factor }))
    .sort((a, b) => a.date - b.date);
  const splits = Object.values(r.events?.splits || {})
    .filter(s => s.numerator > 0 && s.denominator > 0)
    .map(s => ({ date: s.date * 1000, ratio: s.numerator / s.denominator }))
    .sort((a, b) => a.date - b.date);
  return { quote, points: quote.line, bars, adjusted, dividends, splits };
}

// A passbook metal: the future's US$ per troy ounce, in NT$ per gram.
export function metalQuote(symbol, future, usd) {
  if (!future || !usd) return null;
  const k = usd.price / GRAMS_PER_OUNCE;
  const kPrev = usd.prev / GRAMS_PER_OUNCE;
  const info = METALS[symbol];
  const price = future.price * k;
  const prev = future.prev * kPrev;
  return {
    ...future,
    symbol,
    name: info.en,
    shortName: info.en,
    kind: 'metal',
    market: 'METAL',
    currency: BASE,
    price,
    prev,
    change: price - prev,
    pct: prev ? price / prev - 1 : 0,
    dayHigh: future.dayHigh && future.dayHigh * k,
    dayLow: future.dayLow && future.dayLow * k,
    high52: future.high52 && future.high52 * k,
    low52: future.low52 && future.low52 * k,
    exchange: 'COMEX × USD/TWD',
    line: future.line.map(([t, c]) => [t, c * k])
  };
}

// The symbols to ask Yahoo for: passbooks need their future and US$.
function upstreamSymbols(symbols) {
  const set = new Set();
  for (const s of symbols) {
    if (METALS[s]) {
      set.add(METALS[s].future);
      set.add(fxSymbol('USD'));
    } else if (BONDS[s]) {
      if (BONDS[s].live) for (const c of CURVE_SYMBOLS) set.add(c);
    } else if (isFuture(s)) set.add(futureOf(s).underlying);
    else if (isOption(s)) set.add(TAIEX);
    else if (s !== BASE && !isTwFund(s)) set.add(s);
  }
  return [...set];
}

// Latest quotes for these symbols (with today's price line), as a Map.
// Symbols Yahoo doesn't know are simply missing.
export async function fetchQuotes(symbols, { range = '1d', interval = '5m' } = {}) {
  const wanted = upstreamSymbols(symbols).sort();
  const funds = [...new Set(symbols.filter(isTwFund))].sort();
  const fundRead = funds.length ? fetchFundQuotes(funds) : null;
  const futs = symbols.filter(isFuture);
  const opts = symbols.filter(isOption);
  const futRead = futs.length || opts.length ? readTaifex().catch(() => null) : null;
  const batches = [];
  for (let i = 0; i < wanted.length; i += SPARK_BATCH) batches.push(wanted.slice(i, i + SPARK_BATCH));
  const results = await Promise.allSettled(
    batches.map(batch =>
      getJson(`${YAHOO}/v7/finance/spark?symbols=${batch.map(encodeURIComponent).join(',')}&range=${range}&interval=${interval}`)
    )
  );
  const out = new Map();
  let failed = 0;
  let asked = batches.length;
  for (const r of results) {
    if (r.status === 'fulfilled') for (const [k, v] of parseSpark(r.value)) out.set(k, v);
    else failed++;
  }
  for (const s of symbols) if (METALS[s]) {
    const q = metalQuote(s, out.get(METALS[s].future), out.get(fxSymbol('USD')));
    if (q) out.set(s, q);
  }
  for (const s of symbols) if (BONDS[s]) {
    const q = liveBondQuote(s, out);
    if (q) out.set(s, q);
  }
  if (futRead) {
    const table = await futRead;
    const taiex = out.get(TAIEX);
    for (const s of futs) {
      const under = out.get(futureOf(s).underlying);
      const q = table && under && futQuote(s, under, table);
      if (q) out.set(s, q);
    }
    for (const s of opts) {
      const q = table && taiex && optQuote(s, taiex, table);
      if (q) out.set(s, q);
    }
    for (const u of new Set([TAIEX, ...futs.map(s => futureOf(s).underlying)])) if (!symbols.includes(u)) out.delete(u);
  }
  // Warrants Yahoo has no price for: TWSE's own.
  const noPrice = symbols.filter(s => isWarrant(s) && !out.has(s));
  if (noPrice.length) for (const [k, v] of await fetchMisQuotes(noPrice).catch(() => new Map())) out.set(k, v);
  if (fundRead) {
    const f = await fundRead;
    for (const [k, v] of f.out) out.set(k, v);
    failed += f.failed;
    asked += f.batches;
  }
  if (failed && failed === asked) throw new Error('quotes unavailable');
  // When it was read (an order waiting for a fresh price checks it).
  const got = Date.now();
  for (const q of out.values()) q.got = got;
  return out;
}

// Today's quote for a bond: the live curve (and yesterday's, for the day's
// change) or the reference one, with today's price line from the curve's.
function liveBondQuote(symbol, quotes) {
  const bond = BONDS[symbol];
  const now = Date.now();
  if (!bond.live) {
    const q = bondQuote(bond, curveOf(bond.issuer), null, now);
    return q && { ...q, line: bondLine(bond, [now - 86_400_000, now], () => curveOf(bond.issuer)) };
  }
  const curve = curveOf(bond.issuer, quotes);
  if (!curve) return null;
  const q = bondQuote(bond, curve, curveOf(bond.issuer, quotes, x => x.prev), now);
  const lines = ISSUERS[bond.issuer].live.map(([years, sym]) => [years, quotes.get(sym)?.line || []]);
  const times = lines.find(([y]) => y === 10)?.[1].map(p => p[0]) || [];
  return { ...q, line: bondLine(bond, times, t => curveFromLines(lines, t)) };
}

// The curve at moment `t` from each point's history (its latest value at or
// before `t`).
function curveFromLines(lines, t) {
  const pts = [];
  for (const [years, line] of lines) {
    let v = null;
    for (const [tt, c] of line) {
      if (tt > t) break;
      v = c;
    }
    if (v === null && line.length) v = line[0][1];
    if (Number.isFinite(v)) pts.push([years, v]);
  }
  return pts.length ? pts : null;
}

// Chart ranges: [range, interval].
export const RANGES = {
  '1d': ['1d', '5m'],
  '5d': ['5d', '30m'],
  '1mo': ['1mo', '1d'],
  '6mo': ['6mo', '1d'],
  ytd: ['ytd', '1d'],
  '1y': ['1y', '1d'],
  '5y': ['5y', '1wk'],
  max: ['max', '1mo']
};

export async function fetchChart(symbol, rangeKey = '1mo', { events = false } = {}) {
  const [range, interval] = RANGES[rangeKey] || RANGES['1mo'];
  if (BONDS[symbol]) {
    const bond = BONDS[symbol];
    const quote = (await fetchQuotes([symbol]).catch(() => new Map())).get(symbol) || null;
    let lines;
    if (bond.live) {
      const charts = await Promise.all(ISSUERS[bond.issuer].live.map(([, sym]) => fetchChart(sym, rangeKey).catch(() => null)));
      lines = ISSUERS[bond.issuer].live.map(([years], i) => [years, charts[i]?.points || []]);
    }
    const ref = lines?.find(([y]) => y === 10)?.[1] || [];
    const span = { '1d': 1, '5d': 5, '1mo': 30, '6mo': 182, ytd: 270, '1y': 365, '5y': 1826, max: 3650 }[rangeKey] || 30;
    const times = ref.length ? ref.map(p => p[0]) : Array.from({ length: 60 }, (_, i) => Date.now() - ((59 - i) / 59) * span * 86_400_000);
    const points = bondLine(bond, times, t => (bond.live ? curveFromLines(lines, t) : curveOf(bond.issuer)));
    return { quote, points, bars: [], dividends: [], splits: [] };
  }
  // A future: the chart of what it's on, at today's basis (its history approximated).
  if (isFuture(symbol)) {
    const [chart, table] = await Promise.all([fetchChart(futureOf(symbol).underlying, rangeKey), readTaifex()]);
    const quote = chart && futQuote(symbol, chart.quote, table);
    if (!quote) return null;
    const shift = ([t, c]) => [t, c + quote.basis];
    return { quote, points: chart.points.map(shift), bars: (chart.bars || []).map(b => ({ ...b, o: b.o + quote.basis, h: b.h + quote.basis, l: b.l + quote.basis, c: b.c + quote.basis })), dividends: [], splits: [] };
  }
  // An option: priced along the index's chart (its history approximated, at today's volatility).
  if (isOption(symbol)) {
    const [chart, table] = await Promise.all([fetchChart(TAIEX, rangeKey), readTaifex()]);
    const pricer = chart && optPricer(symbol, chart.quote, table);
    const quote = pricer && optQuote(symbol, chart.quote, table);
    if (!quote) return null;
    const expiry = optionExpiry(symbol);
    const points = chart.points.filter(([t]) => t < expiry).map(([t, c]) => [t, pricer.price(c, t)]);
    return { quote, points, bars: [], dividends: [], splits: [] };
  }
  // A fund: its NAVs over the range (Anue's history), today's from SITCA's
  // list last; only those two where the history isn't found.
  if (isTwFund(symbol)) {
    const [quotes, hist] = await Promise.all([fetchQuotes([symbol]), readFundHist(symbol)]);
    const quote = quotes.get(symbol) || null;
    if (!quote) return null;
    const span = { '1d': 1, '5d': 5, '1mo': 30, '6mo': 182, '1y': 365, '5y': 1826, max: 3650 }[rangeKey];
    const from = rangeKey === 'ytd' ? Date.UTC(new Date(quote.marketTime).getUTCFullYear(), 0, 1) - 8 * 3_600_000 : quote.marketTime - (span || 30) * 86_400_000 - 43_200_000;
    // (Anue dates a NAV at its day's midnight UTC; SITCA's at the 15:30 cutoff.)
    const day = t => new Date(t + 8 * 3_600_000).toISOString().slice(0, 10);
    const today = day(quote.marketTime);
    const points = (hist?.points || []).filter(([t]) => t >= from && day(t) < today);
    // A week or less: the history's days too few for a line; the last two NAVs as SITCA gives them.
    if (points.length < 2) return { quote, points: quote.line, bars: [], dividends: [], splits: [] };
    return { quote, points: [...points, [quote.marketTime, quote.price]], bars: [], dividends: [], splits: [] };
  }
  if (METALS[symbol]) {
    const [future, usd] = await Promise.all([fetchChart(METALS[symbol].future, rangeKey), fetchChart(fxSymbol('USD'), rangeKey)]);
    if (!future || !usd) return null;
    // Each point at the US$ rate of its day (the nearest earlier FX point).
    let j = 0;
    const points = future.points.map(([t, c]) => {
      while (j + 1 < usd.points.length && usd.points[j + 1][0] <= t) j++;
      return [t, (c * (usd.points[j]?.[1] ?? usd.quote.price)) / GRAMS_PER_OUNCE];
    });
    const quote = metalQuote(symbol, future.quote, usd.quote);
    return { quote, points, dividends: [], splits: [] };
  }
  const url = `${YAHOO}/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}${events ? '&events=div%2Csplit' : ''}`;
  if (!isWarrant(symbol)) return parseChart(await getJson(url));
  // A warrant Yahoo doesn't chart: today's from TWSE's own quote.
  const chart = await getJson(url).then(parseChart, () => null);
  if (chart?.points?.length > 1) return chart;
  const quote = (await fetchMisQuotes([symbol])).get(symbol);
  return quote ? { quote, points: quote.line, bars: [], dividends: [], splits: [] } : chart;
}

// Price bars since `since`, as fine as Yahoo keeps them: 5 minutes for the
// last few days, 30 minutes for a month, an hour for two years, days after.
// `prePost`: the US pre- and post-market's bars too.
export async function fetchBars(symbol, since, { prePost = false } = {}) {
  const age = Date.now() - since;
  const day = 86_400_000;
  if (isTwFund(symbol) || isOption(symbol)) return [];
  if (isFuture(symbol)) {
    const [bars, quotes] = await Promise.all([fetchBars(futureOf(symbol).underlying, since), fetchQuotes([symbol])]);
    const basis = quotes.get(symbol)?.basis;
    return basis == null ? [] : bars.map(b => ({ ...b, o: b.o + basis, h: b.h + basis, l: b.l + basis, c: b.c + basis }));
  }
  const [range, interval] = age < 5 * day ? ['5d', '5m'] : age < 28 * day ? ['1mo', '30m'] : age < 700 * day ? ['2y', '1h'] : ['max', '1d'];
  if (METALS[symbol]) {
    const [future, usd] = await Promise.all([fetchBars(METALS[symbol].future, since), fetchBars(fxSymbol('USD'), since)]);
    let j = 0;
    return future.map(b => {
      while (j + 1 < usd.length && usd[j + 1].t <= b.t) j++;
      const k = (usd[j]?.c ?? 0) / GRAMS_PER_OUNCE;
      return { t: b.t, o: b.o * k, h: b.h * k, l: b.l * k, c: b.c * k };
    }).filter(b => b.c > 0);
  }
  const json = await getJson(`${YAHOO}/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}${prePost ? '&includePrePost=true' : ''}`);
  return parseChart(json)?.bars || [];
}

// Dividends and splits since `since` (ms): the account credits them.
export async function fetchCorporateActions(symbol, since) {
  if (isTwFund(symbol) || isFuture(symbol) || isOption(symbol)) return { dividends: [], splits: [] };
  const years = (Date.now() - since) / (365.25 * 86_400_000);
  const range = years < 0.9 ? '1y' : years < 4.5 ? '5y' : 'max';
  const [r, interval] = [range, range === 'max' ? '1mo' : range === '5y' ? '1wk' : '1d'];
  const json = await getJson(`${YAHOO}/v8/finance/chart/${encodeURIComponent(symbol)}?range=${r}&interval=${interval}&events=div%2Csplit`);
  const chart = parseChart(json);
  return chart ? { dividends: chart.dividends, splits: chart.splits } : { dividends: [], splits: [] };
}

// Search Yahoo by symbol or English name. Options and the like are dropped.
const SEARCH_TYPES = new Set(['EQUITY', 'ETF', 'MUTUALFUND', 'CRYPTOCURRENCY', 'INDEX', 'FUTURE', 'CURRENCY']);
export function parseSearch(json) {
  return (json?.quotes || [])
    .filter(q => q.symbol && SEARCH_TYPES.has(q.quoteType))
    .map(q => {
      const kind = kindOf(q.quoteType, q.symbol);
      return {
        symbol: q.symbol,
        name: q.longname || q.shortname || q.symbol,
        kind,
        market: marketOf(q.symbol, kind),
        exchange: q.exchDisp || q.exchange || ''
      };
    });
}

export async function searchSymbols(query) {
  const q = String(query || '').trim();
  // Yahoo's search takes Latin letters and digits only (Chinese is refused).
  if (!q || /[^\x20-\x7e]/.test(q)) return [];
  return parseSearch(await getJson(`${YAHOO}/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=12&newsCount=0&listsCount=0`));
}

// A company's or fund's numbers from Yahoo's quoteSummary (the Worker adds
// the session Yahoo asks for): for a stock its P/E, EPS, market value,
// dividend yield and what it does; for a fund its fees, size, yield and
// biggest holdings. Missing numbers are null.
const raw = x => (x && typeof x === 'object' ? (Number.isFinite(x.raw) ? x.raw : null) : Number.isFinite(x) ? x : null);
export function parseFundamentals(json) {
  const r = json?.quoteSummary?.result?.[0];
  if (!r) return null;
  const sd = r.summaryDetail || {};
  const ks = r.defaultKeyStatistics || {};
  const fd = r.financialData || {};
  const ap = r.assetProfile || {};
  const fp = r.fundProfile || {};
  const th = r.topHoldings || {};
  const ce = r.calendarEvents || {};
  const er = r.earnings || {};
  const currency = sd.currency || fd.financialCurrency || null;
  const { factor } = normalizeCurrency(currency || 'USD');
  const money = x => (raw(x) == null ? null : raw(x) / factor);
  const out = {
    currency: currency ? normalizeCurrency(currency).currency : null,
    marketCap: money(sd.marketCap),
    pe: raw(sd.trailingPE),
    forwardPe: raw(sd.forwardPE),
    eps: money(ks.trailingEps),
    pb: raw(ks.priceToBook),
    dividendYield: raw(sd.dividendYield) ?? raw(sd.yield) ?? raw(sd.trailingAnnualDividendYield),
    beta: raw(sd.beta) ?? raw(ks.beta3Year),
    margin: raw(fd.profitMargins) ?? raw(ks.profitMargins),
    roe: raw(fd.returnOnEquity),
    growth: raw(fd.revenueGrowth),
    revenue: raw(fd.totalRevenue),
    debtToEquity: raw(fd.debtToEquity),
    sector: ap.sector || null,
    industry: ap.industry || null,
    country: ap.country || null,
    employees: raw(ap.fullTimeEmployees),
    website: /^https?:\/\//.test(ap.website || '') ? ap.website : null,
    summary: ap.longBusinessSummary || null,
    // Funds.
    family: fp.family || ks.fundFamily || null,
    category: fp.categoryName || ks.category || null,
    expenseRatio: raw(fp.feesExpensesInvestment?.annualReportExpenseRatio) ?? raw(ks.annualReportExpenseRatio) ?? raw(ks.netExpenseRatio),
    totalAssets: money(sd.totalAssets) ?? money(ks.totalAssets),
    inception: raw(ks.fundInceptionDate) ? raw(ks.fundInceptionDate) * 1000 : null,
    holdings: (th.holdings || []).map(h => ({ symbol: h.symbol || '', name: h.holdingName || h.symbol || '', weight: raw(h.holdingPercent) })).filter(h => h.weight > 0).slice(0, 10),
    // More of a company: margins, cash and debt, dividends, what analysts
    // expect, dates coming up, the last four years and quarters.
    grossMargin: raw(fd.grossMargins),
    operatingMargin: raw(fd.operatingMargins),
    earningsGrowth: raw(fd.earningsGrowth),
    // Company-wide amounts are in its reporting currency, not in pence.
    cash: raw(fd.totalCash),
    debt: raw(fd.totalDebt),
    freeCashflow: raw(fd.freeCashflow),
    dividendRate: money(sd.dividendRate),
    payoutRatio: raw(sd.payoutRatio),
    // Yahoo gives the 5-year average yield in percent (1.67 = 1.67%).
    avgYield5: raw(sd.fiveYearAvgDividendYield) != null ? raw(sd.fiveYearAvgDividendYield) / 100 : null,
    change52: raw(ks['52WeekChange']),
    sp52: raw(ks.SandP52WeekChange),
    target: raw(fd.targetMeanPrice) != null ? { mean: money(fd.targetMeanPrice), high: money(fd.targetHighPrice), low: money(fd.targetLowPrice), analysts: raw(fd.numberOfAnalystOpinions), rating: fd.recommendationKey || null } : null,
    earningsDate: raw(ce.earnings?.earningsDate?.[0]) ? raw(ce.earnings.earningsDate[0]) * 1000 : null,
    exDividendDate: raw(ce.exDividendDate) ? raw(ce.exDividendDate) * 1000 : raw(sd.exDividendDate) ? raw(sd.exDividendDate) * 1000 : null,
    // The pay date of that dividend (Yahoo has it for the US, mostly not for Taiwan).
    dividendDate: raw(ce.dividendDate) ? raw(ce.dividendDate) * 1000 : null,
    ceo: (ap.companyOfficers || []).find(o => /CEO|Chief Executive/i.test(o.title || ''))?.name?.replace(/\s+/g, ' ').replace(/^(Mr|Ms|Mrs|Dr)\.\s*/, '') || null,
    city: ap.city || null,
    yearly: (er.financialsChart?.yearly || []).map(y => ({ label: String(y.date), revenue: raw(y.revenue), earnings: raw(y.earnings) })).filter(y => y.revenue != null),
    quarterly: (er.financialsChart?.quarterly || []).map(y => ({ label: y.date, revenue: raw(y.revenue), earnings: raw(y.earnings) })).filter(y => y.revenue != null),
    reportCurrency: er.financialCurrency || fd.financialCurrency || null,
    // Funds: past returns and what's inside.
    ytd: raw(ks.ytdReturn),
    return3y: raw(ks.threeYearAverageReturn),
    return5y: raw(ks.fiveYearAverageReturn),
    sectors: (th.sectorWeightings || []).map(x => Object.entries(x)[0]).map(([k, v]) => ({ id: k, weight: raw(v) })).filter(x => x.weight > 0.0005).sort((a, b) => b.weight - a.weight),
    mix: raw(th.stockPosition) != null ? { stock: raw(th.stockPosition), bond: raw(th.bondPosition) || 0, cash: raw(th.cashPosition) || 0, other: raw(th.otherPosition) || 0 } : null
  };
  return out;
}

// A Taiwan fund's facts from its profile (fund-nav.js /hist.json), in the
// names Yahoo's give a fund's: 經理費 as its yearly cost, the returns as
// fractions (3 and 5 years a year's, as Yahoo's), and Taiwan's own: the
// 風險收益等級 (RR1–RR5), 經理人, 保管銀行, 申購手續費 上限, distribution.
export function fundFacts(p) {
  if (!p) return null;
  const f = x => (x == null ? null : x / 100);
  const yearly = (x, n) => (x == null ? null : Math.pow(1 + x / 100, 1 / n) - 1);
  return {
    currency: p.netAssetCurrency ? normalizeCurrency(p.netAssetCurrency).currency : null,
    family: p.company ? p.company.replace(/證券投資信託.*$|投信.*$/, '投信') : null,
    category: p.category || null,
    expenseRatio: f(p.managementFee),
    totalAssets: p.netAsset,
    inception: p.inception,
    ytd: f(p.returns?.ytd),
    return1y: f(p.returns?.['1y']),
    return3y: yearly(p.returns?.['3y'], 3),
    return5y: yearly(p.returns?.['5y'], 5),
    risk: p.risk,
    manager: p.manager,
    custodian: p.custodian,
    frontLoadMax: f(p.frontLoadFee),
    distribution: p.distribution,
    holdings: [],
    sectors: [],
    mix: null
  };
}

export async function fetchFundamentals(symbol) {
  if (isTwFund(symbol)) return fundFacts((await readFundHist(symbol))?.profile);
  const modules = 'assetProfile,summaryDetail,defaultKeyStatistics,financialData,fundProfile,topHoldings,calendarEvents,earnings';
  return parseFundamentals(await getJson(`${YAHOO}/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=${modules}`));
}

