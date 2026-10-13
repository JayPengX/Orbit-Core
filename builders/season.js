// Which games' data Shared-Data keeps: the owner's rule (2026-10-12, TRUTH §7).
//
// A league's season is kept whole (every game's and race's result, box score,
// watch links, win probability, tables, players' and teams' numbers, the
// regular season and the playoffs alike) until the next season has begun: a
// game of it played, its preseason's included (the owner's change, 2026-10-12:
// the gap between seasons is long). Then the last season is wiped (`begun`)
// but its playoff bracket and final tables, which the apps show until the
// new regular season has begun (a regular-season game played: `regular`),
// then wiped too., all of it at once, and only this
// season's results are shown. A run that can't tell which season it is
// (ESPN's scoreboard unread) wipes nothing.
//
// Every builder (builders/*.js) asks here.

export const DAY = 86_400_000;
// The last season began at most a year and a bit before this one.
export const LAST_SEASON = 380 * DAY;

const startOf = ev => Date.parse(ev?.competitions?.[0]?.date || ev?.date || '') || 0;
// A season-pack event that's its season's preseason (ESPN's season type 1).
export const preseason = ev => ev?.season?.type === 1 || /^pre/i.test(ev?.season?.slug || '');
// Whether season `year` has begun, by the season packs' events: a game of
// it (its preseason's too) started by `now`.
export const seasonBegun = (events, year, now = Date.now()) => (events || []).some(ev => ev?.season?.year === year && startOf(ev) && startOf(ev) <= now);
// Whether season `year`'s regular season has begun: a game of it, not its preseason, started by `now`.
export const regularBegun = (events, year, now = Date.now()) => (events || []).some(ev => ev?.season?.year === year && !preseason(ev) && startOf(ev) && startOf(ev) <= now);

// A league's season now: { start, year, begun, regular } from ESPN's
// scoreboard (`scoreboard`: its answer, or null when unread) and the season
// packs' events. `begun`: a game of it played (the last season let go);
// `regular`: a regular-season game (last season's bracket and tables too);
// null when it can't be told (nothing wiped).
export function seasonState(scoreboard, events, now = Date.now()) {
  const s = scoreboard?.leagues?.[0]?.season;
  const start = Date.parse(s?.startDate || '');
  if (!s || !Number.isFinite(start) || s.year == null) return { start: now - LAST_SEASON, year: null, begun: null, regular: null };
  return { start, year: s.year, begun: seasonBegun(events, s.year, now), regular: regularBegun(events, s.year, now) };
}
// CPBL's (Asia's leagues, no ESPN): the calendar year's season, begun with
// its first game of the year (the league's list has no exhibition games:
// its regular season too), or from April whatever the list says. `games`: this year's ({ start, state }).
export function yearSeason(games, now = Date.now()) {
  const y = new Date(now).getUTCFullYear();
  const begun = new Date(now).getUTCMonth() >= 3 || (games || []).some(g => g.state === 'post' && new Date(g.start).getUTCFullYear() === y);
  return { start: Date.UTC(y, 0, 1), year: y, begun, regular: begun };
}
// Whether a game that started at `t` is kept.
export const keeps = (season, t) => season?.begun == null || t >= season.start || (!season.begun && t >= season.start - LAST_SEASON);
// Where the kept games begin (ms): this season's start, or the last one's while it's kept.
export const keptFrom = season => (season?.begun === false || season?.begun == null ? season.start - LAST_SEASON : season.start);

// The days a league's games can be asked for (the apps' date strips and 📅,
// so nobody reads days with nothing kept through the proxy): 'YYYY-MM-DD',
// Taiwan's. `from`: the first kept game (this season's first, its
// preseason's too, once begun; last season's first before). `to`: this
// season's last possible day: `end` when its last games aren't scheduled
// yet (playoffs: ESPN's season end; a cup's: its final's date), else its
// last game scheduled; a season over (ESPN not yet on the next): the next
// one's schedule. `events`: the season packs' ({ date, season }).
const taipei = t => new Date(t + 8 * 3_600_000).toISOString().slice(0, 10);
const off = ev => /postponed|canceled|cancelled|abandoned/i.test((ev?.status?.type || ev?.competitions?.[0]?.status?.type || {}).name || '');
export function seasonBounds(events, season, end = NaN, now = Date.now()) {
  const list = (events || []).filter(ev => startOf(ev) && !off(ev));
  const first = Math.min(...list.filter(ev => startOf(ev) >= keptFrom(season)).map(startOf));
  const last = (pick = () => true) => Math.max(-Infinity, ...list.filter(pick).map(startOf));
  let to = Math.max(Number.isFinite(end) ? end : -Infinity, last(ev => ev?.season?.year === season?.year));
  if (to < now) to = Math.max(to, last());
  return { from: Number.isFinite(first) ? taipei(first) : null, to: Number.isFinite(to) ? taipei(to) : null };
}
