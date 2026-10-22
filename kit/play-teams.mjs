// Logos, flags and the F1 grid: the shared kit's (lib/logos.mjs).
import { playLeagues } from '#kit/catalog.mjs';
import { normalizeTeamName, MLB_ABBR, NBA_ID, EPL_ESPN_ID, TEAM_BADGES, rememberLogo, teamLogo } from '#kit/logos.mjs';
export { normalizeTeamName, rememberLogo, teamLogo, leagueLogo, teamBadge, f1Driver, f1Constructor, F1_NAMES_ZH, F1_PAGE, countryFlag, countryCode, flagUrl } from '#kit/logos.mjs';

// Teams in Chinese: the shared kit's (lib/names.mjs), the lottery's names
// for the leagues it sells, the usual Taiwanese ones for the rest.
export { teamZh, teamNameZh } from '#kit/names.mjs';

// Every league Play sells (the catalogue's, catalog.mjs playLeagues).
export const LEAGUES = playLeagues({ sold: true });

// On sale: every league in the catalogue.
export const onSale = key => Boolean(LEAGUES[key]);
// Leagues from Kambi.
export const KAMBI_LEAGUES = Object.keys(LEAGUES).filter(key => LEAGUES[key].kambi);
export function familyOf(sport) {
  return sport === 'f1' ? 'racing' : LEAGUES[sport]?.family ?? null;
}

export const isSoccer = sport => familyOf(sport) === 'soccer';

// The sports shown home side first, as their fans read them: soccer (and
// rugby, handball, volleyball). Every US-style sport (baseball, basketball,
// American football, hockey; and Asia's baseball leagues) lists the visitors
// first ("Lakers @ Celtics"), and so does anything not known here.
const HOME_FIRST = new Set(['soccer', 'rugby', 'handball', 'volleyball']);

// A game's two sides in the order to show them: [first, second]. `game` has
// `home` and `away` (a team, a name or a score: whatever the screen draws)
// and the league key as `sport` (or the sport itself as `family`).
export function sidesInOrder(game) {
  const family = game?.family || familyOf(game?.sport) || game?.sport;
  return HOME_FIRST.has(family) ? [game?.home, game?.away] : [game?.away, game?.home];
}
// Every club of a league we have a logo for, one name each (aliases dropped):
// English names as the feeds write them. For games that show a team.
const titleCase = key => key.replace(/\b[a-z]/g, c => c.toUpperCase());
// Clubs from ESPN's team lists (rememberTeams): every league the quiz uses,
// MLB and the NBA included (ESPN gives each club's nickname).
const fetchedTeams = new Map();
const nicknames = new Map();
export function rememberTeams(sport, teams) {
  for (const { name, logo, nick } of teams) {
    rememberLogo(sport, name, logo);
    if (nick) nicknames.set(`${sport}|${name}`, nick);
  }
  fetchedTeams.set(sport, teams.map(t => t.name));
}
export const hasTeams = sport => (fetchedTeams.get(sport)?.length ?? 0) > 0 || Boolean(TEAM_BADGES[sport]);
export function leagueTeams(sport) {
  let names = [];
  if (fetchedTeams.get(sport)?.length) names = fetchedTeams.get(sport);
  else if (sport === 'mlb') names = Object.keys(MLB_ABBR);
  else if (sport === 'nba') names = Object.keys(NBA_ID);
  else if (sport === 'epl') names = Object.keys(EPL_ESPN_ID).map(titleCase);
  else if (TEAM_BADGES[sport]) names = Object.keys(TEAM_BADGES[sport]);
  const seen = new Set();
  return names.filter(name => {
    const logo = teamLogo(sport, name);
    if (!logo || seen.has(logo)) return false;
    seen.add(logo);
    return true;
  });
}

// ---- Finding a club's logo by a name that isn't ESPN's -------------------------------
//
// Championship markets write clubs their own way ("Betis", "Inter Milan",
// "1. FC Köln"); ESPN's team lists another ("Real Betis", "Internazionale",
// "FC Cologne"). A name finds its club in the given leagues' lists: the same
// name, one name inside the other, else the club sharing the most words
// (only when one club clearly shares the most). Names with no word in
// common go through TEAM_ALIASES (both sides as normalizeTeamName writes them).
const TEAM_ALIASES = {
  'inter milan': 'internazionale',
  inter: 'internazionale',
  rennes: 'stade rennais',
  'hamburger sv': 'hamburg sv',
  '1 koln': 'cologne',
  koln: 'cologne',
  'los angeles': 'lafc',
  psg: 'paris saint germain',
  'mississippi rebels': 'ole miss rebels',
  'athletic bilbao': 'athletic club',
  'bayern munchen': 'bayern munich',
  'sporting cp': 'sporting',
  'sporting lisbon': 'sporting'
};
const logoIndex = new Map();
export function findTeamLogo(sports, name) {
  if (!name) return null;
  let norm = normalizeTeamName(name);
  norm = TEAM_ALIASES[norm] ?? norm;
  const clubs = sports.flatMap(sport => {
    const key = `${sport}|${leagueTeams(sport).length}`;
    if (!logoIndex.has(key)) logoIndex.set(key, leagueTeams(sport).map(team => ({ sport, team, norm: normalizeTeamName(team), words: new Set(normalizeTeamName(team).split(' ').filter(w => w.length >= 3)) })));
    return logoIndex.get(key);
  });
  const logo = c => teamLogo(c.sport, c.team);
  const exact = clubs.find(c => c.norm === norm);
  if (exact) return logo(exact);
  const inside = clubs.filter(c => ` ${c.norm} `.includes(` ${norm} `) || ` ${norm} `.includes(` ${c.norm} `));
  if (inside.length) return logo(inside.sort((a, b) => Math.abs(a.norm.length - norm.length) - Math.abs(b.norm.length - norm.length))[0]);
  const words = norm.split(' ').filter(w => w.length >= 3);
  const scored = clubs.map(c => ({ c, n: words.filter(w => c.words.has(w)).length })).filter(x => x.n > 0).sort((a, b) => b.n - a.n);
  if (scored.length && (scored.length === 1 || scored[0].n > scored[1].n)) return logo(scored[0].c);
  return null;
}
