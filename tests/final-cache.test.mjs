import { test } from 'node:test';
import assert from 'node:assert/strict';
import { settled, fillCpblMonth } from '../sports.js';

const u = x => new URL(x);
const game = (state, completed) => JSON.stringify({ header: { competitions: [{ status: { type: { state, completed } } }] } });
const day = (...done) => JSON.stringify({ events: done.map(completed => ({ status: { type: { completed } } })) });

test('a game over and a day all over are kept a day; anything still to change is not', () => {
  const summary = u('https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1/summary?event=1');
  assert.equal(settled(summary, game('post', true)), true);
  assert.equal(settled(summary, game('in', false)), false);
  const board = u('https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/scoreboard?dates=20261010&limit=200');
  assert.equal(settled(board, day(true, true)), true);
  assert.equal(settled(board, day(true, false)), false);
  assert.equal(settled(board, day()), false, 'a day with no games may yet have some');
  // "Today" (no date) moves on to the next day's games: never kept.
  assert.equal(settled(u('https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/scoreboard'), day(true)), false);
  assert.equal(settled(u('https://site.api.espn.com/apis/v2/sports/soccer/eng.1/standings'), day(true)), false);
  assert.equal(settled(summary, new TextEncoder().encode(game('post', true)).buffer), true);
});

test('a CPBL month is over for good only read whole; the days not read come from the nightly copy', () => {
  const sept = u('https://asia-baseball.orbit/cpbl/2026-09.json?v=2');
  const g = (start, state = 'post') => ({ id: start, start, state });
  // September 2026 as the route read it (its 16 days nearest October, most refused): 3 games, all over.
  const part = { games: [g('2026-09-30T10:35:00Z'), g('2026-09-30T10:36:00Z'), g('2026-09-30T10:37:00Z')], read: ['2026-09-30'] };
  assert.equal(settled(sept, JSON.stringify(part)), false);
  assert.equal(settled(sept, JSON.stringify({ ...part, whole: 1 })), true);
  // The nightly copy, whole: its days the route didn't read taken from it, the route's own day from the route.
  const kept = { games: [g('2026-09-02T10:35:00Z'), g('2026-09-30T10:35:00Z', 'pre')], whole: 1 };
  const filled = fillCpblMonth(part, kept);
  assert.deepEqual(filled.games.map(x => [x.start, x.state]), [['2026-09-02T10:35:00Z', 'post'], ...part.games.map(x => [x.start, 'post'])]);
  assert.equal(filled.whole, 1);
  assert.equal(settled(sept, JSON.stringify(filled)), true);
  // No nightly copy: as read, never whole.
  assert.equal(fillCpblMonth(part, null), part);
});
