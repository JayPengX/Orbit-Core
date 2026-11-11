// 賽前看點 (builders/previews.js, ai-features.js 'sports-preview'): the digest
// says only what the card doesn't, and a point that says the card again is let go.
import test from 'node:test';
import assert from 'node:assert/strict';
import { previewFacts, apPreview, tableStakes } from '../builders/previews.js';
import { FEATURES } from '../ai-features.js';

const team = (id, name) => ({ id, team: { id, displayName: name } });
const row = (id, rank, pts) => ({ id, stats: [{ name: 'rank', value: rank }, { name: 'points', value: pts }, { name: 'pointDifferential', value: 0 }] });
const table = [row('1', 1, 27), row('2', 2, 22), row('3', 3, 21), ...Array.from({ length: 17 }, (_, i) => row(String(10 + i), 4 + i, 18 - i))];

test('football: what a win does in the table, said only when it changes a place', () => {
  const comp = { competitors: [{ ...team('3', 'Man City'), homeAway: 'home' }, { ...team('2', 'Brighton'), homeAway: 'away' }] };
  const st = tableStakes({ standings: { groups: [{ standings: { entries: table } }] }, header: { league: { slug: 'eng.1' } } }, comp);
  assert.ok(st.some(l => l === 'If {t:3} win: up to 2nd, from 3rd, passing {t:2}'), st.join('\n'));
  assert.ok(!st.some(l => l.startsWith('If {t:2} win')), 'a win that changes no place: not said');
});

test("AP's preview: last season and its injuries' lines left out", () => {
  const story = '<p>Dallas Mavericks (7-4, ninth in the Western Conference) vs. Minnesota Timberwolves (8-3)</p><p>BOTTOM LINE: Dallas visits after Cooper Flagg scored 43 points.</p><p>Minnesota finished 49-33 overall during the 2025-26 season.</p><p>INJURIES: Timberwolves: Anthony Edwards: out (knee).</p><p>Mavericks: Dereck Lively II: day to day (foot).</p>';
  assert.deepEqual(apPreview({ story }), ['Dallas visits after Cooper Flagg scored 43 points.']);
});

test('a game with nothing past what the card shows: no digest, never asked', () => {
  const summary = { header: { competitions: [{ competitors: [{ ...team('1', 'A'), homeAway: 'home' }, { ...team('2', 'B'), homeAway: 'away' }] }] } };
  assert.equal(previewFacts(summary, { league: 'nba', id: '9', start: '2026-11-13T01:00Z' }), null);
});

test("a point that says the card again, or a player typed out, is let go", () => {
  const facts = 'Teams: {t:16} = home (Minnesota Timberwolves); {t:6} = away (Dallas Mavericks)\nOut for {t:16}: {p:4594268} Out (Knee), due back 2026-12-21\nPlayers: {p:4594268} = Anthony Edwards ({t:16})';
  const clean = FEATURES['sports-preview'].clean;
  assert.deepEqual(clean({ points: [{ k: 'out', zh: '{t:16}主將{p:4594268}膝傷缺陣至12/21', en: '{t:16} without {p:4594268} (knee) until Dec 21' }] }, { facts }).points.length, 1);
  assert.equal(clean({ points: [{ k: 'run', zh: '{t:16}排名第3', en: '{t:16} sit 3rd' }] }, { facts }), null);
  assert.equal(clean({ points: [{ k: 'out', zh: '{t:16}少了{p:4594268}', en: 'Minnesota without Edwards' }] }, { facts }), null);
  assert.equal(clean({ points: [{ k: 'out', zh: '{t:16}主將缺陣30天', en: '{t:16} without {p:4594268} for 30 days' }] }, { facts }), null, 'a number not in the facts');
  assert.deepEqual(clean({ points: [] }, { facts }), { points: [] });
});
