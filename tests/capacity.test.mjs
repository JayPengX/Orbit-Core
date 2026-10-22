import test from 'node:test';
import assert from 'node:assert/strict';
import { estimateUsers, cfLoad, scaleFor, applyScale, plan, CF_DAY, CF_SHARE, SCALED } from '../capacity.js';
import { cleanDev, DEV } from '../kit/brand.mjs';

const base = cleanDev();

test('estimateUsers: the next 30 days from the last two weeks of new passes', () => {
  const u = estimateUsers({ active: { day: 10, week: 20, month: 30 }, apps: { match: { week: 20 }, transit: { week: 10 } }, newWeek: 7, newPrev: 7 });
  assert.equal(u.expected, 50);
  assert.equal(u.growth, 2.5);
  // The day's own share (10 of 20) when higher than the usual 55%? 0.5 < 0.55: the usual.
  assert.equal(u.daily.match, 20 * 0.55);
});

test('few people: the owner\'s own numbers, untouched', () => {
  const u = estimateUsers({ active: { day: 3, week: 5 }, apps: { match: { week: 5 }, stock: { week: 3 } }, newWeek: 1 });
  assert.equal(scaleFor(base, u.daily, u.growth), 1);
  assert.deepEqual(applyScale(base, 1), base);
});

test('many people: the live refreshes slowed together until the plan fits, never past their slowest', () => {
  const u = estimateUsers({ active: { day: 300, week: 400 }, apps: { match: { week: 400 }, stock: { week: 250 }, transit: { week: 150 } }, newWeek: 0 });
  const s = scaleFor(base, u.daily, u.growth);
  assert.ok(s > 1);
  const applied = applyScale(base, s);
  for (const k of SCALED) {
    assert.ok(applied[k] >= base[k]);
    assert.ok(applied[k] <= DEV[k].max);
  }
  assert.ok(cfLoad(applied, u.daily).total <= CF_DAY * CF_SHARE * 1.02);
  // What isn't a live refresh stays the owner's.
  assert.equal(applied.proxyFinalH, base.proxyFinalH);
});

test('plan: Maps carried to the month\'s end, and the people it holds', () => {
  const u = { ...estimateUsers({ active: { day: 4, week: 8 }, apps: { transit: { week: 4 } }, newWeek: 4 }), apps: { transit: 4 } };
  const p = plan({ users: u, base, usage: { transit: { routes: { used: 1000, cap: 9000 } } }, now: Date.parse('2026-10-10T04:00:00Z') });
  assert.equal(p.maps.routes.month, Math.round((1000 / 10) * 31));
  assert.equal(p.maps.routes.holds, Math.floor((9000 / 3100) * 4));
  assert.equal(p.scale, 1);
  assert.ok(p.cf.holds > 8);
});
