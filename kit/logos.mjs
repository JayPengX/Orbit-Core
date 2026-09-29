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
  nrl: 'teamlogos/leagues/500/nrl.png', afl: 'teamlogos/leagues/500/afl.png', indycar: 'espn/teamlogos/500/indycar_series.png'
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
  argentina: 'AR', australia: 'AU', austria: 'AT', belgium: 'BE', brazil: 'BR', bulgaria: 'BG', canada: 'CA', chile: 'CL', china: 'CN', 'chinese taipei': 'TW', taiwan: 'TW', colombia: 'CO', croatia: 'HR', cuba: 'CU', 'czech republic': 'CZ', czechia: 'CZ', denmark: 'DK', egypt: 'EG', england: 'GB', estonia: 'EE', finland: 'FI', france: 'FR', germany: 'DE', greece: 'GR', hungary: 'HU', india: 'IN', indonesia: 'ID', iran: 'IR', ireland: 'IE', israel: 'IL', italy: 'IT', japan: 'JP', kazakhstan: 'KZ', 'south korea': 'KR', korea: 'KR', latvia: 'LV', lithuania: 'LT', mexico: 'MX', montenegro: 'ME', netherlands: 'NL', 'new zealand': 'NZ', norway: 'NO', poland: 'PL', portugal: 'PT', 'puerto rico': 'PR', qatar: 'QA', romania: 'RO', russia: 'RU', serbia: 'RS', slovakia: 'SK', slovenia: 'SI', spain: 'ES', sweden: 'SE', switzerland: 'CH', thailand: 'TH', tunisia: 'TN', turkey: 'TR', turkiye: 'TR', ukraine: 'UA', usa: 'US', 'united states': 'US', uruguay: 'UY', vietnam: 'VN', 'dominican republic': 'DO', philippines: 'PH', hongkong: 'HK', 'hong kong': 'HK', singapore: 'SG', malaysia: 'MY'
};
// The flag emoji of a national team's name, or null.
export function countryFlag(name) {
  const code = COUNTRY_CODES[normalizeTeamName(name).replace(/\s+(women|men|u\d+)$/, '')];
  return code ? String.fromCodePoint(...[...code].map(c => 0x1f1e6 + c.charCodeAt(0) - 65)) : null;
}

// ---- On screen ------------------------------------------------------------------

// A logo with its dark-background version, or `fallback()` if it fails.
// Logos that loaded (drawn again at once, not lazily) and ones that failed
// (the fallback straight away, no broken picture first), remembered for
// the session so a redraw — coming back to the app — doesn't flash them.
const LOGO_SEEN_KEY = 'quadra.logos.v1';
const logoSeen = (() => {
  try {
    const saved = JSON.parse(sessionStorage.getItem(LOGO_SEEN_KEY) || '{}');
    return { ok: new Set(saved.ok || []), bad: new Set(saved.bad || []) };
  } catch {
    return { ok: new Set(), bad: new Set() };
  }
})();
let logoSaveTimer = 0;
function noteLogo(url, ok) {
  const set = ok ? logoSeen.ok : logoSeen.bad;
  if (set.has(url)) return;
  set.add(url);
  (ok ? logoSeen.bad : logoSeen.ok).delete(url);
  clearTimeout(logoSaveTimer);
  logoSaveTimer = setTimeout(() => {
    try {
      sessionStorage.setItem(LOGO_SEEN_KEY, JSON.stringify({ ok: [...logoSeen.ok].slice(-600), bad: [...logoSeen.bad].slice(-200) }));
    } catch {}
  }, 500);
}

export function logoPicture(light, dark, cls, fallback) {
  if (!light || logoSeen.bad.has(light)) return fallback();
  const img = document.createElement('img');
  const known = logoSeen.ok.has(light);
  // Hidden until it has drawn: never the browser's broken-picture icon.
  Object.assign(img, { className: cls, alt: '', loading: known ? 'eager' : 'lazy', decoding: known ? 'sync' : 'async' });
  img.style.visibility = 'hidden';
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
