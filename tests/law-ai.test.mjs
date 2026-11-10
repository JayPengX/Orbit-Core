// Orbit Law's AI (law-ai.js): the articles a contract is read against, what
// a contract check, a council's minutes and the weekly lines may keep, and
// the build door (/ai/build) that Law's nightly build calls.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { articlesFor, articleTexts, contractKind, cleanMinutes, LAW_FEATURES } from '../law-ai.js';
import { handleAiBuild } from '../ai.js';
import { EXAMPLES } from '../ai-fixtures.js';

const lease = EXAMPLES['law-contract'][0].input;
const job = EXAMPLES['law-contract'][1].input;

test('a contract: its kind from its words, the articles for its kind and its clauses', () => {
  assert.equal(contractKind('出租人與承租人約定租金每月'), 'rent');
  assert.equal(contractKind('時薪新臺幣180元，乙方為雇主之勞工'), 'work');
  assert.equal(contractKind('立切結書人保證'), 'pledge');
  assert.equal(contractKind('甲方委託乙方設計網站'), 'other');
  const rent = articlesFor({ kind: 'rent', clauses: lease.clauses });
  assert.ok(rent.includes('D0060125:7'), '押金: 租賃條例 §7');
  assert.ok(rent.includes('D0060125:8'), '修繕: §8');
  assert.ok(rent.includes('J0170001:11-1'), '審閱期');
  assert.deepEqual(rent.slice(-2), ['B0000001:71', 'B0000001:247-1'], 'the two every contract answers to, last and never cut');
  assert.equal(new Set(rent).size, rent.length);
  const work = articlesFor({ kind: 'work', clauses: job.clauses, minor: true });
  for (const k of ['N0030028:5', 'N0030001:15-1', 'N0030001:9-1', 'N0050001:6', 'N0030020:6', 'N0030001:44', 'B0000001:77']) assert.ok(work.includes(k), k);
  assert.ok(work.length <= 28);
  assert.ok(!articlesFor({ kind: 'rent', clauses: lease.clauses }).some(k => k.startsWith('N0030001')), 'a lease never brings the labour law');
});

test('the articles\' words from Law\'s own copy, cut to size, missing ones left out', async () => {
  const read = async p => ({ n: p === 'B0000001' ? '民法' : '租賃住宅市場發展及管理條例', a: [['A', '71', '法律行為，違反強制或禁止之規定者，無效。'], ['A', '7', '押金不得逾二個月租金之總額。'.repeat(200)]] });
  const out = await articleTexts(['B0000001:71', 'D0060125:7', 'D0060125:99'], read);
  assert.deepEqual(out.map(a => [a.key, a.n, a.label]), [['B0000001:71', '民法', '第71條'], ['D0060125:7', '租賃住宅市場發展及管理條例', '第7條']]);
  assert.ok(out[1].text.length <= 1001 && out[1].text.endsWith('…'));
});

test('a contract check keeps only flags on clauses given, citing articles given, with their numbers', () => {
  const f = LAW_FEATURES['law-contract'];
  const input = f.input({ ...lease, kind: 'rent' });
  input.arts = [
    { key: 'D0060125:7', n: '租賃住宅市場發展及管理條例', label: '第7條', text: '押金不得逾二個月租金之總額。' },
    { key: 'B0000001:71', n: '民法', label: '第71條', text: '法律行為，違反強制或禁止之規定者，無效。' }
  ];
  input.figs = [];
  const out = f.clean(
    {
      summary: '有 2 條要改，押金超過上限',
      flags: [
        { clause: 9, level: 'check', what: '放棄審閱期', why: '可以要求審閱', cites: ['B0000001:71'], ask: '' },
        { clause: 4, level: 'void', what: '押金三個月 28,500 元', why: '押金最多兩個月租金', cites: ['[D0060125:7]'], ask: '押金改成 19,000 元' },
        { clause: 4, level: 'unfair', what: '同一條第二次', why: 'x', cites: ['D0060125:7'], ask: '' },
        { clause: 40, level: 'void', what: '沒有這條', why: 'x', cites: ['D0060125:7'], ask: '' },
        { clause: 5, level: 'void', what: '修繕全由房客', why: '依第 8 條由出租人負責', cites: ['D0060125:8'], ask: '' },
        { clause: 3, level: 'unfair', what: '滯納金每日 999 元', why: 'x', cites: ['B0000001:71'], ask: '' }
      ],
      missing: [{ what: '押金何時返還', cites: ['D0060125:7'] }, { what: '沒給的條文', cites: ['X:1'] }]
    },
    input
  );
  assert.deepEqual(out.flags.map(x => [x.clause, x.level]), [[4, 'void'], [9, 'check']], 'sorted by level; a clause once; unknown clause, article and number dropped');
  assert.equal(out.flags[0].ask, '', 'an ask with a number not in the source is left out, the flag kept');
  assert.deepEqual(out.missing.map(m => m.what), ['押金何時返還']);
  assert.deepEqual(out.laws['D0060125:7'], ['租賃住宅市場發展及管理條例', '第7條']);
  assert.equal(out.kind, 'rent');
});

