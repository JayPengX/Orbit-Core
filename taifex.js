// TAIFEX's TAIEX futures (臺股期貨, 小型臺指, 微型臺指) for Securities: each
// contract month's latest settlement price, the margins, and the months'
// final settlement prices, from TAIFEX's open data and its download page.
// Served by the sports proxy as if from `https://taifex.quadra/fut.json`:
//   { date: 'YYYY-MM-DD', settle: { TX202611: 46510, … }, margin: { TX: [initial, maintenance], … },
//     final: { '202610': 46650, … }, opt: { '202611': { C: { 46500: 312, … }, P: { … } } },
//     optMargin: { A: [initial, maintenance], B: […], C: […] } }
// `opt`: 臺指選擇權's settlement prices by series (a month, or a weekly:
// 202610W4, 202610F5), strikes every 100 points within OPT_SPAN of the
// futures it's priced on, and the 50s within OPT_FINE; `final` the same.
// `date` is the settlement prices' trading day. The kit's stock-quotes.mjs
// prices a contract from it and the live 加權指數 (TAIFEX publishes no live
// quotes); a month's final settlement settles what's held at its expiry.

import { seriesFuture } from './kit/stock-markets.mjs';

export const TAIFEX_HOST = 'taifex.quadra';
const OPENAPI = 'https://openapi.taifex.com.tw/v1';
const FINALS = 'https://www.taifex.com.tw/cht/5/fSPDataDown';
const CODES = new Set(['TX', 'MTX', 'TMF']);
const MARGIN_NAMES = { 臺股期貨: 'TX', 小型臺指: 'MTX', 微型臺指期貨: 'TMF' };
const KEEP_MS = 10 * 60_000;
const OPT_SPAN = 2_500;
const OPT_FINE = 1_000;
const SERIES = /^\d{6}([WF][1-5])?$/;
const OPT_MARGIN = { '臺指選擇權風險保證金(A)值': 'A', '臺指選擇權風險保證金(B)值': 'B', '臺指選擇權風險保證金(C)值': 'C' };

// The day session's (一般) settlement price of each TX/MTX/TMF month.
export function parseDaily(rows) {
  const settle = {};
  let date = null;
  for (const r of Array.isArray(rows) ? rows : []) {
    const month = String(r['ContractMonth(Week)'] || '').trim();
    const price = Number(r.SettlementPrice);
    if (!CODES.has(r.Contract) || r.TradingSession !== '一般' || !/^\d{6}$/.test(month) || !(price > 0)) continue;
    settle[`${r.Contract}${month}`] = price;
    if (/^\d{8}$/.test(r.Date)) date = `${r.Date.slice(0, 4)}-${r.Date.slice(4, 6)}-${r.Date.slice(6)}`;
  }
  return { date, settle };
}
export function parseMargins(rows, names = MARGIN_NAMES) {
  const margin = {};
  for (const r of Array.isArray(rows) ? rows : []) {
    const code = names[r.Contract];
    const [im, mm] = [Number(r.InitialMargin), Number(r.MaintenanceMargin)];
    if (code && im > 0 && mm > 0) margin[code] = [im, mm];
  }
  return margin;
}
// The final settlement CSV (Big5; only its ASCII fields are read): TXO's
// monthly price is the futures' too (one final settlement price for both);
// its weeklies have their own.
export function parseFinals(text) {
  const final = {};
  for (const line of String(text || '').split(/\r?\n/)) {
    const [, month, code, , price] = line.split(',').map(s => s.trim());
    if (code === 'TXO' && SERIES.test(month || '') && Number(price) > 0) final[month] = Number(price);
  }
  return final;
}

// TAIFEX's open data answers JSON to some requests and CSV (a BOM, a header
// row in Chinese) to others, whatever is asked for, and which one changes from
// day to day: either is read into JSON's rows (the CSV's columns named as
// JSON's keys).
const CSV_KEYS = { 日期: 'Date', 契約: 'Contract', 契約代號: 'Contract', '到期月份(週別)': 'ContractMonth(Week)', 履約價: 'StrikePrice', 買賣權: 'CallPut', 結算價: 'SettlementPrice', 交易時段: 'TradingSession', 商品別: 'Contract', 原始保證金: 'InitialMargin', 維持保證金: 'MaintenanceMargin', 結算保證金: 'ClearingMargin' };
export function readRows(text) {
  if (Array.isArray(text)) return text;
  text = String(text || '').replace(/^\uFEFF/, '');
  if (text.trimStart().startsWith('[')) {
    try {
      const rows = JSON.parse(text);
      return Array.isArray(rows) ? rows : [];
    } catch {
      return [];
    }
  }
  const lines = text.split(/\r?\n/).filter(Boolean);
  const head = (lines[0] || '').split(',').map(h => CSV_KEYS[h.trim()] || h.trim());
  return lines.slice(1).map(line => Object.fromEntries(line.split(',').map((v, i) => [head[i], v.trim()])));
}

