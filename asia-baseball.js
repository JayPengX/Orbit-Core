// The CPBL's schedules and scores, as one shape for Orbit Sports. Kambi only
// lists a game a day or so ahead and drops it after, and ESPN doesn't carry
// it, so without this Orbit Sports had "no recent games" mid-season.
//
//   CPBL  TheSportsDB's day lists (CPBL's own site turns addresses outside Taiwan away)
//
// Served by the sports proxy as if from `https://asia-baseball.orbit/<league>/<YYYY-MM>.json`,
// so the apps read it through proxyJson like any other list:
//   { league, month, games: [{ id, start, home: { en, zh }, away, homeScore,
//     awayScore, state: 'pre' | 'in' | 'post' | 'void', venue }] }
// `start` is UTC. A game "in" is one past its start and not yet marked over.

import { parseTsdbDay, TSDB_DAY, TSDB_CPBL } from './kit/catalog.mjs';

export const ASIA_HOST = 'asia-baseball.orbit';

const HOUR = 3_600_000;
// ---- Fetching ----------------------------------------------------------------------

const UA = 'Mozilla/5.0 (compatible; Orbit-Sports/1.0; +https://github.com/JayPengX/Orbit-Sports)';
const TIMEOUT = 10_000;

// CPBL's site turns a bot's user agent away (a 404) and sends a new reader
// round its cookie check a few times: a browser's user agent, the redirects
// followed by hand with the cookies kept. -> { page, html, cookie }.
const BROWSER_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';
async function cpblPage(at) {
  const jar = new Map();
  const keep = res => (res.headers.getSetCookie?.() || [res.headers.get('Set-Cookie') || '']).map(c => c.split(';')[0]).filter(c => c.includes('=')).forEach(c => jar.set(c.slice(0, c.indexOf('=')), c));
  const cookie = () => [...jar.values()].join('; ');
  let url = at;
  let page;
  for (let hop = 0; hop < 6; hop++) {
    page = await fetch(url, { headers: { 'User-Agent': BROWSER_UA, Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8', 'Accept-Language': 'zh-TW,zh;q=0.9,en;q=0.8', Cookie: cookie() }, redirect: 'manual', signal: AbortSignal.timeout(TIMEOUT) });
    keep(page);
    const next = page.status >= 300 && page.status < 400 && page.headers.get('Location');
    if (!next) break;
    url = new URL(next, url).href;
  }
  return { page, html: page.ok ? await page.text() : '', cookie: cookie() };
}

// TheSportsDB's day lists (its free key answers 3 games a request, CPBL's most in a day). Each day of the
// month up to two weeks ahead.
// The day lists and their parsing are the kit's (shared with the apps, which
// read them straight from the device when this proxy can't).
export { parseTsdbDay };
const TSDB = TSDB_DAY;

// The days of the month from `from` up to two weeks ahead, each day's list
// kept 10 minutes at Cloudflare's edge (TheSportsDB's free key is rate-limited).
// At most TSDB_DAYS of them, the nearest to now first: TheSportsDB's free
// key turns a burst away, and a batch asks for three months at once (on the
// free plan its 50 fetches a call set this too; the $5 plan's 10,000 don't,
// and two days back to two weeks ahead, all CPBL's own list ever lacks, fit). A day over (two back) is kept a week at the edge, not 10 minutes.
const TSDB_DAYS = 16;
// `work` on each item, `n` at a time; the answers in the items' order.
async function inTurns(items, n, work) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await work(items[i]);
    }
  }));
  return out;
}
const TSDB_TIMEOUT = 5_000;
async function fetchCpblTsdb(year, month, { from = Date.UTC(year, month - 1, 1), now = Date.now() } = {}) {
  let days = [];
  const last = Math.min(Date.UTC(year, month, 0), now + 14 * 24 * HOUR);
  for (let t = Math.floor(from / (24 * HOUR)) * 24 * HOUR; t <= last; t += 24 * HOUR) days.push(new Date(t).toISOString().slice(0, 10));
  days = days.sort((a, b) => Math.abs(Date.parse(a) - now) - Math.abs(Date.parse(b) - now)).slice(0, TSDB_DAYS);
  const over = new Date(now - 2 * 24 * HOUR).toISOString().slice(0, 10);
  // A day that fails counts as empty, but every day failing is a failure
  // (reason kept): never an empty month served and cached as if the league
  // had no games (TheSportsDB can refuse this Worker's requests).
  const failures = [];
  // Two at a time, a refusal not asked again (the phones read it then; a
  // Worker call keeps only six connections open, and a batch needs some).
  const day = d =>
    fetch(`${TSDB}?d=${d}&l=${TSDB_CPBL}`, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(TSDB_TIMEOUT), cf: { cacheTtl: d < over ? 7 * 86_400 : 600, cacheEverything: true } }).then(async r => {
      if (!r.ok) throw new Error(`tsdb ${r.status}`);
      return parseTsdbDay(await r.json());
    });
  // A day TheSportsDB turns away asked again through the relay pinned to Taiwan (as cpblDay does).
  const read = [];
  const lists = await inTurns(days, 2, d =>
    day(d)
      .catch(error => (relay ? relay.fetch(`https://gemini-relay/?to=${encodeURIComponent(`${TSDB}?d=${d}&l=${TSDB_CPBL}`)}`, { signal: AbortSignal.timeout(TSDB_TIMEOUT) }).then(async r => (r.ok ? parseTsdbDay(await r.json()) : Promise.reject(error)), () => Promise.reject(error)) : Promise.reject(error)))
      .then(list => (read.push(d), list))
      .catch(error => (failures.push(String(error.message || error)), []))
  );
  if (days.length && failures.length === days.length) throw new Error(`${failures[0]} (every day)`);
  // The days read (a day missing is never "no games": the data proxy fills
  // it from the nightly whole copy), and whether that's every day of the month.
  const all = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { games: lists.flat(), read: read.sort(), ...(read.length === all ? { whole: 1 } : {}) };
}
// CPBL's month from TheSportsDB's day lists: CPBL's own site turns every
// address outside Taiwan away (Cloudflare's too), and TheSportsDB's free key
// often refuses Cloudflare: then a quick 502, and the phones read TheSportsDB
// themselves (kit catalog asiaMonth). Owner's call 2026-10-18: no paid key.
async function cpbl(year, month, now = Date.now()) {
  // December to February: no CPBL games (the season opens in March, 台灣大賽
  // is over by early November), nothing to ask for.
  if (month === 12 || month <= 2) return { games: [], read: [], whole: 1 };
  return fetchCpblTsdb(year, month, { now });
}
const FETCHERS = { cpbl };

