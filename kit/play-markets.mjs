// More ways to play every sport, all priced at the lottery's cut. Each game's
// DraftKings lines (win, spread, total) fix a small model of its final score:
// - football and basketball: the home margin and the total are normal, with
//   each league's usual spread (NFL margins vary by about 13.5 points);
// - hockey and soccer: each team's goals follow the goals model;
// - baseball: the per-team runs model the other MLB markets use.
// From the score model come the spreads and totals either side of
// DraftKings' line, winning margin bands, first half, both teams
// to score, correct score, first inning and first five innings.
//
// Cuts: two-way markets at the lottery's measured MLB cut (1.158). Three-way,
// band and correct-score markets aren't on the checked board; they get the
// bigger cuts the lottery takes on its many-outcome markets (the top-scoring
// inning, 1.92; 第N分, 1.31), scaled by the number of outcomes. Every one of
// these is marked unchecked.
import { fitted, estimateLineOdds, round2, scoreGrid, fitTeamRuns, fitTotalRuns, GOALS_DISPERSION, TEAM_RUNS_DISPERSION } from '#kit/play-odds.mjs';

export const CUT = {
  twoWay: 1.158,
  threeWay: 1.2,
  bands: 1.35,
  score: 1.5
};

// 籃球勝分差 as 台灣運彩 sells it: each team by 1-5 … 21-25 or 26+ (12
// picks), and since 2024 a 6-pick one, 1-5, 6-10 or 11+ (GM-talk 4609).
export const BASKETBALL_BANDS = [[1, 5], [6, 10], [11, 15], [16, 20], [21, 25], [26, null]];
export const BASKETBALL_BANDS6 = [[1, 5], [6, 10], [11, null]];
// Touchdowns a point scored, NFL (about 2.4 a team on 22 points).
export const TD_PER_POINT = 0.11;

// Each league's spread of the final margin and total (points), from the usual
// size of results against the closing line. `bands`: its 勝分差 (none for
// American football: 運彩 doesn't sell one); `td`: 達陣數大小 sold.
// `basket`: the rest of 運彩's basketball list (半場讓分, 單節讓分 and
// 大小, 得分最高單節, 先得X分, 不讓分/大小); `qtotal`: 單節大小 alone (NFL).
const BASKET = { hrl: true, qspread: true, qtotal: true, top: 4, race: 20, combo: true };
export const SCORE_SPREAD = {
  nfl: { margin: 13.5, total: 10.5, bands: null, step: 3, td: TD_PER_POINT, qtotal: true },
  nba: { margin: 12.5, total: 18, bands: BASKETBALL_BANDS, bands6: BASKETBALL_BANDS6, step: 4, spreadStep: 1, ...BASKET },
  wnba: { margin: 11, total: 14, bands: BASKETBALL_BANDS, bands6: BASKETBALL_BANDS6, step: 4, spreadStep: 1, ...BASKET },
  // EuroLeague: shorter games (40 minutes), lower scoring than the NBA.
  euroleague: { margin: 11, total: 15, bands: BASKETBALL_BANDS, bands6: BASKETBALL_BANDS6, step: 4, spreadStep: 1, ...BASKET, race: 15 }
};

export function normalCdf(z) {
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const erf = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return z >= 0 ? (1 + erf) / 2 : (1 - erf) / 2;
}

