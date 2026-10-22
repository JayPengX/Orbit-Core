// /eco against an in-memory Firestore: no network, no real credentials.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { handleEcoRequest, mergeWallet, poolBalance, cleanPatch, emptyWallet, paydayEntries, worthOf, vipEntries, vipStakes, vipTier, VIP, PAY, WALLET_COLLECTION, INBOX_COLLECTION, SHARE_COLLECTION, ECO_APPS, rankEntries, RANKS } from '../eco.js';
import { planClean, tidyWallet } from '../eco-admin.js';

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
  const env = { STORE: {}, ECO_TOKEN_SECRET: 'test-secret', ECO_OPEN_SIGNUP: 'on', ECO_ADMIN_TOKEN: 'o'.repeat(40) };
  const call = (method, query = '', body) => handleEcoRequest({ method, url: `https://w/eco${query}`, body }, env, {}, '1.1.1.1', deps);
  const qt = token => `?qt=${encodeURIComponent(token)}`;
  return { store, deps, env, call, qt, advance: ms => (clock += ms) };
}

async function newPass(t, app = 'stock') {
  const made = await t.call('POST', '', { op: 'create', app });
  assert.equal(made.status, 200);
  return made.data;
}

test('create: a new pass, signed in and live, with the opening money', async () => {
  const t = setup();
  const acct = await newPass(t);
  assert.match(acct.passcode, /^[2-9A-HJ-NP-Z]{10}$/);
  assert.ok(acct.token && acct.refresh);
  assert.equal(acct.active, true);
  assert.ok(acct.pool >= PAY.start);
  assert.equal(acct.wallet.sec, undefined);
  // The pass itself is never a document id: only its hash.
  assert.ok(![...t.store.keys()].some(k => k.includes(acct.passcode)));
});

test('read and write with the session; the pass itself opens nothing', async () => {
  const t = setup();
  const acct = await newPass(t);
  const w = await t.call('PATCH', `${t.qt(acct.token)}&app=stock`, { payload: 'gz1:abc', wallet: { entries: [{ id: 'stock:1', t: 1, app: 'stock', kind: 'fee', amount: -30 }], snap: { stock: { cash: -1000, t: 5 } } } });
  assert.equal(w.status, 200);
  // (Securities' cash is the Worker's count, never the figure a phone sends.)
  assert.equal(w.data.pool, acct.pool - 30);
  const again = await t.call('PATCH', `${t.qt(acct.token)}&app=stock`, { wallet: { entries: [{ id: 'stock:1', t: 1, app: 'stock', kind: 'fee', amount: -99 }] } });
  assert.equal(again.data.pool, w.data.pool);
  const read = await t.call('GET', `${t.qt(acct.token)}&app=stock`);
  assert.equal(read.data.payload, 'gz1:abc');
  assert.equal((await t.call('GET', `?passcode=${acct.passcode}&app=stock`)).status, 401);
  assert.equal((await t.call('GET', '?qt=nope.nope')).status, 401);
  const forged = acct.token.split('.')[0] + '.AAAA';
  assert.equal((await t.call('GET', `?qt=${forged}`)).status, 401);
});

test("an app cannot forge the Worker's own entries, and only the apps that move money write any", () => {
  const p = cleanPatch({
    entries: [
      { id: 'x', t: 1, app: 'eco', kind: 'xfer-in', amount: 1e6 },
      { id: 'y', t: 1, app: 'odds', kind: 'payout', amount: 30 },
      { id: 'z', t: 1, app: 'stock', kind: 'dividend', amount: 5 },
      { id: 'vocab:w:1', t: 1, app: 'vocab', kind: 'words', amount: 0, xp: 40 },
      { id: 'vocab:shop:pack:toeic', t: 1, app: 'vocab', kind: 'shop', amount: -990 },
      { id: 'match:1', t: 1, app: 'match', kind: 'reward', amount: 30 }
    ]
  });
  assert.deepEqual(p.entries.map(e => e.id), ['y', 'z']);
  assert.equal('xp' in p.entries[0], false);
});

test('wallet merge: entries by id, newest settings and figures', () => {
  const a = mergeWallet(emptyWallet(10), { entries: [{ id: 'a', t: 2, app: 'odds', amount: 5 }], settings: { k: { value: 1, t: 1 } }, snap: { stock: { cash: 10, t: 1 } } });
  const b = mergeWallet(a, { entries: [{ id: 'a', t: 2, app: 'odds', amount: 7 }, { id: 'b', t: 1, app: 'stock', amount: 3 }], settings: { k: { value: 2, t: 3 } }, snap: { stock: { cash: 4, t: 0 } } });
  assert.deepEqual(b.entries.map(e => e.id), ['b', 'a']);
  assert.equal(b.settings.k.value, 2);
  assert.equal(b.snap.stock.cash, 10);
  assert.equal(poolBalance(b), 18);
});

test('there is no transfer between passes', async () => {
  const t = setup();
  const acct = await newPass(t);
  assert.equal((await t.call('POST', '', { op: 'transfer', passcode: acct.passcode, to: 'ABCDEFGHJK', amount: 1, id: 'x' })).data.error.code, 'ECO_UNKNOWN_OP');
});

test('one app at a time: another app claiming makes the first read-only', async () => {
  const t = setup();
  const acct = await newPass(t);
  const play = await t.call('POST', '', { op: 'refresh', refresh: acct.refresh, app: 'odds', claim: true });
  assert.equal(play.data.active, true);
  assert.ok(play.data.refresh, 'the refresh token is renewed');
  const read = await t.call('GET', t.qt(acct.token));
  assert.equal(read.data.active, false);
  assert.equal(read.data.live.app, 'odds');
  assert.equal(read.data.token, undefined);
  const write = await t.call('PATCH', `${t.qt(acct.token)}&app=stock`, { payload: 'gz1:x' });
  assert.equal(write.status, 409);
  assert.equal(write.data.error.code, 'ECO_SESSION_MOVED');
  const peek = await t.call('POST', '', { op: 'refresh', refresh: acct.refresh, app: 'stock' });
  assert.equal(peek.data.active, false);
  const back = await t.call('POST', '', { op: 'refresh', refresh: acct.refresh, app: 'stock', claim: true });
  assert.equal(back.data.active, true);
  assert.equal((await t.call('PATCH', `${t.qt(back.data.token)}&app=stock`, { payload: 'gz1:y' })).status, 200);
});

test('login with the pass; an unknown pass is refused', async () => {
  const t = setup();
  const acct = await newPass(t);
  const login = await t.call('POST', '', { op: 'login', passcode: acct.passcode.toLowerCase().replace(/^(.{5})/, '$1-'), app: 'vocab', inbox: true });
  assert.equal(login.status, 200);
  assert.ok(login.data.refresh);
  assert.equal(login.data.passcode, undefined, 'the pass is never sent back');
  assert.equal((await t.call('POST', '', { op: 'login', passcode: 'ABCDEFGHJK', app: 'vocab' })).status, 404);
});

test('sign out everywhere: every earlier token stops working', async () => {
  const t = setup();
  const acct = await newPass(t);
  const out = await t.call('POST', '', { op: 'signout-all', qt: acct.token });
  assert.equal(out.status, 200);
  assert.ok(out.data.refresh, 'this device stays signed in');
  assert.equal((await t.call('GET', t.qt(out.data.token))).status, 200);
  assert.equal((await t.call('GET', t.qt(acct.token))).status, 401);
  assert.equal((await t.call('POST', '', { op: 'refresh', refresh: acct.refresh, app: 'stock', claim: true })).status, 401);
  assert.equal((await t.call('POST', '', { op: 'pair-create', qt: acct.token })).status, 401);
  assert.equal((await t.call('POST', '', { op: 'login', passcode: acct.passcode, app: 'stock' })).status, 200);
});

