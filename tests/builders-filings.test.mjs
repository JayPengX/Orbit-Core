// 重大訊息白話 (builders/filings.js): TWSE's and TPEx's filings read into
// rows by code, and a bucket written only when a new one lands in it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rocAt, rowsOf, filingOf, runFilings, bucketOf } from '../builders/filings.js';
import { FEATURES, filingNumbers } from '../ai-features.js';

const twse = {
  出表日期: '1151111',
  發言日期: '1151110',
  發言時間: '170422',
  公司代號: '5306',
  公司名稱: '桂盟',
  '主旨 ': '公告本公司115年第三季度現金股利除息基準日',
  符合條款: '第14款',
  說明: '1.董事會、股東會決議或公司決定日期:115/11/10\r\n2.除權、息類別（請填入「除權」、「除息」或「除權息」）:除息\r\n3.發放股利種類及金額:普通股現金股利新台幣125,244,000元\r\n每股約配發0.9939939元。\r\n4.除權（息）交易日:116/03/18\r\n5.因應措施:無\r\n6.其他應敘明事項:不適用'
};
const tpex = {
  Date: '1151110',
  發言日期: '1151110',
  發言時間: '93015',
  SecuritiesCompanyCode: '6790',
  CompanyName: '永豐實',
  主旨: '代子公司公告資金貸與事項',
  說明: '1.事實發生日:115/11/10\n2.接受資金貸與之:\n(1)公司名稱:永豐餘投資有限公司(2)資金貸與之限額(仟元):722,772\n3.今年累計 x:(48,339)'
};

test("ROC days and times as Taiwan's ISO time", () => {
  assert.equal(rocAt('1151110', '65705'), '2026-11-10T06:57:05+08:00');
  assert.equal(rocAt('', '1'), null);
});

test("the 說明 as rows: a line joined to its number, (1)(2) split, the form's hints and dull rows left out", () => {
  assert.deepEqual(rowsOf(twse.說明), [
    ['董事會、股東會決議或公司決定日期', '115/11/10'],
    ['除權、息類別', '除息'],
    ['發放股利種類及金額', '普通股現金股利新台幣125,244,000元每股約配發0.9939939元'],
    ['除權（息）交易日', '116/03/18']
  ]);
  const rows = rowsOf(tpex.說明);
  assert.deepEqual(rows.slice(0, 2), [['公司名稱', '永豐餘投資有限公司'], ['資金貸與之限額(仟元)', '722,772']]);
  assert.deepEqual(rows[2], ['今年累計x', '−48,339']);
});

test("either list's row read as one filing, by code", () => {
  assert.deepEqual(filingOf(twse).id, '5306-20261110170422');
  assert.equal(filingOf(tpex).code, '6790');
  assert.equal(filingOf(tpex).at, '2026-11-10T09:30:15+08:00');
  assert.equal(filingOf({ 公司代號: 'x' }), null);
});

test('a new filing written into its bucket once; nothing new, nothing written', async () => {
  const files = new Map();
  let puts = 0;
  const store = { json: async p => (files.has(p) ? structuredClone(files.get(p)) : null), put: async (p, d) => (puts++, files.set(p, d)) };
  const get = async u => ({ ok: true, json: async () => (/twse/.test(u) ? [twse] : [tpex]) });
  const now = Date.parse('2026-11-11T00:00:00Z');
  const r = await runFilings({ store, get, now });
  assert.equal(r.fresh, 2);
  assert.equal(files.get(bucketOf('5306')).codes['5306'][0].title, twse['主旨 ']);
  assert.ok(files.get(bucketOf('6790')).codes['6790']);
  const before = puts;
  assert.equal((await runFilings({ store, get, now })).fresh, 0);
  assert.equal(puts, before);
});

test("sec-filing: the line's figures the filing's (rounded, in 萬/億, dates without zeros), the rows picked by number", () => {
  assert.ok(filingNumbers('每股約配 0.99 元，3/18 除息', '0.9939939 116/03/18'));
  assert.ok(filingNumbers('營收 12.3 億元', '1,227,508 (仟元)'));
  assert.ok(!filingNumbers('虧損 5.5 億', '1,227,508'));
  const f = FEATURES['sec-filing'];
  const input = f.input({ title: '除息', name: '桂盟', rows: rowsOf(twse.說明) });
  assert.deepEqual(f.clean({ line: '每股配 0.99 元，3/18 除息。', show: [3, 4, 9] }, input), { line: '每股配 0.99 元，3/18 除息。', show: [2, 3] });
  assert.equal(f.clean({ line: '每股配 64 元。', show: [] }, input), null);
});
