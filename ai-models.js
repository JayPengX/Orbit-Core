// ---- ai-models.js: a retired model's successor, found by the Worker itself ----
//
// Each maker retires its models a year or two after they come (Anthropic's ids
// by 2027-09-28, HANDOFF.md §5), and a model gone answers every call with an
// error. With nobody here to type a new id (Jay 11-18: keep working "for years
// by itself"), the cron asks each maker once a day which models it has (the
// `ai-models` job): one of ours no longer listed is answered by the newest of
// its own line that is (a Haiku by a later Haiku, Flash-Lite by a later
// Flash-Lite, never another class), once a tiny call to it answers. Back on the
// list, the swap goes. A maker that can't be asked (no key, an error, an empty
// list) changes nothing; while a model is gone and nothing has replaced it the
// features' backups answer (ai.js: another maker of the same class).
//
// Kept in D1 (kept-store, `ai:successors`: { <our id>: <successor> }) and read
// on every call's way out (ai-other.js for Claude's and OpenAI's, worker.js
// geminiFetch for Gemini's), a few minutes in memory. The call is still logged
// and counted under the id asked (gemini_call, ai.js PRICES: its price known; a
// successor's may differ, and the makers' day caps count calls, not dollars).
import { keptRead, keptPut } from './kept-store.js';

export const SUCCESSORS = 'ai:successors';
const HOLD_MS = 5 * 60_000;
let held = { at: 0, env: null, map: {} };

export async function successorsNow(env, now = Date.now()) {
  if (held.env === env && now - held.at < HOLD_MS && now >= held.at) return held.map;
  const map = (await keptRead(env, SUCCESSORS).catch(() => null)) || {};
  held = { at: now, env, map };
  return map;
}
export const resetSuccessors = () => (held = { at: 0, env: null, map: {} });
// The id to send for one we asked for.
export const liveModel = async (env, model) => (await successorsNow(env))[model] || model;
// A Gemini address with its model swapped (…/models/<id>:generateContent?…).
export const liveGeminiUrl = async (env, url) => {
  const map = await successorsNow(env);
  return String(url).replace(/\/models\/([^/:?]+):/, (all, id) => {
    const to = map[decodeURIComponent(id)];
    return to ? `/models/${encodeURIComponent(to)}:` : all;
  });
};

// A model's line and version: 'claude-haiku-5-5' → { line: 'claude-haiku-|', v: [5, 5] },
// 'gpt-6.1-sol' → { line: 'gpt-|-sol', v: [6, 1] }, 'gemini-3.5-flash-lite' → { line: 'gemini-|-flash-lite', v: [3, 5] }.
// A dated snapshot ('claude-haiku-5-5-20261001'), a preview or a "-latest" has no line: never chosen.
export function lineOf(id) {
  const m = /^(claude-[a-z]+-|gpt-|gemini-)(\d+(?:[.-]\d+)?)((?:-[a-z]+)*)$/.exec(String(id || ''));
  if (!m || /-(preview|exp|latest)\b/.test(m[3])) return null;
  return { line: `${m[1]}|${m[3]}`, v: m[2].split(/[.-]/).map(Number) };
}
const newer = (a, b) => {
  for (let i = 0; i < Math.max(a.length, b.length); i++) if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) - (b[i] || 0);
  return 0;
};
// The listed models of `id`'s line newer than it, newest first.
export function successorsOf(id, listed) {
  const me = lineOf(id);
  if (!me) return [];
  return [...new Set(listed)]
    .map(x => ({ x, l: lineOf(x) }))
    .filter(({ l }) => l && l.line === me.line && newer(l.v, me.v) > 0)
    .sort((a, b) => newer(b.l.v, a.l.v))
    .map(({ x }) => x);
}
export const makerOfId = id => (/^claude-/.test(id) ? 'anthropic' : /^gpt-/.test(id) ? 'openai' : /^gemini-/.test(id) ? 'google' : null);

const ANTHROPIC_VERSION = '2026-10-21';
// Claude's and OpenAI's refuse Hong Kong, where a Worker can run: through the Taiwan relay when bound (ai-other.js).
const out = (env, url, init) => (env.GEMINI_RELAY ? env.GEMINI_RELAY.fetch(`https://gemini-relay/?to=${encodeURIComponent(url)}`, init) : fetch(url, init));
const GEMINI = 'https://generativelanguage.googleapis.com/v1beta/models';

