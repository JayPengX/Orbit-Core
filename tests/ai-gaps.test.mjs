// The AI door's parts no other test reached (the hand-testing list, 2026-11-12): taps too
// quick, the guard's pace, a shared answer kept for everyone, every model down, everyone's cap.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleAi } from '../ai.js';
import { FEATURES } from '../ai-features.js';
import { forgetPace } from '../pace.js';
import { PACE_KEY } from '../guard.js';
import { forgetLawCounts } from '../law.js';

const ev = o => `event: ${o.type}\ndata: ${JSON.stringify(o)}\n\n`;
const sse = obj => new Response([{ type: 'message_start', message: { usage: { input_tokens: 100 } } }, { type: 'content_block_delta', delta: { type: 'text_delta', text: JSON.stringify(obj) } }, { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 20 } }].map(ev).join(''));
const openai = obj => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(obj) }, finish_reason: 'stop' }], usage: { prompt_tokens: 90, completion_tokens: 15 } }));
function envWith(answer, seen, kv = new Map()) {
  return {
    ANTHROPIC_API_KEY: 'a',
    OPENAI_API_KEY: 'o',
    RATE_LIMIT_KV: { get: async (k, t) => (kv.has(k) ? (t === 'json' || t?.type === 'json' ? JSON.parse(kv.get(k)) : kv.get(k)) : null), put: async (k, v) => void kv.set(k, v) },
    GEMINI_RELAY: {
      fetch: async (u, init) => {
        const maker = new URL(u).searchParams.get('to').includes('anthropic') ? 'anthropic' : 'openai';
        seen.push(maker);
        if (typeof answer === 'number') return new Response('{}', { status: answer });
        return maker === 'anthropic' ? sse(answer) : openai(answer);
      }
    }
  };
}
const filing = { title: '公告本公司董事會決議股利分派', name: '台積電', rows: [['普通股每股配發現金股利(元)', '5'], ['除息交易日', '115/12/17']], lang: 'zh' };
const tap = (feature, input) => new Request('https://w/ai', { method: 'POST', headers: { Origin: 'https://orbit.jaypengx.com' }, body: JSON.stringify({ feature, input }) });
const call = (env, session, feature = 'sec-filing', input = filing, cap = 100) => handleAi(tap(feature, input), env, {}, {}, session, { cap, full: true }).then(async r => ({ status: r.status, ...(await r.json()) }));
const good = { line: '在除息交易日前持有股票才領得到股利，除息當天股價會扣掉股利。', show: [1, 2] };

test('taps too quick: past the feature\'s per-minute count, busy', async () => {
  forgetPace();
  forgetLawCounts();
  const seen = [];
  const env = envWith(good, seen);
  const s = { a: 'stock', d: 'quick1' };
  const per = FEATURES['sec-filing'].perMinute;
  // (each with its own filing, so none is a kept answer)
  for (let i = 0; i < per; i++) assert.equal((await call(env, s, 'sec-filing', { ...filing, title: `${filing.title} ${i}` })).status, 200);
  const r = await call(env, s, 'sec-filing', { ...filing, title: `${filing.title} x` });
  assert.equal(r.status, 429);
  assert.equal(r.error, 'busy');
});

test('a shared answer is kept for everyone: a second account\'s same filing comes back at once, no call', async () => {
  forgetPace();
  forgetLawCounts();
  const seen = [];
  const env = envWith(good, seen);
  const a = await call(env, { a: 'stock', d: 'keptA' });
  assert.equal(a.status, 200);
  assert.equal(seen.length, 1);
  const b = await call(env, { a: 'stock', d: 'keptB' });
  assert.equal(b.status, 200);
  assert.equal(b.kept, true);
  assert.deepEqual(b.out, a.out);
  assert.equal(seen.length, 1, 'no second call');
});

test('every model down: 502 upstream with what\'s left, and the tap still counted', async () => {
  forgetPace();
  forgetLawCounts();
  const seen = [];
  const env = envWith(503, seen);
  const s = { a: 'stock', d: 'down1' };
  const r = await call(env, s);
  assert.equal(r.status, 502);
  assert.equal(r.error, 'upstream');
  assert.equal(r.left, FEATURES['sec-filing'].perPass - 1);
  assert.ok(seen.length >= 2, 'the backup was tried');
  const again = await call(env, s);
  assert.equal(again.left, FEATURES['sec-filing'].perPass - 2);
});

test('everyone\'s day cap: once the day\'s count for the feature is reached, every Pass gets cap', async () => {
  forgetPace();
  forgetLawCounts();
  const env = envWith(good, []);
  const input = i => ({ ...filing, title: `${filing.title} cap ${i}` });
  assert.equal((await call(env, { a: 'stock', d: 'capA' }, 'sec-filing', input(1), 2)).status, 200);
  assert.equal((await call(env, { a: 'stock', d: 'capB' }, 'sec-filing', input(2), 2)).status, 200);
  const r = await call(env, { a: 'stock', d: 'capC' }, 'sec-filing', input(3), 2);
  assert.equal(r.status, 429);
  assert.equal(r.error, 'cap');
});

test('the guard at pace 2 or more: every tap answers paused, nothing asked', async () => {
  forgetPace();
  forgetLawCounts();
  const seen = [];
  const kv = new Map([[PACE_KEY, JSON.stringify({ pace: 2, at: Date.now() })]]);
  const env = envWith(good, seen, kv);
  const r = await call(env, { a: 'stock', d: 'pace1' });
  assert.equal(r.status, 503);
  assert.equal(r.error, 'paused');
  assert.equal(seen.length, 0);
  forgetPace();
});

test('the showcase\'s 問 Orbit is shared: the same question over the same cards is one answer for every visitor', () => {
  assert.equal(FEATURES['showcase-ask'].shared, true);
});

test('a feature\'s own day (dayCap) holds under the family\'s cap: the showcase\'s, which anyone can mint a pass for', async () => {
  assert.ok(FEATURES['showcase-ask'].dayCap > 0 && FEATURES['showcase-ask'].dayCap <= 60);
  forgetPace();
  forgetLawCounts();
  const f = FEATURES['sec-filing'];
  f.dayCap = 1;
  try {
    const env = envWith(good, []);
    const input = i => ({ ...filing, title: `${filing.title} own day ${i}` });
    assert.equal((await call(env, { a: 'stock', d: 'dayA' }, 'sec-filing', input(1), 100)).status, 200);
    const r = await call(env, { a: 'stock', d: 'dayB' }, 'sec-filing', input(2), 100);
    assert.equal(r.status, 429);
    assert.equal(r.error, 'cap');
  } finally {
    delete f.dayCap;
  }
});
