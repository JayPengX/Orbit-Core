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
  assert.equal(h['money-say'].models['claude-haiku-5-5'], 1, 'which model answered, counted');
  assert.equal(h['money-say'].failToday, 1);
  assert.equal(h['money-say'].backupToday, 1, 'a backup answered today');
  assert.deepEqual(h['money-say'].why, { '503 gpt-6-luna': 1 }, 'the week’s failures by status and model');
  assert.equal(h['law-chat'].mid, 9000);
});

test('backups are the same class from another maker, never a lesser one (Jay 11-10)', async () => {
  const { FEATURES } = await import('../ai-features.js');
  const CLASS = { sonnet: 'judge', sol: 'judge', haiku: 'write', luna: 'write', flash: 'see', lite: 'see' };
  const MAKER = { sonnet: 'anthropic', sol: 'openai', haiku: 'anthropic', luna: 'openai', flash: 'google', lite: 'google' };
  for (const [name, f] of Object.entries(FEATURES)) {
    const [first, second] = f.models;
    if (!second) continue;
    assert.notEqual(MAKER[first], MAKER[second], `${name}: its backup from another maker`);
    if (CLASS[first] === 'judge') assert.equal(CLASS[second], 'judge', `${name}: a judgment's backup judges too`);
  }
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

// Every prompt fits its own maxIn at its inputs' longest (11-12: 11-11's
// longer prompts passed it, so 賽後三句話 and 賽前看點 threw on every real
// game, each throw spending the day's count): a tap's input at its own caps,
// a builder's facts at their builder's cut (recaps 2,400, previews 2,600, F1 2,400).
test('every feature’s prompt fits its maxIn with its input at its longest', async () => {
  const { EXAMPLES } = await import('../ai-fixtures.js');
  const long = v => (typeof v === 'string' ? v.repeat(Math.ceil(4000 / Math.max(1, v.length))).slice(0, 4000) : Array.isArray(v) ? v.map(long) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, long(x)])) : v);
  const built = { 'sports-recap': 2400, 'sports-preview': 2600, 'f1-story': 2400 };
  for (const [name, f] of Object.entries(FEATURES)) {
    for (const x of EXAMPLES[name] || []) {
      let input = f.tap ? f.input?.(long(x.input)) : x.input;
      if (built[name]) input = { ...x.input, facts: x.input.facts.repeat(4).slice(0, built[name]) };
      if (!input) continue;
      const parts = await f.parts(input, {});
      const size = parts.reduce((n, p) => n + (p.text?.length || 0), 0);
      assert.ok(size <= (f.maxIn || 12_000), `${name} (${x.name}): ${size} chars, maxIn ${f.maxIn}`);
    }
  }
});

// 重點整理 (News, builders/ai.js newsBriefs): our own words, the outlets' numbers only.
test('a story’s points keep only their own words and the material’s numbers', () => {
  const stories = [{ id: 'a', heads: ['寶林茶室案一審宣判 負責人遭判1年10月'], sums: ['寶林茶室食物中毒案釀6人死亡，台北地方法院一審依過失致死罪判處負責人1年10月'] }];
  const clean = raw => FEATURES['news-brief'].clean(raw, { stories });
  const ok = { zh: '北院一審判負責人1年10月徒刑', en: 'The Taipei court gave the owner 1 year and 10 months.' };
  const out = clean({ items: [{ id: 'a', points: [ok, { zh: '食物中毒案造成6人死亡', en: 'The food poisoning killed 6 people.' }] }] });
  assert.equal(out.a.length, 2);
  // (A number the material lacks, a copied run of the summary, Simplified Chinese: each point dropped; one left is too few.)
  assert.equal(clean({ items: [{ id: 'a', points: [ok, { zh: '共有9人送醫', en: '9 were hospitalised.' }] }] }).a, undefined);
  assert.equal(clean({ items: [{ id: 'a', points: [ok, { zh: '台北地方法院一審依過失致死罪判處負責人', en: 'Judged.' }] }] }).a, undefined);
  assert.equal(clean({ items: [{ id: 'a', points: [ok, { zh: '负责人将上诉', en: 'The owner will appeal.' }] }] }).a, undefined);
});

test('news-markets: a question says when it settles, unless its rows each show a deadline', () => {
  const clean = FEATURES['news-markets'].clean;
  const market = { q: 'Jensen Huang resigned or removed & Nvidia above $4T end of 2026?', about: '', kind: 'pick', ends: '2026-12-31', options: ['Resigned/removed; Over $4T', 'Resigned/removed; Under $4T'] };
  const ask = (m, zh, en) => clean({ items: [{ k: 'a|1', match: true, zh, en, options: [] }] }, { pairs: [{ k: 'a|1', story: [], market: m }] })['a|1'];
  assert.equal(ask(market, '黃仁勳已宣布去職，輝達2026年底市值會達4兆美元嗎？', 'With Jensen Huang’s exit announced, will Nvidia be worth $4T at the end of 2026?').zh, '黃仁勳已宣布去職，輝達2026年底市值會達4兆美元嗎？');
  assert.equal(ask(market, '輝達2027年底市值會達4兆美元嗎？', 'Will Nvidia be worth $4T at the end of 2027?'), undefined, 'a year the market lacks');
  assert.equal(ask({ ...market, kind: 'dates', ends: undefined }, '黃仁勳2026年底前會卸任嗎？', 'Will Jensen Huang step down by the end of 2026?'), undefined, 'a ladder’s rows say the dates');
});

test('news-markets: each option’s short label, Chinese without Latin or a number it lacks, never two alike', () => {
  const pairs = [{ k: 'a|1', story: ['輝達董事會討論黃仁勳去留'], market: { q: 'Jensen Huang out + Nvidia market cap', about: '', options: ['Resigned/removed; Over $4T', 'Resigned/removed; Under $4T', 'Rene Haas', 'Ian Buck'] } }];
  const out = FEATURES['news-markets'].clean({ items: [{ k: 'a|1', match: true, zh: '黃仁勳去職時，輝達市值會在4兆美元以上嗎？', en: 'If Jensen Huang leaves, will Nvidia be worth over $4 trillion?', options: [
    { o: 'Resigned/removed; Over $4T', zh: '4兆美元以上', en: 'Over $4T' },
    { o: 'Resigned/removed; Under $4T', zh: '5兆美元以下', en: 'Under $4T' },
    { o: 'Rene Haas', zh: 'Haas', en: 'Rene Haas' },
    { o: 'Ian Buck', zh: '巴克', en: 'Rene Haas' },
    { o: 'Nobody', zh: '沒有人', en: 'Nobody' }
  ] }] }, { pairs });
  assert.deepEqual(out['a|1'].labels, {
    'Resigned/removed; Over $4T': { zh: '4兆美元以上', en: 'Over $4T' },
    'Resigned/removed; Under $4T': { en: 'Under $4T' },
    'Ian Buck': { zh: '巴克' }
  });
});
