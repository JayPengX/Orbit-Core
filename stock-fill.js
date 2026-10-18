// ---- stock-fill.js: /stock, Quadra Securities' orders filled here ----
// The owner, 2026-10-14: Securities' orders are filled by the proxy, as
// Play's bets are placed and settled by it. The phone places an order (the
// kit's placeOrder: it holds its cash or shares and waits); then it asks
// here for its open orders, and this Worker decides each with the kit's own
// rule (triggerPrice: a market order now, a limit or stop once its price is
// met, the market's hours, odd lots, after-hours) on its own fresh quote
// (Yahoo, through the data proxy's route in place: the kit's stock-quotes
// with this Worker's reader). The phone applies exactly that (the kit's
// applyFills: the spread, costs, cash and shares as the account has them).
//
// Nothing about an order is the phone's to change once it's here (the
// money lock-down, 2026-10-14): the first time this Worker sees an order it
// keeps its terms (symbol, side, quantity, type, limit, stop) and the
// moment it saw it, which stands for when it was placed (a phone can't date
// an order into the past to catch a price that already happened). After its
// first look, an order is filled from the price bars since it was last
// looked at (the kit's backfillPrice: the first bar that reached its price,
// at its terms), so when the phone asks makes no difference. What
// fills is kept with those terms and the NT$ rate of its currency
// (`stock-fills/<account>`); stock-check.js counts a fill only when it
// matches one issued here.
//
// A monthly plan (定期定額) is kept the same way: its terms (symbol, day,
// amount) and the moment first seen; each month's buy that falls due after
// that is filled here at the first price on or after its day (the price
// bars' open; a Taiwan stock's from the odd-lot session's first match, as a
// limit order: the kit's planFillBar, planOrderType) and that moment's NT$
// rate, as the order `plan:<id>:<month>`.
//
//   POST /stock { op: 'fill', orders: [order…], plans: [plan…] }  (a Securities session)
//     → { fills: { orderId: { quote, t, twd } } }
//
// deps: { fsGet, fsWrite, read(url) -> JSON (the data proxy's route), now }.

import { fetchQuotes, fetchBars, fxSymbol, useQuotesReader } from './kit/stock-quotes.mjs';
import { triggerPrice, backfillPrice, closingMatch, planRuns, planOrderId, planFillBar, planOrderType, planAllowed, PLAN_DAY_MAX } from './kit/stock-account.mjs';
import { ipoUrls, parseIpoList, ipoOpen, ipoDrawn, ipoWon, ipoDrawKey } from './kit/stock-ipo.mjs';
import { tokenSecret } from './quadra-token.js';
import { parseDoc, changeDoc } from './doc-store.js';
import { bodyText } from './http.js';

export const FILLS_COLLECTION = 'stock-fills';
const MAX_ORDERS = 40;
// What's kept of the fills issued: the newest this many, this long; an
// order waiting is kept as long as a good-till-cancelled one lasts.
const KEEP = 400;
const KEEP_MS = 60 * 86_400_000;
const OPEN_MS = 35 * 86_400_000;
const ID = /^[A-Za-z0-9:_-]{4,64}$/;
const SYMBOL = /^[A-Za-z0-9.^=\-&]{1,24}$/;
const CURRENCY = /^[A-Z]{3}$/;

// An order as the phone hands it: what deciding it needs, nothing else.
export function cleanOrder(o) {
  if (!o || !ID.test(String(o.id)) || !SYMBOL.test(String(o.symbol))) return null;
  if (o.side !== 'buy' && o.side !== 'sell') return null;
  if (!['market', 'limit', 'stop'].includes(o.type)) return null;
  const n = x => (x != null && Number.isFinite(Number(x)) ? Number(x) : undefined);
  if (!(n(o.qty) > 0)) return null;
  const currency = CURRENCY.test(String(o.currency)) ? String(o.currency) : undefined;
  return { id: String(o.id), symbol: String(o.symbol), side: o.side, type: o.type, qty: n(o.qty), limit: n(o.limit), stop: n(o.stop), t: n(o.t), after: n(o.after), expires: n(o.expires), market: String(o.market || ''), kind: String(o.kind || ''), currency };
}

