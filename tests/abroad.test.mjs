// Outside Taiwan (Jay 2026-11-06: "make sure international user work" and
// "block international user from using Taiwan only service outright"): the
// Orbit language for other phones, the phone's own day, the country kept, and
// Transit closed abroad (the kit's card, the proxy's TW_ONLY).
import test from 'node:test';
import assert from 'node:assert/strict';
import { abroad as callerAbroad, twOnlyRefused, TW_ONLY_PATH } from '../http.js';
import { localDay, twDay } from '../kit/format.mjs';

const storage = map => ({ getItem: k => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: k => map.delete(k), key: i => [...map.keys()][i] ?? null, get length() { return map.size; } });
const store = new Map();
globalThis.localStorage = storage(store);
globalThis.sessionStorage = storage(new Map());
const kit = await import('../kit/orbit.mjs');

const withLangs = (langs, fn) => {
  const was = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', { value: { languages: langs, language: langs[0] }, configurable: true });
  try {
    return fn();
  } finally {
    if (was) Object.defineProperty(globalThis, 'navigator', was);
    else delete globalThis.navigator;
  }
};

test('the language: Chinese for any Chinese phone, English for every other one', () => {
  store.delete('orbit.lang');
  assert.equal(withLangs(['zh-TW'], kit.detectLang), 'zh');
  assert.equal(withLangs(['en-US', 'zh-TW'], kit.detectLang), 'zh');
  assert.equal(withLangs(['zh-CN'], kit.detectLang), 'zh');
  assert.equal(withLangs(['en-GB'], kit.detectLang), 'en');
  assert.equal(withLangs(['ja-JP'], kit.detectLang), 'en', 'a Japanese phone opens in English, not Chinese');
  assert.equal(withLangs(['es-ES', 'fr-FR'], kit.detectLang), 'en');
  assert.equal(withLangs([], kit.detectLang), 'zh', 'a phone that says nothing: as before');
  store.set('orbit.lang', 'zh');
  assert.equal(withLangs(['ja-JP'], kit.detectLang), 'zh', 'a choice made stays');
  store.delete('orbit.lang');
});

test("the phone's own day, wherever it is; Taiwan's stays Taiwan's", () => {
  const was = process.env.TZ;
  try {
    const t = Date.parse('2026-11-05T20:00:00-08:00');
    process.env.TZ = 'America/Los_Angeles';
    assert.equal(localDay(t), '2026-11-05');
    assert.equal(twDay(t), '2026-11-06');
    process.env.TZ = 'Asia/Taipei';
    assert.equal(localDay(t), '2026-11-06');
    assert.equal(localDay('2026-01-02'), '2026-01-02');
    assert.equal(localDay('nonsense'), '');
  } finally {
    process.env.TZ = was;
  }
});

test('abroad: by the country of the last session; unknown is never abroad', () => {
  store.delete('orbit.country');
  assert.equal(kit.abroad(), false, 'nothing known: in');
  for (const [c, away] of [['TW', false], ['XX', false], ['T1', false], ['US', true], ['JP', true]]) {
    store.set('orbit.country', c);
    assert.equal(kit.abroad(), away, c);
  }
  store.set('orbit.country', 'US');
  assert.equal(kit.twOnlyCheck('transit'), true, 'Transit is closed abroad');
  assert.equal(kit.twOnlyCheck('law'), false, 'Law stays open: foreigners study Taiwan law in it');
  assert.equal(kit.twOnlyCheck('weather'), false);
  store.set('orbit.country', 'TW');
  assert.equal(kit.twOnlyCheck('transit'), false);
  store.delete('orbit.country');
});

