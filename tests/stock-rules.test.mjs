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
  assert.equal(m.fill.price, 100.5);
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

test('定期定額: NT$100 on any day 1-31 (a short month its last day), NT$1 a buy to 2026-12-31, then 0.1425% (NT$1 least)', async () => {
  const { tradeCosts, PLAN_FLAT_FEE_UNTIL } = await import('../kit/stock-markets.mjs');
  const acc = SA.newAccount(100_000, now - DAY, 'acc');
  const plan = req => SA.setPlan(acc, { symbol: '2330.TW', amount: 100, day: 31, ...req }, now);
  assert.equal(plan({}).plan.day, 31);
  assert.equal(plan({ amount: 99 }).error, 'planAmount');
  assert.equal(plan({ day: 32 }).error, 'planDay');
  assert.equal(new Date(SA.planDue('2027-02', 31) + 8 * 3_600_000).toISOString().slice(0, 10), '2027-02-28');
  assert.equal(new Date(SA.planDue('2026-10', 31) + 8 * 3_600_000).toISOString().slice(0, 10), '2026-10-31');
  const buy = o => tradeCosts({ currency: 'TWD', market: 'TW', kind: 'stock', side: 'buy', plan: true, ...o });
  assert.equal(buy({ gross: 1_000_000, t: now }).commission, 1, 'flat, whatever the size');
  assert.equal(buy({ gross: 100_000, t: PLAN_FLAT_FEE_UNTIL }).commission, 142);
  assert.equal(buy({ gross: 300, t: PLAN_FLAT_FEE_UNTIL }).commission, 1);
  assert.equal(buy({ gross: 100_000, t: now, market: 'US', currency: 'USD' }).commission, 0.1, "the US's own plan fee (國泰: US$0.1 a buy)");
  assert.equal(buy({ gross: 2_000_000, t: now, market: 'JP', currency: 'JPY' }).commission, 5000, 'elsewhere, the usual rate');
});

test("定期定額 in Taiwan: a limit order in the odd-lot session from its first match (09:10; 09:00 from 2026-12-07), the whole lots split off", async () => {
  const { oddLotOpen } = await import('../kit/stock-markets.mjs');
  const meta = { market: 'TW', kind: 'etf' };
  const due = Date.parse('2026-10-13T00:00:00+08:00');
  const bar = (hhmm, o) => ({ t: Date.parse(`2026-10-13T${hhmm}:00+08:00`), o, h: o, l: o, c: o });
  const bars = [bar('09:00', 50), bar('09:05', 51), bar('09:10', 52), bar('09:15', 53)];
  assert.equal(SA.planFillBar(meta, bars, due).o, 52);
  assert.equal(SA.planFillBar({ market: 'US', kind: 'etf' }, bars, due).o, 50, 'elsewhere, the first price');
  assert.equal(SA.planOrderType(meta), 'limit');
  assert.equal(SA.planOrderType({ market: 'US', kind: 'stock' }), 'market');
  assert.equal(oddLotOpen(Date.parse('2026-12-04T09:05:00+08:00')), false);
  assert.equal(oddLotOpen(Date.parse('2026-12-07T09:00:00+08:00')), true, 'from 2026-12-07 with the whole lots');
  // NT$80,000 at 50: 1,599 shares (a lot and 599), NT$1 each (two trades), at the price itself.
  const acc = SA.newAccount(100_000, now - DAY, 'acc');
  const p = { id: 'p1', symbol: '0050.TW', name: '0050', kind: 'etf', market: 'TW', currency: 'TWD', amount: 80_000, day: 13, on: true, since: now - 30 * DAY };
  const r = SA.runPlan(acc, p, { month: '2026-10', t: due }, { price: 50, twd: 1, at: bar('09:10', 50).t }, now);
  assert.equal(r.order.type, 'limit');
  assert.deepEqual([r.fill.qty, r.fill.price, r.fill.commission, r.fill.total], [1_599, 50, 2, 79_952]);
  // Any mixed amount is two trades.
  const est = SA.estimate({ market: 'TW', kind: 'stock', currency: 'TWD', side: 'buy', qty: 1_010, price: 10, t: now });
  assert.equal(est.commission, 20 + 1, "a lot (NT$14, the NT$20 least) and 10 odd shares (NT$1 least), each its own trade's minimum");
});

