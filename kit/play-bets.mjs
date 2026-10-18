// Quadra Play's bets with their prices: everything its board sells, priced,
// without names. One copy for Play (app.js names each bet: chip, label,
// shortLabel, matchup) and the Worker, which prices a placed bet again with
// it and refuses one sold better than this (Shared-Proxy settle.js).
import { gameOptions, offerOptions, f1Podium, f1Markets, f1PoleFromWinner, f1PoleModel } from '#kit/play-board.mjs';
import { estimateF1Odds, f1Phase, estimateFuturesOdds, FUTURES_OVERROUND, ODDS_ERROR, median, estimateLineOdds, MLB_MARKET_OVERROUND } from '#kit/play-odds.mjs';
import { withRules, houseCut } from '#kit/play-rules.mjs';
import { f1Driver, normalizeTeamName, familyOf, teamZh } from '#kit/play-teams.mjs';
import { inningsLeft, liveBaseball, liveSoccer, liveGoals, livePoints, fitGoals, liveMarkets, liveOdds, pregameRuns, nextRunChances, nextRunOdds, LIVE_THREE_WAY } from '#kit/play-live.mjs';
import { fitHockey } from '#kit/play-markets.mjs';

// The lottery's locks and parlay-only rules (rules.mjs), on every pick
// (board.mjs already applies them to games; F1 and live picks here).
export function withHouseRules(bets) {
  for (const b of bets) withRules(b);
  return bets;
}

