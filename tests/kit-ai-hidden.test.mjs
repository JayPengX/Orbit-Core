// A composer fixed at the foot lands on the keys (iOS 26 slide counted), the
// host window isn't put back while the keys are up, and with no Orbit AI the
// AI action's bar closes the gap (Jay 11-14, Law's 問法律 and 首頁).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = f => readFileSync(new URL(`../kit/${f}`, import.meta.url), 'utf8');

test('the keys\' height above the page foot counts iOS\'s slide, and docked bars use it', () => {
  const js = read('orbit.mjs');
  assert.match(js, /innerHeight - vv\.height - vv\.offsetTop/);
  assert.match(js, /--q-kb-foot/);
  const css = read('orbit.css');
  assert.match(css, /html\.q-kb \.q-kb-docked \{\s*bottom: calc\(var\(--q-kb-foot, var\(--q-kb\)\) \+ 8px\) !important/);
});

test('typing in an app inside Orbit: frames keep their size at the top (never wider than tall: Money in half its width), the slide put back a few times at most, the app reads the keys from Orbit\'s window (Jay 11-15)', () => {
  const js = read('suite.mjs');
  assert.match(js, /box\.style\.height = el \? `\$\{base\}px`/);
  assert.match(read('orbit.mjs'), /f\.getBoundingClientRect\(\)\.bottom - \(tv\.offsetTop \+ tv\.height\)/);
  assert.match(js, /const kb = Boolean\(el\) && base - vv\.height > 80/);
  assert.match(js, /backs < 3\) \{\s*backs\+\+;\s*globalThis\.scrollTo\(0, 0\)/);
  assert.match(js, /if \(frameField\(\)\) return fit\(\)/);
  assert.match(js, /__orbitFit\?\.\(\)/);
});

test('a bar with an AI action stretches over its room when the AI is gone', () => {
  const js = read('orbit.mjs');
  assert.match(js, /if \(action\.ai\) nav\.classList\.add\('q-tabbar-ai'\)/);
  const css = read('orbit.css');
  assert.match(css, /data-ai-lock='level'\]:not\(\.q-tabrail\) \.q-tabbar\.q-tabbar\.q-tabbar-ai \{[^}]*translateX\(-50%\)/);
  assert.match(css, /\[data-ai-only\]:not\(\[data-ai-free\]\)/);
  assert.match(css, /\.q-no-ai/);
});
