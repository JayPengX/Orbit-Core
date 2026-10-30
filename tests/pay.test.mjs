// The weekly pay and 急難紓困 (kit/pay.mjs), with the Worker's payday (eco.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { RELIEF, reliefCheck, weekStart, WEEK, PAY_WEEK } from '../kit/pay.mjs';
import { paydayEntries, mergeWallet, worthOf } from '../eco.js';

// Wednesday 4 Nov 2026, noon Taipei; the account opened 5 Oct.
const T0 = Date.UTC(2026, 10, 4, 4);
const DAY = 86_400_000;
const base = (cash = 200_000) => ({ v2: 1, created: Date.UTC(2026, 9, 5), entries: [{ id: 'eco:start', t: 1, app: 'eco', kind: 'start', amount: 200_000 }, { id: 'seed', t: 1, app: 'stock', kind: 'fee', amount: cash - 200_000 }], snap: {}, settings: {} });

test('each Monday pays PAY_WEEK once, back pay included, and nothing else comes out of it', () => {
  const w = base();
  const pay = paydayEntries(w, T0).filter(e => e.kind === 'pay');
  assert.equal(pay.length, 5);
  assert.ok(pay.every(e => e.amount === PAY_WEEK));
  const paid = mergeWallet(w, { entries: paydayEntries(w, T0) });
  assert.equal(paydayEntries(paid, T0).filter(e => e.kind === 'pay').length, 0);
  assert.equal(worthOf(paid), 200_000 + 5 * PAY_WEEK + paid.entries.filter(e => e.kind === 'rank').reduce((s, e) => s + e.amount, 0));
});

test('急難紓困: only with nothing, once in 13 weeks, 3 a year, not near payday', () => {
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
