// ---- kit/sports-espn.mjs: ESPN's scoreboards as Orbit Sports' events ----
// The one parser from ESPN's scoreboard JSON to the event the cards draw
// (parseScoreboard and what it needs: status, sides, series, round, stage,
// the favourite's chance, a game's live fields). Orbit Sports imports it
// (lib/espn.mjs) and so does the proxy (sports-today.js: today's scoreboards
// built once for every phone), so the phone and the proxy parse alike. Pure:
// no page, no clock, no network.
//
//   event   { id, league, kind, name, enName, short, start, status, venue, tv,
//             home, away (kind 'match'), sessions and country (kind 'field'),
//             note, series, round, stage, fav, neutral, situation, live, usDay }
//   side    { id, name, short, abbr, logo, color, score, winner, record, lines }
//
// What the app adds on its own page stays out: the reader's language and the
// logo guessed where ESPN left one out. `parseScoreboard(data, league)` gives
// the event in ESPN's own words (language-free, what the proxy keeps);
// `{ lang: 'zh' | 'en' }` gives it as the app draws it, which is
// `localEvent(event, lang)` on the raw one. The proxy also sends it
// `slimEvent`ed (what is empty or follows from another field left out;
// `unslimEvent` puts it back exactly).
import { CATALOG } from '#kit/catalog.mjs';
import { BROADCAST } from '#kit/sports-broadcast.mjs';
import { teamLogo, raceName, countryName, countryCode, NBA_ID } from '#kit/logos.mjs';
import { teamNameZh } from '#kit/names.mjs';

// ---- The leagues (Orbit Sports' lib/leagues.mjs) -----------------------------------
// Every league of the catalogue that's on ELTA.tv or Apple TV in Taiwan, soccer
// in the order a Taiwan viewer would watch it (the owner's calls, 2026-10-15).
const SOCCER_WATCH = ['epl', 'bundesliga', 'seriea', 'ligue1', 'laliga', 'mls', 'ucl', 'uel', 'uecl', 'facup', 'scotland', 'worldcup', 'nationsleague'];
const watchRank = k => (SOCCER_WATCH.includes(k) ? SOCCER_WATCH.indexOf(k) : SOCCER_WATCH.length);
const inOrder = entries => {
  const soccer = entries.filter(([, l]) => l.sport === 'soccer').sort(([a], [b]) => watchRank(a) - watchRank(b));
  return entries.map(x => (x[1].sport === 'soccer' ? soccer.shift() : x));
};
export const LEAGUES = Object.fromEntries(
  inOrder(Object.entries(CATALOG))
    .filter(([key]) => BROADCAST[key])
    .map(([key, l]) => {
      const league = { sport: l.sport, zh: l.zh, en: l.en, play: l.bet ?? null, kind: l.kind };
      if (l.data === 'espn') league.espn = l.espn;
      if (l.data === 'asia') league.asia = l.asia;
      for (const k of ['top', 'cup', 'standings']) if (l[k]) league[k] = l[k];
      return [key, league];
    })
);

export const SITE = 'https://site.api.espn.com/apis/site/v2/sports';
export const yyyymmdd = date => date.toISOString().slice(0, 10).replaceAll('-', '');

// ---- Parsing: statuses and sides --------------------------------------------------

// Called off. A delay (rain, a late start) or a suspension isn't: the game
// is still on, only waiting (Play keeps it live too).
const VOID = /POSTPONED|CANCELED|CANCELLED|FORFEIT|ABANDONED/;
const WAITING = /DELAYED|SUSPENDED|RAIN_DELAY/;
export function parseStatus(s) {
  const type = s?.type || {};
  return {
    state: type.state || 'pre',
    detail: type.detail || type.description || '',
    short: type.shortDetail || type.detail || '',
    completed: Boolean(type.completed),
    void: VOID.test(type.name || ''),
    delayed: WAITING.test(type.name || '') || /\bdelay/i.test(type.shortDetail || type.detail || ''),
    name: type.name || '',
    clock: s?.displayClock || '',
    period: s?.period || 0
  };
}

