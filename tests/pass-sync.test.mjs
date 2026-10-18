// The kit's Pass sync (kit/pass-sync.mjs): an app's copy is never written
// over a newer or unreadable one on the Pass.
import test from 'node:test';
import assert from 'node:assert/strict';
import { passSync } from '../kit/pass-sync.mjs';

// An app's payload: { v: 1, items: { key: time } }, merged newest per key.
const encodeCopy = s => JSON.stringify({ v: 1, items: s.items });
const decodeCopy = text => {
  try {
    const x = JSON.parse(text);
    return x?.v === 1 && x.items && typeof x.items === 'object' ? x : null;
  } catch {
    return null;
  }
};
const keys = payload => Object.keys(decodeCopy(payload)?.items || {}).sort();

// The Worker, as far as an app's payload goes: one live session; a write
// from any other refused.
function worker() {
  const w = { payload: '', live: null, writes: 0 };
  w.session = name => {
    const listeners = {};
    const q = {
      active: false,
      on: (ev, fn) => ((listeners[ev] ||= []).push(fn), q),
      set: live => {
        if (q.active === live) return;
        q.active = live;
        (listeners.active || []).forEach(fn => fn(live));
      },
      claim: () => ((w.live = name), q.set(true), { payload: w.payload }),
      read: async () => (q.set(w.live === name), { payload: w.payload }),
      write: async ({ payload }) => {
        if (!q.active || w.live !== name) {
          q.set(false);
          throw Object.assign(new Error('not live'), { code: 'ECO_SESSION_MOVED' });
        }
        w.writes++;
        w.payload = payload;
        return {};
      }
    };
    return q;
  };
  return w;
}
function device(w, name) {
  const q = w.session(name);
  const state = { items: {} };
  const doc = { visibilityState: 'visible', listeners: [], addEventListener: (_, fn) => doc.listeners.push(fn) };
  const sync = passSync(q, {
    decode: decodeCopy,
    encode: () => encodeCopy(state),
    apply: theirs => {
      for (const [k, t] of Object.entries(theirs.items)) if (!(state.items[k] >= t)) state.items[k] = t;
    }
  });
  return {
    q,
    state,
    sync,
    open: async () => (await sync.first(q.claim(), { local: Object.keys(state.items).length > 0 }), sync.watch(doc), sync.sync()),
    add: async (key, t) => ((state.items = { ...state.items, [key]: t }), sync.changed(), sync.sync()),
    hide: () => (doc.visibilityState = 'hidden'),
    show: async () => {
      doc.visibilityState = 'visible';
      w.live = name;
      doc.listeners.forEach(fn => fn());
      await sync.sync();
    }
  };
}

test("back on screen: the Pass is read before writing, so another phone's changes are never written over", async () => {
  const w = worker();
  const a = device(w, 'A');
  const b = device(w, 'B');
  await a.open();
  await a.add('apple', 1);
  a.hide();
  await b.open();
  await b.add('banana', 2);
  // A still believes it's live; coming back it reads first.
  await a.show();
  assert.equal(a.state.items.banana, 2);
  await a.add('cherry', 3);
  assert.deepEqual(keys(w.payload), ['apple', 'banana', 'cherry']);
});

test('a refused write (another phone live) reads the Pass first next time', async () => {
  const w = worker();
  const a = device(w, 'A');
  const b = device(w, 'B');
  await a.open();
  await b.open();
  await b.add('banana', 1);
  await a.add('apple', 2);
  assert.equal(a.q.active, false);
  assert.deepEqual(keys(w.payload), ['banana']);
  w.live = 'A';
  a.q.set(true);
  await a.sync.sync();
  assert.deepEqual(keys(w.payload), ['apple', 'banana']);
});

test('opened offline: nothing written until the Pass has been read and merged', async () => {
  const w = worker();
  const b = device(w, 'B');
  await b.open();
  await b.add('banana', 1);
  const a = device(w, 'A');
  a.state.items = { apple: 2 };
  await a.sync.first({ offline: true }, { local: true });
  a.sync.watch({ addEventListener() {} });
  await a.sync.sync();
  assert.deepEqual(keys(w.payload), ['banana']);
  a.q.claim();
  await a.sync.sync();
  assert.deepEqual(keys(w.payload), ['apple', 'banana']);
});

test("a copy this version can't read is never written over; nothing changed, nothing written", async () => {
  const w = worker();
  w.payload = '{"v":2,"from":"a newer version"}';
  const a = device(w, 'A');
  a.state.items = { apple: 1 };
  await a.open();
  await a.add('banana', 2);
  assert.equal(w.payload, '{"v":2,"from":"a newer version"}');
  assert.equal(a.sync.unreadable, true);
  assert.equal(w.writes, 0);

  const w2 = worker();
  const c = device(w2, 'C');
  await c.open();
  await c.add('apple', 1);
  const writes = w2.writes;
  c.hide();
  await c.show();
  assert.equal(w2.writes, writes);
});
