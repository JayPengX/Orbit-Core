// ---- settle.js ----
// /play: Quadra Play's slips settled by this Worker when their games end,
// whether or not anyone opens Play (the owner, 2026-10-12: settling on the
// proxy, one read per game for every slip on it; live stats stay the phone's).
//
// Play registers each open slip (its picks, sizes, stake) when it's placed
// and once a session for any it has open. The cron (worker.js, odd minutes)
// takes the slips whose games should be over, reads each game once
// (kit/settle.mjs readOutcomes, the same code the phone used), decides each
// pick (legResult) and settles the slip exactly as the phone did
// (applyResults, settleSlip):
//   - the payout goes into the pass's wallet as `odds:payout-<slip>` (and
//     `odds:plus-<slip>`): the ids Play's own ledger uses, so the phone and
//     the Worker can never pay a slip twice (the wallet keeps one entry an id);
//   - the picks' results and final scores are kept for Play to apply
//     (`odds-settled/<account>`), the same ids again: nothing twice;
//   - the real notice (won NT$…, or lost) goes to a phone subscribed to them.
// A game not over yet is looked at again 15 minutes later; a pick whose game
// is never found three days after its start is void (as the phone did), and
// Kambi's kept copies (kambi.js) settle its matches after Kambi drops them.
//
// Cash out and settling never both happen: each takes the slip's document
// from 'open' with Firestore's updateTime precondition; whoever is second
// sees the other's state (a cash out finds the slip settled and is given its
// result instead).
//
//   POST /play?qt=T { op: 'open', slips: [slip…] }   watch these slips
//   POST /play?qt=T { op: 'cashout', id, value }     { cashedOut, wallet } or { settled: record }
//                      or { refused: { problem: 'moved', value } } (the house's value now, null: paused)
//   POST /play?qt=T { op: 'ack', ids }               records Play has applied
//   GET  /play?qt=T                                  { settled: { id: record } }
//   POST /play?qt=T { op: 'place', slips: [slip…] }  { placed: [id…], wallet } or
//                      { refused: { slip, problem, moved: [{ id, odds }] } } (price.js)
//   POST /play { op: 'check', slips } from localhost (the dev door): the
//                      prices checked, nothing placed
//
// A record: { results: [won|lost|void|null per pick], finals: [score|null],
// settled: bool, payout, at }.
//
// deps: worker.js's plumbing (as eco.js): { json, errorJson, upstreamFailed,
// readJsonBody, INVALID_BODY, fsGet, fsWrite, fsDelete, now }, plus `read(url)`
// (a source's JSON, or null), and `notify(account, message)` (push.js).

import { readOutcomes, legResult, applyResults, finalOf, familyOf, LEAGUES } from './kit/settle.mjs';
import { updateWallet, WALLET_COLLECTION, parseWallet, poolBalance, LOCK_SINCE } from './eco.js';
import { checkSlip, useReads, cashOutQuote, cashOutOk } from './price.js';
import { handleLotto } from './lotto.js';
import { watchKambi, KAMBI_COLLECTION } from './kambi.js';

export const OPEN_COLLECTION = 'odds-open';
export const SETTLED_COLLECTION = 'odds-settled';
export const OPEN_INDEX = '_index';
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
// How long a game of each kind usually lasts, start to final (the phone's
// old guess for its notice), and a margin for the result to be posted.
export const GAME_HOURS = { baseball: 3.3, football: 3.5, basketball: 2.6, hockey: 2.7, soccer: 2.1, sets: 2.5, racing: 2.2 };
const MARGIN = 10 * MIN;
const AGAIN = 15 * MIN;
// A championship (future) is looked at every 6 hours.
const FUTURE_AGAIN = 6 * HOUR;
// A game never found this long after its start: its picks are void.
export const VOID_AFTER = 3 * DAY;
// From here on a slip is placed through the Worker (op 'place', its price
// checked); one staked before is only watched (op 'open').
export const PLACE_SINCE = LOCK_SINCE;
// A cron run (its own invocation, 50 fetches): this many slips looked at,
// this many settled.
export const RUN_LOOK = 6;
export const RUN_SETTLE = 3;
const MAX_SLIPS = 40;
const MAX_LEGS = 20;
const MAX_SLIP_BYTES = 24_000;
const SLIP_ID = /^[a-z0-9]{8,32}$/;
const ACCOUNT = /^[A-Za-z0-9_-]{8,128}$/;

