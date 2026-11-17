// The admin's tools and the notices (2026-11-17), through the whole Worker:
//   - 資料整理 never counts or takes the Worker's own key pair (`push:vapid`) as a notice list of nobody's.
//     Its copy in D1 (moved there with the lists on 11-10) showed on the page for good as 「1 個訂閱屬於
//     已經不存在的帳戶…到資料整理…就會移除」; with the lists in KV (before 11-10, or no D1) the pair itself
//     is among them, and 整理 deleted it: a new pair matches no device's subscription, so Apple and Google
//     refuse every notice until each app is opened again;
//   - 廣播通知 to 所有 App reaches each device once (an Orbit's apps share the phone's one address:
//     it rang once an app);
//   - 清除一個 App 的資料 takes that app's waiting notices with it;
//   - the bill's notices follow the owner's account to its new pass (they named the old id, and told nobody).
import test from 'node:test';
import assert from 'node:assert/strict';
import { wholeWorker } from './whole-worker.mjs';

const keys = { p256dh: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4', auth: 'BTBZMqHH6r4Tts7J_aSIgg' };
const PHONE = 'https://web.push.apple.com/phone-1';
const MAC = 'https://fcm.googleapis.com/fcm/send/mac-1';
const subscribe = (w, token, endpoint, dev) => w.send(`/push/subscribe?qt=${token}`, 'POST', { sub: { endpoint, keys }, dev, lang: 'zh' });
const pushKeys = async w => (await w.sql("SELECT key FROM push_kv WHERE key LIKE 'push:%'").all()).results.map(r => r.key).sort();

test('資料整理 keeps the Worker’s own notice key, and counts no list of nobody’s for it', async () => {
  const w = wholeWorker();
  const a = await w.account('weather');
  await subscribe(w, a.token, PHONE, 'iPhone');
  await w.sql("INSERT INTO push_kv (key, value, due, expires) VALUES ('push:vapid', '{\"pub\":\"x\"}', 0, 0)").run();
  const all = [`push:${a.id}:weather`, 'push:vapid'];
  assert.deepEqual(await pushKeys(w), all);
  assert.equal((await w.admin('pushes')).data.orphans, 0, 'the key pair is no subscription of an account that is gone');
  assert.equal((await w.admin('scan')).data.wouldDelete['通知訂閱'], undefined);
  assert.equal((await w.admin('clean')).status, 200);
  assert.deepEqual(await pushKeys(w), all);
  // (A list of an account that is gone still goes.)
  await w.sql("INSERT INTO push_kv (key, value, due, expires) VALUES ('push:nobody:weather', '{}', 0, 0)").run();
  assert.equal((await w.admin('pushes')).data.orphans, 1);
  await w.admin('clean');
  assert.deepEqual(await pushKeys(w), all);
});

test('廣播通知 to 所有 App: each device once', async () => {
  const w = wholeWorker();
  const a = await w.account('weather');
  await subscribe(w, a.token, PHONE, 'iPhone');
  await subscribe(w, a.token, MAC, 'Mac');
  const other = (await w.eco({ op: 'login', passcode: a.passcode, app: 'orbit' })).data.token;
  await subscribe(w, other, PHONE, 'iPhone');
  const asked = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async url => (asked.push(String(url)), new Response(null, { status: 201 }));
  try {
    const out = await w.admin('broadcast', { app: 'all', title: '今晚維護', body: '23:00 到 23:10 暫停' });
    assert.equal(out.status, 200);
    assert.deepEqual(asked.sort(), [MAC, PHONE].sort());
    assert.equal(out.data.sent, 2);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('清除一個 App 的資料: its waiting notices go with it', async () => {
  const w = wholeWorker();
  const a = await w.account('weather');
  await subscribe(w, a.token, PHONE, 'iPhone');
  await w.send(`/push/schedule?qt=${a.token}`, 'POST', { items: [{ at: Date.now() + 3_600_000, title: '明天有雨', tag: 'rain' }] });
  assert.equal((await w.admin('clear-app', { wallet: a.id.slice(0, 8), app: 'weather' })).status, 200);
  assert.deepEqual(await pushKeys(w), []);
});

test('the bill’s notices follow the owner’s account to its new pass', async () => {
  const w = wholeWorker();
  const a = await w.account('weather');
  assert.equal((await w.admin('alerts-set', { account: a.id })).data.alertAccount, a.id.slice(0, 8));
  const next = await w.eco({ op: 'rotate', qt: a.token });
  assert.equal(next.status, 200);
  const id = await w.idOf(next.data.token);
  assert.notEqual(id, a.id);
  assert.equal(JSON.parse(await w.doc('orbit-config', 'ops')).alertAccount, id);
});
