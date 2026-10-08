// Asian baseball from the leagues' own sites (asia-baseball.js), on saved pages.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseNpb, parseKbo, parseCpbl, parseTsdbDay, asiaTarget, mergeCpbl, parseCpblBox, cpblBoxTarget } from '../asia-baseball.js';

const fixture = name => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
const now = Date.parse('2026-09-29T12:00:00Z');

test('NPB: home first, Japan time, finished once a winner is named', () => {
  const games = parseNpb(fixture('npb-2026-09.html'), 2026, now);
  assert.equal(games.length, 7);
  const giants = games[0];
  assert.deepEqual([giants.home.en, giants.away.en, giants.homeScore, giants.awayScore, giants.state], ['Yomiuri Giants', 'Tokyo Yakult Swallows', 11, 0, 'post']);
  assert.equal(giants.start, '2026-09-27T09:00:00.000Z');
  assert.equal(giants.home.zh, '讀賣巨人');
  const next = games.at(-1);
  assert.equal(next.state, 'pre');
  assert.equal(next.homeScore, null);
  // On after its start, until a winner is named.
  assert.equal(parseNpb(fixture('npb-2026-09.html'), 2026, Date.parse('2026-09-30T10:00:00Z')).at(-1).state, 'in');
});

test('KBO: away first in the list, rain-outs void', () => {
  const games = parseKbo(JSON.parse(fixture('kbo-2026-09.json')), 2026, now);
  assert.equal(games.length, 10);
  const [first] = games;
  assert.deepEqual([first.away.en, first.home.en, first.awayScore, first.homeScore, first.state], ['NC Dinos', 'Doosan Bears', 2, 5, 'post']);
  assert.equal(first.start, '2026-09-29T09:30:00.000Z');
  assert.ok(games.slice(5).every(g => g.state === 'pre' && g.homeScore == null));
  const rained = parseKbo({ rows: [{ row: [{ Class: 'day', Text: '09.03(수)' }, { Class: 'time', Text: '<b>18:30</b>' }, { Class: 'play', Text: '<span>LG</span><em><span>vs</span></em><span>두산</span>' }, { Class: 'relay', Text: '' }, { Class: null, Text: '잠실' }, { Class: null, Text: '우천취소' }] }] }, 2026, now);
  assert.equal(rained[0].state, 'void');
});

test('CPBL: the season list, postponed games void; TheSportsDB when the site turns us away', () => {
  const games = parseCpbl(JSON.parse(fixture('cpbl-2026.json')), now);
  assert.deepEqual(games.map(g => g.state), ['void', 'void', 'post', 'post', 'post', 'pre']);
  assert.equal(games[3].start, '2026-09-22T10:35:00.000Z');
  assert.equal(games[3].home.zh, '富邦悍將');
  const day = parseTsdbDay(JSON.parse(fixture('tsdb-cpbl-2026-09-28.json')), now);
  assert.equal(day.length, 3);
  assert.deepEqual([day[0].away.zh, day[0].awayScore, day[0].homeScore, day[0].home.zh, day[0].state], ['台鋼雄鷹', 10, 19, '中信兄弟', 'post']);
  assert.ok(day.some(g => g.away.en === 'Uni-President Lions'));
});

test("CPBL: TheSportsDB's days fill in after CPBL's own list stops, each game once", () => {
  const own = parseCpbl(JSON.parse(fixture('cpbl-2026.json')), now);
  const extra = parseTsdbDay(JSON.parse(fixture('tsdb-cpbl-2026-09-28.json')), now);
  const twin = { ...own.at(-1), id: 'cpbl-tsdb-x' };
  const merged = mergeCpbl(own, [...extra, twin]);
  assert.equal(merged.length, own.length + extra.length);
  assert.ok(!merged.some(g => g.id === 'cpbl-tsdb-x'));
  assert.equal(mergeCpbl([], extra).length, extra.length);
});

test('the address names a league and a month', () => {
  assert.deepEqual(asiaTarget(new URL('https://asia-baseball.quadra/kbo/2026-09.json')), { league: 'kbo', year: 2026, month: 9 });
  assert.equal(asiaTarget(new URL('https://asia-baseball.quadra/mlb/2026-09.json')), null);
  assert.equal(asiaTarget(new URL('https://asia-baseball.quadra/npb/2026-13.json')), null);
});

