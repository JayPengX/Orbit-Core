# Shared Proxy

The server side of **Quadra**: Quadra Securities, Quadra Play, Quadra
Fixtures and Quadra Hub, with Orbit Class beside them. One account, the
**Quadra Pass**, works in every app, and it is the only place anything is
saved.

| App | Repo | Live |
| --- | --- | --- |
| Quadra Securities | [Quadra-Securities](https://github.com/JayPengX/Quadra-Securities) | https://jaypengx.github.io/Quadra-Securities/ |
| Quadra Play | [Quadra-Play](https://github.com/JayPengX/Quadra-Play) | https://jaypengx.github.io/Quadra-Play/ |
| Quadra Fixtures | [Quadra-Fixtures](https://github.com/JayPengX/Quadra-Fixtures) | https://jaypengx.github.io/Quadra-Fixtures/ |
| Quadra Hub | [Quadra-Hub](https://github.com/JayPengX/Quadra-Hub) | https://jaypengx.github.io/Quadra-Hub/ |
| Orbit Class | [Orbit-Class](https://github.com/JayPengX/Orbit-Class) | https://jaypengx.github.io/Orbit-Class/ |

## Table of Contents

- [The two Workers](#the-two-workers)
- [The Quadra Pass (`/eco`)](#the-quadra-pass-eco)
- [Keeping the store clean](#keeping-the-store-clean)
- [The shared kit and brand](#the-shared-kit-and-brand)
- [One-Time Deploy Setup](#one-time-deploy-setup)
- [Optional: Auto-Deploy via GitHub Actions](#optional-auto-deploy-via-github-actions)
- [Why One Worker for Most Routes, But Two Overall](#why-one-worker-for-most-routes-but-two-overall)

## The two Workers

- **`orbit-workers-proxy`** (`worker.js`, `eco.js`, `eco-admin.js`,
  `kambi.js`, `quadra-token.js`, `wrangler.toml`):

  | Route | What |
  | --- | --- |
  | `/eco` | The Quadra Pass (below) |
  | `/gemini`, `/nl-edit` | Orbit Class's AI schedule-photo import and natural-language edits; the Gemini key stays here |
  | `/kambi` | The last live data of Kambi matches Quadra Play has bets on (a 10-minute cron keeps it) |

- **`sports-proxy`** (`sports-proxy-worker.js`, `wrangler.sports-proxy.toml`):
  `/sports-proxy`, a host-allowlisted passthrough to ESPN, the MLB Stats
  API, Jolpica, Polymarket, Kambi and Yahoo Finance, with trimming and edge
  caching per source (see the file's comments).

Every route but signing in needs a Quadra Pass session (`qt=`), counted per
session in memory; only the sign-in calls and the daily cap on billed Gemini
calls use KV. The old per-app sync routes (`/sync`, `/vocab-sync`,
`/odds-sync`, `/stock-sync`) and `/vocab-ai` are gone.

## The Quadra Pass (`/eco`)

`eco.js` (tests in `tests/eco.test.mjs`, `npm test`). A pass is a random
10-character code (32^10), stored only as its SHA-256, which is the
account's document id.

- **Devices never keep the pass.** Signing in (with the pass, or a device
  code) gives the device a refresh token (60 days, renewed each use) and the
  app a 20-minute session token (`quadra-token.js`, HMAC with
  `ECO_TOKEN_SECRET`, or one derived from `FIREBASE_PRIVATE_KEY` until
  that's set). The pass is shown once when it's made or changed.
- **One app at a time**: the session that signed in or claimed last is the
  live one (`wallet.live`); a write from any other answers
  `409 ECO_SESSION_MOVED`.
- **The wallet** (`eco-wallets`, JSON the Worker merges): `entries` (money
  in or out of the one NT$ pool, fixed ids so nothing counts twice),
  `snap` (each app's latest figure), `settings`, `apps`, `inbox`.
  Writes read-merge-write under Firestore's `updateTime` precondition.
- **App data** in each app's collection under the same id:
  `stock-study-accounts`, `odds-study-accounts`, `match-find-settings`,
  `vocab-progress-sync`, `orbit-quadra`.
- **Quadra Plus**, the one membership: NT$490 a Taiwan month as the entry
  `eco:plus:<YYYY-MM>` (only this Worker writes `eco:` ids; an app's write
  of one is dropped), renewed with the payday on the month's first sign-in
  or read while the `plus` setting is on and the pool covers it. A month no
  app is opened is never charged. Apps read membership from that entry
  alone (the kit's `plusMember`, `plusMonths`). A member also gets a
  NT$200 free bet each Taiwan week (`eco:fb:<Monday>`, `plusBonusEntries`).
  Plus is for Play and Securities (the kit's `PLUS`): in Play the weekly bet,
  a parlay boost ×1.5 and a cheaper cash-out; in Securities commission at
  2.8折, half the FX spread and cheaper margin loans. The pass's avatar and
  frame (set in Quadra Hub) show only while Plus is on.
  The kit tells members when it arrives and three days before a renewal
  (`plusNotices`), and the Plus sheet shows what Plus gave back this month
  and since joining (`plusReturns`, `plusTenure`).
- **VIP cashback:** once a Taiwan month is over, its gaming stakes in Play
  (bets, lottery, scratch; less refunds) pay back 0.5-1.5% by tier
  (`VIP`, `vipEntries`: `eco:vip:<month>`, from 2026-10).
- **Welcome:** after the first paid bet in Play, a NT$200 free bet
  (`eco:fb:welcome`, `welcomeEntries`). Reads, sign-ins and writes all add
  what's due (fixed ids, so never twice).
- **The allowance** on any sign-in or read: NT$30,000 to open a new pass,
  then each Taiwan month an amount by what the account is worth (the pool
  plus Securities' `snap.stock.holdings`): NT$8,000 under NT$40,000, 4,000
  under 100,000, 1,500 under 250,000, 500 above (`PAY_TIERS`, v7). Months
  missed are paid on return, stepping down as they land. The opening money
  and the allowance are the only money Quadra gives (v7).
- **Only money moves through entries:** `cleanEntry` takes entries of
  Securities (`stock`) and Play (`odds`) only; `eco:` ids are this Worker's.
  Quadra Hub keeps its word progress in `vocab-progress-sync` and writes no
  wallet entries.
- **The reset** (once, `eco:rebase:v3`, −NT$80,000): every account that
  opened on the old NT$110,000 comes down to the new NT$30,000. One that
  opened with less (Securities' NT$100,000 alone, before Play had its own
  NT$10,000; Securities reports its opening as `snap.stock.opened`) gets the
  difference back once (`eco:rebase:v3fix`). The part of an overdraft the
  reset made costs no interest, and what was charged on it came back once
  (`eco:odback:v3`).
- **Overdrafts are allowed:** the pool can go below zero (after the reset,
  or anything else); spending stops until it's covered, selling and cash
  outs still work, and it costs 1% a month (`eco:od:<month>`, charged with
  the allowance). Securities has 賣出補足, the fewest sales that cover it. The numbers come
  from `tools/economy.mjs` (`node tools/economy.mjs` prints each kind of
  user's month under the current and the old settings).

| Call | What |
| --- | --- |
| `POST { op: 'create', app }` | A new pass, signed in (the pass comes back this once) |
| `POST { op: 'login', passcode, app }` | Sign in on this device |
| `POST { op: 'refresh', refresh, app, claim?, data?, inbox? }` | A session (and a renewed refresh token); `claim` makes this app live |
| `GET /eco?qt=T[&app=A][&inbox=1]` | The wallet, pool and app A's data |
| `PATCH /eco?qt=T&app=A` `{ payload?, wallet? }` | App A's data and/or a wallet change (live session only) |
| `DELETE /eco?qt=T[&app=A][&inbox=ID]` | The account, one app's data, or one inbox item |
| `POST { op: 'pair-create', qt }` / `{ op: 'pair-redeem', code, app }` | A device code (8 characters, 10 minutes, once) and signing in with it |
| `POST { op: 'handoff', qt }` / `{ op: 'redeem', handoff, app }` | A sealed sign-in (3 minutes) for a link to another app; home-screen apps don't share storage |
| `POST { op: 'plus', qt, on, plan }` | Quadra Plus: join (`on: true`; `plan: 'month'`: the first month ever free, later the rest of the month's share of NT$490; `plan: 'year'`: NT$4,900 for twelve months at once) or stop renewing (`on: false`; paid months stay). Live app only |
| `POST { op: 'signout-all', qt }` | Every other device signed out; this one comes back signed in |
| `POST { op: 'rotate', qt }` | A new pass for the same account; the old one stops working, every other device is signed out |
| `POST { op: 'merge', qt, sources: [{ passcode }] }` | Other passes into this one (their data, or its inbox; their money), then deleted |
| `POST { op: 'share-create', qt }` / `{ op: 'share-redeem', qt, key }` | Orbit Class: a key (8 characters, a day) that gives another pass a copy of the schedule |

Sign-in calls are limited per IP an hour (create 20, login and device codes
30, merges 20).

## Keeping the store clean

`eco-admin.js`: `POST /eco { op: 'admin', token, action: 'scan' | 'clean' }`
counts what's in Firestore and removes anything that isn't Quadra data:
retired collections (`orbit-schedules`, `eco-links`, `stock-study-leagues`),
app documents with no pass behind them, orphaned inbox items, expired device
codes and share keys, and in every wallet what no app uses any more
(`tidyWallet`): entries of retired apps (Rewards' points, games, missions
and shop; their net NT$ kept as one `eco:rebase:hub` entry so no balance
moves), retired settings (`RETIRED_SETTINGS`), and an avatar or frame on a
pass without Plus. `scan` reports what `clean` would do (`wouldRetire`). It
runs in bounded batches
(`clean` again until `done`). The token is checked against `ADMIN_TOKEN_HASH`;
it's empty (off) unless a clean-up is under way.

## The shared kit and brand

`kit/quadra.mjs` and `kit/quadra.css` are every app's shared account code
and look: the sign-in screen (pass or device code), the one-time new-pass
screen, the account sheet (Add a device, sign out elsewhere, change the
pass, notifications), the one-app-at-a-time notice, notifications (an
in-app banner, system notices when allowed), the recommendation engine,
help links and the tab bar. `node kit/sync.mjs` copies them into every app
(never edit an app's copy). `brand/generate.mjs [app…]` draws every app's
icons and link cards from `brand/marks.mjs`.

## One-Time Deploy Setup

You don't need to install anything to get started. This covers the main
`orbit-workers-proxy` Worker (`/eco`, `/gemini`, `/nl-edit`, `/kambi`) first,
followed by the separate `sports-proxy` Worker Match
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

### AI features (`/gemini`, `/nl-edit`)

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

### Live data (`/sports-proxy`) — a separate Worker

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

### The Quadra Pass store (Firestore)

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

Once this is done, `/eco` is live.

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
- [Orbit Vocab](https://github.com/JayPengX/Quadra-Words) — vocabulary
  trainer; consumes `/vocab-sync` and `/vocab-ai`.
- [Match Find](https://github.com/JayPengX/Quadra-Fixtures) — sports
  recommendation site; consumes `/sports-proxy` only.
- [Odds Study](https://github.com/JayPengX/Quadra-Sportsbook) — educational page
  on Taiwan Sports Lottery odds math; consumes `/sports-proxy` (ESPN
  and Polymarket's Gamma API) and `/odds-sync`. It reads a subset of the fields
  `trimPolymarketEvents` keeps, so dropping a field there can break it too.
- [Stock Study](https://github.com/JayPengX/Quadra-Securities) — play-money
  brokerage simulator; consumes `/sports-proxy` (Yahoo Finance) and
  `/stock-sync`.

---

This repo has no user-facing site of its own — it exists purely so five
independent static sites can each have one line of server-side capability
without any of them needing to run, or pay for, a server.
