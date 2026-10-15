// Orbit Sports' where to watch in Taiwan, in the kit so the proxy's builders (the family's
// data, data.js) run the same code as the app; Orbit Sports' lib/broadcast.mjs
// re-exports it.
// Where to watch in Taiwan: ELTA.tv (愛爾達's streaming service) and Apple
// TV, the only two Orbit Sports shows, and every league it covers is on
// one of them (lib/leagues.mjs keeps only these of the shared catalogue).
//
// Checked October 2026 against ELTA's own schedule (its league names below)
// and its 2026-27 rights (NBA 2026-2030, F1 2026-2029, the European football
// it carries), and Apple TV's Taiwan storefront: MLS there, its MLB Friday
// Night Baseball not (that room isn't in the Taiwan store). Rights change:
// keep this list current.
export const CHECKED = '2026-10';

// ELTA's sports schedule (in its app: 直播節目表), for a game ELTA carries on
// a channel its own list doesn't name yet (an NBA game from NBA.com, below).
const ELTA = { zh: '愛爾達 ELTA.tv', en: 'ELTA.tv', short: { zh: '愛爾達', en: 'ELTA' }, svc: 'elta', url: 'https://eltaott.tv/channel/sports_program_detail', app: 'eltatv://schedule/live' };
// Apple TV's MLS channel (MLS Season Pass, every game: exact to each one), a
// link the Apple TV app opens.
const APPLE = { zh: 'Apple TV', en: 'Apple TV', short: { zh: 'Apple TV', en: 'Apple TV' }, svc: 'appletv', url: 'https://tv.apple.com/tw/channel/mls/tvs.sbd.7000', exact: true };

export const BROADCAST = {
  mlb: [ELTA],
  // The home games of four clubs (台鋼, 富邦, 統一, 味全: ELTA's 2026 rights); which ones, its schedule says.
  cpbl: [{ ...ELTA, note: { zh: '部分場次', en: 'selected games' } }],
  // Some games (one or two a day); which ones, its schedule and NBA.com's say.
  nba: [{ ...ELTA, note: { zh: '部分場次', en: 'selected games' } }],
  epl: [ELTA],
  seriea: [ELTA],
  bundesliga: [ELTA],
  ligue1: [ELTA],
  ucl: [ELTA],
  uel: [ELTA],
  uecl: [ELTA],
  scotland: [ELTA],
  mls: [APPLE],
  facup: [ELTA],
  nationsleague: [ELTA],
  // Every session, practice too (2026-2029): its channel once ELTA's list names it.
  f1: [{ ...ELTA, every: true }]
};

export const broadcastsOf = league => BROADCAST[league] || [];
// Where a game's channels came from, under the card: ELTA's schedule (a
// channel named), NBA.com (its ELTA games, the channel not yet), else when
// the list was checked. A league ELTA carries whole (F1) is no NBA.com game.
export function twSource(exact, en) {
  if (exact.some(b => b.ch)) return en ? "ELTA's schedule" : '愛爾達節目表';
  // (MLB's postseason, its channel to come: ELTA has the whole of it, not NBA.com's word.)
  if (exact.some(b => b.tba)) return en ? 'MLB postseason' : 'MLB 季後賽';
  if (exact.some(b => b.svc === 'elta' && !b.every)) return 'NBA.com';
  return en ? `Checked ${CHECKED}` : `${CHECKED} 查核`;
}