// The kept document: { v: 2, fills: { id: fill }, open: { id: terms },
// plans: { id: [terms…] }, cancelled, ipo: { key: t }, ipoFrom: { key:
// account } } (before v2, the fills alone). `ipoFrom`: an application made
// on a pass since merged into this one, drawn as that pass's (the draw is
// keyed to the account it was made under: here it would be another draw).
export const readBook = doc => bookOf(parseDoc(doc));
function bookOf(raw) {
  if (raw?.v === 2) return { v: 2, fills: raw.fills || {}, open: raw.open || {}, plans: raw.plans || {}, cancelled: raw.cancelled || {}, ipo: raw.ipo || {}, ipoFrom: raw.ipoFrom || {} };
  return { v: 2, fills: raw && typeof raw === 'object' ? raw : {}, open: {}, plans: {}, cancelled: {}, ipo: {}, ipoFrom: {} };
}
// The whole book (stock-check.js: what this Worker filled, saw open, and let be cancelled).
export async function readFillsBook(env, account, fsGet) {
  return readBook(await fsGet(env, FILLS_COLLECTION, account).catch(() => null));
}
// A fill as the record keeps it.
const recordOf = (f, o) => ({ ...f, s: o.symbol, side: o.side, q: o.qty, k: o.type, ...(o.limit != null ? { l: o.limit } : {}), ...(o.stop != null ? { st: o.stop } : {}), seen: o.t });
const answerOf = f => ({ quote: f.quote, t: f.t, ...(f.twd ? { twd: f.twd } : {}) });
// Two copies of the book as one (a request that read it before another's
// write, merged into the newer one): a fill or a cancel either issued stands,
// a fill issued first never replaced (the phone it answered applies it); an
// order waiting keeps its terms as first seen and its latest look.
export function mergeBooks(base, mine) {
  const fills = { ...mine.fills, ...base.fills };
  const cancelled = { ...mine.cancelled, ...base.cancelled };
  const open = {};
  for (const id of new Set([...Object.keys(base.open), ...Object.keys(mine.open)])) {
    if (fills[id] || cancelled[id]) continue;
    const [a, b] = [base.open[id], mine.open[id]];
    const first = !a ? b : !b ? a : b.t < a.t ? b : a;
    const lk = Math.max(a?.lk ?? -Infinity, b?.lk ?? -Infinity);
    open[id] = Number.isFinite(lk) ? { ...first, lk } : first;
  }
  const plans = {};
  for (const id of new Set([...Object.keys(base.plans), ...Object.keys(mine.plans)])) {
    const seen = new Map();
    for (const v of [...(base.plans[id] || []), ...(mine.plans[id] || [])]) seen.set(`${v.seen}|${v.symbol}|${v.day}|${v.amount}`, v);
    plans[id] = [...seen.values()].sort((x, y) => x.seen - y.seen).slice(-12);
  }
  const ipo = { ...mine.ipo };
  for (const [k, t] of Object.entries(base.ipo)) ipo[k] = Math.min(t, ipo[k] ?? Infinity);
  // (An application both copies hold is the newer copy's: its own, or the pass it came from.)
  const ipoFrom = {};
  for (const k of Object.keys(ipo)) {
    const from = base.ipo[k] != null ? base.ipoFrom?.[k] : mine.ipoFrom?.[k];
    if (from) ipoFrom[k] = from;
  }
  return { v: 2, fills, open, plans, cancelled, ipo, ipoFrom };
}
// The book trimmed to what's kept.
function trimBook(book, now) {
  const fills = Object.entries(book.fills)
    .filter(([, f]) => now - f.t < KEEP_MS)
    .sort((a, b) => b[1].t - a[1].t)
    .slice(0, KEEP);
  const open = Object.entries(book.open).filter(([, o]) => now - o.t < OPEN_MS).slice(-KEEP);
  const cancelled = Object.entries(book.cancelled || {}).filter(([, t]) => now - t < KEEP_MS).slice(-KEEP);
  // (新股申購 seen: kept a year, the draw and the listing well past.)
  const ipo = Object.entries(book.ipo || {}).filter(([, t]) => now - t < 365 * 86_400_000);
  const ipoFrom = Object.fromEntries(ipo.filter(([k]) => book.ipoFrom?.[k]).map(([k]) => [k, book.ipoFrom[k]]));
  return { v: 2, fills: Object.fromEntries(fills), open: Object.fromEntries(open), plans: book.plans, cancelled: Object.fromEntries(cancelled), ipo: Object.fromEntries(ipo), ipoFrom };
}
// The book written over the copy it was read from only: a request that lost
// the race merges its changes into the newer copy (mergeBooks) and writes
// again, so one never drops what another issued (a fill answered and then
// lost would count at the worst price since). The book as written.
async function writeBook(env, deps, account, book, now) {
  const written = await changeDoc(env, deps, FILLS_COLLECTION, account, raw => trimBook(mergeBooks(bookOf(raw), book), now), {
    attempts: 5,
    write: ({ ipo, ipoFrom, ...rest }) => ({ ...rest, ...(Object.keys(ipo).length ? { ipo } : {}), ...(Object.keys(ipoFrom).length ? { ipoFrom } : {}) })
  });
  if (!written) throw new Error('stock-fills busy');
  return written;
}
// A pass merged into another: its book (fills issued, orders waiting,
// cancels, plans, 新股申購 seen) merged into the other's, so its account,
// folded in on the phone, checks against what this Worker issued.
export async function moveBook(env, deps, from, to, now) {
  const doc = await deps.fsGet(env, FILLS_COLLECTION, from);
  if (!doc.exists) return;
  const book = readBook(doc);
  // Its 新股申購 still drawn as the pass they were made on.
  for (const k of Object.keys(book.ipo)) book.ipoFrom[k] ||= from;
  await writeBook(env, deps, to, book, now);
  await deps.fsDelete(env, FILLS_COLLECTION, from);
}
// The fills issued for an account (stock-check.js reads them).
export async function issuedFills(env, account, fsGet) {
  return readBook(await fsGet(env, FILLS_COLLECTION, account).catch(() => null)).fills;
}

