import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { trimF1Live } from '../f1-live.js';

test("F1's live timing, trimmed: the part, the clock as of now, the flag and each car in order", () => {
  // Bahrain (at Sepang) 2026, qualifying, the start of Q2.
  const raw = JSON.parse(readFileSync(new URL('./fixtures/f1-live-quali.json', import.meta.url), 'utf8'));
  const r = trimF1Live(raw, Date.parse(raw.ExtrapolatedClock.Utc) + 5_000);
  assert.equal(r.session.type, 'Qualifying');
  assert.equal(r.part, 2);
  assert.deepEqual(r.entries, [22, 16, 10]);
  assert.equal(r.clock.left, 729 - 5);
  assert.equal(r.track.status, '1');
  assert.equal(r.cars.length, 22);
  assert.deepEqual(r.cars.map(c => c.pos), [...Array(22)].map((_, i) => i + 1));
  const ver = r.cars.find(c => c.tla === 'VER');
  assert.equal(ver.name, 'Max Verstappen');
  assert.equal(ver.colour, '#4781D7');
  assert.equal(ver.tyre, 'SOFT');
  // Six out after Q1.
  assert.equal(r.cars.filter(c => c.out).length, 6);
});

test("F1 live: the safety car and flags so far, for the race chart's bands", async () => {
  const { trimF1Live } = await import('../f1-live.js');
  const r = trimF1Live({
    RaceControlMessages: {
      Messages: [
        { Utc: '2026-10-04T08:52:16', Lap: 9, Category: 'SafetyCar', Message: 'SAFETY CAR DEPLOYED' },
        { Utc: '2026-10-04T08:53:00', Lap: 9, Category: 'Other', Message: 'CAR 44 TIME DELETED' },
        { Utc: '2026-10-04T08:53:10', Lap: 9, Category: 'Other', Message: 'CAR 77 (BOT) STOPPED AT TURN 14' },
        { Utc: '2026-10-04T08:58:50', Lap: 12, Category: 'SafetyCar', Message: 'SAFETY CAR IN THIS LAP' }
      ]
    }
  });
  assert.deepEqual(r.control.map(m => [m.lap, m.message]), [[9, 'SAFETY CAR DEPLOYED'], [9, 'CAR 77 (BOT) STOPPED AT TURN 14'], [12, 'SAFETY CAR IN THIS LAP']]);
});

test("each car's stints, grid, best sectors and speed trap, for Orbit Sports' 數據", async () => {
  const { trimF1Live } = await import('../f1-live.js');
  const r = trimF1Live({
    TimingData: { Lines: { 1: { Position: '1', NumberOfLaps: 30, BestLapTimes: [{ Value: '1:32.775' }, { Value: '1:31.895' }, {}] } } },
    TimingAppData: { Lines: { 1: { GridPos: '3', Stints: [{ Compound: 'MEDIUM', TotalLaps: 18, StartLaps: 0, New: 'true' }, { Compound: 'HARD', TotalLaps: 12, StartLaps: 0, New: 'true' }] } } },
    TimingStats: { Lines: { 1: { BestSectors: [{ Value: '25.216', Position: 5 }], BestSpeeds: { ST: { Value: '345', Position: 3 }, I1: { Value: '307', Position: 10 } }, PersonalBestLapTime: { Value: '1:39.970', Lap: 22, Position: 7 } } } },
    DriverList: { 1: { FirstName: 'Max', LastName: 'Verstappen' } }
  });
  const [c] = r.cars;
  assert.deepEqual(c.stints, [{ c: 'MEDIUM', laps: 18, new: true }, { c: 'HARD', laps: 12, new: true }]);
  assert.equal(c.grid, 3);
  assert.deepEqual(c.sectors, [{ v: '25.216', p: 5 }]);
  assert.deepEqual(c.speed, { v: 345, p: 3 });
  assert.deepEqual(c.pb, { v: '1:39.970', lap: 22, p: 7 });
  assert.deepEqual(c.speeds.i1, { v: 307, p: 10 });
  assert.deepEqual(c.speeds.fl, { v: 0, p: 0 });
  assert.deepEqual(c.parts, ['1:32.775', '1:31.895', '']);
});