// Each maker's models now, or null (can't tell).
export async function listed(env, maker, get = out) {
  try {
    if (maker === 'anthropic') {
      if (!env.ANTHROPIC_API_KEY) return null;
      const r = await get(env, 'https://api.anthropic.com/v1/models?limit=1000', { headers: { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': ANTHROPIC_VERSION }, signal: AbortSignal.timeout(15_000) });
      const j = r.ok ? await r.json() : null;
      return j?.data?.length ? j.data.map(m => m.id) : null;
    }
    if (maker === 'openai') {
      if (!env.OPENAI_API_KEY) return null;
      const r = await get(env, 'https://api.openai.com/v1/models', { headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}` }, signal: AbortSignal.timeout(15_000) });
      const j = r.ok ? await r.json() : null;
      return j?.data?.length ? j.data.map(m => m.id) : null;
    }
    if (maker === 'google') {
      if (!env.GEMINI_API_KEY) return null;
      const r = await get(env, `${GEMINI}?pageSize=1000&key=${env.GEMINI_API_KEY}`, { signal: AbortSignal.timeout(15_000) });
      const j = r.ok ? await r.json() : null;
      const ms = (j?.models || []).filter(m => (m.supportedGenerationMethods || []).includes('generateContent')).map(m => String(m.name).replace(/^models\//, ''));
      return ms.length ? ms : null;
    }
  } catch {}
  return null;
}
// A tiny call: does this model answer us? (A few tokens, only when one of ours is gone.)
export async function answers(env, id, get = out) {
  const text = 'Reply with the single word OK.';
  const maker = makerOfId(id);
  try {
    const r =
      maker === 'anthropic'
        ? await get(env, 'https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY || '', 'anthropic-version': ANTHROPIC_VERSION }, body: JSON.stringify({ model: id, max_tokens: 16, messages: [{ role: 'user', content: text }] }), signal: AbortSignal.timeout(30_000) })
        : maker === 'openai'
          ? await get(env, 'https://api.openai.com/v1/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.OPENAI_API_KEY || ''}` }, body: JSON.stringify({ model: id, max_completion_tokens: 64, messages: [{ role: 'user', content: text }] }), signal: AbortSignal.timeout(30_000) })
          : await get(env, `${GEMINI}/${encodeURIComponent(id)}:generateContent?key=${env.GEMINI_API_KEY || ''}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text }] }], generationConfig: { maxOutputTokens: 256 } }), signal: AbortSignal.timeout(30_000) });
    return !!r?.ok;
  } catch {
    return false;
  }
}

// The cron's, once a day: `ours` every id the family asks for (ai.js MODELS and PRICES).
// → { gone: [ids not listed], swaps: { id: successor }, changed, can't: [makers not asked] }
export async function checkModels(env, ours, { get = out, now = Date.now() } = {}) {
  const before = (await keptRead(env, SUCCESSORS).catch(() => null)) || {};
  const next = { ...before };
  const gone = [];
  const unasked = [];
  const ids = [...new Set(ours)].filter(makerOfId);
  for (const maker of ['anthropic', 'openai', 'google']) {
    const mine = ids.filter(id => makerOfId(id) === maker);
    if (!mine.length) continue;
    const list = await listed(env, maker, get);
    if (!list) {
      unasked.push(maker);
      continue;
    }
    const has = new Set(list);
    for (const id of mine) {
      if (has.has(id)) {
        delete next[id];
        continue;
      }
      gone.push(id);
      // (A successor already chosen and still listed stays; else the newest of the line that answers, three tried at most.)
      if (next[id] && has.has(next[id])) continue;
      delete next[id];
      for (const to of successorsOf(id, list).slice(0, 3))
        if (await answers(env, to, get)) {
          next[id] = to;
          break;
        }
    }
  }
  const changed = JSON.stringify(Object.entries(next).sort()) !== JSON.stringify(Object.entries(before).sort());
  // (Written again each day while there's a swap: kept 30 days, so one left behind by a check that stopped running goes.)
  if (changed || Object.keys(next).length) {
    await keptPut(env, SUCCESSORS, next, 30 * 86_400, { now });
    resetSuccessors();
  }
  return { gone, swaps: next, changed, ...(unasked.length ? { unasked } : {}) };
}
