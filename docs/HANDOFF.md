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

## Round: full throttle (all repos, pushed to `main`)

The owner asked to remove anything that could discourage spending and to
package everything as premium and useful while being profit-first.

- **Removed discouragers (Play):** the 統計分析 tab (net loss, luck vs the
  cut, per-100 returns) is now 戰績, wins only (`stats-ui.js`); slips show
  no expected return, no negative result; groups, the summary and the
  account show 累計中獎 instead of 輸贏; no "lost" filter; the lottery shows
  prizes but no odds, no scratch win rates, no net-loss chips, no purchase
  confirmation. Old analysis strings in `i18n.mjs` are unused leftovers.
- **Play conversion:** sticky slip bar, parlay by default from two picks,
  quick stakes with a remembered stake (NT$500 default), 精選串關 on home,
  "投注成功 · 繼續挑比賽" after a bet.
- **Plus yearly plan:** NT$2,900 for twelve months (entries for all twelve
  at once, the fee on the first), renewed by the year (or by the month if
  the pool can't cover a year). The sheet has a plan picker (yearly marked
  最划算; monthly keeps the one-time free month); cancelling is still there,
  under 管理會員.
- **Securities:** buying power (cash + margin room) on the markets home;
  融資買進 borrows the shortfall and places the order in one tap; 融資最大
  quick size; no "worst trade" line.
- **Fixtures:** match sheets carry a Quadra Play card.
- Rewards now has the current kit (synced in the Rewards round below).

## Round: the economy, balanced so money matters

`node tools/economy.mjs` models five kinds of user (casual, regular bettor,
high roller, investor, Rewards grinder) over a year: faucets (opening money,
allowance, Rewards, market) against sinks (Play's hold: 13.6% of a single,
~33% of a treble; the lottery ~50%, scratch ~32%; trading costs; Plus).

- **Before:** everyone but a whale got richer every month (regular bettor
  +NT$4.5k, investor +12.9k, grinder +28k); balances reached 20-60 months
  of pay, so the house's take never mattered.
- **Now (Worker, live):** a new pass opens with NT$30,000 (was 110,000);
  the monthly allowance goes by worth (pool + Securities holdings, which
  Securities now sends as `snap.stock.holdings`): 6,000 / 4,000 / 2,000 /
  1,000 at < 40k / < 100k / < 250k / above. Existing money is untouched;
  a rich account simply stops getting much for free.
- **Rewards (done, see the Rewards round below):** effort is capped at
  NT$400 a day (vocab 200, games 120, missions 80; about NT$12 a minute).
- With all of it: a regular bettor is about level (needs a little Rewards
  effort to stay there), an investor grows by the market, a grinder earns
  but can't outrun the house, a high roller drains fast.
- **Existing accounts, reset (live):** the Worker adds `eco:rebase:v3`
  (−NT$80,000) once to every account that opened on the old NT$110,000
  (an `eco:start` above 30,000, or a pre-v2 account with money in the
  pool); new passes never get it. The kit shows a one-time notice
  (`quadra.seen.rebase-v3` per device) with the amount and what to do.
- **Overdrafts:** the pool may go negative. Spending is blocked by the apps'
  own balance checks; selling, cash out and the allowance still work. The
  Worker charges 1% a month on what's owed at the month's first read
  (`eco:od:<month>`, from 2026-10). Play's home shows the negative balance
  and "賣出持股補足" (into Securities); Securities shows an overdraft card
  with `coverPlan` (largest holdings first, only what's needed, +1% for
  costs) and one-tap market sells, and a red strip on the markets home.
- `tools/preview.mjs --entry '{json}'` adds wallet entries for scenarios
  (e.g. the reset and a big stake, to see an overdraft).
- **Rewards next:** the brief for Rewards (sync the kit, close the effort
  faucet, make Rewards profit-oriented, remove its loss-talk) is done; see
  the round below.

## Round: Rewards, profit-oriented (done)

- **Kit and caps:** Rewards runs the current kit; pay rescaled to the
  NT$400 day (missions NT$15-25, weekly goals 40-60, the daily challenge
  bonus 5-20); ranks start at NT$50,000. Home shows the cap as progress
  (今日可賺 NT$400 · 已賺 …) and one quiet line into Play and Securities.
