// Taiwan's mutual funds' daily NAVs (證券投資信託基金每日淨值): SITCA's
// open data (投信投顧公會, data.gov.tw 11109), one CSV of every domestic
// fund's latest two days. Securities prices its funds from it (kit
// stock-quotes.mjs), the phone and the fills here alike.
//
// Served by the sports proxy as if from
// `https://funds.orbit/nav.json?codes=00526748A,00512527` (at most 40),
// each fund by its 基金統編 (a share class's own; SITCA's 基金代號 is only
// unique within its company). Listed ETFs, priced on the exchange, are left out:
//   { funds: { code: { name, company, currency, nav, prev, date } } }
// `date` is the NAV's own day (YYYY-MM-DD); `prev` the day's before it.
//
// A fund's history and profile (`/hist.json?code=00526748A`): SITCA keeps no
// history in the open, so these are Anue's (鉅亨, fund.api.cnyes.com), found
// by the fund's name and checked by the 基金統編 Anue keeps with it:
//   { code, points: [[ms, nav], …] (ten years, daily), profile: { … } }

export const FUND_HOST = 'funds.orbit';
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
// The last whole list: SITCA's on a day off (a typhoon's 停班, 2026-10-23)
// held 36 funds of thousands, and every fund's price was gone. A short or
// failed list is laid over the last whole one (this isolate's, else the
// colo's cache, two weeks), never taken alone.
const MIN_FUNDS = 2000;
const WHOLE_URL = `https://${FUND_HOST}/whole-nav.json`;
let whole = null;
const cache = () => (typeof caches !== 'undefined' ? caches.default : null);
async function keepWhole(funds) {
  whole = funds;
  await cache()
    ?.put(new Request(WHOLE_URL), new Response(JSON.stringify(funds), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'max-age=1209600' } }))
    .catch(() => {});
}
async function lastWhole() {
  if (whole) return whole;
  const hit = await cache()?.match(new Request(WHOLE_URL)).catch(() => null);
  return hit ? (whole = await hit.json().catch(() => null)) : null;
}
// (Tests: this isolate's ten-minute copy forgotten, the last whole list kept.)
export const forgetNav = () => (kept = null);
async function navTable(fetchFn) {
  if (kept && Date.now() - kept.at < KEEP_MS) return kept.funds;
  let funds = null;
  let failed = null;
  try {
    const res = await fetchFn(NAV_CSV, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(8_000) });
    if (!res.ok) throw new Error(`SITCA ${res.status}`);
    funds = parseNav(await res.text());
    if (Object.keys(funds).length >= MIN_FUNDS) {
      await keepWhole(funds);
      kept = { at: Date.now(), funds };
      return funds;
    }
    failed = new Error('SITCA NAV list too short');
  } catch (error) {
    failed = error;
  }
  const last = await lastWhole();
  if (!last) throw failed;
  // (Today's few over the whole list: a fund newer in today's wins.)
  const merged = { ...last };
  for (const [code, f] of Object.entries(funds || {})) if (!merged[code] || f.date >= merged[code].date) merged[code] = f;
  kept = { at: Date.now(), funds: merged };
  return merged;
}

