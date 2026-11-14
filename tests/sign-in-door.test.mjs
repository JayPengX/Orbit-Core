// Orbit's sign-in (site/app) and the passkey nudge (kit orbit.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { KEY_TIP_EVERY, QUIET_TIP_FOR, signInScreen, quietTip } from '../kit/orbit.mjs';

const kit = readFileSync(new URL('../kit/orbit.mjs', import.meta.url), 'utf8');
const door = readFileSync(new URL('../site/app/index.html', import.meta.url), 'utf8');
const between = (text, a, b) => text.slice(text.indexOf(a), text.indexOf(b, text.indexOf(a)));

test("Orbit's 登入 is the sign-in itself, never the Pass's settings (Jay 2026-11-14)", () => {
  assert.equal(typeof signInScreen, 'function');
  const sign = between(door, 'function showSignIn(', '\n  }\n');
  assert.match(sign, /signInScreen\(session, \{ hero: orbitRing\(\)/);
  // (accountSheet only for an older kit without signInScreen.)
  assert.ok(sign.indexOf('if (signInScreen)') < sign.indexOf('accountSheet('));
  // No pass is made here (eco.js ecoCreate is closed): never offered.
  assert.doesNotMatch(door, /或建立一個新的/);
});

test('signed out, the Pass sheet opens the sign-in instead of settings that mean nothing yet', () => {
  const sheet = between(kit, 'export async function accountSheet(', '\n}\n');
  assert.match(sheet, /tab !== 'help' && !storedAccount\(\)\) return signInScreen\(s\)/);
});

test('the passkey nudge is a brief quiet banner, at most every 3 days, 不再顯示 for the account', () => {
  assert.equal(typeof quietTip, 'function');
  assert.ok(QUIET_TIP_FOR <= 5_000);
  assert.equal(KEY_TIP_EVERY, 3 * 86_400_000);
  const offer = between(kit, 'export async function passkeyOffer(', '\n}\n');
  assert.match(offer, /quietTip\(/);
  assert.doesNotMatch(offer, /await ask\(/);
  assert.match(offer, /passkeyAsk\?\.value === 'never'/);
  assert.match(offer, /settingPatch\('passkeyAsk', 'never'\)/);
  // (Its Safari challenge fetched before it shows: 加入 goes straight to the browser.)
  assert.ok(offer.indexOf('ch.get()') < offer.indexOf('quietTip('));
});
