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

// An icon tile's fill and its glyph's colour are set together: a rule that
// filled the dialog's tile but left the glyph to Native's tint drew an orange
// ⇄ on an orange square, washed out (Jay 2026-11-05, Securities' 換匯).
test('an icon tile never gets a fill without its glyph colour', () => {
  for (const [, sel, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!sel.includes('.q-tile') || !/(^|;)\s*background(-color|-image)?\s*:/.test(body)) continue;
    assert.match(body, /(^|;)\s*color\s*:/, `${sel.trim()} sets a fill, so it sets the glyph's colour too`);
  }
});

// A day strip on a wide page (an iPad, a computer) shows a week at most, each
// chip about a phone's, never every day the width could hold (Jay 2026-11-06,
// Sports on an iPad: fifteen days at once). dayStrip's fit() reads --q-day-n.
test('a wide page’s day strip holds a week at most', () => {
  const rule = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].find(([, s]) => s.trim() === 'html.q-wide .q-day-bar .q-day-strip');
  assert.ok(rule, 'a rule for the strip on q-wide');
  assert.match(rule[2], /--q-day-n:\s*7;/);
  // (Jay 2026-11-10: the week across the page, not a phone's row in its corner.)
  assert.match(rule[2], /flex:\s*1 1 auto;/, 'the week fills the row');
  assert.doesNotMatch(rule[2], /width:\s*calc\(/);
  const ui = readFileSync(new URL('../kit/ui.mjs', import.meta.url), 'utf8');
  assert.match(ui, /getPropertyValue\('--q-day-n'\)/, 'fit() honours it');
});

// A full-width bar sizes its own box: goHtml draws .q-more as a link, and in an
// app that sets no box-sizing 100% plus its padding ran past the card's right
// edge (Jay 2026-11-06, Law's 到司法院看原文 on an iPad).
test('every full-width .q-more sets its own box-sizing', () => {
  const rule = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].find(([, s]) => s.trim() === '.q-more');
  assert.ok(rule, '.q-more has a rule');
  assert.match(rule[2], /width:\s*100%/);
  assert.match(rule[2], /box-sizing:\s*border-box/);
});

// Safari draws a date or time in a field at its top and further in than the
// text beside it (新增固定收支's 開始 under 每月幾號): set in the middle, at the left.
test('a date or time in a field sits in its middle, at its left, in Safari', () => {
  const rule = css.match(/input\.q-field::-webkit-date-and-time-value\s*\{([^}]*)\}/)?.[1] || '';
  assert.match(rule, /margin:\s*0/);
  assert.match(rule, /text-align:\s*left/);
  assert.match(rule, /line-height:\s*44px/);
  assert.match(css, /\.q-field\s*\{[^}]*min-height:\s*44px/);
});
