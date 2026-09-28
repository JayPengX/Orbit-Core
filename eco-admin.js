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
//   - in every wallet, settings and fields no app uses any more (tidyWallet).
//
// The token is checked against ADMIN_TOKEN_HASH (its SHA-256; the token
// itself is never in the repo). Clearing the hash turns this off.

import { ECO_APPS, WALLET_COLLECTION, INBOX_COLLECTION, SHARE_COLLECTION, PAIR_COLLECTION, ECO_LIMITS, parseWallet, tidyWallet } from './eco.js';
import { KAMBI_COLLECTION } from './kambi.js';

export const ADMIN_TOKEN_HASH = '863f673335f39a73d7d50a6ab73864985aedb251b6aaee43967f8f864595db63';
export const RETIRED_COLLECTIONS = ['orbit-schedules', 'eco-links'];
// (A function: eco.js and this file import each other.)
const keep = () => new Set([WALLET_COLLECTION, INBOX_COLLECTION, SHARE_COLLECTION, PAIR_COLLECTION, KAMBI_COLLECTION, ...Object.values(ECO_APPS).map(a => a.collection)]);
// Firestore batch writes take up to 500 at a time; a call stops after this
// many so it stays inside the Worker's limits.
const PER_CALL = 1500;

export async function handleAdmin({ env, deps, headers, request, ip, body }) {
  const limited = await deps.rateLimitResponse(env, ip, 'eco:admin', ECO_LIMITS.admin, headers, request);
  if (limited) return limited;
  if (!ADMIN_TOKEN_HASH || typeof body.token !== 'string' || (await deps.sha256Hex(body.token)) !== ADMIN_TOKEN_HASH) return deps.errorJson('FORBIDDEN', 403, headers, request);
  if (!deps.fsList || !deps.fsCollections || !deps.fsBatch) return deps.errorJson('ECO_UNKNOWN_OP', 400, headers, request);
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
  for (const w of wallets) {
    const wallet = parseWallet(w.payload);
    if (!wallet) {
      deletes.push([WALLET_COLLECTION, w.id]);
      accounts.delete(w.id);
      continue;
    }
    for (const ids of Object.values(wallet.inbox || {})) for (const id of ids) inboxIds.add(id);
    const next = tidyWallet(wallet);
    if (JSON.stringify(next) !== JSON.stringify(wallet)) tidy.push({ id: w.id, wallet: next, updateTime: w.updateTime });
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
  return { collections, counts, deletes, tidy };
}

function summary(plan) {
  const byCollection = {};
  for (const [c] of plan.deletes) byCollection[c] = (byCollection[c] || 0) + 1;
  return {
    collections: plan.collections,
    counts: plan.counts,
    unknown: plan.collections.filter(c => !keep().has(c) && !RETIRED_COLLECTIONS.includes(c)),
    wouldDelete: byCollection,
    wouldTidyWallets: plan.tidy.length
  };
}
