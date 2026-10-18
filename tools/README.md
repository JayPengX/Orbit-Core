# Tools

On the owner's Mac: Node 22 in `~/.local/opt/node`, Playwright (WebKit and
Chromium) in `~/.local/opt/playwright`; `preview.mjs` finds them itself.

## `node tools/preview.mjs <app> [view…]`

An app on an iPhone-sized page, signed in with a made-up wallet. Apps:
`sports`, `play`, `securities`, `words`, `orbit` (Class), `weather`,
`transit`, `slips`, `beats`, `admin`.

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
| `--out dir` | Where shots go (default `/tmp/quadra-preview`) |
| `--webkit` | Safari's engine instead of Chromium (cloud: once, `apt-get install -y libavif16 libenchant-2-2 libsecret-1-0 libwayland-server0 libmanette-0.2-0 libgles2 libgtk-4-1 libgraphene-1.0-0 libwoff1 libevent-2.1-7t64 libgstreamer-gl1.0-0 libgstreamer-plugins-bad1.0-0 gstreamer1.0-plugins-base`) |
| `--reopen` | Open twice with storage kept (a returning phone) |
| `--upgrade <date\|ref>` | The old version, then today's, in one storage |
| `--flaky <share>`, `--net offline\|slow[:ms]` | Failing or missing network |
| `--shuffle` | What moved after the loading screen lifted |
| `--timing`, `--requests`, `--profile`, `--latency ms`, `--h2`, `--root dir` | Speed: when it opened, every call, the CPU profile, a phone's latency, a deploy's build |
| `--clock ISO`, `--fixture host/path=file` | A made-up time (Taipei unless it ends in Z or ±hh:mm) or answer |
| `--serve [--port 8123]` | Serve it for the iOS Simulator (`xcrun simctl openurl booted http://localhost:8123/<Repo>/`) |
| `--no-geo` | (Weather) refuse the position |

Without `--live`, Transit uses made-up TDX around 新竹車站 and Weather its
saved fixtures. `admin [view…]` opens the admin panel on twelve made-up
accounts, never the owner's key. `DEBUG=1` lists every upstream fetch.

## Others

| Tool | What |
| --- | --- |
| `node tools/economy.mjs` | Each kind of user over a year, old settings against new |
| `node tools/leagues-audit.mjs [--sport soccer] [--json]` | Every catalogue league against its sources today |
| `node tools/espn.mjs <path> [query]` | The shape of an ESPN answer |
| `node tools/issue-passes.mjs` | Issue passes (the owner) |
| `node tools/weather-stations.mjs` | Rebuild `weather-stations.js` |
| `python3 tools/word-audio.py` | Orbit Words' missing recordings |

ESPN answers 403 to unusual User-Agents: use curl's default. Its scoreboard
takes one date or a whole year, not a range.