test('定期定額: three months running without the cash end the plan (連續三次扣款失敗)', () => {
  let acc = SA.newAccount(0, now - 400 * DAY, 'acc');
  const set = SA.setPlan(acc, { id: 'p1', symbol: '0050.TW', amount: 1_000, day: 5, kind: 'etf', market: 'TW', currency: 'TWD', name: '0050' }, now - 120 * DAY);
  acc = set.account;
  const p = set.plan;
  const run = (month, a) => SA.runPlan(a, p, { month, t: SA.planDue(month, 5) }, { price: 50, twd: 1 }, now);
  let r = run('2026-07', acc);
  r = run('2026-08', r.account);
  assert.equal(r.account.plans.p1.on, true, 'two: still on');
  r = run('2026-09', r.account);
  assert.equal(r.ended, true);
  assert.deepEqual([r.account.plans.p1.on, r.account.plans.p1.ended], [false, 'funds']);
});

test('借券: the fee day by day at each close (算頭不算尾, /365), an ask from 0.01% to 16% lent only at or under the going rate, six months renewed twice', async () => {
  const { lendFee, lendEnds, LEND_RATE } = await import('../kit/stock-savings.mjs');
  const d0 = Date.parse('2026-10-12T10:00:00+08:00');
  const close = (dd, c) => ({ t: Date.parse(`2026-10-${dd}T13:30:00+08:00`), c });
  const lend = { qty: 1000, price: 100, rate: 0.012, t: d0 };
  // 12th 100, 13th 110, 14th none (the 13th's), 15th 90; back on the 16th: four days.
  const closes = [close(12, 100), close(13, 110), close(15, 90), close(16, 200)];
  assert.equal(lendFee(lend, Date.parse('2026-10-16T09:00:00+08:00'), closes).gross, Math.round((410 * 1000 * 0.012) / 365));
  assert.equal(lendFee(lend, Date.parse('2026-10-16T09:00:00+08:00')).gross, Math.round((1000 * 100 * 0.012 * (Date.parse('2026-10-16T09:00:00+08:00') - d0)) / (365 * DAY)), 'no closes: the price when lent');
  const day = t => SA.taipeiDay(t);
  assert.equal(day(lendEnds(lend)), '2027-04-12');
  assert.equal(day(lendEnds({ ...lend, renew: true })), '2028-04-12', 'renewed twice: eighteen months');
  // Offers.
  const acc = { ...SA.newAccount(1_000_000, now - 30 * DAY, 'acc') };
  acc.events = [...acc.events, { id: 'f1', type: 'fill', t: now - 10 * DAY, orderId: 'f1', symbol: '2330.TW', name: 'TSMC', kind: 'stock', market: 'TW', currency: 'TWD', side: 'buy', qty: 2000, price: 100, gross: 200_000, total: 200_000, commission: 0, tax: 0, fee: 0, twd: 1, settle: now - 8 * DAY }];
  const offer = more => SA.lendShares(acc, { symbol: '2330.TW', qty: 1000, price: 100, ...more }, now, 'l1');
  assert.equal(offer({}).event.rate, LEND_RATE.stock);
  assert.equal(offer({ rate: 0.005 }).event.rate, 0.005);
  assert.deepEqual(offer({ rate: 0.05 }), { error: 'lendNoTaker', rate: LEND_RATE.stock });
  assert.equal(offer({ rate: 0.17 }).error, 'lendRate');
  assert.equal(offer({ rate: 0 }).error, 'lendRate');
  // A renewed contract runs on past six months; the fee then at the closes given.
  const lent = offer({ renew: true }).account;
  assert.equal(Object.keys(SA.replay(SA.matureLending(lent, now + 200 * DAY), now + 200 * DAY).lent).length, 1);
  const ended = SA.matureLending(lent, now + 600 * DAY, { closesOf: () => [{ t: now, c: 50 }] });
  const pay = ended.events.find(e => e.type === 'lendpay');
  assert.equal(day(pay.t), day(lendEnds({ t: now, renew: true })));
  assert.equal(pay.gross, Math.round((1000 * 50 * 0.012 * Math.round((lendEnds({ t: now, renew: true }) - now) / DAY)) / 365), 'each day at the close');
});

