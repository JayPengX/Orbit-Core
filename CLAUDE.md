# Working on Shared-Proxy

Read `docs/TRUTH.md` first (one page: how the owner works and what matters).
MAP.md is this repo's map (README.md is the short public front page).

- `npm test`, then `git push origin HEAD:main`.
- The kit (`kit/`) is served to every app from this repo's Pages: a kit change is one push here.
- Workers deploy from `main` (wrangler tomls). `node tools/preview.mjs <app>` screenshots any app at phone width; `tools/README.md` lists the tools.
- Brand, icons and share cards: `kit/brand.mjs`, `node brand/generate.mjs`.
