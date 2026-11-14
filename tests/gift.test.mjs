// The public giveaway (gift.js): one pass a device, the owner's count and times, never-used passes back to the pool.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { fakeD1 } from './fake-d1.mjs';
import { docStore, SCHEMA } from '../doc-store.js';
import { handleGift } from '../gift.js';
import { handleEcoRequest, WALLET_COLLECTION, ECO_APPS } from '../eco.js';

function setup() {
  let clock = 1_800_000_000_000;
  let codeN = 0;
  const DOCS = docStore({ keep: new Set([WALLET_COLLECTION, ...Object.values(ECO_APPS).map(a => a.collection)]) });
  const deps = {
    json: (data, status) => ({ status, data }),
    errorJson: (code, status) => ({ status, data: { error: { code } } }),
    readJsonBody: req => Promise.resolve(req.body),
    rateLimitResponse: async () => null,
    fsGet: DOCS.get, fsWrite: DOCS.write, fsDelete: DOCS.delete, fsList: DOCS.list, fsCollections: DOCS.collections, fsBatch: DOCS.batch, store: DOCS,
    sha256Hex: async text => createHash('sha256').update(text).digest('hex'),
    generateCode: len => {
      codeN++;
      const a = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
      return Array.from({ length: len }, (_, i) => a[(codeN * 7 + i * 11 + codeN * i) % 32]).join('');
    },
    now: () => (clock += 1000)
  };
  const env = { STORE: fakeD1(SCHEMA), ECO_TOKEN_SECRET: 'test-secret', ECO_ADMIN_TOKEN: 'o'.repeat(40) };
  const admin = (action, extra = {}) => handleEcoRequest({ method: 'POST', url: 'https://w/eco', body: { op: 'admin', token: 'o'.repeat(40), action, ...extra } }, env, {}, '1.1.1.1', deps).then(r => r.data);
  const eco = (body, query = '') => handleEcoRequest({ method: 'POST', url: `https://w/eco${query}`, body }, env, {}, '1.1.1.1', deps);
  // A browser: its own cookies, its own address.
  const device = (ip = '1.2.3.4', origin = 'https://orbit.jaypengx.com') => {
    const jar = new Map();
    return async (method = 'GET', body) => {
      const request = new Request('https://orbit.jaypengx.com/gift', { method, headers: { Cookie: [...jar].map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('; ') }, ...(body ? { body: JSON.stringify(body) } : {}) });
      const res = await handleGift(request, env, {}, { ip, origin, deps });
      for (const c of res.headers.getSetCookie()) {
        const [kv] = c.split(';');
        jar.set(kv.slice(0, kv.indexOf('=')), decodeURIComponent(kv.slice(kv.indexOf('=') + 1)));
      }
      return { status: res.status, data: await res.json() };
    };
  };
  return { env, deps, admin, eco, device, advance: ms => (clock += ms), now: () => clock };
}

test('off until the owner turns it on; one pass a device, the same one shown again; the count runs out', async () => {
  const t = setup();
  const a = t.device();
  assert.equal((await a()).data.state, 'off');
  assert.equal((await a('POST', { op: 'claim' })).status, 409);
  await t.admin('gift-set', { live: true, total: 2 });
  const seen = await a();
  assert.equal(seen.data.state, 'open');
  assert.equal(seen.data.left, 2);
  assert.equal(seen.data.mine, null);
  const got = await a('POST', { op: 'claim' });
  assert.equal(got.status, 200);
  assert.match(got.data.mine.code, /^[2-9A-HJ-NP-Z]{10}$/);
  assert.equal(got.data.left, 1);
  // Again, and reopened: the same pass, no second one.
  assert.equal((await a('POST', { op: 'claim' })).data.mine.code, got.data.mine.code);
  assert.equal((await a()).data.mine.code, got.data.mine.code);
  assert.equal((await a()).data.left, 1);
  const b = t.device('5.6.7.8');
  await b();
  assert.equal((await b('POST', { op: 'claim' })).status, 200);
  const c = t.device('9.9.9.9');
  await c();
  const none = await c('POST', { op: 'claim' });
  assert.equal(none.status, 409);
  assert.equal(none.data.state, 'gone');
  const v = (await t.admin('gift')).gift;
  assert.equal(v.claimed, 2);
  assert.equal(v.left, 0);
});

