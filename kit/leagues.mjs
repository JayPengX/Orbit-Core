import { knowsNation, rememberNation } from './logos.mjs';

// Every sport and league Quadra covers, once, for Fixtures and Play alike
// (copied into both by kit/sync.mjs; never edit an app's copy). Each app
// builds its own view of it (Fixtures' lib/leagues.mjs, Play's lib/teams.mjs),
// so a league added or fixed here reaches both.
//
//   sport   one of SPORTS
//   kind    'match' two sides; 'field' a race or tournament; 'card' a fight
//           card; 'draw' a tennis draw
//   data    where Fixtures reads its schedule and scores: 'espn' (espn path),
//           'kambi' (kambi path), 'asia' (the leagues' own sites, through the
//           sports proxy: asiaMonth below)
//   bet     Quadra Play's key when Play sells it; `odds` where Play prices it
//           ('espn': DraftKings through ESPN; 'kambi'), F1 has its own board
//   espn / kambi   the paths on each source (a league can have both)
//   play-only details: family (the kind of markets), sets (best of how
//   many, what a set is made of), neutral, cap (matches listed), results
//   (ESPN path a player's result is read from: tennis, fights), scores
//   (ESPN path, or paths, a Kambi-priced team game's result is read from), logo (ESPN
//   league logo id), icon, badge
//   players  sides are people (their nation's flag as the picture)
//   pro      Kambi's events of the league kept only where filed under one of
//            these words (table tennis: the pro tours, not the betting leagues)

export const SPORTS = {
  soccer: { zh: '足球', en: 'Soccer', icon: '⚽' },
  baseball: { zh: '棒球', en: 'Baseball', icon: '⚾' },
  basketball: { zh: '籃球', en: 'Basketball', icon: '🏀' },
  football: { zh: '美式足球', en: 'Football', icon: '🏈' },
  hockey: { zh: '冰球', en: 'Hockey', icon: '🏒' },
  tennis: { zh: '網球', en: 'Tennis', icon: '🎾' },
  racing: { zh: '賽車', en: 'Racing', icon: '🏎️' },
  golf: { zh: '高爾夫', en: 'Golf', icon: '⛳' },
  mma: { zh: '綜合格鬥', en: 'MMA', icon: '🥊' },
  rugby: { zh: '橄欖球', en: 'Rugby', icon: '🏉' },
  badminton: { zh: '羽球', en: 'Badminton', icon: '🏸' },
  tabletennis: { zh: '桌球', en: 'Table tennis', icon: '🏓' },
  volleyball: { zh: '排球', en: 'Volleyball', icon: '🏐' },
  snooker: { zh: '司諾克', en: 'Snooker', icon: '🎱' },
  cricket: { zh: '板球', en: 'Cricket', icon: '🏏' },
  boxing: { zh: '拳擊', en: 'Boxing', icon: '🥊' }
};

// Sports played in sets (the same kind of markets in Play).
export const SET_SPORTS = new Set(['tennis', 'badminton', 'tabletennis', 'volleyball', 'snooker']);

