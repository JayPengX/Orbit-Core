# Orbit: the family's map

How the whole Orbit family fits together: the shared kit, the Workers and
their APIs, where data lives and how it syncs, and the patterns every app
builds with. **Every session reads this first, whichever repo it works in**,
so that nothing is built twice and nothing breaks the core. Then:

1. `docs/RULEBOOK.md`: every rule Jay has set, dated, newest wins. Read it before any work.
2. `docs/TRUTH.md`: how to work (the owner, shipping, code structure, cost, product principles).
3. `docs/DESIGN.md`: how a screen looks. Read it before any visible change.
4. The app's own `MAP.md` (what's where inside it) and `FEATURES.md` where it has one.

**Keep it current.** A change to the architecture updates this file in the
same push: a kit module, pattern or family of exports, a route, a Worker, a
binding, a table, an R2 prefix or KV key family, a data or sync layer, a
cron's work, a workflow. `npm test` fails on your machine when a kit file,
Worker file, route, binding, D1 table, builder or workflow isn't named here
(`tests/claude-map.test.mjs`; on GitHub only a warning). An app's own structure goes in its `MAP.md`.

**Look before you write.** Before writing a helper, a component or a style,
find what the kit has: `node tools/kit-find.mjs <word…>` lists the kit's
exports and CSS classes whose name or comment matches. Use it, extend it, or
move your own into the kit (TRUTH §4); never a second copy in an app.

## Working here

- Push with `sh tools/push.sh` (no branches, no PRs): it rebases onto
  `origin/main`, runs `npm test` (and with a kit/ change every app's tests,
  `tools/test-apps.mjs`), and pushes main only if they pass; a red deploy mails Jay.
- The kit (`kit/`) is served to every app from this repo's site on
  Cloudflare (`pages.yml` → `deploy/cf-site.mjs`): a kit change is one push
  here; each app's deploy tests against main's kit.
- Workers deploy from `main` (`deploy.yml`, the wrangler tomls).
- `node tools/shots.mjs <app> --before main` takes every screenshot a change
  needs (320/390 upright, a phone on its side, tablet, desktop; light/dark;
  a diff against live); `tools/README.md` lists the tools.
- Brand, icons, share cards: `kit/brand.mjs`, `node brand/generate.mjs`.

## 1. The system

```
phone: a home-screen app at orbit.jaypengx.com/<slug>/
 ├─ the app's own files      ← Worker orbit-<slug> (static assets, published by the app's repo)
 ├─ the kit (#kit/…)         ← Worker orbit-pass at /Orbit-Core/kit/ (this repo's pages.yml)
 │    on the device: memory → Cache Storage → localStorage (versioned keys) → the service worker's caches
 └─ /api/… on the same origin (a route to the proxy; api.jaypengx.com answers too)
        ▼
orbit-workers-proxy (worker.js, near each caller): every route in §4
 │  edge cache (Cache API, by tier) · D1 STORE · R2 DATA · KV RATE_LIMIT_KV · DO F1_LOG
 │  crons: even and odd minutes (builders, notices, weather scoring, capacity, F1 laps)
 ├─ upstreams: ESPN, MLB, Jolpica, F1 timing, OpenF1, Polymarket, Yahoo, TDX,
 │   Google, CWA, MOENV, 立法院 and IVOD, 司法院, NCDR, TAIFEX, SITCA…
 ├─ gemini-relay (Gemini, placed in Taiwan: gcp:asia-east1), service GEMINI_RELAY
 ├─ orbit-law (Orbit Law's site), service LAW_SITE: its data read by the proxy
 └─ quota-guard, service GUARD: reads the bill every 5 minutes (a DO alarm),
     paces, then stops the proxy at 90% of the $5 plan
orbit-site (site.js): the domain's three hosts as custom domains; Longshot's notice
```

## 2. The apps

| App | Kit id (stores under) | Address `orbit.jaypengx.com/…` | Repo | Its data on the Pass (D1 collection) |
| --- | --- | --- | --- | --- |
| Orbit Sports | `match` | `/sports/` | Orbit-Sports | `match-find-settings` |
| Orbit Transit | `transit` | `/transit/` | Orbit-Transit | `orbit-transit` |
| Orbit Weather | `weather` | `/weather/` | Orbit-Weather | `orbit-weather` |
| Orbit Class | `orbit` | `/class/` | Orbit-Class | `orbit-class` |
| Orbit Money | `money` | `/money/` | Orbit-Money | `orbit-money` |
| Orbit Words | `vocab` | `/words/` | Orbit-Words | `vocab-progress-sync` |
| Orbit Beats | `beats` | `/beats/` | Orbit-Beats | `orbit-beats` |
| Orbit Law | `law` | `/law/` | Orbit-Law | `orbit-law` |
| Orbit Securities | `stock` | `/securities/` | Orbit-Securities | `stock-study-accounts` |

The family's order everywhere is this table's (`APP_ORDER`, the order of
`BRANDS` in `brand.mjs`). Orbit-Showcase is Jay's homepage (`jaypengx.com/`)
and `/showcase/` (open to all). This repo's site has the family page
(`/pass/`) and the admin page (`site/admin/`). A new app: a `slug` in
`kit/brand.mjs` and a collection in `eco.js` `ECO_APPS`.

