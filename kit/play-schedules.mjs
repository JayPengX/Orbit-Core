// Kambi's leagues sell every game on their own schedules, not only the ones
// Kambi prices yet: a game Kambi hasn't priced is the house's to price
// (house.mjs), from what each schedule knows.
//
//   NPB, KBO, CPBL   the leagues' own month lists (the kit's asiaMonth), each
//                    club's strength from this season's results in them;
//                    settled from the same lists, which have final scores
//                    only (so only markets a final score settles: `scoreOnly`)
//   the rest         Kambi's own list, a match it lists without a price
//                    (kambi.mjs)
//
// Games come out shaped like parseEspnScoreboard's (names as strings,
// `outcomes: null`, the house's chances as `house`), so mergeGames makes them
// board games like any other.
import { housePrices, strengths } from '#kit/play-house.mjs';
import { normalizeTeamName } from '#kit/play-teams.mjs';

const game = (sport, startUtc, away, home, house, extra = {}) => ({ sport, startUtc: new Date(startUtc).toISOString(), away, home, neutral: false, preseason: false, outcomes: null, total: null, spread: null, house, ...extra });

// Asian baseball: each club's results in the month lists (games over) as
// { wins, games }.
export function asiaRecords(games) {
  const out = new Map();
  const add = (name, won) => {
    const key = normalizeTeamName(name);
    const r = out.get(key) || { wins: 0, games: 0 };
    out.set(key, { wins: r.wins + won, games: r.games + 1 });
  };
  for (const g of games || []) {
    if (g.state !== 'post' || g.homeScore == null || g.awayScore == null) continue;
    const h = Number(g.homeScore);
    const a = Number(g.awayScore);
    add(g.home.en, h > a ? 1 : h === a ? 0.5 : 0);
    add(g.away.en, a > h ? 1 : h === a ? 0.5 : 0);
  }
  return out;
}

// The games still to come in the month lists (`games` every month read,
// finished ones too, for the clubs' records).
export function parseAsiaSchedule(games, sport, now = new Date()) {
  const table = strengths(sport, asiaRecords(games), new Map());
  return (games || [])
    .filter(g => g.state === 'pre' && Date.parse(g.start) > now.getTime() && g.home?.en && g.away?.en)
    .map(g => game(sport, g.start, g.away.en, g.home.en, housePrices(sport, g.away.en, g.home.en, table), { scoreOnly: true, asiaId: g.id }));
}
