// ---- stock-fill.js: /stock, Quadra Securities' orders filled here ----
// The owner, 2026-10-14: Securities' orders are filled by the proxy, as
// Play's bets are placed and settled by it. The phone places an order (the
// kit's placeOrder: it holds its cash or shares and waits); then it asks
// here for its open orders, and this Worker reads its own fresh quote
// (Yahoo, through the data proxy's route in place: the kit's stock-quotes
// with this Worker's reader) and decides each with the kit's own rule
// (triggerPrice: a market order now, a limit or stop once its price is
// met, the market's hours, odd lots, after-hours). What fills is kept here
// (`stock-fills/<account>`: each order's quote and moment) and answered;
// the phone applies exactly that (the kit's applyFills: the spread, costs,
// cash and shares as the account has them). When the account is saved,
// stock-check.js takes a fill this Worker issued as it is; any other fill
// is checked against the market's price bars as before (or never counts).
//
//   POST /stock { op: 'fill', orders: [order…] }  (a Securities session)
//     → { fills: { orderId: { quote, t } } }
//
// deps: { fsGet, fsWrite, read(url) -> JSON (the data proxy's route), now }.

import { fetchQuotes, useQuotesReader } from './kit/stock-quotes.mjs';
import { triggerPrice } from './kit/stock-account.mjs';

export const FILLS_COLLECTION = 'stock-fills';
const MAX_ORDERS = 40;
// What's kept of the fills issued: the newest this many, this long.
const KEEP = 400;
const KEEP_MS = 60 * 86_400_000;
const ID = /^[A-Za-z0-9:_-]{4,64}$/;
const SYMBOL = /^[A-Za-z0-9.^=\-&]{1,24}$/;

// An order as the phone hands it: what deciding it needs, nothing else.
export function cleanOrder(o) {
  if (!o || !ID.test(String(o.id)) || !SYMBOL.test(String(o.symbol))) return null;
  if (o.side !== 'buy' && o.side !== 'sell') return null;
  if (!['market', 'limit', 'stop'].includes(o.type)) return null;
  const n = x => (Number.isFinite(Number(x)) ? Number(x) : undefined);
  return { id: String(o.id), symbol: String(o.symbol), side: o.side, type: o.type, qty: n(o.qty), limit: n(o.limit), stop: n(o.stop), t: n(o.t), after: n(o.after), market: String(o.market || ''), kind: String(o.kind || '') };
}

// The orders' fills now: { orderId: { quote, t } } for those whose price is met.
export async function decideFills(orders, { read, now = Date.now() }) {
  useQuotesReader(url => read(url));
  const symbols = [...new Set(orders.map(o => o.symbol))];
  const quotes = await fetchQuotes(symbols);
  const fills = {};
  for (const o of orders) {
    const q = quotes.get(o.symbol);
    const price = q ? triggerPrice(o, q, now) : null;
    if (Number.isFinite(price) && price > 0) fills[o.id] = { quote: price, t: now };
  }
  return fills;
}

// The fills issued for an account (stock-check.js reads them).
export async function issuedFills(env, account, fsGet) {
  const doc = await fsGet(env, FILLS_COLLECTION, account).catch(() => null);
  try {
    return doc?.exists ? JSON.parse(doc.payload) : {};
  } catch {
    return {};
  }
}

export async function handleStock(request, env, headers, session, deps) {
  const { json, errorJson } = deps;
  if (!session || session.a !== 'stock') return errorJson('ECO_TOKEN_INVALID', 401, headers, request);
  if (request.method !== 'POST') return json({ error: { message: 'POST only' } }, 405, headers);
  let body;
  try {
    body = JSON.parse(await request.text());
  } catch {
    return json({ error: { message: 'Bad body' } }, 400, headers);
  }
  if (body?.op !== 'fill') return json({ error: { message: 'Unknown op' } }, 400, headers);
  const orders = (Array.isArray(body.orders) ? body.orders : []).slice(0, MAX_ORDERS).map(cleanOrder).filter(Boolean);
  if (!orders.length) return json({ fills: {} }, 200, headers);
  const now = deps.now();
  // An order filled before keeps that fill (asked again, the same answer).
  const had = await issuedFills(env, session.d, deps.fsGet);
  const fresh = await decideFills(orders.filter(o => !had[o.id]), { read: deps.read, now }).catch(() => ({}));
  const fills = Object.fromEntries(orders.filter(o => had[o.id]).map(o => [o.id, had[o.id]]));
  Object.assign(fills, fresh);
  if (Object.keys(fresh).length) {
    const all = Object.entries({ ...had, ...fresh })
      .filter(([, f]) => now - f.t < KEEP_MS)
      .sort((a, b) => b[1].t - a[1].t)
      .slice(0, KEEP);
    await deps.fsWrite(env, FILLS_COLLECTION, session.d, JSON.stringify(Object.fromEntries(all)));
  }
  return json({ fills }, 200, headers);
}
