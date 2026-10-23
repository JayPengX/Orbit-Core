// What a Taiwan investor has to open, sign or qualify for before a product
// can be traded (開戶與交易資格), as Taiwan's brokers and rules ask it. Each
// is an `access` event in the account log ({ key, t, from, until }): signed
// or applied for at `t`, in force from `from` (an account the broker has to
// approve opens the next Taiwan trading day), lapsing at `until` where the
// rule makes it yearly. Selling or closing what's held never needs any.
//
// - kyc (投資人風險屬性評估): the questionnaire every broker asks before
//   funds, futures or 複委託; a fund above the result's 風險收益等級 (RR) is
//   refused. Redone every year.
// - daytrade (現股當沖): the account open 3 months with 10 trades in the last
//   year, or a credit account; the 當日沖銷 風險預告書 and 概括授權同意書
//   signed; from the next trading day (有價證券當日沖銷交易作業辦法).
// - warrant (權證・牛熊證): the 認購(售)權證風險預告書 signed before the
//   first buy (TWSE 認購(售)權證買賣辦法 §4).
// - emerging (興櫃): the 興櫃股票風險預告書 signed before the first buy.
// - leveraged (槓桿・反向 ETF/ETN): one of a credit account, 10 warrant
//   trades or 10 TAIFEX futures trades in the last year, or a buy of one
//   before; and its 風險預告書 signed (TWSE 受益憑證買賣辦法 §4). Abroad the
//   same, and a non-professional investor buys no more than 2× long or 1×
//   short, and no leveraged or inverse ETN (受託買賣外國有價證券管理規則).
// - futures (期貨帳戶): KYC, the 期貨交易風險預告書 and 受託契約 signed; the
//   futures broker approves it for the next trading day. TAIFEX futures and
//   options open positions only once it's open.
// - sub (複委託帳戶): KYC, the 受託買賣外國有價證券 契約 and 風險預告書; the
//   next trading day. Every foreign stock and ETF buy goes through it.
// - pro (專業投資人, 自然人): KYC, NT$30,000,000 of means (財力證明), or
//   NT$15,000,000 with a single trade over NT$3,000,000 in the last two
//   years, and 10 trades in the last year (交易經驗); reviewed yearly
//   (境外結構型商品管理規則 §3).
//
// Accounts from before these rules came (ACCESS_SINCE) keep what they had:
// a product already bought there, or day trading the old rule allowed, is
// taken as signed for then (a broker has those papers on file). KYC isn't:
// it's asked for again (it's redone every year anyway). Before that moment
// nothing here is asked.
//
// 結匯: a person converts at most US$5,000,000 a calendar year each way
// (NT$ to foreign currency, and back; 外匯收支或交易申報辦法 §4); each
// conversion of NT$500,000 or more is declared (申報書) as it's made.
import { localDayOf, isEmerging, isSubBrokered } from '#kit/stock-markets.mjs';
import { isTradingDay } from '#kit/stock-holidays.mjs';
import { addMonths } from '#kit/stock-savings.mjs';

const DAY = 86_400_000;
const YEAR = 365 * DAY;

export const ACCESS = {
  kyc: { docs: [], valid: YEAR },
  daytrade: { docs: ['dayTradeRisk', 'dayTradeAuth'], wait: true },
  warrant: { docs: ['warrantRisk'] },
  emerging: { docs: ['emergingRisk'] },
  leveraged: { docs: ['leveragedRisk'] },
  futures: { docs: ['futuresRisk', 'futuresContract'], wait: true, kyc: true },
  sub: { docs: ['subRisk', 'subContract'], wait: true, kyc: true },
  pro: { docs: ['proApply', 'proNotice'], wait: true, kyc: true, valid: YEAR }
};
export const ACCESS_KEYS = Object.keys(ACCESS);

