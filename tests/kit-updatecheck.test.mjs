// An app lifts its loading screen only once boot.js's first update check has answered.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { updateChecked } from '../kit/orbit.mjs';

test('the loading screen waits for the first update check, and stays up while it reloads', async () => {
  delete globalThis.__bootCheck;
  assert.equal(await updateChecked(), true, 'no check (a dev page): show');
  globalThis.__bootCheck = Promise.resolve('boot');
  assert.equal(await updateChecked(), false, 'a newer deploy loading: show nothing');
  globalThis.__bootCheck = Promise.resolve('none');
  assert.equal(await updateChecked(), true);
  globalThis.__bootCheck = Promise.resolve('watch');
  assert.equal(await updateChecked(), true);
  globalThis.__bootCheck = Promise.reject(new Error('x'));
  assert.equal(await updateChecked(), true);
  globalThis.__bootCheck = new Promise(() => {});
  assert.equal(await updateChecked(20), true, 'a check that never answers is waited on only so long');
  delete globalThis.__bootCheck;
});
