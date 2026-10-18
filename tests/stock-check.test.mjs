import test from 'node:test';
import assert from 'node:assert/strict';
import { checkStock, checkEvent, fillPrice, VERIFIED_COLLECTION } from '../stock-check.js';
import { FILLS_COLLECTION } from '../stock-fill.js';
import { pack } from '../kit/stock-codec.mjs';

const LOCK = Date.parse('2026-10-12T09:00:00Z');
const T = Date.parse('2026-10-13T02:00:00Z');
const env = {};
// 2330.TW traded 1,000-1,010 around T (and down to 950 an hour later); US$
// at NT$32.00-32.10; no dividends.
function deps(issued = {}) {
  const store = new Map([[`${FILLS_COLLECTION}/acct`, JSON.stringify({ v: 2, fills: issued, open: {} })]]);
  return {
    store,
    fsGet: async (env, c, id) => (store.has(`${c}/${id}`) ? { exists: true, payload: store.get(`${c}/${id}`) } : { exists: false }),
    fsWrite: async (env, c, id, payload) => void store.set(`${c}/${id}`, payload),
    read: async url => {
      if (url.includes('events=div')) return { chart: { result: [{ events: {} }] } };
      const to = Number(/period2=(\d+)/.exec(url)?.[1]) * 1000;
      if (url.includes('USDTWD')) return { chart: { result: [{ timestamp: [T / 1000 - 300, T / 1000], indicators: { quote: [{ high: [32.1, 32.1], low: [32, 32], close: [32.1, 32.05] }] } }] } };
      const late = to > T + 30 * 60_000;
      return { chart: { result: [{ timestamp: [T / 1000 - 300, T / 1000, ...(late ? [T / 1000 + 3600] : [])], indicators: { quote: [{ high: [1010, 1008, ...(late ? [960] : [])], low: [1000, 1001, ...(late ? [950] : [])] }] } }] } };
    }
  };
}
const fill = (id, side, price, qty, t = T, more = {}) => ({ id: `fill:${id}`, type: 'fill', t, orderId: id, symbol: '2330.TW', name: 'TSMC', kind: 'stock', market: 'TW', currency: 'TWD', side, qty, price, quote: price, gross: price * qty, commission: 0, tax: 0, fee: 0, total: price * qty, twd: 1, ...more });
// A fill as this Worker issues it for a market order at `quote`, and the event the phone makes of it.
const issuedFill = (id, side, quote, qty, t = T) => ({ quote, t, s: '2330.TW', side, q: qty, k: 'market' });
const phoneFill = (id, side, quote, qty, t = T) => {
  const price = fillPrice({ k: 'market', side }, quote, 'TW', 'stock');
  return { ...fill(id, side, price, qty, t), quote };
};
const OPENED = T - 30 * 86_400_000;
const account = events => ({ v: 1, id: 'a', created: OPENED, events, orders: [] });
const start = [{ id: 'deposit:start', type: 'deposit', t: OPENED, currency: 'TWD', amount: 100_000 }];
const check = async (d, events, at = T + 1) => {
  // The first check: the account from before the lock-down taken as it was.
  if (!d.store.has(`${VERIFIED_COLLECTION}/acct`)) await checkStock(env, 'acct', await pack(account(start)), { entries: [] }, d, LOCK, T);
  return checkStock(env, 'acct', await pack(account([...start, ...events])), { entries: [] }, d, LOCK, at);
};

