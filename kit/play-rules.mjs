import { familyOf } from '#kit/play-teams.mjs';
import { twDay } from '#kit/format.mjs';
// Quadra Play's rules, in the shared kit: Play and the Worker's settling (settle.mjs) use this one copy.
// The house's rules for single options, shared by the bet slip and the
// Worker's settling, so both play by exactly the same rules.
//
// 限2關 / 限3關 is 運彩's, set per game or per market (投注規範 §21), never by
// price: a pick carries one only when its game's or market's own minimum is
// known (eventMinLegs); with none known it sells as a single. The house
// still guards the long end, as bookmakers do:
// - a long price stays on sale with more margin on it (the favourite-longshot
//   shade: past LONG_FROM only part of the price is paid, as a bookmaker
//   shortens the outsiders it can price least well), and is locked only when
//   it's far out (an ordinary game market at 30, a many-outcome one at 150).
//   Locking every price from 8 locked both sides of most lopsided pairs (an
//   F1 teammate head to head showed three locks in four).
// F1 and championships are priced one by one up to 500, and locked only
// when it's all but decided.
export const HOUSE_RULES = {
  // At or over this, locked: ordinary game markets / many-outcome markets.
  lockHigh: 30,
  lockHighExotic: 150,
  // F1 and championships: under this, locked.
  lockLowOutright: 1.12,
  // A win must never pay back less than the bet once the 20% tax takes the
  // whole payout (play-odds.mjs afterTax; Jay, 2026-10-20: "design it so
  // those bets couldn't even be placed"). Under 1.25 (= 1 / 0.8) a pick is
  // 限2關, as 運彩 sells its short favourites (a 1.16 was 限2關 on its
  // board); under 1.12 it's locked, so any two picks make at least
  // 1.12 × 1.12 = 1.2544.
  shortTwo: 1.25,
  lockLow: 1.12
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

// { lock: 'low' | 'high' | null, minLegs } for an option at `odds` (shaded
// already); `event`: its game's or market's own 限關 (投注規範 §21), else 1.
export function houseRule(kind, odds, { event = null } = {}) {
  const own = event > 0 ? Math.max(1, Math.round(event)) : 1;
  const minLegs = odds > 0 && odds < HOUSE_RULES.shortTwo ? Math.max(2, own) : own;
  return { lock: priceLock(kind, odds), minLegs };
}
function priceLock(kind, odds) {
  const r = HOUSE_RULES;
  if (!(odds > 0)) return null;
  if (odds < Math.max(r.lockLow, OUTRIGHT.has(kind) ? r.lockLowOutright : 0)) return 'low';
  if (OUTRIGHT.has(kind)) return null;
  return odds >= (EXOTIC.has(kind) ? r.lockHighExotic : r.lockHigh) ? 'high' : null;
}
// The board's option priced by the house's rules: its long price shaded, then
// locked or limited (by its market's or game's own 限關 when known: eventMinLegs).
export const eventMinLegs = o => o.eventMinLegs ?? o.m?.minLegs ?? o.game?.minLegs ?? null;
export function withRules(o) {
  const estOdds = shadeLong(o.kind, o.estOdds);
  const event = eventMinLegs(o);
  const guess = event > 0 ? null : estimatedMinLegs(o);
  return Object.assign(o, { estOdds }, houseRule(o.kind, estOdds, { event: event ?? guess }), guess ? { minLegsEst: true } : {});
}
// 運彩's usual 限關 where a game's own isn't known: an estimate (2026-10-20,
// the owner chose it), read off 運彩's own boards that morning. Every market
// of a game carries the game's number; games on today (Taipei) were 1 (MLB's
// ALCS game, NHL's this morning), games on a later day 2 (NBA, NHL, EuroCup,
// the Championship and J-League tomorrow, nearly all), championships 1. So a
// game is 限2關 until its day comes, then a single; championships, F1 and
// games in play are singles. null: no minimum.
export function estimatedMinLegs(o, now = Date.now()) {
  if (OUTRIGHT.has(o?.kind) || /^live\|/.test(String(o?.id || '')) || o?.live) return null;
  const start = Date.parse(o?.start ?? o?.game?.startUtc ?? '');
  return Number.isFinite(start) && twDay(start) > twDay(now) ? 2 : null;
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
// A two-way market by sport (運彩's own boards, 2026-10-20): basketball's
// and soccer's 讓分, 大小 and 兩隊都進球 add up to about 1.17 (NBA 1.70/1.73,
// 1.68/1.75; soccer 1.58/1.86, 1.65/1.78), baseball's 1.15 (MLB 2.23/1.43).
export const TWO_WAY_BY_FAMILY = { basketball: 1.168, soccer: 1.17 };
export function houseCut({ base = 'twoWay', sport = null } = {}) {
  let k = typeof base === 'number' ? base : BASE_CUT[base];
  if (sport && k === BASE_CUT.twoWay) k = TWO_WAY_BY_FAMILY[familyOf(sport)] ?? k;
  return sport ? k * TIER_CUT[leagueTier(sport)] : k;
}