// TXO's day-session (一般) settlement prices from DailyMarketReportOpt, by
// series (a month, or a weekly), strikes on 100s within OPT_SPAN of the
// futures it's priced on (all of them when that's missing) and the 50s
// within OPT_FINE.
export function parseOptions(text, settle = {}) {
  const opt = {};
  for (const r of readRows(text)) {
    const m = String(r['ContractMonth(Week)'] || '').trim();
    const k = Number(r.StrikePrice);
    const p = Number(r.SettlementPrice);
    const side = r.CallPut === '買權' ? 'C' : r.CallPut === '賣權' ? 'P' : null;
    if (r.Contract !== 'TXO' || r.TradingSession !== '一般' || !SERIES.test(m) || !side || !(k > 0) || k % 50 || !(p > 0)) continue;
    const f = settle[`TX${seriesFuture(m)}`];
    if (f && Math.abs(k - f) > (k % 100 ? OPT_FINE : OPT_SPAN)) continue;
    ((opt[m] ||= { C: {}, P: {} })[side])[k] = p;
  }
  return opt;
}

// (A read whose options didn't come — their 4 MB report timed out — is kept
// only OPT_RETRY_MS and gets the last options read meanwhile, never an empty
// chain for ten minutes.)
const OPT_RETRY_MS = 30_000;
let kept = null;
let lastOpt = null;
async function table(fetchFn) {
  if (kept && Date.now() - kept.at < (Object.keys(kept.body.opt).length ? KEEP_MS : OPT_RETRY_MS)) return kept.body;
  const get = url => fetchFn(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(8_000) }).then(r => (r.ok ? r.text().then(readRows) : Promise.reject(new Error(`TAIFEX ${r.status}`))));
  const now = new Date(Date.now() + 8 * 3_600_000);
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 3, 1));
  const form = `start_year=${from.getUTCFullYear()}&start_month=${String(from.getUTCMonth() + 1).padStart(2, '0')}&end_year=${now.getUTCFullYear()}&end_month=${String(now.getUTCMonth() + 1).padStart(2, '0')}&dlFileType=3`;
  const [daily, margins, finals, options] = await Promise.all([
    get(`${OPENAPI}/DailyMarketReportFut`),
    get(`${OPENAPI}/IndexFuturesAndOptionsMargining`).catch(() => []),
    fetchFn(FINALS, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'Mozilla/5.0' }, body: form, signal: AbortSignal.timeout(8_000) })
      .then(r => (r.ok ? r.text() : ''))
      .catch(() => ''),
    optionsReport(fetchFn)
  ]);
  const { date, settle } = parseDaily(daily);
  if (!date || !Object.keys(settle).length) throw new Error('TAIFEX: no settlement prices');
  let opt = parseOptions(options, settle);
  if (Object.keys(opt).length) lastOpt = opt;
  else opt = lastOpt || {};
  const body = { date, settle, margin: parseMargins(margins), final: parseFinals(finals), opt, optMargin: parseMargins(margins, OPT_MARGIN) };
  kept = { at: Date.now(), body };
  return body;
}

// The options report (about 4 MB): 9 s for it, asked twice (inside a phone's 20 s).
async function optionsReport(fetchFn) {
  for (let i = 0; i < 2; i++) {
    const text = await fetchFn(`${OPENAPI}/DailyMarketReportOpt`, { signal: AbortSignal.timeout(9_000) })
      .then(r => (r.ok ? r.text() : ''))
      .catch(() => '');
    if (text) return text;
  }
  return '';
}

export async function taifexResponse(url, fetchFn = fetch) {
  const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  if (url.pathname !== '/fut.json') return json({ error: 'not found' }, 404);
  try {
    return json(await table(fetchFn));
  } catch (error) {
    return json({ error: String(error.message || error) }, 502);
  }
}
