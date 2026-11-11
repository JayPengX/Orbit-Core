// A field takes the keys right the first time (Jay 2026-11-11: "click on a
// typing field then close it then open it again to have a perfect focus"):
// whatever carries it stops moving first, and the keyboard is read again
// once it settles. The behaviour itself was checked in WebKit with keys
// rising in steps (a sheet's field focused a frame after opening sat 440 px
// under the screen before; --q-kb held 20 px short).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { moving, typingField } from '../kit/orbit.mjs';

const anim = (props, extra = {}) => ({ playState: 'running', effect: { getComputedTiming: () => ({ endTime: 420 }), getKeyframes: () => [{ offset: 0, easing: 'ease', composite: 'auto', ...props }] }, ...extra });

test('a slide, a pop or a detent moves the field; a fade, a shimmer or a spinner does not', () => {
  assert.equal(moving(anim({ transform: 'translateY(105%)' })), true);
  assert.equal(moving(anim({ scale: '0.94', opacity: '0' })), true);
  assert.equal(moving(anim({ marginTop: '10px' })), true);
  assert.equal(moving({ playState: 'running', transitionProperty: 'height', effect: { getComputedTiming: () => ({ endTime: 300 }) } }), true);
  assert.equal(moving(anim({ opacity: '0' })), false);
  assert.equal(moving(anim({ backgroundPosition: '0 0' })), false);
  assert.equal(moving({ ...anim({ transform: 'rotate(0)' }), effect: { getComputedTiming: () => ({ endTime: Infinity }), getKeyframes: () => [{ transform: 'rotate(0)' }] } }), false);
  assert.equal(moving(anim({ transform: 'none' }, { playState: 'finished' })), false);
});

test('only a field that takes the keys counts', () => {
  assert.equal(typingField({ nodeType: 1, tagName: 'INPUT', type: 'text' }), true);
  assert.equal(typingField({ nodeType: 1, tagName: 'TEXTAREA' }), true);
  assert.equal(typingField({ nodeType: 1, tagName: 'INPUT', type: 'checkbox' }), false);
  assert.equal(typingField({ nodeType: 1, tagName: 'INPUT', type: 'text', readOnly: true }), false);
  assert.equal(typingField({ nodeType: 1, tagName: 'BUTTON' }), false);
});

test('every app gets it on import, and the keys are read again once they settle', () => {
  const src = readFileSync(new URL('../kit/orbit.mjs', import.meta.url), 'utf8');
  assert.match(src, /\nlandBeforeTyping\(\);/);
  assert.match(src, /HTMLElement\.prototype\.focus = function/);
  assert.match(src, /settleTimer = setTimeout\(settle, 220\)/);
});
