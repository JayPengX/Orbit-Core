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

// ESPN's logo files: MLB and NBA by abbreviation, soccer clubs by ESPN id.
export const MLB_ABBR = {
  'Arizona Diamondbacks': 'ari', Athletics: 'ath', 'Oakland Athletics': 'ath', 'Atlanta Braves': 'atl', 'Baltimore Orioles': 'bal',
  'Boston Red Sox': 'bos', 'Chicago Cubs': 'chc', 'Chicago White Sox': 'chw', 'Cincinnati Reds': 'cin', 'Cleveland Guardians': 'cle',
  'Colorado Rockies': 'col', 'Detroit Tigers': 'det', 'Houston Astros': 'hou', 'Kansas City Royals': 'kc', 'Los Angeles Angels': 'laa',
  'Los Angeles Dodgers': 'lad', 'Miami Marlins': 'mia', 'Milwaukee Brewers': 'mil', 'Minnesota Twins': 'min', 'New York Mets': 'nym',
  'New York Yankees': 'nyy', 'Philadelphia Phillies': 'phi', 'Pittsburgh Pirates': 'pit', 'San Diego Padres': 'sd', 'San Francisco Giants': 'sf',
  'Seattle Mariners': 'sea', 'St. Louis Cardinals': 'stl', 'Tampa Bay Rays': 'tb', 'Texas Rangers': 'tex', 'Toronto Blue Jays': 'tor',
  'Washington Nationals': 'wsh'
};
export const NBA_ABBR = {
  'Atlanta Hawks': 'atl', 'Boston Celtics': 'bos', 'Brooklyn Nets': 'bkn', 'Charlotte Hornets': 'cha', 'Chicago Bulls': 'chi',
  'Cleveland Cavaliers': 'cle', 'Dallas Mavericks': 'dal', 'Denver Nuggets': 'den', 'Detroit Pistons': 'det', 'Golden State Warriors': 'gs',
  'Houston Rockets': 'hou', 'Indiana Pacers': 'ind', 'Los Angeles Clippers': 'lac', 'LA Clippers': 'lac', 'Los Angeles Lakers': 'lal',
  'Memphis Grizzlies': 'mem', 'Miami Heat': 'mia', 'Milwaukee Bucks': 'mil', 'Minnesota Timberwolves': 'min', 'New Orleans Pelicans': 'no',
  'New York Knicks': 'ny', 'Oklahoma City Thunder': 'okc', 'Orlando Magic': 'orl', 'Philadelphia 76ers': 'phi', 'Phoenix Suns': 'phx',
  'Portland Trail Blazers': 'por', 'Sacramento Kings': 'sac', 'San Antonio Spurs': 'sa', 'Toronto Raptors': 'tor', 'Utah Jazz': 'utah',
  'Washington Wizards': 'wsh'
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
  bleague: { 'Akita Northern Happinets': '87wsa61621334052', 'Altiri Chiba': '3mfjwn1759500326', 'Alvark Tokyo': 'kj4q7w1621334166', 'Chiba Jets Funabashi': '8usqds1737546623', 'Fighting Eagles Nagoya': 'b0rwjq1659455177', 'Gunma Crane Thunders': '9e5cxi1642097069', 'Hiroshima D': 'ex7l321622396493', 'Ibaraki Robots': 'nscmq91642097142', 'Kawasaki Brave Thunders': '9ahvnv1621334572', 'Kobe Storks': 'u13mbp1787663428', 'Koshigaya Alphas': 'lr8jgm1737548387', 'Kyoto Hannaryz': '229szh1621546129', 'Levanga Hokkaido': 'pw4n7h1622396675', 'Nagasaki Velca': 'dlywny1713956438', 'Nagoya Diamond Dolphins': 't8bcpf1622396582', 'Osaka Evessa': 'au25qr1621545182', 'Ryukyu Golden Kings': 'y9cedk1621346537', 'Saga Ballooners': 'nplg6o1713956383', 'SeaHorses Mikawa': '9eng811621456481', 'Sendai 89ers': 'x0nmfz1659455283', 'Shimane Susanoo Magic': 'db6kqq1621545848', 'Shinshu Brave Warriors': 'i9a85l1622396401', 'Tokyo SunRockers': 'jq3nm11586269789', 'Toyama Grouses': 'o34c4j1621346928', 'Utsunomiya Brex': 'id293x1621346227', 'Yokohama B-Corsairs': 'y6p5601723024480' },
  euroleague: { 'AS Monaco Basket': 'fl2ti01649168915', 'Anadolu Efes SK': 'uldz0d1782050729', 'BC Žalgiris': 'dn7ouv1703960565', 'Baskonia': 'p4x3o61767366090', 'Bayern München Basketball': 'z2r3eh1678017187', 'Dubai Basketball': 'fgtnti1758215967', 'FC Barcelona Basquet': '0tz26j1729097443', 'Hapoel Tel Aviv BC': 'yrrsml1767366305', 'KK Crvena zvezda': '5tlez31767366440', 'KK Partizan': 'us0e1z1767366567', 'Maccabi Tel Aviv BC': 'z0mk1l1789281457', 'Olimpia Milano': 'aurbi61790186853', 'Olympiacos BC': '4s5lug1676581220', 'Panathinaikos BC': '7cdjwz1767366987', 'Paris Basketball': '9q0d6x1726681476', 'Real Madrid Baloncesto': 'g4ev2c1522175902', 'Valencia Basket': '9qyc231536398868' }
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
  if (sport === 'nba' && NBA_ABBR[name]) return `${base}/nba/${size}/${NBA_ABBR[name]}.png`;
  if (sport === 'epl' && EPL_ESPN_ID[normalizeTeamName(name)]) return `${base}/soccer/${size}/${EPL_ESPN_ID[normalizeTeamName(name)]}.png`;
  // Otherwise a logo ESPN gave us for the club (scoreboards, team lists).
  const seen = seenLogos.get(`${sport}|${normalizeTeamName(name)}`);
  if (!seen) return dark ? null : teamBadge(sport, name);
  return dark ? seen.replace('/500/', '/500-dark/') : seen;
}