test('the claimed pass signs in fresh (replaced first), straight from the page by a hand-off', async () => {
  const t = setup();
  await t.admin('gift-set', { live: true, total: 5 });
  const a = t.device();
  await a();
  const { code } = (await a('POST', { op: 'claim' })).data.mine;
  const go = await a('POST', { op: 'go' });
  assert.equal(go.status, 200);
  const signed = await t.eco({ op: 'redeem', handoff: go.data.handoff, app: 'match' });
  assert.equal(signed.status, 200);
  assert.equal(signed.data.fresh, true);
  assert.equal((await a()).data.mine.state, 'started');
  // Its own pass now: the page shows no code, and no hand-off.
  const rot = await t.eco({ op: 'rotate', qt: signed.data.token });
  assert.equal(rot.status, 200);
  const after = (await a()).data.mine;
  assert.equal(after.state, 'done');
  assert.equal(after.code, undefined);
  assert.equal((await a('POST', { op: 'go' })).status, 409);
  const v = (await t.admin('gift')).gift;
  assert.equal(v.done, 1);
  assert.ok(code);
});

test('a pass nobody signed in with comes back to the pool after the hold; one used stays', async () => {
  const t = setup();
  await t.admin('gift-set', { live: true, total: 2, hold: 1 });
  const a = t.device('1.1.1.1');
  const b = t.device('2.2.2.2');
  await a();
  await b();
  const lost = (await a('POST', { op: 'claim' })).data.mine.code;
  await b('POST', { op: 'claim' });
  // b signs in and sets its own pass; c signs in and leaves it at 先換掉 (a fresh session opens no app).
  const c = t.device('3.3.3.3');
  await c();
  await t.admin('gift-set', { total: 3 });
  await c('POST', { op: 'claim' });
  const inB = await t.eco({ op: 'login', passcode: (await b()).data.mine.code, app: 'law' });
  assert.equal((await t.eco({ op: 'rotate', qt: inB.data.token })).status, 200);
  assert.equal((await t.eco({ op: 'login', passcode: (await c()).data.mine.code, app: 'law' })).data.fresh, true);
  t.advance(2 * 3_600_000);
  const v = (await t.admin('gift')).gift;
  assert.equal(v.claimed, 1);
  assert.equal(v.back, 2);
  assert.equal(v.left, 2);
  // The pass taken back no longer signs in; its device may claim again.
  assert.equal((await t.eco({ op: 'login', passcode: lost, app: 'law' })).status, 404);
  assert.equal((await a()).data.mine, null);
  assert.equal((await a('POST', { op: 'claim' })).status, 200);
});

test('times: soon before it opens, over after it closes; a network at most `rate` a minute; other sites refused', async () => {
  const t = setup();
  const now = t.now();
  await t.admin('gift-set', { live: true, total: 100, opens: now + 60_000, closes: now + 3_600_000, rate: 2 });
  const a = t.device('7.7.7.1');
  assert.equal((await a()).data.state, 'soon');
  assert.equal((await a('POST', { op: 'claim' })).status, 409);
  t.advance(120_000);
  for (const ip of ['7.7.7.1', '7.7.7.2']) {
    const d = ip === '7.7.7.1' ? a : t.device(ip);
    await d();
    assert.equal((await d('POST', { op: 'claim' })).status, 200);
  }
  const third = t.device('7.7.7.3');
  await third();
  assert.equal((await third('POST', { op: 'claim' })).status, 429);
  t.advance(61_000);
  assert.equal((await third('POST', { op: 'claim' })).status, 200);
  t.advance(3_600_000);
  assert.equal((await t.device('8.8.8.8')()).data.state, 'over');
  assert.equal((await t.device('8.8.8.8', 'https://evil.example')()).status, 403);
  assert.equal((await t.admin('gift-set', { opens: now + 10, closes: now })).error?.code, 'GIFT_TIMES');
  // An empty field leaves its setting as it was (never 0).
  const kept = (await t.admin('gift-set', { total: '', rate: '', hold: '' })).gift;
  assert.equal(kept.total, 100);
  assert.equal(kept.rate, 2);
});