export const ACCOUNT_MIN_MONTHS = 3;
export const MIN_TRADES = 10;
export const PRO_MEANS = 30_000_000;
export const PRO_MEANS_WITH_TRADE = 15_000_000;
export const PRO_BIG_TRADE = 3_000_000;
export const FX_YEAR_CAP_USD = 5_000_000;
export const FX_DECLARE_TWD = 500_000;
export const ACCESS_SINCE = Date.parse('2026-10-24T00:00:00+08:00');

// The next Taiwan trading day's 08:00 after `now` (a broker approves an
// application the trading day after it's made).
export function nextBusinessOpen(now = Date.now()) {
  let t = now;
  for (let i = 0; i < 30; i++) {
    t += DAY;
    const day = localDayOf(t, 'TW');
    if (isTradingDay('TW', day)) return Date.parse(`${day}T08:00:00+08:00`);
  }
  return now + DAY;
}

const events = (account, key) => (account?.events || []).filter(e => e.type === 'access' && e.key === key).sort((a, b) => a.t - b.t);
const fills = account => (account?.events || []).filter(e => e.type === 'fill' && !e.forced && !e.maturity);

// What an account from before ACCESS_SINCE had then (see the top): whether `key` is taken as signed.
const SUB_KIND = new Set(['crypto', 'fx']);
function hadBefore(account, key) {
  if (!account?.created || account.created >= ACCESS_SINCE) return false;
  if (key === 'daytrade') return creditOpen(account, ACCESS_SINCE) || (monthsOpen(account, ACCOUNT_MIN_MONTHS, ACCESS_SINCE) && lastYear(account, ACCESS_SINCE) >= MIN_TRADES);
  const bought = test => fills(account).some(e => e.t < ACCESS_SINCE && test(e));
  if (key === 'warrant') return bought(e => e.side === 'buy' && e.kind === 'warrant');
  if (key === 'emerging') return bought(e => e.side === 'buy' && e.market === 'TW' && isEmerging(e.symbol));
  if (key === 'leveraged') return bought(e => e.side === 'buy' && (twLeveraged(e.symbol) || e.leveraged));
  if (key === 'sub') return bought(e => e.side === 'buy' && isSubBrokered(e.market) && !SUB_KIND.has(e.kind));
  if (key === 'futures') return bought(e => e.market === 'TAIFEX');
  return false;
}
// { open, pending (from when, or null), since, until, level, maxRR } for one key.
export function accessState(account, key, now = Date.now()) {
  const list = events(account, key).filter(e => e.t <= now);
  const last = list.at(-1);
  if (!last) return now >= ACCESS_SINCE && hadBefore(account, key) ? { open: true, pending: null, since: ACCESS_SINCE, until: null, kept: true } : { open: false, pending: null, since: null, until: null };
  const until = last.until ?? null;
  if (until != null && until <= now) return { open: false, pending: null, since: null, until, lapsed: true };
  const from = last.from ?? last.t;
  const base = { since: list[0].t, until, level: last.level ?? null, maxRR: last.maxRR ?? null };
  return from <= now ? { ...base, open: true, pending: null } : { ...base, open: false, pending: from };
}

const creditOpen = (account, now) => (account?.events || []).some(e => e.type === 'credit' && (e.from ?? e.t) <= now);
const monthsOpen = (account, months, now) => Boolean(account?.created) && addMonths(account.created, months) <= now;
const lastYear = (account, now, test = () => true) => fills(account).filter(e => e.t <= now && e.t > now - YEAR && test(e)).length;

