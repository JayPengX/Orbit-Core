// A season pack slimmed (builders/sports.js slim) reads the same as the whole
// one: the kit's parser (Orbit Sports) and the builders' readers get the same
// games, and slimming twice changes nothing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { slim } from '../builders/sports.js';
import { parseScoreboard } from '../kit/sports-espn.mjs';
import { espnGames, mlsGames } from '../builders/watch.js';

const athlete = id => ({ id: String(id), fullName: `Player ${id}`, displayName: `Player ${id}`, shortName: `P. ${id}`, headshot: `https://a.espncdn.com/i/headshots/mlb/players/full/${id}.png`, jersey: '31', position: 'SP', team: { id: '14' } });
const team = (id, abbr) => ({ id, location: 'Toronto', name: 'Blue Jays', abbreviation: abbr, displayName: `Club ${abbr}`, shortDisplayName: abbr, color: '134a8e', alternateColor: '6cace5', isActive: true, logo: `https://a.espncdn.com/i/teamlogos/mlb/500/scoreboard/${abbr}.png`, logoDark: 'x.png', venue: { id: '1' } });
const status = state => ({ clock: 0, displayClock: '0:00', period: 9, type: { id: '3', name: state === 'post' ? 'STATUS_FINAL' : 'STATUS_IN_PROGRESS', state, completed: state === 'post', description: 'Final', detail: 'Final', shortDetail: 'Final' } });
const side = (id, abbr, homeAway, score, recordsFirst) => ({
  id,
  type: 'team',
  order: homeAway === 'home' ? 0 : 1,
  homeAway,
  winner: homeAway === 'away',
  team: team(id, abbr),
  score,
  linescores: [1, 0, 3].map((v, i) => ({ value: v, displayValue: String(v), period: i + 1 })).concat([{ value: 2, period: 4 }]),
  probables: [{ name: 'probableStartingPitcher', athlete: athlete(28976), record: '(4-9, 5.74)' }],
  records: recordsFirst ? [{ name: 'Home', type: 'home', summary: '20-16' }, { name: 'overall', abbreviation: 'Game', type: 'total', summary: '33-36' }, { name: 'Road', type: 'road', summary: '13-20' }] : [{ name: 'All Splits', abbreviation: 'Any', type: 'ytd', summary: '5-1-2' }]
});
const game = (id, state, league = 'mlb') => ({
  id,
  date: '2026-06-10T23:07Z',
  name: 'Philadelphia Phillies at Toronto Blue Jays',
  shortName: 'PHI @ TOR',
  season: { year: 2026, type: 2, slug: 'regular-season' },
  status: status(state),
  competitions: [
    {
      id,
      date: '2026-06-10T23:07Z',
      type: { id: '1', abbreviation: 'STD' },
      venue: { id: '14', fullName: 'Rogers Centre', address: { city: 'Toronto', state: 'Ontario' }, indoor: true },
      competitors: [side('14', 'TOR', 'home', '4', true), side('22', 'PHI', 'away', '7', false)],
      status: { ...status(state), featuredAthletes: [{ name: 'winningPitcher', athlete: athlete(39667) }] },
      broadcasts: [{ market: 'national', names: ['MLB.TV'] }],
      notes: [{ headline: 'Game 1' }],
      details: [{ type: { id: '70', text: 'Goal' }, clock: { value: 600, displayValue: "10'" }, team: { id: '22' }, scoringPlay: true, athletesInvolved: [athlete(1)] }]
    }
  ]
});
const pack = league => ({ leagues: [{ id: '10', name: 'MLB', season: { year: 2026, startDate: '2026-02-20T08:00Z', endDate: '2026-11-05T07:59Z' }, calendar: ['2026-03-26T07:00Z'], logos: [{ href: 'l.png' }] }], events: [game('401', 'post', league), game('402', 'in', league), game('403', 'pre', league)] });
const slimmed = p => ({ ...p, leagues: slim(p.leagues), events: p.events.map(e => slim(e)) });

test('a slim pack parses to the same games, in both languages', () => {
  for (const league of ['mlb', 'epl', 'nba']) {
    const whole = pack(league);
    const lean = slimmed(whole);
    assert.deepEqual(parseScoreboard(lean, league), parseScoreboard(whole, league));
    assert.deepEqual(parseScoreboard(lean, league, { lang: 'en' }), parseScoreboard(whole, league, { lang: 'en' }));
    assert.deepEqual(espnGames(lean, league), espnGames(whole, league));
    assert.deepEqual(mlsGames(lean), mlsGames(whole));
    assert.ok(JSON.stringify(lean).length < JSON.stringify(whole).length * 0.6);
  }
});

test('what slim leaves out, and what it keeps', () => {
  const lean = slimmed(pack('epl'));
  const [post, live] = lean.events;
  const c = post.competitions[0];
  assert.equal(c.details, undefined, "a game over: its goals aren't read");
  assert.equal(live.competitions[0].details.length, 1, 'a game on: its goals are');
  assert.equal(c.competitors[0].probables, undefined);
  assert.equal(c.status.featuredAthletes, undefined);
  assert.deepEqual(c.competitors[0].linescores, [{ displayValue: '1' }, { displayValue: '0' }, { displayValue: '3' }, { value: 2 }]);
  assert.deepEqual(c.competitors[0].records, [{ name: 'Home', type: 'home', summary: '20-16' }, { name: 'overall', type: 'total', summary: '33-36' }]);
  assert.deepEqual(c.competitors[1].records, [{ name: 'All Splits', type: 'ytd', summary: '5-1-2' }]);
  assert.deepEqual(Object.keys(c.competitors[0].team).sort(), ['abbreviation', 'alternateColor', 'color', 'displayName', 'id', 'logo', 'name', 'shortDisplayName']);
  assert.deepEqual(c.venue, { id: '14', fullName: 'Rogers Centre', indoor: true });
  assert.deepEqual(c.broadcasts, [{ names: ['MLB.TV'] }]);
  assert.equal(lean.leagues[0].logo, 'l.png');
  assert.deepEqual(lean.leagues[0].season, pack('epl').leagues[0].season);
});

test('slimming twice changes nothing (packs carry last night’s months)', () => {
  const once = slimmed(pack('mlb'));
  assert.deepEqual(slimmed(once), once);
});

test("a race's circuit keeps its country (the flag)", () => {
  const race = { id: '600', date: '2026-06-01T13:00Z', name: 'Grand Prix', circuit: { fullName: 'Circuit', address: { city: 'Monaco', country: 'Monaco' } }, competitions: [{ id: '1', type: { abbreviation: 'Race' }, date: '2026-06-01T13:00Z', status: status('post'), competitors: [] }] };
  assert.deepEqual(slim(race).circuit, race.circuit);
});
