import test from 'node:test';
import assert from 'node:assert/strict';
import { handlePlay, settleCron, nextLook, cleanSlip, OPEN_COLLECTION, SETTLED_COLLECTION, OPEN_INDEX } from '../settle.js';
import { WALLET_COLLECTION } from '../eco.js';

const ACCOUNT = 'a'.repeat(64);
const START = '2026-10-10T23:10:00Z';
const env = { FIREBASE_PROJECT_ID: 'p', FIREBASE_CLIENT_EMAIL: 'e', FIREBASE_PRIVATE_KEY: 'k' };
const session = { d: ACCOUNT, s: 'sid', a: 'odds' };

// An in-memory Firestore (updateTime preconditions as Firestore keeps them),
// a scripted ESPN, and the notices sent.
function setup(now, { final = true } = {}) {
  const store = new Map();
  let clock = 0;
  const k = (c, id) => `${c}/${id}`;
  const reads = [];
  const sent = [];
  const scoreboard = {
    events: [
      {
        id: '401',
        date: START,
        competitions: [
          {
            status: { type: final ? { name: 'STATUS_FINAL', state: 'post', completed: true } : { name: 'STATUS_IN_PROGRESS', state: 'in', completed: false } },
            competitors: [
              { homeAway: 'away', score: '2', team: { displayName: 'Chicago Cubs' }, linescores: [] },
              { homeAway: 'home', score: '5', team: { displayName: 'Cincinnati Reds' }, linescores: [] }
            ]
          }
        ]
      }
    ]
  };
  const deps = {
    json: (body, status) => ({ status, body }),
    errorJson: (code, status) => ({ status, body: { error: { code } } }),
    upstreamFailed: error => {
      throw error;
    },
    readJsonBody: async req => req.body,
    INVALID_BODY: Symbol('invalid'),
    fsGet: async (env, c, id) => (store.has(k(c, id)) ? { exists: true, ...store.get(k(c, id)) } : { exists: false, payload: '', updateTime: '' }),
    fsWrite: async (env, c, id, payload, pre) => {
      const had = store.get(k(c, id));
      if (pre?.exists === false && had) throw Object.assign(new Error('exists'), { precondition: true });
      if (pre?.updateTime && had?.updateTime !== pre.updateTime) throw Object.assign(new Error('changed'), { precondition: true });
      const updateTime = String(++clock);
      store.set(k(c, id), { payload, updateTime });
      return { updateTime };
    },
    fsDelete: async (env, c, id) => void store.delete(k(c, id)),
    read: async url => {
      reads.push(url);
      return url.includes('/scoreboard?dates=') ? scoreboard : null;
    },
    notify: async (account, make) => sent.push({ account, ...make('zh') }),
    now: () => now.t
  };
  const doc = (c, id) => (store.has(k(c, id)) ? JSON.parse(store.get(k(c, id)).payload) : null);
  return { store, deps, reads, sent, doc };
}
const leg = (side, odds = 1.8) => ({ id: `mlb|cubs-reds|ml|${side}`, kind: 'ml', side, sport: 'mlb', away: 'Chicago Cubs', home: 'Cincinnati Reds', start: START, odds, gameId: 'g1', shortLabel: side === 'home' ? '紅人' : '小熊', result: null });
const slip = (id, legs, extra = {}) => ({ id, t: '2026-10-10T20:00:00Z', mode: 'single', sizes: [legs.length], stake: 100, cost: 100, legs, status: 'open', ...extra });
const post = (deps, body) => handlePlay({ method: 'POST', body }, env, {}, session, deps);
function wallet(store, entries) {
  store.set(`${WALLET_COLLECTION}/${ACCOUNT}`, { payload: JSON.stringify({ v: 1, created: 0, entries, snap: {}, settings: {}, apps: {}, inbox: {} }), updateTime: 'w0' });
}

