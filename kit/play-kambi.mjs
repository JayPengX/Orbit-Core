// Kambi's public odds feed (the bookmaker behind Unibet and others): the
// leagues ESPN doesn't carry: Asian baseball, EuroLeague and K League.
// Read through the shared sports proxy, which
// caches each list for every viewer (2 minutes) and trims it to the fields
// read here, so the feed sees one request per league per few minutes. Odds come as thousandths (1950 = 1.95) and lines as
// thousandths too (1500 = 1.5); a match lists its home player first.
import { devigProportional } from '#kit/play-odds.mjs';
import { LEAGUES, normalizeTeamName, teamZh } from '#kit/play-teams.mjs';
import { housePrices } from '#kit/play-house.mjs';

// Reading a match's live data and deciding it: the shared kit's (settle.mjs), as the Worker settles.
import { KAMBI, kambiUrl, kambiLiveDataUrl, kambiPeriods, parseKambiLiveData, KAMBI_QUIET_MS, decidedTeamGame } from '#kit/settle.mjs';
export { KAMBI, kambiUrl, kambiLiveDataUrl, kambiPeriods, parseKambiLiveData, KAMBI_QUIET_MS, decidedTeamGame };

const outcome = (offer, type) => offer.outcomes.find(o => o.type === type);
// The whole game's winner (with overtime: NHL's regular-time 1X2 isn't it).
const isMatch = o => o.betOfferType?.englishName === 'Match' || /match odds|moneyline|bout odds/i.test(o.criterion?.englishLabel || '');
const matchOffer = offers => offers.find(o => isMatch(o) && !/regular time|\b(1st|2nd|3rd)\b|quarter|half|period|inning|set \d|^set\b/i.test(o.criterion?.englishLabel || '')) ?? offers.find(isMatch);
const odds = o => (o && o.odds > 1000 ? o.odds / 1000 : null);

// Fair chances from one offer's two (or three) prices, the margin removed.
function fairPair(a, b) {
  const pa = odds(a);
  const pb = odds(b);
  if (!pa || !pb) return null;
  return devigProportional([1 / pa, 1 / pb]);
}

// Fair chances of a three-way winner (soccer): { home, draw, away }.
function fairThree(one, cross, two) {
  const [a, b, c] = [odds(one), odds(cross), odds(two)];
  if (!a || !b || !c) return null;
  const [home, draw, away] = devigProportional([1 / a, 1 / b, 1 / c]);
  return { home, draw, away };
}

// Upcoming matches of one league: games shaped like the rest of the page's
// ({ id, sport, startUtc, away, home, draftKings: fair win chances, total,
// spread }), with `book: 'kambi'`. `unpriced`: a match Kambi lists without a
// winner price is sold too, at the house's price (even players, a home side's
// usual edge: Kambi's list is all that's known of them), for leagues whose
// only schedule is Kambi's (the others have their own, schedules.mjs).
export function parseKambiEvents(data, sport, now = new Date(), { unpriced = false } = {}) {
  const games = [];
  for (const item of data?.events || []) {
    const e = item.event;
    // (Past its time but not begun, for up to 45 minutes: kept for the board to decide, play-sources.mjs stillToCome.)
    if (!e || e.state !== 'NOT_STARTED' || Date.parse(e.start) <= now.getTime() - 45 * 60_000) continue;
    if (!e.homeName || !e.awayName) continue;
    const offers = item.betOffers || [];
    const match = matchOffer(offers);
    // Two-way winner; a three-way one (a draw after regulation) is split
    // between the two, but soccer keeps its draw.
    const soccer = LEAGUES[sport]?.family === 'soccer';
    const three = soccer && match && fairThree(outcome(match, 'OT_ONE'), outcome(match, 'OT_CROSS'), outcome(match, 'OT_TWO'));
    const win = three ? [three.home, three.away] : match && !soccer && fairPair(outcome(match, 'OT_ONE'), outcome(match, 'OT_TWO'));
    if (!win && !unpriced) continue;
    const game = {
      id: `${sport}_${e.start.slice(0, 13)}_${normalizeTeamName(e.awayName)}_${normalizeTeamName(e.homeName)}`.replaceAll(' ', ''),
      sport,
      startUtc: new Date(e.start).toISOString(),
      away: { en: e.awayName, zh: teamZh(sport, e.awayName) },
      home: { en: e.homeName, zh: teamZh(sport, e.homeName) },
      draftKings: three || (win ? { home: win[0], away: win[1] } : null),
      house: win ? null : housePrices(sport, e.awayName, e.homeName, null),
      polymarket: null,
      polymarketLiquidity: null,
      total: null,
      spread: null,
      book: 'kambi',
      kambiId: e.id,
      group: e.group || '',
      // Soccer from Kambi settles on the final score alone: no halves.
      ...(soccer ? { scoreOnly: true } : {})
    };
    const handicap = offers.find(o => o.betOfferType?.englishName === 'Handicap');
    if (handicap) {
      const home = outcome(handicap, 'OT_ONE');
      const away = outcome(handicap, 'OT_TWO');
      const fair = fairPair(away, home);
      if (fair && away?.line != null) game.spread = { awayLine: away.line / 1000, awayFair: fair[0] };
    }
    const total = offers.find(o => o.betOfferType?.englishName === 'Over/Under');
    if (total) {
      const over = outcome(total, 'OT_OVER');
      const fair = fairPair(over, outcome(total, 'OT_UNDER'));
      // (NHL's is its 60 minutes': no overtime goal in it, markets.mjs fitHockey.)
      if (fair && over?.line != null) game.total = { line: over.line / 1000, overFair: fair[0], ...(/regular time/i.test(total.criterion?.englishLabel || total.criterion?.label || '') ? { regulation: true } : {}) };
    }
    games.push(game);
  }
  return games.sort((a, b) => a.startUtc.localeCompare(b.startUtc));
}

