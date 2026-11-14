# Starting Orbit in a new workspace

How to pick Orbit up somewhere new (another Claude account or project, Claude
Code on a computer, or another AI agent) with nothing but these repos and the
accounts in §3. Everything needed to build, run and change Orbit is in GitHub;
this page lists what isn't and how to start. Written 2026-11-14; §5 is the
state that day and goes stale, everything else changes only when an account,
a secret or a schedule does (update it in the same push).

## 1. Start a new agent

1. **Give it the repos.** GitHub access (read and push to `main`) to the
   twelve repos of `JayPengX`: Orbit-Core, Orbit-Sports, Orbit-Transit,
   Orbit-Weather, Orbit-Class, Orbit-Money, Orbit-News, Orbit-Words,
   Orbit-Beats, Orbit-Law, Orbit-Securities, Orbit-Showcase.
2. **Check them out side by side**, under those exact names, in one folder
   (the tools and every app's tests reach `../Orbit-Core`):
   ```sh
   for r in Core Sports Transit Weather Class Money News Words Beats Law Securities Showcase; do
     git clone https://github.com/JayPengX/Orbit-$r.git
   done
   ```
   Node 22 (what the deploys use). Orbit-Class: `npm ci` (a Vite app);
   the rest need no install. `npm test` in any repo. The screenshot and
   preview tools need Playwright with Chromium and WebKit (`tools/README.md`).
3. **Paste this as its first message:**
   > You're taking over Orbit, a family of home-screen web apps for Taiwan.
   > Read `Orbit-Core/CLAUDE.md` first (what to read for which task; it is
   > written for any agent, not only Claude), then `Orbit-Core/docs/RULEBOOK.md`
   > (every rule the owner, Jay, has set) and `Orbit-Core/HANDOFF.md` §5 (where
   > the work stands). Follow the rulebook as standing instructions: push
   > straight to `main` with `sh ../Orbit-Core/tools/push.sh`, never a branch
   > or a PR. Talk to Jay in plain words; he doesn't read code.
4. **Nothing else is needed to work:** no key ever sits on the agent's
   machine. Deploys run in GitHub Actions with the secrets in §3.2; Workers
   and data live in Cloudflare. `node tools/preview.mjs <app> --live` reads
   real data through the Workers' open dev doors, no secret.

**Other AI agents:** `AGENTS.md` points here. `CLAUDE.md` and the rulebook
use no Claude-only feature; where they say "thread" or "decision card", read
"a separate task" and "a multiple-choice question with an Other option".

## 2. How Jay works with the agent

All of it is in `docs/RULEBOOK.md` §1. The parts the old project's tooling
carried, kept here so a new one can copy them:

- Jay sends asks, screenshots from his iPhone and iPad, and 除錯紀錄 from the
  Pass sheet; he checks in a few times a day and expects work to carry on
  while he's away (never idle, never wait on him for what can be undone).
- Questions only when a choice is truly his: a few tap options plus Other,
  never a typed question, never overnight.
- Reports: a short morning brief; when a round is done, one short message of
  what changed and what he should test on his phone; a recap is one
  coherent report written fresh, never stacked dated sections or 「新」 marks.
- One task, one conversation, named for its goal; close it when the work is
  done and checked.
- Files for Jay (reports, screenshot sets) go somewhere he can open them,
  never into a repo (§4).

## 3. What lives outside GitHub

### 3.1 Accounts Jay must keep

| Account | What Orbit uses it for | If it's lost |
| --- | --- | --- |
| **GitHub** (`JayPengX`) | The code, every deploy (Actions) and the secrets in §3.2 | Everything; keep 2-factor recovery codes |
| **Cloudflare** | Every Worker (§3.3), the data (§3.4), the domain `jaypengx.com` (registered and its DNS here; the one yearly bill: renew it) | Every app goes dark; the domain lost means every Pass passkey and sign-in breaks (they belong to the domain) |
| **Google Cloud** | Maps (a browser key locked to the website: Maps JavaScript API only), a server key (Weather, Air Quality, Places (New), Routes, Cloud Translation), Gemini (AI Studio key); billing linked, used inside the free amounts | Transit's map and trips, Weather, translation, part of the AI |
| **Anthropic Console** | `ANTHROPIC_API_KEY` (the apps' AI), `ANTHROPIC_CREDIT_KEY` (its own workspace, batch jobs in `tools/credit/`); prepaid | The AI answers fall back to the other makers |
| **OpenAI Platform** | `OPENAI_API_KEY`; prepaid | As above |
| **中央氣象署 open data** (CWA) | `CWA_KEY`: forecasts, warnings, radar | Weather |
| **環境部 open data** (MOENV) | `MOENV_KEY`: air quality | Weather's air |
| **TDX** (運輸資料流通服務) | `TDX_CLIENT_ID`, `TDX_CLIENT_SECRET`: buses, trains, bikes (free tier from 2026-12-01) | Transit |
| **司法院 open data** | `JDOC_USER`, `JDOC_PASS` (Orbit-Law's secrets): court rulings | Law's 裁判 |
| **Firebase** (old) | `FIREBASE_PRIVATE_KEY`, kept only until 2026-12-05 for sign-ins older than 2026-10-05 | Nothing after 12-05: then delete the key and the Firebase project |
| **Cloudflare Email Routing** (in the Cloudflare account) | Mail from the domain (`mail.js`, binding `MAIL`): the admin alert mails and 寫信 to the owner's own inbox, which must be a verified destination address there; free | No alert mails |
| **Resend** (if set up) | `RESEND_API_KEY`: mail to anyone else (the Pass's recovery email `pass-mail.js`, 寫信 to others); free plan, 90 a day kept | Recovery email and 寫信 to others stay off |
| **Jay's inbox** | Where GitHub's failed-run mails and the admin alerts go | Missed alerts |
| **Jay's Apple devices** | The admin pass and passkeys (iCloud Keychain) | Sign in with the admin pass, add passkeys again |

### 3.2 Every secret, by where it lives (names only)

Values are never written anywhere else. The admin panel's system report and
`audit.yml` (run by hand) show which are set, never their values.

- **GitHub › Orbit-Core › Settings › Secrets › Actions:**
  `CLOUDFLARE_API_TOKEN` (deploys; needs Workers, D1 and the zone's DNS Edit),
  `CF_GUARD_TOKEN` (the guard reads the bill), `ECO_TOKEN_SECRET`,
  `ECO_ADMIN_TOKEN`, `DATA_PUSH_SECRET`, `LAW_BUILD_KEY`,
  `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_CREDIT_KEY`.
  `deploy.yml` and `deploy-guard.yml` copy the Worker ones into the Workers.
- **GitHub › Orbit-Law:** `CLOUDFLARE_API_TOKEN`, `LAW_BUILD_KEY` (the same
  value as Orbit-Core's), `JDOC_USER`, `JDOC_PASS`.
- **GitHub › every other app repo:** `CLOUDFLARE_API_TOKEN` (its own site's deploy).
- **Cloudflare › the proxy Worker (`orbit-workers-proxy`) only, typed by hand**
  (no copy in GitHub; re-enter them from each provider if the Worker is
  rebuilt): `GEMINI_API_KEY`, `GOOGLE_MAPS_KEY`, `GOOGLE_MAPS_BROWSER_KEY`,
  `GOOGLE_WEATHER_KEY`, `GOOGLE_TRANSLATE_KEY` (falls back to the weather
  key), `CWA_KEY`, `MOENV_KEY`, `TDX_CLIENT_ID`, `TDX_CLIENT_SECRET`,
  `GH_ACTIONS_TOKEN` (a GitHub token so the admin panel's 部署 and the cron
  can start workflows), `FIREBASE_PRIVATE_KEY` (until 12-05),
  `RESEND_API_KEY` (when mail is set up).

**Never change `ECO_TOKEN_SECRET`.** Every pass is stored hashed with a
pepper made from it: a new value locks every account out. Keep a copy of it
somewhere safe outside GitHub (GitHub never shows a secret again).
`ECO_ADMIN_TOKEN` opens the admin panel. Everything else can be replaced
with a new key from its provider.

### 3.3 Cloudflare: the Workers

`orbit-workers-proxy` (`wrangler.toml`: every route, the Pass, the crons),
`gemini-relay` (pinned to Taiwan; Gemini and the Taiwan-only sites),
`quota-guard` (reads the bill, paces), `orbit-site` (the hostnames), and one
assets Worker per site: `orbit-<slug>` for each app, `orbit-pass` (the kit,
`/pass/`, `/app/`), `orbit-home` (Showcase and the homepage). All on the
Free plan. Every one is rebuilt by its repo's deploy; nothing in them is
hand-made except the hand-typed secrets above. Details: `MAP.md` §1, §4.2, §10.

### 3.4 Cloudflare: the data (the only copy)

- **D1 `orbit-store`**: every account, wallet and app's saved data, history,
  AI and quota counts. Copied whole to R2 `private/store/` every night
  (14 nights plus each month's first, kept a year).
- **R2 `orbit-data`**: built data (sports, news, buses, law packs), the
  nightly store copies.
- **KV `RATE_LIMIT_KV`**: counters, the guard's state and the push notices'
  key pair (lost: every device has to allow notices again).
- **Durable Objects**: F1's live log, the door, the Runner (rebuilt from code).

To move to another Cloudflare account: export D1 (`wrangler d1 export`),
copy R2's buckets, keep the domain on the new account, enter the secrets,
then run each repo's deploy. The KV ids in `wrangler.toml` and
`wrangler.guard.toml` change with the account.

### 3.5 If the GitHub owner changes

31 files name `JayPengX` (workflows that start each other, the builders'
GitHub reads, `kit/apps.mjs`): `grep -rl JayPengX` in every repo and change
them together. GitHub turns off a public repo's scheduled workflows after 60
days without a commit: re-enable them in each repo's Actions tab.

## 4. What the old Claude project held (not needed to build or run)

- **Project memory**: the notes behind the rules (why each was set, Jay's
  own words, history). Every standing rule from it is in `docs/RULEBOOK.md`
  or an app's `MAP.md`. A private copy was packed for Jay (it names his
  school and inbox, so it never goes in these public repos); a new agent
  can read it for background, never as rules over the rulebook.
- **The shared folder**: reports, screenshot sets, the human-testing
  checklist, Jay's school plan and recaps (about 2 GB, most of it
  screenshots). Download what you want to keep; nothing in it is code.
- **Scheduled check-ins**: none. Every scheduled job runs in Cloudflare or
  GitHub Actions (below) and keeps running without any agent.

### Scheduled jobs (Taiwan time)

| Where | When | What |
| --- | --- | --- |
| Proxy Worker crons | every minute (even and odd) | Live sports, builders, backups at 04:30, the Runner's work |
| `quota-guard` cron | every 5 minutes | Reads the bill, paces, warns at 50/75/90% |
| Orbit-Core `free-watch.yml` | every 3 hours | Pages, routes, crons, free amounts, AI balances; a failure mails Jay |
| Orbit-Core `flight.yml` | every 10 minutes | 專注飛行's flight pool |
| Orbit-Core `news-site.yml`, `news-clips.yml` | hourly, half-hourly | News's site and the clips in Taiwan's articles |
| Orbit-Core `buses.yml` | Sundays 03:07 | Bus packs from GTFS |
| Orbit-Core `deploy.yml` | once, 2026-12-06 11:17 | Takes `FIREBASE_PRIVATE_KEY` off |
| Orbit-Law `data.yml` | 03:30, 11:00, 17:00, 21:00 | Laws, councils, 代表會 |
| Orbit-Law `rulings.yml` | hourly, works 00:00–05:45 | 司法院 rulings (open only those hours) |
| Orbit-Law `town-hear.yml` | 02:00 | 代表會 recordings to text |
| Orbit-Sports `deploy.yml` | every 6 hours | Rebuilds the site's data |
| Orbit-Showcase `deploy.yml` | 10:17 | Re-records the live demos |

## 5. Where the work stands (2026-11-14)

- **The plan Jay approved on 11-12:** features stop Sunday 11-15 at night;
  Monday and Tuesday are fixes only, with every automated check run again;
  stable by Wednesday 11-18. 418 bugs were fixed in the 11-13 round.
- **Under way on 11-14:** reopening public Pass sign-up with levels (a pass
  someone makes for themselves gets no AI or anything billable, enforced by
  the server; only passes the admin issues get AI); the Pass's recovery email
  (built, off until a mail sender is set up); sending mail from the domain;
  usage analytics and a privacy policy; setting up an Orbit before adding it
  to the home screen (several Orbits, single-app ones too); Orbit's tabs,
  live-trip pill and loading; smooth loading and scrolling; a security
  audit; the Pass site and homepage redesign; Showcase as the flagship site;
  Law's 代表會 pages, votes, bills and rulings (rulings read through the
  Taiwan relay; confirm the early-morning run).
- **Dates to watch:** 11-15 the Gemini bill (still high would mean a leaked
  key: make a new one); 12-01 TDX's free tier starts (check Transit on
  12-02); 12-05 the Firebase key goes; 12-31 Gemini Flash's price doubles;
  the domain's renewal (Cloudflare › Domain Registration).
- **AI money:** prepaid balances are small (the Anthropic credit key's
  balance was empty on 11-14); `free-watch` warns a week before one runs
  out. Re-type balances with `build.yml` job `ai-money`.