test('handoff: a sealed sign-in for a link, never the pass', async () => {
  const t = setup();
  const acct = await newPass(t);
  const h = await t.call('POST', '', { op: 'handoff', qt: acct.token });
  assert.equal(h.status, 200);
  const r = await t.call('POST', '', { op: 'redeem', handoff: h.data.handoff, app: 'odds' });
  assert.equal(r.status, 200);
  assert.ok(r.data.refresh && r.data.token);
  assert.equal(r.data.passcode, undefined);
  assert.equal(r.data.active, true);
  t.advance(10 * 60_000);
  assert.equal((await t.call('POST', '', { op: 'redeem', handoff: h.data.handoff, app: 'odds' })).status, 410);
  assert.equal((await t.call('POST', '', { op: 'redeem', handoff: 'garbage', app: 'odds' })).status, 410);
});

test('device code: signs in another device once, within ten minutes', async () => {
  const t = setup();
  const acct = await newPass(t);
  const p = await t.call('POST', '', { op: 'pair-create', qt: acct.token });
  assert.match(p.data.code, /^[2-9A-HJ-NP-Z]{8}$/);
  const phone = await t.call('POST', '', { op: 'pair-redeem', code: p.data.code, app: 'match' });
  assert.equal(phone.status, 200);
  assert.ok(phone.data.refresh);
  assert.equal(phone.data.passcode, undefined);
  assert.equal((await t.call('POST', '', { op: 'pair-redeem', code: p.data.code, app: 'match' })).status, 404);
  const late = await t.call('POST', '', { op: 'pair-create', qt: phone.data.token });
  t.advance(11 * 60_000);
  assert.equal((await t.call('POST', '', { op: 'pair-redeem', code: late.data.code, app: 'match' })).status, 404);
});

test('payday: every Monday from 19 Oct 2026, back pay included', () => {
  const pays = (w, now) => paydayEntries(w, now).filter(e => e.kind === 'pay').map(e => e.id);
  const oct = Date.UTC(2026, 9, 7, 3);
  assert.deepEqual(pays({ created: oct, entries: [] }, oct), []);
  const tue = Date.UTC(2026, 9, 20, 3);
  assert.deepEqual(pays({ created: oct, entries: [] }, tue), ['eco:wpay:2026-10-19']);
  assert.equal(paydayEntries({ created: oct, entries: [] }, tue).find(e => e.id === 'eco:wpay:2026-10-19').amount, 10_000);
  // Back pay: every Monday nobody opened an app, paid the next time.
  assert.deepEqual(pays({ created: oct, entries: [] }, Date.UTC(2026, 10, 3, 3)), ['eco:wpay:2026-10-19', 'eco:wpay:2026-10-26', 'eco:wpay:2026-11-02']);
  // A pass made later: weekly pay from its own week.
  const made = Date.UTC(2026, 10, 4, 3);
  assert.deepEqual(pays({ created: made, entries: [] }, Date.UTC(2026, 10, 10, 3)), ['eco:wpay:2026-11-02', 'eco:wpay:2026-11-09']);
  // Sunday 23:30 Taipei is still last week; Monday 00:00 is payday.
  assert.deepEqual(pays({ created: made, entries: [] }, Date.UTC(2026, 10, 8, 15, 30)), ['eco:wpay:2026-11-02']);
  assert.deepEqual(pays({ created: made, entries: [] }, Date.UTC(2026, 10, 8, 16, 0)), ['eco:wpay:2026-11-02', 'eco:wpay:2026-11-09']);
});

test('rotate: a new pass holds everything, every other device is out', async () => {
  const t = setup();
  const acct = await newPass(t);
  await t.call('PATCH', `${t.qt(acct.token)}&app=stock`, { payload: 'gz1:mine' });
  const other = await t.call('POST', '', { op: 'login', passcode: acct.passcode, app: 'odds' });
  const back = await t.call('POST', '', { op: 'refresh', refresh: acct.refresh, app: 'stock', claim: true });
  const r = await t.call('POST', '', { op: 'rotate', qt: back.data.token });
  assert.equal(r.status, 200);
  assert.notEqual(r.data.passcode, acct.passcode);
  assert.equal(r.data.payload, 'gz1:mine');
  assert.equal(r.data.pool, acct.pool);
  assert.equal((await t.call('POST', '', { op: 'login', passcode: acct.passcode, app: 'stock' })).status, 404);
  assert.equal((await t.call('POST', '', { op: 'refresh', refresh: other.data.refresh, app: 'odds', claim: true })).status, 401);
  assert.equal((await t.call('GET', `${t.qt(r.data.token)}&app=stock`)).data.payload, 'gz1:mine');
});

test('merge: another pass into this one, then it is gone', async () => {
  const t = setup();
  const a = await newPass(t, 'stock');
  await t.call('PATCH', `${t.qt(a.token)}&app=stock`, { payload: 'gz1:a' });
  const b = await newPass(t, 'stock');
  await t.call('PATCH', `${t.qt(b.token)}&app=stock`, { payload: 'gz1:b', wallet: { entries: [{ id: 'stock:x', t: 1, app: 'stock', kind: 'fee', amount: -40 }] } });
  const aa = await t.call('POST', '', { op: 'refresh', refresh: a.refresh, app: 'stock', claim: true });
  const m = await t.call('POST', '', { op: 'merge', qt: aa.data.token, sources: [{ passcode: b.passcode }] });
  assert.equal(m.status, 200);
  assert.deepEqual(m.data.moved, { stock: 1 });
  assert.equal(m.data.wallet.inbox.stock.length, 1);
  assert.ok(m.data.wallet.entries.some(e => e.id === 'stock:x'), 'under its own id (Securities checks its deposits by it)');
  assert.equal((await t.call('POST', '', { op: 'login', passcode: b.passcode, app: 'stock' })).status, 404);
  // Old app-only codes are not a source any more.
  const legacy = await t.call('POST', '', { op: 'merge', qt: aa.data.token, sources: [{ app: 'orbit', passcode: 'ABCD2345', manager: 'x' }] });
  assert.equal(legacy.status, 400);
});

// Reads that take a moment, as D1's do: two requests at once both read the same version.
function slowReads(t) {
  const get = t.deps.fsGet;
  t.deps.fsGet = async (...args) => {
    const doc = await get(...args);
    await new Promise(r => setTimeout(r, 2));
    return doc;
  };
}

test('rotate twice at once: one new pass holds the money, never two', async () => {
  const t = setup();
  const acct = await newPass(t);
  slowReads(t);
  const [r1, r2] = await Promise.all([t.call('POST', '', { op: 'rotate', qt: acct.token }), t.call('POST', '', { op: 'rotate', qt: acct.token })]);
  assert.deepEqual([r1.status, r2.status].sort(), [200, 401]);
  const wallets = [...t.store.keys()].filter(k => k.startsWith(`${WALLET_COLLECTION}/`));
  assert.equal(wallets.length, 1, 'one account left');
});