test('the contract tap\'s inputs: pictures or one PDF, clauses capped', () => {
  const read = LAW_FEATURES['law-contract-read'];
  const img = { mime_type: 'image/jpeg', data: 'A'.repeat(2000) };
  assert.ok(read.input({ files: [img, img] }));
  assert.equal(read.input({ files: [img, { mime_type: 'application/pdf', data: 'A'.repeat(2000) }] }), null, 'a PDF comes alone');
  assert.equal(read.input({ files: [{ mime_type: 'text/html', data: 'AAAA' }] }), null);
  assert.equal(read.input({}), null);
  const clean = read.clean({ kind: 'rent', title: '房屋租賃契約書', parties: [{ role: '承租人', who: '房客' }], clauses: [{ n: '一', text: '租金每月  9,500元' }, { n: '', text: 'x' }] });
  assert.deepEqual(clean.clauses, [{ n: '一', text: '租金每月 9,500元' }]);
  assert.equal(read.clean({ kind: 'none', clauses: [] }).kind, 'none');
  const check = LAW_FEATURES['law-contract'].input({ clauses: Array.from({ length: 100 }, (_, i) => ({ n: String(i), text: '條'.repeat(400) })) });
  assert.ok(check.clauses.length <= 35 && check.clauses.every((c, i) => c.id === i + 1));
});

test('minutes: rows in the minutes\' own words, proposers named there, results from the list', () => {
  const src = EXAMPLES['law-minutes'][0].input.text;
  const out = cleanMinutes(
    {
      items: [
        { no: '公所第1號', kind: '社政', by: '黄永欽', what: '辦理伸港鄉海尾社區活動中心廁所及關懷據點簡易廚房新建工程，合計1,070萬1,186元先行墊付', result: '通過', note: '', vote: '', d: '2026-01-15' },
        { no: '公所第2號', kind: '環保', by: '黄永欽、王大明', what: '補助本所垃圾車及資源回收車各1輛', result: '通過', note: '', vote: '贊成 9 票', d: '' },
        { no: '代表提案第9號', kind: '', by: '', what: '興建全鄉免費停車場與溫水游泳池', result: '通過' },
        { no: '公所第3號', by: '黄永欽', what: '老人文康中心屋頂防水修繕，合計999萬元', result: '通過' },
        { no: '公所第3號', by: '黄永欽', what: '老人文康中心屋頂防水修繕及牆面粉刷工程', result: '大概通過' }
      ]
    },
    { text: src }
  );
  assert.deepEqual(out.items.map(x => x.no), ['公所第1號', '公所第2號']);
  assert.equal(out.items[1].by, '黄永欽', 'a proposer not in the minutes is left out');
  assert.equal(out.items[1].vote, '', 'a count not in the minutes is left out');
  assert.equal(LAW_FEATURES['law-minutes'].input({ text: '太短' }), null);
});

test('weekly lines: one an item asked, its numbers its own, never cut', () => {
  const f = LAW_FEATURES['law-weekly'];
  const input = f.input(EXAMPLES['law-weekly'][0].input);
  assert.equal(input.items.length, 3);
  const out = f.clean(
    {
      items: [
        { id: '11:02513', line: '食品業者發現問題要主動通報，查驗分工更清楚' },
        { id: '11:01191', line: '自主都更門檻降到 50%' },
        { id: 'nope', line: '不在名單' },
        { id: 'K0040075@20261030', line: '酒駕吊照者重考前要上課，不配合治療超過二個月就拿不到證明，'.repeat(2) }
      ]
    },
    input
  );
  assert.deepEqual(out, { '11:02513': '食品業者發現問題要主動通報，查驗分工更清楚' });
});

test('the build door: Law\'s key, a build feature, the day\'s cap', async () => {
  const KEY = 'k'.repeat(32);
  const counts = new Map();
  const env = {
    LAW_BUILD_KEY: KEY,
    RATE_LIMIT_KV: { get: async k => counts.get(k) ?? null, put: async (k, v) => void counts.set(k, v) },
    ANTHROPIC_API_KEY: 'a',
    OPENAI_API_KEY: 'o'
  };
  const ask = (feature, key = KEY, input = EXAMPLES['law-weekly'][0].input) => new Request('https://w/ai/build', { method: 'POST', headers: { 'X-Build-Key': key }, body: JSON.stringify({ feature, input }) });
  const call = (req, cap = 2) => handleAiBuild(req, env, {}, {}, { cap }).then(async r => ({ status: r.status, ...(await r.json()) }));
  assert.equal((await call(ask('law-contract'))).error, 'feature', 'a tap never goes through the build door');
  assert.equal((await call(ask('news-lines'))).error, 'feature', 'another builder\'s job neither');
  assert.equal((await call(ask('law-weekly', 'x'.repeat(32)))).error, 'key');
  assert.equal((await call(ask('law-weekly', KEY, { items: [] }))).error, 'input');
  assert.equal((await call(ask('law-weekly'), 0)).error, 'cap', 'a cap of 0 pauses it');
  assert.equal((await call(new Request('https://w/ai/build'))).error, 'method');
});
