// ---- kit/format.mjs: numbers, money, prices, in the page's language ----
// The general formatters (Securities' format.mjs without its own): one
// DASH for a value that's missing, and a sign only on a figure that shows
// one: whatever rounds to nothing prints bare (NT$0, 0.00%), never +NT$0
// or −NT$0 (quadra.mjs money() keeps the same rule for NT$ play money).
//
//   import { DASH, money, pct, price, num, compact, setFormatLocale, twDay, twMonth, finiteOr0 } from '#kit/format.mjs';
// Each currency's symbol and decimals, as stock-markets.mjs CURRENCIES has
// them (a test keeps them equal); kept here so an app that only shows NT$
// doesn't load the markets' tables.
export const SYMBOLS = {
  TWD: ['NT$', 0], USD: ['US$', 2], JPY: ['¥', 0], HKD: ['HK$', 2], CNY: ['CN¥', 2], KRW: ['₩', 0], EUR: ['€', 2],
  GBP: ['£', 2], CHF: ['CHF ', 2], DKK: ['kr ', 2], CAD: ['C$', 2], AUD: ['A$', 2], SGD: ['S$', 2], INR: ['₹', 2]
};
const currencyInfo = code => {
  const [symbol, digits] = SYMBOLS[code || 'TWD'] || [`${code} `, 2];
  return { symbol, digits };
};

// What stands in for a missing value.
export const DASH = '—';

let locale = 'zh';
const cache = new Map();
// The page's language ('zh' or 'en'): decides the grouping and the short forms.
export function setFormatLocale(l) {
  locale = l;
  cache.clear();
}
const tag = () => (locale === 'zh' ? 'zh-TW' : 'en-US');
function nf(min, max) {
  const key = `${min}/${max}`;
  if (!cache.has(key)) cache.set(key, new Intl.NumberFormat(tag(), { minimumFractionDigits: min, maximumFractionDigits: max }));
  return cache.get(key);
}

// A plain number with up to `digits` decimals (at least `min`).
export const num = (n, digits = 0, min = digits) => (Number.isFinite(n) ? nf(min, digits).format(n) : DASH);

// NT$1,234 · US$12.50 · −€3.20 · +NT$500 (with sign: true).
export function money(amount, currency, { sign = false, digits } = {}) {
  if (!Number.isFinite(amount)) return DASH;
  const info = currencyInfo(currency);
  const d = digits ?? info.digits;
  const body = `${info.symbol}${nf(d, d).format(Math.abs(amount))}`;
  // A sign only on what shows a figure: NT$0.4 is NT$0 (never +NT$0 or −NT$0).
  const shows = Math.abs(amount) >= 0.5 * 10 ** -d;
  if (amount < 0 && shows) return `−${body}`;
  return sign && amount > 0 && shows ? `+${body}` : body;
}

// A price: as many decimals as it needs (0.000012 for a tiny coin).
// `short`: for a small card, no cents from 1,000 up (83,415, not 83,415.00).
export function price(p, currency, { short = false } = {}) {
  if (!Number.isFinite(p)) return DASH;
  const a = Math.abs(p);
  // Under 10, four decimals where they exist (exchange rates: 1.1402).
  const max = a >= 1000 ? (short ? 0 : 2) : a >= 10 ? (currencyInfo(currency).digits === 0 && a >= 100 ? 2 : 3) : a >= 0.01 ? 4 : 8;
  // NT$ prices with their two decimals too, as Taiwan's brokers show them
  // (2,550.00 · 325.50 · 67.30): a list's prices end in line.
  // (A NT$ price under 1 too: a warrant's 0.80, not 0.8.)
  const min = (a >= 1 && currencyInfo(currency).digits > 0) || (currency === 'TWD' && a > 0) ? 2 : 0;
  return nf(Math.min(min, max), max).format(p);
}

// A share as a percent: pct(0.0123) is +1.23% (x is 1 for 100%). `sign: false`
// leaves out the plus; a loss keeps its −. Rounds to zero: no sign.
export function pct(x, { digits = 2, sign = true } = {}) {
  if (!Number.isFinite(x)) return DASH;
  const body = `${nf(digits, digits).format(Math.abs(x) * 100)}%`;
  const shows = Math.abs(x) * 100 >= 0.5 * 10 ** -digits;
  if (x < 0 && shows) return `−${body}`;
  return sign && x > 0 && shows ? `+${body}` : body;
}

// Short forms for chart axes and tight cards: 1.2萬 / 3.4億 in Chinese, 12K / 3.4M in English.
export function compact(n) {
  if (!Number.isFinite(n)) return DASH;
  const a = Math.abs(n);
  const s = n < 0 ? '−' : '';
  if (locale === 'zh') {
    if (a >= 1e12) return `${s}${nf(0, a >= 1e14 ? 0 : 2).format(a / 1e12)}兆`;
    if (a >= 1e8) return `${s}${nf(0, a >= 1e10 ? 0 : 2).format(a / 1e8)}億`;
    if (a >= 1e4) return `${s}${nf(0, a >= 1e6 ? 0 : 1).format(a / 1e4)}萬`;
    return `${s}${nf(0, a < 10 ? 2 : 0).format(a)}`;
  }
  if (a >= 1e12) return `${s}${nf(0, 2).format(a / 1e12)}T`;
  if (a >= 1e9) return `${s}${nf(0, 1).format(a / 1e9)}B`;
  if (a >= 1e6) return `${s}${nf(0, 1).format(a / 1e6)}M`;
  if (a >= 1e4) return `${s}${nf(0, 0).format(a / 1e3)}K`;
  return `${s}${nf(0, a < 10 ? 2 : 0).format(a)}`;
}

// Taiwan's calendar day of a time: 'YYYY-MM-DD' ('' for no time at all: an
// invalid date or text is no day, never a thrown error). A date-time string
// counts as its moment. Taiwan has no daylight saving time.
export function twDay(t) {
  if (typeof t === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const ms = t instanceof Date ? t.getTime() : typeof t === 'string' ? Date.parse(t) : Number(t);
  return Number.isFinite(ms) ? new Date(ms + 8 * 3_600_000).toISOString().slice(0, 10) : '';
}
// Its month, 'YYYY-MM'.
export const twMonth = t => twDay(t).slice(0, 7);
// The calendar day `n` days from a day ('YYYY-MM-DD'; n may be negative).
export const addDays = (day, n) => new Date(Date.parse(`${day}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

// A finite number as it is, anything else 0.
export const finiteOr0 = v => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
