import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanReport, groupReports, deviceOf, routeErrors, weekOf, runRecWeekly, REC_WEEKLY } from '../rec-weekly.js';
import { FEATURES } from '../ai-features.js';

const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_1 like Mac OS X) AppleWebKit/605.1.15';
const report = (app, msgs, ua = iphone) => ({ app, ua, kit: 'k1', log: [...msgs.map((m, i) => ({ at: 1000 + i, kind: 'error', data: { message: m, at: 'app.js:1:2' } })), { at: 5, kind: 'screen', data: { hash: '#secret-screen' } }] });

test('a report keeps only what went wrong', () => {
  const r = cleanReport(report('transit', ['x is undefined']), 99);
  assert.equal(r.app, 'transit');
  assert.equal(r.log.length, 1);
  assert.ok(!JSON.stringify(r).includes('secret-screen'));
  assert.equal(cleanReport({ app: '../x' }), null);
  // (Too big: the oldest dropped till it fits.)
  const big = cleanReport({ app: 'news', log: Array.from({ length: 900 }, (_, i) => ({ at: i, kind: 'error', data: { message: 'm'.repeat(1900) } })) });
  assert.ok(JSON.stringify(big).length <= 200_000 && big.log.length > 0);
});

test('groups: the same message once, numbers aside, counted by reports', () => {
  const g = groupReports([report('transit', ['bus 307 failed', 'bus 999 failed']), report('transit', ['bus 12 failed']), report('match', ['oops'], 'Mozilla/5.0 (iPad; CPU OS 18_2 like Mac OS X)')]);
  assert.equal(g[0].app, 'transit');
  assert.equal(g[0].reports, 2);
  assert.equal(g[0].n, 3);
  assert.deepEqual(g[1].devices, ['iPad iOS 18']);
  assert.equal(deviceOf(iphone), 'iPhone iOS 26');
});

test('the week: Monday in Taiwan; route errors summed over 7 days', () => {
  // 2026-11-11 is a Wednesday.
  assert.equal(weekOf(Date.UTC(2026, 10, 11, 5)), '2026-11-09');
  // (Sunday 23:00 UTC is Monday in Taiwan.)
  assert.equal(weekOf(Date.UTC(2026, 10, 15, 23)), '2026-11-16');
  assert.deepEqual(routeErrors({ 'err:/transit:2026-11-10': 3, 'err:/transit:2026-11-11': 2, 'err:/ai:2026-10-01': 9, other: 1 }, Date.UTC(2026, 10, 11, 5)), { '/transit': 5 });
});

test('rec-weekly answers only for the groups code made', () => {
  const groups = [{ id: 'g1' }];
  const out = FEATURES['rec-weekly'].clean({ summary: '平靜的一週', groups: [{ id: 'g1', title: '地圖載入失敗', why: '打開地圖時出錯', level: 'fix' }, { id: 'g9', title: '亂編', why: '', level: 'fix' }] }, { groups });
  assert.deepEqual(out.groups.map(g => g.id), ['g1']);
  assert.equal(FEATURES['rec-weekly'].clean({ groups: [{ id: 'zz', title: 'x' }] }, { groups }), null);
});

test('once a week, from 06:00 Monday morning in Taiwan', async () => {
  const files = new Map([[`private/bugs/2026-11-10/abc-1.json`, report('transit', ['boom'])]]);
  const store = { json: async p => files.get(p) ?? null, list: async prefix => [...files.keys()].filter(k => k.startsWith(prefix)), put: async (p, d) => files.set(p, d) };
  let asked = null;
  const aiOnce = async (env, ctx, name, input) => ((asked = input), { out: { summary: '一個錯誤', groups: [{ id: 'g1', title: '轉乘失敗', why: '查路線時出錯', level: 'fix' }] }, model: 'haiku' });
  const now = Date.UTC(2026, 10, 11, 1);
  const r = await runRecWeekly({ store, now, aiOnce, cap: 5 });
  assert.equal(r.reports, 1);
  assert.equal(asked.groups[0].sample, 'boom');
  assert.equal(files.get(REC_WEEKLY).groups[0].title, '轉乘失敗');
  // (Made this week: kept.)
  asked = null;
  await runRecWeekly({ store, now: now + 3_600_000, aiOnce, cap: 5 });
  assert.equal(asked, null);
});
