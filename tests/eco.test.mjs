// /eco against an in-memory Firestore: no network, no real credentials.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { handleEcoRequest, mergeWallet, poolBalance, cleanPatch, emptyWallet, paydayEntries, payFor, worthOf, PAY_MONTH, REBASE, OVERDRAFT_RATE, plusJoinEntry, plusJoinEntries, plusMember, plusLapsed, HUB_XP, plusBonusEntries, bonusBetId, vipEntries, vipStakes, vipTier, welcomeEntries, VIP, tidyWallet, PAY, PLUS, WALLET_COLLECTION, INBOX_COLLECTION, SHARE_COLLECTION, ECO_APPS, rankEntries, RANKS } from '../eco.js';
import { planClean } from '../eco-admin.js';

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
  const env = { FIREBASE_PROJECT_ID: 'p', FIREBASE_CLIENT_EMAIL: 'e', FIREBASE_PRIVATE_KEY: 'k' };
  const call = (method, query = '', body) => handleEcoRequest({ method, url: `https://w/eco${query}`, body }, env, {}, '1.1.1.1', deps);
  const qt = token => `?qt=${encodeURIComponent(token)}`;
  return { store, deps, call, qt, advance: ms => (clock += ms) };
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
  const w = await t.call('PATCH', `${t.qt(acct.token)}&app=stock`, { payload: 'gz1:abc', wallet: { entries: [{ id: 'match:1', t: 1, app: 'match', kind: 'reward', amount: 30 }], snap: { stock: { cash: -1000, t: 5 } } } });
  assert.equal(w.status, 200);
  assert.equal(w.data.pool, acct.pool + 30 - 1000);
  const again = await t.call('PATCH', `${t.qt(acct.token)}&app=stock`, { wallet: { entries: [{ id: 'match:1', t: 1, app: 'match', kind: 'reward', amount: 99 }] } });
  assert.equal(again.data.pool, w.data.pool);
  const read = await t.call('GET', `${t.qt(acct.token)}&app=stock`);
  assert.equal(read.data.payload, 'gz1:abc');
  assert.equal((await t.call('GET', `?passcode=${acct.passcode}&app=stock`)).status, 401);
  assert.equal((await t.call('GET', '?qt=nope.nope')).status, 401);
  const forged = acct.token.split('.')[0] + '.AAAA';
  assert.equal((await t.call('GET', `?qt=${forged}`)).status, 401);
});

test("an app cannot forge the Worker's own entries", () => {
  const p = cleanPatch({ entries: [{ id: 'x', t: 1, app: 'eco', kind: 'xfer-in', amount: 1e6 }, { id: 'y', t: 1, app: 'match', kind: 'reward', amount: 30 }] });
  assert.deepEqual(p.entries.map(e => e.id), ['y']);
});

test("Hub purchases pay at least their price; a free card, boost or pack is dropped", () => {
  const e = (id, amount, kind = 'shop') => ({ id, t: 1, app: 'vocab', kind, amount });
  const p = cleanPatch({
    entries: [
      e('vocab:shop:freeze:a', -300), e('vocab:shop:freeze:b', 0), e('vocab:shop:boost:c', -150), e('vocab:shop:boost:d', -1),
      e('vocab:shop:pack:toeic', -990), e('vocab:shop:pack:ielts', -1_490), e('vocab:shop:pack:biz', -500), e('vocab:shop:pack:x', -5000),
      e('vocab:shop:freeze:e', -300, 'game'), { id: 'odds:shop:freeze:f', t: 1, app: 'odds', kind: 'shop', amount: -300 }, e('vocab:g:1', 20, 'game')
    ]
  });
  // Hub's paid word packs meet the full price; game points and discounted packs are rejected.
  assert.deepEqual(p.entries.map(x => x.id), ['vocab:shop:freeze:a', 'vocab:shop:boost:c', 'vocab:shop:pack:toeic', 'vocab:shop:pack:ielts', 'odds:shop:freeze:f']);
});

