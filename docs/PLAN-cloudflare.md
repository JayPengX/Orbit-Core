# Plan: everything on Cloudflare's $5 plan, never a penny more

## Context
Cloudflare moved to Workers Paid ($5/month) on 2026-10-13. The goals:
- use what the plan allows, behind a hard stop at $5;
- one proxy for everything;
- move Shared-Data and Firebase onto Cloudflare;
- then review every repo against the new baseline.

Cloudflare has no spending cap of its own, so a guard Worker enforces it.
Every item is pushed to `main` when done and checked live.
`Shared-Proxy/docs/PLAN-cloudflare.md` holds the same list in the repo.

## 0. Ultra efficient, everywhere (applies to every item below)
Every change spends as little as possible of each budget: proxy requests,
CPU ms, subrequests, R2 reads and writes, KV, and the sources' own limits.
Each one states its before and after numbers.
- [x] **Phones: fewest requests per opening.** (Batches of 24; `/data/`
      ETags and 304s; mirror reads in the batch.) Mirror reads join the data
      proxy's batches. `/data/` files carry long cache lifetimes and ETags:
      a copy that can't change before its `until` is cached until then, and
      a phone gets a 304 instead of the file again. Measured with
      `preview.mjs --requests`.
- [x] **Builders: no repeated work.** (§3: only what's new, written only
      when changed.)
      - Read a source only when its answer can have changed. Recent days come
        from the nightly season packs; ESPN is asked only for today and
        yesterday.
      - Read ELTA's season pages only for games still missing a replay, at
        most once a day per game after its first days.
      - Write to R2 only when the content changed (done). Load only the
        archive months a run touches.
- [x] **Edge cache first.** (`data.js`, `sports.js`.) Every `/data/` and `/sports-proxy` answer is
      served from Cloudflare's cache in Taipei when it can be, before R2 or a
      source.
- [x] **Cron cadence matched to how often the data changes.** (Guard 5
      min; builders in their slots; Kambi and settling one index read.) The guard,
      builders, Kambi and settling run only as often as their data moves, and
      skip a run with nothing to do in one cheap read.
- [x] **CPU.** (1.3% of the month's so far.) Parse big pages once, keep built results, never re-parse what
      didn't change.
- [x] **A cost line in every commit and in HANDOFF** (kept as a rule): requests, CPU, R2
      and KV operations, before and after.

## 1. Hard stop on the bill (`Shared-Proxy/guard.js`, `guard-worker.js`)
- [x] `quota-guard` Worker reads the period's use every 5 minutes. At 90% of
      any included amount, it turns the proxy's address and crons off until
      the next period.
- [x] Per-invocation CPU caps and log sampling in each toml; 容量 on the
      admin page shows the bill.
- [x] Your `CF_GUARD_TOKEN` added and loaded into the guard.
- [x] Fixed: the guard didn't start (its entry file exported constants).
- [x] Fixed: every proxy push redeployed the guard and re-registered its
      cron, so it never ran. It now deploys only when its own files change.
- [x] Found why the guard never ran: Cloudflare registered its new cron
      but never fires it (a known 2026 fault with new crons, paid accounts
      too). Its clock is now a Durable Object alarm every 5 minutes; the
      proxy's working cron wakes it.
- [x] The guard's first real reading: armed, every count read (0.3% of
      requests, 1.2% of CPU, 2.9% of R2 writes so far)
- [ ] You: check the plan renews on the 13th, and add a $5.01 budget alert
      (Cloudflare → Notifications → Usage Based Billing).

## 2. One proxy (done)
- [x] `/sports-proxy` is a route of `orbit-workers-proxy` (`sports.js`):
      one router and one set of CORS code (`http.js`). F1's lap log and its
      cron moved in.
- [x] Kit, apps and Shared-Data use the one address. Checked live: one
      shared cache in Taipei.
- [x] The `sports-proxy` forwarder retired: no code calls it, its logs were
      quiet; its code is gone and the deploy deletes the Worker on 2026-10-20
      (the guard treats it gone as nothing to stop).

## 3. Shared-Data → Cloudflare, then the repo removed
- [x] R2 switched on (you); bucket `quadra-data` (Asia-Pacific) created and
      bound.
- [x] The guard counts R2's own allowance: 10 GB stored, 1M writes and 10M
      reads a month.
- [x] `/data/…` route (`data.js`): edge cache, then R2, then Pages while
      moving.
- [x] The bulk copy ran past GitHub's 3-hour limit (it was working through
      the 37,000 mirror copies). Replaced by a **lazy move**: any file R2
      lacks is taken from Shared-Data's Pages once and kept, for phones and
      builders alike.
- [x] **Drain** done: all 426 listed files in R2; the Pages bridge and the
      drain removed afterwards
- [x] The kit's `packJson`, and Transit's bus packs, shapes and where.json,
      read from `/data/`. Phones keep their saved copies.