test("Hong Kong board lots: every HKEX security's own, from its List of Securities; one not on it refused (lotUnknown)", async () => {
  const { hkLot, lotSize, lotProblem } = await import('../kit/stock-markets.mjs');
  // HKEX: Tencent 100, HSBC 400, Xiaomi 200, Tracker Fund 500, CKH 500.
  assert.deepEqual(['0700.HK', '0005.HK', '1810.HK', '2800.HK', '0001.HK'].map(hkLot), [100, 400, 200, 500, 500]);
  assert.equal(lotSize('HK', '0005.HK', 'stock'), 400);
  assert.deepEqual(lotProblem('HK', '0005.HK', 'stock', 'buy', 100), { lot: 400 });
  assert.equal(lotProblem('HK', '0005.HK', 'stock', 'buy', 800), null);
  assert.deepEqual(lotProblem('HK', '0007.HK', 'stock', 'buy', 100), { lot: null, unknown: true }, 'not listed');
  const hk = { symbol: '0007.HK', name: 'X', kind: 'stock', market: 'HK', currency: 'HKD', price: 10, prev: 10, got: now, marketTime: now, tz: 'Asia/Hong_Kong' };
  assert.equal(SA.placeOrder(SA.newAccount(1_000_000, now - DAY, 'acc'), { side: 'buy', type: 'limit', limit: 10, qty: 100 }, { quote: hk, rates: { TWD: 1, HKD: 4 }, valuation: ok, now, id: 'h' }).error, 'lotUnknown');
});

test("複委託: an online order's minimum at Taiwan brokers (¥3,000, €35, £75, HK$50); dividends withheld as the broker's account has them (Japan 15.315%, France 25%)", async () => {
  const { tradeCosts, dividendTaxes } = await import('../kit/stock-markets.mjs');
  const buy = (market, currency, gross) => tradeCosts({ market, currency, gross, side: 'buy', kind: 'etf' }).commission;
  assert.deepEqual([buy('JP', 'JPY', 100_000), buy('FR', 'EUR', 1_000), buy('DE', 'EUR', 1_000), buy('UK', 'GBP', 1_000), buy('HK', 'HKD', 1_000)], [3_000, 35, 35, 75, 50]);
  assert.equal(buy('JP', 'JPY', 2_000_000), 5_000, 'the rate past the minimum');
  assert.equal(dividendTaxes('JP', 10_000).withheld, 1_532);
  assert.equal(dividendTaxes('FR', 100).withheld, 25);
});

test('without 當沖 a share bought today sells only tomorrow; older shares sell today', () => {
  const now = Date.parse('2026-10-13T03:00:00Z');
  let acc = SA.newAccount(1_000_000, now - 400 * 86_400_000, 'nodt');
  const q = { symbol: '2330.TW', market: 'TW', kind: 'stock', currency: 'TWD', price: 100, prev: 100, marketTime: now };
  const old = { id: 'f0', type: 'fill', t: now - 5 * 86_400_000, orderId: 'o0', side: 'buy', symbol: '2330.TW', name: 'TSMC', market: 'TW', kind: 'stock', currency: 'TWD', qty: 1000, price: 100, gross: 100_000, commission: 142, tax: 0, fee: 0, total: 100_142, twd: 1, settle: now };
  const fresh = { ...old, id: 'f1', orderId: 'o1', t: now - 3_600_000 };
  acc = { ...acc, events: [...acc.events, old, fresh] };
  const ok = { margin: 'ok' };
  const sell = qty => SA.placeOrder(acc, { side: 'sell', type: 'limit', limit: 105, qty }, { quote: q, rates: { TWD: 1 }, valuation: ok, now, id: `s${qty}` });
  assert.equal(sell(2000).error, 'dayTradeNeeded');
  assert.equal(sell(1000).error, undefined);
});

