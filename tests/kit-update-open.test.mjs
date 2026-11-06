// An update never holds up an opening nor swaps the screen in front of the
// person (Jay 2026-11-06: "Always stuck here so long after an update"): the
// app opens on the version the phone has, the new one is downloaded behind it
// and shown at the next opening, or as the person comes back after a while.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const boot = readFileSync(new URL('../kit/boot.js', import.meta.url), 'utf8');

test("boot.js never reloads an opening for a newer version, nor holds the cover for the check", () => {
  // (Its reloads are only the mend's, for an app that failed to start: ?v=<time>, and the 重新整理 button.)
  const reloads = boot.match(/location\.(replace|reload)\(/g) || [];
  assert.equal(reloads.length, 2, reloads.join(' | '));
  assert.match(boot, /location\.replace\(location\.pathname \+ '\?v=' \+ Date\.now\(\)/);
  assert.doesNotMatch(boot, /encodeURIComponent\(latest\)|orbit\.bootTo/, 'never reloads onto a newer version');
  assert.doesNotMatch(boot, /q-boot-hold/, 'the cover is never held for the update check');
  assert.doesNotMatch(boot, /return 'boot'/, "the check never answers 'boot' (a reload under way)");
});

test('the watch downloads a newer version behind the screen and swaps only after the person was away', async () => {
  const { watchUpdates } = await import('../kit/orbit.mjs');
  const saved = {};
  for (const k of ['document', 'fetch', 'setInterval', 'BroadcastChannel', 'ORBIT_KIT', 'location', 'sessionStorage', 'navigator', '__bootCheck', '__bootChecked', 'addEventListener'])
    saved[k] = Object.getOwnPropertyDescriptor(globalThis, k);
  const swapped = [];
  const on = {};
  let clock = Date.now();
  const realNow = Date.now;
  const store = new Map();
  try {
    const box = { hidden: true, classList: { remove: () => {} } };
    const doc = { visibilityState: 'visible', addEventListener: (t, f) => (on[t] = f), getElementById: () => box, querySelector: () => null };
    Object.defineProperty(globalThis, 'document', { value: doc, configurable: true, writable: true });
    Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true, writable: true });
    globalThis.location = { pathname: '/sports/', hash: '', href: 'https://x.test/sports/', replace: u => swapped.push(u), reload: () => swapped.push('reload') };
    globalThis.sessionStorage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
    globalThis.setInterval = () => 0;
    globalThis.BroadcastChannel = undefined;
    globalThis.ORBIT_KIT = undefined;
    globalThis.addEventListener = () => {};
    globalThis.__bootCheck = Promise.resolve('watch');
    globalThis.__bootChecked = 0;
    globalThis.fetch = async url => {
      const u = String(url);
      if (u.endsWith('version.json')) return new Response(JSON.stringify({ version: 'new' }), { status: 200 });
      // (The new page, every file it names on the phone.)
      return new Response('<meta name="build-version" content="new">', { status: 200 });
    };
    Date.now = () => clock;
    watchUpdates({ current: 'old', key: 'test' });
    // The opening's first screen is up: the watch looks 2 s after it.
    await new Promise(done => setTimeout(done, 2400));
    assert.deepEqual(swapped, [], 'an update found while the person looks at the app is never swapped in');
    // Away a moment and back: still the same screen.
    doc.visibilityState = 'hidden';
    on.visibilitychange();
    clock += 30_000;
    doc.visibilityState = 'visible';
    on.visibilitychange();
    await new Promise(done => setTimeout(done, 50));
    assert.deepEqual(swapped, [], 'a short look away is not an opening');
    // Away for a while, then back: an opening, on the new version from the phone.
    doc.visibilityState = 'hidden';
    on.visibilitychange();
    clock += 6 * 60_000;
    doc.visibilityState = 'visible';
    on.visibilitychange();
    for (let i = 0; i < 100 && !swapped.length; i++) await new Promise(done => setTimeout(done, 30));
    assert.deepEqual(swapped, ['/sports/?v=new']);
    assert.equal(box.hidden, false, 'the cover is up while the new version comes from the phone');
  } finally {
    Date.now = realNow;
    for (const [k, d] of Object.entries(saved)) {
      if (d) Object.defineProperty(globalThis, k, d);
      else delete globalThis[k];
    }
  }
});
