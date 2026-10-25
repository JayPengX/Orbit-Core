// The proxy's copies kept for good go with their season (the owner's rule).
import test from 'node:test';
import assert from 'node:assert/strict';
import { keptUrl, keptLeague, keptDay, toWipe, runKept } from '../builders/kept.js';
import { mirrorPath } from '../kit/mirror.mjs';
import { r2Store } from '../builders/store.js';
import { memoryBucket } from './fixtures/bucket.mjs';

const key = (url, trim = '') => `${mirrorPath(url, trim)}.gz`;
const SUMMARY = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event=401';
const URLS = [
  SUMMARY,
  'https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/scoreboard?dates=20250930&limit=200',
  'https://asia-baseball.orbit/cpbl/2025-05.json',
  'https://f1-live.orbit/session.json?start=2025-11-30T13:00:00.000Z',
  'https://f1-live.orbit/laps.json?start=2025-11-30T13:00:00.000Z&final=1',
  'https://f1-live.orbit/circuit.json?key=9&year=2025',
  'https://api.jolpi.ca/ergast/f1/2025/24/results.json?limit=40',
  'https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=2025-09-30&hydrate=linescore,previousPlay'
];

test('a kept copy’s key reads back to its address, league and day', () => {
  for (const u of URLS) assert.equal(keptUrl(key(u))?.url.href, new URL(u).href, u);
  assert.equal(keptUrl(key('https://api.jolpi.ca/ergast/f1/2025/results.json?limit=100', 'jolpica-results')).trim, 'jolpica-results');
  assert.equal(keptUrl('mirror/_/nothing'), null);
  assert.deepEqual(URLS.map(u => keptLeague(new URL(u))), ['nba', 'mlb', 'cpbl', 'f1', 'f1', 'f1', 'f1', 'mlb']);
  assert.deepEqual(URLS.map(u => keptDay(new URL(u))), ['', '2025-09-30', '2025-05-28', '2025-11-30', '2025-11-30', '2025-12-31', '2025-12-31', '2025-09-30']);
  assert.equal(keptDay(new URL(SUMMARY), { header: { competitions: [{ date: '2025-04-01T23:30Z' }] } }), '2025-04-02');
});

test('copies from before a league’s first askable day are wiped; a league unread wipes nothing', () => {
  const bounds = { nba: { from: '2026-10-03' }, mlb: { from: '2026-02-20' }, cpbl: { from: '2026-03-28' }, f1: { from: '2025-03-14' } };
  const objects = [
    ...URLS.map(u => ({ key: key(u), meta: {} })),
    // The summary by its day; one with none by when it was kept.
    { key: key(SUMMARY.replace('401', '402')), meta: { day: '2026-10-22' } },
    { key: key(SUMMARY.replace('401', '403')), uploaded: Date.parse('2026-04-10'), meta: {} },
    // Another app's, of no league here: two seasons on.
    { key: key('https://site.api.espn.com/apis/site/v2/sports/tennis/atp/summary?event=1'), meta: { day: '2026-01-01' } },
    { key: key('https://site.api.espn.com/apis/site/v2/sports/tennis/atp/summary?event=2'), meta: { day: '2023-01-01' } }
  ];
  const gone = toWipe(objects, bounds, Date.parse('2026-10-26'));
  assert.deepEqual(gone.map(k => keptUrl(k).url.href), [URLS[1], URLS[2], URLS[7], SUMMARY.replace('401', '403'), 'https://site.api.espn.com/apis/site/v2/sports/tennis/atp/summary?event=2'].map(u => new URL(u).href));
  // F1's last season still kept (none of this one's raced): nothing of it goes; nba's unread: none of its.
  assert.deepEqual(toWipe(objects.slice(0, 1), {}, Date.parse('2026-10-26')), []);
});

test('the nightly run wipes in R2 what goes, keeps the rest; a dry run wipes nothing', async () => {
  const bucket = memoryBucket({ 'sports/bounds.json': { leagues: { mlb: { from: '2026-02-20' } } } });
  await bucket.put(key(URLS[1]), new Uint8Array([1]));
  await bucket.put(key(URLS[7].replace('2025', '2026')), new Uint8Array([1]));
  const dry = await runKept({ store: r2Store(bucket), now: Date.parse('2026-10-26'), dry: true });
  assert.equal(dry.wouldWipe, 1);
  assert.equal(bucket.m.size, 3);
  const r = await runKept({ store: r2Store(bucket), now: Date.parse('2026-10-26') });
  assert.deepEqual([r.wiped, r.kept, r.by], [1, 1, { mlb: 1 }]);
  assert.equal(bucket.m.has(key(URLS[1])), false);
  assert.equal(await runKept({ store: r2Store(memoryBucket()), now: 0 }).then(x => x.off), 'no bounds');
});
