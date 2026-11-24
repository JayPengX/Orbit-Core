// ---- kit/family.mjs: the family's notebook (Jay 11-10: apps working together) ----
// Every app lives on one origin (orbit.jaypengx.com), so in a browser and
// inside Orbit they share localStorage: each app writes down here the few
// facts the others can use, and reads theirs. A fact is the app's own (only
// it writes it), stamped with when, so a reader can tell an old one.
// Reading never changes another app's data. Separate home-screen apps on an
// iPhone each keep their own storage, so the notebook also goes to the
// account's Pass (Jay 11-13, one account in many places): each fact told is
// sent up by the app's session (the `orbit-family` event, kit orbit.mjs),
// and the Pass's copy is merged in at each sign-in and return (`mergeHeard`),
// newer per fact. The facts are the person's own, already in their apps' data.
//
//   tell(app, key, value)            this app's fact ('weather', 'rain', {...})
//   heard(app, key, { maxAge })      another's fact, or null (too old, never told)
//
// The facts each app tells (keep this list current; Jay 11-24 cut the thin
// ones and every button into another app: 車資記帳, Class in 我的行程, News
// lifted by the family, 下課背五個, 今天, 去球場, 出門時間 and the places, 看法案,
// a bill's 新聞, 持股新聞):
//   weather.rain    { places: [{ lat, lon, wet: [[from, to]] }] } where rain is due in the next 12 hours (ms; the
//                   radar's shower, then hours at 50%+), Transit's 下雨改搭車

const KEY = 'orbit.family.v1';
const read = () => {
  try {
    return JSON.parse(globalThis.localStorage?.getItem(KEY) || 'null') || {};
  } catch {
    return {};
  }
};
const write = all => {
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(all));
  } catch {}
};

export function tell(app, key, value, now = Date.now()) {
  const all = read();
  const was = all[`${app}.${key}`];
  if (was && JSON.stringify(was.v) === JSON.stringify(value)) {
    // (The same fact: only its time moves, at most once an hour: no write churn.)
    if (now - was.at < 3_600_000) return;
  }
  const fact = { v: value, at: now };
  all[`${app}.${key}`] = fact;
  write(all);
  // (To the Pass, by this page's session: the separate apps hear it too.)
  try {
    globalThis.dispatchEvent?.(new CustomEvent('orbit-family', { detail: { [`${app}.${key}`]: fact } }));
  } catch {}
}
// The Pass's notebook ({ 'app.key': { v, at } }) merged into this phone's,
// the newer fact winning (an older one never over a newer); → the facts
// newer here than there, to send up.
export function mergeHeard(theirs) {
  if (!theirs || typeof theirs !== 'object') return {};
  const all = read();
  let changed = false;
  for (const [k, f] of Object.entries(theirs)) {
    if (!f || !(f.at > 0) || f.v === undefined || (all[k] && all[k].at >= f.at)) continue;
    if (f.v === null) delete all[k];
    else all[k] = { v: f.v, at: f.at };
    changed = true;
  }
  if (changed) write(all);
  const up = {};
  for (const [k, f] of Object.entries(all)) if (f && f.at > 0 && !(theirs[k]?.at >= f.at)) up[k] = f;
  return up;
}
export function heard(app, key, { maxAge = Infinity, now = Date.now() } = {}) {
  const f = read()[`${app}.${key}`];
  return f && now - f.at <= maxAge ? f.v : null;
}
