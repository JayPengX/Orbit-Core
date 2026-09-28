// ---- eco.js ----
// /eco: the Quadra Pass (四方通行碼), one account shared by the Quadra apps
// (Quadra Securities = Stock Study, Quadra Sportsbook = Odds Study, Quadra
// Fixtures = Match Find, Quadra Words = Orbit Vocab). Play money only.
//
// One 10-character passcode is the account's address and its only key, like
// /odds-sync's, and is only ever stored as its SHA-256. Behind it:
//
//   - the wallet (collection `eco-wallets`): the shared NT$ money pool and
//     what the apps share with each other, kept as plain JSON so this Worker
//     can merge concurrent writes itself (see mergeWallet):
//       entries   money in or out of the pool, each with a fixed id, so the
//                 same entry sent twice (two devices, a retry) counts once;
//                 Quadra Sportsbook's ledger, Quadra Words' rewards, transfers
//                 between accounts and anything carried over by a merge
//       snap      each app's latest figures, newest wins per app: Quadra
//                 Securities' own NT$ cash (its cash is worked out from its
//                 own log, so it's shared as a figure, not entries) and
//                 Quadra Sportsbook's money in open bets
//       settings  newest wins per key (the betting limit, followed sports)
//       pins      matches pinned from Quadra Sportsbook for Quadra Fixtures,
//                 newest wins per match
//       apps      when each app was first and last opened with this account
//       inbox     other accounts' app data a merge brought in, per app,
//                 waiting for that app to fold into its own copy
//   - each app's own data (its existing collection, the same gzip payload it
//     always synced), under the same passcode hash;
//   - inbox documents (`eco-inbox`).
//
// The pool's balance is every entry plus every app's shared cash figure
// (poolBalance). An app shows the pool as its NT$ cash: its own part from
// its own data, the rest from the wallet.

import { tokenSecret, signToken, readToken, seal, unseal, sessionLimited, SESSION_MS, REFRESH_MS, HANDOFF_MS } from './quadra-token.js';

export const ECO_PASSCODE_LENGTH = 10;
export const ECO_PASSCODE_PATTERN = /^[2-9A-HJ-NP-Z]{10}$/;
export const WALLET_COLLECTION = 'eco-wallets';
export const INBOX_COLLECTION = 'eco-inbox';

// Each app's data collection, and the passcode shape its old, app-only sync
// used (a merge reads and then deletes those).
//   stock  Quadra Securities
//   odds   Quadra Play (was Quadra Sportsbook)
//   match  Quadra Fixtures
//   vocab  Quadra Rewards (was Quadra Words; its word progress and games)
//   orbit  Orbit Class, the related add-on: its class schedule
export const ECO_APPS = {
  stock: { collection: 'stock-study-accounts', legacy: /^[2-9A-HJ-NP-Z]{8}$/, maxPayload: 1_000_000 },
  odds: { collection: 'odds-study-accounts', legacy: /^[2-9A-HJ-NP-Z]{8}$/, maxPayload: 1_000_000 },
  vocab: { collection: 'vocab-progress-sync', legacy: /^[2-9A-HJ-NP-Z]{16}$/, maxPayload: 600_000 },
  match: { collection: 'match-find-settings', legacy: null, maxPayload: 100_000 },
  orbit: { collection: 'orbit-quadra', legacy: null, maxPayload: 200_000 }
};
// Orbit Class's old /sync (a code plus a manager passcode), which a merge
// can bring into a pass: { app: 'orbit', passcode: code, manager }.
export const ORBIT_LEGACY = { collection: 'orbit-schedules', code: /^[2-9A-HJ-NP-Z]{8}$/ };
// Who can write entries: the apps, and this Worker itself ('eco': transfers,
// merges). An app can't write 'eco' entries.
const ENTRY_APPS = new Set(['stock', 'odds', 'vocab', 'match']);
// Whose entries are rebuilt by the app from its own data: a merge doesn't
// copy them (the app republishes its merged ledger), everything else it
// carries over under a new id.
const LEDGER_APPS = new Set(['odds']);

export const WALLET_MAX_LENGTH = 900_000;
const MAX_ENTRIES_PER_WRITE = 1000;
const MAX_AMOUNT = 1_000_000_000;
const MAX_MERGE_SOURCES = 12;

// Per IP an hour, for calls that carry the pass itself. Calls with a session
// token are counted per session in memory instead (TOKEN_LIMIT a minute).
export const ECO_LIMITS = { read: 600, write: 600, create: 20, delete: 20, transfer: 60, merge: 20, login: 30, share: 30 };
export const TOKEN_LIMIT = 90;

export function emptyWallet(now = Date.now()) {
  return { v: 1, created: now, entries: [], snap: {}, settings: {}, pins: {}, apps: {}, inbox: {} };
}

