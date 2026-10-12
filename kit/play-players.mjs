// The players of one game, from ESPN: each team's roster (who's on it, their
// headshot, an injury) and their season numbers (soccer: on the roster; the
// other sports: the league's list of every player's season, read once a
// league). Play's own model prices players' markets from these
// (propmodel.mjs) wherever Kambi doesn't, and Kambi's players get their
// pictures from them.
//
// A player: { id, name, side: 'home' | 'away', pos, photo, out, gp, totals }
// with `totals` the season's numbers under the board's stat names
// (props.mjs), `gp` the games they're over.
import { LEAGUES, familyOf } from '#kit/play-teams.mjs';
import { normPlayer } from '#kit/play-props.mjs';
import { espnHeadshot, smallPhoto } from '#kit/photo-urls.mjs';

export const ESPN_SITE = 'https://site.api.espn.com/apis/site/v2/sports';
export const ESPN_COMMON = 'https://site.api.espn.com/apis/common/v3/sports';
export const rosterUrl = (path, teamId) => `${ESPN_SITE}/${path}/teams/${encodeURIComponent(teamId)}/roster`;
// ESPN answers at most 1,000 players a page (asked for more, it sends 25).
export const athletesUrl = (path, season = null, page = 1) => `${ESPN_COMMON}/${path}/statistics/byathlete?limit=1000&isqualified=false&seasontype=2${season ? `&season=${season}` : ''}${page > 1 ? `&page=${page}` : ''}`;
// Every page of a season's list as one answer (3 pages at most: NFL's is 2).
async function allPages(getJson, path, season = null) {
  const first = await getJson(athletesUrl(path, season), 'espn-athletes');
  const pages = Math.min(3, Number(first?.pagination?.pages) || 1);
  const rest = await Promise.all(Array.from({ length: pages - 1 }, (_, i) => getJson(athletesUrl(path, season, i + 2), 'espn-athletes').catch(() => null)));
  return { ...first, athletes: [...(first?.athletes || []), ...rest.flatMap(r => r?.athletes || [])] };
}

// The families whose players the board prices (ESPN's box score settles them).
export const PLAYER_FAMILIES = new Set(['soccer', 'baseball', 'basketball', 'football', 'hockey']);
export const hasPlayers = sport => PLAYER_FAMILIES.has(familyOf(sport)) && Boolean(LEAGUES[sport]?.path) && sport !== 'ncaaf' && sport !== 'nbl';

// A roster's players, grouped by position or not: [{ id, name, pos, photo, out, stats }].
export function parseRoster(data, sport) {
  const list = (data?.athletes || []).flatMap(x => (Array.isArray(x?.items) ? x.items : [x])).filter(a => a?.id && a.displayName);
  return list.map(a => {
    const stats = {};
    for (const c of a.statistics?.splits?.categories || []) for (const s of c.stats || []) stats[s.name] = Number(s.value) || 0;
    const photo = a.headshot?.href || espnHeadshot(sport, a.id);
    const injury = String(a.injuries?.[0]?.status || '');
    return { id: String(a.id), name: a.displayName, pos: a.position?.abbreviation || '', photo: photo ? smallPhoto(photo) : null, guessed: !a.headshot?.href, out: /^out|injured reserve|suspen/i.test(injury), stats };
  });
}

// A league's players' season list: id -> { gp, raw: { stat name: value } }
// (every category's numbers under their own names; a name two categories
// share also as category.name).
export function parseAthletes(data) {
  const out = new Map();
  const cats = data?.categories || [];
  for (const x of data?.athletes || []) {
    const id = String(x.athlete?.id || '');
    if (!id) continue;
    const raw = {};
    for (const c of x.categories || []) {
      const names = cats.find(k => k.name === c.name)?.names || [];
      names.forEach((n, i) => {
        const v = c.values?.[i];
        if (v == null || !Number.isFinite(Number(v))) return;
        if (!(n in raw)) raw[n] = Number(v);
        raw[`${c.name}.${n}`] = Number(v);
      });
    }
    out.set(id, { name: x.athlete.displayName, teamId: String(x.athlete.teamId ?? ''), pos: x.athlete.position?.abbreviation || '', raw });
  }
  return out;
}

