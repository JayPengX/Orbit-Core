// Orbit Law's /law-ask: a Pass of Orbit Law's, a law's articles read here,
// Gemini's answer checked against them, kept by the law's version, and a
// Pass's day capped.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fakeD1 } from './fake-d1.mjs';

const LAW = { p: 'B0000001', n: '民法', m: '20250101', a: [['C', '第一章', '法例'], ['A', '1', '民事，法律所未規定者，依習慣。'], ['A', '15', '受監護宣告之人，無行為能力。'], ['A', '15-1', '對於因精神障礙…得因本人…之聲請，為輔助之宣告。']] };
// A bill as 立法院's API has it: its 對照表 (one row whose article can't be told).
const BILL = {
  議案名稱: '「民法部分條文修正草案」，請審議案。',
  '提案單位/提案委員': '本院委員甲等16人',
  案由: '為保障承租人，擬具「民法部分條文修正草案」。',
  對照表: [{ law_name: '民法', rows: [{ 修正: '第十五條之一　對於因精神障礙…得因本人之聲請，為輔助之宣告。', 現行: '第十五條之一　對於因精神障礙…為輔助之宣告。', 說明: '放寬聲請人。' }, { 增訂: '第四百二十一條之一　押金不得超過二個月租金。', 說明: '明定押金上限。' }, { 說明: '條次調整。' }] }]
};
const bills = [];
let billStatus = 200;
// An amendment as Orbit Law's build writes it.
const DIFF = { p: 'B0000001', m: '20260817', was: '20250101', arts: { 15: ['受監護宣告之人，無行為能力。', '受監護宣告之人，無行為能力；但…'], '15-3': [null, '新增之條文。'], 16: ['舊的。', null] } };
let diffStatus = 200;
const laws = [];
const gemini = [];
let reply = { answer: '輔助宣告由法院為之。', points: [{ text: '可聲請輔助宣告', cites: ['第15條之1'] }, { text: '外部條文', cites: ['16'] }, { text: '沒有出處', cites: [] }], covered: true };
let geminiStatus = 200;
globalThis.fetch = async (url, init) => {
  const u = String(url);
  if (u.includes('generativelanguage')) {
    gemini.push(JSON.parse(init.body));
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(reply) }] } }] }), { status: geminiStatus, headers: { 'Content-Type': 'application/json' } });
  }
  if (u.startsWith('https://v2.ly.govapi.tw/bill/')) {
    bills.push({ u, init });
    if (billStatus !== 200) return new Response('', { status: billStatus });
    const id = u.split('/').pop();
    if (id === '202110000010000') return new Response(JSON.stringify({ error: false, data: BILL }));
    if (id === '202110000020000') return new Response(JSON.stringify({ error: false, data: { 議案名稱: '預算案', 對照表: [] } }));
    return new Response(JSON.stringify({ error: true, message: 'not found' }), { status: 404 });
  }
  if (u === 'https://jaypengx.github.io/Orbit-Law/data/diff/B0000001.json') return diffStatus === 200 ? new Response(JSON.stringify(DIFF)) : new Response('', { status: diffStatus });
  if (u === 'https://jaypengx.github.io/Orbit-Law/data/index.json') return new Response(JSON.stringify({ laws: [['B0000001', '民法', '法律', '', '20250101', 0, 'Civil Code', 4]] }));
  if (u === 'https://jaypengx.github.io/Orbit-Law/data/orders.json') return new Response(JSON.stringify({ laws: [] }));
  if (u.startsWith('https://jaypengx.github.io/Orbit-Law/data/diff/')) return new Response('', { status: 404 });
  if (u.startsWith('https://jaypengx.github.io/Orbit-Law/data/law/')) {
    laws.push({ u, init });
    return u.endsWith('/B0000001.json') ? new Response(JSON.stringify(LAW), { status: 200 }) : new Response('', { status: 404 });
  }
  throw new Error(`unexpected fetch ${u}`);
};
const worker = (await import('../worker.js')).default;
const { LAW_LIMITS, checkAnswer, citeKey, readAsk, forgetLawCounts, rowKey, checkBill } = await import('../law.js');
const { signToken } = await import('../quadra-token.js');
const ctx = { waitUntil: p => p };