// A Taiwan leveraged (code …L) or inverse (…R) ETF or ETN.
export const twLeveraged = symbol => /^\d{5,6}[LR]\.TWO?$/i.test(symbol || '');
// A foreign ETF or ETN's leverage from its name: { mult, inverse, etn }, or
// null when it's neither leveraged nor inverse. ("Short-Term", "Ultra-Short
// Duration" and "Long/Short" are bond and hedge funds, not short ones.)
const NOT_SHORT = /short[- ]?(term|duration|maturity|treasury|box|income|bond|investment|municipal|muni|high yield muni|horizon)|ultra[- ]?short[- ]?(duration|income|bond|fixed|investment|municipal|term|government|treasury|tax)|long[\s-]*\/?[\s-]*short/gi;
export function leverageOf(quote) {
  if (!quote) return null;
  if (quote.market === 'TW') return twLeveraged(quote.symbol) ? { mult: /R\.TWO?$/i.test(quote.symbol) ? 1 : 2, inverse: /R\.TWO?$/i.test(quote.symbol), etn: /^02/.test(quote.symbol) } : null;
  if (!['etf', 'bond', 'stock'].includes(quote.kind)) return null;
  // Hong Kong's leveraged and inverse products: HKEX codes 7200-7399 and
  // 7500-7599, named FL/XL (leveraged) or FI/XI (inverse), 二 two times.
  const hk = /^(\d{4})\.HK$/i.exec(quote.symbol || '');
  if (hk) {
    const n = Number(hk[1]);
    if (!((n >= 7200 && n <= 7399) || (n >= 7500 && n <= 7599))) return null;
    return { mult: /二|2/.test(quote.name || '') ? 2 : 1, inverse: /^[A-Z]?I/.test(quote.name || '') || /反向|inverse/i.test(quote.name || ''), etn: false };
  }
  // Tokyo's: レバレッジ (2×), インバース (−1×), ダブルインバース (−2×).
  if (quote.market === 'JP' || /\.T$/i.test(quote.symbol || '')) {
    const n = String(quote.name || '');
    if (/ダブルインバース|ダブル・インバース/.test(n)) return { mult: 2, inverse: true, etn: false };
    if (/インバース|ベア/.test(n)) return { mult: /(\d)倍/.test(n) ? Number(/(\d)倍/.exec(n)[1]) : 1, inverse: true, etn: false };
    if (/レバレッジ|ブル/.test(n)) return { mult: /(\d)倍/.test(n) ? Number(/(\d)倍/.exec(n)[1]) : 2, inverse: false, etn: false };
    if (!/[A-Za-z]/.test(n)) return null;
  }
  const name = String(quote.name || '').replace(NOT_SHORT, ' ');
  const etn = /\bETNs?\b|exchange[- ]traded notes?/i.test(name);
  // (A share is never leveraged; an ETN Yahoo calls one may be.)
  if (!name.trim() || (quote.kind === 'stock' && !etn)) return null;
  const m = /(-)?\s?(\d(?:\.\d+)?)\s?(?:[x×?](?![a-z])|(?=\s+inverse))/i.exec(name);
  let mult = m ? Number(m[2]) : /ultrapro|triple|\b3x/i.test(name) ? 3 : /ultra|double|leveraged/i.test(name) ? 2 : 1;
  const inverse = Boolean(m?.[1]) || /\bbear\b|inverse|\bshort\b|ultrashort/i.test(name);
  if (!m && /ultrashort/i.test(name)) mult = 2;
  if (!(mult > 1) && !inverse) return null;
  return { mult, inverse, etn };
}
// Whether a non-professional investor may buy it abroad: up to 2× long or
// 1× inverse, and no leveraged or inverse ETN.
export const retailLeverageOk = lev => !lev || (!lev.etn && (lev.inverse ? lev.mult <= 1 : lev.mult <= 2));

