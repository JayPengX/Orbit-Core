// Orbit 助理 (ai-features.js 'orbit-ask') and the showcase's 問 Orbit ('showcase-ask'):
// the AI only picks facts or cards it was given and says a line whose numbers are theirs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FEATURES } from '../ai-features.js';

const ask = FEATURES['orbit-ask'];
const facts = [
  { id: 'f1', app: 'orbit', text: '明天（11/12 週四） 上課 08:10–16:00: 5 體育 13:10（戶外）' },
  { id: 'f2', app: 'weather', text: '明天（11/12 週四） 天氣: 雨傘：要帶，15時 70%' },
  { id: 'f3', app: 'match', text: '追蹤的比賽: 湖人 vs 勇士, 明天 10:30，正在上第3節數學' }
];
const input = q => ask.input({ q, now: '2026-11-11 21:00 Wed', facts, apps: ['weather', 'transit', 'match'], lang: 'zh' });

test('orbit-ask: any app may ask, models of one class from two makers', () => {
  assert.equal(ask.app, '*');
  assert.deepEqual(ask.models, ['sonnet', 'sol']);
  assert.equal(ask.input({ q: '', now: 'x' }), null);
});

test('orbit-ask: only the facts given, numbers from them, an app only from the list', () => {
  const i = input('明天要注意什麼');
  assert.deepEqual(ask.clean({ line: '明天下午有體育課又會下雨（70%），記得帶傘。', ids: ['f2', 'f1', 'f9', 'f2'], app: 'law' }, i), { line: '明天下午有體育課又會下雨（70%），記得帶傘。', ids: ['f2', 'f1'], app: '' });
  // (A number the facts don't hold: the line goes, the rows stay.)
  assert.deepEqual(ask.clean({ line: '明天降雨 90%。', ids: ['f2'], app: '' }, i), { line: '', ids: ['f2'], app: '' });
  assert.equal(ask.clean({ line: '', ids: [] }, i), null);
  assert.equal(ask.clean({ line: '去問天氣。', ids: [], app: 'weather' }, i).app, 'weather');
});

test('showcase-ask: the showcase’s own pass, the cards given only', () => {
  const f = FEATURES['showcase-ask'];
  assert.equal(f.app, 'showcase');
  assert.deepEqual(f.models, ['haiku', 'luna']);
  const i = f.input({ q: '怎麼做到不花錢', cards: [{ id: 'cheap', title: '不花錢', text: '免費額度內 10 萬次' }, { id: 'team', title: '怎麼做', text: 'Jay 決定' }], lang: 'zh' });
  assert.deepEqual(f.clean({ line: '都在免費額度內（10 萬次）。', ids: ['cheap', 'x'] }, i), { line: '都在免費額度內（10 萬次）。', ids: ['cheap'] });
  assert.deepEqual(f.clean({ line: '一個月 50 萬次。', ids: ['cheap'] }, i), { line: '', ids: ['cheap'] });
  assert.equal(f.clean({ line: '', ids: [] }, i), null);
});
