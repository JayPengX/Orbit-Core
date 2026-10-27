// Orbit Money's invoices (統一發票), from the government's open pages: the
// winning numbers of the last six draws (財政部's RSS, invoice.xml) and the
// names behind 統一編號 (經濟部商業發展署's company register, GCIS open data).
// Neither answers a page from another site (no CORS), so the phone asks here.
//
// Served by the sports proxy as if from `https://invoice.orbit/…`:
//   /win.json             { draws: [{ period: '11507', special, grand, first: [3 numbers] }] } newest first
//   /seller.json?ids=a,b  { sellers: { '22555003': '統一超商股份有限公司' } } (at most 20; a 統編
//                         the register doesn't hold is left out)

export const INVOICE_HOST = 'invoice.orbit';
const WIN_RSS = 'https://invoice.etax.nat.gov.tw/invoice.xml';
const GCIS = 'https://data.gcis.nat.gov.tw/od/data/api/5F64D864-61CB-4D0D-8AD9-492047CC1EA6';
const MAX_IDS = 20;
const UA = 'Orbit-Money/1.0 (+https://github.com/JayPengX/Orbit-Money)';

const numbers = (text, name) => (new RegExp(`${name}[：:]\\s*([0-9、,，\\s]+)`).exec(text)?.[1] || '').split(/[、,，\s]+/).filter(n => /^\d{8}$/.test(n));

// The RSS as draws: each item's title 「115年 07~08月」 is the period (its first month).
export function parseWins(xml) {
  const draws = [];
  for (const item of String(xml).split('<item>').slice(1)) {
    const title = /<title><!\[CDATA\[(.*?)\]\]><\/title>/s.exec(item)?.[1] || '';
    const at = /(\d{2,3})\s*年\s*(\d{1,2})/.exec(title);
    const body = (/<description><!\[CDATA\[(.*?)\]\]><\/description>/s.exec(item)?.[1] || '').replace(/<[^>]+>/g, ' ');
    if (!at) continue;
    const [special] = numbers(body, '特別獎');
    const [grand] = numbers(body, '特獎');
    const first = numbers(body, '頭獎');
    if (!special || !grand || first.length < 1) continue;
    draws.push({ period: `${at[1].padStart(3, '0')}${at[2].padStart(2, '0')}`, special, grand, first });
  }
  if (!draws.length) throw new Error('invoice RSS: no draws');
  return draws.sort((a, b) => b.period.localeCompare(a.period));
}

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

export async function invoiceResponse(url, fetchFn = fetch) {
  try {
    if (url.pathname === '/win.json') {
      const res = await fetchFn(WIN_RSS, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(8000) });
      if (!res.ok) return json({ error: `upstream ${res.status}` }, 502);
      return json({ draws: parseWins(await res.text()) });
    }
    if (url.pathname === '/seller.json') {
      const ids = [...new Set((url.searchParams.get('ids') || '').split(','))].filter(id => /^\d{8}$/.test(id));
      if (!ids.length || ids.length > MAX_IDS) return json({ error: 'ids' }, 400);
      const sellers = {};
      await Promise.all(
        ids.map(async id => {
          const res = await fetchFn(`${GCIS}?$format=json&$filter=Business_Accounting_NO eq ${id}&$skip=0&$top=1`, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(8000) });
          if (!res.ok) throw new Error(`upstream ${res.status}`);
          const text = await res.text();
          const row = text.trim() ? JSON.parse(text)?.[0] : null;
          if (row?.Company_Name) sellers[id] = String(row.Company_Name).trim();
        })
      );
      return json({ sellers });
    }
    return json({ error: 'not found' }, 404);
  } catch (error) {
    return json({ error: String(error?.message || error) }, 502);
  }
}
