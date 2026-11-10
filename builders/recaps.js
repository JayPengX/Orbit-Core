// 賽後三句話 (Orbit Sports, Jay 11-10): each finished game's recap. The
// score lines are code's (the app's own: who won, by what, the record);
// this builds the one line code can't write, why the game went that way,
// once a game, from a lean digest of ESPN's own summary (Jay 11-10: feed it
// what the page doesn't show, but only what matters): the score by period,
// the top performers, the plays that swung it (by win probability, or the
// late scoring plays, or a match's goals and cards), the records and the
// series. Every number the line writes must be one of the digest's (ai-features.js).
//
// → sports/recaps/<YYYY-MM-DD>.json (Taiwan's day): { built, games: { '<league>:<id>': { zh, en } } }
import { aiOnce } from '../ai.js';
import { buildDay } from '../sports-today.js';
import { LEAGUES, SITE, unslimEvent, localEvent } from '../kit/sports-espn.mjs';
import { twDay } from '../kit/format.mjs';

export const recapPath = day => `sports/recaps/${day}.json`;
const SPORTS = new Set(['basketball', 'baseball', 'football', 'soccer', 'hockey']);
const cut = (s, n) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, n);

// The plays that swung a game: the largest moves of the home side's win
// chance, each with its play's words (ESPN's winprobability and plays).
export function swings(summary, most = 3) {
  const wp = summary?.winprobability || [];
  if (wp.length < 3) return [];
  const text = new Map((summary.plays || []).map(p => [String(p.id), p]));
  const moves = [];
  for (let i = 1; i < wp.length; i++) {
    const d = (wp[i].homeWinPercentage ?? 0) - (wp[i - 1].homeWinPercentage ?? 0);
    const p = text.get(String(wp[i].playId));
    if (p?.text) moves.push({ d, p });
  }
  return moves
    .sort((a, b) => Math.abs(b.d) - Math.abs(a.d))
    .slice(0, most)
    .sort((a, b) => (a.p.sequenceNumber ?? 0) - (b.p.sequenceNumber ?? 0))
    .map(({ d, p }) => `${p.period?.displayValue || (p.period?.number ? `P${p.period.number}` : '')} ${p.clock?.displayValue || ''} ${cut(p.text, 110)} (home win chance ${d > 0 ? '+' : ''}${Math.round(d * 100)} pts)`.trim());
}

