import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seasonState, yearSeason, keeps, keptFrom, seasonBegun, seasonBounds, regularBegun } from '../builders/season.js';

const DAY = 86_400_000;
const board = (year, startDate) => ({ leagues: [{ season: { year, startDate } }] });
const ev = (date, year, type, slug = '') => ({ date, season: { year, type, slug } });

test("the owner's rule: a season whole, its playoffs too, until the next one's first game (its preseason's too)", () => {
  // The NBA in late September 2026: 2026-27 not yet begun.
  const now = Date.parse('2026-10-01T00:00Z');
  const events = [ev('2026-04-10T00:00Z', 2026, 2), ev('2026-06-15T00:00Z', 2026, 3), ev('2026-10-03T00:00Z', 2027, 1, 'preseason'), ev('2026-10-21T00:00Z', 2027, 2)];
  const pre = seasonState(board(2027, '2026-09-30T07:00Z'), events, now);
  assert.equal(pre.begun, false);
  assert.equal(keeps(pre, Date.parse('2025-11-01T00:00Z')), true, "last season's regular season");
  assert.equal(keeps(pre, Date.parse('2026-06-15T00:00Z')), true, 'its finals');
  assert.equal(keeps(pre, Date.parse('2026-10-03T00:00Z')), true, 'this preseason');
  // A preseason game played: last season wiped whole.
  const on = seasonState(board(2027, '2026-09-30T07:00Z'), events, Date.parse('2026-10-04T00:00Z'));
  assert.equal(on.begun, true);
  // Its bracket and final tables (mirror.mjs) stay until the regular season's first game.
  assert.equal(on.regular, false);
  assert.equal(seasonState(board(2027, '2026-09-30T07:00Z'), events, Date.parse('2026-10-22T00:00Z')).regular, true);
  assert.equal(keeps(on, Date.parse('2026-06-15T00:00Z')), false);
  assert.equal(keeps(on, Date.parse('2025-11-01T00:00Z')), false);
  assert.equal(keeps(on, Date.parse('2026-10-03T00:00Z')), true);
  assert.equal(keptFrom(on), Date.parse('2026-09-30T07:00Z'));
  assert.equal(keptFrom(pre), Date.parse('2026-09-30T07:00Z') - 380 * DAY);
});

test('a season that can\'t be told (the scoreboard unread) wipes nothing', () => {
  const s = seasonState(null, [], Date.parse('2026-10-12T00:00Z'));
  assert.equal(s.begun, null);
  assert.equal(s.regular, null);
  assert.equal(keeps(s, Date.parse('2020-01-01T00:00Z')), true);
});

test("a preseason game begins the season (ESPN's type 1, or its slug); one not played yet doesn't", () => {
  const now = Date.parse('2026-03-01T00:00Z');
  assert.equal(seasonBegun([ev('2026-02-20T00:00Z', 2026, 1, 'preseason')], 2026, now), true);
  assert.equal(seasonBegun([ev('2026-02-20T00:00Z', 2026, 99, 'preseason')], 2026, now), true);
  assert.equal(seasonBegun([ev('2026-03-26T00:00Z', 2026, 2, 'regular-season')], 2026, now), false, 'not played yet');
  assert.equal(seasonBegun([ev('2026-02-20T00:00Z', 2025, 2, 'regular-season')], 2026, now), false, "last season's game");
  // The regular season: a preseason game isn't it.
  assert.equal(regularBegun([ev('2026-02-20T00:00Z', 2026, 1, 'preseason')], 2026, now), false);
  assert.equal(regularBegun([ev('2026-02-25T00:00Z', 2026, 2, 'regular-season')], 2026, now), true);
  // Football's seasons have no preseason in ESPN's packs: their first match begins them.
  assert.equal(seasonBegun([ev('2026-08-21T19:00Z', 2026, 14308, '2026-27-english-premier-league')], 2026, Date.parse('2026-08-22T00:00Z')), true);
});

test("CPBL's: the calendar year's, last year's kept until this one's first game (or April)", () => {
  const march = yearSeason([], Date.parse('2027-03-10T00:00Z'));
  assert.equal(march.begun, false);
  assert.equal(keeps(march, Date.parse('2026-10-20T00:00Z')), true);
  const opened = yearSeason([{ start: '2027-03-28T09:00Z', state: 'post' }], Date.parse('2027-03-29T00:00Z'));
  assert.equal(opened.begun, true);
  assert.equal(keeps(opened, Date.parse('2026-10-20T00:00Z')), false);
  assert.equal(yearSeason([], Date.parse('2027-04-02T00:00Z')).begun, true);
});

test("the days that can be asked for: the first kept game to this season's last possible day", () => {
  const nba = (date, year, type) => ({ date, season: { year, type } });
  const events = [nba('2025-10-02T23:00Z', 2026, 1), nba('2026-06-15T00:00Z', 2026, 3), nba('2026-10-03T00:00Z', 2027, 1), nba('2027-04-12T00:00Z', 2027, 2)];
  const end = Date.parse('2027-06-26T06:59Z');
  // Before the new season's first game: last season's first game on.
  const pre = seasonState(board(2027, '2026-09-30T07:00Z'), events, Date.parse('2026-10-01T00:00Z'));
  assert.deepEqual(seasonBounds(events, pre, end, Date.parse('2026-10-01T00:00Z')), { from: '2025-10-03', to: '2027-06-26' });
  // A preseason game played: this season's first game on.
  const on = seasonState(board(2027, '2026-09-30T07:00Z'), events, Date.parse('2026-10-04T00:00Z'));
  assert.deepEqual(seasonBounds(events, on, end, Date.parse('2026-10-04T00:00Z')), { from: '2026-10-03', to: '2027-06-26' });
  // MLB's postseason: next season's schedule already out isn't this season's.
  const mlb = [nba('2026-02-20T18:00Z', 2026, 1), nba('2026-10-11T00:00Z', 2026, 3), nba('2027-03-26T17:00Z', 2027, 2)];
  const now = Date.parse('2026-10-12T00:00Z');
  const s = seasonState(board(2026, '2026-02-19T08:00Z'), mlb, now);
  assert.deepEqual(seasonBounds(mlb, s, Date.parse('2026-11-12T07:59Z'), now), { from: '2026-02-21', to: '2026-11-12' });
  // A football league: its last match scheduled (no end given).
  const epl = [nba('2026-08-21T19:00Z', 2026, 1), nba('2027-05-30T15:00Z', 2026, 1)];
  const e = seasonState(board(2026, '2026-06-01T04:00Z'), epl, now);
  assert.deepEqual(seasonBounds(epl, e, NaN, now), { from: '2026-08-22', to: '2027-05-30' });
  // The season over, ESPN not yet on the next: the next one's schedule.
  assert.deepEqual(seasonBounds(mlb, s, Date.parse('2026-11-12T07:59Z'), Date.parse('2026-12-01T00:00Z')).to, '2027-03-27');
});