test('one pass merged into two at once: its money lands once', async () => {
  const t = setup();
  const a = await newPass(t);
  const b = await newPass(t);
  const src = await newPass(t);
  const { updateWallet } = await import('../eco.js');
  await updateWallet(t.env, t.deps, await t.deps.sha256Hex(src.passcode), w => ({ ...w, entries: [...w.entries, { id: 'odds:payout-gift', t: 1, app: 'odds', kind: 'payout', amount: 500 }] }));
  slowReads(t);
  const [ma, mb] = await Promise.all([a, b].map(x => t.call('POST', '', { op: 'merge', qt: x.token, sources: [{ passcode: src.passcode }] })));
  assert.deepEqual([ma.status, mb.status].sort(), [200, 404]);
  const holders = [ma, mb].filter(m => m.status === 200 && m.data.wallet.entries.some(e => e.id === 'odds:payout-gift'));
  assert.equal(holders.length, 1);
  const other = ma.status === 200 ? b : a;
  assert.ok(!(await t.call('GET', t.qt(other.token))).data.wallet.entries.some(e => e.id === 'odds:payout-gift'));
});

test("merge since the lock-down: Play's winnings come along, and its watched slips, tickets, unrevealed scratch cards and records move to this pass", async () => {
  const t = setup();
  const { updateWallet } = await import('../eco.js');
  const { moveSlips, OPEN_COLLECTION, OPEN_INDEX, SETTLED_COLLECTION } = await import('../settle.js');
  const { moveTickets, TICKET_COLLECTION, TICKET_INDEX } = await import('../lotto.js');
  t.deps.moveRecords = async (env, from, to) => {
    await moveSlips(env, t.deps, from, to);
    await moveTickets(env, t.deps, from, to);
  };
  const a = await newPass(t, 'odds');
  const b = await newPass(t, 'odds');
  const [aId, bId] = [await t.deps.sha256Hex(a.passcode), await t.deps.sha256Hex(b.passcode)];
  // On b: a slip staked and paid by the Worker (an app can't write a payout), one still open, a ticket waiting.
  await updateWallet(t.env, t.deps, bId, w => ({ ...w, entries: [...w.entries, { id: 'odds:stake-slipaaaa1', t: 5, app: 'odds', kind: 'stake', amount: -100 }, { id: 'odds:payout-slipaaaa1', t: 6, app: 'odds', kind: 'payout', amount: 250 }, { id: 'odds:stake-slipbbbb2', t: 7, app: 'odds', kind: 'stake', amount: -100 }] }));
  const put = (c, id, v) => t.deps.fsWrite(t.env, c, id, JSON.stringify(v));
  await put(OPEN_COLLECTION, `${bId}_slipbbbb2`, { account: bId, state: 'open', slip: { id: 'slipbbbb2' }, t: 7 });
  await put(OPEN_COLLECTION, OPEN_INDEX, { due: { [`${bId}_slipbbbb2`]: 99, other_x: 5 } });
  await put(SETTLED_COLLECTION, bId, { slips: { slipaaaa1: { settled: true, payout: 250 } } });
  await put(TICKET_COLLECTION, `${bId}_tickcccc3`, { account: bId, ticket: { id: 'tickcccc3' }, t: 8 });
  await put(TICKET_COLLECTION, TICKET_INDEX, { due: { [`${bId}_tickcccc3`]: 50 } });
  // A scratch card bought on b, not yet revealed (in no index).
  await put(TICKET_COLLECTION, `${bId}_scrdddd4`, { account: bId, ticket: { id: 'scrdddd4', card: 'x', prize: 100 }, t: 9 });
  const poolB = (await t.call('GET', `${t.qt(b.token)}&app=odds`)).data.pool;
  const aa = await t.call('POST', '', { op: 'refresh', refresh: a.refresh, app: 'odds', claim: true });
  const poolA = aa.data.pool;
  const m = await t.call('POST', '', { op: 'merge', qt: aa.data.token, sources: [{ passcode: b.passcode }] });
  assert.equal(m.status, 200);
  const ids = m.data.wallet.entries.map(e => e.id);
  for (const id of ['odds:stake-slipaaaa1', 'odds:payout-slipaaaa1', 'odds:stake-slipbbbb2']) assert.ok(ids.includes(id), id);
  assert.equal(m.data.wallet.entries.filter(e => e.app === 'odds').reduce((s, e) => s + e.amount, 0), 50, 'the NT$250 won is there, once');
  assert.ok(m.data.pool > poolA && poolB > 0);
  const get = async (c, id) => JSON.parse((await t.deps.fsGet(t.env, c, id)).payload || 'null');
  assert.equal(await get(OPEN_COLLECTION, `${bId}_slipbbbb2`), null);
  assert.equal((await get(OPEN_COLLECTION, `${aId}_slipbbbb2`)).account, aId, 'settled later, paid to this pass');
  assert.deepEqual(await get(OPEN_COLLECTION, OPEN_INDEX), { due: { other_x: 5, [`${aId}_slipbbbb2`]: 99 } });
  assert.equal((await get(SETTLED_COLLECTION, aId)).slips.slipaaaa1.payout, 250);
  assert.equal((await get(TICKET_COLLECTION, `${aId}_tickcccc3`)).account, aId);
  assert.deepEqual(Object.keys((await get(TICKET_COLLECTION, TICKET_INDEX)).due), [`${aId}_tickcccc3`]);
  assert.equal(await get(TICKET_COLLECTION, `${bId}_scrdddd4`), null);
  assert.equal((await get(TICKET_COLLECTION, `${aId}_scrdddd4`)).account, aId, 'revealed on this pass, paid to it');
});

test("a phone clock set ahead never blocks a later save: a setting's time is the Worker's at the latest", async () => {
  const t = setup();
  const a = await newPass(t, 'vocab');
  const year = 365 * 86_400_000;
  const ahead = await t.call('PATCH', `${t.qt(a.token)}&app=vocab`, { wallet: { settings: { theme: { value: 'dark', t: Date.now() + year } }, snap: { vocab: { words: 5, t: Date.now() + year } } } });
  assert.equal(ahead.status, 200);
  assert.ok(ahead.data.wallet.settings.theme.t < Date.now() + year / 2, 'stamped no later than now');
  // Another device, its clock right, a moment later: its change stands.
  t.advance(60_000);
  const later = await t.call('PATCH', `${t.qt(ahead.data.token)}&app=vocab`, { wallet: { settings: { theme: { value: 'light', t: t.deps.now() } }, snap: { vocab: { words: 6, t: t.deps.now() } } } });
  assert.equal(later.data.wallet.settings.theme.value, 'light');
  assert.equal(later.data.wallet.snap.vocab.words, 6);
});

test('a claim says when it took the pass back from another live device (the app reads what changed)', async () => {
  const t = setup();
  const a = await newPass(t, 'stock');
  const b = await t.call('POST', '', { op: 'login', passcode: a.passcode, app: 'stock' });
  assert.equal(b.status, 200);
  const back = await t.call('POST', '', { op: 'refresh', refresh: a.refresh, app: 'stock', claim: true });
  assert.equal(back.data.active, true);
  assert.equal(back.data.took, true);
  const again = await t.call('POST', '', { op: 'refresh', refresh: back.data.refresh, app: 'stock', claim: true });
  assert.equal(again.data.took, undefined, 'still its own: nothing taken');
});

