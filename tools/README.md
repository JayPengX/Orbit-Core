# Tools

On the owner's Mac: Node 22 in `~/.local/opt/node`, Playwright (WebKit and
Chromium) in `~/.local/opt/playwright`; `preview.mjs` finds them itself.

## `node tools/shots.mjs <app> [page…]`: every screenshot a change needs

The one way to take screenshots. Each page on every screen (320 and 390
upright, `land` a phone on its side 844×390, `tablet` 820×1180, `desktop`
1440×900), light and dark, in Chromium and WebKit (when installed: a Mac; the cloud has only
Chromium), with real live data, signed in. One contact sheet, the faults of
every shot, and what changed.

```bash
node tools/shots.mjs transit                     # the app's default pages (its tabs, and more)
node tools/shots.mjs transit trip board --before main   # your change against what's live
node tools/shots.mjs money --account demo        # signed in to a demo account
```

It prints the faults and three files to look at: `index.html` (tap a shot;
Before / After / Diff when comparing), `sheet.png` (every shot as one
picture: read it, or attach it for Jay) and `changes.png` (each changed shot
as before | after | diff, the change in pink). Exit code 1 on a fault.

| | What |
| --- | --- |
| `page` | A name from `tools/shots/pages.mjs`, a tab's id (`week`), `tabs` (every tab, read off the app), `start`, or `#hash` |
| `--before <ref>` | Shoot that git ref too, side by side, and compare. `main` = origin/main = what's live |
| `--at <ref>` | Shoot a ref instead of the working tree (`main` for the live build, a branch for a preview) |
| `--against <dir>` | Compare with an earlier run's folder |
| `--account <name\|file>` | Start with that account: `tools/shots/accounts/<app>-<name>.txt`, or Money's `demo` (its sample books) |
| `--screens` (or `--widths`), `--themes`, `--engines`, `--lang en` | The matrix (default 320,390,land,tablet,desktop · light,dark · chromium,webkit · zh; any `WxH` too) |
| `--fixtures` | Saved answers instead of live data: offline checks only, never a shot anyone sees |
| `--out`, `--jobs` | Where (default a new folder in the temp dir) and how many at once (4) |
| `-- …` | Anything after it goes to each `preview.mjs` run (`--clock`, `--geo`, `--wait`…) |

