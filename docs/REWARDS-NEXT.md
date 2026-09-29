# Quadra Rewards: the next round (brief for the agent picking it up)

**Status: done** (see the last round in `HANDOFF.md`). Game challenges with a
stake were built and then removed: betting stays in Play.

Rewards was out of reach in the session that rebalanced the economy and made
the rest of Quadra profit-first (see `HANDOFF.md`, the rounds from "profit
the smart way" on). This is what Rewards needs, in order. The owner's
direction: **Rewards turns profit-oriented too**, premium and useful, never
cheap-looking, and nothing in it talks people out of spending.

## 0. Before anything

- Check out Quadra-Rewards beside Shared-Proxy and run `node kit/sync.mjs`,
  then commit Rewards. Its kit copy is two rounds behind: no Quadra Plus
  card or sheet (monthly and yearly), no allowance text by worth, no new
  `ECONOMY` caps.
- Read `node tools/economy.mjs` (Shared-Proxy). Rewards is the biggest
  faucet left: a daily grinder mints about NT$25,000 a month today against
  a regular bettor's NT$8,000 of house take, so money stops mattering.
- `npm test` in Rewards before every push; push to `main` (standing rule).

## 1. Close the faucet (must)

- Take the kit's `ECONOMY` caps: NT$400 a day at most (word practice 200,
  games 120, missions 80), about NT$12 a minute (`vocab.perCorrect` 2,
  `perMastered` 15, `gamesPerMinute` 10). Find every place Rewards has its
  own copies of these numbers (daily challenge NT$10-40, weekly goals,
  badges, streak pay) and bring them under the same daily cap.
- Show the cap as progress ("今日可賺 NT$400 · 已賺 NT$260"), not as a limit
  reached. When it's reached, point to what money is for: Play's featured
  games, the lottery, Securities.
- Don't touch existing balances or entries (fixed ids, first write wins).

## 2. Turn Rewards into a revenue app (the owner's ask)

Each of these takes money back into the house with something people want.

1. **Streak protection** (the Duolingo lever): a 連續紀錄保護卡 (streak
   freeze) at about NT$300, bought ahead; used automatically on a missed
   day. Quadra Plus members get one a month free (add it to the kit's
   `plusPerks` list so every app's Plus sheet shows it).
2. **Paid challenges on the arcade** (35 games in `lib/arcade.mjs`): an
   entry fee (NT$50 / 200 / 500), beat a target score to win a fixed
   multiple (about 1.8×), priced so the house keeps 10-15% at the measured
   pass rate. Measure each game's pass rate first; skill games need the
   target tuned per game. Free play stays, but pays only inside the cap.
3. **Double-earning boosts**: 30 minutes of ×2 word-practice pay for NT$150,
   still under a (higher) boosted daily cap: effort feels rewarded, the
   house sells the time.
4. **Premium word packs**: TOEIC / IELTS / business packs as one-time
   purchases (NT$990-1,990) with recorded audio (`tools/word-audio.py`).
   Plus members get one pack free or half price.
5. **Missions that lead to spending**, paid in **Play free-bet credit**
   rather than cash where possible ("串 3 場下注", "買一張刮刮樂", "定期定額設定
   一檔"): the credit only stakes a bet, and only winnings (not the stake)
   come back, so the house's cost is well under face value. This needs a
   free-bet token in Play (a slip bought with a token: no stake entry,
   payout less the stake) and in the Worker (tokens as `eco:` entries of
   amount 0 with a value, spent by Play): build that with Play.
6. **A premium "Rewards Pass" tier inside Quadra Plus**, not a second
   subscription: Plus perks listed for Rewards (streak freeze, a word pack,
   a higher daily cap) so Plus sells in every app.

## 3. Remove what discourages spending

The help centre lives in Rewards and still explains the house's cut, "Play
is where it shrinks", lottery payback rates, "the lottery keeps about 22%",
luck vs the cut and the like. Rewrite it as a product guide: how to play,
parlay boost, cash out, Quadra Plus, the allowance by worth; no expected
losses, no per-100 returns, no warnings that betting loses. Same for any
Rewards screen that frames Play or the lottery as a loss (and "free money"
language: it's pay for effort now).

## 4. Packaging

- Same design language as the other apps now: calm cards, one accent, the
  black-and-gold Quadra Plus card (the kit's `plusCard`), no emoji banners,
  no dashed nag boxes, nothing that overflows at 360px (check with
  `node tools/preview.mjs rewards … --width 360`, light and dark).
- Rewards' home: today's earnings against the cap, the streak (and its
  protection), the paid challenges, then one quiet line into Play's
  精選串關 and Securities.

## Guardrails

- The Worker (`eco.js`) is the only mint for its own `eco:` ids; any new
  money kind that must be trusted (tokens, bought items) goes through a
  Worker op, like `op: 'plus'`, with tests in `tests/eco.test.mjs`.
- Re-run `tools/economy.mjs` after changing any number, and add a persona
  for Rewards-only users if paid challenges or boosts change their flow.
