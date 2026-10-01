# Handoff: Quadra, work in progress

All repos develop on a session branch (lately `claude/proxy-unfinished-work-uqde2u`) and are pushed to
`main` after every change (each deploys on push). The shared kit lives in
`Shared-Proxy/kit/`; `node kit/sync.mjs` copies it into every app (never
edit an app's copy). Tests: `npm test` in each repo (Orbit Class also
`npx eslint .`).



## Round in progress: the owner's list of 2026-10-01 (branch `claude/securities-rewards-improvements-8tt0qt`)

Status marks: [x] done and pushed to `main`, [ ] to do. Work top-down is not
required; each item is independent. Images the owner attached (the official
F1 app's driver page, Securities' 匯率 tab) were not readable in the session.

Securities
- [x] 修改 on a 定期定額 plan scrolls to the plan's form and opens it
  (`scrollToPlanForm`, the card flashes).
- [x] 融資 margin calls as Taiwan's brokers run them (`callState`,
  `callDeadline`, `callNeed`, `payDown` in account.mjs; tests
  `tests/margincall.test.mjs`): judged at the close (a dip under 130% in
  Taiwan's session calls nothing), due at the close of the second business
  day after, cancelled at 166% (`MARGIN_RESTORE`), met by paying cash
  against the loans (補繳 button, `call-pay`), repaying or selling; at the
  deadline under 130% the margin holdings are sold (orders wait for the
  next open), between 130 and 166% nothing is sold but the call stands.
  The 115% instant sale is gone: only under 100% (`MARGIN_LIQUIDATE` 1).
  No new 融資 while a call stands.
- [ ] Ultra realism for the whole app (audit: 融資 term of 6 months with
  展延, 信用帳戶 opening conditions, 融資額度, 融券 rules, 當沖, odd-lot
  sessions, fees rounding, settlement T+2 everywhere).
- [ ] 統計分析 tab improved and revamped.
- [ ] 交易明細: a filter button scrolls back to the start (keep the scroll
  where it was); revamp the tab.
- [ ] 匯率 tab looks bad (owner's screenshot); redesign.
- [ ] 資產 tab looks flat; revamp.
- [ ] Home page improved.
- [ ] Remove descriptive lines (too long, unnecessary).

Rewards
- [x] Games fill the phone screen (arcadeView `refit`: canvases sized to
  the space left, boards scaled and centred), a 遊戲列表 button beside
  再玩一局 on the result card, and one XP rate for every game
  (games.mjs `roundXp`/`roundTop`/`roundMinutes`: GAME_XPM × minutes
  played × √(score ÷ best), up to the game's length; scores show as 分).
  Old bests (in XP) stay as they were.
- [x] Sprite directions: pixel T-rex facing right (runner.js, canvas
  360×300), racer car, rockets, chick.
- [ ] Not yet checked game by game on screen beyond ~20 of the 104.
- [ ] Ported open-source games: blocked by the session's permission
  classifier ("Untrusted Code Integration") twice; the owner is granting
  permission. Plan: `public/ported/<id>/` per game with its LICENSE, a
  `public/ported/bridge.js` (`quadra.score(n)`, `quadra.over(n)` posting to
  the parent, `quadra.done` blocking the game's own restart), an arcade
  module per game using a kit.js `portedGame(api, path)` iframe that listens
  for those messages; ARCADE list entries with max/rate set so max/rate is
  an excellent score. Candidates checked: wayou/t-rex-runner (BSD-3; hooks
  in gameOver, restart, distanceMeter.update), gabrielecirulli/2048 (MIT),
  Hextris (GPL-3), iamkun/tower_game (MIT), chvin/react-tetris (Apache-2.0,
  built in docs/).
- [ ] 財富等級 as the point of the game, a milestone of taking part, not
  Quadra's profit. Three sides: the user, Quadra (profit-minded) and "God"
  (who gives starter money, the monthly pay, level rewards).
- [ ] Games fit a phone screen (now a small box at the top).
- [ ] A way back to the games list when a game ends.
- [ ] XP balanced across games (baseball hard, 10-20 XP; dinosaur 20 XP
  for 20 jumps).
- [ ] Every game's UI checked and improved (the dinosaur faces backwards).
- [ ] UI organised (the points shop is spread everywhere).
- [ ] More purpose for points.
- [ ] Home page, 單字 and 任務 improved.
- [ ] Quality games ported in (open-source games, only reading their
  result to bridge into Quadra), replacing the weak home-made ones.
- [ ] Better 說明: every mechanism of the Quadra economy in detail.

Play
- [ ] Home page improved.
- [ ] Real logos and photos through Fixtures' backbone (no letter or flag
  placeholders).
- [ ] 紀錄 tab improved.
- [ ] 投注單 tab merged into the others: four tabs like every app.

Fixtures
- [ ] Played games use two kinds of image for the same team (an official
  logo and a casual picture or just letters): one source per entity.
- [ ] 賽事 date strip: after loading it jumps forward instead of keeping the
  chosen date in the middle.
- [ ] The small yellow bar under an F1 driver in the team view: explain it
  or remove it.
- [ ] F1 driver and team pages with full results like the official F1 app:
  DNF, sprint results; tapping a Grand Prix opens it.
- [ ] History stats for every sport possible (past Grand Prix winners,
  per-driver/team records…), modelled on what the official apps and sites
  show; displayed well; every possible link clickable.
- [ ] The page behind a detail view doesn't scroll while it's open.
- [ ] Traditional TV channels removed: OTT services only.
- [ ] YouTube: name the exact matches that are on it, verified.
- [ ] F2, F3, F1 Academy, GT races (free on YouTube): anything Taiwan can
  watch is in.
- [ ] 直播 tab revamped: what's live, upcoming and just ended on the
  services the person has.
- [ ] 追蹤 tab revamped: personal and informative, not 賽事 filtered.
- [ ] Settings revamped or replaced.
- [ ] Fewer labels, pills and emoji: a cleaner design.

Kit (asked 2026-10-01): a shared loading screen and an update system that
keeps every open session current.
- [ ] `kit/boot.js` written (draft, not synced or wired): draws the loading
  screen into `<div id="loading" data-title data-cache>`, a progress line
  (`window.__bootStep`), the failsafe (`__fxFail`/`__oddsFail` aliases,
  15 s) and a version.json check before the app starts. To do: kit CSS for
  `.q-boot*`, `sync.mjs` copying boot.js to each app's public/ (Orbit's
  public/ too), each index.html's loading markup and inline script
  replaced by it; `watchUpdates` to check every minute and on focus/online,
  tell other tabs via BroadcastChannel('quadra-updates'), apply at once
  unless busy (an input focused, a dialog open, the app's busy()), else
  when free.

From the earlier Next list (below): Fixtures MotoGP standings and rider
pages; Formula E results; Formula E betting in Play once Kambi prices it.

## Photos, F1 team pages, Taiwan-only catalogue, MotoGP and Formula E (pushed to `main`)

Done:
- **Fixtures photos** (`lib/photos.mjs`, `personPic` in `ui.js`): a person's
  photo from the feed, ESPN's headshot by id (`espnHeadshot`: rpm, tennis,
  golf, mma, nba, mlb…), else Wikipedia's page image (batched, checked
  against the sport in the page's description, kept in `fx.pics.v1` on the
  device). Flags and initials only when nothing is found. Used in standings
  (F1 drivers no longer show flags), race orders, draws, cards, rosters,
  lineups, leaders, injuries, follows and search.
- **F1 team pages** (`openConstructor` in `sheets.js`): formula1.com's 2026
  white logos on the team's colour (kit `logos.mjs` F1_TEAMS `f1` slug and
  `zh` name; `f1Constructor` returns `logo`, `zh`, `drivers`), place,
  points, wins, podiums, both drivers with their share, next race, each
  weekend's finishes and points. Constructors show in Chinese.
- Tapping: leaders, injuries and lineups open the player; players without an
  ESPN page (table tennis, badminton, boxing) open `openPerson` (Wikipedia
  summary and their matches).