const parse = text => {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};
const keyOf = (account, slipId) => `${account}_${slipId}`;

// What's kept of a slip: what settling needs (and its picks' names for the notice).
export function cleanSlip(slip) {
  if (!slip || !SLIP_ID.test(String(slip.id)) || slip.status !== 'open' || slip.recovered) return null;
  if (!Array.isArray(slip.legs) || !slip.legs.length || slip.legs.length > MAX_LEGS) return null;
  if (!Array.isArray(slip.sizes) || !(Number(slip.stake) > 0) || !(Number(slip.cost) >= 0)) return null;
  if (slip.legs.some(l => !l || typeof l !== 'object' || !l.id || !(Number(l.odds) >= 1))) return null;
  const out = {
    id: String(slip.id),
    t: String(slip.t || ''),
    status: 'open',
    mode: ['single', 'parlay', 'system'].includes(slip.mode) ? slip.mode : 'single',
    sizes: slip.sizes.map(Number),
    stake: Number(slip.stake),
    cost: Number(slip.cost),
    legs: slip.legs,
    ...(slip.boost ? { boost: Number(slip.boost) } : {}),
    ...(slip.free ? { free: String(slip.free), freeValue: Number(slip.freeValue) || 0 } : {})
  };
  return JSON.stringify(out).length <= MAX_SLIP_BYTES ? out : null;
}

// When to look at a slip next: the soonest undecided pick's expected end
// (its start and its kind of game's usual length), or `again` (15 minutes,
// or at once for a slip just registered) for a game that should be over.
export function nextLook(slip, now, again = AGAIN) {
  let next = Infinity;
  for (const leg of slip.legs) {
    if (leg.result) continue;
    const start = Date.parse(leg.start);
    if (leg.kind === 'future' || !Number.isFinite(start)) {
      next = Math.min(next, now + FUTURE_AGAIN);
      continue;
    }
    const end = start + (GAME_HOURS[familyOf(leg.sport)] ?? 3) * HOUR + MARGIN;
    next = Math.min(next, end > now ? end : now + again);
  }
  return Number.isFinite(next) ? next : now;
}

// Each pick's result from the outcomes read, the void rule applied.
export function resultsOf(slip, outcomes, now) {
  return slip.legs.map(leg => {
    if (leg.result) return leg.result;
    const result = legResult(leg, outcomes.get(leg.id));
    if (result) return result;
    const stale = leg.kind !== 'future' && leg.start && now - Date.parse(leg.start) > VOID_AFTER;
    return stale ? 'void' : null;
  });
}

// The slip in a one-slip account, settled as Play does: { slip, ledger } after.
export function settleOne(slip, results, finals, now) {
  const account = { v: 1, created: '', ledger: [], slips: [slip] };
  const next = applyResults(account, slip.id, results, new Date(now), finals);
  return { slip: next.slips[0], ledger: next.ledger };
}

// ---- The index: every watched slip and when it's next due, one read a run ----

async function readIndex(env, deps) {
  const doc = await deps.fsGet(env, OPEN_COLLECTION, OPEN_INDEX);
  const index = doc.exists ? parse(doc.payload) : null;
  return { index: index && typeof index.due === 'object' ? index : { due: {} }, updateTime: doc.updateTime, exists: doc.exists };
}
async function changeIndex(env, deps, change) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const { index, updateTime, exists } = await readIndex(env, deps);
    const next = change(index);
    if (next === index) return index;
    try {
      await deps.fsWrite(env, OPEN_COLLECTION, OPEN_INDEX, JSON.stringify(next), exists ? { updateTime } : { exists: false });
      return next;
    } catch (error) {
      if (!error.precondition) throw error;
    }
  }
  return null;
}

// ---- The records Play applies -------------------------------------------------

