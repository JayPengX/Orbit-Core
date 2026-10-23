// Taiwan's rules for 全額交割股, 臺灣創新板 and 槓反期貨 ETF, and the futures
// account (期貨保證金專戶) futures and options trade from.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as A from '../kit/stock-access.mjs';
import * as SA from '../kit/stock-account.mjs';
import { isFullDelivery, isInnovation, isLiFutures, isShortable, collateralRate, TW_FULL, TW_INNOVATION, TW_LI_FUTURES } from '../kit/stock-markets.mjs';
import { checkStock } from '../stock-check.js';
import { pack } from '../kit/stock-codec.mjs';

const DAY = 86_400_000;
const at = s => Date.parse(`${s}+08:00`);
// Tuesday 2026-11-03, 10:00 in Taipei (after the rules came).
const now = at('2026-11-03T10:00:00');
const ok = { margin: 'ok', netWorth: 1_000_000, assets: 1_000_000, debtTWD: 0, shortTWD: 0, positions: [] };
const tw = (symbol, more = {}) => ({ symbol, name: symbol, kind: 'stock', market: 'TW', currency: 'TWD', price: 10, prev: 10, got: now, marketTime: now, tz: 'Asia/Taipei', session: { start: at('2026-11-03T09:00:00'), end: at('2026-11-03T13:30:00') }, ...more });
const buyFill = (symbol, t, qty, settle) => ({ id: `b${symbol}${t}`, type: 'fill', t, side: 'buy', symbol, name: symbol, kind: 'stock', market: 'TW', currency: 'TWD', qty, price: 10, gross: qty * 10, total: qty * 10, commission: 0, tax: 0, fee: 0, settle });
const place = (acc, quote, req) => SA.placeOrder(acc, { type: 'limit', limit: quote.price, ...req }, { quote, rates: { TWD: 1 }, valuation: ok, now, id: `o${req.side}${req.qty}` });

test('the lists: 全額交割, 創新板 and 槓反期貨 ETF codes, listed or OTC', () => {
  assert.ok(TW_FULL.split(',').length >= 3 && TW_INNOVATION.split(',').length >= 10 && TW_LI_FUTURES.split(',').length >= 3);
  const full = TW_FULL.split(',')[0];
  assert.ok(isFullDelivery(`${full}.TW`) && isFullDelivery(`${full}.TWO`));
  assert.equal(isFullDelivery('2330.TW'), false);
  assert.ok(isInnovation(`${TW_INNOVATION.split(',')[0]}.TW`));
  assert.ok(TW_LI_FUTURES.split(',').every(c => /^\d{5,6}[LR]$/.test(c)));
  assert.ok(isLiFutures(`${TW_LI_FUTURES.split(',')[0]}.TW`));
  // (元大台灣50正2 is a securities trust's, not a futures trust's.)
  assert.equal(isLiFutures('00631L.TW'), false);
});

test('全額交割: cash and shares settled before the order; no 融資, 融券 or 當沖', () => {
  const sym = `${TW_FULL.split(',')[0]}.TW`;
  const q = tw(sym);
  assert.equal(isShortable('stock', sym), false);
  assert.equal(collateralRate('stock', 'TW', sym), 0);
  let acc = SA.newAccount(100_000, now - 30 * DAY, 'full');
  assert.deepEqual(place(acc, q, { side: 'buy', qty: 1000, margin: true }), { error: 'fullDelivery', part: 'margin' });
  // Bought yesterday (settles tomorrow) and today: neither is delivered yet.
  acc = { ...acc, events: [...acc.events, buyFill(sym, now - DAY, 1000, now + DAY), buyFill(sym, now - 3 * DAY, 2000, now - DAY)] };
  assert.deepEqual(place(acc, q, { side: 'sell', qty: 3000 }), { error: 'fullDelivery', part: 'shares', have: 2000 });
  assert.equal(place(acc, q, { side: 'sell', qty: 2000 }).error, undefined);
  // A sale's money not settled yet doesn't pay for a buy.
  const cash = SA.replay(acc, now).cash.TWD;
  const sold = { id: 'sold', type: 'fill', t: now - 60_000, side: 'sell', symbol: '2330.TW', name: '2330', kind: 'stock', market: 'TW', currency: 'TWD', qty: 1, price: 50_000, gross: 50_000, total: 50_000, commission: 0, tax: 0, fee: 0, settle: now + 2 * DAY };
  acc = { ...acc, events: [...acc.events, buyFill('2330.TW', now - 9 * DAY, 1, now - 7 * DAY), sold] };
  const r = place(acc, q, { side: 'buy', qty: 1000 * Math.ceil((cash + 20_000) / 10_000) });
  assert.equal(r.error, 'fullDelivery');
  assert.equal(r.part, 'cash');
  assert.ok(r.have <= cash);
  // A listed stock isn't held to it.
  assert.equal(place(acc, tw('2330.TW'), { side: 'buy', qty: 1000 * Math.ceil((cash + 20_000) / 10_000) }).error, undefined);
});

