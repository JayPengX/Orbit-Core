// Quadra's economy on paper: where the money comes from (faucets), where it
// goes (sinks), for a few kinds of user, month by month for a year.
//
//   node tools/economy.mjs            the current settings and the proposed ones
//
// Faucets: the opening money, the monthly allowance (by wealth when tiered),
// Rewards (effort, capped a day), cash interest, the market. Sinks: Play's
// hold on bets (singles and parlays, boost included), the lottery's and
// scratch cards' hold, Securities' trading costs and margin interest, Quadra
// Plus. The holds are the house's measured ones (see Quadra-Play's
// rules.mjs, odds.mjs, lottery.mjs, scratch.mjs).

const DAYS = 30;
// Play: a two-way line priced at the lottery's 1.158 overround keeps 13.6% of
// a single; a treble keeps about a third even with its 5% boost.
const HOLD = {
  single: 1 - 1 / 1.158,
  treble: 1 - ((1 / 1.158) ** 3 * (1 + (1.85 ** 3 - 1) * 1.05)) / 1.85 ** 3,
  draw: 0.5, // 電腦彩券 pays back about half
  scratch: 0.32 // 刮刮樂 63-75% back
};
const MARKET = 0.07 / 12; // a diversified portfolio, a month
const TRADE_COST = 0.006; // Taiwan round trip: commission both ways and the sell tax

// The allowance by what the account is worth (NT$ net worth: the pool plus
// Securities' holdings less its loans): full to get going, less once there's
// plenty, never nothing. v3/v4 paid 6,000 / 4,000 / 2,000 / 1,000; v5/v6
// 6,000 / 3,000 / 1,500 / 500; v7 (now, eco.js) 8,000 / 4,000 / 1,500 / 500,
// since the allowance is the only money coming in once Rewards stopped paying.
const tiered = tiers => worth => tiers.find(([below]) => worth < below)[1];
const PAY_V3 = tiered([
  [40_000, 6_000],
  [100_000, 4_000],
  [250_000, 2_000],
  [Infinity, 1_000]
]);
const PAY_V5 = tiered([
  [40_000, 6_000],
  [100_000, 3_000],
  [250_000, 1_500],
  [Infinity, 500]
]);
export const PAY_TIERS = [
  [40_000, 8_000],
  [100_000, 4_000],
  [250_000, 1_500],
  [Infinity, 500]
];
export const payFor = tiered(PAY_TIERS);
export const PAY_MONTH = 6_000;

