// Orbit Sports' highlights and replays, in the kit so the proxy's builders (the family's
// data, data.js) run the same code as the app; Orbit Sports' lib/highlights.mjs
// re-exports it.
// A finished game's highlights on YouTube: the official video itself, found
// by YouTube's search (read through the proxy, trimmed to each video's id,
// title, channel, age and length), else the search.
//
// Official, in order: the league's own channel; either side's own (a club's,
// a federation's: verified, named like the side); an English rights holder's.
// Only those whose game videos play in Taiwan (checked 2026-10 on each
// video's list of countries: the proxy can't, YouTube asks a Worker to sign
// in): the leagues' and the clubs' play everywhere; the NBA's own play in 24
// countries, not Taiwan (緯來 has the rights there, in Chinese), so an NBA
// game's are one channel's, GAMETIME HIGHLIGHTS' (English, every game, the
// same cut each time: 10/5's five and 10/6's four, where FreeDawkins had
// mostly the Lakers' and Ximo Pierto skipped some); the US rights holders'
// (CBS Sports Golazo and its Europe channel, NBC Sports, beIN SPORTS USA,
// ESPN FC's) play only there and aren't taken. CPBL's: ELTA's (its games'
// 全場精華), then the league's own.
//
// Only broadcast.mjs imported (itself import-free): Shared-Data loads the
// two alone (its pack of each recent game's video, sports/watch.json).
import { eltaVodOf } from './sports-broadcast.mjs';

export const YT = 'https://www.youtube.com';
export const LEAGUE_CHANNELS = {
  mlb: ['UCoLrcjPV5PbUrUyXq5mjc_A'],
  epl: ['UCG5qGWdu8nIRZqJ_GgDwQ-w'],
  seriea: ['UCBJeMCIeLQos7wacox4hmLQ'],
  bundesliga: ['UC6UL29enLNe4mqwTfAyeNuw'],
  ligue1: ['UCQsH5XtIc9hONE1BQjucM0g'],
  scotland: ['UCakRszbIjjGYtFrDPeg5Ieg'],
  facup: ['UCChcWqwYXCEs657MQ00qVWA'],
  ucl: ['UCyGa1YEx9ST66rYrJTGIKOw'],
  uel: ['UCyGa1YEx9ST66rYrJTGIKOw'],
  uecl: ['UCyGa1YEx9ST66rYrJTGIKOw'],
  nationsleague: ['UCyGa1YEx9ST66rYrJTGIKOw'],
  mls: ['UCSZbXT5TLLW_i-5W8FZpFsg'],
  f1: ['UCB_qr75-ydFVKSF9Dmo6izg'],
  // ELTA's (愛爾達體育家族: 【全場精華】10/3 中信兄弟 vs. 富邦悍將), then CPBL's own (10/03 中信 VS 富邦 全場精華).
  cpbl: ['UCCQvP4hsRW9emj0meGk15jg', 'UCDt9GAqyRzc2e5BNxPrwZrw']
};
// English rights holders' channels whose game videos play in Taiwan:
// Sportsnet (MLB), Premier Sports (Scottish football).
const BROADCASTERS = new Set(['UCVhibwHk4WKw4leUt6JfRLg', 'UCTj2CVogkBMbPejYWPh9GmA']);
// An NBA game's: GAMETIME HIGHLIGHTS' full-game cut (English, plays in Taiwan).
const NBA_ENGLISH = ['UC0LrZO9wORIqn_aRJtKdgfA'];
// Channels whose game highlights don't play in Taiwan: the NBA's own, CBS
// Sports Golazo's two, NBC Sports, beIN SPORTS USA.
const NOT_IN_TW = new Set(['UCWJ2lWNubArHWmf3FIHbfcQ', 'UCET00YnetHT7tOpu12v8jxg', 'UCf8YPuOWXlpTS7RibaJlP4g', 'UCqZQlzSHbVJrwrn5XvzrzcA', 'UC0YatYmg5JRYzXJPxIdRd8g']);

