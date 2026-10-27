// The Pass's store on D1 (doc-store.js), run on SQLite itself (D1 is SQLite).
import test from 'node:test';
import assert from 'node:assert/strict';
import { fakeD1 as fakeD1Of } from './fake-d1.mjs';
import { d1Store, docStore, storeReady, SCHEMA } from '../doc-store.js';

const fakeD1 = () => fakeD1Of(SCHEMA);
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

test('a new version never repeats the one it replaces', async () => {
  const s = d1Store(fakeD1());
  const w = await s.write('c', 'a', 'one');
  // The same stamp asked for again: a different one is used.
  const again = await s.write('c', 'a', 'two', { updateTime: w.updateTime }, { updated: w.updateTime });
  assert.notEqual(again.updateTime, w.updateTime);
  await assert.rejects(s.write('c', 'a', 'three', { updateTime: w.updateTime }), e => e.precondition);
});

test('changeDoc: one JSON document read, changed and written over the version read; a lost race changed again; unchanged, nothing written; null, deleted', async () => {
  const { changeDoc, parseDoc } = await import('../doc-store.js');
  const s = d1Store(fakeD1());
  let writes = 0;
  const deps = { fsGet: (env, c, id) => s.get(c, id), fsWrite: (env, c, id, p, pre) => (writes++, s.write(c, id, p, pre)), fsDelete: (env, c, id) => s.delete(c, id) };
  const read = v => v || { n: 0 };
  assert.deepEqual(await changeDoc({}, deps, 'c', 'd', v => ({ n: v.n + 1 }), { read }), { n: 1 });
  // A race: another request writes n=10 after this one read n=1.
  const doc = await s.get('c', 'd');
  let raced = false;
  const racing = { ...deps, fsGet: async (env, c, id) => {
    const got = await s.get(c, id);
    if (!raced) {
      raced = true;
      await s.write(c, id, JSON.stringify({ n: 10 }), { updateTime: doc.updateTime });
    }
    return got;
  } };
  assert.deepEqual(await changeDoc({}, racing, 'c', 'd', v => ({ n: v.n + 1 }), { read }), { n: 11 }, 'changed again on the newer copy');
  assert.deepEqual(parseDoc(await s.get('c', 'd')), { n: 11 });
  // Unchanged: no write.
  writes = 0;
  const same = await changeDoc({}, deps, 'c', 'd', v => v, { read });
  assert.deepEqual(same, { n: 11 });
  assert.equal(writes, 0);
  // Written as `write` says; null deletes it.
  await changeDoc({}, deps, 'c', 'd', () => ({ n: 0 }), { read, write: v => (v.n ? v : null) });
  assert.equal((await s.get('c', 'd')).exists, false);
  // Every attempt lost: undefined.
  const always = { ...deps, fsWrite: async () => Promise.reject(Object.assign(new Error('lost'), { precondition: true })) };
  assert.equal(await changeDoc({}, always, 'c', 'e', v => ({ n: v.n + 1 }), { read, attempts: 3 }), undefined);
  // Any other failure is thrown.
  const broken = { ...deps, fsWrite: async () => Promise.reject(new Error('D1 down')) };
  await assert.rejects(changeDoc({}, broken, 'c', 'e', v => ({ n: v.n + 1 }), { read }), /D1 down/);
  // An unreadable document reads as none.
  await s.write('c', 'bad', '{nope');
  assert.equal(parseDoc(await s.get('c', 'bad')), null);
  assert.equal(parseDoc({ exists: false }), null);
  assert.equal(parseDoc(null), null);
});

test('history: the version a write replaces kept at most hourly, always before a wipe, a delete or a restore; thinned to a day each after 2 days, gone after 30', async () => {
  let t = Date.UTC(2026, 9, 1);
  const s = d1Store(fakeD1(), { keep: c => c === 'eco-wallets', now: () => t });
  const big = n => JSON.stringify({ n, pad: 'x'.repeat(500) });
  const v1 = await s.write('eco-wallets', 'a', big(1));
  await s.write('eco-wallets', 'a', big(2));
  t += 60_000;
  await s.write('eco-wallets', 'a', big(3));
  // One copy within the hour (v1, the first replaced).
  assert.deepEqual((await s.versions('a')).map(v => [v.updated, v.why]), [[v1.updateTime, 'hour']]);
  // A save under half the size: the one it replaces kept, whatever the hour.
  await s.write('eco-wallets', 'a', '{}');
  assert.deepEqual((await s.versions('a')).map(v => v.why), ['shrink', 'hour']);
  assert.equal(JSON.parse(await s.version('eco-wallets', 'a', (await s.versions('a'))[0].updated)).n, 3);
  // A collection not kept: no history.
  await s.write('eco-pairs', 'p', 'one');
  await s.write('eco-pairs', 'p', 'two');
  await s.delete('eco-pairs', 'p');
  assert.equal((await s.versions('p')).length, 0);
  // Deleted: kept, listed as gone, and put back.
  t += 1000;
  await s.delete('eco-wallets', 'a');
  assert.equal((await s.get('eco-wallets', 'a')).exists, false);
  assert.deepEqual((await s.kept('eco-wallets', { gone: true })).map(g => g.id), ['a']);
  const shrunk = (await s.versions('a')).find(v => v.why === 'shrink');
  await s.restore('eco-wallets', 'a', shrunk.updated);
  assert.equal(JSON.parse((await s.get('eco-wallets', 'a')).payload).n, 3);
  assert.deepEqual(await s.kept('eco-wallets', { gone: true }), []);
  assert.equal(await s.restore('eco-wallets', 'a', 'nope'), null);
  // A write that lost its race changes nothing but may keep the current version.
  await assert.rejects(s.write('eco-wallets', 'a', big(9), { updateTime: 'old' }), e => e.precondition);
  assert.equal(JSON.parse((await s.get('eco-wallets', 'a')).payload).n, 3);
  // Thinning: 3 days on, a day keeps its newest; 31 days on, nothing.
  const before = (await s.versions('a')).length;
  assert.ok(before >= 3);
  t += 3 * 86_400_000;
  await s.prune();
  assert.equal((await s.versions('a')).length, 1);
  t += 31 * 86_400_000;
  await s.prune();
  assert.equal((await s.versions('a')).length, 0);
});

test('page: every document in (coll, id) order, a page at a time', async () => {
  const s = d1Store(fakeD1());
  for (const [c, id] of [['b', '1'], ['a', '2'], ['a', '1'], ['c', '0']]) await s.write(c, id, `${c}${id}`);
  const seen = [];
  let from = ['', ''];
  for (let rows; (rows = await s.page(from, 2)).length; from = [rows.at(-1).coll, rows.at(-1).id]) seen.push(...rows.map(r => r.payload));
  assert.deepEqual(seen, ['a1', 'a2', 'b1', 'c0']);
});
