// One account, many places (Jay 2026-11-13: a trip started in Orbit wasn't in
// the Transit app): what's under way and the family's notebook on the Pass
// (eco.js `eco-now`), handed to the place that becomes live.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { handleEcoRequest, mergeShelf, cleanShelf, NOW_COLLECTION, shelfId, SHELF_MAX } from '../eco.js';
import { planClean } from '../eco-admin.js';

function setup() {
  const store = new Map();
  let clock = 1_700_000_000_000;
  let n = 0;
  let codeN = 0;
  const key = (c, id) => `${c}/${id}`;
  const deps = {
    json: (data, status) => ({ status, data }),
    errorJson: (code, status) => ({ status, data: { error: { code } } }),
    upstreamFailed: error => ({ status: 502, data: { error: { code: 'UPSTREAM_FAILED', message: error.message } } }),
    readJsonBody: req => Promise.resolve(req.body),
    INVALID_BODY: Symbol('bad'),
    rateLimitResponse: async () => null,
    fsGet: async (env, c, id) => {
      const d = store.get(key(c, id));
      return d ? { exists: true, ...d } : { exists: false, payload: '', updateTime: '' };
    },
    fsWrite: async (env, c, id, payload, pre) => {
      const had = store.get(key(c, id));
      if (pre?.exists === false && had) throw Object.assign(new Error('exists'), { precondition: true });
      if (pre?.updateTime && had?.updateTime !== pre.updateTime) throw Object.assign(new Error('stale'), { precondition: true });
      const d = { payload, updateTime: `u${++n}` };
      store.set(key(c, id), d);
      return { updateTime: d.updateTime };
    },
    fsDelete: async (env, c, id) => void store.delete(key(c, id)),
    fsList: async (env, c) => [...store.entries()].filter(([k]) => k.startsWith(`${c}/`)).map(([k, d]) => ({ id: k.slice(c.length + 1), payload: d.payload, updateTime: d.updateTime })),
    fsCollections: async () => [...new Set([...store.keys()].map(k => k.split('/')[0]))],
    sha256Hex: async text => createHash('sha256').update(text).digest('hex'),
    generateCode: len => {
      codeN++;
      const a = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
      return Array.from({ length: len }, (_, i) => a[(codeN * 5 + i * 11) % 32]).join('');
    },
    now: () => (clock += 1000)
  };
  const env = { STORE: {}, ECO_TOKEN_SECRET: 'test-secret', ECO_OPEN_SIGNUP: 'on', ECO_ADMIN_TOKEN: 'o'.repeat(40) };
  const call = (method, query = '', body) => handleEcoRequest({ method, url: `https://w/eco${query}`, body }, env, {}, '1.1.1.1', deps);
  return { store, deps, env, call, clock: () => clock, advance: ms => (clock += ms) };
}
const nowOp = (t, qt, body) => t.call('POST', '', { op: 'now', qt, ...body });

test('a trip under way in one place is handed to the place that takes the app over, at the step it reached', async () => {
  const t = setup();
  const orbit = (await t.call('POST', '', { op: 'create', app: 'transit' })).data;
  // Started in Orbit: saved on the Pass as it goes.
  const start = await nowOp(t, orbit.token, { set: { nav: { v: { plan: 'p1', i: 0 }, at: t.clock() } } });
  assert.equal(start.status, 200);
  assert.ok(start.data.nowTime);
  await nowOp(t, orbit.token, { set: { nav: { v: { plan: 'p1', i: 2 }, at: t.clock() } } });
  // The Transit app on the same phone (its own storage, its own sign-in) opens: it gets the trip with the claim.
  const app = await t.call('POST', '', { op: 'login', passcode: orbit.passcode, app: 'transit' });
  assert.deepEqual(app.data.now.nav.v, { plan: 'p1', i: 2 });
  // Orbit, paused now, can't move it on or end it behind the app that runs it.
  const late = await nowOp(t, orbit.token, { set: { nav: { v: null, at: t.clock() } } });
  assert.equal(late.data.moved, true);
  assert.equal(late.data.nowTime, undefined);
  // The app ends it; Orbit, taken back (在這裡繼續), learns it's over.
  await nowOp(t, app.data.token, { set: { nav: { v: null, at: t.clock() } } });
  const back = await t.call('POST', '', { op: 'refresh', refresh: orbit.refresh, app: 'transit', claim: true });
  assert.equal(back.data.active, true);
  assert.equal(back.data.now.nav.v, null);
});

