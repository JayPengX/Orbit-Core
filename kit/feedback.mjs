// One engine for every app's picks (Sports' 推薦, Securities' 為你推薦, Law's
// 為你推薦, Beats' 為你推薦 and 為你電台, Transit's 建議): what a list showed,
// what the person opened (from it or from anywhere in the app) and what they
// did (followed, kept, traded), learnt as one weight per key, so a pick that
// keeps being passed over sinks and one opened rises, by its keys (a team, a
// league, a sector, a topic, a groove) as well as itself, and a new pick of
// the same team or sector starts where its keys stand.
//
//   shown(app, items, now)            a list on screen, in its order: [{ id, keys }]
//   picked(app, item, now, { from })  one opened: from the list ('list') or anywhere else ('elsewhere')
//   passed(app, item, now, { weight }) one turned down there and then (a song skipped, a card closed)
//   did(app, keys, weight, now)       a strong act about these keys (a follow, a ♡, a trade)
//   scorer(app, now, { explore, sure }) item → its weight in log-odds (0: nothing known; +1: about
//                                     2.7× as likely to be opened as the usual pick); `sure`: as
//                                     low as it may well be (a groove heard once by luck isn't one
//                                     heard ten times), `explore`: a day's draw of what it might be
//   whyOf(app, now, { min, evidence }) item → the key it's picked for, when the person's own doing
//                                     says so strongly enough (a 常看), else null
//   lifter(app, now, { explore })     item → × on a score (0.4–2.5; the kit's rank() takes it)
//   hitRate(app, now)                 { shown, picked, rate, top }: of the lists on screen, the share
//                                     the person opened one from (and its first), the last weeks
//   useWallet(app, wallet, now)       the Pass's copy (settings `fb:<app>`) merged in: another
//                                     phone's learning, a new phone starting where the last left
//   syncDue(app, now)                 a wallet patch with what's learnt, when it's moved since the
//                                     last one (at most every 15 minutes); null otherwise
//   keep(q, app)                      both for an app's session (orbitSession's q): the Pass's copy
//                                     merged as the wallet comes, this phone's written soon after
//                                     a pick or an act
//
// The model: the chance a shown pick is opened is a logistic of the usual
// chance plus its keys' weights; each weight is a mean and a confidence,
// moved by every pick shown (half a day unopened is a pass-over, counted
// less the further down the list it sat, since a pick far down is seldom
// looked at) and every one opened, and fading back to nothing known with a
// 30-day half-life, so it follows what the person does now. With
// `explore`, a key's weight is drawn from what it might be (the same draw all
// day): keys seldom tried get a turn now and then instead of never.
// `store` stands in for localStorage in tests.

const DAY = 86_400_000;
const HALF = 30 * DAY;
// A list drawn again within this counts once; a pick not opened within PASS was passed over.
const ONCE = 6 * 3_600_000;
const PASS = 12 * 3_600_000;
const KEEP = 400;
const SYNC_KEYS = 40;
const SYNC_EVERY = 15 * 60_000;
const SYNC_SIZE = 3400;
// The usual chance a shown pick is opened, before anything is known (log-odds of 1 in 5).
const BASE = Math.log(0.2 / 0.8);
// How sure a key's weight is with nothing known (a standard deviation of 1 in log-odds).
const PRIOR = 1;
const CAP = 4;
// The most a pick's weight multiplies (or divides) a list's score by.
const LIFT_MAX = 2.5;
// The chance a pick at place i of a list was looked at (the first nearly always).
export const looked = i => 1 / (1 + 0.25 * Math.max(0, i || 0));

let store = globalThis.localStorage;
export const useStore = s => (store = s);
const keyOf = app => `orbit.fb.${app}`;
const sig = x => 1 / (1 + Math.exp(-x));
const fade = (t, now) => 0.5 ** (Math.max(0, now - (t || now)) / HALF);
const round = (x, d = 3) => Math.round(x * 10 ** d) / 10 ** d;

