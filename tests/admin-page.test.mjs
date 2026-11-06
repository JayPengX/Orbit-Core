// The admin page's frame: its tabs and the 證券的錢 sheet (Jay 2026-11-06:
// 金流 is no tab of its own, it shows only Securities; no trace of a gone app).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const page = readFileSync(new URL('../site/admin/index.html', import.meta.url), 'utf8');

test('admin: no 金流 tab; the bar has one column per tab', () => {
  const tabs = [...page.matchAll(/<button data-view="(\w+)"/g)].map(m => m[1]);
  assert.equal(tabs.includes('money'), false);
  assert.equal(page.includes('data-pane="money"'), false);
  const cols = Number(page.match(/\.tabs \{[^}]*grid-template-columns: repeat\((\d+),/)[1]);
  assert.equal(cols, tabs.length);
});

test('admin: Securities’ money is a sheet, opened from 總覽, with every part it draws', () => {
  const sheet = page.slice(page.indexOf('<dialog id="money"'), page.indexOf('</dialog>', page.indexOf('<dialog id="money"')));
  assert.ok(sheet.length > 0, 'the sheet is there');
  for (const id of ['mo-error', 'mo', 'mo-tiles', 'mo-where', 'mo-given', 'mo-own', 'mo-gov', 'mo-taxed', 'mo-note']) assert.ok(sheet.includes(`id="${id}"`), id);
  assert.match(page, /data-go="money"/, '總覽 links to it');
  assert.match(page, /g\?\.dataset\.go === 'money'\) return openMoney/, 'a link to it opens the sheet');
});

test('admin: no Slips anywhere on the page', () => {
  assert.doesNotMatch(page, /\bslips?\b|Slips/i);
});

test('admin: the money sheet in plain words, none of the old jargon (Jay 2026-11-06: "what is 四方")', () => {
  const at = page.indexOf('// ---- 金流 ----');
  const parts = page.slice(page.indexOf('<dialog id="money"'), page.indexOf('</dialog>', page.indexOf('<dialog id="money"'))) + page.slice(at, page.indexOf('\n}\n', at + 4000));
  for (const word of ['四方', '對帳', 'Orbit 賺', '玩家', '系統淨', '政府淨收']) assert.equal(parts.includes(word), false, word);
});
