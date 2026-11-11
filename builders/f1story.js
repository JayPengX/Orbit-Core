// F1 賽後故事 (Orbit Sports, Jay 11-10): how a race was won, once a race.
// Code reads F1's own timing of the finished race (the data proxy's
// f1-live.orbit session.json, the one Sports' 數據 reads and the proxy keeps
// in R2) into a lean digest: the result with each top car's grid slot,
// stops and tyres, who led which laps, the biggest climbs, who retired,
// safety cars and red flags, the fastest lap. The AI only tells it
// (ai-features.js 'f1-story'); every number it writes must be the digest's.
//
// Told as points, never a paragraph (Jay 11-10): the moments that decided it,
// each its lap and its driver by car number, drawn by Sports as 過程's rows.
//
// → sports/f1/stories/<year>.json: { v: 2, built, races: { '<race start ISO>': { points: [{ lap, no, zh, en }], cars: { no: { name } } } | null }, tried }
import { aiOnce } from '../ai.js';
import { f1SessionUrl } from './f1kept.js';

export const storyPath = year => `sports/f1/stories/${year}.json`;
const RACE = new Set(['Race', 'SR']);
const TYRE = { SOFT: 'soft', MEDIUM: 'medium', HARD: 'hard', INTERMEDIATE: 'inter', WET: 'wet' };
const last = name => String(name || '').trim().split(/\s+/).pop();

// Who led which laps: 'Norris 1–2, Verstappen 3–20, …' (places: each car's place on each lap, lap 0 the grid).
export function leadersOf(places, cars, laps) {
  const byNo = new Map(cars.map(c => [String(c.no), c]));
  const runs = [];
  for (let lap = 1; lap <= laps; lap++) {
    const no = Object.keys(places || {}).find(n => places[n]?.[lap] === 1);
    if (!no) continue;
    const prev = runs.at(-1);
    if (prev && prev.no === no && prev.to === lap - 1) prev.to = lap;
    else runs.push({ no, from: lap, to: lap });
  }
  return runs.map(r => `${last(byNo.get(r.no)?.name) || r.no} #${r.no} ${r.from === r.to ? r.from : `${r.from}–${r.to}`}`);
}

// The digest the AI is told: ≈ 800–1,600 characters.
export function raceFacts(s, title = '') {
  const cars = (s?.cars || []).filter(c => c?.name);
  if (!cars.length || !/race|sprint/i.test(s?.session?.type || '')) return null;
  const laps = s.lap?.of || Math.max(...cars.map(c => c.laps || 0));
  const lines = [`${s.session.type === 'Race' ? 'Grand Prix race' : 'Sprint'}: ${title || s.meeting}, ${laps} laps${s.weather ? `, track ${Math.round(s.weather.track)}°C${s.weather.rain ? ', rain at the end' : ''}` : ''}.`];
  const tyres = c => (c.stints || []).map(x => `${TYRE[x.c] || String(x.c || '?').toLowerCase()} ${x.laps}`).join(', ');
  lines.push('Result (place, driver, team, grid slot, stops, tyres and laps on each):');
  for (const c of cars.filter(c => c.pos <= 6)) lines.push(`${c.pos} ${c.name} #${c.no} (${c.team}), from ${c.grid || '?'}, ${c.pits} stop${c.pits === 1 ? '' : 's'}: ${tyres(c)}${c.gap ? `, ${c.gap}` : ''}`);
  const climbs = cars
    .filter(c => c.grid && c.pos <= 10 && !c.retired && c.grid - c.pos >= 4)
    .sort((a, b) => b.grid - b.pos - (a.grid - a.pos))
    .slice(0, 3)
    .map(c => `${c.name} #${c.no} ${c.grid} → ${c.pos}`);
  if (climbs.length) lines.push(`Biggest climbs: ${climbs.join('; ')}`);
  const lost = cars.filter(c => c.grid && c.grid <= 5 && c.pos - c.grid >= 4 && !c.retired).map(c => `${c.name} #${c.no} ${c.grid} → ${c.pos}`);
  if (lost.length) lines.push(`Dropped back: ${lost.join('; ')}`);
  const led = leadersOf(s.places, cars, laps);
  if (led.length) lines.push(`Led (laps): ${led.slice(0, 8).join(', ')}`);
  const out = cars.filter(c => c.retired || c.stopped).map(c => `${c.name} #${c.no} (lap ${c.laps})`);
  if (out.length) lines.push(`Retired: ${out.slice(0, 6).join(', ')}`);
  const flags = (s.control || []).filter(m => /SAFETY CAR DEPLOYED|\bRED FLAG/i.test(m.message)).map(m => `lap ${m.lap} ${m.message.replace(/\s+/g, ' ').trim().toLowerCase()}`);
  if (flags.length) lines.push(`Track: ${[...new Set(flags)].slice(0, 5).join('; ')}`);
  const fast = cars.filter(c => c.pb?.p === 1)[0];
  if (fast) lines.push(`Fastest lap: ${fast.name} #${fast.no} ${fast.pb.v} on lap ${fast.pb.lap}`);
  return lines.join('\n').slice(0, 2400);
}

// The finished races of the past week without a story, told once each.
const overAt = c => Date.parse(c.date) + 3 * 3_600_000;
export async function runF1Stories({ store, env, ctx, proxy, cap, now = Date.now(), until = now + 3 * 60_000 }) {
  const year = new Date(now).getUTCFullYear();
  const events = (await store.json(`sports/f1/${year}.json`))?.events || [];
  // (A doc from before points, v 2, is told again: its races were paragraphs.)
  const was = await store.json(storyPath(year));
  const doc = was?.v === 2 ? was : { races: {}, tried: {} };
  const todo = events
    .flatMap(e => (e.competitions || []).map(c => ({ c, name: e.name })))
    .filter(({ c }) => RACE.has(c.type?.abbreviation) && c.status?.type?.name === 'STATUS_FINAL' && overAt(c) < now && now - Date.parse(c.date) < 7 * 86_400_000 && !(c.date in doc.races));
  let made = 0;
  for (const { c, name } of todo) {
    if (Date.now() >= until) break;
    const session = await proxy(f1SessionUrl(c.date)).catch(() => null);
    const facts = raceFacts(session, name);
    if (!facts) continue;
    const r = await aiOnce(env, ctx, 'f1-story', { facts, laps: session?.lap?.of || 0 }, cap);
    if (!r) break;
    if (r.error) {
      doc.tried[c.date] = (doc.tried[c.date] || 0) + 1;
      if (doc.tried[c.date] >= 2) doc.races[c.date] = null;
    } else {
      // (Each point's driver by name, for the face Sports draws.)
      const cars = Object.fromEntries((r.out.points || []).filter(p => p.no).map(p => [p.no, { name: (session.cars || []).find(x => String(x.no) === p.no)?.name || '' }]));
      doc.races[c.date] = { points: r.out.points, cars };
    }
    made++;
  }
  if (made) await store.put(storyPath(year), { v: 2, built: Date.now(), races: doc.races, tried: doc.tried || {} });
  return { made, left: todo.length - made };
}
