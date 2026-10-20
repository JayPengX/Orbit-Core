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
const finiteOr0 = v => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const nn = v => Math.max(0, Math.round(finiteOr0(v)));
export function govOf(wallet) {
  const odds = wallet?.snap?.odds?.gov || {};
  const stock = wallet?.snap?.stock?.gov || {};
  const paid = { sports: nn(odds.sports), lottery: nn(odds.lottery), trade: nn(stock.trade), withheld: nn(stock.withheld), nhi: nn(stock.nhi) };
  const got = { relief: Math.round((wallet?.entries || []).filter(e => e.app === 'eco' && e.kind === 'relief').reduce((sum, e) => sum + finiteOr0(e.amount), 0)) };
  const paidTotal = Object.values(paid).reduce((a, b) => a + b, 0);
  const gotTotal = got.relief;
  return { paid, got, paidTotal, gotTotal, net: gotTotal - paidTotal };
}