// Quadra Plus (Shared-Proxy/kit/quadra.mjs, eco.js).
export const PLUS_V6 = { fee: 390, boost: 2, lift: 0.1, liftMax: 1_000, bonusBet: 100, commission: 0.28, wordsCap: 50, packShare: 0 };
// v7 (the kit's PLUS now): no word pay to raise, the parlay boost no longer
// doubled, the daily lift on one slip up to NT$500, packs half price, and a
// fee the perks can't outgrow.
export const PLUS_V7 = { fee: 990, boost: 1, lift: 0.1, liftMax: 500, bonusBet: 100, commission: 0.28, wordsCap: 0, packShare: 0.5 };
// v8 (the kit's PLUS now): worth more than it costs to the member, yet
// costing the house less than the fee. NT$490; the daily lift (the costly
// perk, ~NT$600 a month for a regular) goes; the weekly free bet doubles to
// NT$200 (NT$866 a month at face, about 45% of that in expected cost); two
// streak cards a month (NT$600 at the shop's price, nothing to make) and
// Rewards' points ×1.5 cost nothing but a shop sale.
export const PLUS_V8 = { fee: 490, boost: 1, lift: 0, liftMax: 0, bonusBet: 200, commission: 0.28, wordsCap: 0, packShare: 0.5, cards: 2 };
// v11 (the kit's PLUS now): word packs no longer half price, and the
// points catalogue at 90% of the points for members; Securities adds +0.1%
// on new deposits and a 20% lending cut (small next to the fee).
export const PLUS_V11 = { ...PLUS_V8, packShare: 1, catalog: 0.9 };
export const SETTINGS = {
  now: { name: 'Now', start: 110_000, pay: () => 7_000, effortRate: 18, effortCap: 600 + 400 + 300, plus: 290 },
  // What the Worker changes on its own (Rewards still earns as it does).
  worker: { name: 'v3, Worker only (before Rewards took the new caps)', start: 30_000, pay: PAY_V3, effortRate: 18, effortCap: 600 + 400 + 300, plus: 290 },
  v3: { name: 'v3, all of it', start: 30_000, pay: PAY_V3, effortRate: 12, effortCap: 200 + 120 + 80, plus: 290 },
  // Rewards' shop (a word boost: NT$150 for 30 minutes of ×2 word pay and a
  // cap NT$200 higher that day; protection cards and word packs) and the
  // missions' free bets (a free bet returns its winnings only: about 45% of
  // its face on a treble, FREEBET_RETURN).
  v4: { name: 'v4: v3 with the Rewards shop and free bets', start: 30_000, pay: PAY_V3, effortRate: 12, effortCap: 200 + 120 + 80, plus: 290, shop: true },
  // v4 left everyone but the high roller richer every month (a regular
  // bettor +NT$2.7k, a grinder +8.6k): the allowance above the first tier
  // halves (a regular player now levels out near NT$40,000, where the full
  // allowance stops) and Rewards' day comes down to NT$330 (words 150,
  // games 120, missions 60), so a grinder earns a little, not a salary.
  v5: { name: 'v5: allowance 6,000/3,000/1,500/500, Rewards NT$330 a day', start: 30_000, pay: PAY_V5, effortRate: 12, effortCap: 150 + 120 + 60, plus: 290, shop: true },
  // v5 and the business round: Plus reworked (a daily +10% winnings boost,
  // a NT$100 free bet a week, 2.8折 commission, every word pack), VIP
  // cashback on gaming stakes; monthOf has the details.
  v6: { name: 'v6: v5 with Plus reworked and VIP cashback', start: 30_000, pay: PAY_V5, effortRate: 12, effortCap: 150 + 120 + 60, plus: 290, shop: true, vip: true, v6: true },
  // v7: Rewards pays no money (points only) and its missions give no free
  // bets; money comes only from the opening money and the allowance, which
  // rises to keep a regular player level without the effort pay. Plus as
  // PLUS_V7.
  v7: { name: 'v7: no Rewards pay, allowance 8,000/4,000/1,500/500, Plus NT$990', start: 30_000, pay: payFor, effortRate: 0, effortCap: 0, plus: 990, shop: true, vip: true, v6: true, noRewardsPay: true, plusCfg: PLUS_V7 },
  v8: { name: 'v8: v7 with Plus at NT$490 (NT$200 weekly free bet, no daily lift)', start: 30_000, pay: payFor, effortRate: 0, effortCap: 0, plus: 490, shop: true, vip: true, v6: true, noRewardsPay: true, plusCfg: PLUS_V8 },
  // v10: a fixed NT$6,000 a month, like a salary (the tiers paid saving less
  // and losing more). 4,000 or 5,000 broke a regular bettor within a year;
  // at 6,000 a regular drifts down slowly and a saver or investor grows.
  v10: { name: 'v10: fixed pay NT$6,000 a month', start: 30_000, pay: () => 6_000, effortRate: 0, effortCap: 0, plus: 490, shop: true, vip: true, v6: true, noRewardsPay: true, plusCfg: PLUS_V8 },
  // v11: the points catalogue (the kit's CATALOG). What people turn points
  // into (PEOPLE's cat*) is a promotion: free bets at FREEBET_RETURN of
  // face, commission vouchers at face (each brings a trade), a deposit
  // bonus at what it pays, and a member's Plus month from points at the fee
  // forgone (a non-member's costs only its perks, and is how Plus sells).
  v11: { name: 'Now (v11): v10 with the points catalogue, packs at one price', start: 30_000, pay: () => 6_000, effortRate: 0, effortCap: 0, plus: 490, shop: true, vip: true, v6: true, noRewardsPay: true, plusCfg: PLUS_V11, catalog: true }
};
const BOOST = { price: 150, cap: 200 };
const FREEBET_RETURN = 0.45;

// ---- v6: the business (Quadra Plus reworked, VIP cashback) ----------------------
//
// The house's side of it: what each product keeps (the gaming take: Play's
// hold, the lottery's and scratch cards'), what it gives back to bring play
// in (promotions: Rewards' free bets, Plus's perks, VIP cashback), and what
// it earns besides (Plus's fee, Securities' commission, Rewards' shop). A
// real sportsbook spends 20-30% of its gaming take on promotions; Quadra's
// should stay under that and never turn a product into a loss.
const CUT = 1.158;
const ODDS = 1.85;
const trebleHold = boost => 1 - ((1 / CUT) ** 3 * (1 + (ODDS ** 3 - 1) * (1 + boost))) / ODDS ** 3;
const singleHold = lift => 1 - (1 + (ODDS - 1) * (1 + lift)) / (ODDS * CUT);
// The kit's VIP (Shared-Proxy/kit/quadra.mjs, eco.js).
export const VIP_TIERS = [
  [500_000, 0.015],
  [150_000, 0.012],
  [50_000, 0.008],
  [10_000, 0.005]
];
const vipBack = stakes => (VIP_TIERS.find(([min]) => stakes >= min)?.[1] ?? 0) * stakes;
const COMMISSION = 0.001425 * 2; // of turnover (a buy and a sell); the rest of TRADE_COST is the sell tax

