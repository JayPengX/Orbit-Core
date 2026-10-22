// The house's own win chances, for a game no bookmaker prices (preseason, a
// game weeks out, a league DraftKings skips), so every game on an ESPN
// scoreboard is sold all the same.
//
//   Strength   each team's share of wins in ESPN's standings (a draw half a
//              win; the US leagues' regular season only, never the
//              preseason's), this season's games on top of last season's, which is
//              pulled a third of the way to even (last year's team isn't
//              this year's). Early in a season last year's counts most; by
//              its middle, this year's.
//   The game   the two strengths against each other (log5), plus the home
//              side's usual edge (none at a neutral venue). Soccer takes a
//              draw out: likeliest in an even game, rarer in a one-sided one.
//
//   Preseason  pulled halfway to even: starters sit, and last season's
//              strengths would mislead the house.
//
// A team the standings don't list (a cup's guest, a national team) counts as
// even. Cut like every other price (rules.mjs houseCut).
import { normalizeTeamName, isSoccer, familyOf } from '#kit/play-teams.mjs';
// The same side under two spellings: the shared kit's (settle.mjs).
import { sameSide, sideScore, sideOfGame, sidesMatch } from '#kit/settle.mjs';
export { sameSide, sideScore, sideOfGame, sidesMatch };

const ESPN_STANDINGS = 'https://site.api.espn.com/apis/v2/sports';

// Games in a regular season: how much a game of it tells about a team.
const SEASON_GAMES = { nba: 82, wnba: 44, nhl: 82, mlb: 162, nfl: 17 };
const FAMILY_GAMES = { soccer: 34, baseball: 140, basketball: 40, hockey: 60, football: 14 };
// Last season counts as this many of this season's games (a share of a season).
const PRIOR_SHARE = 0.3;
// Last season pulled this far towards even.
const PRIOR_REGRESS = 1 / 3;
// The home side's edge, in log-odds: about 56% at home between even NBA
// teams, 54% in MLB, a soccer home side 44% to 30% with a draw.
const HOME_EDGE = { nba: 0.25, wnba: 0.2, nhl: 0.15, mlb: 0.15, nfl: 0.2 };
const FAMILY_EDGE = { soccer: 0.35, baseball: 0.15, basketball: 0.3, hockey: 0.15, football: 0.25 };
// Soccer's draw: this chance in an even game, less the more one-sided.
const DRAW_EVEN = 0.27;
const DRAW_FALL = 0.5;
const CLAMP = [0.03, 0.97];
const PRESEASON_PULL = 0.5;

const logit = p => Math.log(p / (1 - p));
const sigmoid = x => 1 / (1 + Math.exp(-x));
const clamp = p => Math.min(CLAMP[1], Math.max(CLAMP[0], p));
const seasonGames = sport => SEASON_GAMES[sport] ?? FAMILY_GAMES[familyOf(sport)] ?? 30;

// Every team in an ESPN standings answer (divisions and conferences nested
// any depth): name -> { wins, games } (a draw half a win).
export function parseStandings(data) {
  const out = new Map();
  const walk = node => {
    if (Array.isArray(node)) return node.forEach(walk);
    if (!node || typeof node !== 'object') return;
    for (const entry of node.standings?.entries || []) {
      const stat = name => Number(entry.stats?.find(s => s.name === name || s.type === name)?.value) || 0;
      const draws = stat('ties');
      const games = stat('gamesPlayed') || stat('wins') + stat('losses') + draws + stat('otLosses');
      // Some tables give only the share (NRL).
      const wins = stat('wins') || stat('losses') ? stat('wins') + draws / 2 : stat('winPercent') * games;
      const name = entry.team?.displayName;
      if (name) out.set(normalizeTeamName(name), { wins, games });
    }
    for (const [key, value] of Object.entries(node)) if (key !== 'standings' && typeof value === 'object') walk(value);
  };
  walk(data);
  return out;
}