// Table tennis's pro tours and title events. Kambi also lists betting
// leagues played round the clock (Czech Liga Pro, TT Elite Series, TT Cup,
// Poland's Masters): those stay off both apps.
const PRO_TABLE_TENNIS = /wtt|ittf|world_(team_)?champ|world_cup|olympic|asian_(games|champ)|european_(games|champ)|commonwealth/;
// Volleyball's national teams, the big continental and world club events and
// the top pro leagues (Italy, Poland, Turkey, Japan), not the lower divisions.
const PRO_VOLLEYBALL = /superlega|serie_a1|plusliga|efeler|sultanlar|sv_league|v_league|champions_league|nations_league|vnl|world_champ|club_world|olympic|asian|fivb|cev/;
// Cricket: the international game and the IPL, not the domestic leagues.
const PRO_CRICKET = /^(international|icc|asian_games|world_cup|t20_world|champions_trophy|indian_premier|ipl|the_ashes)/;
// Rugby union: the international game and Europe's Champions Cup, not the domestic leagues.
const PRO_RUGBY = /^(international|six_nations|nations_championship|rugby_world_cup|rugby_championship|european_champions_cup|british_(and_)?irish_lions)/;
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
  // Spain's Liga ACB (Europe's strongest national league) and Australia's NBL, from Kambi.
  acb: { sport: 'basketball', kind: 'match', data: 'kambi', kambi: 'basketball/spain/liga_acb', zh: '西班牙籃球聯賽', en: 'Liga ACB', bet: 'acb', odds: 'kambi', icon: '🏀' },
  nbl: { sport: 'basketball', kind: 'match', data: 'kambi', kambi: 'basketball/australia/nbl', zh: '澳洲職籃 NBL', en: 'NBL', bet: 'nbl', odds: 'kambi', icon: '🏀' },
  // China's CBA and Korea's KBL, from Kambi (their seasons October to spring).
  cba: { sport: 'basketball', kind: 'match', data: 'kambi', kambi: 'basketball/china/cba', zh: '中國職籃 CBA', en: 'CBA', bet: 'cba', odds: 'kambi', icon: '🏀' },
  kbl: { sport: 'basketball', kind: 'match', data: 'kambi', kambi: 'basketball/south_korea/kbl', zh: '韓國職籃 KBL', en: 'KBL', bet: 'kbl', odds: 'kambi', icon: '🏀' },
  bleague: { sport: 'basketball', kind: 'match', data: 'kambi', kambi: 'basketball/japan/b1__league', zh: '日本 B 聯賽', en: 'B.League', bet: 'bleague', odds: 'kambi', icon: '🏀', badge: 'vcx6gw1745501883' },
  // Football
  nfl: espn('football', 'football/nfl', 'NFL', 'NFL', 'nfl', { top: true }),
  ncaaf: espn('football', 'football/college-football', 'NCAA 美足', 'College football', 'ncaaf'),
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
  eredivisie: soccer('ned.1', '荷甲', 'Eredivisie', 'eredivisie', { logo: 11 }),
  primeira: soccer('por.1', '葡超', 'Primeira Liga', 'primeira', { logo: 14 }),
  scotland: soccer('sco.1', '蘇超', 'Scottish Premiership', 'scotland', { logo: 45 }),
  belgium: soccer('bel.1', '比甲', 'Belgian Pro League', 'belgium', { logo: 6 }),
  superlig: soccer('tur.1', '土超', 'Süper Lig', 'superlig', { logo: 18 }),
  saudi: soccer('ksa.1', '沙烏地聯', 'Saudi Pro League', 'saudi', { logo: 2488 }),
  mls: soccer('usa.1', '美職足', 'MLS', 'mls', { logo: 19 }),
  ligamx: soccer('mex.1', '墨超', 'Liga MX', 'ligamx', { logo: 22 }),
  brasileirao: soccer('bra.1', '巴甲', 'Brasileirão', 'brasileirao', { logo: 85 }),
  argentina: soccer('arg.1', '阿甲', 'Liga Profesional', 'argentina', { logo: 1 }),
  libertadores: soccer('conmebol.libertadores', '解放者盃', 'Copa Libertadores', 'libertadores', { cup: true, logo: 58 }),
  sudamericana: soccer('conmebol.sudamericana', '南美球會盃', 'Copa Sudamericana', 'sudamericana', { cup: true, logo: 1208 }),
  // Korea's K League 1: not on ESPN, Kambi's schedule and prices (three-way).
  kleague: { sport: 'soccer', kind: 'match', data: 'kambi', kambi: 'football/south_korea/k-league_1', zh: '韓國職業足球聯賽', en: 'K League 1', bet: 'kleague', odds: 'kambi', icon: '⚽' },
  jleague: soccer('jpn.1', '日職聯', 'J1 League', 'jleague', { logo: 2199 }),
  facup: soccer('eng.fa', '英足總盃', 'FA Cup', 'facup', { cup: true, logo: 40 }),
  leaguecup: soccer('eng.league_cup', '英聯盃', 'EFL Cup', 'leaguecup', { cup: true, logo: 41 }),
  copadelrey: soccer('esp.copa_del_rey', '國王盃', 'Copa del Rey', 'copadelrey', { cup: true, logo: 80 }),
  acl: soccer('afc.champions', '亞冠菁英聯賽', 'AFC Champions League Elite', 'acl', { cup: true, logo: 2200 }),
  asiancup: soccer('afc.asian.cup', '亞洲盃', 'AFC Asian Cup', 'asiancup', { cup: true, logo: 2243 }),
  friendly: soccer('fifa.friendly', '國際友誼賽', 'International friendlies', 'friendly', { cup: true, logo: 53 }),
  // The big tournaments: every few years, the board fills when one is on.
  worldcup: soccer('fifa.world', '世界盃', 'FIFA World Cup', 'worldcup', { cup: true, logo: 4 }),
  euro: soccer('uefa.euro', '歐洲國家盃', 'UEFA Euro', 'euro', { cup: true, logo: 74 }),
  copaamerica: soccer('conmebol.america', '美洲盃', 'Copa América', 'copaamerica', { cup: true, logo: 83 }),
  clubworldcup: soccer('fifa.cwc', '世界俱樂部盃', 'FIFA Club World Cup', 'clubworldcup', { cup: true, logo: 1932 }),
  nationsleague: soccer('uefa.nations', '歐國聯', 'Nations League', 'nationsleague', { cup: true, logo: 2395 }),
  wcqeurope: soccer('fifa.worldq.uefa', '世界盃資格賽（歐洲）', 'WC qualifying (UEFA)', 'wcqeurope', { cup: true, logo: 67 }),
  // Tennis: Fixtures' draws from ESPN, Play's prices from Kambi (results from ESPN).
  atp: { sport: 'tennis', kind: 'draw', data: 'espn', espn: 'tennis/atp', kambi: 'tennis/atp', zh: 'ATP 男網', en: 'ATP', bet: 'tennis', odds: 'kambi', results: 'tennis/atp', icon: '🎾', neutral: true, players: true, sets: { bestOf: 3, unit: 'games', target: 6 } },
  wta: { sport: 'tennis', kind: 'draw', data: 'espn', espn: 'tennis/wta', kambi: 'tennis/wta', zh: 'WTA 女網', en: 'WTA', bet: 'wta', odds: 'kambi', results: 'tennis/wta', icon: '🎾', badge: 'bddhun1768230678', neutral: true, players: true, sets: { bestOf: 3, unit: 'games', target: 6 } },
  // Racing
  f1: { sport: 'racing', kind: 'field', data: 'espn', espn: 'racing/f1', zh: 'F1 一級方程式', en: 'Formula 1', bet: 'f1', top: true, standings: true },
  // Golf
  pga: { sport: 'golf', kind: 'field', data: 'espn', espn: 'golf/pga', zh: 'PGA 巡迴賽', en: 'PGA Tour' },
  lpga: { sport: 'golf', kind: 'field', data: 'espn', espn: 'golf/lpga', zh: 'LPGA', en: 'LPGA' },
  // Fighting
  // Fixtures' cards from ESPN; Play's prices from Kambi (each bout a match), results from ESPN.
  ufc: { sport: 'mma', kind: 'card', data: 'espn', espn: 'mma/ufc', kambi: 'ufc_mma/ufc', zh: 'UFC', en: 'UFC', bet: 'ufc', odds: 'kambi', results: 'mma/ufc', icon: '🥊', neutral: true, players: true },
  // Rugby union's internationals (tests, Six Nations, the Rugby Championship,
  // the Nations Championship, the World Cup, the Lions) and Europe's Champions
  // Cup: Kambi's schedule and prices, the results from ESPN's competitions.
  rugbyunion: { sport: 'rugby', kind: 'match', data: 'kambi', kambi: 'rugby_union', pro: PRO_RUGBY, zh: '國際橄欖球', en: 'International rugby', bet: 'rugbyunion', odds: 'kambi', scores: ['rugby/289234', 'rugby/180659', 'rugby/244293', 'rugby/17567', 'rugby/164205', 'rugby/268565', 'rugby/271937'], icon: '🏉' },
  // International cricket (one-day internationals, T20s, the World Cups, the
  // Asian Games, the IPL, the Ashes): Kambi's prices, results from ESPN's.
  cricket: { sport: 'cricket', kind: 'match', data: 'kambi', kambi: 'cricket', pro: PRO_CRICKET, zh: '國際板球', en: 'International cricket', bet: 'cricket', odds: 'kambi', players: true, icon: '🏏' },
  // Boxing: Kambi's bouts, only those on a card TheSportsDB lists (the main
  // events, not every undercard), settled from its results (notableFights).
  boxing: { sport: 'boxing', kind: 'match', data: 'kambi', kambi: 'boxing/upcoming_fights', notable: true, zh: '拳擊', en: 'Boxing', bet: 'boxing', odds: 'kambi', players: true, neutral: true, icon: '🥊' },
  // Played in sets, from Kambi
  badminton: { sport: 'badminton', kind: 'match', data: 'kambi', kambi: 'badminton', zh: '羽球', en: 'Badminton', bet: 'badminton', odds: 'kambi', players: true, icon: '🏸', badge: 'd5xvqq1750423289', neutral: true, sets: { bestOf: 3, unit: 'points', target: 21, cap: 30 } },
  tabletennis: { sport: 'tabletennis', kind: 'match', data: 'kambi', kambi: 'table_tennis', pro: PRO_TABLE_TENNIS, zh: '桌球', en: 'Table tennis', bet: 'tabletennis', odds: 'kambi', players: true, icon: '🏓', badge: 'fvesg01750422363', neutral: true, sets: { bestOf: 5, unit: 'points', target: 11 }, cap: 16 },
  volleyball: { sport: 'volleyball', kind: 'match', data: 'kambi', kambi: 'volleyball', pro: PRO_VOLLEYBALL, zh: '排球', en: 'Volleyball', bet: 'volleyball', odds: 'kambi', icon: '🏐', sets: { bestOf: 5, unit: 'points', target: 25, last: 15 }, cap: 16 },
  snooker: { sport: 'snooker', kind: 'match', data: 'kambi', kambi: 'snooker', zh: '司諾克', en: 'Snooker', bet: 'snooker', odds: 'kambi', players: true, icon: '🎱', badge: '0gmkgj1555600537', neutral: true, sets: { bestOf: null, unit: 'frames' } },
  // Racing Taiwan watches besides F1: Formula E (Disney+ from 2026-27, its
  // practice free on YouTube; the calendar from TheSportsDB, open to
  // browsers) and MotoGP (緯來; the series' own results API, through the proxy).
  formulae: { sport: 'racing', kind: 'field', data: 'tsdb', tsdb: 4371, zh: 'Formula E 電動方程式', en: 'Formula E', icon: '⚡' },
  motogp: { sport: 'racing', kind: 'field', data: 'motogp', zh: 'MotoGP 世界摩托車錦標賽', en: 'MotoGP', icon: '🏍️' },
  // F1's feeder series, on ELTA.tv (MAX 5-8) in Taiwan: their own sites'
  // calendars and session times (through the proxy, trimmed: trimFom).
  f2: { sport: 'racing', kind: 'field', data: 'fom', fom: 'www.fiaformula2.com', zh: 'F2 二級方程式', en: 'Formula 2', icon: '🏎️' },
  f3: { sport: 'racing', kind: 'field', data: 'fom', fom: 'www.fiaformula3.com', zh: 'F3 三級方程式', en: 'Formula 3', icon: '🏎️' }
};

