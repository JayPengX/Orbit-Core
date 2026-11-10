// The family's AI door (ai.js, ai-features.js): a tap's caps, its backup
// model, ask-back options, what an answer may keep, and the AI tab's money.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleAi, runFeature, moneyLeft, spendOf, healthOf, withAsk, askOf, answersOf, MAX_ROUNDS, jsonOf } from '../ai.js';
import { FEATURES, numbersFrom } from '../ai-features.js';

const ev = o => `event: ${o.type}\ndata: ${JSON.stringify(o)}\n\n`;
const sse = obj => new Response([{ type: 'message_start', message: { usage: { input_tokens: 100 } } }, { type: 'content_block_delta', delta: { type: 'text_delta', text: JSON.stringify(obj) } }, { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 20 } }].map(ev).join(''));
const openai = obj => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(obj) }, finish_reason: 'stop' }], usage: { prompt_tokens: 90, completion_tokens: 15 } }));

// A relay answering by maker: `answers[maker]` a function of the request body, or a status.
function envWith(answers, seen = []) {
  return {
    ANTHROPIC_API_KEY: 'a',
    OPENAI_API_KEY: 'o',
    GEMINI_RELAY: {
      fetch: async (u, init) => {
        const to = new URL(u).searchParams.get('to');
        const maker = to.includes('anthropic') ? 'anthropic' : 'openai';
        const body = JSON.parse(init.body);
        seen.push({ maker, model: body.model, body });
        const a = answers[maker];
        if (typeof a === 'number') return new Response(JSON.stringify({ error: { message: 'x' } }), { status: a });
        return maker === 'anthropic' ? sse(a(body)) : openai(a(body));
      }
    }
  };
}
const tap = (feature, input, session = { a: 'money', d: 'pass1' }) => new Request('https://w/ai', { method: 'POST', headers: { Origin: 'https://orbit.jaypengx.com' }, body: JSON.stringify({ feature, input }) });

test('a tap: only its own app, only its fixed prompt, capped a Pass a day and in all', async () => {
  const env = envWith({ openai: () => ({ buys: [{ k: 'out', day: '', store: '火鍋', total: 350, items: [], cat: 'c1', pay: '', invoice: '' }], ask: { q: '', options: [] } }) });
  const input = { text: '跟同學吃火鍋花了三百五', today: '2026-11-10', cats: [{ id: 'c1', name: '餐飲 › 晚餐', k: 'out' }] };
  const call = (session, cap = 5, feature = 'money-say') => handleAi(tap(feature, input), env, {}, {}, session, { cap }).then(async r => ({ status: r.status, ...(await r.json()) }));
  assert.equal((await call({ a: 'vocab', d: 'p' })).error, 'signin', 'another app’s session');
  assert.equal((await call({ a: 'money', d: 'p' }, 5, 'nope')).error, 'feature');
  assert.equal((await call({ a: 'money', d: 'p' }, 5, 'words-cards')).error, 'feature', 'a built-once job is never a tap');
  const ok = await call({ a: 'money', d: 'p2' });
  assert.equal(ok.status, 200);
  assert.deepEqual(ok.out.buys, [{ k: 'out', day: '2026-11-10', store: '火鍋', total: 350, items: [], cat: 'c1', pay: '', invoice: '' }]);
  assert.equal(ok.ask, null, 'nothing unclear: no question');
  assert.equal(ok.model, 'openai');
  assert.equal(ok.left, FEATURES['money-say'].perPass - 1);
  assert.equal((await call({ a: 'money', d: 'p3' }, 0)).error, 'cap', '0 pauses it');
});

test('a model failing: the next one answers', async () => {
  const seen = [];
  const env = envWith({ openai: 503, anthropic: () => ({ buys: [{ k: 'out', day: '2026-11-09', store: '早餐', total: 45, items: [], cat: '', pay: '', invoice: '' }], ask: { q: '', options: [] } }) }, seen);
  const r = await runFeature(env, {}, 'money-say', { text: '昨天早餐 45', today: '2026-11-10', cats: [] });
  assert.deepEqual(seen.map(s => s.model), ['gpt-6-luna', 'claude-haiku-5-5']);
  assert.equal(r.out.buys[0].total, 45);
});

