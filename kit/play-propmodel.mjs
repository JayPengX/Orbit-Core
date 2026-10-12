// Play's own prices for players' markets, from their season numbers
// (players.mjs), for every player Kambi doesn't price: each one's rate a game
// (pulled towards their position's usual rate while their games are few),
// scaled by how much their team is expected to score in this game, through
// the distribution that fits the number (goals and home runs: Poisson-like
// counts; hits: at-bats; points and yards: a normal spread).
//
// Picks come out in Kambi's shape ({ stat, line, side, player, fair }), with
// `model: true`; the board prices them at MODEL_CUT (a model knows less than
// a bookmaker) and settles them like Kambi's (props.mjs).
import { familyOf } from '#kit/play-teams.mjs';

export const MODEL_CUT = 1.25;
// A pick this unlikely (or likely) isn't offered.
const RANGE = [0.03, 0.92];

// Each family's typical team score a game: a team expected to score more
// than this in the game lifts its players' rates (at most ×1.5, at least ×0.6).
export const TEAM_AVERAGE = { soccer: 1.4, baseball: 4.4, basketball: 113, football: 22, hockey: 3.05 };

// Priors: a rate a game for a position, and how many games of it count.
const PRIOR_GAMES = 6;
const SOCCER_PRIOR = { F: { goals: 0.32, assists: 0.12, sot: 1.0 }, M: { goals: 0.1, assists: 0.12, sot: 0.4 }, D: { goals: 0.04, assists: 0.05, sot: 0.15 } };

// ---- Distributions ---------------------------------------------------------------------

function logFact(n) {
  let s = 0;
  for (let i = 2; i <= n; i++) s += Math.log(i);
  return s;
}
// P(X >= k) for a negative binomial with mean m (r: dispersion; huge: Poisson).
export function atLeast(m, k, r = 1e6) {
  if (k <= 0) return 1;
  if (!(m > 0)) return 0;
  const p = r / (r + m);
  let below = 0;
  for (let i = 0; i < k; i++) below += Math.exp(logGamma(i + r) - logGamma(r) - logFact(i) + r * Math.log(p) + i * Math.log(1 - p));
  return Math.max(0, Math.min(1, 1 - below));
}
function logGamma(x) {
  // Lanczos.
  const g = 7;
  const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - logGamma(1 - x);
  x -= 1;
  let a = c[0];
  const t = x + g + 0.5;
  for (let i = 1; i < g + 2; i++) a += c[i] / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}
// P(X >= k) for a binomial of n tries at p.
export function binomAtLeast(n, p, k) {
  let below = 0;
  for (let i = 0; i < k && i <= n; i++) below += Math.exp(logFact(n) - logFact(i) - logFact(n - i) + i * Math.log(p) + (n - i) * Math.log(1 - p));
  return Math.max(0, Math.min(1, 1 - below));
}
const erf = x => {
  const t = 1 / (1 + 0.3275911 * Math.abs(x));
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return x >= 0 ? y : -y;
};
// P(X > line) for a normal number.
export const normalOver = (mean, sd, line) => 0.5 * (1 - erf((line - mean) / (sd * Math.SQRT2)));

// ---- The rates -----------------------------------------------------------------------

// A rate a game: the season's, pulled to the prior while the games are few.
const rate = (total, gp, prior, k = PRIOR_GAMES) => (total + prior * k) / (gp + k);
const posGroup = pos => (/^(F|ST|CF|LW|RW|W|FW|SS|A)/i.test(pos) ? 'F' : /^(M|CM|AM|DM|LM|RM)/i.test(pos) ? 'M' : /^(G|GK)/i.test(pos) ? 'G' : 'D');

// The two teams' expected scores in this game: { home, away }.
export function teamScores(family, { homeMean, awayMean, total, spread, homeWin }) {
  if (homeMean > 0 && awayMean > 0) return { home: homeMean, away: awayMean };
  if (!(total > 0)) return null;
  if (spread != null) return { home: (total + spread) / 2, away: (total - spread) / 2 };
  const share = 0.5 + ((homeWin ?? 0.5) - 0.5) * 0.3;
  return { home: total * share, away: total * (1 - share) };
}

