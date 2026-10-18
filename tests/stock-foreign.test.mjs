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
