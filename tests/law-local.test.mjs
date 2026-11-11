// 問法律 about the councils and the 代表會 (law-local.js): which a question
// names, the words it searches, the rows of a 代表會's papers, what may be cited.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { placesIn, searchWords, paperRows, localPrompt, localCites, localOut, asksLocal, talksOf, localFor } from '../law-local.js';
import { shownOf } from '../law-chat.js';

const idx = { councils: [{ c: 'tpe', n: '臺北市議會', city: '臺北市' }, { c: 'cha', n: '彰化縣議會', city: '彰化縣' }, { c: 'hsq', n: '新竹縣議會', city: '新竹縣' }, { c: 'hsz', n: '新竹市議會', city: '新竹市' }] };
const reps = { places: [{ city: '彰化縣', towns: [{ town: '溪湖鎮', tc: '10007110', reps: [['楊大明', '無黨籍', '第1選區']] }, { town: '彰化市', tc: '10007010', reps: [] }] }, { city: '新竹縣', towns: [{ town: '竹北市', tc: '10004010', reps: [] }] }] };
const names = r => [r.councils.map(c => c.c), r.towns.map(t => t.tc)];

test('the councils and 代表會 a question names', () => {
  assert.ok(asksLocal('溪湖鎮代表會最近通過什麼') && !asksLocal('房東可以扣押金嗎'));
  assert.deepEqual(names(placesIn('台北市議會有沒有討論停車', idx, reps)), [['tpe'], []], '台 as 臺');
  assert.deepEqual(names(placesIn('溪湖鎮民代表會最近通過什麼', idx, reps)), [[], ['10007110']]);
  assert.deepEqual(names(placesIn('溪湖代表有提案嗎', idx, reps)), [[], ['10007110']], 'a town by its short name beside 代表');
  assert.deepEqual(names(placesIn('彰化縣議員和溪湖鎮代表會', idx, reps)), [['cha'], ['10007110']]);
  assert.deepEqual(names(placesIn('議員有討論營養午餐嗎', idx, reps, ['新竹縣'])), [['hsq'], []], 'the reader\'s city when none is named');
  assert.deepEqual(names(placesIn('新竹市議會', idx, reps)), [['hsz'], []]);
  assert.deepEqual(names(placesIn('新竹議會', idx, reps)).map(x => x.sort()), [['hsq', 'hsz'], []], '新竹 alone: both');
  assert.deepEqual(names(placesIn('民法的代表人是誰', idx, reps)), [[], []]);
});

test('a search\'s words: the plan\'s terms first, the question\'s own after, never 議會 or 提案', () => {
  assert.deepEqual(searchWords('彰化縣議會有沒有人提案改善停車問題', ['停車']), ['停車', '彰化縣']);
  assert.deepEqual(searchWords('議會有討論營養午餐嗎'), ['營養午餐']);
});

test('a 代表會\'s paper as rows: proposals with their 議決, 決議案, 質詢', () => {
  const rows = paperRows({ items: [{ no: '鎮長提案第1號', by: '', what: '資源回收車1台墊付', result: '通過', note: '', vote: '', d: '2025-04-01' }], res: [{ 案號: '溪代字第3號', 提案人: '楊大明', 案由: '建請公所改善路燈', 議決: '送公所研辦' }], wq: [{ no: '1', w: '楊大明', ask: '路燈何時修', reply: '已發包', d: '2025-04-02' }], asks: [{ w: '楊大明', gist: '問路燈' }, { w: 'x', gist: '' }] }, '第6次定期會');
  assert.deepEqual(rows.map(r => [r.k, r.t, r.r]), [['提案', '資源回收車1台墊付', '通過'], ['決議案', '建請公所改善路燈', '送公所研辦'], ['書面質詢', '路燈何時修', '已發包'], ['質詢', '問路燈', '']]);
});

