// The family's AI made once (builders/ai.js, builders/recaps.js): what each
// is told (lean: code picks the facts), what's kept, what's asked again.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HOOKS } from '../builders/words-hooks.mjs';
import { newsLines, TITLE_AGAIN, LINES_V, storyFacts, briefFacts, wordsCards, cardsPath, sidesWanted, sideFacts, newsSides } from '../builders/ai.js';
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

test('news: a title in the other language, once a story; no line under it; an old copy with a line made again', async () => {
  const story = (id, m) => ({ id, m, title: `T${id}`, sum: 'x'.repeat(300), items: [['中央社', '標題一'], ['中央社', '標題二'], ['自由時報', '標題三'], ['聯合報', '標題四'], ['ettoday', '標題五']] });
  const f = storyFacts(story('a', 3), 'tw');
  assert.deepEqual(f, { id: 'a', lang: 'en', heads: ['Ta', '標題一', '標題三', '標題四'] }, 'its title, then an outlet once, three, no summary');
  assert.equal(storyFacts(story('w', 1), 'intl').lang, 'zh');
  const store = memStore({ 'news/index.json': { tw: [story('a', 3), story('b', 10), story('c', 2)], intl: [] }, 'news/lines.json': { lines: { b: { en: 'Old title', m: 6, t: 'Tb', at: Date.now() - 2 * TITLE_AGAIN, v: LINES_V }, c: { line: '舊的一句話', zh: '舊', en: 'old', m: 2 }, gone: { en: 'x', m: 1 } } } });
  const seen = [];
  const env = claudeEnv(body => ({ items: JSON.parse(body.messages[0].content[0].text.split('\n').at(-1)).map(s => ({ id: s.id, title: `Title ${s.id}` })) }), seen);
  const r = await newsLines({ store, env, cap: 10, until: Date.now() + 60_000 });
  assert.equal(r.made, 2, 'a is new; c had a line (made again); b’s title kept');
  const lines = (await store.json('news/lines.json')).lines;
  assert.deepEqual(Object.keys(lines).sort(), ['a', 'b', 'c'], 'a story gone from the front is dropped');
  assert.equal(lines.a.en, 'Title a');
  assert.equal(lines.a.line, undefined);
  assert.equal(seen.length, 1);
  // A world story is asked in Chinese (map's index was taken as its region, 11-12: every one asked in English);
  // an old English title of one is made again.
  const store2 = memStore({ 'news/index.json': { tw: [], intl: [story('w', 4), story('v', 4)] }, 'news/lines.json': { lines: { v: { en: 'English', m: 4 } } } });
  const seen2 = [];
  const env2 = claudeEnv(body => ({ items: JSON.parse(body.messages[0].content[0].text.split('\n').at(-1)).map(s => ({ id: s.id, title: s.lang === 'zh' ? `標題${s.id}` : `Title ${s.id}` })) }), seen2);
  await newsLines({ store: store2, env: env2, cap: 10, until: Date.now() + 60_000 });
  const asked = JSON.parse(seen2[0].messages[0].content[0].text.split('\n').at(-1));
  assert.deepEqual(asked.map(s => s.lang), ['zh', 'zh']);
  const v = (await store2.json('news/lines.json')).lines.v;
  assert.deepEqual([v.zh, v.m, v.t], ['標題v', 4, 'Tv']);
  // A story that turned (its title isn't the one its line was made from) is made again, an hour on.
  const turned = (t, ago) => memStore({ 'news/index.json': { tw: [], intl: [{ ...story('w', 4), title: 'New turn' }] }, 'news/lines.json': { lines: { w: { zh: '舊標題', m: 4, t, at: Date.now() - ago, v: LINES_V } } } });
  const store3 = turned('Old turn', 2 * TITLE_AGAIN);
  await newsLines({ store: store3, env: env2, cap: 10, until: Date.now() + 60_000 });
  assert.equal((await store3.json('news/lines.json')).lines.w.zh, '標題w');
  // (One made before 11-13's rule is made again; a vague one is never kept, the outlets' own over it.)
  const old = memStore({ 'news/index.json': { tw: [], intl: [story('w', 4)] }, 'news/lines.json': { lines: { w: { zh: '伊朗議題受關注', m: 4, t: 'Tw', at: Date.now() } } } });
  await newsLines({ store: old, env: env2, cap: 10, until: Date.now() + 60_000 });
  assert.equal((await old.json('news/lines.json')).lines.w.zh, '標題w');
  const vague = claudeEnv(() => ({ items: [{ id: 'w', title: '伊朗議題受關注' }] }));
  await newsLines({ store: old, env: vague, cap: 10, until: Date.now() + 60_000 });
  assert.equal((await old.json('news/lines.json')).lines.w.zh, '標題w', 'a vague new title is no answer');
  const store4 = turned('Old turn', TITLE_AGAIN / 2);
  await newsLines({ store: store4, env: env2, cap: 10, until: Date.now() + 60_000 });
  assert.equal((await store4.json('news/lines.json')).lines.w.zh, '舊標題', 'not again within the hour');
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
  // (Every side that carried it, or none, Jay 11-13: 各方怎麼說 showed 偏左 and 中間, no 偏右 though ten carried it.)
  const partial = claudeEnv(() => ({ items: [{ id: 'x', sides: [{ side: 'g', zh: '綠營強調', en: 'Green stress' }, { side: 'b', zh: '藍營強調', en: 'Blue stress' }], diff: { zh: '', en: '' } }] }));
  assert.equal((await newsSides({ store, env: partial, cap: 10, until: Date.now() + 60_000 })).made, 0, 'a side left out: no answer');
  await store.put('news/sides.json', { sides: { x: { sides: { g: { zh: '舊', en: 'old' }, b: { zh: '舊', en: 'old' } }, m: 9, at: Date.now() } } });
  const env = claudeEnv(() => ({ items: [{ id: 'x', sides: [{ side: 'g', zh: '綠營強調', en: 'Green stress' }, { side: 'c', zh: '中間強調', en: 'Centre stress' }, { side: 'b', zh: '藍營強調', en: 'Blue stress' }, { side: 'r', zh: '不在', en: 'absent' }], diff: { zh: '差在 99 人', en: 'differ' } }] }));
  const r = await newsSides({ store, env, cap: 10, until: Date.now() + 60_000 });
  assert.equal(r.made, 1, 'an old answer missing a side is made again');
  const out = (await store.json('news/sides.json')).sides.x;
  assert.deepEqual(Object.keys(out.sides), ['g', 'c', 'b'], 'a side the story doesn’t have is dropped');
  assert.equal(out.diff, null, 'a number not in the headlines drops the line');
  const again = await newsSides({ store, env, cap: 10, until: Date.now() + 60_000 });
  assert.equal(again.calls, 0, 'told once until coverage doubles and 6 hours pass');
});