export async function fetchKambiLeague(key, now = new Date(), getJson) {
  const league = LEAGUES[key];
  return parseKambiEvents(await getJson(kambiUrl(league.kambi), 'kambi-events'), key, now, { unpriced: !league.schedule });
}

// ---- In play -------------------------------------------------------------------

// Only prices open to bet (a suspended outcome has no odds, or its old ones).
const open = o => o && (o.status == null || o.status === 'OPEN') && odds(o);
// Whole-game lines only: not a set's, a quarter's, an inning's, a team's or the next point's.
const PART = /\b(\d(st|nd|rd|th)|set|frame|game \d|quarter|half|inning|period|by|next|race|odd|even|regular time)\b/i;
// Hockey's are its 60 minutes' (Regular Time), as they're settled.
const wholeLine = (family, label) => (family === 'hockey' ? /regular time$/i.test(label) && !/\b(period|by)\b/i.test(label) : !PART.test(label));

// A league's matches in play (listView …/in-play.json): each with Kambi's
// live prices, the margin taken out (winner; for baseball and basketball the
// main handicap and total), and the score: runs or points. Neither side priced
// (between points, a review): `ml` null, shown without bets.
export function parseKambiInPlay(data, sport) {
  const league = LEAGUES[sport];
  // Every team sport has a main total live; a handicap where its lines are
  // whole games' (not soccer's Asian ones).
  const family = league?.family;
  const handicaps = ['baseball', 'basketball', 'football', 'hockey'].includes(family);
  const games = [];
  for (const item of data?.events || []) {
    const e = item.event;
    if (!e || e.state !== 'STARTED' || !e.homeName || !e.awayName) continue;
    const offers = item.betOffers || [];
    // Hockey's winner is its 60 minutes' (regular time), three ways.
    const hockey = family === 'hockey';
    const match = hockey ? offers.find(o => isMatch(o) && wholeLine(family, o.criterion?.englishLabel || '')) : matchOffer(offers);
    const one = outcome(match || { outcomes: [] }, 'OT_ONE');
    const two = outcome(match || { outcomes: [] }, 'OT_TWO');
    // Soccer's live winner has a draw: all three open, or none sold.
    const cross = outcome(match || { outcomes: [] }, 'OT_CROSS');
    const three = (family === 'soccer' || hockey) && open(one) && open(cross) && open(two) ? fairThree(one, cross, two) : null;
    const win = family !== 'soccer' && !hockey && open(one) && open(two) ? fairPair(one, two) : null;
    const game = {
      kambiId: e.id,
      sport,
      startUtc: new Date(e.start).toISOString(),
      away: e.awayName,
      home: e.homeName,
      group: e.group || '',
      ml: three ?? (win ? { home: win[0], away: win[1] } : null),
      spread: null,
      total: null
    };
    // Whole numbers push only where a push is usual (points).
    const lineOk = line => line != null && (Math.abs((line / 1000) % 1) === 0.5 || ['basketball', 'football'].includes(family));
    if (handicaps) {
      const handicap = offers.find(o => o.betOfferType?.englishName === 'Handicap' && wholeLine(family, o.criterion?.englishLabel || ''));
      const home = handicap && outcome(handicap, 'OT_ONE');
      const away = handicap && outcome(handicap, 'OT_TWO');
      if (open(home) && open(away) && lineOk(away.line)) game.spread = { awayLine: away.line / 1000, awayFair: fairPair(away, home)[0] };
    }
    const total = offers.find(o => o.betOfferType?.englishName === 'Over/Under' && wholeLine(family, o.criterion?.englishLabel || ''));
    const over = total && outcome(total, 'OT_OVER');
    const under = total && outcome(total, 'OT_UNDER');
    if (open(over) && open(under) && lineOk(over.line)) game.total = { line: over.line / 1000, overFair: fairPair(over, under)[0] };
    const live = item.liveData || {};
    const score = { home: Number(live.score?.home) || 0, away: Number(live.score?.away) || 0 };
    Object.assign(game, { homeScore: score.home, awayScore: score.away });
    if (league?.family === 'baseball') game.inningNo = kambiPeriods(live.score?.info).home.length || null;
    if (league?.family === 'basketball') game.quarter = Number(/(\d)/.exec(live.matchClock?.periodId || '')?.[1]) || null;
    games.push(game);
  }
  return games.sort((a, b) => a.startUtc.localeCompare(b.startUtc));
}

