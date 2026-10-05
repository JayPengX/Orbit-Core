# The truth: how every Quadra and Orbit app is built

The owner's standing rules for the whole family: Quadra (Play, Securities,
the Pass) and Orbit (Class, Weather, Transit, Sports, Words). Every repo's
`CLAUDE.md` points here. When a change would break one of these, the change
is wrong, not the rule. When the owner adds a rule, it goes here.

## 1. Working

- **Push validated changes straight to `main`** (`git push origin HEAD:main`).
  `main` deploys: GitHub Pages for the apps, Cloudflare for the Workers.
- **Run `npm test` first; push only if it passes.** Orbit Class also runs
  `npx eslint .`. A fix comes with a test that would have caught it.
- **Test like the owner uses the apps**, not only a fresh page:
  - on WebKit (`--webkit`), at iPhone size;
  - **as an installed app that is being updated** (`tools/preview.mjs
    --upgrade <date>`): the old version's storage, the new version's code;
  - **on a poor connection** (`--flaky 0.5`), then reopened (`--reopen`):
    whatever a failed read left on the phone shows on the second open;
  - **for movement after the loading screen** (`--shuffle`).
- **Be efficient.** Do the work; skip the narration. Batch small fixes
  into one push per app.
- **Rules are general, never special cases.** "Smart" means a rule that
  explains the case (a river crossing, a station's own train, a market's
  liquidity), not a hard-coded exception for the place the owner tested.
  When one destination exposes a flaw, test many random trips (Transit's
  batch harness), not just that one.
- The owner tests on their iPhone and sends lists. If they mention an
  attachment that isn't there, ask before starting.

## 2. Security and privacy

- Never sign in to the live services with a pass, token or key, even one
  handed over, and never create accounts. Localhost dev doors in the Worker
  (TRANSIT_DEV and the like) are the way to test against real data.
- Real credentials never go in a local `.env` or a repo; keys live as
  GitHub or Cloudflare secrets the owner adds. A secret that's only a
  random string of our own (ECO_TOKEN_SECRET) may be made and stored by
  Claude when the owner says so: generated straight into `gh secret set`,
  never printed or saved.
- Logs and captures that hold places (home, school) stay in git-ignored
  folders (`Orbit-Transit/captures/`), never in a public repo.

## 3. The shared kit first

`Shared-Proxy/kit/` is the one place for what more than one app needs. The
family is large enough that a fix made in one app and not the others is a
bug waiting in the rest.

- Before writing a helper, look in the kit (`quadra.mjs`, `logos.mjs`,
  `photos.mjs`, `catalog.mjs`, `names.mjs`). When two apps do the same
  thing (a driver's face, a team's logo, a notice said once, a cached
  fetch), it moves to the kit and both use it.
- **A new kit export is used through the module object**
  (`import * as kit …; kit.newThing?.(…)`) or the global, with a fallback.
  A phone can still be running an older kit (`quadra.kit`), and importing a
  name that the old kit lacks stops the whole app from loading.
- Kit changes are one push to Shared-Proxy. Every app picks them up on its
  next open.

## 4. Data, caching and quotas

- **A failed read is never "nothing there".** It is a failure: thrown,
  counted, retried, and never saved. Only a complete, successful read is
  kept on the device. This is the root of the "works fresh, broken
  installed" bugs (Sports' leagues hidden for 12 hours, a day saved without
  MLB, Play's players gone for a session).
- **Saved copies carry a version in their key** (`fx.day.v4`,
  `ot.trips.v1`). When their meaning changes, bump the key and remove the
  old one, so a phone holding a bad copy drops it.
- **Every per-app memory a home-screen app needs across apps lives on the
  pass** (wallet settings), not only in localStorage. Each installed app has
  storage of its own. The kit's `sayOnce` says a notice once for the whole
  pass.
- **Save the proxy, the APIs and Firebase quota.** Use the kit's
  `proxyJson` (batched, cached in memory and on the device, failures held a
  minute). Read what's needed when it's needed. Keep built plans and boards
  on the phone and refresh only what's live (bus times, live scores). Poll
  only while it matters, and push from the Worker instead of polling.