// A team's strength (0-1) from this season's record and last season's.
export function strengthOf(sport, current, previous) {
  const n = seasonGames(sport);
  const priorShare = previous?.games ? previous.wins / previous.games : 0.5;
  const prior = 0.5 + (priorShare - 0.5) * (1 - PRIOR_REGRESS);
  const weight = PRIOR_SHARE * n;
  return (Number(current?.wins || 0) + prior * weight) / (Number(current?.games || 0) + weight);
}

// Every team's strength in a league: name -> 0-1.
export function strengths(sport, current, previous) {
  const out = new Map();
  for (const name of new Set([...current.keys(), ...previous.keys()])) out.set(name, strengthOf(sport, current.get(name), previous.get(name)));
  return out;
}

// The house's fair chances for one game: { away, home } or, for soccer,
// { away, draw, home }.
export function housePrices(sport, away, home, table, { neutral = false, preseason = false } = {}) {
  const s = name => clamp(table?.get(normalizeTeamName(name)) ?? table?.unranked ?? 0.5);
  const edge = neutral ? 0 : HOME_EDGE[sport] ?? FAMILY_EDGE[familyOf(sport)] ?? 0.2;
  const p = clamp(sigmoid((logit(s(home)) - logit(s(away)) + edge) * (preseason ? PRESEASON_PULL : 1)));
  if (!isSoccer(sport)) return { away: 1 - p, home: p };
  const draw = DRAW_EVEN - DRAW_FALL * (p - 0.5) ** 2;
  return { away: (1 - draw) * (1 - p), draw, home: (1 - draw) * p };
}

// A league's strengths, from this season's standings and last season's
// (asked for by the year before the one ESPN answers with). A league without
// standings gets an empty table (every team even).
const tables = new Map();
const BEFORE_WAIT_MS = 2_500;
// Asked for alongside the league's games (sources.mjs), not after them: the
// same reading is shared (it had been three round trips after the games').
export function loadStrengths(sport, path, getJson) {
  const slot = tables.get(sport);
  if (slot && Date.now() - slot.at < 6 * 3_600_000) return slot.table;
  const table = readStrengths(sport, path, getJson);
  tables.set(sport, { at: Date.now(), table });
  table.catch(() => tables.delete(sport));
  return table;
}
async function readStrengths(sport, path, getJson) {
  const url = `${ESPN_STANDINGS}/${path}/standings`;
  // The regular season's table only (the US leagues): ESPN's default counts
  // the preseason in (the NBA's October: Brooklyn 1-0 before a real game),
  // which would carry into the season's first weeks as this season's record.
  const regular = ['basketball', 'baseball', 'hockey', 'football'].includes(familyOf(sport));
  const query = extra => [regular ? 'seasontype=2' : '', extra].filter(Boolean).join('&');
  // (Trimmed by the proxy to the names and records read here: a table was up to 3 MB.)
  const now = await getJson(`${url}${query('') ? `?${query('')}` : ''}`, 'espn-standings').catch(() => null);
  const year = Number(now?.seasons?.[0]?.year ?? now?.season?.year ?? now?.children?.[0]?.standings?.season);
  // Last season's only refines the table: never worth holding the board for.
  const before = Number.isFinite(year) && year > 2000 ? await Promise.race([getJson(`${url}?${query(`season=${year - 1}`)}`, 'espn-standings').catch(() => null), new Promise(r => setTimeout(r, BEFORE_WAIT_MS, null))]) : null;
  return strengths(sport, parseStandings(now), parseStandings(before));
}

// Games (from parseEspnScoreboard) that no bookmaker prices get the house's
// chances as `house`.
export async function withHousePrices(games, sport, path, getJson) {
  const priced = g => g.outcomes || g.kambi?.outcomes;
  if (!path || !games.some(g => !priced(g))) return games;
  const table = await loadStrengths(sport, path, getJson).catch(() => new Map());
  return games.map(g => (priced(g) ? g : { ...g, house: housePrices(sport, g.away, g.home, table, { neutral: g.neutral, preseason: g.preseason }) }));
}


