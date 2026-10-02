# Plan: a weather PWA that blends several forecasts (proxy and app built)

Written 2026-10-02 after a day the current weather app (CWA 中央氣象署 data
only) got wrong, while Google's forecast looked closer. Nothing is built yet.
Part A is what to do now (keys, accounts); parts B onward are the build, for
a session to follow step by step.

**Owner's calls (2026-10-02):** one truth on screen (see C3); no sign-in
and nothing personal (no saved places, school hours or brief time): the app
works for wherever it's opened, location permission or not (see HANDOFF).
Where this plan still says Quadra Pass, saved places or school window, read
it in that light.

**Progress (2026-10-02):** A1–A5 done (the app is Orbit Weather, repo
`JayPengX/Orbit-Weather`); phase 1 built (`weather.js`, see HANDOFF). Found
in phase 1: Google's hourly forecast gives 24 hours a page at most, so 48 h
is 2 billed calls (4 a refresh with current and days, ~190 a day for 2
places hourly, ~5,800 a month: inside the free 10,000); Google's alerts refuse
`unitsSystem`; `F-D0047-089` is by county, so townships come from the
county datasets; the Free plan's CPU limit rules out parsing CWA's national
station lists live, hence the committed station table.

**Decided:** a PWA, not a native iPhone app (native needs Xcode and a 7-day
re-sign on a free Apple ID, or US$99 a year, or SideStore's workarounds, for
widgets alone). The owner looks once before school each day, sometimes at the
week, mainly for rain and the temperature / UV curve (when to avoid
sunburn). Everything clever lives in the proxy, so a small native widget can
still read it later if ever wanted.

---

## A. Set up now (owner, about 30 minutes)

Never paste a key into a chat, an issue or a repo file. Keys go only into
Cloudflare (step A5) and, if a Claude session should call the APIs live,
into the Claude environment's settings (step A6).

### A1. Google Weather API (uses the Gemini key's existing billing)

1. Open https://console.cloud.google.com and pick, at the top, the project
   the Gemini key lives in (an AI Studio key's project is often named
   "Generative Language Client" or `gen-lang-client-…`; AI Studio's API keys
   page shows which project each key belongs to).
2. Check **Billing** (left menu) shows a billing account linked to this
   project. If not, link one (Taiwan cards work; pay-as-you-go).
