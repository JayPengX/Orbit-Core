// door.js: seats, the line, priority passes, and /eco through the door.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { newBook, ask, seen, report, stateOf, prune, Door, admit, forgetDoor, newcomersOk, limitOf, graceShut, doorSlow, SEEN_MS, LINE_MS, DOOR_STATE_KEY } from '../door.js';
import { forgetPace } from '../pace.js';
import { handleEcoRequest } from '../eco.js';
import { ADMIN_TOOLS } from '../eco-admin.js';
import { readToken, sessionLimited } from '../orbit-token.js';
import { newPass } from './new-pass.mjs';

const T = 1_800_000_000_000;

test('no most set: everyone in, the door stays open', () => {
  const b = newBook();
  for (let i = 0; i < 500; i++) assert.equal(ask(b, { id: `a${i}`, now: T }).ok, true);
  assert.equal(stateOf(b), 'open');
  assert.equal(report(b, T).n, 500);
});

test('busy past 80%, then full: newcomers wait in line, first come first in', () => {
  const b = newBook();
  b.max = 10;
  for (let i = 0; i < 8; i++) ask(b, { id: `a${i}`, now: T });
  assert.equal(stateOf(b), 'busy');
  ask(b, { id: 'a8', now: T });
  ask(b, { id: 'a9', now: T });
  assert.equal(stateOf(b), 'full');
  assert.deepEqual(ask(b, { id: 'x', now: T + 1 }), { ok: false, place: 1, of: 1 });
  assert.deepEqual(ask(b, { id: 'y', now: T + 2 }), { ok: false, place: 2, of: 2 });
  // Someone already in keeps their seat however full.
  assert.equal(ask(b, { id: 'a3', now: T + 3 }).ok, true);
  // A seat frees up (not seen for SEEN_MS): only the first in line takes it.
  for (let i = 0; i < 10; i++) if (i !== 3) seen(b, { id: `a${i}`, now: T + SEEN_MS });
  const later = T + SEEN_MS + 1000;
  ask(b, { id: 'x', now: T + SEEN_MS });
  ask(b, { id: 'y', now: T + SEEN_MS });
  // (a3 was seen at T + 3: its seat goes.)
  assert.equal(ask(b, { id: 'y', now: later }).ok, false, 'second in line waits');
  assert.equal(ask(b, { id: 'x', now: later }).ok, true, 'first in line gets the seat');
  assert.equal(ask(b, { id: 'y', now: later }).place, 1);
});

test('a place in line is lost when its phone stops asking', () => {
  const b = newBook();
  b.max = 1;
  ask(b, { id: 'a', now: T });
  ask(b, { id: 'x', now: T });
  ask(b, { id: 'y', now: T });
  ask(b, { id: 'y', now: T + LINE_MS });
  prune(b, T + LINE_MS + 1);
  assert.deepEqual(b.line.map(w => w.id), ['y']);
});

test('a priority pass is always in, takes no seat and skips the line', () => {
  const b = newBook();
  b.max = 1;
  ask(b, { id: 'a', now: T });
  ask(b, { id: 'x', now: T });
  assert.deepEqual(ask(b, { id: 'vip', pri: true, now: T }), { ok: true, pri: true });
  const r = report(b, T);
  assert.equal(r.n, 1);
  assert.equal(r.pri, 1);
  assert.equal(r.line, 1);
});

test('the guard says no newcomers: the people in keep their seats, newcomers wait, priority still in', () => {
  const b = newBook();
  for (const id of ['a', 'b', 'c']) ask(b, { id, now: T });
  assert.equal(ask(b, { id: 'x', closed: true, now: T }).ok, false);
  assert.equal(ask(b, { id: 'a', closed: true, now: T }).ok, true);
  assert.equal(ask(b, { id: 'vip', pri: true, closed: true, now: T }).ok, true);
  assert.equal(report(b, T).closed, true);
  // Open again: in.
  assert.equal(ask(b, { id: 'x', closed: false, now: T }).ok, true);
  assert.equal(report(b, T).closed, false);
});

test('newcomers follow the guard: its flag, else not at the leanest level', () => {
  assert.equal(newcomersOk({ pace: 0, newcomers: true }), true);
  assert.equal(newcomersOk({ pace: 3, newcomers: false }), false);
  assert.equal(newcomersOk({ pace: 2 }), true);
  assert.equal(newcomersOk({ pace: 3 }), false);
});

