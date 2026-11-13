// ---- kit/news-sport.mjs: Orbit News' sports reports, matched to Orbit Sports' players and teams ----
// (Jay 2026-11-13: "do that cross app thing for sports's that's news
// related, for example injury"; "if orbit news can't support sport news well
// enough then it should".)
//
// Orbit News' builder (Orbit-Core builders/news.js) writes news/sport.json:
// every sports story of the last three days, one outlet's report too (an
// injury is often one outlet's), as news/index.json has them, each with
//   k    what kind of news it is (sportKind: 'injury' 傷病, 'ban' 禁賽,
//        'coach' 換帥, 'move' 轉隊; '' a game or anything else)
//   who  { p: [people], t: [teams] } in English, the family's AI's reading of
//        a Chinese story's names (柯瑞 → Stephen Curry), where code can't
// Orbit Sports reads it and finds a player's, a team's or a game's stories
// here, by code (newsAbout): names as the outlets write them, in English or
// Chinese (the kit's names.mjs), a bare nickname ("Giants", 勇士) only where
// the story is plainly of the team's sport. A wrong match is worse than
// none: when in doubt, left out.
//
// Imports only kit modules: the builder runs it too.
import { fold, teamNameZh, teamsByZh } from './names.mjs';

export const SPORT_PATH = 'news/sport.json';
export const SPORT_VERSION = 1;
// What's kept and shown: three days of reports.
export const SPORT_MS = 72 * 3_600_000;

// ---- What kind of news ----

const KIND_RES = [
  [
    'ban',
    /禁賽|停賽\s*\d|罰款|罰金|處分|懲處|禁藥|藥檢|驅逐出場|遭驅逐/,
    /\bsuspen(?:d|ds|ded|sion)\b|\bbann?ed\b|\bbans?\b(?! on fans)|\bfined\b|\bfines?\s+(?:of\s+)?[$£€]|\bdoping\b|\bejected\b/i
  ],
  [
    'injury',
    /受傷|傷勢|傷兵|傷病|傷退|傷癒|傷停|養傷|帶傷|舊傷|新傷|傷號|缺陣|開刀|手術|拉傷|扭傷|挫傷|骨折|撕裂|韌帶|腦震盪|痠痛|發炎|復健|休養|高掛免戰牌|[膝肩踝腿腳手肘背腰腹臀頸腕指趾筋]傷|腿筋|腹斜肌|腹股溝|阿基里斯腱|核磁共振|MRI/,
    /\binjur(?:y|ies|ed)\b|\bhurt\b|\bsprain(?:s|ed)?\b|\bstrain(?:s|ed)?\b|\btorn\b|\bfracture[sd]?\b|\bsurgery\b|\bconcussion\b|\bruled out\b|\bday-to-day\b|\bsidelined\b|\bsetback\b|\bMRI\b|\binjured list\b|\bACL\b|\bhamstring\b|\bAchilles\b|\bwill miss\b|\bto miss\b|\bout (?:for|indefinitely|with)\b|\bdoubtful\b|\bfitness (?:doubt|test|blow)\b|\bknock\b/i
  ],
  [
    'coach',
    /(?:總教練|教頭|主帥|總管|教練)[^，。！？\s]{0,6}(?:下課|去職|離職|解聘|開除|撤換|請辭|辭職|走人|接任|上任|出任|就任|續任)|(?:解聘|開除|撤換|聘請|聘任|延攬|任命|新任|接掌|接任)[^，。！？\s]{0,8}(?:總教練|教頭|主帥|教練)|換帥|新帥|新教頭|新總教練|代理總教練|臨時主帥/,
    /\b(?:fire[sd]?|sack(?:s|ed)?|dismiss(?:es|ed)?|part(?:s|ed)? ways with|hire[sd]?|appoint(?:s|ed)?|name[sd]?|replace[sd]?)\b[^.:;]{0,40}\b(?:coach|manager|boss)\b|\b(?:coach|manager|boss)\b[^.:;]{0,30}\b(?:fired|sacked|dismissed|hired|appointed|resigns?|steps down|leaves|departs|out)\b|\binterim (?:coach|manager|boss)\b/i
  ],
  [
    'move',
    /交易|轉隊|轉會|簽約|簽下|簽回|加盟|續約|合約|自由球員|自由市場|釋出|租借|買斷|轉戰|報價|頂薪|入札|入團|讓渡|DFA|非保護名單|換來|送走|挖角|選秀/,
    /\btrade[sd]?\b|\btrading\b|\bsign(?:s|ed|ing)?\b|\btransfer(?:s|red)?\b|\bdeal\b|\bcontract\b|\bfree agen(?:t|cy|ts)\b|\bwaive[sd]?\b|\breleased?\b|\bloan\b|\bextension\b|\bacquire[sd]?\b|\bposting\b|\bposted\b|\bnon-tender|\bqualifying offer\b|\bDFA\b|\bdesignated for assignment\b|\bdraft(?:ed)?\b/i
  ]
];
// A story's kind, from its headlines and summary (`text`), the first that
// fits: a ban, an injury, a coach coming or going, a move; '' anything else.
export function sportKind(text) {
  const t = String(text || '');
  for (const [k, zh, en] of KIND_RES) if (zh.test(t) || en.test(t)) return k;
  return '';
}
// Its name on a row's tag.
export const KIND_NAMES = {
  injury: { zh: '傷病', en: 'Injury' },
  ban: { zh: '禁賽', en: 'Suspension' },
  coach: { zh: '換帥', en: 'Coaching' },
  move: { zh: '轉隊', en: 'Transfer' }
};
// Which first, where several are about the same player or team.
const KIND_ORDER = { injury: 0, ban: 1, coach: 2, move: 3, '': 4 };

