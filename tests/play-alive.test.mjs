// 冠軍 boards list only who can still win (kit/play-alive.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { clinchedOut, leagueTitleOut, f1Left, f1Out, mlbSeriesOut, isOut, joinOut, withoutOut } from '../kit/play-alive.mjs';
import { trimEspnStandings } from '../sports.js';

const row = (name, stats, key = 'team') => ({ [key]: { displayName: name }, stats });
const market = names => ({ key: 'x', sport: 'mlb', teams: names.map(n => ({ name: { en: n }, fair: 1 / names.length })) });

test('ESPN marks a team out of the play-offs: off the board, its chance shared by the rest', () => {
  const table = { children: [{ name: 'AL', standings: { entries: [row('Chicago White Sox', [{ name: 'clincher', value: 4, displayValue: 'e' }]), row('Chicago Cubs', [{ name: 'clincher', value: 2, displayValue: 'y' }]), row('Tampa Bay Rays', [])] } }] };
  const known = clinchedOut(trimEspnStandings(table));
  const m = withoutOut(market(['Chicago White Sox', 'Chicago Cubs', 'Tampa Bay Rays']), known);
  assert.deepEqual(m.teams.map(t => t.name.en), ['Chicago Cubs', 'Tampa Bay Rays']);
  assert.equal(m.teams[0].fair, 0.5);
});

test('a lost play-off series takes a team off; a suspended game counts for nobody', () => {
  const g = (n, aw, hw, a = 'Rays', h = 'Guardians', state = 'Final') => ({ gameType: 'L', description: `ALCS Game ${n}`, gamesInSeries: 7, status: { abstractGameState: state }, teams: { away: { team: { name: a }, isWinner: aw }, home: { team: { name: h }, isWinner: hw } } });
  const four = { dates: [{ games: [g(1, true, false), g(2, true, false), g(3, null, null), g(4, true, false), g(5, false, true), g(6, true, false)] }] };
  const out = mlbSeriesOut(four);
  assert.equal(out.get('Guardians'), true);
  assert.equal(out.get('Rays'), false);
  const three = mlbSeriesOut({ dates: [{ games: [g(1, true, false), g(2, true, false), g(3, true, false)] }] });
  assert.equal(three.get('Guardians'), false);
});

test("a soccer club that can't reach the leader's points with every game won is out", () => {
  const clubs = Array.from({ length: 20 }, (_, i) => row(`Club ${i}`, [{ name: 'points', value: i === 0 ? 90 : 30 }, { name: 'gamesPlayed', value: 33 }]));
  clubs[1] = row('Club 1', [{ name: 'points', value: 75 }, { name: 'gamesPlayed', value: 33 }]);
  const known = leagueTitleOut({ children: [{ standings: { entries: clubs } }] });
  assert.equal(known.get('Club 1'), false); // 75 + 15 = 90: still level
  assert.equal(known.get('Club 2'), true);
});

test("F1: a driver whose points with every race left won can't reach the leader's is out", () => {
  const season = { events: [{ competitions: [{ type: { abbreviation: 'Race' }, status: { type: { completed: true } } }] }, { competitions: [{ type: { abbreviation: 'SR' }, status: { type: { state: 'pre' } } }, { type: { abbreviation: 'Race' }, status: { type: { state: 'pre' } } }] }] };
  assert.deepEqual(f1Left(season), { races: 1, sprints: 1 });
  const standings = { children: [
    { name: 'Driver Standings', standings: { entries: [row('A', [{ name: 'championshipPts', value: 100 }], 'athlete'), row('B', [{ name: 'championshipPts', value: 67 }], 'athlete'), row('C', [{ name: 'championshipPts', value: 66 }], 'athlete')] } },
    { name: 'Constructor Standings', standings: { entries: [row('Red Bull', [{ name: 'points', value: 100 }]), row('Racing Bulls', [{ name: 'points', value: 10 }])] } }
  ] };
  const { drivers, teams } = f1Out(trimEspnStandings(standings), f1Left(season));
  assert.equal(drivers.get('B'), false);
  assert.equal(drivers.get('C'), true);
  assert.equal(isOut('Red Bull Racing', teams), false);
  assert.equal(isOut('Racing Bulls', teams), true);
});

test('a board down to one name is decided: no board', () => {
  assert.equal(withoutOut(market(['A', 'B']), joinOut(new Map([['A', true]]))), null);
  const m = market(['A', 'B']);
  assert.equal(withoutOut(m, new Map()), m);
});
