// What /law-chat finds besides the articles: judgments, 釋字, 行政規則, legislators, votes, meetings, the reader's own.
import test from 'node:test';
import assert from 'node:assert/strict';
import { matchRulings, matchCons, judgmentGist, readMine, asksMine, matchVotes, matchMeets, matchRules, caseLabel, ruleTitle, vendorHits, vendorText } from '../law-more.js';

test('judgments: 3 for each article found they cite, the 案由 sharing the question; 3 at least, newer first', () => {
  const rows = [['TPSV,114,台上,1,20250101,1', '2025-01-01', '請求返還押金', ['B0000001:456']], ['TPSV,114,台上,2,20260101,1', '2026-01-01', '請求返還押金', ['B0000001:456']], ['TPSM,115,台上,3,20260101,1', '2026-01-01', '加重詐欺', ['C0000001:339']], ['bad', '', '押金', []]];
  assert.deepEqual(matchRulings(rows, ['B0000001:456'], '房東不還押金').map(r => r.jid), ['TPSV,114,台上,2,20260101,1', 'TPSV,114,台上,1,20250101,1']);
  assert.deepEqual(matchRulings(rows, ['C0000001:339'], '詐欺被抓會判多久').map(r => r.jid), ['TPSM,115,台上,3,20260101,1']);
  assert.equal(caseLabel('TPSM,115,台上,3,20260101,1'), '最高法院刑事 115年度台上字第3號');
  assert.equal(caseLabel('s748'), '司法院釋字第748號');
});

test('釋字 and 憲判字 by the articles they read and their name', () => {
  const rows = [['s748', '2017-05-24', '同婚案', '民法未使相同性別二人得成立婚姻關係是否違憲', ['B0000001:972'], [], []], ['j111-10', '2022-01-01', '其他', '', ['A0000001:8'], [], []]];
  assert.deepEqual(matchCons(rows, ['B0000001:972'], '同性可以結婚嗎').map(r => r.jid), ['s748']);
  assert.deepEqual(matchCons(rows, [], '同性婚姻 婚姻關係 違憲').map(r => r.jid), ['s748']);
});

test('a judgment page read in brief: 主文, then the reasons', () => {
  assert.equal(judgmentGist('<div class="htmlcontent"><div>主　文</div><div>原判決撤銷。</div><div>理　由</div><div>一、本件上訴人主張。</div></div>'), '主文：原判決撤銷。／理由：一、本件上訴人主張。');
  assert.equal(judgmentGist('<html>no content</html>'), '');
});

test('the reader\'s own: checked, capped, used only when asked about', () => {
  assert.deepEqual(readMine({ laws: ['B0000001', 'x'], items: ['11:01126'], people: [1261], marks: ['B0000001:184'] }), { laws: ['B0000001'], items: ['11:01126'], people: ['1261'], marks: ['B0000001:184'] });
  assert.equal(readMine({ laws: 'B0000001' }), 'mine');
  assert.ok(asksMine('我追蹤的法案有進度嗎'));
  assert.ok(!asksMine('押金怎麼辦'));
});

test('votes: a law found first; a named legislator\'s newest; none without vote words or names', () => {
  const data = { names: ['甲', '乙'], votes: [['v1', '2026-01-01', '民法修正', 'a', [0], [], [], ['B0000001']], ['v2', '2026-02-01', '其他', 'a', [1], [], [], []]] };
  assert.deepEqual(matchVotes(data, '民法修法表決結果', ['B0000001'], []).map(v => v[0]), ['v1']);
  assert.deepEqual(matchVotes(data, '乙最近投了什麼', [], [{ n: '乙' }]).map(v => v[0]), ['v2']);
  assert.deepEqual(matchVotes(data, '押金怎麼辦', ['B0000001'], []), []);
});

test('meetings: only on a question about when, coming ones, soonest first', () => {
  const meets = [{ id: 'b', title: '審查民法', days: [{ d: '2026-11-02' }] }, { id: 'a', title: '審查民法', days: [{ d: '2026-10-25' }] }, { id: 'old', title: '審查民法', days: [{ d: '2026-01-01' }] }];
  assert.deepEqual(matchMeets(meets, '民法什麼時候審查', ['民法'], '2026-10-21').map(m => m.id), ['a', 'b']);
  assert.deepEqual(matchMeets(meets, '民法押金', ['民法'], '2026-10-21'), []);
});

test('行政規則: by their name\'s pairs and the articles they rest on', () => {
  const rows = [['教育部:1', '高級中等學校輔導學生會及其他相關自治組織運作注意事項', '教育部', '2024-01-01', 'https://edu.law.moe.gov.tw/LawContent.aspx?id=1', [], []], ['教育部:2', '校園安全注意事項', '教育部', '2024-01-01', '', [], []]];
  assert.deepEqual(matchRules(rows, '高中學生會可以自己選會長嗎？學生自治組織', []).map(r => r.id), ['教育部:1']);
});

test('a rule named in the question, found on a ministry site and read', () => {
  assert.equal(ruleTitle('高級中等學校訂定學生服裝儀容規定之原則有哪些？'), '高級中等學校訂定學生服裝儀容規定之原則');
  assert.equal(ruleTitle('請問高級中等學校輔導學生會及其他相關自治組織運作注意事項怎麼規定'), '高級中等學校輔導學生會及其他相關自治組織運作注意事項');
  assert.equal(ruleTitle('加班費怎麼算'), '');
  assert.deepEqual(vendorHits('<a href="LawContent.aspx?id=GL002011&amp;kw=x" title="t"><span>高級中等學校訂定學生服裝儀容規定之原則</span></a>'), [{ id: 'GL002011', name: '高級中等學校訂定學生服裝儀容規定之原則' }]);
  assert.equal(vendorText('<div id="ctl00_cp_content_divLawContent1">一、目的。<br>二、範圍&amp;對象。</div>'), '一、目的。\n二、範圍&對象。');
});
