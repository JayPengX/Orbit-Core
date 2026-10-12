# Shared-Proxy

The server side, the shared kit and the brand of two families of apps.

- **Quadra** is where the money is: **Quadra Securities** (stocks, funds,
  FX, play money) and **Quadra Play** (sports betting and the lottery).
- **Orbit** is the everyday tools: **Orbit Class** (the class schedule),
  **Orbit Weather**, **Orbit Transit**, **Orbit Sports** and **Orbit Words**.
- One account, the **Quadra Pass**, works in every app. It is the only place
  anything is saved, and the only key to the data proxy.

This repo holds:

1. **Two Cloudflare Workers**:
   - `orbit-workers-proxy`: the Pass and the Orbit apps' routes;
   - `sports-proxy`: the live data proxy.
2. **The kit** (`kit/`): one copy of everything more than one app needs,
   served from this repo's GitHub Pages and loaded by every app.
3. **The brand** (`kit/brand.mjs`, `brand/`): every name, colour, mark,
   icon and share card.
4. **The family's page and the admin page** (`site/`).
5. **The tools** (`tools/`): the preview harness, ESPN probes, the economy
   model and pass issuing.
6. **The rules**: `docs/TRUTH.md` (the owner's standing rules: read first)
   and `docs/HANDOFF.md` (running notes on every app).

Everything about how the family works lives here or in
[Shared-Data](https://github.com/JayPengX/Shared-Data) (the nightly data
packs). The apps are static sites on GitHub Pages; none has a server of its
own.

| App | Kit id | Repo | Live |
| --- | --- | --- | --- |
| Quadra Securities | `stock` | [Quadra-Securities](https://github.com/JayPengX/Quadra-Securities) | https://jaypengx.github.io/Quadra-Securities/ |
| Quadra Play | `odds` | [Quadra-Play](https://github.com/JayPengX/Quadra-Play) | https://jaypengx.github.io/Quadra-Play/ |
| Orbit Class | `orbit` | [Orbit-Class](https://github.com/JayPengX/Orbit-Class) | https://jaypengx.github.io/Orbit-Class/ |
| Orbit Weather | `weather` | [Orbit-Weather](https://github.com/JayPengX/Orbit-Weather) | https://jaypengx.github.io/Orbit-Weather/ |
| Orbit Transit | `transit` | [Orbit-Transit](https://github.com/JayPengX/Orbit-Transit) | https://jaypengx.github.io/Orbit-Transit/ |
| Orbit Sports (was Quadra Fixtures) | `match` | [Orbit-Sports](https://github.com/JayPengX/Orbit-Sports) | https://jaypengx.github.io/Orbit-Sports/ |
| Orbit Words (was Quadra Hub) | `vocab` | [Orbit-Words](https://github.com/JayPengX/Orbit-Words) | https://jaypengx.github.io/Orbit-Words/ |
| The kit, the marks, the family's page, admin | — | this repo's Pages | https://jaypengx.github.io/Shared-Proxy/ |
| The nightly data packs | — | [Shared-Data](https://github.com/JayPengX/Shared-Data) | https://jaypengx.github.io/Shared-Data/ |

## Contents

- [1. The whole system at a glance](#1-the-whole-system-at-a-glance)
- [2. The data layers: where every number comes from](#2-the-data-layers-where-every-number-comes-from)
- [3. `orbit-workers-proxy`](#3-orbit-workers-proxy)
- [4. `sports-proxy`](#4-sports-proxy)
- [5. The Quadra Pass (`/eco`)](#5-the-quadra-pass-eco)
- [6. The economy](#6-the-economy)
- [7. Notices while an app is closed (`/push`)](#7-notices-while-an-app-is-closed-push)
- [8. The developer settings and capacity](#8-the-developer-settings-and-capacity)
- [9. The kit](#9-the-kit)
- [10. The brand and the renamed repos](#10-the-brand-and-the-renamed-repos)
- [11. Deploying and secrets](#11-deploying-and-secrets)
- [12. Tools](#12-tools)
- [13. Tests](#13-tests)
- [14. What depends on what: the change checklist](#14-what-depends-on-what-the-change-checklist)

---

## 1. The whole system at a glance

```
                         ┌───────────────────────────── phones (home-screen apps, iPhone Safari) ─────────────────────────────┐
                         │  Securities · Play · Class · Weather · Transit · Sports · Words                                     │
                         │  each: its own static files + the kit (#kit/… import map, from Shared-Proxy's Pages)                │
                         │  device memory  →  Cache Storage (proxyJson persist)  →  localStorage copies (versioned keys)        │
                         └───────┬─────────────────────────┬────────────────────────────────┬──────────────────────────────────┘
                                 │ packJson / mirror        │ proxyJson (batched, qt=)        │ /eco /push /weather /transit /gemini
                                 ▼                          ▼                                 ▼
          Shared-Data (GitHub Pages, built       sports-proxy Worker                   orbit-workers-proxy Worker
          by GitHub Actions, nightly + every     (no placement pin: runs near          (placement gcp:asia-east1, Taiwan)
          3 h): season packs, mirror/, watch,    the caller)                           /eco  → Firestore (wallets, app data)
          winprob, cpbl standings, photos,       allowlisted hosts + synthetic hosts   /push → KV (subscriptions, lists) + cron
          bus packs, shapes, where.json          (asia-baseball.quadra, f1-live.quadra) /weather → Google, CWA, MOENV, KV cells
                                                 edge cache per tier, trims, batch     /transit → TDX, Google Maps/Places/Routes
                                                 F1Log Durable Object + 1-min cron     /kambi → Kambi + Firestore + cron
                                                 ↓                                     /gemini, /nl-edit → Gemini
                                                 ESPN · MLB · Jolpica · OpenF1 ·       /config → the developer settings
                                                 Polymarket · Kambi · Yahoo Finance ·   (service binding ORBIT from sports-proxy)
                                                 ELTA · formula1.com · YouTube ·
                                                 Google translate · F1 live timing ·
                                                 npb.jp / koreabaseball.com / cpbl.com.tw
```

Three rules hold everywhere (from `docs/TRUTH.md`):

- **A failed read is a failure, never "nothing there".** It is thrown,
  counted, retried and never saved. Only a complete, successful read is kept
  on a device.
- **What doesn't change in a day comes from Shared-Data**, never through
  the proxy. The proxy is for what moves (a live score, a price before
  kickoff).
- **A kit change must keep every app's current code working.** Add things;
  never rename or remove what apps import. A new export is used through the
  module object with a fallback (`kit.newThing?.()`), because a phone may
  still run an older kit.

## 2. The data layers: where every number comes from

A read by any app (through the kit's `proxyJson(url, { ttl, trim, persist,
mirror })`) goes down these layers until one answers.

| # | Layer | Where | What it holds | How long |
| --- | --- | --- | --- | --- |
| 1 | **Memory** | the page | every answer of this session | the call's `ttl` |
| 2 | **Device cache** | Cache Storage (`persist`, the default) | the last answer of each URL; `peekJson(url)` gives it at any age so a screen paints at once | younger than `ttl`: used without asking anyone |
| 3 | **Failure hold** | the page | a URL that just failed (after one retry) | as long as it would have been kept, a minute at most, so a source that is down isn't asked again by every part of a page |
| 4 | **The mirror** | Shared-Data `mirror/` (GitHub Pages) | the reads that can't change before a known moment, each `{ until, data }`; `mirror/index.json` lists which reads it holds (`match`: `'<trim>!<url>'` patterns). While a new index is on its way, the copies the device's last index holds (`mirrorHint`) are asked alongside it, not a round trip after it; any the new index doesn't hold are thrown away | until its `until` (the next game, the next build), never past the next build plus 6 hours |
| 5 | **The packs** | Shared-Data, read with `packJson` | a league's whole season (`sports/<league>/<year>.json`), CPBL's tables, past win-probability lines, watch links, photo lists, bus packs | until the next build; a pack that isn't there (404) is a failure the app reads another way |
| 6 | **The edge cache** | the sports-proxy's colo cache | every successful upstream answer, shared by everyone who asks the same URL | by tier (§4.4): live 2 s by default, a finished game 24 h, standings 30 min, … |
| 7 | **The upstream** | ESPN, Kambi, Yahoo, … | the truth now | — |

On top of the layers, **apps put live knowledge over slower copies.** This
is what keeps a table or a page right in the minutes or hours before the
official copy catches up:

- **A game over, before ESPN's table counts it.** Orbit Sports'
  `lib/title.mjs liveTable` adds finished (and running) games that a table
  hasn't counted yet, by games played. Every table in the app goes through
  it: 賽事's 排名, the game sheet's table, a team's page, a driver's page
  and a constructor's page (`freshStandings` in its `sheets.js`).
- **F1, at the flag.** The kit's `f1live.mjs` and Orbit Sports'
  `lib/f1.mjs` read F1's own timing (§4.6). The app knows a session is over
  the moment F1's feed says so (`feedEnded`, kept on the device for two
  days). Its finishing order then counts in the championship
  (`settleScoring`), long before ESPN's scoreboard marks the race over.
  Quadra Play settles F1 bets the same way.
- **MLB's postseason** (`kit/postseason.mjs`): MLB's own single answer for
  every playoff game's time, 待定 and 如需. ESPN's day pages lag.
- **Asian baseball** (`asia-baseball.quadra`): the leagues' own sites,
  because ESPN doesn't carry them and Kambi only lists a game a day ahead.

Failure rules across the layers:

- A failed read answers the copy the device has, of any age, and is asked
  again soon. Only with nothing kept is it a failure on screen.
- Saved copies carry a version in their key (`fx.day.v4`, `ot.trips.v1`).
  When their meaning changes, the key is bumped and the old one removed.
- A batch item that fails is that item's failure, never the batch's.

## 3. `orbit-workers-proxy`

Files: `worker.js` (the router, CORS, Gemini routes, cron), `eco.js`,
`eco-admin.js`, `money.js`, `capacity.js`, `push.js`, `quadra-token.js`,
`kambi.js`, `weather.js`, `weather-stations.js`, `weather-skill.js`,
`transit.js`, `locales/`, `wrangler.toml`.

Its placement is pinned to `gcp:asia-east1` (Changhua, Taiwan). Most of its
traffic is Taiwan's (TDX, CWA, the Pass), Taiwan is a Gemini-supported
location, and Smart Placement once ran it from Hong Kong, which Gemini
refuses. Every response carries `X-Worker-Colo` (the IATA code of the colo
that ran it).

| Route | File | What |
| --- | --- | --- |
| `GET/POST/PATCH/DELETE /eco` | `eco.js`, `eco-admin.js` | The Quadra Pass (§5); `op: 'admin'` is the owner's panel |
| `GET /config` | `worker.js` | The developer settings in use (§8), to everyone, cached a minute |
| `POST /gemini` | `worker.js` | Orbit Class's AI import of a timetable photo |
| `POST /nl-edit` | `worker.js` | Orbit Class's edits in plain language ("move Tuesday's maths to room 302") |
| `GET/POST /kambi` | `kambi.js` | The last live data of Kambi matches Quadra Play has bets on (§3.1) |
| `GET/POST /push/…` | `push.js` | Notices while an app is closed (§7) |
| `GET /weather…` | `weather.js`, `weather-skill.js` | Orbit Weather (§3.2) |
| `GET /transit/…` | `transit.js` | Orbit Transit (§3.3) |

**The gate.** Every route except signing in needs a Quadra Pass session
(`qt=`). Sessions are counted per session and app in memory
(`TOKEN_LIMIT`, 90 a minute for `/eco`). Only the sign-in calls (per IP an
hour: create 20, login 30, merge 20, share 30) and the daily cap on billed
Gemini calls use KV.

**Dev doors.** A request with `Origin: http://localhost:<port>` and no pass
gets a dev session on `/transit` (`TRANSIT_DEV`, 300 a minute per address).
That is how tests and scripts read real data without a pass. Weather has no
door: it uses its saved fixtures.

**The cron** (`*/2 * * * *`):

- push notices that are due, every run;
- Kambi's watched matches, every run;
- the weather scoring, hourly at :10;
- the capacity check, every 6 hours at :20.

### 3.1 `/kambi`

Kambi (Play's odds feed for Asian baseball, EuroLeague and K League) never
says "final" in public, and a match's live data disappears hours after it
ends. A bet whose app isn't opened in that window could never be settled.

- `POST /kambi { events: [{ id, start }] }`: Play registers the matches its
  open bets are on.
- The cron keeps each one's latest `livedata.json` in Firestore. It reads
  the least recently checked first, within the subrequest budget, and marks
  an entry `gone` once Kambi drops it. A match is watched from its start
  until the 3-day refund window ends, and kept a day beyond.
- `GET /kambi?ids=1,2,3` answers `{ results: { id: { live, seen, gone,
  checked, done } } }`. Play settles from this copy the same way it does
  from Kambi's live one.

### 3.2 `/weather`

Orbit Weather's server (`docs/WEATHER-PLAN.md` is the design).

- `GET /weather?lat=&lon=` (or `?auto=1`, placed by the caller's IP): one
  blended forecast for a cell of about 1 km, hourly for 10 days and daily
  for 10. It blends Google Weather, CWA (中央氣象署: the nearest automatic,
  manned and rain-gauge stations from the committed `weather-stations.js`)
  and MOENV (環境部: air quality, UV). Farther than any station (abroad), it
  uses Google only.
- `GET /weather/where`: the 縣市 and 鄉鎮市區, from NLSC's point query.
- `GET /weather/places`: every township, for the place picker.
- `GET /weather/status` (`?sample=<n>`): each key set and answering;
  `sample` gives one source's real answer at Taipei 101 (the tests'
  fixtures).
- `GET /weather/skill`: the scoring report.

**Caching.** A cell is kept in KV 15 minutes. One older but under 3 hours
is answered at once and refreshed behind. A source that fails is replaced
by its last good copy under 6 hours old, and `partial` says so.

**Google's budget.** Google is asked at most `GOOGLE_DAILY_CALLS` a day,
under its key's 500. A refresh costs:
- 4 calls (now, 48 hours in 2 pages, 10 days);
- only 1 while the forecast is under 30 minutes old;
- 8 more every 6 hours for hours 49–240.

Past the cap a cell is built from CWA alone.

**One truth.** The app gets one value per quantity. What each source said
is kept only in the cell's KV entry (`bySource`), for the scoring.
`weather-skill.js` runs hourly over the cells opened lately:
- it scores each source's forecast against the nearest rain gauge (Brier
  score) and station (absolute error), by lead time;
- it keeps 14 days of daily sums;
- it moves the blend's weights at most 0.1 a day, each at least 0.15
  (`weather:weights`).

### 3.3 `/transit`

Orbit Transit's server (`transit.js`).

| Path | What |
| --- | --- |
| `/transit/config` | The map: Google's (the browser key, counted as one map load) while the month is under its cap, else Taiwan's NLSC map |
| `/transit/tdx?p=<path>` | A TDX API path from the allowlist (`TDX_RULES`), cached as long as it stays true (live arrivals the 開發 setting `tdxLive`, 10 s; YouBike `tdxBike`, 30 s; timetables 6 h; stations a day), shared by everyone; a stale copy while refreshing or when TDX is busy |
| `/transit/search` | Places by name: Google's autocomplete, OpenStreetMap's past the cap |
| `/transit/place` | One place's position and name (Google Place Details) |
| `/transit/route` | Plans from A to B: Google's transit routes and TDX's planner, in one shape (the app adds YouBike plans itself) |
| `/transit/status` | Open: this month's use against each cap, which keys are set (never a key) |

Google's free monthly use per SKU (10,000 Essentials, 5,000 Pro) is counted
in KV, flushed in batches to spare KV's 1,000 writes a day. It is counted
on Google's billing month, Pacific time. The hard stop is the per-day quota
the owner sets on each API in Google Cloud. TDX calls are paced by
`TDX_PER_MIN` (the free plan allows 5 a minute, 銅級 300).

## 4. `sports-proxy`

Files: `sports-proxy-worker.js`, `asia-baseball.js`, `f1-live.js`,
`quadra-token.js` (bundled by Wrangler), `wrangler.sports-proxy.toml`.

### 4.1 Why it's its own Worker

`[placement]` is a whole-script setting. While this route lived in
`orbit-workers-proxy`, every sports read from Taiwan went through Virginia
(`X-Worker-Colo: IAD`). It has no placement block, so it runs near the
caller.

### 4.2 What it may read

`/sports-proxy?url=<encoded upstream>&app=<kit id>&qt=<session>` passes an
upstream through, if its host is on `SPORTS_PROXY_ALLOWED_HOSTS`:

| Host | For |
| --- | --- |
| `site.api.espn.com` | Scoreboards, summaries, teams, rosters, standings, athletes, news (Sports, Play) |
| `sports.core.api.espn.com` | Per-game odds (the pre-game line), game rosters (starters), athletes |
| `statsapi.mlb.com` | MLB's box scores, live feed, postseason (`kit/postseason.mjs`) |
| `api.jolpi.ca` | F1 results, qualifying, sprints (Jolpica, the Ergast successor) |
| `api.openf1.org` | F1 race control messages (Play settles SC, VSC and red-flag picks) |
| `gamma-api.polymarket.com` | Polymarket events and markets (Play's prices, Sports' chances) |
| `clob.polymarket.com` | Only `/prices-history`: a market's price line (Sports' win probability where ESPN has none) |
| `eu-offering-api.kambicdn.com` | Kambi's odds and live scores (Play's Asian baseball, EuroLeague, K League) |
| `query1/query2.finance.yahoo.com` | Quotes, charts, search, fundamentals, news (Securities) |
| `clients5.google.com` | Only `/translate_a/t` (≤ 5,000 chars), sent upstream as a POST, kept a month: a company's description in the reader's language |
| `piceltaott-elta.cdn.hinet.net` | ELTA's live program list (which channel carries which game), always trimmed |
| `eltaott.tv` | ELTA.tv's season pages (whether a game's whole video is there) |
| `www.formula1.com` | Drivers' and teams' official pages, trimmed to their grids |
| `www.youtube.com` | A search and a video page, trimmed (a game's official highlights) |
| `asia-baseball.quadra` | Not a real host: `asia-baseball.js` gathers NPB, KBO and CPBL from npb.jp, koreabaseball.com and cpbl.com.tw (§4.5) |
| `f1-live.quadra` | Not a real host: `f1-live.js`, F1's own live timing (§4.6) |

**Trims** (`&trim=`) return only what an app reads, each cached under its
own key:

| Trim | What |
| --- | --- |
| `polymarket-events`, `polymarket-games` | A league's events and markets (a 100-event page goes from ~11.5 MB to ~0.45 MB) |
| `kambi-events`, `kambi-offers` | Kambi's lists |
| `espn-roster`, `espn-news`, `espn-athletes` | ESPN's heavy pages |
| `elta`, `eltavod` | ELTA's program list and season pages |
| `ytsearch`, `ytvideo` | YouTube |
| (F1 page) | formula1.com's grids |

**Batches.** `?batch=1&u=<url>&u=<url>…` (each optionally
`<trim>!<url>`) answers many reads in one request. The kit sends up to 12
reads made within milliseconds of each other as one batch, because the
plan bills per request and a first paint asks for a dozen lists.
- An item not answered within about 3 s is answered as a failure, so one
  slow upstream never holds the rest.
- An item that throws answers `{"s":500,"e":…}` for itself alone.
- A Worker call has 50 fetches, shared by the batch's items.

### 4.3 The gate and the limits

A valid Quadra Pass session token (`qt`, checked with `ECO_TOKEN_SECRET`)
is required. Reads are counted per session and per app in memory, 600 a
minute (`SESSION_RATE_LIMIT`). Each app counts apart (`app=`), so
Securities left open never uses up Sports' minute. A cache hit counts too.

**The dev door.** A request with `Origin: http://localhost:<port>` and no
`qt` is let in (unless `SPORTS_DEV=off`), counted per address:

```bash
curl -H 'Origin: http://localhost:8123' 'https://sports-proxy.pengzjay.workers.dev/sports-proxy?url=<encoded>&app=match'
```

Scripts, `tools/preview.mjs --live` and Shared-Data's `watch.mjs` use it.

### 4.4 The shared edge cache

Every successful answer is kept in the colo's cache by the upstream URL
(and trim), one fetch shared by everyone. `fresh`: served as is. `stale`:
served at once while it refreshes in the background.

| Tier | What | Fresh | Stale |
| --- | --- | --- | --- |
| `live` | Scoreboards and summaries within a day of today | the 開發 setting `proxyLive` (2 s; 0 = half ESPN's own max-age, 2–5 s) | never |
| `final` | A game over, or a day whose every game is over | `proxyFinalH` (24 h) | never |
| `odds` | Polymarket events, live odds | 10 s | never |
| `f1-live` | F1's live snapshot / laps | 4 s / 15 s (`?final=1` laps: as standings) | never |
| `schedule` | Scoreboards 2+ days away | 10 min | 1 day |
| `season` | A whole year (a race series', a tour's) | 3 min | 30 min |
| `standings` | Standings tables | 30 min | 1 day |
| `team-schedule` | A team's games | 3 min | 1 day |
| `pregame-line` | ESPN core per-game odds | 1 h | 1 day |
| `lineup` | A game's roster (starters marked) | 1 min | 10 min |
| `prematch` | Kambi's pre-match lists | 2 min | 10 min |
| `futures` | Championship markets | 10 min | 1 day |
| `quotes` | Yahoo quotes and charts of 1–5 days | 30 s | never (orders fill at these prices) |
| `history` | Charts of a month and longer | 30 min | 1 day |
| `search` | Yahoo symbol search | 1 day | 7 days |
| `fundamentals` | A company's numbers | 1 h | 1 day |
| `news` | Search with news | 30 min | 1 day |
| `translate` | Google translate | 30 days | 30 days |
| `yt-search` / `yt-video` | YouTube | 20 min / 7 days | 6 h / 7 days |
| `asia-now` / `asia-past` | Asian baseball this month / a month over | 2 min / 12 h | 6 h / 7 days |

Headers: `X-Sports-Proxy-Cache` (`HIT`, `STALE`, `MISS`),
`X-Sports-Proxy-Cache-Tier`, `X-Sports-Proxy-Age`, and
`X-Sports-Proxy-Final` on a finished game.

The developer settings (§8) are read from the main Worker through the
service binding `ORBIT` at most once a minute.

### 4.5 Asian baseball (`asia-baseball.js`)

`https://asia-baseball.quadra/<league>/<YYYY-MM>.json` answers
`{ league, month, games: [{ id, start (UTC), home: { en, zh }, away,
homeScore, awayScore, state: 'pre'|'in'|'post'|'void', venue }] }`.
- **NPB** comes from npb.jp's monthly schedule page (HTML).
- **KBO** comes from koreabaseball.com's monthly list (a POST answered in
  JSON rows).
- **CPBL** comes from cpbl.com.tw's season list (a POST with the page's
  anti-forgery token), plus each game's box score (`cpblBoxTarget`).

Each club's source name maps to the logo tables' English and Taiwan's
Chinese. On the 1st of a month, last month is read too.

### 4.6 F1 live timing (`f1-live.js`)

ESPN's copy of a live session is minutes behind with frozen gaps, and
OpenF1 closes to everyone while a session runs. This reads F1's own feed
(SignalR at `livetiming.formula1.com/signalrcore`, open over server-sent
events). It negotiates, subscribes, takes the first full state, and closes.

| Path | What |
| --- | --- |
| `/now.json` | The session now (`trimF1Live`): info, `meeting` (the Grand Prix's name), status, part and clock, track flag, lap, race control's last 8 messages (each with its lap, blue flags dropped), weather, each car (place, laps, best, last, gap, interval, pits, in/out of the pits, retired, stopped, tyre and age and stints, grid, sectors and best sectors, speeds, qualifying parts, `seg` mini-sectors passed this lap and `segStatus` their colours), `places` per lap, `stops` |
| `/session.json?start=` | A session over, from F1's archive, in the same shape (`final: true`) |
| `/laps.json?start=[&final=1]` | Every car's laps `{ cars: { no: [[lap, ms, gap, place, pit]…] }, places, stops, live }`: the archive's once it has the session; before that, the lap log |
| `/circuit.json?key=&year=` | The circuit's outline (MultiViewer's): x/y, corners, rotation, `mini` (mini-sector indexes), `times` (time per outline point) |

**The lap log.** F1's archive has a session only an hour or more after it
ends, and the live feed has only the current lap. So the Durable Object
`F1Log` (SQLite, free plan) keeps every car's laps:
- a cron runs every minute Thursday to Monday UTC
  (`* * * * SUN,MON,THU,FRI,SAT`);
- while `liveSession(index)` finds a session started and not archived, it
  takes one look a minute (`sampleLive`);
- it keeps a fortnight of sessions.

`laps.json` serves the log (`live: true`) until the archive has the
session. `?final=1` asks only for the archive. Orbit Sports falls back to
the log until it's there, and asks again each minute.

## 5. The Quadra Pass (`/eco`)

`eco.js` (tests in `tests/eco.test.mjs`).

**The pass.**
- A pass is a random 10-character code (32¹⁰), stored only as its SHA-256,
  which is the account's document id.
- It is typed only to sign in and shown once when made or rotated.
- **Passes are handed out by the owner**, on the admin page
  (`site/admin/`) or with `tools/issue-passes.mjs`. `op: 'create'` is
  closed outside tests (`ECO_OPEN_SIGNUP`).

**Signing in.**
- **Devices never keep the pass.** Signing in gives the device a refresh
  token (60 days, renewed each use) and the app a short session token
  (`quadra-token.js`).
- Tokens are `<base64url JSON>.<HMAC-SHA256>` under `ECO_TOKEN_SECRET`.
  Before that secret is set, the key is derived from `FIREBASE_PRIVATE_KEY`.
  A token's body is `{ k: 'ses'|'ref', d: account, a: app, s: session,
  g: generation, e: expiry }`.
- **One app at a time.** The session that signed in or claimed last is the
  live one (`wallet.live`). A write from any other answers
  `409 ECO_SESSION_MOVED`. The app left behind stops refreshing and shows
  "Quadra is open in …" with a button to continue there.

**The store.**
- **The wallet** (`eco-wallets`, JSON the Worker merges itself,
  `mergeWallet`):

  | Part | What |
  | --- | --- |
  | `entries` | Money in or out of the one NT$ pool, each with a fixed id, so the same entry sent twice counts once |
  | `snap` | Each app's latest figures, the newest per app wins |
  | `settings` | Newest wins per key: affinities, the Plus plan, looks, notice switches, the notices already said (`seen`) |
  | `apps` | When each app was first and last opened |
  | `inbox` | Other passes' app data a merge brought in |
  | `live` | The live app and session |
  | `sec` | The token generation (bumped to sign every device out) |

  Writes are read-merge-write under Firestore's `updateTime` precondition.
- **Each app's own data** sits in its collection under the same id:

  | App | Collection |
  | --- | --- |
  | `stock` | `stock-study-accounts` |
  | `odds` | `odds-study-accounts` |
  | `vocab` | `vocab-progress-sync` |
  | `match` | `match-find-settings` |
  | `orbit` | `orbit-quadra` |
  | `weather` | `orbit-weather` |
  | `transit` | `orbit-transit` |

- **Only Securities and Play write money entries** (`ENTRY_APPS`). `eco:`
  ids are this Worker's alone; an app's write of one is dropped.

| Call | What |
| --- | --- |
| `POST { op: 'login', passcode, app }` | Sign in on this device |
| `POST { op: 'refresh', refresh, app, claim?, data?, inbox? }` | A session (and a renewed refresh token); `claim` makes this app live |
| `GET /eco?qt=T[&app=A][&inbox=1]` | The wallet, the pool and app A's data; `active` says whether this session is the live one (a fresh `token` comes back while it is) |
| `PATCH /eco?qt=T&app=A { payload?, wallet? }` | App A's data and/or a wallet change (live session only) |
| `DELETE /eco?qt=T[&app=A][&inbox=ID]` | The account, one app's data, or one inbox item |
| `POST { op: 'pair-create', qt }` / `{ op: 'pair-redeem', code, app }` | A device code (8 characters, 10 minutes, once) and signing in with it |
| `POST { op: 'handoff', qt }` / `{ op: 'redeem', handoff, app }` | A sealed sign-in (3 minutes) for a link to another app (`#qh=`); home-screen apps don't share storage |
| `POST { op: 'plus', qt, on, plan }` | Join Quadra Plus (`plan: 'month'` or `'year'`) or stop renewing (live app only) |
| `POST { op: 'signout-all', qt }` | Every other device signed out |
| `POST { op: 'rotate', qt }` | A new pass for the same account; the old one stops, every other device is signed out |
| `POST { op: 'merge', qt, sources: [{ passcode }] }` | Other passes into this one (up to 12): their data (or inbox) and money, then deleted |
| `POST { op: 'share-create', qt }` / `{ op: 'share-redeem', qt, key }` | Orbit Class: a key (8 characters, a day) that gives another pass a copy of the schedule |
| `POST { op: 'admin', token, action }` | The owner's panel (`eco-admin.js`): `scan`/`clean` (below), `config-set` (§8), issuing passes, the money report (`money.js`) |

**Keeping the store clean** (`eco-admin.js`). `scan` counts and `clean`
removes, in bounded batches (run again until `done`):
- retired collections (`orbit-schedules`, `eco-links`,
  `stock-study-leagues`);
- app documents with no pass behind them;
- orphaned inbox items;
- expired device codes and share keys;
- in every wallet, what no app uses (`tidyWallet`): retired apps'
  entries (their net kept as `eco:rebase:hub`), retired settings, and
  looks on a pass without Plus.

The token is checked against `ADMIN_TOKEN_HASH`; empty means off.

**The money report** (`money.js`, the admin page) shows three sides over
every account:
- **given**: opening money, pay, wealth-level rewards, VIP, grants, rebases;
- **quadra**: Play's settled bets from the house's side, plus Plus fees and
  overdraft interest;
- **own**: Securities and the rest.

Each is split by market (`snap.odds.pl` per sport, `snap.stock.pl` per
stock market). Deleted accounts' sides are kept in `quadra-config/ledger`.

## 6. The economy

The model is `tools/economy.mjs`; the numbers live in `eco.js` and the
kit's `quadra.mjs` (the same tables in both).

| What | Rule | Entry id |
| --- | --- | --- |
| Opening money | NT$30,000 for a new pass | `eco:start` |
| Monthly pay | NT$6,000 on the 1st of every Taiwan month, the same for everyone (v10, 2026-10); months away paid on return | `eco:pay:<YYYY-MM>` |
| 財富等級 rewards | Once per level, the first time the account's worth (pool + Securities' holdings) reaches it: 50k → 1,000; 100k → 2,000; 250k → 3,000; 500k → 5,000; 1M → 8,000; 5M → 15,000; 20M → 30,000 | `eco:rank:<id>` |
| Quadra Plus | NT$490 a Taiwan month or NT$4,900 a year; the first month ever free; then the rest of the month's share to join; renews on the month's first sign-in or read while on; a charge the pool can't cover lapses it | `eco:plus:<YYYY-MM>`, `eco:plusfail:<YYYY-MM>` |
| Plus's weekly bet | A NT$200 free bet each Taiwan week a member opens an app | `eco:fb:<Monday>` |
| Welcome | A NT$200 free bet after the first paid bet in Play | `eco:fb:welcome` |
| VIP cashback | A Taiwan month's gaming stakes (bets, lottery, scratch, less refunds) pay back next month: ≥10k 0.5% (bronze), ≥50k 0.8% (silver), ≥150k 1.2% (gold), ≥500k 1.5% (black); from 2026-10 | `eco:vip:<YYYY-MM>` |
| Overdraft | The pool may go below zero; spending stops, selling and cash-outs work; 1% a month | `eco:od:<YYYY-MM>` |
| The reset | Accounts opened on the old NT$110,000 came down to 30,000 once; less than that got the difference back; interest on the reset's overdraft refunded | `eco:rebase:v3`, `eco:rebase:v3fix`, `eco:odback:v3` |

**What Plus gives.**
- **Play** (`PLUS.odds`): the weekly free bet, the parlay boost ×1.5, and
  cash-out keeps 2% instead of 5%.
- **Securities** (`PLUS.stock`): commission at 2.8折 (×0.28), half the FX
  spread, and margin loans 1 point a year cheaper.
- **Looks**: an avatar and a frame on the account button, some only after a
  run of months in a row.

Every perk makes play cheaper or bigger, so Plus earns the house more than
it costs.

**Free bets** (`FREEBET`): a token of value only. Only the winnings come
back, the stake never does. They need odds of 1.50 or longer, last 7 days,
and are marked spent with `odds:fb-<token id>`.

## 7. Notices while an app is closed (`/push`)

`push.js`. An iPhone stops a home-screen app in the background, so each app
hands the Worker its coming notices, and the Worker sends them through the
browser's push service.

| Call | What |
| --- | --- |
| `GET /push/key` | The Worker's public VAPID key |
| `POST /push/subscribe?qt=` | `{ sub, lang }` this device's subscription |
| `POST /push/schedule?qt=` | `{ items: [notice…] }` replaces this app's list |
| `POST /push/prefs?qt=` | `{ on, off: ['stock:alert', …] }` the pass's switches; a kind off in any app is dropped from every app's list |

A notice is `{ at, title, body, tag, url, kind }`. It may carry a check the
Worker makes at `at`, and again every 15 minutes until it has the answer,
8 hours pass, or `until`:

- `{ espn: 'football/nfl', event }`: a game's final score;
- `{ yahoo: '2330.TW', op: 'above'|'below', price }`: a price reached;
- `{ weather: { lat, lon, kind: 'brief'|'rain' } }`: the morning brief, or
  rain in the next 2 hours;
- `{ bus: { path, route, dir, min } }`: Transit's 到站提醒, checked every
  run (2 minutes) against TDX's live estimates.

The message is encrypted with RFC 8291 (aes128gcm) and signed with RFC 8292
(VAPID), WebCrypto only.

KV keys:
- `push:<account>:<app>` (subscription and list);
- `push:prefs:<account>`;
- `push:due`;
- `push:vapid`.

There is one device per person per app (the last to subscribe). **News that
happens once is told once:** the Worker remembers what it sent.

## 8. The developer settings and capacity

`kit/brand.mjs DEV` is the one table, and `kit/devconfig.mjs` re-exports
it for the Workers. The settings are stored on the main Worker
(`op: 'admin'`, `config-set`) and served by `GET /config`. Apps read the
device's copy at once and the Worker's every five minutes.

| Key | Default | What |
| --- | --- | --- |
| `proxyLive` | 2 s | How long the sports proxy keeps a live answer (0 = half ESPN's max-age) |
| `proxyFinalH` | 24 h | How long a game over is kept |
| `sportsGame` | 3 s | Orbit Sports: an open live game sheet's refresh |
| `sportsList` | 5 s | Orbit Sports: lists (首頁, 轉播, 追蹤, 賽事) while a game is on |
| `f1Feed` | 10 s | F1 live timing for the whole app (home cards) |
| `f1Board` | 4 s | An open F1 live board |
| `f1Laps` | 15 s | F1 laps (數據's comparison) |
| `playLive` | 5 s | Quadra Play live scores and cash-out |
| `tdxLive` | 10 s | The Worker keeps live TDX (arrivals, boards) |
| `tdxBike` | 30 s | The Worker keeps YouBike |
| `transitLive` | 10 s | Transit cards' refresh |
| `transitBike` | 30 s | YouBike on the map |
| `autoScale` | off | 依人數自動調整 (below) |
| `mirror` | on | Use the nightly copies (off: every app asks the proxy, for debugging) |

`kit.everyDev(key, fn)` runs `fn` every `dev(key)` seconds, reading the
setting at each beat.

**Capacity** (`capacity.js`, the admin panel's 容量). Cloudflare's free plan
gives 100,000 requests a day for the whole account. Requests a day are
roughly people × minutes watching ÷ refresh interval.
- **The count.** It counts people (active today, this week, this month, per
  app, and expected in 30 days from new passes). It estimates the requests
  per app.
- **The other budgets.** It shows how many people TDX, Google Maps and
  Google Weather hold.
- **The slowdown.** With `autoScale` on, every 6 hours it slows the live
  refreshes by one factor when the expected people would run past the
  plan. It never goes past a setting's own maximum, and returns to the
  owner's numbers (`base`) when there's room.

## 9. The kit

`kit/` is served, never copied.
- **Publishing.** `.github/workflows/pages.yml` stamps it (`kit/stamp.mjs`:
  `?v=<version>` on kit-only relative imports, `kit/version.json`) and
  publishes it with `site/` on every push that touches `kit/`, `tests/`,
  `site/` or `brand/`.
- **Loading.** Each app's page carries only `kit/loader.html`'s two
  snippets: an import map for `#kit/…` at the version the device last saw
  (`quadra.kit`), the stylesheet, and `boot.js`.
- **Updating.** The kit notes a newer version on every opening, and
  `watchUpdates` puts it in place like a deploy of the app.
- **Tools.** `node kit/apps.mjs` points the apps at it (refreshing the
  snippets between the `kit:head` / `kit:boot` markers). `node
  kit/link.mjs` links checked-out apps (`<app>/.kit`) for their tests; CI
  checks this repo out instead.

### 9.1 `quadra.mjs`: the core (every app)

| Area | What |
| --- | --- |
| **Apps and language** | `APPS` (from brand), `detectLocale`, Taiwan days (`taipeiDay`) |
| **The economy** | `PAY`, `WEALTH_RANKS`, `worthOf`, `moneySides` (given / quadra / own, the Pass's 真相), the pool (`poolBalance`, `overdraft`; an app's own part left out) |
| **Plus** | `PLUS`, `plusMember`, `plusMonths`, `plusLapsed`, `plusRenewing`, `plusPlan`, `plusUntil`, `plusJoinPrice`, `plusReturns`, `plusTenure`, `plusNotices`; Looks (`avatar`, `frame`, streaks) |
| **VIP and free bets** | `VIP`, the month's stakes, tier and cashback; `WELCOME`; `FREEBET`, the unspent tokens |
| **Storage** | The device keeps a refresh token and the account's id, never the pass; each app's own data copy for a cold start (small ones); signing out removes every app's keys on the origin, keeping only the device's language, safe area and kit version |
| **Data** | `proxyJson` (batched, remembered, device-cached, failures held, mirror consulted), `peekJson`, `packJson` (Shared-Data), `mirrorBuilt`, `workerJson`/lines (the Worker's routes signed), `translate` (through the proxy, kept a month; Chinese-in-English handled) |
| **The session** | `quadraSession(app)`: `start()` (the sign-in gate, then live), `on('wallet'|'active'|'signedout')`, `read`, `write` (live only), `proxy(url)`; a heartbeat every 2 minutes and on wake; `#qh=` hand-offs; another app taking over pauses this one |
| **iPhone behaviour** | No pinch zoom; haptic ticks on taps; sheets swipe down to close (past 120 px or a flick); `html.q-touch`; `:active` only after a rest (`data-q-press`, never while scrolling); the solid status-bar strip (`.q-statusbar`, never `pointer-events: none`); `uprightTurn` (a phone on its side stays upright); the theme colour kept equal to the strip; tab bar clear of the home indicator |
| **Recommendations** | Affinity weights per key (`team:mlb:LAD`, `sym:2330.TW`…) decaying with a half-life, synced to the wallet (`aff:<app>`); `rank(items, { n })`: quality × (1 + affinity) + exploration, then maximal marginal relevance, dismissed items pushed down |
| **Screens** | The sign-in screen (no "create"), the install screen, "in use elsewhere": top-layer modal dialogs nothing can cover; `ask`/`tell` (never `alert`/`confirm`) |
| **The Pass sheet** | `accountSheet` opens `pass.mjs` (Pass, Plus, 真相, App, 說明) |
| **Notices** | `notify` (banner on screen, system notice off it), `NOTICE_KINDS` per app with a switch each, `notifyPrefs` on the pass, `schedulePush`, `sayOnce` (once per pass, `settings.seen`), batched banners |
| **The shell** | `installGate` (home screen only on phones; a QR page on computers for phone-only apps); `watchUpdates` (version.json on load, every 15 s, on focus, visibility and online, and from other open pages over BroadcastChannel; a newer app or kit loads at once, the scroll and tab kept by `rememberPlace`/`restorePlace`, retried when the CDN lags); `kitLatest`; strips that scroll sideways keep their place across redraws |
| **The frame** | `tabBar` (each tab keeps its place; tapping the open tab scrolls up, again resets), `topActions` (說明 · 重新整理 · the account), `icon`, `fitNumbers` (a number too wide shrinks, to 60%) |
| **The developer settings** | `dev(key)`, `everyDev(key, fn)` |
| **除錯紀錄** | `rec(kind, data)`: the last of each kind in memory; with 記錄 on, a log on the device (2 MB, never a pass or token) to copy |

### 9.2 The other kit modules

| Module | Used by | What |
| --- | --- | --- |
| `quadra.css` | all | iOS 26's look: system colours, one glass material (`--q-glass`), capsule buttons and chips, sheets, the tab bar, `--q-top`/safe areas, the turned page |
| `boot.js` | all (synced as `public/boot.js`) | The loading screen; checks the app's and the kit's version.json before the app starts (one reload for both); mends an installed app whose cache mixed versions (once in ten minutes); a way out after 15 s |
| `brand.mjs` | all, `brand/generate.mjs` | The families, names, colours, lines, marks, repos, `RENAMED`, `DEV` |
| `pass.mjs` | all | The Quadra Pass sheet |
| `help.mjs` | all | Every app's guide: what / tabs / particulars / money (`#help=<app>:<topic>`) |
| `truth.mjs` | all | 真相: the house's real numbers (overround 1.158, the parlay take, cash-out, free bets' worth, tax over NT$5,000, scratch and draw paybacks) and the account's record |
| `catalog.mjs` | Sports, Play | Every sport and league: `sport`, `kind` (`match`/`field`), `data` (`espn`/`kambi`/`asia`), `bet` (Play's key), `odds`, paths, `standings` |
| `logos.mjs` | Sports, Play | Team, league, F1 driver and constructor logos and colours (ESPN, NBA.com, TheSportsDB, flags) |
| `names.mjs` | Sports, Play | Teams in Taiwan's Chinese ([city, nickname] for US leagues); ELTA's titles are matched with them |
| `photos.mjs` | Sports, Play | A person's studio headshot: ESPN by id or name, the leagues' official photo lists (Shared-Data), TheSportsDB cutouts; never a casual picture; kept two months (none a week) |
| `sw-images.js` | all service workers | Other sites' pictures in one shared cache, served at once, checked again after a week |
| `f1live.mjs` | Sports, Play | Which session a feed reading is, whether it's over (qualifying only after its last part), the order as an outcome |
| `postseason.mjs` | Sports, Play | MLB's postseason from MLB itself |
| `holidays.mjs` | Class, Weather, Transit | Taiwan's days off and 補班 days |
| `devconfig.mjs` | Workers | The `DEV` table for the Workers |
| `stamp.mjs`, `apps.mjs`, `link.mjs`, `loader.html` | build | Publishing and wiring the kit |

## 10. The brand and the renamed repos

`kit/brand.mjs` defines every app's id, name, colours, line, mark (Quadra:
a square tile with a gold corner; Orbit: a planet, its ring and a moon) and
repo.

`node brand/generate.mjs [id…|site]` (Playwright's Chromium) writes, for
each app:
- the icons: favicon, home screen, Android maskable;
- the share cards: `share/og.jpg` 1200×630, `square.jpg` 1200×1200,
  `x.jpg` 1200×600, `story.jpg` 1080×1920;
- the page's `<!-- brand -->` block and the manifest;
- and `site/` (the family's page and marks).

**The renamed repos.** `Quadra-Fixtures` is `Orbit-Sports` and `Quadra-Hub`
is `Orbit-Words` (2026-10-03; `RENAMED` is on, so every app links to the
new addresses). The old addresses don't answer. To forward them, a repo
with the old name can serve `tools/moved/index.html` and
`tools/moved/sw.js`: it sends people on, keeping the `#`, and retires the
old offline copy.

## 11. Deploying and secrets

**`main` deploys.**
- `.github/workflows/deploy.yml` runs `wrangler deploy` for both Workers
  (`wrangler.toml`, `wrangler.sports-proxy.toml`).
- `pages.yml` publishes the kit and `site/`.
- Push validated changes straight to `main` after `npm test` passes.

`wrangler deploy` pushes a toml's `[vars]`, KV, Durable Object and trigger
config as the Worker's whole config. Secrets are never in the repo; they
are set with `wrangler secret put` or the dashboard.

| Worker | Secret / binding | For |
| --- | --- | --- |
| both | `ECO_TOKEN_SECRET` | Signing and checking session tokens |
| orbit-workers-proxy | `FIREBASE_PROJECT_ID` (var), `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` | Firestore (the Pass, Kambi's watch, config) |
| orbit-workers-proxy | `RATE_LIMIT_KV` (KV) | Push lists and keys, Transit's Google meter and TDX token, Weather's daily count, cells and scores; sign-in limits |
| orbit-workers-proxy | `GEMINI_API_KEY` | `/gemini`, `/nl-edit` |
| orbit-workers-proxy | `TDX_CLIENT_ID`, `TDX_CLIENT_SECRET`, `GOOGLE_MAPS_BROWSER_KEY`, `GOOGLE_MAPS_KEY` | Transit |
| orbit-workers-proxy | `GOOGLE_WEATHER_KEY`, `CWA_KEY`, `MOENV_KEY` | Weather |
| orbit-workers-proxy | `ADMIN_TOKEN_HASH`, `ECO_ADMIN_TOKEN` | The admin panel (the owner's key; Claude never uses it) |
| sports-proxy | `F1_LOG` (Durable Object `F1Log`, migration `f1-log-1`), cron `* * * * SUN,MON,THU,FRI,SAT` | The F1 lap log |
| sports-proxy | `ORBIT` (service binding) | The developer settings from `/config` |

Firestore's rules deny all client access (`allow read, write: if false`).
Only the Worker's service account reads and writes.

## 12. Tools

See `tools/README.md` for every flag.

| Tool | What |
| --- | --- |
| `node tools/preview.mjs <app> [hash…]` | The app on an iPhone-sized page, signed in with a made-up wallet, real data. Flags: `--webkit`, `--dark`, `--lang en`, `--full`, `--upgrade <date>` (an installed app updated), `--flaky <share>`, `--reopen`, `--shuffle` (movement after loading), `--live` (through the real Workers' dev doors, the busiest minute printed), `--serve --port 8123` (for the iOS Simulator), `--requests`, `--timing`, `--clock ISO`, `--fixture host/path=file`. It prints console errors, anything wider than the screen, `wraps:` and `cut:` |
| `node tools/leagues-audit.mjs` | Every catalogue league against its sources today |
| `node tools/economy.mjs` | The economy on paper, old settings against new |
| `node tools/espn.mjs <path> [query]` | The shape of an ESPN answer |
| `node tools/issue-passes.mjs` | Issue passes (the owner) |
| `node tools/weather-stations.mjs` | Rebuild `weather-stations.js` |
| `tools/word-audio.py` | Orbit Words' audio |

## 13. Tests

`npm test` (node:test):

| File | What it covers |
| --- | --- |
| `eco.test.mjs`, `pass.test.mjs` | The Pass, merges, Plus, VIP, pay, rebases |
| `money.test.mjs` | The money report |
| `push.test.mjs` | Push encryption, lists, checks |
| `sports-proxy.test.mjs`, `final-cache.test.mjs` | Allowlist, trims, batches, cache tiers, the final tier |
| `f1-live.test.mjs`, `f1live-kit.test.mjs` | F1's feed trim, sessions, the lap log, `kit/f1live.mjs` |
| `asia-baseball.test.mjs` | NPB, KBO, CPBL parsing |
| `kambi.test.mjs` | The Kambi watch |
| `transit.test.mjs` | TDX rules, caps, routes |
| `weather.test.mjs`, `weather-skill.test.mjs` | The blend and the scoring |
| `capacity.test.mjs`, `devconfig.test.mjs` | Capacity and settings |
| `kit.test.mjs`, `kit-css.test.mjs`, `kit-calendar.test.mjs`, `photos.test.mjs` | The kit |

## 14. What depends on what: the change checklist

The family is large enough that a fix in one place misses another. Before
pushing a change, find its row and check every place it names.

| If you change… | Also check |
| --- | --- |
| `kit/catalog.mjs` (a league) | Orbit Sports `lib/leagues.mjs` and `lib/broadcast.mjs` (shown only if on ELTA or Apple TV); Play's `lib/teams.mjs`; Shared-Data `sports.mjs` and `mirror.mjs` (which leagues are built); `tools/leagues-audit.mjs` |
| `kit/logos.mjs`, `names.mjs`, `photos.mjs` | Both Sports and Play; Shared-Data `official-photos.mjs` (the lists `photos.mjs` reads); `sw-images.js` |
| `proxyJson`, `packJson`, the mirror | Every app's first paint; Shared-Data `mirror.mjs` (`mirrorPath` must match); the failure hold (TRUTH §7) |
| A trim in `sports-proxy-worker.js` | Every parser that reads it (Sports, Play), Shared-Data `mirror.mjs` (its copy is trimmed the same way) |
| A cache tier or `DEV` default | `capacity.js`'s estimates, Shared-Data's `watch.mjs` (dev door), the admin panel |
| `f1-live.js` (`trimF1Live`, laps) | Orbit Sports (`lib/f1.mjs`, `sheets.js`: live board, 數據, track map, race chance, standings at the flag); Quadra Play (F1 settling, `kit/f1live.mjs`); `tests/f1-live.test.mjs` |
| `asia-baseball.js` | Sports (CPBL/NPB/KBO lists, box scores), Play (Kambi + these for settling), Shared-Data `cpbl.mjs` and `mirror.mjs` |
| `eco.js` money rules | The kit's tables (`PLUS`, `VIP`, `WEALTH_RANKS`, `PAY`: the same numbers), `truth.mjs`, `tools/economy.mjs`, `help.mjs`'s money topics, Play and Securities |
| `push.js` checks | The apps that schedule them: Sports (finals), Securities (prices), Weather (brief, rain), Transit (到站提醒); the kit's `NOTICE_KINDS` |
| `quadra.css` or the frame | Every app at 375 px, light and dark, WebKit; the status-bar strip rule (TRUTH §10) |
| `brand.mjs` | `node brand/generate.mjs`, every app's icons and manifest; `RENAMED` links |
| A table's or result's meaning (sports) | Orbit Sports: `title.mjs` `liveTable`/`roundCounted`, `freshStandings`, the home's race cards; Play's settling |
