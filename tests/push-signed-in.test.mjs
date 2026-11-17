// A device is sent an account's notices only while that account is signed in on it (2026-11-17). Its
// endpoint stayed on the account's lists after it signed out, was signed out by the Pass (登出其他所有裝置,
// a new pass, the admin's 登出) or signed in as someone else: a phone lost or handed on went on showing
// the account's notices, and one signed in as someone else showed both people's.
// And a notice the push service faltered on is tried again, not lost.
import test from 'node:test';
import assert from 'node:assert/strict';
import { wholeWorker } from './whole-worker.mjs';
import { sendDue } from '../push.js';

const keys = { p256dh: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4', auth: 'BTBZMqHH6r4Tts7J_aSIgg' };
const PHONE = 'https://web.push.apple.com/phone-1';
const MAC = 'https://fcm.googleapis.com/fcm/send/mac-1';

// A Worker, and what its push lists hold: { '<account>:<app>': [endpoints] }.
function world() {
  const w = wholeWorker();
  const lists = async () => {
    const { results } = await w.sql("SELECT key, value FROM push_kv WHERE key LIKE 'push:%' AND key NOT LIKE 'push:prefs:%' AND key <> 'push:vapid'").all();
    return Object.fromEntries(results.map(r => [r.key.slice(5), (JSON.parse(r.value).subs || []).map(x => x.endpoint)]));
  };
  // (A session in `app` for the account with this pass.)
  const session = async (passcode, app) => (await w.eco({ op: 'login', passcode, app })).data.token;
  const subscribe = (token, endpoint, dev) => w.send(`/push/subscribe?qt=${token}`, 'POST', { sub: { endpoint, keys }, dev, lang: 'zh' });
  const schedule = (token, items) => w.send(`/push/schedule?qt=${token}`, 'POST', { items });
  return { ...w, lists, session, subscribe, schedule };
}

test('signed in as someone else, a device leaves the first account’s lists', async () => {
  const w = world();
  const a = await w.account('weather');
  const b = await w.account('weather');
  assert.equal((await w.subscribe(a.token, PHONE, 'iPhone')).status, 200);
  assert.equal((await w.subscribe(a.token, MAC, 'Mac')).status, 200);
  const aOther = await w.session(a.passcode, 'orbit');
  await w.subscribe(aOther, PHONE, 'iPhone');
  assert.deepEqual(await w.lists(), { [`${a.id}:weather`]: [MAC, PHONE], [`${a.id}:orbit`]: [PHONE] });
  // The phone is handed on: B signs in on it (A never signed out there, or did offline).
  assert.equal((await w.subscribe(b.token, PHONE, 'iPhone')).status, 200);
  assert.deepEqual(await w.lists(), { [`${a.id}:weather`]: [MAC], [`${b.id}:weather`]: [PHONE] }, 'the phone is B’s alone; A’s computer stays A’s');
  // (The same subscribe again, each day: nothing of anyone's changes.)
  await w.subscribe(b.token, PHONE, 'iPhone');
  assert.deepEqual(await w.lists(), { [`${a.id}:weather`]: [MAC], [`${b.id}:weather`]: [PHONE] });
});

test('signed out on a device (/push/forget): that device is sent nothing more, the others are', async () => {
  const w = world();
  const a = await w.account('weather');
  await w.subscribe(a.token, PHONE, 'iPhone');
  await w.subscribe(a.token, MAC, 'Mac');
  const aOther = await w.session(a.passcode, 'orbit');
  await w.subscribe(aOther, PHONE, 'iPhone');
  const out = await w.send(`/push/forget?qt=${a.token}`, 'POST', { endpoints: [PHONE] });
  assert.equal(out.status, 200);
  assert.equal(out.data.n, 2);
  assert.deepEqual(await w.lists(), { [`${a.id}:weather`]: [MAC] });
  // (No session: nothing is anyone's to drop.)
  assert.equal((await w.send('/push/forget?qt=nope', 'POST', { endpoints: [MAC] })).status, 401);
  assert.deepEqual(await w.lists(), { [`${a.id}:weather`]: [MAC] });
});

test('登出其他所有裝置: only the device that asked is sent the account’s notices', async () => {
  const w = world();
  const a = await w.account('weather');
  await w.subscribe(a.token, PHONE, 'iPhone');
  await w.subscribe(a.token, MAC, 'Mac');
  const aOther = await w.session(a.passcode, 'orbit');
  await w.subscribe(aOther, MAC, 'Mac');
  // (A kit from before: no `keep`, the lists as they were.)
  const old = await w.eco({ op: 'signout-all', qt: a.token });
  assert.equal(old.status, 200);
  assert.deepEqual(await w.lists(), { [`${a.id}:weather`]: [MAC, PHONE], [`${a.id}:orbit`]: [MAC] });
  // The phone asks, the lost computer is signed out.
  const out = await w.eco({ op: 'signout-all', qt: old.data.token, keep: [PHONE] });
  assert.equal(out.status, 200);
  assert.deepEqual(await w.lists(), { [`${a.id}:weather`]: [PHONE] });
});

test('更換通行碼: the new pass’s lists hold only the device that asked', async () => {
  const w = world();
  const a = await w.account('weather');
  await w.subscribe(a.token, PHONE, 'iPhone');
  await w.subscribe(a.token, MAC, 'Mac');
  await w.schedule(a.token, [{ at: Date.now() + 3_600_000, title: '明天有雨', tag: 'rain' }]);
  const next = await w.eco({ op: 'rotate', qt: a.token, keep: [PHONE] });
  assert.equal(next.status, 200);
  const id = await w.idOf(next.data.token);
  assert.notEqual(id, a.id);
  assert.deepEqual(await w.lists(), { [`${id}:weather`]: [PHONE] });
  const kept = JSON.parse((await w.sql('SELECT value FROM push_kv WHERE key = ?', `push:${id}:weather`).first()).value);
  assert.equal(kept.items[0].title, '明天有雨', 'its coming notices came along');
});

test('the admin’s 登出: no device is sent the account’s notices until it signs in again', async () => {
  const w = world();
  const a = await w.account('weather');
  await w.subscribe(a.token, PHONE, 'iPhone');
  await w.subscribe(a.token, MAC, 'Mac');
  assert.equal((await w.admin('signout', { wallet: a.id })).status, 200);
  assert.deepEqual(await w.lists(), {});
});

test('a notice the push service faltered on is tried again at the next run; one it refuses is not', async () => {
  const w = world();
  const a = await w.account('weather');
  await w.subscribe(a.token, PHONE, 'iPhone');
  const now = Date.now();
  await w.schedule(a.token, [{ at: now, title: '下雨了', tag: 'rain' }]);
  const answers = [503, 201];
  const asked = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async url => (asked.push(String(url)), new Response(null, { status: answers.shift() ?? 201 }));
  try {
    assert.equal((await sendDue(w.env, now)).sent, 0, 'Apple answered 503');
    assert.equal((await sendDue(w.env, now + 120_000)).sent, 1, 'sent at the next run');
    assert.equal((await sendDue(w.env, now + 240_000)).sent, 0, 'and only once');
    assert.equal(asked.length, 2);
    // Refused outright (a 400): not asked again.
    await w.schedule(a.token, [{ at: now + 240_000, title: '放晴了', tag: 'clear' }]);
    answers.push(400);
    assert.equal((await sendDue(w.env, now + 240_000)).sent, 0);
    assert.equal((await sendDue(w.env, now + 360_000)).sent, 0);
    assert.equal(asked.length, 3);
    // Down for good: twice more, then let go.
    await w.schedule(a.token, [{ at: now + 360_000, title: '起風了', tag: 'wind' }]);
    answers.push(500, 500, 500, 500);
    for (let i = 0; i < 5; i++) await sendDue(w.env, now + 360_000 + i * 120_000);
    assert.equal(asked.length, 6, 'the first try and two more');
  } finally {
    globalThis.fetch = realFetch;
  }
});