// ---- Which sport ----

// The words (and the outlets' section in a link: espn.com/nba/…) that say a
// story's sport; 'other' is one Sports doesn't show (the NFL, hockey,
// colleges), which a bare nickname never matches into.
const SPORT_RES = {
  basketball: /NBA|WNBA|籃球|籃板|三分球|灌籃|大三元|雙十|PLG|TPBL|P\.?\s?LEAGUE|basketball|\brebounds?\b|\b3-pointers?\b|\btriple-double\b|\bdouble-double\b|\bG League\b|\/nba\/|\/basketball\//i,
  baseball: /MLB|大聯盟|美職|棒球|投手|全壘打|開轟|安打|三振|牛棚|打點|中職|日職|韓職|賽揚|捕手|游擊手|外野手|內野手|經典賽|12強|baseball|\bpitch(?:er|ers|ing)\b|\bhomers?\b|\bhome runs?\b|\binnings?\b|\bRBIs?\b|\bCy Young\b|\bWorld Series\b|\bbullpen\b|\bshortstop\b|\boutfielder\b|\/mlb\/|\/baseball\//i,
  soccer: /足球|英超|西甲|義甲|德甲|法甲|蘇超|歐冠|歐霸|歐協聯|美職聯|世界盃資格|足總盃|國家聯賽|進球|射門|門將|前鋒|中場|後衛|點球|帽子戲法|soccer|Premier League|La Liga|Serie A|Bundesliga|Ligue 1|Champions League|Europa League|Conference League|\bMLS\b|\bFA Cup\b|\bUEFA\b|\bFIFA\b|\bstriker\b|\bmidfielder\b|\bgoalkeeper\b|\bdefender\b|\bhat-trick\b|\bclean sheet\b|Nations League|\/football\/|\/soccer\//i,
  racing: /F1|一級方程式|賽車|大獎賽|排位賽|Formula (?:1|One)|Grand Prix|\/f1\/|\/formula1\//i,
  other: /\bNFL\b|quarterback|touchdown|Super Bowl|\bNHL\b|hockey|college football|\bNCAA\b|\bCFP\b|\/nfl\/|\/nhl\/|\/college-football\/|\/ncaa|美式足球|冰球/i
};
export function sportsIn(text) {
  const t = String(text || '');
  return new Set(Object.keys(SPORT_RES).filter(k => SPORT_RES[k].test(t)));
}
// Sports' own sports by family (the catalog's): what counts as evidence.
const FAMILY = { basketball: 'basketball', baseball: 'baseball', soccer: 'soccer', racing: 'racing' };

// ---- A story's words ----

// Everything a story is known by: its title, each outlet's headline, the
// summary, the AI's titles, and its links (their sections say the sport).
export function sportText(s) {
  return [s?.title, s?.zh, s?.en, s?.sum, ...(s?.items || []).flatMap(it => [it[1], it[2]])].filter(Boolean).join('\n');
}
const escRe = w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// A name standing as a word in folded text ("curry" in "steph curry's", not in "curryville").
const wordIn = (folded, name) => Boolean(name) && new RegExp(`(?:^|[^a-z0-9])${escRe(name)}(?:$|[^a-z0-9])`).test(folded);
// As written, capitals and all ("Heat" the club, not "heat" the weather).
const capIn = (text, name) => Boolean(name) && new RegExp(`(?:^|[^A-Za-z0-9])${escRe(name)}(?:$|[^A-Za-z0-9])`).test(text);
const han = s => /\p{Script=Han}/u.test(s || '');