async function changeRecords(env, deps, account, change) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const doc = await deps.fsGet(env, SETTLED_COLLECTION, account);
    const records = (doc.exists && parse(doc.payload)?.slips) || {};
    const next = change(records);
    if (next === records) return records;
    try {
      if (!Object.keys(next).length && doc.exists) await deps.fsDelete(env, SETTLED_COLLECTION, account);
      else await deps.fsWrite(env, SETTLED_COLLECTION, account, JSON.stringify({ slips: next }), doc.exists ? { updateTime: doc.updateTime } : { exists: false });
      return next;
    } catch (error) {
      if (!error.precondition) throw error;
    }
  }
  throw new Error('records busy');
}
const recordOf = (slip, at) => ({
  results: slip.legs.map(l => l.result ?? null),
  finals: slip.legs.map(l => l.final ?? null),
  settled: slip.status === 'settled',
  ...(slip.status === 'settled' ? { payout: slip.payout } : {}),
  at
});

// ---- Requests ------------------------------------------------------------------

export async function handlePlay(request, env, headers, session, deps) {
  const { json, errorJson, upstreamFailed } = deps;
  if (!env.FIREBASE_PROJECT_ID || !env.FIREBASE_CLIENT_EMAIL || !env.FIREBASE_PRIVATE_KEY) return errorJson('MISSING_FIREBASE_CONFIG', 500, headers, request);
  // The dev door (a localhost page, no pass): a slip's prices checked, nothing placed.
  if (!session && deps.dev && request.method === 'POST') {
    const body = await deps.readJsonBody(request);
    if (body?.op !== 'check' || !Array.isArray(body.slips)) return errorJson('ECO_TOKEN_INVALID', 401, headers, request);
    const out = [];
    const once = deps.prices ? useReads(deps.prices) : null;
    for (const slip of body.slips.slice(0, 5).map(cleanSlip)) out.push(slip ? await (deps.checkSlip || checkSlip)(slip, { entries: [] }, deps.prices, new Date(deps.now()), once) : { problem: 'shape' });
    return json({ checked: out }, 200, headers);
  }
  if (!session?.d || !ACCOUNT.test(session.d) || session.a !== 'odds') return errorJson('ECO_TOKEN_INVALID', 401, headers, request);
  const account = session.d;
  try {
    if (request.method === 'GET') {
      const doc = await deps.fsGet(env, SETTLED_COLLECTION, account);
      return json({ settled: (doc.exists && parse(doc.payload)?.slips) || {} }, 200, headers);
    }
    if (request.method !== 'POST') return errorJson('SYNC_METHOD_NOT_ALLOWED', 405, headers, request);
    const body = await deps.readJsonBody(request);
    if (body === deps.INVALID_BODY || !body || typeof body !== 'object') return errorJson('INVALID_JSON', 400, headers, request);
    const now = deps.now();
    // The lottery and scratch cards (lotto.js).
    const lotto = await handleLotto(body, env, account, deps, now, PLACE_SINCE);
    if (lotto) return json(lotto, 200, headers);
    if (body.op === 'place') {
      // Placed here (the lock-down): every slip checked (price.js), its stake
      // taken from the wallet and the slip watched, all or none.
      const slips = (Array.isArray(body.slips) ? body.slips : []).slice(0, MAX_SLIPS);
      const clean = slips.map(cleanSlip);
      if (!clean.length || clean.some(x => !x)) return json({ refused: { problem: 'shape' } }, 200, headers);
      const doc = await deps.fsGet(env, WALLET_COLLECTION, account);
      const wallet = doc.exists ? parseWallet(doc.payload) : null;
      if (!wallet) return errorJson('ECO_SIGNED_OUT', 401, headers, request);
      const have = new Set(wallet.entries.map(e => e.id));
      if (clean.some(x => have.has(`odds:stake-${x.id}`))) return json({ refused: { problem: 'placed' } }, 200, headers);
      const once = deps.prices ? useReads(deps.prices) : null;
      for (const slip of clean) {
        const r = await (deps.checkSlip || checkSlip)(slip, wallet, deps.prices, new Date(now), once);
        if (!r.ok) return json({ refused: { slip: slip.id, ...r } }, 200, headers);
      }
      const cost = clean.reduce((sum, x) => sum + x.cost, 0);
      if (cost > poolBalance(wallet) + 0.005) return json({ refused: { problem: 'funds' } }, 200, headers);
      const entries = clean.flatMap(x => [{ id: `odds:stake-${x.id}`, t: now, app: 'odds', kind: 'stake', amount: -x.cost }, ...(x.free ? [{ id: `odds:fb-${x.free}`, t: now, app: 'odds', kind: 'freebet', amount: 0 }] : [])]);
      const paid = await updateWallet(env, deps, account, w => {
        const ids = new Set(w.entries.map(e => e.id));
        if (entries.some(e => ids.has(e.id)) || cost > poolBalance(w) + 0.005) return w;
        return { ...w, entries: [...w.entries, ...entries] };
      });
      const took = paid && entries.every(e => paid.wallet.entries.some(x => x.id === e.id && x.t === now));
      if (!took) return json({ refused: { problem: 'funds' } }, 200, headers);
      await watchSlips(env, deps, account, clean, now);
      return json({ placed: clean.map(x => x.id), wallet: paid.wallet }, 200, headers);
    }
    if (body.op === 'open') {
      // Slips placed before the lock-down (their stake in the wallet from
      // before PLACE_SINCE): watched to be settled. Newer ones are placed.
      const doc = await deps.fsGet(env, WALLET_COLLECTION, account);
      const wallet = doc.exists ? parseWallet(doc.payload) : null;
      const before = new Set((wallet?.entries || []).filter(e => e.app === 'odds' && e.kind === 'stake' && e.t < PLACE_SINCE).map(e => e.id.slice('odds:stake-'.length)));
      const slips = (Array.isArray(body.slips) ? body.slips : []).slice(0, MAX_SLIPS).map(cleanSlip).filter(x => x && before.has(x.id));
      const added = await watchSlips(env, deps, account, slips, now);
      return json({ watching: slips.length, added }, 200, headers);
    }
    if (body.op === 'cashout') {
      // Cashed out here: the value checked against the house's own now
      // (price.js cashOutQuote), the slip taken from 'open' (never settled
      // too), the payout written by the Worker (the ledger's id, kind
      // 'cashout'). Settled first: its result stands.
      const id = String(body.id || '');
      const asked = Math.floor(Number(body.value));
      if (!SLIP_ID.test(id)) return errorJson('INVALID_JSON', 400, headers, request);
      const key = keyOf(account, id);
      for (let attempt = 0; attempt < 3; attempt++) {
        const doc = await deps.fsGet(env, OPEN_COLLECTION, key);
        const open = doc.exists ? parse(doc.payload) : null;
        if (!open || open.state !== 'open') {
          const records = await deps.fsGet(env, SETTLED_COLLECTION, account);
          const record = (records.exists && parse(records.payload)?.slips?.[id]) || null;
          if (record?.settled || open?.state === 'settling') return json({ settled: record || { settled: true, pending: true } }, 200, headers);
          return json({ refused: { problem: 'unknown' } }, 200, headers);
        }
        const wdoc = await deps.fsGet(env, WALLET_COLLECTION, account);
        const wallet = wdoc.exists ? parseWallet(wdoc.payload) : null;
        const quote = await (deps.cashOutQuote || cashOutQuote)(open.slip, wallet, deps.prices, new Date(now));
        if (!cashOutOk(asked, quote.value)) return json({ refused: { problem: 'moved', value: quote.value, reason: quote.reason || '' } }, 200, headers);
        try {
          await deps.fsWrite(env, OPEN_COLLECTION, key, JSON.stringify({ ...open, state: 'cashed', at: now, value: asked }), { updateTime: doc.updateTime });
        } catch (error) {
          if (error.precondition) continue;
          throw error;
        }
        const paid = await updateWallet(env, deps, account, w => (w.entries.some(e => e.id === `odds:payout-${id}`) ? w : { ...w, entries: [...w.entries, { id: `odds:payout-${id}`, t: now, app: 'odds', kind: 'cashout', amount: asked }] }));
        await changeRecords(env, deps, account, records => ({ ...records, [id]: { ...recordOf(open.slip, now), settled: true, cashedOut: true, payout: asked } }));
        await deps.fsDelete(env, OPEN_COLLECTION, key).catch(() => {});
        await changeIndex(env, deps, index => (key in index.due ? { ...index, due: Object.fromEntries(Object.entries(index.due).filter(([k]) => k !== key)) } : index)).catch(() => {});
        return json({ cashedOut: asked, wallet: paid?.wallet }, 200, headers);
      }
      return errorJson('RATE_LIMITED', 429, headers, request);
    }
    if (body.op === 'ack') {
      const ids = new Set((Array.isArray(body.ids) ? body.ids : []).map(String).slice(0, 200));
      await changeRecords(env, deps, account, records => ([...ids].some(id => records[id]?.settled) ? Object.fromEntries(Object.entries(records).filter(([id, r]) => !(ids.has(id) && r.settled))) : records));
      return json({ ok: true }, 200, headers);
    }
    return errorJson('INVALID_JSON', 400, headers, request);
  } catch (error) {
    return upstreamFailed(error, headers, request);
  }
}

