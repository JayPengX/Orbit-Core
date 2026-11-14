// ---- pass-mail.js ----
// A recovery email on the Orbit Pass (Jay 2026-11-14): an address the owner
// proved is theirs, so a lost pass is never a lost account. Linked by a
// six-digit code mailed to it; a pass forgotten, a code mailed to it signs in
// on a session that only takes `rotate` (the kit's freshGate: a new pass
// first), so the old pass, wherever it went, stops working.
//
//   POST /eco { op: 'mail-begin', qt, addr, lang }      a code to link addr (10 min)
//   POST /eco { op: 'mail-confirm', qt, code }          linked: the wallet
//   POST /eco { op: 'mail-remove', qt }                 unlinked: the wallet
//   POST /eco { op: 'mail-recover-begin', addr, lang }  { sent: true }, always
//   POST /eco { op: 'mail-recover', addr, code, app }   signed in, fresh
//
// Kept in the wallet (`mail`: { addr, t }; the apps see it masked,
// publicWallet), so its history and nightly copies cover it. `eco-mail`
// finds the account from an address (doc id: HMAC of the address under
// ECO_TOKEN_SECRET, payload { d }): the store alone never says whose an
// address is. Codes wait in `eco-mail-codes` (only their HMAC), one per
// account being linked and one per address being recovered; each takes five
// tries, ends in ten minutes and is gone once used.
//
// Nobody learns from here whether an address is on a Pass: recover-begin
// answers the same for any address, writes the same row, counts the same
// sends, and the mail goes out after the answer (waitUntil). An address
// already on another Pass is refused only once its code is typed, to the
// person who proved it's theirs.

import { WALLET_COLLECTION, parseWallet, publicWallet, poolBalance, gen, updateWallet, signIn, ECO_LIMITS } from './eco.js';
import { readToken, sessionLimited } from './orbit-token.js';

export const MAIL_COLLECTION = 'eco-mail';
export const MAIL_CODES = 'eco-mail-codes';
export const MAIL_CODE_MS = 10 * 60_000;
export const MAIL_TRIES = 5;
// Mails one address gets a Taiwan day (linking and recovery each), and the
// wait before another.
export const MAIL_PER_DAY = 5;
export const MAIL_WAIT_MS = 60_000;

const TPE = 8 * 3_600_000;
const twDay = t => new Date(t + TPE).toISOString().slice(0, 10);
const enc = new TextEncoder();
const bad = (ctx, code, status = 400) => ctx.deps.errorJson(code, status, ctx.headers, ctx.request);

