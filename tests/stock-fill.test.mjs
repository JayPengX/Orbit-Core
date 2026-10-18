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

// A market that moves: the quote now (`price`) and 5-minute bars since the
// order was placed ([offset minutes, open, high, low, close]).
const moving = (price, bars, at) => async url => {
  if (!bars && url.includes('/v8/finance/chart')) throw new Error('unavailable');
  bars ||= [];
  const meta = { symbol: 'AAPL', regularMarketPrice: price, chartPreviousClose: 250, currency: 'USD', instrumentType: 'EQUITY', exchangeTimezoneName: 'America/New_York', regularMarketTime: at / 1000 - 30, regularMarketDayHigh: Math.max(price, ...bars.map(b => b[2])), regularMarketDayLow: Math.min(price, ...bars.map(b => b[3])), currentTradingPeriod: { regular: { start: Date.parse('2026-10-13T13:30:00Z') / 1000, end: Date.parse('2026-10-13T20:00:00Z') / 1000 } } };
  if (url.includes('/v7/finance/spark')) return { spark: { result: [{ symbol: 'AAPL', response: [{ meta, timestamp: [], indicators: { quote: [{ close: [] }] } }] }] } };
  const q = { open: bars.map(b => b[1]), high: bars.map(b => b[2]), low: bars.map(b => b[3]), close: bars.map(b => b[4]), volume: bars.map(() => 100) };
  return { chart: { result: [{ meta, timestamp: bars.map(b => (now + b[0] * 60_000) / 1000), indicators: { quote: [q] } }] } };
};
// Placed at `now` (price 250), then asked for again 30 minutes later.
async function askLater(order, price, bars) {
  const docs = new Map();
  let at = now;
  let reader = moving(250, [], now);
  const deps = {
    json: (data, status) => new Response(JSON.stringify(data), { status }),
    errorJson: (code, status) => new Response(JSON.stringify({ error: { code } }), { status }),
    fsGet: async (env, c, id) => (docs.has(`${c}/${id}`) ? { exists: true, payload: docs.get(`${c}/${id}`) } : { exists: false }),
    fsWrite: async (env, c, id, payload) => void docs.set(`${c}/${id}`, payload),
    now: () => at,
    read: url => reader(url)
  };
  const ask = () => handleStock(new Request('https://x/stock', { method: 'POST', body: JSON.stringify({ op: 'fill', orders: [order] }) }), {}, {}, { a: 'stock', d: 'acc' }, deps).then(r => r.json());
  const first = await ask();
  assert.deepEqual(first.fills, {}, 'not met when placed');
  at = now + 30 * 60_000;
  reader = moving(price, bars, at);
  return (await ask()).fills[order.id];
}
const limitBuy = { id: 'order0100', symbol: 'AAPL', side: 'buy', type: 'limit', limit: 249, qty: 1, t: now, market: 'US', kind: 'stock', currency: 'USD' };

test('a phone that waits to ask until the price has fallen past its limit gets its limit, at the moment it was reached', async () => {
  // 250 → through 249 at the 10-minute bar → 240 now.
  const bars = [[0, 250, 250.4, 249.6, 250], [5, 250, 250.2, 249.5, 249.7], [10, 249.6, 249.7, 246, 246.5], [15, 246.5, 246.6, 242, 242.5], [20, 242.5, 242.6, 240, 240.2], [25, 240.2, 240.4, 239.8, 240]];
  const fill = await askLater(limitBuy, 240, bars);
  assert.deepEqual(fill, { quote: 249, t: now + 10 * 60_000 }, 'the limit when the price reached it, not 240 now');
  // A gap through it: the bar's open, as a real order.
  const gap = await askLater(limitBuy, 240, [[0, 250, 250.4, 249.6, 250], [5, 247, 247.5, 245, 246], [10, 246, 246, 240, 240]]);
  assert.deepEqual(gap, { quote: 247, t: now + 5 * 60_000 });
});

test('a limit or stop the price passed while the phone was away fills, though the price came back', async () => {
  const dip = [[0, 250, 250.4, 249.6, 250], [5, 250, 250.1, 247, 248], [10, 248, 255, 248, 254.5], [15, 254.5, 256, 254, 255]];
  assert.deepEqual(await askLater(limitBuy, 255, dip), { quote: 249, t: now + 5 * 60_000 });
  // A stop to sell at 248: met in the dip, filled there (not left open while the phone waits).
  const stop = { ...limitBuy, id: 'order0101', side: 'sell', type: 'stop', stop: 248, limit: undefined };
  assert.deepEqual(await askLater(stop, 255, dip), { quote: 248, t: now + 5 * 60_000 });
});

