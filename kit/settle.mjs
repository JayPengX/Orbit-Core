// Settling Quadra Play's slips: one copy for Play (its account.mjs and
// sources.mjs re-export these) and the Worker that settles slips when their
// games end (settle.js). Pure: a pick's result from its game's outcome, and
// a slip paid once every pick is decided (the ledger's fixed ids,
// 'payout-<slip>', so the phone and the Worker can never pay it twice).
import { CATALOG, familyOfSport, asiaMonth, asiaMonthOf } from '#kit/catalog.mjs';
import { f1Driver, normalizeTeamName } from '#kit/logos.mjs';
import { f1Outcome } from '#kit/f1live.mjs';
import { settleSlip } from '#kit/play-odds.mjs';
import { propResult, propOutcome } from '#kit/play-props.mjs';

// Every league Play sells, from the shared catalogue: its kind of markets
// (family) and where its games and odds come from: an ESPN `path` (its
// schedule and results) with Kambi's list as its first price (`book`), or a
// `kambi` list alone (its schedule and prices). (Play's teams.mjs LEAGUES.)
export const LEAGUES = Object.fromEntries(
  Object.values(CATALOG)
    .filter(l => l.bet && l.odds)
    .map(l => {
      const league = { family: familyOfSport(l.sport) };
      if (l.odds === 'espn') {
        league.path = l.espn;
        if (l.kambi) league.book = l.kambi;
      } else {
        league.kambi = l.kambi;
        // Its own schedule besides Kambi's list (schedules.mjs): the league's
        // month lists (Asian baseball).
        if (l.data === 'asia') league.schedule = { asia: l.asia };
      }
      for (const k of ['logo', 'icon', 'badge', 'top']) if (l[k] !== undefined) league[k] = l[k];
      return [l.bet, league];
    })
);
export function familyOf(sport) {
  return sport === 'f1' ? 'racing' : LEAGUES[sport]?.family ?? null;
}
export const isSoccer = sport => familyOf(sport) === 'soccer';

function touched(account, now) {
  return { ...account, updated: now.toISOString() };
}