test('Hub points are for vocabulary only, never money or game rewards', () => {
  const v = (id, amount, extra = {}) => ({ id, t: 1, app: 'vocab', kind: 'words', amount, ...extra });
  const p = cleanPatch({
    entries: [
      { id: 'vocab:g:paid', t: 1, app: 'vocab', kind: 'game', amount: 20 },
      { id: 'vocab:g:xp', t: 1, app: 'vocab', kind: 'game', amount: 0, xp: 40 },
      { id: 'vocab:m:2026-10-01:game1', t: 1, app: 'vocab', kind: 'mission', amount: 0, xp: 10 },
      v('vocab:w:word', 0, { xp: 40 }), v('vocab:w:big', 0, { xp: 1e9 }), v('vocab:w:bad', 0, { xp: 'x' }),
      v('vocab:fb:1', 0, { kind: 'freebet', note: '100' }), { id: 'o', t: 1, app: 'odds', kind: 'win', amount: 50, xp: 5 }
    ]
  });
  assert.deepEqual(
    p.entries.map(x => [x.id, x.amount, x.xp]),
    [['vocab:w:word', 0, 40], ['vocab:w:big', 0, 10_000], ['vocab:w:bad', 0, undefined], ['o', 50, undefined]]
  );
  const kept = mergeWallet({ ...emptyWallet(1), entries: [{ id: 'vocab:w:old', t: 1, app: 'vocab', kind: 'words', amount: 120 }] }, cleanPatch({ entries: [{ id: 'vocab:g:new', t: 2, app: 'vocab', kind: 'game', amount: 30 }] }));
  assert.equal(poolBalance(kept), 120);
});