const SESSION_EN = { FP1: 'FP1', FP2: 'FP2', FP3: 'FP3', Race: 'Race', Qual: 'Qualifying', SR: 'Sprint', SS: 'Sprint Qualifying', SQ: 'Sprint Qualifying' };
// "Gulf Air Bahrain Grand Prix in Malaysia" → "Bahrain Grand Prix": the place
// before "Grand Prix" (two words for those that have two), no sponsor.
const TWO_WORD_GP = ['United States', 'Mexico City', 'Abu Dhabi', 'Las Vegas', 'Saudi Arabian', 'Emilia Romagna', 'São Paulo', 'Sao Paulo', 'Great Britain'];
// A name in its country's language: Gran Premio de la Ciudad de México,
// Grande Prêmio de São Paulo, Gran Premio d'Italia, Grand Prix de Monaco.
const LOCAL_GP = [[/Ciudad de M[ée]xico/i, 'Mexico City'], [/S[ãa]o Paulo/i, 'São Paulo'], [/Italia/i, 'Italian'], [/Espa[ñn]a/i, 'Spanish'], [/Emilia.Romagna/i, 'Emilia Romagna'], [/Monaco/i, 'Monaco']];
export function grandPrix(name) {
  const local = /Gran(?:de)?\s+Pr[eêé]mio|Grand Prix de/i.test(name || '') && LOCAL_GP.find(([re]) => re.test(name));
  if (local) return `${local[1]} Grand Prix`;
  const m = /([\p{L}'.-]+(?:\s+[\p{L}'.-]+)?)\s+Grand Prix/u.exec(String(name || ''));
  if (!m) return String(name || '').trim();
  const two = TWO_WORD_GP.find(x => m[1].endsWith(x));
  return `${two || m[1].split(/\s+/).at(-1)} Grand Prix`;
}

const nm = x => x?.en || x?.name || '';
// A CPBL club in Chinese (its full name: 中信兄弟), whatever the reader's language.
const zhOf = x => [x?.zh, x?.name, x?.short].find(n => /[\u3400-\u9fff]/.test(n || '')) || nm(x);
const SOCCER = new Set(['epl', 'seriea', 'bundesliga', 'ligue1', 'scotland', 'facup', 'ucl', 'uel', 'uecl', 'nationsleague', 'mls', 'worldcup']);
const football = e => SOCCER.has(e?.league);
// A playoff game's number and its round's short name, from ESPN's note
// ("NLDS - Game 3", "East Semifinals - Game 5"): { round, game } or null.
export function gameNumber(e) {
  const m = /^(.*?)\s*-\s*Game\s+(\d+)\b/i.exec(String(e?.note || ''));
  return m ? { round: m[1].trim(), game: Number(m[2]) } : null;
}
// What to search for. A playoff game by its round and number (the leagues
// name their videos so: "BREWERS vs. PADRES: NLDS Full Game 3 Highlights"),
// any other by its day; football's home side first, as it's written there;
// CPBL's in Chinese; a race weekend's session the way F1 names its videos
// ("FP1 Highlights | 2026 Bahrain Grand Prix").
export function highlightsQuery(e) {
  const d = new Date(e.start);
  const year = d.getUTCFullYear();
  if (e.kind === 'match') {
    if (e.league === 'cpbl') {
      const tw = new Date(Date.parse(e.start) + 8 * 3_600_000);
      return `${tw.getUTCMonth() + 1}/${tw.getUTCDate()} ${zhOf(e.away)} VS ${zhOf(e.home)} 全場精華 中華職棒`;
    }
    const pair = football(e) ? `${nm(e.home)} vs ${nm(e.away)}` : `${nm(e.away)} vs ${nm(e.home)}`;
    const g = gameNumber(e);
    if (g) return `${pair} ${g.round} Game ${g.game} highlights ${year}`;
    const day = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: football(e) ? 'Europe/London' : 'America/New_York' });
    return `${pair} highlights ${day}`;
  }
  return e.league === 'f1' ? `F1 ${year} ${grandPrix(e.enName || e.name)} ${SESSION_EN[e.sessionKey] || ''} Highlights` : `${e.enName || e.name} ${SESSION_EN[e.sessionKey] || ''} highlights ${year}`;
}
// The searches to try, in order: a CPBL game ELTA showed (its four clubs'
// home games) ELTA's way first ("【全場精華】10/4 統一獅 vs. 富邦悍將": only
// those words find its video), then the league's.
export function highlightsQueries(e) {
  const q = highlightsQuery(e);
  if (e?.league !== 'cpbl' || e.kind !== 'match' || !eltaVodOf(e, [e.home?.name, e.home?.short, e.home?.zh].filter(Boolean))) return [q];
  const tw = new Date(Date.parse(e.start) + 8 * 3_600_000);
  return [`全場精華 ${tw.getUTCMonth() + 1}/${tw.getUTCDate()} ${zhOf(e.away)} vs. ${zhOf(e.home)} 愛爾達`, q];
}
const urlOf = q => `${YT}/results?search_query=${encodeURIComponent(q.replace(/\s+/g, ' ').trim())}`;
export const searchUrl = e => urlOf(highlightsQuery(e));
export const searchUrls = e => highlightsQueries(e).map(urlOf);
export const videoUrl = id => `${YT}/watch?v=${id}`;

