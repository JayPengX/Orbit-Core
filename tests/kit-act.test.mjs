// kit/act.mjs: a command said to an app, read by code (no AI call).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readAct, minutesIn, datesIn, zhNumber } from '../kit/act.mjs';

const now = new Date(2026, 10, 14, 15, 0);

test('act: numbers and lengths in words', () => {
  assert.equal(zhNumber('二十五'), 25);
  assert.equal(zhNumber('十'), 10);
  assert.equal(zhNumber('九十'), 90);
  assert.equal(zhNumber('兩'), 2);
  const cases = { '50 分鐘': 50, 五十分鐘: 50, 一小時: 60, 半小時: 30, 一個半小時: 90, '1.5 小時': 90, '90 min': 90, '2h': 120, 兩小時: 120, '1 小時 20 分': 80, 二十五分鐘: 25 };
  for (const [s, n] of Object.entries(cases)) assert.equal(minutesIn(s), n, s);
  assert.equal(minutesIn('開始專注'), null);
});

test('act: a focus started', () => {
  assert.deepEqual(readAct('開始專注飛行 50 分鐘', { now }), { app: 'orbit', act: 'focus', minutes: 50 });
  assert.deepEqual(readAct('start a flight focus', { now }), { app: 'orbit', act: 'focus', minutes: null });
  assert.equal(readAct('我要讀書一小時', { now }).minutes, 60);
  assert.equal(readAct('專心 25 分鐘', { now }).minutes, 25);
  assert.equal(readAct('focus for 45 minutes', { now }).minutes, 45);
  // (Questions and other features are not a focus.)
  assert.equal(readAct('專注飛行怎麼用？', { now }), null);
  assert.equal(readAct('幫我排讀書計畫', { now }), null);
  assert.equal(readAct('讀書', { now }), null);
  assert.equal(readAct('下一節什麼課', { now }), null);
});

test('act: a countdown added', () => {
  assert.deepEqual(readAct('加一個段考倒數 11/30', { now }), { app: 'orbit', act: 'countdown', name: '段考', start: '2026-11-30', end: '' });
  assert.deepEqual(readAct('新增倒數：學測 1/17', { now }), { app: 'orbit', act: 'countdown', name: '學測', start: '2027-01-17', end: '' });
  assert.deepEqual(readAct('期末考倒數 2027年1月20日到1月22日', { now }), { app: 'orbit', act: 'countdown', name: '期末考', start: '2027-01-20', end: '2027-01-22' });
  assert.equal(readAct('畢業旅行倒數 12/30-1/2', { now }).end, '2027-01-02');
  assert.equal(readAct('段考倒數 11/30-12/2', { now }).end, '2026-12-02');
  // (No date, or no name: not one; a date past this year's is next year's.)
  assert.equal(readAct('加倒數', { now }), null);
  assert.equal(readAct('倒數 11/30', { now }), null);
  assert.equal(datesIn('11/14', now).start, '2026-11-14');
  assert.equal(datesIn('11/13', now).start, '2027-11-13');
  assert.equal(datesIn('2/30', now), null);
});

test('act: a team followed, a round of words', () => {
  assert.deepEqual(readAct('追蹤湖人', { now }), { app: 'match', act: 'follow', name: '湖人' });
  assert.deepEqual(readAct('幫我追蹤 洋基 這隊', { now }), { app: 'match', act: 'follow', name: '洋基' });
  assert.deepEqual(readAct('follow the Lakers', { now }), { app: 'match', act: 'follow', name: 'the Lakers' });
  assert.deepEqual(readAct('背 10 個單字', { now }), { app: 'vocab', act: 'practice', size: 10 });
  assert.deepEqual(readAct('開始練習單字', { now }), { app: 'vocab', act: 'practice', size: null });
  assert.equal(readAct('考我五個單字', { now }).size, 5);
  assert.equal(readAct('abandon 是什麼意思', { now }), null);
  assert.equal(readAct('add a Competition countdown on 12/1', { now }).name, 'Competition');
});
