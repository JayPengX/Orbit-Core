<p align="center">
  <img src="site/brand/family-orbit.svg" width="96" height="96" alt="">
</p>

<h1 align="center">Orbit-Core</h1>

<p align="center">
  <b>The engine room behind every Orbit app.</b><br>
  <a href="https://orbit.jaypengx.com/pass/"><b>orbit.jaypengx.com</b></a> · proxy at <code>api.jaypengx.com</code>
</p>

<p align="center">
  <img alt="Cloudflare" src="https://img.shields.io/badge/Cloudflare-Workers-F38020?logo=cloudflare&logoColor=fff"> <img alt="D1, R2, KV" src="https://img.shields.io/badge/storage-D1_%C2%B7_R2_%C2%B7_KV-F38020?logo=cloudflare&logoColor=fff"> <img alt="JavaScript" src="https://img.shields.io/badge/JavaScript-ES_modules-F7DF1E?logo=javascript&logoColor=000"> <img alt="GitHub" src="https://img.shields.io/badge/GitHub-Pages-24292F?logo=github&logoColor=fff"> <img alt="Tests" src="https://img.shields.io/badge/Tests-node_--test-339933?logo=nodedotjs&logoColor=fff">
</p>

The Orbit apps are static sites. Everything server-side, plus the kit and brand they all share, lives here: the proxy, the Orbit Pass account, notices, data builds, and the family's home page.

<p align="center">
  <img src="docs/screenshots/family-1.webp" width="30%" alt="One pass for every app">
  <img src="docs/screenshots/family-2.webp" width="30%" alt="Milestones across the family">
  <img src="docs/screenshots/family-3.webp" width="30%" alt="Settings that follow you">
</p>

## The family

