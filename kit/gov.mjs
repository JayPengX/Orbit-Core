// 政府: what the government took and gave one account (all time, whole
// NT$). One copy for the Pass's 真相 (kit/quadra.mjs) and the admin page's
// 金流 (money.js), so the two always agree.
//
// Taken: 運彩's 20% income tax on a big combination and the lottery's 20%
// tax and 0.4% stamp duty on a prize over NT$5,000 (Play's `snap.odds.gov`),
// 證交稅 and other trade taxes, tax withheld on dividends and interest (a
// foreign government's too) and 二代健保's supplementary premium
// (Securities' `snap.stock.gov`); given: 急難紓困 (the Worker's `relief`
// entries). The apps report their figures as they sync; one not opened
// since shows 0.
// Play's sports tax counts only the slips still on the record: Play sends it
// by slip (`gov.slips`), and a slip whose stake the wallet no longer holds,
// or one taken off the record, adds nothing.
import { finiteOr0 } from './format.mjs';

const nn = v => Math.max(0, Math.round(finiteOr0(v)));

// Test slips the owner asked off the record (2026-10-20): his 1.08 single
// for NT$28,630 placed that morning, paid NT$30,920. Found by its wallet
// entries; the wallet keeps them (the balance doesn't move), the record
// (here, 真相's and Play's account) leaves them out.
export const OFF_RECORD = [{ day: '2026-10-20', cost: 28_630, paid: 30_920 }];
export function offRecord(wallet) {
  const entries = (wallet?.entries || []).filter(e => e?.app === 'odds' && typeof e.id === 'string');
  const paid = new Map(entries.filter(e => e.id.startsWith('odds:payout-')).map(e => [e.id.slice(12), e.amount]));
  const out = new Set();
  for (const e of entries) {
    if (!e.id.startsWith('odds:stake-') || !Number.isFinite(new Date(e.t).getTime())) continue;
    const id = e.id.slice(11);
    const day = new Date(e.t).toISOString().slice(0, 10);
    if (OFF_RECORD.some(x => x.day === day && -e.amount === x.cost && paid.get(id) === x.paid)) out.add(id);
  }
  return out;
}

// Play's sports tax, from the slips it was taken on that are still here
// (a stake folded into a month's total after 400 days counts as here).
function sportsTax(wallet, odds) {
  if (!odds.slips || typeof odds.slips !== 'object') return nn(odds.sports);
  const ids = new Set((wallet?.entries || []).map(e => e?.id));
  const folded = [...ids].some(id => typeof id === 'string' && id.startsWith('fold:odds:stake:'));
  const off = offRecord(wallet);
  let sum = 0;
  for (const [id, tax] of Object.entries(odds.slips)) if (!off.has(id) && (folded || ids.has(`odds:stake-${id}`))) sum += nn(tax);
  return sum;
}

export function govOf(wallet) {
  const odds = wallet?.snap?.odds?.gov || {};
  const stock = wallet?.snap?.stock?.gov || {};
  const paid = { sports: sportsTax(wallet, odds), lottery: nn(odds.lottery), trade: nn(stock.trade), withheld: nn(stock.withheld), nhi: nn(stock.nhi) };
  const got = { relief: Math.round((wallet?.entries || []).filter(e => e.app === 'eco' && e.kind === 'relief').reduce((sum, e) => sum + finiteOr0(e.amount), 0)) };
  const paidTotal = Object.values(paid).reduce((a, b) => a + b, 0);
  const gotTotal = got.relief;
  return { paid, got, paidTotal, gotTotal, net: gotTotal - paidTotal };
}
