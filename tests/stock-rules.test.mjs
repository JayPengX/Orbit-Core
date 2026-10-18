// Taiwan broker rules checked against TWSE's own: 融資 and 融券 amounts,
// lots, odd lots, recalls, 融券 interest and what an order holds.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as SA from '../kit/stock-account.mjs';

const DAY = 86_400_000;
// Tuesday 2026-10-13, 10:00 in Taipei: Taiwan open.
const now = Date.parse('2026-10-13T02:00:00Z');
const session = { start: Date.parse('2026-10-13T01:00:00Z'), end: Date.parse('2026-10-13T05:30:00Z') };
const tw = (price, more = {}) => ({ symbol: '2330.TW', name: 'TSMC', kind: 'stock', market: 'TW', currency: 'TWD', price, prev: price, got: now, marketTime: now, session, tz: 'Asia/Taipei', ...more });
const rates = { TWD: 1 };
const ok = { margin: 'ok', netWorth: 1_000_000, assets: 1_000_000, debtTWD: 0, shortTWD: 0, positions: [] };
// An account with a credit account open.
const credit = (cash = 1_000_000) => {
  const acc = SA.newAccount(cash, now - 400 * DAY, 'acc');
  return { ...acc, events: [...acc.events, { id: 'credit:1', type: 'credit', t: now - DAY, limit: 1_000_000 }] };
};

test('融資 lends 成交價金 × 成數, the part under NT$1,000 not lent (操作辦法 §50)', () => {
  const r = SA.placeOrder(credit(), { side: 'buy', type: 'limit', limit: 101.5, qty: 1000, margin: true }, { quote: tw(101.5), rates, valuation: ok, now, id: 'm1' });
  assert.equal(r.error, undefined);
  // 101,500 × 60% = 60,900: NT$60,000 lent; commission on the account's own part.
  assert.equal(r.fill.financed, 60_000);
  assert.equal(r.fill.total, 101_500 + Math.floor(101_500 * 0.001425));
  assert.equal(SA.marginLoan('TW', 'TWD', 1_999, 2_100, 0.6), 1_000);
  assert.equal(SA.marginLoan('TW', 'TWD', 1_500, 1_600, 0.6), 0, 'under NT$1,000: nothing lent');
  assert.equal(SA.marginLoan('US', 'USD', 1_000, 1_003, 0.5), 501.5, 'elsewhere: the rate of all it costs');
});

test('融券 puts up 90% of the sale, the part under NT$100 counted as NT$100 (操作辦法 §49)', async () => {
  const { shortDeposit } = await import('../kit/stock-credit.mjs');
  assert.deepEqual([shortDeposit(100_500), shortDeposit(100_000), shortDeposit(1)], [90_500, 90_000, 100]);
  const r = SA.placeOrder(credit(), { side: 'sell', type: 'limit', limit: 100.5, qty: 1000 }, { quote: tw(100.5), rates, valuation: ok, now, id: 's1' });
  assert.equal(r.error, undefined);
  assert.equal(r.order.deposit, 90_500, '100,500 × 90% = 90,450: NT$90,500');
  assert.equal(SA.replay(r.account, now).positions['2330.TW'].shortDeposit, 90_500);
});

test('Taiwan: whole lots and odd lots are separate orders; 1,500 shares is two', async () => {
  const { mixedLot } = await import('../kit/stock-markets.mjs');
  assert.deepEqual(mixedLot('TW', 'stock', 1500), { lots: 1000, odd: 500 });
  assert.deepEqual([mixedLot('TW', 'stock', 999), mixedLot('TW', 'etf', 3000), mixedLot('US', 'stock', 1500), mixedLot('TW', 'fund', 1500)], [null, null, null, null]);
  const acc = SA.newAccount(1_000_000, now - DAY, 'acc');
  const buy = qty => SA.placeOrder(acc, { side: 'buy', type: 'limit', limit: 100, qty }, { quote: tw(100), rates, valuation: ok, now, id: `b${qty}` });
  assert.deepEqual(buy(1500), { error: 'mixedLot', lots: 1000, odd: 500 });
  assert.equal(buy(1000).error, undefined);
  assert.equal(buy(500).error, undefined);
  // Selling 1,500 held: also two orders.
  const held = buy(1000).account;
  const more = SA.placeOrder(held, { side: 'buy', type: 'limit', limit: 100, qty: 500 }, { quote: tw(100), rates, valuation: ok, now, id: 'b2' }).account;
  assert.equal(SA.placeOrder(more, { side: 'sell', type: 'limit', limit: 100, qty: 1500 }, { quote: tw(100), rates, valuation: ok, now, id: 's' }).error, 'mixedLot');
  // The broker's own sale (forced, or to cover an overdraft) splits itself.
  assert.equal(SA.placeOrder(more, { side: 'sell', type: 'market', qty: 1500, forced: true }, { quote: tw(100), rates, valuation: ok, now, id: 'f' }).error, undefined);
});

