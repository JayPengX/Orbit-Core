// What turned an F1 race, as the kit reads it (kit/sports-winprob.mjs): the
// bands race control's words make, and each driver's climbs through the field.
import test from 'node:test';
import assert from 'node:assert/strict';
import { controlBands, placeClimbs } from '../kit/sports-winprob.mjs';

test('a red flag runs to the restart, not to the track said clear or the restart time said (Mexico 2026: 39 minutes)', () => {
  const m = (lap, message, flag = '') => ({ lap, message, flag });
  const msgs = [
    m(44, 'SAFETY CAR DEPLOYED'),
    m(45, 'RED FLAG - RACE SUSPENDED'),
    m(46, 'TRACK CLEAR', 'CLEAR'),
    m(46, 'INCIDENT INVOLVING CAR 6 (HAD) NOTED - RED FLAG INFRINGEMENT'),
    m(46, 'RESUMPTION ORDER: 3, 16, 12'),
    m(46, 'RACE WILL RESUME AT 15:45'),
    m(46, 'SESSION STARTED'),
    m(46, 'STANDING START')
  ];
  assert.deepEqual(controlBands(msgs, x => x.lap, 50).map(([a, b, k]) => [a, b, k]), [[44, 45, 'sc'], [45, 46, 'red']]);
});

test('placeClimbs: each run a driver never lost a place in that gained two or more, from its first gain to its best (Verstappen, Mexico 2026)', () => {
  const ver = [2, 2, 2, 2, 2, ...Array(22).fill(2), 3, 5, 4, 4, 4, 4, 4, 3, 3, 3, 3, 3, 2, 2, 2, 2, 2, 1, 1, 1];
  assert.deepEqual(placeClimbs(ver), [{ from: 5, to: 1, lap0: 29, lap1: 44 }]);
  // A place lost ends a run; one place is no climb; a lap not read (0) skipped.
  assert.deepEqual(placeClimbs([8, 5, 5, 6, 0, 3, 3, 1]), [{ from: 8, to: 5, lap0: 1, lap1: 1 }, { from: 6, to: 1, lap0: 5, lap1: 7 }]);
  assert.deepEqual(placeClimbs([3, 2, 2, 3]), []);
});
