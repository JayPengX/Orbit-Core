// TAIFEX's 股票期貨 and ETF期貨: what a contract is, its price, margin and ticks,
// how the proxy reads TAIFEX's table for them, and the proxy filling one.
import test from 'node:test';
import assert from 'node:assert/strict';
import { futureOf, isFuture, tickSize, futFinal, stockFutureCodes, tradeCosts } from '../kit/stock-markets.mjs';
import { futQuote } from '../kit/stock-quotes.mjs';
import { futMargin } from '../kit/stock-account.mjs';
import { parseRates, parseSsfFinals, parseDaily } from '../taifex.js';
import { decideFills, cleanOrder } from '../stock-fill.js';

test('a stock future is its stock, 2,000 shares (小型 100); an ETF future 10,000 units (小型 1,000)', () => {
  assert.ok(stockFutureCodes().length > 250);
  assert.deepEqual(
    ['CDF', 'QFF', 'NYF', 'SRF'].map(c => futureOf(`${c}202611.TF`)).map(f => [f.underlying, f.mult, f.zh]),
    [['2330.TW', 2000, '台積電期'], ['2330.TW', 100, '小型台積電期'], ['0050.TW', 10000, '元大台灣50期'], ['0050.TW', 1000, '小型元大台灣50期']]
  );
  assert.equal(futureOf('TX202611.TF').underlying, '^TWII');
  assert.equal(isFuture('ZZZ202611.TF'), false);
  assert.equal(isFuture('TXO202611C46500.TF'), false);
  // (A TPEx stock's future is on its .TWO quote.)
  const otc = stockFutureCodes().map(c => futureOf(`${c}202611.TF`)).find(f => f.underlying.endsWith('.TWO'));
  assert.ok(otc);
});

test("a stock future moves at its stock's ticks; the index's in whole points", () => {
  assert.equal(tickSize('TAIFEX', 'fut', 2431, 'CDF202611.TF'), 5);
  assert.equal(tickSize('TAIFEX', 'fut', 24.3, 'CBF202611.TF'), 0.05);
  assert.equal(tickSize('TAIFEX', 'fut', 60, 'NYF202611.TF'), 0.05);
  assert.equal(tickSize('TAIFEX', 'fut', 46_500, 'TX202611.TF'), 1);
});

test('priced from its live stock plus the basis at the last settlement, to its tick; margin from TAIFEX\'s rates', () => {
  const t = Date.parse('2026-10-22T10:00:00+08:00');
  const under = { symbol: '2330.TW', price: 2400, prev: 2380, marketTime: t, line: [[t, 2400]], kind: 'stock', market: 'TW' };
  const table = { date: '2026-10-21', settle: { CDF202611: 2407 }, margin: {}, ssfRate: { CDF: [0.135, 0.1035] }, ssfFinal: { CDF202610: 2405.59 } };
  const q = futQuote('CDF202611.TF', under, table);
  // 2,400 + (2,407 − 2,380) = 2,427, to the 5: 2,425.
  assert.equal(q.price, 2425);
  assert.equal(q.kind, 'fut');
  assert.equal(q.market, 'TAIFEX');
  assert.deepEqual(q.margin, [Math.round(2425 * 2000 * 0.135), Math.round(2425 * 2000 * 0.1035)]);
  // An ETF's: TAIFEX's amount.
  const e = futQuote('NYF202611.TF', { ...under, symbol: '0050.TW', price: 60, prev: 60 }, { date: '2026-10-21', settle: { NYF202611: 60.3 }, margin: { NYF: [87_000, 67_000] } });
  assert.deepEqual(e.margin, [87_000, 67_000]);
  // With no quote, the fallback rate on its price.
  assert.deepEqual(futMargin('CDF202611.TF', null, 2000), [540_000, 414_000]);
  assert.equal(futFinal('CDF202610.TF', table), 2405.59);
  assert.equal(futFinal('TX202610.TF', { final: { 202610: 46_650 } }), 46_650);
});

