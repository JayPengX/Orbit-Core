// ---- lotto.js ----
// Quadra Play's lottery and scratch cards, sold, settled and paid by this
// Worker (the owner's lock-down, 2026-10-12: the proxy is the only one adding
// money), with Play's own code (the kit's play-lottery and play-scratch).
//
//   POST /play { op: 'tickets', tickets: [{ id, game, sel, multiple }] }
//        sold (each checked, its draw the next one by the Worker's clock, the
//        cost from the pool, all or none): { tickets: [ticket…], wallet }
//   POST /play { op: 'scratch', id, card }   a card bought, its prize drawn
//        here: { ticket, wallet }
//   POST /play { op: 'reveal', id }          scratched: its prize paid
//   POST /play { op: 'tickets-open', tickets }  tickets bought before the
//        lock-down (their cost in the wallet from before PLACE_SINCE),
//        watched to be paid
//   cron (with the slips): drawn tickets settled from Taiwan Lottery's results
//
// A ticket's prize goes into the wallet as `odds:prize-<id>`, Play's ledger's
// own id: Play settles the ticket on screen from the same draw and the same
// tables, so the same amount, never twice.
import { GAMES, buyTicket, settleTicket, drawFor } from './kit/play-lottery.mjs';
import { CARDS, drawPrize, tiersOf } from './kit/play-scratch.mjs';
import { updateWallet, WALLET_COLLECTION, parseWallet, poolBalance } from './eco.js';

export const TICKET_COLLECTION = 'odds-tickets';
export const TICKET_INDEX = '_index';
const MAX_TICKETS = 50;
const TICKET_ID = /^[a-z0-9]{8,32}$/;
// Tickets settled a run at most (each a draw read and two writes; the free
// plan's 50 fetches set it at 6).
export const RUN_TICKETS = 40;
// A draw not out this long after its time: looked at again in 10 minutes.
const AGAIN = 10 * 60_000;

const parse = text => {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};
const keyOf = (account, id) => `${account}_${id}`;
// Tickets checked on an account with no limit to spend (the pool is checked apart).
const BOTTOMLESS = { v: 1, created: '', ledger: [{ id: 'x', amount: 1e12 }], slips: [], tickets: [] };
// A crypto random number in [0, 1) and a 31-bit seed (the card's face).
const cryptoUnit = () => crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32;
const cryptoSeed = () => crypto.getRandomValues(new Uint32Array(1))[0] >>> 1;
// A lottery prize over NT$5,000 is taxed (20% and 0.4% stamp duty), as Play's.
const netPrize = gross => (gross > 5_000 ? Math.round(gross * 0.796) : gross);

async function changeIndex(env, deps, change) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const doc = await deps.fsGet(env, TICKET_COLLECTION, TICKET_INDEX);
    const index = (doc.exists && parse(doc.payload)) || { due: {} };
    const next = change(index);
    if (next === index) return index;
    try {
      await deps.fsWrite(env, TICKET_COLLECTION, TICKET_INDEX, JSON.stringify(next), doc.exists ? { updateTime: doc.updateTime } : { exists: false });
      return next;
    } catch (error) {
      if (!error.precondition) throw error;
    }
  }
  return null;
}
async function readWallet(env, deps, account) {
  const doc = await deps.fsGet(env, WALLET_COLLECTION, account);
  return doc.exists ? parseWallet(doc.payload) : null;
}
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
export async function handleLotto(body, env, account, deps, now, PLACE_SINCE) {
  if (body.op === 'tickets') {
    const asked = (Array.isArray(body.tickets) ? body.tickets : []).slice(0, MAX_TICKETS);
    const tickets = [];
    for (const x of asked) {
      if (!TICKET_ID.test(String(x?.id)) || !GAMES[x?.game]) return { refused: { problem: 'shape' } };
      const r = buyTicket(BOTTOMLESS, { id: String(x.id), game: x.game, sel: x.sel, multiple: x.multiple }, new Date(now));
      if (r.error) return { refused: { problem: r.error } };
      tickets.push(r.ticket);
    }
    if (!tickets.length) return { refused: { problem: 'shape' } };
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
    const kept = doc.exists ? parse(doc.payload) : null;
    if (!kept?.ticket?.card) return { refused: { problem: 'unknown' } };
    const prize = netPrize(kept.ticket.prize);
    const result = prize > 0 ? await updateWallet(env, deps, account, w => (w.entries.some(e => e.id === `odds:prize-${id}`) ? w : { ...w, entries: [...w.entries, { id: `odds:prize-${id}`, t: now, app: 'odds', kind: 'prize', amount: prize }] })) : null;
    await deps.fsDelete(env, TICKET_COLLECTION, key);
    return { prize, ...(result ? { wallet: result.wallet } : {}) };
  }
  if (body.op === 'tickets-open') {
    // Bought before the lock-down: their cost in the wallet from before it.
    const wallet = await readWallet(env, deps, account);
    const before = new Set((wallet?.entries || []).filter(e => e.app === 'odds' && e.kind === 'lottery' && e.t < PLACE_SINCE).map(e => e.id.slice('odds:lotto-'.length)));
    const tickets = (Array.isArray(body.tickets) ? body.tickets : [])
      .slice(0, MAX_TICKETS)
      .filter(x => x && x.status === 'open' && TICKET_ID.test(String(x.id)) && before.has(String(x.id)) && (GAMES[x.game] ? x.draw?.at > 0 : CARDS[x.card]))
      // (A card's prize one of its own tiers, or nothing.)
      .filter(x => !x.card || [0, ...tiersOf(x.card).map(t => t.prize)].includes(Number(x.prize)))
      .map(x => (x.card ? { id: x.id, t: x.t, game: x.game, card: x.card, cost: x.cost, prize: Number(x.prize) || 0, seed: x.seed, status: 'open' } : { id: x.id, t: x.t, game: x.game, draw: x.draw, sel: x.sel, bets: x.bets, multiple: x.multiple, cost: x.cost, status: 'open' }));
    await watch(env, deps, account, tickets, now);
    return { watching: tickets.length };
  }
  return null;
}

// One cron run: the tickets whose draw is out, settled and paid.
export async function lottoCron(env, deps) {
  const now = deps.now();
  const doc = await deps.fsGet(env, TICKET_COLLECTION, TICKET_INDEX);
  const index = (doc.exists && parse(doc.payload)) || { due: {} };
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
    const kept = (await deps.fsGet(env, TICKET_COLLECTION, key).then(d => (d.exists ? parse(d.payload) : null))) || null;
    if (!kept?.ticket?.draw) {
      drop.add(key);
      continue;
    }
    const { ticket, account } = kept;
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
