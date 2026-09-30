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
//   (ESPN path a Kambi-priced team game's result is read from), logo (ESPN
//   league logo id), icon, badge
//   players  sides are people (their nation's flag as the picture)

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
  aussie: { zh: '澳式足球', en: 'Aussie rules', icon: '🏉' },
  badminton: { zh: '羽球', en: 'Badminton', icon: '🏸' },
  tabletennis: { zh: '桌球', en: 'Table tennis', icon: '🏓' },
  volleyball: { zh: '排球', en: 'Volleyball', icon: '🏐' },
  snooker: { zh: '司諾克', en: 'Snooker', icon: '🎱' }
};

// Sports played in sets (the same kind of markets in Play).
export const SET_SPORTS = new Set(['tennis', 'badminton', 'tabletennis', 'volleyball', 'snooker']);

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
  ncaam: espn('basketball', 'basketball/mens-college-basketball', 'NCAA 男籃', 'NCAA Men', 'ncaam'),
  ncaaw: espn('basketball', 'basketball/womens-college-basketball', 'NCAA 女籃', 'NCAA Women', 'ncaaw'),
  euroleague: { sport: 'basketball', kind: 'match', data: 'kambi', kambi: 'basketball/euroleague', zh: '歐洲籃球聯賽', en: 'EuroLeague', bet: 'euroleague', odds: 'kambi', icon: '🏀', badge: '7xjtuy1554397263' },
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
  championship: soccer('eng.2', '英冠', 'Championship', 'championship', { logo: 24 }),
  league1: soccer('eng.3', '英甲', 'League One', 'league1', { logo: 25 }),
  scotland: soccer('sco.1', '蘇超', 'Scottish Premiership', 'scotland', { logo: 45 }),
  bundesliga2: soccer('ger.2', '德乙', '2. Bundesliga', 'bundesliga2', { logo: 97 }),
  laliga2: soccer('esp.2', '西乙', 'LaLiga 2', 'laliga2', { logo: 107 }),
  serieb: soccer('ita.2', '義乙', 'Serie B', 'serieb', { logo: 99 }),
  ligue2: soccer('fra.2', '法乙', 'Ligue 2', 'ligue2', { logo: 96 }),
  belgium: soccer('bel.1', '比甲', 'Belgian Pro League', 'belgium', { logo: 6 }),
  austria: soccer('aut.1', '奧超', 'Austrian Bundesliga', 'austria', { logo: 5 }),
  swiss: soccer('sui.1', '瑞士超', 'Swiss Super League', 'swiss', { logo: 17 }),
  denmark: soccer('den.1', '丹超', 'Danish Superliga', 'denmark'),
  norway: soccer('nor.1', '挪超', 'Eliteserien', 'norway'),
  sweden: soccer('swe.1', '瑞典超', 'Allsvenskan', 'sweden', { logo: 16 }),
  greece: soccer('gre.1', '希超', 'Greek Super League', 'greece', { logo: 98 }),
  superlig: soccer('tur.1', '土超', 'Süper Lig', 'superlig', { logo: 18 }),
  saudi: soccer('ksa.1', '沙烏地聯', 'Saudi Pro League', 'saudi', { logo: 2488 }),
  mls: soccer('usa.1', '美職足', 'MLS', 'mls', { logo: 19 }),
  usl: soccer('usa.usl.1', 'USL', 'USL Championship', 'usl', { logo: 2292 }),
  nwsl: soccer('usa.nwsl', '美國女足聯', 'NWSL', 'nwsl', { logo: 2323 }),
  ligamx: soccer('mex.1', '墨超', 'Liga MX', 'ligamx', { logo: 22 }),
  brasileirao: soccer('bra.1', '巴甲', 'Brasileirão', 'brasileirao', { logo: 85 }),
  argentina: soccer('arg.1', '阿甲', 'Liga Profesional', 'argentina', { logo: 1 }),
  colombia: soccer('col.1', '哥甲', 'Colombian Primera A', 'colombia', { logo: 1543 }),
  chile: soccer('chi.1', '智甲', 'Chilean Primera', 'chile', { logo: 86 }),
  libertadores: soccer('conmebol.libertadores', '解放者盃', 'Copa Libertadores', 'libertadores', { cup: true, logo: 58 }),
  sudamericana: soccer('conmebol.sudamericana', '南美球會盃', 'Copa Sudamericana', 'sudamericana', { cup: true, logo: 1208 }),
  jleague: soccer('jpn.1', '日職聯', 'J1 League', 'jleague', { logo: 2199 }),
  csl: soccer('chn.1', '中超', 'Chinese Super League', 'csl', { logo: 2350 }),
  aleague: soccer('aus.1', '澳超', 'A-League', 'aleague', { logo: 1308 }),
  facup: soccer('eng.fa', '英足總盃', 'FA Cup', 'facup', { cup: true, logo: 40 }),
  leaguecup: soccer('eng.league_cup', '英聯盃', 'EFL Cup', 'leaguecup', { cup: true, logo: 41 }),
  copadelrey: soccer('esp.copa_del_rey', '國王盃', 'Copa del Rey', 'copadelrey', { cup: true, logo: 80 }),
  nationsleague: soccer('uefa.nations', '歐國聯', 'Nations League', 'nationsleague', { cup: true, logo: 2395 }),
  wcqeurope: soccer('fifa.worldq.uefa', '世界盃資格賽（歐洲）', 'WC qualifying (UEFA)', 'wcqeurope', { cup: true, logo: 67 }),
  // Tennis: Fixtures' draws from ESPN, Play's prices from Kambi (results from ESPN).
  atp: { sport: 'tennis', kind: 'draw', data: 'espn', espn: 'tennis/atp', kambi: 'tennis/atp', zh: 'ATP 男網', en: 'ATP', bet: 'tennis', odds: 'kambi', results: 'tennis/atp', icon: '🎾', neutral: true, players: true, sets: { bestOf: 3, unit: 'games', target: 6 } },
  wta: { sport: 'tennis', kind: 'draw', data: 'espn', espn: 'tennis/wta', kambi: 'tennis/wta', zh: 'WTA 女網', en: 'WTA', bet: 'wta', odds: 'kambi', results: 'tennis/wta', icon: '🎾', badge: 'bddhun1768230678', neutral: true, players: true, sets: { bestOf: 3, unit: 'games', target: 6 } },
  // Racing
  f1: { sport: 'racing', kind: 'field', data: 'espn', espn: 'racing/f1', zh: 'F1 一級方程式', en: 'Formula 1', bet: 'f1', top: true, standings: true },
  indycar: { sport: 'racing', kind: 'field', data: 'espn', espn: 'racing/irl', zh: 'IndyCar', en: 'IndyCar' },
  nascar: { sport: 'racing', kind: 'field', data: 'espn', espn: 'racing/nascar-premier', zh: 'NASCAR', en: 'NASCAR Cup' },
  // Golf
  pga: { sport: 'golf', kind: 'field', data: 'espn', espn: 'golf/pga', zh: 'PGA 巡迴賽', en: 'PGA Tour' },
  lpga: { sport: 'golf', kind: 'field', data: 'espn', espn: 'golf/lpga', zh: 'LPGA', en: 'LPGA' },
  // Fighting
  // Fixtures' cards from ESPN; Play's prices from Kambi (each bout a match), results from ESPN.
  ufc: { sport: 'mma', kind: 'card', data: 'espn', espn: 'mma/ufc', kambi: 'ufc_mma/ufc', zh: 'UFC', en: 'UFC', bet: 'ufc', odds: 'kambi', results: 'mma/ufc', icon: '🥊', neutral: true, players: true },
  // Rugby and Aussie rules: ESPN's schedules and scores, Kambi's prices.
  nrl: { sport: 'rugby', kind: 'match', data: 'espn', espn: 'rugby-league/3', kambi: 'rugby_league/nrl', zh: 'NRL 聯盟式橄欖球', en: 'NRL', bet: 'nrl', odds: 'kambi', scores: 'rugby-league/3', icon: '🏉' },
  afl: { sport: 'aussie', kind: 'match', data: 'espn', espn: 'australian-football/afl', kambi: 'australian_rules/afl', zh: 'AFL 澳式足球', en: 'AFL', bet: 'afl', odds: 'kambi', scores: 'australian-football/afl', icon: '🏉' },
  // Played in sets, from Kambi
  badminton: { sport: 'badminton', kind: 'match', data: 'kambi', kambi: 'badminton', zh: '羽球', en: 'Badminton', bet: 'badminton', odds: 'kambi', players: true, icon: '🏸', badge: 'd5xvqq1750423289', neutral: true, sets: { bestOf: 3, unit: 'points', target: 21, cap: 30 } },
  tabletennis: { sport: 'tabletennis', kind: 'match', data: 'kambi', kambi: 'table_tennis', zh: '桌球', en: 'Table tennis', bet: 'tabletennis', odds: 'kambi', players: true, icon: '🏓', badge: 'fvesg01750422363', neutral: true, sets: { bestOf: 5, unit: 'points', target: 11 }, cap: 16 },
  volleyball: { sport: 'volleyball', kind: 'match', data: 'kambi', kambi: 'volleyball', zh: '排球', en: 'Volleyball', bet: 'volleyball', odds: 'kambi', icon: '🏐', sets: { bestOf: 5, unit: 'points', target: 25, last: 15 }, cap: 16 },
  snooker: { sport: 'snooker', kind: 'match', data: 'kambi', kambi: 'snooker', zh: '司諾克', en: 'Snooker', bet: 'snooker', odds: 'kambi', players: true, icon: '🎱', badge: '0gmkgj1555600537', neutral: true, sets: { bestOf: null, unit: 'frames' } }
};

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
