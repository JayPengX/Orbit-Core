// One game's full list of markets from Kambi (betoffer/event/<id>.json,
// through the sports proxy's `kambi-offers` trim): the real prices of the
// markets the board otherwise models (markets.mjs), and the players' markets.
//
// Every market here is one whose result the page can settle exactly as Kambi
// does: the whole game's lines (with overtime where the sport's final score
// has it), the first half's, soccer's corners, and
// the players' numbers in ESPN's box score (props.mjs). A market Kambi lists
// some other way (quarter lines, Asian quarter handicaps, "first to 20
// points") is left out.
//
// Kambi lists the match its own way round (its "home" is the first named);
// the board's sides are ESPN's. Prices come with Kambi's margin taken out
// (each market's outcomes scaled to add up to one); the board then puts the
// house's own cut on them, like every other price.
import { devigProportional } from '#kit/play-odds.mjs';
import { CUT } from '#kit/play-markets.mjs';
import { familyOf } from '#kit/play-teams.mjs';
import { sideOfGame, sideScore } from '#kit/play-house.mjs';
import { propOf } from '#kit/play-props.mjs';

export const offersUrl = (kambiBase, id, live = false) => `${kambiBase}/betoffer/event/${encodeURIComponent(id)}.json?lang=en_GB&market=GB${live ? '&live=1' : ''}`;

const price = o => (o && o.odds > 1000 && (o.status == null || o.status === 'OPEN') ? o.odds / 1000 : null);
const lineOf = o => (o?.line == null ? null : o.line / 1000);
// A margin-free chance for each outcome of one offer, or null when any is shut.
function fairOf(outcomes) {
  const odds = outcomes.map(price);
  if (odds.some(o => !o)) return null;
  return devigProportional(odds.map(o => 1 / o));
}
// One-sided player markets ("to score": a yes, no no): Kambi's usual margin
// on them taken off instead.
export const ONE_SIDED_MARGIN = 1.1;

// The labels of each family's whole-game markets, as Kambi writes them.
const FULL = {
  soccer: { total: /^Total Goals$/, spread: /^Asian Handicap$/, team: /^Total Goals by (.+)$/ },
  baseball: { total: /^Total Runs$/, spread: /^Run Line$/, team: /^Total Runs by (.+)$/ },
  football: { total: /^Total Points - Including Overtime$/, spread: /^Point Spread - Including Overtime$/, team: /^Total Points by (.+) - Including Overtime$/ },
  basketball: { total: /^Total Points - Including Overtime$/, spread: /^Point Spread - Including Overtime$/, team: /^Total Points by (.+) - Including Overtime$/ },
  // Hockey's lines on 60 minutes, as 台灣運彩 settles them (settle.mjs).
  hockey: { total: /^Total Goals - Regular Time$/, spread: /^Puck Line - Regular Time$/, team: /^Total Goals by (.+) - Regular Time$/ }
};

// The game's markets and players' markets: { markets, props } (markets in
// markets.mjs's shape: { kind, market, cut, picks, line, team, ... }).
export function parseOffers(data, game) {
  const family = familyOf(game.sport);
  const event = data?.events?.[0];
  const kHome = event?.homeName ?? '';
  const kAway = event?.awayName ?? '';
  // Kambi's first-named side is the board's away side: turn every side round.
  // (Which side a name is goes by the surer match: a city's two clubs share a word.)
  const flip = Boolean(kHome) && sideOfGame(kHome, game.home.en, game.away.en) === 'away';
  const sideOf = one => (one === flip ? 'away' : 'home'); // one: Kambi's home (OT_ONE)
  const teamOf = name => {
    const k = sideOfGame(name, kHome, kAway);
    return k ? sideOf(k === 'home') : null;
  };
  const markets = [];
  const props = [];
  const full = FULL[family] ?? {};
  const push = m => m && markets.push(m);
  for (const offer of data?.betOffers || []) {
    if (offer.suspended) continue;
    const label = String(offer.criterion?.englishLabel || '').trim();
    const type = offer.betOfferType?.englishName || '';
    const outs = offer.outcomes || [];
    const main = (offer.tags || []).includes('MAIN_LINE');
    if (/^Player Occurrence/.test(type)) {
      props.push(...playerPicks(game, family, label, type, outs));
      continue;
    }
    if (full.total?.test(label) && type === 'Over/Under') push(overUnder('total', outs, { main, family }));
    else if (full.spread?.test(label) && /Handicap/.test(type)) push(handicap('runline', outs, sideOf, family, kHome, kAway));
    else if (full.team && type === 'Over/Under' && full.team.exec(label)) {
      const team = teamOf(full.team.exec(label)[1]);
      if (team) push(overUnder('teamtotal', outs, { team, family }));
    } else if (family === 'soccer') push(soccerMarket(label, type, outs, sideOf, flip));
    else if (family === 'baseball') push(baseballMarket(label, type, outs, sideOf));
    else if (family === 'football' || family === 'basketball') push(pointsMarket(label, type, outs, sideOf));
    else if (family === 'hockey') push(hockeyMarket(label, type, outs, sideOf, flip));
  }
  return { markets: fewLines(dedupe(markets)), props };
}

