import { test } from 'node:test';
import assert from 'node:assert/strict';
import { usTeamIn, teamNameZh } from '../kit/names.mjs';

test('usTeamIn: a team as a news line names it, by nickname or city; two teams\' words are none', () => {
  assert.equal(usTeamIn('nba', 'the Rockets'), 'Houston Rockets');
  assert.equal(teamNameZh('nba', usTeamIn('nba', 'Minnesota')).short, '灰狼');
  assert.equal(usTeamIn('nba', 'Trail Blazers'), 'Portland Trail Blazers');
  assert.equal(usTeamIn('nba', 'Golden State'), 'Golden State Warriors');
  assert.equal(usTeamIn('nba', 'Los Angeles'), null);
  assert.equal(usTeamIn('mlb', 'New York'), null);
  assert.equal(usTeamIn('mlb', 'Sox'), null);
  assert.equal(usTeamIn('mlb', 'Colorado'), 'Colorado Rockies');
  assert.equal(usTeamIn('nba', 'Raptors'), 'Toronto Raptors');
  assert.equal(usTeamIn('nba', ''), null);
  assert.equal(usTeamIn('soccer', 'Arsenal'), null);
});
