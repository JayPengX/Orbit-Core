// ---- eco-admin.js ----
// The store's clean-up: POST /eco { op: 'admin', token, action }.
//
// Only Quadra data stays. `scan` counts what's there and what a clean would
// remove; `clean` removes it, a bounded amount per call (run it again until
// `done`):
//   - collections from before the Quadra Pass (RETIRED_COLLECTIONS), whole;
//   - each app's documents with no Quadra Pass behind them (the old per-app
//     sync accounts shared those collections);
//   - inbox documents no wallet points at, expired device codes and share
//     keys, share keys of the old follow-style shape;
//   - in every wallet, what no app writes or reads any more (tidyWallet).
//
// The token is checked against ADMIN_TOKEN_HASH (its SHA-256; the token
// itself is never in the repo). Clearing the hash turns this off.

import { ECO_APPS, WALLET_COLLECTION, INBOX_COLLECTION, SHARE_COLLECTION, PAIR_COLLECTION, PAIR_MS, ECO_LIMITS, parseWallet, poolBalance, plusMember, gen } from './eco.js';
import { KAMBI_COLLECTION } from './kambi.js';

export const ADMIN_TOKEN_HASH = '';
export const RETIRED_COLLECTIONS = ['orbit-schedules', 'eco-links', 'stock-study-leagues'];
// (A function: eco.js and this file import each other.)
const keep = () => new Set([WALLET_COLLECTION, INBOX_COLLECTION, SHARE_COLLECTION, PAIR_COLLECTION, KAMBI_COLLECTION, ...Object.values(ECO_APPS).map(a => a.collection)]);
// Firestore batch writes take up to 500 at a time; a call stops after this
// many so it stays inside the Worker's limits.
const PER_CALL = 1500;

// A wallet as the apps write it now (`now`: for the looks, a Plus member's):
//   - entries only of the apps that move money (Securities, Play) and the
//     Worker's own. Quadra Hub (once Rewards: word points, games, missions,
//     its shop and points catalogue) and Fixtures write none any more: theirs
//     go, and the NT$ they moved stays in the balance as one entry,
//     `eco:rebase:hub`, so no account's money changes;
//   - none of Securities' markers for points-catalogue vouchers ('stock:xs-');
//   - a Plus month bought with points is a month like any (its 'points' note
//     goes);
//   - no settings that nothing reads (RETIRED_SETTINGS, every app's activity
//     counts `act:<app>` for the old missions, Hub's affinity `aff:vocab`),
//     and an avatar or frame only on a Plus member's pass;
//   - no fields of older versions (`links`, an entry's `peer`).
// Returns the wallet and what went: { wallet, gone: { entries, money, settings, looks } }.
export const RETIRED_SETTINGS = ['oddsWeeklyLimit', 'orbitFollow', 'bests:vocab', 'hub:cleanup:v1', 'aff:vocab'];
const MONEY_APPS = new Set(['eco', 'stock', 'odds']);
const LOOKS = ['avatar', 'frame'];
export function tidyWallet(w, now) {
  const { links, ...rest } = w;
  const gone = { entries: 0, money: 0, settings: 0, looks: 0 };
  const entries = [];
  for (const { peer, ...e } of rest.entries) {
    if (!MONEY_APPS.has(e.app) || e.id.startsWith('stock:xs-')) {
      gone.entries++;
      gone.money += e.amount;
      continue;
    }
    if (e.app === 'eco' && e.kind === 'plus' && e.note === 'points') delete e.note;
    entries.push(e);
  }
  gone.money = Math.round(gone.money * 100) / 100;
  if (gone.money) entries.push({ id: 'eco:rebase:hub', t: now, app: 'eco', kind: 'rebase', amount: gone.money, note: 'hub' });
  const member = plusMember(rest, now);
  const settings = {};
  for (const [k, v] of Object.entries(rest.settings || {})) {
    if (RETIRED_SETTINGS.includes(k) || k.startsWith('act:')) gone.settings++;
    else if (LOOKS.includes(k) && !member) gone.looks++;
    else settings[k] = v;
  }
  return { wallet: { ...rest, entries, settings }, gone };
}

