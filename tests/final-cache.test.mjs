import { test } from 'node:test';
import assert from 'node:assert/strict';
import { settled } from '../sports.js';

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
