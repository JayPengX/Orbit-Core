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
import { readToken, sessionLimited, tokenSecret } from './orbit-token.js';
import { DEV } from './kit/brand.mjs';
import { passMailHtml } from './site/admin/mail-look.mjs';

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
  const what = {
    link: en ? 'add this address to your Orbit Pass' : '把這個信箱加到你的 Orbit Pass',
    signup: en ? 'make your Orbit Pass' : '建立你的 Orbit Pass',
    recover: en ? 'sign in to your Orbit Pass' : '登入你的 Orbit Pass'
  }[kind];
  const head = {
    link: en ? 'Confirm your recovery email' : '確認你的救援信箱',
    signup: en ? 'Make your Orbit Pass' : '建立你的 Orbit Pass',
    recover: en ? 'Sign in to your Orbit Pass' : '登入你的 Orbit Pass'
  }[kind];
  const subject = en ? `Orbit Pass code: ${code}` : `Orbit Pass 驗證碼：${code}`;
  const lines = [en ? 'It works once, within 10 minutes.' : '10 分鐘內有效，只能用一次。'];
  const aside = en ? 'Didn’t ask for it? Ignore this mail: nothing changes without the code.' : '不是你要求的？不必理會，沒有驗證碼什麼都不會改變。';
  const first = en ? `Your code to ${what} is ${code}.` : `${what}的驗證碼是 ${code}。`;
  return { subject, text: [first, ...lines, aside].join('\n\n'), head, lines, aside, code, lang: l, title: en ? 'Your Orbit Pass code' : 'Orbit Pass 驗證碼' };
}
function noticeMail(kind, l) {
  const en = l === 'en';
  const lines =
    kind === 'replaced'
      ? en
        ? ['This address is no longer your Orbit Pass’s recovery email: another one was added in its place.']
        : ['這個信箱已不再是你 Orbit Pass 的救援信箱：已換成另一個信箱。']
      : en
        ? ['This address is no longer your Orbit Pass’s recovery email: it was removed.']
        : ['這個信箱已從你的 Orbit Pass 移除，不再是救援信箱。'];
  const aside = en ? 'Not you? Sign in and check Orbit Pass › Security.' : '不是你改的？請登入後到 Orbit Pass › 帳戶安全查看。';
  const subject = en ? 'Orbit Pass: recovery email changed' : 'Orbit Pass：救援信箱已變更';
  return { subject, text: [...lines, aside].join('\n\n'), head: en ? 'Recovery email changed' : '救援信箱已變更', lines, aside, lang: l, title: subject };
}
// The mails' page (worker.js sends it through mail.js, Resend for anyone's
// address): every Orbit mail's card (site/admin/mail-look.mjs).
export const mailPage = m => passMailHtml(m);

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

// A notice to an address no longer the Pass's: after the reply, from recovery's share.
const notice = (ctx, to, mail) =>
  later(ctx, async () => {
    const room = await take(ctx, 'recover');
    if (!room.refused) await send(ctx, to, mail).catch(() => room.back());
  });

