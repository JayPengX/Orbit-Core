// Quadra's logos, for every app that shows a team, a league or a driver
// (Quadra Play and Quadra Fixtures): ESPN's logo files, TheSportsDB's club
// and league badges for what ESPN doesn't carry, national flags, and the F1
// grid's colours. Keys are Quadra Play's league keys (Fixtures maps its own
// to them). Part of the shared kit: edit it in Shared-Proxy/kit, copy it with
// `node kit/sync.mjs`.

// Strips club-suffix boilerplate so ESPN's "Liverpool" matches Polymarket's
// "Liverpool FC" and "AFC Bournemouth" matches "Bournemouth".
export function normalizeTeamName(name) {
  return (name || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' ')
    .replace(/\b(fc|afc|cf|sc|and)\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}


// ---- Team logos ------------------------------------------------------------------

// ESPN's logo files: MLB by abbreviation, soccer clubs by ESPN id.
export const MLB_ABBR = {
  'Arizona Diamondbacks': 'ari', Athletics: 'ath', 'Oakland Athletics': 'ath', 'Atlanta Braves': 'atl', 'Baltimore Orioles': 'bal',
  'Boston Red Sox': 'bos', 'Chicago Cubs': 'chc', 'Chicago White Sox': 'chw', 'Cincinnati Reds': 'cin', 'Cleveland Guardians': 'cle',
  'Colorado Rockies': 'col', 'Detroit Tigers': 'det', 'Houston Astros': 'hou', 'Kansas City Royals': 'kc', 'Los Angeles Angels': 'laa',
  'Los Angeles Dodgers': 'lad', 'Miami Marlins': 'mia', 'Milwaukee Brewers': 'mil', 'Minnesota Twins': 'min', 'New York Mets': 'nym',
  'New York Yankees': 'nyy', 'Philadelphia Phillies': 'phi', 'Pittsburgh Pirates': 'pit', 'San Diego Padres': 'sd', 'San Francisco Giants': 'sf',
  'Seattle Mariners': 'sea', 'St. Louis Cardinals': 'stl', 'Tampa Bay Rays': 'tb', 'Texas Rangers': 'tex', 'Toronto Blue Jays': 'tor',
  'Washington Nationals': 'wsh'
};
// NBA.com's team ids: its own logos (cdn.nba.com), the primary marks (ESPN's
// files are some clubs' alternates: the Celtics' shamrock, not Lucky).
const NBA = 16106127;
export const NBA_ID = {
  'Atlanta Hawks': 37, 'Boston Celtics': 38, 'Brooklyn Nets': 51, 'Charlotte Hornets': 66, 'Chicago Bulls': 41,
  'Cleveland Cavaliers': 39, 'Dallas Mavericks': 42, 'Denver Nuggets': 43, 'Detroit Pistons': 65, 'Golden State Warriors': 44,
  'Houston Rockets': 45, 'Indiana Pacers': 54, 'Los Angeles Clippers': 46, 'LA Clippers': 46, 'Los Angeles Lakers': 47,
  'Memphis Grizzlies': 63, 'Miami Heat': 48, 'Milwaukee Bucks': 49, 'Minnesota Timberwolves': 50, 'New Orleans Pelicans': 40,
  'New York Knicks': 52, 'Oklahoma City Thunder': 60, 'Orlando Magic': 53, 'Philadelphia 76ers': 55, 'Phoenix Suns': 56,
  'Portland Trail Blazers': 57, 'Sacramento Kings': 58, 'San Antonio Spurs': 59, 'Toronto Raptors': 61, 'Utah Jazz': 62,
  'Washington Wizards': 64
};
export const EPL_ESPN_ID = {
  arsenal: 359, 'aston villa': 362, bournemouth: 349, brentford: 337, brighton: 331, 'brighton hove albion': 331, burnley: 379,
  chelsea: 363, 'coventry city': 388, 'crystal palace': 384, everton: 368, fulham: 370, 'hull city': 306, 'ipswich town': 373,
  'leeds united': 357, 'leicester city': 375, liverpool: 364, 'manchester city': 382, 'manchester united': 360,
  'newcastle united': 361, 'nottingham forest': 393, southampton: 376, sunderland: 366, tottenham: 367, 'tottenham hotspur': 367,
  'west ham united': 371, 'wolverhampton wanderers': 380, wolves: 380
};

// Logos ESPN's scoreboards give for teams of leagues without a table here.
const seenLogos = new Map();
export const NFL_ABBR = {
  'Arizona Cardinals': 'ari', 'Atlanta Falcons': 'atl', 'Baltimore Ravens': 'bal', 'Buffalo Bills': 'buf', 'Carolina Panthers': 'car',
  'Chicago Bears': 'chi', 'Cincinnati Bengals': 'cin', 'Cleveland Browns': 'cle', 'Dallas Cowboys': 'dal', 'Denver Broncos': 'den',
  'Detroit Lions': 'det', 'Green Bay Packers': 'gb', 'Houston Texans': 'hou', 'Indianapolis Colts': 'ind', 'Jacksonville Jaguars': 'jax',
  'Kansas City Chiefs': 'kc', 'Las Vegas Raiders': 'lv', 'Los Angeles Chargers': 'lac', 'Los Angeles Rams': 'lar', 'Miami Dolphins': 'mia',
  'Minnesota Vikings': 'min', 'New England Patriots': 'ne', 'New Orleans Saints': 'no', 'New York Giants': 'nyg', 'New York Jets': 'nyj',
  'Philadelphia Eagles': 'phi', 'Pittsburgh Steelers': 'pit', 'San Francisco 49ers': 'sf', 'Seattle Seahawks': 'sea', 'Tampa Bay Buccaneers': 'tb',
  'Tennessee Titans': 'ten', 'Washington Commanders': 'wsh'
};
export const NHL_ABBR = {
  'Anaheim Ducks': 'ana', 'Boston Bruins': 'bos', 'Buffalo Sabres': 'buf', 'Calgary Flames': 'cgy', 'Carolina Hurricanes': 'car',
  'Chicago Blackhawks': 'chi', 'Colorado Avalanche': 'col', 'Columbus Blue Jackets': 'cbj', 'Dallas Stars': 'dal', 'Detroit Red Wings': 'det',
  'Edmonton Oilers': 'edm', 'Florida Panthers': 'fla', 'Los Angeles Kings': 'la', 'Minnesota Wild': 'min', 'Montreal Canadiens': 'mtl',
  'Montréal Canadiens': 'mtl', 'Nashville Predators': 'nsh', 'New Jersey Devils': 'nj', 'New York Islanders': 'nyi', 'New York Rangers': 'nyr',
  'Ottawa Senators': 'ott', 'Philadelphia Flyers': 'phi', 'Pittsburgh Penguins': 'pit', 'San Jose Sharks': 'sj', 'Seattle Kraken': 'sea',
  'St. Louis Blues': 'stl', 'St Louis Blues': 'stl', 'Tampa Bay Lightning': 'tb', 'Toronto Maple Leafs': 'tor', 'Utah Mammoth': 'utah', 'Utah Hockey Club': 'utah',
  'Vancouver Canucks': 'van', 'Vegas Golden Knights': 'vgk', 'Washington Capitals': 'wsh', 'Winnipeg Jets': 'wpg'
};
export function rememberLogo(sport, name, url) {
  if (url) seenLogos.set(`${sport}|${normalizeTeamName(name)}`, url);
}

// Club badges from TheSportsDB (free, hot-linkable) for the leagues ESPN
// doesn't cover, by club name; a feed's own spelling finds its club by the
// words the names share (Kambi's "Yokohama Bay Stars", "KT Wiz Suwon").
const SPORTSDB = 'https://r2.thesportsdb.com/images/media';
export const TEAM_BADGES = {
  cpbl: { 'CTBC Brothers': 'nbtugc1655923087', 'Fubon Guardians': 'aj83wn1655923095', 'Rakuten Monkeys': 'kk0rch1655923103', 'TSG Hawks': 'n67jn51712658044', 'Uni-President Lions': 'kehxfy1655923111', 'Wei Chuan Dragons': 'ljv5o51655923122' },
  npb: { 'Chiba Lotte Marines': 'na10tn1576008207', 'Chunichi Dragons': 'jli5jv1576009060', 'Fukuoka SoftBank Hawks': 'ampozy1576009547', 'Hanshin Tigers': 'h2jhos1576009994', 'Hiroshima Toyo Carp': 'bv50e51576010505', 'Hokkaido Nippon-Ham Fighters': 'qxgzq01576011016', 'Orix Buffaloes': '53lv6f1576011517', 'Saitama Seibu Lions': 'onmvow1576012163', 'Tohoku Rakuten Golden Eagles': 'qx24pm1576012656', 'Tokyo Yakult Swallows': 'ryyku01576013231', 'Yokohama DeNA BayStars': 'fuhqf21576013789', 'Yomiuri Giants': '0qyqs41576014298' },
  kbo: { 'Doosan Bears': '2qo9zp1740573854', 'Hanwha Eagles': '7aztmc1740573842', 'KT Wiz': 'qk8erg1589709962', 'Kia Tigers': '2z389i1648069353', 'Kiwoom Heroes': 'qcj18p1589709259', 'LG Twins': 'ajpsiq1648069368', 'Lotte Giants': 'p7q92w1742225576', 'NC Dinos': '6gwcg81589708218', 'SSG Landers': 'kii9pd1742225451', 'Samsung Lions': '5u6k511589709673' },
  euroleague: { 'AS Monaco Basket': 'fl2ti01649168915', 'Anadolu Efes SK': 'uldz0d1782050729', 'BC Žalgiris': 'dn7ouv1703960565', 'Baskonia': 'p4x3o61767366090', 'Bayern München Basketball': 'z2r3eh1678017187', 'Dubai Basketball': 'fgtnti1758215967', 'FC Barcelona Basquet': '0tz26j1729097443', 'Hapoel Tel Aviv BC': 'yrrsml1767366305', 'KK Crvena zvezda': '5tlez31767366440', 'KK Partizan': 'us0e1z1767366567', 'Maccabi Tel Aviv BC': 'z0mk1l1789281457', 'Olimpia Milano': 'aurbi61790186853', 'Olympiacos BC': '4s5lug1676581220', 'Panathinaikos BC': '7cdjwz1767366987', 'Paris Basketball': '9q0d6x1726681476', 'Real Madrid Baloncesto': 'g4ev2c1522175902', 'Valencia Basket': '9qyc231536398868', 'Besiktas Basketbol': 'rx0o811667119583', 'ASVEL Lyon-Villeurbanne': 'qbaoia1602706639', 'Virtus Bologna': 'nfl8dz1786178078' },
  kleague: { 'Ulsan HD': '0wooic1706533767', 'Pohang Steelers': '63jst01769097748', 'Jeonbuk Hyundai Motors': '8jif3b1747853225', 'FC Seoul': '31z1zf1579473186', 'Gangwon FC': 'c4igx71579729617', 'Gimcheon Sangmu': 'g4cjyk1609536787', 'Daegu FC': 'xzjzn11579473073', 'Daejeon Hana Citizen': 'o9z6eq1589558557', 'Suwon FC': 'x39pm41589559443', 'Jeju SK': 'hna7ae1736207131', 'Gwangju FC': 'uuzr4x1579473084', 'FC Anyang': '0tens91589557588', 'Incheon United': '2no9nq1579473100', 'Bucheon FC 1995': 'mhcuwe1589557777', 'Suwon Samsung Bluewings': 'ym5u611579473171', 'Jeonnam Dragons': 'fgmush1643552285' }
};
// Words too common to tell clubs apart.
const COMMON_WORDS = new Set(['basket', 'basketball', 'baloncesto', 'club', 'tokyo', 'osaka', 'nagoya', 'city', 'the']);
const badgeIndex = new Map();
export function teamBadge(sport, name) {
  const table = TEAM_BADGES[sport];
  if (!table || !name) return null;
  if (!badgeIndex.has(sport)) badgeIndex.set(sport, Object.entries(table).map(([club, id]) => ({ norm: normalizeTeamName(club), words: new Set(normalizeTeamName(club).split(' ')), id })));
  const clubs = badgeIndex.get(sport);
  const norm = normalizeTeamName(name);
  let best = clubs.find(c => c.norm === norm || c.norm.includes(norm) || norm.includes(c.norm));
  if (!best) {
    let most = 0;
    for (const c of clubs) {
      const shared = norm.split(' ').filter(w => w.length >= 4 && !COMMON_WORDS.has(w) && c.words.has(w)).length;
      if (shared > most) [best, most] = [c, shared];
    }
  }
  return best ? `${SPORTSDB}/team/badge/${best.id}.png/small` : null;
}

// Logo URL for a team (English name as the sources write it), or null. ESPN
// has a version of every logo for dark backgrounds (`dark`).
export function teamLogo(sport, name, dark = false) {
  const base = 'https://a.espncdn.com/i/teamlogos';
  const size = dark ? '500-dark' : '500';
  if (sport === 'mlb' && MLB_ABBR[name]) return `${base}/mlb/${size}/${MLB_ABBR[name]}.png`;
  if (sport === 'nba') return NBA_ID[name] ? `https://cdn.nba.com/logos/nba/${NBA}${NBA_ID[name]}/primary/${dark ? 'D' : 'L'}/logo.svg` : null;
  if (sport === 'nfl' && NFL_ABBR[name]) return `${base}/nfl/${size}/${NFL_ABBR[name]}.png`;
  if (sport === 'nhl' && NHL_ABBR[name]) return `${base}/nhl/${size}/${NHL_ABBR[name]}.png`;
  if (sport === 'epl' && EPL_ESPN_ID[normalizeTeamName(name)]) return `${base}/soccer/${size}/${EPL_ESPN_ID[normalizeTeamName(name)]}.png`;
  // Otherwise a logo ESPN gave us for the club (scoreboards, team lists).
  // Players' names in either order (Kambi's "Han Shi", ESPN's "Shi Han").
  const key = normalizeTeamName(name);
  const words = key.split(' ');
  const seen = seenLogos.get(`${sport}|${key}`) ?? (words.length === 2 ? seenLogos.get(`${sport}|${words[1]} ${words[0]}`) : undefined);
  if (!seen) return dark ? null : teamBadge(sport, name);
  return dark ? seen.replace('/500/', '/500-dark/') : seen;
}

// ---- League logos ----------------------------------------------------------------

// ESPN's soccer league logo ids.
const SOCCER_LOGO = {
  epl: 23, laliga: 15, seriea: 12, bundesliga: 10, ligue1: 9, ucl: 2, uel: 2310, uecl: 20296,
  scotland: 45, mls: 19, jleague: 2199, facup: 40, nationsleague: 2395, worldcup: 4
};
// TheSportsDB's league badges.
const LEAGUE_BADGE = {
  npb: 'lk85rg1575038781', kbo: 'qfr1hx1589707979', cpbl: 'c3vetj1655924198', euroleague: '7xjtuy1554397263', kleague: 'zaw2cj1628430843'
};
// ESPN's other league logos.
const ESPN_LEAGUE = {
  mlb: 'teamlogos/leagues/500/mlb.png', nba: 'teamlogos/leagues/500/nba.png', wnba: 'teamlogos/leagues/500/wnba.png', nfl: 'teamlogos/leagues/500/nfl.png',
  nhl: 'teamlogos/leagues/500/nhl.png', f1: 'teamlogos/leagues/500/f1.png'
};
// The league's own logo (light backgrounds: the apps show it on a white disc), or null.
export function leagueLogo(key, dark = false) {
  // The lion alone: ESPN's own resizer crops the top of its logo, clear of
  // the "Premier League" wordmark.
  if (key === 'epl') return 'https://a.espncdn.com/combiner/i?img=/i/leaguelogos/soccer/500/23.png&w=128&h=80&scale=crop&location=origin';
  if (ESPN_LEAGUE[key]) return `https://a.espncdn.com/i/${dark ? ESPN_LEAGUE[key].replace('/500/', '/500-dark/') : ESPN_LEAGUE[key]}`;
  // TheSportsDB's badge (ATP's is white on white: its emoji instead).
  if (LEAGUE_BADGE[key]) return `${SPORTSDB}/league/badge/${LEAGUE_BADGE[key]}.png/small`;
  return SOCCER_LOGO[key] ? `https://a.espncdn.com/i/leaguelogos/soccer/500/${SOCCER_LOGO[key]}.png` : null;
}

// 2026 F1 grid: each driver's team and its colour, for the driver badges.
const F1_TEAMS = {
  mclaren: { name: 'McLaren', page: 'mclaren', f1: 'mclaren', zh: '麥拉倫', color: '#ff8000', drivers: ['Norris', 'Piastri'] },
  ferrari: { name: 'Ferrari', page: 'ferrari', f1: 'ferrari', zh: '法拉利', color: '#e8002d', drivers: ['Leclerc', 'Hamilton'] },
  redbull: { name: 'Red Bull', page: 'red-bull-racing', f1: 'redbullracing', zh: '紅牛', color: '#3671c6', drivers: ['Verstappen', 'Hadjar'] },
  mercedes: { name: 'Mercedes', page: 'mercedes', f1: 'mercedes', zh: '賓士', color: '#00d2be', drivers: ['Russell', 'Antonelli'] },
  aston: { name: 'Aston Martin', page: 'aston-martin', f1: 'astonmartin', zh: '奧斯頓馬丁', color: '#229971', drivers: ['Alonso', 'Stroll'] },
  alpine: { name: 'Alpine', page: 'alpine', f1: 'alpine', zh: '雅爾派', color: '#ff87bc', drivers: ['Gasly', 'Colapinto'] },
  williams: { name: 'Williams', page: 'williams', f1: 'williams', zh: '威廉斯', color: '#64c4ff', drivers: ['Albon', 'Sainz'] },
  rb: { name: 'Racing Bulls', aka: ['RB F1 Team', 'Visa Cash App RB', 'VCARB'], page: 'racing-bulls', f1: 'racingbulls', zh: 'Racing Bulls', color: '#6692ff', drivers: ['Lawson', 'Lindblad'] },
  haas: { name: 'Haas', page: 'haas', f1: 'haasf1team', zh: '哈斯', color: '#9ea3a8', drivers: ['Ocon', 'Bearman'] },
  audi: { name: 'Audi', page: 'audi', f1: 'audi', zh: '奧迪', color: '#bb0a30', drivers: ['Hulkenberg', 'Bortoleto'] },
  cadillac: { name: 'Cadillac', page: 'cadillac', f1: 'cadillac', zh: '凱迪拉克', color: '#c9a227', drivers: ['Perez', 'Bottas'] }
};

// Driver names as the lottery writes them ("G.羅素"). The ones on the
// 2026 Azerbaijan GP board are the lottery's own; the rest follow the usual
// Taiwanese transliteration.
const F1_ZH = {
  Russell: 'G.羅素',
  Antonelli: 'AK.安東內利',
  Leclerc: 'C.勒克萊爾',
  Piastri: 'O.皮亞斯特里',
  Verstappen: 'M.維斯塔潘',
  Hamilton: 'L.漢米爾頓',
  Norris: 'L.諾里斯',
  Hadjar: 'I.哈賈爾',
  Gasly: 'P.蓋斯利',
  Sainz: 'C.塞恩斯',
  Colapinto: 'F.科拉平托',
  Stroll: 'L.斯托羅爾',
  Perez: 'S.培瑞茲',
  Alonso: 'F.阿隆索',
  Albon: 'A.艾爾朋',
  Lawson: 'L.勞森',
  Lindblad: 'A.林德布拉德',
  Ocon: 'E.歐康',
  Bearman: 'O.貝爾曼',
  Hulkenberg: 'N.霍肯伯格',
  Bortoleto: 'G.博托萊托',
  Bottas: 'V.博塔斯',
  Tsunoda: 'Y.角田裕毅'
};

// Each driver's page on formula1.com (/en/drivers/<slug>): the official
// season, career and biography figures (Fixtures' driver sheet).
const F1_PAGE = {
  Russell: 'george-russell', Antonelli: 'kimi-antonelli', Leclerc: 'charles-leclerc', Piastri: 'oscar-piastri', Verstappen: 'max-verstappen',
  Hamilton: 'lewis-hamilton', Norris: 'lando-norris', Hadjar: 'isack-hadjar', Gasly: 'pierre-gasly', Sainz: 'carlos-sainz',
  Colapinto: 'franco-colapinto', Stroll: 'lance-stroll', Perez: 'sergio-perez', Alonso: 'fernando-alonso', Albon: 'alexander-albon',
  Lawson: 'liam-lawson', Lindblad: 'arvid-lindblad', Ocon: 'esteban-ocon', Bearman: 'oliver-bearman', Hulkenberg: 'nico-hulkenberg',
  Bortoleto: 'gabriel-bortoleto', Bottas: 'valtteri-bottas'
};
// { team, color, zh, page, surname } for a driver's full name ("Carlos Sainz Jr."), or a neutral badge.
export function f1Driver(name) {
  const plain = (name || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
  const zh = Object.entries(F1_ZH).find(([d]) => new RegExp(`\\b${d}\\b`, 'i').test(plain))?.[1] ?? name;
  const surname = Object.keys(F1_PAGE).find(d => new RegExp(`\\b${d}\\b`, 'i').test(plain)) || '';
  const page = F1_PAGE[surname] || '';
  for (const team of Object.values(F1_TEAMS)) {
    if (team.drivers.some(d => new RegExp(`\\b${d}\\b`, 'i').test(plain))) return { team: team.name, color: team.color, zh, page, surname };
  }
  return { team: '', color: '#8a8f98', zh, page, surname };
}

// F1 constructors: their colour and a short name, for a badge like the drivers'.
export function f1Constructor(name) {
  const plain = normalizeTeamName(name);
  const team = plain ? Object.values(F1_TEAMS).find(t => plain.includes(normalizeTeamName(t.name)) || normalizeTeamName(t.name).includes(plain) || (t.aka || []).some(x => plain.includes(normalizeTeamName(x)))) : null;
  // Its logo (formula1.com's, white: shown on the team's colour).
  const logo = team?.f1 ? `https://media.formula1.com/image/upload/c_fit,h_96/q_auto/v1740000000/common/f1/2026/${team.f1}/2026${team.f1}logowhite.webp` : null;
  return { name: team?.name ?? name, zh: team?.zh ?? name, color: team?.color ?? '#8a8f98', logo, page: team?.page || '', drivers: team?.drivers ?? [], short: (team?.name ?? name).replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase() };
}

// National teams: a flag.
const COUNTRY_CODES = {
  afghanistan: 'AF', argentina: 'AR', australia: 'AU', bangladesh: 'BD', kenya: 'KE', namibia: 'NA', nepal: 'NP', oman: 'OM', pakistan: 'PK', 'sri lanka': 'LK', zimbabwe: 'ZW', scotland: 'GB-SCT', wales: 'GB-WLS', 'northern ireland': 'GB-NIR', austria: 'AT', belgium: 'BE', brazil: 'BR', bulgaria: 'BG', canada: 'CA', chile: 'CL', china: 'CN', 'chinese taipei': 'TW', taiwan: 'TW', colombia: 'CO', croatia: 'HR', cuba: 'CU', 'czech republic': 'CZ', czechia: 'CZ', denmark: 'DK', egypt: 'EG', england: 'GB-ENG', estonia: 'EE', finland: 'FI', france: 'FR', germany: 'DE', greece: 'GR', hungary: 'HU', india: 'IN', indonesia: 'ID', iran: 'IR', ireland: 'IE', israel: 'IL', italy: 'IT', japan: 'JP', kazakhstan: 'KZ', 'south korea': 'KR', korea: 'KR', latvia: 'LV', lithuania: 'LT', mexico: 'MX', montenegro: 'ME', netherlands: 'NL', 'new zealand': 'NZ', norway: 'NO', poland: 'PL', portugal: 'PT', 'puerto rico': 'PR', qatar: 'QA', romania: 'RO', russia: 'RU', serbia: 'RS', slovakia: 'SK', slovenia: 'SI', spain: 'ES', sweden: 'SE', switzerland: 'CH', thailand: 'TH', tunisia: 'TN', turkey: 'TR', turkiye: 'TR', ukraine: 'UA', usa: 'US', 'united states': 'US', uruguay: 'UY', vietnam: 'VN', 'dominican republic': 'DO', philippines: 'PH', hongkong: 'HK', 'hong kong': 'HK', singapore: 'SG', malaysia: 'MY',
  britain: 'GB', 'great britain': 'GB', 'united kingdom': 'GB', uk: 'GB', monaco: 'MC', 'south africa': 'ZA', morocco: 'MA', nigeria: 'NG', ghana: 'GH', senegal: 'SN', 'ivory coast': 'CI', 'cote d ivoire': 'CI', cameroon: 'CM', algeria: 'DZ', peru: 'PE', ecuador: 'EC', paraguay: 'PY', venezuela: 'VE', bolivia: 'BO', jamaica: 'JM', 'saudi arabia': 'SA', 'united arab emirates': 'AE', uae: 'AE', georgia: 'GE', armenia: 'AM', azerbaijan: 'AZ', belarus: 'BY', moldova: 'MD', 'bosnia herzegovina': 'BA', bosnia: 'BA', albania: 'AL', 'north macedonia': 'MK', iceland: 'IS', luxembourg: 'LU', cyprus: 'CY', malta: 'MT', 'korea republic': 'KR', 'republic of korea': 'KR', fiji: 'FJ', samoa: 'WS', tonga: 'TO', 'papua new guinea': 'PG', uzbekistan: 'UZ', mongolia: 'MN', 'costa rica': 'CR', panama: 'PA', honduras: 'HN', 'el salvador': 'SV', guatemala: 'GT', haiti: 'HT', bahamas: 'BS', 'trinidad tobago': 'TT', curacao: 'CW', 'cape verde': 'CV', 'cabo verde': 'CV', 'congo dr': 'CD', 'dr congo': 'CD', iraq: 'IQ', jordan: 'JO', andorra: 'AD', 'faroe islands': 'FO', gibraltar: 'GI', kosovo: 'XK', liechtenstein: 'LI', 'republic of ireland': 'IE', 'san marino': 'SM', 'new caledonia': 'NC', haiti: 'HT', 'saudi arabia': 'SA', qatar: 'QA', egypt: 'EG'
};
// The home nations aren't countries to Intl: their names by hand.
const HOME_NATIONS = { england: ['英格蘭', 'England'], scotland: ['蘇格蘭', 'Scotland'], wales: ['威爾斯', 'Wales'], 'northern ireland': ['北愛爾蘭', 'Northern Ireland'] };
let regionNames = null;
// A country's name in the reader's language ("Netherlands" → 荷蘭), or the name as given.
export function countryName(name, lang = 'zh') {
  const key = normalizeTeamName(name);
  if (!key) return name || '';
  if (HOME_NATIONS[key]) return HOME_NATIONS[key][lang === 'en' ? 1 : 0];
  const code = COUNTRY_CODES[key];
  if (!code || lang === 'en') return name;
  try {
    regionNames ||= new Intl.DisplayNames(['zh-TW'], { type: 'region' });
    return regionNames.of(code) || name;
  } catch {
    return name;
  }
}
// The flag emoji of a national team's name, or null.
export function countryFlag(name) {
  const code = countryCode(name);
  return code ? String.fromCodePoint(...[...code.slice(0, 2)].map(c => 0x1f1e6 + c.charCodeAt(0) - 65)) : null;
}
// A national team's (or a country's) code, or null: "India", "England", "South Africa Women".
export const countryCode = name => COUNTRY_CODES[normalizeTeamName(name).replace(/\s+(women|men|u\d+|a)$/, '')] ?? null;

// A round flag picture for a nation code (circle-flags, hot-linkable SVGs).
export const flagUrl = code => (code ? `https://cdn.jsdelivr.net/gh/HatScripts/circle-flags@2.7.0/flags/${code.toLowerCase()}.svg` : null);
// The flag emoji of a nation code (GB-ENG and the like: the UK's).
export const flagEmoji = code => (code ? String.fromCodePoint(...[...code.slice(0, 2).toUpperCase()].map(c => 0x1f1e6 + c.charCodeAt(0) - 65)) : null);

// ---- On screen ------------------------------------------------------------------

// A logo with its dark-background version, or `fallback()` if it fails.
//
// No flashing: a picture that has drawn on this device before (remembered
// across launches; the service worker keeps the file, sw-images.js) is shown
// at once and decoded with the page, and every picture drawn in this page
// stays decoded in memory, so a redraw (a tab, a refresh, a tap) puts it
// back in the same frame. A new one fades in once it has drawn, never the
// browser's broken-picture icon. One that fails is tried again (a dropped
// connection, a slow CDN), then gives way to the fallback; a failure is
// remembered for ten minutes only.
const LOGO_SEEN_KEY = 'quadra.logos.v2';
const SEEN_MAX = 2_000;
const BAD_FOR_MS = 10 * 60_000;
const RETRY_MS = [400, 1_500, 4_000];
const store = (() => {
  try {
    return localStorage;
  } catch {
    return null;
  }
})();
const logoSeen = (() => {
  try {
    return new Set(JSON.parse(store?.getItem(LOGO_SEEN_KEY) || '[]'));
  } catch {
    return new Set();
  }
})();
const logoBad = new Map();
// Decoded pictures of this page, kept so the browser keeps them decoded.
const drawn = new Map();
let logoSaveTimer = 0;
const knownBad = url => Date.now() - (logoBad.get(url) ?? 0) < BAD_FOR_MS;
function noteDrawn(url, img) {
  logoBad.delete(url);
  if (!drawn.has(url)) {
    drawn.set(url, img);
    if (drawn.size > 400) drawn.delete(drawn.keys().next().value);
  }
  if (logoSeen.has(url)) return;
  logoSeen.add(url);
  clearTimeout(logoSaveTimer);
  logoSaveTimer = setTimeout(() => {
    try {
      store?.setItem(LOGO_SEEN_KEY, JSON.stringify([...logoSeen].slice(-SEEN_MAX)));
    } catch {}
  }, 500);
}

export function logoPicture(light, dark, cls, fallback) {
  if (!light || knownBad(light)) return fallback();
  const img = document.createElement('img');
  const known = drawn.has(light) || logoSeen.has(light);
  Object.assign(img, { className: cls, alt: '', loading: known ? 'eager' : 'lazy', decoding: known ? 'sync' : 'async' });
  const picture = document.createElement('picture');
  picture.className = known ? 'logo-wrap' : 'logo-wrap logo-new';
  if (dark) {
    const source = document.createElement('source');
    Object.assign(source, { srcset: dark, media: '(prefers-color-scheme: dark)' });
    picture.append(source);
  }
  picture.append(img);
  img.addEventListener('load', () => {
    picture.classList.remove('logo-new');
    noteDrawn(light, img);
  });
  let tries = 0;
  img.addEventListener('error', () => {
    if (tries >= RETRY_MS.length) {
      logoBad.set(light, Date.now());
      logoSeen.delete(light);
      if (picture.parentNode) picture.replaceWith(fallback());
      return;
    }
    const again = () => {
      if (!picture.isConnected) return;
      // The same address again (TheSportsDB refuses any extra ?query).
      img.removeAttribute('src');
      img.src = light;
    };
    const wait = RETRY_MS[tries++];
    if (navigator.onLine === false) addEventListener('online', again, { once: true });
    else setTimeout(again, wait);
  });
  img.src = light;
  return picture;
}

// An F1 race's short name: "新加坡站" / "Singapore GP", from any of the long
// ones (ESPN's "Singapore Airlines Singapore Grand Prix", Kambi's "Singapore
// GP", Polymarket's titles). A name that isn't a Grand Prix comes back as is.
const GP = [
  ['abu dhabi', '阿布達比', 'Abu Dhabi'], ['united states', '美國', 'United States'], ['las vegas', '拉斯維加斯', 'Las Vegas'], ['mexico', '墨西哥', 'Mexico City'],
  ['são paulo', '巴西', 'São Paulo'], ['sao paulo', '巴西', 'São Paulo'], ['brazil', '巴西', 'Brazilian'], ['saudi', '沙烏地', 'Saudi Arabian'], ['barcelona', '巴塞隆納', 'Barcelona'],
  ['australia', '澳洲', 'Australian'], ['chin', '中國', 'Chinese'], ['japan', '日本', 'Japanese'], ['bahrain', '巴林', 'Bahrain'], ['miami', '邁阿密', 'Miami'],
  ['canad', '加拿大', 'Canadian'], ['monaco', '摩納哥', 'Monaco'], ['austria', '奧地利', 'Austrian'], ['brit', '英國', 'British'], ['belgi', '比利時', 'Belgian'],
  ['hungar', '匈牙利', 'Hungarian'], ['dutch', '荷蘭', 'Dutch'], ['ital', '義大利', 'Italian'], ['emilia', '伊莫拉', 'Emilia-Romagna'], ['spanish', '西班牙', 'Spanish'], ['spain', '西班牙', 'Spanish'],
  ['madrid', '馬德里', 'Madrid'], ['azerbaijan', '亞塞拜然', 'Azerbaijan'], ['singapore', '新加坡', 'Singapore'], ['qatar', '卡達', 'Qatar'], ['portug', '葡萄牙', 'Portuguese'], ['turk', '土耳其', 'Turkish']
];
export function raceName(name, lang = 'zh') {
  const text = String(name || '');
  // The two words before "Grand Prix" / "GP": past any sponsor.
  const m = /([\p{L}.'&-]+(?:\s+[\p{L}.'&-]+)?)\s+(?:Grand Prix|GP)\b/iu.exec(text);
  if (!m) return text;
  const place = m[1].toLowerCase();
  const hit = GP.find(([key]) => place.includes(key));
  if (hit) return lang === 'en' ? `${hit[2]} GP` : `${hit[1]}站`;
  return `${m[1].split(/\s+/).at(-1)} GP`;
}
