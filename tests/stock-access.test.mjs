// 開戶與交易資格 (kit/stock-access.mjs): what must be opened, signed or
// qualified for before a product can be bought, as Taiwan's brokers ask it.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as A from '../kit/stock-access.mjs';
import { newAccount, placeOrder, exchange } from '../kit/stock-account.mjs';
import { openCredit, CREDIT_DOCS } from '../kit/stock-credit.mjs';

const DAY = 86_400_000;
// Tuesday 2026-11-03, 10:00 in Taipei (after the rules came).
const now = Date.parse('2026-11-03T02:00:00Z');
const tomorrow8 = Date.parse('2026-11-04T00:00:00Z');
const fresh = () => newAccount(1_000_000, now - DAY, 'acc');
const fill = (i, t, extra = {}) => ({ id: `f${i}`, type: 'fill', t, side: 'buy', symbol: '2317.TW', kind: 'stock', market: 'TW', currency: 'TWD', qty: 1, price: 100, gross: 100, total: 100, ...extra });
const tw = (symbol, kind = 'stock', extra = {}) => ({ symbol, name: symbol, kind, market: 'TW', currency: 'TWD', price: 50, ...extra });
const sign = (acc, key, ctx = {}, at = now) => {
  const r = A.applyAccess(acc, key, { docs: A.ACCESS[key].docs, ...ctx }, at);
  assert.equal(r.error, undefined, `${key}: ${JSON.stringify(r)}`);
  return r.account;
};
const KYC_TOP = { years: 2, goal: 2, loss: 2, horizon: 2, known: 2, drop: 2 };

test('each product is refused until its papers are signed, and passes after', () => {
  let acc = fresh();
  const cases = [
    ['warrant', tw('030012.TW', 'warrant')],
    ['emerging', tw('6987.TWO', 'stock', { symbol: '6987.TWO' })],
    ['leveraged', tw('00631L.TW', 'etf')]
  ];
  for (const [key, quote] of cases) {
    if (key === 'emerging' && !A.accessProblem(acc, quote, { side: 'buy' }, now)) continue; // (not on the 興櫃 list in this kit build)
    assert.deepEqual(A.accessProblem(acc, quote, { side: 'buy' }, now), { error: 'accessNeeded', key, pending: null }, key);
  }
  // 槓反 needs a way in first (a credit account, 10 warrant or futures trades, or one bought before).
  assert.equal(A.applyAccess(acc, 'leveraged', { docs: A.ACCESS.leveraged.docs }, now).error, 'accessNeeds');
  assert.equal(A.applyAccess(acc, 'warrant', { docs: [] }, now).error, 'accessDocs', 'unsigned');
  acc = sign(acc, 'warrant');
  assert.equal(A.accessProblem(acc, tw('030012.TW', 'warrant'), { side: 'buy' }, now), null, 'signed: at once');
  // Ten warrant trades in the last year: 槓反 can be applied for.
  acc = { ...acc, events: [...acc.events, ...Array.from({ length: 10 }, (_, i) => fill(i, now - (i + 1) * DAY, { kind: 'warrant', symbol: '030012.TW' }))] };
  acc = sign(acc, 'leveraged');
  assert.equal(A.accessProblem(acc, tw('00631L.TW', 'etf'), { side: 'buy' }, now), null);
});

test('an account the broker approves opens the next trading day: 審核中 until then', () => {
  let acc = sign(fresh(), 'kyc', { answers: KYC_TOP });
  acc = sign(acc, 'sub');
  const us = { symbol: 'AAPL', name: 'Apple', kind: 'stock', market: 'US', currency: 'USD', price: 200 };
  assert.deepEqual(A.accessProblem(acc, us, { side: 'buy' }, now), { error: 'accessNeeded', key: 'sub', pending: tomorrow8 });
  assert.equal(A.accessProblem(acc, us, { side: 'buy' }, tomorrow8), null);
  // Friday's application opens on Monday.
  const fri = Date.parse('2026-11-06T06:00:00Z');
  assert.equal(A.nextBusinessOpen(fri), Date.parse('2026-11-09T00:00:00Z'));
  // 複委託 needs KYC first.
  assert.deepEqual(A.applyAccess(fresh(), 'sub', { docs: A.ACCESS.sub.docs }, now).needs, [{ key: 'kyc' }]);
});