test('a fill the proxy issued counts as it is; its price, shares or symbol changed, or used twice, never', async () => {
  const d = deps({ b1: issuedFill('b1', 'buy', 1005, 10), s1: issuedFill('s1', 'sell', 1006, 10, T + 1000) });
  const buy = phoneFill('b1', 'buy', 1005, 10);
  const sell = phoneFill('s1', 'sell', 1006, 10, T + 1000);
  const forged = [
    // The issued quote, a better price.
    { ...sell, id: 'x1', price: 2000, gross: 20_000, total: 20_000 },
    // The issued order, more shares.
    { ...phoneFill('s1', 'sell', 1006, 100, T + 1000), id: 'x2' },
    // The same order filled again.
    { ...sell, id: 'x3' }
  ];
  const r = await check(d, [buy, sell, ...forged], T + 2000);
  assert.deepEqual(r.refused.sort(), ['x1', 'x2', 'x3']);
  assert.equal(r.cash, Math.round((100_000 - buy.total + sell.total) * 100) / 100);
  assert.equal(r.opened, 100_000);
});

test('a fill not issued here counts at the worst price traded since its moment: no moment picked afterwards wins', async () => {
  const d = deps();
  // Bought "at 1,000" two hours ago and sold "at 1,010": counted as bought
  // at the highest and sold at the lowest since.
  const r = await check(d, [fill('p1', 'buy', 1000, 10), fill('p2', 'sell', 1010, 10, T + 60_000)], T + 2 * 3_600_000);
  assert.ok(r.cash <= 100_000 - 10 * (1010 - 950) + 1, `${r.cash}`);
  const kept = JSON.parse(d.store.get(`${VERIFIED_COLLECTION}/acct`));
  assert.ok(kept.adj['fill:p1'] && kept.adj['fill:p2']);
});

test('the same event twice counts once; money from nowhere never counts', async () => {
  const d = deps({ b1: issuedFill('b1', 'buy', 1005, 10) });
  const buy = phoneFill('b1', 'buy', 1005, 10);
  const div = { id: 'div:x', type: 'div', t: T + 1000, ex: T - 86_400_000, symbol: '2330.TW', currency: 'TWD', shares: 10, perShare: 5000, gross: 50_000, withheld: 0, net: 50_000, twd: 1 };
  const deposit = { id: 'x:eco:fake', type: 'deposit', pool: true, t: T, currency: 'TWD', amount: 1_000_000 };
  const r = await check(d, [buy, buy, deposit, { ...div, currency: 'USD', id: 'div:usd' }], T + 2000);
  assert.equal(r.cash, 100_000 - buy.total);
  assert.ok(r.refused.includes('x:eco:fake') && r.refused.includes('div:usd'));
});

test('a purchase needs the cash; a short sale needs worth behind it', async () => {
  const d = deps({ b1: issuedFill('b1', 'buy', 1005, 200), s1: issuedFill('s1', 'sell', 1006, 500) });
  const r = await check(d, [phoneFill('b1', 'buy', 1005, 200), phoneFill('s1', 'sell', 1006, 500)], T + 2000);
  assert.deepEqual(r.refused.sort(), ['fill:b1', 'fill:s1']);
  assert.equal(r.cash, 100_000);
});

test('exchange: never above the market less the narrowest spread, so there and back loses', async () => {
  const ex = { id: 'fx:1', type: 'fx', t: T, from: 'TWD', to: 'USD', amount: 32_000, received: 1100, twdFrom: 1, twdTo: 29 };
  const d = deps();
  const r = await checkEvent(ex, account(start), null, d.read, {}, { now: T + 60_000 });
  assert.ok(r.adjust && r.adjust.received <= 32_000 / 32.05 && r.adjust.received > 990, JSON.stringify(r));
  const back = { id: 'fx:2', type: 'fx', t: T, from: 'USD', to: 'TWD', amount: r.adjust.received, received: 99_999, twdFrom: 33, twdTo: 1 };
  const r2 = await checkEvent(back, account(start), null, d.read, {}, { now: T + 60_000 });
  assert.ok(r2.adjust.received < 32_000, JSON.stringify(r2));
});

test('interest: never more than the account earned and wasn\'t paid', async () => {
  const d = deps();
  const r = await check(d, [{ id: 'int:2026-10', type: 'interest', t: T, currency: 'TWD', gross: 50_000, withheld: 0, nhi: 0, net: 50_000 }], T + 2000);
  // A month on NT$100,000 earns tens of dollars, not 50,000.
  assert.ok(r.cash > 100_000 && r.cash < 100_000 + 200, `${r.cash}`);
});

