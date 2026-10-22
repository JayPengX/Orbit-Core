// Every priced option of a game, the one place a board is built. The page
// adds names to these for you, and the Worker's board (builders/play.js)
// builds the same options. One pricing path, so a bet is priced the same
// wherever it is made.
//
// An option: { id, gameId, sport, kind, side, market, fairChance, fairMargin,
// errKey, cut, estOdds, posted, lock, minLegs, ... } plus the fields its kind
// needs to be named and settled (totalLine, runLine, awayLine, giver, team,
// teamLine, inning, line, settle) and, for side markets, the market and pick
// it came from (`m`, `pick`).
import {
  blendOutcomes,
  estimateLotteryOdds,
  estimateLineOdds,
  lotteryTotalLines,
  lotteryRunLines,
  lotteryTeamTotal,
  fitTeamRuns,
  fitTotalRuns,
  totalOverChance,
  teamOverChance,
  runLineCover,
  scoreGrid,
  lineInRange,
  MLB_TOTAL_DISPERSION,
  GOALS_DISPERSION,
  TOP_INNING_ODDS
} from '#kit/play-odds.mjs';
import { pointsModel, pointsMarkets, goalMarkets, fitHockey, hockeyWinner, baseballMarkets, marketOdds } from '#kit/play-markets.mjs';
import { fitGoals } from '#kit/play-live.mjs';
import { houseCut, houseRule, withRules } from '#kit/play-rules.mjs';
import { withModelLines } from '#kit/play-lines.mjs';
import { LEAGUES, familyOf, isSoccer } from '#kit/play-teams.mjs';

// Lines besides the lottery's own: totals this many either side of the main
// line, team totals this many, run lines up to 4.5 runs either way.
const TOTAL_SPAN = 3;
const TEAM_TOTAL_SPAN = 2;
const RUN_LINES = [1.5, 2.5, 3.5, 4.5];

// Lottery-checked error sizes exist for MLB and the Premier League; every
// other league uses its kind of sport's (unchecked) one.
export function errKeyOf(sport) {
  return ['mlb', 'epl'].includes(sport) ? sport : familyOf(sport);
}

// Each game's run and goal models, built once (the fits themselves are kept
// on the device: play-odds.mjs fitted).
const modelCache = new Map();
function gameModel(game, homeWin) {
  const key = `${game.id}|${game.total?.line}|${game.total?.overFair}|${homeWin}`;
  if (modelCache.has(key)) return modelCache.get(key);
  const model = {};
  const baseball = familyOf(game.sport) === 'baseball';
  if (game.total) model.mu = fitTotalRuns(game.total.line, game.total.overFair, baseball ? MLB_TOTAL_DISPERSION : GOALS_DISPERSION);
  // Each team's runs from the win chance (DraftKings', or the blended one
  // when it has none) and the total.
  if (baseball && game.total && homeWin != null) {
    model.means = fitTeamRuns(homeWin, game.total.line, game.total.overFair);
    model.grid = scoreGrid(model.means.home, model.means.away);
  }
  if (modelCache.size > 2000) modelCache.clear();
  modelCache.set(key, model);
  return model;
}

