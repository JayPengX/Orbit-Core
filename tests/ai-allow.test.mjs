// Orbit AI allowances (ai-allow.js, Jay 11-14): a level's rule, an account's
// own, a day, a month or in all, until a date; 基本 has none without a
// verified email; counted only when a model is asked, never past the rule,
// in D1 so it holds on every Worker; set from the admin panel for a level,
// one account or every account there is now.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { ruleOf, cleanRule, aiSpend, aiMay, allowanceOf, forgetAllow, AI_DEFAULTS } from '../ai-allow.js';
import { handleEcoRequest, WALLET_COLLECTION } from '../eco.js';
import { docStore, SCHEMA } from '../doc-store.js';
import { readToken } from '../orbit-token.js';
import { fakeD1 } from './fake-d1.mjs';
import { newPass } from './new-pass.mjs';

const DAY = 86_400_000;
const T0 = Date.parse('2026-11-14T02:00:00Z');

function setup() {
  forgetAllow();
  const DOCS = docStore();
  let clock = T0;
  let codeN = 0;
  const deps = {
    json: (data, status) => ({ status, data }),
    errorJson: (code, status) => ({ status, data: { error: { code } } }),
    readJsonBody: req => Promise.resolve(req.body),
    INVALID_BODY: Symbol('bad'),
    rateLimitResponse: async () => null,
    fsGet: DOCS.get,
    fsWrite: DOCS.write,
    fsDelete: DOCS.delete,
    fsList: DOCS.list,
    fsCollections: DOCS.collections,
    fsBatch: DOCS.batch,
    sha256Hex: async text => createHash('sha256').update(text).digest('hex'),
    generateCode: len => {
      codeN++;
      const a = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
      return Array.from({ length: len }, (_, i) => a[(codeN * 7 + i * 13) % 32]).join('');
    },
    now: () => clock
  };
  const env = { STORE: fakeD1(SCHEMA), ECO_TOKEN_SECRET: 'test-secret', PASS_MAIL: 'on', ECO_ADMIN_TOKEN: 'o'.repeat(40) };
  const call = body => handleEcoRequest({ method: 'POST', url: 'https://w/eco', body }, env, {}, '1.1.1.1', deps);
  const admin = async (action, extra = {}) => (await call({ op: 'admin', token: 'o'.repeat(40), action, ...extra })).data;
  const ses = async qt => readToken('test-secret', qt, 'ses', 0);
  const level = async (made, lv) => admin('level', { wallet: (await ses(made.token)).d.slice(0, 8), level: lv });
  return { env, deps, call, admin, ses, level, advance: ms => (clock += ms) };
}

test('which rule: the account’s own while it runs, then its level’s, then the built-in; 基本 needs a verified email', () => {
  const now = T0;
  const full = { sec: { level: 'full' } };
  const free = { sec: { level: 'free' }, mail: { addr: 'a@b.co' } };
  assert.equal(ruleOf(full, {}, now).n, AI_DEFAULTS.full.n);
  assert.equal(ruleOf(free, {}, now).n, 0, '基本: none by default');
  assert.equal(ruleOf(free, { free: { n: 5, per: 'day' } }, now).n, 5);
  assert.equal(ruleOf({ sec: { level: 'free' } }, { free: { n: 5, per: 'day' } }, now).from, 'mail', 'no verified email: none');
  assert.equal(ruleOf(free, { free: { n: 5, per: 'day', until: now - 1 } }, now).n, 0, 'an ended level rule: the built-in again');
  assert.deepEqual(ruleOf({ ...full, sec: { level: 'full', ai: { n: 3, per: 'total', until: now + DAY } } }, { full: { n: 9 } }, now).n, 3);
  assert.equal(ruleOf({ ...full, sec: { level: 'full', ai: { n: 3, per: 'total', until: now - 1 } } }, { full: { n: 9, per: 'day' } }, now).n, 9);
  assert.equal(cleanRule({ n: -1 }), null);
  assert.equal(cleanRule({ n: '' }).n, null, 'blank: no limit');
  assert.equal(cleanRule({ n: 4, per: 'weird' }).per, 'day');
});

