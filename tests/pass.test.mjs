// The Quadra Pass sheet and its guides (help.mjs, pass.mjs), and the brand
// (brand.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
const { HELP, HELP_ORDER } = await import('../kit/help.mjs');
const kit = await import('#kit/quadra.mjs');
const brand = await import('../kit/brand.mjs');

test('help covers every app in both languages; every string exists in both', () => {
  for (const app of HELP_ORDER) {
    assert.ok(HELP[app].zh.length && HELP[app].zh.length === HELP[app].en.length, app);
    HELP[app].zh.forEach((s, i) => assert.equal(s[0], HELP[app].en[i][0]));
  }
});

test('the Pass sheet: every string in both languages; every tab named', async () => {
  const src = readFileSync(new URL('../kit/pass.mjs', import.meta.url), 'utf8');
  const { STRINGS } = await import('../kit/pass.mjs');
  assert.deepEqual(Object.keys(STRINGS.en).sort(), Object.keys(STRINGS.zh).sort());
  for (const tab of ['pass', 'looks', 'apps', 'help']) assert.ok(STRINGS.zh[`tab_${tab}`] && STRINGS.en[`tab_${tab}`], tab);
  // The Pass is the account and the family: no money on it (money is Securities').
  assert.doesNotMatch(src, /money\(|truth|worthOf|loanCard/);
  for (const key of new Set([...src.matchAll(/\bt\('([A-Za-z_]+)'/g)].map(m => m[1]))) assert.ok(key in STRINGS.zh, key);
  assert.doesNotMatch(JSON.stringify(STRINGS), /Quadra Hub|Fixtures/);
  // Every frame has a name in both languages and its own style; Plus is gone from the sheet.
  const css = readFileSync(new URL('../kit/quadra.css', import.meta.url), 'utf8');
  for (const { id } of kit.FRAMES) assert.ok(STRINGS.zh[`frame_${id}`] && STRINGS.en[`frame_${id}`] && css.includes(`.q-frame-${id} {`), id);
  assert.doesNotMatch(src, /openPlus|plusMember|PLUS\./);
});

test('the brand: Quadra is where the money is, Orbit the everyday tools; ids never change', () => {
  const family = id => kit.APPS[id].family;
  assert.deepEqual(Object.keys(kit.APPS).filter(id => family(id) === 'quadra'), ['stock', 'odds']);
  assert.deepEqual(Object.keys(kit.APPS).filter(id => family(id) === 'orbit').sort(), ['beats', 'law', 'match', 'orbit', 'slip', 'transit', 'vocab', 'weather']);
  assert.equal(kit.APPS.match.name, 'Orbit Sports');
  assert.equal(kit.APPS.vocab.name, 'Orbit Words');
  assert.ok(Object.values(kit.APPS).every(a => a.related === (a.family === 'orbit')));
  assert.equal(kit.APPS.match.path, '/Orbit-Sports/');
  assert.equal(kit.APPS.vocab.path, '/Orbit-Words/');
  for (const id of [...Object.keys(kit.APPS), 'pass']) for (const shape of ['rounded', 'square', 'maskable']) assert.match(brand.appIcon(id, { shape }), /^<svg [^>]*viewBox="0 0 512 512"/);
});

test('the family page (site/index.html) links where the kit does: regenerate it after a rename', () => {
  const page = readFileSync(new URL('../site/index.html', import.meta.url), 'utf8');
  const links = [...page.matchAll(/class="app" href="([^"]+)"/g)].map(m => m[1]).sort();
  assert.deepEqual(links, Object.values(kit.APPS).map(a => a.path).sort());
});
