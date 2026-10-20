// A game past its listed time that hasn't begun (an NBA game's intro, a
// first pitch held back): still on sale before the game while ESPN's live
// scoreboard says it's to come, never once it has begun (Jay 2026-10-20:
// "stuck in this not started but started gap").
import test from 'node:test';
import assert from 'node:assert/strict';
import * as src from '../kit/play-sources.mjs';
import { boardBets } from '../kit/play-bets.mjs';
import { housePick, useReads } from '../price.js';
import { fakeSources } from './fixtures/play-board.mjs';

// Two NHL games listed for 07:53, 15 minutes before now: Club H's not begun, Club J's under way.
const NOW = new Date('2026-10-19T08:08:00Z');
const START = Date.parse('2026-10-19T07:53:00Z');

function sources() {
  const { proxy } = fakeSources({ now: NOW.getTime(), late: new Set(['NHL Club H']) });
  useReads({ read: async (u, t = '') => { const d = await proxy(u, t); if (d == null) throw new Error('unread'); return d; }, pack: async () => { throw new Error('no pack'); } });
}

test('a game past its time that ESPN says is still to come stays on sale, held two minutes a read; one under way does not', async () => {
  sources();
  const games = await src.loadLeague('nhl', NOW);
  const late = games.filter(g => Date.parse(g.startUtc) === START);
  assert.deepEqual(late.map(g => g.home.en), ['NHL Club H']);
  assert.equal(late[0].lateUntil, NOW.getTime() + 2 * 60_000);
  // Its bets carry when they stop (Play's started() honours it, as a race's late qualifying).
  const bets = boardBets({ games: late }, { now: NOW });
  assert.ok(bets.length && bets.every(b => b.waitsUntil === late[0].lateUntil));
  // The Worker sells its winner.
  const ml = bets.find(b => b.kind === 'ml');
  const once = (key, f) => f();
  const leg = { id: ml.id, gameId: ml.gameId, sport: 'nhl' };
  assert.ok((await housePick(leg, NOW, once)).bet);
});

test('never past 45 minutes, nor in a league with no live scoreboard to ask', async () => {
  sources();
  const games = await src.loadLeague('nhl', new Date(START + 46 * 60_000));
  assert.ok(!games.some(g => Date.parse(g.startUtc) === START));
  // (Asked of a list by hand: a game with no ESPN league is never kept late.)
  const t = NOW.getTime();
  const kept = await src.stillToCome([{ id: 'x', sport: 'cpbl', startUtc: new Date(t - 60_000).toISOString(), home: { en: 'A' }, away: { en: 'B' } }], NOW);
  assert.equal(kept.size, 0);
});