// The questionnaire (風險屬性評估): each answer's score, and the result.
export const KYC_QUESTIONS = [
  { id: 'years', scores: [0, 1, 2] },
  { id: 'goal', scores: [0, 1, 2] },
  { id: 'loss', scores: [0, 2, 4] },
  { id: 'horizon', scores: [0, 1, 2] },
  { id: 'known', scores: [0, 1, 2] },
  { id: 'drop', scores: [0, 1, 2] }
];
export const KYC_LEVELS = [
  { level: 'conservative', upTo: 4, maxRR: 2 },
  { level: 'balanced', upTo: 9, maxRR: 3 },
  { level: 'aggressive', upTo: Infinity, maxRR: 5 }
];
// answers: { years: 0..2, … } (each the index picked) → { score, level, maxRR }, or null if any is missing.
export function kycResult(answers = {}) {
  let score = 0;
  for (const q of KYC_QUESTIONS) {
    const i = answers[q.id];
    if (!Number.isInteger(i) || i < 0 || i >= q.scores.length) return null;
    score += q.scores[i];
  }
  const { level, maxRR } = KYC_LEVELS.find(x => score <= x.upTo);
  return { score, level, maxRR };
}

// What applying for `key` still needs: [{ key, have, want, from }]. `ctx`:
// { netWorthTWD }.
export function accessNeeds(account, key, ctx = {}, now = Date.now()) {
  const needs = [];
  const spec = ACCESS[key];
  if (!spec) return [{ key: 'unknown' }];
  if (spec.kyc && !accessState(account, 'kyc', now).open) needs.push({ key: 'kyc' });
  if (key === 'daytrade' && !creditOpen(account, now)) {
    if (!monthsOpen(account, ACCOUNT_MIN_MONTHS, now)) needs.push({ key: 'age', want: ACCOUNT_MIN_MONTHS, from: addMonths(account?.created || now, ACCOUNT_MIN_MONTHS) });
    const trades = lastYear(account, now);
    if (trades < MIN_TRADES) needs.push({ key: 'trades', have: trades, want: MIN_TRADES });
  }
  if (key === 'leveraged') {
    const q = leveragedQualified(account, now);
    if (!q.ok) needs.push({ key: 'leveragedWay', warrants: q.warrants, futures: q.futures, want: MIN_TRADES });
  }
  if (key === 'pro') {
    const worth = Math.round(Number(ctx.netWorthTWD) || 0);
    const big = fills(account).some(e => e.t <= now && e.t > now - 2 * YEAR && e.gross * (e.twd || 1) > PRO_BIG_TRADE);
    if (!(worth >= PRO_MEANS || (worth >= PRO_MEANS_WITH_TRADE && big))) needs.push({ key: 'means', have: worth, want: big ? PRO_MEANS_WITH_TRADE : PRO_MEANS });
    const trades = lastYear(account, now);
    if (trades < MIN_TRADES) needs.push({ key: 'trades', have: trades, want: MIN_TRADES });
  }
  return needs;
}

// Which of 槓反's ways in the account meets: { ok, credit, warrants, futures, before }.
export function leveragedQualified(account, now = Date.now()) {
  const credit = creditOpen(account, now);
  const warrants = lastYear(account, now, e => e.kind === 'warrant');
  const futures = lastYear(account, now, e => e.kind === 'fut');
  const before = fills(account).some(e => e.side === 'buy' && e.t <= now && (twLeveraged(e.symbol) || e.leveraged));
  return { ok: credit || warrants >= MIN_TRADES || futures >= MIN_TRADES || before, credit, warrants, futures, before };
}

// Signs or applies for `key`. Returns { account, event } or { error, needs }.
// `ctx`: { netWorthTWD, answers (kyc), docs (the keys of what was signed) }.
export function applyAccess(account, key, ctx = {}, now = Date.now()) {
  const spec = ACCESS[key];
  if (!spec) return { error: 'access' };
  const state = accessState(account, key, now);
  if (key !== 'kyc' && (state.open || state.pending)) return { error: 'accessDone' };
  const signed = new Set(ctx.docs || []);
  if (spec.docs.some(d => !signed.has(d))) return { error: 'accessDocs', docs: spec.docs.filter(d => !signed.has(d)) };
  const needs = accessNeeds(account, key, ctx, now);
  if (needs.length) return { error: 'accessNeeds', needs };
  const event = { id: `access:${key}:${now}`, type: 'access', key, t: now, from: spec.wait ? nextBusinessOpen(now) : now };
  if (spec.docs.length) event.docs = spec.docs;
  if (spec.valid) event.until = now + spec.valid;
  if (key === 'kyc') {
    const r = kycResult(ctx.answers);
    if (!r) return { error: 'kycAnswers' };
    Object.assign(event, r);
  }
  return { account: { ...account, events: [...account.events, event] }, event };
}

