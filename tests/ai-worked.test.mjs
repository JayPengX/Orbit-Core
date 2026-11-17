// An ask's answer may write a number it worked out from the facts, checked
// here (Jay 11-17: 餐飲 3,683 of 5,820 without the share asked for).
import test from 'node:test';
import assert from 'node:assert/strict';
import { worked, numbersWorked } from '../ai-util.js';
import { FEATURES } from '../ai-features.js';

const facts = '[cat0] 11月 (11/1–11/17) 支出 5820: 餐飲 3683; 數位 2081; 交通 45; 稅費 11';

test('a share, a total and a gap worked from the facts pass; a made-up one fails', () => {
  const calc = [{ n: 63.3, op: 'pct', of: [3683, 5820] }, { n: 3728, op: 'sum', of: [3683, 45] }, { n: 1602, op: 'diff', of: [3683, 2081] }];
  assert.deepEqual(worked(calc, facts).map(n => Math.round(n)), [63, 3728, 1602]);
  assert.ok(numbersWorked('餐飲花3683，佔總支出的63%', facts, calc));
  assert.ok(numbersWorked('佔63.3%', facts, calc));
  assert.ok(!numbersWorked('佔70%', facts, calc));
  assert.ok(!numbersWorked('佔63%', facts, []));
  // (An operand not in the facts: the calc is dropped.)
  assert.ok(!numbersWorked('佔50%', facts, [{ n: 50, op: 'pct', of: [2910, 5820] }]));
});

test('money-ask keeps a worked share and drops a guessed one', () => {
  const f = FEATURES['money-ask'];
  const ok = f.clean({ line: '11月到今天餐飲花3683，佔總支出的63%。', show: ['cat0'], mark: ['餐飲'], calc: [{ n: 63, op: 'pct', of: [3683, 5820] }] }, { facts });
  assert.equal(ok.line, '11月到今天餐飲花3683，佔總支出的63%。');
  assert.equal(f.clean({ line: '餐飲佔總支出的65%。', show: ['cat0'], mark: [], calc: [{ n: 65, op: 'pct', of: [3683, 5820] }] }, { facts }), null);
});
