// Every finished F1 session kept for good before anyone opens it (the
// owner, 2026-10-26: 數據 has to be there, not only for the sessions
// someone opened while OpenF1 was open). F1's archive is shut and OpenF1
// shuts while any session runs and turns quick askers away (429), so read
// at OpenF1's pace: three times an hour, the newest sessions over that the data proxy hasn't
// kept, for 12 minutes, through the proxy's own route (which keeps them),
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

// As fast as OpenF1 lets it (about 30 asks a minute; a session's 數據 and
// laps are about 15): a session, then the rest of its half minute, on
// until `until` (a run's 12 minutes) or `per` sessions; one turned away
// tried again a minute on, then the next run. `per` 0: only counted.
// → { sessions, kept, read, stopped? }.
export const F1KEPT_MS = 12 * 60_000;
const SESSION_MS = 30_000;
export async function runF1Kept({ store, proxy, now = Date.now(), per = Infinity, until = now + F1KEPT_MS, sleep = ms => new Promise(r => setTimeout(r, ms)), clock = Date.now }) {
  const year = new Date(now).getUTCFullYear();
  const events = (await store.json(`sports/f1/${year}.json`))?.events || [];
  const missing = [];
  const all = f1ToKeep(events, now);
  for (const urls of all) {
    const todo = [];
    for (const url of urls) if (!(await store.has(`${mirrorPath(url, '')}.gz`))) todo.push(url);
    if (todo.length) missing.push(todo);
  }
  let read = 0;
  const out = extra => ({ sessions: all.length, kept: all.length - missing.length + read, read, ...extra });
  for (const todo of missing) {
    if (read >= per || clock() + SESSION_MS > until) break;
    const began = clock();
    for (const url of todo) {
      if (await proxy(url).catch(() => null)) continue;
      // (Turned away: once more a minute on, then the next run.)
      await sleep(60_000);
      if (!(await proxy(url).catch(() => null))) return out({ stopped: url });
    }
    read++;
    await sleep(Math.max(0, SESSION_MS - (clock() - began)));
  }
  return out();
}
