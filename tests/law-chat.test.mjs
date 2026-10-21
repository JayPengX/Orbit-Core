// Orbit Law's /law-chat: a Pass of Orbit Law's, a plan, the articles found
// in Orbit Law's own data, an answer from those only (its cites checked),
// kept when it's a first question, and a Pass's day capped.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fakeD1 } from './fake-d1.mjs';

const DATA = 'https://jaypengx.github.io/Orbit-Law/data/';
const row = (p, n, extra = {}) => [p, n, extra.level || '法律', '', extra.m || '20250101', extra.repealed || 0, 0, 0];
const INDEX = [row('A0000001', '中華民國憲法'), row('B0000001', '民法'), row('N0030001', '勞動基準法'), row('D0070001', '土地法'), row('X0000001', '舊法', { repealed: 1 })];
const ORDERS = [row('N0030002', '勞動基準法施行細則', { level: '命令' })];
const LAWS = {
  A0000001: { n: '中華民國憲法', m: '19470101', a: [['A', '15', '人民之生存權、工作權及財產權，應予保障。']] },
  B0000001: {
    n: '民法',
    m: '20250101',
    a: [
      ['C', '', '第二章 債'],
      ['A', '421', '稱租賃者，謂當事人約定，一方以物租與他方使用收益，他方支付租金之契約。'],
      ['A', '423', '出租人應以合於所約定使用收益之租賃物，交付承租人。'],
      ['A', '455', '承租人於租賃關係終止後，應返還租賃物。'],
      ['A', '456', '押金之返還請求權，因二年間不行使而消滅。']
    ]
  },
  N0030001: {
    n: '勞動基準法',
    m: '20240731',
    a: [
      ['A', '4', '本法所稱主管機關：在中央為勞動部；在直轄市為直轄市政府；在縣（市）為縣（市）政府。'],
      ['A', '17', '雇主依前條終止勞動契約者，應發給勞工資遣費。'],
      ['A', '79', '違反第十七條規定者，處新臺幣二萬元以上一百萬元以下罰鍰。']
    ]
  },
  D0070001: { n: '土地法', m: '20210127', a: [['A', '99', '前條擔保之金額，不得超過二個月房屋租金之總額。']] },
  N0030002: { n: '勞動基準法施行細則', m: '20240301', a: [['A', '7', '勞動契約應約定工作場所及應從事之工作。']] }
};

// Orbit Law's full-text index of the laws then the regulations (index.json's, then orders.json's order), as its build writes it.
const { bigrams, bucketOf } = await import('../law-chat.js');
function buildText() {
  const buckets = new Map();
  [...INDEX, ...ORDERS].forEach((r, li) => {
    let ai = 0;
    for (const [kind, , text] of LAWS[r[0]]?.a || []) {
      if (kind !== 'A') continue;
      const id = li * 2048 + ai++;
      for (const pair of bigrams(text)) {
        const b = bucketOf(pair);
        if (!buckets.has(b)) buckets.set(b, {});
        (buckets.get(b)[pair] ||= []).push(id);
      }
    }
  });
  for (const pairs of buckets.values()) for (const [p, ids] of Object.entries(pairs)) pairs[p] = ids.map((id, i) => (i ? id - ids[i - 1] : id));
  return buckets;
}
let TEXT = buildText();

