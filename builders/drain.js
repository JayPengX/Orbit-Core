// The move's last step: every file Shared-Data's indexes list, taken from
// its Pages site into R2 (builders/store.js reads a file R2 lacks from there
// and keeps it), so nothing is lost when the repo goes, and nothing is read
// again from a source. Runs with the builders until it has gone through every
// list (`data:drained` in KV), a few minutes a run.
//
// Not the nightly mirror's copies of finished games (mirror/…, ~37,000):
// the data proxy reads a game from its source once if anyone opens it, and
// keeps it (sports.js); CPBL's whole months are, they're built slowly.

import { CATALOG, asiaMonthUrl } from '../kit/catalog.mjs';
import { mirrorPath } from '../kit/mirror.mjs';
import { OFFICIAL } from './official-photos.js';
import { FOTMOB_LEAGUES } from './photos.js';

// Every path to move, from the indexes (read through the store, so moved too).
export async function drainList(store, now = Date.now()) {
  const paths = ['sports/index.json', 'sports/bounds.json', 'sports/elta-pages.json', 'sports/watch.json', 'sports/watch/index.json', 'winprob/index.json', 'sports/cpbl/standings.json', 'sports/cutouts/photos.json', 'sports/cutouts/pending.json', 'index.json', 'where.json', 'shape/rail.json', 'sports/nba/photos.json', 'sports/epl/photos.json'];
  const sports = await store.json('sports/index.json');
  for (const [key, l] of Object.entries(sports?.leagues || {})) {
    paths.push(`sports/${key}/days.json`);
    for (const y of Object.keys(l.years || {})) paths.push(`sports/${key}/${y}.json`);
  }
  for (const [key, l] of Object.entries((await store.json('sports/watch/index.json'))?.leagues || {})) for (const m of l.months || []) paths.push(`sports/watch/${key}/${m}.json`);
  for (const [key, l] of Object.entries((await store.json('winprob/index.json'))?.leagues || {})) for (const m of l.months || []) paths.push(`winprob/${key}/${m}.json`);
  for (const key of Object.keys(OFFICIAL)) paths.push(`sports/${key}/photos.json`);
  for (const key of Object.keys(FOTMOB_LEAGUES)) paths.push(`sports/${key}/faces.json`);
  const bus = await store.json('index.json');
  for (const c of Object.keys(bus?.cities || {})) if (c !== 'InterCity' && c !== 'rail') paths.push(`bus/${c}.json`);
  for (const k of Object.keys(bus?.squares || {})) paths.push(`bus/InterCity/${k}.json`);
  for (const p of bus?.shapes || []) paths.push(p);
  // CPBL's months whole, from last January.
  if (CATALOG.cpbl?.asia) {
    const y = new Date(now).getUTCFullYear();
    for (let t = Date.UTC(y - 1, 0, 1); t <= now; t = Date.UTC(new Date(t).getUTCFullYear(), new Date(t).getUTCMonth() + 1, 1))
      paths.push(`${mirrorPath(asiaMonthUrl(CATALOG.cpbl.asia, new Date(t).toISOString().slice(0, 7)), '')}.gz`);
  }
  return [...new Set(paths)];
}

// Through the list from where the last run stopped; done once it's all through.
export async function runDrain({ store, kv, now = Date.now(), until = now + 5 * 60_000 }) {
  const done = JSON.parse((await kv.get('data:drained').catch(() => null)) || 'null');
  if (done?.all) return { all: true };
  const list = await drainList(store, now);
  let i = done?.at || 0;
  let moved = 0;
  for (; i < list.length && Date.now() < until; i++) {
    const before = store.stats.moved || 0;
    await store.bytes(list[i]).catch(() => null);
    moved += (store.stats.moved || 0) - before;
  }
  const state = { at: i, of: list.length, all: i >= list.length, when: now };
  await kv.put('data:drained', JSON.stringify(state));
  return { ...state, moved };
}
