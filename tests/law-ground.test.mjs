// Orbit Law's figures, notices and bills, matched to a question.
import test from 'node:test';
import assert from 'node:assert/strict';
import { matchFacts, matchNews, matchBills, matchBudgets, budgetYear, budgetMoney, expand, groundPrompt, groundOut } from '../law-ground.js';

test('synonyms count both ways: 基本工資 finds 最低工資', () => {
  assert.match(expand('基本工資多少'), /最低工資/);
  assert.match(expand('時薪'), /每小時工資/);
  assert.equal(matchFacts([{ id: 'w', k: ['最低工資'] }, { id: 'x', k: ['勞保'] }], '基本工資多少').map(f => f.id).join(), 'w');
});

test('news: title pairs 2, text 0.25, a score of 4 at least, the newer first on a tie', () => {
  const news = [
    ['2024-01-01', 'A', '最低工資調整', 'https://a/1', ''],
    ['2025-01-01', 'B', '最低工資調整', 'https://a/2', ''],
    ['2025-02-01', 'C', '工資', 'https://a/3', '最低工資'],
    ['2025-03-01', 'D', '道路交通', 'https://a/4', '']
  ];
  assert.deepEqual(matchNews(news, '最低工資怎麼調整').map(n => n[3]), ['https://a/2', 'https://a/1']);
});

test('bills: those of a law the question names, newest first; else 立法院 words and a shared name', () => {
  const items = [
    { k: 'a', n: '勞動基準法第三十二條修正草案', stage: 1, u: '2026-01-01' },
    { k: 'b', n: '勞動基準法部分條文修正草案', stage: 3, u: '2026-06-01' },
    { k: 'c', n: '中央政府總預算案', stage: 2, u: '2026-09-01' }
  ];
  assert.deepEqual(matchBills(items, '勞動基準法加班').map(b => b.k), ['b', 'a']);
  assert.deepEqual(matchBills(items, '總預算審查到哪了').map(b => b.k), ['c']);
  assert.deepEqual(matchBills(items, '加班費怎麼算'), [], 'no 立法院 words, no law named');
});

test('nothing matched: no block, nothing added to the answer', () => {
  const g = { facts: [], news: [], bills: [] };
  assert.equal(groundPrompt(g), '');
  assert.deepEqual(groundOut(g), {});
});

test('budgets: the year asked (民國 or western), else the newest 年度 only; amounts only where given', () => {
  const budgets = [
    { k: '115', title: '中華民國115年度中央政府總預算案', stage: '公布', last: '2026-01-20', flow: [['2025-08-28', '行政院函送'], ['2025-09-10', '一讀'], ['2026-01-10', '三讀'], ['2026-01-20', '公布']] },
    { k: '116', title: '中華民國116年度中央政府總預算案', stage: '委員會審查', last: '2026-10-15', flow: [['2026-08-28', '行政院函送']] },
    { k: '115-a1', title: '115年度中央政府總預算追加預算案', stage: '一讀', last: '2026-09-01', flow: [] }
  ];
  assert.equal(budgetYear('2027年預算'), '116');
  assert.equal(budgetYear('116年度總預算'), '116');
  assert.deepEqual(matchBudgets(budgets, '115年度總預算現在怎樣').map(b => b.k), ['115-a1', '115']);
  assert.deepEqual(matchBudgets(budgets, '總預算審到哪了').map(b => b.k), ['116']);
  assert.deepEqual(matchBudgets([...budgets, { k: '112', title: '112年度中央政府總預算案', last: '2026-10-13' }], '總預算審到哪了').map(b => b.k), ['116'], 'an old year with a new date is not current');
  assert.deepEqual(matchBudgets(budgets, '加班費怎麼算'), []);
  const g = { facts: [], news: [], bills: [], budgets: matchBudgets(budgets, '115年度預算') };
  const p = groundPrompt(g);
  assert.match(p, /立法院進度/);
  assert.match(p, /2026-01-10 三讀 → 2026-01-20 公布/);
  assert.doesNotMatch(p, /行政院函送/, 'the last 3 steps only');
  assert.match(p, /never give a figure for it/);
  assert.equal(budgetMoney({ passed: true, total: 300_000_000, asked: 310_000_000, cut: 10_000_000, top: [['國防部主管', 50_000_000, 48_000_000]] }), '法定預算歲出 3,000億元；原送預算案 3,100億元；立法院刪減 100億元；最大的主管：國防部主管 500億元（上年 480億元）');
  assert.deepEqual(groundOut(g).bills.map(b => [b.k, b.stage]), [['budget:115-a1', -1], ['budget:115', -1]]);
});
