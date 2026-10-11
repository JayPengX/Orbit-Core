import test from 'node:test';
import assert from 'node:assert/strict';
import { sidesOf, addSides, retire, LEDGER } from '../money.js';

const wallet = {
  entries: [
    { id: 'eco:start', app: 'eco', kind: 'start', amount: 30000 },
    { id: 'eco:pay:2026-10', app: 'eco', kind: 'pay', amount: 6000 },
    { id: 'eco:plus:2026-10', app: 'eco', kind: 'plus', amount: -490 },
    { id: 'odds:stake-a', app: 'odds', kind: 'stake', amount: -1000 },
    { id: 'odds:payout-a', app: 'odds', kind: 'payout', amount: 400 },
    { id: 'odds:stake-b', app: 'odds', kind: 'stake', amount: -200 }
  ],
  snap: { stock: { cash: -10000, holdings: 12500, pl: { TW: 2000, US: 300 } }, odds: { open: 200, n: 1, pl: { nba: -600 } } }
};

test('sidesOf: the three sides add up to the worth', () => {
  const s = sidesOf(wallet);
  assert.equal(s.given, 36000);
  assert.equal(s.quadra, 490 + 600);
  assert.equal(s.atStake, 200);
  // pool 24710 + holdings 12500 + at stake 200
  assert.equal(s.worth, 37410);
  assert.equal(s.worth, s.given - s.quadra + s.own);
  assert.deepEqual(s.playBy, { nba: 600 });
  assert.deepEqual(s.stockBy, { TW: 2000, US: 300 });
});

test('addSides sums nested maps', () => {
  assert.deepEqual(addSides({ a: 1, m: { x: 1 } }, { a: 2, m: { x: 1, y: 3 } }), { a: 3, m: { x: 2, y: 3 } });
});

test('retire adds a deleted account to the ledger', async () => {
  const store = {};
  const deps = {
    now: () => 5,
    fsGet: async (env, c, id) => (store[`${c}/${id}`] ? { exists: true, updateTime: 't', payload: store[`${c}/${id}`] } : { exists: false }),
    fsWrite: async (env, c, id, payload) => {
      store[`${c}/${id}`] = payload;
    }
  };
  await retire({}, deps, wallet);
  await retire({}, deps, wallet);
  const led = JSON.parse(store[LEDGER.join('/')]);
  assert.equal(led.accounts, 2);
  assert.equal(led.worth, 2 * 37410);
  assert.deepEqual(led.playBy, { nba: 1200 });
});

test("sidesOf agrees with the Pass's 真相 (kit moneySides), Quadra from the house's side", async () => {
  const { moneySides } = await import('../kit/quadra.mjs');
  const k = moneySides(wallet);
  const s = sidesOf(wallet);
  assert.equal(s.given, Math.round(k.given));
  assert.equal(s.worth, Math.round(k.worth));
  assert.equal(s.quadra, Math.round(-k.quadra));
  assert.equal(s.own, Math.round(k.own));
  assert.equal(s.atStake, Math.round(k.atStake));
});
