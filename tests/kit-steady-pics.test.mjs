// A picture drawn again never flashes (Jay 2026-11-03: YouBike's logo
// blinked on every tab switch in Transit, and logos did across the apps).
// iPhone paints a new lazy or async-decoded <img> empty for a frame even
// when it has the picture; the kit makes one already drawn this visit eager
// and decoded at once before the paint, for every app (steady-pics.mjs,
// loaded by orbit.mjs), and the service worker serves an app's own pictures
// from its copy first.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const kit = f => readFileSync(new URL(`../kit/${f}`, import.meta.url), 'utf8');

test('every app loads the picture keeper with the core', () => {
  assert.match(kit('orbit.mjs'), /import '\.\/steady-pics\.mjs';/);
});

test('a picture loaded once is made eager and sync before the frame, wherever it came from', async () => {
  const src = kit('steady-pics.mjs');
  assert.match(src, /new MutationObserver/);
  assert.match(src, /observe\(root\.documentElement, \{ childList: true, subtree: true/);
  assert.match(src, /loading = 'eager'/);
  assert.match(src, /decoding = 'sync'/);
  // Not only other sites' logos: no origin check, no app list.
  assert.doesNotMatch(src, /location\.origin|BRANDS|espncdn/);
  // Importable without a page (the tests, the Workers' shared modules).
  const m = await import('../kit/steady-pics.mjs');
  assert.equal(m.seenPictures().size, 0);
});

test("the service worker serves an app's own pictures from its copy, refreshed behind", () => {
  const sw = kit('sw.js');
  assert.match(sw, /async function pictureFirst/);
  assert.match(sw, /request\.destination === 'image' \? pictureFirst : networkFirst/);
});
