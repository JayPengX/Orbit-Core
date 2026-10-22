// node tools/tw-futures.mjs
// Rewrites TW_SSF in kit/stock-markets.mjs from TAIFEX's open data: every
// 股票期貨 and ETF期貨 contract and what it's on. Run it now and then: TAIFEX
// adds contracts a few times a year (and drops one whose stock it delists).
//   code:stock:flags:name, flags e (an ETF, 10,000 units; else a stock,
//   2,000 shares), o (上櫃: .TWO), m (小型: a tenth, 1,000 units or 100 shares).
// Adjusted contracts (after a split or a rights issue: CM1…) are left out.
import { readFileSync, writeFileSync } from 'node:fs';

const rows = async path => {
  const text = (await (await fetch(`https://openapi.taifex.com.tw/v1/${path}`, { headers: { Accept: 'application/json' } })).text()).replace(/^﻿/, '');
  return JSON.parse(text);
};
const [list, stockMargins, etfMargins] = await Promise.all([rows('SSFLists'), rows('SingleStockFuturesMargining'), rows('SingleStockFuturesETFMargining')]);
const mini = new Set([...stockMargins, ...etfMargins].filter(r => /^小型/.test(r.ContractName || '')).map(r => r.Contract));
const out = list
  .filter(r => /^[A-Z]{3}$/.test(r.Contract || '') && /^[0-9A-Z]{4,6}$/.test(r.StockCode || ''))
  .map(r => {
    const etf = /ETF/.test(r.Type) || /^00/.test(r.StockCode);
    // (Bond ETFs, the list's untyped ones, are all on TPEx.)
    const otc = /上櫃/.test(r.Type) || /^00\d+B$/.test(r.StockCode);
    const name = String(r.StockName || '').replace(/ETF$/, '').replace(/[:,]/g, '');
    return `${r.Contract}:${r.StockCode}:${etf ? 'e' : ''}${otc ? 'o' : ''}${mini.has(r.Contract) ? 'm' : ''}:${name}`;
  })
  .sort();
if (out.length < 250) throw new Error(`only ${out.length} stock futures`);

const file = new URL('../kit/stock-markets.mjs', import.meta.url);
const src = readFileSync(file, 'utf8');
const re = /^export const TW_SSF = .*$/m;
if (!re.test(src)) throw new Error('TW_SSF not in stock-markets.mjs');
const day = new Date(Date.now() + 8 * 3_600_000).toISOString().slice(0, 10);
writeFileSync(file, src.replace(re, () => `export const TW_SSF = '${out.join(',')}'; // ${day}, ${out.length} contracts`));
console.log(`${out.length} stock futures, ${out.filter(x => x.split(':')[2].includes('m')).length} of them 小型`);
