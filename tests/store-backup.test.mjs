// The Pass's nightly copy to R2 (store-backup.js) over a store on SQLite and a map for R2.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fakeD1 } from './fake-d1.mjs';
import { docStore, SCHEMA } from '../doc-store.js';
import { backupStore, backupsToDrop, listBackups, fromBackup, backupKey } from '../store-backup.js';

function fakeR2() {
  const m = new Map();
  return {
    m,
    head: async k => (m.has(k) ? {} : null),
    put: async (k, body, o) => void m.set(k, { body: new Uint8Array(body), meta: o?.customMetadata || {} }),
    get: async k => (m.has(k) ? { body: new Blob([m.get(k).body]).stream() } : null),
    delete: async k => void m.delete(k),
    list: async ({ prefix }) => ({ objects: [...m.keys()].filter(k => k.startsWith(prefix)).map(k => ({ key: k, size: m.get(k).body.length, customMetadata: m.get(k).meta })), truncated: false })
  };
}

test('backup: the whole store gzipped to R2 once a night, read back by document; 14 nights and a year of firsts kept', async () => {
  const env = { STORE: fakeD1(SCHEMA), DATA: fakeR2() };
  const store = docStore();
  for (let i = 0; i < 450; i++) await store.write(env, i % 2 ? 'eco-wallets' : 'orbit-law', `id${i}`, JSON.stringify({ i }));
  const now = Date.UTC(2026, 9, 26, 20, 30);
  const r = await backupStore(env, store, now);
  assert.equal(r.docs, 450);
  assert.equal(r.key, backupKey('2026-10-27'));
  assert.equal(await backupStore(env, store, now), null, 'once a night');
  assert.deepEqual((await listBackups(env)).map(b => [b.day, b.docs]), [['2026-10-27', 450]]);
  const hits = await fromBackup(env, '2026-10-27', row => row.id === 'id7');
  assert.deepEqual(hits.map(h => [h.coll, JSON.parse(h.payload).i]), [['eco-wallets', 7]]);
  assert.equal(await fromBackup(env, '2026-01-01', () => true), null);
  const days = Array.from({ length: 400 }, (_, i) => new Date(Date.UTC(2026, 9, 27) - i * 86_400_000).toISOString().slice(0, 10));
  const kept = days.filter(d => !backupsToDrop(days, Date.UTC(2026, 9, 27)).includes(d));
  assert.equal(kept.length, 14 + 12);
  assert.ok(kept.includes('2025-11-01') && !kept.includes('2025-10-01'));
});
