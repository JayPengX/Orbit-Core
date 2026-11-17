// A sign-in handed over in a link (#qh=…, kit takeHandoff) never replaces the sign-in a device already has
// (2026-11-17). It did: anyone signed in could make such a link from their own account (the Worker's
// `handoff`, good for three minutes, as often as asked), and a signed-in person who opened it was moved to
// that account without a word: their own sign-in gone from the device, and what the apps keep on it written
// on under the other account at the next save.
import test from 'node:test';
import assert from 'node:assert/strict';

const storage = map => ({ getItem: k => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: k => map.delete(k), key: i => [...map.keys()][i] ?? null, get length() { return map.size; } });
const store = new Map();
globalThis.localStorage = storage(store);
globalThis.sessionStorage = storage(new Map());
const kit = await import('../kit/orbit.mjs');

// A page opened at `hash`; the Worker's answers counted.
function page(hash) {
  const calls = [];
  const loc = { pathname: '/money/', search: '', hash };
  globalThis.location = loc;
  globalThis.history = { state: null, replaceState: (_s, _t, url) => void (loc.hash = url.includes('#') ? url.slice(url.indexOf('#')) : '') };
  globalThis.fetch = async (_url, init = {}) => {
    const body = JSON.parse(init.body || '{}');
    calls.push(body);
    return new Response(JSON.stringify({ token: 'theirs', refresh: 'cmVm.sig', wallet: { entries: [] } }), { status: 200 });
  };
  return { loc, calls };
}
const claims = d => Buffer.from(JSON.stringify({ k: 'ref', d, s: 'S', g: 0, e: 9e15 })).toString('base64url');

test('signed in already: a hand-over in the address is taken out and never used', async () => {
  store.clear();
  store.set('orbit.refresh', `${claims('abcdef0123456789abcdef')}.sig`);
  store.set('orbit.account', 'abcdef0123456789');
  const { loc, calls } = page('#tab=list&qh=SEALED');
  assert.equal(await kit.takeHandoff('money'), null);
  assert.deepEqual(calls, [], 'nothing asked of the Worker');
  assert.equal(loc.hash, '#tab=list', 'and the address is clean');
  assert.equal(store.get('orbit.account'), 'abcdef0123456789', 'this device’s own sign-in stands');
});

test('not signed in (the app’s other window, a browser): the hand-over signs it in, as before', async () => {
  store.clear();
  const { loc, calls } = page('#qh=SEALED');
  const first = await kit.takeHandoff('money');
  assert.equal(first.token, 'theirs');
  assert.deepEqual(calls.map(c => [c.op, c.handoff, c.app]), [['redeem', 'SEALED', 'money']]);
  assert.equal(loc.hash, '');
});

test('no hand-over in the address: nothing', async () => {
  store.clear();
  const { calls } = page('#tab=list');
  assert.equal(await kit.takeHandoff('money'), null);
  assert.deepEqual(calls, []);
});
