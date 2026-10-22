// 政府: what the government took and gave one account (all time, whole
// NT$). One copy for Securities' 真相 (kit/orbit.mjs) and the admin page's
// 金流 (money.js), so the two always agree.
//
// Taken: 證交稅 and other trade taxes, tax withheld on dividends and interest
// (a foreign government's too) and 二代健保's supplementary premium
// (Securities' `snap.stock.gov`); given: 急難紓困 (the Worker's `relief`
// entries). Securities reports its figures as it syncs; not opened since
// shows 0.
import { finiteOr0 } from './format.mjs';

const nn = v => Math.max(0, Math.round(finiteOr0(v)));

export function govOf(wallet) {
  const stock = wallet?.snap?.stock?.gov || {};
  const paid = { trade: nn(stock.trade), withheld: nn(stock.withheld), nhi: nn(stock.nhi) };
  const got = { relief: Math.round((wallet?.entries || []).filter(e => e.app === 'eco' && e.kind === 'relief').reduce((sum, e) => sum + finiteOr0(e.amount), 0)) };
  const paidTotal = Object.values(paid).reduce((a, b) => a + b, 0);
  const gotTotal = got.relief;
  return { paid, got, paidTotal, gotTotal, net: gotTotal - paidTotal };
}
