// 重大訊息白話 (builders/filings.js): TWSE's and TPEx's filings read into
// rows by code, and a bucket written only when a new one lands in it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rocAt, rowsOf, filingOf, runFilings, bucketOf, TPEX_COPY } from '../builders/filings.js';
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

test('a value line starting "0.91%" or "0.01元" stays its row\'s value, and a long label keeps its words (2330, 11-20)', () => {
  const rows = rowsOf(
    '6.交易相對人及其與公司之關係（交易相對人如屬自然人，且非公司之\r\n關係人者，得免揭露其姓名）:\r\nAnthropic；與公司之關係：無。\r\n7.取得或處分有價證券標的公司每股淨值:\r\n0.01元\r\n8.迄目前為止，累積持有本交易證券（含本次交易）之數量、金額、持股\r\n比例及權利受限情形（如質押情形）:\r\n6,024,096股；0.03%；無。\r\n9.占總資產之比例:\r\n0.91%；0.94%；NT$325,002佰萬元。'
  );
  assert.deepEqual(rows, [
    ['交易相對人及其與公司之關係', 'Anthropic；與公司之關係：無'],
    ['取得或處分有價證券標的公司每股淨值', '0.01元'],
    ['迄目前為止，累積持有本交易證券之數量、金額、持股比例及權利受限情形', '6,024,096股；0.03%；無'],
    ['占總資產之比例', '0.91%；0.94%；NT$325,002佰萬元']
  ]);
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

// TPEx's list gave the Worker no answer for days (2026-11-18) and every run
// waited it out: each list gets its time, then the run goes on without it.
test("a list that never answers: given up at its time, the other list's filings kept", async () => {
  const files = new Map();
  const store = { json: async p => (files.has(p) ? structuredClone(files.get(p)) : null), put: async (p, d) => files.set(p, d) };
  const get = (u, init) =>
    /twse/.test(u)
      ? Promise.resolve({ ok: true, json: async () => [twse] })
      : new Promise((_, no) => {
          // (Unless it's given up on, the list gives up only after 3 s.)
          const hang = setTimeout(() => no(new Error('no answer')), 3000);
          init?.signal?.addEventListener('abort', () => (clearTimeout(hang), no(init.signal.reason)));
        });
  const t = Date.now();
  const r = await runFilings({ store, get, now: Date.parse('2026-11-11T00:00:00Z'), listMs: 50 });
  assert.ok(Date.now() - t < 2000, `waited ${Date.now() - t} ms`);
  assert.equal(r.fresh, 1);
  assert.ok(files.get(bucketOf('5306')));
});

// TPEx answers GitHub's machines but not Cloudflare's (from about 2026-11-14 上櫃 filings were missing):
// GitHub's copy of its list (tools/news-clips.mjs) is read while under 2 hours old, TPEx itself never asked then.
test("TPEx's list from GitHub's copy while it's new; past 2 hours TPEx is asked itself", async () => {
  const now = Date.parse('2026-11-11T00:00:00Z');
  const files = new Map([[TPEX_COPY, { at: now - 30 * 60_000, rows: [tpex] }]]);
  const store = { json: async p => (files.has(p) ? structuredClone(files.get(p)) : null), put: async (p, d) => files.set(p, d) };
  const asked = [];
  const get = async u => (asked.push(/twse/.test(u) ? 'twse' : 'tpex'), /twse/.test(u) ? { ok: true, json: async () => [twse] } : { ok: false, status: 522 });
  const r = await runFilings({ store, get, now });
  assert.deepEqual(asked, ['twse']);
  assert.equal(r.fresh, 2);
  assert.equal(r.tpex, 'copy');
  assert.ok(files.get(bucketOf('6790')).codes['6790']);
  // An old copy: TPEx asked (and its failure said).
  files.clear();
  files.set(TPEX_COPY, { at: now - 3 * 3_600_000, rows: [tpex] });
  asked.length = 0;
  const r2 = await runFilings({ store, get, now });
  assert.deepEqual(asked.sort(), ['tpex', 'twse']);
  assert.equal(r2.tpexFailed, '522');
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
