# Plan: a weather app that blends several forecasts (not started)

Written 2026-10-02 after a day the current weather app (CWA 中央氣象署 data
only) got wrong, while Google's forecast looked closer. Nothing here is built
yet; this is the plan to come back to once the tools and accounts are ready.

## The idea

Don't swap one source for another: every source is wrong on some days. The
proxy reads several, scores each against what really happened near the
owner's places, and the app shows a blend that leans on whoever has been right
lately, and says so when the sources disagree ("Google: rain at 15:00, CWA:
dry"). That disagreement is the warning that was missing today.

## Proxy side (Shared-Proxy, a new `weather.js` routed by `worker.js` like `push.js`)

- `GET /weather?lat=&lon=`: reads every source at once, returns one shape
  (now, hourly, daily, alerts, plus each source's own numbers):
  - **Google Weather API** (Google Maps Platform): current conditions, hourly
    up to 240 h, daily up to 10 days, public alerts. Google's own models, the
    data behind Google Search's weather. Needs an API key and a Google Cloud
    billing account; there is a monthly free allowance, and one person's use
    behind the cache should stay inside it (check current pricing). The key
    is a Worker secret (`GOOGLE_WEATHER_KEY`), never in the app.
  - **CWA open data** (opendata.cwa.gov.tw): township forecasts, the nearest
    station's real readings, warnings. Still the authority for typhoons and
    heavy-rain warnings in Taiwan. Needs a CWA authorization key (secret).
  - **Optional:** Open-Meteo (free; ECMWF, JMA and other models), and Apple
    WeatherKit (free up to a large monthly quota with a developer membership;
    read by the app itself or through its REST API).
- **Cache by grid cell:** coordinates rounded to about 1 km, kept in KV about
  10 minutes, so the app, widgets and watch never multiply calls, and the
  proxy never stores an exact location.
- **Skill scoring (the point of the whole thing):** a cron saves each
  source's forecast for the owner's places, then checks it against the
  nearest CWA station's readings. Scored per source and per kind: rain yes/no
  and its timing, temperature, wind. The blend weighs sources by recent
  score.
- **Rain alerts:** a cron looks at the next 2 hours for the owner's places and
  pushes when rain is coming. Web Push already lives in `push.js`; a native
  app needs APNs instead (an ES256-signed JWT from a `.p8` key, WebCrypto
  only, same approach as the VAPID code).

## Phone side (native iPhone app, SwiftUI, built in Xcode on the Mac at home)

- **App:** iOS 26 Liquid Glass panels over a background that follows the
  weather; now, hourly, 10 days; a "sources agree / disagree" mark.
- **Widgets:** home screen and lock screen (WidgetKit). Widgets get a limited
  number of refreshes a day, so the proxy does the work and a widget only
  reads the result.
- **Live Activity:** "rain in 25 min" on the Dynamic Island and lock screen.
- **Later:** Apple Watch complication, a Control Center control, App Intents
  / Siri ("will it rain on my way home?").
- Its own new repo (not a Quadra PWA, no kit). Claude in a cloud session can
  write the Swift but can't run Xcode (Linux); Claude Code on the Mac can
  build and run the simulator itself.

## Phases

1. **Prove it (1–2 days, no app):** `/weather` with Google + CWA side by side,
   and the skill logging. Let it run 1–2 weeks at the real places (home,
   work, the commute) and read who was right, and for what kind of weather.
   All doable from a cloud session.
2. **First app:** main screen, home and lock screen widgets, Liquid Glass.
3. **Rain alerts:** next-2-hours check, APNs push, Live Activity.
4. **Extras:** Watch, Control Center, Siri.

## To get ready before starting

- [ ] Google Cloud: the project behind the existing paid Gemini key already
      has billing, so enable "Weather API" there and make a second key
      restricted to the Weather API only → Worker secret `GOOGLE_WEATHER_KEY`.
      Set a daily quota cap (e.g. 500 requests) and a budget alert.
      Cost (Google's pricing page, checked 2026-10-02): one "Weather Usage"
      SKU, 10,000 calls a month free, then US$0.15 per 1,000. One place
      refreshed sensibly (now every 10 min, hourly every 30 min, daily every
      3 h) is about 6,000 calls a month; two places about 12,000, about
      US$0.30 a month.
- [ ] CWA open data authorization key → Worker secret `CWA_KEY`.
- [ ] Apple Developer Program (US$99 a year) is optional. Start free: a
      free Apple ID in Xcode installs the app on the owner's own iPhone, and
      the app, widgets and Liquid Glass all work; it just stops opening after
      7 days until it's installed again (Xcode, or AltStore / SideStore
      re-signing over Wi-Fi from the Mac). Free has no APNs, WeatherKit or
      TestFlight, so rain alerts go through the Web Push already in
      `push.js` (a small home-screen page subscribed to it), and widgets
      read the proxy directly. Pay only if the weekly reinstall gets old or
      native alerts / Live Activities pushed from the server are wanted.
- [ ] Xcode (with the iOS 26 SDK) on the Mac; Claude Code there too if the
      Mac should build and test on its own.
- [ ] For phase 3: an APNs auth key (`.p8`), its key id and team id → Worker
      secrets.

## Open questions

1. What went wrong that day: rain arrived when "dry" was forecast, the
   temperature, or the timing? That decides whether the first work is the
   next 0–2 hours (nowcast) or the daily forecast.
2. Where is the current weather app's code? Its CWA parsing could be reused.
3. Which places should the scoring follow (rough areas are enough)?
4. Note: the Worker is pinned near `gcp:us-east4` (for Gemini), so CWA calls
   travel from Virginia; fine behind the cache, but worth a check in phase 1.
