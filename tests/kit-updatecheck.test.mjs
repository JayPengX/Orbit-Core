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

test("the watch's checks may be answered 304: asked of the server each time, never downloaded whole", async () => {
  const { watchUpdates } = await import('../kit/orbit.mjs');
  const asked = [];
  const saved = { document: globalThis.document, fetch: globalThis.fetch, setInterval: globalThis.setInterval, BroadcastChannel: globalThis.BroadcastChannel, ORBIT_KIT: globalThis.ORBIT_KIT };
  try {
    globalThis.document = { visibilityState: 'visible', addEventListener: () => {} };
    globalThis.fetch = async (url, init) => (asked.push({ url: String(url), cache: init?.cache }), new Response(JSON.stringify({ version: 'same' }), { status: 200 }));
    globalThis.setInterval = () => 0;
    globalThis.BroadcastChannel = undefined;
    globalThis.ORBIT_KIT = { base: '../Orbit-Core/kit/', version: 'k1' };
    watchUpdates({ current: 'same', key: 'test' });
    for (let i = 0; i < 20 && asked.length < 2; i++) await new Promise(done => setTimeout(done, 5));
  } finally {
    Object.assign(globalThis, saved);
  }
  assert.deepEqual(asked.map(a => a.url).sort(), ['../Orbit-Core/kit/version.json', './version.json']);
  for (const a of asked) assert.equal(a.cache, 'no-cache', a.url);
});