function fakeKV() {
  const m = new Map();
  return { m, get: async (k, o) => (m.has(k) ? (o?.type === 'json' ? JSON.parse(m.get(k)) : m.get(k)) : null), put: async (k, v) => void m.set(k, v) };
}
const envOf = () => ({ GEMINI_API_KEY: 'k', ECO_TOKEN_SECRET: 'test-secret', STORE: fakeD1(), RATE_LIMIT_KV: fakeKV() });
// A session of the Pass `pass` in the app `a`, as the kit sends it (`qt=`).
const qtOf = (pass, { a = 'law', e = Date.now() + 600_000 } = {}) => signToken('test-secret', { k: 'ses', d: pass, s: `s-${pass}`, a, e });
let passN = 0;
const ask = async (body, { origin = 'https://jaypengx.github.io', pass = `acct${++passN}`, qt, ip = '198.51.100.1', env = envOf() } = {}) => {
  const token = qt === undefined ? await qtOf(pass) : qt;
  const url = `https://proxy.test/law-ask?v=1${token ? `&qt=${encodeURIComponent(token)}` : ''}`;
  return worker.fetch(new Request(url, { method: 'POST', headers: { Origin: origin, 'CF-Connecting-IP': ip, 'Content-Type': 'text/plain' }, body: typeof body === 'string' ? body : JSON.stringify(body) }), env, ctx);
};
const OK = { p: 'B0000001', arts: ['15-1', '15'], q: '誰可以聲請輔助宣告？', lang: 'zh' };

test('no Pass of Orbit Law\'s is a 401 {error:"pass"}, before anything is read or asked', async () => {
  const before = [laws.length, gemini.length];
  for (const qt of [null, await qtOf('x', { a: 'stock' }), await qtOf('x', { e: Date.now() - 1 }), 'forged.token']) {
    const r = await ask(OK, { qt });
    assert.equal(r.status, 401);
    assert.deepEqual(await r.json(), { error: 'pass' });
  }
  assert.deepEqual([laws.length, gemini.length], before);
});

test('the ask is checked before anything is read', async () => {
  for (const bad of [{ ...OK, p: 'b0000001' }, { ...OK, p: 'B000001' }, { ...OK, arts: [] }, { ...OK, arts: Array.from({ length: 9 }, (_, i) => String(i + 1)) }, { ...OK, arts: ['15之1'] }, { ...OK, lang: 'jp' }, { ...OK, q: 'x'.repeat(301) }, { ...OK, q: 5 }]) {
    assert.equal(typeof readAsk(bad), 'string', JSON.stringify(bad));
  }
  assert.deepEqual(readAsk({ p: 'B0000001', arts: ['15', '15'], q: '  a \n b ' }), { mode: 'ask', p: 'B0000001', arts: ['15'], q: 'a b', lang: 'zh' });
  assert.equal(readAsk({ ...OK, mode: 'poem' }), 'mode');
  const before = laws.length;
  const r = await ask({ ...OK, p: 'nope' });
  assert.equal(r.status, 400);
  assert.equal(r.headers.get('Access-Control-Allow-Origin'), 'https://jaypengx.github.io');
  assert.equal((await ask('{not json')).status, 400);
  assert.equal((await ask({ ...OK, q: 'x'.repeat(5000) })).status, 413);
  assert.equal((await ask(OK, { origin: 'https://evil.example' })).status, 403);
  assert.equal(laws.length, before);
});

test('articles the law does not have are a 400; a law not there a 404', async () => {
  const before = gemini.length;
  assert.equal((await ask({ ...OK, arts: ['99', '2'] })).status, 400);
  // (A chapter heading's key is not an article.)
  assert.equal((await ask({ ...OK, arts: ['1-9'] })).status, 400);
  assert.equal((await ask({ ...OK, p: 'Z9999999' })).status, 404);
  assert.equal(gemini.length, before);
});

test('only the given articles reach Gemini, read from Orbit Law a day at the edge', async () => {
  const r = await ask({ ...OK, arts: ['15-1', '42'] }, { origin: 'http://localhost:8123' });
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('Access-Control-Allow-Origin'), 'http://localhost:8123');
  const sent = gemini.at(-1);
  const prompt = sent.contents[0].parts[0].text;
  assert.match(prompt, /第15條之1/);
  assert.match(prompt, /為輔助之宣告/);
  assert.doesNotMatch(prompt, /無行為能力/);
  assert.equal(sent.generationConfig.temperature, 0);
  assert.deepEqual(Object.keys(sent.generationConfig.response_schema.properties), ['answer', 'points', 'covered']);
  assert.deepEqual(laws.at(-1).init.cf.cacheTtlByStatus, { '200-299': 86_400, 404: 60, '500-599': 0 });
  assert.ok(laws.at(-1).init.signal);
});