// One month for person `p` worth `worth`, a Plus member or not: every flow,
// from the house's side and the person's.
export function monthOf(settings, p, worth, member = false) {
  const bets = p.slips * p.stake * DAYS;
  const tickets = (p.draw + p.scratch) * DAYS;
  const gaming = bets * ((1 - p.trebles) * HOLD.single + p.trebles * trebleHold(0.05)) + p.draw * DAYS * HOLD.draw + p.scratch * DAYS * HOLD.scratch;
  // Promotions.
  const P = settings.plusCfg || PLUS_V6;
  const freebets = settings.shop && !settings.noRewardsPay ? (p.freebetsV6 ?? p.freebets ?? 0) * DAYS * FREEBET_RETURN : 0;
  const boost = member ? 0.05 * P.boost : 0.05;
  const boostDouble = member ? bets * p.trebles * (trebleHold(0.05) - trebleHold(boost)) : 0;
  const liftStake = member && p.slips > 0 && p.stake <= P.liftMax ? Math.min(1, p.slips) * DAYS * p.stake : 0;
  const lift = liftStake * ((1 - p.trebles) * (singleHold(0) - singleHold(P.lift)) + p.trebles * (trebleHold(boost) - trebleHold(boost + P.lift)));
  const bonus = member && p.slips > 0 ? ((P.bonusBet * 52) / 12) * FREEBET_RETURN : 0;
  const vip = settings.vip ? vipBack(bets + tickets) : 0;
  // Other revenue.
  const commission = p.turnover * COMMISSION * (member ? P.commission : 1);
  // A voucher takes off at most the commission there is (the rest is lost).
  const catalog = settings.catalog ? (p.catBets || 0) * FREEBET_RETURN + Math.min(p.catVouchers || 0, commission) + (p.catTd || 0) + (member ? (P.fee * (p.catPlus || 0)) / 12 : 0) : 0;
  const promo = freebets + boostDouble + lift + bonus + vip + catalog;
  const tax = p.turnover * (TRADE_COST - COMMISSION);
  const plusFee = member ? P.fee : 0;
  // With no Rewards pay, a word boost buys points, not money: nobody is
  // modelled buying one.
  const boosted = settings.shop && !settings.noRewardsPay ? p.boostDays || 0 : 0;
  const packs = (p.packMonth || 0) * (member ? P.packShare : 1);
  // A member's free streak cards replace the ones bought (shopMonth).
  const bought = member && P.cards ? 0 : p.shopMonth || 0;
  const shop = settings.shop ? boosted * BOOST.price + bought + packs : 0;
  // The person's income.
  const pay = settings.pay(worth);
  const wordsExtra = member ? P.wordsCap : 0;
  const perDay = cap => Math.min(cap, p.effort * settings.effortRate);
  const effort = perDay(settings.effortCap + wordsExtra) * (DAYS - boosted) + perDay(settings.effortCap + wordsExtra + BOOST.cap) * boosted;
  const market = Math.max(0, worth * p.invested) * MARKET;
  const house = gaming - promo + commission + plusFee + shop;
  const flow = pay + effort + market - tax - house;
  return { gaming, freebets, boostDouble, lift, bonus, vip, catalog, promo, commission, tax, plusFee, shop, pay, effort, market, house, flow };
}

// Per day unless said: bets (slips a day, stake, share that are trebles),
// lottery and scratch (NT$ a day), Rewards minutes a day (about NT$18 a
// minute before the cap), share of wealth invested, turnover a month;
// Rewards' shop: boosted days a month, other shop spending a month (cards,
// packs), free bets claimed a day (NT$ face value).
export const PEOPLE = [
  { key: 'casual', zh: '偶爾玩', slips: 2 / 7, stake: 300, trebles: 0, draw: 100 / 7, scratch: 0, effort: 0, invested: 0, turnover: 0 },
  { key: 'regular', zh: '常玩', slips: 2, stake: 500, trebles: 0.5, draw: 50, scratch: 200 / 7, effort: 10, invested: 0.2, turnover: 10_000, freebets: 80, freebetsV6: 50, catBets: 500, catVouchers: 100 },
  { key: 'roller', zh: '大戶', slips: 4, stake: 2_000, trebles: 0.5, draw: 500, scratch: 1_000 / 7, effort: 0, invested: 0, turnover: 0, plus: true },
  { key: 'investor', zh: '投資派', slips: 1, stake: 500, trebles: 0, draw: 0, scratch: 0, effort: 15, invested: 0.7, turnover: 50_000, plus: true, catVouchers: 300, catTd: 40, catPlus: 4 },
  { key: 'grinder', zh: '認真賺', slips: 3, stake: 500, trebles: 0.5, draw: 50, scratch: 0, effort: 60, invested: 0, turnover: 0, boostDays: 20, shopMonth: 300, freebets: 80, freebetsV6: 50, catBets: 1_000, catPlus: 4 },
  // Rewards only: words and games most days, a boost now and then, a protection card and a pack over the year.
  { key: 'learner', zh: '只背單字', slips: 0, stake: 0, trebles: 0, draw: 0, scratch: 0, effort: 30, invested: 0, turnover: 0, boostDays: 6, shopMonth: 300, packMonth: 990 / 12, catPlus: 4 }
];

