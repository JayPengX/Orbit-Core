// The 載具's CSV export (kit/carrier-csv.mjs): both layouts, Big5, 作廢.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as I from '../kit/carrier-csv.mjs';

test('the 載具 export: M/D rows under named columns, 作廢 marked, totals kept', () => {
  const text = [
    '表頭=M|載具名稱|載具號碼|發票日期|商店統編|商店店名|發票號碼|總金額|發票狀態|',
    '明細=D|發票號碼|小計|品項名稱|',
    'M|手機條碼|/ABC1234|20261005|16446274|全家便利商店股份有限公司|AB12345678|85|開立|',
    'D|AB12345678|55|拿鐵|',
    'D|AB12345678|30|茶葉蛋|',
    'M|手機條碼|/ABC1234|1151006|22555003|統一超商股份有限公司|CD-87654321|40|作廢|'
  ].join('\r\n');
  const [a, b] = I.parseCarrierCsv(text);
  assert.deepEqual(a, { no: 'AB12345678', day: '2026-10-05', sid: '16446274', seller: '全家便利商店股份有限公司', total: 85, items: [{ name: '拿鐵', qty: 1, price: 55 }, { name: '茶葉蛋', qty: 1, price: 30 }], void: false });
  assert.equal(b.no, 'CD87654321');
  assert.equal(b.day, '2026-10-06');
  assert.equal(b.void, true);
});

test('the 載具 export as a plain CSV, one row per item, quoted cells, Big5 bytes', () => {
  const text = '載具自訂名稱,發票日期,發票號碼,發票金額,發票狀態,賣方統一編號,賣方名稱,消費明細_數量,消費明細_單價,消費明細_金額,消費明細_品名\n手機條碼,2026/10/05,AB12345678,"1,085",已確認,16446274,"全家, 便利",1,1000,1000,耳機\n手機條碼,2026/10/05,AB12345678,"1,085",已確認,16446274,"全家, 便利",1,85,85,咖啡';
  const [a] = I.parseCarrierCsv(text);
  assert.equal(a.total, 1085);
  assert.equal(a.seller, '全家, 便利');
  assert.deepEqual(a.items.map(i => i.name), ['耳機', '咖啡']);
  assert.equal(I.csvText(new Uint8Array([0xa4, 0xfb, 0xa5, 0xa4])), '牛奶');
  assert.equal(I.csvText(new TextEncoder().encode('﻿牛奶')), '牛奶');
  assert.deepEqual(I.parseCarrierCsv('nothing here'), []);
});
