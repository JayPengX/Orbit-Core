// Securities' broker rules in the kit (stock-*.mjs): the money math, the
// calendars and dates, and an account merged from two devices.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeAccounts, mergeDistinct, newAccount, replay, available, withdrawable, unsettled, taipeiDay, nextPayday, applyIncome, INCOME_UNTIL_MONTH } from '../kit/stock-account.mjs';
import { settleDate, settleDays, zonedTime, tickSize, onTick, toTick, priceLimits, tradeCosts, dividendTaxes, lotProblem, marketOf, kindOf, roundQty, roundCash, marketFill, isOddLot, oddLotOpen, collateralRate, localDayOf, T1_EUROPE } from '../kit/stock-markets.mjs';
import { easter, isHoliday, isTradingDay, upcomingHolidays, nextTradingStart, localDay } from '../kit/stock-holidays.mjs';
import { incomeTaxes, tdInterest, addMonths, fullMonths, addWeekdays, lendFee } from '../kit/stock-savings.mjs';
import { pastClose, afterHours, termDue, creditCheck, CREDIT_TIERS } from '../kit/stock-credit.mjs';
import { BONDS, priceAt, couponDates, curveYield, bondSession } from '../kit/stock-bonds.mjs';
import { rocDay, parseIpoList, ipoWon, ipoOpen, ipoDrawn, ipoBackAt, ipoListAt, ipoBackEvent, ipoWinEvent, ipoApplyEvent, ipoHold, IPO_FEE } from '../kit/stock-ipo.mjs';
import { twHoliday, twDay } from '../kit/holidays.mjs';

const iso = t => new Date(t).toISOString();

// ---- An account on two devices ------------------------------------------------

test('merging two copies: an order that expired on one stays expired, whichever copy comes first', () => {
  const acc = newAccount(100_000, 1_000, 'acc');
  const open = { id: 'o1', t: 2_000, status: 'open', rev: 1, side: 'buy', currency: 'TWD', reserve: 5_000 };
  const here = { ...acc, orders: [open] };
  const there = { ...acc, orders: [{ ...open, status: 'expired', rev: 2, done: 3_000 }] };
  assert.equal(mergeAccounts(here, there).orders[0].status, 'expired');
  assert.equal(mergeAccounts(there, here).orders[0].status, 'expired');
  // Its cash is free again either way.
  const merged = mergeAccounts(here, there);
  assert.equal(available(merged, replay(merged, 10_000)).cash.TWD, 100_000);
  // A fill anywhere still wins over every other ending.
  const filled = { ...acc, orders: [{ ...open, status: 'cancelled', rev: 2 }], events: [...acc.events, { id: 'f1', type: 'fill', orderId: 'o1', t: 2_500, price: 10, side: 'buy', symbol: 'X', qty: 1, gross: 10, total: 10, currency: 'TWD', market: 'TW', kind: 'stock' }] };
  assert.equal(mergeAccounts(there, filled).orders[0].status, 'filled');
  assert.equal(mergeAccounts(filled, there).orders[0].status, 'filled');
});

test('merging two copies: a default on either stays on the record, so its fine is never charged twice', () => {
  const acc = newAccount(100_000, 1_000, 'acc');
  const fined = { ...acc, od: { since: 5_000 }, defaultAt: 9_000, events: [...acc.events, { id: 'penalty:9000', type: 'penalty', t: 9_000, currency: 'TWD', amount: 700 }] };
  const behind = { ...acc, od: { since: 5_000 } };
  for (const merged of [mergeAccounts(behind, fined), mergeAccounts(fined, behind)]) {
    assert.equal(merged.defaultAt, 9_000, "the app's once-per-overdraft check (defaultAt >= od.since) still sees it");
    assert.ok(merged.defaultAt >= merged.od.since);
    assert.equal(merged.events.filter(e => e.type === 'penalty').length, 1);
  }
  // The later of two defaults.
  assert.equal(mergeAccounts({ ...fined, defaultAt: 20_000 }, fined).defaultAt, 20_000);
  assert.equal(mergeAccounts(fined, { ...fined, defaultAt: 20_000 }).defaultAt, 20_000);
});

