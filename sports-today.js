// ---- sports-today.js: GET /sports-today?day=YYYY-MM-DD ----
// Orbit Sports' first screen on one request: a Taiwan day's scoreboards, the
// ESPN pages the phone reads (every league, each of the day's two ESPN days;
// about 27 reads in three waves), read here once and answered as one JSON
//
//   { v: 1, day, built (ms), covered: [league], missed: [league], events: { league: [event] } }
//
// `events` are the phone's own (kit/sports-espn.mjs parseScoreboard, one copy
// for the proxy and the phone): in ESPN's words (no language: the phone puts
// its own on, localEvent), each `slimEvent`ed (what is empty or follows from
// another field is left out; `unslimEvent` puts it back). A league with no
// game that day has no list. `covered` are the leagues read (or out of season,
// by the family's sports/bounds.json, as the phone leaves them out); `missed`
// the ones a page of which couldn't be read (the phone reads those itself,
// with no events here). A league this route doesn't read (CPBL: its own site)
// is in neither: the phone reads it as before. Live scores stay the phone's
// own live read, laid over this list.
//
// ON DEMAND, no cron (nothing runs while nobody opens the app): built when
// asked, kept at the edge (caches.default) 60 s for today and tomorrow, 2
// minutes for yesterday, an hour for older days, 10 s when a league is missed;
// concurrent asks in one isolate share one build. Each read is the data
// proxy's own (sports.js readThrough: its shared cache, kept copies of a day
// over, allowlist): the phone's reads of the same pages and these warm each
// other. Paced by the bill's guard (pace.js): from pace 2 a kept copy is still
// served, a new build isn't (503 { error: 'paced' }: the phone reads as it did).
import { paceOf } from './pace.js';
import { json } from './http.js';
import { twDay } from './kit/format.mjs';
import { sessionLimited } from './quadra-token.js';
import { readThrough } from './sports.js';
import { LEAGUES, espnDaysOf, scoreboardUrl, eventsOfPages, slimEvent } from './kit/sports-espn.mjs';

export const TODAY_V = 1;
const DAY_MS = 86_400_000;
// Every league the app's first screen can show: its picks (the leagues the
// person follows, any of them) and the first 24 of the others, which with 15
// leagues is all of them. The ones with an ESPN scoreboard (CPBL is read from
// its own site, by the phone).
export const TODAY_LEAGUES = () => Object.keys(LEAGUES).filter(k => LEAGUES[k].espn);

const dayNumber = day => Date.parse(`${day}T00:00:00Z`) / DAY_MS;
// A real date, within a year of today (a day nobody opens is not built).
export function validDay(day, now = Date.now()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day || '')) return false;
  const n = dayNumber(day);
  return Number.isFinite(n) && new Date(n * DAY_MS).toISOString().slice(0, 10) === day && Math.abs(n - dayNumber(twDay(now))) <= 366;
}

// How long a day's answer is kept (the edge's `ttl`; the phone's browser
// `browser`), by how far the day is from today. Today's and tomorrow's follow
// the scores (a minute); yesterday's may still end a game (a US evening ends
// in Taiwan's morning); older days don't change.
export function keepFor(day, now = Date.now(), partial = false) {
  if (partial) return { ttl: 10, browser: 0 };
  const from = dayNumber(day) - dayNumber(twDay(now));
  if (from >= 0) return from <= 1 ? { ttl: 60, browser: 15 } : { ttl: 600, browser: 60 };
  return from === -1 ? { ttl: 120, browser: 30 } : { ttl: 3600, browser: 300 };
}

// Each league's season bounds (the family's sports/bounds.json, { league: { from, to } }):
// no day outside them is read (as the phone does). Read through `deps.bounds`,
// at most every 10 minutes; null when unknown (everything is read).
let boundsMemo = { at: 0, v: null };
const BOUNDS_MS = 10 * 60_000;
async function boundsOf(deps, now) {
  if (now - boundsMemo.at < BOUNDS_MS) return boundsMemo.v;
  let v = null;
  try {
    v = (await deps.bounds?.()) || null;
  } catch {}
  boundsMemo = { at: now, v };
  return v;
}
const inSeason = (day, b) => !b || !b.from || !b.to || (day >= b.from && day <= b.to);
export const forgetBounds = () => (boundsMemo = { at: 0, v: null });

