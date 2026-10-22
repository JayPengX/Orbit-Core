// VIP, the rules alone (no page, no storage): one copy for the kit
// (quadra.mjs re-exports them) and the Worker (eco.js pays the cashback).
//
// Old `eco:plus:<month>` entries stay in the wallet as history.

import { twMonth } from './format.mjs';

// A free bet was a token from Quadra (the welcome offer, old weekly bonus
// bets: the Worker's 'eco:fb:…', kind 'freebet', its value in the note);
// none since 2026-10-21 (台灣運彩 has none). The old ones stay in the wallet
// as history, read at most FREEBET.max each (truth.mjs).
export const FREEBET = { max: 500 };

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
    if (e.app !== 'odds' || typeof e.t !== 'number' || twMonth(e.t) !== month) continue;
    if (e.kind === 'stake' || e.kind === 'lottery' || e.kind === 'refund') sum -= e.amount;
  }
  return Math.max(0, Math.round(sum));
}
export const vipTier = stakes => [...VIP.tiers].reverse().find(t => stakes >= t.min) ?? null;