test('news sides: a story whose answer the check drops is asked again only after 2 hours, 3 times at most, until its coverage doubles', async () => {
  const s = { id: 'y', m: 4, topics: ['pol'], sides: { g: 2, b: 2 }, items: [['ltn', '綠'], ['udn', '藍']] };
  const store = memStore({ 'news/index.json': { tw: [s], intl: [] } });
  let asked = 0;
  // (One side only: the check keeps nothing.)
  const env = claudeEnv(() => (asked++, { items: [{ id: 'y', sides: [{ side: 'g', zh: '綠營強調', en: 'Green stress' }], diff: { zh: '', en: '' } }] }));
  const t0 = Date.parse('2026-11-11T00:00:00Z');
  const run = (now, idx) => (idx && store.put('news/index.json', idx), newsSides({ store, env, cap: 10, until: Date.now() + 60_000, now }));
  await run(t0);
  assert.equal(asked, 1);
  await run(t0 + 20 * 60_000);
  assert.equal(asked, 1, 'not again 20 minutes later');
  await run(t0 + 2 * 3_600_000);
  await run(t0 + 4 * 3_600_000);
  assert.equal(asked, 3);
  await run(t0 + 6 * 3_600_000);
  assert.equal(asked, 3, 'three tries, then let go');
  await run(t0 + 7 * 3_600_000, { tw: [{ ...s, m: 8 }], intl: [] });
  assert.equal(asked, 4, 'its coverage doubled: asked again');
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

test('words: a hook put right by hand replaces the AI\'s, and its letter file is written again', async () => {
  const store = memStore();
  await store.put('private/ai/words-cards.json', { cards: { toxic: { ex: [], hook: 'tox- 毒（源自希臘字 toxon 毒箭）', confuse: [] } }, skip: {} });
  const fetchImpl = async () => new Response(JSON.stringify([['toxic', 'adj.', 5, 'adj. 有毒的', 'x']]));
  const r = await wordsCards({ store, env: claudeEnv(() => ({ cards: [] })), cap: 10, until: Date.now() + 60_000, fetchImpl });
  assert.equal(r.fixed, 1);
  assert.equal((await store.json(cardsPath('t'))).cards.toxic.hook, HOOKS.toxic);
  const again = await wordsCards({ store, env: claudeEnv(() => ({ cards: [] })), cap: 10, until: Date.now() + 60_000, fetchImpl });
  assert.equal(again.fixed, undefined, 'once is enough');
});

test('a game’s facts: only what the card doesn’t show (no leaders), players and teams as tokens, nothing when nothing explains it', () => {
  const comp = (home, away, hl, al) => ({ header: { competitions: [{ competitors: [
    { id: '1', homeAway: 'home', score: String(home), team: { id: '1', displayName: 'Golden State Warriors' }, linescores: hl.map(x => ({ displayValue: String(x) })) },
    { id: '2', homeAway: 'away', score: String(away), team: { id: '2', displayName: 'Los Angeles Lakers' }, linescores: al.map(x => ({ displayValue: String(x) })) }
  ] }] } });
  const box = { boxscore: { players: [{ team: { id: '1' }, statistics: [{ athletes: [{ athlete: { id: '10', displayName: 'Stephen Curry', shortName: 'S. Curry' } }] }] }, { team: { id: '2' }, statistics: [{ athletes: [{ athlete: { id: '20', displayName: 'LeBron James', shortName: 'L. James' } }] }] }] } };
  // The Lakers up 20–8, then the Warriors on a 14–0 run to the end (Curry 9 of it).
  const plays = [];
  let h = 0, a = 0, i = 0;
  const add = (side, n, who, per = 1) => ((side === 'h' ? (h += n) : (a += n)), plays.push({ id: String(i), sequenceNumber: i++, scoringPlay: true, homeScore: h, awayScore: a, team: { id: side === 'h' ? '1' : '2' }, period: { number: per }, clock: { displayValue: '5:00' }, participants: [{ athlete: { id: who } }], text: `${who === '10' ? 'Stephen Curry' : 'LeBron James'} makes shot` }));
  for (let k = 0; k < 4; k++) add('h', 2, '10'), add('a', 5, '20');
  add('h', 3, '10', 4), add('h', 3, '10', 4), add('h', 3, '10', 4), add('h', 2, '10', 4), add('h', 3, '20', 4);
  const s = { ...comp(h, a, [8, 0, 0, 14], [20, 0, 0, 0]), ...box, plays, leaders: [{ team: { id: '2' }, leaders: [{ leaders: [{ displayValue: '31 PTS', athlete: { displayName: 'LeBron James' } }] }] }] };
  const e = { league: 'nba', id: '9', home: { id: '1' }, away: { id: '2' } };
  const g = gameFacts(s, e);
  assert.ok(g, 'a comeback is worth a line');
  assert.match(g.facts, /\{t:1\} came back from 12 down/);
  assert.match(g.facts, /Biggest run: \{t:1\} 14-0/);
  assert.match(g.facts, /\{p:10\} 11 of them/);
  assert.ok(!/31 PTS|leaders/i.test(g.facts), 'never the leaders the card shows');
  assert.ok(g.people['10'], 'its players, for the app to draw');
  // Never close, nothing special: no line at all.
  const dull = [];
  h = 0; a = 0;
  for (let k = 0; k < 3; k++) (h += 3), dull.push({ id: String(k), scoringPlay: true, homeScore: h, awayScore: a + k, team: { id: '1' }, period: { number: 1 }, clock: { displayValue: '1:00' }, text: 'x' });
  assert.equal(gameFacts({ ...comp(9, 2, [3, 2, 2, 2], [1, 1, 0, 0]), plays: dull }, e), null);
  assert.equal(swings({ winprobability: [] }).length, 0);
});

test('news: a title is told the headlines nearest the story, never its drift (Jay 11-13: 「伊朗議題受關注」 from Pence’s and Mark Kelly’s 2028)', () => {
  const s = { id: 'i', title: 'Trump says no need for Iran deal, Vance should focus on US', items: [
    ['fox', 'Pence leaves door open to 2028 White House run'],
    ['politico', 'Mark Kelly on Trump, the Iran war and his 2028 decision'],
    ['dispatch', 'How the Iran war exposes cracks in America’s foundation'],
    ['ap', 'Trump pulls Vance from Iran talks, says no deal needed'],
    ['nbc', 'Trump says the US doesn’t need a deal with Iran'],
    ['cnn', 'Trump tells Vance to focus away from Iran: no deal needed']
  ] };
  const f = storyFacts(s, 'intl');
  assert.equal(f.heads.length, 4);
  assert.ok(f.heads.every(t => !/Pence|Kelly|cracks/.test(t)), f.heads.join(' | '));
  const b = briefFacts({ ...s, sum: 'Trump said the US did not need a deal.' }, new Map());
  assert.equal(b.heads[0], s.title);
  assert.ok(b.heads.indexOf('Pence leaves door open to 2028 White House run') > 3, 'the drift last');
  assert.equal(b.sums[0], 'Trump said the US did not need a deal.');
});

test('news AI: a foreign name stays in English unless Taiwan’s press fixes one, an English word counting about two characters (11-13: 史考特科洛姆)', async () => {
  const { FEATURES, NAMES_RULE, zhLen } = await import('../ai-features.js');
  assert.ok(NAMES_RULE.includes('川普') && NAMES_RULE.includes('黃仁勳') && NAMES_RULE.includes('Scott Colom'));
  for (const f of ['news-lines', 'news-brief', 'news-sides']) assert.ok(JSON.stringify(FEATURES[f].parts({ stories: [] })).includes('Never make up a Chinese transliteration'), f);
  assert.equal(zhLen('Scott Colom 當選'), 2 + 1 + 2 + 1 + 2);
  const stories = [{ id: 'a', lang: 'zh', heads: ['Democrat Scott Colom wins Mississippi Senate seat'] }];
  const out = FEATURES['news-lines'].clean({ items: [{ id: 'a', title: '民主黨 Scott Colom 贏得密西西比州參議員席次' }] }, { stories });
  assert.equal(out.a?.zh, '民主黨 Scott Colom 贏得密西西比州參議員席次');
});

test('news AI: a Chinese title never keeps an English number unit (11-13: 「$30.1 billion推動航空改革」)', async () => {
  const { FEATURES } = await import('../ai-features.js');
  const stories = [{ id: 'a', lang: 'zh', heads: ['White House urges Congress to provide $30.1 billion for air traffic overhaul'] }];
  assert.deepEqual(FEATURES['news-lines'].clean({ items: [{ id: 'a', title: '白宮籲國會提供$30.1 billion推動航空改革' }] }, { stories }), {});
});
