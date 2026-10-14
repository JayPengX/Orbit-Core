# Handoff: the family's state now

Read `TRUTH.md` first (the owner's rules), then this: what's where today,
what's open and why. It's rewritten as things change, never appended to; the
history is the git log of each repo (each round's list and what was done are
in its commits). What each app does in detail is its README.

Updated 2026-10-14.

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
- **Use** (the guard's reading, 2026-10-14 ~11:00 Taiwan, 1.1 days into
  the period): requests 0.35%, CPU 1.4%, KV and Durable Objects under
  0.2%, D1 nothing to speak of, R2 writes 2.9% (most of it the move of
  Shared-Data's files and the first days' kept reads; steady, a kept read
  is one write per finished game or day the first time anyone opens it).
  See "Open" for where the CPU goes.

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

## Workflows (Shared-Proxy, by hand from Actions)

- **Run a builder or a check** (`build.yml`): any builder now, a tiny
  Gemini call, or the system report.
- **Audit** (`audit.yml`): each Worker's secret names, and the store counted
  (collections; pre-lock slips and tickets still waiting).
- **Tail a Worker** (`tail.yml`): its logs for a few minutes, or (`cpu`)
  each route's and cron's count and CPU summed.

## Open

- **The owner's steps** (`OWNER-STEPS.md`): phone alerts in 系統, a $5.01
  billing email at Cloudflare, the renewal day, deleting Shared-Data and the
  Firebase project, revoking the old Match Find token.
- **Scheduled, nothing to do:** 2026-10-20 the old `sports-proxy` Worker is
  deleted; 2026-12-06 `FIREBASE_PRIVATE_KEY` comes off the proxy (sign-ins
  it signed ran out 2026-12-05).
- **Not yet seen on a phone:** the proxy's back-fills and plan buys in
  Securities (tested, and the page checked at 375 px in WebKit), a live
  bet's 5-second wait in Play.
- **The preview tool** can't reach `asia-baseball.quadra` or Polymarket
  from the owner's Mac without `--live` (their 502s there are the tool's,
  not the apps').
