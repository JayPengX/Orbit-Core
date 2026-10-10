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
});
