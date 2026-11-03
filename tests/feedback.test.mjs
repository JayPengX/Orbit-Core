// The family's one engine for picks (kit/feedback.mjs): what a list showed,
// what was opened from it or anywhere, what was done; passed-over picks
// sink, opened ones rise, by their keys; kept on the Pass.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as F from '../kit/feedback.mjs';

const mem = () => {
  const m = new Map();
  return { m, getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) };
};
const DAY = 86_400_000;
const T0 = Date.UTC(2026, 9, 1);

test('a pick shown day after day and never opened sinks; its league with it; one opened rises', () => {
  F.useStore(mem());
  const a = { id: 'epl:1', keys: ['league:epl', 'team:epl:arsenal'] };
  const b = { id: 'nba:2', keys: ['league:nba', 'team:nba:lakers'] };
  for (let d = 0; d < 14; d++) {
    const now = T0 + d * DAY;
    F.shown('x', [{ ...a, id: `epl:${d}` }, { ...b, id: `nba:${d}` }], now);
    if (d % 2 === 0) F.picked('x', { ...b, id: `nba:${d}` }, now + 1000);
  }
  const now = T0 + 14 * DAY;
  const lift = F.lifter('x', now);
  assert.ok(lift({ id: 'epl:99', keys: a.keys }) < 0.8, 'never opened');
  assert.ok(lift({ id: 'nba:99', keys: b.keys }) > 1.2, 'opened half the time');
  assert.equal(lift({ id: 'mlb:1', keys: ['league:mlb'] }), 1, 'nothing known');
  const sc = F.scorer('x', now);
  assert.ok(sc({ keys: ['league:epl'] }) < 0 && sc({ keys: ['league:nba'] }) > 0);
  // The scoreboard: lists on screen, the share one was opened from, and its first.
  const r = F.hitRate('x', now);
  // (Counted as they fade: fourteen lists over two weeks are about twelve now.)
  assert.ok(r.shown >= 11 && r.shown <= 14 && r.picked >= 5 && r.picked <= 7, JSON.stringify(r));
  assert.ok(r.rate > 0.4 && r.rate < 0.6 && r.top === 0, JSON.stringify(r));
});

test('a list drawn again within hours counts once', () => {
  F.useStore(mem());
  for (let i = 0; i < 10; i++) F.shown('y', [{ id: 'a', keys: ['k'] }], T0 + i * 60_000);
  assert.equal(F.hitRate('y', T0).shown, 1);
  F.shown('y', [{ id: 'a', keys: ['k'] }], T0 + 7 * 3_600_000);
  assert.equal(F.hitRate('y', T0 + 7 * 3_600_000).shown, 2);
});

test('passed over far down a list counts less than at its top (seldom looked at)', () => {
  F.useStore(mem());
  for (let d = 0; d < 10; d++) {
    const list = [{ id: `top${d}`, keys: ['k:top'] }, ...Array.from({ length: 6 }, (_, i) => ({ id: `f${d}:${i}`, keys: [`k:mid${i}`] })), { id: `low${d}`, keys: ['k:low'] }];
    F.shown('pos', list, T0 + d * DAY);
  }
  const sc = F.scorer('pos', T0 + 11 * DAY);
  assert.ok(sc({ keys: ['k:top'] }) < sc({ keys: ['k:low'] }) - 0.2);
  assert.ok(F.looked(0) === 1 && F.looked(7) < 0.4);
});

test('opened elsewhere says what they like, once in a few hours, and never counts as a hit for the list', () => {
  F.useStore(mem());
  const item = { id: 'law:1', keys: ['topic:labor'] };
  for (let i = 0; i < 5; i++) F.picked('el', item, T0 + i * 60_000, { from: 'elsewhere' });
  const once = F.scorer('el', T0 + DAY)({ keys: ['topic:labor'] });
  assert.ok(once > 0.3);
  F.useStore(mem());
  F.picked('el2', item, T0, { from: 'elsewhere' });
  assert.equal(F.scorer('el2', T0 + DAY)({ keys: ['topic:labor'] }), once);
  assert.equal(F.hitRate('el2', T0 + DAY).picked, 0);
  // Shown, then opened from the list, then again: one open.
  F.useStore(mem());
  F.shown('el3', [item], T0);
  F.picked('el3', item, T0 + 60_000, { from: 'list' });
  const after = F.scorer('el3', T0 + 120_000)({ keys: ['topic:labor'] });
  F.picked('el3', item, T0 + 180_000, { from: 'list' });
  F.picked('el3', item, T0 + 240_000, { from: 'elsewhere' });
  assert.equal(F.scorer('el3', T0 + 300_000)({ keys: ['topic:labor'] }), after);
  assert.deepEqual([F.hitRate('el3', T0 + DAY).picked, F.hitRate('el3', T0 + DAY).top], [1, 1]);
});

