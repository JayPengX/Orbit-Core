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

## Still to do (from the user's list)

1. **Securities: improve the 資產 (assets) page.** `Quadra-Securities/public/app.js`
   (`poolCardHtml`, `sourcesCardHtml` and the portfolio render). Ideas: an
   allocation donut by category/market, total return and today's change up
   top, per-holding cards with sparkline and weight, income (dividends)
   and a clearer cash section. Securities has its own notification setting
   in `settingsEl()`; switch it to the kit's `notify` and account-sheet
   toggle (order filled, price alerts).
2. **Rewards: more games and content** (the app feels empty).
   `Quadra-Rewards/public/games-ui.js`, `lib/games.mjs` (pay rules and
   tests), `app.js` home. Ideas: more word games (spelling bee, word
   ladder, hangman, speed match), non-word games (memory, reaction, sudoku
   mini), a daily challenge with a streak bonus, weekly goals, an
   achievements/badges page, a leaderboard of your own bests, a word of the
   day on home. Keep pay inside `ECONOMY` caps.
3. **Notifications in Securities, Rewards and Orbit** (the kit's `notify`):
   Rewards (missions ready to claim, streak about to break), Orbit (next
   class starting), Securities (as above).
4. **Overall polish:** keep unifying UI on the kit (`quadra.css`), look for
   rough edges on phone width.

## Notes

- Set the `ECO_TOKEN_SECRET` repo secret on Shared-Proxy to turn on the
  data proxy's token check (without it, `/sports-proxy` doesn't check
  tokens; `/eco` derives a key from the Firebase key).
- One old test pass from an earlier session may still exist (harmless).
- Never commit anyone's pass or codes into a repo.
