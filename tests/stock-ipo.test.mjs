import test from 'node:test';
import assert from 'node:assert/strict';
import { parseIpoList, rocDay, ipoOpen, ipoHold, ipoWon, ipoApplyEvent, ipoBackEvent, ipoWinEvent, IPO_FEE, IPO_WIN_FEE } from '../kit/stock-ipo.mjs';
import { replay } from '../kit/stock-account.mjs';
import { handleStock, FILLS_COLLECTION, moveBook, ipoDraw } from '../stock-fill.js';
import { checkStock, VERIFIED_COLLECTION } from '../stock-check.js';
import { pack } from '../kit/stock-codec.mjs';

// TWSE's list as it reads (publicForm, 2026-10-18): one drawn (湧盛, 0.65%),
// one in its window (和暢科技, 25 a share, not drawn), a bond, a cancelled one.
const FIELDS = ['序號', '抽籤日期', '證券名稱', '證券代號', '發行市場', '申購開始日', '申購結束日', '承銷股數', '實際承銷股數', '承銷價(元)', '實際承銷價(元)', '撥券日期(上市、上櫃日期)', '主辦券商', '申購股數', '總承銷金額(元)', '總合格件', '中籤率(%)', '取消公開抽籤 '];
const row = (draw, name, code, kind, from, to, price, real, list, qty, rate, cancel = '') => ['1', draw, name, code, kind, from, to, '1,000,000', '1,000,000', price, real, list, '凱基', qty, '0', '0', rate, cancel];
const LIST = (rateA = '0.65', rateB = '0') => ({
  stat: 'OK',
  fields: FIELDS,
  data: [
    row('115/10/16', '湧盛', '2249', '初上櫃', '115/10/12', '115/10/14', '66', '66', '115/10/22', '1,000', rateA),
    row('115/10/22', '和暢科技', '6825', '初上櫃', '115/10/16', '115/10/20', '25', '未訂出', '115/10/29', '1,000', rateB),
    row('115/10/20', '115央債甲09', 'A151IA', '中央登錄公債', '115/10/12', '115/10/16', '100', '100', '115/10/23', '1,000', '0'),
    row('115/10/20', '取消股', '1234', '初上市', '115/10/12', '115/10/16', '50', '50', '115/10/23', '1,000', '0', 'Y')
  ]
});
const H = 3_600_000;

test("新股申購: TWSE's list read as shares only, its days as Taipei midnights, the final price where set", () => {
  const list = parseIpoList(LIST());
  assert.deepEqual(list.map(s => s.code), ['2249', '6825']);
  const [a, b] = list;
  assert.equal(a.symbol, '2249.TWO');
  assert.equal(a.draw, Date.parse('2026-10-15T16:00:00Z'));
  assert.equal(rocDay('115/10/16'), a.draw);
  assert.equal(a.rate, 0.0065);
  assert.equal(b.price, 25, '未訂出: the listed price');
  assert.equal(b.rate, null);
  assert.equal(ipoHold(b), 25_020);
  assert.ok(ipoOpen(b, b.from + 10 * H) && !ipoOpen(b, b.from + 8 * H) && !ipoOpen(b, b.to + 15 * H));
});

test('新股申購 in the account: the money held, a loss back less NT$20, a win the shares at the offer price less NT$50', () => {
  const [s] = parseIpoList(LIST());
  const open = { id: 'deposit:start', type: 'deposit', t: 0, currency: 'TWD', amount: 100_000 };
  const apply = ipoApplyEvent(s, s.from + 10 * H);
  const held = replay({ events: [open, apply] }, apply.t + 1);
  assert.equal(held.cash.TWD, 100_000 - 66_000 - IPO_FEE);
  const lost = replay({ events: [open, apply, ipoBackEvent(apply)] }, s.draw + 2 * 86_400_000);
  assert.equal(lost.cash.TWD, 100_000 - IPO_FEE);
  assert.equal(lost.ipos['2249:' + s.draw].state, 'lost');
  const won = replay({ events: [open, apply, ipoWinEvent(apply)] }, s.list + 10 * H);
  assert.equal(won.cash.TWD, 100_000 - 66_000 - IPO_FEE - IPO_WIN_FEE);
  assert.equal(won.positions['2249.TWO'].qty, 1000);
  assert.equal(won.positions['2249.TWO'].cost, 66_000);
  // Both, or either twice: the first only.
  const both = replay({ events: [open, apply, ipoBackEvent(apply), ipoWinEvent(apply), { ...apply, id: 'again' }] }, s.list + 10 * H);
  assert.equal(both.cash.TWD, 100_000 - IPO_FEE);
  assert.equal(both.positions['2249.TWO'], undefined);
});

test('the draw: under the rate wins, a 100% rate always, none never', () => {
  assert.equal(ipoWon('00000000', 0.001), true);
  assert.equal(ipoWon('ffffffff', 0.999), false);
  assert.equal(ipoWon('ffffffff', 1), true);
  assert.equal(ipoWon('00000000', null), false);
});