const norm = name =>
  String(name || '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

// Top-scoring inning: 0-8 for innings 1-9, 9 for a tie for the most. Extra
// innings don't count; an inning a team didn't bat counts as 0.
// Runs, goals or points in a side's first `n` periods (innings, halves,
// quarters): a period missing or unread counts as 0.
const firstPeriods = (list, n) => list.slice(0, n).reduce((s, x) => s + (Number(x) || 0), 0);
// A soccer half is one period; elsewhere a first half is two quarters.
const halfPeriods = sport => (sport && isSoccer(sport) ? 1 : 2);

export function topInning(awayInnings, homeInnings) {
  const runs = Array.from({ length: 9 }, (_, i) => (Number(awayInnings[i]) || 0) + (Number(homeInnings[i]) || 0));
  const most = Math.max(...runs);
  const at = runs.flatMap((r, i) => (r === most ? [i] : []));
  return at.length === 1 ? at[0] : 9;
}

// 'won', 'lost' or 'void' for one leg from its game's (or race's, or
// championship's) outcome; null while it isn't decided.
// outcome: { status: 'final' | 'void' | 'pending', awayScore, homeScore,
// awayInnings, homeInnings } for a game, { status, winner } otherwise.
export function legResult(leg, outcome) {
  if (!outcome || outcome.status === 'pending') return null;
  if (outcome.status === 'void') return (outcome.sofar && decidedSoFar(leg, outcome.sofar)) || 'void';
  const win = test => (test ? 'won' : 'lost');
  if (leg.kind === 'f1') return win(norm(outcome.winner) === norm(leg.driver));
  if (leg.kind === 'f1pole') return outcome.pole ? win(norm(outcome.pole) === norm(leg.driver)) : null;
  if (leg.kind === 'future') return win(norm(outcome.winner) === norm(leg.team));
  if (leg.kind === 'f1podium') return outcome.podium ? win(outcome.podium.some(name => norm(name) === norm(leg.driver))) : null;
  if (leg.kind === 'f1top6' || leg.kind === 'f1top10' || leg.kind === 'f1h2h') {
    if (!outcome.order) return null;
    const at = name => {
      const i = outcome.order.findIndex(x => norm(x) === norm(name));
      return i < 0 ? Infinity : i;
    };
    if (leg.kind === 'f1h2h') {
      // The rival from the pick's id (f1h2h|driver|rival) where it wasn't kept.
      const rival = leg.rival ?? String(leg.id || '').split('|')[2];
      if (!rival) return null;
      return at(leg.driver) === at(rival) ? 'void' : win(at(leg.driver) < at(rival));
    }
    return win(at(leg.driver) < (leg.kind === 'f1top6' ? 6 : 10));
  }
  // Safety car, VSC, red flag: whether it happened, against the pick (yes / no).
  if (leg.kind === 'f1sc' || leg.kind === 'f1vsc' || leg.kind === 'f1red') {
    const happened = outcome.flags?.[leg.kind.slice(2)];
    return typeof happened === 'boolean' ? win(happened === (leg.pick === 'yes')) : null;
  }
  if (leg.kind === 'f1team') return win(norm(f1Driver(outcome.winner).team) === norm(leg.team));
  // A player's number in the box score (props.mjs).
  if (leg.kind === 'prop') return propResult(leg, outcome.prop ?? null);
  let away = Number(outcome.awayScore);
  let home = Number(outcome.homeScore);
  if (!Number.isFinite(away) || !Number.isFinite(home)) return null;
  const push = diff => (diff === 0 ? 'void' : win(diff > 0));
  // Each side's period scores (innings, halves, quarters), as read.
  const a = outcome.awayInnings || [];
  const h = outcome.homeInnings || [];
  // Every hockey market is on 60 minutes, without overtime or the shootout
  // (台灣運彩 投注規範 2(17) 冰球 全場): its three periods.
  if (familyOf(leg.sport) === 'hockey') {
    if (a.length < 3 || h.length < 3) return null;
    away = firstPeriods(a, 3);
    home = firstPeriods(h, 3);
  }
  switch (leg.kind) {
    case 'ml':
      // A tie where the winner has no draw to pick (baseball's, basketball's,
      // American football's two-way 不讓分: an NPB, KBO or CPBL game called
      // level after 12 innings; a hockey winner bought two-way before it was
      // three) is a result not on offer: void, as 台灣運彩 rules (無效投注
      // Q&A; 投注規範 32(七)). Soccer's and hockey's (`threeWay`) have a draw.
      if (leg.side !== 'draw' && away === home && familyOf(leg.sport) && !isSoccer(leg.sport) && !leg.threeWay) return 'void';
      return win(leg.side === 'draw' ? away === home : leg.side === 'away' ? away > home : home > away);
    case 'total':
      return push(leg.side === 'over' ? away + home - leg.line : leg.line - away - home);
    case 'runline':
    case 'sethcap':
      // 讓分, and a set sport's 讓盤 on the sets won.
      return push(leg.side === 'away' ? away + leg.line - home : home + leg.line - away);
    case 'hcap3': {
      // Soccer's three-way 讓分: the away side's whole-goal line on the score;
      // level after it is 讓分和 (the draw pick), never a refund.
      const d = away + leg.line - home;
      return win(leg.side === 'draw' ? d === 0 : leg.side === 'away' ? d > 0 : d < 0);
    }
    case 'gametotal':
    case 'gamehcap': {
      // A set sport's 大小 and 讓局 on every set's games (points, for
      // volleyball, badminton and table tennis).
      if (!a.length && !h.length) return null;
      const ga = firstPeriods(a, a.length);
      const gh = firstPeriods(h, h.length);
      if (leg.kind === 'gametotal') return push(leg.side === 'over' ? ga + gh - leg.line : leg.line - ga - gh);
      return push(leg.side === 'away' ? ga + leg.line - gh : gh + leg.line - ga);
    }
    case 'set1':
      // 單盤不讓分: the first set's winner.
      if (!a.length || !h.length) return null;
      return win(leg.side === 'away' ? a[0] > h[0] : h[0] > a[0]);
    case 'teamtotal': {
      const runs = leg.team === 'away' ? away : home;
      return push(leg.side === 'over' ? runs - leg.line : leg.line - runs);
    }
    case 'oddeven':
      return win((away + home) % 2 === (leg.side === 'odd' ? 1 : 0));
    case 'btts':
      return win((away > 0 && home > 0) === (leg.side === 'yes'));
    case 'margin': {
      // The picked team winning by lo to hi (no upper end when hi is null);
      // hockey's 和局 pick, a tie.
      if (leg.side === 'draw') return win(away === home);
      const m = leg.team === 'home' ? home - away : away - home;
      return win(m >= leg.lo && (leg.hi == null || m <= leg.hi));
    }
    case 'score':
    case 'setscore': {
      // Correct score, written home-away ('setscore': in sets); 'other' is any score not listed.
      const final = `${home}-${away}`;
      return win(leg.score === 'other' ? !(leg.listed || []).includes(final) : leg.score === final);
    }
    case 'htft': {
      // Half-time and full-time results, both right.
      if (!a.length && !h.length) return null;
      const res = (x, y) => (y > x ? 'home' : y === x ? 'draw' : 'away');
      return win(res(Number(a[0]) || 0, Number(h[0]) || 0) === leg.ht && res(away, home) === leg.ft);
    }
    case 'dc':
      // Double chance: either of two results.
      return win(leg.side.split('|').includes(away > home ? 'away' : away === home ? 'draw' : 'home'));
    case 'hrunline': {
      // 半場讓分: the first half's score (two quarters) with the pick's line.
      if (!a.length && !h.length) return null;
      const pa = firstPeriods(a, 2);
      const ph = firstPeriods(h, 2);
      return push(leg.side === 'away' ? pa + leg.line - ph : ph + leg.line - pa);
    }
    case 'tdtotal':
      // 達陣數大小: the game's touchdowns, from its scoring plays.
      if (!Number.isFinite(outcome.touchdowns)) return null;
      return push(leg.side === 'over' ? outcome.touchdowns - leg.line : leg.line - outcome.touchdowns);
    case 'htotal': {
      // First-half total: one soccer half, two quarters.
      if (!a.length && !h.length) return null;
      const periods = halfPeriods(leg.sport);
      const pts = firstPeriods(a, periods) + firstPeriods(h, periods);
      return push(leg.side === 'over' ? pts - leg.line : leg.line - pts);
    }
    case 'f5total': {
      // Runs in the first five innings.
      // A final shorter than five innings (called off early): the stake back.
      if (a.length < 5 || h.length < 5) return outcome.status === 'final' ? 'void' : null;
      const runs = firstPeriods(a, 5) + firstPeriods(h, 5);
      return push(leg.side === 'over' ? runs - leg.line : leg.line - runs);
    }
    case 'goalbands':
    case 'goalcount':
      // Total goals in a band (正確進球數: a band of one).
      return win(away + home >= leg.lo && (leg.hi == null || away + home <= leg.hi));
    case 'q1':
    case 'half':
    case 'f5':
    case 'regulation': {
      // Part of the game, from the period scores: the first half (one soccer
      // half, two quarters), the first five innings, or hockey's three periods.
      const periods = leg.kind === 'f5' ? 5 : leg.kind === 'regulation' ? 3 : leg.kind === 'q1' ? 1 : halfPeriods(leg.sport);
      if (!a.length && !h.length) return null;
      const pa = firstPeriods(a, periods);
      const ph = firstPeriods(h, periods);
      return win(leg.side === 'draw' ? pa === ph : leg.side === 'away' ? pa > ph : ph > pa);
    }
    case 'f5runline': {
      // [1-5局]讓分: the first five innings with the pick's line; a game
      // called before five: the stake back.
      if (a.length < 5 || h.length < 5) return outcome.status === 'final' ? 'void' : null;
      const pa = firstPeriods(a, 5);
      const ph = firstPeriods(h, 5);
      return push(leg.side === 'away' ? pa + leg.line - ph : ph + leg.line - pa);
    }
    case 'inningtotal':
    case 'inningml': {
      // 單局大小 / 單局不讓分: one inning's runs (`period`, from 1).
      const i = (leg.period ?? 1) - 1;
      if (a.length <= i) return null;
      const ra = Number(a[i]) || 0;
      const rh = Number(h[i]) || 0;
      if (leg.kind === 'inningtotal') return push(leg.side === 'over' ? ra + rh - leg.line : leg.line - ra - rh);
      return win(leg.side === 'draw' ? ra === rh : leg.side === 'away' ? ra > rh : rh > ra);
    }
    case 'firstinning': {
      if (!a.length) return null;
      const runs = firstPeriods(a, 1) + firstPeriods(h, 1);
      return win((runs > 0) === (leg.side === 'yes'));
    }
    case 'nextrun': {
      // The game's Nth run: whose it was, or no one's if the game ended first.
      if (!outcome.runOrder) return null;
      return win(leg.side === (outcome.runOrder[leg.line - 1] ?? 'none'));
    }
    case 'dnb':
      // Draw no bet: a draw gives the stake back.
      return away === home ? 'void' : win(leg.side === 'away' ? away > home : home > away);
    case 'corners': {
      // Soccer's corners, from ESPN's team stats.
      if (!outcome.corners) return null;
      const n = outcome.corners.home + outcome.corners.away;
      return push(leg.side === 'over' ? n - leg.line : leg.line - n);
    }
    case 'inning':
      if (!a.length) return null;
      return win(topInning(a, h) === leg.inning);
    case 'qrunline':
    case 'qtotal': {
      // 單節讓分 / 單節大小: one period's (`period`, from 1) score.
      const i = (leg.period ?? 1) - 1;
      if (a.length <= i || h.length <= i) return null;
      const pa = Number(a[i]) || 0;
      const ph = Number(h[i]) || 0;
      if (leg.kind === 'qtotal') return push(leg.side === 'over' ? pa + ph - leg.line : leg.line - pa - ph);
      return push(leg.side === 'away' ? pa + leg.line - ph : ph + leg.line - pa);
    }
    case 'topperiod': {
      // 得分最高單節: the regulation period with the most points or goals
      // (overtime's aside); a shared highest is 平手 ('tie').
      const n = familyOf(leg.sport) === 'hockey' ? 3 : 4;
      if (a.length < n || h.length < n) return null;
      const per = Array.from({ length: n }, (_, i) => (Number(a[i]) || 0) + (Number(h[i]) || 0));
      const most = Math.max(...per);
      const at = per.flatMap((x, i) => (x === most ? [String(i + 1)] : []));
      return win(leg.side === (at.length === 1 ? at[0] : 'tie'));
    }
    case 'raceto': {
      // 先得X分: the side whose count reached the line first; 'none', neither.
      if (!outcome.runOrder) return null;
      const n = { away: 0, home: 0 };
      let first = 'none';
      for (const side of outcome.runOrder) if (++n[side] >= leg.line) {
        first = side;
        break;
      }
      return win(leg.side === first);
    }
    case 'mltotal':
    case 'mlbtts': {
      // 不讓分/大小 and 不讓分/兩隊是否都進球: the result and the other, both right.
      const [res, other] = String(leg.side).split('|');
      const result = away > home ? 'away' : away === home ? 'draw' : 'home';
      const ok = leg.kind === 'mltotal' ? (away + home > leg.line) === (other === 'over') : (away > 0 && home > 0) === (other === 'yes');
      return win(result === res && ok);
    }
    case 'teamgoals': {
      // 主(客)隊正確進球數: one side's goals in its band.
      const n = leg.team === 'away' ? away : home;
      return win(n >= leg.lo && (leg.hi == null || n <= leg.hi));
    }
    case 'hdc':
    case 'hscore': {
      // 半場雙勝 and 上半場正確比數: the first half's score.
      if (!a.length || !h.length) return null;
      const pa = Number(a[0]) || 0;
      const ph = Number(h[0]) || 0;
      if (leg.kind === 'hdc') return win(leg.side.split('|').includes(pa > ph ? 'away' : pa === ph ? 'draw' : 'home'));
      const half = `${ph}-${pa}`;
      return win(leg.score === 'other' ? !(leg.listed || []).includes(half) : leg.score === half);
    }
    case 'higherhalf': {
      // 得分較高半場: the half with more goals (90 minutes), or 'tie'.
      if (a.length < 2 || h.length < 2) return null;
      const one = (Number(a[0]) || 0) + (Number(h[0]) || 0);
      const two = (Number(a[1]) || 0) + (Number(h[1]) || 0);
      return win(leg.side === (one > two ? 'first' : one === two ? 'tie' : 'second'));
    }
    case 'firstgoal':
    case 'lastgoal': {
      // 第一球 / 最後進球球隊 in 90 minutes; 'none' in a 0-0.
      if (!outcome.goalOrder) return null;
      const scorer = (leg.kind === 'firstgoal' ? outcome.goalOrder[0] : outcome.goalOrder.at(-1)) ?? 'none';
      return win(leg.side === scorer);
    }
    case 'hits':
    case 'teamhits': {
      // 安打數大小 and 主(客)隊安打數大小, from the box score's hits.
      const ha = Number(outcome.awayHits);
      const hh = Number(outcome.homeHits);
      if (!Number.isFinite(ha) || !Number.isFinite(hh)) return null;
      const n = leg.kind === 'hits' ? ha + hh : leg.team === 'away' ? ha : hh;
      return push(leg.side === 'over' ? n - leg.line : leg.line - n);
    }
    default:
      return null;
  }
}

// A pick already decided by the score so far in a game that won't be
// finished (suspended past its time, or abandoned): 台灣運彩 keeps a pick
// that already has its result (投注規範 32(二): 大小's over already past the
// line wins); the rest are void. null: not decided.
export function decidedSoFar(leg, { awayScore, homeScore }) {
  const away = Number(awayScore);
  const home = Number(homeScore);
  if (!Number.isFinite(away) || !Number.isFinite(home)) return null;
  const past = (n, line) => (n > line ? (leg.side === 'over' ? 'won' : 'lost') : null);
  if (leg.kind === 'total') return past(away + home, leg.line);
  if (leg.kind === 'teamtotal') return past(leg.team === 'away' ? away : home, leg.line);
  if (leg.kind === 'btts') return away > 0 && home > 0 ? (leg.side === 'yes' ? 'won' : 'lost') : null;
  return null;
}

// ---- When a game that hasn't been played is void (台灣運彩 投注規範 32-33) ----
// A game not started within 48 hours of its scheduled start is void (and one
// suspended and not finished within that time: its undecided picks);
// baseball's time is its scheduled day and American football's its
// scheduled week, local time. Local: the league's home time zone (MLB's and
// American football's the US's latest, the Pacific); a week runs Thursday to
// Wednesday, the NFL's.
export const NOT_STARTED_MS = 48 * 3_600_000;
const LOCAL_TZ = { npb: 'Asia/Tokyo', kbo: 'Asia/Seoul', cpbl: 'Asia/Taipei' };
const US_LATEST = 'America/Los_Angeles';
function wallClock(t, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' }).formatToParts(new Date(t));
  const p = Object.fromEntries(parts.map(x => [x.type, Number(x.value)]));
  return { y: p.year, m: p.month, d: p.day, ms: Date.UTC(p.year, p.month - 1, p.day, p.hour % 24, p.minute, p.second) };
}
// Midnight local time, `days` days after t's local date.
function localMidnight(t, timeZone, days) {
  const { y, m, d } = wallClock(t, timeZone);
  const wall = Date.UTC(y, m - 1, d + days);
  const offset = at => wallClock(at, timeZone).ms - Math.floor(at / 1000) * 1000;
  const guess = wall - offset(wall);
  return wall - offset(guess);
}
// The moment a game not yet started (or not finished after a suspension)
// becomes void: Infinity for a pick without a game time.
export function voidAt(leg) {
  const start = Date.parse(leg?.start);
  if (!Number.isFinite(start) || leg.kind === 'future') return Infinity;
  const family = familyOf(leg.sport);
  const tz = LOCAL_TZ[leg.sport] ?? US_LATEST;
  if (family === 'baseball') return localMidnight(start, tz, 1);
  if (family === 'football') {
    const { y, m, d } = wallClock(start, tz);
    const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    return localMidnight(start, tz, (4 - weekday + 7) % 7 || 7);
  }
  return start + NOT_STARTED_MS;
}
// A game read as not over, past its time: void (with the score so far, for
// picks it already decided) when it never started, was postponed, or was
// suspended; one under way (a long extra-innings night) is never cut off.
export function lateOutcome(leg, outcome, now = new Date()) {
  if (outcome?.status !== 'pending' || now.getTime() <= voidAt(leg)) return outcome;
  if (outcome.suspended) return { status: 'void', reason: 'late', sofar: { awayScore: outcome.awayScore, homeScore: outcome.homeScore } };
  if (outcome.postponed || outcome.state === 'pre') return { status: 'void', reason: 'late' };
  return outcome;
}

// Records leg results (one per leg, null if not known yet); once every leg
// is decided the slip is settled and its payout (after tax) is paid in.
// `finals` (optional, one per leg): the final score to keep with a pick as it
// is decided, { away, home } (and each set's score), so a slip's history
// never depends on the sources keeping old games.
export function applyResults(account, slipId, results, now = new Date(), finals = []) {
  const slip = account.slips.find(s => s.id === slipId);
  if (!slip || slip.status !== 'open') return account;
  const legs = slip.legs.map((leg, i) => {
    if (leg.result || !results[i]) return leg;
    return { ...leg, result: results[i], ...(finals[i] ? { final: finals[i] } : {}) };
  });
  // Settled once every pick is decided, or as soon as nothing left can pay
  // (a parlay with a pick lost: lost now, not after the other games end;
  // one already lost and open, from before, settles on the next check).
  const best = settleSlip({ legs: legs.map(leg => ({ ...leg, result: leg.result ?? 'won' })), sizes: slip.sizes, stake: slip.stake, boost: slip.boost ?? 0 }).net;
  const dead = best <= 0 && legs.some(leg => leg.result);
  if (!dead && legs.every((leg, i) => leg.result === slip.legs[i].result)) return account;
  let updated = { ...slip, legs };
  let ledger = account.ledger;
  if (legs.every(leg => leg.result) || dead) {
    const { gross, net } = settleSlip({ legs, sizes: slip.sizes, stake: slip.stake, boost: slip.boost ?? 0 });
    // A free bet pays what it won, less the stake it never cost.
    const payout = slip.free ? Math.max(0, Math.round(net) - (slip.freeValue ?? slip.stake)) : Math.round(net);
    updated = { ...updated, status: 'settled', settledAt: now.toISOString(), gross: Math.round(gross), payout };
    // (A slip refunded while it was lost, then found on another device, has
    // had its cost back already.)
    const refunded = ledger.some(e => e.id === `refund-${slip.id}`) ? slip.cost : 0;
    if (!ledger.some(e => e.id === `payout-${slip.id}`)) {
      ledger = [...ledger, { id: `payout-${slip.id}`, t: now.toISOString(), kind: 'payout', amount: payout - refunded, slipId: slip.id }];
    }
  }
  return touched({ ...account, ledger, slips: account.slips.map(s => (s.id === slipId ? updated : s)) }, now);
}



// ---- Outcomes: each pick's game, race or championship, read from its source ----

export const ESPN = 'https://site.api.espn.com/apis/site/v2/sports';
export const GAMMA = 'https://gamma-api.polymarket.com';
export const OPENF1 = 'https://api.openf1.org/v1';
export const KAMBI = 'https://eu-offering-api.kambicdn.com/offering/v2018/ub';
export const F1_FLAG_KINDS = new Set(['f1sc', 'f1vsc', 'f1red']);
const MATCH_TOLERANCE_MS = 6 * 60 * 60 * 1000;
const DAY_MS = 86_400_000;
const ESPN_PATH = Object.fromEntries(Object.entries(LEAGUES).map(([key, league]) => [key, league.path]));
// Called off for good (void at once), or put off (void only once past its
// time: voidAt), or stopped part way, to be finished later.
const VOID_STATUS = /CANCELED|CANCELLED|FORFEIT|ABANDONED/;
const POSTPONED = /POSTPONED/;
const SUSPENDED = /SUSPENDED/;

export function yyyymmdd(date) {
  return date.toISOString().slice(0, 10).replaceAll('-', '');
}
export function parseJsonArray(text) {
  if (Array.isArray(text)) return text;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
// The team (or driver) a championship market is about: Polymarket's short
// name when it has one, else from the question ("Will the X win the ...?",
// "Will X be (named) the ... Champion?").
export function futureTeamName(market) {
  const short = (market.groupItemTitle || '').trim();
  if (short) return short;
  return /^Will (?:the )?(.+?) (?:win the|be (?:named )?the) /i.exec(market.question || '')?.[1] ?? null;
}
export function sameGame(a, b) {
  return (
    a.sport === b.sport &&
    normalizeTeamName(a.away) === normalizeTeamName(b.away) &&
    normalizeTeamName(a.home) === normalizeTeamName(b.home) &&
    Math.abs(Date.parse(a.startUtc) - Date.parse(b.startUtc)) <= MATCH_TOLERANCE_MS
  );
}
// The same side under two spellings (Kambi's, a league's own, ESPN's): equal,
// one inside the other, or a shared long word ("Rakuten Monkeys" / "Rakuten").
// sideScore says how surely: 3 equal, 2 one inside the other, 1 a shared
// word, 0 not. A shared word alone is the weakest: a city's two clubs share
// one (Chicago's Cubs and White Sox, Manchester's, Madrid's, New York's), so
// which side a name is, and which way round two listings of a game are, go
// by the surer match (sideOfGame, sidesMatch), never by any match at all.
export function sideScore(a, b) {
  const [x, y] = [normalizeTeamName(a), normalizeTeamName(b)];
  if (!x || !y) return 0;
  if (x === y) return 3;
  if (x.includes(y) || y.includes(x)) return 2;
  const words = new Set(x.split(' ').filter(w => w.length >= 4));
  return y.split(' ').some(w => w.length >= 4 && words.has(w)) ? 1 : 0;
}
export const sameSide = (a, b) => sideScore(a, b) > 0;
// Which of a game's two sides a name is: 'home', 'away', or null (neither, or
// both alike).
export function sideOfGame(name, home, away) {
  const h = sideScore(name, home);
  const a = sideScore(name, away);
  return h > a ? 'home' : a > h ? 'away' : null;
}
// Two listings of a game's sides: in the same order ('same'), crossed
// ('flip'), or not the same two sides (null). Each side must match; the
// order that matches more surely wins (the same order on a tie).
export function sidesMatch(xHome, xAway, yHome, yAway) {
  const pair = (p, q) => (p > 0 && q > 0 ? p + q : 0);
  const same = pair(sideScore(xHome, yHome), sideScore(xAway, yAway));
  const cross = pair(sideScore(xHome, yAway), sideScore(xAway, yHome));
  return !same && !cross ? null : same >= cross ? 'same' : 'flip';
}
// Who scored each run of a game, in order, from ESPN's scoring plays (each
// carries the score after it): ['home', 'home', 'away', …].
export function runOrder(plays) {
  const order = [];
  let away = 0;
  let home = 0;
  for (const play of plays || []) {
    if (!play.scoringPlay) continue;
    const a = Number(play.awayScore);
    const h = Number(play.homeScore);
    if (!Number.isFinite(a) || !Number.isFinite(h)) continue;
    for (; away < a; away++) order.push('away');
    for (; home < h; home++) order.push('home');
  }
  return order;
}

// A football game's touchdowns from ESPN's scoring plays (overtime's too).
export function touchdowns(plays) {
  return (plays || []).filter(p => p?.type?.abbreviation === 'TD' || /touchdown/i.test(p?.type?.text || '')).length;
}

// A soccer game's goals from its scoreboard's events (ESPN's `details`:
// the side credited, own goals included, and the minute): each side's
// goals a half (then extra time's) and the 90 minutes' in order. null when
// they don't add up to the score.
export function soccerGoals(comp, away, home) {
  const side = { [away.team?.id]: 'away', [home.team?.id]: 'home' };
  const out = { away: [0, 0], home: [0, 0], order: [] };
  for (const d of comp.details || []) {
    if (!d.scoringPlay || d.shootout) continue;
    const who = side[d.team?.id];
    const minute = parseInt(d.clock?.displayValue ?? '', 10);
    if (!who || !Number.isFinite(minute)) return null;
    const part = minute <= 45 ? 0 : minute <= 90 ? 1 : 2;
    for (const s of ['away', 'home']) while (out[s].length <= part) out[s].push(0);
    out[who][part]++;
    if (part < 2) out.order.push(who);
  }
  const all = s => out[s].reduce((n, x) => n + x, 0);
  return all('away') === Number(away.score) && all('home') === Number(home.score) ? out : null;
}

// Every game on an ESPN scoreboard with how it stands: 'final', 'void'
// (called off) or 'pending', and for baseball the runs of each inning.
export function parseEspnResults(data, sport) {
  const games = [];
  for (const event of data.events || []) {
    const comp = event.competitions?.[0];
    if (!comp) continue;
    const side = ha => comp.competitors.find(c => c.homeAway === ha);
    const away = side('away');
    const home = side('home');
    if (!away || !home) continue;
    const type = comp.status?.type || {};
    const name = type.name || '';
    const status = VOID_STATUS.test(name) ? 'void' : type.completed && type.state === 'post' ? 'final' : 'pending';
    // Each side's period scores; a soccer scoreboard's from its goals when
    // ESPN gives none (its halves, then extra time), with their order.
    const goals = isSoccer(sport) ? soccerGoals(comp, away, home) : null;
    const lines = side => (side.linescores?.length ? side.linescores.map(l => Number(l.value) || 0) : goals?.[side.homeAway] ?? []);
    const awayLines = lines(away);
    const homeLines = lines(home);
    // Soccer settles on 90 minutes: a tie that went to extra time (or
    // penalties) counts its two halves only.
    const halves = list => list.slice(0, 2).reduce((sum, n) => sum + n, 0);
    const ninety = isSoccer(sport) && /AET|PEN|EXTRA|SHOOTOUT/i.test(type.name || '') && awayLines.length >= 2 && homeLines.length >= 2;
    games.push({
      sport,
      espnId: event.id,
      startUtc: new Date(event.date).toISOString(),
      away: away.team.displayName,
      home: home.team.displayName,
      status,
      awayScore: ninety ? halves(awayLines) : Number(away.score),
      homeScore: ninety ? halves(homeLines) : Number(home.score),
      awayInnings: awayLines,
      homeInnings: homeLines,
      ...(goals ? { goalOrder: goals.order } : {}),
      // Baseball's hits (安打數大小).
      ...(Number.isFinite(away.hits) && Number.isFinite(home.hits) ? { awayHits: away.hits, homeHits: home.hits } : {}),
      // Where a game in progress is: 'in', ESPN's short detail ("Top 7th",
      // "Q3 5:21", "67'") and the period number.
      state: type.state ?? null,
      ...(status === 'pending' && POSTPONED.test(name) ? { postponed: true } : {}),
      ...(status === 'pending' && SUSPENDED.test(name) ? { suspended: true } : {}),
      // Abandoned part way: the score so far still decides what it already has.
      ...(status === 'void' && /ABANDONED/.test(name) && type.state !== 'pre' ? { sofar: { awayScore: Number(away.score), homeScore: Number(home.score) } } : {}),
      detail: type.shortDetail || type.detail || '',
      period: Number(comp.status?.period) || 0
    });
  }
  return games;
}

// The race winner from ESPN's F1 scoreboard: { status, winner, podium } for
// the race nearest `startUtc` (within four days: the pick's start can be the
// weekend's rather than the race's). ESPN can take hours to mark a race
// final; its "session complete" already has the finishing order, so it
// counts as the result too.
export function parseEspnRace(data, startUtc) {
  let best = null;
  for (const event of data.events || []) {
    for (const comp of event.competitions || []) {
      if (comp.type?.abbreviation !== 'Race') continue;
      const gap = Math.abs(Date.parse(comp.date) - Date.parse(startUtc));
      if (gap <= 4 * DAY_MS && (!best || gap < best.gap)) best = { gap, comp };
    }
  }
  if (!best) return null;
  const comp = best.comp;
  const type = comp.status?.type || {};
  if (VOID_STATUS.test(type.name || '')) return { status: 'void' };
  if (POSTPONED.test(type.name || '')) return { status: 'pending', postponed: true };
  if (!type.completed && !/SESSION_COMPLETE|FINAL/.test(type.name || '')) return { status: 'pending' };
  const ranked = [...(comp.competitors || [])].filter(c => Number(c.order) >= 1).sort((a, b) => Number(a.order) - Number(b.order));
  const first = (comp.competitors || []).find(c => c.winner) ?? ranked[0];
  const name = c => c.athlete?.displayName || c.athlete?.fullName;
  const podium = ranked.slice(0, 3).map(name);
  // The whole order, for top six and ten, head-to-heads and the winning team.
  const order = ranked.map(name);
  return first ? { status: 'final', winner: name(first), ...(podium.length === 3 ? { podium } : {}), ...(order.length >= 10 ? { order } : {}) } : { status: 'pending' };
}

// The pole-sitter of the qualifying session nearest `startUtc` (a pole
// pick's start is the qualifying's): { status: 'final', pole } once over.
export function parseEspnPole(data, startUtc) {
  let best = null;
  for (const event of data.events || []) {
    for (const comp of event.competitions || []) {
      if (comp.type?.abbreviation !== 'Qual') continue;
      const gap = Math.abs(Date.parse(comp.date) - Date.parse(startUtc));
      if (gap <= 2 * DAY_MS && (!best || gap < best.gap)) best = { gap, comp };
    }
  }
  if (!best) return null;
  const type = best.comp.status?.type || {};
  if (VOID_STATUS.test(type.name || '')) return { status: 'void' };
  if (POSTPONED.test(type.name || '')) return { status: 'pending', postponed: true };
  if (!type.completed && !/SESSION_COMPLETE|FINAL/.test(type.name || '')) return { status: 'pending' };
  const first = (best.comp.competitors || []).find(c => Number(c.order) === 1);
  const name = first?.athlete?.displayName || first?.athlete?.fullName;
  return name ? { status: 'final', pole: name } : { status: 'pending' };
}

// A championship's winner once Polymarket has resolved the market.
export function parseFutureResult(events) {
  const event = events?.[0];
  if (!event?.closed) return { status: 'pending' };
  for (const m of event.markets || []) {
    const name = futureTeamName(m);
    const outcomes = parseJsonArray(m.outcomes);
    const prices = parseJsonArray(m.outcomePrices);
    // (Outcomes that can't be read are no answer: never the first price taken as Yes.)
    const at = Array.isArray(outcomes) ? outcomes.findIndex(o => /^yes$/i.test(o)) : -1;
    const yes = at >= 0 ? Number(prices?.[at]) : NaN;
    if (name && yes >= 0.99) return { status: 'final', winner: name };
  }
  return { status: 'pending' };
}

// The race's safety car, VSC and red flag from OpenF1's race control
// messages, once the race is over: { status, flags: { sc, vsc, red } }.
export function parseOpenF1Flags(messages) {
  if (!Array.isArray(messages) || !messages.length) return { status: 'pending' };
  const text = messages.map(m => String(m.message || '').toUpperCase());
  const over = text.some(m => m === 'CHEQUERED FLAG' || m === 'SESSION FINISHED' || m === 'RACE WILL NOT RESUME') || messages.some(m => m.flag === 'CHEQUERED');
  if (!over) return { status: 'pending' };
  return {
    status: 'final',
    flags: {
      sc: text.some(m => m.startsWith('SAFETY CAR DEPLOYED')),
      vsc: text.some(m => /^(VIRTUAL SAFETY CAR|VSC) DEPLOYED/.test(m)),
      red: messages.some(m => m.flag === 'RED') || text.some(m => m.startsWith('RED FLAG'))
    }
  };
}

// ESPN files games under the US Eastern date.
export function espnDates(startUtc) {
  const t = Date.parse(startUtc);
  return [...new Set([4, 5].map(h => yyyymmdd(new Date(t - h * 3_600_000))))];
}

// Each side's corners from a soccer summary's team stats: { home, away }.
export function teamCorners(summary) {
  const teams = summary?.boxscore?.teams || [];
  const of = side => {
    const t = teams.find(x => x.homeAway === side);
    const stat = t?.statistics?.find(x => x.name === 'wonCorners');
    const n = Number(stat?.displayValue ?? stat?.value);
    return Number.isFinite(n) ? n : null;
  };
  const home = of('home');
  const away = of('away');
  return home == null || away == null ? null : { home, away };
}

// A game in an Asian league's month list as a result: final (its score),
// void (called off), or still to come.
export function asiaResult(g) {
  if (g.state === 'void') return { status: 'void' };
  if (g.state === 'post' && g.homeScore != null && g.awayScore != null) return { status: 'final', homeScore: Number(g.homeScore), awayScore: Number(g.awayScore), awayInnings: [], homeInnings: [] };
  return { status: 'pending', state: g.state === 'in' ? 'in' : 'pre' };
}

// ---- Kambi ----

export const kambiLiveDataUrl = id => `${KAMBI}/event/${encodeURIComponent(id)}/livedata.json?lang=en_GB&market=GB`;

// Each period's score, home first ("0-1 | 2-0" for innings, "Q1: 11-16 | Q2: 22-24"
// for quarters): { home: [...], away: [...] }.
export function kambiPeriods(info) {
  const home = [];
  const away = [];
  for (const part of String(info || '').split('|')) {
    const m = /(\d+)\s*-\s*(\d+)\s*$/.exec(part.trim());
    if (!m) continue;
    home.push(Number(m[1]));
    away.push(Number(m[2]));
  }
  return { home, away };
}

// One match's live data: the same shape as parseKambiLive's entries, with
// each period's score, when the score last changed and the clock.
export function parseKambiLiveData(data) {
  const live = Array.isArray(data?.liveData) ? data.liveData[0] : data?.liveData;
  if (!live?.score) return null;
  const changed = Number(live.score.version);
  return {
    score: { home: Number(live.score.home) || 0, away: Number(live.score.away) || 0 },
    periods: kambiPeriods(live.score.info),
    // A set sport's games in each set (kambiSets).
    sets: live.statistics?.sets ?? null,
    changedAt: Number.isFinite(changed) ? changed : null,
    clock: live.matchClock ? { period: live.matchClock.periodId || '', left: (Number(live.matchClock.minutesLeftInPeriod) || 0) * 60 + (Number(live.matchClock.secondsLeftInMinute) || 0), running: Boolean(live.matchClock.running) } : null
  };
}

// ---- Set sports: tennis, volleyball, badminton, table tennis, esports ----
//
// Settled from Kambi's live data, whose `statistics.sets` lists each set's
// games (points; -1 for one not played) and has as many entries as the
// match is best of. A set is over at its sport's target with a two-point
// (game) lead, or at its cap: tennis 6 (7 in a tie-break), volleyball 25
// (15 in a deciding fifth), badminton 21 (30 at most), table tennis 11.
// Esports' maps: only a set followed by another counts as over.
export const SET_RULES = {
  tennis: { to: 6, cap: 7 },
  volleyball: { to: 25, last: 15 },
  badminton: { to: 21, cap: 30 },
  tabletennis: { to: 11 },
  esports: null
};
export const SET_SPORTS = new Set(Object.keys(SET_RULES));
// Each set's games: { home, away, bestOf } (unplayed sets left out), or null.
export function kambiSets(live) {
  const s = live?.sets ?? live?.statistics?.sets;
  if (!Array.isArray(s?.home) || !Array.isArray(s?.away)) return null;
  const n = Math.min(s.home.length, s.away.length);
  const home = [];
  const away = [];
  for (let i = 0; i < n && s.home[i] >= 0 && s.away[i] >= 0; i++) {
    home.push(Number(s.home[i]));
    away.push(Number(s.away[i]));
  }
  return { home, away, bestOf: n };
}
// Whether set i (from 0) ended home-away.
export function setOver(sport, i, bestOf, home, away) {
  const r = SET_RULES[sport];
  if (!r) return false;
  const hi = Math.max(home, away);
  const target = r.last && i === bestOf - 1 ? r.last : r.to;
  return (hi >= target && Math.abs(home - away) >= 2) || (r.cap != null && hi >= r.cap && home !== away);
}
// A set sport's result once a side has won the match's sets, or null: the
// sets won as the score, each set's games as the periods.
export function decidedSetMatch(live, sport) {
  const s = kambiSets(live);
  if (!s || !s.bestOf) return null;
  let home = 0;
  let away = 0;
  s.home.forEach((h, i) => {
    const a = s.away[i];
    const done = i < s.home.length - 1 || setOver(sport, i, s.bestOf, h, a);
    if (done && h !== a) h > a ? home++ : away++;
  });
  const need = Math.ceil(s.bestOf / 2);
  if (home < need && away < need) return null;
  return { status: 'final', homeScore: home, awayScore: away, homeInnings: s.home, awayInnings: s.away };
}

// How long a score must stay the same before a finished-looking game counts as over.
export const KAMBI_QUIET_MS = 30 * 60_000;
// Innings after which a level baseball game ends level (NPB and CPBL stop at 12, KBO at 11).
const TIE_INNINGS = { npb: 12, cpbl: 12, kbo: 11 };

// The result of a baseball or basketball game from its live data, or null
// while it may still be going. `start` is the scheduled start; `ended`: the
// data is the last Kambi had before dropping the match (kept by the Worker's
// /kambi watch), so the game is over whenever its score says it can be.
export function decidedTeamGame(live, sport, start, now = new Date(), { ended = false } = {}) {
  const family = LEAGUES[sport]?.family;
  // A set sport: over once a side has won its sets.
  if (live && SET_SPORTS.has(family ?? sport)) return decidedSetMatch(live, family ?? sport);
  if (!live || (family !== 'baseball' && family !== 'basketball' && family !== 'soccer')) return null;
  const { home, away } = live.score;
  const n = live.periods.home.length;
  const t = now.getTime();
  const began = Date.parse(start) || 0;
  // The score's own timestamp when it's a sensible one; if not, a generous
  // time after the start.
  const changed = live.changedAt && live.changedAt >= began && live.changedAt <= t + 3_600_000 ? live.changedAt : null;
  const quiet = ended || (changed ? t - changed >= KAMBI_QUIET_MS : began && t - began >= (family === 'baseball' ? 5 : 3.5) * 3_600_000);
  let over = false;
  if (family === 'baseball') over = n >= 9 && quiet && (home !== away || n >= (TIE_INNINGS[sport] ?? 99));
  // Soccer: a draw stands; over once Kambi has dropped it, or quiet well past full time.
  else if (family === 'soccer') over = ended || (quiet && began && t - began >= 2.5 * 3_600_000);
  else {
    const clockDone = live.clock && !live.clock.running && live.clock.left === 0 && /QUARTER4|OVERTIME|OT/i.test(live.clock.period);
    over = n >= 4 && home !== away && (ended || (clockDone ? t - (changed ?? 0) >= 5 * 60_000 : quiet));
  }
  if (!over) return null;
  return { status: 'final', homeScore: home, awayScore: away, homeInnings: live.periods.home, awayInnings: live.periods.away };
}

// When Kambi has dropped the match and the last score kept (by the app or the
// Worker's watch) can't decide it, the pick is void (the stake comes back), as the
// lottery does with a match that has no official result. That's once the
// kept copy is marked gone, or, with nothing kept at all, once the match is
// surely over (its sport's longest usual length, plus two hours).
const KAMBI_LONGEST_H = { npb: 6, kbo: 6, cpbl: 6, euroleague: 4, kleague: 4 };
export function kambiUnresolvable(leg, entry, now = new Date(), watchReachable = true) {
  if (entry?.gone) return true;
  const past = now.getTime() - Date.parse(leg.start);
  const longest = (KAMBI_LONGEST_H[leg.sport] ?? 6) * 3_600_000 + 2 * 3_600_000;
  // The Worker's copy unreachable: wait longer before calling it void.
  return !entry?.live && past > (watchReachable ? longest : longest + 12 * 3_600_000);
}

// A Kambi match in play as an outcome still pending: the score so far.
export function kambiInPlay(live) {
  return { status: 'pending', state: 'in', homeScore: live.score.home, awayScore: live.score.away, detail: '' };
}

// Outcomes for slip legs that have started: legId -> outcome (see legResult).
// Legs whose results can't be read are left out. `read(url)`: JSON or null
// (the phone's proxy read, the Worker's own); `keptKambi(ids)`: the Worker's
// kept Kambi copies, id -> { live, gone } (null when unreachable). Each URL
// is read once for every leg on it: one read settles every slip on a game.
export async function readOutcomes(legs, { read, keptKambi = async () => null, now = new Date() } = {}) {
  const out = new Map();
  const kambiGone = [];
  const pages = new Map();
  const page = url => {
    if (!pages.has(url)) pages.set(url, Promise.resolve(read(url)).catch(() => null));
    return pages.get(url);
  };
  await Promise.all(
    legs.map(async leg => {
      if (leg.kind === 'future') {
        if (!leg.eventSlug) return;
        const events = await page(`${GAMMA}/events?slug=${encodeURIComponent(leg.eventSlug)}`);
        if (events) out.set(leg.id, parseFutureResult(events));
        return;
      }
      if (!leg.start || Date.parse(leg.start) > now.getTime()) return;
      if (F1_FLAG_KINDS.has(leg.kind)) {
        // OpenF1's race control messages for the race nearest the pick's start.
        const day = new Date(Date.parse(leg.start) - DAY_MS).toISOString().slice(0, 10);
        const sessions = await page(`${OPENF1}/sessions?session_name=Race&date_start>=${day}`);
        const race = (Array.isArray(sessions) ? sessions : [])
          .map(x => ({ key: x.session_key, gap: Math.abs(Date.parse(x.date_start) - Date.parse(leg.start)) }))
          .filter(x => x.gap < 2 * DAY_MS)
          .sort((a, b) => a.gap - b.gap)[0];
        if (race) out.set(leg.id, parseOpenF1Flags(await page(`${OPENF1}/race_control?session_key=${race.key}`)));
        // No race run within a week of its date (called off): the stake back.
        else if (Array.isArray(sessions) && now.getTime() - Date.parse(leg.start) > 7 * DAY_MS) out.set(leg.id, { status: 'void' });
        return;
      }
      // F1's own timing first (Orbit Sports' too, the kit's f1live.mjs): a
      // session over is settled at once, one on stands as it is now (目前會中);
      // ESPN's results (below) came minutes to hours after the flag.
      if (leg.kind?.startsWith('f1')) {
        const fed = await f1Outcome(page, leg.kind === 'f1pole' ? 'Qualifying' : 'Race', leg.start, now.getTime()).catch(() => null);
        if (fed) return out.set(leg.id, fed);
      }
      if (leg.kind === 'f1pole') {
        // The qualifying's day and the next (its start is the qualifying's).
        for (const days of [0, 1]) {
          const data = await page(`${ESPN}/racing/f1/scoreboard?dates=${yyyymmdd(new Date(Date.parse(leg.start) + days * DAY_MS))}`);
          const result = data && parseEspnPole(data, leg.start);
          if (result) return out.set(leg.id, result);
        }
        return;
      }
      if (leg.kind?.startsWith('f1')) {
        // The race's day and the two after (the start kept with a pick can be
        // a little before the race itself).
        for (const days of [0, 1, 2]) {
          const data = await page(`${ESPN}/racing/f1/scoreboard?dates=${yyyymmdd(new Date(Date.parse(leg.start) + days * DAY_MS))}`);
          const result = data && parseEspnRace(data, leg.start);
          if (result) return out.set(leg.id, result);
        }
        return;
      }
      const league = LEAGUES[leg.sport];
      // Tennis and UFC are no longer sold (2026-10-11): a pick still open on
      // one is void, its stake back.
      if (!league && ['atp', 'wta', 'ufc'].includes(leg.sport)) return out.set(leg.id, { status: 'void' });
      // Asian baseball from the league's own list (a game Kambi didn't price):
      // the final score in its month's list.
      if (league?.schedule?.asia && !leg.kambiId) {
        const t = Date.parse(leg.start);
        const games = await asiaMonth(page, league.schedule.asia, asiaMonthOf(t)).catch(() => []);
        const g = games.find(x => Math.abs(Date.parse(x.start) - t) < 12 * 3_600_000 && sidesMatch(x.home?.en, x.away?.en, leg.home, leg.away) === 'same');
        if (g) out.set(leg.id, asiaResult(g));
        return;
      }
      // Kambi's sports: the result from the match's own live data, once the
      // score shows it decided (see decidedTeamGame). Once
      // Kambi has dropped it, from the Worker's kept copy (below).
      if (league?.kambi && leg.kambiId) {
        const live = parseKambiLiveData(await page(kambiLiveDataUrl(leg.kambiId)));
        if (!live) return kambiGone.push(leg);
        const result = decidedTeamGame(live, leg.sport, leg.start, now);
        out.set(leg.id, result ?? kambiInPlay(live, leg.sport));
        return;
      }
      const path = ESPN_PATH[leg.sport];
      if (!path) return;
      const want = { sport: leg.sport, away: leg.away, home: leg.home, startUtc: leg.start };
      let found = null;
      for (const date of espnDates(leg.start)) {
        const data = await page(`${ESPN}/${path}/scoreboard?dates=${date}`);
        found = (data && parseEspnResults(data, leg.sport).find(g => sameGame(g, want))) || null;
        if (found) break;
      }
      // Put off (or moved off its day): the same two teams played again
      // within the game's time still count (a makeup after it isn't this game).
      if (!found || found.postponed) {
        const start = Date.parse(leg.start);
        const until = Math.min(voidAt(leg), now.getTime());
        const dates = [];
        for (let t = start + DAY_MS; t <= until + DAY_MS; t += DAY_MS) dates.push(...espnDates(new Date(t).toISOString()));
        for (const date of [...new Set(dates)].filter(d => !espnDates(leg.start).includes(d))) {
          const data = await page(`${ESPN}/${path}/scoreboard?dates=${date}`);
          const again = data && parseEspnResults(data, leg.sport).find(g => !g.postponed && sameGame({ ...g, startUtc: leg.start }, want) && Date.parse(g.startUtc) > start && Date.parse(g.startUtc) <= voidAt(leg));
          if (again) {
            found = again;
            break;
          }
        }
      }
      const game = found;
      if (!game) return;
      // 第N分 needs the order the runs came in: the game's scoring plays;
      // a player's pick their box score; corners the teams' stats.
      if ((leg.kind === 'nextrun' || leg.kind === 'raceto' || leg.kind === 'prop' || leg.kind === 'corners' || leg.kind === 'tdtotal') && game.status === 'final') {
        const summary = await page(`${ESPN}/${path}/summary?event=${game.espnId}`);
        if (!summary) return;
        if (leg.kind === 'nextrun' || leg.kind === 'raceto') {
          if (Array.isArray(summary.plays)) out.set(leg.id, { ...game, runOrder: runOrder(summary.plays) });
        }
        else if (leg.kind === 'tdtotal') {
          if (Array.isArray(summary.scoringPlays)) out.set(leg.id, { ...game, touchdowns: touchdowns(summary.scoringPlays) });
        }
        else if (leg.kind === 'prop') {
          // Kambi settles players' soccer markets on 90 minutes; ESPN's
          // numbers count extra time: a tie that went on is void.
          const status = summary.header?.competitions?.[0]?.status?.type?.name || '';
          const prop = /AET|PEN|EXTRA|SHOOTOUT/i.test(status) && isSoccer(leg.sport) ? { status: 'void' } : propOutcome(leg, summary);
          if (prop) out.set(leg.id, { ...game, prop });
        } else {
          const corners = teamCorners(summary);
          if (corners) out.set(leg.id, { ...game, corners });
        }
        return;
      }
      out.set(leg.id, game);
    })
  );
  if (kambiGone.length) {
    const kept = await Promise.resolve(keptKambi([...new Set(kambiGone.map(l => String(l.kambiId)))])).catch(() => null);
    for (const leg of kambiGone) {
      const entry = kept?.get(String(leg.kambiId));
      const live = entry?.live && parseKambiLiveData({ liveData: entry.live });
      const result = live && decidedTeamGame(live, leg.sport, leg.start, now, { ended: Boolean(entry.gone) });
      if (result) out.set(leg.id, result);
      else if (kambiUnresolvable(leg, entry, now, Boolean(kept))) out.set(leg.id, { status: 'void', reason: 'noResult' });
      else if (live && !entry.gone) out.set(leg.id, kambiInPlay(live, leg.sport));
    }
  }
  // Past its time without being played (or finished): void (voidAt).
  for (const leg of legs) if (out.has(leg.id)) out.set(leg.id, lateOutcome(leg, out.get(leg.id), now));
  return out;
}

// What to keep of a decided game with its pick: the final score (and each
// set's), or a race's or championship's winner.
export function finalOf(outcome) {
  if (outcome?.status !== 'final') return null;
  if (outcome.winner) return { winner: outcome.winner, ...(outcome.podium ? { podium: outcome.podium } : {}) };
  if (!Number.isFinite(outcome.awayScore) || !Number.isFinite(outcome.homeScore)) return null;
  return { away: outcome.awayScore, home: outcome.homeScore };
}
