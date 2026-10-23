// Which of a city's bus routes have a bus on the road (transit.js runningOf).
import test from 'node:test';
import assert from 'node:assert/strict';
import { runningOf } from '../transit.js';

test('a route with a bus coming somewhere counts it; 今日未營運 everywhere is -1; between buses is 0', () => {
  const r = runningOf([
    { RouteUID: 'TPE1', StopStatus: 0, EstimateTime: 120 },
    { RouteUID: 'TPE1', StopStatus: 1 },
    { RouteUID: 'HSZ0010', StopStatus: 4 },
    { RouteUID: 'HSZ0010', StopStatus: 4 },
    { RouteUID: 'HSQ0080', StopStatus: 1 },
    { RouteUID: 'HSQ0081', StopStatus: 4 },
    { RouteUID: 'HSQ0081', StopStatus: 1 }
  ]);
  assert.deepEqual(r, { TPE1: 1, HSZ0010: -1, HSQ0080: 0, HSQ0081: 0 });
});