**An app's shape.** `public/index.html` is `<html data-look="native">` (DESIGN
§11) with the kit's snippets (`kit/loader.html`: an import map for `#kit/…`,
`orbit.css`, `boot.js`, the `#loading` cover); one entry module draws the tabs; `lib/` holds the logic
(tested with `node --test`); views, cards and sheets draw it with the kit's
builders; the app's own CSS is only for what is truly the app's (a pitch, a
map, a chart); `sw.js` is the app's settings and then `kit/sw.js`. Its
deploy workflow tests against main's kit, stamps every file with its hash
(`scripts/stamp-version.mjs` → `kit/stamp-app.mjs`) and publishes with
`Orbit-Core/deploy/cf-site.mjs`. `npm test`'s `pretest` links `.kit` to
`../Orbit-Core/kit`. Orbit Class is the one Vite app (`src/`, `npm run build`).

## 3. The kit (`kit/`)

### 3.1 How it's served

Served from this repo's site, never copied. Each app's page carries
`kit/loader.html`'s snippets; `kit/preload.mjs` lists the first screen's
modules for modulepreload. `node kit/apps.mjs` refreshes the snippets in every
app checked out beside this one; `node kit/link.mjs` links `<app>/.kit` for tests.

- **Addresses by content.** The kit's deploy (`kit/stamp.mjs`) and every
  app's (`kit/stamp-app.mjs`) minify each file and address it by its own
  content hash (`?v=<hash>`, `kit/hash.mjs`), so a phone downloads only the
  files a push changed; the kit's `version.json` lists every hash, the
  device notes them (`orbit.kitFiles`), and a push that changes no kit file
  is no update.
- **Updates.** An open app swaps once the new version's files are on the
  phone (`updateReady`; `sw.js versionFirst` opens it);
  `sw.js` never refuses `boot.js`, which mends an unfinished update.
- **A phone may run an older kit.** A new export is used with a fallback
  (`kitUI.newThing?.(…)` through a namespace import), never imported by name,
  or the whole app stops on a phone that still has the old kit.
- **Kit CSS loads after the app's**: an override needs higher specificity,
  and should be rare (TRUTH §4).

### 3.2 Modules

