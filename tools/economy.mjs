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
// plenty, never nothing.
export const PAY_TIERS = [
  [40_000, 6_000],
  [100_000, 4_000],
  [250_000, 2_000],
  [Infinity, 1_000]
];
export const payFor = worth => PAY_TIERS.find(([below]) => worth < below)[1];

export const SETTINGS = {
  now: { name: 'Now', start: 110_000, pay: () => 7_000, effortRate: 18, effortCap: 600 + 400 + 300, plus: 290 },
  // What the Worker changes on its own (Rewards still earns as it does).
  worker: { name: 'Proposed, Worker only (until Rewards takes the new caps)', start: 30_000, pay: payFor, effortRate: 18, effortCap: 600 + 400 + 300, plus: 290 },
  v3: { name: 'Proposed, all of it', start: 30_000, pay: payFor, effortRate: 12, effortCap: 200 + 120 + 80, plus: 290 }
};

// Per day unless said: bets (slips a day, stake, share that are trebles),
// lottery and scratch (NT$ a day), Rewards minutes a day (about NT$18 a
// minute before the cap), share of wealth invested, turnover a month.
export const PEOPLE = [
  { key: 'casual', zh: '偶爾玩', slips: 2 / 7, stake: 300, trebles: 0, draw: 100 / 7, scratch: 0, effort: 0, invested: 0, turnover: 0 },
  { key: 'regular', zh: '常玩', slips: 2, stake: 500, trebles: 0.5, draw: 50, scratch: 200 / 7, effort: 10, invested: 0.2, turnover: 10_000 },
  { key: 'roller', zh: '大戶', slips: 4, stake: 2_000, trebles: 0.5, draw: 500, scratch: 1_000 / 7, effort: 0, invested: 0, turnover: 0, plus: true },
  { key: 'investor', zh: '投資派', slips: 1, stake: 500, trebles: 0, draw: 0, scratch: 0, effort: 15, invested: 0.7, turnover: 50_000, plus: true },
  { key: 'grinder', zh: '認真賺', slips: 3, stake: 500, trebles: 0.5, draw: 50, scratch: 0, effort: 60, invested: 0, turnover: 0 }
];

export function simulate(settings, p, months = 12) {
  let worth = settings.start;
  const rows = [];
  for (let m = 0; m < months && worth > 0; m++) {
    const pay = settings.pay(worth);
    const effort = Math.min(settings.effortCap, p.effort * settings.effortRate) * DAYS;
    const bets = p.slips * p.stake * DAYS;
    const betHold = bets * ((1 - p.trebles) * HOLD.single + p.trebles * HOLD.treble);
    const lotto = p.draw * DAYS * HOLD.draw + p.scratch * DAYS * HOLD.scratch;
    const invested = Math.max(0, worth * p.invested);
    const market = invested * MARKET - p.turnover * TRADE_COST;
    const plus = p.plus ? settings.plus : 0;
    const flow = pay + effort + market - betHold - lotto - plus;
    worth += flow;
    rows.push({ month: m + 1, pay, effort, market, take: betHold + lotto + plus, flow, worth });
  }
  return rows;
}

const money = x => `${x < 0 ? '−' : ''}NT$${Math.round(Math.abs(x)).toLocaleString('en-US')}`;
if (import.meta.url === `file://${process.argv[1]}`) {
  for (const s of Object.values(SETTINGS)) {
    console.log(`\n== ${s.name}: open ${money(s.start)}, effort cap ${money(s.effortCap)} a day`);
    console.log('who        income/mo   house take/mo   net/mo      after 12 mo   months of pay held (NT$7,000)');
    for (const p of PEOPLE) {
      const rows = simulate(s, p);
      const first = rows[0];
      const last = rows.at(-1);
      const income = first.pay + first.effort + Math.max(0, first.market);
      const broke = rows.length < 12 || last.worth <= 0 ? ` (broke in month ${rows.findIndex(r => r.worth <= 0) + 1 || rows.length})` : '';
      console.log(`${p.zh.padEnd(6, '　')}  ${money(income).padStart(10)}  ${money(first.take).padStart(14)}  ${money(first.flow).padStart(10)}  ${money(Math.max(0, last.worth)).padStart(12)}   ${(Math.max(0, last.worth) / 7_000).toFixed(1).padStart(5)}${broke}`);
    }
  }
}
