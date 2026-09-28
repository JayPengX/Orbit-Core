# Tools

Kept here for quick use in any Quadra session (Claude Code's cloud container
has Node 22, curl and Playwright's Chromium).

| Tool | What |
| --- | --- |
| `node tools/preview.mjs <app> [hash…]` | Screenshots an app on an iPhone-sized page, signed in with a made-up wallet, with real data (the proxy's upstream fetched directly). Options: `--full`, `--dark`, `--lang en`, `--wait ms`, `--click selector` (repeatable), `--width`, `--height`, `--payload file.json`, `--out dir` (default `/tmp/quadra-preview`). Prints console errors and anything wider than the screen. `DEBUG=1` lists every upstream fetch. |
| `node tools/logos.mjs` | Rebuilds Quadra Fixtures' logo map (`public/lib/logos.mjs`): every league's logo (ESPN) and the team badges of the Kambi leagues (NPB, KBO, CPBL, EuroLeague, B.League, from TheSportsDB). Run it when a league's teams change. |
| `node tools/espn.mjs <path> [query]` | Prints the shape of an ESPN site API answer (keys, first items), for finding fields. |
| `node kit/sync.mjs` | Copies the shared kit into every app checked out beside this repo. |
| `npm test` (each repo) | The tests; Orbit Class also `npx eslint .`. |

Notes:

- ESPN answers 403 to unusual User-Agents: fetch it with curl's default.
- ESPN's scoreboard doesn't take date ranges (`dates=A-B`) any more; one
  date, or a whole year (`dates=2026`, for race series, tours and UFC).
- The container's outbound HTTPS goes through a proxy; Node's `fetch` doesn't
  use it by itself, curl does.
