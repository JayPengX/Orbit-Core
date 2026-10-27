// The 載具's invoices as 財政部's 電子發票整合服務平台 exports them (查詢消費發票
// › 匯出, a CSV it emails). A person can't have the platform's AppID, so this
// file is how a 載具's invoices reach Orbit Money: picked in the app, or
// forwarded to the account's own mail address (the Worker's email handler,
// money-mail.js). Pure; both read it.
//
// The layouts: '|'-separated M (invoice) and
// D (item) rows under 表頭=/明細= lines naming their columns, or a plain CSV
// with a header row and one row per item. Columns are found by their names, so
// either layout (and the platform's next one, most likely) reads.

// A file's bytes as text: UTF-8 when it is, else Big5 (older exports).
export function csvText(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(u8).replace(/^\uFEFF/, '');
  } catch {
    return new TextDecoder('big5').decode(u8);
  }
}
const cells = (line, sep) => {
  if (sep === '|') return line.split('|').map(c => c.trim());
  const out = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i + 1] === '"') (cur += '"'), i++;
      else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === sep) out.push(cur.trim()), (cur = '');
    else cur += c;
  }
  out.push(cur.trim());
  return out;
};
// A date cell as yyyy-mm-dd: 20261005, 2026/10/05, 115/10/05, 1151005.
export function csvDay(s) {
  const t = String(s || '').trim();
  let m = /^(\d{4})[/.-]?(\d{1,2})[/.-]?(\d{1,2})/.exec(t);
  let y;
  if (m && Number(m[1]) > 1911) y = Number(m[1]);
  else if ((m = /^(\d{2,3})[/.-](\d{1,2})[/.-](\d{1,2})/.exec(t) || /^(\d{3})(\d{2})(\d{2})$/.exec(t))) y = Number(m[1]) + 1911;
  else return '';
  const day = `${y}-${String(m[2]).padStart(2, '0')}-${String(m[3]).padStart(2, '0')}`;
  return /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(day) ? day : '';
}
const num = s => {
  const t = String(s ?? '').replace(/[,\s$NT元]/g, '');
  return t && Number.isFinite(Number(t)) ? Number(t) : NaN;
};
// Which column holds what, from a header's names.
const COLS = {
  no: /發票號碼|invoice\s*n/i,
  day: /日期|date/i,
  sid: /統一?編號?|統編|seller.*(id|ban)/i,
  seller: /店名|賣方名稱|商店名稱|seller\s*name|store/i,
  total: /總金額|發票金額|^金額$|total/i,
  status: /狀態|status/i,
  name: /品名|品項|item/i,
  qty: /數量|qty|quantity/i,
  price: /單價|unit/i,
  sub: /小計|明細_金額|消費明細_金額|amount/i
};
function mapCols(names) {
  const at = {};
  names.forEach((n, i) => {
    for (const [k, re] of Object.entries(COLS)) {
      if (k in at || !re.test(n)) continue;
      // 統編 of the buyer or the 載具 isn't the seller's.
      if (k === 'sid' && /買方|載具/.test(n)) continue;
      if (k === 'total' && /明細|小計|單價/.test(n)) continue;
      at[k] = i;
      break;
    }
  });
  return at;
}
const M_COLS = ['M', '載具名稱', '載具號碼', '發票日期', '商店統編', '商店店名', '發票號碼', '總金額', '發票狀態'];
const D_COLS = ['D', '發票號碼', '小計', '品項名稱'];
const noOf = s => String(s || '').replace(/[-\s]/g, '').toUpperCase();
const NO = /^[A-Z]{2}\d{8}$/;

// The file's invoices: [{ no, day, sid, seller, total, items: [{ name, qty, price }], void }].
export function parseCarrierCsv(text) {
  const lines = String(text || '').split(/\r?\n/).filter(l => l.trim());
  const sep = lines.some(l => /^(表頭=)?M\|/.test(l.trim())) ? '|' : lines.filter(l => l.includes('\t')).length > lines.length / 2 ? '\t' : ',';
  const byNo = new Map();
  const get = no => byNo.get(no) || byNo.set(no, { no, day: '', sid: '', seller: '', total: NaN, items: [], void: false }).get(no);
  const item = (inv, at, row) => {
    const name = row[at.name] || '';
    if (!name) return;
    const qty = num(row[at.qty]);
    const sub = num(row[at.sub]);
    const price = num(row[at.price]);
    const q = Number.isFinite(qty) && qty > 0 ? qty : 1;
    inv.items.push({ name, qty: q, price: Number.isFinite(price) ? price : Number.isFinite(sub) ? Math.round((sub / q) * 100) / 100 : 0 });
  };
  const head = (inv, at, row) => {
    inv.day ||= csvDay(row[at.day]);
    inv.sid ||= /^\d{8}$/.test(row[at.sid] || '') ? row[at.sid] : '';
    inv.seller ||= row[at.seller] || '';
    if (!Number.isFinite(inv.total)) inv.total = num(row[at.total]);
    if (/作廢|註銷|void|cancel/i.test(row[at.status] || '')) inv.void = true;
  };
  if (sep === '|') {
    let m = mapCols(M_COLS);
    let d = mapCols(D_COLS);
    for (const line of lines) {
      const t = line.trim();
      if (/^表頭=/.test(t)) m = mapCols(t.replace(/^表頭=/, '').split('|'));
      else if (/^明細=/.test(t)) d = mapCols(t.replace(/^明細=/, '').split('|'));
      else if (t.startsWith('M|')) {
        const row = cells(t, '|');
        const no = noOf(row[m.no]);
        if (NO.test(no)) head(get(no), m, row);
      } else if (t.startsWith('D|')) {
        const row = cells(t, '|');
        const no = noOf(row[d.no]);
        if (NO.test(no)) item(get(no), d, row);
      }
    }
  } else {
    // The header: the first row naming an invoice-number column.
    const hi = lines.findIndex(l => COLS.no.test(l));
    if (hi < 0) return [];
    const at = mapCols(cells(lines[hi], sep));
    for (const line of lines.slice(hi + 1)) {
      const row = cells(line, sep);
      const no = noOf(row[at.no]);
      if (!NO.test(no)) continue;
      const inv = get(no);
      head(inv, at, row);
      item(inv, at, row);
    }
  }
  const out = [];
  for (const inv of byNo.values()) {
    if (!inv.day) continue;
    if (!Number.isFinite(inv.total)) inv.total = Math.round(inv.items.reduce((s, i) => s + i.qty * i.price, 0));
    if (!(inv.total > 0)) continue;
    out.push(inv);
  }
  return out.sort((a, b) => a.day.localeCompare(b.day) || a.no.localeCompare(b.no));
}