test('興櫃: no daily limit, limit orders only, no closing auction, margin, short or day trade', async () => {
  const M = await import('../kit/stock-markets.mjs');
  const now = Date.parse('2026-10-13T03:00:00Z');
  const q = { symbol: '1260.TWO', market: 'TW', kind: 'stock', currency: 'TWD', price: 32, prev: 20, marketTime: now };
  assert.ok(M.isEmerging('1260.TWO') && !M.isEmerging('2330.TW') && !M.isEmerging('6488.TWO'));
  assert.equal(M.priceLimits(q, now), null);
  assert.equal(M.collateralRate('stock', 'TW', '1260.TWO'), 0);
  assert.ok(!M.isShortable('stock', '1260.TWO') && M.isShortable('stock', '6488.TWO'));
  let acc = SA.newAccount(1_000_000, now - 400 * 86_400_000, 'esb');
  const ok = { margin: 'ok' };
  const order = (req, a = acc) => SA.placeOrder(a, req, { quote: q, rates: { TWD: 1 }, valuation: ok, now, id: `x${Math.random()}` });
  assert.equal(order({ side: 'buy', type: 'market', qty: 1000 }).error, 'limitOnly');
  assert.equal(order({ side: 'buy', type: 'limit', limit: 40, qty: 1000 }).error, undefined, 'a price 100% over yesterday is fine');
  // Bought today: sells tomorrow, even for an account that may 當沖.
  const fill = { id: 'f1', type: 'fill', t: now - 3_600_000, orderId: 'o1', side: 'buy', symbol: '1260.TWO', name: '富味鄉', market: 'TW', kind: 'stock', currency: 'TWD', qty: 1000, price: 32, gross: 32_000, commission: 45, tax: 0, fee: 0, total: 32_045, twd: 1, settle: now + 2 * 86_400_000 };
  acc = { ...acc, events: [...acc.events, fill] };
  assert.equal(order({ side: 'sell', type: 'limit', limit: 33, qty: 1000 }).error, 'noDayTrade');
  assert.equal(order({ side: 'sell', type: 'limit', limit: 33, qty: 2000 }).error, 'noDayTrade');
});

test('可轉債: by the 張 of 1,000 units, its own ticks, ±10%, no tax to 2026, no margin or short', async () => {
  const M = await import('../kit/stock-markets.mjs');
  assert.equal(M.kindOf('EQUITY', '12561.TWO'), 'cb');
  assert.equal(M.kindOf('EQUITY', '6488.TWO'), 'stock');
  assert.deepEqual([M.tickSize('TW', 'cb', 105), M.tickSize('TW', 'cb', 180), M.tickSize('TW', 'cb', 1200)], [0.05, 1, 5]);
  assert.deepEqual(M.lotProblem('TW', '12561.TWO', 'cb', 'buy', 500), { lot: 1000 });
  assert.equal(M.lotProblem('TW', '12561.TWO', 'cb', 'buy', 2000), null);
  assert.equal(M.limitShare({ kind: 'cb', market: 'TW', symbol: '12561.TWO' }), 0.1);
  const sell = t => M.tradeCosts({ market: 'TW', side: 'sell', kind: 'cb', gross: 105_000, currency: 'TWD', t }).tax;
  assert.deepEqual([sell(Date.parse('2026-12-31T12:00:00+08:00')), sell(Date.parse('2027-01-02T12:00:00+08:00'))], [0, 105]);
  assert.ok(M.isTradable('cb') && !M.isShortable('cb') && M.collateralRate('cb', 'TW', '12561.TWO') === 0);
});

