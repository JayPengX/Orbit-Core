// /law-ask's mode 'ruling': a ruling read here (憲法法庭's from Orbit Law's
// data, a top court's from 司法院's page through Taiwan), cut into numbered
// paragraphs, and every point of Gemini's answer citing one of them.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fakeD1 } from './fake-d1.mjs';

const CONS = { id: 'j115-7', label: '115年憲判字第7號', n: '移民業務廣告事前審查案', d: '2026-10-08', issue: '移民業務廣告應經審閱是否違憲。', main: ['一、事前審查移民業務廣告，違反比例原則，應失其效力。'], reason: ['壹、事實背景【1】', '聲請人因廣告未經審閱被罰3萬元。【2】', '事前審查是對言論最嚴格的限制。【3】'] };
const PAGE = `<html><div class="htmlcontent"><div>最高法院刑事判決</div><div>主文</div><div>上訴駁回。</div><div>理由</div><div>一、上訴人主張原判決違法。</div><div>二、原判決認事用法並無違誤。</div><div>中華民國115年10月1日</div></div><div id="JudrelaLaw"></div></html>`;
const JID = 'TPSM,115,台上,4682,20261001,1';
const gemini = [];
const pages = [];
let reply = { answer: '法院認為事前審查違憲。', held: '規定違憲，失效。', points: [{ text: '事前審查限制言論最嚴', cites: ['¶4'] }, { text: '沒有的段', cites: ['99'] }, { text: '沒有出處', cites: [] }], who: ['移民業者'], covered: true };
globalThis.fetch = async (url, init) => {
  const u = String(url);
  if (u.includes('generativelanguage')) {
    gemini.push(JSON.parse(init.body));
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(reply) }] } }] }), { headers: { 'Content-Type': 'application/json' } });
  }
  if (u === 'https://jaypengx.github.io/Orbit-Law/data/cons/j115-7.json') return new Response(JSON.stringify(CONS));
  if (u.startsWith('https://jaypengx.github.io/Orbit-Law/data/cons/')) return new Response('', { status: 404 });
  throw new Error(`unexpected fetch ${u}`);
};
// (gemini-relay carries Gemini's calls too: only the judgment page is answered here.)
const relay = {
  fetch: async (u, init) => {
    const to = decodeURIComponent(String(u).split('?to=')[1] || '');
    if (!to.startsWith('https://judgment.judicial.gov.tw/')) return globalThis.fetch(to, init);
    pages.push(u);
    return new Response(PAGE);
  }
};
const worker = (await import('../worker.js')).default;
const { readAsk } = await import('../law.js');
const { judgmentParas, numbered, checkRuling } = await import('../law-ruling.js');
const { signToken } = await import('../orbit-token.js');
const ctx = { waitUntil: p => p };
function fakeKV() {
  const m = new Map();
  return { get: async (k, o) => (m.has(k) ? (o?.type === 'json' ? JSON.parse(m.get(k)) : m.get(k)) : null), put: async (k, v) => void m.set(k, v) };
}
const envOf = () => ({ GEMINI_API_KEY: 'k', ECO_TOKEN_SECRET: 'test-secret', STORE: fakeD1(), RATE_LIMIT_KV: fakeKV(), GEMINI_RELAY: relay });
let n = 0;
const ask = async (body, env = envOf()) => {
  const qt = await signToken('test-secret', { k: 'ses', d: `r${++n}`, s: `s${n}`, a: 'law', e: Date.now() + 600_000 });
  return worker.fetch(new Request(`https://proxy.test/law-ask?v=1&qt=${encodeURIComponent(qt)}`, { method: 'POST', headers: { Origin: 'https://jaypengx.github.io', 'Content-Type': 'text/plain' }, body: JSON.stringify(body) }), env, ctx);
};

test('a ruling id is checked before anything is read', () => {
  assert.deepEqual(readAsk({ mode: 'ruling', id: 'j115-7' }), { mode: 'ruling', id: 'j115-7', q: '', lang: 'zh' });
  assert.deepEqual(readAsk({ mode: 'ruling', id: 's748', q: ' 誰 \n 受影響 ', lang: 'en' }), { mode: 'ruling', id: 's748', q: '誰 受影響', lang: 'en' });
  for (const id of ['', 'j115', 's', '../x', 5, 'TPSM,115']) assert.equal(readAsk({ mode: 'ruling', id }), 'id');
  assert.equal(readAsk({ mode: 'ruling', id: 's748', q: 'x'.repeat(301) }), 'q');
});

