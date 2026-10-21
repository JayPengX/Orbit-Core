// node tools/tw-boards.mjs
// Rewrites two tables in kit/stock-markets.mjs from TPEx's open data. Run it
// now and then: a stock that has since moved to 上櫃 or 上市 keeps the
// emerging board's rules, and a new bond has none, until it is.
//   TW_EMERGING  every stock on the emerging board (興櫃), from its daily
//                quote list; each code a base-36 gap from the one before.
//   TW_CB        every listed convertible bond (可轉債), from its issue data:
//                code:maturity (YYMMDD), its face repaid then.
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
  .map(r => [r.BondCode, r.MaturityDate.slice(2)])
  .sort((a, b) => a[0].localeCompare(b[0]));
if (cbs.length < 200) throw new Error(`only ${cbs.length} convertible bonds`);

const file = new URL('../kit/stock-markets.mjs', import.meta.url);
let src = readFileSync(file, 'utf8');
const put = (name, value, note) => {
  const re = new RegExp(`^export const ${name} = .*$`, 'm');
  if (!re.test(src)) throw new Error(`${name} not in stock-markets.mjs`);
  src = src.replace(re, () => `export const ${name} = '${value}'; // ${note}`);
};
put('TW_EMERGING', codes.map((c, i) => (c - (codes[i - 1] || 0)).toString(36)).join(','), `${asOf}, ${codes.length} stocks`);
put('TW_CB', cbs.map(c => c.join(':')).join(','), `${asOf}, ${cbs.length} bonds`);
writeFileSync(file, src);
console.log(`${codes.length} emerging stocks, ${cbs.length} convertible bonds`);
