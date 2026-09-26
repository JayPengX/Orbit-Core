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
