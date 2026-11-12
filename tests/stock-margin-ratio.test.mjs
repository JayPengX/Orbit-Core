// 整戶擔保維持率, as Taiwan's brokers work it: the 融資 and 融券 collateral over
// what they owe, the account's cash not counted. Every number worked by hand.
import test from 'node:test';
import assert from 'node:assert/strict';
import { replay, valuate, callNeed, callState, ratioAfter, payDown } from '../kit/stock-account.mjs';
import { MARGIN_CALL, MARGIN_RESTORE } from '../kit/stock-markets.mjs';

const at = s => Date.parse(`${s}+08:00`);
const T = at('2026-11-16T09:30:00'); // a Monday
const RATES = { TWD: 1 };
const fill = (id, symbol, side, qty, price, more = {}) => ({
  id, type: 'fill', t: T, side, symbol, name: symbol, kind: 'stock', market: 'TW', currency: 'TWD',
  qty, price, gross: qty * price, total: qty * price, commission: 0, tax: 0, fee: 0, ...more
});
// NT$1,000,000 in; 2330 bought 1,000 shares at 100 on 融資 (NT$60,000 lent,
// no interest here) and 500 more with cash (現股).
function account(withShort = false) {
  const events = [
    { id: 'a0', type: 'deposit', t: T - 1, currency: 'TWD', amount: 1_000_000 },
    { id: 'a1', type: 'credit', t: T - 1, from: T - 1, limit: 5_000_000 },
    fill('a2', '2330.TW', 'buy', 1000, 100, { financed: 60_000 }),
    { id: 'a3', type: 'borrow', t: T, currency: 'TWD', amount: 60_000, rate: 0, symbol: '2330.TW' },
    fill('a4', '2330.TW', 'buy', 500, 100)
  ];
  // 融券: 1,000 shares of 2317 sold at 200, a 90% deposit (NT$180,000) and the
  // NT$200,000 sale money held by the broker.
  if (withShort) events.push(fill('a5', '2317.TW', 'sell', 1000, 200, { credit: true }));
  return { id: 'acc', created: T - 1, events, orders: [], snapshots: {}, watch: {} };
}
const quote = (symbol, price) => [symbol, { symbol, name: symbol, kind: 'stock', market: 'TW', currency: 'TWD', price, prev: price, pct: 0 }];
const val = (a, prices, t = T) => valuate(replay(a, t), new Map(Object.entries(prices).map(([s, p]) => quote(s, p))), RATES);

test('融資 alone: the margin shares over the loan; cash and 現股 don\'t count', () => {
  const a = account();
  const s = replay(a, T);
  assert.equal(s.positions['2330.TW'].marginQty, 1000);
  assert.equal(s.cash.TWD, 1_000_000 - 100_000 + 60_000 - 50_000);
  // At 100: 1,000 × 100 = 100,000 over 60,000 = 166.7%.
  let v = val(a, { '2330.TW': 100 });
  assert.equal(v.creditCover, 100_000);
  assert.equal(v.creditOwed, 60_000);
  assert.ok(Math.abs(v.ratio - 100_000 / 60_000) < 1e-12);
  // (Counted the old way, with the NT$910,000 cash and the 現股, it read 1,768%.)
  assert.ok(Math.abs((v.assets / v.owed) - (910_000 + 150_000) / 60_000) < 1e-9);
  assert.equal(v.margin, 'ok');
  // At 78: 78,000 / 60,000 = exactly 130%: no call yet.
  v = val(a, { '2330.TW': 78 });
  assert.ok(Math.abs(v.ratio - 1.3) < 1e-12);
  assert.equal(v.margin, 'ok');
  // At 77: 77,000 / 60,000 = 128.3%: a call (not with the cash counted).
  v = val(a, { '2330.TW': 77 });
  assert.ok(Math.abs(v.ratio - 77_000 / 60_000) < 1e-12);
  assert.ok(v.ratio < MARGIN_CALL);
  assert.equal(v.margin, 'call');
  // At 59: 59,000 / 60,000 = 98.3%: under 100%, sold at once.
  assert.equal(val(a, { '2330.TW': 59 }).margin, 'liquidate');
});

