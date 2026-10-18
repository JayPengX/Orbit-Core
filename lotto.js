// ---- lotto.js ----
// Quadra Play's lottery and scratch cards, sold, settled and paid by this
// Worker (the owner's lock-down, 2026-10-12: the proxy is the only one adding
// money), with Play's own code (the kit's play-lottery and play-scratch).
//
//   POST /play { op: 'tickets', tickets: [{ id, game, sel, multiple, periods }] }
//        sold (each checked, its draw the next one by the Worker's clock, the
//        cost from the pool, all or none; 多期: a ticket a draw, <id>-2 …):
//        { tickets: [ticket…], wallet }
//   POST /play { op: 'scratch', id, card }   a card bought, its prize drawn
//        here: { ticket, wallet }
//   POST /play { op: 'reveal', id }          scratched: its prize paid
//   cron (with the slips): drawn tickets settled from Taiwan Lottery's results
//
// A ticket's prize goes into the wallet as `odds:prize-<id>`, Play's ledger's
// own id: Play settles the ticket on screen from the same draw and the same
// tables, so the same amount, never twice.
import { GAMES, buyTicket, settleTicket, drawFor } from './kit/play-lottery.mjs';
import { CARDS, drawPrize } from './kit/play-scratch.mjs';
import { prizeAfterTax } from './kit/play-odds.mjs';
import { updateWallet, poolBalance } from './eco.js';
import { parseDoc, changeDoc, moveOwned } from './doc-store.js';

export const TICKET_COLLECTION = 'odds-tickets';
export const TICKET_INDEX = '_index';
const MAX_TICKETS = 50;
// Tickets one sale makes at most, 多期 counted (each a write and a cron read).
const MAX_SOLD = 120;
const TICKET_ID = /^[a-z0-9]{8,32}$/;
// Tickets settled a run at most (each a draw read and two writes; the free
// plan's 50 fetches set it at 6).
export const RUN_TICKETS = 40;
// A draw not out this long after its time: looked at again in 10 minutes.
const AGAIN = 10 * 60_000;

const keyOf = (account, id) => `${account}_${id}`;
// Tickets checked on an account with no limit to spend (the pool is checked apart).
const BOTTOMLESS = { v: 1, created: '', ledger: [{ id: 'x', amount: 1e12 }], slips: [], tickets: [] };
// A crypto random number in [0, 1) and a 31-bit seed (the card's face).
const cryptoUnit = () => crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32;
const cryptoSeed = () => crypto.getRandomValues(new Uint32Array(1))[0] >>> 1;
// A lottery prize over NT$5,000 is taxed (20% and 0.4% stamp duty), as Play's
// draw games and scratch cards are (LOTTERY_TAX).
const netPrize = prizeAfterTax;

const asIndex = index => (index && typeof index.due === 'object' ? index : { due: {} });
const changeIndex = (env, deps, change) => changeDoc(env, deps, TICKET_COLLECTION, TICKET_INDEX, change, { read: asIndex }).then(r => r ?? null);
// A pass merged into another: its tickets waiting for a draw and its
// scratch cards not yet revealed (in no index: found by listing) go with its
// money (eco.js merge), so a prize is paid to the pass that holds them.
export const moveTickets = (env, deps, from, to) => moveOwned(env, deps, TICKET_COLLECTION, TICKET_INDEX, from, to, { all: true });
// Entries into the wallet with the cost checked against the pool at the
// moment of writing; true when they're in.
async function charge(env, deps, account, entries, cost) {
  const result = await updateWallet(env, deps, account, w => {
    const ids = new Set(w.entries.map(e => e.id));
    if (entries.some(e => ids.has(e.id)) || cost > poolBalance(w) + 0.005) return w;
    return { ...w, entries: [...w.entries, ...entries] };
  });
  return result && entries.every(e => result.wallet.entries.some(x => x.id === e.id && x.t === e.t)) ? result.wallet : null;
}
async function watch(env, deps, account, tickets, now) {
  const due = {};
  for (const ticket of tickets) {
    try {
      await deps.fsWrite(env, TICKET_COLLECTION, keyOf(account, ticket.id), JSON.stringify({ account, ticket, t: now }), { exists: false });
      if (ticket.draw?.at) due[keyOf(account, ticket.id)] = ticket.draw.at + 3 * 60_000;
    } catch (error) {
      if (!error.precondition) throw error;
    }
  }
  if (Object.keys(due).length) await changeIndex(env, deps, index => ({ ...index, due: { ...index.due, ...due } }));
}

