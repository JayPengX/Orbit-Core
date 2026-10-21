// Currencies, markets, what kind of thing a symbol is, and what trading it
// costs. Everything the account needs to know about a place to trade, in one
// table each, so the guide can show the very numbers the orders use.

// Wallet currencies. `spread`: what a Taiwan bank's online FX desk keeps on
// each exchange, as a share of the amount (the gap between its buy and sell
// rates, halved). `loanRate`: yearly interest on money borrowed in it.
import { isTradingDay, earlyClose } from '#kit/stock-holidays.mjs';
import { HK_LOT_TABLE } from '#kit/stock-hk-lots.mjs';
import { TOPIX500, JP_ETF_UNITS } from '#kit/stock-jp-lists.mjs';

export const CURRENCIES = {
  TWD: { symbol: 'NT$', digits: 0, spread: 0, loanRate: 0.065, zh: '新台幣', en: 'Taiwan dollar', flag: '🇹🇼' },
  USD: { symbol: 'US$', digits: 2, spread: 0.002, loanRate: 0.075, zh: '美元', en: 'US dollar', flag: '🇺🇸' },
  JPY: { symbol: '¥', digits: 0, spread: 0.006, loanRate: 0.03, zh: '日圓', en: 'Japanese yen', flag: '🇯🇵' },
  HKD: { symbol: 'HK$', digits: 2, spread: 0.005, loanRate: 0.07, zh: '港幣', en: 'Hong Kong dollar', flag: '🇭🇰' },
  CNY: { symbol: 'CN¥', digits: 2, spread: 0.005, loanRate: 0.05, zh: '人民幣', en: 'Chinese yuan', flag: '🇨🇳' },
  KRW: { symbol: '₩', digits: 0, spread: 0.008, loanRate: 0.06, zh: '韓元', en: 'Korean won', flag: '🇰🇷' },
  EUR: { symbol: '€', digits: 2, spread: 0.004, loanRate: 0.06, zh: '歐元', en: 'Euro', flag: '🇪🇺' },
  GBP: { symbol: '£', digits: 2, spread: 0.0035, loanRate: 0.07, zh: '英鎊', en: 'British pound', flag: '🇬🇧' },
  CHF: { symbol: 'CHF ', digits: 2, spread: 0.0035, loanRate: 0.04, zh: '瑞士法郎', en: 'Swiss franc', flag: '🇨🇭' },
  // Yahoo has no DKK/TWD pair: priced through US$ (USDDKK=X).
  DKK: { cross: true, symbol: 'kr ', digits: 2, spread: 0.005, loanRate: 0.06, zh: '丹麥克朗', en: 'Danish krone', flag: '🇩🇰' },
  CAD: { symbol: 'C$', digits: 2, spread: 0.0035, loanRate: 0.065, zh: '加幣', en: 'Canadian dollar', flag: '🇨🇦' },
  AUD: { symbol: 'A$', digits: 2, spread: 0.0035, loanRate: 0.07, zh: '澳幣', en: 'Australian dollar', flag: '🇦🇺' },
  SGD: { symbol: 'S$', digits: 2, spread: 0.0035, loanRate: 0.055, zh: '新加坡幣', en: 'Singapore dollar', flag: '🇸🇬' },
  INR: { symbol: '₹', digits: 2, spread: 0.01, loanRate: 0.1, zh: '印度盧比', en: 'Indian rupee', flag: '🇮🇳' }
};
export const BASE = 'TWD';
// A currency not in the table (a stock found by search trades in it) still
// works: its rate comes from the same feed, at a wider spread.
const OTHER_CURRENCY = { digits: 2, spread: 0.01, loanRate: 0.1, flag: '🏳️' };

export function currencyInfo(code) {
  return CURRENCIES[code] || { ...OTHER_CURRENCY, symbol: `${code} `, zh: code, en: code };
}

// Weekends and other hours the FX market is shut, banks still exchange, at
// twice their usual spread (they can't hedge until it reopens).
export const CLOSED_FX_MULTIPLIER = 2;

// Yahoo quotes some markets in a minor unit (London in pence, US grain and
// coffee futures in cents).
const MINOR_UNITS = { GBp: ['GBP', 100], GBX: ['GBP', 100], USX: ['USD', 100], ZAc: ['ZAR', 100], ILA: ['ILS', 100] };
export function normalizeCurrency(code) {
  const minor = MINOR_UNITS[code];
  return minor ? { currency: minor[0], factor: minor[1] } : { currency: code || 'USD', factor: 1 };
}

