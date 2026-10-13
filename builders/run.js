// The family's data built by the proxy (worker.js's builders cron, hourly):
// each builder (builders/*.js) on R2 (builders/store.js), its sources read
// here and, where the data proxy has a trim (YouTube), through its route in
// place. What Shared-Data built on GitHub moves here one builder at a time;
// MOVED is what it no longer touches (Shared-Data's r2sync.mjs skips them).

import { r2Store } from './store.js';
import { runWatch } from './watch.js';
import { runWinprob } from './winprob.js';
import { runCpbl, CPBL_HOUR } from './cpbl.js';

// The paths each moved builder owns in R2 (prefixes).
export const MOVED = {
  watch: ['sports/watch.json', 'sports/watch/', 'sports/elta-pages.json'],
  winprob: ['winprob/'],
  cpbl: ['sports/cpbl/standings.json']
};
// Win probability once a day, after the night's season packs are in R2
// (Shared-Data's night build, ~20:00-21:30 UTC, until that moves here too).
export const WINPROB_HOUR = 23;

// `proxy(url, trim)`: a read through the data proxy's route (its trims and edge cache), its JSON or null.
export async function runBuilders(env, { proxy, now = Date.now(), log = console.log } = {}) {
  if (!env.DATA) return { off: 'no data bucket' };
  const store = r2Store(env.DATA);
  const done = {};
  // Every hour: watch links (YouTube's highlights within the hour of a game,
  // ELTA's replays, Apple TV's MLS pages); older games' highlights for 10 minutes.
  try {
    done.watch = await runWatch({ store, proxy, now, until: now + 10 * 60_000 });
  } catch (e) {
    done.watch = { failed: String(e?.message || e).slice(0, 200) };
  }
  if (new Date(now).getUTCHours() === WINPROB_HOUR)
    try {
      done.winprob = await runWinprob({ store, proxy, now });
    } catch (e) {
      done.winprob = { failed: String(e?.message || e).slice(0, 200) };
    }
  if (new Date(now).getUTCHours() === CPBL_HOUR)
    try {
      done.cpbl = await runCpbl({ store, now });
    } catch (e) {
      done.cpbl = { failed: String(e?.message || e).slice(0, 200) };
    }
  done.store = store.stats;
  log('builders', JSON.stringify(done));
  return done;
}