test('counted as each call starts, never past the rule; a new day starts again; a month, in all, no limit', async () => {
  const t = setup();
  const made = (await newPass(t.call, t.deps, 'stock')).data;
  await t.level(made, 'full');
  const c = await t.ses(made.token);
  await t.admin('ai-allow-set', { level: 'full', rule: { n: 2, per: 'day' } });
  assert.equal(await aiMay(t.env, t.deps, c), true);
  assert.equal(await aiSpend(t.env, t.deps, c), true);
  assert.equal(await aiSpend(t.env, t.deps, c), true);
  assert.equal(await aiSpend(t.env, t.deps, c), 'used');
  assert.equal(await aiMay(t.env, t.deps, c), 'used');
  t.advance(DAY);
  assert.equal(await aiSpend(t.env, t.deps, c), true, 'the next Taiwan day');
  await t.admin('ai-allow-set', { level: 'full', rule: { n: 1, per: 'month' } });
  assert.equal(await aiSpend(t.env, t.deps, c), true);
  assert.equal(await aiSpend(t.env, t.deps, c), 'used');
  await t.admin('ai-allow-set', { level: 'full', rule: { n: null, per: 'day' } });
  for (let i = 0; i < 5; i++) assert.equal(await aiSpend(t.env, t.deps, c), true, 'no limit');
  const a = await allowanceOf(t.env, t.deps, c.d, JSON.parse((await t.deps.fsGet(t.env, WALLET_COLLECTION, c.d)).payload));
  assert.equal(a.left, null);
  assert.ok(a.used >= 5);
  // Signed out (another generation): nothing.
  assert.equal(await aiSpend(t.env, t.deps, { ...c, g: 9 }), 'level');
  assert.equal(await aiSpend(t.env, t.deps, null), 'level');
});

test('基本 with a verified email gets what the panel opens to it, and the phone hears what’s left', async () => {
  const t = setup();
  const made = (await newPass(t.call, t.deps, 'stock')).data;
  assert.equal(made.ai, null, '基本: no Orbit AI by default');
  const c = await t.ses(made.token);
  assert.equal(await aiSpend(t.env, t.deps, c), 'level');
  await t.admin('ai-allow-set', { level: 'free', rule: { n: 3, per: 'day', until: T0 + 7 * DAY } });
  assert.equal(await aiSpend(t.env, t.deps, c), true);
  const again = await t.call({ op: 'login', passcode: made.passcode, app: 'stock' });
  assert.deepEqual(again.data.ai, { n: 3, per: 'day', left: 2, until: T0 + 7 * DAY });
  // Its email taken off: none again (one account a person, never twice).
  await t.call({ op: 'mail-remove', qt: again.data.token });
  assert.equal(await aiSpend(t.env, t.deps, await t.ses(again.data.token)), 'level');
  // The week over: back to none.
  t.advance(8 * DAY);
  forgetAllow();
  const later = (await newPass(t.call, t.deps, 'stock')).data;
  assert.equal(await aiSpend(t.env, t.deps, await t.ses(later.token)), 'level');
});

test('one account’s own, and every account there is now (a level’s or all); taken off again', async () => {
  const t = setup();
  const a = (await newPass(t.call, t.deps, 'stock')).data;
  const b = (await newPass(t.call, t.deps, 'stock')).data;
  await t.level(b, 'full');
  const ca = await t.ses(a.token);
  const cb = await t.ses(b.token);
  const one = await t.admin('ai-grant', { wallet: ca.d.slice(0, 8), rule: { n: 1, per: 'total' } });
  assert.equal(one.ai.n, 1);
  assert.equal(await aiSpend(t.env, t.deps, ca), true, 'a 基本 account given its own');
  assert.equal(await aiSpend(t.env, t.deps, ca), 'used');
  const all = await t.admin('ai-grant-all', { who: 'full', rule: { n: 1, per: 'day' } });
  assert.equal(all.changed, 1, 'only the 完整 one');
  assert.equal(await aiSpend(t.env, t.deps, cb), true);
  assert.equal(await aiSpend(t.env, t.deps, cb), 'used');
  const view = await t.admin('wallet', { wallet: cb.d.slice(0, 8) });
  assert.equal(view.ai.own.n, 1);
  assert.equal(view.ai.left, 0);
  assert.deepEqual((await t.admin('ai-allow')).own, { free: 1, full: 1 });
  assert.equal((await t.admin('ai-grant-all', { who: 'all', rule: null })).changed, 2);
  assert.equal(await aiSpend(t.env, t.deps, cb), true, 'its level’s again (50 a day)');
  assert.equal(await aiSpend(t.env, t.deps, ca), 'level');
  // A later account follows its level, not what was given to those there then.
  await t.admin('ai-grant-all', { who: 'all', rule: { n: 7, per: 'day' } });
  const c = (await newPass(t.call, t.deps, 'stock')).data;
  assert.equal(await aiSpend(t.env, t.deps, await t.ses(c.token)), 'level');
  assert.equal((await t.admin('ai-grant', { wallet: 'nobody00', rule: { n: 1 } })).error?.code, 'ECO_PAIR_NOT_FOUND');
  assert.equal((await t.call({ op: 'admin', token: 'o'.repeat(40), action: 'ai-allow-set', level: 'gold', rule: null })).status, 400);
});