test('融資 and 融券 together: (融資 shares + 融券 deposit and sale money) ÷ (融資金額 + shorted shares\' value)', () => {
  const a = account(true);
  const s = replay(a, T);
  assert.equal(s.positions['2317.TW'].shortDeposit, 180_000);
  assert.equal(s.positions['2317.TW'].shortHeld, 200_000);
  // 2330 at 80, 2317 at 210:
  //   cover = 1,000 × 80 + 180,000 + 200,000 = 460,000
  //   owed  = 60,000 + 1,000 × 210            = 270,000  →  170.4%
  const v = val(a, { '2330.TW': 80, '2317.TW': 210 });
  assert.equal(v.creditCover, 460_000);
  assert.equal(v.creditOwed, 270_000);
  assert.ok(Math.abs(v.ratio - 460_000 / 270_000) < 1e-12);
  // 2317 up to 290: owed 60,000 + 290,000 = 350,000; 460,000 / 350,000 = 131.4%, still ok;
  // at 300: 460,000 / 360,000 = 127.8%, a call.
  assert.equal(val(a, { '2330.TW': 80, '2317.TW': 290 }).margin, 'ok');
  const low = val(a, { '2330.TW': 80, '2317.TW': 300 });
  assert.ok(Math.abs(low.ratio - 460_000 / 360_000) < 1e-12);
  assert.equal(low.margin, 'call');
});

test('追繳 at 130% after the close; 補繳 of 融資金額 − cover ÷ 166% restores it', () => {
  const a = account();
  const v = val(a, { '2330.TW': 77 });
  // Intraday: nothing yet; after the close: a call for the 差額.
  assert.equal(callState(null, v, at('2026-11-16T10:00:00')).event, 'intraday');
  const c = callState(null, v, at('2026-11-16T14:00:00'));
  assert.equal(c.event, 'issued');
  // 60,000 − 77,000 ÷ 1.66 = 13,614.46 → NT$13,615.
  assert.equal(callNeed(v), 13_615);
  assert.equal(c.call.need, 13_615);
  // Paying it: 77,000 / (60,000 − 13,615) = 166.0%; NT$13,614 falls short.
  assert.ok(ratioAfter(v, 13_615) >= MARGIN_RESTORE);
  assert.ok(ratioAfter(v, 13_614) < MARGIN_RESTORE);
  assert.ok(Math.abs(ratioAfter(v, 10_000) - 77_000 / 50_000) < 1e-12);
  // Paid for real (against the holding's 融資): met.
  const t = at('2026-11-16T14:05:00');
  const paid = payDown(a, 13_615, { rates: RATES, now: t });
  assert.equal(paid.paid, 13_615);
  assert.equal(replay(paid.account, t).positions['2330.TW'].financed, 60_000 - 13_615);
  const vp = val(paid.account, { '2330.TW': 77 }, t);
  assert.ok(vp.ratio >= MARGIN_RESTORE, String(vp.ratio));
  assert.equal(callState(c.call, vp, t).event, 'met');
  // Not paid, still under 130% at the deadline: the margin shares are sold.
  assert.equal(callState(c.call, v, c.call.due + 3_600_000).sell, true);
});

test('a 融資 loan\'s interest isn\'t in the ratio; nothing owed reads ∞', () => {
  const a = account();
  a.events[3] = { ...a.events[3], rate: 0.065 };
  const later = T + 30 * 86_400_000;
  const v = val(a, { '2330.TW': 100 }, later);
  // The NT$ loan has grown by its interest, the 融資金額 hasn't.
  assert.ok(v.debtTWD > 60_000);
  assert.equal(v.creditOwed, 60_000);
  assert.ok(Math.abs(v.ratio - 100_000 / 60_000) < 1e-12);
  const none = valuate(replay({ ...a, events: a.events.slice(0, 2) }, T), new Map(), RATES);
  assert.equal(none.ratio, Infinity);
  assert.equal(none.margin, 'ok');
});