test('權證 and 牛熊證: by the 張, their ticks, 0.1% tax, no margin or short; held to its last day, sold at that close', async () => {
  const M = await import('../kit/stock-markets.mjs');
  for (const s of ['030001.TW', '03001P.TW', '72479U.TWO', '70006C.TWO']) assert.equal(M.kindOf('EQUITY', s), 'warrant', s);
  for (const s of ['0050.TW', '00679B.TWO', '020020.TW', '910322.TW', '2330.TW']) assert.notEqual(M.kindOf('EQUITY', s), 'warrant', s);
  assert.deepEqual([1.23, 7, 12, 60, 120, 600].map(p => M.tickSize('TW', 'warrant', p)), [0.01, 0.05, 0.1, 0.5, 1, 5]);
  assert.equal(M.tradeCosts({ market: 'TW', side: 'sell', kind: 'warrant', gross: 10_000, currency: 'TWD' }).tax, 10);
  assert.equal(M.limitShare({ kind: 'warrant', market: 'TW', symbol: '030001.TW' }), null);
  assert.ok(M.isTradable('warrant') && !M.isShortable('warrant') && M.collateralRate('warrant', 'TW', '030001.TW') === 0);
  const now = Date.parse('2026-10-13T03:00:00Z');
  const q = { symbol: '030001.TW', market: 'TW', kind: 'warrant', currency: 'TWD', price: 1.2, prev: 1.1, marketTime: now };
  let acc = SA.newAccount(1_000_000, now - 400 * 86_400_000, 'w');
  const fill = { id: 'f1', type: 'fill', t: now - 5 * 86_400_000, orderId: 'o1', side: 'buy', symbol: '030001.TW', name: '友達台新6A購01', market: 'TW', kind: 'warrant', currency: 'TWD', qty: 2000, price: 1, gross: 2000, commission: 20, tax: 0, fee: 0, total: 2020, twd: 1, settle: now - 3 * 86_400_000 };
  acc = { ...acc, events: [...acc.events, fill] };
  const ok = { margin: 'ok' };
  const place = req => SA.placeOrder(acc, req, { quote: q, rates: { TWD: 1 }, valuation: ok, now, id: 'x' });
  assert.equal(place({ side: 'buy', type: 'market', qty: 500 }).error, 'lot');
  const last = Date.parse('2026-10-20T13:30:00+08:00');
  const r = place({ side: 'sell', type: 'market', qty: 2000, expiry: last });
  assert.equal(r.error, undefined);
  const o = r.account.orders.at(-1);
  assert.equal(o.after, last);
  assert.ok(o.expiry && o.expires > now);
  assert.equal(place({ side: 'sell', type: 'market', qty: 2000, expiry: last + 60_000 }).error, 'side', 'only at a 13:30 close');
});

test('境內基金: bought at the NAV of the 15:30 cutoff, market orders only', async () => {
  const M = await import('../kit/stock-markets.mjs');
  const Q = await import('../kit/stock-quotes.mjs');
  assert.equal(M.kindOf('', '00526748A.TWF'), 'fund');
  assert.equal(M.marketOf('00526748A.TWF', 'fund'), 'TWFUND');
  assert.ok(!M.isSubBrokered('TWFUND'));
  const at = s => Date.parse(`${s}+08:00`);
  // Before the cutoff: today's; after it: the next business day's (a Friday's: Monday's).
  assert.equal(M.fundCutoff(at('2026-10-21T10:00:00')), at('2026-10-21T15:30:00'));
  assert.equal(M.fundCutoff(at('2026-10-21T15:30:00')), at('2026-10-22T15:30:00'));
  assert.equal(M.fundCutoff(at('2026-10-16T16:00:00')), at('2026-10-19T15:30:00'));
  assert.equal(M.fundCutoff(at('2026-10-23T16:00:00')), at('2026-10-27T15:30:00'), '光復節 observed on the Monday');
  const f = { name: '兆豐ESG', company: '兆豐投信', currency: 'TWD', nav: 13.21, prev: 13.2, date: '2026-10-20' };
  const q = Q.fundQuote('00526748A.TWF', f);
  assert.equal(q.market, 'TWFUND');
  assert.equal(q.kind, 'fund');
  assert.equal(q.marketTime, at('2026-10-20T15:30:00'));
  const now = at('2026-10-21T10:00:00');
  const acc = SA.newAccount(1_000_000, now - 400 * DAY, 'f');
  const place = (req, t = now) => SA.placeOrder(acc, req, { quote: q, rates: { TWD: 1 }, valuation: ok, now: t, id: 'f1' });
  assert.equal(place({ side: 'buy', type: 'limit', limit: 13, qty: 100 }).error, 'navOnly');
  const r = place({ side: 'buy', type: 'market', qty: 1000.5 });
  assert.equal(r.error, undefined);
  assert.equal(r.fill, null, 'never at yesterday\'s NAV');
  const o = r.account.orders.at(-1);
  assert.equal(o.after, at('2026-10-21T15:30:00'));
  assert.equal(o.expires, o.after + M.FUND_NAV_WAIT);
  // Yesterday's NAV doesn't fill it; today's (out that evening) does, at the NAV.
  assert.equal(SA.triggerPrice(o, q, at('2026-10-21T18:00:00')), null);
  const today = Q.fundQuote('00526748A.TWF', { ...f, nav: 13.5, prev: 13.21, date: '2026-10-21' });
  assert.equal(SA.triggerPrice(o, today, at('2026-10-21T20:00:00')), 13.5);
  // The fee: 1% to subscribe, nothing to redeem.
  assert.equal(M.tradeCosts({ market: 'TWFUND', side: 'buy', kind: 'fund', gross: 10_000, currency: 'TWD' }).total, 100);
  assert.equal(M.tradeCosts({ market: 'TWFUND', side: 'sell', kind: 'fund', gross: 10_000, currency: 'TWD' }).total, 0);
});