- **YouTube highlights** link on ended games and sessions (`highlightsUrl`:
  a YouTube search, the league's video first). **最新新聞 removed.**
- **Catalogue (kit `leagues.mjs`)**: `NO_TAIWAN` marks 27 leagues `off`
  (ACB, NBL, CBA, KBL, B.League, NCAAF, Eredivisie, Primeira, Belgium,
  Süper Lig, Saudi, Liga MX, Brasileirão, Argentina, Libertadores,
  Sudamericana, EFL Cup, Copa del Rey, ACL, Asian Cup, friendlies, Euro,
  Copa América, Club World Cup, rugby, cricket, snooker). Fixtures leaves
  them out entirely; Play keeps them in LEAGUES only so open bets settle
  (`onSale`, KAMBI_LEAGUES, EXTRA_LEAGUES and the sport groups skip them).
  Rights were checked by web search in October 2026: re-check yearly.
- **Formula E** (`data: 'tsdb'`, TheSportsDB league 4371, direct, CORS) and
  **MotoGP** (`data: 'motogp'`, api.motogp.pulselive.com through the proxy,
  host added to `sports-proxy-worker.js`) in Fixtures as race weekends
  (`parseMotoGpEvents/Sessions/Order`, `parseTsdbRaces`; tests in
  `tests/motorsport.test.mjs`). TheSportsDB's midnight times show as 時間待定.
- **Where to watch** (`broadcast.mjs`): new services YouTube, SOOP,
  Disney+, Volleyball TV, K League TV, MotoGP VideoPass. KBO free on SOOP,
  J.League/K League on their YouTube channels, WTT and BWF TV on YouTube,
  Formula E on Disney+ (practice on YouTube), MotoGP on 緯來, World Cup on
  ELTA, boxing on DAZN. A row shows a free stream when ELTA names no channel;
  the sheet links to it.
- **Play MotoGP race winner** (last commit): Kambi's "Winner" offer for the
  next Grand Prix (`nextKambiMotoRace`, `parseKambiMotoRace`), a board
  under F1 (`renderMoto`, section `#moto`, sport group `motogp`), legs of
  kind `moto` settled from MotoGP's results (`parseMotoGpRace`; void a
  week after with no race). Not yet seen on screen: check it on a phone
  (the proxy must be deployed with the MotoGP host first).

Next:
- Play: Formula E betting once Kambi prices it (season starts December);
  settle from TheSportsDB results or Formula E's site.
