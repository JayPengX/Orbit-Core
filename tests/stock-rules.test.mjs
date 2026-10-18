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
