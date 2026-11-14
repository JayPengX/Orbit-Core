// 問 Orbit (kit/ask-orbit.mjs): the words pick the app, code only; the question rides #ask= and is taken once.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { routeAsk, takeAsk } from '../kit/ask-orbit.mjs';

test('ask-orbit: the words pick the app', () => {
  const cases = { 明天要帶傘嗎: 'weather', 去台北車站: 'transit', 明天八點前到台大醫院: 'transit', 現在回家: 'transit', 湖人排第幾: 'match', 我這個月花多少: 'money', 下一節什麼課: 'orbit', 台積電股價: 'stock', 闖紅燈罰多少: 'law', 今天有什麼新聞: 'news', 下雨到幾點: 'weather' };
  for (const [q, app] of Object.entries(cases)) assert.equal(routeAsk(q), app, q);
  assert.equal(routeAsk('你好'), null);
});

test('ask-orbit: the question taken out of the address', () => {
  const loc = { hash: '#ask=%E5%8E%BB%E5%8F%B0%E5%8C%97&qh=x', pathname: '/transit/', search: '' };
  let to = null;
  globalThis.history = { state: null, replaceState: (_s, _t, u) => (to = u) };
  assert.equal(takeAsk(loc), '去台北');
  assert.equal(to, '/transit/#qh=x');
  assert.equal(takeAsk({ hash: '#go' }), '');
});

test('ask-orbit: a question about the day is Orbit 助理’s, before any app’s words', () => {
  for (const q of ['今天要注意什麼', '明天要準備什麼', '我明天有什麼行程', '這週末有空嗎', '今天要帶什麼']) assert.equal(routeAsk(q), 'assist', q);
  // (An app's own question stays the app's.)
  assert.equal(routeAsk('今天有什麼新聞'), 'news');
  assert.equal(routeAsk('明天要帶傘嗎'), 'weather');
});

test('ask-orbit: a command goes to the app that does it (kit act.mjs)', () => {
  const cases = { '開始專注飛行 50 分鐘': 'orbit', '加段考倒數 11/30': 'orbit', 背十個單字: 'vocab', 追蹤湖人: 'match', 追蹤公鹿: 'match', 追蹤台積電: 'stock' };
  for (const [q, app] of Object.entries(cases)) assert.equal(routeAsk(q), app, q);
});
