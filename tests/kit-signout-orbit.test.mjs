// A sign-out never changes which Orbit a window is (2026-11-17). A home screen can hold several Orbits, each
// told apart by the tag its icon opens (kit orbit-mine.mjs); once open, the tag is out of the address and
// kept for the window alone (sessionStorage `orbit.which`, beside `orbit.suite`: this is Orbit's window).
// The sign-out wiped those with the account's own keys, then loaded the window again: seen on the live site,
// an Orbit named School holding three apps came back as the plain Orbit of every app (on Android, as an
// Orbit of the one app in view), and stayed so through the next sign-in until its icon was tapped again.
import test from 'node:test';
import assert from 'node:assert/strict';

const storage = map => ({ getItem: k => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: k => map.delete(k), key: i => [...map.keys()][i] ?? null, get length() { return map.size; } });
const local = new Map();
const tab = new Map();
globalThis.localStorage = storage(local);
globalThis.sessionStorage = storage(tab);
const kit = await import('../kit/orbit.mjs');
const mine = await import('../kit/orbit-mine.mjs');

const school = mine.encodeSetup({ name: 'School', apps: ['orbit', 'vocab', 'transit'], look: 'space', id: 'abc123xyz0' });
function signedInSchool() {
  local.clear();
  tab.clear();
  for (const [k, v] of [['orbit.refresh', 'ref.sig'], ['orbit.account', 'abcdef0123456789'], ['orbit.wallet', '{}'], ['orbit.suite.v1', '{"on":1,"apps":{}}'], [mine.MINE_KEY, '{}'], ['orbit.lang', 'en']]) local.set(k, v);
  for (const [k, v] of [[mine.WHICH_KEY, school], ['orbit.suite', '1'], ['orbit.addr', '/transit/'], ['orbit.suite.trail', '[]'], ['orbit.visit', '1']]) tab.set(k, v);
}

for (const [name, opts] of [['the person signs out', {}], ['the Pass signs the device out (a new pass, 登出其他所有裝置)', { keepKeys: true }]]) {
  test(`${name}: the window is still the same Orbit, and nothing of the account stays`, () => {
    signedInSchool();
    kit.wipeDevice(opts);
    assert.equal(mine.whichTag(), school, 'its tag');
    assert.deepEqual({ name: mine.setupOf().name, apps: mine.setupOf().apps.length }, { name: 'School', apps: 3 });
    assert.equal(tab.get('orbit.suite'), '1', 'and still Orbit’s window: the page loaded again goes into Orbit as this one');
    assert.deepEqual([...tab.keys()].sort(), ['orbit.suite', mine.WHICH_KEY].sort(), 'the rest of the window’s storage goes');
    assert.deepEqual([...local.keys()], ['orbit.lang'], 'the account’s keys go, the device’s own stay');
    assert.equal(kit.storedAccount(), '');
  });
}
