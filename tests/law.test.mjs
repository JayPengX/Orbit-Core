// Orbit Law's /law-ask: a law's articles read here, Gemini's answer checked
// against them, kept by the law's version, and a day's calls capped.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fakeD1 } from './fake-d1.mjs';

const LAW = { p: 'B0000001', n: '民法', m: '20250101', a: [['C', '第一章', '法例'], ['A', '1', '民事，法律所未規定者，依習慣。'], ['A', '15', '受監護宣告之人，無行為能力。'], ['A', '15-1', '對於因精神障礙…得因本人…之聲請，為輔助之宣告。']] };
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
  if (u.startsWith('https://jaypengx.github.io/Orbit-Law/data/law/')) {
    laws.push({ u, init });
    return u.endsWith('/B0000001.json') ? new Response(JSON.stringify(LAW), { status: 200 }) : new Response('', { status: 404 });
  }
  throw new Error(`unexpected fetch ${u}`);
};
const worker = (await import('../worker.js')).default;
const { LAW_LIMITS, checkAnswer, citeKey, readAsk, forgetLawCounts } = await import('../law.js');
const ctx = { waitUntil: p => p };

function fakeKV() {
  const m = new Map();
  return { m, get: async (k, o) => (m.has(k) ? (o?.type === 'json' ? JSON.parse(m.get(k)) : m.get(k)) : null), put: async (k, v) => void m.set(k, v) };
}
const envOf = () => ({ GEMINI_API_KEY: 'k', STORE: fakeD1(), RATE_LIMIT_KV: fakeKV() });
let ipN = 0;
const ask = (body, { origin = 'https://jaypengx.github.io', ip = `198.51.100.${++ipN}`, env = envOf() } = {}) =>
  worker.fetch(new Request('https://proxy.test/law-ask', { method: 'POST', headers: { Origin: origin, 'CF-Connecting-IP': ip, 'Content-Type': 'application/json' }, body: typeof body === 'string' ? body : JSON.stringify(body) }), env, ctx);
const OK = { p: 'B0000001', arts: ['15-1', '15'], q: '誰可以聲請輔助宣告？', lang: 'zh' };

test('the ask is checked before anything is read', async () => {
  for (const bad of [{ ...OK, p: 'b0000001' }, { ...OK, p: 'B000001' }, { ...OK, arts: [] }, { ...OK, arts: Array.from({ length: 9 }, (_, i) => String(i + 1)) }, { ...OK, arts: ['15之1'] }, { ...OK, lang: 'jp' }, { ...OK, q: 'x'.repeat(301) }, { ...OK, q: 5 }]) {
    assert.equal(typeof readAsk(bad), 'string', JSON.stringify(bad));
  }
  assert.deepEqual(readAsk({ p: 'B0000001', arts: ['15', '15'], q: '  a \n b ' }), { p: 'B0000001', arts: ['15'], q: 'a b', lang: 'zh' });
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
  assert.equal(laws.at(-1).init.cf.cacheTtl, 86_400);
  assert.ok(laws.at(-1).init.signal);
});

test('a point citing an article not given, or nothing, is dropped', async () => {
  const r = await ask(OK);
  const j = await r.json();
  assert.deepEqual(j.points, [{ text: '可聲請輔助宣告', cites: ['15-1'] }]);
  assert.equal(j.covered, true);
  assert.deepEqual(j.law, { p: 'B0000001', n: '民法', m: '20250101' });
  assert.equal(j.cached, false);
  assert.equal(j.left, LAW_LIMITS.perIp - 1);
  // No point left: not covered, whatever the model said.
  assert.deepEqual(checkAnswer({ answer: 'x', points: [{ text: 'y', cites: ['16'] }], covered: true }, ['15']), { answer: 'x', points: [], covered: false });
  assert.deepEqual(checkAnswer({ answer: 'x', points: [{ text: 'y', cites: ['15', '第16條'] }], covered: true }, ['15', '16']).points[0].cites, ['15', '16']);
  for (const [c, k] of [['第15條之1', '15-1'], ['Article 15-1', '15-1'], ['第 15 條', '15'], ['15', '15']]) assert.equal(citeKey(c), k);
});

test('the same ask again is kept and free; a new version of the law asks again', async () => {
  const env = envOf();
  const ip = '203.0.113.9';
  const first = await (await ask({ ...OK, q: '誰可以 聲請？' }, { env, ip })).json();
  const calls = gemini.length;
  const again = await (await ask({ ...OK, arts: ['15', '15-1'], q: ' 誰可以   聲請？ ' }, { env, ip })).json();
  assert.equal(gemini.length, calls);
  assert.equal(again.cached, true);
  assert.equal(again.left, first.left);
  assert.deepEqual(again.points, first.points);
  LAW.m = '20260101';
  try {
    const fresh = await (await ask({ ...OK, q: '誰可以 聲請？' }, { env, ip })).json();
    assert.equal(fresh.cached, false);
    assert.equal(gemini.length, calls + 1);
    assert.equal(fresh.left, first.left - 1);
  } finally {
    LAW.m = '20250101';
  }
});

test('an address past 20 calls a day, or the day past 500, is a 429 {error:"cap", left:0}; kept answers still come', async () => {
  forgetLawCounts();
  const env = envOf();
  const day = new Date(Date.now() + 8 * 3_600_000).toISOString().slice(0, 10);
  // A cached answer first, then the address's count at the cap.
  const ip = '203.0.113.30';
  assert.equal((await ask(OK, { env, ip })).status, 200);
  await env.STORE.prepare("UPDATE law_day SET n = ?1 WHERE k LIKE '%|ip:%'").bind(LAW_LIMITS.perIp).run();
  const before = gemini.length;
  const capped = await ask({ ...OK, q: 'another' }, { env, ip });
  assert.equal(capped.status, 429);
  assert.deepEqual(await capped.json(), { error: 'cap', left: 0 });
  assert.equal(capped.headers.get('Access-Control-Allow-Origin'), 'https://jaypengx.github.io');
  const hit = await ask(OK, { env, ip });
  assert.equal(hit.status, 200);
  assert.deepEqual([(await hit.clone().json()).cached, (await hit.json()).left], [true, 0]);
  // The day's in all: another address is turned away too.
  await env.STORE.prepare('UPDATE law_day SET n = ?1 WHERE k = ?2').bind(LAW_LIMITS.perDay, `${day}|g`).run();
  const other = await ask({ ...OK, q: 'third' }, { env, ip: '203.0.113.31' });
  assert.equal(other.status, 429);
  assert.equal(gemini.length, before);
  // A capped address adds nothing to the day's count.
  const g = await env.STORE.prepare('SELECT n FROM law_day WHERE k = ?1').bind(`${day}|g`).first();
  assert.equal(g.n, LAW_LIMITS.perDay + 1);
});

test('the count is spent only on a real call; a store that fails turns the ask away', async () => {
  const env = envOf();
  const ip = '203.0.113.40';
  await ask(OK, { env, ip });
  for (let i = 0; i < 3; i++) assert.equal((await (await ask(OK, { env, ip })).json()).left, LAW_LIMITS.perIp - 1);
  const broken = { ...envOf(), STORE: { prepare: () => ({ bind: () => ({ first: async () => { throw new Error('d1'); }, run: async () => { throw new Error('d1'); } }), run: async () => { throw new Error('d1'); } }) } };
  const before = gemini.length;
  assert.equal((await ask(OK, { env: broken, ip: '203.0.113.41' })).status, 429);
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
