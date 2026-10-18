// Quadra Plus and free bets, the rules alone (no page, no storage): one copy
// for the kit (quadra.mjs re-exports them) and the Worker, which checks a
// placed slip's boost and free bet against the pass's wallet (settle.js).

// ---- Quadra Plus ---------------------------------------------------------------------
//
// The one membership across Quadra: PLUS.fee a Taiwan month from the pool,
// billed by the Worker (eco.js: `op: 'plus'`, renewal with the payday). The
// first month someone ever joins is free. A month is a member's when the
// wallet holds `eco:plus:<YYYY-MM>`, so every app reads the same answer, for
// any past day too.
//
// Plus is a product that earns Quadra money, the way a sportsbook's or a
// broker's membership does: every perk makes betting or trading cheaper or
// bigger, so a member bets and trades more, and the house's cut and the
// broker's costs on that extra play earn back more than the perks cost
// (a NT$200 free bet is worth well under NT$100 to the bettor on average:
// only its winnings come back, at the house's prices). Nothing in it pays
// for saving or holding cash. The avatar and frame (Looks, below) are its
// one perk outside the money.
export const PLUS = {
  fee: 490,
  // The yearly plan: twelve months for the price of ten.
  year: 4_900,
  // Play: a NT$bonusBet free bet each week (the Worker's `eco:fb:<Monday>`;
  // free bets take odds of 1.50 or longer, a parlay's all together), the parlay boost
  // ×boost (Play's PARLAY_BOOST: 3+ picks, where the house's cut multiplies
  // with every pick), and cash out keeps cashOutKeep instead of 3% (money
  // back on the slip sooner, to bet again).
  odds: { bonusBet: 200, boost: 1.5, cashOutKeep: 0.02 },
  // Securities: commission at 2.8折 (×0.28, a Taiwan online broker's best
  // rate; a fund's subscription fee too), FX spread ×0.5, margin loans
  // loanCut a year cheaper: more trades, more currencies, more borrowed.
  stock: { commission: 0.28, fxSpread: 0.5, loanCut: 0.01 }
};
export const plusMonth = t => new Date(t + 8 * 3_600_000).toISOString().slice(0, 7);
export const plusMonths = wallet => new Set((wallet?.entries || []).filter(e => e.kind === 'plus' && e.app === 'eco').map(e => e.id.slice(9)));
export const plusMember = (wallet, t = Date.now()) => (wallet?.entries || []).some(e => e.id === `eco:plus:${plusMonth(t)}` && e.app === 'eco');

// A free bet is a token from Quadra: Plus's weekly bonus bet or the welcome
// offer (the Worker's 'eco:fb:…', app 'eco', kind 'freebet', amount 0, its
// value in the note). Play stakes one on one slip, and only the winnings
// come back, never the stake. Play marks it spent with 'odds:fb-<token id>'
// (a fixed id: spent once). Unspent tokens last FREEBET.days.
export const FREEBET = { days: 7, max: 500 };
export const freeBetValue = e => {
  const v = Number(e?.note);
  return Number.isInteger(v) && v > 0 && v <= FREEBET.max && v % 10 === 0 ? v : 0;
};
// The tokens not yet spent or expired: [{ id, value, t, until }], soonest
// to expire first.
export function freeBets(wallet, now = Date.now(), spent = []) {
  const entries = wallet?.entries || [];
  const used = new Set(spent);
  for (const e of entries) if (e.app === 'odds' && typeof e.id === 'string' && e.id.startsWith('odds:fb-')) used.add(e.id.slice(8));
  return entries
    .filter(e => e.kind === 'freebet' && e.app === 'eco' && typeof e.id === 'string' && e.id.startsWith('eco:fb:') && freeBetValue(e) && !used.has(e.id))
    .map(e => ({ id: e.id, value: freeBetValue(e), t: e.t, until: e.t + FREEBET.days * 86_400_000 }))
    .filter(x => x.until > now)
    .sort((a, b) => a.until - b.until);
}

// ---- VIP: free tiers by what's played, with cashback -----------------------------------
//
// A Taiwan month's gaming stakes (Play's bets and lottery and scratch
// tickets, less refunds: `odds` entries of kind stake / lottery / refund)
// set that month's tier, and the Worker pays the tier's share of them back
// on the next month's first read (`eco:vip:<month>`, kind 'vip'; eco.js
// pays it, by this table). Loyalty cashback like a real sportsbook's or
// casino's: a sliver of the house's cut (every product keeps 14% or more;
// the top rate is 1.5%), for the players who bring the most.
export const VIP = {
  from: '2026-10',
  tiers: [
    { id: 'bronze', min: 10_000, back: 0.005, icon: '🥉', zh: '銅卡', en: 'Bronze' },
    { id: 'silver', min: 50_000, back: 0.008, icon: '🥈', zh: '銀卡', en: 'Silver' },
    { id: 'gold', min: 150_000, back: 0.012, icon: '🥇', zh: '金卡', en: 'Gold' },
    { id: 'black', min: 500_000, back: 0.015, icon: '◆', zh: '黑卡', en: 'Black' }
  ]
};
// A month's (YYYY-MM, Taiwan) gaming stakes, whole NT$.
export function vipStakes(wallet, month) {
  let sum = 0;
  for (const e of wallet?.entries || []) {
    if (e.app !== 'odds' || typeof e.t !== 'number' || plusMonth(e.t) !== month) continue;
    if (e.kind === 'stake' || e.kind === 'lottery' || e.kind === 'refund') sum -= e.amount;
  }
  return Math.max(0, Math.round(sum));
}
export const vipTier = stakes => [...VIP.tiers].reverse().find(t => stakes >= t.min) ?? null;

// The welcome offer: the first paid bet in Play brings a NT$WELCOME.bet free
// bet (`eco:fb:welcome`, the Worker's, once; quadra.mjs welcomeDue). A
// qualifying bet, as a real sportsbook's welcome offer asks: one stake of
// at least `minStake` (Play's smallest ticket, SLIP_RULES.minTicket), so a
// NT$0.01 stake or a free bet's top-up doesn't buy NT$200.
export const WELCOME = { bet: 200, minStake: 100 };
// Whether a wallet's entries hold that qualifying bet.
export const welcomeEarned = wallet => (wallet?.entries || []).some(e => e.app === 'odds' && e.kind === 'stake' && e.amount <= -WELCOME.minStake);
