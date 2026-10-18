# Shared-Proxy

The server side, the shared kit and the brand of every Quadra and Orbit
app. The apps are static sites on GitHub Pages; everything server-side is
here, on Cloudflare.

Rules for working on any of it: `docs/TRUTH.md` (one page).

| App | Kit id | Repo |
| --- | --- | --- |
| Quadra Securities | `stock` | Quadra-Securities |
| Quadra Play | `odds` | Quadra-Play |
| Orbit Class | `orbit` | Orbit-Class |
| Orbit Weather | `weather` | Orbit-Weather |
| Orbit Transit | `transit` | Orbit-Transit |
| Orbit Sports | `match` | Orbit-Sports |
| Orbit Words | `vocab` | Orbit-Words |
| Orbit Beats | `beats` | Orbit-Beats |
| Orbit Slips | `slip` | Orbit-Slips |

Each lives at `https://jaypengx.github.io/<Repo>/`. The kit, the family's
page and the admin page are this repo's Pages.

## 1. The system

```
phones (home-screen apps)  ──  each app's static files + the kit (#kit/…, from this repo's Pages)
   │  memory → Cache Storage → localStorage (versioned keys)
   ▼
orbit-workers-proxy (one Worker, Taiwan)
   /eco      the Quadra Pass: accounts, wallet, app data (D1)
   /play     Play's bets placed, settled, paid; lottery (cron)
   /stock    Securities' orders filled at the proxy's quote
   /push     notices while an app is closed (KV + cron)
   /weather  Google + CWA + MOENV blended (KV cells)
   /transit  TDX, Google Maps/Places/Routes
   /sports-proxy  ESPN, MLB, Jolpica, Polymarket, Kambi, Yahoo, ELTA, YouTube, F1 timing, Asian leagues
   /gemini, /nl-edit, /slip-scan, /law-ask, /law-chat, /law-gist  Gemini via gemini-relay
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
| `/play` | `settle.js`, `price.js`, `lotto.js` | Play's slips re-priced and placed, cashed out, settled and paid; lottery and scratch cards |
| `/stock` | `stock-fill.js`, `stock-check.js` | Securities' fills; replaying the account on each save |
| `/kambi` | `kambi.js` | Kambi matches' last live data, kept for settling |
| `/push/…` | `push.js` | Subscriptions, scheduled notices, checks (an ESPN final, a Yahoo price, weather, a bus) |
| `/weather…` | `weather.js`, `weather-skill.js` | The blend for a ~1 km cell, the township, scoring sources hourly |
| `/transit/…` | `transit.js` | TDX (allowlist `TDX_RULES`), map config, search, place, route; `/transit/status?sample=` (a session or the dev door only) |
| `/sports-proxy` | `sports.js`, `asia-baseball.js`, `f1-live.js` | The data proxy (§3.1) |
| `/gemini`, `/nl-edit` | `worker.js` | Orbit Class's photo import and plain-language edits (fixed prompts) |
| `/slip`, `/slip-scan` | `slip.js` | Orbit Slips' ticket photo read (tight caps) |
| `/law-ask` | `law.js` | Orbit Law's questions on 1-8 articles of a law: the text read from Orbit Law's data, every point cited and checked; answers kept in KV by the law's version; `mode: 'bill'` a bill explained from its 對照表 (立法院's API), each change citing a row's article, kept 30 days; `mode: 'diff'` an amendment explained from Orbit Law's `diff/<p>.json`, kept 180 days by version; a Pass of Orbit Law's, 40 Gemini calls a day a Pass and 300 in all with `/law-chat`'s (D1) |
| `/law-chat` | `law-chat.js` | Orbit Law's 問法律: a plan, the articles found in Orbit Law's lists and full-text index (14 at most), an answer from those only, every point's cites checked; a Pass of Orbit Law's, 30 turns a day a Pass; first questions kept in KV 30 days |
| `/law-gist` | `law-gist.js` | Orbit Law's card summaries, the same for everyone: a line and who it affects for up to 10 bills a call (one Gemini call a batch, kept 60 days), a law's gist and 5 cited points (kept 180 days by version); a Pass of Orbit Law's, not counted per Pass: 200 new gists a day in all |
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

- **Crons:** even minutes (notices, Kambi, builders at :16, weather
  scoring, capacity); odd minutes (Play's settling, the lottery). Add work
  to these, not new Cron Triggers.
- **The proxy is the only one adding money:**
  - `eco.js appEntries` takes only spending from apps, dated by the Worker.
  - Play's picks settle on the house's own bets.
  - Securities' cash and cost are the Worker's (`stock-check.js`).

### 3.1 The data proxy (`/sports-proxy`)

`?url=<encoded>&app=<kit id>&qt=` passes an upstream through if its host is
on `SPORTS_PROXY_ALLOWED_HOSTS`. Two hosts are not real:
`asia-baseball.quadra` (NPB, KBO, CPBL from their own sites) and
`f1-live.quadra` (F1's live timing: `now.json`, `session.json`,
`laps.json`, `circuit.json`; a Durable Object `F1Log` logs laps).

- **Trims** (`&trim=`) return only what an app reads (Polymarket, Kambi,
  ESPN's heavy pages, Jolpica, FotMob, ELTA, YouTube, formula1.com).
- **Batches** (`?batch=1&u=…&lines=1`): up to 24 reads in one request,
  each written as it's ready. A slow item answers 504 and is asked alone.
- **Edge cache tiers:** live 2 s, final 24 h, odds 10 s, standings 30 min,
  quotes 30 s, history 30 min… (`sports.js`). `X-Sports-Proxy-Cache` says
  `HIT`, `STALE`, `MISS` or `KEPT`.
- **Kept on demand:** a finished game, or a day or month all over, is kept
  in R2 the first time it's read (`settleable`, `readKept`).

### 3.2 The family's data (`data.js`, `builders/`)

R2 bucket `quadra-data`, served at `/data/<path>`. The builders run from
`builders/run.js` on the even-minute cron, each only as often as its data
changes, writing a file only when it changed (`builders/store.js`):

| Builder | Writes | When (UTC) |
| --- | --- | --- |
| `sports.js` | `sports/<league>/<year>.json`, `days.json`, `bounds.json` | daily 16:00 |
| `watch.js` | `sports/watch.json` (hourly), the season archive (daily 20:00) | hourly / daily |
| `winprob.js` | `winprob/…` | daily 23:00 |
| `photos.js` | photo lists, cutouts | hourly / daily 18:00 |
| `buses.js` | `bus/…`, `shape/…`, `where.json` | a city once a week |
| `asia.js`, `cpbl.js` | CPBL's month and standings | daily 15:00 |

A season is kept whole until the next season's first game (preseason
included), then wiped whole. `private/` is never served.

## 4. The Quadra Pass (`/eco`)

- **A pass** is a random 10-character code, stored only as its SHA-256.
  Passes are issued by the owner (admin page or `tools/issue-passes.mjs`);
  there's no sign-up.
- **Devices never keep the pass:** a refresh token (60 days) and a short
  session token (`quadra-token.js`, HMAC under `ECO_TOKEN_SECRET`).
- **One app at a time:** the last to claim is live; others get
  `409 ECO_SESSION_MOVED`.
- **The store (D1):** the wallet (`entries` with fixed ids, `snap` per
  app, `settings`, `apps`, `inbox`, `live`, `sec`), merged by the Worker
  under a version check (`doc-store.js`). Each app's data is in its own
  collection under the same id.
- **Ops:** login, refresh, read/patch/delete, device codes, `#qh=`
  hand-offs between apps, Plus, sign out everywhere, rotate, merge passes,
  Class's share keys, admin.
