// Every finished F1 session kept for good before anyone opens it (the
// owner, 2026-10-26: 數據 has to be there, not only for the sessions
// someone opened while OpenF1 was open). F1's archive is shut and OpenF1
// shuts while any session runs and turns quick askers away (429), so read
// slowly: each hour, the newest sessions over that the data proxy hasn't
// kept, three at most, through the proxy's own route (which keeps them),
// stopped at the first it can't read (OpenF1 shut or busy: the next hour).
// The addresses are the app's own (Orbit Sports lib/f1.mjs), so the app
// finds what's kept. Run by builders/run.js.

import { mirrorPath } from '../kit/mirror.mjs';

const at = start => encodeURIComponent(new Date(start).toISOString());
// The app's addresses: a session's 數據 (v=2, see lib/f1.mjs ARCHIVE), a race's every lap.
export const f1SessionUrl = start => `https://f1-live.orbit/session.json?start=${at(start)}&v=2`;
export const f1LapsUrl = start => `https://f1-live.orbit/laps.json?start=${at(start)}&final=1&v=2`;
// A session counted over three hours after its start (a red-flagged race runs long).
const OVER_MS = 3 * 3_600_000;

// What to read: [數據, every lap] for each session over, newest first
// ({ date } from the season pack; every session's laps: a practice's long
// runs, a qualifying's laps, a race's gaps and places).
export function f1ToKeep(events, now = Date.now()) {
  const sessions = (events || []).flatMap(e => e.competitions || []).filter(c => Date.parse(c.date) < now - OVER_MS);
  return sessions.sort((a, b) => Date.parse(b.date) - Date.parse(a.date)).map(c => [f1SessionUrl(c.date), f1LapsUrl(c.date)]);
}

export async function runF1Kept({ store, proxy, now = Date.now(), per = 3 }) {
  const year = new Date(now).getUTCFullYear();
  const events = (await store.json(`sports/f1/${year}.json`))?.events || [];
  let read = 0;
  let kept = 0;
  for (const urls of f1ToKeep(events, now)) {
    const todo = [];
    for (const url of urls) if (!(await store.has(`${mirrorPath(url, '')}.gz`))) todo.push(url);
    if (!todo.length) {
      kept++;
      continue;
    }
    if (read >= per) break;
    read++;
    for (const url of todo) if (!(await proxy(url).catch(() => null))) return { kept, read, stopped: url };
  }
  return { kept, read };
}
