// One account, many places (Jay 2026-11-13): the session sends what the app is
// in the middle of to the Pass only from the place that runs it, hands the
// Pass's to the app on a claim, and keeps the family's notebook in step.
import test from 'node:test';
import assert from 'node:assert/strict';

const store = new Map();
globalThis.localStorage = { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
// (A page's window: events on globalThis, as a browser has.)
const events = new EventTarget();
globalThis.addEventListener ??= events.addEventListener.bind(events);
globalThis.dispatchEvent ??= events.dispatchEvent.bind(events);
const kit = await import('../kit/orbit.mjs');
const F = await import('../kit/family.mjs');

const wait = ms => new Promise(r => setTimeout(r, ms));
function signedIn() {
  const claims = Buffer.from(JSON.stringify({ k: 'ref', d: 'abcdef0123456789abcdef', s: 'S', g: 0, e: 9e15 })).toString('base64url');
  store.set('orbit.refresh', `${claims}.sig`);
  store.set('orbit.account', 'abcdef0123456789');
}
function worker(reply) {
  const sent = [];
  globalThis.fetch = async (url, init = {}) => {
    const body = JSON.parse(init.body || '{}');
    sent.push(body);
    return new Response(JSON.stringify(typeof reply === 'function' ? reply(body) : reply), { status: 200 });
  };
  return sent;
}

test("a claim hands the app the Pass's shelf; the held version is said so it isn't sent again", async () => {
  signedIn();
  const sent = worker(body => (body.op === 'refresh' ? { token: 'tok', active: true, wallet: { entries: [] }, now: { nav: { v: { i: 2 }, at: 5 } }, nowTime: 'n1', family: {}, familyTime: 'f1' } : {}));
  const s = kit.orbitSession('transit', { heartbeat: 1e9 });
  const got = [];
  s.on('now', shelf => got.push(shelf));
  const first = await s.claim();
  assert.deepEqual(first.now.nav.v, { i: 2 });
  assert.deepEqual(s.now.nav.v, { i: 2 });
  assert.equal(got.length, 1);
  await s.claim();
  const last = sent.filter(b => b.op === 'refresh').at(-1);
  assert.equal(last.ns, 'n1');
  assert.equal(last.fs, 'f1');
});

test('what the app is in the middle of goes up from the live place, coalesced; a paused copy sends none of it', async () => {
  signedIn();
  let active = true;
  const sent = worker(body => (body.op === 'refresh' ? { token: 'tok', active, wallet: { entries: [] }, ...(active ? {} : { live: { app: 'orbit', t: 1 } }) } : body.op === 'now' ? { nowTime: 'n2' } : {}));
  const s = kit.orbitSession('orbit', { heartbeat: 1e9 });
  await s.claim();
  s.putNow('flight', { end: 1 }, 10);
  s.putNow('flight', { end: 2 }, 11);
  await wait(1400);
  const puts = sent.filter(b => b.op === 'now');
  assert.equal(puts.length, 1, 'two changes, one write');
  assert.deepEqual(puts[0].set.flight, { v: { end: 2 }, at: 11 });
  // Taken over elsewhere: its own state stays here, never sent over the new place's.
  active = false;
  await s.claim();
  s.putNow('flight', null, 12);
  await wait(1400);
  assert.equal(sent.filter(b => b.op === 'now').length, 1);
});

test("the family's notebook: a fact told goes up; the Pass's newer facts come in, older ones never over newer", async () => {
  signedIn();
  const sent = worker(body => (body.op === 'refresh' ? { token: 'tok', active: true, wallet: { entries: [] }, family: { 'class.school': { v: { name: '竹東高中' }, at: 50 }, 'vocab.due': { v: { n: 1 }, at: 1 } }, familyTime: 'f2' } : body.op === 'now' ? { familyTime: 'f3' } : {}));
  F.tell('vocab', 'due', { n: 9 }, 40);
  const s = kit.orbitSession('money', { heartbeat: 1e9 });
  await s.claim();
  assert.equal(F.heard('class', 'school').name, '竹東高中', "another app's fact, heard here");
  assert.equal(F.heard('vocab', 'due').n, 9, 'the newer one here stays');
  F.tell('transit', 'ride', { id: 'r1', fare: 30 }, Date.now());
  await wait(4300);
  const up = sent.filter(b => b.op === 'now').flatMap(b => Object.keys(b.family || {}));
  assert.ok(up.includes('transit.ride'), 'told here: sent up');
  assert.ok(up.includes('vocab.due'), 'newer here than on the Pass: sent up');
  assert.ok(!up.includes('class.school'), "the Pass's own never sent back");
});