test('a point citing an article not given, or nothing, is dropped', async () => {
  const r = await ask(OK);
  const j = await r.json();
  assert.deepEqual(j.points, [{ text: '可聲請輔助宣告', cites: ['15-1'] }]);
  assert.equal(j.covered, true);
  assert.deepEqual(j.law, { p: 'B0000001', n: '民法', m: '20250101' });
  assert.equal(j.cached, false);
  assert.equal(j.left, LAW_LIMITS.perPass - 1);
  // No point left: not covered, whatever the model said.
  assert.deepEqual(checkAnswer({ answer: 'x', points: [{ text: 'y', cites: ['16'] }], covered: true }, ['15']), { answer: 'x', points: [], covered: false });
  assert.deepEqual(checkAnswer({ answer: 'x', points: [{ text: 'y', cites: ['15', '第16條'] }], covered: true }, ['15', '16']).points[0].cites, ['15', '16']);
  for (const [c, k] of [['第15條之1', '15-1'], ['Article 15-1', '15-1'], ['第 15 條', '15'], ['15', '15']]) assert.equal(citeKey(c), k);
});

test('the same ask again is kept and free; a new version of the law asks again', async () => {
  const env = envOf();
  const pass = 'kept';
  const first = await (await ask({ ...OK, q: '誰可以 聲請？' }, { env, pass })).json();
  const calls = gemini.length;
  const again = await (await ask({ ...OK, arts: ['15', '15-1'], q: ' 誰可以   聲請？ ' }, { env, pass })).json();
  assert.equal(gemini.length, calls);
  assert.equal(again.cached, true);
  assert.equal(again.left, first.left);
  assert.deepEqual(again.points, first.points);
  LAW.m = '20260101';
  try {
    const fresh = await (await ask({ ...OK, q: '誰可以 聲請？' }, { env, pass })).json();
    assert.equal(fresh.cached, false);
    assert.equal(gemini.length, calls + 1);
    assert.equal(fresh.left, first.left - 1);
  } finally {
    LAW.m = '20250101';
  }
});

test('a Pass past 40 calls a day, or the day past 300, is a 429 {error:"cap", left:0}; kept answers still come; counted per Pass, not per address', async () => {
  forgetLawCounts();
  const env = envOf();
  const day = new Date(Date.now() + 8 * 3_600_000).toISOString().slice(0, 10);
  // A cached answer first (another address, the same Pass: the same count),
  // then the Pass's count at the cap.
  const pass = 'capped';
  assert.equal((await ask(OK, { env, pass, ip: '203.0.113.29' })).status, 200);
  assert.equal((await (await ask({ ...OK, q: 'two' }, { env, pass, ip: '203.0.113.30' })).json()).left, LAW_LIMITS.perPass - 2);
  await env.STORE.prepare("UPDATE law_day SET n = ?1 WHERE k LIKE '%|ask:%'").bind(LAW_LIMITS.perPass).run();
  const before = gemini.length;
  const capped = await ask({ ...OK, q: 'another' }, { env, pass });
  assert.equal(capped.status, 429);
  assert.deepEqual(await capped.json(), { error: 'cap', left: 0 });
  assert.equal(capped.headers.get('Access-Control-Allow-Origin'), 'https://jaypengx.github.io');
  const hit = await ask(OK, { env, pass });
  assert.equal(hit.status, 200);
  assert.deepEqual([(await hit.clone().json()).cached, (await hit.json()).left], [true, 0]);
  // Another Pass on the same address has its own count…
  assert.equal((await ask({ ...OK, q: 'own' }, { env, pass: 'other', ip: '203.0.113.30' })).status, 200);
  // …until the day's in all is spent.
  await env.STORE.prepare('UPDATE law_day SET n = ?1 WHERE k = ?2').bind(LAW_LIMITS.perDay, `${day}|g`).run();
  const other = await ask({ ...OK, q: 'third' }, { env, pass: 'third' });
  assert.equal(other.status, 429);
  assert.equal(gemini.length, before + 1);
  // A capped Pass adds nothing to the day's count.
  const g = await env.STORE.prepare('SELECT n FROM law_day WHERE k = ?1').bind(`${day}|g`).first();
  assert.equal(g.n, LAW_LIMITS.perDay + 1);
});