test("merging two copies: an overdraft's and a margin call's clocks run from the first copy that saw them", () => {
  const acc = newAccount(100_000, 1_000, 'acc');
  const seen = { ...acc, od: { since: 5_000 }, call: { since: 6_000, due: 50_000, need: 1_000 } };
  for (const merged of [mergeAccounts(acc, seen), mergeAccounts(seen, acc)]) {
    assert.deepEqual(merged.od, { since: 5_000 });
    assert.equal(merged.call.due, 50_000);
  }
  // Both saw one: the earlier start stands (no new grace from the later copy).
  const later = { ...acc, od: { since: 8_000 }, call: { since: 9_000, due: 90_000, need: 1_000 } };
  assert.equal(mergeAccounts(later, seen).od.since, 5_000);
  assert.equal(mergeAccounts(later, seen).call.due, 50_000);
  // Neither: none made up.
  const plain = mergeAccounts(acc, acc);
  assert.equal('od' in plain || 'call' in plain || 'defaultAt' in plain, false);
});

test('merging two copies: every event once, snapshots and settings by their latest change, started-over accounts by the newer start', () => {
  const acc = newAccount(100_000, 1_000, 'acc');
  const a = { ...acc, events: [...acc.events, { id: 'd1', type: 'deposit', t: 3_000, currency: 'TWD', amount: 5 }], watch: { X: { on: true, t: 1 } }, snapshots: { '2026-10-01': { t: 1, v: 1 } } };
  const b = { ...acc, events: [...acc.events, { id: 'd1', type: 'deposit', t: 3_000, currency: 'TWD', amount: 5 }, { id: 'd2', type: 'deposit', t: 2_000, currency: 'TWD', amount: 7 }], watch: { X: { on: false, t: 2 } }, snapshots: { '2026-10-01': { t: 2, v: 2 } } };
  const m = mergeAccounts(a, b);
  assert.deepEqual(m.events.map(e => e.id), ['deposit:start', 'd2', 'd1']);
  assert.equal(m.watch.X.on, false);
  assert.equal(m.snapshots['2026-10-01'].v, 2);
  const fresh = newAccount(100_000, 5_000, 'new');
  assert.equal(mergeAccounts(a, fresh).id, 'new');
  assert.equal(mergeAccounts(fresh, a).id, 'new');
  assert.equal(mergeAccounts(null, a), a);
  assert.equal(mergeAccounts(a, null), a);
  // A separate account folded in: both opening deposits count.
  const other = newAccount(50_000, 500, 'other');
  const both = mergeDistinct(a, other);
  assert.equal(replay(both, 10_000).deposits, 100_000 + 5 + 50_000);
  assert.equal(both.created, 500);
});

// ---- Settlement dates ---------------------------------------------------------

test('a wall time in a zone, without parsing a locale string (Safari parses them its own way)', () => {
  assert.equal(iso(zonedTime(2026, 10, 20, 23, 59, 59, 'Asia/Taipei')), '2026-10-20T15:59:59.000Z');
  assert.equal(iso(zonedTime(2026, 7, 1, 9, 30, 0, 'America/New_York')), '2026-07-01T13:30:00.000Z');
  assert.equal(iso(zonedTime(2026, 12, 1, 9, 30, 0, 'America/New_York')), '2026-12-01T14:30:00.000Z');
  assert.equal(iso(zonedTime(2026, 1, 15, 8, 0, 0, 'Europe/London')), '2026-01-15T08:00:00.000Z');
  assert.equal(iso(zonedTime(2026, 7, 15, 8, 0, 0, 'Europe/London')), '2026-07-15T07:00:00.000Z');
  assert.equal(iso(zonedTime(2026, 1, 15, 10, 0, 0, 'Australia/Sydney')), '2026-01-14T23:00:00.000Z');
  assert.equal(iso(zonedTime(2026, 7, 15, 10, 0, 0, 'Australia/Sydney')), '2026-07-15T00:00:00.000Z');
  assert.equal(iso(zonedTime(2026, 3, 2, 9, 15, 0, 'Asia/Kolkata')), '2026-03-02T03:45:00.000Z');
  // Midnight (some engines say 24:00).
  assert.equal(iso(zonedTime(2026, 10, 20, 0, 0, 0, 'Asia/Tokyo')), '2026-10-19T15:00:00.000Z');
});