test('a recall returns the shares in 3 Taiwan business days, holidays skipped', async () => {
  const { addWeekdays } = await import('../kit/stock-savings.mjs');
  const day = t => SA.taipeiDay(t);
  // Friday 2026-10-23: Monday 10-26 is a TWSE holiday (光復節 observed).
  assert.equal(day(addWeekdays(Date.parse('2026-10-23T04:00:00Z'), 3)), '2026-10-29');
  // Over Lunar New Year 2027 (02-03 to 02-10 shut).
  assert.equal(day(addWeekdays(Date.parse('2027-02-02T04:00:00Z'), 1)), '2027-02-11');
  const acc = SA.newAccount(1_000_000, now - 30 * DAY, 'acc');
  const lent = { ...acc, events: [...acc.events, { id: 'lend:l1', type: 'lend', t: now - 10 * DAY, symbol: '2330.TW', name: 'TSMC', market: 'TW', kind: 'stock', currency: 'TWD', qty: 1000, price: 100, rate: 0.012 }] };
  const at = Date.parse('2026-10-23T04:00:00Z');
  assert.equal(day(SA.recallShares(lent, 'lend:l1', at).back), '2026-10-29');
});

test('融券 earns interest on its deposit and the sale money held (§51, 0.20% a year), paid when bought back', async () => {
  const { SHORT_INTEREST } = await import('../kit/stock-credit.mjs');
  const r = SA.placeOrder(credit(), { side: 'sell', type: 'limit', limit: 100, qty: 1000 }, { quote: tw(100), rates, valuation: ok, now, id: 's1' });
  const held = r.fill.total;
  const later = now + 100 * DAY;
  const s0 = SA.replay(r.account, later);
  const owed = ((90_000 + held) * SHORT_INTEREST * 100) / 365;
  assert.ok(Math.abs(s0.positions['2330.TW'].shortInterest - owed) < 1e-6, 'accrued day by day');
  const buy = { id: 'b1', type: 'fill', t: later, orderId: 'b1', symbol: '2330.TW', name: 'TSMC', kind: 'stock', market: 'TW', currency: 'TWD', side: 'buy', qty: 1000, price: 100, gross: 100_000, total: 100_142, commission: 142, tax: 0, fee: 0, twd: 1 };
  const s1 = SA.replay({ ...r.account, events: [...r.account.events, buy] }, later);
  assert.equal(s1.cash.TWD - s0.cash.TWD, 90_000 + held - 100_142 + Math.floor(owed), 'deposit, sale money and interest back, less the buyback');
  assert.equal(s1.positions['2330.TW'], undefined);
});

