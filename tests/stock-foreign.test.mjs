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
