// Every sport and league Quadra covers, once, for Fixtures and Play alike
// (copied into both by kit/sync.mjs; never edit an app's copy). Each app
// builds its own view of it (Fixtures' lib/leagues.mjs, Play's lib/teams.mjs),
// so a league added or fixed here reaches both.
//
//   sport   one of SPORTS
//   kind    'match' two sides; 'field' a race weekend
//   data    where its schedule and scores come from: 'espn' (espn path),
//           'kambi' (kambi path), 'asia' (the leagues' own sites, through the
//           sports proxy: asiaMonth below), 'fom' (F2 and F3's own sites,
//           through the proxy). Fixtures shows only the leagues on ELTA.tv
//           or Apple TV in Taiwan (its lib/broadcast.mjs).
//   bet     Quadra Play's key when Play sells it; `odds` where Play prices it
//           ('espn': DraftKings through ESPN; 'kambi'), F1 has its own board
//   espn / kambi   the paths on each source (a league can have both)
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
  mlb: espn('baseball', 'baseball/mlb', 'MLB 美國職棒', 'MLB', 'mlb', { top: true }),
  npb: { sport: 'baseball', kind: 'match', data: 'asia', asia: 'npb', kambi: 'baseball/japan/npb', zh: '日本職棒', en: 'NPB', bet: 'npb', odds: 'kambi', icon: '⚾', badge: 'lk85rg1575038781' },
  kbo: { sport: 'baseball', kind: 'match', data: 'asia', asia: 'kbo', kambi: 'baseball/south_korea/kbo_league', zh: '韓國職棒', en: 'KBO', bet: 'kbo', odds: 'kambi', icon: '⚾', badge: 'qfr1hx1589707979' },
  cpbl: { sport: 'baseball', kind: 'match', data: 'asia', asia: 'cpbl', kambi: 'baseball/taiwan/chinese_professional_baseball', zh: '中華職棒', en: 'CPBL', bet: 'cpbl', odds: 'kambi', top: true, icon: '⚾', badge: 'c3vetj1655924198' },
  // Basketball
  nba: espn('basketball', 'basketball/nba', 'NBA', 'NBA', 'nba', { top: true }),
  wnba: espn('basketball', 'basketball/wnba', 'WNBA', 'WNBA', 'wnba'),
  euroleague: { sport: 'basketball', kind: 'match', data: 'kambi', kambi: 'basketball/euroleague', zh: '歐洲籃球聯賽', en: 'EuroLeague', bet: 'euroleague', odds: 'kambi', icon: '🏀', badge: '7xjtuy1554397263' },
  // Football
  nfl: espn('football', 'football/nfl', 'NFL', 'NFL', 'nfl', { top: true }),
  // Hockey
  nhl: espn('hockey', 'hockey/nhl', 'NHL', 'NHL', 'nhl'),
  // Soccer
  epl: soccer('eng.1', '英超', 'Premier League', 'epl', { top: true, logo: 23 }),
  laliga: soccer('esp.1', '西甲', 'LaLiga', 'laliga', { top: true, logo: 15 }),
  seriea: soccer('ita.1', '義甲', 'Serie A', 'seriea', { logo: 12 }),
  bundesliga: soccer('ger.1', '德甲', 'Bundesliga', 'bundesliga', { logo: 10 }),
  ligue1: soccer('fra.1', '法甲', 'Ligue 1', 'ligue1', { logo: 9 }),
  ucl: soccer('uefa.champions', '歐冠', 'Champions League', 'ucl', { top: true, cup: true, logo: 2 }),
  uel: soccer('uefa.europa', '歐霸', 'Europa League', 'uel', { cup: true, logo: 2310 }),
  uecl: soccer('uefa.europa.conf', '歐協聯', 'Conference League', 'uecl', { cup: true, logo: 20296 }),
  scotland: soccer('sco.1', '蘇超', 'Scottish Premiership', 'scotland', { logo: 45 }),
  mls: soccer('usa.1', '美職足', 'MLS', 'mls', { logo: 19 }),
  // Korea's K League 1: not on ESPN, Kambi's schedule and prices (three-way).
  kleague: { sport: 'soccer', kind: 'match', data: 'kambi', kambi: 'football/south_korea/k-league_1', zh: '韓國職業足球聯賽', en: 'K League 1', bet: 'kleague', odds: 'kambi', icon: '⚽' },
  jleague: soccer('jpn.1', '日職聯', 'J1 League', 'jleague', { logo: 2199 }),
  facup: soccer('eng.fa', '英足總盃', 'FA Cup', 'facup', { cup: true, logo: 40 }),
  // The big tournaments: every few years, the board fills when one is on.
  worldcup: soccer('fifa.world', '世界盃', 'FIFA World Cup', 'worldcup', { cup: true, logo: 4 }),
  nationsleague: soccer('uefa.nations', '歐國聯', 'Nations League', 'nationsleague', { cup: true, logo: 2395 }),
  // Racing
  f1: { sport: 'racing', kind: 'field', data: 'espn', espn: 'racing/f1', zh: 'F1 一級方程式', en: 'Formula 1', bet: 'f1', top: true, standings: true },
  // F1's feeder series, on ELTA.tv (MAX 5-8) in Taiwan: their own sites'
  // calendars and session times (through the proxy, trimmed: trimFom).
  f2: { sport: 'racing', kind: 'field', data: 'fom', fom: 'www.fiaformula2.com', zh: 'F2 二級方程式', en: 'Formula 2', icon: '🏎️' },
  f3: { sport: 'racing', kind: 'field', data: 'fom', fom: 'www.fiaformula3.com', zh: 'F3 三級方程式', en: 'Formula 3', icon: '🏎️' },
};