test('a Taiwan market or stop order holds, and counts against 當沖額度, at the limit-up (漲停價), as brokers count it', () => {
  const acc = SA.newAccount(1_000_000, now - DAY, 'acc');
  // Open: the day's limit-up from yesterday's close (95 × 1.1 = 104.5).
  const open = SA.placeOrder(acc, { side: 'buy', type: 'stop', stop: 102, qty: 1000 }, { quote: tw(100, { prev: 95 }), rates, valuation: ok, now, id: 'b1' });
  assert.equal(open.order.reserve, 104_500 + Math.floor(104_500 * 0.001425));
  assert.equal(SA.limitUpFor({ type: 'market' }, tw(100, { prev: 95 }), now), 104.5);
  // Shut: the next session's, from the last price (100 × 1.1).
  const night = Date.parse('2026-10-13T14:00:00Z');
  assert.equal(SA.requiredCash({ type: 'market', side: 'buy', qty: 1000, t: night }, tw(100, { prev: 95 }), night).reserve, 110_000 + Math.floor(110_000 * 0.001425), 'no 3% on top: the limit-up is the most');
  // A limit order holds its limit; elsewhere, nothing changes.
  assert.equal(SA.limitUpFor({ type: 'limit', limit: 99 }, tw(100, { prev: 95 }), now), null);
  assert.equal(SA.limitUpFor({ type: 'market' }, { ...tw(100), market: 'US' }, now), null);
  // A market order filled at once still pays only its price; the rest comes back.
  const m = SA.placeOrder(acc, { side: 'buy', type: 'market', qty: 1000 }, { quote: tw(100, { prev: 95 }), rates, valuation: ok, now, id: 'b2' });
  assert.equal(m.fill.price, 100.25);
  assert.equal(SA.available(m.account, SA.replay(m.account, now)).cash.TWD, 1_000_000 - m.fill.total);
  // 先賣後買: a market or stop sale counts at the limit-up too.
  const trades = Array.from({ length: 10 }, (_, i) => ({ id: `t${i}`, type: 'fill', t: now - (i + 1) * 5 * DAY, orderId: `t${i}`, symbol: '2317.TW', name: 'X', kind: 'stock', market: 'TW', currency: 'TWD', side: 'buy', qty: 1, price: 100, gross: 100, total: 100, commission: 0, tax: 0, fee: 0, twd: 1 }));
  const trader = { ...SA.newAccount(300_000, now - 200 * DAY, 'acc'), events: [{ id: 'd', type: 'deposit', t: now - 200 * DAY, currency: 'TWD', amount: 300_000 }, ...trades] };
  const v = { ...ok, netWorth: 300_000 };
  const sell = (req, id) => SA.placeOrder(trader, { side: 'sell', qty: 1000, ...req }, { quote: tw(520), rates, valuation: v, now, id });
  assert.equal(sell({ type: 'limit', limit: 520 }, 'l').order.dayTradeTWD, 520_000);
  assert.equal(sell({ type: 'market' }, 'm').order.dayTradeTWD, 572_000);
  assert.equal(sell({ type: 'stop', stop: 500 }, 's').order.dayTradeTWD, 572_000);
  assert.equal(SA.placeOrder(trader, { side: 'sell', qty: 1000, type: 'market' }, { quote: tw(560), rates, valuation: v, now, id: 'x' }).error, 'dayTradeLimit', '616,000 of 600,000');
});

test('Taiwan odd lots take limit orders only (盤中 and 盤後零股: 以限價為之)', () => {
  const acc = SA.newAccount(1_000_000, now - DAY, 'acc');
  const buy = (req, at = now) => SA.placeOrder(acc, { side: 'buy', qty: 500, ...req }, { quote: tw(100), rates, valuation: ok, now: at, id: 'o' });
  assert.equal(buy({ type: 'market' }).error, 'oddLotLimit');
  assert.equal(buy({ type: 'stop', stop: 101 }).error, 'oddLotLimit');
  assert.equal(buy({ type: 'market' }, Date.parse('2026-10-13T06:00:00Z')).error, 'oddLotLimit', '盤後零股 too');
  assert.equal(buy({ type: 'limit', limit: 100 }).error, undefined);
  assert.equal(SA.placeOrder(acc, { side: 'buy', qty: 1000, type: 'market' }, { quote: tw(100), rates, valuation: ok, now, id: 'w' }).error, undefined, 'whole lots: market is fine');
  assert.equal(SA.placeOrder(acc, { side: 'buy', qty: 5, type: 'market' }, { quote: { ...tw(100), market: 'US', symbol: 'AAPL', currency: 'USD' }, rates: { TWD: 1, USD: 32 }, valuation: ok, now, id: 'u' }).error !== 'oddLotLimit', true);
});

