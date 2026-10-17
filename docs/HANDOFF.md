# Handoff: the family's state now

Read `TRUTH.md` first (the owner's rules), then this: what's where today,
what's open and why. It's rewritten as things change, never appended to; the
history is the git log of each repo (each round's list and what was done are
in its commits). What each app does in detail is its README.

Updated 2026-10-18.

## The repos

| Repo | What | Deploys |
| --- | --- | --- |
| Shared-Proxy | The proxy (Workers), the shared kit, the brand, the family's page and admin panel, the tools, these docs | `main`: Workers by `deploy.yml` / `deploy-guard.yml`; kit and site to Pages by `pages.yml` |
| Quadra-Play | Sports bets, lottery, scratch cards (play money) | Pages on push |
| Quadra-Securities | A Taiwan broker's account on real prices (play money) | Pages on push |
| Orbit-Sports | What a viewer in Taiwan would watch: games, tables, players, where to watch | Pages on push |
| Orbit-Transit | Taiwan's buses, trains, metros and YouBike: trips as a person travels, navigation | Pages on push |
| Orbit-Weather | One blended forecast to the township | Pages on push |
| Orbit-Words | Vocabulary with a memory model | Pages on push |
| Orbit-Class | The class timetable (Vite build) | Pages on push |
| Passion-Beats | A separate project (its own CLAUDE.md) | Pages on push |
| Slip-Tracker | 運彩追蹤: real Taiwan Sports Lottery tickets followed live (independent: no Pass, no kit; ESPN straight from the phone, only Asian baseball through `/slip`; ticket photos read by Gemini through `/slip-scan`) | Pages on push |
| Shared-Data | Retired 2026-10-13 and archived; its data lives in R2. The owner deletes it (OWNER-STEPS) | none |

Every app loads the kit from Shared-Proxy's Pages, so a kit change is one
push there. **Order of pushes:** an app that imports a new kit export is
pushed after `pages.yml` has published the kit (an app ahead of its kit
fails to load).

## Cloudflare ($5 Workers Paid, never a penny more)

- **Workers:** `orbit-workers-proxy` (every route: `/eco`, `/play`,
  `/stock`, `/sports-proxy`, `/data/`, `/weather`, `/transit`, `/push/`,
  `/kambi`, `/gemini`, `/nl-edit`, `/config`, `/guard`, `/ops`), its two crons (even and odd
  minutes, `worker.js scheduled`); `quota-guard` (the bill's guard, a
  Durable Object alarm every 5 minutes); `gemini-relay` (Gemini, pinned to
  Taiwan). The old `sports-proxy` forwarder is deleted by `deploy.yml` on
  2026-10-20.
- **Store:** D1 `quadra-store` (the Pass: wallets, each app's save, the
  open slips and tickets, Securities' fills and checks, heartbeats). R2
  `quadra-data` (the family's data: season packs, bus packs, photos, watch
  links, `mirror/` reads kept on demand; `private/` never served). KV
  `RATE_LIMIT_KV` (the guard's state, the pace, caches that cross isolates).
- **The guard** stops the proxy at 90% of any included amount until the
  next period (from the 13th), paces the month from 60% projected, and
  tells the owner's phone at 50/75/90% (once the owner sets the alert
  account: OWNER-STEPS 1). `/guard` shows it; the admin panel's 系統 shows
  it with every cron job's heartbeat, R2 and D1, secrets and bindings.
- **Use** (the guard, an hour of 2026-10-14 03:40 → a month): requests
  about 4%, R2 writes about 10% (kept reads: one per finished game or day
  the first time anyone opens it; the builders write only what changed),
  KV, Durable Objects and D1 under 1%. CPU about 10% steady: measured with
  `tail.yml` (`cpu`), ordinary requests and crons ~2,500 ms an hour, the
  builders' and Weather's scoring window (:10–:24) ~1,200 ms; an hour of
  heavy testing (preview `--live`, the system report) read 12,700 ms.
  Nothing near a pace mark (60% projected).

## Quadra's money (impossible to exploit, 2026-10-14)

Only the proxy adds money (README §3.1 and §5 have every rule): Play's
slips are placed, settled and cashed out there, on the house's own bets
(`price.js keptLeg`), a live pick priced again after 5 s on fresh reads;
the lottery and scratch cards are sold and paid there; Securities' orders
and monthly plans are filled there (`stock-fill.js`: each order's terms and
moment as first seen) and its saves counted there (`stock-check.js`: an
issued fill matched exactly and once, anything else at the worst price
since, exchanges at the market's rate less the narrowest spread, interest
no more than earned, loans and short sales never in the pool). An app's own
wallet entries can only spend, dated by the Worker. Each hole closed has a
test that tries it (`tests/stock-check.test.mjs`, `settle.test.mjs`,
`eco.test.mjs`). The pre-lock hand-overs (`op: 'open'`, `tickets-open`) are
closed; the Audit workflow counted no slip left waiting (six old tickets
with no prize entry, most likely lost ones).

## The look: iOS 27 from the kit (2026-10-14)

`kit/quadra.css` is the one design system (README §9.2) and `kit/ui.mjs`
the moving pieces. Every app was moved onto it: Weather (its forms as iOS
lists, the kit's switch, search, segmented ranges and sheets), Words,
Securities, Play (chips, segmented controls, buttons, search; the slip bar
is the tab bar's glass accessory), Sports (four options or fewer a
segmented control, more a row of chips), Transit, Class (tokens, buttons,
sheets' corners, switch) and Passion Beats (the kit's tokens); the family
page and the admin panel too. What stays each app's own is what's truly
its own (Weather's skies and charts, Transit's map, Sports' pitch and
court, Play's tickets, Class's layered editor). Checked at 375 px in WebKit,
light and dark, and in the iOS 27 simulator's Safari (the install screen;
signing in there needs the owner's pass).

## Online and offline (2026-10-15)

The kit watches every request (`netState`): no connection or a slow one
says so in a glass capsule over the tab bar. Securities, Play, Transit and
Sports are online-only (`onlineOnly`: covered, 沒有網路連線, 重試, gone by
itself when the connection's back). Words, Weather and Class open offline
on what they kept; Words keeps its progress on the phone at every change
and Class remembers an edit not yet sent (both merged with the pass's
copy before anything is written). Passion Beats has a worker of its own.
Every app's worker keeps its files from the first visit (`keepOffline`),
answers any kept version when offline, and waits 2.5 s for the network
before its copy; the loader's import map stamps every kit module.
Measured (`tools/preview.mjs --net offline|slow:8000 --root <stamped>`):
offline every app opens in 0.1–2.4 s (the cover or the app); every request
8 s late, Words 0.1 s, Weather 1.6, Play 2.5, Class 3.1, Transit 4.1,
Sports and Securities about 8 (Securities waits for the sign-in on
purpose: money). Not yet seen on a phone.

## Speed (2026-10-15)

Measured with `tools/preview.mjs --live --h2 --latency 120 --timing
--reopen` on stamped copies (`--profile` for the main thread), Chromium,
not yet on a phone; the second round A/B, the old and new code alternated.
- **Reopens:** Play 4.3 → 2.7 s (its saved board drawn once today's reads
  have gone out; every model fit kept on the device, `play.fits`: a board
  prices in a quarter of the time), Sports 2.8 → about 2 s (scoreboards
  with no game on kept until just before the next game), Weather 0.84 →
  0.55, Words 0.91 → 0.77, Securities 1.00 → 0.87, Transit 2.1 → 2.1 (TDX's
  live bikes; from Europe each miss crosses to Taiwan), Class 0.66 → 0.62.
- **First openings:** Play about 10 → 8 s (the live board read once the
  leagues are in, each game's pregame line from the live pages: 36 reads →
  17), Sports about 4.9 → 3.4 (noisy: Europe's games were on). Bound by the
  sources.
- **The proxy:** a batch writes each read the moment it's in (`&lines=1`;
  answered whole it waited on its slowest: 23 lists ready in a second
  waited 3.6 s on one). Play's Polymarket lists are read without the
  markets nobody reads: a board's 37.5 MB for the proxy to parse → 2.2 MB,
  86-159 ms of CPU → 6-10 ms, 1.7 MB → 0.24 MB to the phone. Under use the
  Polymarket trims were 9.2 of 10.3 CPU-seconds in a 15-minute tail.
- Every app's deploy lists the kit modules its first screen imports
  (`kit/preload.mjs`). The kit's clean-up of kept answers runs every 6
  hours, idle, not at each open.

### Features, the third round (2026-10-16), measured

- Transit's trip plans: first 4.2 → 2.6 s, all 5.5 → 4.3 s (waits side by
  side); a stop's card reads nothing off its tab; walks from a ~40 m grid.
- Weather (its dev door, `/weather` from localhost): a new place's first
  answer 2.9 → 1.5 s, whole 10 days 7.2 → 4.9 s, 3–5 requests → 1 (the rest
  comes as a second line, `lines=1`); pins asked together.
- Play: a moneyline's check MLB 2.3 / NFL 11 / NHL 4.0 s → 0.5 s; a live
  bet's 9 reads → 1; ESPN month pages trimmed (NHL 4.5 → 0.13 MB) and read
  every 2 min; cash out 5 → 3 writes.
- Securities: net worth 170 → 7 ms; a waiting order asked 80 → 6 times an
  hour, filled from the bars since its last look (a phone waiting to ask
  can't get under its limit).
- Words' lists 0.4–1.3 s → 4–17 ms a draw.
- Everyone: a save is 1 request (was 2: a preflight); the heartbeat and a
  save don't send back an unchanged wallet, nor rewrite it for a data-only
  save; live polls don't re-read and rewrite the phone's copy; no R2 read
  per live miss; notices' due times on each list's own key (a shared key
  could lose a list).

## Workflows (Shared-Proxy, by hand from Actions)

- **Run a builder or a check** (`build.yml`): any builder now, a tiny
  Gemini call, or the system report.
- **Audit** (`audit.yml`): each Worker's secret names, and the store counted
  (collections; pre-lock slips and tickets still waiting).
- **Tail a Worker** (`tail.yml`): its logs for a few minutes, or (`cpu`)
  each route's and cron's count and CPU summed.

## Open

- **Tonight's round (2026-10-18):** a Taiwan day trade bought first gets
  the half tax only once the account can day trade (`dayTradeBuyFirst`: 3
  months open, 10 trades in the year); before that it pays the full 0.3%.
  The preview tool has an `admin [view…]` target (the panel on a local
  stand-in with fake data, no sign-in). iPad and 375 px fixes across Play,
  Securities, Sports, Words, Class and the admin panel (nothing wraps or
  scrolls sideways but the slide rows and pinned tables).
- **No English yet:** Transit and Weather are Chinese only (each has a task
  card waiting for the owner to start).
- **The owner's steps** (`OWNER-STEPS.md`): phone alerts in 系統, a $5.01
  billing email at Cloudflare, the renewal day, deleting Shared-Data and the
  Firebase project, revoking the old Match Find token.
- **Scheduled, nothing to do:** 2026-10-20 the old `sports-proxy` Worker is
  deleted; 2026-12-06 `FIREBASE_PRIVATE_KEY` comes off the proxy (sign-ins
  it signed ran out 2026-12-05).
- **Sports:** a game is over the moment the rules say so (`overByRule`)
  and 比賽資訊 says when it ended; the resting starters' rings and a
  rookie's college headshot (Castro) fixed. The rings were checked by CSS
  only: the game had ended when they could be looked at live.
- **Not yet seen on a phone:** the proxy's back-fills and plan buys in
  Securities (tested, and the page checked at 375 px in WebKit), a live
  bet's 5-second wait in Play.
- **Money holes closed (2026-10-16):** a wallet past 600 KB folds its old
  entries into monthly sums (`foldWallet`: the balance and each app's and
  kind's sums unchanged; eco:* and Securities' never folded; Play's only past
  400 days, so a paid slip's stake and payout go together) and the limit is
  1.8 MB (D1's row 2 MB); Securities' cancels are the proxy's to rule on
  (`op: 'cancel'`), and a save's "cancel" of an order the proxy filled or
  saw reached counts as the fill.
- **Not pushed on purpose:** Transit's bus stops drawn from the packs (no
  TDX read per pan). Its sides don't match TDX's: 臺北轉運站 five signs
  facing E, N, SE, SE, SW where TDX has two (S, W); 新竹火車站 S where TDX
  has SW, plus the 中正路 signs apart. Kept in a worktree until the side
  rule matches.
- **The preview tool** can't reach `asia-baseball.quadra` or Polymarket
  from the owner's Mac without `--live` (their 502s there are the tool's,
  not the apps').
