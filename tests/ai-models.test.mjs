// A model its maker retires answered by the newest of its own line, found by the
// Worker itself (ai-models.js): nobody types a new id (Jay 11-18: "keep working
// for years by itself"; Anthropic's ids retire by 2027-09-28).
import test from 'node:test';
import assert from 'node:assert/strict';
import { fakeD1 } from './fake-d1.mjs';
import { lineOf, successorsOf, checkModels, liveModel, liveGeminiUrl, resetSuccessors, SUCCESSORS } from '../ai-models.js';
import { otherAnswer } from '../ai-other.js';
import { keptRead } from '../kept-store.js';

test("a model's line: the same class only, never a dated snapshot, a preview or another class", () => {
  assert.deepEqual(lineOf('claude-haiku-5-5'), { line: 'claude-haiku-|', v: [5, 5] });
  assert.deepEqual(lineOf('gpt-6.1-sol'), { line: 'gpt-|-sol', v: [6, 1] });
  assert.deepEqual(lineOf('gemini-3.5-flash-lite'), { line: 'gemini-|-flash-lite', v: [3, 5] });
  for (const x of ['claude-haiku-5-5-20261001', 'gemini-3.9-flash-preview', 'gemini-flash-latest', 'gpt-6-luna-2026-08-01', 'text-embedding-3']) assert.equal(lineOf(x), null, x);
  const listed = ['claude-haiku-5-7', 'claude-haiku-6', 'claude-sonnet-6', 'claude-haiku-6-1-20270101', 'claude-haiku-5-1'];
  assert.deepEqual(successorsOf('claude-haiku-5-5', listed), ['claude-haiku-6', 'claude-haiku-5-7']);
  assert.deepEqual(successorsOf('gemini-3.6-flash', ['gemini-3.10-flash', 'gemini-3.9-flash', 'gemini-3.9-flash-lite', 'gemini-4.0-flash-preview']), ['gemini-3.10-flash', 'gemini-3.9-flash']);
  assert.deepEqual(successorsOf('gpt-6-luna', ['gpt-6.1-sol', 'gpt-7-luna']), ['gpt-7-luna']);
});

// Each maker's list and tiny calls, as the cron meets them.
function maker({ anthropic, openai, google, dead = [] }) {
  const asked = [];
  const get = async (env, url, init = {}) => {
    const body = init.body ? JSON.parse(init.body) : null;
    const tiny = body?.model || (/\/models\/([^/:?]+):generateContent/.exec(url) || [])[1];
    if (tiny) {
      asked.push(tiny);
      return new Response('{}', { status: dead.includes(tiny) ? 404 : 200 });
    }
    if (url.startsWith('https://api.anthropic.com/v1/models')) return anthropic ? Response.json({ data: anthropic.map(id => ({ id })) }) : new Response('', { status: 500 });
    if (url.startsWith('https://api.openai.com/v1/models')) return openai ? Response.json({ data: openai.map(id => ({ id })) }) : new Response('', { status: 500 });
    if (url.includes('generativelanguage')) return google ? Response.json({ models: google.map(id => ({ name: `models/${id}`, supportedGenerationMethods: ['generateContent'] })) }) : new Response('', { status: 500 });
    throw new Error(`unexpected ${url}`);
  };
  return { get, asked };
}
const OURS = ['claude-sonnet-5-5', 'claude-haiku-5-5', 'gpt-6-luna', 'gpt-6.1-sol', 'gemini-3.6-flash', 'gemini-3.5-flash-lite'];
const keys = { ANTHROPIC_API_KEY: 'a', OPENAI_API_KEY: 'o', GEMINI_API_KEY: 'g' };

test('a model gone from its maker’s list: the newest of its line that answers takes its calls; back on the list, the swap goes', async () => {
  resetSuccessors();
  const env = { STORE: fakeD1(), ...keys };
  const day1 = maker({
    anthropic: ['claude-sonnet-5-5', 'claude-haiku-6', 'claude-haiku-5-7'],
    openai: ['gpt-6-luna', 'gpt-6.1-sol'],
    google: ['gemini-3.6-flash', 'gemini-3.8-flash-lite', 'gemini-3.9-flash-lite-preview'],
    dead: ['claude-haiku-6']
  });
  const r = await checkModels(env, OURS, { get: day1.get });
  assert.deepEqual(r.gone.sort(), ['claude-haiku-5-5', 'gemini-3.5-flash-lite']);
  assert.deepEqual(r.swaps, { 'claude-haiku-5-5': 'claude-haiku-5-7', 'gemini-3.5-flash-lite': 'gemini-3.8-flash-lite' });
  assert.deepEqual(day1.asked, ['claude-haiku-6', 'claude-haiku-5-7', 'gemini-3.8-flash-lite'], 'the newest first; one that won’t answer passed');
  assert.equal(await liveModel(env, 'claude-haiku-5-5'), 'claude-haiku-5-7');
  assert.equal(await liveModel(env, 'claude-sonnet-5-5'), 'claude-sonnet-5-5');
  assert.equal(await liveGeminiUrl(env, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=g'), 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash-lite:generateContent?key=g');

  // A call for the retired id goes out as its successor.
  const real = globalThis.fetch;
  let sent = null;
  try {
    globalThis.fetch = async (url, init) => ((sent = JSON.parse(init.body).model), Response.json({ content: [{ type: 'text', text: '{"a":1}' }], usage: { input_tokens: 5, output_tokens: 3 } }));
    const res = await otherAnswer('claude-haiku-5-5', [{ text: 'hi' }], null, env);
    assert.equal(res.status, 200);
    assert.equal(sent, 'claude-haiku-5-7');
  } finally {
    globalThis.fetch = real;
  }

  // A maker that can't be asked changes nothing; the next day, a model back on the list is asked for itself again.
  const day2 = maker({ anthropic: ['claude-sonnet-5-5', 'claude-haiku-5-5', 'claude-haiku-5-7'], openai: null, google: ['gemini-3.6-flash', 'gemini-3.8-flash-lite'] });
  const r2 = await checkModels(env, OURS, { get: day2.get });
  assert.deepEqual(r2.unasked, ['openai']);
  assert.deepEqual(r2.swaps, { 'gemini-3.5-flash-lite': 'gemini-3.8-flash-lite' });
  assert.deepEqual(day2.asked, [], 'a successor already chosen and still listed: no call');
  assert.deepEqual(await keptRead(env, SUCCESSORS), { 'gemini-3.5-flash-lite': 'gemini-3.8-flash-lite' });
  assert.equal(await liveModel(env, 'claude-haiku-5-5'), 'claude-haiku-5-5');
});

test('nothing of its line answers: no swap (the feature’s backup, another maker, answers instead)', async () => {
  resetSuccessors();
  const env = { STORE: fakeD1(), ...keys };
  const m = maker({ anthropic: ['claude-sonnet-5-5', 'claude-opus-6'], openai: ['gpt-6-luna', 'gpt-6.1-sol'], google: ['gemini-3.6-flash', 'gemini-3.5-flash-lite'] });
  const r = await checkModels(env, OURS, { get: m.get });
  assert.deepEqual(r, { gone: ['claude-haiku-5-5'], swaps: {}, changed: false });
  assert.equal(await liveModel(env, 'claude-haiku-5-5'), 'claude-haiku-5-5');
});
