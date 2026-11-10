import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEV, cleanDev } from '../kit/devconfig.mjs';
import { freshFor, quietFor } from '../sports.js';

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
  assert.equal(freshFor(live, { maxAge: 10, quiet: 600 }, settings), 600, 'a scoreboard with no game on: its quiet time');
  assert.equal(freshFor(live, { maxAge: 10, quiet: 0 }, { ...settings, proxyLive: 30 }), 30, 'never shorter than the seconds set');
});

test('a scoreboard is quiet until 5 minutes before its next game (10 minutes at most), never while a game is on', () => {
  const now = Date.parse('2026-10-15T04:00:00Z');
  const day = new URL('https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1/scoreboard?dates=20261015');
  const ev = (state, date, completed = state === 'post') => ({ date, status: { type: { state, completed } } });
  assert.equal(quietFor(day, { events: [] }, now), 600, 'no games: the most');
  assert.equal(quietFor(day, { events: [ev('post', '2026-10-15T01:00Z'), ev('pre', '2026-10-15T18:00Z')] }, now), 600, 'over, and the next hours away');
  assert.equal(quietFor(day, { events: [ev('pre', '2026-10-15T04:08Z')] }, now), 180, 'a start 8 minutes away: fresh 3');
  assert.equal(quietFor(day, { events: [ev('pre', '2026-10-15T04:03Z')] }, now), 0, 'about to start: live');
  assert.equal(quietFor(day, { events: [ev('pre', '2026-10-15T03:50Z')] }, now), 0, 'past its start, not begun: live');
  assert.equal(quietFor(day, { events: [ev('in', '2026-10-15T03:00Z'), ev('pre', '2026-10-15T18:00Z')] }, now), 0, 'a game on: live');
  assert.equal(quietFor(day, { events: [{ competitions: [{ date: '2026-10-15T18:00Z', status: { type: { state: 'pre' } } }] }] }, now), 600, "the competition's own status and date");
  assert.equal(quietFor(new URL('https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1/summary?event=1'), { events: [] }, now), 0, 'only scoreboards');
});

test("TDX's points and the guard: a month's 200 last, slower never off", async () => {
  const { tdxPoints, tdxGuard } = await import('../transit.js');
  const now = Date.parse('2026-10-11T04:00:00Z'); // 12:00 in Taiwan, the 11th
  const used = { 'tdx:b:2026-10-11': 1500, 'tdx:a:2026-10-11': 500, 'tdx:a:2026-10-02': 200 };
  const p = tdxPoints(used, now);
  assert.equal(p.today, 1 + 2.5);
  assert.equal(p.month, 4.5);
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

test("TDX's free tier (from 12-01, 3 points): a day's share for people, slower as it's used, the build's and our tools' kept apart, TDX not asked past 95%", async () => {
  const { tdxGuard, buildTdxMonth, devTdxDay } = await import('../transit.js');
  const now = Date.parse('2026-12-10T04:00:00Z'); // the 10th, 22 days left with today
  // 2.85 to spend, 0.48 before today, the build's 0.6 and our tools' 0.02 a day kept: 1.33 over 22 days.
  const share = (2.85 - 0.48 - buildTdxMonth(now) - devTdxDay(now) * 22) / 22;
  const g = used => tdxGuard({ month: 0.48 + used, today: used }, now);
  assert.ok(Math.abs(g(0.01).share - share) < 1e-9);
  assert.equal(g(share * 0.4).advanced, 1);
  assert.equal(g(share * 0.6).basic, 2);
  assert.equal(g(share * 0.9).basic, 4);
  assert.deepEqual([g(share * 1.2).basic, g(share * 1.2).why], [30, 'day']);
  // The weekly build's points today aren't people's (its month is kept apart).
  assert.equal(tdxGuard({ month: 0.98, today: 0.5, build: { month: 0.5, today: 0.5 } }, now).basic, 1);
  // Past 95% of the month: copies only.
  assert.equal(tdxGuard({ month: 2.86, today: 0.1 }, now).stop, true);
  // (銅級 until then: the 200 points' guard as before.)
  assert.equal(tdxGuard({ month: 0.5, today: 0.5 }, Date.parse('2026-11-20T04:00:00Z')).stop, undefined);
});
