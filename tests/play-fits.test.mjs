// Play's model fits kept by their inputs (kit/play-odds.mjs fitted): the
// same numbers as a fit made anew, made once, and kept on the device for the
// next open.
import { test } from 'node:test';
import assert from 'node:assert/strict';

test('a fit is made once per inputs, kept on the device, and read back on the next open', async t => {
  const saved = new Map([['oddsStudy.teamRuns', '{"v":2,"list":[]}']]);
  globalThis.localStorage = { getItem: k => saved.get(k) ?? null, setItem: (k, v) => saved.set(k, v), removeItem: k => saved.delete(k) };
  t.after(() => delete globalThis.localStorage);
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const odds = await import('../kit/play-odds.mjs?open=1');
  const first = odds.fitTeamRuns(0.58, 8.5, 0.5);
  assert.equal(odds.fitTeamRuns(0.58, 8.5, 0.5), first);
  assert.ok(Object.isFrozen(first));
  assert.notEqual(odds.fitTeamRuns(0.59, 8.5, 0.5), first);
  // The old key goes; the fits are written once the board is priced.
  assert.equal(saved.has('oddsStudy.teamRuns'), false);
  t.mock.timers.tick(2000);
  const list = JSON.parse(saved.get('play.fits')).list;
  assert.deepEqual(new Map(list).get('runs|0.58|8.5|0.5|4'), { ...first });
  // The next open reads them back: the same numbers, no fit made.
  const again = await import('../kit/play-odds.mjs?open=2');
  let made = false;
  assert.deepEqual(again.fitted('runs|0.58|8.5|0.5|4', () => ((made = true), null)), { ...first });
  assert.equal(made, false);
});

test('the fits kept are the numbers a fit makes anew', async () => {
  const { fitTeamRuns, fitTotalRuns } = await import('#kit/play-odds.mjs');
  const { fitGoals } = await import('#kit/play-live.mjs');
  const { fitHockey } = await import('#kit/play-markets.mjs');
  const fresh = await import('../kit/play-odds.mjs?fresh=1');
  assert.deepEqual({ ...fitTeamRuns(0.61, 9, 0.47) }, { ...fresh.fitTeamRuns(0.61, 9, 0.47) });
  assert.equal(fitTotalRuns(8.5, 0.52), fresh.fitTotalRuns(8.5, 0.52));
  const goals = fitGoals(0.45, 0.3);
  assert.equal(fitGoals(0.45, 0.3), goals);
  assert.ok(goals.home > goals.away);
  const hockey = fitHockey(0.55, { line: 6.5, overFair: 0.48 });
  assert.equal(fitHockey(0.55, { line: 6.5, overFair: 0.48 }), hockey);
  assert.ok(hockey.home > hockey.away);
});
