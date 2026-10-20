// 複委託 (foreign stocks through a Taiwan broker) checked against each
// exchange's and broker's own rules (the r8 foreign-markets audit).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as SA from '../kit/stock-account.mjs';
import * as SM from '../kit/stock-markets.mjs';
import { isTradingDay, earlyClose } from '../kit/stock-holidays.mjs';

const DAY = 86_400_000;
const at = (iso, tz = 'America/New_York') => SM.zonedTime(...iso.split(/[-T:]/).map(Number), 0, tz);

test('Korea: 제헌절 shut again from 2026 (07-17), made up on 2027-07-19; 현충일 2027 (a Sunday) not made up', () => {
  assert.equal(isTradingDay('KR', '2026-07-17'), false);
  assert.equal(isTradingDay('KR', '2027-07-19'), false);
  assert.equal(isTradingDay('KR', '2027-06-07'), true);
});

test('half days: NYSE at 13:00 the day after Thanksgiving and on a weekday Christmas Eve or July 3; HKEX mornings only on three eves', () => {
  assert.deepEqual(['2026-11-27', '2026-12-24', '2027-11-26', '2025-07-03', '2028-07-03'].map(d => earlyClose('US', d)), ['13:00', '13:00', '13:00', '13:00', '13:00']);
  // A Friday Christmas Eve or July 3 is a holiday (observed), not a half day.
  assert.deepEqual(['2027-12-24', '2026-07-03', '2026-11-25', '2026-12-23'].map(d => earlyClose('US', d)), [null, null, null, null]);
  assert.deepEqual(['2026-12-24', '2026-12-31', '2027-02-05', '2027-12-24'].map(d => earlyClose('HK', d)), ['12:00', '12:00', '12:00', '12:00']);
  assert.equal(earlyClose('HK', '2026-12-23'), null);
  assert.equal(earlyClose('JP', '2026-12-24'), null);
});

test('a half day: shut from its early close though the session says 16:00, and a day order ends then', () => {
  const day = '2026-11-27';
  const session = { start: at(`${day}T09:30`), end: at(`${day}T16:00`) };
  const q = { symbol: 'AAPL', kind: 'stock', market: 'US', currency: 'USD', price: 250, prev: 249, session, tz: 'America/New_York' };
  assert.equal(SM.isOpen(q, at(`${day}T12:59`)), true);
  assert.equal(SM.isOpen(q, at(`${day}T13:00`)), false);
  assert.equal(SA.dayOrderEnd(q, at(`${day}T10:00`)), at(`${day}T13:00`));
  // Placed after it: the next session (Monday), to its full close.
  assert.equal(SA.dayOrderEnd(q, at(`${day}T14:00`)), at('2026-11-30T16:00'));
  // Hong Kong's Christmas Eve: the morning only.
  const hk = { symbol: '0700.HK', kind: 'stock', market: 'HK', currency: 'HKD', price: 500, prev: 500, tz: 'Asia/Hong_Kong', session: { start: at('2026-12-24T09:30', 'Asia/Hong_Kong'), end: at('2026-12-24T16:00', 'Asia/Hong_Kong') } };
  assert.equal(SM.isOpen(hk, at('2026-12-24T11:00', 'Asia/Hong_Kong')), true);
  assert.equal(SM.isOpen(hk, at('2026-12-24T14:00', 'Asia/Hong_Kong')), false);
  assert.equal(SA.dayOrderEnd(hk, at('2026-12-24T10:00', 'Asia/Hong_Kong')), at('2026-12-24T12:00', 'Asia/Hong_Kong'));
});

test('Stock Connect northbound shuts exactly when Hong Kong or the mainland does (HKEX 2026 trading calendar), not around long holidays', () => {
  const cn = (day, hh = '10:00') => ({ symbol: '600519.SS', kind: 'stock', market: 'CN', currency: 'CNY', price: 1500, prev: 1500, tz: 'Asia/Shanghai', session: { start: at(`${day}T09:30`, 'Asia/Shanghai'), end: at(`${day}T15:00`, 'Asia/Shanghai') } });
  const open = (day, hh = '10:00') => SM.isOpen(cn(day), at(`${day}T${hh}`, 'Asia/Shanghai'));
  // 10-19: Hong Kong's 重陽 holiday; 10-08, the day after the mainland's Golden Week: open; HK's half day 12-24: open all day.
  assert.deepEqual([open('2026-10-19'), open('2026-10-08'), open('2026-12-24', '14:00')], [false, true, true]);
});