- [x] Mirror reads answered inside the data proxy (in a phone's batch).
- [x] **Read on demand**: a finished game, a day or month all over, or a
      past Asian month is kept in R2 the first time anyone reads it, then
      served from there. Nothing gets prefetched that nobody opens.
- [x] Every builder now runs in the proxy's hourly cron, each lean:
  - [x] `watch`: hourly light run, daily full run
  - [x] `winprob`: daily; Polymarket via the proxy's trimmed cache
  - [x] `cpbl`: daily at 23:17 Taiwan
  - [x] `sports` (season packs): nightly; only unsettled months read
  - [x] `mirror`: not ported. Finished games are kept on first read; the
        rest comes through the edge cache
  - [x] `asia`: CPBL's whole months, the current one daily (cpbl.com.tw
        refuses servers, Taiwan's included)
  - [x] photos: four lists a day in turn, cutouts 20 an hour; NBA stays as
        is (your call)
  - [x] buses: a city weekly, TDX read in small pages to fit the Worker's
        memory
- [x] Docs and TRUTH updated
- [x] Found the builders' new hourly cron never fired either: they now run
      from the working even-minute cron at :16, and F1's lap log from both
      crons.
- [x] The first combined run hit the 30-second CPU limit. Each builder now
      gets its own minute, and ELTA matching is capped (10 tries a game,
      1,500 a run). Every builder checked by hand (`Run a builder`
      workflow): watch in full, season packs (26 leagues), CPBL, win
      probability, CPBL's month, photos, buses, cutouts.
- [x] Shared-Data's last workflow switched off (the proxy builds the buses)
- [x] Shared-Data **archived** (your choice), its Pages site off
- [x] Pages fallback and the nightly mirror's last code removed (proxy,
      kit, Orbit Sports)

## 4. Firebase (Firestore) → D1, then Firebase abandoned
- [x] The guard counts D1 (rows read and written, storage); each count is
      now its own query, so one the API won't read can't blind the guard.
- [x] Every store call goes through `doc-store.js` (D1 table, conditional
      writes as Firestore's), tested on real SQLite.
- [x] Dual mode on: Firestore stays in charge, every write is copied to D1,
      and the cron copies the rest once.
- [x] You added **Account · D1 · Edit** to the deploy token; `quadra-store`
      made (APAC) and bound
- [x] Every document copied (15 in 12 collections) and compared: 0 differ,
      missing or extra
- [x] D1 only. Firestore's last copy in R2
      (`private/firestore-backup.jsonl.gz`, never served)
- [x] **Firebase abandoned** in code: Firestore's client, the moving code,
      `FIREBASE_PROJECT_ID` and `FIREBASE_CLIENT_EMAIL` gone; the docs
      updated. `FIREBASE_PRIVATE_KEY` stays only to check sign-ins made
      before 2026-10-05, and the deploy removes it on 2026-12-06.
- [ ] **You:** delete the Firebase project (steps in the chat).

## 5. Review every repo against the new baseline
- [x] Free-plan workarounds: settling (60/30), the lottery (40) and Kambi
      (150) were already raised; batches now 24 reads (8 requests per
      Sports opening to 5); the stale reasons rewritten. Kept on purpose:
      TheSportsDB's day cap (its own burst limit) and Transit's KV batching
      (spares writes).
- [x] Play's board stays priced on the phone (it costs nothing per
      opening; repricing every round on the proxy would spend 1–3% of the
      month's CPU for no change you'd see). Yours to reopen.
- [x] Securities' orders filled by the proxy (`/stock`, `stock-fill.js`),
      as Play's bets are settled by it; the saved account takes those fills
      as they are.
- [x] Yahoo's 429s: the proxy unpinned (Yahoo refused Taiwan's servers),
      Gemini alone goes through a small Taiwan-pinned relay; 10 of 10 reads OK.
- [x] Gemini through the relay checked live (`build.yml` gemini-check: 200,
      "OK", 1.8 s).
- [x] A cut price in Securities' 為你推薦 (fitted before the font loaded):
      Securities and Play now fit again once fonts load.
- [x] Weather: CWA's national lists stay unparsed on the Worker (CPU for a
      table that changes a few times a year; the committed table is right).
- [x] READMEs, TRUTH, HANDOFF brought up to date (and the deploy now runs
      for every module; `builders/` and `stock-fill.js` were missed).
- [x] Loose ends from today's preview: the 404 was the preview's own
      missing `kit/version.json` (fixed in the tool), and the replay icon now
      sits on-screen at no opacity.

## 6. Pacing, alerts, monitoring, secrets (2026-10-14)
- [x] The month paced: 60/80/90% projected slows live refreshes ×2/×4/×8,
      parks builders, trims reads (`guard.js`, `pace.js`)
- [x] Phone alerts at 50/75/90%, a new pace, a stop (`ops.js`)
- [ ] **You:** admin panel → 系統 → 警示通知: your pass → 設定 → 測試
- [x] Every cron job's heartbeat in D1; admin 系統 pane (bill, pace, jobs,
      Gemini check, builders by hand, R2, D1, secrets, deploys)
- [x] Secrets: account ID found from each token (`CLOUDFLARE_ACCOUNT_ID`,
      `CF_ACCOUNT_ID` gone); `MATCH_FIND_DISPATCH_TOKEN` off the proxy;
      `PROXY_URL` variables gone (3 repos); README §11 by kind
- [ ] **You:** revoke the old Match Find dispatch token at GitHub
- [ ] **You:** delete Shared-Data (`gh repo delete JayPengX/Shared-Data`)
- [ ] **You:** delete the Firebase project `orbit-project-76897`

## Verification
- `npm test` in every repo touched; `wrangler deploy --dry-run` for each
  toml.
- Live checks through the dev door: `/guard`, `/data/<file>` returned from R2
  (not Pages), `/sports-proxy`.
- `tools/preview.mjs <app> --webkit --live` at 375 px for Sports, Play and
  Transit after each switch.
- R2 holds the same number of files as the last build after the copy.