// The next race's bets: the winner, the podium, top six and ten, teammates
// head to head, the winning team, pole until qualifying starts, and the
// safety car, VSC and red flag. `memo` keeps the 40,000 drawn races for
// these prices (f1Markets) between calls. Sets f1.phase.
export function f1Bets(f1, { now = new Date(), memo = {}, loadedAt = null } = {}) {
  const bets = [];
  // Before or after qualifying (said beside the prices; the math is the same).
  const phase = f1Phase(now, { qualifyingUtc: f1.qualifyingUtc, raceUtc: f1.startUtc });
  f1.phase = phase;
  for (const d of f1.drivers) {
    bets.push({
      id: `f1|${d.name}`,
      gameId: 'f1',
      kind: 'f1',
      sport: 'f1',
      start: f1.startUtc,
      driverEn: d.name,
      driver: f1Driver(d.name),
      fairChance: d.fair,
      fairMargin: null,
      errKey: `${phase === 'pre' ? 'f1Pre' : 'f1'}${d.fair < 0.01 ? 'Longshot' : ''}`,
      // Never longer than the bookmaker's own price (2026-10's 美國站: Gasly 301 at Kambi, 500 here from the devigged chance).
      estOdds: Math.min(estimateF1Odds(d.fair), d.book > 1 ? d.book : Infinity)
    });
  }
  // 前三名: the same drivers finishing in the top three.
  const winners = bets.filter(b => b.kind === 'f1');
  f1Podium(winners.map(b => ({ fair: b.fairChance, odds: b.estOdds }))).forEach((p, i) => {
    const w = winners[i];
    bets.push({ ...w, id: `f1pod|${w.driverEn}`, gameId: `f1pod|${w.driverEn}`, kind: 'f1podium', market: `f1podium|${w.driverEn}`, fairChance: p.fair, estOdds: p.odds, errKey: 'extra', lock: p.lock, minLegs: p.minLegs });
  });
  // Top six, top ten, teammates head to head and the winning team.
  const field = winners.map(b => ({ fair: b.fairChance, odds: b.estOdds, team: b.driver.team }));
  // (40,000 drawn races: once for these prices, not on every redraw.)
  const fieldKey = JSON.stringify(field);
  if (memo.key !== fieldKey) Object.assign(memo, { key: fieldKey, more: f1Markets(field) });
  const more = memo.more;
  for (const [key, list] of [['f1top6', more.top6], ['f1top10', more.top10]])
    list.forEach((p, i) => {
      const w = winners[i];
      bets.push({ ...w, id: `${key}|${w.driverEn}`, gameId: `${key}|${w.driverEn}`, kind: key, market: `${key}|${w.driverEn}`, fairChance: p.fair, estOdds: p.odds, errKey: 'extra', lock: p.lock, minLegs: p.minLegs });
    });
  for (const p of more.h2h) {
    const w = winners[p.driver];
    const r = winners[p.rival];
    const pair = [w.driverEn, r.driverEn].sort().join('|');
    bets.push({ ...w, id: `f1h2h|${w.driverEn}|${r.driverEn}`, gameId: `f1h2h|${pair}`, kind: 'f1h2h', market: `f1h2h|${pair}`, rival: r.driverEn, rivalDriver: r.driver, settle: { rival: r.driverEn }, fairChance: p.fair, estOdds: p.odds, errKey: 'extra', lock: p.lock, minLegs: p.minLegs });
  }
  for (const p of more.teams) {
    bets.push({ id: `f1team|${p.team}`, gameId: 'f1team', kind: 'f1team', sport: 'f1', market: 'f1team', start: f1.startUtc, team: p.team, fairChance: p.fair, estOdds: p.odds, errKey: 'extra', lock: p.lock, minLegs: p.minLegs });
  }
  // 排位賽第一 (pole position), until qualifying starts: our own estimate
  // (the season's qualifying form and the race winner's chances), with
  // Polymarket's or Kambi's prices counted as far as they're traded and
  // tell the drivers apart (board.mjs f1PoleModel).
  if (f1.qualifyingUtc && (Date.parse(f1.qualifyingUtc) > now.getTime() || f1.qualifyingWaits)) {
    const model = f1PoleModel({ form: f1.qualiForm || [], winners: f1.drivers || [], market: f1.pole });
    const pole = model.drivers.length ? model.drivers : f1PoleFromWinner(f1.drivers);
    for (const d of pole) {
      const w = winners.find(b => normalizeTeamName(b.driverEn) === normalizeTeamName(d.name));
      bets.push({
        id: `f1pole|${d.name}`,
        gameId: 'f1pole',
        kind: 'f1pole',
        sport: 'f1',
        market: 'f1pole',
        start: f1.qualifyingUtc,
        // (Its qualifying late: sold for 2 minutes from the read that saw it hadn't begun; the next read says again.)
        ...(f1.qualifyingWaits ? { waitsUntil: Date.parse(loadedAt || '') + 2 * 60_000 || now.getTime() + 2 * 60_000 } : {}),
        driverEn: d.name,
        driver: w?.driver ?? f1Driver(d.name),
        poleSource: model.marketWeight >= 0.5 ? f1.pole?.source ?? 'model' : 'model',
        fairChance: d.fair,
        fairMargin: null,
        errKey: f1.pole ? `f1Pre${d.fair < 0.01 ? 'Longshot' : ''}` : 'extra',
        estOdds: estimateF1Odds(d.fair)
      });
    }
  }
  // Safety car, virtual safety car, red flag: yes or no, priced like a
  // two-way game line.
  for (const key of ['sc', 'vsc', 'red']) {
    const flag = f1.flags?.[key];
    if (!flag) continue;
    for (const pick of ['yes', 'no']) {
      const fair = pick === 'yes' ? flag.fair : 1 - flag.fair;
      bets.push({ id: `f1${key}|${pick}`, gameId: `f1${key}`, kind: `f1${key}`, sport: 'f1', market: `f1${key}`, start: f1.startUtc, pick, settle: { pick }, flagSource: flag.source, fairChance: fair, estOdds: estimateLineOdds(fair, MLB_MARKET_OVERROUND), errKey: 'extra' });
    }
  }
  return bets;
}

// Single-source games: the typical DraftKings-Polymarket gap of that sport.
export function fillTypicalMargins(bets) {
  for (const sport of new Set(bets.map(b => b.sport))) {
    const gaps = bets.filter(b => b.sport === sport && b.fairMargin != null).map(b => b.fairMargin);
    const typical = median(gaps) ?? 0.02;
    for (const b of bets) if (b.sport === sport && b.fairMargin == null && (b.kind === 'ml' || b.kind === 'total')) Object.assign(b, { fairMargin: typical, typicalMargin: true });
  }
  return bets;
}