// Where each symbol trades and what it costs there. `commission`: the
// broker's cut both ways (`kinds`: a kind's own, `flat` a trade, to `until`),
// with its minimum in the market's currency (Taiwan
// brokers' usual 0.1425%, their sub-brokerage 複委託 rates abroad; the
// minimums an online order pays at Taiwan brokers: 中國信託 (2026-09-29)
// ¥3,000 and HK$50, 兆豐 €35, £75, CHF 45, C$20, A$40, S$45, ₩35,000). `buy` and
// `sell`: taxes and exchange fees by kind of security (`all` for every kind).
// `withholding`: tax kept from dividends paid to a Taiwan resident, as a
// broker's 複委託 account has it withheld (兆豐: Japan 15.315%, France 25%;
// a treaty's lower rate isn't claimed through it).
// `delay`: minutes Yahoo's prices from this market run behind (Yahoo's own
// exchangeDataDelayedBy): US stocks, forex and crypto are live; Taiwan,
// Tokyo, Seoul and Sydney 20 minutes; most others 15; unknown markets 15.
// Tax rates that end on a date in law (證券交易稅條例 §2-1, §2-2): the
// first moment (Taiwan time) they no longer apply.
export const BOND_ETF_TAX_FREE_UNTIL = Date.parse('2027-01-01T00:00:00+08:00');
// Corporate bonds (可轉債 among them) pay no securities transaction tax to
// 2026-12-31 (證券交易稅條例 §2-1), 0.1% after.
export const CORP_BOND_TAX_FREE_UNTIL = Date.parse('2027-01-01T00:00:00+08:00');
export const DAY_TRADE_TAX_UNTIL = Date.parse('2028-01-01T00:00:00+08:00');
export const PLAN_FLAT_FEE_UNTIL = Date.parse('2027-01-01T00:00:00+08:00');
// 國泰證券's US prices to 2026-12-31 (經濟日報 2026-01-06): a stock 0.08%
// with no minimum, an ETF US$3 a trade, a monthly plan's buy US$0.1.
export const US_FEE_PROMO_UNTIL = Date.parse('2027-01-01T00:00:00+08:00');
export const MARKETS = {
  TW: {
    delay: 20, zh: '台股', en: 'Taiwan', flag: '🇹🇼', currency: 'TWD', suffixes: ['.TW', '.TWO'],
    // Odd lots (零股): most brokers' minimum is NT$1, not 20. A stock sold the
    // day it was bought (當沖) pays half the tax, 0.15%, to 2027-12-31
    // (證券交易稅條例 §2-2); bond ETFs pay none to 2026-12-31 (§2-1), then
    // 0.1% (§2). (An extension of either is the Legislative Yuan's: move the date.)
    commission: { rate: 0.001425, min: 20, oddMin: 1 }, floorFees: true,
    // A monthly plan's buy (定期定額): NT$1 a trade, whatever its size, at
    // 國泰, 元大 and 永豐 to 2026-12-31 (money101, 2026-08); then the plan
    // rate brokers post, 0.1425% with a NT$1 minimum (國票 點點投 Q13).
    plan: { flat: 1, flatUntil: PLAN_FLAT_FEE_UNTIL, rate: 0.001425, min: 1 },
    sell: { stock: { tax: 0.003, dayTrade: 0.0015, dayTradeUntil: DAY_TRADE_TAX_UNTIL }, etf: { tax: 0.001 }, bond: { tax: 0, until: BOND_ETF_TAX_FREE_UNTIL, after: 0.001 }, cb: { tax: 0, until: CORP_BOND_TAX_FREE_UNTIL, after: 0.001 } },
    withholding: 0, nhi: true
  },
  US: {
    delay: 0, zh: '美股', en: 'US', flag: '🇺🇸', currency: 'USD', suffixes: [''],
    commission: { rate: 0.001, min: 3, until: US_FEE_PROMO_UNTIL, kinds: { stock: { rate: 0.0008, min: 0 }, etf: { flat: 3 } } },
    // A monthly plan's buy (定期定額, 國泰: from US$10, fractional shares).
    plan: { flat: 0.1, flatUntil: US_FEE_PROMO_UNTIL, rate: 0.001, min: 3 },
    // The SEC's Section 31 fee on sales: US$20.60 per million from 2026-04-04.
    sell: { all: { fee: 0.0000206 } },
    // FINRA's Trading Activity Fee on sales: US$0.000166 a share, at most
    // US$8.30 a trade, rounded up to the cent (FINRA By-Laws Schedule A §1).
    taf: { perShare: 0.000166, max: 8.3 },
    withholding: 0.3
  },
  JP: { delay: 20, zh: '日股', en: 'Japan', flag: '🇯🇵', currency: 'JPY', suffixes: ['.T'], commission: { rate: 0.0025, min: 3000 }, withholding: 0.15315 },
  HK: {
    delay: 15, zh: '港股', en: 'Hong Kong', flag: '🇭🇰', currency: 'HKD', suffixes: ['.HK'], commission: { rate: 0.0025, min: 50 },
    buy: { stock: { tax: 0.001, fee: 0.000085 }, all: { fee: 0.000085 } },
    sell: { stock: { tax: 0.001, fee: 0.000085 }, all: { fee: 0.000085 } },
    withholding: 0
  },
  CN: {
    delay: 15, zh: '陸股', en: 'China A-shares', flag: '🇨🇳', currency: 'CNY', suffixes: ['.SS', '.SZ'], commission: { rate: 0.003, min: 50 },
    // Stock Connect northbound (HKEX fees, 2023-08-28): each way the
    // exchange's handling fee 0.00341%, the CSRC's 0.002% and ChinaClear's
    // transfer fee 0.001%; an ETF 0.004% only. Stamp duty 0.05% on sales.
    buy: { stock: { fee: 0.0000641 }, etf: { fee: 0.00004 } },
    sell: { stock: { tax: 0.0005, fee: 0.0000641 }, etf: { fee: 0.00004 } }, withholding: 0.1
  },
  KR: {
    delay: 20, zh: '韓股', en: 'Korea', flag: '🇰🇷', currency: 'KRW', suffixes: ['.KS', '.KQ'], commission: { rate: 0.003, min: 35000 },
    // Securities transaction tax on sales, 0.20% on KOSPI and KOSDAQ from 2026
    // (the special tax for rural development included).
    sell: { stock: { tax: 0.002 } }, withholding: 0.22
  },
  UK: {
    delay: 15, zh: '英股', en: 'UK', flag: '🇬🇧', currency: 'GBP', suffixes: ['.L'], commission: { rate: 0.0025, min: 75 },
    buy: { stock: { tax: 0.005 } }, withholding: 0
  },
  FR: {
    delay: 15, zh: '法股', en: 'France', flag: '🇫🇷', currency: 'EUR', suffixes: ['.PA'], commission: { rate: 0.0025, min: 35 },
    buy: { stock: { tax: 0.004 } }, withholding: 0.25
  },
  DE: { delay: 15, zh: '德股', en: 'Germany', flag: '🇩🇪', currency: 'EUR', suffixes: ['.DE', '.F'], commission: { rate: 0.0025, min: 35 }, withholding: 0.26375 },
  NL: { delay: 0, zh: '荷股', en: 'Netherlands', flag: '🇳🇱', currency: 'EUR', suffixes: ['.AS'], commission: { rate: 0.0025, min: 35 }, withholding: 0.15 },
  IT: {
    delay: 15, zh: '義股', en: 'Italy', flag: '🇮🇹', currency: 'EUR', suffixes: ['.MI'], commission: { rate: 0.0025, min: 35 },
    buy: { stock: { tax: 0.001 } }, withholding: 0.26
  },
  ES: {
    delay: 15, zh: '西股', en: 'Spain', flag: '🇪🇸', currency: 'EUR', suffixes: ['.MC'], commission: { rate: 0.0025, min: 35 },
    buy: { stock: { tax: 0.002 } }, withholding: 0.19
  },
  // The Swiss transfer stamp duty: 0.15% on Swiss securities, half each side.
  CH: {
    delay: 15, zh: '瑞士股', en: 'Switzerland', flag: '🇨🇭', currency: 'CHF', suffixes: ['.SW'], commission: { rate: 0.0025, min: 45 },
    buy: { all: { tax: 0.00075 } }, sell: { all: { tax: 0.00075 } }, withholding: 0.35
  },
  DK: { delay: 0, zh: '丹麥股', en: 'Denmark', flag: '🇩🇰', currency: 'DKK', suffixes: ['.CO'], commission: { rate: 0.0025, min: 40 }, withholding: 0.27 },
  CA: { delay: 15, zh: '加股', en: 'Canada', flag: '🇨🇦', currency: 'CAD', suffixes: ['.TO', '.V'], commission: { rate: 0.0025, min: 20 }, withholding: 0.25 },
  AU: { delay: 20, zh: '澳股', en: 'Australia', flag: '🇦🇺', currency: 'AUD', suffixes: ['.AX'], commission: { rate: 0.0025, min: 40 }, withholding: 0.3 },
  SG: { delay: 10, zh: '星股', en: 'Singapore', flag: '🇸🇬', currency: 'SGD', suffixes: ['.SI'], commission: { rate: 0.0025, min: 45 }, withholding: 0 },
  IN: {
    delay: 15, zh: '印度股', en: 'India', flag: '🇮🇳', currency: 'INR', suffixes: ['.NS', '.BO'], commission: { rate: 0.003, min: 100 },
    // STT 0.1% both ways on delivery trades; stamp duty 0.015% on buys.
    buy: { all: { tax: 0.00115 } }, sell: { all: { tax: 0.001 } }, withholding: 0.2
  },
  CRYPTO: { delay: 0, zh: '加密貨幣', en: 'Crypto', flag: '🪙', currency: 'USD', suffixes: [], commission: { rate: 0.001, min: 0 }, withholding: 0 },
  // Gold and silver passbooks (黃金存摺): grams priced in NT$, bought at the
  // bank's selling price and sold at its buying price, no commission.
  METAL: { delay: 10, zh: '黃金存摺', en: 'Metal passbook', flag: '🥇', currency: 'TWD', suffixes: [], commission: { rate: 0, min: 0 }, spread: 0.006, withholding: 0 },
  // Government bonds, over the counter through a broker: a small commission
  // and the dealer's bid-ask spread. Coupon tax depends on the issuer
  // (bonds.mjs).
  BOND: { delay: 0, zh: '公債', en: 'Government bonds', flag: '🏛️', currency: null, suffixes: [], commission: { rate: 0.001, min: 0 }, spread: 0.0005, withholding: 0 },
  // Currency pairs (外匯): EUR/USD is bought and sold in US$, a unit per
  // euro. No commission; the dealer's spread each way, like a forex broker.
  FX: { delay: 0, zh: '外匯', en: 'Forex', flag: '💱', currency: null, suffixes: [], commission: { rate: 0, min: 0 }, spread: 0.0002, withholding: 0 },
  // Anywhere else search turns up: a generic sub-brokerage rate.
  INTL: { zh: '其他市場', en: 'Other markets', flag: '🌐', currency: null, suffixes: [], commission: { rate: 0.003, min: 0 }, withholding: 0.2 }
};

const SUFFIX_MARKET = Object.entries(MARKETS).flatMap(([id, m]) => m.suffixes.filter(Boolean).map(s => [s, id]));

// Days from a dividend's ex-date to the day the cash arrives, as each
// market usually pays: Taiwan about four weeks, the US about a week, Japan
// two to three months (after the shareholders' meeting), most of Europe
// within days.
export const DIV_PAY_DAYS = {
  TW: 28, US: 7, JP: 75, HK: 30, CN: 7, KR: 30, UK: 28, FR: 3, DE: 3, NL: 21, IT: 2, ES: 4, CH: 3, DK: 3, CA: 14, AU: 30, SG: 21, IN: 30
};
export const divPayDays = market => DIV_PAY_DAYS[market] ?? 21;