// The clubs of Asia's leagues the names table doesn't hold, whose Chinese
// names hold one of ours (讀賣巨人's 巨人 is never San Francisco's).
const ASIA_OTHERS = ['讀賣巨人', '阪神虎', '起亞虎', 'KIA虎', '樂天金鷲', '東北樂天', '樂天巨人', '橫濱DeNA', '海灣之星', '養樂多燕子', '中日龍', '廣島鯉魚', '火腿', '西武獅', '羅德', '歐力士', '軟銀鷹', '斗山熊', 'LG雙子', '三星獅', '韓華鷹', 'SSG登陸者', 'NC恐龍', 'KT巫師', '樂天巨人隊'];

// Other names the outlets give a club, by ESPN's name: English (each needs
// the story plainly of its sport unless it's two words) and Chinese.
const ALIAS = {
  'Philadelphia 76ers': [['Sixers'], ['七六人']],
  'Portland Trail Blazers': [['Blazers'], []],
  'Cleveland Cavaliers': [['Cavs'], []],
  'Dallas Mavericks': [['Mavs'], []],
  'Minnesota Timberwolves': [['Wolves', 'T-Wolves'], []],
  'Oklahoma City Thunder': [['OKC'], []],
  'Arizona Diamondbacks': [['D-backs'], []],
  'Manchester United': [['Man United', 'Man Utd'], []],
  'Manchester City': [['Man City'], []],
  'Tottenham Hotspur': [['Tottenham', 'Spurs'], ['熱刺']],
  'Wolverhampton Wanderers': [['Wolves'], []],
  'Newcastle United': [['Newcastle'], []],
  'West Ham United': [['West Ham'], []],
  'Brighton & Hove Albion': [['Brighton'], []],
  'Nottingham Forest': [['Forest'], []],
  'Leeds United': [['Leeds'], []],
  'Leicester City': [['Leicester'], []],
  'Paris Saint-Germain': [['PSG'], []],
  Barcelona: [['Barca', 'Barça'], ['巴薩']],
  Internazionale: [['Inter Milan', 'Inter'], ['國米']],
  Juventus: [['Juve'], []],
  'Bayern Munich': [['Bayern'], ['拜仁']],
  'Borussia Dortmund': [['Dortmund'], ['多特']],
  'Atlético Madrid': [['Atletico', 'Atlético'], ['馬競']],
  'Real Madrid': [[], ['皇馬']]
};
const ALIAS_BY = new Map(Object.entries(ALIAS).map(([k, v]) => [fold(k), v]));

const US_LEAGUES = new Set(['nba', 'mlb']);
const TWO_WORDS = /\b(?:Red Sox|White Sox|Blue Jays|Trail Blazers)$/;

// A team as Sports knows it: { name (ESPN's), short (its short name, "Lakers",
// "Man City"), league (Sports' key), sport (the catalog's family) }.
// → its ways of being named: English full, English short, Chinese full and
// short, and the other teams' Chinese names that hold its short one.
export function teamWays(team) {
  const sport = FAMILY[team?.sport] || team?.sport || '';
  const name = String(team?.name || '');
  const zh = teamNameZh(team?.league || '', name, sport) || null;
  const zhFull = zh?.full?.replace(/\s+/g, '') || '';
  const zhShort = zh?.short?.replace(/\s+/g, '') || '';
  // (The nickname: ESPN's short name, "Lakers"; for the NBA's and MLB's
  // without one, the name's last word, two for Red Sox, Blue Jays, Trail
  // Blazers. A club elsewhere goes by its whole name: "City" is no one's.)
  let short = String(team?.short || '').trim();
  if (/^[A-Z]{2,4}$/.test(short) || han(short)) short = '';
  if (!short && US_LEAGUES.has(team?.league)) {
    const words = name.split(/\s+/);
    short = words.slice(TWO_WORDS.test(name) ? -2 : -1).join(' ');
  }
  const others = zhShort && zhShort.length <= 3 ? [...teamsByZh(zhShort, 30).map(t => t.zh.replace(/\s+/g, '')).filter(z => z !== zhFull && z !== zhShort), ...ASIA_OTHERS.filter(z => z.includes(zhShort))] : [];
  const [also = [], alsoZh = []] = ALIAS_BY.get(fold(name)) || [];
  return { name, short: short === name ? '' : short, zhFull, zhShort: zhShort === zhFull ? '' : zhShort, others, sport, also, alsoZh };
}