export function normalQuantile(p) {
  let lo = -8;
  let hi = 8;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (normalCdf(mid) < p) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

// Odds at a cut: implied chance p x cut, but never more than halfway to certain.
export function oddsAt(p, cut) {
  return estimateLineOdds(p, cut);
}

// Many-outcome markets: proportional cut, at most the lottery's 500.
function bandOdds(p, cut) {
  return Math.min(500, Math.max(1.01, round2(1 / (p * cut))));
}

const half = x => Math.floor(x) + 0.5;

// ---- Football and basketball --------------------------------------------------

// Home margin and total as normals fitted to DraftKings' lines.
export function pointsModel(league, { homeWin, spread, total }) {
  const sd = SCORE_SPREAD[league];
  if (!sd) return null;
  let margin;
  // Spread from the away side: away covers when away + awayLine > home, i.e. margin < awayLine.
  if (spread) margin = spread.awayLine - sd.margin * normalQuantile(spread.awayFair);
  else if (homeWin != null) margin = sd.margin * normalQuantile(homeWin);
  else return null;
  const totalMean = total ? total.line + sd.total * normalQuantile(total.overFair) : null;
  return { league, margin, marginSd: sd.margin, total: totalMean, totalSd: sd.total, spec: sd };
}

// P(lo <= home margin <= hi), whole points (continuity-corrected).
function marginBetween(m, lo, hi) {
  const upper = hi == null ? 1 : normalCdf((hi + 0.5 - m.margin) / m.marginSd);
  return upper - normalCdf((lo - 0.5 - m.margin) / m.marginSd);
}

export function pointsMarkets(m, { spreadLine, totalLine }) {
  const out = [];
  const step = m.spec.step;
  // Spreads: DraftKings' line (as a half point) and 1 and 2 steps either side.
  // No line posted: the half point nearest the expected margin (away covers below it).
  const main = spreadLine != null ? (spreadLine % 1 ? spreadLine : spreadLine + 0.5) : half(m.margin);
  // Basketball's 讓分 a point apart, as 運彩's (−1.5 / −2.5 / −3.5, 2026-10-20).
  const spreadStep = m.spec.spreadStep ?? step;
  for (const d of [-2, -1, 0, 1, 2]) {
    const awayLine = round2(main + d * spreadStep);
    if (Math.abs(awayLine) < 0.5) continue;
    const awayCover = normalCdf((awayLine - m.margin) / m.marginSd);
    if (awayCover < 0.04 || awayCover > 0.96) continue;
    out.push({ kind: 'runline', market: `rl|${awayLine}`, awayLine, giver: awayLine < 0 ? 'away' : 'home', posted: d === 0, steps: Math.abs(d), cut: CUT.twoWay, picks: [
      { side: 'away', fair: awayCover, line: awayLine },
      { side: 'home', fair: 1 - awayCover, line: -awayLine }
    ] });
  }
  if (m.total != null) {
    const mainTotal = totalLine != null ? (totalLine % 1 ? totalLine : totalLine + 0.5) : half(m.total);
    // (Whole steps, so every total stays on a half point as 運彩's do: no push.)
    for (const d of [-2, -1, 0, 1, 2]) {
      const line = round2(mainTotal + d * Math.round(step * 1.5));
      const over = 1 - normalCdf((line - m.total) / m.totalSd);
      if (over < 0.04 || over > 0.96) continue;
      out.push({ kind: 'total', market: `total|${line}`, line, posted: d === 0, main: d === 0, steps: Math.abs(d), cut: CUT.twoWay, picks: [
        { side: 'over', fair: over },
        { side: 'under', fair: 1 - over }
      ] });
    }
  }
  if (m.total != null) {
    // 單隊總分: each team's points, the total split by the margin; a team's
    // spread is half the combined one.
    const teamSd = Math.sqrt(m.totalSd ** 2 + m.marginSd ** 2) / 2;
    for (const team of ['away', 'home']) {
      const mean = (m.total + (team === 'home' ? m.margin : -m.margin)) / 2;
      for (const d of [-1, 0, 1]) {
        const line = round2(half(mean) + d * step);
        const over = 1 - normalCdf((line - mean) / teamSd);
        if (over < 0.04 || over > 0.96) continue;
        out.push({ kind: 'teamtotal', market: `tt|${team}|${line}`, team, line, posted: d === 0, steps: Math.abs(d), cut: CUT.twoWay, picks: [
          { side: 'over', fair: over, team },
          { side: 'under', fair: 1 - over, team }
        ] });
      }
    }
    // 上半場大小: half the total, its spread shrunk by the square root of two.
    const hMean = m.total / 2;
    const hSd = m.totalSd / Math.SQRT2;
    for (const d of [-1, 0, 1]) {
      const line = round2(half(hMean) + d * step);
      const over = 1 - normalCdf((line - hMean) / hSd);
      if (over < 0.04 || over > 0.96) continue;
      out.push({ kind: 'htotal', market: `htotal|${line}`, line, posted: d === 0, steps: Math.abs(d), cut: CUT.twoWay, picks: [
        { side: 'over', fair: over },
        { side: 'under', fair: 1 - over }
      ] });
    }
  }
  // Winning margin (勝分差): each team by each band; basketball's 6-pick one
  // as its own market ('margin6'). Both settle as 'margin' (lo, hi).
  const marginMarket = (market, list) => {
    const bands = [];
    for (const team of ['home', 'away']) {
      for (const [lo, hi] of list) {
        const fair = team === 'home' ? marginBetween(m, lo, hi) : marginBetween({ ...m, margin: -m.margin }, lo, hi);
        bands.push({ side: `${team}|${lo}`, team, lo, hi, fair });
      }
    }
    const sum = bands.reduce((s, b) => s + b.fair, 0);
    out.push({ kind: 'margin', market, cut: CUT.bands, picks: bands.map(b => ({ ...b, fair: b.fair / sum })) });
  };
  if (m.spec.bands) marginMarket('margin', m.spec.bands);
  if (m.spec.bands6) marginMarket('margin6', m.spec.bands6);
  // First half: half the margin, a tie as likely as a whole point either way.
  const h = { margin: m.margin / 2, marginSd: m.marginSd / Math.SQRT2 };
  if (m.spec.td || m.spec.hrl) {
    // 半場讓分 (American football's, basketball's): the first half's margin around its middle.
    for (const d of [-1, 0, 1]) {
      const awayLine = round2(half(h.margin) + d * (m.spec.spreadStep ?? step));
      if (Math.abs(awayLine) < 0.5) continue;
      const awayCover = normalCdf((awayLine - h.margin) / h.marginSd);
      if (awayCover < 0.04 || awayCover > 0.96) continue;
      out.push({ kind: 'hrunline', market: `hrl|${awayLine}`, awayLine, giver: awayLine < 0 ? 'away' : 'home', posted: d === 0, steps: Math.abs(d), cut: CUT.twoWay, picks: [
        { side: 'away', fair: awayCover, line: awayLine },
        { side: 'home', fair: 1 - awayCover, line: -awayLine }
      ] });
    }
  }
  if (m.spec.td) {
    // 達陣數大小: the game's touchdowns (overtime's too), Poisson on the total.
    if (m.total != null) {
      const mean = m.total * m.spec.td;
      for (const d of [-1, 0, 1]) {
        const line = Math.floor(mean) + 0.5 + d;
        if (line < 0.5) continue;
        let under = 0;
        for (let k = 0, p = Math.exp(-mean); k <= line; k++, p *= mean / k) under += p;
        if (under < 0.04 || under > 0.96) continue;
        out.push({ kind: 'tdtotal', market: `td|${line}`, line, posted: d === 0, steps: Math.abs(d), cut: CUT.twoWay, picks: [
          { side: 'over', fair: 1 - under },
          { side: 'under', fair: under }
        ] });
      }
    }
  }
  const tie = marginBetween(h, 0, 0);
  const home = 1 - normalCdf((0.5 - h.margin) / h.marginSd);
  out.push({ kind: 'half', market: 'half', cut: CUT.threeWay, picks: [
    { side: 'away', fair: 1 - home - tie },
    { side: 'draw', fair: tie },
    { side: 'home', fair: home }
  ] });
  // 第一節 (basketball) / 第一節 of football: a quarter of the margin, half the spread.
  const q = { margin: m.margin / 4, marginSd: m.marginSd / 2 };
  const qTie = marginBetween(q, 0, 0);
  const qHome = 1 - normalCdf((0.5 - q.margin) / q.marginSd);
  out.push({ kind: 'q1', market: 'q1', cut: CUT.threeWay, picks: [
    { side: 'away', fair: 1 - qHome - qTie },
    { side: 'draw', fair: qTie },
    { side: 'home', fair: qHome }
  ] });
  out.push(...quarterMarkets(m, q));
  return out;
}

// 運彩's other points markets: 單雙 (a total's last digit, even money), 第一節
// 讓分 and 大小, 得分最高單節, 先得X分 and 不讓分/大小 (each as its spec sells).
function quarterMarkets(m, q) {
  const out = [{ kind: 'oddeven', market: 'oddeven', cut: CUT.twoWay, picks: [{ side: 'odd', fair: 0.5 }, { side: 'even', fair: 0.5 }] }];
  const spec = m.spec;
  const step = spec.spreadStep ?? spec.step;
  if (spec.qspread) {
    for (const d of [-1, 0, 1]) {
      const awayLine = round2(half(q.margin) + d * step);
      const awayCover = normalCdf((awayLine - q.margin) / q.marginSd);
      if (awayCover < 0.04 || awayCover > 0.96) continue;
      out.push({ kind: 'qrunline', market: `qrl|1|${awayLine}`, period: 1, awayLine, giver: awayLine < 0 ? 'away' : 'home', posted: d === 0, cut: CUT.twoWay, picks: [
        { side: 'away', fair: awayCover, line: awayLine },
        { side: 'home', fair: 1 - awayCover, line: -awayLine }
      ] });
    }
  }
  if (m.total == null) return out;
  // A quarter's points: a quarter of the total, half its spread.
  const qMean = m.total / 4;
  const qSd = m.totalSd / 2;
  // 半場單雙 (American football's): even money, as the game's.
  if (spec.td) out.push({ kind: 'hoddeven', market: 'hoddeven', cut: CUT.twoWay, picks: [{ side: 'odd', fair: 0.5 }, { side: 'even', fair: 0.5 }] });
  if (spec.qtotal) {
    for (const d of [-1, 0, 1]) {
      const line = round2(half(qMean) + d * step);
      const over = 1 - normalCdf((line - qMean) / qSd);
      if (over < 0.04 || over > 0.96) continue;
      out.push({ kind: 'qtotal', market: `qtot|1|${line}`, period: 1, line, posted: d === 0, cut: CUT.twoWay, picks: [
        { side: 'over', fair: over },
        { side: 'under', fair: 1 - over }
      ] });
    }
  }
  if (spec.top) {
    // 得分最高單節: four alike quarters (whole points), each the highest as
    // often; a shared highest is 平手.
    const pts = [];
    for (let k = Math.floor(qMean - 5 * qSd); k <= qMean + 5 * qSd; k++) pts.push(normalCdf((k + 0.5 - qMean) / qSd) - normalCdf((k - 0.5 - qMean) / qSd));
    let below = 0;
    let alone = 0;
    for (const p of pts) {
      alone += p * below ** (spec.top - 1);
      below += p;
    }
    out.push({ kind: 'topperiod', market: 'topperiod', cut: CUT.bands, picks: [...Array.from({ length: spec.top }, (_, i) => ({ side: String(i + 1), fair: alone })), { side: 'tie', fair: 1 - spec.top * alone }] });
  }
  if (spec.race) {
    // 先得X分: who leads when about 2X points are in (a share of the game's margin).
    const f = Math.min(1, (2 * spec.race) / m.total);
    const home = 1 - normalCdf(-(m.margin * f) / (m.marginSd * Math.sqrt(f)));
    out.push({ kind: 'raceto', market: `race|${spec.race}`, line: spec.race, cut: CUT.twoWay, picks: [{ side: 'away', fair: 1 - home }, { side: 'home', fair: home }] });
  }
  if (spec.combo) {
    // 不讓分/大小: the winner and the main total together (taken as apart).
    const line = half(m.total);
    const over = 1 - normalCdf((line - m.total) / m.totalSd);
    const home = 1 - normalCdf(-m.margin / m.marginSd);
    const picks = [];
    for (const [side, w] of [['home', home], ['away', 1 - home]]) for (const [ou, o] of [['over', over], ['under', 1 - over]]) picks.push({ side: `${side}|${ou}`, fair: w * o });
    out.push({ kind: 'mltotal', market: `mltot|${line}`, line, cut: CUT.bands, picks });
  }
  return out;
}

// ---- Goals (soccer, hockey) ------------------------------------------------------

function pmf(mean, r = GOALS_DISPERSION, kMax = 15) {
  const out = new Float64Array(kMax + 1);
  const p = r / (r + mean);
  let v = p ** r;
  for (let k = 0; k <= kMax; k++) {
    out[k] = v;
    v *= ((k + r) / (k + 1)) * (1 - p);
  }
  return out;
}

// Final scores [{ away, home, p }] from each team's mean goals.
// (Kept for the means asked: a game's markets ask for the same halves more than once.)
const grids = new Map();
export function goalGrid(means, share = 1) {
  const key = `${means.away}|${means.home}|${share}`;
  const hit = grids.get(key);
  if (hit) return hit;
  if (grids.size > 300) grids.clear();
  const grid = buildGrid(means, share);
  grids.set(key, grid);
  return grid;
}
function buildGrid(means, share) {
  const A = pmf(means.away * share);
  const H = pmf(means.home * share);
  const out = [];
  for (let a = 0; a < A.length; a++) for (let h = 0; h < H.length; h++) if (A[a] * H[h] > 1e-9) out.push({ away: a, home: h, p: A[a] * H[h] });
  return out;
}

const chance = (grid, test) => grid.reduce((s, x) => (test(x.away, x.home) ? s + x.p : s), 0);

// Hockey: each team's goals in 60 minutes (how 台灣運彩 settles every hockey
// market), fitted to the home win chance (overtime's included: a regulation
// tie goes to overtime, split by the teams' strength) and the total.
// DraftKings' total counts overtime's (or the shootout's) one deciding goal;
// Kambi's regular-time one (`regulation`) doesn't.
export function fitHockey(homeWin, total) {
  return fitted(`hockey|${homeWin}|${total?.line}|${total?.overFair}|${total?.regulation ? 1 : 0}`, () => hockeyFor(homeWin, total));
}
// Independent goals tie too rarely: about 16% of NHL games level after 60
// minutes where 22-24% really go to overtime (a trailing side's goalie
// pulled, the game played to the score). Ties lifted by this much, the rest
// scaled down, so 不讓分's 和局 is priced near the real rate.
export const HOCKEY_TIE_LIFT = 1.45;
export function hockeyGrid(means) {
  const grid = goalGrid(means);
  const tie = chance(grid, (a, h) => a === h);
  const rest = (1 - tie * HOCKEY_TIE_LIFT) / (1 - tie);
  return grid.map(x => ({ ...x, p: x.p * (x.away === x.home ? HOCKEY_TIE_LIFT : rest) }));
}
// The fits below ask for a lifted grid's chances a thousand times a game:
// summed straight off the two teams' goal counts, cell by cell in
// hockeyGrid's order (the same sums to the last bit), with no grid built.
// `line`: also the chance of a final total (a tie's deciding goal in it)
// over the line, and of it landing on the line.
function hockeySums(means, line) {
  const A = pmf(means.away);
  const H = pmf(means.home);
  let tie = 0;
  for (let a = 0; a < A.length; a++) {
    const p = A[a] * H[a];
    if (p > 1e-9) tie += p;
  }
  const rest = (1 - tie * HOCKEY_TIE_LIFT) / (1 - tie);
  let home = 0;
  let draw = 0;
  let over = 0;
  let push = 0;
  for (let a = 0; a < A.length; a++)
    for (let h = 0; h < H.length; h++) {
      const raw = A[a] * H[h];
      if (!(raw > 1e-9)) continue;
      const p = raw * (a === h ? HOCKEY_TIE_LIFT : rest);
      if (h > a) home += p;
      else if (a === h) draw += p;
      if (line != null) {
        const final = a + h + (a === h ? 1 : 0);
        if (final === line) push += p;
        else if (final > line) over += p;
      }
    }
  return { home, draw, over, push };
}
function splitFor(mean, homeWin) {
  let lo = 0.1;
  let hi = 0.9;
  for (let i = 0; i < 40; i++) {
    const s = (lo + hi) / 2;
    const g = hockeySums({ home: mean * s, away: mean * (1 - s) });
    const win = g.home + g.draw * s;
    if (win < homeWin) lo = s;
    else hi = s;
  }
  return (lo + hi) / 2;
}
function hockeyFor(homeWin, total) {
  let mean = total ? fitTotalRuns(total.line, total.overFair, GOALS_DISPERSION) : 6;
  if (total && !total.regulation) {
    // The 60-minute mean whose total, with a tie's one deciding goal, is over
    // the line as often as the book says.
    const over = m => {
      const s = splitFor(m, homeWin);
      const g = hockeySums({ home: m * s, away: m * (1 - s) }, total.line);
      return g.over / (1 - g.push || 1);
    };
    let lo = mean * 0.6;
    let hi = mean;
    for (let i = 0; i < 25; i++) {
      const mid = (lo + hi) / 2;
      if (over(mid) < total.overFair) lo = mid;
      else hi = mid;
    }
    mean = (lo + hi) / 2;
  }
  const s = splitFor(mean, homeWin);
  return { home: mean * s, away: mean * (1 - s) };
}
// Hockey's 不讓分: the 60-minute result, three ways (台灣運彩's 客勝、和局、主勝).
export function hockeyWinner(means) {
  const grid = hockeyGrid(means);
  return { away: chance(grid, (a, h) => a > h), draw: chance(grid, (a, h) => a === h), home: chance(grid, (a, h) => h > a) };
}

// Soccer's 讓分 as 台灣運彩 sells it: three ways on whole goals, never a
// half-goal two-way line. The favourite 讓1分 wins it by two or more, by
// exactly one it's 讓分和, anything else goes to the other side (主-1 / 和 /
// 客+1); 讓2分 for a big favourite. `line` is the away side's (−1: the away
// team gives one), as every handicap's is; the posted one is the most even.
export const SOCCER_HCAP_LINES = [1, 2];
export function soccerHandicaps(grid, favourite) {
  const out = [];
  for (const n of SOCCER_HCAP_LINES) {
    const awayLine = favourite === 'away' ? -n : n;
    const away = chance(grid, (a, h) => a + awayLine > h);
    const draw = chance(grid, (a, h) => a + awayLine === h);
    const picks = [{ side: 'home', fair: 1 - away - draw }, { side: 'draw', fair: draw }, { side: 'away', fair: away }];
    if (picks.some(p => p.fair < 0.04)) continue;
    out.push({ kind: 'hcap3', market: `h3|${awayLine}`, line: awayLine, awayLine, giver: favourite, cut: CUT.threeWay, picks });
  }
  const even = m => Math.max(...m.picks.map(p => p.fair));
  const main = out.reduce((best, m) => (!best || even(m) < even(best) ? m : best), null);
  for (const m of out) m.posted = m === main;
  return out;
}

// Hockey's 正確進球數: 0 to 8 goals in 60 minutes, then 9 or more.
export const GOAL_COUNTS = [...Array.from({ length: 9 }, (_, k) => [k, k]), [9, null]];

const CORRECT_SCORES = ['1-0', '2-0', '2-1', '3-0', '3-1', '3-2', '0-0', '1-1', '2-2', '3-3', '0-1', '0-2', '1-2', '0-3', '1-3', '2-3'];

export function goalMarkets(means, { family, totalLine }) {
  const out = [];
  const grid = family === 'hockey' ? hockeyGrid(means) : goalGrid(means);
  const favourite = means.away > means.home ? 'away' : 'home';
  if (family === 'hockey') {
    // The puck line: the favourite giving goals, and taking them.
    for (const line of [1.5, 2.5]) {
      for (const giver of [favourite, favourite === 'away' ? 'home' : 'away']) {
        const awayLine = giver === 'away' ? -line : line;
        const awayCover = chance(grid, (a, h) => a + awayLine > h);
        if (awayCover < 0.04 || awayCover > 0.96) continue;
        out.push({ kind: 'runline', market: `rl|${awayLine}`, awayLine, giver, posted: line === 1.5 && giver === favourite, cut: CUT.twoWay, picks: [
          { side: 'away', fair: awayCover, line: awayLine },
          { side: 'home', fair: 1 - awayCover, line: -awayLine }
        ] });
      }
    }
  } else out.push(...soccerHandicaps(grid, favourite));
  out.push(...moreGoalMarkets(means, grid, family, totalLine));
  // 單隊大小: each team's goals.
  for (const team of ['away', 'home']) {
    for (const line of family === 'hockey' ? [1.5, 2.5, 3.5] : [0.5, 1.5, 2.5]) {
      const over = chance(grid, (a, h) => (team === 'home' ? h : a) > line);
      if (over < 0.04 || over > 0.96) continue;
      out.push({ kind: 'teamtotal', market: `tt|${team}|${line}`, team, line, posted: line === (family === 'hockey' ? 2.5 : 1.5), cut: CUT.twoWay, picks: [
        { side: 'over', fair: over, team },
        { side: 'under', fair: 1 - over, team }
      ] });
    }
  }
  if (family === 'hockey') {
    // Totals (60 minutes') around the book's line.
    const main = totalLine != null ? (totalLine % 1 ? totalLine : totalLine + 0.5) : 5.5;
    for (const d of [-1, 0, 1]) {
      const line = main + d;
      const over = chance(grid, (a, h) => a + h > line);
      out.push({ kind: 'total', market: `total|${line}`, line, posted: d === 0, main: d === 0, cut: CUT.twoWay, picks: [
        { side: 'over', fair: over },
        { side: 'under', fair: 1 - over }
      ] });
    }
    // Everything on 60 minutes, as 台灣運彩 settles it: the winner (three
    // ways) is the board's 不讓分 (board.mjs). No 雙方進球 or goal bands
    // (not on 運彩's hockey list); its 正確進球數 instead, each total to 8, then 9+.
    out.push({ kind: 'goalcount', market: 'goalcount', cut: CUT.bands, picks: GOAL_COUNTS.map(([lo, hi]) => ({ side: `${lo}`, lo, hi, fair: chance(grid, (a, h) => a + h >= lo && (hi == null || a + h <= hi)) })) });
    const margins = [];
    for (const team of ['home', 'away']) {
      for (const [lo, hi] of [[1, 1], [2, 2], [3, null]]) {
        margins.push({ side: `${team}|${lo}`, team, lo, hi, fair: chance(grid, (a, h) => {
          const m = team === 'home' ? h - a : a - h;
          return m >= lo && (hi == null || m <= hi);
        }) });
      }
    }
    // 勝分差 on 60 minutes has a 和局 too (台灣運彩's hockey 勝分差).
    margins.push({ side: 'draw', team: null, lo: 0, hi: 0, fair: chance(grid, (a, h) => a === h) });
    out.push({ kind: 'margin', market: 'margin', cut: CUT.bands, picks: margins });
    return out;
  } else {
    const yes = chance(grid, (a, h) => a > 0 && h > 0);
    out.push({ kind: 'btts', market: 'btts', cut: CUT.twoWay, picks: [{ side: 'yes', fair: yes }, { side: 'no', fair: 1 - yes }] });
    // Correct score (home-away), the rest as "other".
    const listed = CORRECT_SCORES.map(score => {
      const [h, a] = score.split('-').map(Number);
      return { side: score, score, fair: chance(grid, (x, y) => y === h && x === a) };
    });
    const other = 1 - listed.reduce((s, x) => s + x.fair, 0);
    out.push({ kind: 'score', market: 'score', cut: CUT.score, listed: CORRECT_SCORES, picks: [...listed, { side: 'other', score: 'other', fair: other }] });
    // First half: 45% of the goals come before the break.
    const first = goalGrid(means, 0.45);
    out.push({ kind: 'half', market: 'half', cut: CUT.threeWay, picks: [
      { side: 'home', fair: chance(first, (a, h) => h > a) },
      { side: 'draw', fair: chance(first, (a, h) => a === h) },
      { side: 'away', fair: chance(first, (a, h) => a > h) }
    ] });
    // 上半場大小: first-half goals.
    for (const line of [0.5, 1.5, 2.5]) {
      const over = chance(first, (a, h) => a + h > line);
      if (over < 0.04 || over > 0.96) continue;
      out.push({ kind: 'htotal', market: `htotal|${line}`, line, posted: line === 1.5, cut: CUT.twoWay, picks: [
        { side: 'over', fair: over },
        { side: 'under', fair: 1 - over }
      ] });
    }
    // 雙重機會: two of the three results in one pick.
    const win = { home: chance(grid, (a, h) => h > a), draw: chance(grid, (a, h) => a === h), away: chance(grid, (a, h) => a > h) };
    out.push({ kind: 'dc', market: 'dc', cut: CUT.twoWay, picks: [
      { side: 'home|draw', fair: win.home + win.draw },
      { side: 'home|away', fair: win.home + win.away },
      { side: 'draw|away', fair: win.draw + win.away }
    ] });
    // 半全場: the half-time and full-time results together (9 outcomes), the
    // second half's goals on their own.
    const second = goalGrid(means, 0.55);
    const res = d => (d < 0 ? 'home' : d === 0 ? 'draw' : 'away');
    // Only each half's goal difference (away − home) decides it: the halves
    // summed by difference first (~30 × 30, not every score of one half
    // against every score of the other, 400 × 400 a game).
    const byDiff = grid => {
      const m = new Map();
      for (const x of grid) m.set(x.away - x.home, (m.get(x.away - x.home) ?? 0) + x.p);
      return m;
    };
    const firstDiff = byDiff(first);
    const secondDiff = byDiff(second);
    const htft = new Map();
    for (const [d1, p1] of firstDiff) for (const [d2, p2] of secondDiff) {
      const key = `${res(d1)}|${res(d1 + d2)}`;
      htft.set(key, (htft.get(key) ?? 0) + p1 * p2);
    }
    const order = ['home', 'draw', 'away'];
    out.push({ kind: 'htft', market: 'htft', cut: CUT.bands, picks: order.flatMap(ht => order.map(ft => ({ side: `${ht}|${ft}`, ht, ft, fair: htft.get(`${ht}|${ft}`) ?? 0 }))) });
    // 總進球數: total goals in bands.
    const bands = [[0, 1], [2, 3], [4, 6], [7, null]];
    out.push({ kind: 'goalbands', market: 'goalbands', cut: CUT.bands, picks: bands.map(([lo, hi]) => ({ side: `${lo}`, lo, hi, fair: chance(grid, (a, h) => a + h >= lo && (hi == null || a + h <= hi)) })) });
  }
  return out;
}

// 運彩's other goals markets, soccer's and hockey's: 單雙, 主(客)隊正確進球數,
// 不讓分/大小; soccer's 半場雙勝, 上半場正確比數, 第一球, 最後進球球隊,
// 得分較高半場 and 不讓分/兩隊是否都進球; hockey's 單節 (the first period's)
// 不讓分 and 大小 and 得分最高單節.
// (Eleven and 其他: twelve buttons, even rows of 2, 3 or 4.)
// 下一球: the goals after the first sold before the game.
export const NEXT_GOALS = [2, 3];
export const HALF_SCORES = ['1-0', '0-0', '0-1', '2-0', '1-1', '0-2', '2-1', '2-2', '1-2', '3-0', '0-3'];
function moreGoalMarkets(means, grid, family, totalLine) {
  const out = [];
  const hockey = family === 'hockey';
  const line = hockey ? (totalLine != null ? (totalLine % 1 ? totalLine : totalLine + 0.5) : 5.5) : 2.5;
  const top = hockey ? 4 : 3;
  // One pass over the scores (a board prices hundreds of games): 單雙, each
  // side's goals (capped at `top`, the last band's), the result with the total
  // and with both scoring.
  const res = (a, h) => (h > a ? 0 : a === h ? 1 : 2);
  const RES = ['home', 'draw', 'away'];
  const goals = { home: new Float64Array(top + 1), away: new Float64Array(top + 1) };
  const totals = new Float64Array(40);
  const withTotal = new Float64Array(6);
  const withBoth = new Float64Array(6);
  let odd = 0;
  let none = 0;
  for (const { away: a, home: h, p } of grid) {
    if ((a + h) % 2) odd += p;
    if (a + h === 0) none += p;
    totals[Math.min(a + h, 39)] += p;
    goals.home[Math.min(h, top)] += p;
    goals.away[Math.min(a, top)] += p;
    const r = res(a, h) * 2;
    withTotal[r + (a + h > line ? 0 : 1)] += p;
    withBoth[r + (a > 0 && h > 0 ? 0 : 1)] += p;
  }
  out.push({ kind: 'oddeven', market: 'oddeven', cut: CUT.twoWay, picks: [{ side: 'odd', fair: odd }, { side: 'even', fair: 1 - odd }] });
  for (const team of ['home', 'away'])
    out.push({ kind: 'teamgoals', market: `tg|${team}`, team, cut: CUT.bands, picks: Array.from({ length: top + 1 }, (_, lo) => ({ side: `${team}|${lo}`, team, lo, hi: lo === top ? null : lo, fair: goals[team][lo] })) });
  const combo = (kind, sides, cells) => RES.flatMap((r, i) => sides.map((x, j) => ({ side: `${r}|${x}`, fair: cells[i * 2 + j] })));
  out.push({ kind: 'mltotal', market: `mltot|${line}`, line, cut: CUT.bands, picks: combo('mltotal', ['over', 'under'], withTotal) });
  if (hockey) {
    // A period: a third of the game's goals (ties as they fall, no lift).
    const p1 = goalGrid(means, 1 / 3);
    const result = new Float64Array(3);
    const per = new Float64Array(40);
    for (const { away: a, home: h, p } of p1) {
      result[res(a, h)] += p;
      per[Math.min(a + h, 39)] += p;
    }
    out.push({ kind: 'q1', market: 'q1', cut: CUT.threeWay, picks: [{ side: 'away', fair: result[2] }, { side: 'draw', fair: result[1] }, { side: 'home', fair: result[0] }] });
    for (const l of [0.5, 1.5, 2.5]) {
      const over = per.reduce((s, p, n) => (n > l ? s + p : s), 0);
      if (over < 0.04 || over > 0.96) continue;
      out.push({ kind: 'qtotal', market: `qtot|1|${l}`, period: 1, line: l, posted: l === 1.5, cut: CUT.twoWay, picks: [{ side: 'over', fair: over }, { side: 'under', fair: 1 - over }] });
    }
    // 得分最高單節: three alike periods; a shared highest is 平手.
    let below = 0;
    let alone = 0;
    for (const p of per) {
      alone += p * below ** 2;
      below += p;
    }
    out.push({ kind: 'topperiod', market: 'topperiod', cut: CUT.bands, picks: [...['1', '2', '3'].map(side => ({ side, fair: alone })), { side: 'tie', fair: 1 - 3 * alone }] });
    return out;
  }
  out.push({ kind: 'mlbtts', market: 'mlbtts', cut: CUT.bands, picks: combo('mlbtts', ['yes', 'no'], withBoth) });
  // The halves: 45% of the goals before the break.
  const first = goalGrid(means, 0.45);
  const second = goalGrid(means, 0.55);
  const fh = new Float64Array(3);
  const firstTotals = new Float64Array(40);
  const secondTotals = new Float64Array(40);
  const halfScore = new Map();
  for (const { away: a, home: h, p } of first) {
    fh[res(a, h)] += p;
    firstTotals[Math.min(a + h, 39)] += p;
    halfScore.set(`${h}-${a}`, p);
  }
  for (const { away: a, home: h, p } of second) secondTotals[Math.min(a + h, 39)] += p;
  out.push({ kind: 'hdc', market: 'hdc', cut: CUT.twoWay, picks: [
    { side: 'home|draw', fair: fh[0] + fh[1] },
    { side: 'home|away', fair: fh[0] + fh[2] },
    { side: 'draw|away', fair: fh[1] + fh[2] }
  ] });
  const listed = HALF_SCORES.map(score => ({ side: score, score, fair: halfScore.get(score) ?? 0 }));
  out.push({ kind: 'hscore', market: 'hscore', cut: CUT.score, listed: HALF_SCORES, picks: [...listed, { side: 'other', score: 'other', fair: 1 - listed.reduce((s, x) => s + x.fair, 0) }] });
  // 第一球 and 最後進球球隊: each goal the home side's as often as its share
  // of the goals; none in a 0-0.
  const homeShare = means.home / (means.home + means.away);
  for (const kind of ['firstgoal', 'lastgoal'])
    out.push({ kind, market: kind, cut: CUT.threeWay, picks: [{ side: 'home', fair: (1 - none) * homeShare }, { side: 'none', fair: none }, { side: 'away', fair: (1 - none) * (1 - homeShare) }] });
  // 下一球: the 2nd and 3rd goals the same way; none when the game has fewer.
  for (const n of NEXT_GOALS) {
    const fewer = totals.slice(0, n).reduce((x, p) => x + p, 0);
    out.push({ kind: 'nextgoal', market: `ng|${n}`, line: n, cut: CUT.threeWay, picks: [{ side: 'home', fair: (1 - fewer) * homeShare }, { side: 'none', fair: fewer }, { side: 'away', fair: (1 - fewer) * (1 - homeShare) }] });
  }
  // 半場單雙: the first half's goals odd or even.
  const hOdd = firstTotals.reduce((x, p, n) => (n % 2 ? x + p : x), 0);
  out.push({ kind: 'hoddeven', market: 'hoddeven', cut: CUT.twoWay, picks: [{ side: 'odd', fair: hOdd }, { side: 'even', fair: 1 - hOdd }] });
  // 得分較高半場: the halves' goals (the second has more of them).
  let firstMore = 0;
  let same = 0;
  let below = 0;
  for (let n = 0; n < 40; n++) {
    firstMore += firstTotals[n] * below;
    same += firstTotals[n] * secondTotals[n];
    below += secondTotals[n];
  }
  out.push({ kind: 'higherhalf', market: 'higherhalf', cut: CUT.threeWay, picks: [{ side: 'first', fair: firstMore }, { side: 'tie', fair: same }, { side: 'second', fair: 1 - firstMore - same }] });
  return out;
}

// ---- Baseball ---------------------------------------------------------------------

function nb(mean, r, kMax = 30) {
  return pmf(mean, r, kMax);
}

// One inning's 單局大小 (0.5 and 1.5 runs) and 單局不讓分 (three ways: a
// scoreless or level inning is 和) from each side's runs in it (pmfs).
export function inningMarkets(inning, away, home) {
  const out = [];
  const runs = new Float64Array(away.length + home.length);
  let a = 0;
  let tie = 0;
  for (let x = 0; x < away.length; x++) {
    for (let y = 0; y < home.length; y++) {
      const p = away[x] * home[y];
      runs[x + y] += p;
      if (x > y) a += p;
      else if (x === y) tie += p;
    }
  }
  for (const line of [0.5, 1.5]) {
    const under = runs.reduce((s, p, n) => (n < line ? s + p : s), 0);
    if (under < 0.04 || under > 0.96) continue;
    out.push({ kind: 'inningtotal', market: `itot|${inning}|${line}`, period: inning, line, posted: line === 0.5, cut: CUT.twoWay, picks: [
      { side: 'over', fair: 1 - under },
      { side: 'under', fair: under }
    ] });
  }
  out.push({ kind: 'inningml', market: `iml|${inning}`, period: inning, cut: CUT.threeWay, picks: [
    { side: 'away', fair: a },
    { side: 'draw', fair: tie },
    { side: 'home', fair: 1 - a - tie }
  ] });
  return out;
}

// 安打數大小: MLB's hits, about 8.3 a team on 4.45 runs, more with the
// runs expected (to the 0.6th power); spread as MLB's (a team's sd about 3.2).
export const HITS = { perTeam: 8.3, runs: 4.45, power: 0.6, dispersion: 36 };
// 先得X分: the first to this many runs.
export const RACE_RUNS = 3;
export function baseballMarkets({ homeWin, total }, { hits = false, race = false } = {}) {
  if (!total) return [];
  const means = fitTeamRuns(homeWin, total.line, total.overFair);
  const { grid, size } = scoreGrid(means.home, means.away);
  const at = test => {
    let s = 0;
    for (let h = 0; h < size; h++) for (let a = 0; a < size; a++) if (test(a, h)) s += grid[h * size + a];
    return s;
  };
  const out = [];
  // Winning margin: each team by 1, 2, 3-4, 5+.
  const bands = [];
  for (const team of ['home', 'away']) {
    for (const [lo, hi] of [[1, 1], [2, 2], [3, 4], [5, null]]) {
      const fair = at((a, h) => {
        const m = team === 'home' ? h - a : a - h;
        return m >= lo && (hi == null || m <= hi);
      });
      bands.push({ side: `${team}|${lo}`, team, lo, hi, fair });
    }
  }
  out.push({ kind: 'margin', market: 'margin', cut: CUT.bands, picks: bands });
  // 單雙 at evens: the grid has no ties (extra innings), which would make an
  // odd total far likelier than MLB's near half.
  out.push({ kind: 'oddeven', market: 'oddeven', cut: CUT.twoWay, picks: [{ side: 'odd', fair: 0.5 }, { side: 'even', fair: 0.5 }] });
  if (hits) out.push(...hitsMarkets(means));
  if (race) out.push(raceMarket(means, RACE_RUNS));
  // 單局大小 and 單局不讓分 on the first inning (運彩's, in place of a
  // 首局得分 yes or no): a ninth of each team's game.
  const r = TEAM_RUNS_DISPERSION / 9;
  const a1 = nb(means.away / 9, r);
  const h1 = nb(means.home / 9, r);
  out.push(...inningMarkets(1, a1, h1));
  // First five innings: a five-inning game, ties allowed.
  const A = nb((means.away * 5) / 9, (TEAM_RUNS_DISPERSION * 5) / 9);
  const H = nb((means.home * 5) / 9, (TEAM_RUNS_DISPERSION * 5) / 9);
  let away = 0;
  let tie = 0;
  for (let a = 0; a < A.length; a++) for (let h = 0; h < H.length; h++) (a > h ? (away += A[a] * H[h]) : a === h ? (tie += A[a] * H[h]) : 0);
  // 首分: who scores first. Each half-inning a team scores with its own
  // chance (a ninth of its runs); the away team bats first.
  const sa = 1 - nb(means.away / 9, r)[0];
  const sh = 1 - nb(means.home / 9, r)[0];
  const awayFirst = sa / (1 - (1 - sa) * (1 - sh));
  out.push({ kind: 'nextrun', market: 'nextrun|1', line: 1, cut: CUT.twoWay, picks: [{ side: 'away', fair: awayFirst }, { side: 'home', fair: 1 - awayFirst }] });
  // [1-5局]讓分: the favourite giving half a run and a run and a half.
  const giver = means.away > means.home ? 'away' : 'home';
  for (const l of [0.5, 1.5]) {
    const awayLine = giver === 'away' ? -l : l;
    let awayCover = 0;
    for (let a = 0; a < A.length; a++) for (let h = 0; h < H.length; h++) if (a + awayLine > h) awayCover += A[a] * H[h];
    if (awayCover < 0.04 || awayCover > 0.96) continue;
    out.push({ kind: 'f5runline', market: `f5rl|${awayLine}`, awayLine, giver, posted: l === 0.5, cut: CUT.twoWay, picks: [
      { side: 'away', fair: awayCover, line: awayLine },
      { side: 'home', fair: 1 - awayCover, line: -awayLine }
    ] });
  }
  out.push({ kind: 'f5', market: 'f5', cut: CUT.threeWay, picks: [
    { side: 'away', fair: away },
    { side: 'draw', fair: tie },
    { side: 'home', fair: 1 - away - tie }
  ] });
  // 前五局大小: runs in the first five innings, around their middle.
  const runs5 = new Float64Array(A.length + H.length);
  for (let a = 0; a < A.length; a++) for (let h = 0; h < H.length; h++) runs5[a + h] += A[a] * H[h];
  const mean5 = ((means.away + means.home) * 5) / 9;
  for (const d of [-1, 0, 1]) {
    const line = half(mean5) + d;
    if (line < 0.5) continue;
    const over = runs5.reduce((s, p, n) => (n > line ? s + p : s), 0);
    if (over < 0.04 || over > 0.96) continue;
    out.push({ kind: 'f5total', market: `f5total|${line}`, line, posted: d === 0, steps: Math.abs(d), cut: CUT.twoWay, picks: [
      { side: 'over', fair: over },
      { side: 'under', fair: 1 - over }
    ] });
  }
  return out;
}

// 安打數大小 and 主(客)隊安打數大小 around each one's middle.
function hitsMarkets(means) {
  const out = [];
  const pmfOf = team => nb(HITS.perTeam * (means[team] / HITS.runs) ** HITS.power, HITS.dispersion, 40);
  const A = pmfOf('away');
  const H = pmfOf('home');
  const both = new Float64Array(A.length + H.length);
  for (let a = 0; a < A.length; a++) for (let h = 0; h < H.length; h++) both[a + h] += A[a] * H[h];
  const lines = (dist, kind, market, extra) => {
    const mean = dist.reduce((s, p, n) => s + p * n, 0);
    for (const d of [-1, 0, 1]) {
      const line = half(mean) + d;
      const over = dist.reduce((s, p, n) => (n > line ? s + p : s), 0);
      if (over < 0.04 || over > 0.96) continue;
      out.push({ kind, market: `${market}|${line}`, line, posted: d === 0, cut: CUT.twoWay, ...extra, picks: [{ side: 'over', fair: over, ...extra }, { side: 'under', fair: 1 - over, ...extra }] });
    }
  };
  lines(both, 'hits', 'hits', {});
  for (const team of ['away', 'home']) lines(team === 'away' ? A : H, 'teamhits', `th|${team}`, { team });
  return out;
}
// 先得X分: half-inning by half-inning (the away side first), each side's runs
// in one a ninth of its game's; neither there after nine is 無.
function raceMarket(means, x) {
  const r = TEAM_RUNS_DISPERSION / 9;
  const A = nb(means.away / 9, r, x);
  const H = nb(means.home / 9, r, x);
  let state = new Map([['0|0', 1]]);
  let away = 0;
  let home = 0;
  for (let inning = 0; inning < 9; inning++) {
    for (const bat of ['away', 'home']) {
      const next = new Map();
      const pmf = bat === 'away' ? A : H;
      for (const [key, p] of state) {
        const [a, h] = key.split('|').map(Number);
        let left = 1;
        for (let k = 0; k < pmf.length && left > 1e-12; k++) {
          const q = k === pmf.length - 1 ? left : pmf[k];
          left -= q;
          const na = bat === 'away' ? a + k : a;
          const nh = bat === 'home' ? h + k : h;
          if (na >= x) away += p * q;
          else if (nh >= x) home += p * q;
          else next.set(`${na}|${nh}`, (next.get(`${na}|${nh}`) ?? 0) + p * q);
        }
      }
      state = next;
    }
  }
  return { kind: 'raceto', market: `race|${x}`, line: x, cut: CUT.threeWay, picks: [{ side: 'away', fair: away }, { side: 'none', fair: 1 - away - home }, { side: 'home', fair: home }] };
}

// Odds for one pick of a market at its cut (`k`: the house's cut for this
// market, its base cut when not given; many-outcome markets price every
// pick at the cut, others never more than halfway to certain).
export function marketOdds(market, fair, k = market.cut) {
  return market.cut >= CUT.bands ? bandOdds(fair, k) : oddsAt(fair, k);
}