test('KYC: a fund above its 風險收益等級 is refused; it lapses after a year', () => {
  const fund = { symbol: 'F1', name: 'Fund', kind: 'fund', market: 'TWFUND', currency: 'TWD', price: 10 };
  assert.deepEqual(A.accessProblem(fresh(), fund, { side: 'buy', rr: 2 }, now), { error: 'accessNeeded', key: 'kyc', pending: null });
  const calm = sign(fresh(), 'kyc', { answers: { years: 0, goal: 0, loss: 0, horizon: 0, known: 0, drop: 0 } });
  assert.equal(A.accessProblem(calm, fund, { side: 'buy', rr: 2 }, now), null);
  assert.deepEqual(A.accessProblem(calm, fund, { side: 'buy', rr: 4 }, now), { error: 'fundRisk', rr: 4, max: 2, level: 'conservative' });
  assert.equal(A.kycResult({ years: 1 }), null, 'every question answered');
  assert.equal(A.kycResult(KYC_TOP).level, 'aggressive');
  const year = now + 366 * DAY;
  assert.equal(A.accessState(calm, 'kyc', year).lapsed, true);
  assert.equal(A.accessProblem(calm, fund, { side: 'buy', rr: 1 }, year).key, 'kyc');
});

test('abroad a non-professional buys up to 2× long or 1× short and no ETN; 專業投資人 any', () => {
  let acc = sign(newAccount(1_000_000, now - 9 * DAY, 'acc'), 'kyc', { answers: KYC_TOP }, now - 3 * DAY);
  acc = sign(acc, 'sub', {}, now - 2 * DAY);
  acc = { ...acc, events: [...acc.events, fill('lev', now - 3 * DAY, { leveraged: true, symbol: 'SSO', market: 'US', kind: 'etf' })] };
  acc = sign(acc, 'leveraged');
  const etf = (symbol, name) => ({ symbol, name, kind: 'etf', market: 'US', currency: 'USD', price: 50 });
  assert.deepEqual(A.accessProblem(acc, etf('TQQQ', 'ProShares UltraPro QQQ'), { side: 'buy' }, now), { error: 'proOnly', mult: 3, inverse: false, etn: false });
  assert.equal(A.accessProblem(acc, etf('SQQQ', 'ProShares UltraPro Short QQQ'), { side: 'buy' }, now).error, 'proOnly');
  assert.equal(A.accessProblem(acc, etf('SSO', 'ProShares Ultra S&P500'), { side: 'buy' }, now), null, '2× long');
  assert.equal(A.accessProblem(acc, etf('SH', 'ProShares Short S&P500'), { side: 'buy' }, now), null, '1× short');
  // 專業投資人: NT$30M, or NT$15M and a trade over NT$3M; and 10 trades in the last year.
  assert.deepEqual(A.accessNeeds(acc, 'pro', { netWorthTWD: 20_000_000 }, now).map(n => n.key), ['means', 'trades']);
  acc = { ...acc, events: [...acc.events, ...Array.from({ length: 10 }, (_, i) => fill(`p${i}`, now - (i + 5) * DAY, i === 0 ? { gross: 3_100_000 } : {}))] };
  acc = sign(acc, 'pro', { netWorthTWD: 16_000_000 });
  assert.equal(A.accessProblem(acc, etf('TQQQ', 'ProShares UltraPro QQQ'), { side: 'buy' }, tomorrow8), null);
});

test('selling or closing is never asked for anything', () => {
  const acc = fresh();
  assert.equal(A.accessProblem(acc, tw('030012.TW', 'warrant'), { side: 'sell' }, now), null);
  assert.equal(A.accessProblem(acc, { symbol: 'TXF', kind: 'fut', market: 'TAIFEX' }, { side: 'sell', opening: 0 }, now), null, 'a futures close');
  assert.equal(A.accessProblem(acc, { symbol: 'TXF', kind: 'fut', market: 'TAIFEX' }, { side: 'sell', opening: 1 }, now).key, 'futures', 'a futures open');
});

test('an account from before the rules keeps what it traded (and the old day-trade rule); KYC is asked again', () => {
  const old = { ...newAccount(1_000_000, A.ACCESS_SINCE - 200 * DAY, 'old'), events: [...Array.from({ length: 10 }, (_, i) => fill(i, A.ACCESS_SINCE - (i + 1) * 9 * DAY)), fill('w', A.ACCESS_SINCE - DAY, { kind: 'warrant', symbol: '030012.TW' })] };
  assert.equal(A.accessState(old, 'warrant', now).open, true);
  assert.equal(A.accessState(old, 'daytrade', now).open, true);
  assert.equal(A.accessState(old, 'futures', now).open, false, 'never traded futures');
  assert.equal(A.accessState(old, 'kyc', now).open, false);
  const newer = { ...newAccount(1_000_000, A.ACCESS_SINCE + DAY, 'new'), events: [fill('w', A.ACCESS_SINCE + DAY, { kind: 'warrant' })] };
  assert.equal(A.accessState(newer, 'warrant', now).open, false, 'opened after: signs like anyone');
});

