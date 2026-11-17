# Starting Orbit in a new workspace

How to pick Orbit up somewhere new (another Claude account or project, Claude
Code on a computer, or another AI agent) with nothing but these repos and the
accounts in §3. Everything needed to build, run and change Orbit is in GitHub;
this page lists what isn't and how to start. Written 2026-11-14; §5 is the
state on its date and goes stale, everything else changes only when an account,
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
5. **A task without any agent at hand:** Orbit-Core's `agent.yml` (Actions ›
   Run a task on the API credit, by hand) runs headless Claude Code on
   `ANTHROPIC_CREDIT_KEY` with a dollar cap and leaves its work as patches on
   an `agent/…` branch for someone to check and ship with `tools/push.sh`.

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
| **Resend** (domain jaypengx.com verified 2026-11-14) | `RESEND_API_KEY` (a GitHub secret, copied to the proxy): all mail from the domain (`mail.js`): admin alert mails, 寫信, the Pass's recovery email; free plan, 90 a day kept | Mail falls back to Cloudflare below |
| **Cloudflare Email Routing** (in the Cloudflare account) | Binding `MAIL`: mail when Resend fails, only to verified destination addresses; free | No fallback |
| **Jay's inbox** | Where GitHub's failed-run mails and the admin alerts go | Missed alerts |
| **Jay's Apple devices** | The admin pass and passkeys (iCloud Keychain) | Sign in with the admin pass, add passkeys again |

### 3.2 Every secret, by where it lives (names only)

Values are never written anywhere else. The admin panel's system report and
`audit.yml` (run by hand) show which are set, never their values.

