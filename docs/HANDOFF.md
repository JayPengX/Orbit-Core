# Handoff: Quadra, work in progress

All repos develop on `claude/gifted-dijkstra-dv6w8a` and are pushed to
`main` after every change (each deploys on push). The shared kit lives in
`Shared-Proxy/kit/`; `node kit/sync.mjs` copies it into every app (never
edit an app's copy). Tests: `npm test` in each repo (Orbit Class also
`npx eslint .`).

## Done in this round

- **Data-loss fix (critical):** the kit's `q.start()` returned the session
  instead of the first reply, so every app thought the pass was empty and
  saved over it. Fixed; apps also refuse to save over a copy they can't
  read. Play rebuilds lost slips from the wallet (`recoverFromWallet`) and
  merges the old on-device copies; Securities merges its old device copy.
- **Pass security (kit v3 + eco.js):** session-only `/eco`; no pass stored
  on devices (refresh token + account id); device codes (`pair-create` /
  `pair-redeem`); sealed handoff without the pass; rotate and
  sign-out-everywhere from the session; transfers, betting limit, legacy
  routes (`/sync`, `/vocab-sync`, `/odds-sync`, `/stock-sync`, `/vocab-ai`)
  and legacy merges removed; `/kambi` needs a session.
- **Firestore cleaned** with `eco-admin.js` (5 legacy docs removed, one
  wallet tidied). `ADMIN_TOKEN_HASH` is empty (off); to run again, put the
  SHA-256 of a new random token there, deploy, POST
  `{ op: 'admin', token, action: 'scan' | 'clean' }`, then clear it again.
- **Notifications** in the kit (`notify`, in-app banner + system notices
  once allowed in the account sheet); used by Fixtures (followed team
  starts/ends) and Play (slip settled, ticket won). Every app's `sw.js`
  handles notification taps.
- **Orbit Class:** Quadra Pass is the only save; follow and old sync-code
  merge removed; share keys give a copy; panel no longer resets while
  typing; restyled; daily activity (`act:orbit`) feeds a Rewards mission.
  The user's old schedule was merged into their pass (done).
- **Fixtures:** follow sports in priority order, leagues, teams; Today's
  picks (`lib/picks.mjs`); Following tab (replaced News); date strip shows
  only game days; reorganised match sheets. Follows are copied to the
  wallet setting `follow:match` for Play.
- **Play:** new home (header card, follows from Fixtures, logos), lottery
  (cards with quick pick, basket buying, grouped tickets), notices.
- **Rewards:** Orbit mission; all help text updated.

## Done in the next round

- **Securities' 資產 page:** allocation ring (total inside, by kind /
  currency / market), holding rows with today's price line and a weight bar,
  a cash card (spendable total, held for orders, settling, cash interest
  rate, wallets), an income card (dividends, coupons and cash interest over
  12 months and this year, yield on holdings, top payers, dividends on the
  way; `incomeSummary` in `lib/account.mjs`, `donut` / `miniBars` in
  `lib/chart.mjs`), tidier "where the money came from" rows. Its own
  notification setting is gone: price alerts and filled orders use the
  kit's `notify` and the account sheet's toggle.
- **Rewards:** four new games (speed match, hangman, colour memory, mini
  sudoku; 8 in all, in "word games" and "a break from words"), a daily
  challenge (`dailyGame`, first paid round adds NT$10-40 by days in a row,
  inside the games' cap), weekly goals (paid as missions), badges, your
  bests (wallet setting `bests:vocab`), word of the day on home. Notices:
  a mission or weekly goal newly ready to claim, a streak ending tonight.
- **Orbit Class:** a notice five minutes before each class
  (`classStartingSoon`).
- `kit/sync.mjs` pointed at `Quadra-Sportsbook` (now Quadra-Play), so it
  skipped Play; fixed.
- **Polish:** every tab of every app checked at 360px (no sideways scroll);
  Securities' rates board no longer breaks currency names mid-word.

## Then

- Everything pushed to `main`.
- **Orbit Class data loss fixed:** sync used to push the device's copy
  before pulling, so a device left open with an older schedule overwrote
  the newer one (on coming back, becoming the live app, or a style save).
  Now: pull first; a device uploads only its own saved edits and only while
  the pass still holds the copy it last saw; otherwise the newer copy wins
  and the local change is set aside (`orbitSetAside`). Tests:
  `test/quadra-sync-newer.test.js` (fail on the old code).
- **Orbit Class is phone-only:** a computer gets `phoneOnlyGate` (kit) with
  a QR code (`qrcode-generator`) and the steps.
- **No browser pop-ups left:** the kit's `ask` / `tell` (styled confirm and
  alert) replace every `confirm` / `alert` (account sheet, Securities'
  plan stop, Play's scratch-card funds).

## Ideas for later

- Rewards: word ladder, reaction game, a shared leaderboard (needs the
  Worker).
- `Quadra-Play/undefined/` holds two stray screenshots from an old commit.

## Notes

- Set the `ECO_TOKEN_SECRET` repo secret on Shared-Proxy to turn on the
  data proxy's token check (without it, `/sports-proxy` doesn't check
  tokens; `/eco` derives a key from the Firebase key).
