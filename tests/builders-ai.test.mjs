// The family's AI made once (builders/ai.js, builders/recaps.js): what each
// is told (lean: code picks the facts), what's kept, what's asked again.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newsLines, storyFacts, wordsCards, cardsPath, sidesWanted, sideFacts, newsSides } from '../builders/ai.js';
import { gameFacts, swings } from '../builders/recaps.js';

const memStore = (seed = {}) => {
  const m = new Map(Object.entries(seed).map(([k, v]) => [k, JSON.stringify(v)]));
  return { m, json: async k => (m.has(k) ? JSON.parse(m.get(k)) : null), put: async (k, v) => void m.set(k, JSON.stringify(v)) };
};
const ev = o => `event: ${o.type}\ndata: ${JSON.stringify(o)}\n\n`;
const claudeEnv = (answer, seen = []) => ({
  ANTHROPIC_API_KEY: 'a',
  OPENAI_API_KEY: 'o',
  GEMINI_RELAY: {
    fetch: async (u, init) => {
      const body = JSON.parse(init.body);
      seen.push(body);
      const out = answer(body);
      if (String(u).includes('openai')) return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(out) } }], usage: {} }));
      return new Response([{ type: 'message_start', message: { usage: { input_tokens: 10 } } }, { type: 'content_block_delta', delta: { type: 'text_delta', text: JSON.stringify(out) } }, { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 5 } }].map(ev).join(''));
    }
  }
});

test('news: each story once, its outlets’ headlines lean, again when coverage doubles', async () => {
  const story = (id, m) => ({ id, m, sum: 'x'.repeat(300), items: [['中央社', '標題一'], ['中央社', '標題二'], ['自由時報', '標題三'], ['聯合報', '標題四']] });
  const f = storyFacts(story('a', 3));
  assert.deepEqual(f.heads.map(h => h.outlet), ['中央社', '自由時報', '聯合報'], 'an outlet once');
  assert.equal(f.heads[0].sum.length, 120);
  const store = memStore({ 'news/index.json': { tw: [story('a', 3), story('b', 10)], intl: [] }, 'news/lines.json': { lines: { b: { line: '舊', zh: '舊', en: 'old', m: 6 }, gone: { line: 'x', m: 1 } } } });
  const seen = [];
  const env = claudeEnv(body => ({ items: JSON.parse(body.messages[0].content[0].text.split('\n').at(-1)).map(s => ({ id: s.id, line: `新聞 ${s.id}`, zh: '標題', en: 'Title' })) }), seen);
  const r = await newsLines({ store, env, cap: 10, until: Date.now() + 60_000 });
  assert.equal(r.made, 1, 'a is new; b’s coverage hasn’t doubled');
  const lines = (await store.json('news/lines.json')).lines;
  assert.deepEqual(Object.keys(lines).sort(), ['a', 'b'], 'a story gone from the front is dropped');
  assert.equal(lines.a.line, '新聞 a');
  assert.equal(seen.length, 1);
});

test('news sides: only stories sides frame and both ends carry; each side’s headlines, four outlets at most', async () => {
  const items = [['ltn', '綠一'], ['ltn', '綠一再'], ['setn', '綠二'], ['cna', '中一'], ['udn', '藍一'], ['chinatimes', '藍二'], ['globaltimes', '官媒'], ['newtalk', 'n'], ['peoples', 'p'], ['ftv', 'f']];
  const s = { id: 'x', m: 9, topics: ['pol'], sides: { g: 5, c: 1, b: 2 }, items };
  assert.equal(sidesWanted(s, 'tw'), true);
  assert.equal(sidesWanted({ ...s, topics: ['biz'] }, 'tw'), false, 'a company’s revenue reads the same from both ends');
  assert.equal(sidesWanted({ ...s, sides: { g: 3, c: 2 } }, 'tw'), false, 'one end silent: nothing to compare');
  const f = sideFacts(s, 'tw');
  assert.deepEqual(f.sides.g, ['綠一', '綠二', 'n', 'p'], 'an outlet once, four a side');
  assert.deepEqual(f.sides.b, ['藍一', '藍二']);
  assert.ok(!JSON.stringify(f).includes('官媒'), 'state media has no side');
  const store = memStore({ 'news/index.json': { tw: [s, { ...s, id: 'biz', topics: ['biz'] }], intl: [] } });
  const env = claudeEnv(() => ({ items: [{ id: 'x', sides: [{ side: 'g', zh: '綠營強調', en: 'Green stress' }, { side: 'b', zh: '藍營強調', en: 'Blue stress' }, { side: 'r', zh: '不在', en: 'absent' }], diff: { zh: '差在 99 人', en: 'differ' } }] }));
  const r = await newsSides({ store, env, cap: 10, until: Date.now() + 60_000 });
  assert.equal(r.made, 1);
  const out = (await store.json('news/sides.json')).sides.x;
  assert.deepEqual(Object.keys(out.sides), ['g', 'b'], 'a side the story doesn’t have is dropped');
  assert.equal(out.diff, null, 'a number not in the headlines drops the line');
  const again = await newsSides({ store, env, cap: 10, until: Date.now() + 60_000 });
  assert.equal(again.calls, 0, 'told once until coverage doubles and 6 hours pass');
});

