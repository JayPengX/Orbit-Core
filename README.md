# Shared Proxy

A single Cloudflare Worker (`worker.js`) that backs the optional server-side
features of three otherwise-independent static sites:

- [Orbit](https://github.com/jaypengx-collab/Orbit) - a class-schedule
  dashboard.
- [Orbit Vocab](https://github.com/jaypengx-collab/Orbit-Vocab) - a
  vocabulary trainer.
- [Match Find](https://github.com/jaypengx-collab/Match-Find) - a "what's
  worth watching today" sports site.

None of the three needs a database, a server, or its own API key for these
features to work - they just point at this one deployed Worker's URL. This
repo used to be a folder inside Orbit's own repo (`cloudflare-worker/`), but
it was never really Orbit-specific: it already served all three sites, and
keeping it inside one of its own consumers made "which repo do I even touch
to change the proxy" a real question. It now lives here, on its own, with
its own deploy pipeline, so each of the three apps only ever has to know one
thing about it: the URL.

## What it does, and who calls it

| Route | Method(s) | Used by | What it's for |
| --- | --- | --- | --- |
| `/gemini` | GET (warm-up), POST | Orbit | AI schedule-photo import - holds the real Gemini API key server-side. |
| `/nl-edit` | POST | Orbit | AI natural-language schedule edits ("把我週二第三節改成物理"). |
| `/sync` | GET/PATCH/DELETE | Orbit | Cross-device schedule sync (code + manager passcode; reads are open, writes/deletes need the passcode). |
| `/vocab-sync` | GET/PATCH/DELETE | Orbit Vocab | Cross-device learning-progress sync (single passcode, no separate read-only code). |
| `/vocab-ai` | POST | Orbit Vocab | Live, per-learner personalized mnemonics. |
| `/sports-proxy` | GET | Match Find | Host-allowlisted CORS passthrough to ESPN/the MLB Stats API/Jolpica/Polymarket's Gamma API, so the viewer's own browser can fetch and score its whole live match list directly. |

Match Find used to also have `/match-recommend`/`/match-recommend-refine`
(Gemini-based fixture scoring/validation) - removed as of that repo's
`docs/recommendation-engine-audit.md` Round 11: free-tier Gemini quota
couldn't sustain the workload, and Match Find's own deterministic
objective-score engine was always the primary source of truth for every
fixture's score anyway, so removing the AI validation layer on top cost no
real scoring quality. It also used to have `/match-dispatch` (fired a
GitHub Actions rebuild on demand) - removed once Match Find moved its own
match-building pipeline to run fully client-side (see that repo's
public/app.js) rather than on a scheduled server-side build there was ever
anything to dispatch. Match Find's own client no longer calls this Worker
for any AI/scoring/build-trigger purpose at all - only the one route
above.

Every route validates and rate-limits itself independently (see
`isRateLimited` in `worker.js` - every call site passes its own `feature`
key), so a burst of traffic against one route can never eat into another
route's, or another app's, quota. Every feature is also entirely optional
on the *consuming* app's side: not configuring a `PROXY_URL` (or its route
not being reachable) just makes that one feature unavailable, never a
broken build.

`/sync` and `/vocab-sync` (Orbit's own vs. Orbit Vocab's) use two different
pairing shapes - Match Find has no sync route at all; its own settings and
"Prefer" pick are local-only, in the viewer's own browser, never synced
anywhere (see that repo's README):

- **Orbit's `/sync`**: a plain sync code (read access, share freely) plus a
  separate manager passcode (write/delete access) - built for "one teacher
  broadcasts a schedule to many read-only student devices."
- **`/vocab-sync`**: a single passcode that's both the identifier and the
  only credential - built for "one person's own multiple devices," where
  there's no reason to have a public read-only code at all.

See the top-of-file comment in `worker.js`, and the comment above each
route's handler, for the full reasoning behind each design choice - this
README only covers what's needed to deploy and consume it.

## One-time deploy setup

You don't need to install anything to get started:

1. Sign up for a free [Cloudflare account](https://dash.cloudflare.com/sign-up)
   (email only, no credit card).
2. Workers & Pages → Create → Create Worker, give it a name → Deploy.
3. "Edit code" → paste the entire contents of `worker.js` → Save and Deploy.
4. Copy the Worker's URL (`https://<name>.<subdomain>.workers.dev`) -
   **no path suffix**. Every consuming app appends its own hardcoded path
   (`/gemini`, `/sync`, `/vocab-ai`, etc.) - see "Wiring up a
   consuming app" below.

That alone gives you a live Worker with every route returning "not
configured" until you add the secrets each feature needs:

### AI features (`/gemini`, `/nl-edit`, `/vocab-ai`)

All three share one secret:

- Worker Settings → Variables and Secrets → add `GEMINI_API_KEY`
  ([get one here](https://aistudio.google.com/apikey)), type **Secret** →
  Save and Deploy.

That's it - once `GEMINI_API_KEY` is set, all three AI routes work. Nothing
else to configure per-route.

**`[placement]` matters here.** `wrangler.toml` pins
`[placement] region = "gcp:us-east4"` rather than leaving Cloudflare's
default "Smart Placement" in charge. This was a real, live-tested fix, not
a guess: Smart Placement's latency heuristic consistently ran this Worker's
Gemini-facing routes out of Cloudflare's Hong Kong colo (a very reasonable
"closest to Google's Asia-Pacific presence" pick for traffic that's mostly
Taiwan-based) - except Google's Gemini API refuses all traffic from Hong
Kong and mainland China outright, by policy, not as an occasional bad-luck
colo. `region` instead pins the Worker to whichever real datacenter has the
lowest latency to `us-east4` (Ashburn, VA) - a target confirmed live against
this same API (15/15 successful calls). This setting only takes effect via
Wrangler/CI (see "Optional: auto-deploy via GitHub Actions" below) - the
Cloudflare dashboard's own "Settings → Placement" only exposes the Smart
toggle, not a `region` field.

Every response (including a Gemini "location not supported" error) carries
an `X-Worker-Colo` header naming the actual colo that handled it (an IATA
airport code, e.g. `IAD` = Virginia, `HKG` = Hong Kong) - useful for
confirming this is actually taking effect, or diagnosing a future report of
the same error.

### Match Find live data (`/sports-proxy`)

Nothing to configure - this route needs no secret at all, it's a
host-allowlisted passthrough to public, keyless sports APIs (see
`SPORTS_PROXY_ALLOWED_HOSTS` in `worker.js`). It's live the moment this
Worker is deployed. Every successful upstream response is cached for
`SPORTS_PROXY_CACHE_TTL_SECONDS` (20s) in Cloudflare's shared edge cache,
keyed by the upstream URL alone - so every viewer asking for the same
scoreboard/odds URL within that window shares one upstream fetch instead of
each paying for their own, and a cache hit doesn't count against
`SPORTS_PROXY_RATE_LIMIT` at all (see `handleSportsProxyRequest`'s own
comment for why this exists - without it, Match Find's own near-term +
full-window refresh tiers alone already exceeded this route's per-IP rate
limit).

### Sync features (`/sync`, `/vocab-sync`)

Both share one Firebase project and one service-account credential:

1. Create a project at the [Firebase Console](https://console.firebase.google.com/)
   and enable Firestore.
2. Project Settings → Service accounts → Generate new private key → download
   the JSON. Treat this like a password - it grants full read/write access
   to the whole Firestore project, bypassing Firestore Security Rules
   entirely (that's the point - see below). If your Firebase project is
   managed under a school/work Google Workspace account and this button is
   greyed out, try the same key from
   [Google Cloud Console](https://console.cloud.google.com/) → IAM & Admin →
   Service Accounts → the `firebase-adminsdk-...` account → Keys → Add Key →
   Create new key → JSON. If that's blocked too, that Google account can't
   generate a key at all - use a personal Google account's own Firebase
   project instead.
3. Worker Settings → Variables and Secrets, add:
   - `FIREBASE_PROJECT_ID` (plain variable) - the Firebase project's ID.
   - `FIREBASE_CLIENT_EMAIL` (Secret) - the downloaded JSON's `client_email`.
   - `FIREBASE_PRIVATE_KEY` (Secret) - the downloaded JSON's `private_key`.
     Paste the real line breaks (the PEM content itself), not the JSON
     string's literal `\n` escapes - both are accepted, but this is the
     easiest step to get wrong.
4. (Optional but recommended) Workers & Pages → KV → Create namespace (any
   name) → back on this Worker's Settings → Bindings → Add → KV Namespace →
   variable name `RATE_LIMIT_KV` → pick the namespace you just created →
   redeploy (a Binding change needs a fresh "Deploy" to take effect). Both
   sync routes (and every AI route) share this one binding with
   per-feature key prefixes, so there's never any cross-feature interference.
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
   (same as the Admin SDK) - this rule only closes the *other* door: direct,
   unauthenticated client access to Firestore. That's the actual point of
   this whole Worker for the sync routes - not one more check on top of an
   open database, but removing the open database entirely. The wildcard
   covers every collection (`orbit-schedules`, `vocab-progress-sync`) so
   adding a third sync consumer later never needs this rule touched again.

Once this is done, `/sync` and `/vocab-sync` are both live - each already
uses its own Firestore collection and its own rate-limit counters (see the
table above), so neither can affect the other's data or quota.

### Optional: auto-deploy via GitHub Actions

Without this, updating `worker.js` means manually re-pasting it into the
Cloudflare dashboard every time. With it, a push to `main` deploys
automatically (`.github/workflows/deploy.yml`, triggered by changes to
`worker.js` or `wrangler.toml`; also runnable manually from the Actions tab):

1. [Cloudflare Dashboard](https://dash.cloudflare.com/) → account menu (top
   right) → My Profile → API Tokens → Create Token → **Edit Cloudflare
   Workers** template → Create. Copy the token (shown once).
2. This repo's Settings → Secrets and variables → Actions → **Secrets**, add
   `CLOUDFLARE_API_TOKEN` with that token.
3. Same page, add another Secret: `CLOUDFLARE_ACCOUNT_ID`, from the
   Cloudflare Dashboard's sidebar (or its URL).
4. **Important**: `wrangler deploy` pushes `wrangler.toml`'s `[vars]` and
   `[[kv_namespaces]]` as the Worker's *entire* config, replacing whatever's
   live - it does not merge with dashboard-made changes. Before relying on
   this workflow, make sure `wrangler.toml` in this repo already matches
   what's live (the real `FIREBASE_PROJECT_ID`, and the real KV namespace id
   if you're using `RATE_LIMIT_KV`), or the first automated deploy will
   silently overwrite them with placeholders. Secrets themselves
   (`GEMINI_API_KEY`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`) are
   never touched by `wrangler deploy` - they aren't stored in this repo at
   all.

You can also deploy from the command line instead of setting up CI - see the
comment block at the top of `wrangler.toml` for the exact `wrangler` CLI
commands (login, deploy, `secret put` for each secret, KV namespace
creation).

## Wiring up a consuming app

Every consumer takes exactly one setting: the Worker's base URL, **with no
path suffix** - each app's own frontend code appends its own hardcoded path.

| Repo | Where the URL goes | Env var |
| --- | --- | --- |
| Orbit | GitHub Settings → Secrets and variables → Actions → **Variables** | `PROXY_URL` (built into the client bundle by Vite - see `src/proxy-config.js`) |
| Orbit Vocab | GitHub Settings → Secrets and variables → Actions → **Variables** | `PROXY_URL` (substituted into `sync.js`/`vocab-ai.js` at build time - see `.github/workflows/pages.yml`) |
| Match Find | Hardcoded directly as a `PROXY_URL` constant in `public/app.js` | None - there's no build step left to inject a build-time variable from (its whole match list is fetched/scored live in the browser - see that repo's public/lib/match-builder.mjs), so this is a plain source-code constant instead |

Orbit/Orbit Vocab deliberately use a GitHub Actions **Variable**, not a
Secret - this value ends up in each site's public client bundle either way
(a static site has no server to keep it hidden behind), so there's nothing
gained by treating it as one; Match Find's own hardcoded constant is the
same non-secret value, just written directly into source since it has no
build-time substitution step to use instead. If you're running all three
sites yourself, all three apps point at the same deployed Worker, just a
different path per feature.

Leaving `PROXY_URL` unset in Orbit/Orbit Vocab is fine: that app's AI/sync
features are simply unavailable, and everything else about it works
normally. Match Find has no such "unset" state - update its own hardcoded
constant directly if you deploy your own Worker for it.

## Why one Worker instead of three

Cloudflare's Workers Free plan's daily request cap (100,000/day) is
per-*account*, not per-Worker, so splitting these routes into separate
Workers would never have bought any of the three apps extra headroom - it
would only have meant three KV bindings, three sets of secrets, and three
things to keep deployed instead of one. The routes still fully isolate their
own trust boundaries and quotas from each other (see the table above and
`isRateLimited` in `worker.js`); combining them was purely an operational
convenience, never a reason to let one route's traffic or secrets reach
another's.