- One old test pass from an earlier session may still exist (harmless).
- Never commit anyone's pass or codes into a repo.

## And then

- **Account recovery (done):** a pass lost to the new-pass screen opening
  behind the account sheet was found with `eco-admin.js`'s `wallets` and
  `device-code` actions (admin switched off again: `ADMIN_TOKEN_HASH` empty).
  The kit now closes the sheet first, shows the new pass as a full-screen
  modal dialog, and only closes it once its last 5 characters are typed
  back. A pasted pass with its dash (11 characters) no longer loses a
  character (no maxlength on the sign-in box).
- **Kit:** each notice kind has its own switch (`NOTICE_KINDS`, `kindOn`);
  no double-tap zoom; the page is locked behind the loading screen; apps
  no longer use `viewport-fit=cover` (iOS blurred what scrolled under the
  status bar).
- **Play:** lost never-settled slips refunded after 3 days (`refundLost`);
  lottery can't overspend a pool below zero; slips filed by the day their
  games were played; quick picks only fill the list; 我的彩券 lives in 紀錄;
  統計分析 remade (`stats-ui.js`); opens right after the main board; scratch
  cards redone; tab bar keeps room for the home indicator.
- **Rewards:** 35 arcade games (`lib/arcade.mjs`, `public/arcade/`), a new
  games list (search, categories, favourites, recent), how-to-play cards.
- **Fixtures:** F1 drivers' and constructors' tables; followed leagues
  weigh 0.6 in today's picks.
- **Orbit Class:** the dashboard title is fitted once it's on screen.
- Not verifiable here (no real phone): the status-bar blur fix and the
  tab bar's bottom room; worth a look on the device.

## Round: Fixtures rebuilt, speed and cost, Rewards and Securities (branch `claude/fixtures-app-restructure-v5tuby`)

Everything is on `claude/fixtures-app-restructure-v5tuby` in all six repos,
not yet on `main` (so not deployed). The Workers (batch, translate, season
tier) deploy from `main` too; until then the apps fall back (one request at
a time; untranslated text).

- **Kit:** `proxyJson` (batches of 12 per Worker request, memory + Cache
  Storage per URL for its lifetime), `peekJson`, `cachedPayload` (a signed-in
  phone opens on its last data at once), `translate()`, account badge
  instead of the balance, account details card in the pass sheet
  (`accountDetails`), `watchUpdates` applies a new deploy when the app is
  put away or right after opening (never under the thumb on coming back),
  `rememberPlace`/`restorePlace`, two-line `.q-rec-sub`.
- **sports-proxy:** `?batch=1&u=…` (`trim!url` per item), `Cache-Control:
  private, max-age` on single answers, `dates=<year>` season tier,
  `clients5.google.com/translate_a/t` (POSTed upstream, kept 30 days).
- **Fixtures:** tabs 推薦 / 賽事 / 直播 / 追蹤 / 排名; stages and playoff
  series (`lib/stage.mjs`); Taiwan broadcasts (`lib/broadcast.mjs`, checked
  2026-09: keep it current); whole seasons for F1/golf/tennis/UFC; table
  gaps; player pages and follows for individual sports; stat bars per side;
  Chinese stat names (`lib/statnames.mjs`).
