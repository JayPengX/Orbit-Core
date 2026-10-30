// ---- kit/flight.mjs: a real plane in the air, worked out on a sphere ----
// One copy of the math for the proxy's /flight (flight.js: which planes land
// in about N minutes) and Orbit Class's 專注飛行 (where the plane is between
// two fixes, how far along it is, when it lands).
//
//   import { distKm, bearing, along, gcLine, etaMin, onRoute, aheadOf, landedFix } from '#kit/flight.mjs';
//
// Points are { lat, lon } in degrees; speeds in knots as ADS-B reports them.
const R = 6371;
const rad = d => (d * Math.PI) / 180;
const deg = r => (r * 180) / Math.PI;
export const KT_KMH = 1.852;

// Great-circle distance in km.
export function distKm(a, b) {
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

// The initial bearing from a to b, 0–360 (0 north, 90 east).
export function bearing(a, b) {
  const y = Math.sin(rad(b.lon - a.lon)) * Math.cos(rad(b.lat));
  const x = Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) - Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lon - a.lon));
  return (deg(Math.atan2(y, x)) + 360) % 360;
}

// The smallest angle between two bearings, 0–180.
export const turn = (a, b) => Math.abs(((((a - b) % 360) + 540) % 360) - 180);

// The point `f` (0–1) of the way from a to b on the great circle.
export function along(a, b, f) {
  const d = distKm(a, b) / R;
  if (d < 1e-9) return { lat: a.lat, lon: a.lon };
  const k = Math.min(1, Math.max(0, f));
  const A = Math.sin((1 - k) * d) / Math.sin(d);
  const B = Math.sin(k * d) / Math.sin(d);
  const [la1, lo1, la2, lo2] = [rad(a.lat), rad(a.lon), rad(b.lat), rad(b.lon)];
  const x = A * Math.cos(la1) * Math.cos(lo1) + B * Math.cos(la2) * Math.cos(lo2);
  const y = A * Math.cos(la1) * Math.sin(lo1) + B * Math.cos(la2) * Math.sin(lo2);
  const z = A * Math.sin(la1) + B * Math.sin(la2);
  return { lat: deg(Math.atan2(z, Math.hypot(x, y))), lon: deg(Math.atan2(y, x)) };
}

// The point `km` on from p along a bearing.
export function moved(p, brg, km) {
  const d = km / R;
  const la1 = rad(p.lat);
  const t = rad(brg);
  const la2 = Math.asin(Math.sin(la1) * Math.cos(d) + Math.cos(la1) * Math.sin(d) * Math.cos(t));
  const lo2 = rad(p.lon) + Math.atan2(Math.sin(t) * Math.sin(d) * Math.cos(la1), Math.cos(d) - Math.sin(la1) * Math.sin(la2));
  return { lat: deg(la2), lon: ((deg(lo2) + 540) % 360) - 180 };
}

// The great circle from a to b as [lat, lon] pairs for a map line, its
// longitudes kept continuous (a Pacific crossing runs past 180, not back
// across the world); `from` a longitude to start next to.
export function gcLine(a, b, n = 64, from = a.lon) {
  const out = [];
  let prev = from;
  for (let i = 0; i <= n; i++) {
    const p = along(a, b, i / n);
    let lon = p.lon;
    while (lon - prev > 180) lon -= 360;
    while (prev - lon > 180) lon += 360;
    out.push([p.lat, lon]);
    prev = lon;
  }
  return out;
}

// A longitude moved by whole turns to sit next to `near` (the line's).
export const lonNear = (lon, near) => lon + 360 * Math.round((near - lon) / 360);

// Minutes to landing from here: the distance left at the plane's ground
// speed, plus the approach (slower, and not a straight line): about 8
// minutes from cruise, less once it's close in.
export const APPROACH_MIN = 8;
export function etaMin(p, dest, gsKt) {
  const km = distKm(p, dest);
  const kmh = Math.max(Number(gsKt) || 0, 140) * KT_KMH;
  return (km / kmh) * 60 + Math.min(APPROACH_MIN, km / 25);
}

// A route that fits the plane: it's between the two airports (the detour
// through it not much longer than the route) and heading for the second
// (close in it may circle, so any heading). A callsign's route from a
// database can be another day's; this is what catches it.
export function onRoute(p, track, from, to) {
  const total = distKm(from, to);
  if (total < 50) return false;
  const left = distKm(p, to);
  const detour = distKm(from, p) + left;
  if (detour > total * 1.15 + 150) return false;
  return left < 80 || !Number.isFinite(track) || turn(track, bearing(p, to)) <= 45;
}

// Where the plane is `ms` after its fix, flying on to `dest`: along the
// great circle at its ground speed, or on its own track once close in
// (where it turns onto the approach). Never past the airport.
export function aheadOf(fix, dest, ms) {
  const km = (Math.max(Number(fix.gs) || 0, 0) * KT_KMH * Math.max(0, ms)) / 3_600_000;
  const left = distKm(fix, dest);
  if (left < 60 && Number.isFinite(fix.track)) return moved(fix, fix.track, Math.min(km, left));
  return km >= left ? { lat: dest.lat, lon: dest.lon } : along(fix, dest, km / left);
}

// A fix that says the plane is down: on the ground, or slow and near the airport.
export const landedFix = (fix, dest) => Boolean(fix) && (fix.ground || ((Number(fix.gs) || 0) < 60 && distKm(fix, dest) < 15));

// The flights to offer for a focus of `minutes`: whole flights first, ones
// that took off a short while ago and land about when the time's up (a 30
// minute focus: a short hop, from its climb to its landing, not the last half
// hour of a long one); then any landing about then; then the nearest. One
// per destination and, while there are enough, per airline; never none while
// any plane is up (one landing earlier hands over to another, one landing
// later is still flying when the time's up).
export const flown = f => {
  if (!f.from || !f.fix) return 1;
  const total = distKm(f.from, f.to);
  return total > 0 ? Math.min(1, Math.max(0, 1 - distKm(f.fix, f.to) / total)) : 1;
};
export function choose(flights, minutes, now, want = 6) {
  const off = f => Math.abs((f.eta - now) / 60_000 - minutes);
  const near = f => off(f) <= Math.max(3, minutes * 0.2);
  const sorted = flights.filter(f => f && f.eta > now + 60_000).sort((a, b) => off(a) - off(b));
  const out = [];
  const to = new Set();
  const by = new Set();
  const placeOf = f => f.to.iata || f.to.icao;
  const lineOf = f => f.airline?.icao || String(f.cs || f.no || '').slice(0, 3);
  const passes = [f => near(f) && flown(f) <= 0.3 && !by.has(lineOf(f)), f => near(f) && flown(f) <= 0.3, f => near(f) && !by.has(lineOf(f)), near, () => true];
  for (const [i, ok] of passes.entries())
    for (const f of sorted) {
      if (out.length >= want) return out;
      if (out.includes(f) || (i < passes.length - 1 && to.has(placeOf(f))) || !ok(f)) continue;
      out.push(f);
      to.add(placeOf(f));
      by.add(lineOf(f));
    }
  return out;
}
