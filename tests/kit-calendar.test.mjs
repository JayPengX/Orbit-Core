import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { twHoliday, twWorkday, twDayOff } from '../kit/holidays.mjs';
import { mlbPostseason, mlbGameFor, mlbGone, roundKey } from '../kit/postseason.mjs';
import { archivedSession, trimF1Live } from '../f1-live.js';

test("Taiwan's days off: the holidays, the days in lieu, weekends; TWSE's own closing days aren't anyone else's", () => {
  assert.equal(twHoliday('2026-10-09').zh, '國慶日補假');
  assert.equal(twHoliday('2026-10-10').zh, '國慶日');
  assert.equal(twHoliday('2026-09-28').zh, '教師節');
  assert.equal(twHoliday('2026-02-12'), null, 'TWSE closes, the country works');
  assert.equal(twWorkday('2026-02-12'), true);
  assert.equal(twDayOff('2026-10-11'), true, 'a Sunday');
  assert.equal(twWorkday('2026-10-12'), true);
  // A time, on Taiwan's calendar: 2026-10-09 23:30 there is still the holiday.
  assert.equal(twHoliday(Date.parse('2026-10-09T15:30:00Z')).zh, '國慶日補假');
  // A year past the list: the fixed dates.
  assert.equal(twHoliday('2030-10-10').zh, '國慶日');
});

test("MLB's postseason: rounds by name, a game found by its round, number and sides; a finished series' game gone", async () => {
  const list = mlbPostseason(JSON.parse(await readFile(new URL('./fixtures/mlb-postseason-2026-10-10.json', import.meta.url))));
  assert.equal(roundKey('ALDS - Game 5 If Necessary'), 'ALDS');
  assert.equal(roundKey("NL Wild Card 'A' Game 1"), 'NLWC');
  assert.equal(roundKey('World Series - Game 1'), 'WS');
  const g5 = mlbGameFor(list, { note: 'ALDS - Game 5', home: { en: 'Cleveland Guardians' }, away: { en: 'Chicago White Sox' } });
  assert.deepEqual([g5.day, g5.maybe, g5.timeTbd], ['2026-10-10', false, false]);
  // Sides not known yet ("CLE/CWS"): the one ALCS game of that number.
  assert.equal(mlbGameFor(list, { note: 'ALCS - Game 1', home: { en: 'Tampa Bay Rays' }, away: { en: 'TBD' } }).game, 1);
  // The Rays–Yankees ALDS is over: its Game 5 won't be played; the other's will.
  assert.equal(mlbGone(list, { note: 'ALDS - Game 5 If Necessary', home: { en: 'Tampa Bay Rays' }, away: { en: 'New York Yankees' } }, '2026-10-09', '2026-10-09'), true);
  assert.equal(mlbGone(list, { note: 'ALDS - Game 5', home: { en: 'Cleveland Guardians' }, away: { en: 'Chicago White Sox' } }, '2026-10-10', '2026-10-09'), false);
  // The World Series isn't timed: 待定, placed at 08:00 Taiwan the morning after its US day.
  const ws = mlbGameFor(list, { note: 'World Series - Game 1', home: { en: 'TBD' }, away: { en: 'TBD' } });
  assert.deepEqual([ws.timeTbd, ws.start], [true, '2026-10-24T00:00:00.000Z']);
});

test("F1's archive: a session found by its start; a practice's gaps from the line itself", () => {
  const index = { Meetings: [{ Sessions: [{ Key: 1, Name: 'Practice 1', StartDate: '2026-10-09T16:30:00', GmtOffset: '08:00:00', Path: '2026/x/fp1/' }, { Key: 2, Name: 'Sprint', StartDate: '2026-10-10T17:00:00', GmtOffset: '08:00:00', Path: '2026/x/sr/' }] }] };
  assert.equal(archivedSession(index, '2026-10-09T08:30:00Z').Path, '2026/x/fp1/');
  assert.equal(archivedSession(index, '2026-10-09T12:30:00Z'), null);
  const b = trimF1Live({ TimingData: { Lines: { 63: { Position: '1', BestLapTime: { Value: '1:32.274' } }, 16: { Position: '2', BestLapTime: { Value: '1:32.472' }, TimeDiffToFastest: '+0.198', TimeDiffToPositionAhead: '+0.198' } } }, DriverList: {} });
  assert.deepEqual(b.cars.map(c => [c.no, c.best, c.gap]), [['63', '1:32.274', ''], ['16', '1:32.472', '+0.198']]);
});