// A Tuesday 10:00 in New York, the US open.
const NOW = at('2026-10-13T10:00');
const usSession = { start: at('2026-10-13T09:30'), end: at('2026-10-13T16:00') };
const us = (symbol = 'AAPL', price = 250, more = {}) => ({ symbol, name: symbol, kind: 'stock', market: 'US', currency: 'USD', price, prev: price, got: NOW, marketTime: NOW, session: usSession, tz: 'America/New_York', ...more });
const RATES = { TWD: 1, USD: 32, HKD: 4, JPY: 0.21, CNY: 4.4, KRW: 0.023 };
const OK = { margin: 'ok', netWorth: 5_000_000, assets: 5_000_000, debtTWD: 0, shortTWD: 0, positions: [] };
// An account two years old with a credit account open and cash in each currency.
const rich = () => {
  const acc = SA.newAccount(1_000_000, NOW - 800 * DAY, 'acc');
  const cash = Object.keys(RATES).filter(c => c !== 'TWD').map(c => ({ id: `deposit:${c}`, type: 'deposit', t: NOW - 700 * DAY, currency: c, amount: 1e9 }));
  return { ...acc, events: [...acc.events, ...cash, { id: 'credit:1', type: 'credit', t: NOW - DAY, limit: 1_000_000 }] };
};

test('複委託 is cash only: no 融資 and no short on a foreign stock, credit account or not; Taiwan 融資 and a crypto short as before', () => {
  assert.equal(SM.isSubBrokered('US') && SM.isSubBrokered('JP') && SM.isSubBrokered('INTL'), true);
  assert.equal(SM.isSubBrokered('TW') || SM.isSubBrokered('CRYPTO') || SM.isSubBrokered('FX'), false);
  const acc = rich();
  const place = (req, quote) => SA.placeOrder(acc, req, { quote, rates: RATES, valuation: OK, now: NOW, id: 'o1' });
  assert.equal(place({ side: 'buy', type: 'limit', limit: 250, qty: 10, margin: true }, us()).error, 'cashOnly');
  assert.deepEqual(place({ side: 'sell', type: 'limit', limit: 250, qty: 10 }, us()), { error: 'cashOnly', have: 0 });
  const tw = { symbol: '2330.TW', name: 'TSMC', kind: 'stock', market: 'TW', currency: 'TWD', price: 1000, prev: 1000, got: NOW, marketTime: Date.parse('2026-10-13T02:00:00Z'), tz: 'Asia/Taipei', session: { start: Date.parse('2026-10-13T01:00:00Z'), end: Date.parse('2026-10-13T05:30:00Z') } };
  const r = SA.placeOrder(acc, { side: 'buy', type: 'limit', limit: 1000, qty: 1000, margin: true }, { quote: tw, rates: RATES, valuation: OK, now: Date.parse('2026-10-13T02:00:00Z'), id: 'o2' });
  assert.equal(r.error, undefined);
  assert.equal(r.order.margin, 0.6);
  const btc = { symbol: 'BTC-USD', name: 'Bitcoin', kind: 'crypto', market: 'CRYPTO', currency: 'USD', price: 60_000, prev: 60_000, got: NOW, marketTime: NOW };
  assert.equal(place({ side: 'sell', type: 'market', qty: 0.01 }, btc).error, undefined);
});

test('US at 國泰 to 2026-12-31: a stock 0.08% with no minimum, an ETF US$3 a trade, a plan\'s buy US$0.1; then 0.1% at least US$3', () => {
  const t = Date.parse('2026-11-01T00:00:00Z');
  const cost = (kind, gross, more = {}) => SM.tradeCosts({ market: 'US', side: 'buy', kind, gross, currency: 'USD', t, ...more }).commission;
  assert.deepEqual([cost('stock', 100), cost('stock', 10_000), cost('etf', 100), cost('etf', 10_000), cost('stock', 100, { plan: true })], [0.08, 8, 3, 3, 0.1]);
  // Sales the same; the SEC fee as before.
  assert.equal(SM.tradeCosts({ market: 'US', side: 'sell', kind: 'stock', gross: 10_000, currency: 'USD', t }).commission, 8);
  const later = Date.parse('2027-01-02T00:00:00Z');
  assert.deepEqual([cost('stock', 100, { t: later }), cost('etf', 10_000, { t: later })], [3, 10]);
});

