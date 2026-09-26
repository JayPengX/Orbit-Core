# Shared Proxy

Shared Cloudflare Workers backend for Orbit, Orbit Vocab, Match Find, Odds Study, and Stock Study.

This repository holds two Cloudflare Workers that back the optional
server-side features of four otherwise-independent static sites. None of
the four sites needs a database, a server, or its own API key to use these
features — each one just points at a deployed Worker URL.

- **Orbit Class** — class schedule dashboard
  Repo: https://github.com/JayPengX/Orbit-Class
  Live: https://jaypengx.github.io/Orbit-Class/
- **Orbit Vocab** — vocabulary trainer
  Repo: https://github.com/JayPengX/Orbit-Vocab
  Live: https://jaypengx.github.io/Orbit-Vocab/
- **Match Find** — sports recommendation site
  Repo: https://github.com/JayPengX/Match-Find
  Live: https://jaypengx.github.io/Match-Find/
- **Odds Study** — educational page on Taiwan Sports Lottery odds math
  Repo: https://github.com/JayPengX/Odds-Study
  Live: https://jaypengx.github.io/Odds-Study/
- **Stock Study** — play-money brokerage simulator for markets worldwide
  Repo: https://github.com/JayPengX/Stock-Study
  Live: https://jaypengx.github.io/Stock-Study/

## Table of Contents

