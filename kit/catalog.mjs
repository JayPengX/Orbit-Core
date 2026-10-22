// Every sport and league Quadra covers, once, for Orbit Sports and Play alike
// (from the kit). Each app
// builds its own view of it (Orbit Sports' lib/leagues.mjs, Play's lib/teams.mjs),
// so a league added or fixed here reaches both.
//
//   sport   one of SPORTS
//   kind    'match' two sides; 'field' a race weekend
//   data    where its schedule and scores come from: 'espn' (espn path),
//           'kambi' (kambi path), 'asia' (the leagues' own sites, through the
//           sports proxy: asiaMonth below). Orbit Sports shows only the leagues on ELTA.tv
//           or Apple TV in Taiwan (its lib/broadcast.mjs).
//   bet     Quadra Play's key when Play sells it; `odds` where Play prices it
//           ('espn': DraftKings through ESPN; 'kambi'), F1 has its own board
//   espn / kambi   the paths on each source (a league can have both: an
//           ESPN league with a Kambi path is priced by Kambi first, DraftKings
//           the cross-check, and settled from ESPN)
//   standings  a cup with a table ESPN keeps (a league phase, groups):
//           its table shown and each game's group said
//   play-only details: logo (ESPN league logo id), icon, badge

export const SPORTS = {
  soccer: { zh: '足球', en: 'Soccer', icon: '⚽' },
  baseball: { zh: '棒球', en: 'Baseball', icon: '⚾' },
  basketball: { zh: '籃球', en: 'Basketball', icon: '🏀' },
  football: { zh: '美式足球', en: 'Football', icon: '🏈' },
  hockey: { zh: '冰球', en: 'Hockey', icon: '🏒' },
  racing: { zh: '賽車', en: 'Racing', icon: '🏎️' }
};


const espn = (sport, path, zh, en, bet, extra = {}) => ({ sport, kind: 'match', data: 'espn', espn: path, zh, en, bet, odds: bet ? 'espn' : undefined, ...extra });
const soccer = (path, zh, en, bet, extra = {}) => espn('soccer', `soccer/${path}`, zh, en, bet, extra);

