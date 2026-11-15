# Privacy: what Orbit can and can't read

The one home of how a person's data is kept from everyone but them (Jay
2026-11-15; RULEBOOK 11-15). What usage is counted: `kit/usage.mjs` and the
privacy policy. The code: `kit/vault.mjs` (its header), `kit/orbit.mjs`
(`makeSession`: `openReply`, `vaultPass`, `keyFor`, `keyWait`), `eco.js` (`ecoVault`, `ecoVaultEscrow`,
`overSealed`).

## Every account sealed (11-15, Jay: "it should apply now to everyone including existing data")

The Worker gives every account a data key (`vaultOfAccount`) and seals each
app's data in place but Securities' (`sealAccount`; the cron's `vault-sweep`
every 10 minutes, `sealSweep`, 25 accounts a run, marked `vault.sealed`). The
key is kept only as the recovery copy below, sealed by `ECO_TOKEN_SECRET`; a
signed-in device of the account takes it with `vault-key` (`fetchKey` in the
session) and opens its data with nothing to type. So: the database, its
backups and the admin page see only locked data; the Worker's code, holding
its secret, can open it, and gives it only to the account's own devices.
Older copies kept before 11-15 (D1 `history`, the nightly R2 copies) are
plain until they age out (history 30 days, nightly copies 14 nights and the
monthly ones a year).

## Locked on the phone


Since 2026-11-15 (Jay: "prevent from our cloud be able to read the detail";
"no way to lose data unless the pass is actually lost"; RULEBOOK 11-15) each
app's data is locked on the phone before it reaches the Pass, and the cloud
holds no key that opens it.

- **One data key an account** (AES-256-GCM), made on a phone. The Pass keeps
  it only locked: `wallet.vault` = `{ v: 1, id, rounds, salt, iv, pass }`, the
  key wrapped by a key made from the Orbit Pass (PBKDF2-SHA256, 600,000 rounds,
  a salt of its own: not the Pass's id, `passKey`, which is peppered and
  100,000 rounds). A wrong pass fails to unwrap (AES-GCM), so a pass is
  checked by trying it. About 0.1 s a try on a phone.
- **Held on each signed-in device** in IndexedDB `orbit-vault` by the vault's
  id (an account's id moves with a new pass; its vault doesn't). Signing out
  here forgets every key (`wipeDevice` → `forgetKeys`); signed out by the
  Pass (a new pass made elsewhere, the recovery email, 登出所有裝置) the keys
  stay (`keepKeys`), so signing in again with the new pass locks the same key
  by it (`relock`) and the data is back.
- **The session does it all** (`orbit.mjs` `makeSession`): every reply's
  `payload` opened as it comes (`openReply`, the session's `call`), every
  `q.write` sealed as it goes. Locked under a vault the account no longer has
  (a lost pass's): read as nothing. Locked and no key here: `q.locked`, the
  `locked` event, the payload passed on as it is (the app can't decode it, so
  `passSync` writes nothing) and `q.write` refuses (`ECO_PAYLOAD_LOCKED`).
- **The pass, when it's typed** (`vaultPass`): signing in with it opens the
  vault or, with none yet, makes it (`op: 'vault'`); a new account's makes it;
  `rotate` locks the same key again with the new pass (`relock`), and is
  refused on a device without the key (`ECO_VAULT_LOCKED`: it would leave the
  key under the old pass). Nothing is ever asked to read one's own data (Jay 11-15: a
  Pass page for it "should never exist"): a device without the key takes it
  from the Worker (`vault-key`), quietly again every minute and when the app
  comes back while it can't (`keyWait`); a vault a phone made before the
  Worker kept its copy gets that copy from the first device holding the key
  (`op: 'vault-escrow'`, taken only if the key opens the account's sealed
  data). Unlocked, every app of the device opens again
  with its data (`BroadcastChannel('orbit-vault')`, a reload).
- **The Worker** (`eco.js`): `op: 'vault'` stores it only with the account's
  own pass (`passAccount(passcode) === docId`: a stolen session can't lock the
  owner out, a mistyped pass is never what locks it) and replaces it only with
  itself locked again or, `fresh`, with a new one (a lost pass: what the old
  locked is gone). A write of an open copy over a locked one is refused
  (`overSealed`, `ECO_PAYLOAD_LOCKED`).
- **Recovery email, seamless** (Jay 11-15: "user feel no data locked or
  missing but … the data is still not readable server side"): the phone also
  gives the Worker the data key once (`op: 'vault'`, `key`), which it keeps
  only sealed by a key made from `ECO_TOKEN_SECRET` (HKDF; a Worker secret,
  never in the database): `vault.escrow`, shown to devices only as `true`
  (`publicVault`). A recovery email's code marks the account (`sec.recovered`,
  15 minutes); that session alone may take the key, once (`op: 'vault-key'`,
  `ecoVaultKey`), and its device locks it again by the new pass it makes next
  (`freshGate` → `rotate` → `relock`). So: the database, its backups, the
  admin page and anyone reading them can't open anyone's data; the Worker's
  code, holding its secret, could, and does only for a verified recovery.
  That is the one place it isn't strictly end to end, chosen on purpose.
- **Signed out by the Pass** (a new pass elsewhere, 登出所有裝置) a device
  keeps its key (`wipeDevice` `keepKeys`); signed out by the person, it
  forgets it. With no pass, no recovery email and no device: the sheet says
  the data stays locked and offers to start over (`fresh`).
- **Open on purpose**, because the Worker must read them: Securities
  (`PLAIN_APPS`: `stock-check.js` fills its orders), the wallet (pay, relief,
  levels), notices to send (`/push`), and a Class timetable shared
  (`share-create` takes the copy the phone sends). The admin page shows
  locked data as 🔒 (its 匯出 › 在這裡看 decodes the rest).
- **Not yet:** a passkey unlocking it (WebAuthn PRF), and a merge of two
  passes (`merge`) keeps only the target's locked data.