// ---- A CPBL game's box score (the league's own: its box page's getlive) -----------
//
// `/cpbl/box/<year>-<gameSno>.json` (a regular season game) ->
//   { year, sno, state: 'pre' | 'in' | 'post', status, away: { zh, score,
//     lines: [runs an inning], hits, errors }, home, batting: [{ side, id,
//     name, no, order, pos, starter, ab, r, h, rbi, d2, d3, hr, bb, ibb, hbp,
//     k, sb, cs, sh, sf, gidp, lob }], pitching: [{ side, id, name, no, role,
//     decision: 'W' | 'L' | 'S' | 'H' | '', outs, bf, pc, st, h, hr, bb, hbp, k,
//     wp, bk, r, er, top }], plays: [{ inning, half, order, batter, pitcher,
//     text, result, away, home, scoring, outs }] } (each at-bat's last pitch).
// (`<year>-E3`: a play-off game, its kind and number.)
export function cpblBoxTarget(url) {
  const m = /^\/cpbl\/box\/(\d{4})-([CE]?)(\d{1,4})\.json$/.exec(url.pathname);
  return m ? { year: Number(m[1]), sno: Number(m[3]), kind: m[2] || 'A' } : null;
}
const sideOfType = t => (String(t) === '2' ? 'home' : 'away');
const parseJson = t => {
  try {
    return t ? JSON.parse(t) : null;
  } catch {
    return null;
  }
};
export function parseCpblBox(data, year, sno) {
  const detail = parseJson(data?.CurtGameDetailJson) || {};
  const board = parseJson(data?.ScoreboardJson) || [];
  const log = parseJson(data?.LiveLogJson) || [];
  const bats = parseJson(data?.BattingJson) || [];
  const arms = parseJson(data?.PitchingJson) || [];
  // GameStatus: 1 on, 2 on (between innings), 8 suspended, 3 over; else to come.
  const code = Number(detail.GameStatus);
  const state = code === 3 ? 'post' : code === 1 || code === 2 || code === 8 ? 'in' : 'pre';
  const side = key => {
    const rows = board.filter(x => sideOfType(x.VisitingHomeType) === key).sort((a, b) => a.InningSeq - b.InningSeq);
    const lines = [];
    for (const x of rows) lines[Number(x.InningSeq) - 1] = String(Number(x.ScoreCnt) || 0);
    return {
      zh: key === 'home' ? detail.HomeTeamName || '' : detail.VisitingTeamName || '',
      score: Number(key === 'home' ? detail.HomeTotalScore : detail.VisitingTotalScore) || 0,
      lines: Array.from(lines, v => v ?? ''),
      hits: rows.reduce((n, x) => n + (Number(x.HittingCnt) || 0), 0),
      errors: rows.reduce((n, x) => n + (Number(x.ErrorCnt) || 0), 0)
    };
  };
  // Each batter's place in the order and position: from the play-by-play (the box lists don't say).
  const where = new Map();
  for (const x of log) if (x.HitterAcnt && !where.has(x.HitterAcnt)) where.set(x.HitterAcnt, { order: Number(x.HitterLineup) || 99, pos: x.DefendStationCode || '' });
  const n = v => Number(v) || 0;
  const batting = bats
    .map((x, i) => ({
      side: sideOfType(x.VisitingHomeType), id: String(x.HitterAcnt || ''), name: x.HitterName || '', no: x.HitterUniformNo || '',
      order: where.get(x.HitterAcnt)?.order ?? 99, pos: where.get(x.HitterAcnt)?.pos || '', starter: x.RoleType === '先發', seq: i,
      ab: n(x.HitCnt), r: n(x.ScoreCnt), h: n(x.HittingCnt), rbi: n(x.RunBattedINCnt), d2: n(x.TwoBaseHitCnt), d3: n(x.ThreeBaseHitCnt), hr: n(x.HomeRunCnt),
      bb: n(x.BasesONBallsCnt), ibb: n(x.IntentionalBasesONBallsCnt), hbp: n(x.HitBYPitchCnt), k: n(x.StrikeOutCnt), sb: n(x.StealBaseOKCnt), cs: n(x.StealBaseFailCnt),
      sh: n(x.SacrificeHitCnt), sf: n(x.SacrificeFlyCnt), gidp: n(x.DoublePlayBatCnt), lob: n(x.Lobs)
    }))
    .sort((a, b) => a.side.localeCompare(b.side) || a.order - b.order || b.starter - a.starter || a.seq - b.seq)
    .map(({ seq, ...x }) => x);
  const decision = x => (x.GameResult === '勝' ? 'W' : x.GameResult === '敗' ? 'L' : x.IsSaveOK === '1' ? 'S' : n(x.ReliefPointCnt) > 0 ? 'H' : '');
  const pitching = arms.map(x => ({
    side: sideOfType(x.VisitingHomeType), id: String(x.PitcherAcnt || ''), name: x.PitcherName || '', no: x.PitcherUniformNo || '', role: x.RoleType || '', decision: decision(x),
    outs: n(x.InningPitchedCnt) * 3 + n(x.InningPitchedDiv3Cnt), bf: n(x.PlateAppearances), pc: n(x.PitchCnt), st: n(x.StrikeCnt), h: n(x.HittingCnt), hr: n(x.HomeRunCnt),
    bb: n(x.BasesONBallsCnt), hbp: n(x.HitBYPitchCnt), k: n(x.StrikeOutCnt), wp: n(x.WildPitchCnt), bk: n(x.BalkCnt), r: n(x.RunCnt), er: n(x.EarnedRunCnt), top: n(x.GameHigherSpeedPitch)
  }));
  // Each at-bat's last pitch (the log is a row a pitch, in the game's order): what came of it.
  // The score after each: the runs its words say came home (a home run's batter too),
  // the league's own score where it's ahead (its rows sometimes lag a play: an RBI
  // single at 0-0 not marked as scoring).
  const plays = [];
  const run = { away: 0, home: 0 };
  log.forEach((x, i) => {
    const next = log[i + 1];
    const text = String(x.Content || '').trim();
    if (!x.HitterAcnt || !text || text === '比賽結束') return;
    if (next && next.HitterAcnt === x.HitterAcnt && next.InningSeq === x.InningSeq && next.VisitingHomeType === x.VisitingHomeType && String(next.Content || '').trim() !== '比賽結束') return;
    const bat = sideOfType(x.VisitingHomeType);
    const runs = (text.match(/回本壘得分/g) || []).length + (x.BattingActionName === '全打' ? 1 : 0);
    const before = run[bat];
    run[bat] += runs;
    run.away = Math.max(run.away, n(x.VisitingScore));
    run.home = Math.max(run.home, n(x.HomeScore));
    plays.push({ inning: n(x.InningSeq), half: bat === 'away' ? 'top' : 'bottom', order: n(x.HitterLineup), batter: x.HitterName || '', batterId: String(x.HitterAcnt), pitcher: x.PitcherName || '', text, result: x.BattingActionName || '', away: run.away, home: run.home, scoring: runs > 0 || x.IsScoreCnt === '1' || run[bat] > before, outs: n(x.OutCnt) });
  });
  return { year, sno, state, status: detail.GameStatusChi || '', away: side('away'), home: side('home'), batting, pitching, plays };
}
async function fetchCpblBox(year, sno, kind = 'A') {
  const at = `https://www.cpbl.com.tw/box?year=${year}&kindCode=${kind}&gameSno=${sno}`;
  const { page, html, cookie } = await cpblPage(at);
  if (!page.ok) throw new Error(`cpbl box page ${page.status}`);
  const token = /name="__RequestVerificationToken" type="hidden" value="([^"]+)"/.exec(html)?.[1];
  const cookies = cookie;
  if (!token) throw new Error('cpbl box token');
  const res = await fetch('https://www.cpbl.com.tw/box/getlive', {
    method: 'POST',
    headers: { 'User-Agent': BROWSER_UA, 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'X-Requested-With': 'XMLHttpRequest', Cookie: cookies, Referer: at, Origin: 'https://www.cpbl.com.tw' },
    body: `__RequestVerificationToken=${encodeURIComponent(token)}&GameSno=${sno}&KindCode=${kind}&Year=${year}&PrevOrNext=&PresentStatus=`,
    signal: AbortSignal.timeout(TIMEOUT)
  });
  if (!res.ok) throw new Error(`cpbl box ${res.status}`);
  const data = await res.json();
  if (!data?.Success) throw new Error('cpbl box answer');
  return parseCpblBox(data, year, sno);
}

