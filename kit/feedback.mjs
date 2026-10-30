// What a recommendation list showed and what the person then opened from
// it, on the device, for every app's picks (Sports' 推薦, Securities' 為你推薦,
// Beats' 為你推薦…). Affinity (orbit.mjs) only hears what people do; this
// hears what they pass over too, so a pick shown day after day and never
// opened sinks, and one opened often rises, by its keys (a league, a team, a
// sector) as well as itself.
//
//   shown(app, items)        a list was on screen: [{ id, keys }] (each counted once per 6 h)
//   picked(app, item)        one of them was opened from the list
//   lift(app, item)          × on its score: about 0.5 (passed over) to 1.6 (opened often), 1 with nothing known
//   hitRate(app)             { shown, picked, rate }: how often a shown pick is opened (the last weeks)
//
// Counts decay with a 30-day half-life; the strongest 400 kept per app.
// `store` stands in for localStorage in tests.

const HALF = 30 * 86_400_000;
const ONCE = 6 * 3_600_000;
const KEEP = 400;
// A pick's usual chance of being opened, the prior every count starts from.
const PRIOR = { p: 1, s: 5 };
const MIN = 0.5;
const MAX = 1.6;

let store = globalThis.localStorage;
export const useStore = s => (store = s);
const keyOf = app => `orbit.fb.${app}`;
const read = app => {
  try {
    return JSON.parse(store?.getItem(keyOf(app)) || '{}') || {};
  } catch {
    return {};
  }
};
const write = (app, map, now) => {
  const kept = Object.entries(map)
    .filter(([k]) => k !== '_')
    .sort((a, b) => weight(b[1], now) - weight(a[1], now))
    .slice(0, KEEP);
  if (map._) kept.push(['_', map._]);
  try {
    store?.setItem(keyOf(app), JSON.stringify(Object.fromEntries(kept)));
  } catch {}
};
const fade = (v, t, now) => (v || 0) * 0.5 ** ((now - (t || now)) / HALF);
const weight = (x, now) => fade(x.s, x.t, now) + fade(x.p, x.t, now);
const bump = (map, k, field, now) => {
  const x = map[k] || { s: 0, p: 0, t: now };
  map[k] = { ...x, s: fade(x.s, x.t, now), p: fade(x.p, x.t, now), t: now, l: x.l };
  map[k][field] += 1;
  return map[k];
};
const all = item => [`id:${item.id}`, ...(item.keys || []).filter(Boolean)];

export function shown(app, items, now = Date.now()) {
  const map = read(app);
  let n = 0;
  for (const item of items || []) {
    if (!item?.id) continue;
    const x = map[`id:${item.id}`];
    if (x?.l && now - x.l < ONCE) continue;
    for (const k of all(item)) bump(map, k, 's', now);
    map[`id:${item.id}`].l = now;
    n++;
  }
  if (n) (bump(map, '_', 's', now).s += n - 1), write(app, map, now);
}

export function picked(app, item, now = Date.now()) {
  if (!item?.id) return;
  const map = read(app);
  // (Opened without having been counted as shown: it was, just now.)
  if (!map[`id:${item.id}`]) for (const k of all(item)) bump(map, k, 's', now);
  for (const k of all(item)) bump(map, k, 'p', now);
  bump(map, '_', 'p', now);
  write(app, map, now);
}

// The item's own count and its keys', each a ratio of its open rate to the
// usual one (counts shrunk toward the prior), averaged in logs; clamped.
export function lift(app, item, now = Date.now(), map = read(app)) {
  const base = rateOf(map._, now) ?? PRIOR.p / PRIOR.s;
  let sum = 0;
  let n = 0;
  for (const k of all(item)) {
    const x = map[k];
    if (!x) continue;
    const s = fade(x.s, x.t, now);
    if (s < 2) continue;
    const r = (fade(x.p, x.t, now) + PRIOR.p * base * PRIOR.s) / (s + PRIOR.s);
    // (The item itself counts double: it's the surest evidence.)
    const w = k.startsWith('id:') ? 2 : 1;
    sum += w * Math.log(r / base);
    n += w;
  }
  return n ? Math.min(MAX, Math.max(MIN, Math.exp(sum / n))) : 1;
}
// One read for a whole list: (item) → lift.
export const lifter = (app, now = Date.now()) => {
  const map = read(app);
  return item => lift(app, item, now, map);
};

const rateOf = (x, now) => {
  const s = fade(x?.s, x?.t, now);
  return s >= 10 ? Math.max(0.02, fade(x.p, x.t, now) / s) : null;
};
export function hitRate(app, now = Date.now()) {
  const x = read(app)._;
  const s = fade(x?.s, x?.t, now);
  const p = fade(x?.p, x?.t, now);
  return { shown: Math.round(s), picked: Math.round(p), rate: s ? p / s : null };
}
