// A pass's level (eco.js levelOf, Jay 2026-11-14): a pass anyone makes is
// 'free' and never starts anything that costs money; one the owner issues is
// 'full'. Nothing a phone sends lifts it: not a patch, a rotate, a merge,
// a forged or stale token, or a call straight to an AI route.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { handleEcoRequest, fullSession, levelOf, stampLevels, WALLET_COLLECTION } from '../eco.js';
import { mintPass } from '../gift.js';
import { signToken, readToken } from '../orbit-token.js';
import { fakeD1 } from './fake-d1.mjs';
import { SCHEMA } from '../doc-store.js';
import worker from '../worker.js';

function setup({ dayCount = null } = {}) {
  const store = new Map();
  let clock = 1_700_000_000_000;
  let n = 0;
  let codeN = 0;
  const key = (c, id) => `${c}/${id}`;
  const deps = {
    json: (data, status) => ({ status, data }),
    errorJson: (code, status) => ({ status, data: { error: { code } } }),
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
    now: () => (clock += 1000),
    ...(dayCount ? { dayCount } : {})
  };
  const env = { STORE: {}, ECO_TOKEN_SECRET: 'test-secret', PASS_MAIL: 'on', ECO_ADMIN_TOKEN: 'o'.repeat(40) };
  const call = body => handleEcoRequest({ method: 'POST', url: 'https://w/eco', body }, env, {}, '1.1.1.1', deps);
  const admin = (action, extra = {}) => call({ op: 'admin', token: 'o'.repeat(40), action, ...extra });
  const walletOf = async qt => {
    const c = await readToken('test-secret', qt, 'ses', 0);
    return JSON.parse(store.get(key(WALLET_COLLECTION, c.d)).payload);
  };
  const may = async qt => fullSession(env, deps, await readToken('test-secret', qt, 'ses', 0));
  return { store, deps, env, call, admin, walletOf, may };
}
const signedIn = async (t, code) => {
  const r = await t.call({ op: 'login', passcode: code, app: 'stock' });
  assert.equal(r.status, 200);
  if (!r.data.fresh) return r.data;
  const rot = await t.call({ op: 'rotate', qt: r.data.token });
  assert.equal(rot.status, 200);
  return rot.data;
};

test("a pass made in an app is 'free': said so on sign-in, and it may not spend", async () => {
  const t = setup();
  const made = await t.call({ op: 'create', app: 'stock' });
  assert.equal(made.status, 200);
  assert.equal(made.data.level, 'free');
  assert.equal(levelOf(await t.walletOf(made.data.token)), 'free');
  assert.equal(await t.may(made.data.token), false);
});

test("a pass the owner issues is 'full', and stays so through its first sign-in's replacement (priority too)", async () => {
  const t = setup();
  const code = (await t.admin('issue', { count: 1 })).data.passes[0];
  const first = await t.call({ op: 'login', passcode: code, app: 'stock' });
  assert.equal(first.data.fresh, true);
  const ref = (await t.admin('wallets')).data.wallets[0].ref;
  await t.admin('priority', { wallet: ref, on: true });
  const mine = await t.call({ op: 'rotate', qt: first.data.token });
  assert.equal(mine.data.level, 'full');
  assert.equal(await t.may(mine.data.token), true);
  const w = await t.walletOf(mine.data.token);
  assert.equal(w.sec.priority, true);
  assert.equal(w.sec.fresh, undefined);
});

test("a giveaway's pass (/key/) is 'free'", async () => {
  const t = setup();
  const { docId } = await mintPass(t.env, t.deps, { gift: true });
  assert.equal(levelOf(JSON.parse(t.store.get(`${WALLET_COLLECTION}/${docId}`).payload)), 'free');
});

test('nothing a phone sends lifts it: a wallet patch carrying sec or a level', async () => {
  const t = setup();
  const made = (await t.call({ op: 'create', app: 'stock' })).data;
  const r = await handleEcoRequest({ method: 'PATCH', url: `https://w/eco?qt=${encodeURIComponent(made.token)}&app=stock`, body: { wallet: { sec: { level: 'full', priority: true }, level: 'full', created: 1 } } }, t.env, {}, '1.1.1.1', t.deps);
  assert.equal(r.status, 200);
  const w = await t.walletOf(made.token);
  assert.equal(levelOf(w), 'free');
  assert.equal(w.sec.priority, undefined);
  assert.equal(await t.may(made.token), false);
});