// The board's bets: every game's options (`optionsOf`: board.mjs gameOptions,
// or Play's memo of it), the next race's, the typical margins and the house's
// rules. `name(game, option)` names each game's option (Play's); F1's are
// named by the caller after.
export function boardBets(data, { optionsOf = gameOptions, name = (game, o) => o, now = new Date(), memo = {} } = {}) {
  const bets = [];
  for (const game of data.games) for (const o of optionsOf(game)) bets.push(name(game, o));
  if (data.f1) bets.push(...f1Bets(data.f1, { now, memo, loadedAt: data.loadedAt }));
  return withHouseRules(fillTypicalMargins(bets));
}

// One bet per team of every championship market.
export function futureBets(futures) {
  return withHouseRules(
    (futures || []).flatMap(market => {
      const odds = estimateFuturesOdds(market.teams.map(team => team.fair), FUTURES_OVERROUND[market.key] ?? FUTURES_OVERROUND[market.sport] ?? FUTURES_OVERROUND.other);
      return market.teams.map((team, i) => ({
        id: `fut|${market.key}|${team.name.en}`,
        gameId: `fut|${market.key}`,
        kind: 'future',
        market: market.key,
        sport: market.sport,
        futureMarket: market,
        futureTeam: team,
        teamEn: team.name.en,
        eventSlug: market.slug,
        fairChance: team.fair,
        fairMargin: null,
        errKey: ODDS_ERROR[`future_${market.key}`] ? (team.fair < 0.004 && market.sport !== 'nba' ? 'futureLongshot' : `future_${market.key}`) : 'futureOther',
        estOdds: odds[i]
      }));
    })
  );
}

// ---- Live (場中) ----------------------------------------------------------------

// Kambi's live prices for one match (Asian baseball, EuroLeague, K League),
// at the house's live cut.
export function kambiLiveBets(game, g, base) {
  const bets = [];
  const k = houseCut({ base: 'live', sport: game.sport });
  const common = { ...base, fairMargin: null, errKey: 'liveOther', cut: k };
  if (g.ml) {
    // Soccer's three results at the live three-way cut.
    const k3 = houseCut({ base: LIVE_THREE_WAY, sport: game.sport });
    for (const side of g.ml.draw != null ? ['home', 'draw', 'away'] : ['away', 'home']) {
      const cut = side === 'draw' || g.ml.draw != null ? k3 : k;
      bets.push({ ...common, cut, id: `${game.id}|ml|${side}`, kind: 'ml', side, market: 'ml', posted: true, fairChance: g.ml[side], estOdds: liveOdds(g.ml[side], cut) });
    }
  }
  if (g.spread) {
    const { awayLine, awayFair } = g.spread;
    for (const side of ['away', 'home']) {
      const line = side === 'away' ? awayLine : -awayLine;
      const p = side === 'away' ? awayFair : 1 - awayFair;
      bets.push({ ...common, id: `${game.id}|rl|${line}|${side}`, kind: 'runline', side, market: `rl|${awayLine}`, posted: true, runLine: line, awayLine, giver: awayLine < 0 ? 'away' : 'home', fairChance: p, estOdds: liveOdds(p, k) });
    }
  }
  if (g.total) {
    const { line, overFair } = g.total;
    for (const side of ['over', 'under']) {
      const p = side === 'over' ? overFair : 1 - overFair;
      bets.push({ ...common, id: `${game.id}|tot|${line}|${side}`, kind: 'total', side, market: `total|${line}`, posted: true, totalLine: line, mainLine: true, fairChance: p, estOdds: liveOdds(p, k) });
    }
  }
  return bets;
}

