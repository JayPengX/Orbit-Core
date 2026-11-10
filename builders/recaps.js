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
    // (A substitution or a timeout is no play that swung it.)
    if (p?.text && !/enters the game|timeout|end of|jump ball/i.test(p.text)) moves.push({ d, p });
  }
  return moves
    .sort((a, b) => Math.abs(b.d) - Math.abs(a.d))
    .slice(0, most)
    .sort((a, b) => (a.p.sequenceNumber ?? 0) - (b.p.sequenceNumber ?? 0))
    .map(({ d, p }) => `${p.period?.displayValue || (p.period?.number ? `P${p.period.number}` : '')} ${p.clock?.displayValue || ''} ${cut(p.text, 110)} (home win chance ${d > 0 ? '+' : ''}${Math.round(d * 100)} pts)`.trim());
}

// The players the AI may name: ESPN's box score, each by a token the app
// draws as the player (headshot and name), never typed out ({p:<id>}).
export function peopleOf(summary) {
  const who = {};
  for (const side of summary?.boxscore?.players || [])
    for (const st of side.statistics || [])
      for (const x of st.athletes || []) {
        const a = x.athlete;
        if (a?.id && !who[a.id]) who[a.id] = { name: a.displayName || '', short: a.shortName || a.displayName || '', team: String(side.team?.id || '') };
      }
  return who;
}

// How the score went, from every scoring play (ESPN's plays, else its
// scoring plays): what the final score and the leaders can't show. Lead
// changes, the winner's deepest hole, when it went ahead for good and on
// whose play, the biggest run and who scored it, the period that broke it
// open, overtime. `worth`: something here explains the game (else no line).
const REG = { basketball: 4, football: 4, hockey: 3, baseball: 9, soccer: 2 };
export function scoreStory(summary, sport) {
  const comp = summary?.header?.competitions?.[0];
  const home = comp?.competitors?.find(c => c.homeAway === 'home'), away = comp?.competitors?.find(c => c.homeAway === 'away');
  if (!home || !away) return null;
  const hs = Number(home.score), as = Number(away.score);
  if (!Number.isFinite(hs) || !Number.isFinite(as) || hs === as) return null;
  const win = hs > as ? home : away, lose = hs > as ? away : home;
  const tok = c => `{t:${c.id || c.team?.id}}`;
  const people = peopleOf(summary);
  const playerOf = p => (p.participants || []).map(x => String(x.athlete?.id || '')).find(id => people[id]) || '';
  const src = (summary.plays || []).some(p => p.scoringPlay) ? summary.plays.filter(p => p.scoringPlay) : summary.scoringPlays || [];
  const pts = src
    .map(p => ({ h: Number(p.homeScore), a: Number(p.awayScore), team: String(p.team?.id || ''), per: p.period?.number || 0, clock: p.clock?.displayValue || '', who: playerOf(p), text: cut(p.text, 100) }))
    .filter(p => Number.isFinite(p.h) && Number.isFinite(p.a));
  const lines = [];
  let worth = false;
  const margin = p => (win === home ? p.h - p.a : p.a - p.h);
  const at = p => `${perName(sport, p.per)} ${p.clock}`.trim();
  const score = p => `${win === home ? p.h : p.a}-${win === home ? p.a : p.h}`;
  if (pts.length) {
    let changes = 0, ties = 0, sign = 0, deficit = 0, lead = 0, deficitAt = null;
    for (const p of pts) {
      const m = margin(p);
      const sg = Math.sign(m);
      if (sg === 0) ties++;
      else {
        if (sign && sg !== sign) changes++;
        sign = sg;
      }
      if (-m > deficit) (deficit = -m), (deficitAt = p);
      lead = Math.max(lead, m);
    }
    if (changes) lines.push(`Lead changes: ${changes}; ties: ${ties}`);
    if (changes >= 4) worth = true;
    const big = { basketball: 8, football: 7 }[sport] ?? 1;
    if (deficit >= big) {
      lines.push(`${tok(win)} came back from ${deficit} down (${score(deficitAt)}, ${at(deficitAt)})`);
      worth = true;
    } else if (!deficit) lines.push(`${tok(win)} never trailed; led by as many as ${lead}`);
    // Ahead for good: the play after the last time the winner wasn't.
    let last = -1;
    pts.forEach((p, i) => margin(p) <= 0 && (last = i));
    const go = pts[last + 1];
    if (go && last >= 0) {
      lines.push(`${tok(win)} ahead for good: ${at(go)}, ${score(go)}${go.who ? `, on {p:${go.who}}'s play` : ''} (${go.text})`);
      if (go.per >= (REG[sport] || 4)) worth = true;
    }
    // The biggest run (points one side scored before the other scored), basketball and football.
    if (sport === 'basketball' || sport === 'football') {
      let best = null, cur = null;
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i], prev = pts[i - 1] || { h: 0, a: 0 };
        const side = p.h > prev.h ? home : p.a > prev.a ? away : null;
        if (!side) continue;
        const got = side === home ? p.h - prev.h : p.a - prev.a;
        if (cur && cur.side === side) (cur.n += got), (cur.end = p), cur.by.set(p.who, (cur.by.get(p.who) || 0) + got);
        else cur = { side, n: got, start: p, end: p, from: prev, by: new Map([[p.who, got]]) };
        if (!best || cur.n > best.n) best = { ...cur, by: new Map(cur.by) };
      }
      if (best && best.n >= (sport === 'basketball' ? 10 : 14)) {
        const top = [...best.by].filter(([id]) => id).sort((x, y) => y[1] - x[1])[0];
        const fromS = best.side === home ? `${best.from.h}-${best.from.a}` : `${best.from.a}-${best.from.h}`;
        lines.push(`Biggest run: ${tok(best.side)} ${best.n}-0, ${at(best.start)} to ${at(best.end)} (from ${fromS} for them)${top ? `, {p:${top[0]}} ${top[1]} of them` : ''}`);
        if (best.side === win) worth = true;
      }
    }
  }
  // The period that broke it open, from the score by period.
  const ls = c => (c.linescores || []).map(x => Number(x.displayValue ?? x.value));
  const lw = ls(win), ll = ls(lose);
  if (lw.length && lw.length === ll.length) {
    const d = lw.map((x, i) => x - ll[i]);
    const i = d.indexOf(Math.max(...d));
    if (sport === 'basketball' && d[i] >= 10) {
      lines.push(`${tok(win)} won the ${perName(sport, i + 1)} ${lw[i]}-${ll[i]}`);
      worth = true;
    }
    if (lw.length > (REG[sport] || 99) && sport !== 'soccer') {
      lines.push(`Went to ${sport === 'baseball' ? `${lw.length} innings` : 'overtime'}`);
      worth = true;
    }
    // Behind going into the last regulation period.
    const n = REG[sport];
    if (n && lw.length >= n && sport !== 'soccer') {
      const before = lw.slice(0, n - 1).reduce((x, y) => x + y, 0) - ll.slice(0, n - 1).reduce((x, y) => x + y, 0);
      if (before < 0) (lines.push(`${tok(win)} trailed by ${-before} going into the ${perName(sport, n)}`), (worth = true));
    }
  }
  return { lines, worth, people };
}
const perName = (sport, n) => (sport === 'baseball' ? `inning ${n}` : sport === 'soccer' ? (n === 1 ? '1st half' : n === 2 ? '2nd half' : `period ${n}`) : sport === 'hockey' ? `period ${n}` : n > 4 ? `OT${n - 4 > 1 ? n - 4 : ''}` : `Q${n}`);