// The Worker: an application seen in its window kept; one first asked after it never.
function workerDeps(list, now) {
  const docs = new Map();
  return {
    docs,
    json: (data, status = 200) => new Response(JSON.stringify(data), { status }),
    errorJson: (code, status) => new Response(JSON.stringify({ error: { code } }), { status }),
    fsGet: async (env, c, id) => (docs.has(`${c}/${id}`) ? { exists: true, payload: docs.get(`${c}/${id}`) } : { exists: false }),
    fsWrite: async (env, c, id, payload) => void docs.set(`${c}/${id}`, payload),
    now: () => now.t,
    read: async () => list.v
  };
}
const ENV = { ECO_TOKEN_SECRET: 'test-secret' };
const ask = (deps, apps, d = 'acct') => handleStock(new Request('https://x/stock', { method: 'POST', body: JSON.stringify({ op: 'ipo', apps }) }), ENV, {}, { a: 'stock', d }, deps).then(r => r.json());

test('/stock ipo: seen in its window, then drawn; asked first after the draw, nothing (no applying to a known win)', async () => {
  const list = { v: LIST('0', '0') };
  const [s] = parseIpoList(list.v);
  const key = `${s.code}:${s.draw}`;
  const now = { t: s.from + 10 * H };
  const deps = workerDeps(list, now);
  const first = await ask(deps, [key]);
  assert.equal(first.seen[key], now.t);
  assert.deepEqual(first.drawn, {});
  // The draw out at 100%: a win.
  list.v = LIST('100', '0');
  now.t = s.draw + 12 * H;
  const later = await ask(deps, [key]);
  assert.deepEqual(later.drawn[key], { won: true, rate: 1 });
  // Another account, never seen in the window: nothing.
  const late = await ask(deps, [key], 'other');
  assert.deepEqual(late, { seen: {}, drawn: {} });
});

// The checker: on TWSE's figures and the Worker's draw only.
test("the checker: an application at TWSE's price, seen in time, and the draw's own outcome count; anything else never", async () => {
  const list = { v: LIST('100', '0') };
  const [s] = parseIpoList(list.v);
  const key = `${s.code}:${s.draw}`;
  const LOCK = s.from - 30 * 86_400_000;
  const store = new Map([[`${FILLS_COLLECTION}/acct`, JSON.stringify({ v: 2, fills: {}, open: {}, ipo: { [key]: s.from + 10 * H } })]]);
  const d = {
    store,
    fsGet: async (env, c, id) => (store.has(`${c}/${id}`) ? { exists: true, payload: store.get(`${c}/${id}`) } : { exists: false }),
    fsWrite: async (env, c, id, payload) => void store.set(`${c}/${id}`, payload),
    read: async () => list.v
  };
  const start = [{ id: 'deposit:start', type: 'deposit', t: LOCK - 1000, currency: 'TWD', amount: 100_000 }];
  const account = events => ({ v: 1, id: 'a', created: LOCK - 1000, events, orders: [] });
  await checkStock(ENV, 'acct', await pack(account(start)), { entries: [] }, d, LOCK, LOCK);
  const apply = ipoApplyEvent(s, s.from + 10 * H);
  const forged = [
    // A cheaper price than TWSE's.
    { ...ipoBackEvent(apply), id: 'ipoback:x', amount: 99_000 },
    // A refund on a draw that was won.
    ipoBackEvent(apply)
  ];
  const r = await checkStock(ENV, 'acct', await pack(account([...start, apply, ipoWinEvent(apply), ...forged])), { entries: [] }, d, LOCK, s.list + 10 * H);
  assert.deepEqual(r.refused.sort(), ['ipoback:2249:' + s.draw, 'ipoback:x'].sort());
  assert.equal(r.cash, 100_000 - 66_000 - IPO_FEE - IPO_WIN_FEE);
  assert.equal(r.held, 66_000);
  // An application at a price below TWSE's: refused.
  store.delete(`${VERIFIED_COLLECTION}/acct`);
  await checkStock(ENV, 'acct', await pack(account(start)), { entries: [] }, d, LOCK, LOCK);
  const cheap = { ...apply, price: 1 };
  const r2 = await checkStock(ENV, 'acct', await pack(account([...start, cheap])), { entries: [] }, d, LOCK, apply.t + 1);
  assert.deepEqual(r2.refused, [cheap.id]);
});

test('/stock ipo after a merge: an application made on the old pass is drawn as that pass, not the new one', async () => {
  // A rate at which the two accounts' draws differ.
  let list, s;
  for (const pct of ['10', '20', '30', '40', '50', '60', '70', '80', '90']) {
    list = { v: LIST(pct, '0') };
    [s] = parseIpoList(list.v);
    if ((await ipoDraw(ENV, 'from', s)) !== (await ipoDraw(ENV, 'to', s))) break;
  }
  const key = `${s.code}:${s.draw}`;
  const now = { t: s.from + 10 * H };
  assert.notEqual(await ipoDraw(ENV, 'from', s), await ipoDraw(ENV, 'to', s));
  const deps = { ...workerDeps(list, now) };
  deps.fsDelete = async (env, c, id) => void deps.docs.delete(`${c}/${id}`);
  await ask(deps, [key], 'from');
  await moveBook(ENV, deps, 'from', 'to', now.t);
  now.t = s.draw + 12 * H;
  const r = await ask(deps, [key], 'to');
  assert.equal(r.seen[key], s.from + 10 * H);
  assert.equal(r.drawn[key].won, await ipoDraw(ENV, 'from', s));
});
