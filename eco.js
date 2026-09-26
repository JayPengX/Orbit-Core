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

export const ECO_PASSCODE_LENGTH = 10;
export const ECO_PASSCODE_PATTERN = /^[2-9A-HJ-NP-Z]{10}$/;
export const WALLET_COLLECTION = 'eco-wallets';
export const INBOX_COLLECTION = 'eco-inbox';

// Each app's data collection, and the passcode shape its old, app-only sync
// used (a merge reads and then deletes those).
export const ECO_APPS = {
  stock: { collection: 'stock-study-accounts', legacy: /^[2-9A-HJ-NP-Z]{8}$/, maxPayload: 1_000_000 },
  odds: { collection: 'odds-study-accounts', legacy: /^[2-9A-HJ-NP-Z]{8}$/, maxPayload: 1_000_000 },
  vocab: { collection: 'vocab-progress-sync', legacy: /^[2-9A-HJ-NP-Z]{16}$/, maxPayload: 262_144 },
  match: { collection: 'match-find-settings', legacy: null, maxPayload: 100_000 }
};
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

export const ECO_LIMITS = { read: 6000, write: 600, create: 20, delete: 20, transfer: 60, merge: 20 };

export function emptyWallet(now = Date.now()) {
  return { v: 1, created: now, entries: [], snap: {}, settings: {}, pins: {}, apps: {}, inbox: {} };
}

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
    inbox
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
//   generateCode(length), now() }. fsWrite's precondition is
//   { updateTime } or { exists: false }, and a failed one throws an error
//   with `precondition: true`.
//
//   GET    /eco?passcode=P[&app=A][&inbox=1]
//            the wallet, and app A's data (`payload`, '' if none yet) and,
//            with inbox=1, its waiting inbox payloads
//   PATCH  /eco?passcode=P[&app=A]   { payload?, wallet? }
//            app A's data, and/or a wallet patch merged in
//   DELETE /eco?passcode=P[&app=A][&inbox=ID]
//            app A's data, one inbox item, or (no app) the whole account
//   POST   /eco { op: 'create', app?, payload? }        a new account
//   POST   /eco { op: 'transfer', passcode, to, amount, id, note? }
//   POST   /eco { op: 'merge', passcode?, sources: [{ app, passcode }] }