// ---- One CPBL day from TheSportsDB, for a game's final (push.js) ----------------
//
// `/cpbl/day/<YYYY-MM-DD>.json` -> { via: 'direct' | 'relay', events } (the
// day list's own events). TheSportsDB's free key turns this Worker's shared
// addresses away (429) most of the time: then the same address through
// gemini-relay, a Worker of its own pinned to Taiwan (cpbl.com.tw itself
// answers only its home page to either: 404 for every list and box, 2026-10-22).
let relay = null;
export const useCpblRelay = binding => void (relay ||= binding || null);
export async function cpblDay(day, via = relay) {
  const url = `${TSDB_DAY}?d=${day}&l=${TSDB_CPBL}`;
  let res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(TSDB_TIMEOUT), cf: { cacheTtl: 60, cacheEverything: true } }).catch(() => null);
  let how = 'direct';
  if (!res?.ok && via) (res = await via.fetch(`https://gemini-relay/?to=${encodeURIComponent(url)}`, { signal: AbortSignal.timeout(TSDB_TIMEOUT) }).catch(() => null)), (how = 'relay');
  if (!res?.ok) throw new Error(`tsdb ${res?.status ?? 'no answer'} (${how})`);
  return { via: how, events: (await res.json())?.events || [] };
}

// `/<league>/<YYYY-MM>.json` -> { league, month } or null.
export function asiaTarget(url) {
  const m = /^\/(cpbl)\/(\d{4})-(\d{2})\.json$/.exec(url.pathname);
  if (!m) return null;
  const month = Number(m[3]);
  return month >= 1 && month <= 12 ? { league: m[1], year: Number(m[2]), month } : null;
}

