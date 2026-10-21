// TAIFEX's futures table (taifex.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDaily, parseMargins, parseFinals, parseOptions } from '../taifex.js';

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

test('TAIFEX: TXO monthly day-session settlements near the money, and the options margin values', () => {
  const csv = [
    '﻿日期,契約,到期月份(週別),履約價,買賣權,開盤價,最高價,最低價,最後成交價,成交量,結算價,未沖銷契約量,最後最佳買價,最後最佳賣價,歷史最高價,歷史最低價,是否因訊息面暫停交易,交易時段',
    '20261020,TXO,202611,46500,買權,-,-,-,-,0,412,0,-,-,-,-,,一般',
    '20261020,TXO,202611,46500,賣權,-,-,-,-,0,398,0,-,-,-,-,,一般',
    '20261020,TXO,202611,46550,買權,-,-,-,-,0,380,0,-,-,-,-,,一般',
    '20261020,TXO,202611,40000,買權,-,-,-,-,0,6500,0,-,-,-,-,,一般',
    '20261020,TXO,202610W4,46500,買權,-,-,-,-,0,90,0,-,-,-,-,,一般',
    '20261020,TXO,202611,46500,買權,-,-,-,-,0,415,0,-,-,-,-,,盤後',
    '20261020,TEO,202611,2900,買權,-,-,-,-,0,40,0,-,-,-,-,,一般'
  ].join('\r\n');
  assert.deepEqual(parseOptions(csv, { TX202611: 46510 }), { 202611: { C: { 46500: 412 }, P: { 46500: 398 } } });
  assert.deepEqual(parseMargins([{ Contract: '臺指選擇權風險保證金(A)值', InitialMargin: '187000', MaintenanceMargin: '143000' }], { '臺指選擇權風險保證金(A)值': 'A' }), { A: [187000, 143000] });
});
