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

// ---- Each quota from what was really used (quotas, splitHours) ----
import { quotas, splitHours, TYPICAL_CPU_MS } from '../capacity.js';
import { PLAN } from '../guard.js';

const HOUR = 3_600_000;
const NOW = Date.parse('2026-11-03T06:30:00Z');
// 7 days hour by hour: the crons' 500 requests and 20,000 CPU ms every hour,
// plus people in Taiwan's day (08:00–24:00) 1,000 requests and 10,000 ms an hour.
const week = (() => {
  const end = Math.floor(NOW / HOUR) * HOUR;
  const out = [];
  for (let t = end - 7 * 24 * HOUR; t < end; t += HOUR) {
    const tw = new Date(t + 8 * HOUR).getUTCHours();
    const busy = tw >= 8;
    out.push([t, 500 + (busy ? 1000 : 0), 20_000 + (busy ? 10_000 : 0)]);
  }
  return { hours: out };
})();
const guardOf = (share = {}) => {
  const period = { from: Date.parse('2026-10-12T00:00:00Z'), start: Date.parse('2026-10-13T00:00:00Z'), end: Date.parse('2026-11-13T00:00:00Z') };
  const use = Object.fromEntries(Object.keys(PLAN).map(k => [k, (share[k] || 0) * PLAN[k]]));
  return { plan: PLAN, stopAt: 0.9, period, use, projected: use };
};

test('splitHours: the quietest tenth of the hours is the floor; people are what is above it', () => {
  const s = splitHours(week, NOW);
  assert.equal(s.requests.fixed, 500 * 24);
  assert.equal(s.requests.day, 500 * 24 + 1000 * 16);
  assert.equal(s.requests.people, 1000 * 16);
  assert.equal(s.cpuMs.fixed, 20_000 * 24);
  assert.equal(s.cpuMs.people, 10_000 * 16);
  // Under 5 days of hours: not known.
  assert.equal(splitHours({ hours: week.hours.slice(-100) }, NOW), null);
  assert.equal(splitHours(null, NOW), null);
});

test('splitHours: a week that is nearly all crons still leaves people a tenth (the people held err low)', () => {
  const flat = { hours: week.hours.map(([t]) => [t, 100, 1000]) };
  const s = splitHours(flat, NOW);
  assert.equal(s.requests.people, s.requests.day * 0.1);
});

test('splitHours: with people\'s part read (requests near Taiwan), that is what people use and the rest (crons, builders, our tools abroad) is fixed', () => {
  // The same week, with our tools abroad 3,000 requests and 20,000 CPU ms in every working hour of Taiwan's day.
  const mixed = { people: true, hours: week.hours.map(([t, n, c]) => {
    const tw = new Date(t + 8 * HOUR).getUTCHours();
    const busy = tw >= 8;
    const tools = tw >= 9 && tw < 18;
    return [t, n + (tools ? 3000 : 0), c + (tools ? 20_000 : 0), busy ? 1000 : 0, busy ? 10_000 : 0];
  }) };
  const s = splitHours(mixed, NOW);
  assert.equal(s.cpuMs.near, true);
  assert.equal(s.cpuMs.people, 10_000 * 16);
  assert.equal(s.cpuMs.day, 20_000 * 24 + 10_000 * 16 + 20_000 * 9);
  assert.equal(s.cpuMs.fixed, 20_000 * 24 + 20_000 * 9);
  assert.equal(s.requests.people, 1000 * 16);
  // The quiet-hour way would have counted the tools as people's.
  const old = splitHours({ hours: mixed.hours.map(r => r.slice(0, 3)) }, NOW);
  assert.equal(old.cpuMs.near, false);
  assert.equal(old.cpuMs.people, 10_000 * 16 + 20_000 * 9);
  const q = quotas({ users: { week: 40 }, guard: guardOf({ cpuMs: 0.2 }), hours: mixed, now: NOW });
  const cpu = q.rows.find(r => r.key === 'cf:cpuMs');
  const capDay = (PLAN.cpuMs * 0.9) / 32;
  assert.equal(cpu.near, true);
  assert.equal(cpu.holds, Math.floor((40 * (capDay - (20_000 * 24 + 20_000 * 9))) / (10_000 * 16)));
  assert.ok(cpu.holds > 40);
  assert.equal(q.near, true);
  // Enough people to tell what one uses: no typical-use stand-in needed.
  assert.equal(q.typical.few, false);
  // Two people a week (the owner testing): the plan's people by typical use, about 1.2 s of CPU a day each.
  const two = quotas({ users: { week: 2 }, guard: guardOf({ cpuMs: 0.2 }), hours: mixed, now: NOW });
  assert.equal(two.typical.few, true);
  assert.equal(two.typical.ms, TYPICAL_CPU_MS);
  assert.equal(two.typical.people, Math.floor((capDay - (20_000 * 24 + 20_000 * 9)) / TYPICAL_CPU_MS));
  assert.equal(quotas({ users: { week: 2 }, guard: guardOf({ cpuMs: 0.2 }), hours: null, now: NOW }).typical, null, 'no hours: no fixed part to take off');
});