// Play's kind of markets for a sport.
export const familyOfSport = sport => sport;

// How far ahead Play sells a game (and Fixtures shows its 投注): one reach
// for every league and every price, a bookmaker's or the house's own (Play's
// house.mjs). Two weeks: the next two soccer matchweeks (an international
// break between), two football weeks, two weeks of daily sports, while a
// price still has most of the news it will get.
export const SOLD_DAYS = 14;

// The catalogue entry for one of Play's keys.
export const byBetKey = Object.fromEntries(Object.entries(CATALOG).filter(([, l]) => l.bet).map(([key, l]) => [l.bet, { key, ...l }]));

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
export async function asiaMonth(getJson, league, ym, { now = Date.now(), fetchJson = directJson } = {}) {
  const data = await getJson(asiaMonthUrl(league, ym)).catch(() => null);
  const games = Array.isArray(data?.games) ? data.games : [];
  if (league !== 'cpbl' || games.length) return games;
  const days = tsdbDays(ym, now);
  const lists = await Promise.all(days.map(d => fetchJson(`${TSDB_DAY}?d=${d}&l=${TSDB_CPBL}`).then(x => parseTsdbDay(x, now)).catch(() => [])));
  return lists.flat().sort((x, y) => x.start.localeCompare(y.start));
}

// ---- CPBL from TheSportsDB (the proxy's fallback, and the device's) ---------------
//
// Its free key answers a day's games a request (3 at most, CPBL's most in a
// day). Clubs as the proxy names them (asia-baseball.js).
export const TSDB_DAY = 'https://www.thesportsdb.com/api/v1/json/3/eventsday.php';
export const TSDB_CPBL = '5111';
const CPBL_CLUBS = [
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
    const start = new Date(`${String(e.strTimestamp || `${e.dateEvent}T${e.strTime || '10:35:00'}`).replace(/Z?$/, 'Z')}`).toISOString();
    const status = String(e.strStatus || '').toUpperCase();
    const homeScore = tsdbNum(e.intHomeScore);
    const awayScore = tsdbNum(e.intAwayScore);
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
    return { id: `cpbl-tsdb-${e.idEvent}`, start, home: tsdbClub(e.strHomeTeam), away: tsdbClub(e.strAwayTeam), homeScore, awayScore, state, venue: e.strVenue || '' };
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
// Plain fetch, each answer kept 10 minutes in memory.
const directCache = new Map();
function directJson(url) {
  const hit = directCache.get(url);
  if (hit && Date.now() - hit.at < 10 * 60_000) return hit.p;
  const p = fetch(url).then(r => {
    if (!r.ok) throw new Error(String(r.status));
    return r.json();
  });
  directCache.set(url, { at: Date.now(), p });
  p.catch(() => directCache.delete(url));
  return p;
}
