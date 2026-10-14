// Quadra Securities' orders filled by the proxy (stock-fill.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { decideFills, handleStock, cleanOrder, FILLS_COLLECTION } from '../stock-fill.js';
import { checkEvent } from '../stock-check.js';
import { applyFills } from '../kit/stock-account.mjs';

// A Tuesday afternoon in New York.
const now = Date.parse('2026-10-13T18:00:00Z');
const spark = (symbol, price) => ({
  spark: { result: [{ symbol, response: [{ meta: { symbol, regularMarketPrice: price, chartPreviousClose: price - 1, currency: 'USD', instrumentType: 'EQUITY', exchangeTimezoneName: 'America/New_York', regularMarketTime: now / 1000 - 30, regularMarketDayHigh: price + 2, regularMarketDayLow: price - 2, currentTradingPeriod: { regular: { start: Date.parse('2026-10-13T13:30:00Z') / 1000, end: Date.parse('2026-10-13T20:00:00Z') / 1000 } } }, timestamp: [], indicators: { quote: [{ close: [] }] } }] }] }
});
const read = async url => spark(decodeURIComponent(/symbols=([^&]+)/.exec(url)[1]).split(',')[0], 250);

test('the proxy fills at its own quote: a market order now, a limit met, a limit not met waits', async () => {
  const orders = [
    { id: 'order0001', symbol: 'AAPL', side: 'buy', type: 'market', qty: 1, t: now - 1000, market: 'US', kind: 'stock' },
    { id: 'order0002', symbol: 'AAPL', side: 'buy', type: 'limit', limit: 260, qty: 1, t: now - 1000, market: 'US', kind: 'stock' },
    { id: 'order0003', symbol: 'AAPL', side: 'buy', type: 'limit', limit: 200, qty: 1, t: now - 1000, market: 'US', kind: 'stock' }
  ].map(cleanOrder);
  const { fills } = await decideFills(orders, { read, now });
  assert.deepEqual(fills, { order0001: { quote: 250, t: now }, order0002: { quote: 250, t: now } });
});

test('/stock: a Securities session only; what it filled is kept and answered the same when asked again', async () => {
  const docs = new Map();
  const deps = {
    json: (data, status) => new Response(JSON.stringify(data), { status }),
    errorJson: (code, status) => new Response(JSON.stringify({ error: { code } }), { status }),
    fsGet: async (env, c, id) => (docs.has(`${c}/${id}`) ? { exists: true, payload: docs.get(`${c}/${id}`) } : { exists: false }),
    fsWrite: async (env, c, id, payload) => void docs.set(`${c}/${id}`, payload),
    now: () => now,
    read
  };
  const ask = (session, orders) => handleStock(new Request('https://x/stock', { method: 'POST', body: JSON.stringify({ op: 'fill', orders }) }), {}, {}, session, deps);
  const order = { id: 'order0001', symbol: 'AAPL', side: 'buy', type: 'market', qty: 1, t: now - 1000, market: 'US', kind: 'stock' };
  assert.equal((await ask({ a: 'odds', d: 'acc' }, [order])).status, 401);
  const first = await (await ask({ a: 'stock', d: 'acc' }, [order])).json();
  assert.deepEqual(first.fills.order0001, { quote: 250, t: now });
  deps.now = () => now + 60_000;
  const again = await (await ask({ a: 'stock', d: 'acc' }, [order])).json();
  assert.deepEqual(again.fills.order0001, { quote: 250, t: now }, 'the same fill, not a new one');
  const kept = JSON.parse(docs.get(`${FILLS_COLLECTION}/acc`));
  assert.deepEqual({ ...kept.fills.order0001, seen: 0 }, { quote: 250, t: now, s: 'AAPL', side: 'buy', q: 1, k: 'market', seen: 0 });
});

