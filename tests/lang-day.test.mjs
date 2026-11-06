// Phones anywhere (Jay 2026-11-06, no guard abroad): the Orbit language for
// phones without Chinese, and the phone's own day.
import test from 'node:test';
import assert from 'node:assert/strict';
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