// An open live game's own Kambi markets (lines, halves, players …), when
// they've been read (`offersOf(game)`): each kind Kambi prices takes the
// model's place.
function liveOfferBets(game, bets, offersOf) {
  const offers = offersOf(game);
  if (!offers) return [];
  const real = offerOptions(game, offers, { live: true }).filter(o => o.kind !== 'ml').map(o => ({ ...o, fromOffers: true }));
  const kinds = new Set(real.map(b => b.kind));
  for (let i = bets.length - 1; i >= 0; i--) if (bets[i].gameId === game.id && kinds.has(bets[i].kind)) bets.splice(i, 1);
  return real;
}

// Every live game as a game card's data, and its bets at live odds.
export function liveBets(data, { offersOf = () => null } = {}) {
  const games = [];
  const bets = [];
  for (const g of data?.kambi ?? []) {
    const game = {
      id: `live|${g.sport}|k${g.kambiId}`,
      kambiId: g.kambiId,
      sport: g.sport,
      startUtc: g.startUtc,
      away: { en: g.away, zh: teamZh(g.sport, g.away) },
      home: { en: g.home, zh: teamZh(g.sport, g.home) },
      group: g.group || '',
      live: { ...g, book: 'kambi' }
    };
    games.push(game);
    bets.push(...kambiLiveBets(game, g, { gameId: game.id, game, sport: g.sport, start: g.startUtc, live: true }));
    bets.push(...liveOfferBets(game, bets, offersOf));
  }
  for (const g of data?.games ?? []) {
    const pre = g.pregame;
    const family = familyOf(g.sport);
    let dist = null;
    let markets = null;
    // No pregame line (the model has nothing to go on): Kambi's live prices alone.
    if (!pre) {
      if (!g.kambi) continue;
    } else if (family === 'baseball') {
      if (!pre.totalLine && !g.kambi) continue;
      if (pre.totalLine) {
        const means = pregameRuns({ homeWin: pre.homeWin, totalLine: pre.totalLine, overFair: pre.overFair });
        const left = inningsLeft(g);
        dist = liveBaseball({ means, awayScore: g.awayScore, homeScore: g.homeScore, awayLeft: left.away, homeLeft: left.home });
      }
    } else if (family === 'soccer') {
      if (!(pre.draw > 0) && !g.kambi) continue;
      if (pre.draw > 0) dist = liveSoccer({ means: fitGoals(pre.homeWin, pre.awayWin), awayScore: g.awayScore, homeScore: g.homeScore, minutesLeft: 90 - g.minute });
    } else if (family === 'hockey') {
      const total = pre.totalLine ? { line: pre.totalLine, overFair: pre.overFair } : null;
      dist = g.left > 0.01 ? liveGoals({ means: fitHockey(pre.homeWin, total), awayScore: g.awayScore, homeScore: g.homeScore, share: g.left }) : null;
    } else markets = livePoints({ sport: g.sport, pre, awayScore: g.awayScore, homeScore: g.homeScore, left: g.left });
    const game = {
      id: `live|${g.sport}|${g.espnId}`,
      espnId: g.espnId,
      sport: g.sport,
      startUtc: g.startUtc,
      away: { en: g.away, zh: teamZh(g.sport, g.away) },
      home: { en: g.home, zh: teamZh(g.sport, g.home) },
      ...(g.kambi?.kambiId ? { kambiId: g.kambi.kambiId } : {}),
      live: { ...g, pmWin: g.pm?.awayWin ?? null }
    };
    games.push(game);
    // Rain delay or suspended: no live odds until play resumes.
    if (g.delayed) continue;
    const base = { gameId: game.id, game, sport: g.sport, start: g.startUtc, live: true, fairMargin: null, errKey: g.sport === 'mlb' ? 'live' : family === 'soccer' ? 'liveSoccer' : 'liveOther' };
    // The live cut (soccer's winner at its three-way one), more for the leagues the house knows less.
    const cut = { ml: houseCut({ base: family === 'soccer' ? LIVE_THREE_WAY : 'live', sport: game.sport }), other: houseCut({ base: 'live', sport: game.sport }) };
    for (const m of markets ?? (dist ? liveMarkets(dist, { sport: g.sport, awayScore: g.awayScore, homeScore: g.homeScore, pm: g.pm }) : [])) {
      const k = m.kind === 'ml' ? cut.ml : cut.other;
      const common = { ...base, kind: m.kind, side: m.side, market: m.market, posted: m.posted, fairChance: m.fair, cut: k, estOdds: liveOdds(m.fair, k) };
      if (m.kind === 'ml') bets.push({ ...common, id: `${game.id}|ml|${m.side}` });
      else if (m.kind === 'total') bets.push({ ...common, id: `${game.id}|tot|${m.line}|${m.side}`, totalLine: m.line, mainLine: m.main });
      else if (m.kind === 'runline') bets.push({ ...common, id: `${game.id}|rl|${m.line}|${m.side}`, runLine: m.line, awayLine: m.awayLine, giver: m.giver });
      else if (m.kind === 'teamtotal') bets.push({ ...common, id: `${game.id}|tt|${m.team}|${m.line}|${m.side}`, team: m.team, teamLine: m.line });
    }
    // Kambi's live prices take the place of the model's where it has them.
    if (g.kambi) {
      const real = kambiLiveBets(game, g.kambi, { gameId: game.id, game, sport: g.sport, start: g.startUtc, live: true });
      const kinds = new Set(real.map(b => b.kind));
      for (let i = bets.length - 1; i >= 0; i--) if (bets[i].gameId === game.id && kinds.has(bets[i].kind)) bets.splice(i, 1);
      bets.push(...real);
    }
    // 第N分: the next two runs of the game.
    if (g.sport === 'mlb' && pre?.totalLine) {
      const means = pregameRuns({ homeWin: pre.homeWin, totalLine: pre.totalLine, overFair: pre.overFair });
      for (const ahead of [1, 2]) {
        const n = g.awayScore + g.homeScore + ahead;
        const chances = nextRunChances({ means, state: g, runsAhead: ahead });
        for (const side of ['away', 'none', 'home']) {
          bets.push({ ...base, id: `${game.id}|nr|${n}|${side}`, kind: 'nextrun', side, runN: n, market: `nr|${n}`, posted: true, fairChance: chances[side], estOdds: nextRunOdds(chances[side]), errKey: 'liveNextRun' });
        }
      }
    }
    bets.push(...liveOfferBets(game, bets, offersOf));
  }
  return { games, bets: withHouseRules(bets) };
}