test('a limit the quote has met but no bar has yet fills at its limit, not the price now', async () => {
  assert.deepEqual(await askLater(limitBuy, 240, [[0, 250, 250.4, 249.6, 250], [5, 250, 250.1, 249.5, 249.6]]), { quote: 249, t: now + 30 * 60_000 });
  // Bars that can't be read: the same.
  const fill = await askLater(limitBuy, 240, null);
  assert.deepEqual(fill, { quote: 249, t: now + 30 * 60_000 });
});

test('the phone asks about a waiting order at once when it matters, else every 10 minutes', async () => {
  const { fillAskDue, FILL_ASK_EVERY } = await import('../kit/stock-account.mjs');
  const session = { start: Date.parse('2026-10-13T13:30:00Z'), end: Date.parse('2026-10-13T20:00:00Z') };
  const quote = price => ({ price, session });
  const buy = { side: 'buy', type: 'limit', limit: 240 };
  const asked = now - 60_000;
  assert.equal(fillAskDue(buy, quote(250), undefined, now), true, 'not asked about yet');
  assert.equal(fillAskDue(buy, quote(250), asked, now), false, '4% away, asked a minute ago');
  assert.equal(fillAskDue(buy, quote(250), now - FILL_ASK_EVERY, now), true, 'every 10 minutes');
  assert.equal(fillAskDue(buy, quote(242), asked, now), true, 'within 1%');
  assert.equal(fillAskDue(buy, quote(239), asked, now), true, 'met');
  assert.equal(fillAskDue({ side: 'sell', type: 'stop', stop: 245 }, quote(247), asked, now), true);
  assert.equal(fillAskDue({ side: 'sell', type: 'stop', stop: 245 }, quote(250), asked, now), false);
  assert.equal(fillAskDue({ side: 'buy', type: 'market' }, quote(250), session.start - 60_000, session.start + 1000), true, 'a session begun since');
  // Over an hour of 45-second refreshes, a limit 4% away: 6 asks, not 80.
  let last = 0;
  let asks = 0;
  for (let t = now; t < now + 3_600_000; t += 45_000) if (fillAskDue(buy, quote(250), last, t)) (asks++, (last = t));
  assert.equal(asks, 6);
});

test('net worth by day in one pass is each day\'s replay exactly (a loan, a short, a dividend owed, cash in two currencies)', async () => {
  const { newAccount, netWorthSeries, replay } = await import('../kit/stock-account.mjs');
  const DAY = 86_400_000;
  const created = now - 60 * DAY;
  const a = newAccount(undefined, created, 'nw');
  const fill = (id, t, symbol, side, qty, price, currency = 'USD') => ({ id, type: 'fill', t, symbol, name: symbol, kind: 'stock', market: currency === 'USD' ? 'US' : 'TW', currency, side, qty, price, gross: price * qty, commission: 0, tax: 0, fee: 0, total: price * qty, twd: currency === 'USD' ? 32 : 1 });
  a.events.push(
    { id: 'fx1', type: 'fx', t: created + DAY, from: 'TWD', to: 'USD', amount: 32_000, received: 1000 },
    fill('b1', created + 2 * DAY, 'AAPL', 'buy', 3, 200),
    { id: 'loan1', type: 'borrow', t: created + 5 * DAY, currency: 'USD', amount: 500, rate: 0.07 },
    fill('s1', created + 9 * DAY, 'TSLA', 'sell', 2, 300),
    fill('b2', created + 12 * DAY, '2330.TW', 'buy', 10, 1000, 'TWD'),
    { id: 'div1', type: 'div', t: created + 40 * DAY, ex: created + 20 * DAY, symbol: 'AAPL', currency: 'USD', net: 3, gross: 3, withheld: 0, twd: 32, shares: 3, perShare: 1 },
    { id: 'rp1', type: 'repay', t: created + 30 * DAY, currency: 'USD', amount: 200 }
  );
  const days = [created - DAY];
  for (let d = created + DAY / 2; d < now; d += DAY) days.push(d);
  const priceAt = (s, t) => 100 + ((t / DAY) % 7);
  const rateAt = (c, t) => (c === 'TWD' ? 1 : 31 + ((t / DAY) % 3));
  const series = netWorthSeries(a, days, priceAt, rateAt);
  assert.equal(series.length, days.length - 1);
  for (const [t, nw, dep] of series) {
    const s = replay(a, t);
    let want = s.receivable;
    for (const [c, v] of Object.entries(s.cash)) want += v * rateAt(c, t);
    for (const p of Object.values(s.positions)) want += p.qty * priceAt(p.symbol, t) * rateAt(p.currency, t) - p.borrowFee * rateAt(p.currency, t);
    for (const l of Object.values(s.loans)) want -= l.balance * rateAt(l.currency, t);
    assert.ok(Math.abs(nw - want) < 1e-6, `${t}: ${nw} vs ${want}`);
    assert.equal(dep, s.deposits);
  }
});

