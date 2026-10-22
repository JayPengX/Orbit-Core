// Quadra's economy on paper: where the money comes from (faucets), where it
// goes (sinks), for a few kinds of user, month by month for a year.
//
//   node tools/economy.mjs            the current settings (v12)
//
// Faucets: the opening money, the weekly pay, the market. Sinks: Play's hold
// on bets (singles and parlays), the lottery's and scratch cards' hold,
// Securities' trading costs. The holds are the house's
// measured ones (see the kit's play-odds.mjs, play-lottery.mjs,
// play-scratch.mjs).

import { CARD_ORDER, expectedReturn } from '../kit/play-scratch.mjs';

const DAYS = 30;
// Play: a two-way line priced at the lottery's 1.158 overround keeps 13.6% of
// a single; a treble keeps about a third even with its 5% boost.
const HOLD = {
  single: 1 - 1 / 1.158,
  draw: 0.5, // 電腦彩券 pays back about half
  // 刮刮樂: the cards on sale (the kit's real tables) pay back 60-75%, a card
  // bought as likely as any other.
  scratch: 1 - CARD_ORDER.reduce((s, id) => s + expectedReturn(id), 0) / CARD_ORDER.length
};
const MARKET = 0.07 / 12; // a diversified portfolio, a month
const TRADE_COST = 0.006; // Taiwan round trip: commission both ways and the sell tax
export const PAY_MONTH = 6_000;

// The perks and fee of the member tier the model still prices (a person with
// `plus: true`): the weekly free bet, the commission cut, free streak cards.
const PLUS = { fee: 490, bonusBet: 200, commission: 0.28, packShare: 1, cards: 2 };
export const SETTINGS = {
  // v12 (2026-10-19): NT$200,000 to open and NT$10,000 every Monday (about
  // NT$43,300 a month, a Taiwan salary). More is borrowed, never given: a
  // 信貸 repaid from the pay (kit/loan.mjs), its interest and fees a sink;
  // relief only for someone with nothing.
  now: { name: 'Now (v12): NT$200,000 start, NT$10,000 a week', start: 200_000, pay: () => Math.round((10_000 * 52) / 12) }
};
const FREEBET_RETURN = 0.45; // a free bet returns its winnings only: about 45% of its face on a treble

// ---- The business ----------------------------------------------------------------
//
// The house's side of it: what each product keeps (the gaming take: Play's
// hold, the lottery's and scratch cards'), what it gives back to bring play
// in (promotions: free bets, the points catalogue), and what it
// earns besides (Securities' commission). A real sportsbook spends 20-30% of
// its gaming take on promotions; Quadra's should stay under that and never
// turn a product into a loss.
const CUT = 1.158;
const ODDS = 1.85;
const trebleHold = boost => 1 - ((1 / CUT) ** 3 * (1 + (ODDS ** 3 - 1) * (1 + boost))) / ODDS ** 3;
const COMMISSION = 0.001425 * 2; // of turnover (a buy and a sell); the rest of TRADE_COST is the sell tax

// One month for person `p` worth `worth`, a member or not: every flow, from
// the house's side and the person's.
export function monthOf(settings, p, worth, member = false) {
  const bets = p.slips * p.stake * DAYS;
  const gaming = bets * ((1 - p.trebles) * HOLD.single + p.trebles * trebleHold(0.05)) + p.draw * DAYS * HOLD.draw + p.scratch * DAYS * HOLD.scratch;
  // Promotions.
  const bonus = member && p.slips > 0 ? ((PLUS.bonusBet * 52) / 12) * FREEBET_RETURN : 0;
  // Other revenue.
  const commission = p.turnover * COMMISSION * (member ? PLUS.commission : 1);
  // The points catalogue: free bets, a voucher that takes off at most the commission there is (the rest is lost), deposit bonuses, a member's month.
  const catalog = (p.catBets || 0) * FREEBET_RETURN + Math.min(p.catVouchers || 0, commission) + (p.catTd || 0) + (member ? (PLUS.fee * (p.catPlus || 0)) / 12 : 0);
  const promo = bonus + catalog;
  const tax = p.turnover * (TRADE_COST - COMMISSION);
  const plusFee = member ? PLUS.fee : 0;
  const packs = (p.packMonth || 0) * (member ? PLUS.packShare : 1);
  // A member's free streak cards replace the ones bought (shopMonth).
  const bought = member && PLUS.cards ? 0 : p.shopMonth || 0;
  const shop = bought + packs;
  // The person's income.
  const pay = settings.pay(worth);
  const market = Math.max(0, worth * p.invested) * MARKET;
  const house = gaming - promo + commission + plusFee + shop;
  const flow = pay + market - tax - house;
  return { gaming, bonus, catalog, promo, commission, tax, plusFee, shop, pay, market, house, flow };
}