| Module | What |
| --- | --- |
| `orbit.mjs` | The core: the session, data reads and device storage (§5), the economy's tables, looks and milestones, notices, the frame (`tabBar`, `topActions`, `accountButton`, `ask`/`tell`), screens, fitting, live beats and break countdowns, recommendations (`rank`, `affinity`), the 除錯紀錄 (`rec`); on import it stops pinch zoom, lifts sheets over the keyboard (`watchKeyboard`), holds the lift for pictures, presses only when pressed; `switchGlide` |
| `orbit.css` | The design system: iOS 27's tokens (colour, type, space, radius, Liquid Glass, springs) and every `q-` component; the apps' accent colours (`tools/accent-css.mjs`); at its end Orbit's own look, on every app's page (`data-look="native"`, DESIGN §11) |
| `ui.mjs` | The builders (§3.3) and their HTML-string twins (`…Html`) for apps that draw with template strings; loads `hold-place.mjs` |
| `hold-place.mjs` | A redraw never moves the page, a sheet or a panel: one the person didn't make holds what they read; a tap holds the control under the finger; never a drawing (`loose`); a content-sized sheet keeps its height (`--q-sheet-floor`); `scrollBusy()` holds `everyDev`'s beats under a finger; `freshScreen()`: a new screen at the top; `letGo()`: a drag carries its grip away |
| `steady-pics.mjs` | A picture drawn again is eager and decoded at once: no blank frame on iPhone |
| `boot.js` | The loading screen (`#loading`) and the first update check (a classic script, before the app's modules); the cover held for it |
| `loader.html` | The snippets every app's page carries (`kit:head`, `kit:boot`) |
| `brand.mjs` | Families, names, colours, marks, repos, slugs, `APP_ORDER`, `DEV` (speeds, §9) |
| `pass.mjs`, `help.mjs` | The Pass sheet (account, looks, apps, guides: never money); every app's guide (`#help=<app>[:topic]`; `tools/help-shots.mjs`) |
| `passkey.mjs` | Passkeys in the browser: made, used, named (`passkeyHere()` false where a browser can't) |
| `pass-sync.mjs` | An app's payload kept in step with the Pass's copy (`passSync`: read and merged before any write, never an older copy over a newer one); Weather, Words, Money, Law |
| `share.mjs`, `qrcode.mjs` | The share sheet (`shareSheet`): the link and its QR code in the person's own style, saved as PNG or SVG; `qrcode.mjs` is qrcode-generator 2.0.4 (MIT), vendored as is |
| `lang.mjs`, `format.mjs` | `lang`, `en`, `W(zh, en)`, `makeT`, `place()` (English place names); `money`, `price`, `pct`, `num`, `compact`, `DASH`, `twDay`/`twMonth` (Taiwan's date), `addDays` |
| `feedback.mjs` | Every app's picks, one engine: `shown`, `picked`, `passed`, `did` → weights per key (30-day half-life); `scorer`, `lifter`, `chance`, `whyOf` (常看), `hitRate`; on the Pass: `fb:<app>` |
| `holidays.mjs`, `dayoff.mjs` | Taiwan's days off; typhoon days off (停班停課) by the place that decides them for each app |
| `catalog.mjs`, `logos.mjs`, `names.mjs`, `photos.mjs`, `photo-urls.mjs` | Every sport and league once; logos (ESPN, TheSportsDB, flags, F1); teams in Chinese; studio headshots; photos' addresses alone |
| `f1live.mjs`, `postseason.mjs`, `sports-espn.mjs`, `sports-broadcast.mjs`, `sports-highlights.mjs`, `sports-winprob.mjs` | F1's own timing read one way everywhere; MLB's postseason; ESPN's scoreboards as events (one parser for the proxy and the phone); where to watch in Taiwan (past ELTA's list, `eltaGuess`: its usual line-up, said 預估); highlights; win probability (also run by the builders) |
| `stock-account.mjs`, `stock-access.mjs`, `stock-credit.mjs`, `stock-markets.mjs`, `stock-quotes.mjs`, `stock-bonds.mjs`, `stock-savings.mjs`, `stock-ipo.mjs`, `stock-holidays.mjs`, `stock-hk-lots.mjs`, `stock-jp-lists.mjs`, `stock-codec.mjs` | Securities' ledger, broker rules, markets, prices, bonds, savings, IPOs, exchange holidays, lot sizes and saved-copy codec, shared with the Worker |
| `pay.mjs`, `gov.mjs` | The weekly pay and relief (rules only; the Worker alone writes them); what the government took and gave one account |
| `flight.mjs` | A real plane in the air, on a sphere: the proxy's `/flight` and Class's 專注飛行 |
| `domain.mjs`, `devconfig.mjs`, `mirror.mjs` | The family's domain (one place); `DEV` for the Workers; the nightly mirror's addresses |
| `sw.js`, `sw-images.js` | The one service worker every app imports (page and own pictures kept first, refreshed behind; `?v=` files from the cache, checked against their hash); other sites' pictures in one cache all apps share |
| `apps.mjs`, `link.mjs`, `preload.mjs`, `stamp.mjs`, `stamp-app.mjs`, `hash.mjs` | Build tools, never served: the apps' snippets; `.kit` links; first-screen modulepreload; the kit's and each app's content-hashed build |
| `img/` | The kit's own pictures (the Premier League's mark, light and dark) |

### 3.3 Component patterns: what to use for what

Every app builds its screens from these; draw your own only for what is truly
the app's (a pitch, a map, a chart). How each should look: `docs/DESIGN.md`.

| Need | Use |
| --- | --- |
| Tabs | `tabBar({ tabs, onSelect })` (orbit.mjs): the floating capsule on a phone, a slim rail on a phone on its side and on a computer; an in-progress bar is a `.q-accessory` pill above it |
| The top line | `topActions`, `accountButton` (the account pill and at most one action) |
| A tab's title | `navTitle` / `navTitleHtml` + `wireNavTitles` (the 34 pt large title), `pageHead` |
| Switching a view | `view()` (cross-faded with View Transitions); `segmented` / `segHtml` + `settleSegs` for a whole tab's view (at most 4); a single-choice filter row is `.q-chips.q-texttabs` (text tabs) |
| A day | `dayBar` + `dayStrip` + `daySwipe` (`dayStep`, `dayList`, `dayTop`, `dayNum`, `dayToday`): the one date selector |
| A page on top | `sheet({ detent, foot, lead, trailing })`, `bindSheet`, `setSheetDetent`; `closeSheet` (orbit.mjs) slides it out; `sheetHero`, `sheetFoot` / `.q-sheet-foot`; a whole page (a game, a team, a law) in `.q-sheet-wide` with `.q-sheet-cols` / `.q-sheet-pair` |
| A question | `ask()` / `tell()` (orbit.mjs), `confirm()` (ui.mjs): never the browser's popups; a one-tap delete gets a `toast` with 復原 |
| Rows | `list` / `cell` (grouped), `rowCard`, `section` / `sectionHead` / `sectionHtml`, `.q-list-head` |
| The focal number | `.q-focus`, graphite; `heroCardHtml` only when the focus is an action; `stats` / `statsHtml`, `.q-fig` |
| Colour on a card | `.q-band` (`--band`; `.q-band-mark`, `-text`, `-end`): a row inset on the colour of what it identifies (a team, a line, a category); never a card filled with the app's colour |
| Small pieces | `tile` / `tileHtml`, `tag` / `tagHtml` (one exception per row), `.q-chip` (taps only), `toggle` (`.q-switch`), `.q-add` (an add row), `search`, `menu`, `.q-badge`, `progressRing`, `monthCalendar`, `rail`, `actionGrid`, `panelGrid`, `leagueTile`, `matchCard`, `liveStrip`, `stockRow`, `movePill`, `placeTile`, `ballRow` |
| Putting in order | `reorder(box, { onChange })`, a `grip()` / `gripHtml()` per row; `.q-row-open` for a row that also opens |
| A list's more | `moreToggle`/`moreHtml` (`.q-more`): 再看 7 則 / 收起, one quiet bar (`less: null` pages); a way on `goBar`/`goHtml`; `summaryHtml`. Never accent links |
| Nothing here | `empty({ icon, title, body, action })` / `emptyHtml` |
| Loading | `#loading` (boot.js) lifted once by `ready(firstScreen)` onto a finished screen (it waits for on-screen pictures); in place, `.q-skel` shimmers the size of what comes; a part read later holds its place as `waiting(shape)` |
| Pictures | `logoTile` / `logoTileHtml` + `wireLogos`, `darkLogos`; `logos.mjs`, `photos.mjs`; never letter tiles |
| Icons | `ICONS` (orbit.mjs) / `icons` (ui.mjs): one drawing per idea; new ones read as `kitUI.icons?.x` |
| Live data | `everyDev(key, fn)` beats at the owner's speeds (they wait while a finger is down); `data-q-live` + `liveChanged` pop a number that changed; patch in place (the same nodes), never rebuild what didn't change; `hold-place.mjs` keeps the reader's place by itself; `steady-pics.mjs` the pictures |
| Fitting | `fitNames` (`.q-fit`, `.q-fit-wrap`), `fitNumbers` / `watchFit`, `balanceRows` (`.q-balance`), `fullRows` (`.q-rows-full`/`-keep`), `.q-even` / `.q-even3` |
| Every screen | `screenFit()` / `onScreen(fn)` mark `html.q-tabrail`, `q-float`, `q-wide`, `q-w3`; `--q-page-max`, `--q-vw`; `.q-cols`; `.q-flow` + `flowColumns(root)` for columns of even height (DESIGN §10) |
| Pull to refresh, taps | `pullToRefresh`; `haptic()` / `tick()`; `PRESS_DELAY` / `pressSelector` |
| Offline | `onlineOnly` (live apps: Securities, Transit, Sports), `keepOffline` (the rest open on what they kept), `netState` / `netVerdict` |
| Picks for you | `rank` + `feedback.mjs` (`lifter`, `shown`, `picked`, `did`, `keep`); measured: `tools/picks-backtest.mjs` |
| Language | `W`, `makeT`, `place` (lang.mjs): every page in one language |
| Notices | `schedulePush([{ at, title, body, tag, kind, check }])`, `NOTICE_KINDS`, `notifyOn`, `enablePush` |
| A bug report | `rec(kind, data)` into the Pass sheet's 除錯紀錄 |

### 3.4 Tokens (`orbit.css`)

Type `--q-t-large`, `--q-t-title1..3`, `--q-t-headline`, `--q-t-body`,
`--q-t-subhead`, `--q-t-footnote`, `--q-t-caption`, `--q-t-focal`,
`--q-t-figure`; colour (the iOS palette, `--q-label*`, `--q-fill-1..4`,
`--q-bg`, `--q-grouped*`, `--q-up`/`--q-down` with Taiwan's red up, `--q-good`,
`--q-live`, the app's accent; one name for light and dark); space
`--q-s-1..7` (4…48); radius `--q-r-card` 22, `--q-r-cell` 12, `--q-r-sheet`
38; glass `--q-glass*`; motion `--q-spring-snappy|smooth|bouncy`,
`--q-dur-*`; Native's own (`html[data-look='native']`): `--nv-display` (big
numbers), `--nv-card` (`-up` on a sheet), `--nv-edge`, `--nv-lift`.
`node tools/kit-find.mjs --css <word>` lists them. Apps build on these and
the `q-` components; they don't restyle them.

## 4. The APIs: the proxy (`orbit-workers-proxy`)

`worker.js` routes (`route()`); each route's work is in its own file;
`http.js` is what every route answers with (who may call, CORS, JSON). No
placement: it runs near each caller; only Gemini goes through
`gemini-relay.js`, pinned to Taiwan. Every answer carries `Server-Timing:
w;dur=` (the Worker's own time), which the 除錯紀錄 notes with a slow read.

| Route | File | What |
| --- | --- | --- |
| `/eco` | `eco.js`, `eco-admin.js`, `money.js`, `passkey.js`, `webauthn.js`, `orbit-token.js` | The Pass (§6); `op: 'admin'` is the owner's panel |
| `/stock` | `stock-fill.js`, `stock-check.js` | Securities' fills at the proxy's own quote; the account replayed on each save |
| `/push/…` | `push.js` | Subscriptions, scheduled notices, checks (an ESPN final, a Yahoo price, weather, a bus) |
| `/weather…` | `weather.js`, `weather-skill.js`, `weather-stations.js`, `typhoon.js` | The blend for a ~1 km cell (Google, CWA, MOENV, stations), the township, sources scored hourly (`/weather/skill`); during a typhoon warning (NCDR's CAP feed), `dayOff`: each county's 停班停課 from 人事行政總處 (through the relay), else a chance fitted to the counties' past decisions, for all 22 every 3 minutes |
| `/transit/…` | `transit.js` | TDX (allowlist `TDX_RULES`), map config, search, place, route, `drive` (a bus in traffic); `/transit/status?sample=` (a session or the dev door only) |
| `/sports-proxy` | `sports.js`, `asia-baseball.js`, `f1-live.js`, `f1-people.js`, `fund-nav.js`, `taifex.js` | The data proxy (§4.1): sports, quotes, F1, Asian baseball, SITCA's fund NAVs, TAIFEX |
| `/sports-today` | `sports-today.js`, `kit/sports-espn.mjs` | Orbit Sports' day of scoreboards in one answer, built on demand (§4.1) |
| `/gemini`, `/nl-edit` | `worker.js` | Orbit Class's photo import and plain-language edits (fixed prompts) |
| `/law-ask` | `law.js`, `law-ruling.js`, `law-ground.js` | Orbit Law's questions on 1–8 articles, every point cited and checked, kept in KV by the law's version; `mode: 'bill'` (from its 對照表), `'diff'` (an amendment), `'ruling'` (from its own paragraphs); 40 Gemini calls a day a Pass, 300 in all with `/law-chat`'s (D1 `law_day`) |
| `/law-chat` | `law-chat.js`, `law-ground.js`, `law-more.js` | 問法律: a plan, up to 14 articles from Orbit Law's lists and full-text index, an answer from those only, every cite checked; grounded by Law's `ai/facts.json`, `ai/news.json`, `bills/items.json` and `ly/budget.json` (`law-ground.js`) and the rulings and rules found beside them (`law-more.js`); 30 turns a day a Pass |
| `/law-page` | `law-page.js`, `law-hosts.js` | A government page (gov.tw, www.edu.tw) read inside Orbit Law, cleaned, in its own charset (or a PDF's size); Cloudflare's cache only; Taiwan-only county sites through the Taiwan relay (`law-hosts.js`); 500 fresh reads a day a Pass |
| `/law-live` | `law-live.js` | What 立法院's IVOD streams now (`{at, rooms}`), read on demand, 60 s at the edge, the last good read kept 30 minutes; our pages only, no Pass |
| `/money-read` | `money-read.js` | Orbit Money's 拍照記帳: one picture → `{ buys, left }`, read by Gemini (Flash-Lite, through the relay) and checked; only on a tap; 30 a day a Pass, 300 in all |
| `/flight` | `flight.js`, `kit/flight.mjs` | Orbit Class's 專注飛行: real planes landing in about N minutes, then one followed |
| `/showcase/pass` | `showcase.js` | The showcase's short pass for its live demos: reads only, per-address and daily caps, from the showcase's address only |
| `/data/…` | `data.js` | R2, public reads (§5.5); `/data/build` (POST, Bearer `DATA_PUSH_SECRET`, `build.yml`) runs a builder now |
| `/config` | `worker.js`, `kit/devconfig.mjs` | The live speeds (`DEV`), a minute in Cloudflare's cache |
| `/guard` | `worker.js` | The bill's guard as it last read the bill (no key) |
| `/store/check` | `worker.js`, `doc-store.js` | Each collection's count, from a localhost page only |
| `/ops` | `ops.js`, `worker.js` | The repo's own checks (Bearer `DATA_PUSH_SECRET`): `?check=gemini`, `law-chat` (問法律's steps timed), `system`, `purge-money-mail` |

- **The gate:** every route needs a Pass session (`qt=`), counted per
  session and app in memory (600 a minute on the data proxy). Public routes
  (`/sports-today`, `/law-live`) answer our pages' origins only.
- **Same origin:** a page on the domain calls `orbit.jaypengx.com/api/…`
  (`kit/domain.mjs` `API`; `viaSite` in worker.js takes `/api` off): one
  connection, no CORS preflight. `api.jaypengx.com` and workers.dev answer too.
- **Dev doors:** a request with `Origin: http://localhost:<port>` and no
  pass gets a dev session on `/sports-proxy`, `/transit`, `/weather` and
  `/flight` (counted per address). `tools/preview.mjs --live` uses them.

  ```bash
  curl -H 'Origin: http://localhost:8123' 'https://api.jaypengx.com/sports-proxy?url=<encoded>&app=match'
  ```

- **Crons:** even minutes (notices, builders at :16 and on, weather
  scoring, capacity); F1's laps on both. Add work to these (or a Durable
  Object alarm), never new Cron Triggers: ones registered since October 2026 never ran.
- **The proxy is the only one adding money:** `eco.js appEntries` takes only
  spending from apps, dated by the Worker; Securities' cash and cost are the
  Worker's (`stock-check.js`).

### 4.1 The data proxy (`/sports-proxy`)

`?url=<encoded>&app=<kit id>&qt=` passes an upstream through if its host is
on `SPORTS_PROXY_ALLOWED_HOSTS`. Two hosts are not real: `asia-baseball.orbit`
(NPB, KBO, CPBL from their own sites) and `f1-live.orbit` (F1's live timing:
`now.json`, `session.json`, `laps.json`, `circuit.json`; `/about.json` and
`/face.json` for drivers the F1 sites don't know, `f1-people.js`; the DO
`F1Log` logs laps). A finished session is F1's archive's, else rebuilt from
OpenF1's tables (`openF1Raw`) and kept in R2 for good.

- **Trims** (`&trim=`) return only what an app reads (ESPN's heavy pages, Polymarket, Jolpica, FotMob, ELTA, YouTube, formula1.com).
- **Batches** (`?batch=1&u=…&lines=1`): up to 24 reads in one request,
  each written as it's ready. A slow item answers 504 and is asked alone.
- **Edge cache tiers** (`sports.js` `CACHE_*`): each has `fresh` (served as
  is) and `stale`. Just past fresh (up to as long again, a minute at least)
  the copy is served while it's read again behind it (stale-while-revalidate);
  older but inside `stale`, it's read now and the old copy answers only if
  that takes over 2 s or fails. Live 2–10 s, odds 10 s, quotes 30 s and F1
  live 4 s never serve stale; final 24 h; schedule 10 min (+1 day);
  standings 30 min (+1 day); history 30 min (+1 day); search a day; career a
  week. `X-Sports-Proxy-Cache` says `HIT`, `STALE`, `MISS` or `KEPT`.
- **Kept on demand:** what's over for good (an ESPN game, day or month all
  over; an Asian month; an F1 session, laps, a track's map; past results) is
  kept in R2 the first time it's read (`settleable`, `readKept`) and wiped
  with its season (`builders/kept.js`).
- **A day in one answer** (`GET /sports-today?day=YYYY-MM-DD`,
  `sports-today.js`): Orbit Sports' first screen, built on demand (no cron)
  from the ESPN pages through the proxy's own read (`readThrough`), parsed by
  the kit's `sports-espn.mjs`; 60 s at the edge for today and tomorrow, longer
  for older days, 10 s when a league was missed; from pace 2 it answers 503
  `{error: 'paced'}` and the phone reads as before.

### 4.2 The other Workers

| Worker | File, toml | What |
| --- | --- | --- |
| `quota-guard` | `guard-worker.js`, `guard.js`, `wrangler.guard.toml` | The bill's guard (§9); DO `GuardClock` (its 5-minute alarm), KV for its state; `/errors`, `/hours` (7 days hourly) for the panel |
| `gemini-relay` | `gemini-relay.js`, `wrangler.gemini.toml` | Gemini's calls from Taiwan (placement `gcp:asia-east1`) |
| `orbit-site` | `site.js`, `site-closed.js`, `wrangler.site.toml` | The domain's custom domains; Longshot's shutdown notice |
| `orbit-<slug>`, `orbit-pass`, `orbit-home` | `deploy/cf-site.mjs` | Each repo's static site, an assets-only Worker on routes of its paths (§10) |

## 5. Data and sync

### 5.1 A read, layer by layer

A read (`kit proxyJson`) goes down these until one answers:

1. memory (500 keys; the same address within its `ttl`);
2. the device's Cache Storage (`orbit-data-v1`, copies kept 4 days):
   younger than its `ttl`, used as is;
3. the failure hold (a source that just failed isn't asked by every part
   of the page: 15 s, a minute after a 429 or 401);
4. the family's data in R2 (`/data/`, `packJson`): seasons, game days,
   watch links, win probability, photos, bus packs, shapes;
5. the proxy's edge cache in Taiwan, by tier (§4.1);
6. reads kept on demand in R2: what's over for good, kept the first time
   anyone reads it;
7. the upstream.

- On the device, a copy past its `ttl` is read again and the page waits for
  that read; the old copy is the answer only if the read fails. To paint at
  once on what the phone has, an app asks `peekJson(url)` (the last copy of
  any age) first and draws the fresh one when it lands.
- Reads made within a few milliseconds go to the proxy as one batch.
- A failed read is a failure, never "nothing there". It answers the device's
  copy of any age and is asked again soon. A batch item that fails is that
  item's failure alone.
- Two sources answer the phone itself (open to any page): ESPN's core API
  is always read from the device (it refuses the proxy); Jolpica through
  the proxy, but a read the proxy can't get (Jolpica counts per address,
  and Cloudflare's are shared) is read from the device at once, and from
  the device for ten minutes after (`proxyJson`, `SELF_TOO`).
- On top of these, apps put live knowledge over slower copies: Sports'
  `liveTable` counts results before ESPN does; F1's own timing calls a
  session over at the flag; MLB's postseason comes from MLB itself.

### 5.2 Where data lives

| Store | Binding | What's in it |
| --- | --- | --- |
| D1 `orbit-store` | `STORE` | `docs(coll, id, payload, updated)`: every wallet, each app's data, the inbox, passkeys, the config (`doc-store.js`); `history`: every version a write replaced (§5.3); `gemini_call`: every Gemini call (`gemini-use.js`); `law_day`: Law's and Money's AI counts a day; `beats`: each job's last run and failures (`ops.js`) |
| R2 `orbit-data` | `DATA` | Public: the builders' packs (`sports/`, `winprob/`, photos, `bus/`, `shape/`, `where.json`), the proxy's kept reads (`mirror/`). Never served: `private/` (the nightly store backups `private/store/<day>.jsonl.gz`, Firestore's last copy) |
| KV | `RATE_LIMIT_KV` | Counters (sign-ins, per-address limits); the guard's state, pace and alerts (`guard:*`); push's devices, prefs and due notices (`push:*`); Google Weather's shared cells and its calls a day (`weather:g:*`, `weather:google:<day>`); TDX's last good reads and its month's meter (`tdx:warm:*`, `transit:use:<month>`); Law's kept plans and answers (`law:*`); the showcase's passes a day (`showcase:passes:*`); `ops:data-folders` |
| Durable Objects | `F1_LOG`, `CLOCK` | `F1Log`: F1's laps as they're driven; `GuardClock`: the guard's alarm |
| Edge cache | (Cache API) | The data proxy's answers by tier (§4.1), `/sports-today`, TDX's reads and routes (`transit.js`), the weather blend's cells (`weather.js`), `/law-live`, `/law-page`, `/config` |
| Services | `GEMINI_RELAY`, `LAW_SITE`, `GUARD` | The relay; Orbit Law's site (its data, read by the proxy); the guard's `/errors` |

D1 and R2 are bound at deploy (`deploy.yml` adds them to `wrangler.toml`).
A new Cloudflare product goes into `guard.js` `PLAN` in the same change.

### 5.3 The Pass and each app's data (sync)

- **Session:** `orbitSession(app)` (orbit.mjs) signs in (the gate), makes
  this app the live one, and gives `q.read({ data, inbox })`,
  `q.write({ payload, wallet })` (only while live), `q.claim()`, events
  (`wallet`, `active`, `claim`, `signedout`), and a heartbeat every 2 minutes.
  One app runs in one place at a time; others get `409 ECO_SESSION_MOVED`.
- **The wallet** (`eco-wallets`) is merged by the Worker (`mergeWallet`):
  `entries` (fixed ids, so one sent twice counts once), `snap` (each app's
  figures, newest wins), `settings` (newest wins per key), `apps`, `inbox`,
  `live`, `sec`.
- **Each app's data** is one document in its own collection (§2), under the
  account's id, written only if it's still the version read (`updated`, a
  precondition; a lost race throws). `pass-sync.mjs` (`passSync`) reads and
  merges the Pass's copy before any write whenever another device may have
  written, never writes an older copy over a newer one, and never writes
  over a copy it couldn't read: Weather, Words, Money and Law use it; Sports,
  Transit, Class, Beats and Securities write their payload through the
  session themselves.
- **Nothing lost:** a save is refused if it would turn JSON data into
  anything else or was merged over an older copy (`base`). Every version a
  write or delete replaces goes to D1's `history` (whole 2 days, daily 30),
  the whole store to R2 each night (`store-backup.js`), and D1's Time Travel
  covers 30 days; the admin page's 備份與復原 puts any of them back.
- **Saved copies carry a version in their key** (`fx.day.v4`); bump it
  when the meaning changes (TRUTH §4).

### 5.4 On the device

- `localStorage` only through `readStore` / `writeStore` / `readJson` /
  `writeJson` (never throwing); keys are the app's with a version
  (`orbit-transit.v1`), the kit's own `orbit.*`. `cachedPayload` /
  `cachedWallet` are the last Pass copies, to open on at once.
- Outside data in Cache Storage `orbit-data-v1`, written when the page is
  idle; the app's files in the service worker's cache; other sites' pictures
  in one shared cache (`sw-images.js`). Signing out wipes it all (`wipeDevice`).

### 5.5 The family's data (`data.js`, `builders/`)

R2 bucket `orbit-data`, served at `/data/<path>`. The builders run from
`builders/run.js` on the even-minute cron, each only as often as its data
changes, writing a file only when it changed (`builders/store.js`):

| Builder | Writes | When (UTC) |
| --- | --- | --- |
| `sports.js`, `season.js`, `within.js` | `sports/<league>/<year>.json`, `days.json`, `bounds.json` | daily 16:00 |
| `watch.js` | `sports/watch.json`, the season archive | hourly / daily 20:00 |
| `winprob.js` | `winprob/…` | daily 23:00 |
| `photos.js`, `official-photos.js` | photo lists, cutouts, official headshots | hourly / daily 18:00 |
| `buses.js` | `bus/…`, `shape/…`, `where.json` | a city once a week |
| `asia.js`, `cpbl.js` | CPBL's month and standings | daily 15:00 |
| `f1kept.js` | each finished F1 session's 數據 and laps, kept before anyone opens them (through the proxy; OpenF1 turns quick askers away) | :06, :26, :46 |
| `kept.js` | wipes the proxy's kept copies (`mirror/`) from before a league's first askable day | daily 17:00 |

A season is kept whole until the next season's first game (preseason
included), then wiped whole. `private/` is never served.

## 6. The Orbit Pass (`/eco`)

- **A pass** is a random 10-character code the owner issues (admin page,
  `tools/issue-passes.mjs`), replaced at its first sign-in (`freshPass`: its `new`
  session takes only `rotate`; then a passkey, `freshGate`). The account's id is
  PBKDF2-SHA256 of it, peppered by `ECO_TOKEN_SECRET` (`passKey`), which **must
  never change**: passes since 2026-10-27 would lose their accounts. Sign-ins:
  30 an hour an address.
- **Passkeys** (`passkey.js`, `webauthn.js`; `kit/passkey.mjs`): any number
  per Pass, RP ID `jaypengx.com`; the pass signs in too. Sign-in, a new pass
  and the admin key are forms password managers fill.
- **Devices never keep the pass:** a refresh token (60 days) and a short
  session token (`orbit-token.js`, HMAC under `ECO_TOKEN_SECRET`).
- **Ops:** login, refresh, read/patch/delete, device codes (`eco-pairs`),
  `#qh=` hand-offs, sign out everywhere, rotate, merge passes (`eco-inbox`),
  Class's share keys (`eco-shares`), admin.

## 7. The economy

The numbers live in `eco.js` and the kit's `orbit.mjs` (the same tables in
both; RULEBOOK §4): NT$200,000 to open, NT$10,000 every Monday, 急難紓困
(`kit/pay.mjs`), 財富等級 rewards, 1% a month overdraft, no personal loan.
Money is shown and written only in Securities (資金), never on the Pass sheet; and `eco:` ids are the Worker's alone.
Securities' broker rules (`stock-access.mjs`, `stock-credit.mjs`): its MAP.md.

## 8. Notices (`/push`)

Apps hand the Worker their coming notices (`schedulePush`); it sends them by
Web Push (WebCrypto) and can check first (an ESPN final, a Yahoo price, the
weather, a bus). One device per person per app; every kind in `NOTICE_KINDS`
can be turned off on its own.

## 9. Speeds, capacity and the bill

- **Live speeds** are the owner's (`kit/brand.mjs DEV`, set in the admin
  panel, served by `/config`): `sportsList`, `sportsGame`, `f1*`,
  `playLive`, `tdx*`, `transit*`. `autoScale` slows them together as the
  family grows (`capacity.js`).
- **AI caps** are settings too (`DEV ai*`): calls a day for everyone, 0
  pauses the feature (`worker.js aiCap`). Every Gemini call is a row in D1
  `gemini_call` (`gemini-use.js`). Gemini runs only behind a person's tap.
- **Errors**: each route's 5xx tallied (`err:<route>:<day>`); the guard's
  `/errors`; the panel's 部署 runs workflows with `GH_ACTIONS_TOKEN`.
- **容量** (`capacity.js` `quotas`): each quota's people held = this
  week's × (room past the fixed part ÷ people's use), the fewest named;
  Workers' fixed part from the guard's `/hours`.
