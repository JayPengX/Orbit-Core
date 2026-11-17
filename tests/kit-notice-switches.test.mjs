// Notice switches turned off one after another all reach the Pass and the Worker (2026-11-17). Each switch
// saves on the device and starts a sync (kit syncPrefs: the Pass's copy, then the Worker's, which decides
// what is sent while the app is closed); a switch moved while a sync was on its way was skipped and nothing
// started another, so the last of several stayed on the device alone until the app was next opened, and the
// notice just turned off still came.
import test from 'node:test';
import assert from 'node:assert/strict';

const storage = map => ({ getItem: k => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: k => map.delete(k), key: i => [...map.keys()][i] ?? null, get length() { return map.size; } });
globalThis.localStorage = storage(new Map());
globalThis.sessionStorage = storage(new Map());
const kit = await import('../kit/orbit.mjs');
const sleep = ms => new Promise(r => setTimeout(r, ms));

test('three switches turned off in a row: the Pass and the Worker end with all three', async () => {
  const writes = [];
  const posts = [];
  // A session as the kit's: a write takes a moment, and the wallet that comes back starts a sync (absorb).
  const s = {
    app: 'match',
    lang: 'zh',
    active: true,
    wallet: { settings: {} },
    ensureToken: async () => 'T',
    async write(patch) {
      await sleep(30);
      writes.push(patch.wallet.settings.notify.value.off);
      s.wallet = { settings: { ...s.wallet.settings, ...patch.wallet.settings } };
      setTimeout(() => kit.syncPrefs(s), 0);
      return {};
    }
  };
  globalThis.fetch = async (url, init) => {
    await sleep(30);
    if (String(url).includes('/push/prefs')) posts.push(JSON.parse(init.body).off);
    return new Response('{"ok":true}', { status: 200 });
  };
  kit.setKind('match', 'start', false, s);
  await sleep(10);
  kit.setKind('match', 'final', false, s);
  await sleep(40);
  kit.setKind('weather', 'rain', false, s);
  await sleep(400);
  const all = ['match:final', 'match:start', 'weather:rain'];
  assert.deepEqual(kit.notifyPrefs().off, all, 'this device');
  assert.deepEqual(writes.at(-1), all, 'the Pass');
  assert.deepEqual(posts.at(-1), all, 'the Worker');
  // (And it settles: nothing more is sent once they agree.)
  const n = [writes.length, posts.length];
  await sleep(150);
  assert.deepEqual([writes.length, posts.length], n);
});