// ---- The day's mails, everyone's together ------------------------------------------
//
// The sender's day is small (Resend's free plan: 100), and the two ops anyone
// can call could use it up from a script. So a count of Orbit's mails a
// Taiwan day, in D1 (deps.dayCount: law.js addOne; a test's memory without
// it), checked before each one: new addresses (a sign-up's, a link's) stop at
// 60% of the day's budget (admin 設定 `mailDay`), recovery goes on to 95%. And
// any one address gets at most MAIL_PER_DAY of the new-address mails a day,
// whichever passes ask (counted by its HMAC, never the address itself).
export const MAIL_SHARE = { fresh: 0.6, recover: 0.95 };
const memoryCounts = new Map();
async function dayCount(ctx, k, by = 1) {
  if (ctx.deps.dayCount) return ctx.deps.dayCount(ctx.env, k, twDay(ctx.deps.now()), by);
  const key = `${twDay(ctx.deps.now())}|${k}`;
  memoryCounts.set(key, (memoryCounts.get(key) || 0) + by);
  return memoryCounts.get(key);
}
export const forgetMailCounts = () => memoryCounts.clear();
async function budget(ctx) {
  const v = await Promise.resolve(ctx.deps.mailBudget?.(ctx.env)).catch(() => null);
  return Number.isFinite(v) ? v : DEV.mailDay.def;
}
// One mail taken from the day's budget (and `at`'s, an address's key), or
// the refusal's code; undone by `back` when the mail didn't go. (A count
// that can't be read refuses: addOne's Infinity.)
async function take(ctx, share, at = '') {
  const cap = Math.floor((await budget(ctx)) * MAIL_SHARE[share]);
  if ((await dayCount(ctx, 'mail:day')) > cap) {
    await dayCount(ctx, 'mail:day', -1).catch(() => {});
    return { refused: 'ECO_MAIL_BUSY' };
  }
  if (at && (await dayCount(ctx, `mail:to:${at}`)) > MAIL_PER_DAY) {
    await Promise.all([dayCount(ctx, 'mail:day', -1), dayCount(ctx, `mail:to:${at}`, -1)]).catch(() => {});
    return { refused: 'ECO_MAIL_TOO_MANY' };
  }
  return { back: () => Promise.all([dayCount(ctx, 'mail:day', -1), at && dayCount(ctx, `mail:to:${at}`, -1)]).catch(() => {}) };
}
// Recovery's door shut for every address alike once the day is nearly used
// (so it never tells a linked address from another).
async function recoveryFull(ctx) {
  const n = await dayCount(ctx, 'mail:day', 0);
  return !(n < Math.floor((await budget(ctx)) * MAIL_SHARE.recover));
}
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