// Over by the rules, before ESPN's copy says so (it called an NBA game
// "End of 4th" for minutes after the horn; the owner, 2026-10-14: a result
// counts the moment it's final). Only what the rules settle exactly:
// basketball's last regulation period (or an overtime) ended with the
// scores apart; MLB's middle of the 9th or later with the home side
// ahead (it doesn't bat), or the end of an inning from the 9th apart.
const REGULATION = { basketball: 4 };
export function overByRule(status, away, home, league) {
  if (!status || status.state !== 'in' || status.void) return status;
  const sport = LEAGUES[league]?.sport;
  const a = Number(away?.score);
  const h = Number(home?.score);
  if (!Number.isFinite(a) || !Number.isFinite(h) || a === h) return status;
  const n = status.period || 0;
  const ended = /END_PERIOD|END_OF_PERIOD/.test(status.name || '') || /^end of/i.test(status.short || '');
  let over = false;
  if (REGULATION[sport]) {
    // (College basketball plays two halves.)
    const regulation = sport === 'basketball' && /half/i.test(`${status.detail} ${status.short}`) ? 2 : REGULATION[sport];
    over = ended && n >= regulation;
  } else if (sport === 'baseball' && league === 'mlb') {
    const m = /^(mid|middle|end)\b\D*(\d+)/i.exec(status.short || status.detail || '');
    const inning = Number(m?.[2]) || n;
    over = Boolean(m) && inning >= 9 && (/^end/i.test(m[1]) || h > a);
  }
  return over ? { ...status, state: 'post', completed: true, detail: 'Final', short: 'Final', byRule: true } : status;
}

const logoOf = team => team?.logo || team?.logos?.[0]?.href || null;
// ESPN's F1 headshots (headshots/f1/) stopped in 2021 (a newer driver has
// none); its racing ones (headshots/rpm/) are this season's, every driver.
export const freshHeadshot = url => (typeof url === 'string' ? url.replace('/i/headshots/f1/players/', '/i/headshots/rpm/players/') : url);
function parseSide(c) {
  if (!c) return null;
  const team = c.team || {};
  const athlete = c.athlete || {};
  const who = c.team ? team : athlete;
  const record = Array.isArray(c.records) ? c.records.find(r => r.type === 'total' || r.name === 'overall')?.summary || c.records[0]?.summary : Array.isArray(c.record) ? c.record[0]?.displayValue : '';
  return {
    id: String(who.id ?? c.id ?? ''),
    athlete: !c.team && Boolean(c.athlete),
    name: who.displayName || who.fullName || who.name || '',
    short: who.shortDisplayName || who.shortName || who.displayName || '',
    abbr: who.abbreviation || (who.shortName || '').slice(0, 3).toUpperCase(),
    logo: logoOf(team) || athlete.flag?.href || freshHeadshot(athlete.headshot?.href) || null,
    color: team.color ? `#${team.color}` : null,
    alt: team.alternateColor ? `#${team.alternateColor}` : null,
    score: c.score?.displayValue ?? (typeof c.score === 'string' || typeof c.score === 'number' ? String(c.score) : ''),
    winner: Boolean(c.winner),
    record: record || '',
    lines: (c.linescores || []).map(l => l.displayValue ?? String(l.value ?? '')),
    homeAway: c.homeAway || null,
    order: c.order ?? null
  };
}

// ---- Scoreboards -------------------------------------------------------------------

