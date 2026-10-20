// ---- eco.js ----
// /eco: the Quadra Pass, one account for every Quadra app (Quadra
// Securities, Quadra Play, Orbit Sports, Orbit Words, and Orbit Class
// beside them). Play money only.
//
// The pass is a 10-character code, stored only as its SHA-256 (the
// account's document id), and typed only to sign in. Signing in gives the
// device a refresh token and the app a short session token; everything else
// is done with the session. Devices never keep the pass itself. Behind it:
//
//   - the wallet (collection `eco-wallets`): the shared NT$ money pool and
//     what the apps share with each other, as JSON this Worker merges itself
//     (mergeWallet):
//       entries   money in or out of the pool, each with a fixed id, so the
//                 same entry sent twice counts once
//       snap      each app's latest figures, newest wins per app (Securities'
//                 own cash, Play's money in open bets)
//       settings  newest wins per key (affinities, looks,
//                 notice switches)
//       apps      when each app was first and last opened
//       inbox     other passes' app data a merge brought in, per app
//       live      which app (and session) is the live one
//       sec       the token generation (bumped to sign every device out)
//   - each app's own data (ECO_APPS[app].collection), under the same id;
//   - inbox documents (`eco-inbox`), device codes (`eco-pairs`) and Orbit
//     Class share keys (`eco-shares`).
//
// With a session token (`qt`):
//   GET    /eco?qt=T[&app=A][&inbox=1][&w=W][&since=U]   the wallet, app A's
//            data; `active` says whether this session is the account's live
//            one, and while it is a fresh `token` comes back. The wallet the
//            device holds (`w`, its walletTime) isn't sent again (`same`); nor
//            is A's data when it's still the one of `since` (its updateTime):
//            { unchanged: true, updateTime } in place of `payload`
//   PATCH  /eco?qt=T[&app=A]  { payload?, wallet? }   only while live
//   DELETE /eco?qt=T[&app=A][&inbox=ID]   the account (or one app's data)
//   POST   /eco { op: 'create', app }                 a new pass, signed in
//   POST   /eco { op: 'login', passcode, app }        sign in on this device
//   POST   /eco { op: 'refresh', refresh, app, claim?, data?, inbox?, w?, since? }
//   POST   /eco { op: 'pair-create', qt }             a device code (10 min)
//   POST   /eco { op: 'pair-redeem', code, app }      sign in with it
//   POST   /eco { op: 'handoff', qt }                 sign-in for a link
//   POST   /eco { op: 'redeem', handoff, app }        …redeemed by the app
//   POST   /eco { op: 'signout-all', qt }             every other device out
//   POST   /eco { op: 'rotate', qt }                  a new pass, same account
//   POST   /eco { op: 'merge', qt, sources: [{ passcode }] }  other passes in
//   POST   /eco { op: 'share-create', qt }            an Orbit share key
//   POST   /eco { op: 'share-redeem', qt, key }       a copy of that schedule
//   POST   /eco { op: 'admin', token, action }        the store's clean-up

import { retire } from './money.js';
import { VIP, vipStakes, vipTier, WELCOME, welcomeEarned } from './kit/plus.mjs';
import { storeReady } from './doc-store.js';
import { tokenSecret, signToken, readToken, seal, unseal, sessionLimited, SESSION_MS, REFRESH_MS, HANDOFF_MS } from './quadra-token.js';
import { handleAdmin } from './eco-admin.js';
import { PAY_WEEK, WEEKLY_FROM, weekStart, mondayId, debtOf, activeLoan, loanOffer, loanEntries, loanDue, payoffAmount, reliefCheck, reliefEntry, openStakes } from './kit/loan.mjs';

export const ECO_PASSCODE_LENGTH = 10;
export const ECO_PASSCODE_PATTERN = /^[2-9A-HJ-NP-Z]{10}$/;
export const WALLET_COLLECTION = 'eco-wallets';
export const INBOX_COLLECTION = 'eco-inbox';
export const SHARE_COLLECTION = 'eco-shares';
export const PAIR_COLLECTION = 'eco-pairs';
export const SHARE_MS = 24 * 3_600_000;
export const PAIR_MS = 10 * 60_000;
const CODE8 = /^[2-9A-HJ-NP-Z]{8}$/;

// Each app's data collection.
//   stock  Quadra Securities
//   odds   Quadra Play
//   match  Orbit Sports, a related add-on: follows and services
//   vocab  Orbit Words, a related add-on: word progress
//   orbit  Orbit Class, a related add-on: its class schedule
//   weather  Orbit Weather, a related add-on: its pinned places and settings
//   transit  Orbit Transit, a related add-on: its bus groups, places and settings
//   slip   Orbit Slips, a related add-on: the lottery tickets followed
//   beats  Orbit Beats, a related add-on: its settings and each kit's tempo and roles
//   law    Orbit Law, a related add-on: its followed laws, marks and settings
export const ECO_APPS = {
  stock: { collection: 'stock-study-accounts', maxPayload: 1_000_000 },
  odds: { collection: 'odds-study-accounts', maxPayload: 1_000_000 },
  vocab: { collection: 'vocab-progress-sync', maxPayload: 600_000 },
  match: { collection: 'match-find-settings', maxPayload: 100_000 },
  orbit: { collection: 'orbit-quadra', maxPayload: 200_000 },
  weather: { collection: 'orbit-weather', maxPayload: 50_000 },
  transit: { collection: 'orbit-transit', maxPayload: 200_000 },
  slip: { collection: 'orbit-slip', maxPayload: 300_000 },
  beats: { collection: 'orbit-beats', maxPayload: 50_000 },
  law: { collection: 'orbit-law', maxPayload: 100_000 }
};
// Who can write entries: the apps that move money, and this Worker itself
// ('eco': pay, loans, merges). An app can't write 'eco' entries; the related
// add-ons (Orbit Sports, Hub, Orbit Class) write none.
const ENTRY_APPS = new Set(['stock', 'odds']);

// (D1 holds a row of up to 2 MB.)
export const WALLET_MAX_LENGTH = 1_800_000;
// A wallet past this has its old entries folded into monthly sums (foldWallet).
export const FOLD_AT = 600_000;
const MAX_ENTRIES_PER_WRITE = 1000;
const MAX_AMOUNT = 1_000_000_000;
const MAX_MERGE_SOURCES = 12;

// Per IP an hour, for the calls that take a code (KV counters); calls with a
// session are counted per session and app in memory (TOKEN_LIMIT a minute).
// (admin: the owner's panel, whose token is 32+ random characters; its tools
// call several times a view.)
export const ECO_LIMITS = { create: 20, login: 30, merge: 20, share: 30, admin: 600 };
export const TOKEN_LIMIT = 90;

export function emptyWallet(now = Date.now()) {
  return { v: 1, created: now, entries: [], snap: {}, settings: {}, apps: {}, inbox: {} };
}