test('ask back: one short question with options, the answers sent again, three rounds at most', async () => {
  const seen = [];
  const env = envWith({ openai: () => ({ buys: [{ k: 'out', day: '2026-11-10', store: '便當', total: 120, items: [], cat: '', pay: '', invoice: '' }], ask: { q: '午餐還是晚餐？', options: ['午餐', '晚餐', '', 'x'.repeat(40)] } }) }, seen);
  const r = await runFeature(env, {}, 'money-say', { text: '便當 120', today: '2026-11-10', cats: [] }, { answers: [] });
  assert.equal(r.ask.q, '午餐還是晚餐？');
  assert.deepEqual(r.ask.options.slice(0, 2), ['午餐', '晚餐']);
  assert.equal(r.ask.options.length, 3, 'empty options dropped');
  assert.ok(seen[0].body.response_format.json_schema.schema.properties.ask, 'the schema has the question');
  const answers = answersOf([{ q: '午餐還是晚餐？', a: '晚餐' }]);
  const { parts } = withAsk([{ text: 'p' }], FEATURES['money-say'].schema, answers);
  assert.match(parts[0].text, /A: 晚餐/);
  const full = answersOf(Array(5).fill({ q: 'q', a: 'a' }));
  assert.equal(full.length, MAX_ROUNDS);
  assert.match(withAsk([{ text: 'p' }], FEATURES['money-say'].schema, full).parts[0].text, /Do not ask anything more/);
  assert.equal(askOf({ ask: { q: 'q', options: ['a', 'b'] } }, full), null, 'past the last round: no question');
  assert.equal(askOf({ ask: { q: 'q', options: ['a'] } }, []), null, 'one option is no choice');
  const lists = { pay: [{ id: 'p1', name: '台新' }, { id: 'p2', name: '現金' }] };
  assert.deepEqual(askOf({ ask: { q: '用哪個付？', field: 'pay', options: ['p2', 'zz', 'p2'] } }, [], lists), { q: '用哪個付？', field: 'pay', options: ['p2'] }, 'ids from their own list only; one left still asks (其他 opens the list)');
  assert.deepEqual(askOf({ ask: { q: 'q', field: 'subject', options: ['a', 'b'] } }, [], lists), { q: 'q', options: ['a', 'b'] }, 'a list it doesn’t have: plain chips');
  assert.deepEqual(withAsk([{ text: 'p' }], FEATURES['money-say'].schema, [], false, ['cat', 'pay']).schema.properties.ask.properties.field.enum, ['', 'cat', 'pay']);
});

test('what an answer may keep: numbers from the facts, words the notice wrote, cards for words asked', async () => {
  assert.equal(numbersFrom('洋基 7 比 3 擊敗紅襪', '7-3 洋基'), true);
  assert.equal(numbersFrom('第 9 局逆轉', '7-3'), false);
  const facts = 'Teams: {t:1} = home\n{t:1} ahead for good: inning 8, on {p:5} play\nPlayers: {p:5} = Aaron Judge';
  const recap = FEATURES['sports-recap'].clean({ zh: '{p:5} 第 9 局再見全壘打', en: '{p:5} walked it off in the 9th' }, { facts });
  assert.equal(recap, null, 'a number the facts never gave');
  assert.equal(FEATURES['sports-recap'].clean({ zh: '賈吉第 8 局', en: 'Judge in the 8th' }, { facts }), null, 'a player typed out, not his token');
  assert.ok(FEATURES['sports-recap'].clean({ zh: '{p:5} 第 8 局超前', en: '{p:5} put {t:1} ahead in the 8th' }, { facts }));
  assert.deepEqual(FEATURES['sports-recap'].clean({ zh: '', en: '' }, { facts }), { zh: '', en: '' }, 'nothing to tell: no line');
  const n = FEATURES['transit-notice'].clean({ routes: ['307', '999'], stops: ['臺北車站'], from: '2026-11-12 22:00', to: 'soon', kind: '改道', short: '307 改道' }, { title: '307 改道', body: '因施工，307 不停靠臺北車站' });
  assert.deepEqual([n.routes, n.stops, n.from, n.to], [['307'], ['臺北車站'], '2026-11-12 22:00', '']);
  const cards = FEATURES['words-cards'].clean({ cards: [{ w: 'Abandon', ex: [{ en: 'They abandoned the car.', zh: '他們棄車。' }, { en: 'No word here.', zh: '無' }], hook: 'a-band-on', confuse: ['abandon', 'abundant'] }, { w: 'extra', ex: [{ en: 'extra', zh: 'x' }] }] }, { words: [{ w: 'abandon', zh: '放棄' }] });
  assert.deepEqual(Object.keys(cards), ['abandon']);
  assert.equal(cards.abandon.ex.length, 1, 'an example without the word dropped');
  assert.deepEqual(cards.abandon.confuse, ['abundant']);
  assert.deepEqual(jsonOf('```json\n{"a":1}\n```'), { a: 1 });
});

