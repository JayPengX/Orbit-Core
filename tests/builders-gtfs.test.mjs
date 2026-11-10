// The weekly bus build from TDX's GTFS (builders/gtfs.js, run by
// tools/gtfs-buses.mjs on GitHub): GTFS's rows made into the packs TDX's API
// made, and what GTFS lacks taken from the last pack or asked of TDX.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gtfsMins, calendarBits, tripDays, specialOf, orderOf, longestPattern, subSched, wayPlan, cityPack, tdxWays, cityLines, decode, whereOf, keptSpecial, specialSubs } from '../builders/gtfs.js';
import { encode, schedOf } from '../builders/buses.js';

const trip = (stops, times, days = 62, special = null) => ({ days, special, stops, times });

test("GTFS's times and days read as TDX's: minutes of the day (wrapping at midnight), bit 0 Sunday, no days at all is every day", () => {
  assert.equal(gtfsMins('07:05:00'), 425);
  assert.equal(gtfsMins('24:10:00'), 10);
  assert.equal(gtfsMins(''), -1);
  assert.equal(calendarBits({ sunday: '1', monday: '1', saturday: '1' }), 0b1000011);
  // (TDX's row with no ServiceDay is GTFS's service of no days: buses.js read it as every day.)
  assert.equal(tripDays(0, null), 127);
  assert.equal(tripDays(0, { add: ['20261111'], drop: [] }), 0);
  assert.equal(tripDays(62, null), 62);
  assert.deepEqual(specialOf({ add: [], drop: ['20261112', '20261111'] }), [{ Dates: ['2026-11-11', '2026-11-12'], ServiceStatus: 0 }]);
  assert.equal(specialOf(null), null);
});

test("a sub-route's timetable: TDX's stop order, a trip at one time as one number, first-stop trips kept so, a run's least and most wait kept", () => {
  const timed = [trip(['A', 'B', 'C'], [420, 425, 430]), trip(['A', 'B', 'D'], [480, 480, 480])];
  assert.deepEqual(orderOf(timed), ['A', 'B', 'C', 'D']);
  assert.deepEqual(subSched('S1', 0, { timed }), ['S1', 0, ['A', 'B', 'C', 'D'], [[62, [420, 425, 430, -1]], [62, 480]], []]);
  // TDX had it at its first stop only (GTFS works out times between): kept at its first stop.
  const old = ['S1', 0, ['A'], [[62, 420]], []];
  assert.deepEqual(subSched('S1', 0, { timed }, old), ['S1', 0, ['A'], [[62, 420], [62, 480]], []]);
  // A run: GTFS's one wait is the mean of TDX's two, rounded down; the last pack's two kept when it's the same run.
  const runs = [{ days: 2, start: '06:00:00', end: '07:00:00', secs: 1020, stops: ['A'] }, { days: 2, start: '07:00:00', end: '09:00:00', secs: 780, stops: ['A'] }];
  const had = ['S2', 0, [], [], [[2, '06:00', '07:00', 15, 20], [2, '21:00', '00:00', 30, 30], [4, '21:00', '00:00', 30, 30]]];
  assert.deepEqual(subSched('S2', 0, { runs }, had)[4], [
    [2, '06:00', '07:00', 15, 20],
    [2, '07:00', '09:00', 13, 13],
    // (A run to midnight GTFS leaves out, on a day the route still runs; Tuesday's no more.)
    [2, '21:00', '00:00', 30, 30]
  ]);
  assert.equal(subSched('S3', 0, {}), null);
});

test('special days GTFS lacks: the same trip keeps the ones still to come, and the sub-routes that had them are named for TDX', () => {
  const old = ['S1', 0, ['A'], [[127, 450, [{ Dates: ['2026-11-05', '2026-11-20'], ServiceStatus: 0, Description: '未營運' }]], [62, 500]], []];
  assert.deepEqual(keptSpecial(old, [127, 450], '2026-11-10'), [{ Dates: ['2026-11-20'], ServiceStatus: 0, Description: '未營運' }]);
  assert.equal(keptSpecial(old, [127, 450], '2026-11-21'), null);
  assert.equal(keptSpecial(old, [127, 451], '2026-11-10'), null);
  assert.deepEqual(subSched('S1', 0, { timed: [trip(['A'], [450], 127)] }, old, '2026-11-10')[3], [[127, 450, [{ Dates: ['2026-11-20'], ServiceStatus: 0, Description: '未營運' }]]]);
  assert.deepEqual(specialSubs({ routes: [{ uid: 'R', sched: [old, ['S2', 0, ['A'], [[2, 1]], []]] }] }, '2026-11-10'), ['S1']);
});