const reads = [];
const gemini = [];
let plan = { laws: ['民法'], terms: ['押金', '返還'], arts: [{ law: '民法', key: '第423條' }] };
let answer = {
  covered: true,
  answer: '押金可以請求返還。',
  points: [{ text: '押金返還請求權二年消滅', cites: ['B0000001:456'] }, { text: '外部條文', cites: ['B0000001:999'] }, { text: '沒有出處', cites: [] }],
  consequences: [{ text: '罰鍰', cites: ['C0000001:1'] }],
  agency: { name: '內政部', cites: ['B0000001:456'] },
  next: ['保留租約與收據'],
  followups: ['房東不還押金怎麼辦？']
};
const GROUND = {};
const JUDGMENTS = {};
let geminiStatus = 200;
let textStatus = 200;
globalThis.fetch = async (url, init) => {
  const u = String(url);
  if (u.includes('generativelanguage')) {
    const sent = JSON.parse(init.body);
    const kind = 'terms' in sent.generationConfig.response_schema.properties ? 'plan' : 'answer';
    gemini.push({ kind, prompt: sent.contents[0].parts[0].text });
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(kind === 'plan' ? plan : answer) }] } }] }), { status: geminiStatus });
  }
  if (u.startsWith('https://judgment.judicial.gov.tw/')) return JUDGMENTS[decodeURIComponent(u.split('id=')[1])] ? new Response(JUDGMENTS[decodeURIComponent(u.split('id=')[1])]) : new Response('', { status: 404 });
  if (!u.startsWith(DATA)) throw new Error(`unexpected fetch ${u}`);
  const path = u.slice(DATA.length);
  reads.push(path);
  if (path === 'index.json') return new Response(JSON.stringify({ laws: INDEX }));
  if (path === 'orders.json') return new Response(JSON.stringify({ laws: ORDERS }));
  const law = path.match(/^law\/(\w+)\.json$/)?.[1];
  if (law) return LAWS[law] ? new Response(JSON.stringify({ p: law, ...LAWS[law] })) : new Response('', { status: 404 });
  const b = path.match(/^text\/(\d+)\.json$/)?.[1];
  if (b) return textStatus !== 200 ? new Response('', { status: textStatus }) : TEXT.has(Number(b)) ? new Response(JSON.stringify(TEXT.get(Number(b)))) : new Response('', { status: 404 });
  if (GROUND[path]) return new Response(JSON.stringify(GROUND[path]));
  return new Response('', { status: 404 });
};
const worker = (await import('../worker.js')).default;
const { LAW_LIMITS, forgetLawCounts, forgetLists } = await import('../law.js');
const { CHAT_LIMITS, readChat, readPlan, checkChat, textHits } = await import('../law-chat.js');
const { signToken } = await import('../quadra-token.js');
const { forgetPace } = await import('../pace.js');
const ctx = { waitUntil: p => p };

function fakeKV() {
  const m = new Map();
  return { m, get: async (k, o) => (m.has(k) ? (o?.type === 'json' ? JSON.parse(m.get(k)) : m.get(k)) : null), put: async (k, v) => void m.set(k, v) };
}
const envOf = () => ({ GEMINI_API_KEY: 'k', ECO_TOKEN_SECRET: 'test-secret', STORE: fakeD1(), RATE_LIMIT_KV: fakeKV() });
const qtOf = (d, { a = 'law', e = Date.now() + 600_000 } = {}) => signToken('test-secret', { k: 'ses', d, s: `s-${d}`, a, e });
let passN = 0;
const chat = async (body, { origin = 'https://jaypengx.github.io', pass = `acct${++passN}`, qt, ip = '198.51.100.1', env = envOf() } = {}) => {
  const token = qt === undefined ? await qtOf(pass) : qt;
  const url = `https://proxy.test/law-chat?v=1${token ? `&qt=${encodeURIComponent(token)}` : ''}`;
  return worker.fetch(new Request(url, { method: 'POST', headers: { Origin: origin, 'CF-Connecting-IP': ip, 'Content-Type': 'text/plain' }, body: typeof body === 'string' ? body : JSON.stringify(body) }), env, ctx);
};
const Q = { q: '房東不還押金怎麼辦？', lang: 'zh' };
const lastOf = kind => gemini.filter(g => g.kind === kind).at(-1).prompt;

test('no Pass of Orbit Law\'s is a 401 {error:"pass"}, before anything is read or asked', async () => {
  const before = [reads.length, gemini.length];
  for (const qt of [null, await qtOf('x', { a: 'stock' }), await qtOf('x', { e: Date.now() - 1 }), 'forged.token']) {
    const r = await chat(Q, { qt });
    assert.equal(r.status, 401);
    assert.deepEqual(await r.json(), { error: 'pass' });
    assert.equal(r.headers.get('Access-Control-Allow-Origin'), 'https://jaypengx.github.io');
  }
  assert.equal((await chat(Q, { origin: 'https://evil.example' })).status, 403);
  assert.deepEqual([reads.length, gemini.length], before);
});

