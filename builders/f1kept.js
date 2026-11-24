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
// (v=5, as Orbit-Sports lib/f1.mjs ARCHIVE: a practice's classified best, the laps deleted, the grid drops said.)
export const f1SessionUrl = start => `https://f1-live.orbit/session.json?start=${at(start)}&v=5`;
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
// → { sessions, kept, read, stopped?, waiting? (OpenF1 refusing: not a failure) }.
export const F1KEPT_MS = 12 * 60_000;
export const KEPT_LIST = 'private/f1/kept-sessions.json';
const SESSION_MS = 30_000;
// OpenF1 turning us away (not our failure): through a race weekend it shuts to
// every free asker, past sessions too (401, "Live F1 session in progress"), and
// its limit on Cloudflare's shared addresses answers 429 for hours (Las Vegas
// 2026-11-20: runs turned away mailed Jay a failure, twice). Such a session
// waits for a later run; one still turned away 4 days after it ended is a failure.
const REFUSED = /openf1 (401|403|429)/;
const WAIT_MS = 4 * 86_400_000;
// OpenF1 open but with nothing for the session (Las Vegas's FP1, 2026-11-20: no
// results, 20 laps in all): waited for as a refusal is, then set aside for good
// (KEPT_LIST `none`), never asked again. It was asked three times an hour for
// days, each a failure, and mailed Jay "一直失敗" again and again.
const EMPTY = /openf1 no \w+/;
const startOf = url => Date.parse(new URL(url).searchParams.get('start'));
export async function runF1Kept({ store, proxy, now = Date.now(), per = Infinity, until = now + F1KEPT_MS, sleep = ms => new Promise(r => setTimeout(r, ms)), clock = Date.now }) {
  const year = new Date(now).getUTCFullYear();
  const events = (await store.json(`sports/f1/${year}.json`))?.events || [];
  const missing = [];
  const all = f1ToKeep(events, now);
  // (Sessions found kept, listed once (KEPT_LIST): not looked for again. Each run looked for
  // all 200 files of the season's 100 sessions, 55 s of the Runner's time three times an hour.)
  const list = (await store.json(KEPT_LIST).catch(() => null)) || {};
  const done = new Set(list.done || []);
  const none = new Set(list.none || []);
  const found = [];
  for (const urls of all) {
    if (done.has(urls[0]) || none.has(urls[0])) continue;
    const todo = [];
    for (const url of urls) if (!(await store.has(`${mirrorPath(url, '')}.gz`))) todo.push(url);
    if (todo.length) missing.push(todo);
    else found.push(urls[0]);
  }
  const keepList = () => store.put(KEPT_LIST, { done: [...done], none: [...none] });
  for (const u of found) done.add(u);
  if (found.length) await keepList();
  let read = 0;
  const failed = [];
  let inRow = 0;
  let again = 0;
  const empty = [];
  const out = extra => ({ sessions: all.length, kept: all.length - missing.length + read, read, again, ...(empty.length ? { none: empty } : {}), ...(failed.length ? { failed } : {}), ...extra });
  for (const todo of missing) {
    if (read >= per || clock() + SESSION_MS > until) break;
    const began = clock();
    let ok = true;
    for (const url of todo) {
      const read = () => proxy(url, '', { why: true }).catch(e => ({ error: String(e?.message || e) }));
      let got = await read();
      if (got && !got.error) continue;
      // (Turned away: once more 20 seconds on; still not, the next session:
      // one OpenF1 can't give (a session called off) never holds up the rest.)
      again++;
      await sleep(20_000);
      got = await read();
      if (got && !got.error) continue;
      // (OpenF1 refusing, not 4 days on: nothing wrong, the session waits for a later run.)
      if (REFUSED.test(got?.error || '') && now - startOf(url) < WAIT_MS) return out({ waiting: url, why: got.error });
      // (Nothing in OpenF1 for it: waited for, then set aside.)
      if (EMPTY.test(got?.error || '')) {
        if (now - startOf(url) >= WAIT_MS) (none.add(f1SessionUrl(new Date(startOf(url)).toISOString())), empty.push(url), await keepList());
        ok = null;
        break;
      }
      ok = false;
      failed.push(url);
      break;
    }
    if (ok) (read++, (inRow = 0));
    else if (ok === null) inRow = 0;
    // Three in a row: OpenF1 shut or turning this Worker away, the next run.
    else if (++inRow >= 3) return out({ stopped: failed.at(-1) });
    await sleep(Math.max(0, SESSION_MS - (clock() - began)));
  }
  return out();
}
