// Orbit Law's /law-gist: a Pass of Orbit Law's asks, nothing counted per
// Pass; bills' one-line summaries in batches and a law's gist, kept and
// shared, new ones capped by the day in all.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fakeD1 } from './fake-d1.mjs';

const bill = (n, rows, why = '') => ({ 議案名稱: n, '提案單位/提案委員': '行政院', 案由: why, 對照表: rows.length ? [{ law_name: '長期照顧服務法', rows }] : [] });
const BILLS = {
  202110000010000: bill('「長期照顧服務法第三條修正草案」，請審議案。', [{ 修正: '第三條　長期照顧服務對象包括五十五歲以上原住民。', 現行: '第三條　長期照顧服務對象包括六十五歲以上原住民。', 說明: '降低年齡。' }]),
  202110000020000: bill('「某法修正草案」', [], '為修正某法。'),
  202110000030000: bill('報告案', []),
  202110000060000: bill('「另一法修正草案」', [], '為修正另一法。')
};
const LAW = {
  p: 'B0000001',
  n: '民法',
  m: '20250101',
  a: [['C', '', '第一章 法例'], ['A', '1', '民事，法律所未規定者，依習慣。'], ['A', '2', '民事所適用之習慣。'], ['A', '3', '依法律之規定。'], ['A', '4', '以文字為準。'], ['A', '10', '本法所稱住所，指久住之處所。'], ['A', '11', '其他。']]
};
const gemini = [];
const bills = [];
let reply = null;
let geminiStatus = 200;
globalThis.fetch = async (url, init) => {
  const u = String(url);
  if (u.includes('generativelanguage')) {
    const sent = JSON.parse(init.body);
    gemini.push({ prompt: sent.contents[0].parts[0].text, schema: sent.generationConfig.response_schema });
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(reply) }] } }] }), { status: geminiStatus });
  }
  if (u.startsWith('https://v2.ly.govapi.tw/bill/')) {
    const id = u.split('/').pop();
    bills.push(id);
    if (id === '202199999990000') return new Response('', { status: 500 });
    return BILLS[id] ? new Response(JSON.stringify({ error: false, data: BILLS[id] })) : new Response('{"error":true}', { status: 404 });
  }
  if (u === 'https://jaypengx.github.io/Orbit-Law/data/law/B0000001.json') return new Response(JSON.stringify(LAW));
  if (u.startsWith('https://jaypengx.github.io/Orbit-Law/data/law/')) return new Response('', { status: 404 });
  throw new Error(`unexpected fetch ${u}`);
};
const worker = (await import('../worker.js')).default;
const { GIST_LIMITS, readGist, checkGists, gistParts } = await import('../law-gist.js');
const { forgetLawCounts } = await import('../law.js');
const { signToken } = await import('../quadra-token.js');
const ctx = { waitUntil: p => p };

function fakeKV() {
  const m = new Map();
  return { m, get: async (k, o) => (m.has(k) ? (o?.type === 'json' ? JSON.parse(m.get(k)) : m.get(k)) : null), put: async (k, v) => void m.set(k, v) };
}
const envOf = () => ({ GEMINI_API_KEY: 'k', ECO_TOKEN_SECRET: 'test-secret', STORE: fakeD1(), RATE_LIMIT_KV: fakeKV() });
let passN = 0;
const gist = async (body, { qt, pass = `acct${++passN}`, env = envOf() } = {}) => {
  const token = qt === undefined ? await signToken('test-secret', { k: 'ses', d: pass, s: `s-${pass}`, a: 'law', e: Date.now() + 600_000 }) : qt;
  const url = `https://proxy.test/law-gist?v=1${token ? `&qt=${encodeURIComponent(token)}` : ''}`;
  return worker.fetch(new Request(url, { method: 'POST', headers: { Origin: 'https://jaypengx.github.io', 'Content-Type': 'text/plain' }, body: JSON.stringify(body) }), env, ctx);
};
const ITEMS = [{ k: '11:01126', bill: '202110000010000' }, { k: '11:02000', bill: '202110000020000' }, { k: '11:03000', bill: '202110000030000' }, { k: '11:04000', bill: '202110000040000' }];
const BILL_REPLY = { gists: [{ k: '11:01126', line: '長照服務對象擴大到 55 歲以上原住民，比現在早十歲就能申請', who: ['原住民', '家屬', '照服員', '第四'], covered: true }, { k: '11:02000', line: '說不清', who: ['x'], covered: false }, { k: 'not-asked', line: 'x', who: [], covered: true }] };

test('no Pass of Orbit Law\'s is a 401 {error:"pass"}; the ask is checked', async () => {
  const before = gemini.length;
  const r = await gist({ kind: 'law', p: 'B0000001' }, { qt: null });
  assert.deepEqual([r.status, await r.json()], [401, { error: 'pass' }]);
  for (const bad of [{ kind: 'x' }, { kind: 'law', p: 'b1' }, { kind: 'bill', items: [] }, { kind: 'bill', items: Array(11).fill(ITEMS[0]) }, { kind: 'bill', items: [{ k: 'a b', bill: '202110000010000' }] }, { kind: 'bill', items: [{ k: 'a', bill: 'x' }] }, { kind: 'law', p: 'B0000001', lang: 'jp' }]) {
    assert.equal(typeof readGist(bad), 'string', JSON.stringify(bad));
  }
  assert.equal((await gist({ kind: 'bill', items: [] })).status, 400);
  assert.equal(gemini.length, before);
});