test('the chat is checked before anything is read', async () => {
  const ok = { ...Q, history: [{ role: 'user', text: 'a' }, { role: 'model', text: 'b', cites: ['B0000001:456'] }], pin: [{ p: 'B0000001', arts: ['456'] }] };
  assert.equal(typeof readChat(ok), 'object');
  for (const bad of [{ ...Q, q: '' }, { ...Q, q: 'x'.repeat(501) }, { ...Q, lang: 'jp' }, { ...Q, history: Array(7).fill({ role: 'user', text: 'a' }) }, { ...Q, history: [{ role: 'system', text: 'a' }] }, { ...Q, history: [{ role: 'user', text: 'x'.repeat(1501) }] }, { ...Q, history: [{ role: 'model', text: 'a', cites: ['x'.repeat(61)] }] }, { ...Q, mine: { laws: 'B0000001' } }, { ...Q, mine: 3 }, { ...Q, pin: [{ p: 'B0000001', arts: ['456'] }, { p: 'B0000001', arts: ['1'] }, { p: 'B0000001', arts: ['2'] }] }, { ...Q, pin: [{ p: 'B0000001', arts: Array.from({ length: 9 }, (_, i) => String(i + 1)) }] }]) {
    assert.equal(typeof readChat(bad), 'string', JSON.stringify(bad).slice(0, 80));
  }
  const before = [reads.length, gemini.length];
  assert.equal((await chat({ ...Q, q: '' })).status, 400);
  assert.equal((await chat('{not json')).status, 400);
  assert.equal((await chat({ ...Q, q: 'x'.repeat(CHAT_LIMITS.maxBody) })).status, 413);
  assert.deepEqual([reads.length, gemini.length], before);
});

test('a plan, then an answer from the articles found only; a cite to anything else is dropped', async () => {
  const r = await chat({ ...Q, pin: [{ p: 'D0070001', arts: ['99'] }] });
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.deepEqual(lastOf('plan').match(/房東不還押金怎麼辦/)?.[0], '房東不還押金怎麼辦');
  const prompt = lastOf('answer');
  // The pin, the planned article, the full-text hits (押金, 返還), in that order.
  const order = ['D0070001:99', 'B0000001:423', 'B0000001:456', 'B0000001:455'].map(c => prompt.indexOf(`[cite "${c}"]`));
  assert.ok(order.every((x, i) => x > 0 && (!i || x > order[i - 1])), String(order));
  assert.doesNotMatch(prompt, /勞動部/);
  assert.deepEqual(j.points, [{ text: '押金返還請求權二年消滅', cites: ['B0000001:456'] }]);
  assert.deepEqual(j.consequences, []);
  // (Named by no given article: dropped.)
  assert.equal(j.agency, null);
  assert.equal(j.covered, true);
  assert.deepEqual(j.sources, [{ p: 'B0000001', n: '民法', key: '456' }]);
  assert.deepEqual([j.next, j.followups, j.cached, j.left], [['保留租約與收據'], ['房東不還押金怎麼辦？'], false, LAW_LIMITS.chatPerPass - 1]);
  assert.deepEqual(Object.keys(j).sort(), ['agency', 'answer', 'cached', 'cited', 'consequences', 'covered', 'followups', 'left', 'next', 'points', 'sources']);
});

test('names resolve exactly, by short name, by prefix, then among the regulations; the authority article comes along', async () => {
  plan = { laws: ['勞基法', '施行細則不存在', '勞動基準法施行', '舊法'], terms: ['資遣費'], arts: [{ law: '勞動基準法施行細則', key: '7' }, { law: '勞基法', key: '79' }, { law: '不存在法', key: '1' }] };
  answer = { covered: true, answer: '要發資遣費。', points: [{ text: '資遣費', cites: ['n0030001:第17條'] }], consequences: [{ text: '二萬元以上一百萬元以下罰鍰', cites: ['N0030001:79'] }], agency: { name: '勞動部', cites: ['N0030001:4'] }, next: [], followups: [] };
  try {
    const j = await (await chat({ q: '公司資遣不給錢', lang: 'zh' })).json();
    const prompt = lastOf('answer');
    for (const c of ['N0030002:7', 'N0030001:79', 'N0030001:17', 'N0030001:4']) assert.match(prompt, new RegExp(`\\[cite "${c}"\\]`));
    assert.ok(reads.includes('orders.json'));
    assert.deepEqual(j.points, [{ text: '資遣費', cites: ['N0030001:17'] }]);
    assert.deepEqual(j.consequences, [{ text: '二萬元以上一百萬元以下罰鍰', cites: ['N0030001:79'] }]);
    assert.equal(j.agency, '勞動部');
    assert.deepEqual(j.sources.map(s => s.key).sort(), ['17', '4', '79']);
  } finally {
    plan = { laws: ['民法'], terms: ['押金', '返還'], arts: [{ law: '民法', key: '第423條' }] };
    answer = { covered: true, answer: '押金可以請求返還。', points: [{ text: '押金返還請求權二年消滅', cites: ['B0000001:456'] }], next: [], followups: [] };
  }
});

