// ---- eco.js ----
// /eco: the Quadra Pass, one account for every Quadra app (Quadra
// Securities, Quadra Play, Quadra Fixtures, Quadra Rewards, and Orbit Class
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
//       settings  newest wins per key (activity counts, affinities, follows)
//       pins      matches pinned from Play for Fixtures, newest wins
//       apps      when each app was first and last opened
//       inbox     other passes' app data a merge brought in, per app
//       live      which app (and session) is the live one
//       sec       the token generation (bumped to sign every device out)
//   - each app's own data (ECO_APPS[app].collection), under the same id;
//   - inbox documents (`eco-inbox`), device codes (`eco-pairs`) and Orbit
//     Class share keys (`eco-shares`).
//
// With a session token (`qt`):
//   GET    /eco?qt=T[&app=A][&inbox=1]   the wallet, app A's data; `active`
//            says whether this session is the account's live one, and while
//            it is a fresh `token` comes back
//   PATCH  /eco?qt=T[&app=A]  { payload?, wallet? }   only while live
//   DELETE /eco?qt=T[&app=A][&inbox=ID]   the account (or one app's data)
//   POST   /eco { op: 'create', app }                 a new pass, signed in
//   POST   /eco { op: 'login', passcode, app }        sign in on this device
//   POST   /eco { op: 'refresh', refresh, app, claim?, data?, inbox? }
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

import { tokenSecret, signToken, readToken, seal, unseal, sessionLimited, SESSION_MS, REFRESH_MS, HANDOFF_MS } from './quadra-token.js';
import { handleAdmin } from './eco-admin.js';

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
//   match  Quadra Fixtures
//   vocab  Quadra Rewards
//   orbit  Orbit Class, the related add-on: its class schedule
export const ECO_APPS = {
  stock: { collection: 'stock-study-accounts', maxPayload: 1_000_000 },
  odds: { collection: 'odds-study-accounts', maxPayload: 1_000_000 },
  vocab: { collection: 'vocab-progress-sync', maxPayload: 600_000 },
  match: { collection: 'match-find-settings', maxPayload: 100_000 },
  orbit: { collection: 'orbit-quadra', maxPayload: 200_000 }
};
// Who can write entries: the apps, and this Worker itself ('eco': pay,
// merges). An app can't write 'eco' entries.
const ENTRY_APPS = new Set(['stock', 'odds', 'vocab', 'match']);
// Whose entries are rebuilt by the app from its own data: a merge doesn't
// copy them (the app republishes its merged ledger).
const LEDGER_APPS = new Set(['odds']);

export const WALLET_MAX_LENGTH = 900_000;
const MAX_ENTRIES_PER_WRITE = 1000;
const MAX_AMOUNT = 1_000_000_000;
// Rewards' points on one entry (a batch of answers, a game, a claim).
const MAX_XP = 10_000;
const MAX_MERGE_SOURCES = 12;

// Per IP an hour, for the calls that take a code (KV counters); calls with a
// session are counted per session in memory (TOKEN_LIMIT a minute).
export const ECO_LIMITS = { create: 20, login: 30, merge: 20, share: 30, admin: 30 };
export const TOKEN_LIMIT = 90;

export function emptyWallet(now = Date.now()) {
  return { v: 1, created: now, entries: [], snap: {}, settings: {}, pins: {}, apps: {}, inbox: {} };
}