- **GitHub › Orbit-Core › Settings › Secrets › Actions:**
  `CLOUDFLARE_API_TOKEN` (deploys; needs Workers, D1 and the zone's DNS Edit),
  `CF_GUARD_TOKEN` (the guard reads the bill), `ECO_TOKEN_SECRET`,
  `ECO_ADMIN_TOKEN`, `DATA_PUSH_SECRET`, `LAW_BUILD_KEY`,
  `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `RESEND_API_KEY`, `ANTHROPIC_CREDIT_KEY`
  (batch jobs and `agent.yml` only).
  `deploy.yml` and `deploy-guard.yml` copy the Worker ones into the Workers.
  The free plans' watch (`free-watch.yml`, 3-hourly) fails, and GitHub mails
  Jay, when either Cloudflare token is refused or ends within 21 days.
- **GitHub › Orbit-Law:** `CLOUDFLARE_API_TOKEN`, `LAW_BUILD_KEY` (the same
  value as Orbit-Core's), `JDOC_USER`, `JDOC_PASS`.
- **GitHub › every other app repo:** `CLOUDFLARE_API_TOKEN` (its own site's deploy).
- **Cloudflare › the proxy Worker (`orbit-workers-proxy`) only, typed by hand**
  (no copy in GitHub; re-enter them from each provider if the Worker is
  rebuilt): `GEMINI_API_KEY`, `GOOGLE_MAPS_KEY`, `GOOGLE_MAPS_BROWSER_KEY`,
  `GOOGLE_WEATHER_KEY`, `GOOGLE_TRANSLATE_KEY` (falls back to the weather
  key), `CWA_KEY`, `MOENV_KEY`, `TDX_CLIENT_ID`, `TDX_CLIENT_SECRET`,
  `GH_ACTIONS_TOKEN` (a GitHub fine-grained token, Actions read and write on the
  family's repos, so the admin panel's 部署 and the cron can start workflows
  and keep GitHub's schedules on, github-keep.js; it has an end date: Jay is
  mailed 21 days before, then makes a new one and types it in), `FIREBASE_PRIVATE_KEY` (until 12-05).

**Never change `ECO_TOKEN_SECRET`.** Every pass is stored hashed with a
pepper made from it: a new value locks every account out, and the recovery
copies of every account's data key are sealed by it (docs/PRIVACY.md). Keep a copy of it
somewhere safe outside GitHub (GitHub never shows a secret again).
`ECO_ADMIN_TOKEN` opens the admin panel (`orbit.jaypengx.com/admin/`). Everything else can be replaced
with a new key from its provider.

### 3.3 Cloudflare: the Workers

`orbit-workers-proxy` (`wrangler.toml`: every route, the Pass, the crons),
`gemini-relay` (pinned to Taiwan; Gemini and the Taiwan-only sites),
`quota-guard` (reads the bill, paces), `orbit-site` (the hostnames), and one
assets Worker per site: `orbit-<slug>` for each app, `orbit-pass` (the kit,
the home page, `/app/`, `/admin/`), `orbit-home` (Showcase and the homepage). All on the
Free plan. Every one is rebuilt by its repo's deploy; nothing in them is
hand-made except the hand-typed secrets above. Details: `MAP.md` §1, §4.2, §10.

### 3.4 Cloudflare: the data (the only copy)

- **D1 `orbit-store`**: every account, wallet and app's saved data, history,
  AI and quota counts. Since 11-15 each app's data (all but Securities') is
  locked on the owner's phones (`kit/vault.mjs`, MAP §5.6): a copy of the
  store restores it, but nobody, Jay included, can read it without the
  owner's pass or device. Copied whole to R2 `private/store/` every night
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
GitHub reads, `kit/apps.mjs`, `github-keep.js`): `grep -rl JayPengX` in every
repo and change them together. GitHub turns off a public repo's scheduled
workflows after 60 days without a commit; the proxy's cron turns them back on
(`github-keep.js`, with `GH_ACTIONS_TOKEN`). If that token has run out, turn
them on by hand in each repo's Actions tab.

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
| Proxy Worker crons | every minute (even and odd) | Live sports, builders, backups at 04:30, the Runner's work, alert mails, keeping GitHub's schedules on |
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

## 5. Where the work stands (2026-11-17)

- **Stable, not growing:** features stopped 11-15; on 11-17 Orbit was made
  "ultra stable" by cutting, not adding. Gone for good: every AI answer made
  ahead for everyone (News' titles, 重點整理, 各方怎麼說 and sports links;
  Sports' 看點 and 賽後看點; F1 stories; Words' cards; Law's minutes),
  News' 預測市場 and 單邊, Orbit News inside Sports, Words inside News,
  Class's 拍聯絡簿, 讀書計畫 and 加到行事曆, Beats' 專注音樂, and the
  問 Orbit links between apps. The only AI still made ahead: Mondays' admin
  除錯紀錄週報 and Law's 法案週報. Every other AI answers only what a
  person asks, checked by code (RULEBOOK 11-14, 11-17).
- **Built and live:** public Pass sign-up with levels (a pass someone makes
  for themselves gets no AI or anything billable, enforced by the server);
  mail from the domain; usage analytics and the privacy policy; several
  Orbits, single-app ones too; each app's data locked on the phone (11-15).
- **To check by hand now and then:** `node tools/layout-check.mjs <app…>`,
  `node tools/test-apps.mjs`, and the admin's 健康 tab.
- **Dates to watch:** 12-01 TDX's free tier starts (Transit switches by
  date; check it 12-02); 12-05 the Firebase key goes; 12-24 the 3-month US
  bill matures (Securities); 12-25 the 代表會 term ends (Law's 104 town
  sites keep the old term until each `term` in `public/lib/town-site.mjs`
  is raised by 1 and `ends: '2030-12-25'`, once the sites post the new one);
  about 12 TWSE's 2027 calendar (compare with `kit/stock-holidays.mjs`'s
  derived one); 2027-01-01 Gemini Flash's price doubles (the bill counts it);
  spring 2027 the 117 學測 (Class's `DEFAULT_COUNTDOWN_EVENTS`); March 2027
  the F1 grid (`kit/logos.mjs`) and ELTA's rights (`kit/sports-broadcast.mjs`);
  by 2027-09-28 Anthropic's model ids (`ai.js` `MODELS`); the domain is paid
  to 2028-10-27 (Cloudflare › Domain Registration, auto-renew).
- **Running alone (11-17):** every AI feature a person taps ends on the third
  maker; a model failing every call for a day is mailed (`mail-alerts.js`);
  GitHub's schedules are kept on (`github-keep.js`, GH_ACTIONS_TOKEN's end
  mailed 21 days ahead); `free-watch` fails 21 days before a Cloudflare token
  ends (both had none on 11-17); a source answering 200 with nothing never
  replaces the phone's good copy (kit `valid`, MAP §5.1).
- **AI money:** prepaid balances are small (the Anthropic credit key's
  balance was empty on 11-14); `free-watch` notes a low one in its report
  (never a failed run: no mail, Jay 11-15). Re-type balances with `build.yml` job `ai-money`.
- **11-15, end to end:** each app's data is locked on the phone (MAP §5.6,
  RULEBOOK 11-15). Next for it: a passkey that unlocks it (WebAuthn PRF), so a
  passkey sign-in needs no pass typed; merge keeping both passes' locked data;
  Jay may tell it on the Showcase (not yet: his call). Recovery email
  brings the data back through the Worker-sealed recovery copy (docs/PRIVACY.md).
