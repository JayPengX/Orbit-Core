// AI made when someone opens it (ai-open.js, Jay 11-14: "only spend it as I
// use it"): the facts are the build's (never the phone's), one call a story
// for everyone, kept; refused off our pages, for a story the build doesn't
// have, and past the day's cap. And the AI made ahead stays paused.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleAiOpen, newsOpenAhead, AHEAD_TW } from '../ai-open.js';
import { newsOpenFacts, openPart, openPath, OPEN_PARTS } from '../builders/ai.js';
import { aiOnce } from '../ai.js';

const ev = o => `event: ${o.type}\ndata: ${JSON.stringify(o)}\n\n`;
const ORIGIN = 'https://orbit.jaypengx.com';
const ask = (q, origin = ORIGIN) => new Request(`https://api.jaypengx.com/ai/open?${q}`, { headers: { Origin: origin } });

function envWith(stories, answer) {
  const files = new Map();
  for (const [id, s] of Object.entries(stories)) ((files.get(openPath(openPart(id))) || files.set(openPath(openPart(id)), {}).get(openPath(openPart(id))))[id] = s);
  const kv = new Map();
  let calls = 0;
  return {
    calls: () => calls,
    ANTHROPIC_API_KEY: 'a',
    OPENAI_API_KEY: 'o',
    DATA: { get: async k => (files.has(k) ? { json: async () => ({ stories: files.get(k) }) } : null) },
    RATE_LIMIT_KV: { get: async k => kv.get(k) ?? null, put: async (k, v) => void kv.set(k, v), getWithMetadata: async k => ({ value: kv.get(k) ?? null, metadata: null }) },
    GEMINI_RELAY: {
      fetch: async (u, init) => {
        calls++;
        const out = answer(JSON.parse(init.body));
        if (String(u).includes('openai')) return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(out) } }], usage: {} }));
        return new Response([{ type: 'message_start', message: { usage: { input_tokens: 10 } } }, { type: 'content_block_delta', delta: { type: 'text_delta', text: JSON.stringify(out) } }, { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 5 } }].map(ev).join(''));
      }
    }
  };
}

const brief = { id: 's1', heads: ['颱風逼近', '颱風明天登陸'], sums: [] };
const points = { items: [{ id: 's1', points: [{ k: 'what', zh: '颱風明天登陸台灣', en: 'A typhoon lands tomorrow.' }, { k: 'next', zh: '各地注意停班停課', en: 'Watch for closures.' }] }] };

test('a story’s 重點整理 is made the first time anyone opens it, then kept for everyone', async () => {
  const env = envWith({ s1: { m: 6, brief } }, () => points);
  const r1 = await (await handleAiOpen(ask('f=news-brief&id=s1'), env, null, {}, { ip: '1', cap: 10 })).json();
  assert.equal(r1.out.points.length, 2);
  assert.equal(env.calls(), 1);
  const r2 = await (await handleAiOpen(ask('f=news-brief&id=s1'), env, null, {}, { ip: '2', cap: 10 })).json();
  assert.equal(r2.kept, true, 'the second reader gets the kept one');
  assert.equal(env.calls(), 1, 'no second call');
});

test('refused: another site, a story the build doesn’t have, a feature not made on open, the day’s cap', async () => {
  const env = envWith({ s1: { m: 6, brief } }, () => points);
  assert.equal((await handleAiOpen(ask('f=news-brief&id=s1', 'https://evil.example'), env, null, {}, { ip: '1', cap: 10 })).status, 403);
  assert.equal((await handleAiOpen(ask('f=news-brief&id=nope'), env, null, {}, { ip: '1', cap: 10 })).status, 404);
  assert.equal((await handleAiOpen(ask('f=law-chat&id=s1'), env, null, {}, { ip: '1', cap: 10 })).status, 400);
  assert.equal((await handleAiOpen(ask('f=news-brief&id=s1'), env, null, {}, { ip: '1', cap: 0 })).status, 429);
  assert.equal(env.calls(), 0);
});