test('the count is spent only on a real call; a store that fails turns the ask away', async () => {
  const env = envOf();
  const pass = 'spent';
  await ask(OK, { env, pass });
  for (let i = 0; i < 3; i++) assert.equal((await (await ask(OK, { env, pass })).json()).left, LAW_LIMITS.perPass - 1);
  const broken = { ...envOf(), STORE: { prepare: () => ({ bind: () => ({ first: async () => { throw new Error('d1'); }, run: async () => { throw new Error('d1'); } }), run: async () => { throw new Error('d1'); } }) } };
  const before = gemini.length;
  assert.equal((await ask(OK, { env: broken })).status, 429);
  assert.equal(gemini.length, before);
});

test('Gemini failing is a 502, nothing kept', async () => {
  const env = envOf();
  geminiStatus = 503;
  try {
    const r = await ask({ ...OK, q: 'down' }, { env });
    assert.equal(r.status, 502);
    assert.equal(env.RATE_LIMIT_KV.m.size, 0);
  } finally {
    geminiStatus = 200;
  }
});

// ---- mode 'bill' ----

const BILL_ASK = { mode: 'bill', bill: '202110000010000', lang: 'zh' };

test('a bill\'s 對照表 row tells its article', () => {
  for (const [t, k] of [['第十五條之一　對於', '15-1'], ['第 15 條 本法', '15'], ['第一百零五條', '105'], ['第二十條之十二', '20-12'], ['第十條', '10'], ['說明', ''], ['', '']]) assert.equal(rowKey(t), k, t);
  for (const bad of [{ mode: 'bill' }, { mode: 'bill', bill: '12' }, { mode: 'bill', bill: '2021/../x' }]) assert.equal(readAsk(bad), 'bill');
  assert.deepEqual(readAsk({ ...BILL_ASK, lang: 'en' }), { mode: 'bill', bill: '202110000010000', lang: 'en' });
});

test('a bill is explained from its own 對照表 only, each change citing an article the table has; kept 30 days by bill and language', async () => {
  const env = envOf();
  reply = { answer: '放寬聲請人並設押金上限。', changes: [{ text: '押金最多兩個月', article: '第421條之1' }, { text: '別的條文', article: '99' }, { text: '', article: '15-1' }], who: ['房客', '房東', '監護人', '法院', '第五'], covered: true };
  try {
    const r = await ask(BILL_ASK, { env, pass: 'bill' });
    assert.equal(r.status, 200);
    const j = await r.json();
    assert.deepEqual(j, { answer: '放寬聲請人並設押金上限。', changes: [{ text: '押金最多兩個月', article: '421-1' }], who: ['房客', '房東', '監護人', '法院'], covered: true, bill: { id: '202110000010000', n: '民法部分條文修正草案', by: '本院委員甲等16人' }, cached: false, left: LAW_LIMITS.perPass - 1 });
    const sent = gemini.at(-1);
    const prompt = sent.contents[0].parts[0].text;
    assert.match(prompt, /\[key "15-1"\]/);
    assert.match(prompt, /\[key "421-1"\]/);
    assert.match(prompt, /增訂: 第四百二十一條之一/);
    assert.match(prompt, /為保障承租人/);
    assert.deepEqual(Object.keys(sent.generationConfig.response_schema.properties), ['answer', 'changes', 'who', 'covered']);
    assert.deepEqual(bills.at(-1).init.cf.cacheTtlByStatus, { '200-299': 86_400, 404: 60, '500-599': 0 });
    const calls = gemini.length;
    const again = await (await ask(BILL_ASK, { env, pass: 'bill' })).json();
    assert.equal(gemini.length, calls);
    assert.deepEqual([again.cached, again.left, again.changes], [true, LAW_LIMITS.perPass - 1, j.changes]);
    assert.ok(env.RATE_LIMIT_KV.m.has('law:bill:v1:202110000010000|zh'));
    assert.equal((await (await ask({ ...BILL_ASK, lang: 'en' }, { env, pass: 'bill' })).json()).cached, false);
  } finally {
    reply = { answer: '輔助宣告由法院為之。', points: [{ text: '可聲請輔助宣告', cites: ['第15條之1'] }, { text: '外部條文', cites: ['16'] }, { text: '沒有出處', cites: [] }], covered: true };
  }
  assert.deepEqual(checkBill({ answer: 'x', changes: [{ text: 'y', article: '9' }], who: [], covered: true }, ['1']), { answer: 'x', changes: [], who: [], covered: false });
});