- **Signing out wipes the device** (`wipeDevice`).

## 5. The economy

The model is `node tools/economy.mjs`; the numbers live in `eco.js` and
the kit's `quadra.mjs` (the same tables in both).

- **Opening:** NT$30,000.
- **Pay:** NT$6,000 on the 1st of every Taiwan month.
- **財富等級:** one-time rewards as worth crosses 50k to 20M.
- **Plus:** NT$490 a month or NT$4,900 a year.
  - Play: a NT$200 weekly free bet, the boost ×1.5, cash out keeps 2%.
  - Securities: commission ×0.28, half the FX spread, loans 1 point
    cheaper, 2% on cash.
  - Looks: an avatar and a frame.
- **VIP cashback:** 0.5–1.5% of a month's gaming stakes.
- **Overdraft:** 1% a month.

Only Securities and Play write money entries, and `eco:` ids are the
Worker's alone. A regular bettor stays about level; nobody but the market
makes an account richer for free.

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

| Module | What |
| --- | --- |
| `quadra.mjs` | The core: the session, `proxyJson`/`packJson`, the economy tables, Plus/VIP, notices, `installGate`, `watchUpdates`, `onlineOnly`, `keepOffline`, `mayLocate`, `tabBar`, `topActions`, `fitNumbers`, `rank` (recommendations), `rec` (除錯紀錄), iPhone behaviour |
| `quadra.css` | The design system (iOS 27 tokens, Liquid Glass, springs, every control) |
| `ui.mjs` | Builders: `segmented`, `sheet`, `menu`, `toast`, `list`/`cell`, `search`, `toggle`, `empty`, `view`, `countTo` |
| `boot.js` | The loading screen and the version check |
| `brand.mjs` | Families, names, colours, marks, repos, `RENAMED`, `DEV` |
| `pass.mjs`, `help.mjs`, `truth.mjs` | The Pass sheet; every app's guide; 真相 (the house's real numbers) |
| `pass-sync.mjs` | An app's payload kept in step with the Pass's copy (read and merged before any write; once per return, none under 10 s away, an unchanged copy not merged again); Words, Weather, Slips |
| `catalog.mjs`, `logos.mjs`, `names.mjs`, `photos.mjs` | Leagues; logos; Chinese team names; studio headshots |
| `f1live.mjs`, `postseason.mjs`, `sports-*.mjs` | F1 sessions; MLB's postseason; highlights, broadcast, win probability (also run by builders) |
| `play-*.mjs`, `stock-*.mjs` | Play's and Securities' pricing and ledgers, shared with the Worker |
| `holidays.mjs` | Taiwan's days off |
| `sw-images.js` | Other sites' pictures in one shared cache |

