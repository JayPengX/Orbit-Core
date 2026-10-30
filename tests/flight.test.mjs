// /flight (flight.js) and the sphere math it shares with Orbit Class (kit/flight.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { distKm, bearing, along, gcLine, etaMin, onRoute, aheadOf, landedFix, turn } from '../kit/flight.mjs';
import { candidates, flightOf, choose, pickFlights, trackFlight, handleFlight, areasFor, AREAS } from '../flight.js';

const TPE = { lat: 25.0777, lon: 121.233 };
const NRT = { lat: 35.7647, lon: 140.386 };
const SEA = { lat: 47.449, lon: -122.309 };

test('distances and bearings on the sphere', () => {
  assert.ok(Math.abs(distKm(TPE, NRT) - 2180) < 30);
  assert.ok(Math.abs(bearing(TPE, NRT) - 50) < 5);
  assert.equal(turn(350, 10), 20);
  const mid = along(TPE, NRT, 0.5);
  assert.ok(Math.abs(distKm(TPE, mid) - distKm(mid, NRT)) < 1);
});

test('a Pacific crossing is one continuous line, not back across the world', () => {
  const line = gcLine(SEA, TPE, 32);
  for (let i = 1; i < line.length; i++) assert.ok(Math.abs(line[i][1] - line[i - 1][1]) < 30);
  assert.ok(line.at(-1)[1] < -180);
});

test('time left: the distance at its speed plus the approach', () => {
  // 450 knots (833 km/h), 833 km out: an hour, plus 8 minutes in.
  const p = along(NRT, TPE, 1 - 833 / distKm(NRT, TPE));
  assert.ok(Math.abs(etaMin(p, TPE, 450) - 68) < 1);
  // Close in, the approach shrinks with the distance.
  assert.ok(etaMin(along(NRT, TPE, 0.999), TPE, 200) < 4);
});

test('a route fits the plane only between the airports, heading for the second', () => {
  const p = along(TPE, NRT, 0.4);
  assert.equal(onRoute(p, bearing(p, NRT), TPE, NRT), true);
  // Flying the other way: another day's route on the same callsign.
  assert.equal(onRoute(p, bearing(p, TPE), TPE, NRT), false);
  // Far off the line between them.
  assert.equal(onRoute(SEA, bearing(SEA, NRT), TPE, NRT), false);
  // Circling close in: any heading.
  const near = along(TPE, NRT, 0.98);
  assert.equal(onRoute(near, 200, TPE, NRT), true);
});

test('between fixes the plane flies on, never past the airport', () => {
  const fix = { ...along(TPE, NRT, 0.5), gs: 450, track: bearing(along(TPE, NRT, 0.5), NRT) };
  const later = aheadOf(fix, NRT, 10 * 60_000);
  assert.ok(Math.abs(distKm(fix, later) - 450 * 1.852 / 6) < 2);
  assert.deepEqual(aheadOf(fix, NRT, 10 * 3_600_000), { lat: NRT.lat, lon: NRT.lon });
  assert.equal(landedFix({ ...NRT, gs: 20 }, NRT), true);
  assert.equal(landedFix({ ...fix, ground: false }, NRT), false);
  assert.equal(landedFix({ ...fix, ground: true }, NRT), true);
});

const now = 1_800_000_000_000;
const plane = (hex, flight, p, extra = {}) => ({ hex, flight: `${flight} `, lat: p.lat, lon: p.lon, gs: 450, track: 50, alt_baro: 35000, seen_pos: 2, t: 'A321', r: 'B-1', ...extra });

test('only airliners in the air, seen just now, once each', () => {
  const p = along(TPE, NRT, 0.5);
  const list = candidates([[plane('aaaaaa', 'EVA190', p), plane('aaaaaa', 'EVA190', p), plane('bbbbbb', 'N123AB', p), plane('cccccc', 'CAL100', p, { alt_baro: 'ground', gs: 10 }), plane('dddddd', 'CAL102', p, { seen_pos: 120 })], null], now);
  assert.deepEqual(list.map(x => x.hex), ['aaaaaa']);
});

const route = (no, from, to, icao = no.slice(0, 2)) => ({ no, airline: { name: icao, iata: icao, icao }, from: { iata: from.iata, lat: from.lat, lon: from.lon, city: '' }, to: { iata: to.iata, lat: to.lat, lon: to.lon, city: '' } });
const at = (min, toIata, airline, hex = `${toIata}${airline}`.toLowerCase()) => ({ hex, cs: `${airline}1`, airline: { icao: airline }, to: { iata: toIata }, eta: now + min * 60_000 });

test('picks: within a tenth of the time, closest first, one per destination and airline', () => {
  const list = [at(25, 'NRT', 'EVA'), at(26, 'NRT', 'CAL'), at(24, 'HKG', 'EVA'), at(27, 'ICN', 'KAL'), at(23, 'BKK', 'THA'), at(40, 'SIN', 'SIA')];
  const out = choose(list, 25, now);
  // (HKG is EVA's again: another airline's first.)
  assert.deepEqual(out.map(f => f.to.iata), ['NRT', 'ICN', 'BKK']);
  // Too few within a tenth: a fifth.
  assert.deepEqual(choose([at(29, 'NRT', 'EVA')], 25, now).map(f => f.to.iata), ['NRT']);
  assert.deepEqual(choose([at(40, 'NRT', 'EVA')], 25, now), []);
});

