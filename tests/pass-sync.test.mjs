// The kit's Pass sync (kit/pass-sync.mjs): an app's copy is never written
// over a newer or unreadable one on the Pass.
import test from 'node:test';
import assert from 'node:assert/strict';
import { passSync, BRIEF_MS, CLAIM_WAIT_MS } from '../kit/pass-sync.mjs';

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
const flush = () => new Promise(r => setImmediate(r));
const keys = payload => Object.keys(decodeCopy(payload)?.items || {}).sort();

// The Worker, as far as an app's payload goes: one live session; a write
// from any other refused.
function worker() {
  const w = { payload: '', live: null, writes: 0, reads: 0, time: 0, fail: null };
  const stamp = () => (w.payload ? `t${w.time}` : '');
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
      claim: () => {
        w.live = name;
        q.set(true);
        (listeners.claim || []).forEach(fn => fn({ ok: true, active: true }));
        return { payload: w.payload, updateTime: stamp() };
      },
      read: async () => (w.reads++, q.set(w.live === name), { payload: w.payload, updateTime: stamp() }),
      write: async ({ payload, base }) => {
        if (base && base !== stamp()) throw Object.assign(new Error('changed'), { code: 'ECO_DATA_CHANGED' });
        if (w.fail) {
          const error = w.fail;
          w.fail = null;
          if (error.landed) [w.payload, w.time] = [payload, w.time + 1];
          throw error;
        }
        if (!q.active || w.live !== name) {
          q.set(false);
          throw Object.assign(new Error('not live'), { code: 'ECO_SESSION_MOVED' });
        }
        w.writes++;
        w.time++;
        w.payload = payload;
        return { updateTime: stamp() };
      }
    };
    return q;
  };
  return w;
}
function device(w, name, clock = { t: 0 }) {
  const q = w.session(name);
  const state = { items: {}, applied: 0 };
  const doc = { visibilityState: 'visible', listeners: [], addEventListener: (_, fn) => doc.listeners.push(fn) };
  const sync = passSync(q, {
    decode: decodeCopy,
    encode: () => encodeCopy(state),
    now: () => clock.t,
    apply: theirs => {
      state.applied++;
      for (const [k, t] of Object.entries(theirs.items)) if (!(state.items[k] >= t)) state.items[k] = t;
    }
  });
  return {
    q,
    state,
    sync,
    open: async () => (await sync.first(q.claim(), { local: Object.keys(state.items).length > 0 }), sync.watch(doc), sync.sync()),
    add: async (key, t) => ((state.items = { ...state.items, [key]: t }), sync.changed(), sync.sync()),
    doc,
    hide: () => ((doc.visibilityState = 'hidden'), doc.listeners.forEach(fn => fn())),
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
  const clock = { t: 0 };
  const a = device(w, 'A', clock);
  const b = device(w, 'B');
  await a.open();
  await a.add('apple', 1);
  a.hide();
  await b.open();
  await b.add('banana', 2);
  // A still believes it's live; coming back a minute later it reads first.
  clock.t += 60_000;
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

test('back within 10 s, read and nothing changed here meanwhile: the Pass is not read again', async () => {
  const w = worker();
  const clock = { t: 0 };
  const a = device(w, 'A', clock);
  await a.open();
  await a.add('apple', 1);
  const reads = w.reads;
  a.hide();
  clock.t += BRIEF_MS - 1;
  await a.show();
  assert.equal(w.reads, reads);
  // Away longer: read once.
  a.hide();
  clock.t += BRIEF_MS;
  await a.show();
  assert.equal(w.reads, reads + 1);
});

test("back on screen: the one read waits for the kit's claim, or 3 s without one", async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const w = worker();
  const clock = { t: 0 };
  const a = device(w, 'A', clock);
  await a.open();
  const reads = w.reads;
  a.hide();
  clock.t += 60_000;
  a.doc.visibilityState = 'visible';
  a.doc.listeners.forEach(fn => fn());
  await flush();
  assert.equal(w.reads, reads, 'not read before the claim');
  a.q.claim();
  await flush();
  assert.equal(w.reads, reads + 1);
  t.mock.timers.tick(CLAIM_WAIT_MS);
  await flush();
  assert.equal(w.reads, reads + 1, 'one read, not two');
  // No claim reply (offline): read after 3 s.
  a.hide();
  clock.t += 60_000;
  a.doc.visibilityState = 'visible';
  a.doc.listeners.forEach(fn => fn());
  t.mock.timers.tick(CLAIM_WAIT_MS - 1);
  await flush();
  assert.equal(w.reads, reads + 1);
  t.mock.timers.tick(1);
  await flush();
  assert.equal(w.reads, reads + 2);
});

test('a copy the same as the one last read or written here is not merged again', async () => {
  const w = worker();
  const a = device(w, 'A');
  await a.open();
  await a.add('apple', 1);
  const applied = a.state.applied;
  a.sync.stale();
  await a.sync.sync();
  assert.equal(a.state.applied, applied);
  const b = device(w, 'B');
  await b.open();
  await b.add('banana', 2);
  w.live = 'A';
  a.sync.stale();
  await a.sync.sync();
  assert.equal(a.state.applied, applied + 1);
  assert.equal(a.state.items.banana, 2);
});

test('a write lost on the way (it may have landed) reads the Pass first next time', async () => {
  const w = worker();
  const a = device(w, 'A');
  await a.open();
  await a.add('apple', 1);
  w.fail = Object.assign(new Error('network'), { landed: true });
  await a.add('banana', 2);
  assert.equal(a.sync.dirty, true);
  assert.equal(a.sync.pulled, false);
  const reads = w.reads;
  await a.sync.sync();
  assert.equal(w.reads, reads + 1);
  assert.deepEqual(keys(w.payload), ['apple', 'banana']);
});

test("a read started before the copy went stale is merged but doesn't count as read", async () => {
  const w = worker();
  const a = device(w, 'A');
  await a.open();
  let release;
  const read = a.q.read;
  a.q.read = async opts => (await new Promise(r => (release = r)), read(opts));
  a.sync.stale();
  a.sync.changed();
  const going = a.sync.sync();
  await Promise.resolve();
  a.sync.stale();
  release();
  await going;
  assert.equal(a.sync.pulled, false);
  assert.equal(w.writes, 0);
  a.q.read = read;
  await a.sync.sync();
  assert.equal(a.sync.pulled, true);
  assert.equal(w.writes, 1);
});

test('known: false until a copy of the Pass has been read (opened offline), true after', async () => {
  const w = worker();
  const a = device(w, 'A');
  await a.sync.first({ offline: true }, { local: false });
  assert.equal(a.sync.known, false);
  await a.sync.sync();
  assert.equal(a.sync.known, false);
  a.q.claim();
  await a.sync.sync();
  assert.equal(a.sync.known, true);
});

test('a read whose merge keeps something only this phone has writes it up at once, not at the next edit', async () => {
  const w = worker();
  const b = device(w, 'B');
  await b.open();
  await b.add('banana', 2);
  const a = device(w, 'A');
  a.state.items = { apple: 1 };
  // Opened as if nothing were its own: the merge alone shows the Pass lacks apple.
  await a.sync.first(a.q.claim(), { local: false });
  await flush();
  await a.sync.sync();
  assert.deepEqual(keys(w.payload), ['apple', 'banana']);
  // Merging a copy that already has everything writes nothing more.
  const writes = w.writes;
  a.sync.stale();
  await a.sync.sync();
  assert.equal(w.writes, writes);
});

test('a save over a copy the Pass no longer holds is refused, then read, merged and saved again at once', async () => {
  const w = worker();
  const a = device(w, 'A');
  await a.open();
  await a.add('apple', 1);
  // Another phone saved while this one never heard (no stale): the Worker's version moved on.
  const other = { items: { ...decodeCopy(w.payload).items, banana: 2 } };
  [w.payload, w.time] = [encodeCopy(other), w.time + 1];
  await a.add('cherry', 3);
  assert.deepEqual(keys(w.payload), ['apple', 'banana', 'cherry']);
  assert.equal(a.state.items.banana, 2);
});
