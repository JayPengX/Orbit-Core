// The tab rail on a tablet or a computer is never smaller than the phone's
// tab bar (Jay 2026-11-06, an iPad: "even way smaller than my iPhone's").
// An iPad's CSS pixel is about an iPhone's in size, so the numbers compare
// directly: the rail's marks and names at least the phone bar's, its tabs
// taller than the phone bar's. A phone on its side keeps the slim rail.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../kit/orbit.css', import.meta.url), 'utf8');
const mjs = readFileSync(new URL('../kit/orbit.mjs', import.meta.url), 'utf8');
const block = sel => {
  const i = css.indexOf(`\n${sel} {`);
  assert.ok(i >= 0, `${sel} is in orbit.css`);
  return css.slice(i, css.indexOf('}', i));
};
const px = (b, prop) => Number(new RegExp(`(?:^|[;\\s])${prop}:\\s*(\\d+(?:\\.\\d+)?)px`).exec(b)?.[1]);

test("a tablet's rail is at least the phone bar's size", () => {
  const phoneTab = block('.q-tab');
  const phoneSvg = block('.q-tab svg');
  const tabletVars = block('html.q-tabrail.q-float');
  const tabletTab = block('html.q-tabrail.q-float .q-tab');
  const tabletSvg = block('html.q-tabrail.q-float .q-tab svg');
  assert.ok(px(tabletSvg, 'width') >= px(phoneSvg, 'width'), 'marks at least the phone bar’s');
  assert.ok(px(tabletTab, 'font-size') >= 10 + 2, 'names larger than the phone bar’s 10');
  assert.ok(px(tabletVars, '--q-tabrail-tab') > px(phoneTab, 'min-height'), 'tabs taller than the phone bar’s');
  assert.ok(px(tabletVars, '--q-tabrail-bw') - 8 >= 72, 'a capsule wide enough for a name at that size');
});

test("a phone on its side keeps the slim rail, and the page's width knows the wider one", () => {
  assert.equal(px(block('html.q-tabrail'), '--q-tabrail-bw'), 60);
  assert.match(mjs, /rail \? \(w >= 600 && h > 520 \? 112 : 92\) : 0/);
});