test('a priority session is never held to a per-session limit', () => {
  assert.equal(limitOf({ p: 1 }, 30), Infinity);
  assert.equal(limitOf({}, 30), 30);
  let hit = false;
  for (let i = 0; i < 10_000; i++) hit ||= sessionLimited('door-test-vip', limitOf({ p: 1 }, 30), 60_000, T);
  assert.equal(hit, false);
  for (let i = 0; i < 31; i++) hit = sessionLimited('door-test-plain', limitOf({}, 30), 60_000, T);
  assert.equal(hit, true);
});

test('busy and full slow the live refreshes for everyone', () => {
  assert.deepEqual(['open', 'busy', 'full'].map(doorSlow), [1, 2, 3]);
});

// ---- The Durable Object and /eco through it ----------------------------------------

function fakeKv() {
  const m = new Map();
  return { m, get: async (k, o) => (m.has(k) ? (o?.type === 'json' ? JSON.parse(m.get(k)) : m.get(k)) : null), put: async (k, v) => void m.set(k, v) };
}
function fakeDoor(env) {
  const data = new Map();
  const door = new Door({ storage: { get: async k => data.get(k), put: async (k, v) => void data.set(k, structuredClone(v)) } }, env);
  return { door, ns: { idFromName: () => 'door', get: () => ({ fetch: (url, init) => door.fetch(new Request(url, init)) }) } };
}

function setup() {
  const store = new Map();
  let clock = Date.now();
  let n = 0;
  let codeN = 0;
  const key = (c, id) => `${c}/${id}`;
  const deps = {
    json: (data, status) => ({ status, data }),
    errorJson: (code, status) => ({ status, data: { error: { code } } }),
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
    sha256Hex: async text => createHash('sha256').update(text).digest('hex'),
    generateCode: len => {
      codeN++;
      const a = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
      return Array.from({ length: len }, (_, i) => a[(codeN * 7 + i * 11) % 32]).join('');
    },
    now: () => (clock += 1000)
  };
  const env = { STORE: {}, ECO_TOKEN_SECRET: 'test-secret', PASS_MAIL: 'on', RATE_LIMIT_KV: fakeKv() };
  const { door, ns } = fakeDoor(env);
  env.DOOR = ns;
  const later = [];
  const call = body => handleEcoRequest({ method: 'POST', url: 'https://w/eco', body }, env, {}, '1.1.1.1', deps, p => later.push(p));
  const settle = () => Promise.all(later.splice(0));
  return { env, deps, door, call, settle };
}

test('/eco: everyone gets in while open, the door counts them behind the answer', async () => {
  forgetDoor();
  forgetPace();
  const t = setup();
  const a = await newPass(t.call, t.deps, 'stock');
  assert.equal(a.status, 200);
  await t.settle();
  assert.equal(report(t.door.book, Date.now()).n, 1);
});

test('/eco: full, a newcomer is turned away with a place in line; someone already in is not', async () => {
  forgetDoor();
  forgetPace();
  const t = setup();
  const first = await newPass(t.call, t.deps, 'stock');
  // (A second pass, made while there was room, its seat since gone: a newcomer with a pass.)
  const other = await newPass(t.call, t.deps, 'stock');
  await t.settle();
  const otherId = (await readToken('test-secret', other.data.token, 'ses')).d;
  delete t.door.book.seats[otherId];
  t.door.book.max = 1;
  // The door tells KV it's full (at its next answer); isolates read it.
  await t.door.fetch(new Request('https://door/now'));
  assert.equal(JSON.parse(t.env.RATE_LIMIT_KV.m.get(DOOR_STATE_KEY)).state, 'full');
  forgetDoor();
  const second = await t.call({ op: 'login', app: 'stock', passcode: other.data.passcode });
  assert.equal(second.status, 503);
  assert.equal(second.data.error.code, 'ORBIT_FULL');
  assert.equal(second.data.error.place, 1);
  assert.equal(second.data.token, undefined);
  // The one already in refreshes and is let in.
  const again = await t.call({ op: 'refresh', refresh: first.data.refresh, app: 'stock', claim: true });
  assert.equal(again.status, 200);
  const list = await ADMIN_TOOLS.door({ env: t.env, deps: t.deps });
  assert.equal(list.priority.length, 0);
  assert.equal(list.door.max, 1);
  assert.equal(list.door.line, 1);
});

