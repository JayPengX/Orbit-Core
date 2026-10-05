# Tools

Kept here for quick use in any Quadra session (Claude Code's cloud container
has Node 22, curl and Playwright's Chromium).

On the owner's Mac: Node 22 in `~/.local/opt/node`, Playwright (WebKit and
Chromium) in `~/.local/opt/playwright`, which `preview.mjs` finds by itself.

| Tool | What |
| --- | --- |
| `node tools/preview.mjs <app> [hash…]` | (`--upgrade <date\|ref>`: the app as of then, then today's, in one storage: an installed app updated. `--flaky <share>`: that share of answers fails on the first opening. `--shuffle`: what moved after the loading screen lifted.) (`sports`, `words`: Orbit Sports and Words, the old `fixtures`, `hub` too.) (`transit`: Orbit Transit on made-up TDX answers around 新竹車站, `tests/fixtures/transit`, no Google key so the map is NLSC's; the position beside 新竹車站.) (`weather`: Orbit Weather, its forecast from weather.js on the saved fixtures, the place from NLSC, the position Taipei 101; `--no-geo` refuses it.) Screenshots an app on an iPhone-sized page, signed in with a made-up wallet, with real data (the proxy's upstream fetched directly). Options: `--full`, `--dark`, `--lang en`, `--wait ms`, `--click selector` (repeatable), `--width`, `--height`, `--payload file.json`, `--store key=value` (localStorage to start with), `--out dir` (default `/tmp/quadra-preview`), `--timing` (when the loading screen went away, how many of the app's own files and in how many waves), `--latency ms` (the app's files answer that much later, like a phone on GitHub Pages), `--root dir` (the repos from there, e.g. a copy stamped by `scripts/stamp-version.mjs`, to measure a deploy). `--webkit`: Safari's engine instead of Chromium (on a Mac, close to an iPhone's Safari, which is what the apps' people use; the screenshot ends `-webkit.png`). A clone from before the rename (`Quadra-Fixtures`, `Quadra-Hub` folders) works too. `--requests`: every call the page makes beyond its own files, when it was asked and how long it took. `--reopen`: each page opened twice in one browser (storage kept), the second as a phone that has used the app opens it. `--serve [--port 8123]`: no browser of its own, the app served signed in with the same made-up account and answers for another browser, e.g. the iOS Simulator's Safari (`xcrun simctl openurl booted http://localhost:8123/<repo>/`; its calls to the Workers come back to the tool, and no service worker). Prints console errors and anything wider than the screen. `DEBUG=1` lists every upstream fetch. |
| `node tools/leagues-audit.mjs [--sport soccer] [--json]` | Every league in the shared catalogue against its real sources today: what Fixtures would list (schedule, next game day) and what Play could price. Flags a league with nothing in either. |
| `node tools/economy.mjs` | The economy on paper: each kind of user's income, house take and balance over a year, under the old settings and the current ones. Change a number in `eco.js` / the kit's `ECONOMY`, then here, and rerun. |
| `node tools/espn.mjs <path> [query]` | Prints the shape of an ESPN site API answer (keys, first items), for finding fields. |
| `node kit/sync.mjs` | Copies the shared kit into every app checked out beside this repo (`logos.mjs`, every team, league and driver logo, to Play and Fixtures). |
| `npm test` (each repo) | The tests; Orbit Class also `npx eslint .`. |

Notes:

- ESPN answers 403 to unusual User-Agents: fetch it with curl's default.
- ESPN's scoreboard doesn't take date ranges (`dates=A-B`) any more; one
  date, or a whole year (`dates=2026`, for race series, tours and UFC).
- The container's outbound HTTPS goes through a proxy; Node's `fetch` doesn't
  use it by itself, curl does.
