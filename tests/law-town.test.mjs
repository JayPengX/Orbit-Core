// /law-ask's mode 'town': one member's 總質詢 at a 代表會, from Orbit Law's reading of its transcript, every
// point citing the turns it rests on.
import test from 'node:test';
import assert from 'node:assert/strict';
import { townAsk, townTurns, checkTown, townPrompt } from '../law-town.js';
import { readAsk } from '../law.js';

const paper = {
  d: '2026-09-30',
  nth: '第一天',
  turns: [
    { w: '林啟賢', r: '主席', t: '來，我們請何宜芯代表。' },
    { w: '何宜芯', r: '代表', t: '仁義市場整建期間的門是關起來的還是開放的？' },
    { w: '邵慧芬', r: '所長', t: '早上8點到晚上8點有管制。' },
    { w: '林啟賢', r: '主席', t: '來，我們請張美珠代表。' }
  ],
  asks: [{ w: '何宜芯', from: 1, to: 2, gist: '仁義市場的門' }]
};

test('town: the ask is a township, its session file, a government PDF and a question number', () => {
  const ok = { mode: 'town', tc: '10004010', file: 't10-8r', url: 'https://www.zhubei.gov.tw/admin/upload/twgov_file_1.pdf', n: 0 };
  assert.equal(townAsk(ok), true);
  assert.deepEqual(readAsk(ok), { mode: 'town', tc: '10004010', file: 't10-8r', url: ok.url, n: 0, lang: 'zh' });
  for (const bad of [{ tc: '1' }, { file: '../x' }, { url: 'https://evil.com/a.pdf' }, { url: 'https://www.zhubei.gov.tw/a.html' }, { n: -1 }, { n: 1.5 }]) assert.equal(readAsk({ ...ok, ...bad }), 'town', JSON.stringify(bad));
});

test('town: one member’s turns, numbered; a point stays only on turns it was given', () => {
  const got = townTurns(paper, 0);
  assert.deepEqual(got.rows.map(r => [r.key, r.w]), [['1', '何宜芯'], ['2', '邵慧芬']]);
  assert.equal(townTurns(paper, 3), null);
  assert.match(townPrompt('竹北市民代表會 第一天', got.ask, got.rows, 'zh'), /\[turn "2"\] 邵慧芬（所長）/);
  const out = checkTown({ answer: '何宜芯問市場的門。', points: [{ text: '早晚8點管制', cites: ['turn 2'] }, { text: '沒有的', cites: ['9'] }, { text: '沒出處', cites: [] }], promised: '', covered: true }, got.rows);
  assert.deepEqual(out.points, [{ text: '早晚8點管制', cites: ['2'] }]);
  assert.deepEqual(out.quotes, { 2: ['邵慧芬', '所長', '早上8點到晚上8點有管制。'] });
  assert.equal(out.covered, true);
});
