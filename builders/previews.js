// 賽前看點 (Orbit Sports, Jay 11-11: "most games have none, and what there
// is only says the table"): for each game of today and tomorrow (Taiwan's),
// up to two points worth knowing before it starts, made once by the AI from
// a lean digest code builds from ESPN's own summary of the game. Only what
// the game's page doesn't already show at a glance (the records, the places,
// the last five, the win chance, each side's leaders and the meetings are
// all on it): the line before (AP's preview: who did what last time out),
// who's out of each side, rest (a second night in a row, a cup game three
// days before), a run longer than the five shown, a side's home or road
// record when it stands out, and in football what a win would do in the
// table. Every number the points write must be one of the digest's.
//
// → sports/previews/<YYYY-MM-DD>.json (Taiwan's day the game starts):
//   { v: 1, built, games: { '<league>:<id>': { points: [{ k, zh, en }], who } | null }, at: { key: ms } }
import { aiOnce } from '../ai.js';
import { buildDay } from '../sports-today.js';
import { LEAGUES, SITE, unslimEvent, localEvent } from '../kit/sports-espn.mjs';
import { twDay } from '../kit/format.mjs';

export const previewPath = day => `sports/previews/${day}.json`;
const SPORTS = new Set(['basketball', 'baseball', 'soccer']);
const HOUR = 3_600_000;
const cut = (s, n) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, n);
const tok = id => `{t:${id}}`;
const ord = n => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th'}`;

