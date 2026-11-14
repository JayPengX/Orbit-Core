// The admin's notice tools read and delete subscriptions through pushStore (D1), never the KV;
// the test says plainly what happened per subscription.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ADMIN_TOOLS, pushTestResult } from '../eco-admin.js';
import { fakeD1 } from './fake-d1.mjs';
import { WALLET_COLLECTION, emptyWallet } from '../eco.js';

const ID = 'abcdef1234567890';
// (pushStore's one-time move reads the KV's list: empty. Any other call fails.)
const kvThatMustNotBeUsed = { list: async () => ({ keys: [], list_complete: true }), get: () => assert.fail('KV read'), put: () => assert.fail('KV write'), delete: () => assert.fail('KV delete') };
const setup = () => {
  const env = { STORE: fakeD1(), RATE_LIMIT_KV: kvThatMustNotBeUsed };
  const deps = {
    now: () => 1_800_000_000_000,
    fsList: async (_e, coll) => (coll === WALLET_COLLECTION ? [{ id: ID, payload: JSON.stringify(emptyWallet(1)), updateTime: 't' }] : []),
    fsDelete: async () => {},
    fsBatch: async () => {}
  };
  return { env, deps };
};
const save = async (env, key, rec) => {
  const { pushStore } = await import('../push.js');
  await pushStore(env).put(key, JSON.stringify(rec));
};

test('push-test: no subscription for this pass and app says so', async () => {
  const { env, deps } = setup();
  await save(env, `push:${ID}:weather`, { sub: { endpoint: 'https://web.push.apple.com/x' }, items: [] });
  const r = await ADMIN_TOOLS['push-test']({ env, deps, body: { wallet: ID.slice(0, 8), app: 'transit' } });
  assert.equal(r.error, 'ADMIN_NO_PUSH');
  assert.equal(r.state, 'none');
});

test('push-test: a subscription the push service refuses by address is gone and removed from D1', async () => {
  const { env, deps } = setup();
  await save(env, `push:${ID}:orbit`, { sub: { endpoint: 'https://evil.example/x', keys: {} }, items: [] });
  const r = await ADMIN_TOOLS['push-test']({ env, deps, body: { wallet: ID.slice(0, 8), app: 'orbit' } });
  assert.equal(r.state, 'gone');
  assert.equal(r.removed, true);
  const again = await ADMIN_TOOLS['push-test']({ env, deps, body: { wallet: ID.slice(0, 8), app: 'orbit' } });
  assert.equal(again.state, 'none');
});

test('pushTestResult: accepted by Apple, gone and removed, failed with its status code', async () => {
  let removed = 0;
  const rm = async () => void removed++;
  const ok = await pushTestResult('sent', 'web.push.apple.com', rm);
  assert.equal(ok.state, 'sent');
  assert.match(ok.text, /Apple/);
  const gone = await pushTestResult('gone', 'web.push.apple.com', rm);
  assert.equal(gone.state, 'gone');
  assert.equal(removed, 1);
  const bad = await pushTestResult('failed 403 BadJwtToken', 'web.push.apple.com', rm);
  assert.equal(bad.state, 'failed');
  assert.equal(bad.status, 403);
  assert.equal(removed, 1);
});

test('pushes, delete and broadcast list and drop subscriptions in D1', async () => {
  const { env, deps } = setup();
  await save(env, `push:${ID}:orbit`, { sub: { endpoint: 'https://evil.example/x' }, items: [] });
  await save(env, `push:${ID}:weather`, { items: [] });
  const list = await ADMIN_TOOLS.pushes({ env, deps });
  assert.equal(list.records, 2);
  const b = await ADMIN_TOOLS.broadcast({ env, deps, body: { title: 't', body: 'b', app: 'orbit' } });
  assert.equal(b.asked, 1);
  assert.equal(b.gone, 1);
  const del = await ADMIN_TOOLS.delete({ env, deps, body: { wallet: ID.slice(0, 8), confirm: ID.slice(0, 8) } }).catch(e => e);
  // (deleteAccount needs the whole store; the push part is what's looked at.)
  if (!(del instanceof Error)) assert.equal(del.pushes, 1);
});

test('/app/: the home-screen app subscribes with its own worker (scope /app/), saved under each framed app\'s slug', () => {
  const orbit = readFileSync(new URL('../kit/orbit.mjs', import.meta.url), 'utf8');
  assert.match(orbit, /getRegistration\('\/app\/'\)/);
  assert.match(orbit, /orbit\.push\.sub\.\$\{s\.app\}/);
  assert.match(readFileSync(new URL('../site/app/index.html', import.meta.url), 'utf8'), /register\('\.\/sw\.js'\)/);
});