**Pages.** `tools/shots/pages.mjs` says how to reach each moment worth a
look (a trip planned to 臺北車站, 查時刻's board, the rhythm game mid-play),
with taps written for both languages. When you work out how to reach a
page, add it there: the next thread gets it by name.

**Authentic.** Jay: screenshots and demos show the real app. The world's
data (games, trains, weather, prices, laws) is always live. Only what a
person keeps in their own account comes from a demo account, and that is
made by using the app: `node tools/preview.mjs <app> --keep-account
tools/shots/accounts/<app>-<name>.txt --click …` saves what the app wrote
(follows, a watchlist, a timetable). A new account with nothing in it is a
real state too (its welcome sheet): shoot that when it's what you changed.

## `node tools/live-scroll.mjs [app…] [--sheet "<js>"] [--account <name>] [--fast] [--no-days] [--webkit] [--live-only]`: nothing jumps

**Run it with `--webkit` too.** Safari moves a scroller by itself when what's in it is
drawn anew, and Chromium never does: a live game's page went to the top on every refresh
on Jay's iPhone (2026-11-05, the third time) while this passed in Chromium. In the cloud,
once: the apt-get line under `--webkit` below, then
`PLAYWRIGHT_BROWSERS_PATH=/tmp/pw-webkit node $(dirname $(readlink -f $(which playwright)))/cli.js install webkit`,
and run with the same `PLAYWRIGHT_BROWSERS_PATH`. Sports first opens a game on now (賽事,
league by league), scrolls it to the middle of 概況 and the end of 數據, and leaves it
through four live refreshes: the card that was under the view's upper third must stay where
it was on screen ("概況 put at 1523px moved 1523px": today's kit before the fix). No game
on anywhere: said and skipped. `--live-only`: just that.

Each app on real data (signed in to its demo account in `tools/shots/accounts/`
where it has one). First, as it loads, untouched (`late`): from the moment its
loading screen lifts (a sheet: from the moment it's asked for), every
card-sized block on screen is noted each 100 ms by what it says, at its place
in the layout, and one that moves on its own is a fault, named with how far
and when ("勝率預測 +530px at 1.3s": a part read later popped in above it
instead of holding its place, the kit's `waiting()`). Sports' game pages are
checked by themselves: an NBA game to come, one just over, a football game to
come; Sports' 首頁 also two and three days on, picked on its strip, and a game
row that comes into the first screen after some were drawn is a fault too ("a
game came in (艾佛頓 v 科芬特里城) at 8.6s": the loading screen lifted on today's
ended games and the next day's came in over them). Sports is opened as on a
phone's link (each proxy read a round trip and more for its size later; `--fast`
for the cloud's speed) with one league (the Scottish) unanswered for 3 s from
each first ask. `--account fill` signs in with 填滿空檔 on (`sports-fill.txt`). Then it's scrolled the way iPhone's Safari scrolls (no scroll
anchoring), and: something above the view grows (a refresh); the tab is drawn
anew a moment short before it's full again; a drawing under the view moves (a
car on a track map, a box laid over the page) and the page must not follow; a
button is tapped and its tap folds what's under it (the page left short, as a
segment with less in it) or what's above it, and the button must stay under
the finger; in a sheet sized to its content, less is shown and the sheet must
keep its height. `--sheet` opens a sheet and checks it too, in place of the
app's own (`"import('./sheets.js').then(m=>m.openTeam('nba','13'))"` in Sports; `""` for none);
`--without` leaves the kit's keeper (`kit/hold-place.mjs`) out to show what it
catches. Exit code 1 on a fault. Run it after any change to how a page redraws
or to `hold-place.mjs`.

## `node tools/store-shots.mjs <app> [n…] [--apply]`: the Showcase's and README's screenshots

One set per app, in both languages, for the Showcase's App tab and the app's README
(what each shot is: `tools/shots/store.mjs`). Without `--apply` it shoots and writes
`sheet.png` to look at; `--apply` writes the Showcase's copies and captions and the
README's framed copies and picture rows (English, then 中文畫面 in a fold).

## `node tools/help-shots.mjs [app…] [--stops a,b] [--keep dir [--reuse]]`: the guides' screenshots

Every stop of each app's tour in 說明 (`TOURS` in `kit/help.mjs`: its tabs and
the few screens worth knowing), at 390 wide, light and dark, Chinese and English,
on live data (the demo account where the app has one), cropped to the screen's
top (a sheet's stop from the sheet's top) and saved as WebP in `kit/img/help/<app>/`,
each stop's hash in the block at the end of `kit/help.mjs`. How each stop is reached is in the tool.
Retake an app's after its screens change (a tab redrawn, a tab added); Orbit Class
needs `npm run build` first.

## `node tools/speed.mjs <app…|all>`: every load, before and after, on a 3G link

What a person waits for and what the phone spends, measured the same way
for the code as it is (`--before`, a git ref, `main` by default) and your
working tree (`--after work`). Each app runs in Chromium on a link like a
weak 3G (400 kbps, 400 ms; `--net 4g|wifi`) with its CPU slowed 4×, signed
in with a test Pass, through steps: `open` (the first opening, nothing on
the phone), `idle` (30 s left open), each tab, `scroll`, `away` (to the
background and back) and `reopen` (closed, opened again 15 minutes later
on the page's clock). For each: the time to the first screen (`#loading`
gone) and until the page settles, KB and requests (the app's own files,
the proxy's, other sites'), CPU, long tasks, layouts, nodes redrawn, memory,
and the proxy's requests with their estimated Worker CPU.

Every answer from outside is fetched live once and recorded (`record.jsonl`
beside the results), then replayed to both sides, at one fixed moment
(`clock.json`; `--at <ISO>` sets it), so the two ask the same world.
`--refresh-after <regex>`: those addresses are read fresh for the after
side (a change on the server: a slimmer pack). `--warm` records each app
once first, so no live read is timed.

```bash
git -C ../Orbit-Weather tag speed-before   # (each repo, as long work begins)
node tools/speed.mjs weather --before speed-before --warm --verbose
node tools/speed.mjs all --only before --out /tmp/base   # today's numbers alone
```

It writes `results.md` (a table a step a row) and `results.json` (every
request of every step: when, how big, how long). Needs port 443 free, and
the app repos beside this one.

## `node tools/f1-replay.mjs --start <UTC> --at <UTC> [--out dir]`: an F1 session live, any moment of a real one

Rebuilds what F1's live feed said at a moment of a recorded session from
OpenF1's tables (cached in the temp folder): the proxy's `now.json` and
`laps.json` and ESPN's scoreboard with the session on. Nothing made up: a red
flag, a safety car, a pit window as they were. It prints the preview's
arguments and writes them to `<out>/args.txt`:

```bash
node tools/f1-replay.mjs --start 2026-11-01T20:00:00Z --at 2026-11-01T21:40:00Z --out /tmp/red   # Mexico 2026, red flag
node tools/shots.mjs sports f1-live f1-live-chart f1-live-tyres -- $(cat /tmp/red/args.txt)
```

`--start` is the session's start (OpenF1's `date_start`); the pages
`f1-live`, `f1-live-track|tyres|laps|points`, `f1-live-chart` and
`f1-live-title` are the live board, its 數據 tabs and the weekend's cards.
(The standings are today's: a past race's points can show twice in 冠軍之爭.)

## `node tools/preview.mjs <app> [view…]`

An app on an iPhone-sized page, signed in with a made-up wallet. Apps:
`sports`, `securities`, `words`, `orbit` (Class), `weather`,
`transit`, `beats`, `law`, `admin`.

It prints console errors and three kinds of layout fault:

- `wraps:` text that broke onto a second row;
- `cut:` an ellipsis, a clipped box, or a picker too narrow;
- `scrolls sideways:` a page or sheet wider than the screen.

The usual run:

```bash
node tools/preview.mjs sports --live --width 375
```

| Flag | What |
| --- | --- |
| `--live` | Real data through the Workers' dev doors; prints the busiest minute |
| `--width`, `--height`, `--full`, `--dark`, `--lang en` | The screen |
| `--click "<selector>"` or `--click "js:…"` | Act before the shot (repeatable) |
| `--eval "<js>"`, `--wait ms` | Read something out; wait first |
| `--store key=value`, `--payload file.json` | Start with this localStorage or Pass payload |
| `--keep-account file` | Save what the app writes to its account during the run (a demo account for `shots.mjs --account`) |
| `--out dir` | Where shots go (default `/tmp/orbit-preview`) |
| `--webkit` | Safari's engine instead of Chromium (cloud: once, `apt-get install -y libavif16 libenchant-2-2 libsecret-1-0 libwayland-server0 libmanette-0.2-0 libgles2 libgtk-4-1 libgraphene-1.0-0 libwoff1 libevent-2.1-7t64 libgstreamer-gl1.0-0 libgstreamer-plugins-bad1.0-0 gstreamer1.0-plugins-base`) |
| `--reopen` | Open twice with storage kept (a returning phone) |
| `--upgrade <date\|ref>` | The old version, then today's, in one storage |
| `--upgrade <date> --deploy-at ms [--cdn-lag ms] [--hidden-for ms] [--relaunch-after ms] [--kit-only] [--old-kit-local] [--tap sel]` | A deploy landing while the old app is open: each load, what the loading screen said, whether it ended up running. `--cdn-lag`: the CDN still answers the old files that long; `--old-kit-local`: the old kit is this one with a line changed (to try a change to the update path itself) |
| `--flaky <share>`, `--net offline\|slow[:ms]` | Failing or missing network |
| `--shuffle` | What moved after the loading screen lifted |
| `--timing`, `--requests`, `--profile`, `--latency ms`, `--version-latency ms`, `--h2`, `--root dir` | Speed: when it opened, every call, the CPU profile, a phone's latency, a deploy's build |
| `--clock ISO`, `--fixture host/path=file` | A made-up time (Taipei unless it ends in Z or ±hh:mm) or answer |
| `--serve [--port 8123]` | Serve it for the iOS Simulator (`xcrun simctl openurl booted http://localhost:8123/<Repo>/`) |
| `--type "<selector>=text"` | Fill a field after the clicks (repeatable) |
| `--geo lat,lon`, `--geo-path "lat,lon;…" --geo-every ms`, `--no-geo` | Where the phone is (Transit's default is 新竹車站), moving during `--wait`, or refusing the position |
| `--safari` | Opened in Safari, not from the home screen: the install screen |
| `--signed-out` | The sign-in screen, as a new device sees it |
| `--entry '{json}'`, `--snap '{json}'` | Add a wallet entry (an economy scenario); start with this wallet snap |
| `--setting 'key={json}'`, `--apps a,b` | Start with this wallet setting (milestones `ms.<id>`, `avatar`, `frame`; repeatable); apps already opened |
| `--fake-yahoo` | Made-up Yahoo prices, for when Yahoo answers 429 |
| `--freezes` | Report main-thread stalls while it runs |

Without `--live`, Transit uses made-up TDX around 新竹車站 and Weather its
saved fixtures. `admin [view…]` opens the admin panel on twelve made-up
accounts, never the owner's key. `DEBUG=1` lists every upstream fetch.

## Service worker

`kit/sw.js` is the one service worker for every app (the page kept first and
refreshed behind it, `?v=` files from the cache, the rest network first,
skipWaiting and clients.claim; every file under its own hash checked against
it, since a CDN may answer a new `?v=` with an old copy for a while). An app's `sw.js` is its settings, then
the kit's (the options are at the top of `kit/sw.js`):

```js
self.ORBIT_SW = { cache: 'orbit-law-v1', title: 'Orbit Law' };
importScripts('../Orbit-Core/kit/sw-images.js');   // pictures from other sites, when it shows them
importScripts('../Orbit-Core/kit/sw.js');
```

## Others

| Tool | What |
| --- | --- |
| `node tools/kit-find.mjs [--css] [--apps] <word…>` | What the kit already has: its exports and `orbit.css` classes and tokens whose name or comment has every word; `--apps` adds the apps' own definitions of that name (a copy to move into the kit). Run it before writing a helper, a component or a style |
| `sh tools/push.sh` (from an app: `sh ../Orbit-Core/tools/push.sh`) | The one way to push: rebases onto origin/main, runs what the deploy runs (`npm test` against main's kit, Class's build, every app's tests on a kit change) and pushes main only if it all passes, so no deploy goes red and mails Jay |
| `node tools/test-apps.mjs [app…]` | Every app's tests (checkouts beside this one) against this kit; run before pushing a kit change, since each app's deploy tests against main's kit and a break mails Jay |
| `node tools/picks-backtest.mjs [sports stock law beats] [--root <dir>] [--seeds 5] [--why]` | Every app's picks replayed day by day on real data (Sports' season packs, Securities' catalog, Law's index and rulings, Beats' grooves) with made-up people, the app's own ranking code and the kit's engine as the app wires them: opened, best (against the best they could have shown), first, wrong 常看. Before and after: a checkout of main in `--root <dir>` (with `Orbit-Core`, `Orbit-<App>` in it), then here. Sports' seasons are read once into `/tmp/orbit-seasons` (`--data`) |
| `node tools/accent-css.mjs` | Write each app's accent colours (`kit/brand.mjs`) into `kit/orbit.css`; run after changing a brand colour |
| `node tools/leagues-audit.mjs [--sport soccer] [--json]` | Every catalogue league against its sources today |
| `node tools/hk-lots.mjs [file.xlsx]` | Every HKEX security's board lot into `kit/stock-hk-lots.mjs` (HKEX's List of Securities); run it now and then for new listings |
| `node tools/tw-boards.mjs` | Every 興櫃 stock (`TW_EMERGING`), listed 可轉債 with its maturity (`TW_CB`), 全額交割股 (`TW_FULL`), 創新板 stock (`TW_INNOVATION`) and 槓反期貨 ETF (`TW_LI_FUTURES`) into `kit/stock-markets.mjs`, from TWSE's and TPEx's open data; run it now and then |
| `node tools/tw-futures.mjs` | Every TAIFEX 股票期貨 and ETF期貨 (`TW_SSF`: code, stock, ETF/上櫃/小型) into `kit/stock-markets.mjs`, from TAIFEX open data; run it now and then for new contracts |
| `node tools/jp-lists.mjs` | TOPIX500 (Tokyo's finer ticks) and every Tokyo ETF's trading unit into `kit/stock-jp-lists.mjs` (JPX's files; needs `pdftotext`); run it after TOPIX's October review |
| `node tools/espn.mjs <path> [query]` | The shape of an ESPN answer |
| `node tools/issue-passes.mjs` | Issue passes (the owner) |
| `node tools/weather-stations.mjs` | Rebuild `weather-stations.js` |
| `python3 tools/word-audio.py` | Orbit Words' missing recordings |

ESPN answers 403 to unusual User-Agents: use curl's default. Its scoreboard
takes one date or a whole year, not a range.