// ---- Which video is the game's --------------------------------------------------------

const fold = s => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/ø/g, 'o').replace(/ß/g, 'ss');
// Words of a club's name that say nothing on their own.
const GENERIC = new Set(['fc', 'cf', 'ac', 'as', 'sc', 'afc', 'cfc', 'ssc', 'us', 'rc', 'sv', 'vfb', 'vfl', 'tsg', 'fk', 'sk', 'club', 'de', 'la', 'le', 'the', 'and', 'of', 'united', 'city', 'real', 'sporting', 'athletic', 'football', 'calcio', 'olympique', 'stade', 'borussia', 'hotspur', 'albion', 'wanderers', 'county', 'town', 'rovers',
  // A city two clubs share (New York City FC, Red Bull New York; LAFC, LA
  // Galaxy): "New York" alone named both, and NYCFC v Cincinnati had
  // Cincinnati v Red Bull New York's video (2026-10-12). By their own names.
  'new', 'york', 'los', 'angeles']);
// How a side is often written in titles that its name doesn't say.
const ALIASES = [[/manchester united/, ['man utd', 'man united']], [/manchester city/, ['man city']], [/czechia/, ['czech']], [/turkiye|turkey/, ['turkey', 'turkiye']], [/internazionale/, ['inter']], [/paris saint-germain/, ['psg']], [/bayern munich/, ['bayern']], [/wolverhampton/, ['wolves']], [/tottenham/, ['spurs']], [/nottingham forest/, ['forest']], [/brighton/, ['brighton']], [/bosnia/, ['bosnia']], [/republic of ireland/, ['ireland']], [/diamondbacks/, ['d-backs', 'dbacks']], [/new york city/, ['nycfc', 'new york city']], [/red bull new york|new york red bulls/, ['red bulls', 'rbny']], [/los angeles fc|^lafc$/, ['lafc']]];
// The ways a side can be named in a title: its distinctive words (Brewers,
// Torino), the whole name, the ways it's shortened, its Chinese names.
export function sideWords(side, other = null) {
  const names = [side?.en, side?.name, side?.short].filter(Boolean).map(fold);
  const otherWords = new Set([other?.en, other?.name, other?.short].filter(Boolean).flatMap(n => fold(n).split(/[^\p{L}\p{N}]+/u)));
  const words = new Set();
  for (const n of names) {
    // A Chinese name whole (中信兄弟, 兄弟): two characters at least.
    if (/[\u3400-\u9fff]/.test(n)) {
      if (n.length >= 2) words.add(n);
      // CPBL's clubs by their owner too, as titles write them (中信 for 中信兄弟, 統一 for 統一7-ELEVEn獅).
      if (n.length >= 3) words.add(n.slice(0, 2));
      continue;
    }
    words.add(n);
    const parts = n.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
    const own = parts.filter(w => w.length >= 3 && !otherWords.has(w));
    for (const w of own.filter(w => !GENERIC.has(w))) words.add(w);
    const aliases = ALIASES.filter(([re]) => re.test(n)).flatMap(([, alias]) => alias);
    // Only generic words of its own left (Manchester City against United): those (not when it has its own short names).
    if (!own.some(w => !GENERIC.has(w)) && !aliases.length) for (const w of own) words.add(w);
    aliases.forEach(a => words.add(a));
  }
  return [...words];
}
const named = (title, side, other) => sideWords(side, other).some(w => title.includes(w));
// A Taiwan title's day ("10/03 中信 VS 富邦", "【全場精華】10/3 中信兄弟 vs."), [month, day] or null.
const twDay = title => {
  const m = /(?<![\d/])(\d{1,2})\/(\d{1,2})(?![\d/])/.exec(title);
  return m ? [Number(m[1]), Number(m[2])] : null;
};
// The days a title gives ("(September 18)", "18 September 2026", "Sep 18,
// 2026"; in the US's leagues "(9/18/26)" too), each 'M-D', or [].
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const MONTH = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun[e]?|jul[y]?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\\.?';
const US = new Set(['mlb', 'nba', 'wnba', 'mls']);
export function titleDays(title, league = '') {
  const t = String(title || '').toLowerCase();
  const days = [];
  const at = (m, d) => m >= 1 && m <= 12 && d >= 1 && d <= 31 && days.push(`${m}-${d}`);
  for (const m of t.matchAll(new RegExp(`\\b${MONTH}\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`, 'g'))) at(MONTHS.indexOf(m[1].slice(0, 3)) + 1, Number(m[2]));
  for (const m of t.matchAll(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+${MONTH}\\b`, 'g'))) at(MONTHS.indexOf(m[2].slice(0, 3)) + 1, Number(m[1]));
  if (US.has(league)) for (const m of t.matchAll(/(?<![\d/])(\d{1,2})\/(\d{1,2})\/(?:20)?\d\d(?![\d/])/g)) at(Number(m[1]), Number(m[2]));
  return days;
}
// The days a game can be named by: the US's leagues by their day in New York
// or on the west coast (MLB's "(September 18)": its day where it's played),
// football's in London, New York's too (the Americas' late kick-offs). Never
// a day either side: the same two sides can meet the next day.
const zoneDay = (ms, timeZone) => {
  const [m, d] = new Date(ms).toLocaleDateString('en-US', { timeZone, month: 'numeric', day: 'numeric' }).split('/');
  return `${Number(m)}-${Number(d)}`;
};
const gameDays = (ms, league) => new Set((US.has(league) ? ['America/New_York', 'America/Los_Angeles'] : ['Europe/London', 'America/New_York']).map(z => zoneDay(ms, z)));
// The scores a title gives ("TORINO-ROMA 0-2", "(2-1)"), never a season (2026/27).
const scoresIn = title => [...title.matchAll(/(?<![\d/.:])(\d{1,2})\s*[-–:x]\s*(\d{1,2})(?![\d/.:])/g)].map(m => [Number(m[1]), Number(m[2])]);
// A video's age ("10h ago", "3 days ago", "Streamed 2 weeks ago") as a span in ms, or null.
const UNIT = { s: 1e3, sec: 1e3, second: 1e3, m: 6e4, min: 6e4, minute: 6e4, h: 3.6e6, hr: 3.6e6, hour: 3.6e6, d: 8.64e7, day: 8.64e7, w: 6.048e8, wk: 6.048e8, week: 6.048e8, mo: 2.592e9, month: 2.592e9, y: 3.1536e10, yr: 3.1536e10, year: 3.1536e10 };
export function ageSpan(text) {
  const m = /(\d+)\s*([a-z]+?)s?\s+ago/i.exec(String(text || ''));
  const unit = m && UNIT[m[2].toLowerCase()];
  if (!unit) return null;
  const n = Number(m[1]);
  return { min: n * unit, max: (n + 1) * unit };
}
// Words of a video that isn't the game's highlights.
const NOT_HIGHLIGHTS = /every play|reaction|preview|press conference|post-?match|interview|\bwomen'?s?\b|\bwfc\b|u-?\d{2}\b|sixes|simulation|recreation|efootball|\bfc ?2\d\b|\bpes\b|fantasy|top \d+|predict|best of|all goals from|\bmatchday \d+ \|/i;
// A part of a game, not the game: an inning's, a quarter's or a period's
// cut, its last outs (MLB's "FULL 5th INNING: … | 2026 NLCS Game 2 MLB
// Highlights" names both sides, the game and highlights: it was picked over
// the game's own, 2026-10-13).
const PART_OF_GAME = /\b(\d+(st|nd|rd|th)|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|extra) (inning|quarter|period)s?\b|\binnings?\b|\bfull (top|bottom|bot)\b|\b(final|last) (\d+|three|two) outs?\b|\bfinal out\b/i;
// (The leagues played in innings, quarters or periods, by key: this file is Shared-Data's too, which reads no league list.)
const TIMED = new Set(['mlb', 'cpbl', 'npb', 'kbo', 'nba', 'wnba', 'nbl', 'nhl', 'nfl', 'ncaaf']);
// How official a channel is for a game: 0 the league's, 1 a side's, 2 an
// English rights holder's, 3 an NBA game's full-game channel;
// null for anyone else.
function tier(v, e) {
  if (NOT_IN_TW.has(v.channelId)) return null;
  if ((LEAGUE_CHANNELS[e.league] || []).includes(v.channelId)) return 0;
  // A side's own (a club's, a federation's: Germany's is German Football).
  // (The NBA's: one channel's, for one cut every game; CPBL's: its two above.)
  if (e.league !== 'nba' && e.league !== 'cpbl' && e.kind === 'match' && v.verified && [e.home, e.away].some(s => sideWords(s).some(w => !/[\u3400-\u9fff]/.test(w) && w.length >= 4 && fold(v.channel).includes(w.length >= 7 ? w.slice(0, 6) : w)))) return 1;
  if (BROADCASTERS.has(v.channelId)) return 2;
  if (e.league === 'nba' && NBA_ENGLISH.includes(v.channelId)) return 3;
  return null;
}
// The game's highlights among a search's videos ({ id, title, channel,
// channelId, verified, age, length }), or null: an official channel's (see
// tier), playable in Taiwan, its title saying highlights and both sides (or
// the race and its session), the game's number and score when it gives them,
// its year, and put up after the game (by its age). English first but for CPBL.
export function pickHighlights(videos, e, now = Date.now()) {
  if (!videos?.length || !e) return null;
  const start = Date.parse(e.official || e.start);
  const year = new Date(start).getUTCFullYear();
  const g = e.kind === 'match' ? gameNumber(e) : null;
  const scores = e.kind === 'match' ? [Number(e.home?.score), Number(e.away?.score)] : null;
  const fits = videos
    .map((v, i) => ({ v, i, tier: tier(v, e), title: fold(v.title).replace(/#/g, '') }))
    .filter(x => x.tier != null)
    .filter(({ v, title, tier }) => {
      if (NOT_HIGHLIGHTS.test(v.title) || /maxi sintesi/.test(title)) return false;
      if (TIMED.has(e.league) && PART_OF_GAME.test(v.title)) return false;
      // MLB's: the whole game's, said so ("Full Game Highlights", "Game
      // Highlights"); before it's up, none (the search instead).
      if (e.league === 'mlb' && !/full game|game highlights/.test(title)) return false;
      // Said to be highlights (résumé: in French); the league's own video of
      // the game (Ligue 1's "HAVRE AC - ANGERS SCO (0-0) | Week 4") by its sides and score.
      const called = /highlight|精華|resume/.test(title);
      if (!called && !(tier === 0 && e.kind === 'match' && scoresIn(title).length)) return false;
      // Put up after the game, within three days of it (two weeks let in
      // the return leg's: Slovenia v Scotland's on Scotland v Slovenia's,
      // twelve days on, 2026-10-12).
      const age = ageSpan(v.age);
      if (age && (age.min > now - start + 3_600_000 || age.max < now - start - 3 * 86_400_000)) return false;
      // Its year (a season's, 2026/27, counts both).
      const years = [...title.matchAll(/\b(20\d\d)(?:\s*[/-]\s*(\d\d))?\b/g)].flatMap(m => [Number(m[1]), ...(m[2] ? [Number(m[1].slice(0, 2) + m[2])] : [])]);
      if (years.length && !years.includes(year)) return false;
      if (e.kind !== 'match') {
        const place = fold(grandPrix(e.enName || e.name).replace(/\s*Grand Prix$/i, ''));
        const word = fold(SESSION_EN[e.sessionKey] || '');
        if (!place || !title.includes(place)) return false;
        if (!word) return true;
        if (!title.includes(word)) return false;
        // Sprint isn't Sprint Qualifying; qualifying and the race aren't the sprint's.
        if (e.sessionKey === 'SR' && /sprint (qualifying|shootout)/.test(title)) return false;
        if ((e.sessionKey === 'Qual' || e.sessionKey === 'Race') && /sprint/.test(title)) return false;
        return true;
      }
      if (!named(title, e.home, e.away) || !named(title, e.away, e.home)) return false;
      // A CPBL title's day is the game's (Taiwan's): the same two clubs play three days running.
      if (e.league === 'cpbl') {
        const d = twDay(v.title);
        const tw = new Date(start + 8 * 3_600_000);
        if (d && (d[0] !== tw.getUTCMonth() + 1 || d[1] !== tw.getUTCDate())) return false;
      }
      // A title naming a day names the game's ("(August 28)" is another meeting of the two).
      if (e.league !== 'cpbl') {
        const said = titleDays(v.title, e.league);
        const ours = gameDays(start, e.league);
        if (said.length && !said.some(d => ours.has(d))) return false;
      }
      // The game's number: a title naming another game is another game's.
      const n = [...title.matchAll(/\b(?:game|g)\s*(\d+)\b/g)].map(m => Number(m[1]));
      if (g && n.length && !n.includes(g.game)) return false;
      if (!g && n.length && e.series) return false;
      // Its score, either way round, when the title gives one.
      const said = scoresIn(title);
      if (said.length && scores.every(Number.isFinite) && !said.some(([a, b]) => (a === scores[0] && b === scores[1]) || (a === scores[1] && b === scores[0]))) return false;
      return true;
    })
    // In English first (but for CPBL's): not Chinese, not French.
    .map(x => ({ ...x, zh: e.league !== 'cpbl' && (/[\u3400-\u9fff]/.test(x.v.title) || !/highlight/.test(x.title)) ? 1 : 0 }))
    .sort((a, b) => a.tier - b.tier || (a.tier === 0 ? (LEAGUE_CHANNELS[e.league] || []).indexOf(a.v.channelId) - (LEAGUE_CHANNELS[e.league] || []).indexOf(b.v.channelId) : 0) || a.zh - b.zh || (a.tier === 3 ? NBA_ENGLISH.indexOf(a.v.channelId) - NBA_ENGLISH.indexOf(b.v.channelId) : 0) || a.i - b.i);
  return fits[0] ? { ...fits[0].v, official: fits[0].tier <= 1 } : null;
}

// ---- Finding it ------------------------------------------------------------------------

// A game's key, as the pack and the device keep it.
export const watchKey = e => `${e.league}:${e.id}:${e.sessionKey || ''}`;
// Shared-Data's pack (sports/watch.json, built every few hours): each recent
// game's highlights and whether ELTA has its whole game ({ games: { key:
// { hl?: { id, channel, length, official }, elta?: 1 } } }), set by the app.
let pack = null;
export const setWatchPack = p => {
  if (p?.games) pack = p;
};
// Shared-Data's season of them, a month a file (sports/watch/<league>/<YYYY-MM>.json,
// the same entries, carried for the season: a game's links never change),
// for a game the recent pack has let go: read when such a game is opened.
export const WATCH_DAYS = 10;
export const watchMonthPath = e => `sports/watch/${e.league}/${new Date(e.official || e.start).toISOString().slice(0, 7)}.json`;
const months = new Map();
export const setWatchMonth = (path, p) => {
  if (p?.games) months.set(path, p.games);
};
// Whether a game's links could be in its month's file and it isn't read yet:
// past ten days, or past a day with the recent pack read and the game not
// in it (found in an earlier run, archived: NLCS Game 4's, two days on, 2026-10-18).
export const watchMonthWanted = (e, now = Date.now()) => {
  if (!e?.start || months.has(watchMonthPath(e))) return false;
  const age = now - Date.parse(e.start);
  return age > (WATCH_DAYS - 1) * 86_400_000 || (age > 86_400_000 && Boolean(pack) && !pack.games?.[watchKey(e)]?.hl);
};
// Its month's file read (`readPack`: the kit's packJson); never throws. A
// failed read isn't kept (asked again next time), only the file as it is.
export async function loadWatchMonth(e, readPack, now = Date.now()) {
  if (!readPack || !watchMonthWanted(e, now)) return;
  const path = watchMonthPath(e);
  setWatchMonth(path, await readPack(path, { ttl: 6 * 3_600_000 }).catch(() => null));
}
export const watchOf = e => (e ? pack?.games?.[watchKey(e)] || (e.start ? months.get(watchMonthPath(e))?.[watchKey(e)] : null) || null : null);
// Found ones kept on the device too (a game opened before the pack had it).
// (v3: titles' days checked, so v2's another day's video is let go.)
// (v4: v3's could hold an inning's cut picked for an MLB game, 2026-10-13.)
const KEPT = 'fx.highlights.v4';
function kept() {
  try {
    localStorage.removeItem('fx.highlights.v2');
    return JSON.parse(localStorage.getItem(KEPT) || '{}') || {};
  } catch {
    return {};
  }
}
export const knownHighlights = e => (e ? kept()[watchKey(e)] || watchOf(e)?.hl || null : null);
function keep(e, v) {
  try {
    const all = kept();
    all[watchKey(e)] = { ...v, at: Date.now() };
    // The newest 300.
    const list = Object.entries(all).sort((a, b) => (b[1].at || 0) - (a[1].at || 0)).slice(0, 300);
    localStorage.setItem(KEPT, JSON.stringify(Object.fromEntries(list)));
  } catch {}
}
const short = v => ({ id: v.id, channel: v.channel, channelId: v.channelId, length: v.length, official: Boolean(v.official) });
// What a video is, for its row's name: ELTA's (CPBL), the league's or a
// side's own, or a full-game channel's (the NBA's).
export const ELTA_CHANNEL = 'UCCQvP4hsRW9emj0meGk15jg';
export const highlightsKind = v => (!v ? 'search' : v.channelId === ELTA_CHANNEL ? 'elta' : v.official ? 'official' : 'full');
// The game's video ({ id, channel, length, official }), or null while there's
// none. A failed read throws: never "none". `read`: the proxy's (proxyJson).
export async function findHighlights(e, read, now = Date.now()) {
  if (e?.status?.state !== 'post' || e.status.void) return null;
  const known = knownHighlights(e);
  if (known) return known;
  const old = now - Date.parse(e.start) > 7 * 86_400_000;
  let v = null;
  for (const url of searchUrls(e)) {
    const data = await read(url, { ttl: old ? 86_400_000 : 20 * 60_000 });
    if ((v = pickHighlights(data?.videos, e, now))) break;
  }
  if (v) keep(e, short(v));
  return v ? short(v) : null;
}
// Recent games over that the pack doesn't have yet: looked up one at a time
// in the background, so a sheet opened later has its video at once. Each
// game asked once a session, and only until two hours after it (five from its
// start): the pack is built every hour (the proxy's builders/watch.js), so
// later the pack has it and a phone's own search would only spend the
// proxy's requests.
export const PREFETCH_MS = 5 * 3_600_000;
const asked = new Set();
let queue = Promise.resolve();
export function prefetchHighlights(events, read, now = Date.now()) {
  for (const e of events || []) {
    if (e?.status?.state !== 'post' || e.status.void || now - Date.parse(e.start) > PREFETCH_MS) continue;
    const key = watchKey(e);
    if (asked.has(key) || knownHighlights(e)) continue;
    asked.add(key);
    queue = queue.then(() => findHighlights(e, read, now).catch(() => null));
  }
  return queue;
}
