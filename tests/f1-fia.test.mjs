// The stewards' grid drops from the FIA's decision documents (f1-fia.js),
// known days before a race (Jay 2026-11-21: "get the Grid Penalty info … a
// lot of grid penalty is known well before the race start").
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pdfText, dropOf, docLinks, slugOf, racesOf, activeEvent, mayDrop, servedAt } from '../f1-fia.js';

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
  // (Its folder, decision-document/, is no decision.)
  assert.equal(mayDrop('/system/files/decision-document/2026_las_vegas_grand_prix_-_championship_points.pdf'), false);
  assert.equal(mayDrop('/system/files/decision-document/2026_las_vegas_grand_prix_-_timetable_v3.pdf'), false);
  assert.equal(slugOf('São Paulo Grand Prix'), 'sao_paulo_grand_prix');
});

test("a year's races in order from Jolpica's schedule (the one before a race's: its drops served at it); the FIA's open event without it", () => {
  const schedule = { MRData: { RaceTable: { Races: [{ raceName: 'Las Vegas Grand Prix', date: '2026-11-22', time: '04:00:00Z' }, { raceName: 'São Paulo Grand Prix', date: '2026-11-08', time: '17:00:00Z' }] } } };
  assert.deepEqual(racesOf(schedule).map(r => [r.name, new Date(r.at).toISOString()]), [['São Paulo Grand Prix', '2026-11-08T17:00:00.000Z'], ['Las Vegas Grand Prix', '2026-11-22T04:00:00.000Z']]);
  assert.deepEqual(racesOf(null), []);
  assert.equal(activeEvent('<a class="event-title active">Las Vegas Grand Prix</a>'), 'Las Vegas Grand Prix');
});

// Las Vegas 2026: Pérez five places for a collision in its race, served at
// Qatar (it showed on Las Vegas's grid too); the engines decided in its
// practice, at Las Vegas.
test("a drop is served at the race it's for: the last race's at this one, never this race's own", () => {
  const perez = { no: '11', kind: 'places', n: 5, session: 'Race' };
  const antonelli = { no: '12', kind: 'places', n: 5, session: 'Free Practice 2' };
  assert.equal(servedAt(perez, false), false);
  assert.equal(servedAt(perez, true), true);
  assert.equal(servedAt(antonelli, false), true);
  assert.equal(servedAt(antonelli, true), false);
  assert.equal(servedAt({ no: '18', kind: 'pitlane', session: 'Race' }, false), true);
});