// A cancel asked of the proxy, `at` minutes after it was first seen, the price moving as `bars` say.
async function cancelLater(order, price, bars) {
  const docs = new Map();
  let at = now;
  let reader = moving(250, [], now);
  const deps = {
    json: (data, status) => new Response(JSON.stringify(data), { status }),
    errorJson: (code, status) => new Response(JSON.stringify({ error: { code } }), { status }),
    fsGet: async (env, c, id) => (docs.has(`${c}/${id}`) ? { exists: true, payload: docs.get(`${c}/${id}`) } : { exists: false }),
    fsWrite: async (env, c, id, payload) => void docs.set(`${c}/${id}`, payload),
    now: () => at,
    read: url => reader(url)
  };
  const ask = body => handleStock(new Request('https://x/stock', { method: 'POST', body: JSON.stringify(body) }), {}, {}, { a: 'stock', d: 'acc' }, deps).then(r => r.json());
  assert.deepEqual((await ask({ op: 'fill', orders: [order] })).fills, {}, 'not met when placed');
  at = now + 30 * 60_000;
  reader = moving(price, bars, at);
  const cancel = await ask({ op: 'cancel', order });
  at = now + 60 * 60_000;
  const later = await ask({ op: 'fill', orders: [order] });
  return { cancel, later: later.fills[order.id] || null };
}

test('a cancel is the proxy\'s to rule on: an order the price reached since it last looked is filled, not cancelled; one never reached is cancelled for good', async () => {
  // 250 → through the 249 limit at the 10-minute bar → 240: the phone held back its ask, then cancelled.
  const through = [[0, 250, 250.4, 249.6, 250], [5, 250, 250.2, 249.5, 249.7], [10, 249.6, 249.7, 246, 246.5], [20, 242.5, 242.6, 240, 240.2]];
  const dodged = await cancelLater(limitBuy, 240, through);
  assert.deepEqual(dodged.cancel, { fill: { quote: 249, t: now + 10 * 60_000 } });
  // Never reached: cancelled, and no fill later however the price moves.
  const never = await cancelLater({ ...limitBuy, id: 'order0102' }, 252, [[0, 250, 250.4, 249.6, 250], [10, 250, 252, 249.5, 252]]);
  assert.deepEqual(never.cancel, { cancelled: true });
  assert.equal(never.later, null);
});

test('two asks at once never lose each other\'s fills: the second merges into the first\'s copy', async () => {
  const { fakeD1 } = await import('./fake-d1.mjs');
  const { d1Store, SCHEMA } = await import('../doc-store.js');
  const store = d1Store(fakeD1(SCHEMA));
  const deps = {
    json: (data, status) => new Response(JSON.stringify(data), { status }),
    errorJson: (code, status) => new Response(JSON.stringify({ error: { code } }), { status }),
    fsGet: (env, c, id) => store.get(c, id),
    fsWrite: (env, c, id, payload, pre) => store.write(c, id, payload, pre),
    now: () => now,
    read
  };
  const ask = body => handleStock(new Request('https://x/stock', { method: 'POST', body: JSON.stringify(body) }), {}, {}, { a: 'stock', d: 'acc' }, deps).then(r => r.json());
  const order = id => ({ id, symbol: 'AAPL', side: 'buy', type: 'market', qty: 1, t: now - 1000, market: 'US', kind: 'stock' });
  const waits = { id: 'order0009', symbol: 'AAPL', side: 'buy', type: 'limit', limit: 200, qty: 1, t: now - 1000, market: 'US', kind: 'stock' };
  const [a, b, c] = await Promise.all([ask({ op: 'fill', orders: [order('order0001')] }), ask({ op: 'fill', orders: [order('order0002'), waits] }), ask({ op: 'cancel', order: { ...waits, id: 'order0010' } })]);
  assert.ok(a.fills.order0001 && b.fills.order0002);
  assert.deepEqual(c, { cancelled: true });
  const kept = JSON.parse((await store.get(FILLS_COLLECTION, 'acc')).payload);
  assert.deepEqual(Object.keys(kept.fills).sort(), ['order0001', 'order0002']);
  assert.deepEqual(Object.keys(kept.open), ['order0009']);
  assert.ok(kept.cancelled.order0010);
});
