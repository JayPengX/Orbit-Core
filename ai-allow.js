// Orbit AI allowances (Jay 11-14: "AI allowance should be able to be set for
// all account, existing account and limit or duration, just give me options").
// How many times a day, a month or in all an account may have Orbit AI made
// for it (a model call started for that person; an answer already kept for
// everyone is free and never counted). The Worker decides at each ask, from
// the account itself (eco.js levelOf, sec.ai), never from the phone.
//
// A rule: { n, per, until, at }
//   n      how many (null: no limit, 0: none)
//   per    'day' | 'month' (Taiwan's) | 'total' (from `at`, when it was set)
//   until  when it ends (ms; 0: never); ended, the next rule down applies
// Which rule: the account's own (sec.ai, admin 帳戶 › AI 額度) while it runs,
// else its level's (orbit-config/ai-allow, admin 設定 › Orbit AI 額度) while
// that runs, else AI_DEFAULTS. A 基本 account has none without a verified
// email (Jay 11-14: one account a person; a new account never gets it twice).
//
// Used: D1 `ai_use` (k: '<account>|<per>:<period>', n, e: when the row may go).
import { WALLET_COLLECTION, parseWallet, levelOf, gen } from './eco.js';
import { twDay } from './law.js';
import { stamp } from './doc-store.js';

export const PERS = ['day', 'month', 'total'];
export const AI_DEFAULTS = { full: { n: 50, per: 'day', until: 0, at: 0 }, free: { n: 0, per: 'day', until: 0, at: 0 } };
export const ALLOW_DOC = ['orbit-config', 'ai-allow'];
export const MAX_N = 100_000;
const DAY_MS = 86_400_000;
// The Worker's own sessions for the owner's tools (eco.js fullSession): no limit.
const OWNER_SESSIONS = new Set(['ops-shots']);

// A rule as typed (admin), or null when it isn't one.
export function cleanRule(r, now = Date.now()) {
  if (!r || typeof r !== 'object') return null;
  const n = r.n === null || r.n === '' || r.n === undefined ? null : Math.floor(Number(r.n));
  if (n !== null && !(n >= 0 && n <= MAX_N)) return null;
  const per = PERS.includes(r.per) ? r.per : 'day';
  const until = Number(r.until) > 0 ? Math.floor(Number(r.until)) : 0;
  return { n, per, until, at: Number(r.at) > 0 ? Math.floor(Number(r.at)) : now };
}
const running = (r, now) => Boolean(r) && !(r.until && r.until <= now);

// The level rules as set in admin (each may be missing), read once a minute an isolate.
let held = { at: 0, p: null };
export const forgetAllow = () => (held = { at: 0, p: null });
export async function levelRules(env, deps, now = Date.now()) {
  if (held.p && now - held.at < 60_000) return held.p;
  const p = deps
    .fsGet(env, ...ALLOW_DOC)
    .then(d => (d?.exists ? JSON.parse(d.payload) : {}))
    .catch(() => ({}));
  held = { at: now, p };
  return p;
}
export async function setLevelRule(env, deps, level, rule) {
  const now = deps.now();
  const had = await deps.fsGet(env, ...ALLOW_DOC).catch(() => null);
  let all = {};
  try {
    all = had?.exists ? JSON.parse(had.payload) || {} : {};
  } catch {}
  if (rule) all[level] = rule;
  else delete all[level];
  await deps.fsWrite(env, ...ALLOW_DOC, JSON.stringify(all));
  held = { at: now, p: Promise.resolve(all) };
  return all;
}

// The rule an account has now: { n, per, until, at, from: 'account' | 'level' | 'default' | 'mail' }.
export function ruleOf(wallet, levels, now = Date.now()) {
  const level = levelOf(wallet);
  const own = wallet?.sec?.ai;
  if (running(own, now)) return { ...own, from: 'account' };
  if (level === 'free' && !wallet?.mail?.addr) return { ...AI_DEFAULTS.free, n: 0, from: 'mail' };
  const set = levels?.[level];
  if (running(set, now)) return { ...set, from: 'level' };
  return { ...AI_DEFAULTS[level], from: 'default' };
}

// The rule's count this period: its key and when the row may go.
function periodOf(rule, now) {
  const day = twDay(now);
  if (rule.per === 'day') return { p: `day:${day}`, e: now + 2 * DAY_MS };
  if (rule.per === 'month') return { p: `month:${day.slice(0, 7)}`, e: now + 32 * DAY_MS };
  return { p: `total:${rule.at || 0}`, e: rule.until || now + 400 * DAY_MS };
}

