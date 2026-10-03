# Tools

Kept here for quick use in any Quadra session (Claude Code's cloud container
has Node 22, curl and Playwright's Chromium).

| Tool | What |
| --- | --- |
| `node tools/preview.mjs <app> [hash…]` | (`sports`, `words`: Orbit Sports and Words, the old `fixtures`, `hub` too.) (`transit`: Orbit Transit on made-up TDX answers around 新竹車站, `tests/fixtures/transit`, no Google key so the map is NLSC's; the position beside 新竹車站.) (`weather`: Orbit Weather, its forecast from weather.js on the saved fixtures, the place from NLSC, the position Taipei 101; `--no-geo` refuses it.) Screenshots an app on an iPhone-sized page, signed in with a made-up wallet, with real data (the proxy's upstream fetched directly). Options: `--full`, `--dark`, `--lang en`, `--wait ms`, `--click selector` (repeatable), `--width`, `--height`, `--payload file.json`, `--store key=value` (localStorage to start with), `--out dir` (default `/tmp/quadra-preview`), `--timing` (when the loading screen went away, how many of the app's own files and in how many waves), `--latency ms` (the app's files answer that much later, like a phone on GitHub Pages), `--root dir` (the repos from there, e.g. a copy stamped by `scripts/stamp-version.mjs`, to measure a deploy). Prints console errors and anything wider than the screen. `DEBUG=1` lists every upstream fetch. |
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
