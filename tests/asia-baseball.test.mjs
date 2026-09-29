// Asian baseball from the leagues' own sites (asia-baseball.js), on saved pages.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseNpb, parseKbo, parseCpbl, parseTsdbDay, asiaTarget } from '../asia-baseball.js';

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

test('the address names a league and a month', () => {
  assert.deepEqual(asiaTarget(new URL('https://asia-baseball.quadra/kbo/2026-09.json')), { league: 'kbo', year: 2026, month: 9 });
  assert.equal(asiaTarget(new URL('https://asia-baseball.quadra/mlb/2026-09.json')), null);
  assert.equal(asiaTarget(new URL('https://asia-baseball.quadra/npb/2026-13.json')), null);
});