// Each market's own clock, for its days (settlement, lunch breaks, T+1).
export const MARKET_TZ = { TW: 'Asia/Taipei', US: 'America/New_York', JP: 'Asia/Tokyo', HK: 'Asia/Hong_Kong', CN: 'Asia/Shanghai', KR: 'Asia/Seoul', UK: 'Europe/London', FR: 'Europe/Paris', DE: 'Europe/Berlin', NL: 'Europe/Amsterdam', IT: 'Europe/Rome', ES: 'Europe/Madrid', CH: 'Europe/Zurich', DK: 'Europe/Copenhagen', CA: 'America/Toronto', AU: 'Australia/Sydney', SG: 'Asia/Singapore', IN: 'Asia/Kolkata', BOND: 'Asia/Taipei', METAL: 'Asia/Taipei' };
const tzOf = market => MARKET_TZ[market] || 'Asia/Taipei';
// A moment's local date and minutes after midnight in a market.
function localParts(t, market) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tzOf(market), year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(t).map(x => [x.type, x.value]));
  return { day: `${p.year}-${p.month}-${p.day}`, minutes: Number(p.hour) * 60 + Number(p.minute) };
}
export const localDayOf = (t, market) => localParts(t, market).day;
// The moment `t`'s day closes early in its market (a half day,
// stock-holidays.mjs earlyClose), or null.
export function earlyCloseAt(market, t) {
  const day = localDayOf(t, market);
  const hm = earlyClose(market, day);
  if (!hm) return null;
  const [y, m, d] = day.split('-').map(Number);
  return zonedTime(y, m, d, Number(hm.slice(0, 2)), Number(hm.slice(3)), 0, tzOf(market));
}

// When a dividend that went ex at `ex` is paid: on `payDay` (Yahoo's
// calendarEvents.dividendDate, a date: 'YYYY-MM-DD' or its UTC midnight)
// where it's known, else the market's usual DIV_PAY_DAYS later, moved to
// its next trading day (a pay day is never a weekend or a holiday). At the
// ex-date's own time of day.
export function divPayDate(market, ex, payDay = null) {
  const day = typeof payDay === 'number' && Number.isFinite(payDay) ? new Date(payDay).toISOString().slice(0, 10) : /^\d{4}-\d{2}-\d{2}$/.test(payDay || '') ? payDay : null;
  const { day: exDay, minutes } = localParts(ex, market);
  if (day && day >= exDay) {
    const [y, m, d] = day.split('-').map(Number);
    return zonedTime(y, m, d, Math.floor(minutes / 60), minutes % 60, 0, tzOf(market));
  }
  let t = ex + divPayDays(market) * 86_400_000;
  for (let i = 0; i < 30 && !isTradingDay(market, localDayOf(t, market)); i++) t += 86_400_000;
  return t;
}

// Tokyo's lists (stock-jp-lists.mjs): a code's TOPIX500 membership and an
// ETF's trading unit (1 when not listed).
let jpLists = null;
function jp() {
  if (!jpLists) {
    jpLists = { t500: new Set(TOPIX500.split(/\s+/).filter(Boolean)), units: new Map() };
    for (const [unit, codes] of Object.entries(JP_ETF_UNITS)) for (const c of codes.split(/\s+/).filter(Boolean)) jpLists.units.set(c, Number(unit));
  }
  return jpLists;
}
const jpCode = symbol => /^([0-9A-Z]{4})\.T$/i.exec(symbol || '')?.[1]?.toUpperCase() ?? null;
export const inTopix500 = symbol => jp().t500.has(jpCode(symbol));
export const jpEtfUnit = symbol => jp().units.get(jpCode(symbol)) ?? 1;

// The price steps an exchange accepts, by price band:
// - Taiwan (TWSE/TPEx), ETFs finer;
// - US: a cent (a hundredth of a cent under US$1);
// - Hong Kong: the spread table (after the 2025 reduction);
// - Japan (JPX 呼値の単位, "up to" each price): TOPIX500's finer table, which
//   ETFs traded in 10s or more share; ETFs traded in 1s their own; every
//   other issue the ordinary table (¥1 to ¥3,000, ¥5 to ¥5,000, ¥10 to
//   ¥30,000...). Without a `symbol`, TOPIX500's, whose steps every table's
//   prices sit on. (From 2027-03-01 JPX sets each issue's table by its
//   liquidity, STR, which isn't published here.)
// - Korea: the 2023 table, ETFs 5 won;
// - China A-shares: 0.01 yuan, funds 0.001.
// Other markets aren't checked.
const bands = (price, table) => table.find(([below]) => price < below)?.[1] ?? table.at(-1)[1];
const upTo = (price, table) => table.find(([most]) => price <= most + 1e-9)?.[1] ?? table.at(-1)[1];
const JP_FINE = [[1000, 0.1], [3000, 0.5], [10000, 1], [30000, 5], [100000, 10], [300000, 50], [1e6, 100], [3e6, 500], [1e7, 1000], [3e7, 5000], [Infinity, 10000]];
const JP_ETF_ONE = [[10000, 1], [30000, 5], [100000, 10], [300000, 50], [1e6, 100], [3e6, 500], [1e7, 1000], [3e7, 5000], [Infinity, 10000]];
const JP_OTHER = [[3000, 1], [5000, 5], [30000, 10], [50000, 50], [300000, 100], [500000, 500], [3e6, 1000], [5e6, 5000], [3e7, 10000], [5e7, 50000], [Infinity, 100000]];
export function jpTickTable(kind, symbol) {
  if (!symbol) return JP_FINE;
  if (kind === 'etf') return jpEtfUnit(symbol) >= 10 ? JP_FINE : JP_ETF_ONE;
  return inTopix500(symbol) ? JP_FINE : JP_OTHER;
}
export function tickSize(market, kind, price, symbol = null) {
  if (market === 'TW') {
    if (kind === 'etf' || kind === 'bond') return price < 50 ? 0.01 : 0.05;
    // A convertible bond, by price per NT$100 of face (TPEx 轉換公司債升降單位).
    if (kind === 'cb') return price < 150 ? 0.05 : price < 1000 ? 1 : 5;
    return price < 10 ? 0.01 : price < 50 ? 0.05 : price < 100 ? 0.1 : price < 500 ? 0.5 : price < 1000 ? 1 : 5;
  }
  if (market === 'US') return price < 1 ? 0.0001 : 0.01;
  if (market === 'HK')
    return bands(price, [[0.25, 0.001], [0.5, 0.005], [20, 0.01], [50, 0.02], [100, 0.05], [200, 0.1], [500, 0.2], [1000, 0.5], [2000, 1], [5000, 2], [Infinity, 5]]);
  if (market === 'JP') return upTo(price, jpTickTable(kind, symbol));
  if (market === 'KR') return kind === 'etf' ? 5 : bands(price, [[2000, 1], [5000, 5], [20000, 10], [50000, 50], [200000, 100], [500000, 500], [Infinity, 1000]]);
  if (market === 'CN') return kind === 'etf' ? 0.001 : 0.01;
  return null;
}
export const onTick = (price, tick) => !tick || Math.abs(price / tick - Math.round(price / tick)) < 1e-6;
export const toTick = (price, tick, dir = 0) => {
  if (!tick) return price;
  const f = dir > 0 ? Math.ceil : dir < 0 ? Math.floor : Math.round;
  return +(f(price / tick - (dir > 0 ? 1e-9 : dir < 0 ? -1e-9 : 0)) * tick).toFixed(6);
};