test('Orbit sharing: a key gives a copy of the schedule as it is', async () => {
  const t = setup();
  const owner = await newPass(t, 'orbit');
  assert.equal((await t.call('POST', '', { op: 'share-create', qt: owner.token })).status, 404);
  await t.call('PATCH', `${t.qt(owner.token)}&app=orbit`, { payload: 'v2:schedule' });
  const share = await t.call('POST', '', { op: 'share-create', qt: owner.token });
  assert.match(share.data.key, /^[2-9A-HJ-NP-Z]{8}$/);
  const friend = await newPass(t, 'orbit');
  const copy = await t.call('POST', '', { op: 'share-redeem', qt: friend.token, key: share.data.key });
  assert.equal(copy.data.payload, 'v2:schedule');
  assert.equal(copy.data.own, false);
  assert.equal(copy.data.link, undefined);
  assert.equal((await t.call('POST', '', { op: 'follow', qt: friend.token, link: 'X' })).status, 400);
  t.advance(25 * 3_600_000);
  const again = await t.call('POST', '', { op: 'refresh', refresh: friend.refresh, app: 'orbit', claim: true });
  assert.equal((await t.call('POST', '', { op: 'share-redeem', qt: again.data.token, key: share.data.key })).status, 404);
});

test('deleting the account removes everything', async () => {
  const t = setup();
  const acct = await newPass(t);
  await t.call('PATCH', `${t.qt(acct.token)}&app=stock`, { payload: 'gz1:x' });
  assert.equal((await t.call('DELETE', t.qt(acct.token))).status, 200);
  assert.equal([...t.store.keys()].filter(k => k.startsWith(WALLET_COLLECTION) || k.startsWith(ECO_APPS.stock.collection)).length, 0);
});

test('clean-up: only Quadra data stays, and wallets lose retired settings', async () => {
  const t = setup();
  const acct = await newPass(t, 'odds');
  await t.call('PATCH', `${t.qt(acct.token)}&app=odds`, { payload: 'gz1:mine', wallet: { settings: { oddsWeeklyLimit: { value: 2000, t: 1 }, 'act:odds': { value: {}, t: 1 } } } });
  const env = {};
  await t.deps.fsWrite(env, ECO_APPS.odds.collection, 'oldhash', 'gz1:old');
  await t.deps.fsWrite(env, 'orbit-schedules', 'ABCD2345', 'x');
  await t.deps.fsWrite(env, INBOX_COLLECTION, 'nobody-odds-X', 'x');
  await t.deps.fsWrite(env, SHARE_COLLECTION, 'KEYKEYKE', JSON.stringify({ link: 'L', exp: 1 }));
  await t.deps.fsWrite(env, 'someone-elses', 'doc', 'x');
  const plan = await planClean(env, t.deps);
  const del = plan.deletes.map(d => d.join('/')).sort();
  assert.deepEqual(del, [`${INBOX_COLLECTION}/nobody-odds-X`, `${SHARE_COLLECTION}/KEYKEYKE`, `${ECO_APPS.odds.collection}/oldhash`, 'orbit-schedules/ABCD2345'].sort());
  assert.equal(plan.tidy.length, 1);
  assert.equal(plan.tidy[0].wallet.settings.oddsWeeklyLimit, undefined);
  assert.equal(plan.tidy[0].wallet.settings['act:odds'], undefined);
  // The admin op itself needs the token.
  assert.equal((await t.call('POST', '', { op: 'admin', token: 'wrong', action: 'scan' })).status, 403);
  const again = tidyWallet(plan.tidy[0].wallet, t.deps.now());
  assert.deepEqual(again.wallet, plan.tidy[0].wallet);
  assert.deepEqual(again.gone, { entries: 0, money: 0, settings: 0, looks: 0 });
});

test('the clean retires what no app writes any more: Hub entries (their money kept), voucher markers, settings (looks stay: they’re free)', () => {
  const at = Date.UTC(2026, 9, 1);
  const now = Date.UTC(2026, 9, 2);
  const vocab = (id, kind, amount, extra = {}) => ({ id, t: at, app: 'vocab', kind, amount, ...extra });
  const wallet = {
    ...emptyWallet(at),
    entries: [
      { id: 'eco:pay:2026-10', t: at, app: 'eco', kind: 'pay', amount: 6_000 },
      { id: 'eco:plus:2026-09', t: at, app: 'eco', kind: 'plus', amount: 0, note: 'points' },
      { id: 'odds:stake-1', t: at, app: 'odds', kind: 'stake', amount: -500 },
      { id: 'stock:xs-vocab:xs:fee:a', t: at, app: 'stock', kind: 'voucher', amount: 0 },
      vocab('vocab:w:1', 'words', 0, { xp: 400 }),
      vocab('vocab:r:old', 'reward', 240),
      vocab('vocab:g:1', 'game', 0, { xp: 900 }),
      vocab('vocab:m:2026-10-01:game1', 'mission', 0, { xp: 10 }),
      vocab('vocab:shop:pack:toeic', 'shop', -990),
      vocab('vocab:shop:freeze:a', 'shop', -300),
      vocab('vocab:xs:bet100:b', 'redeem', 0, { note: '5000' }),
      vocab('vocab:xp:debit:x', 'redeem', 0, { note: '300' })
    ],
    settings: {
      avatar: { value: { id: 'cat' }, t: at },
      frame: { value: { id: 'gold' }, t: at },
      'bests:vocab': { value: { puzzle: 42 }, t: at },
      'hub:cleanup:v1': { value: true, t: at },
      'act:stock': { value: { day: '2026-10-01' }, t: at },
      'aff:vocab': { value: {}, t: at },
      'aff:odds': { value: { 'league:mlb': 1 }, t: at },
      plus: { value: { on: false }, t: at }
    }
  };
  const { wallet: clean, gone } = tidyWallet(wallet, now);
  // Every Hub entry goes; the NT$ they moved (240 paid, 1,290 spent) stays as one entry.
  assert.deepEqual(clean.entries.map(e => e.id), ['eco:pay:2026-10', 'eco:plus:2026-09', 'odds:stake-1', 'eco:rebase:hub']);
  assert.deepEqual(clean.entries.at(-1), { id: 'eco:rebase:hub', t: now, app: 'eco', kind: 'rebase', amount: -1_050, note: 'hub' });
  assert.equal(poolBalance(clean), poolBalance(wallet));
  // A Plus month bought with points is a month like any.
  assert.equal(clean.entries[1].note, undefined);
  assert.deepEqual(Object.keys(clean.settings).sort(), ['aff:odds', 'avatar', 'frame', 'plus']);
  assert.deepEqual(gone, { entries: 9, money: -1_050, settings: 4, looks: 0 });
  // A second clean changes nothing.
  assert.deepEqual(tidyWallet(clean, now).wallet, clean);
});

test('admin scan reports what the clean would retire before changing a wallet', async () => {
  const t = setup();
  await newPass(t);
  const env = {};
  const [doc] = await t.deps.fsList(env, WALLET_COLLECTION);
  const wallet = JSON.parse(doc.payload);
  wallet.settings = { ...wallet.settings, avatar: { value: { id: 'cat' }, t: 1 }, 'bests:vocab': { value: {}, t: 1 } };
  wallet.entries.push({ id: 'vocab:g:old', t: 1, app: 'vocab', kind: 'game', amount: 0, xp: 20 }, { id: 'vocab:shop:boost:a', t: 2, app: 'vocab', kind: 'shop', amount: -150 });
  await t.deps.fsWrite(env, WALLET_COLLECTION, doc.id, JSON.stringify(wallet));
  const plan = await planClean(env, t.deps);
  assert.deepEqual(plan.retired, { entries: 2, money: -150, settings: 1, looks: 0 });
  assert.equal(plan.tidy.length, 1);
  assert.equal(plan.tidy[0].wallet.entries.some(e => e.app === 'vocab'), false);
  assert.equal(JSON.parse((await t.deps.fsList(env, WALLET_COLLECTION))[0].payload).entries.some(e => e.app === 'vocab'), true);
});