test('the build keeps each front story’s facts in parts, no AI', async () => {
  const story = (id, n) => ({ id, n, m: n * 2, title: `T${id}`, topics: ['pol'], sides: { g: 2, b: 2 }, items: [['自由時報', `綠${id}`], ['聯合報', `藍${id}`], ['中央社', `中${id}`]] });
  const m = new Map([['news/index.json', JSON.stringify({ tw: [story('a', 3), story('b', 1)], intl: [] })]]);
  const store = { json: async k => (m.has(k) ? JSON.parse(m.get(k)) : null), put: async (k, v) => (m.set(k, JSON.stringify(v)), true) };
  const r = await newsOpenFacts({ store });
  assert.equal(r.stories, 2);
  const a = JSON.parse(m.get(openPath(openPart('a')))).stories.a;
  assert.ok(a.brief && a.sides, 'three outlets: a brief and the sides');
  assert.ok(!JSON.parse(m.get(openPath(openPart('b')))).stories.b.brief, 'one outlet: no brief');
  assert.equal([...m.keys()].filter(k => k.startsWith('private/news/open/')).length, OPEN_PARTS);
});

test('made ahead for everyone stays paused without AI_BULK', async () => {
  assert.equal(await aiOnce({}, null, 'news-brief', { stories: [brief] }, 10), null);
});

test('a game’s line is asked only of a game over (its preview only of one to come), read from ESPN, nothing else', async () => {
  const env = envWith({}, () => ({}));
  const urls = [];
  const live = async u => (urls.push(u), new Response(JSON.stringify({ header: { competitions: [{ date: new Date(Date.now() + 3_600_000).toISOString(), status: { type: { state: 'in' } }, competitors: [] }] } })));
  assert.equal((await handleAiOpen(ask('f=sports-recap&id=nba:401700001'), env, null, {}, { ip: '1', cap: 10, fetchImpl: live })).status, 404, 'still being played');
  assert.equal((await handleAiOpen(ask('f=sports-preview&id=nba:401700001'), env, null, {}, { ip: '1', cap: 10, fetchImpl: live })).status, 404, 'already begun');
  assert.equal((await handleAiOpen(ask('f=sports-recap&id=nope:1'), env, null, {}, { ip: '1', cap: 10, fetchImpl: live })).status, 404, 'a league never asked');
  assert.equal(urls.length, 2);
  assert.match(urls[0], /\/summary\?event=401700001$/);
  assert.equal(env.calls(), 0);
});

test('a first model whose answer the checks drop: the next model answers', async () => {
  let n = 0;
  const env = envWith({ s1: { m: 6, brief } }, () => (++n === 1 ? { items: [{ id: 's1', points: [{ k: 'why', zh: '背景', en: 'Background.' }] }] } : points));
  const r = await (await handleAiOpen(ask('f=news-brief&id=s1'), env, null, {}, { ip: '1', cap: 10 })).json();
  assert.equal(r.out.points.length, 2);
  assert.equal(env.calls(), 2);
});

test('made on open, Claude answers without thinking first (13 s of thinking for a 3-point brief, 11-14)', async () => {
  const { requestOf } = await import('../ai-other.js');
  const { FEATURES } = await import('../ai-features.js');
  const { effortFor } = await import('../ai.js');
  for (const f of ['news-brief', 'news-sides', 'sports-preview']) assert.equal(effortFor(FEATURES[f], 'haiku'), 'none', f);
  const b = JSON.parse(requestOf('claude-haiku-5-5', [{ text: 'x' }], null, {}, 'none').init.body);
  assert.deepEqual(b.thinking, { type: 'disabled' });
  assert.equal(b.output_config.effort, 'low');
  assert.equal(JSON.parse(requestOf('gpt-6-luna', [{ text: 'x' }], null, {}, 'none').init.body).reasoning_effort, 'low');
});

test('the front page’s lead stories are made ahead once, the rest only when opened', async () => {
  const stories = {};
  for (let i = 0; i < 12; i++) stories[`t${i}`] = { m: 6, brief: { ...brief, id: `t${i}` } };
  const env = envWith(stories, b => ({ items: [{ id: JSON.parse(b.messages ? JSON.stringify(b.messages) : '[]').length ? (b.messages[0].content[0].text.match(/"id":"(t\d+)"/) || [])[1] : '', points: points.items[0].points }] }));
  const index = { tw: Object.keys(stories).map(id => ({ id })), intl: [] };
  const store = { json: async k => (k === 'news/index.json' ? index : null) };
  const r = await newsOpenAhead({ store, env });
  assert.equal(r.made, AHEAD_TW, 'Taiwan’s first ones, briefs (no sides facts: none)');
  assert.equal(env.calls(), AHEAD_TW);
  const again = await newsOpenAhead({ store, env });
  assert.equal(again.kept, AHEAD_TW);
  assert.equal(env.calls(), AHEAD_TW, 'kept: no second call');
  const opened = await (await handleAiOpen(ask('f=news-brief&id=t0'), env, null, {}, { ip: '1', cap: 10 })).json();
  assert.equal(opened.kept, true, 'opened after: instant');
});