// A logo where the feed left one out: ESPN's CDN by the team's (or the
// athlete's) id or abbreviation. A guess, so the picture falls back to the
// initial when it isn't there.
const CDN = 'https://a.espncdn.com/i';
const HEADSHOTS = { racing: 'rpm' };
export function fallbackLogo(league, side) {
  if (!side || side.logo) return side?.logo || null;
  // The shared kit's (Quadra Play's) logo for the club.
  const kit = teamLogo(LEAGUES[league]?.play || league, side.name);
  // A side not decided yet (ESPN's "TBD", ids -1 and -2) has no logo.
  if (kit || !/^\d+$/.test(String(side.id ?? '')) || league === 'nba') return kit;
  const [sport] = (LEAGUES[league]?.espn || '').split('/');
  if (side.athlete) return HEADSHOTS[sport] ? `${CDN}/headshots/${HEADSHOTS[sport]}/players/full/${side.id}.png` : null;
  if (sport === 'soccer') return `${CDN}/teamlogos/soccer/500/${side.id}.png`;
  return null;
}
// An NBA team's logo is always NBA.com's primary mark (the kit's): ESPN's
// files are some clubs' alternates (the Celtics' shamrock). A club from
// outside the league (a preseason guest: the London Lions) has the kit's
// own (NBA_GUESTS), else its initial.
// A guest (no NBA.com mark) is marked so: no team page, nothing to follow.
const nbaLogo = (league, side) => (league === 'nba' && side && !side.athlete ? { ...side, logo: teamLogo('nba', side.en || side.name), ...(NBA_ID[side.en || side.name] ? {} : { guest: true }) } : side);
// A team as shown: its logo (an NBA team's, above), and its name in the
// reader's language: Chinese from the kit's names (lib/names.mjs) when it has
// the team, the English kept as `en` (Play's ids and the matching use it).
// People (players, drivers) keep their names.
export function localSide(league, raw, lang = 'zh') {
  const side = nbaLogo(league, raw);
  if (!side || lang === 'en' || side.athlete) return side;
  const en = side.en || side.name;
  const zh = teamNameZh(LEAGUES[league]?.play || league, en, LEAGUES[league]?.sport);
  if (zh) return { ...side, en, name: zh.full, short: zh.short };
  // A national side (England, Czechia): its country's name.
  const nation = countryName(en, lang);
  return nation && nation !== en ? { ...side, en, name: nation, short: nation } : side;
}
export const withLogo = (league, side, lang = 'zh') => localSide(league, side && !side.logo ? { ...side, logo: fallbackLogo(league, side) } : side, lang);

// A playoff series: its summary ("LAL lead series 2-1") and each side's wins.
export function parseSeries(s) {
  if (!s || s.type !== 'playoff') return null;
  return { summary: s.summary || '', completed: Boolean(s.completed), games: s.totalCompetitions || 0, wins: Object.fromEntries((s.competitors || []).map(c => [String(c.id), c.wins ?? 0])) };
}