test('heard through on a radio (taken from a list never noted) counts each time; skipped sinks at once', () => {
  F.useStore(mem());
  const g = { id: 'style:jazz' };
  F.picked('radio', g, T0, { from: 'list' });
  const one = F.scorer('radio', T0 + 1000)(g);
  F.picked('radio', g, T0 + 240_000, { from: 'list' });
  assert.ok(F.scorer('radio', T0 + 241_000)(g) > one);
  const h = { id: 'style:metal' };
  F.passed('radio', h, T0);
  F.passed('radio', h, T0 + 240_000);
  assert.ok(F.scorer('radio', T0 + 241_000)(h) < -0.2);
  // At its likely least: a groove heard once is under one heard often, however lucky.
  const sure = F.scorer('radio', T0 + 241_000, { sure: 1 });
  assert.ok(sure({ id: 'style:new' }) < 0 && sure(g) > sure({ id: 'style:new' }));
});

test('an act (a follow, a ♡, a trade) raises a new pick of the same keys', () => {
  F.useStore(mem());
  F.did('act', ['sector:semis', 'mkt:US'], 2, T0);
  const sc = F.scorer('act', T0 + DAY);
  assert.ok(sc({ id: 'stock:NVDA', keys: ['sector:semis', 'mkt:US'] }) > 0.5);
  assert.equal(sc({ id: 'stock:XOM', keys: ['sector:energy'] }), 0);
});

test('a 常看 only on enough of their own doing: a few lucky opens are no habit', () => {
  F.useStore(mem());
  const team = d => ({ id: `g${d}`, keys: ['team:mia', 'league:mls'] });
  F.shown('why', [team(0)], T0);
  F.picked('why', team(0), T0 + 1000);
  const opts = { min: 1, evidence: k => (k.startsWith('team:') ? 1.5 : Infinity) };
  assert.equal(F.whyOf('why', T0 + DAY, opts)(team(9)), null);
  for (let d = 1; d < 20; d++) {
    F.shown('why', [team(d), { id: `o${d}`, keys: ['team:atl', 'league:mls'] }], T0 + d * DAY);
    F.picked('why', team(d), T0 + d * DAY + 1000);
  }
  const why = F.whyOf('why', T0 + 21 * DAY, opts);
  assert.equal(why(team(99)), 'team:mia');
  assert.equal(why({ id: 'x', keys: ['team:atl', 'league:mls'] }), null);
});

test('what was learnt fades with a month\'s half-life', () => {
  F.useStore(mem());
  F.did('fade', ['k'], 2, T0);
  const now = F.scorer('fade', T0)({ keys: ['k'] });
  const later = F.scorer('fade', T0 + 30 * DAY)({ keys: ['k'] });
  assert.ok(Math.abs(later - now / 2) < 0.01, `${now} ${later}`);
});

test("the first engine's counts on a phone are read as weights", () => {
  const s = mem();
  s.setItem('orbit.fb.old', JSON.stringify({ _: { s: 40, p: 10, t: T0 }, 'league:epl': { s: 20, p: 0, t: T0 }, 'league:nba': { s: 20, p: 10, t: T0 } }));
  F.useStore(s);
  const sc = F.scorer('old', T0 + DAY);
  assert.ok(sc({ keys: ['league:epl'] }) < -0.5 && sc({ keys: ['league:nba'] }) > 0.3);
});