test('the AI tab: spend by provider, money left from the balance typed, speed and health', () => {
  const now = Date.parse('2026-11-10T12:00:00Z');
  const calls = [
    { at: now - 3_600_000, feature: 'law-chat', model: 'claude-sonnet-5-5', status: 200, tin: 1_000_000, cached: 0, tout: 100_000, ms: 9000 },
    { at: now - 2 * 86_400_000, feature: 'money-say', model: 'gpt-6-luna', status: 200, tin: 1_000_000, cached: 0, tout: 0, ms: 1200 },
    { at: now - 60_000, feature: 'money-say', model: 'claude-haiku-5-5', status: 200, tin: 0, cached: 0, tout: 0, ms: 2000 },
    { at: now - 1000, feature: 'money-say', model: 'gpt-6-luna', status: 503, tin: 0, cached: 0, tout: 0, ms: 300 }
  ];
  const s = spendOf(calls);
  assert.equal(Math.round(s.providers.anthropic * 100) / 100, 3);
  assert.equal(Math.round(s.providers.openai * 100) / 100, 0.1);
  assert.equal(s.features['money-say'].fail, 1);
  const m = moneyLeft({ anthropic: { usd: 5, at: now - 7_200_000 } }, calls, now);
  assert.equal(m.anthropic.left, 2);
  assert.equal(m.anthropic.tone, '', '40% left');
  assert.equal(m.openai.left, null, 'never typed');
  assert.equal(m.anthropic.days, 4, 'US$3 in 7 days: 2 lasts 4 more');
  assert.equal(moneyLeft({ anthropic: { usd: 3.2, at: now - 7_200_000 } }, calls, now).anthropic.tone, 'bad');
  const h = healthOf(calls, { 'money-say': 'gpt-6-luna' }, now);
  assert.equal(h['money-say'].backup, 1, 'Haiku answered for Luna once');
  assert.equal(h['money-say'].failToday, 1);
  assert.equal(h['law-chat'].mid, 9000);
});

test('effort: a word for every model, or only the models a map names', async () => {
  const { effortFor } = await import('../ai.js');
  assert.equal(effortFor({ effort: 'low' }, 'haiku'), 'low');
  assert.equal(effortFor({ effort: { luna: 'low' } }, 'luna'), 'low');
  assert.equal(effortFor({ effort: { luna: 'low' } }, 'haiku'), null);
  assert.equal(effortFor({}, 'haiku'), null);
});

test('a model\'s simplified characters are written as Taiwan\'s, and only those with one form', async () => {
  const { twChars } = await import('../ai.js');
  assert.deepEqual(twChars({ zh: '熱刺Romero遭紅牌罚下，兵工厂', list: ['进球', 3], en: 'Arsenal' }), { zh: '熱刺Romero遭紅牌罰下，兵工厂', list: ['進球', 3], en: 'Arsenal' });
  assert.equal(twChars('皇后 頭髮 公里 台北'), '皇后 頭髮 公里 台北');
});