// A playoff or knockout game's round, for the bracket: `key` the round
// (ESPN's RD16 / QTR / SEMI / FINAL for the US leagues' playoffs, PLAYIN
// and PLAYIN2 for the NBA's play-in (its own season type, 5), the
// season's stage for a cup: round-of-16, quarterfinals…), its name, the leg
// and the sides the tie's over for (a cup's second leg says who went
// through). Null for any other game (a cup's league phase or groups too).
export function knockoutRound(e, comp, league) {
  const slug = String(e?.season?.slug || '');
  const note = comp?.notes?.[0]?.headline || '';
  const cup = Boolean(LEAGUES[league]?.cup);
  // The play-in's two steps: 7 v 8 and 9 v 10, then the 8th seed game.
  if (/play-?in/i.test(`${slug} ${note}`)) return cup ? null : { key: /8th seed/i.test(note) ? 'PLAYIN2' : 'PLAYIN', title: note || 'Play-In', leg: 0, through: [] };
  const post = e?.season?.type === 3 || /post-?season/i.test(slug);
  if (!post && !(cup && slug && !/league-phase|group|regular|qualif|preliminary/i.test(slug))) return null;
  const key = cup ? slug : comp?.type?.abbreviation || slug;
  if (!key) return null;
  const title = comp?.series?.title || (cup ? slug.replace(/-/g, ' ') : note.replace(/\s*-\s*(Game|Leg)\b.*$/i, '')) || key;
  return { key, title, leg: Number(comp?.leg?.value) || 0, through: (comp?.series?.competitors || []).filter(c => c.winner).map(c => String(c.id)) };
}
// A game's start, and whether its time is set: a play-off's next game is
// dated before its hour is (ESPN's timeValid false, the day's 00:00 in New
// York, 12:00 in Taiwan). An American game of that day is played in
// Taiwan's next morning: placed there (20:00 New York, 08:00 here, the usual
// hour) with its time shown as 待定 until ESPN or ELTA's list sets it.
const ET_MIDNIGHT = /T0[45]:00(:00)?(\.000)?Z$/;
// The favourite's chance from the bookmaker's prices ESPN shows before a
// game (0..1, null without them): how open it is, for the picks (the owner,
// 2026-10-16: Man City v Ipswich, City -425, picked over Brentford v
// Liverpool, Brentford +140). Both sides' moneylines when given (the draw's
// too), each side's chance their share; else soccer's line, the favourite's
// own price ("MNC -425").
const implied = ml => {
  const m = Number(String(ml ?? '').replace(/^EVEN$/i, '+100'));
  if (!Number.isFinite(m) || Math.abs(m) < 100) return null;
  return m < 0 ? -m / (-m + 100) : 100 / (m + 100);
};
export function favChance(comp) {
  const o = comp?.odds?.[0];
  if (!o) return null;
  const price = x => implied(x?.close?.odds ?? x?.open?.odds ?? x?.odds);
  const [h, a] = [price(o.moneyline?.home) ?? implied(o.homeTeamOdds?.moneyLine), price(o.moneyline?.away) ?? implied(o.awayTeamOdds?.moneyLine)];
  if (h != null && a != null) {
    const d = implied(o.drawOdds?.moneyLine) ?? 0;
    return Math.round((Math.max(h, a) / (h + a + d)) * 1000) / 1000;
  }
  const line = /\s([+-]\d{3,}|EVEN)$/i.exec(String(o.details || ''));
  const f = line ? implied(line[1]) : null;
  return f == null ? null : Math.round(f * 1000) / 1000;
}
export function startOf(date, comp) {
  if (comp?.timeValid !== false || !date) return { start: date };
  return { start: ET_MIDNIGHT.test(date) ? new Date(Date.parse(date) + 20 * 3_600_000).toISOString() : date, timeTbd: true };
}

// ---- A game on now (Orbit Sports' lib/live.mjs liveOf) ----------------------------

const name = a => a?.athlete?.shortName || a?.athlete?.displayName || a?.shortName || a?.displayName || '';

const who = a => {
  const x = a?.athlete || a;
  const id = String(x?.id ?? a?.playerId ?? '');
  if (!id && !x?.displayName) return null;
  const shot = typeof x?.headshot === 'string' ? x.headshot : x?.headshot?.href || '';
  return { id, name: x?.fullName || x?.displayName || '', ...(shot ? { headshot: shot } : {}) };
};

