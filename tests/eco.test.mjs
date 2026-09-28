// /eco against an in-memory Firestore: no network, no real credentials.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { handleEcoRequest, mergeWallet, poolBalance, cleanPatch, emptyWallet, WALLET_COLLECTION, ECO_APPS } from '../eco.js';

function setup() {
  const store = new Map();
  let clock = 1_700_000_000_000;
  let n = 0;
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
    sha256Hex: async text => createHash('sha256').update(text).digest('hex'),
    generateCode: len => Array.from({ length: len }, (_, i) => '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'[(n * 7 + i * 3 + len) % 32]).join('') + '',
    now: () => (clock += 1000)
  };
  let codeN = 0;
  deps.generateCode = len => {
    codeN++;
    const a = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
    return Array.from({ length: len }, (_, i) => a[(codeN * 5 + i * 11) % 32]).join('');
  };
  const env = { FIREBASE_PROJECT_ID: 'p', FIREBASE_CLIENT_EMAIL: 'e', FIREBASE_PRIVATE_KEY: 'k' };
  const call = (method, query = '', body) => handleEcoRequest({ method, url: `https://w/eco${query}`, body }, env, {}, '1.1.1.1', deps);
  return { store, deps, call };
}

test('create, read and write an app with the shared wallet', async () => {
  const { call } = setup();
  const made = await call('POST', '?app=stock', { op: 'create', payload: 'gz1:abc' });
  assert.equal(made.status, 200);
  const code = made.data.passcode;
  assert.match(code, /^[2-9A-HJ-NP-Z]{10}$/);
  const read = await call('GET', `?passcode=${code}&app=stock`);
  assert.equal(read.data.exists, true);
  assert.equal(read.data.payload, 'gz1:abc');
  assert.ok(read.data.wallet.apps.stock.first);
  // Another app on the same code: no data yet, but the account exists.
  const odds = await call('GET', `?passcode=${code}&app=odds`);
  assert.equal(odds.data.exists, true);
  assert.equal(odds.data.payload, '');
  const w = await call('PATCH', `?passcode=${code}&app=odds`, {
    payload: 'gz1:odds',
    wallet: { entries: [{ id: 'odds:start', t: 1, app: 'odds', kind: 'start', amount: 10000 }], snap: { stock: { cash: 100000, t: 5 } } }
  });
  assert.equal(w.status, 200);
  assert.equal(w.data.pool, 110000);
  // The same entry again counts once.
  const again = await call('PATCH', `?passcode=${code}&app=odds`, { wallet: { entries: [{ id: 'odds:start', t: 1, app: 'odds', kind: 'start', amount: 99 }] } });
  assert.equal(again.data.pool, 110000);
  // Unknown passcode.
  assert.equal((await call('PATCH', `?passcode=ABCDEFGHJK&app=odds`, { wallet: {} })).status, 404);
  assert.equal((await call('GET', `?passcode=ABCDEFGHJK`)).data.exists, false);
});

test('an app cannot forge the Worker\'s own entries', () => {
  const p = cleanPatch({ entries: [{ id: 'x', t: 1, app: 'eco', kind: 'xfer-in', amount: 1e6 }, { id: 'y', t: 1, app: 'vocab', kind: 'reward', amount: 30 }] });
  assert.deepEqual(p.entries.map(e => e.id), ['y']);
});

test('wallet merge: entries by id, newest settings and figures', () => {
  const a = mergeWallet(emptyWallet(10), { entries: [{ id: 'a', t: 2, app: 'odds', amount: 5 }], settings: { limit: { value: 1, t: 1 } }, snap: { stock: { cash: 10, t: 1 } } });
  const b = mergeWallet(a, { entries: [{ id: 'a', t: 2, app: 'odds', amount: 7 }, { id: 'b', t: 1, app: 'vocab', amount: 3 }], settings: { limit: { value: 2, t: 3 } }, snap: { stock: { cash: 4, t: 0 } } });
  assert.deepEqual(b.entries.map(e => e.id), ['b', 'a']);
  assert.equal(b.settings.limit.value, 2);
  assert.equal(b.snap.stock.cash, 10);
  assert.equal(poolBalance(b), 18);
});

