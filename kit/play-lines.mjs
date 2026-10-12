// Our own lines: a game's total (runs, goals, points) when no bookmaker
// posts one, so every game gets the full board (totals, handicaps, team
// totals, halves, margins, first five innings…) from nothing more than who
// is likely to win. Everything past the total already comes from the win
// chance and the total (board.mjs, markets.mjs); this fills the one gap.
//
//   Soccer: each team's mean goals fitted to the win and draw chances
//   (live.mjs fitGoals: a likely draw means few goals), so the total comes
//   from the game's own 1X2 prices, not a league average.
//   Everything else: the league's average total, nudged by how one-sided
//   the game is where that is measurable (basketball and football blowouts
//   run a little higher), with the same spreads the bookmaker lines use.
//
// LEAGUE_TOTALS: average total per game, recent full seasons (runs,
// points, goals). Checked against the bookmakers' own totals where both
// exist: see tests/lines.test.mjs and the README for the measured gaps.
import { totalOverChance, MLB_TOTAL_DISPERSION, GOALS_DISPERSION } from '#kit/play-odds.mjs';
import { normalCdf, SCORE_SPREAD } from '#kit/play-markets.mjs';
import { fitGoals } from '#kit/play-live.mjs';
import { familyOf, isSoccer } from '#kit/play-teams.mjs';

export const LEAGUE_TOTALS = {
  // Baseball (runs).
  mlb: 8.8,
  npb: 7.2,
  kbo: 10.4,
  cpbl: 8.3,
  // Football (points).
  nfl: 44,
  ncaaf: 56,
  // Basketball (points).
  nba: 230,
  wnba: 167,
  euroleague: 166,
  bleague: 168,
  // Hockey (goals, overtime included).
  nhl: 6.1
};
// A one-sided game's extra points: at a 90% favourite, this much more than
// an even game (garbage time, blowout pace), scaled by how far from even.
const LOPSIDED_EXTRA = { nba: 3, wnba: 2, euroleague: 2, bleague: 2, nfl: 1, ncaaf: 4 };
// Soccer: goals fitted from the draw chance alone come out low (real games
// draw more often than independent goal counts say, so a likely draw reads
// as fewer goals than it is): scaled up, and blended with the league's own
// average. Checked against the bookmakers' totals (MLS, Liga MX).
const SOCCER_SCALE = 1.12;
const SOCCER_LEAGUE_WEIGHT = 0.3;
const SOCCER_TOTALS = { epl: 2.95, laliga: 2.6, seriea: 2.7, bundesliga: 3.15, ligue1: 2.85, ucl: 3.1, uel: 2.9, eredivisie: 3.2, primeira: 2.7, mls: 3.2, ligamx: 2.9, jleague: 2.6, brasileirao: 2.45, argentina: 2.2, superlig: 2.9, scotland: 2.8, belgium: 2.9, saudi: 3.0, uecl: 2.9, libertadores: 2.4, sudamericana: 2.4, nationsleague: 2.6, wcqeurope: 2.7, leaguecup: 2.9, copadelrey: 2.8, acl: 2.9, asiancup: 2.5, friendly: 2.5, kleague: 2.6, worldcup: 2.6, euro: 2.4, copaamerica: 2.3, clubworldcup: 2.9 };

const halfLine = x => Math.floor(x) + 0.5;

// The mean total the model uses for a game, or null for sports it doesn't
// cover (sets, racing, futures). probs: { home, away, draw? }, fair chances.
export function modelMean(sport, probs) {
  if (!probs) return null;
  if (isSoccer(sport)) {
    if (probs.draw == null) return null;
    const means = fitGoals(probs.home, probs.away);
    const fitted = (means.home + means.away) * SOCCER_SCALE;
    const league = SOCCER_TOTALS[sport];
    return league ? fitted * (1 - SOCCER_LEAGUE_WEIGHT) + league * SOCCER_LEAGUE_WEIGHT : fitted;
  }
  const base = LEAGUE_TOTALS[sport];
  if (base == null) return null;
  const extra = LOPSIDED_EXTRA[sport] ?? 0;
  if (!extra) return base;
  const fav = Math.max(probs.home, probs.away) / (probs.home + probs.away);
  return base + extra * Math.min(1, Math.max(0, (fav - 0.5) / 0.4));
}

// A total line for a game without a posted one: { line, overFair, modeled }
// (the half line nearest the mean, and its fair over chance), in the same
// shape as a bookmaker's so the rest of the board prices it the same way.
export function modelTotal(game, probs) {
  const mu = modelMean(game.sport, probs);
  if (mu == null || !(mu > 0)) return null;
  const family = familyOf(game.sport);
  let line;
  let overFair;
  if (family === 'baseball') {
    line = halfLine(mu);
    overFair = totalOverChance(line, mu, MLB_TOTAL_DISPERSION);
  } else if (family === 'soccer' || family === 'hockey') {
    line = halfLine(mu);
    overFair = totalOverChance(line, mu, GOALS_DISPERSION);
  } else {
    const sd = SCORE_SPREAD[game.sport]?.total;
    if (!sd) return null;
    line = halfLine(mu);
    overFair = 1 - normalCdf((line - mu) / sd);
  }
  return { line, overFair, modeled: true, mean: mu };
}

// The game with a total filled in when it has none (and a note that it's
// the model's): what board.mjs prices every game from.
export function withModelLines(game, probs) {
  if (game.total || isSoccer(game.sport) === false && LEAGUE_TOTALS[game.sport] == null) return game;
  const total = modelTotal(game, probs);
  return total ? { ...game, total } : game;
}