// ---- One pool, one payday ------------------------------------------------------
//
// From ECO_V2 on the Worker pays everyone's income into the pool itself, so
// there is one money pool with one source of pay, whichever app is opened:
// NT$5,000 each Taiwan month and NT$500 each Taiwan week (from Monday),
// paid on the first sign-in or refresh in that period (never back pay). An
// account created from then on also gets its opening NT$110,000 here (the
// apps no longer give their own). Before this the apps paid these
// themselves (Securities the month, Sportsbook the week); they stop at the
// same boundaries, so nothing is paid twice.
export const PAY = { start: 110_000, month: 5_000, week: 500 };
export const PAY_FROM_MONTH = '2026-10';
export const PAY_FROM_WEEK = Date.UTC(2026, 9, 4, 16); // Monday 2026-10-05 00:00 Taipei
const TPE = 8 * 3_600_000;
const WEEK = 7 * 86_400_000;
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
  const month = taipeiMonth(now);
  if (month >= PAY_FROM_MONTH && !have.has(`eco:pay:${month}`)) out.push({ id: `eco:pay:${month}`, t: now, app: 'eco', kind: 'pay', amount: PAY.month });
  const week = weekStart(now);
  const wid = `eco:week:${new Date(week + TPE).toISOString().slice(0, 10)}`;
  if (week >= PAY_FROM_WEEK && !have.has(wid)) out.push({ id: wid, t: now, app: 'eco', kind: 'grant', amount: PAY.week });
  return out;
}
export { WEEK };

const isObj = v => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : undefined);
const finite = v => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

// One entry as stored: anything malformed is dropped, not stored.
export function cleanEntry(e, { allowEco = false } = {}) {
  if (!isObj(e)) return null;
  const id = str(e.id, 96);
  const t = finite(e.t);
  const amount = finite(e.amount);
  const app = str(e.app, 12);
  if (!id || t == null || amount == null || Math.abs(amount) > MAX_AMOUNT) return null;
  if (!(ENTRY_APPS.has(app) || (allowEco && app === 'eco'))) return null;
  const out = { id, t: Math.round(t), app, kind: str(e.kind, 24) || 'other', amount: Math.round(amount * 100) / 100 };
  const note = str(e.note, 80);
  if (note) out.note = note;
  const peer = str(e.peer, 12);
  if (peer) out.peer = peer;
  return out;
}

// A newest-wins map (snap, settings, pins): every value an object with `t`.
function cleanStamped(map, maxKeys, maxValue) {
  const out = {};
  if (!isObj(map)) return out;
  for (const [k, v] of Object.entries(map).slice(0, maxKeys)) {
    if (k.length > 96 || !isObj(v) || finite(v.t) == null) continue;
    const text = JSON.stringify(v);
    if (text.length > maxValue) continue;
    out[k] = v;
  }
  return out;
}

