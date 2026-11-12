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

test('admin: 健康’s badge counts the problems listed at the top of 健康, each a tap to its part (Jay 2026-11-06: "what is the red dot 1 for")', () => {
  assert.match(page, /<div class="attn" id="health-attn"/);
  assert.match(page, /const bad = healthIssues\(\);\n\s*\$\('health-badge'\)\.hidden = !bad\.length;/);
  assert.match(page, /\$\('health-attn'\)\.innerHTML = bad\.map/);
  // Every cell has a place to point at, and that place is on the page.
  const at = page.match(/const HEALTH_AT = \{([^}]*)\}/)[1];
  for (const [, k, id] of at.matchAll(/(\w+): '([\w-]+)'/g)) assert.ok(page.includes(`id="${id}"`), `${k} → ${id}`);
  for (const k of [...page.matchAll(/\['(\w+)', '[^']+', '\w+'\]/g)].map(m => m[1]).filter(k => ['guard', 'pace', 'jobs', 'sources', 'deploys', 'secrets', 'errors', 'ai'].includes(k))) assert.match(at, new RegExp(`\\b${k}:`));
});

test('admin: every check and failure is the family’s q-ask dialog, never the browser’s confirm() or alert(); app names are the brand’s', () => {
  const code = page.slice(page.indexOf('<script type="module">')).replace(/\/\/.*$/gm, '');
  assert.doesNotMatch(code, /(?<![\w.$])(confirm|alert|prompt)\(/);
  assert.match(code, /const sure = \(title, \{ body = '', ok = '繼續', danger = false, only = false \} = \{\}\) =>/);
  assert.match(code, /el\('dialog', \{ class: `q-ask/);
  assert.ok(page.includes("stock: 'Orbit Securities'"), 'Securities is Orbit Securities, as on its icon');
});

test('admin: the search’s account rows keep a square avatar and the apps’ short names (a stretched avatar pushed the apps onto four lines)', () => {
  assert.ok(page.includes('.hit > span:not(.q-tile):not(.av) { flex: 1 1 0; min-width: 0; }'));
  assert.ok(page.includes('.hit > .av { flex: none; }'));
  assert.match(page, /w\.apps\.map\(k => BRANDS\[k\]\?\.short \|\| appName\(k\)\)\.join\('、'\)/);
});
