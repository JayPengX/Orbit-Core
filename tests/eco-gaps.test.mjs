// /eco's parts no other test reached (found by the hand-testing list, 2026-11-12): a session's
// lifetime and its refresh, a shared schedule's day, 傳給 Orbit's hour, the wallet left alone on a
// plain save, the overdraft's month, pay only on the live copy, each app's size cap.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { handleEcoRequest, paydayEntries, poolBalance, PAY, WALLET_COLLECTION, ECO_APPS, SHARE_MS, OVERDRAFT_RATE, taipeiMonth } from '../eco.js';
import { SESSION_MS, REFRESH_MS } from '../orbit-token.js';
import { ADMIN_SESSION_MS } from '../eco-admin.js';
import { newPass as viaMail } from './new-pass.mjs';

function setup() {
  const store = new Map();
  let clock = 1_700_000_000_000;
  let n = 0;
  let codeN = 0;
  const key = (c, id) => `${c}/${id}`;
  const deps = {
    json: (data, status) => ({ status, data }),
    errorJson: (code, status) => ({ status, data: { error: { code } } }),
    upstreamFailed: error => ({ status: 502, data: { error: { code: 'UPSTREAM_FAILED', message: error.message } } }),
    readJsonBody: req => Promise.resolve(req.body),
    INVALID_BODY: Symbol('bad'),
    rateLimitResponse: async () => null,
    fsGet: async (env, c, id) => {
      const d = store.get(key(c, id));
      return d ? { exists: true, ...d } : { exists: false, payload: '', updateTime: '' };
    },
    fsWrite: async (env, c, id, payload, pre) => {
      const had = store.get(key(c, id));
      if (pre?.exists === false && had) throw Object.assign(new Error('exists'), { precondition: true });
      if (pre?.updateTime && had?.updateTime !== pre.updateTime) throw Object.assign(new Error('stale'), { precondition: true });
      const d = { payload, updateTime: `u${++n}` };
      store.set(key(c, id), d);
      return { updateTime: d.updateTime };
    },
    fsDelete: async (env, c, id) => void store.delete(key(c, id)),
    fsList: async (env, c) =>
      [...store.entries()].filter(([k]) => k.startsWith(`${c}/`)).map(([k, d]) => ({ id: k.slice(c.length + 1), payload: d.payload, updateTime: d.updateTime })),
    fsCollections: async () => [...new Set([...store.keys()].map(k => k.split('/')[0]))],
    fsBatch: async (env, writes) => {
      for (const w of writes) {
        if (w.delete) store.delete(key(...w.delete));
        else store.set(key(w.update[0], w.update[1]), { payload: w.update[2], updateTime: `u${++n}` });
      }
    },
    sha256Hex: async text => createHash('sha256').update(text).digest('hex'),
    generateCode: len => {
      codeN++;
      const a = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
      return Array.from({ length: len }, (_, i) => a[(codeN * 5 + i * 11) % 32]).join('');
    },
    now: () => (clock += 1000)
  };
  const puts = [];
  const env = { DATA: { put: async (k, v) => void puts.push(k) }, puts, STORE: {}, ECO_TOKEN_SECRET: 'test-secret', PASS_MAIL: 'on', PASS_MAIL: 'on', ECO_ADMIN_TOKEN: 'o'.repeat(40) };
  const call = (method, query = '', body, cf) => handleEcoRequest({ method, url: `https://w/eco${query}`, body, ...(cf ? { cf } : {}) }, env, {}, '1.1.1.1', deps);
  const qt = token => `?qt=${encodeURIComponent(token)}`;
  return { store, deps, env, call, qt, advance: ms => (clock += ms) };
}

async function newPass(t, app = 'stock') {
  const made = await viaMail(b => t.call('POST', '', b), t.deps, app);
  assert.equal(made.status, 200);
  return made.data;
}
const wallet = t => JSON.parse([...t.store.entries()].find(([k]) => k.startsWith(`${WALLET_COLLECTION}/`))[1].payload);

