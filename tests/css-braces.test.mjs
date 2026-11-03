// Every kit and site stylesheet's braces pair up. A stray "}" drops the rule
// after it without a word (2026-11-03: Sports lost .wp-chart that way, so its
// chance charts drew 320 wide and a finger on one read past the lines' end).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const sheets = ['kit/', 'site/', 'site/admin/'].flatMap(d => {
  try {
    return readdirSync(new URL(d, root)).filter(f => f.endsWith('.css')).map(f => d + f);
  } catch {
    return [];
  }
});

test('there are stylesheets to check', () => assert.ok(sheets.includes('kit/orbit.css')));
for (const f of sheets) {
  test(`${f}: every { has its }`, () => {
    const css = readFileSync(new URL(f, root), 'utf8').replace(/\/\*[\s\S]*?\*\//g, c => c.replace(/[^\n]/g, '')).replace(/"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'/g, '""');
    let depth = 0;
    css.split('\n').forEach((line, i) => {
      for (const ch of line) {
        if (ch === '{') depth++;
        else if (ch === '}' && --depth < 0) assert.fail(`${f}:${i + 1}: a } with no { (the rule after it is dropped)`);
      }
    });
    assert.equal(depth, 0, `${f}: ${depth} { never closed`);
  });
}
