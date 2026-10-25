// The data proxy's copies kept for good (sports.js `keep`: a game, a day or
// month all over, an F1 session, a race's results; R2's `mirror/`) go with
// their season, by the owner's rule (season.js): a league's copies from
// before its first askable day (sports/bounds.json, written by the sports
// builder an hour before) are wiped. A league whose bounds weren't read
// wipes nothing; a copy of no league here (another app's) goes two seasons on.
// Run nightly by builders/run.js (17:00 UTC).

import { CATALOG } from '../kit/catalog.mjs';
import { mirrorPath } from '../kit/mirror.mjs';
import { twDay } from '../kit/format.mjs';
import { LAST_SEASON } from './season.js';

// A kept copy's key back to the address it was read from: { url, trim }, or
// null when it doesn't read back to the same key (wiped by nothing).
export function keptUrl(key) {
  const m = /^mirror\/([^/]+)\/(.+?)(\.json)?\.json(\.gz)?$/.exec(key);
  if (!m) return null;
  const trim = m[1] === '_' ? '' : m[1];
  const rest = m[2];
  const cut = rest.lastIndexOf('/');
  let query = '';
  try {
    query = decodeURIComponent(rest.slice(cut + 1).replace(/~/g, '%'));
  } catch {}
  const ends = m[3] || '';
  for (const url of [...(query.includes('=') ? [`https://${rest.slice(0, cut)}${ends}?${query}`] : []), `https://${rest}${ends}`]) {
    try {
      if (`${mirrorPath(url, trim)}${m[4] || ''}` === key) return { url: new URL(url), trim };
    } catch {}
  }
  return null;
}

const ESPN_LEAGUE = Object.fromEntries(Object.entries(CATALOG).filter(([, l]) => l.espn).map(([k, l]) => [l.espn, k]));
const ASIA_LEAGUE = Object.fromEntries(Object.entries(CATALOG).filter(([, l]) => l.asia).map(([k, l]) => [l.asia, k]));
// The league a kept address is of ('' for none here).
export function keptLeague(url) {
  switch (url.hostname) {
    case 'site.api.espn.com': {
      const m = /\/sports\/([^/]+\/[^/]+)\//.exec(url.pathname);
      return (m && ESPN_LEAGUE[m[1]]) || '';
    }
    case 'statsapi.mlb.com':
      return 'mlb';
    case 'asia-baseball.orbit':
      return ASIA_LEAGUE[url.pathname.split('/')[1]] || '';
    case 'f1-live.orbit':
    case 'api.jolpi.ca':
      return 'f1';
    default:
      return '';
  }
}

// The day (Taiwan's) a kept copy is of, from its address or its data (a
// game's summary: its start), else ''.
export function keptDay(url, data) {
  const q = k => url.searchParams.get(k) || '';
  const dates = q('dates');
  if (/^\d{8}$/.test(dates)) return `${dates.slice(0, 4)}-${dates.slice(4, 6)}-${dates.slice(6)}`;
  if (/^\d{6}$/.test(dates)) return `${dates.slice(0, 4)}-${dates.slice(4, 6)}-28`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(q('date'))) return q('date');
  const start = Date.parse(q('start') || data?.header?.competitions?.[0]?.date || '');
  if (Number.isFinite(start)) return twDay(start);
  const month = /\/(\d{4}-\d{2})\.json$/.exec(url.pathname)?.[1];
  if (month) return `${month}-28`;
  const year = (/^\/ergast\/f1\/(\d{4})\b/.exec(url.pathname) || [])[1] || q('year');
  return /^\d{4}$/.test(year) ? `${year}-12-31` : '';
}

// Wiped: each kept copy from before its league's first askable day.
// `objects`: [{ key, uploaded, meta }] (R2's list), `bounds`: { league: { from } }.
export function toWipe(objects, bounds, now = Date.now()) {
  const old = twDay(now - 2 * LAST_SEASON);
  return objects
    .filter(({ key, uploaded, meta }) => {
      const read = keptUrl(key);
      if (!read) return false;
      const league = keptLeague(read.url);
      const day = meta?.day || keptDay(read.url) || (uploaded ? twDay(uploaded) : '');
      if (!day) return false;
      if (!league || !CATALOG[league]) return day < old;
      const from = bounds?.[league]?.from;
      return Boolean(from) && day < from;
    })
    .map(o => o.key);
}

export const KEPT_HOUR = 17;
export async function runKept({ store, now = Date.now(), dry = false }) {
  const bounds = (await store.json('sports/bounds.json'))?.leagues;
  if (!bounds) return { off: 'no bounds' };
  const objects = await store.objects('mirror/');
  const gone = toWipe(objects, bounds, now);
  if (!dry) await store.deleteMany(gone);
  const by = {};
  for (const k of gone) {
    const read = keptUrl(k);
    const l = keptLeague(read.url) || read.url.hostname;
    by[l] = (by[l] || 0) + 1;
  }
  return { kept: objects.length - gone.length, [dry ? 'wouldWipe' : 'wiped']: gone.length, by, ...(dry ? { sample: gone.slice(0, 20) } : {}) };
}