test('a session lasts 20 minutes; its refresh token signs in again for 60 days, then no more', async () => {
  const t = setup();
  const a = await newPass(t);
  assert.equal((await t.call('GET', `${t.qt(a.token)}&app=stock`)).status, 200);
  t.advance(SESSION_MS + 1000);
  const late = await t.call('GET', `${t.qt(a.token)}&app=stock`);
  assert.equal(late.status, 401);
  assert.equal(late.data.error.code, 'ECO_TOKEN_INVALID');
  const again = await t.call('POST', '?app=stock', { op: 'refresh', refresh: a.refresh });
  assert.equal(again.status, 200);
  assert.ok(again.data.token && again.data.refresh);
  assert.equal((await t.call('GET', `${t.qt(again.data.token)}&app=stock`)).status, 200);
  t.advance(REFRESH_MS + 1000);
  const gone = await t.call('POST', '?app=stock', { op: 'refresh', refresh: again.data.refresh });
  assert.equal(gone.status, 401);
});

test('a shared Class schedule: nothing to share without one; its key lasts a day', async () => {
  const t = setup();
  const a = await newPass(t, 'orbit');
  const none = await t.call('POST', '?app=orbit', { op: 'share-create', qt: a.token });
  assert.equal(none.data.error.code, 'ECO_NOTHING_TO_SHARE');
  assert.equal((await t.call('PATCH', `${t.qt(a.token)}&app=orbit`, { payload: '{"days":[1]}' })).status, 200);
  const made = await t.call('POST', '?app=orbit', { op: 'share-create', qt: a.token });
  assert.equal(made.status, 200);
  assert.match(made.data.key, /^[2-9A-HJ-NP-Z]{8}$/);
  const b = await newPass(t, 'orbit');
  const got = await t.call('POST', '?app=orbit', { op: 'share-redeem', qt: b.token, key: made.data.key });
  assert.equal(got.status, 200);
  assert.equal(got.data.payload, '{"days":[1]}');
  assert.equal(got.data.own, false);
  t.advance(SHARE_MS + 1000);
  const b2 = await t.call('POST', '?app=orbit', { op: 'refresh', refresh: b.refresh });
  const late = await t.call('POST', '?app=orbit', { op: 'share-redeem', qt: b2.data.token, key: made.data.key });
  assert.equal(late.data.error.code, 'ECO_SHARE_NOT_FOUND');
});