// What a client may send to change the wallet.
export function cleanPatch(patch) {
  if (!isObj(patch)) return emptyPatch();
  return {
    entries: (Array.isArray(patch.entries) ? patch.entries.slice(0, MAX_ENTRIES_PER_WRITE) : []).map(e => cleanEntry(e)).filter(Boolean),
    snap: cleanStamped(patch.snap, 8, 4000),
    settings: cleanStamped(patch.settings, 32, 4000),
    pins: cleanStamped(patch.pins, 200, 2000)
  };
}
const emptyPatch = () => ({ entries: [], snap: {}, settings: {}, pins: {} });

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
  return {
    v: 1,
    created: Math.min(base.created ?? Infinity, b.created ?? Infinity) === Infinity ? Date.now() : Math.min(base.created ?? Infinity, b.created ?? Infinity),
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
    ...(base.links ? { links: base.links } : {}),
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

// The last 4 characters: enough for someone to recognise their own other
// account in a record, not enough to use it.
export const maskCode = code => `…${String(code).slice(-4)}`;

function touchApp(wallet, app, now) {
  if (!ECO_APPS[app]) return wallet;
  const had = wallet.apps?.[app];
  return { ...wallet, apps: { ...(wallet.apps || {}), [app]: { first: had?.first ?? now, last: now } } };
}

// ---- Handler ---------------------------------------------------------------
//
// deps: the Worker's own plumbing, passed in so this file stays testable:
// { json, errorJson, upstreamFailed, readJsonBody, INVALID_BODY,
//   rateLimitResponse, fsGet(env, collection, id), fsWrite(env, collection,
//   id, payload, precondition), fsDelete(env, collection, id), sha256Hex,
//   generateCode(length), now(), isManagerPasscode?(passcode, doc) }.
//   fsWrite's precondition is { updateTime } or { exists: false }, and a
//   failed one throws an error with `precondition: true`.
//
// With a session token (the apps since v2), `qt=` instead of the pass:
//   GET    /eco?qt=T[&app=A][&inbox=1]    the wallet, app A's data; `active`
//            says whether this session is the account's live one, and while
//            it is a fresh `token` comes back
//   PATCH  /eco?qt=T[&app=A]   { payload?, wallet? }   only while active
//   DELETE /eco?qt=T[&app=A][&inbox=ID]
//   POST   /eco { op: 'login', passcode, app }       a session and a refresh
//            token; this session becomes the live one
//   POST   /eco { op: 'refresh', refresh, app, claim? }
//   POST   /eco { op: 'handoff', qt, passcode }      the pass, sealed, for a link
//   POST   /eco { op: 'redeem', handoff }            the pass back
//   POST   /eco { op: 'signout-all', qt }            every device signed out
//   POST   /eco { op: 'rotate', passcode }           a new pass for the same account
//   POST   /eco { op: 'share-create', qt }           a key to copy this Orbit schedule
//   POST   /eco { op: 'share-redeem', qt, key }      follow someone's schedule
//   POST   /eco { op: 'follow', qt, link }           the followed schedule, now
//   POST   /eco { op: 'share-revoke', qt }           stop every follower
// And, as before, with the pass itself (older app versions):
//   GET    /eco?passcode=P[&app=A][&inbox=1]
//   PATCH  /eco?passcode=P[&app=A]   { payload?, wallet? }
//   DELETE /eco?passcode=P[&app=A][&inbox=ID]
//   POST   /eco { op: 'create', app?, payload? }        a new account
//   POST   /eco { op: 'transfer', passcode | qt, to, amount, id, note? }
//   POST   /eco { op: 'merge', passcode? | qt?, sources: [{ app, passcode, manager? }] }

export const SHARE_COLLECTION = 'eco-shares';
export const LINK_COLLECTION = 'eco-links';
export const SHARE_MS = 24 * 3_600_000;

const isActive = (wallet, claims) => wallet?.live?.sid === claims.s && wallet?.live?.app === claims.a;
const gen = wallet => wallet?.sec?.gen || 0;

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
      const op = body.op || 'create';
      const ctx = { request, env, headers, ip, deps, body, app, secret };
      if (op === 'create') return await ecoCreate(request, env, headers, ip, deps, body, app);
      if (op === 'transfer') return await ecoTransfer(ctx);
      if (op === 'merge') return await ecoMerge(ctx);
      if (op === 'login') return await ecoLogin(ctx);
      if (op === 'refresh') return await ecoRefresh(ctx);
      if (op === 'handoff') return await ecoHandoff(ctx);
      if (op === 'redeem') return await ecoRedeem(ctx);
      if (op === 'signout-all') return await ecoSignOutAll(ctx);
      if (op === 'rotate') return await ecoRotate(ctx);
      if (op === 'share-create') return await shareCreate(ctx);
      if (op === 'share-redeem') return await shareRedeem(ctx);
      if (op === 'follow') return await shareFollow(ctx);
      if (op === 'share-revoke') return await shareRevoke(ctx);
      return errorJson('ECO_UNKNOWN_OP', 400, headers, request);
    }

    // Who's asking: a session token, or the pass itself.
    let docId;
    let claims = null;
    const qt = url.searchParams.get('qt');
    if (qt) {
      claims = await readToken(secret, qt, 'ses', deps.now());
      if (!claims) return errorJson('ECO_TOKEN_INVALID', 401, headers, request);
      if (sessionLimited(claims.s, TOKEN_LIMIT, 60_000, deps.now())) return errorJson('RATE_LIMITED', 429, headers, request);
      docId = claims.d;
    } else {
      const passcode = (url.searchParams.get('passcode') || '').trim().toUpperCase();
      if (!ECO_PASSCODE_PATTERN.test(passcode)) return errorJson('INVALID_PASSCODE', 400, headers, request);
      docId = await deps.sha256Hex(passcode);
    }
    const kv = feature => (claims ? null : deps.rateLimitResponse(env, ip, feature, ECO_LIMITS[feature.split(':')[1]], headers, request));

    if (request.method === 'GET') {
      const limited = await kv('eco:read');
      if (limited) return limited;
      const walletDoc = await deps.fsGet(env, WALLET_COLLECTION, docId);
      let wallet = walletDoc.exists ? parseWallet(walletDoc.payload) : null;
      if (!wallet) return claims ? errorJson('ECO_SIGNED_OUT', 401, headers, request) : json({ exists: false, updateTime: '', payload: '' }, 200, headers);
      if (claims && claims.g !== gen(wallet)) return errorJson('ECO_SIGNED_OUT', 401, headers, request);
      let walletTime = walletDoc.updateTime;
      const out = { exists: true };
      if (claims) {
        out.active = isActive(wallet, claims);
        out.live = wallet.live ? { app: wallet.live.app, t: wallet.live.t } : null;
        if (out.active) {
          // Payday, when one is due (a write only then).
          if (paydayEntries(wallet, deps.now()).length) {
            const paid = await updateWallet(env, deps, docId, w => mergeWallet(w, { entries: paydayEntries(w, deps.now()) }));
            if (paid) ({ wallet, updateTime: walletTime } = paid);
          }
          out.token = await sessionToken(secret, claims, deps.now());
        }
      }
      Object.assign(out, { wallet: publicWallet(wallet), walletTime, pool: poolBalance(wallet), updateTime: '', payload: '' });
      const want = app || '';
      if (want) {
        const doc = await deps.fsGet(env, ECO_APPS[want].collection, docId);
        if (doc.exists) Object.assign(out, { updateTime: doc.updateTime, payload: doc.payload });
        if (url.searchParams.get('inbox') === '1') out.inbox = await readInbox(env, deps, wallet, want);
      }
      return json(out, 200, headers);
    }

    if (request.method === 'PATCH') {
      const limited = await kv('eco:write');
      if (limited) return limited;
      const body = await deps.readJsonBody(request);
      if (body === deps.INVALID_BODY || !isObj(body)) return errorJson('INVALID_JSON', 400, headers, request);
      const hasPayload = body.payload !== undefined;
      if (hasPayload && !(app && typeof body.payload === 'string' && body.payload && body.payload.length <= ECO_APPS[app].maxPayload)) {
        return errorJson('MISSING_PAYLOAD', 400, headers, request);
      }
      const now = deps.now();
      let refused = null;
      const result = await updateWallet(env, deps, docId, w => {
        refused = null;
        if (claims && claims.g !== gen(w)) return (refused = 'ECO_SIGNED_OUT'), w;
        // Only the live app writes: an app the person has moved away from
        // must not overwrite what the live one did since.
        if (claims && !isActive(w, claims)) return (refused = 'ECO_SESSION_MOVED'), w;
        return touchApp(mergeWallet(w, cleanPatch(body.wallet)), app, now);
      }, { skipIf: () => refused });
      if (!result) return errorJson(claims ? 'ECO_SIGNED_OUT' : 'SYNC_PASSCODE_NOT_FOUND', claims ? 401 : 404, headers, request);
      if (refused) return json({ error: { code: refused, message: refused }, live: result.wallet.live ? { app: result.wallet.live.app, t: result.wallet.live.t } : null }, refused === 'ECO_SIGNED_OUT' ? 401 : 409, headers);
      const out = { wallet: publicWallet(result.wallet), walletTime: result.updateTime, pool: poolBalance(result.wallet) };
      if (claims) out.token = await sessionToken(secret, claims, now);
      if (hasPayload) out.updateTime = (await deps.fsWrite(env, ECO_APPS[app].collection, docId, body.payload)).updateTime;
      return json(out, 200, headers);
    }

    // DELETE
    const limited = await kv('eco:delete');
    if (limited) return limited;
    if (claims) {
      const w = await deps.fsGet(env, WALLET_COLLECTION, docId);
      const wallet = w.exists ? parseWallet(w.payload) : null;
      if (!wallet || claims.g !== gen(wallet)) return errorJson('ECO_SIGNED_OUT', 401, headers, request);
    }
    const inboxId = url.searchParams.get('inbox');
    if (inboxId) {
      if (!app) return errorJson('ECO_UNKNOWN_APP', 400, headers, request);
      const result = await updateWallet(env, deps, docId, w => ({ ...w, inbox: { ...w.inbox, [app]: (w.inbox?.[app] || []).filter(id => id !== inboxId) } }));
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

// What clients see of the wallet: not the Worker's own bookkeeping.
export function publicWallet(w) {
  if (!w) return w;
  const { sec, links, ...rest } = w;
  return rest;
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

// ---- Sessions -------------------------------------------------------------------

// Sign in with the pass: a refresh token for this device, a session for
// this app, and this app becomes the account's live one.
async function ecoLogin({ request, env, headers, ip, deps, body, secret }) {
  const { json, errorJson } = deps;
  const limited = await deps.rateLimitResponse(env, ip, 'eco:login', ECO_LIMITS.login, headers, request);
  if (limited) return limited;
  const passcode = String(body.passcode || '').trim().toUpperCase().replace(/[\s-]/g, '');
  const app = String(body.app || '');
  if (!ECO_PASSCODE_PATTERN.test(passcode)) return errorJson('INVALID_PASSCODE', 400, headers, request);
  if (!ECO_APPS[app]) return errorJson('ECO_UNKNOWN_APP', 400, headers, request);
  const docId = await deps.sha256Hex(passcode);
  const now = deps.now();
  const sid = deps.generateCode(12);
  const result = await updateWallet(env, deps, docId, w => {
    const next = touchApp(mergeWallet(w, { entries: paydayEntries(w, now) }), app, now);
    return { ...next, live: { sid, app, t: now } };
  });
  if (!result) return errorJson('SYNC_PASSCODE_NOT_FOUND', 404, headers, request);
  return json(await sessionReply(env, deps, secret, docId, result, { s: sid, a: app, g: gen(result.wallet) }, now, { refresh: true, app, inbox: body.inbox }), 200, headers);
}

async function sessionReply(env, deps, secret, docId, result, c, now, { refresh = false, app, inbox = false } = {}) {
  const out = {
    token: await sessionToken(secret, { d: docId, ...c }, now),
    active: true,
    wallet: publicWallet(result.wallet),
    walletTime: result.updateTime,
    pool: poolBalance(result.wallet),
    payload: '',
    updateTime: ''
  };
  if (refresh) out.refresh = await signToken(secret, { k: 'ref', d: docId, s: c.s, g: c.g, e: now + REFRESH_MS });
  if (app) {
    const doc = await deps.fsGet(env, ECO_APPS[app].collection, docId);
    if (doc.exists) Object.assign(out, { payload: doc.payload, updateTime: doc.updateTime });
    if (inbox) out.inbox = await readInbox(env, deps, result.wallet, app);
  }
  return out;
}

// A device's refresh token for a new session in `app`. With `claim` this
// app becomes the live one; without, a session comes back only if it
// already is (else { active: false, live }).
async function ecoRefresh({ request, env, headers, deps, body, secret }) {
  const { json, errorJson } = deps;
  const now = deps.now();
  const c = await readToken(secret, body.refresh, 'ref', now);
  const app = String(body.app || '');
  if (!c) return errorJson('ECO_TOKEN_INVALID', 401, headers, request);
  if (!ECO_APPS[app]) return errorJson('ECO_UNKNOWN_APP', 400, headers, request);
  if (sessionLimited(`r:${c.s}`, 30, 60_000, now)) return errorJson('RATE_LIMITED', 429, headers, request);
  const doc = await deps.fsGet(env, WALLET_COLLECTION, c.d);
  const wallet = doc.exists ? parseWallet(doc.payload) : null;
  if (!wallet || gen(wallet) !== c.g) return errorJson('ECO_SIGNED_OUT', 401, headers, request);
  const claims = { s: c.s, a: app, g: c.g };
  const live = isActive(wallet, claims);
  if (!live && !body.claim) return json({ active: false, live: wallet.live ? { app: wallet.live.app, t: wallet.live.t } : null, wallet: publicWallet(wallet), pool: poolBalance(wallet) }, 200, headers);
  let result = { wallet, updateTime: doc.updateTime };
  if (!live || paydayEntries(wallet, now).length) {
    result = await updateWallet(env, deps, c.d, w => {
      const next = touchApp(mergeWallet(w, { entries: paydayEntries(w, now) }), app, now);
      return { ...next, live: { sid: c.s, app, t: now } };
    });
  }
  return json(await sessionReply(env, deps, secret, c.d, result, claims, now, { app: body.data ? app : '', inbox: body.inbox }), 200, headers);
}

// The pass, sealed for a link to another app (HANDOFF_MS).
async function ecoHandoff({ request, headers, deps, body, secret }) {
  const { json, errorJson } = deps;
  const now = deps.now();
  const c = await readToken(secret, body.qt, 'ses', now);
  const passcode = String(body.passcode || '').trim().toUpperCase().replace(/[\s-]/g, '');
  if (!c) return errorJson('ECO_TOKEN_INVALID', 401, headers, request);
  if (!ECO_PASSCODE_PATTERN.test(passcode) || (await deps.sha256Hex(passcode)) !== c.d) return errorJson('INVALID_PASSCODE', 400, headers, request);
  return json({ handoff: await seal(secret, { p: passcode, e: now + HANDOFF_MS }) }, 200, headers);
}

async function ecoRedeem({ request, headers, deps, body, secret }) {
  const { json, errorJson } = deps;
  const data = await unseal(secret, body.handoff);
  if (!data || !(data.e > deps.now()) || !ECO_PASSCODE_PATTERN.test(data.p || '')) return errorJson('ECO_HANDOFF_EXPIRED', 410, headers, request);
  return json({ passcode: data.p }, 200, headers);
}

// Every device signed out: every token issued so far stops working.
async function ecoSignOutAll({ request, env, headers, deps, body, secret }) {
  const { json, errorJson } = deps;
  const c = await readToken(secret, body.qt, 'ses', deps.now());
  if (!c) return errorJson('ECO_TOKEN_INVALID', 401, headers, request);
  const result = await updateWallet(env, deps, c.d, w => (gen(w) !== c.g ? w : { ...w, sec: { ...(w.sec || {}), gen: gen(w) + 1 }, live: null }));
  if (!result) return errorJson('ECO_SIGNED_OUT', 401, headers, request);
  return json({ ok: true }, 200, headers);
}

// A new pass for the same account (the old one leaked, say): everything is
// merged into a new pass and the old one deleted, and schedules others
// follow keep working.
async function ecoRotate(ctx) {
  const { request, headers, deps, body, env } = ctx;
  const passcode = String(body.passcode || '').trim().toUpperCase().replace(/[\s-]/g, '');
  if (!ECO_PASSCODE_PATTERN.test(passcode)) return deps.errorJson('INVALID_PASSCODE', 400, headers, request);
  const oldId = await deps.sha256Hex(passcode);
  const old = await deps.fsGet(env, WALLET_COLLECTION, oldId);
  const links = old.exists ? parseWallet(old.payload)?.links || {} : {};
  const res = await ecoMerge({ ...ctx, body: { sources: [{ app: 'eco', passcode }] } });
  if (res.status !== 200) return res;
  const newId = await deps.sha256Hex(res.data?.passcode ?? '');
  for (const link of Object.values(links)) {
    const doc = await deps.fsGet(env, LINK_COLLECTION, link);
    if (doc.exists) await deps.fsWrite(env, LINK_COLLECTION, link, JSON.stringify({ ...JSON.parse(doc.payload), owner: newId }));
  }
  if (Object.keys(links).length) await updateWallet(env, deps, newId, w => ({ ...w, links }));
  return res;
}

// ---- Orbit Class: a schedule others can copy --------------------------------------
//
// The schedule belongs to the pass that made it: only that pass edits it.
// Its owner makes a key (8 characters, a day), another pass enters it and
// from then on follows the schedule (a copy that stays up to date, and can't
// be edited there). Behind a key is the owner's link (LINK_COLLECTION, one
// per owner); revoking it stops every follower at once.

async function sessionFor(ctx, { app } = {}) {
  const c = await readToken(ctx.secret, ctx.body.qt, 'ses', ctx.deps.now());
  if (!c || (app && c.a !== app)) return null;
  return c;
}

async function shareCreate(ctx) {
  const { request, env, headers, deps } = ctx;
  const c = await sessionFor(ctx);
  if (!c) return deps.errorJson('ECO_TOKEN_INVALID', 401, headers, request);
  const doc = await deps.fsGet(env, ECO_APPS.orbit.collection, c.d);
  if (!doc.exists) return deps.errorJson('ECO_NOTHING_TO_SHARE', 404, headers, request);
  let link = null;
  const result = await updateWallet(env, deps, c.d, w => {
    link = w.links?.orbit || deps.generateCode(16);
    return w.links?.orbit ? w : { ...w, links: { ...(w.links || {}), orbit: link } };
  });
  if (!result) return deps.errorJson('ECO_SIGNED_OUT', 401, headers, request);
  const had = await deps.fsGet(env, LINK_COLLECTION, link);
  if (!had.exists) await deps.fsWrite(env, LINK_COLLECTION, link, JSON.stringify({ owner: c.d, app: 'orbit', t: deps.now() }));
  const key = deps.generateCode(8);
  const exp = deps.now() + SHARE_MS;
  await deps.fsWrite(env, SHARE_COLLECTION, key, JSON.stringify({ link, exp }));
  return deps.json({ key, exp }, 200, headers);
}

async function readLink(env, deps, link) {
  if (!/^[2-9A-HJ-NP-Z]{16}$/.test(String(link || ''))) return null;
  const doc = await deps.fsGet(env, LINK_COLLECTION, link);
  try {
    return doc.exists ? JSON.parse(doc.payload) : null;
  } catch {
    return null;
  }
}

async function linkedSchedule(env, deps, link) {
  const l = await readLink(env, deps, link);
  if (!l) return null;
  const doc = await deps.fsGet(env, ECO_APPS[l.app || 'orbit'].collection, l.owner);
  return doc.exists ? { link, payload: doc.payload, updateTime: doc.updateTime } : null;
}

async function shareRedeem(ctx) {
  const { request, env, headers, ip, deps, body } = ctx;
  const limited = await deps.rateLimitResponse(env, ip, 'eco:share', ECO_LIMITS.share, headers, request);
  if (limited) return limited;
  const c = await sessionFor(ctx);
  if (!c) return deps.errorJson('ECO_TOKEN_INVALID', 401, headers, request);
  const key = String(body.key || '').trim().toUpperCase().replace(/[\s-]/g, '');
  if (!/^[2-9A-HJ-NP-Z]{8}$/.test(key)) return deps.errorJson('ECO_SHARE_NOT_FOUND', 404, headers, request);
  const doc = await deps.fsGet(env, SHARE_COLLECTION, key);
  let share = null;
  try {
    share = doc.exists ? JSON.parse(doc.payload) : null;
  } catch {}
  if (!share || !(share.exp > deps.now())) return deps.errorJson('ECO_SHARE_NOT_FOUND', 404, headers, request);
  const out = await linkedSchedule(env, deps, share.link);
  if (!out) return deps.errorJson('ECO_SHARE_NOT_FOUND', 404, headers, request);
  const l = await readLink(env, deps, share.link);
  return deps.json({ ...out, own: l?.owner === c.d }, 200, headers);
}

async function shareFollow(ctx) {
  const { request, env, headers, deps, body } = ctx;
  const c = await sessionFor(ctx);
  if (!c) return deps.errorJson('ECO_TOKEN_INVALID', 401, headers, request);
  if (sessionLimited(`f:${c.s}`, 30, 60_000, deps.now())) return deps.errorJson('RATE_LIMITED', 429, headers, request);
  const out = await linkedSchedule(env, deps, body.link);
  if (!out) return deps.errorJson('ECO_LINK_GONE', 404, headers, request);
  return deps.json(out, 200, headers);
}

async function shareRevoke(ctx) {
  const { request, env, headers, deps } = ctx;
  const c = await sessionFor(ctx);
  if (!c) return deps.errorJson('ECO_TOKEN_INVALID', 401, headers, request);
  let link = null;
  await updateWallet(env, deps, c.d, w => {
    link = w.links?.orbit || null;
    if (!link) return w;
    const { orbit, ...rest } = w.links;
    return { ...w, links: rest };
  });
  if (link) await deps.fsDelete(env, LINK_COLLECTION, link);
  return deps.json({ revoked: Boolean(link) }, 200, headers);
}

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

async function deleteAccount(env, deps, docId) {
  const doc = await deps.fsGet(env, WALLET_COLLECTION, docId);
  const wallet = doc.exists ? parseWallet(doc.payload) : null;
  for (const ids of Object.values(wallet?.inbox || {})) for (const id of ids) await deps.fsDelete(env, INBOX_COLLECTION, id);
  for (const { collection } of Object.values(ECO_APPS)) await deps.fsDelete(env, collection, docId);
  for (const link of Object.values(wallet?.links || {})) await deps.fsDelete(env, LINK_COLLECTION, link);
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

async function ecoCreate(request, env, headers, ip, deps, body, app) {
  const limited = await deps.rateLimitResponse(env, ip, 'eco:create', ECO_LIMITS.create, headers, request);
  if (limited) return limited;
  app = app || body.app || '';
  if (app && !ECO_APPS[app]) return deps.errorJson('ECO_UNKNOWN_APP', 400, headers, request);
  const payload = body.payload;
  if (payload !== undefined && !(app && typeof payload === 'string' && payload && payload.length <= ECO_APPS[app].maxPayload)) {
    return deps.errorJson('MISSING_PAYLOAD', 400, headers, request);
  }
  const now = deps.now();
  const { passcode, docId } = await newPasscode(env, deps);
  // v2 apps: the Worker gives the opening money and pay, and the new pass
  // comes back signed in.
  const v2 = body.v2 === true && app;
  const sid = v2 ? deps.generateCode(12) : '';
  const result = await updateWallet(
    env,
    deps,
    docId,
    w => {
      let next = touchApp(mergeWallet(w, cleanPatch(body.wallet)), app, now);
      if (!v2) return next;
      next = { ...next, v2: now };
      return { ...mergeWallet(next, { entries: paydayEntries(next, now) }), live: { sid, app, t: now } };
    },
    { create: true }
  );
  let updateTime = result.updateTime;
  if (payload) updateTime = (await deps.fsWrite(env, ECO_APPS[app].collection, docId, payload)).updateTime;
  const out = { passcode, updateTime, wallet: publicWallet(result.wallet), walletTime: result.updateTime, pool: poolBalance(result.wallet) };
  if (v2) {
    const secret = await tokenSecret(env);
    const reply = await sessionReply(env, deps, secret, docId, result, { s: sid, a: app, g: 0 }, now, { refresh: true });
    Object.assign(out, { token: reply.token, refresh: reply.refresh, active: true });
  }
  return deps.json(out, 200, headers);
}

// Money from this account's pool to another account's: a record on both
// sides with the same transfer id, so a retry never moves it twice.
async function ecoTransfer({ request, env, headers, ip, deps, body }) {
  const { json, errorJson } = deps;
  const limited = await deps.rateLimitResponse(env, ip, 'eco:transfer', ECO_LIMITS.transfer, headers, request);
  if (limited) return limited;
  const from = String(body.passcode || '').trim().toUpperCase();
  const to = String(body.to || '').trim().toUpperCase().replace(/[\s-]/g, '');
  const amount = Math.round(Number(body.amount));
  const id = str(body.id, 40);
  if (!ECO_PASSCODE_PATTERN.test(from)) return errorJson('INVALID_PASSCODE', 400, headers, request);
  if (!ECO_PASSCODE_PATTERN.test(to)) return errorJson('ECO_INVALID_RECIPIENT', 400, headers, request);
  if (from === to) return errorJson('ECO_SAME_ACCOUNT', 400, headers, request);
  if (!(amount >= 1 && amount <= MAX_AMOUNT) || !id || !/^[\w-]+$/.test(id)) return errorJson('ECO_INVALID_AMOUNT', 400, headers, request);
  const note = str(body.note, 80);
  const now = deps.now();
  const fromId = await deps.sha256Hex(from);
  const toId = await deps.sha256Hex(to);
  const target = await deps.fsGet(env, WALLET_COLLECTION, toId);
  if (!target.exists) return errorJson('ECO_RECIPIENT_NOT_FOUND', 404, headers, request);

  const outId = `xfer:${id}:out`;
  let short = false;
  const sent = await updateWallet(env, deps, fromId, w => {
    if (w.entries.some(e => e.id === outId)) return w;
    if (poolBalance(w) < amount) {
      short = true;
      return w;
    }
    const entry = { id: outId, t: now, app: 'eco', kind: 'xfer-out', amount: -amount, peer: maskCode(to) };
    if (note) entry.note = note;
    return mergeWallet(w, { entries: [entry] });
  });
  if (!sent) return errorJson('SYNC_PASSCODE_NOT_FOUND', 404, headers, request);
  if (short) return errorJson('ECO_INSUFFICIENT_FUNDS', 409, headers, request);
  const entry = { id: `xfer:${id}:in`, t: now, app: 'eco', kind: 'xfer-in', amount, peer: maskCode(from) };
  if (note) entry.note = note;
  await updateWallet(env, deps, toId, w => mergeWallet(w, { entries: [entry] }));
  return json({ ok: true, wallet: sent.wallet, walletTime: sent.updateTime, pool: poolBalance(sent.wallet) }, 200, headers);
}

// The merge tool: several accounts (old app-only ones and Quadra Passes)
// into one Quadra Pass, a new one unless `passcode` names one to keep. Each
// app's data goes to the target: as its data if it has none yet, otherwise
// to its inbox, for the app to fold in with its own rules next time it
// opens. Then every source is deleted.
async function ecoMerge({ request, env, headers, ip, deps, body, secret }) {
  const { json, errorJson } = deps;
  const limited = await deps.rateLimitResponse(env, ip, 'eco:merge', ECO_LIMITS.merge, headers, request);
  if (limited) return limited;
  const sources = Array.isArray(body.sources) ? body.sources : [];
  if (!sources.length || sources.length > MAX_MERGE_SOURCES) return errorJson('ECO_INVALID_SOURCES', 400, headers, request);
  const now = deps.now();

  // Read every source first: nothing is written until they all check out.
  const seen = new Set();
  const found = [];
  for (const [i, raw] of sources.entries()) {
    const app = String(raw?.app || '');
    const code = String(raw?.passcode || '').trim().toUpperCase().replace(/[\s-]/g, '');
    if (seen.has(`${app}:${code}`)) continue;
    seen.add(`${app}:${code}`);
    if (app === 'eco') {
      if (!ECO_PASSCODE_PATTERN.test(code)) return json({ error: { code: 'ECO_INVALID_SOURCE', index: i, message: 'bad passcode' } }, 400, headers);
      const docId = await deps.sha256Hex(code);
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
      found.push({ app, code, docId, wallet, data });
    } else if (app === 'orbit') {
      // Orbit Class's old /sync: the plain code names the document, and only
      // its manager passcode proves it's the schedule's own. The old code
      // stays readable (devices still following it keep working).
      if (!ORBIT_LEGACY.code.test(code)) return json({ error: { code: 'ECO_INVALID_SOURCE', index: i, message: 'bad code' } }, 400, headers);
      const d = await deps.fsGet(env, ORBIT_LEGACY.collection, code);
      if (!d.exists) return json({ error: { code: 'ECO_SOURCE_NOT_FOUND', index: i, message: 'not found' } }, 404, headers);
      const manager = String(raw?.manager || '').trim();
      if (!manager || (await deps.sha256Hex(manager)) !== d.managerPasscodeHash) return json({ error: { code: 'ECO_SOURCE_LOCKED', index: i, message: 'manager passcode' } }, 403, headers);
      found.push({ app, code, docId: `orbit:${code}`, keep: true, data: { orbit: [d.payload] } });
    } else if (ECO_APPS[app]?.legacy) {
      if (!ECO_APPS[app].legacy.test(code)) return json({ error: { code: 'ECO_INVALID_SOURCE', index: i, message: 'bad passcode' } }, 400, headers);
      const docId = await deps.sha256Hex(code);
      const d = await deps.fsGet(env, ECO_APPS[app].collection, docId);
      if (!d.exists) return json({ error: { code: 'ECO_SOURCE_NOT_FOUND', index: i, message: 'not found' } }, 404, headers);
      found.push({ app, code, docId, data: { [app]: [d.payload] } });
    } else {
      return json({ error: { code: 'ECO_INVALID_SOURCE', index: i, message: 'unknown app' } }, 400, headers);
    }
  }

  let passcode = String(body.passcode || '').trim().toUpperCase().replace(/[\s-]/g, '');
  let targetId;
  const session = body.qt ? await readToken(secret, body.qt, 'ses', deps.now()) : null;
  if (body.qt && !session) return errorJson('ECO_TOKEN_INVALID', 401, headers, request);
  if (session) {
    // Into the signed-in pass (its pass isn't in the request, nor returned).
    targetId = session.d;
    passcode = '';
    if (!(await deps.fsGet(env, WALLET_COLLECTION, targetId)).exists) return errorJson('ECO_SIGNED_OUT', 401, headers, request);
  } else if (passcode) {
    if (!ECO_PASSCODE_PATTERN.test(passcode)) return errorJson('INVALID_PASSCODE', 400, headers, request);
    targetId = await deps.sha256Hex(passcode);
    if (!(await deps.fsGet(env, WALLET_COLLECTION, targetId)).exists) return errorJson('SYNC_PASSCODE_NOT_FOUND', 404, headers, request);
  } else {
    ({ passcode, docId: targetId } = await newPasscode(env, deps));
  }
  const sourcesLeft = found.filter(f => f.docId !== targetId);

  // App data: the first copy becomes the app's data if it has none; the rest
  // wait in the inbox.
  const inboxAdd = {};
  const moved = {};
  for (const src of sourcesLeft) {
    for (const [app, payloads] of Object.entries(src.data)) {
      for (const payload of payloads) {
        moved[app] = (moved[app] || 0) + 1;
        const doc = await deps.fsGet(env, ECO_APPS[app].collection, targetId);
        if (!doc.exists) {
          await deps.fsWrite(env, ECO_APPS[app].collection, targetId, payload);
        } else {
          const id = `${targetId}-${app}-${deps.generateCode(8)}`;
          await deps.fsWrite(env, INBOX_COLLECTION, id, payload);
          (inboxAdd[app] ||= []).push(id);
        }
      }
    }
  }

  // Money carried over from other Quadra Passes: every entry except the ones
  // an app rebuilds from its own data, under a new id so two accounts' ids
  // can't collide; and their shared cash figures, as one entry each (the app
  // behind the figure shares a fresh one, merged, when it next opens).
  const carried = [];
  for (const [k, src] of sourcesLeft.entries()) {
    if (!src.wallet) continue;
    const tag = `m${now.toString(36)}${k}`;
    // The Worker's pay keeps its id (one month's pay is one entry, whichever
    // pass it came through).
    for (const e of src.wallet.entries) if (!LEDGER_APPS.has(e.app)) carried.push(e.id.startsWith('eco:') ? e : { ...e, id: `${tag}:${e.id}`.slice(0, 96) });
    for (const [app, s] of Object.entries(src.wallet.snap || {})) {
      if (!finite(s.cash)) continue;
      // Nothing to carry: that app's data comes along and shares its figure again.
      if (src.data[app]) continue;
      carried.push({ id: `${tag}:snap:${app}`, t: now, app: 'eco', kind: 'merge', amount: s.cash, note: app });
    }
  }
  const settings = {};
  const pins = {};
  for (const src of sourcesLeft) {
    Object.assign(pins, src.wallet?.pins || {});
    for (const [k, v] of Object.entries(src.wallet?.settings || {})) if (!settings[k] || v.t > settings[k].t) settings[k] = v;
  }
  const mergedApps = [...new Set(sourcesLeft.flatMap(s => Object.keys(s.data)))];
  const result = await updateWallet(
    env,
    deps,
    targetId,
    w => {
      let next = mergeWallet(w, { entries: carried, settings, pins, inbox: inboxAdd });
      // Wait for the app to share a fresh figure that includes what was merged in.
      next = { ...next, merged: { t: now, apps: mergedApps } };
      return next;
    },
    { create: true }
  );

  // Only now, with everything safely in the target, are the sources deleted.
  for (const src of sourcesLeft) {
    if (src.keep) continue;
    if (src.app === 'eco') await deleteAccount(env, deps, src.docId);
    else await deps.fsDelete(env, ECO_APPS[src.app].collection, src.docId);
  }
  const out = { moved, wallet: publicWallet(result.wallet), walletTime: result.updateTime, pool: poolBalance(result.wallet) };
  if (passcode) out.passcode = passcode;
  return json(out, 200, headers);
}
