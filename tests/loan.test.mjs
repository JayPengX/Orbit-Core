// 信貸 and 急難紓困 (kit/loan.mjs), with the Worker's payday (eco.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { LOAN, RELIEF, schedule, totalApr, loanOffer, loanEntries, activeLoan, loanOwed, payoffAmount, credit, debtOf, maxFor, reliefCheck, weekStart, WEEK, PAY_WEEK } from '../kit/loan.mjs';
import { paydayEntries, poolBalance, mergeWallet, worthOf, rankEntries } from '../eco.js';

// Wednesday 4 Nov 2026, noon Taipei; the account is from before weekly pay.
const T0 = Date.UTC(2026, 10, 4, 4);
const DAY = 86_400_000;
const base = (cash = 200_000) => ({ v2: 1, created: Date.UTC(2026, 8, 1), entries: [{ id: 'eco:start', t: 1, app: 'eco', kind: 'start', amount: 200_000 }, { id: 'eco:topup:v12', t: 1, app: 'eco', kind: 'start', amount: 0 }, { id: 'seed', t: 1, app: 'odds', kind: 'stake', amount: cash - 200_000 }], snap: {}, settings: {} });
// Paid up to `now` (every Monday's pay and what the loan takes), like the Worker.
const at = (w, now) => mergeWallet(w, { entries: paydayEntries(w, now) });
const borrow = (w, amount, weeks, now = T0) => {
  const offer = loanOffer(w, amount, weeks, now);
  assert.ok(offer.ok, JSON.stringify(offer));
  return mergeWallet(w, { entries: loanEntries(offer, now) });
};
const spend = (w, amount, id = `spend-${amount}-${w.entries.length}`) => mergeWallet(w, { entries: [{ id, t: T0, app: 'odds', kind: 'stake', amount: -amount }] });

test('the schedule: equal weekly installments that clear the loan exactly', () => {
  const s = schedule(100_000, 0.12, 52);
  assert.equal(s.rows.length, 52);
  assert.equal(s.rows.at(-1).balance, 0);
  const total = s.rows.reduce((sum, r) => sum + r.amount, 0);
  // About 6.4% interest on a 1-year 12% amortised loan.
  assert.ok(total > 106_000 && total < 107_000, String(total));
  // The 開辦費 makes the true rate higher than the headline one.
  assert.ok(totalApr(100_000, 0.12, 52) > 0.17);
});

test('the offer: limits, the half-of-pay rule, terms and the new-account wait', () => {
  const w = base();
  const c = credit(w, T0);
  assert.deepEqual([c.apr, c.limit], [0.12, 100_000]);
  // An installment can't take more than half the weekly pay.
  assert.ok(maxFor(0.12, 52, 1e9) * 1.07 / 52 <= PAY_WEEK * LOAN.shareOfPay + 100);
  assert.equal(loanOffer(w, 100_000, 52, T0).ok, true);
  assert.equal(loanOffer(w, 150_000, 52, T0).why, 'amount');
  assert.equal(loanOffer(w, 40_000, 52, T0).why, 'amount');
  assert.equal(loanOffer(w, 100_000, 30, T0).why, 'term');
  // A pass made after weekly pay waits 4 weeks.
  const fresh = { created: T0 - DAY, entries: [] };
  assert.equal(loanOffer(fresh, 100_000, 52, T0).why, 'new');
  assert.equal(loanOffer(fresh, 100_000, 52, T0 + 28 * DAY).ok, true);
  // One at a time.
  assert.equal(loanOffer(borrow(w, 100_000, 52), 50_000, 52, T0).why, 'active');
});

test('borrowing pays the money in less the 開辦費, and the debt counts against worth (no level reward from a loan)', () => {
  const w = borrow(base(0), 100_000, 104);
  assert.equal(poolBalance(w), 100_000 - LOAN.fee);
  assert.equal(debtOf(w, T0), 100_000);
  assert.equal(worthOf(w, T0), -LOAN.fee);
  // 100,000 in cash would reach the 'steady' level; borrowed, it doesn't.
  assert.deepEqual(rankEntries(w, T0).map(e => e.id), []);
});

test('installments come out of each Monday’s pay, once each', () => {
  let w = borrow(base(0), 100_000, 52);
  const mon = weekStart(T0) + WEEK;
  w = at(w, mon + 3_600_000);
  const pays = w.entries.filter(e => e.kind === 'loanpay');
  assert.equal(pays.length, 1);
  assert.equal(pays[0].amount, -activeLoan(w).installment);
  assert.deepEqual(paydayEntries(w, mon + 7_200_000), []);
  // Four weeks on: four installments, four pays.
  w = at(w, mon + 3 * WEEK + 1);
  assert.equal(w.entries.filter(e => e.kind === 'loanpay').length, 4);
  assert.equal(w.entries.filter(e => e.id.startsWith('eco:wpay:')).length, 7);
});

