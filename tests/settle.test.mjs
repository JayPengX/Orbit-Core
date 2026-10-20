import test from 'node:test';
import assert from 'node:assert/strict';
import { handlePlay, settleCron, nextLook, cleanSlip, watchSlips, OPEN_COLLECTION, SETTLED_COLLECTION, OPEN_INDEX } from '../settle.js';
import { WALLET_COLLECTION } from '../eco.js';

const ACCOUNT = 'a'.repeat(64);
const START = '2026-10-10T23:10:00Z';
const env = { STORE: {} };
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
// Watched as a placed slip is (settle.js watchSlips).
const watch = async (deps, slips) => {
  const clean = slips.map(cleanSlip).filter(Boolean);
  return { body: { watching: clean.length, added: await watchSlips(env, deps, ACCOUNT, clean, deps.now()) } };
};
function wallet(store, entries) {
  store.set(`${WALLET_COLLECTION}/${ACCOUNT}`, { payload: JSON.stringify({ v: 1, created: 0, entries, snap: {}, settings: {}, apps: {}, inbox: {} }), updateTime: 'w0' });
}

test('a slip is settled when its game is over: paid once, kept for Play, told', async () => {
  const now = { t: Date.parse('2026-10-10T21:00:00Z') };
  const { store, deps, reads, sent, doc } = setup(now);
  wallet(store, [{ id: 'odds:stake-slipwin01', t: 1, app: 'odds', kind: 'stake', amount: -100 }, { id: 'odds:stake-sliplost1', t: 1, app: 'odds', kind: 'stake', amount: -100 }]);
  const r = await watch(deps, [slip('slipwin01', [leg('home')]), slip('sliplost1', [leg('away')]), { id: 'bad' }]);
  assert.deepEqual(r.body, { watching: 2, added: 2 });
  // Registered again: nothing new.
  assert.equal((await watch(deps, [slip('slipwin01', [leg('home')])])).body.added, 0);
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
  await watch(deps, [slip('slipwin01', [leg('home')])]);
  now.t = Date.parse(START) + 4 * 3_600_000;
  await settleCron(env, deps);
  await settleCron(env, deps);
  assert.equal(doc(WALLET_COLLECTION, ACCOUNT).entries.filter(e => e.id.startsWith('odds:payout')).length, 1);
});

test('a slip with no stake in the wallet is never paid', async () => {
  const now = { t: Date.parse(START) + 4 * 3_600_000 };
  const { store, deps, doc } = setup(now);
  wallet(store, []);
  await watch(deps, [slip('slipwin01', [leg('home')])]);
  now.t += 3_600_000;
  await settleCron(env, deps);
  assert.equal(doc(WALLET_COLLECTION, ACCOUNT).entries.length, 0);
});

test('a game not over is looked at again later; a parlay with a pick lost settles at once', async () => {
  const now = { t: Date.parse('2026-10-10T21:00:00Z') };
  const { store, deps, doc } = setup(now, { final: false });
  wallet(store, [{ id: 'odds:stake-slipwin01', t: 1, app: 'odds', kind: 'stake', amount: -100 }]);
  await watch(deps, [slip('slipwin01', [leg('home')])]);
  now.t = Date.parse(START) + 4 * 3_600_000;
  const run = await settleCron(env, deps);
  assert.equal(run.settled, 0);
  assert.equal(doc(OPEN_COLLECTION, OPEN_INDEX).due[`${ACCOUNT}_slipwin01`], now.t + 3 * 60_000);
  // A parlay: the Cubs pick lost, the other game tomorrow.
  const s2 = setup(now);
  wallet(s2.store, [{ id: 'odds:stake-parlay001', t: 1, app: 'odds', kind: 'stake', amount: -100 }]);
  const later = { ...leg('home'), id: 'nba|x|ml|home', sport: 'nba', away: 'A', home: 'B', start: '2026-10-12T00:00:00Z', gameId: 'g2' };
  await watch(s2.deps, [slip('parlay001', [leg('away'), later], { mode: 'parlay', sizes: [2] })]);
  await settleCron(env, s2.deps);
  assert.deepEqual(s2.doc(SETTLED_COLLECTION, ACCOUNT).slips.parlay001.results, ['lost', null]);
  assert.equal(s2.doc(SETTLED_COLLECTION, ACCOUNT).slips.parlay001.settled, true);
});

