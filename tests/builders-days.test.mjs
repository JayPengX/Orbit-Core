import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seasonDays } from '../builders/sports.js';

test("a season's game days: from its start across both year packs, as Taipei dates, a postponed game left out", () => {
  const events = [
    { date: '2026-04-12T23:30Z' }, // last season
    { date: '2026-10-21T23:30Z' }, // 10/22 in Taipei
    { date: '2026-10-22T02:00Z' },
    { date: '2027-04-11T19:00Z' },
    { date: '2026-11-03T00:00Z', status: { type: { name: 'STATUS_POSTPONED' } } }
  ];
  assert.deepEqual(seasonDays(events, Date.parse('2026-10-02T00:00Z')), ['2026-10-22', '2027-04-12']);
});

test('season packs on R2: the months over kept from the last pack, ESPN read only from ten days back; the index and days written', async () => {
  const { runSports } = await import('../builders/sports.js');
  const { r2Store } = await import('../builders/store.js');
  const { memoryBucket } = await import('./fixtures/bucket.mjs');
  const now = Date.parse('2026-10-13T16:17:00Z');
  const ev = (id, date, state) => ({ id, date, status: { type: { state, completed: state === 'post' } }, competitions: [{ date, competitors: [] }], links: ['dropped'] });
  const store = r2Store(memoryBucket({ 'sports/mlb/2026.json': { leagues: [], events: [ev('1', '2026-04-02T23:00Z', 'post'), ev('2', '2026-09-01T23:00Z', 'post')] } }));
  const asked = [];
  const get = async url => {
    asked.push(String(url));
    const u = new URL(String(url));
    const dates = u.searchParams.get('dates') || '';
    if (!dates) return new Response(JSON.stringify({ leagues: [{ season: { year: 2026, startDate: '2026-02-20T08:00Z', endDate: '2026-11-10T08:00Z' } }] }));
    if (dates === '2026') return new Response(JSON.stringify({ leagues: [{ id: '10', calendar: [] }] }));
    if (dates === '202610') return new Response(JSON.stringify({ events: [ev('3', '2026-10-12T23:00Z', 'post'), ev('4', '2026-10-20T23:00Z', 'pre')] }));
    return new Response(JSON.stringify({ events: [] }));
  };
  const r = await runSports({ store, get, now, only: ['mlb'], sleep: async () => {} });
  assert.deepEqual(r.failed, []);
  const months = asked.map(u => new URL(u).searchParams.get('dates')).filter(d => /^2026\d{2}$/.test(d || ''));
  assert.deepEqual(months, ['202610', '202611', '202612'], 'from the month ten days back');
  const pack = await store.json('sports/mlb/2026.json');
  assert.deepEqual(pack.events.map(e => e.id), ['1', '2', '3', '4']);
  assert.equal(pack.events[3].links, undefined, 'slimmed');
  assert.ok((await store.json('sports/index.json')).leagues.mlb.years['2026']);
  assert.ok((await store.json('sports/mlb/days.json')).days.includes('2026-10-13'));
});
