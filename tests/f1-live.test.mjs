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
        { Utc: '2026-10-04T08:58:50', Lap: 12, Category: 'SafetyCar', Message: 'SAFETY CAR IN THIS LAP' }
      ]
    }
  });
  assert.deepEqual(r.control.map(m => [m.lap, m.message]), [[9, 'SAFETY CAR DEPLOYED'], [12, 'SAFETY CAR IN THIS LAP']]);
});