test('words: cards a batch at a time, each letter its own small file, a word that fails twice let go', async () => {
  const store = memStore();
  const rows = [['abandon', 'v.', 4, 'v. 放棄、拋棄', 'x'], ['able', 'adj.', 1, 'adj. 能夠的\nadj. 能幹的', 'x'], ['bake', 'v.', 1, 'v. 烘烤', 'x']];
  const fetchImpl = async () => new Response(JSON.stringify(rows));
  const env = claudeEnv(body => {
    const t = body.messages[0].content[0].text;
    assert.match(t, /able: adj\. 能夠的$/m, 'the first sense only');
    return { cards: [{ w: 'abandon', ex: [{ en: 'Never abandon hope.', zh: '永不放棄希望。' }], hook: 'a + band + on', confuse: ['abundant'] }, { w: 'bake', ex: [{ en: 'We bake bread.', zh: '我們烤麵包。' }], hook: '', confuse: [] }] };
  });
  const r = await wordsCards({ store, env, cap: 10, until: Date.now() + 60_000, fetchImpl });
  assert.equal(r.made, 2);
  assert.deepEqual(Object.keys((await store.json(cardsPath('a'))).cards), ['abandon']);
  assert.deepEqual(Object.keys((await store.json(cardsPath('b'))).cards), ['bake']);
  await wordsCards({ store, env, cap: 10, until: Date.now() + 60_000, fetchImpl });
  const r3 = await wordsCards({ store, env, cap: 10, until: Date.now() + 60_000, fetchImpl });
  assert.equal(r3.calls, 0, '“able” missed twice: not asked again');
});

test('a game’s facts: the score by period, leaders, the swings that decided it, lean', () => {
  const summary = {
    header: { competitions: [{ status: { type: { detail: 'Final' } }, competitors: [
      { id: '1', homeAway: 'home', score: '108', team: { id: '1', displayName: 'Golden State Warriors', abbreviation: 'GS' }, record: [{ type: 'total', summary: '7-5' }], linescores: [{ displayValue: '31' }, { displayValue: '22' }, { displayValue: '30' }, { displayValue: '25' }] },
      { id: '2', homeAway: 'away', score: '112', team: { id: '2', displayName: 'Los Angeles Lakers', abbreviation: 'LAL' }, record: [{ type: 'total', summary: '8-4' }], linescores: [{ displayValue: '28' }, { displayValue: '30' }, { displayValue: '25' }, { displayValue: '29' }] }
    ] }] },
    leaders: [{ team: { id: '2' }, leaders: [{ leaders: [{ displayValue: '31 PTS', athlete: { displayName: 'LeBron James' } }] }] }],
    plays: Array.from({ length: 400 }, (_, i) => ({ id: String(i), sequenceNumber: i, text: `play ${i}`, period: { displayValue: '4th' }, clock: { displayValue: '1:00' } })),
    winprobability: Array.from({ length: 400 }, (_, i) => ({ playId: String(i), homeWinPercentage: i === 390 ? 0.2 : i > 390 ? 0.1 : 0.6 }))
  };
  const e = { league: 'nba', id: '9', home: { id: '1', name: '勇士' }, away: { id: '2', name: '湖人' } };
  const f = gameFacts(summary, e);
  assert.match(f, /Final: 湖人 112 at 勇士 108/);
  assert.match(f, /By period: LAL 28 30 25 29 \| GS 31 22 30 25/);
  assert.match(f, /LeBron James 31 PTS/);
  assert.match(f, /play 390 \(home win chance -40 pts\)/);
  assert.ok(f.length < 1200, `lean: ${f.length}`);
  assert.equal(swings({ winprobability: [] }).length, 0);
});