test('台指期: margin held, not the contract value; gains and losses in NT$ a point; settled at expiry', async () => {
  const M = await import('../kit/stock-markets.mjs');
  const at = s => Date.parse(`${s}+08:00`);
  const now = at('2026-10-21T10:00:00');
  const sym = 'MTX202611.TF';
  assert.equal(M.kindOf('', sym), 'fut');
  assert.equal(M.futureExpiry(sym), at('2026-11-18T13:30:00'));
  const q = (price, more = {}) => ({ symbol: sym, name: '小台指 11月', kind: 'fut', market: 'TAIFEX', currency: 'TWD', price, prev: price, got: now, marketTime: now, tz: 'Asia/Taipei', margin: [175_250, 134_500], session: { start: at('2026-10-21T09:00:00'), end: at('2026-10-21T13:30:00') }, ...more });
  let acc = SA.newAccount(300_000, now - 400 * DAY, 'fut');
  const place = (req, price, t = now, a = acc) => SA.placeOrder(a, { type: 'market', ...req }, { quote: q(price), rates: { TWD: 1 }, valuation: ok, now: t, id: `o${t}${req.side}${req.qty}` });
  // Two contracts need NT$350,500 of margin: too much; one is fine.
  assert.equal(place({ side: 'buy', qty: 2 }, 46_000).error, 'funds');
  const r = place({ side: 'buy', qty: 1 }, 46_000);
  assert.equal(r.error, undefined);
  acc = r.account;
  const fill = r.fill;
  // Bought at a point over (the market order's tick), costs only: NT$25 + 期交稅.
  assert.equal(fill.price, 46_001);
  assert.equal(fill.total - fill.gross, 25 + Math.round(46_001 * 50 * 0.00002));
  let s = SA.replay(acc, now);
  assert.equal(SA.available(acc, s).cash.TWD, s.cash.TWD - 175_250, 'its margin held');
  // Up 100 points: NT$5,000 on paper.
  const v = SA.valuate(s, new Map([[sym, q(46_101)]]), { TWD: 1 });
  assert.equal(v.futTWD, 5_000);
  assert.equal(v.netWorth, s.cash.TWD + 5_000);
  // Sold (closing): no margin needed, the gain paid.
  const before = s.cash.TWD;
  const c = place({ side: 'sell', qty: 1 }, 46_101, now + 60_000);
  assert.equal(c.error, undefined);
  s = SA.replay(c.account, now + 60_000);
  assert.equal(s.positions[sym], undefined);
  assert.equal(Math.round(s.cash.TWD - before), (46_100 - 46_001) * 50 - 25 - Math.round(46_100 * 50 * 0.00002));
  // Selling first opens a short, with its margin; held to expiry, settled at TAIFEX's final price.
  const sh = place({ side: 'sell', qty: 1 }, 46_000, now + 120_000, c.account);
  assert.equal(sh.error, undefined);
  assert.equal(SA.replay(sh.account, now + 120_000).positions[sym].qty, -1);
  const done = SA.applyFutExpiry(sh.account, sym, 45_000, { now: at('2026-11-18T14:00:00') });
  assert.equal(done.added.length, 1);
  assert.equal(done.added[0].side, 'buy');
  const end = SA.replay(done.account, at('2026-11-18T14:00:00'));
  assert.equal(end.positions[sym], undefined);
  assert.equal(Math.round(end.cash.TWD - SA.replay(sh.account, now + 120_000).cash.TWD), (45_999 - 45_000) * 50 - Math.round(45_000 * 50 * 0.00002));
  // After its last 13:30, no new orders.
  assert.equal(place({ side: 'buy', qty: 1 }, 46_000, at('2026-11-18T13:31:00')).error, 'futExpired');
});