// comp: ESPN's competition; status: its status; sport: Orbit Sports' sport key.
export function liveOf(comp, status, sport) {
  const s = comp?.situation || {};
  const live = { lastPlay: s.lastPlay?.text || '' };
  if (sport === 'baseball' && (s.balls != null || s.outs != null)) {
    Object.assign(live, {
      balls: s.balls ?? 0,
      strikes: s.strikes ?? 0,
      outs: s.outs ?? 0,
      bases: [Boolean(s.onFirst), Boolean(s.onSecond), Boolean(s.onThird)],
      batter: name(s.batter),
      pitcher: name(s.pitcher),
      // Who they are, for their pictures: { id, name, headshot }.
      batterWho: who(s.batter),
      pitcherWho: who(s.pitcher)
    });
  }
  if (sport === 'soccer') {
    live.events = (comp?.details || [])
      .filter(d => d.scoringPlay || d.redCard)
      .map(d => ({ kind: d.redCard ? 'red' : d.ownGoal ? 'own' : d.penaltyKick ? 'pen' : 'goal', minute: d.clock?.displayValue || '', team: String(d.team?.id ?? ''), who: d.athletesInvolved?.[0]?.shortName || d.athletesInvolved?.[0]?.displayName || '', person: who(d.athletesInvolved?.[0]) }));
  }
  // Basketball: each side's points leader as it stands (the scoreboard's own), for the card.
  if (sport === 'basketball') {
    const lead = c => {
      const l = (c?.leaders || []).find(x => x.name === 'points')?.leaders?.[0];
      const p = l && who(l.athlete);
      return p ? { ...p, short: l.athlete?.shortName || p.name, value: l.displayValue || '' } : null;
    };
    const side = h => lead((comp?.competitors || []).find(c => c.homeAway === h));
    live.scorers = { away: side('away'), home: side('home') };
  }
  const prefix = /^(top|bot|bottom|mid|middle|end)\b/i.exec(status?.type?.shortDetail || status?.type?.detail || '')?.[1]?.toLowerCase() || '';
  live.half = prefix.startsWith('top') ? 'top' : prefix.startsWith('bot') ? 'bot' : prefix.startsWith('mid') ? 'mid' : prefix === 'end' ? 'end' : '';
  return live;
}

// ---- Stage and round (Orbit Sports' lib/stage.mjs) --------------------------------
// special: true when it isn't an ordinary regular-season game (worth a tag).

const STAGES = {
  pre: { zh: '季前賽', en: 'Preseason' },
  regular: { zh: '例行賽', en: 'Regular season' },
  cup: { zh: '盃賽', en: 'Cup' },
  allstar: { zh: '明星賽', en: 'All-Star' },
  playin: { zh: '附加賽', en: 'Play-In' },
  post: { zh: '季後賽', en: 'Playoffs' },
  final: { zh: '總冠軍賽', en: 'Finals' },
  off: { zh: '休賽季', en: 'Off-season' }
};

// Round names, English as ESPN writes them -> Chinese.
const ROUNDS = [
  [/world series/i, '世界大賽'],
  [/\bnba finals?\b/i, '總冠軍賽'],
  [/\b[an]lcs\b|league championship/i, '聯盟冠軍賽'],
  [/\b[an]lds\b|division series/i, '分區系列賽'],
  [/\b[an]lwc\b|wild ?card/i, '外卡賽'],
  [/conf(erence)?\.? finals|east finals|west finals|eastern finals|western finals/i, '分區冠軍賽'],
  [/conf(erence)?\.? semi|east semifinals|west semifinals|2nd round|second round/i, '分區準決賽'],
  [/1st round|first round/i, '首輪'],
  [/divisional/i, '分區賽'],
  [/play-?in/i, '附加賽'],
  [/quarter-?finals?/i, '八強'],
  [/semi-?finals?/i, '準決賽'],
  [/round of 16/i, '16 強'],
  [/round of 32/i, '32 強'],
  [/knockout round play-?offs?/i, '淘汰附加賽'],
  [/group stage|league phase|group [a-z]\b/i, '小組賽'],
  [/\bfinal\b/i, '決賽'],
  [/all-?star/i, '明星賽'],
  [/nba cup|in-season tournament|emirates cup/i, 'NBA 盃'],
  [/friendly|exhibition/i, '友誼賽']
];