- **`quota-guard`** (`guard.js`, every 5 minutes) reads the account's use
  against `PLAN` (Workers, CPU, KV, DO, R2, D1), paces from 60% (`pace.js`:
  slower refreshes, builders parked), tells the owner at 50/75/90%
  (`ops.js`), and at 90% of any count turns the proxy off until the next period.
- **Each toml caps CPU** (`[limits]`) and samples logs.

## 10. Deploying, secrets and the domain

- `main` deploys:
  - `deploy.yml`: the proxy and `gemini-relay` (and `orbit-site`);
  - `deploy-guard.yml`: the guard, only when its files change;
  - `pages.yml`: the kit and `site/`, to Cloudflare (tests first);
  - every app repo's deploy workflow: its own site, to Cloudflare.
- By hand: `build.yml` (a builder now, a check), `tail.yml` (logs),
  `audit.yml` (secret names, the store counted), `zone-speed.yml` (the zone's
  HTTP/3, 0-RTT, Early Hints, Brotli, Tiered Cache).
- Never a cancelling `concurrency:` in a deploy workflow (a cancel mails
  Jay): copy the `queue` job; builds check out main's tip.
- **Only what must stay secret is a secret.** Public settings live in code
  or the tomls.
  - GitHub: `CLOUDFLARE_API_TOKEN`, `CF_GUARD_TOKEN`, `DATA_PUSH_SECRET`,
    `ECO_TOKEN_SECRET`, `ECO_ADMIN_TOKEN`.
  - The proxy: Google's keys, `CWA_KEY`, `MOENV_KEY`, `TDX_CLIENT_*`.
