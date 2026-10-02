# Plan: a weather PWA that blends several forecasts (not started)

Written 2026-10-02 after a day the current weather app (CWA 中央氣象署 data
only) got wrong, while Google's forecast looked closer. Nothing here is built
yet; this is the plan to come back to once the keys are ready.

**Decided:** a PWA, not a native iPhone app. Native means Xcode, a 7-day
re-sign on a free Apple ID (or US$99 a year, or SideStore's workarounds) for
widgets alone, which isn't worth it for how the owner uses weather: one look
before school each day, sometimes the week ahead, mainly for rain and the
temperature / UV curve (when to avoid sunburn). Everything clever lives in
the proxy, so a small native widget can still be added later if ever wanted.

## What the app shows

| # | What | Main source | Second source / check |
|---|------|-------------|------------------------|
| 1 | 紫外線 UV index, hourly, and today's peak window | Google Weather (hourly `uvIndex`) | CWA's measured UV at the nearest station |
| 2 | 溫度 / 體感溫度, hourly curve, daily high / low | Google (temperature, feels-like, heat index) | CWA township forecast (溫度, 體感溫度) |
| 3 | 空氣品質 AQI, PM2.5, the main pollutant | 環境部 MOENV open data (real stations, free) | Google Air Quality API (only if MOENV's nearest station is far) |
| 4 | Forecast in as much detail as possible, rain probability above all | Google: hourly up to 240 h (rain probability, amount, type, thunderstorm probability), 10 days | CWA township forecast (3-hourly 降雨機率), CWA warnings |
| 5 | Fun: sunrise, sunset, day length, golden hour, moon phase | Google's daily forecast, or computed in the page (no call at all) | — |
| 6 | Extras, folded away: 累積雨量, 氣壓, 風向 / 風速 / gusts, humidity, dew point, visibility, cloud cover | Google hourly | CWA stations' measured rain, wind, pressure |

Not included: satellite / radar. Too much work for too little precision. If
ever wanted, the cheap version is CWA's latest radar composite image shown as
a picture.

## Proxy side (Shared-Proxy, a new `weather.js` routed by `worker.js` like `push.js`)

- `GET /weather?lat=&lon=`: reads every source at once and returns one shape:
  `now`, `hours[]`, `days[]`, `air`, `sun`, `alerts[]`, plus each source's
  own numbers for the rain probability and temperature (so the page can show
  disagreement).
- **Cache by grid cell:** coordinates rounded to about 1 km, kept in KV about
  10–15 minutes (MOENV and CWA stations update hourly). The proxy never
  stores an exact location.
- **Skill scoring (the point of the whole thing):** a cron saves each
  source's forecast for the owner's places, then checks it against the
  nearest CWA station's readings: rain yes / no and its timing, temperature.
  The blend weighs sources by their recent score, and the page can say
  "Google has been right about rain here 8 of the last 10 days".
- **Disagreement is shown, not hidden:** "Google: rain from 15:00 (70%),
  CWA: 30%". That's the warning that was missing that day.
- **Morning brief (Web Push, already in `push.js`):** at a set time before
  school, one notice: rain chance and when, the high, the UV peak window, AQI
  if bad. A new check kind in `push.js` (e.g. `check: { weather: <place> }`)
  builds the text when it's due. Optional rain alert if the next 2 hours turn
  wet.

## Recommendations (rules first, AI optional)

Simple rules on the blended data, each with the reason shown:
- **Umbrella:** rain probability over a threshold during the hours the owner
  is out (school hours by default).
- **Sunscreen / hat:** UV 3 or more, with the window ("UV high 10:00–14:00").
- **What to wear:** by feels-like temperature, and the swing between morning
  and afternoon.
- **Mask:** AQI or PM2.5 over a threshold.
- **Week view:** best and worst days (dry, mild, low UV), laundry day.
- Optional later: one plain-language summary sentence written by Gemini
  through the existing `/gemini` route, from the numbers, never instead of
  them.

## The PWA

- A new repo on GitHub Pages, deployed on push to `main` like the Quadra apps.
- One screen first: today's summary card (the recommendations), the
  temperature + feels-like + UV curve with rain probability bars underneath,
  then the next days, then the folded extras. Sun and moon as a small arc.
- Liquid-Glass-like look in CSS (blur, translucency) over a background that
  follows the weather and time of day.
- Location while open, plus saved places (home, school) for the cron and the
  morning brief; works offline from the last forecast.

## Phases

1. **Proxy + scoring:** `/weather` with Google, CWA and MOENV, the cache, and
   the skill logging. Let the scoring run 1–2 weeks at the real places.
2. **PWA, first screen:** summary card, the curve chart, days, extras.
3. **Morning brief and rain alert** through `push.js`.
4. **Polish:** recommendation tuning, the sun / moon toy, optional Gemini
   summary, optional radar image.

## To get ready before starting

- [ ] Google Cloud: the project behind the existing paid Gemini key already
      has billing, so enable "Weather API" there and make a second key
      restricted to it → Worker secret `GOOGLE_WEATHER_KEY`. Set a daily
      quota cap (e.g. 500 requests) and a budget alert. Cost (Google's
      pricing page, checked 2026-10-02): "Weather Usage" 10,000 calls a month
      free, then US$0.15 per 1,000; with the cache and one person this stays
      free or close to it. (Air Quality API, only if used: 10,000 free, then
      US$4 per 1,000, so MOENV first.)
- [ ] CWA open data authorization key (opendata.cwa.gov.tw, free) → Worker
      secret `CWA_KEY`.
- [ ] MOENV open data API key (data.moenv.gov.tw, free) → Worker secret
      `MOENV_KEY`.
- [ ] The saved places (rough areas are enough) and the time of the morning
      brief.

## Open questions

1. What went wrong that day: rain when "dry" was forecast, the temperature,
   or the timing? Decides what the scoring weighs first.
2. Where is the current weather app's code? Its CWA parsing could be reused.
3. Part of the Quadra family (shared kit, Quadra pass sign-in) or standalone?
4. A name for it.
5. Note: the Worker is pinned near `gcp:us-east4` (for Gemini), so CWA and
   MOENV calls travel from Virginia; fine behind the cache, but worth a check
   in phase 1.
