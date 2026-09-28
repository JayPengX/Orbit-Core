// The shared kit's pure parts: the pool, activity and the recommender.
import test from 'node:test';
import assert from 'node:assert/strict';

const store = new Map();
globalThis.localStorage = { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
const kit = await import('../kit/quadra.mjs');

test('the pool is every entry and every app figure', () => {
  const w = { entries: [{ id: 'a', amount: 100, app: 'odds' }, { id: 'b', amount: -40, app: 'eco' }], snap: { stock: { cash: 1000, t: 1 } } };
  assert.equal(kit.poolBalance(w), 1060);
  assert.equal(kit.othersBalance(w, 'stock'), 60);
});

test('activity counts reset each Taiwan day', () => {
  const day1 = Date.UTC(2026, 9, 1, 3);
  let w = { settings: {} };
  w.settings = { ...w.settings, ...kit.activityPatch(w, 'stock', 'trade', 1, day1).settings };
  w.settings = { ...w.settings, ...kit.activityPatch(w, 'stock', 'trade', 2, day1).settings };
  assert.deepEqual(kit.todayActivity(w, day1).stock, { trade: 3 });
  assert.deepEqual(kit.todayActivity(w, day1 + 86_400_000), {});
});

test('recommendations follow affinity, stay diverse, and learn from dismissals', () => {
  store.clear();
  const now = Date.UTC(2026, 9, 1);
  for (let i = 0; i < 5; i++) kit.recordAffinity('odds', ['team:mlb:LAD', 'league:mlb'], 1, now);
  kit.recordAffinity('match', ['league:epl'], 1, now);
  const items = [
    ...Array.from({ length: 6 }, (_, i) => ({ id: `lad${i}`, keys: ['team:mlb:LAD', 'league:mlb'], quality: 0.5, group: 'LAD' })),
    { id: 'epl', keys: ['league:epl'], quality: 0.5, group: 'epl' },
    { id: 'nba', keys: ['league:nba'], quality: 0.5, group: 'nba' }
  ];
  const top = kit.rank(items, { n: 4, now });
  assert.equal(top[0].group, 'LAD');
  assert.equal(top[0].why, 'team:mlb:LAD');
  // Not all four from the same team.
  assert.ok(new Set(top.map(t => t.group)).size >= 2);
  kit.dismiss(top[0].id);
  assert.notEqual(kit.rank(items, { n: 1, now })[0].id, top[0].id);
});

test('affinity decays: last month counts for less than today', () => {
  store.clear();
  const now = Date.UTC(2026, 9, 1);
  kit.recordAffinity('stock', ['sym:OLD'], 5, now - 60 * 86_400_000);
  kit.recordAffinity('stock', ['sym:NEW'], 2, now);
  const a = kit.affinity(null, now);
  assert.ok(a['sym:NEW'] > a['sym:OLD']);
  // The wallet copy carries the strongest keys.
  const patch = kit.affinityPatch('stock', now).settings['aff:stock'].value;
  assert.ok(patch['sym:NEW']);
});

test('pass codes', () => {
  assert.equal(kit.cleanCode('abcde-23456'), 'ABCDE23456');
  assert.equal(kit.formatPass('ABCDE23456'), 'ABCDE-23456');
  assert.ok(kit.isPass('ABCDE-23456'));
});