export function simulate(settings, p, months = 12) {
  if (settings.v6) return simulateV6(settings, p, months);
  let worth = settings.start;
  const rows = [];
  for (let m = 0; m < months && worth > 0; m++) {
    const pay = settings.pay(worth);
    const boosted = settings.shop ? p.boostDays || 0 : 0;
    const perDay = cap => Math.min(cap, p.effort * settings.effortRate);
    const effort = perDay(settings.effortCap) * (DAYS - boosted) + perDay(settings.effortCap + BOOST.cap) * boosted;
    const shop = settings.shop ? boosted * BOOST.price + (p.shopMonth || 0) : 0;
    const freebet = settings.shop ? (p.freebets || 0) * DAYS * FREEBET_RETURN : 0;
    const bets = p.slips * p.stake * DAYS;
    const betHold = bets * ((1 - p.trebles) * HOLD.single + p.trebles * HOLD.treble);
    const lotto = p.draw * DAYS * HOLD.draw + p.scratch * DAYS * HOLD.scratch;
    const invested = Math.max(0, worth * p.invested);
    const market = invested * MARKET - p.turnover * TRADE_COST;
    const plus = p.plus ? settings.plus : 0;
    const flow = pay + effort + market + freebet - betHold - lotto - plus - shop;
    worth += flow;
    rows.push({ month: m + 1, pay, effort, market, take: betHold + lotto + plus + shop - freebet, flow, worth });
  }
  return rows;
}

function simulateV6(settings, p, months) {
  let worth = settings.start;
  const rows = [];
  for (let m = 0; m < months && worth > 0; m++) {
    const x = monthOf(settings, p, worth, Boolean(p.plus));
    worth += x.flow;
    rows.push({ month: m + 1, pay: x.pay, effort: x.effort, market: x.market, take: x.house, flow: x.flow, worth });
  }
  return rows;
}

const money = x => `${x < 0 ? '−' : ''}NT$${Math.round(Math.abs(x)).toLocaleString('en-US')}`;
if (import.meta.url === `file://${process.argv[1]}`) {
  for (const s of Object.values(SETTINGS)) {
    console.log(`\n== ${s.name}: open ${money(s.start)}, effort cap ${money(s.effortCap)} a day`);
    console.log(`who        income/mo   house take/mo   net/mo   net in mo 12   after 12 mo   months of pay held (${money(PAY_MONTH)})`);
    for (const p of PEOPLE) {
      const rows = simulate(s, p);
      const first = rows[0];
      const last = rows.at(-1);
      const income = first.pay + first.effort + Math.max(0, first.market);
      const broke = rows.length < 12 || last.worth <= 0 ? ` (broke in month ${rows.findIndex(r => r.worth <= 0) + 1 || rows.length})` : '';
      console.log(`${p.zh.padEnd(6, '　')}  ${money(income).padStart(10)}  ${money(first.take).padStart(14)}  ${money(first.flow).padStart(10)}  ${money(last.flow).padStart(12)}  ${money(Math.max(0, last.worth)).padStart(12)}   ${(Math.max(0, last.worth) / PAY_MONTH).toFixed(1).padStart(5)}${broke}`);
    }
  }
  // The business, a month at NT$40,000: what the house keeps from each kind
  // of user, what it gives back, as a member of Plus and not.
  const s6 = SETTINGS.v11;
  console.log(`\n== The house, a month per user at ${money(40_000)} (v11)`);
  console.log('who          Plus   gaming take   promos (of take)   commission   Plus+shop   house net   user net');
  for (const p of PEOPLE) {
    for (const member of [false, true]) {
      const x = monthOf(s6, p, 40_000, member);
      const share = x.gaming > 0 ? `${Math.round((x.promo / x.gaming) * 100)}%` : '–';
      console.log(`${p.zh.padEnd(6, '　')}  ${member ? ' yes' : '  no'}  ${money(x.gaming).padStart(12)}  ${money(x.promo).padStart(9)} ${`(${share})`.padStart(6)}  ${money(x.commission).padStart(11)}  ${money(x.plusFee + x.shop).padStart(10)}  ${money(x.house).padStart(10)}  ${money(x.flow).padStart(9)}`);
    }
  }
}
