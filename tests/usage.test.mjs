// Usage counts (kit/usage.mjs → usage.js): nothing about a person gets in.
import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanBeacon, errSig, loadBucket, weekOf } from '../kit/usage.mjs';
import { takeUsage, _pending, _reset } from '../usage.js';

const NOW = Date.parse('2026-11-14T09:00:00Z'); // Saturday, Taiwan 17:00

test('a beacon keeps only what the shapes allow', () => {
  assert.equal(cleanBeacon(null), null);
  assert.equal(cleanBeacon({ v: 1, app: 'evil' }), null);
  const b = cleanBeacon({
    v: 1,
    app: 'money',
    open: 1,
    day: [1, 1],
    dims: { dev: 'phone', os: 'ios', where: 'mars', who: 'jay' },
    tabs: { today: 3, 'qh=SECRETPASS1': 1, 'stock=2330': 2 },
    step: { 'pass:signin-ok': 1, 'free text here': 1 },
    sec: 99999999,
    pass: 'ABCDEFGHJK',
    acct: 'f00dfeed'
  });
  assert.deepEqual(b.dims, { dev: 'phone', os: 'ios' });
  assert.deepEqual(b.tabs, { today: 3 });
  assert.deepEqual(b.step, { 'pass:signin-ok': 1 });
  assert.equal(b.sec, 6 * 3600);
  assert.equal('pass' in b || 'acct' in b, false);
});

test('an error is said without what a person typed', () => {
  const s = errSig('Cannot read "王小明的帳戶" of 12345 at https://orbit.jaypengx.com/money/#qh=ABC a@b.co deadbeefdeadbeef', 'https://x/y/app.js?v=9', 42);
  assert.doesNotMatch(s, /王小明|12345|https|qh=|a@b|deadbeef/);
  assert.match(s, /@app\.js:42$/);
});

test('beacons add up per Taiwan day, app and any app; retention by cohort week', () => {
  _reset();
  for (let i = 0; i < 3; i++) takeUsage({ v: 1, app: 'transit', open: 1, day: [1, i === 0 ? 1 : 0], week: [1, 1], dims: { dev: 'phone' }, coh: '2026-11-02', tabs: { map: 2 }, load: 1200 }, NOW);
  const p = Object.fromEntries(_pending());
  assert.equal(p['2026-11-14|transit|day|'], 3);
  assert.equal(p['2026-11-14|*|day|'], 1);
  assert.equal(p['2026-11-14|transit|tab|map'], 6);
  assert.equal(p['2026-11-14|transit|dim|dev:phone'], 3);
  assert.equal(p[`2026-11-14|transit|load|${loadBucket(1200)}`], 3);
  assert.equal(p[`${weekOf('2026-11-14')}|*|ret|2026-11-02`], 3);
  assert.equal(weekOf('2026-11-14'), '2026-11-09');
  _reset();
});