test('plans: listed shares only in Taiwan and the US; a US one from US$10, bought in fractional shares, which sell down to 0.0001', () => {
  assert.equal(SA.planAllowed({ market: 'JP', kind: 'stock' }), false);
  assert.equal(SA.planAllowed({ market: 'US', kind: 'etf' }) && SA.planAllowed({ market: 'TW', kind: 'stock' }) && SA.planAllowed({ market: 'JP', kind: 'fund' }), true);
  const acc = SA.newAccount(1_000_000, NOW - 800 * DAY, 'acc');
  assert.equal(SA.setPlan(acc, { symbol: '7203.T', amount: 10_000, day: 5, market: 'JP', kind: 'stock' }).error, 'planMarket');
  assert.deepEqual(SA.setPlan(acc, { symbol: 'AAPL', amount: 300, day: 5, market: 'US', kind: 'stock', twd: 32 }), { error: 'planAmount', min: 321 });
  assert.equal(SA.planMinTWD('TW'), 100);
  const plan = { id: 'p1', symbol: 'AAPL', amount: 3_000, day: 5, on: true, since: NOW - 40 * DAY, market: 'US', kind: 'stock', currency: 'USD', name: 'Apple' };
  const run = { month: '2026-10', t: NOW };
  const r = SA.runPlan(acc, plan, run, { price: 250, twd: 32 }, NOW);
  assert.ok(r.fill, JSON.stringify(r.order));
  // NT$3,000 at the dollar's spread: about US$93.5 for 0.37 shares (at the ask), US$0.1 the fee.
  assert.ok(r.fill.qty > 0.37 && r.fill.qty < 0.38 && Math.abs(r.fill.qty * 1e4 - Math.round(r.fill.qty * 1e4)) < 1e-6, `${r.fill.qty}`);
  assert.equal(r.fill.commission, 0.1);
  const held = SA.replay(r.account, NOW).positions.AAPL;
  assert.equal(held.qty, r.fill.qty, 'a fraction of a share is a holding');
  const sell = SA.placeOrder(r.account, { side: 'sell', type: 'limit', limit: 250, qty: r.fill.qty }, { quote: us(), rates: RATES, valuation: OK, now: NOW + 1000, id: 's1' });
  assert.equal(sell.error, undefined);
  assert.equal(SA.placeOrder(r.account, { side: 'buy', type: 'limit', limit: 250, qty: 0.5 }, { quote: us(), rates: RATES, valuation: OK, now: NOW + 1000, id: 'b1' }).error, 'qtyStep');
  // US$10 at least a buy; a Japanese stock's plan refused.
  assert.equal(SA.runPlan(acc, { ...plan, amount: 200 }, run, { price: 250, twd: 32 }, NOW).order.reason, 'planMin');
  assert.equal(SA.runPlan(acc, { ...plan, id: 'p2', symbol: '7203.T', market: 'JP', currency: 'JPY' }, run, { price: 3000, twd: 0.21 }, NOW).order.reason, 'planMarket');
});

test('Hong Kong takes limit orders only (HKEX: no market order); the broker\'s own forced sale still goes', () => {
  const t = at('2026-10-13T10:00', 'Asia/Hong_Kong');
  const hk = { symbol: '0700.HK', name: 'Tencent', kind: 'stock', market: 'HK', currency: 'HKD', price: 500, prev: 500, got: t, marketTime: t, tz: 'Asia/Hong_Kong', session: { start: at('2026-10-13T09:30', 'Asia/Hong_Kong'), end: at('2026-10-13T16:00', 'Asia/Hong_Kong') } };
  const place = (req, acc = rich()) => SA.placeOrder(acc, req, { quote: hk, rates: RATES, valuation: OK, now: t, id: 'h1' });
  assert.equal(place({ side: 'buy', type: 'market', qty: 100 }).error, 'limitOnly');
  assert.equal(place({ side: 'buy', type: 'stop', stop: 510, qty: 100 }).error, 'limitOnly');
  const bought = place({ side: 'buy', type: 'limit', limit: 500, qty: 100 });
  assert.equal(bought.error, undefined);
  assert.equal(place({ side: 'sell', type: 'market', qty: 100, forced: true }, bought.account).error, undefined);
  assert.equal(SM.limitOnly('JP'), false, 'Tokyo takes market orders (JPX: 成行)');
});