test('the plan is checked; the terms search 16 bucket files at most, a named law\'s hits first', async () => {
  const p = readPlan({ laws: ['民法', '民法', 5], terms: ['押', '押金', '一二三四五六七', '返還'], arts: [{ law: '民法', key: '第15條之1' }, { law: '民法', key: 'x' }] });
  assert.deepEqual(p, { laws: ['民法'], terms: ['押金', '返還'], arts: [{ law: '民法', key: '15-1' }] });
  forgetLists();
  const before = reads.length;
  // Each six-character term is 5 pairs: the fourth would pass 16 files.
  const hits = await textHits(['租賃關係終止', '押金之返還請', '前條擔保之金', '雇主依前條終'], new Set([1]));
  const files = reads.slice(before).filter(x => x.startsWith('text/'));
  assert.ok(files.length <= 16, String(files.length));
  assert.equal(new Set(files).size, files.length);
  assert.ok(hits.length >= 2);
  assert.equal(Math.floor(hits[0] / 2048), 1);
});

test('at most 14 articles and 14,000 characters reach the answer', async () => {
  const long = Array.from({ length: 30 }, (_, i) => ['A', String(i + 1), `押金${'字'.repeat(i < 3 ? 6000 : 100)}`]);
  LAWS.D0070001.a = long;
  TEXT = buildText();
  plan = { laws: ['土地法'], terms: ['押金'], arts: [] };
  try {
    await chat({ q: '押金上限', lang: 'zh' });
    const prompt = lastOf('answer');
    const n = (prompt.match(/\[cite "/g) || []).length;
    assert.ok(n <= 14 && n > 3, String(n));
    const body = prompt.slice(prompt.indexOf('Articles:'), prompt.indexOf('The question'));
    assert.ok(body.length < 14_000 + 14 * 60, String(body.length));
  } finally {
    LAWS.D0070001.a = [['A', '99', '前條擔保之金額，不得超過二個月房屋租金之總額。']];
    TEXT = buildText();
    plan = { laws: ['民法'], terms: ['押金', '返還'], arts: [{ law: '民法', key: '第423條' }] };
  }
});

test('a follow-up carries the last answer\'s cites and the turns, and is never kept', async () => {
  const env = envOf();
  plan = { laws: [], terms: [], arts: [] };
  try {
    const body = { q: '那要多久？', lang: 'zh', history: [{ role: 'user', text: '押金可以拿回來嗎' }, { role: 'model', text: '可以', cites: ['B0000001:455'] }] };
    const calls = gemini.length;
    const first = await (await chat(body, { env, pass: 'follow' })).json();
    assert.equal(gemini.length, calls + 2);
    assert.match(lastOf('plan'), /押金可以拿回來嗎/);
    assert.match(lastOf('answer'), /\[cite "B0000001:455"\]/);
    assert.match(lastOf('answer'), /Assistant: 可以/);
    const again = await (await chat(body, { env, pass: 'follow' })).json();
    assert.equal(gemini.length, calls + 4);
    assert.deepEqual([first.cached, again.cached, again.left], [false, false, LAW_LIMITS.chatPerPass - 2]);
  } finally {
    plan = { laws: ['民法'], terms: ['押金', '返還'], arts: [{ law: '民法', key: '第423條' }] };
  }
});

test('the same first question is kept and free; a new version of a law found asks again (its plan still kept)', async () => {
  const env = envOf();
  const first = await (await chat(Q, { env, pass: 'kept' })).json();
  const calls = gemini.length;
  const again = await (await chat({ ...Q, q: ` ${Q.q}\n` }, { env, pass: 'kept' })).json();
  assert.equal(gemini.length, calls);
  assert.equal(again.cached, true);
  assert.equal(again.left, first.left);
  assert.deepEqual(again.points, first.points);
  LAWS.B0000001.m = '20260101';
  try {
    const fresh = await (await chat(Q, { env, pass: 'kept' })).json();
    assert.deepEqual(gemini.slice(calls).map(g => g.kind), ['answer']);
    assert.equal(fresh.cached, false);
    assert.equal(fresh.left, first.left - 1);
  } finally {
    LAWS.B0000001.m = '20250101';
  }
});

test('a Pass past 30 turns a day, or the day past its Gemini answers, is a 429 {error:"cap", left:0}; counted per Pass, not per address', async () => {
  forgetLawCounts();
  const env = envOf();
  const day = new Date(Date.now() + 8 * 3_600_000).toISOString().slice(0, 10);
  assert.equal((await chat(Q, { env, pass: 'capped', ip: '203.0.113.1' })).status, 200);
  // Another address, the same Pass: the same count.
  assert.equal((await (await chat({ ...Q, q: '押金二' }, { env, pass: 'capped', ip: '203.0.113.2' })).json()).left, LAW_LIMITS.chatPerPass - 2);
  await env.STORE.prepare("UPDATE law_day SET n = ?1 WHERE k LIKE '%|chat:%'").bind(LAW_LIMITS.chatPerPass).run();
  const before = gemini.length;
  const capped = await chat({ ...Q, q: '押金三' }, { env, pass: 'capped' });
  assert.equal(capped.status, 429);
  assert.deepEqual(await capped.json(), { error: 'cap', left: 0 });
  // A kept answer still comes, free.
  const hit = await (await chat(Q, { env, pass: 'capped' })).json();
  assert.deepEqual([hit.cached, hit.left], [true, 0]);
  // Another Pass on the same address has its own count…
  assert.equal((await chat({ ...Q, q: '押金四' }, { env, pass: 'other', ip: '203.0.113.1' })).status, 200);
  // …until the day's in all is spent.
  await env.STORE.prepare('UPDATE law_day SET n = ?1 WHERE k = ?2').bind(LAW_LIMITS.perDay, `${day}|g`).run();
  assert.equal((await chat({ ...Q, q: '押金五' }, { env, pass: 'third' })).status, 429);
  assert.equal(gemini.length, before + 2);
});

test('nothing found is not covered, without the answer\'s call; a guard that empties the answer replaces it', async () => {
  plan = { laws: ['不存在法'], terms: [], arts: [] };
  try {
    const calls = gemini.length;
    const j = await (await chat({ q: '外星人', lang: 'en' })).json();
    assert.deepEqual(gemini.slice(calls).map(g => g.kind), ['plan']);
    assert.equal(j.covered, false);
    assert.match(j.answer, /don’t directly address/);
    assert.match(j.next[0], /Legal Aid/);
    assert.deepEqual(j.sources, []);
  } finally {
    plan = { laws: ['民法'], terms: ['押金', '返還'], arts: [{ law: '民法', key: '第423條' }] };
  }
  const out = checkChat({ covered: true, answer: '一定會贏', points: [{ text: 'x', cites: ['B0000001:1'] }], next: [], followups: [] }, [{ p: 'B0000001', n: '民法', m: '1', key: '456', text: 't' }], 'zh');
  assert.deepEqual([out.covered, out.answer, out.points, out.next.length], [false, '找到的法規沒有直接回答這個問題。', [], 1]);
});

test('Gemini or Orbit Law failing is a 502, nothing kept; no key a 503; the guard\'s pace 2 a 503; 10 a minute a Pass', async () => {
  const env = envOf();
  geminiStatus = 503;
  try {
    const r = await chat({ ...Q, q: '押金失敗' }, { env });
    assert.equal(r.status, 502);
    assert.equal(env.RATE_LIMIT_KV.m.size, 0);
  } finally {
    geminiStatus = 200;
  }
  textStatus = 500;
  try {
    assert.equal((await chat({ ...Q, q: '押金讀不到' }, { env })).status, 502);
  } finally {
    textStatus = 200;
  }
  assert.equal((await chat({ ...Q, q: '沒有鑰匙' }, { env: { ...envOf(), GEMINI_API_KEY: '' } })).status, 503);
  const busy = [];
  for (let i = 0; i < LAW_LIMITS.perMinute + 1; i++) busy.push((await chat(Q, { env, pass: 'busy' })).status);
  assert.deepEqual([busy.at(-2), busy.at(-1)], [200, 429]);
  const paced = envOf();
  paced.RATE_LIMIT_KV.m.set('guard:pace', JSON.stringify({ pace: 2 }));
  forgetPace();
  try {
    const r = await chat(Q, { env: paced });
    assert.deepEqual([r.status, (await r.json()).error], [503, 'paused']);
  } finally {
    forgetPace();
  }
});

test('figures, notices and bills Orbit Law publishes ground the answer, and come back with it', async () => {
  const { forgetGround } = await import('../law-ground.js');
  GROUND['ai/facts.json'] = { facts: [{ id: 'minwage', k: ['最低工資', '基本工資'], t: '最低工資', text: '每月最低工資及每小時最低工資', now: '月薪 NT$28,590、時薪 NT$190（2025-01-01 起）', next: '月薪 NT$29,500、時薪 NT$196（2026-01-01 起）', law: '最低工資法', src: ['https://www.mol.gov.tw/1607/28162/'] }] };
  GROUND['ai/news.json'] = { news: [['2025-09-15', '勞動部', '最低工資審議會決議調整每月最低工資', 'https://www.mol.gov.tw/news/1', '審議會決議每月最低工資調整'], ['2025-01-01', '內政部', '戶籍登記新制上路', 'https://www.moi.gov.tw/x', '戶籍']] };
  GROUND['bills/items.json'] = { items: [{ k: 'b1', n: '勞動基準法部分條文修正草案', stage: 2, u: '2026-10-01', by: [['民進黨', 2]] }, { k: 'b2', n: '民法部分條文修正草案', stage: 6, passed: '2026-05-01', u: '2026-05-01' }] };
  forgetGround();
  try {
    const r = await chat({ q: '現在基本工資多少？勞動基準法有要修法嗎？', lang: 'zh' });
    assert.equal(r.status, 200);
    const j = await r.json();
    const p = lastOf('answer');
    assert.match(p, /政府公告與數字/);
    assert.match(p, /NT\$28,590/);
    assert.match(p, /最低工資審議會/);
    assert.doesNotMatch(p, /戶籍登記/);
    assert.match(p, /立法院進度/);
    assert.match(p, /勞動基準法部分條文修正草案」進度：委員會/);
    assert.doesNotMatch(p, /民法部分條文/);
    assert.deepEqual(j.bills, [{ k: 'b1', n: '勞動基準法部分條文修正草案', stage: 2 }]);
    assert.equal(j.notices.length, 2);
    assert.equal(j.notices[1].url, 'https://www.mol.gov.tw/news/1');
    assert.equal(j.notices[1].agency, '勞動部');
  } finally {
    for (const k of Object.keys(GROUND)) delete GROUND[k];
    forgetGround();
  }
});

test('without Orbit Law\'s figures (not published yet), a chat is as before', async () => {
  const { forgetGround } = await import('../law-ground.js');
  forgetGround();
  const r = await chat({ q: '最低工資多少？', lang: 'zh' });
  const j = await r.json();
  assert.equal(r.status, 200);
  assert.equal(j.notices, undefined);
  assert.equal(j.bills, undefined);
});

test('a regulation\'s article found by its words reaches the answer (the index runs on past the laws)', async () => {
  plan = { laws: [], terms: ['工作場所'], arts: [] };
  try {
    await chat({ q: '公司可以隨便調我的工作地點嗎？', lang: 'zh' });
    assert.match(lastOf('answer'), /\[cite "N0030002:7"\] 「勞動基準法施行細則」第7條/);
  } finally {
    plan = { laws: ['民法'], terms: ['押金', '返還'], arts: [{ law: '民法', key: '第423條' }] };
  }
});

test('similar judgments, 行政規則, legislators, votes, meetings and the reader\'s own follows ground the answer, cited and linked', async () => {
  const { forgetGround } = await import('../law-ground.js');
  const jid = 'TPSV,114,台上,2031,20260514,1';
  GROUND['rulings/all.json'] = { rulings: [[jid, '2026-05-14', '請求返還押金', ['B0000001:456', 'B0000001:455']], ['TPSM,115,台上,1,20260101,1', '2026-01-01', '加重詐欺', ['C0000001:339']]] };
  JUDGMENTS[jid] = '<div class="htmlcontent"><div>主文</div><div>上訴駁回。</div><div>理由</div><div>一、押金應於租賃關係終止、承租人返還租賃物後返還。</div></div><div id="JudrelaLaw"></div>';
  GROUND['agency/all.json'] = { rules: [['教育部:FL001', '房屋租賃押金返還注意事項', '教育部', '2025-01-01', 'https://edu.law.moe.gov.tw/LawContent.aspx?id=FL001', ['B0000001:456'], ['B0000001']], ['教育部:FL002', '校園安全注意事項', '教育部', '2025-01-01', 'https://x.gov.tw/', [], []]] };
  GROUND['agency/text/____FL001.json'] = { t: '一、出租人應於租期屆滿返還押金。' };
  GROUND['ly/people.json'] = { people: [{ id: 1261, n: '吳春城', party: '台灣民眾黨', area: '全國不分區', counts: { bills: 153, cosign: 67, votes: 665, clips: 81 } }, { id: 9, n: '王小明', party: '民進黨' }] };
  GROUND['ly/person/1261.json'] = { bills: [['2021', '2025-01-03', '民法第四百五十六條修正草案', '交付審查']] };
  GROUND['ly/votes.json'] = { names: ['吳春城', '王小明'], votes: [['v1', '2026-08-27', '民法第四百五十六條修正動議', 'a1', [0], [1], [], ['B0000001']], ['v2', '2026-08-01', '其他', 'a2', [1], [], [], ['N0030001']]] };
  GROUND['ly/agenda.json'] = { meets: [{ id: 'm1', title: '司法及法制委員會審查民法部分條文修正草案', days: [{ d: '2099-01-02' }], why: '審查民法', bills: [] }, { id: 'm0', title: '民法', days: [{ d: '2000-01-01' }], why: '' }] };
  GROUND['bills/items.json'] = { items: [{ k: '11:01126', n: '民法', stage: 2, u: '2026-10-01' }] };
  forgetGround();
  answer = { ...answer, points: [...answer.points, { text: '法院認為押金應返還', cites: [jid] }, { text: '注意事項', cites: ['教育部:FL001'] }, { text: '沒給的判決', cites: ['TPSV,100,台上,1,20200101,1'] }] };
  try {
    const r = await chat({ q: '房東不還押金，吳春城對民法押金修法怎麼投票？什麼時候審查？我追蹤的法案進度？', lang: 'zh', mine: { items: ['11:01126'], people: [], laws: [], marks: [] } });
    assert.equal(r.status, 200);
    const j = await r.json();
    const p = lastOf('answer');
    assert.match(p, /\[cite "TPSV,114,台上,2031,20260514,1"\] 最高法院民事 114年度台上字第2031號/);
    assert.match(p, /主文：上訴駁回。／理由：一、押金應於租賃關係終止/);
    assert.doesNotMatch(p, /加重詐欺/);
    assert.match(p, /\[cite "教育部:FL001"\] 教育部「房屋租賃押金返還注意事項」/);
    assert.match(p, /出租人應於租期屆滿返還押金/);
    assert.doesNotMatch(p, /校園安全/);
    assert.match(p, /吳春城（台灣民眾黨/);
    assert.match(p, /最近提案：2025-01-03「民法第四百五十六條修正草案」/);
    assert.match(p, /表決「民法第四百五十六條修正動議」：未通過，贊成 1（台灣民眾黨1）、反對 1（民進黨1）、棄權 0；吳春城贊成/);
    assert.doesNotMatch(p, /表決「其他」/);
    assert.match(p, /2099-01-02「司法及法制委員會審查民法部分條文修正草案」/);
    assert.match(p, /追蹤的法案「民法」進度：委員會/);
    assert.deepEqual(j.points.map(x => x.cites[0]), ['B0000001:456', jid, '教育部:FL001']);
    assert.deepEqual(j.cited, [jid, '教育部:FL001']);
    assert.deepEqual(j.cases.map(c => [c.jid, c.no]), [[jid, '最高法院民事 114年度台上字第2031號']]);
    assert.deepEqual(j.rules.map(x => [x.id, x.text]), [['教育部:FL001', true]]);
    assert.deepEqual(j.people, [{ id: '1261', n: '吳春城', party: '台灣民眾黨' }]);
    assert.deepEqual(j.votes.map(v => v.id), ['v1']);
    assert.deepEqual(j.meets.map(m => m.id), ['m1']);
  } finally {
    for (const k of Object.keys(GROUND)) delete GROUND[k];
    delete JUDGMENTS[jid];
    answer.points = answer.points.slice(0, 3);
    forgetGround();
  }
});
