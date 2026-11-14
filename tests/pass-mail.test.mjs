// The recovery email: linked by a mailed code, a lost pass recovered by one,
// nobody told whether an address is on a Pass, codes single-use and capped.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { handleEcoRequest, WALLET_COLLECTION } from '../eco.js';
import { MAIL_COLLECTION, MAIL_CODES, MAIL_TRIES, MAIL_PER_DAY, MAIL_WAIT_MS, cleanAddr, maskAddr, accountOfMail, signupMailBegin, signupMailProve, forgetMailCounts, claimMail } from '../pass-mail.js';
import { tokenSecret } from '../orbit-token.js';
import { planClean } from '../eco-admin.js';

// (Each its own minutes: the per-session limits are counted in memory, by minute.)
let runs = 0;
function setup() {
  forgetMailCounts();
  const store = new Map();
  const sent = [];
  let clock = 1_800_000_000_000 + ++runs * 3_600_000;
  let n = 0;
  let codeN = 0;
  const key = (c, id) => `${c}/${id}`;
  const deps = {
    json: (data, status) => ({ status, data }),
    errorJson: (code, status) => ({ status, data: { error: { code } } }),
    upstreamFailed: error => ({ status: 502, data: { error: { code: 'UPSTREAM_FAILED', message: error.message } } }),
    readJsonBody: req => Promise.resolve(req.body),
    INVALID_BODY: Symbol('bad'),
    rateLimitResponse: async () => null,
    fsGet: async (env, c, id) => {
      const d = store.get(key(c, id));
      return d ? { exists: true, ...d } : { exists: false, payload: '', updateTime: '' };
    },
    fsWrite: async (env, c, id, payload, pre) => {
      const had = store.get(key(c, id));
      if (pre?.exists === false && had) throw Object.assign(new Error('exists'), { precondition: true });
      if (pre?.updateTime && had?.updateTime !== pre.updateTime) throw Object.assign(new Error('stale'), { precondition: true });
      const d = { payload, updateTime: `u${++n}` };
      store.set(key(c, id), d);
      return { updateTime: d.updateTime };
    },
    fsDelete: async (env, c, id) => void store.delete(key(c, id)),
    fsList: async (env, c) => [...store.entries()].filter(([k]) => k.startsWith(`${c}/`)).map(([k, d]) => ({ id: k.slice(c.length + 1), payload: d.payload, updateTime: d.updateTime })),
    fsCollections: async () => [...new Set([...store.keys()].map(k => k.split('/')[0]))],
    fsBatch: async () => {},
    sha256Hex: async text => createHash('sha256').update(text).digest('hex'),
    generateCode: len => {
      codeN++;
      const a = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
      return Array.from({ length: len }, (_, i) => a[(codeN * 7 + i * 13) % 32]).join('');
    },
    sendMail: async (env, mail) => void sent.push(mail),
    mailReady: () => true,
    now: () => (clock += 1000)
  };
  const env = { STORE: {}, ECO_TOKEN_SECRET: 'test-secret', PASS_MAIL: 'on' };
  const waits = [];
  const post = body => handleEcoRequest({ method: 'POST', url: 'https://w/eco', body }, env, {}, '1.1.1.1', deps, p => waits.push(p));
  const settle = () => Promise.all(waits.splice(0));
  const codeIn = mail => mail.text.match(/\b(\d{6})\b/)[1];
  return { store, deps, env, post, sent, settle, codeIn, advance: ms => (clock += ms) };
}
async function account(t, app = 'match') {
  const res = await t.post({ op: 'create', app });
  assert.equal(res.status, 200);
  return res.data;
}
async function link(t, qt, addr) {
  const begin = await t.post({ op: 'mail-begin', qt, addr });
  assert.equal(begin.status, 200, JSON.stringify(begin.data));
  await t.settle();
  const code = t.codeIn(t.sent.at(-1));
  return t.post({ op: 'mail-confirm', qt, code });
}

test('addresses: one form, a masked one for the apps', () => {
  assert.equal(cleanAddr('  Jay.Peng@Gmail.COM '), 'jay.peng@gmail.com');
  for (const bad of ['', 'jay', 'jay@', '@x.com', 'a b@x.com', 'jay@x', `${'a'.repeat(65)}@x.com`, 'x@-a.com']) assert.equal(cleanAddr(bad), '', bad);
  assert.equal(maskAddr('jay.peng@gmail.com'), 'ja•••@gmail.com');
  assert.equal(maskAddr('al@x.tw'), 'a•••@x.tw');
});