test('bills: one call a batch from each bill\'s own text; a thin one not covered; one not there left out; kept and shared 60 days', async () => {
  const env = envOf();
  reply = BILL_REPLY;
  const before = gemini.length;
  const r = await gist({ kind: 'bill', items: ITEMS, lang: 'zh' }, { env, pass: 'a' });
  assert.equal(r.status, 200);
  const j = await r.json();
  // (No text at all: thin without asking. Not there: left out.)
  assert.deepEqual(
    j.gists.sort((a, b) => a.k.localeCompare(b.k)),
    [
      { k: '11:01126', line: '長照服務對象擴大到 55 歲以上原住民，比現在早十歲就能申請'.slice(0, 40), who: ['原住民', '家屬', '照服員'], covered: true },
      { k: '11:02000', line: '', who: [], covered: false },
      { k: '11:03000', line: '', who: [], covered: false }
    ]
  );
  assert.equal(gemini.length, before + 1);
  const { prompt, schema } = gemini.at(-1);
  assert.match(prompt, /\[k "11:01126"\] 「長期照顧服務法第三條修正草案」/);
  assert.match(prompt, /五十五歲以上原住民/);
  assert.match(prompt, /為修正某法/);
  assert.doesNotMatch(prompt, /11:03000|11:04000/);
  assert.deepEqual(Object.keys(schema.properties.gists.items.properties), ['k', 'line', 'who', 'covered']);
  assert.ok(env.RATE_LIMIT_KV.m.has('law:gist:bill:v1:202110000010000|zh'));
  // Another Pass, the same bills under other keys: kept, no call.
  const again = await (await gist({ kind: 'bill', items: ITEMS.slice(0, 3).map((x, i) => ({ ...x, k: `k${i}` })) }, { env, pass: 'b' })).json();
  assert.equal(gemini.length, before + 1);
  assert.deepEqual(again.gists.map(g => g.k).sort(), ['k0', 'k1', 'k2']);
  assert.equal(again.gists.find(g => g.k === 'k0').covered, true);
  assert.deepEqual(checkGists({ gists: [{ k: 'a', line: 'x'.repeat(200), who: [], covered: true }] }, ['a'], 'en')[0].line.length, 90);
});

test('a law: all of a short one, the headings, first articles and definitions of a long one; points checked; kept by version', async () => {
  const env = envOf();
  reply = { gist: '民法規範人民之間的權利義務。', points: [{ text: '習慣補充法律', cites: ['第1條'] }, { text: '外部', cites: ['99'] }], covered: true };
  const j = await (await gist({ kind: 'law', p: 'B0000001', lang: 'zh' }, { env })).json();
  assert.deepEqual(j, { gist: '民法規範人民之間的權利義務。', points: [{ text: '習慣補充法律', cites: ['1'] }], covered: true, law: { p: 'B0000001', n: '民法', m: '20250101' }, cached: false });
  assert.match(gemini.at(-1).prompt, /## 第一章 法例/);
  assert.match(gemini.at(-1).prompt, /\[key "11"\]/);
  const calls = gemini.length;
  assert.equal((await (await gist({ kind: 'law', p: 'B0000001', lang: 'zh' }, { env })).json()).cached, true);
  assert.equal(gemini.length, calls);
  const long = gistParts(LAW, 55);
  assert.deepEqual(long.keys, ['1', '2', '3', '10']);
  assert.equal(long.rows[0][0], 'C');
  assert.equal((await gist({ kind: 'law', p: 'Z9999999' })).status, 404);
});

test('new gists past the day\'s 200 are a 429 {error:"cap"} (a batch counts each bill); kept ones still come; Gemini failing a 502', async () => {
  forgetLawCounts();
  const env = envOf();
  const day = new Date(Date.now() + 8 * 3_600_000).toISOString().slice(0, 10);
  reply = BILL_REPLY;
  await gist({ kind: 'bill', items: ITEMS.slice(0, 1) }, { env });
  await env.STORE.prepare('UPDATE law_day SET n = ?1 WHERE k = ?2').bind(GIST_LIMITS.perDay - 1, `${day}|gist`).run();
  const before = gemini.length;
  // Two new bills don't fit in the one left.
  const capped = await gist({ kind: 'bill', items: [{ k: 'a', bill: '202110000020000' }, { k: 'b', bill: '202110000060000' }] }, { env });
  assert.deepEqual([capped.status, await capped.json()], [429, { error: 'cap' }]);
  assert.equal((await gist({ kind: 'law', p: 'B0000001' }, { env })).status, 200);
  assert.equal((await gist({ kind: 'law', p: 'B0000001', lang: 'en' }, { env })).status, 429);
  // A kept one beside a capped one: the kept one comes.
  const mixed = await (await gist({ kind: 'bill', items: [ITEMS[0], { k: 'b', bill: '202110000020000' }] }, { env })).json();
  assert.deepEqual(mixed.gists.map(g => g.k), ['11:01126']);
  assert.equal(gemini.length, before + 1);
  geminiStatus = 503;
  try {
    assert.equal((await gist({ kind: 'law', p: 'B0000001' })).status, 502);
    assert.equal((await gist({ kind: 'bill', items: [{ k: 'z', bill: '202199999990000' }] })).status, 502);
  } finally {
    geminiStatus = 200;
  }
});