// Leagues no one in Taiwan can watch (no channel, no streaming service,
// nothing on YouTube; checked October 2026): off both apps' lists and Play's
// sale, kept here so bets already placed on them still settle.
export const NO_TAIWAN = ['acb', 'nbl', 'cba', 'kbl', 'bleague', 'ncaaf', 'eredivisie', 'primeira', 'belgium', 'superlig', 'saudi', 'ligamx', 'brasileirao', 'argentina', 'libertadores', 'sudamericana', 'leaguecup', 'copadelrey', 'acl', 'asiancup', 'friendly', 'euro', 'copaamerica', 'clubworldcup', 'rugbyunion', 'cricket', 'snooker'];
for (const k of NO_TAIWAN) if (CATALOG[k]) CATALOG[k].off = true;

// Whether Kambi's event (its group and path words) belongs on the board of
// the league with this catalogue key or Play key: every event, but for a
// league with `pro` only those filed under one of its words.
export function kambiKept(key, event) {
  const pro = (CATALOG[key] ?? byBetKey[key])?.pro;
  if (!pro) return true;
  const words = [event?.group, ...(event?.path || []).map(p => (typeof p === 'string' ? p : p?.termKey))].filter(Boolean).map(w => String(w).toLowerCase().replace(/[\s-]+/g, '_'));
  return words.some(w => pro.test(w));
}