test('創新板: its 風險預告書 signed before the first buy; an account that bought one before keeps it', () => {
  const sym = `${TW_INNOVATION.split(',')[0]}.TW`;
  const q = tw(sym);
  const acc = SA.newAccount(1_000_000, now - DAY, 'tib');
  assert.deepEqual(A.accessProblem(acc, q, { side: 'buy' }, now), { error: 'accessNeeded', key: 'innovation', pending: null });
  assert.equal(A.accessProblem(acc, q, { side: 'sell' }, now), null);
  assert.equal(A.applyAccess(acc, 'innovation', { docs: [] }, now).error, 'accessDocs');
  const signed = A.applyAccess(acc, 'innovation', { docs: ['innovationRisk'] }, now).account;
  assert.equal(A.accessProblem(signed, q, { side: 'buy' }, now), null);
  const old = SA.newAccount(1_000_000, at('2026-09-01T10:00:00'), 'old');
  old.events.push(buyFill(sym, at('2026-09-02T10:00:00'), 1000, at('2026-09-04T10:00:00')));
  assert.equal(A.accessProblem(old, q, { side: 'buy' }, now), null);
});

test('槓反期貨 ETF: TWSE\'s 交易檢核表, all of it answered right, before the first buy; a 專業投資人 is exempt', () => {
  const q = tw(`${TW_LI_FUTURES.split(',')[0]}.TW`, { kind: 'etf' });
  let acc = SA.newAccount(1_000_000, now - DAY, 'lif');
  acc = { ...acc, events: [...acc.events, { id: 'credit', type: 'credit', t: now - DAY, from: now - DAY, limit: 500_000 }] };
  acc = A.applyAccess(acc, 'leveraged', { docs: ['leveragedRisk'] }, now).account;
  // 槓反's account in place, the checklist still to do (an ordinary 槓反 ETF needs none).
  assert.equal(A.accessProblem(acc, tw('00631L.TW', { kind: 'etf' }), { side: 'buy' }, now), null);
  assert.deepEqual(A.accessProblem(acc, q, { side: 'buy' }, now), { error: 'accessNeeded', key: 'liFutures', pending: null });
  assert.equal(A.LI_FUTURES_CHECK.length, 17);
  const right = [...A.LI_FUTURES_CHECK];
  const wrong = right.map((x, i) => (i === 0 ? !x : x));
  assert.deepEqual(A.applyAccess(acc, 'liFutures', { answers: wrong }, now), { error: 'liCheck', wrong: [0], missing: [] });
  assert.equal(A.applyAccess(acc, 'liFutures', { answers: right.slice(0, 16) }, now).error, 'liCheck');
  const done = A.applyAccess(acc, 'liFutures', { answers: right }, now).account;
  assert.equal(A.accessProblem(done, q, { side: 'buy' }, now), null);
  // A 專業投資人: neither of 槓反's four ways nor the checklist.
  const pro = { ...SA.newAccount(1_000_000, now - DAY, 'pro'), events: [{ id: 'p', type: 'access', key: 'pro', t: now - DAY, from: now - DAY, until: now + 300 * DAY }] };
  assert.deepEqual(A.accessNeeds(pro, 'leveraged', {}, now), []);
  const lev = A.applyAccess(pro, 'leveraged', { docs: ['leveragedRisk'] }, now).account;
  assert.equal(A.accessProblem(lev, q, { side: 'buy' }, now), null);
});

