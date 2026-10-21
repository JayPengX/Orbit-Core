// Taiwan's funds' NAVs from SITCA's CSV (fund-nav.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseNav, fundNavResponse } from '../fund-nav.js';

const CSV = [
  '﻿日期,公司代號,公司名稱,基金代號,基金統編,基金名稱,基金淨值,漲跌,幣別,受益憑證代號',
  '20261020,A0001,兆豐投信,01,00526748A,"兆豐ESG,累積型",13.21,0.01,TWD,',
  '20261019,A0001,兆豐投信,01,00526748A,"兆豐ESG,累積型",13.20,-0.02,TWD,',
  '20261020,A0002,元大投信,05,00512527,元大台灣卓越50,190.5,1.2,TWD,0050',
  '20261020,A0003,國泰投信,01,00600001,國泰美元債,10.5,,usd,'
].join('\r\n');

test('SITCA NAVs: by 基金統編, newest day with the one before, listed ETFs left out', () => {
  const funds = parseNav(CSV);
  assert.deepEqual(Object.keys(funds).sort(), ['00526748A', '00600001']);
  assert.deepEqual(funds['00526748A'], { name: '兆豐ESG,累積型', company: '兆豐投信', currency: 'TWD', nav: 13.21, prev: 13.2, date: '2026-10-20' });
  assert.equal(funds['00600001'].currency, 'USD');
  assert.equal(funds['00600001'].prev, 10.5, 'no change given: the NAV itself');
});

test('/nav.json: at most 40 codes, unknown columns an error', async () => {
  const bad = await fundNavResponse(new URL('https://funds.quadra/nav.json?codes='), async () => new Response(CSV));
  assert.equal(bad.status, 400);
  const broken = await fundNavResponse(new URL('https://funds.quadra/nav.json?codes=00526748A'), async () => new Response('a,b\n1,2'));
  assert.equal(broken.status, 502);
});