test('a plane takes its route only if it fits', () => {
  const p = along(TPE, NRT, 0.6);
  const [c] = candidates([[plane('aaaaaa', 'EVA190', p, { track: bearing(p, NRT) })]], now);
  const f = flightOf(c, route('BR190', { iata: 'TPE', ...TPE }, { iata: 'NRT', ...NRT }), now);
  assert.equal(f.no, 'BR190');
  assert.ok(Math.abs((f.eta - c.fix.at) / 60_000 - etaMin(p, NRT, 450)) < 0.1);
  assert.equal(flightOf(c, route('BR190', { iata: 'NRT', ...NRT }, { iata: 'TPE', ...TPE }), now), null);
});

// Sources faked: one plane 25 minutes out of NRT over each area's list.
function fakeFetch({ routes = true, areas = true } = {}) {
  const p = along(TPE, NRT, 1 - (450 * 1.852 * (17 / 60)) / distKm(TPE, NRT));
  const calls = [];
  const fn = async url => {
    calls.push(url);
    if (/adsb\.lol\/v2\/point/.test(url)) return areas ? new Response(JSON.stringify({ ac: [plane('abc123', 'EVA190', p, { track: bearing(p, NRT) })] })) : new Response('', { status: 503 });
    if (/adsb\.fi/.test(url)) return new Response('', { status: 503 });
    if (/adsbdb/.test(url)) return routes ? new Response(JSON.stringify({ response: { flightroute: { callsign_iata: 'BR190', airline: { name: 'EVA Air', iata: 'BR', icao: 'EVA' }, origin: { iata_code: 'TPE', municipality: 'Taipei', latitude: TPE.lat, longitude: TPE.lon }, destination: { iata_code: 'NRT', municipality: 'Tokyo', latitude: NRT.lat, longitude: NRT.lon } } } })) : new Response('', { status: 404 });
    if (/adsb\.lol\/v2\/hex/.test(url)) return new Response(JSON.stringify({ ac: [plane('abc123', 'EVA190', p)] }));
    return new Response('', { status: 404 });
  };
  return { fn, calls, p };
}

test('picking: a plane read round the areas, its route looked up and fitted', async () => {
  const { fn } = fakeFetch();
  const out = await pickFlights(25, { fetchFn: fn, now });
  assert.equal(out.length, 1);
  assert.equal(out[0].no, 'BR190');
  assert.equal(out[0].to.iata, 'NRT');
  assert.ok(Math.abs(out[0].left - 25) < 1);
  // East Asia every minute, the rest changing.
  assert.ok(areasFor(1).includes('tpe') && areasFor(1).every(k => AREAS[k]));
  assert.notDeepEqual(areasFor(1), areasFor(2));
});

test('no source answering is a failure, not "no planes"', async () => {
  assert.equal(await pickFlights(25, { fetchFn: fakeFetch({ areas: false }).fn, now }), null);
  assert.deepEqual(await pickFlights(25, { fetchFn: fakeFetch({ routes: false }).fn, now }), []);
});

test('following: the latest fix, or null once out of range', async () => {
  const { fn, p } = fakeFetch();
  const fix = await trackFlight('abc123', { fetchFn: fn, now });
  assert.equal(fix.lat, p.lat);
  assert.equal(fix.at, now - 2000);
  const gone = async () => new Response(JSON.stringify({ ac: [] }));
  assert.equal(await trackFlight('abc123', { fetchFn: gone, now }), null);
});

test('the route: a session, sane minutes and a real hex', async () => {
  const req = q => new Request(`https://api.example/flight?${q}`);
  const opts = { session: { s: 'x' }, limited: () => false, fetchFn: fakeFetch().fn };
  assert.equal((await handleFlight(req('min=25'), {}, { ...opts, session: null })).status, 401);
  assert.equal((await handleFlight(req('min=5'), {}, opts)).status, 400);
  assert.equal((await handleFlight(req('hex=zzz'), {}, opts)).status, 400);
  assert.equal((await handleFlight(req('min=25'), {}, { ...opts, limited: () => true })).status, 429);
  const ok = await handleFlight(req('min=25'), {}, opts);
  assert.equal(ok.status, 200);
  assert.equal((await ok.json()).flights[0].no, 'BR190');
});

test('a source that hangs is left out within the budget, never waited on', async () => {
  const { fn } = fakeFetch();
  // adsb.lol hangs (until its timeout); adsb.fi answers like adsb.lol would.
  const hang = async (url, init) => {
    if (/adsb\.lol/.test(url)) return new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(new Error('timeout'))));
    if (/adsb\.fi/.test(url)) return fn(url.replace('opendata.adsb.fi/api/v2/lat/', 'api.adsb.lol/v2/point/'), init);
    return fn(url, init);
  };
  const t0 = Date.now();
  const out = await pickFlights(25, { fetchFn: hang, now });
  assert.equal(out[0].no, 'BR190');
  assert.ok(Date.now() - t0 < 1000);
});