// A weight as of now: [mean, confidence gained, when] faded toward nothing known.
function now_([m, q, t] = [0, 0, 0], now, m0 = 0) {
  const f = fade(t, now);
  return [m0 + (m - m0) * f, q * f, now];
}
const empty = () => ({ v: 2, b: [BASE, 0, 0], k: {}, s: {}, o: {}, h: [0, 0, 0, 0], n: 0 });

// The first engine's counts ({ key: { s, p, t } }, '_' the whole list's) as weights, once.
function fromOld(old) {
  const st = empty();
  const all = old._;
  const rate = all?.s >= 10 ? Math.min(0.9, Math.max(0.02, all.p / all.s)) : 0.2;
  st.b = [Math.log(rate / (1 - rate)), Math.min(20, (all?.s || 0) * rate * (1 - rate)), all?.t || 0];
  for (const [k, x] of Object.entries(old)) {
    if (k === '_' || !x || !(x.s >= 1)) continue;
    const r = (x.p + 0.2) / (x.s + 1);
    st.k[k] = [round(Math.max(-2, Math.min(2, Math.log(r / (1 - r)) - st.b[0]))), round(x.s * rate * (1 - rate)), x.t || 0];
  }
  return st;
}
function read(app) {
  try {
    const raw = JSON.parse(store?.getItem(keyOf(app)) || 'null');
    if (!raw) return empty();
    if (raw.v === 2) return { ...empty(), ...raw };
    return fromOld(raw);
  } catch {
    return empty();
  }
}
function write(app, st, now) {
  const kept = Object.entries(st.k)
    .map(([k, w]) => [k, now_(w, now)])
    .filter(([, w]) => w[1] > 0.01 || Math.abs(w[0]) > 0.01)
    .sort((a, b) => b[1][1] - a[1][1])
    .slice(0, KEEP)
    .map(([k, [m, q, t]]) => [k, [round(m), round(q), t]]);
  st.k = Object.fromEntries(kept);
  for (const [id, x] of Object.entries(st.s)) if (now - x[0] > 2 * PASS) delete st.s[id];
  for (const [id, t] of Object.entries(st.o)) if (now - t > ONCE) delete st.o[id];
  try {
    store?.setItem(keyOf(app), JSON.stringify(st));
  } catch {}
}

// One look at a pick: y 1 opened, 0 passed over; `e` how much it counts.
// Each key's weight moves by how surprising that was, less the surer it is.
function learn(st, keys, y, e, now, { base = true } = {}) {
  const ks = [...new Set(keys.filter(Boolean))];
  st.b = now_(st.b, now, BASE);
  for (const k of ks) st.k[k] = now_(st.k[k], now);
  const z = st.b[0] + ks.reduce((s, k) => s + st.k[k][0], 0);
  const p = sig(z);
  const g = y - p;
  const v = p * (1 - p);
  if (base) {
    st.b[1] += e * v;
    st.b[0] += (e * g) / (PRIOR + st.b[1]);
  }
  for (const k of ks) {
    const w = st.k[k];
    w[1] += e * v;
    w[0] = Math.max(-CAP, Math.min(CAP, w[0] + (e * g) / (PRIOR + w[1])));
  }
}
const allKeys = item => [`id:${item.id}`, ...(item.keys || [])];

// What's been on screen half a day without being opened: passed over.
function settle(st, now) {
  for (const [id, x] of Object.entries(st.s)) {
    if (now - x[0] < PASS || x[3]) continue;
    learn(st, [`id:${id}`, ...x.slice(4)], 0, looked(x[1]), x[0] + PASS);
    x[3] = 1;
  }
}
const scoreboard = (st, now) => {
  const f = fade(st.h[3], now);
  st.h = [st.h[0] * f, st.h[1] * f, st.h[2] * f, now];
  return st.h;
};

