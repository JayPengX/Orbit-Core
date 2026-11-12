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

test('admin: 總覽’s 外部來源 cell names two sources at most (five names filled six lines at 320 px)', () => {
  assert.ok(page.includes("const few = (list, word) => (list.length > 2 ? `${names(list.slice(0, 1))}等 ${list.length} 個${word}` : `${names(list)} ${word}`);"));
  assert.ok(page.includes("bad.length ? few(bad, '壞了') : warn.length ? few(warn, '不穩')"));
});

test('admin: 現在在用’s priority passes are the account list’s own rows, under 優先通行 (no underlined bare reference)', () => {
  assert.match(page, /<div id="door-pri"><\/div>/);
  assert.match(page, /<h3 class="door-pri-head">優先通行<\/h3><div class="q-rowcard">\$\{priority\.map\(p => acctItem\(/);
  assert.doesNotMatch(page, /el\('button', \{ class: 'link', text: p\.ref/);
});

test('admin: an action says what it did after the sheet redraws (a toast), and what the server would refuse is said before the check', () => {
  assert.match(page, /import \{ icons, tileHtml, heroCardHtml, escHtml, toast \} from '\.\.\/kit\/ui\.mjs';/);
  assert.match(page, /dialog\.addEventListener\('close', sayOn\);\nasync function openAccount\(ref\) \{\n  sayOn\(\);/);
  assert.match(page, /if \(ok\.textContent !== '已取消'\) box\.saidAt = Date\.now\(\);/);
  const reset = page.slice(page.indexOf("const reset = action('重置帳戶'"), page.indexOf('resetBtn.onclick'));
  assert.ok(reset.indexOf('if (!asPass(pass.value)) throw') < reset.indexOf('await sure('), '重置: the pass first');
  const grant = page.slice(page.indexOf("const grant = action('調整金額'"), page.indexOf('grantBtn.onclick'));
  assert.ok(grant.indexOf('throw new Error(WHY.ADMIN_BAD_AMOUNT)') > 0 && grant.indexOf('throw new Error(WHY.ADMIN_BAD_AMOUNT)') < grant.indexOf('await sure('), '調整金額: the amount and reason first');
  const del = page.slice(page.indexOf("const del = action('刪除帳戶'"), page.indexOf('delBtn.onclick'));
  assert.ok(del.indexOf('if (confirmRef.value.trim() !== a.ref) throw new Error(WHY.ADMIN_CONFIRM);') < del.indexOf('await sure('), '刪除: the reference first');
});

test('admin: 健康’s deploy rows name an app’s usual deploy by the app alone; a failed read of 除錯週報 never leaves 讀取中…', () => {
  assert.ok(page.includes("runRow(run, /^Deploy to Cloudflare$/i.test(run.name) ? name : `${name} · ${run.name}`, repo)"));
  const bugs = page.slice(page.indexOf('async function loadBugs()'), page.indexOf("$('bugs-mark').innerHTML"));
  assert.match(bugs, /\$\('bugs-sum'\)\.textContent = '';\n\s*\$\('bugs-error'\)\.textContent = `讀不到：\$\{e\.message\}`;/);
});

test('admin: on a phone tiles sit two to a row and a lone last one takes the row; a head’s button row drops under its words; links land below the top bar', () => {
  assert.ok(page.includes('.tiles > :last-child:nth-child(odd) { grid-column: 1 / -1; }'));
  assert.ok(page.includes('.pane-head:has(> .row) { flex-wrap: wrap; }'));
  assert.ok(page.includes('main [id] { scroll-margin-top: calc(env(safe-area-inset-top) + 76px); }'));
  assert.doesNotMatch(page, /placeholder="你的 Orbit Pass"/, 'cut at 320 px');
});

test('admin: 工具’s shortcut grid holds 工具’s own six cards (現在在用 is 帳戶’s: its tile here led nowhere and sat alone on a row)', () => {
  assert.ok(page.includes("PLACES.filter(p => p[1] === 'tools' && p[5])"));
  const places = [...page.matchAll(/\['[^']+', '(\w+)', '\w+', '#[0-9a-f]+', '[^']*', '([\w-]+)'\]/g)].filter(m => m[1] === 'tools');
  assert.equal(places.length, 6);
  for (const [, , to] of places) assert.ok(page.includes(`id="${to}"`), to);
});
