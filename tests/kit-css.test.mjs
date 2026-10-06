// The kit's stylesheet: rules every app gets from it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../kit/quadra.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const rule = sel => {
  for (const [, selectors, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) if (selectors.split(',').map(x => x.trim()).includes(sel)) return body;
  return null;
};

// Securities' 為你推薦: a six-figure price (LG 新能源 390,000) put its +5.12%
// under the number on an iPhone, because the row was allowed to wrap.
test("a recommendation's price and its change stay on one row", () => {
  const foot = rule('.q-rec-foot');
  assert.ok(foot, '.q-rec-foot exists');
  assert.doesNotMatch(foot, /flex-wrap:\s*wrap/);
  const big = rule('.q-rec-big');
  assert.match(big, /min-width:\s*0/, 'the price can shrink');
  assert.match(big, /white-space:\s*nowrap/);
  assert.match(rule('.q-rec-foot > :not(.q-rec-big)'), /flex:\s*none/, 'the change keeps its size');
});