- **The domain:** `kit/domain.mjs` `DOMAIN` (jaypengx.com), the one place
  it is set. Each repo publishes its built site with `deploy/cf-site.mjs`
  (an assets-only Worker on routes of its paths: free to serve; routes win
  over the custom domains): `orbit.<DOMAIN>/<slug>/` every app (`slug`,
  `SHORT` in `kit/brand.mjs`; one origin, so one Pass sign-in), `orbit-pass`
  for `/`, `/pass/`, `/Orbit-Core/` and the old `/Shared-Proxy/`,
  `orbit-home` for `<DOMAIN>/` (Orbit-Showcase: Jay's homepage, `/showcase/`).
  Paths behave as a plain static site (`/law` moves to `/law/`). Mail to
  `*@<DOMAIN>` reaches the proxy by Email Routing's catch-all. `deploy.yml`
  attaches the hostnames (the deploy token needs the zone, and Account · D1 ·
  Edit); the guard takes them off with the proxy.
- Longshot is shut down.

## 11. Tools and tests

| Tool | What |
| --- | --- |
| `node tools/kit-find.mjs <word…>` | The kit's exports and CSS classes whose name or comment matches: look here before writing a helper or a style |
| `node tools/shots.mjs <app> [page…]` | Every screenshot a change needs (five screens × light/dark, live data, signed in), a contact sheet, faults, `--before main` diff; pages in `tools/shots/pages.mjs` |
| `node tools/preview.mjs <app>` | The app with real data (`--live`, `--width`, `--timing`, `--requests`, `--profile`, `--webkit`, `--reopen`…); prints `wraps:`, `cut:`, `scrolls sideways:` |
| `node tools/gate.mjs [app…]` | The family quality gate (`tools/gate-page.js`): lift, stalls, dead taps, wraps, cuts, letters, white, mixed language… on every tab |
| `node tools/f1-replay.mjs --start <UTC> --at <UTC>` | An F1 session as F1's live feed had it at any moment of a recorded one (OpenF1's tables), as the preview's `--fixture`s: shots of a red flag or a safety car with no session on (`shots.mjs sports f1-live … -- $(cat <out>/args.txt)`) |
| `node tools/live-scroll.mjs [app…]` | Nothing jumps: pages watched as they load (`late`), then scrolled as Safari scrolls: a refresh above, a tab drawn short, a moving drawing, taps that fold below and above, a sheet showing less; exit 1 if anything moved |
| `node tools/store-shots.mjs <app>` | The README's and Showcase's screenshot set, both languages |
| `node tools/test-apps.mjs [app…]` | Every app's tests against this kit (checkouts beside this one) |