export function roundName(text, lang = 'zh') {
  const s = String(text || '').trim();
  if (!s) return '';
  if (lang === 'en') return s;
  const game = /game (\d+)/i.exec(s)?.[1];
  const maybe = /if necessary/i.test(s);
  const hit = ROUNDS.find(([re]) => re.test(s));
  if (!hit) return s;
  // "NLDS - Game 3": the league (AL/NL, East/West) and the game.
  const side = /\bAL|American/.test(s) ? '美聯' : /\bNL|National/.test(s) ? '國聯' : /\bEast/i.test(s) ? '東區' : /\bWest/i.test(s) ? '西區' : '';
  return `${side}${hit[1]}${game ? ` G${game}` : ''}${maybe ? '（如需）' : ''}`;
}

export function stageFrom({ seasonType, seasonSlug = '', typeAbbr = '', note = '', name = '', cup = false } = {}) {
  const text = `${note} ${name}`;
  let key = '';
  if (/ALLSTAR/i.test(typeAbbr) || /all-?star/i.test(text)) key = 'allstar';
  else if (/play-?in/i.test(text)) key = 'playin';
  else if (seasonType === 1 || /preseason/i.test(seasonSlug)) key = 'pre';
  else if (seasonType === 3 || /post-?season/i.test(seasonSlug)) key = /world series|n?ba finals|stanley cup final|super bowl|^finals?\b/i.test(note) ? 'final' : 'post';
  else if (seasonType === 4 || /off-?season/i.test(seasonSlug)) key = 'off';
  else if (/nba cup|in-season tournament/i.test(text)) key = 'cup';
  else if (seasonType === 2 || /regular/i.test(seasonSlug)) key = 'regular';
  const round = note && key !== 'regular' ? { zh: roundName(note, 'zh'), en: note } : cup && note ? { zh: roundName(note, 'zh'), en: note } : null;
  return { key, ...(STAGES[key] || { zh: '', en: '' }), round, special: Boolean(key && key !== 'regular') || Boolean(round) };
}

// The ESPN day page a game is on: ESPN dates its pages by the US Eastern
// day (a 22:30 ET kick-off on 2:30Z the next day is on the day before's).
// Each game read carries it (usDay), so a live refresh reads only the
// pages with a game on, never the whole stretch again.
const US_DAY = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' });
export function usDayOf(start) {
  const t = Date.parse(start);
  if (!Number.isFinite(t)) return '';
  const p = Object.fromEntries(US_DAY.formatToParts(new Date(t)).map(x => [x.type, x.value]));
  return `${p.year}${p.month}${p.day}`;
}

// ---- A scoreboard's events ------------------------------------------------------------
// ESPN's own words: a side's name and logo as the feed has them, a race by its
// sponsor's name. `lang` ('zh' | 'en') gives them as the app draws them (localEvent).
export function parseScoreboard(data, league, { lang = null } = {}) {
  const kind = LEAGUES[league]?.kind || 'match';
  const out = [];
  for (const e of data?.events || []) {
    const comp = e.competitions?.[0];
    const base = {
      id: String(e.id),
      league,
      kind,
      name: e.name || '',
      enName: e.name || '',
      short: e.shortName || '',
      ...startOf(e.date, comp),
      end: e.endDate || null,
      status: parseStatus(e.status || comp?.status),
      venue: comp?.venue?.fullName || e.venue?.fullName || e.circuit?.fullName || '',
      tv: [...new Set((comp?.broadcasts || []).flatMap(b => b.names || []))].join(' · '),
      note: comp?.notes?.[0]?.headline || '',
      series: parseSeries(comp?.series),
      round: knockoutRound(e, comp, league),
      stage: stageFrom({ seasonType: e.season?.type, seasonSlug: e.season?.slug, typeAbbr: comp?.type?.abbreviation, note: comp?.notes?.[0]?.headline || '', name: e.name, cup: LEAGUES[league]?.cup })
    };
    if (kind === 'match' && comp) {
      const home = parseSide(comp.competitors?.find(c => c.homeAway === 'home') || comp.competitors?.[0]);
      const away = parseSide(comp.competitors?.find(c => c.homeAway === 'away') || comp.competitors?.[1]);
      if (!home || !away) continue;
      base.status = overByRule(base.status, away, home, league);
      out.push({ ...base, home, away, fav: favChance(comp), neutral: Boolean(comp.neutralSite), situation: comp.situation?.lastPlay?.text || '', live: base.status.state === 'in' ? liveOf(comp, e.status || comp.status, LEAGUES[league]?.sport) : null });
    } else if (kind === 'field') {
      // A race weekend: its sessions, each one's field in finishing order.
      const sessions = (e.competitions || []).map(m => ({
        id: String(m.id),
        name: m.type?.text || m.type?.abbreviation || '',
        abbr: m.type?.abbreviation || '',
        start: m.date,
        status: parseStatus(m.status),
        field: [...(m.competitors || [])].sort((a, b) => (a.order ?? 999) - (b.order ?? 999)).map(c => parseSide(c))
      }));
      // Where it's raced: the circuit's country ('SG'), for its flag.
      out.push({ ...base, sessions, country: countryCode(e.circuit?.address?.country) });
    }
  }
  return lang ? out.map(e => localEvent(e, lang)) : out;
}

