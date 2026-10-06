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

import { newPasscode, updateWallet, deleteAccount, ECO_APPS, WALLET_COLLECTION, INBOX_COLLECTION, SHARE_COLLECTION, PAIR_COLLECTION, PAIR_MS, ECO_LIMITS, parseWallet, poolBalance, plusMember, plusLapsed, taipeiMonth, gen, emptyWallet } from './eco.js';
import { sendPush } from './push.js';
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
//     Worker's own. Orbit Words (once Rewards: word points, games, missions,
//     its shop and points catalogue) and Orbit Sports write none any more: theirs
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
  // The owner's token: ADMIN_TOKEN_HASH (its SHA-256, in this file) or the
  // Worker's secret ECO_ADMIN_TOKEN (set by tools/issue-passes.mjs).
  const token = typeof body.token === 'string' ? body.token : '';
  const hash = token.length >= 32 ? await deps.sha256Hex(token) : '';
  const owner = hash && ((ADMIN_TOKEN_HASH && hash === ADMIN_TOKEN_HASH) || (env.ECO_ADMIN_TOKEN && hash === (await deps.sha256Hex(env.ECO_ADMIN_TOKEN))));
  if (!owner) return deps.errorJson('FORBIDDEN', 403, headers, request);
  // Passes to hand out: `issue` { count } makes up to 100 new ones (no one
  // signed in on them yet) and answers their codes, once.
  if (body.action === 'issue') {
    const count = Math.max(1, Math.min(100, Math.floor(Number(body.count) || 0)));
    const now = deps.now();
    const passes = [];
    for (let i = 0; i < count; i++) {
      const { passcode, docId } = await newPasscode(env, deps);
      await updateWallet(env, deps, docId, w => ({ ...w, v2: now }), { create: true });
      passes.push(passcode);
    }
    return deps.json({ passes }, 200, headers);
  }
  if (!deps.fsList || !deps.fsCollections || !deps.fsBatch) return deps.errorJson('ECO_UNKNOWN_OP', 400, headers, request);
  // Getting an account back whose pass was lost: `wallets` lists every pass
  // (a short reference, when it was made and last used, balance, entries),
  // `device-code` { wallet: reference } makes a one-time device code for it
  // (10 minutes), so its owner signs in and sets a new pass.
  if (body.action === 'wallets') return deps.json({ wallets: await walletList(env, deps) }, 200, headers);
  // The panel's other views and tools (adminTools below): an overview,
  // one account in full, money and Plus by hand, signing an account out,
  // a never-used pass removed, notices, the sources' health.
  if (ADMIN_TOOLS[body.action]) {
    try {
      const out = await ADMIN_TOOLS[body.action]({ env, deps, body });
      return out.error ? deps.errorJson(out.error, out.status || 400, headers, request) : deps.json(out, 200, headers);
    } catch (error) {
      return deps.errorJson(error?.message === 'wallet busy, try again' ? 'ECO_BUSY' : 'ADMIN_FAILED', 500, headers, request);
    }
  }
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
  // Starting an account over, at its owner's request: `reset` { passcode,
  // keep: [apps] } leaves the pass and the kept apps' data (their settings
  // and inbox too) and makes everything else new: a fresh wallet (the
  // opening money comes with the next sign-in), every other app's data gone,
  // every device signed out (so no device sends its old copy back).
  if (body.action === 'reset') {
    const code = String(body.passcode || '').trim().toUpperCase().replace(/[\s-]/g, '');
    const docId = code ? await deps.sha256Hex(code) : '';
    const w = docId ? await deps.fsGet(env, WALLET_COLLECTION, docId) : { exists: false };
    const wallet = w.exists ? parseWallet(w.payload) : null;
    if (!wallet) return deps.errorJson('SYNC_PASSCODE_NOT_FOUND', 404, headers, request);
    const keep = new Set((Array.isArray(body.keep) ? body.keep : []).filter(a => ECO_APPS[a]));
    const now = deps.now();
    const kept = key => [...keep].some(a => key.startsWith(a) || key === `aff:${a}`);
    const fresh = {
      ...emptyWallet(now),
      v2: now,
      sec: { ...(wallet.sec || {}), gen: gen(wallet) + 1 },
      settings: Object.fromEntries(Object.entries(wallet.settings || {}).filter(([k]) => kept(k) || k === 'lang' || k === 'notify')),
      apps: Object.fromEntries(Object.entries(wallet.apps || {}).filter(([a]) => keep.has(a))),
      inbox: Object.fromEntries(Object.entries(wallet.inbox || {}).filter(([a]) => keep.has(a)))
    };
    const gone = [];
    for (const [app, { collection }] of Object.entries(ECO_APPS)) {
      if (keep.has(app)) continue;
      await deps.fsDelete(env, collection, docId);
      gone.push(app);
      for (const id of wallet.inbox?.[app] || []) if (id.startsWith(`${docId}-`)) await deps.fsDelete(env, INBOX_COLLECTION, id);
    }
    await deps.fsWrite(env, WALLET_COLLECTION, docId, JSON.stringify(fresh));
    return deps.json({ reset: true, gone, kept: [...keep], settings: Object.keys(fresh.settings) }, 200, headers);
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
  const now = deps.now();
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
      plus: wallet ? plusMember(wallet, now) : false,
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

// ---- The panel's tools ----------------------------------------------------------------
//
// Every one answers { …data } or { error, status }. An account is named by
// the start of its reference (the first 6+ characters of its id, as the
// panel's table shows it): exactly one must match.
const DAY = 86_400_000;
const MAX_GRANT = 1_000_000;
const appsOf = w => Object.entries(w?.apps || {}).map(([app, a]) => ({ app, first: a.first || null, last: a.last || null }));
const lastUsed = w => Math.max(0, ...appsOf(w).map(a => a.last || 0));
async function findWallet(env, deps, ref) {
  const r = String(ref || '').trim();
  if (r.length < 6) return null;
  const hits = (await deps.fsList(env, WALLET_COLLECTION, 300)).filter(w => w.id.startsWith(r));
  if (hits.length !== 1) return null;
  const wallet = parseWallet(hits[0].payload);
  return wallet ? { id: hits[0].id, wallet, updateTime: hits[0].updateTime } : null;
}
const notFound = { error: 'ECO_PAIR_NOT_FOUND', status: 404 };
// Push records in KV: push:<account>:<app> ({ sub, items, last, told }).
async function pushRecords(env, prefix = 'push:') {
  const kv = env.RATE_LIMIT_KV;
  if (!kv?.list) return [];
  const out = [];
  let cursor;
  for (let i = 0; i < 10; i++) {
    const page = await kv.list({ prefix, cursor });
    for (const k of page.keys) {
      const rest = k.name.slice(5);
      if (k.name === 'push:due' || rest.startsWith('prefs:')) continue;
      const cut = rest.lastIndexOf(':');
      out.push({ key: k.name, account: rest.slice(0, cut), app: rest.slice(cut + 1) });
    }
    if (page.list_complete || !page.cursor) break;
    cursor = page.cursor;
  }
  return out;
}
// The sources the apps lean on, each asked once (public reads only, no keys).
const HEALTH = [
  ['ESPN', 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard'],
  ['Kambi', 'https://eu-offering-api.kambicdn.com/offering/v2018/ub/listView/formula_1/all/all/all/competitions.json?lang=en_GB&market=GB'],
  ['Polymarket', 'https://gamma-api.polymarket.com/events?limit=1&closed=false'],
  ['OpenF1', 'https://api.openf1.org/v1/sessions?session_key=latest'],
  ['NLSC 地點', 'https://api.nlsc.gov.tw/other/TownVillagePointQuery1/121.5645/25.0341'],
  ['Shared-Data', 'https://jaypengx.github.io/Shared-Data/sports/nba/days.json'],
  ['台灣彩券', 'https://api.taiwanlottery.com/TLCAPIWeB/Lottery/LatestResult']
];

export const ADMIN_TOOLS = {
  // The whole pass at a glance: accounts, who's active, Plus, the money, each
  // app's users, the last 14 days' sign-ups and last uses.
  async overview({ env, deps }) {
    const now = deps.now();
    const list = (await deps.fsList(env, WALLET_COLLECTION, 300)).map(w => ({ id: w.id, w: parseWallet(w.payload) })).filter(x => x.w);
    const active = ms => list.filter(x => now - lastUsed(x.w) < ms).length;
    const apps = {};
    for (const x of list)
      for (const a of appsOf(x.w)) {
        apps[a.app] ||= { users: 0, week: 0 };
        apps[a.app].users++;
        if (now - (a.last || 0) < 7 * DAY) apps[a.app].week++;
      }
    const flows = {};
    for (const x of list)
      for (const e of x.w.entries)
        if (now - (e.t || 0) < 7 * DAY && e.amount) {
          const k = `${e.app}:${e.kind}`;
          flows[k] ||= { in: 0, out: 0, n: 0 };
          flows[k][e.amount > 0 ? 'in' : 'out'] += Math.abs(e.amount);
          flows[k].n++;
        }
    const day = t => new Date(t + 8 * 3_600_000).toISOString().slice(0, 10);
    const days = Array.from({ length: 14 }, (_, i) => day(now - (13 - i) * DAY));
    const byDay = f => days.map(d => list.filter(x => f(x.w) && day(f(x.w)) === d).length);
    const balances = list.map(x => poolBalance(x.w));
    return {
      at: now,
      accounts: list.length,
      used: list.filter(x => lastUsed(x.w)).length,
      active: { day: active(DAY), week: active(7 * DAY), month: active(30 * DAY) },
      newWeek: list.filter(x => now - (x.w.created || 0) < 7 * DAY).length,
      plus: list.filter(x => plusMember(x.w, now)).length,
      money: { total: Math.round(balances.reduce((a, b) => a + b, 0)), overdrawn: balances.filter(b => b < 0).length, top: Math.round(Math.max(0, ...balances)) },
      apps,
      flows,
      days,
      signups: byDay(w => w.created || 0),
      lastSeen: byDay(lastUsed)
    };
  },
  // One account in full: its apps, money, Plus, settings, the last records, its notices.
  async wallet({ env, deps, body }) {
    const hit = await findWallet(env, deps, body.wallet);
    if (!hit) return notFound;
    const { id, wallet } = hit;
    const now = deps.now();
    const pushes = (await pushRecords(env, `push:${id}:`).catch(() => [])).map(r => r.app);
    const plusMonths = wallet.entries.filter(e => e.app === 'eco' && e.id?.startsWith('eco:plus:')).map(e => e.id.slice(9)).sort();
    return {
      ref: id.slice(0, 8),
      created: wallet.created || null,
      lastUsed: lastUsed(wallet) || null,
      gen: gen(wallet),
      balance: poolBalance(wallet),
      apps: appsOf(wallet),
      plus: { member: plusMember(wallet, now), renewing: wallet.settings?.plus?.value?.on === true, plan: wallet.settings?.plus?.value?.plan || null, lapsed: plusLapsed(wallet), months: plusMonths.slice(-24) },
      entries: wallet.entries.length,
      recent: [...wallet.entries].sort((a, b) => (b.t || 0) - (a.t || 0)).slice(0, 60).map(e => ({ t: e.t, app: e.app, kind: e.kind, amount: e.amount, note: e.note || '' })),
      snaps: Object.fromEntries(Object.entries(wallet.snap || {}).map(([k, v]) => [k, typeof v?.cash === 'number' ? v.cash : null])),
      settings: Object.keys(wallet.settings || {}).sort(),
      inbox: Object.fromEntries(Object.entries(wallet.inbox || {}).map(([k, v]) => [k, v.length])),
      pushes
    };
  },
  // Money by hand (a correction, a prize): an 'eco' entry, kind 'admin', with its reason.
  async grant({ env, deps, body }) {
    const amount = Math.round(Number(body.amount) * 100) / 100;
    const note = String(body.note || '').trim().slice(0, 60);
    if (!Number.isFinite(amount) || !amount || Math.abs(amount) > MAX_GRANT || !note) return { error: 'ADMIN_BAD_AMOUNT', status: 400 };
    const hit = await findWallet(env, deps, body.wallet);
    if (!hit) return notFound;
    const now = deps.now();
    const entry = { id: `eco:admin:${now}`, t: now, app: 'eco', kind: 'admin', amount, note };
    const res = await updateWallet(env, deps, hit.id, w => ({ ...w, entries: [...w.entries, entry] }));
    return { ok: true, entry, balance: poolBalance(res.wallet) };
  },
  // Plus by hand: `months` free months from this one (any already held kept);
  // `stop`: no renewal (what's paid runs out).
  async plus({ env, deps, body }) {
    const hit = await findWallet(env, deps, body.wallet);
    if (!hit) return notFound;
    const now = deps.now();
    if (body.stop) {
      const res = await updateWallet(env, deps, hit.id, w => ({ ...w, settings: { ...(w.settings || {}), plus: { value: { ...(w.settings?.plus?.value || {}), on: false, t: now }, t: now } } }));
      return { ok: true, renewing: false, member: plusMember(res.wallet, now) };
    }
    const n = Math.max(1, Math.min(12, Math.floor(Number(body.months) || 0)));
    const res = await updateWallet(env, deps, hit.id, w => {
      const have = new Set(w.entries.map(e => e.id));
      const add = [];
      for (let m = taipeiMonth(now), i = 0; i < n; i++) {
        if (!have.has(`eco:plus:${m}`)) add.push({ id: `eco:plus:${m}`, t: now, app: 'eco', kind: 'plus', amount: 0, note: 'gift' });
        const [y, mo] = m.split('-').map(Number);
        m = mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, '0')}`;
      }
      return add.length ? { ...w, entries: [...w.entries, ...add] } : w;
    });
    return { ok: true, member: plusMember(res.wallet, now) };
  },
  // Every device signed out (the pass still works: they sign in again).
  async signout({ env, deps, body }) {
    const hit = await findWallet(env, deps, body.wallet);
    if (!hit) return notFound;
    const res = await updateWallet(env, deps, hit.id, w => ({ ...w, sec: { ...(w.sec || {}), gen: gen(w) + 1 }, live: null }));
    return { ok: true, gen: gen(res.wallet) };
  },
  // A pass handed out and never used, taken back (its code stops working).
  async remove({ env, deps, body }) {
    const hit = await findWallet(env, deps, body.wallet);
    if (!hit) return notFound;
    if (lastUsed(hit.wallet) || hit.wallet.entries.some(e => e.app !== 'eco' || e.kind !== 'start')) return { error: 'ADMIN_IN_USE', status: 409 };
    await deleteAccount(env, deps, hit.id);
    return { ok: true };
  },
  // Notices: who's subscribed, per app, and what's waiting to be sent.
  async pushes({ env }) {
    const records = await pushRecords(env);
    const kv = env.RATE_LIMIT_KV;
    const due = kv ? (await kv.get('push:due', 'json')) || {} : {};
    const apps = {};
    for (const r of records) apps[r.app] = (apps[r.app] || 0) + 1;
    const next = Object.values(due).filter(Number.isFinite).sort((a, b) => a - b);
    return { records: records.length, accounts: new Set(records.map(r => r.account)).size, apps, due: next.length, next: next[0] || null };
  },
  // A test notice to one account's device for one app.
  async 'push-test'({ env, deps, body }) {
    const hit = await findWallet(env, deps, body.wallet);
    if (!hit) return notFound;
    const app = String(body.app || '');
    const record = env.RATE_LIMIT_KV ? await env.RATE_LIMIT_KV.get(`push:${hit.id}:${app}`, 'json') : null;
    if (!record?.sub) return { error: 'ADMIN_NO_PUSH', status: 404 };
    const r = await sendPush(env, record.sub, { title: 'Quadra 測試通知', body: '這是管理頁送出的測試通知，收到代表通知正常。', tag: `test:${deps.now()}` });
    return { ok: r === 'sent', result: String(r) };
  },
  // The sources the apps read, each asked once: answered, how fast.
  async health() {
    const one = async ([name, url]) => {
      const t = Date.now();
      try {
        const res = await fetch(url, { headers: { 'User-Agent': 'curl/8.4.0' }, signal: AbortSignal.timeout(8000) });
        await res.arrayBuffer();
        return { name, ok: res.ok, status: res.status, ms: Date.now() - t };
      } catch (e) {
        return { name, ok: false, status: 0, ms: Date.now() - t, error: String(e?.name || e) };
      }
    };
    return { at: Date.now(), checks: await Promise.all(HEALTH.map(one)) };
  }
};
