// Claude's and OpenAI's models answering in Gemini's shape (Jay 11-10: paid
// AI, tried side by side with Gemini before one is chosen): a Gemini call's
// parts and response schema in, { candidates: [{ content: { parts: [{ text }] },
// finishReason }], usageMetadata } out, so every route that reads Gemini's
// answer reads theirs unchanged. Raw HTTP like every other upstream here (no
// SDK in the Worker). Both refuse Hong Kong, where a caller's colo can be:
// through the Taiwan relay (gemini-relay.js) when bound.

import { providerCapped } from './gemini-use.js';

export const ANTHROPIC = 'https://api.anthropic.com/v1/messages';
export const OPENAI = 'https://api.openai.com/v1/chat/completions';
export const MODEL_LISTS = { anthropic: 'https://api.anthropic.com/v1/models', openai: 'https://api.openai.com/v1/models' };

// A model's maker by its name; null: Gemini's (or unknown).
export const makerOf = model => (/^claude-[a-z0-9.-]+$/.test(model) ? 'anthropic' : /^(gpt|o\d)[a-z0-9.-]*$/.test(model) ? 'openai' : null);

// Gemini's response schema (an OpenAPI subset) as plain JSON Schema for
// structured output: every object closed, and nothing either maker turns away
// (lengths, counts, Gemini's propertyOrdering); nullable as a null choice.
const DROP = new Set(['propertyOrdering', 'nullable', 'minItems', 'maxItems', 'minLength', 'maxLength', 'minimum', 'maximum', 'format', 'pattern']);
export function jsonSchemaOf(s) {
  if (!s || typeof s !== 'object') return s;
  if (Array.isArray(s)) return s.map(jsonSchemaOf);
  const out = {};
  for (const [k, v] of Object.entries(s)) {
    if (DROP.has(k)) continue;
    if (k === 'type') out.type = String(v).toLowerCase();
    else if (k === 'properties') out.properties = Object.fromEntries(Object.entries(v).map(([p, x]) => [p, jsonSchemaOf(x)]));
    else if (k === 'items') out.items = jsonSchemaOf(v);
    else out[k] = v;
  }
  if (out.type === 'object') out.additionalProperties = false;
  return s.nullable ? { anyOf: [out, { type: 'null' }] } : out;
}

// A Gemini part as each maker's content block.
function claudeBlock(p) {
  if (typeof p.text === 'string') return { type: 'text', text: p.text };
  const d = p.inline_data || p.inlineData;
  if (!d) return null;
  const media = d.mime_type || d.mimeType;
  return media === 'application/pdf' ? { type: 'document', source: { type: 'base64', media_type: media, data: d.data } } : { type: 'image', source: { type: 'base64', media_type: media, data: d.data } };
}
function openaiBlock(p, i) {
  if (typeof p.text === 'string') return { type: 'text', text: p.text };
  const d = p.inline_data || p.inlineData;
  if (!d) return null;
  const media = d.mime_type || d.mimeType;
  const url = `data:${media};base64,${d.data}`;
  return media === 'application/pdf' ? { type: 'file', file: { filename: `file${i + 1}.pdf`, file_data: url } } : { type: 'image_url', image_url: { url } };
}

