import test from 'node:test';
import assert from 'node:assert/strict';
import { jsonSchemaOf, requestOf, geminiShapeOf, makerOf } from '../ai-other.js';

test("Gemini's schema as JSON Schema: objects closed, lengths and orderings dropped, nullable a null choice", () => {
  const s = jsonSchemaOf({ type: 'OBJECT', propertyOrdering: ['a'], properties: { a: { type: 'STRING', maxLength: 22 }, b: { type: 'ARRAY', maxItems: 4, items: { type: 'object', properties: { x: { type: 'integer', nullable: true } }, required: ['x'] } } }, required: ['a'] });
  assert.deepEqual(s, { type: 'object', properties: { a: { type: 'string' }, b: { type: 'array', items: { type: 'object', properties: { x: { anyOf: [{ type: 'integer' }, { type: 'null' }] } }, required: ['x'], additionalProperties: false } } }, required: ['a'], additionalProperties: false });
});

test("each maker's request from Gemini's parts, and its answer back in Gemini's shape", () => {
  const parts = [{ text: 'hi' }, { inline_data: { mime_type: 'image/png', data: 'AAAA' } }];
  const env = { ANTHROPIC_API_KEY: 'a', OPENAI_API_KEY: 'o' };
  assert.equal(makerOf('claude-haiku-5-5'), 'anthropic');
  assert.equal(makerOf('gpt-6-luna'), 'openai');
  assert.equal(makerOf('gemini-3.6-flash'), null);
  const c = JSON.parse(requestOf('claude-haiku-5-5', parts, { type: 'object', properties: {} }, env, 'low').init.body);
  assert.deepEqual(c.messages[0].content[1], { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AAAA' } });
  assert.deepEqual([c.output_config.format.type, c.output_config.effort], ['json_schema', 'low']);
  const o = JSON.parse(requestOf('gpt-6-luna', parts, null, env).init.body);
  assert.equal(o.messages[0].content[1].image_url.url, 'data:image/png;base64,AAAA');
  assert.equal(geminiShapeOf('claude-haiku-5-5', { content: [{ type: 'thinking', thinking: '' }, { type: 'text', text: '{"a":1}' }], stop_reason: 'end_turn', usage: { input_tokens: 5, output_tokens: 2 } }).candidates[0].content.parts[0].text, '{"a":1}');
  assert.equal(geminiShapeOf('gpt-6-luna', { choices: [{ message: { content: '{}' }, finish_reason: 'length' }] }).candidates[0].finishReason, 'MAX_TOKENS');
});