const ready = new WeakSet();
async function table(env, now) {
  if (ready.has(env.STORE)) return;
  await env.STORE.prepare('CREATE TABLE IF NOT EXISTS ai_use (k TEXT PRIMARY KEY, n INTEGER NOT NULL, e INTEGER NOT NULL)').run();
  // (Ended periods go, once an isolate.)
  await env.STORE.prepare('DELETE FROM ai_use WHERE e < ?1').bind(now).run();
  ready.add(env.STORE);
}
const memory = new Map();
export const forgetUse = () => memory.clear();
async function usedOf(env, k) {
  if (!env.STORE?.prepare) return memory.get(k) || 0;
  const row = await env.STORE.prepare('SELECT n FROM ai_use WHERE k = ?1').bind(k).first();
  return Number(row?.n) || 0;
}
// One more, only while under `most` (null: no limit): the count after, or 0 when it's used up.
async function takeOne(env, k, most, e) {
  if (!env.STORE?.prepare) {
    const n = memory.get(k) || 0;
    if (most !== null && n >= most) return 0;
    memory.set(k, n + 1);
    return n + 1;
  }
  const cap = most === null ? MAX_N * 100 : most;
  const row = await env.STORE.prepare('INSERT INTO ai_use (k, n, e) VALUES (?1, 1, ?3) ON CONFLICT (k) DO UPDATE SET n = n + 1, e = MAX(e, ?3) WHERE n < ?2 RETURNING n')
    .bind(k, cap, e)
    .first();
  return cap > 0 && row ? Number(row.n) : 0;
}

// The account behind a session ('ses' token, already checked), signed in still.
async function walletOf(env, deps, c) {
  if (!c || typeof c.d !== 'string' || !c.d) return null;
  const doc = await deps.fsGet(env, WALLET_COLLECTION, c.d).catch(() => null);
  const wallet = doc?.exists ? parseWallet(doc.payload) : null;
  return wallet && gen(wallet) === (c.g || 0) ? wallet : null;
}

// What an account has and has left: { n, per, until, from, used, left } (left: null, no limit).
export async function allowanceOf(env, deps, id, wallet, now = deps.now()) {
  const rule = ruleOf(wallet, await levelRules(env, deps, now), now);
  if (rule.n === 0) return { ...rule, used: 0, left: 0 };
  if (env.STORE?.prepare) await table(env, now).catch(() => {});
  const used = await usedOf(env, `${id}|${periodOf(rule, now).p}`).catch(() => 0);
  return { ...rule, used, left: rule.n === null ? null : Math.max(0, rule.n - used) };
}

// May session `c` start an AI call (no count): true | 'level' (none at all) | 'used' (none left now).
export async function aiMay(env, deps, c) {
  if (c && OWNER_SESSIONS.has(c.d) && c.s === c.d) return true;
  const wallet = await walletOf(env, deps, c);
  if (!wallet) return 'level';
  const a = await allowanceOf(env, deps, c.d, wallet);
  return a.n === 0 ? 'level' : a.left === 0 ? 'used' : true;
}

// …and counted: one of the account's allowance taken as the call starts.
export async function aiSpend(env, deps, c) {
  if (c && OWNER_SESSIONS.has(c.d) && c.s === c.d) return true;
  const wallet = await walletOf(env, deps, c);
  if (!wallet) return 'level';
  const now = deps.now();
  const rule = ruleOf(wallet, await levelRules(env, deps, now), now);
  if (rule.n === 0) return 'level';
  try {
    if (env.STORE?.prepare) await table(env, now);
    const { p, e } = periodOf(rule, now);
    return (await takeOne(env, `${c.d}|${p}`, rule.n, e)) ? true : 'used';
  } catch {
    // (The count can't be read: no call started.)
    return 'used';
  }
}

// For the phone (eco.js sessionReply): what's left, plainly. null: no AI.
export async function aiLeft(env, deps, id, wallet) {
  const a = await allowanceOf(env, deps, id, wallet).catch(() => null);
  if (!a || a.n === 0) return null;
  return { n: a.n, per: a.per, left: a.left, until: a.until || 0 };
}

// Every account there is now (admin 套用到現有帳戶): its own rule set, or taken off (null).
// who: 'all' | 'full' | 'free'. → { changed }.
export async function grantAll(env, deps, who, rule) {
  if (!env.STORE?.prepare) return { error: 'no store' };
  const which = who === 'full' ? " AND json_extract(payload, '$.sec.level') = 'full'" : who === 'free' ? " AND COALESCE(json_extract(payload, '$.sec.level'), 'free') <> 'full'" : '';
  const set = rule ? "json_set(COALESCE(json_extract(payload, '$.sec'), '{}'), '$.ai', json(?3))" : "json_remove(COALESCE(json_extract(payload, '$.sec'), '{}'), '$.ai')";
  const res = await env.STORE.prepare(`UPDATE docs SET payload = json_set(payload, '$.sec', json(${set})), updated = ?2 WHERE coll = ?1${which}`)
    .bind(WALLET_COLLECTION, stamp(deps.now()), ...(rule ? [JSON.stringify(rule)] : []))
    .run();
  return { changed: res?.meta?.changes ?? 0 };
}
