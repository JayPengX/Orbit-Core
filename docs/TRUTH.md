# The truth: how every Quadra and Orbit app is built

The owner's standing rules for the whole family: Quadra (Play, Securities,
the Pass) and Orbit (Class, Weather, Transit, Sports, Words). Every repo's
`CLAUDE.md` points here. When a change would break one of these, the change
is wrong, not the rule. When the owner adds a rule, it goes here, dated.

These rules come from the owner's own words and from what 2,700 commits
across the family (2026-08-26 on) show they kept asking for. Where a rule has a date, it's when the owner made that call;
the latest call wins over an older one, and §15 lists the calls so none is
undone by accident. What each app does in detail is in its README; this
file is how to work on them.

## Contents

1. The owner, and how they work
2. Working
3. Testing like the owner uses the apps
4. Changing how anything is recommended
5. Security and privacy
6. The shared kit first
7. Data, the layers, quotas and cost
8. Live, and right the moment it happens
9. Opening fast, and never moving
10. iPhone Safari is the platform
11. Words, pictures and the look
12. What the products are, and aren't
13. Quadra's money
14. Each app's yardsticks
15. The owner's calls, by date

## 1. The owner, and how they work

- **One person runs the whole family** and works across every repo in
  `~/Documents/GitHub` (Orbit-Class, Orbit-Transit, Orbit-Weather,
  Orbit-Sports (was Quadra Fixtures), Orbit-Words (was Quadra Hub),
  Quadra-Play, Quadra-Securities, Shared-Proxy; Shared-Data retired 2026-10-13). A request that names no
  repo means whichever the context says, often several.
- **They use the apps on their iPhone, installed on the home screen, in
  Safari's engine**, every day, and send what they find: a list (9, 22, 33,
  40 items), screenshots, a 除錯紀錄 copied from the Pass sheet, a ride they
  just took on a bus. If they mention a screenshot or attachment that isn't
  there, ask before starting.
- **They live in 新竹** and travel by YouBike, bus (快捷8號支, 5615…) and the
  六家線 and 內灣線; Transit's real cases are their own trips. Everything still
  works for the whole of Taiwan, never only Taipei or only Hsinchu.
- **They decide the product.** What an app is for, what it shows, what goes
  away. Their call is written into the commit and here (§15). Never undo an
  owner's call because it looks like a bug; ask.