test('the pay is fixed, like a salary: the same however much the account holds', () => {
  assert.equal(PAY.week, 10_000);
  assert.equal(PAY.start, 200_000);
  // Worth still counts Securities' holdings, not only cash.
  const w = { entries: [{ id: 'a', t: 1, app: 'odds', amount: 20_000 }], snap: { stock: { cash: 5_000, held: 300_000, t: 1 } } };
  assert.equal(worthOf(w), 325_000);
  const mon = Date.UTC(2026, 10, 2, 3);
  const rich = { ...w, created: mon, snap: { stock: { cash: 5_000_000, held: 9_000_000, t: 1 } } };
  assert.equal(paydayEntries(rich, mon).find(e => e.kind === 'pay').amount, 10_000);
  assert.equal(paydayEntries({ ...w, created: mon }, mon).find(e => e.kind === 'pay').amount, 10_000);
});

test('a new pass today opens with NT$200,000', async () => {
  const t = setup();
  const acct = await newPass(t, 'odds');
  assert.equal(acct.wallet.entries.find(e => e.id === 'eco:start').amount, 200_000);
});

test('VIP: last month\'s gaming stakes set its tier, and its cashback is paid once the month is over', () => {
  const oct = m => Date.UTC(2026, 9, m, 4);
  const w = { entries: [
    { id: 'odds:stake-a', t: oct(3), app: 'odds', kind: 'stake', amount: -40_000 },
    { id: 'odds:lotto-b', t: oct(4), app: 'odds', kind: 'lottery', amount: -15_000 },
    { id: 'odds:refund-a', t: oct(5), app: 'odds', kind: 'refund', amount: 4_000 },
    // Winnings, Securities and other months don't count.
    { id: 'odds:payout-a', t: oct(6), app: 'odds', kind: 'payout', amount: 90_000 },
    { id: 'odds:stake-sep', t: Date.UTC(2026, 8, 20), app: 'odds', kind: 'stake', amount: -900_000 },
    { id: 'vocab:shop:x', t: oct(7), app: 'vocab', kind: 'shop', amount: -9_000 }
  ] };
  assert.equal(vipStakes(w, '2026-10'), 51_000);
  assert.equal(vipTier(51_000).id, 'silver');
  assert.equal(vipTier(9_999), null);
  // Not during the month; on the first read after it, once.
  assert.deepEqual(vipEntries(w, oct(20)), []);
  const nov = Date.UTC(2026, 10, 2, 4);
  assert.deepEqual(vipEntries(w, nov), [{ id: 'eco:vip:2026-10', t: nov, app: 'eco', kind: 'vip', amount: 408, note: 'silver' }]);
  assert.deepEqual(vipEntries({ entries: [...w.entries, ...vipEntries(w, nov)] }, nov), []);
  // Months before VIP began are never paid.
  assert.equal(VIP.from, '2026-10');
  // Every rate stays well under the house's smallest cut (a single keeps 13.6%).
  assert.ok(VIP.tiers.every(t => t.back <= 0.015));
});

test('no welcome free bet any more (台灣運彩 gives none): a first paid bet brings nothing', async () => {
  const now = Date.UTC(2026, 9, 21, 4);
  const bet = { id: 'odds:stake-a', t: now, app: 'odds', kind: 'stake', amount: -500 };
  const t = setup();
  const acct = await newPass(t, 'odds');
  const w = await t.call('PATCH', `${t.qt(acct.token)}&app=odds`, { wallet: { entries: [{ ...bet, t: 1_700_000_100_000 }] } });
  assert.equal(w.status, 200);
  assert.ok(!w.data.wallet.entries.some(e => e.id === 'eco:fb:welcome'));
});

test('wealth levels: each level reached pays its reward once, from what the account is worth', () => {
  const now = Date.UTC(2026, 9, 21, 3);
  const at = (amount, holdings = 0, extra = []) => ({ entries: [{ id: 'eco:start', amount }, ...extra], snap: { stock: { cash: 0, held: holdings } } });
  // The opening money alone is the start: no level, no reward.
  assert.deepEqual(rankEntries(at(200_000), now), []);
  assert.deepEqual(rankEntries(at(290_000), now), []);
  // 350,000 in cash and 200,000 in shares: worth 550,000, two levels at once.
  assert.deepEqual(rankEntries(at(350_000, 200_000), now).map(e => [e.id, e.amount, e.kind]), [['eco:rank:thrifty', 3_000, 'rank'], ['eco:rank:solid', 5_000, 'rank']]);
  // Paid already, or fallen back: nothing again.
  assert.deepEqual(rankEntries(at(600_000, 0, [{ id: 'eco:rank:thrifty', app: 'eco', kind: 'rank', amount: 3_000 }, { id: 'eco:rank:solid', app: 'eco', kind: 'rank', amount: 5_000 }]), now), []);
  assert.equal(RANKS.length, 7);
  // In the payday's entries, after the pay.
  assert.ok(paydayEntries({ entries: [{ id: 'eco:start', amount: 295_000 }] }, now).some(e => e.id === 'eco:rank:thrifty'));
});

test('wealth levels rescaled: what the old levels paid counts towards the new rewards, never paid twice', () => {
  const now = Date.UTC(2026, 9, 21, 3);
  const old = (id, amount) => ({ id: `eco:rank:${id}`, t: 1, app: 'eco', kind: 'rank', amount });
  // Opened at 200,000: the old saver and steady paid 3,000 between them.
  const w = { entries: [{ id: 'eco:start', amount: 310_000 }, old('saver', 1_000), old('steady', 2_000)] };
  // So the first new level pays nothing more, but is reached.
  assert.deepEqual(rankEntries(w, now).map(e => [e.id, e.amount]), [['eco:rank:thrifty', 0]]);
  const w2 = { entries: [...w.entries, ...rankEntries(w, now), { id: 'win', amount: 200_000 }] };
  assert.deepEqual(rankEntries(w2, now).map(e => [e.id, e.amount]), [['eco:rank:solid', 5_000]]);
  // A rich old account: 19,000 from the old levels up to a million, spread over the new ones.
  const rich = { entries: [{ id: 'eco:start', amount: 1_200_000 }, old('saver', 1_000), old('steady', 2_000), old('comfort', 3_000), old('wealthy', 5_000), old('rich', 8_000)] };
  assert.deepEqual(rankEntries(rich, now).map(e => [e.id, e.amount]), [['eco:rank:thrifty', 0], ['eco:rank:solid', 0], ['eco:rank:welloff', 0]]);
  // 19,000 against 18,000 of new rewards: 1,000 still counts against the next.
  const richer = { entries: [...rich.entries, ...rankEntries(rich, now), { id: 'win', amount: 2_000_000 }] };
  assert.deepEqual(rankEntries(richer, now).map(e => [e.id, e.amount]), [['eco:rank:affluent', 19_000]]);
});

test('setting ECO_TOKEN_SECRET signs nobody out: tokens signed the old way (from the Firebase key) still read', async () => {
  const { tokenSecret, signToken, readToken } = await import('../quadra-token.js');
  const before = { FIREBASE_PRIVATE_KEY: 'k' };
  const old = await signToken(await tokenSecret(before), { k: 'ref', d: 'd', s: 's', e: Date.now() + 60_000 });
  const after = { FIREBASE_PRIVATE_KEY: 'k', ECO_TOKEN_SECRET: 'new-secret' };
  const secret = await tokenSecret(after);
  assert.equal(secret, 'new-secret');
  assert.ok(await readToken(secret, old, 'ref'), 'an old sign-in still reads');
  assert.ok(await readToken(secret, await signToken(secret, { k: 'ref', e: Date.now() + 60_000 }), 'ref'));
  assert.equal(await readToken('other', old, 'ref'), null);
});