test('transfer moves money once, and not past the pool', async () => {
  const { call } = setup();
  const a = (await call('POST', '', { op: 'create', wallet: { entries: [{ id: 'vocab:1', t: 1, app: 'vocab', amount: 500 }] } })).data.passcode;
  const b = (await call('POST', '', { op: 'create' })).data.passcode;
  assert.equal((await call('POST', '', { op: 'transfer', passcode: a, to: b, amount: 900, id: 't1' })).data.error.code, 'ECO_INSUFFICIENT_FUNDS');
  const ok = await call('POST', '', { op: 'transfer', passcode: a, to: b, amount: 200, id: 't2', note: 'hi' });
  assert.equal(ok.data.pool, 300);
  await call('POST', '', { op: 'transfer', passcode: a, to: b, amount: 200, id: 't2' });
  const bw = await call('GET', `?passcode=${b}`);
  assert.equal(bw.data.pool, 200);
  assert.equal(bw.data.wallet.entries[0].kind, 'xfer-in');
  assert.equal((await call('GET', `?passcode=${a}`)).data.pool, 300);
  assert.equal((await call('POST', '', { op: 'transfer', passcode: a, to: 'ZZZZZZZZZZ', amount: 1, id: 't3' })).data.error.code, 'ECO_RECIPIENT_NOT_FOUND');
});

test('merge: old app codes and a Quadra Pass into a new one, then the old ones are gone', async () => {
  const { call, store, deps } = setup();
  // Two old Stock Study accounts and an old Odds Study one.
  const put = async (app, code, payload) => store.set(`${ECO_APPS[app].collection}/${await deps.sha256Hex(code)}`, { payload, updateTime: 'x' });
  await put('stock', 'AAAAAAAA', 'stock-1');
  await put('stock', 'BBBBBBBB', 'stock-2');
  await put('odds', 'CCCCCCCC', 'odds-1');
  const eco = (await call('POST', '?app=vocab', { op: 'create', payload: 'vocab-1', wallet: { entries: [{ id: 'vocab:r1', t: 1, app: 'vocab', amount: 40 }, { id: 'odds:start', t: 1, app: 'odds', amount: 10000 }], snap: { stock: { cash: 5, t: 1 } } } })).data.passcode;
  const res = await call('POST', '', {
    op: 'merge',
    sources: [
      { app: 'stock', passcode: 'aaaa-aaaa' },
      { app: 'stock', passcode: 'BBBBBBBB' },
      { app: 'odds', passcode: 'CCCCCCCC' },
      { app: 'eco', passcode: eco }
    ]
  });
  assert.equal(res.status, 200, JSON.stringify(res.data));
  assert.deepEqual(res.data.moved, { stock: 2, odds: 1, vocab: 1 });
  const code = res.data.passcode;
  const stock = await call('GET', `?passcode=${code}&app=stock&inbox=1`);
  assert.equal(stock.data.payload, 'stock-1');
  assert.deepEqual(stock.data.inbox.map(i => i.payload), ['stock-2']);
  // Vocab rewards carried under a new id; the odds ledger entry is left for
  // the app to republish; the stock figure carried as one entry (its data
  // didn't come along).
  const entries = stock.data.wallet.entries;
  assert.ok(entries.some(e => e.app === 'vocab' && e.amount === 40 && e.id.endsWith(':vocab:r1')));
  assert.ok(!entries.some(e => e.app === 'odds'));
  assert.ok(entries.some(e => e.kind === 'merge' && e.amount === 5));
  // The sources are gone.
  for (const c of ['AAAAAAAA', 'BBBBBBBB', 'CCCCCCCC']) for (const app of ['stock', 'odds']) assert.equal(store.has(`${ECO_APPS[app].collection}/${await deps.sha256Hex(c)}`), false);
  assert.equal((await call('GET', `?passcode=${eco}`)).data.exists, false);
  // Folding the inbox in: the app deletes the item.
  await call('DELETE', `?passcode=${code}&app=stock&inbox=${stock.data.inbox[0].id}`);
  assert.equal((await call('GET', `?passcode=${code}&app=stock&inbox=1`)).data.inbox.length, 0);
  // A missing source stops the merge before anything is written.
  const bad = await call('POST', '', { op: 'merge', sources: [{ app: 'odds', passcode: 'DDDDDDDD' }] });
  assert.equal(bad.status, 404);
  assert.equal(bad.data.error.index, 0);
});

test('deleting the account removes everything', async () => {
  const { call, store } = setup();
  const code = (await call('POST', '?app=odds', { op: 'create', payload: 'o' })).data.passcode;
  await call('PATCH', `?passcode=${code}&app=stock`, { payload: 's' });
  await call('DELETE', `?passcode=${code}`);
  assert.equal(store.size, 0);
  assert.ok(![...store.keys()].some(k => k.startsWith(WALLET_COLLECTION)));
});