// Totals, run lines and team totals of baseball and soccer: the lottery's own
// lines (MLB's checked against its prices) and the wider range.
function lineOptions(game, base, probs) {
  const out = [];
  const homeWin = game.draftKings?.home ?? probs.home / (probs.home + probs.away);
  const model = gameModel(game, homeWin);
  const total = game.total;
  // A total from our own model (lines.mjs), not a bookmaker's: never "the
  // lottery's line", and a little more room for error.
  const modeled = Boolean(total?.modeled);
  const mlb = game.sport === 'mlb';
  const baseball = familyOf(game.sport) === 'baseball';
  const cut = k => houseCut({ base: k, sport: game.sport });

  // 大小分. MLB: the lottery's three lines, from one line; elsewhere the
  // bookmaker's own half line; then the wider range from the model.
  const totals = new Map();
  if (total && mlb && !modeled) for (const l of lotteryTotalLines(total.line, total.overFair)) totals.set(l.line, { ...l, posted: true });
  else if (total && total.line % 1 !== 0) totals.set(total.line, { line: total.line, over: total.overFair, main: true, posted: !modeled });
  if (model.mu != null) {
    const r = baseball ? MLB_TOTAL_DISPERSION : GOALS_DISPERSION;
    const main = [...totals.values()].find(l => l.main)?.line ?? Math.floor(model.mu) + 0.5;
    for (let d = -TOTAL_SPAN; d <= TOTAL_SPAN; d++) {
      const line = main + d;
      if (line <= 0 || totals.has(line)) continue;
      const over = totalOverChance(line, model.mu, r);
      if (lineInRange(over) && lineInRange(1 - over)) totals.set(line, { line, over, main: false, posted: false });
    }
  }
  for (const { line, over, main, posted } of [...totals.values()].sort((a, b) => a.line - b.line)) {
    const k = cut('twoWay');
    for (const side of ['over', 'under']) {
      const p = side === 'over' ? over : 1 - over;
      out.push({
        ...base,
        id: `${game.id}|tot|${line}|${side}`,
        kind: 'total',
        side,
        totalLine: line,
        mainLine: main,
        posted,
        market: `total|${line}`,
        // The main line's margin is the usual source gap; lines either side add the model's error.
        fairMargin: modeled ? 0.04 : main ? null : posted ? 0.02 : 0.03,
        errKey: modeled ? 'extra' : !mlb ? errKeyOf(game.sport) : posted ? 'mlbTotal' : 'mlbTotalExtra',
        fairChance: p,
        cut: k,
        estOdds: estimateLineOdds(p, k)
      });
    }
  }

  // 讓分: MLB's two posted lines priced from the lottery's own (shrunk)
  // chance; other leagues the bookmaker's line; the rest from the score model.
  if (baseball && (game.spread || model.grid)) {
    const lines = new Map();
    if (game.spread && mlb) {
      for (const [i, l] of lotteryRunLines(game.spread.awayLine, game.spread.awayFair).entries()) lines.set(l.awayLine, { ...l, posted: true, first: i === 0 });
    } else if (game.spread && game.spread.awayLine % 1 !== 0) {
      lines.set(game.spread.awayLine, { awayLine: game.spread.awayLine, fair: game.spread.awayFair, lottery: game.spread.awayFair, posted: true, first: true });
    }
    if (model.grid) {
      for (const abs of RUN_LINES) {
        for (const awayLine of [-abs, abs]) {
          if (lines.has(awayLine)) continue;
          const fair = runLineCover(model.grid, awayLine);
          if (lineInRange(fair) && lineInRange(1 - fair)) lines.set(awayLine, { awayLine, fair, lottery: fair, posted: false });
        }
      }
    }
    const order = [...lines.values()].sort((a, b) => Math.abs(a.awayLine) - Math.abs(b.awayLine) || a.awayLine - b.awayLine);
    for (const { awayLine, fair, lottery, posted, first } of order) {
      const giver = awayLine < 0 ? 'away' : 'home';
      const k = cut('twoWay');
      for (const side of ['away', 'home']) {
        const p = side === 'away' ? fair : 1 - fair;
        const priced = side === 'away' ? lottery : 1 - lottery;
        out.push({
          ...base,
          id: `${game.id}|rl|${side === 'away' ? awayLine : -awayLine}|${side}`,
          kind: 'runline',
          side,
          runLine: side === 'away' ? awayLine : -awayLine,
          awayLine,
          giver,
          posted,
          market: `rl|${awayLine}`,
          fairMargin: first ? 0.02 : 0.03,
          errKey: !mlb ? errKeyOf(game.sport) : posted ? 'mlbRunLine' : 'mlbRunLineExtra',
          fairChance: p,
          cut: k,
          estOdds: estimateLineOdds(priced, k)
        });
      }
    }
  }

  // 單隊大小: each team's runs; the lottery's line is the one closest to 50/50.
  if (model.means) {
    for (const team of ['away', 'home']) {
      const posted = lotteryTeamTotal(model.means[team]).line;
      for (let d = -TEAM_TOTAL_SPAN; d <= TEAM_TOTAL_SPAN; d++) {
        const line = posted + d;
        if (line <= 0) continue;
        const over = teamOverChance(model.means[team], line);
        if (!(lineInRange(over) && lineInRange(1 - over))) continue;
        const k = cut('twoWay');
        for (const side of ['over', 'under']) {
          const p = side === 'over' ? over : 1 - over;
          out.push({
            ...base,
            id: `${game.id}|tt|${team}|${line}|${side}`,
            kind: 'teamtotal',
            side,
            team,
            teamLine: line,
            posted: line === posted,
            market: `tt|${team}|${line}`,
            fairMargin: line === posted ? 0.03 : 0.04,
            errKey: !mlb ? errKeyOf(game.sport) : line === posted ? 'mlbTeamTotal' : 'mlbTeamTotalExtra',
            fairChance: p,
            cut: k,
            estOdds: estimateLineOdds(p, k)
          });
        }
      }
    }
  }
  return out;
}