test('the proxy turns Transit away abroad, never the dev door, the showcase or an unknown place', () => {
  const req = country => ({ cf: country ? { country } : undefined });
  assert.equal(callerAbroad(req('US')), true);
  for (const c of ['TW', 'XX', 'T1', null]) assert.equal(callerAbroad(req(c)), false, String(c));
  const show = new Set(['https://jaypengx.com']);
  const page = 'https://orbit.jaypengx.com';
  assert.equal(twOnlyRefused(req('US'), '/transit/route', page, show), true);
  assert.equal(twOnlyRefused(req('US'), '/transit', page, show), true);
  assert.equal(twOnlyRefused(req('TW'), '/transit/route', page, show), false);
  assert.equal(twOnlyRefused(req('US'), '/transit/route', 'http://localhost:8123', show), false, 'the dev door: previews and shots');
  assert.equal(twOnlyRefused(req('US'), '/transit/route', 'https://jaypengx.com', show), false, "the showcase's demo");
  for (const path of ['/law-chat', '/law-ask', '/law-page', '/law-live', '/weather', '/sports-proxy', '/eco', '/transitx']) assert.equal(twOnlyRefused(req('US'), path, page, show), false, path);
  assert.ok(TW_ONLY_PATH.test('/transit/tdx'));
});

// Someone in Taiwan on a VPN abroad (Jay 2026-11-06): the address says US,
// the phone's clock says Taiwan, so they're in. A phone abroad takes the
// place's zone by itself; location permission plays no part.
test("a VPN abroad from Taiwan: the phone's Taiwan clock keeps it in", () => {
  const was = process.env.TZ;
  try {
    store.set('orbit.country', 'US');
    process.env.TZ = 'Asia/Taipei';
    assert.equal(kit.phoneZone(), 'Asia/Taipei');
    assert.equal(kit.abroad(), false);
    assert.equal(kit.twOnlyCheck('transit'), false);
    process.env.TZ = 'America/New_York';
    assert.equal(kit.abroad(), true);
  } finally {
    process.env.TZ = was;
    store.delete('orbit.country');
  }
  const page = 'https://orbit.jaypengx.com';
  const req = (country, tz) => ({ cf: { country }, url: `https://api.jaypengx.com/transit/route?qt=x${tz ? `&tz=${encodeURIComponent(tz)}` : ''}` });
  assert.equal(twOnlyRefused(req('US', 'Asia/Taipei'), '/transit/route', page), false, 'a Taiwan clock on a US address');
  assert.equal(twOnlyRefused(req('US', 'America/New_York'), '/transit/route', page), true);
  assert.equal(twOnlyRefused(req('US'), '/transit/route', page), true, 'an older Transit, no zone');
});

// Transit in the US behind a Taiwan clock (Jay 2026-11-06): the phone's own
// fix decides, over the clock and the address, for 6 hours; never half working.
test("the phone's own fix wins: out of Taiwan closes, in Taiwan opens", () => {
  const was = process.env.TZ;
  const now = Date.now();
  try {
    process.env.TZ = 'Asia/Taipei';
    store.set('orbit.country', 'US');
    assert.equal(kit.abroad(), false, 'a Taiwan clock alone: in');
    kit.notePlace(false, now);
    assert.equal(kit.abroad(), true, 'a fix in the US: out, whatever the clock');
    assert.equal(kit.twOnlyCheck('transit'), true);
    process.env.TZ = 'America/New_York';
    kit.notePlace(true, now);
    assert.equal(kit.abroad(), false, 'a fix in Taiwan: in, whatever the address and clock');
    kit.notePlace(false, now - 7 * 3_600_000);
    assert.equal(kit.placeSeen(), null, 'an old fix says nothing');
    assert.equal(kit.abroad(), true);
  } finally {
    process.env.TZ = was;
    store.delete('orbit.country');
    store.delete('orbit.where');
  }
  const req = q => ({ cf: { country: 'US' }, url: `https://api.jaypengx.com/transit/route?qt=x${q}` });
  assert.equal(twOnlyRefused(req('&tw=1'), '/transit/route', 'https://orbit.jaypengx.com'), false, "a fix in Taiwan on a roaming address");
  assert.equal(twOnlyRefused(req(''), '/transit/route', 'https://orbit.jaypengx.com'), true);
});
