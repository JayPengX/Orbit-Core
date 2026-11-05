// Passes given away in public (Jay 2026-11-05: "a page … that I can switch
// on in admin panel that give key out to whoever go to that page and claim
// one … for a limited amount"): orbit.<domain>/key/ (site/key/), shared as a
// link or a QR code to a room, a class, a whole school.
//
// The owner sets it in the admin panel (eco-admin.js `gift`, `gift-set`,
// `gift-round`): on or off, how many, when it opens and closes, how many
// one network may take a minute, and after how many hours a pass nobody
// signed in with comes back to the pool. Each round counts afresh.
//
//   GET  /gift                 what the page shows: { state, left, total, opens, closes, mine }
//   POST /gift { op: 'claim' } one pass for this device: { code }
//   POST /gift { op: 'go' }    a sign-in for that pass's account, for a link to an app (#qh=)
//
// One a device: the device is a random id in an HttpOnly cookie (made at
// the first GET), and a claim is (round, device), unique in D1. Opening the
// page claims nothing; a device that claimed is shown its own pass again
// (sealed in a second cookie: the store keeps only the account's id, never
// the pass). A pass is minted at the claim (eco.js newPasscode), marked
// fresh, so its first sign-in replaces it (eco.js freshPass): whoever saw it
// on the screen can't keep using it.
//
// Against a crowd of scripts: our pages only (the Origin), a cookie first,
// each network (an IPv4 /24, an IPv6 /64: showcase.js placeOf) at most
// `rate` claims a minute, counted in D1 (a school's Wi-Fi is one network,
// so it's a minute's pace, not a cap), and the owner's total. Cost: the page
// is static; one GET a visit, a claim is one PBKDF2 and a few D1 rows.
//
// Taken back: a claim older than `hold` hours whose pass was never replaced
// (still fresh: never signed in, or signed in and left at 「先換掉這組通行碼」,
// where no app opens, so nothing of theirs is there) is deleted and goes
// back to the pool; swept lazily (at most every 5 minutes, on a visit or
// the panel's read) and each night.
//
// Cleared (Jay 2026-11-05: "Maybe we need a system to clear empty account?
// Cause giveaway is those things that will end in chaos"): an account a
// giveaway made (wallet `gift`, the claim's time, carried through rotate) and
// left empty: not used for `days` days, no passkey, not priority, never
// merged, no money of its own (only the opening money and pay), and under
// EMPTY_BYTES of app data in all (settings, nothing made). Only when the
// owner turns it on (admin 公開領取, off by default), each night at 03:50
// Taiwan (worker.js), at most CLEAN_MAX a night; the panel lists who would go
// first. Passes the owner issued by hand and every account made before are
// never touched. A cleared account is deleted as any is (eco.js
// deleteAccount): its last versions stay in D1's history for 30 days, so
// the panel's 備份與復原 can put it back.
import { WALLET_COLLECTION, ECO_APPS, newPasscode, updateWallet, parseWallet, unusedPass, freshPass, gen, deleteAccount } from './eco.js';
import { seal, unseal, tokenSecret, HANDOFF_MS } from './orbit-token.js';
import { placeOf } from './showcase.js';
import { isAllowedOrigin } from './http.js';

export const GIFT_SCHEMA = [
  'CREATE TABLE IF NOT EXISTS gift (id INTEGER PRIMARY KEY, round INTEGER NOT NULL, live INTEGER NOT NULL, total INTEGER NOT NULL, claimed INTEGER NOT NULL, back INTEGER NOT NULL, opens INTEGER NOT NULL, closes INTEGER NOT NULL, rate INTEGER NOT NULL, hold INTEGER NOT NULL, swept INTEGER NOT NULL, updated INTEGER NOT NULL)',
  'CREATE TABLE IF NOT EXISTS gift_claim (round INTEGER NOT NULL, device TEXT NOT NULL, place TEXT NOT NULL, doc TEXT NOT NULL, at INTEGER NOT NULL, used INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (round, device))',
  'CREATE INDEX IF NOT EXISTS gift_claim_place ON gift_claim (place, at)'
];
// (Added after the table was first made: run once, an error for a column already there ignored.)
const GIFT_COLUMNS = ['ALTER TABLE gift ADD COLUMN clean INTEGER NOT NULL DEFAULT 0', 'ALTER TABLE gift ADD COLUMN days INTEGER NOT NULL DEFAULT 30'];
export const EMPTY_BYTES = 2000;
const CLEAN_MAX = 200;
export const GIFT_DEFAULTS = { live: 0, total: 50, opens: 0, closes: 0, rate: 20, hold: 2 };
export const GIFT_MAX = 5000;
const SWEEP_MS = 5 * 60_000;
const SWEEP_MAX = 50;
const COOKIE = 'orbit_gift';
const PASS_COOKIE = 'orbit_gift_pass';
const YEAR_S = 365 * 86_400;

