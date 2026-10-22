// Typhoon days off (停班停課), as 人事行政總處 announces them, for every app
// that plans a school, work or trading day, each by the place that decides
// it for that app:
//   - Orbit Class: classes, at the school's township (停課; a few schools'
//     own lines are theirs alone);
//   - Weather's and Transit's weekday places (school, work): that place's
//     township, 停課 for a school, 停班 for the rest;
//   - Orbit Securities: the exchange, by 臺北市 (TWSE closes when Taipei
//     stops work for the morning or the day; an afternoon stop trades on).
// The Worker reads the page every 3 minutes (GET /weather/dayoff); here each
// place's answer is kept 3 minutes in memory and the browser (one origin for
// every app, so a place one app knows, another can use).
//
//   TWSE                          the exchange's place
//   dayOffOn(date, place, need)   { zh, en, from } on that Taiwan day, else null
//                                 (need: 'class' | 'work' | 'trade'; from: 'HH:MM' or null, the whole day)
//   loadDayOff(place)             asks now (dayOffOn asks by itself when its copy is old)
//   onDayOff(fn)                  fn() when a place's answer changes (redraw)
//   setPlace(role, place) / placeOf(role)   a person's places (role: 'school' | 'work' | 'home'),
//                                 { county, town } or { lat, lon }, shared by the apps
//
// A place: { county, town? } or { lat, lon }. Nothing known, or the Worker
// unreachable: no typhoon day (the national calendar still holds).

const URL_ = 'https://orbit-workers-proxy.pengzjay.workers.dev/weather/dayoff';
const FRESH_MS = 3 * 60_000;
const KEEP_MS = 2 * 86_400_000;
const STORE = 'q-dayoff';
const PLACES = 'q-dayoff-places';

export const TWSE = Object.freeze({ county: '臺北市' });

const store = typeof localStorage === 'undefined' ? null : localStorage;
const read = k => {
  try {
    return JSON.parse(store?.getItem(k) || 'null');
  } catch {
    return null;
  }
};
const write = (k, v) => {
  try {
    store?.setItem(k, JSON.stringify(v));
  } catch {}
};

const tai = s => String(s || '').replace(/台/g, '臺');
export function placeKey(p) {
  if (!p) return null;
  if (p.county) return `${tai(p.county)}|${tai(p.town || '')}`;
  if (Number.isFinite(p.lat) && Number.isFinite(p.lon)) return `${p.lat.toFixed(2)},${p.lon.toFixed(2)}`;
  return null;
}

// key → { at (when asked), days }
const cache = new Map(Object.entries(read(STORE) || {}).filter(([, v]) => v && Date.now() - v.at < KEEP_MS));
const asking = new Map();
const listeners = new Set();
export const onDayOff = fn => (listeners.add(fn), () => listeners.delete(fn));

// (For tests and a page that knows better: put an answer in.)
export function keepDayOff(place, days, at = Date.now()) {
  const k = placeKey(place);
  if (!k) return;
  const before = JSON.stringify(cache.get(k)?.days || {});
  cache.set(k, { at, days: days || {} });
  write(STORE, Object.fromEntries(cache));
  if (JSON.stringify(days || {}) !== before) for (const fn of listeners) fn();
}

export function loadDayOff(place, fetchFn = globalThis.fetch) {
  const k = placeKey(place);
  if (!k || typeof fetchFn !== 'function') return Promise.resolve(null);
  if (asking.has(k)) return asking.get(k);
  const q = place.county ? `county=${encodeURIComponent(tai(place.county))}${place.town ? `&town=${encodeURIComponent(tai(place.town))}` : ''}` : `lat=${place.lat}&lon=${place.lon}`;
  const p = fetchFn(`${URL_}?${q}`, { signal: AbortSignal.timeout?.(8000) })
    .then(r => (r.ok ? r.json() : null))
    .then(j => (j && j.days ? (keepDayOff(place, j.days), j.days) : null))
    .catch(() => null)
    .finally(() => asking.delete(k));
  asking.set(k, p);
  return p;
}

const twDate = t => new Date((typeof t === 'number' ? t : t instanceof Date ? t.getTime() : NaN) + 8 * 3_600_000).toISOString().slice(0, 10);
const dayOf = date => (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}/.test(date) ? date.slice(0, 10) : twDate(date));

const LABEL = {
  class: ['颱風停課', 'Typhoon: no school'],
  work: ['颱風停班', 'Typhoon: offices closed'],
  trade: ['颱風休市', 'Typhoon: market closed']
};
export function dayOffOn(date, place, need = 'work') {
  const k = placeKey(place);
  if (!k) return null;
  const hit = cache.get(k);
  // (Asked again in the background when old: a page, not a test or the Worker.)
  if (typeof window !== 'undefined' && (!hit || Date.now() - hit.at > FRESH_MS)) loadDayOff(place);
  let day;
  try {
    day = hit?.days?.[dayOf(date)];
  } catch {
    return null;
  }
  const said = day?.[need];
  if (!said?.off) return null;
  const [zh, en] = LABEL[need] || LABEL.work;
  return { zh: said.from ? `${zh}（${said.from} 起）` : zh, en: said.from ? `${en} from ${said.from}` : en, from: said.from || null, text: day.text || '' };
}

export function setPlace(role, place) {
  const all = read(PLACES) || {};
  const k = placeKey(place);
  if (!k) return;
  const keep = place.county ? { county: tai(place.county), town: place.town ? tai(place.town) : null } : { lat: place.lat, lon: place.lon };
  if (placeKey(all[role]) === k) return;
  all[role] = keep;
  write(PLACES, all);
}
export const placeOf = role => (read(PLACES) || {})[role] || null;
