// The kit's stylesheet: rules every app gets from it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../kit/orbit.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

// iOS 27's look for the family: glass that floats (the top-right buttons, the
// tab bar) is lit at the rim, never outlined; and both themes define it.
test('floating glass has a lit rim and no outline ring, in light and dark', () => {
  for (const sel of ['.q-icon-btn', '.q-actions:has(> :nth-child(2))', '.q-tabbar.q-tabbar', '.q-ask', '.q-banner']) {
    const all = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter(([, s]) => s.split(',').map(x => x.trim()).includes(sel)).map(([, , b]) => b);
    const last = all.filter(b => /box-shadow/.test(b)).pop() || '';
    assert.match(last, /var\(--q-glass-rim\)/, `${sel} is lit at the rim`);
    const border = all.filter(b => /(^|;)\s*border:/.test(b)).pop();
    if (border) assert.match(border, /border:\s*0/, `${sel} has no outline`);
  }
  const dark = css.slice(css.indexOf(":root[data-theme='dark']"));
  for (const token of ['--q-glass:', '--q-glass-strong:', '--q-glass-rim:', '--q-fill-3:', '--q-label:', '--q-grouped-2:']) {
    assert.ok(css.indexOf(token) < css.indexOf('@media (prefers-color-scheme: dark)'), `${token} light`);
    assert.ok(dark.slice(0, dark.indexOf('}')).includes(token), `${token} dark`);
  }
});

// Jay asked many times (last 2026-10-31, 新增固定收支's 開始): a sheet never
// scrolls sideways. iPhone's Safari sizes a date field to its wheel's text
// unless it drops the native look, so the kit drops it for every one.
test('sheets never scroll sideways, and date fields fit their box', () => {
  const rules = sel => [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter(([, s]) => s.split(',').map(x => x.trim()).includes(sel)).map(([, , b]) => b).join(';');
  assert.match(rules('.q-sheet'), /overflow-x:\s*(hidden|clip)/);
  for (const t of ['date', 'time', 'datetime-local', 'month']) {
    const b = rules(`input[type='${t}']`);
    assert.match(b, /-webkit-appearance:\s*none/, t);
    assert.match(b, /min-width:\s*0/, t);
    assert.match(b, /max-width:\s*100%/, t);
  }
});
