// node tools/tw-emerging.mjs
// Rewrites TW_EMERGING in kit/stock-markets.mjs: every stock on TPEx's emerging board
// (興櫃), from its daily quote list. They trade by negotiation with their
// recommending brokers, not on the exchange's matching: no daily limit, limit
// orders only, no closing auction, no 融資/融券 and no 當沖. Run it now and
// then: a stock that has since moved to 上櫃 or 上市 keeps the board's
// rules until it is.
import { readFileSync, writeFileSync } from 'node:fs';

const LIST = 'https://www.tpex.org.tw/openapi/v1/tpex_esb_latest_statistics';
const rows = await (await fetch(LIST)).json();
const codes = [...new Set(rows.map(r => r.SecuritiesCompanyCode).filter(c => /^\d{4}$/.test(c || '')))].map(Number).sort((a, b) => a - b);
if (codes.length < 200) throw new Error(`only ${codes.length} emerging stocks`);
const day = String(rows[0]?.Date || '');
const asOf = day.length === 7 ? `${Number(day.slice(0, 3)) + 1911}-${day.slice(3, 5)}-${day.slice(5)}` : 'today';
const file = new URL('../kit/stock-markets.mjs', import.meta.url);
const line = `export const TW_EMERGING = '${codes.map((c, i) => (c - (codes[i - 1] || 0)).toString(36)).join(',')}'; // ${asOf}, ${codes.length} stocks`;
const src = readFileSync(file, 'utf8');
if (!/^export const TW_EMERGING = .*$/m.test(src)) throw new Error('TW_EMERGING not in stock-markets.mjs');
writeFileSync(file, src.replace(/^export const TW_EMERGING = .*$/m, () => line));
console.log(codes.length);
