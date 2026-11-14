// AI made when someone opens it (Jay 11-14: "I don't want money spent on
// things I don't open… only spend it as I use it but kept fast enough").
// A story's 重點整理 or 各方怎麼說 is made the first time anyone opens the
// story, from facts code picked at build (builders/ai.js newsOpenFacts:
// private/news/open/<part>.json), never from what a phone sends; kept for
// everyone after that (kept-store.js, 3 days), again only once the story's
// coverage has grown by half and someone opens it. The phone shows the
// part's shape while it's made (a few seconds), or nothing if it can't be.
//
//   GET /ai/open?f=news-brief|news-sides&id=<story id>
//     → { out, kept? } | { error: 'origin' | 'feature' | 'story' | 'busy' | 'cap' | 'upstream' }
import { json, isAllowedOrigin } from './http.js';
import { sessionLimited } from './orbit-token.js';
import { keptRead, keptPut } from './kept-store.js';
import { runFeature, spendDay, twDay } from './ai.js';
import { openPart, openPath, BRIEF_V } from './builders/ai.js';

const KEEP_S = 3 * 86_400;
// (Coverage grown by half: a step of its own, so a story that grew is made again when next opened.)
const step = m => Math.floor(Math.log(Math.max(1, m)) / Math.log(1.5));
export const OPEN = {
  'news-brief': { facts: s => s.brief, v: BRIEF_V, out: (out, id) => (Array.isArray(out?.[id]) && out[id].length ? { points: out[id] } : null) },
  'news-sides': { facts: s => s.sides, v: 1, out: (out, id) => (out?.[id]?.sides ? out[id] : null) }
};

// Each part file read once a few minutes an isolate.
const parts = new Map();
async function factsOf(env, id, now) {
  const i = openPart(id);
  const had = parts.get(i);
  if (had && now - had.at < 120_000) return (await had.p)?.[id] || null;
  const p = env.DATA.get(openPath(i))
    .then(o => (o ? o.json() : null))
    .then(j => j?.stories || {})
    .catch(() => ({}));
  parts.set(i, { at: now, p });
  return (await p)[id] || null;
}

// Two people opening the same story at once: one call.
const making = new Map();

export async function handleAiOpen(request, env, ctx, headers, { ip = '', cap = 0, gemini = null, now = Date.now() } = {}) {
  if (request.method !== 'GET') return json({ error: 'method' }, 405, headers);
  if (!isAllowedOrigin(request.headers.get('Origin') || '')) return json({ error: 'origin' }, 403, headers);
  const q = new URL(request.url).searchParams;
  const name = q.get('f') || '';
  const id = String(q.get('id') || '').slice(0, 80);
  const o = OPEN[name];
  if (!o || !id || !env?.DATA) return json({ error: 'feature' }, 400, headers);
  const s = await factsOf(env, id, now);
  const facts = s && o.facts(s);
  if (!facts) return json({ error: 'story' }, 404, headers);
  const key = `ai:open:${name}:${id}:v${o.v}:${step(s.m)}`;
  const kept = await keptRead(env, key);
  if (kept?.out) return json({ out: kept.out, kept: true }, 200, headers);
  if (making.has(key)) {
    const out = await making.get(key).catch(() => null);
    return out ? json({ out }, 200, headers) : json({ error: 'upstream' }, 502, headers);
  }
  if (sessionLimited(`ai-open:${ip}`, 20)) return json({ error: 'busy' }, 429, headers);
  if (!(await spendDay(env, name, cap, twDay(now)))) return json({ error: 'cap' }, 429, headers);
  const job = (async () => {
    const { out } = await runFeature(env, ctx, name, { stories: [facts] }, { gemini, open: true });
    const made = o.out(out, id);
    if (!made) throw new Error('nothing usable');
    const put = keptPut(env, key, { out: made }, KEEP_S);
    if (ctx?.waitUntil) ctx.waitUntil(put);
    else await put;
    return made;
  })();
  making.set(key, job);
  try {
    return json({ out: await job }, 200, headers);
  } catch {
    return json({ error: 'upstream' }, 502, headers);
  } finally {
    making.delete(key);
  }
}
