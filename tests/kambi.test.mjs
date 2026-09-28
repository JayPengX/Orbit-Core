import test from 'node:test';
import assert from 'node:assert/strict';
import { handleKambiRequest, refreshKambiWatch, KAMBI_COLLECTION } from '../kambi.js';

// An in-memory Firestore and a scripted Kambi.
function setup(now, live = {}) {
  const store = new Map();
  const deps = {
    json: (body, status) => ({ status, body }),
    errorJson: (code, status) => ({ status, body: { error: { code } } }),
    upstreamFailed: error => ({ status: 502, body: { error: error.message } }),
    readJsonBody: async req => req.body,
    INVALID_BODY: Symbol('invalid'),
    rateLimitResponse: async () => null,
    fsGet: async (env, c, id) => (store.has(id) ? { exists: true, payload: store.get(id) } : { exists: false, payload: '' }),
    fsWrite: async (env, c, id, payload, pre) => {
      assert.equal(c, KAMBI_COLLECTION);
      if (pre?.exists === false && store.has(id)) throw Object.assign(new Error('exists'), { precondition: true });
      store.set(id, payload);
    },
    fsDelete: async (env, c, id) => store.delete(id),
    fsList: async () => [...store].map(([id, payload]) => ({ id, payload })),
    fetchLive: async id => live[id] ?? { status: 404, data: null },
    now: () => now.t
  };
  return { store, deps };
}
const env = { FIREBASE_PROJECT_ID: 'p', FIREBASE_CLIENT_EMAIL: 'e', FIREBASE_PRIVATE_KEY: 'k' };
const req = (method, url, body) => ({ method, url: `https://w.test/kambi${url}`, body });
const entry = (store, id) => JSON.parse(store.get(id));

test('matches are watched once, scored while live, and kept after Kambi drops them', async () => {
  const now = { t: Date.parse('2026-09-26T13:00:00Z') };
  const live = { 1029276719: { status: 200, data: { liveData: { score: { home: '7', away: '2', info: '0-1 | 2-0', version: 1 } } } } };
  const { store, deps } = setup(now, live);
  const post = await handleKambiRequest(req('POST', '', { events: [{ id: 1029276719, start: '2026-09-26T10:00:00Z' }, { id: 'x', start: 'no' }] }), env, {}, 'ip', deps);
  assert.deepEqual(post.body, { watching: 1, added: 1 });
  await refreshKambiWatch(env, deps);
  assert.equal(entry(store, '1029276719').live.score.home, '7');
  // Registering again leaves the score alone.
  await handleKambiRequest(req('POST', '', { events: [{ id: 1029276719, start: '2026-09-26T10:00:00Z' }] }), env, {}, 'ip', deps);
  assert.equal(entry(store, '1029276719').live.score.home, '7');
  // Kambi drops it: the last score stays, marked gone.
  delete live[1029276719];
  now.t += 3600_000;
  await refreshKambiWatch(env, deps);
  const kept = entry(store, '1029276719');
  assert.equal(kept.gone, true);
  assert.equal(kept.done, true);
  const got = await handleKambiRequest(req('GET', '?ids=1029276719,bad'), env, {}, 'ip', deps);
  assert.equal(got.body.results['1029276719'].live.score.away, '2');
  // Four days on it's forgotten.
  now.t += 5 * 86_400_000;
  await refreshKambiWatch(env, deps);
  // Only the index of watched matches is left.
  assert.deepEqual([...store.keys()], ['_index']);
});

test('a cron run with nothing on reads only the index', async () => {
  const now = { t: Date.parse('2026-09-26T08:00:00Z') };
  const { store, deps } = setup(now);
  await refreshKambiWatch(env, deps);
  let reads = 0;
  const get = deps.fsGet;
  deps.fsGet = async (...a) => (reads++, get(...a));
  deps.fsList = async () => assert.fail('no listing once the index exists');
  await refreshKambiWatch(env, deps);
  assert.equal(reads, 1);
  assert.ok(store.has('_index'));
});

test('not started yet: not read; never seen and long past: given up', async () => {
  const now = { t: Date.parse('2026-09-26T08:00:00Z') };
  let reads = 0;
  const { store, deps } = setup(now);
  deps.fetchLive = async () => (reads++, { status: 404, data: null });
  await handleKambiRequest(req('POST', '', { events: [{ id: 123456789, start: '2026-09-26T10:00:00Z' }] }), env, {}, 'ip', deps);
  await refreshKambiWatch(env, deps);
  assert.equal(reads, 0);
  now.t = Date.parse('2026-09-27T00:00:00Z');
  await refreshKambiWatch(env, deps);
  assert.equal(entry(store, '123456789').done, true);
});
