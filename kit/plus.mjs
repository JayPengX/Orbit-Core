// Free bets and VIP, the rules alone (no page, no storage): one copy for the
// kit (quadra.mjs re-exports them) and the Worker, which checks a placed
// slip's free bet against the pass's wallet (settle.js).
//
// Old `eco:plus:<month>` entries stay in the wallet as history.

// A Taiwan month (YYYY-MM) of a time.
const taipeiMonth = t => new Date(t + 8 * 3_600_000).toISOString().slice(0, 7);

// A free bet is a token from Quadra: the welcome offer or an old weekly
// bonus bet (the Worker's 'eco:fb:…', app 'eco', kind 'freebet', amount 0, its
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
    if (e.app !== 'odds' || typeof e.t !== 'number' || taipeiMonth(e.t) !== month) continue;
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