// The board's stat names from ESPN's, for a family: { gp, ...totals }.
export function totalsOf(family, raw) {
  const r = k => Number(raw[k]) || 0;
  const avgOr = (total, avg, gp) => (total in raw ? r(total) : r(avg) * gp);
  switch (family) {
    case 'soccer':
      return { gp: r('appearances'), subIns: r('subIns'), goals: r('totalGoals'), assists: r('goalAssists'), sot: r('shotsOnTarget') };
    case 'baseball': {
      const gp = r('batting.gamesPlayed') || r('gamesPlayed');
      return { gp, ab: r('batting.atBats') || r('atBats'), hits: r('batting.hits'), runs: r('batting.runs') || r('runs'), rbi: r('batting.RBIs') || r('RBIs'), hr: r('batting.homeRuns') };
    }
    case 'basketball': {
      const gp = r('gamesPlayed');
      return { gp, min: r('avgMinutes'), pts: avgOr('points', 'avgPoints', gp), reb: avgOr('rebounds', 'avgRebounds', gp), ast: avgOr('assists', 'avgAssists', gp), threes: avgOr('threePointFieldGoalsMade', 'avgThreePointFieldGoalsMade', gp) };
    }
    case 'football': {
      const gp = r('general.gamesPlayed') || r('gamesPlayed');
      return {
        gp,
        passYds: r('passingYards'),
        passAtt: r('passingAttempts'),
        passComp: r('completions'),
        passTD: r('passingTouchdowns'),
        ints: r('passing.interceptions'),
        rushYds: r('rushingYards'),
        rushAtt: r('rushingAttempts'),
        rec: r('receptions'),
        recYds: r('receivingYards'),
        td: r('rushing.rushingTouchdowns') + r('receiving.receivingTouchdowns')
      };
    }
    case 'hockey': {
      const gp = r('games') || r('gamesPlayed');
      return { gp, goals: r('goals'), assists: r('assists'), points: r('points'), shots: r('shotsTotal') };
    }
    default:
      return { gp: 0 };
  }
}

// Two seasons' totals as one: last season's at `weight` (a young season leans on it).
export function blendTotals(now, before, weight = 0.5) {
  if (!before) return now;
  if (!now) return Object.fromEntries(Object.entries(before).map(([k, v]) => [k, typeof v === 'number' ? v * weight : v]));
  const out = { ...now };
  for (const [k, v] of Object.entries(before)) if (typeof v === 'number' && k !== 'min') out[k] = (now[k] || 0) + v * weight;
  if (!now.min && before.min) out.min = before.min;
  return out;
}

// ---- Reading them ------------------------------------------------------------------

// Each league's season list (and last season's when this one is young:
// fewer than YOUNG_GAMES for its regulars), read again every 6 hours: an app
// left open across a season's first night would otherwise go on with the
// list it read before (ESPN's last season, all of it, until this one starts).
export const YOUNG_GAMES = 15;
const LIST_MS = 6 * 3_600_000;
const leagueLists = new Map();
const listAt = new Map();
export function leagueAthletes(sport, getJson) {
  const path = LEAGUES[sport]?.path;
  if (!path || familyOf(sport) === 'soccer') return Promise.resolve(null);
  if (Date.now() - (listAt.get(sport) || 0) > LIST_MS) leagueLists.delete(sport);
  if (!leagueLists.has(sport)) {
    listAt.set(sport, Date.now());
    const p = (async () => {
      const now = await allPages(getJson, path);
      const list = parseAthletes(now);
      const gps = [...list.values()].map(a => totalsOf(familyOf(sport), a.raw).gp).sort((a, b) => b - a);
      const young = (gps[Math.min(gps.length - 1, 30)] ?? 0) < YOUNG_GAMES;
      const year = Number(now?.requestedSeason?.year);
      const before = young && year > 2000 ? parseAthletes(await allPages(getJson, path, year - 1).catch(() => null)) : null;
      return { now: list, before };
    })();
    leagueLists.set(sport, p);
    p.catch(() => leagueLists.delete(sport));
  }
  return leagueLists.get(sport);
}

// Every player of a game: both rosters, each with their season's totals.
// `game.espnTeams` holds ESPN's team ids ({ home, away }).
export async function loadGamePlayers(game, getJson) {
  const path = LEAGUES[game.sport]?.path;
  if (!hasPlayers(game.sport) || !game.espnTeams?.home || !game.espnTeams?.away) return null;
  const family = familyOf(game.sport);
  const [home, away, league] = await Promise.all([
    getJson(rosterUrl(path, game.espnTeams.home), 'espn-roster').catch(() => null),
    getJson(rosterUrl(path, game.espnTeams.away), 'espn-roster').catch(() => null),
    leagueAthletes(game.sport, getJson).catch(() => null)
  ]);
  // Unread (a roster, or the league's season numbers the other sports need):
  // a failure to try again, never a game with no players.
  if (!home || !away || (family !== 'soccer' && !league)) throw new Error('players unread');
  const players = [];
  for (const [side, data] of [['home', home], ['away', away]]) {
    for (const p of parseRoster(data, game.sport)) {
      let totals;
      if (family === 'soccer') totals = totalsOf('soccer', p.stats);
      else {
        const now = league?.now.get(p.id);
        const before = league?.before?.get(p.id);
        totals = blendTotals(now && totalsOf(family, now.raw), before && totalsOf(family, before.raw));
        if (!totals) continue;
      }
      players.push({ id: p.id, name: p.name, side, pos: p.pos || league?.now.get(p.id)?.pos || '', photo: p.photo, guessed: p.guessed, out: p.out, gp: totals.gp || 0, totals });
    }
  }
  return players;
}

// A player of the game by name (Kambi's spelling): same name, else the same
// last name and first initial.
export function playerByName(players, name) {
  if (!players?.length) return null;
  const key = normPlayer(name);
  const same = players.find(p => normPlayer(p.name) === key);
  if (same) return same;
  const words = key.split(' ');
  const near = players.filter(p => {
    const w = normPlayer(p.name).split(' ');
    return w.at(-1) === words.at(-1) && w[0]?.[0] === words[0]?.[0];
  });
  return near.length === 1 ? near[0] : null;
}