test('a missed installment is late with a charge, collected when money arrives; 3 late is 催收', () => {
  let w = borrow(base(0), 100_000, 52);
  // Everything spent and more: overdrawn so the pay can't cover the installment.
  w = spend(w, 160_000);
  const mon = weekStart(T0) + WEEK;
  w = at(w, mon + 1);
  assert.equal(w.entries.filter(e => e.kind === 'loanpay').length, 0);
  assert.equal(w.entries.filter(e => e.kind === 'loanlate').length, 1);
  assert.ok(w.entries.find(e => e.kind === 'loanlate').amount < 0);
  // Money comes in: the overdue one is taken at once.
  w = mergeWallet(w, { entries: [{ id: 'win', t: mon + 2, app: 'odds', kind: 'payout', amount: 60_000 }] });
  w = at(w, mon + 3);
  assert.equal(w.entries.filter(e => e.kind === 'loanpay').length, 1);
  assert.equal(activeLoan(w).bad, null);
  // Broke again for three Mondays: 催收, the whole loan due, cash taken.
  w = spend(w, 200_000, 'broke');
  w = at(w, mon + 3 * WEEK + 1);
  const loan = activeLoan(w);
  assert.ok(loan.bad, 'in collection');
  assert.ok(loanOwed(loan, mon + 3 * WEEK + 1) > 90_000);
  assert.equal(credit(w, mon + 3 * WEEK + 1).inCollection, true);
  assert.equal(loanOffer(w, 50_000, 52, mon + 3 * WEEK + 1).ok, false);
});

test('催收: a third of every pay until it is paid, with interest; then a year of no loans at 16%', () => {
  let w = borrow(base(0), 50_000, 52);
  w = spend(w, 200_000);
  const mon = weekStart(T0) + WEEK;
  w = at(w, mon + 2 * WEEK + 1);
  assert.ok(activeLoan(w).bad);
  const owedAt = loanOwed(activeLoan(w), mon + 2 * WEEK + 1);
  w = at(w, mon + 3 * WEEK + 1);
  const gar = w.entries.filter(e => e.kind === 'loangar');
  assert.equal(gar.length, 1);
  assert.equal(gar[0].amount, -Math.round(PAY_WEEK / 3));
  // Interest ran on what was owed.
  assert.ok(Number(gar[0].note) > owedAt - Math.round(PAY_WEEK / 3));
  // Paid off from the balance: settled, and the record bans new loans for a year.
  w = mergeWallet(w, { entries: [{ id: 'win', t: 2, app: 'odds', kind: 'payout', amount: 200_000 }] });
  const loan = activeLoan(w);
  w = mergeWallet(w, { entries: [{ id: `eco:loanoff:${loan.id}`, t: mon + 3 * WEEK + 2, app: 'eco', kind: 'loanoff', amount: -payoffAmount(loan, mon + 3 * WEEK + 2) }] });
  assert.equal(activeLoan(w), null);
  const c = credit(w, mon + 4 * WEEK);
  assert.ok(c.bannedUntil > mon + 50 * WEEK);
  assert.equal(c.apr, LOAN.apr.max);
  assert.equal(loanOffer(w, 50_000, 52, mon + 4 * WEEK).why, 'record');
});

test('paying off early costs 2% of what is left in the first year; a clean loan earns a better rate and limit', () => {
  let w = borrow(base(), 100_000, 52);
  const loan = activeLoan(w);
  assert.equal(payoffAmount(loan, T0 + DAY), 100_000 + 2_000);
  // Paid on time to the end: settled clean.
  w = at(w, weekStart(T0) + 52 * WEEK + 1);
  assert.equal(activeLoan(w), null);
  const c = credit(w, weekStart(T0) + 52 * WEEK + 1);
  assert.deepEqual([c.clean, c.apr, c.limit], [1, 0.11, 150_000]);
});

test('急難紓困: only with nothing, once in 13 weeks, 3 a year, not near payday or in 催收', () => {
  const w = base(0);
  // Wednesday: payday 5 days away.
  assert.equal(reliefCheck(w, 1_500, T0).ok, true);
  assert.equal(reliefCheck(w, 2_500, T0).why, 'worth');
  // Saturday: payday under 2 days away.
  assert.equal(reliefCheck(w, 0, weekStart(T0) + 5 * DAY + 3_600_000).why, 'payday');
  const got = mergeWallet(w, { entries: [{ id: 'eco:relief:2026-11-02', t: T0, app: 'eco', kind: 'relief', amount: RELIEF.amount }] });
  assert.equal(reliefCheck(got, 0, T0 + 7 * WEEK).why, 'cooldown');
  assert.equal(reliefCheck(got, 0, T0 + 14 * WEEK).ok, true);
});