// Turned away after the wallet was written, a sign-in that never happened had
// taken the app's live seat: the device using the app was told 已在別處開啟.
test('/eco: someone turned away at the door takes nothing from the device already using the app', async () => {
  forgetDoor();
  forgetPace();
  const t = setup();
  const a = await newPass(t.call, t.deps, 'stock');
  await t.settle();
  const id = (await readToken('test-secret', a.data.token, 'ses')).d;
  // Full, and this account's seat run out (its phone asleep past 15 minutes).
  t.door.book.max = 1;
  t.door.book.seats = { someone: Date.now() + 3_600_000 };
  await t.door.fetch(new Request('https://door/now'));
  forgetDoor();
  const before = t.deps.fsGet(t.env, 'eco-wallets', id);
  const turned = await t.call({ op: 'login', app: 'stock', passcode: a.data.passcode });
  assert.equal(turned.status, 503);
  assert.equal((await t.deps.fsGet(t.env, 'eco-wallets', id)).updateTime, (await before).updateTime, 'the wallet is as it was: the first device is still the live one');
});

// A new pass is shown once, in the answer that makes it: full, the answer was
// a 503 and the pass (made, its code spent) was never seen. Now a pass can't be
// begun while full, and one made is always handed over.
test('/eco: full, a new pass is refused before its code is mailed, never after the pass is made', async () => {
  forgetDoor();
  forgetPace();
  const t = setup();
  await newPass(t.call, t.deps, 'stock');
  await t.settle();
  t.door.book.max = 1;
  await t.door.fetch(new Request('https://door/now'));
  forgetDoor();
  const mails = [];
  const { sendMail } = t.deps;
  t.deps.sendMail = async (env, m) => void mails.push(m);
  t.deps.mailReady = () => true;
  const start = await t.call({ op: 'create-start', app: 'stock', addr: 'late@example.com' });
  assert.equal(start.status, 503);
  assert.equal(start.data.error.code, 'ORBIT_FULL');
  assert.equal(mails.length, 0, 'no code mailed');
  t.deps.sendMail = sendMail;
});
test('/eco: a pass made a moment before the door filled is still handed over', async () => {
  forgetDoor();
  forgetPace();
  const t = setup();
  await newPass(t.call, t.deps, 'stock');
  await t.settle();
  const mails = [];
  t.deps.sendMail = async (env, m) => void mails.push(m);
  t.deps.mailReady = () => true;
  assert.equal((await t.call({ op: 'create-start', app: 'stock', addr: 'intime@example.com' })).status, 200);
  // Full between the code and the pass, the isolate not yet told (its copy of the door's state up to a minute old).
  t.door.book.max = 1;
  const made = await t.call({ op: 'create', app: 'stock', addr: 'intime@example.com', code: mails.at(-1).code });
  assert.equal(made.status, 200);
  assert.match(made.data.passcode, /^[2-9A-HJ-NP-Z]{10}$/);
});

// 更換通行碼 gives the account a new id: its seat goes with it (asked as a newcomer, a full door answered 503
// and the new pass, the old one already dead, was never shown).
test('/eco: a new pass keeps its seat while the door is full, and the old id gives its seat up', async () => {
  forgetDoor();
  forgetPace();
  const t = setup();
  const a = await newPass(t.call, t.deps, 'stock');
  await t.settle();
  const oldId = (await readToken('test-secret', a.data.token, 'ses')).d;
  t.door.book.max = 1;
  await t.door.fetch(new Request('https://door/now'));
  forgetDoor();
  const r = await t.call({ op: 'rotate', qt: a.data.token });
  assert.equal(r.status, 200);
  assert.match(r.data.passcode, /^[2-9A-HJ-NP-Z]{10}$/);
  await t.settle();
  const newId = (await readToken('test-secret', r.data.token, 'ses')).d;
  assert.notEqual(newId, oldId);
  assert.deepEqual(Object.keys(t.door.book.seats), [newId]);
});

