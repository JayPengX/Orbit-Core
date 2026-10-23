// node tools/tw-boards.mjs
// Rewrites five tables in kit/stock-markets.mjs from TWSE's and TPEx's open
// data. Run it now and then: a stock that has since moved board keeps the
// old board's rules, and a new bond has none, until it is.
//   TW_EMERGING  every stock on the emerging board (興櫃), from its daily
//                quote list; each code a base-36 gap from the one before.
//   TW_CB        every listed convertible bond (可轉債), from its issue data:
//                code:maturity (YYMMDD), its face repaid then:conversion
//                price at issue:put date (YYMMDD):put price (per 100), the
//                last three empty where it has none.
//   TW_FULL      every stock traded by changed method (變更交易, 全額交割股):
//                TWSE's TWT85U and TPEx's cmode lists.
//   TW_INNOVATION  every TWSE 臺灣創新板 stock, from TWSE's ISIN list.
//   TW_LI_FUTURES  every leveraged or inverse futures ETF (槓桿反向期貨 ETF:
//                a futures trust's, its code ending L or R and its name
//                starting 期), from the same list.
import { readFileSync, writeFileSync } from 'node:fs';

const get = async url => (await fetch(url)).json();
const esb = await get('https://www.tpex.org.tw/openapi/v1/tpex_esb_latest_statistics');
const codes = [...new Set(esb.map(r => r.SecuritiesCompanyCode).filter(c => /^\d{4}$/.test(c || '')))].map(Number).sort((a, b) => a - b);
if (codes.length < 200) throw new Error(`only ${codes.length} emerging stocks`);
const day = String(esb[0]?.Date || '');
const asOf = day.length === 7 ? `${Number(day.slice(0, 3)) + 1911}-${day.slice(3, 5)}-${day.slice(5)}` : 'today';

// Listed (ListingStatus 2) convertible and exchangeable bonds with a code.
const cbs = (await get('https://www.tpex.org.tw/openapi/v1/bond_ISSBD5_data'))
  .filter(r => r.ListingStatus === '2' && /^[1-9]\d{4}$/.test(r.BondCode || '') && /^\d{8}$/.test(r.MaturityDate || ''))
  .map(r => {
    const n = x => (Number(x) > 0 ? String(Number(x)) : '');
    const put = /^\d{8}$/.test(r.PutOptionDate || '') && Number(r.PutOptionPrice) > 0;
    return [r.BondCode, r.MaturityDate.slice(2), n(r['Conversion/ExchangePriceAtIssuance']), put ? r.PutOptionDate.slice(2) : '', put ? n(r.PutOptionPrice) : ''];
  })
  .sort((a, b) => a[0].localeCompare(b[0]));
if (cbs.length < 200) throw new Error(`only ${cbs.length} convertible bonds`);

// 全額交割: TWSE's changed-method list, and TPEx's stocks marked AlteredTrading.
const full = [
  ...(await get('https://openapi.twse.com.tw/v1/exchangeReport/TWT85U')).map(r => r.Code),
  ...(await get('https://www.tpex.org.tw/openapi/v1/tpex_cmode')).filter(r => /[YＹ]/.test(r.AlteredTrading || '')).map(r => r.SecuritiesCompanyCode)
].map(c => String(c || '').trim()).filter(c => /^\d{4,6}$/.test(c));
if (full.length < 3) throw new Error(`only ${full.length} changed-method stocks`);

// TWSE's ISIN list of what's listed (Big5): each row's code and name, and its market.
const isin = new TextDecoder('big5').decode(await (await fetch('https://isin.twse.com.tw/isin/C_public.jsp?strMode=2')).arrayBuffer());
const listed = [...isin.matchAll(/<tr>(.*?)<\/tr>/gs)]
  .map(m => [...m[1].matchAll(/<td[^>]*>(.*?)<\/td>/gs)].map(c => c[1].replace(/<[^>]+>/g, '').trim()))
  .filter(c => c.length > 4)
  .map(c => ({ code: c[0].split(/[\s\u3000]+/)[0], name: c[0].split(/[\s\u3000]+/).slice(1).join(''), market: c[3] }));
const innovation = listed.filter(r => r.market === '上市臺灣創新板' && /^\d{4}$/.test(r.code)).map(r => r.code);
if (innovation.length < 10) throw new Error(`only ${innovation.length} innovation-board stocks`);
const liFutures = listed.filter(r => /^\d{5,6}[LR]$/.test(r.code) && r.name.startsWith('期')).map(r => r.code);
if (liFutures.length < 3) throw new Error(`only ${liFutures.length} leveraged futures ETFs`);
const sorted = list => [...new Set(list)].sort().join(',');

const file = new URL('../kit/stock-markets.mjs', import.meta.url);
let src = readFileSync(file, 'utf8');
const put = (name, value, note) => {
  const re = new RegExp(`^export const ${name} = .*$`, 'm');
  if (!re.test(src)) throw new Error(`${name} not in stock-markets.mjs`);
  src = src.replace(re, () => `export const ${name} = '${value}'; // ${note}`);
};
put('TW_EMERGING', codes.map((c, i) => (c - (codes[i - 1] || 0)).toString(36)).join(','), `${asOf}, ${codes.length} stocks`);
put('TW_CB', cbs.map(c => c.join(':').replace(/:+$/, '')).join(','), `${asOf}, ${cbs.length} bonds`);
put('TW_FULL', sorted(full), `${asOf}, ${new Set(full).size} stocks`);
put('TW_INNOVATION', sorted(innovation), `${asOf}, ${new Set(innovation).size} stocks`);
put('TW_LI_FUTURES', sorted(liFutures), `${asOf}, ${new Set(liFutures).size} ETFs`);
writeFileSync(file, src);
console.log(`${codes.length} emerging stocks, ${cbs.length} convertible bonds, ${new Set(full).size} changed-method stocks, ${new Set(innovation).size} innovation-board stocks, ${new Set(liFutures).size} leveraged futures ETFs`);