// TWSE 交易制度: 13:25-13:30 the closing call auction (limit orders only, one
// match at 13:30 at the close); 盤後零股 orders 13:40-14:30, 盤後定價
// 14:00-14:30, each matched once at 14:30.
const taipei = hm => Date.parse(`2026-10-13T${hm}:00+08:00`);
test("Taiwan's closing call auction: from 13:25 whole lots wait for one match at 13:30, at the close; market orders refused", () => {
  const acc = SA.newAccount(1_000_000, now - DAY, 'acc');
  const at = taipei('13:27');
  // (Yahoo's Taiwan prices run 20 minutes behind: at 13:27 it shows 13:07's.)
  const late = tw(99, { marketTime: taipei('13:07') });
  const place = (req, q = late, t = at, id = 'o') => SA.placeOrder(acc, { side: 'buy', qty: 1000, ...req }, { quote: q, rates, valuation: ok, now: t, id });
  assert.deepEqual(place({ type: 'market' }), { error: 'closingAuction', match: taipei('13:30') });
  assert.equal(place({ type: 'market' }, late, taipei('13:24')).fill?.price > 0, true, 'before 13:25: continuous');
  // A limit order placed during it never fills on a price before 13:30.
  const r = place({ type: 'limit', limit: 100 });
  assert.equal(r.fill, null);
  assert.equal(r.order.expires, taipei('14:30'), 'a day order lasts until its closing match is known');
  // The match is in (the close, 98.5): it fills at the close, dated then.
  const close = tw(98.5, { marketTime: taipei('13:30') });
  assert.equal(SA.processOrders(r.account, new Map([['2330.TW', close]]), rates, taipei('13:29')).filled.length, 0, 'still collecting');
  const done = SA.processOrders(r.account, new Map([['2330.TW', close]]), rates, taipei('13:50'));
  assert.equal(done.filled[0].price, 98.5);
  // Over its limit: no match, and it ends unmatched at 14:30.
  const high = tw(101, { marketTime: taipei('13:30') });
  assert.equal(SA.processOrders(r.account, new Map([['2330.TW', high]]), rates, taipei('13:50')).filled.length, 0);
  assert.equal(SA.expireOrders(r.account, taipei('14:30')).expired.length, 1);
  // An order from before 13:25 still fills on a continuous price shown late.
  const early = place({ type: 'limit', limit: 98 }, tw(99), taipei('10:00'), 'e');
  assert.equal(SA.processOrders(early.account, new Map([['2330.TW', tw(97.5, { marketTime: taipei('13:06') })]]), rates, at).filled[0].price, 97.5);
  // Odd lots (盤中零股, its own auctions to 13:30) aren't in it.
  assert.equal(SA.closingMatch({ ...r.order, qty: 500 }, close, taipei('13:50')), null);
});

test("the closing call auction in price bars: a bar from 13:25 is the close, matched at 13:30", () => {
  const order = { id: 'o', market: 'TW', kind: 'stock', symbol: '2330.TW', side: 'buy', type: 'limit', limit: 100, qty: 1000, t: taipei('10:00'), expires: taipei('14:30') };
  const bars = [
    { t: taipei('13:20'), o: 101, h: 101.5, l: 100.5, c: 101 },
    { t: taipei('13:25'), o: 99.5, h: 99.5, l: 99.5, c: 99.5 }
  ];
  assert.deepEqual(SA.backfillPrice(order, bars, taipei('13:50')), { t: taipei('13:30'), price: 99.5 });
  assert.equal(SA.backfillPrice({ ...order, limit: 99 }, bars, taipei('13:50')), null, 'under the close: no match');
  assert.equal(SA.backfillPrice(order, bars, taipei('13:29')), null, 'not matched yet');
  assert.equal(SA.backfillPrice({ ...order, t: taipei('13:31') }, bars, taipei('13:50')), null, 'placed after the close');
  // Placed during the auction: in the match too.
  assert.deepEqual(SA.backfillPrice({ ...order, t: taipei('13:27') }, bars, taipei('13:50')), { t: taipei('13:30'), price: 99.5 });
  // A sell above the close isn't met there (it would have been on the 13:25 bar's high before).
  assert.equal(SA.backfillPrice({ ...order, side: 'sell', limit: 99.6 }, bars.slice(1), taipei('13:50')), null);
});

test("Taiwan's after-hours sessions take orders from 13:40 (盤後零股) and 14:00 (盤後定價), both matched at 14:30", () => {
  const acc = SA.newAccount(1_000_000, now - DAY, 'acc');
  const place = (qty, t) => SA.placeOrder(acc, { side: 'buy', type: 'limit', limit: 100, qty }, { quote: tw(100), rates, valuation: ok, now: t, id: `o${qty}${t}` });
  assert.deepEqual(place(1000, taipei('13:35')), { error: 'afterHoursWait', from: taipei('14:00') });
  assert.deepEqual(place(500, taipei('13:35')), { error: 'afterHoursWait', from: taipei('13:40') });
  assert.equal(place(500, taipei('13:45')).order.after, taipei('14:30'));
  assert.equal(place(1000, taipei('13:45')).error, 'afterHoursWait');
  assert.equal(place(1000, taipei('14:05')).order.after, taipei('14:30'));
  // After 14:30: an order for the next session, as before.
  assert.equal(place(1000, taipei('14:35')).order.after, undefined);
});

