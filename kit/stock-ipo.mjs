// 新股申購（抽籤）: Taiwan's public subscriptions, as a broker's app has them
// (the owner's economy review, 2026-10-18: a weekday has nothing in it that
// can win; this is Taiwan's own weekday ritual). TWSE's list of every
// subscription (上市、上櫃, IPOs and cash offerings), real dates and prices:
// apply in the window (申購開始日–申購結束日) for one unit (申購股數, mostly
// 1,000 shares) at the offer price (承銷價), NT$20 處理費; the draw
// (抽籤日期) is won at TWSE's own published rate (中籤率); a win's shares
// arrive on the listing day (撥券日期) with NT$50 中籤通知郵寄工本費; a
// loss gets its money back the day after the draw, less the fee.
//
// Who wins is the proxy's alone (stock-fill.js): a keyed hash of the account
// and the issue against the rate (ipoWon), so the phone can't know it before
// the proxy says, nor choose it, and the checker (stock-check.js) works it
// out again the same way. One application per account per issue, and only
// one the proxy saw in its window counts (asked after the draw, it says nothing).
// No imports: the Worker loads this file too.

export const IPO_FEE = 20;
export const IPO_WIN_FEE = 50;
export const IPO_URL = 'https://www.twse.com.tw/rwd/zh/announcement/publicForm?response=json';
const DAY = 86_400_000;
const TPE = 8 * 3_600_000;

// '115/10/22' (民國) → that day's Taipei midnight (ms), or null.
export function rocDay(text) {
  const m = /^(\d{2,3})\/(\d{1,2})\/(\d{1,2})$/.exec(String(text || '').trim());
  if (!m) return null;
  return Date.UTC(Number(m[1]) + 1911, Number(m[2]) - 1, Number(m[3])) - TPE;
}
// A figure in TWSE's list, or null: blank (a cell not filled in yet) is
// no figure, not 0 (Number('') is 0: a blank 實際承銷價 dropped the issue).
const num = text => {
  const s = String(text ?? '').replace(/,/g, '').trim();
  const v = s ? Number(s) : NaN;
  return Number.isFinite(v) ? v : null;
};

// TWSE's list (its JSON's fields, by name) → the subscriptions in shares:
// { code, name, symbol, market, kind, from, to, draw, list, price, qty, rate }
// (dates as Taipei midnights; `to` the last day; `rate` the share of
// applications that won, 0–1, once published; `price` the offer price, the
// final one where it's set). Bonds and cancelled ones left out.
export function parseIpoList(json) {
  const fields = json?.fields || [];
  const at = name => fields.findIndex(f => String(f).trim() === name);
  const col = {
    draw: at('抽籤日期'), name: at('證券名稱'), code: at('證券代號'), kind: at('發行市場'), from: at('申購開始日'), to: at('申購結束日'),
    price: at('承銷價(元)'), real: at('實際承銷價(元)'), list: at('撥券日期(上市、上櫃日期)'), qty: at('申購股數'), rate: at('中籤率(%)'), cancel: fields.findIndex(f => /取消/.test(f))
  };
  if (col.code < 0 || col.draw < 0) return [];
  const out = [];
  for (const r of json?.data || []) {
    const code = String(r[col.code] || '').trim();
    const kind = String(r[col.kind] || '').trim();
    // Shares only: 4-digit codes (6-digit warrants, bonds' letters out), not cancelled.
    if (!/^\d{4}$/.test(code) || /債/.test(kind) || (col.cancel >= 0 && String(r[col.cancel] || '').trim())) continue;
    const [draw, from, to, list] = [rocDay(r[col.draw]), rocDay(r[col.from]), rocDay(r[col.to]), rocDay(r[col.list])];
    // The final offer price where it's set (未訂出, blank or 0 until then), else the announced one.
    const price = [num(r[col.real]), num(r[col.price])].find(v => v > 0) ?? null;
    const qty = num(r[col.qty]);
    if (draw == null || from == null || to == null || !(price > 0) || !(qty > 0)) continue;
    const rate = num(r[col.rate]);
    const otc = /櫃/.test(kind);
    out.push({ code, name: String(r[col.name] || '').trim(), symbol: `${code}.${otc ? 'TWO' : 'TW'}`, market: 'TW', kind, ipo: /^初上/.test(kind), from, to, draw, list, price, qty, rate: rate > 0 ? Math.min(1, Math.round(rate * 1e4) / 1e6) : null });
  }
  return out;
}

// A first listing's listing day (Taipei midnight) for `symbol` in the list
// (parseIpoList), or null: 初上市 and 初上櫃 (創新板's and 第一上市's too), whose
// shares trade with no daily price limit for their first five trading days
// (stock-markets.mjs newListing; a cash offering's shares already trade).
// Set it on the quote (quote.listed) so the order rules see it.
export function listedOn(list, symbol) {
  const s = (list || []).find(x => x.symbol === symbol && /初上/.test(x.kind) && x.list != null);
  return s ? s.list : null;
}

// What an application holds: the shares at the offer price and the fee.
export const ipoHold = s => Math.round(s.price * s.qty) + IPO_FEE;
// Open for applications now (from the first day's 09:00 to the last day's 14:00, Taipei).
export const ipoOpen = (s, now = Date.now()) => now >= s.from + 9 * 3_600_000 && now < s.to + 14 * 3_600_000;
// The draw's result is out (the rate published, its day begun).
export const ipoDrawn = (s, now = Date.now()) => s.rate != null && now >= s.draw;
// When a lost application's money comes back (the next day, 09:00) and a won one's shares arrive (the listing day, 09:00).
export const ipoBackAt = s => s.draw + DAY + 9 * 3_600_000;
export const ipoListAt = s => (s.list ?? s.draw + 7 * DAY) + 9 * 3_600_000;

// The draw: a keyed hash's first 32 bits (hex) as a share of 2³², under the rate.
export function ipoWon(hashHex, rate) {
  if (!(rate > 0)) return false;
  if (rate >= 1) return true;
  return parseInt(String(hashHex).slice(0, 8), 16) / 2 ** 32 < rate;
}
// What the hash is of: the account and the issue (its code and draw day).
export const ipoDrawKey = (account, s) => `ipo:${account}:${s.code}:${s.draw}`;

// The account's events for a subscription.
export const ipoApplyEvent = (s, t) => ({ id: `ipo:${s.code}:${s.draw}`, type: 'ipo', t, code: s.code, name: s.name, symbol: s.symbol, market: 'TW', kind: 'stock', currency: 'TWD', price: s.price, qty: s.qty, fee: IPO_FEE, draw: s.draw, list: s.list });
export const ipoBackEvent = apply => ({ id: `ipoback:${apply.code}:${apply.draw}`, type: 'ipoback', t: ipoBackAt(apply), code: apply.code, draw: apply.draw, amount: Math.round(apply.price * apply.qty) });
export const ipoWinEvent = apply => ({ id: `ipowin:${apply.code}:${apply.draw}`, type: 'ipowin', t: ipoListAt(apply), code: apply.code, draw: apply.draw, symbol: apply.symbol, name: apply.name, market: 'TW', kind: 'stock', currency: 'TWD', price: apply.price, qty: apply.qty, fee: IPO_WIN_FEE });