const ready = new WeakMap();
async function db(env) {
  const d = env.STORE;
  if (!d) throw new Error('no store bound');
  if (!ready.has(d)) {
    ready.set(
      d,
      GIFT_SCHEMA.reduce((p, sql) => p.then(() => d.prepare(sql).run()), Promise.resolve())
        .then(() => GIFT_COLUMNS.reduce((p, sql) => p.then(() => d.prepare(sql).run().catch(() => {})), Promise.resolve()))
        .then(() => d.prepare('INSERT OR IGNORE INTO gift (id, round, live, total, claimed, back, opens, closes, rate, hold, swept, updated) VALUES (1, 1, ?1, ?2, 0, 0, ?3, ?4, ?5, ?6, 0, 0)').bind(GIFT_DEFAULTS.live, GIFT_DEFAULTS.total, GIFT_DEFAULTS.opens, GIFT_DEFAULTS.closes, GIFT_DEFAULTS.rate, GIFT_DEFAULTS.hold).run())
        .catch(e => (ready.delete(d), Promise.reject(e)))
    );
  }
  await ready.get(d);
  return d;
}
const readGift = async env => (await db(env)).prepare('SELECT * FROM gift WHERE id = 1').first();

// What the page shows: off, soon (opens later), open, gone (all taken), over (closed).
export function giftState(g, now) {
  if (!g?.live) return 'off';
  if (g.closes && now >= g.closes) return 'over';
  if (g.opens && now < g.opens) return 'soon';
  if (g.claimed >= g.total) return 'gone';
  return 'open';
}

// One pass, fresh (its first sign-in replaces it): the admin's `issue` and
// a claim (`gift`: marked as the giveaway's, the only accounts ever cleared).
export async function mintPass(env, deps, { gift = false } = {}) {
  const now = deps.now();
  const { passcode, docId } = await newPasscode(env, deps);
  await updateWallet(env, deps, docId, w => ({ ...w, v2: now, sec: { fresh: true }, ...(gift ? { gift: now } : {}) }), { create: true });
  return { passcode, docId };
}

