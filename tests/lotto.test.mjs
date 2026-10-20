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
  assert.equal((await post(deps, { op: 'tickets', tickets: [{ id: 'lotto00003', game: 'daily539', sel: { zones: [[1, 2, 3, 4, 5]] }, periods: 24 }] })).body.refused.problem, 'funds');
  assert.equal((await post(deps, { op: 'tickets', tickets: [{ id: 'lotto00003', game: 'daily539', sel: { zones: [[1, 2, 3, 4, 5]] }, multiple: 2 }] })).body.refused.problem, 'multiple', '今彩539 takes no 倍數');
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

test('多期: a ticket a draw, each charged, watched and paid on its own', async () => {
  const now = { t: Date.parse('2026-10-12T04:00:00Z') }; // Monday
  const { deps, doc } = setup(now, money);
  const r = await post(deps, { op: 'tickets', tickets: [{ id: 'series001', game: 'daily539', sel: { zones: [[1, 2, 3, 4, 5]] }, periods: 3 }] });
  assert.deepEqual(r.body.tickets.map(x => [x.id, x.draw.date]), [['series001', '2026-10-12'], ['series001-2', '2026-10-13'], ['series001-3', '2026-10-14']]);
  assert.deepEqual(doc(WALLET_COLLECTION, ACCOUNT).entries.filter(e => e.kind === 'lottery').map(e => [e.id, e.amount]), [['odds:lotto-series001', -50], ['odds:lotto-series001-2', -50], ['odds:lotto-series001-3', -50]]);
  deps.drawFor = async (game, draw) => (draw.date === '2026-10-13' ? { numbers: [1, 2, 3, 30, 31], pools: {} } : { numbers: [10, 20, 30, 31, 32], pools: {} });
  now.t = Date.parse('2026-10-14T13:00:00Z');
  assert.equal((await lottoCron(env, deps)).settled, 3);
  assert.deepEqual(doc(WALLET_COLLECTION, ACCOUNT).entries.filter(e => e.kind === 'prize').map(e => [e.id, e.amount]), [['odds:prize-series001-2', 300]]);
  assert.deepEqual(doc(TICKET_COLLECTION, '_index').due, {});
});

test('a ticket whose pool tier is not paid out yet waits for it, and is paid when it is', async () => {
  const now = { t: Date.parse('2026-10-13T04:00:00Z') }; // Tuesday: 大樂透
  const { deps, doc } = setup(now, money);
  await post(deps, { op: 'tickets', tickets: [{ id: 'pool00001', game: 'lotto649', sel: { zones: [[1, 2, 3, 4, 5, 6]] } }] });
  deps.drawFor = async () => ({ numbers: [1, 2, 3, 4, 5, 6], special: 7, pools: {}, paid: false });
  now.t = Date.parse('2026-10-13T12:40:00Z');
  assert.equal((await lottoCron(env, deps)).settled, 0);
  assert.ok(doc(TICKET_COLLECTION, `${ACCOUNT}_pool00001`), 'still watched');
  assert.equal(doc(TICKET_COLLECTION, '_index').due[`${ACCOUNT}_pool00001`], now.t + 10 * 60_000);
  deps.drawFor = async () => ({ numbers: [1, 2, 3, 4, 5, 6], special: 7, pools: { jackpot: { perPrize: 0, winners: 0, pool: 300_000_000 } }, paid: true });
  now.t += 10 * 60_000;
  assert.equal((await lottoCron(env, deps)).settled, 1);
  assert.equal(doc(WALLET_COLLECTION, ACCOUNT).entries.find(e => e.id === 'odds:prize-pool00001').amount, Math.round(300_000_000 * 0.796));
});