test("a forged, another account's or signed-out token may not spend; nor the Worker's own read sessions", async () => {
  const t = setup();
  const code = (await t.admin('issue', { count: 1 })).data.passes[0];
  const full = await signedIn(t, code);
  assert.equal(await t.may(full.token), true);
  const c = await readToken('test-secret', full.token, 'ses', 0);
  assert.equal(await fullSession(t.env, t.deps, { ...c, d: 'someone-else' }), false);
  assert.equal(await fullSession(t.env, t.deps, { k: 'ses', d: 'worker', s: 'worker:stock' }), false);
  assert.equal(await fullSession(t.env, t.deps, { k: 'ses', d: 'ops-shots', s: 'x' }), false);
  assert.equal(await fullSession(t.env, t.deps, { k: 'ses', d: 'ops-shots', s: 'ops-shots' }), true);
  assert.equal(await fullSession(t.env, t.deps, null), false);
  // Every device signed out: its old token may no longer.
  await t.call({ op: 'signout-all', qt: full.token });
  assert.equal(await fullSession(t.env, t.deps, c), false);
});

test("the panel sets it, and it holds at the next ask (no new sign-in)", async () => {
  const t = setup();
  const made = (await t.call({ op: 'create', app: 'stock' })).data;
  const ref = (await t.admin('wallets')).data.wallets[0].ref;
  assert.equal((await t.admin('wallets')).data.wallets[0].level, 'free');
  assert.equal((await t.admin('level', { wallet: ref, level: 'full' })).data.level, 'full');
  assert.equal(await t.may(made.token), true);
  assert.equal((await t.admin('wallet', { wallet: ref })).data.level, 'full');
  assert.equal((await t.admin('level', { wallet: ref, level: 'free' })).data.level, 'free');
  assert.equal(await t.may(made.token), false);
  assert.equal((await t.admin('level', { wallet: ref, level: 'gold' })).status, 400);
  assert.equal((await t.call({ op: 'admin', token: 'x'.repeat(40), action: 'level', wallet: ref, level: 'full' })).status, 403);
});

test("a merge keeps the higher level of the passes brought together (all the same person's)", async () => {
  const t = setup();
  const free = (await t.call({ op: 'create', app: 'stock' })).data;
  const code = (await t.admin('issue', { count: 1 })).data.passes[0];
  const r = await t.call({ op: 'merge', qt: free.token, sources: [{ passcode: code }] });
  assert.equal(r.status, 200);
  assert.equal(await t.may(free.token), true);
  // …and a free pass merged into a full one never lowers it.
  const t2 = setup();
  const code2 = (await t2.admin('issue', { count: 1 })).data.passes[0];
  const full = await signedIn(t2, code2);
  const other = (await t2.call({ op: 'create', app: 'stock' })).data;
  assert.equal((await t2.call({ op: 'merge', qt: full.token, sources: [{ passcode: other.passcode }] })).status, 200);
  assert.equal(await t2.may(full.token), true);
});

test('making passes stops at the day the panel set, everyone together', async () => {
  let n = 0;
  const t = setup({ dayCount: async () => ++n });
  await t.deps.fsWrite(t.env, 'orbit-config', 'dev', JSON.stringify({ passNewDay: 2 }));
  assert.equal((await t.call({ op: 'create', app: 'stock' })).status, 200);
  assert.equal((await t.call({ op: 'create', app: 'stock' })).status, 200);
  const third = await t.call({ op: 'create', app: 'stock' });
  assert.equal(third.status, 429);
  assert.equal(third.data.error.code, 'ECO_CREATE_FULL');
});