// An event as the reader sees it: a side's logo (guessed where the feed left
// none) and its name in the reader's language; a race by its short name.
export function localEvent(e, lang = 'zh') {
  if (e?.kind === 'match') return { ...e, home: withLogo(e.league, e.home, lang), away: withLogo(e.league, e.away, lang) };
  if (e?.kind !== 'field') return e;
  return { ...e, name: e.league === 'f1' ? raceName(e.enName, lang) : e.name, sessions: (e.sessions || []).map(x => ({ ...x, field: x.field.map(side => withLogo(e.league, side, lang)) })) };
}

// A league's scoreboard address: the page of an ESPN (US Eastern) day, or its
// current one.
export const scoreboardUrl = (league, date) => `${SITE}/${LEAGUES[league].espn}/scoreboard${date ? `?dates=${date}&limit=200` : ''}`;

// A league's events from the pages read of its scoreboard (Orbit Sports'
// scoreboard(), until each game is checked against the others): `dates` the
// pages asked for ([] the current one), `pages` what each answered (null: not
// read). Each game carries its ESPN day (usDay); a game on two pages is kept
// once. Null when no page was read (a failure, never "no games"); the pages
// not read are `unread` on the list (a day missing a page's games is not the
// whole day).
export function eventsOfPages(league, dates, pages, lang = null) {
  if (!pages.some(Boolean)) return null;
  const list = [].concat(dates || []);
  const unread = list.filter((d, i) => !pages[i]).map(String);
  const parsed = pages.map((p, i) => (p ? parseScoreboard(p, league, { lang }).map(e => ({ ...e, usDay: /^\d{8}$/.test(String(list[i] ?? '')) ? String(list[i]) : usDayOf(e.start) })) : []));
  const seen = new Set();
  const events = parsed.flat().filter(e => !seen.has(e.id) && seen.add(e.id));
  return unread.length ? Object.assign(events, { unread }) : events;
}

// The ESPN days a Taiwan day's games are on (Orbit Sports' espnDaysOf for a
// clock in Taiwan): ESPN dates by the US Eastern day, so Taiwan's 00:00 to
// 24:00 is two of them, the day before and the day itself.
export function espnDaysOf(day) {
  const start = Date.parse(`${day}T00:00:00+08:00`);
  return [...new Set([yyyymmdd(new Date(start - 11 * 3_600_000)), yyyymmdd(new Date(start + 12 * 3_600_000)), yyyymmdd(new Date(start + 23 * 3_600_000))])];
}

