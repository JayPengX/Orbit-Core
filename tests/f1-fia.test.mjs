// The stewards' grid drops from the FIA's decision documents (f1-fia.js),
// known days before a race (Jay 2026-11-21: "get the Grid Penalty info … a
// lot of grid penalty is known well before the race start").
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pdfText, dropOf, docLinks, slugOf, meetingsOf, mayDrop } from '../f1-fia.js';

const pdf = f => new Uint8Array(readFileSync(new URL(`./fixtures/fia/${f}`, import.meta.url)));

test("a stewards' document read: Las Vegas 2026, Antonelli's sixth engine, five places", async () => {
  const text = await pdfText(pdf('las-vegas-2026-car-12-pu.pdf'));
  assert.match(text, /Drop of 5 grid positions for the next Race/);
  assert.deepEqual(dropOf(text), { no: '12', name: 'Kimi Antonelli', session: 'Free Practice 2', kind: 'places', n: 5 });
});

test('a reprimand is no drop', async () => {
  const text = await pdfText(pdf('las-vegas-2026-car-23-erratic.pdf'));
  assert.match(text, /Reprimand/);
  assert.equal(dropOf(text), null);
});

test('the drop\'s kinds: places, the back of the grid, the pit lane', () => {
  assert.equal(dropOf('No / Driver 63 - George Russell Competitor Mercedes Session Race Decision Required to start the race from the back of the grid.').kind, 'back');
  assert.equal(dropOf('No / Driver 18 - Lance Stroll Competitor Aston Martin Session Qualifying Decision The car must start the race from the pit lane.').kind, 'pitlane');
  assert.deepEqual(dropOf('44 - Lewis Hamilton Competitor Ferrari Session Race Decision Drop of 3 grid positions at the next Race in which the driver participates.'), { no: '44', name: 'Lewis Hamilton', session: 'Race', kind: 'places', n: 3 });
});

test("an event's documents that can decide a drop, by their names", () => {
  const html = ['infringement_-_car_12_-_changes_to_pu_element', 'decision_-_car_4_-_causing_a_collision', 'infringement_-_free_practice_1_deleted_lap_times', 'final_race_classification', 'summons_-_car_41_-_alleged_unsafe_release', 'competition_notes_-_pirelli_preview']
    .map(n => `<a href="/system/files/decision-document/2026_las_vegas_grand_prix_-_${n}.pdf">x</a>`)
    .join('');
  assert.deepEqual(docLinks(html, '2026_las_vegas_grand_prix').map(h => h.split('_-_').slice(1).join('_-_')), ['infringement_-_car_12_-_changes_to_pu_element.pdf', 'decision_-_car_4_-_causing_a_collision.pdf']);
  assert.equal(mayDrop('/x/2026_x_-_entry_list.pdf'), false);
  assert.equal(slugOf('São Paulo Grand Prix'), 'sao_paulo_grand_prix');
});

test("a year's meetings in order from F1's archive index (the one before a race's: its drops served at it)", () => {
  const index = { Meetings: [{ Name: 'Las Vegas Grand Prix', Sessions: [{ StartDate: '2026-11-19T16:30:00', GmtOffset: '-08:00:00' }] }, { Name: 'São Paulo Grand Prix', Sessions: [{ StartDate: '2026-11-06T11:30:00', GmtOffset: '-03:00:00' }] }, { Name: 'Pre-Season Testing', Sessions: [{ StartDate: '2026-02-11T10:00:00', GmtOffset: '03:00:00' }] }] };
  assert.deepEqual(meetingsOf(index).map(m => [m.name, new Date(m.first).toISOString()]), [['São Paulo Grand Prix', '2026-11-06T14:30:00.000Z'], ['Las Vegas Grand Prix', '2026-11-20T00:30:00.000Z']]);
});