test("a stint split without a change of tyres is one stint; its laps are the set's laps here", async () => {
  const { stintsOf } = await import('../f1-live.js');
  // Singapore's sprint: four stints on the feed, one set of intermediates (TyresNotChanged), 20 laps.
  const raw = [{ Compound: 'INTERMEDIATE', New: 'true', TyresNotChanged: '0', TotalLaps: 2, StartLaps: 0 }, { Compound: 'INTERMEDIATE', New: 'false', TyresNotChanged: '1', TotalLaps: 3, StartLaps: 2 }, { Compound: 'INTERMEDIATE', New: 'false', TyresNotChanged: '1', TotalLaps: 20, StartLaps: 4 }];
  assert.deepEqual(stintsOf(raw), [{ c: 'INTERMEDIATE', laps: 20, new: true }]);
  // A used set fitted at 3 laps old and run 12: 12 here.
  assert.deepEqual(stintsOf([{ Compound: 'SOFT', New: 'false', TotalLaps: 15, StartLaps: 3 }]), [{ c: 'SOFT', laps: 12, new: false }]);
  // Austin 2026: Stroll from the pit lane, 1 lap on the feed at his 4th: the 4 he's run.
  assert.deepEqual(stintsOf([{ Compound: 'MEDIUM', New: 'true', TotalLaps: 1, StartLaps: 0 }], 4), [{ c: 'MEDIUM', laps: 4, new: true }]);
  assert.deepEqual(stintsOf([{ Compound: 'SOFT', New: 'true', TotalLaps: 10, StartLaps: 0 }, { Compound: 'HARD', New: 'true', TotalLaps: 1, StartLaps: 0 }], 14), [{ c: 'SOFT', laps: 10, new: true }, { c: 'HARD', laps: 4, new: true }]);
});

test('lapsOf: each car\'s laps from the timing stream, gap, place and pit laps', async () => {
  const { lapsOf } = await import('../f1-live.js');
  const line = (t, o) => `${t}${JSON.stringify({ Lines: o })}`;
  const text = [
    line('00:00:01.000', { 1: { Position: '1' }, 4: { Position: '2' } }),
    line('00:01:40.000', { 1: { NumberOfLaps: 2, LastLapTime: { Value: '1:40.500' }, GapToLeader: 'LAP 2' } }),
    line('00:01:41.000', { 4: { GapToLeader: '+1.200', NumberOfLaps: 2 } }),
    line('00:01:41.100', { 4: { LastLapTime: { Value: '1:41.000' } } }),
    line('00:02:50.000', { 4: { InPit: true } }),
    line('00:03:21.000', { 4: { NumberOfLaps: 3, LastLapTime: { Value: '1:59.900' }, GapToLeader: '1L' } })
  ].join('\n');
  const laps = lapsOf(text);
  assert.deepEqual(laps['1'], [[2, 100500, 0, 1, 0]]);
  assert.deepEqual(laps['4'], [[2, 101000, 1.2, 2, 0], [3, 119900, null, 2, 1]]);
});

test('a session that runs: started, not archived yet, at most 4 hours in; its start in UTC', async () => {
  const { liveSession, sessionStartUtc, indexedSession } = await import('../f1-live.js');
  const index = { Meetings: [{ Sessions: [
    { Name: 'Qualifying', StartDate: '2026-10-10T21:00:00', GmtOffset: '08:00:00', Path: '2026/x/q/' },
    { Name: 'Race', StartDate: '2026-10-11T20:00:00', GmtOffset: '08:00:00' }
  ] }] };
  assert.equal(sessionStartUtc(index.Meetings[0].Sessions[1]), '2026-10-11T12:00:00.000Z');
  assert.equal(sessionStartUtc({ StartDate: '2026-10-25T13:00:00', GmtOffset: '-05:00:00' }), '2026-10-25T18:00:00.000Z');
  assert.equal(liveSession(index, Date.parse('2026-10-11T12:40:00Z'))?.Name, 'Race');
  assert.equal(liveSession(index, Date.parse('2026-10-11T11:00:00Z')), null);
  assert.equal(liveSession(index, Date.parse('2026-10-11T16:30:00Z')), null);
  // The qualifying's archived: not live, though its index entry is found.
  assert.equal(liveSession(index, Date.parse('2026-10-10T13:30:00Z')), null);
  assert.equal(indexedSession(index, '2026-10-11T12:05:00Z')?.Name, 'Race');
});

