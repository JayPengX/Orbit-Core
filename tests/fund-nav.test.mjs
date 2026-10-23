// Taiwan's funds' NAVs from SITCA's CSV (fund-nav.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseNav, fundNavResponse, anueCandidates, parseAnueChart, forgetNav } from '../fund-nav.js';
import { fundFacts } from '../kit/stock-quotes.mjs';

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
  const bad = await fundNavResponse(new URL('https://funds.orbit/nav.json?codes='), async () => new Response(CSV));
  assert.equal(bad.status, 400);
  const broken = await fundNavResponse(new URL('https://funds.orbit/nav.json?codes=00526748A'), async () => new Response('a,b\n1,2'));
  assert.equal(broken.status, 502);
});

test('a fund on Anue: the same name first, then the same NAV; others never', () => {
  const rows = [
    { cnyesId: 'A1', displayNameLocal: '國泰大中華基金', nav: 172.5 },
    { cnyesId: 'A2', displayNameLocal: '<mark>安聯台灣科技</mark>基金', nav: 700 },
    { cnyesId: 'A3', displayNameLocal: '安聯台灣科技基金-B', nav: 757.64 }
  ];
  assert.deepEqual(anueCandidates(rows, { name: '安聯台灣科技基金', nav: 757.64 }), ['A2', 'A3']);
});

test('Anue history: oldest first, in ms; the profile in our names', () => {
  const got = parseAnueChart({ tradeDate: [1792598400, 1792512000], nav: [757.64, 783.21], riskLevel: 5, managementFee: 1.6, frontLoadFee: 4, totalNetAsset: 3.25e11, netAssetCurrency: 'TWD', inceptionDate: 986227200, investmentProviderNameLocal: '安聯證券投資信託股份有限公司', distributionStatus: 'AccumulatedDistr', returnYTDLocal: 95.5, accReturn3YearLocal: 416.3 });
  assert.deepEqual(got.points, [[1792512000000, 783.21], [1792598400000, 757.64]]);
  assert.equal(got.profile.risk, 5);
  assert.equal(got.profile.managementFee, 1.6);
  assert.equal(got.profile.distribution, 'accumulate');
  assert.equal(got.profile.returns['3y'], 416.3);
  const f = fundFacts(got.profile);
  assert.equal(f.family, '安聯投信');
  assert.equal(f.expenseRatio, 0.016);
  assert.ok(Math.abs(f.return3y - (Math.cbrt(5.163) - 1)) < 1e-9);
  assert.equal(f.ytd, 0.955);
});

test("a short or failed SITCA list (a day off's few dozen) is laid over the last whole one, never taken alone", async () => {
  const head = '﻿日期,公司代號,公司名稱,基金代號,基金統編,基金名稱,基金淨值,漲跌,幣別,受益憑證代號';
  const row = (day, code, nav) => `${day},A0001,兆豐投信,01,${code},基金${code},${nav},0.1,TWD,`;
  const whole = [head, ...Array.from({ length: 2100 }, (_, i) => row('20261022', `F${i}`, 10 + i / 1000))].join('\r\n');
  const short = [head, row('20261023', 'F1', 99), row('20261023', 'NEW', 5)].join('\r\n');
  const ask = async (csv, codes) => (await (await fundNavResponse(new URL(`https://funds.orbit/nav.json?codes=${codes}`), async () => (csv ? new Response(csv) : new Response('', { status: 503 })))).json()).funds;
  forgetNav();
  assert.equal((await ask(whole, 'F1,F2')).F2.nav, 10.002);
  forgetNav();
  const day = await ask(short, 'F1,F2,NEW');
  assert.deepEqual([day.F1.nav, day.F1.date, day.F2.nav, day.NEW.nav], [99, '2026-10-23', 10.002, 5], "today's few over the rest");
  forgetNav();
  assert.equal((await ask(null, 'F2')).F2.nav, 10.002, 'SITCA down: the last whole list');
});