// A device code and a mailed code are spent as they're used: never turned away after.
test('/eco: a device code signs in while the door is full (the code is spent, there is no asking again)', async () => {
  forgetDoor();
  forgetPace();
  const t = setup();
  const a = await newPass(t.call, t.deps, 'stock');
  await t.settle();
  const id = (await readToken('test-secret', a.data.token, 'ses')).d;
  const pair = await t.call({ op: 'pair-create', qt: a.data.token });
  assert.equal(pair.status, 200);
  t.door.book.max = 1;
  t.door.book.seats = { someone: Date.now() + 3_600_000 };
  await t.door.fetch(new Request('https://door/now'));
  forgetDoor();
  const b = await t.call({ op: 'pair-redeem', app: 'stock', code: pair.data.code });
  assert.equal(b.status, 200);
  assert.ok(b.data.token);
  assert.ok(t.door.book.seats[id]);
});

test('the door: a seat asked for with `seat` is given whatever the room, and `from` gives the old one up', () => {
  const b = newBook();
  b.max = 1;
  ask(b, { id: 'a', now: T });
  assert.equal(ask(b, { id: 'x', now: T }).ok, false);
  assert.deepEqual(ask(b, { id: 'x', seat: true, now: T }), { ok: true });
  assert.equal(b.line.length, 0, 'out of the line it stood in');
  assert.deepEqual(ask(b, { id: 'a2', seat: true, from: 'a', now: T }), { ok: true });
  assert.deepEqual(Object.keys(b.seats).sort(), ['a2', 'x']);
});

test('/eco: a priority pass signs in with p in its session while the door is full', async () => {
  forgetDoor();
  forgetPace();
  const t = setup();
  // Two passes, made while open.
  const a = await newPass(t.call, t.deps, 'stock');
  const b = await newPass(t.call, t.deps, 'stock');
  await t.settle();
  const bId = (await readToken('test-secret', b.data.token, 'ses')).d;
  await ADMIN_TOOLS.priority({ env: t.env, deps: t.deps, body: { wallet: bId.slice(0, 8), on: true } });
  // Full, and b's seat gone (b now holds no seat: priority).
  t.door.book.max = 1;
  delete t.door.book.seats[bId];
  await t.door.fetch(new Request('https://door/now'));
  forgetDoor();
  const vip = await t.call({ op: 'login', app: 'stock', passcode: b.data.passcode });
  assert.equal(vip.status, 200);
  assert.equal((await readToken('test-secret', vip.data.token, 'ses')).p, 1);
  // Off again: no p.
  await ADMIN_TOOLS.priority({ env: t.env, deps: t.deps, body: { wallet: bId.slice(0, 8), on: false } });
  forgetDoor();
  const plain = await t.call({ op: 'refresh', refresh: vip.data.refresh, app: 'stock', claim: true });
  // Without priority and without a seat, full: turned away.
  assert.equal(plain.status, 503);
  assert.ok(a.data.token);
});

test('a door that breaks lets everyone in', async () => {
  forgetDoor();
  forgetPace();
  const kv = fakeKv();
  kv.m.set(DOOR_STATE_KEY, JSON.stringify({ state: 'full' }));
  const env = { RATE_LIMIT_KV: kv, DOOR: { idFromName: () => 'x', get: () => ({ fetch: () => Promise.reject(new Error('down')) }) } };
  assert.deepEqual(await admit(env, { id: 'a' }), { ok: true });
});

test('a session run out reads on only while the door is not full, or with a seat-free priority pass', async () => {
  forgetDoor();
  const kv = fakeKv();
  const env = { RATE_LIMIT_KV: kv };
  const now = Date.now();
  assert.equal(await graceShut(env, { s: 'x', e: now - 1000 }, now), false);
  forgetDoor();
  kv.m.set(DOOR_STATE_KEY, JSON.stringify({ state: 'full' }));
  assert.equal(await graceShut(env, { s: 'x', e: now - 1000 }, now), true);
  assert.equal(await graceShut(env, { s: 'x', e: now + 60_000 }, now), false, 'a live session reads');
  assert.equal(await graceShut(env, { s: 'x', p: 1, e: now - 1000 }, now), false, 'priority reads');
  forgetDoor();
});