- **An app left open is an app opened for hours.** An iPhone keeps a
  home-screen app alive in the background: anything read once per session
  (a team's schedule) is read again while the app is open, and the newest
  live copy of a thing (a game's score) wins over an older list's.
- **News that happens once is told once** (a game's final score, a price
  reached): the Worker remembers what it told, whatever an app that's
  behind schedules again.
- **What doesn't change in a day comes from the nightly packs**, never
  through the proxy: a league's season (`Shared-Data`'s `sports/<league>/
  <year>.json`, built at midnight, read with the kit's `packJson`), the bus
  timetables. The proxy is for what's live. A 6 MB answer through a Worker
  is a bug: a few at once run it out of memory and every request on it
  fails together.
- **A failed read answers the copy the device has** (of any age) and is
  asked again soon; only with nothing kept is it a failure.
- **Limits are each app's**, never shared by the family: Sports, Play and
  Securities share the data proxy, and one left open in the background never
  uses up another's minute (the kit says which app asks).
- **Test on the real proxy too** (`tools/preview.mjs <app> --live`: the
  Workers' dev doors let a localhost page in without a pass; every failed or
  slow item is printed). The made-up answers can't show the proxy's own
  cache, limits and crashes.
- **A Worker call has 50 fetches**, a batch's items all share them, and one
  item that throws is that item's failure, never the batch's. An old copy is
  what's answered when a fresh read fails, not instead of reading.
- **A burst never breaks the rest.** Read what a view needs, not every day
  of a season (a playoff bracket reads back a week at a time); an answer
  of "too many" is never asked again at once. Clicking through every view
  fast is normal use: `--live` prints the busiest minute of asks, and it
  must sit well under a session's limit (600).
- Live data is trusted only where it makes sense: a bus's tracker counts
  only near a scheduled trip, and a thin prediction market counts only as far
  as it's traded and tells the options apart.

## 5. Opening fast, and never moving

- **Open on what the device already has**, then refresh behind it.
- **The loading screen lifts once, onto the finished first screen.** Nothing
  reshuffles, pops in or jumps right after it. If the fresh data isn't
  there within a few seconds, open on the saved copy and swap values in
  place, without reordering what's in view.
- No flash, blink or broken-picture icon on a redraw. Strips keep their
  scroll, and pictures seen before are drawn at once.

## 6. iPhone Safari is the platform

- Installed apps only: on a phone, every app shows the kit's add-to-home-
  screen screen in Safari (`installGate`).
- **No text wraps onto a second row that wasn't designed for one.** No
  half-cut words, no label falling under its number. Shorten the words,
  shrink the number (`fitNumbers`), or use one line with an ellipsis, in
  that order.
- **Nothing wider than the screen.** The preview tool flags any element
  that is.
- Respect the safe areas. Nothing sits under the status bar or the home
  indicator, and nothing is hidden behind frosted glass.
- One look across the family: the kit's tab bar, sheets that swipe down,
  haptics on taps, dark where the app is dark (Weather and Transit), and
  Orbit Class's Liquid Glass kept close to iOS's own: light at the rim and
  no outline rings.
- Pictures for everything that has one: a person's face, a team's logo, a
  league's mark, a country's flag. Initials are only a stand-in until the
  picture comes.
- Chinese (Traditional, Taiwan) first, in the words Taiwanese users use;
  English second.
- One CSS class name, one meaning. A component's class is never reused as
  another's modifier (`.podium` the list stretched `.pos-pill.podium`).

## 7. Each app's yardsticks

- **Transit:** how the owner really travels (memory: transit-commute-
  logic). Every real choice is shown, with each route's departures on one
  card. Official names, times and live data are preferred. Navigation
  resumes after the app is swiped away and tells the lock screen.
- **Sports:** a followed league is never hidden by a failed read. Picks
  are what a viewer in Taiwan would watch, at hours they're awake.
- **Play:** the house never loses on its own prices. The odds are its own
  estimates first, and markets count as far as they can be trusted.
- **Weather:** one number means one thing everywhere: the line, the graph
  and the 10-day row read the same hours.
