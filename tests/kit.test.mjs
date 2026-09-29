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

test('account details: this month in and out, latest entries first', () => {
  const now = Date.UTC(2026, 9, 15, 4);
  const w = {
    created: Date.UTC(2026, 0, 1),
    entries: [
      { id: 'a', t: Date.UTC(2026, 8, 30), amount: 500, app: 'vocab', kind: 'reward' },
      { id: 'b', t: Date.UTC(2026, 9, 2), amount: 7000, app: 'eco', kind: 'pay' },
      { id: 'c', t: Date.UTC(2026, 9, 3), amount: -200, app: 'odds', kind: 'stake' }
    ]
  };
  const d = kit.accountDetails(w, 'zh', now);
  assert.equal(d.in, 7000);
  assert.equal(d.out, -200);
  assert.equal(d.count, 2);
  assert.equal(d.recent[0].amount, -200);
  assert.match(d.recent[1].text, /Quadra · 每月薪資/);
});

test('proxyJson batches requests made together and remembers answers', async () => {
  const calls = [];
  globalThis.fetch = async url => {
    calls.push(String(url));
    const u = new URL(url);
    if (u.searchParams.has('batch')) {
      const r = u.searchParams.getAll('u').map(x => ({ s: 200, b: { echo: x } }));
      return new Response(JSON.stringify({ r }), { status: 200 });
    }
    return new Response(JSON.stringify({ echo: u.searchParams.get('url') }), { status: 200 });
  };
  const [a, b, c] = await Promise.all([kit.proxyJson('https://x.test/a', { persist: false }), kit.proxyJson('https://x.test/b', { persist: false }), kit.proxyJson('https://x.test/c', { trim: 'kambi-events', persist: false })]);
  assert.equal(calls.length, 1);
  assert.ok(calls[0].includes('batch=1'));
  assert.equal(a.echo, 'https://x.test/a');
  assert.equal(b.echo, 'https://x.test/b');
  assert.equal(c.echo, 'kambi-events!https://x.test/c');
  // Asked again within its time: from memory.
  await kit.proxyJson('https://x.test/a', { persist: false });
  assert.equal(calls.length, 1);
  // Alone: a plain request.
  const d = await kit.proxyJson('https://x.test/d', { persist: false });
  assert.equal(d.echo, 'https://x.test/d');
  assert.equal(calls.length, 2);
  assert.ok(!calls[1].includes('batch=1'));
});

test('a device keeps its sign-in and the account id, never the pass', () => {
  store.clear();
  assert.equal(kit.storedAccount(), '');
  const claims = Buffer.from(JSON.stringify({ k: 'ref', d: 'abcdef0123456789abcdef', s: 'S', g: 0, e: 9e15 })).toString('base64url');
  store.set('quadra.refresh', `${claims}.sig`);
  store.set('quadra.account', 'abcdef0123456789');
  assert.equal(kit.storedAccount(), 'abcdef0123456789');
  store.delete('quadra.refresh');
  assert.equal(kit.storedAccount(), '', 'no sign-in, no account');
  assert.equal(kit.formatPass('ABCDE23456'), 'ABCDE-23456');
  assert.equal(kit.formatPass('ABCD2345'), 'ABCD-2345');
  assert.ok(kit.DEVICE_CODE_PATTERN.test('ABCD2345'));
});

test('Quadra Plus: a month is a member’s when the Worker billed it; joining is free once', () => {
  const oct = Date.UTC(2026, 9, 10, 4);
  const w = { entries: [{ id: 'eco:plus:2026-10', t: 1, app: 'eco', kind: 'plus', amount: 0 }], settings: { plus: { value: { on: true }, t: 1 } } };
  assert.equal(kit.plusMember(w, oct), true);
  assert.equal(kit.plusMember(w, Date.UTC(2026, 10, 2)), false);
  assert.equal(kit.plusRenewing(w), true);
  assert.deepEqual([...kit.plusMonths(w)], ['2026-10']);
  // An app's own entry never counts.
  assert.equal(kit.plusMember({ entries: [{ id: 'eco:plus:2026-10', app: 'odds', kind: 'plus' }] }, oct), false);
  assert.equal(kit.plusJoinPrice({ entries: [] }, oct), 0);
  // 22 of 31 days left.
  assert.equal(kit.plusJoinPrice(w, oct), 210);
});