// One league's events of the day: its ESPN pages read (a race weekend's
// current page on today, as the phone reads it), parsed. null: not read.
async function leagueOf(league, day, now, read) {
  const dates = LEAGUES[league].kind === 'field' && day === twDay(now) ? [] : espnDaysOf(day);
  const pages = await Promise.all((dates.length ? dates : [null]).map(d => read(scoreboardUrl(league, d))));
  const events = eventsOfPages(league, dates, pages);
  return events && !events.unread ? events : null;
}

// A day as the route answers it: { body (the JSON text), ttl: { ttl, browser } }.
// `read`: one URL's JSON or null (the data proxy's own read); `bounds`: the
// season bounds, or a function that gives them. Each page is parsed as it
// comes and let go, never all held at once.
export async function buildDay(day, { read, bounds = null, now = Date.now() }) {
  const covered = [];
  const missed = [];
  const events = {};
  const seasons = typeof bounds === 'function' ? await bounds() : bounds;
  await Promise.all(
    TODAY_LEAGUES().map(async league => {
      if (!inSeason(day, seasons?.[league])) return void covered.push(league);
      const list = await leagueOf(league, day, now, url => read(url).catch(() => null)).catch(() => null);
      if (!list) return void missed.push(league);
      covered.push(league);
      if (list.length) events[league] = list.map(slimEvent);
    })
  );
  // (In the leagues' own order, whichever answered first.)
  const order = TODAY_LEAGUES();
  const byOrder = (a, b) => order.indexOf(a) - order.indexOf(b);
  const body = JSON.stringify({ v: TODAY_V, day, built: now, covered: covered.sort(byOrder), missed: missed.sort(byOrder), events: Object.fromEntries(Object.entries(events).sort(([a], [b]) => byOrder(a, b))) });
  return { body, ttl: keepFor(day, now, missed.length > 0) };
}

// One build of a day at a time in an isolate: asks that come while it's under way wait for it.
const building = new Map();
const cacheKey = day => new Request(`https://orbit-sports-today.quadra/${day}`);
const answer = (body, headers, { browser }, how) => new Response(body, { status: 200, headers: { ...headers, 'Content-Type': 'application/json', 'Cache-Control': `private, max-age=${browser}`, 'X-Sports-Today': how } });

// The route (worker.js checks the origin first). `deps.bounds`: the season bounds.
export async function handleToday(request, env, ctx, headers, ip, deps = {}) {
  if (request.method !== 'GET') return json({ error: { message: 'GET only' } }, 405, headers);
  const day = new URL(request.url).searchParams.get('day') || '';
  const now = Date.now();
  if (!validDay(day, now)) return json({ error: { message: 'day=YYYY-MM-DD, within a year of today' } }, 400, headers);
  if (sessionLimited(`today:${ip}`, 30)) return json({ error: { message: 'Too many requests, please try again later.' } }, 429, headers);

  const key = cacheKey(day);
  const hit = await caches.default.match(key).catch(() => null);
  if (hit) {
    const kept = Number(hit.headers.get('X-Sports-Today-Ttl'));
    const at = Number(hit.headers.get('X-Sports-Today-Built'));
    if (kept > 0 && now - at < kept * 1000) return answer(await hit.text(), headers, { browser: Number(hit.headers.get('X-Sports-Today-Browser')) || 0 }, 'HIT');
  }
  // The bill's guard: from pace 2 no scoreboards are built here (a kept one is
  // still served; otherwise the phone's own reads, which it slows).
  if ((await paceOf(env)).pace >= 2) return json({ error: 'paced' }, 503, headers);
  const joined = building.has(day);
  if (!joined) {
    const build = buildDay(day, { read: url => readThrough(env, ctx, url), bounds: () => boundsOf(deps, now), now })
      .then(built => {
        const { ttl, browser } = built.ttl;
        ctx.waitUntil(
          Promise.resolve(caches.default.put(key, new Response(built.body, { headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${ttl}`, 'X-Sports-Today-Ttl': String(ttl), 'X-Sports-Today-Built': String(now), 'X-Sports-Today-Browser': String(browser) } }))).catch(() => {})
        );
        return built;
      })
      .finally(() => building.delete(day));
    building.set(day, build);
  }
  try {
    const built = await building.get(day);
    return answer(built.body, headers, built.ttl, joined ? 'JOIN' : 'MISS');
  } catch (error) {
    return json({ error: { message: String(error?.message || error).slice(0, 200) } }, 500, headers);
  }
}