test('/stock: an order\'s terms and moment are the ones first seen: dated back or changed later, nothing changes', async () => {
  const docs = new Map();
  let at = now;
  const deps = {
    json: (data, status) => new Response(JSON.stringify(data), { status }),
    errorJson: (code, status) => new Response(JSON.stringify({ error: { code } }), { status }),
    fsGet: async (env, c, id) => (docs.has(`${c}/${id}`) ? { exists: true, payload: docs.get(`${c}/${id}`) } : { exists: false }),
    fsWrite: async (env, c, id, payload) => void docs.set(`${c}/${id}`, payload),
    now: () => at,
    read
  };
  const ask = orders => handleStock(new Request('https://x/stock', { method: 'POST', body: JSON.stringify({ op: 'fill', orders }) }), {}, {}, { a: 'stock', d: 'acc' }, deps).then(r => r.json());
  // A limit at 249 (the price is 250, its day's low 248), dated to yesterday
  // to claim the day's low: seen now, so only today's price counts.
  const order = { id: 'order0009', symbol: 'AAPL', side: 'buy', type: 'limit', limit: 249, qty: 1, t: now - 86_400_000, market: 'US', kind: 'stock', currency: 'USD' };
  assert.deepEqual((await ask([order])).fills, {});
  // Asked again with the limit raised: still 249.
  at = now + 60_000;
  assert.deepEqual((await ask([{ ...order, limit: 300 }])).fills, {});
  const kept = JSON.parse(docs.get(`${FILLS_COLLECTION}/acc`));
  assert.equal(kept.open.order0009.limit, 249);
  assert.equal(kept.open.order0009.t, now);
});

test('the account check takes a fill the proxy issued as it is, and refuses one at another price', async () => {
  const fill = { id: 'fill:o1', type: 'fill', orderId: 'o1', t: now, symbol: 'AAPL', market: 'US', kind: 'stock', side: 'buy', qty: 1, price: 250.03, quote: 250, gross: 250.03, total: 251 };
  const noBars = async () => null;
  assert.equal(await checkEvent(fill, { events: [] }, null, noBars, { o1: { quote: 250, t: now } }, { now }), 'ok');
  assert.equal(await checkEvent({ ...fill, quote: 240, price: 240.02, gross: 240.02, total: 241 }, { events: [] }, null, noBars, { o1: { quote: 250, t: now } }, { now }), 'bad');
});

test('applyFills: an open order filled at the proxy\'s quote and moment, the account\'s own costs; another left open', async () => {
  const { newAccount, placeOrder, replay } = await import('../kit/stock-account.mjs');
  const quote = { symbol: 'AAPL', name: 'Apple', kind: 'stock', market: 'US', currency: 'USD', price: 250, got: now, session: { start: Date.parse('2026-10-13T13:30:00Z'), end: Date.parse('2026-10-13T20:00:00Z') }, marketTime: now - 30_000, tz: 'America/New_York' };
  let account = newAccount(undefined, now - 86_400_000);
  if (!account) return;
  account = { ...account, events: [...account.events, { id: 'dep', type: 'deposit', t: now - 3600_000, currency: 'USD', amount: 10_000 }] };
  const rates = { USD: 32, TWD: 1 };
  const a = placeOrder(account, { symbol: 'AAPL', side: 'buy', type: 'limit', limit: 251, qty: 1, fresh: true }, { quote, rates, now });
  const b = placeOrder(a.account, { symbol: 'AAPL', side: 'buy', type: 'limit', limit: 200, qty: 1, fresh: true }, { quote, rates, now: now + 1 });
  const r = applyFills(b.account, { [a.order.id]: { quote: 250, t: now + 5000 } }, rates, now + 6000);
  assert.equal(r.filled.length, 1);
  assert.equal(r.filled[0].quote, 250);
  assert.equal(r.filled[0].t, now + 5000);
  assert.equal(r.account.orders.find(o => o.id === b.order.id).status, 'open');
  assert.ok(replay(r.account, now + 6000).positions.AAPL?.qty === 1);
});