// A game's facts as the AI is told them, lean (≈ 400–1,200 characters): only
// what the card doesn't already show (Jay 11-10: never the score, the
// records or the leaders again). Teams and players as tokens ({t:id},
// {p:id}) the app draws with their logo and face. null: nothing to tell.
export function gameFacts(summary, e) {
  const comp = summary?.header?.competitions?.[0];
  if (!comp) return null;
  const sport = LEAGUES[e.league]?.sport || '';
  const st = scoreStory(summary, sport);
  if (!st) return null;
  const swung = swings(summary);
  const keys = (summary.keyEvents || []).filter(k => /goal|red card|penalty/i.test(k.type?.text || ''));
  if (!st.worth && !swung.length && !keys.length) return null;
  const teams = (comp.competitors || []).map(c => `{t:${c.id || c.team?.id}} = ${c.homeAway} (${c.team?.displayName || ''})`);
  const lines = [`${LEAGUES[e.league]?.en || e.league} (${sport})${e.note ? `, ${cut(e.note, 60)}` : ''}`, `Teams: ${teams.join('; ')}`, ...st.lines];
  if (swung.length) lines.push('Plays that swung the win chance most:', ...swung);
  if (keys.length) lines.push('Key events:', ...keys.slice(0, 8).map(k => `${k.clock?.displayValue || ''} ${cut(k.type?.text, 20)}: ${cut(k.text, 100)}`));
  if (comp.series?.summary) lines.push(`Series: ${cut(comp.series.summary, 60)}`);
  // (Players by token: every one the box score knows, named in these facts.)
  const named = Object.entries(st.people).filter(([id, p]) => lines.some(l => l.includes(`{p:${id}}`) || (p.name && l.includes(p.name))));
  if (named.length) lines.push(`Players: ${named.map(([id, p]) => `{p:${id}} = ${p.name}`).join('; ')}`);
  return { facts: lines.join('\n').slice(0, 2400), people: Object.fromEntries(named.map(([id, p]) => [id, { short: p.short, team: p.team }])) };
}

// The finished games of yesterday and today (Taiwan's), recapped once each.
export async function runRecaps({ store, env, ctx, proxy, cap, now = Date.now(), until = now + 4 * 60_000, most = 40 }) {
  const out = { made: 0, calls: 0, days: {} };
  for (const day of [twDay(now - 86_400_000), twDay(now)]) {
    if (Date.now() >= until) break;
    // (v2, Jay 11-10: lines that only said the leaders again are dropped and made anew.)
    let doc = (await store.json(recapPath(day))) || { games: {} };
    if (doc.v !== 2) doc = { v: 2, games: {}, tried: {} };
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
      const key = `${e.league}:${e.id}`;
      if (!summary) continue;
      const g = gameFacts(summary, e);
      // (Nothing the card doesn't already say: no line, never asked.)
      if (!g) {
        doc.games[key] = null;
        made++;
        continue;
      }
      const r = await aiOnce(env, ctx, 'sports-recap', { facts: g.facts }, cap);
      out.calls++;
      if (!r) break;
      if (r.error) {
        // (Twice with nothing usable: let go, the app shows the score lines alone.)
        doc.tried = { ...doc.tried, [key]: (doc.tried?.[key] || 0) + 1 };
        if (doc.tried[key] >= 2) doc.games[key] = null;
        made++;
        continue;
      }
      // (Its players, for the app to draw by their faces: only those the line names.)
      const who = Object.fromEntries(Object.entries(g.people).filter(([id]) => `${r.out.zh} ${r.out.en}`.includes(`{p:${id}}`)));
      doc.games[key] = r.out.zh ? { ...r.out, who } : null;
      made++;
    }
    if (made) await store.put(recapPath(day), { v: 2, built: Date.now(), games: doc.games, tried: doc.tried || {} });
    out.made += made;
    out.days[day] = { left: events.length - made };
  }
  return out;
}