test('passes are handed out by the owner: no one makes one from an app; the owner issues them in a batch', async () => {
  const t = setup();
  t.env.ECO_OPEN_SIGNUP = '';
  const closed = await t.call('POST', '', { op: 'create', app: 'stock' });
  assert.equal(closed.status, 403);
  assert.match(JSON.stringify(closed.data), /ECO_CREATE_CLOSED/);
  const refused = await t.call('POST', '', { op: 'admin', token: 'x'.repeat(40), action: 'issue', count: 3 });
  assert.equal(refused.status, 403);
  const issued = await t.call('POST', '', { op: 'admin', token: 'o'.repeat(40), action: 'issue', count: 3 });
  assert.equal(issued.status, 200);
  assert.equal(issued.data.passes.length, 3);
  assert.equal(new Set(issued.data.passes).size, 3);
  for (const code of issued.data.passes) {
    assert.match(code, /^[2-9A-HJ-NP-Z]{10}$/);
    const signed = await t.call('POST', '', { op: 'login', passcode: code, app: 'stock' });
    assert.equal(signed.status, 200, 'an issued pass signs in');
  }
});

test('the admin panel: an overview, an account in full, money by hand, sign-out, an unused pass taken back', async () => {
  const t = setup();
  const admin = (action, extra = {}) => t.call('POST', '', { op: 'admin', token: 'o'.repeat(40), action, ...extra });
  const acct = await newPass(t);
  const unused = (await admin('issue', { count: 1 })).data.passes[0];
  const wallets = (await admin('wallets')).data.wallets;
  const ref = wallets.find(w => w.lastUsed).ref;
  const idle = wallets.find(w => !w.lastUsed).ref;
  // The overview.
  const ov = await admin('overview');
  assert.equal(ov.status, 200);
  assert.equal(ov.data.accounts, 2);
  assert.equal(ov.data.used, 1);
  assert.equal(ov.data.active.day, 1);
  assert.equal(ov.data.days.length, 14);
  assert.equal(ov.data.money.total, acct.pool);
  // One account.
  const one = await admin('wallet', { wallet: ref });
  assert.equal(one.status, 200);
  assert.equal(one.data.balance, acct.pool);
  assert.ok(one.data.apps.some(a => a.app === 'stock'));
  assert.equal((await admin('wallet', { wallet: 'zz' })).status, 404, 'a reference too short names nobody');
  // Money by hand: needs a reason; lands as an 'eco' entry.
  assert.equal((await admin('grant', { wallet: ref, amount: 500 })).status, 400);
  const g = await admin('grant', { wallet: ref, amount: 500, note: '比賽獎金' });
  assert.equal(g.status, 200);
  assert.equal(g.data.balance, acct.pool + 500);
  assert.equal((await admin('grant', { wallet: ref, amount: -200, note: '更正' })).data.balance, acct.pool + 300);
  // Plus is gone: no tool gives it.
  assert.notEqual((await admin('plus', { wallet: ref, months: 3 })).status, 200);
  // Every device signed out: the session stops working.
  assert.equal((await t.call('GET', `${t.qt(acct.token)}&app=stock`)).status, 200);
  assert.equal((await admin('signout', { wallet: ref })).status, 200);
  assert.equal((await t.call('GET', `${t.qt(acct.token)}&app=stock`)).status, 401);
  // A pass in use can't be taken back; a never-used one can, and stops working.
  assert.equal((await admin('remove', { wallet: ref })).status, 409);
  assert.equal((await admin('remove', { wallet: idle })).status, 200);
  assert.equal((await t.call('POST', '', { op: 'login', passcode: unused, app: 'stock' })).status, 404);
});

test('the admin panel: an account found by its pass, a record undone, one app cleared, an export, an account deleted', async () => {
  const t = setup();
  const admin = (action, extra = {}) => t.call('POST', '', { op: 'admin', token: 'o'.repeat(40), action, ...extra });
  const acct = await newPass(t);
  const other = await newPass(t, 'odds');
  await t.call('PATCH', `${t.qt(acct.token)}&app=stock`, { payload: 'gz1:abc', wallet: { entries: [{ id: 'stock:1', t: 1, app: 'stock', kind: 'fee', amount: -30 }] } });
  // Found by the pass someone reads out (dashes and lower case all right).
  const found = await admin('find', { passcode: `${acct.passcode.slice(0, 5).toLowerCase()}-${acct.passcode.slice(5)}` });
  assert.equal(found.status, 200);
  const ref = found.data.ref;
  assert.equal(ref.length, 8);
  assert.equal((await admin('find', { passcode: 'ZZZZZZZZZZ' })).status, 404);
  // A record undone, once.
  const before = (await admin('wallet', { wallet: ref })).data;
  const div = before.recent.find(e => e.id === 'stock:1');
  assert.ok(div && !div.undone);
  const u = await admin('undo', { wallet: ref, entry: 'stock:1' });
  assert.equal(u.status, 200);
  assert.equal(u.data.balance, before.balance + 30);
  assert.equal((await admin('undo', { wallet: ref, entry: 'stock:1' })).status, 409, 'not twice');
  assert.ok((await admin('wallet', { wallet: ref })).data.recent.find(e => e.id === 'stock:1').undone);
  // An export: the wallet and each app's document.
  const ex = await admin('export', { wallet: ref });
  assert.equal(ex.status, 200);
  assert.ok(ex.data.wallet.entries.length && 'stock' in ex.data.apps);
  // One app cleared: its data gone, the money stays, devices signed out.
  const c = await admin('clear-app', { wallet: ref, app: 'stock' });
  assert.equal(c.status, 200);
  assert.ok(!c.data.apps.includes('stock'));
  assert.equal((await admin('wallet', { wallet: ref })).data.balance, before.balance + 30);
  assert.equal((await t.call('GET', `${t.qt(acct.token)}&app=stock`)).status, 401, 'signed out');
  // Deleted: needs the full reference typed; then everything of it is gone.
  assert.equal((await admin('delete', { wallet: ref })).status, 400);
  assert.equal((await admin('delete', { wallet: ref, confirm: ref.slice(0, 6) })).status, 400);
  const fullId = [...t.store.keys()].find(k => k.startsWith(`${WALLET_COLLECTION}/${ref}`)).split('/')[1];
  t.store.set(`${SHARE_COLLECTION}/k1`, { payload: JSON.stringify({ owner: fullId, exp: Date.now() + 1e9 }), updateTime: 'x' });
  const d = await admin('delete', { wallet: ref, confirm: ref });
  assert.equal(d.status, 200);
  assert.equal(d.data.shares, 1);
  assert.ok(![...t.store.keys()].some(k => k.includes(fullId)), 'nothing of it left');
  assert.equal((await t.call('POST', '', { op: 'login', passcode: acct.passcode, app: 'stock' })).status, 404, 'its pass opens nothing');
  assert.equal((await admin('wallets')).data.wallets.length, 1, 'the other account untouched');
  assert.ok(other.token);
});

