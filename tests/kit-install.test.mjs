// The add-to-home-screen page: which steps each phone and browser gets.
import test from 'node:test';
import assert from 'node:assert/strict';
import { installWay, installSteps } from '../kit/orbit.mjs';

const IPHONE = v => `Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/${v} Mobile/15E148 Safari/604.1`;
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36';

test('installWay names the browser, its version and the app it opened inside', () => {
  assert.equal(installWay(IPHONE('18.0')).way, 'ios-safari');
  assert.equal(installWay(IPHONE('26.0')).way, 'ios-safari-26');
  assert.equal(installWay('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15', 5).way, 'ipad-safari');
  assert.equal(installWay('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15', 0).way, 'computer');
  assert.equal(installWay(IPHONE('18.0').replace('Version/18.0', 'CriOS/130.0')).way, 'ios-chrome');
  assert.equal(installWay(IPHONE('18.0').replace('Version/18.0', 'FxiOS/130.0')).way, 'ios-other');
  assert.deepEqual(installWay(`${IPHONE('18.0')} Line/14.0.0`), { way: 'line', app: 'LINE' });
  assert.deepEqual(installWay('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 300.0'), { way: 'inapp-ios', app: 'Instagram' });
  assert.equal(installWay(`${ANDROID} MicroMessenger/8.0`).app, 'WeChat');
  assert.equal(installWay(ANDROID.replace('Pixel 8)', 'Pixel 8; wv)')).way, 'inapp-android');
  assert.equal(installWay(ANDROID).way, 'android-chrome');
  assert.equal(installWay(ANDROID.replace('Chrome/', 'SamsungBrowser/26.0 Chrome/')).way, 'samsung');
  assert.equal(installWay('Mozilla/5.0 (Android 14; Mobile; rv:130.0) Gecko/130.0 Firefox/130.0').way, 'android-other');
});

test('every way has steps in both languages, the same count, and only buttons it can draw', () => {
  const ways = ['ios-safari', 'ios-safari-26', 'ipad-safari', 'ios-chrome', 'ios-other', 'line', 'inapp-ios', 'inapp-android', 'samsung', 'android-other', 'android-chrome'];
  for (const way of ways) {
    const zh = installSteps({ way, v26: way === 'ios-safari-26' }, 'Orbit Weather', false);
    const en = installSteps({ way, v26: way === 'ios-safari-26' }, 'Orbit Weather', true);
    assert.equal(zh.steps.length, en.steps.length, way);
    assert.ok(zh.steps.length >= 3, way);
    for (const t of [...zh.steps, ...en.steps]) for (const [, g] of t.matchAll(/\{(\w+)\}/g)) assert.ok(['share', 'add', 'dots', 'kebab', 'menu'].includes(g), `${way}: ${g}`);
    assert.ok(!/[一-鿿]/.test(en.steps.join('') + (en.lede || '')), `${way} English has no Chinese`);
  }
  // Chrome's "Add to home screen" offers a shortcut, which opens the browser again.
  assert.match(installSteps({ way: 'android-chrome' }, 'X', false).steps.join(''), /不要選「建立捷徑」/);
  // Safari 26: the add sheet's Open as Web App switch.
  assert.match(installSteps({ way: 'ios-safari-26', v26: true }, 'X', true).steps.join(''), /Open as Web App/);
});
