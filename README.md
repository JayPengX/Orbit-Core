# Shared-Proxy

The server side, the shared kit and the brand of every Orbit
app. The apps are static sites on GitHub Pages; everything server-side is
here, on Cloudflare.

Rules for working on any of it: `docs/TRUTH.md` (one page).

| App | Kit id | Repo |
| --- | --- | --- |
| Orbit Securities | `stock` | Orbit-Securities |
| Orbit Class | `orbit` | Orbit-Class |
| Orbit Weather | `weather` | Orbit-Weather |
| Orbit Transit | `transit` | Orbit-Transit |
| Orbit Sports | `match` | Orbit-Sports |
| Orbit Words | `vocab` | Orbit-Words |
| Orbit Beats | `beats` | Orbit-Beats |
| Orbit Law | `law` | Orbit-Law |
| Orbit Money | `money` | Orbit-Money |

Each lives at `https://jaypengx.github.io/<Repo>/` (and on the family's own
domain once set, §9). The kit, the family's page and the admin page are
this repo's Pages.

## 1. The system

```
phones (home-screen apps)  ──  each app's static files + the kit (#kit/…, from this repo's Pages)
   │  memory → Cache Storage → localStorage (versioned keys)
   ▼
orbit-workers-proxy (one Worker, Taiwan)
   /eco      the Orbit Pass: accounts, wallet, app data (D1)
   /stock    Securities' orders filled at the proxy's quote
   /push     notices while an app is closed (KV + cron)
   /weather  Google + CWA + MOENV blended (KV cells)
   /transit  TDX, Google Maps/Places/Routes
   /sports-proxy  ESPN, MLB, Jolpica, Polymarket, Kambi, Yahoo, ELTA, YouTube, F1 timing, Asian leagues
   /gemini, /nl-edit, /law-ask, /law-chat, /law-gist  Gemini via gemini-relay
   /data     the family's data in R2, built by builders/ on the cron
   /config   the owner's live speeds
quota-guard  reads the bill every 5 minutes; paces, then stops the proxy at 90% of the $5 plan
```

## 2. Data layers

A read (`kit proxyJson`) goes down these until one answers:

1. memory;
2. the device's Cache Storage (younger than its `ttl`: used as is);
3. the failure hold (a source that just failed isn't asked by every part
   of the page);
4. the family's data in R2 (`/data/`, `packJson`): seasons, game days,
   watch links, win probability, photos, bus packs, shapes;
5. the proxy's edge cache in Taiwan, by tier;
6. reads kept on demand in R2: what's over for good, kept the first time
   anyone reads it;
7. the upstream.

On top of these, apps put live knowledge over slower copies: Sports'
`liveTable` counts results before ESPN does; F1's own timing calls a
session over at the flag; MLB's postseason comes from MLB itself.

A failed read is a failure, never "nothing there". It answers the device's
copy of any age and is asked again soon. A batch item that fails is that
item's failure alone.

## 3. The proxy (`orbit-workers-proxy`)

`worker.js` routes; each route's work is in its own file. No placement: it
runs near each caller; only Gemini goes through `gemini-relay.js`, pinned to Taiwan.

