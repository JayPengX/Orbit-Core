// Free bets, the rules alone (no page, no storage): one copy for the kit
// (quadra.mjs re-exports them) and the Worker.
//
// Old `eco:plus:<month>` entries stay in the wallet as history.

// A free bet was a token from Quadra (the welcome offer, old weekly bonus
// bets: the Worker's 'eco:fb:…', kind 'freebet', its value in the note);
// none since 2026-10-21 (台灣運彩 has none). The old ones stay in the wallet
// as history, read at most FREEBET.max each (truth.mjs).
export const FREEBET = { max: 500 };

// VIP (monthly tiers with cashback) is gone (the owner 2026-10-22): old
// `eco:vip:<month>` entries stay in the wallet as history.