// A code to a new address (a link's, a sign-up's): taken from the day's
// budget and the address's, then sent. Not sent: the row's code dropped, its
// count and wait given back, → the refusal (else null).
async function mailFresh(ctx, id, got, addr, mail) {
  const drop = () => ctx.deps.fsWrite(ctx.env, MAIL_CODES, id, JSON.stringify({ ...got.row, h: '', t: 0, s: got.row.s - 1 }));
  const room = await take(ctx, 'fresh', await addrKey(ctx.secret, addr));
  if (room.refused) {
    await drop();
    return bad(ctx, room.refused, room.refused === 'ECO_MAIL_BUSY' ? 503 : 429);
  }
  try {
    await send(ctx, addr, mail);
    return null;
  } catch {
    await Promise.all([drop(), room.back()]);
    return bad(ctx, 'ECO_MAIL_OFF', 503);
  }
}

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
  const fail = await mailFresh(ctx, id, got, addr, codeMail('link', got.code, lang(body.lang)));
  if (fail) return fail;
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
  // The address on another Pass (said only now, to its proven owner); its
  // finder claimed first, so two passes at once can't both have it.
  const claim = await claimMail(env, deps, secret, addr, s.c.d);
  if (!claim) return bad(ctx, 'ECO_MAIL_TAKEN', 409);
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
  if (!result || refused) {
    if (claim === 'new') await dropMailIndex(env, deps, secret, s.c.d, addr);
    return bad(ctx, 'ECO_SIGNED_OUT', 401);
  }
  if (before && before !== addr) {
    await dropMailIndex(env, deps, secret, s.c.d, before);
    if (ready(ctx)) notice(ctx, before, noticeMail('replaced', lang(body.lang)));
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
    if (ready(ctx)) notice(ctx, before, noticeMail('removed', lang(body.lang)));
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
  if (await recoveryFull(ctx)) return bad(ctx, 'ECO_MAIL_BUSY', 503);
  const at = await addrKey(secret, addr);
  // Found or not, the same reads and the same row (its waits and day's
  // count hold for any address); only a linked one gets a mail.
  const index = parse(await deps.fsGet(env, MAIL_COLLECTION, at));
  const doc = await deps.fsGet(env, WALLET_COLLECTION, index?.d || at);
  const linked = doc.exists && mailOf(parseWallet(doc.payload)) === addr ? index.d : '';
  const got = await newCode(ctx, `r-${at}`, { d: linked });
  if (got.refused) return bad(ctx, got.refused, 429);
  if (linked)
    later(ctx, async () => {
      const room = await take(ctx, 'recover');
      if (room.refused) return;
      await send(ctx, addr, codeMail('recover', got.code, lang(body.lang))).catch(() => room.back());
    });
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

// ---- Making a pass with an address (eco.js create: Jay 11-14, a new 基本 pass
// needs a verified email, one account to an address) ----------------------------------

// The code to the address that will be on the new pass: the op's whole reply.
// Taken or not, the same answer and a code (an address's owner hears it is
// taken only once the code proves it, signupMailProve).
export async function signupMailBegin(ctx) {
  const { env, deps, body, secret } = ctx;
  if (!ready(ctx)) return bad(ctx, 'ECO_MAIL_OFF', 503);
  const hit = await deps.rateLimitResponse(env, ctx.ip, 'eco:mail', ECO_LIMITS.mail, ctx.headers, ctx.request);
  if (hit) return hit;
  const addr = cleanAddr(body.addr ?? body.email);
  if (!addr) return bad(ctx, 'ECO_MAIL_INVALID');
  const id = `c-${await addrKey(secret, addr)}`;
  const got = await newCode(ctx, id, { a: addr });
  if (got.refused) return bad(ctx, got.refused, 429);
  const fail = await mailFresh(ctx, id, got, addr, codeMail('signup', got.code, lang(body.lang)));
  if (fail) return fail;
  return deps.json({ sent: true, exp: got.row.e, shown: maskAddr(addr) }, 200, ctx.headers);
}
// The code typed for that address, spent → { addr, mail } (mail: the wallet's
// field: claimMail for the new account first, '' = taken, then the wallet
// written with `{ ...wallet, mail }`), or
// { refused: Response } (a wrong or ended code, or the address already on a
// Pass: ECO_MAIL_TAKEN, the kit offering 用救援信箱找回).
export async function signupMailProve(ctx) {
  const { env, deps, body, secret } = ctx;
  const addr = cleanAddr(body.addr ?? body.email);
  if (!addr) return { refused: bad(ctx, 'ECO_MAIL_CODE_WRONG', 401) };
  const at = await addrKey(secret, addr);
  const row = await useCode(ctx, `c-${at}`, cleanCodeIn(body.code));
  if (!row || row.a !== addr) return { refused: bad(ctx, 'ECO_MAIL_CODE_WRONG', 401) };
  if (await accountOfMail(env, deps, addr)) return { refused: bad(ctx, 'ECO_MAIL_TAKEN', 409) };
  return { addr, mail: { addr, t: deps.now() } };
}

// The account whose verified recovery email `addr` is ('' for none): any
// spelling of it (cleanAddr), the wallet still holding it. Never enough
// to act on by itself for a mail's From (easily faked): a request by mail
// is answered with a code or link to that address first.
export async function accountOfMail(env, deps, addr) {
  const a = cleanAddr(addr);
  const secret = await tokenSecret(env);
  if (!a || !secret) return '';
  const index = parse(await deps.fsGet(env, MAIL_COLLECTION, await addrKey(secret, a)));
  if (!index?.d) return '';
  const doc = await deps.fsGet(env, WALLET_COLLECTION, index.d);
  return doc.exists && mailOf(parseWallet(doc.payload)) === a ? index.d : '';
}

// ---- Kept pointing at the account (a new pass, a merge, a delete) ----------------------

// The address's finder made to lead to `docId`, unless it leads to another
// account still holding the address: written only if unchanged since read
// (two at once: one wins). → 'new', 'had' (already this account's) or ''
// (taken). A new pass's address (eco.js create): this, then the wallet
// written with it (and if that fails, dropMailIndex).
const CLAIM_MS = 60_000;
export async function claimMail(env, deps, secret, addr, docId) {
  const at = await addrKey(secret, addr);
  const doc = await deps.fsGet(env, MAIL_COLLECTION, at);
  const index = parse(doc);
  if (index?.d === docId) return 'had';
  if (index?.d) {
    // (Another's claim still being written, its wallet not yet saved: theirs.)
    if (index.c > deps.now() - CLAIM_MS) return '';
    const other = await deps.fsGet(env, WALLET_COLLECTION, index.d);
    if (other.exists && mailOf(parseWallet(other.payload)) === addr) return '';
  }
  try {
    await deps.fsWrite(env, MAIL_COLLECTION, at, JSON.stringify({ d: docId, c: deps.now() }), doc.exists ? { updateTime: doc.updateTime } : { exists: false });
    return 'new';
  } catch (e) {
    if (e?.precondition) return '';
    throw e;
  }
}

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
