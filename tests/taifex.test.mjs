// TAIFEX's futures table (taifex.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDaily, parseMargins, parseFinals, parseOptions, readRows } from '../taifex.js';

test('TAIFEX: day-session settlements of TX/MTX/TMF, their margins, and TXO finals, weeklies too', () => {
  const daily = [
    { Date: '20261020', Contract: 'TX', 'ContractMonth(Week)': '202611', SettlementPrice: '46510', TradingSession: '一般' },
    { Date: '20261020', Contract: 'TX', 'ContractMonth(Week)': '202611', SettlementPrice: '-', TradingSession: '盤後' },
    { Date: '20261020', Contract: 'TMF', 'ContractMonth(Week)': '202611W4', SettlementPrice: '46500', TradingSession: '一般' },
    { Date: '20261020', Contract: 'TE', 'ContractMonth(Week)': '202611', SettlementPrice: '2900', TradingSession: '一般' }
  ];
  assert.deepEqual(parseDaily(daily), { date: '2026-10-20', settle: { TX202611: 46510 } });
  assert.deepEqual(parseMargins([{ Contract: '微型臺指期貨', InitialMargin: '35050', MaintenanceMargin: '26900' }, { Contract: '電子期貨', InitialMargin: '1', MaintenanceMargin: '1' }]), { TMF: [35050, 26900] });
  assert.deepEqual(parseFinals('h\n2026/10/21,202610  ,TXO,x,46650\n2026/10/16,202610F3,TXO,x,47260\n2026/10/21,202610  ,TEO,x,2911.85'), { 202610: 46650, '202610F3': 47260 });
  // The futures' report answered as CSV (as it sometimes is): the same rows.
  const csv = '\uFEFF日期,契約代號,到期月份(週別),開盤價,結算價,交易時段\n20261020,TX,202611,46400,46510,一般\n20261020,TX,202611,46400,-,盤後';
  assert.deepEqual(parseDaily(readRows(csv)), { date: '2026-10-20', settle: { TX202611: 46510 } });
});

test('TAIFEX: TXO day-session settlements near the money, monthly and weekly, 50s close in, and the options margin values', () => {
  const csv = [
    '﻿日期,契約,到期月份(週別),履約價,買賣權,開盤價,最高價,最低價,最後成交價,成交量,結算價,未沖銷契約量,最後最佳買價,最後最佳賣價,歷史最高價,歷史最低價,是否因訊息面暫停交易,交易時段',
    '20261020,TXO,202611,46500,買權,-,-,-,-,0,412,0,-,-,-,-,,一般',
    '20261020,TXO,202611,46500,賣權,-,-,-,-,0,398,0,-,-,-,-,,一般',
    '20261020,TXO,202611,46550,買權,-,-,-,-,0,380,0,-,-,-,-,,一般',
    '20261020,TXO,202611,44050,買權,-,-,-,-,0,2500,0,-,-,-,-,,一般',
    '20261020,TXO,202611,46520,買權,-,-,-,-,0,390,0,-,-,-,-,,一般',
    '20261020,TXO,202611,40000,買權,-,-,-,-,0,6500,0,-,-,-,-,,一般',
    '20261020,TXO,202610W4,46500,買權,-,-,-,-,0,90,0,-,-,-,-,,一般',
    '20261020,TXO,202611,46500,買權,-,-,-,-,0,415,0,-,-,-,-,,盤後',
    '20261020,TEO,202611,2900,買權,-,-,-,-,0,40,0,-,-,-,-,,一般'
  ].join('\r\n');
  // (A 50 near the money, not 2,460 away; the weekly 10/28 on November's futures.)
  assert.deepEqual(parseOptions(csv, { TX202611: 46510 }), { 202611: { C: { 46500: 412, 46550: 380 }, P: { 46500: 398 } }, '202610W4': { C: { 46500: 90 }, P: {} } });
  // The same answered as JSON (as it is to the Worker).
  const row = (m, k, cp, p, session = '一般') => ({ Date: '20261020', Contract: 'TXO', 'ContractMonth(Week)': m, StrikePrice: String(k), CallPut: cp, SettlementPrice: String(p), TradingSession: session });
  const json = JSON.stringify([row('202611', 46500, '買權', 412), row('202611', 46500, '賣權', 398), row('202610W4', 46500, '買權', 90), row('202611', 46500, '買權', 415, '盤後')]);
  assert.deepEqual(parseOptions(json, { TX202611: 46510 }), { 202611: { C: { 46500: 412 }, P: { 46500: 398 } }, '202610W4': { C: { 46500: 90 }, P: {} } });
  assert.deepEqual(parseMargins([{ Contract: '臺指選擇權風險保證金(A)值', InitialMargin: '187000', MaintenanceMargin: '143000' }], { '臺指選擇權風險保證金(A)值': 'A' }), { A: [187000, 143000] });
});
