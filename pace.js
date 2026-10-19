// ---- pace.js: the month paced, as the bill's guard sets it ----
// guard.js projects each count to the end of the billing period and writes a
// pace (`guard:pace` in KV, only when it changes; 0 as configured … 3 the
// leanest). The proxy follows it:
//   - the live refreshes (GET /config, which every app and the data proxy
//     read) are slowed `slow` times, never past each one's own slowest;
//   - each session's reads a minute are `reads` of the usual;
//   - the builders that can wait (pace 1) or all of them (pace 2 and up), and
//     the hourly extras (Weather's scoring, the capacity check), are skipped.
// Read once a minute an isolate at most (KV's edge copy kept 5 minutes).

import { PACE_KEY, PACES } from './guard.js';

let memo = { at: 0, v: null };
export async function paceOf(env, now = Date.now()) {
  if (memo.v && now - memo.at < 60_000) return memo.v;
  let got = null;
  try {
    got = env.RATE_LIMIT_KV ? await env.RATE_LIMIT_KV.get(PACE_KEY, { type: 'json', cacheTtl: 300 }) : null;
  } catch {}
  const pace = Math.max(0, Math.min(PACES.length - 1, Number(got?.pace) || 0));
  memo = { at: now, v: { ...PACES[pace], pace, since: got?.at || null } };
  return memo.v;
}
// (Tests: forget what was read.)
export const forgetPace = () => (memo = { at: 0, v: null });

// The builders that run at a pace: none past 1; at 1 only what phones would miss.
// (Not 'play': Play's board only hastens what a phone can read itself, so it waits.)
export const KEEP_AT_PACE_1 = new Set(['watch', 'asia', 'cpbl', 'sports']);
export const builderAllowed = (pace, name) => pace === 0 || (pace === 1 && KEEP_AT_PACE_1.has(name));
