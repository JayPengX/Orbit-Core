// 更換通行碼 through the whole Worker on a real (SQLite) store: what it must
// never lose. Found 2026-11-17 reading eco.js rotate against everything the
// Worker keeps under an account's id:
//   - the new pass itself: shown once, in the answer; asked twice (the kit
//     sends a call again after 5 s; a reply lost and the button tapped again)
//     the second ask found the account gone, signed the device out, and
//     nobody ever saw the pass;
//   - the account's own Orbit AI allowance (sec.ai) and what it had used;
//   - Securities' order book and checked events (stock-fills, stock-verified):
//     without them every past trade was counted again as one the Worker
//     never issued, at the worst price since;
//   - its notices (sent on from the old id, then twice once the app opened
//     again), what's under way (eco-now), and its kept versions.
import test from 'node:test';
import assert from 'node:assert/strict';
import { wholeWorker as setup } from './whole-worker.mjs';

test('a new pass takes everything the Worker keeps under the account: AI allowance and its count, Securities\' books, notices, what\'s under way, kept versions', async () => {
  const t = setup();
  const a = await t.account('stock');
  // The owner's allowance for this account, 3 a day, 2 used today.
  assert.equal((await t.admin('ai-grant', { wallet: a.id.slice(0, 8), rule: { n: 3, per: 'day' } })).status, 200);
  const day = new Date(Date.now() + 8 * 3_600_000).toISOString().slice(0, 10);
  await t.sql('CREATE TABLE IF NOT EXISTS ai_use (k TEXT PRIMARY KEY, n INTEGER NOT NULL, e INTEGER NOT NULL)').run();
  await t.sql('INSERT INTO ai_use (k, n, e) VALUES (?, 2, ?)', `${a.id}|day:${day}`, Date.now() + 86_400_000).run();
  // Securities' books, a notice list with its switches, something under way.
  await t.put('stock-fills', a.id, JSON.stringify({ v: 2, fills: { o1: { quote: 100, t: Date.now() } }, open: {}, plans: {}, cancelled: {} }));
  await t.put('stock-verified', a.id, JSON.stringify({ ok: ['e1'], bad: [], t: 1 }));
  await t.put('eco-now', `${a.id}_stock`, JSON.stringify({ x: 1 }));
  const sub = { endpoint: 'https://web.push.apple.com/abc', keys: { p256dh: 'p', auth: 'a' } };
  assert.equal((await t.send(`/push/subscribe?qt=${encodeURIComponent(a.token)}`, 'POST', { sub, lang: 'zh' })).status, 200);
  assert.equal((await t.send(`/push/schedule?qt=${encodeURIComponent(a.token)}`, 'POST', { items: [{ at: Date.now() + 3_600_000, title: '提醒', body: '一小時後', tag: 'x1' }] })).status, 200);
  assert.equal((await t.send(`/push/prefs?qt=${encodeURIComponent(a.token)}`, 'POST', { on: true, off: ['stock:all'] })).status, 200);
  assert.equal((await t.eco({ op: 'write', qt: a.token, payload: 'gz1:trades' }, 'stock')).status, 200);
  assert.equal((await t.eco({ op: 'write', qt: a.token, payload: 'gz1:trades-2' }, 'stock')).status, 200);

  const r = await t.eco({ op: 'rotate', qt: a.token });
  assert.equal(r.status, 200);
  const id = await t.idOf(r.data.token);
  assert.notEqual(id, a.id);
  assert.equal(r.data.payload, 'gz1:trades-2');
  // The allowance and what was used of it.
  assert.deepEqual({ n: r.data.ai.n, per: r.data.ai.per, left: r.data.ai.left }, { n: 3, per: 'day', left: 1 }, 'a new pass is not a new allowance');
  assert.equal(JSON.parse(await t.doc('eco-wallets', id)).sec.ai.n, 3);
  // Securities' books.
  assert.equal(JSON.parse(await t.doc('stock-fills', id)).fills.o1.quote, 100);
  assert.deepEqual(JSON.parse(await t.doc('stock-verified', id)).ok, ['e1']);
  // What's under way.
  assert.equal(await t.doc('eco-now', `${id}_stock`), JSON.stringify({ x: 1 }));
  // Its notices: one list, under the new id, switches with it.
  const keys = (await t.sql("SELECT key FROM push_kv WHERE key LIKE 'push:%'").all()).results.map(x => x.key).sort();
  assert.deepEqual(keys, [`push:${id}:stock`, `push:prefs:${id}`].sort());
  // Nothing left under the old id, kept versions included (an old id with kept versions is listed as an account deleted, to put back).
  for (const coll of ['eco-wallets', 'eco-now', 'stock-fills', 'stock-verified']) assert.equal((await t.sql('SELECT COUNT(*) AS n FROM docs WHERE coll = ? AND (id = ? OR id LIKE ?)', coll, a.id, `${a.id}\\_%`).first()).n, 0, coll);
  assert.equal((await t.sql('SELECT COUNT(*) AS n FROM history WHERE id = ?', a.id).first()).n, 0);
  assert.ok((await t.sql('SELECT COUNT(*) AS n FROM history WHERE id = ?', id).first()).n > 0, 'what was kept before the change can still be put back');
  assert.equal((await t.sql('SELECT COUNT(*) AS n FROM ai_use WHERE k LIKE ?', `${a.id}|%`).first()).n, 0);
  assert.deepEqual((await t.admin('versions')).data.gone, [], 'the old id is no account deleted');
});