test('borrowed money stays in Securities: a loan counts against the cash the pool sees', async () => {
  const d = deps({ b1: issuedFill('b1', 'buy', 1005, 50) });
  const buy = { ...phoneFill('b1', 'buy', 1005, 50), financed: 35_000 };
  const loan = { id: 'loan:b1', type: 'borrow', t: T, currency: 'TWD', amount: 35_000, rate: 0.065, symbol: '2330.TW' };
  const twice = { ...loan, id: 'loan:b1x' };
  const r = await check(d, [buy, loan, twice], T + 2000);
  assert.ok(r.refused.includes('loan:b1x'));
  // Cash 100,000 - 50,250 + 35,000 = 84,750, less the 35,000 owed.
  assert.ok(Math.abs(r.cash - (100_000 - buy.total)) < 5, `${r.cash}`);
  assert.ok(Math.abs(r.held - buy.total) < 5, `${r.held}`);
});

test('an open order only holds money back: a negative hold adds nothing', async () => {
  const d = deps();
  await check(d, []);
  const r = await checkStock(env, 'acct', await pack({ ...account(start), orders: [{ id: 'o', status: 'open', side: 'buy', currency: 'TWD', reserve: -1_000_000 }] }), { entries: [] }, d, LOCK, T + 1);
  assert.equal(r.cash, 100_000);
});

test("an order the phone shows cancelled that the proxy filled still counts as filled; one the proxy let be cancelled doesn't", async () => {
  const order = (id, status = 'cancelled') => ({ id, status, symbol: '2330.TW', name: 'TSMC', side: 'buy', type: 'market', qty: 10, market: 'TW', kind: 'stock', currency: 'TWD', t: T - 1000, rev: 1, done: T + 500 });
  const d = deps({ b9: issuedFill('b9', 'buy', 1005, 10) });
  // Filled by the proxy, then "cancelled" by a phone that held back its ask.
  await checkStock(env, 'acct', await pack(account(start)), { entries: [] }, d, LOCK, T);
  const dodged = await checkStock(env, 'acct', await pack({ ...account(start), orders: [order('b9')] }), { entries: [] }, d, LOCK, T + 2000);
  const price = fillPrice({ k: 'market', side: 'buy' }, 1005, 'TW', 'stock');
  assert.ok(dodged.cash < 100_000 - price * 10 + 1, `the fill counted: ${dodged.cash}`);
  // A cancel the proxy ruled on (nothing reached): no fill.
  const d2 = deps({});
  d2.store.set(`${FILLS_COLLECTION}/acct`, JSON.stringify({ v: 2, fills: {}, open: {}, cancelled: { c1: T } }));
  await checkStock(env, 'acct', await pack(account(start)), { entries: [] }, d2, LOCK, T);
  const fair = await checkStock(env, 'acct', await pack({ ...account(start), orders: [order('c1')] }), { entries: [] }, d2, LOCK, T + 2000);
  assert.equal(fair.cash, 100_000);
});

test('a checked record that can\'t be read is checked again from nothing: the save is still counted, never stuck', async () => {
  const d = deps({ b1: issuedFill('b1', 'buy', 1005, 10) });
  await check(d, []);
  d.store.set(`${VERIFIED_COLLECTION}/acct`, '{not json');
  const buy = phoneFill('b1', 'buy', 1005, 10);
  const r = await checkStock(env, 'acct', await pack(account([...start, buy])), { entries: [] }, d, LOCK, T + 2000);
  assert.ok(r, 'counted');
  assert.equal(r.cash, 100_000 - buy.total);
  assert.ok(Array.isArray(JSON.parse(d.store.get(`${VERIFIED_COLLECTION}/acct`)).ok));
});