test("憲法法庭's ruling: its own paragraphs reach Gemini, a point citing one not given is dropped, the cited ones come back", async () => {
  const r = await ask({ mode: 'ruling', id: 'j115-7' });
  assert.equal(r.status, 200);
  const j = await r.json();
  const prompt = gemini.at(-1).contents[0].parts[0].text;
  assert.match(prompt, /\[¶ "1"\] \(案由\) 移民業務廣告/);
  assert.match(prompt, /\[¶ "2"\] \(主文\)/);
  assert.match(prompt, /\[¶ "5"\] \(理由\) 事前審查/);
  assert.match(prompt, /not legal advice/);
  assert.deepEqual(j.points, [{ text: '事前審查限制言論最嚴', cites: ['4'] }]);
  assert.deepEqual(j.quotes, { 4: ['理由', '聲請人因廣告未經審閱被罰3萬元。【2】'] });
  assert.equal(j.held, '規定違憲，失效。');
  assert.deepEqual(j.who, ['移民業者']);
  assert.equal(j.covered, true);
  assert.deepEqual(j.ruling, { id: 'j115-7', title: '115年憲判字第7號 移民業務廣告事前審查案' });
  // Asked again: kept, free.
  const env = envOf();
  await ask({ mode: 'ruling', id: 'j115-7', q: '誰受影響？' }, env);
  const calls = gemini.length;
  const again = await (await ask({ mode: 'ruling', id: 'j115-7', q: '誰受影響' }, env)).json();
  assert.equal(again.cached, true);
  assert.equal(gemini.length, calls);
});

test('a ruling not there is a 404, nothing asked', async () => {
  const before = gemini.length;
  const r = await ask({ mode: 'ruling', id: 's9999' });
  assert.equal(r.status, 404);
  assert.deepEqual(await r.json(), { error: 'ruling' });
  assert.equal(gemini.length, before);
});

test("a top court's judgment is read through Taiwan, 主文 and 理由 to the date", async () => {
  reply = { answer: '上訴被駁回。', held: '駁回上訴。', points: [{ text: '原判決沒有錯', cites: ['3'] }], who: [], covered: true };
  const j = await (await ask({ mode: 'ruling', id: JID })).json();
  assert.match(pages.at(-1), /^https:\/\/gemini-relay\/\?to=https%3A%2F%2Fjudgment\.judicial\.gov\.tw/);
  assert.deepEqual(j.quotes, { 3: ['理由', '二、原判決認事用法並無違誤。'] });
  assert.match(j.ruling.title, /最高法院 115年度台上字第4682號/);
  assert.deepEqual(judgmentParas(PAGE), [{ part: '主文', text: '上訴駁回。' }, { part: '理由', text: '一、上訴人主張原判決違法。' }, { part: '理由', text: '二、原判決認事用法並無違誤。' }]);
  // (An older fixed-width page: lines joined back into paragraphs.)
  const pre = '<div class="text-pre">最高法院民事判決\n主　　文\n上訴駁回。\n理　　由\n一、上訴人\n主張如下。\n二、原審無誤。\n中　華　民　國　115　年\n</div>';
  assert.deepEqual(judgmentParas(pre).map(p => p.text), ['上訴駁回。', '一、上訴人主張如下。', '二、原審無誤。']);
});

test('a long ruling keeps 主文 whole and the reasons up to the limit; no point left is not covered', () => {
  const paras = [{ part: '主文', text: 'x'.repeat(50) }, ...Array.from({ length: 5 }, () => ({ part: '理由', text: 'y'.repeat(40) }))];
  const { rows, cut } = numbered(paras, 150);
  assert.deepEqual(rows.map(r => r.key), ['1', '2', '3']);
  assert.equal(cut, 3);
  assert.equal(checkRuling({ answer: 'a', points: [{ text: 'b', cites: ['9'] }], covered: true }, rows).covered, false);
});