test('the same ask sent again after it was done (its answer lost on the way) is answered with the same pass', async () => {
  const t = setup();
  const a = await t.account('money');
  const r1 = await t.eco({ op: 'rotate', qt: a.token });
  const r2 = await t.eco({ op: 'rotate', qt: a.token });
  assert.equal(r1.status, 200);
  assert.equal(r2.status, 200, 'not ECO_TOKEN_INVALID: the kit signed the device out on that, the new pass never seen');
  assert.equal(r2.data.passcode, r1.data.passcode);
  assert.notEqual(r1.data.passcode, a.passcode);
  assert.equal((await t.eco({ op: 'login', passcode: r1.data.passcode, app: 'money' })).status, 200);
  assert.equal((await t.eco({ op: 'login', passcode: a.passcode, app: 'money' })).status, 404, 'the old pass is dead');
  assert.equal((await t.sql("SELECT COUNT(*) AS n FROM docs WHERE coll = 'eco-wallets'").first()).n, 1, 'one account');
});

test('answered again only to the session that asked, and not once the new account signed everyone out', async () => {
  const t = setup();
  const a = await t.account('money');
  const other = await t.eco({ op: 'login', passcode: a.passcode, app: 'vocab' });
  const r = await t.eco({ op: 'rotate', qt: a.token });
  assert.equal(r.status, 200);
  // Another device of the old pass: signed out, never handed the new pass.
  const stolen = await t.eco({ op: 'rotate', qt: other.data.token });
  assert.equal(stolen.status, 401);
  assert.equal(stolen.data.passcode, undefined);
  // 登出其他所有裝置 on the new pass: the old session's ask is dead too.
  assert.equal((await t.eco({ op: 'signout-all', qt: r.data.token })).status, 200);
  const late = await t.eco({ op: 'rotate', qt: a.token });
  assert.equal(late.status, 401);
  assert.equal(late.data.passcode, undefined);
});

test('a rotate that stopped part way is gone on with when asked again: nothing lost, one account', async () => {
  const t = setup();
  const a = await t.account('money');
  assert.equal((await t.eco({ op: 'write', qt: a.token, payload: 'gz1:meals' }, 'money')).status, 200);
  // The store fails as the old account is being deleted (the new wallet written, the old data half gone).
  const prepare = t.env.STORE.prepare;
  let broken = true;
  t.env.STORE.prepare = sql => {
    if (broken && /^DELETE FROM docs/.test(sql.trim())) throw new Error('D1 down');
    return prepare(sql);
  };
  const first = await t.eco({ op: 'rotate', qt: a.token });
  assert.equal(first.status, 502);
  broken = false;
  const again = await t.eco({ op: 'rotate', qt: a.token });
  assert.equal(again.status, 200);
  assert.equal(again.data.payload, 'gz1:meals');
  assert.match(again.data.passcode, /^[2-9A-HJ-NP-Z]{10}$/);
  assert.equal((await t.sql("SELECT COUNT(*) AS n FROM docs WHERE coll = 'eco-wallets'").first()).n, 1);
  assert.equal((await t.eco({ op: 'login', passcode: again.data.passcode, app: 'money' })).data.payload, 'gz1:meals');
});

test('two devices ask for a new pass at once: one gets it, the other is signed out, one account', async () => {
  const t = setup();
  const a = await t.account('money');
  const b = await t.eco({ op: 'login', passcode: a.passcode, app: 'vocab' });
  const [r1, r2] = await Promise.all([t.eco({ op: 'rotate', qt: a.token }), t.eco({ op: 'rotate', qt: b.data.token })]);
  assert.deepEqual([r1.status, r2.status].sort(), [200, 401]);
  assert.equal((await t.sql("SELECT COUNT(*) AS n FROM docs WHERE coll = 'eco-wallets'").first()).n, 1);
});

test('an account deleted by its owner takes its notices with it (its phone was still sent what was waiting)', async () => {
  const t = setup();
  const a = await t.account('transit');
  const sub = { endpoint: 'https://web.push.apple.com/abc', keys: { p256dh: 'p', auth: 'a' } };
  await t.send(`/push/subscribe?qt=${encodeURIComponent(a.token)}`, 'POST', { sub, lang: 'zh' });
  await t.send(`/push/schedule?qt=${encodeURIComponent(a.token)}`, 'POST', { items: [{ at: Date.now() + 3_600_000, title: '公車', body: '快到了', tag: 'b1' }] });
  await t.send(`/push/prefs?qt=${encodeURIComponent(a.token)}`, 'POST', { on: true });
  assert.equal((await t.sql("SELECT COUNT(*) AS n FROM push_kv WHERE key LIKE 'push:%'").first()).n, 2);
  assert.equal((await t.send(`/eco?qt=${encodeURIComponent(a.token)}`, 'DELETE')).status, 200);
  assert.equal((await t.sql("SELECT COUNT(*) AS n FROM push_kv WHERE key LIKE 'push:%'").first()).n, 0);
});
