// Orbit Law's figures, notices and bills, matched to a question.
import test from 'node:test';
import assert from 'node:assert/strict';
import { matchFacts, matchNews, matchBills, expand, groundPrompt, groundOut } from '../law-ground.js';

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
