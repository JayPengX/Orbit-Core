// A pressed look copied as the mouse's hover (orbit.mjs hoverLikePress, Jay 11-14).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hoverSelector } from '../kit/orbit.mjs';

test('hoverSelector: each part with :active becomes :hover, the rest left out', () => {
  assert.equal(hoverSelector('.q-row-btn:is(:active, [data-q-press]):not(:disabled)'), '.q-row-btn:hover:not(:disabled)');
  assert.equal(hoverSelector(':is(a, button).q-ritem:active'), ':is(a, button).q-ritem:hover');
  assert.equal(hoverSelector('.a:active, .b'), '.a:hover');
  assert.equal(hoverSelector('.q-menu button:is(:active, [data-q-press], :hover)'), '');
  assert.equal(hoverSelector('.x:not(:active)'), '');
});
