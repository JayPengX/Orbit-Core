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
//   only when a new filing lands in it (stock/filings/seen-v2.json: the ids of
//   the past week, by day).
export const TWSE_FILINGS = 'https://openapi.twse.com.tw/v1/opendata/t187ap04_L';
export const TPEX_FILINGS = 'https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap04_O';
export const bucketOf = code => `stock/filings/${String(code).slice(-2).padStart(2, '0')}.json`;
// (v2, 11-20: rows parsed again once, a value's "0.91%" line no longer row 0.)
const SEEN = 'stock/filings/seen-v2.json';
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
// (A hint is any bracket of 5 or more characters: （含付款期間及金額）, while
// （息） and (仟元) stay; a label too long still is cut with an ellipsis.)
const label = k =>
  k
    .replace(/\s+/g, '')
    .replace(/[（(][請如][^）)]*[）)]/g, '')
    .replace(/[（(][^（()）]{5,}[）)]/g, '')
    .replace(/\(X{2,}.*$/, '')
    .replace(/^1月1日累計至本期止/, '今年累計')
    .replace(/[:：]$/, '');
const value = v => v.replace(/\s+/g, ' ').replace(/^\(([\d,.]+)\)$/, '−$1').replace(/。$/, '');
// The 說明 as rows: "1.label:value" each, a line without a number joined to the one before.
// After the first, a number starts a row only as the next one (one skipped allowed), never
// a decimal: a value's own line "0.91%；0.94%" or "0.01元" isn't row 0 (2330, 11-20).
export function rowsOf(text) {
  const rows = [];
  let n = 0;
  for (const raw of clean(text).split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const m = /^(\d{1,2})\s*[.、．](?!\d)\s*(.*)$/.exec(line);
    if (m && (!n || (+m[1] > n && +m[1] <= n + 2))) {
      n = +m[1];
      rows.push(m[2]);
    } else if (rows.length) rows[rows.length - 1] += line;
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
      .map(([k, v]) => [k.length > 40 ? `${k.slice(0, 39)}…` : k, v.slice(0, 160)])
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

// A list not in by then is a failure (the run's note says which): TPEx's
// gave the Worker no answer at all (189 of the week's runs to 2026-11-18),
// and each of the 48 runs a day waited it out, ~55 s of the Runner's time
// (Durable Objects are billed by the time they're awake) for nothing.
export const LIST_MS = 15_000;
// TPEx's list as GitHub read it (tools/news-clips.mjs, run every half hour or
// so): TPEx answers GitHub's machines, not Cloudflare's, so from about
// 2026-11-14 上櫃 companies' filings were missing. Taken while under 12 hours
// old (a filing is news for a week); TPEx itself is never asked from here: it
// timed out each time the copy was past 2 hours, 15 s of the Runner, and
// marked the source broken (mailed to Jay, 11-24). No copy that new: 'old copy', TWSE's alone.
export const TPEX_COPY = 'stock/filings/tpex-list.json';
export const TPEX_COPY_MS = 12 * 3_600_000;
export async function runFilings({ store, now = Date.now(), get = (u, init) => fetch(u, init), listMs = LIST_MS }) {
  const why = [];
  const copy = await store.json(TPEX_COPY).catch(() => null);
  const copied = copy && now - copy.at < TPEX_COPY_MS && Array.isArray(copy.rows) ? copy.rows : null;
  const twse = await get(TWSE_FILINGS, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(listMs) })
    .then(r => (r.ok ? r.json() : ((why[0] = `${r.status}`), null)))
    .catch(e => ((why[0] = String(e?.message || e).slice(0, 60)), null));
  const lists = [twse, copied];
  // (Why each list wasn't read, in the run's note: the admin panel's 系統, free-watch.)
  if (!lists.some(Array.isArray)) return { failed: `lists: TWSE ${why[0] || '?'}, TPEx ${copy ? 'old copy' : 'no copy'}` };
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
  return { listed: all.length, fresh: fresh.length, buckets: by.size, tpex: copied ? 'copy' : 'old copy' };
}
