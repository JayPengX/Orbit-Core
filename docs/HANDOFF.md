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