test('a game never found is void 48 hours after its start (its local day, for baseball, at the least), not before', async () => {
  const now = { t: Date.parse(START) + 4 * 3_600_000 };
  const { store, deps, doc } = setup(now);
  deps.read = async () => ({ events: [] });
  wallet(store, [{ id: 'odds:stake-slipwin01', t: 1, app: 'odds', kind: 'stake', amount: -100 }]);
  await watch(deps, [slip('slipwin01', [leg('home')])]);
  await settleCron(env, deps);
  assert.equal(doc(SETTLED_COLLECTION, ACCOUNT), null);
  // Past the day (midnight Pacific) but within 48 hours: a night's outage can't void it.
  now.t = Date.parse(START) + 47 * 3_600_000;
  await settleCron(env, deps);
  assert.equal(doc(SETTLED_COLLECTION, ACCOUNT), null);
  now.t = Date.parse(START) + 49 * 3_600_000;
  await settleCron(env, deps);
  assert.deepEqual(doc(SETTLED_COLLECTION, ACCOUNT).slips.slipwin01.results, ['void']);
  assert.equal(doc(WALLET_COLLECTION, ACCOUNT).entries.find(e => e.id === 'odds:payout-slipwin01').amount, 100);
});

test('cash out: the value checked against the house\'s, paid by the Worker; never with settling', async () => {
  const now = { t: Date.parse('2026-10-10T21:00:00Z') };
  const { store, deps, doc } = setup(now);
  wallet(store, [{ id: 'odds:stake-slipwin01', t: 1, app: 'odds', kind: 'stake', amount: -100 }, { id: 'odds:stake-slipwin02', t: 1, app: 'odds', kind: 'stake', amount: -100 }]);
  await watch(deps, [slip('slipwin01', [leg('home')]), slip('slipwin02', [leg('home')])]);
  deps.cashOutQuote = async () => ({ value: 120, reason: '' });
  // More than the house's value now: refused, with the house's.
  assert.deepEqual((await post(deps, { op: 'cashout', id: 'slipwin01', value: 150 })).body, { refused: { problem: 'moved', value: 120, reason: '' } });
  // At it: cashed out, paid once by the Worker, never settled after.
  const r = await post(deps, { op: 'cashout', id: 'slipwin01', value: 120 });
  assert.equal(r.body.cashedOut, 120);
  const paid = doc(WALLET_COLLECTION, ACCOUNT).entries.filter(e => e.id === 'odds:payout-slipwin01');
  assert.deepEqual(paid.map(e => [e.kind, e.amount]), [['cashout', 120]]);
  assert.equal(doc(SETTLED_COLLECTION, ACCOUNT).slips.slipwin01.cashedOut, true);
  // Left marked cashed (no delete, no index rewrite on the cash out): cashed out again, nothing more.
  const key = `${ACCOUNT}_slipwin01`;
  assert.equal(doc(OPEN_COLLECTION, key).state, 'cashed');
  assert.ok(key in doc(OPEN_COLLECTION, OPEN_INDEX).due);
  assert.equal((await post(deps, { op: 'cashout', id: 'slipwin01', value: 120 })).body.settled.cashedOut, true);
  now.t = Date.parse(START) + 4 * 3_600_000;
  await settleCron(env, deps);
  assert.equal(doc(WALLET_COLLECTION, ACCOUNT).entries.filter(e => e.id === 'odds:payout-slipwin01').length, 1);
  // The cron dropped it when it came due, its game over: never settled, its record the cash out's.
  assert.equal(doc(OPEN_COLLECTION, key), null);
  assert.ok(!(key in doc(OPEN_COLLECTION, OPEN_INDEX).due));
  assert.equal(doc(SETTLED_COLLECTION, ACCOUNT).slips.slipwin01.payout, 120);
  assert.equal(doc(WALLET_COLLECTION, ACCOUNT).entries.filter(e => e.id.endsWith('slipwin01') && e.kind !== 'stake').length, 1);
  // Settled first: the cash out gets the result instead.
  const late = await post(deps, { op: 'cashout', id: 'slipwin02', value: 120 });
  assert.equal(late.body.settled.payout, 180);
  // A slip the Worker never watched: no cash out.
  assert.equal((await post(deps, { op: 'cashout', id: 'neverseen1', value: 50 })).body.refused.problem, 'unknown');
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
  assert.equal(nextLook(s, now), Date.parse(START) + 2.4 * 3_600_000 + 5 * 60_000);
  assert.equal(nextLook({ ...s, legs: [{ ...s.legs[0], result: 'won' }, s.legs[1]] }, now), Date.parse('2026-10-11T14:00:00Z') + 1.85 * 3_600_000 + 5 * 60_000);
  // Past that: every 3 minutes until it's final; long after (put off), every 15.
  const over = Date.parse(START) + 2.6 * 3_600_000;
  assert.equal(nextLook(s, over), over + 3 * 60_000);
  const long = Date.parse(START) + 7 * 3_600_000;
  assert.equal(nextLook(s, long), long + 15 * 60_000);
});

