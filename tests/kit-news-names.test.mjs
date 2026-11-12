// A name in the news (kit/news-outlets.mjs namesRe): News' 你關心的, Securities' 持股新聞.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { namesRe, storyText } from '../kit/news-outlets.mjs';

test('a name matches as written, a code only standing alone, never a short word by chance', () => {
  const re = namesRe(['台積電', 'TSMC', 'Taiwan Semiconductor', '人'], ['2330']);
  assert.ok(re.test('台積電法說會'));
  assert.ok(re.test('Taiwan Semiconductor beats'));
  assert.ok(re.test('股王2330大漲'));
  assert.ok(!re.test('12330 點'), 'a code inside a longer number');
  assert.ok(!re.test('人'), 'one character is too short');
  assert.equal(namesRe(['Heat']), null, 'a short English word is a word, not a name');
  assert.match(storyText({ title: 'a', items: [['x', 'b']], tw: { items: [['y', 'c']] } }), /a\nb\nc/);
});

test("an outlet's mark: Google's icon for its site, or the host or file named where Google has none", async () => {
  const { OUTLETS, ICON_SITE, outletIcon } = await import('../kit/news-outlets.mjs');
  for (const id of Object.keys(ICON_SITE)) assert.ok(OUTLETS[id], id);
  assert.match(outletIcon('bbc'), /s2\/favicons\?domain=bbc\.com&sz=64$/);
  assert.match(outletIcon('pts', 128), /domain=news\.pts\.org\.tw&sz=128$/);
  assert.match(outletIcon('ctv'), /^https:\/\/www\.ctv\.com\.tw\/.+\.ico$/);
  assert.equal(outletIcon('nope'), '');
});
