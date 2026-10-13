// The Pass's store on D1 (doc-store.js), run on SQLite itself (D1 is SQLite).
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { d1Store, docStore, copyToD1, compareStores, backupToR2, BACKUP_PATH, SCHEMA } from '../doc-store.js';
import { gzip, gunzip } from '../builders/store.js';

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
function fakeFs() {
  const m = new Map();
  let t = 0;
  const key = (c, id) => `${c}\n${id}`;
  return {
    m,
    get: async (env, c, id) => (m.has(key(c, id)) ? { exists: true, ...m.get(key(c, id)) } : { exists: false, updateTime: '', payload: '' }),
    write: async (env, c, id, payload, pre) => {
      const had = m.get(key(c, id));
      if (pre?.updateTime && had?.updateTime !== pre.updateTime) throw Object.assign(new Error('pre'), { precondition: true });
      if (pre?.exists === false && had) throw Object.assign(new Error('pre'), { precondition: true });
      const updateTime = `2026-10-13T00:00:00.${String(++t).padStart(6, '0')}Z`;
      m.set(key(c, id), { payload, updateTime });
      return { updateTime };
    },
    list: async (env, c) => [...m].filter(([k]) => k.startsWith(`${c}\n`)).map(([k, v]) => ({ id: k.split('\n')[1], ...v })),
    collections: async () => [...new Set([...m.keys()].map(k => k.split('\n')[0]))],
    batch: async (env, writes) => ({ status: writes.map(() => ({})), writeResults: [] }),
    delete: async (env, c, id) => void m.delete(key(c, id))
  };
}

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

test('moving: dual writes Firestore then D1 (the same updateTime); the copy brings the rest without overwriting; the comparison is clean; D1 alone after', async () => {
  const fs = fakeFs();
  const env = { STORE: fakeD1(), STORE_MODE: 'firestore' };
  const store = docStore(fs);
  await store.write(env, 'eco-wallets', 'old', 'before the move');
  env.STORE_MODE = 'dual';
  const w = await store.write(env, 'eco-wallets', 'new', 'while moving');
  assert.equal((await d1Store(env.STORE).get('eco-wallets', 'new')).updateTime, w.updateTime);
  assert.equal((await store.get(env, 'eco-wallets', 'old')).payload, 'before the move', 'reads are Firestore\'s');
  const copy = await copyToD1(env, fs);
  assert.deepEqual(copy, { collections: 1, docs: 2, copied: 1 });
  assert.deepEqual(await compareStores(env, fs), { collections: { 'eco-wallets': { firestore: 2, differ: 0, missing: 0, extra: 0 } }, differ: 0, missing: 0, extra: 0 });
  // The race a Pass write makes, on D1 now: what it read is what D1 has.
  env.STORE_MODE = 'd1';
  const read = await store.get(env, 'eco-wallets', 'old');
  assert.equal(read.payload, 'before the move');
  await store.write(env, 'eco-wallets', 'old', 'on D1', { updateTime: read.updateTime });
  assert.equal(fs.m.get('eco-wallets\nold').payload, 'before the move', 'Firestore untouched once D1 has it');
});

test('the backup: every Firestore document into R2 under private/, gzipped, read back whole', async () => {
  const fs = fakeFs();
  await fs.write({}, 'eco-wallets', 'a', '{"cash":1}');
  await fs.write({}, 'odds-open', 'b', '{"slip":2}');
  const put = new Map();
  const env = { DATA: { put: async (k, bytes, o) => void put.set(k, { bytes, o }) } };
  const r = await backupToR2(env, fs, { gzip });
  assert.equal(r.docs, 2);
  assert.ok(BACKUP_PATH.startsWith('private/'));
  const lines = new TextDecoder().decode(await gunzip(put.get(BACKUP_PATH).bytes)).split('\n').map(l => JSON.parse(l));
  assert.deepEqual(lines.map(l => [l.coll, l.id, l.payload]), [['eco-wallets', 'a', '{"cash":1}'], ['odds-open', 'b', '{"slip":2}']]);
  assert.ok(lines.every(l => l.updated));
  assert.equal(put.get(BACKUP_PATH).o.customMetadata.docs, '2');
});