test('Tokyo ticks (JPX): TOPIX500 on the finer table, other stocks on the ordinary one, ETFs by their trading unit', () => {
  // Toyota (TOPIX500) at ¥2,999.5; a small cap (not in it) only to the yen.
  assert.equal(SM.inTopix500('7203.T'), true);
  assert.equal(SM.inTopix500('1301.T'), false, '極洋: TOPIX Small 1');
  assert.deepEqual([SM.tickSize('JP', 'stock', 2999, '7203.T'), SM.tickSize('JP', 'stock', 1000, '7203.T'), SM.tickSize('JP', 'stock', 2999, '1301.T'), SM.tickSize('JP', 'stock', 4000, '1301.T'), SM.tickSize('JP', 'stock', 20_000, '1301.T')], [0.5, 0.1, 1, 5, 10]);
  // 1306 (traded in 10s): the finer table; 1321 (in 1s): ¥1 up to ¥10,000.
  assert.deepEqual([SM.jpEtfUnit('1306.T'), SM.jpEtfUnit('1321.T'), SM.jpEtfUnit('1319.T')], [10, 1, 1000]);
  assert.deepEqual([SM.tickSize('JP', 'etf', 4131.5, '1306.T'), SM.tickSize('JP', 'etf', 9999, '1321.T'), SM.tickSize('JP', 'etf', 40_000, '1321.T')], [1, 1, 10]);
  // Without a symbol: the finer table, as before.
  assert.equal(SM.tickSize('JP', 'stock', 2999), 0.5);
  const t = at('2026-10-13T10:00', 'Asia/Tokyo');
  const jpq = (symbol, kind, price) => ({ symbol, name: symbol, kind, market: 'JP', currency: 'JPY', price, prev: price, got: t, marketTime: t, tz: 'Asia/Tokyo', session: { start: at('2026-10-13T09:00', 'Asia/Tokyo'), end: at('2026-10-13T15:30', 'Asia/Tokyo') } });
  const place = (q, req) => SA.placeOrder(rich(), req, { quote: q, rates: RATES, valuation: OK, now: t, id: 'j1' });
  assert.deepEqual(place(jpq('1301.T', 'stock', 2999), { side: 'buy', type: 'limit', limit: 2998.5, qty: 100 }), { error: 'tick', tick: 1 });
  assert.equal(place(jpq('7203.T', 'stock', 2999), { side: 'buy', type: 'limit', limit: 2998.5, qty: 100 }).error, undefined);
  // An ETF in its own unit, and inside its daily limit like a stock.
  assert.deepEqual(place(jpq('1306.T', 'etf', 4131), { side: 'buy', type: 'limit', limit: 4131, qty: 5 }), { error: 'lot', lot: 10 });
  assert.equal(place(jpq('1306.T', 'etf', 4131), { side: 'buy', type: 'limit', limit: 4131, qty: 10 }).error, undefined);
  assert.deepEqual(SM.priceLimits(jpq('1306.T', 'etf', 4131), t), { up: 4831, down: 3431 });
  assert.equal(place(jpq('1306.T', 'etf', 4131), { side: 'buy', type: 'limit', limit: 4900, qty: 10 }).error, 'priceLimit');
  // Above ¥1 million the bands go on (JPX: ¥300,000 under ¥1.5 million ... ¥10 million from ¥50 million).
  assert.deepEqual(SM.priceLimits({ ...jpq('9999.T', 'stock', 1_200_000) }, t), { up: 1_500_000, down: 900_000 });
});

