import test from 'node:test';
import assert from 'node:assert/strict';
import { checkStock, VERIFIED_COLLECTION } from '../stock-check.js';
import { pack } from '../kit/stock-codec.mjs';

const LOCK = Date.parse('2026-10-12T09:00:00Z');
const T = Date.parse('2026-10-13T02:00:00Z');
const env = {};
function deps() {
  const store = new Map();
  return {
    store,
    fsGet: async (env, c, id) => (store.has(`${c}/${id}`) ? { exists: true, payload: store.get(`${c}/${id}`) } : { exists: false }),
    fsWrite: async (env, c, id, payload) => void store.set(`${c}/${id}`, payload),
    // 2330.TW traded 1,000-1,010 around T; no dividends.
    read: async url => {
      if (url.includes('events=div')) return { chart: { result: [{ events: {} }] } };
      return { chart: { result: [{ timestamp: [T / 1000 - 300, T / 1000], indicators: { quote: [{ high: [1010, 1008], low: [1000, 1001] }] } }] } };
    }
  };
}
const fill = (id, side, price, qty, t = T) => ({ id, type: 'fill', t, orderId: id, symbol: '2330.TW', name: 'TSMC', kind: 'stock', market: 'TW', currency: 'TWD', side, qty, price, gross: price * qty, commission: 0, tax: 0, fee: 0, total: price * qty, twd: 1 });
const account = events => ({ v: 1, id: 'a', created: 0, events, orders: [] });

test('Securities\' cash is the Worker\'s count: honest trades count, forged ones never reach the pool', async () => {
  const d = deps();
  const before = [{ id: 'deposit:start', type: 'deposit', t: 1, currency: 'TWD', amount: 100_000 }];
  // The first check after the lock-down: the account from before taken as it was.
  const first = await checkStock(env, 'acct', await pack(account(before)), { entries: [] }, d, LOCK, T);
  assert.equal(first.cash, 100_000);
  const events = [
    ...before,
    fill('buy1', 'buy', 1005, 10, T - 60_000),
    // Sold at 2,000 when it traded at 1,000-1,010: never counted.
    fill('sell1', 'sell', 2000, 10, T),
    // Money from nowhere: a dividend Yahoo never paid, a deposit the pool never sent.
    { id: 'div:x', type: 'div', t: T, ex: T - 86_400_000, symbol: '2330.TW', currency: 'TWD', shares: 10, perShare: 5000, gross: 50_000, withheld: 0, net: 50_000, twd: 1 },
    { id: 'x:eco:fake', type: 'deposit', pool: true, t: T, currency: 'TWD', amount: 1_000_000 }
  ];
  const r = await checkStock(env, 'acct', await pack(account(events)), { entries: [] }, d, LOCK, T + 1);
  assert.equal(r.cash, 100_000 - 10_050);
  assert.deepEqual(r.refused.sort(), ['div:x', 'sell1', 'x:eco:fake'].sort());
  assert.equal(r.held, 10_050);
  // An honest sale counts.
  const ok = await checkStock(env, 'acct', await pack(account([...events, fill('sell2', 'sell', 1006, 10, T)])), { entries: [] }, d, LOCK, T + 2);
  assert.equal(ok.cash, 100_000 - 10_050 + 10_060);
  assert.ok(d.store.has(`${VERIFIED_COLLECTION}/acct`));
});
