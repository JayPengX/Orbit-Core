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