| Route | File | What |
| --- | --- | --- |
| `/eco` | `eco.js`, `eco-admin.js`, `money.js` | The Pass (§4); `op: 'admin'` is the owner's panel |
| `/stock` | `stock-fill.js`, `stock-check.js` | Securities' fills; replaying the account on each save |
| `/push/…` | `push.js` | Subscriptions, scheduled notices, checks (an ESPN final, a Yahoo price, weather, a bus) |
| `/weather…` | `weather.js`, `weather-skill.js`, `typhoon.js` | The blend for a ~1 km cell, the township, scoring sources hourly; while CWA has a typhoon warning out (NCDR's open CAP feed, every 5 minutes), `dayOff`: one answer per county, worked out for all 22 every 3 minutes and shared by every place in it: the county's 停班停課 from 人事行政總處's page (through `gemini-relay`, every 3 minutes), else a chance fitted to the counties' real decisions (68 storms, 2019–2026) at the county seat: the storm circle's edge from CWA's 5-day track (`W-C0034-005`), the storm's strength, the 強風 lamps' gust, the day's rain (MET Norway at the seats, else Open-Meteo, every 30 minutes, floored by CWA's rain warnings) and the neighbours' announcements |
| `/transit/…` | `transit.js` | TDX (allowlist `TDX_RULES`), map config, search, place, route; `/transit/status?sample=` (a session or the dev door only) |
| `/sports-proxy` | `sports.js`, `asia-baseball.js`, `f1-live.js`, `fund-nav.js`, `taifex.js` | The data proxy (§3.1) |
| `/sports-today` | `sports-today.js`, `kit/sports-espn.mjs` | Orbit Sports' day of scoreboards in one answer, built on demand (§3.1) |
| `/gemini`, `/nl-edit` | `worker.js` | Orbit Class's photo import and plain-language edits (fixed prompts) |
| `/law-ask` | `law.js` | Orbit Law's questions on 1-8 articles of a law: the text read from Orbit Law's data, every point cited and checked; answers kept in KV by the law's version; `mode: 'bill'` a bill explained from its 對照表 (立法院's API), each change citing a row's article, kept 30 days; `mode: 'diff'` an amendment explained from Orbit Law's `diff/<p>.json`, kept 180 days by version; a Pass of Orbit Law's, 40 Gemini calls a day a Pass and 300 in all with `/law-chat`'s (D1) |
| `/law-chat` | `law-chat.js` | Orbit Law's 問法律: a plan, the articles found in Orbit Law's lists and full-text index (14 at most), an answer from those only, every point's cites checked; a Pass of Orbit Law's, 30 turns a day a Pass; first questions kept in KV 30 days. Both `/law-chat` and `/law-ask` (with a question) are grounded by `law-ground.js`: Orbit Law's `ai/facts.json` (official figures such as 最低工資), `ai/news.json` (agencies' notices, top 3), `bills/items.json` (立法院 stages, up to 5) and `ly/budget.json` (budget progress on a 預算 question: the year asked, else the 2 newest), each read hourly and left out when missing; the answer adds `notices` and `bills` |
| `/law-page` | `law-page.js` | GET `?u=` a government page (gov.tw and its subdomains, www.edu.tw; https; redirects only on those) read inside Orbit Law: `{url, type:'html', html}` in its own charset (Big5 too), scripts/styles/handlers taken out, 2 MB at most, or `{url, type:'pdf'|'file', size}`; Cloudflare's cache only (judicial rulings 30 days, else a day); a Pass of Orbit Law's, 500 fresh reads a day |
| `/law-gist` | `law-gist.js` | Orbit Law's card summaries, the same for everyone: a line and who it affects for up to 10 bills a call (one Gemini call a batch, kept 60 days), a law's gist and 5 cited points (kept 180 days by version); a Pass of Orbit Law's, not counted per Pass: 200 new gists a day in all |
| `/money-mail` | `money-mail.js` | Orbit Money's mail-in 載具 invoices: GET `?op=box` the Pass's own address (`<box>@MAIL_DOMAIN`, made on first ask; `''` while `MAIL_DOMAIN` is unset), the invoices waiting and Gmail's forwarding code; POST `?op=took {upto}` drops the ones now in the books; POST `?op=new` a new address. The Worker's `email` handler (Email Routing's catch-all on `MAIL_DOMAIN`) reads each mail's CSV (`kit/carrier-csv.mjs`, 財政部's export) for the box's Pass and turns away addresses nobody owns; a Pass of Orbit Money's, 20 asks a minute |
| `/data/…` | `data.js` | R2, public reads |
| `/config` | `worker.js` | The live speeds |

- **The gate:** every route needs a Pass session (`qt=`), counted per
  session and app in memory (600 a minute on the data proxy).
- **Dev doors:** a request with `Origin: http://localhost:<port>` and no
  pass gets a dev session on `/sports-proxy`, `/transit` and `/weather`
  (counted per address). `tools/preview.mjs --live` uses them.

  ```bash
  curl -H 'Origin: http://localhost:8123' 'https://orbit-workers-proxy.pengzjay.workers.dev/sports-proxy?url=<encoded>&app=match'
  ```

- **Crons:** even minutes (notices, builders at :16 and on, weather
  scoring, capacity); F1's laps on both. Add work
  to these, not new Cron Triggers.
- **The proxy is the only one adding money:**
  - `eco.js appEntries` takes only spending from apps, dated by the Worker.
  - Securities' cash and cost are the Worker's (`stock-check.js`).

### 3.1 The data proxy (`/sports-proxy`)

`?url=<encoded>&app=<kit id>&qt=` passes an upstream through if its host is
on `SPORTS_PROXY_ALLOWED_HOSTS`. Two hosts are not real:
`asia-baseball.orbit` (NPB, KBO, CPBL from their own sites) and
`f1-live.orbit` (F1's live timing: `now.json`, `session.json`,
`laps.json`, `circuit.json`; a Durable Object `F1Log` logs laps). A
finished session is F1's archive's, else (shut to everyone since
2026-10-25) rebuilt from OpenF1's tables (`openF1Raw`), and kept in R2 for
good once read: OpenF1 shuts while any session runs.

- **Trims** (`&trim=`) return only what an app reads (Polymarket, Kambi,
  ESPN's heavy pages, Jolpica, FotMob, ELTA, YouTube, formula1.com).
- **Batches** (`?batch=1&u=…&lines=1`): up to 24 reads in one request,
  each written as it's ready. A slow item answers 504 and is asked alone.
- **Edge cache tiers:** live 2 s, final 24 h, odds 10 s, standings 30 min,
  quotes 30 s, history 30 min… (`sports.js`). `X-Sports-Proxy-Cache` says
  `HIT`, `STALE`, `MISS` or `KEPT`.
- **Kept on demand:** what's over for good is kept in R2 the first time
  it's read (`settleable`, `readKept`): an ESPN game, or day or month all
  over; an Asian month; an F1 session's 數據 and laps, a track's map; a
  race's Jolpica results 3 days on, a past F1 season's; a past MLB day all
  over. Each goes with its season (`builders/kept.js`, nightly).
- **A day in one answer** (`GET /sports-today?day=YYYY-MM-DD`, a Taiwan day,
  `sports-today.js`): Orbit Sports' first screen, `{v, day, built, covered,
  missed, events}`. Built when someone asks (no cron: nothing runs while
  nobody opens the app) from the ESPN pages the phone reads, through the data
  proxy's own read (`readThrough`: its cache and kept copies), and parsed by
  the kit's `sports-espn.mjs` (one parser for the proxy and the phone). Kept
  at the edge 60 s for today and tomorrow, 2 min for yesterday, an hour for
  older days, 10 s when a league was missed; one build a day at a time in an
  isolate. No Pass (public scores): our pages' or a local origin only. From
  pace 2 it answers 503 `{error: 'paced'}` and the phone reads as before.

### 3.2 The family's data (`data.js`, `builders/`)

R2 bucket `orbit-data`, served at `/data/<path>`. The builders run from
`builders/run.js` on the even-minute cron, each only as often as its data
changes, writing a file only when it changed (`builders/store.js`):

| Builder | Writes | When (UTC) |
| --- | --- | --- |
| `sports.js` | `sports/<league>/<year>.json`, `days.json`, `bounds.json` | daily 16:00 |
| `watch.js` | `sports/watch.json` (hourly), the season archive (daily 20:00); football's short cut looked for again (2, 4, 8… h) until the extended one is up | hourly / daily |
| `winprob.js` | `winprob/…` | daily 23:00 |
| `photos.js` | photo lists, cutouts | hourly / daily 18:00 |
| `buses.js` | `bus/…`, `shape/…`, `where.json` | a city once a week |
| `asia.js`, `cpbl.js` | CPBL's month and standings | daily 15:00 |
| `f1kept.js` | each finished F1 session's 數據 and every lap kept before anyone opens them (two hours after a practice or qualifying starts, three after a race; a session each half minute for 12 minutes a run, through the proxy: OpenF1 shuts while sessions run and turns quick askers away) | :06, :26, :46 |
| `kept.js` | wipes the proxy's kept copies (`mirror/`) from before a league's first askable day | daily 17:00 |

A season is kept whole until the next season's first game (preseason
included), then wiped whole. `private/` is never served.

## 4. The Orbit Pass (`/eco`)

- **A pass** is a random 10-character code, stored only as its SHA-256.
  Passes are issued by the owner (admin page or `tools/issue-passes.mjs`);
  there's no sign-up.
- **Devices never keep the pass:** a refresh token (60 days) and a short
  session token (`orbit-token.js`, HMAC under `ECO_TOKEN_SECRET`).
- **One app at a time:** the last to claim is live; others get
  `409 ECO_SESSION_MOVED`.
- **The store (D1):** the wallet (`entries` with fixed ids, `snap` per
  app, `settings`, `apps`, `inbox`, `live`, `sec`), merged by the Worker
  under a version check (`doc-store.js`). Each app's data is in its own
  collection under the same id.
- **Nothing lost:** a save is refused if it would turn JSON data into
  anything else, or (`base`, pass-sync.mjs) if it was merged over an older
  copy. Every version a write or delete replaces in the wallets, the apps'
  data, the inbox, the config and Securities' books is kept in D1's
  `history` (at most hourly while saved again and again; always before a
  wipe, a delete, a restore or a save from a device that never saw it):
  whole for 2 days, then daily for 30. Each night (04:30) the whole store
  also goes to R2 (`store-backup.js`, `private/store/<day>.jsonl.gz`, 14
  nights and a year of firsts), and D1's Time Travel covers any minute of
  30 days. The admin page's 備份與復原 puts back any version or night;
  the account's devices are signed out after.
- **Ops:** login, refresh, read/patch/delete, device codes, `#qh=`
  hand-offs between apps, loans and relief, sign out everywhere, rotate, merge passes,
  Class's share keys, admin.
- **Signing out wipes the device** (`wipeDevice`).

## 5. The economy

The numbers live in `eco.js` and the kit's `orbit.mjs` (the same tables
in both).

Money is shown only in Securities (its 資金 tab: pay, 信貸, 紓困, 財富等級,
真相); the Pass sheet is the account and the family, never money.

- **Opening:** NT$200,000.
- **Pay:** NT$10,000 every Monday, Taiwan time.
- **信貸** (`kit/loan.mjs`, `op: 'loan'`): NT$100k limit growing to 22×
  monthly pay, 6–16% by record, NT$3,000 fee, 1–5 years, repaid from each
  Monday's pay. 3 late → 催收: all due, balance taken, a third of each pay;
  a year's ban after. Debt counts against worth.
- **急難紓困** (`op: 'relief'`): NT$5,000 under NT$2,000 worth, every 13
  weeks, 3 a year.
- **財富等級:** one-time rewards as worth crosses 300k to 100M.
- **Looks:** an avatar and a frame, free for everyone (the Pass's 外觀 tab).
- **Overdraft:** 1% a month.

Only Securities writes money entries, and `eco:` ids are the
Worker's alone. Nobody but the market makes an account richer for free.

## 6. Notices (`/push`)

Apps hand the Worker their coming notices (`schedulePush`). It sends them
through Web Push (RFC 8291/8292, WebCrypto) and can check first: an ESPN
final, a Yahoo price, the weather, a bus's arrival. One device per person
per app. News that happens once is told once.

## 7. Speeds, capacity and the bill

- **Live speeds** are the owner's (`kit/brand.mjs DEV`, set in the admin
  panel, served by `/config`): `sportsList`, `sportsGame`, `f1*`,
  `playLive`, `tdx*`, `transit*`. `autoScale` slows them together as the
  family grows (`capacity.js`).
- **`quota-guard`** (`guard.js`, a Durable Object alarm every 5 minutes):
  - reads the account's use from Cloudflare's analytics against `PLAN`
    (Workers, CPU, KV, DO, R2, D1);
  - projects the month and paces from 60% (`pace.js`: slower refreshes,
    builders parked, fewer reads);
  - tells the owner's phone at 50/75/90% (`ops.js`);
  - at 90% of any count, turns the proxy off until the next period.

  A new Cloudflare product goes into `PLAN` in the same change.
- **Each toml caps CPU** (`[limits]`) and samples logs.

## 8. The kit (`kit/`)

Served from this repo's Pages, never copied. Each app's page carries
`kit/loader.html`'s snippets (an import map for `#kit/…`, the stylesheet,
`boot.js`); `kit/preload.mjs` lists first-screen modules for modulepreload.
`node kit/apps.mjs` refreshes the snippets; `node kit/link.mjs` links
`<app>/.kit` for tests.