// Daily price limits: how far from the last close (limitBase) a price may go.
// Taiwan ±10%, but none in a first listing's first five trading days (TWSE
// 初次上市股票首五個交易日無漲跌幅限制, TPEx's 初次上櫃 the same; quote.listed,
// its listing day, from stock-ipo.mjs listedOn); mainland China ±10% (±20%
// on the STAR Market, 688xxx, and ChiNext, 300xxx/301xxx); Korea ±30%;
// Japan a fixed yen amount by price band (JPX 値幅制限), for stocks and ETFs
// alike. Orders outside them are refused by the exchange.
const JP_LIMITS = [[100, 30], [200, 50], [500, 80], [700, 100], [1000, 150], [1500, 300], [2000, 400], [3000, 500], [5000, 700], [7000, 1000], [10000, 1500], [15000, 3000], [20000, 4000], [30000, 5000], [50000, 7000], [70000, 10000], [100000, 15000], [150000, 30000], [200000, 40000], [300000, 50000], [500000, 70000], [700000, 100000], [1e6, 150000], [1.5e6, 300000], [2e6, 400000], [3e6, 500000], [5e6, 700000], [7e6, 1e6], [1e7, 1.5e6], [1.5e7, 3e6], [2e7, 4e6], [3e7, 5e6], [5e7, 7e6], [Infinity, 1e7]];
export const NEW_LISTING_DAYS = 5;
// Whether `now` is within the first NEW_LISTING_DAYS Taiwan trading days from
// the listing day `listed` (that day the first).
export function newListing(listed, now = Date.now()) {
  if (!(listed > 0) || now < listed) return false;
  const last = localDayOf(now, 'TW');
  let n = 0;
  for (let t = listed, i = 0; i < 40; t += 86_400_000, i++) {
    const day = localDayOf(t, 'TW');
    if (day > last) break;
    if (isTradingDay('TW', day) && ++n > NEW_LISTING_DAYS) return false;
  }
  return n > 0;
}
// A mainland share's board: 'star' (STAR Market, Shanghai 688/689), 'chinext'
// (ChiNext, Shenzhen 30xxxx) or 'main'. Through Stock Connect northbound,
// STAR and ChiNext shares are bought by institutional professional
// investors only (HKEX Stock Connect FAQ): a retail account can only sell them.
export function cnBoard(symbol) {
  if (/^68[89]\d{3}\.SS$/i.test(symbol || '')) return 'star';
  if (/^30\d{4}\.SZ$/i.test(symbol || '')) return 'chinext';
  return 'main';
}
export function limitShare(quote, now = Date.now()) {
  if (quote?.kind === 'cb') return 0.1;
  if (!quote || !['stock', 'etf', 'bond'].includes(quote.kind)) return null;
  if (isEmerging(quote.symbol)) return null;
  // A Taiwan bond ETF (all of them hold foreign bonds) has no daily limit:
  // TWSE's 國外成分證券ETF trade without one.
  if (quote.market === 'TW') return newListing(quote.listed, now) || quote.kind === 'bond' ? null : 0.1;
  if (quote.market === 'KR') return 0.3;
  if (quote.market === 'CN') return cnBoard(quote.symbol) === 'main' ? 0.1 : 0.2;
  return null;
}
// The price a day's limits are from (each exchange's 基準價, the last
// close): yesterday's (quote.prev) while today's session trades (its lunch,
// and Taiwan's after-hours hour to 14:30, included); once it's over, or
// before the next opens, the last close itself (quote.price), which the
// next session's limits are from.
export function limitBase(quote, now = Date.now()) {
  const s = quote?.session;
  if (!s || !(quote.price > 0)) return quote?.prev;
  const today = now >= s.start && quote.marketTime >= s.start;
  const over = now >= s.end + (quote.market === 'TW' ? 3_600_000 : 0);
  return today && !over ? quote.prev : quote.price;
}
export function priceLimits(quote, now = Date.now()) {
  if (!(quote?.prev > 0)) return null;
  const base = limitBase(quote, now);
  const tick = x => tickSize(quote.market, quote.kind, x, quote.symbol);
  if (quote.market === 'JP' && (quote.kind === 'stock' || quote.kind === 'etf')) {
    const w = bands(base, JP_LIMITS);
    return { up: base + w, down: Math.max(tick(1), base - w) };
  }
  const share = limitShare(quote, now);
  if (!share) return null;
  const up = base * (1 + share);
  const down = base * (1 - share);
  return { up: toTick(up, tick(up), -1), down: toTick(down, tick(down), 1) };
}

// Board lots: the smallest amount the exchange trades. Japan trades every
// stock in units of 100 and each ETF in its own (jpEtfUnit); mainland China buys in 100s (an odd remainder can
// only be sold whole); Hong Kong's lot is each security's own (every HKEX
// equity, ETF and REIT's, from its List of Securities: stock-hk-lots.mjs).
// Taiwan has its odd-lot session, and Singapore its unit-share market, so
// any number goes there.
let hkLots = null;
// A Hong Kong symbol's board lot (0700.HK: 100), or null when HKEX's list
// doesn't have it.
export function hkLot(symbol) {
  if (!hkLots) {
    hkLots = new Map();
    for (const [lot, codes] of Object.entries(HK_LOT_TABLE)) {
      let code = 0;
      for (const gap of codes.split(',')) hkLots.set((code += parseInt(gap, 36)), Number(lot));
    }
  }
  const m = /^(\d{1,5})\.HK$/i.exec(symbol || '');
  return (m && hkLots.get(Number(m[1]))) || null;
}
// (An HK symbol not on HKEX's list: 1 here; lotProblem refuses its orders.)
export function lotSize(market, symbol, kind) {
  // A convertible bond trades by the 張: NT$100,000 of face, priced per
  // NT$100, so 1,000 units a lot (no odd lots).
  if (kind === 'cb') return 1000;
  if (!['stock', 'etf', 'bond'].includes(kind)) return 1;
  if (market === 'JP' && kind === 'stock') return 100;
  if (market === 'JP' && kind === 'etf') return jpEtfUnit(symbol);
  if (market === 'CN') return 100;
  if (market === 'HK') return hkLot(symbol) || 1;
  return 1;
}
// Whether `qty` is a tradable amount there: whole lots, or (selling) all
// that's left of an odd remainder. { lot } when it isn't; { lot: null,
// unknown: true } for a Hong Kong security whose lot isn't known.
export function lotProblem(market, symbol, kind, side, qty, held = 0) {
  if (market === 'HK' && ['stock', 'etf', 'bond'].includes(kind) && !hkLot(symbol)) return { lot: null, unknown: true };
  const lot = lotSize(market, symbol, kind);
  if (lot <= 1 || Math.abs(qty / lot - Math.round(qty / lot)) < 1e-9) return null;
  if (side === 'sell' && Math.abs(qty - held) < 1e-9 && held % lot !== 0) return null;
  return { lot };
}

// Markets that take limit orders only: Hong Kong (HKEX's continuous
// session takes limit, enhanced limit and special limit orders, no market
// order; its auctions at-auction limit orders), and Taiwan's emerging board
// (興櫃: a price is asked of the recommending broker, 議價).
const LIMIT_ONLY = new Set(['HK']);
export const limitOnly = (market, symbol = '') => LIMIT_ONLY.has(market) || isEmerging(symbol);