test('the lock-down: an app adds no money to the pool (the Worker does), not even a refund', async () => {
  const t = setup();
  // (The clock after the lock-down.)
  t.advance(Date.parse('2026-10-13T00:00:00Z') - 1_700_000_000_000);
  const acct = await newPass(t, 'odds');
  acct.docId = await t.deps.sha256Hex(acct.passcode);
  const send = entries => t.call('PATCH', `${t.qt(acct.token)}&app=odds`, { wallet: { entries } });
  const before = Date.parse('2026-10-10T00:00:00Z');
  const w = await send([
    { id: 'odds:payout-forged', t: 2, app: 'odds', kind: 'payout', amount: 1_000_000 },
    { id: 'odds:prize-forged', t: 2, app: 'odds', kind: 'prize', amount: 50_000 },
    { id: 'odds:stake-old', t: before, app: 'odds', kind: 'stake', amount: -300 },
    { id: 'odds:stake-new', t: Date.parse('2026-10-13T00:00:00Z'), app: 'odds', kind: 'stake', amount: -300 }
  ]);
  assert.equal(w.status, 200);
  assert.equal(w.data.pool, acct.pool - 600);
  // The phone's date isn't the entry's: dated before the lock-down, it's still new.
  assert.ok(w.data.wallet.entries.filter(e => e.id.startsWith('odds:stake-')).every(e => e.t > before));
  const r0 = await send([{ id: 'odds:refund-old', t: 3, app: 'odds', kind: 'refund', amount: 300 }]);
  assert.equal(r0.data.pool, acct.pool - 600);
  // Not even for a stake really in the wallet from before.
  const doc = t.store.get(`eco-wallets/${acct.docId}`);
  const wallet = JSON.parse(doc.payload);
  wallet.entries.push({ id: 'odds:stake-older', t: before, app: 'odds', kind: 'stake', amount: -300 });
  t.store.set(`eco-wallets/${acct.docId}`, { ...doc, payload: JSON.stringify(wallet) });
  const r = await send([
    { id: 'odds:refund-older', t: 3, app: 'odds', kind: 'refund', amount: 300 },
    { id: 'odds:refund-new', t: 3, app: 'odds', kind: 'refund', amount: 300 }
  ]);
  assert.equal(r.data.pool, acct.pool - 900);
});

test('a save and an inbox drop as a plain POST (one request, no preflight): the same as PATCH and DELETE; a drop never deletes more', async () => {
  const t = setup();
  const a = await newPass(t, 'stock');
  const w = await t.call('POST', '?app=stock', { op: 'write', qt: a.token, payload: 'gz1:posted' });
  assert.equal(w.status, 200);
  assert.ok(w.data.updateTime && w.data.token);
  assert.equal((await t.call('GET', `${t.qt(w.data.token)}&app=stock`)).data.payload, 'gz1:posted');
  assert.equal((await t.call('POST', '?app=stock', { op: 'write', qt: 'forged', payload: 'gz1:x' })).status, 401);
  // An item in the inbox (another pass merged in), dropped by POST.
  const b = await newPass(t, 'stock');
  await t.call('POST', '?app=stock', { op: 'write', qt: b.token, payload: 'gz1:b' });
  const aa = await t.call('POST', '', { op: 'refresh', refresh: a.refresh, app: 'stock', claim: true });
  const m = await t.call('POST', '', { op: 'merge', qt: aa.data.token, sources: [{ passcode: b.passcode }] });
  const id = m.data.wallet.inbox.stock[0];
  assert.equal((await t.call('POST', '?app=stock', { op: 'drop-inbox', qt: aa.data.token })).status, 400, 'no item: nothing deleted');
  assert.equal((await t.call('GET', `${t.qt(aa.data.token)}&app=stock`)).data.payload, 'gz1:posted', "the app's data still there");
  assert.equal((await t.call('POST', '?app=stock', { op: 'drop-inbox', qt: aa.data.token, inbox: id })).status, 200);
  const after = await t.call('GET', `${t.qt(aa.data.token)}&app=stock&inbox=1`);
  assert.deepEqual(after.data.wallet.inbox?.stock || [], []);
});

test("a save of an app's data alone doesn't rewrite the wallet (unless its last use is 10 minutes old, or the wallet has news)", async () => {
  const t = setup();
  const a = await newPass(t, 'vocab');
  let walletWrites = 0;
  const fsWrite = t.deps.fsWrite;
  t.deps.fsWrite = (env, collection, ...rest) => (collection === 'eco-wallets' && walletWrites++, fsWrite(env, collection, ...rest));
  await t.call('POST', '?app=vocab', { op: 'write', qt: a.token, payload: 'v:1' });
  const w1 = walletWrites;
  for (let i = 2; i < 5; i++) assert.equal((await t.call('POST', '?app=vocab', { op: 'write', qt: a.token, payload: `v:${i}` })).status, 200);
  assert.equal(walletWrites, w1, 'data alone: no wallet write');
  assert.equal((await t.call('GET', `${t.qt(a.token)}&app=vocab`)).data.payload, 'v:4');
  // An entry: written.
  await t.call('POST', '?app=vocab', { op: 'write', qt: a.token, payload: 'v:5', wallet: { settings: { x: { value: 1, t: 1 } } } });
  assert.equal(walletWrites, w1 + 1);
  // Ten minutes on: the last use noted again.
  t.advance(11 * 60_000);
  await t.call('POST', '?app=vocab', { op: 'write', qt: a.token, payload: 'v:6' });
  assert.equal(walletWrites, w1 + 2);
});

test('a read that says which wallet it holds (w) gets no wallet back while it is the same; a changed one comes whole', async () => {
  const t = setup();
  const a = await newPass(t, 'vocab');
  const first = await t.call('GET', `${t.qt(a.token)}&app=vocab`);
  assert.ok(first.data.wallet && first.data.walletTime);
  const again = await t.call('GET', `${t.qt(first.data.token)}&w=${encodeURIComponent(first.data.walletTime)}`);
  assert.equal(again.data.same, true);
  assert.equal(again.data.wallet, undefined);
  assert.ok(Number.isFinite(again.data.pool));
  await t.call('POST', '?app=vocab', { op: 'write', qt: again.data.token, payload: 'v', wallet: { settings: { x: { value: 1, t: 1 } } } });
  const changed = await t.call('GET', `${t.qt(again.data.token)}&w=${encodeURIComponent(first.data.walletTime)}`);
  assert.ok(changed.data.wallet && !changed.data.same);
  // A save of the data alone, the wallet as held: not sent back.
  const saved = await t.call('POST', '?app=vocab', { op: 'write', qt: changed.data.token, payload: 'v2', w: changed.data.walletTime });
  assert.equal(saved.data.same, true);
  assert.equal(saved.data.wallet, undefined);
});