// Whether a story names this team (its words, `ways` from teamWays).
// `loose`: a nickname is enough unless the story is plainly another sport's
// (his surname beside it already says it's him: "Curry負傷退場 勇士連勝止步").
export function namesTeam(text, ways, who = null, { loose = false } = {}) {
  if (!ways?.name) return false;
  const t = String(text || '');
  const f = fold(t);
  // The AI's reading of a Chinese story: the team as ESPN names it.
  if ((who?.t || []).some(x => fold(x) === fold(ways.name) || (ways.short && wordIn(fold(x), fold(ways.short)) && sportsIn(x).size === 0 && fold(x).endsWith(fold(ways.short))))) return true;
  if (wordIn(f, fold(ways.name))) return true;
  if (ways.zhFull && t.includes(ways.zhFull)) return true;
  const sports = sportsIn(t);
  // A nickname alone: only where the story is plainly of its sport.
  const sure = sports.has(ways.sport) ? !(sports.size > 1 && sports.has('other')) : loose && !sports.size;
  if (ways.short && ways.short.length >= 3 && sure && capIn(t, ways.short)) return true;
  // (Its other names: two words stand alone, one needs the sport; a Chinese one stands alone.)
  if ((ways.also || []).some(a => capIn(t, a) && (a.includes(' ') || sure))) return true;
  if ((ways.alsoZh || []).some(a => t.includes(a))) return true;
  if (ways.zhShort && (sure || (!sports.size && ways.zhShort.length >= 2 && !ways.others.length))) {
    // (Another team's Chinese name holding it taken out first: 皇家馬德里 isn't the Royals.)
    let rest = t;
    for (const o of ways.others) rest = rest.split(o).join(' ');
    if (rest.includes(ways.zhShort)) return true;
  }
  return false;
}

// A player as Sports knows him: { name (in English), zh (his own Chinese
// name, where his league writes one: the CPBL's), team (as teamWays takes) }.
export function playerWays(p) {
  const name = String(p?.name || '').trim();
  const parts = fold(name).split(/\s+/).filter(Boolean);
  // (The surname: the last word, a suffix aside: "Jaren Jackson Jr." is Jackson.)
  const tail = parts.filter(w => !/^(?:jr|sr|ii|iii|iv)\.?$/.test(w));
  const surname = tail.length > 1 ? tail[tail.length - 1] : '';
  return { name, full: parts.join(' '), first: tail[0] || '', surname, zh: String(p?.zh || '').trim(), team: p?.team ? teamWays(p.team) : null };
}
// Common words a surname can be ("Brown", "Young"): never matched alone.
const PLAIN = new Set(['brown', 'young', 'white', 'green', 'black', 'king', 'price', 'rose', 'love', 'hill', 'wood', 'bell', 'little', 'turner', 'hunter', 'cash', 'ball', 'bridges', 'banks', 'moore', 'miller', 'smith', 'jones', 'williams', 'johnson', 'davis', 'james', 'thomas', 'martin', 'lee', 'walker', 'allen', 'wright', 'scott', 'adams', 'baker', 'hall', 'rivera', 'garcia', 'martinez', 'rodriguez', 'lopez', 'gonzalez', 'perez', 'sanchez', 'ramirez', 'torres', 'diaz', 'cruz', 'reyes', 'kim', 'park', 'silva', 'santos', 'march', 'may', 'case', 'fox', 'bird', 'english', 'french', 'strong', 'early', 'long', 'short', 'gray', 'grey', 'wells', 'house', 'field', 'freeman', 'judge', 'trout', 'story', 'power', 'sale', 'means', 'sharp', 'hart', 'west', 'north', 'south', 'cole', 'page', 'grant', 'chase', 'wade', 'mann', 'starling']);
// Whether a story is about this player (`ways` from playerWays): his whole
// name, his own Chinese name, the AI's reading of a Chinese story, or his
// surname with his team named beside it.
export function namesPlayer(text, ways, who = null) {
  if (!ways?.full && !(ways?.zh?.length >= 2)) return false;
  const t = String(text || '');
  const f = fold(t);
  if (ways.full && wordIn(f, ways.full)) return true;
  if (ways.zh && ways.zh.length >= 2 && t.includes(ways.zh)) return true;
  // (The AI's name: the same, or the same surname and a first name his is
  // short or long for: "Steph Curry", never Seth Curry.)
  for (const x of who?.p || []) {
    const parts = fold(x).split(/\s+/).filter(w => !/^(?:jr|sr|ii|iii|iv)\.?$/.test(w));
    const first = parts[0] || '';
    if ((ways.full && parts.join(' ') === ways.full) || (ways.surname && parts.length > 1 && parts[parts.length - 1] === ways.surname && first.length >= 2 && (ways.first.startsWith(first) || first.startsWith(ways.first)))) return true;
  }
  // (His first name short, as written: "Steph Curry", never "Seth Curry".)
  if (ways.surname && ways.first.length >= 4)
    for (const m of t.matchAll(new RegExp(`(?:^|[^A-Za-z])([A-Z][a-z]{2,})\\s+${escRe(ways.surname.replace(/^./, c => c.toUpperCase()))}(?:$|[^A-Za-z])`, 'g')))
      if (ways.first.startsWith(fold(m[1]))) return true;
  if (ways.surname && ways.surname.length >= 4 && !PLAIN.has(ways.surname) && ways.team && capIn(t, ways.surname.replace(/^./, c => c.toUpperCase())) && wordIn(f, ways.surname) && namesTeam(t, ways.team, who, { loose: true })) return true;
  return false;
}