export const CATALOG = {
  // Baseball
  mlb: espn('baseball', 'baseball/mlb', 'MLB 美國職棒', 'MLB', 'mlb', { top: true, kambi: 'baseball/mlb' }),
  npb: { sport: 'baseball', kind: 'match', data: 'asia', asia: 'npb', kambi: 'baseball/japan/npb', zh: '日本職棒', en: 'NPB', bet: 'npb', odds: 'kambi', icon: '⚾', badge: 'lk85rg1575038781' },
  kbo: { sport: 'baseball', kind: 'match', data: 'asia', asia: 'kbo', kambi: 'baseball/south_korea/kbo_league', zh: '韓國職棒', en: 'KBO', bet: 'kbo', odds: 'kambi', icon: '⚾', badge: 'qfr1hx1589707979' },
  cpbl: { sport: 'baseball', kind: 'match', data: 'asia', asia: 'cpbl', kambi: 'baseball/taiwan/chinese_professional_baseball', zh: '中華職棒', en: 'CPBL', bet: 'cpbl', odds: 'kambi', top: true, icon: '⚾', badge: 'c3vetj1655924198' },
  // Basketball
  nba: espn('basketball', 'basketball/nba', 'NBA', 'NBA', 'nba', { top: true, kambi: 'basketball/nba' }),
  wnba: espn('basketball', 'basketball/wnba', 'WNBA', 'WNBA', 'wnba', { kambi: 'basketball/wnba' }),
  nbl: espn('basketball', 'basketball/nbl', '澳洲職籃', 'NBL', 'nbl', { kambi: 'basketball/australia/nbl' }),
  euroleague: { sport: 'basketball', kind: 'match', data: 'kambi', kambi: 'basketball/euroleague', zh: '歐洲籃球聯賽', en: 'EuroLeague', bet: 'euroleague', odds: 'kambi', icon: '🏀', badge: '7xjtuy1554397263' },
  // Football
  nfl: espn('football', 'football/nfl', 'NFL', 'NFL', 'nfl', { top: true, kambi: 'american_football/nfl' }),
  // 台灣運彩's 美式足球 is the NFL alone (its 玩法 list, 2026): college
  // football is shown, settled for old slips, never sold (sold: false).
  ncaaf: espn('football', 'football/college-football', '美國大學美式足球', 'College Football', 'ncaaf', { kambi: 'american_football/ncaaf', icon: '🏈', sold: false }),
  // Hockey
  nhl: espn('hockey', 'hockey/nhl', 'NHL', 'NHL', 'nhl', { kambi: 'ice_hockey/nhl' }),
  // Soccer
  epl: soccer('eng.1', '英超', 'Premier League', 'epl', { top: true, logo: 23, kambi: 'football/england/premier_league' }),
  laliga: soccer('esp.1', '西甲', 'LaLiga', 'laliga', { top: true, logo: 15, kambi: 'football/spain/la_liga' }),
  seriea: soccer('ita.1', '義甲', 'Serie A', 'seriea', { logo: 12, kambi: 'football/italy/serie_a' }),
  bundesliga: soccer('ger.1', '德甲', 'Bundesliga', 'bundesliga', { logo: 10, kambi: 'football/germany/bundesliga' }),
  ligue1: soccer('fra.1', '法甲', 'Ligue 1', 'ligue1', { logo: 9, kambi: 'football/france/ligue_1' }),
  ucl: soccer('uefa.champions', '歐冠', 'Champions League', 'ucl', { top: true, cup: true, logo: 2, kambi: 'football/champions_league', standings: true }),
  uel: soccer('uefa.europa', '歐霸', 'Europa League', 'uel', { cup: true, logo: 2310, kambi: 'football/europa_league', standings: true }),
  uecl: soccer('uefa.europa.conf', '歐協聯', 'Conference League', 'uecl', { cup: true, logo: 20296, kambi: 'football/conference_league', standings: true }),
  scotland: soccer('sco.1', '蘇超', 'Scottish Premiership', 'scotland', { logo: 45, kambi: 'football/scotland/scottish_premiership' }),
  mls: soccer('usa.1', '美職足', 'MLS', 'mls', { logo: 19, kambi: 'football/usa/mls' }),
  // Korea's K League 1: not on ESPN, Kambi's schedule and prices (three-way).
  kleague: { sport: 'soccer', kind: 'match', data: 'kambi', kambi: 'football/south_korea/k-league_1', zh: '韓國職業足球聯賽', en: 'K League 1', bet: 'kleague', odds: 'kambi', icon: '⚽' },
  jleague: soccer('jpn.1', '日職聯', 'J1 League', 'jleague', { logo: 2199 }),
  championship: soccer('eng.2', '英冠', 'Championship', 'championship', { logo: 24, kambi: 'football/england/the_championship' }),
  eredivisie: soccer('ned.1', '荷甲', 'Eredivisie', 'eredivisie', { logo: 11, kambi: 'football/netherlands/eredivisie' }),
  ligamx: soccer('mex.1', '墨超', 'Liga MX', 'ligamx', { logo: 22, kambi: 'football/mexico/liga_mx' }),
  brasileirao: soccer('bra.1', '巴甲', 'Brasileirão', 'brasileirao', { logo: 85, kambi: 'football/brazil/brasileirao_serie_a' }),
  facup: soccer('eng.fa', '英足總盃', 'FA Cup', 'facup', { cup: true, logo: 40, kambi: 'football/england/fa_cup' }),
  // The big tournaments: every few years, the board fills when one is on.
  worldcup: soccer('fifa.world', '世界盃', 'FIFA World Cup', 'worldcup', { cup: true, logo: 4, standings: true }),
  nationsleague: soccer('uefa.nations', '歐國聯', 'Nations League', 'nationsleague', { cup: true, logo: 2395, kambi: 'football/uefa_nations_league', standings: true }),
  // Racing
  f1: { sport: 'racing', kind: 'field', data: 'espn', espn: 'racing/f1', zh: 'F1 一級方程式', en: 'Formula 1', bet: 'f1', top: true, standings: true }
};

// Play's kind of markets for a sport.
export const familyOfSport = sport => sport;

// Every league Play prices (`sold: true`: only those it still sells; the
// rest stay for settling older slips): its kind of markets (family) and
// where its games and odds come from: an ESPN `path` (its schedule and
// results) with Kambi's list as its first price (`book`), or a `kambi` list
// alone (its schedule and prices; Asian baseball also its league's month
// lists, `schedule`). Keyed by Play's key (`bet`). One table for Play's
// board (play-teams.mjs) and the settling (settle.mjs).
export function playLeagues({ sold = false } = {}) {
  return Object.fromEntries(
    Object.values(CATALOG)
      .filter(l => l.bet && l.odds && (!sold || l.sold !== false))
      .map(l => {
        const league = { family: familyOfSport(l.sport) };
        if (l.odds === 'espn') {
          league.path = l.espn;
          if (l.kambi) league.book = l.kambi;
        } else {
          league.kambi = l.kambi;
          if (l.data === 'asia') league.schedule = { asia: l.asia };
        }
        for (const k of ['logo', 'icon', 'badge', 'top']) if (l[k] !== undefined) league[k] = l[k];
        return [l.bet, league];
      })
  );
}