// AP's preview (ESPN's `article`, NBA's and the NHL's): its paragraphs that
// say something about this game, last season's totals left out (early in a
// season they're all it has, and say nothing about tonight).
export function apPreview(article) {
  if (!article?.story) return [];
  const paras = String(article.story)
    .split(/<\/?p[^>]*>|\n\s*\n/)
    .map(p => p.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  const keep = [];
  for (const p of paras) {
    if (/Associated Press created|^-+$|Data Skrive|Sportradar/i.test(p)) continue;
    // (The line that opens it, who v who and where: the card says both.)
    if (/^[^.]+\(\d+-\d+(-\d+)?[^)]*\) vs\. /.test(p) || /^[A-Z][\w .']+; \w+day, /.test(p)) continue;
    if (/last season|\b20\d\d-\d\d season|finished \d+-\d+ overall/i.test(p)) continue;
    // (Injuries are told from ESPN's own list, with when each is due back.)
    if (/^INJURIES:/i.test(p) || /^[A-Z][\w .'-]+: [^.]*\b(out|day to day)\b \(/i.test(p)) continue;
    keep.push(cut(p.replace(/^BOTTOM LINE:\s*/i, ''), 360));
  }
  return keep.slice(0, 4);
}

// The players the AI may name, each by a token the app draws as the player
// (face and name): those in the game's leaders, its injury list and, in
// football, its squads.
export function peopleOf(summary) {
  const who = {};
  const add = (a, team) => {
    if (a?.id && a.displayName && !who[a.id]) who[a.id] = { name: a.displayName, short: a.shortName || a.displayName, team: String(team || '') };
  };
  for (const side of summary?.leaders || []) for (const cat of side.leaders || []) for (const l of cat.leaders || []) add(l.athlete, side.team?.id);
  for (const side of summary?.injuries || []) for (const i of side.injuries || []) add(i.athlete, side.team?.id);
  for (const side of summary?.rosters || []) for (const r of side.roster || []) add(r.athlete, side.team?.id);
  return who;
}
// Known players' names in a text, as their tokens (longest names first: "Jaden Ivey" before "Ivey").
export function tokenize(text, who) {
  let out = String(text || '');
  const names = Object.entries(who)
    .map(([id, p]) => [id, p.name])
    .filter(([, n]) => n && n.length >= 5)
    .sort((a, b) => b[1].length - a[1].length);
  for (const [id, n] of names) out = out.split(n).join(`{p:${id}}`);
  return out;
}

const hoursBetween = (a, b) => (Date.parse(b) - Date.parse(a)) / HOUR;
// Each side's last game before this one (any competition) and how long before.
function restOf(summary, sideId, start) {
  const t = (summary?.lastFiveGames || []).find(x => String(x.team?.id) === String(sideId));
  const past = (t?.events || []).filter(x => x.gameDate && Date.parse(x.gameDate) < Date.parse(start)).sort((a, b) => Date.parse(b.gameDate) - Date.parse(a.gameDate));
  return past.length ? { last: past[0], hours: hoursBetween(past[0].gameDate, start), games: past } : null;
}

// A side's record of a kind (header's: 'home', 'road', 'total').
const recordOf = (c, type) => c?.record?.find?.(r => r.type === type)?.summary || '';
const wl = s => {
  const n = String(s || '').split('-').map(Number);
  return n.length >= 2 && n.every(Number.isFinite) ? { w: n[0], l: n[1], d: n[2] || 0 } : null;
};

// Football's table, from the summary's own: each side's place, points, and
// what a win would make it (the place it would climb to, passing whom).
export function tableStakes(summary, comp) {
  const entries = (summary?.standings?.groups || []).flatMap(g => g.standings?.entries || []);
  if (entries.length < 6) return [];
  const stat = (x, n) => Number(x.stats?.find(s => s.name === n)?.value);
  const rows = entries.map(x => ({ id: String(x.id), pts: stat(x, 'points'), gd: stat(x, 'pointDifferential'), rank: stat(x, 'rank') })).filter(x => Number.isFinite(x.pts) && Number.isFinite(x.rank));
  const out = [];
  const sides = (comp?.competitors || []).map(c => ({ id: String(c.id || c.team?.id), home: c.homeAway === 'home' }));
  const of = id => rows.find(r => r.id === id);
  const [a, b] = sides.map(s => of(s.id));
  if (!a || !b) return [];
  out.push(`Table (${rows.length} teams): ${tok(a.id)} ${ord(a.rank)}, ${a.pts} pts; ${tok(b.id)} ${ord(b.rank)}, ${b.pts} pts`);
  for (const [us, them] of [[a, b], [b, a]]) {
    // (A win: three points more, the other side none.)
    const after = rows.map(r => (r.id === us.id ? { ...r, pts: r.pts + 3 } : r));
    const above = after.filter(r => r.id !== us.id && (r.pts > us.pts + 3 || (r.pts === us.pts + 3 && r.gd > us.gd)));
    const rank = above.length + 1;
    if (rank < us.rank) {
      const passed = rows.filter(r => r.rank < us.rank && r.rank >= rank && r.id !== us.id).length;
      out.push(`If ${tok(us.id)} win: up to ${ord(rank)}${rank === 1 ? ' (top of the table)' : ''}, from ${ord(us.rank)}${passed && them.rank < us.rank && them.rank >= rank ? `, passing ${tok(them.id)}` : ''}`);
    }
  }
  // The top and the bottom three, by points: how far each side is from them.
  const top = rows.find(r => r.rank === 1);
  // (The bottom three only where three go down: the Premier League, Serie A, LaLiga.)
  const drops = LEAGUES_DROP.has(summary?.header?.league?.slug || '');
  const safe = rows.find(r => r.rank === rows.length - 3);
  const drop = rows.find(r => r.rank === rows.length - 2);
  for (const s of [a, b]) {
    if (top && s.rank > 1 && s.rank <= 4 && top.pts - s.pts <= 6) out.push(`${tok(s.id)} ${top.pts - s.pts} pts behind the leader`);
    if (!drops || !safe || !drop) continue;
    if (s.rank > rows.length - 3) out.push(`${tok(s.id)} in the bottom three (relegation), ${safe.pts - s.pts} pts behind ${ord(rows.length - 3)}`);
    else if (s.rank >= rows.length - 6 && s.pts - drop.pts <= 3) out.push(`${tok(s.id)} ${s.pts - drop.pts} pts above the bottom three (relegation)`);
  }
  return out;
}
const LEAGUES_DROP = new Set(['eng.1', 'ita.1', 'esp.1']);

// The game's digest, lean (≈ 300–1,200 characters), or null when there's
// nothing beyond what the page shows. Teams and players as tokens.
export function previewFacts(summary, e) {
  const comp = summary?.header?.competitions?.[0];
  if (!comp) return null;
  const sport = LEAGUES[e.league]?.sport || '';
  const who = peopleOf(summary);
  const cs = comp.competitors || [];
  const lines = [];
  // (Facts worth a point: anything but the teams' line itself.)
  const worth = [];
  const name = c => c.team?.displayName || '';
  lines.push(`${LEAGUES[e.league]?.en || e.league} (${sport})${e.note ? `, ${cut(e.note, 60)}` : ''}`);
  lines.push(`Teams: ${cs.map(c => `${tok(c.id || c.team?.id)} = ${c.homeAway} (${name(c)})`).join('; ')}`);
  if (comp.neutralSite) lines.push('Neutral ground');

  // AP's preview, players as tokens.
  const ap = apPreview(summary.article).map(p => tokenize(p, who));
  if (ap.length) worth.push('Preview (AP):', ...ap);

  // Who's out: ESPN's list, with when each is due back (a day already gone or the game's own: no date; Jay 11-11 saw 'back 11/11' for an 11/12 game).
  for (const side of summary?.injuries || []) {
    const out = (side.injuries || [])
      .filter(i => i.athlete?.id && /out|doubtful/i.test(i.status || ''))
      .slice(0, 5)
      .map(i => `{p:${i.athlete.id}} ${i.status}${i.details?.type ? ` (${cut(i.details.type, 20)})` : ''}${i.details?.returnDate && Date.parse(i.details.returnDate) > Date.parse(e.start) + 86_400_000 ? `, due back ${i.details.returnDate}` : ''}`);
    if (out.length) worth.push(`Out for ${tok(side.team?.id)}: ${out.join('; ')}`);
  }
  // A star's season (leaders: season averages before the game), for the AI to judge who matters.
  const lead = [];
  for (const side of summary?.leaders || [])
    for (const cat of side.leaders || []) {
      const l = cat.leaders?.[0];
      if (l?.athlete?.id && /points|goals/i.test(cat.name || '') && /^[\d.]+$/.test(String(l.displayValue || '').trim())) lead.push(`{p:${l.athlete.id}} ${cut(l.displayValue, 20)} ${cut(cat.displayName || cat.name, 24)} (${tok(side.team?.id)})`);
    }
  if (lead.length) lines.push(`Leaders (already shown on the card): ${lead.join('; ')}`);

  // Rest: a second night in a row; a game in another competition just before.
  const rests = cs.map(c => ({ c, r: restOf(summary, c.id || c.team?.id, e.start) }));
  for (const { c, r } of rests) {
    if (!r) continue;
    const days = Math.round(r.hours / 24);
    const own = summary?.header?.league?.abbreviation || '';
    const other = r.last.leagueAbbreviation && own && r.last.leagueAbbreviation !== own ? r.last.leagueAbbreviation : '';
    if (sport === 'basketball' && r.hours < 30) worth.push(`${tok(c.id || c.team?.id)} played the night before (second game in two nights), ${r.last.gameResult === 'W' ? 'won' : 'lost'} ${r.last.score} ${r.last.atVs === '@' ? 'at' : 'v'} ${cut(r.last.opponent?.displayName, 30)}`);
    else if (sport === 'soccer' && days <= 4) worth.push(`${tok(c.id || c.team?.id)} played ${days} days before${other ? ` in the ${other}` : ''}: ${r.last.gameResult === 'W' ? 'won' : r.last.gameResult === 'L' ? 'lost' : 'drew'} ${r.last.score} ${r.last.atVs === '@' ? 'at' : 'v'} ${cut(r.last.opponent?.displayName, 30)}`);
    else if (days >= 3) lines.push(`${tok(c.id || c.team?.id)} rested ${days} days since its last game`);
  }
  // Football's last games with whom (the card's pills show only W/D/L): the
  // other competitions too, each with its score.
  if (sport === 'soccer')
    for (const { c, r } of rests) {
      if (!r?.games?.length) continue;
      lines.push(`${tok(c.id || c.team?.id)} last games, newest first (score home side first): ${r.games
        .slice(0, 5)
        .map(g => `${g.gameResult} ${g.score} ${g.atVs === '@' ? 'at' : 'v'} ${cut(g.opponent?.abbreviation || g.opponent?.displayName, 20)} (${cut(g.leagueAbbreviation, 24)})`)
        .join(', ')}`);
    }

  // A side's home or road record when it stands out (unbeaten, or winless, over 4 or more).
  for (const c of cs) {
    const type = c.homeAway === 'home' ? 'home' : 'road';
    const r = wl(recordOf(c, type));
    if (r && r.w + r.l + r.d >= 4 && (r.l === 0 || r.w === 0)) worth.push(`${tok(c.id || c.team?.id)} ${recordOf(c, type)} ${type === 'home' ? 'at home' : 'on the road'} this season`);
  }
  // A run longer than the five the card shows; the last ten when lopsided.
  for (const t of summary?.boxscore?.teams || []) {
    const st = Object.fromEntries((t.statistics || []).map(s => [s.name, s.displayValue]));
    const m = /^([WL])(\d+)$/.exec(st.streak || '');
    if (m && +m[2] >= 6) worth.push(`${tok(t.team?.id)} ${m[1] === 'W' ? 'won' : 'lost'} ${m[2]} straight`);
    const ten = wl(st['Last Ten Games']);
    if (ten && ten.w + ten.l === 10 && (ten.w >= 9 || ten.l >= 9)) worth.push(`${tok(t.team?.id)} ${st['Last Ten Games']} in the last ten`);
  }
  // The meetings past this season's (football's head-to-head: the card shows the last five's results; only a long series' summary).
  if (sport === 'soccer') {
    const st = tableStakes(summary, comp);
    if (st.length > 1) worth.push(...st);
    else lines.push(...st);
  }
  // The series, in a play-off.
  if (comp.series?.summary) worth.push(`Series: ${cut(comp.series.summary, 60)}`);

  if (!worth.length) return null;
  const all = [...lines, ...worth].join('\n');
  const named = Object.entries(who).filter(([id]) => all.includes(`{p:${id}}`));
  const text = [...lines, ...worth, ...(named.length ? [`Players: ${named.map(([id, p]) => `{p:${id}} = ${p.name} (${tok(p.team)})`).join('; ')}`] : [])].join('\n');
  return { facts: text.slice(0, 2600), people: Object.fromEntries(named.map(([id, p]) => [id, { short: p.short, team: p.team }])) };
}

// The games of today and tomorrow (Taiwan's) not yet begun, each once; once
// more in its last 6 hours when made a day or more before (who's out changes).
// NBA's waits for AP's preview (a day or so before) unless it's 6 hours off.
export async function runPreviews({ store, env, ctx, proxy, cap, now = Date.now(), until = now + 4 * 60_000, most = 30 }) {
  const out = { made: 0, calls: 0, days: {} };
  for (const day of [twDay(now), twDay(now + 86_400_000)]) {
    if (Date.now() >= until) break;
    let doc = (await store.json(previewPath(day))) || null;
    if (doc?.v !== 1) doc = { v: 1, games: {}, at: {}, tried: {} };
    const built = await buildDay(day, { read: url => proxy(url).catch(() => null), now }).catch(() => null);
    const due = e => {
      const key = `${e.league}:${e.id}`;
      const start = Date.parse(e.start);
      if (!(start > now) || start - now > 40 * HOUR) return false;
      if (!(key in doc.games)) return true;
      // (Again once, near the start, when made a day before.)
      const at = doc.at?.[key] || 0;
      return start - now < 6 * HOUR && start - at > 20 * HOUR;
    };
    const events = Object.values(JSON.parse(built?.body || '{}').events || {})
      .flat()
      .map(unslimEvent)
      .filter(e => e?.kind === 'match' && e.status?.state === 'pre' && SPORTS.has(LEAGUES[e.league]?.sport) && LEAGUES[e.league]?.espn && due(e))
      .sort((a, b) => Date.parse(a.start) - Date.parse(b.start))
      .map(e => localEvent(e, 'zh'));
    let made = 0;
    for (const e of events.slice(0, most)) {
      if (Date.now() >= until) break;
      const key = `${e.league}:${e.id}`;
      const summary = await proxy(`${SITE}/${LEAGUES[e.league].espn}/summary?event=${e.id}`).catch(() => null);
      if (!summary) continue;
      // (NBA's: AP's preview first, unless the game is 6 hours off.)
      if (e.league === 'nba' && !summary.article && Date.parse(e.start) - now > 6 * HOUR) continue;
      const g = previewFacts(summary, e);
      if (!g) {
        doc.games[key] = null;
        doc.at[key] = now;
        made++;
        continue;
      }
      const r = await aiOnce(env, ctx, 'sports-preview', { facts: g.facts }, cap);
      out.calls++;
      if (!r) break;
      if (r.error) {
        doc.tried = { ...doc.tried, [key]: (doc.tried?.[key] || 0) + 1 };
        if (doc.tried[key] >= 2) (doc.games[key] = doc.games[key] || null), (doc.at[key] = now);
        made++;
        continue;
      }
      const said = (r.out.points || []).map(p => `${p.zh} ${p.en}`).join(' ');
      const who = Object.fromEntries(Object.entries(g.people).filter(([id]) => said.includes(`{p:${id}}`)));
      doc.games[key] = r.out.points?.length ? { points: r.out.points, who } : null;
      doc.at[key] = now;
      made++;
    }
    // (Games of days gone dropped from the file's bookkeeping; a day's file is that day's alone.)
    if (made) await store.put(previewPath(day), { v: 1, built: now, games: doc.games, at: doc.at, tried: doc.tried || {} });
    out.made += made;
    out.days[day] = { left: events.length - made };
  }
  return out;
}