// The month's games as a Response (JSON), or an error Response.
export async function asiaBaseballResponse(url) {
  const day = /^\/cpbl\/day\/(\d{4}-\d{2}-\d{2})\.json$/.exec(url.pathname)?.[1];
  if (day) {
    try {
      return new Response(JSON.stringify(await cpblDay(day)), { status: 200, headers: { 'Content-Type': 'application/json' } });
    } catch (error) {
      return new Response(JSON.stringify({ error: String(error.message || error) }), { status: 502, headers: { 'Content-Type': 'application/json' } });
    }
  }
  const box = cpblBoxTarget(url);
  if (box) {
    try {
      return new Response(JSON.stringify(await fetchCpblBox(box.year, box.sno, box.kind)), { status: 200, headers: { 'Content-Type': 'application/json' } });
    } catch (error) {
      return new Response(JSON.stringify({ error: String(error.message || error) }), { status: 502, headers: { 'Content-Type': 'application/json' } });
    }
  }
  const target = asiaTarget(url);
  if (!target) return new Response('{"error":"unknown"}', { status: 404, headers: { 'Content-Type': 'application/json' } });
  try {
    const got = await FETCHERS[target.league](target.year, target.month);
    const { games, ...more } = Array.isArray(got) ? { games: got } : got;
    return new Response(JSON.stringify({ league: target.league, month: `${target.year}-${String(target.month).padStart(2, '0')}`, games: games.sort((a, b) => a.start.localeCompare(b.start)), ...more }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (error) {
    return new Response(JSON.stringify({ error: String(error.message || error) }), { status: 502, headers: { 'Content-Type': 'application/json' } });
  }
}
