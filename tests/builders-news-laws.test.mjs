import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lawNames, lawsOf, lawsPage } from '../builders/news-laws.js';

const items = [
  { k: '11:01139', n: '勞動基準法', p: 'N0030001', term: 11, open: 2, passed: '' },
  { k: '11:07162', n: '反滲透法', p: 'A0030317', term: 11, passed: '' },
  { k: '11:00001', n: '國家安全法', p: 'A0030028', term: 11 },
  { k: '11:00002', n: '民法', p: 'B0000001', term: 11 },
  { k: '11:00003', n: '公司法', p: 'J0080001', term: 11, dropped: true }
];
const names = lawNames(items);

test('a law by its full name or the short one; a headline about changing it is its bill', () => {
  const s = { id: 'a', title: '勞基法修正草案今付委', items: [['x', '涉反滲透法 議員交保'], ['y', '勞動基準法 加班費上限']] };
  assert.deepEqual(lawsOf(s, names), [
    { n: '勞動基準法', p: 'N0030001', k: '11:01139', bill: true, open: 2, passed: '' },
    { n: '反滲透法', p: 'A0030317', k: '11:07162', bill: false, open: 0, passed: '' }
  ]);
});

test('never two-character names, Hong Kong’s 國安法, or a dropped bill', () => {
  assert.deepEqual(lawsOf({ id: 'b', title: '港版國安法上路 觸犯民法 公司法修正', items: [] }, names), []);
  assert.deepEqual(lawsOf({ id: 'c', title: '國家安全法修法 三讀', items: [] }, names).map(l => l.n), ['國家安全法']);
});

test('the page: stories by id, and each bill’s stories for Law', () => {
  const p = lawsPage([{ id: 'a', title: '勞基法修正草案今付委', at: 2, items: [] }, { id: 'b', title: '颱風', at: 1, items: [] }], items, 5);
  assert.deepEqual(Object.keys(p.stories), ['a']);
  assert.deepEqual(p.bills['11:01139'], [['a', '勞基法修正草案今付委', 2]]);
});