// A plan as the phone hands it (on ones only).
export function cleanPlan(p) {
  if (!p || !ID.test(String(p.id)) || !SYMBOL.test(String(p.symbol)) || p.on === false) return null;
  const day = Math.round(Number(p.day));
  const amount = Math.round(Number(p.amount));
  if (!(day >= 1 && day <= PLAN_DAY_MAX) || !(amount > 0 && amount <= 1_000_000_000)) return null;
  return { id: String(p.id), symbol: String(p.symbol), day, amount, currency: CURRENCY.test(String(p.currency)) ? String(p.currency) : undefined, market: String(p.market || ''), kind: String(p.kind || '') };
}
// The plan's terms in force at a moment: the latest version seen by then.
export const planAt = (versions, t) => [...(versions || [])].reverse().find(v => v.seen <= t) || null;

// Each kept plan's months due now and not filled: filled at the first bar
// on or after the day (its open; a Taiwan stock's in the odd-lot session, a
// limit order at that price), at that moment's NT$ rate.
async function planFills(book, now) {
  const out = {};
  for (const [id, versions] of Object.entries(book.plans)) {
    const v = versions.at(-1);
    // (Listed shares by plan in Taiwan and the US only: the kit's planAllowed.)
    if (!planAllowed(v)) continue;
    const due = planRuns({ on: true, since: versions[0].seen, day: v.day }, now)
      .map(run => ({ ...run, terms: planAt(versions, run.t), oid: planOrderId({ id }, run.month) }))
      .filter(r => r.terms && !book.fills[r.oid]);
    if (!due.length) continue;
    const bars = await fetchBars(v.symbol, due[0].t - 86_400_000).catch(() => []);
    const cur = v.currency;
    const fx = cur && cur !== 'TWD' ? await fetchBars(fxSymbol(cur), due[0].t - 5 * 86_400_000).catch(() => []) : [];
    const limit = planOrderType(v) === 'limit';
    for (const run of due) {
      const bar = planFillBar(v, bars, run.t);
      if (!bar) break;
      let twd = !cur || cur === 'TWD' ? 1 : null;
      for (const b of fx) if (b.t <= bar.t && b.c > 0) twd = b.c;
      if (!(twd > 0)) continue;
      out[run.oid] = { quote: bar.o, t: bar.t, twd, s: run.terms.symbol, side: 'buy', k: limit ? 'limit' : 'market', ...(limit ? { l: bar.o } : {}), amt: run.terms.amount, plan: id };
    }
  }
  return out;
}

