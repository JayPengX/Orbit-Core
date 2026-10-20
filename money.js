// Quadra's money as a whole, for the admin page: the same four sides the
// Pass's 真相 shows one account (kit/quadra.mjs moneySides), added up over
// every account, plus what deleted accounts took with them.
//
//   given   what the system paid in: opening money, monthly pay, wealth-rank
//           rewards, and the rest (VIP cashback, admin grants, rebases)
//   quadra  what Quadra earned, signed: Play's settled bets from the house's
//           side (stakes kept less payouts), old Plus fees (less the refund) and overdraft interest
//   gov     the government, from the player's side: 急難紓困 in, less every
//           tax out (Play's `snap.odds.gov`: sports and lottery prize tax;
//           Securities' `snap.stock.gov`: trade tax, withholding, 二代健保),
//           all-time totals each app works out again from its whole history
//   own     what players made themselves (Securities and anything else):
//           worth less given, less what Play, the fees and the government moved
//
// By market: Play sends its settled result per sport (`snap.odds.pl`) and
// Securities its result per stock market (`snap.stock.pl`); what an account
// hasn't sent yet shows as unsorted, so the markets always add up to the side.
//
// A deleted account's money goes back to the system: its sides are kept in
// `quadra-config/ledger` (retired), and its worth counts as returned.

import { changeDoc } from './doc-store.js';
import { govOf } from './kit/gov.mjs';

export const LEDGER = ['quadra-config', 'ledger'];
const LOAN_KINDS = new Set(['loan', 'loanfee', 'loanpay', 'loanlate', 'loangar', 'loanoff']);
// The government's side of one account: the kit's own govOf (kit/gov.mjs), so the two always agree.
export { govOf };
const num = v => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

export function sidesOf(wallet) {
  const gave = { start: 0, pay: 0, rank: 0, other: 0 };
  const fees = { plus: 0, od: 0, loan: 0 };
  let play = 0;
  let atStake = 0;
  const entries = wallet?.entries || [];
  const ids = new Set(entries.map(e => e.id));
  const open = e => e.kind === 'stake' && typeof e.id === 'string' && e.id.startsWith('odds:stake-') && !ids.has(`odds:payout-${e.id.slice(11)}`) && !ids.has(`odds:refund-${e.id.slice(11)}`);
  for (const e of entries) {
    const a = num(e.amount);
    if (e.app === 'eco') {
      if (e.kind === 'start' || e.kind === 'grant') gave.start += a;
      else if (e.kind === 'pay') gave.pay += a;
      else if (e.kind === 'rank') gave.rank += a;
      else if (e.kind === 'rebase' || e.kind === 'vip' || e.kind === 'admin') gave.other += a;
      // A loan's money in and out: net of what's paid back, its fee, interest and late charges (less while one is still owed).
      else if (LOAN_KINDS.has(e.kind)) fees.loan -= a;
      else if (e.kind === 'plus' || e.kind === 'plusrefund') fees.plus -= a;
      else if (e.kind === 'od') fees.od -= a;
    } else if (e.app === 'odds') {
      if (e.kind === 'start') gave.start += a;
      else if (e.kind === 'grant') gave.other += a;
      else if (open(e)) atStake -= a;
      else play += a;
    }
  }
  let pool = 0;
  for (const e of entries) pool += num(e.amount);
  for (const s of Object.values(wallet?.snap || {})) pool += num(s?.cash);
  const worth = pool + num(wallet?.snap?.stock?.holdings) + atStake;
  const given = gave.start + gave.pay + gave.rank + gave.other;
  const gov = govOf(wallet);
  // Quadra's side from the house's view: above 0 when it kept more. Play's
  // payouts came in after tax: the tax was the government's, not the house's.
  const quadra = fees.plus + fees.od + fees.loan - play - gov.paid.sports - gov.paid.lottery;
  const own = worth - given + quadra - gov.net;
  const r = n => Math.round(n);
  const markets = (pl, sign) => Object.fromEntries(Object.entries(pl && typeof pl === 'object' ? pl : {}).filter(([, v]) => Number.isFinite(v)).map(([k, v]) => [k, r(sign * v)]));
  return {
    accounts: 1,
    given: r(given),
    gave: Object.fromEntries(Object.entries(gave).map(([k, v]) => [k, r(v)])),
    quadra: r(quadra),
    fees: { plus: r(fees.plus), od: r(fees.od), loan: r(fees.loan) },
    play: r(-play),
    // Play by sport from the house's side (a player's loss is Quadra's earning).
    playBy: markets(wallet?.snap?.odds?.pl, -1),
    gov,
    own: r(own),
    stockBy: markets(wallet?.snap?.stock?.pl, 1),
    worth: r(worth),
    atStake: r(atStake)
  };
}

// Adds b into a (numbers, and maps of numbers, at any depth).
export function addSides(a = {}, b = {}) {
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) {
    if (typeof v === 'number') out[k] = (out[k] || 0) + v;
    else if (v && typeof v === 'object') out[k] = addSides(out[k] || {}, v);
  }
  return out;
}

// An account deleted for good: its sides added to the retired ledger, so
// the totals still hold what it was given, what Quadra earned from it and
// what it made, and its worth counts as returned to the system.
export async function retire(env, deps, wallet) {
  if (!wallet) return;
  const [collection, id] = LEDGER;
  await changeDoc(env, deps, collection, id, was => ({ ...addSides(was, sidesOf(wallet)), since: was.since || deps.now(), at: deps.now() }), { read: v => v || {}, attempts: 3 }).catch(() => {});
}
