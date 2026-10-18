// Quadra Play's rules, in the shared kit: Play and the Worker's settling (settle.mjs) use this one copy.
// The house's rules for single options, shared by the bet slip and the
// simulated crowd, so both play by exactly the same rules.
//
// The house protects itself at both ends of the price range, as bookmakers
// do (2026-10-11, the owner: "lock less, 限幾關 instead, but not too many"):
// - a near-certain pick is locked; a very short one is sold only inside a
//   parlay of 2 or 3+ games (限2關 / 限3關), so nobody can lean on it alone;
//   the bands are narrow, so few picks carry one;
// - a long price stays on sale with more margin on it (the favourite-longshot
//   shade: past LONG_FROM only part of the price is paid, as a bookmaker
//   shortens the outsiders it can price least well), and is locked only when
//   it's far out (an ordinary game market at 30, a many-outcome one at 150).
//   Locking every price from 8 locked both sides of most lopsided pairs (an
//   F1 teammate head to head showed three locks in four).
// F1 and championships are priced one by one up to 500; a runaway favourite
// is sold only in a parlay, and locked only when it's all but decided.
export const HOUSE_RULES = {
  // At or under this, locked.
  lockLow: 1.03,
  // Under these, only in a parlay of at least 3 / 2 games.
  threeLegsUnder: 1.12,
  twoLegsUnder: 1.25,
  // At or over this, locked: ordinary game markets / many-outcome markets.
  lockHigh: 30,
  lockHighExotic: 150,
  // F1 and championships: under this, locked; under the next, 限2關.
  lockLowOutright: 1.12,
  twoLegsOutright: 1.3
};
// Past this price an ordinary market's odds pay only LONG_SHARE of the rest.
export const LONG_FROM = 6;
export const LONG_SHARE = 0.85;

// Markets whose outcomes are many and long by design.
const EXOTIC = new Set(['score', 'margin', 'inning', 'nextrun', 'htft', 'goalbands', 'goalcount', 'f1podium', 'f1top', 'setscore', 'prop']);
// Priced one by one: only a runaway favourite is held back.
const OUTRIGHT = new Set(['f1', 'f1pole', 'future', 'f1team']);

// A long price with the house's extra margin on it (ordinary game markets:
// many-outcome markets and outrights are priced long by design).
export function shadeLong(kind, odds) {
  if (!(odds > LONG_FROM) || EXOTIC.has(kind) || OUTRIGHT.has(kind)) return odds;
  return Math.round((LONG_FROM + (odds - LONG_FROM) * LONG_SHARE) * 100) / 100;
}

// { lock: 'low' | 'high' | null, minLegs } for an option at `odds` (shaded already).
export function houseRule(kind, odds) {
  const r = HOUSE_RULES;
  if (!(odds > 0)) return { lock: null, minLegs: 1 };
  if (OUTRIGHT.has(kind)) return { lock: odds < r.lockLowOutright ? 'low' : null, minLegs: odds < r.twoLegsOutright ? 2 : 1 };
  if (odds <= r.lockLow) return { lock: 'low', minLegs: 1 };
  if (odds >= (EXOTIC.has(kind) ? r.lockHighExotic : r.lockHigh)) return { lock: 'high', minLegs: 1 };
  if (odds < r.threeLegsUnder) return { lock: null, minLegs: 3 };
  if (odds < r.twoLegsUnder) return { lock: null, minLegs: 2 };
  return { lock: null, minLegs: 1 };
}
// The board's option priced by the house's rules: its long price shaded, then locked or limited.
export function withRules(o) {
  const estOdds = shadeLong(o.kind, o.estOdds);
  return Object.assign(o, { estOdds }, houseRule(o.kind, estOdds));
}

// The fewest games any combination on a ticket has: every one of its
// combinations must satisfy each leg's minimum (a leg sits in combinations of
// every chosen size, so the smallest size is what counts).
export function minLegsProblem(legs, sizes) {
  const need = Math.max(1, ...legs.map(l => l.minLegs ?? 1));
  const smallest = sizes.length ? Math.min(...sizes) : 0;
  return smallest > 0 && smallest < need ? need : 0;
}

// ---- The house's cut ---------------------------------------------------------
//
// One rule for every game, every league and every price, a bookmaker's, a
// market's or the house's own (house.mjs): each kind of market takes the cut
// Taiwan Sports Lottery was measured taking on it, so Play's prices stay
// close to the lottery's.
export const BASE_CUT = {
  twoWay: 1.158, // MLB win, totals, run lines, team totals: 81 markets, 2026-09-25
  threeWay: 1.2,
  bands: 1.35,
  score: 1.5,
  topInning: 1.92, // the lottery's own table
  nextRun: 1.31, // 第N分, live
  live: 1.16, // 場中 win, total, run line
  // An F1 race's drivers (and its pole): about a bookmaker's own winner board (Kambi's Singapore GP 2026 adds up to ~1.23).
  outright: 1.2
};

// Leagues by how well known they are (what home leads with; not the cut).
const MAJOR = new Set(['mlb', 'nba', 'nfl', 'nhl', 'epl', 'laliga', 'seriea', 'bundesliga', 'ligue1', 'ucl', 'f1']);
const THIN = new Set(['npb', 'kbo', 'cpbl', 'euroleague']);
export function leagueTier(sport) {
  return MAJOR.has(sport) ? 'major' : THIN.has(sport) ? 'thin' : 'minor';
}

// The cut by how well a league is known (2026-10-11): one rule for every
// sport, the house taking a little more where it knows less and its prices
// can lag (Asia's baseball, the minor leagues: fewer books, thinner
// markets), so each league's risk is paid for.
export const TIER_CUT = { major: 1, minor: 1.02, thin: 1.03 };
// The overround for one market: `base` a BASE_CUT key or an overround, `sport` its league's tier.
export function houseCut({ base = 'twoWay', sport = null } = {}) {
  const k = typeof base === 'number' ? base : BASE_CUT[base];
  return sport ? k * TIER_CUT[leagueTier(sport)] : k;
}
