// A live redraw never moves the page (Jay 2026-11-01, the second time a
// live game's refresh threw him to the top): the kit holds every scroller's
// place (hold-place.mjs), loaded with ui.mjs by every app, and beats wait
// while a finger is down or a fling runs. The behaviour itself is checked in
// a browser by tools/live-scroll.mjs (Safari's way, every app).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { signature, scrollBusy } from '../kit/hold-place.mjs';

const kit = f => readFileSync(new URL(`../kit/${f}`, import.meta.url), 'utf8');

test('a row redrawn with a new score or clock is the same row', () => {
  assert.equal(signature('DIV', 'event-row live', '21:30 利物浦 2 - 1 兵工廠 78\''), signature('div', 'event-row', '21:30 利物浦 3 - 1 兵工廠 81\''));
  assert.notEqual(signature('div', 'event-row', '利物浦 兵工廠'), signature('div', 'event-row', '切爾西 熱刺'));
});

test('every app loads the keeper, and beats wait for a scroll to end', () => {
  assert.match(kit('ui.mjs'), /from '\.\/hold-place\.mjs'/);
  const orbit = kit('orbit.mjs');
  assert.match(orbit, /import \{ scrollBusy \} from '\.\/hold-place\.mjs'/);
  assert.match(orbit.slice(orbit.indexOf('export function everyDev'), orbit.indexOf('export function everyDev') + 700), /sheetHeld\(\) \|\| scrollBusy\(\)/);
  assert.match(kit('orbit.css'), /\.q-hold-room::after \{[^}]*height: var\(--q-hold-room/);
  assert.equal(scrollBusy(), false);
});

test('the keeper corrects after any redraw, on the page and in sheets', () => {
  const src = kit('hold-place.mjs');
  assert.match(src, /new MutationObserver/);
  assert.match(src, /observe\(document\.documentElement, \{ childList: true, subtree: true/);
  // Never turned off for a case: no flag, no app list.
  assert.doesNotMatch(src, /localStorage|location\.|BRANDS/);
});