// Taiwan's emerging board (興櫃, TPEx): stocks not yet listed, traded by
// negotiation with their recommending brokers rather than matched by the
// exchange: no daily limit, limit orders only, no closing auction, no
// 融資/融券 and no day trading (當沖). The board's stocks, written by
// tools/tw-boards.mjs (each code a base-36 gap from the one before).
export const TW_EMERGING = 'z0,9,2,m,1e,3t,36,d9,4u,4,3,3,1,as,2p,h,2,1,4z,2,4b,k,1v,a,7r,34,a,8,u,b,y,c5,2,1h,2,e,8,3,6i,2y,7,9,6,6,5,3,2,c,2,3r,8,6,r,4g,1j,78,6,2,6,8,5,4,q,fm,4,4k,8,ac,l,6,13,a,a,p,i,3,4,6,6,4,4,1,1,7,8,3,3,9,4,b,b,1,c,4,1,9,2,9,1,5,8,3,1,5,e,8,1,2,2,e,6,5,3,1,6,4,2,5,3,h,5,4,2,1,6,4,1,a,2,2,2,1,1,1,1,1,1,5,1,1,5,1,6,3,5,1,1,1,7,1,6,3,1,8,2,1,3,4,5,1,6,d,1,3,2,3,6,1,3,2,3,3,1,1,6,4,9,4,9,1,3,1,2,1,4,3,3,2,3,4,bk,3,1,3,5,g,c,1g,9,e,l,7,3,1,4,c,5,7,5,c,1q,h,g,4,1,3,9,5,1,1,3,2,4,2,5,3,3,4,2,2,2,1,2,1,1,1,7,2,3,3,2,2,1,1,4,1,6,1,1,3,7,5,2,1,8,2,3,2,1,1,3,1,3,1,2,3,1,1,1,1,1,2,1,3,1,2,1,1,1,2,1,1,1,1,1,1,1,1,2,1,1,1,1,1,1,1,1,2,1,1,1,1,1,1,1,1,1,1,1,1,1,1,2,1,2,3,2,2,1,1,1,1,2,1,1,1,1,1,2,1,1,1,1,1,1,1,1,1,1,1,1,3,3,1,1,1,1,1,2,1,1,3,1,1,1,2t,14,l,3h,1i,v,g,e,2r,f1,qm'; // 2026-10-21, 366 stocks
let emerging = null;
let cbs = null;
export function isEmerging(symbol) {
  const m = /^(\d{4})\.TWO$/i.exec(symbol || '');
  if (!m) return false;
  if (!emerging) {
    emerging = new Set();
    let code = 0;
    for (const gap of TW_EMERGING.split(',')) if (gap) emerging.add((code += parseInt(gap, 36)));
  }
  return emerging.has(Number(m[1]));
}

// Taiwan's convertible bonds (可轉債, TPEx; a five-digit code, the issuer's
// four and the issue's number): quoted per NT$100 of face, a 張 of 1,000
// units, ±10% a day, no margin or short; repaid at face (100) on maturity,
// the date its issue data gives (TW_CB, tools/tw-boards.mjs: code:YYMMDD).
// (Most pay no coupon; conversion into shares and the holder's put are not
// offered here: a bond is sold, or held to maturity.)
export const TW_CB = '11011:291210,12561:281008,12951:291029,13166:271227,13382:281201,14363:270827,14364:280318,14381:291219,14664:280620,14722:280529,14723:280617,14743:280331,15142:300113,15364:270812,15602:290903,15952:290902,15984:280303,16095:290930,16231:290716,17172:310608,17272:311020,17813:270924,17863:280801,19094:261220,20344:291002,21043:281013,22013:280525,22211:290911,22283:270829,22331:290123,22363:310210,22471:280626,22472:280630,23031:310807,23032:310903,23161:311021,23291:290318,23511:280617,23742:310202,24023:281119,24271:281213,24394:270710,24395:270722,24423:271129,24424:271225,24552:290123,24553:290127,24643:290907,24672:290109,24673:290122,24762:270126,24867:290723,25283:291231,25284:300117,25303:280623,25304:280630,25483:291002,25484:291018,26417:270726,26418:300806,26461:310929,26462:310930,27271:280329,27323:270126,27324:281208,27431:280828,27451:290105,27531:281009,27532:281020,27551:280115,27561:270530,27562:290923,30062:291002,30112:290326,30134:271018,30165:270726,30166:290818,30285:310724,30286:310929,30321:281113,30322:301125,30336:270601,30337:290911,30371:301103,30401:280630,30454:300224,30455:300225,30811:290812,30812:290813,30954:280225,31222:270503,31352:290505,31413:270520,31414:310807,31415:290922,31494:290831,31882:280620,32071:270325,32191:290825,32571:291101,32609:290918,32723:290307,32843:280915,32943:290618,33035:291126,33121:270625,33133:271129,33225:270902,33245:290731,33246:310302,33247:310316,33466:271127,33571:261031,33621:290716,33763:290823,33902:280221,34163:270125,34793:270122,34834:270522,34843:280424,34913:310609,35122:290818,35161:271018,35181:270815,35221:261218,35265:270214,35266:290129,35267:300724,35431:281226,35482:270108,35483:300225,35513:281028,35642:270903,35833:290730,35834:290922,35872:310204,35914:271122,36053:270806,36054:290706,36173:280616,36805:310508,36806:310521,36841:281028,36872:281002,36873:281003,36913:270830,37075:300820,37151:290121,37152:290324,37171:290121,41135:301027,41136:310320,41236:280426,41237:280427,41238:310504,41239:310514,41295:300529,41372:270812,41645:300620,41684:280918,41903:270711,41904:290630,41981:291021,44163:270930,44383:280930,44391:280303,44421:280728,45031:290513,45102:280226,45415:310921,45416:310922,45491:271107,45554:280609,45581:280828,45663:261127,45691:280115,45721:270716,45811:280815,47148:290504,47223:281001,47224:290526,47393:261028,47394:301217,47491:290528,47602:290522,47642:290805,47721:281127,49231:290129,49311:290529,49675:310818,49731:290821,49793:271209,49794:271225,52011:281015,52121:291015,52441:290925,52452:271218,52635:270304,52844:290505,52845:290511,52892:290701,52912:290729,53064:261108,53096:301212,53097:281215,53211:270304,53887:281206,54391:300909,54501:280321,54573:270306,54642:290525,55344:310311,55362:290804,55363:290817,56087:271217,60152:290105,61011:290129,61012:290130,61041:270826,61112:270910,61171:270527,61172:280528,61255:270621,61263:261130,61343:290720,61506:270307,61565:280625,61635:281016,61743:291002,61777:280625,61794:270828,61828:290927,61843:270306,61876:290702,61894:281110,61907:281106,61973:271015,61993:290120,61994:290121,62075:280826,62076:280905,62093:281023,62194:281016,62236:310615,62433:270625,62695:270802,62696:270802,62746:311029,62822:280613,62843:261214,62854:291013,62855:291023,64251:271015,64324:270816,64383:291013,64693:280728,64724:310401,64725:310415,64774:270721,64775:281009,65096:270703,65101:290105,65152:290205,65331:280908,65381:300626,65461:270605,65462:290609,65463:290630,65472:290319,65521:261025,65702:290814,65761:290325,65843:290702,65851:261026,65852:261027,65914:280827,66034:290504,66163:280920,66241:290705,66292:270913,66451:271204,66642:271119,66702:281226,66801:290902,66831:290810,66931:290724,67062:271025,67531:270625,67681:271031,67711:280508,67962:281222,68032:310521,68211:280815,68301:270815,68351:271101,68401:270527,68431:280804,68461:300313,68462:300325,68541:280227,68621:290313,68631:271015,68692:290724,68701:291205,68702:291205,68732:300529,68741:271104,68901:281128,68902:281210,68941:290309,69031:290724,69032:290807,69041:281226,69131:290319,69571:281002,69821:280723,69822:280804,74022:280902,75561:280812,75562:280815,76101:290520,76311:290826,77131:281020,77381:291016,77431:290910,80212:310120,80213:311020,80273:270713,80282:300122,80426:281216,80506:271122,80541:290722,80746:290514,80872:280502,80914:270815,80924:270311,80962:290702,80963:290714,81042:270111,81114:290428,81473:271003,81551:300110,81552:310803,81553:310813,81714:271112,81715:271114,82102:290126,82103:290203,82221:290910,82711:290505,82993:310206,83742:271115,84041:281003,84113:300801,84221:271122,84222:300407,84223:311006,84312:290105,84332:270524,84333:270527,84381:290805,84423:290724,84424:290930,84624:290508,84672:270530,84673:270531,84762:290421,84781:270715,84881:261219,84891:271209,89277:270816,89278:270821,89365:290817,89366:290828,89965:311012,89966:311022,98026:271115,99063:280227,99332:290723,99353:271014,99392:291029,99412:281120,99587:271028,99588:271108'; // 2026-10-21, 384 bonds
export const isCb = symbol => /^[1-9]\d{4}\.TWO$/i.test(symbol || '');
// Its maturity (the day, Taipei midnight), or null when the table doesn't have it.
export function cbMaturity(symbol) {
  if (!cbs) {
    cbs = new Map();
    for (const item of TW_CB.split(',')) {
      const [code, d] = item.split(':');
      if (d) cbs.set(code, Date.parse(`20${d.slice(0, 2)}-${d.slice(2, 4)}-${d.slice(4, 6)}T00:00:00+08:00`));
    }
  }
  return isCb(symbol) ? cbs.get(symbol.slice(0, 5)) ?? null : null;
}