test('kept on the Pass: a patch only when something moved, at most every 15 minutes; another phone\'s stronger weights merged, never weaker', () => {
  F.useStore(mem());
  assert.equal(F.syncDue('sync', T0), null, 'nothing learnt');
  F.did('sync', ['a', 'b'], 1, T0);
  const patch = F.syncDue('sync', T0);
  const v = patch.settings['fb:sync'].value;
  assert.ok(v.k.a && v.k.b && v.t === T0 && JSON.stringify(patch.settings['fb:sync']).length < 4000);
  assert.equal(F.syncDue('sync', T0 + 60_000), null, 'too soon');
  assert.equal(F.syncDue('sync', T0 + 16 * 60_000), null, 'nothing new');
  F.did('sync', ['c'], 1, T0 + 17 * 60_000);
  assert.ok(F.syncDue('sync', T0 + 17 * 60_000));
  // Many keys: the strongest, under the Pass's size for a setting.
  for (let i = 0; i < 80; i++) F.did('sync', [`team:soccer/a-long-league-name.${i}:a club with a long name ${i}`], 1 + i / 10, T0 + DAY);
  const big = F.syncValue('sync', T0 + DAY);
  assert.ok(Object.keys(big.k).length <= 40 && JSON.stringify({ value: big, t: T0 }).length < 4000);
  // A new phone: starts where the other is.
  F.useStore(mem());
  const wallet = { settings: { 'fb:sync': { value: v, t: T0 } } };
  assert.equal(F.useWallet('sync', wallet, T0 + 1000), true);
  assert.ok(F.scorer('sync', T0 + 1000)({ keys: ['a'] }) > 0.3);
  // Its own stronger copy stays.
  F.did('sync', ['a'], 5, T0 + 2000);
  const mine = F.scorer('sync', T0 + 3000)({ keys: ['a'] });
  F.useWallet('sync', wallet, T0 + 3000);
  assert.equal(F.scorer('sync', T0 + 3000)({ keys: ['a'] }), mine);
});

test('keep(q, app): the Pass\'s copy merged as the wallet comes; this phone\'s written soon after a pick', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: T0 });
  F.useStore(mem());
  const writes = [];
  const handlers = {};
  const other = { k: { 'team:x': [1.2, 3] }, b: [-1.4, 2], h: [3, 1, 1], t: T0 - 1000 };
  const q = { wallet: { settings: { 'fb:kq': { value: other, t: T0 - 1000 } } }, on: (n, fn) => (handlers[n] = fn), write: w => (writes.push(w), Promise.resolve({})) };
  F.keep(q, 'kq');
  assert.ok(F.scorer('kq', T0)({ keys: ['team:x'] }) > 1);
  F.picked('kq', { id: 'g1', keys: ['team:y'] }, T0, { from: 'elsewhere' });
  assert.equal(writes.length, 0);
  t.mock.timers.tick(4000);
  assert.equal(writes.length, 1);
  assert.ok(writes[0].wallet.settings['fb:kq'].value.k['team:y']);
  // Another phone's wallet arriving later is merged too.
  handlers.wallet({ settings: { 'fb:kq': { value: { k: { 'team:z': [2, 4] }, t: T0 } , t: T0 } } });
  assert.ok(F.scorer('kq', T0 + 5000)({ keys: ['team:z'] }) > 1.5);
});

test('chance: of a pick shown alone, how likely it is taken (0.2 with nothing known), the person\'s usual moved by its keys', () => {
  F.useStore(mem());
  assert.equal(F.chance('ch', T0)({ keys: ['to:home'] }), 0.2);
  for (let d = 0; d < 10; d++) {
    F.shown('ch', [{ id: `home:${d}`, keys: ['to:home'] }, { id: `gym:${d}`, keys: ['to:gym'] }], T0 + d * DAY);
    F.picked('ch', { id: `gym:${d}`, keys: ['to:gym'] }, T0 + d * DAY + 60_000, { from: 'elsewhere' });
  }
  const c = F.chance('ch', T0 + 11 * DAY);
  // (The person's usual rose with every gym: a new place starts there.)
  assert.ok(c({ keys: ['to:home'] }) < 0.2 && c({ keys: ['to:home'] }) < c({ keys: ['to:new'] }), 'never gone to');
  assert.ok(c({ keys: ['to:gym'] }) > 0.6, 'gone to each time');
});
