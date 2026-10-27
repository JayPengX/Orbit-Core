# Jay's rules

Every product and working rule Jay has set for the Orbit family, in one place, newest wins.
Gathered 2026-10-27 from the team memory, the 2026-10-23 handoff, the roadmaps, round 3's
STANDARD and every repo's CLAUDE.md.

Read with the two docs it doesn't repeat:

- [`TRUTH.md`](TRUTH.md): how to work (the owner, speed, shipping, code structure, cost, product principles).
- [`DESIGN.md`](DESIGN.md): how a screen looks (focus, type, colour, space, chips, maps).

When a line here and a team memory file differ, this file is the rule and the memory file has the
history and the code details. Each repo's `MAP.md` keeps that app's internal decisions. A rule Jay
changes gets edited here in the same push, with the old version moved to "Replaced" at the bottom.

Dates are Taiwan's calendar day of Jay's message (UTC times in memory files).

## 1. Working and shipping

- 10-18 Fully automatic: build fixes and features without approval, then report in plain words.
- 10-18 Never idle: never wait on another lane, a check or a merge; start the next independent item.
- 10-18 Only what the task needs in context; helpers get only the files and checks they need and return short reports.
- 10-19 Helper tiers: Light haiku/low, Mid sonnet/medium, Mid+ sonnet/high, Strong opus/medium (design choices only); always set model and effort; do small jobs yourself (plans/roadmap/model-rules.md).
- 10-19 Concrete work only: no general polish sweeps; walk the screens you changed.
- 10-19 No separate test step and no Mac test gate: check your own cloud screenshots, push to `main`, Jay tests on his phone.
- 10-21 "Don't ask me, just push, I allow anything" (repeated 10-22): never post push cards, kit pushes included.
- 10-21 Fetch and rebase onto `origin/main` right before every push; never push a tree from an old checkout (a stale push wiped Law's 裁判).
- 10-22 Kit push order: Orbit-Core `main` first, wait for `pages.yml`, then apps; run affected apps' `npm test` against the new kit first (a CI break emails Jay).
- 10-22 No failure or cancel emails: never add a cancelling `concurrency:` to a Pages workflow; copy the `queue` job; builds check out main's tip, not `github.sha`.
- 10-22 Orbit-Securities: after a push, confirm "Deploy to Pages" started; if not, run `deploy.yml` by hand.
- 10-23 Secrets are copied sealed inside Cloudflare/GitHub; never ask Jay to dig up keys; get his written yes up front when a safety check needs his words.
- 10-23 While Jay is away or quota is out: don't ask him anything, wait for the reset and resume.
- 10-27 Anything two apps use lives in the Orbit-Core kit, never copied; move duplicates there when you see them (TRUTH §4).
- Questions to Jay: tap options (a decision card), never typed questions, never overnight; one message when everything is done.
- Coordinator posts an hourly digest (Live / In progress / Waiting on) only when something shipped.
- Files for Jay go into `/mnt/project-files/` by category (its `INDEX.md`); nothing loose at the top.

## 2. Every app (family product rules)

- 10-18 As real as Taiwan: 台灣運彩, Taiwan Lottery, TWSE and brokers, real buses and trains; remove what isn't real, add what is.
- 10-19 Gemini (any paid AI) runs only behind a user's tap, never automatically.
- 10-20 One quality, one family: every app works and feels the same.
- 10-20 The loading screen lifts once, onto finished content, and still fast; nothing pops in after.
- 10-20 Real logos and headshots, never letter tiles; pictures for everything that has one.
- 10-20 Balanced cards at any count (never a lone half card); long names never wrap badly.
- 10-20 First-tap bugs count as bugs: a button never needs two taps.
- 10-20 Remove backward-compatibility code and dead features; clean breaks, no `off` flags.
- 10-20 Slow internet must work (hashed files, nothing re-downloaded, no cache wipe on update).
- 10-21 No bright white surfaces in dark mode (glass tiles and buttons; logos without white plates).
- 10-21 No wraps, orphan pills, cut numbers, sideways tables or scrolling sheets.
- 10-27 Addresses: every Orbit app at `orbit.jaypengx.com/<short>` (one origin, so one Pass sign-in), Longshot at `longshot.jaypengx.com`, the proxy at `api.jaypengx.com`. The bare `jaypengx.com` is Jay's own homepage (handle JayPengX only: no real name or school; no betting or Longshot link; open to all; livelier than the apps), with the showcase at `/showcase/`. Clean break, no redirects from older addresses.
- 10-21 The keyboard never pushes content off screen; the iPhone's own keyboard, never an in-app keypad. Kit `watchKeyboard` since 10-27.
- 10-21 Stats show the current season; last season only where this one is empty (e.g. 上季對戰).
- 10-21 No manual "check results" buttons; automatic over buttons.
- 10-21 One layout per page across states (before, live, after).
- 10-21 Past-game pages show only that game's data.
- 10-21 Never invent user data (no guessed 要帶 in Class, no made-up balances anywhere).
- 10-21 AI editors can do anything the app can do by hand.
- 10-21 No cross-app spending pop-ups; notification permission asked at most once.
- 10-21 Never blame the network for a slow AI or a failed update.
- 10-21 Reflect results the moment they happen: never hide data because a feed is stale; compute it from live results.
- 10-21 Test UI in WebKit (Safari's engine), not only Chromium.
- 10-22 One date selector in every app (kit `dayBar`/`dayStrip`); never an app's own day chip row.
- 10-22 Hates floating buttons over content: docked bars (`html.q-dock`, `.q-accessory`).
- 10-23 Phones only, 320 to 440 px; iPad and computers show the phone column centred; no tablet or wide layouts ever.
- 10-27 Exception: the admin panel (`site/admin`) has a real desktop layout (sidebar, wide grids) as well as the phone one, and on a phone nothing in it is cut or squeezed (secondary lines wrap). The Showcase is the other exception.
- 10-23 Every team name in Chinese; people (players, drivers) in their own English names in both languages; never transliterate.
- 10-23 One session per app: all apps run at once; only the same app opened in a second place pauses the first.
- 10-23 A typhoon day off (停班停課) acts like a holiday in every app (kit `dayoff.mjs`, per place and need).
- Every Orbit app sits behind the Orbit Pass and asks for Add to Home Screen on a phone (exceptions: Showcase; Longshot has its own Pass).
- Visual over text: icons, colour, cards; less text, no source names or back-end notes on screen (TRUTH §6).
- Chinese (Taiwan) first, English second (TRUTH §6).

## 3. Design

- 10-27 `DESIGN.md` is the standard ("looks AI-made"): one focal point per screen, weight 700 only for the focal number and large titles, accent as a pointer (about 4 uses), chips only for taps or exceptions, one radius, 4-point spacing, no glows. Fix with design principles, never by copying another app; change the kit, not every screen.
- 10-19 No app-name title and no intro or status lines over content; open straight onto content.
- 10-19 Top bar: account pill plus at most one tab action, trailing; help lives in the Pass sheet; refresh is pull-to-refresh.
- 10-19 One sheet, one empty state, one segmented control (whole-view switch, at most 4 parts), chips for filters, all from the kit.
- 10-19 Still in force from round 3: nothing cut, no duplicates, no emoji icons, real logos, every sheet in the kit style, check 320 and 375/390, light and dark, in WebKit.
- 10-22 Colour only where it means something (win or loss, a live state); no colour bands representing nothing.
- 10-23 Icons: each app its own bright hue, big white symbol over the family ring; share cards are icon + name + one short line (kit `brand.mjs`, `node brand/generate.mjs`).
- 10-23 Avatars: 96 drawn looks, never emoji; the signed-in dot is small, on the rim, never over the face; picking a look shows no pop-up.
- 10-27 Maps are weighted by relevance; markers get quieter, never hidden (DESIGN §7).
- 10-27 Screenshots (READMEs, the showcase): framing edits are fine (crop, a zoomed-in callout of a detail, a headline, a background); content edits never (no faked numbers, no moved or hidden UI, no pixels the app didn't draw). Sample or public data only, in English for the READMEs, light and dark mixed, each set leading with the app's selling point.
- Jay's test, before calling UI done: open every tab and sheet you changed at 320 and 390 px, light and dark; look for overflow, cut text, duplicates, small logos, emoji, empty screens, leftover old sheets. Run `tools/gate.mjs` on the app.

## 4. Data, money and cost

- 10-18 No paid TheSportsDB key.
- 10-19 No paid membership ever (Orbit Plus removed 10-20; VIP and free bets removed 10-22).
- 10-22 Money lives in Securities: the Pass shows no balance; 信貸, 紓困, 財富等級 and 真相 are in Securities › 資金 › 你的帳戶. Securities is the only app that moves Orbit's play money; only the proxy adds money.
- 10-19 Orbit economy: NT$200,000 start, NT$10,000 every Monday; 信貸 helpful but dangerous (12% APR, 3 late → 催收); 急難紓困 NT$5,000 when worth < 2,000; 財富等級 rewards raised 10× on 10-23 (300K/30K … 100M/3M).
- 10-22 Removed items drop out of every total (a refunded tax must not come back from an old device copy).
- 10-27 Data must never be lost or corrupted; saves stay lean. Kept collections get version history and nightly backups; new user-data collections join the keep set in `worker.js`.
- 10-27 Keep the US$5 Workers Paid plan; don't re-propose dropping it unless heavy work leaves Workers.
- 10-27 Gemini is very reliable, only costly: replace it only where a free path is just as reliable; otherwise make calls cheaper (free first, e.g. invoice QR on the phone, local parsers).
- Every Gemini route has a daily global cap; Google Weather is shared per 0.05° square and paced under its daily cap.
- New Cron Triggers don't run: reuse the proxy's even/odd minute crons or a Durable Object alarm (TRUTH §5).

## 5. Per app

### Transit
- 10-22 YouBike is crucial: never plan a trip without bikes as a fallback; make it load reliably instead.
- 10-22 Navigation follows ONE standard table (leg type × phase × auto/user view) in one function (`navLook`); change the table, never add one-off rules.
- 10-22 On a ride: frame the remaining ride only, no zoom-follow on bus or train; own YouBike station icon-only (counts when Jay zooms in); no nearby stations or parking badges; boarding and start marks; ring one stop before yours; no swipe-down minimize.
- 10-23 Operators' 停駛 notices are rules: stopped services are never planned; likely-off is labelled 可能停駛, never 停駛.
- 10-23 附近 must load; on a "nothing running" day it still works and just says what's stopped.
- 10-27 A trip's legs fit one line (tighten, never wrap); 查時刻 is visual (journey bar, live 準點/晚, next train lit), not text.

### Sports
- 10-20 Every break gets a countdown, timeouts too.
- 10-21 Two sports' games clash only within 30 min of each other.
- 10-22 賽事 opens on 全部, never on the first followed league.
- 10-22 NBA 先發 from RotoWire (not ESPN core); injury words from a fixed list, never machine-translated.
- 10-22 Result notices checked every 2 minutes, first check at the sport's shortest length.
- 10-22 Soccer win chance from our own model (score, minute, reds), never a frozen market; 勝負未定 not 拉鋸; no "按住圖表" hints.
- 10-22 Leave closed-app CPBL result notices broken until next season; revisit sources before spring.
- 10-23 One game page standard for every sport (lineups, 陣容, 傷兵).
- 10-23 Cards show one channel row; the game page lists every channel and names whom a player cam follows.
- 10-23 Following a league counts like following a team; games 00:00–05:00 TW are never "my game".
- 10-23 Win-probability rows use team logos and shirt colours; the lead row lands on the right play.
- 10-26 For a game to come, the betting market goes ahead of ESPN's predictor.

### Law
- 10-19 No Cloudflare cost; data built at deploy, never committed.
- 10-21 Three equal, linked pillars: law, rulings (all 憲法法庭/大法官 included), legislation; one id scheme, one search.
- 10-21 The AI answers anything in the app and makes the judgement call with citations; does the work itself (no generic 下一步 or 找哪個機關); verdict first, few facts, no wall of text; recent items first (newest budgets unless a year is asked).
- 10-21 Coverage: all 法規命令, ministry 行政規則, local 自治條例 and 規則 (Taiwan-only county sites through the Taiwan relay).
- 10-22 直播中 only when IVOD says so (fresh); never live from the schedule; never live on a day off.
- Rulings backfill runs 00:00–06:00 TW nightly; only `rulings.yml` writes that cache.

### Weather
- 10-22 Graphs: rain bars by amount, readout in the title line, no hint boxes, a graph never drags the sheet.
- 10-22 Typhoon day-off chance: one number per county, the % is the only indicator (no accuracy shown), the official word wins; hidden under 5%.

### Securities
- 10-21 List every securities product a person in Taiwan can legally buy; 10-23: with its real rules, applications and restrictions, however annoying (kit `stock-access.mjs` gates + the app's 開戶與交易資格 sheet, live).
- 10-21 No balance on the home page (real-broker feel).
- 10-27 現股當沖 follows TWSE: account open 3 months with 10 trades in the last year, or a credit account, plus the signed 風險預告書 (`stock-access.mjs` `daytrade`).
- 10-22 One product bar in 市場; every list = picks, then the whole listing.
- Orders are filled and cash counted by the proxy (`stock-fill.js`), never the phone.
- 10-23 Securities follows 臺北市's 停止上班 for trading days.

### Money (Jay's own books, real money)
- 10-27 Never invent entries, balances or categories; Jay started fresh 2026-11-01; never re-add the 天天記帳 import or commit his CSV.
- 10-27 發票 is one feature (更多's hero: scan, screenshot, 載具 file, mail-in); free QR read first, Gemini only on a tap with review before saving.
- 10-27 Categories have subs and are the person's to edit; auto-fill (自動帶入) is set per user, never hardcoded.
- 10-27 Sheets fit their content; nothing that matters below the fold; 手機條碼 stays black on white in dark mode.
- 悠遊卡/一卡通 are 儲值卡, never 電子錢包; removing an account never loses history.

### Class, Words
- 10-21 Class never guesses what to bring (要帶).
- Class's local schedule is kept aside if unreadable; the Pass copy restores.

### Beats
- 10-18 No music training; the full mixer is on by default.
- 10-21 Songs must sound clearly different.
- 10-23 Easy listening: keep `eased()` and the quieter master; no choir beds or glassy doublings.
- Keep `noted()` hooks in `radio.mjs`; never a `.loading` class outside `#loading`; home cards static (nothing animates forever).
- `engine.mjs` is the port of `passion_beats.py`: a change to the songs goes into both. Nothing of a kit's sound is sent anywhere.

### Orbit Pass
- 10-23 Pass card: avatar, 里程碑 n/9, account number without prefix, medal strip; no money on the Pass.
- 10-27 Passkeys (Face ID, Touch ID, Windows Hello, a password manager, a security key, a phone by QR): any number per Pass, each named and removable; an existing Pass adds one any time (one-time offer 「加入 Face ID 登入」, never asked again). Keep it simple: the 10-character pass and passkeys both sign in, no "passkey only" mode. One passkey for every Orbit app and the admin page (RP ID the domain); Longshot keeps its own Pass.
- 10-27 The pass is stored hashed slow and peppered (a stolen database alone is useless); no lockouts and no forced resets: older passes upgrade when changed. Account number shown: its first 6.
- 10-27 Every sign-in (Orbit, the admin key, Longshot and its admin) is a form password managers save and fill.

### Showcase (Jay's 自主學習 portfolio)
- 10-27 Open to all (no Pass, no install gate) and a real desktop layout besides the phone one (exceptions to §2).
- 10-27 Only structure, numbers and demos; plain words for non-tech readers; Jay sets direction, Claude types.
- 10-27 No betting anywhere; every number from git; "on GitHub since", never "began on".
- 10-27 Demos are frozen snapshots, full screen on phones, bug-free; small coach-mark tours.
- Content changes only when Jay says "catch up the showcase". The raw record stays private in project files, never in a repo.

### Longshot (outside the family)
- 10-27 Lives at `longshot.jaypengx.com`, its own origin (no shared storage with Orbit).
- 10-22 Its own app, Worker and Pass; never import from, link to or depend on Orbit-Core; its rules are `Longshot/docs/TRUTH.md`.
- 10-22 League sports and F1 only; no tennis, UFC, golf or other non-league sports.
- 10-20 Lock a whole market, never a lone open side; no 限關 pills.
- 10-21 No cash out, boosts, free bets, VIP or player markets; 冠軍 boards drop impossible picks.
- 10-20 Tax: 20% of a slip's whole payout when it pays over NT$5,000, at any odds (Jay's choice over the per-注 rule); prevent losing wins by design (house guards), not refusals.
- 10-22 Odds changes are taken at once (▲/▼, one 賠率已更新 line); no accept button or setting.
- 10-23 Name: "Longshot" only. Economy: NT$30,000 to open, NT$10,000 each month, nothing when broke. 紀錄 is the true record. Balance shows in the account capsule.
- 10-23 刮刮樂 has sound (quiet since 10-25); real-shop feel; a ticket never rotates; 兌獎 reveals, scratching doesn't.
- No hooks (no push notices, loans or levels).

### Folder-Link (Windows tool)
- 10-18 Same-drive disk check stays strict; merging overwrites same-named files after the warning; self-contained exe on purpose.

## 6. Replaced rules (kept so nobody brings them back)

| Old rule | Replaced by | When |
|---|---|---|
| Apple UI changes go to a branch and wait for a Mac test | Push straight to main after your own WebKit screenshots | 10-19 |
| Push to the session branch and main | `main` only, no PRs or branches (TRUTH §3) | 10-19 |
| Only the kit thread may change the kit | Any lane pushes the kit, in kit push order | 10-21 |
| Fit iPad and every screen size | Phones only (320–440 px) | 10-23 |
| Gradient hero card per tab, colour tiles, tags instead of sentences (round 2) | `DESIGN.md`: flat, one focus, grey facts, chips only for taps | 10-27 |
| Help pill in the top bar | Help in the Pass sheet | 10-19 |
| Play sells everything 運彩 sells (tennis, esports…) | Cut back, then all non-league sports removed | 10-22 |
| Slips shows F1 drivers in Chinese | People in English in both languages (Slips is now part of Longshot) | 10-23 |
| Scratch cards are silent | Sound on, quieter | 10-23, 10-25 |
| Odds change asks to accept | Taken at once | 10-22 |
| House rules "never by price" | Price guards 限2關 1.25, lock under 1.12 | 10-20 |
| Orbit Plus, VIP, welcome bet, free bets | Removed, no paid membership | 10-20, 10-22 |
| Money on the Pass | Money in Securities only | 10-22 |
| Beats pieces exactly as recorded | Full mixer on by default | 10-18 |
| Weekly 15-min recheck for game finals | Every 2 min | 10-22 |
| Own domain: same `/<Repo>/` paths | Short paths (`orbit.jaypengx.com/law`), old paths 404, no redirects | 10-27 |
| Apps share the `jaypengx.github.io` origin | They share `orbit.jaypengx.com`; Longshot has `longshot.jaypengx.com`; the bare `jaypengx.com` is Jay's homepage with `/showcase/` | 10-27 |
| Longshot's own keyboard rule | The same rule in the shared kit for every app | 10-27 |
| Sell-first 當沖 needs 12 months of history | TWSE's 3 months + 10 trades, or a credit account |  10-24 |
| Handoff: "don't touch the Cloudflare data rename" | Rename finished (`orbit-data`, `orbit-store`) | 10-23 |

## 7. Contradictions to watch

- New kit exports: `TRUTH.md` says use them with a `kit.x?.()` fallback, while the 10-20 cleanup made existing fallbacks direct. Both hold: a new export gets the fallback; once every phone has the kit it can go direct.
- Longshot keeps its own kit copy although "anything two apps use lives in the kit": Longshot is outside the family on purpose, so look changes are ported to it by hand.
- Helper tiers: the 10-18 kit roadmap said Strong = opus/high; the 10-19 rule sheet says opus/medium. The newer one (medium) holds.