const ANUE = 'https://fund.api.cnyes.com/fund/api';
const HIST_YEARS = 10;
// 基金統編 → Anue's id, as found (an isolate's memory).
const anueIds = new Map();
const plain = name => String(name || '').replace(/<\/?mark>/g, '').replace(/[\s　()（）\-－_]/g, '').toUpperCase();
const getJson = async (fetchFn, url) => {
  const res = await fetchFn(url, { headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' }, signal: AbortSignal.timeout(8_000) });
  if (!res.ok) throw new Error(`Anue ${res.status}`);
  return res.json();
};
const chartOf = (fetchFn, id) => {
  const end = Math.floor(Date.now() / 1000);
  return getJson(fetchFn, `${ANUE}/v1/funds/${id}/nav?format=chart&startAt=${end - HIST_YEARS * 365 * 86_400}&endAt=${end}`);
};

// Anue's candidates for a fund, likeliest first: the same name, then the same NAV.
export function anueCandidates(rows, fund) {
  const name = plain(fund.name);
  const score = r => (plain(r.displayNameLocal) === name ? 2 : 0) + (Math.abs(Number(r.nav) - fund.nav) < 1e-6 ? 1 : 0);
  return rows.filter(r => r?.cnyesId && score(r) > 0).sort((a, b) => score(b) - score(a)).map(r => r.cnyesId);
}

// Anue's chart answer as our history: the points oldest first, and the facts a fund page shows.
export function parseAnueChart(items) {
  const t = items.tradeDate || [];
  const nav = items.nav || [];
  const points = t.map((s, i) => [s * 1000, Number(nav[i])]).filter(([s, v]) => s > 0 && v > 0).sort((a, b) => a[0] - b[0]);
  const num = v => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
  const ms = v => (num(v) ? num(v) * 1000 : null);
  return {
    points,
    profile: {
      category: items.categoryLocal || items.globalCategory || null,
      area: items.investmentArea || null,
      risk: num(items.riskLevel),
      managementFee: num(items.managementFee),
      frontLoadFee: num(items.frontLoadFee),
      custodianFee: num(items.custodianFee),
      netAsset: num(items.totalNetAsset),
      netAssetCurrency: items.netAssetCurrency || items.baseCurrency || null,
      netAssetDate: ms(items.netAssetDate),
      inception: ms(items.inceptionDate),
      manager: items.managerNameLocal || null,
      company: items.investmentProviderNameLocal || items.fundCompanyNameLocal || null,
      custodian: items.custodianNameLocal || null,
      distribution: /Inc/i.test(items.distributionStatus || '') ? 'income' : /Acc/i.test(items.distributionStatus || '') ? 'accumulate' : null,
      returns: { ytd: num(items.returnYTDLocal), '1y': num(items.return1YearLocal), '3y': num(items.accReturn3YearLocal), '5y': num(items.accReturn5YearLocal), '10y': num(items.accReturn10YearLocal) },
      stars: num(items.starRating),
      isin: items.isin || null
    }
  };
}

async function fundHistory(code, fetchFn) {
  const known = anueIds.get(code);
  if (known) {
    const got = await chartOf(fetchFn, known);
    if (got?.items?.sitca === code) return parseAnueChart(got.items);
  }
  const fund = (await navTable(fetchFn))[code];
  if (!fund) return null;
  // By the whole name, then without the class (「-新台幣A」) or 「基金」.
  const names = [...new Set([fund.name, fund.name.split(/[-－(（]/)[0], fund.name.replace(/基金.*$/, ''), fund.name.slice(0, 6)])].filter(n => n.length >= 2);
  const tried = new Set();
  for (const name of names) {
    const found = await getJson(fetchFn, `${ANUE}/v2/search/fund?fundName=${encodeURIComponent(name)}&page=1`);
    const ids = anueCandidates(found?.items?.data || [], fund).filter(id => !tried.has(id));
    for (const id of ids.slice(0, 4)) {
      tried.add(id);
      const got = await chartOf(fetchFn, id);
      if (got?.items?.sitca === code) {
        anueIds.set(code, id);
        return parseAnueChart(got.items);
      }
    }
  }
  return null;
}

export async function fundNavResponse(url, fetchFn = fetch) {
  const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  if (url.pathname === '/hist.json') {
    const code = url.searchParams.get('code') || '';
    if (!/^[A-Za-z0-9]{2,12}$/.test(code)) return json({ error: 'code' }, 400);
    try {
      const hist = await fundHistory(code, fetchFn);
      return hist ? json({ code, ...hist }) : json({ error: 'not found' }, 404);
    } catch (error) {
      return json({ error: String(error.message || error) }, 502);
    }
  }
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