// US pre- and post-market through a Taiwan broker (富邦 from 2026-10-01,
// 國泰 the same month): 04:00-09:30 and from the close to 18:00 New York
// time (Taiwan 16:00-21:30 and 04:00-06:00 in summer), day limit orders only
// (富邦: 僅接受當日限價委託). Minutes after midnight there.
export const US_EXTENDED = { pre: [240, 570], post: [960, 1080] };
// Which US session `t` is in: 'pre', 'regular', 'post' or null (shut: a
// weekend, a holiday, the night). A half day's post-market from its 13:00 close.
export function usSession(t) {
  const { day, minutes } = localParts(t, 'US');
  if (!isTradingDay('US', day)) return null;
  const early = earlyClose('US', day);
  const close = early ? Number(early.slice(0, 2)) * 60 + Number(early.slice(3)) : US_EXTENDED.post[0];
  if (minutes >= US_EXTENDED.pre[0] && minutes < US_EXTENDED.pre[1]) return 'pre';
  if (minutes >= US_EXTENDED.pre[1] && minutes < close) return 'regular';
  if (minutes >= close && minutes < US_EXTENDED.post[1]) return 'post';
  return null;
}
// When an extended-hours order placed at `t` ends: 18:00 New York time on
// that US trading day, or the next one's once it's past.
export function usExtendedEnd(t) {
  let [y, m, d] = localParts(t, 'US').day.split('-').map(Number);
  for (let i = 0; i < 15; i++, [y, m, d] = [...new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10).split('-').map(Number)]) {
    const day = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const end = zonedTime(y, m, d, US_EXTENDED.post[1] / 60, 0, 0, tzOf('US'));
    if (isTradingDay('US', day) && t < end) return end;
  }
  return t + 86_400_000;
}

// US market-wide circuit breakers (NYSE Rule 7.12): the S&P 500 down 7%
// (level 1) or 13% (level 2) from yesterday's close halts every US stock
// 15 minutes, unless it's reached at 15:25 or later; down 20% (level 3)
// shuts trading for the day. Each level once a day. From the S&P 500's quote
// (SPX, its day's line): { level, until } while halted, else null.
export const SPX = '^GSPC';
export function marketHalt(spx, now = Date.now()) {
  if (!(spx?.prev > 0)) return null;
  const day = localDayOf(now, 'US');
  const [y, m, d] = day.split('-').map(Number);
  const points = [...(spx.line || []), [spx.marketTime, spx.price]].filter(([t, p]) => t > 0 && t <= now && p > 0 && localDayOf(t, 'US') === day).sort((a, b) => a[0] - b[0]);
  const reached = share => points.find(([, p]) => p <= spx.prev * (1 - share))?.[0] ?? null;
  const level3 = reached(0.2);
  if (level3 != null) return { level: 3, until: earlyCloseAt('US', now) ?? zonedTime(y, m, d, 16, 0, 0, tzOf('US')) };
  const cutoff = zonedTime(y, m, d, 15, 25, 0, tzOf('US'));
  let halt = null;
  for (const [share, level] of [[0.07, 1], [0.13, 2]]) {
    const t = reached(share);
    if (t != null && t < cutoff && now < t + 15 * 60_000) halt = { level, until: t + 15 * 60_000 };
  }
  return halt;
}

// Lunch breaks, in the market's own time: no trading in between.
const LUNCH = { JP: [690, 750], HK: [720, 780], CN: [690, 780], SG: [720, 780] };
export function atLunch(market, t) {
  const l = LUNCH[market];
  if (!l) return false;
  const m = localParts(t, market).minutes;
  return m >= l[0] && m < l[1];
}
export const lunchOf = market => LUNCH[market] || null;

// Business days until a trade settles (T+n): Taiwan, Japan, Hong Kong,
// Korea, Europe, Australia and Singapore T+2; the US, Canada, India and
// mainland China T+1 (the UK, the EU and Switzerland move to T+1 on
// 2027-10-11). Crypto, passbook metals and forex here settle at once. Sale
// proceeds can buy again right away (the broker nets them), but can't leave
// the market (be exchanged) until settled.
export const SETTLE_DAYS = { TW: 2, US: 1, CA: 1, IN: 1, CN: 1, JP: 2, HK: 2, KR: 2, UK: 2, FR: 2, DE: 2, NL: 2, IT: 2, ES: 2, CH: 2, DK: 2, AU: 2, SG: 2, BOND: 1, CRYPTO: 0, METAL: 0, FX: 0 };
export const T1_EUROPE = Date.UTC(2027, 9, 11);
const EUROPE_T1 = new Set(['UK', 'FR', 'DE', 'NL', 'IT', 'ES', 'CH', 'DK']);
export const settleDays = (market, t = Date.now()) => (EUROPE_T1.has(market) && t >= T1_EUROPE ? 1 : SETTLE_DAYS[market] ?? 2);
// A day is a settlement day in a market when it trades there (weekends and
// the market's own holidays skipped).
const tradingDay = (market, day) => isTradingDay(market, day);
// The moment a trade at `t` settles: n of the market's business days later,
// at the end of that day in the market's own time.
// Days a market doesn't trade but still settles (TWSE: 市場無交易，僅辦理結算交割).
const SETTLE_ONLY = { TW: new Set(['2026-02-12', '2026-02-13']) };
export function settleDate(market, t) {
  let n = settleDays(market, t);
  if (!n) return t;
  const tz = tzOf(market);
  let [y, m, d] = localParts(t, market).day.split('-').map(Number);
  let day;
  while (n > 0) {
    const next = new Date(Date.UTC(y, m - 1, d + 1));
    [y, m, d] = [next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate()];
    day = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const w = next.getUTCDay();
    if (w !== 0 && w !== 6 && (tradingDay(market, day) || SETTLE_ONLY[market]?.has(day))) n--;
  }
  return zonedTime(y, m, d, 23, 59, 59, tz);
}
// The moment a wall time in a zone is (`y-m-d hh:mm:ss` there), from the
// zone's offset at that time. (Read with formatToParts: a locale string
// parsed back with Date.parse is up to each engine, and Safari's isn't V8's.)
export function zonedTime(y, m, d, hh, mm, ss, tz) {
  const guess = Date.UTC(y, m - 1, d, hh, mm, ss);
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric', hourCycle: 'h23' }).formatToParts(guess).map(x => [x.type, x.value]));
  const shown = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour) % 24, Number(p.minute), Number(p.second));
  return guess + (guess - shown);
}

// Half the bid-ask spread, which a market order pays on top of the last
// price (buys at the ask, sells at the bid): at least half a tick, and a
// typical share of the price for each market. Limit orders don't pay it
// (they fill at their price or better); metals, bonds and forex already
// trade at the dealer's buy and sell prices (`spread` above).
const HALF_SPREAD = { US: 0.0001, TW: 0, JP: 0.0005, HK: 0.0005, CN: 0.0005, KR: 0.0005, UK: 0.0005, FR: 0.0005, DE: 0.0005, NL: 0.0005, IT: 0.0005, ES: 0.0005, CH: 0.0005, DK: 0.0005, CA: 0.0005, AU: 0.0005, SG: 0.001, IN: 0.0005, CRYPTO: 0.0002, METAL: 0, BOND: 0, FX: 0 };
export function marketSlip(market, kind, price) {
  if (MARKETS[market]?.spread) return 0;
  const tick = tickSize(market, kind, price) || 0;
  // Taiwan trades only on its ticks (營業細則 §62): the ask is a whole tick
  // above the last price, the bid a whole tick below.
  if (market === 'TW') return tick;
  return Math.max(tick / 2, price * (HALF_SPREAD[market] ?? 0.001));
}
// What a market order fills at, from the last price.
export function marketFill(market, kind, side, price) {
  const p = side === 'buy' ? price + marketSlip(market, kind, price) : Math.max(0, price - marketSlip(market, kind, price));
  // (Taiwan's ticks are whole cents at the least.)
  return market === 'TW' ? Math.round(p * 100) / 100 : p;
}