export function shown(app, items, now = Date.now()) {
  const st = read(app);
  settle(st, now);
  const view = ++st.n;
  let fresh = 0;
  (items || []).forEach((item, i) => {
    if (!item?.id) return;
    const had = st.s[item.id];
    // (Drawn again within hours, or opened just now: the same look.)
    if ((had && now - had[0] < ONCE) || st.o[item.id]) return;
    st.s[item.id] = [now, i, view, 0, ...(item.keys || []).filter(Boolean)];
    fresh++;
  });
  if (!fresh) return;
  scoreboard(st, now)[0] += 1;
  write(app, st, now);
}

export function picked(app, item, now = Date.now(), { from = 'list' } = {}) {
  if (!item?.id) return;
  const st = read(app);
  settle(st, now);
  const was = st.s[item.id];
  // From the list it was shown in: that look was an open.
  if (was && !was[3]) {
    learn(st, allKeys(item), 1, 1, now);
    was[3] = 1;
    const h = scoreboard(st, now);
    const view = was[2];
    if (!Object.values(st.s).some(x => x !== was && x[2] === view && x[3] === 2)) {
      h[1] += 1;
      if (was[1] === 0) h[2] += 1;
    }
    was[3] = 2;
  } else if (from === 'list' && !was) {
    // Taken from a list there and then, never noted as shown (a radio's song
    // heard through): a look and an open.
    learn(st, allKeys(item), 1, 1, now);
  } else if (!st.o[item.id]) {
    // Found elsewhere (another tab, a search): it says what they're into,
    // as an act would, not how good the list was.
    learn(st, allKeys(item), 1, 0.6, now, { base: false });
  }
  st.o[item.id] = now;
  write(app, st, now);
  kept[app]?.();
}

export function passed(app, item, now = Date.now(), { weight = 1 } = {}) {
  if (!item?.id || !(weight > 0)) return;
  const st = read(app);
  settle(st, now);
  const was = st.s[item.id];
  if (was && !was[3]) was[3] = 1;
  learn(st, allKeys(item), 0, weight, now);
  write(app, st, now);
  kept[app]?.();
}

export function did(app, keys, weight = 1, now = Date.now()) {
  const ks = [].concat(keys).filter(Boolean);
  if (!ks.length || !(weight > 0)) return;
  const st = read(app);
  learn(st, ks, 1, weight, now, { base: false });
  write(app, st, now);
  kept[app]?.();
}

// A key's draw for the day: its mean, or with `explore` a value it might be
// (sd shrinking as it's seen more), the same all day.
function hash01(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return ((h >>> 0) + 0.5) / 2 ** 32;
}
const normal = text => Math.sqrt(-2 * Math.log(hash01(`${text}:a`))) * Math.cos(2 * Math.PI * hash01(`${text}:b`));
const twDay = now => new Date(now + 8 * 3_600_000).toISOString().slice(0, 10);

export function scorer(app, now = Date.now(), { explore = 0, sure = 0 } = {}) {
  const st = read(app);
  const day = twDay(now);
  const memo = new Map();
  const weight = k => {
    if (memo.has(k)) return memo.get(k);
    const [m, q] = st.k[k] ? now_(st.k[k], now) : [0, 0];
    const sd = 1 / Math.sqrt(PRIOR + q);
    const v = m + (explore ? explore * normal(`${k}:${day}`) * sd : 0) - sure * sd;
    memo.set(k, v);
    return v;
  };
  return item => (item?.id || item?.keys?.length ? round(allKeys(item || {}).reduce((s, k) => s + weight(k), 0)) : 0);
}

// The key a pick is the person's for: the strongest weight of its keys that's
// at least `min` (in log-odds) and seen at least `evidence` worth (a few
// opens); `evidence` may be a function of the key (a league asks more than a team).
export function whyOf(app, now = Date.now(), { min = 0.6, evidence = 1 } = {}) {
  const st = read(app);
  const need = typeof evidence === 'function' ? evidence : () => evidence;
  return item => {
    let best = null;
    let top = min;
    for (const k of item?.keys || []) {
      if (!st.k[k]) continue;
      const [m, q] = now_(st.k[k], now);
      if (m >= top && q >= need(k)) [best, top] = [k, m];
    }
    return best;
  };
}