// ---- League logos ----------------------------------------------------------------

// ESPN's soccer league logo ids.
const SOCCER_LOGO = {
  epl: 23, laliga: 15, seriea: 12, bundesliga: 10, ligue1: 9, ucl: 2, uel: 2310, uecl: 20296, eredivisie: 11, primeira: 14, championship: 24, league1: 25,
  scotland: 45, bundesliga2: 97, laliga2: 107, serieb: 99, ligue2: 96, belgium: 6, austria: 5, swiss: 17, sweden: 16, greece: 98, superlig: 18, saudi: 2488,
  mls: 19, usl: 2292, nwsl: 2323, ligamx: 22, brasileirao: 85, argentina: 1, colombia: 1543, chile: 86, libertadores: 58, sudamericana: 1208, jleague: 2199,
  csl: 2350, aleague: 1308, facup: 40, leaguecup: 41, copadelrey: 80, nationsleague: 2395, wcqeurope: 67
};
// TheSportsDB's league badges.
const LEAGUE_BADGE = {
  npb: 'lk85rg1575038781', kbo: 'qfr1hx1589707979', cpbl: 'c3vetj1655924198', euroleague: '7xjtuy1554397263', bleague: 'vcx6gw1745501883',
  wta: 'bddhun1768230678', badminton: 'd5xvqq1750423289', tabletennis: 'fvesg01750422363', volleyball: 'vy2eo01625239301', snooker: '0gmkgj1555600537'
};
// ESPN's other league logos.
const ESPN_LEAGUE = {
  mlb: 'teamlogos/leagues/500/mlb.png', nba: 'teamlogos/leagues/500/nba.png', wnba: 'teamlogos/leagues/500/wnba.png', nfl: 'teamlogos/leagues/500/nfl.png',
  nhl: 'teamlogos/leagues/500/nhl.png', f1: 'teamlogos/leagues/500/f1.png', ncaaf: 'espn/misc_logos/500/ncaa_football.png', ncaam: 'espn/misc_logos/500/ncaa.png',
  ncaaw: 'espn/misc_logos/500/ncaa.png', pga: 'teamlogos/leagues/500/pgatour.png', lpga: 'teamlogos/leagues/500/lpga.png', ufc: 'teamlogos/leagues/500/ufc.png',
  nrl: 'teamlogos/leagues/500/nrl.png', afl: 'teamlogos/leagues/500/afl.png', indycar: 'espn/teamlogos/500/indycar_series.png', nascar: 'espn/teamlogos/500/nascar.png'
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
  mclaren: { name: 'McLaren', color: '#ff8000', drivers: ['Norris', 'Piastri'] },
  ferrari: { name: 'Ferrari', color: '#e8002d', drivers: ['Leclerc', 'Hamilton'] },
  redbull: { name: 'Red Bull', color: '#3671c6', drivers: ['Verstappen', 'Hadjar'] },
  mercedes: { name: 'Mercedes', color: '#00d2be', drivers: ['Russell', 'Antonelli'] },
  aston: { name: 'Aston Martin', color: '#229971', drivers: ['Alonso', 'Stroll'] },
  alpine: { name: 'Alpine', color: '#ff87bc', drivers: ['Gasly', 'Colapinto'] },
  williams: { name: 'Williams', color: '#64c4ff', drivers: ['Albon', 'Sainz'] },
  rb: { name: 'Racing Bulls', color: '#6692ff', drivers: ['Lawson', 'Lindblad'] },
  haas: { name: 'Haas', color: '#9ea3a8', drivers: ['Ocon', 'Bearman'] },
  audi: { name: 'Audi', color: '#bb0a30', drivers: ['Hulkenberg', 'Bortoleto'] },
  cadillac: { name: 'Cadillac', color: '#c9a227', drivers: ['Perez', 'Bottas'] }
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

// { team, color, zh } for a driver's full name ("Carlos Sainz Jr."), or a neutral badge.
export function f1Driver(name) {
  const plain = (name || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
  const zh = Object.entries(F1_ZH).find(([d]) => new RegExp(`\\b${d}\\b`, 'i').test(plain))?.[1] ?? name;
  for (const team of Object.values(F1_TEAMS)) {
    if (team.drivers.some(d => new RegExp(`\\b${d}\\b`, 'i').test(plain))) return { team: team.name, color: team.color, zh };
  }
  return { team: '', color: '#8a8f98', zh };
}

// F1 constructors: their colour and a short name, for a badge like the drivers'.
export function f1Constructor(name) {
  const plain = normalizeTeamName(name);
  const team = Object.values(F1_TEAMS).find(t => plain.includes(normalizeTeamName(t.name)) || normalizeTeamName(t.name).includes(plain));
  return { color: team?.color ?? '#8a8f98', short: (team?.name ?? name).replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase() };
}

// National teams (volleyball, and any sport's national sides): a flag.
const COUNTRY_CODES = {
  argentina: 'AR', australia: 'AU', austria: 'AT', belgium: 'BE', brazil: 'BR', bulgaria: 'BG', canada: 'CA', chile: 'CL', china: 'CN', 'chinese taipei': 'TW', taiwan: 'TW', colombia: 'CO', croatia: 'HR', cuba: 'CU', 'czech republic': 'CZ', czechia: 'CZ', denmark: 'DK', egypt: 'EG', england: 'GB', estonia: 'EE', finland: 'FI', france: 'FR', germany: 'DE', greece: 'GR', hungary: 'HU', india: 'IN', indonesia: 'ID', iran: 'IR', ireland: 'IE', israel: 'IL', italy: 'IT', japan: 'JP', kazakhstan: 'KZ', 'south korea': 'KR', korea: 'KR', latvia: 'LV', lithuania: 'LT', mexico: 'MX', montenegro: 'ME', netherlands: 'NL', 'new zealand': 'NZ', norway: 'NO', poland: 'PL', portugal: 'PT', 'puerto rico': 'PR', qatar: 'QA', romania: 'RO', russia: 'RU', serbia: 'RS', slovakia: 'SK', slovenia: 'SI', spain: 'ES', sweden: 'SE', switzerland: 'CH', thailand: 'TH', tunisia: 'TN', turkey: 'TR', turkiye: 'TR', ukraine: 'UA', usa: 'US', 'united states': 'US', uruguay: 'UY', vietnam: 'VN', 'dominican republic': 'DO', philippines: 'PH', hongkong: 'HK', 'hong kong': 'HK', singapore: 'SG', malaysia: 'MY',
  britain: 'GB', 'great britain': 'GB', 'united kingdom': 'GB', uk: 'GB', monaco: 'MC', 'south africa': 'ZA', morocco: 'MA', nigeria: 'NG', ghana: 'GH', senegal: 'SN', 'ivory coast': 'CI', 'cote d ivoire': 'CI', cameroon: 'CM', algeria: 'DZ', peru: 'PE', ecuador: 'EC', paraguay: 'PY', venezuela: 'VE', bolivia: 'BO', jamaica: 'JM', 'saudi arabia': 'SA', 'united arab emirates': 'AE', uae: 'AE', georgia: 'GE', armenia: 'AM', azerbaijan: 'AZ', belarus: 'BY', moldova: 'MD', 'bosnia herzegovina': 'BA', bosnia: 'BA', albania: 'AL', 'north macedonia': 'MK', iceland: 'IS', luxembourg: 'LU', cyprus: 'CY', malta: 'MT', 'korea republic': 'KR', 'republic of korea': 'KR', fiji: 'FJ', samoa: 'WS', tonga: 'TO', 'papua new guinea': 'PG', uzbekistan: 'UZ', mongolia: 'MN', 'costa rica': 'CR', panama: 'PA', honduras: 'HN', 'el salvador': 'SV', guatemala: 'GT', haiti: 'HT', bahamas: 'BS', 'trinidad tobago': 'TT', curacao: 'CW'
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
  const code = COUNTRY_CODES[normalizeTeamName(name).replace(/\s+(women|men|u\d+)$/, '')];
  return code ? String.fromCodePoint(...[...code].map(c => 0x1f1e6 + c.charCodeAt(0) - 65)) : null;
}

// ---- Players' nations (table tennis, badminton, snooker, fighters) -----------------
//
// Kambi names players without their country, so a player's picture is their
// nation's flag: from this table (the regular names on the world tours), else
// the country the event is filed under (Kambi's path: "Czech Republic > Czech
// Liga Pro", or a domestic series' own name). ISO codes; England, Scotland,
// Wales and Northern Ireland as GB-ENG, GB-SCT, GB-WLS, GB-NIR.
const NATIONS = {
  CN: 'Fan Zhendong|Wang Chuqin|Ma Long|Lin Shidong|Liang Jingkun|Lin Gaoyuan|Xiang Peng|Zhou Qihao|Huang Youzheng|Xue Fei|Sun Yingsha|Wang Manyu|Chen Meng|Wang Yidi|Chen Xingtong|Kuai Man|Qian Tianyi|He Zhuojia|Shi Yuqi|Li Shifeng|Weng Hongyang|Lu Guangzu|Wang Zhiyi|Han Yue|Chen Yufei|Gao Fangjie|Liang Weikeng|Wang Chang|Chen Qingchen|Jia Yifan|Liu Shengshu|Tan Ning|Feng Yanzhe|Huang Dongping|Jiang Zhenbang|Wei Yaxin|Ding Junhui|Zhao Xintong|Si Jiahui|Fan Zhengyi|Yuan Sijun|Xu Si|Wu Yize|Zhang Anda|Xiao Guodong|Pang Junxu|Lei Peifan|Zhou Yuelong|Zhang Jiankang|Lyu Haotian|Lu Ning|He Guolong|Yan Bingtao|Liang Wenbo|Li Hang|Tian Pengfei|Zhou Yuelong|Gong Chenzhi|Wang Yuchen|Long Zehuang|Ma Hailong|Bai Langning|Liu Hongyu|Zhang Anda|Chang Bingyu|Jiang Jun',
  TW: 'Lin Yun-Ju|Lin Yun Ju|Kao Cheng-Jui|Chuang Chih-Yuan|Huang Yan-Cheng|Feng Yi-Hsin|Cheng I-Ching|Chen Szu-Yu|Chien Tung-Chuan|Chou Tien-Chen|Chou Tien Chen|Lin Chun-Yi|Lin Chun Yi|Wang Tzu-Wei|Lee Yang|Wang Chi-Lin|Lee Jhe-Huei|Yang Po-Hsuan|Lee Chia-Hao|Tai Tzu-Ying|Tai Tzu Ying|Chiu Pin-Chian|Wang Po-Wei|Huang Yu-Kai|Lin Kuan Ting|Lee Fang-Jen|Lee Fang-Chih|Hsieh Pei-Shan|Hung En-Tzu|Lin Chih-Chun|Liu Kuang-Heng',
  JP: 'Tomokazu Harimoto|Harimoto Tomokazu|Shunsuke Togami|Sora Matsushima|Yukiya Uda|Hiroto Shinozuka|Miwa Harimoto|Mima Ito|Hina Hayata|Miu Hirano|Satsuki Odo|Honoka Hashimoto|Kodai Naraoka|Kenta Nishimoto|Koki Watanabe|Kanta Tsuneyama|Akane Yamaguchi|Nozomi Okuhara|Aya Ohori|Takuro Hoki|Yugo Kobayashi|Mayu Matsumoto|Wakana Nagahara|Nami Matsuyama|Chiharu Shida|Yuta Watanabe|Arisa Higashino|Riku Hatano|Kenya Mitsuhashi|Hiroki Midorikawa|Kyohei Yamashita|Tomoka Miyazaki|Natsuki Nidaira|Yuki Fukushima|Sayaka Hirota|Rin Iwanaga|Kie Nakanishi',
  KR: 'Jang Woojin|Lim Jonghoon|An Jaehyun|Oh Junsung|Shin Yubin|Jeon Jihee|Lee Eunhye|Joo Cheonhui|An Se-young|An Se Young|Seo Seung-jae|Kim Won-ho|Kang Min-hyuk|Baek Ha-na|Lee So-hee|Kim So-yeong|Kong Hee-yong|Jeon Hyeok-jin|Kim Ga-eun|Sim Yu-jin',
  DE: 'Dang Qiu|Patrick Franziska|Dimitrij Ovtcharov|Benedikt Duda|Timo Boll|Han Ying|Nina Mittelham|Sabine Winter|Annett Kaufmann|Xiaona Shan|Fabian Rath|Yvonne Li',
  FR: 'Felix Lebrun|Félix Lebrun|Alexis Lebrun|Simon Gauzy|Jia Nan Yuan|Prithika Pavade|Christopher Popov|Toma Junod|Alex Lanier|Christo Popov|Toma Junior Popov|Lucas Corvee|Arnaud Merkle|Thom Gicquel|Delphine Delrue|Leonice Huet',
  SE: 'Truls Moregard|Truls Möregård|Anton Kallberg|Anton Källberg|Mattias Falck|Kristian Karlsson|Linda Bergstrom',
  BR: 'Hugo Calderano|Bruna Takahashi|Kayque Valois|Ygor Coelho|Juliana Viana Vieira',
  EG: 'Omar Assar|Hana Goda|Dina Meshref',
  NG: 'Quadri Aruna|Aruna Quadri',
  IN: 'Manika Batra|Sreeja Akula|Manav Thakkar|Sharath Kamal|Harmeet Desai|Satwiksairaj Rankireddy|Chirag Shetty|Lakshya Sen|H. S. Prannoy|HS Prannoy|Prannoy H. S.|P. V. Sindhu|Pusarla V. Sindhu|PV Sindhu|Kidambi Srikanth|Priyanshu Rajawat|Kiran George|Treesa Jolly|Gayatri Gopichand|Ayush Shetty|Unnati Hooda|Malvika Bansod|Anupama Upadhyaya|Tanvi Sharma',
  HK: 'Wong Chun Ting|Doo Hoi Kem|Lam Siu Hang|Tang Chun Man|Tse Ying Suet|Lee Cheuk Yiu|Angus Ng Ka Long|Ng Ka Long Angus',
  SG: 'Izaac Quek|Loh Kean Yew|Terry Hee|Jessica Tan|Yeo Jia Min',
  PT: 'Marcos Freitas|Tiago Apolonia|Jieni Shao',
  SI: 'Darko Jorgic',
  AT: 'Robert Gardos|Sofia Polcanova|Daniel Habesohn',
  RO: 'Bernadette Szocs|Eduard Ionescu|Ovidiu Ionescu|Elizabeta Samara',
  HR: 'Andrej Gacina|Tomislav Pucar',
  PL: 'Jakub Dyjas|Natalia Bajor',
  CZ: 'Pavel Sirucek|Hana Matelova',
  US: 'Kanak Jha|Lily Zhang|Amy Wang|Beiwen Zhang|Rachel Chang',
  CA: 'Eugene Wang|Michelle Yip|Brian Yang|Victor Lai|Michelle Li',
  PR: 'Adriana Diaz',
  DK: 'Anders Lind|Viktor Axelsen|Anders Antonsen|Rasmus Gemke|Mia Blichfeldt|Kim Astrup|Anders Skaarup Rasmussen|Line Kjaersfeldt|Line Christophersen|Mathias Christiansen|Magnus Johannesen|Julie Dawall Jakobsen|Mads Christophersen|Jesper Toft|Amalie Magelund|Freja Ravn|Maiken Fruergaard|Sara Thygesen|Rasmus Kjaer|Frederik Sogaard|Mathias Thyrri',
  ID: 'Jonatan Christie|Anthony Sinisuka Ginting|Alwi Farhan|Gregoria Mariska Tunjung|Putri Kusuma Wardani|Fajar Alfian|Muhammad Rian Ardianto|Leo Rolly Carnando|Daniel Marthin|Sabar Karyaman Gutama|Muhammad Reza Pahlevi Isfahani|Apriyani Rahayu|Siti Fadia Silva Ramadhanti|Dejan Ferdinansyah|Gloria Emanuelle Widjaja|Rinov Rivaldy|Pitha Haningtyas Mentari|Chico Aura Dwi Wardoyo|Ester Nurumi Tri Wardoyo|Komang Ayu Cahya Dewi|Febriana Dwipuji Kusuma|Amallia Cahaya Pratiwi|Lanny Tria Mayasari|Meilysa Trias Puspita Sari|Rachel Allessya Rose',
  MY: 'Lee Zii Jia|Aaron Chia|Soh Wooi Yik|Goh Sze Fei|Nur Izzuddin|Man Wei Chong|Tee Kai Wun|Chen Tang Jie|Toh Ee Wei|Pearly Tan|Thinaah Muralitharan|Goh Soon Huat|Shevon Jemie Lai|Leong Jun Hao|Ng Tze Yong|Goh Jin Wei|Letshanaa Karupathevan|Wong Ling Ching|Kang Khai Xing|Aaron Tai',
  TH: 'Kunlavut Vitidsarn|Kantaphon Wangcharoen|Kulkavut Vitidsarn|Ratchanok Intanon|Busanan Ongbamrungphan|Pornpawee Chochuwong|Supanida Katethong|Dechapol Puavaranukroh|Supissara Paewsampran|Jongkolphan Kititharakul|Rawinda Prajongjai|Benyapa Aimsaard|Nuntakarn Aimsaard|Thepchaiya Un-Nooh|Thepchaiya Un Nooh|Noppon Saengkham|Sunny Akani|Dechawat Poomjaeng',
  VN: 'Nguyen Thuy Linh',
  ES: 'Carolina Marin|Carolina Marín|Pablo Abian',
  'GB-ENG': 'Liam Pitchford|Tin-Tin Ho|Ben Lane|Sean Vendy|Toby Penty|Judd Trump|Ronnie O\'Sullivan|Ronnie OSullivan|Mark Selby|Kyren Wilson|Shaun Murphy|Barry Hawkins|Ali Carter|Jack Lisowski|Tom Ford|Joe Perry|Stuart Bingham|David Gilbert|Gary Wilson|Mark Davis|Ricky Walden|Chris Wakelin|Michael Holt|Elliot Slessor|David Grace|Robert Milkins|Matthew Selt|Ben Woollaston|Martin Gould|Mark Joyce|Jimmy Robertson|Joe O\'Connor|Stan Moody|Ashley Carty|Oliver Lines|Zak Surety|Ian Burns|Louis Heathcote|Sam Craigie|Steven Hallworth|Jamie Clarke|Hammad Miah|Liam Graham|Allan Taylor|Andrew Higginson|Mitchell Mann|Jenson Kendrick',
  'GB-SCT': 'John Higgins|Stephen Maguire|Anthony McGill|Graeme Dott|Scott Donaldson|Chris Totten|Ross Muir|Dean Young|Kirsty Gilmour',
  'GB-WLS': 'Mark Williams|Jackson Page|Jak Jones|Ryan Day|Dominic Dale|Matthew Stevens|Jamie Jones|Michael White|Lee Walker|Liam Davies|Duane Jones',
  'GB-NIR': 'Mark Allen|Jordan Brown',
  IE: 'Aaron Hill|Ken Doherty|Fergal O\'Brien|Nhat Nguyen',
  BE: 'Luca Brecel|Ben Mertens|Julien Leclercq',
  AU: 'Neil Robertson|Ryan Thomerson',
  IR: 'Hossein Vafaei|Hossein Vafaei Ayouri',
  PK: 'Muhammad Asif',
  CH: 'Alexander Ursenbacher',
  PS: 'Mohammed Abu Alrob',
  MT: 'Tony Drago'
};
// The tours' regulars in tennis (Play prices tennis from Kambi, which names no country).
const TENNIS_NATIONS = {
  IT: 'Jannik Sinner|Lorenzo Musetti|Matteo Berrettini|Flavio Cobolli|Lorenzo Sonego|Luciano Darderi|Jasmine Paolini|Elisabetta Cocciaretto|Matteo Arnaldi',
  ES: 'Carlos Alcaraz|Alejandro Davidovich Fokina|Pablo Carreno Busta|Jaume Munar|Paula Badosa',
  RS: 'Novak Djokovic|Olga Danilovic',
  DE: 'Alexander Zverev|Jan-Lennard Struff|Laura Siegemund|Tatjana Maria',
  US: 'Taylor Fritz|Ben Shelton|Tommy Paul|Frances Tiafoe|Sebastian Korda|Brandon Nakashima|Alex Michelsen|Learner Tien|Coco Gauff|Jessica Pegula|Madison Keys|Emma Navarro|Amanda Anisimova|Danielle Collins|Sofia Kenin|McCartney Kessler|Peyton Stearns|Hailey Baptiste|Iva Jovic|Reilly Opelka|Marcos Giron',
  AU: 'Alex de Minaur|Alexei Popyrin|Jordan Thompson|Alex Bolt|Ajla Tomljanovic|Daria Kasatkina|Kimberly Birrell',
  GB: 'Jack Draper|Cameron Norrie|Jacob Fearnley|Emma Raducanu|Katie Boulter|Sonay Kartal',
  NO: 'Casper Ruud',
  GR: 'Stefanos Tsitsipas|Maria Sakkari',
  DK: 'Holger Rune|Clara Tauson',
  CA: 'Felix Auger-Aliassime|Denis Shapovalov|Gabriel Diallo|Leylah Fernandez|Victoria Mboko',
  BG: 'Grigor Dimitrov',
  CZ: 'Jiri Lehecka|Jakub Mensik|Tomas Machac|Barbora Krejcikova|Karolina Muchova|Marketa Vondrousova|Linda Noskova|Karolina Pliskova|Marie Bouzkova',
  FR: 'Arthur Fils|Ugo Humbert|Alexandre Muller|Giovanni Mpetshi Perricard|Arthur Rinderknech|Corentin Moutet|Caroline Garcia|Varvara Gracheva|Diane Parry',
  AR: 'Francisco Cerundolo|Tomas Martin Etcheverry|Sebastian Baez|Francisco Comesana|Solana Sierra',
  CL: 'Alejandro Tabilo|Nicolas Jarry',
  BR: 'Joao Fonseca|Beatriz Haddad Maia',
  PL: 'Hubert Hurkacz|Iga Swiatek|Magda Linette',
  KZ: 'Alexander Bublik|Elena Rybakina|Yulia Putintseva',
  BY: 'Aryna Sabalenka|Victoria Azarenka',
  RU: 'Daniil Medvedev|Andrey Rublev|Karen Khachanov|Roman Safiullin|Mirra Andreeva|Anna Kalinskaya|Diana Shnaider|Ekaterina Alexandrova|Liudmila Samsonova|Veronika Kudermetova|Anastasia Pavlyuchenkova|Anna Blinkova|Kamilla Rakhimova',
  CN: 'Zheng Qinwen|Wang Xinyu|Zhang Shuai|Zhu Lin|Yuan Yue|Zhang Zhizhen|Bu Yunchaokete|Shang Juncheng|Wu Yibing|Wang Xiyu',
  JP: 'Kei Nishikori|Yoshihito Nishioka|Naomi Osaka|Moyuka Uchijima',
  UA: 'Elina Svitolina|Marta Kostyuk|Dayana Yastremska',
  TN: 'Ons Jabeur',
  LV: 'Jelena Ostapenko',
  HR: 'Donna Vekic|Marin Cilic|Borna Coric',
  HU: 'Fabian Marozsan|Anna Bondar',
  NL: 'Tallon Griekspoor|Botic van de Zandschulp',
  BE: 'Elise Mertens|Zizou Bergs|David Goffin',
  CH: 'Belinda Bencic|Stan Wawrinka',
  PT: 'Nuno Borges',
  RO: 'Sorana Cirstea|Jaqueline Cristian',
  CO: 'Camila Osorio',
  PH: 'Alexandra Eala',
  TW: 'Hsieh Su-Wei|Chan Hao-Ching|Tseng Chun-Hsin|Hsu Yu-Hsiou',
  SK: 'Anna Karolina Schmiedlova|Rebecca Sramkova',
  SI: 'Tamara Zidansek',
  EG: 'Mayar Sherif',
  MX: 'Renata Zarazua'
};
const NATION_OF = new Map();
for (const [code, names] of [...Object.entries(TENNIS_NATIONS), ...Object.entries(NATIONS)]) for (const n of names.split('|')) NATION_OF.set(normalizeTeamName(n), code);
// A domestic series' own name, or Kambi's path word, to its country.
const SERIES_NATION = { 'tt elite series': 'PL', 'setka cup': 'UA', 'liga pro': 'CZ', 'czech liga pro': 'CZ', 'tt cup': 'CZ', 'win cup': 'UA', 'pro league russia': 'RU' };
const nameKey = name => normalizeTeamName(name);
// A player's nation as an ISO code (or GB-ENG…), or null. `where`: the
// event's group and Kambi's path words ("czech_republic", "poland").
export function playerNation(name, where = []) {
  const key = nameKey(name);
  if (NATION_OF.has(key)) return NATION_OF.get(key);
  // Kambi's "Surname Firstname" for some: the words in either order.
  const words = key.split(' ');
  if (words.length === 2 && NATION_OF.has(`${words[1]} ${words[0]}`)) return NATION_OF.get(`${words[1]} ${words[0]}`);
  for (const w of [].concat(where || [])) {
    const k = normalizeTeamName(String(w).replace(/_/g, ' '));
    if (SERIES_NATION[k]) return SERIES_NATION[k];
    const code = COUNTRY_CODES[k] ?? Object.entries(COUNTRY_CODES).find(([c]) => c.length > 4 && k.startsWith(`${c} `))?.[1];
    if (code) return code;
  }
  return null;
}
// A round flag picture for a nation code (circle-flags, hot-linkable SVGs).
export const flagUrl = code => (code ? `https://cdn.jsdelivr.net/gh/HatScripts/circle-flags@2.7.0/flags/${code.toLowerCase()}.svg` : null);
// The flag emoji of a nation code (GB-ENG and the like: the UK's).
export const flagEmoji = code => (code ? String.fromCodePoint(...[...code.slice(0, 2).toUpperCase()].map(c => 0x1f1e6 + c.charCodeAt(0) - 65)) : null);
// A player's flag picture, or null.
export const playerFlag = (name, where) => flagUrl(playerNation(name, where));

// ---- On screen ------------------------------------------------------------------

// A logo with its dark-background version, or `fallback()` if it fails.
// Logos that loaded (drawn again at once, not lazily) and ones that failed
// (the fallback straight away, no broken picture first), remembered for
// the session so a redraw — coming back to the app — doesn't flash them.
const LOGO_SEEN_KEY = 'quadra.logos.v1';
const logoSeen = (() => {
  try {
    const saved = JSON.parse(sessionStorage.getItem(LOGO_SEEN_KEY) || '{}');
    return { ok: new Set(saved.ok || []), bad: new Map(Object.entries(saved.bad && !Array.isArray(saved.bad) ? saved.bad : {})) };
  } catch {
    return { ok: new Set(), bad: new Map() };
  }
})();
let logoSaveTimer = 0;
// A failure is remembered for 10 minutes only (a bad connection's, not the logo's).
const BAD_FOR_MS = 10 * 60_000;
const knownBad = url => Date.now() - (logoSeen.bad.get(url) ?? 0) < BAD_FOR_MS;
function noteLogo(url, ok) {
  if (ok ? logoSeen.ok.has(url) : knownBad(url)) return;
  if (ok) {
    logoSeen.ok.add(url);
    logoSeen.bad.delete(url);
  } else {
    logoSeen.bad.set(url, Date.now());
    logoSeen.ok.delete(url);
  }
  clearTimeout(logoSaveTimer);
  logoSaveTimer = setTimeout(() => {
    try {
      sessionStorage.setItem(LOGO_SEEN_KEY, JSON.stringify({ ok: [...logoSeen.ok].slice(-600), bad: Object.fromEntries([...logoSeen.bad].slice(-200)) }));
    } catch {}
  }, 500);
}

export function logoPicture(light, dark, cls, fallback) {
  if (!light || knownBad(light)) return fallback();
  const img = document.createElement('img');
  const known = logoSeen.ok.has(light);
  // A new one hidden until it has drawn (never the browser's broken-picture
  // icon); one that's drawn before this session shows at once, so a redraw
  // (a pick tapped, the app back on screen) doesn't blink it out.
  Object.assign(img, { className: cls, alt: '', loading: known ? 'eager' : 'lazy', decoding: known ? 'sync' : 'async' });
  if (!known) img.style.visibility = 'hidden';
  img.addEventListener('load', () => {
    img.style.visibility = '';
    noteLogo(light, true);
  });
  img.src = light;
  if (img.complete && img.naturalWidth) img.style.visibility = '';
  const picture = document.createElement('picture');
  picture.className = 'logo-wrap';
  if (dark) {
    const source = document.createElement('source');
    Object.assign(source, { srcset: dark, media: '(prefers-color-scheme: dark)' });
    picture.append(source);
  }
  picture.append(img);
  // A logo that fails is tried once more (a slow or dropped connection),
  // then gives way to the fallback.
  let retried = false;
  img.addEventListener('error', () => {
    if (retried || !navigator.onLine) {
      if (navigator.onLine) noteLogo(light, false);
      return picture.replaceWith(fallback());
    }
    retried = true;
    // The same address again (TheSportsDB refuses any extra ?query).
    setTimeout(() => {
      const source = picture.querySelector('source');
      if (source) source.srcset = dark;
      img.removeAttribute('src');
      img.setAttribute('src', light);
    }, 1500);
  });
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
