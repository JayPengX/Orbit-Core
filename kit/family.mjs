// ---- kit/family.mjs: the family's notebook (Jay 11-10: apps working together) ----
// Every app lives on one origin (orbit.jaypengx.com), so on a phone they
// share localStorage: each app writes down here the few facts the others
// can use, and reads theirs. No server, no cost; nothing leaves the phone.
// A fact is the app's own (only it writes it), stamped with when, so a
// reader can tell an old one. Reading never changes another app's data.
//
//   tell(app, key, value)            this app's fact ('class', 'week', {...})
//   heard(app, key, { maxAge })      another's fact, or null (too old, never told)
//   setPlace(role, place, app)       home / school / work: { lat, lon, name } (Weather's pins, Transit's places)
//   placeFor(role)                   that place, or null
//   classesOn(day)                   Class's periods that day [{ n, name, from, to, out }] (out: outdoors, 體育)
//   classAt(t), breakAfter(t)        the period on now, when the next break begins
//   schoolHours(day)                 { from, to } of the first and last period, or null (no school)
//   planHash(place, at)              Orbit Transit's trip to a place (#plan…), there by `at` when given
//
// The facts each app tells (keep this list current):
//   class.days      { 'YYYY-MM-DD': [{ n, name, from: 'HH:MM', to, out }] } the next two weeks' periods as held
//                   (單/雙週, holidays, typhoon days and 調課 applied: Class's own); a day not in it, the week's
//   class.week      { 1..7: [{ n, name, from: 'HH:MM', to, out }] } the week's periods by weekday (1 Monday)
//   class.school    { name } the school's name
//   sports.follows  [{ league, id, name, abbr }] the teams followed
//   stock.holds     [{ code, name, market }] what the account holds (names only, never money)
//   vocab.due       { day, n } words due for review today
//   transit.trips   [{ name, from: { lat, lon, name }, to: {…} }] saved trips
//   transit.ride    { id, at, name, fare, modes } the latest planned trip with a fare (Money's 車資記帳)
//   weather.rain    { at, next: { from, to, mm, word } | null } the next rain at home, by the radar and the hour
// Places (place.home / place.school / place.work) are the family's, written
// by whichever app last learned them.

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
  all[`${app}.${key}`] = { v: value, at: now };
  write(all);
}
export function heard(app, key, { maxAge = Infinity, now = Date.now() } = {}) {
  const f = read()[`${app}.${key}`];
  return f && now - f.at <= maxAge ? f.v : null;
}
export const heardAt = (app, key) => read()[`${app}.${key}`]?.at ?? null;

const okPlace = p => p && Number.isFinite(+p.lat) && Number.isFinite(+p.lon);
// A trip in Orbit Transit (its #plan, Transit's lib/links.mjs): from where
// the phone is to `place`, there by `at` (a moment) when given. Sports'
// 去球場, Class's 出門時間 open `/transit/` with it (the session's go).
export function planHash({ lat, lon, name = '' }, at = null) {
  const by = at != null && Number.isFinite(new Date(at).getTime()) ? `&by=${encodeURIComponent(new Date(at).toISOString())}` : '';
  return `#plan?to=${Number(lat).toFixed(6)},${Number(lon).toFixed(6)},${encodeURIComponent(String(name))}${by}`;
}
export function setPlace(role, place, app = '') {
  if (!['home', 'school', 'work'].includes(role) || !okPlace(place)) return;
  tell('place', role, { lat: +(+place.lat).toFixed(5), lon: +(+place.lon).toFixed(5), name: String(place.name || '').slice(0, 40), from: app });
}
export const placeFor = role => heard('place', role);

// ---- Class's day ----
const mins = hm => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hm || '');
  return m ? +m[1] * 60 + +m[2] : null;
};
const twParts = t => {
  const d = new Date((typeof t === 'number' ? t : Date.parse(t)) + 8 * 3_600_000);
  return { day: d.toISOString().slice(0, 10), wd: d.getUTCDay() || 7, min: d.getUTCHours() * 60 + d.getUTCMinutes() };
};
const weekdayOf = day => new Date(`${day}T12:00:00Z`).getUTCDay() || 7;

export function classesOn(day) {
  const days = heard('class', 'days');
  const list = Array.isArray(days?.[day]) ? days[day] : heard('class', 'week')?.[weekdayOf(day)];
  return Array.isArray(list) ? list.filter(p => mins(p.from) != null && mins(p.to) != null).sort((a, b) => mins(a.from) - mins(b.from)) : [];
}
export function schoolHours(day) {
  const list = classesOn(day);
  return list.length ? { from: list[0].from, to: list.at(-1).to } : null;
}
// The period on at `t` (a moment), or null (a break, before or after school).
export function classAt(t = Date.now()) {
  const { day, min } = twParts(t);
  return classesOn(day).find(p => mins(p.from) <= min && min < mins(p.to)) || null;
}
// When the period on at `t` ends (the break begins), as a moment; null when none is on.
export function breakAfter(t = Date.now()) {
  const p = classAt(t);
  if (!p) return null;
  const { day } = twParts(t);
  return Date.parse(`${day}T${p.to.padStart(5, '0')}:00+08:00`);
}
export const momentOf = (day, hm) => Date.parse(`${day}T${String(hm).padStart(5, '0')}:00+08:00`);