test('a scratch card\'s prize is drawn by the Worker and paid once, when it is scratched', async () => {
  const now = { t: Date.parse('2026-10-12T04:00:00Z') };
  const { deps, doc } = setup(now, money);
  const r = await post(deps, { op: 'scratch', id: 'scratch001', card: 'lucky7' });
  const { ticket } = r.body;
  assert.equal(typeof ticket.prize, 'number');
  assert.equal(doc(WALLET_COLLECTION, ACCOUNT).entries.find(e => e.id === 'odds:lotto-scratch001').amount, -ticket.cost);
  assert.equal((await post(deps, { op: 'scratch', id: 'scratch002', card: 'palace' })).body.refused.problem, 'shape', 'a retired card is not sold');
  assert.equal((await post(deps, { op: 'scratch', id: 'scratch003', card: 'mahjong' })).body.refused.problem, 'funds', '大麻將 (NT$1,000) is sold: refused only for the NT$900 left');
  // 一觸即發 left the shops 2026-10-21 17:00 (Taiwan): sold until then, never after.
  now.t = Date.parse('2026-10-21T08:59:00Z');
  assert.ok((await post(deps, { op: 'scratch', id: 'scratch004', card: 'touch' })).body.ticket);
  now.t = Date.parse('2026-10-21T09:00:00Z');
  assert.equal((await post(deps, { op: 'scratch', id: 'scratch005', card: 'touch' })).body.refused.problem, 'shape', 'a card past its 下市日期 is not sold');
  now.t = Date.parse('2026-10-12T04:00:00Z');
  const first = await post(deps, { op: 'reveal', id: 'scratch001' });
  assert.equal(first.body.prize, ticket.prize > 5000 ? Math.round(ticket.prize * 0.796) : ticket.prize);
  assert.equal((await post(deps, { op: 'reveal', id: 'scratch001' })).body.refused.problem, 'unknown');
  assert.ok(doc(WALLET_COLLECTION, ACCOUNT).entries.filter(e => e.id === 'odds:prize-scratch001').length <= 1);
});

test('one ticket id twice in a sale: refused, nothing charged', async () => {
  const now = { t: Date.parse('2026-10-12T04:00:00Z') };
  const { deps, doc } = setup(now, money);
  const t = { id: 'lotto00009', game: 'daily539', sel: { zones: [[1, 2, 3, 4, 5]] }, multiple: 1 };
  const r = await post(deps, { op: 'tickets', tickets: [t, { ...t, sel: { zones: [[6, 7, 8, 9, 10]] } }] });
  assert.equal(r.body.refused?.problem, 'shape');
  assert.ok(!doc(WALLET_COLLECTION, ACCOUNT).entries.some(e => e.kind === 'lottery'));
});

test('a ticket of a game no longer sold (雙贏彩) gets its cost back once, and is watched no more', async () => {
  const now = { t: Date.parse('2026-10-19T13:00:00Z') };
  const { store, deps, doc } = setup(now, [...money, { id: 'odds:lotto-house00001', t: 1, app: 'odds', kind: 'lottery', amount: -50 }]);
  const key = `${ACCOUNT}_house00001`;
  const ticket = { id: 'house00001', t: '2026-10-19T04:00:00Z', game: 'lotto1224', draw: { date: '2026-10-19', at: Date.parse('2026-10-19T12:30:00Z') }, sel: { zones: [[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]] }, bets: 1, multiple: 1, cost: 50, status: 'open' };
  store.set(`${TICKET_COLLECTION}/${key}`, { payload: JSON.stringify({ account: ACCOUNT, ticket, t: 1 }), updateTime: 't1' });
  store.set(`${TICKET_COLLECTION}/_index`, { payload: JSON.stringify({ due: { [key]: ticket.draw.at + 180_000 } }), updateTime: 'i1' });
  await lottoCron(env, deps);
  await lottoCron(env, deps);
  assert.deepEqual(doc(WALLET_COLLECTION, ACCOUNT).entries.filter(e => e.id === 'odds:refund-house00001').map(e => [e.kind, e.amount]), [['refund', 50]]);
  assert.equal(doc(TICKET_COLLECTION, key), null);
  assert.deepEqual(doc(TICKET_COLLECTION, '_index').due, {});
});

test("a draw keeps its 期別 (第 N 期), as Taiwan Lottery's results give it", async () => {
  const { parseDraw } = await import('../kit/play-lottery.mjs');
  const r = { period: 115000097, drawNumberSize: [6, 15, 21, 30, 40, 43, 49] };
  assert.equal(parseDraw('lotto649', r).term, 115000097);
  assert.equal(parseDraw('star3', { period: 115000252, drawNumberAppear: [6, 1, 1] }).term, 115000252);
  assert.equal('term' in parseDraw('daily539', { drawNumberSize: [1, 2, 3, 4, 5] }), false);
});