// Taiwan's intraday odd-lot session (盤中零股): to 13:30, matched by call
// auction; an order of fewer than 1,000 shares (or a part that isn't whole
// lots) can't fill before its first match: 09:10, and 09:00 with the whole
// lots from 2026-12-07 (TWSE: 115年12月7日起 於上午9:00起第一次撮合).
export const ODD_LOT_OPEN = { h: 9, m: 10 };
export const ODD_LOT_NINE = Date.parse('2026-12-07T00:00:00+08:00');
export const oddLotOpenAt = t => (t >= ODD_LOT_NINE ? { h: 9, m: 0 } : ODD_LOT_OPEN);
export function isOddLot(market, kind, qty) {
  return market === 'TW' && (kind === 'stock' || kind === 'etf' || kind === 'bond') && Math.round(qty) % 1000 !== 0;
}
// Whole lots (1,000 shares) and odd lots (1-999) are separate orders in
// Taiwan (TWSE: 零股 1股~999股): an order of 1,500 is a lot and 500 odd
// shares, two orders. { lots, odd } for an amount that mixes them, else null.
export function mixedLot(market, kind, qty) {
  const n = Math.round(qty);
  if (market !== 'TW' || !['stock', 'etf', 'bond'].includes(kind) || n < 1000 || n % 1000 === 0) return null;
  return { lots: n - (n % 1000), odd: n % 1000 };
}
export function oddLotOpen(t) {
  const d = new Date(t + 8 * 3_600_000);
  const open = oddLotOpenAt(t);
  return d.getUTCHours() * 60 + d.getUTCMinutes() >= open.h * 60 + open.m;
}

// NT$ cash in the settlement account earns the bank's demand-deposit rate,
// accrued daily and paid twice a year (June 21 and December 21, as Taiwan's
// banks do).
export const CASH_RATE = 0.008;

export const delayOf = market => (MARKETS[market] || MARKETS.INTL).delay ?? 15;

// An index has no suffix: its home market by name (^TWII is Taiwan's, not
// the US's), for its hours, holidays and flag.
const INDEX_MARKET = {
  '^TWII': 'TW', '^TWOII': 'TW', '^N225': 'JP', '^HSI': 'HK', '^KS11': 'KR', '^GDAXI': 'DE', '^FTSE': 'UK',
  '^FCHI': 'FR', '^STOXX50E': 'DE', '^BSESN': 'IN', '^AXJO': 'AU', '^GSPTSE': 'CA', '^STI': 'SG', '^SSMI': 'CH'
};

export function marketOf(symbol, kind) {
  if (INDEX_MARKET[symbol]) return INDEX_MARKET[symbol];
  if (kind === 'crypto') return 'CRYPTO';
  if (kind === 'govbond') return 'BOND';
  if (kind === 'metal') return 'METAL';
  if (kind === 'fx' || /^[A-Z]{6}=X$/.test(symbol)) return 'FX';
  const dot = symbol.lastIndexOf('.');
  if (dot < 0) return 'US';
  const suffix = symbol.slice(dot);
  return SUFFIX_MARKET.find(([s]) => s === suffix)?.[1] || (/^\.[A-Z]$/.test(suffix) ? 'US' : 'INTL');
}

// Passbook metals: the page's own instruments, priced from the futures.
export const METALS = {
  XAU: { future: 'GC=F', zh: '黃金存摺', en: 'Gold passbook', unitZh: '公克', unitEn: 'g' },
  XAG: { future: 'SI=F', zh: '白銀存摺', en: 'Silver passbook', unitZh: '公克', unitEn: 'g' }
};
export const GRAMS_PER_OUNCE = 31.1034768;

// What kind of thing a symbol is, from Yahoo's type. Taiwan's bond ETFs end
// in B (00679B); the catalog marks others.
export function kindOf(type, symbol, hint) {
  if (hint) return hint;
  if (METALS[symbol]) return 'metal';
  if (isCb(symbol)) return 'cb';
  switch (String(type || '').toUpperCase()) {
    case 'ETF':
      return /^\d{4,6}B\.TWO?$/.test(symbol) ? 'bond' : 'etf';
    case 'MUTUALFUND':
      return 'fund';
    case 'CRYPTOCURRENCY':
      return 'crypto';
    case 'INDEX':
      return 'index';
    case 'FUTURE':
      return 'future';
    case 'CURRENCY':
      return 'fx';
    default:
      return 'stock';
  }
}

// 複委託 (受託買賣外國有價證券): a foreign market is traded through a Taiwan
// broker's sub-brokerage, and that is cash only, no 融資 and no borrowed
// short (元大 複委託說明: 不得信用交易). (The FSC's 複委託外幣融資, US index
// stocks only, was approved 2026-08 but isn't in force: 2027 Q2 at the earliest.)
const LOCAL_MARKETS = new Set(['TW', 'CRYPTO', 'METAL', 'BOND', 'FX']);
export const isSubBrokered = market => Boolean(market) && !LOCAL_MARKETS.has(market);

export const TRADABLE_KINDS = new Set(['stock', 'etf', 'bond', 'fund', 'crypto', 'metal', 'govbond', 'fx', 'cb']);
// What can be sold short (borrowed and sold): listed shares, crypto and
// currency pairs (selling EUR/USD bets on the euro falling).
export const SHORTABLE_KINDS = new Set(['stock', 'etf', 'bond', 'crypto', 'fx']);
export const isShortable = (kind, symbol = '') => SHORTABLE_KINDS.has(kind) && !isEmerging(symbol);
// Yearly fee for borrowing what's sold short, on the value it was sold at.
export const SHORT_FEE = 0.03;
// Opening a short needs assets of at least this much of all that's owed
// (loans and shorts) afterwards; the maintenance levels below then apply.
export const SHORT_INITIAL = 1.5;
export const isTradable = kind => TRADABLE_KINDS.has(kind);

// Smallest amount that can be bought: whole shares, whole grams, crypto to
// 8 decimals, fund units to 3.
export function qtyStep(kind) {
  if (kind === 'crypto') return 1e-8;
  if (kind === 'fund') return 1e-3;
  return 1;
}
// A US stock or ETF's fractional shares (碎股): bought by a monthly plan, to
// this step (4 decimals), and sold down to it.
export const US_FRACTION = 1e-4;
export const fractional = (market, kind) => market === 'US' && (kind === 'stock' || kind === 'etf');
export function roundQty(qty, kind) {
  const step = qtyStep(kind);
  return step >= 1 ? Math.floor(qty + 1e-9) : Math.floor(qty / step + 1e-6) * step;
}

export function roundCash(amount, currency) {
  const f = 10 ** currencyInfo(currency).digits;
  return Math.round(amount * f) / f;
}

// A kind's tax and fee at `t`: a rate with an `until` gives way to its
// `after` then.
function levy(rules, kind, t = Date.now()) {
  const own = rules?.[kind] || {};
  const all = rules?.all || {};
  const tax = own.until != null && t >= own.until ? own.after : own.tax;
  return { tax: tax ?? all.tax ?? 0, fee: own.fee ?? all.fee ?? 0 };
}
// The day-trade rate for a kind at `t` (null: none, or past its end).
function dayTradeRate(rules, kind, t = Date.now()) {
  const own = rules?.[kind];
  if (own?.dayTrade == null || (own.dayTradeUntil != null && t >= own.dayTradeUntil)) return null;
  return own.dayTrade;
}

// What a trade of `gross` (price × quantity, in the market's currency) costs
// on top: commission, taxes, exchange fees. Taiwan's brokers and tax office
// drop the fractions of a dollar; elsewhere it's to the cent.
// `discount`: the share of the commission charged (0 for the welcome
// offer's first trade, else 1), the minimum included.
// `oddLot`: a Taiwan odd-lot trade (its own, lower minimum); `dayTrade`: a
// Taiwan stock sold the same day it was bought (half the tax): true for all
// of it, or the share of it that's day-traded (§2-2: 同數量, only the
// quantity matched with the day's buys). `t`: when (for the rates that end).
// `plan`: a monthly plan's buy, at the market's plan fee where it has one.
// Mutual funds are bought through a fund platform, not an exchange: a
// subscription fee (申購手續費) on the amount bought, as Taiwan's online
// fund platforms charge after their usual discount on the 3% list fee;
// selling (redeeming) costs nothing, with no exchange fee or tax.
export const FUND_FEE = 0.01;