test("settlement: n of the market's own business days, at the end of that day in its own time", () => {
  const at = s => settleDate(s[0], Date.parse(s[1]));
  // Taiwan T+2 over a weekend, and over 國慶日補假 (Fri 2026-10-09).
  assert.equal(iso(at(['TW', '2026-10-16T03:00:00Z'])), '2026-10-20T15:59:59.000Z');
  assert.equal(iso(at(['TW', '2026-10-08T03:00:00Z'])), '2026-10-13T15:59:59.000Z');
  // TWSE's own days before Lunar New Year (2026-02-12, 13) and the holiday week.
  assert.equal(iso(at(['TW', '2026-02-11T03:00:00Z'])), '2026-02-24T15:59:59.000Z');
  // The US T+1 over Thanksgiving, in EST.
  assert.equal(iso(at(['US', '2026-11-25T15:00:00Z'])), '2026-11-28T04:59:59.000Z');
  // Across the end of daylight saving (the US's 2026-11-01, the UK's 2026-10-25).
  assert.equal(iso(at(['US', '2026-10-30T15:00:00Z'])), '2026-11-03T04:59:59.000Z');
  assert.equal(iso(at(['UK', '2026-10-22T10:00:00Z'])), '2026-10-26T23:59:59.000Z');
  // A trade on the market's own day: a US trade late in the evening there is
  // already the next day in Taiwan, still that day's in New York.
  assert.equal(iso(at(['US', '2026-10-15T23:30:00Z'])), '2026-10-17T03:59:59.000Z');
  // Europe moves to T+1 on 2027-10-11.
  assert.equal(settleDays('UK', T1_EUROPE - 1), 2);
  assert.equal(settleDays('UK', T1_EUROPE), 1);
  assert.equal(iso(at(['DE', '2027-10-11T08:00:00Z'])), '2027-10-12T21:59:59.000Z');
  // Crypto and forex at once.
  assert.equal(settleDate('CRYPTO', 123), 123);
  assert.equal(settleDate('FX', 123), 123);
});

test('sale money waits for its settlement before it can leave the market', () => {
  const acc = newAccount(100_000, 1_000, 'acc');
  const fill = { id: 'f', type: 'fill', side: 'sell', t: 2_000, settle: 10_000, currency: 'TWD', total: 3_000, symbol: 'X', qty: 0, price: 0, gross: 3_000, market: 'TW', kind: 'stock' };
  const a = { ...acc, events: [...acc.events, fill] };
  assert.deepEqual(unsettled(a, 5_000), { TWD: 3_000 });
  assert.deepEqual(unsettled(a, 10_000), {});
  const s = { cash: { TWD: 103_000 }, positions: {}, lent: {} };
  assert.equal(withdrawable(a, s, 5_000).TWD, 100_000);
  assert.equal(withdrawable(a, s, 10_000).TWD, 103_000);
});

// ---- Prices, lots and costs ---------------------------------------------------

test("Taiwan's ticks and daily limits, at each band's edges", () => {
  const tw = p => tickSize('TW', 'stock', p);
  assert.deepEqual([9.99, 10, 49.95, 50, 99.9, 100, 499.5, 500, 999, 1000].map(tw), [0.01, 0.05, 0.05, 0.1, 0.1, 0.5, 0.5, 1, 1, 5]);
  assert.deepEqual([49.99, 50].map(p => tickSize('TW', 'etf', p)), [0.01, 0.05]);
  const lim = (prev, kind = 'stock', market = 'TW', symbol = '2330.TW') => priceLimits({ prev, kind, market, symbol });
  assert.deepEqual(lim(100), { up: 110, down: 90 });
  // The limit is cut to the tick of the price it lands on: up rounds down, down rounds up.
  assert.deepEqual(lim(9.99), { up: 10.95, down: 9 });
  assert.deepEqual(lim(505), { up: 555, down: 454.5 });
  assert.deepEqual(lim(46.3), { up: 50.9, down: 41.7 });
  // Japan: a fixed yen amount by band; China's STAR Market 20%.
  assert.deepEqual(lim(1000, 'stock', 'JP', '7203.T'), { up: 1300, down: 700 });
  assert.deepEqual(lim(999, 'stock', 'JP', '7203.T'), { up: 1149, down: 849 });
  assert.deepEqual(lim(10, 'stock', 'CN', '688001.SS'), { up: 12, down: 8 });
  assert.equal(lim(100, 'stock', 'US', 'AAPL'), null);
  assert.equal(priceLimits({ prev: 0, market: 'TW', kind: 'stock' }), null);
});