// A preseason game: the share of a regular game's playing time its regulars
// get (a star plays a half or so, then rests; football's starters a series
// or two), and how much less sure that makes their numbers. Their numbers
// are last season's full games: priced as they were, Kevin Durant was
// favoured to pass 25.5 points in an October exhibition.
export const PRESEASON = { basketball: { share: 0.6, spread: 1.35 }, football: { share: 0.3, spread: 1.6 }, hockey: { share: 0.8, spread: 1.2 }, baseball: { share: 0.5, spread: 1.3 }, soccer: { share: 0.6, spread: 1.3 } };

// Every model pick for the game's players. `scores`: teamScores' answer (or
// null: league-average teams). `preseason`: an exhibition game (PRESEASON).
export function modelProps(sport, players, scores, { preseason = false } = {}) {
  const family = familyOf(sport);
  const avg = TEAM_AVERAGE[family];
  const pre = preseason ? PRESEASON[family] || { share: 0.6, spread: 1.3 } : { share: 1, spread: 1 };
  const scale = side => {
    const s = scores?.[side];
    return (s > 0 && avg ? Math.min(1.5, Math.max(0.6, s / avg)) : 1) * pre.share;
  };
  const out = [];
  const add = (p, stat, line, side, fair) => {
    if (fair >= RANGE[0] && fair <= RANGE[1]) out.push({ stat, line, side, player: p.name, fair, model: true });
  };
  const ou = (p, stat, mean, sd) => {
    if (!(mean > 0)) return;
    sd *= pre.spread;
    const line = Math.floor(mean) + 0.5;
    const over = normalOver(mean, sd, line);
    if (over >= RANGE[0] && 1 - over >= RANGE[0]) {
      add(p, stat, line, 'over', over);
      add(p, stat, line, 'under', 1 - over);
    }
  };
  const live = players.filter(p => !p.out);
  if (family === 'soccer') {
    // A side's games so far: its most-used player's.
    const teamGames = side => Math.max(1, ...live.filter(p => p.side === side).map(p => p.gp));
    const lam = {};
    for (const p of live) {
      const group = posGroup(p.pos);
      if (group === 'G' || p.gp < Math.max(1, 0.3 * teamGames(p.side))) continue;
      const prior = SOCCER_PRIOR[group];
      // A sub's appearance is a part of a game.
      const part = p.gp ? 1 - 0.55 * Math.min(1, (p.totals.subIns || 0) / p.gp) : 1;
      const f = scale(p.side) * part;
      const g = rate(p.totals.goals, p.gp, prior.goals) * f;
      const a = rate(p.totals.assists, p.gp, prior.assists) * f;
      const s = rate(p.totals.sot, p.gp, prior.sot) * f;
      lam[p.name] = g;
      add(p, 'goals', 1, 'yes', atLeast(g, 1));
      add(p, 'goals', 2, 'yes', atLeast(g, 2));
      add(p, 'assists', 1, 'yes', atLeast(a, 1));
      add(p, 'ga', 1, 'yes', atLeast(g + a, 1));
      add(p, 'sot', 1, 'yes', atLeast(s, 1, 8));
      add(p, 'sot', 2, 'yes', atLeast(s, 2, 8));
    }
    // First goalscorer: a player's share of the game's goals, times a goal
    // being scored (own goals, about 3%, aside).
    const total = (scores?.home ?? avg) + (scores?.away ?? avg);
    for (const p of live) if (lam[p.name] != null) add(p, 'first', null, 'yes', (lam[p.name] / total) * (1 - Math.exp(-total)) * 0.97);
  } else if (family === 'baseball') {
    for (const p of live) {
      const t = p.totals;
      // Everyday batters only (pitchers and bench players aside).
      if (/^(P|SP|RP)$/.test(p.pos) || p.gp < 10 || t.ab / Math.max(1, p.gp) < 2.6) continue;
      const f = scale(p.side);
      const ab = Math.min(5, Math.max(preseason ? 2 : 3, Math.round((t.ab / p.gp) * pre.share)));
      const avgHit = (t.hits + 0.245 * 60) / (t.ab + 60);
      const hr = rate(t.hr, p.gp, 0.12, 20) * f;
      const rbi = rate(t.rbi, p.gp, 0.45, 20) * f;
      const runs = rate(t.runs, p.gp, 0.45, 20) * f;
      add(p, 'hr', 1, 'yes', atLeast(hr, 1));
      add(p, 'hits', 1, 'yes', binomAtLeast(ab, avgHit, 1));
      add(p, 'hits', 2, 'yes', binomAtLeast(ab, avgHit, 2));
      add(p, 'rbi', 1, 'yes', atLeast(rbi, 1, 3));
      add(p, 'rbi', 2, 'yes', atLeast(rbi, 2, 3));
      add(p, 'runs', 1, 'yes', atLeast(runs, 1, 4));
      const hrr = ab * avgHit + rbi + runs;
      add(p, 'hrr', 2, 'yes', atLeast(hrr, 2, 4));
      add(p, 'hrr', 3, 'yes', atLeast(hrr, 3, 4));
    }
  } else if (family === 'basketball') {
    for (const p of live) {
      const t = p.totals;
      if (p.gp < 5 || (t.min || 0) < 16) continue;
      const f = scale(p.side);
      const pts = (t.pts / p.gp) * f;
      ou(p, 'pts', pts, 0.3 * pts + 2.5);
      const reb = (t.reb / p.gp) * pre.share;
      ou(p, 'reb', reb, 0.38 * reb + 1.2);
      const ast = (t.ast / p.gp) * pre.share;
      ou(p, 'ast', ast, 0.4 * ast + 1);
      const threes = (t.threes / p.gp) * f;
      for (const k of [1, 2, 3]) add(p, 'threes', k, 'yes', atLeast(threes, k, 10));
    }
  } else if (family === 'football') {
    for (const p of live) {
      const t = p.totals;
      if (p.gp < 1) continue;
      const g = p.gp;
      const f = scale(p.side);
      if (t.passAtt / g >= 15) {
        const yds = (t.passYds / g) * f;
        ou(p, 'passYds', yds, 0.24 * yds + 12);
        ou(p, 'passComp', (t.passComp / g) * pre.share, 0.15 * (t.passComp / g) * pre.share + 2);
        add(p, 'passTD', 2, 'yes', atLeast((t.passTD / g) * f, 2, 12));
      }
      if (t.rushAtt / g >= 5) ou(p, 'rushYds', (t.rushYds / g) * f, 0.45 * (t.rushYds / g) + 8);
      if (t.rec / g >= 2) {
        ou(p, 'rec', (t.rec / g) * pre.share, 0.35 * (t.rec / g) * pre.share + 0.8);
        ou(p, 'recYds', (t.recYds / g) * f, 0.55 * (t.recYds / g) + 8);
      }
      if (t.rushAtt / g >= 5 || t.rec / g >= 2) add(p, 'td', 1, 'yes', atLeast(rate(t.td, g, 0.25, 4) * f, 1));
    }
  } else if (family === 'hockey') {
    for (const p of live) {
      const t = p.totals;
      if (/^G$/.test(p.pos) || p.gp < 5) continue;
      const f = scale(p.side);
      const goals = rate(t.goals, p.gp, 0.15, 10) * f;
      const pointsRate = rate(t.points, p.gp, 0.4, 10) * f;
      add(p, 'goals', 1, 'yes', atLeast(goals, 1));
      add(p, 'points', 1, 'yes', atLeast(pointsRate, 1));
      add(p, 'points', 2, 'yes', atLeast(pointsRate, 2));
      add(p, 'assists', 1, 'yes', atLeast(rate(t.assists, p.gp, 0.25, 10) * f, 1));
      const shots = rate(t.shots, p.gp, 1.8, 10) * f;
      const line = Math.floor(shots) + 0.5;
      const over = atLeast(shots, Math.ceil(line), 20);
      add(p, 'shots', line, 'over', over);
      add(p, 'shots', line, 'under', 1 - over);
    }
  }
  return out;
}