test('a slip is settled when its game is over: paid once, kept for Play, told', async () => {
  const now = { t: Date.parse('2026-10-10T21:00:00Z') };
  const { store, deps, reads, sent, doc } = setup(now);
  wallet(store, [{ id: 'odds:stake-slipwin01', t: 1, app: 'odds', kind: 'stake', amount: -100 }, { id: 'odds:stake-sliplost1', t: 1, app: 'odds', kind: 'stake', amount: -100 }]);
  const r = await post(deps, { op: 'open', slips: [slip('slipwin01', [leg('home')]), slip('sliplost1', [leg('away')]), { id: 'bad' }] });
  assert.deepEqual(r.body, { watching: 2, added: 2 });
  // Registered again: nothing new.
  assert.equal((await post(deps, { op: 'open', slips: [slip('slipwin01', [leg('home')])] })).body.added, 0);
  // Before the game should be over: nothing read.
  assert.equal((await settleCron(env, deps)).looked, 0);
  assert.equal(reads.length, 0);
  now.t = Date.parse(START) + 4 * 3_600_000;
  const run = await settleCron(env, deps);
  assert.equal(run.settled, 2);
  // One game, one scoreboard read for both slips.
  assert.equal(new Set(reads).size, reads.length);
  assert.equal(reads.length, 1);
  const w = doc(WALLET_COLLECTION, ACCOUNT);
  const payout = w.entries.filter(e => e.id === 'odds:payout-slipwin01');
  assert.equal(payout.length, 1);
  assert.equal(payout[0].amount, 180);
  assert.equal(payout[0].kind, 'payout');
  // A lost slip pays nothing (Play writes its own zero entry).
  assert.ok(!w.entries.some(e => e.id === 'odds:payout-sliplost1'));
  const records = doc(SETTLED_COLLECTION, ACCOUNT).slips;
  assert.deepEqual(records.slipwin01.results, ['won']);
  assert.deepEqual(records.slipwin01.finals, [{ away: 2, home: 5 }]);
  assert.equal(records.slipwin01.payout, 180);
  assert.equal(records.sliplost1.payout, 0);
  assert.deepEqual(sent.map(s => s.title).sort(), ['中獎 NT$180', '投注單沒中']);
  assert.equal(sent.find(s => s.title.startsWith('中獎')).tag, 'odds:slip:slipwin01');
  // The open slips and their index entries are gone.
  assert.equal(doc(OPEN_COLLECTION, `${ACCOUNT}_slipwin01`), null);
  assert.deepEqual(doc(OPEN_COLLECTION, OPEN_INDEX).due, {});
  // Play reads them, applies them, says so: they go.
  const got = await handlePlay({ method: 'GET' }, env, {}, session, deps);
  assert.deepEqual(Object.keys(got.body.settled).sort(), ['sliplost1', 'slipwin01']);
  await post(deps, { op: 'ack', ids: ['slipwin01', 'sliplost1'] });
  assert.equal(doc(SETTLED_COLLECTION, ACCOUNT), null);
});

test('never paid twice: Play paid it first, or the run is repeated', async () => {
  const now = { t: Date.parse('2026-10-10T21:00:00Z') };
  const { store, deps, doc } = setup(now);
  wallet(store, [{ id: 'odds:stake-slipwin01', t: 1, app: 'odds', kind: 'stake', amount: -100 }, { id: 'odds:payout-slipwin01', t: 2, app: 'odds', kind: 'payout', amount: 180 }]);
  await post(deps, { op: 'open', slips: [slip('slipwin01', [leg('home')])] });
  now.t = Date.parse(START) + 4 * 3_600_000;
  await settleCron(env, deps);
  await settleCron(env, deps);
  assert.equal(doc(WALLET_COLLECTION, ACCOUNT).entries.filter(e => e.id.startsWith('odds:payout')).length, 1);
});

test('nothing is paid for a slip the wallet has no stake for', async () => {
  const now = { t: Date.parse(START) + 4 * 3_600_000 };
  const { store, deps, doc } = setup(now);
  wallet(store, []);
  await post(deps, { op: 'open', slips: [slip('slipwin01', [leg('home')])] });
  now.t += 3_600_000;
  await settleCron(env, deps);
  assert.equal(doc(WALLET_COLLECTION, ACCOUNT).entries.length, 0);
  // Play still gets the result (and pays it from its own ledger).
  assert.deepEqual(doc(SETTLED_COLLECTION, ACCOUNT).slips.slipwin01.results, ['won']);
});