// Per day unless said: bets (slips a day, stake, share that are trebles),
// lottery and scratch (NT$ a day), share of wealth invested, turnover a
// month; the points catalogue's and shop's spending a month.
export const PEOPLE = [
  { key: 'casual', zh: '偶爾玩', slips: 2 / 7, stake: 300, trebles: 0, draw: 100 / 7, scratch: 0, invested: 0, turnover: 0 },
  { key: 'regular', zh: '常玩', slips: 2, stake: 500, trebles: 0.5, draw: 50, scratch: 200 / 7, invested: 0.2, turnover: 10_000, catBets: 500, catVouchers: 100 },
  { key: 'roller', zh: '大戶', slips: 4, stake: 2_000, trebles: 0.5, draw: 500, scratch: 1_000 / 7, invested: 0, turnover: 0, plus: true },
  { key: 'investor', zh: '投資派', slips: 1, stake: 500, trebles: 0, draw: 0, scratch: 0, invested: 0.7, turnover: 50_000, plus: true, catVouchers: 300, catTd: 40, catPlus: 4 },
  { key: 'grinder', zh: '認真賺', slips: 3, stake: 500, trebles: 0.5, draw: 50, scratch: 0, invested: 0, turnover: 0, shopMonth: 300, catBets: 1_000, catPlus: 4 },
  { key: 'learner', zh: '只背單字', slips: 0, stake: 0, trebles: 0, draw: 0, scratch: 0, invested: 0, turnover: 0, shopMonth: 300, packMonth: 990 / 12, catPlus: 4 }
];

export function simulate(settings, p, months = 12) {
  let worth = settings.start;
  const rows = [];
  for (let m = 0; m < months && worth > 0; m++) {
    const x = monthOf(settings, p, worth, Boolean(p.plus));
    worth += x.flow;
    rows.push({ month: m + 1, pay: x.pay, market: x.market, take: x.house, flow: x.flow, worth });
  }
  return rows;
}

const money = x => `${x < 0 ? '−' : ''}NT$${Math.round(Math.abs(x)).toLocaleString('en-US')}`;
if (import.meta.url === `file://${process.argv[1]}`) {
  const s = SETTINGS.now;
  console.log(`\n== ${s.name}: open ${money(s.start)}`);
  console.log(`who        income/mo   house take/mo   net/mo   net in mo 12   after 12 mo   months of pay held (${money(PAY_MONTH)})`);
  for (const p of PEOPLE) {
    const rows = simulate(s, p);
    const first = rows[0];
    const last = rows.at(-1);
    const income = first.pay + Math.max(0, first.market);
    const broke = rows.length < 12 || last.worth <= 0 ? ` (broke in month ${rows.findIndex(r => r.worth <= 0) + 1 || rows.length})` : '';
    console.log(`${p.zh.padEnd(6, '　')}  ${money(income).padStart(10)}  ${money(first.take).padStart(14)}  ${money(first.flow).padStart(10)}  ${money(last.flow).padStart(12)}  ${money(Math.max(0, last.worth)).padStart(12)}   ${(Math.max(0, last.worth) / PAY_MONTH).toFixed(1).padStart(5)}${broke}`);
  }
  // The business, a month at NT$40,000: what the house keeps from each kind
  // of user, what it gives back, as a member and not.
  console.log(`\n== The house, a month per user at ${money(40_000)}`);
  console.log('who          Plus   gaming take   promos (of take)   commission   Plus+shop   house net   user net');
  for (const p of PEOPLE) {
    for (const member of [false, true]) {
      const x = monthOf(s, p, 40_000, member);
      const share = x.gaming > 0 ? `${Math.round((x.promo / x.gaming) * 100)}%` : '–';
      console.log(`${p.zh.padEnd(6, '　')}  ${member ? ' yes' : '  no'}  ${money(x.gaming).padStart(12)}  ${money(x.promo).padStart(9)} ${`(${share})`.padStart(6)}  ${money(x.commission).padStart(11)}  ${money(x.plusFee + x.shop).padStart(10)}  ${money(x.house).padStart(10)}  ${money(x.flow).padStart(9)}`);
    }
  }
}