test('quotas: people held = this week\'s × room after the fixed part ÷ what people use; the fewest is named', () => {
  const users = { week: 40 };
  const q = quotas({ users, guard: guardOf({ requests: 0.05, cpuMs: 0.2, r2ClassA: 0.07 }), hours: week, now: NOW });
  const cpu = q.rows.find(r => r.key === 'cf:cpuMs');
  const days = 32;
  const capDay = (PLAN.cpuMs * 0.9) / days;
  assert.equal(cpu.measured, true);
  assert.equal(cpu.holds, Math.floor((40 * (capDay - 20_000 * 24)) / (10_000 * 16)));
  assert.equal(cpu.slows, undefined, 'nobody is slowed before the people held: the guard paces only a count that would reach the stop');
  // R2 (no hours): all of it counted as people's, from the period's pace.
  const r2 = q.rows.find(r => r.key === 'cf:r2ClassA');
  assert.equal(r2.measured, false);
  assert.equal(r2.holds, Math.floor((40 * 0.9) / 0.07));
  assert.deepEqual(q.holds, { people: Math.min(...q.rows.filter(r => r.holds != null).map(r => r.holds)), key: q.holds.key });
  assert.equal(q.measured, true);
  // Storage isn't counted in people.
  assert.equal(q.rows.find(r => r.key === 'cf:kvBytes').holds, undefined);
});

test('quotas: Gemini by its busiest day, a paused feature never the limit; Maps and TDX carried to the month\'s end; Weather by place', () => {
  const users = { week: 20 };
  const usage = {
    ai: [
      { key: 'aiLaw', cap: 300, days: [5, 10, 30, 2, 0, 4, 6] },
      { key: 'aiMoneyRead', cap: 0, days: [0, 0, 0, 0, 0, 0, 0] }
    ],
    tdx: { points: 30, plan: { month: 200 }, guard: { why: '' } },
    weather: { googleToday: 200, cap: 450 }
  };
  const maps = { routes: { used: 900, month: 3000, cap: 9000 } };
  const q = quotas({ users, usage, maps, now: NOW });
  const law = q.rows.find(r => r.key === 'ai:aiLaw');
  assert.equal(law.holds, Math.floor((20 * 300) / 30));
  assert.equal(q.rows.find(r => r.key === 'ai:aiMoneyRead').paused, true);
  assert.equal(q.rows.find(r => r.key === 'maps:routes').holds, Math.floor((20 * 9000) / 3000));
  const tdx = q.rows.find(r => r.key === 'tdx:points');
  // Nov 3, 14:30 in Taiwan: 2.6 days gone of 30.
  assert.ok(Math.abs(tdx.month - (30 / (2 + 14.5 / 24)) * 30) < 1e-6);
  assert.equal(q.rows.find(r => r.key === 'weather:google').by, 'place');
  assert.equal(q.holds.key, 'tdx:points');
  // Nobody this week: nothing held, nothing named.
  assert.equal(quotas({ users: { week: 0 }, usage, maps, now: NOW }).holds, null);
});

test('plan carries the quotas', () => {
  const u = { ...estimateUsers({ active: { day: 4, week: 8 }, apps: { transit: { week: 4 } }, newWeek: 0 }), apps: { transit: 4 } };
  const p = plan({ users: u, base, guard: guardOf({ cpuMs: 0.2 }), hours: week, usage: {}, now: NOW });
  assert.ok(p.quotas.rows.some(r => r.key === 'cf:cpuMs' && r.holds > 0));
});

test("quotas: Maps' and TDX's spends by our tools and the showcase's demo are taken off before people's", () => {
  const users = { week: 20 };
  const maps = { drive: { used: 600, month: 3000, fixed: 2000, cap: 3000 } };
  const usage = { tdx: { points: 30, devPoints: 6, showPoints: 0, plan: { month: 200 }, guard: { why: '' } } };
  const q = quotas({ users, usage, maps, now: NOW });
  const drive = q.rows.find(r => r.key === 'maps:drive');
  assert.equal(drive.fixedMonth, 2000);
  assert.equal(drive.perPerson, 1000 / 20);
  assert.equal(drive.holds, Math.floor((20 * (3000 - 2000)) / 1000));
  const tdx = q.rows.find(r => r.key === 'tdx:points');
  // Nov 3, 14:30 in Taiwan: 2.6 days gone of 30.
  const carry = n => (n / (2 + 14.5 / 24)) * 30;
  assert.ok(Math.abs(tdx.fixedMonth - carry(6)) < 1e-6);
  assert.equal(tdx.holds, Math.floor((20 * (200 - carry(6))) / (carry(30) - carry(6))));
  // The plan carries each SKU's own share from the meter's dev:/show: counts.
  const u = { ...estimateUsers({ active: { day: 4, week: 8 }, apps: { transit: { week: 4 } }, newWeek: 0 }), apps: { transit: 4 } };
  const p = plan({ users: u, base, usage: { transit: { drive: { used: 600, cap: 3000, dev: 300, show: 100 } } }, now: Date.parse('2026-10-10T04:00:00Z') });
  assert.equal(p.maps.drive.month, Math.round((600 / 10) * 31));
  assert.equal(p.maps.drive.fixed, Math.round((400 / 10) * 31));
  assert.equal(p.maps.drive.holds, Math.floor(((3000 - (400 / 10) * 31) / ((200 / 10) * 31)) * 4));
});