// Play's kind of markets for a sport.
export const familyOfSport = sport => (SET_SPORTS.has(sport) ? 'sets' : sport);

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

// ---- Boxing from TheSportsDB ------------------------------------------------------
//
// Kambi lists every bout of a card; TheSportsDB (league 4445, its free key,
// straight from the device) lists the cards that matter, named after their
// main event ("Ben Whittaker vs Conor Wallace") and, once over, each bout's
// result ("Johnny Fisher def. Michael Pirotton - Majority Decision …").
export const TSDB_BOXING = '4445';
const surname = name => String(name || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z ]/g, '').trim().split(/\s+/).pop() || '';
const names = (text, a, b) => {
  const t = String(text || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return [surname(a), surname(b)].every(s => s.length >= 3 && t.includes(s));
};
// The cards on these days (Taiwan's dates, "2026-10-03"): { day: events }.
export async function tsdbBoxingDays(days, fetchJson = directJson) {
  const lists = await Promise.all(days.map(d => fetchJson(`${TSDB_DAY}?d=${d}&l=${TSDB_BOXING}`).then(x => x?.events || []).catch(() => null)));
  return Object.fromEntries(days.map((d, i) => [d, lists[i]]));
}
// Boxers' nations, from TheSportsDB's player pages (a few a load, each once
// a month at most), for their flags: remembered by the kit's logos.mjs.
const TSDB_PLAYERS = 'https://www.thesportsdb.com/api/v1/json/3/searchplayers.php';
export async function learnFighterNations(fighters, fetchJson = directJson) {
  const todo = [...new Set(fighters)].filter(n => n && !knowsNation(n)).slice(0, 40);
  await Promise.all(
    todo.map(name =>
      fetchJson(`${TSDB_PLAYERS}?p=${encodeURIComponent(name)}`)
        .then(x => rememberNation(name, (x?.player || []).find(p => p.strSport === 'Fighting')?.strNationality || ''))
        .catch(() => {})
    )
  );
}
// A bout worth listing: its two fighters named by one of the day's cards.
export const notableFight = (home, away, events) => (events || []).some(e => names(e.strEvent, home, away));
// A bout's result from the cards' write-ups: { status: 'final', homeScore,
// awayScore } (1-0), 'void' for a draw or no contest, or null while unknown.
export function boxingResult(events, home, away) {
  for (const e of events || []) {
    const text = String(e.strResult || '');
    for (const line of text.split(/\r?\n/)) {
      if (!names(line, home, away)) continue;
      if (/\b(draw|no contest|no decision)\b/i.test(line) && !/\bdef\./i.test(line)) return { status: 'void' };
      const m = /^(.+?)\s+def\.\s+(.+?)(\s+-|$)/i.exec(line.trim());
      if (m) return names(m[1], home, home) ? { status: 'final', homeScore: 1, awayScore: 0 } : { status: 'final', homeScore: 0, awayScore: 1 };
    }
    // A main event told in prose only: the fighter named first in its opening sentence won.
    const first = text.split(/[.!]\s/)[0].toLowerCase();
    if (names(first, home, away) && /\b(def|defeated|beat|won|retained|stopped|knocked)\b/.test(first)) {
      const [h, a] = [first.indexOf(surname(home)), first.indexOf(surname(away))];
      return h < a ? { status: 'final', homeScore: 1, awayScore: 0 } : { status: 'final', homeScore: 0, awayScore: 1 };
    }
  }
  return null;
}