// ESPN's site API (scoreboards, summaries, teams) and its dates (YYYYMMDD, UTC).
export const ESPN_SITE = 'https://site.api.espn.com/apis/site/v2/sports';
export const yyyymmdd = date => date.toISOString().slice(0, 10).replaceAll('-', '');

// How far ahead Play sells a game (and Orbit Sports shows its 投注): one reach
// for every league and every price, a bookmaker's or the house's own (Play's
// house.mjs). Two weeks: the next two soccer matchweeks (an international
// break between), two football weeks, two weeks of daily sports, while a
// price still has most of the news it will get.
export const SOLD_DAYS = 14;

// ---- Asian baseball (NPB, KBO, CPBL) -------------------------------------------------
//
// The sports proxy gathers these from the leagues' own sites (Shared-Proxy's
// asia-baseball.js) and answers as if from this host, by month: { league,
// month, games: [{ id, start, home: { en, zh }, away, homeScore, awayScore,
// state: 'pre' | 'in' | 'post' | 'void', venue }] }. `getJson(url)` is the
// app's proxied fetch.
export const ASIA_URL = 'https://asia-baseball.quadra';
export const asiaMonthUrl = (league, ym) => `${ASIA_URL}/${league}/${ym}.json`;
// "2026-09" for a date (Asia's own calendar: UTC+8 is close enough for all three).
export const asiaMonthOf = ms => new Date(ms + 8 * 3_600_000).toISOString().slice(0, 7);
// The month's games. CPBL's own site has stopped answering, and the proxy's
// fallback (TheSportsDB) can refuse the proxy: a CPBL month the proxy can't
// fill comes from TheSportsDB's day lists straight from the device (they
// allow any site), the days from two weeks back to two weeks ahead.
// Nothing read anywhere (the proxy and every day on the device refused) is
// an error, never a month with no games: Sports said 沒有比賽 for 中華職棒
// while both were down (2026-10-18).
// (`useDirectReader(read)`: another reader of those day lists, `null` the plain one: the Worker
// building Play's board reads none, not eighty day lists asked of TheSportsDB every ten minutes.)
let direct = null;
export const useDirectReader = reader => (direct = reader);
const directly = url => (direct ? direct(url) : directJson(url));
export async function asiaMonth(getJson, league, ym, { now = Date.now(), fetchJson = directly } = {}) {
  let down = null;
  const data = await getJson(asiaMonthUrl(league, ym)).catch(error => ((down = error), null));
  const games = Array.isArray(data?.games) ? data.games : [];
  if (!down && !Array.isArray(data?.games)) down = new Error(`${league} ${ym}: no list`);
  if (league !== 'cpbl') {
    if (down) throw down;
    return games;
  }
  if (games.length) return cpblFresh(games, now, fetchJson);
  const days = tsdbDays(ym, now);
  let failed = 0;
  const lists = await Promise.all(days.map(d => fetchJson(`${TSDB_DAY}?d=${d}&l=${TSDB_CPBL}`).then(x => parseTsdbDay(x, now)).catch(() => (failed++, []))));
  if (down && failed === days.length) throw down;
  return lists.flat().sort((x, y) => x.start.localeCompare(y.start));
}

// The proxy's copy can lag a game (台灣大賽 G1 still "pre" the day after,
// 2026-10-18): a game three hours past its start and not over (nor called
// off) has its day read again from TheSportsDB on the device, its score and
// state taken from there.
async function cpblFresh(games, now, fetchJson) {
  const old = g => (g.state === 'pre' || g.state === 'in') && now - Date.parse(g.start) > 3 * 3_600_000 && now - Date.parse(g.start) < 14 * 86_400_000;
  const days = [...new Set(games.filter(old).map(g => new Date(Date.parse(g.start) + 8 * 3_600_000).toISOString().slice(0, 10)))];
  if (!days.length) return games;
  const fresh = (await Promise.all(days.map(d => fetchJson(`${TSDB_DAY}?d=${d}&l=${TSDB_CPBL}`).then(x => parseTsdbDay(x, now)).catch(() => [])))).flat();
  const key = g => `${g.start.slice(0, 10)}|${[g.home.en, g.away.en].sort().join('|')}`;
  const byKey = new Map(fresh.filter(g => g.state === 'post' || g.state === 'void').map(g => [key(g), g]));
  return games.map(g => {
    const f = old(g) && byKey.get(key(g));
    return f ? { ...g, homeScore: f.homeScore, awayScore: f.awayScore, state: f.state } : g;
  });
}

