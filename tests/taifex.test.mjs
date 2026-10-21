// TAIFEX's futures table (taifex.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDaily, parseMargins, parseFinals } from '../taifex.js';

test('TAIFEX: day-session settlements of TX/MTX/TMF, their margins, and TXO monthly finals', () => {
  const daily = [
    { Date: '20261020', Contract: 'TX', 'ContractMonth(Week)': '202611', SettlementPrice: '46510', TradingSession: '一般' },
    { Date: '20261020', Contract: 'TX', 'ContractMonth(Week)': '202611', SettlementPrice: '-', TradingSession: '盤後' },
    { Date: '20261020', Contract: 'TMF', 'ContractMonth(Week)': '202611W4', SettlementPrice: '46500', TradingSession: '一般' },
    { Date: '20261020', Contract: 'TE', 'ContractMonth(Week)': '202611', SettlementPrice: '2900', TradingSession: '一般' }
  ];
  assert.deepEqual(parseDaily(daily), { date: '2026-10-20', settle: { TX202611: 46510 } });
  assert.deepEqual(parseMargins([{ Contract: '微型臺指期貨', InitialMargin: '35050', MaintenanceMargin: '26900' }, { Contract: '電子期貨', InitialMargin: '1', MaintenanceMargin: '1' }]), { TMF: [35050, 26900] });
  assert.deepEqual(parseFinals('h\n2026/10/21,202610  ,TXO,x,46650\n2026/10/16,202610F3,TXO,x,47260\n2026/10/21,202610  ,TEO,x,2911.85'), { 202610: 46650 });
});