test('linking: a code mailed, typed once, the address on the wallet (masked to the apps)', async () => {
  const t = setup();
  const a = await account(t);
  const res = await link(t, a.token, 'Me@Example.com');
  assert.equal(res.status, 200);
  assert.deepEqual(res.data.wallet.mail, { shown: 'm•••@example.com', t: res.data.wallet.mail.t });
  assert.equal(t.sent[0].to, 'me@example.com');
  assert.match(t.sent[0].subject, /\d{6}/);
  const stored = [...t.store.entries()].filter(([k]) => k.startsWith(`${WALLET_COLLECTION}/`)).map(([, d]) => JSON.parse(d.payload));
  assert.equal(stored[0].mail.addr, 'me@example.com');
  // Read back: still masked, never the address itself.
  const read = await handleEcoRequest({ method: 'GET', url: `https://w/eco?qt=${a.token}&app=match` }, t.env, {}, '1.1.1.1', t.deps);
  assert.equal(JSON.stringify(read.data).includes('me@example.com'), false);
  // The same code again: spent.
  const again = await t.post({ op: 'mail-confirm', qt: a.token, code: t.codeIn(t.sent[0]) });
  assert.equal(again.data.error.code, 'ECO_MAIL_CODE_WRONG');
});

test('linking: five wrong codes and that code is gone; one a minute, five a day', async () => {
  const t = setup();
  const a = await account(t);
  await t.post({ op: 'mail-begin', qt: a.token, addr: 'me@example.com' });
  await t.settle();
  const right = t.codeIn(t.sent[0]);
  const wrong = right === '000000' ? '111111' : '000000';
  for (let i = 0; i < MAIL_TRIES; i++) assert.equal((await t.post({ op: 'mail-confirm', qt: a.token, code: wrong })).data.error.code, 'ECO_MAIL_CODE_WRONG');
  assert.equal((await t.post({ op: 'mail-confirm', qt: a.token, code: right })).data.error.code, 'ECO_MAIL_CODE_WRONG');
  // Another at once: wait a minute.
  assert.equal((await t.post({ op: 'mail-begin', qt: a.token, addr: 'me@example.com' })).data.error.code, 'ECO_MAIL_WAIT');
  for (let i = 1; i < MAIL_PER_DAY; i++) {
    t.advance(MAIL_WAIT_MS);
    assert.equal((await t.post({ op: 'mail-begin', qt: a.token, addr: 'me@example.com' })).status, 200);
  }
  t.advance(MAIL_WAIT_MS);
  assert.equal((await t.post({ op: 'mail-begin', qt: a.token, addr: 'me@example.com' })).data.error.code, 'ECO_MAIL_TOO_MANY');
});

test('linking: a code ends in ten minutes', async () => {
  const t = setup();
  const a = await account(t);
  await t.post({ op: 'mail-begin', qt: a.token, addr: 'me@example.com' });
  await t.settle();
  t.advance(10 * 60_000);
  assert.equal((await t.post({ op: 'mail-confirm', qt: a.token, code: t.codeIn(t.sent[0]) })).data.error.code, 'ECO_MAIL_CODE_WRONG');
});

test('an address on another Pass: refused only after its code proves it is theirs', async () => {
  const t = setup();
  const a = await account(t);
  const b = await account(t);
  assert.equal((await link(t, a.token, 'me@example.com')).status, 200);
  const begin = await t.post({ op: 'mail-begin', qt: b.token, addr: 'me@example.com' });
  assert.equal(begin.status, 200);
  await t.settle();
  const res = await t.post({ op: 'mail-confirm', qt: b.token, code: t.codeIn(t.sent.at(-1)) });
  assert.equal(res.data.error.code, 'ECO_MAIL_TAKEN');
});