test('the futures account: 入金 from settled NT$, futures trade from it alone, 出金 what the margins leave', () => {
  const sym = 'MTX202611.TF';
  const fq = (price, t = now) => ({ symbol: sym, name: '小台指 11月', kind: 'fut', market: 'TAIFEX', currency: 'TWD', price, prev: price, got: t, marketTime: t, tz: 'Asia/Taipei', margin: [100_000, 80_000], session: { start: t - 3_600_000, end: t + 3_600_000 } });
  let acc = SA.newAccount(1_000_000, now - DAY, 'fx1');
  acc = { ...acc, events: [...acc.events, { id: 'kyc', type: 'access', key: 'kyc', t: now - DAY, from: now - DAY, until: now + 300 * DAY, level: 'aggressive', maxRR: 5 }, { id: 'fa', type: 'access', key: 'futures', t: now - DAY, from: now - DAY }] };
  const order = (a, side, qty, t = now) => SA.placeOrder(a, { type: 'market', side, qty }, { quote: fq(20_000, t), rates: { TWD: 1 }, valuation: ok, now: t, id: `f${side}${qty}${t}` });
  // Nothing in the futures account: no margin for a contract, whatever the NT$.
  assert.equal(order(acc, 'buy', 1).error, 'funds');
  assert.equal(SA.futTransfer(acc, 2_000_000, { now }).error, 'funds');
  const inn = SA.futTransfer(acc, 150_000, { now });
  assert.equal(inn.error, undefined);
  acc = inn.account;
  let s = SA.replay(acc, now);
  assert.equal(s.cash.TWD, 1_000_000);
  assert.equal(SA.available(acc, s).cash.TWD, 850_000);
  assert.equal(SA.available(acc, s).fut, 150_000);
  const b = order(acc, 'buy', 1);
  assert.equal(b.error, undefined);
  assert.ok(b.fill);
  acc = b.account;
  assert.equal(order(acc, 'buy', 1, now + 60_000).error, 'funds', 'a second contract: 100,000 more than is free');
  // 出金: what the margin leaves, less an open loss.
  const v = SA.valuate(SA.replay(acc, now), new Map([[sym, fq(19_900)]]), { TWD: 1 });
  s = SA.replay(acc, now);
  const free = SA.available(acc, s).fut;
  assert.equal(v.futCash, s.futCash);
  assert.ok(v.futTWD < 0);
  assert.equal(SA.futWithdrawable(acc, v, now), Math.floor(free + v.futTWD));
  assert.equal(SA.futTransfer(acc, -(free + 1), { valuation: v, now }).error, 'futOut');
  const out = SA.futTransfer(acc, -10_000, { valuation: v, now });
  assert.equal(out.error, undefined);
  // The call is on the futures account's money: 權益數 under maintenance.
  const fall = SA.valuate(SA.replay(out.account, now), new Map([[sym, fq(18_500)]]), { TWD: 1 });
  assert.equal(fall.futCall, true);
  assert.equal(fall.netWorth, 1_000_000 - (b.fill.total - b.fill.gross) + fall.futTWD, 'all of it is still the account\'s');
  // No futures account, no 入金.
  assert.equal(SA.futTransfer(SA.newAccount(1_000_000, now - DAY, 'x'), 1000, { now }).error, 'accessNeeded');
});

test('the futures account: an account from before keeps its positions, their margin moved in at the split', () => {
  const sym = 'MTX202611.TF';
  const t0 = at('2026-10-21T10:00:00');
  const acc = SA.newAccount(500_000, t0 - DAY, 'old');
  acc.events.push({ id: 'ff', type: 'fill', t: t0, side: 'buy', symbol: sym, name: '小台指', kind: 'fut', market: 'TAIFEX', currency: 'TWD', qty: 2, price: 20_000, gross: 2_000_000, total: 2_000_100, commission: 50, tax: 50, fee: 0, im: 100_000 });
  const before = SA.replay(acc, t0 + 60_000);
  assert.equal(before.futSplit, false);
  assert.equal(SA.available(acc, before).cash.TWD, before.cash.TWD - 200_000);
  const after = SA.replay(acc, now);
  assert.equal(after.futSplit, true);
  assert.equal(after.futCash, 200_000);
  assert.equal(SA.available(acc, after).cash.TWD, after.cash.TWD - 200_000);
  assert.equal(SA.available(acc, after).fut, 0);
  // Closed: its gain into the futures account.
  const sold = { ...acc, events: [...acc.events, { id: 'fs', type: 'fill', t: now, side: 'sell', symbol: sym, name: '小台指', kind: 'fut', market: 'TAIFEX', currency: 'TWD', qty: 2, price: 20_100, gross: 2_010_000, total: 2_009_900, commission: 50, tax: 50, fee: 0 }] };
  const end = SA.replay(sold, now + 1);
  assert.equal(end.futCash, 200_000 + 2 * 100 * 50 - 100);
  assert.equal(SA.available(sold, end).fut, end.futCash);
});

test('the pool counts 入金 and 出金 as moving nothing', async () => {
  const t = Date.now();
  let acc = SA.newAccount(500_000, t - 10 * DAY, 'pool');
  acc = { ...acc, events: [...acc.events, { id: 'fa', type: 'access', key: 'futures', t: t - 5 * DAY, from: t - 5 * DAY }, { id: 'futx:1', type: 'futx', t: t - 3_600_000, currency: 'TWD', amount: 100_000 }] };
  const store = new Map();
  const deps = { fsGet: async (env, c, id) => ({ exists: store.has(`${c}/${id}`), data: store.get(`${c}/${id}`) }), fsWrite: async (env, c, id, v) => store.set(`${c}/${id}`, v), read: async () => ({}) };
  const r = await checkStock({}, 'pool', await pack(acc), null, deps, t - DAY / 2, t);
  assert.deepEqual(r.refused, []);
  assert.equal(r.cash, 500_000);
});
