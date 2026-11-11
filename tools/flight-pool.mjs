// ---- tools/flight-pool.mjs: Orbit Class's 專注飛行 pool, built off Cloudflare ----
// Every routed airliner in the air now (flight.js buildPool), built where the
// plane sources answer: adsb.lol allows an address 500 asks a day and
// Cloudflare's addresses are shared (429 from Workers), adsb.fi refuses
// Workers (403), and neither lets a phone read it (no CORS). GitHub Actions
// runs this every ten minutes (.github/workflows/flight.yml) and writes
//
//   flight/pool.json    { at, flights }: what /flight?pool=1 answers
//   flight/routes.json  { v, r: { callsign: [time, route | null] } }: adsbdb's
//                       routes kept (found 3 days, none 1), so a run asks
//                       only for callsigns it hasn't seen
//
// to R2 through the proxy's /data/push (DATA_PUSH_SECRET).
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
    return j?.v === 1 && j.r && typeof j.r === 'object' ? j.r : {};
  } catch {
    return {};
  }
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
  'flight/routes.json': JSON.stringify({ v: 1, r: kept })
};
console.log(`flight pool: ${flights.length} planes; ${asked} routes asked (${failed} failed), ${Object.keys(kept).length} kept; ${((Date.now() - t0) / 1000).toFixed(1)} s; lookups cap ${LIMITS.lookups}`);
if (DRY) process.exit(0);
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
// (routes first: the pool is the file that says a run finished.)
const body = Buffer.concat([frame('flight/routes.json', files['flight/routes.json']), frame('flight/pool.json', files['flight/pool.json'])]);
for (let tries = 0; ; tries++) {
  const r = await fetch(`${API}/data/push`, { method: 'POST', headers: { Authorization: `Bearer ${SECRET}`, 'Content-Type': 'application/octet-stream' }, body }).catch(e => ({ ok: false, status: String(e) }));
  if (r.ok) {
    console.log('pushed', JSON.stringify(await r.json()));
    break;
  }
  if (tries >= 3) {
    console.error(`flight pool: push ${r.status}`);
    process.exit(1);
  }
  await new Promise(res => setTimeout(res, 3000 * (tries + 1)));
}