// ---- Live scores ---------------------------------------------------------------

// Every match Kambi has in play: kambiId -> { state, home, away, score }.
export function parseKambiLive(data) {
  const out = new Map();
  for (const item of data?.liveEvents || []) {
    const e = item.event;
    const live = item.liveData || {};
    if (!e) continue;
    out.set(e.id, {
      state: e.state,
      home: e.homeName,
      away: e.awayName,
      score: { home: Number(live.score?.home) || 0, away: Number(live.score?.away) || 0 }
    });
  }
  return out;
}

// ---- Results ---------------------------------------------------------------------
//
// A match's own live data (event/{id}/livedata.json) stays readable for a day
// or more after it ends, still marked as started: Kambi never says "final"
// in public. So the result is read from the score itself: baseball and basketball once the
// regulation innings or quarters are played, the score isn't level (or
// baseball's extra innings have run out) and it hasn't changed for a while.

// Shared-Proxy's /kambi: it keeps the last live data of the matches bets are
// on after Kambi drops them (a few hours after the end). Sportsbook tells it
// which matches to watch, and reads its copy when Kambi's is gone.
export const KAMBI_WATCH_URL = 'https://orbit-workers-proxy.pengzjay.workers.dev/kambi';
// The Quadra session token, when signed in (counted per session, not per IP).
let tokenOf = () => '';
export const useKambiToken = fn => (tokenOf = fn);
const signed = url => (tokenOf() ? `${url}${url.includes('?') ? '&' : '?'}qt=${encodeURIComponent(tokenOf())}` : url);
const watched = new Set();
export async function watchKambiMatches(legs) {
  const events = legs.filter(l => l.kambiId && l.start && !watched.has(String(l.kambiId))).map(l => ({ id: String(l.kambiId), start: l.start }));
  if (!events.length) return;
  for (const e of events) watched.add(e.id);
  await fetch(signed(KAMBI_WATCH_URL), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ events: events.slice(0, 30) }), signal: AbortSignal.timeout(15_000) }).catch(() => {
    for (const e of events) watched.delete(e.id);
  });
}
// The Worker's copies: id -> { live, gone, seen }.
export async function fetchKeptKambi(ids) {
  if (!ids.length) return new Map();
  const res = await fetch(signed(`${KAMBI_WATCH_URL}?ids=${ids.slice(0, 30).map(encodeURIComponent).join(',')}`), { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) return new Map();
  const data = await res.json().catch(() => ({}));
  return new Map(Object.entries(data.results || {}));
}