// An order's terms as first seen: `t` the moment this Worker saw it (`lk`,
// from when its bars were last looked at, is added by its first look).
const termsOf = (o, now) => ({ symbol: o.symbol, side: o.side, type: o.type, qty: o.qty, limit: o.limit, stop: o.stop, after: o.after, expires: o.expires, market: o.market, kind: o.kind, currency: o.currency, t: now });

// From when an order's bars still need looking at: a bar back from its last
// look (the newest bar then was still forming), never before it was seen.
const BAR_BACK = 10 * 60_000;
const fromOf = o => Math.max(o.t, (o.lk ?? o.t) - BAR_BACK);
// How far an order's last look may move before it's worth a write.
const LOOK_SAVE = 6 * 3_600_000;

// The orders' fills now: { orderId: { quote, t, twd } } for those whose price
// is met. `orders`: each with its kept terms (t: when first seen; lk: from
// when its price bars were last looked at, none the first time). An order
// looked at before is decided on the price bars since then, not on the
// quote alone: the first bar that reached its price fills it there, at the
// order's terms (a limit at its limit or better on a gap), so a phone that
// waits to ask until the price has gone past its limit gets the limit, not
// the price now (the money lock-down: a moment chosen by the phone wins
// nothing). Only when no bar reached it does the quote now count, and then a
// limit fills at its limit. Seen for the first time, it fills at the quote
// now when that meets it (a limit already met when placed: the price now).
export async function decideFills(orders, { read, now = Date.now() }) {
  useQuotesReader(url => read(url));
  const currencies = [...new Set(orders.map(o => o.currency).filter(c => c && c !== 'TWD'))];
  const symbols = [...new Set([...orders.map(o => o.symbol), ...currencies.map(fxSymbol)])];
  // The bars each symbol needs (from its earliest order's last look), read
  // with the quotes.
  const want = new Map();
  for (const o of orders) if (o.lk != null && !o.after) want.set(o.symbol, Math.min(want.get(o.symbol) ?? Infinity, fromOf(o)));
  const barsOf = new Map();
  const [quotes] = await Promise.all([
    fetchQuotes(symbols),
    ...[...want].map(async ([s, from]) => barsOf.set(s, await fetchBars(s, from).catch(() => null)))
  ]);
  const twdOf = c => (!c ? undefined : c === 'TWD' ? 1 : quotes.get(fxSymbol(c))?.price);
  const fills = {};
  const looked = {};
  for (const o of orders) {
    const twd = twdOf(o.currency);
    const rate = twd > 0 ? { twd } : {};
    const bars = barsOf.get(o.symbol);
    if (bars) {
      const hit = backfillPrice({ ...o, t: fromOf(o) }, bars, now);
      if (hit && hit.price > 0) {
        fills[o.id] = { quote: hit.price, t: Math.max(o.t, hit.t), ...rate };
        continue;
      }
      const last = bars.at(-1)?.t;
      if (last > (o.lk ?? 0)) looked[o.id] = Math.min(last, now);
    }
    if (o.lk == null) looked[o.id] = now;
    const q = quotes.get(o.symbol);
    // (Past its end, only what met its price before then.)
    const price = q && !(o.expires && now >= o.expires) ? triggerPrice(o, q, now) : null;
    if (!(Number.isFinite(price) && price > 0)) continue;
    // (Taiwan's closing and after-hours matches are one price for all: the close.)
    const one = o.after || closingMatch(o, q, now)?.price != null;
    fills[o.id] = { quote: o.lk != null && o.type === 'limit' && !one ? o.limit : price, t: now, ...rate };
  }
  return { fills, looked };
}

