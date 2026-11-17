// The admin panel's 重設 and 復原 on an account whose data is locked (kit
// vault.mjs, every account since 11-15). Found 2026-11-17: both wrote a
// wallet without today's vault. The apps' data stayed, locked under a key
// the wallet no longer named: unreadable on every device, for good.
import test from 'node:test';
import assert from 'node:assert/strict';
import { wholeWorker } from './whole-worker.mjs';
import { ECO_APPS } from '../eco.js';

const VAULT = { v: 1, id: 'vaultAAAAAAA', rounds: 600000, salt: 'c2FsdHNhbHRzYWx0c2FsdA', iv: 'aXZpdml2aXZpdml2', pass: 'd3JhcHBlZGtleXdyYXBwZWRrZXl3cmFwcGVka2V5d3JhcHBlZGtleQ', sealed: 1 };
const withVault = async (t, id) => {
  const w = JSON.parse(await t.doc('eco-wallets', id));
  await t.put('eco-wallets', id, JSON.stringify({ ...w, vault: VAULT }));
};

test('重設 with apps kept: the vault stays, so the kept apps\' locked data still opens', async () => {
  const t = wholeWorker();
  const a = await t.account('vocab');
  await withVault(t, a.id);
  const back = await t.eco({ op: 'refresh', refresh: a.refresh, app: 'vocab', claim: true });
  assert.equal((await t.eco({ op: 'write', qt: back.data.token, payload: `e1:${VAULT.id}:aXY:bG9ja2Vk` }, 'vocab')).status, 200);
  const r = await t.admin('reset', { passcode: a.passcode, keep: ['vocab'] });
  assert.equal(r.status, 200);
  const after = JSON.parse(await t.doc('eco-wallets', a.id));
  assert.equal(after.vault?.id, VAULT.id);
  assert.equal(await t.doc(ECO_APPS.vocab.collection, a.id), `e1:${VAULT.id}:aXY:bG9ja2Vk`);
});

test('復原: a wallet put back keeps today\'s vault, passkeys, recovery email, level and AI allowance', async () => {
  const t = wholeWorker();
  const a = await t.account('money');
  const ref = a.id.slice(0, 8);
  // A version of the wallet from before: no vault, the level it had then.
  const { versions } = (await t.admin('versions', { wallet: ref })).data;
  const old = versions.find(v => v.app === 'wallet');
  assert.ok(old, 'a kept version of the wallet');
  // Since then: locked, a recovery email, made 基本 with its own allowance.
  await withVault(t, a.id);
  const w = JSON.parse(await t.doc('eco-wallets', a.id));
  await t.put('eco-wallets', a.id, JSON.stringify({ ...w, mail: { addr: 'me@example.com', t: 5 }, sec: { ...w.sec, level: 'free', ai: { n: 7, per: 'month', until: 0, at: 1 } } }));
  const r = await t.admin('restore', { wallet: ref, coll: 'eco-wallets', updated: old.updated });
  assert.equal(r.data.restored, true);
  const after = JSON.parse(await t.doc('eco-wallets', a.id));
  assert.equal(after.vault?.id, VAULT.id, 'the apps\' data is locked under this key');
  assert.equal(after.mail?.addr, 'me@example.com');
  assert.equal(after.sec.level, 'free');
  assert.equal(after.sec.ai.n, 7);
  assert.ok(after.sec.gen > w.sec.gen, 'every device signed out, so none sends its old copy back');
});
