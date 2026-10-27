<p align="center">
  <img src="site/brand/family-orbit.svg" width="96" height="96" alt="">
</p>

<h1 align="center">Shared-Proxy</h1>

<p align="center">
  <b>The engine room behind every Orbit app.</b><br>
  <a href="https://jaypengx.com/pass/"><b>jaypengx.com</b></a> · proxy at <code>api.jaypengx.com</code>
</p>

<p align="center">
  <img alt="Cloudflare" src="https://img.shields.io/badge/Cloudflare-Workers-F38020?logo=cloudflare&logoColor=fff"> <img alt="D1, R2, KV" src="https://img.shields.io/badge/storage-D1_%C2%B7_R2_%C2%B7_KV-F38020?logo=cloudflare&logoColor=fff"> <img alt="JavaScript" src="https://img.shields.io/badge/JavaScript-ES_modules-F7DF1E?logo=javascript&logoColor=000"> <img alt="GitHub" src="https://img.shields.io/badge/GitHub-Pages-24292F?logo=github&logoColor=fff"> <img alt="Tests" src="https://img.shields.io/badge/Tests-node_--test-339933?logo=nodedotjs&logoColor=fff">
</p>

The Orbit apps are static sites. Everything server-side, plus the kit and brand they all share, lives here: the proxy, the Orbit Pass account, notices, data builds, and the family's home page.

## The family

| App | Link | What it is |
| --- | --- | --- |
| [Orbit Sports](https://github.com/JayPengX/Orbit-Sports) | [jaypengx.com/sports](https://jaypengx.com/sports/) | Every game, live |
| [Orbit Transit](https://github.com/JayPengX/Orbit-Transit) | [jaypengx.com/transit](https://jaypengx.com/transit/) | Bus, train and bike |
| [Orbit Weather](https://github.com/JayPengX/Orbit-Weather) | [jaypengx.com/weather](https://jaypengx.com/weather/) | One clear forecast |
| [Orbit Words](https://github.com/JayPengX/Orbit-Words) | [jaypengx.com/words](https://jaypengx.com/words/) | English words that stay |
| [Orbit Securities](https://github.com/JayPengX/Orbit-Securities) | [jaypengx.com/securities](https://jaypengx.com/securities/) | Invest worldwide, risk-free |
| [Orbit Class](https://github.com/JayPengX/Orbit-Class) | [jaypengx.com/class](https://jaypengx.com/class/) | Today's classes at a glance |
| [Orbit Beats](https://github.com/JayPengX/Orbit-Beats) | [jaypengx.com/beats](https://jaypengx.com/beats/) | Make your own beats |
| [Orbit Law](https://github.com/JayPengX/Orbit-Law) | [jaypengx.com/law](https://jaypengx.com/law/) | Laws, rulings, bills |
| [Orbit Money](https://github.com/JayPengX/Orbit-Money) | [jaypengx.com/money](https://jaypengx.com/money/) | Every dollar, in its place |

The family page and Orbit Pass sign-in are at [jaypengx.com/pass](https://jaypengx.com/pass/); how it's all built, in pictures and numbers, is at [jaypengx.com/showcase](https://jaypengx.com/showcase/).

## What's in here

- **The proxy** (`api.jaypengx.com`): one Cloudflare Worker for live data (sports, transit, weather, markets), AI (Gemini) and the apps' accounts.
- **The Orbit Pass:** one sign-in and one wallet for every app, stored in Cloudflare D1.
- **Notices** that reach a phone while the app is closed.
- **Data builds** on a schedule into Cloudflare R2: seasons, bus routes, photos and more.
- **The kit:** the shared look, sign-in screen, offline handling and helpers every app loads.
- **The site Worker** that serves every app at its short jaypengx.com address.
- **A cost guard** that watches the bill and slows, then stops, the proxy before the plan runs out.

## Stack

- Cloudflare Workers, D1, R2, KV and Durable Objects; plain JavaScript (ES modules), no runtime dependencies.
- The kit and family page are on GitHub Pages; every push to `main` tests and deploys with GitHub Actions.

## For developers

```bash
npm test
```

```bash
node tools/preview.mjs sports --live --width 375
```

The full system, data layers, secrets and deploys: **[MAP.md](MAP.md)**. Working rules: [docs/TRUTH.md](docs/TRUTH.md).