| App | Link | What it is |
| --- | --- | --- |
| [Orbit Sports](https://github.com/JayPengX/Orbit-Sports) | [orbit.jaypengx.com/sports](https://orbit.jaypengx.com/sports/) | Every game, live |
| [Orbit Transit](https://github.com/JayPengX/Orbit-Transit) | [orbit.jaypengx.com/transit](https://orbit.jaypengx.com/transit/) | Bus, train and bike |
| [Orbit Weather](https://github.com/JayPengX/Orbit-Weather) | [orbit.jaypengx.com/weather](https://orbit.jaypengx.com/weather/) | One clear forecast |
| [Orbit Words](https://github.com/JayPengX/Orbit-Words) | [orbit.jaypengx.com/words](https://orbit.jaypengx.com/words/) | English words that stay |
| [Orbit Securities](https://github.com/JayPengX/Orbit-Securities) | [orbit.jaypengx.com/securities](https://orbit.jaypengx.com/securities/) | Invest worldwide, risk-free |
| [Orbit Class](https://github.com/JayPengX/Orbit-Class) | [orbit.jaypengx.com/class](https://orbit.jaypengx.com/class/) | Today's classes at a glance |
| [Orbit Beats](https://github.com/JayPengX/Orbit-Beats) | [orbit.jaypengx.com/beats](https://orbit.jaypengx.com/beats/) | Make your own beats |
| [Orbit Law](https://github.com/JayPengX/Orbit-Law) | [orbit.jaypengx.com/law](https://orbit.jaypengx.com/law/) | Laws, rulings, bills |
| [Orbit Money](https://github.com/JayPengX/Orbit-Money) | [orbit.jaypengx.com/money](https://orbit.jaypengx.com/money/) | Every dollar, in its place |

The family page and Orbit Pass sign-in are at [orbit.jaypengx.com/pass](https://orbit.jaypengx.com/pass/); how it's all built, in pictures and numbers, is at [jaypengx.com/showcase](https://jaypengx.com/showcase/).

## Features

- **The proxy** (`api.jaypengx.com`): one Cloudflare Worker for every live read the apps make (sports, transit, weather, markets, invoices, law), with the apps' AI features behind it, so no key ever reaches a phone.
- **The Orbit Pass:** one sign-in and one wallet for every app, with each app's saved data, kept in Cloudflare D1.
- **Notices** that reach a phone while the app is closed: game starts, class reminders, bus arrivals, rain, price alerts.
- **Data builds** on the proxy's cron into Cloudflare R2: seasons, game days, bus routes and shapes, photos, highlights.
- **The kit:** the shared look (an iOS-style design system), the sign-in sheet, sheets, tab bars, the date strip, offline handling, the service worker and the helpers every app loads.
- **The site Worker** that serves every app at its short orbit.jaypengx.com address (and Jay's homepage at jaypengx.com) from each repo's GitHub Pages.
- **A cost guard** that reads the bill every five minutes and slows, then stops, the proxy before the $5 plan runs out.
- **Brand:** every app's icon, share card and manifest generated from one file.
- **Tools:** a phone-sized preview of any app with real data, and the audits and list builders the apps rely on.

## Tech stack

| Layer | What |
| --- | --- |
| Workers | Cloudflare Workers, plain JavaScript (ES modules), no runtime dependencies |
| Storage | D1 (`orbit-store`: the Pass), R2 (`orbit-data`: built data and kept reads), KV (caches and limits), Durable Objects (F1 timing log) |
| AI | Gemini through `gemini-relay`, pinned to Taiwan |
| Kit and site | GitHub Pages: `kit/` and `site/` (the family page and the admin page) |
| CI/CD | GitHub Actions: tests, then Wrangler deploys from `main` |
| Tools | Node.js 22 and Playwright (Chromium and WebKit) |
| Tests | `node --test` on the Pass, the money, notices, the data proxy, builders, the guard and the kit |

## How it works

```
phones (home-screen apps) ── each app's static files + the kit (#kit/…, from this repo's Pages)
   │  memory → Cache Storage → localStorage (versioned keys)
   ▼
orbit-workers-proxy (one Worker)
   /eco           the Orbit Pass: accounts, wallet, app data (D1)
   /stock         Securities' orders filled at the proxy's quote
   /push          notices while an app is closed (KV + cron)
   /weather       Google + CWA + MOENV blended (KV cells)
   /transit       TDX, Google Maps / Places / Routes
   /sports-proxy  live data reads for the apps, by host, trimmed and cached
   /gemini, /nl-edit, /law-ask, /law-chat   Gemini via gemini-relay
   /data          the family's data in R2, built by builders/ on the cron
quota-guard   reads the bill every 5 minutes; paces, then stops the proxy at 90% of the plan
orbit-site    serves orbit.jaypengx.com/<app>/, jaypengx.com and longshot.jaypengx.com from GitHub Pages
```

A read from an app goes down these layers until one answers: memory, the phone's Cache Storage, the family's data in R2, the proxy's edge cache, reads kept for good in R2, and only then the upstream. A failed read is a failure, never "nothing there".

The kit is **served, not copied**: apps load it from this repo's Pages through an import map (`#kit/…`), every file addressed by its content hash, so a kit change is one push here and a phone downloads only what changed.

Every route, data layer, secret and deploy: **[MAP.md](MAP.md)**.

## Project structure

```
worker.js            the proxy's router; each route's work in its own file:
├── eco.js, eco-admin.js, orbit-token.js       the Orbit Pass and its admin
├── push.js                                    notices
├── weather.js, weather-skill.js, typhoon.js   weather
├── transit.js                                 transit
├── sports.js, sports-today.js, f1-live.js, asia-baseball.js
├── stock-fill.js, stock-check.js, fund-nav.js, taifex.js   Securities
├── money.js, money-read.js, money-mail.js, invoice.js      Money
├── law.js, law-chat.js, law-ground.js, law-more.js, law-page.js, law-hosts.js
└── data.js, http.js, capacity.js, pace.js, ops.js, doc-store.js, store-backup.js
gemini-relay.js      Gemini, pinned to Taiwan
guard.js             the cost guard (its own Worker)
site.js              the site Worker (orbit.jaypengx.com, jaypengx.com, longshot.jaypengx.com)
builders/            data builds into R2 (seasons, buses, photos, highlights…)
kit/                 the shared kit every app loads
site/                the family page and the admin page
brand/               icons, share cards and manifests for every app
locales/             shared text
tools/               preview.mjs and the other tools (tools/README.md)
tests/               node --test
docs/                TRUTH.md (how to work), RULEBOOK.md (every rule), DESIGN.md (how screens look)
wrangler*.toml       one per Worker
```

## Getting started

Requirements: Node.js 22 or newer; Playwright for the preview tool.

```bash
git clone https://github.com/JayPengX/Orbit-Core.git
cd Orbit-Core
npm test
```

Preview any app at phone size with real data, with the app's repo cloned beside this one:

```bash
git clone https://github.com/JayPengX/Orbit-Sports.git ../Orbit-Sports
node tools/preview.mjs sports --live --width 375
```

Apps: `sports`, `transit`, `weather`, `words`, `securities`, `orbit` (Class), `beats`, `law`, `money`, and `admin` (the admin page on made-up accounts). Every flag is in [tools/README.md](tools/README.md).

Regenerate the brand after changing a name or colour:

```bash
node brand/generate.mjs
node tools/accent-css.mjs
```

## Deploying

Push to `main`. GitHub Actions runs the tests and deploys:

| Workflow | What |
| --- | --- |
| `deploy.yml` | The proxy, `gemini-relay` and the site Worker, and attaches the jaypengx.com hostnames |
| `deploy-guard.yml` | The cost guard, when its files change |
| `pages.yml` | The kit and `site/` to GitHub Pages |
| `build.yml`, `tail.yml`, `audit.yml` | By hand: run a builder, watch the logs, check secret names |

Secrets live only as GitHub or Cloudflare secrets, never in the repo.
