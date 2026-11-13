// ---- cal.js ----
// Orbit Class's 加到行事曆 (Jay 2026-11-10): the timetable as a calendar
// the phone's own Calendar subscribes to (webcal://), so classes show there,
// on the lock screen and in Siri, and follow every change.
//
// The phone makes the calendar (it alone knows the timetable, holidays, 調課
// and odd/even weeks: src/calendar.js) and hands it here when it changes;
// this only keeps it and hands it out. No timetable is read or worked out
// here (a few KV reads and writes, no CPU to speak of).
//
//   POST   /cal  (Orbit Class's session)  { ics }  → { url }   kept, its address made once
//   POST   /cal  { off: true } (or DELETE)           → { ok }   the address stops answering
//   GET    /cal/<token>.ics  (anyone holding the address: the Calendar app)
//
// KV: `cal:who:<hash of the pass>` → the token; `cal:<token>` → the calendar,
// kept 60 days from its last upload (the app sends it again at least weekly).
import { keptText, keptPut, keptDelete } from './kept-store.js';
import { json, isAllowedOrigin, bodyText, sha256Hex } from './http.js';
import { sessionLimited } from './orbit-token.js';

export const CAL_MAX = 400_000;
export const CAL_KEEP_S = 60 * 86_400;
const passOfClass = session => (session?.a === 'orbit' && typeof session.d === 'string' && session.d ? session.d : null);
const newToken = () => [...crypto.getRandomValues(new Uint8Array(18))].map(b => 'abcdefghijkmnpqrstuvwxyz23456789'[b % 32]).join('');

export async function handleCal(request, env, headers, session, path) {
  // (Kept in D1 since 2026-11-13, kept-store.js: KV's Free plan takes 1,000 writes a day.)
  if (!env.RATE_LIMIT_KV && !env.DATA) return json({ error: 'setup' }, 503, headers);
  const m = /^\/cal\/([a-z2-9]{18})\.ics$/.exec(path);
  if (m) {
    if (request.method !== 'GET' && request.method !== 'HEAD') return json({ error: 'method' }, 405, headers);
    const ics = await keptText(env, `cal:${m[1]}`);
    if (!ics) return new Response('', { status: 404 });
    return new Response(request.method === 'HEAD' ? null : ics, { headers: { 'Content-Type': 'text/calendar; charset=utf-8', 'Cache-Control': 'private, max-age=900' } });
  }
  if (path !== '/cal') return json({ error: 'not found' }, 404, headers);
  if (!isAllowedOrigin(request.headers.get('Origin') || '')) return json({ error: 'origin' }, 403, headers);
  const pass = passOfClass(session);
  if (!pass) return json({ error: 'signin' }, 401, headers);
  if (sessionLimited(`cal:${pass}`, 6)) return json({ error: 'busy' }, 429, headers);
  const whoKey = `cal:who:${(await sha256Hex(`cal|${pass}`)).slice(0, 32)}`;
  const token = await keptText(env, whoKey);
  if (request.method === 'DELETE') {
    if (token) await Promise.all([keptDelete(env, `cal:${token}`), keptDelete(env, whoKey)]);
    return json({ ok: true }, 200, headers);
  }
  if (request.method !== 'POST') return json({ error: 'method' }, 405, headers);
  const text = await bodyText(request, CAL_MAX + 1000);
  let body = null;
  try {
    body = JSON.parse(text || 'null');
  } catch {}
  if (body?.off === true) {
    if (token) await Promise.all([keptDelete(env, `cal:${token}`), keptDelete(env, whoKey)]);
    return json({ ok: true }, 200, headers);
  }
  const ics = body?.ics;
  if (typeof ics !== 'string' || ics.length > CAL_MAX || !ics.startsWith('BEGIN:VCALENDAR') || !ics.trimEnd().endsWith('END:VCALENDAR')) return json({ error: 'ics' }, 400, headers);
  const t = token || newToken();
  await keptPut(env, `cal:${t}`, ics, CAL_KEEP_S, { raw: true });
  if (!token) await keptPut(env, whoKey, t, 10 * 365 * 86_400, { raw: true });
  return json({ url: `/cal/${t}.ics` }, 200, headers);
}