// ---- ELTA's own schedule: which game each channel carries ---------------------------
//
// ELTA (愛爾達) publishes its sports channels' live programs about two weeks
// ahead (the list its site's 節目表 reads; the proxy trims it). Where it
// covers a game's day, a game on ELTA shows the channel it's on, and a game it
// doesn't carry isn't said to be on ELTA.
export const ELTA_LIST = 'https://piceltaott-elta.cdn.hinet.net/production/json/program_list/sports_live_program_list.json';
// ELTA's league names → Orbit Sports' leagues, by its English name or its
// Chinese one, either way it writes them: it renames them now and then (UCL
// became "UEFA Champions League", UECL "UEFA Conference League"; 蘇超 had no
// English name, then "Scottish Premiership"), so a leading UEFA and the case
// don't count, the old names stay, and the Chinese one stands in.
const ELTA_LEAGUE = {
  mlb: 'mlb', cpbl: 'cpbl', nba: 'nba', 'premier league': 'epl', 'serie a': 'seriea', bundesliga: 'bundesliga', 'ligue 1': 'ligue1',
  ucl: 'ucl', 'champions league': 'ucl', uel: 'uel', 'europa league': 'uel', uecl: 'uecl', 'conference league': 'uecl', 'europa conference league': 'uecl',
  'scottish premiership': 'scotland', 'fa cup': 'facup', 'nations league': 'nationsleague', f1: 'f1', 'formula 1': 'f1',
  中華職棒: 'cpbl', 英超: 'epl', 義甲: 'seriea', 德甲: 'bundesliga', 法甲: 'ligue1', 歐冠: 'ucl', 歐霸: 'uel', 歐會: 'uecl', 歐協聯: 'uecl',
  蘇超: 'scotland', 英足總盃: 'facup', 足總盃: 'facup', 歐國聯: 'nationsleague'
};
const leagueKeyOf = name => String(name || '').trim().replace(/^uefa\s*/i, '').trim().toLowerCase();
export const eltaLeague = (...names) => names.map(n => ELTA_LEAGUE[leagueKeyOf(n)]).find(Boolean) || null;
// Its channels: the four 體育台 (with ads), the ten MAX (no ads) and MOD's
// own 980s (its add-on sports channels: not streamed, so never shown).
export function eltaChannel(n) {
  const TV = { 101: 1, 105: 2, 110: 3, 115: 4 };
  const base = { svc: 'elta', ch: n, url: eltaWatchUrl(n), app: eltaAppUrl(n) };
  if (TV[n]) return { ...base, zh: `ELTA.tv 體育${TV[n]}台`, en: `ELTA.tv Sports ${TV[n]}`, short: { zh: `愛爾達${TV[n]}台`, en: `ELTA ${TV[n]}` } };
  if (n >= 540 && n <= 549) return { ...base, zh: `ELTA.tv 體育MAX${n - 539}台`, en: `ELTA.tv Sports MAX ${n - 539}`, short: { zh: `MAX${n - 539}台`, en: `MAX ${n - 539}` } };
  if (n >= 980 && n <= 989) return { ...base, zh: `MOD ${n}台`, en: `MOD ${n}`, short: { zh: `MOD ${n}`, en: `MOD ${n}` }, mod: true };
  return { ...base, zh: `ELTA.tv（${n}）`, en: `ELTA.tv (${n})`, short: { zh: `ELTA ${n}`, en: `ELTA ${n}` } };
}
// The page on ELTA.tv that plays a channel (MOD's 980s aren't on ELTA.tv).
const ELTA_PLAY = { 101: 1, 102: 3, 103: 2, 104: 4, 105: 5, 110: 6, 115: 92, 540: 71, 541: 72, 542: 73, 543: 81, 544: 108, 545: 109, 546: 110, 547: 111, 548: 140, 549: 141 };
export const eltaWatchUrl = n => (ELTA_PLAY[n] ? `https://eltaott.tv/channel/play/${n}/${ELTA_PLAY[n]}` : n >= 980 ? null : 'https://eltaott.tv/channel');
// The same channel in the ELTA.tv app: the link ELTA's own site sends phones
// to (its appRedirect.js: /channel/play/<ch>/… → eltatv://live/<ch>).
export const eltaAppUrl = n => (ELTA_PLAY[n] ? `eltatv://live/${n}` : null);

// What a program sounds like, from ELTA's title and channel:
//   'en'    English, the original feed (原音, 英文解說)
//   'dual'  雙語: Chinese commentary with the original on the second audio
//           track (said so, and a 體育台's program that says nothing: the
//           four 體育台 carry both); never CPBL's: a Taiwan league's own
//           broadcast has no English
//   'local' CPBL's 雙語: two Chinese commentary teams (ELTA's own and a
//           台語 one for 台鋼's home games, the club's for 富邦's)
//   'venue' Chinese commentary with the ground's sound on the second track
//           (副聲道現場原音)
//   'zh'    Chinese only (中文, a MAX channel's program that says nothing, CPBL's)
// `adFree`: said so, or a MAX channel.
const SPORTS_TV = new Set([101, 105, 110, 115]);
export function eltaAudio(title, ch, league = '') {
  const t = String(title || '');
  const audio = /雙語/.test(t) ? (league === 'cpbl' ? 'local' : 'dual') : /副聲道/.test(t) ? 'venue' : /原音|英文|English/i.test(t) ? 'en' : /中文/.test(t) ? 'zh' : SPORTS_TV.has(ch) && league !== 'cpbl' ? 'dual' : 'zh';
  return { audio, adFree: /無廣告/.test(t) || (ch >= 540 && ch <= 549) };
}
export const AUDIO_NAMES = {
  en: { zh: '英文原音', en: 'English' },
  dual: { zh: '雙語', en: 'Chinese + English' },
  venue: { zh: '中文・現場音', en: 'Chinese + ground' },
  local: { zh: '雙語・中文', en: 'Two Chinese crews' },
  zh: { zh: '中文', en: 'Chinese' }
};
// Whether a channel has the commentary the person likes: Chinese on every
// kind but 'en'; the original on 'en' and on 'dual' (its second track).
export const hasAudio = (c, prefer = 'en') => (prefer === 'zh' ? c.audio !== 'en' : c.audio === 'en' || c.audio === 'dual');
// How well a channel suits the person: no ads first (a MAX channel before
// the 體育台 with the same game, whatever their commentary: the owner's
// call), then their commentary (on its main track before a second one).
// Lower is better.
export function channelRank(c, prefer = 'en') {
  const order = prefer === 'zh' ? { zh: 0, dual: 0, venue: 0, local: 0, en: 3 } : { en: 0, dual: 1, venue: 2, local: 3, zh: 3 };
  return (c.adFree ? 0 : 10) + (order[c.audio] ?? 3);
}