// ---- 新股申購 (kit/stock-ipo.mjs) ----
// TWSE's list of subscriptions (the data proxy's copy, kept a while there);
// early in a year last year's too (ipoUrls), so a December draw still
// resolves in January. This year's must be read; last year's may fail.
export async function ipoList(read, now = Date.now()) {
  const [first, ...rest] = ipoUrls(now);
  const lists = [parseIpoList(await read(first)), ...(await Promise.all(rest.map(u => read(u).then(parseIpoList).catch(() => []))))];
  const seen = new Set();
  return lists.flat().filter(s => !seen.has(ipoKeyOf(s)) && seen.add(ipoKeyOf(s)));
}
const IPO_KEY = /^\d{4}:\d{10,14}$/;
export const ipoKeyOf = s => `${s.code}:${s.draw}`;
// Whether this account's application to `s` won: a keyed hash (the Pass's
// signing secret) of the account and the issue, against TWSE's rate.
export async function ipoDraw(env, account, s) {
  const secret = await tokenSecret(env);
  if (!secret) return null;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(`ipo|${secret}`), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(ipoDrawKey(account, s))));
  return ipoWon([...mac.slice(0, 4)].map(b => b.toString(16).padStart(2, '0')).join(''), s.rate);
}
// The phone's applications: each one seen here in its window is kept (the
// moment first seen); asked about after its draw, one kept says whether it
// won. One never seen in its window counts for nothing (asked after the
// draw, it's never kept: a phone can't apply to the ones it learns it won).
//   { op: 'ipo', apps: ['code:draw'…] } → { seen: { key: t }, drawn: { key: { won, rate } } }
async function handleIpo(body, env, headers, session, deps) {
  const keys = [...new Set((Array.isArray(body.apps) ? body.apps : []).map(String).filter(k => IPO_KEY.test(k)))].slice(0, 30);
  const now = deps.now();
  const book = readBook(await deps.fsGet(env, FILLS_COLLECTION, session.d));
  if (!keys.length) return deps.json({ seen: {}, drawn: {} }, 200, headers);
  const list = await ipoList(deps.read, now).catch(() => []);
  const byKey = new Map(list.map(s => [ipoKeyOf(s), s]));
  let changed = false;
  const seen = {};
  const drawn = {};
  for (const k of keys) {
    const s = byKey.get(k);
    if (!s) continue;
    if (book.ipo[k] == null && ipoOpen(s, now)) {
      book.ipo[k] = now;
      changed = true;
    }
    if (book.ipo[k] == null) continue;
    seen[k] = book.ipo[k];
    if (ipoDrawn(s, now)) {
      const won = await ipoDraw(env, book.ipoFrom[k] || session.d, s);
      if (won != null) drawn[k] = { won, rate: s.rate };
    }
  }
  if (changed) await writeBook(env, deps, session.d, book, now);
  return deps.json({ seen, drawn }, 200, headers);
}

