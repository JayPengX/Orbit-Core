// Quadra Play's home board, built once for everyone (/data/play/board.json):
// what a phone reads first, instead of working it out from some hundred reads
// of ESPN, Kambi and Polymarket on every open (8.5 s, and a dozen of this
// Worker's requests a phone). Built on the proxy's even-minute cron (run.js,
// every ten minutes) with the very code the phone prices with (kit/play-*),
// read through the data proxy's route (its trims and edge cache), so a price
// on the file is the price the phone would have worked out.
//
// Its shape and what it keeps: kit/play-boardfile.mjs. Each league is read on
// its own: one that can't be is left out (`missed`; the phone reads it as
// before) and the rest are written. A board with nothing on it never replaces
// one that still lists a game to come.
//
// → play/board.json

import * as src from '../kit/play-sources.mjs';
import { LEAGUES } from '../kit/play-teams.mjs';
import { boardBets } from '../kit/play-bets.mjs';
import { gameOptions } from '../kit/play-board.mjs';
import { recommend } from '../kit/play-recommend.mjs';
import { useDirectReader } from '../kit/catalog.mjs';
import { upcoming as lotteryUpcoming, latestResults } from '../kit/play-lottery.mjs';
import { BOARD_V, BOARD_PATH, BOARD_HOURS, packGames } from '../kit/play-boardfile.mjs';
import { useReads } from '../price.js';
import { r2Store } from './store.js';
import { within } from './within.js';

// Leagues read at a time (each is a few reads through the proxy), and how long one may take.
const AT_ONCE = 6;
const LEAGUE_MS = 60_000;
const LOTTERY_MS = 25_000;

async function pool(items, size, work) {
  const queue = [...items];
  await Promise.all(Array.from({ length: Math.min(size, queue.length) }, async () => {
    while (queue.length) await work(queue.shift());
  }));
}

// The next draws and the jackpots carried over, as the 彩券 tab's header reads
// them (`upcoming`, and `latest` with only the jackpot): null when neither could be read.
async function readLottery(lottery) {
  const [next, latest] = await Promise.allSettled([within(LOTTERY_MS, () => lottery.upcoming()), within(LOTTERY_MS, () => lottery.latestResults())]);
  if (next.status === 'rejected' && latest.status === 'rejected') return null;
  const carried = {};
  if (latest.status === 'fulfilled') for (const [id, d] of Object.entries(latest.value || {})) if (d?.jackpot > 0) carried[id] = { jackpot: d.jackpot };
  return { upcoming: next.status === 'fulfilled' ? next.value || {} : null, latest: latest.status === 'fulfilled' ? carried : null };
}

export async function runPlay(env, opts = {}) {
  // CPBL's empty months are read from TheSportsDB by a phone (day by day); a build every ten minutes doesn't
  // (the proxy's own fallback, in the read, is enough). Put back after: slip checks in this isolate read as before.
  useDirectReader(() => Promise.reject(new Error('not read from here')));
  try {
    return await build(env, opts);
  } finally {
    useDirectReader(null);
  }
}

async function build(env, { proxy, now = Date.now(), log = console.log, store = r2Store(env.DATA), lottery = { upcoming: lotteryUpcoming, latestResults }, hours = BOARD_HOURS, budgetMs = 5 * 60_000 } = {}) {
  const date = new Date(now);
  const t0 = Date.now();
  const until = t0 + budgetMs;
  let reads = 0;
  // The reads of this run, each URL once (price.js useReads): the proxy's JSON, or a failure.
  useReads({
    read: async (url, trim = '') => {
      reads++;
      const data = await proxy(url, trim);
      if (data == null) throw new Error('unread');
      return data;
    },
    pack: async path => {
      const data = await store.json(path);
      if (!data) throw new Error('no pack');
      return data;
    }
  });

  const old = await store.json(BOARD_PATH).catch(() => null);
  // (Its own sources: read while the leagues are.)
  const lotteryIn = readLottery(lottery);
  const results = new Map();
  const missed = [];
  await pool(Object.keys(LEAGUES), AT_ONCE, async key => {
    if (Date.now() > until) return void missed.push(key);
    try {
      results.set(key, await within(LEAGUE_MS, () => src.loadLeague(key, date)));
    } catch {
      missed.push(key);
    }
  });
  // A league that had games ten minutes ago and none now isn't believed (a
  // list that failed to read answers none): left to the phone this once.
  for (const [key, games] of [...results]) {
    if (!games.length && old?.counts?.[key] > 0) (results.delete(key), missed.push(key));
  }
  const covered = [...results.keys()].sort();
  // Priced: the window's games only (the whole fortnight's cost 5 s of CPU a run, and the board keeps these).
  const all = [...results.values()].flat();
  const games = all.filter(g => Date.parse(g.startUtc) > now && Date.parse(g.startUtc) <= now + hours * 3_600_000);
  // The next race: among the picks the tags are drawn from (as on the phone), and a sport tile of its own.
  let race = null;
  let f1 = null;
  if (Date.now() <= until)
    try {
      race = await within(LEAGUE_MS, () => src.loadF1Race(date));
      f1 = race ? 1 : 0;
    } catch {}

  // Priced as the phone prices its board (boardBets), a game that can't be priced left out.
  let unpriced = 0;
  const bets = boardBets({ games, ...(race ? { f1: race } : {}), loadedAt: date.toISOString() }, {
    now: date,
    memo: {},
    optionsOf: g => {
      try {
        return gameOptions(g);
      } catch {
        unpriced++;
        return [];
      }
    }
  });
  // (Tagged among the window's picks: the best returns of the next few days.)
  const recs = recommend(bets);
  const packed = packGames({ games, bets, recs, now, hours });

  const counts = {};
  for (const [key, list] of results) if (list.length) counts[key] = list.length;
  const live = covered.length ? src.liveLeagues(date) : [];
  const board = {
    v: BOARD_V,
    built: date.toISOString(),
    until: new Date(now + hours * 3_600_000).toISOString(),
    covered,
    missed: missed.sort(),
    counts,
    f1,
    live,
    games: packed,
    lottery: await lotteryIn
  };
  const summary = { covered: covered.length, missed: board.missed, games: packed.length, picks: packed.reduce((n, g) => n + g.p.length, 0), unpriced, reads, ms: Date.now() - t0 };

  // Nothing read, or nothing on it where the last one still lists a game: that one stays
  // (and the heartbeat says so: ops.js reads `failed`).
  const listed = old?.games?.some(g => Date.parse(g.startUtc) > now);
  if (!covered.length || (!packed.length && listed)) {
    log('play', 'kept the last board', JSON.stringify(summary));
    return { failed: covered.length ? 'nothing on the board' : 'no league read', ...summary };
  }
  const text = JSON.stringify(board);
  // Always written: its `built` is how old the phone's copy may be.
  await store.put(BOARD_PATH, text, { always: true });
  log('play', JSON.stringify({ ...summary, bytes: text.length }));
  // (Most of the leagues missed: something's wrong, though the rest is written.)
  return { ...summary, bytes: text.length, ...(board.missed.length * 2 > covered.length + board.missed.length ? { failed: board.missed } : {}) };
}
