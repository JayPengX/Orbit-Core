// ---- law-live.js: GET /law-live, what 立法院's IVOD streams right now ----
// Orbit Law's 議程 marks a meeting 直播中 and plays it only on IVOD's own
// word. IVOD's live list can't be read from a page (no CORS, and a TLS setup
// that needs legacy renegotiation), so the proxy reads it here, on demand:
// the list (a csrf token from /Live, then /Live/FetchCommInfo), and each
// streaming meeting's player page for its channel. Kept 60 s at the edge,
// so a colo asks IVOD at most once a minute however many read it; nothing
// stored, no cron. (Until 2026-11-01 a GitHub workflow wrote this to the
// repo's `live` branch every 90 s.)
//   → { at, rooms: [{ unit, time, place, status, title, ch }] }
import { json } from './http.js';

const IVOD = 'https://ivod.ly.gov.tw';
const UA = 'Mozilla/5.0 (Orbit Law)';
export const LIVE_TTL = 60;
const KEY = 'https://orbit-law-live.orbit/v1';
// The last good read kept 30 minutes at the edge too, so a fresh isolate can still
// answer it while IVOD fails (the old live.json file always held one).
const KEY_LAST = 'https://orbit-law-live.orbit/v1-last';

// IVOD's live list (/Live/FetchCommInfo, HTML): one row per meeting today,
// under its unit's heading: [{ unit, time, place, status, title, single }].
// `single` is the meeting's player page (/Live/Single/...), there only while it streams.
export function ivodLive(html) {
  const out = [];
  for (const block of String(html).split('<div class="live-list">').slice(1)) {
    const unit = (block.match(/<h2>[^]*?<\/i>\s*([^<]+?)\s*<\/h2>/) || [])[1] || '';
    for (const li of block.split('<li>').slice(1)) {
      const pick = re => ((li.match(re) || [])[1] || '').trim();
      out.push({
        unit,
        time: pick(/class="time">([^<]+)</),
        place: pick(/class="place">([^<]+)</),
        status: pick(/class="status"[^>]*>([^<]+)</),
        title: pick(/class="metdec"\s+title="([^"]+)"/),
        single: pick(/href="(\/Live\/Single\/[^"]+)"/)
      });
    }
  }
  return out;
}

// IVOD now: its list and each streaming meeting's channel.
export async function readLive(fetchFn = fetch, now = Date.now()) {
  let cookie = '';
  const get = async (path, init = {}) => {
    const res = await fetchFn(IVOD + path, { ...init, headers: { 'User-Agent': UA, ...(cookie ? { Cookie: cookie } : {}), ...(init.headers || {}) }, signal: AbortSignal.timeout(15_000) });
    const set = res.headers.getSetCookie?.() || [res.headers.get('set-cookie')].filter(Boolean);
    if (set.length) cookie = set.map(c => c.split(';')[0]).join('; ');
    if (!res.ok) throw new Error(`ivod ${path} ${res.status}`);
    return res.text();
  };
  const token = ((await get('/Live')).match(/name="csrf-token" content="([^"]+)"/) || [])[1];
  if (!token) throw new Error('ivod: no csrf token');
  const list = await get('/Live/FetchCommInfo', { method: 'POST', body: 'type=all', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-CSRF-TOKEN': token, 'X-Requested-With': 'XMLHttpRequest' } });
  const rooms = await Promise.all(
    ivodLive(list).map(async ({ single, ...row }) => ({
      ...row,
      title: row.title.slice(0, 160),
      ch: single ? Number(((await get(single).catch(() => '')).match(/embedd\.php\?id=(\d+)/) || [])[1]) || null : null
    }))
  );
  return { at: new Date(now).toISOString(), rooms };
}

// The last good read in this isolate: answered when IVOD fails (its `at`
// says how old; the app calls a read over 30 minutes old not live).
let last = null;
let pending = null;

// (worker.js lets in GET from our pages and local ones only.)
export async function handleLawLive(ctx, headers, { fetchFn = fetch, cache = typeof caches !== 'undefined' ? caches.default : null } = {}) {
  const out = body => json(body, 200, { ...headers, 'Cache-Control': `public, max-age=${LIVE_TTL}` });
  const hit = cache && (await cache.match(KEY).catch(() => null));
  if (hit) return out(await hit.json());
  try {
    const body = await (pending ||= readLive(fetchFn).finally(() => (pending = null)));
    last = body;
    if (cache) {
      const keep = (k, age) => cache.put(k, new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${age}` } }));
      ctx?.waitUntil?.(Promise.all([keep(KEY, LIVE_TTL), keep(KEY_LAST, 1800)]).catch(() => {}));
    }
    return out(body);
  } catch (e) {
    console.log('law-live', String(e?.message || e).slice(0, 160));
    const kept = last || (cache && (await cache.match(KEY_LAST).then(r => r?.json()).catch(() => null)));
    return kept ? out(kept) : json({ error: 'upstream' }, 502, headers);
  }
}