// ---- The pack ----

// news/sport.json made safe: { built, list: [story…] }, each story with its
// region, newest first. (The same stories News' sheet opens: News reads it too.)
export function cleanSport(raw) {
  const list = [];
  for (const region of ['tw', 'intl'])
    for (const s of Array.isArray(raw?.[region]) ? raw[region] : [])
      if (s && typeof s.id === 'string' && typeof s.title === 'string' && Array.isArray(s.items) && Number.isFinite(s.at))
        list.push({ ...s, region, k: KIND_NAMES[s.k] ? s.k : '', who: s.who && typeof s.who === 'object' ? { p: (s.who.p || []).filter(x => typeof x === 'string'), t: (s.who.t || []).filter(x => typeof x === 'string') } : null });
  list.sort((a, b) => b.at - a.at);
  return { built: Number(raw?.built) || 0, list };
}

// The stories about what a page shows, best first:
//   players  [player…] (playerWays' shape: any of them named)
//   teams    [team…] (teamWays' shape); `both`: every one of them named (a game's two sides)
//   kinds    only these kinds (a game's injuries: ['injury', 'ban'])
//   from, to  the story's last report within these times
//   most     how many (4)
// → [story…], a player's or team's own kinds of news (injury first) ahead
// of the rest, newest first within each; a story once.
export function newsAbout(pack, { players = [], teams = [], both = false, kinds = null, from = 0, to = Infinity, most = 4, now = Date.now() } = {}) {
  const pw = players.map(playerWays).filter(w => w.full || w.zh.length >= 2);
  const tw = teams.map(teamWays).filter(w => w.name);
  if (!pw.length && !tw.length) return [];
  const out = [];
  for (const s of pack?.list || []) {
    if (!(s.at >= from && s.at <= to) || now - s.at > SPORT_MS) continue;
    if (kinds && !kinds.includes(s.k)) continue;
    const text = sportText(s);
    const hitP = pw.some(w => namesPlayer(text, w, s.who));
    const hitT = tw.length ? (both ? tw.every(w => namesTeam(text, w, s.who)) : tw.some(w => namesTeam(text, w, s.who))) : false;
    if (hitP || hitT) out.push({ s, p: hitP });
  }
  // (A player's own story ahead of his team's; then its kind; then the newest.)
  out.sort((a, b) => b.p - a.p || KIND_ORDER[a.s.k] - KIND_ORDER[b.s.k] || b.s.at - a.s.at);
  // (The same news told by Taiwan's outlets and the world's: both kept, they're each a story.)
  return out.slice(0, most).map(x => x.s);
}

// A story's title in the reader's language where the AI made one
// (news/lines.json's), else its own: [text, lang].
export function storyTitle(s, lang = 'zh') {
  if (lang === 'en') return s.en && !han(s.en) ? [s.en, 'en'] : [s.title, han(s.title) ? 'zh-Hant' : 'en'];
  return s.zh && han(s.zh) ? [s.zh, 'zh-Hant'] : [s.title, han(s.title) ? 'zh-Hant' : 'en'];
}