// ---- One pool, one monthly pay -------------------------------------------------
//
// The Worker pays everyone's income into the pool: one fixed pay each Taiwan
// month (from the 1st), on the first sign-in or refresh that month; a month
// nobody opened an app is paid the next time (back pay, for every month since
// the pass was made, from 2026-10). A pass made since v2 also gets its
// opening money here.
//
// The economy (tools/economy.mjs has the numbers): a fixed monthly pay, the
// same for every account whatever it holds, like a salary (v10, 2026-10;
// v7-v9 paid 8,000 / 4,000 / 1,500 / 500 by what the account was worth,
// which paid saving less and losing more). A regular bettor ends a month a
// little behind, an investor or a saver grows by it; the house's cut, the
// broker's costs, interest and penalties are the sinks.
export const PAY_MONTH = 6_000;
export const PAY = { start: 30_000, month: PAY_MONTH };
// The reset for accounts made before this economy: their opening money
// (NT$110,000, from the Worker or, before v2, from Securities and Play)
// comes down to the new NT$30,000, once, as `eco:rebase:v3`. It can take the
// cash below zero: that's an overdraft, and it's fine (see below).
export const REBASE = { id: 'eco:rebase:v3', amount: -80_000 };
const rebaseDue = wallet => {
  const start = (wallet?.entries || []).find(e => e.id === 'eco:start');
  // Before v2 the opening money was the apps' own (Securities' cash, Play's
  // ledger): any such account has something in the pool.
  return start ? start.amount > PAY.start : !wallet?.v2 && ((wallet?.entries || []).length > 0 || Object.keys(wallet?.snap || {}).length > 0);
};
// An overdraft (the pool below zero) costs OVERDRAFT_RATE a month, charged
// with the month's pay on what was owed then, as `eco:od:<month>`:
// cheaper to sell something (or borrow on margin in Securities) than to sit
// on it.
export const OVERDRAFT_RATE = 0.01;
const finiteOr0 = v => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
export const worthOf = wallet => poolBalance(wallet) + finiteOr0(wallet?.snap?.stock?.holdings);
export const payFor = () => PAY.month;
export const PAY_FROM_MONTH = '2026-10';
const TPE = 8 * 3_600_000;
const WEEK = 7 * 86_400_000;
const nextMonth = m => {
  const [y, mo] = m.split('-').map(Number);
  return mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, '0')}`;
};
export const taipeiMonth = t => new Date(t + TPE).toISOString().slice(0, 7);
// The Monday (Taipei) a moment's week starts, as a UTC timestamp.
export function weekStart(t) {
  const d = new Date(t + TPE);
  const day = (d.getUTCDay() + 6) % 7;
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day) - TPE;
}

// The pay entries due now that the wallet doesn't have yet.
export function paydayEntries(wallet, now) {
  const have = new Set((wallet.entries || []).map(e => e.id));
  const out = [];
  if (wallet.v2 && !have.has('eco:start')) out.push({ id: 'eco:start', t: now, app: 'eco', kind: 'start', amount: PAY.start });
  if (!have.has(REBASE.id) && rebaseDue(wallet)) out.push({ id: REBASE.id, t: now, app: 'eco', kind: 'rebase', amount: REBASE.amount });
  const month = taipeiMonth(now);
  // This month's overdraft interest, on what's owed before the pay.
  const owed = -(poolBalance(wallet) + out.reduce((sum, e) => sum + e.amount, 0));
  if (owed >= 100 && month >= PAY_FROM_MONTH && !have.has(`eco:od:${month}`)) out.push({ id: `eco:od:${month}`, t: now, app: 'eco', kind: 'od', amount: -Math.round(owed * OVERDRAFT_RATE) });
  const made = Number.isFinite(wallet.created) ? taipeiMonth(Math.min(wallet.created, now)) : month;
  let m = made > PAY_FROM_MONTH ? made : PAY_FROM_MONTH;
  // Each month's pay, back pay for the months nobody opened an app.
  for (let n = 0; m <= month && n < 120; n++, m = nextMonth(m)) {
    if (!have.has(`eco:pay:${m}`)) out.push({ id: `eco:pay:${m}`, t: now, app: 'eco', kind: 'pay', amount: payFor() });
  }
  // Plus months bought with points, then the renewal for this month (after
  // the pay, so the pay covers it; a month already held isn't charged).
  out.push(...plusPointsEntries(wallet, now));
  out.push(...plusRenewal({ ...wallet, entries: [...(wallet.entries || []), ...out] }, now));
  // A member's bonus bet for this week (after the renewal that makes them one).
  out.push(...plusBonusEntries({ ...wallet, entries: [...(wallet.entries || []), ...out] }, now));
  // VIP cashback on the months before this one, and the welcome bonus bet.
  out.push(...vipEntries(wallet, now), ...welcomeEntries(wallet, now));
  return out;
}

// ---- VIP cashback and the welcome offer ---------------------------------------------
//
// VIP (the kit's VIP, the same table): a Taiwan month's gaming stakes (Play's
// bets and lottery and scratch tickets, less refunds) set its tier, and the
// tier's share of them is paid back once the month is over, on the first
// read after it (`eco:vip:<month>`, kind 'vip', the tier in the note). Every
// product keeps 14% or more of its stakes; the top rate is 1.5%.
export const VIP = {
  from: '2026-10',
  tiers: [
    { id: 'bronze', min: 10_000, back: 0.005 },
    { id: 'silver', min: 50_000, back: 0.008 },
    { id: 'gold', min: 150_000, back: 0.012 },
    { id: 'black', min: 500_000, back: 0.015 }
  ]
};
export function vipStakes(wallet, month) {
  let sum = 0;
  for (const e of wallet?.entries || []) {
    if (e.app !== 'odds' || typeof e.t !== 'number' || taipeiMonth(e.t) !== month) continue;
    if (e.kind === 'stake' || e.kind === 'lottery' || e.kind === 'refund') sum -= e.amount;
  }
  return Math.max(0, Math.round(sum));
}
export const vipTier = stakes => [...VIP.tiers].reverse().find(t => stakes >= t.min) ?? null;
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
// bet (`eco:fb:welcome`, once per account; 7 days, like every free bet).
export const WELCOME = { bet: 200 };
export function welcomeEntries(wallet, now) {
  const entries = wallet?.entries || [];
  if (entries.some(e => e.id === 'eco:fb:welcome') || !entries.some(e => e.app === 'odds' && e.kind === 'stake' && e.amount < 0)) return [];
  return [{ id: 'eco:fb:welcome', t: now, app: 'eco', kind: 'freebet', amount: 0, note: String(WELCOME.bet) }];
}
export { WEEK };

// ---- Quadra Plus -------------------------------------------------------------------
//
// The membership: PLUS.fee each Taiwan month, taken from the pool by this
// Worker (an app can't write 'eco' entries, so no app can grant itself a
// month). A month is a member's when the wallet holds `eco:plus:<month>`;
// every app reads its perks from that alone. Joining is `op: 'plus'`: the
// first time ever, the rest of the month is free; after that the rest of the
// month costs its share of the fee. It renews every month while the `plus`
// setting is on, charged on the first sign-in or read (months away charged
// on return); a charge the pool can't cover fails and it lapses
// (plusRenewal). The yearly plan (PLUS.year, about
// two months free) pays twelve months at once and renews by the year.
// Leaving stops renewal and keeps every month already paid. v8: NT$490 and
// a NT$200 weekly bonus bet (v7 was 990 and 100): the perks' face value is
// about three times the fee and their expected cost about the fee
// (tools/economy.mjs); a yearly plan already paid keeps its months.
export const PLUS = { fee: 490, year: 4_900, bonusBet: 200 };
const PLUS_ID = m => `eco:plus:${m}`;
// A member's weekly bonus bet: a free bet token for Quadra Play, NT$PLUS.bonusBet,
// one each Taiwan week (from Monday) the account is a member and opens an
// app: `eco:fb:<Monday>`, kind 'freebet', amount 0, its value in the note
// (the kit's freeBets reads it; a week missed isn't
// paid later). Only this Worker can write it.
export const bonusBetId = now => `eco:fb:${new Date(weekStart(now) + TPE).toISOString().slice(0, 10)}`;
export function plusBonusEntries(wallet, now) {
  const id = bonusBetId(now);
  if (!plusMember(wallet, now) || (wallet?.entries || []).some(e => e.id === id)) return [];
  return [{ id, t: now, app: 'eco', kind: 'freebet', amount: 0, note: String(PLUS.bonusBet) }];
}
const plusSetting = wallet => wallet?.settings?.plus?.value || {};
const plusOn = wallet => plusSetting(wallet).on === true;
export const plusMember = (wallet, now) => (wallet?.entries || []).some(e => e.id === PLUS_ID(taipeiMonth(now)) && e.app === 'eco');
function monthDays(m) {
  const [y, mo] = m.split('-').map(Number);
  return new Date(Date.UTC(y, mo, 0)).getUTCDate();
}
const monthsFrom = (m, n) => Array.from({ length: n }, (_, i) => (i ? (m = nextMonth(m)) : m));
// A year paid now: twelve months from `first`, the fee on the first, the
// rest already covered (amount 0), skipping any month already held.
function yearEntries(wallet, first, now) {
  const have = new Set((wallet?.entries || []).map(e => e.id));
  const months = monthsFrom(first, 12).filter(m => !have.has(PLUS_ID(m)));
  return months.map((m, i) => ({ id: PLUS_ID(m), t: now, app: 'eco', kind: 'plus', amount: i ? 0 : -PLUS.year, note: 'year' }));
}
// Renewal, like any subscription: every month while it's on, whether or not
// anyone opened an app (months missed are charged on return, after their
// pay), a yearly plan by the year (or by the month if the pool can't cover
// a year). A charge the pool can't cover fails: `eco:plusfail:<month>`
// (amount 0), and the membership lapses there until the person joins again
// (renewal won't retry it). v10; before, a month nobody came was skipped.
// A month bought with points (note 'points') isn't a payment: it doesn't
// bring back a membership that lapsed.
export const plusLapsed = wallet => {
  const entries = wallet?.entries || [];
  const last = entries.filter(e => e.app === 'eco' && e.id?.startsWith('eco:plus:') && e.note !== 'points').map(e => e.id.slice(9)).sort().at(-1);
  return Boolean(last) && entries.some(e => e.app === 'eco' && e.id?.startsWith('eco:plusfail:') && e.id.slice(13) > last);
};
function plusRenewal(wallet, now) {
  const month = taipeiMonth(now);
  const entries = wallet?.entries || [];
  if (!plusOn(wallet) || plusLapsed(wallet)) return [];
  const have = new Set(entries.filter(e => e.app === 'eco' && e.id?.startsWith('eco:plus:')).map(e => e.id.slice(9)));
  const last = [...have].sort().at(-1);
  if (!last || last >= month) return [];
  const out = [];
  let pool = poolBalance(wallet);
  for (let m = nextMonth(last), n = 0; m <= month && n < 120; m = nextMonth(m), n++) {
    if (have.has(m)) continue;
    if (plusSetting(wallet).plan === 'year' && pool >= PLUS.year) {
      const year = yearEntries({ entries: [...entries, ...out] }, m, now);
      out.push(...year);
      for (const e of year) have.add(e.id.slice(9));
      pool -= PLUS.year;
      continue;
    }
    if (pool < PLUS.fee) {
      out.push({ id: `eco:plusfail:${m}`, t: now, app: 'eco', kind: 'plusfail', amount: 0, note: String(PLUS.fee) });
      break;
    }
    out.push({ id: PLUS_ID(m), t: now, app: 'eco', kind: 'plus', amount: -PLUS.fee });
    pool -= PLUS.fee;
  }
  return out;
}
// A month of Plus bought with points in Rewards ('vocab:xs:plus:<month>'):
// only this Worker writes `eco:plus:<month>` (amount 0, note 'points'). As
// the kit's catalogue allows: after a first month joined (the free one),
// for the month it was redeemed in or the next, one a quarter, never over a
// month already held.
const quarterOf = m => `${m.slice(0, 4)}-Q${Math.ceil(Number(m.slice(5, 7)) / 3)}`;
export function plusPointsEntries(wallet, now) {
  const entries = wallet?.entries || [];
  const held = entries.filter(e => e.app === 'eco' && e.id?.startsWith('eco:plus:'));
  if (!held.some(e => e.note !== 'points')) return [];
  const have = new Set(held.map(e => e.id.slice(9)));
  const quarters = new Set(held.filter(e => e.note === 'points').map(e => quarterOf(e.id.slice(9))));
  const out = [];
  for (const e of entries) {
    if (e.app !== 'vocab' || e.kind !== 'redeem' || !e.id?.startsWith('vocab:xs:plus:')) continue;
    const m = e.id.slice(14);
    const from = taipeiMonth(e.t);
    if (!/^\d{4}-\d{2}$/.test(m) || (m !== from && m !== nextMonth(from)) || m > nextMonth(taipeiMonth(now)) || have.has(m) || quarters.has(quarterOf(m))) continue;
    out.push({ id: PLUS_ID(m), t: now, app: 'eco', kind: 'plus', amount: 0, note: 'points' });
    have.add(m);
    quarters.add(quarterOf(m));
  }
  return out;
}

// What joining now takes. Monthly: nothing the first time ever, else the
// rest of the month's share of the fee. Yearly: PLUS.year for twelve months,
// from this month (or from next month when this one is already a member's).
export function plusJoinEntries(wallet, now, plan = 'month') {
  const month = taipeiMonth(now);
  const member = plusMember(wallet, now);
  if (plan === 'year') return yearEntries(wallet, member ? nextMonth(month) : month, now);
  if (member) return [];
  const tried = (wallet?.entries || []).some(e => e.id?.startsWith('eco:plus:'));
  const days = monthDays(month);
  const left = days - Number(new Date(now + TPE).toISOString().slice(8, 10)) + 1;
  const amount = tried ? -Math.max(10, Math.round((PLUS.fee * left) / days / 10) * 10) : 0;
  return [{ id: PLUS_ID(month), t: now, app: 'eco', kind: 'plus', amount, ...(tried ? {} : { note: 'trial' }) }];
}
export const plusJoinEntry = (wallet, now) => plusJoinEntries(wallet, now)[0] ?? null;

const isObj = v => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : undefined);
const finite = v => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
const cleanCode = v =>
  String(v || '')
    .trim()
    .toUpperCase()
    .replace(/[\s-]/g, '');

// What Quadra Rewards sells (its lib/shop.mjs), the only money it moves:
// Rewards pays points, never NT$ (v7). Each purchase is one entry
// 'vocab:shop:<item>:<key>' of kind 'shop', and a word pack's id is fixed
// ('vocab:shop:pack:<pack>'), so it's bought once. An entry claiming one
// must pay at least the lowest price (packs are half price for Plus), or
// it's dropped: an app can't write itself a free card, boost or pack.
export const REWARDS_SHOP = { freeze: 300, boost: 150, pack: { toeic: 495, ielts: 745, biz: 995 } };
// Points (XP) buy the same things: 'vocab:xs:<item>:<key>', kind 'redeem',
// amount 0, the points it cost in the note, at least REWARDS_XP's.
// Avatars bought with points: the kit's AVATARS that have an `xp` price.
export const REWARDS_XP = {
  freeze: 600,
  boost: 300,
  pack: { toeic: 8_000, ielts: 12_000, biz: 16_000 },
  avatar: { cat: 300, dog: 300, frog: 600, penguin: 600, rocket: 1_500, rainbow: 1_500, fire: 3_000, gem: 5_000 },
  // The kit's FRAMES with a price.
  frame: { silver: 2_000, jade: 4_000, gold: 8_000, neon: 15_000, aurora: 30_000 },
  // A daily mission swapped for another ('vocab:xs:reroll:<day>:<mission>').
  reroll: 100,
  // A missed day bought back for the streak ('vocab:xs:repair:<day>').
  repair: 1_500,
  // The points catalogue (the kit's CATALOG), at a Plus member's price (the
  // kit's PLUS.vocab.catalog of it): Play free bets, a Securities commission
  // voucher and a 定存 bonus, a month of Plus (plusPointsEntries).
  bet100: 4_500,
  bet500: 19_800,
  fee: 3_600,
  td: 10_800,
  plus: 18_000
};
function xpPaid(id, e) {
  const [, , item, key] = id.split(':');
  const least = ['pack', 'avatar', 'frame'].includes(item) ? REWARDS_XP[item][key] : REWARDS_XP[item];
  const cost = Number(e.note);
  return typeof least === 'number' && e.kind === 'redeem' && Number.isInteger(cost) && cost >= least && cost <= 100_000;
}
function shopPaid(id, amount) {
  const [, , item, key] = id.split(':');
  const least = item === 'pack' ? REWARDS_SHOP.pack[key] : REWARDS_SHOP[item];
  return typeof least === 'number' && amount <= -least;
}

// One entry as stored: anything malformed is dropped, not stored.
export function cleanEntry(e, { allowEco = false } = {}) {
  if (!isObj(e)) return null;
  const id = str(e.id, 96);
  const t = finite(e.t);
  const amount = finite(e.amount);
  const app = str(e.app, 12);
  if (!id || t == null || amount == null || Math.abs(amount) > MAX_AMOUNT) return null;
  if (!(ENTRY_APPS.has(app) || (allowEco && app === 'eco'))) return null;
  // The Worker's own ids (pay, Quadra Plus) are its alone.
  if (!allowEco && id.startsWith('eco:')) return null;
  if (id.startsWith('vocab:shop:') && !(app === 'vocab' && e.kind === 'shop' && shopPaid(id, amount))) return null;
  // Rewards pays no money (v7): its entries only spend (the shop) or carry
  // points (`xp`, amount 0), and its missions no longer give free bets.
  // Entries it paid before stay: only new ones come through here.
  if (app === 'vocab' && (amount > 0 || id.startsWith('vocab:fb:'))) return null;
  if (id.startsWith('vocab:xs:') && !(app === 'vocab' && amount === 0 && xpPaid(id, e))) return null;
  const out = { id, t: Math.round(t), app, kind: str(e.kind, 24) || 'other', amount: Math.round(amount * 100) / 100 };
  const note = str(e.note, 80);
  if (note) out.note = note;
  const xp = finite(e.xp);
  if (app === 'vocab' && xp != null && xp > 0) out.xp = Math.min(MAX_XP, Math.round(xp));
  return out;
}

// A newest-wins map (snap, settings, pins): every value an object with `t`.
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

// What a client may send to change the wallet.
export function cleanPatch(patch) {
  if (!isObj(patch)) return { entries: [], snap: {}, settings: {}, pins: {} };
  return {
    entries: (Array.isArray(patch.entries) ? patch.entries.slice(0, MAX_ENTRIES_PER_WRITE) : []).map(e => cleanEntry(e)).filter(Boolean),
    snap: cleanStamped(patch.snap, 8, 4000),
    settings: cleanStamped(patch.settings, 32, 4000),
    pins: cleanStamped(patch.pins, 200, 2000)
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
    pins: newest(base.pins, b.pins),
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
  const snaps = Object.values(wallet?.snap || {}).reduce((sum, s) => sum + (finite(s.cash) ?? 0), 0);
  return Math.round((entries + snaps) * 100) / 100;
}

export function parseWallet(text) {
  try {
    const w = JSON.parse(text);
    if (isObj(w) && w.v === 1 && Array.isArray(w.entries)) return { ...emptyWallet(w.created), ...w };
  } catch {}
  return null;
}

// Settings no app reads any more (limits, follows) and fields from older
// versions: dropped whenever a wallet is cleaned (eco-admin.js).
export const RETIRED_SETTINGS = ['oddsWeeklyLimit', 'orbitFollow'];
export function tidyWallet(w) {
  const { links, ...rest } = w;
  const settings = Object.fromEntries(Object.entries(rest.settings || {}).filter(([k]) => !RETIRED_SETTINGS.includes(k)));
  const entries = rest.entries.map(({ peer, ...e }) => e);
  return { ...rest, settings, entries };
}

function touchApp(wallet, app, now) {
  if (!ECO_APPS[app]) return wallet;
  const had = wallet.apps?.[app];
  return { ...wallet, apps: { ...(wallet.apps || {}), [app]: { first: had?.first ?? now, last: now } } };
}

// What clients see of the wallet: not the Worker's own bookkeeping.
export function publicWallet(w) {
  if (!w) return w;
  const { sec, links, ...rest } = w;
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
  plus: ecoPlus,
  admin: ctx => handleAdmin(ctx)
};

export async function handleEcoRequest(request, env, headers, ip, deps) {
  const { json, errorJson, upstreamFailed } = deps;
  if (!['GET', 'POST', 'PATCH', 'DELETE'].includes(request.method)) return errorJson('SYNC_METHOD_NOT_ALLOWED', 405, headers, request);
  if (!env.FIREBASE_PROJECT_ID || !env.FIREBASE_CLIENT_EMAIL || !env.FIREBASE_PRIVATE_KEY) return errorJson('MISSING_FIREBASE_CONFIG', 500, headers, request);

  const url = new URL(request.url);
  const app = url.searchParams.get('app') || '';
  if (app && !ECO_APPS[app]) return errorJson('ECO_UNKNOWN_APP', 400, headers, request);
  const secret = await tokenSecret(env);

  try {
    if (request.method === 'POST') {
      const body = await deps.readJsonBody(request);
      if (body === deps.INVALID_BODY || !isObj(body)) return errorJson('INVALID_JSON', 400, headers, request);
      const run = OPS[body.op];
      if (!run) return errorJson('ECO_UNKNOWN_OP', 400, headers, request);
      return await run({ request, env, headers, ip, deps, body, app: app || str(body.app, 12) || '', secret });
    }

    // Everything else needs a session.
    const claims = await readToken(secret, url.searchParams.get('qt'), 'ses', deps.now());
    if (!claims) return errorJson('ECO_TOKEN_INVALID', 401, headers, request);
    if (sessionLimited(claims.s, TOKEN_LIMIT, 60_000, deps.now())) return errorJson('RATE_LIMITED', 429, headers, request);
    const docId = claims.d;

    if (request.method === 'GET') {
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
      if (app) {
        const doc = await deps.fsGet(env, ECO_APPS[app].collection, docId);
        if (doc.exists) Object.assign(out, { updateTime: doc.updateTime, payload: doc.payload });
        if (url.searchParams.get('inbox') === '1') out.inbox = await readInbox(env, deps, wallet, app);
      }
      return json(out, 200, headers);
    }

    if (request.method === 'PATCH') {
      const body = await deps.readJsonBody(request);
      if (body === deps.INVALID_BODY || !isObj(body)) return errorJson('INVALID_JSON', 400, headers, request);
      const hasPayload = body.payload !== undefined;
      if (hasPayload && !(app && typeof body.payload === 'string' && body.payload && body.payload.length <= ECO_APPS[app].maxPayload)) {
        return errorJson('MISSING_PAYLOAD', 400, headers, request);
      }
      const now = deps.now();
      let refused = null;
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
          const merged = mergeWallet(w, cleanPatch(body.wallet));
          return touchApp(mergeWallet(merged, { entries: paydayEntries(merged, now) }), app, now);
        },
        { skipIf: () => refused }
      );
      if (!result) return errorJson('ECO_SIGNED_OUT', 401, headers, request);
      if (refused) return json({ error: { code: refused, message: refused }, live: liveOf(result.wallet) }, refused === 'ECO_SIGNED_OUT' ? 401 : 409, headers);
      const out = { wallet: publicWallet(result.wallet), walletTime: result.updateTime, pool: poolBalance(result.wallet), token: await sessionToken(secret, claims, now) };
      if (hasPayload) out.updateTime = (await deps.fsWrite(env, ECO_APPS[app].collection, docId, body.payload)).updateTime;
      return json(out, 200, headers);
    }

    // DELETE
    const w = await deps.fsGet(env, WALLET_COLLECTION, docId);
    const wallet = w.exists ? parseWallet(w.payload) : null;
    if (!wallet || claims.g !== gen(wallet)) return errorJson('ECO_SIGNED_OUT', 401, headers, request);
    const inboxId = url.searchParams.get('inbox');
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
    await deleteAccount(env, deps, docId);
    return json({ deleted: true }, 200, headers);
  } catch (error) {
    return upstreamFailed(error, headers);
  }
}

async function readInbox(env, deps, wallet, app) {
  const out = [];
  for (const id of (wallet.inbox?.[app] || []).slice(0, 12)) {
    const item = await deps.fsGet(env, INBOX_COLLECTION, id);
    if (item.exists) out.push({ id, payload: item.payload });
  }
  return out;
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

async function sessionReply(env, deps, secret, result, c, now, { app, inbox = false } = {}) {
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
    const doc = await deps.fsGet(env, ECO_APPS[app].collection, c.d);
    if (doc.exists) Object.assign(out, { payload: doc.payload, updateTime: doc.updateTime });
    if (inbox) out.inbox = await readInbox(env, deps, result.wallet, app);
  }
  return out;
}

async function limited(ctx, feature) {
  return ctx.deps.rateLimitResponse(ctx.env, ctx.ip, `eco:${feature}`, ECO_LIMITS[feature], ctx.headers, ctx.request);
}

async function ecoCreate(ctx) {
  const { env, deps, headers, request, app } = ctx;
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
  if (!live && !body.claim) return json({ active: false, live: liveOf(wallet), wallet: publicWallet(wallet), pool: poolBalance(wallet) }, 200, headers);
  let result = { wallet, updateTime: doc.updateTime };
  if (!live || paydayEntries(wallet, now).length) {
    result = await updateWallet(env, deps, c.d, w => ({ ...touchApp(mergeWallet(w, { entries: paydayEntries(w, now) }), app, now), live: { sid: c.s, app, t: now } }));
  }
  const out = await sessionReply(env, deps, secret, result, claims, now, { app: body.data ? app : '', inbox: body.inbox });
  out.refresh = await refreshToken(secret, claims, now);
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

// Quadra Plus: { op: 'plus', qt, on }. Joining takes this month's entry
// (free the first time) and turns renewal on; leaving turns renewal off and
// keeps the month already paid. Only the live app can do either.
async function ecoPlus(ctx) {
  const { env, deps, headers, request, body, secret } = ctx;
  const now = deps.now();
  const c = await readToken(secret, body.qt, 'ses', now);
  if (!c) return deps.errorJson('ECO_TOKEN_INVALID', 401, headers, request);
  if (sessionLimited(`plus:${c.s}`, 10, 60_000, now)) return deps.errorJson('RATE_LIMITED', 429, headers, request);
  const on = body.on === true;
  const plan = body.plan === 'year' ? 'year' : 'month';
  let refused = null;
  const result = await updateWallet(
    env,
    deps,
    c.d,
    w => {
      refused = null;
      if (gen(w) !== c.g) return (refused = 'ECO_SIGNED_OUT'), w;
      if (!isActive(w, c)) return (refused = 'ECO_SESSION_MOVED'), w;
      const paid = mergeWallet(w, { entries: paydayEntries(w, now) });
      const join = on ? plusJoinEntries(paid, now, plan) : [];
      if (join.length && poolBalance(paid) + join.reduce((sum, e) => sum + e.amount, 0) < 0) return (refused = 'ECO_PLUS_FUNDS'), w;
      const joined = mergeWallet(paid, { entries: join, settings: { plus: { value: { on, plan, t: now }, t: now } } });
      // This week's bonus bet comes with joining.
      return mergeWallet(joined, { entries: plusBonusEntries(joined, now) });
    },
    { skipIf: () => refused }
  );
  if (!result) return deps.errorJson('ECO_SIGNED_OUT', 401, headers, request);
  if (refused) return deps.json({ error: { code: refused, message: refused }, live: liveOf(result.wallet) }, refused === 'ECO_SIGNED_OUT' ? 401 : 409, headers);
  return deps.json({ wallet: publicWallet(result.wallet), walletTime: result.updateTime, pool: poolBalance(result.wallet), member: plusMember(result.wallet, now) }, 200, headers);
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
  const old = await deps.fsGet(env, WALLET_COLLECTION, c.d);
  const wallet = parseWallet(old.payload);
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
  await deps.fsWrite(env, WALLET_COLLECTION, docId, JSON.stringify({ ...wallet, inbox, sec: { gen: gen(wallet) + 1 }, live: null }), { exists: false });
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

// Read, change and write the wallet, again if another write got in between
// (Firestore's updateTime precondition). null if there's no such account.
export async function updateWallet(env, deps, docId, change, { create = false, skipIf = () => false } = {}) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const doc = await deps.fsGet(env, WALLET_COLLECTION, docId);
    const current = doc.exists ? parseWallet(doc.payload) : null;
    if (!current && !create) return null;
    const next = change(current || emptyWallet(deps.now()));
    // Nothing to write (refused, or no change).
    if (current && (skipIf() || next === current)) return { wallet: current, updateTime: doc.updateTime };
    const text = JSON.stringify(next);
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

export async function deleteAccount(env, deps, docId) {
  const doc = await deps.fsGet(env, WALLET_COLLECTION, docId);
  const wallet = doc.exists ? parseWallet(doc.payload) : null;
  for (const ids of Object.values(wallet?.inbox || {})) for (const id of ids) await deps.fsDelete(env, INBOX_COLLECTION, id);
  for (const { collection } of Object.values(ECO_APPS)) await deps.fsDelete(env, collection, docId);
  await deps.fsDelete(env, WALLET_COLLECTION, docId);
}

async function newPasscode(env, deps) {
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

  // Read every source first: nothing is written until they all check out.
  const found = [];
  const seen = new Set([targetId]);
  for (const [i, raw] of sources.entries()) {
    const code = cleanCode(raw?.passcode);
    if (!ECO_PASSCODE_PATTERN.test(code)) return json({ error: { code: 'ECO_INVALID_SOURCE', index: i, message: 'bad passcode' } }, 400, headers);
    const docId = await deps.sha256Hex(code);
    if (seen.has(docId)) continue;
    seen.add(docId);
    const w = await deps.fsGet(env, WALLET_COLLECTION, docId);
    const wallet = w.exists ? parseWallet(w.payload) : null;
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

  // Money: every entry except the ones an app rebuilds from its own data,
  // under a new id so two passes' ids can't collide (the Worker's pay keeps
  // its id: one month's pay is one entry, whichever pass it came through);
  // shared cash figures whose app data didn't come along, as one entry each.
  const carried = [];
  const settings = {};
  const pins = {};
  for (const [k, src] of found.entries()) {
    const tag = `m${now.toString(36)}${k}`;
    for (const e of src.wallet.entries) if (!LEDGER_APPS.has(e.app)) carried.push(e.id.startsWith('eco:') ? e : { ...e, id: `${tag}:${e.id}`.slice(0, 96) });
    for (const [app, s] of Object.entries(src.wallet.snap || {})) {
      if (!finite(s.cash) || src.data[app]) continue;
      carried.push({ id: `${tag}:snap:${app}`, t: now, app: 'eco', kind: 'merge', amount: s.cash, note: app });
    }
    Object.assign(pins, src.wallet.pins || {});
    for (const [key, v] of Object.entries(src.wallet.settings || {})) if (!settings[key] || v.t > settings[key].t) settings[key] = v;
  }
  const mergedApps = [...new Set(found.flatMap(s => Object.keys(s.data)))];
  const result = await updateWallet(env, deps, targetId, w => ({ ...mergeWallet(w, { entries: carried, settings, pins, inbox: inboxAdd }), merged: { t: now, apps: mergedApps } }));
  for (const src of found) await deleteAccount(env, deps, src.docId);
  return json({ moved, wallet: publicWallet(result.wallet), walletTime: result.updateTime, pool: poolBalance(result.wallet) }, 200, headers);
}