export async function handleAdmin({ env, deps, headers, request, ip, body }) {
  const limited = await deps.rateLimitResponse(env, ip, 'eco:admin', ECO_LIMITS.admin, headers, request);
  if (limited) return limited;
  if (!ADMIN_TOKEN_HASH || typeof body.token !== 'string' || (await deps.sha256Hex(body.token)) !== ADMIN_TOKEN_HASH) return deps.errorJson('FORBIDDEN', 403, headers, request);
  if (!deps.fsList || !deps.fsCollections || !deps.fsBatch) return deps.errorJson('ECO_UNKNOWN_OP', 400, headers, request);
  // Getting an account back whose pass was lost: `wallets` lists every pass
  // (a short reference, when it was made and last used, balance, entries),
  // `device-code` { wallet: reference } makes a one-time device code for it
  // (10 minutes), so its owner signs in and sets a new pass.
  if (body.action === 'wallets') return deps.json({ wallets: await walletList(env, deps) }, 200, headers);
  if (body.action === 'device-code') {
    const ref = typeof body.wallet === 'string' ? body.wallet : '';
    const hits = ref.length >= 6 ? (await deps.fsList(env, WALLET_COLLECTION, 300)).filter(w => w.id.startsWith(ref)) : [];
    if (hits.length !== 1) return deps.errorJson('ECO_PAIR_NOT_FOUND', 404, headers, request);
    const wallet = parseWallet(hits[0].payload);
    const code = deps.generateCode(8);
    const exp = deps.now() + PAIR_MS;
    await deps.fsWrite(env, PAIR_COLLECTION, code, JSON.stringify({ d: hits[0].id, g: gen(wallet), exp }));
    return deps.json({ code, exp }, 200, headers);
  }
  const plan = await planClean(env, deps);
  if (body.action === 'scan') return deps.json(summary(plan), 200, headers);
  if (body.action !== 'clean') return deps.errorJson('ECO_UNKNOWN_OP', 400, headers, request);
  let budget = PER_CALL;
  const done = { deleted: 0, tidied: 0 };
  const deletes = plan.deletes.slice(0, budget);
  for (let i = 0; i < deletes.length; i += 500) await deps.fsBatch(env, deletes.slice(i, i + 500).map(([c, id]) => ({ delete: [c, id] })));
  done.deleted = deletes.length;
  budget -= deletes.length;
  const tidy = plan.tidy.slice(0, Math.max(0, budget));
  for (let i = 0; i < tidy.length; i += 200) await deps.fsBatch(env, tidy.slice(i, i + 200).map(t => ({ update: [WALLET_COLLECTION, t.id, JSON.stringify(t.wallet)], updateTime: t.updateTime })));
  done.tidied = tidy.length;
  return deps.json({ ...done, left: plan.deletes.length - done.deleted + plan.tidy.length - done.tidied, done: plan.deletes.length === done.deleted && plan.tidy.length === done.tidied }, 200, headers);
}

async function walletList(env, deps) {
  const wallets = await deps.fsList(env, WALLET_COLLECTION, 300);
  return wallets.map(w => {
    const wallet = parseWallet(w.payload);
    const last = Math.max(0, ...Object.values(wallet?.apps || {}).map(a => a.last || 0));
    return {
      ref: w.id.slice(0, 8),
      created: wallet?.created ? new Date(wallet.created).toISOString() : null,
      lastUsed: last ? new Date(last).toISOString() : null,
      apps: Object.keys(wallet?.apps || {}),
      entries: wallet?.entries?.length || 0,
      balance: wallet ? poolBalance(wallet) : null,
      gen: wallet ? gen(wallet) : null,
      updateTime: w.updateTime
    };
  });
}

// Everything a clean would do: { counts, deletes: [[collection, id]], tidy: [{ id, wallet, updateTime }] }.
export async function planClean(env, deps) {
  const now = deps.now();
  const collections = await deps.fsCollections(env);
  const counts = {};
  const deletes = [];
  const wallets = await deps.fsList(env, WALLET_COLLECTION, 300);
  counts[WALLET_COLLECTION] = wallets.length;
  const accounts = new Set(wallets.map(w => w.id));
  const inboxIds = new Set();
  const tidy = [];
  const retired = { entries: 0, money: 0, settings: 0, looks: 0 };
  for (const w of wallets) {
    const wallet = parseWallet(w.payload);
    if (!wallet) {
      deletes.push([WALLET_COLLECTION, w.id]);
      accounts.delete(w.id);
      continue;
    }
    for (const ids of Object.values(wallet.inbox || {})) for (const id of ids) inboxIds.add(id);
    const { wallet: next, gone } = tidyWallet(wallet, now);
    if (JSON.stringify(next) === JSON.stringify(wallet)) continue;
    tidy.push({ id: w.id, wallet: next, updateTime: w.updateTime });
    for (const k of ['entries', 'settings', 'looks']) retired[k] += gone[k];
    retired.money = Math.round((retired.money + gone.money) * 100) / 100;
  }
  for (const name of collections) {
    if (name === WALLET_COLLECTION) continue;
    const docs = await deps.fsList(env, name, 300, { idsOnly: name !== SHARE_COLLECTION && name !== PAIR_COLLECTION });
    counts[name] = docs.length;
    if (RETIRED_COLLECTIONS.includes(name)) {
      for (const d of docs) deletes.push([name, d.id]);
      continue;
    }
    if (!keep().has(name)) continue;
    if (Object.values(ECO_APPS).some(a => a.collection === name)) {
      for (const d of docs) if (!accounts.has(d.id)) deletes.push([name, d.id]);
    } else if (name === INBOX_COLLECTION) {
      for (const d of docs) if (!inboxIds.has(d.id) || !accounts.has(d.id.split('-')[0])) deletes.push([name, d.id]);
    } else if (name === SHARE_COLLECTION || name === PAIR_COLLECTION) {
      for (const d of docs) {
        let v = null;
        try {
          v = JSON.parse(d.payload);
        } catch {}
        const ok = v && v.exp > now && (name === PAIR_COLLECTION ? accounts.has(v.d) : accounts.has(v.owner));
        if (!ok) deletes.push([name, d.id]);
      }
    }
  }
  return { collections, counts, deletes, tidy, retired };
}

function summary(plan) {
  const byCollection = {};
  for (const [c] of plan.deletes) byCollection[c] = (byCollection[c] || 0) + 1;
  return {
    collections: plan.collections,
    counts: plan.counts,
    unknown: plan.collections.filter(c => !keep().has(c) && !RETIRED_COLLECTIONS.includes(c)),
    wouldDelete: byCollection,
    wouldTidyWallets: plan.tidy.length,
    // What the tidy takes out: entries, the NT$ they moved (kept in each
    // balance as `eco:rebase:hub`), settings, and looks of non-members.
    wouldRetire: plan.retired
  };
}
