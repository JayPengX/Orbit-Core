// An Orbit AI allowance is taken as a call starts (ai-allow.js). Found
// 2026-11-17: on Class's 讀課表 and 一句話改課表, Money's 讀圖 and Law's 問法律 it
// was taken before the request was even read, so a picture of a kind that
// can't be read, a seventh file, the minute's limit or every model being
// down each cost one. Now a call that comes to nothing gives it back.
import test from 'node:test';
import assert from 'node:assert/strict';
import { wholeWorker } from './whole-worker.mjs';

const file = { mime_type: 'image/png', data: 'iVBORw0KGgo=' };
async function withAllowance(n = 5) {
  const t = wholeWorker({ GEMINI_API_KEY: '' });
  const a = await t.account('orbit');
  assert.equal((await t.admin('ai-grant', { wallet: a.id.slice(0, 8), rule: { n, per: 'month' } })).status, 200);
  const used = async () => {
    await t.settle();
    return Number((await t.sql('SELECT COALESCE(SUM(n), 0) AS n FROM ai_use WHERE k LIKE ?', `${a.id}|%`).first().catch(() => null))?.n) || 0;
  };
  const ask = (path, body) => t.send(`${path}?qt=${encodeURIComponent(a.token)}`, 'POST', body);
  return { t, a, used, ask };
}

test('讀課表: a request refused as it comes (a 7th file, a type it can\'t read) takes nothing from the allowance', async () => {
  const { used, ask } = await withAllowance(5);
  const seven = await ask('/gemini', { model: 'gemini-3.7-flash', files: Array(7).fill(file) });
  assert.equal(seven.status, 400);
  assert.equal(await used(), 0);
  const gif = await ask('/gemini', { model: 'gemini-3.7-flash', files: [{ ...file, mime_type: 'image/gif' }] });
  assert.equal(gif.data.error.code, 'FILE_PARSE_ERROR');
  assert.equal(await used(), 0);
});

test('一句話改課表: text too long is refused and nothing is taken; five such never use up five a month', async () => {
  const { used, ask } = await withAllowance(5);
  const plan = { weeklySchedule: { 1: [] }, classes: [], bellTimes: [], breakTimes: [], countdownEvents: [], reverseWeek: false };
  for (let i = 0; i < 6; i++) {
    const r = await ask('/nl-edit', { model: 'gemini-3.7-flash', text: 'x'.repeat(201), context: plan });
    assert.equal(r.data.error.code, 'MISSING_TEXT', `ask ${i + 1}: still answered for what it is, never AI_USED`);
  }
  assert.equal(await used(), 0);
});

test('an allowance used up still refuses, and a pass with none is still PASS_LEVEL', async () => {
  const { t, a, ask } = await withAllowance(1);
  await t.sql('CREATE TABLE IF NOT EXISTS ai_use (k TEXT PRIMARY KEY, n INTEGER NOT NULL, e INTEGER NOT NULL)').run();
  const month = new Date(Date.now() + 8 * 3_600_000).toISOString().slice(0, 7);
  await t.sql('INSERT INTO ai_use (k, n, e) VALUES (?, 1, ?)', `${a.id}|month:${month}`, Date.now() + 86_400_000).run();
  const r = await ask('/gemini', { model: 'gemini-3.7-flash', files: [file] });
  assert.equal(r.status, 429);
  assert.equal(r.data.error.code, 'AI_USED');
  await t.settle();
  assert.equal((await t.sql('SELECT n FROM ai_use WHERE k = ?', `${a.id}|month:${month}`).first()).n, 1, 'nothing given back that wasn\'t taken');
  assert.equal((await t.admin('ai-grant', { wallet: a.id.slice(0, 8), rule: { n: 0, per: 'month' } })).status, 200);
  assert.equal((await ask('/gemini', { model: 'gemini-3.7-flash', files: [file] })).data.error.code, 'PASS_LEVEL');
});