test('a price rounded to its tick is on it, in every market that has one', () => {
  let x = 7;
  const rand = () => ((x = (x * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  for (const [market, kind, max] of [['TW', 'stock', 3000], ['TW', 'etf', 300], ['US', 'stock', 900], ['HK', 'stock', 6000], ['JP', 'stock', 40000], ['KR', 'stock', 900000], ['CN', 'stock', 300]]) {
    for (let i = 0; i < 2000; i++) {
      const p = 0.01 + rand() * max;
      const tick = tickSize(market, kind, p);
      for (const dir of [-1, 0, 1]) {
        const q = toTick(p, tick, dir);
        assert.ok(onTick(q, tick), `${market} ${p} → ${q} on ${tick}`);
        if (dir < 0) assert.ok(q <= p + 1e-9);
        if (dir > 0) assert.ok(q >= p - 1e-9);
      }
    }
  }
  assert.equal(toTick(10.45, 0.05, -1), 10.45, 'a price already on its tick stays (no float drift down)');
  assert.equal(toTick(10.45, 0.05, 1), 10.45);
  assert.equal(tickSize('UK', 'stock', 10), null);
  assert.equal(toTick(1.234, null), 1.234);
});

test("what a trade costs: Taiwan's floored fees, minimums, discounts, the day trade's half tax, odd lots and funds", () => {
  const cost = o => tradeCosts({ currency: 'TWD', market: 'TW', kind: 'stock', side: 'buy', ...o });
  assert.deepEqual(cost({ gross: 100_000 }), { commission: 142, tax: 0, fee: 0, total: 142, taxRate: 0, feeRate: 0 });
  assert.equal(cost({ gross: 100_000, side: 'sell' }).total, 142 + 300);
  assert.equal(cost({ gross: 100_000, side: 'sell', dayTrade: true }).tax, 150);
  assert.equal(cost({ gross: 100_000, side: 'sell', kind: 'etf' }).tax, 100);
  assert.equal(cost({ gross: 100_000, side: 'sell', kind: 'etf', dayTrade: true }).tax, 100, "an ETF's tax has no day-trade rate");
  assert.equal(cost({ gross: 1_000 }).commission, 20, "a whole lot's NT$20 minimum");
  assert.equal(cost({ gross: 1_000, oddLot: true }).commission, 1, "an odd lot's NT$1");
  assert.equal(cost({ gross: 100_000, discount: 0.28 }).commission, 39);
  assert.equal(cost({ gross: 5_000, discount: 0.28 }).commission, 20, 'the minimum applies after the discount');
  assert.equal(cost({ gross: 100_000, discount: 0 }).commission, 0, 'the welcome trade');
  assert.equal(cost({ gross: 0 }).total, 0);
  assert.deepEqual(cost({ gross: 10_000, kind: 'fund' }), { commission: 100, tax: 0, fee: 0, total: 100, taxRate: 0, feeRate: 0 });
  assert.equal(cost({ gross: 10_000, kind: 'fund', side: 'sell' }).total, 0);
  // Abroad: to the cent.
  const us = tradeCosts({ market: 'US', side: 'sell', kind: 'stock', gross: 10_000, currency: 'USD' });
  assert.deepEqual([us.commission, us.fee, us.tax], [10, 0.21, 0]);
  assert.equal(tradeCosts({ market: 'US', side: 'buy', kind: 'stock', gross: 100, currency: 'USD' }).commission, 3);
  const hk = tradeCosts({ market: 'HK', side: 'buy', kind: 'stock', gross: 100_000, currency: 'HKD' });
  assert.deepEqual([hk.commission, hk.tax, hk.fee], [250, 100, 8.5]);
  // A market not in the table: the generic rate.
  assert.equal(tradeCosts({ market: 'ZZ', side: 'buy', kind: 'stock', gross: 1_000, currency: 'USD' }).commission, 3);
});

test('dividends, interest and lending fees: withholding and the health premium at their thresholds', () => {
  assert.deepEqual(dividendTaxes('TW', 19_999), { withheld: 0, nhi: 0, net: 19_999 });
  assert.deepEqual(dividendTaxes('TW', 20_000), { withheld: 0, nhi: 422, net: 19_578 });
  assert.deepEqual(dividendTaxes('US', 100), { withheld: 30, nhi: 0, net: 70 });
  // Interest: 10% withheld over NT$20,000 (not at it); the premium from it.
  assert.deepEqual(incomeTaxes(20_000), { withheld: 0, nhi: 422, net: 19_578 });
  assert.deepEqual(incomeTaxes(20_001), { withheld: 2_000, nhi: 422, net: 17_579 });
  assert.deepEqual(incomeTaxes(500), { withheld: 0, nhi: 0, net: 500 });
  const lend = lendFee({ qty: 1000, price: 100, rate: 0.012, t: 0 }, 365 * 86_400_000);
  assert.deepEqual([lend.gross, lend.cut, lend.net], [1_200, 360, 840]);
});

test('time deposits: whole months, the month-end clamp, and 80% of the rate held when broken', () => {
  const t0 = Date.parse('2026-01-31T04:00:00Z');
  assert.equal(taipeiDay(addMonths(t0, 1)), '2026-02-28');
  assert.equal(taipeiDay(addMonths(t0, 13)), '2027-02-28');
  assert.equal(fullMonths(t0, addMonths(t0, 3) - 1), 2);
  assert.equal(fullMonths(t0, addMonths(t0, 3)), 3);
  const td = { amount: 100_000, rate: 0.0172, months: 12, t: t0, ends: addMonths(t0, 12) };
  assert.deepEqual(tdInterest(td, td.ends), { gross: 1_720, early: false });
  assert.deepEqual(tdInterest(td, addMonths(t0, 1) - 1), { gross: 0, early: true }, 'under a month: nothing');
  const at = addMonths(t0, 4);
  assert.equal(tdInterest(td, at).gross, Math.round((100_000 * 0.0139 * 0.8 * (at - t0)) / (365 * 86_400_000)), "four months held: 3 months' posted rate");
  // Weekdays for a recall's return.
  assert.equal(taipeiDay(addWeekdays(Date.parse('2026-10-16T04:00:00Z'), 3)), '2026-10-21');
});

test('board lots and odd lots', () => {
  assert.deepEqual(lotProblem('JP', '7203.T', 'stock', 'buy', 150), { lot: 100 });
  assert.equal(lotProblem('JP', '7203.T', 'stock', 'buy', 200), null);
  assert.equal(lotProblem('JP', '7203.T', 'stock', 'sell', 150, 150), null, 'an odd remainder sold whole');
  assert.deepEqual(lotProblem('JP', '7203.T', 'stock', 'sell', 50, 150), { lot: 100 });
  assert.equal(lotProblem('TW', '2330.TW', 'stock', 'buy', 7), null);
  assert.equal(lotProblem('JP', 'X', 'crypto', 'buy', 0.5), null);
  assert.equal(isOddLot('TW', 'stock', 999), true);
  assert.equal(isOddLot('TW', 'stock', 2000), false);
  assert.equal(isOddLot('US', 'stock', 7), false);
  assert.equal(oddLotOpen(Date.parse('2026-10-16T01:09:59Z')), false);
  assert.equal(oddLotOpen(Date.parse('2026-10-16T01:10:00Z')), true);
  assert.equal(roundQty(2.9999999999, 'stock'), 3);
  assert.equal(roundQty(2.5, 'stock'), 2);
  assert.equal(roundCash(1.005 * 1000, 'TWD'), 1005);
  assert.equal(roundCash(0.125, 'USD'), 0.13);
});

test('a symbol to its market and kind; what a broker lends against', () => {
  assert.deepEqual(['2330.TW', '6488.TWO', 'AAPL', 'BRK.B', '7203.T', '0700.HK', 'VOD.L', 'ABC.XYZ', '^TWII', 'BTC-USD', 'EURUSD=X'].map(s => marketOf(s, s === 'BTC-USD' ? 'crypto' : 'stock')), ['TW', 'TW', 'US', 'US', 'JP', 'HK', 'UK', 'INTL', 'TW', 'CRYPTO', 'FX']);
  assert.equal(kindOf('ETF', '00679B.TWO'), 'bond');
  assert.equal(kindOf('ETF', '0050.TW'), 'etf');
  assert.equal(kindOf('EQUITY', 'XAU'), 'metal');
  assert.equal(collateralRate('stock', 'TW', '2330.TW'), 0.6);
  assert.equal(collateralRate('stock', 'TW', '6488.TWO'), 0.5);
  assert.equal(collateralRate('stock', 'CN', '600519.SS'), 0);
  assert.equal(collateralRate('crypto', 'CRYPTO'), 0);
  assert.equal(collateralRate('govbond', 'BOND'), 0.9);
  // A market order pays half the spread, at least half a tick; never below zero.
  assert.equal(marketFill('TW', 'stock', 'buy', 100), 100.25);
  assert.equal(marketFill('TW', 'stock', 'sell', 100), 99.75);
  assert.equal(marketFill('METAL', 'metal', 'buy', 100), 100);
  assert.ok(marketFill('US', 'stock', 'sell', 0.00001) >= 0);
});

// ---- Calendars ----------------------------------------------------------------

test('Easter, and the rule calendars for 2026 and 2027', () => {
  const day = ([y, m, d]) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  assert.deepEqual([2024, 2025, 2026, 2027, 2028, 2038, 2285].map(y => day(easter(y))), ['2024-03-31', '2025-04-20', '2026-04-05', '2027-03-28', '2028-04-16', '2038-04-25', '2285-03-22']);
  const year = (m, y) => upcomingHolidays(m, `${y}-01-01`, 40).filter(d => d.startsWith(String(y)));
  assert.deepEqual(year('US', 2026), ['2026-01-01', '2026-01-19', '2026-02-16', '2026-04-03', '2026-05-25', '2026-06-19', '2026-07-03', '2026-09-07', '2026-11-26', '2026-12-25']);
  // 2027: Juneteenth and Christmas on a Saturday (Friday off), the 4th on a Sunday (Monday off); New Year 2028 on a Saturday isn't made up on 2027-12-31.
  assert.deepEqual(year('US', 2027), ['2027-01-01', '2027-01-18', '2027-02-15', '2027-03-26', '2027-05-31', '2027-06-18', '2027-07-05', '2027-09-06', '2027-11-25', '2027-12-24']);
  assert.deepEqual(year('UK', 2027), ['2027-01-01', '2027-03-26', '2027-03-29', '2027-05-03', '2027-05-31', '2027-08-30', '2027-12-27', '2027-12-28']);
  // Japan 2026: Constitution Day on a Sunday moves past the next two holidays (May 6), the September day between two holidays.
  assert.deepEqual(year('JP', 2026), ['2026-01-01', '2026-01-02', '2026-01-12', '2026-02-11', '2026-02-23', '2026-03-20', '2026-04-29', '2026-05-04', '2026-05-05', '2026-05-06', '2026-07-20', '2026-08-11', '2026-09-21', '2026-09-22', '2026-09-23', '2026-10-12', '2026-11-03', '2026-11-23', '2026-12-31']);
  // Canada's Victoria Day: the Monday before May 25 (May 25 itself a Monday in 2026).
  assert.ok(isHoliday('CA', '2026-05-18'));
  assert.ok(isHoliday('CA', '2027-05-24'));
  assert.equal(isHoliday('FX', '2026-12-25'), false);
  assert.equal(isTradingDay('US', '2026-10-17'), false, 'a Saturday');
});

test("Taiwan: every national day off on a weekday shuts the exchange too, and TWSE's own days before Lunar New Year shut it alone", () => {
  for (const y of [2026, 2027]) {
    for (let t = Date.UTC(y, 0, 1); t < Date.UTC(y + 1, 0, 1); t += 86_400_000) {
      const day = new Date(t).toISOString().slice(0, 10);
      const weekday = ![0, 6].includes(new Date(t).getUTCDay());
      if (weekday && twHoliday(day)) assert.equal(isTradingDay('TW', day), false, `${day} (${twHoliday(day).zh}) is a day off and the exchange's`);
    }
  }
  assert.equal(isTradingDay('TW', '2026-02-12'), false);
  assert.equal(twHoliday('2026-02-12'), null);
});

test('the next session start skips weekends and holidays in the market\'s own zone', () => {
  const fri = Date.parse('2026-10-09T01:00:00Z');
  assert.equal(iso(nextTradingStart('TW', fri, 'Asia/Taipei')), '2026-10-12T01:00:00.000Z');
  assert.equal(iso(nextTradingStart('US', Date.parse('2026-11-26T14:30:00Z'), 'America/New_York')), '2026-11-27T14:30:00.000Z');
  assert.equal(localDay(Date.parse('2026-10-16T23:30:00Z'), 'Asia/Taipei'), '2026-10-17');
  assert.equal(localDayOf(Date.parse('2026-10-16T23:30:00Z'), 'US'), '2026-10-16');
});

// ---- Credit, bonds, IPOs --------------------------------------------------------

test("Taiwan's close and after-hours sessions", () => {
  const t = Date.parse('2026-10-16T02:00:00Z'); // Friday 10:00 Taipei
  assert.equal(pastClose(t, Date.parse('2026-10-16T05:29:59Z')), false);
  assert.equal(pastClose(t, Date.parse('2026-10-16T05:30:00Z')), true);
  assert.equal(afterHours(Date.parse('2026-10-16T05:29:59Z')), null);
  assert.deepEqual(afterHours(Date.parse('2026-10-16T06:00:00Z')), { from: Date.parse('2026-10-16T05:30:00Z'), match: Date.parse('2026-10-16T06:30:00Z') });
  assert.equal(afterHours(Date.parse('2026-10-16T06:30:00Z')), null);
  assert.equal(afterHours(Date.parse('2026-10-09T06:00:00Z')), null, 'a holiday');
  assert.equal(taipeiDay(termDue(Date.parse('2026-08-31T04:00:00Z'))), '2027-02-28', 'six months, the month-end clamp');
  assert.equal(taipeiDay(termDue(Date.parse('2026-08-31T04:00:00Z'), 1)), '2027-08-31');
  // A credit account: the tier must be one of the tiers.
  assert.equal(creditCheck({ created: 0, events: [] }, 123, 1e9, 1e12).ok, false);
  assert.ok(CREDIT_TIERS.includes(500_000));
});

test('bonds: par at its own yield on a coupon date, accrued interest between, every coupon counted back from maturity', () => {
  const b = BONDS['UST-5Y'];
  const dates = couponDates(b, Date.parse('2026-10-18T00:00:00Z'));
  assert.equal(iso(dates[0]), '2026-08-31T00:00:00.000Z');
  assert.equal(iso(dates[1]), '2027-02-28T00:00:00.000Z', 'the 31st clamped to February');
  assert.equal(iso(dates.at(-1)), '2031-08-31T00:00:00.000Z');
  const onCoupon = priceAt(b, b.coupon, dates[0]);
  assert.ok(Math.abs(onCoupon.dirty - 100) < 1e-9 && onCoupon.accrued === 0);
  const mid = priceAt(b, b.coupon, (dates[0] + dates[1]) / 2);
  assert.ok(Math.abs(mid.accrued - b.coupon / 4) < 1e-9);
  assert.ok(Math.abs(mid.clean - 100) < 0.05);
  assert.deepEqual(priceAt(b, 5, b.maturity), { clean: 100, accrued: 0, dirty: 100 });
  assert.equal(curveYield([[2, 1], [10, 3]], 6), 2);
  assert.equal(curveYield([[2, 1], [10, 3]], 1), 1);
  assert.equal(curveYield([[2, 1], [10, 3]], 30), 3);
  assert.equal(curveYield([], 3), null);
  // A Taiwan bond's session on a holiday moves on.
  const s = bondSession(BONDS['TWGB-2Y'], Date.parse('2026-10-09T02:00:00Z'));
  assert.equal(iso(s.start), '2026-10-12T01:00:00.000Z');
});

test("IPO subscriptions: TWSE's list, the window, the draw and what comes back", () => {
  assert.equal(iso(rocDay('115/10/22')), '2026-10-21T16:00:00.000Z');
  assert.equal(rocDay('2026-10-22'), null);
  const json = {
    fields: ['抽籤日期', '證券名稱', '證券代號', '發行市場', '申購開始日', '申購結束日', '承銷價(元)', '實際承銷價(元)', '撥券日期(上市、上櫃日期)', '申購股數', '中籤率(%)', '取消公告'],
    data: [
      ['115/10/22', '甲', '1234', '初上市', '115/10/16', '115/10/20', '50.00', '', '115/10/28', '1,000', '2.5', ''],
      ['115/10/22', '乙', '5678', '初上櫃', '115/10/16', '115/10/20', '30', '28.5', '115/10/28', '1000', '', ''],
      ['115/10/22', '丁', '2468', '初上櫃', '115/10/16', '115/10/20', '40', '0.00', '', '1000', '', ''],
      ['115/10/22', '債', '12345', '公司債', '115/10/16', '115/10/20', '100', '', '', '1000', '', ''],
      ['115/10/22', '丙', '9999', '初上市', '115/10/16', '115/10/20', '30', '', '', '1000', '', '取消']
    ]
  };
  const list = parseIpoList(json);
  assert.deepEqual(list.map(s => [s.code, s.symbol, s.price, s.rate, s.ipo]), [['1234', '1234.TW', 50, 0.025, true], ['5678', '5678.TWO', 28.5, null, true], ['2468', '2468.TWO', 40, null, true]]);
  const s = list[0];
  assert.equal(ipoHold(s), 50_000 + IPO_FEE);
  assert.equal(ipoOpen(s, s.from + 9 * 3_600_000 - 1), false);
  assert.equal(ipoOpen(s, s.from + 9 * 3_600_000), true);
  assert.equal(ipoOpen(s, s.to + 14 * 3_600_000), false);
  assert.equal(ipoDrawn(s, s.draw), true);
  assert.equal(ipoDrawn(list[1], list[1].draw), false, 'no rate yet');
  const apply = ipoApplyEvent(s, s.from + 10 * 3_600_000);
  assert.equal(ipoBackEvent(apply).t, ipoBackAt(s));
  assert.equal(ipoWinEvent(apply).t, ipoListAt(s));
  assert.equal(ipoListAt({ draw: 0, list: null }), 7 * 86_400_000 + 9 * 3_600_000, 'no listing day yet: a week after the draw');
  assert.equal(ipoWon('00000000', 0.01), true);
  assert.equal(ipoWon('ffffffff', 0.99), false);
  assert.equal(ipoWon('80000000', 0.5), false, 'exactly at the rate loses');
  assert.equal(ipoWon('7fffffff', 0.5), true);
  assert.equal(ipoWon('00000000', 0), false);
  assert.equal(ipoWon('ffffffff', 1), true);
});

// ---- Days and paydays ---------------------------------------------------------

test("Taiwan's day of a moment, the same in every kit module", async () => {
  const q = await import('../kit/quadra.mjs').catch(() => null);
  const { taipeiDate } = await import('../kit/play-lottery.mjs');
  const { plusMonth } = await import('../kit/plus.mjs');
  for (const t of [Date.parse('2026-10-17T15:59:59.999Z'), Date.parse('2026-10-17T16:00:00Z'), Date.parse('2026-12-31T16:00:00Z'), Date.parse('2027-01-01T00:00:00Z')]) {
    const day = taipeiDay(t);
    assert.equal(twDay(t), day);
    assert.equal(taipeiDate(t), day);
    assert.equal(plusMonth(t), day.slice(0, 7));
    if (q) assert.equal(q.taipeiDay(t), day);
  }
  assert.equal(taipeiDay(Date.parse('2026-10-17T16:00:00Z')), '2026-10-18');
  assert.equal(iso(nextPayday(Date.parse('2026-12-31T15:59:59Z'))), '2026-12-31T16:00:00.000Z');
  assert.equal(iso(nextPayday(Date.parse('2026-12-31T16:00:00Z'))), '2027-01-31T16:00:00.000Z');
  if (q) assert.equal(q.nextPayday(Date.parse('2026-12-31T15:59:59Z')), nextPayday(Date.parse('2026-12-31T15:59:59Z')));
});

test("Securities' own paydays stop where Quadra's begin, each month once", () => {
  const created = Date.parse('2026-07-15T00:00:00Z');
  const acc = newAccount(100_000, created, 'acc');
  const { account, added } = applyIncome(acc, Date.parse('2026-12-15T00:00:00Z'));
  assert.deepEqual(added.map(e => e.id), ['pay:2026-08', 'pay:2026-09']);
  assert.ok(added.every(e => e.id.slice(4) < INCOME_UNTIL_MONTH));
  assert.equal(applyIncome(account, Date.parse('2026-12-15T00:00:00Z')).added.length, 0);
});