test('追繳 is cancelled once the 差額 notified is paid in full, bit by bit, even under 166% (§55(3)); a sale\'s repayment isn\'t a payment', () => {
  const call = { since: now, due: now + 2 * DAY, need: 10_000 };
  const v = { owed: 100_000, assets: 125_000, ratio: 1.25 };
  const ev = (id, t, amount, currency = 'TWD') => ({ id, type: 'repay', t, currency, amount });
  const acc = { events: [
    ev('repay:before', now - DAY, 50_000),
    ev('repay:pd1', now + 1000, 4_000),
    { id: 'fill:s1', type: 'fill', side: 'sell', orderId: 's1', t: now + 2000 },
    ev('repay:s1', now + 2000, 30_000),
    ev('repay:pd2', now + 3000, 100, 'USD')
  ] };
  assert.equal(SA.callPaid(acc, call, { USD: 32 }), 4_000 + 3_200);
  assert.equal(SA.callPaid(acc, call), 4_000, 'no rate: the US$ payment left out');
  assert.deepEqual(SA.callState(call, v, now + DAY, 7_200), { call, sell: false, event: null });
  assert.deepEqual(SA.callState(call, v, now + DAY, 10_000), { call: null, sell: false, event: 'met', paid: true });
  assert.equal(SA.callState(call, v, now + 3 * DAY).sell, true, 'not paid: sold at the deadline as before');
  assert.equal(SA.callState({ ...call, need: 0 }, v, now + DAY, 0).call !== null, true, 'nothing to pay (shorts): only 166% cancels it');
});

test('證券交易稅條例: the day-trade rate to 2027-12-31 (§2-2), bond ETFs untaxed to 2026-12-31 (§2-1), then 0.1%', async () => {
  const { tradeCosts, DAY_TRADE_TAX_UNTIL, BOND_ETF_TAX_FREE_UNTIL } = await import('../kit/stock-markets.mjs');
  const sell = o => tradeCosts({ currency: 'TWD', market: 'TW', kind: 'stock', side: 'sell', gross: 100_000, ...o });
  assert.equal(sell({ dayTrade: true, t: DAY_TRADE_TAX_UNTIL - 1 }).tax, 150);
  assert.equal(sell({ dayTrade: true, t: DAY_TRADE_TAX_UNTIL }).tax, 300, '2028: the full 0.3%');
  assert.equal(sell({ kind: 'bond', t: BOND_ETF_TAX_FREE_UNTIL - 1 }).tax, 0);
  assert.equal(sell({ kind: 'bond', t: BOND_ETF_TAX_FREE_UNTIL }).tax, 100, '2027: 0.1%');
  // Only the matched part at the day rate: half of it 0.15%, half 0.3%.
  assert.equal(sell({ dayTrade: 0.5, t: now }).tax, 225);
  assert.equal(sell({ dayTrade: 0, t: now }).tax, 300);
});

test('當沖 tax on the matched quantity only; odd lots and 融資 buys never match (§2-2, TWSE 當沖辦法)', () => {
  const fill = (id, side, qty, t, more = {}) => ({ id, type: 'fill', t, orderId: id, symbol: '2330.TW', name: 'TSMC', kind: 'stock', market: 'TW', currency: 'TWD', side, qty, price: 100, gross: qty * 100, total: qty * 100, commission: 0, tax: 0, fee: 0, twd: 1, ...more });
  const acc = (...events) => ({ ...SA.newAccount(1_000_000, now - 400 * DAY, 'acc'), events });
  const sale = qty => ({ id: 's', market: 'TW', kind: 'stock', symbol: '2330.TW', side: 'sell', qty });
  const old = fill('h', 'buy', 5000, now - 10 * DAY);
  assert.equal(SA.dayTradeShare(acc(old, fill('b', 'buy', 1000, now - 60_000)), sale(3000), now), 1 / 3, 'a lot bought today, three sold');
  assert.equal(SA.dayTradeShare(acc(old, fill('b', 'buy', 2000, now - 60_000), fill('s0', 'sell', 1000, now - 30_000)), sale(2000), now), 0.5, "an earlier sale took one of today's two lots");
  assert.equal(SA.dayTradeShare(acc(old, fill('b', 'buy', 500, now - 60_000)), sale(1000), now), 0, 'an odd lot bought');
  assert.equal(SA.dayTradeShare(acc(old, fill('b', 'buy', 1000, now - 60_000)), sale(500), now), 0, 'an odd lot sold');
  assert.equal(SA.dayTradeShare(acc(old, fill('b', 'buy', 1000, now - 60_000, { financed: 60_000 })), sale(1000), now), 0, '融資, not 現款');
  assert.equal(SA.dayTradeShare(acc(old, fill('b', 'buy', 1000, now - DAY)), sale(1000), now), 0, "yesterday's");
});