// ---- v2: sessions, one live app, handoff, rotate, Orbit sharing ----------------

import { paydayEntries, PAY, LINK_COLLECTION } from '../eco.js';

async function v2Account(t) {
  const made = await t.call('POST', '?app=stock', { op: 'create', v2: true });
  assert.equal(made.status, 200);
  return made.data;
}

test('v2 create: opening money from the Worker, signed in, live', async () => {
  const t = setup();
  const acct = await v2Account(t);
  assert.ok(acct.token && acct.refresh);
  assert.equal(acct.active, true);
  assert.ok(acct.pool >= PAY.start);
  assert.equal(acct.wallet.sec, undefined);
  const read = await t.call('GET', `?qt=${encodeURIComponent(acct.token)}&app=stock`);
  assert.equal(read.status, 200);
  assert.equal(read.data.active, true);
  assert.ok(read.data.token);
});

test('one app at a time: another app claiming makes the first read-only', async () => {
  const t = setup();
  const acct = await v2Account(t);
  const play = await t.call('POST', '', { op: 'refresh', refresh: acct.refresh, app: 'odds', claim: true });
  assert.equal(play.status, 200);
  assert.equal(play.data.active, true);
  // Securities is no longer live: reads say so, writes are refused.
  const read = await t.call('GET', `?qt=${encodeURIComponent(acct.token)}`);
  assert.equal(read.data.active, false);
  assert.equal(read.data.live.app, 'odds');
  assert.equal(read.data.token, undefined);
  const write = await t.call('PATCH', `?qt=${encodeURIComponent(acct.token)}&app=stock`, { payload: 'gz1:x' });
  assert.equal(write.status, 409);
  assert.equal(write.data.error.code, 'ECO_SESSION_MOVED');
  // Without claim, a refresh only reports where it's live.
  const peek = await t.call('POST', '', { op: 'refresh', refresh: acct.refresh, app: 'stock' });
  assert.equal(peek.data.active, false);
  // Claiming back.
  const back = await t.call('POST', '', { op: 'refresh', refresh: acct.refresh, app: 'stock', claim: true });
  assert.equal(back.data.active, true);
  const ok = await t.call('PATCH', `?qt=${encodeURIComponent(back.data.token)}&app=stock`, { payload: 'gz1:y' });
  assert.equal(ok.status, 200);
});

test('login with the pass; a bad token or pass is refused', async () => {
  const t = setup();
  const acct = await v2Account(t);
  const login = await t.call('POST', '', { op: 'login', passcode: acct.passcode, app: 'vocab' });
  assert.equal(login.status, 200);
  assert.ok(login.data.refresh);
  assert.equal((await t.call('POST', '', { op: 'login', passcode: 'ABCDEFGHJK', app: 'vocab' })).status, 404);
  assert.equal((await t.call('GET', '?qt=nope.nope')).status, 401);
  const forged = login.data.token.split('.')[0] + '.AAAA';
  assert.equal((await t.call('GET', `?qt=${forged}`)).status, 401);
});

test('sign out everywhere: every earlier token stops working', async () => {
  const t = setup();
  const acct = await v2Account(t);
  assert.equal((await t.call('POST', '', { op: 'signout-all', qt: acct.token })).status, 200);
  assert.equal((await t.call('GET', `?qt=${encodeURIComponent(acct.token)}`)).status, 401);
  assert.equal((await t.call('POST', '', { op: 'refresh', refresh: acct.refresh, app: 'stock', claim: true })).status, 401);
  // The pass itself still signs in.
  assert.equal((await t.call('POST', '', { op: 'login', passcode: acct.passcode, app: 'stock' })).status, 200);
});

test('handoff: the pass sealed for a link, redeemed once opened', async () => {
  const t = setup();
  const acct = await v2Account(t);
  const h = await t.call('POST', '', { op: 'handoff', qt: acct.token, passcode: acct.passcode });
  assert.equal(h.status, 200);
  assert.ok(!h.data.handoff.includes(acct.passcode));
  const r = await t.call('POST', '', { op: 'redeem', handoff: h.data.handoff });
  assert.equal(r.data.passcode, acct.passcode);
  // Someone else's pass can't be sealed with this session.
  assert.equal((await t.call('POST', '', { op: 'handoff', qt: acct.token, passcode: 'ABCDEFGHJK' })).status, 400);
});

