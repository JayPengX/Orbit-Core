import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEV, cleanDev } from '../kit/devconfig.mjs';
import { freshFor } from '../sports.js';

test('developer settings: each in range, a bad or missing one its default', () => {
  const d = cleanDev({ sportsGame: 1, sportsList: '30', f1Board: 'x', mirror: 'no', extra: 5 });
  assert.equal(d.sportsGame, DEV.sportsGame.min);
  assert.equal(d.sportsList, 30);
  assert.equal(d.f1Board, DEV.f1Board.def);
  assert.equal(d.mirror, true);
  assert.equal('extra' in d, false);
  assert.deepEqual(cleanDev(), Object.fromEntries(Object.entries(DEV).map(([k, s]) => [k, s.def])));
});

test("the proxy's live cache: the seconds set, or half the source's max-age, and a game over its hours", () => {
  const live = { tier: 'live', fresh: 10 };
  const settings = cleanDev({ proxyLive: 2, proxyFinalH: 12 });
  assert.equal(freshFor(live, { maxAge: 10 }, settings), 2);
  assert.equal(freshFor(live, { maxAge: 10 }, { ...settings, proxyLive: 0 }), 5);
  assert.equal(freshFor(live, { maxAge: 4 }, { ...settings, proxyLive: 0 }), 2);
  assert.equal(freshFor(live, {}, { ...settings, proxyLive: 0 }), 10, 'no max-age: the tier its own');
  assert.equal(freshFor(live, { final: true }, settings), 12 * 3600);
  assert.equal(freshFor({ tier: 'standings', fresh: 1800 }, { maxAge: 10 }, settings), 1800, 'only live answers follow');
});

test("TDX's points and the guard: a month's 200 last, slower never off", async () => {
  const { tdxPoints, tdxGuard } = await import('../transit.js');
  const now = Date.parse('2026-10-11T04:00:00Z'); // 12:00 in Taiwan, the 11th
  const used = { tdx: 4000, 'tdx:b:2026-10-11': 1500, 'tdx:a:2026-10-11': 500 };
  const p = tdxPoints(used, now);
  assert.equal(p.today, 1 + 2.5);
  // 2,000 counted before the days were: at the 25% advanced seen since.
  assert.ok(Math.abs(p.month - (3.5 + 2000 * (0.25 / 200 + 0.75 / 1500))) < 1e-9);
  // Never in the way while the rest of the month is covered at the owner's pace.
  assert.equal(tdxGuard(p, now).advanced, 1);
  // 55 used over 10 days (5.5 a day): 20 days more need 110. A heavy day of 30: 115 left, still fine.
  assert.equal(tdxGuard({ month: 85, today: 30 }, now).advanced, 1);
  // 40 today: 105 left, 5 short of the 110 (under 10%): 2x; then 4x, 8x.
  assert.equal(tdxGuard({ month: 95, today: 40 }, now).advanced, 2);
  assert.equal(tdxGuard({ month: 115, today: 60 }, now).advanced, 4);
  assert.equal(tdxGuard({ month: 150, today: 95 }, now).advanced, 8);
  // Quiet days leave more: 5 used by the 11th, a 100-point day is fine.
  assert.equal(tdxGuard({ month: 105, today: 100 }, now).advanced, 1);
  assert.deepEqual(tdxGuard({ month: 192, today: 1 }, now), { advanced: 30, basic: 3, why: 'month' });
});