test('each minute\'s look keeps every car\'s last lap once, the places and stops as the feed has them', async () => {
  const { lapSample, addSample, memoryLog, f1LiveResponse } = await import('../f1-live.js');
  const look = laps => ({
    TimingData: { Lines: { 1: { NumberOfLaps: laps, LastLapTime: { Value: '1:37.500' }, Position: '1', GapToLeader: 'LAP 20' }, 16: { NumberOfLaps: laps, LastLapTime: { Value: '1:38.000' }, Position: '2', GapToLeader: '+6.035', InPit: laps === 21 } } },
    LapSeries: { 1: { LapPosition: ['1', '1', '1'] }, 16: { LapPosition: ['2', '2', '2'] } },
    PitStopSeries: { PitTimes: { 16: [{ PitStop: { Lap: '21', PitStopTime: '2.4', PitLaneTime: '24.1' } }] } }
  });
  let log = addSample(null, lapSample(look(20)));
  log = addSample(log, lapSample(look(20)));
  log = addSample(log, lapSample(look(21)));
  assert.deepEqual(log.cars['16'], [[20, 98000, 6.035, 2, 0], [21, 98000, 6.035, 2, 1]]);
  assert.deepEqual(log.cars['1'].map(x => x[2]), [0, 0]);
  assert.deepEqual(log.places['16'], [2, 2, 2]);
  assert.deepEqual(log.stops['16'], [[21, 2.4, 24.1]]);
  // A look without the places (a short answer) keeps the last ones.
  assert.deepEqual(addSample(log, { cars: {}, places: {}, stops: {} }).places['16'], [2, 2, 2]);
  const mem = memoryLog();
  await mem.add('k', lapSample(look(20)));
  assert.equal((await mem.get('k')).cars['1'].length, 1);
  assert.equal((await f1LiveResponse(new URL('https://f1-live.orbit/laps.json?start=nope'))).status, 502);
});

test('the Durable Object keeps a session\'s log under its start and a fortnight of them', async () => {
  const { F1Log } = await import('../f1-live.js');
  const m = new Map([['2020-01-01T00:00:00.000Z', {}]]);
  let lists = 0;
  const storage = { get: async k => m.get(k), put: async (k, v) => void m.set(k, v), list: async ({ end } = {}) => (lists++, new Map([...m].filter(([k]) => !end || k < end))), delete: async k => m.delete(k) };
  const o = new F1Log({ storage });
  const key = encodeURIComponent(new Date().toISOString());
  assert.equal(await (await o.fetch(new Request(`https://f1-log/?key=${key}`, { method: 'POST', body: JSON.stringify({ cars: { 1: [3, 90000, 0, 1, 0] } }) }))).text(), 'ok');
  assert.deepEqual((await (await o.fetch(new Request(`https://f1-log/?key=${key}`))).json()).cars['1'], [[3, 90000, 0, 1, 0]]);
  assert.equal(m.has('2020-01-01T00:00:00.000Z'), false);
  // The next minute's sample: no listing (once an hour).
  await o.fetch(new Request(`https://f1-log/?key=${key}`, { method: 'POST', body: JSON.stringify({ cars: { 1: [4, 90000, 0, 1, 0] } }) }));
  assert.equal(lists, 1);
});

test("stewardsOf: penalties to serve and incidents under investigation, by car", async () => {
  const { stewardsOf } = await import('../f1-live.js');
  const M = Message => ({ Message });
  // Austin 2026, lap 13: Russell's 5 seconds; Bortoleto investigated; Bearman and Gasly only noted.
  const msgs = [
    M('FIA STEWARDS: TURN 13 INCIDENT INVOLVING CAR 63 (RUS) UNDER INVESTIGATION - LEAVING THE TRACK AND GAINING AN ADVANTAGE (15:04:59)'),
    M('TURN 13 INCIDENT INVOLVING CARS 87 (BEA) AND 10 (GAS) NOTED - CAUSING A COLLISION (15:06:57)'),
    M('FIA STEWARDS: TURN 11 INCIDENT INVOLVING CAR 5 (BOR) UNDER INVESTIGATION - LEAVING THE TRACK AND GAINING AN ADVANTAGE (15:06:39)'),
    M('FIA STEWARDS: 5 SECOND TIME PENALTY FOR CAR 63 (RUS) - LEAVING THE TRACK AND GAINING AN ADVANTAGE (15:04:59)')
  ];
  assert.deepEqual(stewardsOf(msgs), { 63: { pen: ['5s'], probe: false }, 5: { pen: [], probe: true } });
  // Served: gone. Closed with no further action: gone. Two cars investigated: both.
  assert.deepEqual(stewardsOf([...msgs, M('FIA STEWARDS: PENALTY SERVED - 5 SECOND TIME PENALTY FOR CAR 63 (RUS) - LEAVING THE TRACK AND GAINING AN ADVANTAGE (15:04:59)'), M('FIA STEWARDS: TURN 11 INCIDENT INVOLVING CAR 5 (BOR) REVIEWED NO FURTHER INVESTIGATION (15:06:39)')]), {});
  assert.deepEqual(stewardsOf([M('FIA STEWARDS: TURN 1 INCIDENT INVOLVING CARS 41 (LIN) AND 55 (SAI) UNDER INVESTIGATION - CAUSING A COLLISION (15:03:49)')]), { 41: { pen: [], probe: true }, 55: { pen: [], probe: true } });
  assert.deepEqual(stewardsOf(null), {});
});