test('wallet merge: entries by id, newest settings and figures', () => {
  const a = mergeWallet(emptyWallet(10), { entries: [{ id: 'a', t: 2, app: 'odds', amount: 5 }], settings: { k: { value: 1, t: 1 } }, snap: { stock: { cash: 10, t: 1 } } });
  const b = mergeWallet(a, { entries: [{ id: 'a', t: 2, app: 'odds', amount: 7 }, { id: 'b', t: 1, app: 'vocab', amount: 3 }], settings: { k: { value: 2, t: 3 } }, snap: { stock: { cash: 4, t: 0 } } });
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

test('payday: once a month, from the cut-over on', () => {
  const oct = Date.UTC(2026, 9, 7, 3);
  const due = paydayEntries({ entries: [] }, oct).map(e => e.id);
  assert.deepEqual(due, ['eco:pay:2026-10']);
  assert.equal(paydayEntries({ entries: [] }, oct)[0].amount, 6_000);
  assert.deepEqual(paydayEntries({ entries: [...due.map(id => ({ id, amount: 6_000 })), { id: 'eco:rebase:v3', t: 1, app: 'eco', kind: 'rebase', amount: 0 }] }, oct), []);
  assert.deepEqual(paydayEntries({ entries: [] }, Date.UTC(2026, 8, 20)), []);
  // Back pay: months nobody opened an app are paid the next time.
  const made = Date.UTC(2026, 8, 1);
  assert.deepEqual(paydayEntries({ created: made, entries: [{ id: 'eco:pay:2026-10', amount: 6_000 }, { id: 'eco:rebase:v3', t: 1, app: 'eco', kind: 'rebase', amount: 0 }] }, Date.UTC(2027, 0, 5)).map(e => e.id), ['eco:pay:2026-11', 'eco:pay:2026-12', 'eco:pay:2027-01']);
  // Not for months before the pass was made.
  assert.deepEqual(paydayEntries({ created: Date.UTC(2026, 11, 3), entries: [] }, Date.UTC(2027, 0, 5)).map(e => e.id), ['eco:pay:2026-12', 'eco:pay:2027-01']);
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
  await t.call('PATCH', `${t.qt(b.token)}&app=stock`, { payload: 'gz1:b', wallet: { entries: [{ id: 'match:x', t: 1, app: 'match', kind: 'reward', amount: 40 }] } });
  const aa = await t.call('POST', '', { op: 'refresh', refresh: a.refresh, app: 'stock', claim: true });
  const m = await t.call('POST', '', { op: 'merge', qt: aa.data.token, sources: [{ passcode: b.passcode }] });
  assert.equal(m.status, 200);
  assert.deepEqual(m.data.moved, { stock: 1 });
  assert.equal(m.data.wallet.inbox.stock.length, 1);
  assert.ok(m.data.wallet.entries.some(e => e.id.endsWith(':match:x')));
  assert.equal((await t.call('POST', '', { op: 'login', passcode: b.passcode, app: 'stock' })).status, 404);
  // Old app-only codes are not a source any more.
  const legacy = await t.call('POST', '', { op: 'merge', qt: aa.data.token, sources: [{ app: 'orbit', passcode: 'ABCD2345', manager: 'x' }] });
  assert.equal(legacy.status, 400);
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
  const acct = await newPass(t);
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
  assert.ok(plan.tidy[0].wallet.settings['act:odds']);
  // The admin op itself needs the token.
  assert.equal((await t.call('POST', '', { op: 'admin', token: 'wrong', action: 'scan' })).status, 403);
  assert.deepEqual(tidyWallet(tidyWallet(plan.tidy[0].wallet)), plan.tidy[0].wallet);
});

test('Quadra Hub migration removes game XP and cosmetics without refunding prior cosmetic spends', () => {
  const at = Date.UTC(2026, 9, 1);
  const wallet = {
    ...emptyWallet(at),
    entries: [
      { id: 'vocab:g:1', t: at, app: 'vocab', kind: 'game', amount: 0, xp: 900 },
      { id: 'vocab:m:2026-10-01:game1', t: at + 1, app: 'vocab', kind: 'mission', amount: 0, xp: 10 },
      { id: 'vocab:fb:2026-10-01:game1', t: at + 1, app: 'vocab', kind: 'freebet', amount: 0, note: '100' },
      { id: 'vocab:w:1', t: at + 2, app: 'vocab', kind: 'words', amount: 0, xp: 400 },
      { id: 'vocab:xs:avatar:cat', t: at + 3, app: 'vocab', kind: 'redeem', amount: 0, note: '300' },
      { id: 'vocab:xs:frame:gold', t: at + 4, app: 'vocab', kind: 'redeem', amount: 0, note: '8000' },
      { id: 'vocab:xs:plus:2026-10', t: at + 5, app: 'vocab', kind: 'redeem', amount: 0, note: '20000' }
    ],
    settings: {
      avatar: { value: { id: 'cat' }, t: at },
      frame: { value: { id: 'gold' }, t: at },
      'bests:vocab': { value: { puzzle: 42 }, t: at },
      'act:stock': { value: { day: '2026-10-01' }, t: at }
    }
  };
  const cleaned = tidyWallet(wallet);
  assert.deepEqual(cleaned.entries.filter(e => e.kind === 'game' || e.id.startsWith('vocab:g:') || /:game1$/.test(e.id)), []);
  assert.equal(cleaned.entries.some(e => e.id.startsWith('vocab:fb:')), false);
  assert.ok(cleaned.entries.some(e => e.id === 'vocab:w:1'));
  assert.equal(cleaned.entries.some(e => /^vocab:xs:(avatar|frame|plus):/.test(e.id)), false);
  assert.equal(cleaned.entries.filter(e => e.id.startsWith('vocab:xp:debit:')).reduce((sum, e) => sum + Number(e.note), 0), 28_300);
  assert.equal(cleaned.settings.avatar, undefined);
  assert.equal(cleaned.settings.frame, undefined);
  assert.equal(cleaned.settings['bests:vocab'], undefined);
  assert.ok(cleaned.settings['act:stock']);
  const chosenAgain = { ...cleaned, settings: { ...cleaned.settings, avatar: { value: { id: 'fox' }, t: at + 5 } } };
  assert.equal(tidyWallet(chosenAgain).settings.avatar.value.id, 'fox');
  assert.deepEqual(tidyWallet(cleaned), cleaned);
});

test('admin scan reports the Hub data it will purge before changing a wallet', async () => {
  const t = setup();
  await newPass(t);
  const env = {};
  const [doc] = await t.deps.fsList(env, WALLET_COLLECTION);
  const wallet = JSON.parse(doc.payload);
  const settings = { ...wallet.settings, avatar: { value: { id: 'cat' }, t: 1 }, frame: { value: { id: 'gold' }, t: 1 }, 'bests:vocab': { value: {}, t: 1 } };
  delete settings['hub:cleanup:v1'];
  wallet.settings = settings;
  wallet.entries.push(
    { id: 'vocab:g:old', t: 1, app: 'vocab', kind: 'game', amount: 0, xp: 20 },
    { id: 'vocab:m:2026-10-01:game1', t: 2, app: 'vocab', kind: 'mission', amount: 0, xp: 10 },
    { id: 'vocab:fb:2026-10-01:game1', t: 2, app: 'vocab', kind: 'freebet', amount: 0, note: '100' },
    { id: 'vocab:xs:avatar:cat', t: 3, app: 'vocab', kind: 'redeem', amount: 0, note: '300' },
    { id: 'vocab:xs:frame:gold', t: 4, app: 'vocab', kind: 'redeem', amount: 0, note: '8000' },
    { id: 'vocab:xs:plus:2026-10', t: 5, app: 'vocab', kind: 'redeem', amount: 0, note: '20000' }
  );
  await t.deps.fsWrite(env, WALLET_COLLECTION, doc.id, JSON.stringify(wallet));
  const plan = await planClean(env, t.deps);
  assert.deepEqual(plan.hubPurge, { gameEntries: 2, legacyMissionFreebets: 1, cosmeticRedemptions: 3, cosmeticChoices: 2, gameScoreSettings: 1 });
  assert.equal(plan.tidy.length, 1);
  assert.equal(plan.tidy[0].wallet.entries.some(e => e.id === 'vocab:g:old' || e.id.startsWith('vocab:fb:')), false);
});

test('Quadra Plus: the first month free, renewal from the pool, leaving keeps the paid month', async () => {
  const t = setup();
  const acct = await newPass(t, 'odds');
  const join = await t.call('POST', '', { op: 'plus', qt: acct.token, on: true });
  assert.equal(join.status, 200);
  assert.equal(join.data.member, true);
  const first = join.data.wallet.entries.find(e => e.kind === 'plus');
  assert.equal(first.amount, 0, 'the first month is on the house');
  assert.equal(first.note, 'trial');
  // Joining again the same month changes nothing.
  const again = await t.call('POST', '', { op: 'plus', qt: acct.token, on: true });
  assert.equal(again.data.wallet.entries.filter(e => e.kind === 'plus').length, 1);
  // Next month: renewed on the first read, after the pay.
  t.advance(32 * 86_400_000);
  const read = await t.call('POST', '', { op: 'refresh', refresh: acct.refresh, app: 'odds', claim: true });
  const plus = read.data.wallet.entries.filter(e => e.kind === 'plus');
  assert.equal(plus.length, 2);
  assert.equal(plus[1].amount, -PLUS.fee);
  // Leaving: no renewal later, the paid month stays.
  const leave = await t.call('POST', '', { op: 'plus', qt: read.data.token, on: false });
  assert.equal(leave.data.member, true);
  t.advance(32 * 86_400_000);
  const later = await t.call('POST', '', { op: 'refresh', refresh: read.data.refresh, app: 'odds', claim: true });
  assert.equal(later.data.wallet.entries.filter(e => e.kind === 'plus').length, 2);
});

test('Quadra Plus: rejoining costs the rest of the month; a short pool does not renew or join', () => {
  const oct15 = Date.UTC(2026, 9, 15, 4);
  const had = { entries: [{ id: 'eco:plus:2026-08', t: 1, app: 'eco', kind: 'plus', amount: 0 }] };
  const e = plusJoinEntry(had, oct15);
  assert.equal(e.id, 'eco:plus:2026-10');
  // 17 of 31 days left: about NT$270.
  assert.equal(e.amount, -270);
  assert.equal(plusJoinEntry({ entries: [] }, oct15).amount, 0);
  const broke = { settings: { plus: { value: { on: true }, t: 1 } }, entries: [{ id: 'eco:plus:2026-10', t: 1, app: 'eco', kind: 'plus', amount: 0 }, { id: 'eco:rebase:v3', t: 1, app: 'eco', kind: 'rebase', amount: 0 }, { id: 'x', t: 1, app: 'odds', amount: -16_500 }] };
  assert.ok(!paydayEntries({ ...broke, created: oct15 }, Date.UTC(2026, 10, 2)).some(x => x.kind === 'plus'));
  const ok = { ...broke, entries: broke.entries.slice(0, 2) };
  assert.ok(paydayEntries({ ...ok, created: oct15 }, Date.UTC(2026, 10, 2)).some(x => x.id === 'eco:plus:2026-11'));
  assert.equal(plusMember(ok, oct15), true);
  assert.equal(plusMember(ok, Date.UTC(2026, 10, 2)), false);
});

test('Quadra Plus: only the live app can join, and an app cannot write the entry itself', async () => {
  const t = setup();
  const acct = await newPass(t, 'stock');
  await t.call('POST', '', { op: 'refresh', refresh: acct.refresh, app: 'odds', claim: true });
  const moved = await t.call('POST', '', { op: 'plus', qt: acct.token, on: true });
  assert.equal(moved.data.error.code, 'ECO_SESSION_MOVED');
  assert.deepEqual(cleanPatch({ entries: [{ id: 'eco:plus:2026-10', t: 1, app: 'eco', kind: 'plus', amount: 0 }, { id: 'eco:plus:2026-11', t: 1, app: 'odds', kind: 'plus', amount: 0 }] }).entries, []);
});

test('Quadra Plus yearly: twelve months paid at once, renewed by the year', async () => {
  const t = setup();
  const acct = await newPass(t, 'stock');
  const join = await t.call('POST', '', { op: 'plus', qt: acct.token, on: true, plan: 'year' });
  assert.equal(join.status, 200);
  const plus = join.data.wallet.entries.filter(e => e.kind === 'plus');
  assert.equal(plus.length, 12);
  assert.equal(plus.reduce((s, e) => s + e.amount, 0), -PLUS.year);
  assert.equal(join.data.wallet.settings.plus.value.plan, 'year');
  // Eleven months on: nothing new is charged.
  t.advance(11 * 31 * 86_400_000 - 40 * 86_400_000);
  const mid = await t.call('POST', '', { op: 'login', passcode: acct.passcode, app: 'stock' });
  assert.equal(mid.data.wallet.entries.filter(e => e.kind === 'plus').length, 12);
  // Past the year: another year.
  t.advance(80 * 86_400_000);
  const later = await t.call('POST', '', { op: 'login', passcode: acct.passcode, app: 'stock' });
  const after = later.data.wallet.entries.filter(e => e.kind === 'plus');
  assert.ok(after.length >= 24 - 2, `renewed: ${after.length}`);
  assert.equal(after.filter(e => e.amount === -PLUS.year).length, 2);
});

test('Quadra Plus yearly on top of a month already held starts next month', () => {
  const oct = Date.UTC(2026, 9, 10, 4);
  const w = { entries: [{ id: 'eco:plus:2026-10', t: 1, app: 'eco', kind: 'plus', amount: 0 }] };
  const e = plusJoinEntries(w, oct, 'year');
  assert.equal(e[0].id, 'eco:plus:2026-11');
  assert.equal(e.at(-1).id, 'eco:plus:2027-10');
  assert.equal(e[0].amount, -PLUS.year);
});

test('the pay is fixed, like a salary: the same however much the account holds', () => {
  assert.equal(PAY_MONTH, 6_000);
  assert.equal(payFor(0), 6_000);
  assert.equal(payFor(5_000_000), 6_000);
  // Worth still counts Securities' holdings, not only cash.
  const w = { entries: [{ id: 'a', t: 1, app: 'odds', amount: 20_000 }, { id: 'eco:rebase:v3', t: 1, app: 'eco', kind: 'rebase', amount: 0 }], snap: { stock: { cash: 5_000, holdings: 300_000, t: 1 } } };
  assert.equal(worthOf(w), 325_000);
  const oct = Date.UTC(2026, 9, 3);
  assert.equal(paydayEntries({ ...w, created: oct }, oct).find(e => e.kind === 'pay').amount, 6_000);
  // Back pay: every month in full.
  const back = paydayEntries({ entries: [{ id: 'x', t: 1, app: 'odds', amount: 36_000 }, { id: 'eco:rebase:v3', t: 1, app: 'eco', kind: 'rebase', amount: 0 }], created: oct }, Date.UTC(2027, 0, 5)).filter(e => e.kind === 'pay');
  assert.deepEqual(back.map(e => e.amount), [6_000, 6_000, 6_000, 6_000]);
});

test('the reset: accounts that opened with NT$110,000 come down to NT$30,000 once; cash may go below zero', () => {
  const oct = Date.UTC(2026, 9, 3);
  const old = { v2: 1, entries: [{ id: 'eco:start', t: 1, app: 'eco', kind: 'start', amount: 110_000 }, { id: 'odds:stake-1', t: 2, app: 'odds', kind: 'stake', amount: -100_000 }], snap: { stock: { cash: 0, holdings: 60_000, t: 1 } } };
  const due = paydayEntries(old, oct);
  assert.equal(due[0].id, REBASE.id);
  assert.equal(due[0].amount, -80_000);
  assert.equal(due.find(e => e.kind === 'pay').amount, 6_000);
  // Overdrawn when the month starts: 1% of what's owed.
  assert.equal(due.find(e => e.kind === 'od').amount, -Math.round(70_000 * OVERDRAFT_RATE));
  // Once only.
  const after = { ...old, entries: [...old.entries, ...due] };
  assert.deepEqual(paydayEntries(after, oct), []);
  // Before v2: an account with money in the pool from the apps themselves.
  assert.equal(paydayEntries({ entries: [], snap: { stock: { cash: 100_000, t: 1 } } }, oct)[0].id, REBASE.id);
  // A pass made in this economy never gets it.
  assert.ok(!paydayEntries({ v2: 1, entries: [{ id: 'eco:start', t: 1, app: 'eco', kind: 'start', amount: 30_000 }] }, oct).some(e => e.id === REBASE.id));
});

test('a new pass today opens with NT$30,000 and no reset', async () => {
  const t = setup();
  const acct = await newPass(t, 'odds');
  assert.equal(acct.wallet.entries.find(e => e.id === 'eco:start').amount, 30_000);
  assert.ok(!acct.wallet.entries.some(e => e.id === REBASE.id));
});

test('Plus: a NT$200 bonus bet each week a member opens an app, from the Worker only', () => {
  // Wednesday 2026-10-07, Taiwan: the week of Monday the 5th.
  const now = Date.UTC(2026, 9, 7, 4);
  assert.equal(bonusBetId(now), 'eco:fb:2026-10-05');
  // Sunday 23:30 Taiwan is still that week; Monday 00:30 is the next.
  assert.equal(bonusBetId(Date.UTC(2026, 9, 11, 15, 30)), 'eco:fb:2026-10-05');
  assert.equal(bonusBetId(Date.UTC(2026, 9, 11, 16, 30)), 'eco:fb:2026-10-12');
  const member = { entries: [{ id: 'eco:plus:2026-10', t: 1, app: 'eco', kind: 'plus', amount: -290 }] };
  assert.deepEqual(plusBonusEntries(member, now), [{ id: 'eco:fb:2026-10-05', t: now, app: 'eco', kind: 'freebet', amount: 0, note: '200' }]);
  assert.deepEqual(plusBonusEntries({ entries: [...member.entries, ...plusBonusEntries(member, now)] }, now), []);
  assert.deepEqual(plusBonusEntries({ entries: [] }, now), []);
  // Comes with the month's payday for a member, and never from an app.
  const due = paydayEntries({ ...member, created: now, entries: [...member.entries, { id: 'eco:pay:2026-10', t: 1, app: 'eco', kind: 'pay', amount: 6000 }] }, now);
  assert.ok(due.some(e => e.id === 'eco:fb:2026-10-05'));
  assert.equal(cleanPatch({ entries: [{ id: 'eco:fb:2026-10-05', t: now, app: 'odds', kind: 'freebet', amount: 0, note: '100' }] }).entries.length, 0);
  // Joining brings this week's with it.
  const joined = plusJoinEntries({ entries: [] }, now);
  assert.equal(plusBonusEntries({ entries: joined }, now).length, 1);
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

test('welcome: a NT$200 free bet after the first paid bet, once; a write brings it at once', async () => {
  const now = Date.UTC(2026, 9, 7, 4);
  assert.deepEqual(welcomeEntries({ entries: [] }, now), []);
  assert.deepEqual(welcomeEntries({ entries: [{ id: 'odds:stake-f', t: now, app: 'odds', kind: 'stake', amount: 0 }] }, now), []);
  const bet = { id: 'odds:stake-a', t: now, app: 'odds', kind: 'stake', amount: -500 };
  assert.deepEqual(welcomeEntries({ entries: [bet] }, now), [{ id: 'eco:fb:welcome', t: now, app: 'eco', kind: 'freebet', amount: 0, note: '200' }]);
  assert.deepEqual(welcomeEntries({ entries: [bet, ...welcomeEntries({ entries: [bet] }, now)] }, now), []);
  const t = setup();
  const acct = await newPass(t, 'odds');
  const w = await t.call('PATCH', `${t.qt(acct.token)}&app=odds`, { wallet: { entries: [{ ...bet, t: 1_700_000_100_000 }] } });
  assert.equal(w.status, 200);
  assert.ok(w.data.wallet.entries.some(e => e.id === 'eco:fb:welcome' && e.app === 'eco'));
});

test('points buy what money does: a redemption costs at least HUB_XP, amount 0, Hub only', async () => {
  const { HUB_XP } = await import('../eco.js');
  const r = (id, note, extra = {}) => ({ id, t: 1, app: 'vocab', kind: 'redeem', amount: 0, note, ...extra });
  const p = cleanPatch({
    entries: [
      r('vocab:xs:freeze:a', String(HUB_XP.freeze)),
      r('vocab:xs:freeze:b', '10'),
      r('vocab:xs:boost:c', '300'),
      r('vocab:xs:pack:toeic', '8000'),
      r('vocab:xs:pack:biz', '8000'),
      r('vocab:xs:pack:x', '99999'),
      r('vocab:xs:freeze:d', '600', { amount: -5 }),
      r('vocab:xs:freeze:e', '600', { kind: 'shop' }),
      r('vocab:xs:freeze:f', '600.5'),
      { id: 'vocab:xs:freeze:g', t: 1, app: 'odds', kind: 'redeem', amount: 0, note: '600' },
      r('vocab:xs:frame:gold', '8000'),
      r('vocab:xs:frame:silver', '100'),
      r('vocab:xs:frame:bronze', '100'),
      r('vocab:xs:reroll:2026-10-02:orbit', '100'),
      r('vocab:xs:repair:2026-10-01', '1500'),
      r('vocab:xs:repair:2026-10-03', '100')
    ]
  });
  assert.deepEqual(p.entries.map(e => e.id), ['vocab:xs:freeze:a', 'vocab:xs:boost:c', 'vocab:xs:pack:toeic', 'vocab:xs:reroll:2026-10-02:orbit', 'vocab:xs:repair:2026-10-01']);
});

test('Quadra Plus bills every month like a subscription: months away charged on return; a failed charge lapses it', () => {
  const on = { plus: { value: { on: true }, t: 1 } };
  const base = [{ id: 'eco:plus:2026-10', t: 1, app: 'eco', kind: 'plus', amount: 0, note: 'trial' }, { id: 'eco:rebase:v3', t: 1, app: 'eco', kind: 'rebase', amount: 0 }, { id: 'eco:pay:2026-10', t: 1, app: 'eco', kind: 'pay', amount: 6_000 }];
  // Away November and December, back in January: three months billed after their pay.
  const jan = Date.UTC(2027, 0, 5);
  const due = paydayEntries({ settings: on, created: Date.UTC(2026, 9, 1), entries: base }, jan);
  assert.deepEqual(due.filter(e => e.kind === 'plus').map(e => [e.id, e.amount]), [['eco:plus:2026-11', -PLUS.fee], ['eco:plus:2026-12', -PLUS.fee], ['eco:plus:2027-01', -PLUS.fee]]);
  // A pool that can't cover a month: that charge fails and the rest isn't tried.
  const broke = [...base.slice(0, 2), { id: 'x', t: 1, app: 'odds', amount: -17_700 }];
  const w = { settings: on, created: Date.UTC(2026, 9, 1), entries: broke };
  const nov = paydayEntries(w, Date.UTC(2026, 10, 2));
  assert.ok(!nov.some(e => e.kind === 'plus'));
  const fail = nov.find(e => e.kind === 'plusfail');
  assert.equal(fail.id, 'eco:plusfail:2026-11');
  const lapsed = { ...w, entries: [...broke, ...nov] };
  assert.equal(plusLapsed(lapsed), true);
  // Lapsed: no retry next month, even with money.
  const rich = { ...lapsed, entries: [...lapsed.entries, { id: 'y', t: 2, app: 'odds', amount: 50_000 }] };
  assert.ok(!paydayEntries(rich, Date.UTC(2026, 11, 2)).some(e => e.kind === 'plus' || e.kind === 'plusfail'));
  // Joining again starts it over (the rest of the month at its share).
  const back = plusJoinEntries(rich, Date.UTC(2026, 11, 2));
  assert.ok(back[0].amount < 0);
  assert.equal(plusLapsed({ entries: [...rich.entries, ...back] }), false);
});

test('points catalogue: all accounts pay the same and Plus cannot be bought with points', () => {
  const r = (id, note) => ({ id, t: Date.UTC(2026, 9, 5), app: 'vocab', kind: 'redeem', amount: 0, note });
  const p = cleanPatch({ entries: [r('vocab:xs:bet100:a', '5000'), r('vocab:xs:bet500:b', '22000'), r('vocab:xs:fee:c', '4000'), r('vocab:xs:td:d', '12000'), r('vocab:xs:plus:2026-10', '20000'), r('vocab:xs:avatar:cat', '300'), r('vocab:xs:frame:gold', '8000')] });
  assert.deepEqual(p.entries.map(e => e.id), ['vocab:xs:bet100:a', 'vocab:xs:bet500:b', 'vocab:xs:fee:c', 'vocab:xs:td:d']);
  assert.equal(HUB_XP.plus, undefined);
  assert.equal(HUB_XP.avatar, undefined);
  assert.equal(HUB_XP.frame, undefined);
});

test('wealth levels: each level reached pays its reward once, from what the account is worth', () => {
  const now = Date.UTC(2026, 9, 7, 3);
  const at = (amount, holdings = 0, extra = []) => ({ entries: [{ id: 'eco:start', amount }, ...extra], snap: { stock: { cash: 0, holdings } } });
  assert.deepEqual(rankEntries(at(40_000), now), []);
  // 60,000 in cash and 50,000 in shares: worth 110,000, two levels at once.
  assert.deepEqual(rankEntries(at(60_000, 50_000), now).map(e => [e.id, e.amount, e.kind]), [['eco:rank:saver', 1_000, 'rank'], ['eco:rank:steady', 2_000, 'rank']]);
  // Paid already, or fallen back: nothing again.
  assert.deepEqual(rankEntries(at(120_000, 0, [{ id: 'eco:rank:saver', amount: 1_000 }, { id: 'eco:rank:steady', amount: 2_000 }]), now), []);
  assert.equal(RANKS.length, 8);
  // In the payday's entries, after the pay.
  assert.ok(paydayEntries({ entries: [{ id: 'eco:start', amount: 45_000 }, { id: 'eco:rebase:v3', t: 1, app: 'eco', kind: 'rebase', amount: 0 }] }, now).some(e => e.id === 'eco:rank:saver'));
});