test("levels began with every standing account 'full' but the giveaway's; again, it changes nothing", async () => {
  const db = fakeD1(SCHEMA);
  const put = (id, w) => db.prepare('INSERT INTO docs (coll, id, payload, updated) VALUES (?1, ?2, ?3, ?4)').bind(WALLET_COLLECTION, id, JSON.stringify({ v: 1, entries: [], ...w }), 'old').run();
  await put('a', {});
  await put('b', { sec: { gen: 2, priority: true } });
  await put('g', { gift: 5 });
  await put('f', { sec: { level: 'free' } });
  const env = { STORE: db };
  assert.deepEqual(await stampLevels(env, { dry: true }), { full: 2, giveawayFree: 1, dry: true });
  assert.equal((await stampLevels(env)).full, 2);
  const read = async id => JSON.parse((await db.prepare('SELECT payload FROM docs WHERE id = ?1').bind(id).first()).payload);
  assert.deepEqual((await read('b')).sec, { gen: 2, priority: true, level: 'full' });
  assert.equal(levelOf(await read('a')), 'full');
  assert.equal(levelOf(await read('g')), 'free');
  assert.equal(levelOf(await read('f')), 'free');
  assert.equal((await stampLevels(env)).full, 0);
});

// The routes themselves, as a phone calls them: a 'free' pass is refused before anything is asked.
test("every AI route refuses a 'free' pass before any model is asked; a 'full' one goes on", async () => {
  const db = fakeD1(SCHEMA);
  const put = (id, level) => db.prepare('INSERT INTO docs (coll, id, payload, updated) VALUES (?1, ?2, ?3, ?4)').bind(WALLET_COLLECTION, id, JSON.stringify({ v: 1, created: 1, entries: [], sec: { level } }), 'v1').run();
  await put('freeacct', 'free');
  await put('fullacct', 'full');
  let asked = 0;
  const env = { ECO_TOKEN_SECRET: 'lv-secret', STORE: db, GEMINI_API_KEY: 'k', ANTHROPIC_API_KEY: 'a', OPENAI_API_KEY: 'o', GEMINI_RELAY: { fetch: async () => (asked++, new Response('{}', { status: 500 })) } };
  const ctx = { waitUntil() {}, passThroughOnException() {} };
  const qt = (d, a) => signToken('lv-secret', { k: 'ses', d, a, s: `s-${d}-${a}`, e: Date.now() + 600_000 });
  const post = async (path, d, a, body) =>
    worker.fetch(new Request(`https://api.jaypengx.com${path}?qt=${encodeURIComponent(await qt(d, a))}`, { method: 'POST', headers: { Origin: 'https://orbit.jaypengx.com', 'Content-Type': 'application/json', 'CF-Connecting-IP': '9.9.9.8' }, body: JSON.stringify(body) }), env, ctx);
  const say = { feature: 'money-say', input: { text: '午餐一百二', today: '2026-11-14', cats: [{ id: 'c1', name: '餐飲', k: 'out' }] } };
  const cases = [
    ['/ai', 'money', say, 'level'],
    ['/law-chat', 'law', { q: '房東不還押金怎麼辦？', lang: 'zh' }, 'level'],
    ['/law-ask', 'law', { law: 'B0000001', arts: ['1'], lang: 'zh' }, 'level'],
    ['/money-read', 'money', { image: { mime_type: 'image/jpeg', data: 'AAAA' } }, 'level'],
    ['/gemini', 'orbit', { model: 'gemini-x' }, null],
    ['/nl-edit', 'orbit', { text: '把星期一第一節改成數學' }, null]
  ];
  for (const [path, app, body, err] of cases) {
    const r = await post(path, 'freeacct', app, body);
    assert.equal(r.status, 403, path);
    const j = await r.json();
    if (err) assert.equal(j.error, err, path);
    else assert.equal(j.error.code, 'PASS_LEVEL', path);
  }
  assert.equal(asked, 0, 'no model was asked for a free pass');
  // A full pass gets past the gate (whatever the handler then says, never the level).
  for (const [path, app, body] of cases) {
    const r = await post(path, 'fullacct', app, body);
    const j = await r.json().catch(() => ({}));
    assert.notEqual(j.error, 'level', path);
    assert.notEqual(j.error?.code, 'PASS_LEVEL', path);
  }
});