test('a slip is placed through the Worker: checked, its stake taken, watched; all or none', async () => {
  const now = { t: Date.parse('2026-10-13T20:00:00Z') };
  const { store, deps, doc } = setup(now);
  wallet(store, [{ id: 'eco:start', t: 1, app: 'eco', kind: 'start', amount: 1000 }]);
  const checked = [];
  deps.checkSlip = async slip => (checked.push(slip.id), slip.id === 'badprice01' ? { problem: 'moved', moved: [{ id: slip.legs[0].id, odds: 1.7 }] } : { ok: true });
  const later = { ...leg('home'), start: '2026-10-14T23:10:00Z' };
  const r = await post(deps, { op: 'place', slips: [slip('slipwin01', [later]), slip('slipwin02', [later])] });
  assert.deepEqual(r.body.placed, ['slipwin01', 'slipwin02']);
  const w = doc(WALLET_COLLECTION, ACCOUNT);
  assert.equal(w.entries.filter(e => e.kind === 'stake').reduce((s, e) => s + e.amount, 0), -200);
  assert.ok(doc(OPEN_COLLECTION, `${ACCOUNT}_slipwin01`));
  // Placed again: refused, nothing taken twice.
  assert.equal((await post(deps, { op: 'place', slips: [slip('slipwin01', [later])] })).body.refused.problem, 'placed');
  // A price better than the house's: the house's price back, nothing taken.
  const bad = await post(deps, { op: 'place', slips: [slip('slipwin03', [later]), slip('badprice01', [later])] });
  assert.equal(bad.body.refused.problem, 'moved');
  assert.equal(bad.body.refused.moved[0].odds, 1.7);
  assert.ok(!doc(WALLET_COLLECTION, ACCOUNT).entries.some(e => e.id === 'odds:stake-slipwin03'));
  assert.equal(doc(OPEN_COLLECTION, `${ACCOUNT}_slipwin03`), null);
  // More than the pool holds: refused.
  assert.equal((await post(deps, { op: 'place', slips: [slip('bigslip001', [later], { stake: 5000, cost: 5000 })] })).body.refused.problem, 'funds');
});

test('op open watches nothing any more, a stake from before the lock-down or not (only placed slips are watched)', async () => {
  const now = { t: Date.parse('2026-10-13T20:00:00Z') };
  const { store, deps, doc } = setup(now);
  wallet(store, [{ id: 'odds:stake-sneaky0001', t: 1, app: 'odds', kind: 'stake', amount: -100 }]);
  const r = await post(deps, { op: 'open', slips: [slip('sneaky0001', [leg('home')])] });
  assert.equal(r.body.added, 0);
  assert.equal(doc(OPEN_COLLECTION, `${ACCOUNT}_sneaky0001`), null);
});

test('the dev door checks a slip\'s prices and places nothing; without it, no pass, no answer', async () => {
  const { deps, doc } = setup({ t: Date.parse('2026-10-13T20:00:00Z') });
  deps.checkSlip = async () => ({ ok: true });
  const ask = d => handlePlay({ method: 'POST', body: { op: 'check', slips: [slip('slipwin01', [leg('home')])] } }, env, {}, null, d);
  assert.deepEqual((await ask({ ...deps, dev: true })).body, { checked: [{ ok: true }] });
  assert.equal(doc(OPEN_COLLECTION, OPEN_INDEX), null);
  assert.equal((await ask(deps)).status, 401);
});

test('a slip as Play hands it over keeps what the price check reads (its mode, sizes, stake, boost, free bet)', async () => {
  const { cleanSlip: clean } = await import('../settle.js');
  const s = clean({ ...slip('parlay001', [leg('home'), { ...leg('away'), id: 'x|ml|away', gameId: 'g2' }], { mode: 'parlay', sizes: [2], boost: 1.5, free: 'eco:fb:welcome', freeValue: 200 }) });
  assert.equal(s.mode, 'parlay');
  assert.deepEqual(s.sizes, [2]);
  assert.equal(s.boost, 1.5);
  assert.equal(s.free, 'eco:fb:welcome');
  assert.equal(s.freeValue, 200);
});

test('a placed slip keeps the house\'s own bets: a pick sent with another line or side settles as priced', async () => {
  const { keptLeg } = await import('../price.js');
  // The house's bet: Reds to win at 1.8. The phone sends its id at that
  // price, but as an "over 0.5 runs" pick (a sure thing at 1.8).
  const house = { id: 'mlb|cubs-reds|ml|home', gameId: 'g1', kind: 'ml', side: 'home', sport: 'mlb', start: START, estOdds: 1.8, label: 'Reds', game: { away: { en: 'Chicago Cubs' }, home: { en: 'Cincinnati Reds' } } };
  const forged = { ...leg('home'), kind: 'total', side: 'over', line: 0.5, label: 'Reds', logo: 'x.png' };
  const kept = keptLeg(forged, house);
  assert.equal(kept.kind, 'ml');
  assert.equal(kept.side, 'home');
  assert.equal(kept.line, null);
  assert.equal(kept.odds, 1.8);
  assert.equal(kept.home, 'Cincinnati Reds');
  assert.equal(kept.logo, 'x.png');
});