test('CPBL: every source refusing is an error, never an empty month', async () => {
  const { asiaBaseballResponse } = await import('../asia-baseball.js');
  const real = globalThis.fetch;
  globalThis.fetch = async url => new Response('no', { status: String(url).includes('thesportsdb') ? 403 : 404 });
  try {
    const r = await asiaBaseballResponse(new URL('https://asia-baseball.quadra/cpbl/2026-10.json'));
    assert.equal(r.status, 502);
    assert.match((await r.json()).error, /tsdb 403/);
  } finally {
    globalThis.fetch = real;
  }
});

test("CPBL's box score: its page's getlive answer as the app's box (sides, batters in order, pitchers' decisions, each at-bat's last pitch)", () => {
  assert.deepEqual(cpblBoxTarget(new URL('https://asia-baseball.quadra/cpbl/box/2026-290.json')), { year: 2026, sno: 290 });
  assert.equal(cpblBoxTarget(new URL('https://asia-baseball.quadra/cpbl/2026-08.json')), null);
  const j = x => JSON.stringify(x);
  const data = {
    CurtGameDetailJson: j({ GameStatus: 3, GameStatusChi: '比賽結束', VisitingTeamName: '台鋼雄鷹', HomeTeamName: '富邦悍將', VisitingTotalScore: 1, HomeTotalScore: 2 }),
    ScoreboardJson: j([
      { VisitingHomeType: '2', InningSeq: 2, ScoreCnt: 2, HittingCnt: 2, ErrorCnt: 0 },
      { VisitingHomeType: '1', InningSeq: 1, ScoreCnt: 1, HittingCnt: 1, ErrorCnt: 1 },
      { VisitingHomeType: '2', InningSeq: 1, ScoreCnt: 0, HittingCnt: 0, ErrorCnt: 0 }
    ]),
    BattingJson: j([
      { VisitingHomeType: '1', HitterAcnt: 'b', HitterName: '乙', RoleType: '先發', HitCnt: 3, HittingCnt: 1 },
      { VisitingHomeType: '1', HitterAcnt: 'a', HitterName: '甲', RoleType: '先發', HitCnt: 4, HittingCnt: 2 }
    ]),
    PitchingJson: j([{ VisitingHomeType: '2', PitcherAcnt: 'p', PitcherName: '丙', RoleType: '先發', GameResult: '勝', InningPitchedCnt: 6, InningPitchedDiv3Cnt: 1, PitchCnt: 90, StrikeCnt: 60 }]),
    LiveLogJson: j([
      { InningSeq: 1, VisitingHomeType: '1', HitterAcnt: 'a', HitterLineup: 1, DefendStationCode: 'CF', HitterName: '甲', Content: '壞球。', BattingActionName: '一安' },
      { InningSeq: 1, VisitingHomeType: '1', HitterAcnt: 'a', HitterLineup: 1, DefendStationCode: 'CF', HitterName: '甲', Content: '擊出一壘安打。', BattingActionName: '一安', VisitingScore: 0, HomeScore: 0 },
      { InningSeq: 1, VisitingHomeType: '1', HitterAcnt: 'b', HitterLineup: 2, DefendStationCode: 'SS', HitterName: '乙', Content: '擊出二壘安打，一壘跑者甲回本壘得分。', BattingActionName: '二安', IsScoreCnt: '1', VisitingScore: 1, HomeScore: 0 },
      { InningSeq: 9, VisitingHomeType: '1', HitterAcnt: 'b', Content: '比賽結束' }
    ])
  };
  const box = parseCpblBox(data, 2026, 290);
  assert.equal(box.state, 'post');
  assert.deepEqual([box.away.lines, box.home.lines, box.away.errors], [['1'], ['0', '2'], 1]);
  assert.deepEqual(box.batting.map(b => [b.name, b.order, b.pos, b.ab, b.h]), [['甲', 1, 'CF', 4, 2], ['乙', 2, 'SS', 3, 1]]);
  assert.deepEqual([box.pitching[0].decision, box.pitching[0].outs], ['W', 19]);
  assert.deepEqual(box.plays.map(p => [p.batter, p.result, p.scoring]), [['甲', '一安', false], ['乙', '二安', true]]);
});