// One market per id (Kambi can list a line twice).
function dedupe(markets) {
  const seen = new Set();
  return markets.filter(m => !seen.has(m.market) && seen.add(m.market));
}

// Kambi lists up to 50 lines of a football total; the board shows the
// LINES_SHOWN nearest an even price of each line market (each team's own).
export const LINES_SHOWN = 7;
const LINE_KINDS = new Set(['total', 'runline', 'teamtotal', 'gametotal', 'gamehcap', 'htotal', 'corners', 'f5total']);
function fewLines(markets) {
  const groups = new Map();
  for (const m of markets) {
    if (!LINE_KINDS.has(m.kind)) continue;
    const key = `${m.kind}|${m.team ?? ''}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(m);
  }
  const keep = new Set();
  for (const list of groups.values()) list.sort((a, b) => Math.abs(a.picks[0].fair - 0.5) - Math.abs(b.picks[0].fair - 0.5)).slice(0, LINES_SHOWN).forEach(m => keep.add(m));
  return markets.filter(m => !LINE_KINDS.has(m.kind) || keep.has(m));
}

// Over/under at one line: whole lines push (void) and are fine for points;
// goals and runs take half lines only (a whole line there is Kambi's Asian
// total, settled in halves).
function overUnder(kind, outs, { team = null, main = false, family }) {
  const over = outs.find(o => o.type === 'OT_OVER');
  const under = outs.find(o => o.type === 'OT_UNDER');
  const line = lineOf(over);
  if (line == null || lineOf(under) !== line || !halfOk(line, family)) return null;
  const fair = fairOf([over, under]);
  if (!fair) return null;
  const market = kind === 'teamtotal' ? `tt|${team}|${line}` : kind === 'gametotal' ? `gt|${line}` : kind === 'htotal' || kind === 'f5total' || kind === 'corners' ? `${kind}|${line}` : `total|${line}`;
  return { kind, market, line, team, main, posted: main, cut: CUT.twoWay, picks: [{ side: 'over', fair: fair[0] }, { side: 'under', fair: fair[1] }] };
}
// Quarter lines (-0.75: half the stake on each of two lines) never; whole
// lines only where a push is usual (points, games).
function halfOk(line, family) {
  const frac = Math.abs(line % 1);
  if (frac === 0.5) return true;
  return frac === 0 && ['football', 'basketball'].includes(family);
}

// A two-way handicap from each side's line (OT_ONE is Kambi's home; Asian
// handicaps name the side instead).
function handicap(kind, outs, sideOf, family, kHome, kAway = '') {
  if (outs.length !== 2) return null;
  const kSide = o => (o.type === 'OT_ONE' ? true : o.type === 'OT_TWO' ? false : null);
  const [a, b] = outs;
  // Asian handicap outcomes are untyped: they name their side.
  const named = o => o.participant || o.label;
  // (By the surer match; a name like neither side is the away one, as before;
  // one like both alike, Chicago's two clubs, isn't read.)
  const namedHome = () => {
    const h = sideScore(named(a), kHome);
    const w = sideScore(named(a), kAway);
    return h === w && h > 0 ? null : h > w;
  };
  const firstHome = kSide(a) ?? (named(a) && named(b) ? namedHome() : null);
  if (firstHome == null) return null;
  const home = firstHome ? a : b;
  const away = firstHome ? b : a;
  const homeSide = sideOf(true);
  const awayOut = homeSide === 'home' ? away : home;
  const awayLine = lineOf(awayOut);
  if (awayLine == null || !halfOk(awayLine, family)) return null;
  const fair = fairOf([awayOut, homeSide === 'home' ? home : away]);
  if (!fair) return null;
  const giver = awayLine < 0 ? 'away' : 'home';
  const market = kind === 'gamehcap' ? `gh|${awayLine}` : `rl|${awayLine}`;
  return { kind, market, awayLine, giver, cut: CUT.twoWay, picks: [{ side: 'away', line: awayLine, fair: fair[0] }, { side: 'home', line: -awayLine, fair: fair[1] }] };
}

// A winner market with a draw (1 X 2) as { home, draw, away }.
function threeWay(kind, market, outs, sideOf) {
  const one = outs.find(o => o.type === 'OT_ONE');
  const cross = outs.find(o => o.type === 'OT_CROSS');
  const two = outs.find(o => o.type === 'OT_TWO');
  if (!one || !two) return null;
  const list = cross ? [one, cross, two] : [one, two];
  const fair = fairOf(list);
  if (!fair) return null;
  const picks = [{ side: sideOf(true), fair: fair[0] }, ...(cross ? [{ side: 'draw', fair: fair[1] }] : []), { side: sideOf(false), fair: fair.at(-1) }];
  return { kind, market, cut: cross ? CUT.threeWay : CUT.twoWay, picks };
}

function yesNo(kind, market, outs) {
  const yes = outs.find(o => o.type === 'OT_YES');
  const no = outs.find(o => o.type === 'OT_NO');
  const fair = yes && no && fairOf([yes, no]);
  return fair ? { kind, market, cut: CUT.twoWay, picks: [{ side: 'yes', fair: fair[0] }, { side: 'no', fair: fair[1] }] } : null;
}

const RESULT = { ONE: true, CROSS: 'draw', TWO: false };
const resultSide = (token, sideOf) => (RESULT[token] === 'draw' ? 'draw' : sideOf(RESULT[token]));

// A correct score ("2-1", Kambi's home first) as the board writes it: home-away.
function correctScore(kind, outs, flip, { other = false } = {}) {
  const fair = fairOf(outs);
  if (!fair) return null;
  const picks = outs
    .map((o, i) => {
      const m = /^(\d+)-(\d+)$/.exec(String(o.label || '').trim());
      if (!m) return null;
      const score = flip ? `${m[2]}-${m[1]}` : `${m[1]}-${m[2]}`;
      return { side: score, score, fair: fair[i] };
    })
    .filter(Boolean);
  if (picks.length !== outs.length) return null;
  // The home side's wins, the draws, the away side's wins; fewest goals first.
  picks.sort((x, y) => {
    const [xh, xa] = x.score.split('-').map(Number);
    const [yh, ya] = y.score.split('-').map(Number);
    const band = (hh, aa) => (hh > aa ? 0 : hh === aa ? 1 : 2);
    return band(xh, xa) - band(yh, ya) || xh + xa - (yh + ya) || ya - xa;
  });
  return { kind, market: kind, cut: CUT.score, listed: other ? picks.map(p => p.score) : undefined, picks };
}

function soccerMarket(label, type, outs, sideOf, flip) {
  if (label === 'Both Teams To Score' && type === 'Yes/No') return yesNo('btts', 'btts', outs);
  if (label === 'Draw No Bet' && type === 'Match') {
    const m = threeWay('dnb', 'dnb', outs, sideOf);
    return m && m.picks.length === 2 ? m : null;
  }
  if (label === 'Double Chance' && type === 'Double Chance') {
    const fair = fairOf(outs);
    if (!fair) return null;
    const pairs = outs.map(o => /^OT_(ONE|CROSS|TWO)_OR_(ONE|CROSS|TWO)$/.exec(o.type));
    if (pairs.some(p => !p)) return null;
    // The board's three names: home|draw, home|away, draw|away.
    const order = ['home', 'draw', 'away'];
    const picks = pairs.map((p, i) => ({ side: [resultSide(p[1], sideOf), resultSide(p[2], sideOf)].sort((x, y) => order.indexOf(x) - order.indexOf(y)).join('|'), fair: fair[i] }));
    return { kind: 'dc', market: 'dc', cut: CUT.twoWay, picks };
  }
  if (label === 'Half Time' && type === 'Match') return threeWay('half', 'half', outs, sideOf);
  if (label === 'Total Goals - 1st Half' && type === 'Over/Under') return overUnder('htotal', outs, { family: 'soccer' });
  if (label === 'Correct Score' && type === 'Correct Score') return correctScore('score', outs, flip);
  if (label === 'Half Time/Full Time' && type === 'HT/FT') {
    const fair = fairOf(outs);
    if (!fair) return null;
    const picks = outs.map((o, i) => {
      const m = /^OT_(ONE|CROSS|TWO)_(ONE|CROSS|TWO)$/.exec(o.type);
      if (!m) return null;
      const ht = resultSide(m[1], sideOf);
      const ft = resultSide(m[2], sideOf);
      return { side: `${ht}|${ft}`, ht, ft, fair: fair[i] };
    });
    return picks.every(Boolean) ? { kind: 'htft', market: 'htft', cut: CUT.bands, picks } : null;
  }
  if (label === 'Total Corners' && type === 'Over/Under') return overUnder('corners', outs, { family: 'soccer' });
  return null;
}

function baseballMarket(label, type, outs, sideOf) {
  if (label === 'Lead After 5 Innings' && type === 'Match') return threeWay('f5', 'f5', outs, sideOf);
  if (label === 'Total Runs - First 5 Innings' && type === 'Over/Under') return overUnder('f5total', outs, { family: 'baseball' });
  // A run in the first inning: over 0.5 is yes.
  if (label === 'Total Runs - Inning 1' && type === 'Over/Under') {
    const m = overUnder('total', outs, { family: 'baseball' });
    if (!m || m.line !== 0.5) return null;
    return { kind: 'firstinning', market: 'firstinning', cut: CUT.twoWay, picks: [{ side: 'yes', fair: m.picks[0].fair }, { side: 'no', fair: m.picks[1].fair }] };
  }
  return null;
}

function pointsMarket(label, type, outs, sideOf) {
  if (label === '1st Half' && type === 'Match') return threeWay('half', 'half', outs, sideOf);
  if (label === 'Quarter 1' && type === 'Match') return threeWay('q1', 'q1', outs, sideOf);
  if (label === 'Total Points - 1st Half' && type === 'Over/Under') return overUnder('htotal', outs, { family: 'football' });
  return null;
}

function hockeyMarket(label, type, outs, sideOf, flip) {
  if (label === 'Match Odds - Regular Time' && type === 'Match') return threeWay('regulation', 'regulation', outs, sideOf);
  if (label === 'Both Teams To Score - Including Overtime and Penalty Shootout' && type === 'Yes/No') return yesNo('btts', 'btts', outs);
  return null;
}

// Players' markets: each a yes (at least n) or an over/under on a number in
// the box score (props.mjs), or the first goalscorer.
function playerPicks(game, family, label, type, outs) {
  const prop = propOf(family, label, type);
  if (!prop) return [];
  const out = [];
  if (prop.stat === 'first') {
    // Each player's chance of the first goal; "no goal" counts in the margin.
    const fair = fairOf(outs);
    if (!fair) return [];
    outs.forEach((o, i) => o.participant && out.push({ stat: 'first', line: null, side: 'yes', player: o.participant, fair: fair[i] }));
    return out;
  }
  // Every player's outcomes on this line, by player.
  const byPlayer = new Map();
  for (const o of outs) {
    if (!o.participant) continue;
    if (!byPlayer.has(o.participant)) byPlayer.set(o.participant, []);
    byPlayer.get(o.participant).push(o);
  }
  for (const [player, list] of byPlayer) {
    const yes = list.find(o => o.type === 'OT_YES');
    const no = list.find(o => o.type === 'OT_NO');
    const over = list.find(o => o.type === 'OT_OVER');
    const under = list.find(o => o.type === 'OT_UNDER');
    if (yes) {
      const line = prop.line ?? lineOf(yes) ?? 1;
      const both = no && fairOf([yes, no]);
      const fair = both ? both[0] : price(yes) ? 1 / price(yes) / ONE_SIDED_MARGIN : null;
      if (fair) out.push({ stat: prop.stat, line, side: 'yes', player, fair, sided: !both });
    } else if (over) {
      const line = lineOf(over);
      if (line == null || line % 1 === 0) continue;
      const both = under && lineOf(under) === line && fairOf([over, under]);
      if (both) {
        out.push({ stat: prop.stat, line, side: 'over', player, fair: both[0] });
        out.push({ stat: prop.stat, line, side: 'under', player, fair: both[1] });
      } else if (price(over)) {
        // An over with no under is "at least n" (over 0.5: 1+), shown and settled as such.
        out.push({ stat: prop.stat, line: Math.ceil(line), side: 'yes', player, fair: 1 / price(over) / ONE_SIDED_MARGIN, sided: true });
      }
    }
  }
  return out;
}