test('a new round counts afresh and lets each device claim once more', async () => {
  const t = setup();
  await t.admin('gift-set', { live: true, total: 1 });
  const a = t.device();
  await a();
  const first = (await a('POST', { op: 'claim' })).data.mine.code;
  const v = (await t.admin('gift-round')).gift;
  assert.equal(v.claimed, 0);
  assert.equal(v.round, 2);
  assert.equal((await a()).data.mine, null);
  const second = (await a('POST', { op: 'claim' })).data.mine.code;
  assert.notEqual(second, first);
});

test('empty giveaway accounts are cleared only when the owner turns it on, after the days set; real use, passkeys and hand-issued passes stay', async () => {
  const t = setup();
  await t.admin('gift-set', { live: true, total: 10 });
  const own = async ip => {
    const d = t.device(ip);
    await d();
    const code = (await d('POST', { op: 'claim' })).data.mine.code;
    const signed = await t.eco({ op: 'login', passcode: code, app: 'law' });
    const rot = await t.eco({ op: 'rotate', qt: signed.data.token });
    assert.equal(rot.status, 200);
    return rot.data;
  };
  const idle = await own('1.0.0.1');
  const busy = await own('1.0.0.2');
  // busy keeps real data: more than settings.
  assert.equal((await t.eco({ op: 'write', qt: busy.token, payload: JSON.stringify({ notes: 'x'.repeat(3000) }) }, '?app=law')).status, 200);
  // A pass the owner issued by hand, never used since: never the cleaner's.
  const [issued] = (await t.admin('issue', { count: 1 })).passes;
  const byHand = await t.eco({ op: 'login', passcode: issued, app: 'law' });
  await t.eco({ op: 'rotate', qt: byHand.data.token });
  t.advance(40 * 86_400_000);
  let v = await t.admin('gift');
  assert.equal(v.empty.on, false);
  assert.equal(v.empty.count, 1);
  // Off: the night clears nothing.
  const { giftNight } = await import('../gift.js');
  assert.equal((await giftNight(t.env, t.deps)).cleared, 0);
  await t.admin('gift-clean-set', { clean: true, days: 30 });
  assert.equal((await giftNight(t.env, t.deps)).cleared, 1);
  assert.equal((await t.eco({ op: 'login', passcode: idle.passcode, app: 'law' })).status, 404);
  assert.equal((await t.eco({ op: 'login', passcode: busy.passcode, app: 'law' })).status, 200);
  v = await t.admin('gift');
  assert.equal(v.empty.count, 0);
  // Days below 7 aren't taken.
  assert.equal((await t.admin('gift-clean-set', { days: 1 })).empty.days, 7);
});

test("a round's passes are 'free' unless the owner set the round 'full' (eco.js levelOf)", async () => {
  const t = setup();
  await t.admin('gift-set', { live: true, total: 5 });
  assert.equal((await t.admin('gift')).gift.full, false);
  const a = t.device('1.1.1.1');
  await a();
  const free = (await a('POST', { op: 'claim' })).data.mine.code;
  const lv = async code => (await t.eco({ op: 'login', passcode: code, app: 'stock' })).data;
  assert.equal((await lv(free)).fresh, true);
  const one = async code => {
    const signed = await lv(code);
    return (await t.eco({ op: 'rotate', qt: signed.token })).data.level;
  };
  assert.equal(await one(free), 'free');
  assert.equal((await t.admin('gift-set', { full: true })).gift.full, true);
  const b = t.device('2.2.2.2');
  await b();
  assert.equal(await one((await b('POST', { op: 'claim' })).data.mine.code), 'full');
  // (Left as it was when the form sends the rest only.)
  assert.equal((await t.admin('gift-set', { total: 6 })).gift.full, true);
});