// ---- Slim and back --------------------------------------------------------------------
// What the proxy sends (sports-today.js): an event without what is empty or
// follows from another field (a side's `short` when it is its name, the
// stage's words and `special`, `enName` when it is the name, a status's
// `short` when it is its `detail`). `unslimEvent(slimEvent(e))` is `e`, field
// for field (the tests hold it to that); an event that isn't the parser's
// shape is sent as it is.
const EVENT_DEFAULTS = { end: null, venue: '', tv: '', note: '', series: null, round: null };
const MATCH_DEFAULTS = { fav: null, neutral: false, situation: '', live: null };
const defaultsOf = e => (e.kind === 'match' ? { ...EVENT_DEFAULTS, ...MATCH_DEFAULTS } : EVENT_DEFAULTS);
const STATUS_DEFAULTS = { detail: '', completed: false, void: false, delayed: false, name: '', clock: '', period: 0 };
const SIDE_DEFAULTS = { athlete: false, logo: null, color: null, alt: null, score: '', winner: false, record: '', lines: [], homeAway: null, order: null };
const same = (a, b) => (Array.isArray(a) ? Array.isArray(b) && a.length === b.length && a.every((x, i) => x === b[i]) : a === b);
const without = (o, defaults, derived = {}) => {
  const out = {};
  for (const [k, v] of Object.entries(o)) if (!(k in defaults && same(v, defaults[k])) && !(k in derived && derived[k] === v)) out[k] = v;
  return out;
};
const withDefaults = (o, defaults, derived = {}) => {
  const out = { ...Object.fromEntries(Object.entries(defaults).map(([k, v]) => [k, Array.isArray(v) ? [] : v])), ...derived };
  return Object.assign(out, o);
};
const slimStatus = s => (s && typeof s === 'object' ? without(s, STATUS_DEFAULTS, { short: s.detail }) : s);
const unslimStatus = s => (s && typeof s === 'object' ? withDefaults(s, STATUS_DEFAULTS, { short: s.detail ?? '' }) : s);
const slimSide = s => (s && typeof s === 'object' ? without(s, SIDE_DEFAULTS, { short: s.name }) : s);
const unslimSide = s => (s && typeof s === 'object' ? withDefaults(s, SIDE_DEFAULTS, { short: s.name ?? '' }) : s);
const stageDerived = (key, round) => ({ key, ...(STAGES[key] || { zh: '', en: '' }), round: round ?? null, special: Boolean(key && key !== 'regular') || Boolean(round) });
const slimStage = s => {
  const whole = s && typeof s === 'object' && typeof s.key === 'string' && JSON.stringify(Object.keys(s)) === '["key","zh","en","round","special"]';
  return whole && JSON.stringify(stageDerived(s.key, s.round)) === JSON.stringify(s) ? { key: s.key, ...(s.round ? { round: s.round } : {}) } : s;
};
const unslimStage = s => (s && typeof s === 'object' && !('zh' in s) && typeof s.key === 'string' ? stageDerived(s.key, s.round) : s);

export function slimEvent(e) {
  if (!e || typeof e !== 'object') return e;
  const out = without(e, defaultsOf(e), { enName: e.name });
  out.status = slimStatus(e.status);
  if (e.stage) out.stage = slimStage(e.stage);
  if (e.home) out.home = slimSide(e.home);
  if (e.away) out.away = slimSide(e.away);
  if (e.sessions) out.sessions = e.sessions.map(x => ({ ...x, status: slimStatus(x.status), field: (x.field || []).map(slimSide) }));
  return out;
}
export function unslimEvent(e) {
  if (!e || typeof e !== 'object') return e;
  const out = withDefaults(e, defaultsOf(e), { enName: e.name ?? '' });
  out.status = unslimStatus(e.status);
  if (e.stage) out.stage = unslimStage(e.stage);
  if (e.home) out.home = unslimSide(e.home);
  if (e.away) out.away = unslimSide(e.away);
  if (e.sessions) out.sessions = e.sessions.map(x => ({ ...x, status: unslimStatus(x.status), field: (x.field || []).map(unslimSide) }));
  return out;
}