test('payday: a month and a week once, from the cut-over on', () => {
  const oct = Date.UTC(2026, 9, 7, 3);
  const due = paydayEntries({ entries: [] }, oct).map(e => e.id);
  assert.deepEqual(due, ['eco:pay:2026-10', 'eco:week:2026-10-05']);
  assert.deepEqual(paydayEntries({ entries: due.map(id => ({ id })) }, oct), []);
  // Before it, the apps still paid their own.
  assert.deepEqual(paydayEntries({ entries: [] }, Date.UTC(2026, 8, 20)), []);
});

test('rotate: a new pass holds everything, the old one is gone', async () => {
  const t = setup();
  const acct = await v2Account(t);
  await t.call('PATCH', `?qt=${encodeURIComponent(acct.token)}&app=stock`, { payload: 'gz1:mine' });
  const r = await t.call('POST', '', { op: 'rotate', passcode: acct.passcode });
  assert.equal(r.status, 200);
  assert.notEqual(r.data.passcode, acct.passcode);
  assert.equal((await t.call('GET', `?passcode=${acct.passcode}`)).data.exists, false);
  const read = await t.call('GET', `?passcode=${r.data.passcode}&app=stock`);
  assert.equal(read.data.payload, 'gz1:mine');
  assert.equal(read.data.pool, acct.pool);
});

test('Orbit: the old sync code merges into a pass with its manager passcode', async () => {
  const t = setup();
  const acct = await v2Account(t);
  const hash = (await t.deps.sha256Hex('MGRPASS1'));
  t.store.set('orbit-schedules/QRST2345', { payload: '[ORBIT]abc', updateTime: 'o1', managerPasscodeHash: hash });
  const bad = await t.call('POST', '', { op: 'merge', qt: acct.token, sources: [{ app: 'orbit', passcode: 'QRST2345', manager: 'WRONG' }] });
  assert.equal(bad.status, 403);
  const ok = await t.call('POST', '', { op: 'merge', qt: acct.token, sources: [{ app: 'orbit', passcode: 'QRST2345', manager: 'MGRPASS1' }] });
  assert.equal(ok.status, 200);
  assert.equal(ok.data.passcode, undefined);
  const read = await t.call('GET', `?qt=${encodeURIComponent(acct.token)}&app=orbit`);
  assert.equal(read.data.payload, '[ORBIT]abc');
  // The old code keeps working for devices still on it.
  assert.ok(t.store.has('orbit-schedules/QRST2345'));
});

test('Orbit sharing: a key lets another pass follow, only until revoked', async () => {
  const t = setup();
  const owner = await v2Account(t);
  const ownerOrbit = (await t.call('POST', '', { op: 'refresh', refresh: owner.refresh, app: 'orbit', claim: true })).data;
  await t.call('PATCH', `?qt=${encodeURIComponent(ownerOrbit.token)}&app=orbit`, { payload: '[ORBIT]sched' });
  const share = await t.call('POST', '', { op: 'share-create', qt: ownerOrbit.token });
  assert.equal(share.status, 200);
  assert.match(share.data.key, /^[2-9A-HJ-NP-Z]{8}$/);
  const friend = await v2Account(t);
  const got = await t.call('POST', '', { op: 'share-redeem', qt: friend.token, key: share.data.key });
  assert.equal(got.status, 200);
  assert.equal(got.data.payload, '[ORBIT]sched');
  assert.equal(got.data.own, false);
  // The owner edits: the follower sees it.
  await t.call('PATCH', `?qt=${encodeURIComponent(ownerOrbit.token)}&app=orbit`, { payload: '[ORBIT]v2' });
  const follow = await t.call('POST', '', { op: 'follow', qt: friend.token, link: got.data.link });
  assert.equal(follow.data.payload, '[ORBIT]v2');
  // A second key reuses the same link.
  const again = await t.call('POST', '', { op: 'share-create', qt: ownerOrbit.token });
  const got2 = await t.call('POST', '', { op: 'share-redeem', qt: friend.token, key: again.data.key });
  assert.equal(got2.data.link, got.data.link);
  // Revoked: gone for every follower.
  await t.call('POST', '', { op: 'share-revoke', qt: ownerOrbit.token });
  assert.equal((await t.call('POST', '', { op: 'follow', qt: friend.token, link: got.data.link })).status, 404);
  assert.ok(![...t.store.keys()].some(k => k.startsWith(`${LINK_COLLECTION}/`)));
});