// Slips watched to be settled (their documents and the index), and their
// Kambi matches kept after Kambi drops them (kambi.js). How many were new.
async function watchSlips(env, deps, account, slips, now) {
  const added = {};
  const kambi = [];
  for (const slip of slips) {
    try {
      await deps.fsWrite(env, OPEN_COLLECTION, keyOf(account, slip.id), JSON.stringify({ account, state: 'open', slip, t: now }), { exists: false });
      added[keyOf(account, slip.id)] = nextLook(slip, now, 0);
      for (const leg of slip.legs) if (LEAGUES[leg.sport]?.kambi && leg.kambiId && leg.start) kambi.push({ id: leg.kambiId, start: leg.start });
    } catch (error) {
      // Watched already.
      if (!error.precondition) throw error;
    }
  }
  if (Object.keys(added).length) await changeIndex(env, deps, index => ({ ...index, due: { ...index.due, ...added } }));
  if (kambi.length) await watchKambi(env, deps, kambi).catch(() => {});
  return Object.keys(added).length;
}

// ---- The cron ------------------------------------------------------------------

// Kambi's kept copies for matches Kambi has dropped (kambi.js), id -> entry.
const keptKambi = (env, deps) => async ids => {
  const out = new Map();
  for (const id of ids) {
    const doc = await deps.fsGet(env, KAMBI_COLLECTION, id);
    const entry = doc.exists ? parse(doc.payload) : null;
    if (entry) out.set(id, entry);
  }
  return out;
};