// ---- The model's fallbacks ----------------------------------------------------------
//
// Markets Kambi has and the model otherwise wouldn't: soccer's corners.
// Kambi's own (offers.mjs) take their place once read. (No draw no bet:
// 運彩 doesn't sell it; a pick bought before still settles, settle.mjs.)
export const CORNERS_MEAN = 10.2;
const CORNERS_DISPERSION = 12;
function fallbackOptions(game, base, probs) {
  const family = familyOf(game.sport);
  const markets = [];
  const twoWay = houseCut({ base: 'twoWay', sport: game.sport });
  if (family === 'soccer' && probs.draw != null) {
    // Corners settle from ESPN's team stats.
    if (LEAGUES[game.sport]?.path && !game.scoreOnly) {
      for (const line of [8.5, 9.5, 10.5, 11.5]) {
        const over = atLeast(CORNERS_MEAN, Math.ceil(line), CORNERS_DISPERSION);
        markets.push({ kind: 'corners', market: `corners|${line}`, line, main: line === 9.5, cut: twoWay, picks: [{ side: 'over', fair: over }, { side: 'under', fair: 1 - over }] });
      }
    }
  }
  return marketOptions(game, base, markets);
}

// A game's own Kambi markets alone (a live game's: the page
// prices its winner and main lines itself), with the house's rules on each.
export function offerOptions(game, offers, extra = {}) {
  const base = { gameId: game.id, game, sport: game.sport, start: game.startUtc, ...extra };
  // No players' markets: 台灣運彩 sells none (its 玩法 list, 2026).
  const out = marketOptions(game, base, offers.markets || [], { real: true });
  for (const o of out) withRules(o);
  return out;
}

// Every side market of a game (markets.mjs).
function sideOptions(game, base, probs) {
  const family = familyOf(game.sport);
  const homeWin = probs.home / (probs.home + probs.away);
  let markets = [];
  // 安打數大小 settles from ESPN's MLB box (hits), 先得X分 from its scoring plays.
  if (family === 'baseball') markets = baseballMarkets({ homeWin, total: game.total }, { hits: game.sport === 'mlb', race: Boolean(LEAGUES[game.sport]?.path) });
  else if (family === 'football' || family === 'basketball') {
    const model = pointsModel(game.sport, { homeWin, spread: game.spread, total: game.total });
    if (model) markets = pointsMarkets(model, { spreadLine: game.spread?.awayLine ?? null, totalLine: game.total?.line ?? null });
  } else if (family === 'hockey') markets = goalMarkets(fitHockey(homeWin, game.total), { family, totalLine: game.total?.line ?? null });
  else if (family === 'soccer' && probs.draw != null) {
    // Totals come from lineOptions; the rest from each team's mean goals.
    markets = goalMarkets(fitGoals(probs.home, probs.away), { family }).filter(m => m.kind !== 'total');
  }
  return marketOptions(game, base, markets);
}

