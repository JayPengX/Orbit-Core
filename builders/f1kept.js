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
// (v=4, as Orbit-Sports lib/f1.mjs ARCHIVE: a practice's classified best, the laps deleted.)
export const f1SessionUrl = start => `https://f1-live.orbit/session.json?start=${at(start)}&v=4`;
export const f1LapsUrl = start => `https://f1-live.orbit/laps.json?start=${at(start)}&final=1&v=2`;
// A session counted over two hours after its start (an hour's practice or
// qualifying, a red flag's wait in); a race (and a sprint) three (a
// red-flagged one runs long). Before, OpenF1 turns it away anyway: it shuts
// while a session runs. (Three hours for all left a Saturday's FP3 one run,
// :46, before qualifying shut OpenF1 again.)
const RACE = new Set(['Race', 'SR']);
const overAt = c => Date.parse(c.date) + (RACE.has(c.type?.abbreviation) ? 3 : 2) * 3_600_000;
// One called off (2026's Bahrain and Saudi weekends) has nothing to keep:
// left out, or ten in a row turned away stop every run before the older ones.
const CALLED_OFF = new Set(['STATUS_CANCELED', 'STATUS_POSTPONED']);

// What to read: [數據, every lap] for each session over, newest first
// ({ date } from the season pack; every session's laps: a practice's long
// runs, a qualifying's laps, a race's gaps and places).
export function f1ToKeep(events, now = Date.now()) {
  const sessions = (events || []).flatMap(e => e.competitions || []).filter(c => overAt(c) < now && !CALLED_OFF.has(c.status?.type?.name));
  return sessions.sort((a, b) => Date.parse(b.date) - Date.parse(a.date)).map(c => [f1SessionUrl(c.date), f1LapsUrl(c.date)]);
}

// As fast as OpenF1 lets it (about 30 asks a minute; a session's 數據 and
// laps are about 15): a session, then the rest of its half minute, on
// until `until` (a run's 12 minutes) or `per` sessions; one turned away
// tried again 20 seconds on, then the next session (three in a row: the
// next run). `per` 0: only counted.
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
  const failed = [];
  let inRow = 0;
  let again = 0;
  const out = extra => ({ sessions: all.length, kept: all.length - missing.length + read, read, again, ...(failed.length ? { failed } : {}), ...extra });
  for (const todo of missing) {
    if (read >= per || clock() + SESSION_MS > until) break;
    const began = clock();
    let ok = true;
    for (const url of todo) {
      if (await proxy(url).catch(() => null)) continue;
      // (Turned away: once more 20 seconds on; still not, the next session:
      // one OpenF1 can't give (a session called off) never holds up the rest.)
      again++;
      await sleep(20_000);
      if (await proxy(url).catch(() => null)) continue;
      ok = false;
      failed.push(url);
      break;
    }
    if (ok) (read++, (inRow = 0));
    // Three in a row: OpenF1 shut or turning this Worker away, the next run.
    else if (++inRow >= 3) return out({ stopped: failed.at(-1) });
    await sleep(Math.max(0, SESSION_MS - (clock() - began)));
  }
  return out();
}