export function tradeCosts({ market, side, kind, gross, qty = 0, currency, discount = 1, oddLot = false, dayTrade = false, t = Date.now(), plan = false }) {
  const m = MARKETS[market] || MARKETS.INTL;
  const round = m.floorFees ? x => Math.floor(x) : x => roundCash(x, currency);
  if (kind === 'fund') {
    const commission = side === 'buy' && gross > 0 ? round(gross * FUND_FEE * discount) : 0;
    return { commission, tax: 0, fee: 0, total: commission, taxRate: 0, feeRate: 0 };
  }
  // A kind's own price while it runs (`kinds`, to `until`), else the market's.
  const c = m.commission.kinds?.[kind] && !(t >= m.commission.until) ? m.commission.kinds[kind] : m.commission;
  const min = oddLot && c.oddMin != null ? c.oddMin : c.min;
  // The discount is off the commission, and the minimum applies after it (a
  // broker's 2.8折 still charges NT$20 at least); free (0) is free. A flat
  // price is the price.
  const p = plan && side === 'buy' ? m.plan : null;
  const commission = !(gross > 0 && discount > 0) ? 0 : p ? (t < p.flatUntil ? p.flat : round(Math.max(gross * p.rate * discount, p.min))) : c.flat != null ? c.flat : c.rate > 0 ? round(Math.max(gross * c.rate * discount, min)) : 0;
  const rules = levy(side === 'buy' ? m.buy : m.sell, kind, t);
  const dayRate = dayTrade ? dayTradeRate(side === 'buy' ? m.buy : m.sell, kind, t) : null;
  const dayShare = dayRate == null ? 0 : dayTrade === true ? 1 : Math.min(1, Math.max(0, Number(dayTrade) || 0));
  const { fee: feeRate } = rules;
  const taxRate = dayShare ? dayShare * dayRate + (1 - dayShare) * rules.tax : rules.tax;
  const tax = round(gross * taxRate);
  const taf = side === 'sell' && m.taf && qty > 0 && gross > 0 ? Math.min(m.taf.max, Math.ceil(qty * m.taf.perShare * 100 - 1e-9) / 100) : 0;
  const fee = taf ? roundCash(round(gross * feeRate) + taf, currency) : round(gross * feeRate);
  return { commission, tax, fee, total: commission + tax + fee, taxRate, feeRate };
}

// The price a trade actually gets: passbook metals at the bank's own buy and
// sell prices around the market price.
export function dealPrice(market, side, price) {
  const spread = MARKETS[market]?.spread || 0;
  return side === 'buy' ? price * (1 + spread) : price * (1 - spread);
}

// Taiwan's NHI supplementary premium (二代健保補充保費): 2.11% of any single
// payment of NT$20,000 or more (a Taiwan dividend, interest, a lending fee),
// on at most NT$10 million of it, to the dollar with 角 rounded half up
// (健保署 扣取及繳納補充保險費實務手冊: 以元為單位，角以下四捨五入).
export const NHI_RATE = 0.0211;
export const NHI_THRESHOLD = 20_000;
export const NHI_CAP = 10_000_000;
export const nhiPremium = gross => (gross >= NHI_THRESHOLD ? Math.round(Math.min(gross, NHI_CAP) * NHI_RATE) : 0);

// Hong Kong's H-shares (companies incorporated in mainland China) withhold
// China's 10% on dividends (國家稅務總局 國稅函〔2008〕897號); other Hong Kong
// stocks withhold nothing.
export const H_SHARES = new Set(['0168.HK', '0386.HK', '0390.HK', '0728.HK', '0753.HK', '0857.HK', '0902.HK', '0914.HK', '0939.HK', '0998.HK', '1088.HK', '1186.HK', '1211.HK', '1288.HK', '1336.HK', '1339.HK', '1398.HK', '1658.HK', '1800.HK', '1919.HK', '2238.HK', '2318.HK', '2328.HK', '2333.HK', '2601.HK', '2628.HK', '2899.HK', '3328.HK', '3968.HK', '3988.HK', '6030.HK', '6690.HK', '6837.HK', '6886.HK']);
// A Taiwan company's cash dividend arrives by bank transfer less its NT$10
// 匯費 (the company's transfer fee, taken from each payment).
export const TW_DIV_REMIT_FEE = 10;
export function dividendTaxes(market, gross, symbol = '') {
  const m = MARKETS[market] || MARKETS.INTL;
  const rate = market === 'HK' && H_SHARES.has(String(symbol).toUpperCase()) ? 0.1 : m.withholding || 0;
  const withheld = roundCash(gross * rate, m.currency || 'USD');
  const nhi = m.nhi ? nhiPremium(gross) : 0;
  const fee = market === 'TW' ? Math.min(TW_DIV_REMIT_FEE, Math.max(0, gross - withheld - nhi)) : 0;
  return { withheld, nhi, fee, net: gross - withheld - nhi - fee };
}

// Margin: how much of a holding's value can be borrowed against (its loan
// value), as brokers set it, and the maintenance ratio (assets ÷ debt) where
// the broker calls and where it sells.
//   Taiwan stocks and ETFs: 融資成數, 60% listed (.TW), 50% OTC (.TWO).
//   Other markets: 50%, the US Reg T rule international brokers apply, for
//   a loan against them (borrow); never 融資 (複委託 is cash only: isSubBrokered).
//   China A-shares (Stock Connect) and India: none (no margin for foreign
//   retail investors).
//   Government bonds 90%, corporate bonds 70%.
//   Crypto, mutual funds, the gold passbook and currencies: nothing (a
//   broker doesn't lend against them).
export const COLLATERAL = { stock: 0.5, etf: 0.5, bond: 0.7, govbond: 0.9, fund: 0, metal: 0, crypto: 0, fx: 0 };
const NO_MARGIN_MARKETS = new Set(['CN', 'IN']);
export function collateralRate(kind, market, symbol = '') {
  if (!(kind in COLLATERAL)) return 0;
  if (isEmerging(symbol)) return 0;
  if (kind !== 'stock' && kind !== 'etf') return COLLATERAL[kind];
  if (NO_MARGIN_MARKETS.has(market)) return 0;
  if (market === 'TW') return /\.TWO$/i.test(symbol) ? 0.5 : 0.6;
  return COLLATERAL[kind];
}
// Taiwan's rules for 整戶擔保維持率: under 130% after the close the broker
// issues a call (追繳); the account has two business days to bring it back
// to 166% (where a 60% 融資 starts: 1 / 0.6) by paying cash against the
// loans (補繳), repaying or selling. Back at 166% the call is cancelled; at
// the deadline, still under 130%, what was bought on margin is sold from the
// next business day (處分). A broker doesn't sell at once on a ratio; only
// an account that owes more than it holds (under 100%) is sold straight away.
export const MARGIN_CALL = 1.3;
export const MARGIN_RESTORE = 1.66;
export const MARGIN_LIQUIDATE = 1;

// Open for trading right now? Crypto never closes; everything else follows
// the session Yahoo reports for it (holidays included).
export function isOpen(quote, now = Date.now()) {
  if (!quote) return false;
  if (quote.kind === 'crypto') return true;
  const s = quote.session;
  if (!(s && now >= s.start && now < s.end)) return false;
  if (atLunch(quote.market, now)) return false;
  // A half day: shut from its early close, whatever the session says.
  const early = earlyCloseAt(quote.market, now);
  if (early != null && now >= early) return false;
  // Mainland shares are bought from abroad through Stock Connect, which
  // trades only when Hong Kong is open too.
  if (quote.market === 'CN' && !tradingDay('HK', localDayOf(now, 'HK'))) return false;
  return true;
}
