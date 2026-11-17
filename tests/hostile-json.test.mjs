// A body that puts an object named toString or valueOf where text belongs ({"toString":null}: JSON allows it,
// and String() of it throws) is the caller's mistake: a 400, never the Worker failing (2026-11-17: a 500 from
// /ai and /push and a 502 from /eco for anyone, no sign-in needed, each counted as the Worker's own error;
// a route's 100 in a day turn the admin's 錯誤 red and mail the owner).
import test from 'node:test';
import assert from 'node:assert/strict';
import { wholeWorker } from './whole-worker.mjs';

test('an object where text belongs is a 400, and not counted as the Worker failing', async () => {
  const w = wholeWorker();
  const a = await w.account('weather');
  await w.settle();
  // (The meter's table is made at its first count: none yet, no errors.)
  const errors = async () => {
    try {
      return (await w.sql("SELECT k, n FROM meter WHERE k LIKE 'err:%'").all()).results;
    } catch {
      return [];
    }
  };
  const before = JSON.stringify(await errors());
  for (const H of [{ toString: null }, { valueOf: 1, toString: 'x' }]) {
    const asks = [
      ['/eco', { op: H }],
      ['/eco', { op: 'login', passcode: H, app: 'weather' }],
      ['/eco', { op: 'pair-redeem', code: H, app: 'weather' }],
      [`/push/schedule?qt=${a.token}`, { items: [{ at: Date.now() + 1000, title: H, body: H, tag: H }] }],
      [`/ai?qt=${a.token}`, { feature: H, input: H }],
      [`/ai?qt=${a.token}`, { feature: 'weather-ask', input: { question: H, place: H } }]
    ];
    for (const [path, body] of asks) {
      const r = await w.send(path, 'POST', body);
      assert.equal(r.status, 400, `${path} ${JSON.stringify(body).slice(0, 80)}`);
      assert.equal(r.data.error.code, 'INVALID_JSON');
    }
  }
  await w.settle();
  assert.equal(JSON.stringify(await errors()), before, 'none counted as an error');
  // (And the account is as it was: it still signs in.)
  assert.equal((await w.eco({ op: 'login', passcode: a.passcode, app: 'weather' })).status, 200);
});
