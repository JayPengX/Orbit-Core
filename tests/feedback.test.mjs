// The kit's feedback on recommendations (kit/feedback.mjs): passed-over picks sink, opened ones rise.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as F from '../kit/feedback.mjs';

const mem = () => {
  const m = new Map();
  return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)) };
};
const DAY = 86_400_000;

test('a pick shown day after day and never opened sinks; its league with it; one opened rises', () => {
  F.useStore(mem());
  const t0 = Date.UTC(2026, 9, 1);
  const a = { id: 'epl:1', keys: ['league:epl', 'team:epl:arsenal'] };
  const b = { id: 'nba:2', keys: ['league:nba', 'team:nba:lakers'] };
  for (let d = 0; d < 14; d++) {
    const now = t0 + d * DAY;
    F.shown('x', [{ ...a, id: `epl:${d}` }, { ...b, id: `nba:${d}` }], now);
    if (d % 2 === 0) F.picked('x', { ...b, id: `nba:${d}` }, now + 1000);
  }
  const now = t0 + 14 * DAY;
  const lift = F.lifter('x', now);
  assert.ok(lift({ id: 'epl:99', keys: a.keys }) < 0.8, 'never opened');
  assert.ok(lift({ id: 'nba:99', keys: b.keys }) > 1.2, 'opened half the time');
  assert.equal(lift({ id: 'mlb:1', keys: ['league:mlb'] }), 1, 'nothing known');
  const r = F.hitRate('x', now);
  assert.ok(r.shown >= 20 && r.picked >= 5 && r.rate > 0.2 && r.rate < 0.4, JSON.stringify(r));
});

test('a list drawn again within hours counts once', () => {
  F.useStore(mem());
  const now = Date.UTC(2026, 9, 1);
  for (let i = 0; i < 10; i++) F.shown('y', [{ id: 'a', keys: ['k'] }], now + i * 60_000);
  assert.equal(F.hitRate('y', now).shown, 1);
  F.shown('y', [{ id: 'a', keys: ['k'] }], now + 7 * 3_600_000);
  assert.equal(F.hitRate('y', now + 7 * 3_600_000).shown, 2);
});