// ---- A pick as a slip keeps it ----------------------------------------------
//
// What a slip keeps of a bet (Play's legRecord, less its price and picture):
// everything settling reads (kit/settle.mjs legResult, readOutcomes) and the
// names it shows. The proxy builds a placed slip's picks from its own bets
// with this (price.js), so a pick settles on the bet that was priced, never
// on terms a phone sent (the money lock-down, 2026-10-14).
export function legOf(bet) {
  return {
    id: bet.id,
    gameId: bet.gameId ?? undefined,
    market: bet.gameId ? bet.market ?? bet.kind : undefined,
    kind: bet.kind,
    sport: bet.sport,
    label: bet.label,
    shortLabel: bet.shortLabel,
    matchup: bet.matchup,
    start: bet.start ?? null,
    fairChance: bet.fairChance,
    side: bet.side ?? null,
    line: bet.totalLine ?? bet.runLine ?? bet.teamLine ?? bet.runN ?? null,
    inning: bet.inning ?? null,
    away: bet.game?.away.en ?? null,
    home: bet.game?.home.en ?? null,
    driver: bet.driverEn ?? null,
    eventSlug: bet.eventSlug ?? null,
    live: bet.live ? true : undefined,
    kambiId: bet.game?.kambiId ?? undefined,
    ...(bet.settle ?? {}),
    team: bet.kind === 'future' ? bet.teamEn : bet.settle?.team ?? bet.team ?? null
  };
}
