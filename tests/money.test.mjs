import test from 'node:test';
import assert from 'node:assert/strict';
import { sidesOf, addSides, retire, LEDGER } from '../money.js';

const wallet = {
  entries: [
    { id: 'eco:start', app: 'eco', kind: 'start', amount: 30000 },
    { id: 'eco:pay:2026-10', app: 'eco', kind: 'pay', amount: 6000 },
    { id: 'eco:od:2026-10', app: 'eco', kind: 'od', amount: -490 }
  ],
  snap: { stock: { cash: -10000, holdings: 12500, pl: { TW: 2000, US: 300 } } }
};

test('sidesOf: the sides add up to the worth', () => {
  const s = sidesOf(wallet);
  assert.equal(s.given, 36000);
  assert.equal(s.orbit, 490);
  // pool 25510 + holdings 12500
  assert.equal(s.worth, 38010);
  assert.equal(s.worth, s.given - s.orbit + s.own);
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
  assert.equal(led.worth, 2 * 38010);
  assert.deepEqual(led.stockBy, { TW: 4000, US: 600 });
});

test("sidesOf agrees with Securities' 真相 (kit moneySides), Orbit from the house's side", async () => {
  const { moneySides } = await import('../kit/orbit.mjs');
  const k = moneySides(wallet);
  const s = sidesOf(wallet);
  assert.equal(s.given, Math.round(k.given));
  assert.equal(s.worth, Math.round(k.worth));
  assert.equal(s.orbit, Math.round(k.fees));
  assert.equal(s.own, Math.round(k.own));
});

test('sidesOf: the government, as Securities counts it, added up with the rest', async () => {
  const { moneySides } = await import('../kit/orbit.mjs');
  const w = { ...wallet, entries: [...wallet.entries, { id: 'eco:relief:2026-11-02', t: 1, app: 'eco', kind: 'relief', amount: 5_000 }], snap: { ...wallet.snap, stock: { ...(wallet.snap?.stock || {}), gov: { trade: 300, withheld: 0, nhi: 21 } } } };
  const k = moneySides(w);
  const s = sidesOf(w);
  assert.deepEqual(s.gov, k.gov);
  assert.deepEqual([s.gov.paidTotal, s.gov.gotTotal, s.gov.net], [321, 5_000, 4_679]);
  assert.equal(s.orbit, Math.round(k.fees));
  assert.equal(s.own, Math.round(k.own));
  assert.equal(s.given - s.orbit + s.gov.net + s.own, s.worth);
  // Added up across accounts like any side.
  assert.equal(addSides(sidesOf(w), sidesOf(w)).gov.paid.trade, 600);
});