test('costs: the fee a contract and 期交稅 on its value', () => {
  const c = tradeCosts({ market: 'TAIFEX', side: 'buy', kind: 'fut', gross: 2425, qty: 1, currency: 'TWD', symbol: 'CDF202611.TF' });
  assert.equal(c.commission, 30);
  assert.equal(c.tax, Math.round(2425 * 2000 * 0.00002));
});

test("TAIFEX's table: the stocks' settlements, margin rates and final prices", () => {
  const { settle } = parseDaily([
    { Date: '20261021', Contract: 'CDF', 'ContractMonth(Week)': '202611', SettlementPrice: '2431', TradingSession: '一般' },
    { Date: '20261021', Contract: 'CDF', 'ContractMonth(Week)': '202611', SettlementPrice: 'NULL', TradingSession: '盤後' },
    { Date: '20261021', Contract: 'CDF', 'ContractMonth(Week)': '202610/202611', SettlementPrice: '-', TradingSession: '一般' }
  ]);
  assert.deepEqual(settle, { CDF202611: 2431 });
  assert.deepEqual(parseRates([{ Contract: 'CDF', InitialMarginRate: '13.50%', MaintenanceMarginRate: '10.35%' }]), { CDF: [0.135, 0.1035] });
  assert.deepEqual(parseSsfFinals([{ Contract: 'CDF', ContractDeliveryMonth: '202610', TheFinalSettlementPrice: '2405.59' }]), { CDF202610: 2405.59 });
});

test('the proxy fills a stock future at its live stock plus the basis', async () => {
  const at = s => Date.parse(`${s}+08:00`);
  const t = at('2026-10-22T10:00:00');
  const meta = { symbol: '2330.TW', regularMarketPrice: 2400, chartPreviousClose: 2380, currency: 'TWD', instrumentType: 'EQUITY', exchangeTimezoneName: 'Asia/Taipei', regularMarketTime: t / 1000 - 60, currentTradingPeriod: { regular: { start: at('2026-10-22T09:00:00') / 1000, end: at('2026-10-22T13:30:00') / 1000 } } };
  const read = async url =>
    url.startsWith('https://taifex.quadra/')
      ? { date: '2026-10-21', settle: { CDF202611: 2407 }, margin: {}, ssfRate: { CDF: [0.135, 0.1035] }, final: {} }
      : { spark: { result: [{ symbol: '2330.TW', response: [{ meta, timestamp: [], indicators: { quote: [{ close: [] }] } }] }] } };
  const order = cleanOrder({ id: 'ssf1', symbol: 'CDF202611.TF', side: 'buy', type: 'market', qty: 1, t: t - 1000, market: 'TAIFEX', kind: 'fut', currency: 'TWD' });
  const { fills } = await decideFills([order], { read, now: t });
  assert.equal(fills.ssf1?.quote, 2425);
});

test('a warrant from TWSE’s own quotes: last trade, else the best bid, else the reference price', async () => {
  const { misQuote } = await import('../kit/stock-quotes.mjs');
  const q = misQuote('030001.TW', { c: '030001', ex: 'tse', n: '友達台新6A購01', z: '-', y: '0.7200', b: '0.6700_0.5100_', a: '0.6800_', d: '20261022', t: '13:30:00' });
  assert.equal(q.price, 0.67);
  assert.equal(q.prev, 0.72);
  assert.equal(q.ask, 0.68);
  assert.equal(q.kind, 'warrant');
  assert.equal(q.marketTime, Date.parse('2026-10-22T13:30:00+08:00'));
  assert.equal(misQuote('030002.TW', { z: '0.9100', y: '0.8', b: '0.9_', a: '-' }).price, 0.91);
  assert.equal(misQuote('030003.TW', { z: '-', y: '0.8', b: '-', a: '-' }).price, 0.8);
  assert.equal(misQuote('030004.TW', { z: '-', y: '-', b: '-', a: '-' }), null);
});