test('台指選擇權: bought in full at NT$50 a point, sold back only, settled at expiry in cash', async () => {
  const M = await import('../kit/stock-markets.mjs');
  const at = s => Date.parse(`${s}+08:00`);
  const now = at('2026-10-21T10:00:00');
  const sym = 'TXO202611C46500.TF';
  assert.equal(M.kindOf('', sym), 'opt');
  assert.deepEqual([M.optionOf(sym).right, M.optionOf(sym).strike], ['C', 46_500]);
  assert.equal(M.optionExpiry(sym), at('2026-11-18T13:30:00'));
  assert.deepEqual([M.optionTick(9.9), M.optionTick(49), M.optionTick(320), M.optionTick(600), M.optionTick(1200)], [0.1, 0.5, 1, 5, 10]);
  assert.equal(M.optionIntrinsic(sym, 46_800), 300);
  assert.equal(M.optionIntrinsic('TXO202611P46500.TF', 46_800), 0);
  const q = (price, more = {}) => ({ symbol: sym, name: '台指選 11月 46500 買權', kind: 'opt', market: 'TAIFEX', currency: 'TWD', price, prev: price, got: now, marketTime: now, tz: 'Asia/Taipei', session: { start: at('2026-10-21T09:00:00'), end: at('2026-10-21T13:30:00') }, ...more });
  let acc = SA.newAccount(100_000, now - 400 * DAY, 'opt');
  const place = (req, price, t = now, a = acc) => SA.placeOrder(a, { type: 'market', ...req }, { quote: q(price), rates: { TWD: 1 }, valuation: ok, now: t, id: `o${t}${req.side}${req.qty}` });
  // Writing (selling one not held) isn't offered.
  assert.equal(place({ side: 'sell', qty: 1 }, 300).error, 'optNoWrite');
  // Seven at 300 is NT$105,000: too much; two is fine, at a tick over.
  assert.equal(place({ side: 'buy', qty: 7 }, 300).error, 'funds');
  const r = place({ side: 'buy', qty: 2 }, 300);
  assert.equal(r.error, undefined);
  acc = r.account;
  assert.equal(r.fill.price, 301);
  assert.equal(r.fill.gross, 301 * 2 * 50);
  assert.equal(r.fill.total - r.fill.gross, 2 * 25 + Math.round(301 * 100 * 0.001));
  let s = SA.replay(acc, now);
  assert.equal(s.cash.TWD, 100_000 - r.fill.total);
  // Up 40 points: worth (341 × 2 × 50).
  const v = SA.valuate(s, new Map([[sym, q(341)]]), { TWD: 1 });
  const pos = v.positions.find(p => p.symbol === sym);
  assert.equal(pos.valueTWD, 341 * 100);
  assert.equal(pos.avg, r.fill.total / 100);
  assert.equal(v.netWorth, s.cash.TWD + 341 * 100);
  // Sold back one; the other held to expiry at 46,800: 300 points paid, less 期交稅.
  const c = place({ side: 'sell', qty: 1 }, 341, now + 60_000);
  assert.equal(c.error, undefined);
  assert.equal(place({ side: 'sell', qty: 2 }, 341, now + 120_000, c.account).error, 'optNoWrite');
  const done = SA.applyOptExpiry(c.account, sym, 46_800, { now: at('2026-11-18T14:00:00') });
  assert.equal(done.added.length, 1);
  assert.deepEqual([done.added[0].price, done.added[0].gross, done.added[0].tax], [300, 15_000, 15]);
  const end = SA.replay(done.account, at('2026-11-18T14:00:00'));
  assert.equal(end.positions[sym], undefined);
  // A put the same day expires worthless: it simply ends.
  const put = 'TXO202611P46500.TF';
  const p = SA.placeOrder(done.account, { type: 'market', side: 'buy', qty: 1 }, { quote: { ...q(50), symbol: put }, rates: { TWD: 1 }, valuation: ok, now: now + 180_000, id: 'oput' });
  assert.equal(p.error, undefined);
  const gone = SA.applyOptExpiry(p.account, put, 46_800, { now: at('2026-11-18T14:00:00') });
  assert.deepEqual([gone.added[0].price, gone.added[0].total], [0, 0]);
  assert.equal(SA.replay(gone.account, at('2026-11-18T14:00:00')).positions[put], undefined);
  // After its last 13:30, no new orders.
  assert.equal(place({ side: 'buy', qty: 1 }, 300, at('2026-11-18T13:31:00')).error, 'futExpired');
});
