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
- [ ] Confirm the first real reading at `/guard`: the token reads the bill
      and the CPU field is accepted.
- [ ] You: check the plan renews on the 13th, and add a $5.01 budget alert.

## 2. One proxy (done)
- [x] `/sports-proxy` is a route of `orbit-workers-proxy` (`sports.js`):
      one router and one set of CORS code (`http.js`). F1's lap log and its
      cron moved in.
- [x] Kit, apps and Shared-Data use the one address. Checked live: one
      shared cache in Taipei.
- [ ] Remove the `sports-proxy` forwarder after a quiet week in its logs.

## 3. Shared-Data → R2, then the repo removed
- [x] R2 switched on; bucket `quadra-data` (Asia-Pacific) created and bound.
- [x] The guard counts R2's own allowance: 10 GB stored, 1M writes and 10M
      reads a month.
- [x] `/data/…` route (`data.js`): edge cache, then R2, then Pages while
      moving. Builders write through `/data/push` and `/data/_list`.
- [ ] **Copy the last build's whole site into R2 as-is**, asking no source
      again (`Shared-Data/r2sync.mjs`, the run named "r2"). Running.
- [ ] Every Shared-Data build syncs only what changed into R2.
- [x] The kit's `packJson`, and Transit's bus packs, shapes and
      where.json, read from `/data/`. Phones keep their saved copies.
- [ ] Move the builders into the proxy's crons one at a time, each checked
      against GitHub's output first:
      `watch` → `winprob` → `cpbl` → `sports` + `season` → `mirror` →
      `asia` → photos (`official-photos`, `cutouts`) → buses (`build`,
      `shapes`, `where`).
- [ ] Remove the Pages fallback, then archive and delete Shared-Data; update
      docs and TRUTH.

## 4. Firebase (Firestore) → D1, then Firebase abandoned
- [ ] The guard counts D1 first: rows read, rows written, storage.
- [ ] Put the store's functions in `worker.js` (`firestoreGet/Write/List/
      Batch/Delete/Collections`) behind one interface: D1 underneath,
      Firestore only for the move.
- [ ] Copy every document (wallets, each app's data, Play's slips, config,
      the ledger) to D1 and compare them one by one; write to both briefly.
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
