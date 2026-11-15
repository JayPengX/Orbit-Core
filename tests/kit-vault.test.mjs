// The vault (kit/vault.mjs): each app's data locked on the phone, the key locked by the pass.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeVault, openVault, relock, seal, unseal, isLocked, vaultOf, cleanPass, heldKey, holdKey, forgetKeys } from '../kit/vault.mjs';

const R = 1000; // (fewer rounds in tests: the count is the vault's own, read back from it)

test('vault: the pass opens it, another pass doesn’t; a new pass locks the same key', async () => {
  const { key, vault } = await makeVault('ABCD-EFGH-JK', { rounds: R });
  assert.equal(vault.rounds, R);
  assert.ok(vault.id && vault.salt && vault.iv && vault.pass);
  assert.ok(!JSON.stringify(vault).includes('ABCDEFGHJK'));
  const k = await openVault(vault, 'abcd efgh jk');
  assert.ok(k, 'the pass as typed: spaces and case don’t matter');
  assert.equal(await openVault(vault, 'ABCDEFGHJX'), null);
  const sealed = await seal(key, vault.id, '{"books":[1,2,3]}');
  assert.ok(isLocked(sealed));
  assert.equal(vaultOf(sealed), vault.id);
  assert.ok(!sealed.includes('books'));
  assert.equal(await unseal(k, sealed), '{"books":[1,2,3]}');
  const moved = await relock(k, vault, 'NEWPASS234');
  assert.equal(moved.id, vault.id);
  assert.equal(await openVault(moved, 'ABCDEFGHJK'), null, 'the old pass no longer opens it');
  assert.equal(await unseal(await openVault(moved, 'NEWPASS234'), sealed), '{"books":[1,2,3]}', 'what it locked before still opens');
  assert.equal(cleanPass(' ab-cd '), 'ABCD');
});

test('vault: another key never opens it; each seal is different', async () => {
  const a = await makeVault('PASSAAAAAA', { rounds: R });
  const b = await makeVault('PASSBBBBBB', { rounds: R });
  const s1 = await seal(a.key, a.vault.id, 'x'.repeat(5000));
  const s2 = await seal(a.key, a.vault.id, 'x'.repeat(5000));
  assert.notEqual(s1, s2);
  assert.ok(s1.length < 400, 'gzip first: a long repeat stays short');
  assert.equal(await unseal(b.key, s1), null);
  assert.equal(isLocked('m1:abc'), false);
});

test('vault: a key held by its vault’s id, forgotten at sign-out', async () => {
  const { key, vault } = await makeVault('PASSCCCCCC', { rounds: R });
  await holdKey(vault.id, key);
  assert.equal(await heldKey(vault.id), key);
  await forgetKeys();
  assert.equal(await heldKey(vault.id), null);
});