export async function handleStock(request, env, headers, session, deps) {
  const { json, errorJson } = deps;
  if (!session || session.a !== 'stock') return errorJson('ECO_TOKEN_INVALID', 401, headers, request);
  if (request.method !== 'POST') return json({ error: { message: 'POST only' } }, 405, headers);
  let body;
  try {
    body = JSON.parse(await bodyText(request, 1_000_000));
  } catch {
    return json({ error: { message: 'Bad body' } }, 400, headers);
  }
  // A cancel is this Worker's to rule on (the money lock-down): an order whose
  // price its bars reached since it last looked is filled, not cancelled (a
  // phone that held back its ask can't cancel a fill that would lose it
  // money); one never reached is cancelled here, and never fills after.
  if (body?.op === 'cancel') {
    const o = cleanOrder(body.order);
    if (!o) return json({ error: { message: 'Bad order' } }, 400, headers);
    const now = deps.now();
    const book = readBook(await deps.fsGet(env, FILLS_COLLECTION, session.d));
    if (book.fills[o.id]) return json({ fill: answerOf(book.fills[o.id]) }, 200, headers);
    if (book.cancelled[o.id]) return json({ cancelled: true }, 200, headers);
    const kept = book.open[o.id];
    if (kept) {
      const { fills } = await decideFills([{ id: o.id, ...kept }], { read: deps.read, now });
      const f = fills[o.id];
      if (f) {
        book.fills[o.id] = recordOf(f, kept);
        delete book.open[o.id];
        const saved = await writeBook(env, deps, session.d, book, now);
        return json({ fill: answerOf(saved.fills[o.id] || f) }, 200, headers);
      }
      delete book.open[o.id];
    }
    // (Never asked about: this Worker never saw it, so nothing of it could fill.)
    book.cancelled[o.id] = now;
    const saved = await writeBook(env, deps, session.d, book, now);
    // (Filled meanwhile by another request: the fill stands.)
    if (saved.fills[o.id]) return json({ fill: answerOf(saved.fills[o.id]) }, 200, headers);
    return json({ cancelled: true }, 200, headers);
  }
  if (body?.op === 'ipo') return handleIpo(body, env, headers, session, deps);
  if (body?.op !== 'fill') return json({ error: { message: 'Unknown op' } }, 400, headers);
  const orders = (Array.isArray(body.orders) ? body.orders : []).slice(0, MAX_ORDERS).map(cleanOrder).filter(Boolean);
  const plans = (Array.isArray(body.plans) ? body.plans : []).slice(0, 20).map(cleanPlan).filter(Boolean);
  if (!orders.length && !plans.length) return json({ fills: {} }, 200, headers);
  const now = deps.now();
  const book = readBook(await deps.fsGet(env, FILLS_COLLECTION, session.d));
  let changed = false;
  // A plan first seen, or its terms changed: this version from now.
  for (const p of plans) {
    const versions = book.plans[p.id] || [];
    const last = versions.at(-1);
    if (last && last.symbol === p.symbol && last.day === p.day && last.amount === p.amount) continue;
    book.plans[p.id] = [...versions, { symbol: p.symbol, day: p.day, amount: p.amount, currency: p.currency, market: p.market, kind: p.kind, seen: now }].slice(-12);
    changed = true;
  }
  if (plans.length) {
    useQuotesReader(url => deps.read(url));
    const due = await planFills({ ...book, plans: Object.fromEntries(plans.map(p => [p.id, book.plans[p.id]])) }, now).catch(() => ({}));
    for (const [id, f] of Object.entries(due)) (book.fills[id] = f), (changed = true);
  }
  // First seen now: its terms kept as they are. (One kept before its looks
  // were: looked at since it was seen.)
  for (const o of Object.values(book.open)) if (o.lk == null) o.lk = o.t;
  for (const o of orders)
    if (!book.fills[o.id] && !book.open[o.id] && !book.cancelled[o.id]) {
      book.open[o.id] = termsOf(o, now);
      changed = true;
    }
  const waiting = orders.filter(o => !book.fills[o.id] && book.open[o.id]).map(o => ({ id: o.id, ...book.open[o.id] }));
  const { fills: fresh, looked } = waiting.length ? await decideFills(waiting, { read: deps.read, now }).catch(() => ({ fills: {}, looked: {} })) : { fills: {}, looked: {} };
  // (A look kept when it's an order's first, or has moved a while.)
  for (const [id, at] of Object.entries(looked)) {
    const o = book.open[id];
    if (!o) continue;
    if (o.lk == null || at - o.lk >= LOOK_SAVE) changed = true;
    o.lk = at;
    delete o.bf;
  }
  for (const [id, f] of Object.entries(fresh)) {
    const o = book.open[id];
    book.fills[id] = recordOf(f, o);
    delete book.open[id];
    changed = true;
  }
  // (Answered from the book as written: a fill another request issued first is the one.)
  const kept = changed ? await writeBook(env, deps, session.d, book, now) : book;
  const answer = Object.fromEntries(orders.filter(o => kept.fills[o.id]).map(o => [o.id, answerOf(kept.fills[o.id])]));
  // The plans' months filled (asked for or not).
  const asked = new Set(plans.map(p => p.id));
  for (const [id, f] of Object.entries(kept.fills)) if (f.plan && asked.has(f.plan)) answer[id] = answerOf(f);
  return json({ fills: answer }, 200, headers);
}