test("ways: the last pack's (TDX's own) kept; a new sub-route or one whose timed stops changed asked of TDX; one TDX no longer lists gone", () => {
  const old = {
    stops: {},
    routes: [{ uid: 'R1', name: '1', ways: [['S1', '1', 0, ['A', 'B', 'C']], ['S9', '1區', 0, ['A', 'B']], ['S2', '1繞', 0, ['A', 'X', 'C']]], sched: [['S1', 0, ['A', 'B', 'C'], [[62, [1, 2, 3]]], []], ['S2', 0, ['A', 'X', 'C'], [[62, [1, 2, 3]]], []]] }]
  };
  const gtfs = new Map([
    ['S1_0', { name: '1', timed: [trip(['A', 'B', 'C'], [1, 2, 3])], runs: [] }],
    ['S2_0', { name: '1繞', timed: [trip(['A', 'Y', 'C'], [1, 2, 3])], runs: [] }],
    ['S3_0', { name: '1新', timed: [trip(['A', 'B', 'Z'], [1, 2, 3])], runs: [] }]
  ]);
  const list = [
    { route: 'R1', routeName: '1', sub: 'S1', subName: '1', dir: 0 },
    { route: 'R1', routeName: '1', sub: 'S2', subName: '1繞', dir: 0 },
    { route: 'R1', routeName: '1', sub: 'S3', subName: '1新', dir: 0 },
    { route: 'R1', routeName: '1', sub: 'S4', subName: '1夜', dir: 0 }
  ];
  const plan = wayPlan({ old, list, gtfs });
  assert.deepEqual(plan.ways.map(w => [w.sub, w.stops]), [['S1', ['A', 'B', 'C']], ['S2', ['A', 'Y', 'C']], ['S3', ['A', 'B', 'Z']], ['S4', null]]);
  assert.deepEqual(plan.ask, ['S2', 'S3', 'S4']);
  // Without TDX's list: the last pack's ways, and GTFS's sub-routes of routes it knew.
  const bare = wayPlan({ old, list: null, gtfs });
  assert.deepEqual(bare.ways.map(w => w.sub), ['S1', 'S9', 'S2']);
  const { ways, stops } = tdxWays([{ SubRouteUID: 'S4', Direction: 0, Stops: [{ StopUID: 'Q', StopSequence: 2, StopName: { Zh_tw: '乙' }, StopPosition: { PositionLat: 24.1, PositionLon: 121 } }, { StopUID: 'P', StopSequence: 1, StopName: { Zh_tw: '甲' }, StopPosition: { PositionLat: 24, PositionLon: 121 } }] }]);
  assert.deepEqual(ways.get('S4_0'), ['P', 'Q']);
  const pack = cityPack({ city: 'X', built: 'b', old, ways: plan.ways, fetched: ways, gtfs, stops: new Map([['A', ['甲站', 24, 121]]]), fetchedStops: stops });
  assert.deepEqual(pack.routes[0].ways.map(w => [w[0], w[3]]), [['S1', ['A', 'B', 'C']], ['S2', ['A', 'Y', 'C']], ['S3', ['A', 'B', 'Z']], ['S4', ['P', 'Q']]]);
  assert.deepEqual(pack.routes[0].sched.map(s => s[0]), ['S1', 'S2', 'S3']);
  assert.deepEqual([pack.stops.A, pack.stops.P, pack.stops.B], [['甲站', 24, 121], ['甲', 24, 121], ['', null, null]]);
  // TDX's own timetable over GTFS's (a sub-route with special days).
  const own = new Map([['S1_0', schedOf({ SubRouteUID: 'S1', Direction: 0, Timetables: [{ ServiceDay: { Monday: 1 }, SpecialDays: [{ Dates: ['2026-11-20'], ServiceStatus: 0 }], StopTimes: [{ StopUID: 'A', StopSequence: 1, DepartureTime: '07:00' }] }] })]]);
  assert.deepEqual(cityPack({ city: 'X', built: 'b', old, ways: plan.ways, gtfs, stops: new Map(), own }).routes[0].sched[0], ['S1', 0, ['A'], [[2, 420, [{ Dates: ['2026-11-20'], ServiceStatus: 0 }]]], []]);
});

test("lines: GTFS's, simplified and encoded as buses.js did, the last pack's where GTFS has none; 公路客運's by square", () => {
  const pts = [[24.8, 121], [24.8, 121.01], [24.8, 121.02]];
  const pack = { city: 'InterCity', routes: [{ uid: 'R1', ways: [['S1', '', 0, []], ['S2', '', 1, []]], sched: [] }] };
  const old = { 'R1|1': [['S2', encode([[25.1, 121.6], [25.1, 121.61]])]] };
  const { shapes, squares } = cityLines(pack, new Map([['S1_0', pts]]), old);
  assert.deepEqual(decode(shapes['R1|0'][0][1]), [[24.8, 121], [24.8, 121.02]]);
  assert.deepEqual(shapes['R1|1'], old['R1|1']);
  assert.deepEqual([...squares.keys()].sort(), ['24.75_121.00', '25.00_121.50']);
});

test("where.json: every pack's stops in 0.02° cells, YouBike's cities as the last one had them", () => {
  const w = whereOf([['Hsinchu', { stops: { A: ['甲', 24.801, 120.971], B: ['乙', null, null] } }]], { packs: ['Hsinchu', 'bike:Hsinchu'], cells: { '1240_6048': [0, 1], '1241_6048': [1] } }, 'b');
  assert.deepEqual(w.packs, ['Hsinchu', 'bike:Hsinchu']);
  assert.deepEqual(w.cells, { '1240_6048': [0, 1], '1241_6048': [1] });
  assert.equal(longestPattern([trip(['A', 'B'], [1, 2]), trip(['A', 'B', 'C'], [1, 2, 3])]).length, 3);
});
