// 重大訊息白話 (Orbit Securities, the family's AI plan): each listed or OTC
// company's 重大訊息, read from TWSE's and TPEx's open data (the day's and
// the day before's, every list), parsed by code into rows: each numbered
// "N.label:value" line of the 說明 a row, the empty and the boilerplate
// ones (不適用, 無, 與公司關係…) left out. Securities draws them on a
// stock's page; the AI's plain line (ai-features.js 'sec-filing') is asked
// there, once a filing, and kept for everyone (ai.js `shared`).
//
// → stock/filings/<last two digits of the code>.json:
//   { built, codes: { '<code>': [{ id, at, title, rows: [[label, value]] }] } }
//   newest first, a week's, at most 8 a code. A bucket is read and written
//   only when a new filing lands in it (stock/filings/seen.json: the ids of
//   the past week, by day).
export const TWSE_FILINGS = 'https://openapi.twse.com.tw/v1/opendata/t187ap04_L';
export const TPEX_FILINGS = 'https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap04_O';
export const bucketOf = code => `stock/filings/${String(code).slice(-2).padStart(2, '0')}.json`;
const SEEN = 'stock/filings/seen.json';
const WEEK = 7 * 86_400_000;

// 1151110 + 65705 → 2026-11-10T06:57:05+08:00 (the ROC year).
export function rocAt(day, time) {
  const d = String(day || '').trim();
  const m = /^(\d{3})(\d{2})(\d{2})$/.exec(d);
  if (!m) return null;
  const t = String(time || '0').trim().padStart(6, '0');
  return `${Number(m[1]) + 1911}-${m[2]}-${m[3]}T${t.slice(0, 2)}:${t.slice(2, 4)}:${t.slice(4, 6)}+08:00`;
}

const clean = s =>
  String(s || '')
    .replace(/\r/g, '')
    .replace(/[ \t　]+/g, ' ')
    .trim();
// (Rows that tell nothing: the same on every filing, or empty.)
const DULL = /^(事實發生日|與公司關係|相互持股比例|因應措施|發生緣由|其他應敘明事項|提報董事會或經董事會決議日期|審計委員會通過日期|董事會決議日期)/;
const EMPTY = /^(不適用|無|NA|N\/A|none|－|-|—|無。|不適用。)$/i;

// A label without the form's own hints; a value's (1,234) as −1,234.
const label = k =>
  k
    .replace(/\s+/g, '')
    .replace(/[（(][請如][^）)]*[）)]/g, '')
    .replace(/\(X{2,}.*$/, '')
    .replace(/^1月1日累計至本期止/, '今年累計')
    .replace(/[:：]$/, '');
const value = v => v.replace(/\s+/g, ' ').replace(/^\(([\d,.]+)\)$/, '−$1').replace(/。$/, '');
// The 說明 as rows: "1.label:value" each, a line without a number joined to the one before.
export function rowsOf(text) {
  const rows = [];
  for (const raw of clean(text).split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const m = /^(\d{1,2})\s*[.、．]\s*(.*)$/.exec(line);
    if (m) rows.push(m[2]);
    else if (rows.length) rows[rows.length - 1] += line;
    else rows.push(line);
  }
  const pair = r => {
    const i = r.search(/[:：]/);
    return i > 0 ? [r.slice(0, i).trim(), r.slice(i + 1).trim()] : ['', r.trim()];
  };
  return (
    rows
      .map(pair)
      // ("(1)名稱:…(2)金額:…" under one number: a row each.)
      .flatMap(([k, v]) =>
        /^\(\d{1,2}\)/.test(v)
          ? v
              .split(/(?=\(\d{1,2}\))/)
              .map(x => x.replace(/^\(\d{1,2}\)\s*/, ''))
              .map(x => (/[:：]/.test(x) ? pair(x) : [k, x]))
          : [[k, v]]
      )
      .map(([k, v]) => [label(k), value(v)])
      .filter(([k, v]) => v && !EMPTY.test(v) && !DULL.test(k) && (k || v.length >= 6))
      .map(([k, v]) => [k.slice(0, 30), v.slice(0, 160)])
      .slice(0, 12)
  );
}

// One filing from either list's row (TWSE's keys and TPEx's differ a little).
export function filingOf(r) {
  const code = String(r['公司代號'] || r.SecuritiesCompanyCode || '').trim();
  const at = rocAt(r['發言日期'], r['發言時間']);
  const title = clean(r['主旨 '] ?? r['主旨']).replace(/\n/g, '');
  if (!/^\d{4,6}[A-Z]?$/.test(code) || !at || !title) return null;
  return { code, id: `${code}-${at.slice(0, 19).replace(/\D/g, '')}`, at, title: title.slice(0, 160), rows: rowsOf(r['說明']) };
}

export async function runFilings({ store, now = Date.now(), get = u => fetch(u, { headers: { Accept: 'application/json' } }) }) {
  const why = [];
  const lists = await Promise.all(
    [TWSE_FILINGS, TPEX_FILINGS].map((u, i) =>
      get(u)
        .then(r => (r.ok ? r.json() : ((why[i] = `${r.status}`), null)))
        .catch(e => ((why[i] = String(e?.message || e).slice(0, 60)), null))
    )
  );
  // (Why each list wasn't read, in the run's note: the admin panel's 系統, free-watch.)
  if (!lists.some(Array.isArray)) return { failed: `lists: TWSE ${why[0] || '?'}, TPEx ${why[1] || '?'}` };
  const all = lists.flatMap(l => (Array.isArray(l) ? l : [])).map(filingOf).filter(Boolean);
  const seen = (await store.json(SEEN)) || { ids: {} };
  const fresh = all.filter(f => !(f.id in seen.ids) && now - Date.parse(f.at) < WEEK);
  const by = new Map();
  for (const f of fresh) by.set(bucketOf(f.code), [...(by.get(bucketOf(f.code)) || []), f]);
  for (const [path, list] of by) {
    const doc = (await store.json(path)) || { codes: {} };
    for (const { code, ...f } of list) doc.codes[code] = [f, ...(doc.codes[code] || []).filter(x => x.id !== f.id)];
    for (const code of Object.keys(doc.codes)) {
      doc.codes[code] = doc.codes[code]
        .filter(x => now - Date.parse(x.at) < WEEK)
        .sort((a, b) => b.at.localeCompare(a.at))
        .slice(0, 8);
      if (!doc.codes[code].length) delete doc.codes[code];
    }
    await store.put(path, { built: now, codes: doc.codes });
  }
  for (const f of fresh) seen.ids[f.id] = f.at.slice(0, 10);
  const cut = new Date(now - WEEK - 86_400_000).toISOString().slice(0, 10);
  for (const [id, day] of Object.entries(seen.ids)) if (day < cut) delete seen.ids[id];
  if (fresh.length) await store.put(SEEN, { ids: seen.ids });
  return { listed: all.length, fresh: fresh.length, buckets: by.size };
}
