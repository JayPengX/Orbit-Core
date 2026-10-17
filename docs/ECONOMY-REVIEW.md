# Quadra Pass economy review (2026-10-18)

The owner's account: about NT$36,000, all of it in stocks that are falling,
and nothing to do on a weekday but wait. Here is why the economy feels stuck
for them, using `node tools/economy.mjs` (v11, now).

## What the model says

| who | income/mo | house take/mo | after 12 months |
| --- | --- | --- | --- |
| 偶爾玩 | NT$6,000 | NT$565 | NT$95,218 |
| 常玩 | NT$6,035 | NT$7,618 | NT$10,505 |
| 投資派 | NT$6,123 | NT$1,868 | NT$80,280 |
| 只背單字 | NT$6,000 | NT$383 | NT$97,410 |

1. **The salary is the only income.** It is NT$6,000 on the 1st of each
   month. Rewards stopped paying in v7, so effort earns nothing.
2. **The market can't move a small account.** At 7% a year, NT$36,000 earns
   about NT$210 a month. A 10% drop costs NT$3,600, which is two-thirds of a
   month's pay and feels like going backwards. The 投資派 ends the year with
   *less* than someone who only studies Words (NT$80k vs NT$97k).
3. **Nothing pays for skill or attention.** Play is negative-EV by design
   (13–50% hold). Securities is close to break-even after costs, and slow.
   A weekday has no decision in it that can win.
4. **The scale is small for its own market.** NT$30,000 opening money buys
   25 shares of 2330. Most of Taiwan's market is odd lots at this size.

## What to change, in order

1. **新股申購（抽籤）in Securities.** This is Taiwan's real weekday ritual.
   - **How it works:** an IPO or SPO priced below its market price, a NT$20
     fee, about a 1–5% chance to win one lot, and the gain is the discount.
   - **Why it fits:** it's slightly positive-EV, as in reality, but bounded
     by the draw odds and one entry per person per issue. It gives a reason
     to open the app every weekday.
   - **Who pays:** the house, sized from the real premium. The model should
     keep it under the 30% promo share for an active trader.
2. **Earnings and dividend calendar plus 除權息.** This means real cash
   dividends paid on held shares, which the model has as "the market". It
   should be shown as its own income line, so holding pays visibly while
   prices sink.
3. **A small weekday "work" faucet tied to real use.**
   - **What it pays for:** Words reviews done right, a full Sports pick
     card, Class check-ins.
   - **Size:** NT$100–150 a weekday, Worker-dated, capped per day. That's
     about NT$2,000–3,000 a month, under v6's NT$330 a day, which the model
     showed was too generous.
   - **Why:** it gives the low-balance owner a path that doesn't depend on
     the market.
4. **Weekly prediction contest (Sports and Play).** Pick the week's
   games. It's free to enter, and a house-funded prize pool goes to the top
   scores (budgeted under the 30% promo cap). Skill matters, and it fills
   weekday nights (MLB, NBA, EPL midweek).
5. **Crypto and US hours are already there.** Securities trades crypto
   around the clock and US stocks at night. Surfacing that on the home
   screen ("now open: US, crypto") fixes part of the "nothing to do" feeling
   at no cost to the economy.

Each change runs through `tools/economy.mjs` first. Its numbers go in the
commit, and every new faucet gets a test that tries to exploit it (§13).

## Done (2026-10-18)

- **新股申購 is live in Securities.**
  - It uses TWSE's real list, and the Worker draws at TWSE's published rate.
  - Every event is checked on TWSE's own figures (kit/stock-ipo.mjs,
    stock-fill.js, stock-check.js).
  - At ~0.2–10% win rates, an active applicant wins a few times a year.
    Each win is the offer's discount (a listed company's offer this week
    was worth NT$128,500 at that day's price).
- **Securities' home shows what's trading now** (US, crypto, Japan, Hong
  Kong, Taiwan, each until when).
- **Dividends were already shown** in the portfolio's income card.
- **Weekday effort pay: left out.** It runs against the owner's calls of
  2026-09-29 (no nags or fake promotions) and 2026-10-01 (a fixed NT$6,000
  pay). 新股申購 gives the weekday a real decision with a positive expected
  value instead.
- **Weekly prediction contest: not built.** It needs players to compete
  against. One active account would only play the house.
