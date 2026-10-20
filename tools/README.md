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
| `--timing`, `--requests`, `--profile`, `--latency ms`, `--version-latency ms`, `--h2`, `--root dir` | Speed: when it opened, every call, the CPU profile, a phone's latency, a deploy's build |
| `--clock ISO`, `--fixture host/path=file` | A made-up time (Taipei unless it ends in Z or ±hh:mm) or answer |
| `--serve [--port 8123]` | Serve it for the iOS Simulator (`xcrun simctl openurl booted http://localhost:8123/<Repo>/`) |
| `--type "<selector>=text"` | Fill a field after the clicks (repeatable) |
| `--geo lat,lon`, `--geo-path "lat,lon;…" --geo-every ms`, `--no-geo` | Where the phone is (Transit's default is 新竹車站), moving during `--wait`, or refusing the position |
| `--safari` | Opened in Safari, not from the home screen: the install screen |
| `--signed-out` | The sign-in screen, as a new device sees it |
| `--entry '{json}'`, `--snap '{json}'` | Add a wallet entry (an economy scenario); start with this wallet snap (e.g. Play's open slips) |
| `--fake-yahoo` | Made-up Yahoo prices, for when Yahoo answers 429 |
| `--freezes` | Report main-thread stalls while it runs |

Without `--live`, Transit uses made-up TDX around 新竹車站 and Weather its
saved fixtures. `admin [view…]` opens the admin panel on twelve made-up
accounts, never the owner's key. `DEBUG=1` lists every upstream fetch.

## Service worker

`kit/sw.js` is the one service worker for every app (the page kept first and
refreshed behind it, `?v=` files from the cache, the rest network first,
skipWaiting and clients.claim). An app's own `sw.js` can be two lines:

```js
self.QUADRA_SW = { cache: 'quadra-fixtures' };      // optional: what the deploy would stamp
importScripts('../Shared-Proxy/kit/sw.js');          // and, for pictures, ../Shared-Proxy/kit/sw-images.js
```

`node tools/stamp.mjs <sw.js> --cache <name> --version <build> --assets <public dir> [--exclude data/,share/]`
writes the cache name, build version and the list of files to keep into the
`STAMP` line of the file it is given (a copy of `kit/sw.js`, or an app's
`sw.js` that has the same `stamp:begin` / `stamp:end` lines). The cache is
`<name>-<build>`; the activate step deletes the app's other versions only.
Without a stamp the worker still runs (cache `quadra-app`, only `./` kept
ahead). Nothing changes in the apps until one adopts it.

## Others

| Tool | What |
| --- | --- |
| `node tools/economy.mjs` | Each kind of user over a year, and what the house keeps |
| `node tools/accent-css.mjs` | Write each app's accent colours (`kit/brand.mjs`) into `kit/quadra.css`; run after changing a brand colour |
| `node tools/stamp.mjs` | Stamp a service worker for a deploy (see above) |
| `node tools/leagues-audit.mjs [--sport soccer] [--json]` | Every catalogue league against its sources today |
| `node tools/hk-lots.mjs [file.xlsx]` | Every HKEX security's board lot into `kit/stock-hk-lots.mjs` (HKEX's List of Securities); run it now and then for new listings |
| `node tools/jp-lists.mjs` | TOPIX500 (Tokyo's finer ticks) and every Tokyo ETF's trading unit into `kit/stock-jp-lists.mjs` (JPX's files; needs `pdftotext`); run it after TOPIX's October review |
| `node tools/espn.mjs <path> [query]` | The shape of an ESPN answer |
| `node tools/issue-passes.mjs` | Issue passes (the owner) |
| `node tools/weather-stations.mjs` | Rebuild `weather-stations.js` |
| `python3 tools/word-audio.py` | Orbit Words' missing recordings |

ESPN answers 403 to unusual User-Agents: use curl's default. Its scoreboard
takes one date or a whole year, not a range.