test('傳給 Orbit: a report kept under its day; a 4th within the hour is RATE_LIMITED', async () => {
  const t = setup();
  const a = await newPass(t);
  const report = { app: 'beats', kit: 'k1', ua: 'iPhone', log: [] };
  for (let i = 0; i < 3; i++) assert.equal((await t.call('POST', '?app=stock', { op: 'bug', qt: a.token, report })).status, 200);
  assert.equal(t.env.puts.length, 3);
  assert.ok(t.env.puts.every(k => /\/\d{4}-\d{2}-\d{2}\//.test(k)));
  const fourth = await t.call('POST', '?app=stock', { op: 'bug', qt: a.token, report });
  assert.equal(fourth.status, 429);
  assert.equal(fourth.data.error.code, 'RATE_LIMITED');
  assert.equal(t.env.puts.length, 3);
});

test('a plain save leaves the wallet alone: the app\'s "last used" moves at most every 10 minutes', async () => {
  const t = setup();
  const a = await newPass(t, 'vocab');
  await t.call('PATCH', `${t.qt(a.token)}&app=vocab`, { payload: '{"n":0}' });
  const was = [...t.store.entries()].find(([k]) => k.startsWith(`${WALLET_COLLECTION}/`))[1].updateTime;
  for (let i = 1; i <= 5; i++) assert.equal((await t.call('PATCH', `${t.qt(a.token)}&app=vocab`, { payload: `{"n":${i}}` })).status, 200);
  assert.equal([...t.store.entries()].find(([k]) => k.startsWith(`${WALLET_COLLECTION}/`))[1].updateTime, was);
  t.advance(11 * 60_000);
  const r = await t.call('POST', '?app=vocab', { op: 'refresh', refresh: a.refresh });
  await t.call('PATCH', `${t.qt(r.data.token)}&app=vocab`, { payload: '{"n":9}' });
  assert.notEqual([...t.store.entries()].find(([k]) => k.startsWith(`${WALLET_COLLECTION}/`))[1].updateTime, was);
});

test('an overdraft costs 1% a month, once a TW month; under NT$100 owed, nothing', () => {
  const now = Date.UTC(2026, 10, 12, 4);
  const w = owed => ({ v2: true, created: now, entries: [{ id: 'eco:start', t: now, app: 'eco', kind: 'start', amount: PAY.start }, { id: 'stock:x', t: now, app: 'stock', kind: 'buy', amount: -PAY.start - owed }] });
  const od = e => e.filter(x => x.kind === 'od');
  const due = paydayEntries(w(50_000), now);
  assert.deepEqual(od(due).map(e => [e.id, e.amount]), [[`eco:od:${taipeiMonth(now)}`, -50_000 * OVERDRAFT_RATE]]);
  const paid = w(50_000);
  paid.entries.push(...od(due));
  assert.equal(od(paydayEntries(paid, now + 86_400_000)).length, 0);
  assert.equal(od(paydayEntries(w(99), now)).length, 0);
});

test('pay comes only to the live copy: a quiet one\'s read adds no pay', async () => {
  const t = setup();
  const a = await newPass(t, 'stock');
  // (the same app on a second device: A goes quiet)
  const login = await t.call('POST', '?app=stock', { op: 'login', passcode: a.passcode });
  assert.equal(login.status, 200);
  const pays = () => wallet(t).entries.filter(e => /^eco:wpay:/.test(e.id)).length;
  const before = pays();
  t.advance(8 * 86_400_000);
  const quiet = await t.call('POST', '?app=stock', { op: 'refresh', refresh: a.refresh });
  assert.equal(quiet.data.active, false);
  assert.equal(pays(), before);
  const live = await t.call('POST', '?app=stock', { op: 'refresh', refresh: login.data.refresh });
  assert.notEqual(live.data.active, false);
  assert.ok(pays() > before);
});

test('each app\'s data has its size cap: one character over is refused, the cap itself saved', async () => {
  const t = setup();
  for (const app of ['vocab', 'weather', 'law']) {
    const a = await newPass(t, app);
    const max = ECO_APPS[app].maxPayload;
    const at = await t.call('PATCH', `${t.qt(a.token)}&app=${app}`, { payload: JSON.stringify('x'.repeat(max - 2)) });
    assert.equal(at.status, 200, app);
    const over = await t.call('PATCH', `${t.qt(a.token)}&app=${app}`, { payload: JSON.stringify('x'.repeat(max - 1)) });
    assert.equal(over.status, 400, app);
  }
});

test('the owner\'s key: under 32 characters or wrong is FORBIDDEN', async () => {
  const t = setup();
  for (const token of ['short', 'x'.repeat(40), 'o'.repeat(31)]) {
    const r = await t.call('POST', '', { op: 'admin', token, action: 'wallets' });
    assert.equal(r.status, 403, token.length);
    assert.equal(r.data.error.code, 'FORBIDDEN');
  }
});

test('the panel keeps a 14-day sign-in, not the key: only the key trades for one; it ends by itself and with a new key; a session token is never the key', async () => {
  const t = setup();
  const key = 'o'.repeat(40);
  const s = await t.call('POST', '', { op: 'admin', token: key, action: 'session' });
  assert.equal(s.status, 200);
  assert.ok(s.data.token.includes('.') && !s.data.token.includes(key));
  assert.equal((await t.call('POST', '', { op: 'admin', token: s.data.token, action: 'wallets' })).status, 200);
  // (a token can't make itself new ones)
  assert.equal((await t.call('POST', '', { op: 'admin', token: s.data.token, action: 'session' })).status, 403);
  // (a pass's own session, or one signed for something else, is no admin token)
  const a = await newPass(t);
  assert.equal((await t.call('POST', '', { op: 'admin', token: a.token, action: 'wallets' })).status, 403);
  // (a new key ends it)
  t.env.ECO_ADMIN_TOKEN = 'n'.repeat(40);
  assert.equal((await t.call('POST', '', { op: 'admin', token: s.data.token, action: 'wallets' })).status, 403);
  t.env.ECO_ADMIN_TOKEN = key;
  assert.equal((await t.call('POST', '', { op: 'admin', token: s.data.token, action: 'wallets' })).status, 200);
  // (and so does time)
  t.advance(ADMIN_SESSION_MS);
  assert.equal((await t.call('POST', '', { op: 'admin', token: s.data.token, action: 'wallets' })).status, 403);
  assert.equal((await t.call('POST', '', { op: 'admin', token: key, action: 'wallets' })).status, 200);
});

test('reset (owner only): the kept apps stay, every other app\'s data goes, devices out, the opening money again', async () => {
  const t = setup();
  const a = await newPass(t, 'vocab');
  await t.call('PATCH', `${t.qt(a.token)}&app=vocab`, { payload: '{"words":1}' });
  const b = await t.call('POST', '?app=orbit', { op: 'login', passcode: a.passcode });
  await t.call('PATCH', `${t.qt(b.data.token)}&app=orbit`, { payload: '{"days":[1]}' });
  const r = await t.call('POST', '', { op: 'admin', token: 'o'.repeat(40), action: 'reset', passcode: a.passcode, keep: ['vocab'] });
  assert.equal(r.status, 200);
  assert.ok(r.data.gone.includes('orbit') && !r.data.gone.includes('vocab'));
  assert.equal((await t.call('GET', `${t.qt(a.token)}&app=vocab`)).data.error?.code, 'ECO_SIGNED_OUT');
  const again = await t.call('POST', '?app=vocab', { op: 'login', passcode: a.passcode });
  assert.equal(again.status, 200);
  // (the opening money and this week's pay, as a new pass gets: everything earlier gone)
  assert.equal(again.data.pool, PAY.start + PAY.week);
  assert.deepEqual(again.data.wallet.entries.map(e => e.kind).sort(), ['pay', 'start']);
  const v = await t.call('GET', `${t.qt(again.data.token)}&app=vocab`);
  assert.equal(v.data.payload, '{"words":1}');
  const c = await t.call('POST', '?app=orbit', { op: 'login', passcode: a.passcode });
  const o = await t.call('GET', `${t.qt(c.data.token)}&app=orbit`);
  assert.ok(!o.data.payload, 'Class\'s schedule gone');
});

test('the vault: set only with the account’s own pass, replaced only by itself or on purpose; an open copy never goes over a locked one; a locked timetable is shared as the copy its phone sends', async () => {
  const t = setup();
  const a = await newPass(t, 'orbit');
  const v = { v: 1, id: 'AbCdEfGhIjKl', rounds: 600000, salt: 'A'.repeat(22), iv: 'B'.repeat(16), pass: 'C'.repeat(64) };
  assert.equal((await t.call('POST', '?app=orbit', { op: 'vault', qt: a.token, passcode: 'ZZZZZZZZZZ', vault: v })).status, 403, 'not its pass');
  assert.equal((await t.call('POST', '?app=orbit', { op: 'vault', qt: a.token, passcode: a.passcode, vault: { ...v, rounds: 10 } })).status, 400);
  const set = await t.call('POST', '?app=orbit', { op: 'vault', qt: a.token, passcode: a.passcode, vault: v });
  assert.equal(set.status, 200);
  assert.deepEqual(wallet(t).vault, v);
  const other = await t.call('POST', '?app=orbit', { op: 'vault', qt: a.token, passcode: a.passcode, vault: { ...v, id: 'ZyXwVuTsRqPo' } });
  assert.equal(other.status, 409);
  assert.equal(other.data.vault.id, v.id, 'the one there comes back');
  assert.equal((await t.call('POST', '?app=orbit', { op: 'vault', qt: a.token, passcode: a.passcode, vault: { ...v, pass: 'D'.repeat(64) } })).status, 200, 'itself locked again');
  assert.equal((await t.call('POST', '?app=orbit', { op: 'vault', qt: a.token, passcode: a.passcode, vault: { ...v, id: 'ZyXwVuTsRqPo' }, fresh: true })).status, 200, 'a new one on purpose');
  // Locked data: an open copy can't go over it; a locked one can.
  assert.equal((await t.call('PATCH', `${t.qt(a.token)}&app=orbit`, { payload: 'e1:ZyXwVuTsRqPo:iv:data' })).status, 200);
  const plain = await t.call('PATCH', `${t.qt(a.token)}&app=orbit`, { payload: '{"days":[]}' });
  assert.equal(plain.data.error.code, 'ECO_PAYLOAD_LOCKED');
  assert.equal((await t.call('PATCH', `${t.qt(a.token)}&app=orbit`, { payload: 'e1:ZyXwVuTsRqPo:iv2:data2' })).status, 200);
  // Sharing: the locked one isn't, the copy sent is.
  assert.equal((await t.call('POST', '?app=orbit', { op: 'share-create', qt: a.token })).data.error.code, 'ECO_NOTHING_TO_SHARE');
  const made = await t.call('POST', '?app=orbit', { op: 'share-create', qt: a.token, payload: '{"days":[2]}' });
  const b = await newPass(t, 'orbit');
  assert.equal((await t.call('POST', '?app=orbit', { op: 'share-redeem', qt: b.token, key: made.data.key })).data.payload, '{"days":[2]}');
});

test('the vault’s key: kept only sealed by the Worker’s secret, never shown in the wallet, handed to a signed-in device of the account; every account’s existing data sealed in place, Securities’ left open (Jay 11-15)', async () => {
  const { sealSweep } = await import('../eco.js');
  const t = setup();
  const a = await newPass(t, 'orbit');
  assert.equal((await t.call('PATCH', `${t.qt(a.token)}&app=orbit`, { payload: '{"days":[1]}' })).status, 200);
  const done = await sealSweep(t.env, t.deps);
  assert.equal(done.accounts >= 1 && done.docs >= 1, true);
  const w = wallet(t);
  assert.ok(w.vault?.id && w.vault.escrow?.key && w.vault.sealed);
  const stored = [...t.store.entries()].find(([k]) => k.startsWith(`${ECO_APPS.orbit.collection}/`))[1].payload;
  assert.match(stored, /^e1:/);
  assert.ok(!stored.includes('days'));
  const read = await t.call('GET', `${t.qt(a.token)}&app=orbit`);
  assert.equal(read.data.wallet.vault.escrow, true, 'a device sees only that there is one');
  const got = await t.call('POST', '?app=orbit', { op: 'vault-key', qt: a.token });
  assert.equal(got.data.id, w.vault.id);
  // The key opens what was sealed, as the phone's vault.mjs does.
  const V = await import('../kit/vault.mjs');
  const key = await crypto.subtle.importKey('raw', V.unb64(got.data.key), 'AES-GCM', true, ['encrypt', 'decrypt']);
  assert.equal(await V.unseal(key, stored), '{"days":[1]}');
  assert.equal((await t.call('POST', '?app=orbit', { op: 'vault-key', qt: 'nope' })).status, 401);
});

test('a vault a phone made before the Worker kept its key: a signed-in device holding the key gives it, nothing typed, only if it opens the sealed data (Jay 11-15: no Pass page to read your own data)', async () => {
  const t = setup();
  const a = await newPass(t, 'orbit');
  const V = await import('../kit/vault.mjs');
  const made = await V.makeVault(a.passcode);
  assert.equal((await t.call('POST', '?app=orbit', { op: 'vault', qt: a.token, passcode: a.passcode, vault: made.vault })).status, 200);
  assert.equal((await t.call('PATCH', `${t.qt(a.token)}&app=orbit`, { payload: await V.seal(made.key, made.vault.id, '{"days":[3]}') })).status, 200);
  assert.equal((await t.call('POST', '?app=orbit', { op: 'vault-key', qt: a.token })).status, 403, 'no copy yet');
  const raw = V.b64(await crypto.subtle.exportKey('raw', made.key));
  const wrong = V.b64(crypto.getRandomValues(new Uint8Array(32)));
  assert.equal((await t.call('POST', '?app=orbit', { op: 'vault-escrow', qt: a.token, key: wrong })).status, 403, 'a key that doesn’t open it');
  const gave = await t.call('POST', '?app=orbit', { op: 'vault-escrow', qt: a.token, key: raw });
  assert.equal(gave.data.vault.escrow, true);
  assert.equal((await t.call('POST', '?app=orbit', { op: 'vault-key', qt: a.token })).data.key, raw, 'every device takes it now');
});

test('a save keeps the wallet’s vault: merged with a patch, the vault and its recovery copy stay (Jay 11-15: every save dropped it)', async () => {
  const { mergeWallet, emptyWallet } = await import('../eco.js');
  const vault = { v: 1, id: 'abc123def', escrow: { iv: 'i', key: 'k' }, sealed: 5 };
  const w = { ...emptyWallet(1), vault };
  const out = mergeWallet(w, { entries: [], snap: {}, settings: { lang: { value: 'zh', t: 2 } } });
  assert.deepEqual(out.vault, vault);
  // Every field the Worker keeps survives a merge, whatever it's called.
  const own = Object.keys(w).filter(k => !['v', 'created', 'entries', 'snap', 'settings', 'apps', 'inbox'].includes(k));
  for (const k of own) assert.ok(k in out, `${k} kept`);
});

test('the wallet’s own parts locked too: every setting’s value and an app’s figures but money’s, by the phone or by the sweep; the key opens them, a locked one sent merges by its time (Jay 11-15: "encrypted as much as possible, only keep minimum")', async () => {
  const { sealSweep, PARTS_FROM } = await import('../eco.js');
  const V = await import('../kit/vault.mjs');
  const t = setup();
  const now = PARTS_FROM + 60_000;
  t.deps.now = () => now;
  const a = await newPass(t, 'orbit');
  const places = { places: [[24.8177, 121.0159, 'home']] };
  assert.equal((await t.call('PATCH', `${t.qt(a.token)}&app=orbit`, { payload: '{"days":[1]}', wallet: { settings: { 'fb:transit': { value: places, t: now - 5 } }, snap: { orbit: { lessons: 12, t: now - 5 } } } })).status, 200);
  assert.deepEqual(wallet(t).settings['fb:transit'].value, places, 'sent open by an older kit');
  await sealSweep(t.env, t.deps);
  const w = wallet(t);
  assert.ok(!JSON.stringify(w.settings).includes('24.8177'), 'no place left open');
  assert.match(w.settings['fb:transit'].e, /^e1:/);
  assert.equal(w.settings['fb:transit'].t, now - 5, 'its time kept, for merging');
  assert.equal(w.snap.orbit.lessons, undefined);
  // The key opens them as the kit does.
  const got = await t.call('POST', '?app=orbit', { op: 'vault-key', qt: a.token });
  const key = await crypto.subtle.importKey('raw', V.unb64(got.data.key), 'AES-GCM', true, ['encrypt', 'decrypt']);
  const known = new Map();
  const first = V.openParts(w, known);
  assert.equal(first.wallet.settings['fb:transit'].value, undefined, 'unset until opened, never a locked string');
  assert.equal(first.wallet.settings['fb:transit'].t, now - 5);
  await V.unlockParts(first.missing, key, known);
  const opened = V.openParts(w, known).wallet;
  assert.deepEqual(opened.settings['fb:transit'].value, places);
  assert.equal(opened.snap.orbit.lessons, 12);
  // A phone's own locked setting, newer, merges by its time; the vault stays.
  const mine = await V.sealParts({ settings: { 'fb:transit': { value: { places: [] }, t: now - 1 } }, snap: { stock: { cash: 5, holdings: 9, t: now } } }, key, w.vault.id);
  assert.equal(mine.snap.stock.cash, 5, 'money’s figure stays open');
  assert.equal(mine.snap.stock.holdings, undefined);
  assert.equal((await t.call('PATCH', `${t.qt(a.token)}&app=orbit`, { wallet: { settings: mine.settings } })).status, 200);
  const after = wallet(t);
  assert.equal(after.settings['fb:transit'].e, mine.settings['fb:transit'].e);
  assert.equal(after.vault.id, w.vault.id);
});

test('kit vault: a part that doesn’t open reads as unset and isn’t asked again', async () => {
  const V = await import('../kit/vault.mjs');
  const k1 = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  const k2 = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  const p = await V.sealParts({ settings: { x: { value: 1, t: 3 } } }, k1, 'id1');
  const w = { settings: p.settings, snap: {} };
  const known = new Map();
  const { missing } = V.openParts(w, known);
  await V.unlockParts(missing, k2, known);
  const again = V.openParts(w, known);
  assert.equal(again.missing.length, 0);
  assert.deepEqual(again.wallet.settings.x, { t: 3, locked: true });
});
