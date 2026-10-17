// ---- slip.js: /slip, Slip Tracker's door (jaypengx.github.io/Slip-Tracker) ----
// An independent page with no Quadra Pass, so its door is narrow and small:
// only its own origin (or a localhost page), only the Asian leagues' month
// lists (everything else it reads straight from ESPN), at most 3 addresses an
// ask, 6 asks a minute and 60 an hour an address (in memory), and 3,000 asks
// a day in all (counted in D1 a minute at a time per isolate: ~3% of the
// month's requests at most). Stopped altogether from the guard's pace 2.
import { checkedBatch } from './sports.js';
import { paceOf } from './pace.js';
import { sessionLimited } from './quadra-token.js';
import { json, LOCAL_ORIGIN } from './http.js';
import { ASIA_HOST } from './asia-baseball.js';

const ORIGIN = 'https://jaypengx.github.io';
const MAX_URLS = 3;
const PER_MINUTE = 6;
const PER_HOUR = 60;
export const DAY_CAP = 3000;
const ALLOWED = new RegExp(`^https://${ASIA_HOST.replace(/\./g, '\\.')}/(npb|kbo|cpbl)/\\d{4}-\\d{2}\\.json$`);
export const slipUrlAllowed = u => ALLOWED.test(u);

// The day's count: this isolate's asks since its last write, added to D1's at
// most once a minute (one row a day, Taiwan's day).
let day = { key: '', known: 0, pending: 0, at: 0 };
const twDay = (now = Date.now()) => new Date(now + 8 * 3_600_000).toISOString().slice(0, 10);
async function countDay(env, now = Date.now()) {
  const key = twDay(now);
  if (day.key !== key) day = { key, known: 0, pending: 0, at: 0 };
  day.pending++;
  if (env.STORE && now - day.at > 60_000) {
    day.at = now;
    const add = day.pending;
    day.pending = 0;
    try {
      await env.STORE.prepare('CREATE TABLE IF NOT EXISTS slip_day (day TEXT PRIMARY KEY, n INTEGER NOT NULL)').run();
      const row = await env.STORE.prepare('INSERT INTO slip_day (day, n) VALUES (?1, ?2) ON CONFLICT (day) DO UPDATE SET n = n + ?2 RETURNING n').bind(key, add).first();
      day.known = Number(row?.n) || day.known + add;
    } catch {
      day.pending += add;
    }
  }
  return day.known + day.pending;
}
export const forgetSlipDay = () => (day = { key: '', known: 0, pending: 0, at: 0 });

export async function handleSlip(request, env, ctx, headers, ip) {
  if (request.method !== 'GET') return json({ error: { message: 'GET only' } }, 405, headers);
  const origin = request.headers.get('Origin') || '';
  if (origin !== ORIGIN && !LOCAL_ORIGIN.test(origin)) return json({ error: { message: 'Forbidden' } }, 403, headers);
  const params = new URL(request.url).searchParams;
  const urls = params.getAll('u');
  if (!urls.length || urls.length > MAX_URLS || !urls.every(slipUrlAllowed)) return json({ error: { message: 'Not allowed' } }, 400, headers);
  if ((await paceOf(env)).pace >= 2) return json({ error: { message: 'Paused' } }, 503, headers);
  if (sessionLimited(`slip:m:${ip}`, PER_MINUTE) || sessionLimited(`slip:h:${ip}`, PER_HOUR, 3_600_000)) return json({ error: { message: 'Too many requests' } }, 429, headers);
  if ((await countDay(env)) > DAY_CAP) return json({ error: { message: 'Busy today' } }, 503, headers);
  const only = new URLSearchParams(urls.map(u => ['u', u]));
  return checkedBatch(request, env, ctx, headers, ip, only);
}
