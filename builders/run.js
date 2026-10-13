// The family's data built by the proxy (worker.js's builders cron, hourly at
// :17): each builder (builders/*.js) on R2 (builders/store.js), its sources
// read here and, where the data proxy has a trim or a cache, through its
// route in place. Each runs as often as its data changes, and no more:
//
//   every hour   watch links (light: what's new), a few cutouts, the bus
//                packs a few cities at a time once a city's is a week old
//                (one read of index.json when none is)
//   15 UTC       CPBL's tables and its month whole (23:00 in Taiwan, after the night's games)
//   16 UTC       the season packs (midnight in Taiwan)
//   18 UTC       a few photo lists in turn (each about weekly)
//   20 UTC       watch links in full (the season, older highlights, Apple TV)
//   23 UTC       win probability (after the packs)
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

export const WINPROB_HOUR = 23;

// `proxy(url, trim)`: a read through the data proxy's route (its trims and edge cache), its JSON or null.
export async function runBuilders(env, { proxy, now = Date.now(), log = console.log } = {}) {
  if (!env.DATA) return { off: 'no data bucket' };
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
  if (hour === ASIA_HOUR) await step('asia', () => runAsia({ store, now }));
  if (hour === CPBL_HOUR) await step('cpbl', () => runCpbl({ store, now }));
  if (hour === SPORTS_HOUR) await step('sports', () => runSports({ store, now }));
  if (hour === PHOTOS_HOUR) await step('photos', () => runPhotos({ store, proxy, now }));
  await step('watch', () => runWatch({ store, proxy, now, until: now + 10 * 60_000 }));
  if (hour === WINPROB_HOUR) await step('winprob', () => runWinprob({ store, proxy, now }));
  await step('cutouts', () => runCutouts({ store, now }));
  await step('buses', () => runBuses({ store, env, now, until: now + 6 * 60_000 }));
  done.store = store.stats;
  log('builders', JSON.stringify(done));
  return done;
}
