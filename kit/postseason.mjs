// MLB's postseason as MLB itself has it (statsapi.mlb.com, one small read
// for the whole October): every game still possible, whether its time is
// set, and whether it's "If Necessary". ESPN's are copies of MLB's that
// lag, and an app built them from day pages read at different times (the
// nightly pack, a day read live), so one series could show G4 待定, G5
// timed and G6 待定 again. MLB's one answer is a single moment for every
// game: the apps take each playoff game's time, 待定 and 如需 from it, and
// a game MLB no longer lists (its series over) is gone.
//
// Loaded by the apps with import('#kit/postseason.mjs').catch(() => null):
// an older kit without this file leaves them as before.
//
//   mlbPostseasonUrl(year)      the read (through the proxy, minutes fresh)
//   mlbPostseason(data)         → [{ pk, day, start, timeTbd, round, game, of, maybe, home, away, state }]
//   roundKey(text)              'ALDS' | 'NLCS' | 'WS' | 'ALWC' … from ESPN's note or MLB's description
//   mlbGameFor(list, game)      the MLB game of an app's game ({ note, home, away })
//   mlbGone(list, game, day, from)  whether an app's game to come won't be played (its series over)

// The whole postseason (every series from its first game, so one that's
// over is known as over), about 60 KB.
export const mlbPostseasonUrl = year => `https://statsapi.mlb.com/api/v1/schedule?sportId=1&gameType=F,D,L,W&season=${year}`;

// A round by its kind and league: Wild Card, Division Series, Championship
// Series (AL or NL), the World Series.
export function roundKey(text) {
  const s = String(text || '');
  if (/world series/i.test(s)) return 'WS';
  const league = /^\s*AL|American League/i.test(s) ? 'AL' : /^\s*NL|National League/i.test(s) ? 'NL' : '';
  const kind = /wild ?card|\bWC\b/i.test(s) ? 'WC' : /\b[AN]LDS\b|division series/i.test(s) ? 'DS' : /\b[AN]LCS\b|championship series/i.test(s) ? 'CS' : '';
  return league && kind ? `${league}${kind}` : '';
}
export const gameNumber = text => Number(/\bgame (\d+)/i.exec(String(text || ''))?.[1]) || 0;

// A team's name compared plainly; "CLE/CWS" or "AL Champion" (a side not known yet) is no team.
const plain = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const known = t => Boolean(t?.name) && !/\/|\bchampion\b|\bwinner\b|^tbd$/i.test(t.name);
const side = t => (known(t) ? { name: t.name, id: String(t.id) } : null);

// A game whose time isn't set: MLB dates it (its US day) with a made-up
// hour. Placed at 20:00 New York, the next morning in Taiwan (08:00), the
// usual hour, as the apps place ESPN's.
const DAY = 86_400_000;
const untimed = day => new Date(Date.parse(`${day}T00:00:00Z`) + DAY).toISOString();

export function mlbPostseason(data) {
  const out = [];
  for (const d of data?.dates || [])
    for (const g of d.games || []) {
      const st = g.status || {};
      // Called off (a game not needed after all is left off MLB's list, not cancelled).
      if (/cancel|postponed/i.test(st.detailedState || '') && st.abstractGameState !== 'Final') continue;
      const timeTbd = Boolean(st.startTimeTBD);
      const day = g.officialDate || d.date;
      out.push({
        pk: g.gamePk,
        day,
        start: timeTbd ? untimed(day) : g.gameDate,
        timeTbd,
        round: roundKey(g.description) || roundKey(`${/^(AL|NL)/.exec(g.description || '')?.[1] || ''} ${g.seriesDescription || ''}`) || (g.gameType === 'W' ? 'WS' : ''),
        game: Number(g.seriesGameNumber) || gameNumber(g.description),
        of: Number(g.gamesInSeries) || 0,
        maybe: g.ifNecessary === 'Y',
        home: side(g.teams?.home?.team),
        away: side(g.teams?.away?.team),
        state: st.abstractGameState === 'Final' ? 'post' : st.abstractGameState === 'Live' ? 'in' : 'pre'
      });
    }
  return out;
}

// The MLB game of an app's game: the same round and game number, and the
// same sides as far as both know them (two series in one round: the ALDS's).
// game: { note: ESPN's ("ALDS - Game 5"), home, away: { en | displayName | name } }.
const namesOf = game => [game?.home, game?.away].map(t => plain(t?.en || t?.displayName || t?.name)).filter(n => n && !/\/|\bchampion\b|\bwinner\b|^tbd$/.test(n));
const fits = (g, names) => {
  const theirs = [g.home, g.away].filter(Boolean).map(t => plain(t.name));
  const open = 2 - theirs.length;
  const matched = names.filter(n => theirs.includes(n)).length;
  // Each side known to one and not the other is one the other doesn't know yet.
  return names.length - matched <= open && theirs.length - matched <= 2 - names.length;
};
export function mlbGameFor(list, game) {
  const round = roundKey(game?.note);
  const n = gameNumber(game?.note);
  if (!round || !n || !list?.length) return null;
  const names = namesOf(game);
  const same = list.filter(g => g.round === round && g.game === n && fits(g, names));
  // Two that fit (nobody known yet in a round of two series): which one can't be told.
  return same.length === 1 ? same[0] : null;
}

// Whether an app's game to come won't be played: MLB lists every series
// from its first game, every game it may still need (sides not known yet
// as "CLE/CWS" or "AL Champion"), and drops a game once its series no
// longer needs it. So a game of a series MLB lists (its sides fit a game
// of that round) with no game of that number that fits is gone; so is one
// of a round MLB doesn't list at all. Only on or after `from` (MLB's US
// date, 'YYYY-MM-DD'), the list's own season.
export function mlbGone(list, game, day, from) {
  const round = roundKey(game?.note);
  const n = gameNumber(game?.note);
  if (!round || !n || !list?.length || !day || day < from) return false;
  const names = namesOf(game);
  const of = list.filter(g => g.round === round);
  if (of.some(g => g.game === n && fits(g, names))) return false;
  return !of.length || of.some(g => fits(g, names));
}