test('a live pick is priced again after the delay, on fresh reads: moved by then, nothing is placed', async () => {
  const now = { t: Date.parse('2026-10-13T20:00:00Z') };
  const { store, deps, doc } = setup(now);
  wallet(store, [{ id: 'eco:start', t: 1, app: 'eco', kind: 'start', amount: 1000 }]);
  const calls = [];
  deps.livePrices = { read: async () => null };
  deps.liveDelayMs = 1;
  deps.checkSlip = async (s, w, prices) => (calls.push(prices === deps.livePrices ? 'fresh' : 'first'), prices === deps.livePrices ? { problem: 'moved', moved: [{ id: s.legs[0].id, odds: 1.2 }] } : { ok: true });
  const live = { ...leg('home'), live: true };
  const r = await post(deps, { op: 'place', slips: [slip('liveslip01', [live])] });
  assert.deepEqual(calls, ['first', 'fresh']);
  assert.equal(r.body.refused.problem, 'moved');
  assert.ok(!doc(WALLET_COLLECTION, ACCOUNT).entries.some(e => e.id === 'odds:stake-liveslip01'));
});

test('one free bet on two slips of one batch, or one slip sent twice: refused, nothing taken', async () => {
  const now = { t: Date.parse('2026-10-13T20:00:00Z') };
  const { store, deps, doc } = setup(now);
  wallet(store, [{ id: 'eco:start', t: 1, app: 'eco', kind: 'start', amount: 1000 }, { id: 'eco:fb:welcome', t: now.t, app: 'eco', kind: 'freebet', amount: 0, note: '200' }]);
  deps.checkSlip = async () => ({ ok: true });
  const later = { ...leg('home'), start: '2026-10-14T23:10:00Z' };
  const free = { free: 'eco:fb:welcome', freeValue: 200, stake: 200, cost: 0 };
  const twice = await post(deps, { op: 'place', slips: [slip('freeslip01', [later], free), slip('freeslip02', [later], free)] });
  assert.equal(twice.body.refused?.problem, 'free');
  const same = await post(deps, { op: 'place', slips: [slip('slipsame01', [later]), slip('slipsame01', [later])] });
  assert.equal(same.body.refused?.problem, 'shape');
  const w = doc(WALLET_COLLECTION, ACCOUNT);
  assert.ok(!w.entries.some(e => e.kind === 'stake' || e.kind === 'freebet' && e.app === 'odds'));
  assert.equal(doc(OPEN_COLLECTION, `${ACCOUNT}_freeslip01`), null);
  // One slip with the token: placed, the token spent once.
  const one = await post(deps, { op: 'place', slips: [slip('freeslip03', [later], free)] });
  assert.deepEqual(one.body.placed, ['freeslip03']);
  assert.equal(doc(WALLET_COLLECTION, ACCOUNT).entries.filter(e => e.id === 'odds:fb-eco:fb:welcome').length, 1);
});

test('a cash out whose payment failed after the slip was marked is paid by the cron, once', async () => {
  const now = { t: Date.parse('2026-10-10T21:00:00Z') };
  const { store, deps, doc } = setup(now);
  wallet(store, [{ id: 'odds:stake-slipcash01', t: 1, app: 'odds', kind: 'stake', amount: -100 }]);
  await watch(deps, [slip('slipcash01', [leg('home')])]);
  deps.cashOutQuote = async () => ({ value: 120, reason: '' });
  // The wallet's write fails (D1 down a moment) after the slip is marked cashed.
  const write = deps.fsWrite;
  deps.fsWrite = async (env, c, id, ...rest) => (c === WALLET_COLLECTION ? Promise.reject(new Error('D1 down')) : write(env, c, id, ...rest));
  await assert.rejects(post(deps, { op: 'cashout', id: 'slipcash01', value: 120 }), /D1 down/);
  deps.fsWrite = write;
  assert.equal(doc(OPEN_COLLECTION, `${ACCOUNT}_slipcash01`).state, 'cashed');
  assert.ok(!doc(WALLET_COLLECTION, ACCOUNT).entries.some(e => e.id === 'odds:payout-slipcash01'));
  now.t = Date.parse(START) + 4 * 3_600_000;
  await settleCron(env, deps);
  await settleCron(env, deps);
  const paid = doc(WALLET_COLLECTION, ACCOUNT).entries.filter(e => e.id === 'odds:payout-slipcash01');
  assert.deepEqual(paid.map(e => [e.kind, e.amount]), [['cashout', 120]]);
  assert.equal(doc(SETTLED_COLLECTION, ACCOUNT).slips.slipcash01.payout, 120);
  assert.equal(doc(OPEN_COLLECTION, `${ACCOUNT}_slipcash01`), null);
});
