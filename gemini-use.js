// Every Gemini call, one row each in D1 (STORE): when, which feature and
// model, Google's answer (200, 429…) and the tokens it reports. The admin
// panel's AI 今天, Google's day and the bill are all read from here.
//
// Why a log and not the usage meter (transit.js): the meter keeps counts in
// an isolate's memory and writes them 10 minutes later, read-add-write on one
// KV key. A Gemini call is rare (a few hundred a day), so an isolate that
// went quiet took its counts with it, and two isolates writing at once kept
// only one's: Law's and Money's calls mostly never reached the panel.
// A row a call is exact and costs one D1 write.
//
// Days: AI 今天 counts Taiwan's day (each feature's cap does); Google's
// own day and month (its per-day limits, its bill) run on Pacific time,
// summer time included: a day ends 15:00 or 16:00 in Taiwan.

const PT = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
// 'YYYY-MM-DD HH:MM' on Pacific time.
export function ptStamp(ms) {
  const p = Object.fromEntries(PT.formatToParts(new Date(ms)).map(x => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`;
}
export const ptDay = ms => ptStamp(ms).slice(0, 10);
export const twDay = ms => new Date(ms + 8 * 3_600_000).toISOString().slice(0, 10);
// When Google's day after `ms` begins (its daily limits start again).
export function ptNextDay(ms) {
  const day = ptDay(ms);
  // The next Pacific midnight is 21–25 hours of whole minutes away at most: step an hour, then a minute.
  let t = ms - (ms % 60_000);
  while (ptDay(t) === day) t += 3_600_000;
  while (ptDay(t - 60_000) !== day) t -= 60_000;
  return t;
}

const KEEP_DAYS = 70; // two of Google's months and the week before
const ready = new WeakSet();
async function table(env) {
  if (ready.has(env.STORE)) return;
  await env.STORE.prepare('CREATE TABLE IF NOT EXISTS gemini_call (at INTEGER NOT NULL, feature TEXT NOT NULL, model TEXT NOT NULL, status INTEGER NOT NULL, tin INTEGER NOT NULL, cached INTEGER NOT NULL, tout INTEGER NOT NULL)').run();
  await env.STORE.prepare('CREATE INDEX IF NOT EXISTS gemini_call_at ON gemini_call (at)').run();
  // (Rows past the keep go, once an isolate.)
  await env.STORE.prepare('DELETE FROM gemini_call WHERE at < ?1').bind(Date.now() - KEEP_DAYS * 86_400_000).run();
  ready.add(env.STORE);
}

// One call as Google answered it (usage: its usageMetadata, when it sent one).
export async function logCall(env, { feature, model, status, usage = null, at = Date.now() }) {
  if (!env?.STORE) return;
  const u = usage || {};
  const cached = u.cachedContentTokenCount ?? 0;
  const tin = Math.max(0, (u.promptTokenCount ?? 0) - cached);
  // (Thinking is billed as output.)
  const tout = (u.candidatesTokenCount ?? 0) + (u.thoughtsTokenCount ?? 0);
  try {
    await table(env);
    await env.STORE.prepare('INSERT INTO gemini_call (at, feature, model, status, tin, cached, tout) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)').bind(at, String(feature), String(model), status | 0, tin, cached, tout).run();
  } catch {
    // Counting must never affect the call it counts.
  }
}

// The calls since `since` (ms), oldest first.
export async function callsSince(env, since) {
  if (!env?.STORE) return [];
  await table(env);
  const { results } = await env.STORE.prepare('SELECT at, feature, model, status, tin, cached, tout FROM gemini_call WHERE at >= ?1 ORDER BY at').bind(since).all();
  return results || [];
}

// What the admin panel shows, from the calls:
// - ai: each feature's calls on each of the last 7 Taiwan days (refusals not counted: nothing was answered);
// - google: each model on Google's day so far (calls, the busiest minute, refusals) and when that day ends;
// - gemini / features: Google's month so far, tokens by model and day, and by feature (the bill).
export function summarize(calls, now = Date.now()) {
  const week = Array.from({ length: 7 }, (_, i) => twDay(now - (6 - i) * 86_400_000));
  const today = ptDay(now), month = today.slice(0, 7);
  const byFeature = {}, google = {}, gemini = {}, features = {};
  const minutes = {};
  for (const c of calls) {
    const ok = c.status === 200;
    const tw = twDay(c.at);
    if (ok && week.includes(tw)) ((byFeature[c.feature] ||= {})[tw] = (byFeature[c.feature]?.[tw] || 0) + 1);
    const stamp = ptStamp(c.at);
    if (stamp.slice(0, 10) === today) {
      const g = (google[c.model] ||= { calls: 0, refused: 0, peakMinute: 0 });
      if (c.status === 429) g.refused++;
      else {
        g.calls++;
        const k = `${c.model}|${stamp}`;
        minutes[k] = (minutes[k] || 0) + 1;
        if (minutes[k] > g.peakMinute) g.peakMinute = minutes[k];
      }
    }
    if (ok && stamp.slice(0, 7) === month) {
      const d = ((gemini[c.model] ||= {})[stamp.slice(0, 10)] ||= { in: 0, cached: 0, out: 0 });
      d.in += c.tin;
      d.cached += c.cached;
      d.out += c.tout;
      const f = ((features[c.feature] ||= {})[c.model] ||= { in: 0, cached: 0, out: 0, n: 0 });
      f.in += c.tin;
      f.cached += c.cached;
      f.out += c.tout;
      f.n++;
    }
  }
  return { week, byFeature, google, googleDay: today, googleResets: ptNextDay(now), month, gemini, features };
}

// The calls the panel needs: the week before and Google's whole month.
export async function aiUse(env, now = Date.now()) {
  const monthStart = ptMonthStart(now);
  return summarize(await callsSince(env, Math.min(monthStart, now - 8 * 86_400_000)), now);
}
// When Google's month that holds `ms` began.
export function ptMonthStart(ms) {
  const month = ptDay(ms).slice(0, 7);
  // At most 32 days back, a day at a time, then a minute at a time inside the 1st's hour.
  let t = ms - (ms % 60_000);
  while (ptDay(t).slice(0, 7) === month) t -= 86_400_000;
  while (ptDay(t).slice(0, 7) !== month) t += 3_600_000;
  while (ptDay(t - 60_000).slice(0, 7) === month) t -= 60_000;
  return t;
}