3. **APIs & Services → Library**, search **Weather API**, open it, **Enable**.
4. **APIs & Services → Credentials → Create credentials → API key.** Then
   **Edit** the new key:
   - Name: `weather-proxy`.
   - **API restrictions → Restrict key →** tick only **Weather API**. Save.
   - Application restrictions: **None** (the Worker calls from Cloudflare's
     changing IPs; the key never reaches the browser, so that's fine).
5. **Cap it:** APIs & Services → Weather API → **Quotas & system limits**,
   find the requests-per-day quota, **Edit**, set **500**.
6. **Budget alert:** Billing → **Budgets & alerts → Create budget**, scope
   this project, amount NT$100 a month, alerts at 50%, 90%, 100% (email).
7. Test (replace KEY; Taipei 101):
   `https://weather.googleapis.com/v1/currentConditions:lookup?key=KEY&location.latitude=25.034&location.longitude=121.565&languageCode=zh-TW`
   in a browser: JSON with `temperature` means it works.

Cost (Google's pricing page, checked 2026-10-02): one SKU "Weather Usage",
10,000 calls a month free, then US$0.15 per 1,000. Taiwan has every feature
(current, hourly, daily, history, alerts).

### A2. CWA open data key (free)

1. https://opendata.cwa.gov.tw → **登入 / 註冊** (top right), register with
   email, verify, log in.
2. Member area → **取得授權碼** (API authorization key); copy it (looks like
   `CWA-XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX`).
3. Test:
   `https://opendata.cwa.gov.tw/api/v1/rest/datastore/O-A0001-001?Authorization=KEY&limit=1`
   → JSON with `"success":"true"`.

### A3. MOENV (環境部) open data key (free)

1. https://data.moenv.gov.tw → **會員註冊**, verify the email, log in.
2. Member area → apply for an **API 金鑰** (shown there or emailed).
3. Test:
   `https://data.moenv.gov.tw/api/v2/aqx_p_432?api_key=KEY&format=json&limit=1`
   → JSON with a station's `aqi` (without a key it answers `api_key 不存在。`).

### A4. A GitHub repo for the app

1. New repo under JayPengX, **public** (free GitHub Pages), name to decide
   (e.g. `Quadra-Weather`), with a README so it isn't empty.
2. Settings → Pages → Source: **GitHub Actions** (or "Deploy from a branch",
   `main`, root), matching the other Quadra apps.
3. In the Claude session that builds it, the repo gets added with
   `add_repo` (the session can't create repos under the owner's account by
   itself unless asked).

### A5. Put the keys in the Worker (Cloudflare)

Cloudflare dashboard → **Workers & Pages → orbit-workers-proxy → Settings →
Variables and Secrets → Add**, type **Secret**, one each:

| Name | Value |
|------|-------|
| `GOOGLE_WEATHER_KEY` | the key from A1 |
| `CWA_KEY` | the key from A2 |
| `MOENV_KEY` | the key from A3 |

(Or `npx wrangler secret put GOOGLE_WEATHER_KEY` etc. from this repo.) The
CI deploy (`wrangler deploy`) never touches secrets, so they survive every
push.

### A6. Optional: let a Claude session call the APIs live

So a session can probe real responses while building phase 1 (instead of
only the saved fixtures): in the Claude Code environment's settings (the
environment menu in the session's title bar → Edit), add the same three as
environment variables `GOOGLE_WEATHER_KEY`, `CWA_KEY`, `MOENV_KEY`. A new
session picks them up.

### A7. Decide and write down (tell the session, don't commit)

- Saved places: home, school (a district or a rough point is enough). They
  are stored in the proxy's KV under the account, never in a repo.
- School hours (for "umbrella when you're out") and the morning brief's time.
- The app's name.

---

## B. What the app shows

| # | What | Main source | Second source / check |
|---|------|-------------|------------------------|
| 1 | 紫外線 UV index, hourly, today's peak window | Google hourly `uvIndex` | CWA `O-A0005-001` (each station's daily max), MOENV `uv_s_01` (hourly, MOENV's own stations) |
| 2 | 溫度 / 體感溫度, hourly curve, daily high / low | Google (`temperature`, `feelsLikeTemperature`, `heatIndex`) | CWA township forecast (溫度, 體感溫度) |
| 3 | 空氣品質 AQI, PM2.5, main pollutant | MOENV `aqx_p_432` (hourly, real stations) | MOENV `aqf_p_01` (AQI forecast by region) |
| 4 | Forecast in full detail, rain probability above all | Google hourly (`precipitation.probability.percent`, `qpf`, type, `thunderstormProbability`, 48 h shown in detail, up to 240 h), daily 10 days (day / night halves) | CWA township forecast (3-hourly 降雨機率) and warnings `W-C0033-001` |
| 5 | Fun: sunrise, sunset, day length, golden hour, moon phase | Google daily `sunEvents`, `moonEvents` | computed in the page if missing |
| 6 | Extras, folded: 累積雨量, 氣壓, 風向 / 風速 / gusts, humidity, dew point, visibility, cloud cover | Google hourly | CWA `O-A0001-001` (measured), `O-A0002-001` (measured rain, 10 min / hour / day) |

Not included: satellite / radar (too much work for too little precision; the
cheap version, if ever wanted, is CWA's latest radar composite as a picture).

---

## C. Proxy (Shared-Proxy)

### C1. Files

- `weather.js`: the route, the sources, the blend, the scoring. Exported
  `handleWeather(request, env, ctx)` and `weatherCron(env)`, routed from
  `worker.js` like `push.js` (`if (path.startsWith('/weather'))`), cron
  called from `scheduled()`.
- `tests/weather.test.mjs` with saved real responses in
  `tests/fixtures/weather/` (Google current / hours / days, CWA township and
  stations, MOENV AQI): parsing, blending, scoring, recommendations, cache
  keys, all without network.
- Add `weather.js` to `.github/workflows/deploy.yml`'s `paths`.
- `README.md` route table and `docs/HANDOFF.md` updated.

### C2. Access

Every route but signing in needs a Quadra Pass session (`qt=`), and Web Push
(`push.js`) is per account, so the app signs in with the Quadra Pass like the
others (a new app id, e.g. `weather`, in the token's allowed apps). That also
keeps strangers from spending the Google quota. If it should rather stand
alone, the route can be open behind a per-IP rate limit, but then there's no
push and no synced places.

### C3. Routes

- `GET /weather?lat=&lon=&qt=` → the forecast for that cell (C4).
- `GET /weather/places?qt=` / `POST /weather/places?qt=` → the account's saved
  places `[{ id, name, lat, lon }]` (at most 5), plus `school: { from:
  '07:30', to: '17:00', days: [1..5] }` and `brief: '06:30'`. KV
  `weather:places:<account>`.
- `GET /weather/skill?qt=` → each source's recent score at the saved places:
  a check for the owner and the sessions, never shown in the app.

**One truth (the owner's rule, 2026-10-02):** the backend may use as many
sources as help, but the person sees one answer: one rain %, one
temperature, one UV, one set of advice. No source names, no second
opinions, no "the sources disagree". What each source said is kept only in
the cell's KV entry (`bySource`) for the scoring (C7), which moves the
blend's weights quietly.

### C4. `/weather` response

```
{
  cell: '25.03,121.56', at: <ms>, tz: 'Asia/Taipei',
  now:   { temp, feels, humidity, uv, wind: { dir, speed, gust }, pressure,
           condition: { code, text, icon }, rain1h, station: { name, km } },
  hours: [ { t, temp, feels, uv, pop, mm, kind,
             thunder, wind: { dir, speed, gust }, pressure, humidity, dew,
             cloud, vis, condition } … 48 ],
  days:  [ { date, hi, lo, feelsHi, feelsLo, uvMax, pop, mm,
             day: { condition, pop }, night: { condition, pop },
             sunrise, sunset, moon: { phase, rise, set } } … 10 ],
  air:   { aqi, level, pm25, pm10, o3, main, station: { name, km }, at,
           forecast: { today, tomorrow } },
  alerts:[ { title, text, from, to, severity } ],
  advice:[ { kind: 'umbrella'|'sun'|'wear'|'mask'|…, level, text, why } ],
  partial: false   // true: a source is down or old (the page may say
                   // "部分資料稍舊", nothing more)
}
```

Kept beside it in KV only (not in the answer): `bySource` (each source's
hours, days and "now"), `sources` (each one's state).

All text in zh-TW (`languageCode=zh-TW`, `unitsSystem=METRIC`); advice text
from a small table in the page, so `en` can come later.

### C5. Sources, exactly

- **Google** (`https://weather.googleapis.com/v1/…`, `key=`,
  `location.latitude`, `location.longitude`):
  - `currentConditions:lookup`
  - `forecast/hours:lookup?hours=240` (default `pageSize` 24, `nextPageToken`
    for more; phase 1 checks the largest `pageSize` it takes and whether each
    page is billed as a call; if pages bill, fetch 48 h detailed and lean on
    the daily forecast beyond)
  - `forecast/days:lookup?days=10` (default `pageSize` 5, so ask for 10)
  - `publicAlerts:lookup`
- **CWA** (`https://opendata.cwa.gov.tw/api/v1/rest/datastore/<id>?Authorization=`):
  - township forecast: `F-D0047-089` (all Taiwan, 3 days, 3-hourly) and
    `F-D0047-091` (1 week), filtered with `LocationName=` to the township;
    per-county sets `F-D0047-001…085` if the all-Taiwan one is too big. The
    township comes from the nearest point in a small table of township
    centroids (committed, built once).
  - `O-A0001-001` (stations, hourly), `O-A0003-001` (manned, 10 min),
    `O-A0002-001` (rain gauges), `O-A0005-001` (daily max UV): nearest
    station by distance; the station list is cached for a day.
  - `W-C0033-001` warnings by county.
- **MOENV** (`https://data.moenv.gov.tw/api/v2/<id>?api_key=&format=json`):
  `aqx_p_432` (AQI, all stations, hourly; nearest by `latitude` /
  `longitude`), `aqf_p_01` (AQI forecast), `uv_s_01` (hourly UV).

The national station lists (CWA, MOENV) are fetched once per update and kept
whole in KV (`weather:cwa:stations`, `weather:moenv:aqi`, an hour), so a new
cell costs no extra call to them.

### C6. Cache and call budget

- Cell: lat / lon rounded to 0.01° (about 1 km). KV
  `weather:cell:<lat>,<lon>`, fresh 15 minutes; older but under 3 hours is
  answered at once and refreshed in the background (`ctx.waitUntil`), so the
  page never waits on Google.
- A source failing: the others still answer, `sources` says which, and the
  last good copy of the failed one is used if under 6 hours.
- Budget: a day's use (a few opens + the cron at 2 places hourly) is roughly
  2 places × 24 × (current + hours + days) ≈ 150 calls a day, about 4,500 a
  month, inside the free 10,000 even if hourly pages bill separately at 48 h.
  The Google quota cap (A1) stops any bug at 500 a day.

### C7. Blend and scoring

- **Rain probability:** for each hour, `pop = Σ w_s × pop_s` over the sources
  that cover that hour (CWA's 3-hourly value spread over its 3 hours). Start
  with Google 0.6, CWA 0.4.
- **Temperature, feels-like:** the same weighted mean; Google alone beyond
  CWA's week.
- **Scoring (cron, hourly):** for each saved place, store each source's
  forecast for the next 24 h (`weather:fc:<place>:<hour>`, kept 3 days).
  When an hour has passed, compare with the nearest stations: rain happened
  if the gauge measured ≥ 0.5 mm that hour (`O-A0002-001`), temperature
  from `O-A0001-001`. Rain scored with the Brier score
  `(pop/100 − happened)²`, temperature with the absolute error, both
  separately for lead times 0–6 h and 6–24 h. Rolling 14 days in
  `weather:skill:<place>`.
- **Weights:** `w_s ∝ 1 / (score_s + ε)`, normalised, moved at most 0.1 a
  day, floor 0.15 each (so neither source is ever ignored). Until 3 days of
  scores exist, the starting weights.
- **Disagreement:** never shown. Where sources differ the blend decides,
  and the scoring learns which to trust more.

### C8. Morning brief and rain alert (`push.js`)

- The app schedules, each time it opens, the next 7 mornings as notices with
  `check: { weather: '<place id>' }` at the brief's time (`push.js`'s
  scheduled list, as the other apps do).
- New check kind in `push.js`: at `at`, read `/weather` for that place
  (cache), and write the notice: "今天 15:00 後降雨 70%，最高 31°，UV
  10–14 點很強，空氣普通" (one number each, no sources). Its `kind: 'brief'`, so the
  pass's notice switches can turn it off.
- Optional rain alert, `kind: 'rain'`: the hourly cron, during school hours,
  if the next 2 hours' blended rain probability crosses 60% where it was under
  30% on the last run, sends one notice (at most one per 3 hours).

---

## D. Recommendations (rules first, reason always shown)

| Advice | Rule (thresholds editable in one table) |
|--------|------------------------------------------|
| 帶傘 umbrella | blended rain probability ≥ 50% in any hour of the school window (≥ 30%: "maybe, a folding one") |
| 防曬 sunscreen / hat | UV ≥ 3 in the window; the window shown ("10:00–14:00 UV 8+"). Levels: 0–2 低, 3–5 中, 6–7 高, 8–10 過量, 11+ 危險 |
| 穿著 what to wear | feels-like at leaving time and the day's high: < 15 coat, 15–20 jacket, 20–26 long or short sleeves, > 26 light; swing ≥ 8° between morning and afternoon: "layers" |
| 口罩 mask | AQI > 100 (對敏感族群不健康) or PM2.5 > 35 µg/m³ |
| 熱 heat | feels-like ≥ 34: water, shade |
| Week | best day (lowest rain and UV, mild) and worst; a dry, sunny day for laundry |

Optional later: one plain sentence from Gemini through the existing
`/gemini` route, built from the numbers, shown under them (never instead).

---

## E. The PWA (new repo)

### E1. Shape

- Plain HTML / CSS / ES modules like the Quadra apps; the kit
  (`node kit/sync.mjs`) for the Quadra Pass sign-in, push subscription and
  brand, if it joins the family (C2).
- Files: `index.html`, `manifest.webmanifest` (standalone, icons, theme),
  `sw.js` (app shell cache; last forecast kept), `lib/api.mjs` (proxy calls,
  location, cell rounding), `lib/chart.mjs` (the curve, SVG), `lib/advice.mjs`
  (section D), `lib/sun.mjs` (sunrise / sunset / moon fallback), `lib/ui.mjs`,
  tests with `node --test` like the other repos.

### E2. Screen, top to bottom

1. **Today card:** place (or "目前位置"), now temperature and feels-like, the
   advice chips (umbrella, sunscreen with its window, wear, mask), the
   alerts.
2. **The curve (the main thing):** next 24 h, swipe to 48: temperature and
   feels-like lines, UV as a coloured band under them (green → violet by
   level), rain probability bars along the bottom with mm on tap; now marked;
   sunrise / sunset shaded. Tap an hour for every number of that hour.
3. **Air:** AQI ring, PM2.5, the station and its distance, tomorrow's
   forecast level.
4. **10 days:** a row per day: high / low bar, rain %, UV max, an icon; tap
   for the day's own curve.
5. **Sun & moon:** a small arc with the sun's place now, day length, golden
   hour, moon phase.
6. **Extras (folded):** 累積雨量 today, pressure trend, wind with a compass,
   humidity, dew point, visibility, cloud cover.

Look: a Liquid-Glass-like style in CSS (`backdrop-filter: blur()`,
translucent layers, soft highlights) over a background gradient that follows
the condition and the time of day; dark mode by the sun, not the clock.

### E3. Opening fast (location)

A home-screen web app can ask for location (HTTPS; iOS may ask again now and
then, less with Settings → Privacy & Security → Location Services → Safari
Websites set to "While Using"). On open:

1. Show the last forecast from storage at once (with its age).
2. At the same time ask for a coarse position (`enableHighAccuracy: false`,
   `maximumAge` 15 minutes, `timeout` 5 s): Wi-Fi / cell location in about a
   second; weather needs no GPS.
3. Round to the same 0.01° cell the proxy caches by. Same cell and the
   stored forecast under 15 minutes old: no fetch. Otherwise fetch
   `/weather` (usually a KV hit) and swap it in.
4. Denied or timed out: the nearest saved place, and say so.

No location in the background (a web app can't), which is why the brief, the
rain alert and the scoring use the saved places.

---

## F. Phases (each ends with tests passing and a push to `main`)

1. **Proxy, sources:** `weather.js` with Google, CWA, MOENV, the cache, the
   response shape (C4), fixtures and tests. Probe live (A6) for the
   `pageSize` / billing question and CWA's township naming. Done when
   `/weather` answers for home and school in under a second from cache.
2. **Proxy, scoring:** places routes, the hourly cron storing forecasts and
   scoring them, weights moving. Let it run 1–2 weeks; read the skill.
3. **PWA, first screen:** sign-in, location flow, today card, the curve,
   days, air. Installed on the phone.
4. **Morning brief and rain alert** (C8).
5. **Polish:** advice tuning from real mornings, sun & moon, extras,
   optional Gemini sentence, optional radar picture.

---

## G. Open questions

1. What went wrong that day: rain when "dry" was forecast, the temperature,
   or the timing? Decides what the scoring weighs first.
2. Where is the current weather app's code? Its CWA parsing could be reused.
3. Quadra family (Quadra Pass, kit, push) or standalone (C2)? Recommended:
   family, for push and synced places.
4. A name.
5. The Worker is pinned near `gcp:us-east4` (for Gemini), so CWA and MOENV
   calls travel from Virginia; fine behind the cache, but checked in phase 1.