test('a read or a wake claim that says which data it holds (since) gets { unchanged, updateTime } and no payload while it is the same; the claim takes w too', async () => {
  const t = setup();
  const a = await newPass(t, 'vocab');
  const saved = await t.call('POST', '?app=vocab', { op: 'write', qt: a.token, payload: 'v:1' });
  const held = saved.data.updateTime;
  assert.ok(held);
  const same = await t.call('GET', `${t.qt(saved.data.token)}&app=vocab&since=${encodeURIComponent(held)}`);
  assert.equal(same.data.unchanged, true);
  assert.equal(same.data.updateTime, held);
  assert.equal(same.data.payload, undefined);
  // No since (an older kit): the data, as before.
  const plain = await t.call('GET', `${t.qt(same.data.token)}&app=vocab`);
  assert.equal(plain.data.payload, 'v:1');
  assert.equal(plain.data.unchanged, undefined);
  // Changed since: the data comes whole.
  await t.call('POST', '?app=vocab', { op: 'write', qt: plain.data.token, payload: 'v:2' });
  const changed = await t.call('GET', `${t.qt(plain.data.token)}&app=vocab&since=${encodeURIComponent(held)}`);
  assert.equal(changed.data.payload, 'v:2');
  assert.equal(changed.data.unchanged, undefined);
  // The wake: one request, the claim with the data and the wallet as held.
  const now = changed.data.updateTime;
  const peek = await t.call('POST', '', { op: 'refresh', refresh: a.refresh, app: 'vocab' });
  const wake = await t.call('POST', '', { op: 'refresh', refresh: a.refresh, app: 'vocab', claim: true, data: true, since: now, w: peek.data.walletTime });
  assert.equal(wake.data.active, true);
  assert.equal(wake.data.unchanged, true);
  assert.equal(wake.data.updateTime, now);
  assert.equal(wake.data.payload, undefined);
  assert.equal(wake.data.same, true);
  assert.equal(wake.data.wallet, undefined);
  assert.ok(wake.data.token && wake.data.refresh);
  const stale = await t.call('POST', '', { op: 'refresh', refresh: wake.data.refresh, app: 'vocab', claim: true, data: true, since: held, w: 'old' });
  assert.equal(stale.data.payload, 'v:2');
  assert.ok(stale.data.wallet && !stale.data.same);
});

test("a big wallet's old entries fold into monthly sums: the same balance and sums, the Pass's own and Securities' kept, and no paid slip can be paid again", async () => {
  const { foldWallet, FOLD_AT, updateWallet } = await import('../eco.js');
  const now = Date.parse('2027-12-01T00:00:00Z');
  const DAY = 86_400_000;
  const entries = [
    { id: 'eco:start', t: now - 900 * DAY, app: 'eco', kind: 'start', amount: 100_000 },
    { id: 'eco:plus:2026-01', t: now - 700 * DAY, app: 'eco', kind: 'plus', amount: -99 },
    { id: 'stock:dep-1', t: now - 700 * DAY, app: 'stock', kind: 'deposit', amount: -5000 }
  ];
  // Slips: settled long ago (stake and payout), a lost one, and recent ones.
  for (let i = 0; i < 3000; i++) {
    const t = now - (900 - (i % 880)) * DAY;
    entries.push({ id: `odds:stake-s${i}`, t, app: 'odds', kind: 'stake', amount: -100 });
    if (i % 2) entries.push({ id: `odds:payout-s${i}`, t: t + DAY, app: 'odds', kind: 'payout', amount: 190 });
  }
  const w = { ...emptyWallet(now - 900 * DAY), entries };
  const before = poolBalance(w);
  const sums = x => x.entries.reduce((m, e) => ((m[`${e.app}:${e.kind}`] = Math.round(((m[`${e.app}:${e.kind}`] || 0) + e.amount) * 100) / 100), m), {});
  const folded = foldWallet(w, now);
  assert.ok(folded.entries.length < w.entries.length / 2, `${w.entries.length} → ${folded.entries.length}`);
  assert.equal(poolBalance(folded), before);
  assert.deepEqual(sums(folded), sums(w));
  for (const id of ['eco:start', 'eco:plus:2026-01', 'stock:dep-1']) assert.ok(folded.entries.some(e => e.id === id), id);
  // The settling guard (settle.js paySlip: pay only with the stake there and no payout yet) never opens again for a paid slip.
  const have = new Set(folded.entries.map(e => e.id));
  for (let i = 1; i < 3000; i += 2) assert.ok(!(have.has(`odds:stake-s${i}`) && !have.has(`odds:payout-s${i}`)), `slip s${i}`);
  // Folding again changes nothing; a save to a wallet past FOLD_AT folds it and goes through.
  assert.deepEqual(foldWallet(folded, now), folded);
  const big = { ...w, entries: [...w.entries, ...Array.from({ length: 3000 }, (_, i) => ({ id: `odds:stake-x${i}`, t: now - 500 * DAY, app: 'odds', kind: 'stake', amount: -1 }))] };
  assert.ok(JSON.stringify(big).length > FOLD_AT);
  let doc = { exists: true, payload: JSON.stringify(big), updateTime: 'v1' };
  const deps = { now: () => now, fsGet: async () => doc, fsWrite: async (env, c, id, text) => ((doc = { exists: true, payload: text, updateTime: 'v2' }), { updateTime: 'v2' }) };
  const r = await updateWallet({}, deps, 'acct', x => ({ ...x, entries: [...x.entries, { id: 'odds:stake-new', t: now, app: 'odds', kind: 'stake', amount: -10 }] }));
  assert.ok(doc.payload.length < FOLD_AT, `saved folded: ${doc.payload.length}`);
  assert.equal(poolBalance(r.wallet), Math.round((poolBalance(big) - 10) * 100) / 100);
});

test("a session writes its own app's data only: never another app's save or figures", async () => {
  const t = setup();
  const acct = await newPass(t, 'vocab');
  const other = await t.call('PATCH', `${t.qt(acct.token)}&app=stock`, { payload: 'gz1:forged', wallet: { snap: { stock: { t: 5, pl: { tw: 1e9 } } } } });
  assert.equal(other.status, 403);
  assert.ok(![...t.store.keys()].some(k => k.startsWith(ECO_APPS.stock.collection)));
  const posted = await t.call('POST', '?app=orbit', { op: 'write', qt: acct.token, payload: 'gz1:x' });
  assert.equal(posted.status, 403);
  // Its own: saved.
  assert.equal((await t.call('PATCH', `${t.qt(acct.token)}&app=vocab`, { payload: 'gz1:mine' })).status, 200);
});

test('op loan and relief: the Worker signs only what the account qualifies for', async () => {
  const t = setup();
  t.advance(Date.UTC(2026, 10, 4, 4) - 1_700_000_000_000);
  const acct = await newPass(t);
  // A brand-new pass waits 4 weeks for a loan.
  const early = await t.call('POST', '', { op: 'loan', qt: acct.token, action: 'borrow', amount: 100_000, weeks: 52 });
  assert.equal(early.status, 409);
  assert.equal(early.data.error.why, 'new');
  t.advance(29 * 86_400_000);
  const fresh = await t.call('POST', '', { op: 'refresh', refresh: acct.refresh, app: 'stock', claim: true });
  const qt = fresh.data.token;
  const before = fresh.data.pool;
  const big = await t.call('POST', '', { op: 'loan', qt, action: 'borrow', amount: 900_000, weeks: 52 });
  assert.equal(big.data.error.why, 'amount');
  const ok = await t.call('POST', '', { op: 'loan', qt, action: 'borrow', amount: 100_000, weeks: 52 });
  assert.equal(ok.status, 200);
  assert.equal(ok.data.pool, before + 100_000 - 3_000);
  // An app can't write the Worker's loan entries itself.
  assert.equal(cleanPatch({ entries: [{ id: 'eco:loanoff:x', t: 1, app: 'stock', kind: 'loanoff', amount: 0 }] }).entries.length, 0);
  const off = await t.call('POST', '', { op: 'loan', qt, action: 'payoff' });
  assert.equal(off.status, 200);
  assert.equal(off.data.pool, before - 3_000 - 2_000);
  // Relief: not with NT$200,000 in the account.
  const relief = await t.call('POST', '', { op: 'relief', qt });
  assert.equal(relief.data.error.why, 'worth');
});

