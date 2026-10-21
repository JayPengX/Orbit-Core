// TAIFEX's TAIEX futures (臺股期貨, 小型臺指, 微型臺指) for Securities: each
// contract month's latest settlement price, the margins, and the months'
// final settlement prices, from TAIFEX's open data and its download page.
// Served by the sports proxy as if from `https://taifex.quadra/fut.json`:
//   { date: 'YYYY-MM-DD', settle: { TX202611: 46510, … }, margin: { TX: [initial, maintenance], … },
//     final: { '202610': 46650, … } }
// `date` is the settlement prices' trading day. The kit's stock-quotes.mjs
// prices a contract from it and the live 加權指數 (TAIFEX publishes no live
// quotes); a month's final settlement settles what's held at its expiry.

export const TAIFEX_HOST = 'taifex.quadra';
const OPENAPI = 'https://openapi.taifex.com.tw/v1';
const FINALS = 'https://www.taifex.com.tw/cht/5/fSPDataDown';
const CODES = new Set(['TX', 'MTX', 'TMF']);
const MARGIN_NAMES = { 臺股期貨: 'TX', 小型臺指: 'MTX', 微型臺指期貨: 'TMF' };
const KEEP_MS = 10 * 60_000;

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
export function parseMargins(rows) {
  const margin = {};
  for (const r of Array.isArray(rows) ? rows : []) {
    const code = MARGIN_NAMES[r.Contract];
    const [im, mm] = [Number(r.InitialMargin), Number(r.MaintenanceMargin)];
    if (code && im > 0 && mm > 0) margin[code] = [im, mm];
  }
  return margin;
}
// The final settlement CSV (Big5; only its ASCII fields are read): TXO's
// monthly price is the futures' too (one final settlement price for both).
export function parseFinals(text) {
  const final = {};
  for (const line of String(text || '').split(/\r?\n/)) {
    const [, month, code, , price] = line.split(',').map(s => s.trim());
    if (code === 'TXO' && /^\d{6}$/.test(month || '') && Number(price) > 0) final[month] = Number(price);
  }
  return final;
}

let kept = null;
async function table(fetchFn) {
  if (kept && Date.now() - kept.at < KEEP_MS) return kept.body;
  const get = url => fetchFn(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(8_000) }).then(r => (r.ok ? r.json() : Promise.reject(new Error(`TAIFEX ${r.status}`))));
  const now = new Date(Date.now() + 8 * 3_600_000);
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 3, 1));
  const form = `start_year=${from.getUTCFullYear()}&start_month=${String(from.getUTCMonth() + 1).padStart(2, '0')}&end_year=${now.getUTCFullYear()}&end_month=${String(now.getUTCMonth() + 1).padStart(2, '0')}&dlFileType=3`;
  const [daily, margins, finals] = await Promise.all([
    get(`${OPENAPI}/DailyMarketReportFut`),
    get(`${OPENAPI}/IndexFuturesAndOptionsMargining`).catch(() => []),
    fetchFn(FINALS, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'Mozilla/5.0' }, body: form, signal: AbortSignal.timeout(8_000) })
      .then(r => (r.ok ? r.text() : ''))
      .catch(() => '')
  ]);
  const { date, settle } = parseDaily(daily);
  if (!date || !Object.keys(settle).length) throw new Error('TAIFEX: no settlement prices');
  const body = { date, settle, margin: parseMargins(margins), final: parseFinals(finals) };
  kept = { at: Date.now(), body };
  return body;
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
