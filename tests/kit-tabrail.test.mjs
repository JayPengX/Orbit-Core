// The tab bar and the rail are the kit's alone, so all nine apps draw them
// alike (Jay 2026-11-06, an iPad: Law's side bar beside Sports' "shouldn't
// happen"; the Pass button smaller than the tabs). Four apps set no
// box-sizing and drew the bar 8 wider: the kit now sets its own, and no app's
// CSS may size, place or set the type of a tab bar part (its colours only).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { frameFaults, appFrameFaults } from '../kit/frame-guard.mjs';
import { join } from 'node:path';

const css = readFileSync(new URL('../kit/orbit.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const rules = text => [...text.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(m => ({ sel: m[1].trim(), body: m[2] }));
const kitRule = sel => rules(css).filter(r => r.sel.split(',').map(s => s.trim()).includes(sel)).map(r => r.body).join(';');

test('the tab bar, a tab and the action size their own box, whatever the app sets', () => {
  for (const sel of ['.q-tabbar.q-tabbar', '.q-tab', '.q-tab-action', 'html.q-tabrail .q-appbar .q-actions']) {
    assert.match(kitRule(sel), /box-sizing:\s*border-box/, `${sel} sets box-sizing`);
  }
});

test('the rail is one column: the capsule, the action and the account are one width', () => {
  assert.match(kitRule('html.q-tabrail .q-tabbar.q-tabbar'), /width:\s*var\(--q-tabrail-cw\)/);
  // (The action: as wide as the capsule, centred under it.)
  assert.match(kitRule('html.q-tabrail .q-tab-action'), /left:\s*calc\(var\(--q-tabrail-x\) \+ \(var\(--q-tabrail-cw\) - var\(--q-tabrail-act\)\) \/ 2\)/);
  assert.match(kitRule('html.q-tabrail .q-appbar .q-actions'), /width:\s*var\(--q-tabrail-cw\)/);
  assert.match(kitRule('html.q-tabrail .q-appbar .q-actions'), /left:\s*var\(--q-tabrail-x\)/);
});

// Jay 2026-11-06 (iPad: Law's 問法律 and Money's add as pills "ugly and fat"):
// the app's action is a circle everywhere, on the phone's bar and on the rail.
test('the app’s action is a true circle, on the bar and on the rail', () => {
  for (const sel of ['.q-tab-action', 'html.q-tabrail .q-tab-action']) {
    const body = kitRule(sel);
    const w = /(?:^|[;\s])width:\s*([^;]+)/.exec(body)?.[1].trim();
    const h = /(?:^|[;\s])height:\s*([^;]+)/.exec(body)?.[1].trim();
    assert.ok(w && w === h, `${sel}: width (${w}) is its height (${h})`);
    assert.match(body, /border-radius:\s*50%/, `${sel} is round`);
  }
  // (On the rail: a size smaller than the capsule, of its glass, the app's colour in its mark:
  // a solid circle the capsule's width read "a bit big and not in style with the tabs".)
  assert.match(kitRule('html.q-tabrail'), /--q-tabrail-act:\s*calc\(var\(--q-tabrail-cw\) - 8px\)/);
  const glass = kitRule('html.q-tabrail:not(.q-desk) .q-tab-action');
  assert.match(glass, /background:\s*var\(--q-glass\)/);
  assert.match(glass, /color:\s*var\(--q-accent\)/);
  // (Nothing else gives it a width or height of its own; a computer's side bar,
  // q-desk, alone draws it as a labelled row, as its tabs.)
  const later = rules(css).filter(r => /\.q-tab-action(?![\w-])/.test(r.sel) && !/svg|::|:active|\[aria-pressed|q-desk/.test(r.sel) && r.sel !== '.q-tab-action' && r.sel !== 'html.q-tabrail .q-tab-action');
  for (const r of later) assert.doesNotMatch(r.body, /(?:^|[;\s])(?:width|height|border-radius):/, `${r.sel} reshapes the action`);
});

test("no app's CSS reshapes the tab bar or the rail (the apps checked out beside this one)", t => {
  const root = new URL('../../', import.meta.url).pathname;
  const apps = ['Orbit-Sports', 'Orbit-Transit', 'Orbit-Weather', 'Orbit-Class', 'Orbit-Money', 'Orbit-Words', 'Orbit-Beats', 'Orbit-Law', 'Orbit-Securities'].filter(a => existsSync(join(root, a)));
  if (!apps.length) return t.skip('no app checked out beside this repo');
  const faults = apps.flatMap(a => appFrameFaults(join(root, a)).map(x => `${a}/${x}`));
  assert.deepEqual(faults, []);
});

test('the check itself: a size on a tab is caught, a colour is not', () => {
  assert.deepEqual(frameFaults('.q-tab-action { background: red; color: #000 } .q-tab-label { font-size: 13px }'), ['.q-tab-label { font-size }']);
  assert.deepEqual(frameFaults('html.q-tabrail .ot-map-panel { left: 0 }'), []);
});
