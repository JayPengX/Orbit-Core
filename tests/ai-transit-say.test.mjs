// 用說的查路線 (ai-features.js 'transit-say'): places only as said or one of yours,
// a time only as HH:MM, and "no place said" an answer (the phone asks again), not a failure.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FEATURES } from '../ai-features.js';

const f = FEATURES['transit-say'];
const input = text => f.input({ text, now: '2026-11-11 10:00 週三', places: ['家', '學校'] });

test('transit-say: the place as said, the time read', () => {
  assert.deepEqual(f.clean({ from: '', to: '台大醫院', by: 'arrive', day: 1, time: '8:00' }, input('明天八點前到台大醫院')), { from: '', to: '台大醫院', by: 'arrive', day: 1, time: '08:00' });
  assert.deepEqual(f.clean({ from: '家', to: '學校', by: 'depart', day: 0, time: '' }, input('從家去學校')), { from: '家', to: '學校', by: 'now', day: 0, time: '' });
});

test('transit-say: a place the AI made up is refused; none said is an answer, the time kept', () => {
  assert.equal(f.clean({ from: '', to: '台北101', by: 'now', day: 0, time: '' }, input('明天八點前到台大醫院')), null);
  assert.deepEqual(f.clean({ from: '', to: '', by: 'arrive', day: 1, time: '08:00' }, input('明天早上八點')), { from: '', to: '', by: 'arrive', day: 1, time: '08:00' });
});
