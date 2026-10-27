// CPBL's months whole, for Orbit Sports (its 賽事 and the season archive),
// the builders (watch, win probability, season bounds) and the data proxy.
// cpbl.com.tw answers no server (GitHub's in the US, nor the proxy's in
// Taiwan, 2026-10-13), and the proxy's route reads TheSportsDB's 16 days
// nearest now; so each day this reads every day of the month from
// TheSportsDB one at a time (cpblMonthWhole, ~45 s) and keeps the month
// whole in R2, at the mirror's address, which the data proxy answers from
// (sports.js readKept) until the month's next game begins. A month over is
// kept for good.

import { CATALOG, asiaMonthUrl, asiaMonthOf, TSDB_DAY, TSDB_CPBL, parseTsdbDay } from '../kit/catalog.mjs';
import { mirrorPath } from '../kit/mirror.mjs';
import { FOREVER } from '../sports.js';
import { within } from './within.js';

// CPBL's month ('2026-09') whole: TheSportsDB's list of every day in it,
// one day at a time `gap` apart (66 games on 26 days for September, none
// refused at 1.5 s). A day refused (429) waits and is asked again; a day
// never read leaves the month not `whole` (read again next run).
export async function cpblMonthWhole(ym, { day, league, parse, now = Date.now(), gap = 1500, wait = 30_000, sleep = ms => new Promise(r => setTimeout(r, ms)), get = url => within(30_000, signal => fetch(url, { signal, headers: { 'User-Agent': 'Orbit/1.0 (https://github.com/JayPengX/Orbit-Core)' } })) } = {}) {
  const [y, m] = ym.split('-').map(Number);
  const days = Array.from({ length: new Date(Date.UTC(y, m, 0)).getUTCDate() }, (_, i) => `${ym}-${String(i + 1).padStart(2, '0')}`);
  const games = [];
  let whole = true;
  for (const d of days) {
    let list = null;
    for (let attempt = 0; attempt < 3 && !list; attempt++) {
      try {
        const res = await get(`${day}?d=${d}&l=${league}`);
        if (res.ok) list = parse(await res.json(), now);
        else if (res.status === 429) await sleep(wait);
        else await sleep(gap * 2);
      } catch {
        await sleep(gap * 2);
      }
    }
    if (list) games.push(...list);
    else whole = false;
    await sleep(gap);
  }
  const seen = new Set();
  return {
    league: 'cpbl',
    month: ym,
    games: games.filter(g => !seen.has(g.id) && seen.add(g.id)).sort((a, b) => a.start.localeCompare(b.start)),
    ...(whole ? { whole: 1 } : {})
  };
}

export const ASIA_HOUR = 15;
// The month now (and, its first three days, the last one too: its last games' finals).
export async function runAsia({ store, now = Date.now(), get, sleep }) {
  if (!CATALOG.cpbl?.asia) return { off: true };
  const months = [asiaMonthOf(now)];
  if (new Date(now + 8 * 3_600_000).getUTCDate() <= 3) months.unshift(asiaMonthOf(now - 4 * 86_400_000));
  // Then one earlier month of the season not kept whole (a day refused, or
  // kept cut short by the route before only whole months settled), the
  // latest first: one a run (a month's days one at a time, with TheSportsDB's
  // waits, can take minutes).
  const [y, m] = asiaMonthOf(now).split('-').map(Number);
  for (let k = m - 1; k >= 3; k--) {
    const ym = `${y}-${String(k).padStart(2, '0')}`;
    if (months.includes(ym)) continue;
    if ((await store.json(`${mirrorPath(asiaMonthUrl(CATALOG.cpbl.asia, ym), '')}.gz`))?.data?.whole) continue;
    months.push(ym);
    break;
  }
  const out = {};
  const settled = g => g.state === 'post' || g.state === 'void' || (g.state === 'pre' && Date.parse(g.start) < now - 6 * 3_600_000);
  for (const ym of months) {
    const url = asiaMonthUrl(CATALOG.cpbl.asia, ym);
    const key = `${mirrorPath(url, '')}.gz`;
    const kept = (await store.json(key))?.data;
    let data = await cpblMonthWhole(ym, { day: TSDB_DAY, league: TSDB_CPBL, parse: parseTsdbDay, now, ...(get ? { get } : {}), ...(sleep ? { sleep } : {}) });
    // Days refused: the copy with more of the month.
    if (!data.whole && (kept?.games?.length || 0) > data.games.length) data = kept;
    if (!data?.games?.length) continue;
    const open = data.games.filter(g => !settled(g)).map(g => Date.parse(g.start)).filter(Number.isFinite);
    // Good until its next game begins (then the route's live list); a month all over, for good.
    const until = open.length ? Math.min(...open) : FOREVER;
    await store.put(key, { until, data });
    out[ym] = { games: data.games.length, whole: Boolean(data.whole) };
  }
  return out;
}
