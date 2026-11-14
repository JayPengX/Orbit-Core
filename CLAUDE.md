# Orbit

Jay's family of home-screen web apps for Taiwan, one Orbit Pass across all of them:
Sports, Transit, Weather, Class, Money, News, Words, Beats, Law and Securities
(play money), each at `orbit.jaypengx.com/<slug>/`, plus Jay's homepage and
Showcase. This repo, Orbit-Core, holds the shared kit (`kit/`), the Cloudflare
Workers (the proxy, the Pass, notices, the bill's guard), the data builders,
the tools and the family's docs. Every repo is checked out side by side
(`../Orbit-Sports`, …); each app loads the kit from this repo's site.

## Read this, then only what the task needs

| When | Read |
| --- | --- |
| Every task | this file and `docs/RULEBOOK.md` (how to work, every family rule) |
| Working in an app | that repo's `MAP.md` (its rules, its code, run and test) |
| A visible change | `docs/DESIGN.md`, and `MAP.md` §3.3 (the kit's components) |
| The kit, a Worker, a route, data or sync | `MAP.md` (this repo's: §3 kit, §4 routes, §5 data, §10 deploy) |
| A refactor or removal | the repo's `FEATURES.md` (every feature; its test fails when one goes) |
| Orbit, the all-in-one app (`/app/`) | `docs/ORBIT.md` (what the person sees in every case) |
| A tool (screenshots, preview, speed) | `tools/README.md` |
| A new workspace or agent, or what lives outside git | `HANDOFF.md` |

Each fact has one home: family rules in `docs/RULEBOOK.md`, an app's rules in
its `MAP.md`, the architecture in this repo's `MAP.md`, the look in
`docs/DESIGN.md`. Elsewhere, link; never copy. A repo's `README.md` is its
public front page. Notes, reports and screenshots for Jay live in the
project's shared folder, never in a repo; nothing there is needed to build
or run Orbit.

## Every session

- **Look before you write:** `node tools/kit-find.mjs <word…>` (the kit's
  exports and CSS classes; `--apps` finds copies). Anything two apps use goes
  into `kit/`, never a second copy. A new kit export is read with a fallback
  (`kitUI.newThing?.(…)`) for its first week only: phones may run an older kit.
  No legacy forwards or back-compat (RULEBOOK §1).
- **Push** with `sh ../Orbit-Core/tools/push.sh` (here `sh tools/push.sh`):
  `main` only, never a branch or a PR. It rebases, runs what the deploy runs
  (and every app's tests on a kit change) and pushes only if they pass.
  A kit change is one push here (`pages.yml`); Workers deploy from `main`
  (`deploy.yml`).
- **Same push:** the `MAP.md` your change made wrong (an architecture change:
  this repo's `MAP.md`, or `npm test` fails), a `FEATURES.md` line for a new
  feature, a rule Jay set or changed in `docs/RULEBOOK.md` or the app's `MAP.md`.
- **See it:** `node tools/preview.mjs <app> --live --width 375` (real data
  through the dev door); for a visible change
  `node tools/shots.mjs <app> --before main` (320/390, light/dark, a phone on
  its side, tablet, computer, a diff against what's live).
- Brand, icons, share cards: `kit/brand.mjs`, then `node brand/generate.mjs`.
