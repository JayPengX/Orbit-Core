// Quadra Play's home board as one file (/data/play/board.json): what the first
// screen draws, built by the proxy on its cron (Shared-Proxy builders/play.js)
// with the same pricing the phone runs (play-sources, play-board), so a price
// on the file is the price the phone would have worked out itself. One copy
// of its shape for both ends: the Worker packs it, Play unpacks it.
//
//   v        the shape's version (a phone on another version ignores the file)
//   built    when it was read (ISO); a phone older than BOARD_STALE_MS
//            reads the leagues itself, as before
//   until    the games on it start before this
//   covered  the leagues read this time, whole for that window; `missed` the
//            ones that weren't (the phone reads those itself)
//   counts   games still to come in a covered league within SOLD_DAYS (the
//            sport tiles' numbers), `f1` 1 when a race is on sale, 0 when
//            none was found (or its sources couldn't be read: the phone's
//            own read of the race settles it), null when it wasn't tried
//   live     the leagues that may have a game on now (loadLive's `also`)
//   games    each game to come within the window: the names the home draws,
//            and `p`, its picks: the winner (every side) and what 為你推薦
//            chooses from (the posted handicaps, the two best tagged ones),
//            as the kit priced them
//   lottery  Taiwan Lottery's next draws and the jackpots carried over: what
//            the 彩券 tab's header reads (`upcoming`, `latest`)
//
// Only picks the home can name from the pick alone are kept (winners,
// handicaps, totals); a game's other markets come with the game's own
// page, read when it's opened.
export const BOARD_V = 1;
export const BOARD_PATH = 'play/board.json';
// Games within this many hours (为你推薦's usual horizon, FOR_YOU.horizonH).
export const BOARD_HOURS = 72;
// Older than this the file isn't used.
export const BOARD_STALE_MS = 30 * 60_000;

export const boardUsable = (file, now = Date.now()) => file?.v === BOARD_V && Array.isArray(file.games) && Number.isFinite(Date.parse(file.built)) && now - Date.parse(file.built) <= BOARD_STALE_MS && Date.parse(file.built) <= now + 5 * 60_000;

// The kinds named from the pick alone (Play's `named`: no market object).
const NAMEABLE = new Set(['ml', 'total', 'runline', 'teamtotal']);
// What a pick on the file leaves to its game or to the phone.
const LEFT = new Set(['id', 'gameId', 'sport', 'start', 'game', 'cut', 'fairMargin', 'errKey', 'typicalMargin', 'm', 'pick']);
const round4 = x => Math.round(x * 1e4) / 1e4;

// The picks of a game the home keeps: every winner, the posted handicaps (what
// 為你推薦 puts on a team it follows when the winner is too short), and the
// two best tagged others (its other choice).
export function homePicks(bets, recs) {
  const usable = bets.filter(b => NAMEABLE.has(b.kind));
  const base = usable.filter(b => b.kind === 'ml' || (b.kind === 'runline' && b.posted));
  const have = new Set(base);
  const best = usable
    .filter(b => !have.has(b) && !b.lock && recs.has(b.id))
    .sort((a, b) => recs.get(b.id).back - recs.get(a.id).back)
    .slice(0, 2);
  return [...base, ...best];
}

// What a pick's id (the game's id left off) says of it, in the fields the kit
// gives it. Baseball and soccer: the winner (`ml|home`), a total (`tot|2.5|over`),
// a handicap (`rl|-1.5|away`: by the pick's own line, so `rl|1.5|home` is the
// other side of it), a team's total (`tt|home|1.5|over`). The others carry the kind and the
// market in it (`total|total|212.5|over`, `runline|rl|-2.5|away` by the away side's line,
// `teamtotal|tt|home|105.5|over`). Anything else says nothing.
export function fieldsOf(i) {
  const [kind, x, y, z, w] = i.split('|');
  const num = v => (v !== undefined && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null);
  if (kind === 'ml' && x) return { kind: 'ml', side: x, market: 'ml' };
  if (kind === 'tot' && y && num(x) != null) return total(num(x), y);
  if (kind === 'rl' && y && num(x) != null) return handicap(y === 'away' ? num(x) : -num(x), y);
  if (kind === 'tt' && z && num(y) != null) return teamTotal(x, num(y), z);
  if (kind === 'total' && x === 'total' && z && num(y) != null) return total(num(y), z);
  if (kind === 'runline' && x === 'rl' && z && num(y) != null) return handicap(num(y), z);
  if (kind === 'teamtotal' && x === 'tt' && w && num(z) != null) return teamTotal(y, num(z), w);
  return {};
}
const total = (totalLine, side) => ({ kind: 'total', side, totalLine, market: `total|${totalLine}` });
const teamTotal = (team, teamLine, side) => ({ kind: 'teamtotal', side, team, teamLine, market: `tt|${team}|${teamLine}` });
const handicap = (awayLine, side) => ({ kind: 'runline', side, runLine: side === 'away' ? awayLine : -awayLine, awayLine, giver: awayLine < 0 ? 'away' : 'home', market: `rl|${awayLine}` });
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// A pick as the file keeps it: its id (less its game's), what it says that its id doesn't, its tag.
function packPick(o, game, recs) {
  const i = o.id.slice(game.id.length + 1);
  const said = fieldsOf(i);
  const out = { i };
  for (const [k, v] of Object.entries(o)) {
    if (LEFT.has(k) || v === undefined || v === null || v === false || (k in said && same(said[k], v))) continue;
    if (k === 'minLegs' && v === 1) continue;
    out[k] = k === 'fairChance' ? round4(v) : v;
  }
  const tag = recs.get(o.id)?.tag;
  if (tag) out.tag = tag;
  return out;
}

// The games starting within `hours` of `now`, each with its picks:
// `bets`: the whole board's (boardBets), `recs`: recommend()'s tags over them.
export function packGames({ games, bets, recs, now = Date.now(), hours = BOARD_HOURS }) {
  const byGame = new Map();
  for (const b of bets) if (b.gameId) byGame.set(b.gameId, [...(byGame.get(b.gameId) || []), b]);
  const out = [];
  for (const g of games) {
    const start = Date.parse(g.startUtc);
    if (!(start > now && start <= now + hours * 3_600_000)) continue;
    const picks = homePicks(byGame.get(g.id) || [], recs);
    if (!picks.length) continue;
    out.push({
      id: g.id,
      sport: g.sport,
      startUtc: g.startUtc,
      away: { en: g.away.en, zh: g.away.zh },
      home: { en: g.home.en, zh: g.home.zh },
      ...(g.timeTbd ? { timeTbd: true } : {}),
      p: picks.map(o => packPick(o, g, recs))
    });
  }
  return out.sort((a, b) => a.startUtc.localeCompare(b.startUtc) || a.id.localeCompare(b.id));
}

// The file's games and picks as Play holds them: `games` (as state.data.games
// lists them, less what the home doesn't draw), `bets` (each named by Play as
// any other; `game` is its game here), `recs` (id → { tag }, as recommend()'s).
export function unpackBoard(file) {
  const games = [];
  const bets = [];
  const recs = new Map();
  for (const { p, ...g } of file.games || []) {
    games.push(g);
    for (const { i, tag, ...rest } of p) {
      const id = `${g.id}|${i}`;
      bets.push({ lock: null, minLegs: 1, ...fieldsOf(i), ...rest, id, gameId: g.id, sport: g.sport, start: g.startUtc, game: g });
      if (tag) recs.set(id, { tag });
    }
  }
  return { games, bets, recs };
}
