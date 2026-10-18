# The rulebook

How to work on the Quadra and Orbit apps. Every repo's `CLAUDE.md` points
here. These are strong defaults, not laws: weigh each against speed and
use judgement. When a rule gets in the way of a clearly better result,
break it and say so in a line.

## 1. The owner

- **One person owns the whole family** and decides what the products are.
  They judge the apps on their iPhone (home-screen apps, Safari's engine)
  and send lists, screenshots and 除錯紀錄 copied from the Pass sheet.
- **They don't read code.** Talk in plain words and screenshots. They
  understand the structure when it's explained, and want to learn the
  shape of the system over time: when a change touches structure, say
  what moved and why in a sentence.
- **What they value, in order:** speed of delivery, clean code, efficiency
  (fast apps, little work done twice), low cost, and reuse (one piece of
  logic, used everywhere).
- **Other people use the apps too**, so polish matters for strangers.
- They live in 新竹; every app works for all of Taiwan.
- They're on the Max plan: spend tokens to go faster (parallel tool
  calls, whole files read at once), never to pad.

## 2. How to work

- **Fast.** The smallest correct change, no exploring beyond what's
  needed, small fixes batched into one push per app.
- **Finish everything.** Every item on the list, the same fault anywhere
  else it lives, and any doc that the change made wrong, in the same
  round. Don't stop to offer options; ask only when a choice is truly
  the owner's.
- **Decide, then tell.** You may add, cut or redesign a feature when it's
  clearly better. Say what you decided in one line so they can reverse it.
  Fewer apps is fine if merging or retiring one simplifies the family.
- **Refactor freely.** Merge duplicates, move shared logic into the kit,
  delete dead code, rename and split files whenever it makes things
  cleaner, as long as the tests pass. No need to ask.
- **Find the real cause.** Say why it broke in a sentence before fixing
  it. Fix the rule, not the case: no hard-coded exception for the place
  the owner tested.
- **Prune whole.** What goes is deleted everywhere (code, tests, help,
  proxy, data). No `off` flags, nothing kept "in case".

## 3. Shipping

- **`npm test`, then push straight to `main`** (`git push origin
  HEAD:main`). `main` deploys: GitHub Pages for the apps and the kit,
  Cloudflare for the Workers. No PRs.
- **Check what a person would see:** if the change is visible, one 375 px
  screenshot with real data (`node Shared-Proxy/tools/preview.mjs <app>
  --live --width 375`). Fix anything it reports under `wraps:`, `cut:` or
  `scrolls sideways:`. Heavier modes (`--webkit`, `--reopen`, `--flaky`,
  the iOS Simulator) only when the bug is about them.
- **Tests for logic only:** money, data, ranking, planning and settling,
  where a bug is silent. None for layout or wording.
- **Commits:** one plain line of what a person sees, numbers when there
  are numbers.
- **Replies:** a few lines. What changed, what they'll notice, any product
  call you made, anything not checked.

## 4. Code structure

- **Kit by default.** Anything two apps use lives in `Shared-Proxy/kit/`.
  Move duplicates there whenever you see them. The kit is served, not
  copied: apps load it from Shared-Proxy's Pages (`#kit/…`), and
  `node kit/link.mjs` links it for tests.
- **A new kit export is used with a fallback** (`kit.newThing?.(…)`):
  a phone may still run an older kit, and importing a missing name stops
  the whole app.
- **One rule, one function**, used by every view that shows it (Sports'
  `onAir`, `sessionStatus`), so screens can't disagree.
- **UI from the kit** (`quadra.css`, `ui.mjs`: tab bar, sheets, segmented,
  lists, toasts, `ask` / `tell`). Draw your own only for what is truly the
  app's (a pitch, a map, a chart).
- **Ids never change with a name**: storage keys, cache names and the
  manifests' `id` survive renames.
- **Saved data:** a failed read is a failure, never "nothing there", and
  is never saved. Saved copies carry a version in their key (`fx.day.v4`);
  bump it when the meaning changes. Never save an older copy over a newer
  one.

## 5. Data, cost and safety

- **Cheap by design.** Cloudflare's $5 Workers plan and free tiers
  elsewhere. `guard.js` watches every Cloudflare count; a new Cloudflare
  product goes into its `PLAN`. A new paid call shows in the admin page's
  cost panels.
- **Read on demand.** Nothing is prefetched that nobody opens. What
  doesn't change in a day comes from R2 (built by the proxy's cron,
  `builders/`); the data proxy is for what's live. The layers are in
  Shared-Proxy's README §2.
- **Use the existing crons** (the proxy's even and odd minutes, or a
  Durable Object alarm). New Cron Triggers registered in October 2026
  never ran.
- **Test against real data through the dev door,** not by signing in: the
  deployed Workers answer `Origin: http://localhost:<port>` with no pass
  (`tools/preview.mjs --live`).
- **Secrets** live only as GitHub or Cloudflare secrets, never in a repo.
  Passes are issued by the owner.
- **Quadra's money:** only the proxy adds money, on its own terms. A price,
  perk or payout change runs through `node tools/economy.mjs` first.
  Close any exploit with a test that tries it.

## 6. Product principles

- **Chinese (Traditional, Taiwan) first**, in Taiwan's words; English
  second. Teams in Chinese (`kit/names.mjs`), people in their own names.
- **Native iOS look from the kit**, for a phone held upright at 375 px.
  No unplanned wrap, ellipsis or clipped edge on anything a row is *for*
  (a name, a score): lay it out for its longest real content. Nothing
  wider than the screen. Respect the safe areas.
- **Real data, no guessing.** A dash, not a made-up 0; 待定 when a time
  isn't set. Rules on real data decide what people see, not AI.
- **Taiwan-real.** Only what's real for a person in Taiwan: TV it can
  watch, its brokers' rules, its buses and trains.
- **Opens fast, never jumps.** Open on what the phone has and refresh
  behind it. The loading screen lifts once onto a finished screen, and
  nothing pops in after it. Live numbers fade in place. Live apps
  (Securities, Play, Transit, Sports) cover themselves offline; the rest
  open on what they kept.
- **Less text.** No hints for what's obvious, no source names or back-end
  notes on screen. Automatic over buttons. Pictures for everything that
  has one (faces, logos, flags). Emoji only as standalone icons.
- **One question per tab.**

## 7. The repos

| Repo | What |
| --- | --- |
| Shared-Proxy | The kit, the Workers (proxy, Pass, push, guard), R2 builders, tools |
| Orbit-Sports | What to watch in Taiwan: leagues, games, TV |
| Orbit-Transit | Taiwan trips: bus, train, YouBike, live navigation |
| Orbit-Weather | One forecast to the township |
| Orbit-Class | The class now and next; the timetable |
| Orbit-Words | Vocabulary that catches what you don't know |
| Orbit-Beats | Beats from your own drum kit |
| Orbit-Slips | 台灣運彩 tickets tracked from a photo (no Pass) |
| Quadra-Play | A Taiwan sportsbook and lottery, on play money |
| Quadra-Securities | A Taiwan broker, on play money |

Folder-Link is a separate Windows tool with its own notes.

## 8. Docs

- **This file**, each repo's `CLAUDE.md` (a pointer here plus what's
  special to that repo), and each repo's README: a short map with what the
  app is, where the code is, how to run and test it, and the decisions
  still in force.
- Update a doc only when the change made it wrong. No handoffs, plans or
  logs: the git log is the history.