const money = n => `NT$${Math.round(n).toLocaleString('en-US')}`;
const legsLine = (slip, en) => {
  const names = slip.legs.map(l => l.shortLabel || l.label || '').filter(Boolean);
  const more = names.length > 3 ? (en ? ` +${names.length - 3}` : ` 等 ${names.length} 場`) : '';
  return `${names.slice(0, 3).join('、')}${more} · ${money(slip.stake)}`;
};
// The notice (Play's own words, i18n.mjs noticeSlipWon / noticeSlipLost).
export function slipNotice(slip, lang) {
  const en = lang === 'en';
  const won = slip.payout > 0;
  return {
    title: won ? (en ? `You won ${money(slip.payout)}` : `中獎 ${money(slip.payout)}`) : en ? 'Slip lost' : '投注單沒中',
    body: legsLine(slip, en),
    tag: `odds:slip:${slip.id}`,
    kind: 'slip',
    url: 'https://jaypengx.github.io/Quadra-Play/#history'
  };
}

// One run: the slips that are due, each game read once, what's decided kept,
// what's settled paid and told.
export async function settleCron(env, deps) {
  const now = deps.now();
  const { index } = await readIndex(env, deps);
  const due = Object.entries(index.due)
    .filter(([, at]) => at <= now)
    .sort((a, b) => a[1] - b[1])
    .slice(0, RUN_LOOK);
  if (!due.length) return { watched: Object.keys(index.due).length, looked: 0 };
  const docs = [];
  const drop = new Set();
  for (const [key] of due) {
    const doc = await deps.fsGet(env, OPEN_COLLECTION, key);
    const open = doc.exists ? parse(doc.payload) : null;
    if (!open?.slip || open.state === 'cashed') {
      drop.add(key);
      if (doc.exists) await deps.fsDelete(env, OPEN_COLLECTION, key).catch(() => {});
      continue;
    }
    docs.push({ key, open, updateTime: doc.updateTime });
  }
  // Every pick still undecided whose game has started, read together: a
  // game's page is read once for every slip on it.
  const pending = docs.flatMap(d => d.open.slip.legs.filter(l => !l.result && (l.kind === 'future' || (l.start && Date.parse(l.start) <= now))));
  const outcomes = pending.length ? await readOutcomes(pending, { read: deps.read, keptKambi: keptKambi(env, deps), now: new Date(now) }) : new Map();
  const later = {};
  let settled = 0;
  let decided = 0;
  for (const { key, open, updateTime } of docs) {
    const slip = open.slip;
    const results = resultsOf(slip, outcomes, now);
    const finals = slip.legs.map(leg => finalOf(outcomes.get(leg.id)));
    const after = settleOne(slip, results, finals, now);
    const changed = after.slip.legs.some((l, i) => l.result !== slip.legs[i].result);
    if (open.state !== 'settling' && after.slip.status !== 'settled') {
      // Not over: what's decided so far kept (Play shows each pick as it's decided).
      if (changed) {
        decided++;
        try {
          await deps.fsWrite(env, OPEN_COLLECTION, key, JSON.stringify({ ...open, slip: after.slip }), { updateTime });
          await changeRecords(env, deps, open.account, records => ({ ...records, [slip.id]: recordOf(after.slip, now) }));
        } catch (error) {
          // Cashed out meanwhile: the next run drops it.
          if (!error.precondition) throw error;
        }
      }
      later[key] = nextLook(after.slip, now);
      continue;
    }
    if (settled >= RUN_SETTLE) {
      later[key] = now;
      continue;
    }
    // Settling: taken from 'open' first, so a cash out can't land as well.
    const final = open.state === 'settling' ? open.final || after.slip : after.slip;
    if (open.state !== 'settling') {
      try {
        await deps.fsWrite(env, OPEN_COLLECTION, key, JSON.stringify({ ...open, state: 'settling', final }), { updateTime });
      } catch (error) {
        if (!error.precondition) throw error;
        later[key] = now;
        continue;
      }
    }
    await paySlip(env, deps, open.account, slip, final, now);
    await deps.fsDelete(env, OPEN_COLLECTION, key);
    drop.add(key);
    settled++;
  }
  if (drop.size || Object.keys(later).length)
    await changeIndex(env, deps, idx => {
      const next = { ...idx.due };
      for (const k of drop) delete next[k];
      for (const [k, at] of Object.entries(later)) if (k in next) next[k] = at;
      return { ...idx, due: next };
    });
  return { watched: Object.keys(index.due).length, looked: docs.length, decided, settled };
}

// A settled slip: the wallet paid (the ids Play's ledger uses; only for a
// slip whose stake the wallet has, so nothing is paid that was never staked),
// its record kept for Play, the notice sent.
async function paySlip(env, deps, account, slip, final, now) {
  const { ledger } = settleOne(slip, final.legs.map(l => l.result), final.legs.map(l => l.final ?? null), now);
  const entries = ledger.filter(e => e.amount !== 0).map(e => ({ id: `odds:${e.id}`, t: now, app: 'odds', kind: e.kind, amount: e.amount }));
  if (entries.length)
    await updateWallet(env, deps, account, w => {
      const have = new Set(w.entries.map(e => e.id));
      if (!have.has(`odds:stake-${slip.id}`) || have.has(`odds:payout-${slip.id}`)) return w;
      const add = entries.filter(e => !have.has(e.id));
      return add.length ? { ...w, entries: [...w.entries, ...add] } : w;
    });
  await changeRecords(env, deps, account, records => ({ ...records, [slip.id]: recordOf(final, now) }));
  if (deps.notify) await deps.notify(account, lang => slipNotice(final, lang)).catch(() => {});
}