// A game's facts as the AI is told them, lean: ≈ 600–1,200 characters.
export function gameFacts(summary, e) {
  const comp = summary?.header?.competitions?.[0];
  if (!comp) return null;
  const sideOf = id => (String(id) === String(e.home?.id) ? e.home : String(id) === String(e.away?.id) ? e.away : null);
  const lines = [`${LEAGUES[e.league]?.en || e.league} (${LEAGUES[e.league]?.sport || ''})${e.note ? `, ${cut(e.note, 60)}` : ''}`];
  const teams = (comp.competitors || []).map(c => {
    const s = sideOf(c.id || c.team?.id);
    return { c, name: s?.name || c.team?.displayName || '', en: c.team?.displayName || '', abbr: c.team?.abbreviation || '' };
  });
  const away = teams.find(t => t.c.homeAway === 'away'), home = teams.find(t => t.c.homeAway === 'home');
  if (!away || !home) return null;
  lines.push(`Teams in English: ${away.name} = ${away.en}; ${home.name} = ${home.en}`);
  lines.push(`Final: ${away.name} ${away.c.score} at ${home.name} ${home.c.score}${comp.status?.type?.detail && !/^final$/i.test(comp.status.type.detail) ? ` (${comp.status.type.detail})` : ''}`);
  const rec = t => t.c.record?.find?.(r => r.type === 'total' || r.name === 'overall')?.summary || t.c.record?.[0]?.summary || '';
  if (rec(away) || rec(home)) lines.push(`Records now: ${away.name} ${rec(away) || '?'}, ${home.name} ${rec(home) || '?'}`);
  const ls = t => (t.c.linescores || []).map(x => x.displayValue ?? x.value).join(' ');
  if (ls(away) && ls(home)) lines.push(`By period: ${away.abbr || away.name} ${ls(away)} | ${home.abbr || home.name} ${ls(home)}`);
  // Top performers: each team's leader in each category ESPN names (points, rebounds…).
  for (const L of summary.leaders || []) {
    const name = sideOf(L.team?.id)?.name || L.team?.displayName || '';
    const best = (L.leaders || []).slice(0, 3).map(cat => cat.leaders?.[0] && `${cat.leaders[0].athlete?.displayName} ${cut(cat.leaders[0].displayValue, 40)}`).filter(Boolean);
    if (best.length) lines.push(`${name} leaders: ${best.join('; ')}`);
  }
  // What swung it: win probability's moves, else the late scoring plays, else a match's goals and cards.
  const swung = swings(summary);
  if (swung.length) lines.push('Biggest swings:', ...swung);
  else if (summary.scoringPlays?.length) lines.push('Last scoring plays:', ...summary.scoringPlays.slice(-4).map(p => `${p.period?.displayValue || `P${p.period?.number || ''}`} ${p.clock?.displayValue || ''} ${cut(p.text, 110)} (${p.awayScore}-${p.homeScore})`));
  const keys = (summary.keyEvents || []).filter(k => /goal|red card|penalty/i.test(k.type?.text || ''));
  if (keys.length) lines.push('Key events:', ...keys.slice(0, 8).map(k => `${k.clock?.displayValue || ''} ${cut(k.type?.text, 20)}: ${cut(k.text, 100)}`));
  if (comp.series?.summary) lines.push(`Series: ${cut(comp.series.summary, 60)}`);
  return lines.join('\n').slice(0, 2400);
}

// The finished games of yesterday and today (Taiwan's), recapped once each.
export async function runRecaps({ store, env, ctx, proxy, cap, now = Date.now(), until = now + 4 * 60_000, most = 40 }) {
  const out = { made: 0, calls: 0, days: {} };
  for (const day of [twDay(now - 86_400_000), twDay(now)]) {
    if (Date.now() >= until) break;
    const doc = (await store.json(recapPath(day))) || { games: {} };
    const built = await buildDay(day, { read: url => proxy(url).catch(() => null), now }).catch(() => null);
    const events = Object.values(JSON.parse(built?.body || '{}').events || {})
      .flat()
      .map(unslimEvent)
      .filter(e => e?.kind === 'match' && e.status?.state === 'post' && SPORTS.has(LEAGUES[e.league]?.sport) && LEAGUES[e.league]?.espn && !doc.games[`${e.league}:${e.id}`])
      .map(e => localEvent(e, 'zh'));
    let made = 0;
    for (const e of events.slice(0, most)) {
      if (Date.now() >= until) break;
      const summary = await proxy(`${SITE}/${LEAGUES[e.league].espn}/summary?event=${e.id}`).catch(() => null);
      const facts = summary && gameFacts(summary, e);
      if (!facts) continue;
      const key = `${e.league}:${e.id}`;
      const r = await aiOnce(env, ctx, 'sports-recap', { facts }, cap);
      out.calls++;
      if (!r) break;
      if (r.error) {
        // (Twice with nothing usable: let go, the app shows the score lines alone.)
        doc.tried = { ...doc.tried, [key]: (doc.tried?.[key] || 0) + 1 };
        if (doc.tried[key] >= 2) doc.games[key] = null;
        made++;
        continue;
      }
      doc.games[key] = r.out;
      made++;
    }
    if (made) await store.put(recapPath(day), { built: Date.now(), games: doc.games, tried: doc.tried || {} });
    out.made += made;
    out.days[day] = { left: events.length - made };
  }
  return out;
}