- **Securities:** 換匯・融資 in three views; translated "what it does"; no
  news; the money-sources card removed (account details are in the kit).
- **Play:** data through `proxyJson`.
- **Rewards:** every word recorded (Microsoft en-US Jenny, like the old
  4-6 clips; `tools/word-audio.py`), audio started in the tap, voice
  fallback/picker (`lib/voice.mjs`); faster boxes (1, 2, 5, 14 days; known
  words jump to box 3), missed words retried in the round, 10/20/30 rounds;
  long games (`lib/long.mjs`: sudoku 9×9, solitaire, minesweeper XL,
  checkers) and word search; full-screen play; help in one shape.
- **All:** top-right is help · refresh · account in every app.
- **Tools:** `tools/preview.mjs` (signed-in phone screenshots with real
  data), `tools/espn.mjs`, `tools/word-audio.py`; see `tools/README.md`.

Ideas for later: Play's own cold-start cache (like Fixtures'), a playoff
bracket view in Fixtures, saving a long game in progress.


## Notices while an app is closed (Web Push)

Phones stop a home-screen app in the background, so notices can't come from
the app itself once it's closed. The kit's `schedulePush(s, items)` hands the
Worker each app's coming notices (a followed game's start and final score, a
class, a streak about to end, a price alert or order reaching its price, a
monthly plan's day, a slip's games being over); `push.js` in the
main Worker stores them in KV and its cron (every 2 minutes) sends the
due ones with Web Push (VAPID key pair made on first use, kept in KV as
`push:vapid`). Checks (`espn` final score, `yahoo` price reached) are made by
the Worker itself. They live on the main Worker (`worker.js`, `/push/*`,
sent by its cron) because only it can read Quadra Pass tokens. Each app's `sw.js` shows them (`push` event). On an iPhone
this needs the app on the home screen (iOS 16.4+) and notices turned on in
the account sheet. Notices that arrive together while the app is open are
one grouped banner.


## Round: profit the smart way, and premium (all repos, pushed to `main`)

The owner asked for Quadra to earn more while looking simple and premium,
and for the cheap cash-grab features to go. What changed:

- **Removed:** Play's 🔥 熱門串關 cards (unreadable, obscure table-tennis
  legs), the dashed "follow in Fixtures" nag, the 試試看 rec cards, the
  dashed 再加一場 upsell; Securities' fake 限時活動 promo strip and the
  現金閒置中 idle-cash nag; Fixtures' gradient 下注 pills and "N 場開賣中"
  banner.
- **Quadra Plus** (the recurring revenue): NT$290 a month, billed by the
  Worker (`op: 'plus'`, renewal in `paydayEntries`, entries
  `eco:plus:<month>`; apps can no longer write `eco:` ids at all). First
  month free once; rejoining costs the rest of the month's share. Perks,
  one table in the kit (`PLUS`): Securities half commission, half FX
  spread, loans 1 point cheaper, 2% on NT$ cash (by paid month); Play
  parlay boost doubled, cash out keeps 2% not 5%. Shown in the account
  sheet (`plusCard`, `openPlus`), once on Play's home and Securities' 資產
  for non-members, and as one quiet "✦ Plus price" line where money is
  spent (order ticket, FX desk, loan form, slip, cash out). A member gets a
  gold star on the account button.
- **Play:** new home (balance, featured big-league games with prices, your
  bets with cash out, jackpots); board orders by league tier and folds the
  thin leagues; **parlay boost** (3+ picks, 5-20%, stored per slip as
  `boost`); **cash out** (`lib/cashout.mjs`, `cashOut` in `account.mjs`).
- **Securities:** markets home = account strip, for you, movers side by
  side; lists capped at 15 rows; Plus perks by time (`usePlus`).
- **Fixtures:** a small outlined 投注 / 場中 chip in its own column.
- **Not done:** Quadra-Rewards wasn't reachable from this session (adding
  it was refused), so its kit copy is one version behind: run
  `node kit/sync.mjs` with Rewards checked out and commit it. Until then
  Rewards has no Plus card in its account sheet (nothing else breaks: every
  app's copy stands alone).
- Ideas: a daily price boost on one marquee game (capped stake); same-game
  parlays (need correlated pricing); a Plus-only monthly statement.
