// ---- weather.js ----
// Orbit Weather's server side (docs/WEATHER-PLAN.md), routed by worker.js:
//
//   GET /weather?lat=&lon=&qt=     the blended forecast for that ~1 km cell
//                                  (Google, CWA 中央氣象署, MOENV 環境部):
//                                  hourly for 10 days, daily for 10
//   GET /weather?auto=1&qt=        the same where the caller's IP says it is
//                                  (Cloudflare's request.cf), until the
//                                  device's own position is known
//   GET /weather/where?lat=&lon=&qt=  the place to the village (縣市 / 鄉鎮市區
//                                  / 村里), from NLSC's open point query
//   GET /weather/places            Taiwan's townships [county, town, lat,
//                                  lon], for the app's place picker
//   GET /weather/status            each source's key: set, and a live call
//                                  answering (cached 10 minutes; no key is
//                                  ever shown)
//   GET /weather/status?sample=<n> one source's real answer at Taipei 101
//                                  (SAMPLES, cached an hour): the tests'
//                                  fixtures and tools/weather-stations.mjs.
//
// Orbit Weather is a Quadra app: /weather and /weather/where need a Quadra
// Pass session (worker.js), 30 a minute a session. Google is asked at most
// GOOGLE_DAILY_CALLS times a day in all (under the key's 500-a-day quota):
// a refresh is 4 calls (now, 48 hours in 2 pages, 10 days), but only 1 (now)
// while the forecast is under 30 minutes old (Google's own forecast refresh,
// GOOGLE_FC_MS), and every 6 hours 8 more for hours 49–240; past the cap a cell is built without
// Google (CWA alone, the last far hours kept).
//
// Keys (Worker secrets): GOOGLE_WEATHER_KEY, CWA_KEY, MOENV_KEY.
//
// The Worker is on Cloudflare's Free plan (10 ms of CPU a request), so it
// never parses CWA's national lists (~1 MB each): the station table is
// committed (weather-stations.js) and only the nearest stations are asked
// for. Each cell is kept in KV (`weather:cell:<lat>,<lon>`) 15 minutes;
// older but under 3 hours it's answered at once and refreshed in the
// background. A source failing doesn't fail the answer: its last good copy
// is used while under 6 hours old (`partial` says something is missing).
//
// One truth: the app gets one value for each thing (rain %, temperature,
// UV…), the blend. What each source said is kept only in the cell's KV
// entry (`bySource`), for the scoring that moves the blend's weights; it is
// never in the answer.

import { STATIONS } from './weather-stations.js';

export const GOOGLE = 'https://weather.googleapis.com/v1/';
export const GOOGLE_AIR = 'https://airquality.googleapis.com/v1/';
export const CWA = 'https://opendata.cwa.gov.tw/api/v1/rest/datastore/';
export const MOENV = 'https://data.moenv.gov.tw/api/v2/';
const KEYS = { google: 'GOOGLE_WEATHER_KEY', cwa: 'CWA_KEY', moenv: 'MOENV_KEY' };
const TAIPEI = { lat: 25.034, lon: 121.565 };
export const MIN = 60_000;
export const HOUR = 60 * MIN;
export const FRESH_MS = 15 * MIN;
export const STALE_MS = 3 * HOUR;
export const KEEP_MS = 6 * HOUR;
// Farther than this from every CWA station / MOENV site (abroad): Google only.
const NEAR_KM = 30;
export const GOOGLE_DAILY_CALLS = 450;
export const FAR_MS = 6 * HOUR;
// Google's forecast hours and days change every 30 minutes, its current
// conditions every 15 (its FAQ): a cell rebuilt in between (FRESH_MS) asks
// for the current conditions only (1 call, not 4) and keeps the forecast.
export const GOOGLE_FC_MS = 30 * MIN;
export const FAR_RETRY_MS = 30 * MIN;
export const DEFAULT_WEIGHTS = { pop: { google: 0.6, cwa: 0.4 }, temp: { google: 0.6, cwa: 0.4 } };

export function googleUrl(env, path, lat, lon, extra = '', units = true) {
  return `${GOOGLE}${path}?key=${encodeURIComponent(env.GOOGLE_WEATHER_KEY)}&location.latitude=${lat}&location.longitude=${lon}&languageCode=zh-TW${units ? '&unitsSystem=METRIC' : ''}${extra}`;
}
export const cwaUrl = (env, id, extra = '') => `${CWA}${id}?Authorization=${encodeURIComponent(env.CWA_KEY)}&format=JSON${extra}`;
export const moenvUrl = (env, id, extra = '') => `${MOENV}${id}?api_key=${encodeURIComponent(env.MOENV_KEY)}&format=json${extra}`;

// CWA's township forecasts, one dataset per county: 3 days (3-hourly); the
// week's is the next id up by 2.
export const COUNTY_IDS = {
  宜蘭縣: 1, 桃園市: 5, 新竹縣: 9, 苗栗縣: 13, 彰化縣: 17, 南投縣: 21, 雲林縣: 25, 嘉義縣: 29, 屏東縣: 33, 臺東縣: 37, 花蓮縣: 41,
  澎湖縣: 45, 基隆市: 49, 新竹市: 53, 嘉義市: 57, 臺北市: 61, 高雄市: 65, 新北市: 69, 臺中市: 73, 臺南市: 77, 連江縣: 81, 金門縣: 85
};
export const townIds = county => {
  const n = COUNTY_IDS[county];
  return n ? [`F-D0047-${String(n).padStart(3, '0')}`, `F-D0047-${String(n + 2).padStart(3, '0')}`] : null;
};
// MOENV's AQI forecast areas.
const AIR_AREAS = {
  北部: ['基隆市', '臺北市', '新北市', '桃園市'], 竹苗: ['新竹縣', '新竹市', '苗栗縣'], 中部: ['臺中市', '彰化縣', '南投縣'],
  雲嘉南: ['雲林縣', '嘉義縣', '嘉義市', '臺南市'], 高屏: ['高雄市', '屏東縣'], 宜蘭: ['宜蘭縣'], 花東: ['花蓮縣', '臺東縣'],
  澎湖: ['澎湖縣'], 金門: ['金門縣'], 馬祖: ['連江縣']
};
const tai = s => String(s || '').replace(/台/g, '臺');
export const airArea = county => Object.keys(AIR_AREAS).find(a => AIR_AREAS[a].includes(tai(county))) || null;

// ---- Small helpers -------------------------------------------------------------