// ---- CPBL from TheSportsDB (the proxy's fallback, and the device's) ---------------
//
// Its free key answers a day's games a request (3 at most, CPBL's most in a
// day). Clubs as the proxy names them (asia-baseball.js).
export const TSDB_DAY = 'https://www.thesportsdb.com/api/v1/json/123/eventsday.php';
export const TSDB_CPBL = '5111';
export const CPBL_CLUBS = [
  ['CTBC Brothers', '中信兄弟'],
  ['Uni-President Lions', '統一7-ELEVEn獅'],
  ['Rakuten Monkeys', '樂天桃猿'],
  ['Fubon Guardians', '富邦悍將'],
  ['Wei Chuan Dragons', '味全龍'],
  ['TSG Hawks', '台鋼雄鷹']
];
const CPBL_BY_EN = Object.fromEntries(CPBL_CLUBS.map(([en, zh]) => [en.toLowerCase(), { en, zh }]));
const tsdbClub = name => CPBL_BY_EN[String(name || '').toLowerCase().replace(/ 7-eleven/, '')] ?? { en: name, zh: name };
const tsdbNum = x => (x === '' || x == null || !Number.isFinite(Number(x)) ? null : Number(x));
// A game past its start and not marked over counts as on for this long.
const TSDB_LONGEST = 5 * 3_600_000;
export function parseTsdbDay(data, now = Date.now()) {
  return (data?.events || []).map(e => {
    // UTC unless the timestamp names its own zone (Z, +00:00).
    const stamp = String(e.strTimestamp || `${e.dateEvent}T${e.strTime || '10:35:00'}`);
    const start = new Date(/(Z|[+-]\d\d:?\d\d)$/i.test(stamp) ? stamp : `${stamp}Z`).toISOString();
    const status = String(e.strStatus || '').toUpperCase();
    // A side held scoreless is left empty (Brothers None, Lions 1, final):
    // once either side has a score, the other's is 0.
    let homeScore = tsdbNum(e.intHomeScore);
    let awayScore = tsdbNum(e.intAwayScore);
    if ((homeScore == null) !== (awayScore == null)) (homeScore ??= 0), (awayScore ??= 0);
    const t = Date.parse(start);
    const state = /^(POST|PPD|CANC|ABD|AWD)/.test(status)
      ? 'void'
      : /^(FT|AOT|AET)/.test(status)
        ? 'post'
        : status && status !== 'NS'
          ? 'in'
          : now < t
            ? 'pre'
            : now - t < TSDB_LONGEST
              ? 'in'
              : homeScore != null && awayScore != null
                ? 'post'
                : 'pre';
    // A play-off game: round 0 (the regular season's are its rounds, 1 on).
    const round = tsdbNum(e.intRound);
    return { id: `cpbl-tsdb-${e.idEvent}`, start, home: tsdbClub(e.strHomeTeam), away: tsdbClub(e.strAwayTeam), homeScore, awayScore, state, venue: e.strVenue || '', ...(round === 0 ? { playoff: true } : {}) };
  });
}
// The month's days (Taiwan's calendar) from two weeks back to two weeks ahead.
export function tsdbDays(ym, now = Date.now()) {
  const days = [];
  for (let d = -14; d <= 14; d++) {
    const day = new Date(now + d * 86_400_000 + 8 * 3_600_000).toISOString().slice(0, 10);
    if (day.startsWith(ym)) days.push(day);
  }
  return days;
}
// Plain fetch, each answer kept 10 minutes in memory. Two at a time, and
// after a refusal none for a minute: a month's days asked at once (a few
// months, 80-odd) drew TheSportsDB's 429 (2026-10-17).
const directCache = new Map();
const DIRECT_AT_ONCE = 2;
const DIRECT_HOLD_MS = 60_000;
let directBusy = 0;
let directHeldUntil = 0;
const directQueue = [];
const directNext = () => {
  while (directBusy < DIRECT_AT_ONCE && directQueue.length) directQueue.shift()();
};
function directRead(url) {
  return new Promise((resolve, reject) => {
    directQueue.push(() => {
      if (Date.now() < directHeldUntil) return reject(new Error('held'));
      directBusy++;
      fetch(url)
        .then(r => {
          if (!r.ok) throw new Error(String(r.status));
          return r.json();
        })
        .then(resolve, error => {
          directHeldUntil = Date.now() + DIRECT_HOLD_MS;
          reject(error);
        })
        .finally(() => (directBusy--, directNext()));
    });
    directNext();
  });
}
function directJson(url) {
  const hit = directCache.get(url);
  if (hit && Date.now() - hit.at < 10 * 60_000) return hit.p;
  const p = directRead(url);
  directCache.set(url, { at: Date.now(), p });
  p.catch(() => directCache.delete(url));
  return p;
}