// The /play ops above (null: not one of them).
export async function handleLotto(body, env, account, deps, now) {
  if (body.op === 'tickets') {
    const asked = (Array.isArray(body.tickets) ? body.tickets : []).slice(0, MAX_TICKETS);
    const tickets = [];
    for (const x of asked) {
      if (!TICKET_ID.test(String(x?.id)) || !GAMES[x?.game]) return { refused: { problem: 'shape' } };
      const r = buyTicket(BOTTOMLESS, { id: String(x.id), game: x.game, sel: x.sel, multiple: x.multiple, periods: x.periods }, new Date(now));
      if (r.error) return { refused: { problem: r.error } };
      tickets.push(...(r.tickets || [r.ticket]));
    }
    // (One id once: the same id twice would be charged twice for one ticket.)
    if (!tickets.length || tickets.length > MAX_SOLD || new Set(tickets.map(x => x.id)).size !== tickets.length) return { refused: { problem: 'shape' } };
    const cost = tickets.reduce((s, x) => s + x.cost, 0);
    const wallet = await charge(env, deps, account, tickets.map(x => ({ id: `odds:lotto-${x.id}`, t: now, app: 'odds', kind: 'lottery', amount: -x.cost })), cost);
    if (!wallet) return { refused: { problem: 'funds' } };
    await watch(env, deps, account, tickets, now);
    return { tickets, wallet };
  }
  if (body.op === 'scratch') {
    const id = String(body.id || '');
    const card = CARDS[body.card];
    if (!TICKET_ID.test(id) || !card) return { refused: { problem: 'shape' } };
    const ticket = { id, t: new Date(now).toISOString(), game: `scratch:${body.card}`, card: body.card, cost: card.price, prize: drawPrize(body.card, cryptoUnit), seed: cryptoSeed(), status: 'open' };
    const wallet = await charge(env, deps, account, [{ id: `odds:lotto-${id}`, t: now, app: 'odds', kind: 'lottery', amount: -card.price }], card.price);
    if (!wallet) return { refused: { problem: 'funds' } };
    await watch(env, deps, account, [ticket], now);
    return { ticket, wallet };
  }
  if (body.op === 'reveal') {
    const id = String(body.id || '');
    const key = keyOf(account, id);
    const doc = await deps.fsGet(env, TICKET_COLLECTION, key);
    const kept = parseDoc(doc);
    if (!kept?.ticket?.card) return { refused: { problem: 'unknown' } };
    const prize = netPrize(kept.ticket.prize);
    const result = prize > 0 ? await updateWallet(env, deps, account, w => (w.entries.some(e => e.id === `odds:prize-${id}`) ? w : { ...w, entries: [...w.entries, { id: `odds:prize-${id}`, t: now, app: 'odds', kind: 'prize', amount: prize }] })) : null;
    await deps.fsDelete(env, TICKET_COLLECTION, key);
    return { prize, ...(result ? { wallet: result.wallet } : {}) };
  }
  // Tickets bought before the lock-down were handed over once each; closed
  // 2026-10-14 (a ticket handed over could name its own numbers or prize).
  if (body.op === 'tickets-open') return { watching: 0 };
  return null;
}

// One cron run: the tickets whose draw is out, settled and paid.
export async function lottoCron(env, deps) {
  const now = deps.now();
  const index = asIndex(parseDoc(await deps.fsGet(env, TICKET_COLLECTION, TICKET_INDEX)));
  const due = Object.entries(index.due)
    .filter(([, at]) => at <= now)
    .sort((a, b) => a[1] - b[1])
    .slice(0, RUN_TICKETS);
  if (!due.length) return { tickets: Object.keys(index.due).length, settled: 0 };
  const draws = new Map();
  const later = {};
  const drop = new Set();
  let settled = 0;
  for (const [key] of due) {
    const kept = parseDoc(await deps.fsGet(env, TICKET_COLLECTION, key));
    if (!kept?.ticket?.draw) {
      drop.add(key);
      continue;
    }
    const { ticket, account } = kept;
    // A game Play no longer sells (雙贏彩 and 大福彩, gone from Taiwan Lottery
    // too) has no draw to wait for: the ticket's cost back, once.
    if (!GAMES[ticket.game]) {
      await updateWallet(env, deps, account, w => (w.entries.some(e => e.id === `odds:refund-${ticket.id}`) ? w : { ...w, entries: [...w.entries, { id: `odds:refund-${ticket.id}`, t: now, app: 'odds', kind: 'refund', amount: ticket.cost }] }));
      await deps.fsDelete(env, TICKET_COLLECTION, key);
      drop.add(key);
      continue;
    }
    const drawKey = `${ticket.game}|${ticket.draw.date}|${ticket.draw.slot ?? ''}`;
    if (!draws.has(drawKey)) draws.set(drawKey, (deps.drawFor || drawFor)(ticket.game, ticket.draw).catch(() => null));
    const draw = await draws.get(drawKey);
    if (!draw) {
      later[key] = now + AGAIN;
      continue;
    }
    const after = settleTicket({ ...BOTTOMLESS, ledger: [], tickets: [ticket] }, ticket.id, draw, new Date(now));
    const prize = after.ledger.find(e => e.id === `prize-${ticket.id}`);
    if (prize) await updateWallet(env, deps, account, w => (w.entries.some(e => e.id === `odds:prize-${ticket.id}`) ? w : { ...w, entries: [...w.entries, { id: `odds:prize-${ticket.id}`, t: now, app: 'odds', kind: 'prize', amount: prize.amount }] }));
    await deps.fsDelete(env, TICKET_COLLECTION, key);
    drop.add(key);
    settled++;
  }
  await changeIndex(env, deps, idx => {
    const next = { ...idx.due };
    for (const k of drop) delete next[k];
    for (const [k, at] of Object.entries(later)) if (k in next) next[k] = at;
    return { ...idx, due: next };
  });
  return { tickets: Object.keys(index.due).length, settled };
}
