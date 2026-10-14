// The Pass's store on D1 (doc-store.js), run on SQLite itself (D1 is SQLite).
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { d1Store, docStore, storeReady, SCHEMA } from '../doc-store.js';

// D1's API over node:sqlite.
function fakeD1() {
  const db = new DatabaseSync(':memory:');
  db.exec(SCHEMA);
  return {
    prepare: sql => {
      let args = [];
      const st = db.prepare(sql);
      const self = {
        bind: (...a) => ((args = a), self),
        first: async () => st.get(...args) || null,
        run: async () => ({ meta: { changes: Number(st.run(...args).changes) } }),
        all: async () => ({ results: st.all(...args) })
      };
      return self;
    }
  };
}
// Firestore, in memory, its shape (updateTime per write).
test('D1: a write only if it is still what was read; a create only if new; a race lost says so', async () => {
  const s = d1Store(fakeD1());
  assert.deepEqual(await s.get('eco-wallets', 'a'), { exists: false, updateTime: '', payload: '' });
  const first = await s.write('eco-wallets', 'a', '{"n":1}', { exists: false });
  await assert.rejects(s.write('eco-wallets', 'a', '{"n":9}', { exists: false }), e => e.precondition);
  const read = await s.get('eco-wallets', 'a');
  assert.equal(read.updateTime, first.updateTime);
  const second = await s.write('eco-wallets', 'a', '{"n":2}', { updateTime: read.updateTime });
  await assert.rejects(s.write('eco-wallets', 'a', '{"n":3}', { updateTime: read.updateTime }), e => e.precondition, 'the old updateTime: lost the race');
  assert.equal((await s.get('eco-wallets', 'a')).payload, '{"n":2}');
  assert.notEqual(second.updateTime, first.updateTime);
  await s.write('eco-wallets', 'b', 'x');
  assert.deepEqual((await s.list('eco-wallets')).map(d => d.id), ['a', 'b']);
  assert.deepEqual(await s.collections(), ['eco-wallets']);
  const r = await s.batch([{ update: ['eco-wallets', 'a', 'y'], updateTime: 'stale' }, { delete: ['eco-wallets', 'b'] }]);
  assert.equal(r.status[0].code, 9);
  assert.deepEqual(r.status[1], {});
  assert.equal((await s.get('eco-wallets', 'b')).exists, false);
});

test('the store: every call (env, …) on D1; batches each write on its own; counts by collection; ready only with D1 bound', async () => {
  const env = { STORE: fakeD1() };
  const store = docStore();
  const w = await store.write(env, 'eco-wallets', 'a', 'one');
  await store.write(env, 'odds-open', 'b', 'two');
  const r = await store.batch(env, [{ update: ['eco-wallets', 'a', 'three'], updateTime: w.updateTime }, { update: ['eco-wallets', 'a', 'four'], updateTime: w.updateTime }, { delete: ['odds-open', 'b'] }]);
  assert.deepEqual(r.status.map(x => x.code || 0), [0, 9, 0]);
  assert.equal((await store.get(env, 'eco-wallets', 'a')).payload, 'three');
  assert.deepEqual(await store.count(env), { 'eco-wallets': 1 });
  assert.deepEqual((await store.list(env, 'eco-wallets')).map(d => d.id), ['a']);
  assert.ok(storeReady(env));
  assert.ok(!storeReady({}));
});
