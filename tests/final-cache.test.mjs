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
  const sept = u('https://asia-baseball.orbit/cpbl/2026-09.json');
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

test('a finished F1 session is kept for good: 數據 with laps run, every lap once not the live log', () => {
  const u = path => new URL(`https://f1-live.orbit${path}`);
  const body = x => JSON.stringify(x);
  assert.equal(settled(u('/session.json?start=2026-10-18T19:00:00.000Z'), body({ final: true, cars: [{ laps: 56 }] })), true);
  assert.equal(settled(u('/session.json?start=2026-10-18T19:00:00.000Z'), body({ final: true, cars: [{ laps: 0 }] })), false);
  const cars = Object.fromEntries(Array.from({ length: 20 }, (_, i) => [String(i + 1), [[2, 99000, 0, 1, 0]]]));
  assert.equal(settled(u('/laps.json?start=x&final=1'), body({ cars })), true);
  assert.equal(settled(u('/laps.json?start=x&final=1'), body({ cars, live: true })), false);
  assert.equal(settled(u('/laps.json?start=x'), body({ cars })), false);
  assert.equal(settled(u('/now.json'), body({ final: true, cars: [{ laps: 3 }] })), false);
});

test('a track map, a race’s results days on, a past F1 season and a past MLB day all over are kept for good', () => {
  const body = x => JSON.stringify(x);
  assert.equal(settled(u('https://f1-live.orbit/circuit.json?key=9&year=2026'), body({ x: [1, 2] })), true);
  assert.equal(settled(u('https://f1-live.orbit/circuit.json?key=9&year=2026'), body({ x: [] })), false);
  const race = (date, n = 20) => body({ MRData: { total: String(n ? 1 : 0), RaceTable: { Races: n ? [{ date, time: '19:00:00Z', Results: Array(n).fill({}) }] : [] } } });
  const round = u('https://api.jolpi.ca/ergast/f1/2026/18/results.json?limit=40');
  assert.equal(settled(round, race('2026-10-01')), true);
  // Stewards may still change it; a race to come has none.
  assert.equal(settled(round, race(new Date().toISOString().slice(0, 10))), false);
  assert.equal(settled(round, race('', 0)), false);
  // `current` moves to the next season: never.
  assert.equal(settled(u('https://api.jolpi.ca/ergast/f1/current/results.json?limit=100'), race('2026-03-08')), false);
  assert.equal(settled(u('https://api.jolpi.ca/ergast/f1/2025/driverstandings.json'), body({ MRData: { total: '1' } })), true);
  assert.equal(settled(u('https://api.jolpi.ca/ergast/f1/2025.json?limit=40'), body({ MRData: { total: '24' } })), true);
  const mlb = d => u(`https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${d}&hydrate=linescore,previousPlay`);
  const games = (...s) => body({ dates: [{ games: s.map(([a, d]) => ({ status: { abstractGameState: a, detailedState: d } })) }] });
  assert.equal(settled(mlb('2026-10-20'), games(['Final', 'Final'], ['Final', 'Postponed'])), true);
  assert.equal(settled(mlb('2026-10-20'), games(['Final', 'Final'], ['Live', 'In Progress'])), false);
  assert.equal(settled(mlb(new Date().toISOString().slice(0, 10)), games(['Final', 'Final'])), false);
  assert.equal(settled(mlb('2026-10-20'), body({ dates: [] })), false);
});