- **Shop (`Quadra-Rewards/public/lib/shop.mjs`):** 連續紀錄保護卡 NT$300
  (hold 3, used by itself on a missed day: `vocab:fz:<day>`, amount 0);
  word pay ×2 for 30 minutes NT$150 (that day's word cap +200); word packs
  TOEIC NT$990 / IELTS 1,490 / Business 1,990 (`data/packs.json`, about 150
  themed words each sharing progress with the main list, 212 new words
  recorded). Purchases are `vocab:shop:<item>:<key>` entries of kind
  `shop`; the Worker drops any that pays less than the lowest price
  (`REWARDS_SHOP` in eco.js), so a free card or pack can't be written.
- **Plus in Rewards:** a protection card every Plus month, word cap +NT$50,
  packs half price; the kit's `plusPerks` and Plus sheet list them.
- **Free bets (Rewards missions → Play):** three missions (a parlay of 3+
  in Play, a scratch card, a monthly plan in Securities) give a token
  instead of cash: `vocab:fb:<day>:<mission>`, kind `freebet`, amount 0,
  its value (NT$30-50) in the note; the Worker keeps only well-formed ones.
  Play's slip offers unspent tokens (kit `freeBets`, 7 days): one slip, the
  token's value as stake, nothing off the balance, the token marked spent
  (`odds:fb-<token id>`), a win pays the winnings only (`placeFreeSlip`,
  `applyResults`), no cash out. Play tracks `parlay` and `scratch`,
  Securities `plan`, for the missions.
- **No betting in Rewards:** a staked game challenge was built and then
  removed at the owner's word (betting belongs to Play only).
- **說明** is a product guide now: no expected losses, per-100 returns or
  "simulated" wording; Plus monthly/yearly, allowance by worth, overdraft,
  fees, parlay boost, cash out, free bets, the shop and packs.
- **Kit statement labels:** `shop` (Rewards 加值), `freeze`, `freebet`.
- `tools/economy.mjs` has a v4 setting (the shop and free bets) and a
  Rewards-only persona (只背單字).

## Round: one tab bar, faster opening, clean-up (all repos, pushed to `main`)

- **One app frame (kit):** `tabBar({ tabs, onSelect })` draws every app's
  tab bar from the same markup and icons (`ICONS`): on a phone the chosen
  tab has a pill behind its icon, badges sit on the icon (`badge(id, n, {
  tone })`), each tab keeps its place, tapping the open tab scrolls it to
  the top (at the top: `onSelect(id, { again: true })`), arrow keys move
  between tabs, and only a change of tab moves the address.
  `topActions(s, { help, refresh, extra })` is the top right everywhere:
  help, refresh (apps with live data), the account. Every index.html has
  the same header (`.q-appbar`, `#title`, `#status`, `#tabs`,
  `#top-actions`); the apps' own header, tab and mobile-bar CSS is gone.
  Page padding uses the kit's `--q-nav` and `--q-page-max`.
- **Tabs:** the first tab is 首頁 (house) in every app (Fixtures' 推薦 and
  Securities' 市場 renamed). Fixtures gained a refresh button (tap 首頁
  again at the top: back to today). **Rewards:** 首頁 · 單字 · 遊戲 · 任務;
  任務 has every mission, weekly goals, badges and ranks with a count of
  what's ready to claim; home keeps the next three missions; help is a
  sheet from the ? (and from other apps' `#help=` links). Help text and
  READMEs follow.
- **Faster opening:** each sw.js serves the kept page at once and
  refreshes it behind (`pageFirst`; a `?v=` address, the update reload,
  still asks the network): an installed app no longer waits a round trip.
  Deploys add `modulepreload` for the whole static import graph
  (`scripts/stamp-version.mjs`): 3 waves of requests instead of 5-6
  (measured with `tools/preview.mjs --timing --latency 150 --root`). The
  Worker is preconnected in every app. The kit's session shares one
  sign-in call when several token requests come at once (test in
  `tests/kit.test.mjs`).
- **Clean-up:** ~1,400 unused i18n entries (Play's old analysis,
  leaderboards and simulator; Securities' lessons and costs card; a few
  in Fixtures and Rewards), unused CSS rules and keyframes, dead
  functions, constants and imports (checked with `tsc --checkJs
  --noUnusedLocals`: nothing unresolved, nothing unused), the unused
  `useSession` hooks, Play's stray `undefined/` screenshots and dead
  `build` script, and the finished `docs/REWARDS-NEXT.md`. Tests that
  listed keys of removed screens were updated.
- Not changed on purpose: Fixtures still holds its loading screen until
  the picks settle (a cached day without its tables would reshuffle on
  screen); Play's first-ever open is bound by its odds sources (later
  opens draw the saved board at once).
- Orbit Class wasn't in this session: its kit copy is one version behind
  (it doesn't use the tab bar; run `node kit/sync.mjs` with it checked
  out).