**Addresses by content.** The kit's deploy (`kit/stamp.mjs`) and every
app's (`scripts/stamp-version.mjs` → `kit/stamp-app.mjs`) minify each script
and stylesheet and give it its own content hash (`?v=<hash>`, `kit/hash.mjs`),
so a phone downloads only the files a push changed (each push re-downloaded
the whole kit or app before). The kit's `version.json` lists every file's
hash; the device notes them (`orbit.kitFiles`) and the loader asks for each
file at its hash. Built kit files import each other as `#kit/…`, through the
import map, so a file has one address whichever loader a page carries.

| Module | What |
| --- | --- |
| `orbit.mjs` | The core: the session, `proxyJson`/`packJson`, the economy tables, looks, notices, `installGate`, `watchUpdates`, `onlineOnly`, `keepOffline`, `mayLocate`, `tabBar`, `topActions`, `fitNumbers`, `rank` (recommendations), `rec` (除錯紀錄), iPhone behaviour |
| `orbit.css` | The design system (iOS 27 tokens, Liquid Glass, springs, every control) |
| `ui.mjs` | Builders: `segmented`, `sheet` (the one sheet: `detent`, `foot`, `lead`, `trailing`; the Pass is it), `menu`, `toast`, `list`/`cell`, `search`, `toggle`, `empty`, `navTitle` (large title), `pullToRefresh`, `view`, the cards and tiles (`tile`, `tag`, `rowCard`, `stats`, `section`, `logoTile`, `matchCard`, `stockRow`, `progressRing`, `monthCalendar`, `panelGrid`…), the one date selector of every app (`dayBar`/`dayStrip` + `daySwipe`, `dayStep`, `dayList`, `dayTop`/`dayNum`: a sticky strip of day chips, 📅 for any day, a swipe for the next); and HTML-string twins of some (`emptyHtml`, `tileHtml`, `statsHtml`, `stockRowHtml`…) |
| `ui.mjs` icons | `share`, `trash`, `x`, `bank`, `lock`, `exchange`, `cup`, `flag` join the set (`send`, `key`, `swap`, `spark` already existed); apps read `kitUI.icons?.x`, never import |
| `orbit.css` pieces | `.q-switch.on` (= aria-checked), `.q-sheet-foot` (sticky primary-button footer at a sheet's bottom, safe-area aware), `.q-fig` (grid of captioned bold figures with hairlines, children `small` over `b`) |
| `boot.js` | The loading screen and the version check |
| `brand.mjs` | Families, names, colours, marks, repos, `DEV` |
| `pass.mjs`, `help.mjs` | The Pass sheet (account, looks, apps, guides: no money); every app's guide |
| `pass-sync.mjs` | An app's payload kept in step with the Pass's copy (read and merged before any write; once per return, none under 10 s away, an unchanged copy not merged again); Words, Weather |
| `catalog.mjs`, `logos.mjs`, `names.mjs`, `photos.mjs` | Leagues; logos; Chinese team names; studio headshots |
| `f1live.mjs`, `postseason.mjs`, `sports-*.mjs` | F1 sessions; MLB's postseason; highlights, broadcast, win probability (also run by builders) |
| `stock-*.mjs` | Securities' pricing and ledgers, shared with the Worker |
| `holidays.mjs` | Taiwan's days off |
| `loan.mjs`, `gov.mjs` | 信貸 and relief; what the government took and gave one account |
| `devconfig.mjs`, `mirror.mjs`, `photo-urls.mjs` | `DEV` for the Workers; the nightly mirror's addresses; photos' addresses alone |
| `apps.mjs`, `link.mjs`, `preload.mjs`, `stamp.mjs`, `stamp-app.mjs`, `hash.mjs` | Build tools, never served: refresh the apps' snippets; link `.kit`; the first-screen modulepreload lists; the kit's and each app's content-hashed build |
| `sw-images.js` | Other sites' pictures in one shared cache |
| `sw.js` | The one service worker every app imports (its settings in its own `sw.js`); keeps a file only when it matches its address's hash |
| `lang.mjs`, `format.mjs` | `W`, `makeT`, `detectLang`; `money`, `pct`, `price`, `DASH`, `twDay` (Taiwan's date) |

**Securities' broker rules** follow Taiwan's real ones (`stock-credit.mjs`,
`stock-access.mjs`): a product is bought only once its account or papers are
in place (開戶與交易資格: KYC with fund RR limits, 現股當沖, 權證, 興櫃,
槓反 ETF, 期貨帳戶, 複委託, 專業投資人; the broker-approved ones open the
next trading day; selling or closing never asks; accounts from before
2026-10-24 keep what they'd traded); 結匯 US$5M a year each way; a daily
當沖額度 on what's sold first, twice net worth in NT$100,000 steps,
NT$500,000 to NT$50,000,000 (`dayTradeRoom`).

**Brand:** `node brand/generate.mjs [id…|site]` writes every app's icons,
share cards, manifest and page tags. Renamed repos (Passion-Beats) are small redirect
repos. Play and Slips left the family on 2026-10-22: they are Longshot
now, its own app and Worker (JayPengX/Longshot), nothing of theirs here.

## 9. Deploying and secrets

- `main` deploys:
  - `deploy.yml`: the proxy and `gemini-relay`;
  - `deploy-guard.yml`: the guard, only when its files change;
  - `pages.yml`: the kit and `site/`.
- By hand: `build.yml` (a builder now, or a check), `tail.yml` (crons and
  live logs), `audit.yml` (secret names).
- **Only what must stay secret is a secret.** Public settings live in code
  or the tomls.
  - GitHub: `CLOUDFLARE_API_TOKEN`, `CF_GUARD_TOKEN`, `DATA_PUSH_SECRET`,
    `ECO_TOKEN_SECRET`, `ECO_ADMIN_TOKEN`.
  - The proxy: Google's keys, `CWA_KEY`, `MOENV_KEY`, `TDX_CLIENT_*`, and
    `FIREBASE_PRIVATE_KEY` (removed 2026-12-06).
- **Bindings:** D1 `orbit-store`, R2 `orbit-data`, KV `RATE_LIMIT_KV`,
  DO `F1Log`, and the services `GEMINI_RELAY` and `GUARD`.
- **The family's own domain:** `kit/domain.mjs` `DOMAIN`, the one place it
  is set (empty: GitHub Pages and workers.dev, as ever). Set, one push puts
  every app at `https://<DOMAIN>/<Repo>/` (`site.js`, Worker `orbit-site`,
  reading GitHub Pages through, so the apps still deploy by their own
  Pages), the proxy at `api.<DOMAIN>`, and both homes in CORS; `deploy.yml`
  attaches the hostnames (`CLOUDFLARE_API_TOKEN` needs the zone: Zone Read,
  Workers Routes Edit, DNS Edit), the guard takes them off with the proxy.
  Pages on github.io move by themselves (a browser) or say where to
  (an old home-screen icon, `orbit.mjs` `moveHome`, `movedNotice`). After the switch,
  `node brand/generate.mjs` points every app's share links at the domain.

## 10. Tools and tests

| Tool | What |
| --- | --- |
| `node tools/preview.mjs <app>` | The app at phone size with real data (`--live`, `--width 375`, `--lang en`, `--click`, `--eval`, `--store`, `--webkit`, `--reopen`, `--serve`…; `tools/README.md`). Prints `wraps:`, `cut:`, `scrolls sideways:` |
| `node tools/leagues-audit.mjs` | Every catalogue league against its sources |
| `node tools/hk-lots.mjs` | Hong Kong board lots for Securities, from HKEX |
| `node tools/jp-lists.mjs` | Tokyo's TOPIX500 and ETF trading units for Securities, from JPX |
| `node tools/espn.mjs <path>` | The shape of an ESPN answer |
| `node tools/issue-passes.mjs` | Issue passes (the owner) |
| `node tools/accent-css.mjs` | Write each app's accent colours into `orbit.css` |

`npm test` covers the Pass, money, push, the data proxy, F1, Asian
baseball, Kambi, transit, weather, the builders, the guard and pacing, and
the kit.

## 11. If you change…

| This | Also check |
| --- | --- |
| A league (`kit/catalog.mjs`) | Sports' `leagues.mjs`/`broadcast.mjs`, `builders/`, `tools/leagues-audit.mjs` |
| `proxyJson`, `packJson` | Every app's first paint; `sports.js`, `data.js` |
| A trim | Every parser that reads it, and the builders |
| A Cloudflare product or cron | `guard.js` `PLAN` |
| `f1-live.js` | Sports' F1 board |
| `fund-nav.js` | Securities' 境內基金 NAVs (SITCA) |
| `invoice.js` (`invoice.orbit`), `kit/carrier-csv.mjs`, `money-mail.js` | Orbit Money's 發票 tab: 對獎, seller names, the 載具 file and its mail-in |
| `taifex.js` | Securities' 期貨 and 選擇權: TAIFEX settlements (TX/MTX/TMF, TXO), margins, finals |
| `eco.js` money rules | The kit's tables, Securities' `lib/truth.mjs` and 資金 tab, `help.mjs` |
| `push.js` checks | The apps that schedule them, `NOTICE_KINDS` |
| `orbit.css` or the frame | Every app at 375 px, light and dark |
| `brand.mjs` | `node brand/generate.mjs` |