// What an order needs that the account doesn't have, or null. Only what
// opens or adds a position is asked: a sale of what's held, a buy back of a
// short and the broker's own sales never are. `opening`: the futures or
// options contracts the order opens. `rr`: a fund's 風險收益等級.
export function accessProblem(account, quote, { side, opening = 0, rr = null } = {}, now = Date.now()) {
  if (!quote || now < ACCESS_SINCE) return null;
  const open = key => accessState(account, key, now).open;
  const need = key => ({ error: 'accessNeeded', key, pending: accessState(account, key, now).pending });
  if (quote.market === 'TAIFEX') return opening > 0 && !open('futures') ? need('futures') : null;
  if (side !== 'buy') return null;
  if (quote.kind === 'fund' && quote.market === 'TWFUND') {
    const kyc = accessState(account, 'kyc', now);
    if (!kyc.open) return need('kyc');
    if (rr != null && rr > (kyc.maxRR ?? 0)) return { error: 'fundRisk', rr, max: kyc.maxRR, level: kyc.level };
    return null;
  }
  if (isSubBrokered(quote.market) && quote.kind !== 'crypto' && quote.kind !== 'fx' && !open('sub')) return need('sub');
  if (quote.kind === 'warrant' && !open('warrant')) return need('warrant');
  if (quote.market === 'TW' && isEmerging(quote.symbol) && !open('emerging')) return need('emerging');
  const lev = leverageOf(quote);
  if (lev) {
    if (quote.market !== 'TW' && !retailLeverageOk(lev) && !open('pro')) return { error: 'proOnly', mult: lev.mult, inverse: lev.inverse, etn: lev.etn };
    if (!open('leveraged')) return need('leveraged');
  }
  return null;
}

// This calendar year's 結匯 (Taiwan's year) in US$: { bought, sold, left } —
// NT$ turned into foreign currency, and foreign currency turned into NT$.
export function fxYear(account, rates = {}, now = Date.now()) {
  const year = localDayOf(now, 'TW').slice(0, 4);
  const usd = rates.USD || 1;
  let bought = 0;
  let sold = 0;
  for (const e of account?.events || []) {
    if (e.type !== 'fx' || e.t > now || localDayOf(e.t, 'TW').slice(0, 4) !== year) continue;
    if (e.from === 'TWD') bought += e.amount / (e.usd || usd);
    else if (e.to === 'TWD') sold += e.received / (e.usd || usd);
  }
  return { bought, sold, leftBuy: Math.max(0, FX_YEAR_CAP_USD - bought), leftSell: Math.max(0, FX_YEAR_CAP_USD - sold) };
}
// Whether a conversion fits the year's 結匯 (null) or the error.
export function fxCapProblem(account, { from, to, amount, received }, rates = {}, now = Date.now()) {
  if (from !== 'TWD' && to !== 'TWD') return null;
  const usd = rates.USD || 1;
  const y = fxYear(account, rates, now);
  const ntd = from === 'TWD' ? amount : received;
  const asked = ntd / usd;
  const left = from === 'TWD' ? y.leftBuy : y.leftSell;
  return asked > left + 1e-6 ? { error: 'fxYearCap', leftUSD: Math.floor(left), capUSD: FX_YEAR_CAP_USD } : null;
}
export const fxNeedsDeclare = ({ from, to, amount, received }) => (from === 'TWD' ? amount : to === 'TWD' ? received : 0) >= FX_DECLARE_TWD;