// An address as one form: trimmed, lower case; '' when it isn't one.
const ADDR = /^[^\s@"<>(),;:\\[\]]{1,64}@(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$/;
export function cleanAddr(v) {
  const a = typeof v === 'string' ? v.trim().toLowerCase() : '';
  return a.length <= 254 && ADDR.test(a) ? a : '';
}
// What the apps show: 'ja•••@gmail.com'.
export function maskAddr(addr) {
  const [user, host] = String(addr || '').split('@');
  if (!host) return '';
  return `${user.slice(0, user.length > 3 ? 2 : 1)}•••@${host}`;
}

const keys = new Map();
async function hmacHex(secret, text) {
  if (!keys.has(secret)) keys.set(secret, await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']));
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', keys.get(secret), enc.encode(text)));
  return Array.from(sig, b => b.toString(16).padStart(2, '0')).join('');
}
const addrKey = (secret, addr) => hmacHex(secret, `mail:v1:${addr}`);
export const mailIndexId = addrKey;
const codeHash = (secret, id, code) => hmacHex(secret, `code:v1:${id}:${code}`);
const same = (a, b) => {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let x = 0;
  for (let i = 0; i < a.length; i++) x |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return x === 0;
};
const sixDigits = () => String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, '0');
const parse = doc => {
  try {
    return doc.exists ? JSON.parse(doc.payload) : null;
  } catch {
    return null;
  }
};
const walletReply = (ctx, result) => ctx.deps.json({ wallet: publicWallet(result.wallet), walletTime: result.updateTime, pool: poolBalance(result.wallet) }, 200, ctx.headers);

// The address an account has (its own copy, never the masked one).
export const mailOf = wallet => (typeof wallet?.mail?.addr === 'string' ? wallet.mail.addr : '');
// What the apps see of it.
export const mailSummary = wallet => (mailOf(wallet) ? { shown: maskAddr(mailOf(wallet)), t: wallet.mail.t || 0 } : null);

async function session(ctx) {
  const c = await readToken(ctx.secret, ctx.body.qt, 'ses', ctx.deps.now());
  if (!c) return null;
  const doc = await ctx.deps.fsGet(ctx.env, WALLET_COLLECTION, c.d);
  const wallet = doc.exists ? parseWallet(doc.payload) : null;
  return wallet && gen(wallet) === c.g ? { c, wallet } : null;
}

// ---- The mails ----------------------------------------------------------------------

const lang = v => (v === 'en' ? 'en' : 'zh');
function codeMail(kind, code, l) {
  const en = l === 'en';
  const what = kind === 'link' ? (en ? 'add this address to your Orbit Pass' : '把這個信箱加到你的 Orbit Pass') : en ? 'sign in to your Orbit Pass' : '登入你的 Orbit Pass';
  const subject = en ? `Orbit Pass code: ${code}` : `Orbit Pass 驗證碼：${code}`;
  const lines = en
    ? [`Your code to ${what} is ${code}.`, 'It works once, within 10 minutes.', 'Didn’t ask for it? Ignore this mail: nothing changes without the code.']
    : [`${what}的驗證碼是 ${code}。`, '10 分鐘內有效，只能用一次。', '不是你要求的？不必理會，沒有驗證碼什麼都不會改變。'];
  return { subject, text: lines.join('\n\n'), lines, code, lang: l, title: en ? 'Your Orbit Pass code' : 'Orbit Pass 驗證碼' };
}
function noticeMail(kind, l) {
  const en = l === 'en';
  const lines =
    kind === 'replaced'
      ? en
        ? ['This address is no longer your Orbit Pass’s recovery email: another one was added in its place.', 'Not you? Sign in and check Orbit Pass › Security.']
        : ['這個信箱已不再是你 Orbit Pass 的救援信箱：已換成另一個信箱。', '不是你改的？請登入後到 Orbit Pass › 帳戶安全查看。']
      : en
        ? ['This address is no longer your Orbit Pass’s recovery email: it was removed.', 'Not you? Sign in and check Orbit Pass › Security.']
        : ['這個信箱已從你的 Orbit Pass 移除，不再是救援信箱。', '不是你移除的？請登入後到 Orbit Pass › 帳戶安全查看。'];
  const subject = en ? 'Orbit Pass: recovery email changed' : 'Orbit Pass：救援信箱已變更';
  return { subject, text: lines.join('\n\n'), lines, lang: l, title: subject };
}
// Sent after the answer where the request can wait for it (never holding
// the reply, and never telling by its time whether a mail went).
function later(ctx, task) {
  const p = Promise.resolve()
    .then(task)
    .catch(() => {});
  if (ctx.waitUntil) ctx.waitUntil(p);
  return p;
}
const send = (ctx, to, mail) => ctx.deps.sendMail(ctx.env, { to, ...mail });
// Mail can reach anyone's address (worker.js: the sender set up for that);
// until then every op here says ECO_MAIL_OFF and the kit hides the feature.
const ready = ctx => Boolean(ctx.deps.sendMail && ctx.deps.mailReady?.(ctx.env));
// Anyone's address: through Resend (mail.js; Cloudflare's own sending on the
// Free plan reaches only the owner's verified addresses). PASS_MAIL = "on":
// a test or a local run.
export const mailReady = env => Boolean(env?.RESEND_API_KEY) || env?.PASS_MAIL === 'on';

// One address's row for a code (linking: `l-<account>`; recovery:
// `r-<address key>`): a new code, unless the last went under a minute ago or
// the day's mails are used up. → { code, row } or { refused }.
async function newCode(ctx, id, fields) {
  const { env, deps } = ctx;
  const now = deps.now();
  const had = parse(await deps.fsGet(env, MAIL_CODES, id));
  const day = twDay(now);
  const sent = had?.day === day ? had.s || 0 : 0;
  if (had?.t > now - MAIL_WAIT_MS) return { refused: 'ECO_MAIL_WAIT' };
  if (sent >= MAIL_PER_DAY) return { refused: 'ECO_MAIL_TOO_MANY' };
  const code = sixDigits();
  const row = { ...fields, h: await codeHash(ctx.secret, id, code), n: 0, e: now + MAIL_CODE_MS, t: now, day, s: sent + 1 };
  await deps.fsWrite(env, MAIL_CODES, id, JSON.stringify(row));
  return { code, row };
}
// The code typed against the row: true once (the row's code is spent),
// false for a wrong or ended one (five wrong and it's gone).
async function useCode(ctx, id, code) {
  const { env, deps } = ctx;
  const row = parse(await deps.fsGet(env, MAIL_CODES, id));
  if (!row?.h || !(row.e > deps.now()) || row.n >= MAIL_TRIES) return null;
  if (!/^\d{6}$/.test(code) || !same(await codeHash(ctx.secret, id, code), row.h)) {
    await deps.fsWrite(env, MAIL_CODES, id, JSON.stringify({ ...row, n: row.n + 1, ...(row.n + 1 >= MAIL_TRIES ? { h: '' } : {}) }));
    return null;
  }
  // (Spent, its day's count kept: the rate stays counted.)
  await deps.fsWrite(env, MAIL_CODES, id, JSON.stringify({ ...row, h: '', n: MAIL_TRIES }));
  return row;
}
const cleanCodeIn = v => (typeof v === 'string' ? v.replace(/\D/g, '').slice(0, 6) : '');

// ---- Linking -----------------------------------------------------------------------

export async function mailBegin(ctx) {
  const { deps, body } = ctx;
  if (!ready(ctx)) return bad(ctx, 'ECO_MAIL_OFF', 503);
  const s = await session(ctx);
  if (!s) return bad(ctx, 'ECO_TOKEN_INVALID', 401);
  if (sessionLimited(`ml:${s.c.s}`, 5, 60_000, deps.now())) return bad(ctx, 'RATE_LIMITED', 429);
  const addr = cleanAddr(body.addr);
  if (!addr) return bad(ctx, 'ECO_MAIL_INVALID');
  if (addr === mailOf(s.wallet)) return bad(ctx, 'ECO_MAIL_SAME', 409);
  const id = `l-${s.c.d}`;
  const got = await newCode(ctx, id, { a: addr, g: s.c.g });
  if (got.refused) return bad(ctx, got.refused, 429);
  try {
    await send(ctx, addr, codeMail('link', got.code, lang(body.lang)));
  } catch {
    // (Not sent: not counted, and no wait before trying again.)
    await deps.fsWrite(ctx.env, MAIL_CODES, id, JSON.stringify({ ...got.row, h: '', t: 0, s: got.row.s - 1 }));
    return bad(ctx, 'ECO_MAIL_OFF', 503);
  }
  return deps.json({ sent: true, exp: got.row.e, shown: maskAddr(addr) }, 200, ctx.headers);
}

export async function mailConfirm(ctx) {
  const { env, deps, body, secret } = ctx;
  const s = await session(ctx);
  if (!s) return bad(ctx, 'ECO_TOKEN_INVALID', 401);
  if (sessionLimited(`mc:${s.c.s}`, 10, 60_000, deps.now())) return bad(ctx, 'RATE_LIMITED', 429);
  const row = await useCode(ctx, `l-${s.c.d}`, cleanCodeIn(body.code));
  if (!row || row.g !== s.c.g) return bad(ctx, 'ECO_MAIL_CODE_WRONG', 401);
  const addr = row.a;
  const at = await addrKey(secret, addr);
  // The address on another Pass (said only now, to its proven owner).
  const index = parse(await deps.fsGet(env, MAIL_COLLECTION, at));
  if (index?.d && index.d !== s.c.d) {
    const other = await deps.fsGet(env, WALLET_COLLECTION, index.d);
    if (other.exists && mailOf(parseWallet(other.payload)) === addr) return bad(ctx, 'ECO_MAIL_TAKEN', 409);
  }
  const now = deps.now();
  let before = '';
  let refused = false;
  const result = await updateWallet(
    env,
    deps,
    s.c.d,
    w => {
      refused = gen(w) !== s.c.g;
      before = mailOf(w);
      return refused ? w : { ...w, mail: { addr, t: now } };
    },
    { skipIf: () => refused }
  );
  if (!result || refused) return bad(ctx, 'ECO_SIGNED_OUT', 401);
  await deps.fsWrite(env, MAIL_COLLECTION, at, JSON.stringify({ d: s.c.d }));
  if (before && before !== addr) {
    await dropMailIndex(env, deps, secret, s.c.d, before);
    if (ready(ctx)) later(ctx, () => send(ctx, before, noticeMail('replaced', lang(body.lang))));
  }
  return walletReply(ctx, result);
}

export async function mailRemove(ctx) {
  const { env, deps, body, secret } = ctx;
  const s = await session(ctx);
  if (!s) return bad(ctx, 'ECO_TOKEN_INVALID', 401);
  let before = '';
  const result = await updateWallet(env, deps, s.c.d, w => {
    before = mailOf(w);
    if (!w.mail) return w;
    const { mail, ...rest } = w;
    return rest;
  });
  if (!result) return bad(ctx, 'ECO_SIGNED_OUT', 401);
  if (before) {
    await dropMailIndex(env, deps, secret, s.c.d, before);
    if (ready(ctx)) later(ctx, () => send(ctx, before, noticeMail('removed', lang(body.lang))));
  }
  return walletReply(ctx, result);
}

// ---- Recovery ----------------------------------------------------------------------

export async function mailRecoverBegin(ctx) {
  const { env, deps, body, secret } = ctx;
  if (!ready(ctx)) return bad(ctx, 'ECO_MAIL_OFF', 503);
  const hit = await deps.rateLimitResponse(env, ctx.ip, 'eco:mail', ECO_LIMITS.mail, ctx.headers, ctx.request);
  if (hit) return hit;
  const addr = cleanAddr(body.addr);
  if (!addr) return bad(ctx, 'ECO_MAIL_INVALID');
  const at = await addrKey(secret, addr);
  // Found or not, the same reads and the same row (its waits and day's
  // count hold for any address); only a linked one gets a mail.
  const index = parse(await deps.fsGet(env, MAIL_COLLECTION, at));
  const doc = await deps.fsGet(env, WALLET_COLLECTION, index?.d || at);
  const linked = doc.exists && mailOf(parseWallet(doc.payload)) === addr ? index.d : '';
  const got = await newCode(ctx, `r-${at}`, { d: linked });
  if (got.refused) return bad(ctx, got.refused, 429);
  if (linked) later(ctx, () => send(ctx, addr, codeMail('recover', got.code, lang(body.lang))));
  return deps.json({ sent: true, exp: got.row.e }, 200, ctx.headers);
}

export async function mailRecover(ctx) {
  const { env, deps, body, secret } = ctx;
  const hit = await deps.rateLimitResponse(env, ctx.ip, 'eco:login', ECO_LIMITS.login, ctx.headers, ctx.request);
  if (hit) return hit;
  const addr = cleanAddr(body.addr);
  if (!addr) return bad(ctx, 'ECO_MAIL_CODE_WRONG', 401);
  const at = await addrKey(secret, addr);
  const row = await useCode(ctx, `r-${at}`, cleanCodeIn(body.code));
  if (!row?.d) return bad(ctx, 'ECO_MAIL_CODE_WRONG', 401);
  // Still this address's account (not unlinked or moved meanwhile).
  const index = parse(await deps.fsGet(env, MAIL_COLLECTION, at));
  const doc = index?.d === row.d ? await deps.fsGet(env, WALLET_COLLECTION, row.d) : { exists: false };
  if (!doc.exists || mailOf(parseWallet(doc.payload)) !== addr) return bad(ctx, 'ECO_MAIL_CODE_WRONG', 401);
  // A session that takes only `rotate`: the lost pass is replaced first.
  const res = await signIn(ctx, row.d, { fresh: true });
  return res || bad(ctx, 'ECO_MAIL_CODE_WRONG', 401);
}

// ---- Kept pointing at the account (a new pass, a merge, a delete) ----------------------

export async function pointMail(env, deps, secret, docId, wallet) {
  const addr = mailOf(wallet);
  if (addr) await deps.fsWrite(env, MAIL_COLLECTION, await addrKey(secret, addr), JSON.stringify({ d: docId }));
}
// The address's finder deleted if it still leads to `docId`.
export async function dropMailIndex(env, deps, secret, docId, addr) {
  if (!addr) return;
  const at = await addrKey(secret, addr);
  const index = parse(await deps.fsGet(env, MAIL_COLLECTION, at));
  if (index && (!index.d || index.d === docId)) await deps.fsDelete(env, MAIL_COLLECTION, at);
  const code = parse(await deps.fsGet(env, MAIL_CODES, `r-${at}`));
  if (code?.d === docId) await deps.fsWrite(env, MAIL_CODES, `r-${at}`, JSON.stringify({ ...code, d: '', h: '' }));
}