// Options from markets in markets.mjs's shape (the models', or Kambi's own:
// offers.mjs). A line market of baseball and soccer keeps lineOptions' ids,
// so a pick on the slip stays the same pick whichever
// priced it.
function optionId(game, m, pick) {
  const family = familyOf(game.sport);
  if (family === 'baseball' || family === 'soccer') {
    if (m.kind === 'total') return `${game.id}|tot|${m.line}|${pick.side}`;
    if (m.kind === 'runline') return `${game.id}|rl|${pick.line}|${pick.side}`;
    if (m.kind === 'teamtotal') return `${game.id}|tt|${m.team}|${m.line}|${pick.side}`;
  }
  return `${game.id}|${m.kind}|${m.market}|${pick.side}`;
}
// Handicaps besides the game's own run line (半場讓分, [1-5局]讓分, 讓盤, 讓局): `line` is the pick's.
export const HCAP_KINDS = new Set(['hrunline', 'qrunline', 'f5runline', 'sethcap', 'gamehcap']);
function marketOptions(game, base, markets, { real = false } = {}) {
  const out = [];
  for (const m of markets) {
    const k = houseCut({ base: m.cut, sport: game.sport });
    for (const pick of m.picks) {
      const o = {
        ...base,
        id: optionId(game, m, pick),
        kind: m.kind,
        side: pick.side,
        market: m.market,
        posted: m.posted ?? false,
        fairChance: pick.fair,
        fairMargin: null,
        errKey: 'extra',
        cut: k,
        estOdds: marketOdds(m, pick.fair, k),
        ...(real ? { real: true } : {}),
        m,
        pick,
        // A handicap's line is each pick's own (its side's), a total's the market's.
        settle: { lo: pick.lo, hi: pick.hi, score: pick.score, listed: m.listed, team: pick.team, ht: pick.ht, ft: pick.ft, ...(m.period != null ? { period: m.period } : {}), ...(pick.line != null ? { line: pick.line } : m.line != null && m.kind !== 'total' ? { line: m.line } : {}) }
      };
      if (m.kind === 'runline') Object.assign(o, { runLine: pick.line, awayLine: m.awayLine, giver: m.giver });
      else if (HCAP_KINDS.has(m.kind)) Object.assign(o, { line: pick.line, awayLine: m.awayLine, giver: m.giver });
      else if (m.kind === 'hcap3') Object.assign(o, { awayLine: m.awayLine, giver: m.giver });
      if (m.kind === 'teamtotal' || m.kind === 'teamhits') Object.assign(o, { team: m.team, teamLine: m.line });
      if (m.kind === 'htotal' || m.kind === 'f5total' || m.kind === 'corners' || m.kind === 'tdtotal' || m.kind === 'inningtotal' || m.kind === 'qtotal' || m.kind === 'hits') Object.assign(o, { line: m.line });
      if (m.period != null) o.period = m.period;
      if (m.kind === 'total') Object.assign(o, { totalLine: m.line, mainLine: m.main });
      out.push(o);
    }
  }
  return out;
}