test('recovery: any address gets the same answer; only a linked one gets mail', async () => {
  const t = setup();
  const a = await account(t);
  await link(t, a.token, 'me@example.com');
  t.sent.length = 0;
  const known = await t.post({ op: 'mail-recover-begin', addr: 'ME@example.com' });
  const unknown = await t.post({ op: 'mail-recover-begin', addr: 'nobody@example.com' });
  await t.settle();
  assert.equal(known.status, 200);
  assert.equal(unknown.status, 200);
  assert.deepEqual(Object.keys(known.data).sort(), Object.keys(unknown.data).sort());
  assert.equal(known.data.sent, true);
  assert.equal(unknown.data.sent, true);
  assert.deepEqual(t.sent.map(m => m.to), ['me@example.com']);
  // The same wait for both, so the limit says nothing either.
  assert.equal((await t.post({ op: 'mail-recover-begin', addr: 'me@example.com' })).data.error.code, 'ECO_MAIL_WAIT');
  assert.equal((await t.post({ op: 'mail-recover-begin', addr: 'nobody@example.com' })).data.error.code, 'ECO_MAIL_WAIT');
  // A guess at the unknown one is wrong like any other.
  assert.equal((await t.post({ op: 'mail-recover', addr: 'nobody@example.com', code: '123456', app: 'match' })).data.error.code, 'ECO_MAIL_CODE_WRONG');
});

test('recovery: the code signs in on a session that only takes a new pass; the old pass then stops', async () => {
  const t = setup();
  const a = await account(t);
  await link(t, a.token, 'me@example.com');
  await t.post({ op: 'mail-recover-begin', addr: 'me@example.com' });
  await t.settle();
  const code = t.codeIn(t.sent.at(-1));
  const res = await t.post({ op: 'mail-recover', addr: 'me@example.com', code, app: 'match' });
  assert.equal(res.status, 200);
  assert.equal(res.data.fresh, true);
  assert.equal(res.data.recovered, true);
  // Nothing else opens with it.
  const read = await handleEcoRequest({ method: 'GET', url: `https://w/eco?qt=${res.data.token}&app=match` }, t.env, {}, '1.1.1.1', t.deps);
  assert.equal(read.status, 401);
  assert.equal((await t.post({ op: 'mail-begin', qt: res.data.token, addr: 'x@example.com' })).status, 401);
  // Single use.
  assert.equal((await t.post({ op: 'mail-recover', addr: 'me@example.com', code, app: 'match' })).data.error.code, 'ECO_MAIL_CODE_WRONG');
  // A new pass: the old one is gone, the email comes along and still recovers it.
  const rot = await t.post({ op: 'rotate', qt: res.data.token });
  assert.equal(rot.status, 200);
  assert.notEqual(rot.data.passcode, a.passcode);
  assert.equal((await t.post({ op: 'login', passcode: a.passcode, app: 'match' })).status, 404);
  assert.equal(rot.data.wallet.mail.shown, 'm•••@example.com');
  t.advance(MAIL_WAIT_MS);
  await t.post({ op: 'mail-recover-begin', addr: 'me@example.com' });
  await t.settle();
  const again = await t.post({ op: 'mail-recover', addr: 'me@example.com', code: t.codeIn(t.sent.at(-1)), app: 'match' });
  assert.equal(again.status, 200);
  const login = await t.post({ op: 'login', passcode: rot.data.passcode, app: 'match' });
  assert.equal(login.status, 200);
});

test('recovery: five wrong codes end it', async () => {
  const t = setup();
  const a = await account(t);
  await link(t, a.token, 'me@example.com');
  await t.post({ op: 'mail-recover-begin', addr: 'me@example.com' });
  await t.settle();
  const right = t.codeIn(t.sent.at(-1));
  const wrong = right === '000000' ? '111111' : '000000';
  for (let i = 0; i < MAIL_TRIES; i++) await t.post({ op: 'mail-recover', addr: 'me@example.com', code: wrong, app: 'match' });
  assert.equal((await t.post({ op: 'mail-recover', addr: 'me@example.com', code: right, app: 'match' })).data.error.code, 'ECO_MAIL_CODE_WRONG');
});

test('removed or replaced: the old address is told, and no longer recovers the account', async () => {
  const t = setup();
  const a = await account(t);
  await link(t, a.token, 'old@example.com');
  t.advance(MAIL_WAIT_MS);
  const res = await link(t, a.token, 'new@example.com');
  assert.equal(res.data.wallet.mail.shown, 'n•••@example.com');
  await t.settle();
  assert.equal(t.sent.at(-1).to, 'old@example.com');
  t.sent.length = 0;
  await t.post({ op: 'mail-recover-begin', addr: 'old@example.com' });
  await t.settle();
  assert.equal(t.sent.length, 0);
  const off = await t.post({ op: 'mail-remove', qt: a.token });
  assert.equal(off.status, 200);
  assert.equal(off.data.wallet.mail, undefined);
  await t.settle();
  assert.equal(t.sent.at(-1).to, 'new@example.com');
  assert.equal([...t.store.keys()].filter(k => k.startsWith(`${MAIL_COLLECTION}/`)).length, 0);
});