**Securities' broker rules** follow Taiwan's real ones (`stock-credit.mjs`):
現股當沖 either way round after 3 months with 10 trades or with a credit
account; a daily 當沖額度 on what's sold first, twice net worth in NT$100,000
steps, NT$500,000 to NT$50,000,000 (`dayTradeRoom`).

**Brand:** `node brand/generate.mjs [id…|site]` writes every app's icons,
share cards, manifest and page tags. Renamed repos (Passion-Beats,
Slip-Tracker) are small redirect repos.

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
- **Bindings:** D1 `quadra-store`, R2 `quadra-data`, KV `RATE_LIMIT_KV`,
  DO `F1Log`, and the services `GEMINI_RELAY` and `GUARD`.

## 10. Tools and tests

| Tool | What |
| --- | --- |
| `node tools/preview.mjs <app>` | The app at phone size with real data (`--live`, `--width 375`, `--lang en`, `--click`, `--eval`, `--store`, `--webkit`, `--reopen`, `--serve`…; `tools/README.md`). Prints `wraps:`, `cut:`, `scrolls sideways:` |
| `node tools/economy.mjs` | The economy on paper, old settings against new |
| `node tools/leagues-audit.mjs` | Every catalogue league against its sources |
| `node tools/hk-lots.mjs` | Hong Kong board lots for Securities, from HKEX |
| `node tools/jp-lists.mjs` | Tokyo's TOPIX500 and ETF trading units for Securities, from JPX |
| `node tools/espn.mjs <path>` | The shape of an ESPN answer |
| `node tools/issue-passes.mjs` | Issue passes (the owner) |

`npm test` covers the Pass, money, push, the data proxy, F1, Asian
baseball, Kambi, transit, weather, the builders, the guard and pacing, and
the kit.

## 11. If you change…

| This | Also check |
| --- | --- |
| A league (`kit/catalog.mjs`) | Sports' `leagues.mjs`/`broadcast.mjs`, Play's `teams.mjs`, `builders/`, `tools/leagues-audit.mjs` |
| `proxyJson`, `packJson` | Every app's first paint; `sports.js`, `data.js` |
| A trim | Every parser that reads it, and the builders |
| A Cloudflare product or cron | `guard.js` `PLAN` |
| `f1-live.js` | Sports' F1 board, Play's F1 settling |
| `eco.js` money rules | The kit's tables, `truth.mjs`, `help.mjs`, `tools/economy.mjs` |
| `push.js` checks | The apps that schedule them, `NOTICE_KINDS` |
| `quadra.css` or the frame | Every app at 375 px, light and dark |
| `brand.mjs` | `node brand/generate.mjs` |

## Open

- **Waiting on the owner:**
  - phone alerts for the bill (admin → 系統 → 警示通知: your pass,
    設定, 測試);
  - a $5.01 usage email in Cloudflare → Notifications;
  - check the plan renews on the 13th (`PERIOD_DAY`);
  - delete the archived Shared-Data repo and the Firebase project
    (orbit-project-76897; its backup is in R2);
  - revoke the old `MATCH_FIND_DISPATCH_TOKEN`.
- **Scheduled:** the old `sports-proxy` Worker is deleted on 2026-10-20;
  `FIREBASE_PRIVATE_KEY` comes off on 2026-12-06.
- **Kept off `main`:** Transit's bus stops drawn from the packs, until
  their sides match TDX's.
- **Not yet seen on a phone:** Securities' proxy back-fills and plan buys;
  Play's 5-second live-bet wait.
