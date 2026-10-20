// The proxy's trimmed league table (sports.js trimEspnStandings) reads the
// same as the whole one to Play's house prices (kit/play-house.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { trimEspnStandings } from '../sports.js';
import { parseStandings } from '../kit/play-house.mjs';

const entry = (name, w, l, t) => ({
  team: { id: '1', displayName: name, logos: [{ href: 'x' }], links: [{}] },
  note: { color: '#fff' },
  stats: [
    { name: 'wins', value: w, displayValue: String(w) },
    { name: 'losses', value: l },
    { name: 'ties', value: t },
    { name: 'gamesPlayed', value: w + l + t },
    { name: 'pointDifferential', value: 12 },
    { type: 'winpercent', value: 0.5 }
  ]
});
const table = {
  seasons: [{ year: 2026, types: [{}] }, { year: 2025 }],
  children: [
    { name: 'East', standings: { season: 2026, entries: [entry('Arsenal', 5, 1, 2)] } },
    { name: 'West', children: [{ standings: { season: 2026, entries: [entry('Chelsea', 3, 3, 2)] } }] }
  ]
};

test("a league table trimmed: the same records and season, less to download", () => {
  const trimmed = trimEspnStandings(table);
  assert.deepEqual([...parseStandings(trimmed)], [...parseStandings(table)]);
  assert.equal(parseStandings(trimmed).size, 2);
  assert.equal(trimmed.seasons[0].year, 2026);
  assert.ok(!JSON.stringify(trimmed).includes('pointDifferential'));
  assert.ok(JSON.stringify(trimmed).length < JSON.stringify(table).length);
});
