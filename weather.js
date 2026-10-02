// ---- weather.js ----
// Orbit Weather's server side (docs/WEATHER-PLAN.md), routed by worker.js:
//
//   GET /weather/status            each source's key: set, and a live call
//                                  answering (cached 10 minutes; no key is
//                                  ever shown)
//   GET /weather/status?sample=<n> one source's real answer at Taipei 101
//                                  (SAMPLES; cached an hour), for the
//                                  tests' fixtures
//
// Keys (Worker secrets): GOOGLE_WEATHER_KEY, CWA_KEY, MOENV_KEY.

export const GOOGLE = 'https://weather.googleapis.com/v1/';
export const CWA = 'https://opendata.cwa.gov.tw/api/v1/rest/datastore/';
export const MOENV = 'https://data.moenv.gov.tw/api/v2/';
const KEYS = { google: 'GOOGLE_WEATHER_KEY', cwa: 'CWA_KEY', moenv: 'MOENV_KEY' };
const TAIPEI = { lat: 25.034, lon: 121.565 };

export function googleUrl(env, path, lat, lon, extra = '') {
  return `${GOOGLE}${path}?key=${encodeURIComponent(env.GOOGLE_WEATHER_KEY)}&location.latitude=${lat}&location.longitude=${lon}&languageCode=zh-TW&unitsSystem=METRIC${extra}`;
}
export const cwaUrl = (env, id, extra = '') => `${CWA}${id}?Authorization=${encodeURIComponent(env.CWA_KEY)}&format=JSON${extra}`;
export const moenvUrl = (env, id, extra = '') => `${MOENV}${id}?api_key=${encodeURIComponent(env.MOENV_KEY)}&format=json${extra}`;

// What each source answers when its key works (the plan's step A tests).
const CHECKS = {
  google: env => [googleUrl(env, 'currentConditions:lookup', TAIPEI.lat, TAIPEI.lon), j => j && j.temperature != null],
  cwa: env => [cwaUrl(env, 'O-A0001-001', '&limit=1'), j => j && String(j.success) === 'true'],
  moenv: env => [moenvUrl(env, 'aqx_p_432', '&limit=1'), j => Array.isArray(j?.records) ? j.records.length > 0 : Array.isArray(j) && j.length > 0]
};

const { lat: LA, lon: LO } = TAIPEI;
const SAMPLES = {
  'google-current': env => googleUrl(env, 'currentConditions:lookup', LA, LO),
  'google-hours': env => googleUrl(env, 'forecast/hours:lookup', LA, LO, '&hours=240&pageSize=240'),
  'google-hours-24': env => googleUrl(env, 'forecast/hours:lookup', LA, LO, '&hours=48'),
  'google-days': env => googleUrl(env, 'forecast/days:lookup', LA, LO, '&days=10&pageSize=10'),
  'google-alerts': env => googleUrl(env, 'publicAlerts:lookup', LA, LO),
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
  'moenv-uv': env => moenvUrl(env, 'uv_s_01', '&limit=100')
};

// A key never leaves the Worker, even inside an upstream's error text.
export function scrub(text, env) {
  let out = String(text);
  for (const name of Object.values(KEYS)) {
    const k = env[name];
    if (k && k.length >= 8) out = out.split(k).join('***').split(encodeURIComponent(k)).join('***');
  }
  return out;
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

async function cached(env, key, ttl, make) {
  const kv = env.RATE_LIMIT_KV;
  const hit = kv && (await kv.get(key));
  if (hit) return hit;
  const text = await make();
  if (kv) await kv.put(key, text, { expirationTtl: ttl });
  return text;
}

export async function handleWeather(request, env, headers, path, fetchFn = fetch) {
  const send = (text, status = 200) => new Response(text, { status, headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8' } });
  if (request.method !== 'GET') return send(JSON.stringify({ code: 'GET_ONLY' }), 405);
  if (path === '/weather/status') {
    const sample = new URL(request.url).searchParams.get('sample');
    if (sample) {
      if (!SAMPLES[sample]) return send(JSON.stringify({ code: 'NOT_FOUND', samples: Object.keys(SAMPLES) }), 404);
      const text = await cached(env, `weather:sample:${sample}`, 3600, async () => {
        const res = await fetchFn(SAMPLES[sample](env), { headers: { Accept: 'application/json' } });
        return JSON.stringify({ status: res.status, body: scrub(await res.text(), env) });
      });
      return send(text);
    }
    return send(await cached(env, 'weather:status', 600, async () => JSON.stringify(await weatherStatus(env, fetchFn))));
  }
  return send(JSON.stringify({ code: 'NOT_FOUND' }), 404);
}