test('a merge brings a source pass’s email when the target has none; a delete drops its finder', async () => {
  const t = setup();
  const a = await account(t);
  const b = await account(t);
  await link(t, b.token, 'b@example.com');
  const merged = await t.post({ op: 'merge', qt: a.token, sources: [{ passcode: b.passcode }] });
  assert.equal(merged.status, 200);
  assert.equal(merged.data.wallet.mail.shown, 'b•••@example.com');
  t.advance(MAIL_WAIT_MS);
  t.sent.length = 0;
  await t.post({ op: 'mail-recover-begin', addr: 'b@example.com' });
  await t.settle();
  const res = await t.post({ op: 'mail-recover', addr: 'b@example.com', code: t.codeIn(t.sent.at(-1)), app: 'match' });
  assert.equal(res.status, 200);
  // The store's clean-up keeps the live finder, drops a stray one.
  t.store.set(`${MAIL_COLLECTION}/stray`, { payload: JSON.stringify({ d: 'gone' }), updateTime: 'x' });
  t.store.set(`${MAIL_CODES}/r-old`, { payload: JSON.stringify({ e: 1 }), updateTime: 'x' });
  const plan = await planClean(t.env, t.deps);
  const drops = plan.deletes.filter(([c]) => c === MAIL_COLLECTION || c === MAIL_CODES).map(([c, id]) => `${c}/${id}`);
  assert.deepEqual(drops.sort(), [`${MAIL_CODES}/r-old`, `${MAIL_COLLECTION}/stray`]);
});

test('no sender for everyone’s addresses yet: the ops say so, nothing is written', async () => {
  const t = setup();
  t.deps.mailReady = () => false;
  const a = await account(t);
  assert.equal((await t.post({ op: 'mail-begin', qt: a.token, addr: 'me@example.com' })).data.error.code, 'ECO_MAIL_OFF');
  assert.equal((await t.post({ op: 'mail-recover-begin', addr: 'me@example.com' })).data.error.code, 'ECO_MAIL_OFF');
  assert.equal([...t.store.keys()].some(k => k.startsWith(MAIL_CODES)), false);
});

test('a mail that fails to go: said so, not counted, no wait to try again', async () => {
  const t = setup();
  const a = await account(t);
  t.deps.sendMail = async () => {
    throw new Error('refused');
  };
  assert.equal((await t.post({ op: 'mail-begin', qt: a.token, addr: 'me@example.com' })).data.error.code, 'ECO_MAIL_OFF');
  t.deps.sendMail = async (env, mail) => void t.sent.push(mail);
  assert.equal((await t.post({ op: 'mail-begin', qt: a.token, addr: 'me@example.com' })).status, 200);
});

test('an account found by its verified recovery email, any spelling; none once removed', async () => {
  const t = setup();
  const a = await account(t);
  await link(t, a.token, 'me@example.com');
  const id = await accountOfMail(t.env, t.deps, '  ME@Example.com ');
  assert.ok(id && t.store.has(`${WALLET_COLLECTION}/${id}`));
  assert.equal(await accountOfMail(t.env, t.deps, 'other@example.com'), '');
  await t.post({ op: 'mail-remove', qt: a.token });
  assert.equal(await accountOfMail(t.env, t.deps, 'me@example.com'), '');
});

test('a new pass with an address: a code to it, spent once; an address on a Pass refused only after its code', async () => {
  const t = setup();
  const secret = await tokenSecret(t.env);
  const ctx = body => ({ env: t.env, deps: t.deps, body, secret, ip: '1.1.1.1', headers: {}, request: {}, waitUntil: () => {} });
  const begin = await signupMailBegin(ctx({ email: ' New@Example.com ' }));
  assert.equal(begin.status, 200);
  assert.equal(t.sent.at(-1).to, 'new@example.com');
  assert.match(t.sent.at(-1).text, /建立你的 Orbit Pass/);
  const code = t.codeIn(t.sent.at(-1));
  assert.ok((await signupMailProve(ctx({ email: 'new@example.com', code: '000000' }))).refused);
  const ok = await signupMailProve(ctx({ email: 'NEW@example.com', code }));
  assert.equal(ok.addr, 'new@example.com');
  assert.equal(ok.mail.addr, 'new@example.com');
  assert.ok((await signupMailProve(ctx({ email: 'new@example.com', code }))).refused, 'spent');
  // Already some Pass's address: the same answer and a code; refused once proven.
  const a = await account(t);
  await link(t, a.token, 'me@example.com');
  t.advance(MAIL_WAIT_MS);
  assert.equal((await signupMailBegin(ctx({ email: 'me@example.com' }))).status, 200);
  const taken = await signupMailProve(ctx({ email: 'me@example.com', code: t.codeIn(t.sent.at(-1)) }));
  assert.equal(taken.refused.data.error.code, 'ECO_MAIL_TAKEN');
});