// A number, or null for CWA's "no data" (-99, -999…) and blanks.
export const num = v => {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && n > -90 ? n : null;
};
const r1 = v => (v == null ? null : Math.round(v * 10) / 10);
export function km(aLat, aLon, bLat, bLon) {
  const rad = Math.PI / 180;
  const x = (bLon - aLon) * rad * Math.cos(((aLat + bLat) / 2) * rad);
  const y = (bLat - aLat) * rad;
  return 6371 * Math.hypot(x, y);
}
export const cellOf = (lat, lon) => `${(Math.round(lat * 100) / 100).toFixed(2)},${(Math.round(lon * 100) / 100).toFixed(2)}`;
// Taiwan has one zone and no summer time.
export const twDate = ms => new Date(ms + 8 * HOUR).toISOString().slice(0, 10);
export const twHour = ms => new Date(ms + 8 * HOUR).getUTCHours();
const twClock = ms => new Date(ms + 8 * HOUR).toISOString().slice(11, 16);
const twParse = s => (s ? Date.parse(String(s).replace(' ', 'T').replace(/\//g, '-') + '+08:00') : null);

// The nearest station with `flag` (weather-stations.js), and how far.
export function nearestStation(lat, lon, flag) {
  let best = null;
  let d = Infinity;
  for (const s of STATIONS) {
    if (!s[6].includes(flag)) continue;
    const k = km(lat, lon, s[2], s[3]);
    if (k < d) (d = k), (best = s);
  }
  return best && { id: best[0], name: best[1], lat: best[2], lon: best[3], county: best[4], town: best[5], km: r1(d) };
}

// A key never leaves the Worker, even inside an upstream's error text.
export function scrub(text, env) {
  let out = String(text);
  for (const name of Object.values(KEYS)) {
    const k = env[name];
    if (k && k.length >= 8) out = out.split(k).join('***').split(encodeURIComponent(k)).join('***');
  }
  return out;
}

export async function getJson(fetchFn, url, env, body = null) {
  const res = await fetchFn(url, body ? { method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : { headers: { Accept: 'application/json' } });
  const text = await res.text();
  if (!res.ok) throw new Error(scrub(`${res.status} ${text.slice(0, 160)}`, env));
  return JSON.parse(text);
}

// ---- Google ---------------------------------------------------------------------

const cond = c => (c ? { code: c.type || null, text: c.description?.text || '' } : null);
const gWind = w => (w ? { dir: num(w.direction?.degrees), speed: num(w.speed?.value), gust: num(w.gust?.value) } : null);

export function parseGoogleCurrent(j) {
  return {
    t: Date.parse(j.currentTime),
    tz: j.timeZone?.id || 'Asia/Taipei',
    temp: num(j.temperature?.degrees),
    feels: num(j.feelsLikeTemperature?.degrees),
    humidity: num(j.relativeHumidity),
    dew: num(j.dewPoint?.degrees),
    uv: num(j.uvIndex),
    pop: num(j.precipitation?.probability?.percent),
    wind: gWind(j.wind),
    pressure: num(j.airPressure?.meanSeaLevelMillibars),
    vis: num(j.visibility?.distance),
    cloud: num(j.cloudCover),
    thunder: num(j.thunderstormProbability),
    day: !!j.isDaytime,
    condition: cond(j.weatherCondition),
    today: { hi: num(j.currentConditionsHistory?.maxTemperature?.degrees), lo: num(j.currentConditionsHistory?.minTemperature?.degrees), mm: num(j.currentConditionsHistory?.qpf?.quantity) }
  };
}

export function parseGoogleHour(h) {
  return {
    t: Date.parse(h.interval.startTime),
    temp: num(h.temperature?.degrees),
    feels: num(h.feelsLikeTemperature?.degrees),
    uv: num(h.uvIndex),
    pop: num(h.precipitation?.probability?.percent),
    mm: num(h.precipitation?.qpf?.quantity),
    kind: (h.precipitation?.probability?.type || 'NONE').toLowerCase(),
    thunder: num(h.thunderstormProbability),
    wind: gWind(h.wind),
    pressure: num(h.airPressure?.meanSeaLevelMillibars),
    humidity: num(h.relativeHumidity),
    dew: num(h.dewPoint?.degrees),
    cloud: num(h.cloudCover),
    vis: num(h.visibility?.distance),
    day: !!h.isDaytime,
    condition: cond(h.weatherCondition)
  };
}

const half = h =>
  h ? { condition: cond(h.weatherCondition), pop: num(h.precipitation?.probability?.percent), mm: num(h.precipitation?.qpf?.quantity), thunder: num(h.thunderstormProbability), uv: num(h.uvIndex), cloud: num(h.cloudCover), wind: gWind(h.wind) } : null;

export function parseGoogleDay(d) {
  const { year, month, day } = d.displayDate;
  const dayH = half(d.daytimeForecast);
  const night = half(d.nighttimeForecast);
  const pops = [dayH?.pop, night?.pop].filter(v => v != null);
  return {
    date: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
    hi: num(d.maxTemperature?.degrees),
    lo: num(d.minTemperature?.degrees),
    feelsHi: num(d.feelsLikeMaxTemperature?.degrees),
    feelsLo: num(d.feelsLikeMinTemperature?.degrees),
    uvMax: dayH?.uv ?? null,
    pop: pops.length ? Math.max(...pops) : null,
    mm: r1((dayH?.mm || 0) + (night?.mm || 0)),
    day: dayH,
    night,
    sunrise: d.sunEvents?.sunriseTime ? Date.parse(d.sunEvents.sunriseTime) : null,
    sunset: d.sunEvents?.sunsetTime ? Date.parse(d.sunEvents.sunsetTime) : null,
    moon: d.moonEvents ? { phase: d.moonEvents.moonPhase || null, rise: d.moonEvents.moonriseTimes?.[0] ? Date.parse(d.moonEvents.moonriseTimes[0]) : null, set: d.moonEvents.moonsetTimes?.[0] ? Date.parse(d.moonEvents.moonsetTimes[0]) : null } : null
  };
}

export function parseGoogleAlerts(j) {
  return (j?.weatherAlerts || []).map(a => ({
    title: a.alertTitle?.text || a.eventType || '',
    text: a.description || '',
    from: a.startTime ? Date.parse(a.startTime) : null,
    to: a.expirationTime ? Date.parse(a.expirationTime) : null,
    severity: (a.severity || '').toLowerCase() || null
  }));
}

// Current, 48 hours (24 a page at most, each page a billed call), 10 days;
// alerts only abroad (in Taiwan CWA's warnings are the source).
// `far`: also hours 49–240 (8 more pages; the pages chain by token, so
// they follow the first two).
async function fetchGoogle(env, lat, lon, fetchFn, abroad, far = false) {
  const get = (path, extra, units) => getJson(fetchFn, googleUrl(env, path, lat, lon, extra, units), env);
  const HOURS = '&hours=240&pageSize=24';
  let farHours = null;
  let farError = null;
  const hoursP = (async () => {
    const pages = [await get('forecast/hours:lookup', HOURS)];
    if (pages[0].nextPageToken) pages.push(await get('forecast/hours:lookup', `${HOURS}&pageToken=${encodeURIComponent(pages[0].nextPageToken)}`));
    if (far) {
      const more = [];
      let token = pages[pages.length - 1].nextPageToken;
      try {
        while (token && more.length < 8) {
          const url = `${HOURS}&pageToken=${encodeURIComponent(token)}`;
          // One more try for a page that fails (a hiccup shouldn't cost the days after it).
          const p = await get('forecast/hours:lookup', url).catch(() => get('forecast/hours:lookup', url));
          more.push(p);
          token = p.nextPageToken;
        }
      } catch (e) {
        farError = `page ${more.length + 3}: ${String(e.message || e).slice(0, 160)}`;
        console.log('weather far hours failed', farError);
      }
      if (more.length) farHours = more.flatMap(p => p.forecastHours || []).map(parseGoogleHour);
    }
    return pages.flatMap(p => p.forecastHours || []);
  })();
  const [current, hours, days, alerts] = await Promise.all([
    get('currentConditions:lookup', ''),
    hoursP,
    get('forecast/days:lookup', '&days=10&pageSize=10'),
    abroad ? get('publicAlerts:lookup', '', false).catch(() => null) : null
  ]);
  return {
    current: parseGoogleCurrent(current),
    hours: hours.map(parseGoogleHour),
    far: farHours,
    farError,
    days: (days.forecastDays || []).map(parseGoogleDay),
    alerts: parseGoogleAlerts(alerts),
    tz: current.timeZone?.id || 'Asia/Taipei'
  };
}

// Google's current conditions alone (between forecast refreshes).
async function fetchGoogleNow(env, lat, lon, fetchFn) {
  const current = await getJson(fetchFn, googleUrl(env, 'currentConditions:lookup', lat, lon, ''), env);
  return { current: parseGoogleCurrent(current), tz: current.timeZone?.id || 'Asia/Taipei' };
}

// ---- Google Air Quality (hourly AQI, 96 hours ahead) -----------------------------

// Taiwan's own AQI (MOENV's scale, `twn_epa`), not Google's universal one,
// so it lines up with the stations' readings.
export const GOOGLE_AIR_HOURS = 96;
export function googleAirBody(lat, lon, now) {
  const start = Math.ceil(now / HOUR) * HOUR;
  return {
    location: { latitude: lat, longitude: lon },
    period: { startTime: new Date(start).toISOString(), endTime: new Date(start + (GOOGLE_AIR_HOURS - 1) * HOUR).toISOString() },
    pageSize: GOOGLE_AIR_HOURS,
    universalAqi: false,
    extraComputations: ['LOCAL_AQI', 'POLLUTANT_CONCENTRATION'],
    customLocalAqis: [{ regionCode: 'tw', aqi: 'twn_epa' }],
    languageCode: 'zh-TW'
  };
}
// → [{ t, aqi, pm25 }…], the hours with a Taiwan AQI.
export function parseGoogleAir(j) {
  return (j?.hourlyForecasts || [])
    .map(h => {
      const idx = (h.indexes || []).find(x => x.code === 'twn_epa');
      const pm = (h.pollutants || []).find(p => p.code === 'pm25');
      return { t: Date.parse(h.dateTime), aqi: num(idx?.aqi), pm25: pm ? r1(num(pm.concentration?.value)) : null };
    })
    .filter(h => Number.isFinite(h.t) && h.aqi != null);
}
async function fetchGoogleAir(env, lat, lon, fetchFn, now) {
  const url = `${GOOGLE_AIR}forecast:lookup?key=${encodeURIComponent(env.GOOGLE_WEATHER_KEY)}`;
  const pages = [await getJson(fetchFn, url, env, googleAirBody(lat, lon, now))];
  while (pages.length < 4 && pages[pages.length - 1].nextPageToken) pages.push(await getJson(fetchFn, url, env, { ...googleAirBody(lat, lon, now), pageToken: pages[pages.length - 1].nextPageToken }));
  const hours = pages.flatMap(parseGoogleAir);
  return hours.length ? hours : null;
}

// The air's forecast as one line: Google's hours pulled toward the nearest
// station's reading (the difference fades over AIR_PULL_MS: the station
// knows now best, the model knows the trend), and each day's value
// blended with MOENV's regional forecast where it has one (Google alone
// past it, MOENV alone without Google).
export const AIR_PULL_MS = 12 * HOUR;
export const AIR_WEIGHTS = { moenv: 0.5, google: 0.5 };
export function airForecast(air, gHours, now) {
  const out = { hours: [], days: [] };
  const list = (gHours || []).filter(h => h.t + HOUR > now);
  if (list.length && air?.aqi != null) {
    const at = air.at || now;
    const first = list.reduce((a, h) => (Math.abs(h.t - at) < Math.abs(a.t - at) ? h : a), list[0]);
    const off = air.aqi - first.aqi;
    out.hours = list.map(h => ({ t: h.t, aqi: Math.max(0, Math.round(h.aqi + off * Math.exp(-Math.max(0, h.t - at) / AIR_PULL_MS))), pm25: h.pm25 }));
  } else out.hours = list.map(h => ({ t: h.t, aqi: Math.round(h.aqi), pm25: h.pm25 }));
  // A day's value: its worst hour (as MOENV's daily forecast means it).
  const gDay = {};
  for (const h of out.hours) {
    const d = twDate(h.t);
    gDay[d] = Math.max(gDay[d] ?? 0, h.aqi);
  }
  const mDay = Object.fromEntries((air?.forecast?.days || []).filter(d => d.aqi != null).map(d => [d.date, d]));
  const dates = [...new Set([...Object.keys(gDay), ...Object.keys(mDay)])].filter(d => d >= twDate(now)).sort();
  for (const date of dates) {
    // A partial first day (the evening left) says little of the day: MOENV's.
    const hoursOf = out.hours.filter(h => twDate(h.t) === date).length;
    const g = hoursOf >= 6 ? gDay[date] ?? null : null;
    const v = blend({ moenv: mDay[date]?.aqi ?? null, google: g }, AIR_WEIGHTS);
    if (v == null) continue;
    const aqi = Math.round(v);
    out.days.push({ date, aqi, level: aqiLevel(aqi), main: mDay[date]?.main || null });
  }
  return out;
}

// ---- CWA ------------------------------------------------------------------------

function cwaElements(j) {
  const locs = j?.records?.Locations?.[0];
  const loc = locs?.Location?.[0];
  if (!loc) return null;
  const el = {};
  for (const e of loc.WeatherElement || []) {
    el[e.ElementName] = (e.Time || []).map(x => ({ t: Date.parse(x.DataTime || x.StartTime), end: x.EndTime ? Date.parse(x.EndTime) : null, v: x.ElementValue?.[0] || {} }));
  }
  return { county: locs.LocationsName, town: loc.LocationName, lat: num(loc.Latitude), lon: num(loc.Longitude), el };
}

// The township's 3 days (temperature hourly at first, then 3-hourly; rain
// probability by 3 hours) and week (12-hour halves, 06–18 and 18–06).
export function parseCwaTown(j3, j1w) {
  const a = cwaElements(j3);
  const w = cwaElements(j1w);
  if (!a && !w) return null;
  const pts = (els, name, field) => (els?.[name] || []).map(x => ({ t: x.t, end: x.end, v: num(x.v[field]) })).filter(x => x.v != null);
  const out = {
    county: a?.county || w?.county,
    town: a?.town || w?.town,
    temp: pts(a?.el, '溫度', 'Temperature'),
    feels: pts(a?.el, '體感溫度', 'ApparentTemperature'),
    humidity: pts(a?.el, '相對濕度', 'RelativeHumidity'),
    pop: pts(a?.el, '3小時降雨機率', 'ProbabilityOfPrecipitation'),
    weather: (a?.el['天氣現象'] || []).map(x => ({ t: x.t, end: x.end, text: x.v.Weather || '', code: x.v.WeatherCode || null })),
    days: {}
  };
  const halves = name => w?.el[name] || [];
  const day = date => (out.days[date] ||= { date, hi: null, lo: null, feelsHi: null, feelsLo: null, uv: null, popDay: null, popNight: null, text: null });
  const take = (name, field, fn) => {
    for (const x of halves(name)) {
      const v = num(x.v[field]);
      if (v == null) continue;
      fn(day(twDate(x.t)), v, twHour(x.t) >= 6 && twHour(x.t) < 18, x);
    }
  };
  const mx = (a2, b) => (a2 == null ? b : Math.max(a2, b));
  const mn = (a2, b) => (a2 == null ? b : Math.min(a2, b));
  take('最高溫度', 'MaxTemperature', (d, v) => (d.hi = mx(d.hi, v)));
  take('最低溫度', 'MinTemperature', (d, v) => (d.lo = mn(d.lo, v)));
  take('最高體感溫度', 'MaxApparentTemperature', (d, v) => (d.feelsHi = mx(d.feelsHi, v)));
  take('最低體感溫度', 'MinApparentTemperature', (d, v) => (d.feelsLo = mn(d.feelsLo, v)));
  take('紫外線指數', 'UVIndex', (d, v) => (d.uv = mx(d.uv, v)));
  take('12小時降雨機率', 'ProbabilityOfPrecipitation', (d, v, isDay) => (isDay ? (d.popDay = v) : (d.popNight = v)));
  for (const x of halves('天氣現象')) if (twHour(x.t) >= 6 && twHour(x.t) < 18) day(twDate(x.t)).text = x.v.Weather || null;
  return out;
}

// A CWA value for the hour starting at t: the 3-hourly interval holding it,
// or the latest point at most 3 hours before.
export function cwaAt(series, t) {
  let best = null;
  for (const x of series || []) {
    if (x.end != null) {
      if (x.t <= t && t < x.end) return x.v;
    } else if (x.t <= t && t - x.t < 3 * HOUR && (!best || x.t > best.t)) best = x;
  }
  return best ? best.v : null;
}

const wgsOf = s => s.GeoInfo?.Coordinates?.find(c => c.CoordinateName === 'WGS84') || {};
// One station's latest observation (O-A0001-001 / O-A0003-001).
export function parseCwaObs(j) {
  const s = j?.records?.Station?.[0];
  if (!s) return null;
  const e = s.WeatherElement || {};
  return {
    id: s.StationId,
    name: s.StationName,
    at: Date.parse(s.ObsTime?.DateTime),
    temp: num(e.AirTemperature),
    humidity: num(e.RelativeHumidity),
    pressure: num(e.AirPressure),
    wind: { dir: num(e.WindDirection), speed: r1(num(e.WindSpeed) == null ? null : num(e.WindSpeed) * 3.6), gust: r1(num(e.GustInfo?.PeakGustSpeed) == null ? null : num(e.GustInfo.PeakGustSpeed) * 3.6) },
    weather: e.Weather && e.Weather !== '-99' ? e.Weather : null,
    uv: num(e.UVIndex),
    hi: num(e.DailyExtreme?.DailyHigh?.TemperatureInfo?.AirTemperature),
    lo: num(e.DailyExtreme?.DailyLow?.TemperatureInfo?.AirTemperature),
    lat: num(wgsOf(s).StationLatitude),
    lon: num(wgsOf(s).StationLongitude)
  };
}
// One rain gauge (O-A0002-001): mm in the last hour, 3 hours, 24 hours, and
// since midnight.
export function parseCwaRain(j) {
  const s = j?.records?.Station?.[0];
  if (!s) return null;
  const r = s.RainfallElement || {};
  return { id: s.StationId, name: s.StationName, at: Date.parse(s.ObsTime?.DateTime), h1: num(r.Past1hr?.Precipitation), h3: num(r.Past3hr?.Precipitation), h24: num(r.Past24hr?.Precipitation), today: num(r.Now?.Precipitation) };
}

export function parseCwaWarnings(j, county) {
  const out = [];
  for (const loc of j?.records?.location || []) {
    if (tai(loc.locationName) !== tai(county)) continue;
    for (const h of loc.hazardConditions?.hazards || []) {
      const title = `${h.info?.phenomena || ''}${h.info?.significance || ''}`;
      out.push({ title, text: '', from: twParse(h.validTime?.startTime), to: twParse(h.validTime?.endTime), severity: h.info?.significance || null });
    }
  }
  return out;
}

async function fetchCwa(env, lat, lon, fetchFn) {
  const auto = nearestStation(lat, lon, 'a');
  const manned = nearestStation(lat, lon, 'm');
  const gauge = nearestStation(lat, lon, 'r');
  // The township: the nearest station's, of any kind.
  const place = [auto, manned, gauge].filter(Boolean).sort((a, b) => a.km - b.km)[0];
  if (!place || place.km > NEAR_KM) return null;
  const ids = townIds(place.county);
  const obs = (set, s) => (s && s.km <= NEAR_KM ? getJson(fetchFn, cwaUrl(env, set, `&StationId=${s.id}`), env).catch(() => null) : null);
  const town = ids ? `&LocationName=${encodeURIComponent(place.town)}` : '';
  const [j3, j1w, a, m, r] = await Promise.all([
    ids ? getJson(fetchFn, cwaUrl(env, ids[0], town), env) : null,
    ids ? getJson(fetchFn, cwaUrl(env, ids[1], town), env) : null,
    auto && manned && auto.id === manned.id ? null : obs('O-A0001-001', auto),
    obs('O-A0003-001', manned),
    obs('O-A0002-001', gauge)
  ]);
  const withKm = (o, s) => o && { ...o, km: s.km };
  return {
    county: place.county,
    town: place.town,
    forecast: parseCwaTown(j3, j1w),
    station: withKm(parseCwaObs(a), auto) || withKm(parseCwaObs(m), manned),
    uvStation: withKm(parseCwaObs(m), manned),
    gauge: withKm(parseCwaRain(r), gauge)
  };
}

// ---- MOENV ----------------------------------------------------------------------

const AQI_LEVELS = [[50, '良好'], [100, '普通'], [150, '對敏感族群不健康'], [200, '對所有族群不健康'], [300, '非常不健康'], [Infinity, '危害']];
export const aqiLevel = aqi => (aqi == null ? null : AQI_LEVELS.find(([max]) => aqi <= max)[1]);

export function parseAir(sites, forecast, lat, lon, county) {
  let best = null;
  let d = Infinity;
  for (const s of sites || []) {
    const sLat = num(s.latitude);
    const sLon = num(s.longitude);
    if (sLat == null || sLon == null || num(s.aqi) == null) continue;
    const k = km(lat, lon, sLat, sLon);
    if (k < d) (d = k), (best = s);
  }
  if (!best || d > NEAR_KM) return null;
  const area = airArea(county || best.county);
  const fc = date => {
    const f = (forecast || []).find(x => x.area === area && x.forecastdate === date);
    return f ? { aqi: num(f.aqi), level: aqiLevel(num(f.aqi)), main: f.majorpollutant || null } : null;
  };
  const aqi = num(best.aqi);
  const now = Date.now();
  return {
    aqi,
    level: best.status || aqiLevel(aqi),
    pm25: num(best['pm2.5']),
    pm10: num(best.pm10),
    o3: num(best.o3),
    main: best.pollutant || null,
    station: { name: best.sitename, km: r1(d) },
    at: twParse(best.publishtime),
    forecast: {
      area,
      today: fc(twDate(now)),
      tomorrow: fc(twDate(now + 24 * HOUR)),
      days: [...new Set((forecast || []).filter(x => x.area === area).map(x => x.forecastdate))].sort().map(date => ({ date, ...fc(date) }))
    }
  };
}

// ---- KV --------------------------------------------------------------------------

export async function kvJson(env, key) {
  try {
    const v = env.RATE_LIMIT_KV && (await env.RATE_LIMIT_KV.get(key));
    return v ? JSON.parse(v) : null;
  } catch {
    return null;
  }
}
export async function kvPut(env, key, value, ttlS) {
  try {
    if (env.RATE_LIMIT_KV) await env.RATE_LIMIT_KV.put(key, JSON.stringify(value), { expirationTtl: ttlS });
  } catch {}
}

// A national list kept whole in KV (MOENV's AQI sites and forecast, CWA's
// warnings): fresh for `freshMs`, the last good copy used while under
// KEEP_MS if the source fails.
async function shared(env, key, freshMs, make, now) {
  const hit = await kvJson(env, key);
  if (hit && now - hit.at < freshMs) return { ...hit, state: 'ok' };
  try {
    const data = await make();
    const entry = { at: now, data };
    await kvPut(env, key, entry, KEEP_MS / 1000);
    return { ...entry, state: 'ok' };
  } catch (e) {
    if (hit && now - hit.at < KEEP_MS) return { ...hit, state: 'stale' };
    return { at: now, data: null, state: 'error', error: String(e.message || e).slice(0, 120) };
  }
}

// Today's Google calls, counted in KV: true while `calls` more fit under
// the cap (and counts them).
export async function googleAllowed(env, now, calls = 4) {
  const key = `weather:google:${twDate(now)}`;
  const n = Number(await kvJson(env, key)) || 0;
  if (n + calls > GOOGLE_DAILY_CALLS) return false;
  await kvPut(env, key, n + calls, 2 * 86_400);
  return true;
}

// Each township's middle (its stations' mean), for the place picker.
let townsCache = null;
export function townships() {
  if (townsCache) return townsCache;
  const by = new Map();
  for (const [, , lat, lon, county, town] of STATIONS) {
    const k = `${county}|${town}`;
    const t = by.get(k) || { county, town, lat: 0, lon: 0, n: 0 };
    t.lat += lat;
    t.lon += lon;
    t.n++;
    by.set(k, t);
  }
  const order = Object.keys(COUNTY_IDS);
  townsCache = [...by.values()]
    .sort((a, b) => order.indexOf(a.county) - order.indexOf(b.county) || a.town.localeCompare(b.town, 'zh-Hant'))
    .map(t => [t.county, t.town, Math.round((t.lat / t.n) * 1e4) / 1e4, Math.round((t.lon / t.n) * 1e4) / 1e4]);
  return townsCache;
}

// MOENV's AQI sites, kept whole in KV 20 minutes (the cell build and the
// cron's history share them).
export const airSites = (env, fetchFn, now) =>
  shared(env, 'weather:moenv:aqi', 20 * MIN, () => getJson(fetchFn, moenvUrl(env, 'aqx_p_432', '&limit=1000'), env).then(j => (Array.isArray(j) ? j : j.records || []).map(s => ({ sitename: s.sitename, county: s.county, aqi: s.aqi, status: s.status, pollutant: s.pollutant, pm10: s.pm10, 'pm2.5': s['pm2.5'], o3: s.o3, latitude: s.latitude, longitude: s.longitude, publishtime: s.publishtime }))), now);

// Each AQI site's last 48 hours (`weather:aqi:hist`, written by the hourly
// cron): { sites: { name: [[t, aqi, pm25], …] } }. Pure: the history with
// this reading added.
export function addAirReading(hist, sites, now) {
  const out = { sites: {} };
  // Every site's readings under 48 hours old (a site gone quiet empties out).
  for (const [name, list] of Object.entries(hist?.sites || {})) {
    const kept = list.filter(([x]) => now - x < 48 * HOUR);
    if (kept.length) out.sites[name] = kept;
  }
  for (const s of sites || []) {
    const t = twParse(s.publishtime);
    const aqi = num(s.aqi);
    if (!s.sitename || !t || aqi == null) continue;
    const list = (out.sites[s.sitename] || []).filter(([x]) => now - x < 48 * HOUR && x !== t);
    list.push([t, aqi, num(s['pm2.5'])]);
    out.sites[s.sitename] = list.sort((a, b) => a[0] - b[0]);
  }
  return out;
}

// MOENV's AQI history rows (aqx_p_488) → [[t, aqi, pm25]…], oldest first.
export function parseAirHistory(j) {
  return (Array.isArray(j) ? j : j?.records || [])
    .map(r => [twParse(r.datacreationdate), num(r.aqi), num(r['pm2.5'])])
    .filter(([t, a]) => t && a != null)
    .sort((a, b) => a[0] - b[0]);
}

// ---- The village: NLSC's point query -------------------------------------------------

const NLSC = 'https://api.nlsc.gov.tw/other/TownVillagePointQuery1/';
const xmlTag = (xml, tag) => (String(xml).match(new RegExp(`<${tag}>([^<]*)</${tag}>`)) || [])[1] || null;
export function parseVillage(xml) {
  const county = xmlTag(xml, 'ctyName');
  return county ? { county, town: xmlTag(xml, 'townName'), village: xmlTag(xml, 'villageName') } : { county: null, town: null, village: null };
}
// The place at lat / lon (to ~100 m), kept in Cloudflare's cache 30 days.
export async function whereIs(lat, lon, { fetchFn = fetch, cache = globalThis.caches?.default } = {}) {
  const la = (Math.round(lat * 1000) / 1000).toFixed(3);
  const lo = (Math.round(lon * 1000) / 1000).toFixed(3);
  const key = `https://weather.cache/where/${la},${lo}`;
  const hit = cache && (await cache.match(key).catch(() => null));
  if (hit) return hit.json();
  const res = await fetchFn(`${NLSC}${lo}/${la}`, { headers: { Accept: 'application/xml' } });
  const place = parseVillage(res.ok ? await res.text() : '');
  if (cache && (res.ok || place.county)) await cache.put(key, new Response(JSON.stringify(place), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=2592000' } })).catch(() => {});
  return place;
}

// ---- The blend --------------------------------------------------------------------

// Σ w_s × v_s over the sources that have a value, normalised.
export function blend(values, weights) {
  let sum = 0;
  let wSum = 0;
  for (const [s, v] of Object.entries(values)) {
    if (v == null) continue;
    const w = weights?.[s] ?? 0;
    sum += w * v;
    wSum += w;
  }
  return wSum ? sum / wSum : null;
}

// → { resp: the one-truth answer, bySource: each source's values (KV only) }.
export function assemble({ cell, now, google, cwa, air, warnings, weights = DEFAULT_WEIGHTS, partial = false }) {
  const bySource = { hours: [], days: [], now: null };
  const fc = cwa?.forecast;
  const gHours = google?.hours || [];
  // The timeline: Google's 48 hours, or CWA's own points if Google failed.
  const base = gHours.length ? gHours : (fc?.temp || []).filter(p => p.t >= now - HOUR && p.t < now + 48 * HOUR).map(p => ({ t: p.t }));
  const hours = base.map(g => {
    const cTemp = cwaAt(fc?.temp, g.t);
    const cFeels = cwaAt(fc?.feels, g.t);
    const cPop = cwaAt(fc?.pop, g.t);
    const popBy = { google: g.pop ?? null, cwa: cPop };
    const tempBy = { google: g.temp ?? null, cwa: cTemp };
    const pop = blend(popBy, weights.pop);
    const out = {
      ...g,
      temp: r1(blend(tempBy, weights.temp)),
      feels: r1(blend({ google: g.feels ?? null, cwa: cFeels }, weights.temp)),
      pop: pop == null ? null : Math.round(pop)
    };
    if (out.humidity == null) out.humidity = cwaAt(fc?.humidity, g.t);
    bySource.hours.push({ t: g.t, pop: popBy, temp: tempBy });
    return out;
  });

  const cDays = fc?.days || {};
  const days = (google?.days || []).map(d => {
    const c = cDays[d.date];
    const cPop = c ? Math.max(c.popDay ?? -1, c.popNight ?? -1) : -1;
    const popBy = { google: d.pop, cwa: cPop >= 0 ? cPop : null };
    const pop = blend(popBy, weights.pop);
    bySource.days.push({ date: d.date, pop: popBy, hi: { google: d.hi, cwa: c?.hi ?? null }, lo: { google: d.lo, cwa: c?.lo ?? null }, uv: { google: d.uvMax, cwa: c?.uv ?? null } });
    return {
      ...d,
      hi: r1(blend({ google: d.hi, cwa: c?.hi ?? null }, weights.temp)),
      lo: r1(blend({ google: d.lo, cwa: c?.lo ?? null }, weights.temp)),
      feelsHi: r1(blend({ google: d.feelsHi, cwa: c?.feelsHi ?? null }, weights.temp)),
      feelsLo: r1(blend({ google: d.feelsLo, cwa: c?.feelsLo ?? null }, weights.temp)),
      pop: pop == null ? null : Math.round(pop)
    };
  });
  // Google missing: CWA's week alone.
  if (!days.length) {
    for (const c of Object.values(cDays).sort((a, b) => a.date.localeCompare(b.date))) {
      const p = Math.max(c.popDay ?? -1, c.popNight ?? -1);
      days.push({ date: c.date, hi: c.hi, lo: c.lo, feelsHi: c.feelsHi, feelsLo: c.feelsLo, uvMax: c.uv, pop: p >= 0 ? p : null, day: { condition: { code: null, text: c.text || '', icon: null } } });
    }
  }

  const g = google?.current;
  const st = cwa?.station;
  // Measured beats forecast: a station this close and this recent gives
  // "now".
  const measured = st && st.temp != null && st.km <= 5 && now - st.at < 90 * MIN ? st.temp : null;
  const now_ = {
    temp: measured ?? g?.temp ?? st?.temp ?? null,
    feels: g?.feels ?? null,
    humidity: g?.humidity ?? st?.humidity ?? null,
    uv: g?.uv ?? cwa?.uvStation?.uv ?? null,
    wind: g?.wind ?? st?.wind ?? null,
    pressure: g?.pressure ?? st?.pressure ?? null,
    vis: g?.vis ?? null,
    cloud: g?.cloud ?? null,
    dew: g?.dew ?? null,
    day: g?.day ?? null,
    condition: g?.condition ?? (st?.weather ? { code: null, text: st.weather, icon: null } : null),
    rain1h: cwa?.gauge?.h1 ?? null,
    rainToday: cwa?.gauge?.today ?? g?.today?.mm ?? null,
    station: st ? { name: st.name, km: st.km, temp: st.temp, at: st.at } : null,
    gauge: cwa?.gauge ? { name: cwa.gauge.name, km: cwa.gauge.km, at: cwa.gauge.at } : null
  };

  bySource.now = { temp: { google: g?.temp ?? null, station: st?.temp ?? null } };
  const resp = {
    cell,
    at: now,
    tz: google?.tz || 'Asia/Taipei',
    place: cwa ? { county: cwa.county, town: cwa.town } : null,
    now: now_,
    hours,
    days,
    air: air || null,
    alerts: [...(warnings || []), ...(google?.alerts || [])].filter(a => !a.to || a.to > now),
    partial
  };
  resp.advice = advise(resp, now);
  resp.headline = headline(resp, now);
  return { resp, bySource };
}

// ---- One sentence (the numbers, said plainly; no model, no cost) ---------------

// "HH:MM" where the forecast is.
export function clockIn(ms, tz = 'Asia/Taipei') {
  try {
    return new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(ms));
  } catch {
    return twClock(ms);
  }
}
const hourIn = (ms, tz) => Number(clockIn(ms, tz).slice(0, 2));

// The next hours' rain, said once: when it starts and how likely, or that
// it stays dry.
export function rainPhrase(hours, now, span = 12, tz) {
  const next = (hours || []).filter(h => h.t + HOUR > now && h.t < now + span * HOUR && h.pop != null);
  if (!next.length) return null;
  const first = next.find(h => h.pop >= 50);
  const top = next.reduce((a, h) => (h.pop > a.pop ? h : a), next[0]);
  if (first) return first.t <= now ? `正在或即將下雨（${first.pop}%）` : `${hourIn(first.t, tz)} 點起可能下雨（${Math.max(first.pop, top.pop)}%）`;
  if (top.pop >= 30) return `${hourIn(top.t, tz)} 點前後有機會下雨（${top.pop}%）`;
  return `未來 ${span} 小時不太會下雨`;
}

export function headline(resp, now) {
  const tz = resp.tz;
  const parts = [];
  const c = resp.now?.condition?.text;
  if (c) parts.push(`現在${c}`);
  const rain = rainPhrase(resp.hours, now, 12, tz);
  if (rain) parts.push(rain);
  const evening = hourIn(now, tz) >= 18;
  const date = evening ? twDate(now + 24 * HOUR) : twDate(now);
  const d = resp.days?.find(x => x.date === date);
  if (d?.hi != null) parts.push(`${evening ? '明天' : '今天'}最高 ${Math.round(d.hi)}°${d.lo != null ? `、最低 ${Math.round(d.lo)}°` : ''}`);
  return parts.length ? parts.join('，') + '。' : '';
}

// The morning brief (push.js, check { weather }): today, in one line.
export function briefText(resp, now) {
  const tz = resp.tz;
  const parts = [];
  const rain = rainPhrase(resp.hours, now, 14, tz);
  if (rain) parts.push(rain);
  const d = resp.days?.find(x => x.date === twDate(now)) || resp.days?.[0];
  if (d?.hi != null) parts.push(`最高 ${Math.round(d.hi)}°${d.lo != null ? ` / 最低 ${Math.round(d.lo)}°` : ''}`);
  const sun = resp.advice?.find(a => a.kind === 'sun' && a.level !== 'none');
  if (sun) parts.push(`UV ${hourIn(sun.why.from, tz)}–${hourIn(sun.why.to, tz)} 點${sun.level}`);
  if (resp.air?.level) parts.push(`空氣${resp.air.level}`);
  const wear = resp.advice?.find(a => a.kind === 'wear');
  if (wear) parts.push(wear.text.replace(/^穿著：/, ''));
  const place = resp.place?.town || '';
  return { title: `${place ? place + ' ' : ''}今天天氣`, body: parts.join('，') };
}

// A notice's check (push.js): { weather: { lat, lon, kind: 'brief' | 'rain' } }.
// 'brief' answers at once; 'rain' answers only when the next 2 hours reach
// RAIN_ALERT (else null: push.js asks again in 15 minutes, until `until`).
export const RAIN_ALERT = 60;
export async function weatherCheck(env, w, { fetchFn = fetch, now = Date.now() } = {}) {
  const jobs = [];
  const resp = await cellForecast(env, { waitUntil: p => jobs.push(p) }, w.lat, w.lon, { fetchFn, now, freshMs: HOUR });
  if (w.kind === 'brief') {
    await Promise.all(jobs);
    return briefText(resp, now);
  }
  const soon = (resp.hours || []).filter(h => h.t + HOUR > now && h.t < now + 2 * HOUR && h.pop != null);
  const wet = soon.find(h => h.pop >= RAIN_ALERT);
  await Promise.all(jobs);
  if (!wet) return null;
  return { title: '☂️ 快下雨了', body: `${resp.place?.town ? resp.place.town + ' ' : ''}${clockIn(Math.max(wet.t, now), resp.tz)} 前後降雨機率 ${wet.pop}%，出門記得帶傘。` };
}

// ---- Advice (plan section D; thresholds in one table) ---------------------------

export const ADVICE = {
  umbrella: 50,
  umbrellaMaybe: 30,
  sunUv: 3,
  mask: { aqi: 100, pm25: 35 },
  heatFeels: 34,
  layersSwing: 8,
  wear: [[15, 'coat', '外套'], [20, 'jacket', '薄外套'], [26, 'sleeves', '長袖或短袖'], [Infinity, 'light', '輕薄短袖']],
  window: { from: '07:30', to: '17:00' }
};
export const uvLevel = uv => (uv == null ? null : uv < 3 ? '低' : uv < 6 ? '中' : uv < 8 ? '高' : uv < 11 ? '過量' : '危險');

const atClock = (date, clock) => Date.parse(`${date}T${clock}:00+08:00`);

// The window advice is for: today's school hours, or tomorrow's once today's
// are over.
export function adviceWindow(now, w = ADVICE.window) {
  let date = twDate(now);
  if (now >= atClock(date, w.to)) date = twDate(now + 24 * HOUR);
  return { date, from: Math.max(now - (now % HOUR), atClock(date, w.from)), to: atClock(date, w.to) };
}

export function advise(resp, now, w = ADVICE.window) {
  const win = adviceWindow(now, w);
  const hrs = resp.hours.filter(h => h.t + HOUR > win.from && h.t < win.to);
  const out = [];
  if (hrs.length) {
    const wet = hrs.reduce((a, h) => ((h.pop ?? -1) > (a.pop ?? -1) ? h : a), hrs[0]);
    if (wet.pop >= ADVICE.umbrella) out.push({ kind: 'umbrella', level: 'yes', text: `帶傘：${hourIn(wet.t, resp.tz)}時 ${wet.pop}% 會下雨`, why: { pop: wet.pop, at: wet.t } });
    else if (wet.pop >= ADVICE.umbrellaMaybe) out.push({ kind: 'umbrella', level: 'maybe', text: `帶傘：摺疊傘，${hourIn(wet.t, resp.tz)}時 ${wet.pop}%`, why: { pop: wet.pop, at: wet.t } });

    const sunny = hrs.filter(h => h.uv != null && h.uv >= ADVICE.sunUv);
    if (sunny.length) {
      const peak = Math.max(...sunny.map(h => h.uv));
      const from = sunny[0].t;
      const to = sunny[sunny.length - 1].t + HOUR;
      out.push({ kind: 'sun', level: uvLevel(peak), text: `防曬：${hourIn(from, resp.tz)}–${hourIn(to, resp.tz)}時 UV ${peak} ${uvLevel(peak)}`, why: { uv: peak, from, to } });
    }

    const feels = hrs.map(h => h.feels ?? h.temp).filter(v => v != null);
    if (feels.length) {
      const start = feels[0];
      const top = Math.max(...feels);
      const low = Math.min(...feels);
      const [, code, label] = ADVICE.wear.find(([max]) => start < max);
      const layers = top - low >= ADVICE.layersSwing;
      out.push({ kind: 'wear', level: code, text: `穿著：${label}${layers ? '，早晚加一件' : ''}`, why: { feels: start, high: top, low, layers } });
      if (top >= ADVICE.heatFeels) out.push({ kind: 'heat', level: 'hot', text: `炎熱：體感 ${Math.round(top)}°，多喝水`, why: { feels: top } });
    }
  }
  const air = resp.air;
  if (air && ((air.aqi ?? 0) > ADVICE.mask.aqi || (air.pm25 ?? 0) > ADVICE.mask.pm25)) {
    out.push({ kind: 'mask', level: air.level, text: `口罩：空氣${air.level}（${air.aqi}）`, why: { aqi: air.aqi, pm25: air.pm25, station: air.station?.name } });
  }
  // The week: best and worst of the next 7 days, a day for laundry.
  const week = resp.days.filter(d => d.date >= win.date).slice(0, 7).filter(d => d.pop != null && d.hi != null);
  if (week.length >= 3) {
    const score = d => d.pop + (d.uvMax ?? 0) * 3 + Math.abs(d.hi - 25) * 2;
    const sorted = [...week].sort((a, b) => score(a) - score(b));
    const laundry = week.find(d => d.pop < 20 && /CLEAR|SUNNY|PARTLY/.test(d.day?.condition?.code || ''));
    const md = date => `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}（${wd(date)}）`;
    out.push({ kind: 'week', level: 'info', text: `本週最佳：${md(sorted[0].date)}；最差：${md(sorted[sorted.length - 1].date)}${laundry ? `；適合曬衣：${md(laundry.date)}` : ''}`, why: { best: sorted[0].date, worst: sorted[sorted.length - 1].date, laundry: laundry?.date || null } });
    const plan = out[out.length - 1];
    plan.week = { text: '', days: week.map(d => ({ date: d.date, mark: d.date === sorted[0].date ? 'good' : d.date === sorted[sorted.length - 1].date ? 'bad' : d.date === laundry?.date ? 'yes' : null, v: d.date === sorted[0].date ? '最佳' : d.date === sorted[sorted.length - 1].date ? '最差' : d.date === laundry?.date ? '曬衣' : '' })) };
  }
  lifeAdvice(out, resp, now, win);
  return weekAdvice(out, resp, win);
}

// What the day holds for ordinary plans: the commute, the best hours
// outside, laundry, the window, sleep, washing the car. Short sentences.
const hoursIn = (resp, date, from, to, now) => resp.hours.filter(h => twDate(h.t) === date && twHour(h.t) >= from && twHour(h.t) < to && h.t + HOUR > now);
const dayWord = (date, now) => (date === twDate(now) ? '今天' : date === twDate(now + 24 * HOUR) ? '明天' : wd(date));
const maxPop = list => list.reduce((a, h) => Math.max(a, h.pop ?? 0), 0);
// A day's best 2 hours to run (6–20時; earlier is dark): { date, from, feels, pop, cost }.
export const RUN_OK = 45;
export function bestRun(resp, date, now, aqiBad = 0) {
  const hs = hoursIn(resp, date, 6, 21, now).filter(h => h.pop != null && (h.feels ?? h.temp) != null);
  const cost = h => {
    const f = h.feels ?? h.temp;
    return h.pop * 1.2 + Math.max(0, f - 24) * 6 + Math.max(0, 16 - f) * 4 + Math.max(0, (h.uv ?? 0) - 5) * 8 + ((h.thunder ?? 0) >= 40 ? 30 : 0) + aqiBad;
  };
  let best = null;
  for (let i = 0; i + 1 < hs.length; i++) {
    if (hs[i + 1].t - hs[i].t !== HOUR || twHour(hs[i + 1].t) > 20) continue;
    const c = (cost(hs[i]) + cost(hs[i + 1])) / 2;
    if (!best || c < best.cost) best = { date, from: twHour(hs[i].t), feels: Math.round(((hs[i].feels ?? hs[i].temp) + (hs[i + 1].feels ?? hs[i + 1].temp)) / 2), pop: Math.max(hs[i].pop, hs[i + 1].pop), cost: Math.round(c) };
  }
  return best;
}

export function lifeAdvice(out, resp, now, win) {
  const tz = resp.tz;
  // The commute: 7–9 and 17–19 on the advice day.
  const am = hoursIn(resp, win.date, 7, 9, now);
  const pm = hoursIn(resp, win.date, 17, 19, now);
  if (am.length || pm.length) {
    const say = (name, list) => (!list.length ? '' : maxPop(list) >= ADVICE.umbrellaMaybe ? `${name} ${maxPop(list)}% 會下雨` : `${name}乾爽`);
    const parts = [say('早上', am), say('傍晚', pm)].filter(Boolean);
    const wet = Math.max(maxPop(am), maxPop(pm));
    const text = parts.every(p => p.endsWith('乾爽')) ? (parts.length > 1 ? '早晚都乾爽' : parts[0]) : parts.join('，');
    out.push({ kind: 'commute', level: wet >= ADVICE.umbrella ? 'yes' : wet >= ADVICE.umbrellaMaybe ? 'maybe' : 'none', text: `通勤：${text}`, why: { am: maxPop(am), pm: maxPop(pm) } });
  }
  // Running: the best 2 hours (6–20時) of today and tomorrow — dry, not
  // hot (16–24° feels best), low UV, no thunder, the air fine.
  const aqiBad = (resp.air?.aqi ?? 0) > ADVICE.mask.aqi ? 40 : 0;
  const tomorrow = twDate(Date.parse(`${win.date}T12:00:00+08:00`) + 24 * HOUR);
  const today = twDate(now);
  const runToday = bestRun(resp, today, now, aqiBad);
  const runTomorrow = bestRun(resp, today === win.date ? tomorrow : win.date, now, aqiBad);
  const runs = [runToday, runTomorrow].filter(Boolean);
  if (runs.length) {
    const say = r => `${dayWord(r.date, now)} ${r.from}–${r.from + 2}時（${r.feels}°${r.pop >= 20 ? `，雨 ${r.pop}%` : ''}）`;
    const good = runs.filter(r => r.cost < RUN_OK);
    const text = good.length ? good.map(say).join('；') : `都不太理想，${say(runs.reduce((a, r) => (r.cost < a.cost ? r : a), runs[0]))}還可以`;
    out.push({ kind: 'run', level: good.length ? 'good' : 'none', text: `跑步：${text}`, why: { runs } });
  }
  // Laundry: every dry day this week (rain under 20%, not overcast), and
  // the drying hours of the first.
  const week = (resp.days || []).filter(d => d.date >= win.date).slice(0, 7);
  const dry = d => d.pop != null && d.pop < 20 && !/^CLOUDY|RAIN|SHOWER|THUNDER|DRIZZLE/.test(d.day?.condition?.code || '');
  if (week.length) {
    const good = week.filter(dry);
    const first = good[0];
    // Its driest hours: 9–16時, sunniest and least humid.
    const hrs = first ? hoursIn(resp, first.date, 9, 16, now).filter(h => h.pop != null && h.pop < 20) : [];
    const span = hrs.length >= 2 ? `（${twHour(hrs[0].t)}–${twHour(hrs[hrs.length - 1].t) + 1}時）` : '';
    out.push({ kind: 'laundry', level: first?.date === win.date ? 'good' : first ? 'later' : 'none', text: `曬衣：${good.length ? `${good.slice(0, 4).map(d => dayWord(d.date, now)).join('、')}${span}` : '這週用烘乾'}`, why: { date: first?.date || null, dates: good.map(d => d.date) } });
  }
  // The weekend ahead (within the week): which day is better.
  const weekend = week.filter(d => [0, 6].includes(new Date(d.date + 'T12:00:00Z').getUTCDay()));
  if (weekend.length) {
    const score = d => (d.pop ?? 0) + Math.abs((d.hi ?? 25) - 26) * 3 + Math.max(0, (d.uvMax ?? 0) - 7) * 4;
    const best = weekend.reduce((a, d) => (score(d) < score(a) ? d : a), weekend[0]);
    const wet = weekend.every(d => d.pop >= ADVICE.umbrella);
    out.push({ kind: 'weekend', level: wet ? 'yes' : 'good', text: `週末：${wet ? '兩天都可能下雨，排室內' : `${wd(best.date)}較好（${Math.round(best.hi)}°，雨 ${best.pop}%）`}`, why: { date: best.date } });
  }
  // Damp: the next day's humidity.
  const next24 = resp.hours.filter(h => h.t + HOUR > now && h.t < now + 24 * HOUR);
  const hum = next24.map(h => h.humidity).filter(v => v != null);
  if (hum.length >= 12) {
    const avg = Math.round(hum.reduce((a, b) => a + b, 0) / hum.length);
    if (avg >= 88) out.push({ kind: 'humid', level: 'yes', text: `除濕：濕度 ${avg}%，衣物易潮`, why: { humidity: avg } });
  }
  // A change in the lows: tomorrow against today.
  const dToday = (resp.days || []).find(d => d.date === today);
  const dNext = (resp.days || []).find(d => d.date === twDate(now + 24 * HOUR));
  if (dToday?.lo != null && dNext?.lo != null) {
    const diff = Math.round(dNext.lo - dToday.lo);
    if (diff <= -4) out.push({ kind: 'temp', level: 'yes', text: `降溫：明早 ${Math.round(dNext.lo)}°，比今天低 ${-diff}°`, why: { diff } });
    else if (diff >= 4) out.push({ kind: 'temp', level: 'none', text: `回暖：明早 ${Math.round(dNext.lo)}°，比今天高 ${diff}°`, why: { diff } });
  }
  // Wind: gusts in the next day.
  const gust = next24.reduce((a, h) => ((h.wind?.gust ?? 0) > (a?.wind?.gust ?? 0) ? h : a), null);
  if (gust?.wind?.gust >= 50) out.push({ kind: 'wind', level: 'yes', text: `強風：${twHour(gust.t)}時陣風 ${Math.round(gust.wind.gust)} km/h，收好陽台`, why: { gust: gust.wind.gust } });
  // Thunder in the advice day's hours.
  const storm = hoursIn(resp, win.date, 6, 22, now).filter(h => h.thunder >= 40);
  if (storm.length) out.push({ kind: 'thunder', level: 'yes', text: `雷雨：${twHour(storm[0].t)}–${twHour(storm[storm.length - 1].t) + 1}時可能打雷，避開戶外`, why: { from: storm[0].t } });
  // Fog: the next day's visibility under 1 km.
  const fog = next24.find(h => h.vis != null && h.vis <= 1);
  if (fog) out.push({ kind: 'fog', level: 'yes', text: `起霧：${twHour(fog.t)}時能見度 ${fog.vis} 公里，開車小心`, why: { vis: fog.vis } });
  // The window: air good and no rain now, or air bad.
  const air = resp.air;
  const h0 = resp.hours.find(h => h.t + HOUR > now);
  if (air?.aqi != null) {
    if (air.aqi <= 50 && (h0?.pop ?? 0) < 30) out.push({ kind: 'window', level: 'good', text: '開窗：空氣好，可通風', why: { aqi: air.aqi } });
    else if (air.aqi > ADVICE.mask.aqi) out.push({ kind: 'window', level: 'bad', text: '開窗：空氣差，關窗', why: { aqi: air.aqi } });
  }
  // Sleep: tonight 23–5 (or the night now, before 6).
  const night = twHour(now) < 6 ? twDate(now - 24 * HOUR) : twDate(now);
  const sleepHours = resp.hours.filter(h => h.t + HOUR > now && ((twDate(h.t) === night && twHour(h.t) >= 23) || (twDate(h.t) === twDate(Date.parse(`${night}T12:00:00+08:00`) + 24 * HOUR) && twHour(h.t) < 5)));
  const nf = sleepHours.map(h => h.feels ?? h.temp).filter(v => v != null);
  if (nf.length) {
    const v = Math.round(nf.reduce((a, b) => a + b, 0) / nf.length);
    const humid = sleepHours.some(h => h.humidity >= 90);
    const how = v >= 28 ? '開冷氣' : v >= 25 ? (humid ? '開除濕' : '開電扇') : v >= 20 ? '舒適' : v >= 16 ? '蓋薄被' : '蓋厚被';
    out.push({ kind: 'sleep', level: v >= 28 ? 'hot' : v < 16 ? 'cold' : 'none', text: `睡覺：今晚 ${v}°，${how}`, why: { feels: v } });
  }
  // Washing the car: the next 3 days dry.
  const next3 = (resp.days || []).filter(d => d.date > twDate(now)).slice(0, 3);
  if (next3.length === 3 && next3.every(d => d.pop != null && d.pop < 30) && (h0?.pop ?? 0) < 30) out.push({ kind: 'carwash', level: 'good', text: '洗車：3 天不下雨', why: {} });
}

const wd = date => `週${'日一二三四五六'[new Date(date + 'T12:00:00Z').getUTCDay()]}`;
const listDays = dates => dates.map(wd).join('、');
const WEAR_SHORT = { coat: '外套', jacket: '薄外套', sleeves: '長袖', light: '短袖' };
const wearOf = d => {
  // The day's feel when people are out: a third of the way from low to high.
  const lo = d.feelsLo ?? d.lo;
  const hi = d.feelsHi ?? d.hi;
  if (lo == null || hi == null) return null;
  const v = lo + (hi - lo) / 3;
  const [, code, label] = ADVICE.wear.find(([max]) => v < max);
  return { code, label };
};

// Each piece of advice for the coming 7 days too (`week`: a sentence and a
// mark for each day), and an entry for a kind today doesn't need when the
// week does.
export function weekAdvice(out, resp, win) {
  const days = (resp.days || []).filter(d => d.date >= win.date).slice(0, 7);
  if (days.length < 3) return out;
  const get = kind => out.find(a => a.kind === kind);
  const add = (kind, today, week, why = {}) => {
    let a = get(kind);
    if (!a) {
      if (!week.notable) return;
      a = { kind, level: 'none', text: today, why };
      out.push(a);
    }
    a.week = { text: week.text, days: week.days };
  };

  const wet = days.filter(d => d.pop >= ADVICE.umbrella).map(d => d.date);
  const damp = days.filter(d => d.pop >= ADVICE.umbrellaMaybe && d.pop < ADVICE.umbrella).map(d => d.date);
  add('umbrella', '帶傘：不太會下雨', {
    notable: wet.length + damp.length > 0,
    text: wet.length ? `${listDays(wet)}要帶傘${damp.length ? `；${listDays(damp)}可能有雨` : ''}` : damp.length ? `${listDays(damp)}可能有雨，備摺疊傘` : '這一週都不太會下雨',
    days: days.map(d => ({ date: d.date, mark: d.pop >= ADVICE.umbrella ? 'yes' : d.pop >= ADVICE.umbrellaMaybe ? 'maybe' : null, v: d.pop != null ? `${d.pop}%` : '' }))
  });

  const strong = days.filter(d => d.uvMax >= 6);
  const top = days.reduce((a, d) => ((d.uvMax ?? -1) > (a?.uvMax ?? -1) ? d : a), null);
  add('sun', '防曬：紫外線不強', {
    notable: strong.length > 0,
    text: top?.uvMax >= ADVICE.sunUv ? `${wd(top.date)}最強（UV ${top.uvMax} ${uvLevel(top.uvMax)}）${strong.length ? `，${strong.length} 天紫外線高，外出防曬` : ''}` : '這一週紫外線都不強',
    days: days.map(d => ({ date: d.date, mark: d.uvMax >= 8 ? 'bad' : d.uvMax >= 6 ? 'yes' : d.uvMax >= ADVICE.sunUv ? 'maybe' : null, v: d.uvMax != null ? String(d.uvMax) : '' }))
  });

  const wears = days.map(wearOf);
  const firstWear = wears.find(Boolean);
  const change = firstWear ? days.findIndex((d, i) => wears[i] && wears[i].code !== firstWear.code) : -1;
  const lo = Math.min(...days.map(d => d.lo ?? Infinity));
  const hi = Math.max(...days.map(d => d.hi ?? -Infinity));
  const order = ADVICE.wear.map(([, code]) => code);
  add('wear', '', {
    notable: false,
    text: `這週 ${Math.round(lo)}–${Math.round(hi)}°${change > 0 ? `，${wd(days[change].date)}起${order.indexOf(wears[change].code) < order.indexOf(firstWear.code) ? '轉涼' : '轉熱'}，${wears[change].label}` : ''}`,
    days: days.map((d, i) => ({ date: d.date, mark: wears[i] ? wears[i].code : null, v: wears[i] ? WEAR_SHORT[wears[i].code] : '' }))
  });

  const hot = days.filter(d => (d.feelsHi ?? d.hi) >= ADVICE.heatFeels).map(d => d.date);
  add('heat', '炎熱：不會太熱', {
    notable: hot.length > 0,
    text: hot.length ? `${listDays(hot)}體感超過 ${ADVICE.heatFeels}°，多喝水` : '這一週沒有酷熱的日子',
    days: days.map(d => ({ date: d.date, mark: (d.feelsHi ?? d.hi) >= ADVICE.heatFeels ? 'bad' : null, v: d.feelsHi != null ? `${Math.round(d.feelsHi)}°` : '' }))
  });

  const run = get('run');
  if (run) {
    const aqiBad = (resp.air?.aqi ?? 0) > ADVICE.mask.aqi ? 40 : 0;
    run.week = { text: '', days: days.map(d => {
      const r = bestRun(resp, d.date, 0, aqiBad);
      return { date: d.date, mark: !r ? null : r.cost < RUN_OK ? 'good' : r.cost < 80 ? 'maybe' : 'bad', v: r ? `${r.from}時` : '' };
    }) };
  }
  const dryDay = d => d.pop != null && d.pop < 20 && !/^CLOUDY|RAIN|SHOWER|THUNDER|DRIZZLE/.test(d.day?.condition?.code || '');
  const laundry = get('laundry');
  if (laundry) laundry.week = { text: '', days: days.map(d => ({ date: d.date, mark: dryDay(d) ? 'good' : d.pop != null && d.pop < 40 ? 'maybe' : 'bad', v: dryDay(d) ? '可' : d.pop != null && d.pop < 40 ? '普' : '不' })) };

  const air = (resp.air?.forecast?.days || []).filter(d => d.date >= win.date && d.aqi != null);
  if (air.length) {
    const bad = air.filter(d => d.aqi > ADVICE.mask.aqi).map(d => d.date);
    const fair = air.filter(d => d.aqi > 50 && d.aqi <= ADVICE.mask.aqi).map(d => d.date);
    const byDate = Object.fromEntries(air.map(d => [d.date, d]));
    add('mask', '口罩：空氣還可以', {
      notable: bad.length > 0,
      text: bad.length ? `${listDays(bad)}空氣差，戴口罩` : fair.length ? `${listDays(fair)}空氣普通，敏感的人留意` : '預報的幾天空氣都良好',
      days: days.map(d => ({ date: d.date, mark: byDate[d.date] ? (byDate[d.date].aqi > ADVICE.mask.aqi ? 'bad' : byDate[d.date].aqi > 50 ? 'maybe' : 'good') : null, v: byDate[d.date] ? String(byDate[d.date].aqi) : '' }))
    });
  }
  return out;
}

// ---- One cell, end to end ------------------------------------------------------------

export async function buildCell(env, lat, lon, { fetchFn = fetch, now = Date.now(), prev = null } = {}) {
  const cell = cellOf(lat, lon);
  const keep = part => (prev?.parts?.[part] && now - prev.parts[part].at < KEEP_MS ? prev.parts[part] : null);
  const settle = async (part, make) => {
    try {
      const v = await make();
      return v == null ? { state: 'n/a', at: now, v: null } : { state: 'ok', at: now, v };
    } catch (e) {
      const old = keep(part);
      console.log('weather source failed', part, String(e.message || e).slice(0, 160));
      return old ? { state: 'stale', at: old.at, v: old.v } : { state: 'error', at: now, v: null };
    }
  };
  const inTaiwan = (nearestStation(lat, lon, 'r')?.km ?? Infinity) <= NEAR_KM;
  // Hours 49–240: fetched every FAR_MS, kept between.
  const farPrev = prev?.parts?.far && now - prev.parts.far.at < 2 * 86_400_000 ? prev.parts.far : null;
  const wantFar = !farPrev || now - farPrev.at >= (farPrev.partial ? FAR_RETRY_MS : FAR_MS);
  // Google's air hours: every FAR_MS too, in Taiwan (its AQI is MOENV's
  // scale), kept between; a key without the Air Quality API just goes without.
  const gairPrev = prev?.parts?.gair && now - prev.parts.gair.at < 2 * 86_400_000 ? prev.parts.gair : null;
  const gairNoted = prev?.parts?.gairOff && now - prev.parts.gairOff < 86_400_000 ? prev.parts.gairOff : null;
  const wantGair = env.GOOGLE_WEATHER_KEY && inTaiwan && !gairNoted && (!gairPrev || now - gairPrev.at >= FAR_MS);
  // (Counted before the weather's calls: KV's counter isn't atomic.)
  const gairJob =
    wantGair && (await googleAllowed(env, now, 1))
      ? fetchGoogleAir(env, lat, lon, fetchFn, now).then(
          v => ({ ok: true, v }),
          e => (console.log('weather google air failed', String(e.message || e).slice(0, 160)), { ok: false, off: /\b40[03]\b/.test(String(e.message)) })
        )
      : null;
  // Google's forecast from under GOOGLE_FC_MS ago: only its current conditions again.
  const gFc = prev?.parts?.google?.v && now - (prev.parts.google.fcAt ?? prev.parts.google.at) < GOOGLE_FC_MS ? prev.parts.google : null;
  const googleNowOnly = async () => {
    const r = await settle('google', async () => ({ ...gFc.v, ...(await fetchGoogleNow(env, lat, lon, fetchFn)) }));
    return { ...r, fcAt: gFc.fcAt ?? gFc.at };
  };
  const [google, cwa, aqi, aqf, warn, weights, aqiHist, gairRes] = await Promise.all([
    !env.GOOGLE_WEATHER_KEY ? { state: 'off', v: null } : gFc && !wantFar ? ((await googleAllowed(env, now, 1)) ? googleNowOnly() : { state: 'ok', ...gFc }) : (await googleAllowed(env, now, wantFar ? 12 : 4)) ? settle('google', () => fetchGoogle(env, lat, lon, fetchFn, !inTaiwan, wantFar)) : wantFar && (await googleAllowed(env, now, 4)) ? settle('google', () => fetchGoogle(env, lat, lon, fetchFn, !inTaiwan)) : keep('google') ? { state: 'stale', ...keep('google') } : { state: 'capped', v: null },
    env.CWA_KEY && inTaiwan ? settle('cwa', () => fetchCwa(env, lat, lon, fetchFn)) : { state: inTaiwan ? 'off' : 'n/a', v: null },
    env.MOENV_KEY && inTaiwan ? airSites(env, fetchFn, now) : null,
    env.MOENV_KEY && inTaiwan ? shared(env, 'weather:moenv:aqf', 3 * HOUR, () => getJson(fetchFn, moenvUrl(env, 'aqf_p_01', '&limit=100'), env).then(j => (Array.isArray(j) ? j : j.records || []).map(f => ({ area: f.area, forecastdate: f.forecastdate, aqi: f.aqi, majorpollutant: f.majorpollutant }))), now) : null,
    env.CWA_KEY && inTaiwan ? shared(env, 'weather:cwa:warn', 30 * MIN, () => getJson(fetchFn, cwaUrl(env, 'W-C0033-001'), env), now) : null,
    kvJson(env, 'weather:weights'),
    inTaiwan ? kvJson(env, 'weather:aqi:hist') : null,
    gairJob
  ]);
  const gair = gairRes?.ok && gairRes.v ? { at: now, v: gairRes.v } : gairPrev;
  const county = cwa.v?.county || null;
  const air = aqi?.data ? parseAir(aqi.data, aqf?.data, lat, lon, county) : null;
  if (air) {
    air.history = (aqiHist?.sites?.[air.station.name] || []).filter(([t]) => now - t < 48 * HOUR).map(([t, a, pm25]) => ({ t, aqi: a, pm25 }));
    // The station's own reading always ends the history.
    if (air.at && air.aqi != null && !air.history.some(h => h.t === air.at)) air.history.push({ t: air.at, aqi: air.aqi, pm25: air.pm25 });
    const fc = airForecast(air, gair?.v, now);
    air.hourly = fc.hours;
    air.forecast.days = fc.days;
  }
  // The far hours: fresh from this refresh, else the last ones; joined after
  // the near ones.
  // A partial set (a page failed) is kept only if it reaches further than
  // the last one, and asked again after FAR_RETRY_MS rather than FAR_MS.
  const got = google.state === 'ok' && google.v?.far?.length ? { at: now, v: google.v.far, ...(google.v.farError ? { partial: true, error: google.v.farError } : {}) } : null;
  const reach = x => (x?.v?.length ? x.v[x.v.length - 1].t : 0);
  const far = got && (!got.partial || reach(got) >= reach(farPrev)) ? got : farPrev ? { ...farPrev, ...(google.v?.farError ? { error: google.v.farError } : {}) } : got;
  const googleV = google.v ? { ...google.v, far: undefined } : null;
  if (googleV && far?.v?.length) {
    const end = googleV.hours.length ? googleV.hours[googleV.hours.length - 1].t : now;
    googleV.hours = [...googleV.hours, ...far.v.filter(h => h.t > end)];
  }
  const sources = {
    google: google.state,
    cwa: cwa.state,
    moenv: aqi ? aqi.state : env.MOENV_KEY ? 'n/a' : 'off'
  };
  const partial = Object.values(sources).some(v => v === 'error' || v === 'stale');
  const { resp, bySource } = assemble({ cell, now, google: googleV, cwa: cwa.v, air, warnings: warn?.data && county ? parseCwaWarnings(warn.data, county) : [], weights: weights || DEFAULT_WEIGHTS, partial });
  // The scoring needs the next 24 hours only.
  bySource.hours = bySource.hours.filter(h => h.t < now + 48 * HOUR);
  const nearOnly = google.v ? { ...google.v, far: undefined } : null;
  return { at: now, resp, bySource, sources, parts: { google: google.state === 'ok' || google.state === 'stale' ? { at: google.at, fcAt: google.fcAt ?? google.at, v: nearOnly } : null, cwa: cwa.state === 'ok' || cwa.state === 'stale' ? { at: cwa.at, v: cwa.v } : null, far: far || null, gair: gair || null, gairOff: gairRes?.off ? now : gairNoted } };
}

// The cells people opened lately (`weather:recent`, cell → when), for the
// scoring (weather-skill.js): written at most every 6 hours a cell.
export async function noteRecent(env, cell, now) {
  const r = (await kvJson(env, 'weather:recent')) || {};
  if (r[cell] && now - r[cell] < 6 * HOUR) return;
  r[cell] = now;
  const keep = Object.entries(r)
    .filter(([, t]) => now - t < 3 * 86_400_000)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20);
  await kvPut(env, 'weather:recent', Object.fromEntries(keep), 4 * 86_400);
}

// The cell from KV, fresh or refreshed (in the background when it's merely
// old). `freshMs` longer for the open status sample.
export async function cellForecast(env, ctx, lat, lon, { fetchFn = fetch, now = Date.now(), freshMs = FRESH_MS } = {}) {
  const key = `weather:cell:${cellOf(lat, lon)}`;
  // (An entry from before one truth, without `bySource`, is not used.)
  const found = await kvJson(env, key);
  const hit = found?.bySource ? found : null;
  const refresh = async () => {
    const entry = await buildCell(env, lat, lon, { fetchFn, now, prev: hit });
    await kvPut(env, key, entry, KEEP_MS / 1000);
    await noteRecent(env, cellOf(lat, lon), now);
    return entry;
  };
  if (hit && now - hit.at < freshMs) return { ...hit.resp, cached: true };
  if (hit && now - hit.at < STALE_MS) {
    // (No lock: KV's free tier has 1,000 writes a day, and two refreshes
    // of one cell at once are harmless.)
    const job = refresh().catch(e => console.log('weather refresh failed', String(e.message || e)));
    if (ctx?.waitUntil) ctx.waitUntil(job);
    return { ...hit.resp, cached: true, refreshing: true };
  }
  return (await refresh()).resp;
}

// ---- Status and samples ----------------------------------------------------------------

const CHECKS = {
  google: env => [googleUrl(env, 'currentConditions:lookup', TAIPEI.lat, TAIPEI.lon), j => j && j.temperature != null],
  cwa: env => [cwaUrl(env, 'O-A0001-001', '&limit=1'), j => j && String(j.success) === 'true'],
  moenv: env => [moenvUrl(env, 'aqx_p_432', '&limit=1'), j => (Array.isArray(j?.records) ? j.records.length > 0 : Array.isArray(j) && j.length > 0)]
};

const { lat: LA, lon: LO } = TAIPEI;
const SAMPLES = {
  'google-current': env => googleUrl(env, 'currentConditions:lookup', LA, LO),
  'google-hours': env => googleUrl(env, 'forecast/hours:lookup', LA, LO, '&hours=240&pageSize=240'),
  'google-hours-24': env => googleUrl(env, 'forecast/hours:lookup', LA, LO, '&hours=48'),
  'google-days': env => googleUrl(env, 'forecast/days:lookup', LA, LO, '&days=10&pageSize=10'),
  'google-alerts': env => googleUrl(env, 'publicAlerts:lookup', LA, LO, '', false),
  'cwa-town-3d': env => cwaUrl(env, 'F-D0047-061', '&LocationName=' + encodeURIComponent('信義區')),
  'cwa-town-1w': env => cwaUrl(env, 'F-D0047-063', '&LocationName=' + encodeURIComponent('信義區')),
  'cwa-town-all': env => cwaUrl(env, 'F-D0047-089', '&LocationName=' + encodeURIComponent('臺北市')),
  'cwa-stations': env => cwaUrl(env, 'O-A0001-001'),
  'cwa-manned': env => cwaUrl(env, 'O-A0003-001'),
  'cwa-rain': env => cwaUrl(env, 'O-A0002-001'),
  'cwa-uv': env => cwaUrl(env, 'O-A0005-001'),
  'cwa-warn': env => cwaUrl(env, 'W-C0033-001'),
  'moenv-aqi': env => moenvUrl(env, 'aqx_p_432', '&limit=1000'),
  'moenv-aqf': env => moenvUrl(env, 'aqf_p_01', '&limit=100'),
  'moenv-uv': env => moenvUrl(env, 'uv_s_01', '&limit=100'),
  'moenv-aqi-hist': env => moenvUrl(env, 'aqx_p_488', `&limit=60&filters=${encodeURIComponent('sitename,EQ,松山')}&sort=${encodeURIComponent('datacreationdate desc')}`),
  'moenv-aqi-hist-plain': env => moenvUrl(env, 'aqx_p_488', '&limit=3'),
  'google-air': env => [`${GOOGLE_AIR}forecast:lookup?key=${encodeURIComponent(env.GOOGLE_WEATHER_KEY)}`, googleAirBody(LA, LO, Date.now())]
};
// Each county's township datasets, by the county they name (checks COUNTY_IDS).
for (const county of Object.keys(COUNTY_IDS)) {
  const [d3, w1] = townIds(county);
  for (const id of [d3, w1]) SAMPLES[`cwa-${id}`] = env => cwaUrl(env, id, `&ElementName=${encodeURIComponent('天氣現象')}&limit=1`);
}

async function probe(env, source, fetchFn) {
  if (!env[KEYS[source]]) return { key: false, ok: false, note: 'not set' };
  const [url, good] = CHECKS[source](env);
  const t0 = Date.now();
  try {
    const res = await fetchFn(url, { headers: { Accept: 'application/json' } });
    const text = await res.text();
    let body = null;
    try {
      body = JSON.parse(text);
    } catch {}
    const ok = res.ok && !!good(body);
    return { key: true, ok, status: res.status, ms: Date.now() - t0, ...(ok ? {} : { note: scrub(text.slice(0, 300), env) }) };
  } catch (e) {
    return { key: true, ok: false, note: scrub(String(e?.message || e).slice(0, 200), env) };
  }
}

export async function weatherStatus(env, fetchFn = fetch) {
  const entries = await Promise.all(Object.keys(KEYS).map(async s => [s, await probe(env, s, fetchFn)]));
  return { at: Date.now(), sources: Object.fromEntries(entries) };
}

// The cells opened lately, without where they are: each one's age, its
// sources' states and the blank hours in its answer (for finding gaps).
export async function cellsReport(env, now) {
  const recent = (await kvJson(env, 'weather:recent')) || {};
  const cells = [];
  for (const cell of Object.keys(recent)) {
    const hit = await kvJson(env, `weather:cell:${cell}`);
    if (!hit?.resp) continue;
    const hours = hit.resp.hours || [];
    const blank = {};
    hours.forEach((h, i) => {
      for (const k of ['temp', 'feels', 'pop', 'uv', 'mm']) if (h[k] == null) (blank[k] ||= []).push(i);
    });
    const steps = hours.slice(1).map((h, i) => h.t - hours[i].t).filter(d => d !== HOUR).length;
    cells.push({ ageMin: Math.round((now - hit.at) / MIN), sources: hit.sources, hours: hours.length, first: hours[0] ? new Date(hours[0].t).toISOString() : null, notHourly: steps, blank: Object.fromEntries(Object.entries(blank).map(([k, v]) => [k, `${v.length}: ${v.slice(0, 12).join(',')}`])), days: (hit.resp.days || []).length, airHourly: hit.resp.air?.hourly?.length ?? null, airHistory: hit.resp.air?.history?.length ?? null, far: hit.parts?.far ? Math.round((now - hit.parts.far.at) / MIN) : null, farHours: hit.parts?.far?.v?.length ?? null, farPartial: Boolean(hit.parts?.far?.partial), farError: hit.parts?.far?.error || null, last: hours.length ? new Date(hours[hours.length - 1].t).toISOString() : null });
  }
  return { at: now, googleCallsToday: Number(await kvJson(env, `weather:google:${twDate(now)}`)) || 0, cap: GOOGLE_DAILY_CALLS, cells };
}

async function cachedText(env, key, ttl, make) {
  const kv = env.RATE_LIMIT_KV;
  const hit = kv && (await kv.get(key));
  if (hit) return hit;
  const text = await make();
  if (kv) await kv.put(key, text, { expirationTtl: ttl });
  return text;
}

// ---- Route ---------------------------------------------------------------------------

export async function handleWeather(request, env, headers, path, { session = null, limited = () => false, ctx = null, fetchFn = fetch, cf = request.cf, cache } = {}) {
  const send = (data, status = 200) => new Response(typeof data === 'string' ? data : JSON.stringify(data), { status, headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8' } });
  if (request.method !== 'GET') return send({ code: 'GET_ONLY' }, 405);
  const q = new URL(request.url).searchParams;
  if (path === '/weather/status') {
    const sample = q.get('sample');
    if (sample) {
      if (!SAMPLES[sample]) return send({ code: 'NOT_FOUND', samples: Object.keys(SAMPLES) }, 404);
      return send(
        await cachedText(env, `weather:sample:${sample}`, 3600, async () => {
          const made = SAMPLES[sample](env);
          const [url, body] = Array.isArray(made) ? made : [made, null];
          const res = await fetchFn(url, body ? { method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : { headers: { Accept: 'application/json' } });
          return JSON.stringify({ status: res.status, body: scrub(await res.text(), env) });
        })
      );
    }
    if (q.get('cells')) return send(await cellsReport(env, Date.now()));
    return send(await cachedText(env, 'weather:status', 600, async () => JSON.stringify(await weatherStatus(env, fetchFn))));
  }
  if (path === '/weather/places') {
    return new Response(JSON.stringify(townships()), { headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=86400' } });
  }
  if (path === '/weather/where') {
    if (!session) return send({ code: 'ECO_TOKEN_INVALID' }, 401);
    if (limited()) return send({ code: 'RATE_LIMITED' }, 429);
    const lat = Number(q.get('lat'));
    const lon = Number(q.get('lon'));
    if (!q.get('lat') || !q.get('lon') || !(Math.abs(lat) <= 90) || !(Math.abs(lon) <= 180)) return send({ code: 'BAD_LOCATION' }, 400);
    return send(await whereIs(lat, lon, { fetchFn, ...(cache !== undefined ? { cache } : {}) }).catch(() => ({ county: null, town: null, village: null })));
  }
  if (path === '/weather') {
    if (!session) return send({ code: 'ECO_TOKEN_INVALID' }, 401);
    if (limited()) return send({ code: 'RATE_LIMITED' }, 429);
    let lat = Number(q.get('lat'));
    let lon = Number(q.get('lon'));
    let located = { by: 'device' };
    if (q.get('auto')) {
      // Where the IP says: a city's middle, good enough for a first look.
      lat = Number(cf?.latitude);
      lon = Number(cf?.longitude);
      if (!cf?.latitude || !cf?.longitude) return send({ code: 'NO_LOCATION' }, 404);
      located = { by: 'ip', city: cf.city || null };
    } else if (!q.get('lat') || !q.get('lon')) return send({ code: 'BAD_LOCATION' }, 400);
    if (!(Math.abs(lat) <= 90) || !(Math.abs(lon) <= 180)) return send({ code: 'BAD_LOCATION' }, 400);
    return send({ ...(await cellForecast(env, ctx, lat, lon, { fetchFn })), located, lat: Math.round(lat * 100) / 100, lon: Math.round(lon * 100) / 100 });
  }
  return send({ code: 'NOT_FOUND' }, 404);
}