// The request each maker takes. effort: 'low' | 'medium' | 'high' (the model's own default when not said).
export function requestOf(model, parts, schema, env, effort = null) {
  const maker = makerOf(model);
  if (maker === 'anthropic') {
    const body = { model, max_tokens: 16000, messages: [{ role: 'user', content: parts.map(claudeBlock).filter(Boolean) }] };
    const config = {};
    if (schema) config.format = { type: 'json_schema', schema: jsonSchemaOf(schema) };
    if (effort) config.effort = effort;
    if (Object.keys(config).length) body.output_config = config;
    return { url: ANTHROPIC, init: { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY || '', 'anthropic-version': '2026-10-21' }, body: JSON.stringify(body) } };
  }
  if (maker === 'openai') {
    const body = { model, max_completion_tokens: 16000, messages: [{ role: 'user', content: parts.map(openaiBlock).filter(Boolean) }] };
    if (schema) body.response_format = { type: 'json_schema', json_schema: { name: 'answer', schema: jsonSchemaOf(schema), strict: false } };
    if (effort) body.reasoning_effort = effort;
    return { url: OPENAI, init: { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.OPENAI_API_KEY || ''}` }, body: JSON.stringify(body) } };
  }
  return null;
}

// Each maker's answer as Gemini's.
export function geminiShapeOf(model, j) {
  if (makerOf(model) === 'anthropic') {
    const text = (j?.content || []).filter(b => b.type === 'text').map(b => b.text || '').join('');
    const u = j?.usage || {};
    return { candidates: [{ content: { parts: [{ text }] }, finishReason: j?.stop_reason === 'max_tokens' ? 'MAX_TOKENS' : j?.stop_reason === 'refusal' ? 'SAFETY' : 'STOP' }], usageMetadata: { promptTokenCount: (u.input_tokens || 0) + (u.cache_read_input_tokens || 0), cachedContentTokenCount: u.cache_read_input_tokens || 0, candidatesTokenCount: u.output_tokens || 0 } };
  }
  const c = j?.choices?.[0];
  const u = j?.usage || {};
  return { candidates: [{ content: { parts: [{ text: c?.message?.content || '' }] }, finishReason: c?.finish_reason === 'length' ? 'MAX_TOKENS' : 'STOP' }], usageMetadata: { promptTokenCount: u.prompt_tokens || 0, cachedContentTokenCount: u.prompt_tokens_details?.cached_tokens || 0, candidatesTokenCount: u.completion_tokens || 0 } };
}

// Through the Taiwan relay when bound (the proxy runs near each caller: Hong Kong is refused by both).
const viaRelay = (env, url, init) => (env.GEMINI_RELAY ? env.GEMINI_RELAY.fetch(`https://gemini-relay/?to=${encodeURIComponent(url)}`, init) : fetch(url, init));

// One call: a Response of Gemini's shape (or the maker's own error, its status kept).
export async function otherAnswer(model, parts, schema, env, { timeoutMs = 60_000, effort = null } = {}) {
  const req = requestOf(model, parts, schema, env, effort);
  if (!req) return new Response(JSON.stringify({ error: { message: 'unknown model' } }), { status: 400 });
  const key = makerOf(model) === 'anthropic' ? env.ANTHROPIC_API_KEY : env.OPENAI_API_KEY;
  if (!key) return new Response(JSON.stringify({ error: { message: 'no key' } }), { status: 503 });
  const res = await viaRelay(env, req.url, { ...req.init, signal: AbortSignal.timeout(timeoutMs) });
  const j = await res.json().catch(() => null);
  if (!res.ok) return new Response(JSON.stringify({ error: { message: String(j?.error?.message || res.status).slice(0, 300) } }), { status: res.status });
  return new Response(JSON.stringify(geminiShapeOf(model, j)), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

// One call streamed (Claude's SSE): onText hears the answer's text so far as
// each piece comes (/law-chat's verdict and answer, shown while the rest is
// written); the whole answer comes back as otherAnswer's, Gemini's shape, its
// usage kept. firstMs: given up on when no text has come by then. A maker
// without a stream here (OpenAI's) answers whole, as otherAnswer.
export async function streamOther(model, parts, schema, env, { onText = null, timeoutMs = 60_000, firstMs = 0, effort = null } = {}) {
  if (await providerCapped(env, makerOf(model))) return new Response(JSON.stringify({ error: { message: 'day cap' } }), { status: 429 });
  if (makerOf(model) !== 'anthropic') return otherAnswer(model, parts, schema, env, { timeoutMs, effort });
  const req = requestOf(model, parts, schema, env, effort);
  if (!env.ANTHROPIC_API_KEY) return new Response(JSON.stringify({ error: { message: 'no key' } }), { status: 503 });
  const stop = new AbortController();
  let text = '';
  const slow = firstMs ? setTimeout(() => text || stop.abort(new Error(`no answer from ${model} in ${firstMs / 1000} s`)), firstMs) : null;
  try {
    const body = JSON.stringify({ ...JSON.parse(req.init.body), stream: true });
    const res = await viaRelay(env, req.url, { ...req.init, body, signal: AbortSignal.any([stop.signal, AbortSignal.timeout(timeoutMs)]) });
    if (!res.ok || !res.body) {
      const j = await res.json().catch(() => null);
      return new Response(JSON.stringify({ error: { message: String(j?.error?.message || res.status).slice(0, 300) } }), { status: res.status || 502 });
    }
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    const usage = {};
    let stopReason = null;
    let failed = null;
    const take = line => {
      if (!line.startsWith('data:')) return;
      let j;
      try {
        j = JSON.parse(line.slice(5));
      } catch {
        return;
      }
      if (j.type === 'message_start') Object.assign(usage, j.message?.usage || {});
      else if (j.type === 'message_delta') {
        Object.assign(usage, j.usage || {});
        stopReason = j.delta?.stop_reason || stopReason;
      } else if (j.type === 'error') failed = j.error?.message || 'stream error';
      else if (j.type === 'content_block_delta' && j.delta?.type === 'text_delta' && j.delta.text) {
        text += j.delta.text;
        try {
          onText?.(text);
        } catch {}
      }
    };
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop();
      lines.forEach(take);
    }
    take(buf.trim());
    if (failed) return new Response(JSON.stringify({ error: { message: String(failed).slice(0, 300) } }), { status: 502 });
    const shaped = geminiShapeOf(model, { content: [{ type: 'text', text }], stop_reason: stopReason, usage });
    return new Response(JSON.stringify(shaped), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: { message: String(e?.message || e).slice(0, 300) } }), { status: 504 });
  } finally {
    clearTimeout(slow);
  }
}

// The models each key can call (ids only): is the key there, and what's each model called.
export async function modelsOf(env) {
  const out = {};
  for (const [maker, url] of Object.entries(MODEL_LISTS)) {
    const key = maker === 'anthropic' ? env.ANTHROPIC_API_KEY : env.OPENAI_API_KEY;
    if (!key) {
      out[maker] = { error: 'no key' };
      continue;
    }
    try {
      const headers = maker === 'anthropic' ? { 'x-api-key': key, 'anthropic-version': '2026-10-21' } : { Authorization: `Bearer ${key}` };
      const res = await viaRelay(env, url, { method: 'GET', headers, signal: AbortSignal.timeout(15_000) });
      const j = await res.json().catch(() => null);
      out[maker] = res.ok ? (j?.data || []).map(m => m.id).sort() : { status: res.status, error: String(j?.error?.message || '').slice(0, 200) };
    } catch (e) {
      out[maker] = { error: String(e?.message || e).slice(0, 200) };
    }
  }
  return out;
}