- [Overview](#overview)
- [Routes & Consumers](#routes--consumers)
- [Security Hardening](#security-hardening)
- [Sync Design](#sync-design)
- [One-Time Deploy Setup](#one-time-deploy-setup)
- [Optional: Auto-Deploy via GitHub Actions](#optional-auto-deploy-via-github-actions)
- [Wiring Up a Consuming App](#wiring-up-a-consuming-app)
- [Why One Worker for Most Routes, But Two Overall](#why-one-worker-for-most-routes-but-two-overall)
- [Related Projects](#related-projects)

## Overview

This repo used to be a folder inside Orbit's own repository
(`cloudflare-worker/`), but it was never really Orbit-specific — it already
served all of its consumer sites, and keeping it nested inside one of its own
consumers made "which repo do I even touch to change the proxy" a real
question. It now lives here on its own, with its own deploy pipeline, so
each of the apps only ever has to know one thing about it: the URL.

Two Workers are deployed from this repo:

- **`orbit-workers-proxy`** (`worker.js` + `wrangler.toml`) — serves
  `/gemini`, `/nl-edit`, `/sync`, `/vocab-sync`, `/odds-sync`, `/stock-sync`, `/vocab-ai`.
- **`sports-proxy`** (`sports-proxy-worker.js` + `wrangler.sports-proxy.toml`) —
  serves `/sports-proxy` as its own, separately deployed Worker. See
  [Why One Worker for Most Routes, But Two Overall](#why-one-worker-for-most-routes-but-two-overall)
  for the reasoning behind the split.

Every route validates and rate-limits itself independently (see
`isRateLimited` in `worker.js` — every call site passes its own `feature`
key), so a burst of traffic against one route can never eat into another
route's, or another app's, quota. Every feature is also entirely optional on
the *consuming* app's side: not configuring a `PROXY_URL` (or that route not
being reachable) just makes that one feature unavailable, never a broken
build.

## Routes & Consumers

| Route | Method(s) | Used by | Purpose |
| --- | --- | --- | --- |
| `/gemini` | GET (warm-up), POST | Orbit | AI schedule-photo import — holds the real Gemini API key server-side. |
| `/nl-edit` | POST | Orbit | AI natural-language schedule edits (e.g. "把我週二第三節改成物理"). |
| `/sync` | GET/PATCH/DELETE | Orbit | Cross-device schedule sync (code + manager passcode; reads are open, writes/deletes need the passcode). |
| `/vocab-sync` | GET/PATCH/DELETE | Orbit Vocab | Cross-device learning-progress sync (single passcode, no separate read-only code). |
| `/odds-sync` | GET/POST/PATCH/DELETE | Odds Study | Cross-device sync of the simulated betting account (play-money balance, weekly top-ups, saved slips). Same single-passcode design as `/vocab-sync`, with an 8-character passcode; Firestore collection `odds-study-accounts`. Payloads up to 1,000,000 characters (slip history is kept for good; just under Firestore's 1 MiB document limit). |
| `/stock-sync` | GET/POST/PATCH/DELETE | Stock Study | Cross-device sync of the simulated brokerage account (wallets per currency, holdings, orders, loans, history). Exactly `/odds-sync`'s design and limits (8-character passcode, 1,000,000 characters), in its own Firestore collection `stock-study-accounts` with its own rate-limit counters. |
| `/vocab-ai` | POST | Orbit Vocab | Live, per-learner personalized mnemonics. Responses are cached in `RATE_LIMIT_KV` by exact request shape (word/pos/meaning/wrongAnswers), so a repeat of the same word + mistake pattern (common — see `vocabAiCacheKey`'s own comment in `worker.js`) is a free KV read, not a billed Gemini call. The `X-Vocab-Ai-Cache: hit`/`miss` response header says which happened. |
| `/sports-proxy` (separate Worker — see below) | GET | Match Find, Odds Study | Host-allowlisted CORS passthrough to ESPN (site and core APIs), the MLB Stats API, Jolpica, and Polymarket's Gamma API, so the viewer's own browser can fetch and score its whole live match list directly. Optional `&trim=polymarket-events` on a Gamma `/events` URL returns only the fields Match Find reads (~25× smaller - see `trimPolymarketEvents`). Odds Study uses ESPN's site API, Gamma (its `/events` pages with the trim, and `/public-search` for championship markets, cached 10 minutes fresh + a day stale) and Kambi's public odds feed (`eu-offering-api.kambicdn.com`: list views cached 2 minutes fresh + 10 stale, the live feed 20 seconds), with `&trim=kambi-events` keeping only the event, price and live-score fields it reads (~5× smaller). Stock Study uses Yahoo Finance's public `query1`/`query2.finance.yahoo.com` endpoints: `/v7/finance/spark` (up to 20 quotes per request) and `/v8/finance/chart` (charts, dividends, splits), cached 30 seconds for a day or five of data and 30 minutes (+ a day stale) for longer charts, and `/v1/finance/search`, cached a day (with news, 30 minutes). `/v7/finance/quote` and `/v10/finance/quoteSummary` (a company's P/E, market value, dividend yield and profile) need Yahoo's session cookie and crumb: the Worker fetches them itself (with a browser User-Agent, which Yahoo requires for the crumb), keeps them 6 hours, adds them to those requests only, and caches the answers an hour fresh + a day stale. |

`/sports-proxy` is deployed as its own Worker (`sports-proxy-worker.js` +
`wrangler.sports-proxy.toml`), not part of `worker.js`/`wrangler.toml` above
— see [One-Time Deploy Setup](#one-time-deploy-setup) for why.

### Removed routes

Match Find used to also have a Gemini-backed recommendation route on this
Worker, in three successive shapes, all now removed:

- `/match-recommend` / `/match-recommend-refine` — scored and validated
  *every* fixture on *every* build. Removed in Match Find's Round 11: the
  free-tier Gemini quota couldn't sustain that workload.
- A much narrower `/match-recommend` was reintroduced in Round 32 — a
  bounded, at-most-once-per-day tie-break between a small set of
  close-scoring candidates for one day's headline slot. This version is
  also gone as of Round 41: direct instruction that its real, now-billed
  cost outweighed its actual improvement to the recommendation. Its own two
  live test calls (Round 37/38) had already shown Gemini's independent
  judgment simply agreeing with the deterministic engine's own pick both
  times.
- `/match-dispatch` — fired a GitHub Actions rebuild on demand. Removed once
  Match Find moved its own match-building pipeline to run fully client-side
  (see that repo's `public/app.js`), leaving nothing left to dispatch from a
  scheduled server-side build.

Match Find's deterministic objective-score engine
(`public/lib/recommendation.mjs` in that repo) is its only recommendation
logic today — no Gemini call of any kind.

## Security Hardening

Until a hardening pass on 2026-09-22, `/gemini`, `/vocab-ai`, `/nl-edit`,
and the (since-removed) `/match-recommend` — every route that makes a real,
billed Gemini API call — were callable by anyone who simply knew the URL.
`ALLOWED_ORIGINS`/`isAllowedOrigin` only ever fed the CORS response headers,
which is purely advisory: it stops a well-behaved *browser* from reading a
disallowed page's response, but it never stopped the request itself —
including the real Gemini call — from being processed first. A direct
`curl` doesn't send or care about CORS at all. This was live-proven that
same session by this repo's own maintainer's assistant, which called
`/match-recommend` directly with plain `curl` and got a full, real response
back.

Two changes closed this gap:

1. **The origin check is now an enforced gate, not just a CORS header.**
   `worker.js`'s top-level router now rejects with `403` before ever
   reaching a billed handler if `Origin` is missing or not in
   `ALLOWED_ORIGINS`. This costs a real caller nothing — every one of these
   routes is a POST with a JSON body, which browsers always attach a real
   `Origin` header to (preflight included), so Match Find/Orbit/Orbit
   Vocab's own already-working pages are unaffected. Only a bare
   script/`curl` call, or another site embedding a `fetch` to this Worker,
   is newly rejected.
2. **A hard daily global cap per feature** (`isDailyGlobalCapped`,
   `*_DAILY_GLOBAL_CAP` next to each route's existing `*_RATE_LIMIT`).
   Unlike the existing per-IP rate limit, this counts every caller
   *combined*, so it can't be outrun by spreading requests across IPs. Once
   a feature hits its daily cap, every further call for that feature
   returns `429` with no upstream Gemini call at all, for the rest of that
   day, regardless of who's calling or from where. This is the real
   financial backstop.

**Honest limit, stated plainly rather than oversold:** an `Origin` header is
just text a non-browser client can set to anything it wants, and this is a
public, open-source repo — a targeted attacker who reads this file can
trivially copy the allowed origin value verbatim. This gate stops
opportunistic/naive abuse (URL scanners, another page silently spending your
quota through its visitors' browsers) and, combined with the daily cap,
hard-bounds the worst case even against someone who does spoof it. It is
**not** real authentication — there are no user accounts here to
authenticate, and no client-side secret can ever be genuinely secret in a
fully public static site's own source. Real lock-down would need a backend
with real user identity, a materially bigger change than any route here
currently has another reason to need.

**Verification.** Verified locally with a mocked `env.RATE_LIMIT_KV` and a
mocked `global.fetch` (never touching the real Gemini API or spending any
real quota/credit) — confirmed: no-`Origin` and wrong-`Origin` requests are
rejected before the upstream call happens at all; a correct `Origin` passes
through unaffected; the daily cap kicks in exactly at its limit and never
lets a real upstream call happen past it; an unrelated/unknown path is
unaffected (still a plain `404`, not swept up by the gate).

## Sync Design

`/sync` and `/vocab-sync` (Orbit's own vs. Orbit Vocab's) use two different
pairing shapes. Match Find has no sync route at all — its own settings and
"Prefer" pick are local-only, in the viewer's own browser, never synced
anywhere (see that repo's README).

- **Orbit's `/sync`** — a plain sync code (read access, share freely) plus a
  separate manager passcode (write/delete access). Built for "one teacher
  broadcasts a schedule to many read-only student devices."
- **`/vocab-sync`** — a single passcode that's both the identifier and the
  only credential. Built for "one person's own multiple devices," where
  there's no reason to have a public read-only code at all.
- **`/odds-sync`** — the same single-passcode design for Odds Study's
  play-money account, with an 8-character passcode (32^8, about 10^12)
  short enough to type on a phone. It holds no real money or personal data.

See the top-of-file comment in `worker.js`, and the comment above each
route's handler, for the full reasoning behind each design choice — this
README only covers what's needed to deploy and consume it.

## One-Time Deploy Setup

You don't need to install anything to get started. This covers the main
`orbit-workers-proxy` Worker (`/gemini`, `/nl-edit`, `/sync`, `/vocab-sync`,
`/vocab-ai`) first, followed by the separate `sports-proxy` Worker Match
Find needs, which is a second, near-identical run of the same first three
steps against a different file.

### `orbit-workers-proxy`: initial deploy

1. Sign up for a free [Cloudflare account](https://dash.cloudflare.com/sign-up)
   (email only, no credit card).
2. Workers & Pages → Create → Create Worker, give it a name → Deploy.
3. "Edit code" → paste the entire contents of `worker.js`, then add two more
   files next to it, `locales/en.js` and `locales/zh-TW.js`, with those
   files' contents (`worker.js` imports them) → Save and Deploy.
4. Copy the Worker's URL (`https://<name>.<subdomain>.workers.dev`) — **no
   path suffix**. Every consuming app appends its own hardcoded path
   (`/gemini`, `/sync`, `/vocab-ai`, etc.) — see
   [Wiring Up a Consuming App](#wiring-up-a-consuming-app) below.

That alone gives you a live Worker with every route returning "not
configured" until you add the secrets each feature needs.

### AI features (`/gemini`, `/nl-edit`, `/vocab-ai`)

All three share one secret:

- Worker Settings → Variables and Secrets → add `GEMINI_API_KEY`
  ([get one here](https://aistudio.google.com/apikey)), type **Secret** →
  Save and Deploy.

That's it — once `GEMINI_API_KEY` is set, all three AI routes work. Nothing
else to configure per-route.

**`[placement]` matters here.** `wrangler.toml` pins
`[placement] region = "gcp:us-east4"` rather than leaving Cloudflare's
default "Smart Placement" in charge. This was a real, live-tested fix, not a
guess: Smart Placement's latency heuristic consistently ran this Worker's
Gemini-facing routes out of Cloudflare's Hong Kong colo (a very reasonable
"closest to Google's Asia-Pacific presence" pick for traffic that's mostly
Taiwan-based) — except Google's Gemini API refuses all traffic from Hong
Kong and mainland China outright, by policy, not as an occasional bad-luck
colo. `region` instead pins the Worker to whichever real datacenter has the
lowest latency to `us-east4` (Ashburn, VA) — a target confirmed live against
this same API (15/15 successful calls). This setting only takes effect via
Wrangler/CI (see
[Optional: Auto-Deploy via GitHub Actions](#optional-auto-deploy-via-github-actions)
below) — the Cloudflare dashboard's own "Settings → Placement" only exposes
the Smart toggle, not a `region` field.

Every response (including a Gemini "location not supported" error) carries
an `X-Worker-Colo` header naming the actual colo that handled it (an IATA
airport code, e.g. `IAD` = Virginia, `HKG` = Hong Kong) — useful for
confirming this is actually taking effect, or diagnosing a future report of
the same error.

### Match Find live data (`/sports-proxy`) — a separate Worker

This one is deployed **from a different file** (`sports-proxy-worker.js` +
`wrangler.sports-proxy.toml`) as its **own Worker**, not pasted into the same
one as `/gemini`/`/sync`/etc.:

1. Workers & Pages → Create → Create Worker, give it its own name (e.g.
   `sports-proxy`) → Deploy.
2. "Edit code" → paste the entire contents of `sports-proxy-worker.js` →
   Save and Deploy.
3. Copy this Worker's own URL — this is the one Match Find's and Odds
   Study's `PROXY_URL` points at (see [Wiring Up a Consuming App](#wiring-up-a-consuming-app)
   below), a *different* URL from the `orbit-workers-proxy` Worker the other
   five routes live on.

Why separate: `wrangler.toml`'s `[placement] region = "gcp:us-east4"` pin
(needed for `/gemini`/`/vocab-ai` — see the section above) is a
whole-*script* setting, not a per-route one. Sharing one Worker meant
`/sports-proxy` was being forced through that same Virginia isolate too,
even though nothing it calls (ESPN, the MLB Stats API, Jolpica, Polymarket)
has Gemini's region restriction — confirmed live via the `X-Worker-Colo`
response header returning `IAD` for a plain `/sports-proxy` request. For
Match Find's actual Taiwan-based audience, that meant every one of its
dozens of near-term/full-window/live-poll requests per refresh paid a full
Taiwan↔Virginia round trip for no reason, and was a real, live-confirmed
contributor to reports of the site going blank for 10+ seconds on first load
and refreshes taking 10-20+ seconds. Deploying this route as its own Worker
with no `[placement]` override lets Cloudflare's own default apply — run
near whichever colo actually received the request, i.e. near the real
caller.

Nothing to configure — this route needs no secret at all, it's a
host-allowlisted passthrough to public, keyless sports APIs (see
`SPORTS_PROXY_ALLOWED_HOSTS` in `sports-proxy-worker.js`). It's live the
moment this Worker is deployed. Every successful upstream response is cached
in Cloudflare's shared edge cache (per data center), keyed by the upstream
URL — so every viewer asking for the same URL shares one upstream fetch.
How long a copy lasts depends on how fast that data changes (see
`cachePolicyFor`):

| Tier | What | Fresh for | Then served instantly while refreshing, for up to |
| --- | --- | --- | --- |
| `live` | Scoreboards covering yesterday–tomorrow (UTC), live polls | 20s | — (never served expired) |
| `odds` | Polymarket `/events` pages | 20s | — (never served expired; the live-odds poll needs every tick fresh) |
| `schedule` | Scoreboards for days ≥2 away | 10 min | 1 day |
| `standings` | ESPN/MLB/Jolpica standings | 30 min | 1 day |
| `pregame-line` | ESPN core per-game odds | 1 hour | 1 day |
| `quotes` | Yahoo Finance quotes and charts over 1 or 5 days | 30s | — (never served expired: orders fill at these prices) |
| `history` | Yahoo Finance charts of a month and longer | 30 min | 1 day |
| `search` | Yahoo Finance symbol search | 1 day | 7 days |

The `X-Sports-Proxy-Cache` response header is `HIT`, `STALE` (served
while refreshing in the background) or `MISS`, `X-Sports-Proxy-Cache-Tier`
names the tier, and `X-Sports-Proxy-Age` gives a cached copy's age in
seconds.

**Trimmed Polymarket pages.** Adding `&trim=polymarket-events` to a
Gamma `/events` URL returns each event and market with only the fields
Match Find reads (`trimPolymarketEvents`) — a 100-event MLB page goes from
~11.5MB to ~0.45MB. It's opt-in so the client can fall back to the plain
passthrough if the trim (the one place this Worker parses JSON) ever
fails; the trimmed copy is cached under its own key, so the two never mix.

**Why the match list isn't built here.** Match Find's prebuilt
first-screen snapshot is built by a GitHub Action in that repo
(`.github/workflows/snapshot.yml`), not by this Worker: one build makes
~85 upstream requests and parses megabytes of JSON, well past the Workers
Free plan's 50-subrequest and 10ms-CPU limits per invocation. A batch
endpoint here (many URLs per request) was also tried and dropped: sending
~80 upstream requests at the same instant made ESPN occasionally stall one
for 7-8 seconds, holding up the whole response.

A cache hit doesn't count against
`SPORTS_PROXY_RATE_LIMIT` at all (see `handleSportsProxyRequest`'s own
comment for why this exists — without it, Match Find's own near-term +
full-window refresh tiers alone already exceeded this route's per-IP rate
limit). The optional `RATE_LIMIT_KV` binding (see
[Optional: Auto-Deploy via GitHub Actions](#optional-auto-deploy-via-github-actions)
below) can safely be the same KV namespace as `orbit-workers-proxy`'s own —
this Worker's rate-limit keys are IP-only, with no `feature` prefix to
collide with the other Worker's `gemini:`/`sync:`/`vocab-sync:`/`vocab-ai:`
keys.

### Sync features (`/sync`, `/vocab-sync`, `/odds-sync`)

Both share one Firebase project and one service-account credential:

1. Create a project at the [Firebase Console](https://console.firebase.google.com/)
   and enable Firestore.
2. Project Settings → Service accounts → Generate new private key → download
   the JSON. Treat this like a password — it grants full read/write access
   to the whole Firestore project, bypassing Firestore Security Rules
   entirely (that's the point — see below). If your Firebase project is
   managed under a school/work Google Workspace account and this button is
   greyed out, try the same key from
   [Google Cloud Console](https://console.cloud.google.com/) → IAM & Admin →
   Service Accounts → the `firebase-adminsdk-...` account → Keys → Add Key →
   Create new key → JSON. If that's blocked too, that Google account can't
   generate a key at all — use a personal Google account's own Firebase
   project instead.
3. Worker Settings → Variables and Secrets, add:
   - `FIREBASE_PROJECT_ID` (plain variable) — the Firebase project's ID.
   - `FIREBASE_CLIENT_EMAIL` (Secret) — the downloaded JSON's `client_email`.
   - `FIREBASE_PRIVATE_KEY` (Secret) — the downloaded JSON's `private_key`.
     Paste the real line breaks (the PEM content itself), not the JSON
     string's literal `\n` escapes — both are accepted, but this is the
     easiest step to get wrong.
4. (Optional but recommended) Workers & Pages → KV → Create namespace (any
   name) → back on this Worker's Settings → Bindings → Add → KV Namespace →
   variable name `RATE_LIMIT_KV` → pick the namespace you just created →
   redeploy (a Binding change needs a fresh "Deploy" to take effect). Both
   sync routes (and every AI route) share this one binding with per-feature
   key prefixes, so there's never any cross-feature interference.
5. Back in the Firebase Console's "Rules" tab, paste:
   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /{document=**} {
         allow read, write: if false;
       }
     }
   }
   ```
   The service account's access already bypasses Firestore Security Rules
   (same as the Admin SDK) — this rule only closes the *other* door: direct,
   unauthenticated client access to Firestore. That's the actual point of
   this whole Worker for the sync routes — not one more check on top of an
   open database, but removing the open database entirely. The wildcard
   covers every collection (`orbit-schedules`, `vocab-progress-sync`,
   `odds-study-accounts`, `stock-study-accounts`) so
   adding a third sync consumer later never needs this rule touched again.

Once this is done, `/sync`, `/vocab-sync` and `/odds-sync` are all live — each already
uses its own Firestore collection and its own rate-limit counters (see the
route table above), so neither can affect the other's data or quota.

## Optional: Auto-Deploy via GitHub Actions

Without this, updating either Worker means manually re-pasting its file into
the Cloudflare dashboard every time. With it, a push to `main` deploys both
automatically (`.github/workflows/deploy.yml` runs two Wrangler deploy
steps, one per `wrangler*.toml` — triggered by changes to `worker.js`,
`wrangler.toml`, `sports-proxy-worker.js`, or `wrangler.sports-proxy.toml`;
also runnable manually from the Actions tab):

1. [Cloudflare Dashboard](https://dash.cloudflare.com/) → account menu (top
   right) → My Profile → API Tokens → Create Token → **Edit Cloudflare
   Workers** template → Create. Copy the token (shown once).
2. This repo's Settings → Secrets and variables → Actions → **Secrets**, add
   `CLOUDFLARE_API_TOKEN` with that token.
3. Same page, add another Secret: `CLOUDFLARE_ACCOUNT_ID`, from the
   Cloudflare Dashboard's sidebar (or its URL).
4. **Important**: `wrangler deploy` pushes a `wrangler*.toml`'s `[vars]` and
   `[[kv_namespaces]]` as that Worker's *entire* config, replacing whatever's
   live — it does not merge with dashboard-made changes. Before relying on
   this workflow, make sure both `wrangler.toml` and
   `wrangler.sports-proxy.toml` in this repo already match what's live (the
   real `FIREBASE_PROJECT_ID`, and the real KV namespace id(s) if you're
   using `RATE_LIMIT_KV`), or the first automated deploy will silently
   overwrite them with placeholders. Secrets themselves (`GEMINI_API_KEY`,
   `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`) are never touched by
   `wrangler deploy` — they aren't stored in this repo at all, and
   `/sports-proxy` doesn't use any.
5. The same token deploys both Workers — the "Edit Cloudflare Workers"
   template grants `Workers Scripts:Edit` account-wide, not scoped to one
   script, so it can create the `sports-proxy` Worker the first time this
   runs just as readily as it updates the existing `orbit-workers-proxy`
   one.

You can also deploy from the command line instead of setting up CI — see the
comment block at the top of `wrangler.toml` (for `orbit-workers-proxy`) or
`wrangler.sports-proxy.toml` (for `sports-proxy`) for the exact `wrangler`
CLI commands (login, deploy with `-c <file>`, `secret put` for each secret,
KV namespace creation).

## Wiring Up a Consuming App

Every consumer takes exactly one setting: the Worker's base URL, **with no
path suffix** — each app's own frontend code appends its own hardcoded path.

| Repo | Where the URL goes | Env var |
| --- | --- | --- |
| Orbit | GitHub Settings → Secrets and variables → Actions → **Variables** | `PROXY_URL` (built into the client bundle by Vite — see `src/proxy-config.js`) |
| Orbit Vocab | GitHub Settings → Secrets and variables → Actions → **Variables** | `PROXY_URL` (substituted into `sync.js`/`vocab-ai.js` at build time — see `.github/workflows/pages.yml`) |
| Match Find | Hardcoded directly as the `PROXY_URL` constant in `public/app.js` | None — there's no build step left to inject a build-time variable from (its whole match list is fetched/scored live in the browser — see that repo's `public/lib/match-builder.mjs`), so this is a plain source-code constant instead |
| Odds Study | Hardcoded as the `PROXY_URL` constant in `public/lib/sources.mjs` | None — a static site with no build step, same as Match Find |
| Stock Study | Hardcoded as `PROXY_URL` in `public/lib/quotes.mjs` (and `SYNC_URL` in `public/lib/sync.mjs`) | None — a static site with no build step |

Orbit and Orbit Vocab deliberately use a GitHub Actions **Variable**, not a
Secret — this value ends up in each site's public client bundle either way
(a static site has no server to keep it hidden behind), so there's nothing
gained by treating it as one. Match Find's own hardcoded constant is the
same non-secret value, just written directly into source since it has no
build-time substitution step to use instead. Orbit and Orbit Vocab point at
the `orbit-workers-proxy` Worker's URL (their features live there); Match
Find points only at the separate `sports-proxy` Worker (see
[One-Time Deploy Setup](#one-time-deploy-setup) above for why it's a
different deployment) — it has no Gemini-backed route of its own on
`orbit-workers-proxy` anymore (see [Removed routes](#removed-routes) above
for the full history of its now-removed `/match-recommend` route). Odds
Study likewise points only at the `sports-proxy` Worker.

Leaving `PROXY_URL` unset in Orbit/Orbit Vocab/Match Find is fine either
way: that app's AI/sync features are simply unavailable, and everything else
about it works normally. Odds Study is the exception: every odds number it
shows comes through `/sports-proxy`, so without it the page has no data.

## Why One Worker for Most Routes, But Two Overall

Cloudflare's Workers Free plan's daily request cap (100,000/day) is
per-*account*, not per-Worker, so splitting `/gemini`/`/nl-edit`/`/sync`/
`/vocab-sync`/`/vocab-ai` into separate Workers would never have bought any
of the apps extra headroom — it would only have meant several KV
bindings, several sets of secrets, and several things to keep deployed
instead of one. Those five stay combined for exactly that operational
convenience.

`/sports-proxy` is the one deliberate exception, split out into its own
`sports-proxy` Worker — not for a quota reason, but because it's the one
route that must NOT share the other five's `[placement]` region pin (see
"Match Find live data" in
[One-Time Deploy Setup](#one-time-deploy-setup) above). The routes still
fully isolate their own trust boundaries and quotas from each other either
way (see the route table above, `isRateLimited` in `worker.js`, and its own
copy in `sports-proxy-worker.js`); combining most of them was purely an
operational convenience, never a reason to let one route's traffic or
secrets reach another's.

## Related Projects

- [Orbit Class](https://github.com/JayPengX/Orbit-Class) — class schedule
  dashboard; consumes `/gemini`, `/nl-edit`, and `/sync`.
- [Orbit Vocab](https://github.com/JayPengX/Orbit-Vocab) — vocabulary
  trainer; consumes `/vocab-sync` and `/vocab-ai`.
- [Match Find](https://github.com/JayPengX/Match-Find) — sports
  recommendation site; consumes `/sports-proxy` only.
- [Odds Study](https://github.com/JayPengX/Odds-Study) — educational page
  on Taiwan Sports Lottery odds math; consumes `/sports-proxy` (ESPN
  and Polymarket's Gamma API) and `/odds-sync`. It reads a subset of the fields
  `trimPolymarketEvents` keeps, so dropping a field there can break it too.
- [Stock Study](https://github.com/JayPengX/Stock-Study) — play-money
  brokerage simulator; consumes `/sports-proxy` (Yahoo Finance) and
  `/stock-sync`.

---

This repo has no user-facing site of its own — it exists purely so five
independent static sites can each have one line of server-side capability
without any of them needing to run, or pay for, a server.
