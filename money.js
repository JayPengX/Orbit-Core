// Orbit's money as a whole, for the admin page: the same four sides the
// Securities' 真相 shows one account (kit/orbit.mjs moneySides), added up over
// every account, plus what deleted accounts took with them.
//
//   given   what the system paid in: opening money, weekly pay, wealth-rank
//           rewards, and the rest (admin grants, rebases)
//   orbit   what Orbit earned: overdraft interest and loan costs
//   gov     the government, from the player's side: 急難紓困 in, less every
//           tax out (Securities' `snap.stock.gov`: trade tax, withholding,
//           二代健保), all-time totals it works out again from its whole history
//   own     what players made themselves in the markets: worth less given,
//           less what the fees and the government moved
//
// By market: Securities sends its result per stock market (`snap.stock.pl`);
// what an account hasn't sent yet shows as unsorted, so the markets always
// add up to the side.
//
// A deleted account's money goes back to the system: its sides are kept in
// `orbit-config/ledger` (retired), and its worth counts as returned.

import { changeDoc } from './doc-store.js';
import { govOf } from './kit/gov.mjs';

export const LEDGER = ['orbit-config', 'ledger'];
const LOAN_KINDS = new Set(['loan', 'loanfee', 'loanpay', 'loanlate', 'loangar', 'loanoff']);
// The government's side of one account: the kit's own govOf (kit/gov.mjs), so the two always agree.
export { govOf };
const num = v => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

export function sidesOf(wallet) {
  const gave = { start: 0, pay: 0, rank: 0, other: 0 };
  const fees = { od: 0, loan: 0 };
  const entries = wallet?.entries || [];
  for (const e of entries) {
    if (e.app !== 'eco') continue;
    const a = num(e.amount);
    if (e.kind === 'start') gave.start += a;
    else if (e.kind === 'pay') gave.pay += a;
    else if (e.kind === 'rank') gave.rank += a;
    else if (e.kind === 'rebase' || e.kind === 'admin') gave.other += a;
    // A loan's money in and out: net of what's paid back, its fee, interest and late charges (less while one is still owed).
    else if (LOAN_KINDS.has(e.kind)) fees.loan -= a;
    else if (e.kind === 'od') fees.od -= a;
  }
  let pool = 0;
  for (const e of entries) pool += num(e.amount);
  for (const s of Object.values(wallet?.snap || {})) pool += num(s?.cash);
  const worth = pool + num(wallet?.snap?.stock?.holdings);
  const given = gave.start + gave.pay + gave.rank + gave.other;
  const gov = govOf(wallet);
  // Orbit's side from the house's view: above 0 when it kept more.
  const orbit = fees.od + fees.loan;
  const own = worth - given + orbit - gov.net;
  const r = n => Math.round(n);
  const markets = (pl, sign) => Object.fromEntries(Object.entries(pl && typeof pl === 'object' ? pl : {}).filter(([, v]) => Number.isFinite(v)).map(([k, v]) => [k, r(sign * v)]));
  return {
    accounts: 1,
    given: r(given),
    gave: Object.fromEntries(Object.entries(gave).map(([k, v]) => [k, r(v)])),
    orbit: r(orbit),
    fees: { od: r(fees.od), loan: r(fees.loan) },
    gov,
    own: r(own),
    stockBy: markets(wallet?.snap?.stock?.pl, 1),
    worth: r(worth)
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
// the totals still hold what it was given, what Orbit earned from it and
// what it made, and its worth counts as returned to the system.
export async function retire(env, deps, wallet) {
  if (!wallet) return;
  const [collection, id] = LEDGER;
  await changeDoc(env, deps, collection, id, was => ({ ...addSides(was, sidesOf(wallet)), since: was.since || deps.now(), at: deps.now() }), { read: v => v || {}, attempts: 3 }).catch(() => {});
}
