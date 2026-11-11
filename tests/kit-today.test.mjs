// 今天 on the Orbit Pass sheet (kit/today.mjs): a row for each app that has
// told the family something for today, each opening its app.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const store = new Map();
globalThis.localStorage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
const F = await import('../kit/family.mjs');
const { todayRows } = await import('../kit/today.mjs');

// 2026-11-10 (Tue) 10:30 in Taiwan.
const now = Date.parse('2026-11-10T02:30:00Z');

test('nothing told, no rows', () => {
  assert.deepEqual(todayRows({ now }), []);
});

test('the class on, the umbrella, words due and a followed game, in that order', () => {
  F.tell('class', 'days', {
    '2026-11-10': [{ n: 3, name: '數學', from: '10:10', to: '11:00' }, { n: 4, name: '體育', from: '11:10', to: '12:00', out: true }],
    '2026-11-11': [{ n: 1, name: '國文', from: '08:10', to: '09:00' }]
  }, now);
  F.tell('weather', 'today', { day: '2026-11-10', word: '今天', lines: [{ kind: 'umbrella', level: 'yes', text: '雨傘：要帶，15時 70%' }, { kind: 'pe', level: 'yes', text: '體育課：11:10 體育，雨 60%，可能改室內' }, { kind: 'wear', level: 'none', text: '穿著：短袖 24–29°' }] }, now);
  F.tell('vocab', 'due', { day: '2026-11-10', n: 12 }, now);
  F.tell('sports', 'next', [{ at: Date.parse('2026-11-10T11:00:00Z'), title: '湖人 vs 勇士', hash: '#event=nba:1' }, { at: Date.parse('2026-11-11T00:00:00Z'), title: '道奇 vs 洋基', hash: 'event=mlb:2' }], now);
  const rows = todayRows({ now });
  assert.deepEqual(rows.map(r => [r.app, r.title, r.sub]), [
    ['orbit', '第 3 節 數學', '上課中，11:00 下課'],
    ['weather', '雨傘：要帶，15時 70%', '體育課：11:10 體育，雨 60%，可能改室內'],
    ['vocab', '12 個單字該複習', '先背 5 個'],
    ['match', '湖人 vs 勇士', '19:00'],
    ['match', '道奇 vs 洋基', '明天 08:00']
  ]);
  assert.equal(rows[2].hash, 'five');
  assert.equal(rows[3].hash, 'event=nba:1');
});

test('the evening shows tomorrow’s first class; old facts are left out', () => {
  const evening = Date.parse('2026-11-10T11:00:00Z'); // 19:00
  const rows = todayRows({ now: evening, en: true });
  assert.deepEqual(rows[0], { app: 'orbit', hash: '', title: 'Period 1, 國文', sub: 'Tomorrow’s first, at 08:10' });
  const later = Date.parse('2026-11-12T02:30:00Z');
  assert.deepEqual(todayRows({ now: later }).filter(r => r.app !== 'orbit'), []);
});

test('Orbit 助理’s facts: the days’ classes, the weather, games (one in class time says so), days off, trips; each an id', async () => {
  const { dayFacts } = await import('../kit/today.mjs');
  const at = Date.parse('2026-11-10T02:30:00Z'); // Tue 10:30
  F.tell('class', 'days', { '2026-11-10': [{ n: 3, name: '數學', from: '10:10', to: '11:00' }, { n: 4, name: '體育', from: '11:10', to: '12:00', out: true }] }, at);
  F.tell('sports', 'games', [{ id: 'nba:1', at: Date.parse('2026-11-10T03:20:00Z'), mins: 150, title: '湖人 vs 勇士', hash: '#event=nba:1' }], at);
  F.tell('transit', 'trips', [{ name: '回家', from: null, to: { lat: 24.8, lon: 121, name: '家' } }], at);
  const facts = dayFacts({ now: at, holiday: d => (d === '2026-11-12' ? { zh: '國父誕辰', en: 'Sun Yat-sen’s birthday' } : null), plan: p => `#plan?to=${p.lat},${p.lon}` });
  const ids = new Set(facts.map(f => f.id));
  assert.equal(ids.size, facts.length);
  const cls = facts.find(f => f.app === 'orbit' && /節課/.test(f.label));
  assert.match(cls.text, /今天（11\/10 週二） 上課 10:10–12:00: 3 數學 10:10, 4 體育 11:10（戶外）/);
  const game = facts.find(f => f.app === 'match');
  assert.match(game.text, /正在上第4節體育/);
  assert.equal(game.hash, 'event=nba:1');
  assert.ok(facts.some(f => /國父誕辰/.test(f.text) && /11\/12/.test(f.text)));
  assert.equal(facts.find(f => f.app === 'transit').hash, 'plan?to=24.8,121');
});