test('a game not over is looked at again later; a parlay with a pick lost settles at once', async () => {
  const now = { t: Date.parse('2026-10-10T21:00:00Z') };
  const { store, deps, doc } = setup(now, { final: false });
  wallet(store, [{ id: 'odds:stake-slipwin01', t: 1, app: 'odds', kind: 'stake', amount: -100 }]);
  await post(deps, { op: 'open', slips: [slip('slipwin01', [leg('home')])] });
  now.t = Date.parse(START) + 4 * 3_600_000;
  const run = await settleCron(env, deps);
  assert.equal(run.settled, 0);
  assert.equal(doc(OPEN_COLLECTION, OPEN_INDEX).due[`${ACCOUNT}_slipwin01`], now.t + 15 * 60_000);
  // A parlay: the Cubs pick lost, the other game tomorrow.
  const s2 = setup(now);
  wallet(s2.store, [{ id: 'odds:stake-parlay001', t: 1, app: 'odds', kind: 'stake', amount: -100 }]);
  const later = { ...leg('home'), id: 'nba|x|ml|home', sport: 'nba', away: 'A', home: 'B', start: '2026-10-12T00:00:00Z', gameId: 'g2' };
  await post(s2.deps, { op: 'open', slips: [slip('parlay001', [leg('away'), later], { mode: 'parlay', sizes: [2] })] });
  await settleCron(env, s2.deps);
  assert.deepEqual(s2.doc(SETTLED_COLLECTION, ACCOUNT).slips.parlay001.results, ['lost', null]);
  assert.equal(s2.doc(SETTLED_COLLECTION, ACCOUNT).slips.parlay001.settled, true);
});

test('a game never found is void three days after its start', async () => {
  const now = { t: Date.parse(START) + 4 * 3_600_000 };
  const { store, deps, doc } = setup(now);
  deps.read = async () => ({ events: [] });
  wallet(store, [{ id: 'odds:stake-slipwin01', t: 1, app: 'odds', kind: 'stake', amount: -100 }]);
  await post(deps, { op: 'open', slips: [slip('slipwin01', [leg('home')])] });
  await settleCron(env, deps);
  assert.equal(doc(SETTLED_COLLECTION, ACCOUNT), null);
  now.t = Date.parse(START) + 3 * 86_400_000 + 3_600_000;
  await settleCron(env, deps);
  assert.deepEqual(doc(SETTLED_COLLECTION, ACCOUNT).slips.slipwin01.results, ['void']);
  assert.equal(doc(WALLET_COLLECTION, ACCOUNT).entries.find(e => e.id === 'odds:payout-slipwin01').amount, 100);
});

test('cash out and settling never both happen', async () => {
  const now = { t: Date.parse('2026-10-10T21:00:00Z') };
  const { store, deps, doc } = setup(now);
  wallet(store, [{ id: 'odds:stake-slipwin01', t: 1, app: 'odds', kind: 'stake', amount: -100 }, { id: 'odds:stake-slipwin02', t: 1, app: 'odds', kind: 'stake', amount: -100 }]);
  await post(deps, { op: 'open', slips: [slip('slipwin01', [leg('home')]), slip('slipwin02', [leg('home')])] });
  // Cashed out before the end: never settled.
  assert.deepEqual((await post(deps, { op: 'cashout', id: 'slipwin01' })).body, { ok: true });
  now.t = Date.parse(START) + 4 * 3_600_000;
  await settleCron(env, deps);
  assert.ok(!doc(WALLET_COLLECTION, ACCOUNT).entries.some(e => e.id === 'odds:payout-slipwin01'));
  assert.equal(doc(SETTLED_COLLECTION, ACCOUNT).slips.slipwin01, undefined);
  // Settled first: the cash out gets the result instead.
  const late = await post(deps, { op: 'cashout', id: 'slipwin02' });
  assert.equal(late.body.settled.payout, 180);
  // A slip never registered (an older Play): cash out goes ahead.
  assert.deepEqual((await post(deps, { op: 'cashout', id: 'neverseen1' })).body, { ok: true });
});

test('only a Play session, and only sane slips', async () => {
  const { deps } = setup({ t: 0 });
  assert.equal((await handlePlay({ method: 'GET' }, env, {}, { ...session, a: 'stock' }, deps)).status, 401);
  assert.equal((await handlePlay({ method: 'GET' }, env, {}, null, deps)).status, 401);
  assert.equal(cleanSlip(slip('slipwin01', [{ ...leg('home'), odds: 0 }])), null);
  assert.equal(cleanSlip({ ...slip('slipwin01', [leg('home')]), status: 'settled' }), null);
  assert.equal(cleanSlip(slip('slipwin01', Array.from({ length: 21 }, () => leg('home')))), null);
});

test('a slip is looked at when its soonest undecided game should be over', () => {
  const now = Date.parse('2026-10-10T20:00:00Z');
  const s = slip('slipwin01', [leg('home'), { ...leg('home'), sport: 'epl', start: '2026-10-11T14:00:00Z' }]);
  assert.equal(nextLook(s, now), Date.parse(START) + 3.3 * 3_600_000 + 10 * 60_000);
  assert.equal(nextLook({ ...s, legs: [{ ...s.legs[0], result: 'won' }, s.legs[1]] }, now), Date.parse('2026-10-11T14:00:00Z') + 2.1 * 3_600_000 + 10 * 60_000);
});