const cookies = request => Object.fromEntries((request.headers.get('Cookie') || '').split(/;\s*/).filter(Boolean).map(c => [c.slice(0, c.indexOf('=')), decodeURIComponent(c.slice(c.indexOf('=') + 1))]));
const setCookie = (name, value, maxAge = YEAR_S) => `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;
const DEVICE = /^[A-Za-z0-9]{20,40}$/;

// A pass's account and how far it got: making (a claim under way), ready
// (never signed in), started (signed in, its pass not replaced yet), done
// (its own pass now). A pass taken back has no claim left.
async function claimOf(env, deps, round, device) {
  const row = device ? await (await db(env)).prepare('SELECT * FROM gift_claim WHERE round = ?1 AND device = ?2').bind(round, device).first() : null;
  if (!row) return null;
  if (!row.doc) return { row, state: 'making' };
  const doc = await deps.fsGet(env, WALLET_COLLECTION, row.doc);
  const w = doc.exists ? parseWallet(doc.payload) : null;
  // (Gone: replaced by its own pass, a new account id, eco.js rotate; or deleted by its owner.)
  if (!w) return { row, state: 'done' };
  return { row, wallet: w, state: !freshPass(w) ? 'done' : unusedPass(w) ? 'ready' : 'started' };
}

// Passes never replaced, past `hold` hours: back to the pool (a past
// round's too, its count left as it was).
export async function sweepGift(env, deps, { force = false } = {}) {
  const d = await db(env);
  const now = deps.now();
  const g = await readGift(env);
  if (!g || (!force && now - g.swept < SWEEP_MS)) return { back: 0 };
  await d.prepare('UPDATE gift SET swept = ?1 WHERE id = 1').bind(now).run();
  if (!g.hold) return { back: 0 };
  const old = (await d.prepare('SELECT round, device, doc FROM gift_claim WHERE used = 0 AND doc <> \'\' AND at < ?1 ORDER BY at LIMIT ?2').bind(now - g.hold * 3_600_000, SWEEP_MAX).all()).results || [];
  let back = 0;
  for (const c of old) {
    const doc = await deps.fsGet(env, WALLET_COLLECTION, c.doc);
    const w = doc.exists ? parseWallet(doc.payload) : null;
    if (!w || !freshPass(w)) {
      await d.prepare('UPDATE gift_claim SET used = 1 WHERE round = ?1 AND device = ?2').bind(c.round, c.device).run();
      continue;
    }
    await deleteAccount(env, deps, c.doc);
    await d.batch([
      d.prepare('DELETE FROM gift_claim WHERE round = ?1 AND device = ?2').bind(c.round, c.device),
      d.prepare('UPDATE gift SET claimed = MAX(0, claimed - 1), back = back + 1 WHERE id = 1 AND round = ?1').bind(c.round)
    ]);
    back++;
  }
  return { back };
}

// The giveaway's accounts left empty (see the top): { id, ref, last, bytes, apps }, oldest first.
const MINE_ONLY = new Set(['start', 'pay']);
const lastUse = w => Math.max(Number(w.gift) || 0, Number(w.v2) || 0, ...Object.values(w.apps || {}).map(a => Number(a?.last) || 0));
export async function emptyGiftAccounts(env, deps, days) {
  const d = await db(env);
  const now = deps.now();
  const colls = Object.values(ECO_APPS).map(a => a.collection);
  const rows = (await d.prepare("SELECT id, payload FROM docs WHERE coll = ?1 AND json_extract(payload, '$.gift') IS NOT NULL").bind(WALLET_COLLECTION).all()).results || [];
  const out = [];
  for (const r of rows) {
    const w = parseWallet(r.payload);
    if (!w?.gift || w.sec?.priority || w.passkeys?.keys?.length || w.merged) continue;
    if ((w.entries || []).some(e => e.app !== 'eco' || !MINE_ONLY.has(e.kind))) continue;
    const last = lastUse(w);
    if (now - last < days * 86_400_000) continue;
    const data = (await d.prepare(`SELECT coll, length(payload) AS n FROM docs WHERE id = ?1 AND coll IN (${colls.map((_, i) => `?${i + 2}`).join(', ')})`).bind(r.id, ...colls).all()).results || [];
    const bytes = data.reduce((sum, x) => sum + (x.n || 0), 0);
    if (bytes > EMPTY_BYTES) continue;
    out.push({ id: r.id, ref: r.id.slice(0, 8), last, bytes, apps: Object.keys(w.apps || {}) });
  }
  return out.sort((a, b) => a.last - b.last);
}

// Each night (worker.js): the pool swept, then the empty accounts cleared if the owner turned it on.
export async function giftNight(env, deps, { force = false } = {}) {
  const swept = await sweepGift(env, deps, { force: true });
  const g = await readGift(env);
  if (!g.clean && !force) return { ...swept, cleared: 0 };
  const empty = (await emptyGiftAccounts(env, deps, g.days)).slice(0, CLEAN_MAX);
  for (const a of empty) await deleteAccount(env, deps, a.id);
  return { ...swept, cleared: empty.length };
}

const publicGift = (g, now) => ({ state: giftState(g, now), left: Math.max(0, g.total - g.claimed), total: g.total, opens: g.opens || 0, closes: g.closes || 0, now });

export async function handleGift(request, env, headers, { ip = '', origin = '', ctx = null, deps }) {
  const now = deps.now();
  const out = (data, status = 200, set = []) => {
    const h = new Headers({ ...headers, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    for (const c of set) h.append('Set-Cookie', c);
    return new Response(JSON.stringify(data), { status, headers: h });
  };
  if (!isAllowedOrigin(origin)) return out({ code: 'FORBIDDEN_ORIGIN' }, 403);
  if (!env.STORE) return out({ code: 'NO_STORE' }, 503);
  const jar = cookies(request);
  let device = DEVICE.test(jar[COOKIE] || '') ? jar[COOKIE] : '';
  const set = [];
  const secret = await tokenSecret(env);
  const g = await readGift(env);

  if (request.method === 'GET') {
    if (!device) set.push(setCookie(COOKIE, (device = deps.generateCode(24).replace(/[^A-Za-z0-9]/g, 'x'))));
    const sweep = sweepGift(env, deps).catch(() => {});
    ctx?.waitUntil ? ctx.waitUntil(sweep) : await sweep;
    const mine = await claimOf(env, deps, g.round, device);
    const code = mine?.state === 'ready' ? (await unseal(secret, jar[PASS_COOKIE] || ''))?.p || '' : '';
    return out({ ...publicGift(g, now), mine: mine ? { state: mine.state, at: mine.row.at, ...(code && mine.state === 'ready' ? { code } : {}) } : null }, 200, set);
  }
  if (request.method !== 'POST') return out({ code: 'POST_ONLY' }, 405);
  let body = {};
  try {
    body = JSON.parse((await request.text()).slice(0, 1000) || '{}');
  } catch {}
  if (!device) return out({ code: 'NO_DEVICE' }, 400);
  const d = await db(env);

  if (body.op === 'go') {
    const mine = await claimOf(env, deps, g.round, device);
    if (mine?.state === 'done') return out({ code: 'DONE', mine: { state: 'done' } }, 409);
    if (!mine?.wallet) return out({ code: 'NO_CLAIM', mine: null }, 404);
    return out({ handoff: await seal(secret, { d: mine.row.doc, g: gen(mine.wallet), e: now + HANDOFF_MS }) });
  }
  if (body.op !== 'claim') return out({ code: 'UNKNOWN_OP' }, 400);

  // Claimed already (a second tap, a reopened page): the same pass.
  const had = await claimOf(env, deps, g.round, device);
  if (had) {
    const code = had.state === 'ready' ? (await unseal(secret, jar[PASS_COOKIE] || ''))?.p || '' : '';
    return out({ ...publicGift(g, now), mine: { state: had.state, at: had.row.at, ...(code ? { code } : {}) } });
  }
  const state = giftState(g, now);
  if (state !== 'open') return out({ code: state.toUpperCase(), ...publicGift(g, now) }, 409);
  const place = placeOf(ip);
  const pace = await d.prepare('SELECT COUNT(*) AS n FROM gift_claim WHERE place = ?1 AND at > ?2').bind(place, now - 60_000).first();
  if ((pace?.n || 0) >= g.rate) return out({ code: 'BUSY', ...publicGift(g, now) }, 429);
  // The device's place first (a double tap makes one), then one off the count.
  const put = await d.prepare('INSERT OR IGNORE INTO gift_claim (round, device, place, doc, at) VALUES (?1, ?2, ?3, \'\', ?4)').bind(g.round, device, place, now).run();
  if (!put.meta?.changes) return out({ code: 'BUSY', ...publicGift(g, now) }, 429);
  const took = await d.prepare('UPDATE gift SET claimed = claimed + 1 WHERE id = 1 AND round = ?1 AND live = 1 AND claimed < total AND (opens = 0 OR opens <= ?2) AND (closes = 0 OR closes > ?2) RETURNING claimed').bind(g.round, now).first();
  const drop = () => d.prepare('DELETE FROM gift_claim WHERE round = ?1 AND device = ?2').bind(g.round, device).run();
  if (!took) {
    await drop();
    const now2 = await readGift(env);
    return out({ code: 'GONE', ...publicGift(now2, now) }, 409);
  }
  let pass;
  try {
    pass = await mintPass(env, deps, { gift: true });
    await d.prepare('UPDATE gift_claim SET doc = ?1 WHERE round = ?2 AND device = ?3').bind(pass.docId, g.round, device).run();
  } catch (e) {
    await drop();
    await d.prepare('UPDATE gift SET claimed = MAX(0, claimed - 1) WHERE id = 1 AND round = ?1').bind(g.round).run();
    throw e;
  }
  set.push(setCookie(PASS_COOKIE, await seal(secret, { p: pass.passcode, r: g.round })));
  return out({ ...publicGift({ ...g, claimed: took.claimed }, now), mine: { state: 'ready', at: now, code: pass.passcode } }, 200, set);
}

// ---- The admin panel's (eco-admin.js ADMIN_TOOLS) -------------------------------------

const num = (v, lo, hi, dflt) => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : dflt;
};

async function giftView(env, deps) {
  const d = await db(env);
  const g = await readGift(env);
  const now = deps.now();
  const rows = (await d.prepare('SELECT c.at AS at, c.doc AS doc, c.used AS used, w.payload AS payload FROM gift_claim c LEFT JOIN docs w ON w.coll = ?2 AND w.id = c.doc WHERE c.round = ?1 ORDER BY c.at DESC LIMIT ?3').bind(g.round, WALLET_COLLECTION, GIFT_MAX).all()).results || [];
  let started = 0;
  let done = 0;
  for (const r of rows) {
    const w = r.payload ? parseWallet(r.payload) : null;
    if (!r.doc) continue;
    if (!w || !freshPass(w)) done++;
    else if (!unusedPass(w)) started++;
  }
  const hour = rows.filter(r => now - r.at < 3_600_000).length;
  const empty = await emptyGiftAccounts(env, deps, g.days);
  return { empty: { on: !!g.clean, days: g.days, count: empty.length, first: empty.slice(0, 20).map(({ id, ...a }) => a) }, gift: { ...publicGift(g, now), live: !!g.live, rate: g.rate, hold: g.hold, round: g.round, claimed: g.claimed, back: g.back, started, done, hour, last: rows[0]?.at || 0 } };
}

export const GIFT_TOOLS = {
  async gift({ env, deps }) {
    await sweepGift(env, deps).catch(() => {});
    return giftView(env, deps);
  },
  // { live, total, opens, closes, rate, hold }: any of them.
  async 'gift-set'({ env, deps, body }) {
    const g = await readGift(env);
    const next = {
      live: body.live == null ? g.live : body.live ? 1 : 0,
      total: body.total == null ? g.total : num(body.total, 0, GIFT_MAX, g.total),
      opens: body.opens == null ? g.opens : num(body.opens, 0, 8.64e15, 0),
      closes: body.closes == null ? g.closes : num(body.closes, 0, 8.64e15, 0),
      rate: body.rate == null ? g.rate : num(body.rate, 1, 600, g.rate),
      hold: body.hold == null ? g.hold : num(body.hold, 0, 720, g.hold)
    };
    if (next.opens && next.closes && next.closes <= next.opens) return { error: 'GIFT_TIMES', status: 400 };
    await (await db(env)).prepare('UPDATE gift SET live = ?1, total = ?2, opens = ?3, closes = ?4, rate = ?5, hold = ?6, updated = ?7 WHERE id = 1').bind(next.live, next.total, next.opens, next.closes, next.rate, next.hold, deps.now()).run();
    return giftView(env, deps);
  },
  // The empty accounts' clearing: { clean, days } (days 7 to 365).
  async 'gift-clean-set'({ env, deps, body }) {
    const g = await readGift(env);
    const clean = body.clean == null ? g.clean : body.clean ? 1 : 0;
    const days = body.days == null ? g.days : num(body.days, 7, 365, g.days);
    await (await db(env)).prepare('UPDATE gift SET clean = ?1, days = ?2, updated = ?3 WHERE id = 1').bind(clean, days, deps.now()).run();
    return giftView(env, deps);
  },
  // …and now, by hand (the list the panel shows).
  async 'gift-clean-run'({ env, deps }) {
    const { cleared } = await giftNight(env, deps, { force: true });
    return { cleared, ...(await giftView(env, deps)) };
  },
  // A new round: the count starts again, every device may claim once more
  // (the passes already given stay theirs).
  async 'gift-round'({ env, deps }) {
    await (await db(env)).prepare('UPDATE gift SET round = round + 1, claimed = 0, back = 0, updated = ?1 WHERE id = 1').bind(deps.now()).run();
    return giftView(env, deps);
  }
};
