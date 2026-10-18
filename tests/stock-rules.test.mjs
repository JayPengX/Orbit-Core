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
