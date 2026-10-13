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
- [ ] **Phones: fewest requests per opening.** Mirror reads join the data
      proxy's batches. `/data/` files carry long cache lifetimes and ETags:
      a copy that can't change before its `until` is cached until then, and
      a phone gets a 304 instead of the file again. Measured with
      `preview.mjs --requests`.
- [ ] **Builders: no repeated work.**
      - Read a source only when its answer can have changed. Recent days come
        from the nightly season packs; ESPN is asked only for today and
        yesterday.
      - Read ELTA's season pages only for games still missing a replay, at
        most once a day per game after its first days.
      - Write to R2 only when the content changed (done). Load only the
        archive months a run touches.
- [ ] **Edge cache first.** Every `/data/` and `/sports-proxy` answer is
      served from Cloudflare's cache in Taipei when it can be, before R2 or a
      source.
- [ ] **Cron cadence matched to how often the data changes.** The guard,
      builders, Kambi and settling run only as often as their data moves, and
      skip a run with nothing to do in one cheap read.
- [ ] **CPU.** Parse big pages once, keep built results, never re-parse what
      didn't change.
- [ ] **A cost line in every commit and in HANDOFF**: requests, CPU, R2
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
- [ ] You: check the plan renews on the 13th, and add a $5.01 budget alert.

## 2. One proxy (done)
- [x] `/sports-proxy` is a route of `orbit-workers-proxy` (`sports.js`):
      one router and one set of CORS code (`http.js`). F1's lap log and its
      cron moved in.
- [x] Kit, apps and Shared-Data use the one address. Checked live: one
      shared cache in Taipei.
- [ ] Remove the `sports-proxy` forwarder after a quiet week in its logs.

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
- [ ] **Drain**: every file Shared-Data's indexes list is moved into R2, a
      few minutes each hourly run, until done (`builders/drain.js`)
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
- [ ] See the first builders' run (20:16 UTC)
- [x] Shared-Data's last workflow switched off (the proxy builds the buses)
- [ ] **You:** OK to delete the Shared-Data repo (can't be undone)
- [ ] Remove the Pages fallback in `data.js` once the repo's gone

## 4. Firebase (Firestore) → D1, then Firebase abandoned
- [x] The guard counts D1 (rows read and written, storage); each count is
      now its own query, so one the API won't read can't blind the guard.
- [x] Every store call goes through `doc-store.js` (D1 table, conditional
      writes as Firestore's), tested on real SQLite.
- [x] Dual mode on: Firestore stays in charge, every write is copied to D1,
      and the cron copies the rest once.
- [ ] **You:** add **Account · D1 · Edit** to the deploy token, then rerun the
      deploy (README §11); until then the proxy stays on Firestore alone
- [ ] Copy every document and compare them one by one (`/store/check`)
- [ ] Read and write from D1 only. Keep a final export of every Firestore
      document in R2 as the backup.
- [ ] **Abandon Firebase**: remove all Firestore code, the
      `FIREBASE_*` secrets and vars, Firestore's rules and the docs on it.
      You then delete the Firebase project (steps written out for you).

## 5. Review every repo against the new baseline
- [ ] Remove workarounds the free plan forced: the 10 ms CPU limit, the
      50-fetch budgets (Kambi watch, settling 6 slips a run, Asian months),
      and KV write rationing.
- [ ] Price Play's whole board on the proxy, as you asked before. The CPU
      limit used to block it.
- [ ] Fill Securities' orders on the Worker (left open 2026-10-12).
- [ ] Weather: check whether parsing CWA's national lists on the Worker helps.
- [ ] Bring READMEs, TRUTH, HANDOFF and help text up to date.
- [ ] Loose ends from today's preview: a 404 on Sports' first screen, and
      `replay-icon` flagged wider than the screen.

## Verification
- `npm test` in every repo touched; `wrangler deploy --dry-run` for each
  toml.
- Live checks through the dev door: `/guard`, `/data/<file>` returned from R2
  (not Pages), `/sports-proxy`.
- `tools/preview.mjs <app> --webkit --live` at 375 px for Sports, Play and
  Transit after each switch.
- R2 holds the same number of files as the last build after the copy.
