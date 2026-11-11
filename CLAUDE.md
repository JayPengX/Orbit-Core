# Orbit: the family's map

How the whole Orbit family fits together: the shared kit, the Workers and
their APIs, where data lives and how it syncs, and the patterns every app
builds with. **Every session reads this first, whichever repo it works in**,
so that nothing is built twice and nothing breaks the core. Then:

1. `docs/RULEBOOK.md`: every rule Jay has set, dated, newest wins. Read it before any work.
2. `docs/TRUTH.md`: how to work (the owner, shipping, code structure, cost, product principles).
3. `docs/DESIGN.md`: how a screen looks. Read it before any visible change.
4. The app's own `MAP.md` (what's where inside it) and `FEATURES.md` where it has one.

**Keep it current.** An architecture change (a kit module or pattern, a
route, a Worker, a binding, a table, an R2 prefix or KV family, a data or
sync layer, a cron's work, a workflow) updates this file in the same push;
`npm test` fails locally when one isn't named (`tests/claude-map.test.mjs`); an app's own,
its `MAP.md`.

**Look before you write.** Before a helper, a component or a style, run
`node tools/kit-find.mjs <word…>` (the kit's exports and CSS classes). Use
it, extend it, or move yours into the kit (TRUTH §4); never a second copy.

## Working here

- Push with `sh tools/push.sh` (no branches, no PRs): it rebases onto
  `origin/main`, runs `npm test` (and with a kit/ change every app's tests,
  `tools/test-apps.mjs`), and pushes main only if they pass; a red deploy mails Jay.
- The kit (`kit/`) is served to every app from this repo's site on
  Cloudflare (`pages.yml` → `deploy/cf-site.mjs`): a kit change is one push
  here; each app's deploy tests against main's kit.
- Workers deploy from `main` (`deploy.yml`, the wrangler tomls).
- `node tools/shots.mjs <app> --before main` takes every screenshot a change
  needs (§11); `tools/README.md` lists the tools.
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
 │  edge cache (Cache API, by tier) · D1 STORE · R2 DATA · KV RATE_LIMIT_KV · DO F1_LOG, DOOR, RUNNER
 │  heavy routes and crons' work in the DO Runner (runner.js: 30 s CPU, the Free plan's 10 ms)
 ├─ upstreams: ESPN, MLB, Jolpica, F1, OpenF1, Polymarket, Yahoo, TDX,
 │   Google, CWA, MOENV, 立法院, 司法院, NCDR, TAIFEX…
 ├─ gemini-relay (Gemini, Claude, GPT from Taiwan: gcp:asia-east1), GEMINI_RELAY
 ├─ orbit-law (Orbit Law's site), service LAW_SITE: its data read by the proxy
 └─ quota-guard, service GUARD: reads the bill every 5 minutes (a DO alarm),
     paces (Free plan: a day's amounts, no stop)
orbit-site (site.js): the domain's hosts as custom domains
```

## 2. The apps

| App | Kit id | Address `orbit.jaypengx.com/…` | Repo | D1 collection |
| --- | --- | --- | --- | --- |
| Orbit Sports | `match` | `/sports/` | Orbit-Sports | `match-find-settings` |
| Orbit Transit | `transit` | `/transit/` | Orbit-Transit | `orbit-transit` |
| Orbit Weather | `weather` | `/weather/` | Orbit-Weather | `orbit-weather` |
| Orbit Class | `orbit` | `/class/` | Orbit-Class | `orbit-class` |
| Orbit Money | `money` | `/money/` | Orbit-Money | `orbit-money` |
| Orbit News | `news` | `/news/` | Orbit-News | `orbit-news` |
| Orbit Words | `vocab` | `/words/` | Orbit-Words | `vocab-progress-sync` |
| Orbit Beats | `beats` | `/beats/` | Orbit-Beats | `orbit-beats` |
| Orbit Law | `law` | `/law/` | Orbit-Law | `orbit-law` |
| Orbit Securities | `stock` | `/securities/` | Orbit-Securities | `stock-study-accounts` |

The family's order: this table's (`APP_ORDER`). Orbit-Showcase is Jay's homepage and `/showcase/`. This repo's site has the family page
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
modules for modulepreload. `node kit/apps.mjs` refreshes every app's snippets;
`node kit/link.mjs` links `<app>/.kit` for tests.

- **Addresses by content.** The kit's deploy (`kit/stamp.mjs`) and every
  app's (`kit/stamp-app.mjs`) minify each file and address it by its hash
  (`?v=<hash>`, `kit/hash.mjs`): a phone downloads only what a push changed;
  `version.json` lists every hash (`orbit.kitFiles`).
- **Updates.** On a quick link `sw.js pageFirst` opens the server's page
  (the new version, started once); else boot.js reloads behind the cover.
  An open page swaps only after 5 minutes away (`AWAY_MS`).
- **A phone may run an older kit:** a new export is read with a fallback
  (`kitUI.newThing?.(…)`, a namespace import), never imported by name.
- **Kit CSS loads after the app's**: an override needs higher specificity.

### 3.2 Modules

| Module | What |
| --- | --- |
| `orbit.mjs` | The core: the session, data reads and device storage (§5), the economy's tables, looks and milestones, notices, the frame (`tabBar`, `topActions`, `accountButton`, `ask`/`tell`), screens, fitting, live beats and break countdowns, recommendations (`rank`, `affinity`), the 除錯紀錄 (`rec`); on import it stops pinch zoom, lifts sheets over the keyboard (`watchKeyboard`), holds the lift for pictures, presses only when pressed; `switchGlide` |
| `orbit.css` | The design system: iOS 27's tokens (colour, type, space, radius, Liquid Glass, springs) and every `q-` component; the apps' accents (`tools/accent-css.mjs`); at its end Orbit's own look (`data-look="native"`, DESIGN §11) |
| `ui.mjs` | The builders (§3.3) and their HTML-string twins (`…Html`) for apps that draw with template strings; loads `hold-place.mjs` |
| `hold-place.mjs` | A redraw never moves the page, a sheet or a panel; a tap holds the control under the finger; never a drawing (`loose`); a sized sheet keeps its height (`--q-sheet-floor`); `scrollBusy()` holds `everyDev` under a finger; `freshScreen()`: a new screen at the top; `letGo()`: a drag carries its grip away |
| `steady-pics.mjs` | A picture drawn again is eager and decoded at once |
| `sources.mjs`, `source-watch.mjs` | Outside sources (`SOURCES`, `sourceOf`, `stateOf`: admin 外部來源); a phone's own outside reads, beaconed to `/sources` |
| `boot.js` | The loading screen (`#loading`) and the first update check (a classic script, first); the cover held for it |
| `loader.html` | The snippets every app's page carries (`kit:head`, `kit:boot`) |
| `brand.mjs` | Families, names, colours, marks, repos, slugs, `APP_ORDER`, `DEV` (speeds, §9) |
| `pass.mjs`, `help.mjs` | The Pass sheet (account, looks, apps, guides: no money); each app's guide (`#help=<app>[:topic]`; `tools/help-shots.mjs`) |
| `passkey.mjs` | Passkeys in the browser: made, used, named (`passkeyHere()` false where a browser can't) |
| `news-outlets.mjs` | News' outlets: owner, place (藍綠, 統獨, left–right), sources (`BASIS`); `TOPICS`; `sideOf`, `partiesIn`, `topicsOf`, `namesRe` |
| `ai.mjs`, `family.mjs`, `today.mjs` | AI (mark `icons.ai`, `--q-ai`): `aiCall`, `aiFlow` (asks back), `pickList`/`picker`, `aiBar`, `aiPicture`; the phone's family notebook (`tell`/`heard`, places, Class's periods, `planHash`); Pass's 今天 |
| `pass-sync.mjs` | An app's payload kept in step with the Pass's copy (`passSync`: read and merged before any write, never an older copy over a newer one); Weather, Words, Money, Law |
| `share.mjs`, `qrcode.mjs` | The share sheet (`shareSheet`): the link and its QR code in the person's own style, saved as PNG or SVG; `qrcode.mjs`: qrcode-generator 2.0.4 (MIT), vendored |
| `lang.mjs`, `format.mjs` | `lang`, `en`, `W(zh, en)`, `makeT`, `place()` (English place names); `money`, `price`, `pct`, `num`, `compact`, `DASH`, `twDay`/`twMonth` (Taiwan's), `localDay` (the phone's), `addDays` |
| `feedback.mjs` | Every app's picks, one engine: `shown`, `picked`, `passed`, `did` → weights per key (30-day half-life); `scorer`, `lifter`, `chance`, `whyOf` (常看), `hitRate`; on the Pass: `fb:<app>` |
| `holidays.mjs`, `dayoff.mjs`, `rain-now.mjs` | Taiwan's days off; typhoon days off (停班停課) by who decides them; `radar` as rain (`rainNow`) |
| `catalog.mjs`, `logos.mjs`, `names.mjs`, `photos.mjs`, `photo-urls.mjs` | Sports' leagues once; logos (ESPN, TheSportsDB, flags, F1, old names); teams in Chinese; studio headshots; photos' addresses alone |
| `f1live.mjs`, `postseason.mjs`, `sports-espn.mjs`, `sports-broadcast.mjs`, `sports-highlights.mjs`, `sports-winprob.mjs` | F1's own timing read one way everywhere; MLB's postseason; ESPN's scoreboards as events (proxy and phone); where to watch in Taiwan (past ELTA's list: `eltaGuess`, 預估); highlights; win probability |
| `stock-account.mjs`, `stock-access.mjs`, `stock-credit.mjs`, `stock-markets.mjs`, `stock-quotes.mjs`, `stock-bonds.mjs`, `stock-savings.mjs`, `stock-ipo.mjs`, `stock-holidays.mjs`, `stock-hk-lots.mjs`, `stock-jp-lists.mjs`, `stock-codec.mjs` | Securities' ledger, broker rules, markets, prices, bonds, savings, IPOs, holidays, lot sizes, saved-copy codec; shared with the Worker |
| `pay.mjs`, `gov.mjs` | The weekly pay and relief (rules only; the Worker alone writes them); what the government took and gave one account |
| `flight.mjs`, `ebus.mjs`, `ebus-read.mjs` | A real plane in the air on a sphere (`/flight`, Class's 專注飛行); bus sites' ETAs, notices as TDX's (臺中, 桃園, 臺南: phones, then proxy; 高雄: phones) |
| `domain.mjs`, `devconfig.mjs`, `mirror.mjs` | The family's domain (one place); `DEV` for the Workers; the nightly mirror's addresses |
| `sw.js`, `sw-images.js` | The one service worker every app imports (page and own pictures kept first, refreshed behind; `?v=` files from the cache, checked against their hash); other sites' pictures in one cache all apps share |
| `apps.mjs`, `link.mjs`, `preload.mjs`, `stamp.mjs`, `stamp-app.mjs`, `hash.mjs`, `frame-guard.mjs`, `no-net.mjs` | Build tools, never served: the apps' snippets; `.kit` links; first-screen modulepreload; the kit's and each app's content-hashed build; `frameFaults` (apps' tests: only colours on the tab bar); tests offline |
| `img/` | The kit's own pictures (the Premier League's mark, light and dark) |

### 3.3 Component patterns: what to use for what

Every app builds its screens from these; draw your own only for what is truly
the app's (a pitch, a map, a chart). How each should look: `docs/DESIGN.md`.

| Need | Use |
| --- | --- |
| Tabs | `tabBar({ tabs, onSelect, onShow })` (orbit.mjs): a phone's floating capsule, a rail on its side and a tablet (one width, `--q-tabrail-cw`), a computer's side bar (`q-desk`); apps set only its colours; an in-progress bar is a `.q-accessory` pill above it |
| The top line | `topActions`, `accountButton` (the account pill and at most one action) |
| A tab's title | `navTitle` / `navTitleHtml` + `wireNavTitles` (the 34 pt large title), `pageHead` |
| Switching a view | `view()` (cross-faded with View Transitions); `segmented` / `segHtml` + `settleSegs` for a whole tab's view (at most 4); a single-choice filter row is `.q-chips.q-texttabs` (text tabs) |
| A day | `dayBar` + `dayStrip` + `daySwipe` (`dayStep`, `dayList`, `dayTop`, `dayNum`, `dayToday`): the one date selector (a week at most on a wide page); a swipe anywhere on the page, its empty space too, outside a sheet |
| Going back | `edgeBack({ target, back })`: a swipe from the left edge |
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
| Live data | `everyDev(key, fn)` beats at the owner's speeds (waiting while a finger is down); `data-q-live` + `liveChanged` pop a changed number; patch in place, never rebuild what didn't change; `hold-place.mjs` keeps the reader's place by itself; `steady-pics.mjs` the pictures |
| Fitting | `fitNames` (`.q-fit`, `.q-fit-wrap`), `fitNumbers` / `watchFit`, `balanceRows` (`.q-balance`), `fullRows` (`.q-rows-full`/`-keep`), `.q-even` / `.q-even3` |
| Every screen | `screenFit()` / `onScreen(fn)` mark `html.q-tabrail`, `q-float`, `q-desk`, `q-wide`, `q-w3`; `--q-page-max`, `--q-vw`. By their own width, anywhere (a page, a sheet, a pane): `.q-cols`, `.q-flow` + `flowColumns(root)` (columns of even height), `.q-grid` (cards), `.q-split` (list beside detail) (DESIGN §10) |
| Pull to refresh, taps, links | `pullToRefresh`; `haptic()` / `tick()`; `PRESS_DELAY` / `pressSelector`; links out: `openLink` (Pass 連結) |
| Offline | `onlineOnly` (live apps: Securities, Transit, Sports), `keepOffline` (the rest open on what they kept), `netState` / `netVerdict` |
| Picks for you | `rank` + `feedback.mjs` (`lifter`, `shown`, `picked`, `did`, `keep`); measured: `tools/picks-backtest.mjs` |
| Language | `W`, `makeT`, `place` (lang.mjs): every page in one language |
| Notices | `schedulePush([{ at, title, body, tag, hash, kind, check }])` (tap: `hash`), `NOTICE_KINDS`, `notifyOn`, `enablePush` |
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

`worker.js` routes (`route()`, heavy ones in the Runner); each route's work in its own file;
`http.js` is what every route answers with (who may call, CORS, JSON;
`lineAnswer`: lines gzipped, each flushed). Every answer carries `Server-Timing:
w;dur=` (the Worker's time), noted by the 除錯紀錄 when slow.

| Route | File | What |
| --- | --- | --- |
| `/eco` | `eco.js`, `eco-admin.js`, `money.js`, `passkey.js`, `webauthn.js`, `orbit-token.js` | The Pass (§6); `op: 'admin'` is the owner's panel |
| `/stock` | `stock-fill.js`, `stock-check.js` | Securities' fills at the proxy's own quote; the account replayed on each save |
| `/push/…` | `push.js` | Subscriptions, scheduled notices, checks (an ESPN final, a Yahoo price, weather, a bus) |
| `/weather…` | `weather.js`, `weather-skill.js`, `weather-stations.js`, `weather-radar.js`, `typhoon.js` | The blend for a ~1 km cell (Google, CWA, MOENV, stations) scored hourly (`/weather/skill`); `radar`: 2 hours' rain (radar); in a typhoon, `dayOff`: each county's 停班停課 or a fitted chance |
| `/transit/…` | `transit.js`, `transit-free.js` | TDX (allowlist `TDX_RULES`; `tdxTrim`; YouBike, buses (but 金門, 馬祖; 高雄's: phones), 台鐵's day, fares, notices, boards, metros live: own sites; 高鐵's day, metros: `rail/`; slow lists: `tdx/`; `tdxf:*`), bus places (`gps`), map config, search, place, route (TDX's if `TDX_MAAS`), walk, book (高鐵), `gtfs` (bus build), `status` |
| `/sports-proxy` | `sports.js`, `asia-baseball.js`, `f1-live.js`, `f1-people.js`, `fund-nav.js`, `taifex.js` | The data proxy (§4.1): sports, quotes, F1, Asian baseball, SITCA's fund NAVs, TAIFEX |
| `/sports-today` | `sports-today.js`, `kit/sports-espn.mjs` | Orbit Sports' day of scoreboards in one answer, built on demand (§4.1) |
| `/gemini`, `/nl-edit` | `worker.js` | Orbit Class's photo import and plain-language edits (fixed prompts) |
| `/ai` | `ai.js`, `ai-features.js`, `law-ai.js`, `ai-util.js`, `ai-fixtures.js` | Every app's AI by name: fixed prompt, models in turn, lean input (`maxIn`), caps, asks back (`clarify`, `pick`); builders' `aiOnce`; ops `ai-try` (`site/ai-try/`) |
| `/ai/build` | `ai.js` | A repo's build runs its `build:` features (Law's key) on the day's cap |
| `/law-ask` | `law.js`, `law-ruling.js`, `law-town.js`, `law-ground.js` | Law's questions on 1–8 articles, every point cited and checked, kept in KV; modes `bill`, `diff`, `ruling`, `town`; 40 Gemini calls a day a Pass, 300 in all with `/law-chat`'s (D1 `law_day`) |
| `/law-chat` | `law-chat.js`, `ai-other.js` | 問法律: a plan (Flash-Lite), up to 14 articles from Law's lists and index, answered from those only by Sonnet (failing: Gemini), cites checked; grounded by `law-ground.js`, `law-more.js`, `law-local.js` (councils); 16 turns back; 30 a day a Pass |
| `/law-page` | `law-page.js`, `law-hosts.js` | A gov.tw / edu.tw page read in Law, cleaned; edge cache only; Taiwan-only via the relay (build key: any gov.tw; `file=1`: raw); 500 a day a Pass |
| `/law-live` | `law-live.js` | 立法院's IVOD streams now, 60 s at the edge (last good read 30 min); ours only |
| `/class-news` | `class-news.js` | Class's 學校公告: a school's list read via the relay, new titles worded once; R2, an hour |
| `/money-read` | `money-read.js` | Money's 拍照記帳: a picture → `{ buys, left }`, read by Gemini, checked; on a tap; 30 a day a Pass, 300 in all |
| `/cal` | `cal.js` | Class's 加到行事曆: its phone's calendar, served (KV `cal:*`) |
| `/flight` | `flight.js`, `kit/flight.mjs` | Class's 專注飛行: real planes landing in about N minutes |
| `/gift` | `gift.js` | 公開領取 at `/key/` (`site/key/`), set in admin; one a device (D1 `gift_claim`), `op: 'go'` a `#qh=` into an app; unreplaced back after `hold` hours |
| `/showcase/pass` | `showcase.js` | The showcase's short pass for its live demos: reads only, capped per address and day |
| `/data/…` | `data.js` | R2, public reads (§5.5); `/data/build` (POST, Bearer `DATA_PUSH_SECRET`, `build.yml`) runs a builder now |
| `/sources` | `sources.js` | Phones' beacons of their outside reads (the proxy's: `fetch` wrapped) |
| `/config` | `worker.js`, `kit/devconfig.mjs` | The live speeds (`DEV`), a minute in Cloudflare's cache |
| `/guard` | `worker.js` | The guard as it last read the bill (no key) |
| `/store/check` | `worker.js`, `doc-store.js` | Each collection's count, localhost only |
| `/ops` | `ops.js`, `worker.js`, `ai-other.js` | Checks (Bearer `DATA_PUSH_SECRET`): `?check=gemini`, `gemini-use`, `law-chat`, `ai-models`, `ai-compare`, `system`, `capacity`, `cpu`, `sources` |

- **The gate:** every route needs a Pass session (`qt=`), counted per
  session and app in memory (600 a minute on the data proxy). Public routes
  (`/sports-today`, `/law-live`) answer our pages' origins only.
- **The door** (`door.js`, DO `Door`): asked only as `/eco` hands out a
  session. Past the most at once (admin 入場) or `pace.newcomers === false`:
  503 `ORBIT_FULL`, a place in line (kit `waitInLine`); busy/full slow
  `/config` 2×/3×. Priority passes (`sec.priority`, token `p: 1`) skip
  every per-session limit (`limitOf`).
- **Same origin:** a page calls `orbit.jaypengx.com/api/…` (`kit/domain.mjs`
  `API`; worker.js `viaSite` takes `/api` off). `api.`, workers.dev answer too.
- **Dev doors:** a request with `Origin: http://localhost:<port>` and no
  pass gets a dev session on `/sports-proxy`, `/transit`, `/weather` and
  `/flight` (per address; Google's as `dev:<sku>`, half a free month at most;
  TDX's copies 10 minutes old, `devTdxDay`): `tools/preview.mjs --live`,
  or curl with that Origin.

- **Crons:** even minutes (notices, builders, weather scoring and radar,
  capacity, the meter's copy), F1's laps on both, run by Runner alarms.
  Never new Cron Triggers: ones made since 10-2026 never ran.
- **The proxy is the only one adding money:** `eco.js appEntries` takes only
  spending from apps, dated by the Worker; Securities' cash and cost are the
  Worker's (`stock-check.js`).

### 4.1 The data proxy (`/sports-proxy`)

`?url=<encoded>&app=<kit id>&qt=` passes an upstream through if its host is
on `SPORTS_PROXY_ALLOWED_HOSTS`. Two hosts are not real: `asia-baseball.orbit`
(the CPBL's months, from TheSportsDB) and `f1-live.orbit` (F1's live timing:
`now.json`, `session.json`, `laps.json`, `circuit.json`; `/about.json` and
`/face.json` for drivers the F1 sites don't know, `f1-people.js`; the DO
`F1Log` logs laps). A finished session is F1's archive's, else rebuilt from
OpenF1's tables (`openF1Raw`), kept in R2.

- **Trims** (`&trim=`) return only what an app reads (ESPN, Polymarket, Jolpica, FotMob, ELTA, YouTube, F1).
- **Batches** (`?batch=1&u=…&lines=1`): up to 24 reads, each written when
  ready; a slow one answers 504 and is asked alone.
- **Edge cache tiers** (`sports.js` `CACHE_*`, their times there): past
  `fresh` (as long again) served while read again behind
  (SWR); inside `stale`, read now, the old copy answering
  past 2 s or failing; live, odds, quotes, F1 live never stale.
  `X-Sports-Proxy-Cache`: `HIT`, `STALE`, `MISS`, `KEPT`.
- **Kept on demand:** what's over for good (an ESPN game, day or month all
  over; an Asian month; an F1 session, laps, a track's map; past results) is
  kept in R2 the first time it's read (`settleable`, `readKept`) and wiped
  with its season (`builders/kept.js`).
- **A day in one answer** (`GET /sports-today?day=YYYY-MM-DD`,
  `sports-today.js`): Sports' first screen, built on demand from ESPN's
  pages (`readThrough`, the kit's `sports-espn.mjs`), 60 s at the edge
  (10 s with a league missed); from pace 2, 503 `{error: 'paced'}`.

### 4.2 The other Workers

| Worker | File, toml | What |
| --- | --- | --- |
| `quota-guard` | `guard-worker.js`, `guard.js`, `wrangler.guard.toml` | The bill's guard (§9); DO `GuardClock` (5-minute alarm), KV state; for the panel `/errors`, `/hours` (7 days), `/cpu` |
| `gemini-relay` | `gemini-relay.js`, `wrangler.gemini.toml` | AI calls and Taiwan-only pages from Taiwan (`gcp:asia-east1`) |
| `orbit-site` | `site.js`, `site-closed.js`, `wrangler.site.toml` | The custom domains; Longshot's closed notice |
| `orbit-<slug>`, `orbit-pass`, `orbit-home` | `deploy/cf-site.mjs` | Each repo's static site, an assets-only Worker on routes of its paths (§10) |

## 5. Data and sync

### 5.1 A read, layer by layer

A read (`kit proxyJson`) goes down these until one answers:

1. memory (500 keys; an address within its `ttl`, or on its way);
2. the device's Cache Storage (`orbit-data-v1`, kept 4 days), within its `ttl`;
3. the failure hold (a source that just failed: 15 s, after a 429 or 401
   a minute, for the whole page);
4. the family's data in R2 (`/data/`, `packJson`): seasons, game days,
   watch links, win probability, photos, bus packs, shapes;
5. the proxy's edge cache, by tier (§4.1);
6. reads kept on demand in R2 (what's over for good, from its first read);
7. the upstream.

- A copy past its `ttl` is read again, the old one answering only if that
  fails; to paint at once, an app asks `peekJson(url)` (the last copy of
  any age) and draws the fresh one when it lands.
- Reads within a few ms go to the proxy as one batch.
- A failed read is a failure, never "nothing there": the device's copy of
  any age answers, asked again soon; a failed batch item fails alone.
- The phone reads some sources itself, no Worker request: ESPN's core
  API always (it refuses the proxy); ESPN's site API, MLB, Polymarket's
  lines, OpenF1, Open-Meteo, ELTA's list untrimmed (`DEVICE_FIRST`;
  failing, the proxy, 10 minutes); Jolpica when the proxy can't (`SELF_TOO`).
- Apps put live knowledge over slower copies (Sports' `liveTable`, F1's
  timing, MLB's postseason).

### 5.2 Where data lives

| Store | Binding | What's in it |
| --- | --- | --- |
| D1 `orbit-store` | `STORE` | `docs(coll, id, payload, updated)`: every wallet, each app's data, the inbox, passkeys, the config (`doc-store.js`); `history`: every version a write replaced (§5.3); `gemini_call`: every Gemini call (`gemini-use.js`); `law_day`: the AI caps' counts a day; `gift`, `gift_claim`: the giveaway (`gift.js`); `beats`: each job's last run and failures (`ops.js`); `meter`: Google's and TDX's counts a month (`transit.js`); `push_kv`: notices' devices and lists (`push.js`); `sources`: outside calls by hour (`sources.js`) |
| R2 `orbit-data` | `DATA` | Public: the builders' packs (`sports/`, `winprob/`, photos, `bus/`, `shape/`, `station/`, `rail/`, `tdx/`, `where.json`), the proxy's kept reads (`mirror/`), the radar's (`weather/`), schools' news (`class-news/`). Never served: `private/` (nightly backups `private/store/`, Firestore's last copy) |
| KV | `RATE_LIMIT_KV` | Counters (sign-ins, per-address limits); the guard's state, pace and alerts (`guard:*`); Google Weather's cells and calls a day (`weather:g:*`, `weather:google:<day>`); TDX's last reads (`tdx:warm:*`); the meter's copy (`transit:use:<month>`); Law's kept plans and answers (`law:*`); the showcase's passes a day (`showcase:passes:*`); the door's state (`door:state`); `ops:data-folders` |
| Durable Objects | `F1_LOG`, `DOOR`, `RUNNER`, `CLOCK` | `F1Log`: F1's laps; `Door`: seats and the line; `Runner` (`runner.js`): heavy routes, crons by alarm, relays past 40 outside calls; `GuardClock`: the guard's alarm |
| Edge cache | (Cache API) | The data proxy's answers by tier (§4.1), `/sports-today`, TDX's reads and routes (`transit.js`), the weather blend's cells (`weather.js`), `/law-live`, `/law-page`, `/config` |
| Services | `GEMINI_RELAY`, `LAW_SITE`, `GUARD` | The relay; Orbit Law's site (its data, read by the proxy); the guard's `/errors` |

D1 and R2 are bound at deploy (`deploy.yml` adds them to `wrangler.toml`).
A new Cloudflare product goes into `guard.js` `PLAN` with it.

### 5.3 The Pass and each app's data (sync)

- **Session:** `orbitSession(app)` signs in, makes this app live, and
  gives `q.read({ data, inbox })`,
  `q.write({ payload, wallet })` (only while live), `q.claim()`, events
  (`wallet`, `active`, `claim`, `signedout`), and a heartbeat every 2 minutes.
  One app live in one place: another device's (Worker) or tab's (`orbit-live`)
  copy is `quiet()` (no Worker reads but `/eco`, no `everyDev`, 在這裡繼續).
- **The wallet** (`eco-wallets`) is merged by the Worker (`mergeWallet`):
  `entries` (fixed ids: sent twice counts once), `snap` (each app's
  figures, newest wins), `settings` (newest wins per key), `apps`, `inbox`,
  `live`, `sec`.
- **Each app's data** is one document in its own collection (§2), under the
  account's id, written only if it's still the version read (`updated`, a
  precondition; a lost race throws). `passSync` (§3.2) merges the Pass's
  copy before any write, never over a copy it couldn't read; the rest write
  through the session.
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

R2 bucket `orbit-data`, served at `/data/<path>`. Builders run from
`builders/run.js` on the even-minute cron, as often as their data changes,
writing a file only when it changed (`builders/store.js`):

| Builder | Writes | When (UTC) |
| --- | --- | --- |
| `sports.js`, `season.js`, `within.js` | `sports/<league>/<year>.json`, `days.json`, `bounds.json` | daily 16:00 |
| `watch.js` | `sports/watch.json`, the season archive | hourly / daily 20:00 |
| `winprob.js` | `winprob/…` | daily 23:00 |
| `photos.js`, `official-photos.js` | photo lists, cutouts, official headshots | hourly / daily 18:00 |
| `gtfs.js`, `buses.js`, `ntpc.js` (GitHub `buses.yml`, `tools/gtfs-buses.mjs`) | `bus/…`, `shape/…`, `station/…`, `where.json`, `rail/…`, `tdx/…` | weekly (`kickBuses`) |
| `asia.js`, `cpbl.js` | CPBL's month and standings | daily 15:00 |
| `f1kept.js` | each finished F1 session's 數據 and laps, kept early (via the proxy) | :06, :26, :46 |
| `kept.js` | wipes kept copies (`mirror/`) before a league's first askable day | daily 17:00 |
| `news.js`, `news-words.js`, `news-laws.js` | `news/index.json` (3 days), `past.json` (weeks): stories by weight, topic, side; `laws.json`: laws named | every 10 min |
| `ai.js`, `recaps.js`, `f1story.js`; `filings.js` | AI made once: `news/lines.json`, `sides.json`, `words/cards/<a…z>.json`, `sports/recaps/<day>.json`, `sports/f1/stories/`; 重大訊息 as rows: `stock/filings/` | :04 :24 :34 :54 |

A season is kept until the next one's first game. `private/` is never served.

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
  `#qh=`, sign out everywhere, rotate, merge (`eco-inbox`), share keys (`eco-shares`), admin.

## 7. The economy

The numbers live in `eco.js` and the kit's `orbit.mjs` (the same tables in
both; RULEBOOK §4): NT$200,000 to open, NT$10,000 every Monday, 急難紓困
(`kit/pay.mjs`), 財富等級 rewards, 1% a month overdraft, no personal loan.
Money is shown and written only in Securities (資金), never on the Pass sheet; `eco:` ids are the Worker's alone.
Broker rules (`stock-access.mjs`, `-credit`): Securities' MAP.md.

## 8. Notices (`/push`)

Apps hand the Worker coming notices (`schedulePush`); it sends them by
Web Push and can check first (an ESPN final, a price, weather, a bus). One device per person per app; each kind in `NOTICE_KINDS` can be off; one due in class waits for the break (`classHold`).

## 9. Speeds, capacity and the bill

- **Live speeds** are the owner's (`kit/brand.mjs DEV`, set in the admin
  panel, served by `/config`): `sportsList`, `sportsGame`, `f1*`,
  `playLive`, `tdx*`, `transit*`. `autoScale` slows them together as the
  family grows (`capacity.js`).
- **AI**: caps a day (`DEV ai*`, D1 `law_day`, 0 pauses); a row a call in `gemini_call` (tokens, ms); admin AI 錢包: balances typed less calls since (`moneyLeft`)
- **Outside sources** (admin 外部來源): real calls, a D1 upsert an isolate per 5 min; beats, R2 ages, Law's `data/status.json`.
- **Errors**: each route's 5xx tallied (`err:<route>:<day>`), the guard's
  `/errors`; 部署 runs workflows (`GH_ACTIONS_TOKEN`).
- **容量** (`capacity.js` `quotas`): people each quota holds (this week's × room ÷ people's use; under `FEW`: `TYPICAL_DAY`); people's share: what pages called (`pageShare`).
- **`quota-guard`** (`guard.js`, every 5 minutes) reads the use against
  `PLAN`, paces on real use only (`paceFor`: past 60/75/85% at a rate
  reaching the stop; 85% `newcomers: false`; `pace.js`), a forecast only
  warns (`forecastOf`), mails at 50/75/90% (`ops.js`); 90%: the proxy off. Google: Maps stops at 90% of each SKU's free
  month, Weather under 8,500 a month (`googleDayCap`).
- **TDX** (`transit.js`): `tdxPlan` (free from 12-01: 3 points a month);
  `tdxGuard`: people's share a day, kept longer as it's spent, copies only
  past 95%; the bus build's: `buildTdxRoom`.

## 10. Deploying, secrets and the domain

- `main` deploys:
  - `deploy.yml`: the proxy and `gemini-relay` (and `orbit-site`);
  - `deploy-guard.yml`: the guard, when its files change;
  - `pages.yml`: the kit and `site/`, to Cloudflare (tests first);
  - `news-site.yml`: News's site (this repo's token), started by `newsSite`;
  - every app repo's deploy workflow: its own site, to Cloudflare.
- By hand: `build.yml` (a builder now, a check), `tail.yml` (logs),
  `audit.yml` (secret names, the store counted), `zone-speed.yml` (the zone's
  speed settings).
- Never a cancelling `concurrency:` (a cancel mails Jay): copy the `queue`
  job; builds check out main's tip.
- **Only what must stay secret is a secret** (the rest: code, tomls).
  - GitHub: `CLOUDFLARE_API_TOKEN`, `CF_GUARD_TOKEN`, `DATA_PUSH_SECRET`,
    `ECO_TOKEN_SECRET`, `ECO_ADMIN_TOKEN`.
  - The proxy: Google's keys, `CWA_KEY`, `MOENV_KEY`, `TDX_CLIENT_*`.
- **The domain:** `kit/domain.mjs` `DOMAIN` (jaypengx.com), the one place
  it is set. Each repo publishes its built site with `deploy/cf-site.mjs`
  (§4.2): `orbit.<DOMAIN>/<slug>/` every app (`slug`,
  `SHORT` in `kit/brand.mjs`; one origin, so one Pass sign-in), `orbit-pass`
  for `/`, `/pass/`, `/key/`, `/Orbit-Core/` and the old `/Shared-Proxy/`,
  `orbit-home` for `<DOMAIN>/`, `/showcase/` (Orbit-Showcase).
  Mail is refused. `deploy.yml`
  attaches the hostnames (its token needs the zone and D1 Edit); the guard
  takes them off with the proxy.

## 11. Tools and tests

| Tool | What |
| --- | --- |
| `node tools/kit-find.mjs <word…>` | The kit's exports and CSS classes matching: look before writing |
| `node tools/shots.mjs <app> [page…]` | Every screenshot a change needs (light/dark, live data, signed in), a contact sheet, faults, `--before main`; pages in `tools/shots/pages.mjs` |
| `node tools/layout-check.mjs <app…>` | Every tab and `check` page at 320, iPad, laptop: a narrow band, a half empty, overflow (`layout-faults.mjs`); `push.sh` runs it |
| `node tools/preview.mjs <app>` | The app with real data (`--live`, `--width`, `--timing`, `--webkit`…; `ORBIT_DATA=<dir>`: local /data/ files); prints `wraps:`, `cut:` |
| `node tools/gate.mjs [app…]` | The quality gate (`gate-page.js`) on every tab: lift, stalls, dead taps, wraps, cuts, white, mixed language… |
| `node tools/speed.mjs <app…>` | Before vs after (3G, CPU ×4, replayed) |
| `node tools/live-scroll.mjs [app…] [--webkit]` | Nothing jumps: live refreshes, loading, scrolling, folding |
| `node tools/test-apps.mjs [app…]` | Every app's tests against this kit |

`npm test` covers the Workers, kit and this map.

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
