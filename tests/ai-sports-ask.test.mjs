// 問比賽 (ai-features.js 'sports-ask'): the line's numbers the facts', tables by id, marks a row's label;
// and F1's 勝負關鍵 says 竿位 (Taiwan's word) only of the car that started first.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FEATURES } from '../ai-features.js';

const facts = `Today: 11/11 (Taiwan).
[mine] 我的球隊排名: 湖人, NBA · 西區, 第 3 名; 勇士, NBA · 西區, 第 8 名
[next] 我的球隊下一場: 勇士 vs 金塊, 11/11（三）19:00; 湖人 @ 太陽, 11/12（四）19:30`;

test('sports-ask: tables by id, marks by label, a number not theirs refused', () => {
  const f = FEATURES['sports-ask'];
  const input = f.input({ question: '湖人下一場？', facts });
  assert.deepEqual(f.clean({ line: '湖人 11/12 19:30 打太陽。', show: ['next', 'nope'], mark: ['湖人 @ 太陽, 11/12（四）19:30', '雷霆'] }, input), { line: '湖人 11/12 19:30 打太陽。', show: ['next'], mark: ['湖人 @ 太陽'] });
  assert.equal(f.clean({ line: '湖人排第 2 名。', show: ['mine'], mark: [] }, input), null);
});

test('f1-story: 竿位 only for the car that started first', () => {
  const f = FEATURES['f1-story'];
  const race = 'Grand Prix race: X, 57 laps.\n1 George Russell #63 (Mercedes), from 1, 1 stop\n2 Oscar Piastri #81 (McLaren), from 5, 1 stop';
  const out = f.clean({ points: [{ lap: 0, no: '81', zh: '杆位第5起跑，起跑後即退賽', en: 'Started 5th, out at once' }, { lap: 0, no: '63', zh: '杆位起跑一路領先', en: 'Led from the start' }] }, { facts: race, laps: 57 });
  assert.equal(out.points[0].zh, '第5起跑，起跑後即退賽');
  assert.equal(out.points[1].zh, '竿位起跑一路領先');
});