test('each bill and row quoted by an id the answer may cite; only those cited shown', () => {
  const l = { councils: [{ c: 'cha', n: '彰化縣議會', term: 20, people: [], bills: [{ id: 'cha-1', t: '停車', by: '甲', res: '通過', d: '' }, { id: 'cha-2', t: '路燈', by: '乙', res: '', d: '' }] }], towns: [{ tc: '10007110', n: '溪湖鎮民代表會', city: '彰化縣', term: 22, reps: 12, people: [], sessions: [], rows: [{ id: 'tw:10007110:1', k: '提案', s: '第6次定期會', no: '', by: '', t: '回收車', r: '通過', d: '' }] }] };
  assert.deepEqual(localCites(l), ['cc:cha-1', 'cc:cha-2', 'tw:10007110:1']);
  const p = localPrompt(l);
  assert.ok(p.includes('[cite "cc:cha-1"]') && p.includes('[cite "tw:10007110:1"]') && p.includes('議決：通過'));
  assert.equal(localPrompt({ councils: [], towns: [] }), '');
  const shown = shownOf(localOut(l), { cited: ['cc:cha-2'] });
  assert.deepEqual(shown.local.councils[0].bills.map(b => b.id), ['cha-2']);
  assert.deepEqual(shown.local.towns[0].rows, [], 'the 代表會 stays, its rows only when cited');
});

test('what councillors said: a row a councillor\'s sitting, the turn on the question\'s words, never the chair\'s', () => {
  const t = (id, d, who, kind, text, meet = 'm1') => ({ 代碼: id, 日期: d, 姓名: who, 身分類別: kind, 會議代碼: meet, 發言內容: text, 來源網址: 'https://obas.example/x.pdf' });
  const rows = [
    t('a1', '2026-08-25', '林世宗', '議員', '局長，我們繼續質詢。'),
    t('a2', '2026-08-25', '林世宗', '議員', '公有停車場的收費太高，晚上空著也不開放，請交通局檢討停車費率與夜間開放。'),
    t('a3', '2026-08-25', '林世宗', '議員', '另外里民反映路燈不亮已經三個月，請工務局盡快處理，這是很基本的事情。'),
    t('b1', '2026-08-25', '蔣萬安', '政府機關首長', '謝謝議員關心停車的問題，我們會研議。'),
    t('c1', '2026-08-21', '張文潔', '議員', '建管處不是沒有工具，只是選擇不用，違章停車場應該要處理。', 'm2')
  ];
  const out = talksOf(rows, new Set(['停車', '車場', '費率']));
  assert.deepEqual(out.map(x => [x.id, x.who]), [['a2', '林世宗'], ['c1', '張文潔']]);
  const l = { councils: [{ c: 'tpe', n: '臺北市議會', term: 14, people: [], bills: [], talks: out }], towns: [] };
  assert.deepEqual(localCites(l), ['cq:a2', 'cq:c1']);
  assert.ok(localPrompt(l).includes('[cite "cq:a2"] 2026-08-25，議員 林世宗'));
  assert.deepEqual(shownOf(localOut(l), { cited: ['cq:c1'] }).local.councils[0].talks.map(x => x.id), ['c1']);
});

test('a question about what a councillor said asks the transcripts, by name', async () => {
  const asked = [];
  const read = async p => (p === 'council/tpe.json' ? { n: '臺北市議會', term: 14, people: [{ id: '1', n: '林世宗', party: '國民黨', area: '第一選區' }], bills: [] } : null);
  const get = async url => (asked.push(decodeURIComponent(url)), url.includes('meet_transcripts') ? { meet_transcripts: [{ 代碼: 'x1', 日期: '2026-08-25', 姓名: '林世宗', 身分類別: '議員', 會議代碼: 'm', 發言內容: '公有停車場的收費太高，晚上空著也不開放。' }] } : { bills: [] });
  const ground = async p => (p === 'council/index.json' ? idx : reps);
  const l = await localFor('臺北市議員林世宗質詢過停車費嗎', { terms: ['停車費'], read, get, ground });
  assert.ok(asked.some(u => u.includes('meet_transcripts') && u.includes('姓名=林世宗')));
  assert.deepEqual(l.councils[0].talks.map(x => x.id), ['x1']);
});
