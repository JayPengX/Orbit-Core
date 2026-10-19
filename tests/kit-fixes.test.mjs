// Design review fixes: money() never signs a zero, tick() uses the kit's own
// haptic, and the top buttons sit trailing.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { money } from '../kit/quadra.mjs';
import { tick } from '../kit/ui.mjs';

test('money: no +NT$0 or −NT$0', () => {
  assert.equal(money(0, { sign: true }), 'NT$0');
  assert.equal(money(-0.4), 'NT$0');
  assert.equal(money(0.3, { sign: true }), 'NT$0');
  assert.equal(money(-0.004, { cents: true }), 'NT$0');
  assert.equal(money(-12), '−NT$12');
  assert.equal(money(1234, { sign: true }), '+NT$1,234');
  assert.equal(money(-0.5, { cents: true }), '−NT$0.5');
});

test('tick: the kit haptic, and a vibration where there is one', () => {
  const calls = [];
  const had = globalThis.quadraHaptic;
  const nav = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  globalThis.quadraHaptic = () => calls.push('haptic');
  Object.defineProperty(globalThis, 'navigator', { value: { vibrate: ms => calls.push(ms) }, configurable: true });
  try {
    tick();
  } finally {
    globalThis.quadraHaptic = had;
    if (nav) Object.defineProperty(globalThis, 'navigator', nav);
  }
  assert.deepEqual(calls, ['haptic', 8]);
});

test('.q-actions sits trailing', () => {
  const css = readFileSync(new URL('../kit/quadra.css', import.meta.url), 'utf8');
  assert.match(css, /\.q-actions \{[^}]*margin-left: auto/);
});