test('per key the newer one wins; a clock set ahead never wins for good; an end is kept a day, then dropped', () => {
  const now = 1_000_000_000;
  const a = mergeShelf({ nav: { v: 'new', at: now - 10 } }, { nav: { v: 'old', at: now - 20 }, rental: { v: 'r', at: now - 5 } }, now);
  assert.equal(a.nav.v, 'new');
  assert.equal(a.rental.v, 'r');
  const ahead = mergeShelf({}, { nav: { v: 'x', at: now + 3_600_000 } }, now);
  assert.equal(ahead.nav.at, now);
  assert.equal(mergeShelf(ahead, { nav: { v: 'y', at: now + 1 } }, now + 1).nav.v, 'y');
  const ended = mergeShelf({}, { nav: { v: null, at: now } }, now);
  assert.equal(ended.nav.v, null);
  assert.equal('nav' in mergeShelf(ended, {}, now + 25 * 3_600_000), false);
  // Only well-formed entries are taken.
  assert.deepEqual(cleanShelf({ nav: { v: 1, at: 5 }, 'bad key!': { v: 1, at: 5 }, x: { at: 5 }, y: { v: 1, at: 0 }, z: 'no' }), { nav: { v: 1, at: 5 } });
  assert.equal(cleanShelf({}), null);
});

test("the family's notebook: any of the account's apps tells it; every app hears it with its own claim", async () => {
  const t = setup();
  const transit = (await t.call('POST', '', { op: 'create', app: 'transit' })).data;
  const ride = { id: 'r1', fare: 30 };
  const told = await nowOp(t, transit.token, { family: { 'transit.ride': { v: ride, at: t.clock() } } });
  assert.ok(told.data.familyTime);
  // Money, a separate home-screen app (its own storage), hears it.
  const money = await t.call('POST', '', { op: 'login', passcode: transit.passcode, app: 'money' });
  assert.deepEqual(money.data.family['transit.ride'].v, ride);
  // Held already (fs): not sent again; changed: sent.
  const same = await t.call('POST', '', { op: 'refresh', refresh: money.data.refresh, app: 'money', fs: money.data.familyTime, ns: money.data.nowTime });
  assert.equal(same.data.family, undefined);
  assert.equal(same.data.now, undefined);
  // (A paused copy of an app still tells the family: only its own shelf waits for it to be live.)
  await t.call('POST', '', { op: 'login', passcode: transit.passcode, app: 'transit' });
  const paused = await nowOp(t, transit.token, { family: { 'transit.ride': { v: { id: 'r2' }, at: t.clock() } } });
  assert.ok(paused.data.familyTime);
  const changed = await t.call('POST', '', { op: 'refresh', refresh: money.data.refresh, app: 'money', fs: money.data.familyTime });
  assert.equal(changed.data.family['transit.ride'].v.id, 'r2');
  // A read with the app's data, live, carries them too.
  const read = await t.call('GET', `?qt=${encodeURIComponent(changed.data.token)}&app=money`);
  assert.equal(read.data.family['transit.ride'].v.id, 'r2');
});

test('a shelf stays small, an empty or forged one is refused, and a signed-out session writes nothing', async () => {
  const t = setup();
  const acct = (await t.call('POST', '', { op: 'create', app: 'transit' })).data;
  assert.equal((await nowOp(t, acct.token, { set: { nav: { v: 'x'.repeat(SHELF_MAX), at: t.clock() } } })).status, 413);
  assert.equal((await nowOp(t, acct.token, {})).status, 400);
  assert.equal((await nowOp(t, 'nope.nope', { set: { nav: { v: 1, at: 1 } } })).status, 401);
  await t.call('POST', '', { op: 'signout-all', qt: acct.token });
  assert.equal((await nowOp(t, acct.token, { set: { nav: { v: 1, at: t.clock() } } })).status, 401);
});

test("deleting the account takes its shelves; the clean-up takes a gone account's", async () => {
  const t = setup();
  const acct = (await t.call('POST', '', { op: 'create', app: 'transit' })).data;
  await nowOp(t, acct.token, { set: { nav: { v: 1, at: t.clock() } }, family: { 'class.week': { v: {}, at: t.clock() } } });
  assert.equal([...t.store.keys()].filter(k => k.startsWith(`${NOW_COLLECTION}/`)).length, 2);
  t.store.set(`${NOW_COLLECTION}/${shelfId('gone0123', 'transit')}`, { payload: '{}', updateTime: 'u0' });
  const plan = await planClean(t.env, t.deps);
  assert.deepEqual(plan.deletes.filter(([c]) => c === NOW_COLLECTION).map(([, id]) => id), [shelfId('gone0123', 'transit')]);
  assert.equal((await t.call('DELETE', `?qt=${encodeURIComponent(acct.token)}`)).status, 200);
  assert.equal([...t.store.keys()].filter(k => k.startsWith(`${NOW_COLLECTION}/`) && !k.includes('gone0123')).length, 0);
});