- Fixtures: MotoGP standings and rider pages (the API has
  `/results/standings`; riders' photos from `/riders/<uuid>`).
- Fixtures: Formula E results (TheSportsDB `eventresults.php`).
- Check the ELTA.tv app opener on a real iPhone (see the section below).

## Fixtures: F1 session badges, ELTA's commentary and the app (pushed to `main`)

- A race weekend's sessions (rows, picks, the sheet) carry a coloured badge:
  🏁 正賽 (accent, with a stripe on the row), ⏱️ 排位賽, ⚡ 衝刺賽, ⏱️ 衝刺排位賽.
- `lib/broadcast.mjs`: `eltaAudio(title, ch)` reads ELTA's titles — 原音 /
  英文解說 → 'en', 雙語 → 'dual', 副聲道現場原音 → 'venue', else 'zh';
  `adFree` when it says 無廣告 or it's a MAX channel (540–549). D-LIVE
  (delayed) and "Kids" showings are dropped. 980–989 are MOD's own channels
  (no ELTA.tv page). `channelRank` sorts a game's channels: the person's
  commentary (`prefs.audio`, 'en' by default, set in the TV sheet), then no
  ads, so MAX 原音 → MAX 中文 → 體育台 for F1.
- The 📺 line uses short names (MAX5台, 愛爾達2台) with an audio tag, the
  person's kind highlighted; the sheet's card says 原音・無廣告 · time · where.
- 觀看 on a phone opens `eltatv://live/<ch>` (ELTA's own appRedirect.js
  mapping; its site only bounces to the app once per 12 h, which is why it
  "sometimes" opened). Android uses an intent with the web page as fallback.
  iOS: if the page is still visible after 1.8 s, a toast offers the web page;
  taking it remembers "no app" for 30 days (`fx.eltaAppMiss`). Not testable
  here on a real iPhone: check on the device.

## Fixtures: small-hours big games, bets in the picks (pushed to `main`)

- The night rule (picks are 05:00-24:00 Taipei; `inPickDay`) dropped every
  game starting 00:00-05:00, an MLB wild-card Game 3 at 02:00 included.
  Now `nightWorthy` (picks.mjs `bigGame`: stage post/final/playin or a
  final/series/play-off note; a followed team's; one bet on in Play) keeps
  it on its own calendar day, at its hour.
- Games with open Play slips (`openBetLegs`, the wallet's snap) are in the
  picks: `dayPlan(..., { keep })` adds them on top of the n picks (reason
  `bet`, `bet: true`, the pick on the card via `pickCard`'s `bets`), never
  pushing a pick out, never stopping the fallback or the next-day jump
  (`ownPicks`). Day chips with bets show 🎫 (`betDays`). There's no
  separate 你的投注 list: `lib/bets.mjs` finds each leg's game by Play's id
  or, for a leg bet in play (`g` 'live'), by Play's league (`sp`) and start
  time; a league the day's read didn't bring is read for it (`loadBets`,
  `slot.betEvents`, only those games used).
- **Every bet, finished ones and championships** (Fixtures `lib/bets.mjs`,
  tests/bets.test.mjs; Play's snap.odds now also has `done`, slips settled
  in the last 8 days with `st`, and futures legs carry `fk` market and `tm`
  team): `legEvent` finds a game by id or league+start (names compared in
  any script; two games at once and no name match → no guess), an F1 bet
  its session (nearest within 3 h), a tennis/fight bet the tournament or
  card running then. Settled: only what was played shows, with ✓/✗; a
  settled championship shows nothing. `betsByEvent` keys games by
  league:id, so one game is one card with every bet on it.
- Championship picks (`TITLE_MARKETS`, all 18 Play markets): play-offs
  (`seriesStakes`: game k can decide a best-of-n when someone can reach the
  wins by then, from the series as it stands; next game exact; title round
  'title'; AL/NL pennants ignore the World Series), later rounds as if the
  team gets there (`placeholder` slots, `bracketOf` sides from the
  standings' group names, `knockedOut` from `playoffRun`), knockouts
  (`knockoutStakes`, real games only), league tables (`tableStakes`: could
  end title hopes or settle them) and F1 (`f1Stakes`, 25/43 a weekend, +8/15
  with a sprint). Loaded on demand by app.js `loadTitleData`; the night
  rule keeps any event a bet points to (`betOn`).
- Days other than today read tennis, golf, racing and fight leagues by
  ESPN's dated page (`scoreboard(k, dates)`), not the season's (19-26 MB
  for ATP, WTA, PGA: it hung the page). `sportDays` still reads seasons.

## v11: a points catalogue, Plus perks reviewed, loans counted once (pushed to `main`)

- **積分兌換** (kit `CATALOG`, `catalogCost/Limit/Entry/Tokens`,
  `catalogPlusMonth`, `CATALOG_BETS`): Rewards' Home redeems points into
  Quadra's own products, entries `vocab:xs:<item>:<key>` (kind `redeem`,
  amount 0, points in the note). The Worker's `REWARDS_XP` has a member's
  price (90%) as the floor; `tests/kit.test.mjs` checks they match.
  - `bet100` / `bet500`: Play free bet NT$100 / 500 for 5,000 / 22,000 XP,
    NT$1,000 of face a Taipei month; the kit's `freeBets` returns them, so
    Play's slip takes them like any token (label 積分兌換), spent as
    `odds:fb-<token id>`.
  - `fee`: up to NT$100 off the next Securities fill with commission
    (`fillOrder`, `fill.voucher`/`voucherOff`, the rest lost), 4,000 XP, 30
    days, 3 a month. The ticket shows it (`ticketVoucher`).
  - `td`: +0.5% on one new 定存 of up to NT$100,000, first term only
    (early closing pays the posted rate, roll-over drops it), 12,000 XP, 30
    days, 1 a month (`openDeposit` `bonus`, 理財's checkbox).
  - `plus`: a month of Plus for 20,000 XP, once a calendar quarter, only
    after the free month; this month, or next when this one is held. The
    Worker's `plusPointsEntries` (in `paydayEntries`, before renewal) writes
    `eco:plus:<month>` amount 0 note `points`, enforcing all of that. A
    points month is no payment: `plusLapsed` ignores it (eco.js and kit), so
    it never revives a lapsed subscription.
  - Securities marks spent vouchers in the wallet as `stock:xs-<token id>`
    (amount 0) so Rewards' held counts are right (`usedVouchers`).
- **Plus perks (v11):** word packs no longer half price (`packShare` 1; the
  Worker's `REWARDS_SHOP` keeps the old floor for purchases still in a
  device's outbox); added catalogue 9折 (`PLUS.vocab.catalog`), 定存 +0.1%
  (`PLUS.stock.tdBonus`, `depositRate`) and a 20% lending cut
  (`PLUS.stock.lendCut`, the `lend` event's `cutRate`, `lendFee`). Help,
  `plusPerks`, the Plus sheet and the one-time notice `quadra.seen.v11`
  (`v11Notice`, accounts made before 2026-10-03 Taipei) say so.
- Model (`node tools/economy.mjs`, v11, PEOPLE's `cat*`): the house still
  nets a profit on everyone; catalogue costs are a free bet's expected
  return, a voucher capped at the commission there is, a member's Plus
  month at the fee forgone.
- **Loans counted once (Securities):** the wallet snap's `stock.cash` was
  own cash less every loan while `holdings` were net of the same loans, so
  a loan came off twice (an owner's account showed −NT$46,687 in Play with
  NT$22 of real cash). Now `stock.cash` is the cash as it is; loans live in
  holdings and Securities' own margin checks. 融資 buys from before
  2026-10-01 10:49 Taipei borrowed the shortfall as plain `borrow:` loans;
  `linkOldLoans` (in `afterPrices`) ties each, once, to the buy placed
  within 5 minutes after it (a `link` event dated when made, newest first,
  capped by what's owed and the shares' cost, loans already paid off left
  alone), so selling repays first and a margin call sees them.
- Open question for the owner: October's overdraft interest (`eco:od:2026-10`)
  was charged on balances that double-counted loans; a refund would have
  to be a Worker entry. Not done.

Rules: push every change to `main` in every repo; `npm test` in each (Orbit
also `npx eslint .`, after `npm ci` in a fresh container); edit the kit only
in `Shared-Proxy/kit/` and `node kit/sync.mjs`; commits end with the
Co-Authored-By and Claude-Session lines; `tools/preview.mjs <app> --store
quadra.seen.v8=1 --store quadra.seen.v10=1 --store quadra.seen.v11=1` for
screenshots (Yahoo often answers 429 for Securities' prices).
## Ultra realistic, v10: a fixed salary, savings, points that expire (pushed to `main`)

- **Pay is fixed** (eco.js `PAY_MONTH`, kit `ECONOMY.monthly`): NT$6,000 on
  the 1st of every Taiwan month for every account, like a salary; back pay
  for missed months as before. v7-v9 paid 8,000 / 4,000 / 1,500 / 500 by
  worth, which paid saving less and losing more. `payFor()`/`paydayFor()`
  keep their names and ignore worth; `ECONOMY.payTiers`/`PAY_TIERS` are
  gone. Text says 月薪/薪水 (“pay”) instead of 津貼.
- Model (`node tools/economy.mjs`, v10): a regular bettor −NT$1.9k a month,
  an investor +3.9k, a saver +5.4k; 4,000 or 5,000 broke a regular within a
  year.
- **Securities › 換匯・融資 › 理財** (`lib/savings.mjs` has the terms;
  account.mjs the events):
  - **定存:** NT$10,000+, 1/3/6/9/12 months at Bank of Taiwan's posted fixed
    rates (1.23-1.72%), events `td` and `tdend`. Early closing pays nothing
    under a month, else 80% of the rate for the longest term held, for the
    days held. Optional roll-over (principal at the then-posted rate,
    interest paid out). Matured deposits are closed (dated at maturity) by
    `matureDeposits` in `afterPrices`. In net worth (`savedTWD`), not in
    margin assets; they leave the shared cash while locked.
  - **借券出借:** whole lots (1,000) of settled TW stocks/ETFs not bought on
    margin; fee 1.2% / 0.6% a year on the value when lent, the broker keeps
    30%. Events `lend`, `recall` (with `back`, 3 business days on) and
    `lendpay` (dated `back`, so replay pays it then). Lent shares are out of
    `available`, so they can't be sold; contracts end by themselves after
    180 days (`matureLending`).
  - Interest or a fee over NT$20,000 at once: 10% withheld, 2.11% NHI
    (`incomeTaxes`).
  - A default breaks every deposit (bank set-off, early rate) and recalls
    lent shares (`recallAll`); a missed margin call or liquidation recalls
    too. The 7% penalty is charged once per overdraft now
    (`defaultAt >= od.since`), later rounds only sell. Forced-sale plans skip
    lent shares.
- **Points expire** (kit `xpLots`, `xpBalance(wallet, now)`, `xpExpiring`):
  each Taipei month's points at the end of the same month a year later,
  oldest spent first; points from before v7 count from v7. The level
  (`xpEarned`) never drops. Rewards' level card and the account sheet warn
  60 days ahead.
- **Plus like a real subscription:** billed every month while on, opened or
  not (months away charged on return, after their pay; yearly by the year).
  A charge the pool can't cover writes `eco:plusfail:<month>` (amount 0)
  and the membership lapses (`plusLapsed`, eco.js and kit; `plusRenewing`
  is false) until joined again; no retry. The kit notifies once
  (`quadra.seen.plusfail`). The sheet's fine print: auto-charge, failure,
  no refunds, 5% VAT included. Free bets (Play `FREE_MIN_ODDS` 1.5, every
  pick; `placeFreeSlip` refuses with `freeOdds`); no cash out, 7 days, as
  before.
- One-time notice `quadra.seen.v10` (`v10Notice`) for accounts made before
  2026-10-02 Taipei.
## Slower levels, more for points, confirm before buying (pushed to `main`)

- **融資 as a broker does it** (Securities): no cash loans. A buy can be
  融資 (`placeOrder` `margin`, ticket 現股/融資): it holds only one's own part,
  and on filling lends `collateralRate` of it (`loan:<order>` borrow event
  with the symbol; the position's `financed`). Selling repays that share of
  it first (`repay:<order>`, `fill.repaid`). Loan values: Taiwan 60% / OTC
  50%, Reg T 50% elsewhere, none on A-shares, India, crypto, funds, gold,
  currencies; government bonds 90%, corporate 70%. Interest is added to the
  loan (never charged to cash). The loans tab only repays.
- **Overdraft collected like 違約交割:** NT$ cash below zero starts
  `account.od.since`; after OD_GRACE (2 days) Securities sells holdings for
  it (coverPlan, market orders `forced` + `cover`, which don't trigger the
  loans' repayAll). Covered, `od` goes.
  Past the deadline it's a default: `penaltyEvent` (7% 違約金, event type
  `penalty`), `account.defaultAt`, and `defaulted()` blocks 融資 and short
  selling for DEFAULT_BAN (5 years). A margin call (under 130%) not met in
  CALL_GRACE (2 days, `account.call.since`) sells every holding bought on
  margin (`callPlan`, 斷頭); under 115% it's liquidated at once as before.

- **Securities' cash for the other apps** (snap `stock.cash`) is its own NT$
  less what it owes on loans: borrowed money stays for trading, never bets
  in Play or covers an overdraft. Margin itself: collateral 0.6 of stock
  (cash none), so borrow → buy → borrow converges at 1.5× own money (2.5×
  exposure, Taiwan's 60%). 定期定額 can be changed (修改: amount and day,
  `state.planEdit`, saved over the plan by `setPlan`).

- **Streak = 5 missions a day** (kit `STREAK.missions` 5, `bonusCounts` 2,
  `missionDays`): of the six daily ones three are in the other apps, so a
  kept day always goes through them; the bonus ones that spend money (now
  40–60 XP) count too, two a day at most: the easy way, never a must.

- **Levels** (kit `xpForLevel`): 100·(L−1)²: Lv 10 at 8,100, 20 at 36,100,
  50 at 240,100 (about a year of daily play). **Daily soft cap**
  (`ECONOMY.dailyXp`, Rewards `dampXp`/`capStage`): words and games give the
  first 600 XP a day in full, the next 600 at half, then a tenth (×Plus,
  streak and ×2 boost move the steps); missions, weekly goals and the daily
  challenge aren't counted. Home's level card shows where today stands.
- **Points buy more:** frames (kit `FRAMES`, setting `frame`, `q-framed
  q-frame-<id>` on the account button; bronze Lv 10, legend Lv 40, mythic
  Lv 50, five bought 2,000–30,000 XP), a daily mission swap (100 XP, 2 a
  day, `vocab:xs:reroll:<day>:<mission>`, `dailyMissionIds(day, swapped)`),
  yesterday bought back for the streak (1,500 XP, when a streak of 3+ broke
  and no card is held, `vocab:xs:repair:<day>`, counted by `activeDaySet`).
  The Worker's `REWARDS_XP` has `frame`, `reroll`, `repair`.
- **Every purchase asks first** (kit `ask`): Play bets (cost and the most it
  pays), lottery tickets, scratch cards; Securities orders, exchanges,
  loans, monthly plans; joining Plus (kit). Rewards already did.
- **Prices at the moment of buying:** a Securities order goes in at once
  as a 委託單 held for a fresh price (`placeOrder` `fresh` → `waitFresh`;
  `processOrders` fills it only at a quote with `got` after it, `fetchQuotes`
  stamps `got`); `atFreshPrice` reads the quote straight away (a few tries),
  the usual refresh after that. Play's slip redraws with each board refresh
  and marks odds that moved since the pick was added (`pickedOdds`, ▲/▼ and
  the old figure); placing is one tap at the odds now, stopped only by a
  pick closed or started.
- **Free bet as a cut** (Play `placeFreeSlip`, `freeValue`): more can go on
  top from the balance; a win pays all but the free part's stake.
- **Words:** smart mode never asks a flash card; letters questions have no
  sound (it made them dictation) and give the first letter (two for 8+).
- **Fixtures 首頁 你的投注:** the day's games with open Play slips
  (`playGameId` = the slip leg's `g`), live, with the pick under each, above
  正在進行 (and not repeated there). Baseball's live line: count and
  batter vs pitcher on a line each.
- Play's 我的彩券 has no count; VIP explained as rows; Securities' margin
  gauge labels sit either side of their ticks.
- `tools/preview.mjs --snap '{json}'`: the wallet's snap to start with.

## Streak by missions, mastery over days, fair cash out (pushed to `main`)

- **Streak = 3 daily missions** (kit `STREAK.missions`, `missionDays`,
  `activeDaySet`): from `STREAK.from` (2026-10-02) a day counts when 3 of
  that day's daily missions were claimed (`vocab:m:<day>:<id>`, the bonus ids
  in `STREAK.bonus` aside) or a card covered it; earlier days keep the old
  rule (any practice or game). Rewards' `streakToday` drives the
  「領取 3 個每日任務保住連續紀錄 · n/3」 line (任務 and home), the 20:00
  notices (→ #missions) and push.
- **Missions** (Rewards `MISSIONS`, `dailyMissionIds`): six a day from a pool,
  same for everyone, 3 in Rewards (words20/words50, master3, hard10 = right
  by ear/letters/dictation, perfect = a 10+ round without a miss, game1/games3,
  challenge) and 3 elsewhere (quotes, match/matches3, orbit, tour), at most
  one of a `group`. Nothing that's a personal choice (watchlist, follows).
  Bonus missions (invest, parlay3, scratch, lotto) spend money: always
  shown in their own section, never count for the streak. Fixtures' `open`
  now counts each match once a day (`matches3`); Play's scratch card no
  longer also counts as `lottery`.
- **Weekly:** `days5` = days kept with missions; all four claimed → a
  protection card (Rewards `weeklyCards`, in `freezes().granted`).
- **Words:** a word moves up one box a day at most (`grade`), so mastery
  comes from the record over days: known-at-first-sight → box 3 due
  tomorrow, right then → mastered; the in-round confirm is gone. Rounds
  take box-3 due words first. `BOX_DAYS` 0,0,1,1,5,14. Smart mode
  (`smartType(p, random, word, used)`) picks from the kinds that suit the
  box the one least used this round, so a round has all six (flash cards
  weighted ×4, i.e. rarer). The voice picker (單字發音) is gone: recordings,
  the device's best voice only as the fallback.
- **Play cash out** (`cashOutValue(slip, chances)`): weighed by the board's
  fair chance (`fairChance`, margin out), not 1 / odds (that gave the margin
  back: cashing out beat holding, and small odds moves were a profit, more
  with Plus's 2%). Untouched, it's below the held worth; no `fairChance` →
  1 / odds less 10%.

## Missions that count, and a streak that matters (pushed to `main`)

- **Lost mission steps:** each app built its `act:<app>` counts from its copy
  of the wallet, so two steps in a row (Play's `bet` then `parlay`, the
  lottery's `lottery` then `scratch`) raced and the Worker kept only one
  (same millisecond: whichever it read last). The kit's `activityPatch` now
  keeps the day's counts on the device (`quadra.act.<app>`), merges by the
  larger of each, and gives each write a newer `t`. A free bet's parlay
  always went through `track('parlay')`; it was this race.
- **Missions, concrete:** Securities `invest` counts an order placed
  (`trade`; watching no longer counts); `quotes` (new) three different stocks
  opened (`view`, once a stock a day, Securities `openDetail`) replaces the
  daily 定期定額 (it counted only a symbol that never had a plan); Fixtures
  `match` counts a match opened (`open`; following no longer counts).
  Texts say exactly what to do.
- **Streak** (kit `STREAK`, `activeDaySet`, `streakOf`, `longestStreakOf`,
  `streakBonus`, `streakCards`): any word practice (flash cards and misses
  too: a batch is written with 0 points) or finished game (0 points too)
  counts; a protection card covers a day. Points ×(1 + 2% a day, up to +30%)
  (Rewards `xpRate`); 7, 30, 100 days (longest ever) each unlock an avatar
  (🐯 🦅 🏆) and a protection card, with a pop-up once. Home's level card
  shows it; 任務 › 等級與頭像 has the streak road.

## Fixtures: one date strip (pushed to `main`)

- 賽事 uses 首頁's `dateStrip` (weekday and date chips, 📅 for any day,
  growing as it's scrolled) instead of its own chips with counts and ‹ ›:
  `only` the league's game days, its own `range` per league (`sc.range`),
  `grow` → `growScores` (sc.extra + 1, read without redrawing). A day picked
  that isn't read yet (an ESPN league's) is read on its own
  (`pickScoresDay`). `loadScores` is `fetchScores` + `applyScores` now.

## Round: more for points, and tidier pop-ups (all repos, pushed to `main`)

- **Avatars** (kit `AVATARS`, `avatarOwned`, `avatarOf`): the account button in
  every app wears the one chosen (wallet setting `avatar`, `{ id }`); level
  ones at 1, 5, 10, 15, 20, 30, 50, eight bought with points (300-5,000 XP,
  `vocab:xs:avatar:<id>`, the Worker's `REWARDS_XP.avatar`, which also refuses
  buying a level one), ✦ for Plus members. Not owned any more → the person.
- **Level rewards:** a streak card at levels 5, 15, 25… (`levelCards`, added
  to Rewards' `freezes().granted`); a level-up pop-up once per device with
  what the level brought (`checkLevelUp`).
- **Rewards 任務 › 等級與頭像:** the next four levels that bring something
  and the avatar grid (wear, the level it needs, its price, or Plus); the
  home level card opens it.
- **Pop-ups:** the kit's `ask`/`tell` take `points` (short rows: icon, bold
  line, quiet line); the update notice and stop-renewing dialog use them.
  The Plus sheet shows a member's fee, months and total as three figures.
  Money and points prices are two pills under each shop item.

## Round: v9, Securities earns a little more (realistically) and Plus keeps members (all repos, pushed to `main`)

- **Why Play earns and Securities doesn't:** per investor a month (the model's
  NT$40,000, ~70% invested, NT$50,000 traded) Securities keeps ~143 commission
  and ~157 sell tax and exchange fees (a sink like any other in play money),
  but the market pays holdings ~7% a year (~163) and cash earns 0.8%: net
  about +130, against ~7,900 from a regular bettor. That's realistic: a
  broker keeps ~0.3% of turnover, a sportsbook 5-15% of stakes.
- **Mutual funds** now pay a 1% subscription fee (申購手續費, `FUND_FEE` in
  `markets.mjs`, a Taiwan online fund platform's discounted rate; Plus's
  2.8折 applies) and nothing to redeem, instead of the US stock commission.
- **Plus cash interest** is 2% on the first NT$100,000 only (kit
  `PLUS.stock.cashCap`, like a Taiwan digital bank's high-interest tier);
  0.8% on the rest.
- **Plus at full use:** typical members cost about the fee (v8 table). The most
  a bettor can take: a free bet staked on long odds returns up to ~86% of its
  face (1 − the cut), about NT$750 a month, plus two cards (NT$600 only if
  they'd have bought them) and ≤ NT$100 of cash interest. A heavy trader saves
  72% of commission with no cap (as real brokers' discounts), but still pays
  the rest and the 0.3% sell tax, so still earns the house money, just less.
  Light users earn the house the most.
- **Keeping members** (kit): the Plus sheet shows the fee, this month's
  returns (free bets, cards at shop price, boosts), the month count and the
  total since joining (`plusReturns({ all })`, `plusTenure`); a banner when
  the weekly free bet arrives and three days before any renewal, the free
  month included, with how to stop (`plusNotices`, notice kind `plus`);
  stopping is one confirmation that states what Plus gave back and what
  stays and stops; Rewards badges at 3, 6 and 12 Plus months. No dark
  patterns: cancelling stays under 管理會員, and every charge is announced.

## Round: v8, points with a purpose and a Plus worth paying for (all repos, pushed to `main`)

v7's Plus (NT$990) gave every kind of member less than its fee, so nobody
would pay; points had no use. Now:

- **Levels and titles** (kit `xpLevel`, `xpEarned`, `xpBalance`): level L
  from 50·L·(L−1) XP (2 at 100, 5 at 1,000, 10 at 4,500, 20 at 19,000),
  titles 新手 Rookie → 神話 Mythic. On Rewards' home (with the progress to
  the next level) and every app's account sheet.
- **Points buy things** in Rewards (shop.mjs `redeemEntry`): a streak card
  600 XP, word points ×2 for 30 minutes 300 XP, packs 8,000 / 12,000 /
  16,000 XP, next to the money price. Entries `vocab:xs:<item>:<key>`, kind
  `redeem`, amount 0, the points in the note; the Worker drops one priced
  under `REWARDS_XP` (the app checks the balance; like money, the Worker
  doesn't). Spending lowers `xpBalance`, never the level.
- **Plus v8** (`tools/economy.mjs` PLUS_V8, the v8 rows): NT$490 a month /
  4,900 a year; a NT$200 free bet every Monday (was 100); two streak cards a
  month (was one); Rewards points ×1.5; packs half price; Securities perks
  and cash out as before; the daily +10% lift is gone (`PLUS.odds.lift: 0`,
  Play hides its row). Face value to a bettor about NT$1,470 a month (3×
  the fee); expected cost to the house NT$340-690, so the house earns about
  the same from a member as from a non-member (casual +100, regular +79,
  high roller +100, investor −3, heavy bettor −200 from cards it no longer
  sells, words only +149).
- **The free first month** (unchanged: the rest of the month you first
  join) costs the house what the perks cost without the fee: NT$340-690 for
  a full month, less mid-month.
- The one-time notice is now `quadra.seen.v8` (v8Notice) with all of it.

## Round: v7, Rewards pays points, the only money is Quadra's (all repos, pushed to `main`)

The owner asked that Rewards stop paying money: the opening money and the
monthly allowance are the only money Quadra gives (a mechanism for the
economy, not a payout), and every product must earn the house money
without them (`node tools/economy.mjs`, the v7 rows and the house table).

- **Rewards gives points (XP), never NT$:** words, games, missions, weekly
  goals and the daily challenge write entries with `amount: 0` and `xp`
  (`lib/earn.mjs`: `xpOf`, `xpToday`, `xpAllTime`, `xpText`); no daily caps.
  Old paid entries count as points (`xpOf` falls back to the amount), so
  streaks, weekly goals and badges carry on. The three Play/Securities
  missions give points instead of free bets. Outbox entries still waiting
  with an amount become points on load. The shop is the only money Rewards
  moves (streak card 300, word points ×2 150, packs).
- **Worker (`eco.js cleanEntry`):** drops a new `vocab` entry with a positive
  amount or a `vocab:fb:` id; keeps `xp` (≤ 10,000) on `vocab` entries.
  Nothing already stored changes.
- **Allowance (v7):** 8,000 / 4,000 / 1,500 / 500 by worth (was 6,000 /
  3,000 / 1,500 / 500), kit `ECONOMY.payTiers` = `eco.js PAY_TIERS` (tested
  together). A regular bettor levels out near NT$32,000; casual players and
  word learners grow slowly into the lower tiers; heavy bettors drain.
- **Plus (v7):** NT$990 a month / 9,900 a year (was 390 / 3,900); the parlay
  boost is no longer doubled (`PLUS.odds.boost: 1`, Play hides the Plus
  ladder hint), the daily +10% lift covers a slip up to NT$500 (was 1,000),
  no extra word pay, packs half price for members instead of included
  (`PLUS.vocab.packShare`; the Worker's `REWARDS_SHOP` minimums already
  were half). Members' old slips keep their stored `boost`. The house now
  earns more from every kind of member than from the same non-member.
- **Kit:** a one-time notice (`quadra.seen.v7`) for accounts made before
  2026-10-01 Taiwan (`V7_AT`) explains the change; the statement skips
  zero-amount entries (points, tokens); Rewards' role reads 積分、目標與說明.
- **House per user a month, at NT$40,000, excluding the allowance** (v7
  model): casual +565 (Plus +1,258), regular +7,871 (+7,941), high roller
  +61,601 (+62,396), investor +2,114 (+2,211), heavy bettor +11,288
  (+11,378), words only +383 (+1,331). Promotions stay 2-13% of the gaming
  take for bettors.
- Not changed: back pay for months nobody opened an app (`paydayEntries`
  pays every missed month on return); VIP cashback; cash interest.

## Done in the round before

- **Sell every game, one reach, one cut (Play + Fixtures):** Play sells every
  league's games up to 14 days out (`SOLD_DAYS` in `kit/leagues.mjs`, the
  same for all leagues and sources; Fixtures' 投注 uses it too, so every ESPN
  game in reach gets 投注). A game no bookmaker prices yet (NBA preseason, a
  game DraftKings hasn't posted) is priced by the house (`Quadra-Play/public/
  lib/house.mjs`: ESPN standings, last season regressed, log5 plus home edge,
  soccer's draw, preseason pulled halfway to even); DraftKings' line replaces
  it once posted. Past the daily pages, ESPN's month pages (`dates=YYYYMM`)
  fill the second week. The house cut is one rule now (`rules.mjs houseCut`):
  the lottery's measured cut per kind of market, no league-tier, source-gap,
  line-step or source-specific extras; one win K (`K_WIN`, 1.158), so prices
  stay close to 運彩's.
- **CPBL empty on the live proxy (fixed on the device):** cpbl.com.tw
  refuses Cloudflare (403; its /schedule page also 404s/loops from anywhere
  now) and TheSportsDB rate-limits the Worker (429), so every CPBL month came
  back as 0 games and was cached as if the league had none (Fixtures stuck on
  August, Play only Kambi's day). The Worker now answers 502 with the reasons
  (never cached); the kit's `asiaMonth` then reads TheSportsDB's day lists
  straight from the device (CORS open), two weeks back to two weeks ahead
  (`tsdbDays`, `parseTsdbDay`, shared with the Worker). Past months beyond
  that stay empty until a server-side source works again.
- **Every sport (Kambi leagues too):** Play sells every game on a Kambi
  league's own schedule (`Quadra-Play/public/lib/schedules.mjs`): Asian
  baseball's month lists (strength from this season's results; settled from
  the lists, final-score markets only via `scoreOnly`), ESPN's UFC cards
  (records), tennis draws (ranking points, each tour's singles), and every match in Kambi's list for the
  rest (priced or not; the 16-match cap is gone). Kambi's price replaces the
  house's once posted (`pricedByKambi`). Fixtures' 投注 no longer reads
  Kambi: every game of every league Play sells, within `SOLD_DAYS`.

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

## Round: live everywhere (Play, Fixtures, sports-proxy)

The owner saw Play's live betting vanish once games started and Fixtures'
直播 show only the big games.

- **Play's 場中 covered MLB and the Premier League only**; every other game
  left the board at its start with nowhere to go. Now every league Play
  sells has live betting:
  - Kambi's sports (NPB, KBO, CPBL, EuroLeague, B.League, tennis,
    badminton, table tennis, volleyball, snooker): Kambi's own live prices
    (`listView/<league>/in-play.json`, `parseKambiInPlay`), margin out,
    the house's live cut; winner, and for baseball and basketball the main
    handicap and total. A suspended price isn't offered.
  - Every ESPN soccer league: the soccer model (three-way winner, totals).
  - NHL: goals left by the share of the clock (`liveGoals`); NFL, NCAAF,
    NBA, WNBA, NCAA basketball: the points model scaled to the clock left
    (`livePoints`, `shareLeft`).
  - Which ESPN leagues are read: MLB and the Premier League always, and
    any league whose scoreboard (read for the board) had a start within
    its sport's length (`liveLeagues`). Pregame lines from those
    scoreboards, else the game's summary (a failed read is retried).
  - The live cut is `houseCut({ base: 'live' })` (MLB and the Premier
    League unchanged; lesser leagues a little more). `ODDS_ERROR.liveOther`.
  - Fixed on the way: `pointsMarkets` with no posted spread put its main
    handicap on the wrong side (`half(-margin)`), so such games got none.
- **Fixtures' 直播** read only the followed leagues and those on Taiwan TV
  (up to 24). Once it's open it now also reads every other league's
  current scoreboard (`loadRest`), so every game on anywhere is listed,
  headline leagues first in each sport; the tab's badge counts them all.
- **sports-proxy:** Kambi `…/in-play.json` is cached 20 s (was the 2-minute
  pre-match tier); the Kambi trim keeps each price's `status` and the
  match clock.


## Round: Asian baseball, sports split, next game day, F1 pole, one catalogue

- **Asian baseball in Fixtures:** Kambi lists NPB, KBO and CPBL only a day
  or so ahead (none at all some days), so 賽事 said "no recent games"
  mid-season. The sports proxy now gathers them from the leagues' own
  sites (`asia-baseball.js`: npb.jp's monthly page, koreabaseball.com's
  monthly list, cpbl.com.tw's season list with its anti-forgery token;
  TheSportsDB's day lists for CPBL when its site refuses) and answers as
  `https://asia-baseball.quadra/<league>/<YYYY-MM>.json` (this month and
  next a minute fresh). Fixtures reads them (`asiaEvents`), past games
  with scores, home and away, void rain-outs. Play still prices them from
  Kambi when Kambi has them.
- **One catalogue (`kit/leagues.mjs`, synced as `lib/catalog.mjs`):** every
  sport and league once, with where each app reads it (`data` for
  Fixtures, `bet` / `odds` for Play). Fixtures' `lib/leagues.mjs` and
  Play's `LEAGUES` (`lib/teams.mjs`) are views of it (Play's table was
  checked equal, all 62 leagues). Add or fix a league there, run
  `node kit/sync.mjs`, commit both apps. The Asian baseball reader
  (`asiaMonth`) lives there too.
- **球拍與其他 split:** 羽球, 桌球, 排球, 司諾克 are sports of their own;
  a saved `racket` follow becomes the ones of its followed leagues (all
  four if none).
- **賽事** opens on the day with a game on (today first), else the next
  game day however far (it used to stop at 4 days, then showed the last
  round).
- **F1:** 排位賽第一 (pole position) in Play until qualifying starts:
  Polymarket's driver pole market when open, Kambi's if it lists one, else
  the winner's chances sharpened (`f1PoleFromWinner`, unchecked); settled
  from ESPN's `Qual` session (`parseEspnPole`). Play reads ESPN's whole F1
  season (`dates=<year>`): the plain scoreboard stays on the last race all
  week, so the qualifying time (and the winner board's before/after
  qualifying prices) was missing until the weekend. Fixtures: 投注 on F1
  qualifying and races (rows and sheets) opens Play's F1 board
  (`#game=f1` / `#game=f1pole`); Play's link also finds a game already
  live, and teams spelt differently by the two sources.

## Round: live on both homes, UFC/NRL/AFL in Play, one set of links, flags

The owner saw no live game recommended on home, UFC in Fixtures but not in
Play, no CPBL schedule, letters for table-tennis players, Fixtures→Play links
that didn't land on live games, and text cut on phones.

- **Fixtures 首頁 opened on tomorrow while games were live:** a day read
  before the pass's follows arrived (zero leagues) counted as "nothing on
  today", so `autoDay` jumped ahead. Days now remember the leagues they were
  read for (`leaguesKey`), are read again when those change, and never jump
  from a saved or half-read day. 首頁 opens with **正在進行** (the person's
  games on now, ranked like the picks; with none of theirs on, the best of
  everything on now), taken out of the lists below. Today's rest (every
  league's current scoreboard) is read a moment after the first read, so
  直播's badge is the same number everywhere.
- **Play 首頁: 場中焦點**, live games with live win prices, ranked like
  焦點賽事; the live board refreshes on home too. (Also fixed: reopening Play
  on home with a saved board threw on `balance(null)` and threw the saved
  board away, so every reopen was a cold start.)
- **Delayed ≠ postponed:** ESPN's `STATUS_DELAYED` / rain delays were void
  (延期) in Fixtures while Play had them live. Now `status.delayed`: 延遲開賽
  before the start, "· 暫停" during.
- **UFC, NRL, AFL, FA Cup in Play** (catalogue: `bet`, `odds: 'kambi'`,
  `results` / `scores`): UFC bouts from Kambi (`ufc_mma/ufc`, winner only),
  settled from ESPN's card (`parseEspnFight`, either order, draw/NC void),
  fighters' flags from ESPN's cards (`rememberFighterFlags`); NRL and AFL
  from Kambi with the points model (`SCORE_SPREAD.nrl/afl`, whole-game markets
  only), settled from ESPN (`findEspnGame`, club words, sides turned when
  needed); the FA Cup from ESPN like any soccer league. All four simulated
  (`SIM_SPORTS`). **K League removed:** ESPN answers 400 for `kor.1`, no source.
  **Not in Play:** golf, NASCAR, IndyCar (Kambi's public feed has no clean
  winner market for them: several unlabeled "Finishing Position" offers for
  golf, nothing for the series); Fixtures-only.
- **Links Fixtures → Play:** `playTarget(e)` in Fixtures' ui.js is the one
  place (rows, cards, sheets): `game=<id>` for games, `league=<key>` for a
  fight card or tennis draw, F1 as before; each bout and draw match in a
  sheet has its own chip (`playPairId`). Play: `#league=<key>` opens that
  league once its games are in; a wanted game matches players in either
  order, opens its **live card first** (the board can still hold it from
  before the start), never the same clubs' next-day game (a baseball series;
  the id match is kept within 12 h), and reads the game's league live even
  if the board didn't list it (`loadLive(…, extra)`). Not found once every
  league and the live list are in: its league's board with a line saying
  why (`wanted-note`).
- **CPBL schedule:** cpbl.com.tw's season list stopped at September's last
  game while the season had a week to go (October returned 0). The proxy now
  fills the days after its last game from TheSportsDB (`mergeCpbl`, day lists
  cached 10 min at the edge).
- **Players' flags** (kit `playerNation`, `playerFlag`, `flagUrl`: circle
  flags from jsDelivr, emoji fallback): a table of the tours' regulars
  (table tennis, badminton, snooker, tennis), else the country Kambi files the
  match under (its path words, now kept by the proxy's Kambi trim, or a
  domestic series' name: TT Elite Series → Poland, Czech Liga Pro → Czechia).
  Catalogue `players: true` marks those leagues (tennis, UFC too).
- **Nothing cut on a phone:** live status, league names, live lines, event
  titles, side names and fighter names wrap to two lines; table tennis,
  badminton and volleyball periods read 第N局 (tennis 第N盤); card and golf
  statuses in Chinese (選手進場, 第2回合, 第2輪 進行中); ESPN's last play
  translated in the match sheet; Play hides Kambi groups that only repeat the
  league ("中職 · Chinese Professional Baseball"), and shows the catalogue's
  headline leagues (CPBL) with the majors instead of folding them away.
- **`node tools/leagues-audit.mjs`**: every catalogue league against its real
  sources (Fixtures' schedule, Play's prices), one line each. Off-season and
  Kambi-empty days (B.League before its season, badminton and volleyball
  between events) show 0 there; that's the source, not the apps.

## Round: broadcasts, Chinese everywhere, sheets (branch `claude/live-games-recommendation-consistency-nm0x4l`)

- **ELTA's own schedule** (`piceltaott-elta.cdn.hinet.net/…/sports_live_program_list.json`,
  two weeks ahead; allowed and always trimmed by the proxy: `trimElta`, kept
  30 min). Fixtures' `lib/broadcast.mjs` (`parseElta`, `eltaPrograms`,
  `broadcastsFor`) and `lib/tv.mjs` (`tvOf`, `channelsOf`) match each program
  to its game: same league, starting an hour before to 20 min after, either
  side's Chinese name (`zhSame`: two characters in a row, so 里茲聯 = 利茲聯).
  A program without the sides ("【onELTA 熱身賽】") goes to the only game near
  it, or is marked 同時段擇一，待公布. Inside the schedule's days a game ELTA
  doesn't carry isn't said to be on ELTA (the NBA: one game a day, from the
  preseason's 10/6; `NBA_ELTA_FROM`); beyond them, the league list with the
  NBA's note. Channels: 101/105/110/115 = 愛爾達體育1–4台 (MOD, cable,
  ELTA.tv; Hami Video too), 540–549 = ELTA.tv 體育MAX1–10台; each has its
  ELTA.tv watch page (`eltaWatchUrl`). Shown: a 📺 line under each game ELTA
  carries, the pick cards' chips, a 台灣轉播 card with watch links in the
  match sheet, and 直播's 愛爾達轉播表 (now and the next 12 h). "Your
  services" picks use each game's own channels.
- **Teams in Chinese:** kit `names.mjs` (synced to both apps as
  `lib/names.mjs`): MLB, NBA, WNBA, NFL, NHL (city + nickname: rows show the
  nickname, 海盜), Europe's clubs and MLS (one name, any competition), NPB,
  KBO, CPBL (統一獅 in a row). Play's `teamZh` is the kit's now (NFL, NHL,
  soccer beyond the EPL gained names). Fixtures' `localSide` puts the Chinese
  in `name`/`short` and keeps the English in `en`: Play ids, follows (the
  pass keeps English: Play matches by it), affinity keys (`eventKeys`) and
  ELTA matching use `en`. National sides by the kit's `countryName` (Intl).
  People keep their names (F1's drivers take the lottery's, as in Play).
- **More in Chinese:** statuses (Final/OT → 終場（延長）…), standings groups
  (`groupZh`), standing lines, positions (`posZh`), injury lists
  (`injuryZh`), series lines (`seriesLineZh`), weather in °C, leaders'
  values, baseball pitches (`pitchZh`: a translator read "Strike" as a
  labour strike), fixed words for rounds, hands and stances (`fixedWord`,
  before `translate()`), metric heights and weights, dates.
- **投注 only where Play has it** (`lib/playable.mjs`): ESPN leagues need
  DraftKings' line on the scoreboard (`priced`) and the game inside Play's
  reach (MLB 8 days, soccer 21, others 7.5); Kambi leagues need the pair in
  Kambi's priced list (read once asked, the page redrawn when it comes).
- **Search:** ESPN files soccer clubs and players without a league id
  (`s:600~t:382`): found by `defaultLeagueSlug` now (Man City was missing).
  A league result opens the league (the search query used to redraw over it).
- **Clubs:** a soccer club is read across all its competitions
  (`soccer/all/teams/<id>/schedule` + `?fixture=true`: its next games showed
  none before) and its squad from its own league (`defaultLeague`: a cup's
  list can be last season's); each game says its competition.
- **Players:** F1 drivers get the championship (place, points, gap), race by
  race results, the next race and their team; tennis players the world
  ranking and this season's matches (`rankings`, `playerMatches`).
- **首頁's date strip has no end:** it grows two weeks at either end as it's
  scrolled, and 📅 opens the date picker for any day.
- **Sheets:** win probability labelled away left / home right (adding up to
  100) with the chart's ends named; batter and pitcher on their own line on
  a phone; form pills under their label; squad grouped by position, long
  names wrap; the main bout first on a fight card; line scores by Chinese
  names.

## Round: notice switches follow the pass; Securities' notices

- **Synced switches (kit):** system notices on/off and every kind's switch
  are the wallet setting `notify` (`{ on, off: ['stock:alert', …] }`,
  newest wins), so every app and device shows the same ones (home-screen
  apps on a phone don't share storage). `notifyPrefs`, `setNotifyOn`,
  `setKind(app, kind, on, s)`, `adoptNotifyPrefs`, `syncPrefs`; the
  device's copy is `quadra.notify.prefs` (the old `quadra.notify` /
  `quadra.notify.kinds` are read once and carried to the pass). A device
  or app the phone hasn't allowed yet gets a one-tap 允許 banner
  (`offerNotices`, once a week at most).
- **Worker (`push.js`):** `POST /push/prefs` keeps the switches
  (`push:prefs:<account>`); each notice keeps its `kind`, and `sendDue`
  drops what's switched off (in any app) or everything when notices are
  off, so a closed app's list obeys at once.
- **Securities:** new kinds `order` (lapsed/dropped orders, skipped plans),
  `margin` (margin call once a day, forced sales), `income` (ex-dividend,
  dividends, coupons, interest); `fill` also covers plan buys. Toasts open
  their tab when tapped; in-app banners (`#portfolio` …) now switch tabs
  (`hashchange`); a pending dividend's pay day is a push while closed.

## Round: fewer, bigger leagues; pro events only; Asia and the national teams

- **Removed:** second divisions and college basketball, and Austria, Switzerland, Denmark, Norway, Sweden,
  Greece, Colombia, Chile, A-League, Chinese Super League, NWSL, NRL, AFL,
  NASCAR, IndyCar (the `aussie` sport and Play's short-lived NASCAR/IndyCar
  board with them).
- **Pro events only** (catalogue `pro`, `kambiKept(key, event)`): Kambi's
  table tennis (WTT, ITTF, title events; not Czech Liga Pro, TT Elite
  Series…), volleyball (national teams, top leagues, big club events) and
  rugby union (internationals, the Champions Cup). Both apps and
  `tools/leagues-audit.mjs` apply it.
- **Added:** AFC Champions League Elite, the Asian Cup and international
  friendlies (ESPN), Liga ACB and the NBL (Kambi, basketball family),
  international rugby union (`rugbyunion`: Kambi's schedule and prices,
  results from ESPN's rugby competitions, `scores` a list of paths).
- **Play:** 場中 only on today's board (the day strip keeps today while
  games are on).
- **Cups were empty:** ESPN's calendar for a cup or the national teams is a
  list of stages and its default page can be a past round (the Europa
  League's showed Sept 17). Play now reads every ESPN league by its months'
  pages (`fetchMonths`, odds included, far fewer requests); Fixtures reads
  such leagues by months (`parseCalendar` → `{ months: true }`,
  `monthsBetween`), and both read soccer's live games from dated pages.
- **Loading screens:** Play waits for the whole board (leagues join one by
  one via `loadExtraLeagues(now, onPart)`, capped at `BOOT_FULL_MS`); last
  season's standings never hold the board (2.5 s). Securities retries its
  first prices behind the loading screen (8 s cap). Worker batches: an item
  not answered in 3 s answers 504 (the app re-asks it alone; its fetch goes
  on into the cache), so one slow upstream can't hold eleven others.
  `tools/preview.mjs` mirrors both (8 s upstream limit, 3 s batch items) and
  DEBUG prints each request's start and duration.
- **More added:** the World Cup, Euro, Copa América and Club World Cup
  (ESPN, month pages: empty between tournaments); K League 1 (Kambi soccer:
  three-way prices, `scoreOnly`, settled by `decidedTeamGame` from the last
  score), CBA and KBL (Kambi); international cricket (`PRO_CRICKET`, results
  from ESPN's `cricket/scorepanel`, `parseCricketPanel`); boxing (Kambi's
  bouts kept only when on a TheSportsDB card, `notable` / `notableFight`,
  results from its write-ups, `boxingResult`, void after 5 days unknown).
  Play's basketball filter group now follows the catalogue.
- **Play's first screen** is the balance and the games on now too: the
  loading screen waits for the account (read, merged with the pass:
  `state.accountIn`) and the live games, from a saved board as well
  (`SNAPSHOT_WAIT_MS`), and up to 2.5 s for the logos in view.
- **Pictures for every sport:** league badges (TheSportsDB) for ACB, NBL,
  CBA, KBL, K League, rugby, cricket and boxing; club badges for ACB, NBL,
  CBA, KBL and K League (`TEAM_BADGES`, looked up one by one: the free key
  lists 10 teams a league); national sides a round flag (`countryCode`;
  England, Scotland, Wales, Northern Ireland their own); tennis players the
  flag in ESPN's draw (`parseFighterFlags` reads draws too; either name
  order); boxers their nation from TheSportsDB's player pages, kept on the
  device (`learnFighterNations`, `rememberNation`) plus `BOXER_NATIONS`.

## Round: the economy, v5 (all repos, pushed to `main`)

The owner asked to balance the economy again, leaving the opening money
(NT$30,000) alone. `node tools/economy.mjs` showed v4 (the shop and free
bets on top of v3) leaving everyone but the high roller richer every month:
a regular bettor +NT$2.7k, a grinder +8.6k, a Rewards-only learner +15.5k,
an idle account doubling in five months.

- **Allowance (Worker, `PAY_TIERS` in eco.js; kit `ECONOMY.payTiers`):**
  6,000 / 3,000 / 1,500 / 500 at < 40k / < 100k / < 250k / above (was
  6,000 / 4,000 / 2,000 / 1,000). The first tier is unchanged, so a new or
  broke account still gets going; past it a regular bettor is now about
  level (−NT$0.3k a month in the model) and settles near NT$40,000.
  Live from the first payday, 2026-10.
- **Rewards' day (kit `ECONOMY`):** NT$330 (words 150, games 120, missions
  60), was 400 (200 / 120 / 80). Games keep 120 so a long round still pays
  in full. Missions pay NT$10-20 (was 15-25) and weekly goals 30-45 (was
  40-60), so about as many fit under the lower cap. Plus still adds NT$50
  to words (the perk line reads the cap); the boost still adds 200.
- **Model after 12 months (v4 → v5):** casual 75k → 65k, regular 46k →
  41k (level), investor 115k → 107k (grows by the market), grinder 111k →
  78k (+3.5k a month), learner 182k → 166k, high roller still broke in a
  month.
- Text: Rewards' help (the allowance and the day's caps), its README money
  table (was stale since v3), Play's practice-account line, the kit's reset
  notice range and Plus perk line.
- Left alone on purpose: the house's cuts (Play and the lottery copy Taiwan
  Sports Lottery / Taiwan Lottery), Securities' costs (a Taiwan broker's),
  Plus's price, the shop's prices, the overdraft rate.
- Seen, not changed: the `plan` mission counts saving a monthly plan in
  Securities, so re-saving one each day earns its NT$50 free bet daily
  (worth ~NT$22 at a free bet's ~45% return).

## Round: the business model (all repos, pushed to `main`)

The owner asked to run Quadra like a profit-minded business, generous where
it pays back, realistic throughout. `node tools/economy.mjs` has a v6
setting and a table of the house's side per user (gaming take, promotions
and their share of it, commission, Plus and shop, house net), member and
not. Real sportsbooks spend 20-30% of their gaming take on promotions;
Quadra stays under 30% for anyone who plays much.

- **Quadra Plus, reworked (NT$390 a month, NT$3,900 a year; was 290 /
  2,900):** Play: a daily +10% winnings boost on one paid slip up to
  NT$1,000 (`lift` on the slip; 10% is under every market's cut, so the
  house stays ahead at any price; paid as `plus-<slip>`, kind
  `plusboost`), a NT$100 free bet each week (the Worker's
  `eco:fb:<Monday>`, `plusBonusEntries`), parlay boost doubled, cash out 2%.
  Securities: commission 2.8折 (was 5折). Rewards: every word pack while a
  member (`packOpen`, `packIncluded`; bought packs stay), +NT$50 words, a
  protection card a month. The Plus card and sheet show what Plus gave
  back this month (`plusReturns`: boosts paid and bonus bets). Price moved
  with the value: a regular bettor gets back about 3× the fee; Plus makes
  money on casual members. Existing monthly members renew at NT$390;
  yearly ones keep what they paid.
- **VIP cashback (free, by activity):** a Taiwan month's gaming stakes in
  Play (bets, lottery, scratch; less refunds) set its tier: 🥉 10k 0.5%,
  🥈 50k 0.8%, 🥇 150k 1.2%, ◆ 500k 1.5%. The Worker pays it on the first
  read after the month (`eco:vip:<month>`, kind `vip`, from 2026-10, so
  the first on 1 November). Every product keeps 14%+; cash out keeps 2-5%
  of a price that already has the cut, so churning can't farm it. Play's
  balance card shows the tier, the cashback so far and the next step.
- **Welcome offers:** the first paid bet in Play brings a NT$200 free bet
  (`eco:fb:welcome`, `welcomeEntries`); Securities' first trade pays no
  commission (`withWelcome` / `firstTrade`). A Worker PATCH now also
  writes what's due (payday entries, fixed ids), so the welcome bet lands
  right after the bet.
- **Rewards:** mission free bets 30 / 20 / 30 (were 50 / 30 / 50: the
  biggest promotion); the plan mission counts only a plan for a symbol
  that never had one (re-saving no longer farms it).
- Kit: `VIP`, `vipStatus`, `vipName`, `WELCOME`, `welcomeDue`,
  `plusReturns`; statement labels `plusboost`, `vip`, `welcome`; free
  bets read the Worker's `eco:fb:` tokens too.
- Model (a month at NT$40,000): a regular non-member leaves the house
  ~NT$7.2k (promos 10% of take) and nets −NT$0.6k; as a member ~NT$6.3k
  (27%) and nets +NT$0.4k. A high roller as a member: promos 10%.
- Not done: a featured-game odds boost for everyone (board-wide price
  changes; Plus's daily boost covers the need), tiered commission by
  volume in Securities.