// ---- One pool, one weekly pay ---------------------------------------------------
//
// The Worker pays everyone's income into the pool: one fixed pay each Taiwan
// week (from Monday 00:00), on the first sign-in or refresh that week; a week
// nobody opened an app is paid the next time (back pay). Until 2026-10 it was
// monthly (`eco:pay:<month>`); weekly pay (`eco:wpay:<Monday>`) runs from
// WEEKLY_FROM. A pass made since v2 also gets its opening money here.
//
// The economy (tools/economy.mjs has the numbers): NT$200,000 to open and a
// fixed NT$10,000 a week, the same for every account whatever it holds, like
// a salary (v12, 2026-10-19; v10-v11 paid NT$30,000 and NT$6,000 a month).
// Money beyond that is borrowed (信貸, kit/loan.mjs: repaid from the pay) or
// relief for someone with nothing (急難紓困); the house's cut, the broker's
// costs, interest and penalties are the sinks.
export const PAY_MONTH = 6_000;
export const PAY = { start: 200_000, week: PAY_WEEK, month: PAY_MONTH };
export { WEEKLY_FROM };
// The opening money before v12, which the reset below brought accounts to.
const OLD_START = 30_000;
// The reset for accounts made before this economy: their opening money
// (NT$110,000, from the Worker or, before v2, from Securities and Play)
// comes down to NT$30,000, once, as `eco:rebase:v3`. It can take the
// cash below zero: that's an overdraft, and it's fine (see below).
export const REBASE = { id: 'eco:rebase:v3', amount: -80_000 };
const rebaseDue = wallet => {
  const start = (wallet?.entries || []).find(e => e.id === 'eco:start');
  // Before v2 the opening money was the apps' own (Securities' cash, Play's
  // ledger): any such account has something in the pool.
  return start ? start.amount > OLD_START && start.amount !== PAY.start : !wallet?.v2 && ((wallet?.entries || []).length > 0 || Object.keys(wallet?.snap || {}).length > 0);
};
// v12's opening money for accounts that opened with NT$30,000 (an
// `eco:start` below PAY.start, or the reset): the difference, once, as
// `eco:topup:v12` (kind 'start'). It never takes anything.
export const TOPUP_ID = 'eco:topup:v12';
export function topupEntries(wallet, now) {
  const entries = wallet?.entries || [];
  if (entries.some(e => e.id === TOPUP_ID)) return [];
  const start = entries.find(e => e.id === 'eco:start');
  const opened = entries.some(e => e.id === REBASE.id) ? OLD_START : start ? start.amount : null;
  return opened != null && opened < PAY.start ? [{ id: TOPUP_ID, t: now, app: 'eco', kind: 'start', amount: PAY.start - opened }] : [];
}
// The reset assumed NT$110,000. An account that opened with less (only
// Securities' NT$100,000, or only Play's NT$10,000) came out below
// NT$30,000: `eco:rebase:v3fix` gives the difference back, once, when
// Securities has reported its own opening money (`snap.stock.opened`; Play's
// is its `odds:start` entry). It never takes anything.
const OLD_OPENING = 110_000;
export const REBASE_FIX_ID = 'eco:rebase:v3fix';
export function rebaseFix(wallet) {
  const entries = wallet?.entries || [];
  const has = id => entries.some(e => e.id === id);
  const opened = finite(wallet?.snap?.stock?.opened);
  if (!has(REBASE.id) || has('eco:start') || has(REBASE_FIX_ID) || opened == null) return [];
  const play = entries.filter(e => e.id === 'odds:start').reduce((sum, e) => sum + e.amount, 0);
  const amount = Math.round(OLD_OPENING - opened - play);
  return amount > 0 ? [{ id: REBASE_FIX_ID, t: Date.now(), app: 'eco', kind: 'rebase', amount }] : [];
}
// The reset can take the cash below zero; that part of an overdraft is
// Quadra's doing, so it costs nothing (`resetOwed`), and what was charged
// on it before is given back once (`eco:odback:v3`, an 'od' entry).
const resetOwed = wallet => ((wallet?.entries || []).some(e => e.id === REBASE.id) ? -REBASE.amount : 0);
export const OD_BACK_ID = 'eco:odback:v3';
// An overdraft (the pool below zero) costs OVERDRAFT_RATE a month, charged
// with the month's pay on what was owed then, as `eco:od:<month>`:
// cheaper to sell something (or borrow on margin in Securities) than to sit
// on it.
export const OVERDRAFT_RATE = 0.01;
const finiteOr0 = v => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
// (Securities' holdings at what was paid for them, the Worker's count: a
// figure a phone sends can't raise a rank.)
// A loan still owed counts against it: borrowed money is nobody's worth.
export const worthOf = (wallet, now = Date.now()) => poolBalance(wallet) + finiteOr0(wallet?.snap?.stock?.held) - debtOf(wallet, now);
export const payFor = () => PAY.month;
export const PAY_FROM_MONTH = '2026-10';
const TPE = 8 * 3_600_000;
const WEEK = 7 * 86_400_000;
const nextMonth = m => {
  const [y, mo] = m.split('-').map(Number);
  return mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, '0')}`;
};
export const taipeiMonth = t => new Date(t + TPE).toISOString().slice(0, 7);
export { weekStart };

// The pay entries due now that the wallet doesn't have yet.
export function paydayEntries(wallet, now) {
  const have = new Set((wallet.entries || []).map(e => e.id));
  const out = [];
  if (wallet.v2 && !have.has('eco:start')) out.push({ id: 'eco:start', t: now, app: 'eco', kind: 'start', amount: PAY.start });
  if (!have.has(REBASE.id) && rebaseDue(wallet)) out.push({ id: REBASE.id, t: now, app: 'eco', kind: 'rebase', amount: REBASE.amount });
  out.push(...rebaseFix({ ...wallet, entries: [...(wallet.entries || []), ...out] }).map(e => ({ ...e, t: now })));
  const free = resetOwed({ entries: [...(wallet.entries || []), ...out] });
  if (free && !have.has(OD_BACK_ID)) {
    // Each month's interest as it would have been without the reset's part.
    const back = (wallet.entries || []).filter(e => e.app === 'eco' && e.kind === 'od' && e.amount < 0).reduce((sum, e) => sum - e.amount - Math.round(Math.max(0, -e.amount / OVERDRAFT_RATE - free) * OVERDRAFT_RATE), 0);
    if (back > 0) out.push({ id: OD_BACK_ID, t: now, app: 'eco', kind: 'od', amount: back });
  }
  const month = taipeiMonth(now);
  // This month's overdraft interest, on what's owed before the pay, less
  // what the reset made.
  const owed = -(poolBalance(wallet) + out.reduce((sum, e) => sum + e.amount, 0)) - free;
  if (owed >= 100 && month >= PAY_FROM_MONTH && !have.has(`eco:od:${month}`)) out.push({ id: `eco:od:${month}`, t: now, app: 'eco', kind: 'od', amount: -Math.round(owed * OVERDRAFT_RATE) });
  out.push(...topupEntries({ ...wallet, entries: [...(wallet.entries || []), ...out] }, now));
  const created = Number.isFinite(wallet.created) ? Math.min(wallet.created, now) : now;
  // Each month's pay before weekly pay, back pay for the months nobody opened an app.
  if (created < WEEKLY_FROM) {
    const last = taipeiMonth(WEEKLY_FROM - 1);
    let m = taipeiMonth(created) > PAY_FROM_MONTH ? taipeiMonth(created) : PAY_FROM_MONTH;
    for (let n = 0; m <= month && m <= last && n < 120; n++, m = nextMonth(m)) {
      if (!have.has(`eco:pay:${m}`)) out.push({ id: `eco:pay:${m}`, t: now, app: 'eco', kind: 'pay', amount: payFor() });
    }
  }
  // Each week's pay from WEEKLY_FROM (or the week the pass was made), back pay too.
  for (let w = weekStart(Math.max(created, WEEKLY_FROM)), n = 0; w <= now && n < 520; w += WEEK, n++) {
    const id = `eco:wpay:${mondayId(w)}`;
    if (!have.has(id)) out.push({ id, t: now, app: 'eco', kind: 'pay', amount: PAY.week });
  }
  // The loan's installments come out of the pay (kit/loan.mjs loanDue).
  out.push(...loanDue(wallet, poolBalance({ ...wallet, entries: [...(wallet.entries || []), ...out] }), now));
  // Quadra Plus ended: what was paid for the time left comes back, once.
  out.push(...plusRefundEntries(wallet, now));
  // VIP cashback on the months before this one, and the welcome bonus bet.
  out.push(...vipEntries(wallet, now), ...welcomeEntries(wallet, now));
  // Level rewards for wealth levels reached (after the pay that may reach one).
  out.push(...rankEntries({ ...wallet, entries: [...(wallet.entries || []), ...out] }, now));
  return out;
}

// ---- 財富等級: wealth levels and their one-time rewards -----------------------------
//
// What the account is worth (the pool and Securities' holdings, less a
// loan's debt) puts it on a level; the first time it reaches one, the
// economy pays that level's reward once (`eco:rank:<id>`, kind 'rank'). Falling
// back keeps what was paid; reaching a level again pays nothing. The same
// table as the kit's WEALTH_RANKS.
//
// Scaled 2026-10-20 to NT$200,000 opening money and NT$10,000 a week (the
// owner: "財富等級 need adjustment"): a new pass starts at 起步, and the first
// level is NT$100,000 of real gains away (about ten weeks' pay saved). The
// old table's levels (50,000 to 20M, `eco:rank:saver`…) were nearly all
// reached by the opening money alone; what they paid stays and counts
// towards the new rewards (OLD_RANKS), so no wealth is rewarded twice.
export const RANKS = [
  { id: 'start', min: 0, reward: 0 },
  { id: 'thrifty', min: 300_000, reward: 3_000 },
  { id: 'solid', min: 500_000, reward: 5_000 },
  { id: 'welloff', min: 1_000_000, reward: 10_000 },
  { id: 'affluent', min: 3_000_000, reward: 20_000 },
  { id: 'tenmil', min: 10_000_000, reward: 50_000 },
  { id: 'hundredmil', min: 100_000_000, reward: 100_000 }
];
const OLD_RANKS = new Set(['saver', 'steady', 'comfort', 'wealthy', 'rich', 'multi', 'tycoon'].map(id => `eco:rank:${id}`));
export function rankEntries(wallet, now) {
  const entries = wallet?.entries || [];
  const have = new Set(entries.map(e => e.id));
  const worth = worthOf(wallet, now);
  // What the old levels paid, less what new ones have already taken from it.
  let credit = entries.filter(e => e.app === 'eco' && e.kind === 'rank' && OLD_RANKS.has(e.id)).reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
  for (const r of RANKS) if (have.has(`eco:rank:${r.id}`)) credit -= r.reward - (Number(entries.find(e => e.id === `eco:rank:${r.id}`)?.amount) || 0);
  const out = [];
  for (const r of RANKS) {
    if (!(r.reward > 0) || worth < r.min || have.has(`eco:rank:${r.id}`)) continue;
    const used = Math.min(Math.max(0, credit), r.reward);
    credit -= used;
    out.push({ id: `eco:rank:${r.id}`, t: now, app: 'eco', kind: 'rank', amount: r.reward - used, note: r.id });
  }
  return out;
}

// ---- VIP cashback and the welcome offer ---------------------------------------------
//
// VIP (the kit's VIP, the same table): a Taiwan month's gaming stakes (Play's
// bets and lottery and scratch tickets, less refunds) set its tier, and the
// tier's share of them is paid back once the month is over, on the first
// read after it (`eco:vip:<month>`, kind 'vip', the tier in the note). Every
// product keeps 14% or more of its stakes; the top rate is 1.5%.
// (The table and a month's stakes are the kit's, plus.mjs: one copy.)
export { VIP, vipStakes, vipTier };
export function vipEntries(wallet, now) {
  const have = new Set((wallet?.entries || []).map(e => e.id));
  const month = taipeiMonth(now);
  const out = [];
  for (let m = VIP.from, n = 0; m < month && n < 36; m = nextMonth(m), n++) {
    if (have.has(`eco:vip:${m}`)) continue;
    const stakes = vipStakes(wallet, m);
    const tier = vipTier(stakes);
    if (tier) out.push({ id: `eco:vip:${m}`, t: now, app: 'eco', kind: 'vip', amount: Math.floor(stakes * tier.back), note: tier.id });
  }
  return out;
}
// The welcome offer: after the first paid bet in Play, a NT$WELCOME.bet free
// bet (`eco:fb:welcome`, once per account; 7 days, like every free bet). A
// qualifying bet is one stake of a ticket's worth at least (plus.mjs
// welcomeEarned, the kit's rule): an app may write a stake of its own (a
// spend), so a NT$0.01 one, or a free bet's top-up, would buy NT$200 otherwise.
export { WELCOME };
export function welcomeEntries(wallet, now) {
  const entries = wallet?.entries || [];
  if (entries.some(e => e.id === 'eco:fb:welcome') || !welcomeEarned(wallet)) return [];
  return [{ id: 'eco:fb:welcome', t: now, app: 'eco', kind: 'freebet', amount: 0, note: String(WELCOME.bet) }];
}
export { WEEK };

// ---- Quadra Plus, ended ------------------------------------------------------------
//
// The paid membership ended at PLUS_END (2026-10-20 00:00 Taipei; the owner:
// "remove Plus completely", and "don't refund free trial"). Its looks are
// free for everyone (the kit), old `eco:plus:<month>` entries stay as
// history, and each pass gets back once what it had paid for the time left
// (`eco:plusrefund:v1`, kind 'plusrefund'): a month's charge by the share of
// the days it covered that fall after the end, a yearly plan's fee spread
// over its months the same way. A free trial month (amount 0) paid nothing,
// so it refunds nothing.
export const PLUS_END = Date.UTC(2026, 9, 19, 16);
export const PLUS_REFUND_ID = 'eco:plusrefund:v1';
const PLUS_FEE = 490;
const DAY_MS = 86_400_000;
function monthDays(m) {
  const [y, mo] = m.split('-').map(Number);
  return new Date(Date.UTC(y, mo, 0)).getUTCDate();
}
// A month's span in ms (Taipei), and its overlap with [PLUS_END, ∞).
const monthStart = m => Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)) - 1, 1) - TPE;
const after = (from, to) => Math.max(0, to - Math.max(from, PLUS_END));
export function plusRefund(wallet) {
  const months = (wallet?.entries || []).filter(e => e.app === 'eco' && e.kind === 'plus' && typeof e.id === 'string' && /^eco:plus:\d{4}-\d{2}$/.test(e.id));
  let back = 0;
  // A yearly plan: the entries one payment wrote (same time, note 'year'),
  // the fee on the first; each month's share is the fee over them.
  const years = new Map();
  for (const e of months) {
    if (e.note === 'year') {
      const g = years.get(e.t) || [];
      g.push(e);
      years.set(e.t, g);
      continue;
    }
    const paid = -Number(e.amount) || 0;
    if (paid <= 0) continue;
    const m = e.id.slice(9);
    const end = monthStart(m) + monthDays(m) * DAY_MS;
    // A full fee covers the month; a join's part fee, from the day it was paid.
    const from = paid >= PLUS_FEE ? monthStart(m) : Math.max(monthStart(m), Math.floor((e.t + TPE) / DAY_MS) * DAY_MS - TPE);
    if (end > from) back += (paid * after(from, end)) / (end - from);
  }
  for (const g of years.values()) {
    const paid = -g.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
    if (paid <= 0) continue;
    for (const e of g) {
      const m = e.id.slice(9);
      const from = monthStart(m);
      const end = from + monthDays(m) * DAY_MS;
      back += ((paid / g.length) * after(from, end)) / (end - from);
    }
  }
  return Math.round(back);
}
export function plusRefundEntries(wallet, now) {
  if (now < PLUS_END || (wallet?.entries || []).some(e => e.id === PLUS_REFUND_ID)) return [];
  const amount = plusRefund(wallet);
  return amount > 0 ? [{ id: PLUS_REFUND_ID, t: now, app: 'eco', kind: 'plusrefund', amount }] : [];
}

const isObj = v => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : undefined);
const finite = v => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
const cleanCode = v =>
  String(v || '')
    .trim()
    .toUpperCase()
    .replace(/[\s-]/g, '');

// One entry as stored: anything malformed is dropped, not stored.
export function cleanEntry(e, { allowEco = false } = {}) {
  if (!isObj(e)) return null;
  const id = str(e.id, 96);
  const t = finite(e.t);
  const amount = finite(e.amount);
  const app = str(e.app, 12);
  if (!id || t == null || amount == null || Math.abs(amount) > MAX_AMOUNT) return null;
  if (!(ENTRY_APPS.has(app) || (allowEco && app === 'eco'))) return null;
  // The Worker's own ids (pay, loans) are its alone.
  if (!allowEco && id.startsWith('eco:')) return null;
  const out = { id, t: Math.round(t), app, kind: str(e.kind, 24) || 'other', amount: Math.round(amount * 100) / 100 };
  const note = str(e.note, 80);
  if (note) out.note = note;
  return out;
}

// A newest-wins map (snap, settings): every value an object with `t`.
function cleanStamped(map, maxKeys, maxValue) {
  const out = {};
  if (!isObj(map)) return out;
  for (const [k, v] of Object.entries(map).slice(0, maxKeys)) {
    if (k.length > 96 || !isObj(v) || finite(v.t) == null) continue;
    if (JSON.stringify(v).length > maxValue) continue;
    out[k] = v;
  }
  return out;
}

// The lock-down (the owner, 2026-10-12): no app adds money to the pool; this
// Worker does (Play's payouts, cash outs and prizes: settle.js, lotto.js).
// An app's entries are what it spends (0 or less). The one exception: a Play
// slip from before the lock-down whose picks every device lost, refunded once
// (its stake back, refundLost), as long as the Worker never paid it.
export const LOCK_SINCE = Date.parse('2026-10-12T09:00:00Z');
export function appEntries(entries, wallet) {
  const have = new Map((wallet?.entries || []).map(e => [e.id, e]));
  return entries.filter(e => {
    if (e.amount <= 0) return true;
    if (e.app !== 'odds' || e.kind !== 'refund') return false;
    const slip = /^odds:refund-(.+)$/.exec(e.id)?.[1];
    const stake = slip ? have.get(`odds:stake-${slip}`) : null;
    return Boolean(stake && stake.t < LOCK_SINCE && Math.abs(e.amount + stake.amount) < 0.01 && !have.has(`odds:payout-${slip}`));
  });
}

// An app's figures (snap): its own key only. Securities' cash, holdings'
// cost and opening money are the Worker's (stock-check.js `stock`, from the
// save that came with them), never a phone's; without a checked save they
// stay as they were.
const WORKER_FIGURES = new Set(['cash', 'held', 'opened']);
const phoneFigures = own => Object.fromEntries(Object.entries(own || {}).filter(([k]) => !WORKER_FIGURES.has(k)));
export function appSnap(snap, app, wallet, stock, now = Date.now()) {
  const own = snap?.[app];
  if (app !== 'stock') return own ? { [app]: phoneFigures(own) } : {};
  const had = wallet?.snap?.stock || {};
  const kept = { cash: had.cash ?? 0, held: had.held ?? 0, ...(had.opened != null ? { opened: had.opened } : {}) };
  if (stock) return { stock: { ...had, ...phoneFigures(own), cash: stock.cash, held: stock.held, ...(stock.opened != null ? { opened: stock.opened } : {}), t: Math.max(now, own?.t || 0, (had.t || 0) + 1) } };
  return own ? { stock: { ...phoneFigures(own), ...kept } } : {};
}
// An app's new entries dated by this Worker (a phone's clock can't put an
// entry before the lock-down); one already in the wallet keeps its own.
export const stamped = (entries, wallet, now) => {
  const have = new Set((wallet?.entries || []).map(e => e.id));
  return entries.map(e => (have.has(e.id) ? e : { ...e, t: now }));
};

// Settings and figures (newest wins) dated no later than this Worker's now:
// a phone clock set ahead stamped them in the future, and then every later
// change, from any device, lost to them (the server's time wins).
const clampTimes = (map, now) => {
  if (!isObj(map) || !Object.values(map).some(v => v?.t > now)) return map;
  return Object.fromEntries(Object.entries(map).map(([k, v]) => [k, v?.t > now ? { ...v, t: now } : v]));
};
export function atMostNow(w, now) {
  const [snap, settings] = [clampTimes(w?.snap, now), clampTimes(w?.settings, now)];
  return !w || (snap === w.snap && settings === w.settings) ? w : { ...w, snap, settings };
}

// What a client may send to change the wallet.
export function cleanPatch(patch) {
  if (!isObj(patch)) return { entries: [], snap: {}, settings: {} };
  return {
    entries: (Array.isArray(patch.entries) ? patch.entries.slice(0, MAX_ENTRIES_PER_WRITE) : []).map(e => cleanEntry(e)).filter(Boolean),
    snap: cleanStamped(patch.snap, 8, 4000),
    settings: cleanStamped(patch.settings, 32, 4000)
  };
}

const newest = (a = {}, b = {}) => {
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) if (!out[k] || v.t >= out[k].t) out[k] = v;
  return out;
};

// Two wallets (or a wallet and a patch) as one: entries by id (the first
// copy kept, since an entry never changes), the rest newest-wins.
export function mergeWallet(a, b) {
  const base = a || emptyWallet();
  if (!b) return base;
  const entries = new Map(base.entries.map(e => [e.id, e]));
  for (const e of b.entries || []) if (!entries.has(e.id)) entries.set(e.id, e);
  const inbox = { ...(base.inbox || {}) };
  for (const [app, ids] of Object.entries(b.inbox || {})) inbox[app] = [...new Set([...(inbox[app] || []), ...ids])];
  const created = Math.min(base.created ?? Infinity, b.created ?? Infinity);
  return {
    v: 1,
    created: created === Infinity ? Date.now() : created,
    entries: [...entries.values()].sort((x, y) => x.t - y.t || (x.id < y.id ? -1 : 1)),
    snap: newest(base.snap, b.snap),
    settings: newest(base.settings, b.settings),
    apps: { ...(base.apps || {}), ...(b.apps || {}) },
    inbox,
    // The Worker's own fields: a patch never carries them.
    ...(base.v2 || b.v2 ? { v2: base.v2 || b.v2 } : {}),
    ...(base.live ? { live: base.live } : {}),
    ...(base.sec ? { sec: base.sec } : {}),
    ...(base.merged ? { merged: base.merged } : {})
  };
}

// The pool's NT$ right now: every entry plus each app's shared cash figure.
export function poolBalance(wallet) {
  const entries = (wallet?.entries || []).reduce((sum, e) => sum + e.amount, 0);
  // (Only Securities' cash counts: the Worker's own figure, stock-check.js.)
  const snaps = finite(wallet?.snap?.stock?.cash) ?? 0;
  return Math.round((entries + snaps) * 100) / 100;
}

export function parseWallet(text) {
  try {
    const w = JSON.parse(text);
    if (isObj(w) && w.v === 1 && Array.isArray(w.entries)) return { ...emptyWallet(w.created), ...w };
  } catch {}
  return null;
}

// How often a save of an app's data alone notes the app's last use in the wallet.
const TOUCH_EVERY_MS = 10 * 60_000;
function touchApp(wallet, app, now) {
  if (!ECO_APPS[app]) return wallet;
  const had = wallet.apps?.[app];
  return { ...wallet, apps: { ...(wallet.apps || {}), [app]: { first: had?.first ?? now, last: now } } };
}

// What clients see of the wallet: not the Worker's own bookkeeping.
export function publicWallet(w) {
  if (!w) return w;
  const { sec, ...rest } = w;
  return rest;
}

const isActive = (wallet, claims) => wallet?.live?.sid === claims.s && wallet?.live?.app === claims.a;
export const gen = wallet => wallet?.sec?.gen || 0;
const liveOf = wallet => (wallet?.live ? { app: wallet.live.app, t: wallet.live.t } : null);

// ---- Handler ---------------------------------------------------------------
//
// deps: the Worker's own plumbing, passed in so this file stays testable:
// { json, errorJson, upstreamFailed, readJsonBody, INVALID_BODY,
//   rateLimitResponse, fsGet(env, collection, id), fsWrite(env, collection,
//   id, payload, precondition), fsDelete(env, collection, id), fsList?,
//   fsCollections?, sha256Hex, generateCode(length), now() }.
//   fsWrite's precondition is { updateTime } or { exists: false }, and a
//   failed one throws an error with `precondition: true`.

const OPS = {
  create: ecoCreate,
  login: ecoLogin,
  refresh: ecoRefresh,
  'pair-create': pairCreate,
  'pair-redeem': pairRedeem,
  handoff: ecoHandoff,
  redeem: ecoRedeem,
  'signout-all': ecoSignOutAll,
  rotate: ecoRotate,
  merge: ecoMerge,
  'share-create': shareCreate,
  'share-redeem': shareRedeem,
  loan: ecoLoan,
  relief: ecoRelief,
  admin: ctx => handleAdmin(ctx)
};

export async function handleEcoRequest(request, env, headers, ip, deps) {
  const { json, errorJson, upstreamFailed } = deps;
  if (!['GET', 'POST', 'PATCH', 'DELETE'].includes(request.method)) return errorJson('SYNC_METHOD_NOT_ALLOWED', 405, headers, request);
  if (!storeReady(env)) return errorJson('MISSING_STORE', 500, headers, request);

  const url = new URL(request.url);
  const app = url.searchParams.get('app') || '';
  if (app && !ECO_APPS[app]) return errorJson('ECO_UNKNOWN_APP', 400, headers, request);
  const secret = await tokenSecret(env);

  try {
    // A save and an inbox item dropped also come as a POST (`op: 'write'`,
    // `op: 'drop-inbox'`, the session in the body): a POST of plain text is
    // one request, where a PATCH or DELETE is two (the browser asks first).
    let method = request.method;
    let body = null;
    if (method === 'POST' || method === 'PATCH') {
      body = await deps.readJsonBody(request);
      if (body === deps.INVALID_BODY || !isObj(body)) return errorJson('INVALID_JSON', 400, headers, request);
    }
    if (method === 'POST') {
      if (body.op === 'write') method = 'PATCH';
      else if (body.op === 'drop-inbox') method = 'DELETE';
      else {
        const run = OPS[body.op];
        if (!run) return errorJson('ECO_UNKNOWN_OP', 400, headers, request);
        return await run({ request, env, headers, ip, deps, body, app: app || str(body.app, 12) || '', secret });
      }
    }

    // Everything else needs a session.
    const claims = await readToken(secret, (method !== request.method && str(body.qt, 4096)) || url.searchParams.get('qt'), 'ses', deps.now());
    if (!claims) return errorJson('ECO_TOKEN_INVALID', 401, headers, request);
    if (sessionLimited(`${app}:${claims.s}`, TOKEN_LIMIT, 60_000, deps.now())) return errorJson('RATE_LIMITED', 429, headers, request);
    const docId = claims.d;

    if (method === 'GET') {
      const walletDoc = await deps.fsGet(env, WALLET_COLLECTION, docId);
      let wallet = walletDoc.exists ? parseWallet(walletDoc.payload) : null;
      if (!wallet || claims.g !== gen(wallet)) return errorJson('ECO_SIGNED_OUT', 401, headers, request);
      let walletTime = walletDoc.updateTime;
      const out = { exists: true, active: isActive(wallet, claims), live: liveOf(wallet) };
      if (out.active) {
        if (paydayEntries(wallet, deps.now()).length) {
          const paid = await updateWallet(env, deps, docId, w => mergeWallet(w, { entries: paydayEntries(w, deps.now()) }));
          if (paid) ({ wallet, updateTime: walletTime } = paid);
        }
        out.token = await sessionToken(secret, claims, deps.now());
      }
      Object.assign(out, { wallet: publicWallet(wallet), walletTime, pool: poolBalance(wallet), updateTime: '', payload: '' });
      sameWallet(out, url.searchParams.get('w'));
      if (app) {
        Object.assign(out, await appData(env, deps, app, docId, url.searchParams.get('since')));
        if (url.searchParams.get('inbox') === '1') out.inbox = await readInbox(env, deps, wallet, app);
      }
      return json(out, 200, headers);
    }

    if (method === 'PATCH') {
      // An app writes its own data only (the kit's write names its own app):
      // a session of one app can't save another's (Securities' money, Class's
      // schedule) or its figures.
      if (app && app !== claims.a) return errorJson('ECO_UNKNOWN_APP', 403, headers, request);
      const hasPayload = body.payload !== undefined;
      if (hasPayload && !(app && typeof body.payload === 'string' && body.payload && body.payload.length <= ECO_APPS[app].maxPayload)) {
        return errorJson('MISSING_PAYLOAD', 400, headers, request);
      }
      const now = deps.now();
      let refused = null;
      // Securities' save: its money counted by the Worker (stock-check.js).
      const stock = app === 'stock' && hasPayload && deps.checkStock ? await deps.checkStock(env, docId, body.payload, (await deps.fsGet(env, WALLET_COLLECTION, docId).then(d => (d.exists ? parseWallet(d.payload) : null)))).catch(() => null) : null;
      const result = await updateWallet(
        env,
        deps,
        docId,
        w => {
          refused = null;
          if (claims.g !== gen(w)) return (refused = 'ECO_SIGNED_OUT'), w;
          // Only the live app writes: an app the person has moved away from
          // must not overwrite what the live one did since.
          if (!isActive(w, claims)) return (refused = 'ECO_SESSION_MOVED'), w;
          // What falls due with the write comes with it (fixed ids: never
          // twice): the welcome bonus bet right after a first bet.
          const patch = atMostNow(cleanPatch(body.wallet), now);
          w = atMostNow(w, now);
          // A save of the app's data alone (nothing for the wallet, no
          // payday due, the app's last use noted within 10 minutes): the
          // wallet isn't rewritten (it was, whole, at every save: Words saves
          // at each answer).
          if (!patch.entries.length && !Object.keys(patch.snap).length && !Object.keys(patch.settings).length && !stock && now - (w.apps?.[app]?.last || 0) < TOUCH_EVERY_MS && !paydayEntries(w, now).length) return w;
          const merged = mergeWallet(w, { ...patch, entries: stamped(appEntries(patch.entries, w), w, now), snap: appSnap(patch.snap, app, w, stock, now) });
          return touchApp(mergeWallet(merged, { entries: paydayEntries(merged, now) }), app, now);
        },
        { skipIf: () => refused }
      );
      if (!result) return errorJson('ECO_SIGNED_OUT', 401, headers, request);
      if (refused) return json({ error: { code: refused, message: refused }, live: liveOf(result.wallet) }, refused === 'ECO_SIGNED_OUT' ? 401 : 409, headers);
      const out = { wallet: publicWallet(result.wallet), walletTime: result.updateTime, pool: poolBalance(result.wallet), token: await sessionToken(secret, claims, now) };
      // (A save that left the wallet as the device holds it: not sent back.)
      if (body.w && body.w === result.updateTime) {
        delete out.wallet;
        out.same = true;
      }
      if (hasPayload) out.updateTime = (await deps.fsWrite(env, ECO_APPS[app].collection, docId, body.payload)).updateTime;
      return json(out, 200, headers);
    }

    // DELETE
    const w = await deps.fsGet(env, WALLET_COLLECTION, docId);
    const wallet = w.exists ? parseWallet(w.payload) : null;
    if (!wallet || claims.g !== gen(wallet)) return errorJson('ECO_SIGNED_OUT', 401, headers, request);
    const inboxId = method !== request.method ? str(body.inbox, 200) : url.searchParams.get('inbox');
    // (Dropping an inbox item never falls through to deleting the app's data or the account.)
    if (method !== request.method && !inboxId) return errorJson('ECO_INBOX_MISSING', 400, headers, request);
    if (inboxId) {
      if (!app) return errorJson('ECO_UNKNOWN_APP', 400, headers, request);
      const result = await updateWallet(env, deps, docId, x => ({ ...x, inbox: { ...x.inbox, [app]: (x.inbox?.[app] || []).filter(id => id !== inboxId) } }));
      if (result && inboxId.startsWith(`${docId}-`)) await deps.fsDelete(env, INBOX_COLLECTION, inboxId);
      return json({ deleted: true }, 200, headers);
    }
    if (app) {
      await deps.fsDelete(env, ECO_APPS[app].collection, docId);
      return json({ deleted: true }, 200, headers);
    }
    await deleteAccount(env, deps, docId, { retire: true });
    return json({ deleted: true }, 200, headers);
  } catch (error) {
    return upstreamFailed(error, headers);
  }
}

// (Read side by side, not one after another: up to 12 round trips to D1.)
async function readInbox(env, deps, wallet, app) {
  const ids = (wallet.inbox?.[app] || []).slice(0, 12);
  const items = await Promise.all(ids.map(id => deps.fsGet(env, INBOX_COLLECTION, id)));
  return ids.map((id, i) => items[i].exists && { id, payload: items[i].payload }).filter(Boolean);
}

const sessionToken = (secret, c, now) => signToken(secret, { k: 'ses', d: c.d, a: c.a, s: c.s, g: c.g, e: now + SESSION_MS });
const refreshToken = (secret, c, now) => signToken(secret, { k: 'ref', d: c.d, s: c.s, g: c.g, e: now + REFRESH_MS });

// ---- Sessions -------------------------------------------------------------------

// A new device session on account `docId` for `app`, made the live one: the
// reply every way of signing in shares (a refresh token for the device, a
// session for the app, the wallet and the app's data).
async function signIn(ctx, docId, { passcode = null } = {}) {
  const { env, headers, deps, secret, body, app } = ctx;
  if (!ECO_APPS[app]) return deps.errorJson('ECO_UNKNOWN_APP', 400, headers, ctx.request);
  const now = deps.now();
  const sid = deps.generateCode(12);
  const result = await updateWallet(env, deps, docId, w => ({ ...touchApp(mergeWallet(w, { entries: paydayEntries(w, now) }), app, now), live: { sid, app, t: now } }));
  if (!result) return null;
  const c = { d: docId, s: sid, a: app, g: gen(result.wallet) };
  const out = await sessionReply(env, deps, secret, result, c, now, { app, inbox: body.inbox });
  out.refresh = await refreshToken(secret, c, now);
  if (passcode) out.passcode = passcode;
  return deps.json(out, 200, headers);
}

// App `app`'s data for the account: { payload, updateTime } ('' for none),
// or { unchanged: true, updateTime } when it's still the one the device
// holds (`since`, the updateTime it came with).
async function appData(env, deps, app, docId, since = '') {
  const doc = await deps.fsGet(env, ECO_APPS[app].collection, docId);
  if (!doc.exists) return { payload: '', updateTime: '' };
  if (since && since === doc.updateTime) return { unchanged: true, payload: undefined, updateTime: doc.updateTime };
  return { payload: doc.payload, updateTime: doc.updateTime };
}

// The wallet the device already holds (`w`, its walletTime): not sent again.
function sameWallet(out, w) {
  if (!w || !out.walletTime || w !== out.walletTime) return out;
  delete out.wallet;
  out.same = true;
  return out;
}

async function sessionReply(env, deps, secret, result, c, now, { app, inbox = false, since = '' } = {}) {
  const out = {
    token: await sessionToken(secret, c, now),
    active: true,
    wallet: publicWallet(result.wallet),
    walletTime: result.updateTime,
    pool: poolBalance(result.wallet),
    payload: '',
    updateTime: ''
  };
  if (app) {
    Object.assign(out, await appData(env, deps, app, c.d, since));
    if (inbox) out.inbox = await readInbox(env, deps, result.wallet, app);
  }
  return out;
}

async function limited(ctx, feature) {
  return ctx.deps.rateLimitResponse(ctx.env, ctx.ip, `eco:${feature}`, ECO_LIMITS[feature], ctx.headers, ctx.request);
}

// Passes are handed out by the owner (eco-admin.js, `issue`), not made by
// anyone who opens an app: a new pass here only where ECO_OPEN_SIGNUP is on
// (the tests).
async function ecoCreate(ctx) {
  const { env, deps, headers, request, app } = ctx;
  if (env.ECO_OPEN_SIGNUP !== 'on') return deps.errorJson('ECO_CREATE_CLOSED', 403, headers, request);
  const hit = await limited(ctx, 'create');
  if (hit) return hit;
  if (!ECO_APPS[app]) return deps.errorJson('ECO_UNKNOWN_APP', 400, headers, request);
  const now = deps.now();
  const { passcode, docId } = await newPasscode(env, deps);
  await updateWallet(env, deps, docId, w => ({ ...w, v2: now }), { create: true });
  return signIn(ctx, docId, { passcode });
}

// Sign in with the pass.
async function ecoLogin(ctx) {
  const { deps, headers, request, body } = ctx;
  const hit = await limited(ctx, 'login');
  if (hit) return hit;
  const passcode = cleanCode(body.passcode);
  if (!ECO_PASSCODE_PATTERN.test(passcode)) return deps.errorJson('INVALID_PASSCODE', 400, headers, request);
  const res = await signIn(ctx, await deps.sha256Hex(passcode));
  return res || deps.errorJson('SYNC_PASSCODE_NOT_FOUND', 404, headers, request);
}

// A device's refresh token for a session in `app`. With `claim` this app
// becomes the live one; without, a session comes back only if it already
// is (else { active: false, live }). The refresh token is renewed each time.
async function ecoRefresh(ctx) {
  const { env, headers, deps, body, secret, app, request } = ctx;
  const { json, errorJson } = deps;
  const now = deps.now();
  const c = await readToken(secret, body.refresh, 'ref', now);
  if (!c) return errorJson('ECO_TOKEN_INVALID', 401, headers, request);
  if (!ECO_APPS[app]) return errorJson('ECO_UNKNOWN_APP', 400, headers, request);
  if (sessionLimited(`r:${c.s}`, 30, 60_000, now)) return errorJson('RATE_LIMITED', 429, headers, request);
  const doc = await deps.fsGet(env, WALLET_COLLECTION, c.d);
  const wallet = doc.exists ? parseWallet(doc.payload) : null;
  if (!wallet || gen(wallet) !== c.g) return errorJson('ECO_SIGNED_OUT', 401, headers, request);
  const claims = { d: c.d, s: c.s, a: app, g: c.g };
  const live = isActive(wallet, claims);
  const w = str(body.w, 100);
  if (!live && !body.claim) return json(sameWallet({ active: false, live: liveOf(wallet), wallet: publicWallet(wallet), walletTime: doc.updateTime, pool: poolBalance(wallet) }, w), 200, headers);
  let result = { wallet, updateTime: doc.updateTime };
  if (!live || paydayEntries(wallet, now).length) {
    result = await updateWallet(env, deps, c.d, w => ({ ...touchApp(mergeWallet(w, { entries: paydayEntries(w, now) }), app, now), live: { sid: c.s, app, t: now } }));
  }
  const out = sameWallet(await sessionReply(env, deps, secret, result, claims, now, { app: body.data ? app : '', inbox: body.inbox, since: str(body.since, 100) }), w);
  out.refresh = await refreshToken(secret, claims, now);
  // Taken back from another device or app that was live meanwhile: this
  // app's copy may be behind (the kit tells the app, 'active').
  if (!live && wallet.live) out.took = true;
  return json(out, 200, headers);
}

async function sessionFor(ctx) {
  return readToken(ctx.secret, ctx.body.qt, 'ses', ctx.deps.now());
}
// A session whose account still stands at the same generation.
async function liveSession(ctx) {
  const c = await sessionFor(ctx);
  if (!c) return null;
  const doc = await ctx.deps.fsGet(ctx.env, WALLET_COLLECTION, c.d);
  const wallet = doc.exists ? parseWallet(doc.payload) : null;
  return wallet && gen(wallet) === c.g ? c : null;
}

// The Worker's one way to change the wallet for an op: paid up first, then
// `change(paid)` gives the entries to add (or a refusal code). Only the live
// app can do it.
async function walletOp(ctx, limitKey, change) {
  const { env, deps, headers, request, body, secret } = ctx;
  const now = deps.now();
  const c = await readToken(secret, body.qt, 'ses', now);
  if (!c) return deps.errorJson('ECO_TOKEN_INVALID', 401, headers, request);
  if (sessionLimited(`${limitKey}:${c.s}`, 10, 60_000, now)) return deps.errorJson('RATE_LIMITED', 429, headers, request);
  let refused = null;
  let extra = {};
  const result = await updateWallet(
    env,
    deps,
    c.d,
    w => {
      refused = null;
      if (gen(w) !== c.g) return (refused = 'ECO_SIGNED_OUT'), w;
      if (!isActive(w, c)) return (refused = 'ECO_SESSION_MOVED'), w;
      const paid = mergeWallet(w, { entries: paydayEntries(w, now) });
      const r = change(paid, now);
      extra = r.extra || {};
      if (r.refused) return (refused = r.refused), w;
      const done = mergeWallet(paid, { entries: r.entries });
      // A loan settled can reach a level: its reward with it.
      return mergeWallet(done, { entries: rankEntries(done, now) });
    },
    { skipIf: () => refused }
  );
  if (!result) return deps.errorJson('ECO_SIGNED_OUT', 401, headers, request);
  if (refused) return deps.json({ error: { code: refused, message: refused, ...extra }, live: liveOf(result.wallet) }, refused === 'ECO_SIGNED_OUT' ? 401 : 409, headers);
  return deps.json({ wallet: publicWallet(result.wallet), walletTime: result.updateTime, pool: poolBalance(result.wallet), ...extra }, 200, headers);
}

// 信貸 (kit/loan.mjs has the rules): { op: 'loan', qt, action: 'borrow',
// amount, weeks } signs a loan the account qualifies for (the money in,
// the 開辦費 out); { action: 'payoff' } clears the active one from the
// balance (with 提前清償違約金 in the first year, or what's owed in 催收).
async function ecoLoan(ctx) {
  const { body } = ctx;
  return walletOp(ctx, 'loan', (w, now) => {
    if (body.action === 'borrow') {
      const offer = loanOffer(w, finite(body.amount), finite(body.weeks), now);
      if (!offer.ok) return { refused: 'ECO_LOAN_REFUSED', extra: { why: offer.why, ...(offer.max != null ? { max: offer.max } : {}), ...(offer.until ? { until: offer.until } : {}) } };
      return { entries: loanEntries(offer, now), extra: { loan: offer } };
    }
    if (body.action === 'payoff') {
      const loan = activeLoan(w);
      if (!loan) return { refused: 'ECO_LOAN_NONE' };
      const amount = payoffAmount(loan, now);
      if (poolBalance(w) < amount) return { refused: 'ECO_LOAN_FUNDS', extra: { need: amount } };
      return { entries: [{ id: `eco:loanoff:${loan.id}`, t: now, app: 'eco', kind: 'loanoff', amount: -amount }] };
    }
    return { refused: 'ECO_LOAN_ACTION' };
  });
}

// 急難紓困: { op: 'relief', qt } pays RELIEF.amount to an account with
// nothing (cash, stocks at cost and open bets under RELIEF.under), on the
// kit's conditions (kit/loan.mjs reliefCheck).
async function ecoRelief(ctx) {
  return walletOp(ctx, 'relief', (w, now) => {
    const worth = poolBalance(w) + finiteOr0(w?.snap?.stock?.held) + openStakes(w);
    const check = reliefCheck(w, worth, now);
    if (!check.ok) return { refused: 'ECO_RELIEF_REFUSED', extra: { why: check.why, ...(check.until ? { until: check.until } : {}) } };
    return { entries: [reliefEntry(now)] };
  });
}

// A device code: 8 characters, good for PAIR_MS and once, to sign in on
// another device without typing the pass.
async function pairCreate(ctx) {
  const { env, deps, headers, request } = ctx;
  const c = await liveSession(ctx);
  if (!c) return deps.errorJson('ECO_TOKEN_INVALID', 401, headers, request);
  if (sessionLimited(`p:${c.s}`, 10, 60_000, deps.now())) return deps.errorJson('RATE_LIMITED', 429, headers, request);
  const code = deps.generateCode(8);
  const exp = deps.now() + PAIR_MS;
  await deps.fsWrite(env, PAIR_COLLECTION, code, JSON.stringify({ d: c.d, g: c.g, exp }));
  return deps.json({ code, exp }, 200, headers);
}

async function pairRedeem(ctx) {
  const { env, deps, headers, request, body } = ctx;
  const hit = await limited(ctx, 'login');
  if (hit) return hit;
  const code = cleanCode(body.code);
  if (!CODE8.test(code)) return deps.errorJson('ECO_PAIR_NOT_FOUND', 404, headers, request);
  const doc = await deps.fsGet(env, PAIR_COLLECTION, code);
  let pair = null;
  try {
    pair = doc.exists ? JSON.parse(doc.payload) : null;
  } catch {}
  if (doc.exists) await deps.fsDelete(env, PAIR_COLLECTION, code);
  if (!pair || !(pair.exp > deps.now())) return deps.errorJson('ECO_PAIR_NOT_FOUND', 404, headers, request);
  const w = await deps.fsGet(env, WALLET_COLLECTION, pair.d);
  if (!w.exists || gen(parseWallet(w.payload)) !== pair.g) return deps.errorJson('ECO_PAIR_NOT_FOUND', 404, headers, request);
  const res = await signIn(ctx, pair.d);
  return res || deps.errorJson('ECO_PAIR_NOT_FOUND', 404, headers, request);
}

// Signed in on a link to another app (home-screen apps don't share storage):
// sealed, good for HANDOFF_MS, and never the pass.
async function ecoHandoff(ctx) {
  const { deps, headers, request, secret } = ctx;
  const c = await liveSession(ctx);
  if (!c) return deps.errorJson('ECO_TOKEN_INVALID', 401, headers, request);
  if (sessionLimited(`h:${c.s}`, 10, 60_000, deps.now())) return deps.errorJson('RATE_LIMITED', 429, headers, request);
  return deps.json({ handoff: await seal(secret, { d: c.d, g: c.g, e: deps.now() + HANDOFF_MS }) }, 200, headers);
}

async function ecoRedeem(ctx) {
  const { env, deps, headers, request, body, secret } = ctx;
  const data = await unseal(secret, body.handoff);
  if (!data || !(data.e > deps.now()) || typeof data.d !== 'string') return deps.errorJson('ECO_HANDOFF_EXPIRED', 410, headers, request);
  const w = await deps.fsGet(env, WALLET_COLLECTION, data.d);
  if (!w.exists || gen(parseWallet(w.payload)) !== data.g) return deps.errorJson('ECO_HANDOFF_EXPIRED', 410, headers, request);
  const res = await signIn(ctx, data.d);
  return res || deps.errorJson('ECO_HANDOFF_EXPIRED', 410, headers, request);
}

// Every other device signed out: every token issued so far stops working,
// and this device comes back signed in afresh.
async function ecoSignOutAll(ctx) {
  const { env, headers, deps, request } = ctx;
  const c = await liveSession(ctx);
  if (!c) return deps.errorJson('ECO_TOKEN_INVALID', 401, headers, request);
  if (sessionLimited(`so:${c.s}`, 5, 60_000, deps.now())) return deps.errorJson('RATE_LIMITED', 429, headers, request);
  await updateWallet(env, deps, c.d, w => (gen(w) !== c.g ? w : { ...w, sec: { ...(w.sec || {}), gen: gen(w) + 1 }, live: null }));
  const res = await signIn({ ...ctx, app: c.a }, c.d);
  return res || deps.errorJson('ECO_SIGNED_OUT', 401, headers, request);
}

// A new pass for the same account (the old one leaked, say): everything
// moves to the new pass, the old one stops working, every other device is
// signed out, and this one comes back signed in with the new pass.
async function ecoRotate(ctx) {
  const { env, headers, deps, request } = ctx;
  const c = await liveSession(ctx);
  if (!c) return deps.errorJson('ECO_TOKEN_INVALID', 401, headers, request);
  if (sessionLimited(`rot:${c.s}`, 5, 60_000, deps.now())) return deps.errorJson('RATE_LIMITED', 429, headers, request);
  // Taken first (every device out): two rotates at once make one new pass,
  // never two each holding the money.
  const wallet = await claimAccount(env, deps, c.d, c.g);
  if (!wallet) return deps.errorJson('ECO_SIGNED_OUT', 401, headers, request);
  const { passcode, docId } = await newPasscode(env, deps);
  for (const { collection } of Object.values(ECO_APPS)) {
    const d = await deps.fsGet(env, collection, c.d);
    if (d.exists) await deps.fsWrite(env, collection, docId, d.payload);
  }
  const inbox = {};
  for (const [app, ids] of Object.entries(wallet.inbox || {}))
    for (const id of ids) {
      const d = await deps.fsGet(env, INBOX_COLLECTION, id);
      if (!d.exists) continue;
      const next = `${docId}-${app}-${deps.generateCode(8)}`;
      await deps.fsWrite(env, INBOX_COLLECTION, next, d.payload);
      (inbox[app] ||= []).push(next);
    }
  await deps.fsWrite(env, WALLET_COLLECTION, docId, JSON.stringify({ ...wallet, inbox, sec: { gen: gen(wallet) }, live: null }), { exists: false });
  await deleteAccount(env, deps, c.d);
  return signIn({ ...ctx, app: c.a }, docId, { passcode });
}

// ---- Orbit Class: a schedule others can copy --------------------------------------
//
// The schedule belongs to the pass that made it: only that pass edits it.
// Its owner makes a key (8 characters, a day); another pass that enters it
// gets its own copy of the schedule as it is then.

async function shareCreate(ctx) {
  const { env, headers, deps, request } = ctx;
  const c = await liveSession(ctx);
  if (!c) return deps.errorJson('ECO_TOKEN_INVALID', 401, headers, request);
  if (sessionLimited(`sh:${c.s}`, 10, 60_000, deps.now())) return deps.errorJson('RATE_LIMITED', 429, headers, request);
  const doc = await deps.fsGet(env, ECO_APPS.orbit.collection, c.d);
  if (!doc.exists) return deps.errorJson('ECO_NOTHING_TO_SHARE', 404, headers, request);
  const key = deps.generateCode(8);
  const exp = deps.now() + SHARE_MS;
  await deps.fsWrite(env, SHARE_COLLECTION, key, JSON.stringify({ owner: c.d, exp }));
  return deps.json({ key, exp }, 200, headers);
}

async function shareRedeem(ctx) {
  const { env, headers, deps, body, request } = ctx;
  const hit = await limited(ctx, 'share');
  if (hit) return hit;
  const c = await liveSession(ctx);
  if (!c) return deps.errorJson('ECO_TOKEN_INVALID', 401, headers, request);
  const key = cleanCode(body.key);
  if (!CODE8.test(key)) return deps.errorJson('ECO_SHARE_NOT_FOUND', 404, headers, request);
  const doc = await deps.fsGet(env, SHARE_COLLECTION, key);
  let share = null;
  try {
    share = doc.exists ? JSON.parse(doc.payload) : null;
  } catch {}
  if (!share?.owner || !(share.exp > deps.now())) return deps.errorJson('ECO_SHARE_NOT_FOUND', 404, headers, request);
  const schedule = await deps.fsGet(env, ECO_APPS.orbit.collection, share.owner);
  if (!schedule.exists) return deps.errorJson('ECO_SHARE_NOT_FOUND', 404, headers, request);
  return deps.json({ payload: schedule.payload, own: share.owner === c.d }, 200, headers);
}

// ---- Storage ------------------------------------------------------------------------

// An account taken by this request alone, for a rotate or a merge: its
// generation moved on (every token of it stops) over the version read. The
// wallet as taken, or null when another request took it first.
async function claimAccount(env, deps, docId, g) {
  let took = false;
  const result = await updateWallet(env, deps, docId, w => {
    took = gen(w) === g;
    return took ? { ...w, sec: { ...(w.sec || {}), gen: g + 1 }, live: null } : w;
  });
  return took && result ? result.wallet : null;
}

// Read, change and write the wallet, again if another write got in between
// (Firestore's updateTime precondition). null if there's no such account.
export async function updateWallet(env, deps, docId, change, { create = false, skipIf = () => false } = {}) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const doc = await deps.fsGet(env, WALLET_COLLECTION, docId);
    const current = doc.exists ? parseWallet(doc.payload) : null;
    if (!current && !create) return null;
    let next = change(current || emptyWallet(deps.now()));
    // Nothing to write (refused, or no change).
    if (current && (skipIf() || next === current)) return { wallet: current, updateTime: doc.updateTime };
    let text = JSON.stringify(next);
    // Grown big (every bet, fee and prize is an entry): its old ones folded,
    // so it never reaches the limit and stops saving.
    if (text.length > FOLD_AT) {
      next = foldWallet(next, deps.now());
      text = JSON.stringify(next);
    }
    if (text.length > WALLET_MAX_LENGTH) throw new Error('wallet too big');
    try {
      const written = await deps.fsWrite(env, WALLET_COLLECTION, docId, text, doc.exists ? { updateTime: doc.updateTime } : { exists: false });
      return { wallet: next, updateTime: written.updateTime };
    } catch (error) {
      if (!error.precondition) throw error;
    }
  }
  throw new Error('wallet busy, try again');
}

// Old entries as one a month for each app and kind (`fold:<app>:<kind>:<YYYY-MM>`,
// its amount their sum, `n` how many): the balance and every app's and kind's
// sums stay the same. Never folded: the Pass's own (eco:*: the start, old Plus
// months, the welcome bet, an undo, a rebase: ids checks look up),
// Securities' (its saves' deposits are checked against them), and Play's
// until they're over 400 days old (a slip is paid only while its stake is in
// the wallet, and never twice while its payout is: a season's futures are
// settled within the year); anything else after 180 days.
const FOLD_PLAY_MS = 400 * 86_400_000;
const FOLD_MS = 180 * 86_400_000;
export function foldWallet(w, now) {
  const kept = [];
  const folds = new Map();
  for (const e of w.entries || []) {
    const id = String(e?.id || '');
    const age = now - (Number(e?.t) || now);
    const foldable = e?.app && e.app !== 'eco' && e.app !== 'stock' && id !== 'odds:start' && Number.isFinite(e.amount) && age > (e.app === 'odds' ? FOLD_PLAY_MS : FOLD_MS);
    if (!foldable && !id.startsWith('fold:')) {
      kept.push(e);
      continue;
    }
    const month = id.startsWith('fold:') ? id.split(':')[3] : new Date(Number(e.t) + 8 * 3_600_000).toISOString().slice(0, 7);
    const key = id.startsWith('fold:') ? id : `fold:${e.app}:${e.kind || ''}:${month}`;
    const f = folds.get(key) || { id: key, t: 0, app: e.app, kind: e.kind || '', amount: 0, n: 0 };
    f.amount = Math.round((f.amount + e.amount) * 100) / 100;
    f.n += id.startsWith('fold:') ? Number(e.n) || 0 : 1;
    f.t = Math.max(f.t, Number(e.t) || 0);
    folds.set(key, f);
  }
  return { ...w, entries: [...folds.values(), ...kept].sort((a, b) => (a.t || 0) - (b.t || 0)) };
}

// `retire`: deleted for good (not moved to another pass by a merge or a new
// passcode), so its money goes back to the system's books (money.js).
export async function deleteAccount(env, deps, docId, { retire: gone = false } = {}) {
  const doc = await deps.fsGet(env, WALLET_COLLECTION, docId);
  const wallet = doc.exists ? parseWallet(doc.payload) : null;
  if (gone && wallet) await retire(env, deps, wallet).catch(() => {});
  for (const ids of Object.values(wallet?.inbox || {})) for (const id of ids) await deps.fsDelete(env, INBOX_COLLECTION, id);
  for (const { collection } of Object.values(ECO_APPS)) await deps.fsDelete(env, collection, docId);
  await deps.fsDelete(env, WALLET_COLLECTION, docId);
}

export async function newPasscode(env, deps) {
  // A fresh passcode that's already taken is astronomically unlikely (32^10),
  // but checked all the same.
  for (let i = 0; i < 4; i++) {
    const passcode = deps.generateCode(ECO_PASSCODE_LENGTH);
    const docId = await deps.sha256Hex(passcode);
    if (!(await deps.fsGet(env, WALLET_COLLECTION, docId)).exists) return { passcode, docId };
  }
  throw new Error('could not mint a passcode');
}

// ---- Merge: other passes into the signed-in one ----------------------------------------
//
// Each app's data goes to this pass: as its data if it has none yet,
// otherwise to its inbox, for the app to fold in with its own rules next
// time it opens. Money comes along (except what an app rebuilds from its
// own data). Then every source pass is deleted.
async function ecoMerge(ctx) {
  const { env, headers, deps, body, request } = ctx;
  const { json, errorJson } = deps;
  const hit = await limited(ctx, 'merge');
  if (hit) return hit;
  const c = await liveSession(ctx);
  if (!c) return errorJson('ECO_TOKEN_INVALID', 401, headers, request);
  const targetId = c.d;
  const sources = Array.isArray(body.sources) ? body.sources : [];
  if (!sources.length || sources.length > MAX_MERGE_SOURCES) return errorJson('ECO_INVALID_SOURCES', 400, headers, request);
  const now = deps.now();

  // Read every source first: nothing but the sources' sign-out is written
  // until they all check out (one not found leaves the others as they were,
  // their devices signed out).
  const found = [];
  const seen = new Set([targetId]);
  for (const [i, raw] of sources.entries()) {
    const code = cleanCode(raw?.passcode);
    if (!ECO_PASSCODE_PATTERN.test(code)) return json({ error: { code: 'ECO_INVALID_SOURCE', index: i, message: 'bad passcode' } }, 400, headers);
    const docId = await deps.sha256Hex(code);
    if (seen.has(docId)) continue;
    seen.add(docId);
    const w = await deps.fsGet(env, WALLET_COLLECTION, docId);
    const read = w.exists ? parseWallet(w.payload) : null;
    // Taken by this merge alone (its devices signed out): a pass merged into
    // two at once brings its money to one of them, never both.
    const wallet = read && (await claimAccount(env, deps, docId, gen(read)));
    if (!wallet) return json({ error: { code: 'ECO_SOURCE_NOT_FOUND', index: i, message: 'not found' } }, 404, headers);
    const data = {};
    for (const [name, cfg] of Object.entries(ECO_APPS)) {
      const d = await deps.fsGet(env, cfg.collection, docId);
      if (d.exists) data[name] = [d.payload];
    }
    for (const [name, ids] of Object.entries(wallet.inbox || {}))
      for (const id of ids) {
        const d = await deps.fsGet(env, INBOX_COLLECTION, id);
        if (d.exists) (data[name] ||= []).push(d.payload);
      }
    found.push({ docId, wallet, data });
  }

  const inboxAdd = {};
  const moved = {};
  for (const src of found)
    for (const [app, payloads] of Object.entries(src.data))
      for (const payload of payloads) {
        moved[app] = (moved[app] || 0) + 1;
        const doc = await deps.fsGet(env, ECO_APPS[app].collection, targetId);
        if (!doc.exists) await deps.fsWrite(env, ECO_APPS[app].collection, targetId, payload);
        else {
          const id = `${targetId}-${app}-${deps.generateCode(8)}`;
          await deps.fsWrite(env, INBOX_COLLECTION, id, payload);
          (inboxAdd[app] ||= []).push(id);
        }
      }

  // Money: every entry, Play's too (since the lock-down an app can't write
  // its winnings back, so its merged ledger can't bring them), under its own
  // id: Play's slips and tickets and Securities' deposits are checked by it
  // (`odds:stake-<slip>`, `x:<id>`), and the Worker's pay is one entry a
  // month whichever pass it came through. An id this pass already has for a
  // different entry is renamed; shared cash figures whose app data didn't
  // come along, as one entry each.
  const carried = [];
  const settings = {};
  const target = parseWallet((await deps.fsGet(env, WALLET_COLLECTION, targetId)).payload || '');
  const held = new Map((target?.entries || []).map(e => [e.id, e]));
  const same = (x, y) => x.amount === y.amount && x.t === y.t && x.app === y.app && x.kind === y.kind;
  for (const [k, src] of found.entries()) {
    const tag = `m${now.toString(36)}${k}`;
    for (const e of src.wallet.entries) {
      const had = held.get(e.id);
      const entry = !had || e.id.startsWith('eco:') || same(had, e) ? e : { ...e, id: `${tag}:${e.id}`.slice(0, 96) };
      if (!held.has(entry.id)) held.set(entry.id, entry);
      carried.push(entry);
    }
    for (const [app, s] of Object.entries(src.wallet.snap || {})) {
      // (Securities' cash is the Worker's own count; no other app's figure is money.)
      if (app !== 'stock' || !finite(s.cash) || src.data[app]) continue;
      carried.push({ id: `${tag}:snap:${app}`, t: now, app: 'eco', kind: 'merge', amount: s.cash, note: app });
    }
    for (const [key, v] of Object.entries(src.wallet.settings || {})) if (!settings[key] || v.t > settings[key].t) settings[key] = v;
  }
  const mergedApps = [...new Set(found.flatMap(s => Object.keys(s.data)))];
  // (This pass taken meanwhile, by a rotate or a merge into another: nothing
  // lands on it and the sources stay, their money where it was.)
  let ours = true;
  let result = await updateWallet(env, deps, targetId, w => ((ours = gen(w) === c.g) ? { ...mergeWallet(w, { entries: carried, settings, inbox: inboxAdd }), merged: { t: now, apps: mergedApps } } : w));
  if (!result || !ours) return errorJson('ECO_SIGNED_OUT', 401, headers, request);
  // What this Worker still watches for a source (Play's slips and tickets,
  // Securities' fills book) goes to this pass, then anything it paid the
  // source meanwhile comes along too (the same ids: nothing twice).
  for (const src of found) {
    await deps.moveRecords?.(env, src.docId, targetId, now);
    const late = parseWallet((await deps.fsGet(env, WALLET_COLLECTION, src.docId)).payload || '');
    const fresh = (late?.entries || []).filter(e => !held.has(e.id));
    if (fresh.length) result = await updateWallet(env, deps, targetId, w => mergeWallet(w, { entries: fresh }));
    await deleteAccount(env, deps, src.docId);
  }
  return json({ moved, wallet: publicWallet(result.wallet), walletTime: result.updateTime, pool: poolBalance(result.wallet) }, 200, headers);
}