test('the day’s mails: new addresses stop at 60% of the budget, recovery goes on to 95%, then shut for every address alike', async () => {
  const t = setup();
  t.deps.mailBudget = () => 10;
  const secret = await tokenSecret(t.env);
  const ctx = body => ({ env: t.env, deps: t.deps, body, secret, ip: '1.1.1.1', headers: {}, request: {}, waitUntil: () => {} });
  const a = await account(t);
  await link(t, a.token, 'me@example.com'); // 1
  for (let i = 0; i < 5; i++) assert.equal((await signupMailBegin(ctx({ email: `x${i}@example.com` }))).status, 200); // 6
  const busy = await signupMailBegin(ctx({ email: 'x9@example.com' }));
  assert.equal(busy.data.error.code, 'ECO_MAIL_BUSY');
  assert.equal(t.sent.length, 6);
  // Recovery still mails (to 9 of 10), and then says the same to anyone.
  for (let i = 0; i < 3; i++) {
    t.advance(MAIL_WAIT_MS);
    assert.equal((await t.post({ op: 'mail-recover-begin', addr: 'me@example.com' })).status, 200);
    await t.settle();
  }
  assert.equal(t.sent.length, 9);
  const shut = [await t.post({ op: 'mail-recover-begin', addr: 'me@example.com' }), await t.post({ op: 'mail-recover-begin', addr: 'nobody@example.com' })];
  assert.deepEqual(shut.map(r => r.data.error?.code), ['ECO_MAIL_BUSY', 'ECO_MAIL_BUSY']);
});

test('one stranger’s address: five new-address mails a day, however many passes ask', async () => {
  const t = setup();
  const passes = [];
  for (let i = 0; i < 6; i++) passes.push(await account(t));
  const codes = [];
  for (const p of passes) codes.push((await t.post({ op: 'mail-begin', qt: p.token, addr: 'them@example.com' })).data.error?.code || 'sent');
  assert.deepEqual(codes, ['sent', 'sent', 'sent', 'sent', 'sent', 'ECO_MAIL_TOO_MANY']);
  assert.equal(t.sent.filter(m => m.to === 'them@example.com').length, 5);
});

test('two passes claiming one address at once: one gets it', async () => {
  const t = setup();
  const secret = await tokenSecret(t.env);
  const [x, y] = await Promise.all([claimMail(t.env, t.deps, secret, 'me@example.com', 'acct-x'), claimMail(t.env, t.deps, secret, 'me@example.com', 'acct-y')]);
  assert.deepEqual([x, y].sort(), ['', 'new']);
  // One after the other too, the first's wallet not yet written.
  assert.equal(await claimMail(t.env, t.deps, secret, 'me@example.com', 'acct-z'), '');
  // A claim whose wallet never came is let go after a minute.
  t.advance(61_000);
  assert.equal(await claimMail(t.env, t.deps, secret, 'me@example.com', 'acct-z'), 'new');
});

test('the mail’s page: its title, its lines escaped, the code large', async () => {
  const { mailPage } = await import('../pass-mail.js');
  const html = mailPage({ title: 'Orbit Pass 驗證碼', lines: ['a <b>'], code: '123456', lang: 'zh' });
  assert.match(html, /lang="zh-Hant-TW"/);
  assert.match(html, /123456/);
  assert.match(html, /a &lt;b&gt;/);
});

test('the day’s count read through law.js’s counts (as worker.js wires it): an empty day is open', async () => {
  const { addOne, countOf, forgetLawCounts } = await import('../law.js');
  forgetLawCounts();
  const t = setup();
  t.deps.dayCount = (env, k, day, by = 1) => (by === 0 ? countOf({}, k, day) : addOne({}, k, day, by));
  const res = await t.post({ op: 'mail-recover-begin', addr: 'nobody@example.com' });
  assert.equal(res.status, 200, JSON.stringify(res.data));
});
