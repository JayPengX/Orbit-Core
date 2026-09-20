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
| `/match-recommend` | POST | Match Find | Daily "which fixture is worth watching" scoring, called a handful of times a day by Match Find's own scheduled build - never per visitor. |
| `/match-recommend-refine` | POST | Match Find | A small, rare Pro-tier-model follow-up for fixtures that came out genuinely contesting the same time slot on the first pass. |
| `/sports-proxy` | GET | Match Find | Host-allowlisted CORS passthrough to ESPN/MLB Stats API/Jolpica, so the viewer's own browser can poll live scores/odds directly. |
| `/match-dispatch` | POST | Match Find | Fires Match Find's own GitHub Actions build on demand, so an ordinary visitor's "重新整理資料"/"AI 重新評估" button can trigger a real rebuild. |

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
   (`/gemini`, `/sync`, `/match-recommend`, etc.) - see "Wiring up a
   consuming app" below.

That alone gives you a live Worker with every route returning "not
configured" until you add the secrets each feature needs:

### AI features (`/gemini`, `/nl-edit`, `/vocab-ai`, `/match-recommend`, `/match-recommend-refine`)

All five share one secret:

- Worker Settings → Variables and Secrets → add `GEMINI_API_KEY`
  ([get one here](https://aistudio.google.com/apikey)), type **Secret** →
  Save and Deploy.

That's it - once `GEMINI_API_KEY` is set, all five AI routes work. Nothing
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

Nothing to configure - this route needs no secret at all, it's a plain
host-allowlisted passthrough to public, keyless sports APIs (see
`SPORTS_PROXY_ALLOWED_HOSTS` in `worker.js`). It's live the moment this
Worker is deployed.

### Match Find on-demand rebuilds (`/match-dispatch`)

1. Create a fine-grained GitHub Personal Access Token scoped to **only**
   the `Match-Find` repository, with **Actions: Read and write** permission
   and nothing else: GitHub → Settings → Developer settings → Fine-grained
   tokens → Generate new token → Repository access: "Only select
   repositories" → `Match-Find` → Permissions → Actions → Read and write.
2. Worker Settings → Variables and Secrets → add `MATCH_FIND_DISPATCH_TOKEN`
   (the token from step 1), type **Secret** → Save and Deploy.

That's it - `/match-dispatch` is a completely separate secret from
`GEMINI_API_KEY`, scoped narrowly enough that a leak of it could only ever
trigger extra Match Find builds, never touch this Worker's other features,
Match Find's code, or any other repository.

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
| Match Find | GitHub Settings → Secrets and variables → Actions → **Variables** | `PROXY_URL` (read by `scripts/build-data.mjs` at build time only, for `/match-recommend`/`/match-recommend-refine` - never shipped to the browser: Match Find's client has no server-side sync or any other network call besides fetching its own `matches.json`) |

All three deliberately use a GitHub Actions **Variable**, not a Secret -
this value ends up in each site's public client bundle either way (a static
site has no server to keep it hidden behind), so there's nothing gained by
treating it as one. If you're running all three sites yourself, all three
`PROXY_URL` values are identical - the same deployed Worker, just a
different path per feature.

Leaving `PROXY_URL` unset in any of the three apps is fine: that app's
AI/sync features are simply unavailable, and everything else about it works
normally.

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
