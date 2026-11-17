// An app's question in its address (kit/ask-orbit.mjs): #ask= is taken once.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { takeAsk } from '../kit/ask-orbit.mjs';

test('ask-orbit: the question taken out of the address', () => {
  const loc = { hash: '#ask=%E5%8E%BB%E5%8F%B0%E5%8C%97&qh=x', pathname: '/transit/', search: '' };
  let to = null;
  globalThis.history = { state: null, replaceState: (_s, _t, u) => (to = u) };
  assert.equal(takeAsk(loc), '去台北');
  assert.equal(to, '/transit/#qh=x');
  assert.equal(takeAsk({ hash: '#go' }), '');
});