The rest (leagues, Securities' lists, ESPN's shapes, passes, accent colours): `tools/README.md`.

`npm test` covers every Worker route, the builders, the guard, the kit, and
this map (`tests/claude-map.test.mjs`).

## 12. If you change…

| This | Also check |
| --- | --- |
| Anything in §1–§5 | This file, in the same push |
| A league (`kit/catalog.mjs`) | Sports' `leagues.mjs`/`broadcast.mjs`, `builders/`, `tools/leagues-audit.mjs` |
| `proxyJson`, `packJson` | Every app's first paint; `sports.js`, `data.js` |
| A trim | Every parser that reads it, and the builders |
| A Cloudflare product or cron | `guard.js` `PLAN` |
| `f1-live.js`, `f1-people.js` | Sports' F1 board; drivers the F1 sites don't know |
| `fund-nav.js`, `taifex.js` | Securities' 境內基金 NAVs; 期貨 and 選擇權 |
| `money-read.js` | Orbit Money's 拍照記帳 (`views/photo.mjs`) |
| `eco.js` money rules | The kit's tables, Securities' `lib/truth.mjs` and 資金 tab, `help.mjs` |
| `push.js` checks | The apps that schedule them, `NOTICE_KINDS` |
| `orbit.css`, `ui.mjs` or the frame | Every app (`tools/shots.mjs` on each, `tools/live-scroll.mjs`), light and dark |
| A new kit export | Its users read it with a fallback (§3.1) |
| `brand.mjs` | `node brand/generate.mjs` |
