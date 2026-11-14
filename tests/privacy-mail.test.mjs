// privacy@: requests by mail, answered by code; a copy once in 30 days, deletion always.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { handleEcoRequest, WALLET_COLLECTION, newPasscode, updateWallet } from '../eco.js';
import { accountOfMail } from '../pass-mail.js';
import { privacyMail, EXPORT_EVERY_MS, REPLIES_A_DAY } from '../privacy-mail.js';
import { DOMAIN } from '../kit/domain.mjs';

let runs = 0;
function setup() {
  const store = new Map();
  const sent = [];
  let clock = 1_900_000_000_000 + ++runs * 3_600_000;
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
  return { store, deps, env, post, sent, settle, now: () => clock, advance: ms => (clock += ms) };
}
// (A pass already in use, signed in with it: a never-used one would sign in fresh, for `rotate` only.)
async function account(t) {
  const { passcode, docId } = await newPasscode(t.env, t.deps);
  await updateWallet(t.env, t.deps, docId, w => ({ ...w, v2: t.now(), apps: { match: { t: t.now() } } }), { create: true });
  const res = await t.post({ op: 'login', passcode, app: 'match' });
  assert.equal(res.status, 200, JSON.stringify(res.data));
  return { ...res.data, passcode };
}
async function link(t, qt, addr) {
  assert.equal((await t.post({ op: 'mail-begin', qt, addr })).status, 200);
  await t.settle();
  const code = t.sent.at(-1).text.match(/\b(\d{6})\b/)[1];
  return t.post({ op: 'mail-confirm', qt, code });
}
// A mail to the domain, as Email Routing hands it over.
const mail = (from, to = `privacy@${DOMAIN}`, headers = {}) => {
  const m = { from, to, headers: new Map(Object.entries({ 'Message-ID': '<x@y>', ...headers })), rejected: '' };
  m.setReject = why => (m.rejected = why);
  return m;
};
async function ask(t, from) {
  let got = null;
  await privacyMail(mail(from), t.env, t.deps, { now: t.now(), reply: (raw, x) => (got = { raw, ...x }) });
  return got;
}
const tokenOf = (link, kind) => new URLSearchParams(link[kind].split('#')[1]).get('t');

test('only privacy@ is answered; never a robot; a few replies a day an address', async () => {
  const t = setup();
  const other = mail('a@example.com', `money@${DOMAIN}`);
  await privacyMail(other, t.env, t.deps, { reply: () => assert.fail('answered') });
  assert.ok(other.rejected);
  await privacyMail(mail('a@example.com', `privacy@${DOMAIN}`, { 'Auto-Submitted': 'auto-replied' }), t.env, t.deps, { reply: () => assert.fail('answered a robot') });
  for (let i = 0; i < REPLIES_A_DAY; i++) assert.ok(await ask(t, 'a@example.com'));
  assert.equal(await ask(t, 'A@Example.com '), null);
});

test('from the recovery email the link alone does it; a copy once in 30 days', async () => {
  const t = setup();
  const a = await account(t);
  await link(t, a.token, 'me@example.com');
  const r = await ask(t, 'Me@Example.com');
  assert.ok(r.docId);
  assert.match(r.raw, /^Subject: =\?UTF-8\?B\?/m);
  const exp = await t.post({ op: 'privacy', token: tokenOf(r.links, 'export') });
  assert.equal(exp.status, 200, JSON.stringify(exp.data));
  assert.equal(exp.data.file.recoveryEmail, 'me@example.com');
  assert.ok(exp.data.file.wallet);
  const again = await t.post({ op: 'privacy', token: tokenOf(r.links, 'export') });
  assert.equal(again.data.error.code, 'PRIVACY_EXPORT_WAIT');
  t.advance(EXPORT_EVERY_MS + 1);
  const later = await ask(t, 'me@example.com');
  assert.equal((await t.post({ op: 'privacy', token: tokenOf(later.links, 'export') })).status, 200);
});

test('from another address the pass is asked; deletion takes the account and its recovery email', async () => {
  const t = setup();
  const a = await account(t);
  await link(t, a.token, 'me@example.com');
  const r = await ask(t, 'stranger@example.com');
  assert.equal(r.docId, '');
  assert.equal((await t.post({ op: 'privacy', token: tokenOf(r.links, 'stop') })).data.error.code, 'PRIVACY_NEEDS_PASS');
  assert.equal((await t.post({ op: 'privacy', token: tokenOf(r.links, 'stop'), passcode: 'ZZZZZZZZZZ' })).status, 404);
  const stop = await t.post({ op: 'privacy', token: tokenOf(r.links, 'stop'), passcode: a.passcode });
  assert.equal(stop.data.stopped, true);
  const id = await accountOfMail(t.env, t.deps, 'me@example.com');
  assert.equal(JSON.parse(t.store.get(`${WALLET_COLLECTION}/${id}`).payload).settings.usage.value, 'off');
  const del = await t.post({ op: 'privacy', token: tokenOf(r.links, 'delete'), passcode: a.passcode });
  assert.equal(del.data.deleted, true);
  assert.equal(t.store.has(`${WALLET_COLLECTION}/${id}`), false);
  assert.equal(await accountOfMail(t.env, t.deps, 'me@example.com'), '');
});

test('a link is good 24 hours, and only as a privacy link', async () => {
  const t = setup();
  const r = await ask(t, 'x@example.com');
  t.advance(24 * 3_600_000 + 1);
  assert.equal((await t.post({ op: 'privacy', token: tokenOf(r.links, 'delete'), passcode: 'ABCDEFGHJK' })).data.error.code, 'PRIVACY_LINK_OLD');
  assert.equal((await t.post({ op: 'privacy', token: 'abc.def' })).data.error.code, 'PRIVACY_LINK_OLD');
});