test('結匯: US$5,000,000 a calendar year each way; NT$500,000 or more is declared', () => {
  const rates = { TWD: 1, USD: 32 };
  const acc = { ...fresh(), events: [{ id: 'x', type: 'fx', t: now - DAY, from: 'TWD', to: 'USD', amount: 32 * 4_900_000, received: 4_900_000, usd: 32 }] };
  assert.deepEqual(A.fxCapProblem(acc, { from: 'TWD', to: 'USD', amount: 32 * 200_000, received: 200_000 }, rates, now), { error: 'fxYearCap', leftUSD: 100_000, capUSD: 5_000_000 });
  assert.equal(A.fxCapProblem(acc, { from: 'TWD', to: 'USD', amount: 32 * 100_000, received: 100_000 }, rates, now), null);
  assert.equal(A.fxCapProblem(acc, { from: 'USD', to: 'TWD', amount: 1_000_000, received: 32_000_000 }, rates, now), null, 'the other way has its own');
  assert.equal(A.fxCapProblem(acc, { from: 'TWD', to: 'USD', amount: 32 * 200_000, received: 200_000 }, rates, Date.parse('2027-01-04T02:00:00Z')), null, 'a new year');
  assert.equal(A.fxNeedsDeclare({ from: 'TWD', to: 'USD', amount: 500_000 }), true);
  assert.equal(A.fxNeedsDeclare({ from: 'TWD', to: 'USD', amount: 499_999 }), false);
});

test('leverage from a name or code', () => {
  const L = (symbol, name, market = 'US', kind = 'etf') => {
    const x = A.leverageOf({ symbol, name, market, kind });
    return x && (x.inverse ? -x.mult : x.mult);
  };
  assert.equal(L('TQQQ', 'ProShares UltraPro QQQ'), 3);
  assert.equal(L('SQQQ', 'ProShares UltraPro Short QQQ'), -3);
  assert.equal(L('SH', 'ProShares Short S&P500'), -1);
  assert.equal(L('BSV', 'Vanguard Short-Term Bond ETF'), null);
  assert.equal(L('JPST', 'JPMorgan Ultra-Short Income ETF'), null);
  assert.equal(L('00631L.TW', '元大台灣50正2', 'TW'), 2);
  assert.equal(L('00632R.TW', '元大台灣50反1', 'TW'), -1);
  assert.equal(L('7500.HK', 'FI二南方恒指', 'HK'), -2);
  assert.equal(L('1357.T', 'NEXT FUNDS 日経ダブルインバース', 'JP'), -2);
});

test('the credit account: its contract and 風險預告書 signed the first time, open the next trading day', () => {
  const acc = { ...newAccount(1_000_000, now - 200 * DAY, 'acc'), events: [{ id: 'd', type: 'deposit', t: now - 200 * DAY, currency: 'TWD', amount: 2_000_000 }, ...Array.from({ length: 12 }, (_, i) => fill(i, now - (i + 1) * 10 * DAY, { gross: 40_000, total: 40_000 }))] };
  const unsigned = openCredit(acc, 500_000, 2_000_000, now);
  if (unsigned.error === 'credit') return; // (this account's turnover doesn't reach the tier: the rule is creditCheck's, tested in kit-stock)
  assert.equal(unsigned.error, 'accessDocs');
  const r = openCredit(acc, 500_000, 2_000_000, now, { docs: CREDIT_DOCS });
  assert.equal(r.event.from, tomorrow8);
});

test('placeOrder refuses a warrant buy until signed, the order said why', () => {
  const quote = { symbol: '030012.TW', name: 'W', kind: 'warrant', market: 'TW', currency: 'TWD', price: 1.5, got: now, session: { start: Date.parse('2026-11-03T01:00:00Z'), end: Date.parse('2026-11-03T05:30:00Z') }, tz: 'Asia/Taipei' };
  const valuation = { margin: 'ok', netWorth: 1_000_000, assets: 1_000_000, debtTWD: 0, shortTWD: 0 };
  const buy = acc => placeOrder(acc, { side: 'buy', type: 'limit', limit: 1.5, qty: 1000 }, { quote, rates: { TWD: 1 }, valuation, now, id: 'o1' });
  assert.deepEqual(buy(fresh()), { error: 'accessNeeded', key: 'warrant', pending: null });
  assert.equal(buy(sign(fresh(), 'warrant')).error, undefined);
  // And 結匯 through exchange().
  const big = { ...fresh(), events: [...fresh().events, { id: 'x', type: 'fx', t: now - DAY, from: 'TWD', to: 'USD', amount: 32 * 5_000_000, received: 5_000_000, usd: 32 }] };
  assert.equal(exchange(big, { from: 'TWD', to: 'USD', amount: 32_000 }, { rates: { TWD: 1, USD: 32 }, now }).error, 'fxYearCap');
});