export const lift = (app, item, now = Date.now()) => lifter(app, now)(item);
export function lifter(app, now = Date.now(), opts = {}) {
  const score = scorer(app, now, opts);
  return item => Math.min(LIFT_MAX, Math.max(1 / LIFT_MAX, Math.exp(score(item))));
}

export function hitRate(app, now = Date.now()) {
  const st = read(app);
  const [shown, picked, top] = scoreboard(st, now);
  // (Counts fade with the weights: a ratio once there's any list at all.)
  const any = shown > 0.1;
  return { shown: Math.round(shown), picked: Math.round(picked), rate: any ? round(Math.min(1, picked / shown)) : null, top: any ? round(Math.min(1, top / shown)) : null };
}

// ---- On the Pass: the strongest weights and the scoreboard, merged by evidence ----

export function syncValue(app, now = Date.now()) {
  const st = read(app);
  const k = Object.entries(st.k)
    .map(([key, w]) => [key, now_(w, now)])
    .filter(([, w]) => w[1] >= 0.05)
    .sort((a, b) => b[1][1] - a[1][1])
    .slice(0, SYNC_KEYS)
    .map(([key, [m, q]]) => [key, [round(m, 2), round(q, 2)]]);
  // (A setting holds 4000 characters at most: the weakest go first.)
  while (k.length && JSON.stringify(k).length > SYNC_SIZE) k.pop();
  const [m, q] = now_(st.b, now, BASE);
  const h = scoreboard(st, now).slice(0, 3).map(x => round(x, 1));
  return { t: now, b: [round(m, 2), round(q, 2)], k: Object.fromEntries(k), h };
}
export function useWallet(app, wallet, now = Date.now()) {
  const got = wallet?.settings?.[`fb:${app}`]?.value;
  if (!got?.k || !(got.t > 0)) return false;
  const st = read(app);
  const theirs = ([m, q], m0 = 0) => now_([m, q, got.t], now, m0);
  let moved = false;
  for (const [k, w] of Object.entries(got.k)) {
    const mine = st.k[k] ? now_(st.k[k], now) : null;
    const t = theirs(w);
    if (!mine || t[1] > mine[1] + 0.01) (st.k[k] = t), (moved = true);
  }
  if (got.b) {
    const t = theirs(got.b, BASE);
    if (t[1] > now_(st.b, now, BASE)[1] + 0.01) (st.b = t), (moved = true);
  }
  const h = scoreboard(st, now);
  const f = fade(got.t, now);
  (got.h || []).forEach((x, i) => (h[i] = Math.max(h[i], x * f)));
  if (moved) write(app, st, now);
  return moved;
}
const lastSync = {};
const kept = {};
export function syncDue(app, now = Date.now()) {
  if (now - (lastSync[app]?.at || 0) < SYNC_EVERY) return null;
  const value = syncValue(app, now);
  if (!Object.keys(value.k).length) return null;
  const sig = JSON.stringify([value.k, value.b]);
  if (sig === lastSync[app]?.sig) return null;
  lastSync[app] = { at: now, sig };
  return { settings: { [`fb:${app}`]: { value, t: now } } };
}

export function keep(q, app) {
  if (!q || kept[app]) return;
  const merge = w => w && useWallet(app, w);
  merge(q.wallet);
  q.on?.('wallet', merge);
  let timer = 0;
  kept[app] = () => {
    clearTimeout(timer);
    // Soon after, or when the last write is 15 minutes old.
    const wait = Math.max(4000, (lastSync[app]?.at || 0) + SYNC_EVERY - Date.now());
    timer = setTimeout(() => {
      const patch = syncDue(app);
      // (Not live here just now: again after the next pick.)
      if (patch) q.write({ wallet: patch })?.catch?.(() => (lastSync[app] = null));
    }, wait);
  };
}