test("after the close, an order for the next session is held to the limits from today's close, not yesterday's", () => {
  const kr = (now, more = {}) => ({ symbol: '005930.KS', name: 'Samsung', kind: 'stock', market: 'KR', currency: 'KRW', price: 120_000, prev: 100_000, marketTime: at('2026-10-13T15:30', 'Asia/Seoul'), tz: 'Asia/Seoul', session: { start: at('2026-10-13T09:00', 'Asia/Seoul'), end: at('2026-10-13T15:30', 'Asia/Seoul') }, got: now, ...more });
  const during = at('2026-10-13T14:00', 'Asia/Seoul');
  assert.deepEqual(SM.priceLimits(kr(during, { marketTime: during }), during), { up: 130_000, down: 70_000 });
  const after = at('2026-10-13T18:00', 'Asia/Seoul');
  assert.deepEqual(SM.priceLimits(kr(after), after), { up: 156_000, down: 84_000 });
  // Shanghai at lunch: still today's; Tokyo the next morning before the open: yesterday's close.
  const cn = { symbol: '600519.SS', kind: 'stock', market: 'CN', currency: 'CNY', price: 1650, prev: 1500, marketTime: at('2026-10-13T11:29', 'Asia/Shanghai'), session: { start: at('2026-10-13T09:30', 'Asia/Shanghai'), end: at('2026-10-13T15:00', 'Asia/Shanghai') } };
  assert.equal(SM.limitBase(cn, at('2026-10-13T12:00', 'Asia/Shanghai')), 1500);
  const jp = { symbol: '7203.T', kind: 'stock', market: 'JP', currency: 'JPY', price: 3000, prev: 2800, marketTime: at('2026-10-13T15:30', 'Asia/Tokyo'), session: { start: at('2026-10-14T09:00', 'Asia/Tokyo'), end: at('2026-10-14T15:30', 'Asia/Tokyo') } };
  assert.deepEqual(SM.priceLimits(jp, at('2026-10-14T08:30', 'Asia/Tokyo')), { up: 3700, down: 2300 });
});

test('Stock Connect: STAR and ChiNext shares only sold, never bought (institutions only); fees both ways, stamp duty on sales', () => {
  assert.deepEqual(['688981.SS', '689009.SS', '300750.SZ', '301269.SZ', '600519.SS', '000333.SZ'].map(SM.cnBoard), ['star', 'star', 'chinext', 'chinext', 'main', 'main']);
  const t = at('2026-10-13T10:00', 'Asia/Shanghai');
  const cn = symbol => ({ symbol, name: symbol, kind: 'stock', market: 'CN', currency: 'CNY', price: 100, prev: 100, got: t, marketTime: t, tz: 'Asia/Shanghai', session: { start: at('2026-10-13T09:30', 'Asia/Shanghai'), end: at('2026-10-13T15:00', 'Asia/Shanghai') } });
  const place = (symbol, req, acc = rich()) => SA.placeOrder(acc, req, { quote: cn(symbol), rates: RATES, valuation: OK, now: t, id: 'c1' });
  assert.deepEqual(place('300750.SZ', { side: 'buy', type: 'limit', limit: 100, qty: 100 }), { error: 'northboundBoard', board: 'chinext' });
  assert.equal(place('688981.SS', { side: 'buy', type: 'limit', limit: 100, qty: 100 }).error, 'northboundBoard');
  assert.equal(place('000333.SZ', { side: 'buy', type: 'limit', limit: 100, qty: 100 }).error, undefined);
  // Held from before: it sells (the next day, T+1).
  const held = { ...rich(), events: [...rich().events, { id: 'fill:old', type: 'fill', t: t - 3 * DAY, orderId: 'old', symbol: '300750.SZ', name: 'CATL', kind: 'stock', market: 'CN', currency: 'CNY', side: 'buy', qty: 100, price: 100, gross: 10_000, commission: 50, tax: 0, fee: 0, total: 10_050, twd: 4.4 }] };
  assert.equal(place('300750.SZ', { side: 'sell', type: 'limit', limit: 100, qty: 100 }, held).error, undefined);
  const cost = (side, kind) => SM.tradeCosts({ market: 'CN', side, kind, gross: 1_000_000, currency: 'CNY' });
  assert.deepEqual([cost('buy', 'stock').fee, cost('sell', 'stock').fee, cost('sell', 'stock').tax, cost('buy', 'etf').fee, cost('sell', 'etf').tax], [64.1, 64.1, 500, 40, 0]);
});