// The list (trimmed by the proxy, or ELTA's own) as programs: { league, start,
// end (ms), ch, title, teams: ['海盜', '老虎'] or [], day }. Replays left out.
export function parseElta(data) {
  const raw = Array.isArray(data?.programs)
    ? data.programs
    : Object.entries(data?.calendar || {}).flatMap(([d, list]) => (Array.isArray(list) ? list : []).map(p => ({ d, s: p.start_time, e: p.end_time, ch: p.channel_number, g: p.game_type_en || p.game_type, z: p.game_type, t: p.program_desc })));
  const out = [];
  for (const p of raw) {
    const league = eltaLeague(p.g, p.z);
    // Live only: not a delayed showing (D-LIVE) or the children's version (Kids).
    if (!league || !p.s || !/\bLIVE\b/i.test(p.t || '') || /D-LIVE/i.test(p.t || '') || /^\s*Kids\b/i.test(p.t || '')) continue;
    // "海盜 VS 老虎 李灝宇先發… 例行賽 9/27(原音) LIVE": the two sides before the details.
    const vs = /^\s*(?:UEFA\s+)?([^\s【】]+)\s+VS\s+([^\s【】(（]+)/i.exec(p.t || '');
    // The title without "LIVE" and the day (the row shows the time), the details kept.
    const title = String(p.t || '')
      .replace(/\s*LIVE\s*$/i, '')
      .replace(/\s+\d{1,2}\/\d{1,2}(?=\s|\(|（|$)/, '')
      .trim();
    out.push({ league, start: p.s * 1000, end: (p.e || p.s + 10_800) * 1000, ch: Number(p.ch), title, teams: vs ? [vs[1], vs[2]] : [], day: p.d, ...eltaAudio(p.t, Number(p.ch), league) });
  }
  return out.sort((a, b) => a.start - b.start);
}
// The days the list covers ('YYYY-MM-DD', Taiwan's): outside them nothing is known.
export const eltaDays = programs => {
  const days = programs.map(p => p.day).filter(Boolean).sort();
  return days.length ? { from: days[0], to: days.at(-1) } : null;
};

// Two names for one side ("里茲聯" and "利茲聯", "海盜" and "匹茲堡海盜"): two
// characters in a row in common.
export function zhSame(a, b) {
  const [x, y] = [String(a || ''), String(b || '')];
  if (!x || !y) return false;
  if (x.includes(y) || y.includes(x)) return true;
  for (let i = 0; i < x.length - 1; i++) if (y.includes(x.slice(i, i + 2))) return true;
  return false;
}
// How alike two ways of writing a side are, 0 to 1: the characters they
// share in order, against the shorter one. ELTA's names are often not ours:
// 波赫 for 波士尼亞與赫塞哥維納 and 波圖 for 波爾圖 (1), 帕弗斯 for 帕福斯
// (0.67), 托連塞 for 托倫斯 (0.33); and two sides can share a part:
// 斯洛維尼亞 and 斯洛伐克, 蘇格蘭 and 英格蘭, 皇家貝提斯 and 皇家馬德里.
export function zhLike(a, b) {
  const [x, y] = [String(a || ''), String(b || '')];
  if (!x || !y) return 0;
  if (x === y) return 1;
  const row = new Array(y.length + 1).fill(0);
  for (const c of x) {
    let diag = 0;
    for (let j = 1; j <= y.length; j++) {
      const up = row[j];
      row[j] = c === y[j - 1] ? diag + 1 : Math.max(up, row[j - 1]);
      diag = up;
    }
  }
  return row[y.length] / Math.min(x.length, y.length);
}
// How well a program's two sides fit a game's, 0 to 2: each of ELTA's names
// against one side (either way round), each side by its best name. A side
// written the same and the other ELTA's own way (托連塞 VS 桑德蘭) fits; one
// shared part (塞爾塔維戈 VS 尤文圖斯 against 本菲卡 vs 塞爾提克) doesn't.
// `sides`: [home's names, away's names], or one list of both.
// `both`: each side has to fit half at least (an episode, which has no
// time to narrow it down: 勇士 VS 馬林魚 isn't 勇士 vs 道奇).
// `order`: 'home' (ELTA's first side is the home one: football) or 'away'
// (baseball, basketball); either way round when not said.
function pairFit(teams, sides, { both = false, order = '' } = {}) {
  const [a, b] = typeof sides?.[0] === 'string' || !sides?.length ? [sides || [], sides || []] : sides;
  const like = (t, names) => Math.max(0, ...names.map(n => zhLike(t, n)));
  const [x, y] = teams;
  // Two characters in common at least (one, 人 or 城, is any two clubs').
  const sure = (t, names) => Math.max(0, ...names.map(n => (Math.min(String(t).length, String(n).length) < 2 || zhLike(t, n) * Math.min(String(t).length, String(n).length) >= 2 ? zhLike(t, n) : 0)));
  const fit = (p, q) => (both && Math.min(p, q) < 0.5 ? 0 : p + q);
  if (both) return order === 'home' ? fit(sure(x, a), sure(y, b)) : order === 'away' ? fit(sure(x, b), sure(y, a)) : Math.max(fit(sure(x, a), sure(y, b)), fit(sure(x, b), sure(y, a)));
  return Math.max(fit(like(x, a), like(y, b)), fit(like(x, b), like(y, a)));
}
const FIT = 1;
// How ELTA names a race weekend's sessions in its titles (F1's codes).
const SESSION_WORD = { FP1: '第1節', FP2: '第2節', FP3: '第3節', Qual: '排位賽', Race: '正賽', SR: '衝刺賽', SS: '衝刺排位', SQ: '衝刺排位' };
// The programs that carry a game: its league's, starting from an hour before
// it to 20 minutes after, whose sides fit the game's best of the games then
// (a program without the sides, "【onELTA 熱身賽】", counts when it's the
// only game near that time).
// `sides`: the game's two sides in Chinese, [home's names, away's names]
// (full and short); `sidesOf`: the same for another game, to give a program
// to the game it fits best.
export function eltaPrograms(programs, e, sides, others = [], sidesOf = null) {
  if (!programs?.length || !e) return [];
  const t = Date.parse(e.start);
  // Its hour not set yet, nor placed at ELTA's slot (eltaStart's): no program near a guess.
  if (e.timeTbd && !e.timeFrom && e.kind === 'match') return [];
  const within = (before, after) => p => p.league === e.league && p.start >= t - before * 60_000 && p.start <= t + after * 60_000;
  const cand = programs.filter(within(60, 20));
  if (e.kind !== 'match') {
    // A race weekend's session: the program naming it (第1節自由練習,
    // 排位賽, 正賽, 衝刺賽), within 3 hours either side: ELTA's time can be
    // the official one's give or take an hour (Singapore 2026's first
    // practice: 17:15 against 16:30), and the names tell the sessions apart.
    const word = SESSION_WORD[e.sessionKey] || '';
    if (!word) return cand;
    return programs.filter(within(180, 180)).filter(p => p.title.includes(word) && !(word === '排位賽' && p.title.includes('衝刺')));
  }
  const near = others.filter(o => o !== e && o.id !== e.id && o.league === e.league && o.kind === 'match' && Math.abs(Date.parse(o.start) - t) < 3 * 3_600_000);
  const named = cand.flatMap(p => {
    if (p.teams.length < 2) return [];
    const fit = pairFit(p.teams, sides);
    if (fit < FIT) return [];
    const best = sidesOf ? Math.max(0, ...near.map(o => pairFit(p.teams, sidesOf(o)))) : 0;
    return best > fit ? [] : best === fit ? [{ ...p, tentative: true }] : [p];
  });
  if (named.length) return named;
  // No names: only if no other game of the league starts near it.
  const blank = cand.filter(p => !p.teams.length);
  if (!blank.length) return [];
  // Several games near it: one of them, not yet said which (ELTA names it nearer the day).
  const rivals = others.filter(o => o !== e && o.id !== e.id && o.league === e.league && Math.abs(Date.parse(o.start) - t) < 45 * 60_000);
  return rivals.length ? blank.map(p => ({ ...p, tentative: true })) : blank;
}

// A game whose hour isn't set yet (timeTbd: a play-off's next game): ELTA's
// program of it, the same two sides that day in Taiwan, gives it. ESPN can
// be a day behind ELTA in setting it. ms, or null.
const twDay = ms => new Date(ms + 8 * 3_600_000).toISOString().slice(0, 10);
// Else, ELTA's one unnamed program that day (【on ELTA 季後賽】) not near a
// game of the league whose hour is set, when this is the day's one game of
// the league still without its hour (`others`: the games known).
export function eltaStart(programs, e, sides, others = []) {
  if (!e?.timeTbd || e.kind !== 'match' || !programs?.length) return null;
  const day = twDay(Date.parse(e.start));
  const theDay = programs.filter(p => p.league === e.league && twDay(p.start) === day);
  const hits = theDay.filter(p => p.teams?.length >= 2 && pairFit(p.teams, sides, { both: true }) >= FIT);
  if (hits.length) return Math.min(...hits.map(p => p.start));
  const games = others.filter(o => o.league === e.league && o.kind === 'match' && o.status?.state !== 'post' && twDay(Date.parse(o.start)) === day);
  const timed = games.filter(o => !o.timeTbd).map(o => Date.parse(o.start));
  const untimed = new Set([e, ...games.filter(o => o.timeTbd)].map(o => o.id));
  const blank = theDay.filter(p => !p.teams?.length && !timed.some(t => Math.abs(p.start - t) <= 60 * 60_000));
  return blank.length === 1 && untimed.size === 1 ? blank[0].start : null;
}

// ---- NBA.com's Taiwan schedule: the NBA games on ELTA, the whole season -------------------
//
// NBA.com's schedule for Taiwan (region 32, what nba.com/schedule?region=32
// reads) names each game's broadcasters there, months beyond ELTA's own two
// weeks, and some days ELTA has two games. The deploy reads it
// (scripts/nba-elta.mjs) and keeps ELTA's games on this site: { games: [{ id,
// start, home, away }] }, NBA.com's team ids.
export const NBA_TW_SCHEDULE = 'https://cdn.nba.com/static/json/staticData/scheduleLeagueV2_32.json';
const onElta = g => Object.values(g.broadcasters || {}).some(list => Array.isArray(list) && list.some(b => /elta/i.test(`${b.broadcasterDisplay} ${b.broadcasterAbbreviation}`)));
// ELTA's games: [{ id, start (ms), home, away }] (team ids as numbers).
export function nbaEltaGames(data) {
  const games = Array.isArray(data?.games)
    ? data.games
    : (data?.leagueSchedule?.gameDates || []).flatMap(d => d.games || []).filter(onElta).map(g => ({ id: g.gameId, start: g.gameDateTimeUTC, home: g.homeTeam?.teamId, away: g.awayTeam?.teamId }));
  return games.map(g => ({ id: String(g.id), start: Date.parse(g.start), home: Number(g.home), away: Number(g.away) })).filter(g => Number.isFinite(g.start) && g.home && g.away);
}
// The ELTA game that is this one: the same two teams (`ids`: the game's
// NBA.com team ids, home and away), the nearest start within 12 hours.
export function nbaEltaGame(games, e, ids) {
  if (!games?.length || !ids?.home || !ids?.away) return null;
  const t = Date.parse(e.start);
  const same = games.filter(g => g.home === ids.home && g.away === ids.away && Math.abs(g.start - t) < 12 * 3_600_000);
  return same.sort((a, b) => Math.abs(a.start - t) - Math.abs(b.start - t))[0] || null;
}

// ---- Everything a game is on --------------------------------------------------------------
//
// The channels a game is on in Taiwan: ELTA's from its schedule when the
// schedule covers the day (none when ELTA doesn't carry it); an NBA game also
// from NBA.com's (ELTA, its channel not yet named), never guessed; Apple TV's
// MLS. Each one exact to the game has `exact` (a row's 📺 line shows only those).
// `programs`: parseElta's; `sides`, `others` as for eltaPrograms; `nba`:
// nbaEltaGames' and the game's NBA.com team ids ({ games, ids }).
// Whether ELTA's list can say if a game is on: its day within the list, and
// the list has the game's league that far. ELTA puts a league's games in as
// it gets to them, UEFA's nights later than the leagues' weekends (歐冠 on
// 10/21 not in yet while 英超 on 10/18 is): before that a game of it isn't
// "not on ELTA", its channel just isn't known.
export function eltaListed(programs, e) {
  const days = programs?.length ? eltaDays(programs) : null;
  if (!days || !e) return false;
  const start = Date.parse(e.start);
  const day = new Date(start + 8 * 3_600_000).toISOString().slice(0, 10);
  return day >= days.from && day <= days.to && programs.some(p => p.league === e.league && p.start >= start - 30 * 60_000);
}
const CHANNEL_TBA = { zh: '頻道待公布', en: 'channel TBA' };
const unknownSide = x => !x || /^tbd$/i.test(String(x.abbr || x.short || '').trim()) || String(x.abbr || '').includes('/') || Number(x.id) <= 0;
const playoffToCome = (e, base) => e.kind === 'match' && e.series && !base.note && e.status?.state !== 'post' && !e.status?.void && !unknownSide(e.home) && !unknownSide(e.away);
export function broadcastsFor(e, programs, { sides = [], others = [], prefer = 'en', nba = null, sidesOf = null } = {}) {
  const base = broadcastsOf(e.league);
  if (base[0]?.svc !== 'elta') return base;
  const listed = eltaListed(programs, e);
  const seen = new Set();
  const channels = listed
    ? eltaPrograms(programs, e, sides, others, sidesOf)
        .map(p => ({ ...eltaChannel(p.ch), at: p.start, title: p.title, audio: p.audio, adFree: p.adFree, exact: true, ...(p.tentative ? { note: { zh: '同時段擇一，待公布', en: 'one of the games then, TBA' } } : {}) }))
        // MOD's own channels aren't streamed: not listed.
        .filter(c => !c.mod && !seen.has(c.ch) && seen.add(c.ch))
    : [];
  // The best for the person first (their commentary, no ads).
  if (channels.length) return channels.sort((a, b) => channelRank(a, prefer) - channelRank(b, prefer) || a.ch - b.ch);
  // NBA.com's word that ELTA has the game stands in for ELTA's own only where
  // ELTA's list can't say (past its last day), or where ELTA's list has an NBA
  // game then whose names it didn't match. Within the list, nothing then is nothing.
  if (e.league === 'nba') {
    const g = nbaEltaGame(nba?.games, e, nba?.ids);
    const near = g && programs?.some(p => p.league === 'nba' && Math.abs(p.start - g.start) <= 30 * 60_000);
    return g && (!listed || near) ? [{ ...base[0], note: null, at: g.start, exact: true }] : [];
  }
  // Every session on ELTA (F1): this one too, its channel not yet named.
  if (base[0].every && e.kind !== 'match') return [{ ...base[0], exact: true }];
  // A play-off series game of a league ELTA has whole (MLB's postseason) that
  // its list doesn't name yet: the series' next games are set only as it
  // goes, and ELTA lists them a day or so later (first as 【on ELTA 季後賽】,
  // no sides). Taken as on, its channel to come; unless, its hour set, ELTA
  // names another game of the league at that hour and not this one (its pick of the two).
  if (playoffToCome(e, base[0])) {
    const t = Date.parse(e.start);
    const other = !e.timeTbd && programs?.some(p => p.league === e.league && p.teams?.length >= 2 && Math.abs(p.start - t) <= 45 * 60_000);
    const blank = !e.timeTbd && programs?.some(p => p.league === e.league && !p.teams?.length && Math.abs(p.start - t) <= 45 * 60_000);
    if (!other || blank) return [{ ...base[0], note: CHANNEL_TBA, at: null, exact: true, tba: true }];
  }
  // ELTA's list covers the day and hasn't the game: not on ELTA.
  return listed ? [] : base;
}

// ---- ELTA's replays: a finished game, again -----------------------------------------
//
// For 48 hours from its start a program can be watched again on its channel
// (回看: the channel's page, its program in the guide; ELTA's cl_replay_hr).
// Then the whole game is a video in its league's season on ELTA.tv
// (/sports/play/1/<n>, in the app eltatv://vod/sports/<n>/<episode>, ELTA's own
// appRedirect mapping), when ELTA puts it up: the next day for some leagues
// (the NBA, 歐國聯), weeks later for others (英超, 歐冠). A new season is a new
// page: the pages are found each night by their titles on ELTA.tv's sports
// index (Shared-Data's sports/elta-pages.json, `eltaPages`), so nothing here
// changes from year to year. ELTA_VOD: October 2026's, until that's read.
export const ELTA_REPLAY_HOURS = 48;
// How ELTA writes a game: football's home side first ("曼聯 VS 曼城" at Old
// Trafford), and a night's game under its evening; MLB's and the NBA's the
// visitors first ("紅襪 VS 遊騎兵" in Texas), under the day it's played in Taiwan.
const FOOTBALL = new Set(['epl', 'seriea', 'bundesliga', 'ligue1', 'scotland', 'ucl', 'uel', 'uecl', 'facup', 'nationsleague']);
const AWAY_FIRST = new Set(['mlb', 'nba']);
export const ELTA_VOD = { mlb: 2150, nba: 2385, f1: 2079, epl: 2243, seriea: 2305, bundesliga: 2300, ligue1: 2296, scotland: 2299, ucl: 2304, uel: 2303, nationsleague: 2151 };
// CPBL's by the home club (ELTA has four clubs' home games).
const ELTA_VOD_CPBL = [['統一', 2159], ['味全', 2160], ['富邦', 2161], ['台鋼', 2162]];
export const eltaVodUrl = (vod, episode = '') => `https://eltaott.tv/sports/play/1/${vod}${episode ? `/${episode}` : ''}`;
export const eltaVodApp = (vod, episode = '') => `eltatv://vod/sports/${vod}/${episode}`;
// A league's season pages by their titles on ELTA.tv ("2026 MLB 美國職棒大聯盟",
// "2026-27 NBA美國職籃", "2026 中華職棒 統一獅主場", "2026 中華職棒 季後挑戰賽");
// its highlights' and news' pages ("2026-27 英超精華") aren't these.
const ELTA_TITLES = {
  mlb: /MLB 美國職棒大聯盟$/,
  nba: /NBA美國職籃$/,
  f1: /F1一級方程式賽車$/,
  epl: /英格蘭超級足球聯賽$/,
  seriea: /義大利甲級足球聯賽$/,
  bundesliga: /德國甲級足球聯賽$/,
  ligue1: /法國甲級足球聯賽$/,
  scotland: /蘇格蘭超級足球聯賽$/,
  ucl: /歐洲冠軍足球聯賽$/,
  uel: /歐霸足球聯賽$/,
  uecl: /歐洲協會足球聯賽$/,
  // ELTA's from the third round (January: the Premier League's clubs in), on 足球VIP for 2026/27.
  facup: /足總盃$/,
  nationsleague: /歐洲國家足球聯賽$/,
  cpbl: /^中華職棒(?!.*(明星|戰術))/
};
// The leagues ELTA keeps whole games of.
export const ELTA_VOD_LEAGUES = new Set(Object.keys(ELTA_TITLES));
// ELTA.tv's sports index (its page's HTML) → [[page, title]…].
export function parseEltaIndex(html) {
  const out = new Map();
  for (const m of String(html || '').matchAll(/\/sports\/play\/1\/(\d+)"[^>]*>\s*<img[^>]*?title="([^"]+)"/g)) if (!out.has(m[1])) out.set(m[1], m[2].replace(/&amp;/g, '&').trim());
  return [...out].map(([v, title]) => [Number(v), title]);
}
// Those pages as seasons: { v, league, from, to (ms), club? }. "2026": that
// year (Taiwan's); "2026-27": July to July. CPBL's a club's home games
// ("統一獅主場": its club), else every club's (the playoffs, the warm-ups).
export function eltaPages(index) {
  const out = [];
  for (const [v, raw] of index || []) {
    const m = String(raw).match(/^(\d{4})(?:-(\d{2}))?\s*(.+)$/);
    if (!m) continue;
    const name = m[3].trim();
    const league = Object.keys(ELTA_TITLES).find(k => ELTA_TITLES[k].test(name));
    if (!league) continue;
    const y = Number(m[1]);
    const [from, to] = m[2] ? [Date.UTC(y, 6, 1), Date.UTC(y + 1, 6, 1)] : [Date.UTC(y, 0, 1), Date.UTC(y + 1, 0, 1)];
    const club = league === 'cpbl' ? name.match(/^中華職棒 (\S+?)主場$/)?.[1] || '' : '';
    out.push({ v: Number(v), league, from: from - 8 * 3_600_000, to: to - 8 * 3_600_000, ...(league === 'cpbl' ? { club } : {}) });
  }
  return out;
}
// The pages read (Shared-Data's sports/elta-pages.json, as eltaPages): the
// app's, set once read (tv.mjs).
let knownPages = null;
export const useEltaPages = index => (knownPages = index?.length ? eltaPages(index) : null);
// The season pages a game's video can be in, the likeliest first. `home`:
// the home side's names (CPBL's); `pages`: eltaPages' (null: not read yet,
// the pages known in October 2026).
export function eltaVodsOf(e, home = [], pages = knownPages) {
  if (!pages) {
    const v = e?.league === 'cpbl' ? ELTA_VOD_CPBL.find(([club]) => home.some(n => String(n).includes(club)))?.[1] : ELTA_VOD[e?.league];
    return v ? [v] : [];
  }
  const t = Date.parse(e?.start || '');
  const of = pages.filter(p => p.league === e?.league && (!Number.isFinite(t) || (t >= p.from && t < p.to)));
  if (e?.league !== 'cpbl') return of.map(p => p.v);
  // CPBL's: the home club's page, else the pages of every club's games.
  const mine = of.filter(p => p.club && home.some(n => String(n).includes(p.club.slice(0, 2))));
  return [...mine, ...of.filter(p => !p.club)].map(p => p.v);
}
// The season a game's video goes in, or null (the likeliest of eltaVodsOf).
export function eltaVodOf(e, home = [], pages = knownPages) {
  return eltaVodsOf(e, home, pages)[0] ?? null;
}
// Whether a game's channel can still play it again (回看).
export const inReplay = (e, now = Date.now()) => now - Date.parse(e.start) < ELTA_REPLAY_HOURS * 3_600_000;
// A finished game that can be watched again, as far as is known without
// reading anything: { channels, replay: true } within its ELTA channels'
// 48 hours of 回看, { video: true } once its video's been found (`found`),
// else null (not on ELTA, or not known to be up).
export function replayState(e, channels, found = false, now = Date.now()) {
  if (e?.status?.state !== 'post' || e.status.void) return null;
  const elta = (channels || []).filter(b => b.svc === 'elta' && b.ch && !b.mod);
  if (elta.length && inReplay(e, now)) return { channels: elta, replay: true };
  return found ? { video: true } : null;
}
// When a program started, as ELTA's guide lists it (Taiwan's day and time),
// short enough to stay whole on a phone's row: '10/6（二）19:30', 'Tue 10/6 19:30'.
export function guideWhen(at, en = false) {
  if (!at) return '';
  const d = new Date(Number(at));
  const tz = { timeZone: 'Asia/Taipei' };
  const md = d.toLocaleDateString('en-US', { ...tz, month: 'numeric', day: 'numeric' });
  const wd = d.toLocaleDateString(en ? 'en-US' : 'zh-TW', { ...tz, weekday: en ? 'short' : 'narrow' });
  const time = d.toLocaleTimeString('en-GB', { ...tz, hour: '2-digit', minute: '2-digit', hour12: false });
  return en ? `${wd} ${md} ${time}` : `${md}（${wd}）${time}`;
}
// An episode's title: its day ('M/D', when it says) and two sides
// ("10/5 國聯分區G2 教士VS釀酒人", "UEFA歐霸 塞爾特人 VS 佛倫茲瓦羅斯 第1比賽日(原音)").
// The day can run into the first side ("9/27勇士VS馬林魚(原音)").
function episodeParts(title) {
  const day = /^\s*(\d{1,2})\/(\d{1,2})(?!\d)/.exec(title);
  const rest = day ? title.slice(day[0].length) : title;
  const vs = /(?:^|\s)([^\s]+?)\s*VS\s*([^\s(（【]+)/i.exec(rest);
  return { day: day ? [Number(day[1]), Number(day[2])] : null, teams: vs ? [vs[1], vs[2]] : [] };
}
// A game's episode in its season's list ({ id, title }, newest first), or
// null: its two sides fitting best, on its day (Taiwan's, a day either side:
// ELTA dates the broadcast), not a 數據視角 or 精華 cut. One with no day
// counts only when it's the only one that fits.
// `prefer`: the commentary the person likes ('en': the 原音 cut of a game
// ELTA put up twice, its own Chinese one otherwise).
export function eltaEpisode(episodes, e, sides, { prefer = 'en' } = {}) {
  if (!episodes?.length || !e) return null;
  const tw = new Date(Date.parse(e.start) + 8 * 3_600_000);
  const dateless = episodes.filter(x => !episodeParts(x.title).day).length * 2 >= episodes.length;
  // Its day (Taiwan's), or the day before for a start after midnight: ELTA
  // lists a night's games under the evening they belong to (拿坡里 VS 波隆納
  // at 02:45 on 9/14 is 9/13's). Never the next day: a series plays daily.
  const football = FOOTBALL.has(e.league);
  const shifts = football && tw.getUTCHours() < 6 ? [0, -1] : [0];
  const off = ([m, d]) => shifts.map(shift => new Date(tw.getTime() + shift * 86_400_000)).findIndex(x => x.getUTCMonth() + 1 === m && x.getUTCDate() === d);
  const fits = episodes
    .filter(x => !/數據視角|精華|集錦|Highlights/i.test(x.title))
    .map(x => ({ x, ...episodeParts(x.title) }))
    .map(x => ({ ...x, off: x.day ? Math.min(off(x.day), 1) : 2 }))
    .filter(x => x.teams.length === 2 && (!x.day || off(x.day) >= 0))
    .map(x => ({ ...x, fit: pairFit(x.teams, sides, { both: true, order: football ? 'home' : AWAY_FIRST.has(e.league) ? 'away' : '' }) }))
    .filter(x => x.fit >= FIT)
    // A title with no day only in a season ELTA mostly writes so (UEFA's);
    // in a dated one (MLB's) it's a stray, never a game's.
    .filter(x => x.day || dateless)
    .sort((a, b) => a.off - b.off || b.fit - a.fit || (prefer === 'zh' ? -1 : 1) * (episodeEnglish(b.x.title) - episodeEnglish(a.x.title)));
  if (!fits.length) return null;
  // As close and as good a fit for two other sides (a title with no day, the
  // same pair met twice): not said which. The same game again (原音 and not) is fine.
  const [best] = fits;
  const pair = x => [...x.teams].sort().join('|');
  const bare = x => x.x.title.replace(/\(.*?\)|（.*?）/g, '').replace(/\s+/g, '');
  if (fits.some(x => x.off === best.off && x.fit === best.fit && pair(x) !== pair(best))) return null;
  if (!best.day && fits.some(x => x !== best && !x.day && pair(x) === pair(best) && /第\s*\d+\s*[輪場]|G\d/.test(x.x.title) && bare(x) !== bare(best))) return null;
  return best.x;
}
// A race weekend session's video ("10/4 F1 巴林站 正賽(英文解說原音無廣告)"):
// the session's name, on its day (Taiwan's, a day either side: a weekend's
// sessions are named apart, its weekends weeks apart), not the children's
// version or the drivers' parade; the commentary the person likes first.
export function eltaSessionEpisode(episodes, e, { prefer = 'en' } = {}) {
  const word = SESSION_WORD[e?.sessionKey];
  if (!episodes?.length || !word) return null;
  const at = Date.parse(e.official || e.start) + 8 * 3_600_000;
  const off = ([m, d]) => [0, -1, 1].map(shift => new Date(at + shift * 86_400_000)).findIndex(x => x.getUTCMonth() + 1 === m && x.getUTCDate() === d);
  const fits = episodes
    .filter(x => x.title.includes(word) && !(word === '排位賽' && x.title.includes('衝刺')) && !/Kids|車手遊行|D-LIVE|精華/i.test(x.title))
    .map(x => ({ x, day: episodeParts(x.title).day }))
    .filter(x => x.day && off(x.day) >= 0)
    .map(x => ({ ...x, off: Math.min(off(x.day), 1) }))
    .sort((a, b) => a.off - b.off || (prefer === 'zh' ? -1 : 1) * (episodeEnglish(b.x.title) - episodeEnglish(a.x.title)));
  return fits[0]?.x || null;
}
// Whether an episode has the original commentary: a whole game's video has
// one sound, ELTA's Chinese unless it says 原音 (a 體育台's second English
// track isn't in it: for that, its 48 hours of 回看).
export const episodeEnglish = title => /原音|英文|English/i.test(String(title || '').replace(/中文解說/g, ''));
// An episode's title for a row, from its first side on (the league and the
// day are the row's already): "克羅埃西亞 VS 英格蘭 第3輪(原音)".
export function episodeLabel(title) {
  const { day, teams } = episodeParts(title);
  const at = teams.length ? title.indexOf(teams[0]) : -1;
  if (at > 0) return title.slice(at).trim();
  // No sides (a race weekend's session): without its day, the league's name
  // and the circuit, its commentary in a word: 巴林站 正賽（原音）.
  return (day ? title.replace(/^\s*\d{1,2}\/\d{1,2}/, '') : title)
    .replace(/^\s*F1\s+/, '')
    .replace(/[(（][^)）]*賽道[)）]/g, '')
    .replace(/\s*[(（]([^)）]*)[)）]\s*$/, (m, x) => (/原音|英文/.test(x.replace(/中文解說/g, '')) ? '（原音）' : /中文/.test(x) ? '（中文）' : ''))
    .replace(/\s+/g, ' ')
    .trim();
}
