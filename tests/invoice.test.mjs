// Orbit Money's invoices through the proxy (invoice.js): 統一發票's draws, sellers' names.
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseWins, invoiceResponse } from '../invoice.js';

const item = (title, body) => `<item><title><![CDATA[${title}]]></title><description><![CDATA[${body}]]></description></item>`;
const RSS = `<rss><channel><title>x</title>${item('115年 05~06月', '<p>特別獎：38548029</p><p>特獎：10138845</p><p>頭獎：24121106、28589937、83663333</p>')}${item('115年 07~08月', '<p>特別獎：89996565</p><p>特獎：91098182</p><p>頭獎：54348835、44991397、06595111</p>')}</channel></rss>`;

test('the draws: each period by its first month, newest first, leading zeros kept', () => {
  const draws = parseWins(RSS);
  assert.deepEqual(draws.map(d => d.period), ['11507', '11505']);
  assert.deepEqual(draws[0], { period: '11507', special: '89996565', grand: '91098182', first: ['54348835', '44991397', '06595111'] });
  assert.throws(() => parseWins('<rss></rss>'), /no draws/);
});

test('/seller.json: 8-digit ids only, at most 20; one the register lacks is left out', async () => {
  const fetchFn = async u => new Response(u.includes('22555003') ? JSON.stringify([{ Company_Name: '統一超商股份有限公司 ' }]) : '');
  const r = await invoiceResponse(new URL('https://invoice.orbit/seller.json?ids=22555003,12345678,abc'), fetchFn);
  assert.deepEqual(await r.json(), { sellers: { 22555003: '統一超商股份有限公司' } });
  assert.equal((await invoiceResponse(new URL('https://invoice.orbit/seller.json?ids='), fetchFn)).status, 400);
  const many = Array.from({ length: 21 }, (_, i) => String(10000000 + i)).join(',');
  assert.equal((await invoiceResponse(new URL(`https://invoice.orbit/seller.json?ids=${many}`), fetchFn)).status, 400);
  assert.equal((await invoiceResponse(new URL('https://invoice.orbit/win.json'), async () => new Response('', { status: 503 }))).status, 502);
});
