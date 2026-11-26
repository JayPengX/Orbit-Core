// New leagues (Jay 11-26): TPBL from its own site, each game's YouTube live
// kept; LaLiga and the NFL shown with no TV here (NO_TV).
import test from 'node:test';
import assert from 'node:assert/strict';
import { tpblGame, asiaTarget } from '../asia-baseball.js';
import { BROADCAST, NO_TV, twSource } from '../kit/sports-broadcast.mjs';
import { LEAGUES } from '../kit/sports-espn.mjs';

test('a TPBL game: Taipei time to UTC, clubs named, its YouTube live kept, scores once begun', () => {
  const g = tpblGame({ id: 9, home_team: { name: '新北中信特攻', meta: { alt_name: 'dea', logo: 'https://x/dea.webp' }, won_score: 100 }, away_team: { name: '新竹御嵿攻城獅', meta: { alt_name: 'lioneers' }, won_score: 90 }, venue: '和平籃球館', status: 'COMPLETED', is_live: false, meta: { live_stream_url: 'https://youtube.com/live/abc' }, game_date: '2026-11-22', game_time: '17:00:00' });
  assert.equal(g.start, '2026-11-22T09:00:00.000Z');
  assert.equal(g.home.en, 'New Taipei CTBC DEA');
  assert.equal(g.away.short, '攻城獅');
  assert.deepEqual([g.state, g.homeScore, g.awayScore, g.watch], ['post', 100, 90, 'https://youtube.com/live/abc']);
  const later = tpblGame({ id: 10, home_team: { meta: { alt_name: 'mars' }, won_score: 0 }, away_team: { meta: { alt_name: 'kings' }, won_score: 0 }, status: 'NOT_STARTED', meta: {}, game_date: '2026-12-01', game_time: '19:00:00' });
  assert.deepEqual([later.state, later.homeScore, later.watch], ['pre', null, undefined]);
  assert.deepEqual(asiaTarget(new URL('https://asia-baseball.orbit/tpbl/2026-11.json')), { league: 'tpbl', year: 2026, month: 11 });
});

test('LaLiga and the NFL are shown with no TV; TPBL on YouTube; the rest unchanged', () => {
  for (const k of ['tpbl', 'laliga', 'nfl']) assert.ok(LEAGUES[k], k);
  assert.deepEqual([...NO_TV].sort(), ['laliga', 'nfl']);
  assert.equal(BROADCAST.tpbl[0].svc, 'youtube');
  assert.equal(twSource(BROADCAST.tpbl, false), '聯盟的 YouTube 直播');
  assert.equal(LEAGUES.nfl.sport, 'football');
});
