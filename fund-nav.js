// Taiwan's mutual funds' daily NAVs (證券投資信託基金每日淨值): SITCA's
// open data (投信投顧公會, data.gov.tw 11109), one CSV of every domestic
// fund's latest two days. Securities prices its funds from it (kit
// stock-quotes.mjs), the phone and the fills here alike.
//
// Served by the sports proxy as if from
// `https://funds.quadra/nav.json?codes=00526748A,00512527` (at most 40),
// each fund by its 基金統編 (a share class's own; SITCA's 基金代號 is only
// unique within its company). Listed ETFs, priced on the exchange, are left out:
//   { funds: { code: { name, company, currency, nav, prev, date } } }
// `date` is the NAV's own day (YYYY-MM-DD); `prev` the day's before it.

export const FUND_HOST = 'funds.quadra';
const NAV_CSV = 'https://www.sitca.org.tw/MemberK0000/F/03/nav.csv';
const MAX_CODES = 40;
const KEEP_MS = 10 * 60_000;

// One CSV line's cells (SITCA quotes none, but a name may hold a comma in quotes).
function cells(line) {
  const out = [];
  let cur = '';
  let quoted = false;
  for (const ch of line) {
    if (ch === '"') quoted = !quoted;
    else if (ch === ',' && !quoted) {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out.map(s => s.trim());
}

// The CSV as { code: fund }, each fund at its newest day, with the day's before.
export function parseNav(text) {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter(Boolean);
  const head = cells(lines[0] || '');
  const col = name => head.indexOf(name);
  const [d, company, code, name, nav, chg, currency, listed] = ['日期', '公司名稱', '基金統編', '基金名稱', '基金淨值', '漲跌', '幣別', '受益憑證代號'].map(col);
  if ([d, code, nav].some(i => i < 0)) throw new Error('SITCA NAV: unknown columns');
  const funds = {};
  for (const line of lines.slice(1)) {
    const r = cells(line);
    const value = Number(r[nav]);
    if (!r[code] || !(value > 0) || !/^\d{8}$/.test(r[d]) || /^00/.test(r[listed] || '')) continue;
    const date = `${r[d].slice(0, 4)}-${r[d].slice(4, 6)}-${r[d].slice(6)}`;
    const change = Number(r[chg]);
    const row = { name: r[name], company: r[company], currency: (r[currency] || 'TWD').toUpperCase(), nav: value, prev: Number.isFinite(change) ? +(value - change).toFixed(6) : value, date };
    const had = funds[r[code]];
    if (!had) funds[r[code]] = row;
    else if (date > had.date) funds[r[code]] = { ...row, prev: had.nav };
    else if (date < had.date && !(had.prev > 0)) had.prev = value;
  }
  return funds;
}

let kept = null;
async function navTable(fetchFn) {
  if (kept && Date.now() - kept.at < KEEP_MS) return kept.funds;
  const res = await fetchFn(NAV_CSV, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(8_000) });
  if (!res.ok) throw new Error(`SITCA ${res.status}`);
  const funds = parseNav(await res.text());
  if (Object.keys(funds).length < 2000) throw new Error('SITCA NAV list too short');
  kept = { at: Date.now(), funds };
  return funds;
}

export async function fundNavResponse(url, fetchFn = fetch) {
  const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  if (url.pathname !== '/nav.json') return json({ error: 'not found' }, 404);
  const codes = (url.searchParams.get('codes') || '').split(',').filter(c => /^[A-Za-z0-9]{2,12}$/.test(c));
  if (!codes.length || codes.length > MAX_CODES) return json({ error: 'codes' }, 400);
  try {
    const table = await navTable(fetchFn);
    return json({ funds: Object.fromEntries(codes.filter(c => table[c]).map(c => [c, table[c]])) });
  } catch (error) {
    return json({ error: String(error.message || error) }, 502);
  }
}
