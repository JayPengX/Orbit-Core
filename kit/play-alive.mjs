// A championship (冠軍) board lists only who can still win it (the owner,
// 2026-10-21: "remove any option that is impossible"). 台灣運彩 takes an
// eliminated team off its 冠軍 board rather than leave it locked; so does
// Play, worked out from the results themselves, never only from a price:
//   - the US leagues: ESPN's table marks a team out of the play-offs 'e';
//   - a play-off series lost (MLB's own postseason list);
//   - a soccer league: a club whose points with every game left won can't
//     reach the leader's;
//   - F1: a driver or team whose points with every race left won can't
//     reach the leader's.
// Every reader here is pure; play-sources.mjs fetches and calls them. Each
// returns a Map of every name it knows to whether that name is out, so a
// board's name is judged against all of them (isOut).
import { sideScore } from '#kit/settle.mjs';

const clincherOf = e => {
  const s = (e?.stats || []).find(x => x?.name === 'clincher');
  return String(s?.displayValue ?? s?.value ?? '').trim();
};
const stat = (e, ...names) => {
  for (const n of names) {
    const s = (e?.stats || []).find(x => x?.name === n);
    if (s && Number.isFinite(Number(s.value))) return Number(s.value);
  }
  return null;
};
const nameOf = e => e?.team?.displayName || e?.athlete?.displayName || e?.team?.name || '';
// Every table of an ESPN standings answer (a league's, its conferences', its divisions').
function tables(data) {
  const out = [];
  const walk = n => {
    if (!n || typeof n !== 'object') return;
    if (n.standings?.entries) out.push({ name: n.name || '', entries: n.standings.entries });
    for (const c of n.children || []) walk(c);
  };
  walk(data);
  return out;
}

// The teams ESPN marks out of the play-offs ('e': eliminated).
export function clinchedOut(data) {
  const out = new Map();
  for (const t of tables(data)) for (const e of t.entries) if (nameOf(e)) out.set(nameOf(e), out.get(nameOf(e)) || /^e$/i.test(clincherOf(e)));
  return out;
}

// A soccer league's clubs that can no longer finish first: their points
// with every game left won (3 each; a double round robin, 2 × (clubs - 1)
// games) under the leader's points now.
export function leagueTitleOut(data) {
  const out = new Map();
  for (const t of tables(data)) {
    const rows = t.entries.map(e => ({ name: nameOf(e), points: stat(e, 'points'), played: stat(e, 'gamesPlayed') })).filter(r => r.name && r.points != null && r.played != null);
    if (rows.length < 4) continue;
    const games = 2 * (rows.length - 1);
    const top = Math.max(...rows.map(r => r.points));
    for (const r of rows) out.set(r.name, r.points + 3 * Math.max(0, games - r.played) < top);
  }
  return out;
}

// The most a driver or a team can still score: a Grand Prix pays 25 to its
// winner (no fastest-lap point since 2025), a sprint 8; a team's two cars
// 25 + 18 and 8 + 7.
export const F1_MOST = { driver: { race: 25, sprint: 8 }, team: { race: 43, sprint: 15 } };
// The races and sprints still to run, from ESPN's season scoreboard.
export function f1Left(season) {
  let races = 0;
  let sprints = 0;
  for (const ev of season?.events || []) {
    for (const c of ev.competitions || []) {
      if (c.status?.type?.completed || c.status?.type?.state === 'post') continue;
      if (c.type?.abbreviation === 'Race') races++;
      else if (c.type?.abbreviation === 'SR') sprints++;
    }
  }
  return { races, sprints };
}
// { drivers, teams }: who can't reach the leader's points any more (a tie
// is still alive: countback decides it).
export function f1Out(standings, left) {
  const drivers = new Map();
  const teams = new Map();
  if (!left || !(left.races + left.sprints >= 0)) return { drivers, teams };
  for (const t of tables(standings)) {
    const isTeam = /constructor/i.test(t.name);
    const most = isTeam ? F1_MOST.team : F1_MOST.driver;
    const room = left.races * most.race + left.sprints * most.sprint;
    const rows = t.entries.map(e => ({ name: nameOf(e), points: stat(e, 'championshipPts', 'points') })).filter(r => r.name && r.points != null);
    if (!rows.length) continue;
    const top = Math.max(...rows.map(r => r.points));
    for (const r of rows) (isTeam ? teams : drivers).set(r.name, r.points + room < top);
  }
  return { drivers, teams };
}

// The teams that lost a play-off series, from MLB's postseason list
// (statsapi schedule, gameType F,D,L,W): a series is lost once the other
// side has won more than half of its games.
export function mlbSeriesOut(schedule) {
  const series = new Map();
  for (const d of schedule?.dates || [])
    for (const g of d.games || []) {
      const a = g.teams?.away;
      const h = g.teams?.home;
      if (!a?.team?.name || !h?.team?.name) continue;
      const key = `${g.gameType}|${g.description?.replace(/\s*Game\s*\d+.*$/i, '') ?? ''}|${[a.team.name, h.team.name].sort().join('|')}`;
      if (!series.has(key)) series.set(key, { of: Number(g.gamesInSeries) || 0, sides: [a.team.name, h.team.name], wins: new Map() });
      const s = series.get(key);
      const winner = a.isWinner === true ? a.team.name : h.isWinner === true ? h.team.name : null;
      if (winner && g.status?.abstractGameState === 'Final') s.wins.set(winner, (s.wins.get(winner) || 0) + 1);
    }
  const out = new Map();
  for (const s of series.values()) {
    const need = Math.floor(s.of / 2) + 1;
    const won = s.of ? s.sides.find(side => (s.wins.get(side) || 0) >= need) : null;
    for (const side of s.sides) out.set(side, out.get(side) || Boolean(won && side !== won));
  }
  return out;
}

// Whether a board's name is out: its surest match among every name known,
// and only when that match is the one surest (Chicago's two clubs share a word).
export function isOut(name, known) {
  let best = 0;
  let pick = null;
  for (const [o, out] of known || []) {
    const s = sideScore(name, o);
    if (s > best) [best, pick] = [s, out];
    else if (s === best && s > 0 && out !== pick) pick = null;
  }
  return best > 0 && pick === true;
}
// Several readers' verdicts as one: out by any of them.
export function joinOut(...maps) {
  const all = new Map();
  for (const m of maps) for (const [k, v] of m || []) all.set(k, all.get(k) || v);
  return all;
}

// A championship market without the names that can't win, its chances
// shared again among those left; null once fewer than two are left (decided).
export function withoutOut(market, known) {
  if (!market || !known?.size) return market;
  const teams = market.teams.filter(t => !isOut(t.name?.en, known));
  if (teams.length === market.teams.length) return market;
  if (teams.length < 2) return null;
  const sum = teams.reduce((n, t) => n + t.fair, 0);
  return { ...market, teams: teams.map(t => ({ ...t, fair: t.fair / sum })) };
}