test('a bill not there, or with no 對照表, is a 404 {error:"bill"}; 立法院\'s API failing a 502; nothing asked', async () => {
  const before = gemini.length;
  for (const bill of ['202199999990000', '202110000020000']) {
    const r = await ask({ ...BILL_ASK, bill });
    assert.deepEqual([r.status, (await r.json()).error], [404, 'bill']);
  }
  billStatus = 500;
  try {
    assert.equal((await ask(BILL_ASK)).status, 502);
  } finally {
    billStatus = 200;
  }
  assert.equal(gemini.length, before);
});

// ---- mode 'diff' ----

const DIFF_ASK = { mode: 'diff', p: 'B0000001', arts: ['15', '15-3', '16', '99'], lang: 'zh' };

test('an amendment is explained from its before and after only, every point citing one of them; kept by the version, the articles and the language', async () => {
  assert.deepEqual(readAsk(DIFF_ASK), { mode: 'diff', p: 'B0000001', arts: ['15', '15-3', '16', '99'], lang: 'zh' });
  for (const bad of [{ ...DIFF_ASK, p: 'x' }, { ...DIFF_ASK, arts: [] }, { ...DIFF_ASK, arts: Array.from({ length: 9 }, (_, i) => String(i + 1)) }]) assert.equal(typeof readAsk(bad), 'string');
  const env = envOf();
  reply = { answer: '新增但書。', points: [{ text: '加了但書', cites: ['第15條'] }, { text: '刪了第16條', cites: ['16'] }, { text: '別的', cites: ['17'] }], covered: true };
  try {
    const r = await ask(DIFF_ASK, { env, pass: 'diff' });
    assert.equal(r.status, 200);
    const j = await r.json();
    assert.deepEqual(j, { answer: '新增但書。', points: [{ text: '加了但書', cites: ['15'] }, { text: '刪了第16條', cites: ['16'] }], covered: true, law: { p: 'B0000001', n: '民法', m: '20260817', was: '20250101' }, cached: false, left: LAW_LIMITS.perPass - 1 });
    const prompt = gemini.at(-1).contents[0].parts[0].text;
    assert.match(prompt, /\[key "15-3"\] 第15條之3\n修正前: \(無，新增條文\)\n修正後: 新增之條文。/);
    assert.match(prompt, /\[key "16"\] 第16條\n修正前: 舊的。\n修正後: \(刪除\)/);
    assert.doesNotMatch(prompt, /key "99"/);
    const calls = gemini.length;
    assert.equal((await (await ask({ ...DIFF_ASK, arts: ['16', '15-3', '15'] }, { env, pass: 'diff' })).json()).cached, true);
    assert.equal(gemini.length, calls);
    DIFF.m = '20261001';
    try {
      assert.equal((await (await ask(DIFF_ASK, { env, pass: 'diff' })).json()).cached, false);
    } finally {
      DIFF.m = '20260817';
    }
  } finally {
    reply = { answer: '輔助宣告由法院為之。', points: [{ text: '可聲請輔助宣告', cites: ['第15條之1'] }, { text: '外部條文', cites: ['16'] }, { text: '沒有出處', cites: [] }], covered: true };
  }
});

test('no amendment of the law is a 404 {error:"diff"}, none of the articles a 400; Orbit Law failing a 502; nothing asked', async () => {
  const before = gemini.length;
  const r = await ask({ ...DIFF_ASK, p: 'C0000001' });
  assert.deepEqual([r.status, (await r.json()).error], [404, 'diff']);
  assert.equal((await ask({ ...DIFF_ASK, arts: ['99'] })).status, 400);
  diffStatus = 500;
  try {
    assert.equal((await ask(DIFF_ASK)).status, 502);
  } finally {
    diffStatus = 200;
  }
  assert.equal(gemini.length, before);
});
