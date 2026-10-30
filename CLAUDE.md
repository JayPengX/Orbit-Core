# Working on Orbit-Core

Read `docs/TRUTH.md` first (one page: how the owner works and what matters).
MAP.md is this repo's map (README.md is the short public front page).

- `npm test`, then `git push origin HEAD:main`.
- The kit (`kit/`) is served to every app from this repo's Pages: a kit change is one push here. Run `node tools/test-apps.mjs` first: every app's deploy tests against main's kit.
- Workers deploy from `main` (wrangler tomls). `node tools/shots.mjs <app> --before main` takes every screenshot a change needs (320/390, light/dark, a diff against live); `tools/README.md` lists the tools.
- Brand, icons and share cards: `kit/brand.mjs`, `node brand/generate.mjs`.
