import test from 'node:test';
import assert from 'node:assert/strict';
import { handlePlay } from '../settle.js';
import { lottoCron, TICKET_COLLECTION } from '../lotto.js';
import { WALLET_COLLECTION } from '../eco.js';

const ACCOUNT = 'b'.repeat(64);
const env = { STORE: {} };
const session = { d: ACCOUNT, s: 'sid', a: 'odds' };
function setup(now, entries) {
  const store = new Map();
  let clock = 0;
  const k = (c, id) => `${c}/${id}`;
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
      store.set(k(c, id), { payload, updateTime: String(++clock) });
      return { updateTime: String(clock) };
    },
    fsDelete: async (env, c, id) => void store.delete(k(c, id)),
    now: () => now.t
  };
  store.set(k(WALLET_COLLECTION, ACCOUNT), { payload: JSON.stringify({ v: 1, created: 0, entries, snap: {}, settings: {}, apps: {}, inbox: {} }), updateTime: 'w0' });
  const doc = (c, id) => (store.has(k(c, id)) ? JSON.parse(store.get(k(c, id)).payload) : null);
  return { store, deps, doc };
}
const post = (deps, body) => handlePlay({ method: 'POST', body }, env, {}, session, deps);
const money = [{ id: 'eco:start', t: 1, app: 'eco', kind: 'start', amount: 1000 }];

test('lottery tickets are sold by the Worker (its clock, its check, the cost from the pool) and paid from the real draw', async () => {
  // Monday 2026-10-12 12:00 Taiwan: today's 今彩539 draws at 20:30.
  const now = { t: Date.parse('2026-10-12T04:00:00Z') };
  const { deps, doc } = setup(now, money);
  const r = await post(deps, { op: 'tickets', tickets: [{ id: 'lotto00001', game: 'daily539', sel: { zones: [[1, 2, 3, 4, 5]] }, multiple: 1 }] });
  const ticket = r.body.tickets[0];
  assert.equal(ticket.draw.date, '2026-10-12');
  assert.equal(doc(WALLET_COLLECTION, ACCOUNT).entries.find(e => e.id === 'odds:lotto-lotto00001').amount, -ticket.cost);
  // A selection the game doesn't take, or more than the pool: refused, nothing taken.
  assert.ok((await post(deps, { op: 'tickets', tickets: [{ id: 'lotto00002', game: 'daily539', sel: { zones: [[1, 2]] }, multiple: 1 }] })).body.refused);
  assert.equal((await post(deps, { op: 'tickets', tickets: [{ id: 'lotto00003', game: 'daily539', sel: { zones: [[1, 2, 3, 4, 5]] }, multiple: 50 }] })).body.refused.problem, 'funds');
  // Before the draw: nothing.
  deps.drawFor = async () => ({ numbers: [1, 2, 3, 4, 5], pools: {} });
  assert.equal((await lottoCron(env, deps)).settled, 0);
  now.t = Date.parse('2026-10-12T12:40:00Z');
  assert.equal((await lottoCron(env, deps)).settled, 1);
  const prize = doc(WALLET_COLLECTION, ACCOUNT).entries.filter(e => e.id === 'odds:prize-lotto00001');
  assert.equal(prize.length, 1);
  assert.ok(prize[0].amount > 5_000);
  assert.equal(doc(TICKET_COLLECTION, `${ACCOUNT}_lotto00001`), null);
  // Run again: paid once.
  await lottoCron(env, deps);
  assert.equal(doc(WALLET_COLLECTION, ACCOUNT).entries.filter(e => e.id === 'odds:prize-lotto00001').length, 1);
});

test('a scratch card\'s prize is drawn by the Worker and paid once, when it is scratched', async () => {
  const now = { t: Date.parse('2026-10-12T04:00:00Z') };
  const { deps, doc } = setup(now, money);
  const r = await post(deps, { op: 'scratch', id: 'scratch001', card: 'lucky7' });
  const { ticket } = r.body;
  assert.equal(typeof ticket.prize, 'number');
  assert.equal(doc(WALLET_COLLECTION, ACCOUNT).entries.find(e => e.id === 'odds:lotto-scratch001').amount, -ticket.cost);
  const first = await post(deps, { op: 'reveal', id: 'scratch001' });
  assert.equal(first.body.prize, ticket.prize > 5000 ? Math.round(ticket.prize * 0.796) : ticket.prize);
  assert.equal((await post(deps, { op: 'reveal', id: 'scratch001' })).body.refused.problem, 'unknown');
  assert.ok(doc(WALLET_COLLECTION, ACCOUNT).entries.filter(e => e.id === 'odds:prize-scratch001').length <= 1);
});

test('tickets from before the lock-down are watched no more: a ticket handed over could name its own prize', async () => {
  const now = { t: Date.parse('2026-10-13T04:00:00Z') };
  const { deps, doc } = setup(now, [...money, { id: 'odds:lotto-oldcard001', t: 1, app: 'odds', kind: 'lottery', amount: -100 }, { id: 'odds:lotto-newcard001', t: now.t, app: 'odds', kind: 'lottery', amount: -100 }, { id: 'odds:lotto-oldcard002', t: 1, app: 'odds', kind: 'lottery', amount: -100 }]);
  const card = id => ({ id, t: '2026-10-01T00:00:00Z', game: 'scratch:lucky7', card: 'lucky7', cost: 100, prize: 500, seed: 7, status: 'open' });
  const r = await post(deps, { op: 'tickets-open', tickets: [card('oldcard001'), card('newcard001'), { ...card('oldcard002'), prize: 999_999 }] });
  assert.equal(r.body.watching, 0);
  assert.equal(doc(TICKET_COLLECTION, `${ACCOUNT}_oldcard001`), null);
  assert.equal((await post(deps, { op: 'reveal', id: 'oldcard001' })).body.refused.problem, 'unknown');
});