// Every option of one game, priced, with the house's rules on each.
export function gameOptions(game) {
  const blend = blendOutcomes(game.draftKings, game.polymarket, game.house, game.kambi);
  if (!blend) return [];
  // No total posted (a game only Polymarket or Kambi prices the winner of):
  // our own, so it gets every market all the same.
  game = withModelLines(game, blend.probs);
  const base = { gameId: game.id, game, sport: game.sport, start: game.startUtc };
  // Hockey's 不讓分 is its 60 minutes' result, three ways, as 台灣運彩 sells
  // it: from the model fitted to the books' winner (overtime's included).
  const hockey = familyOf(game.sport) === 'hockey';
  const threeWay = isSoccer(game.sport) || hockey;
  const chances = hockey ? hockeyWinner(fitHockey(blend.probs.home / (blend.probs.home + blend.probs.away), game.total)) : blend.probs;
  const sides = threeWay ? ['home', 'draw', 'away'] : ['away', 'home'];
  // The winner at the lottery's cut (rules.mjs houseCut), the same for every
  // source; two books' gap is the price's margin of error.
  const [first, second] = [game.kambi, game.draftKings, game.polymarket].filter(Boolean);
  const both = first && second && Object.keys(first).every(k => k in second);
  // Soccer's 不讓分 has three outcomes: the lottery's three-way cut (its 1X2
  // odds add up to about 120%), not the two-way one.
  const mlCut = houseCut({ base: threeWay ? 'threeWay' : blend.k, sport: game.sport });
  const out = sides.map(side => ({
    ...base,
    id: `${game.id}|ml|${side}`,
    kind: 'ml',
    side,
    market: 'ml',
    // Never below half of Polymarket's 1-cent price step.
    fairMargin: both && !hockey ? Math.max(0.005, Math.abs(first[side] - second[side]) / 2) : null,
    errKey: errKeyOf(game.sport),
    fairChance: chances[side],
    cut: mlCut,
    estOdds: estimateLotteryOdds(chances[side], mlCut),
    ...(hockey ? { settle: { threeWay: true } } : {})
  }));
  const family = familyOf(game.sport);
  if (family === 'baseball' || family === 'soccer') out.push(...lineOptions(game, base, blend.probs));
  out.push(...sideOptions(game, base, blend.probs));
  out.push(...fallbackOptions(game, base, blend.probs));
  // 得分最高單局: the lottery's own (nearly fixed) table, its cut removed;
  // every baseball league (the table barely moves from game to game).
  if (family === 'baseball') {
    const book = TOP_INNING_ODDS.reduce((sum, o) => sum + 1 / o, 0);
    TOP_INNING_ODDS.forEach((odds, i) => out.push({ ...base, id: `${game.id}|inning|${i}`, kind: 'inning', market: 'inning', inning: i, fairMargin: null, errKey: 'topInning', fairChance: 1 / odds / book, estOdds: odds }));
  }
  // Kambi's own markets of the game, once its page has them (offers.mjs):
  // each kind Kambi prices takes the place of the model's.
  if (game.offers?.markets?.length) {
    // Corners settle from ESPN's team stats: not for a league ESPN doesn't carry.
    const markets = LEAGUES[game.sport]?.path ? game.offers.markets : game.offers.markets.filter(m => m.kind !== 'corners');
    const real = marketOptions(game, base, markets, { real: true });
    const kinds = new Set(real.map(o => o.kind));
    for (let i = out.length - 1; i >= 0; i--) if (out[i].kind !== 'ml' && kinds.has(out[i].kind)) out.splice(i, 1);
    out.push(...real);
  }
  // No players' markets (offerOptions): 台灣運彩 sells none.
  for (const o of out) withRules(o);
  // The books far apart on the game: locked until they agree (blendOutcomes).
  if (blend.disputed) for (const o of out) o.lock = 'check';
  // Priced by the house alone (no bookmaker yet: weeks out, preseason, a
  // cup's minnow): every market all the same, on a smaller ticket (SLIP_RULES.capped).
  if (blend.source === 'house') for (const o of out) o.cap = 'house';
  // A game settled from its final score alone (schedules.mjs): nothing on a part of it.
  return game.scoreOnly ? out.filter(o => !PART_KINDS.has(o.kind)) : out;
}
const PART_KINDS = new Set(['htft', 'htotal', 'hrunline', 'f5', 'f5total', 'f5runline', 'q1', 'half', 'regulation', 'firstinning', 'inningtotal', 'inningml', 'inning', 'nextrun', 'tdtotal', 'qrunline', 'qtotal', 'topperiod', 'raceto', 'hdc', 'hscore', 'firstgoal', 'lastgoal', 'nextgoal', 'hoddeven', 'higherhalf', 'hits', 'teamhits']);

// ---- F1: 前三名 (podium) --------------------------------------------------------

// Each driver's chance of a top-three finish from the win chances (Harville:
// second place goes as the win chances of the rest, and so on), priced to
// return what the race's winner board does on average (the lottery takes
// the same on both), at most the lottery's 500.
export function f1Podium(drivers) {
  // The chances as one field (the merged boards can add up past 1).
  const total = drivers.reduce((s, d) => s + Math.max(0, d.fair), 0) || 1;
  const p = drivers.map(d => Math.max(0, d.fair) / total);
  const n = p.length;
  const podium = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    podium[i] += p[i];
    for (let j = 0; j < n; j++) {
      if (j === i) continue;
      const second = (p[j] * p[i]) / (1 - p[j]);
      podium[i] += second;
      for (let k = 0; k < n; k++) {
        if (k === i || k === j) continue;
        podium[i] += (p[j] * p[k] * p[i]) / ((1 - p[j]) * (1 - p[j] - p[k]));
      }
    }
  }
  // The winner board's return, weighted as people pick (by chance).
  const sum = p.reduce((a, b) => a + b, 0) || 1;
  const back = drivers.reduce((s, d) => s + (d.fair / sum) * d.fair * d.odds, 0);
  return drivers.map((d, i) => {
    const fair = Math.min(0.995, podium[i]);
    const odds = Math.min(500, Math.max(1.01, Math.round((back / fair) * 100) / 100));
    return { fair, odds, ...houseRule('f1podium', odds) };
  });
}

// ---- Counts: P(X >= k), negative binomial (the corners line) ----

function logFact(n) {
  let s = 0;
  for (let i = 2; i <= n; i++) s += Math.log(i);
  return s;
}
// P(X >= k) for a negative binomial with mean m (r: dispersion; huge: Poisson).
function atLeast(m, k, r = 1e6) {
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