- **They prune hard.** A direction that didn't work is deleted whole, the
  same day (Rewards' 103 games, Sports' betting, every league Taiwan can't
  watch, Gemini's 最新動態, tennis and UFC). No `off` flags, no hidden
  leftovers, no code kept "in case" (§12).
- **Finish everything** (the owner, more than once: "stop leaving gap, just
  finish every … thing"). Every item on a list and every loose end it
  shows (a related place with the same bug, the docs, the help text, a
  test) is done in the same round. Don't stop to offer options or list
  "next steps"; ask only when a choice is genuinely theirs.
- **Right the first time.** "Any fix you created you need two tries" was a
  complaint (2026-10-11). A fix is checked on screen, at phone width, with
  the longest real data, before it's called done (§10).
- **"Quick fix" and "quota hitting" mean be fast**: the smallest correct
  change, few words, no exploration beyond the fault. Fast is never sloppy:
  the tests still run and the screen is still checked.
- **They read the replies on a phone.** Short, plain, what changed and
  what it means for them; no file dumps, no jargon about internals.
- **They own the accounts and the money**: Cloudflare, GitHub, Google Cloud
  (a NT$150-a-month budget at the start), TDX (a paid plan), the admin key.
  What only they can do (a secret, a Pages switch, a Google quota, enabling
  an API) is written out as numbered steps for them, with where to click.

## 2. Working

- **Push validated changes straight to `main`** (`git push origin
  HEAD:main`). `main` deploys: GitHub Pages for the apps and the kit,
  Cloudflare for the Workers. A session branch is fine to work on; `main`
  is where it lands, after every validated change (2026-09-28).
- **Run `npm test` first; push only if it passes.** Orbit Class also runs
  `npx eslint .`. A fix comes with a test that would have caught it.
- **Find the real cause.** The history is full of "actually fix", "the real
  reason", "once and for all": patches on a symptom came back. Say why it
  went wrong in a sentence before fixing it. A temporary diagnostic is
  fine; it comes out once the cause is confirmed, and so do failed attempts
  (never three tries left in the code).
- **Fix the rule everywhere it's used.** The family is big enough that a
  fix in one place and not its neighbours is the next bug: the same rule
  shown on 首頁, in a sheet, on a team's page and in a notice is one rule
  in one function, used by all of them (Sports' `sessionStatus`, `onAir`,
  `freshStandings`). The READMEs' "what depends on what" sections say
  where to look; keep them current.
- **Use the design that's there.** Before drawing something, find how the
  app already draws it (a results row, a pill, a tile, a face) and reuse
  it. A new look for one place is a bug the owner will see.
- **Fix only what was asked, in the place asked.** A spacing fix leaves the
  rest of the layout alone ("the F1 team page as it was, only its spacing
  fixed", 2026-10-08). A redesign nobody asked for gets put back.
- **Rules are general, never special cases.** "Smart" means a rule that
  explains the case (a river crossing, a station's own train, a market's
  liquidity), not a hard-coded exception for the place the owner tested.
  When one case exposes a flaw, test many (Transit's batches of 52 and 172
  trips, not the one trip).
- **Real data, not guesswork.** A weight, a duration, a ranking is fitted
  to real data and checked against it (backtests in Words, real lottery
  prices in Play, "found via real trace data, not guesswork" in Sports).
  A dispute about what a source says is settled by reading it live.
- **Say how it was checked.** A commit says what was seen ("checked in
  WebKit at iPhone width: nothing cut", "checked on a home-screen install",
  "checked live on real buses"), and says plainly when something couldn't
  be checked here ("not yet checked on screen", "unverified on a phone:
  ask the owner").
- **Commit messages in plain words, what the person sees first**, then the
  cause in brackets when it helps: "Sports opens faster (a reopen 2.5 s →
  1.0 s): the TV lists open on the device's copy…". Numbers when there are
  numbers. No internal jargon in the first clause.
- **Few docs, each current** (the owner, 2026-10-14: "keep minimal docs").
  Per repo a README (the map) and `CLAUDE.md` (the pointer here); in
  Shared-Proxy also this file, `docs/HANDOFF.md` (the state now: what's
  where, what's open and why, rewritten as it changes, never a log), and
  `docs/OWNER-STEPS.md` (what only the owner can do). The history is the
  git log: each round's list and what was done go in its commits. A plan
  that's built is folded into the READMEs and deleted. "When I say stop,
  commit everything and write the handoff" (2026-10-01): the handoff is
  the state and what's left.
- **The README is the map.** Each repo's README documents every feature
  and what depends on what, in detail (2026-10-12). A change that adds,
  removes or moves a feature updates the README in the same push.
- **Help text follows the app.** The kit's `help.mjs` (each app's 說明) is
  updated with any change a person would notice; it describes the product,
  never the plumbing.
- **Clean up as you go.** Dead code, unused strings and styles, stale
  comments go when the feature does (checked with `tsc --checkJs
  --noUnusedLocals` in clean-up rounds). Support for an old version is
  removed once every device has moved on; readers of data still stored on
  passes stay.
- **Be efficient.** Do the work; skip the narration. Batch small fixes
  into one push per app.
- **Other agents' work is reviewed, not trusted.** A parallel agent's round
  (2026-10-01) was largely redone.

## 3. Testing like the owner uses the apps

- **Safari's engine, at iPhone size.** The owner runs Safari: use
  `--webkit` (Playwright's WebKit) for anything they'd see, 375 px wide.
  Chromium is for profiling only.
- **As an installed app that is being updated** (`tools/preview.mjs
  --upgrade <date>`): the old version's storage, the new version's code.
- **On a poor connection** (`--flaky 0.5`), then reopened (`--reopen`):
  whatever a failed read left on the phone shows on the second open.
- **Reopened, with what the phone keeps.** Playwright's private WebKit
  session drops Cache Storage on a reload (Safari never does), so
  `--reopen --webkit` runs in a profile of its own; a hand-made script
  uses `webkit.launchPersistentContext`. A reopen measured without it read
  everything again and looked slower than a phone (2026-10-12).
- **At a phone's latency** (`--latency 120`, `--timing`), and on a deploy's
  build (`--root` on a copy stamped by `scripts/stamp-version.mjs` and
  `kit/stamp.mjs`): the dev page has no modulepreload. Add `--h2`: the
  local server is otherwise HTTP/1.1 with six connections, where a page
  that lists its modules up front queues as it never does on GitHub Pages
  and Cloudflare (HTTP/2).
- **For movement after the loading screen** (`--shuffle`), and for text
  that wrapped or was cut (the preview prints `wraps:` and `cut:`).
- **Live on the iOS Simulator**, iPhone Safari itself and the closest
  thing to the owner's phone (Claude's simulator tool attaches, opens
  URLs, screenshots, taps and swipes): `node tools/preview.mjs <app>
  --serve --port 8123`, then `xcrun simctl openurl booted
  http://localhost:8123/<Repo>/?fresh=N`, a new `fresh` each time
  (Simulator Safari keeps the old kit). Reach for it for anything that
  moves, scrolls, blurs or sits at the screen's edges, where WebKit in
  the preview tool can differ from the real thing.
- **On the real proxy** (`--live`, §5's dev door): the made-up answers
  can't show the proxy's cache, limits and crashes.
- **With the owner's own case first**: their trip, their followed team,
  their screenshot's game, their 除錯紀錄 (`scripts/replay.mjs` runs a
  copied log's trips again).
- **Measure before speeding anything up**: where the time goes
  (`--requests`, a waterfall, Chromium's CPU profiler on the second
  opening), then fix the largest wait; say the before and after.

## 4. Changing how anything is recommended

A change to how anything is ranked or recommended (Transit's plans, Sports'
picks, Play's odds and 為你推薦) goes through these steps, in order:

1. **See it live first.** Run the owner's exact case on today's real data
   through the app's own code (Transit: `node scripts/live.mjs <from>
   <to>`, the proxy's dev door) and get the wrong answer on screen. No fix
   for a bug that hasn't been seen.
2. **Find the rule that made it,** not the place. Say why it went wrong in
   words (the same train boarded a station up the line counted as leaving
   later), and fix that rule wherever it's used.
3. **A test that fails without the fix** and passes with it, on the small
   made-up network in the tests. Then `npm test`.
4. **The owner's case again, live:** the wrong answer gone, and what shows
   instead is what a person would take.
5. **The whole batch, old code against new, at the same moment** (`node
   scripts/live.mjs --against HEAD`, or the commit before). Read every trip
   that changed: each must be the fix showing up elsewhere or the live data
   moving (a bus a minute off). Any other change is a quirk the fix made:
   fix it before pushing. When a kind of trip the batch doesn't cover was
   involved, add one like it.
6. **Say what moved** in the commit: the case, the rule, and how many batch
   trips changed and why.

## 5. Security and privacy

- **Never sign in to the live services** with a pass, token or key, even
  one handed over, and never create accounts. The Workers' localhost dev
  doors are the way to test against real data.
- **The dev door is one of Claude's own tools: use it.** The deployed
  Workers answer a request with an `Origin: http://localhost:<port>` header
  and no pass (a session's limit per address), so any upstream the proxy
  reads can be read from a terminal, the owner's Mac included, where some
  (Polymarket) are blocked on the network: `curl -H 'Origin:
  http://localhost:8123' 'https://orbit-workers-proxy.pengzjay.workers.dev/
  sports-proxy?url=<encoded upstream>&app=<an app id in kit/brand.mjs:
  odds, stock…>'` (`?batch=1` as the kit asks), and Orbit Transit's at
  `/transit/…` on the same address, and Orbit Weather's at `/weather?lat=
  &lon=&lines=1` and `/weather/where` (30 a minute an address; Google's
  day's cap counts its calls too).
  `tools/preview.mjs --live` sends a page's calls through it. Reach for it
  before saying a source can't be read.
- **Real credentials never go in a local `.env` or a repo**; keys live as
  GitHub or Cloudflare secrets the owner adds. A secret that's only a
  random string of our own (ECO_TOKEN_SECRET) may be made and stored by
  Claude when the owner says so: generated straight into `gh secret set`,
  never printed or saved. Never commit anyone's pass, code or device code.
- **Only what must stay secret is a secret** (the owner, 2026-10-14: as few
  variables as possible). Anything public (the proxy's address, the
  Cloudflare account ID, ids, model names) lives in the code or a toml,
  never in a GitHub variable or secret. Each token keeps the least power
  its job needs (the deploy token and the guard's stay two). The list is
  README §11; the admin panel's 系統 shows which are set.
- **Quadra Passes are handed out by the owner**, never made in an app: the
  sign-in screen has no "create", and /eco `create` is closed
  (ECO_OPEN_SIGNUP only in tests). The owner issues them on the admin page
  (https://jaypengx.github.io/Shared-Proxy/admin/, `site/admin/`, with the
  admin key in their Desktop's "Quadra 管理金鑰.txt", the Worker's secret
  ECO_ADMIN_TOKEN) or with `tools/issue-passes.mjs`. **Claude never uses
  that key.** A one-off clean-up that needs a token is turned on for one
  run and off again in the next commit, each step logged.
- **No pass is stored on a device**: a refresh token and the account id;
  other devices sign in with a device code. A new pass is shown full
  screen and closes only once its last 5 characters are typed back.
- **Signing out wipes the device** (`wipeDevice`): every app's keys, the
  tab's storage and the kept data; only the language and the safe area
  stay.
- **Logs and captures that hold places** (home, school) stay in
  git-ignored folders (`Orbit-Transit/captures/`), never in a public repo.
  The 除錯紀錄 never holds the pass, a token or a key.
- **Billed routes are locked down**: a pass session, an origin check, a
  daily cap, and the owner's cost panel (§7).

## 6. The shared kit first

`Shared-Proxy/kit/` is the one place for what more than one app needs. The
family is large enough that a fix made in one app and not the others is a
bug waiting in the rest.

- **Before writing a helper, look in the kit** (`quadra.mjs`, `logos.mjs`,
  `photos.mjs`, `catalog.mjs`, `names.mjs`, `holidays.mjs`,
  `postseason.mjs`, `f1live.mjs`, `help.mjs`). When two apps do the same
  thing (a driver's face, a team's logo, a notice said once, a cached
  fetch, a session's state), it moves to the kit and both use it.
- **One frame for every app**: the kit's loading screen (`boot.js`), tab
  bar (`tabBar`), top right (`topActions`: help, refresh where data is
  live, the account), sheets, `ask` / `tell` dialogs (never the browser's
  `confirm` / `alert`), notices, haptics, the Pass sheet.
- **The kit is served, not copied**: Shared-Proxy's Pages serves `kit/`,
  each page loads it through `kit/loader.html`'s snippets, modules import
  `#kit/…`. A kit change is one push to Shared-Proxy; every app has it on
  its next open. `node kit/link.mjs` links the apps for their tests.
- **A new kit export is used through the module object**
  (`import * as kit …; kit.newThing?.(…)`) or the global, with a fallback.
  A phone can still be running an older kit (`quadra.kit`), and importing
  a name that the old kit lacks stops the whole app from loading.
- **Ids never change with a name**: storage keys, payload collections,
  cache names and the manifests' `id` stayed through every rebrand
  (`match`, `vocab`, `quadra-hub-…`).

## 7. Data, the layers, quotas and cost

**The layers.** Every read goes down these, stopping at the first that has
a good copy; Shared-Proxy's README has the details:

1. memory (this session);
2. the device's Cache Storage (`proxyJson`'s `persist`; a copy younger
   than its `ttl` is used without asking anyone);
3. the failure hold (a source that just failed isn't asked again by every
   part of a page);
4. the family's data in R2 (the proxy's `/data/`, read with `packJson`: a
   league's season, the bus timetables, photos, watch links,
   win-probability lines; built by the proxy's cron, `builders/`);
5. the data proxy's edge cache in Taiwan, by tier (live seconds, a finished
   game a day, tables half an hour);
6. R2's kept reads (a read over for good, kept the first time anyone reads
   it: a finished game, a day or month of them);
7. the upstream.

On top of them, **apps put live knowledge over slower copies** (§8).

- **A failed read is never "nothing there".** It is a failure: thrown,
  counted, retried, and never saved. Only a complete, successful read is
  kept on the device. This is the root of the "works fresh, broken
  installed" bugs (Sports' leagues hidden for 12 hours, a day saved without
  MLB, Play's players gone for a session). An empty reply that might mean
  offline is never taken as "nothing saved" (the welcome screen shown to
  someone with follows, 2026-10-07).
- **A failed read answers the copy the device has** (of any age) and is
  asked again soon; only with nothing kept is it a failure. An old copy is
  what's answered when a fresh read fails, not instead of reading.
- **Saved copies carry a version in their key** (`fx.day.v4`,
  `ot.trips.v1`). When their meaning changes, bump the key and remove the
  old one, so a phone holding a bad copy drops it. Tie a copy to its
  shape, not to the deploy: tying it to the deploy made every open after a
  new version a cold start.
- **Never save over a copy you can't read**, and never save an older copy
  over a newer one on the pass (pull first; the newer copy wins; a local
  change that lost is set aside, not thrown away). Data loss is the worst
  bug the family has had (2026-09-28): it's fixed first and gets a test.
- **Every per-app memory a home-screen app needs across apps lives on the
  pass** (wallet settings), not only in localStorage. Each installed app
  has storage of its own. The kit's `sayOnce` says a notice once for the
  whole pass.
- **What doesn't change in a day comes from the family's data**, never
  through the data proxy's sources: a league's season
  (`sports/<league>/<year>.json`, built at midnight Taiwan, read with the
  kit's `packJson`), the bus timetables and shapes, photos, watch links,
  win probability. It lives in R2 and is built by the proxy's own cron
  (`builders/`, each as often as its data changes and no more). The data
  proxy is for what's live. A 6 MB answer through a Worker is a bug: a few
  at once run it out of memory and every request on it fails together.
- **Read on demand** (the owner, 2026-10-13: "some can be read per user
  request"): what's over for good (a finished game's box score, a day or a
  month of games all over, a past Asian month) is never built ahead: the
  data proxy keeps it in R2 the first time anyone reads it and answers from
  there for good, the source asked once, ever. A new read that settles goes
  in `sports.js` `settleable` / `settledData`; a slow-changing one that
  doesn't is served from the edge cache by its tier. Nothing is prefetched
  that nobody opens.
- **Sports data: the family's data first.** Any new or changed sports read
  (a league's season, a finished game's box score or win probability line,
  last season's playoffs) is weighed against R2 before it goes to a
  source: a pack a builder makes (as `winprob/`), or a read kept on demand.
  Orbit Sports' leagues' seasons are kept whole (Quadra Play needs only the
  last days' results: it settles slips, kept on the phone for good): every
  game's and race's result (kept as it's read), its watch links, win
  probability, tables, and every player's and team's numbers, the regular
  season and the playoffs alike. A season is wiped, all of it at once, only
  when the next season has begun: a game of it played, its preseason's
  included (the owner's change, 2026-10-12: the gap between seasons is
  long), all but last season's playoff bracket and final tables, wiped when
  the new regular season begins. Next season's schedule is built from the
  day after this season's last possible day. Orbit Sports' date strips and
  📅 reach only the kept days to the season's last possible day
  (`sports/bounds.json`), so the proxy isn't asked for days with nothing
  kept. ELTA's season pages are found by their titles, nothing coded per
  year. A run that can't tell which season it is wipes nothing. Each build
  adds what's new on top of what's built, never reads a finished thing
  again, and reads only for the leagues each app shows.
- **Save the proxy, the APIs and the store's rows.** Use the kit's
  `proxyJson` (batched, cached in memory and on the device, failures held a
  minute). Read what's needed when it's needed. Keep built plans and boards
  on the phone and refresh only what's live (bus times, live scores). Poll
  only while it matters, and push from the Worker instead of polling.
- **Never a penny past Cloudflare's $5 plan** (the owner, 2026-10-13: on
  Workers Paid, "I don't want to pay a penny more"). Its included amounts a
  month: 10M requests, 30M CPU ms, KV 10M reads, 1M writes, 1M deletes,
  1M lists and 1 GB, Durable Objects 1M requests and 5 GB, R2 1M writes
  (Class A), 10M reads (Class B) and 10 GB, D1 25B rows read, 50M written
  and 5 GB, Workers Logs 20M events. Cloudflare has no spending cap, so `guard.js` (Worker
  `quota-guard`) reads the account's real use every five minutes and takes
  the proxy off the air at 90% of any of them until the next period;
  each toml caps an invocation's CPU (`[limits]`) and samples its logs
  (`head_sampling_rate`). A new Cloudflare product (R2, D1, Queues, …) is
  added to `guard.js`'s `PLAN` in the same change, or not used. Rate limits
  stay in memory, not KV (since the free-tier emails, 2026-10-07).
- **Stay on the free tiers elsewhere, and show the bill.** Google's monthly
  free calls with the Worker's own caps
  (past a cap: NLSC's map, OpenStreetMap's search, no Google plans), TDX's
  points. Every billed call shows in the admin page's cost panels (金流,
  容量, Google's bill at Google's prices, TDX by day). A new paid call is
  added there in the same change, with what it costs.
- **The live speeds are the owner's**: set in the admin panel's 開發 (the
  Worker's `GET /config`), followed by the proxy and every app. Never hard-
  code a faster refresh past them; 依人數自動調整 slows them together as the
  family grows.
- **An app left open is an app opened for hours.** An iPhone keeps a
  home-screen app alive in the background: anything read once per session
  (a team's schedule) is read again while the app is open, and the newest
  live copy of a thing (a game's score) wins over an older list's.
- **News that happens once is told once** (a game's final score, a price
  reached): the Worker remembers what it told, whatever an app that's
  behind schedules again.
- **Limits are each app's**, never shared by the family: Sports, Play and
  Securities share the data proxy, and one left open in the background
  never uses up another's minute (the kit says which app asks).
- **A Worker call has 10,000 fetches** (the $5 plan; 50 before), a batch's
  24 items all share them and six connections, and one
  item that throws is that item's failure, never the batch's. A slow item
  answers 504 at 3 s so it can't hold the others.
- **A burst never breaks the rest.** Read what a view needs, not every day
  of a season (a playoff bracket reads back a week at a time); an answer
  of "too many" is never asked again at once. Clicking through every view
  fast is normal use: `--live` prints the busiest minute of asks, and it
  must sit well under a session's limit (600).
- **No new Cron Triggers.** The ones added on 2026-10-13 were registered
  and never run (a fault Cloudflare's forums report that year). Work that
  runs on a clock goes on the proxy's two crons (the even and odd
  minutes, `worker.js scheduled`, by the minute) or a Durable Object's
  alarm (the guard's clock).
- **The Worker's CPU is small**: a 1 MB national list is never parsed on a
  request; a table built from it by a tool is committed instead
  (`weather-stations.js`).
- **One truth** (Weather, and the rule everywhere): an answer has one value
  for each thing and names no source. Sources are blended and weighed out
  of sight; a test fails if a source's name reaches the screen.
- **Real data over AI.** Every attempt to let a model score, rank or write
  for the product was replaced by rules on real data or removed (Match
  Find's Gemini scorer 2026-09-20/22, Sports' 最新動態 2026-10-09: "it's
  shit"). A model may help offline (Words' look-alike signals, Class's
  photo import), never decide what a person sees.
- **Never guess.** No made-up broadcast, time, side or score: a game's
  channel only when the schedule names that game, 待定 when its time isn't
  set, a dash when there's no live score yet (never a made-up 0), no logo
  address for a side not decided. A match the rules can't make exactly is
  left unmatched.
- **Live data is trusted only where it makes sense**: a bus's tracker counts
  only near a scheduled trip, and a thin prediction market counts only as
  far as it's traded and tells the options apart (a market's prices must
  add up to about one).
- **Sources change their words**: ELTA renamed its competitions in English,
  TDX's planner has its own mode codes, ESPN files players by their last
  competition. Matching is by rules that survive a rename (both sides'
  names, a league's code), and a source's quirks are learned from a live
  answer before they're coded.

## 8. Live, and right the moment it happens

- **A result counts the moment it's final**, everywhere at once: the
  standings, the title race, a team's page, a player's or driver's page,
  a constructor's (Sports' `liveTable`, `liveRacing`, `freshStandings`),
  "just like the Premier League". The official table catches up later; the
  app never waits for it, and never shows a note that it's behind.
- **The fastest true source wins**: F1's own live timing over ESPN's copy
  (a session over at the flag, started when F1 says), MLB's postseason
  list over ESPN's If Necessary games, a live scoreboard's newer copy of a
  game over a team's older schedule. A game over is never shown "on".
- **One rule for a state, shared by every view**: a session's state, a
  game on air, a race's points belong to one function, so the home card,
  the sheet and the tables can't disagree (`sessionStatus`, `onAir`).
- **A past page shows its own moment**: an older race's 數據 is that race's,
  never today's points on top of it.
- **Settle exactly or not at all**: Play settles only markets the result
  says exactly (90 minutes for soccer; a player who didn't play is void),
  and a bet's game is found by id, or by league and start with names that
  match, never a guess.
- **No back end on the screen**: no 「官方…尚未更新」, no source names, no
  "simulated", no "data from …". The app works without the person knowing
  how (2026-10-12).

## 9. Opening fast, and never moving

- **Open on what the device already has**, then refresh behind it. A list
  the first screen depends on (Sports' TV lists, Play's board, Transit's
  plans, Weather's forecast) is kept on the device and drawn from at once.
- **A new deploy is in place at once, whatever the person is doing**
  (2026-10-08): no waiting for a sheet to close, typing to end, or a second
  launch. The kit starts watching as it loads (boot.js checks the app's and
  the kit's version.json together on open, one reload for both; then every
  15 s, on coming back, focus and online), keeps the scroll and tab across
  the reload, and tries again within seconds when the CDN is behind. Every
  app needs a `build-version` meta, a `version.json` per deploy, and a
  service worker that never keeps version.json. No pop-up about an update,
  ever.
- **The loading screen lifts once, onto the finished first screen.**
  Nothing reshuffles, pops in or jumps right after it. If the fresh data
  isn't there within a few seconds (Play 2 s on a saved board), open on
  the saved copy and swap values in place, without reordering what's in
  view. Its line follows real progress; it says nothing else.
- **Nothing waits on what it doesn't need**: a read starts while the
  sign-in is on its way (the kit makes it wait for that sign-in, not a
  second one), a place's name is asked with its forecast, not before it,
  a module the first screen needs is fetched with the first files, not
  found a round trip later.
- **Work done once**: what the phone computes from data (Play's prices,
  Transit's plans) is kept by its inputs and never redone on a redraw; a
  redraw changes only what changed (`morph`), never the whole page every
  few seconds.
- **Location fast**: a quick Wi-Fi or cell fix first, GPS behind it; the
  phone is asked unprompted once, never at every open (the kit's
  `mayLocate`, Weather's and Transit's rule; asking again at each opening
  once allowed put iOS's prompt at every launch, 2026-10-16). A phone that
  lets it be read without asking gives the fresh fix at each opening;
  Transit's map opens on it and follows you (2026-10-15).
- No flash, blink or broken-picture icon on a redraw. Strips keep their
  scroll, and pictures seen before are drawn at once (kept decoded and
  remembered; a new one fades in; a failed one tried again, hidden
  meanwhile). A redraw moves the pictures on screen into the new layout
  instead of making new ones.
- **A live block keeps its shape**: drawn at once from the last reading,
  new numbers faded in as they replace the old, never a spinner where a
  number was.

- **No connection, or a slow one: never stuck, never misleading**
  (2026-10-15, the owner: "some deserve working offline but with certain
  features locked … some should be banned working offline, like
  Securities, Play, Transit"). An app whose screens are all live
  (Securities, Play, Transit, Sports) is covered with no connection (the
  kit's `onlineOnly`: 沒有網路連線, why, 重試), never shown on old prices,
  odds, buses or scores. Words, Weather and Class open on what they kept,
  with what needs the network locked; what's done offline is kept on the
  phone and merged when it's back, never written over a newer copy. A slow
  connection covers nothing: the app opens on the phone's copy and the
  kit's capsule says 網路連線很慢. Every app opens offline as far as its
  cover (`keepOffline`; its worker gives the network 2.5 s, then its copy).

## 10. iPhone Safari is the platform

- Installed apps only: on a phone, every app shows the kit's add-to-home-
  screen screen in Safari (`installGate`). Orbit Class is phone only (a QR
  code on a computer).
- **No text wraps onto a second row that wasn't designed for one.** No
  half-cut words, no label falling under its number. Shorten the words,
  shrink the number (`fitNumbers`), or use one line with an ellipsis, in
  that order.
- **An ellipsis or a clipped edge counts as a wrap** (the owner,
  2026-10-11: "H. Çalha…", "常看 · 洛杉磯…", a misspelling cut mid-word,
  "中信兄弟 / 統一獅" falling to a second row). A name, a score, a
  misspelling or anything the row is *for* is shown whole: lay the row out
  for its longest real content (two lines designed in, a smaller line, the
  less useful part dropped, a short team name where a logo sits beside
  it), never let it run out and get cut. An ellipsis is only for a
  free-text tail nobody needs (a headline, a note).
- **Design it once, check it once.** Every new or changed piece of UI is
  checked at 375 px wide with the longest real data the feed gives (the
  longest player name, a Chinese team name, a two-digit score, both
  locales) before it's called done, so no fix needs a second request. Use
  judgement on what a row is for and what a native iOS app would show;
  don't add a header, pill or line that says nothing (a "排位 最終成績"
  bar over the results it names).
- **Nothing wider than the screen**, no sideways panning of the page. The
  preview tool flags any element that is.
- **Upright only** (2026-10-10). Every screen is drawn for a phone held
  upright: the manifests say `orientation: portrait`, and since iOS can't
  lock a web app, the kit turns the page back against a phone on its side
  (`html[data-q-turn]`, quadra.mjs uprightTurn): it stays upright on the
  glass, as a portrait-only app does. Sheets and alerts (the top layer)
  are turned with it. A tablet turns as it likes; an iPad gets a phone's
  frame.
- Respect the safe areas. Nothing sits under the status bar or the home
  indicator, and nothing is hidden behind frosted glass.
- **The top edge stays sharp on iPhone (iOS 26's edge blur).** The kit
  adds a solid fixed strip under the status bar (.q-statusbar) to every
  app that loads quadra.mjs; iOS skips its blur only when a hit test at
  the top centre lands in a fixed, full-width box with a background. So
  never give that strip (or anything an app puts there) pointer-events:
  none, never remove it, and pad the page's top with var(--q-top). A new
  app gets this for free by loading the kit. The status bar style is
  `default` (an app that follows light and dark, a theme-color for each)
  or `black` (a dark app), never `black-translucent`: a page under a
  see-through status bar is what iOS blurs (Orbit Class had it until
  2026-10-06). Not even a map: Transit tried `black-translucent` for its
  map on 2026-10-07, and iOS blurred the map's top with a clear strip, a
  half-clear one, and even under a solid one (a band below it). Transit
  stays `black`, its strip solid black on the map tab too (the owner's
  choice over the map's grey), and the map starts sharp right under it.
  iOS reads the status bar style when the app is added: a phone sees a
  change of it only after removing the app and adding it again.
- **One colour from the top of the screen down.** The phone paints its
  status bar above the page (black, or the theme colour), so the theme
  colour, the manifest's colours and the strip are the page's own
  (#000000 dark, #f2f2f7 light, the kit's --q-page); the kit keeps the
  theme colour equal to the strip as the app runs. A different shade is a
  black band with a seam under it (2026-10-07).
- **Safari's own quirks are the kit's job**: sheets sized by `dvh` (vh is
  the screen without Safari's toolbar), no `navigator.vibrate` (a chime,
  or the kit's haptic from a hidden switch), Touch Events for swipes, a
  DOM change deferred off a touch handler's stack, huge SVGs replaced by
  rows of small elements (Safari dropped parts while scrolling), a
  scrolling grid squeezing a clipped item (a plain column instead), sound
  through Web Audio's ambient session (music keeps playing; nothing on the
  Dynamic Island), a field never rebuilt while it's typed in.
- **Touch like iOS**: no double-tap or two-finger zoom, no text selection
  or Safari menu on a long press, no focus ring after a tap (keyboard
  only), pressed only when pressed (after 90 ms or on a quick tap, never
  while scrolling), sheets that swipe down from anywhere on them.

## 11. Words, pictures and the look

- **Chinese (Traditional, Taiwan) first**, in the words Taiwanese users
  use; English second, and both are checked. Everything is in Chinese:
  statuses, positions, injuries, rounds, a pitch (never "Strike" read as a
  labour strike: fixed words are set before anything is translated), °C,
  metric heights and weights, dates as Taiwan writes them.
- **Teams in Chinese, people in their own names**: clubs by the kit's
  `names.mjs` (city + nickname for the American leagues, the nickname
  where a row has room), the English kept in `en` for ids and matching.
  Players of every sport in English, F1's drivers too (2026-10-08); F1's
  teams in Chinese (賓士).
- **Less text.** Several rounds were only "leaner copy": no section
  subtitles, no instructions (「點一下看圖」), no hints for what's obvious,
  dialogs in one short sentence, no "Next steps", no long explanatory
  lines. A spinner without 「載入中」. When in doubt, take the words out.
- **Notices**: the title is the news with its number (台積電 漲到 1,100 了,
  道奇 vs 費城人 開賽, a final score that says who won), the line under it
  what it means or where it's on; no emoji in front; a class alone in the
  title (iOS gives a web app's title one line).
- **Pictures for everything that has one**: a person's face, a team's
  logo, a league's mark, a country's flag, a company's logo. Studio photos
  only (the league's own first, then ESPN's, then TheSportsDB's cutouts),
  never Wikipedia's, a match photo or a tight crop; the same face in every
  place a person shows (the kit's `personPhoto`). Logos are the official
  current ones, checked by eye. Initials are only a stand-in until the
  picture comes.
- **Emoji only as standalone icons**, never in titles or chips; no ✓ or ★
  in chips, no sport emoji over lists. Weather draws its own pictures (a
  test fails if an emoji reaches the page).
- **Every app looks and moves like a native iOS 27 app, from the kit**
  (the owner, 2026-10-14: "super iOS/Safari (iOS 27)… scrap everything if
  necessary… the UI kit used in all repos, not custom UI unless it's truly
  custom"). The kit (`quadra.css`, `ui.mjs`) is the one design system:
  iOS's system colours and semantic greys (grouped page, cells; black and
  #1c1c1e in the dark), Liquid Glass on whatever floats (the tab bar and its
  accessory, the top buttons in one capsule, alerts, menus, banners,
  toasts), San Francisco's text styles, capsule buttons and chips, a
  segmented control whose thumb slides, iOS 26's switch, the search
  capsule, inset-grouped lists, sheets floating inside the screen's edges
  with deep corners and a centred title, and SwiftUI's springs for every
  movement. An app uses these and draws its own only for what is truly its
  own (a pitch, a map, a chart, a ticket); never a copy of a control the
  kit has. Glass is Apple's, checked against the real thing (the iOS 27
  simulator on the owner's Mac), never generic glassmorphism.
- One look across the family: dark where the app is dark (Weather and
  Transit), Orbit Class's and Passion Beats' pages on the kit's tokens too.
  The loading screen is plain (the page's colour, the app's mark), never a
  gradient.
- **Numbers read like a broker's or a sportsbook's**: NT$ with separators,
  prices without cents from 1,000 up, two decimals where Taiwan's quotes
  have them, a percentage chip beside its number, one red for a loss.
- **Each tile a pair**: a stat tile never alone on a row, tiles even.
- One CSS class name, one meaning. A component's class is never reused as
  another's modifier (`.podium` the list stretched `.pos-pill.podium`).

## 12. What the products are, and aren't

- **Two families.** Quadra is where the money is (Securities, Play, the
  Pass). Orbit is the everyday tools (Class, Weather, Transit, Sports,
  Words), each a related add-on: no betting, no money moved.
- **Each app answers its own questions**, one per tab (Sports, 2026-10-08:
  首頁 what to watch, 賽事 a league, 轉播 when and where, 追蹤 how they're
  doing). A thing shown in five places is shown in the one that answers it.
- **Only what's real for a person in Taiwan**: Sports lists only what
  ELTA.tv and Apple TV carry, recommends only games on TV here at hours
  people are awake (05:00 to midnight; in the small hours every game of
  their own leagues, and a big one of any, among the others, 2026-10-15);
  Play sells what Taiwan can watch; Transit is Taiwan's (its map stays
  around Taiwan); Securities' rules are Taiwan's brokers'.
- **Like the real thing, not a teaching tool**: Play is a plain sportsbook
  (prices and the slip; no analysis tags), its lottery Taiwan Lottery's own
  tables; Securities is a broker (margin calls at 130%, 融券's deposit, 定存
  at Bank of Taiwan's rates, the 10% and 2.11% taxes); no "simulated" or
  "practice" wording anywhere.
- **Prune whole.** A sport, league, feature or screen that goes is deleted
  from the catalogue, every app, the proxy, the packs, the tests and the
  help, with no `off` flag. Open bets on it are void; data still stored on
  passes keeps its reader.
- **Automatic over buttons**: no update, clear-data, export or "check for
  updates" buttons, no language switcher (the device's language), no
  manual sync. If the app can do it, it does.
- **Every purchase asks first** (the kit's `ask`), saying what it costs and
  the most it pays; it's bought at the price shown, and a price that moved
  stops it and says so.
- **No dark patterns.** Cancelling Plus stays under 管理會員 in one
  confirmation that says what stays and stops; every charge is announced
  before it's made; no fake promotions, idle-money nags or upsells
  (removed 2026-09-29 for a "simple and premium" look).

## 13. Quadra's money

- **Play money with a real economy.** A pass opens with NT$30,000; the only
  other money Quadra gives is NT$6,000 pay on the 1st of every month
  (a salary, missed months paid on return) and one-time level rewards.
  Everything else must earn the house money on its own.
- **The model decides**: `node tools/economy.mjs` runs each kind of person
  (casual, regular bettor, high roller, investor, heavy bettor, words
  only) over a year; any change to a price, a perk, a cut or a payout is
  run there first and its numbers go in the commit. A regular
  bettor stays about level; nobody but the market makes an account richer
  for free.
- **The house never loses on its own prices**: the cuts are what Taiwan
  Sports Lottery and Taiwan Lottery take (measured, per kind of market);
  a runaway favourite is locked rather than priced too short; cash out is
  priced from the fair chance, never giving the margin back; free bets and
  promotions stay under 30% of the take, as real sportsbooks spend.
- **Securities earns like a broker** (about 0.3% of turnover), Play like a
  sportsbook (5–15% of stakes); that difference is realistic and stays.
- **Quadra Plus** (NT$490 a month, NT$4,900 a year) for Play and Securities
  only, worth more than its fee to a member who uses it; billed like a real
  subscription (every month, opened or not; a charge the balance can't
  cover lapses it; no refunds; 5% VAT included).
- **Money is exact across apps**: one pool, Securities' borrowed money never
  spendable in Play, nothing counted twice; a double count in the owner's
  own account (2026-10-01) was fixed and the refund left to them.
- **Impossible to exploit** (the owner, 2026-10-14). Only the proxy adds
  money, and only on its own terms: a bet settles on the house's own bet as
  priced (never the terms a phone sent), a live bet is priced again after a
  delay, a Securities fill counts only as the proxy issued it (its order's
  terms and moment as first seen, once), anything found on a phone counts at
  the worst figure the market allows since its moment, a phone's dates and
  figures never add money (entries dated by the Worker; Securities' cash,
  cost and opening money the Worker's), and money owed (loans, short sales)
  never reaches the pool. Every hole closed gets a test that tries it.

## 14. Each app's yardsticks

- **Transit: how the owner really travels.** Every real choice is shown
  (no plan hidden because another dominates it on paper), one card per
  route with its departures as times to pick, official names, times and
  live data first. A plan costs what it costs a person, in minutes: door
  to door in full, the wait at home a third while short and lost time past
  15 minutes; changes onto a train easy, onto a bus a gamble, a bus to a
  bus barely a plan (Taiwan's buses don't keep their times); walking past
  5 minutes slow; YouBike as a gap-filler (10 minutes nothing, 18 a
  workout, past that every minute 4.5×; two short rides beat one long one);
  the bridge a ride takes over 頭前溪; never racing your own train to the
  next station; what it costs after TPASS. Navigation resumes after the
  app is swiped away and tells the lock screen. It never takes the app
  over: the tabs stay, it shrinks to a bar to do something else, and the
  trip can change on the way (another stop to get off at, a new plan from
  here, another place). The map never pulls you back once a finger has
  moved it.
- **Sports: what a viewer in Taiwan would watch.** A followed league is
  never hidden by a failed read; picks are games on TV here, at hours
  people are awake, a close game late on rising; ELTA's MAX channel (no
  ads) first; results count at once (§8); the title line says the lead it
  takes at the soonest clinch, never "points still to win"; a table's
  zones stay with their places as results reorder it.
- **Play: the house never loses on its own prices.** The odds are its own
  estimates first, Kambi's prices the base and DraftKings the cross-check
  (a game they disagree on is held); markets count as far as they can be
  trusted and settled exactly; the board opens on the saved one at once.
- **Securities: a Taiwan broker.** Every market's own rules (lots, ticks,
  limits, lunch breaks, settlement dates), orders filled at a fresh price,
  official logos for every symbol.
- **Weather: one number means one thing everywhere**: the line, the graph
  and the 10-day row read the same hours. One truth, no sources named, an
  old forecast never read as now (faded, 更新中, hidden past 6 hours), the
  place to the township, the forecast on screen as fast as the phone can
  say where it is.
- **Class: the class now and what comes next**, at a glance, the pass the
  only save, Taiwan's holidays without classes or notices.
- **Words: catch what a person doesn't know, fast**, and spend no time on
  what they do; the memory model fits the person; recorded voices, never
  the device's when a recording exists.

## 15. The owner's calls, by date

What was decided, so it isn't undone. Newer calls win.

- 2026-09-19/22: Match Find's Gemini scoring out; recommendations from
  real data only.
- 2026-09-23: Words follows the device's language (no switcher).
- 2026-09-25: emoji only as standalone icons.
- 2026-09-28: push every change to `main`; Orbit Class joins the Pass, phone
  only.
- 2026-09-29: Quadra simple and premium: nags, fake promotions and upsells
  removed; no betting outside Play (Rewards' staked games removed).
- 2026-10-01: Rewards' games removed, then Rewards became Words (only
  words); Sports an independent add-on with every Play feature gone; only
  what Taiwan can watch (F2, F3, Formula E, MotoGP and the rest purged);
  ELTA's other sports added and taken out again; a fixed NT$6,000 pay;
  sign-out wipes the device.
- 2026-10-02: Weather a Quadra app (the pass required).
- 2026-10-03: the rebrand (Quadra and Orbit; Sports and Words renamed;
  ids unchanged); Transit shows every plan.
- 2026-10-05: passes handed out by the owner only; Class on solid
  surfaces, the kit's frame.
- 2026-10-07: Transit's status bar black on the map tab too; rate limits
  off KV.
- 2026-10-08: one question per Sports tab (轉播, 追蹤); F1 drivers in English.
- 2026-10-09: no news and no Gemini in Sports (最新動態 removed: "it's
  shit"); the injury report on team pages only, a player's page keeps only
  its 🩹 tag.
- 2026-10-10: upright only; Taiwan's holidays in Class, Weather and
  Transit; no warning banner in Weather.
- 2026-10-11: an ellipsis is a wrap, design once; tennis and UFC removed
  from Play; Play's edit-slip removed; Weather asks for the position
  unprompted once.
- 2026-10-12: results count at once on every page with a table; no back
  end notes on screen; the READMEs document every feature; the apps open
  faster (Weather's location first, Sports' TV lists kept, Play's prices
  computed once); Shared-Data keeps Orbit Sports' leagues' whole season (every result, box
  score, link and number, the playoffs too) until the next season's first
  game (preseason included, changed the same evening), then wipes it whole; its builds add on top of what's built.
  Quadra Play's slips are settled on the proxy (the Worker reads a game
  once when it should be over, for every slip on it, pays the wallet and
  sends the real notice); live stats are separate, read by the phone only
  while shown.
  The money is the proxy's to add (later the same day): the phone prices
  Play's board, the Worker checks every bet's price and is the only one
  paying anything into the pass (bets, cash out, lottery, scratch cards);
  Securities' orders are filled and its cash counted by the Worker. Pricing
  the whole board on the proxy was measured and dropped (the free plan's
  10 ms a call; no paid plan).
- 2026-10-13: Transit's YouBike is planned by place, except where a trip
  starts with the bike: never at a station with no bike as you plan (a bike
  later on, and where it goes back, stay by place; a full one is a tap,
  navigating). Walking distances to YouBike and on a trip are the streets',
  not the straight line's.
  Walking is planned at 5 km/h (83 m a minute, Google's pace; was 4.5).
  One walk says the same everywhere it's shown (the strip, a card, the
  walk itself, a trip), and it's Google's (OpenStreetMap misses lanes).
  The loading screen lifts only onto everything ready (Transit's map: the
  tiles, what's in view, the strip in its order), and opening may not get
  slower for it.
  Cloudflare on Workers Paid ($5 a month), never a penny more: the guard
  (`guard.js`) stops the proxy before any included amount runs out,
  until the next period. One proxy for everything (the owner, the same
  day): the data proxy is a route of `orbit-workers-proxy` (`sports.js`),
  with the rest; `sports-proxy`'s address forwarded to it until every
  phone had the new kit (retired 2026-10-20). Everything on Cloudflare while the
  plan is paid, and ultra efficient (the owner, the same day): Shared-Data
  moved into R2 (copied as built, no source read again) and its builders
  into the proxy's cron (`builders/`), each lean (only what's new, only as
  often as it changes, written only when it changed); the nightly mirror
  replaced by reading on demand; Shared-Data retired (archived). Firebase
  moves to Cloudflare next (D1), then is abandoned.
- 2026-10-14: the Pass's store is D1 alone (`doc-store.js`); Firestore
  copied, compared clean, backed up into R2 (`private/`), and its code and
  secrets removed. The owner deletes the Firebase project.
- 2026-10-14: Securities' orders filled by the proxy at its own quote, as
  Play's bets are placed and settled there (`stock-fill.js`).
- 2026-10-14: the month is paced, not only stopped ("pace it out
  greatly"): the guard projects each count and slows the live refreshes,
  parks the builders and trims each session's reads from 60% projected
  (`guard.js`, `pace.js`); the owner's phone is told at 50/75/90%, at a new
  pace and at a stop (`ops.js`, the account set in the admin panel); every
  cron job leaves a heartbeat the admin panel's 系統 shows. Public settings
  out of secrets and variables (the account ID, the proxy's address).
- 2026-10-14: Quadra's money impossible to exploit (§13): every hole a phone
  could use to mint money closed and tested (Securities' fills, exchanges,
  interest, dividends, splits, loans and short sales; Play's picks, live
  bets and the pre-lock hand-overs; the wallet's dates and figures).
- 2026-10-14: minimal docs (§2): a README and `CLAUDE.md` per repo; in
  Shared-Proxy this file, `docs/HANDOFF.md` (the state now) and
  `docs/OWNER-STEPS.md`; the history is the git log. The plans that were
  built (Cloudflare, Weather) and the old handoffs folded in and deleted.
- 2026-10-14: iOS 27 for every app (§11): the kit rebuilt as one design
  system (tokens, glass, springs, controls, `kit/ui.mjs`) and every app's
  own copies of its controls replaced by the kit's.
- 2026-10-15: Orbit Class's style panel (presets, a custom colour, style
  slots) deleted; Class has one look. Its tabs one question each: 今天,
  課表 (any day in either week, 調課), 工具 (the week, AI, 分享).
- 2026-10-15: online and offline (§9): Securities, Play, Transit and
  Sports need the connection (covered without it); Words, Weather and
  Class work offline with the network's parts locked; Passion Beats opens
  offline. A slow connection opens on the phone's copy with the capsule.
- 2026-10-16: a Transit trip to be somewhere by a time nothing reaches any
  more (07:21 for 上學 by 08:00) is planned from where you are, leaving now,
  each way saying how late; never the way leaving latest (it had put a
  16:20 ride and train first).
- 2026-10-16: Transit never asks for the location at launch on a phone
  that would prompt (it asked at every launch and update); YouBike's counts
  read again every 30 s on the map (strip, stations, card), a launch drawn
  at once from the counts kept on the phone.
- 2026-10-15: Transit's map opens on where you are and follows you, as a
  phone's own maps do (it had stayed where it was left: iOS wasn't asked
  again after the first opening), until a finger moves it; back after 5
  minutes away counts as an opening.
- 2026-10-15: Transit times a YouBike rental when you say you took one
  (a station's card), and with TPASS's free half hour warns at 25 minutes
  and offers, optional, the stations near you to return it at and take
  another.
- 2026-10-15: a Transit trip with stops is planned and shown whole (each
  way to the last place, through every stop), not as the way to the first
  stop alone; with one more way: one YouBike kept the whole trip (parked
  at each stop, returned only near the last), and it's the recommendation
  unless a stop is far (a ride over 20 minutes) or walking it all is
  sooner: buses between stops are poor, the bike works best overall.
  With TPASS's free half hour it's still kept through stops (never
  returned at each: some are very close), and changed at a dock by a stop
  only before a ride would take the rental past 30 minutes, the stays
  counted.
- 2026-10-15: Transit lists a train (or a bus) and then a ride over 頭前溪
  as a choice when it gets there 5 minutes sooner than the recommended ways
  like it (竹東高中 → 成功九街: the train to 竹中 and a ride home); one by
  train and one by bus at most, under the recommendations, never one.
- 2026-10-14: a game is over the moment the rules say so (Sports
  `overByRule`: an NBA 4th over with the scores apart, MLB's home side
  ahead in the middle of the 9th…), not when ESPN marks it minutes later;
  比賽資訊 says when it ended.