export async function handleEcoRequest(request, env, headers, ip, deps) {
  const { json, errorJson, upstreamFailed } = deps;
  if (!['GET', 'POST', 'PATCH', 'DELETE'].includes(request.method)) return errorJson('SYNC_METHOD_NOT_ALLOWED', 405, headers, request);
  if (!env.FIREBASE_PROJECT_ID || !env.FIREBASE_CLIENT_EMAIL || !env.FIREBASE_PRIVATE_KEY) return errorJson('MISSING_FIREBASE_CONFIG', 500, headers, request);

  const url = new URL(request.url);
  const app = url.searchParams.get('app') || '';
  if (app && !ECO_APPS[app]) return errorJson('ECO_UNKNOWN_APP', 400, headers, request);

  try {
    if (request.method === 'POST') {
      const body = await deps.readJsonBody(request);
      if (body === deps.INVALID_BODY || !isObj(body)) return errorJson('INVALID_JSON', 400, headers, request);
      const op = body.op || 'create';
      if (op === 'create') return await ecoCreate(request, env, headers, ip, deps, body, app);
      if (op === 'transfer') return await ecoTransfer(request, env, headers, ip, deps, body);
      if (op === 'merge') return await ecoMerge(request, env, headers, ip, deps, body);
      return errorJson('ECO_UNKNOWN_OP', 400, headers, request);
    }

    const passcode = (url.searchParams.get('passcode') || '').trim().toUpperCase();
    if (!ECO_PASSCODE_PATTERN.test(passcode)) return errorJson('INVALID_PASSCODE', 400, headers, request);
    const docId = await deps.sha256Hex(passcode);

    if (request.method === 'GET') {
      const limited = await deps.rateLimitResponse(env, ip, 'eco:read', ECO_LIMITS.read, headers, request);
      if (limited) return limited;
      const walletDoc = await deps.fsGet(env, WALLET_COLLECTION, docId);
      const wallet = walletDoc.exists ? parseWallet(walletDoc.payload) : null;
      if (!wallet) return json({ exists: false, updateTime: '', payload: '' }, 200, headers);
      const out = { exists: true, wallet, walletTime: walletDoc.updateTime, pool: poolBalance(wallet), updateTime: '', payload: '' };
      if (app) {
        const doc = await deps.fsGet(env, ECO_APPS[app].collection, docId);
        if (doc.exists) Object.assign(out, { updateTime: doc.updateTime, payload: doc.payload });
        if (url.searchParams.get('inbox') === '1') {
          out.inbox = [];
          for (const id of (wallet.inbox?.[app] || []).slice(0, 12)) {
            const item = await deps.fsGet(env, INBOX_COLLECTION, id);
            if (item.exists) out.inbox.push({ id, payload: item.payload });
          }
        }
      }
      return json(out, 200, headers);
    }

    if (request.method === 'PATCH') {
      const limited = await deps.rateLimitResponse(env, ip, 'eco:write', ECO_LIMITS.write, headers, request);
      if (limited) return limited;
      const body = await deps.readJsonBody(request);
      if (body === deps.INVALID_BODY || !isObj(body)) return errorJson('INVALID_JSON', 400, headers, request);
      const hasPayload = body.payload !== undefined;
      if (hasPayload && !(app && typeof body.payload === 'string' && body.payload && body.payload.length <= ECO_APPS[app].maxPayload)) {
        return errorJson('MISSING_PAYLOAD', 400, headers, request);
      }
      const now = deps.now();
      const result = await updateWallet(env, deps, docId, w => touchApp(mergeWallet(w, cleanPatch(body.wallet)), app, now));
      if (!result) return errorJson('SYNC_PASSCODE_NOT_FOUND', 404, headers, request);
      const out = { wallet: result.wallet, walletTime: result.updateTime, pool: poolBalance(result.wallet) };
      if (hasPayload) out.updateTime = (await deps.fsWrite(env, ECO_APPS[app].collection, docId, body.payload)).updateTime;
      return json(out, 200, headers);
    }

    // DELETE
    const limited = await deps.rateLimitResponse(env, ip, 'eco:delete', ECO_LIMITS.delete, headers, request);
    if (limited) return limited;
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

// Read, change and write the wallet, again if another write got in between
// (Firestore's updateTime precondition). null if there's no such account.
export async function updateWallet(env, deps, docId, change, { create = false } = {}) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const doc = await deps.fsGet(env, WALLET_COLLECTION, docId);
    const current = doc.exists ? parseWallet(doc.payload) : null;
    if (!current && !create) return null;
    const next = change(current || emptyWallet(deps.now()));
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
  const result = await updateWallet(env, deps, docId, w => touchApp(mergeWallet(w, cleanPatch(body.wallet)), app, now), { create: true });
  let updateTime = result.updateTime;
  if (payload) updateTime = (await deps.fsWrite(env, ECO_APPS[app].collection, docId, payload)).updateTime;
  return deps.json({ passcode, updateTime, wallet: result.wallet, walletTime: result.updateTime, pool: poolBalance(result.wallet) }, 200, headers);
}

// Money from this account's pool to another account's: a record on both
// sides with the same transfer id, so a retry never moves it twice.
async function ecoTransfer(request, env, headers, ip, deps, body) {
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
async function ecoMerge(request, env, headers, ip, deps, body) {
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
  if (passcode) {
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
    for (const e of src.wallet.entries) if (!LEDGER_APPS.has(e.app)) carried.push({ ...e, id: `${tag}:${e.id}`.slice(0, 96) });
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
    if (src.app === 'eco') await deleteAccount(env, deps, src.docId);
    else await deps.fsDelete(env, ECO_APPS[src.app].collection, src.docId);
  }
  return json({ passcode, moved, wallet: result.wallet, walletTime: result.updateTime, pool: poolBalance(result.wallet) }, 200, headers);
}