test('US pre- and post-market (富邦, 國泰): 04:00-09:30 and to 18:00 New York time, day limit orders only, filled on those sessions\' bars', async () => {
  assert.deepEqual(['04:00', '09:29', '09:30', '15:59', '16:00', '17:59', '18:00', '03:59'].map(h => SM.usSession(at(`2026-10-13T${h}`))), ['pre', 'pre', 'regular', 'regular', 'post', 'post', null, null]);
  assert.equal(SM.usSession(at('2026-11-27T13:30')), 'post', "a half day's post-market from its 13:00 close");
  assert.equal(SM.usSession(at('2026-11-26T10:00')), null, 'Thanksgiving');
  const pre = at('2026-10-13T07:00');
  const q = us('AAPL', 250, { got: pre, marketTime: at('2026-10-12T16:00'), session: usSession });
  const place = req => SA.placeOrder(rich(), req, { quote: q, rates: RATES, valuation: OK, now: pre, id: 'ext00001' });
  assert.equal(place({ side: 'buy', type: 'market', qty: 1, ext: true }).error, 'extLimit');
  assert.equal(place({ side: 'buy', type: 'limit', limit: 251, qty: 1, ext: true, tif: 'gtc' }).error, 'extLimit');
  const r = place({ side: 'buy', type: 'limit', limit: 251, qty: 1, ext: true });
  assert.equal(r.error, undefined);
  assert.equal(r.fill, null, "no fill on the regular session's stale price");
  assert.equal(r.order.expires, at('2026-10-13T18:00'));
  // Bars: a pre-market one at 250.5 fills it; an ordinary order skips that bar for the open's.
  const bars = [{ t: at('2026-10-13T08:00'), o: 250.5, h: 250.6, l: 250.4, c: 250.5 }, { t: at('2026-10-13T09:30'), o: 252, h: 252, l: 251.5, c: 252 }];
  assert.deepEqual(SA.backfillPrice(r.order, bars, at('2026-10-13T10:00')), { t: bars[0].t, price: 250.5 });
  assert.deepEqual(SA.backfillPrice({ ...r.order, ext: undefined, type: 'market' }, bars, at('2026-10-13T10:00')), { t: bars[1].t, price: 252 });
  // The proxy keeps the flag and reads the extended bars for it.
  const { cleanOrder, decideFills } = await import('../stock-fill.js');
  const o = cleanOrder({ ...r.order, lk: undefined });
  assert.equal(o.ext, true);
  const urls = [];
  const read = async url => {
    urls.push(url);
    if (url.includes('/v8/finance/chart/')) return { chart: { result: [{ meta: { symbol: 'AAPL', regularMarketPrice: 250, currency: 'USD', exchangeTimezoneName: 'America/New_York' }, timestamp: bars.map(b => b.t / 1000), indicators: { quote: [{ open: bars.map(b => b.o), high: bars.map(b => b.h), low: bars.map(b => b.l), close: bars.map(b => b.c) }] } }] } };
    return { spark: { result: [] } };
  };
  const { fills } = await decideFills([{ ...o, t: pre, lk: pre }], { read, now: at('2026-10-13T09:00') });
  assert.ok(urls.some(u => u.includes('includePrePost=true')));
  assert.equal(fills[o.id].quote, 250.5);
});

test('US circuit breakers: the S&P 500 down 7% halts every US stock 15 minutes (not from 15:25), down 20% the rest of the day', async () => {
  const spx = (points, price) => ({ symbol: '^GSPC', prev: 6000, price, marketTime: points.at(-1)[0], line: points });
  // Down 7.5% at 11:00: halted to 11:15, then trading again though still down.
  const p1 = [[at('2026-10-13T10:00'), 5800], [at('2026-10-13T11:00'), 5550]];
  assert.deepEqual(SM.marketHalt(spx(p1, 5550), at('2026-10-13T11:05')), { level: 1, until: at('2026-10-13T11:15') });
  assert.equal(SM.marketHalt(spx(p1, 5550), at('2026-10-13T11:20')), null);
  // Reached at 15:30: no halt. Down 20%: shut to the close.
  assert.equal(SM.marketHalt(spx([[at('2026-10-13T15:30'), 5550]], 5550), at('2026-10-13T15:31')), null);
  assert.deepEqual(SM.marketHalt(spx([[at('2026-10-13T12:00'), 4790]], 4790), at('2026-10-13T14:00')), { level: 3, until: at('2026-10-13T16:00') });
  // A halted market fills nothing, on the phone or the proxy.
  const halt = SM.marketHalt(spx(p1, 5550), at('2026-10-13T11:05'));
  const q = us('AAPL', 250, { marketTime: at('2026-10-13T11:04'), got: at('2026-10-13T11:05') });
  const r = SA.placeOrder(rich(), { side: 'buy', type: 'market', qty: 1 }, { quote: q, rates: RATES, valuation: OK, now: at('2026-10-13T11:05'), id: 'h1', halt });
  assert.equal(r.fill, null);
  assert.ok(SA.processOrders(r.account, new Map([['AAPL', q]]), RATES, at('2026-10-13T11:20')).filled.length === 1, 'filled once it reopens');
});
