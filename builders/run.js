// The family's data built by the proxy (on its even-minute cron, worker.js,
// one job a run at its own minute: SLOTS): each builder (builders/*.js) on R2 (builders/store.js), its sources
// read here and, where the data proxy has a trim or a cache, through its
// route in place. Each runs as often as its data changes, and no more:
//
//   :16 hourly   watch links (light: what's new; in full at 20 UTC: the
//                season, older highlights, Apple TV)
//   :18 hourly   Shared-Data's files moved into R2 (drain.js), until done
//   :20 hourly   a few cutouts
//   :24 hourly   the bus packs, a few cities at a time once a city's is a
//                week old (one read of index.json when none is)
//   :22 daily    15 UTC CPBL's tables and its month whole (23:00 in Taiwan);
//                16 UTC the season packs (midnight in Taiwan); 18 UTC a few
//                photo lists in turn (each about weekly); 23 UTC win
//                probability (after the packs)
//
// What a finished game is (its box score, a day or month of them) isn't
// built at all: the data proxy keeps it the first time anyone reads it
// (sports.js). Nothing is built on GitHub any more (Shared-Data retired).

import { r2Store } from './store.js';
import { runWatch } from './watch.js';
import { runWinprob } from './winprob.js';
import { runCpbl, CPBL_HOUR } from './cpbl.js';
import { runAsia, ASIA_HOUR } from './asia.js';
import { runSports, SPORTS_HOUR } from './sports.js';
import { runPhotos, runCutouts, PHOTOS_HOUR } from './photos.js';
import { runBuses } from './buses.js';
import { runDrain } from './drain.js';

export const WINPROB_HOUR = 23;

// `proxy(url, trim)`: a read through the data proxy's route (its trims and edge cache), its JSON or null.
// One job a run (each run its own 30 s of CPU: the whole hour's work in one
// went past it, 2026-10-13), each on its own even minute of the hour.
export const SLOTS = { 16: 'watch', 18: 'drain', 20: 'cutouts', 22: 'daily', 24: 'buses' };

// `proxy(url, trim)`: a read through the data proxy's route (its trims and edge cache), its JSON or null.
export async function runBuilders(env, { proxy, now = Date.now(), job = SLOTS[new Date(now).getUTCMinutes()], log = console.log } = {}) {
  if (!env.DATA || !job) return { off: env.DATA ? 'no job this minute' : 'no data bucket' };
  const store = r2Store(env.DATA);
  const hour = new Date(now).getUTCHours();
  const done = {};
  const step = async (name, fn) => {
    try {
      done[name] = await fn();
    } catch (e) {
      done[name] = { failed: String(e?.message || e).slice(0, 200) };
    }
  };
  if (job === 'watch') await step('watch', () => runWatch({ store, proxy, now, until: now + 8 * 60_000 }));
  // The move from Shared-Data: every listed file into R2 (once; a few minutes a run).
  if (job === 'drain' && env.RATE_LIMIT_KV) await step('drain', () => runDrain({ store, kv: env.RATE_LIMIT_KV, now, until: Date.now() + 5 * 60_000 }));
  if (job === 'cutouts') await step('cutouts', () => runCutouts({ store, now }));
  if (job === 'buses') await step('buses', () => runBuses({ store, env, now, until: now + 6 * 60_000 }));
  if (job === 'daily') {
    if (hour === ASIA_HOUR) await step('asia', () => runAsia({ store, now }));
    if (hour === CPBL_HOUR) await step('cpbl', () => runCpbl({ store, now }));
    if (hour === SPORTS_HOUR) await step('sports', () => runSports({ store, now }));
    if (hour === PHOTOS_HOUR) await step('photos', () => runPhotos({ store, proxy, now }));
    if (hour === WINPROB_HOUR) await step('winprob', () => runWinprob({ store, proxy, now }));
  }
  done.store = store.stats;
  log('builders', job, JSON.stringify(done));
  return done;
}
