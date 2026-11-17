// ---- tools/flight-pool.mjs: Orbit Class's 專注飛行 pool, built off Cloudflare ----
// Every routed airliner in the air now (flight.js buildPool), built where the
// plane sources answer: adsb.lol allows an address 500 asks a day and
// Cloudflare's addresses are shared (429 from Workers), adsb.fi refuses
// Workers (403), and neither lets a phone read it (no CORS). GitHub Actions
// runs this every ten minutes (.github/workflows/flight.yml) and writes
//
//   flight/pool.json    { at, flights }: what /flight?pool=1 answers
//   flight/routes.json  adsbdb's routes kept (found 3 days, none 1), so a run
//                       asks only for callsigns it hasn't seen: { v: 2,
//                       p: [place], a: [airline], r: { callsign: [minute,
//                       no, airline #, from #, to #] or [minute] (none) } }
//
// to R2 through the proxy's /data/push (DATA_PUSH_SECRET), each its own push.
// (Kept whole, each route with its places spelled out, routes.json reached
// 4.8 MB once the cron ran this every ten minutes, and a push that size went
// past the Free plan's CPU for a request: 503, every run failed and mailed
// Jay, 2026-11-17. Places and airlines named once, it is about a fifth.)
//
//   node tools/flight-pool.mjs [--dry]   (--dry: built and counted, nothing written)
import { buildPool, routeOf, LIMITS } from '../flight.js';

const API = (process.env.ORBIT_API || 'https://orbit-workers-proxy.pengzjay.workers.dev').replace(/\/$/, '');
const SECRET = process.env.DATA_PUSH_SECRET || '';
const DRY = process.argv.includes('--dry');
const UA = 'Orbit-Class/1.0 (+https://github.com/JayPengX/Orbit-Class)';
const FOUND_MS = 3 * 86_400_000;
const NONE_MS = 86_400_000;
const AT_ONCE = 6;
const NEW_MAX = 900;

const now = Date.now();
const t0 = Date.now();

async function readRoutes() {
  try {
    const r = await fetch(`${API}/data/flight/routes.json`, { headers: { 'User-Agent': UA } });
    const j = r.ok ? await r.json() : null;
    if (j?.v === 1 && j.r && typeof j.r === 'object') return j.r; // (the first run after v2; gone 11-24)
    return j?.v === 2 && j.r && typeof j.r === 'object' ? unpack(j) : {};
  } catch {
    return {};
  }
}
// routes.json v2: each place and airline written once, routes pointing at them.
function pack(kept) {
  const p = [];
  const a = [];
  const at = new Map();
  const ix = (list, v) => {
    const k = (list === p ? 'p' : 'a') + JSON.stringify(v);
    if (!at.has(k)) at.set(k, list.push(v) - 1);
    return at.get(k);
  };
  const r = {};
  for (const [cs, [t, route]] of Object.entries(kept)) {
    const min = Math.round(t / 60_000);
    r[cs] = route ? [min, route.no, ix(a, route.airline), ix(p, route.from), ix(p, route.to)] : [min];
  }
  return { v: 2, p, a, r };
}
function unpack({ p, a, r }) {
  const out = {};
  for (const [cs, [min, no, ai, fi, ti]] of Object.entries(r)) {
    const t = min * 60_000;
    if (no === undefined) out[cs] = [t, null];
    else if (p[fi] && p[ti] && a[ai]) out[cs] = [t, { no, airline: a[ai], from: p[fi], to: p[ti] }];
  }
  return out;
}
const kept = await readRoutes();
const fresh = ([t, route]) => now - t < (route ? FOUND_MS : NONE_MS);

// adsbdb asked a few at a time, each callsign once a run.
let running = 0;
let asked = 0;
let failed = 0;
const waiting = [];
const slot = () => (running < AT_ONCE ? (running++, Promise.resolve()) : new Promise(r => waiting.push(r)));
const free = () => (waiting.length ? waiting.shift()() : running--);
const asking = new Map();
async function lookup(cs) {
  if (kept[cs] && fresh(kept[cs])) return kept[cs][1];
  if (asking.has(cs)) return asking.get(cs);
  if (asked >= NEW_MAX) return null;
  asked++;
  const p = (async () => {
    await slot();
    try {
      const res = await fetch(`https://api.adsbdb.com/v0/callsign/${cs}`, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: AbortSignal.timeout(8000) });
      if (res.status === 404) {
        kept[cs] = [now, null];
        return null;
      }
      if (!res.ok) {
        failed++;
        return null;
      }
      const route = routeOf(await res.json());
      kept[cs] = [now, route];
      return route;
    } catch {
      failed++;
      return null;
    } finally {
      free();
    }
  })();
  asking.set(cs, p);
  return p;
}

const fetchFn = (url, opts = {}) => fetch(url, { ...opts, headers: { ...(opts.headers || {}), 'User-Agent': UA } });
const flights = await buildPool({ fetchFn, now, routes: lookup, budgetMs: 4 * 60_000 });
if (!flights) {
  console.error('flight pool: no plane source answered');
  process.exit(1);
}
// (Routes older than they're kept for go.)
for (const [cs, v] of Object.entries(kept)) if (!fresh(v)) delete kept[cs];

const files = {
  'flight/pool.json': JSON.stringify({ at: now, flights }),
  'flight/routes.json': JSON.stringify(pack(kept))
};
console.log(`flight pool: ${flights.length} planes; ${asked} routes asked (${failed} failed), ${Object.keys(kept).length} kept; ${((Date.now() - t0) / 1000).toFixed(1)} s; lookups cap ${LIMITS.lookups}`);

if (DRY) {
  console.log(`routes.json ${(files['flight/routes.json'].length / 1e6).toFixed(2)} MB, pool.json ${(files['flight/pool.json'].length / 1e6).toFixed(2)} MB`);
  process.exit(0);
}
if (!SECRET) {
  console.error('flight pool: no DATA_PUSH_SECRET');
  process.exit(1);
}

// data.js /data/push: frames of [u32 path length][path][u32 size][bytes].
function frame(path, text) {
  const p = Buffer.from(path);
  const b = Buffer.from(text);
  const head = Buffer.alloc(8 + p.length);
  head.writeUInt32BE(p.length, 0);
  p.copy(head, 4);
  head.writeUInt32BE(b.length, 4 + p.length);
  return Buffer.concat([head, b]);
}
async function push(path) {
  for (let tries = 0; ; tries++) {
    const r = await fetch(`${API}/data/push`, { method: 'POST', headers: { Authorization: `Bearer ${SECRET}`, 'Content-Type': 'application/octet-stream' }, body: frame(path, files[path]) }).catch(e => ({ ok: false, status: String(e) }));
    if (r.ok) return console.log('pushed', path, JSON.stringify(await r.json())), true;
    if (tries >= 3) return console.log(`::warning::flight pool: ${path} push ${r.status}`), false;
    await new Promise(res => setTimeout(res, 3000 * (tries + 1)));
  }
}
// (Routes first: the pool is the file that says a run finished. A push the
// proxy turns down ends the run green with a warning: the next run, ten
// minutes on, tries again, and a pool left an hour old is the cron's to
// report in the admin (flight.js keepPool), not a GitHub mail every run.)
await push('flight/routes.json');
await push('flight/pool.json');
