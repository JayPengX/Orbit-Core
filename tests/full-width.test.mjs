// Full-width letters and digits (ＡＢ２３, １２３: what a 注音 keyboard types in its full-width mode) are the same
// code or amount as the plain ones (2026-11-17, from the cuts audit). They were taken out as "not a digit":
// the six-digit code mailed to sign in was never used, an amount typed was 0, the check of a new pass's last
// five never matched, and a right Orbit Pass was called wrong.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { cleanCode, PASS_PATTERN } from '../kit/orbit.mjs';
import { cleanPass } from '../kit/vault.mjs';
import { codeTyped } from '../kit/pass-mail.mjs';
import { stakeTyped } from '../kit/ui.mjs';
import { wholeWorker } from './whole-worker.mjs';

// (As a full-width keyboard types it.)
const wide = text => String(text).replace(/[!-~]/g, c => String.fromCharCode(c.charCodeAt(0) + 0xfee0));

test('the code mailed to sign in: its six digits, however they are typed', () => {
  assert.equal(codeTyped('１２３４５６'), '123456');
  assert.equal(codeTyped('１２３ ４５６'), '123456');
  assert.equal(codeTyped('12３4５6'), '123456');
  assert.equal(codeTyped('123-456 789'), '123456');
  assert.equal(codeTyped('一二三'), '');
  const kit = readFileSync(new URL('../kit/pass-mail.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(kit, /code\.value\.replace\(/, 'both reads of the field go through codeTyped');
});

test('an amount typed: full-width digits and point count', () => {
  assert.equal(stakeTyped('１２００'), '1200');
  assert.equal(stakeTyped('１，２００元'), '1200');
  assert.equal(stakeTyped('1200'), '1200');
  assert.equal(stakeTyped('０．５', 2), '0.5');
  assert.equal(stakeTyped('１２．３４５６', 2), '12.34');
  assert.equal(stakeTyped('0.', 2), '0.');
  assert.equal(stakeTyped('1.2.3', 4), '1.23');
});

test('an Orbit Pass typed full-width is the same pass: on the phone, for its data’s lock, and at the Worker', async () => {
  const pass = 'ABCDE-23456';
  assert.equal(cleanCode(wide(pass)), 'ABCDE23456');
  assert.equal(cleanCode('ａｂｃｄｅ　２３４５６'), 'ABCDE23456');
  assert.match(cleanCode(wide('abcde 23456')), PASS_PATTERN);
  assert.equal(cleanPass(wide(pass)), cleanPass(pass));
  assert.equal(cleanPass('abcde-23456'), 'ABCDE23456', 'a plain pass locks as it always did');
  // (The new pass's last five, checked before it is kept.)
  const kit = readFileSync(new URL('../kit/orbit.mjs', import.meta.url), 'utf8');
  assert.match(kit, /const tail = V\.cleanPass\(passcode\)\.slice\(-5\);/);
  assert.match(kit, /const typed = V\.cleanPass\(check\.value\);/);
  assert.equal(cleanPass(wide('x7k2m')), 'X7K2M');
  // The Worker (a phone on an older kit sends the pass as typed).
  const w = wholeWorker();
  const a = await w.account('weather');
  const plain = await w.eco({ op: 'login', passcode: a.passcode, app: 'weather' });
  assert.equal(plain.status, 200);
  const typed = await w.eco({ op: 'login', passcode: wide(a.passcode), app: 'weather' });
  assert.equal(typed.status, 200);
  assert.equal(await w.idOf(typed.data.token), a.id);
});
