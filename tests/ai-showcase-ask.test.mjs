// The showcase's 問 Orbit ('showcase-ask'):
// the AI only picks cards it was given and says a line whose numbers are theirs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FEATURES } from '../ai-features.js';

test('showcase-ask: the showcase’s own pass, the cards given only', () => {
  const f = FEATURES['showcase-ask'];
  assert.equal(f.app, 'showcase');
  assert.deepEqual(f.models, ['haiku', 'luna', 'lite']);
  const i = f.input({ q: '怎麼做到不花錢', cards: [{ id: 'cheap', title: '不花錢', text: '免費額度內 10 萬次' }, { id: 'team', title: '怎麼做', text: 'Jay 決定' }], lang: 'zh' });
  assert.deepEqual(f.clean({ line: '都在免費額度內（10 萬次）。', ids: ['cheap', 'x'] }, i), { line: '都在免費額度內（10 萬次）。', points: [], ids: ['cheap'] });
  assert.deepEqual(f.clean({ line: '一個月 50 萬次。', ids: ['cheap'] }, i), { line: '', points: [], ids: ['cheap'] });
  assert.equal(f.clean({ line: '', ids: [] }, i), null);
  // (Its facts: a point with a number the cards don't hold is left out; a repo's card, `r:…`, is read from, never opened.)
  const j = f.input({ q: '什麼時候決定的', cards: [{ id: 'cheap', title: '不花錢', text: '免費額度內 10 萬次' }, { id: 'r:Orbit-Core:3', title: 'rule, 2026-11-13', text: '11-13 Orbit pays only for its domain' }], lang: 'zh' });
  assert.deepEqual(f.clean({ line: 'Jay 在 11-13 決定只付網域的錢。', points: ['免費額度內 10 萬次。', '一年省下 900 元。'], ids: ['cheap', 'r:Orbit-Core:3'] }, j), { line: 'Jay 在 11-13 決定只付網域的錢。', points: ['免費額度內 10 萬次。'], ids: ['cheap'] });
});
